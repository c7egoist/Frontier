#pragma once

// ---------------------------------------------------------------------------
// Binding convention for group(1) across every kernel in this project:
//   0..3  : the pass's storage buffers, in the order the TS side declares them
//   8     : bathymetry texture  (texture_2d<f32>, R16F, filterable, world-mapped)
//   9     : linear sampler
//  16..   : height/velocity/foam textures of the shared surface state
// Reserving 8/9/16+ means the bind groups can be built once and shared.
// ---------------------------------------------------------------------------

const BED_BINDING: u32 = 8u;
const BED_SAMPLER_BINDING: u32 = 9u;

// ---------------------------------------------------------------------------
// Hashes / noise
// ---------------------------------------------------------------------------

fn hash1(n: u32) -> f32 {
  var x = n;
  x = (x ^ 61u) ^ (x >> 16u);
  x = x + (x << 3u);
  x = x ^ (x >> 4u);
  x = x * 0x27d4eb2du;
  x = x ^ (x >> 15u);
  return f32(x) * (1.0 / 4294967296.0);
}

fn hash2(p: vec2<u32>) -> f32 {
  return hash1(p.x * 1973u + p.y * 9277u + 26699u);
}

fn hash3(p: vec3<u32>) -> f32 {
  return hash1(p.x * 1973u + p.y * 9277u + p.z * 26699u + 1337u);
}

/// Deterministic PCG-ish step, returns [0,1).
fn randStep(state: ptr<function, u32>) -> f32 {
  var s = *state;
  s = s * 1664525u + 1013904223u;
  *state = s;
  return f32(s >> 8u) * (1.0 / 16777216.0);
}

fn rand2(state: ptr<function, u32>) -> vec2<f32> {
  return vec2<f32>(randStep(state), randStep(state));
}

/// 2D value noise in [-1,1].
fn valueNoise2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let ip = vec2<u32>(bitcast<vec2<i32>>(i));
  let a = hash2(ip);
  let b = hash2(ip + vec2<u32>(1u, 0u));
  let c = hash2(ip + vec2<u32>(0u, 1u));
  let d = hash2(ip + vec2<u32>(1u, 1u));
  return -1.0 + 2.0 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm2(p: vec2<f32>, octaves: i32) -> f32 {
  var sum = 0.0;
  var amp = 0.5;
  var q = p;
  for (var o = 0; o < octaves; o = o + 1) {
    sum = sum + amp * valueNoise2(q);
    q = q * 2.03 + vec2<f32>(11.7, 5.3);
    amp = amp * 0.5;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Bathymetry: baked from this function into BED_BINDING at startup (one compute pass),
// then sampled with a hardware bilinear tap by the solver, the MPM layer and the renderer.
// ---------------------------------------------------------------------------

/// Water depth (m, positive down) at a world XZ position. Kept strictly below the surface by
/// `bedMinDepth`, so the demo is open ocean with shoals rather than a beach -- the solver parks
/// dry particles anyway, so switching to a real coastline is a one-line change of the clamp.
/// Bathymetry: positive depth below sea level (m). A continental shelf that ramps from the open
/// ocean towards a shoreline at -Z, plus one broad shoal blob -- closed form on purpose, so the
/// exact same expression exists in TypeScript (params.ts `bedDepthAt`) and the CPU-side seeding of
/// the particle layers cannot drift away from the baked texture the GPU samples.
fn bedDepthAt(xz: vec2<f32>) -> f32 {
  let half = max(P.bedWorldHalf, 1.0);
  let ramp = clamp((half - abs(xz.y)) / (half * 0.9), 0.0, 1.0);
  let d = xz - vec2<f32>(-half * 0.82, half * 0.35);
  let scale = max(P.bedShoalScale, 1.0);
  let shoal = P.bedShoalAmp * exp(-dot(d, d) / (scale * scale));
  return max(P.bedMinDepth, max(P.bedDepth, 0.1) * (0.22 + 0.78 * ramp) - shoal);
}


// ---------------------------------------------------------------------------
// SPH kernels (2D, compact support of radius h)
// ---------------------------------------------------------------------------

/// Quadratic (parabolic-spline) kernel, exactly normalised over the disc of radius h:
/// W = 6/(pi h^2) (1-q)^2.  Cheaper than a cubic spline and normalised analytically.
fn kernelWq(q: f32, h: f32) -> f32 {
  let f = max(0.0, 1.0 - q);
  return 6.0 / (PI * h * h) * f * f;
}

fn kernelW(r2: f32, h: f32) -> f32 {
  return kernelWq(sqrt(r2) / h, h);
}

/// dW/dr at q = r/h. Negative (W decreases with distance).
fn kernelGradFactor(q: f32, h: f32) -> f32 {
  return -12.0 / (PI * h * h * h) * max(0.0, 1.0 - q);
}

/// Norm of the discrete gradient operator the kernel induces on a square lattice:
///   m = 1/2 sum_j |dW/dr| |r_j|      (with the sum over the lattice shells inside the kernel)
/// traced from M = sum_j (|dW/dr| / r) r_j (x) r_j, which is isotropic (m*I) for the square lattice.
///
/// Why it is here: the shallow-water step adds the analytic bed gradient to the *kernel-summed*
/// pressure gradient. Those two are different operators, so on a sloping bed they cancel only up to
/// this factor -- the raw sum returns m * grad(h) instead of grad(h), i.e. an effective gravity of
/// 0.873 g on this lattice (a 6.5% wave-speed error) *and* an unbalanced bed term, which slides the
/// water downhill at ~(1 - m)*g*|grad b|. Dividing the kernel sum by m makes it a true gradient
/// operator (exact for linear fields, which is what a sloping bed is) so the two terms cancel for
/// still water: the state stays put instead of slowly draining the shelf. (See docs/RESEARCH.md,
/// "well balancing".)
fn latticeShell(dx: f32, h: f32, scale: f32) -> f32 {
  let r = scale * dx;
  if (r >= h) { return 0.0; }
  return 4.0 * abs(kernelGradFactor(r / h, h)) * r;
}

fn latticeGradNorm(dx: f32, h: f32) -> f32 {
  // Three nearest shells of a square lattice: axis, diagonal, axis*2. With the spacings this project
  // uses (h = 2.0-2.2 dx) the fourth shell (sqrt(5) dx) is always outside the kernel.
  let s = latticeShell(dx, h, 1.0) + latticeShell(dx, h, 1.41421356) + latticeShell(dx, h, 2.0);
  return 0.5 * dx * dx * s;
}

/// The kernel sum's value on a uniform lattice: sum_j dx^2 W(dx |j|).
///
/// h_i = sum_j V_j W_ij is the density<->height analogy of the shallow-water particle scheme, but
/// the raw sum of a *uniform* column of depth d returns 1.12 d on this lattice, not d: the discrete
/// self + axis + diagonal shells only add up to ~0.89 of the disc integral. Dividing by this lattice
/// constant makes the mapping exact for a uniform state (so eta = h - depth is zero in still water
/// instead of +12%), and leaves the O((k dx)^2) error for smooth states. Same idea as
/// latticeGradNorm, applied to the kernel instead of its gradient.
fn latticeWSum(dx: f32, h: f32) -> f32 {
  // self, 4 axis neighbours, 4 diagonal neighbours, 4 at 2 dx (zero while h <= 2 dx).
  let s = kernelWq(0.0, h)
        + 4.0 * kernelWq(dx / h, h)
        + 4.0 * kernelWq(1.41421356 * dx / h, h)
        + 4.0 * kernelWq(2.0 * dx / h, h);
  return dx * dx * s;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const PI: f32 = 3.14159265358979;
const TWO_PI: f32 = 6.28318530717959;

fn safeNormalize2(v: vec2<f32>) -> vec2<f32> {
  let l = length(v);
  return select(vec2<f32>(0.0), v / l, l > 1e-8);
}

fn safeNormalize3(v: vec3<f32>) -> vec3<f32> {
  let l = length(v);
  return select(vec3<f32>(0.0, 1.0, 0.0), v / l, l > 1e-8);
}

fn luminance(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn expFog(dist: f32, density: f32) -> f32 {
  return 1.0 - exp(-dist * density);
}

/// 1 fully inside the camera-centred near height field, fading to 0 across a band at its edge.
/// Shared by the far-field resolve and the ocean mesh so the near/far handover is seamless
/// (they must use the *same* blend or the surface would show a step at the boundary).
fn nearFieldFactor(worldXZ: vec2<f32>) -> f32 {
  let rel = abs(worldXZ - (P.nearHeightOrigin + 0.5 * P.nearHeightSize)) / (0.5 * P.nearHeightSize);
  let inside = 1.0 - max(rel.x, rel.y);       // negative outside
  let band = 0.18;                            // fraction of the half-extent
  return clamp(inside / band, 0.0, 1.0);
}

/// Snap a world coordinate to a lattice pitch so camera-following grids never swim.
fn snapToPitch(x: f32, pitch: f32) -> f32 {
  return floor(x / pitch) * pitch;
}

/// Two float sums folded into one 32-bit fixed-point word for atomic accumulation.
/// 16 bits per channel with a caller-chosen scale; WebGPU has no atomic<f32>.
fn packFixed16(hi: f32, lo: f32, scale: f32) -> u32 {
  let h = u32(clamp(hi * scale, 0.0, 65535.0));
  let l = u32(clamp(lo * scale, 0.0, 65535.0));
  return (h << 16u) | l;
}

fn unpackHi16(v: u32, scale: f32) -> f32 { return f32((v >> 16u) & 0xffffu) / scale; }
fn unpackLo16(v: u32, scale: f32) -> f32 { return f32(v & 0xffffu) / scale; }
