// Surface accumulators: the fixed-point contract between the splat passes, the resolve passes and
// the height fields the renderer samples.
//
// Why integer atomics: WGSL has no atomic<f32>, and float atomicAdd is not available in core
// WebGPU either. Fixed-point u32 accumulation is exact, order-independent (so the same input gives
// the same field on every GPU) and lets the CPU reference implementation in tests/ reproduce the
// bilinear splat bit for bit.
//
// Layout: one `array<atomic<u32>>` per field, ACCUM_CHANNELS u32 per texel:
//   0: height/weight   (m * HEIGHT_SCALE, or (eta + HEIGHT_BIAS) * HEIGHT_SCALE for packets)
//   1: foam            (0..1 * FOAM_SCALE, or the contribution count for the packet sum)
//   2: velocity.x      ((v + VEL_BIAS) * VEL_SCALE)
//   3: velocity.z
// The buffer is indexed by (y * width + x) * ACCUM_CHANNELS + channel, so no texture binding is
// involved and the same buffer can be cleared, splatted and resolved without barriers.

#pragma once

#include "common/util.wgsl"

const ACCUM_CHANNELS: u32 = 4u;

const HEIGHT_SCALE: f32 = 256.0;
const HEIGHT_BIAS: f32 = 64.0;    // m: keeps packet eta sums non-negative
const FOAM_SCALE: f32 = 1024.0;
const VEL_SCALE: f32 = 256.0;
const VEL_BIAS: f32 = 64.0;       // m/s
const DEPOSIT_SCALE: f32 = 256.0; // m^3 per unit of the 3D->2D return channel
const COUNT_SCALE: f32 = 256.0;   // weight unit of the far field's contribution counter

/// Index of channel 0 of a texel. Add 1..3 for foam / velocity.
fn accumBase(cell: vec2<i32>, dims: vec2<u32>) -> u32 {
  return (u32(cell.y) * dims.x + u32(cell.x)) * ACCUM_CHANNELS;
}

/// Total number of u32 slots a field of `dims` texels occupies.
fn accumSlots(dims: vec2<u32>) -> u32 {
  return dims.x * dims.y * ACCUM_CHANNELS;
}

/// World XZ position of a texel centre. Every field in this project uses the same convention:
/// texels are laid out row-major over [origin, origin+size), centres at (i + 0.5)/res.
fn texelWorld(cell: vec2<i32>, dims: vec2<u32>, origin: vec2<f32>, size: vec2<f32>) -> vec2<f32> {
  return origin + (vec2<f32>(cell) + vec2<f32>(0.5)) * size / vec2<f32>(dims);
}

/// Manual bilinear read of a resolved rgba16float field.
///
/// Two variants because the two texture kinds take different `textureLoad` signatures: a sampled
/// texture takes (texture, coords, level) and a *storage* texture takes (texture, coords) only --
/// passing the level to a storage texture is a compile error, which is why this is not one function
/// with an overload. Both are used:
///   * `bilinearLoad`        -- sampling a field the current pass does not write (fragment shading,
///                              and the far resolve reading the near field),
///   * `bilinearLoadStorage` -- reading a field the same pass also writes, which is only possible
///                              through the storage-texture binding.
fn bilinearLoad(
  tex: texture_2d<f32>,
  world: vec2<f32>,
  origin: vec2<f32>,
  size: vec2<f32>,
) -> vec4<f32> {
  let dims = vec2<f32>(textureDimensions(tex));
  let t = (world - origin) / size * dims - vec2<f32>(0.5);
  let i = floor(t);
  let f = clamp(t - i, vec2<f32>(0.0), vec2<f32>(1.0));
  let hi = vec2<i32>(dims) - vec2<i32>(1);
  let c00 = textureLoad(tex, clamp(vec2<i32>(i), vec2<i32>(0), hi), 0);
  let c10 = textureLoad(tex, clamp(vec2<i32>(i) + vec2<i32>(1, 0), vec2<i32>(0), hi), 0);
  let c01 = textureLoad(tex, clamp(vec2<i32>(i) + vec2<i32>(0, 1), vec2<i32>(0), hi), 0);
  let c11 = textureLoad(tex, clamp(vec2<i32>(i) + vec2<i32>(1, 1), vec2<i32>(0), hi), 0);
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

fn bilinearLoadStorage(
  tex: texture_storage_2d<rgba16float, read_write>,
  world: vec2<f32>,
  origin: vec2<f32>,
  size: vec2<f32>,
) -> vec4<f32> {
  let dims = vec2<f32>(textureDimensions(tex));
  let t = (world - origin) / size * dims - vec2<f32>(0.5);
  let i = floor(t);
  let f = clamp(t - i, vec2<f32>(0.0), vec2<f32>(1.0));
  let hi = vec2<i32>(dims) - vec2<i32>(1);
  let c00 = textureLoad(tex, clamp(vec2<i32>(i), vec2<i32>(0), hi));
  let c10 = textureLoad(tex, clamp(vec2<i32>(i) + vec2<i32>(1, 0), vec2<i32>(0), hi));
  let c01 = textureLoad(tex, clamp(vec2<i32>(i) + vec2<i32>(0, 1), vec2<i32>(0), hi));
  let c11 = textureLoad(tex, clamp(vec2<i32>(i) + vec2<i32>(1, 1), vec2<i32>(0), hi));
  return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}
