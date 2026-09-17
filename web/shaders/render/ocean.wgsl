// Ocean surface: procedural clipmap-ish mesh (two grids sharing one index buffer, driven by
// overrides), displaced by the particle-derived height field, shaded with an analytic sky.
//
// The near grid is displaced (waves are real geometry, which is what makes silhouettes and
// fresnel/refraction believable up close); the far grid is flat and shaded purely from the height
// field's normals with the displacement faded out, because at kilometres the swell is sub-pixel
// and displacing a coarse mesh would only alias.
//
// Normals come from finite differences whose step grows with distance. That is a cheap
// stand-in for a mip chain: it band-limits the wave field exactly when the screen footprint of a
// texel exceeds a pixel, which is what a mip-selected normal would do.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "render/surface_field.wgsl"

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) world: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) screen: vec2<f32>,
};

struct FsOut {
  @location(0) color: vec4<f32>,
};

@group(1) @binding(0) var nearHeight: texture_2d<f32>;
@group(1) @binding(1) var farHeight: texture_2d<f32>;
@group(1) @binding(2) var surfaceSampler: sampler;

override gridDim: u32 = 256u;
override halfExtent: f32 = 512.0;
override displaced: bool = true;
override displacementFade: f32 = 0.75;

/// The two height fields this pass was given, bound once so the field helpers stay generic.
fn surfaceAt(world: vec2<f32>) -> vec4<f32> {
  return sampleSurface(nearHeight, farHeight, world);
}

// ---------------------------------------------------------------------------
// Vertex
// ---------------------------------------------------------------------------
@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VsOut {
  var out: VsOut;
  let w = gridDim;
  let ix = vid % w;
  let iz = vid / w;
  let uv = vec2<f32>(f32(ix), f32(iz)) / f32(w - 1u);

  // Camera-following, snapped to the mesh spacing so vertices never swim.
  let centre = P.nearHeightOrigin + 0.5 * P.nearHeightSize;
  let spacing = 2.0 * halfExtent / f32(w - 1u);
  let originX = floor((centre.x - halfExtent) / spacing) * spacing;
  let originZ = floor((centre.y - halfExtent) / spacing) * spacing;
  let world = vec2<f32>(originX + f32(ix) * spacing, originZ + f32(iz) * spacing);

  let surf = surfaceAt(world);
  var y = P.seaLevel;
  if (displaced) {
    let r = length(world - centre) / halfExtent;
    let fade = 1.0 - smoothstep(displacementFade, 1.0, r);
    y = P.seaLevel + surf.r * fade;
  }

  let world3 = vec3<f32>(world.x, y, world.y);
  out.pos = P.viewProj * vec4<f32>(world3, 1.0);
  out.world = world3;
  out.uv = uv;
  out.screen = out.pos.xy / max(out.pos.w, 1e-4);
  return out;
}

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------
@fragment
fn fs(in: VsOut) -> FsOut {
  var out: FsOut;
  let world = in.world.xz;
  let dist = length(in.world - P.cameraPos);

  let surf = surfaceAt(world);

  // Distance-adaptive normal step: the finite-difference baseline grows with distance so the
  // normal is band-limited instead of aliasing (cheap substitute for a mip chain).
  let texel = P.nearHeightSize.x / f32(textureDimensions(nearHeight).x);
  let baseStep = texel * 1.5;
  let step = max(baseStep, dist * 0.0018);
  let n = normalize(surfaceNormal(nearHeight, farHeight, world, step) + detailNormal(world, dist) - vec3<f32>(0.0, 1.0, 0.0));
  let view = normalize(P.cameraPos - in.world);

  let sunDir = normalize(P.sunDir);
  let sky = skyColor(reflect(-view, n), sunDir);

  let fres = fresnelSchlick(dot(n, view), 0.02);
  let spec = sunSpecular(n, view, sunDir);
  // Sunlight attenuated through the column + the greenish sub-surface return that makes wave
  // backs glow.
  let body = waterBody(world, surf.r, n, view, sunDir);

  // Whitecaps come straight out of the solver's breaking metric.
  let foam = clamp(surf.g * P.foamStrength, 0.0, 1.0);
  let foamNoise = smoothstep(0.25, 0.75, fbm2(world * 0.35 + vec2<f32>(P.time * 0.05, 0.0), 3) * 0.5 + 0.5);
  let foamMask = clamp(foam * (0.55 + 0.65 * foamNoise), 0.0, 1.0);
  let foamColor = vec3<f32>(0.92, 0.95, 0.97) * (0.35 + 0.65 * max(dot(n, sunDir), 0.0)) * P.foamBrightness;

  var color = mix(body, sky, fres) + P.sunColor * P.sunIntensity * spec * (1.0 - foamMask * 0.7);
  if (foamMask > 0.001) {
    color = mix(color, foamColor, foamMask);
  }

  // Haze: the far field is mostly reflection and atmospheric scattering, so a distance fog that
  // converges to the sky colour is both correct-looking and cheap.
  let fog = expFog(dist, P.fogDensity * (1.0 + 30.0 * P.fogDensity));
  let hazeDir = normalize(vec3<f32>(in.world.x - P.cameraPos.x, 0.06, in.world.z - P.cameraPos.z));
  color = mix(color, skyColor(hazeDir, sunDir), fog);

  out.color = vec4<f32>(color * P.exposure, 1.0);
  return out;
}

// ---------------------------------------------------------------------------
// Background: a full-screen pass that paints the sky (and the far ocean haze) so the mesh never
// has to cover the whole horizon.
// ---------------------------------------------------------------------------
@vertex
fn skyVs(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(p[vid], 0.0, 1.0);
}

@fragment
fn skyFs(@builtin(position) fragCoord: vec4<f32>) -> FsOut {
  var out: FsOut;
  let ndc = vec2<f32>(fragCoord.x / P.resolution.x * 2.0 - 1.0, 1.0 - fragCoord.y / P.resolution.y * 2.0);
  let clip = vec4<f32>(ndc, 1.0, 1.0);
  let world = P.invViewProj * clip;
  let dir = normalize(world.xyz / world.w - P.cameraPos);
  var col = skyColor(dir, normalize(P.sunDir));
  // Below the horizon the far ocean continues as haze so there is no visible plane edge.
  let below = clamp(-dir.y * 8.0, 0.0, 1.0);
  col = mix(col, vec3<f32>(0.16, 0.24, 0.30) * P.sunIntensity, below);
  out.color = vec4<f32>(col * P.exposure, 1.0);
  return out;
}
