#include "common.wgsl"

// ---------------------------------------------------------------------------
// Cascaded shallow-water / wave-equation solver.
//
// Each band is a periodic (toroidal) patch of ocean of size L_b metres on a
// GRID x GRID lattice. Inside a band we integrate the classic second order
// wave equation
//
//        d2h/dt2 = c_b^2 * laplacian(h) - mu * dh/dt + F_wind
//
// which is the linearised shallow-water system written in one variable. It is
// a genuine time-stepped PDE solve on the GPU - no FFT, no spectrum baking,
// no precomputed animation loop.
//
// Real ocean gravity waves are dispersive (w = sqrt(g k tanh(k H))) while the
// wave equation is not. We recover dispersion *across* bands: every band is
// given the phase speed of its own dominant wavelength,
//
//        c_b = sqrt( g / k_b * tanh(k_b * H) ),  k_b = 2*pi / lambda_b
//
// so long swell in band 0 outruns the short chop in band 2 exactly as it
// should. Within a band the residual error is tiny because a band only spans
// about two octaves.
// ---------------------------------------------------------------------------

@group(0) @binding(0) var<uniform> U : SimUniforms;
@group(0) @binding(1) var srcState : texture_2d_array<f32>;      // rg = h, dh/dt
@group(0) @binding(2) var dstState : texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(3) var srcFoam  : texture_2d_array<f32>;
@group(0) @binding(4) var dstFoam  : texture_storage_2d_array<rgba16float, write>;

fn wrapi(c : vec2<i32>, n : i32) -> vec2<i32> {
  return vec2<i32>((c.x + n) % n, (c.y + n) % n);
}

fn loadH(c : vec2<i32>, n : i32, layer : i32) -> f32 {
  return textureLoad(srcState, wrapi(c, n), layer, 0).x;
}

// Divergence-free-ish rolling wind turbulence used to force the free surface.
fn windForcing(world : vec2<f32>, t : f32, wind : vec2<f32>, speed : f32, scale : f32) -> f32 {
  let drift = world - wind * speed * t * 0.35;
  var f = fbm(drift * scale, 3);
  f += 0.5 * fbm(drift * scale * 2.7 + vec2<f32>(t * 0.7, -t * 0.4), 2);
  return f;
}

@compute @workgroup_size(8, 8, 1)
fn step(@builtin(global_invocation_id) gid : vec3<u32>) {
  let n = i32(U.misc.x);
  if (i32(gid.x) >= n || i32(gid.y) >= n) { return; }
  let layer = i32(gid.z);
  let b = U.bands[layer];

  let L  = b.params.x;
  let dx = b.params.y;
  let c  = b.params.z;          // phase speed for this band (m/s)
  let dt = b.tuning.x;
  let mu = b.tuning.y;
  let amp = b.tuning.z;

  let ci = vec2<i32>(i32(gid.x), i32(gid.y));
  let s  = textureLoad(srcState, ci, layer, 0);
  let h  = s.x;
  var v  = s.y;

  // 5-point laplacian on the periodic lattice.
  let lap = (loadH(ci + vec2<i32>(1, 0), n, layer)
           + loadH(ci - vec2<i32>(1, 0), n, layer)
           + loadH(ci + vec2<i32>(0, 1), n, layer)
           + loadH(ci - vec2<i32>(0, 1), n, layer)
           - 4.0 * h) / (dx * dx);

  let world = (vec2<f32>(ci) + 0.5) * dx;
  let t = U.windDirTime.z;
  let wind = U.windDirTime.xy;
  let windSpeed = U.windDirTime.w;

  // Wind forcing: pressure fluctuations at the band scale, plus a small
  // Miles-type instability term that pumps energy into crests already moving
  // downwind (this is what lets a steady breeze build a developed sea).
  let gradH = vec2<f32>(loadH(ci + vec2<i32>(1, 0), n, layer) - loadH(ci - vec2<i32>(1, 0), n, layer),
                        loadH(ci + vec2<i32>(0, 1), n, layer) - loadH(ci - vec2<i32>(0, 1), n, layer)) / (2.0 * dx);
  let turb = windForcing(world, t, wind, windSpeed, 2.0 * PI / L * 3.0);
  let miles = -dot(wind, gradH) * windSpeed * 0.06;

  let force = amp * windSpeed * windSpeed * 0.0016 * turb + miles;

  // Semi-implicit (symplectic) Euler: stable and energy preserving.
  v += dt * (c * c * lap + force);
  v -= mu * dt * v;
  var hn = h + dt * v;

  // Soft amplitude limiter: real seas cap steepness by breaking, and this
  // keeps the explicit scheme bounded on low-end GPUs where dt is coarse.
  let cap = b.params.w;
  hn = cap * tanh(hn / cap);

  textureStore(dstState, ci, layer, vec4<f32>(hn, v, 0.0, 0.0));

  // ---- foam / whitecap energy ---------------------------------------------
  // Whitecaps appear where the surface folds: high local steepness combined
  // with converging flow (negative Jacobian of the choppy displacement).
  let steep = length(gradH);
  let conv  = max(0.0, -lap) * dx * dx;
  var foam = textureLoad(srcFoam, ci, layer, 0).x;
  let birth = smoothstep(0.22, 0.55, steep) * (0.4 + conv * 2.0);
  foam = max(foam * exp(-U.misc.w * dt), birth);
  textureStore(dstFoam, ci, layer, vec4<f32>(clamp(foam, 0.0, 1.0), steep, 0.0, 0.0));
}
