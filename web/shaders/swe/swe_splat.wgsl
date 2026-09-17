// Surface accumulation: the fine shallow-water layer -> the near height field.
//
// Splatting is bilinear: 4 atomic adds per particle. Because the particles own the water volume
// (V = dx^2 * depth), splatting V/texelArea gives a height field in metres with no extra
// normalisation -- the field's integral over the domain is exactly the water volume (there is a
// unit test for that statement). The per-texel weight channel doubles as the divisor, so the
// velocity is a depth-weighted average rather than a plain mean.
//
// Accumulators are integer atomics (see common/accum.wgsl for the fixed-point contract).

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "common/accum.wgsl"
#include "swe/swe_layer.wgsl"

@group(1) @binding(0) var<storage, read>       sweParticles: array<SweParticle>;
// Compiled twice (see swe_layer.wgsl): the fine layer fills the near field, the coarse layer the
// far field. Both bind their accumulator at index 2; only the far variant needs a counter.
#ifdef SWE_COARSE
@group(1) @binding(2) var<storage, read_write> farAccum: array<atomic<u32>>;
@group(1) @binding(3) var<storage, read_write> farCount: array<atomic<u32>>;
#else
@group(1) @binding(2) var<storage, read_write> nearAccum: array<atomic<u32>>;
#endif
@group(1) @binding(8) var bedTex: texture_2d<f32>;
@group(1) @binding(9) var bedSampler: sampler;

fn depthAt(xz: vec2<f32>) -> f32 {
  let uv = (xz - P.bedOrigin) * (1.0 / (2.0 * P.bedWorldHalf)) + vec2<f32>(0.5);
  return textureSampleLevel(bedTex, bedSampler, uv, 0.0).r;
}

@compute @workgroup_size(256)
fn clearNear(@builtin(global_invocation_id) gid: vec3<u32>) {
#ifdef SWE_COARSE
  let slots = accumSlots(P.farHeightRes);
  let cells = P.farHeightRes.x * P.farHeightRes.y;
  if (gid.x < slots) { atomicStore(&farAccum[gid.x], 0u); }
  if (gid.x < cells) { atomicStore(&farCount[gid.x], 0u); }
#else
  let slots = accumSlots(P.nearHeightRes);
  if (gid.x >= slots) { return; }
  atomicStore(&nearAccum[gid.x], 0u);
#endif
}

@compute @workgroup_size(64)
fn splatSwe(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.sweCount) { return; }
  let p = sweParticles[gid.x];
  let xz = p.posH.xy;

  let dims = P.nearHeightRes;
  let texelSize = P.nearHeightSize.x / f32(dims.x);
  let area = texelSize * texelSize;

  // Texel-space position of the particle; its bilinear footprint spans 4 texel centres.
  let t = (xz - P.nearHeightOrigin) / P.nearHeightSize * vec2<f32>(dims);
  let t0 = floor(t - vec2<f32>(0.5)) + vec2<f32>(0.5);
  let f = t - t0;
  if (t0.x < -0.5 || t0.y < -0.5 || t0.x > f32(dims.x) - 0.5 || t0.y > f32(dims.y) - 0.5) { return; }

  let depth = max(p.velV.z, 0.0) / area;        // metres of column contributed by this particle
  let foam = clamp(p.posH.w, 0.0, 1.0) * depth;
  let v = p.velV.xy;

  for (var j = 0; j < 2; j = j + 1) {
    for (var i = 0; i < 2; i = i + 1) {
      let cell = vec2<i32>(t0) + vec2<i32>(i, j);
      if (cell.x < 0 || cell.y < 0 || cell.x >= i32(dims.x) || cell.y >= i32(dims.y)) { continue; }
      let wi = select(1.0 - f.x, f.x, i == 1);
      let wj = select(1.0 - f.y, f.y, j == 1);
      let w = wi * wj;
      let base = accumBase(cell, dims);
      atomicAdd(&nearAccum[base], u32(clamp(w * depth * HEIGHT_SCALE, 0.0, 4.0e9)));
      atomicAdd(&nearAccum[base + 1u], u32(clamp(w * foam * HEIGHT_SCALE, 0.0, 4.0e9)));
      atomicAdd(&nearAccum[base + 2u], u32(clamp(w * depth * (v.x + VEL_BIAS) * VEL_SCALE, 0.0, 4.0e9)));
      atomicAdd(&nearAccum[base + 3u], u32(clamp(w * depth * (v.y + VEL_BIAS) * VEL_SCALE, 0.0, 4.0e9)));
    }
  }
}

/// Coarse-layer splat: identical bilinear footprint, but the far field stores *biased elevation*
/// plus the accumulated weight, because wave packets superpose there and both writers must use one
/// convention (see common/accum.wgsl).
#ifdef SWE_COARSE
@compute @workgroup_size(64)
fn splatCoarse(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= lCount()) { return; }
  let p = sweParticles[gid.x];
  let xz = p.posH.xy;

  let dims = P.farHeightRes;
  let texelSize = P.farHeightSize.x / f32(dims.x);
  let area = texelSize * texelSize;

  let t = (xz - P.farHeightOrigin) / P.farHeightSize * vec2<f32>(dims);
  let t0 = floor(t - vec2<f32>(0.5)) + vec2<f32>(0.5);
  let f = t - t0;
  if (t0.x < -0.5 || t0.y < -0.5 || t0.x > f32(dims.x) - 0.5 || t0.y > f32(dims.y) - 0.5) { return; }

  let depth = max(p.velV.z, 0.0) / area;
  let eta = depth - depthAt(xz);
  let foam = clamp(p.posH.w, 0.0, 1.0);
  let v = p.velV.xy;

  for (var j = 0; j < 2; j = j + 1) {
    for (var i = 0; i < 2; i = i + 1) {
      let cell = vec2<i32>(t0) + vec2<i32>(i, j);
      if (cell.x < 0 || cell.y < 0 || cell.x >= i32(dims.x) || cell.y >= i32(dims.y)) { continue; }
      let wi = select(1.0 - f.x, f.x, i == 1);
      let wj = select(1.0 - f.y, f.y, j == 1);
      let w = wi * wj;
      let base = accumBase(cell, dims);
      atomicAdd(&farAccum[base], u32(clamp(w * (eta + HEIGHT_BIAS) * HEIGHT_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farAccum[base + 1u], u32(clamp(w * foam * FOAM_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farAccum[base + 2u], u32(clamp(w * (v.x + VEL_BIAS) * VEL_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farAccum[base + 3u], u32(clamp(w * (v.y + VEL_BIAS) * VEL_SCALE, 0.0, 4.0e9)));
      atomicAdd(&farCount[u32(cell.y) * dims.x + u32(cell.x)], u32(clamp(w * COUNT_SCALE, 0.0, 4.0e9)));
    }
  }
}
#endif
