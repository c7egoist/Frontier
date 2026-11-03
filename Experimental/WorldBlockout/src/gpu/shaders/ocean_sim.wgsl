// Ocean compute pass 1 — build the time-dependent spectrum h(k,t) for one cascade.
//
// The CPU builds h0(k) once from a Phillips spectrum (wind speed, direction, fetch, depth).
// This pass evaluates the Tessendorf time term every frame:
//     h(k,t)  = h0(k) e^{iwt} + conj(h0(-k)) e^{-iwt}
//     D(k,t)  = -i k_hat * h(k,t) * choppiness        (horizontal displacement)
// and packs four complex signals into two RGBA16F targets so the FFT pass moves two textures
// instead of four:
//     specA = (Re h, Im h, Re Dx, Im Dx)
//     specB = (Re Dz, Im Dz, 0, 0)
//
// Nothing here is a scrolling normal map: the output is a spectrum that the FFT pass turns into
// a real surface. One dispatch per cascade.

struct OceanSim {
  time       : f32,
  spectrumN  : u32,
  choppiness : f32,
  amplitude  : f32,
  tile       : f32,
  pad0       : f32,
  pad1       : f32,
  pad2       : f32,
};
@group(0) @binding(0) var<uniform> sim : OceanSim;
@group(0) @binding(1) var<storage, read> specA : array<vec4f>; // h0(k).xy, h0(-k).xy
@group(0) @binding(2) var<storage, read> specB : array<vec4f>; // kdir.xy, omega, scale
@group(0) @binding(3) var specOutA : texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var specOutB : texture_storage_2d<rgba16float, write>;

fn wrapIdx(i: i32, n: i32) -> u32 { return u32((i + n) & (n - 1)); }

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3u) {
  let n = i32(sim.spectrumN);
  let ix = i32(gid.x);
  let iy = i32(gid.y);
  if (ix >= n || iy >= n) { return; }

  let idx = u32(iy) * u32(n) + u32(ix);
  let a = specA[idx];
  let b = specB[idx];
  let scale = b.w;

  let t = b.z * sim.time;
  let c = cos(t);
  let s = sin(t);

  // a.xy = h0(k); a.zw = h0(-k)
  let ar = (a.x * c - a.y * s) * scale;
  let ai = (a.x * s + a.y * c) * scale;
  let br = (a.z * c + a.w * s) * scale;
  let bi = (-a.z * s + a.w * c) * scale;
  let hr = ar + br;
  let hi = ai + bi;

  let kd = b.xy;
  let dxr = hi * kd.x * sim.choppiness;
  let dxi = -hr * kd.x * sim.choppiness;
  let dzr = hi * kd.y * sim.choppiness;
  let dzi = -hr * kd.y * sim.choppiness;

  textureStore(specOutA, vec2i(ix, iy), vec4f(hr, hi, dxr, dxi));
  textureStore(specOutB, vec2i(ix, iy), vec4f(dzr, dzi, 0.0, 0.0));
}
