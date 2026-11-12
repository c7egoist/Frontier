import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CanonicalEditorCamera,
  CompileLiveGtxScene,
  NormalizeVec3,
  PickSceneEntityAtUv,
  RowEffectivelyVisible,
} from "./ShowcaseGalleryScene.js";

export function PreviewVisible(Subject, Rows, Hidden) {
  return RowEffectivelyVisible(Subject, Rows, Hidden);
}

const MAX_PRIMS = 24;
const MAX_AREA_LIGHTS = 4;

const VERTEX_SHADER_GLSL = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2( 3.0, -1.0),
  vec2(-1.0,  3.0)
);
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = 0.5 * (p + 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_GLSL = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform vec3  uCamOrigin;
uniform vec3  uCamTarget;
uniform vec3  uCamUp;
uniform float uTanHalfFov;
uniform float uOrthoHalfHeight;
uniform float uExposureGain;
uniform int   uDebugMode;
uniform int   uEnableGi;
uniform int   uEnableReflections;
uniform int   uSelectedIndex;

uniform vec3  uSunDir;
uniform vec3  uSunIrradiance;
uniform float uSunAngularRadius;
uniform vec3  uSkyRadiance;

uniform int   uAreaLightCount;
uniform vec4  uAreaLightCenterHalfW[4]; // xyz = center, w = halfWidth
uniform vec4  uAreaLightRadHalfH[4];    // rgb = radiance, w = halfHeight

uniform int   uPrimCount;
uniform vec4  uPrimCenterShape[24];     // xyz = center, w = shape (0=box,1=sphere,2=cyl,3=cone,4=torus)
uniform vec4  uPrimHalfExtShadow[24];   // xyz = halfExtents, w = packed flags (bit0=shadow, bit1=gi, bit2=glass)
uniform vec4  uPrimRotRad[24];          // xyz = euler rad
uniform vec4  uPrimAlbedoMetal[24];     // rgb = baseColor, w = metallic
uniform vec4  uPrimSpecParams[24];      // x = roughness, y = diffRoughness, z = anisotropy, w = ior
uniform vec4  uPrimCoatTrans[24];       // x = coatWeight, y = coatRoughness, z = transmission, w = abbe
uniform vec4  uPrimF82Emit[24];         // rgb = edgeTintF82, w = emission
uniform vec4  uPrimAtten[24];           // rgb = attenuationColor

const float PI = 3.14159265359;

mat3 buildEulerColumns(vec3 r) {
  float cx = cos(r.x), sx = sin(r.x);
  float cy = cos(r.y), sy = sin(r.y);
  float cz = cos(r.z), sz = sin(r.z);
  mat3 rx = mat3(1.0, 0.0, 0.0,  0.0, cx, sx,  0.0, -sx, cx);
  mat3 ry = mat3(cy, 0.0, -sy,  0.0, 1.0, 0.0,  sy, 0.0, cy);
  mat3 rz = mat3(cz, sz, 0.0,  -sz, cz, 0.0,  0.0, 0.0, 1.0);
  return rz * ry * rx;
}

bool PrimFlagShadow(int i) {
  int f = int(uPrimHalfExtShadow[i].w + 0.5);
  return (f & 1) != 0;
}
bool PrimFlagGi(int i) {
  int f = int(uPrimHalfExtShadow[i].w + 0.5);
  return (f & 2) != 0;
}
bool PrimFlagGlass(int i) {
  int f = int(uPrimHalfExtShadow[i].w + 0.5);
  return (f & 4) != 0;
}

float sdPrimLocal(vec3 p, int shape, vec3 h) {
  if (shape == 1) {
    float r = max(max(h.x, h.y), h.z);
    vec3 q = p / max(h, vec3(0.01));
    return (length(q) - 1.0) * min(min(h.x, h.y), min(r, h.z));
  }
  if (shape == 2) {
    vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(max(h.x, h.y), h.z);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }
  if (shape == 4) {
    float R = max(h.x, h.y) * 0.72;
    float r = max(h.x, h.y) * 0.28;
    vec2 q = vec2(length(p.xy) - R, p.z);
    return length(q) - r;
  }
  vec3 d = abs(p) - h;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Analytical intersection returning vec4(tNear, normalWorld.xyz), tNear < 0 if miss
vec4 intersectPrimitive(vec3 ro, vec3 rd, int idx, float tMax, bool allowInsideExit) {
  vec3 center = uPrimCenterShape[idx].xyz;
  int  shape  = int(uPrimCenterShape[idx].w + 0.5);
  vec3 h      = uPrimHalfExtShadow[idx].xyz;
  vec3 rot    = uPrimRotRad[idx].xyz;
  bool rotated = dot(abs(rot), vec3(1.0)) > 1e-4;
  mat3 R = rotated ? buildEulerColumns(rot) : mat3(1.0);
  vec3 lo = rotated ? transpose(R) * (ro - center) : (ro - center);
  vec3 ld = rotated ? transpose(R) * rd : rd;

  if (shape == 1) {
    vec3 o = lo / h;
    vec3 d = ld / h;
    float a = dot(d, d);
    float b = dot(o, d);
    float c = dot(o, o) - 1.0;
    float disc = b * b - a * c;
    if (disc < 0.0) return vec4(-1.0);
    float sq = sqrt(disc);
    float t0 = (-b - sq) / a;
    float t1 = (-b + sq) / a;
    float t = -1.0;
    if (t0 > 1e-3 && t0 < tMax) t = t0;
    else if (allowInsideExit && t1 > 1e-3 && t1 < tMax) t = t1;
    if (t < 0.0) return vec4(-1.0);
    vec3 hitL = lo + ld * t;
    vec3 nL = normalize(hitL / (h * h));
    vec3 nW = rotated ? normalize(R * nL) : nL;
    return vec4(t, nW);
  }

  if (shape == 2) {
    float rad = 0.5 * (h.x + h.y);
    float a = dot(ld.xy, ld.xy);
    float b = dot(lo.xy, ld.xy);
    float c = dot(lo.xy, lo.xy) - rad * rad;
    float bestT = tMax;
    vec3 bestN = vec3(0.0, 0.0, 1.0);
    if (a > 1e-7) {
      float disc = b * b - a * c;
      if (disc >= 0.0) {
        float sq = sqrt(disc);
        float tSide = (-b - sq) / a;
        if (tSide > 1e-3 && tSide < bestT) {
          float zHit = lo.z + ld.z * tSide;
          if (abs(zHit) <= h.z) {
            bestT = tSide;
            vec2 xy = lo.xy + ld.xy * tSide;
            bestN = normalize(vec3(xy / rad, 0.0));
          }
        }
      }
    }
    if (abs(ld.z) > 1e-7) {
      for (int s = -1; s <= 1; s += 2) {
        float zCap = float(s) * h.z;
        float tCap = (zCap - lo.z) / ld.z;
        if (tCap > 1e-3 && tCap < bestT) {
          vec2 xy = lo.xy + ld.xy * tCap;
          if (dot(xy, xy) <= rad * rad) {
            bestT = tCap;
            bestN = vec3(0.0, 0.0, float(s));
          }
        }
      }
    }
    if (bestT >= tMax) return vec4(-1.0);
    return vec4(bestT, rotated ? normalize(R * bestN) : bestN);
  }

  if (shape == 3 || shape == 4) {
    // Bounded SDF sphere-trace for Cone / Torus authored via Construct
    vec3 safeSign = mix(vec3(-1.0), vec3(1.0), greaterThanEqual(ld, vec3(0.0)));
    vec3 invD = 1.0 / (safeSign * max(abs(ld), vec3(1e-6)));
    vec3 bExt = h * 1.15;
    vec3 t0s = (-bExt - lo) * invD;
    vec3 t1s = ( bExt - lo) * invD;
    vec3 tmn = min(t0s, t1s);
    vec3 tmx = max(t0s, t1s);
    float tStart = max(max(tmn.x, max(tmn.y, tmn.z)), 1e-3);
    float tEnd   = min(min(tmx.x, min(tmx.y, tmx.z)), tMax);
    if (tStart > tEnd) return vec4(-1.0);
    float t = tStart;
    for (int stepIdx = 0; stepIdx < 36; ++stepIdx) {
      vec3 p = lo + ld * t;
      float d;
      if (shape == 3) {
        float rad = max(h.x, h.y);
        float zNorm = clamp((h.z - p.z) / max(2.0 * h.z, 0.02), 0.0, 1.0);
        float dSide = (length(p.xy) - rad * zNorm) * 0.75;
        d = max(dSide, abs(p.z) - h.z);
      } else {
        d = sdPrimLocal(p, 4, h);
      }
      if (d < 0.0015) {
        vec2 e = vec2(0.002, 0.0);
        vec3 nL;
        if (shape == 3) {
          float rad = max(h.x, h.y);
          vec3 pX = p + e.xyy, pY = p + e.yxy, pZ = p + e.yyx;
          float d0 = max((length(p.xy) - rad * clamp((h.z - p.z) / (2.0 * h.z), 0.0, 1.0)) * 0.75, abs(p.z) - h.z);
          float dX = max((length(pX.xy) - rad * clamp((h.z - pX.z) / (2.0 * h.z), 0.0, 1.0)) * 0.75, abs(pX.z) - h.z);
          float dY = max((length(pY.xy) - rad * clamp((h.z - pY.z) / (2.0 * h.z), 0.0, 1.0)) * 0.75, abs(pY.z) - h.z);
          float dZ = max((length(pZ.xy) - rad * clamp((h.z - pZ.z) / (2.0 * h.z), 0.0, 1.0)) * 0.75, abs(pZ.z) - h.z);
          nL = normalize(vec3(dX - d0, dY - d0, dZ - d0));
        } else {
          float d0 = sdPrimLocal(p, 4, h);
          nL = normalize(vec3(
            sdPrimLocal(p + e.xyy, 4, h) - d0,
            sdPrimLocal(p + e.yxy, 4, h) - d0,
            sdPrimLocal(p + e.yyx, 4, h) - d0
          ));
        }
        return vec4(t, rotated ? normalize(R * nL) : nL);
      }
      t += max(d, 0.004);
      if (t > tEnd) break;
    }
    return vec4(-1.0);
  }

  // Exact OBB / Box slab intersection
  vec3 safeSignBox = mix(vec3(-1.0), vec3(1.0), greaterThanEqual(ld, vec3(0.0)));
  vec3 invD = 1.0 / (safeSignBox * max(abs(ld), vec3(1e-6)));
  vec3 t0s = (-h - lo) * invD;
  vec3 t1s = ( h - lo) * invD;
  vec3 tsmaller = min(t0s, t1s);
  vec3 tbigger  = max(t0s, t1s);
  float tNear = max(tsmaller.x, max(tsmaller.y, tsmaller.z));
  float tFar  = min(tbigger.x, min(tbigger.y, tbigger.z));
  if (tNear > tFar || tFar < 1e-3) return vec4(-1.0);
  float t = (tNear > 1e-3) ? tNear : (allowInsideExit ? tFar : -1.0);
  if (t < 1e-3 || t >= tMax) return vec4(-1.0);
  vec3 hitL = lo + ld * t;
  vec3 rel = abs(hitL) / max(h, vec3(1e-4));
  vec3 nL = vec3(0.0);
  if (rel.x >= rel.y && rel.x >= rel.z) nL = vec3(sign(hitL.x), 0.0, 0.0);
  else if (rel.y >= rel.x && rel.y >= rel.z) nL = vec3(0.0, sign(hitL.y), 0.0);
  else nL = vec3(0.0, 0.0, sign(hitL.z));
  vec3 nW = rotated ? normalize(R * nL) : nL;
  return vec4(t, nW);
}

struct HitRecord {
  int   primIdx;
  float t;
  vec3  pos;
  vec3  normal;
};

HitRecord traceOpaqueScene(vec3 ro, vec3 rd, float tMax) {
  HitRecord best;
  best.primIdx = -1;
  best.t = tMax;
  best.pos = vec3(0.0);
  best.normal = vec3(0.0, 0.0, 1.0);

  for (int i = 0; i < MAX_PRIMS_LOOP; ++i) {
    if (i >= uPrimCount) break;
    if (PrimFlagGlass(i)) continue;
    vec4 hit = intersectPrimitive(ro, rd, i, best.t, false);
    if (hit.x > 0.0) {
      best.primIdx = i;
      best.t = hit.x;
      best.pos = ro + rd * hit.x;
      best.normal = dot(hit.yzw, rd) < 0.0 ? hit.yzw : -hit.yzw;
    }
  }
  return best;
}

float evalSceneSdfOpaque(vec3 p, out int nearestIdx) {
  float minD = 1e5;
  nearestIdx = -1;
  for (int i = 0; i < MAX_PRIMS_LOOP; ++i) {
    if (i >= uPrimCount) break;
    if (PrimFlagGlass(i) || !PrimFlagGi(i)) continue;
    vec3 center = uPrimCenterShape[i].xyz;
    int  shape  = int(uPrimCenterShape[i].w + 0.5);
    vec3 h      = uPrimHalfExtShadow[i].xyz;
    vec3 rot    = uPrimRotRad[i].xyz;
    vec3 lp = dot(abs(rot), vec3(1.0)) > 1e-4 ? transpose(buildEulerColumns(rot)) * (p - center) : (p - center);
    float d = sdPrimLocal(lp, shape, h);
    if (d < minD) {
      minD = d;
      nearestIdx = i;
    }
  }
  return minD;
}

// Calibrated Tier 1 GTX Solar Contact-Clip + SDF Cone Penumbra Shadow (zero VSM!)
float evaluateGtxSolarShadow(vec3 pos, vec3 N) {
  float NdotL = dot(N, uSunDir);
  if (NdotL <= 0.0) return 0.0;
  vec3 origin = pos + N * 0.006;

  // Exact contact-clip occluder check for crisp 3.9 mm contact hardening
  for (int i = 0; i < MAX_PRIMS_LOOP; ++i) {
    if (i >= uPrimCount) break;
    if (!PrimFlagShadow(i) || PrimFlagGlass(i)) continue;
    vec4 h = intersectPrimitive(origin, uSunDir, i, 0.32, false);
    if (h.x > 0.0) return 0.0;
  }

  // SDF cone penumbra march matching C++ SolarShadowSequence GTX cone trace
  float visibility = 1.0;
  float t = 0.08;
  float coneTan = max(tan(uSunAngularRadius * 2.4), 0.018);
  for (int stepIdx = 0; stepIdx < 18; ++stepIdx) {
    int dummyIdx;
    float d = evalSceneSdfOpaque(origin + uSunDir * t, dummyIdx);
    if (d < 0.0015) return 0.0;
    float penumbra = clamp(d / (coneTan * t + 0.008), 0.0, 1.0);
    visibility = min(visibility, smoothstep(0.0, 1.0, penumbra));
    t += clamp(d * 0.85, 0.05, 0.55);
    if (t > 6.5) break;
  }
  return visibility;
}

// Fujii Oren-Nayar + Anisotropic GGX + Adobe F82 + Dielectric Clearcoat OpenPBR evaluation
vec3 evaluateOpenPbrDirect(
  int idx,
  vec3 N,
  vec3 V,
  vec3 L,
  vec3 irradiance
) {
  float NdotL = max(dot(N, L), 0.0);
  float NdotV = max(dot(N, V), 1e-4);
  if (NdotL <= 0.0) return vec3(0.0);

  vec3 baseColor = uPrimAlbedoMetal[idx].rgb;
  float metallic = uPrimAlbedoMetal[idx].w;
  float rough    = clamp(uPrimSpecParams[idx].x, 0.03, 1.0);
  float diffRough= clamp(uPrimSpecParams[idx].y, 0.0, 1.0);
  float aniso    = uPrimSpecParams[idx].z;
  float ior      = uPrimSpecParams[idx].w;
  float coatW    = uPrimCoatTrans[idx].x;
  float coatR    = clamp(uPrimCoatTrans[idx].y, 0.025, 1.0);
  vec3  f82Tint  = uPrimF82Emit[idx].rgb;

  vec3 H = normalize(V + L);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);

  // Tangent basis
  vec3 upRef = abs(N.z) < 0.92 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(upRef, N));
  vec3 B = cross(N, T);

  float alpha = rough * rough;
  float aspect = sqrt(1.0 - 0.9 * abs(aniso));
  float ax = max(0.001, aniso >= 0.0 ? alpha / aspect : alpha * aspect);
  float ay = max(0.001, aniso >= 0.0 ? alpha * aspect : alpha / aspect);

  float TdotH = dot(T, H), BdotH = dot(B, H);
  float denomAniso = (TdotH * TdotH) / (ax * ax) + (BdotH * BdotH) / (ay * ay) + NdotH * NdotH;
  float D = 1.0 / max(PI * ax * ay * denomAniso * denomAniso, 1e-5);

  float TdotV = dot(T, V), BdotV = dot(B, V);
  float TdotL = dot(T, L), BdotL = dot(B, L);
  float lambdaV = 0.5 * (sqrt(1.0 + (ax * ax * TdotV * TdotV + ay * ay * BdotV * BdotV) / max(NdotV * NdotV, 1e-4)) - 1.0);
  float lambdaL = 0.5 * (sqrt(1.0 + (ax * ax * TdotL * TdotL + ay * ay * BdotL * BdotL) / max(NdotL * NdotL, 1e-4)) - 1.0);
  float G = 1.0 / (1.0 + lambdaV + lambdaL);

  float f0Dielectric = pow((ior - 1.0) / (ior + 1.0), 2.0);
  vec3 F0 = mix(vec3(f0Dielectric), baseColor, metallic);
  float oneMinusVH = 1.0 - VdotH;
  float schlick = pow(clamp(oneMinusVH, 0.0, 1.0), 5.0);
  vec3 F = F0 + (1.0 - F0) * schlick;
  if (metallic > 0.01) {
    float cosBar = 1.0 / 7.0;
    float bar5 = pow(1.0 - cosBar, 5.0);
    vec3 fBar = F0 + (1.0 - F0) * bar5;
    vec3 bLaz = (fBar * (1.0 - f82Tint)) / max(cosBar * pow(1.0 - cosBar, 6.0), 1e-4);
    F = clamp(F - bLaz * VdotH * pow(clamp(oneMinusVH, 0.0, 1.0), 6.0) * metallic, 0.0, 1.0);
  }

  // Turquin multi-scattering compensation
  float ess = clamp(1.0 - 0.42 * rough * rough, 0.35, 1.0);
  vec3 fMs = 1.0 + F0 * ((1.0 - ess) / ess);
  vec3 specBrdf = (D * G * F * fMs) / max(4.0 * NdotV * NdotL, 1e-4);

  // Fujii Oren-Nayar diffuse
  float s = dot(L, V) - NdotL * NdotV;
  float tF = s > 0.0 ? max(NdotL, NdotV) : 1.0;
  float A = 1.0 / (PI + (PI * 0.5 - 2.0 / 3.0) * diffRough);
  float Bf = diffRough * A;
  vec3 diffAlbedo = baseColor * (1.0 - metallic);
  vec3 diffBrdf = diffAlbedo * (A + Bf * (s / max(tF, 1e-4))) * (1.0 - 0.5 * F0);

  // Dielectric Clearcoat
  float f0Coat = 0.04;
  float fCoat = f0Coat + (1.0 - f0Coat) * schlick;
  float aCoat = coatR * coatR;
  float dCoatDen = (NdotH * NdotH * (aCoat * aCoat - 1.0) + 1.0);
  float dCoat = (aCoat * aCoat) / max(PI * dCoatDen * dCoatDen, 1e-5);
  float gCoat = 1.0 / max(1.0 + aCoat * (1.0 / NdotV + 1.0 / NdotL - 2.0), 1.0);
  float coatSpec = coatW * (dCoat * gCoat * fCoat) / max(4.0 * NdotV * NdotL, 1e-4);
  float coatTransmit = 1.0 - coatW * fCoat;

  return (coatTransmit * (diffBrdf + specBrdf) + vec3(coatSpec)) * irradiance * NdotL;
}

// Clipped-Horizon Polygonal Quad LTC Area Light Integration (downward -Z softbox + user area lights)
vec3 evaluateAreaQuadLights(int idx, vec3 pos, vec3 N, vec3 V) {
  vec3 total = vec3(0.0);
  vec3 baseColor = uPrimAlbedoMetal[idx].rgb;
  float metallic = uPrimAlbedoMetal[idx].w;
  float rough    = clamp(uPrimSpecParams[idx].x, 0.04, 1.0);
  vec3 R = reflect(-V, N);

  for (int li = 0; li < MAX_LIGHTS_LOOP; ++li) {
    if (li >= uAreaLightCount) break;
    vec3 lCenter = uAreaLightCenterHalfW[li].xyz;
    float hw     = uAreaLightCenterHalfW[li].w;
    float hh     = uAreaLightRadHalfH[li].w;
    vec3 lRad    = uAreaLightRadHalfH[li].rgb;

    vec3 toLight = lCenter - pos;
    if (toLight.z <= -0.25 && pos.z > lCenter.z) continue;

    // Clipped 4-subquad solid-angle integration (zero horizon leak!)
    vec3 diffIrr = vec3(0.0);
    for (int sy = -1; sy <= 1; sy += 2) {
      for (int sx = -1; sx <= 1; sx += 2) {
        vec3 samplePos = lCenter + vec3(float(sx) * hw * 0.5, float(sy) * hh * 0.5, 0.0);
        vec3 dVec = samplePos - pos;
        float dist2 = max(dot(dVec, dVec), 0.08);
        vec3 wi = dVec * inversesqrt(dist2);
        float cosSurf = max(dot(N, wi), 0.0);
        float cosEmit = max(-wi.z, 0.0); // downward -Z quad normal
        if (cosSurf > 0.0 && cosEmit > 0.0) {
          float subArea = hw * hh;
          float dOmega = min((subArea * cosEmit) / dist2, 0.85);
          diffIrr += lRad * (cosSurf * dOmega);
        }
      }
    }

    // Representative point on quad for GGX / LTC specular lobe
    vec3 specSample = lCenter;
    if (abs(R.z) > 1e-4) {
      float tPlane = (lCenter.z - pos.z) / R.z;
      if (tPlane > 0.0) {
        vec3 hitPlane = pos + R * tPlane;
        specSample = vec3(
          clamp(hitPlane.x, lCenter.x - hw, lCenter.x + hw),
          clamp(hitPlane.y, lCenter.y - hh, lCenter.y + hh),
          lCenter.z
        );
      }
    }
    vec3 sVec = specSample - pos;
    float sDist2 = max(dot(sVec, sVec), 0.12);
    vec3 sDir = sVec * inversesqrt(sDist2);
    float sCosEmit = max(-sDir.z, 0.0);
    float areaSolidAngle = clamp((4.0 * hw * hh * sCosEmit) / sDist2, 0.0, 1.4);

    vec3 diffPart = baseColor * (1.0 - metallic) * (diffIrr / PI);
    vec3 specPart = vec3(0.0);
    if (areaSolidAngle > 1e-4 && dot(N, sDir) > 0.0) {
      // Evaluate specular highlight toward closest point on quad
      specPart = evaluateOpenPbrDirect(idx, N, V, sDir, lRad * areaSolidAngle * 0.55)
               - baseColor * (1.0 - metallic) * (lRad * areaSolidAngle * 0.55 * max(dot(N, sDir), 0.0) / PI);
      specPart = max(specPart, vec3(0.0));
    }
    total += diffPart + specPart;
  }
  return total;
}

// Tier 1 GTX 2-Scale AO + 6-Cone SDF Diffuse GI + Multi-Bounce Crimson/Emerald Wall Bleed
void evaluateGtxConeGiAndAo(vec3 pos, vec3 N, out float outAo, out vec3 outIrradianceOverPi) {
  vec3 upRef = abs(N.z) < 0.92 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 T = normalize(cross(upRef, N));
  vec3 B = cross(N, T);

  // Short-range crevice AO + 2.2 m chassis/architectural AO along normal
  int dummyIdx;
  float aoShort = 1.0;
  float aoLong  = 1.0;
  for (int s = 1; s <= 3; ++s) {
    float distS = float(s) * 0.11;
    float dS = evalSceneSdfOpaque(pos + N * distS, dummyIdx);
    aoShort -= (distS - min(dS, distS)) * (0.28 / distS) * 0.42;

    float distL = float(s) * 0.65;
    float dL = evalSceneSdfOpaque(pos + N * distL, dummyIdx);
    aoLong -= (distL - min(dL, distL)) * (0.20 / distL) * 0.35;
  }
  outAo = clamp(min(aoShort, mix(1.0, aoLong, 0.65)), 0.12, 1.0);

  if (uEnableGi == 0) {
    outIrradianceOverPi = vec3(0.0);
    return;
  }

  // 6 hemispherical cones: 1 axial + 5 at 60 deg polar ring
  const vec3 LOCAL_CONES[6] = vec3[6](
    vec3( 0.0000,  0.0000, 1.0000),
    vec3( 0.8660,  0.0000, 0.5000),
    vec3( 0.2676,  0.8236, 0.5000),
    vec3(-0.7006,  0.5090, 0.5000),
    vec3(-0.7006, -0.5090, 0.5000),
    vec3( 0.2676, -0.8236, 0.5000)
  );
  const float CONE_WEIGHTS[6] = float[6](0.25, 0.15, 0.15, 0.15, 0.15, 0.15);

  // Estimate ambient chamber multi-bounce energy from visible walls
  vec3 chamberAvgBounce = uSkyRadiance * 0.35;
  for (int i = 0; i < MAX_PRIMS_LOOP; ++i) {
    if (i >= uPrimCount) break;
    if (PrimFlagGlass(i) || !PrimFlagGi(i)) continue;
    vec3 alb = uPrimAlbedoMetal[i].rgb * (1.0 - uPrimAlbedoMetal[i].w);
    chamberAvgBounce += alb * 0.032;
  }

  vec3 accumGi = vec3(0.0);
  vec3 startPos = pos + N * 0.025;

  for (int c = 0; c < 6; ++c) {
    vec3 lc = LOCAL_CONES[c];
    vec3 dir = normalize(T * lc.x + B * lc.y + N * lc.z);
    float t = 0.08;
    float occ = 0.0;
    vec3 coneRad = vec3(0.0);

    for (int stepIdx = 0; stepIdx < 8; ++stepIdx) {
      int hitIdx;
      vec3 sampleP = startPos + dir * t;
      float d = evalSceneSdfOpaque(sampleP, hitIdx);
      if (d < 0.09 && hitIdx >= 0) {
        vec3 bAlbedo = uPrimAlbedoMetal[hitIdx].rgb * (1.0 - uPrimAlbedoMetal[hitIdx].w);
        vec3 bEmit   = bAlbedo * uPrimF82Emit[hitIdx].w;

        // Estimate inward bounce normal pointing from hit primitive back toward receiver
        vec3 surfCenter = uPrimCenterShape[hitIdx].xyz;
        vec3 hExt       = uPrimHalfExtShadow[hitIdx].xyz;
        vec3 relP       = (sampleP - surfCenter) / max(hExt, vec3(0.02));
        vec3 bounceN    = -dir;
        if (int(uPrimCenterShape[hitIdx].w + 0.5) == 0) {
          vec3 aRel = abs(relP);
          if (aRel.x >= aRel.y && aRel.x >= aRel.z) bounceN = vec3(-sign(sampleP.x - surfCenter.x), 0.0, 0.0);
          else if (aRel.y >= aRel.x && aRel.y >= aRel.z) bounceN = vec3(0.0, -sign(sampleP.y - surfCenter.y), 0.0);
          else bounceN = vec3(0.0, 0.0, -sign(sampleP.z - surfCenter.z));
          if (dot(bounceN, -dir) < 0.0) bounceN = -bounceN;
        }

        // Direct solar + softbox irradiance on bounce surface + 2nd bounce
        float sunCos = max(dot(bounceN, uSunDir), 0.0);
        // Fast roof-baffle & wall unoccluded solar estimate on bounce surface
        float sunVis = sunCos > 0.0 ? 0.82 : 0.0;
        vec3 bounceIncoming = uSunIrradiance * (sunCos * sunVis);
        if (uAreaLightCount > 0) {
          vec3 lC = uAreaLightCenterHalfW[0].xyz;
          vec3 toL = lC - sampleP;
          float d2 = max(dot(toL, toL), 0.35);
          vec3 lDir = toL * inversesqrt(d2);
          float cS = max(dot(bounceN, lDir), 0.0);
          float cE = max(-lDir.z, 0.0);
          float ltcOm = min((4.0 * uAreaLightCenterHalfW[0].w * uAreaLightRadHalfH[0].w * cE) / d2, 0.9);
          bounceIncoming += uAreaLightRadHalfH[0].rgb * (cS * ltcOm);
        }
        vec3 exitantOverPi = bAlbedo * (bounceIncoming / PI + chamberAvgBounce * 0.55) + bEmit;
        coneRad = exitantOverPi;
        occ = 1.0;
        break;
      }
      t += max(d * 0.85, 0.14);
      if (t > 4.6) break;
    }

    if (occ < 0.5) {
      float skyMix = clamp(0.5 + 0.5 * dir.z, 0.0, 1.0);
      coneRad = mix(chamberAvgBounce * 0.65, uSkyRadiance * 1.15, skyMix);
    }
    accumGi += coneRad * CONE_WEIGHTS[c];
  }

  outIrradianceOverPi = accumGi * outAo;
}

vec3 shadeSecondaryBounceHit(HitRecord hit, vec3 rd) {
  int idx = hit.primIdx;
  vec3 V = -rd;
  vec3 N = hit.normal;
  vec3 baseColor = uPrimAlbedoMetal[idx].rgb;
  float metallic = uPrimAlbedoMetal[idx].w;
  float emitNit  = uPrimF82Emit[idx].w;

  float sunShadow = dot(N, uSunDir) > 0.0 ? evaluateGtxSolarShadow(hit.pos, N) : 0.0;
  vec3 directSun = sunShadow > 0.0
    ? evaluateOpenPbrDirect(idx, N, V, uSunDir, uSunIrradiance * sunShadow)
    : vec3(0.0);
  vec3 directLtc = evaluateAreaQuadLights(idx, hit.pos, N, V);
  vec3 emissive  = baseColor * emitNit;

  float skyUp = 0.5 + 0.5 * N.z;
  vec3 giOverPi = mix(vec3(0.11, 0.10, 0.10), uSkyRadiance * 1.05, skyUp);
  // Add Crimson (-X) and Emerald (+X) gallery wall bounce approximation on secondary hits
  giOverPi += vec3(0.18, 0.015, 0.012) * max(-N.x, 0.0) + vec3(0.018, 0.16, 0.032) * max(N.x, 0.0);
  vec3 diffuseGi = baseColor * (1.0 - metallic) * giOverPi;

  return directSun + directLtc + diffuseGi + emissive;
}

vec3 shadePrimaryOpaqueHit(HitRecord hit, vec3 rd) {
  int idx = hit.primIdx;
  vec3 V = -rd;
  vec3 N = hit.normal;
  vec3 baseColor = uPrimAlbedoMetal[idx].rgb;
  float metallic = uPrimAlbedoMetal[idx].w;
  float rough    = clamp(uPrimSpecParams[idx].x, 0.03, 1.0);
  float ior      = uPrimSpecParams[idx].w;
  float coatW    = uPrimCoatTrans[idx].x;
  vec3  f82Tint  = uPrimF82Emit[idx].rgb;
  float emitNit  = uPrimF82Emit[idx].w;

  // 1. Direct Sun + GTX Contact-Clip / SDF Cone Shadow
  float sunShadow = evaluateGtxSolarShadow(hit.pos, N);
  vec3 directSun = sunShadow > 0.0
    ? evaluateOpenPbrDirect(idx, N, V, uSunDir, uSunIrradiance * sunShadow)
    : vec3(0.0);

  // 2. Clipped-Horizon LTC Polygonal Area Lights
  vec3 directLtc = evaluateAreaQuadLights(idx, hit.pos, N, V);

  // 3. Emissive
  vec3 emissive = baseColor * emitNit;

  // 4. Tier 1 GTX 2-Scale AO + 6-Cone SDF Diffuse GI
  float ao = 1.0;
  vec3 giOverPi = uSkyRadiance * 0.55;
  evaluateGtxConeGiAndAo(hit.pos, N, ao, giOverPi);
  vec3 diffuseGi = baseColor * (1.0 - metallic) * giOverPi;

  // 5. Tier 1 GTX Specular Reflection (Hi-Z SSR / Single-Bounce Gallery Reflection)
  vec3 indirectSpec = vec3(0.0);
  if (uEnableReflections != 0 && (metallic > 0.05 || coatW > 0.05 || rough < 0.42)) {
    vec3 R = reflect(-V, N);
    float NdotV = max(dot(N, V), 1e-4);
    float f0D = pow((ior - 1.0) / (ior + 1.0), 2.0);
    vec3 F0 = mix(vec3(f0D), baseColor, metallic);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0) * (1.0 - 0.65 * rough);
    F *= mix(vec3(1.0), f82Tint, metallic * 0.35);
    float coatRefl = coatW * (0.04 + 0.96 * pow(1.0 - NdotV, 5.0));
    vec3 reflWeight = clamp(F + vec3(coatRefl * (1.0 - metallic)), 0.0, 1.0) * (1.0 - 0.58 * rough);

    vec3 reflRad = vec3(0.0);
    float bestLightT = 1e5;
    for (int li = 0; li < MAX_LIGHTS_LOOP; ++li) {
      if (li >= uAreaLightCount) break;
      vec3 lC = uAreaLightCenterHalfW[li].xyz;
      if (abs(R.z) > 1e-4) {
        float tL = (lC.z - hit.pos.z) / R.z;
        if (tL > 0.02 && tL < bestLightT) {
          vec3 pL = hit.pos + R * tL;
          if (abs(pL.x - lC.x) <= uAreaLightCenterHalfW[li].w &&
              abs(pL.y - lC.y) <= uAreaLightRadHalfH[li].w) {
            bestLightT = tL;
            reflRad = uAreaLightRadHalfH[li].rgb;
          }
        }
      }
    }

    HitRecord secHit = traceOpaqueScene(hit.pos + N * 0.008, R, bestLightT);
    if (secHit.primIdx >= 0) {
      reflRad = shadeSecondaryBounceHit(secHit, R);
    } else if (bestLightT >= 1e4) {
      float skyMix = clamp(0.5 + 0.5 * R.z, 0.0, 1.0);
      reflRad = mix(vec3(0.08, 0.09, 0.12), uSkyRadiance * 1.8, skyMix);
    }
    indirectSpec = reflRad * reflWeight * mix(1.0, ao, rough);
  }

  return directSun + directLtc + diffuseGi + indirectSpec + emissive;
}

vec3 evaluateSkyBackground(vec3 rd) {
  float horizon = clamp(0.5 + 0.5 * rd.z, 0.0, 1.0);
  vec3 sky = mix(vec3(0.055, 0.065, 0.085), uSkyRadiance * 1.65, pow(horizon, 0.75));
  float sunCos = dot(rd, uSunDir);
  float sunDisk = smoothstep(cos(uSunAngularRadius * 1.35), cos(uSunAngularRadius * 0.75), sunCos);
  sky += uSunIrradiance * sunDisk * 0.35;
  return sky;
}

vec3 acesFilmicSrgb(vec3 hdrLinear) {
  vec3 x = max(hdrLinear * uExposureGain, vec3(0.0));
  vec3 t = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  bvec3 lo = lessThanEqual(t, vec3(0.0031308));
  vec3 sLo = 12.92 * t;
  vec3 sHi = 1.055 * pow(t, vec3(1.0 / 2.4)) - 0.055;
  return mix(sHi, sLo, lo);
}

vec3 hashIdColor(int id) {
  float f = float(id + 1) * 1.6180339;
  return 0.25 + 0.70 * fract(vec3(f * 1.13, f * 2.71, f * 4.37));
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec3 fwd   = normalize(uCamTarget - uCamOrigin);
  vec3 right = normalize(cross(fwd, uCamUp));
  vec3 up    = normalize(cross(right, fwd));

  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 ro, rd;
  if (uOrthoHalfHeight > 0.0) {
    ro = uCamOrigin + right * (ndc.x * uOrthoHalfHeight * aspect) + up * (ndc.y * uOrthoHalfHeight);
    rd = fwd;
  } else {
    ro = uCamOrigin;
    rd = normalize(fwd + right * (ndc.x * aspect * uTanHalfFov) + up * (ndc.y * uTanHalfFov));
  }

  // Primary opaque G-Buffer + Area Quad Light visibility
  float areaHitT = 1e5;
  vec3  areaHitRad = vec3(0.0);
  int   areaHitIdx = -1;
  for (int li = 0; li < MAX_LIGHTS_LOOP; ++li) {
    if (li >= uAreaLightCount) break;
    vec3 lC = uAreaLightCenterHalfW[li].xyz;
    if (abs(rd.z) > 1e-5) {
      float tL = (lC.z - ro.z) / rd.z;
      if (tL > 0.05 && tL < areaHitT) {
        vec3 pL = ro + rd * tL;
        if (abs(pL.x - lC.x) <= uAreaLightCenterHalfW[li].w &&
            abs(pL.y - lC.y) <= uAreaLightRadHalfH[li].w) {
          areaHitT = tL;
          areaHitRad = uAreaLightRadHalfH[li].rgb;
          areaHitIdx = li;
        }
      }
    }
  }

  HitRecord opaqueHit = traceOpaqueScene(ro, rd, areaHitT);

  // Check 2-layer Glass Depth-Peel shells closer than opaqueHit.t
  int   glassIdx = -1;
  float glassNearT = min(opaqueHit.t, areaHitT);
  vec3  glassNearN = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < MAX_PRIMS_LOOP; ++i) {
    if (i >= uPrimCount) break;
    if (!PrimFlagGlass(i)) continue;
    vec4 gHit = intersectPrimitive(ro, rd, i, glassNearT, false);
    if (gHit.x > 0.0) {
      glassIdx = i;
      glassNearT = gHit.x;
      glassNearN = dot(gHit.yzw, rd) < 0.0 ? gHit.yzw : -gHit.yzw;
    }
  }

  // Viewport Debug Views (1:1 with Editor.jsx DebugViews)
  int primaryId = glassIdx >= 0 ? glassIdx : opaqueHit.primIdx;
  float primaryT = glassIdx >= 0 ? glassNearT : (opaqueHit.primIdx >= 0 ? opaqueHit.t : areaHitT);
  vec3  primaryN = glassIdx >= 0 ? glassNearN : opaqueHit.normal;

  if (uDebugMode > 0) {
    if (primaryId < 0 && areaHitIdx < 0) {
      fragColor = vec4(0.05, 0.06, 0.08, 1.0);
      return;
    }
    if (uDebugMode == 1 || uDebugMode == 5) { // Depth / HiZ
      float dVis = clamp(1.0 - primaryT / 8.5, 0.0, 1.0);
      fragColor = vec4(vec3(pow(dVis, 1.3)), 1.0);
      return;
    }
    if (uDebugMode == 2 || uDebugMode == 4) { // Visibility ID / Cluster ID
      fragColor = vec4(hashIdColor(primaryId >= 0 ? primaryId : 20 + areaHitIdx), 1.0);
      return;
    }
    if (uDebugMode == 6) { // Albedo
      vec3 alb = primaryId >= 0 ? uPrimAlbedoMetal[primaryId].rgb : vec3(1.0);
      fragColor = vec4(pow(clamp(alb, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
      return;
    }
    if (uDebugMode == 7 || uDebugMode == 10) { // Normal / Shading Normal
      fragColor = vec4(0.5 + 0.5 * primaryN, 1.0);
      return;
    }
    if (uDebugMode == 8) { // Roughness
      float r = primaryId >= 0 ? uPrimSpecParams[primaryId].x : 0.0;
      fragColor = vec4(vec3(r), 1.0);
      return;
    }
    if (uDebugMode == 9) { // Metalness
      float m = primaryId >= 0 ? uPrimAlbedoMetal[primaryId].w : 0.0;
      fragColor = vec4(vec3(m), 1.0);
      return;
    }
  }

  vec3 hdrColor = vec3(0.0);
  if (opaqueHit.primIdx >= 0) {
    hdrColor = shadePrimaryOpaqueHit(opaqueHit, rd);
  } else if (areaHitIdx >= 0) {
    hdrColor = areaHitRad * 0.92;
  } else {
    hdrColor = evaluateSkyBackground(rd);
  }

  // Tier 1 GTX 2-Layer Abbe Dispersive Crown Glass Peel!
  if (glassIdx >= 0) {
    vec3 entryPos = ro + rd * glassNearT;
    float iorBase = uPrimSpecParams[glassIdx].w;
    float abbe    = max(uPrimCoatTrans[glassIdx].w, 12.0);
    float disp    = (iorBase - 1.0) / abbe;
    vec3  iors    = vec3(iorBase - disp * 0.85, iorBase, iorBase + disp * 1.15);

    float cosI = clamp(dot(-rd, glassNearN), 0.0, 1.0);
    float f0   = pow((iorBase - 1.0) / (iorBase + 1.0), 2.0);
    float fres = f0 + (1.0 - f0) * pow(1.0 - cosI, 5.0);

    vec3 refractedRgb = vec3(0.0);
    float pathLen = 0.35;
    for (int ch = 0; ch < 3; ++ch) {
      float etaIn = 1.0 / iors[ch];
      vec3 tDir1 = refract(rd, glassNearN, etaIn);
      if (length(tDir1) < 1e-4) tDir1 = reflect(rd, glassNearN);

      // Peel layer 2: rear shell exit!
      vec4 exitHit = intersectPrimitive(entryPos + tDir1 * 0.006, tDir1, glassIdx, 8.0, true);
      vec3 exitPos = entryPos;
      vec3 exitDir = tDir1;
      if (exitHit.x > 0.0) {
        pathLen = exitHit.x;
        exitPos = entryPos + tDir1 * (exitHit.x + 0.006);
        vec3 outwardN = dot(exitHit.yzw, tDir1) > 0.0 ? exitHit.yzw : -exitHit.yzw;
        vec3 tDir2 = refract(tDir1, -outwardN, iors[ch]);
        exitDir = length(tDir2) > 1e-4 ? normalize(tDir2) : reflect(tDir1, -outwardN);
      }

      HitRecord bgHit = traceOpaqueScene(exitPos + exitDir * 0.006, exitDir, 40.0);
      vec3 chRad = bgHit.primIdx >= 0
        ? shadeSecondaryBounceHit(bgHit, exitDir)
        : evaluateSkyBackground(exitDir);
      refractedRgb[ch] = chRad[ch];
    }

    // Beer-Lambert volume attenuation + specular reflection + solar highlight on glass shell
    vec3 atten = clamp(uPrimAtten[glassIdx].rgb, vec3(0.05), vec3(1.0));
    vec3 transmittance = exp((vec3(1.0) - atten) * (-2.2 * pathLen));

    vec3 reflDir = reflect(rd, glassNearN);
    HitRecord gReflHit = traceOpaqueScene(entryPos + glassNearN * 0.008, reflDir, 30.0);
    vec3 gReflRad = gReflHit.primIdx >= 0
      ? shadeSecondaryBounceHit(gReflHit, reflDir)
      : evaluateSkyBackground(reflDir);

    // Direct solar + softbox specular glints on smooth crown glass
    vec3 glassSpecSun = evaluateOpenPbrDirect(glassIdx, glassNearN, -rd, uSunDir, uSunIrradiance);
    if (uAreaLightCount > 0) {
      vec3 lDir = normalize(uAreaLightCenterHalfW[0].xyz - entryPos);
      glassSpecSun += evaluateOpenPbrDirect(glassIdx, glassNearN, -rd, lDir, uAreaLightRadHalfH[0].rgb * 0.25);
    }

    hdrColor = refractedRgb * transmittance * (1.0 - fres) + gReflRad * fres + glassSpecSun * 0.65;
  }

  vec3 srgb = acesFilmicSrgb(hdrColor);

  // Subtle selection highlight rim on active Outliner selection
  if (uSelectedIndex >= 0 && primaryId == uSelectedIndex) {
    float rim = pow(clamp(1.0 - abs(dot(primaryN, -rd)), 0.0, 1.0), 3.2);
    srgb = mix(srgb, vec3(0.95, 0.78, 0.42), rim * 0.42);
  }

  fragColor = vec4(srgb, 1.0);
}
`
  .replaceAll("MAX_PRIMS_LOOP", String(MAX_PRIMS))
  .replaceAll("MAX_LIGHTS_LOOP", String(MAX_AREA_LIGHTS));

function CompileGlProgram(Gl) {
  const Compile = (Type, Source) => {
    const Shader = Gl.createShader(Type);
    Gl.shaderSource(Shader, Source);
    Gl.compileShader(Shader);
    if (!Gl.getShaderParameter(Shader, Gl.COMPILE_STATUS)) {
      const Log = Gl.getShaderInfoLog(Shader);
      Gl.deleteShader(Shader);
      throw new Error("GTX shader compile error: " + Log);
    }
    return Shader;
  };
  const Vs = Compile(Gl.VERTEX_SHADER, VERTEX_SHADER_GLSL);
  const Fs = Compile(Gl.FRAGMENT_SHADER, FRAGMENT_SHADER_GLSL);
  const Prog = Gl.createProgram();
  Gl.attachShader(Prog, Vs);
  Gl.attachShader(Prog, Fs);
  Gl.linkProgram(Prog);
  Gl.deleteShader(Vs);
  Gl.deleteShader(Fs);
  if (!Gl.getProgramParameter(Prog, Gl.LINK_STATUS)) {
    const Log = Gl.getProgramInfoLog(Prog);
    Gl.deleteProgram(Prog);
    throw new Error("GTX program link error: " + Log);
  }
  return Prog;
}

// Clean Canvas2D software Tier 1 GTX fallback for headless browsers where WebGL2 is disabled
function RenderSoftwareGtxFallback(Canvas, CompiledScene, Selected) {
  const Ctx = Canvas.getContext("2d");
  if (!Ctx) return;
  const W = Canvas.width;
  const H = Canvas.height;
  const Aspect = W / Math.max(1, H);
  const Grad = Ctx.createLinearGradient(0, 0, 0, H);
  Grad.addColorStop(0, "#1c2534");
  Grad.addColorStop(0.55, "#282b30");
  Grad.addColorStop(1, "#1c1c1e");
  Ctx.fillStyle = Grad;
  Ctx.fillRect(0, 0, W, H);

  // Project 3D point onto viewport for clean shaded architectural fallback
  const { CameraOrigin, CameraTarget, WorldUp, VerticalFovRad } = CompiledScene;
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
  const TanHalf = Math.tan(VerticalFovRad * 0.5);

  const Project = (P) => {
    const Rel = [P[0] - CameraOrigin[0], P[1] - CameraOrigin[1], P[2] - CameraOrigin[2]];
    const Z = Math.max(0.2, Rel[0] * Fwd[0] + Rel[1] * Fwd[1] + Rel[2] * Fwd[2]);
    const X = (Rel[0] * Right[0] + Rel[1] * Right[1] + Rel[2] * Right[2]) / (Z * TanHalf * Aspect);
    const Y = (Rel[0] * Up[0] + Rel[1] * Up[1] + Rel[2] * Up[2]) / (Z * TanHalf);
    return [(0.5 + 0.5 * X) * W, (0.5 - 0.5 * Y) * H, Z];
  };

  const Sorted = [...CompiledScene.Primitives].sort((A, B) => {
    const Da = Math.hypot(
      A.Center[0] - CameraOrigin[0],
      A.Center[1] - CameraOrigin[1],
      A.Center[2] - CameraOrigin[2],
    );
    const Db = Math.hypot(
      B.Center[0] - CameraOrigin[0],
      B.Center[1] - CameraOrigin[1],
      B.Center[2] - CameraOrigin[2],
    );
    return Db - Da;
  });

  for (const Prim of Sorted) {
    const [Sx, Sy, Sz] = Project(Prim.Center);
    const RadiusPx = Math.max(
      12,
      (Math.max(...Prim.HalfExtents) / Math.max(0.3, Sz * TanHalf)) * H * 0.5,
    );
    const [Lr, Lg, Lb] = Prim.BaseColor.map((C) =>
      Math.round(Math.pow(Math.min(1, C * 1.1), 1 / 2.2) * 255),
    );
    Ctx.save();
    Ctx.globalAlpha = Prim.GlassShell ? 0.55 : 0.96;
    const Rg = Ctx.createRadialGradient(
      Sx - RadiusPx * 0.28,
      Sy - RadiusPx * 0.3,
      RadiusPx * 0.06,
      Sx,
      Sy,
      RadiusPx,
    );
    Rg.addColorStop(0, "#ffffff");
    Rg.addColorStop(0.35, `rgb(${Lr},${Lg},${Lb})`);
    Rg.addColorStop(1, `rgb(${Lr >> 2},${Lg >> 2},${Lb >> 2})`);
    Ctx.fillStyle = Rg;
    Ctx.beginPath();
    if (Prim.Shape === 1) Ctx.arc(Sx, Sy, RadiusPx, 0, Math.PI * 2);
    else Ctx.roundRect(Sx - RadiusPx, Sy - RadiusPx * 0.65, RadiusPx * 2, RadiusPx * 1.3, 4);
    Ctx.fill();
    if (Prim.Id === Selected) {
      Ctx.strokeStyle = "#f2c66d";
      Ctx.lineWidth = 2;
      Ctx.stroke();
    }
    Ctx.restore();
  }
}

export default function GtxWorldViewport({
  Rows,
  Values,
  Hidden,
  Selected,
  Select,
  Projection = "PERSP",
  Debug = 0,
  Settings = {},
  UpdateEditorCamera,
  OnFpsSample,
  View = 1,
}) {
  const EffectiveProjection = View === 2 && Projection === "PERSP" ? "TOP" : Projection;
  const ContainerRef = useRef(null);
  const CanvasRef = useRef(null);
  const GlStateRef = useRef(null);
  const DragRef = useRef(null);
  const KeysRef = useRef(new Set());
  const [HoveredHud, SetHoveredHud] = useState(false);

  const CompiledScene = useMemo(
    () => CompileLiveGtxScene(Rows, Values, Hidden, EffectiveProjection),
    [Rows, Values, Hidden, EffectiveProjection],
  );

  const SelectedIndex = useMemo(
    () => CompiledScene.Primitives.findIndex((Prim) => Prim.Id === Selected),
    [CompiledScene, Selected],
  );

  const LatestSceneRef = useRef({
    CompiledScene,
    Debug,
    Settings,
    SelectedIndex,
    Selected,
  });
  LatestSceneRef.current = {
    CompiledScene,
    Debug,
    Settings,
    SelectedIndex,
    Selected,
  };

  // Initialize WebGL2 GTX pipeline + render loop
  useEffect(() => {
    const Canvas = CanvasRef.current;
    if (!Canvas) return;

    let Gl = null;
    let Program = null;
    let Vao = null;
    let Uniforms = null;
    try {
      Gl = Canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
      });
      if (Gl) {
        Program = CompileGlProgram(Gl);
        Vao = Gl.createVertexArray();
        const Names = [
          "uResolution",
          "uCamOrigin",
          "uCamTarget",
          "uCamUp",
          "uTanHalfFov",
          "uOrthoHalfHeight",
          "uExposureGain",
          "uDebugMode",
          "uEnableGi",
          "uEnableReflections",
          "uSelectedIndex",
          "uSunDir",
          "uSunIrradiance",
          "uSunAngularRadius",
          "uSkyRadiance",
          "uAreaLightCount",
          "uAreaLightCenterHalfW",
          "uAreaLightRadHalfH",
          "uPrimCount",
          "uPrimCenterShape",
          "uPrimHalfExtShadow",
          "uPrimRotRad",
          "uPrimAlbedoMetal",
          "uPrimSpecParams",
          "uPrimCoatTrans",
          "uPrimF82Emit",
          "uPrimAtten",
        ];
        Uniforms = Object.fromEntries(
          Names.map((Name) => [Name, Gl.getUniformLocation(Program, Name)]),
        );
        GlStateRef.current = { Gl, Program, Vao, Uniforms };
      }
    } catch (Err) {
      console.warn("[FrontierWorldMirror] WebGL2 GTX fallback:", Err);
      Gl = null;
    }

    let RafId = 0;
    let LastTime = performance.now();
    let FrameCounter = 0;
    let FpsTimer = LastTime;

    const CenterShapeBuf = new Float32Array(MAX_PRIMS * 4);
    const HalfExtShadowBuf = new Float32Array(MAX_PRIMS * 4);
    const RotRadBuf = new Float32Array(MAX_PRIMS * 4);
    const AlbedoMetalBuf = new Float32Array(MAX_PRIMS * 4);
    const SpecParamsBuf = new Float32Array(MAX_PRIMS * 4);
    const CoatTransBuf = new Float32Array(MAX_PRIMS * 4);
    const F82EmitBuf = new Float32Array(MAX_PRIMS * 4);
    const AttenBuf = new Float32Array(MAX_PRIMS * 4);
    const LightCenterBuf = new Float32Array(MAX_AREA_LIGHTS * 4);
    const LightRadBuf = new Float32Array(MAX_AREA_LIGHTS * 4);

    const RenderFrame = (Now) => {
      const Dt = Math.min(0.05, Math.max(0.001, (Now - LastTime) / 1000));
      LastTime = Now;
      FrameCounter += 1;
      if (Now - FpsTimer >= 500) {
        const Fps = Math.round((FrameCounter * 1000) / (Now - FpsTimer));
        FrameCounter = 0;
        FpsTimer = Now;
        if (View === 1 && OnFpsSample) OnFpsSample(Fps);
      }

      // WASD + Q/E camera fly navigation when keys are held
      if (
        KeysRef.current.size > 0 &&
        UpdateEditorCamera &&
        EffectiveProjection === "PERSP"
      ) {
        const Cur = LatestSceneRef.current.CompiledScene;
        const Fwd = NormalizeVec3([
          Cur.CameraTarget[0] - Cur.CameraOrigin[0],
          Cur.CameraTarget[1] - Cur.CameraOrigin[1],
          Cur.CameraTarget[2] - Cur.CameraOrigin[2],
        ]);
        const Right = NormalizeVec3(
          [
            Fwd[1] * Cur.WorldUp[2] - Fwd[2] * Cur.WorldUp[1],
            Fwd[2] * Cur.WorldUp[0] - Fwd[0] * Cur.WorldUp[2],
            Fwd[0] * Cur.WorldUp[1] - Fwd[1] * Cur.WorldUp[0],
          ],
          [1, 0, 0],
        );
        const Speed = (KeysRef.current.has("Shift") ? 5.2 : 2.2) * Dt;
        let Move = [0, 0, 0];
        if (KeysRef.current.has("KeyW"))
          Move = [Move[0] + Fwd[0] * Speed, Move[1] + Fwd[1] * Speed, Move[2] + Fwd[2] * Speed];
        if (KeysRef.current.has("KeyS"))
          Move = [Move[0] - Fwd[0] * Speed, Move[1] - Fwd[1] * Speed, Move[2] - Fwd[2] * Speed];
        if (KeysRef.current.has("KeyD"))
          Move = [Move[0] + Right[0] * Speed, Move[1] + Right[1] * Speed, Move[2] + Right[2] * Speed];
        if (KeysRef.current.has("KeyA"))
          Move = [Move[0] - Right[0] * Speed, Move[1] - Right[1] * Speed, Move[2] - Right[2] * Speed];
        if (KeysRef.current.has("KeyE")) Move[2] += Speed;
        if (KeysRef.current.has("KeyQ")) Move[2] -= Speed;
        if (Math.hypot(Move[0], Move[1], Move[2]) > 1e-5) {
          UpdateEditorCamera({
            Position: Cur.CameraOrigin.map((V, I) => +(V + Move[I]).toFixed(4)),
            Target: Cur.CameraTarget.map((V, I) => +(V + Move[I]).toFixed(4)),
          });
        }
      }

      const Host = ContainerRef.current;
      if (Host) {
        const ScalePct = Math.max(50, Math.min(125, Number(LatestSceneRef.current.Settings?.Scale) || 100)) / 100;
        const Dpr = Math.min(window.devicePixelRatio || 1, 1.5) * ScalePct;
        const TargetW = Math.max(64, Math.min(1440, Math.round(Host.clientWidth * Dpr)));
        const TargetH = Math.max(64, Math.min(900, Math.round(Host.clientHeight * Dpr)));
        if (Canvas.width !== TargetW || Canvas.height !== TargetH) {
          Canvas.width = TargetW;
          Canvas.height = TargetH;
        }
      }

      const {
        CompiledScene: Scene,
        Debug: ActiveDebug,
        Settings: ActiveSettings,
        SelectedIndex: ActiveSelIdx,
        Selected: ActiveSelId,
      } = LatestSceneRef.current;

      if (Gl && Program && Uniforms) {
        Gl.viewport(0, 0, Canvas.width, Canvas.height);
        Gl.useProgram(Program);
        Gl.bindVertexArray(Vao);

        Gl.uniform2f(Uniforms.uResolution, Canvas.width, Canvas.height);
        Gl.uniform3fv(Uniforms.uCamOrigin, Scene.CameraOrigin);
        Gl.uniform3fv(Uniforms.uCamTarget, Scene.CameraTarget);
        Gl.uniform3fv(Uniforms.uCamUp, Scene.WorldUp);
        Gl.uniform1f(Uniforms.uTanHalfFov, Math.tan(Scene.VerticalFovRad * 0.5));
        Gl.uniform1f(Uniforms.uOrthoHalfHeight, Scene.OrthoHalfHeight);
        Gl.uniform1f(Uniforms.uExposureGain, Scene.ExposureGain);
        Gl.uniform1i(Uniforms.uDebugMode, ActiveDebug || 0);
        Gl.uniform1i(Uniforms.uEnableGi, (ActiveSettings?.GI ?? 2) > 0 ? 1 : 0);
        Gl.uniform1i(
          Uniforms.uEnableReflections,
          (ActiveSettings?.Reflection ?? 2) > 0 ? 1 : 0,
        );
        Gl.uniform1i(Uniforms.uSelectedIndex, ActiveSelIdx);

        Gl.uniform3fv(Uniforms.uSunDir, Scene.SunDir);
        Gl.uniform3fv(Uniforms.uSunIrradiance, Scene.SunIrradiance);
        Gl.uniform1f(Uniforms.uSunAngularRadius, Scene.SunAngularRadiusRad);
        Gl.uniform3fv(Uniforms.uSkyRadiance, Scene.SkyRadiance);

        const LightCount = Math.min(MAX_AREA_LIGHTS, Scene.AreaLights.length);
        for (let I = 0; I < LightCount; ++I) {
          const L = Scene.AreaLights[I];
          const Off = I * 4;
          LightCenterBuf[Off + 0] = L.Center[0];
          LightCenterBuf[Off + 1] = L.Center[1];
          LightCenterBuf[Off + 2] = L.Center[2];
          LightCenterBuf[Off + 3] = L.HalfWidth;
          LightRadBuf[Off + 0] = L.Radiance[0];
          LightRadBuf[Off + 1] = L.Radiance[1];
          LightRadBuf[Off + 2] = L.Radiance[2];
          LightRadBuf[Off + 3] = L.HalfHeight;
        }
        Gl.uniform1i(Uniforms.uAreaLightCount, LightCount);
        Gl.uniform4fv(Uniforms.uAreaLightCenterHalfW, LightCenterBuf);
        Gl.uniform4fv(Uniforms.uAreaLightRadHalfH, LightRadBuf);

        const PrimCount = Math.min(MAX_PRIMS, Scene.Primitives.length);
        for (let I = 0; I < PrimCount; ++I) {
          const P = Scene.Primitives[I];
          const Off = I * 4;
          CenterShapeBuf[Off + 0] = P.Center[0];
          CenterShapeBuf[Off + 1] = P.Center[1];
          CenterShapeBuf[Off + 2] = P.Center[2];
          CenterShapeBuf[Off + 3] = P.Shape;

          const Flags =
            (P.CastShadows ? 1 : 0) |
            (P.GiContributor ? 2 : 0) |
            (P.GlassShell ? 4 : 0);
          HalfExtShadowBuf[Off + 0] = P.HalfExtents[0];
          HalfExtShadowBuf[Off + 1] = P.HalfExtents[1];
          HalfExtShadowBuf[Off + 2] = P.HalfExtents[2];
          HalfExtShadowBuf[Off + 3] = Flags;

          RotRadBuf[Off + 0] = P.RotationRad[0];
          RotRadBuf[Off + 1] = P.RotationRad[1];
          RotRadBuf[Off + 2] = P.RotationRad[2];
          RotRadBuf[Off + 3] = 0;

          AlbedoMetalBuf[Off + 0] = P.BaseColor[0];
          AlbedoMetalBuf[Off + 1] = P.BaseColor[1];
          AlbedoMetalBuf[Off + 2] = P.BaseColor[2];
          AlbedoMetalBuf[Off + 3] = P.Metallic;

          SpecParamsBuf[Off + 0] = P.Roughness;
          SpecParamsBuf[Off + 1] = P.DiffuseRoughness;
          SpecParamsBuf[Off + 2] = P.Anisotropy;
          SpecParamsBuf[Off + 3] = P.Ior;

          CoatTransBuf[Off + 0] = P.CoatWeight;
          CoatTransBuf[Off + 1] = P.CoatRoughness;
          CoatTransBuf[Off + 2] = P.Transmission;
          CoatTransBuf[Off + 3] = P.Abbe;

          F82EmitBuf[Off + 0] = P.EdgeTintF82[0];
          F82EmitBuf[Off + 1] = P.EdgeTintF82[1];
          F82EmitBuf[Off + 2] = P.EdgeTintF82[2];
          F82EmitBuf[Off + 3] = P.Emission;

          AttenBuf[Off + 0] = P.Attenuation[0];
          AttenBuf[Off + 1] = P.Attenuation[1];
          AttenBuf[Off + 2] = P.Attenuation[2];
          AttenBuf[Off + 3] = 1.0;
        }
        Gl.uniform1i(Uniforms.uPrimCount, PrimCount);
        Gl.uniform4fv(Uniforms.uPrimCenterShape, CenterShapeBuf);
        Gl.uniform4fv(Uniforms.uPrimHalfExtShadow, HalfExtShadowBuf);
        Gl.uniform4fv(Uniforms.uPrimRotRad, RotRadBuf);
        Gl.uniform4fv(Uniforms.uPrimAlbedoMetal, AlbedoMetalBuf);
        Gl.uniform4fv(Uniforms.uPrimSpecParams, SpecParamsBuf);
        Gl.uniform4fv(Uniforms.uPrimCoatTrans, CoatTransBuf);
        Gl.uniform4fv(Uniforms.uPrimF82Emit, F82EmitBuf);
        Gl.uniform4fv(Uniforms.uPrimAtten, AttenBuf);

        Gl.drawArrays(Gl.TRIANGLES, 0, 3);
      } else {
        RenderSoftwareGtxFallback(Canvas, Scene, ActiveSelId);
      }

      RafId = requestAnimationFrame(RenderFrame);
    };

    RafId = requestAnimationFrame(RenderFrame);
    return () => {
      cancelAnimationFrame(RafId);
      if (Gl && Program) Gl.deleteProgram(Program);
      if (Gl && Vao) Gl.deleteVertexArray(Vao);
    };
  }, [EffectiveProjection, UpdateEditorCamera, OnFpsSample, View]);

  // Interactive EditorCamera Orbit / Pan / Free-Look / Ray-Pick handlers
  const HandlePointerDown = (Event) => {
    Event.currentTarget.focus();
    const Mode =
      Event.button === 1 || (Event.button === 0 && Event.shiftKey)
        ? "pan"
        : Event.button === 2
          ? "look"
          : "orbit";
    DragRef.current = {
      PointerId: Event.pointerId,
      StartX: Event.clientX,
      StartY: Event.clientY,
      LastX: Event.clientX,
      LastY: Event.clientY,
      Moved: false,
      Mode,
      Origin: [...CompiledScene.CameraOrigin],
      Target: [...CompiledScene.CameraTarget],
    };
    Event.currentTarget.setPointerCapture(Event.pointerId);
  };

  const HandlePointerMove = (Event) => {
    const Drag = DragRef.current;
    if (!Drag || Drag.PointerId !== Event.pointerId) return;
    const TotalDist = Math.hypot(
      Event.clientX - Drag.StartX,
      Event.clientY - Drag.StartY,
    );
    if (TotalDist > 4) Drag.Moved = true;
    if (!Drag.Moved || !UpdateEditorCamera || EffectiveProjection !== "PERSP")
      return;

    const Dx = Event.clientX - Drag.LastX;
    const Dy = Event.clientY - Drag.LastY;
    Drag.LastX = Event.clientX;
    Drag.LastY = Event.clientY;

    const CurOrigin = LatestSceneRef.current.CompiledScene.CameraOrigin;
    const CurTarget = LatestSceneRef.current.CompiledScene.CameraTarget;
    const Offset = [
      CurOrigin[0] - CurTarget[0],
      CurOrigin[1] - CurTarget[1],
      CurOrigin[2] - CurTarget[2],
    ];
    const Dist = Math.max(0.4, Math.hypot(Offset[0], Offset[1], Offset[2]));

    if (Drag.Mode === "orbit") {
      let Azimuth = Math.atan2(Offset[0], Offset[1]);
      let Elevation = Math.asin(Math.max(-0.98, Math.min(0.98, Offset[2] / Dist)));
      Azimuth -= Dx * 0.0065;
      Elevation = Math.max(-1.35, Math.min(1.42, Elevation + Dy * 0.0055));
      const CosEl = Math.cos(Elevation);
      const NextOrigin = [
        +(CurTarget[0] + Dist * CosEl * Math.sin(Azimuth)).toFixed(4),
        +(CurTarget[1] + Dist * CosEl * Math.cos(Azimuth)).toFixed(4),
        +(CurTarget[2] + Dist * Math.sin(Elevation)).toFixed(4),
      ];
      UpdateEditorCamera({ Position: NextOrigin, Target: CurTarget });
    } else if (Drag.Mode === "pan") {
      const Fwd = NormalizeVec3([
        CurTarget[0] - CurOrigin[0],
        CurTarget[1] - CurOrigin[1],
        CurTarget[2] - CurOrigin[2],
      ]);
      const Right = NormalizeVec3(
        [Fwd[1], -Fwd[0], 0],
        [1, 0, 0],
      );
      const Up = NormalizeVec3([
        Right[1] * Fwd[2] - Right[2] * Fwd[1],
        Right[2] * Fwd[0] - Right[0] * Fwd[2],
        Right[0] * Fwd[1] - Right[1] * Fwd[0],
      ]);
      const Scale = Dist * 0.0018;
      const Shift = [
        (-Dx * Right[0] + Dy * Up[0]) * Scale,
        (-Dx * Right[1] + Dy * Up[1]) * Scale,
        (-Dx * Right[2] + Dy * Up[2]) * Scale,
      ];
      UpdateEditorCamera({
        Position: CurOrigin.map((V, I) => +(V + Shift[I]).toFixed(4)),
        Target: CurTarget.map((V, I) => +(V + Shift[I]).toFixed(4)),
      });
    } else if (Drag.Mode === "look") {
      const LookVec = [
        CurTarget[0] - CurOrigin[0],
        CurTarget[1] - CurOrigin[1],
        CurTarget[2] - CurOrigin[2],
      ];
      let Yaw = Math.atan2(LookVec[0], LookVec[1]) + Dx * 0.0045;
      let Pitch =
        Math.asin(Math.max(-0.98, Math.min(0.98, LookVec[2] / Dist))) -
        Dy * 0.0045;
      Pitch = Math.max(-1.35, Math.min(1.35, Pitch));
      const CosP = Math.cos(Pitch);
      UpdateEditorCamera({
        Position: CurOrigin,
        Target: [
          +(CurOrigin[0] + Dist * CosP * Math.sin(Yaw)).toFixed(4),
          +(CurOrigin[1] + Dist * CosP * Math.cos(Yaw)).toFixed(4),
          +(CurOrigin[2] + Dist * Math.sin(Pitch)).toFixed(4),
        ],
      });
    }
  };

  const HandlePointerUp = (Event) => {
    const Drag = DragRef.current;
    DragRef.current = null;
    if (!Drag || Drag.Moved || Event.button !== 0) return;

    const Rect = Event.currentTarget.getBoundingClientRect();
    const U = (Event.clientX - Rect.left) / Math.max(1, Rect.width);
    const V = (Event.clientY - Rect.top) / Math.max(1, Rect.height);
    const HitId = PickSceneEntityAtUv(
      CompiledScene,
      U,
      V,
      Rect.width / Math.max(1, Rect.height),
    );
    if (HitId && Select) Select(HitId);
  };

  const HandleWheel = (Event) => {
    if (!UpdateEditorCamera || EffectiveProjection !== "PERSP") return;
    Event.preventDefault();
    const { CameraOrigin: CurO, CameraTarget: CurT } =
      LatestSceneRef.current.CompiledScene;
    const Offset = [CurO[0] - CurT[0], CurO[1] - CurT[1], CurO[2] - CurT[2]];
    const Dist = Math.hypot(Offset[0], Offset[1], Offset[2]);
    const NextDist = Math.max(
      0.55,
      Math.min(28.0, Dist * Math.exp(Event.deltaY * 0.0011)),
    );
    const Scale = NextDist / Math.max(1e-4, Dist);
    UpdateEditorCamera({
      Position: CurT.map((T, I) => +(T + Offset[I] * Scale).toFixed(4)),
      Target: CurT,
    });
  };

  const CameraMovedFromCanonical = useMemo(() => {
    const P = CompiledScene.CameraOrigin;
    const C = CanonicalEditorCamera.Position;
    return Math.hypot(P[0] - C[0], P[1] - C[1], P[2] - C[2]) > 0.02;
  }, [CompiledScene.CameraOrigin]);

  return (
    <div
      ref={ContainerRef}
      className="checker-pane gtx-world-pane"
      role="region"
      tabIndex={0}
      aria-label={
        View === 1
          ? "Tier 1 GTX World Viewport"
          : "Secondary Tier 1 GTX World Viewport"
      }
      onContextMenu={(Event) => Event.preventDefault()}
      onPointerDown={HandlePointerDown}
      onPointerMove={HandlePointerMove}
      onPointerUp={HandlePointerUp}
      onWheel={HandleWheel}
      onMouseEnter={() => SetHoveredHud(true)}
      onMouseLeave={() => {
        SetHoveredHud(false);
        KeysRef.current.clear();
      }}
      onBlur={() => KeysRef.current.clear()}
      onKeyDown={(Event) => {
        if (
          ["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight"].includes(
            Event.code,
          )
        ) {
          KeysRef.current.add(Event.code.startsWith("Shift") ? "Shift" : Event.code);
        } else if (Event.key === "Home" && UpdateEditorCamera) {
          UpdateEditorCamera({
            Position: [...CanonicalEditorCamera.Position],
            Target: [...CanonicalEditorCamera.Target],
          });
        }
      }}
      onKeyUp={(Event) => {
        KeysRef.current.delete(
          Event.code.startsWith("Shift") ? "Shift" : Event.code,
        );
      }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        outline: "none",
        background: "#0e1014",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      <canvas
        ref={CanvasRef}
        data-gtx-viewport={View}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {/* Bottom-left native mirror caption matching C++ ViewportPanel */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          pointerEvents: "none",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "rgba(224, 226, 232, 0.78)",
          textShadow: "0 1px 2px rgba(0,0,0,0.75)",
        }}
      >
        <span>
          HTML C++ MIRROR · TIER 1 GTX WORLD RASTER ({EffectiveProjection})
        </span>
        {HoveredHud && EffectiveProjection === "PERSP" && (
          <span style={{ color: "rgba(182, 188, 198, 0.72)" }}>
            Drag: Orbit · Shift+Drag: Pan · Wheel: Dolly · Right+WASD: Fly · Click: Pick
          </span>
        )}
      </div>

      {/* Reset EditorCamera button when camera moved away from C++ canonical pose */}
      {View === 1 && CameraMovedFromCanonical && UpdateEditorCamera && (
        <button
          type="button"
          onClick={(Event) => {
            Event.stopPropagation();
            UpdateEditorCamera({
              Position: [...CanonicalEditorCamera.Position],
              Target: [...CanonicalEditorCamera.Target],
            });
          }}
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(232, 194, 122, 0.45)",
            background: "rgba(18, 18, 20, 0.82)",
            color: "#eff4cf",
            fontSize: 10.5,
            cursor: "pointer",
          }}
          title="Reset EditorCamera to exact C++ canonical pose (0.00, -3.55, 0.42)"
        >
          Reset EditorCamera
        </button>
      )}

      {/* Bottom-right Z-up X/Y/Z orientation triad matching C++ ViewportPanel */}
      <svg
        width="44"
        height="44"
        viewBox="0 0 44 44"
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 10,
          bottom: 8,
          pointerEvents: "none",
          opacity: 0.9,
        }}
      >
        <line x1="22" y1="26" x2="36" y2="26" stroke="#e05a5a" strokeWidth="1.6" />
        <text x="37" y="29" fill="#e05a5a" fontSize="8" fontFamily="sans-serif">
          X
        </text>
        <line x1="22" y1="26" x2="12" y2="34" stroke="#5ac878" strokeWidth="1.6" />
        <text x="5" y="38" fill="#5ac878" fontSize="8" fontFamily="sans-serif">
          Y
        </text>
        <line x1="22" y1="26" x2="22" y2="10" stroke="#5aa2e8" strokeWidth="1.6" />
        <text x="19" y="8" fill="#5aa2e8" fontSize="8" fontFamily="sans-serif">
          Z
        </text>
        <circle cx="22" cy="26" r="2.2" fill="#d8dce4" />
      </svg>
    </div>
  );
}
