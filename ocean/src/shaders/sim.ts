import { COMMON } from './common';

// Seed a cascade with a consistent traveling-wave field: sum of directional
// waves with geometric wavelength spread, phase speed = c (matches the
// non-dispersive wave equation, so the field is an exact solution at t=0).
export const SIM_INIT = /* wgsl */ `
${COMMON}

@group(0) @binding(0) var<uniform> P: SimParams;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let N = i32(P.texN);
  let id = vec2i(g.xy);
  if (id.x >= N || id.y >= N) { return; }
  let world = P.origin + (vec2f(id) + vec2f(0.5)) / f32(N) * P.size;

  let lMax = P.size * 0.30;
  let lMin = max(P.size / P.texN, 1.0) * 4.0;
  var h = 0.0;
  var hv = 0.0;
  let ratio = 0.62;
  let nBands = i32(floor(log(lMax / lMin) / log(1.0 / ratio))) + 1;
  for (var i = 0; i < 6; i = i + 1) {
    if (i >= nBands) { break; }
    let fi = f32(i);
    // snap each band to integer wavenumbers (m,n) cycles per domain: the
    // discrete sums of sin/cos then factorize to exactly zero, so the field
    // starts with exactly zero spatial mean of both h and dh/dt (no DC drift)
    let dxc = P.size / P.texN;
    let lc = max(4.0, round(lMax * pow(ratio, fi) / dxc));
    let ang = hash21(vec2f(fi * 7.31 + 1.7, P.seed * 3.1)) * 2.0 * PI;
    var m = round(f32(N) * cos(ang) / lc);
    var n = round(f32(N) * sin(ang) / lc);
    if (m == 0.0 && n == 0.0) { n = 1.0; }
    let kx = 2.0 * PI * m / f32(N);
    let kz = 2.0 * PI * n / f32(N);
    let kk = sqrt(kx * kx + kz * kz);
    let amp = 0.62 * pow(0.62, fi);
    let omega = P.c * kk;
    let phase = kx * f32(id.x) + kz * f32(id.y) + omega * P.time + hash21(vec2f(fi * 3.7, P.seed)) * 2.0 * PI;
    h = h + amp * sin(phase);
    hv = hv + amp * omega * cos(phase);
  }
  textureStore(outTex, id, vec4f(h, hv, 0.0, 0.0));
}
`;

// One symplectic-Euler step of the damped wave equation on a periodic column
// grid, with camera advection, wind forcing and splash impulses:
//   hv' = hv + (c*dt/dx)^2 * (sum4(h) - 4h)   [scaled discrete Laplacian]
//   h'  = h + dt * hv'
export const SIM_STEP = /* wgsl */ `
${COMMON}

@group(0) @binding(0) var<uniform> P: SimParams;
@group(0) @binding(1) var oldTex: texture_2d<f32>;
@group(0) @binding(2) var newTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let N = i32(P.texN);
  let id = vec2i(g.xy);
  if (id.x >= N || id.y >= N) { return; }

  // camera advection: fetch the OLD window state under the NEW window
  let off = vec2i(round((P.origin - P.prevOrigin) / P.size * P.texN));
  let src = wrapId(id - off, N);
  let st = textureLoad(oldTex, src, 0);
  let hl = textureLoad(oldTex, wrapId(src + vec2i(-1, 0), N), 0).x;
  let hr = textureLoad(oldTex, wrapId(src + vec2i(1, 0), N), 0).x;
  let hd = textureLoad(oldTex, wrapId(src + vec2i(0, -1), N), 0).x;
  let hu = textureLoad(oldTex, wrapId(src + vec2i(0, 1), N), 0).x;

  let alpha = P.c * P.dt * P.texN / P.size;
  let lapSum = hl + hr + hd + hu - 4.0 * st.x;
  var hv = st.y + (alpha * alpha / P.dt) * lapSum; // wave eq: dt*c^2*laplacian(h); lap is raw sum = dx^2*grad^2
  hv = hv * exp(-(P.damping + P.pad0) * P.dt); // pad0 = sea-state feedback damping

  // wind forcing: Laplacian of a drifting noise potential. Its sum over the
  // periodic grid is exactly zero (telescoping), so it can never random-walk
  // the ocean's mean sea level, unlike raw per-cell noise.
  let world = P.origin + (vec2f(id) + vec2f(0.5)) / P.texN * P.size;
  let nq = world / (P.size * 0.22) + vec2f(P.time * 0.06, -P.time * 0.045) + vec2f(P.seed);
  let dn = 2.0 / (P.texN * 0.22);
  var wn = vnoise(nq + vec2f(dn, 0.0)) - vnoise(nq - vec2f(dn, 0.0))
         + vnoise(nq + vec2f(0.0, dn)) - vnoise(nq - vec2f(0.0, dn));
  let q2 = nq * 0.45 + vec2f(7.7, 3.1);
  let dn2 = 3.0 / (P.texN * 0.22);
  wn = wn + 1.2 * (vnoise(q2 + vec2f(dn2, 0.0)) - vnoise(q2 - vec2f(dn2, 0.0))
     + vnoise(q2 + vec2f(0.0, dn2)) - vnoise(q2 - vec2f(0.0, dn2)));
  hv = hv + P.dt * P.windAmp * 2.6 * wn;

  // interaction: splash impulse
  if (abs(P.splashAmp) > 0.0001) {
    let d = world - P.splashXY;
    hv = hv + P.splashAmp * exp(-dot(d, d) / (2.0 * P.splashSigma * P.splashSigma));
  }

  var h = st.x + P.dt * hv;
  // high-band diffusion keeps the finest scale from ringing (CFL guard)
  let havg = 0.25 * (hl + hr + hd + hu);
  h = mix(h, havg, clamp(P.diffusion, 0.0, 0.9));
  // (mean is maintained by mean-free init + zero-mean forcing; no DC pin —
  // wind kicks would otherwise random-walk the whole ocean up/down over time

  // foam: accumulate at sharp, fast crests; decay over time
  let dxn = P.size / P.texN;
  var foam = st.z * exp(-P.dt * 0.25);
  foam = foam + P.dt * 2.0 * max(-lapSum, 0.0) / dxn * max(st.x, 0.0) * min(abs(st.y) * 0.2, 1.2);
  foam = min(foam, 1.2);
  textureStore(newTex, id, vec4f(h, hv, foam, 0.0));
}
`;

// Block-quadtree AMR, fine level: 8x8 blocks, each 16x16 coarse cells ->
// 32x32 fine cells. Only refined blocks are simulated. Neighbor fetches fall
// back to bilinear coarse samples outside refined blocks (ghost cells), and
// newly refined blocks seed themselves by upsampling the coarse level with a
// short crossfade.
export const AMR_FINE_STEP = /* wgsl */ `
${COMMON}

@group(0) @binding(0) var<uniform> P: SimParams;
@group(0) @binding(1) var coarseTex: texture_2d<f32>;
@group(0) @binding(2) var fineOld: texture_2d<f32>;
@group(0) @binding(3) var fineNew: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage> blockData: array<f32>; // [0..64) flags, [64..128) ages

fn sampleOldFine(id: vec2i) -> vec4f {
  // fineOld is still in the previous window's frame -> apply camera advection
  let off = vec2i(round((P.origin - P.prevOrigin) / P.size * P.fineN));
  return textureLoad(fineOld, wrapId(id - off, i32(P.fineN)), 0);
}

fn coarseOld(uvNew: vec2f) -> vec4f {
  // coarse level has already been advected this frame -> no extra offset
  return sampleBilin(coarseTex, uvNew, u32(P.texN));
}

fn neighbor(id: vec2i) -> vec4f {
  let w = wrapId(id, i32(P.fineN));
  let b = i32(min(w.y >> 5, 7)) * 8 + i32(min(w.x >> 5, 7));
  if (blockData[b] > 0.5) {
    return sampleOldFine(w);
  }
  return coarseOld((vec2f(w) + vec2f(0.5)) / P.fineN);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let N = i32(P.fineN);
  let id = vec2i(g.xy);
  if (id.x >= N || id.y >= N) { return; }
  let b = i32(min(id.y >> 5, 7)) * 8 + i32(min(id.x >> 5, 7));
  if (blockData[b] < 0.5) { return; }

  let uv = (vec2f(id) + vec2f(0.5)) / P.fineN;
  let up = coarseOld(uv); // upsampled coarse (also the seed source)
  let age = blockData[64 + b];
  if (age < 0.5) { // freshly refined: seed by upsampling, no step
    textureStore(fineNew, id, vec4f(up.xyz, 0.0));
    return;
  }

  let st = neighbor(id);
  let alpha = P.c * P.dt * P.fineN / P.size;
  let hl = neighbor(id + vec2i(-1, 0)).x;
  let hr = neighbor(id + vec2i(1, 0)).x;
  let hd = neighbor(id + vec2i(0, -1)).x;
  let hu = neighbor(id + vec2i(0, 1)).x;

  var hv = st.y + (alpha * alpha / P.dt) * (hl + hr + hd + hu - 4.0 * st.x);
  hv = hv * exp(-(P.damping + P.pad0) * P.dt); // pad0 = sea-state feedback damping

  let world = P.origin + uv * P.size;
  let nq = world / (P.size * 0.22) + vec2f(P.time * 0.06, -P.time * 0.045) + vec2f(P.seed);
  let dn = 2.0 / (P.fineN * 0.22);
  var wn = vnoise(nq + vec2f(dn, 0.0)) - vnoise(nq - vec2f(dn, 0.0))
         + vnoise(nq + vec2f(0.0, dn)) - vnoise(nq - vec2f(0.0, dn));
  let q2 = nq * 0.45 + vec2f(7.7, 3.1);
  let dn2 = 3.0 / (P.fineN * 0.22);
  wn = wn + 1.2 * (vnoise(q2 + vec2f(dn2, 0.0)) - vnoise(q2 - vec2f(dn2, 0.0))
     + vnoise(q2 + vec2f(0.0, dn2)) - vnoise(q2 - vec2f(0.0, dn2)));
  hv = hv + P.dt * P.windAmp * 2.6 * wn;

  if (abs(P.splashAmp) > 0.0001) {
    let d = world - P.splashXY;
    hv = hv + P.splashAmp * exp(-dot(d, d) / (2.0 * P.splashSigma * P.splashSigma));
  }

  var h = st.x + P.dt * hv;
  let havg = 0.25 * (hl + hr + hd + hu);
  h = mix(h, havg, clamp(P.diffusion * 1.6, 0.0, 0.9));

  var outv = vec4f(h, hv, st.z * exp(-P.dt * 0.25), 0.0);
  let lap = hl + hr + hd + hu - 4.0 * st.x;
  let dxn = P.size / P.fineN;
  var foam = outv.z + P.dt * 2.0 * max(-lap, 0.0) / dxn * max(st.x, 0.0) * min(abs(st.y) * 0.2, 1.2);
  outv.z = min(foam, 1.2);
  // crossfade from the coarse seed during the first frames of a new block
  let blend = clamp(age / 4.0, 0.0, 1.0);
  outv = mix(vec4f(up.xyz, 0.0), outv, vec4f(blend));
  textureStore(fineNew, id, outv);
}
`;

// Restriction: average refined fine blocks back into the coarse level so
// waves propagate coherently out of refined regions (BUQ-style handoff).
export const AMR_RESTRICT = /* wgsl */ `
${COMMON}

@group(0) @binding(0) var<uniform> P: SimParams;
@group(0) @binding(1) var fineTex: texture_2d<f32>;
@group(0) @binding(2) var coarseNew: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<storage> blockData: array<f32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let N = i32(P.texN);
  let id = vec2i(g.xy);
  if (id.x >= N || id.y >= N) { return; }
  let b = i32(min(id.y >> 4, 7)) * 8 + i32(min(id.x >> 4, 7));
  if (blockData[b] < 0.5) { return; }
  let f = id * 2;
  let a = textureLoad(fineTex, f, 0);
  let bb = textureLoad(fineTex, f + vec2i(1, 0), 0);
  let c = textureLoad(fineTex, f + vec2i(0, 1), 0);
  let d = textureLoad(fineTex, f + vec2i(1, 1), 0);
  textureStore(coarseNew, id, (a + bb + c + d) * 0.25);
}
`;

// Composite: build the 256^2 render texture — refined blocks from the fine
// level, everything else bilinearly upsampled from the coarse level.
export const AMR_COMPOSITE = /* wgsl */ `
${COMMON}

@group(0) @binding(0) var<uniform> P: SimParams;
@group(0) @binding(1) var fineTex: texture_2d<f32>;
@group(0) @binding(2) var coarseTex: texture_2d<f32>;
@group(0) @binding(3) var outTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage> blockData: array<f32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) g: vec3u) {
  let N = i32(P.fineN);
  let id = vec2i(g.xy);
  if (id.x >= N || id.y >= N) { return; }
  let b = i32(min(id.y >> 5, 7)) * 8 + i32(min(id.x >> 5, 7));
  var st: vec4f;
  if (blockData[b] > 0.5) {
    st = textureLoad(fineTex, id, 0);
  } else {
    st = sampleBilin(coarseTex, (vec2f(id) + vec2f(0.5)) / P.fineN, u32(P.texN));
  }
  textureStore(outTex, id, vec4f(st.xyz, 0.0));
}
`;

// Block refinement scoring: one workgroup per block, workgroup-reduced max of
// a steepness/curvature/kinetic-energy score + splash proximity. The CPU adds
// hysteresis and a budget and toggles the flags.
export const AMR_SCORE = /* wgsl */ `
${COMMON}

@group(0) @binding(0) var<uniform> P: SimParams;
@group(0) @binding(1) var coarseTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> scores: array<f32>; // [0..64) refinement score, [64..128) block rms

var<workgroup> red: array<f32, 256>;
var<workgroup> redSum: array<f32, 256>;

@compute @workgroup_size(16, 16, 1)
fn main(
  @builtin(global_invocation_id) g: vec3u,
  @builtin(workgroup_id) wg: vec3u,
  @builtin(local_invocation_index) lid: u32,
) {
  let N = i32(P.texN);
  let id = vec2i(g.xy);
  var s = 0.0;
  var st = vec4f(0.0); // function scope: read by the reduction below
  if (id.x < N && id.y < N) {
    st = textureLoad(coarseTex, id, 0);
    let hl = textureLoad(coarseTex, wrapId(id + vec2i(-1, 0), N), 0).x;
    let hr = textureLoad(coarseTex, wrapId(id + vec2i(1, 0), N), 0).x;
    let hd = textureLoad(coarseTex, wrapId(id + vec2i(0, -1), N), 0).x;
    let hu = textureLoad(coarseTex, wrapId(id + vec2i(0, 1), N), 0).x;
    let dx = P.size / P.texN;
    let grad = length(vec2f(hr - hl, hu - hd)) / (2.0 * dx);
    let curv = abs(hl + hr + hd + hu - 4.0 * st.x) / dx;
    let hvN = min(abs(st.y) / max(P.c, 1.0), 1.0);
    // crest-height term: high seas refine wave-crest blocks (the "more wave ->
    // more resolution" rule); steepness/curvature terms catch splashes & wakes
    s = 0.55 * grad + 0.50 * curv + 0.15 * hvN + 1.2 * min(max(st.x, 0.0) * 0.45, 1.0);

    if (abs(P.splashAmp) > 0.0001) {
      let world = P.origin + (vec2f(id) + vec2f(0.5)) * dx;
      let d = length(world - P.splashXY);
      s = s + 2.0 * smoothstep(14.0, 1.0, d) * clamp(abs(P.splashAmp) * 2.0, 0.0, 2.0);
    }
  }
  red[lid] = s;
  redSum[lid] = st.x * st.x;
  workgroupBarrier();
  for (var stride = 128u; stride > 0u; stride = stride >> 1u) {
    if (lid < stride) {
      red[lid] = max(red[lid], red[lid + stride]);
      redSum[lid] = redSum[lid] + redSum[lid + stride];
    }
    workgroupBarrier();
  }
  if (lid == 0u) {
    let b = wg.x + wg.y * 8u;
    scores[b] = red[0];
    scores[64u + b] = sqrt(redSum[0] / 256.0);
  }
}
`;
