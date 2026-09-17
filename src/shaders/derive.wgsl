#include "common.wgsl"

fn wrapi(c : vec2<i32>, n : i32) -> vec2<i32> {
  return vec2<i32>((c.x + n) % n, (c.y + n) % n);
}

// ---------------------------------------------------------------------------
// Derive pass: from (h, dh/dt) build the packed render texture
//   .x  = surface height
//   .yz = horizontal (choppy) displacement
//   .w  = foam coverage
// Horizontal displacement is the standard Gerstner/Lagrangian warp obtained
// from the Hilbert-like relation D = -chi * grad(h) / k_b, which sharpens
// crests and flattens troughs without any spectral transform.
// ---------------------------------------------------------------------------
@group(0) @binding(0) var<uniform> DU : SimUniforms;
@group(0) @binding(1) var dSrc  : texture_2d_array<f32>;
@group(0) @binding(2) var dFoam : texture_2d_array<f32>;
@group(0) @binding(3) var dOut  : texture_storage_2d_array<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn derive(@builtin(global_invocation_id) gid : vec3<u32>) {
  let n = i32(DU.misc.x);
  if (i32(gid.x) >= n || i32(gid.y) >= n) { return; }
  let layer = i32(gid.z);
  let b = DU.bands[layer];
  let dx = b.params.y;
  let chi = b.tuning.w * DU.misc.z;

  let ci = vec2<i32>(i32(gid.x), i32(gid.y));
  let h = textureLoad(dSrc, ci, layer, 0).x;

  let hx = textureLoad(dSrc, wrapi(ci + vec2<i32>(1, 0), n), layer, 0).x
         - textureLoad(dSrc, wrapi(ci - vec2<i32>(1, 0), n), layer, 0).x;
  let hz = textureLoad(dSrc, wrapi(ci + vec2<i32>(0, 1), n), layer, 0).x
         - textureLoad(dSrc, wrapi(ci - vec2<i32>(0, 1), n), layer, 0).x;
  let grad = vec2<f32>(hx, hz) / (2.0 * dx);

  let lambda = b.params.x * 0.25;
  let k = 2.0 * PI / lambda;
  let disp = -chi * grad / k;

  let foam = textureLoad(dFoam, ci, layer, 0).x;
  textureStore(dOut, ci, layer, vec4<f32>(h, disp.x, disp.y, foam));
}
