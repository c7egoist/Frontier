//==========================================================================================================================================
// FILE: GlobalDistanceFieldGiGl.js
// PURPOSE: WebGL2 runtime of the GPU global distance field GI — the same kernels and the same incremental scheduling as the WebGPU
//          module (GlobalDistanceFieldGi.js), expressed as fragment passes because WebGL2 has no compute:
//            * voxel kernels render into the layers of RGBA16F 3D textures (MRT for paired outputs), viewport = dirty voxel box
//            * the per-mesh SDF bake renders into a 2048-wide RG32F texture (once per vehicle mesh set)
//            * probes trace into an RGBA32F ray texture and blend into a ping-ponged RGBA32F field texture (header + probe block)
//          Requires EXT_color_buffer_float (float render targets); without it the GI engines report "unavailable".
//==========================================================================================================================================

import { GdfTracingGlsl, GDF_EMITTER_GLSL } from "./GlobalDistanceFieldShaders.js";
import {
  CreateGiParamBlock,
  ComputeDirtyVoxelBox,
  DiffPrimitiveRows,
  FullVoxelBox,
  GDF_CONVERGE_FRAMES,
  GDF_FIELD_HEADER_VEC4,
  GDF_FIELD_TEXTURE_WIDTH,
  GDF_MAX_DYNAMIC_INSTANCES,
  GI_PARAM_VEC4,
  LightingSignature,
  PackDynamicInstances,
  PackGiParams,
  PlanLocalMeshGrids,
  ResolveGdfLayout,
  StampGiDispatch,
  UnionVoxelBox,
  WriteGdfFieldHeader,
} from "./GlobalDistanceFieldLayout.js";
import { ExpandVehicleInstances } from "./VehicleBvhAssets.js";

const SURFACE_CACHE_HYSTERESIS = 0.9;
const LOCAL_SDF_WIDTH = 2048;

//==========================================================================================================================================
// GLSL kernels
//==========================================================================================================================================
const VERTEX_GLSL = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const PRELUDE_GLSL = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;

uniform vec4 uPF[${GI_PARAM_VEC4}];
uniform ivec4 uPI[${GI_PARAM_VEC4}];
uniform int uSlice;
uniform sampler2D uScenePack;
uniform sampler2D uBvhNodesT;
uniform sampler2D uBvhTrisT;
uniform sampler2D uDynInstT;
uniform sampler2D uLocalSdfT;
uniform sampler2D uMeshGridT;
uniform sampler3D tStaticDist;
uniform sampler3D tStaticAttr;
uniform sampler3D tField;
uniform sampler3D tAttr;
uniform sampler3D tRadPrev;
uniform sampler3D tIndPrev;
uniform sampler2D tSky;
uniform sampler2D uRaysT;
uniform sampler2D uFieldPrev;

#define P_center uPF[0]
#define P_extent uPF[1]
#define P_res uPI[2]
#define P_boxMin uPI[3]
#define P_boxMax uPI[4]
#define P_counts uPI[5]
#define P_sunDir uPF[6]
#define P_sunIrr uPF[7]
#define P_moonDir uPF[8]
#define P_moonIrr uPF[9]
#define P_band uPF[10]
#define P_rot0 uPF[11]
#define P_rot1 uPF[12]
#define P_rot2 uPF[13]
#define P_probeMin uPF[14]
#define P_probeSp uPF[15]
#define P_probeCnt uPI[16]
#define P_probeOff uPI[17]

const float PI = 3.14159265359;

${GdfTracingGlsl("tField", "tRadPrev")}

GdfLayout layoutFromParams() {
  GdfLayout L;
  L.center = P_center.xyz;
  L.half0 = P_extent.x; L.half1 = P_extent.y; L.voxel0 = P_extent.z; L.voxel1 = P_extent.w;
  L.res0 = float(P_res.x); L.res1 = float(P_res.y); L.stackW = float(P_res.z); L.stackD = float(P_res.x + P_res.y);
  L.zoff1 = float(P_res.w); L.band1 = P_band.y;
  return L;
}

vec4 sp(int col, int row) { return texelFetch(uScenePack, ivec2(col, row), 0); }
vec4 bvhNode(int slot) { return texelFetch(uBvhNodesT, ivec2(slot & 2047, slot >> 11), 0); }
vec4 bvhTri(int slot) { return texelFetch(uBvhTrisT, ivec2(slot & 2047, slot >> 11), 0); }
int clipRes(int c) { return c == 0 ? P_res.x : P_res.y; }
float clipHalf(int c) { return c == 0 ? P_extent.x : P_extent.y; }
float clipVoxel(int c) { return c == 0 ? P_extent.z : P_extent.w; }
float clipBand(int c) { return c == 0 ? P_band.x : P_band.y; }
ivec3 clipTexel(int c, ivec3 v) { return ivec3(v.x, v.y, v.z + (c == 0 ? 0 : P_res.w)); }
vec3 voxelCenter(int c, ivec3 v) { return P_center.xyz - vec3(clipHalf(c)) + (vec3(v) + 0.5) * clipVoxel(c); }
ivec3 sliceVoxel() { return ivec3(ivec2(gl_FragCoord.xy), uSlice); }

uint hashU(uint x) {
  uint h = x * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return (h >> 22u) ^ h;
}
float hashF(uint x) { return float(hashU(x) & 16777215u) / 16777216.0; }
vec3 frameRotate(vec3 d) { return vec3(dot(P_rot0.xyz, d), dot(P_rot1.xyz, d), dot(P_rot2.xyz, d)); }

vec3 sphericalFibonacci(int i, int n) {
  float z = 1.0 - (2.0 * float(i) + 1.0) / float(n);
  float r = sqrt(max(0.0, 1.0 - z * z));
  float phi = float(i) * 2.39996323;
  return vec3(r * cos(phi), r * sin(phi), z);
}

vec3 octDecode(vec2 uv) {
  vec2 o = uv * 2.0 - 1.0;
  vec3 n = vec3(o.x, o.y, 1.0 - abs(o.x) - abs(o.y));
  if (n.z < 0.0) n = vec3((1.0 - abs(o.y)) * (o.x >= 0.0 ? 1.0 : -1.0), (1.0 - abs(o.x)) * (o.y >= 0.0 ? 1.0 : -1.0), n.z);
  return normalize(n);
}

vec2 skyUv(vec3 dir) {
  const float kLimb = 1.576404012;
  const float kHalfH = 54.0;
  float az = atan(dir.y, dir.x);
  float polar = acos(clamp(dir.z, -1.0, 1.0));
  float u = fract(az * (0.5 / PI) + 0.5);
  float y = kHalfH + sqrt(clamp((polar - kLimb) / (PI - kLimb), 0.0, 1.0)) * (kHalfH - 1.0);
  if (polar <= kLimb) y = sqrt(clamp(1.0 - polar / kLimb, 0.0, 1.0)) * (kHalfH - 1.0);
  return vec2(u, (y + 0.5) / (kHalfH * 2.0));
}

vec3 skyRadiance(vec3 dir) {
  if ((P_counts.w & 16) == 0) return vec3(0.0);
  return textureLod(tSky, skyUv(dir), 0.0).rgb * P_moonIrr.w;
}

${GDF_EMITTER_GLSL}
`;

const STATIC_BUILD_GLSL = /* glsl */ `
layout(location = 0) out vec4 oDist;
layout(location = 1) out vec4 oAttr;

float sdBox(vec3 p, vec3 h) {
  vec3 q = abs(p) - h;
  return length(max(q, vec3(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdCappedCone(vec3 p, float z0, float z1, float r0, float r1) {
  float H = max(1e-5, 0.5 * (z1 - z0));
  vec2 q = vec2(length(p.xy), p.z - 0.5 * (z0 + z1));
  vec2 k1 = vec2(r1, H);
  vec2 k2 = vec2(r1 - r0, 2.0 * H);
  vec2 ca = vec2(q.x - min(q.x, q.y < 0.0 ? r0 : r1), abs(q.y) - H);
  float t = clamp(dot(k1 - q, k2) / max(1e-9, dot(k2, k2)), 0.0, 1.0);
  vec2 cb = q - k1 + k2 * t;
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

float primLocalSd(int shape, vec3 p, vec3 h) {
  if (shape == 0) return sdBox(p, h);
  if (shape == 1) {
    float k0 = length(p / h);
    float k1 = length(p / (h * h));
    return k1 > 1e-9 ? k0 * (k0 - 1.0) / k1 : -min(h.x, min(h.y, h.z));
  }
  if (shape == 4) {
    float rMinor = h.z;
    float rMajor = max(rMinor * 1.25, max(h.x, h.y) - rMinor);
    return length(vec2(length(p.xy) - rMajor, p.z)) - rMinor;
  }
  float rad = max(h.x, h.y);
  if (shape == 3) {
    float zf = -0.78 * h.z;
    float bd = sdBox(p - vec3(0.0, 0.0, 0.5 * (zf - h.z)), vec3(rad, rad, 0.5 * (zf + h.z)));
    return min(bd, sdCappedCone(p, zf, h.z, 0.72 * rad, 0.13 * rad));
  }
  if (shape == 5) {
    float zf = -0.84 * h.z;
    return min(sdCappedCone(p, -h.z, zf, rad, 0.94 * rad), sdCappedCone(p, zf, h.z, 0.5 * rad, 0.37 * rad));
  }
  return sdCappedCone(p, -h.z, h.z, rad, rad);
}

void main() {
  int c = P_boxMin.w;
  ivec3 v = sliceVoxel();
  vec3 p = voxelCenter(c, v);
  float band = clipBand(c);
  float best = band;
  int bestIdx = -1;
  for (int i = 0; i < P_counts.x; ++i) {
    int flags = int(sp(1, i).w + 0.5);
    if ((flags & 3) == 0 || (flags & 4) != 0) continue;
    vec4 ps = sp(0, i);
    vec3 h = sp(1, i).xyz;
    if (length(p - ps.xyz) - length(h) >= best) continue;
    vec3 lp = vec3(dot(sp(2, i).xyz, p - ps.xyz), dot(sp(3, i).xyz, p - ps.xyz), dot(sp(4, i).xyz, p - ps.xyz));
    float d = primLocalSd(int(ps.w + 0.5), lp, h);
    if (d < best) { best = d; bestIdx = i; }
  }
  oDist = vec4(clamp(best, -band, band), 0.0, 0.0, 0.0);
  oAttr = bestIdx >= 0 ? vec4(clamp(sp(6, bestIdx).rgb, vec3(0.0), vec3(1.0)), 0.0) : vec4(0.0);
}
`;

const LOCAL_BAKE_GLSL = /* glsl */ `
layout(location = 0) out vec4 oSdf;

float closestTriDist2(vec3 p, vec3 a, vec3 b, vec3 c) {
  vec3 ab = b - a; vec3 ac = c - a; vec3 ap = p - a;
  float d1 = dot(ab, ap); float d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) return dot(ap, ap);
  vec3 bp = p - b;
  float d3 = dot(ab, bp); float d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) return dot(bp, bp);
  float vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) { vec3 q = a + ab * (d1 / (d1 - d3)); return dot(p - q, p - q); }
  vec3 cp = p - c;
  float d5 = dot(ab, cp); float d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) return dot(cp, cp);
  float vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) { vec3 q = a + ac * (d2 / (d2 - d6)); return dot(p - q, p - q); }
  float va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    vec3 q = b + (c - b) * ((d4 - d3) / ((d4 - d3) + (d5 - d6)));
    return dot(p - q, p - q);
  }
  float dn = 1.0 / (va + vb + vc);
  vec3 q = a + ab * (vb * dn) + ac * (vc * dn);
  return dot(p - q, p - q);
}

float aabbDist2(vec3 p, vec3 mn, vec3 mx) {
  vec3 d = max(max(mn - p, vec3(0.0)), p - mx);
  return dot(d, d);
}

void main() {
  int m = P_boxMin.w;
  vec4 g0 = texelFetch(uMeshGridT, ivec2(0, m), 0);
  vec4 g1 = texelFetch(uMeshGridT, ivec2(1, m), 0);
  vec4 g2 = texelFetch(uMeshGridT, ivec2(2, m), 0);
  ivec3 dims = ivec3(g1.xyz + 0.5);
  int idx = int(gl_FragCoord.y) * ${LOCAL_SDF_WIDTH} + int(gl_FragCoord.x) - int(g1.w + 0.5);
  if (idx < 0 || idx >= dims.x * dims.y * dims.z) discard;
  int vx = idx % dims.x;
  int vy = (idx / dims.x) % dims.y;
  int vz = idx / (dims.x * dims.y);
  vec3 p = g0.xyz + vec3(float(vx), float(vy), float(vz)) * g0.w;
  float best2 = 1e30;
  float bestMat = 6.0;
  int stack[64];
  int top = 1;
  stack[0] = int(g2.x + 0.5);
  for (int guard = 0; guard < 4096; ++guard) {
    if (top <= 0) break;
    top--;
    int ni = stack[top];
    vec4 n0 = bvhNode(ni * 2);
    vec4 n1 = bvhNode(ni * 2 + 1);
    if (aabbDist2(p, n0.xyz, n1.xyz) >= best2) continue;
    int lf = int(round(n0.w));
    int cnt = int(round(n1.w));
    if (cnt > 0) {
      for (int t = 0; t < cnt; ++t) {
        int tb = (lf + t) * 4;
        vec4 a = bvhTri(tb);
        float d2 = closestTriDist2(p, a.xyz, bvhTri(tb + 1).xyz, bvhTri(tb + 2).xyz);
        if (d2 < best2) { best2 = d2; bestMat = a.w; }
      }
    } else if (top < 62) {
      vec4 l0 = bvhNode(lf * 2); vec4 l1 = bvhNode(lf * 2 + 1);
      vec4 r0 = bvhNode((lf + 1) * 2); vec4 r1 = bvhNode((lf + 1) * 2 + 1);
      float dl = aabbDist2(p, l0.xyz, l1.xyz);
      float dr = aabbDist2(p, r0.xyz, r1.xyz);
      if (dl < dr) { stack[top] = lf + 1; stack[top + 1] = lf; } else { stack[top] = lf; stack[top + 1] = lf + 1; }
      top += 2;
    }
  }
  oSdf = vec4(sqrt(best2), bestMat, 0.0, 0.0);
}
`;

const COMPOSE_GLSL = /* glsl */ `
layout(location = 0) out vec4 oField;
layout(location = 1) out vec4 oAttr;

vec2 localSdfAt(int i) { return texelFetch(uLocalSdfT, ivec2(i & ${LOCAL_SDF_WIDTH - 1}, i / ${LOCAL_SDF_WIDTH}), 0).xy; }

vec2 sampleLocalSdf(int m, vec3 lp) {
  vec4 g0 = texelFetch(uMeshGridT, ivec2(0, m), 0);
  vec4 g1 = texelFetch(uMeshGridT, ivec2(1, m), 0);
  ivec3 dims = ivec3(g1.xyz + 0.5);
  int off = int(g1.w + 0.5);
  vec3 q = (lp - g0.xyz) / g0.w;
  vec3 qc = clamp(q, vec3(0.0), vec3(dims - ivec3(1)));
  float outside = length(q - qc) * g0.w;
  ivec3 i0 = min(ivec3(floor(qc)), dims - ivec3(2));
  vec3 f = qc - vec3(i0);
  float d = 0.0;
  for (int k = 0; k < 8; ++k) {
    ivec3 o = ivec3(k & 1, (k >> 1) & 1, (k >> 2) & 1);
    float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y) * (o.z == 1 ? f.z : 1.0 - f.z);
    ivec3 c = i0 + o;
    d += w * localSdfAt(off + (c.z * dims.y + c.y) * dims.x + c.x).x;
  }
  ivec3 n = ivec3(floor(qc + vec3(0.5)));
  return vec2(d + outside, localSdfAt(off + (n.z * dims.y + n.y) * dims.x + n.x).y);
}

vec4 vehicleAttr(int matId, vec3 paint) {
  if (matId == 6) return vec4(paint * 0.75, 0.0);
  if (matId == 7) return vec4(0.045, 0.052, 0.070, 0.0) * 0.92;
  if (matId == 8 || matId == 15 || matId == 16) return vec4(vec3(0.075, 0.08, 0.09) * 0.85, 0.0);
  if (matId == 9) return vec4(vec3(0.045, 0.048, 0.055) * 0.94, 0.0);
  if (matId == 10) return vec4(vec3(0.76, 0.79, 0.84) * 0.08, 0.0);
  if (matId == 11) return vec4(vec3(0.055, 0.058, 0.065) * 0.98, 0.0);
  if (matId == 12) return vec4(vec3(0.84, 0.86, 0.90) * 0.05, 0.0);
  if (matId == 13) return vec4(1.0, 0.97, 0.90, 5.0);
  if (matId == 14) return vec4(1.0, 0.08, 0.06, 3.8);
  return vec4(paint * 0.75, 0.0);
}

vec4 dyn(int i, int k) { return texelFetch(uDynInstT, ivec2(k, i), 0); }

void main() {
  int c = P_boxMin.w;
  ivec3 v = sliceVoxel();
  ivec3 tx = clipTexel(c, v);
  vec3 p = voxelCenter(c, v);
  float band = clipBand(c);
  float shell = 0.25 * clipVoxel(c);
  float d = texelFetch(tStaticDist, tx, 0).x;
  vec4 attr = texelFetch(tStaticAttr, tx, 0);
  for (int i = 0; i < P_boxMax.w; ++i) {
    vec4 mn = dyn(i, 3);
    vec4 mx = dyn(i, 4);
    if (any(lessThan(p, mn.xyz - vec3(band))) || any(greaterThan(p, mx.xyz + vec3(band)))) continue;
    vec4 r0 = dyn(i, 0); vec4 r1 = dyn(i, 1); vec4 r2 = dyn(i, 2);
    vec3 lp = vec3(dot(r0.xyz, p) + r0.w, dot(r1.xyz, p) + r1.w, dot(r2.xyz, p) + r2.w);
    vec2 ls = sampleLocalSdf(int(mn.w + 0.5), lp);
    float dl = ls.x * mx.w - shell;
    if (dl < d) {
      d = dl;
      int ov = int(round(dyn(i, 6).x)) - 1;
      attr = vehicleAttr(ov >= 0 ? ov : int(round(ls.y)), dyn(i, 5).xyz);
    }
  }
  oField = vec4(clamp(d, -band, band), 0.0, 0.0, 1.0);
  oAttr = attr;
}
`;

const SURFACE_LIGHT_GLSL = /* glsl */ `
layout(location = 0) out vec4 oRad;
layout(location = 1) out vec4 oInd;

float fieldAt(int c, ivec3 v) {
  int r = clipRes(c) - 1;
  return texelFetch(tField, clipTexel(c, clamp(v, ivec3(0), ivec3(r))), 0).x;
}

vec3 fieldNormalAt(int c, ivec3 v) {
  vec3 g = vec3(fieldAt(c, v + ivec3(1, 0, 0)) - fieldAt(c, v - ivec3(1, 0, 0)),
                fieldAt(c, v + ivec3(0, 1, 0)) - fieldAt(c, v - ivec3(0, 1, 0)),
                fieldAt(c, v + ivec3(0, 0, 1)) - fieldAt(c, v - ivec3(0, 0, 1)));
  float gl = length(g);
  return gl > 1e-6 ? g / gl : vec3(0.0, 0.0, 1.0);
}

vec3 directIrradiance(GdfLayout L, vec3 p, vec3 N, vec3 o) {
  int flags = P_counts.w;
  vec3 E = vec3(0.0);
  if ((flags & 1) != 0) {
    float ndl = dot(N, P_sunDir.xyz);
    if (ndl > 0.0 && dot(P_sunIrr.rgb, vec3(1.0)) > 1e-6) {
      E += P_sunIrr.rgb * ndl * gdfSoftShadow(L, o, P_sunDir.xyz, P_band.z, P_sunDir.w);
    }
    float mdl = dot(N, P_moonDir.xyz);
    if (mdl > 0.0 && dot(P_moonIrr.rgb, vec3(1.0)) > 1e-7) {
      E += P_moonIrr.rgb * mdl * gdfSoftShadow(L, o, normalize(P_moonDir.xyz), P_band.z, P_sunDir.w);
    }
  }
  for (int li = 0; li < P_counts.y; ++li) {
    int row = 384 + li;
    vec4 l0 = sp(0, row); vec4 l1 = sp(1, row); vec4 l2 = sp(2, row);
    bool omni = l2.z > 0.5;
    if (omni && (flags & 4) == 0) continue;
    if (!omni && (flags & 2) == 0) continue;
    vec3 ln = sp(5, row).xyz;
    if (!omni && dot(p - l0.xyz, ln) <= 0.0) continue;
    float ff = gdfQuadFF(p, N, l0.xyz, sp(3, row).xyz * l0.w, sp(4, row).xyz * l1.x);
    if (ff <= 1e-5) continue;
    vec3 toL = l0.xyz - p;
    float dist = length(toL);
    float k = clamp(dist / max(0.05, max(l0.w, l1.x)), 1.5, 24.0);
    float vis = gdfSoftShadow(L, o, toL / max(dist, 1e-4), max(0.0, dist - 0.06), k);
    E += l1.yzw * (PI * ff * (omni ? 1.35 : 1.0) * vis);
  }
  if ((flags & 8) != 0) {
    for (int ei = 0; ei < P_counts.x; ++ei) {
      vec4 g = sp(6, ei);
      if (g.w <= 0.05) continue;
      vec4 ps = sp(0, ei);
      vec3 h = sp(1, ei).xyz;
      int shape = int(ps.w + 0.5);
      vec3 Le = g.rgb * g.w;
      vec3 toE = ps.xyz - p;
      float dist = length(toE);
      float rad = length(h);
      if (dist < rad * 0.6) continue;
      float e = 0.0;
      if (shape == 1) {
        float r = (h.x + h.y + h.z) / 3.0;
        float s2 = clamp(r * r / max(dist * dist, 1e-6), 0.0, 0.9999);
        e = gdfSphereIlluminance(dot(N, toE / dist), s2);
      } else {
        float scale = shape == 0 ? 1.0 : 0.785398;
        vec3 c0 = sp(2, ei).xyz; vec3 c1 = sp(3, ei).xyz; vec3 c2 = sp(4, ei).xyz;
        for (int f = 0; f < 6; ++f) {
          int ax = f >> 1;
          float sg = (f & 1) == 1 ? 1.0 : -1.0;
          vec3 na = ax == 0 ? c0 : (ax == 1 ? c1 : c2);
          vec3 ua = ax == 0 ? c1 : (ax == 1 ? c2 : c0);
          vec3 va = ax == 0 ? c2 : (ax == 1 ? c0 : c1);
          float ha = ax == 0 ? h.x : (ax == 1 ? h.y : h.z);
          float hu = ax == 0 ? h.y : (ax == 1 ? h.z : h.x);
          float hv = ax == 0 ? h.z : (ax == 1 ? h.x : h.y);
          vec3 fc = ps.xyz + na * (sg * ha);
          if (dot(p - fc, na * sg) <= 0.0) continue;
          e += PI * gdfQuadFF(p, N, fc, ua * hu, va * hv) * scale;
        }
      }
      if (e <= 1e-6) continue;
      float vis = gdfSoftShadow(L, o, toE / dist, max(0.0, dist - rad * 1.05), clamp(dist / max(rad, 0.05), 1.5, 24.0));
      E += Le * (e * vis);
    }
  }
  return E;
}

void main() {
  int c = P_boxMin.w;
  int r = clipRes(c);
  ivec3 v = sliceVoxel();
  ivec3 tx = clipTexel(c, v);
  float vx = clipVoxel(c);
  float d = texelFetch(tField, tx, 0).x;
  if (abs(d) > 1.5 * vx) { oRad = vec4(0.0); oInd = vec4(0.0); return; }
  vec3 N = fieldNormalAt(c, v);
  vec3 p = voxelCenter(c, v) - N * d;
  vec4 attr = texelFetch(tAttr, tx, 0);
  GdfLayout L = layoutFromParams();
  vec3 o = p + N * (vx * 1.05);
  vec3 Ed = directIrradiance(L, p, N, o);
  int rays = max(1, P_counts.z);
  mat3 F = gdfFrame(N);
  uint seed = hashU((uint(tx.x) * 73856093u) ^ (uint(tx.y) * 19349663u) ^ (uint(tx.z) * 83492791u));
  float j0 = hashF(seed ^ uint(P_center.w * 7919.0));
  float j1 = hashF((seed * 3u) + uint(P_center.w * 104729.0));
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 16; ++k) {
    if (k >= rays) break;
    float u1 = fract((float(k) + j0) / float(rays));
    float phi = 6.28318531 * fract(float(k) * 0.61803399 + j1);
    float st = sqrt(u1);
    vec3 dir = F * vec3(st * cos(phi), st * sin(phi), sqrt(max(0.0, 1.0 - u1)));
    float th; vec3 hp;
    if (gdfTrace(L, o, dir, P_band.z, th, hp)) {
      if ((P_counts.w & 32) != 0) acc += gdfRadiance(L, hp);
    } else {
      acc += skyRadiance(dir);
    }
  }
  vec3 EiNew = PI * acc / float(rays);
  if ((P_counts.w & 64) != 0) {
    vec3 sum = EiNew * 2.0;
    float ws = 2.0;
    for (int f = 0; f < 6; ++f) {
      int ax = f >> 1;
      int o1 = (f & 1) == 1 ? 1 : -1;
      ivec3 nv = v + ivec3(ax == 0 ? o1 : 0, ax == 1 ? o1 : 0, ax == 2 ? o1 : 0);
      if (any(lessThan(nv, ivec3(0))) || any(greaterThanEqual(nv, ivec3(r)))) continue;
      vec4 ni = texelFetch(tIndPrev, clipTexel(c, nv), 0);
      if (ni.a < 0.5) continue;
      float w = pow(max(dot(fieldNormalAt(c, nv), N), 0.0), 8.0);
      sum += ni.rgb * w;
      ws += w;
    }
    EiNew = sum / ws;
  }
  vec4 prevInd = texelFetch(tIndPrev, tx, 0);
  vec3 Ei = prevInd.a > 0.5 ? mix(prevInd.rgb, EiNew, P_sunIrr.w) : EiNew;
  oRad = vec4(attr.rgb / PI * (Ed + Ei) + attr.rgb * attr.a, 1.0);
  oInd = vec4(Ei, 1.0);
}
`;

const PROBE_COMMON_GLSL = /* glsl */ `
vec3 probeGridPos(int ci) {
  int cx = ci % P_probeCnt.x;
  int cy = (ci / P_probeCnt.x) % P_probeCnt.y;
  int cz = ci / (P_probeCnt.x * P_probeCnt.y);
  return P_probeMin.xyz + vec3(float(cx), float(cy), float(cz)) * P_probeSp.xyz;
}

vec3 probePos(GdfLayout L, int ci) {
  vec3 g = probeGridPos(ci);
  int c = gdfClipOf(L, g);
  if (c == 2) return g;
  float vx = gdfVoxelOf(L, c);
  float d = gdfDistanceIn(L, c, g);
  float want = max(vx * 1.25, 0.08);
  if (d >= want) return g;
  return g + gdfNormal(L, g) * min(want - d, 0.45 * P_probeMin.w);
}

vec3 probeRayDir(int r) { return frameRotate(sphericalFibonacci(r, P_probeCnt.w)); }
`;

const PROBE_TRACE_GLSL = /* glsl */ `
${PROBE_COMMON_GLSL}
layout(location = 0) out vec4 oRay;
void main() {
  int r = int(gl_FragCoord.x);
  int ci = int(gl_FragCoord.y);
  if (r >= P_probeCnt.w) { oRay = vec4(0.0); return; }
  GdfLayout L = layoutFromParams();
  vec3 o = probePos(L, ci);
  float maxD = P_probeSp.w;
  vec3 dir = probeRayDir(r);
  float th; vec3 hp;
  vec3 rad;
  float dist = maxD;
  bool back = false;
  if (gdfTrace(L, o, dir, maxD, th, hp)) {
    dist = th;
    back = dot(gdfNormal(L, hp), dir) > 0.25 || th < 1e-4;
    rad = gdfRadiance(L, hp);
  } else {
    rad = skyRadiance(dir);
  }
  oRay = vec4(rad, back ? -max(dist, 1e-4) : dist);
}
`;

const PROBE_BLEND_GLSL = /* glsl */ `
${PROBE_COMMON_GLSL}
layout(location = 0) out vec4 oField;
vec4 ray(int ci, int r) { return texelFetch(uRaysT, ivec2(r, ci), 0); }
vec4 prevAt(int i) { return texelFetch(uFieldPrev, ivec2(i % ${GDF_FIELD_TEXTURE_WIDTH}, i / ${GDF_FIELD_TEXTURE_WIDTH}), 0); }

vec2 momentTexel(int ci, int tex, int rays, float maxD) {
  vec3 nM = octDecode((vec2(float(tex % 16), float(tex / 16)) + 0.5) / 16.0);
  float m1 = 0.0, m2 = 0.0, ws = 0.0;
  for (int r = 0; r < 256; ++r) {
    if (r >= rays) break;
    float dd = min(abs(ray(ci, r).w), maxD);
    float w = pow(max(0.0, dot(nM, probeRayDir(r))), 50.0);
    m1 += w * dd;
    m2 += w * dd * dd;
    ws += w;
  }
  return ws > 1e-5 ? vec2(m1, m2) / ws : vec2(maxD, maxD * maxD);
}

void main() {
  int i = int(gl_FragCoord.y) * ${GDF_FIELD_TEXTURE_WIDTH} + int(gl_FragCoord.x);
  int cells = P_probeCnt.x * P_probeCnt.y * P_probeCnt.z;
  int rays = P_probeCnt.w;
  float maxD = P_probeSp.w;
  float alpha = P_moonDir.w;
  if (i >= P_probeOff.x && i < P_probeOff.x + cells) {
    int ci = i - P_probeOff.x;
    int back = 0;
    for (int r = 0; r < 256; ++r) {
      if (r >= rays) break;
      if (ray(ci, r).w < 0.0) back++;
    }
    GdfLayout L = layoutFromParams();
    oField = vec4(probePos(L, ci), float(back) > 0.25 * float(rays) ? 1.0 : 0.0);
  } else if (i >= P_probeOff.y && i < P_probeOff.y + cells * 64) {
    int ci = (i - P_probeOff.y) / 64;
    int t = (i - P_probeOff.y) % 64;
    vec3 nTex = octDecode((vec2(float(t % 8), float(t / 8)) + 0.5) / 8.0);
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int r = 0; r < 256; ++r) {
      if (r >= rays) break;
      float w = max(0.0, dot(nTex, probeRayDir(r)));
      acc += ray(ci, r).rgb * w;
      wsum += w;
    }
    oField = vec4(mix(prevAt(i).xyz, acc / max(wsum, 1e-4), alpha), 1.0);
  } else if (i >= P_probeOff.z && i < P_probeOff.z + cells * 128) {
    int ci = (i - P_probeOff.z) / 128;
    int j = (i - P_probeOff.z) % 128;
    vec4 mom = vec4(momentTexel(ci, j * 2, rays, maxD), momentTexel(ci, j * 2 + 1, rays, maxD));
    oField = mix(prevAt(i), mom, alpha);
  } else {
    discard;
  }
}
`;

const SAMPLER_UNITS = {
  uScenePack: 0, uBvhNodesT: 1, uBvhTrisT: 2, uDynInstT: 3, uLocalSdfT: 4, uMeshGridT: 5,
  tStaticDist: 6, tStaticAttr: 7, tField: 8, tAttr: 9, tRadPrev: 10, tIndPrev: 11, tSky: 12, uRaysT: 13, uFieldPrev: 14,
};
const SAMPLER_2D = new Set(["uScenePack", "uBvhNodesT", "uBvhTrisT", "uDynInstT", "uLocalSdfT", "uMeshGridT", "tSky", "uRaysT", "uFieldPrev"]);

export const GDF_GL_KERNELS = {
  StaticBuild: STATIC_BUILD_GLSL,
  LocalBake: LOCAL_BAKE_GLSL,
  Compose: COMPOSE_GLSL,
  SurfaceLight: SURFACE_LIGHT_GLSL,
  ProbeTrace: PROBE_TRACE_GLSL,
  ProbeBlend: PROBE_BLEND_GLSL,
};
export const GDF_GL_PRELUDE = PRELUDE_GLSL;
export const GDF_GL_VERTEX = VERTEX_GLSL;

//==========================================================================================================================================
// Runtime
//==========================================================================================================================================
export function CreateGlobalDistanceFieldGiGl(Gl) {
  if (!Gl.getExtension("EXT_color_buffer_float")) return { Ok: false, Reason: "EXT_color_buffer_float unavailable" };
  Gl.getExtension("OES_texture_float_linear");

  const Compile = (Type, Src) => {
    const S = Gl.createShader(Type);
    Gl.shaderSource(S, Src);
    Gl.compileShader(S);
    return S;
  };
  const Vs = Compile(Gl.VERTEX_SHADER, VERTEX_GLSL);
  const Programs = {};
  for (const [Name, Body] of Object.entries(GDF_GL_KERNELS)) {
    const Fs = Compile(Gl.FRAGMENT_SHADER, PRELUDE_GLSL + Body);
    const Prog = Gl.createProgram();
    Gl.attachShader(Prog, Vs);
    Gl.attachShader(Prog, Fs);
    Gl.linkProgram(Prog);
    if (!Gl.getProgramParameter(Prog, Gl.LINK_STATUS)) {
      const Log = `${Name}: ${Gl.getShaderInfoLog(Fs) || ""} ${Gl.getProgramInfoLog(Prog) || ""}`.slice(0, 400);
      return { Ok: false, Reason: `gdf-glsl ${Log}` };
    }
    Gl.useProgram(Prog);
    const Loc = {
      F: Gl.getUniformLocation(Prog, "uPF[0]") || Gl.getUniformLocation(Prog, "uPF"),
      I: Gl.getUniformLocation(Prog, "uPI[0]") || Gl.getUniformLocation(Prog, "uPI"),
      Slice: Gl.getUniformLocation(Prog, "uSlice"),
    };
    for (const [S, Unit] of Object.entries(SAMPLER_UNITS)) {
      const L = Gl.getUniformLocation(Prog, S);
      if (L) Gl.uniform1i(L, Unit);
    }
    Programs[Name] = { Prog, Loc };
  }
  const EmptyVao = Gl.createVertexArray();
  const Fbo = Gl.createFramebuffer();
  const Block = CreateGiParamBlock();

  const Tex2D = (InternalFormat, Format, Type, W, H, Pixels = null) => {
    const T = Gl.createTexture();
    Gl.bindTexture(Gl.TEXTURE_2D, T);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MIN_FILTER, Gl.NEAREST);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_MAG_FILTER, Gl.NEAREST);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
    Gl.texParameteri(Gl.TEXTURE_2D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);
    Gl.texImage2D(Gl.TEXTURE_2D, 0, InternalFormat, W, H, 0, Format, Type, Pixels);
    return T;
  };
  const Volume = (W, D) => {
    const T = Gl.createTexture();
    Gl.bindTexture(Gl.TEXTURE_3D, T);
    Gl.texParameteri(Gl.TEXTURE_3D, Gl.TEXTURE_MIN_FILTER, Gl.LINEAR);
    Gl.texParameteri(Gl.TEXTURE_3D, Gl.TEXTURE_MAG_FILTER, Gl.LINEAR);
    Gl.texParameteri(Gl.TEXTURE_3D, Gl.TEXTURE_WRAP_S, Gl.CLAMP_TO_EDGE);
    Gl.texParameteri(Gl.TEXTURE_3D, Gl.TEXTURE_WRAP_T, Gl.CLAMP_TO_EDGE);
    Gl.texParameteri(Gl.TEXTURE_3D, Gl.TEXTURE_WRAP_R, Gl.CLAMP_TO_EDGE);
    Gl.texStorage3D(Gl.TEXTURE_3D, 1, Gl.RGBA16F, W, W, D);
    return T;
  };
  const DynInstTex = Tex2D(Gl.RGBA32F, Gl.RGBA, Gl.FLOAT, 8, GDF_MAX_DYNAMIC_INSTANCES);
  const DynScratch = new Float32Array(GDF_MAX_DYNAMIC_INSTANCES * 32);
  const EmptyVolume = Volume(1, 1);
  const EmptyField = Tex2D(Gl.RGBA32F, Gl.RGBA, Gl.FLOAT, GDF_FIELD_TEXTURE_WIDTH, 1, new Float32Array(GDF_FIELD_TEXTURE_WIDTH * 4));
  const HeaderScratch = new Float32Array(GDF_FIELD_HEADER_VEC4 * 4);

  const St = {
    Layout: null, Tex: null, RadFlip: 0, FieldTex: [null, null], FieldFlip: 0, RaysTex: null, ProbeKey: "", ProbeRays: 0,
    Mesh: null, LocalSdfTex: null, MeshGridTex: null, MeshBaked: false, MeshAssets: null,
    PrimSnap: {}, DynBounds: [], DynCount: 0, LightSig: -1, LightFrames: 0, Frame: 0, Engine: 0,
    FieldReady: false, RadReady: false, ProbeReady: false, HeaderKey: "",
    Stats: { StaticVoxels: 0, ComposeVoxels: 0, LightPasses: 0, ProbePasses: 0, MeshBakes: 0 },
  };

  const DeleteVolumes = () => {
    if (St.Tex) for (const T of Object.values(St.Tex)) Gl.deleteTexture(T);
    St.Tex = null;
  };
  const AllocateVolumes = (L) => {
    DeleteVolumes();
    St.Tex = {};
    for (const K of ["StaticDist", "StaticAttr", "Field", "Attr", "RadA", "RadB", "IndA", "IndB"]) St.Tex[K] = Volume(L.StackW, L.StackD);
    St.RadFlip = 0;
    St.FieldReady = false;
    St.RadReady = false;
    St.LightFrames = 0;
  };
  const AllocateProbes = (L) => {
    for (const T of St.FieldTex) if (T) Gl.deleteTexture(T);
    if (St.RaysTex) Gl.deleteTexture(St.RaysTex);
    const Zero = new Float32Array(GDF_FIELD_TEXTURE_WIDTH * L.FieldRows * 4);
    St.FieldTex = [0, 1].map(() => Tex2D(Gl.RGBA32F, Gl.RGBA, Gl.FLOAT, GDF_FIELD_TEXTURE_WIDTH, L.FieldRows, Zero));
    St.RaysTex = Tex2D(Gl.RGBA32F, Gl.RGBA, Gl.FLOAT, 256, Math.max(1, L.Probe.Cells));
    St.FieldFlip = 0;
    St.ProbeKey = L.ProbeKey;
    St.ProbeRays = L.Probe.Rays;
    St.ProbeReady = false;
    St.HeaderKey = "";
  };
  const BakePlanFor = (Assets) => {
    const Plan = PlanLocalMeshGrids(Assets);
    if (St.LocalSdfTex) Gl.deleteTexture(St.LocalSdfTex);
    if (St.MeshGridTex) Gl.deleteTexture(St.MeshGridTex);
    St.LocalSdfTex = Tex2D(Gl.RG32F, Gl.RG, Gl.FLOAT, LOCAL_SDF_WIDTH, Math.max(1, Math.ceil(Plan.TotalVoxels / LOCAL_SDF_WIDTH)));
    St.MeshGridTex = Tex2D(Gl.RGBA32F, Gl.RGBA, Gl.FLOAT, 3, Math.max(1, Plan.Grids.length), Plan.Meta);
    St.Mesh = Plan;
    St.MeshAssets = Assets;
    St.MeshBaked = false;
  };

  const Bind = (Unit, Target, Tex) => {
    Gl.activeTexture(Gl.TEXTURE0 + Unit);
    Gl.bindTexture(Target, Tex);
  };
  const UseKernel = (Name, Textures) => {
    const K = Programs[Name];
    Gl.useProgram(K.Prog);
    Gl.uniform4fv(K.Loc.F, Block.F);
    Gl.uniform4iv(K.Loc.I, Block.I);
    for (const [S, Tex] of Object.entries(Textures)) {
      const Unit = SAMPLER_UNITS[S];
      Bind(Unit, SAMPLER_2D.has(S) ? Gl.TEXTURE_2D : Gl.TEXTURE_3D, Tex);
    }
    return K;
  };
  // Draws one fragment pass per voxel layer of `Box` into `Outputs` (3D textures, MRT).
  const VoxelPass = (Name, Clip, Box, Outputs, Textures) => {
    const K = UseKernel(Name, Textures);
    const Zo = Clip === 0 ? 0 : St.Layout.ZOffset1;
    Gl.viewport(Box.Min[0], Box.Min[1], Box.Max[0] - Box.Min[0], Box.Max[1] - Box.Min[1]);
    Gl.drawBuffers(Outputs.map((_, I) => Gl.COLOR_ATTACHMENT0 + I));
    for (let Z = Box.Min[2]; Z < Box.Max[2]; ++Z) {
      Outputs.forEach((Tex, I) => Gl.framebufferTextureLayer(Gl.FRAMEBUFFER, Gl.COLOR_ATTACHMENT0 + I, Tex, 0, Zo + Z));
      Gl.uniform1i(K.Loc.Slice, Z);
      Gl.drawArrays(Gl.TRIANGLES, 0, 3);
    }
    Outputs.forEach((_, I) => Gl.framebufferTextureLayer(Gl.FRAMEBUFFER, Gl.COLOR_ATTACHMENT0 + I, null, 0, 0));
  };
  const Pass2D = (Name, Target, X, Y, W, H, Textures) => {
    UseKernel(Name, Textures);
    Gl.framebufferTexture2D(Gl.FRAMEBUFFER, Gl.COLOR_ATTACHMENT0, Gl.TEXTURE_2D, Target, 0);
    Gl.drawBuffers([Gl.COLOR_ATTACHMENT0]);
    Gl.viewport(X, Y, W, H);
    Gl.drawArrays(Gl.TRIANGLES, 0, 3);
    Gl.framebufferTexture2D(Gl.FRAMEBUFFER, Gl.COLOR_ATTACHMENT0, Gl.TEXTURE_2D, null, 0);
  };

  return {
    Ok: true,
    get FieldTexture() { return St.FieldTex[St.FieldFlip] || EmptyField; },
    get FieldVolume() { return St.Tex?.Field || EmptyVolume; },
    get RadianceVolume() { return St.Tex ? (St.RadFlip ? St.Tex.RadB : St.Tex.RadA) : EmptyVolume; },
    get Stats() { return St.Stats; },
    get Layout() { return St.Layout; },
    Textures() { return { ...St.Tex, FieldTex: St.FieldTex, LocalSdf: St.LocalSdfTex, Rays: St.RaysTex }; },

    // Same contract as the WebGPU module. Leaves framebuffer null, VAO null and texture units 0..14 rebound.
    Advance({ Scene, Rs, SceneCpu, SceneTex, PCount, LCount, Assets, BvhNodeTex, BvhTriTex, SkyTex, Engine }) {
      const L = ResolveGdfLayout(Rs);
      let FullStatic = false;
      if (!St.Layout || St.Layout.Key !== L.Key) {
        AllocateVolumes(L);
        FullStatic = true;
        St.PrimSnap = {};
        St.DynBounds = [];
        St.DynCount = 0;
      }
      if (!St.FieldTex[0] || St.ProbeKey !== L.ProbeKey || St.ProbeRays !== L.Probe.Rays || St.Layout?.FieldRows !== L.FieldRows) {
        AllocateProbes(L);
      }
      St.Layout = L;

      const Diff = DiffPrimitiveRows(St.PrimSnap, SceneCpu, PCount);
      const StaticBoxes = [null, null];
      if (FullStatic || Diff === "all") {
        StaticBoxes[0] = FullVoxelBox(L, 0);
        StaticBoxes[1] = FullVoxelBox(L, 1);
      } else {
        for (const Bx of Diff) for (let C = 0; C < 2; ++C) StaticBoxes[C] = UnionVoxelBox(StaticBoxes[C], ComputeDirtyVoxelBox(L, C, Bx.Min, Bx.Max));
      }

      const DynBoxes = [null, null];
      let BakeMeshes = false;
      let DynCount = 0;
      if (Assets && BvhNodeTex && BvhTriTex) {
        if (St.MeshAssets !== Assets) BakePlanFor(Assets);
        BakeMeshes = !St.MeshBaked;
        const Packed = PackDynamicInstances(ExpandVehicleInstances(Scene.Vehicles || [], Assets), Assets, DynScratch);
        DynCount = Packed.Count;
        const Moved = [];
        const N = Math.max(Packed.Count, St.DynBounds.length);
        for (let I = 0; I < N; ++I) {
          const A = St.DynBounds[I], B = Packed.Bounds[I];
          if (BakeMeshes || !A || !B || A.Key !== B.Key) {
            if (A) Moved.push(A);
            if (B) Moved.push(B);
          }
        }
        if (Moved.length || Packed.Count !== St.DynCount) {
          Gl.bindTexture(Gl.TEXTURE_2D, DynInstTex);
          Gl.texSubImage2D(Gl.TEXTURE_2D, 0, 0, 0, 8, GDF_MAX_DYNAMIC_INSTANCES, Gl.RGBA, Gl.FLOAT, DynScratch);
          for (const Bx of Moved) for (let C = 0; C < 2; ++C) DynBoxes[C] = UnionVoxelBox(DynBoxes[C], ComputeDirtyVoxelBox(L, C, Bx.Min, Bx.Max));
        }
        St.DynBounds = Packed.Bounds;
        St.DynCount = Packed.Count;
      }

      const Sig = LightingSignature(Scene, SceneCpu, LCount, Rs);
      const GeometryChanged = !!(StaticBoxes[0] || StaticBoxes[1] || DynBoxes[0] || DynBoxes[1]);
      if (FullStatic) St.LightFrames = 0;
      else if (Sig !== St.LightSig) St.LightFrames = Math.min(St.LightFrames, 1);
      else if (GeometryChanged) St.LightFrames = Math.min(St.LightFrames, 3);
      St.LightSig = Sig;
      if (Engine !== St.Engine) {
        St.Engine = Engine;
        St.LightFrames = Math.min(St.LightFrames, 1);
      }
      const Lighting = St.LightFrames < GDF_CONVERGE_FRAMES;
      const ProbeHyst = Math.max(0, Math.min(0.95, Number(Rs.ProbeTemporalBlend) || 0));
      const Alpha = Math.max(1 / (St.LightFrames + 1), 1 - SURFACE_CACHE_HYSTERESIS);
      const ProbeAlpha = St.ProbeReady ? Math.max(1 / (St.LightFrames + 1), 1 - ProbeHyst) : 1;
      PackGiParams(Block, L, Scene, Rs, St.Frame, Alpha, ProbeAlpha, { Prims: PCount, Lights: LCount, Instances: DynCount }, Engine);

      const T = St.Tex;
      const Common = { uScenePack: SceneTex, uBvhNodesT: BvhNodeTex, uBvhTrisT: BvhTriTex, uDynInstT: DynInstTex, uMeshGridT: St.MeshGridTex, tSky: SkyTex };
      Gl.disable(Gl.DEPTH_TEST);
      Gl.disable(Gl.BLEND);
      Gl.disable(Gl.CULL_FACE);
      Gl.disable(Gl.SCISSOR_TEST);
      Gl.colorMask(true, true, true, true);
      Gl.bindVertexArray(EmptyVao);
      Gl.bindFramebuffer(Gl.FRAMEBUFFER, Fbo);

      if (BakeMeshes && St.Mesh) {
        St.Mesh.Grids.forEach((G, M) => {
          StampGiDispatch(Block, [0, 0, 0], [G.Count, 0, 0], M, 0);
          const Row0 = Math.floor(G.Offset / LOCAL_SDF_WIDTH), Row1 = Math.floor((G.Offset + G.Count - 1) / LOCAL_SDF_WIDTH);
          Pass2D("LocalBake", St.LocalSdfTex, 0, Row0, LOCAL_SDF_WIDTH, Row1 - Row0 + 1, Common);
        });
        St.MeshBaked = true;
        St.Stats.MeshBakes += 1;
      }
      const Vox = (Box) => (Box.Max[0] - Box.Min[0]) * (Box.Max[1] - Box.Min[1]) * (Box.Max[2] - Box.Min[2]);
      for (let C = 0; C < 2; ++C) {
        const Sb = StaticBoxes[C];
        if (Sb) {
          StampGiDispatch(Block, Sb.Min, Sb.Max, C, 0);
          VoxelPass("StaticBuild", C, Sb, [T.StaticDist, T.StaticAttr], Common);
          St.Stats.StaticVoxels += Vox(Sb);
        }
        const Cb = UnionVoxelBox(Sb, DynBoxes[C]);
        if (Cb) {
          StampGiDispatch(Block, Cb.Min, Cb.Max, C, DynCount);
          VoxelPass("Compose", C, Cb, [T.Field, T.Attr], { ...Common, uLocalSdfT: St.LocalSdfTex || EmptyField, tStaticDist: T.StaticDist, tStaticAttr: T.StaticAttr });
          St.Stats.ComposeVoxels += Vox(Cb);
        }
      }
      const ReadRad = St.RadFlip ? T.RadB : T.RadA, WriteRad = St.RadFlip ? T.RadA : T.RadB;
      const ReadInd = St.RadFlip ? T.IndB : T.IndA, WriteInd = St.RadFlip ? T.IndA : T.IndB;
      if (Lighting) {
        for (let C = 0; C < 2; ++C) {
          const R = C === 0 ? L.Res0 : L.Res1;
          StampGiDispatch(Block, [0, 0, 0], [R, R, R], C, 0);
          VoxelPass("SurfaceLight", C, { Min: [0, 0, 0], Max: [R, R, R] }, [WriteRad, WriteInd],
            { ...Common, tField: T.Field, tAttr: T.Attr, tRadPrev: ReadRad, tIndPrev: ReadInd });
        }
        if (Engine === 4) {
          StampGiDispatch(Block, [0, 0, 0], [0, 0, 0], 0, 0);
          Pass2D("ProbeTrace", St.RaysTex, 0, 0, 256, L.Probe.Cells, { ...Common, tField: T.Field, tRadPrev: WriteRad });
          const Prev = St.FieldTex[St.FieldFlip], Next = St.FieldTex[St.FieldFlip ^ 1];
          Pass2D("ProbeBlend", Next, 0, 0, GDF_FIELD_TEXTURE_WIDTH, L.FieldRows, { ...Common, tField: T.Field, uRaysT: St.RaysTex, uFieldPrev: Prev });
          St.FieldFlip ^= 1;
          St.ProbeReady = true;
          St.Stats.ProbePasses += 1;
        }
        St.RadFlip ^= 1;
        St.RadReady = true;
        St.LightFrames += 1;
        St.Stats.LightPasses += 1;
      }
      if (GeometryChanged) St.FieldReady = true;
      St.Frame += 1;
      Gl.bindFramebuffer(Gl.FRAMEBUFFER, null);
      Gl.bindVertexArray(null);

      const HeaderKey = `${L.Key}|${L.ProbeKey}|${L.Probe.Rays}|${St.ProbeReady}|${St.FieldReady}`;
      if (HeaderKey !== St.HeaderKey) {
        St.HeaderKey = HeaderKey;
        WriteGdfFieldHeader(L, HeaderScratch, { ProbeOn: St.ProbeReady, FieldOn: St.FieldReady });
        for (const Ft of St.FieldTex) {
          Gl.bindTexture(Gl.TEXTURE_2D, Ft);
          Gl.texSubImage2D(Gl.TEXTURE_2D, 0, 0, 0, GDF_FIELD_HEADER_VEC4, 1, Gl.RGBA, Gl.FLOAT, HeaderScratch);
        }
      }
      return {
        FieldReady: St.FieldReady && St.RadReady,
        ProbeReady: St.ProbeReady,
        Converging: St.LightFrames < GDF_CONVERGE_FRAMES,
        LightFrames: St.LightFrames,
      };
    },

    Invalidate() { St.LightFrames = 0; },

    Destroy() {
      DeleteVolumes();
      for (const T of [...St.FieldTex, St.RaysTex, St.LocalSdfTex, St.MeshGridTex, DynInstTex, EmptyVolume, EmptyField]) if (T) Gl.deleteTexture(T);
      for (const K of Object.values(Programs)) Gl.deleteProgram(K.Prog);
      Gl.deleteFramebuffer(Fbo);
      Gl.deleteVertexArray(EmptyVao);
    },
  };
}
