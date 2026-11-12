//==========================================================================================================================================
//                                                    GTXWORLDVIEWPORT.JSX
//==========================================================================================================================================
// Live WebGL2 Tier 1 GTX World Viewport (Zero RT Hardware, ANGLE/D3D11/Metal TDR-Safe):
//   Pass 1: Analytical GTX World Render (Closed-Form Ray-Primitive Intersection, Ring-Free Contact-Hardening Solar Penumbra,
//           Analytical 6-Cone GI/AO, Clipped-Horizon Quad Softbox, 20-Channel OpenPBR Material Atlas, 2-Layer Abbe Glass)
//           -> Cached in Offscreen RGBA8 + EntityID FBO (only redrawn when scene/material/camera changes!)
//   Pass 2: Screen-Space 2px Anti-Aliased Silhouette Selection Outline (#F6C66B)
//   Pass 3: 1:1 C++ Slate 13-Handle TransformGizmo (GizmoPRO) with Hover Highlight, Skew-Line/Plane/Arc Dragging, Ctrl-Snap & HUD Readout

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanonicalEditorCamera,
  CompileLiveGtxScene,
  ComputeCameraRayAtUv,
  NormalizeVec3,
  PickSceneEntityAtUv,
  RowEffectivelyVisible,
} from "./ShowcaseGalleryScene.js";
import {
  ATLAS_COLS,
  ATLAS_HEIGHT,
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

export { RowEffectivelyVisible as PreviewVisible };

const MAX_PRIMS = 14;
const MAX_LIGHTS = 2;

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
// PASS 1: COMPACT, ZERO-UNROLL-EXPLOSION TIER 1 GTX WORLD FRAGMENT SHADER
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
uniform int   uViewMode;
uniform int   uShowGrid;
uniform int   uSelectedCode;

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
uniform vec4  uPrimRotCol0[${MAX_PRIMS}];    // xyz = local +X in world, w = abbeNumber
uniform vec4  uPrimRotCol1[${MAX_PRIMS}];    // xyz = local +Y in world, w = unused
uniform vec4  uPrimRotCol2[${MAX_PRIMS}];    // xyz = local +Z in world, w = unused
uniform vec4  uPrimEdgeTint[${MAX_PRIMS}];   // rgb = F82 edge tint, w = base transmission
uniform vec4  uPrimGiBounce[${MAX_PRIMS}];   // rgb = diffuse bounce albedo, w = emission nit
uniform sampler2D uMaterialAtlas;

const float PI = 3.14159265359;
const float ATLAS_W = ${ATLAS_WIDTH}.0;
const float ATLAS_H = ${ATLAS_HEIGHT}.0;
const float TILE_PX = ${ATLAS_TILE_SIZE}.0;

bool PrimFlagShadow(int i) { int f = int(uPrimHalfFlags[i].w + 0.5); return (f & 1) != 0; }
bool PrimFlagGi(int i)     { int f = int(uPrimHalfFlags[i].w + 0.5); return (f & 2) != 0; }
bool PrimFlagGlass(int i)  { int f = int(uPrimHalfFlags[i].w + 0.5); return (f & 4) != 0; }

// Zero-trig CPU-precomputed orthogonal rotation transforms (3 dot products -> tiny SPIR-V & instant FXC compile!)
vec3 invRotatePrim(vec3 v, int i) {
  return vec3(
    dot(uPrimRotCol0[i].xyz, v),
    dot(uPrimRotCol1[i].xyz, v),
    dot(uPrimRotCol2[i].xyz, v)
  );
}

vec3 fwdRotatePrim(vec3 v, int i) {
  return uPrimRotCol0[i].xyz * v.x + uPrimRotCol1[i].xyz * v.y + uPrimRotCol2[i].xyz * v.z;
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

float sdTorusZ(vec3 p, float majorR, float minorR) {
  vec2 q = vec2(length(p.xy) - majorR, p.z);
  return length(q) - minorR;
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

void computeCurvedUvAndTangent(vec3 lp, vec3 h, int shape, out vec2 uv, out vec3 lt) {
  float phi = atan(lp.y, lp.x);
  float u = fract(phi / (2.0 * PI) + 0.5);
  lt = length(lp.xy) > 1e-4 ? normalize(vec3(-lp.y, lp.x, 0.0)) : vec3(1.0, 0.0, 0.0);
  if (shape == 1) {
    float nz = clamp(lp.z / max(h.z, 1e-4), -1.0, 1.0);
    uv = vec2(u, clamp(1.0 - acos(nz) / PI, 0.0, 1.0));
  } else if (shape == 4) {
    float majorR = max(h.x, h.y) * 0.68;
    float pol = atan(lp.z, length(lp.xy) - majorR);
    uv = vec2(u, fract(pol / (2.0 * PI) + 0.5));
  } else {
    uv = vec2(u, clamp((lp.z / max(h.z, 1e-4)) * 0.5 + 0.5, 0.0, 1.0));
  }
}

// Branch-minimal scalar-T ray-primitive intersection (zero short-circuit CFG bloat -> ultra-fast FXC compile!)
float intersectPrimT(vec3 lo, vec3 ld, vec3 h, int shape, float tMax, float bf) {
  if (shape == 1) {
    vec3 o = lo / h;
    vec3 d = ld / h;
    float a = dot(d, d);
    float b = dot(o, d);
    float disc = b * b - a * (dot(o, o) - 1.0);
    if (disc < 0.0) return tMax;
    float sq = sqrt(disc);
    float t0 = (-b - sq) / a;
    float t1 = (-b + sq) / a;
    float tFront = mix(t1, t0, step(0.0015, t0));
    float tCand = mix(tFront, t1, bf);
    return mix(tMax, tCand, step(0.0015, tCand) * step(tCand, tMax));
  }

  if (shape >= 2) {
    float rad = max(h.x, h.y) * (shape == 3 ? 0.65 : 1.0);
    float hz  = h.z;
    float bestT = tMax;
    float a = dot(ld.xy, ld.xy);
    float b = dot(lo.xy, ld.xy);
    float disc = b * b - a * (dot(lo.xy, lo.xy) - rad * rad);
    if (a > 1e-6 && disc >= 0.0) {
      float sq = sqrt(disc);
      float t0 = (-b - sq) / a;
      float t1 = (-b + sq) / a;
      float tSide = mix(mix(t1, t0, step(0.0015, t0)), t1, bf);
      float validS = step(0.0015, tSide) * step(tSide, bestT) * step(abs(lo.z + ld.z * tSide), hz);
      bestT = mix(bestT, tSide, validS);
    }
    if (abs(ld.z) > 1e-6) {
      float invZ = 1.0 / ld.z;
      float c0 = (-hz - lo.z) * invZ;
      float c1 = ( hz - lo.z) * invZ;
      float tcMin = min(c0, c1);
      float tcMax = max(c0, c1);
      float tCap = mix(mix(tcMax, tcMin, step(0.0015, tcMin)), tcMax, bf);
      vec2 xy = lo.xy + ld.xy * tCap;
      float validC = step(0.0015, tCap) * step(tCap, bestT) * step(dot(xy, xy), rad * rad);
      bestT = mix(bestT, tCap, validC);
    }
    return bestT;
  }

  vec3 safeSign = step(vec3(0.0), ld) * 2.0 - 1.0;
  vec3 invD = 1.0 / (safeSign * max(abs(ld), vec3(1e-6)));
  vec3 t0 = (-h - lo) * invD;
  vec3 t1 = ( h - lo) * invD;
  float tNear = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  float tFar  = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  if (tNear > tFar || tFar < 0.0015) return tMax;
  float tCand = mix(mix(tFar, tNear, step(0.0015, tNear)), tFar, bf);
  return mix(tMax, tCand, step(0.0015, tCand) * step(tCand, tMax));
}

HitInfo finalizeHit(vec3 ro, vec3 rd, int idx, float t, bool backface) {
  HitInfo info;
  info.hit = true;
  info.t = t;
  info.pos = ro + rd * t;
  info.primIdx = idx;

  vec3 center = uPrimPosShape[idx].xyz;
  int  shape  = int(uPrimPosShape[idx].w + 0.5);
  vec3 h      = uPrimHalfFlags[idx].xyz;
  vec3 lp     = invRotatePrim(info.pos - center, idx);

  vec3 ln;
  vec3 lt;
  vec2 uv;
  if (shape == 1) {
    ln = normalize(lp / (h * h));
    computeCurvedUvAndTangent(lp, h, 1, uv, lt);
  } else if (shape == 4) {
    float majorR = max(h.x, h.y) * 0.68;
    vec2 radDir = length(lp.xy) > 1e-5 ? normalize(lp.xy) : vec2(1.0, 0.0);
    ln = normalize(lp - vec3(radDir * majorR, 0.0));
    computeCurvedUvAndTangent(lp, h, 4, uv, lt);
  } else if (shape >= 2) {
    if (abs(abs(lp.z) - h.z) < 0.003) {
      ln = vec3(0.0, 0.0, step(0.0, lp.z) * 2.0 - 1.0);
    } else {
      ln = vec3(length(lp.xy) > 1e-5 ? normalize(lp.xy) : vec2(1.0, 0.0), 0.0);
    }
    computeCurvedUvAndTangent(lp, h, shape, uv, lt);
  } else {
    vec3 d = abs(lp) - h;
    vec3 sg = step(vec3(0.0), lp) * 2.0 - 1.0;
    if (d.x >= d.y && d.x >= d.z)      ln = vec3(sg.x, 0.0, 0.0);
    else if (d.y >= d.x && d.y >= d.z) ln = vec3(0.0, sg.y, 0.0);
    else                               ln = vec3(0.0, 0.0, sg.z);
    computeBoxUvAndTangent(lp, h, ln, uv, lt);
  }

  info.normal  = fwdRotatePrim(backface ? -ln : ln, idx);
  info.tangent = fwdRotatePrim(lt, idx);
  info.uv      = uv;
  return info;
}

// Primary camera ray trace: evaluates only scalar t inside the loop, finalizing UV/normal ONCE for the winning primitive!
HitInfo tracePrimaryScene(vec3 ro, vec3 rd, float tMax) {
  float bestT = tMax;
  int bestIdx = -1;

  for (int i = 0; i < ${MAX_PRIMS}; ++i) {
    if (i >= uPrimCount) break;
    vec4 ps = uPrimPosShape[i];
    int shape = int(ps.w + 0.5);
    vec3 h = uPrimHalfFlags[i].xyz;
    vec3 lo = invRotatePrim(ro - ps.xyz, i);
    vec3 ld = invRotatePrim(rd, i);

    if (shape == 4) {
      float majorR = max(h.x, h.y) * 0.68;
      float minorR = max(0.04, h.z * 0.55);
      vec3 bound = vec3(majorR + minorR + 0.04, majorR + minorR + 0.04, minorR + 0.04);
      vec3 safeSign = step(vec3(0.0), ld) * 2.0 - 1.0;
      vec3 invD = 1.0 / (safeSign * max(abs(ld), vec3(1e-6)));
      vec3 t0 = (-bound - lo) * invD;
      vec3 t1 = ( bound - lo) * invD;
      float tNear = max(0.002, max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z)));
      float tFar  = min(bestT, min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z)));
      if (tNear <= tFar) {
        float t = tNear;
        for (int s = 0; s < 14; ++s) {
          float d = sdTorusZ(lo + ld * t, majorR, minorR);
          if (d < 0.0018) {
            bestT = t;
            bestIdx = i;
            break;
          }
          t += max(0.006, d);
          if (t > tFar) break;
        }
      }
      continue;
    }

    float tCand = intersectPrimT(lo, ld, h, shape, bestT, 0.0);
    if (tCand < bestT) {
      bestT = tCand;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) return finalizeHit(ro, rd, bestIdx, bestT, false);
  HitInfo miss;
  miss.hit = false;
  miss.t = tMax;
  miss.primIdx = -1;
  miss.uv = vec2(0.5);
  miss.tangent = vec3(1.0, 0.0, 0.0);
  return miss;
}

HitInfo traceOpaqueSceneIgnoring(vec3 ro, vec3 rd, float tMax, int ignoreIdx) {
  float bestT = tMax;
  int bestIdx = -1;
  for (int i = 0; i < ${MAX_PRIMS}; ++i) {
    if (i >= uPrimCount) break;
    if (i == ignoreIdx || PrimFlagGlass(i)) continue;
    vec4 ps = uPrimPosShape[i];
    float tCand = intersectPrimT(
      invRotatePrim(ro - ps.xyz, i),
      invRotatePrim(rd, i),
      uPrimHalfFlags[i].xyz,
      int(ps.w + 0.5),
      bestT,
      0.0
    );
    if (tCand < bestT) {
      bestT = tCand;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) return finalizeHit(ro, rd, bestIdx, bestT, false);
  HitInfo miss;
  miss.hit = false;
  miss.t = tMax;
  miss.primIdx = -1;
  miss.uv = vec2(0.5);
  miss.tangent = vec3(1.0, 0.0, 0.0);
  return miss;
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
// ZERO-LOOP, RING-FREE ANALYTICAL CONTACT-HARDENING SOLAR SHADOWS (SKIPPING RECEIVER selfPrimIdx)
//------------------------------------------------------------------------------------------------------------------------------------------
float closestRayPrimitiveSoftVis(vec3 origin, vec3 dir, int idx, float tanSun) {
  vec3 center = uPrimPosShape[idx].xyz;
  int  shape  = int(uPrimPosShape[idx].w + 0.5);
  vec3 h      = uPrimHalfFlags[idx].xyz;

  vec3 lo = invRotatePrim(origin - center, idx);
  vec3 ld = invRotatePrim(dir, idx);

  float boundR = length(h) * 1.35;
  float tCenter = -dot(lo, ld);
  if (tCenter < -boundR) return 1.0;
  float maxPenumbra = 0.005 + max(0.05, tCenter) * tanSun;
  vec3 perp = lo + ld * max(0.0, tCenter);
  if (length(perp) > boundR + maxPenumbra) return 1.0;

  if (shape == 1) {
    vec3 o = lo / h;
    vec3 d = ld / h;
    float dLen = max(length(d), 1e-5);
    vec3 dn = d / dLen;
    float tUnit = -dot(o, dn);
    if (tUnit <= 0.0) return 1.0;
    float rMean = (h.x + h.y + h.z) * 0.3333333;
    float worldT = tUnit / dLen;
    float signedClearance = (length(o + dn * tUnit) - 1.0) * rMean;
    float coneR = 0.004 + worldT * tanSun;
    return smoothstep(-coneR * 0.35, coneR, signedClearance);
  }

  vec3 hPen = h + vec3(maxPenumbra);
  vec3 safeSign = step(vec3(0.0), ld) * 2.0 - 1.0;
  vec3 invD = 1.0 / (safeSign * max(abs(ld), vec3(1e-6)));
  vec3 t0 = (-hPen - lo) * invD;
  vec3 t1 = ( hPen - lo) * invD;
  float tNearPen = max(0.004, max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z)));
  float tFarPen  = min(18.0,  min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z)));
  if (tNearPen > tFarPen) return 1.0;

  float tMid = 0.5 * (tNearPen + tFarPen);
  float coneR = 0.004 + tMid * tanSun;
  vec3 lp = lo + ld * tMid;

  float dSil = (shape >= 2)
    ? max(length(lp.xy) - max(h.x, h.y), abs(lp.z) - max(h.z, coneR * 1.25))
    : sdBox(lp, max(h, vec3(coneR * 1.25)));
  return smoothstep(-coneR, coneR, dSil);
}

float evaluateSoftConeVis(vec3 origin, vec3 dir, float maxDist, float tanAngle, float minVis, int selfPrimIdx) {
  float vis = 1.0;
  for (int i = 0; i < ${MAX_PRIMS}; ++i) {
    if (i >= uPrimCount) break;
    if (i == selfPrimIdx || !PrimFlagShadow(i) || PrimFlagGlass(i)) continue;
    float tProj = dot(uPrimPosShape[i].xyz - origin, dir);
    if (tProj <= -0.5 || tProj >= maxDist) continue;
    vis = min(vis, mix(minVis, 1.0, closestRayPrimitiveSoftVis(origin, dir, i, tanAngle)));
    if (vis <= minVis + 0.002) return minVis;
  }
  return vis;
}

float evaluateGtxSolarShadow(vec3 pos, vec3 N, int selfPrimIdx) {
  if (dot(N, uSunDir) <= 0.0) return 0.0;
  return evaluateSoftConeVis(pos + N * 0.006, uSunDir, 28.0, tan(uSunAngularRadius * 2.1), 0.0, selfPrimIdx);
}

float evaluateAreaLightSoftVis(vec3 pos, vec3 N, vec3 lc, float hw, float hh, int selfPrimIdx) {
  vec3 toL = lc - pos;
  float distL = length(toL);
  if (distL < 0.05) return 1.0;
  float tanArea = clamp(length(vec2(hw, hh)) * 0.65 / max(distL, 0.35), 0.18, 0.55);
  return evaluateSoftConeVis(pos + N * 0.008, toL / distL, distL - 0.04, tanArea, 0.38, selfPrimIdx);
}

void buildBasis(vec3 N, out vec3 T, out vec3 B) {
  vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  T = normalize(cross(up, N));
  B = cross(N, T);
}

// Fast Clipped 4-Subquad Solid-Angle Area Light Integration (zero horizon leak, tiny compiled code!)
vec3 evaluateAreaQuadDiffuse(vec3 P, vec3 N, vec3 lCenter, float hw, float hh, vec3 emit) {
  vec3 sum = vec3(0.0);
  for (int sy = -1; sy <= 1; sy += 2) {
    for (int sx = -1; sx <= 1; sx += 2) {
      vec3 sp = lCenter + vec3(float(sx) * hw * 0.5, float(sy) * hh * 0.5, 0.0);
      vec3 dv = sp - P;
      float d2 = max(dot(dv, dv), 0.08);
      vec3 wi = dv * inversesqrt(d2);
      float cSurf = max(0.0, dot(N, wi));
      float cEmit = max(0.0, -wi.z);
      if (cSurf > 0.0 && cEmit > 0.0) {
        float dOmega = min((hw * hh * cEmit) / d2, 0.85);
        sum += emit * (cSurf * dOmega / PI);
      }
    }
  }
  return sum;
}

//------------------------------------------------------------------------------------------------------------------------------------------
// OPENPBR SURFACE BRDF
//------------------------------------------------------------------------------------------------------------------------------------------
float evaluateOrenNayar(vec3 N, vec3 V, vec3 L, float diffRough) {
  float NdotL = max(0.0, dot(N, L));
  float NdotV = max(1e-4, dot(N, V));
  if (NdotL <= 0.0) return 0.0;
  float s = dot(L, V) - NdotL * NdotV;
  float tF = s > 0.0 ? max(NdotL, NdotV) : 1.0;
  float A = 1.0 / (PI + (PI * 0.5 - 0.666667) * diffRough);
  float Bf = diffRough * A;
  return NdotL * (A + Bf * (s / max(tF, 1e-4)));
}

vec3 fresnelConductorF82(float VdotH, vec3 F0, vec3 F82Tint) {
  float mu = clamp(VdotH, 0.0, 1.0);
  float om = 1.0 - mu;
  float p5 = om * om * om * om * om;
  vec3 schlick = F0 + (1.0 - F0) * p5;
  const float muBar = 1.0 / 7.0;
  const float omBar = 6.0 / 7.0;
  float omBar5 = omBar * omBar * omBar * omBar * omBar;
  vec3 schlickBar = F0 + (1.0 - F0) * omBar5;
  vec3 b = (schlickBar * (1.0 - F82Tint)) / (muBar * omBar5 * omBar);
  return clamp(schlick - b * mu * p5 * om, vec3(0.0), vec3(1.0));
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
  float sin2h = max(1e-4, 1.0 - NdotH * NdotH);
  return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);
}

vec3 evaluateOpenPbrDirect(
  vec3 N, vec3 Nc, vec3 T, vec3 B, vec3 V, vec3 L,
  SampledMaterial mat, vec3 edgeTint
) {
  float NdotL = max(0.0, dot(N, L));
  float NdotV = max(1e-4, dot(N, V));
  vec3 outBrdf = vec3(0.0);

  if (dot(mat.subsurfaceColor, vec3(0.3333)) > 0.005) {
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
  vec3 F = mix(vec3(dielF), fresnelConductorF82(VdotH, mat.baseColor, edgeTint), mat.metallic);

  vec3 spec = D * Vis * F * NdotL;
  vec3 kD = (1.0 - F) * (1.0 - mat.metallic) * (1.0 - mat.transmission);
  vec3 diff = kD * mat.baseColor * evaluateOrenNayar(N, V, L, mat.diffuseRoughness);

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
// C1-SMOOTH ANALYTICAL SOLID-ANGLE GI + AO (ZERO DISCRETE RAY GHOST CIRCLES, ZERO BANDS, ZERO SDF RINGS!)
//------------------------------------------------------------------------------------------------------------------------------------------
void evaluateGtxConeGiAndAo(vec3 pos, vec3 N, int selfPrimIdx, out vec3 indirectIrradiance, out float aoOut) {
  float skyWeight = clamp(N.z * 0.5 + 0.5, 0.0, 1.0);
  vec3 skyAmb = mix(vec3(0.055, 0.053, 0.052), evalSky(vec3(N.xy * 0.35, max(0.25, N.z))), skyWeight) * 0.78;

  vec3 bounceAccum = vec3(0.0);
  float aoOcc = 0.0;

  for (int i = 0; i < ${MAX_PRIMS}; ++i) {
    if (i >= uPrimCount) break;
    if (i == selfPrimIdx || PrimFlagGlass(i)) continue;

    vec3 center = uPrimPosShape[i].xyz;
    int  shape  = int(uPrimPosShape[i].w + 0.5);
    vec3 h      = uPrimHalfFlags[i].xyz;

    float occContribution = 0.0;
    float giFormFactor    = 0.0;
    vec3  emitterNormal   = -N;

    if (shape == 1) {
      vec3 toSphere = center - pos;
      float dist2 = max(1e-4, dot(toSphere, toSphere));
      float dist  = sqrt(dist2);
      vec3 dir    = toSphere / dist;
      float rEff  = (h.x + h.y + h.z) * 0.3333333;
      float cosN  = dot(N, dir);
      float sinH  = clamp(rEff / max(dist, rEff + 1e-3), 0.0, 0.98);
      float horizon = smoothstep(-sinH, sinH * 0.85 + 0.25, cosN);
      float solidRatio = (rEff * rEff) / max(dist2, rEff * rEff * 1.05);
      float nearFade = exp(-max(0.0, dist - rEff) / 0.55);
      occContribution = horizon * solidRatio * nearFade * 0.75;
      giFormFactor    = horizon * solidRatio * 0.35;
      emitterNormal   = -dir;
    } else {
      vec3 lp = invRotatePrim(pos - center, i);
      vec3 ln = invRotatePrim(N, i);
      vec3 farCorner = (step(vec3(0.0), ln) * 2.0 - 1.0) * h;
      float maxAboveHorizon = dot(ln, farCorner - lp);

      if (maxAboveHorizon > 0.002) {
        vec3 closestLocal = clamp(lp, -h, h);
        vec3 diffLocal = closestLocal - lp;
        float dist2 = dot(diffLocal, diffLocal);
        float dist  = sqrt(max(1e-5, dist2));

        vec3 relNorm = lp / max(h, vec3(0.02));
        vec3 absR = abs(relNorm);
        vec3 sg = step(vec3(0.0), relNorm) * 2.0 - 1.0;
        vec3 boxFaceLocal;
        float faceArea;
        if (absR.x >= absR.y && absR.x >= absR.z) {
          boxFaceLocal = vec3(sg.x, 0.0, 0.0);
          faceArea = 4.0 * h.y * h.z;
        } else if (absR.y >= absR.x && absR.y >= absR.z) {
          boxFaceLocal = vec3(0.0, sg.y, 0.0);
          faceArea = 4.0 * h.x * h.z;
        } else {
          boxFaceLocal = vec3(0.0, 0.0, sg.z);
          faceArea = 4.0 * h.x * h.y;
        }
        emitterNormal = fwdRotatePrim(boxFaceLocal, i);

        vec3 invDistDiff = diffLocal * inversesqrt(max(1e-5, dist2));
        float receiverCos = clamp(dot(ln, invDistDiff) * 0.5 + 0.5, 0.0, 1.0);
        float horizonFade = clamp(maxAboveHorizon / (dist + 0.45), 0.0, 1.0);

        float contact = exp(-dist / 0.38) * horizonFade * receiverCos;
        float solidOmega = faceArea / (faceArea + PI * (dist2 + 0.28));
        occContribution = contact * 0.38 + solidOmega * exp(-dist / 1.1) * horizonFade * 0.12;

        float emitterCos = max(0.0, dot(boxFaceLocal, -invDistDiff));
        giFormFactor = solidOmega * horizonFade * (0.35 + 0.65 * receiverCos) * (0.35 + 0.65 * emitterCos);
      }
    }

    aoOcc += occContribution;

    if (giFormFactor > 1e-4 && PrimFlagGi(i)) {
      vec3 bAlbedo = uPrimGiBounce[i].rgb;
      float bEmit  = uPrimGiBounce[i].w;
      vec3 patchRad = bAlbedo * bEmit;

      float sunNdotL = max(0.0, dot(emitterNormal, uSunDir));
      patchRad += (bAlbedo / PI) * uSunIrradiance * (sunNdotL * 0.62 + 0.10);

      if (uLightCount > 0) {
        vec3 lc = uLightCenterHalfW[0].xyz;
        vec3 toL = lc - center;
        float d2 = max(0.6, dot(toL, toL));
        vec3 lDir = toL * inversesqrt(d2);
        float area = 4.0 * uLightCenterHalfW[0].w * uLightHalfHRad[0].x;
        patchRad += (bAlbedo / PI) * uLightHalfHRad[0].yzw
                  * (max(0.15, dot(emitterNormal, lDir)) * max(0.1, -lDir.z) * area / (PI * d2));
      }

      bounceAccum += patchRad * giFormFactor * 1.35;
    }
  }

  aoOut = clamp(1.0 - aoOcc, 0.26, 1.0);
  indirectIrradiance = skyAmb * mix(0.45, 1.0, aoOut) + bounceAccum;
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

  vec3 Tbase = normalize(Tg - Nshade * dot(Tg, Nshade));
  vec3 Bbase = cross(Nshade, Tbase);
  float ca = cos(mat.anisoRotation);
  float sa = sin(mat.anisoRotation);
  Tshade = ca * Tbase + sa * Bbase;
  Bshade = -sa * Tbase + ca * Bbase;
}

// Ultra-compact zero-loop secondary hit shader (reflections & glass refraction -> eliminates 3x14 shadow unrolls!)
vec3 shadeSecondaryBounceHit(HitInfo hit, vec3 V) {
  int idx = hit.primIdx;
  SampledMaterial mat = fetchMaterial(idx, hit.uv);
  if (mat.unlit) return mat.baseColor * (1.0 + mat.emission);

  vec3 N = hit.normal;
  vec3 Lo = mat.baseColor * mat.emission;

  float nSun = max(0.0, dot(N, uSunDir));
  if (nSun > 0.0) {
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(0.0, dot(N, H)), mix(16.0, 256.0, 1.0 - mat.roughness));
    vec3 F = mix(vec3(0.04), mat.baseColor, mat.metallic);
    float roomOpen = smoothstep(-2.4, 0.2, -abs(hit.pos.x) + 1.1);
    Lo += ((1.0 - mat.metallic) * (mat.baseColor / PI) * nSun + F * spec * 0.45) * uSunIrradiance * (0.45 + 0.55 * roomOpen);
  }

  if (uLightCount > 0) {
    vec3 lc = uLightCenterHalfW[0].xyz;
    vec3 toL = lc - hit.pos;
    float d2 = max(0.25, dot(toL, toL));
    vec3 lDir = toL * inversesqrt(d2);
    float area = 4.0 * uLightCenterHalfW[0].w * uLightHalfHRad[0].x;
    float cSurf = max(0.0, dot(N, lDir));
    float cEmit = max(0.0, -lDir.z);
    Lo += (1.0 - mat.metallic) * (mat.baseColor / PI) * uLightHalfHRad[0].yzw * (cSurf * cEmit * area / d2);
  }

  vec3 amb = evalSky(N) * 0.50
           + vec3(0.15, 0.015, 0.012) * max(-N.x, 0.0)
           + vec3(0.015, 0.14, 0.025) * max(N.x, 0.0);
  Lo += mat.baseColor * (1.0 - mat.metallic) * amb * mat.ao;
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

  // 2. Clipped quad area lights + hoisted softbox penumbra (only 1 soft-shadow loop total -> fast FXC compile!)
  float areaVis0 = (uLightCount > 0)
    ? evaluateAreaLightSoftVis(hit.pos, N, uLightCenterHalfW[0].xyz, uLightCenterHalfW[0].w, uLightHalfHRad[0].x, idx)
    : 1.0;

  for (int li = 0; li < ${MAX_LIGHTS}; ++li) {
    if (li >= uLightCount) break;
    vec3 lc = uLightCenterHalfW[li].xyz;
    float hw = uLightCenterHalfW[li].w;
    float hh = uLightHalfHRad[li].x;
    vec3 emit = uLightHalfHRad[li].yzw;

    vec3 diffLight = evaluateAreaQuadDiffuse(hit.pos, N, lc, hw, hh, emit);
    if (dot(diffLight, vec3(1.0)) > 1e-5) {
      float areaVis = (li == 0) ? areaVis0 : 1.0;

      vec3 kD = (1.0 - mat.metallic) * (1.0 - mat.transmission) * mat.baseColor;
      Lo += kD * diffLight * areaVis;

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

  // 3. Smooth analytical solid-angle GI + AO
  vec3 giIrr;
  float sceneAo;
  evaluateGtxConeGiAndAo(hit.pos, N, idx, giIrr, sceneAo);
  float totalAo = sceneAo * mat.ao;
  float VdotN = max(0.0, dot(V, N));
  vec3 Fenv = mix(vec3(fresnelDielectric(VdotN, mat.ior)), fresnelConductorF82(VdotN, mat.baseColor, edgeTint), mat.metallic);
  vec3 kD = (1.0 - Fenv) * (1.0 - mat.metallic) * (1.0 - mat.transmission);
  Lo += kD * mat.baseColor * giIrr * totalAo;

  if (dot(mat.sheenColor, vec3(1.0)) > 0.003) {
    Lo += mat.sheenColor * giIrr * pow(1.0 - VdotN, 3.0) * 0.45 * totalAo;
  }

  // 4. Roughness-filtered specular reflection: crisp ray-trace ONLY on smooth mirrors/metals/clearcoat,
  //    blending smoothly into prefiltered sky/room environment on rougher dielectrics (zero mirror-plaster artifact!)
  vec3 R = reflect(-V, mat.coat > 0.35 ? Nc : N);
  float baseMirror = smoothstep(0.28, 0.04, mat.roughness) * mix(0.35, 1.0, mat.metallic);
  float coatMirror = mat.coat * smoothstep(0.26, 0.02, mat.coatRoughness);
  float raySharpness = max(baseMirror, coatMirror);

  vec3 roughEnv = mix(giIrr, evalSky(R), 0.55);
  vec3 specEnvRad = roughEnv;

  if (uViewMode == 0 && raySharpness > 0.02) {
    vec3 reflEmit;
    int reflLIdx;
    HitInfo rHit = traceOpaqueSceneIgnoring(hit.pos + N * 0.012, R, 22.0, idx);
    float tQuad = traceLightQuad(hit.pos + N * 0.012, R, rHit.t, reflEmit, reflLIdx);
    vec3 sharpRad = (tQuad < rHit.t)
      ? reflEmit
      : (rHit.hit ? shadeSecondaryBounceHit(rHit, -R) : evalSky(R));
    specEnvRad = mix(roughEnv, sharpRad, raySharpness);
  }

  float envEnergy = (1.0 - mat.roughness * 0.78);
  vec3 reflWeight = Fenv * envEnergy * envEnergy * mix(0.28, 1.0, max(mat.metallic, raySharpness));
  if (mat.coat > 0.005) {
    float Fc = fresnelDielectric(max(0.0, dot(V, Nc)), 1.5) * mat.coat * (1.0 - mat.coatRoughness * 0.7);
    reflWeight = max(reflWeight, vec3(Fc));
  }
  Lo += specEnvRad * reflWeight * mix(0.45, 1.0, totalAo);

  if (uViewMode == 3) {
    float rim = 1.0 - abs(dot(N, V));
    vec3 gridP = abs(fract(hit.pos * 4.0) - 0.5);
    float wire = smoothstep(0.045, 0.01, min(min(gridP.x, gridP.y), gridP.z));
    Lo = mix(Lo * 0.22, vec3(0.42, 0.78, 1.0), max(wire, smoothstep(0.72, 0.96, rim)));
  }

  return Lo;
}

// Streamlined 2-Layer Abbe Dispersive Glass / Opacity Shell (only 2 secondary traces -> < 45 KB total SPIR-V!)
vec3 shadeTwoLayerGlass(HitInfo frontHit, vec3 rd) {
  int idx = frontHit.primIdx;
  SampledMaterial mat = fetchMaterial(idx, frontHit.uv);
  vec3 N, Nc, T, B;
  buildShadingFrame(frontHit, mat, N, Nc, T, B);
  vec3 V = -rd;

  float baseIor = max(1.03, mat.ior);
  float abbe = max(14.0, uPrimRotCol0[idx].w > 1.0 ? uPrimRotCol0[idx].w : 26.0);
  float spread = (baseIor - 1.0) / abbe * 1.5;

  float F = fresnelDielectric(max(0.0, dot(V, N)), baseIor);
  vec3 R = reflect(rd, N);
  vec3 reflEmit;
  int reflL;
  HitInfo reflHit = traceOpaqueSceneIgnoring(frontHit.pos + N * 0.012, R, 24.0, idx);
  float tReflQuad = traceLightQuad(frontHit.pos + N * 0.012, R, reflHit.t, reflEmit, reflL);
  vec3 reflRad = (tReflQuad < reflHit.t)
    ? reflEmit
    : (reflHit.hit ? shadeSecondaryBounceHit(reflHit, -R) : evalSky(R));

  bool isRefractive = mat.transmission >= 0.15;
  vec3 exitPos = frontHit.pos + rd * 0.015;
  vec3 exitDir = rd;
  float pathThickness = 0.0;

  if (isRefractive) {
    vec3 tIn = refract(rd, N, 1.0 / baseIor);
    if (dot(tIn, tIn) < 1e-5) return reflRad;
    tIn = normalize(tIn);
    vec3 backOrigin = frontHit.pos + tIn * 0.008;
    float tBack = intersectPrimT(
      invRotatePrim(backOrigin - uPrimPosShape[idx].xyz, idx),
      invRotatePrim(tIn, idx),
      uPrimHalfFlags[idx].xyz,
      int(uPrimPosShape[idx].w + 0.5),
      6.0,
      1.0
    );
    if (tBack < 6.0) {
      HitInfo backHit = finalizeHit(backOrigin, tIn, idx, tBack, true);
      pathThickness = backHit.t;
      exitPos = backHit.pos;
      vec3 tOut = refract(tIn, backHit.normal, baseIor);
      exitDir = dot(tOut, tOut) > 1e-5 ? normalize(tOut) : reflect(tIn, backHit.normal);
    } else {
      pathThickness = 0.35;
      exitPos = frontHit.pos + tIn * 0.35;
      exitDir = tIn;
    }
  }

  vec3 bgEmit;
  int bgL;
  HitInfo bgHit = traceOpaqueSceneIgnoring(exitPos + exitDir * 0.012, exitDir, 32.0, idx);
  float tBg = traceLightQuad(exitPos + exitDir * 0.012, exitDir, bgHit.t, bgEmit, bgL);
  vec3 transRad = (tBg < bgHit.t)
    ? bgEmit
    : (bgHit.hit ? shadeSecondaryBounceHit(bgHit, -exitDir) : evalSky(exitDir));

  if (!isRefractive) {
    vec3 surfLit = mat.baseColor * (evalSky(N) * 0.55 + uSunIrradiance * max(0.0, dot(N, uSunDir)) * 0.65 + mat.emission);
    return mix(transRad, surfLit + reflRad * F, mat.opacity);
  }

  float edgeDisp = pow(1.0 - max(0.0, dot(V, N)), 1.5) * spread * 18.0;
  vec3 abbeChroma = clamp(vec3(1.0 + edgeDisp, 1.0, 1.0 - edgeDisp), vec3(0.74), vec3(1.30));
  vec3 atten = pow(clamp(mat.baseColor, vec3(0.04), vec3(1.0)), vec3(pathThickness * 1.45));
  vec3 sunH = normalize(V + uSunDir);
  float sunGlint = pow(max(0.0, dot(N, sunH)), 512.0) * 14.0;
  return reflRad * F + transRad * abbeChroma * atten * (1.0 - F) * max(0.25, mat.transmission) + uSunIrradiance * sunGlint + mat.baseColor * mat.emission;
}

vec3 acesFilm(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Pack (isSelected in bit 7) + (7-bit linear depth over 0..16 m) into single RGBA8 alpha byte (ZERO MRT!)
float encodeSelectionDepthAlpha(int entityCode, float hitDist) {
  if (entityCode <= 0) return 0.0;
  float normD = clamp(hitDist / 16.0, 0.0, 1.0);
  if (uSelectedCode > 0 && entityCode == uSelectedCode) {
    return (128.0 + floor(normD * 127.0 + 0.5)) / 255.0;
  }
  return (1.0 + floor(normD * 126.0 + 0.5)) / 255.0;
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

  HitInfo fullHit = tracePrimaryScene(ro, rd, 50.0);
  vec3 quadEmit;
  int hitLightIdx;
  float tQuad = traceLightQuad(ro, rd, fullHit.t, quadEmit, hitLightIdx);

  vec3 linearColor;
  int entityCode = 0;
  float hitDist = 50.0;

  if (uViewMode >= 10) {
    int dbg = uViewMode - 10;
    if (fullHit.hit) {
      entityCode = 1 + fullHit.primIdx;
      hitDist = fullHit.t;
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
    fragColor = vec4(clamp(linearColor, 0.0, 1.0), encodeSelectionDepthAlpha(entityCode, hitDist));
    return;
  }

  if (tQuad < fullHit.t) {
    linearColor = quadEmit;
    entityCode = 32 + hitLightIdx;
    hitDist = tQuad;
  } else if (fullHit.hit) {
    entityCode = 1 + fullHit.primIdx;
    hitDist = fullHit.t;
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
        // 100% derivative-free analytical ray-cone footprint AA (zero fwidth inside divergent flow control!)
        float pxWorld = max(0.004, (uOrthoHalfHeight > 0.0 ? uOrthoHalfHeight * 2.0 : tFloor * 2.0 * uTanHalfFov) / max(uResolution.y, 1.0) * 1.6);
        vec2 g1 = abs(fract(gp.xy) - 0.5) / pxWorld;
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

  fragColor = vec4(srgb, encodeSelectionDepthAlpha(entityCode, hitDist));
}
`;

//==========================================================================================================================================
// PASS 2: SINGLE-TEXTURE DEPTH-AWARE 2PX ANTI-ALIASED OUTER SILHOUETTE SELECTION OUTLINE SHADER
//==========================================================================================================================================
export const OUTLINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSceneTex;
uniform int       uSelectedCode;

void decodeSelAndDepth(float a, out bool isSel, out float depth) {
  int raw = int(floor(a * 255.0 + 0.5));
  if (raw >= 128) {
    isSel = true;
    depth = float(raw - 128) / 127.0;
  } else if (raw > 0) {
    isSel = false;
    depth = float(raw - 1) / 126.0;
  } else {
    isSel = false;
    depth = 1.0;
  }
}

void main() {
  ivec2 texSize = textureSize(uSceneTex, 0);
  ivec2 p = clamp(ivec2(gl_FragCoord.xy), ivec2(0), texSize - ivec2(1));
  vec4 center = texelFetch(uSceneTex, p, 0);
  vec3 color = center.rgb;

  if (uSelectedCode > 0) {
    bool centerSelected;
    float d0;
    decodeSelAndDepth(center.a, centerSelected, d0);

    const ivec2 offsets[12] = ivec2[12](
      ivec2( 1,  0), ivec2(-1,  0), ivec2( 0,  1), ivec2( 0, -1),
      ivec2( 1,  1), ivec2(-1,  1), ivec2( 1, -1), ivec2(-1, -1),
      ivec2( 2,  0), ivec2(-2,  0), ivec2( 0,  2), ivec2( 0, -2)
    );

    float edgeStrength = 0.0;
    for (int k = 0; k < 12; ++k) {
      ivec2 q = clamp(p + offsets[k], ivec2(0), texSize - ivec2(1));
      bool neighborSelected;
      float dq;
      decodeSelAndDepth(texelFetch(uSceneTex, q, 0).a, neighborSelected, dq);
      // True outer silhouette test: outline ONLY where the selected surface is NOT occluded by a nearer foreground object!
      if (!centerSelected && neighborSelected && dq <= d0 + 0.024) {
        edgeStrength = max(edgeStrength, k < 4 ? 1.0 : (k < 8 ? 0.88 : 0.62));
      } else if (centerSelected && !neighborSelected && k < 4 && d0 <= dq + 0.024) {
        edgeStrength = max(edgeStrength, 0.35);
      }
    }

    if (edgeStrength > 0.0) {
      const vec3 selectionAmber = vec3(0.965, 0.776, 0.420);
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
  if (
    Row.Panel === "group" ||
    Row.Panel === "folder" ||
    Row.Panel === "post" ||
    Row.Panel === "camera"
  ) {
    return null;
  }

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
}) {
  const SelectCallback = OnSelectEntity || Select;
  const CameraCallback = OnUpdateCamera || UpdateEditorCamera;
  const EffectiveProjection = View === 2 ? "TOP" : Projection;
  const EffectiveGrid = ShowGrid !== undefined ? ShowGrid : Settings?.Grid !== false;
  const EffectiveGizmo = ShowGizmo && Settings?.Gizmos !== false;

  const CanvasRef = useRef(null);
  const GlStateRef = useRef(null);
  const DragRef = useRef(null);
  const KeysRef = useRef(new Set());
  const AtlasSyncRef = useRef(null);
  const BuiltGizmoRef = useRef(null);
  const SceneDirtyRef = useRef(true);

  const [ShaderError, SetShaderError] = useState(null);
  const [ContextLost, SetContextLost] = useState(false);
  const [GlEpoch, SetGlEpoch] = useState(0);
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

  // Mark Pass 1 scene dirty when scene/selection/view/grid/textures change (NOT on 60Hz gizmo hover!)
  useEffect(() => {
    SceneDirtyRef.current = true;
  }, [CompiledScene, Selected, ViewMode, Debug, EffectiveGrid, TextureEpoch, GlEpoch]);

  useEffect(() => {
    EnsureMaterialTexturesDecoded(CompiledScene.Primitives, () => {
      AtlasSyncRef.current?.InvalidateAll();
      SceneDirtyRef.current = true;
      SetTextureEpoch((N) => N + 1);
    });
  }, [CompiledScene]);

  const SelectedGizmoTarget = useMemo(
    () => ResolveEntityTransformForGizmo(Selected, Rows, Values, CompiledScene),
    [Selected, Rows, Values, CompiledScene],
  );

  const InitGlResources = useCallback((Canvas) => {
    const Gl = Canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    if (!Gl) {
      SetShaderError("WebGL2 unavailable in browser context");
      return null;
    }
    if (Gl.isContextLost()) {
      SetContextLost(true);
      return null;
    }

    const SceneProg = CompileProgram(Gl, FULLSCREEN_VERTEX_SHADER, GTX_FRAGMENT_SHADER);
    const OutlineProg = CompileProgram(Gl, FULLSCREEN_VERTEX_SHADER, OUTLINE_FRAGMENT_SHADER);
    const GizmoProg = CompileProgram(Gl, GIZMO_VERTEX_SHADER, GIZMO_FRAGMENT_SHADER);

    const EmptyVao = Gl.createVertexArray();

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

    const SceneFbo = Gl.createFramebuffer();
    const SceneTex = Gl.createTexture();
    Gl.bindTexture(Gl.TEXTURE_2D, SceneTex);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MIN_FILTER, Gl.NEAREST);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MAG_FILTER, Gl.NEAREST);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);

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
    SceneDirtyRef.current = true;

    const Loc = (Name) => Gl.getUniformLocation(SceneProg, Name);
    return {
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
        uSelectedCode: Loc("uSelectedCode"),
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
        uPrimRotCol0: Loc("uPrimRotCol0[0]"),
        uPrimRotCol1: Loc("uPrimRotCol1[0]"),
        uPrimRotCol2: Loc("uPrimRotCol2[0]"),
        uPrimEdgeTint: Loc("uPrimEdgeTint[0]"),
        uPrimGiBounce: Loc("uPrimGiBounce[0]"),
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
  }, []);

  // Initialize WebGL2 + automatic webglcontextlost / webglcontextrestored recovery!
  useEffect(() => {
    const Canvas = CanvasRef.current;
    if (!Canvas) return;

    const BuildContext = () => {
      try {
        const Built = InitGlResources(Canvas);
        if (Built) {
          GlStateRef.current = Built;
          SetContextLost(false);
          SetShaderError(null);
          SetGlEpoch((N) => N + 1);
        }
      } catch (Err) {
        SetShaderError(String(Err?.message || Err));
      }
    };

    let LossCount = 0;
    const HandleContextLost = (Ev) => {
      LossCount += 1;
      if (LossCount <= 1) {
        Ev.preventDefault();
      }
      GlStateRef.current = null;
      SetContextLost(true);
    };

    const HandleContextRestored = () => {
      if (LossCount <= 1) {
        BuildContext();
      }
    };

    Canvas.addEventListener("webglcontextlost", HandleContextLost, false);
    Canvas.addEventListener("webglcontextrestored", HandleContextRestored, false);
    BuildContext();

    return () => {
      Canvas.removeEventListener("webglcontextlost", HandleContextLost, false);
      Canvas.removeEventListener("webglcontextrestored", HandleContextRestored, false);
      const State = GlStateRef.current;
      if (State && !State.Gl.isContextLost()) {
        State.Gl.deleteBuffer(State.GizmoVbo);
        State.Gl.deleteVertexArray(State.GizmoVao);
        State.Gl.deleteVertexArray(State.EmptyVao);
        State.Gl.deleteTexture(State.AtlasTex);
        State.Gl.deleteTexture(State.SceneTex);
        State.Gl.deleteFramebuffer(State.SceneFbo);
        State.Gl.deleteProgram(State.SceneProg);
        State.Gl.deleteProgram(State.OutlineProg);
        State.Gl.deleteProgram(State.GizmoProg);
      }
      GlStateRef.current = null;
    };
  }, [InitGlResources]);

  // Render pipeline: Pass 1 cached in FBO; Pass 2 (Outline) + Pass 3 (Slate GizmoPRO) ultra-lightweight!
  useEffect(() => {
    const Canvas = CanvasRef.current;
    const State = GlStateRef.current;
    if (!Canvas || !State || State.Gl.isContextLost()) return;

    let RafId = 0;
    const ScheduleDraw = (ForceScene = false) => {
      if (ForceScene) SceneDirtyRef.current = true;
      if (RafId) return;
      RafId = requestAnimationFrame(() => {
        RafId = 0;
        const CurState = GlStateRef.current;
        if (!CurState || CurState.Gl.isContextLost() || !CanvasRef.current) return;
        const { Gl, SceneUniforms: U } = CurState;

        const Rect = Canvas.getBoundingClientRect();
        const Dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        const RawW = Math.max(320, Math.round((Rect.width || 900) * Dpr));
        const RawH = Math.max(200, Math.round((Rect.height || 520) * Dpr));
        const ScaleCap = Math.min(1, 1280 / RawW, 760 / RawH);
        const Width = Math.max(320, Math.round(RawW * ScaleCap));
        const Height = Math.max(200, Math.round(RawH * ScaleCap));

        if (Canvas.width !== Width || Canvas.height !== Height) {
          Canvas.width = Width;
          Canvas.height = Height;
          SceneDirtyRef.current = true;
        }
        const Aspect = Width / Math.max(1, Height);

        if (CurState.FboWidth !== Width || CurState.FboHeight !== Height) {
          Gl.bindTexture(Gl.TEXTURE_2D, CurState.SceneTex);
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
          Gl.bindFramebuffer(Gl.FRAMEBUFFER, CurState.SceneFbo);
          Gl.framebufferTexture2D(
            Gl.FRAMEBUFFER,
            Gl.COLOR_ATTACHMENT0,
            Gl.TEXTURE_2D,
            CurState.SceneTex,
            0,
          );
          Gl.bindFramebuffer(Gl.FRAMEBUFFER, null);
          CurState.FboWidth = Width;
          CurState.FboHeight = Height;
          SceneDirtyRef.current = true;
        }

        const AtlasSync = AtlasSyncRef.current;
        if (AtlasSync.UpdatePrimitives(CompiledScene.Primitives)) {
          Gl.bindTexture(Gl.TEXTURE_2D, CurState.AtlasTex);
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
          SceneDirtyRef.current = true;
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

        const PCount = Math.min(MAX_PRIMS, CompiledScene.Primitives.length);
        let SelectedCode = 0;
        const PrimIdx = CompiledScene.Primitives
          .slice(0, PCount)
          .findIndex((P) => P.Id === Selected);
        if (PrimIdx >= 0) {
          SelectedCode = 1 + PrimIdx;
        } else {
          const LightIdx = CompiledScene.AreaLights
            .slice(0, MAX_LIGHTS)
            .findIndex((L) => L.Id === Selected);
          if (LightIdx >= 0) SelectedCode = 32 + LightIdx;
        }

        // ---------------- PASS 1: GTX WORLD RENDER (ONLY WHEN SCENE DIRTY) ----------------
        if (SceneDirtyRef.current) {
          SceneDirtyRef.current = false;
          Gl.bindFramebuffer(Gl.FRAMEBUFFER, CurState.SceneFbo);
          Gl.viewport(0, 0, Width, Height);
          Gl.disable(Gl.DEPTH_TEST);
          Gl.disable(Gl.BLEND);

          Gl.useProgram(CurState.SceneProg);
          Gl.activeTexture(Gl.TEXTURE0);
          Gl.bindTexture(Gl.TEXTURE_2D, CurState.AtlasTex);
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
          Gl.uniform1i(U.uSelectedCode, SelectedCode);

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

          const PosShape = new Float32Array(MAX_PRIMS * 4);
          const HalfFlags = new Float32Array(MAX_PRIMS * 4);
          const RotCol0 = new Float32Array(MAX_PRIMS * 4);
          const RotCol1 = new Float32Array(MAX_PRIMS * 4);
          const RotCol2 = new Float32Array(MAX_PRIMS * 4);
          const EdgeTint = new Float32Array(MAX_PRIMS * 4);
          const GiBounce = new Float32Array(MAX_PRIMS * 4);

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
            const [Rx, Ry, Rz] = P.RotationRad;
            const Cx = Math.cos(Rx), Sx = Math.sin(Rx);
            const Cy = Math.cos(Ry), Sy = Math.sin(Ry);
            const Cz = Math.cos(Rz), Sz = Math.sin(Rz);
            RotCol0.set([Cz * Cy, Sz * Cy, -Sy, P.Abbe], I * 4);
            RotCol1.set([Cz * Sy * Sx - Sz * Cx, Sz * Sy * Sx + Cz * Cx, Cy * Sx, 0.0], I * 4);
            RotCol2.set([Cz * Sy * Cx + Sz * Sx, Sz * Sy * Cx - Cz * Sx, Cy * Cx, 0.0], I * 4);
            EdgeTint.set(
              [P.EdgeTintF82[0], P.EdgeTintF82[1], P.EdgeTintF82[2], P.Transmission],
              I * 4,
            );
            const DiffWeight = 1.0 - P.Metallic * 0.75;
            GiBounce.set(
              [
                P.BaseColor[0] * DiffWeight,
                P.BaseColor[1] * DiffWeight,
                P.BaseColor[2] * DiffWeight,
                P.Emission,
              ],
              I * 4,
            );
          }

          Gl.uniform1i(U.uPrimCount, PCount);
          Gl.uniform4fv(U.uPrimPosShape, PosShape);
          Gl.uniform4fv(U.uPrimHalfFlags, HalfFlags);
          Gl.uniform4fv(U.uPrimRotCol0, RotCol0);
          Gl.uniform4fv(U.uPrimRotCol1, RotCol1);
          Gl.uniform4fv(U.uPrimRotCol2, RotCol2);
          Gl.uniform4fv(U.uPrimEdgeTint, EdgeTint);
          Gl.uniform4fv(U.uPrimGiBounce, GiBounce);

          Gl.bindVertexArray(CurState.EmptyVao);
          Gl.drawArrays(Gl.TRIANGLES, 0, 3);
        }

        // ---------------- PASS 2: BLIT + 2PX SILHOUETTE SELECTION OUTLINE ----------------
        Gl.bindFramebuffer(Gl.FRAMEBUFFER, null);
        Gl.viewport(0, 0, Width, Height);
        Gl.disable(Gl.DEPTH_TEST);
        Gl.disable(Gl.BLEND);
        Gl.clear(Gl.DEPTH_BUFFER_BIT);

        Gl.useProgram(CurState.OutlineProg);
        Gl.activeTexture(Gl.TEXTURE0);
        Gl.bindTexture(Gl.TEXTURE_2D, CurState.SceneTex);
        Gl.uniform1i(CurState.OutlineUniforms.uSceneTex, 0);
        Gl.uniform1i(CurState.OutlineUniforms.uSelectedCode, SelectedCode);
        Gl.bindVertexArray(CurState.EmptyVao);
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
          const Highlighted =
            ActiveHandle !== GizmoHandle.None ? ActiveHandle : HoveredHandle;

          Gl.useProgram(CurState.GizmoProg);
          Gl.uniformMatrix4fv(CurState.GizmoUniforms.uViewProj, false, ViewProj);
          Gl.uniform1f(CurState.GizmoUniforms.uHighlightedHandle, Highlighted);

          Gl.bindVertexArray(CurState.GizmoVao);
          Gl.bindBuffer(Gl.ARRAY_BUFFER, CurState.GizmoVbo);
          Gl.enable(Gl.DEPTH_TEST);
          Gl.depthFunc(Gl.LEQUAL);
          Gl.depthMask(true);
          Gl.disable(Gl.CULL_FACE);

          Gl.disable(Gl.BLEND);
          Gl.bufferData(Gl.ARRAY_BUFFER, Built.OpaqueBuffer, Gl.STREAM_DRAW);
          Gl.drawArrays(Gl.TRIANGLES, 0, Built.OpaqueVertexCount);

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
      });
    };

    ScheduleDraw(false);
    const ResizeObs = new ResizeObserver(() => ScheduleDraw(true));
    ResizeObs.observe(Canvas);
    return () => {
      if (RafId) cancelAnimationFrame(RafId);
      ResizeObs.disconnect();
    };
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
    GlEpoch,
  ]);

  // RMB + WASDQE fly loop
  useEffect(() => {
    const Down = (Ev) => {
      if (
        Ev.target?.tagName === "INPUT" ||
        Ev.target?.tagName === "TEXTAREA" ||
        Ev.target?.isContentEditable
      ) {
        return;
      }
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
      {ContextLost && (
        <div className="gtx-shader-error" role="status">
          Restoring WebGL2 GPU context…
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
