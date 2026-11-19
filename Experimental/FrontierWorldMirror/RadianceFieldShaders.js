//==========================================================================================================================================
// FILE: RadianceFieldShaders.js
// PURPOSE: Scene-shader side (WGSL + GLSL) of the GPU global distance field GI (GlobalDistanceFieldGi.js / GlobalDistanceFieldGiGl.js):
//            * rfFieldGather      = Lumen-style per-pixel final gather through the persistent global distance field into the
//                                   surface cache radiance (SdfGlobalIllumination / voxel_sdf engine)
//            * rfProbeIrradiance  = world radiance cache probes (DdgiRaytracing engine): octahedral irradiance + Chebyshev moments
//            * rfAmbientOcclusion = LinearCosineLightIntegration combined contact x chassis AO (exact scene trace)
//          The field buffer (header + probe block, GlobalDistanceFieldLayout.js) is a storage buffer array<vec4f> on WebGPU
//          (binding 12) and an RGBA32F texture of width GDF_FIELD_TEXTURE_WIDTH on WebGL (uRadianceField). The distance field
//          (x channel) and the surface cache radiance (premultiplied rgb, coverage a) are stacked 3D volumes: WGSL uRfDistTex /
//          uRfRadTex / uRfVolSampler (bindings 13-15), GLSL uRfDistTex / uRfRadTex.
//          Host-provided hooks: `rfTraceDistance(o, d, maxD)` (hit distance or -1 on miss) and `rfSkyRadiance(d)` (sky radiance
//          seen by gather misses).
//==========================================================================================================================================

import { GDF_FIELD_TEXTURE_WIDTH } from "./GlobalDistanceFieldLayout.js";
import { GdfTracingGlsl, GdfTracingWgsl, GDF_EMITTER_GLSL, GDF_EMITTER_WGSL } from "./GlobalDistanceFieldShaders.js";

//==========================================================================================================================================
// WGSL
//==========================================================================================================================================
export const RADIANCE_FIELD_WGSL = /* wgsl */ `
${GdfTracingWgsl("uRfDistTex", "uRfRadTex", "uRfVolSampler")}
${GDF_EMITTER_WGSL}
fn rfV(i : i32) -> vec4f { return uRadianceField[i]; }
fn rfF(i : i32) -> f32 { let v = uRadianceField[i >> 2u]; let k = i & 3; return select(select(select(v.x, v.y, k == 1), v.z, k == 2), v.w, k == 3); }
fn rfH(i : i32) -> f32 { return rfF(i); }

fn rfOctUv(d : vec3f) -> vec2f {
  let inv = 1.0 / max(1e-6, abs(d.x) + abs(d.y) + abs(d.z));
  var o = d.xy * inv;
  if (d.z < 0.0) {
    o = vec2f((1.0 - abs(o.y)) * select(-1.0, 1.0, o.x >= 0.0), (1.0 - abs(o.x)) * select(-1.0, 1.0, o.y >= 0.0));
  }
  return o * 0.5 + 0.5;
}

fn rfMomAt(momOff : i32, ci : i32, x : i32, y : i32) -> vec2f {
  let t = y * 16 + x;
  let v = rfV(momOff + ci * 128 + (t >> 1u));
  return select(v.xy, v.zw, (t & 1) == 1);
}

fn rfProbeIrradiance(P : vec3f, N : vec3f, V : vec3f) -> vec3f {
  if (rfH(1) < 0.5) { return vec3f(0.0); }
  let cnt = vec3i(i32(rfH(12)), i32(rfH(13)), i32(rfH(14)));
  let sp = vec3f(rfH(8), rfH(9), rfH(10));
  let cellOff = i32(rfH(15));
  let irrOff = i32(rfH(16));
  let momOff = i32(rfH(17));
  let bias = min(0.09, 0.14 * rfH(7));
  let B = P + (N * 0.72 + V * 0.28) * bias;
  let f = clamp((B - vec3f(rfH(4), rfH(5), rfH(6))) / sp, vec3f(0.0), vec3f(cnt - vec3i(1)));
  let c0 = vec3i(floor(f));
  let c1 = min(cnt - vec3i(1), c0 + vec3i(1));
  let t = f - vec3f(c0);
  let nuv = rfOctUv(N);
  let ixy = clamp(nuv * 8.0 - 0.5, vec2f(0.0), vec2f(7.0));
  let i0 = vec2i(floor(ixy));
  let i1 = min(vec2i(7), i0 + vec2i(1));
  let it = ixy - vec2f(i0);
  var acc = vec3f(0.0);
  var wt : f32 = 0.0;
  for (var k : i32 = 0; k < 8; k = k + 1) {
    let dx = k & 1; let dy = (k >> 1u) & 1; let dz = (k >> 2u) & 1;
    let cx = select(c0.x, c1.x, dx == 1); let cy = select(c0.y, c1.y, dy == 1); let cz = select(c0.z, c1.z, dz == 1);
    let w3 = select(1.0 - t.x, t.x, dx == 1) * select(1.0 - t.y, t.y, dy == 1) * select(1.0 - t.z, t.z, dz == 1);
    let ci = (cz * cnt.y + cy) * cnt.x + cx;
    let cell = rfV(cellOff + ci);
    let o = B - cell.xyz;
    let dist = length(o);
    let u = select(-N, o / dist, dist > 1e-5);
    let wrap = 0.5 * (-dot(u, N) + 1.0);
    let smoothBack = max(0.02, wrap * wrap);
    let gate = select(1.0, 0.02, cell.w > 0.25);
    let muv = rfOctUv(u);
    let mxy = clamp(muv * 16.0 - 0.5, vec2f(0.0), vec2f(15.0));
    let m0 = vec2i(floor(mxy));
    let m1 = min(vec2i(15), m0 + vec2i(1));
    let mt = mxy - vec2f(m0);
    let mom = mix(mix(rfMomAt(momOff, ci, m0.x, m0.y), rfMomAt(momOff, ci, m1.x, m0.y), mt.x),
                  mix(rfMomAt(momOff, ci, m0.x, m1.y), rfMomAt(momOff, ci, m1.x, m1.y), mt.x), mt.y);
    let vr = max(1e-4, abs(mom.y - mom.x * mom.x));
    var cheb : f32 = 1.0;
    if (dist > mom.x) {
      let ex = dist - mom.x;
      cheb = vr / (vr + ex * ex);
      cheb = cheb * cheb * cheb;
    }
    let w = w3 * smoothBack * gate * max(1e-4, cheb);
    let ib = irrOff + ci * 64;
    let irr = mix(mix(rfV(ib + i0.y * 8 + i0.x).xyz, rfV(ib + i0.y * 8 + i1.x).xyz, it.x),
                  mix(rfV(ib + i1.y * 8 + i0.x).xyz, rfV(ib + i1.y * 8 + i1.x).xyz, it.x), it.y);
    acc = acc + irr * w;
    wt = wt + w;
  }
  if (wt > 1e-6) { return acc / wt; }
  return vec3f(0.0);
}

// Global distance field layout from the field header (GlobalDistanceFieldLayout.WriteGdfFieldHeader, floats 20..34).
fn rfGdfLayout() -> GdfLayout {
  var L : GdfLayout;
  L.res0 = rfH(20); L.res1 = rfH(21); L.stackW = rfH(22); L.stackD = rfH(23);
  L.center = vec3f(rfH(24), rfH(25), rfH(26));
  L.half0 = rfH(27); L.half1 = rfH(28); L.voxel0 = rfH(29); L.voxel1 = rfH(30); L.zoff1 = rfH(31);
  L.band1 = rfH(33);
  return L;
}

// Lumen-style final gather: cosine-distributed rays traced through the persistent global distance field, each hit shaded from
// the surface cache radiance (direct + multi-bounce, emitters excluded -> no double counting with the analytic emitter pass),
// misses see the sky. Returns irradiance / PI. Per-pixel rotation decorrelates the stratified ray set.
fn rfFieldGather(P : vec3f, Nin : vec3f, pix : vec2f, rayCount : i32) -> vec3f {
  if (rfH(2) < 0.5) { return vec3f(0.0); }
  let L = rfGdfLayout();
  let N = normalize(select(vec3f(0.0, 0.0, 1.0), Nin, length(Nin) > 1e-6));
  let F = gdfFrame(N);
  let cnt = clamp(rayCount, 4, 32);
  let ign = fract(52.9829189 * fract(0.06711056 * pix.x + 0.00583715 * pix.y));
  let ign2 = fract(52.9829189 * fract(0.00583715 * pix.x + 0.06711056 * pix.y));
  let vx = select(L.voxel1, L.voxel0, gdfClipOf(L, P) == 0);
  let O = P + N * (vx * 1.6);
  let tMax = rfH(34);
  var acc = vec3f(0.0);
  for (var k : i32 = 0; k < 32; k = k + 1) {
    if (k >= cnt) { break; }
    let u1 = fract((f32(k) + ign) / f32(cnt));
    let phi = 6.28318531 * fract(f32(k) * 0.61803399 + ign2);
    let st = sqrt(u1);
    let d = F * vec3f(st * cos(phi), st * sin(phi), sqrt(max(0.0, 1.0 - u1)));
    let h = gdfTrace(L, O, d, tMax);
    if (h.hit) { acc = acc + gdfRadiance(L, h.p); } else { acc = acc + rfSkyRadiance(d); }
  }
  return min(acc / f32(cnt), vec3f(18.0));
}

// LinearCosineLightIntegration diffuse AO (contact x chassis), interleaved-gradient-noise rotation per pixel.
fn rfAmbientOcclusion(P : vec3f, N : vec3f, pix : vec2f, rays : i32, contactR : f32, chassisR : f32) -> f32 {
  let cnt = clamp(rays, 4, 32);
  let ign = fract(52.9829189 * fract(0.06711056 * pix.x + 0.00583715 * pix.y));
  let rot = ign * 6.28318531;
  let s = select(-1.0, 1.0, N.z >= 0.0);
  let a = -1.0 / (s + N.z);
  let bb = N.x * N.y * a;
  let T = vec3f(1.0 + s * N.x * N.x * a, s * bb, -s * N.x);
  let Bv = vec3f(bb, s + N.y * N.y * a, -N.y);
  let O = P + N * 2e-3;
  var contact : f32 = 0.0;
  var chassis : f32 = 0.0;
  for (var r : i32 = 0; r < 32; r = r + 1) {
    if (r >= cnt) { break; }
    let u1 = (f32(r) + 0.5) / f32(cnt);
    let phi = f32(r) * 2.39996323 + rot;
    let sinT = sqrt(u1);
    let d = T * (sinT * cos(phi)) + Bv * (sinT * sin(phi)) + N * sqrt(max(0.0, 1.0 - u1));
    let t = rfTraceDistance(O, d, chassisR);
    if (t < 0.0 || t <= 1.5e-3) {
      contact = contact + 1.0;
      chassis = chassis + 1.0;
    } else {
      if (t > contactR) { contact = contact + 1.0; }
      chassis = chassis + clamp(t / chassisR, 0.0, 1.0);
    }
  }
  let inv = 1.0 / f32(cnt);
  return clamp(contact * inv * (0.25 + 0.75 * chassis * inv), 0.0, 1.0);
}
`;

//==========================================================================================================================================
// GLSL (WebGL2) — the field is a RGBA32F texture, vec4 index i -> texel (i % W, i / W)
//==========================================================================================================================================
const W = GDF_FIELD_TEXTURE_WIDTH;
export const RADIANCE_FIELD_GLSL = /* glsl */ `
${GdfTracingGlsl("uRfDistTex", "uRfRadTex")}
${GDF_EMITTER_GLSL}
vec4 rfV(int i) { return texelFetch(uRadianceField, ivec2(i % ${W}, i / ${W}), 0); }
float rfF(int i) { vec4 v = rfV(i >> 2); int k = i & 3; return k == 0 ? v.x : k == 1 ? v.y : k == 2 ? v.z : v.w; }
float rfH(int i) { return rfF(i); }

vec2 rfOctUv(vec3 d) {
  float inv = 1.0 / max(1e-6, abs(d.x) + abs(d.y) + abs(d.z));
  vec2 o = d.xy * inv;
  if (d.z < 0.0) o = vec2((1.0 - abs(o.y)) * (o.x >= 0.0 ? 1.0 : -1.0), (1.0 - abs(o.x)) * (o.y >= 0.0 ? 1.0 : -1.0));
  return o * 0.5 + 0.5;
}

vec2 rfMomAt(int momOff, int ci, int x, int y) {
  int t = y * 16 + x;
  vec4 v = rfV(momOff + ci * 128 + (t >> 1));
  return (t & 1) == 1 ? v.zw : v.xy;
}

vec3 rfProbeIrradiance(vec3 P, vec3 N, vec3 V) {
  if (rfH(1) < 0.5) return vec3(0.0);
  ivec3 cnt = ivec3(int(rfH(12)), int(rfH(13)), int(rfH(14)));
  vec3 sp = vec3(rfH(8), rfH(9), rfH(10));
  int cellOff = int(rfH(15));
  int irrOff = int(rfH(16));
  int momOff = int(rfH(17));
  float bias = min(0.09, 0.14 * rfH(7));
  vec3 B = P + (N * 0.72 + V * 0.28) * bias;
  vec3 f = clamp((B - vec3(rfH(4), rfH(5), rfH(6))) / sp, vec3(0.0), vec3(cnt - 1));
  ivec3 c0 = ivec3(floor(f));
  ivec3 c1 = min(cnt - 1, c0 + 1);
  vec3 t = f - vec3(c0);
  vec2 ixy = clamp(rfOctUv(N) * 8.0 - 0.5, vec2(0.0), vec2(7.0));
  ivec2 i0 = ivec2(floor(ixy));
  ivec2 i1 = min(ivec2(7), i0 + 1);
  vec2 it = ixy - vec2(i0);
  vec3 acc = vec3(0.0);
  float wt = 0.0;
  for (int k = 0; k < 8; ++k) {
    int dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
    int cx = dx == 1 ? c1.x : c0.x, cy = dy == 1 ? c1.y : c0.y, cz = dz == 1 ? c1.z : c0.z;
    float w3 = (dx == 1 ? t.x : 1.0 - t.x) * (dy == 1 ? t.y : 1.0 - t.y) * (dz == 1 ? t.z : 1.0 - t.z);
    int ci = (cz * cnt.y + cy) * cnt.x + cx;
    vec4 cell = rfV(cellOff + ci);
    vec3 o = B - cell.xyz;
    float dist = length(o);
    vec3 u = dist > 1e-5 ? o / dist : -N;
    float wrap = 0.5 * (-dot(u, N) + 1.0);
    float smoothBack = max(0.02, wrap * wrap);
    float gate = cell.w > 0.25 ? 0.02 : 1.0;
    vec2 mxy = clamp(rfOctUv(u) * 16.0 - 0.5, vec2(0.0), vec2(15.0));
    ivec2 m0 = ivec2(floor(mxy));
    ivec2 m1 = min(ivec2(15), m0 + 1);
    vec2 mt = mxy - vec2(m0);
    vec2 mom = mix(mix(rfMomAt(momOff, ci, m0.x, m0.y), rfMomAt(momOff, ci, m1.x, m0.y), mt.x),
                   mix(rfMomAt(momOff, ci, m0.x, m1.y), rfMomAt(momOff, ci, m1.x, m1.y), mt.x), mt.y);
    float vr = max(1e-4, abs(mom.y - mom.x * mom.x));
    float cheb = 1.0;
    if (dist > mom.x) {
      float ex = dist - mom.x;
      cheb = vr / (vr + ex * ex);
      cheb = cheb * cheb * cheb;
    }
    float w = w3 * smoothBack * gate * max(1e-4, cheb);
    int ib = irrOff + ci * 64;
    vec3 irr = mix(mix(rfV(ib + i0.y * 8 + i0.x).xyz, rfV(ib + i0.y * 8 + i1.x).xyz, it.x),
                   mix(rfV(ib + i1.y * 8 + i0.x).xyz, rfV(ib + i1.y * 8 + i1.x).xyz, it.x), it.y);
    acc += irr * w;
    wt += w;
  }
  return wt > 1e-6 ? acc / wt : vec3(0.0);
}

// Toroidal distance clipmap Sample(): one hardware-trilinear fetch from the R16F tier volume (tier t at z layer 48t).
GdfLayout rfGdfLayout() {
  GdfLayout L;
  L.res0 = rfH(20); L.res1 = rfH(21); L.stackW = rfH(22); L.stackD = rfH(23);
  L.center = vec3(rfH(24), rfH(25), rfH(26));
  L.half0 = rfH(27); L.half1 = rfH(28); L.voxel0 = rfH(29); L.voxel1 = rfH(30); L.zoff1 = rfH(31);
  L.band1 = rfH(33);
  return L;
}

vec3 rfFieldGather(vec3 P, vec3 Nin, vec2 pix, int rayCount) {
  if (rfH(2) < 0.5) return vec3(0.0);
  GdfLayout L = rfGdfLayout();
  vec3 N = length(Nin) > 1e-6 ? normalize(Nin) : vec3(0.0, 0.0, 1.0);
  mat3 F = gdfFrame(N);
  int cnt = clamp(rayCount, 4, 32);
  float ign = fract(52.9829189 * fract(0.06711056 * pix.x + 0.00583715 * pix.y));
  float ign2 = fract(52.9829189 * fract(0.00583715 * pix.x + 0.06711056 * pix.y));
  float vx = gdfClipOf(L, P) == 0 ? L.voxel0 : L.voxel1;
  vec3 O = P + N * (vx * 1.6);
  float tMax = rfH(34);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 32; ++k) {
    if (k >= cnt) break;
    float u1 = fract((float(k) + ign) / float(cnt));
    float phi = 6.28318531 * fract(float(k) * 0.61803399 + ign2);
    float st = sqrt(u1);
    vec3 d = F * vec3(st * cos(phi), st * sin(phi), sqrt(max(0.0, 1.0 - u1)));
    float th; vec3 hp;
    if (gdfTrace(L, O, d, tMax, th, hp)) acc += gdfRadiance(L, hp); else acc += rfSkyRadiance(d);
  }
  return min(acc / float(cnt), vec3(18.0));
}

float rfAmbientOcclusion(vec3 P, vec3 N, vec2 pix, int rays, float contactR, float chassisR) {
  int cnt = clamp(rays, 4, 32);
  float rot = fract(52.9829189 * fract(0.06711056 * pix.x + 0.00583715 * pix.y)) * 6.28318531;
  float s = N.z >= 0.0 ? 1.0 : -1.0;
  float a = -1.0 / (s + N.z);
  float bb = N.x * N.y * a;
  vec3 T = vec3(1.0 + s * N.x * N.x * a, s * bb, -s * N.x);
  vec3 Bv = vec3(bb, s + N.y * N.y * a, -N.y);
  vec3 O = P + N * 2e-3;
  float contact = 0.0, chassis = 0.0;
  for (int r = 0; r < 32; ++r) {
    if (r >= cnt) break;
    float u1 = (float(r) + 0.5) / float(cnt);
    float phi = float(r) * 2.39996323 + rot;
    float sinT = sqrt(u1);
    vec3 d = T * (sinT * cos(phi)) + Bv * (sinT * sin(phi)) + N * sqrt(max(0.0, 1.0 - u1));
    float t = rfTraceDistance(O, d, chassisR);
    if (t < 0.0 || t <= 1.5e-3) { contact += 1.0; chassis += 1.0; }
    else {
      if (t > contactR) contact += 1.0;
      chassis += clamp(t / chassisR, 0.0, 1.0);
    }
  }
  float inv = 1.0 / float(cnt);
  return clamp(contact * inv * (0.25 + 0.75 * chassis * inv), 0.0, 1.0);
}
`;
