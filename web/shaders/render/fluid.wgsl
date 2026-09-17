// Screen-space fluid: the near-field 3D particles are splatted into depth + thickness, filtered,
// then shaded as water and composited over what the ocean mesh drew.
//
// Four things happen here, all of them screen space:
//   1. vsSplat + fsThickness -- every particle draws a camera-facing disc of
//      `particleRadius * P.fluidParticleRadius` and adds its chord length to a thickness target
//      (red), weighted by speed (green) and coverage (blue). Additive, no depth test: a cluster of
//      spheres must read as thick, not as its front-most member.
//   2. vsSplat + fsSurface   -- the same discs write the nearest front-surface depth, resolved by
//      a real depth attachment, both to the depth attachment and to the colour target that
//      render/nrf.wgsl filters.
//   3. nrf (separate module) -- blurs the depth field while keeping splash silhouettes.
//   4. fsShade               -- reconstructs world position from the filtered depth, takes the
//      normal from its gradient, and shades: refracted scene colour absorbed through the thickness,
//      sky reflection by Fresnel, sun specular, and foam where the particles were fast.
//
// Why this exists at all: a real particle solver produces splash detail that no height field can
// hold (overhangs, spray sheets, free-flying water). Rendering those as spheres is cheap, and the
// narrow-range filter is what turns the sphere pile back into a surface.
//
// Depth convention, shared with render/nrf.wgsl: `particleDepth` holds normalized *linear* depth
// q = (d - near) / (far - near) in [0, 1], with 1.0 meaning "no fluid". Exactly the same q is
// written to the depth attachment, so the filtered value and the hardware test never disagree.
// Thickness is in metres.

#pragma once

#include "common/globals.wgsl"
#include "common/util.wgsl"
#include "render/surface_field.wgsl"

/// Exactly the MPM particle layout (mpm/mpm.wgsl): the renderer reads the simulation's buffer
/// directly, so there is no per-frame copy of 140k particles.
struct FluidParticle {
  /// world position (m); w = 1 when the slot is alive
  position: vec4<f32>,
  /// world velocity (m/s); w = det(F)
  velocity: vec4<f32>,
};

@group(1) @binding(0) var<storage, read> particles: array<FluidParticle>;
@group(1) @binding(1) var sceneColor: texture_2d<f32>;
@group(1) @binding(2) var sceneDepth: texture_depth_2d;
@group(1) @binding(3) var particleDepth: texture_2d<f32>;
@group(1) @binding(4) var particleThickness: texture_2d<f32>;
@group(1) @binding(5) var linearSampler: sampler;
@group(1) @binding(6) var filteredDepth: texture_2d<f32>;

const EMPTY_DEPTH: f32 = 1.0;

fn depthMetres(q: f32) -> f32 {
  return P.nearPlane + q * (P.farPlane - P.nearPlane);
}

fn depthNorm(d: f32) -> f32 {
  return clamp((d - P.nearPlane) / max(P.farPlane - P.nearPlane, 1e-3), 0.0, 1.0);
}

/// Inverse of depthNorm for the hardware depth buffer: the projection maps view depth d to
/// ndc.z = far * (d - near) / (d * (far - near)).
fn sceneDepthMetres(z: f32) -> f32 {
  return (P.nearPlane * P.farPlane) / max(P.farPlane - z * (P.farPlane - P.nearPlane), 1e-4);
}

/// NDC z that the projection would produce for a normalized linear depth.
fn ndcZFromNorm(q: f32) -> f32 {
  let d = max(depthMetres(q), 1e-3);
  return P.farPlane * q / d;
}

// ---------------------------------------------------------------------------
// Splat
// ---------------------------------------------------------------------------

struct SplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) viewCentre: vec3<f32>,
  @location(1) disc: vec2<f32>,   // view-space offset of this quad corner from the centre
  @location(2) radius: f32,
  @location(3) speed: f32,
  @location(4) alive: f32,
};

/// Unit quad: (-1,-1), (1,-1), (-1,1), (1,1).
@vertex
fn vsSplat(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> SplatOut {
  var out: SplatOut;
  let p = particles[iid];
  let corner = vec2<f32>(f32(vid & 1u) * 2.0 - 1.0, f32((vid >> 1u) & 1u) * 2.0 - 1.0);
  let radius = P.fluidParticleRadius;
  let view = (P.view * vec4<f32>(p.position.xyz, 1.0)).xyz;
  let speed = length(p.velocity.xyz);

  // The disc lives in the view plane, which is the cheapest splat that still covers the projected
  // sphere; the radius is scaled so the *visible* silhouette matches.
  let centre = vec4<f32>(view + vec3<f32>(corner * radius, 0.0), 1.0);
  let inRange = centre.z > -P.farPlane && centre.z < -P.nearPlane;

  out.viewCentre = view;
  out.disc = corner * radius;
  out.radius = radius;
  out.speed = speed;
  out.alive = select(0.0, 1.0, p.position.w > 0.5 && radius > 1e-4 && inRange);
  out.pos = P.viewProj * centre;
  // Dead slots are collapsed to a single point behind the far plane: no rasterisation, no fragment
  // work, and no branch in the fragment stage for the common case.
  if (out.alive < 0.5) {
    out.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
  }
  return out;
}

struct ThicknessOut {
  @location(0) thickness: vec4<f32>,
};

/// Additive thickness: the chord length through the sphere footprint, weighted by speed for the
/// foam term and counted for coverage. Blended with `one / one`.
@fragment
fn fsThickness(in: SplatOut) -> ThicknessOut {
  var out: ThicknessOut;
  if (in.alive < 0.5) { discard; }
  let d2 = dot(in.disc, in.disc);
  let r2 = in.radius * in.radius;
  if (d2 >= r2) { discard; }
  let chord = 2.0 * sqrt(max(r2 - d2, 0.0));
  out.thickness = vec4<f32>(chord, chord * in.speed, 1.0, 0.0);
  return out;
}

struct SurfaceOut {
  /// Same value twice: the depth attachment resolves visibility, the colour target is what the
  /// narrow-range filter reads.
  @builtin(frag_depth) depth: f32,
  @location(0) linearNorm: f32,
};

/// Nearest front surface of the sphere, in normalized linear depth.
@fragment
fn fsSurface(in: SplatOut) -> SurfaceOut {
  var out: SurfaceOut;
  if (in.alive < 0.5) { discard; }
  let d2 = dot(in.disc, in.disc);
  let r2 = in.radius * in.radius;
  if (d2 >= r2) { discard; }
  let back = sqrt(max(r2 - d2, 0.0));
  let linear = max(-(in.viewCentre.z + back), P.nearPlane);
  let q = depthNorm(linear);
  out.depth = q;
  out.linearNorm = q;
  return out;
}

// ---------------------------------------------------------------------------
// Shade
// ---------------------------------------------------------------------------

struct ShadeOut {
  @location(0) color: vec4<f32>,   // premultiplied, blended with `one / one-minus-src-alpha`
};

@vertex
fn vsFull(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(p[vid], 0.0, 1.0);
}

/// World position of a pixel of the filtered depth field (1.0 = no fluid, caller must check).
fn worldAt(px: vec2<i32>) -> vec3<f32> {
  let dims = vec2<f32>(textureDimensions(filteredDepth));
  let ndc = vec2<f32>(f32(px.x) / dims.x * 2.0 - 1.0, 1.0 - f32(px.y) / dims.y * 2.0);
  let q = textureLoad(filteredDepth, px, 0).r;
  let clip = vec4<f32>(ndc, ndcZFromNorm(q), 1.0);
  let world = P.invViewProj * clip;
  return world.xyz / world.w;
}

@fragment
fn fsShade(@builtin(position) frag: vec4<f32>) -> ShadeOut {
  var out: ShadeOut;
  let px = vec2<i32>(frag.xy);
  let q = textureLoad(filteredDepth, px, 0).r;
  if (q >= EMPTY_DEPTH) {
    out.color = vec4<f32>(0.0);
    return out;
  }

  let fluidDepth = depthMetres(q);
  let world = worldAt(px);

  // Scene occlusion: a splash behind a wave crest must stay hidden behind it.
  let sceneZ = textureLoad(sceneDepth, px, 0);
  if (sceneDepthMetres(sceneZ) < fluidDepth - 0.02) {
    out.color = vec4<f32>(0.0);
    return out;
  }

  // Normal from the gradient of the filtered depth (2-tap central differences, in world space).
  // cross(dz, dx) points up for a height field in a y-up world.
  let dx = worldAt(px + vec2<i32>(2, 0)) - worldAt(px - vec2<i32>(2, 0));
  let dz = worldAt(px + vec2<i32>(0, 2)) - worldAt(px - vec2<i32>(0, 2));
  let n = safeNormalize3(cross(dz, dx));

  let thickness = textureLoad(particleThickness, px, 0);
  let thick = max(thickness.r, 0.0);
  let thick01 = 1.0 - exp(-thick * P.fluidThicknessScale);
  let speedAvg = thickness.g / max(thick, 1e-3);

  let view = safeNormalize3(P.cameraPos - world);
  let sunDir = safeNormalize3(P.sunDir);
  let fres = fresnelSchlick(max(dot(n, view), 0.0), 0.02);

  // Refracted background: offset the screen UV along the normal, scaled by the thickness so thin
  // sheets barely distort.
  let uv = frag.xy / vec2<f32>(P.resolution);
  let refractUv = clamp(uv + n.xz * P.fluidRefraction * (0.35 + 0.65 * thick01), vec2<f32>(0.001), vec2<f32>(0.999));
  let behind = textureSampleLevel(sceneColor, linearSampler, refractUv, 0.0).rgb;
  let absorb = exp(-vec3<f32>(P.waterTint) * thick * max(P.fluidAbsorb, 0.01));
  let scattered = waterBody(world.xz, 0.0, n, view, sunDir) * (1.0 - absorb);
  let transmitted = behind * absorb + scattered;

  let reflected = skyColor(reflect(-view, n), sunDir);
  let spec = sunSpecular(n, view, sunDir) * P.fluidSpecular;
  var color = mix(transmitted, reflected, fres) + P.sunColor * P.sunIntensity * spec;

  // Foam: fast particles read as whitecaps, with the same noise treatment the mesh foam uses.
  let foamDrive = clamp((speedAvg - P.fluidFoamSpeed) / max(P.fluidFoamSpeed, 0.5), 0.0, 1.0) * P.fluidFoam;
  let foamNoise = smoothstep(0.3, 0.7, fbm2(world.xz * 0.6 + vec2<f32>(P.time * 0.2, 0.0), 3) * 0.5 + 0.5);
  let foamMask = clamp(foamDrive * (0.45 + 0.75 * foamNoise), 0.0, 1.0);
  if (foamMask > 0.001) {
    let foamColor = vec3<f32>(0.94, 0.96, 0.98) * (0.4 + 0.6 * max(dot(n, sunDir), 0.0)) * P.foamBrightness;
    color = mix(color, foamColor, foamMask);
  }

  let alpha = clamp(thick01 + fres * 0.85, 0.0, 1.0);
  out.color = vec4<f32>(color * alpha * P.exposure, alpha);
  return out;
}
