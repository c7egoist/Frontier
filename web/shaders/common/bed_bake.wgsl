// Bakes the procedural bathymetry into a filterable texture once (and again only when the camera
// travels far enough that the world-mapped texture no longer covers the simulation domain).
// Sampling a texture is ~10x cheaper than evaluating 4 octaves of fbm per particle per substep.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"

@group(1) @binding(0) var bedOut: texture_storage_2d<r16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(bedOut);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(dims);
  let world = P.bedOrigin + (uv - vec2<f32>(0.5)) * (2.0 * P.bedWorldHalf);
  let depth = bedDepthAt(world);
  textureStore(bedOut, vec2<i32>(gid.xy), vec4<f32>(depth, 0.0, 0.0, 1.0));
}
