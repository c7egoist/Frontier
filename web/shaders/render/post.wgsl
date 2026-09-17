// Final pass: exposure/tonemap, a cheap filmic curve, and the debug visualisations that make the
// simulation inspectable (height / normal / foam / velocity fields).

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"

@group(1) @binding(0) var sceneColor: texture_2d<f32>;
@group(1) @binding(1) var nearHeight: texture_2d<f32>;
@group(1) @binding(2) var farHeight: texture_2d<f32>;
@group(1) @binding(3) var fieldSampler: sampler;

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

struct Out {
  @location(0) color: vec4<f32>,
};

fn sampleField(world: vec2<f32>) -> vec4<f32> {
  let nearDims = vec2<f32>(textureDimensions(nearHeight));
  let nearUV = (world - P.nearHeightOrigin) / P.nearHeightSize;
  let inside = nearUV.x > 0.0 && nearUV.x < 1.0 && nearUV.y > 0.0 && nearUV.y < 1.0;
  if (inside) {
    return textureSampleLevel(nearHeight, fieldSampler, nearUV, 0.0);
  }
  let farUV = (world - P.farHeightOrigin) / P.farHeightSize;
  return textureSampleLevel(farHeight, fieldSampler, clamp(farUV, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0);
}

@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> Out {
  var out: Out;
  let uv = frag.xy / P.resolution;

  if (P.debugView > 0u) {
    // Reconstruct a world position a few metres in front of the camera and read the fields.
    let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
    let clip = vec4<f32>(ndc, 0.5, 1.0);
    let w = P.invViewProj * clip;
    let dir = normalize(w.xyz / w.w - P.cameraPos);
    let t = (P.seaLevel - P.cameraPos.y) / min(dir.y, -0.001);
    let world = P.cameraPos.xz + dir.xz * max(t, 0.0);
    let field = sampleField(world);

    var col = vec3<f32>(0.0);
    if (P.debugView == 1u) {
      col = vec3<f32>(field.r * 0.25 + 0.5);                       // elevation
    } else if (P.debugView == 2u) {
      let d = P.nearHeightSize.x / f32(textureDimensions(nearHeight).x) * 2.0;
      let hL = sampleField(world - vec2<f32>(d, 0.0)).r;
      let hR = sampleField(world + vec2<f32>(d, 0.0)).r;
      let hD = sampleField(world - vec2<f32>(0.0, d)).r;
      let hU = sampleField(world + vec2<f32>(0.0, d)).r;
      col = normalize(vec3<f32>(-(hR - hL), 2.0 * d, -(hU - hD))) * 0.5 + vec3<f32>(0.5);  // normals
    } else if (P.debugView == 3u) {
      col = vec3<f32>(field.g);                                    // whitecaps
    } else if (P.debugView == 4u) {
      col = vec3<f32>(length(field.ba) * 0.1);                     // surface speed
    } else {
      col = vec3<f32>(f32(P.sweCount % 65536u) / 65536.0, f32(P.mpmActiveTiles) / 64.0, f32(P.qualityLevel) / 8.0);
    }
    out.color = vec4<f32>(col, 1.0);
    return out;
  }

  let color = textureSampleLevel(sceneColor, fieldSampler, uv, 0.0).rgb;
  out.color = vec4<f32>(aces(color * 0.85), 1.0);
  return out;
}
