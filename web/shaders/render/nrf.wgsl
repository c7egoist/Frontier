// Narrow-Range Filter on the fluid depth (Truong & Yuksel 2018), separable and ping-ponged.
//
// This is the pass that decides whether the screen-space fluid looks like water or like a pile of
// spheres. A bilateral filter blurs across depth discontinuities -- it melts the edges of a splash
// into the water behind it. The NRF restricts every tap to a *narrow range* around the centre
// depth, which preserves silhouettes while still smoothing the interior, and the cleanup pass pulls
// back the pixels where the separable approximation disagrees with its neighbourhood.
//
// Depth convention, shared with render/fluid.wgsl: `particleDepth` holds normalized *linear* depth
// q = (d - near) / (far - near) in [0, 1], with 1.0 meaning "no fluid" (the value the depth prepass
// is cleared to). The filter's range parameter is a distance in metres, so every tap converts back
// to metres before comparing and the result is converted on the way out.
//
// Its own module: one sampled input and one storage output, so the pass can ping-pong through the
// two intermediate textures without a module declaring the same texture as both readable and
// writable.

#pragma once

#include "common/globals.wgsl"

@group(1) @binding(0) var src: texture_2d<f32>;
@group(1) @binding(1) var dst: texture_storage_2d<r32float, write>;

const NRF_SIGMA_SCALE: f32 = 0.45;
const EMPTY_DEPTH: f32 = 1.0;

fn depthMetres(q: f32) -> f32 {
  return P.nearPlane + q * (P.farPlane - P.nearPlane);
}

fn depthNorm(d: f32) -> f32 {
  return clamp((d - P.nearPlane) / max(P.farPlane - P.nearPlane, 1e-3), 0.0, 1.0);
}

/// One separable pass along `axis`, in metres, narrow-ranged around the centre tap.
fn filterAxis(tex: texture_2d<f32>, out: texture_storage_2d<r32float, write>, c: vec2<i32>, axis: vec2<i32>) {
  let dims = vec2<i32>(textureDimensions(tex));
  let centre = textureLoad(tex, c, 0).r;
  if (centre >= EMPTY_DEPTH) {
    textureStore(out, c, vec4<f32>(EMPTY_DEPTH));
    return;
  }
  let centreD = depthMetres(centre);
  let radius = i32(max(1.0, P.fluidFilterRadius));
  let sigma = max(1.0, P.fluidFilterRadius * NRF_SIGMA_SCALE);
  let range = max(P.fluidFilterRange, 0.005);

  var sum = 0.0;
  var weight = 0.0;
  for (var i = -radius; i <= radius; i = i + 1) {
    let p = clamp(c + axis * i, vec2<i32>(0), dims - vec2<i32>(1));
    let q = textureLoad(tex, p, 0).r;
    if (q >= EMPTY_DEPTH) { continue; }
    let d = depthMetres(q);
    if (abs(d - centreD) > range) { continue; }
    let w = exp(-f32(i * i) / (2.0 * sigma * sigma));
    sum = sum + d * w;
    weight = weight + w;
  }
  let result = select(centreD, sum / weight, weight > 1e-5);
  textureStore(out, c, vec4<f32>(depthNorm(result)));
}

@compute @workgroup_size(8, 8)
fn horizontal(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(textureDimensions(src));
  let c = vec2<i32>(gid.xy);
  if (c.x >= dims.x || c.y >= dims.y) { return; }
  filterAxis(src, dst, c, vec2<i32>(1, 0));
}

@compute @workgroup_size(8, 8)
fn vertical(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(textureDimensions(src));
  let c = vec2<i32>(gid.xy);
  if (c.x >= dims.x || c.y >= dims.y) { return; }
  filterAxis(src, dst, c, vec2<i32>(0, 1));
}

/// Cleanup: 3x3 mean of the taps inside the narrow range, to remove the separable filter's
/// streaking on thin features.
@compute @workgroup_size(8, 8)
fn cleanup(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = vec2<i32>(textureDimensions(src));
  let c = vec2<i32>(gid.xy);
  if (c.x >= dims.x || c.y >= dims.y) { return; }
  let centre = textureLoad(src, c, 0).r;
  if (centre >= EMPTY_DEPTH) {
    textureStore(dst, c, vec4<f32>(EMPTY_DEPTH));
    return;
  }
  let centreD = depthMetres(centre);

  var sum = 0.0;
  var weight = 0.0;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let p = clamp(c + vec2<i32>(i, j), vec2<i32>(0), dims - vec2<i32>(1));
      let q = textureLoad(src, p, 0).r;
      if (q >= EMPTY_DEPTH) { continue; }
      if (abs(depthMetres(q) - centreD) > 0.05) { continue; }
      sum = sum + depthMetres(q);
      weight = weight + 1.0;
    }
  }
  let result = select(centreD, sum / weight, weight > 0.5);
  textureStore(dst, c, vec4<f32>(depthNorm(result)));
}
