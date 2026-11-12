//==========================================================================================================================================
//                                                    GTXWORLDVIEWPORT.JSX
//==========================================================================================================================================
// Live WebGL2 Tier 1 GTX World Viewport (Zero RT Hardware):
//   Pass 1: Analytical GTX World Render (Smooth Ray-Primitive Contact-Hardening Solar Shadows, Analytical Cone GI/AO with zero SDF rings,
//           Clipped-Horizon LTC Softbox, 20-Channel OpenPBR Material Atlas, 2-Layer Abbe Dispersive Glass) -> Offscreen RGBA8 + EntityID
//   Pass 2: Screen-Space 2px Anti-Aliased Silhouette Selection Outline (#F5C469)
//   Pass 3: 1:1 C++ Slate 13-Handle TransformGizmo (GizmoPRO) with Hover Highlight, Skew-Line/Plane/Arc Dragging, Ctrl-Snap & HUD Readout

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CanonicalEditorCamera,
  CompileLiveGtxScene,
  ComputeCameraRayAtUv,
  NormalizeVec3,
  PickSceneEntityAtUv,
  RowEffectivelyVisible,
} from "./ShowcaseGalleryScene.js";

export { RowEffectivelyVisible as PreviewVisible };
import {
  ATLAS_COLS,
  ATLAS_HEIGHT,
  ATLAS_ROWS,
  ATLAS_TILE_SIZE,
  ATLAS_WIDTH,
  EnsureMaterialTexturesDecoded,
  MaterialAtlasSynchronizer,
  TILES_PER_PRIM,
} from "./MaterialAtlasCompiler.js";
import {
  BeginGizmoDrag,
  BuildColumnMajorViewProj,
  BuildSlateGizmoGeometry,
  ComputeGizmoWorldRadius,
  GIZMO_FRAGMENT_SHADER,
  GIZMO_HANDLE_LABELS,
  GIZMO_VERTEX_SHADER,
  GizmoHandle,
  PickGizmoHandle,
  SolveGizmoDrag,
} from "./TransformGizmo3D.js";

const MAX_PRIMS = 24;
const MAX_LIGHTS = 4;

const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 pos = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

//==========================================================================================================================================
// PASS 1: TIER 1 GTX WORLD FRAGMENT SHADER (ZERO SDF RINGS + FULL 20-CHANNEL OPENPBR MATERIAL ATLAS)
//==========================================================================================================================================
export const GTX_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform vec3  uCamOrigin;
uniform vec3  uCamForward;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform float uTanHalfFov;
uniform float uOrthoHalfHeight;
uniform float uExposureGain;
uniform int   uViewMode;       // 0 = Lit GTX, 1 = Clay, 2 = Normals, 3 = Wireframe
uniform int   uShowGrid;
uniform int   uSelectedEntityCode;

uniform vec3  uSunDir;
uniform vec3  uSunIrradiance;
uniform float uSunAngularRadius;
uniform vec3  uSkyRadiance;

uniform int   uLightCount;
uniform vec4  uLightCenterHalfW[${MAX_LIGHTS}];
uniform vec4  uLightHalfHRad[${MAX_LIGHTS}];

uniform int   uPrimCount;
uniform vec4  uPrimPosShape[${MAX_PRIMS}];   // xyz = center, w = shape (0 box, 1 sphere, 2 cyl, 3 cone, 4 torus)
uniform vec4  uPrimHalfFlags[${MAX_PRIMS}];  // xyz = halfExtents, w = bitmask (1=shadow, 2=gi, 4=glassShell)
uniform vec4  uPrimRotAbbe[${MAX_PRIMS}];    // xyz = euler rad, w = abbeNumber
uniform vec4  uPrimEdgeTint[${MAX_PRIMS}];   // rgb = F82 edge tint, w = base transmission
uniform sampler2D uMaterialAtlas;

const float PI = 3.14159265359;
const float ATLAS_W = ${ATLAS_WIDTH}.0;
const float ATLAS_H = ${ATLAS_HEIGHT}.0;
const float TILE_PX = ${ATLAS_TILE_SIZE}.0;

bool PrimFlagShadow(int i) { int f = int(uPrimHalfFlags[i].w + 0.5); return (f & 1) != 0; }
bool PrimFlagGi(int i)     { int f = int(uPrimHalfFlags[i].w + 0.5); return (f & 2) != 0; }
bool PrimFlagGlass(int i)  { int f = int(uPrimHalfFlags[i].w + 0.5); return (f & 4) != 0; }

vec3 invRotateEuler(vec3 v, vec3 r) {
  if (dot(r, r) < 1e-8) return v;
  vec3 c = cos(r), s = sin(r);
  vec3 z = vec3( c.z * v.x + s.z * v.y, -s.z * v.x + c.z * v.y, v.z);
  vec3 y = vec3( c.y * z.x - s.y * z.z,  z.y, s.y * z.x + c.y * z.z);
  return   vec3( y.x, c.x * y.y + s.x * y.z, -s.x * y.y + c.x * y.z);
}

vec3 fwdRotateEuler(vec3 v, vec3 r) {
  if (dot(r, r) < 1e-8) return v;
  vec3 c = cos(r), s = sin(r);
  vec3 x = vec3(v.x, c.x * v.y - s.x * v.z, s.x * v.y + c.x * v.z);
  vec3 y = vec3(c.y * x.x + s.y * x.z, x.y, -s.y * x.x + c.y * x.z);
  return   vec3(c.z * y.x - s.z * y.y, s.z * y.x + c.z * y.y, y.z);
}

struct HitInfo {
  bool  hit;
  float t;
  vec3  pos;
  vec3  normal;
  vec3  tangent;
  vec2  uv;
  int   primIdx;
};

struct SampledMaterial {
  vec3  baseColor;
  float opacity;
  float metallic;
  float roughness;
  float diffuseRoughness;
  float ior;
  float ao;
  vec3  normalTs;
  float anisotropy;
  float anisoRotation;
  float coat;
  float coatRoughness;
  vec3  coatNormalTs;
  vec3  sheenColor;
  float sheenRoughness;
  vec3  subsurfaceColor;
  float thickness;
  float transmission;
  float emission;
  bool  unlit;
};

vec4 sampleAtlasSlot(int primIdx, int slot, vec2 uv) {
  int tileIdx = primIdx * ${TILES_PER_PRIM} + slot;
  int col = tileIdx % ${ATLAS_COLS};
  int row = tileIdx / ${ATLAS_COLS};
  vec2 clampedUv = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 px = vec2(float(col), float(row)) * TILE_PX + vec2(1.0) + clampedUv * (TILE_PX - 2.0);
  return textureLod(uMaterialAtlas, px / vec2(ATLAS_W, ATLAS_H), 0.0);
}

SampledMaterial fetchMaterial(int primIdx, vec2 uv) {
  vec4 s0 = sampleAtlasSlot(primIdx, 0, uv);
  vec4 s1 = sampleAtlasSlot(primIdx, 1, uv);
  vec4 s2 = sampleAtlasSlot(primIdx, 2, uv);
  vec4 s3 = sampleAtlasSlot(primIdx, 3, uv);
  vec4 s4 = sampleAtlasSlot(primIdx, 4, uv);
  vec4 s5 = sampleAtlasSlot(primIdx, 5, uv);
  vec4 s6 = sampleAtlasSlot(primIdx, 6, uv);
  vec4 s7 = sampleAtlasSlot(primIdx, 7, uv);

  SampledMaterial m;
  m.baseColor        = s0.rgb;
  m.opacity          = s0.a;
  m.metallic         = s1.r;
  m.roughness        = max(0.025, s1.g);
  m.ior              = 1.0 + s1.b * 1.5;
  m.ao               = s1.a;
  m.normalTs         = normalize(s2.rgb * 2.0 - 1.0);
  m.anisotropy       = s3.r * 2.0 - 1.0;
  m.anisoRotation    = s3.g * (2.0 * PI);
  m.coat             = s3.b;
  m.coatRoughness    = max(0.025, s3.a);
  m.sheenColor       = s4.rgb;
  m.sheenRoughness   = max(0.04, s4.a);
  m.subsurfaceColor  = s5.rgb;
  m.thickness        = s5.a * 2.0;
  m.coatNormalTs     = normalize(s6.rgb * 2.0 - 1.0);
  m.transmission     = s6.a;
  m.emission         = s7.r * 20.0;
  m.unlit            = s7.g > 0.5;
  m.diffuseRoughness = s7.b;
  return m;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCylinderZ(vec3 p, float r, float hz) {
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, hz);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdConeZ(vec3 p, float r, float hz) {
  vec2 q = vec2(r, -2.0 * hz);
  vec2 w = vec2(length(p.xy), p.z - hz);
  vec2 a = w - q * clamp(dot(w, q) / dot(q, q), 0.0, 1.0);
  vec2 b = w - q * vec2(clamp(w.x / max(q.x, 1e-4), 0.0, 1.0), 1.0);
  float k = sign(q.y);
  float d = min(dot(a, a), dot(b, b));
  float s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
  return sqrt(d) * sign(s);
}

float sdTorusZ(vec3 p, float majorR, float minorR) {
  vec2 q = vec2(length(p.xy) - majorR, p.z);
  return length(q) - minorR;
}

float sdPrimitiveLocal(vec3 lp, int shape, vec3 h) {
  if (shape == 1) {
    float rMean = (h.x + h.y + h.z) * 0.3333333;
    return (length(lp / h) - 1.0) * rMean;
  }
  if (shape == 2) return sdCylinderZ(lp, max(h.x, h.y), h.z);
  if (shape == 3) return sdConeZ(lp, max(h.x, h.y), h.z);
  if (shape == 4) return sdTorusZ(lp, max(h.x, h.y) * 0.68, max(0.04, h.z * 0.55));
  return sdBox(lp, h);
}

void computeBoxUvAndTangent(vec3 lp, vec3 h, vec3 ln, out vec2 uv, out vec3 lt) {
  vec3 safeH = max(h, vec3(1e-4));
  vec3 n01 = clamp((lp / safeH) * 0.5 + 0.5, vec3(0.0), vec3(1.0));
  vec3 an = abs(ln);
  if (an.x >= an.y && an.x >= an.z) {
    uv = vec2(ln.x > 0.0 ? n01.y : 1.0 - n01.y, n01.z);
    lt = vec3(0.0, ln.x > 0.0 ? 1.0 : -1.0, 0.0);
  } else if (an.y >= an.x && an.y >= an.z) {
    uv = vec2(ln.y > 0.0 ? 1.0 - n01.x : n01.x, n01.z);
    lt = vec3(ln.y > 0.0 ? -1.0 : 1.0, 0.0, 0.0);
  } else {
    uv = vec2(n01.x, ln.z > 0.0 ? n01.y : 1.0 - n01.y);
    lt = vec3(1.0, 0.0, 0.0);
  }
}

void computeCurvedUvAndTangent(vec3 lp, vec3 h, vec3 ln, int shape, out vec2 uv, out vec3 lt) {
  float phi = atan(lp.y, lp.x);
  float u = fract(phi / (2.0 * PI) + 0.5);
  lt = length(lp.xy) > 1e-4 ? normalize(vec3(-lp.y, lp.x, 0.0)) : vec3(1.0, 0.0, 0.0);
  if (shape == 1) {
    float nz = clamp(lp.z / max(h.z, 1e-4), -1.0, 1.0);
    float v = 1.0 - acos(nz) / PI;
    uv = vec2(u, clamp(v, 0.0, 1.0));
  } else if (shape == 4) {
    float majorR = max(h.x, h.y) * 0.68;
    float pol = atan(lp.z, length(lp.xy) - majorR);
    uv = vec2(u, fract(pol / (2.0 * PI) + 0.5));
  } else {
    uv = vec2(u, clamp((lp.z / max(h.z, 1e-4)) * 0.5 + 0.5, 0.0, 1.0));
  }
}

HitInfo intersectPrimitive(vec3 ro, vec3 rd, int idx, float tMax, bool backface) {
  HitInfo info;
  info.hit = false;
  info.t = tMax;
  info.primIdx = idx;
  info.uv = vec2(0.5);
  info.tangent = vec3(1.0, 0.0, 0.0);

  vec3 center = uPrimPosShape[idx].xyz;
  int  shape  = int(uPrimPosShape[idx].w + 0.5);
  vec3 h      = uPrimHalfFlags[idx].xyz;
  vec3 rot    = uPrimRotAbbe[idx].xyz;

  vec3 lo = invRotateEuler(ro - center, rot);
  vec3 ld = invRotateEuler(rd, rot);

  if (shape == 1) {
    vec3 o = lo / h;
    vec3 d = ld / h;
    float a = dot(d, d);
    float b = dot(o, d);
    float c = dot(o, o) - 1.0;
    float disc = b * b - a * c;
    if (disc < 0.0) return info;
    float sq = sqrt(disc);
    float tCand = backface ? (-b + sq) / a : (-b - sq) / a;
    if (!backface && tCand < 0.0015) tCand = (-b + sq) / a;
    if (tCand > 0.0015 && tCand < tMax) {
      vec3 lp = lo + ld * tCand;
      vec3 ln = normalize(lp / (h * h));
      vec2 uv;
      vec3 lt;
      computeCurvedUvAndTangent(lp, h, ln, 1, uv, lt);
      info.hit = true;
      info.t = tCand;
      info.pos = ro + rd * tCand;
      info.normal = normalize(fwdRotateEuler(backface ? -ln : ln, rot));
      info.tangent = normalize(fwdRotateEuler(lt, rot));
      info.uv = uv;
    }
    return info;
  }

  if (shape == 0) {
    vec3 safeSign = mix(vec3(-1.0), vec3(1.0), greaterThanEqual(ld, vec3(0.0)));
    vec3 invD = 1.0 / ( safeSign * max(abs(ld), vec3(1e-6)) );
    vec3 t0 = (-h - lo) * invD;
    vec3 t1 = ( h - lo) * invD;
    vec3 tSmaller = min(t0, t1);
    vec3 tBigger  = max(t0, t1);
    float tNear = max(max(tSmaller.x, tSmaller.y), tSmaller.z);
    float tFar  = min(min(tBigger.x, tBigger.y), tBigger.z);
    if (tNear > tFar || tFar < 0.0015) return info;
    float tCand = backface ? tFar : (tNear > 0.0015 ? tNear : tFar);
    if (tCand > 0.0015 && tCand < tMax) {
      vec3 lp = lo + ld * tCand;
      vec3 d = abs(lp) - h;
      vec3 ln = vec3(0.0);
      if (d.x >= d.y && d.x >= d.z) ln = vec3(lp.x >= 0.0 ? 1.0 : -1.0, 0.0, 0.0);
      else if (d.y >= d.x && d.y >= d.z) ln = vec3(0.0, lp.y >= 0.0 ? 1.0 : -1.0, 0.0);
      else ln = vec3(0.0, 0.0, lp.z >= 0.0 ? 1.0 : -1.0);
      vec2 uv;
      vec3 lt;
      computeBoxUvAndTangent(lp, h, ln, uv, lt);
      info.hit = true;
      info.t = tCand;
      info.pos = ro + rd * tCand;
      info.normal = normalize(fwdRotateEuler(backface ? -ln : ln, rot));
      info.tangent = normalize(fwdRotateEuler(lt, rot));
      info.uv = uv;
    }
    return info;
  }

  // Cylinder / Cone / Torus: local bounding slab + exact SDF refinement
  vec3 bound = (shape == 4) ? vec3(max(h.x, h.y) * 1.25, max(h.x, h.y) * 1.25, h.z * 1.25) : h * 1.08;
  vec3 safeSign = mix(vec3(-1.0), vec3(1.0), greaterThanEqual(ld, vec3(0.0)));
  vec3 invD = 1.0 / ( safeSign * max(abs(ld), vec3(1e-6)) );
  vec3 t0 = (-bound - lo) * invD;
  vec3 t1 = ( bound - lo) * invD;
  float tNear = max(0.002, max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z)));
  float tFar  = min(tMax, min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z)));
  if (tNear > tFar) return info;

  float t = tNear;
  for (int s = 0; s < 36; ++s) {
    vec3 lp = lo + ld * t;
    float d = sdPrimitiveLocal(lp, shape, h) * (backface ? -1.0 : 1.0);
    if (abs(d) < 0.0008) {
      vec2 e = vec2(0.0015, -0.0015);
      vec3 ln = normalize(
        e.xyy * sdPrimitiveLocal(lp + e.xyy, shape, h) +
        e.yyx * sdPrimitiveLocal(lp + e.yyx, shape, h) +
        e.yxy * sdPrimitiveLocal(lp + e.yxy, shape, h) +
        e.xxx * sdPrimitiveLocal(lp + e.xxx, shape, h)
      );
      vec2 uv;
      vec3 lt;
      computeCurvedUvAndTangent(lp, h, ln, shape, uv, lt);
      info.hit = true;
      info.t = t;
      info.pos = ro + rd * t;
      info.normal = normalize(fwdRotateEuler(backface ? -ln : ln, rot));
      info.tangent = normalize(fwdRotateEuler(lt, rot));
      info.uv = uv;
      return info;
    }
    t += max(0.002, abs(d));
    if (t > tFar) break;
  }
  return info;
}

HitInfo traceOpaqueSceneIgnoring(vec3 ro, vec3 rd, float tMax, int ignoreIdx) {
  HitInfo best;
  best.hit = false;
  best.t = tMax;
  best.primIdx = -1;
  best.uv = vec2(0.5);
  best.tangent = vec3(1.0, 0.0, 0.0);
  for (int i = 0; i < ${MAX_PRIMS}; ++i) {
    if (i >= uPrimCount) break;
    if (i == ignoreIdx || PrimFlagGlass(i)) continue;
    HitInfo cand = intersectPrimitive(ro, rd, i, best.t, false);
    if (cand.hit) best = cand;
  }
  return best;
}

HitInfo traceFullScene(vec3 ro, vec3 rd, float tMax) {
  HitInfo best;
  best.hit = false;
  best.t = tMax;
  best.primIdx = -1;
  best.uv = vec2(0.5);
  best.tangent = vec3(1.0, 0.0, 0.0);
  for (int i = 0; i < ${MAX_PRIMS}; ++i) {
    if (i >= uPrimCount) break;
    HitInfo cand = intersectPrimitive(ro, rd, i, best.t, false);
    if (cand.hit) best = cand;
  }
  return best;
}

float traceLightQuad(vec3 ro, vec3 rd, float tMax, out vec3 emitOut, out int hitLightIdx) {
  float best = tMax;
  emitOut = vec3(0.0);
  hitLightIdx = -1;
  if (abs(rd.z) < 1e-5) return best;
  for (int i = 0; i < ${MAX_LIGHTS}; ++i) {
    if (i >= uLightCount) break;
    vec3 lc = uLightCenterHalfW[i].xyz;
    float hw = uLightCenterHalfW[i].w;
    float hh = uLightHalfHRad[i].x;
    float t = (lc.z - ro.z) / rd.z;
    if (t > 0.01 && t < best) {
      vec3 hp = ro + rd * t;
      if (abs(hp.x - lc.x) <= hw && abs(hp.y - lc.y) <= hh) {
        best = t;
        emitOut = (rd.z > 0.0) ? uLightHalfHRad[i].yzw : uLightHalfHRad[i].yzw * 0.14;
        hitLightIdx = i;
      }
    }
  }
  return best;
}

vec3 evalSky(vec3 dir) {
  float zUp = clamp(dir.z * 0.5 + 0.5, 0.0, 1.0);
  vec3 horizon = uSkyRadiance * vec3(1.18, 1.12, 1.06) + vec3(0.03, 0.035, 0.045);
  vec3 zenith  = uSkyRadiance * vec3(0.65, 0.85, 1.28);
  vec3 ground  = vec3(0.045, 0.043, 0.042);
  vec3 sky = dir.z >= 0.0 ? mix(horizon, zenith, pow(zUp, 1.35)) : mix(ground, horizon, clamp(1.0 + dir.z * 3.0, 0.0, 1.0));
  float cosSun = dot(dir, uSunDir);
  float sunDisc = smoothstep(cos(uSunAngularRadius * 1.45), cos(uSunAngularRadius * 0.55), cosSun);
  float sunGlow = pow(max(0.0, cosSun), 128.0) * 0.35;
  return sky + uSunIrradiance * (sunDisc * 3.0 + sunGlow);
}

//------------------------------------------------------------------------------------------------------------------------------------------
// RING-FREE ANALYTICAL GTX CONTACT-HARDENING SOLAR SHADOWS
// Evaluates exact ray-primitive intersection + analytical convex ray-to-primitive closest approach (skipping receiver selfPrimIdx!).
// Zero sphere-marching steps -> zero concentric SDF shadow rings and zero false wall self-shadowing!
//------------------------------------------------------------------------------------------------------------------------------------------
float closestRayPrimitiveSoftVis(vec3 origin, vec3 dir, int idx, float tanSun) {
  vec3 center = uPrimPosShape[idx].xyz;
  int  shape  = int(uPrimPosShape[idx].w + 0.5);
  vec3 h      = uPrimHalfFlags[idx].xyz;
  vec3 rot    = uPrimRotAbbe[idx].xyz;

  vec3 lo = invRotateEuler(origin - center, rot);
  vec3 ld = invRotateEuler(dir, rot);

  // Broad-phase bounding sphere rejection along forward ray
  float boundR = length(h) * 1.35;
  float tCenter = -dot(lo, ld);
  if (tCenter < -boundR) return 1.0;
  vec3 perp = lo + ld * max(0.0, tCenter);
  float maxPenumbra = 0.005 + max(0.05, tCenter) * tanSun;
  if (length(perp) > boundR + maxPenumbra) return 1.0;

  // Exact analytical sphere/ellipsoid silhouette clearance
  if (shape == 1) {
    vec3 o = lo / h;
    vec3 d = ld / h;
    float dLen = max(length(d), 1e-5);
    vec3 dn = d / dLen;
    float tUnit = -dot(o, dn);
    if (tUnit <= 0.0) return 1.0;
    float rMean = (h.x + h.y + h.z) * 0.3333333;
    float worldT = (tUnit / dLen);
    float signedClearance = (length(o + dn * tUnit) - 1.0) * rMean;
    float coneR = 0.004 + worldT * tanSun;
    return smoothstep(-coneR * 0.35, coneR, signedClearance);
  }

  // Exact hard hit check first — inflate thickness along local hit normal so thin walls/baffles have 100% solid umbra
  // while feathering C1-continuously (vis = 0.5 at silhouette) into the outer golden-section penumbra!
  HitInfo directHit = intersectPrimitive(origin, dir, idx, 18.0, false);
  if (directHit.hit) {
    float coneR = 0.004 + directHit.t * tanSun;
    vec3 localHitPos = lo + ld * directHit.t;
    vec3 localHitN = abs(invRotateEuler(directHit.normal, rot));
    vec3 hSil = h + localHitN * (coneR * 2.2);
    float minIn = sdPrimitiveLocal(localHitPos, shape, hSil);
    return smoothstep(-coneR, coneR, minIn);
  }

  // Analytical convex 1D minimization of sdPrimitiveLocal(lo + ld * t) on [tLo, tHi] around slab kinks
  float tLo = max(0.01, tCenter - boundR);
  float tHi = min(18.0, tCenter + boundR);
  if (tHi <= tLo) return 1.0;

  // Seed bracket using exact slab plane crossings + golden-section search (convex unimodal function -> zero rings!)
  for (int iter = 0; iter < 7; ++iter) {
    float m1 = mix(tLo, tHi, 0.381966);
    float m2 = mix(tLo, tHi, 0.618034);
    float d1 = sdPrimitiveLocal(lo + ld * m1, shape, h);
    float d2 = sdPrimitiveLocal(lo + ld * m2, shape, h);
    if (d1 < d2) tHi = m2;
    else         tLo = m1;
  }
  float tBest = 0.5 * (tLo + tHi);
  float dBest = sdPrimitiveLocal(lo + ld * tBest, shape, h);
  float coneR = 0.004 + tBest * tanSun;
  return smoothstep(-coneR, coneR, dBest);
}

float evaluateGtxSolarShadow(vec3 pos, vec3 N, int selfPrimIdx) {
  if (dot(N, uSunDir) <= 0.0) return 0.0;
  vec3 origin = pos + N * 0.006;
  float tanSun = tan(uSunAngularRadius * 2.1);
  float vis = 1.0;
  for (int i = 0; i < ${MAX_PRIMS}; ++i) {
    if (i >= uPrimCount) break;
    if (i == selfPrimIdx || !PrimFlagShadow(i) || PrimFlagGlass(i)) continue;
    vis = min(vis, closestRayPrimitiveSoftVis(origin, uSunDir, i, tanSun));
    if (vis < 0.002) return 0.0;
  }
  return vis;
}

//------------------------------------------------------------------------------------------------------------------------------------------
// CLIPPED-HORIZON LTC POLYGONAL QUAD AREA LIGHTS
//------------------------------------------------------------------------------------------------------------------------------------------
float integrateClippedEdge(vec3 v1, vec3 v2) {
  float x = clamp(dot(v1, v2), -0.9999, 0.9999);
  float y = abs(x);
  float a = 0.8543985 + (0.4965155 + 0.0145206 * y) * y;
  float b = 3.4175940 + (4.1616724 + y) * y;
  float v = a / b;
  float thetaSintheta = (x > 0.0) ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v;
  return cross(v1, v2).z * thetaSintheta;
}

void buildBasis(vec3 N, out vec3 T, out vec3 B) {
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  T = normalize(cross(up, N));
  B = cross(N, T);
}

float evaluatePolygonalIrradiance(vec3 P, vec3 N, vec3 q0, vec3 q1, vec3 q2, vec3 q3) {
  vec3 T, B;
  buildBasis(N, T, B);
  vec3 L[5];
  L[0] = vec3(dot(q0 - P, T), dot(q0 - P, B), dot(q0 - P, N));
  L[1] = vec3(dot(q1 - P, T), dot(q1 - P, B), dot(q1 - P, N));
  L[2] = vec3(dot(q2 - P, T), dot(q2 - P, B), dot(q2 - P, N));
  L[3] = vec3(dot(q3 - P, T), dot(q3 - P, B), dot(q3 - P, N));
  L[4] = L[0];

  vec3 C[8];
  int count = 0;
  for (int i = 0; i < 4; ++i) {
    vec3 a = L[i];
    vec3 b = L[i + 1];
    bool aUp = a.z >= 0.0;
    bool bUp = b.z >= 0.0;
    if (aUp && count < 8) C[count++] = normalize(a);
    if (aUp != bUp && count < 8) {
      float t = a.z / (a.z - b.z);
      C[count++] = normalize(mix(a, b, t));
    }
  }
  if (count < 3) return 0.0;

  float sum = 0.0;
  for (int i = 0; i < 8; ++i) {
    if (i >= count) break;
    int next = (i + 1 == count) ? 0 : i + 1;
    sum += integrateClippedEdge(C[i], C[next]);
  }
  return max(0.0, abs(sum) / (2.0 * PI));
}

//------------------------------------------------------------------------------------------------------------------------------------------
// OPENPBR SURFACE BRDF (OREN-NAYAR + ANISOTROPIC GGX + F82 + CLEAR COAT + CHARLIE SHEEN + SUBSURFACE)
//------------------------------------------------------------------------------------------------------------------------------------------
float evaluateOrenNayar(vec3 N, vec3 V, vec3 L, float diffRough) {
  float NdotL = max(0.0, dot(N, L));
  float NdotV = max(1e-4, dot(N, V));
  if (NdotL <= 0.0) return 0.0;
  float s2 = diffRough * diffRough;
  float A = 1.0 - 0.5 * (s2 / (s2 + 0.33));
  float B = 0.45 * (s2 / (s2 + 0.09));
  vec3 Lp = L - N * NdotL;
  vec3 Vp = V - N * NdotV;
  float cosPhi = 0.0;
  float lenProd = length(Lp) * length(Vp);
  if (lenProd > 1e-5) cosPhi = max(0.0, dot(Lp, Vp) / lenProd);
  float sinAlpha = sqrt(max(0.0, 1.0 - min(NdotL, NdotV) * min(NdotL, NdotV)));
  float tanBeta  = sqrt(max(0.0, 1.0 - max(NdotL, NdotV) * max(NdotL, NdotV))) / max(1e-4, max(NdotL, NdotV));
  return (NdotL / PI) * (A + B * cosPhi * sinAlpha * tanBeta);
}

vec3 fresnelConductorF82(float VdotH, vec3 F0, vec3 F82Tint) {
  float mu = clamp(VdotH, 0.0, 1.0);
  float oneMinus = 1.0 - mu;
  float p5 = oneMinus * oneMinus * oneMinus * oneMinus * oneMinus;
  vec3 schlick = F0 + (1.0 - F0) * p5;
  const float muBar = 1.0 / 7.0;
  const float omBar = 6.0 / 7.0;
  float omBar5 = omBar * omBar * omBar * omBar * omBar;
  float omBar6 = omBar5 * omBar;
  vec3 schlickBar = F0 + (1.0 - F0) * omBar5;
  vec3 b = (schlickBar * (1.0 - F82Tint)) / (muBar * omBar6);
  return clamp(schlick - b * mu * p5 * oneMinus, vec3(0.0), vec3(1.0));
}

float fresnelDielectric(float VdotH, float ior) {
  float f0 = (ior - 1.0) / (ior + 1.0);
  f0 *= f0;
  float m = clamp(1.0 - VdotH, 0.0, 1.0);
  return f0 + (1.0 - f0) * m * m * m * m * m;
}

float dGgxAniso(vec3 H, vec3 N, vec3 T, vec3 B, float ax, float ay) {
  float x = dot(H, T) / ax;
  float y = dot(H, B) / ay;
  float z = max(0.0, dot(H, N));
  float denom = x * x + y * y + z * z;
  return 1.0 / max(1e-6, PI * ax * ay * denom * denom);
}

float gSmithGgx(float NdotV, float NdotL, float alpha) {
  float a2 = alpha * alpha;
  float gv = NdotL * sqrt(a2 + (1.0 - a2) * NdotV * NdotV);
  float gl = NdotV * sqrt(a2 + (1.0 - a2) * NdotL * NdotL);
  return 0.5 / max(1e-5, gv + gl);
}

float dCharlieSheen(float sheenRoughness, float NdotH) {
  float invR = 1.0 / max(0.04, sheenRoughness);
  float cos2h = NdotH * NdotH;
  float sin2h = max(1e-4, 1.0 - cos2h);
  return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);
}

vec3 evaluateOpenPbrDirect(
  vec3 N, vec3 Nc, vec3 T, vec3 B, vec3 V, vec3 L,
  SampledMaterial mat, vec3 edgeTint
) {
  float NdotL = max(0.0, dot(N, L));
  float NdotV = max(1e-4, dot(N, V));
  vec3 outBrdf = vec3(0.0);

  // Subsurface wrap lighting even slightly past terminator
  float subWeight = dot(mat.subsurfaceColor, vec3(0.3333));
  if (subWeight > 0.005) {
    float wrap = max(0.0, (dot(N, L) + 0.45) / 1.45);
    float backTrans = pow(max(0.0, dot(V, -L)), 3.0) * exp(-mat.thickness * 1.6);
    outBrdf += mat.subsurfaceColor * (wrap * 0.42 + backTrans * 0.65) * (1.0 - mat.metallic) / PI;
  }

  if (NdotL <= 0.0) return outBrdf;

  vec3 H = normalize(V + L);
  float VdotH = max(0.0, dot(V, H));
  float NdotH = max(0.0, dot(N, H));

  float alpha = max(0.025, mat.roughness * mat.roughness);
  float aspect = sqrt(1.0 - 0.9 * abs(mat.anisotropy));
  float ax = max(0.015, mat.anisotropy >= 0.0 ? alpha / aspect : alpha * aspect);
  float ay = max(0.015, mat.anisotropy >= 0.0 ? alpha * aspect : alpha / aspect);

  float D = dGgxAniso(H, N, T, B, ax, ay);
  float Vis = gSmithGgx(NdotV, NdotL, alpha);

  float dielF = fresnelDielectric(VdotH, mat.ior);
  vec3 condF  = fresnelConductorF82(VdotH, mat.baseColor, edgeTint);
  vec3 F      = mix(vec3(dielF), condF, mat.metallic);

  vec3 spec = D * Vis * F * NdotL;
  float diffFactor = evaluateOrenNayar(N, V, L, mat.diffuseRoughness);
  vec3 kD = (1.0 - F) * (1.0 - mat.metallic) * (1.0 - mat.transmission);
  vec3 diff = kD * mat.baseColor * diffFactor;

  // Fabric Charlie Sheen lobe
  vec3 sheen = vec3(0.0);
  if (dot(mat.sheenColor, vec3(1.0)) > 0.003) {
    float Ds = dCharlieSheen(mat.sheenRoughness, NdotH);
    float Vs = 1.0 / max(0.25, 4.0 * (NdotL + NdotV - NdotL * NdotV));
    sheen = mat.sheenColor * Ds * Vs * NdotL * (1.0 - mat.metallic);
  }

  vec3 baseLayer = diff + spec + sheen;

  if (mat.coat > 0.005) {
    float NcdotL = max(0.0, dot(Nc, L));
    float NcdotV = max(1e-4, dot(Nc, V));
    float ac = max(0.02, mat.coatRoughness * mat.coatRoughness);
    vec3 Tc, Bc;
    buildBasis(Nc, Tc, Bc);
    float Dc = dGgxAniso(H, Nc, Tc, Bc, ac, ac);
    float Vc = gSmithGgx(NcdotV, max(1e-4, NcdotL), ac);
    float Fc = fresnelDielectric(VdotH, 1.5) * mat.coat;
    baseLayer = baseLayer * (1.0 - Fc) + vec3(Dc * Vc * Fc * NcdotL);
  }
  return outBrdf + baseLayer;
}

//------------------------------------------------------------------------------------------------------------------------------------------
// RING-FREE ANALYTICAL HEMISPHERICAL CONE GI + CONTINUOUS AO
//------------------------------------------------------------------------------------------------------------------------------------------
vec3 evaluateBounceSurfaceDirect(vec3 bPos, vec3 bN, int bIdx) {
  SampledMaterial bMat = fetchMaterial(bIdx, vec2(0.5));
  if (!PrimFlagGi(bIdx)) return vec3(0.0);
  vec3 albedo = bMat.baseColor * (1.0 - bMat.metallic * 0.75);
  vec3 bounceRad = bMat.baseColor * bMat.emission;

  float NdotSun = max(0.0, dot(bN, uSunDir));
  if (NdotSun > 0.0) {
    HitInfo sBlock = traceOpaqueSceneIgnoring(bPos + bN * 0.015, uSunDir, 14.0, bIdx);
    if (!sBlock.hit) bounceRad += (albedo / PI) * uSunIrradiance * NdotSun;
  }

  for (int li = 0; li < ${MAX_LIGHTS}; ++li) {
    if (li >= uLightCount) break;
    vec3 lc = uLightCenterHalfW[li].xyz;
    vec3 toL = lc - bPos;
    float d2 = max(0.35, dot(toL, toL));
    vec3 dirL = toL * inversesqrt(d2);
    float nL = max(0.0, dot(bN, dirL));
    float lCos = max(0.0, -dirL.z);
    float area = 4.0 * uLightCenterHalfW[li].w * uLightHalfHRad[li].x;
    bounceRad += (albedo / PI) * uLightHalfHRad[li].yzw * (nL * lCos * area / (PI * d2)) * 0.65;
  }
  return bounceRad;
}

void evaluateGtxConeGiAndAo(vec3 pos, vec3 N, int selfPrimIdx, out vec3 indirectIrradiance, out float aoOut) {
  vec3 T, B;
  buildBasis(N, T, B);

  const vec3 localDirs[8] = vec3[8](
    vec3( 0.0000,  0.0000, 1.0000),
    vec3( 0.7071,  0.0000, 0.7071),
    vec3(-0.7071,  0.0000, 0.7071),
    vec3( 0.0000,  0.7071, 0.7071),
    vec3( 0.0000, -0.7071, 0.7071),
    vec3( 0.6124,  0.6124, 0.5000),
    vec3(-0.6124,  0.6124, 0.5000),
    vec3( 0.0000, -0.8660, 0.5000)
  );

  vec3 giSum = vec3(0.0);
  float wSum = 0.0;
  float aoOcc = 0.0;
  vec3 startPos = pos + N * 0.012;

  for (int c = 0; c < 8; ++c) {
    vec3 ld = localDirs[c];
    vec3 dir = normalize(T * ld.x + B * ld.y + N * ld.z);
    float cosW = max(0.15, ld.z);
    wSum += cosW;

    HitInfo ch = traceOpaqueSceneIgnoring(startPos, dir, 5.8, selfPrimIdx);
    if (ch.hit) {
      // Smooth continuous exponential AO without any step-threshold ring!
      aoOcc += cosW * exp(-ch.t / 0.72) * 0.58;
      float distAtten = 1.0 / (1.0 + 0.09 * ch.t * ch.t);
      giSum += evaluateBounceSurfaceDirect(ch.pos, ch.normal, ch.primIdx) * cosW * distAtten * 1.42;
    } else {
      giSum += evalSky(dir) * cosW * 0.88;
    }
  }

  indirectIrradiance = giSum / max(1e-4, wSum);
  aoOut = clamp(1.0 - aoOcc / max(1e-4, wSum), 0.18, 1.0);
}

void buildShadingFrame(HitInfo hit, SampledMaterial mat, out vec3 Nshade, out vec3 Ncoat, out vec3 Tshade, out vec3 Bshade) {
  vec3 Ng = hit.normal;
  vec3 Tg = hit.tangent - Ng * dot(hit.tangent, Ng);
  if (dot(Tg, Tg) < 1e-6) {
    vec3 Btmp;
    buildBasis(Ng, Tg, Btmp);
  } else {
    Tg = normalize(Tg);
  }
  vec3 Bg = cross(Ng, Tg);

  Nshade = normalize(Tg * mat.normalTs.x + Bg * mat.normalTs.y + Ng * mat.normalTs.z);
  if (dot(Nshade, Ng) < 0.08) Nshade = Ng;

  Ncoat = normalize(Tg * mat.coatNormalTs.x + Bg * mat.coatNormalTs.y + Ng * mat.coatNormalTs.z);
  if (dot(Ncoat, Ng) < 0.08) Ncoat = Ng;

  // Apply anisotropy rotation around Nshade
  vec3 Tbase = normalize(Tg - Nshade * dot(Tg, Nshade));
  vec3 Bbase = cross(Nshade, Tbase);
  float ca = cos(mat.anisoRotation);
  float sa = sin(mat.anisoRotation);
  Tshade = ca * Tbase + sa * Bbase;
  Bshade = -sa * Tbase + ca * Bbase;
}

vec3 shadeSecondaryBounceHit(HitInfo hit, vec3 V) {
  int idx = hit.primIdx;
  SampledMaterial mat = fetchMaterial(idx, hit.uv);
  if (mat.unlit) return mat.baseColor;

  vec3 N, Nc, T, B;
  buildShadingFrame(hit, mat, N, Nc, T, B);
  vec3 edgeTint = uPrimEdgeTint[idx].rgb;
  vec3 Lo = mat.baseColor * mat.emission;

  float sunVis = evaluateGtxSolarShadow(hit.pos, N, idx);
  if (sunVis > 0.0) {
    Lo += evaluateOpenPbrDirect(N, Nc, T, B, V, uSunDir, mat, edgeTint) * uSunIrradiance * sunVis;
  }

  for (int li = 0; li < ${MAX_LIGHTS}; ++li) {
    if (li >= uLightCount) break;
    vec3 lc = uLightCenterHalfW[li].xyz;
    float hw = uLightCenterHalfW[li].w;
    float hh = uLightHalfHRad[li].x;
    vec3 emit = uLightHalfHRad[li].yzw;
    vec3 q0 = lc + vec3(-hw, -hh, 0.0);
    vec3 q1 = lc + vec3( hw, -hh, 0.0);
    vec3 q2 = lc + vec3( hw,  hh, 0.0);
    vec3 q3 = lc + vec3(-hw,  hh, 0.0);
    float formFactor = evaluatePolygonalIrradiance(hit.pos, N, q0, q1, q2, q3);
    if (formFactor > 1e-5) {
      vec3 kD = (1.0 - mat.metallic) * (1.0 - mat.transmission) * mat.baseColor;
      Lo += kD * emit * formFactor;
    }
  }

  Lo += mat.baseColor * (1.0 - mat.metallic) * evalSky(N) * 0.45 * mat.ao;
  return Lo;
}

vec3 shadePrimaryOpaqueHit(HitInfo hit, vec3 V) {
  int idx = hit.primIdx;
  SampledMaterial origMat = fetchMaterial(idx, hit.uv);

  if (uViewMode == 2) {
    vec3 N, Nc, T, B;
    buildShadingFrame(hit, origMat, N, Nc, T, B);
    return N * 0.5 + 0.5;
  }
  if (origMat.unlit && uViewMode == 0) {
    return origMat.baseColor * (1.0 + origMat.emission);
  }

  SampledMaterial mat = origMat;
  if (uViewMode == 1) {
    mat.baseColor = vec3(0.72, 0.71, 0.69);
    mat.metallic = 0.0;
    mat.roughness = 0.58;
    mat.diffuseRoughness = 0.5;
    mat.coat = 0.0;
    mat.sheenColor = vec3(0.0);
    mat.subsurfaceColor = vec3(0.0);
    mat.transmission = 0.0;
    mat.emission = 0.0;
  }

  vec3 N, Nc, T, B;
  buildShadingFrame(hit, mat, N, Nc, T, B);
  vec3 edgeTint = uPrimEdgeTint[idx].rgb;
  vec3 Lo = mat.baseColor * mat.emission;

  // 1. Solar direct + ring-free analytical penumbra
  float sunVis = evaluateGtxSolarShadow(hit.pos, N, idx);
  if (sunVis > 0.0) {
    Lo += evaluateOpenPbrDirect(N, Nc, T, B, V, uSunDir, mat, edgeTint) * uSunIrradiance * sunVis;
  }

  // 2. Clipped-horizon LTC area quad lights + specular reflection
  for (int li = 0; li < ${MAX_LIGHTS}; ++li) {
    if (li >= uLightCount) break;
    vec3 lc = uLightCenterHalfW[li].xyz;
    float hw = uLightCenterHalfW[li].w;
    float hh = uLightHalfHRad[li].x;
    vec3 emit = uLightHalfHRad[li].yzw;

    vec3 q0 = lc + vec3(-hw, -hh, 0.0);
    vec3 q1 = lc + vec3( hw, -hh, 0.0);
    vec3 q2 = lc + vec3( hw,  hh, 0.0);
    vec3 q3 = lc + vec3(-hw,  hh, 0.0);

    float formFactor = evaluatePolygonalIrradiance(hit.pos, N, q0, q1, q2, q3);
    if (formFactor > 1e-5) {
      vec3 toCenter = normalize(lc - hit.pos);
      HitInfo lOcc = traceOpaqueSceneIgnoring(hit.pos + N * 0.01, toCenter, length(lc - hit.pos) - 0.03, idx);
      float areaVis = lOcc.hit ? 0.25 : 1.0;

      vec3 kD = (1.0 - mat.metallic) * (1.0 - mat.transmission) * mat.baseColor;
      Lo += kD * emit * formFactor * areaVis;

      vec3 R = reflect(-V, N);
      if (abs(R.z) > 1e-4) {
        float tPlane = (lc.z - hit.pos.z) / R.z;
        if (tPlane > 0.01) {
          vec3 pPlane = hit.pos + R * tPlane;
          vec3 clamped = vec3(
            clamp(pPlane.x, lc.x - hw, lc.x + hw),
            clamp(pPlane.y, lc.y - hh, lc.y + hh),
            lc.z
          );
          vec3 Lspec = normalize(clamped - hit.pos);
          float specSpread = max(0.04, mat.roughness * mat.roughness);
          float solid = clamp((hw * hh) / max(0.15, tPlane * tPlane * specSpread * 6.0), 0.0, 1.2);
          float VdotH = max(0.0, dot(V, normalize(V + Lspec)));
          vec3 F = mix(vec3(fresnelDielectric(VdotH, mat.ior)), fresnelConductorF82(VdotH, mat.baseColor, edgeTint), mat.metallic);
          Lo += F * emit * solid * max(0.0, dot(N, Lspec)) * areaVis * 0.55;
        }
      }
    }
  }

  // 3. Ring-free analytical hemispherical cone GI + AO
  vec3 giIrr;
  float sceneAo;
  evaluateGtxConeGiAndAo(hit.pos, N, idx, giIrr, sceneAo);
  float totalAo = sceneAo * mat.ao;
  float VdotN = max(0.0, dot(V, N));
  vec3 Fenv = mix(vec3(fresnelDielectric(VdotN, mat.ior)), fresnelConductorF82(VdotN, mat.baseColor, edgeTint), mat.metallic);
  vec3 kD = (1.0 - Fenv) * (1.0 - mat.metallic) * (1.0 - mat.transmission);
  Lo += kD * mat.baseColor * giIrr * totalAo;

  // Fabric ambient sheen rim
  if (dot(mat.sheenColor, vec3(1.0)) > 0.003) {
    float rim = pow(1.0 - VdotN, 3.0);
    Lo += mat.sheenColor * giIrr * rim * 0.45 * totalAo;
  }

  // 4. Specular reflection ray for smooth metals / clear-coat / SSR
  float specReflectivity = max(mat.metallic, mat.coat * 0.65);
  if (uViewMode == 0 && (specReflectivity > 0.08 || mat.roughness < 0.38)) {
    vec3 R = reflect(-V, mat.coat > 0.35 ? Nc : N);
    vec3 reflEmit;
    int reflLIdx;
    HitInfo rHit = traceOpaqueSceneIgnoring(hit.pos + N * 0.012, R, 22.0, idx);
    float tQuad = traceLightQuad(hit.pos + N * 0.012, R, rHit.t, reflEmit, reflLIdx);
    vec3 reflRad;
    if (tQuad < rHit.t) {
      reflRad = reflEmit;
    } else if (rHit.hit) {
      reflRad = shadeSecondaryBounceHit(rHit, -R);
    } else {
      reflRad = evalSky(R);
    }
    float gloss = (1.0 - mat.roughness * 0.82);
    vec3 reflWeight = Fenv * gloss * gloss;
    if (mat.coat > 0.005) {
      float Fc = fresnelDielectric(max(0.0, dot(V, Nc)), 1.5) * mat.coat * (1.0 - mat.coatRoughness * 0.7);
      reflWeight = max(reflWeight, vec3(Fc));
    }
    Lo += reflRad * reflWeight * mix(0.45, 1.0, totalAo);
  }

  // 5. Partial UV-driven transmission or opacity blending on non-shell primitives
  float transFactor = max(mat.transmission, 1.0 - mat.opacity);
  if (uViewMode == 0 && transFactor > 0.02) {
    vec3 behindDir = mat.transmission > 0.05 ? refract(-V, N, 1.0 / max(1.01, mat.ior)) : -V;
    if (dot(behindDir, behindDir) < 1e-5) behindDir = -V;
    vec3 bEmit;
    int bLightIdx;
    HitInfo bHit = traceOpaqueSceneIgnoring(hit.pos - N * 0.015, normalize(behindDir), 30.0, idx);
    float tBLight = traceLightQuad(hit.pos - N * 0.015, normalize(behindDir), bHit.t, bEmit, bLightIdx);
    vec3 behindRad = (tBLight < bHit.t)
      ? bEmit
      : (bHit.hit ? shadeSecondaryBounceHit(bHit, -normalize(behindDir)) : evalSky(normalize(behindDir)));
    vec3 tint = mix(vec3(1.0), mat.baseColor, mat.transmission);
    Lo = mix(Lo, behindRad * tint, clamp(transFactor, 0.0, 1.0));
  }

  if (uViewMode == 3) {
    float rim = 1.0 - abs(dot(N, V));
    vec3 gridP = abs(fract(hit.pos * 4.0) - 0.5);
    float wire = smoothstep(0.045, 0.01, min(min(gridP.x, gridP.y), gridP.z));
    Lo = mix(Lo * 0.22, vec3(0.42, 0.78, 1.0), max(wire, smoothstep(0.72, 0.96, rim)));
  }

  return Lo;
}

vec3 shadeTwoLayerGlass(HitInfo frontHit, vec3 rd) {
  int idx = frontHit.primIdx;
  SampledMaterial mat = fetchMaterial(idx, frontHit.uv);
  vec3 N, Nc, T, B;
  buildShadingFrame(frontHit, mat, N, Nc, T, B);
  vec3 V = -rd;

  if (mat.opacity < 0.95 && mat.transmission < 0.15) {
    HitInfo bgHit = traceOpaqueSceneIgnoring(frontHit.pos + rd * 0.015, rd, 40.0, idx);
    vec3 bgEmit;
    int bgL;
    float tL = traceLightQuad(frontHit.pos + rd * 0.015, rd, bgHit.t, bgEmit, bgL);
    vec3 bgRad = (tL < bgHit.t) ? bgEmit : (bgHit.hit ? shadePrimaryOpaqueHit(bgHit, V) : evalSky(rd));
    vec3 surfRad = shadeSecondaryBounceHit(frontHit, V);
    return mix(bgRad, surfRad, mat.opacity);
  }

  float baseIor = max(1.03, mat.ior);
  float abbe = max(12.0, uPrimRotAbbe[idx].w > 1.0 ? uPrimRotAbbe[idx].w : 26.0);
  float spread = (baseIor - 1.0) / abbe * 1.65;
  vec3 iorRGB = vec3(baseIor - spread, baseIor, baseIor + spread);

  float F = fresnelDielectric(max(0.0, dot(V, N)), baseIor);
  vec3 R = reflect(rd, N);
  vec3 reflEmit;
  int reflL;
  HitInfo reflHit = traceOpaqueSceneIgnoring(frontHit.pos + N * 0.012, R, 25.0, idx);
  float tReflQuad = traceLightQuad(frontHit.pos + N * 0.012, R, reflHit.t, reflEmit, reflL);
  vec3 reflRad = (tReflQuad < reflHit.t) ? reflEmit : (reflHit.hit ? shadePrimaryOpaqueHit(reflHit, -R) : evalSky(R));

  vec3 refrRad = vec3(0.0);
  float pathThickness = 0.35;
  for (int ch = 0; ch < 3; ++ch) {
    float eta = 1.0 / iorRGB[ch];
    vec3 tIn = refract(rd, N, eta);
    if (dot(tIn, tIn) < 1e-5) {
      refrRad[ch] = reflRad[ch];
      continue;
    }
    tIn = normalize(tIn);
    HitInfo backHit = intersectPrimitive(frontHit.pos + tIn * 0.008, tIn, idx, 6.0, true);
    vec3 exitPos = frontHit.pos + tIn * 0.35;
    vec3 exitDir = tIn;
    if (backHit.hit) {
      pathThickness = backHit.t;
      exitPos = backHit.pos;
      vec3 tOut = refract(tIn, backHit.normal, iorRGB[ch]);
      exitDir = dot(tOut, tOut) > 1e-5 ? normalize(tOut) : reflect(tIn, backHit.normal);
    }
    vec3 bgEmit;
    int bgL;
    HitInfo bgHit = traceOpaqueSceneIgnoring(exitPos + exitDir * 0.012, exitDir, 35.0, idx);
    float tBgQuad = traceLightQuad(exitPos + exitDir * 0.012, exitDir, bgHit.t, bgEmit, bgL);
    vec3 sampleRad = (tBgQuad < bgHit.t)
      ? bgEmit
      : (bgHit.hit ? shadePrimaryOpaqueHit(bgHit, -exitDir) : evalSky(exitDir));
    refrRad[ch] = sampleRad[ch];
  }

  vec3 atten = pow(clamp(mat.baseColor, vec3(0.04), vec3(1.0)), vec3(pathThickness * 1.45));
  vec3 sunH = normalize(V + uSunDir);
  float sunGlint = pow(max(0.0, dot(N, sunH)), 512.0) * 14.0;
  return reflRad * F + refrRad * atten * (1.0 - F) * max(0.25, mat.transmission) + uSunIrradiance * sunGlint + mat.baseColor * mat.emission;
}

vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  float aspect = uResolution.x / max(1.0, uResolution.y);
  vec2 ndc = vUv * 2.0 - 1.0;

  vec3 ro, rd;
  if (uOrthoHalfHeight > 0.0) {
    ro = uCamOrigin + uCamRight * (ndc.x * uOrthoHalfHeight * aspect) + uCamUp * (ndc.y * uOrthoHalfHeight);
    rd = uCamForward;
  } else {
    ro = uCamOrigin;
    rd = normalize(uCamForward + uCamRight * (ndc.x * aspect * uTanHalfFov) + uCamUp * (ndc.y * uTanHalfFov));
  }

  HitInfo fullHit = traceFullScene(ro, rd, 50.0);
  vec3 quadEmit;
  int hitLightIdx;
  float tQuad = traceLightQuad(ro, rd, fullHit.t, quadEmit, hitLightIdx);

  vec3 linearColor;
  int entityCode = 0;

  if (uViewMode >= 10) {
    // F3 Debug Buffers: 11 = Depth, 12 = Visibility ID, 13 = Albedo, 14 = Normal, 15 = Roughness, 16 = Metalness
    int dbg = uViewMode - 10;
    if (fullHit.hit) {
      entityCode = 1 + fullHit.primIdx;
      SampledMaterial dm = fetchMaterial(fullHit.primIdx, fullHit.uv);
      vec3 N, Nc, T, B;
      buildShadingFrame(fullHit, dm, N, Nc, T, B);
      if (dbg == 1)      linearColor = vec3(1.0 - clamp(fullHit.t / 12.0, 0.0, 1.0));
      else if (dbg == 2) linearColor = fract(vec3(float(entityCode) * 0.37, float(entityCode) * 0.61, float(entityCode) * 0.83));
      else if (dbg == 3) linearColor = pow(clamp(dm.baseColor, 0.0, 1.0), vec3(1.0 / 2.2));
      else if (dbg == 4) linearColor = N * 0.5 + 0.5;
      else if (dbg == 5) linearColor = vec3(dm.roughness);
      else               linearColor = vec3(dm.metallic);
    } else {
      linearColor = vec3(0.06, 0.07, 0.09);
    }
    fragColor = vec4(clamp(linearColor, 0.0, 1.0), float(entityCode) / 255.0);
    return;
  }

  if (tQuad < fullHit.t) {
    linearColor = quadEmit;
    entityCode = 32 + hitLightIdx;
  } else if (fullHit.hit) {
    entityCode = 1 + fullHit.primIdx;
    if (PrimFlagGlass(fullHit.primIdx) && uViewMode == 0) {
      linearColor = shadeTwoLayerGlass(fullHit, rd);
    } else {
      linearColor = shadePrimaryOpaqueHit(fullHit, -rd);
    }
  } else {
    linearColor = evalSky(rd);
    if (uShowGrid != 0 && abs(rd.z) > 1e-4) {
      float tFloor = (-0.80 - ro.z) / rd.z;
      if (tFloor > 0.0 && tFloor < 36.0) {
        vec3 gp = ro + rd * tFloor;
        vec2 g1 = abs(fract(gp.xy) - 0.5) / fwidth(gp.xy);
        float line = 1.0 - min(min(g1.x, g1.y), 1.0);
        float fade = exp(-tFloor * 0.09);
        linearColor = mix(linearColor, vec3(0.28, 0.34, 0.42), line * fade * 0.45);
      }
    }
  }

  vec3 srgb;
  if (uViewMode == 2) {
    srgb = clamp(linearColor, 0.0, 1.0);
  } else {
    vec3 mapped = acesFilm(max(vec3(0.0), linearColor) * uExposureGain);
    srgb = pow(mapped, vec3(1.0 / 2.2));
  }

  fragColor = vec4(srgb, float(entityCode) / 255.0);
}
`;

//==========================================================================================================================================
// PASS 2: SCREEN-SPACE 2PX ANTI-ALIASED SILHOUETTE SELECTION OUTLINE SHADER
//==========================================================================================================================================
export const OUTLINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform int       uSelectedCode;

int decodeCode(float a) {
  return int(floor(a * 255.0 + 0.5));
}

void main() {
  ivec2 texSize = textureSize(uSceneTex, 0);
  ivec2 p = clamp(ivec2(gl_FragCoord.xy), ivec2(0), texSize - ivec2(1));
  vec4 center = texelFetch(uSceneTex, p, 0);
  vec3 color = center.rgb;

  if (uSelectedCode > 0) {
    int c0 = decodeCode(center.a);
    bool centerSelected = (c0 == uSelectedCode);

    // 12-tap 1px + 2px ring for razor-sharp anti-aliased silhouette outline
    const ivec2 offsets[12] = ivec2[12](
      ivec2( 1,  0), ivec2(-1,  0), ivec2( 0,  1), ivec2( 0, -1),
      ivec2( 1,  1), ivec2(-1,  1), ivec2( 1, -1), ivec2(-1, -1),
      ivec2( 2,  0), ivec2(-2,  0), ivec2( 0,  2), ivec2( 0, -2)
    );

    float edgeStrength = 0.0;
    for (int k = 0; k < 12; ++k) {
      ivec2 q = clamp(p + offsets[k], ivec2(0), texSize - ivec2(1));
      int cq = decodeCode(texelFetch(uSceneTex, q, 0).a);
      bool neighborSelected = (cq == uSelectedCode);
      if (!centerSelected && neighborSelected) {
        edgeStrength = max(edgeStrength, k < 4 ? 1.0 : (k < 8 ? 0.88 : 0.62));
      } else if (centerSelected && !neighborSelected && k < 4) {
        edgeStrength = max(edgeStrength, 0.35);
      }
    }

    if (edgeStrength > 0.0) {
      const vec3 selectionAmber = vec3(0.965, 0.776, 0.420); // #F6C66B
      color = mix(color, selectionAmber, edgeStrength * 0.94);
    }
  }

  fragColor = vec4(color, 1.0);
}
`;

function CompileProgram(Gl, VsSource, FsSource) {
  const Compile = (Type, Source) => {
    const Shader = Gl.createShader(Type);
    Gl.shaderSource(Shader, Source);
    Gl.compileShader(Shader);
    if (!Gl.getShaderParameter(Shader, Gl.COMPILE_STATUS)) {
      const Log = Gl.getShaderInfoLog(Shader);
      Gl.deleteShader(Shader);
      throw new Error(Log || "Shader compile error");
    }
    return Shader;
  };
  const Vs = Compile(Gl.VERTEX_SHADER, VsSource);
  const Fs = Compile(Gl.FRAGMENT_SHADER, FsSource);
  const Prog = Gl.createProgram();
  Gl.attachShader(Prog, Vs);
  Gl.attachShader(Prog, Fs);
  Gl.linkProgram(Prog);
  Gl.deleteShader(Vs);
  Gl.deleteShader(Fs);
  if (!Gl.getProgramParameter(Prog, Gl.LINK_STATUS)) {
    const Log = Gl.getProgramInfoLog(Prog);
    Gl.deleteProgram(Prog);
    throw new Error(Log || "Program link error");
  }
  return Prog;
}

const VIEW_MODE_CODES = {
  GTX: 0,
  LIT: 0,
  CLAY: 1,
  NORMALS: 2,
  WIREFRAME: 3,
};

function ResolveEntityTransformForGizmo(SelectedId, Rows, Values, CompiledScene) {
  if (!SelectedId) return null;
  const Row = Rows.find((Item) => Item.Id === SelectedId);
  if (!Row) return null;
  if (Row.Panel === "folder" || Row.Panel === "post" || Row.Panel === "camera") return null;

  const Rec = Values?.[SelectedId] || {};
  if (Row.Panel === "geometry") {
    const Prim = CompiledScene.Primitives.find((Item) => Item.Id === SelectedId);
    if (!Prim) return null;
    return {
      Id: SelectedId,
      Kind: "geometry",
      Locked: !!Rec.LOCKED,
      Position: Array.isArray(Rec.Position) ? [...Rec.Position] : [...Prim.Center],
      Rotation: Array.isArray(Rec.Rotation) ? [...Rec.Rotation] : [0, 0, 0],
      Scale: Array.isArray(Rec.Scale)
        ? [...Rec.Scale]
        : Prim.HalfExtents.map((H) => +(H * 2).toFixed(3)),
    };
  }

  if (Row.Panel === "light") {
    const Light = CompiledScene.AreaLights.find((Item) => Item.Id === SelectedId);
    if (!Light) return null;
    const RefPos = Rec.ReferenceInspector?.Properties?.pos;
    return {
      Id: SelectedId,
      Kind: "light",
      Locked: !!Rec.LOCKED,
      Position: Array.isArray(Rec.Position)
        ? [...Rec.Position]
        : Array.isArray(RefPos)
          ? [...RefPos]
          : [...Light.Center],
      Rotation: Array.isArray(Rec.Rotation) ? [...Rec.Rotation] : [0, 0, 0],
      Scale: Array.isArray(Rec.Scale)
        ? [...Rec.Scale]
        : [Light.HalfWidth * 2, Light.HalfHeight * 2, 1.0],
    };
  }

  return null;
}

export default function GtxWorldViewport({
  Rows,
  Values,
  Hidden,
  Selected,
  Select,
  ViewMode = "GTX",
  Projection = "PERSP",
  Debug = 0,
  Settings,
  View = 1,
  ShowGrid,
  ShowGizmo = true,
  UpdateEditorCamera,
  OnSelectEntity,
  OnUpdateCamera,
  OnTransformEntity,
  OnFpsSample,
}) {
  const SelectCallback = OnSelectEntity || Select;
  const CameraCallback = OnUpdateCamera || UpdateEditorCamera;
  const EffectiveProjection = View === 2 ? "TOP" : Projection;
  const EffectiveGrid = ShowGrid !== undefined ? ShowGrid : Settings?.Grid !== false;
  const EffectiveGizmo = ShowGizmo && (Settings?.Gizmos !== false);
  const CanvasRef = useRef(null);
  const GlStateRef = useRef(null);
  const DragRef = useRef(null);
  const KeysRef = useRef(new Set());
  const AtlasSyncRef = useRef(null);
  const BuiltGizmoRef = useRef(null);
  const [ShaderError, SetShaderError] = useState(null);
  const [HoveredHandle, SetHoveredHandle] = useState(GizmoHandle.None);
  const [ActiveHandle, SetActiveHandle] = useState(GizmoHandle.None);
  const [GizmoReadout, SetGizmoReadout] = useState("");
  const [TextureEpoch, SetTextureEpoch] = useState(0);

  if (!AtlasSyncRef.current) {
    AtlasSyncRef.current = new MaterialAtlasSynchronizer();
  }

  const CompiledScene = useMemo(
    () => CompileLiveGtxScene(Rows, Values, Hidden, EffectiveProjection),
    [Rows, Values, Hidden, EffectiveProjection],
  );

  // Trigger async decode if any channel uses an embedded data:image/... texture
  useEffect(() => {
    EnsureMaterialTexturesDecoded(CompiledScene.Primitives, () => {
      AtlasSyncRef.current?.InvalidateAll();
      SetTextureEpoch((N) => N + 1);
    });
  }, [CompiledScene]);

  const SelectedGizmoTarget = useMemo(
    () => ResolveEntityTransformForGizmo(Selected, Rows, Values, CompiledScene),
    [Selected, Rows, Values, CompiledScene],
  );

  // Initialize WebGL2 3-pass pipeline (GTX FBO + Silhouette Outline + 3D Slate GizmoPRO)
  useEffect(() => {
    const Canvas = CanvasRef.current;
    if (!Canvas) return;
    const Gl = Canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      depth: true,
      preserveDrawingBuffer: true,
    });
    if (!Gl) {
      SetShaderError("WebGL2 unavailable in browser context");
      return;
    }

    try {
      const SceneProg = CompileProgram(Gl, FULLSCREEN_VERTEX_SHADER, GTX_FRAGMENT_SHADER);
      const OutlineProg = CompileProgram(Gl, FULLSCREEN_VERTEX_SHADER, OUTLINE_FRAGMENT_SHADER);
      const GizmoProg = CompileProgram(Gl, GIZMO_VERTEX_SHADER, GIZMO_FRAGMENT_SHADER);

      const EmptyVao = Gl.createVertexArray();

      // Material Atlas texture (1024 x 768 RGBA8)
      const AtlasTex = Gl.createTexture();
      Gl.bindTexture(Gl.TEXTURE_2D, AtlasTex);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MIN_FILTER, Gl.LINEAR);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MAG_FILTER, Gl.LINEAR);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);
      Gl.texImage2D(
        Gl.TEXTURE_2D,
        0,
        Gl.RGBA8,
        ATLAS_WIDTH,
        ATLAS_HEIGHT,
        0,
        Gl.RGBA,
        Gl.UNSIGNED_BYTE,
        null,
      );

      // Offscreen FBO for Pass 1 -> Pass 2 silhouette outline
      const SceneFbo = Gl.createFramebuffer();
      const SceneTex = Gl.createTexture();
      Gl.bindTexture(Gl.TEXTURE_2D, SceneTex);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MIN_FILTER, Gl.NEAREST);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MAG_FILTER, Gl.NEAREST);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
      Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);

      // Pass 3 Gizmo VAO + VBO
      const GizmoVao = Gl.createVertexArray();
      const GizmoVbo = Gl.createBuffer();
      Gl.bindVertexArray(GizmoVao);
      Gl.bindBuffer(Gl.ARRAY_BUFFER, GizmoVbo);
      const Stride = 12 * 4;
      Gl.enableVertexAttribArray(0);
      Gl.vertexAttribPointer(0, 3, Gl.FLOAT, false, Stride, 0);
      Gl.enableVertexAttribArray(1);
      Gl.vertexAttribPointer(1, 3, Gl.FLOAT, false, Stride, 12);
      Gl.enableVertexAttribArray(2);
      Gl.vertexAttribPointer(2, 4, Gl.FLOAT, false, Stride, 24);
      Gl.enableVertexAttribArray(3);
      Gl.vertexAttribPointer(3, 2, Gl.FLOAT, false, Stride, 40);
      Gl.bindVertexArray(null);

      AtlasSyncRef.current?.InvalidateAll();

      const Loc = (Name) => Gl.getUniformLocation(SceneProg, Name);
      GlStateRef.current = {
        Gl,
        SceneProg,
        OutlineProg,
        GizmoProg,
        EmptyVao,
        AtlasTex,
        SceneFbo,
        SceneTex,
        FboWidth: 0,
        FboHeight: 0,
        GizmoVao,
        GizmoVbo,
        SceneUniforms: {
          uResolution: Loc("uResolution"),
          uCamOrigin: Loc("uCamOrigin"),
          uCamForward: Loc("uCamForward"),
          uCamRight: Loc("uCamRight"),
          uCamUp: Loc("uCamUp"),
          uTanHalfFov: Loc("uTanHalfFov"),
          uOrthoHalfHeight: Loc("uOrthoHalfHeight"),
          uExposureGain: Loc("uExposureGain"),
          uViewMode: Loc("uViewMode"),
          uShowGrid: Loc("uShowGrid"),
          uSelectedEntityCode: Loc("uSelectedEntityCode"),
          uSunDir: Loc("uSunDir"),
          uSunIrradiance: Loc("uSunIrradiance"),
          uSunAngularRadius: Loc("uSunAngularRadius"),
          uSkyRadiance: Loc("uSkyRadiance"),
          uLightCount: Loc("uLightCount"),
          uLightCenterHalfW: Loc("uLightCenterHalfW[0]"),
          uLightHalfHRad: Loc("uLightHalfHRad[0]"),
          uPrimCount: Loc("uPrimCount"),
          uPrimPosShape: Loc("uPrimPosShape[0]"),
          uPrimHalfFlags: Loc("uPrimHalfFlags[0]"),
          uPrimRotAbbe: Loc("uPrimRotAbbe[0]"),
          uPrimEdgeTint: Loc("uPrimEdgeTint[0]"),
          uMaterialAtlas: Loc("uMaterialAtlas"),
        },
        OutlineUniforms: {
          uSceneTex: Gl.getUniformLocation(OutlineProg, "uSceneTex"),
          uSelectedCode: Gl.getUniformLocation(OutlineProg, "uSelectedCode"),
        },
        GizmoUniforms: {
          uViewProj: Gl.getUniformLocation(GizmoProg, "uViewProj"),
          uHighlightedHandle: Gl.getUniformLocation(GizmoProg, "uHighlightedHandle"),
        },
      };
      SetShaderError(null);
    } catch (Err) {
      SetShaderError(String(Err?.message || Err));
    }

    return () => {
      const State = GlStateRef.current;
      if (State) {
        State.Gl.deleteBuffer(State.GizmoVbo);
        State.Gl.deleteVertexArray(State.GizmoVao);
        State.Gl.deleteVertexArray(State.EmptyVao);
        State.Gl.deleteTexture(State.AtlasTex);
        State.Gl.deleteTexture(State.SceneTex);
        State.Gl.deleteFramebuffer(State.SceneFbo);
        State.Gl.deleteProgram(State.SceneProg);
        State.Gl.deleteProgram(State.OutlineProg);
        State.Gl.deleteProgram(State.GizmoProg);
        GlStateRef.current = null;
      }
    };
  }, []);

  // Render scene + silhouette selection outline + 3D Slate GizmoPRO whenever state updates
  useEffect(() => {
    const Canvas = CanvasRef.current;
    const State = GlStateRef.current;
    if (!Canvas || !State) return;

    const Draw = () => {
      const { Gl, SceneUniforms: U } = State;
      const Rect = Canvas.getBoundingClientRect();
      const Dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const Width = Math.max(320, Math.round((Rect.width || 960) * Dpr));
      const Height = Math.max(200, Math.round((Rect.height || 560) * Dpr));
      if (Canvas.width !== Width || Canvas.height !== Height) {
        Canvas.width = Width;
        Canvas.height = Height;
      }
      const Aspect = Width / Math.max(1, Height);

      // Resize offscreen FBO texture if needed
      if (State.FboWidth !== Width || State.FboHeight !== Height) {
        Gl.bindTexture(Gl.TEXTURE_2D, State.SceneTex);
        Gl.texImage2D(
          Gl.TEXTURE_2D,
          0,
          Gl.RGBA8,
          Width,
          Height,
          0,
          Gl.RGBA,
          Gl.UNSIGNED_BYTE,
          null,
        );
        Gl.bindFramebuffer(Gl.FRAMEBUFFER, State.SceneFbo);
        Gl.framebufferTexture2D(
          Gl.FRAMEBUFFER,
          Gl.COLOR_ATTACHMENT0,
          Gl.TEXTURE_2D,
          State.SceneTex,
          0,
        );
        State.FboWidth = Width;
        State.FboHeight = Height;
      }

      // Update Material Atlas if any primitive's 20-channel Material changed
      const AtlasSync = AtlasSyncRef.current;
      if (AtlasSync.UpdatePrimitives(CompiledScene.Primitives)) {
        Gl.bindTexture(Gl.TEXTURE_2D, State.AtlasTex);
        Gl.texSubImage2D(
          Gl.TEXTURE_2D,
          0,
          0,
          0,
          ATLAS_WIDTH,
          ATLAS_HEIGHT,
          Gl.RGBA,
          Gl.UNSIGNED_BYTE,
          AtlasSync.Pixels,
        );
        AtlasSync.Dirty = false;
      }

      const { CameraOrigin, CameraTarget, WorldUp } = CompiledScene;
      const Fwd = NormalizeVec3([
        CameraTarget[0] - CameraOrigin[0],
        CameraTarget[1] - CameraOrigin[1],
        CameraTarget[2] - CameraOrigin[2],
      ]);
      const Cross = (A, B) => [
        A[1] * B[2] - A[2] * B[1],
        A[2] * B[0] - A[0] * B[2],
        A[0] * B[1] - A[1] * B[0],
      ];
      const Right = NormalizeVec3(Cross(Fwd, WorldUp), [1, 0, 0]);
      const Up = NormalizeVec3(Cross(Right, Fwd), [0, 0, 1]);

      // Resolve selected entity code (1..24 = prim, 32..35 = area light)
      let SelectedCode = 0;
      const PrimIdx = CompiledScene.Primitives.findIndex((P) => P.Id === Selected);
      if (PrimIdx >= 0) {
        SelectedCode = 1 + PrimIdx;
      } else {
        const LightIdx = CompiledScene.AreaLights.findIndex((L) => L.Id === Selected);
        if (LightIdx >= 0) SelectedCode = 32 + LightIdx;
      }

      // ---------------- PASS 1: GTX WORLD RENDER TO OFFSCREEN FBO ----------------
      Gl.bindFramebuffer(Gl.FRAMEBUFFER, State.SceneFbo);
      Gl.viewport(0, 0, Width, Height);
      Gl.disable(Gl.DEPTH_TEST);
      Gl.disable(Gl.BLEND);

      Gl.useProgram(State.SceneProg);
      Gl.activeTexture(Gl.TEXTURE0);
      Gl.bindTexture(Gl.TEXTURE_2D, State.AtlasTex);
      Gl.uniform1i(U.uMaterialAtlas, 0);

      Gl.uniform2f(U.uResolution, Width, Height);
      Gl.uniform3fv(U.uCamOrigin, CameraOrigin);
      Gl.uniform3fv(U.uCamForward, Fwd);
      Gl.uniform3fv(U.uCamRight, Right);
      Gl.uniform3fv(U.uCamUp, Up);
      Gl.uniform1f(U.uTanHalfFov, Math.tan(CompiledScene.VerticalFovRad * 0.5));
      Gl.uniform1f(U.uOrthoHalfHeight, CompiledScene.OrthoHalfHeight);
      Gl.uniform1f(U.uExposureGain, CompiledScene.ExposureGain);
      const EffectiveViewMode =
        Debug > 0 && Debug <= 6 ? 10 + Debug : VIEW_MODE_CODES[ViewMode] ?? 0;
      Gl.uniform1i(U.uViewMode, EffectiveViewMode);
      Gl.uniform1i(U.uShowGrid, EffectiveGrid ? 1 : 0);
      Gl.uniform1i(U.uSelectedEntityCode, SelectedCode);

      Gl.uniform3fv(U.uSunDir, CompiledScene.SunDir);
      Gl.uniform3fv(U.uSunIrradiance, CompiledScene.SunIrradiance);
      Gl.uniform1f(U.uSunAngularRadius, CompiledScene.SunAngularRadiusRad);
      Gl.uniform3fv(U.uSkyRadiance, CompiledScene.SkyRadiance);

      const LCount = Math.min(MAX_LIGHTS, CompiledScene.AreaLights.length);
      const LCenterHalfW = new Float32Array(MAX_LIGHTS * 4);
      const LHalfHRad = new Float32Array(MAX_LIGHTS * 4);
      for (let I = 0; I < LCount; ++I) {
        const L = CompiledScene.AreaLights[I];
        LCenterHalfW.set([L.Center[0], L.Center[1], L.Center[2], L.HalfWidth], I * 4);
        LHalfHRad.set([L.HalfHeight, L.Radiance[0], L.Radiance[1], L.Radiance[2]], I * 4);
      }
      Gl.uniform1i(U.uLightCount, LCount);
      Gl.uniform4fv(U.uLightCenterHalfW, LCenterHalfW);
      Gl.uniform4fv(U.uLightHalfHRad, LHalfHRad);

      const PCount = Math.min(MAX_PRIMS, CompiledScene.Primitives.length);
      const PosShape = new Float32Array(MAX_PRIMS * 4);
      const HalfFlags = new Float32Array(MAX_PRIMS * 4);
      const RotAbbe = new Float32Array(MAX_PRIMS * 4);
      const EdgeTint = new Float32Array(MAX_PRIMS * 4);

      for (let I = 0; I < PCount; ++I) {
        const P = CompiledScene.Primitives[I];
        const Flags =
          (P.CastShadows ? 1 : 0) |
          (P.GiContributor ? 2 : 0) |
          (P.GlassShell ? 4 : 0);
        PosShape.set([P.Center[0], P.Center[1], P.Center[2], P.Shape], I * 4);
        HalfFlags.set(
          [P.HalfExtents[0], P.HalfExtents[1], P.HalfExtents[2], Flags],
          I * 4,
        );
        RotAbbe.set(
          [P.RotationRad[0], P.RotationRad[1], P.RotationRad[2], P.Abbe],
          I * 4,
        );
        EdgeTint.set(
          [P.EdgeTintF82[0], P.EdgeTintF82[1], P.EdgeTintF82[2], P.Transmission],
          I * 4,
        );
      }

      Gl.uniform1i(U.uPrimCount, PCount);
      Gl.uniform4fv(U.uPrimPosShape, PosShape);
      Gl.uniform4fv(U.uPrimHalfFlags, HalfFlags);
      Gl.uniform4fv(U.uPrimRotAbbe, RotAbbe);
      Gl.uniform4fv(U.uPrimEdgeTint, EdgeTint);

      Gl.bindVertexArray(State.EmptyVao);
      Gl.drawArrays(Gl.TRIANGLES, 0, 3);

      // ---------------- PASS 2: BLIT + 2PX SILHOUETTE SELECTION OUTLINE ----------------
      Gl.bindFramebuffer(Gl.FRAMEBUFFER, null);
      Gl.viewport(0, 0, Width, Height);
      Gl.clear(Gl.DEPTH_BUFFER_BIT);
      Gl.useProgram(State.OutlineProg);
      Gl.activeTexture(Gl.TEXTURE0);
      Gl.bindTexture(Gl.TEXTURE_2D, State.SceneTex);
      Gl.uniform1i(State.OutlineUniforms.uSceneTex, 0);
      Gl.uniform1i(State.OutlineUniforms.uSelectedCode, SelectedCode);
      Gl.drawArrays(Gl.TRIANGLES, 0, 3);

      // ---------------- PASS 3: 3D SLATE 13-HANDLE TRANSFORM GIZMO ----------------
      if (EffectiveGizmo && SelectedGizmoTarget) {
        const CamState = {
          Projection: CompiledScene.OrthoHalfHeight > 0 ? "Orthographic" : "Perspective",
          Position: CameraOrigin,
          FovDegrees: (CompiledScene.VerticalFovRad * 180) / Math.PI,
          OrthoHalfHeight: CompiledScene.OrthoHalfHeight,
        };
        const WorldRadius =
          DragRef.current?.Kind === "gizmo" && DragRef.current.GizmoDrag?.ActiveWorldRadius
            ? DragRef.current.GizmoDrag.ActiveWorldRadius
            : ComputeGizmoWorldRadius(SelectedGizmoTarget.Position, CamState, Aspect);

        const Built = BuildSlateGizmoGeometry(
          SelectedGizmoTarget.Position,
          Fwd,
          WorldRadius,
        );
        BuiltGizmoRef.current = Built;

        const ViewProj = BuildColumnMajorViewProj(
          { Right, Up, Forward: Fwd },
          CamState,
          Aspect,
        );
        const Highlighted = ActiveHandle !== GizmoHandle.None ? ActiveHandle : HoveredHandle;

        Gl.useProgram(State.GizmoProg);
        Gl.uniformMatrix4fv(State.GizmoUniforms.uViewProj, false, ViewProj);
        Gl.uniform1f(State.GizmoUniforms.uHighlightedHandle, Highlighted);

        Gl.bindVertexArray(State.GizmoVao);
        Gl.bindBuffer(Gl.ARRAY_BUFFER, State.GizmoVbo);
        Gl.enable(Gl.DEPTH_TEST);
        Gl.depthFunc(Gl.LEQUAL);
        Gl.depthMask(true);
        Gl.disable(Gl.CULL_FACE);

        // Opaque gizmo handles (cones, scale cylinders, border strips, rotation arcs, center ring)
        Gl.disable(Gl.BLEND);
        Gl.bufferData(Gl.ARRAY_BUFFER, Built.OpaqueBuffer, Gl.STREAM_DRAW);
        Gl.drawArrays(Gl.TRIANGLES, 0, Built.OpaqueVertexCount);

        // Translucent plane quads (0.28 alpha / 0.55 on hover)
        Gl.enable(Gl.BLEND);
        Gl.blendFunc(Gl.SRC_ALPHA, Gl.ONE_MINUS_SRC_ALPHA);
        Gl.depthMask(false);
        Gl.bufferData(Gl.ARRAY_BUFFER, Built.TranslucentBuffer, Gl.STREAM_DRAW);
        Gl.drawArrays(Gl.TRIANGLES, 0, Built.TranslucentVertexCount);

        Gl.depthMask(true);
        Gl.disable(Gl.BLEND);
        Gl.disable(Gl.DEPTH_TEST);
        Gl.bindVertexArray(null);
      } else {
        BuiltGizmoRef.current = null;
      }
    };

    Draw();
    const ResizeObs = new ResizeObserver(() => Draw());
    ResizeObs.observe(Canvas);
    return () => ResizeObs.disconnect();
  }, [
    CompiledScene,
    Selected,
    SelectedGizmoTarget,
    ViewMode,
    Debug,
    EffectiveGrid,
    EffectiveGizmo,
    HoveredHandle,
    ActiveHandle,
    TextureEpoch,
  ]);

  // RMB + WASDQE fly loop
  useEffect(() => {
    const Down = (Ev) => {
      if (
        Ev.target?.tagName === "INPUT" ||
        Ev.target?.tagName === "TEXTAREA" ||
        Ev.target?.isContentEditable
      )
        return;
      KeysRef.current.add(Ev.key.toLowerCase());
    };
    const Up = (Ev) => KeysRef.current.delete(Ev.key.toLowerCase());
    window.addEventListener("keydown", Down);
    window.addEventListener("keyup", Up);

    let Raf = 0;
    let Last = performance.now();
    const Step = (Now) => {
      const Dt = Math.min(0.05, (Now - Last) / 1000);
      Last = Now;
      if (DragRef.current?.Kind === "fly" && KeysRef.current.size && CameraCallback) {
        const { CameraOrigin, CameraTarget, WorldUp } = CompiledScene;
        const Fwd = NormalizeVec3([
          CameraTarget[0] - CameraOrigin[0],
          CameraTarget[1] - CameraOrigin[1],
          CameraTarget[2] - CameraOrigin[2],
        ]);
        const Right = NormalizeVec3(
          [
            Fwd[1] * WorldUp[2] - Fwd[2] * WorldUp[1],
            Fwd[2] * WorldUp[0] - Fwd[0] * WorldUp[2],
            Fwd[0] * WorldUp[1] - Fwd[1] * WorldUp[0],
          ],
          [1, 0, 0],
        );
        const Speed = (KeysRef.current.has("shift") ? 5.5 : 2.4) * Dt;
        let Move = [0, 0, 0];
        const Add = (V, S) => {
          Move = [Move[0] + V[0] * S, Move[1] + V[1] * S, Move[2] + V[2] * S];
        };
        if (KeysRef.current.has("w")) Add(Fwd, Speed);
        if (KeysRef.current.has("s")) Add(Fwd, -Speed);
        if (KeysRef.current.has("d")) Add(Right, Speed);
        if (KeysRef.current.has("a")) Add(Right, -Speed);
        if (KeysRef.current.has("e")) Add([0, 0, 1], Speed);
        if (KeysRef.current.has("q")) Add([0, 0, 1], -Speed);
        if (Math.hypot(Move[0], Move[1], Move[2]) > 1e-5) {
          CameraCallback({
            Position: CameraOrigin.map((C, I) => +(C + Move[I]).toFixed(3)),
            Target: CameraTarget.map((C, I) => +(C + Move[I]).toFixed(3)),
          });
        }
      }
      Raf = requestAnimationFrame(Step);
    };
    Raf = requestAnimationFrame(Step);
    return () => {
      cancelAnimationFrame(Raf);
      window.removeEventListener("keydown", Down);
      window.removeEventListener("keyup", Up);
    };
  }, [CompiledScene, CameraCallback]);

  const ComputePointerRay = (Event) => {
    const Rect = CanvasRef.current?.getBoundingClientRect();
    if (!Rect) return null;
    const U = (Event.clientX - Rect.left) / Math.max(1, Rect.width);
    const V = (Event.clientY - Rect.top) / Math.max(1, Rect.height);
    const Aspect = Rect.width / Math.max(1, Rect.height);
    return {
      U,
      V,
      Aspect,
      ...ComputeCameraRayAtUv(CompiledScene, U, V, Aspect),
    };
  };

  const OnPointerDown = (Event) => {
    const Canvas = CanvasRef.current;
    if (!Canvas) return;

    // 1. Check 3D Slate GizmoPRO handle hit on primary button first!
    if (
      Event.button === 0 &&
      !Event.altKey &&
      EffectiveGizmo &&
      SelectedGizmoTarget &&
      BuiltGizmoRef.current
    ) {
      const Ray = ComputePointerRay(Event);
      if (Ray) {
        const HitHandle = PickGizmoHandle(
          Ray.RayOrigin,
          Ray.RayDir,
          BuiltGizmoRef.current,
        );
        if (HitHandle !== GizmoHandle.None) {
          if (SelectedGizmoTarget.Locked) {
            SetGizmoReadout("Entity Locked");
            return;
          }
          Canvas.setPointerCapture?.(Event.pointerId);
          const GizmoDrag = BeginGizmoDrag(
            HitHandle,
            Ray.RayOrigin,
            Ray.RayDir,
            BuiltGizmoRef.current,
            SelectedGizmoTarget,
          );
          DragRef.current = {
            Kind: "gizmo",
            TargetId: SelectedGizmoTarget.Id,
            TargetKind: SelectedGizmoTarget.Kind,
            GizmoDrag,
          };
          SetActiveHandle(HitHandle);
          SetGizmoReadout(GIZMO_HANDLE_LABELS[HitHandle] || "");
          return;
        }
      }
    }

    Canvas.setPointerCapture?.(Event.pointerId);
    const Kind =
      Event.button === 2
        ? "fly"
        : Event.button === 1 || (Event.button === 0 && Event.shiftKey)
          ? "pan"
          : "orbit";
    DragRef.current = {
      Kind,
      StartX: Event.clientX,
      StartY: Event.clientY,
      Moved: false,
      OriginStart: [...CompiledScene.CameraOrigin],
      TargetStart: [...CompiledScene.CameraTarget],
    };
  };

  const OnPointerMove = (Event) => {
    const Drag = DragRef.current;

    // Hover highlight when not dragging
    if (!Drag) {
      if (EffectiveGizmo && SelectedGizmoTarget && BuiltGizmoRef.current) {
        const Ray = ComputePointerRay(Event);
        const NextHover = Ray
          ? PickGizmoHandle(Ray.RayOrigin, Ray.RayDir, BuiltGizmoRef.current)
          : GizmoHandle.None;
        if (NextHover !== HoveredHandle) SetHoveredHandle(NextHover);
      } else if (HoveredHandle !== GizmoHandle.None) {
        SetHoveredHandle(GizmoHandle.None);
      }
      return;
    }

    // Active 3D GizmoPRO drag
    if (Drag.Kind === "gizmo") {
      const Ray = ComputePointerRay(Event);
      if (!Ray) return;
      const Solved = SolveGizmoDrag(
        Drag.GizmoDrag,
        Ray.RayOrigin,
        Ray.RayDir,
        Event.ctrlKey || Event.metaKey,
      );
      SetGizmoReadout(Solved.Readout);
      OnTransformEntity?.(Drag.TargetId, Solved, Drag.TargetKind);
      return;
    }

    const Dx = Event.clientX - Drag.StartX;
    const Dy = Event.clientY - Drag.StartY;
    if (Math.hypot(Dx, Dy) > 4) Drag.Moved = true;
    if (!Drag.Moved || !CameraCallback || EffectiveProjection !== "PERSP") return;

    const Rel = [
      Drag.OriginStart[0] - Drag.TargetStart[0],
      Drag.OriginStart[1] - Drag.TargetStart[1],
      Drag.OriginStart[2] - Drag.TargetStart[2],
    ];
    const Dist = Math.max(0.4, Math.hypot(Rel[0], Rel[1], Rel[2]));

    if (Drag.Kind === "orbit") {
      const Az = Math.atan2(Rel[1], Rel[0]) - Dx * 0.0065;
      const El = Math.max(
        -1.38,
        Math.min(1.38, Math.asin(Math.max(-1, Math.min(1, Rel[2] / Dist))) + Dy * 0.0055),
      );
      const CosEl = Math.cos(El);
      CameraCallback({
        Position: [
          +(Drag.TargetStart[0] + Dist * CosEl * Math.cos(Az)).toFixed(3),
          +(Drag.TargetStart[1] + Dist * CosEl * Math.sin(Az)).toFixed(3),
          +(Drag.TargetStart[2] + Dist * Math.sin(El)).toFixed(3),
        ],
        Target: Drag.TargetStart,
      });
    } else if (Drag.Kind === "fly") {
      const FwdStart = NormalizeVec3([
        Drag.TargetStart[0] - Drag.OriginStart[0],
        Drag.TargetStart[1] - Drag.OriginStart[1],
        Drag.TargetStart[2] - Drag.OriginStart[2],
      ]);
      const Yaw = Math.atan2(FwdStart[1], FwdStart[0]) - Dx * 0.0045;
      const Pitch = Math.max(
        -1.42,
        Math.min(1.42, Math.asin(Math.max(-1, Math.min(1, FwdStart[2]))) - Dy * 0.0045),
      );
      const CosP = Math.cos(Pitch);
      const NextFwd = [CosP * Math.cos(Yaw), CosP * Math.sin(Yaw), Math.sin(Pitch)];
      CameraCallback({
        Position: Drag.OriginStart,
        Target: [
          +(Drag.OriginStart[0] + NextFwd[0] * Dist).toFixed(3),
          +(Drag.OriginStart[1] + NextFwd[1] * Dist).toFixed(3),
          +(Drag.OriginStart[2] + NextFwd[2] * Dist).toFixed(3),
        ],
      });
    } else if (Drag.Kind === "pan") {
      const Fwd = NormalizeVec3([
        Drag.TargetStart[0] - Drag.OriginStart[0],
        Drag.TargetStart[1] - Drag.OriginStart[1],
        Drag.TargetStart[2] - Drag.OriginStart[2],
      ]);
      const Right = NormalizeVec3([Fwd[1], -Fwd[0], 0], [1, 0, 0]);
      const Up = NormalizeVec3([
        Right[1] * Fwd[2] - Right[2] * Fwd[1],
        Right[2] * Fwd[0] - Right[0] * Fwd[2],
        Right[0] * Fwd[1] - Right[1] * Fwd[0],
      ]);
      const Scale = Dist * 0.0016;
      const Shift = [
        -Right[0] * Dx * Scale + Up[0] * Dy * Scale,
        -Right[1] * Dx * Scale + Up[1] * Dy * Scale,
        -Right[2] * Dx * Scale + Up[2] * Dy * Scale,
      ];
      CameraCallback({
        Position: Drag.OriginStart.map((C, I) => +(C + Shift[I]).toFixed(3)),
        Target: Drag.TargetStart.map((C, I) => +(C + Shift[I]).toFixed(3)),
      });
    }
  };

  const OnPointerUp = (Event) => {
    const Drag = DragRef.current;
    DragRef.current = null;
    if (Drag?.Kind === "gizmo") {
      SetActiveHandle(GizmoHandle.None);
      SetGizmoReadout("");
      return;
    }
    if (Drag && !Drag.Moved && Event.button === 0 && CanvasRef.current) {
      const Rect = CanvasRef.current.getBoundingClientRect();
      const U = (Event.clientX - Rect.left) / Math.max(1, Rect.width);
      const V = (Event.clientY - Rect.top) / Math.max(1, Rect.height);
      const HitId = PickSceneEntityAtUv(
        CompiledScene,
        U,
        V,
        Rect.width / Math.max(1, Rect.height),
      );
      if (HitId && SelectCallback) SelectCallback(HitId);
    }
  };

  const OnWheel = (Event) => {
    if (!CameraCallback || EffectiveProjection !== "PERSP") return;
    const { CameraOrigin, CameraTarget } = CompiledScene;
    const Fwd = NormalizeVec3([
      CameraTarget[0] - CameraOrigin[0],
      CameraTarget[1] - CameraOrigin[1],
      CameraTarget[2] - CameraOrigin[2],
    ]);
    const Dist = Math.hypot(
      CameraTarget[0] - CameraOrigin[0],
      CameraTarget[1] - CameraOrigin[1],
      CameraTarget[2] - CameraOrigin[2],
    );
    const Step = -Math.sign(Event.deltaY) * Math.max(0.18, Dist * 0.11);
    const NextOrigin = CameraOrigin.map((C, I) => +(C + Fwd[I] * Step).toFixed(3));
    if (
      Math.hypot(
        CameraTarget[0] - NextOrigin[0],
        CameraTarget[1] - NextOrigin[1],
        CameraTarget[2] - NextOrigin[2],
      ) > 0.35
    ) {
      CameraCallback({ Position: NextOrigin, Target: CameraTarget });
    }
  };

  const CursorStyle =
    ActiveHandle !== GizmoHandle.None
      ? "grabbing"
      : HoveredHandle !== GizmoHandle.None
        ? "grab"
        : "crosshair";

  return (
    <div
      className="gtx-world-stage"
      onContextMenu={(Ev) => Ev.preventDefault()}
    >
      <canvas
        ref={CanvasRef}
        className="gtx-world-canvas"
        aria-label="Tier 1 GTX World Viewport"
        style={{ cursor: CursorStyle }}
        onPointerDown={OnPointerDown}
        onPointerMove={OnPointerMove}
        onPointerUp={OnPointerUp}
        onWheel={OnWheel}
      />
      {(ActiveHandle !== GizmoHandle.None || HoveredHandle !== GizmoHandle.None || GizmoReadout) && (
        <div className="gtx-gizmo-readout" role="status" aria-live="polite">
          <span className="gtx-gizmo-dot" />
          <strong>
            {GizmoReadout || GIZMO_HANDLE_LABELS[HoveredHandle] || "GizmoPRO"}
          </strong>
          {ActiveHandle !== GizmoHandle.None && (
            <small>Hold Ctrl to snap</small>
          )}
        </div>
      )}
      {ShaderError && (
        <div className="gtx-shader-error" role="alert">
          GTX Shader Error: {ShaderError}
        </div>
      )}
      <button
        type="button"
        className="gtx-camera-home"
        title="Reset EditorCamera to C++ ShowcaseWorldSceneBundle Pose"
        onClick={() =>
          CameraCallback?.({
            Position: [...CanonicalEditorCamera.Position],
            Target: [...CanonicalEditorCamera.Target],
          })
        }
      >
        Reset Camera
      </button>
    </div>
  );
}
