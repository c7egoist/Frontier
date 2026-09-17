// Shared world-space surface sampling + sky model.
//
// This file declares *no bindings on purpose*: the ocean mesh, the fluid composite and anything
// else that needs the sky or the height field passes the textures in as function arguments. That
// keeps every entry point free to lay out its own group(1) bindings (see the per-pass table in
// docs/DESIGN.md) and lets one module be included by several pipelines without clashing.
//
// The height fields hold (elevation, foam, velocity.xz) and are NOT filterable (r32float), so all
// sampling here is manual bilinear via textureLoad.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "common/accum.wgsl"

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

/// Analytic sky: an approximation of a Hosek/preetham-style gradient plus a sun disc and halo.
/// Being a function, it doubles as the reflection probe -- which is why this project ships no
/// cubemap asset and has no reflection-probe bake pass.
fn skyColor(dir: vec3<f32>, sunDir: vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.y, -1.0, 1.0);
  let horizon = pow(1.0 - clamp(abs(up), 0.0, 1.0), 3.0);
  let zenith = vec3<f32>(0.13, 0.28, 0.55);
  let hzColor = vec3<f32>(0.62, 0.72, 0.86);
  var col = mix(zenith, hzColor, horizon);
  let cosSun = clamp(dot(dir, sunDir), -1.0, 1.0);
  col = col + P.sunColor * P.sunIntensity * (pow(max(cosSun, 0.0), 900.0) * 6.0 + pow(max(cosSun, 0.0), 18.0) * 0.25);
  // The below-horizon hemisphere: the ocean shader paints it, the sky pass only needs haze.
  col = mix(vec3<f32>(0.05, 0.07, 0.09), col, smoothstep(-0.06, 0.06, up));
  return col;
}

// ---------------------------------------------------------------------------
// Height-field sampling
// ---------------------------------------------------------------------------

// `bilinearLoad` lives in common/accum.wgsl, next to the storage-texture variant, so the height
// fields have exactly one sampling convention (including the texel-centre offset).
/// Blended near/far surface state: (elevation m, whitecap 0..1, velocity.xz m/s).
/// `nearFieldFactor` (common/util.wgsl) is the single source of truth for the blend band, so the
/// ocean mesh, the far-field resolve and the CPU-side sampling all agree.
fn sampleSurface(nearTex: texture_2d<f32>, farTex: texture_2d<f32>, world: vec2<f32>) -> vec4<f32> {
  let near = bilinearLoad(nearTex, world, P.nearHeightOrigin, P.nearHeightSize);
  let far = bilinearLoad(farTex, world, P.farHeightOrigin, P.farHeightSize);
  return mix(far, near, nearFieldFactor(world));
}

/// Finite-difference normal of the elevation field with an explicit (distance-adaptive) baseline.
fn surfaceNormal(nearTex: texture_2d<f32>, farTex: texture_2d<f32>, world: vec2<f32>, step: f32) -> vec3<f32> {
  let hL = sampleSurface(nearTex, farTex, world - vec2<f32>(step, 0.0)).r;
  let hR = sampleSurface(nearTex, farTex, world + vec2<f32>(step, 0.0)).r;
  let hD = sampleSurface(nearTex, farTex, world - vec2<f32>(0.0, step)).r;
  let hU = sampleSurface(nearTex, farTex, world + vec2<f32>(0.0, step)).r;
  return normalize(vec3<f32>(-(hR - hL), 2.0 * step, -(hU - hD)));
}

/// Procedural sub-texel ripples. Below the height field's resolution the surface still has
/// capillary waves and they carry most of the sun glitter, so they are worth three fbm calls.
fn detailNormal(world: vec2<f32>, dist: f32) -> vec3<f32> {
  let scale = P.detailScale / max(1.0, 1.0 + dist * 0.002);
  let t = P.time * P.detailSpeed;
  let p = world * scale;
  let e = 0.35;
  let n0 = fbm2(p + vec2<f32>(t * 0.31, t * 0.17), 3);
  let nx = fbm2(p + vec2<f32>(e, 0.0) + vec2<f32>(t * 0.31, t * 0.17), 3);
  let nz = fbm2(p + vec2<f32>(0.0, e) + vec2<f32>(t * 0.31, t * 0.17), 3);
  let amp = P.detailAmp / (1.0 + dist * 0.004);
  return normalize(vec3<f32>(-(nx - n0) / e, 1.0, -(nz - n0) / e) * vec3<f32>(amp, 1.0, amp));
}

/// Water body colour: sunlight attenuated through the column plus the sub-surface return.
fn waterBody(world: vec2<f32>, elevation: f32, normal: vec3<f32>, view: vec3<f32>, sunDir: vec3<f32>) -> vec3<f32> {
  let depth = max(P.sweDepth, 0.5);
  let scatter = exp(-vec3<f32>(P.waterTint) * depth * (0.5 + 0.5 * max(sunDir.y, 0.0)));
  let sss = pow(clamp(dot(view, -sunDir) * 0.5 + 0.5, 0.0, 1.0), 3.0) * P.sssStrength;
  var body = vec3<f32>(0.02, 0.06, 0.09) * (1.0 - scatter) + vec3<f32>(0.05, 0.22, 0.24) * scatter;
  body = body + vec3<f32>(0.05, 0.30, 0.24) * sss * clamp(elevation, 0.0, 4.0) * 0.35;
  return body;
}

/// Sun specular for a water surface with Fresnel F0 = 0.02 (the standard two-lobe approximation
/// used for ocean rendering: a tight disc for glints plus a wide lobe for the sheen).
fn sunSpecular(normal: vec3<f32>, view: vec3<f32>, sunDir: vec3<f32>) -> f32 {
  let H = normalize(sunDir + view);
  let c = max(dot(normal, H), 0.0);
  return pow(c, 900.0) * 2.4 + pow(c, 60.0) * 0.12;
}

fn fresnelSchlick(cosTheta: f32, f0: f32) -> f32 {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}
