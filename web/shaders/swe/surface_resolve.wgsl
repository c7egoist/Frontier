// Resolve the integer accumulators into the height fields the renderer samples:
//   rgba16float = (surface elevation m, foam 0..1, velocity.x, velocity.z)
//
// One buffer read + one texture write per texel: this is the cheapest pass in the frame and it is
// what decouples the (variable-count) particle passes from the (fixed-size) field the renderer
// needs -- which is the property that makes the ocean mesh's cost independent of the particle
// budget.
//
// resolveFar blends the fine layer into the far field across `nearFieldFactor`, the same function
// the ocean mesh uses, so there is no visible seam where the two fields hand over.
//
// One module, two builds: `-DRESOLVE_FAR=1` switches binding 3 from a write-only storage texture to
// a sampled one and emits only resolveFar. That is not cosmetic -- a read-write storage texture
// would be the alternative, and it is the one storage-texture feature not available on every WebGPU
// implementation. Neither build here needs it.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "common/accum.wgsl"

@group(1) @binding(0) var<storage, read>       nearAccum: array<u32>;
@group(1) @binding(1) var<storage, read>       farAccum:  array<u32>;
@group(1) @binding(2) var<storage, read>       farCount:  array<u32>;
// Two variants of one module (see the block comment at the top): the near resolve writes the near
// field, the far resolve *reads* it after it has been written. Binding it as a sampled texture for
// the read is what keeps this project free of read-write storage textures, the newest and least
// portable corner of the storage-texture spec.
#ifdef RESOLVE_FAR
@group(1) @binding(3) var nearTex: texture_2d<f32>;
@group(1) @binding(4) var farOut:  texture_storage_2d<rgba16float, write>;
#else
@group(1) @binding(3) var nearOut: texture_storage_2d<rgba16float, write>;
#endif
@group(1) @binding(8) var bedTex: texture_2d<f32>;
@group(1) @binding(9) var bedSampler: sampler;

fn depthAt(xz: vec2<f32>) -> f32 {
  let uv = (xz - P.bedOrigin) * (1.0 / (2.0 * P.bedWorldHalf)) + vec2<f32>(0.5);
  return textureSampleLevel(bedTex, bedSampler, uv, 0.0).r;
}

#ifndef RESOLVE_FAR
@compute @workgroup_size(8, 8)
fn resolveNear(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = P.nearHeightRes;
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let cell = vec2<i32>(gid.xy);
  let base = accumBase(cell, dims);

  let weight = f32(nearAccum[base]) / HEIGHT_SCALE;   // == the smoothed column depth (m)
  let w = max(weight, 1e-4);
  let world = texelWorld(cell, dims, P.nearHeightOrigin, P.nearHeightSize);

  let eta = weight - depthAt(world);
  let foam = select(0.0, f32(nearAccum[base + 1u]) / (HEIGHT_SCALE * w), weight > 1e-3);
  let vx = select(0.0, f32(nearAccum[base + 2u]) / (HEIGHT_SCALE * w) - VEL_BIAS, weight > 1e-3);
  let vz = select(0.0, f32(nearAccum[base + 3u]) / (HEIGHT_SCALE * w) - VEL_BIAS, weight > 1e-3);

  textureStore(nearOut, cell, vec4<f32>(eta, clamp(foam, 0.0, 1.0), vx, vz));
}
#endif

#ifdef RESOLVE_FAR
@compute @workgroup_size(8, 8)
fn resolveFar(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = P.farHeightRes;
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let cell = vec2<i32>(gid.xy);
  let base = accumBase(cell, dims);
  let world = texelWorld(cell, dims, P.farHeightOrigin, P.farHeightSize);

  // Wave packets superpose linearly, so the height is a sum over the packets touching this texel;
  // the +BIAS encoding is removed with the per-texel contribution count.
  let count = farCount[u32(cell.y) * dims.x + u32(cell.x)];
  let n = f32(count) / COUNT_SCALE;
  let live = count > 0u;
  var eta = select(0.0, f32(farAccum[base]) / HEIGHT_SCALE - HEIGHT_BIAS * n, live);
  var foam = select(0.0, f32(farAccum[base + 1u]) / (FOAM_SCALE * max(n, 1.0)), live);
  var vel = select(
    vec2<f32>(0.0),
    vec2<f32>(f32(farAccum[base + 2u]), f32(farAccum[base + 3u])) / (VEL_SCALE * max(n, 1.0)) - vec2<f32>(VEL_BIAS),
    live,
  );

  // Hand over to the fine layer inside its footprint, fading across a band.
  let blend = nearFieldFactor(world);
  if (blend > 0.0) {
    let near = bilinearLoad(nearTex, world, P.nearHeightOrigin, P.nearHeightSize);
    eta = mix(eta, near.r, blend);
    foam = mix(foam, near.g, blend);
    vel = mix(vel, near.ba, blend);
  }

  textureStore(farOut, cell, vec4<f32>(eta, clamp(foam, 0.0, 1.0), vel));
}
#endif
