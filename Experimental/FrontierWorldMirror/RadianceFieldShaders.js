//==========================================================================================================================================
// FILE: RadianceFieldShaders.js
// PURPOSE: WGSL + GLSL ports of RadianceFieldLayout.CreateRadianceFieldSampler (the CPU reference), 1:1 with the C++:
//            * rfProbeIrradiance  = DynamicProbeCache::SampleIrradianceOverPi           (DdgiRaytracing engine)
//            * rfConeGi           = VoxelSdfClipmapVolume::EvaluateDeterministicConeGiOverPi (SdfGlobalIllumination engine)
//            * rfAmbientOcclusion = LinearCosineLightIntegration combined contact x chassis AO (raw, unfiltered on GPU)
//          The packed field (see RadianceFieldLayout.js header) is a storage buffer array<vec4f> on WebGPU (binding 12) and an
//          RGBA32F texture of width RADIANCE_FIELD_TEXTURE_WIDTH on WebGL (uRadianceField). The clipmap distance tiers and the
//          radiance mips are ALSO uploaded as half-float 3D volumes (BuildRadianceVolumes) so each lookup in the cone march is one
//          hardware-trilinear fetch: WGSL uRfDistTex / uRfRadTex / uRfVolSampler (bindings 13-15), GLSL uRfDistTex / uRfRadTex.
//          The AO block calls a host-provided occlusion trace: WGSL `rfTraceDistance(o, d, maxD) -> f32` / GLSL `float rfTraceDistance(vec3,vec3,float)`
//          returning hit distance or -1.0 on miss.
//==========================================================================================================================================

import { RADIANCE_FIELD_TEXTURE_WIDTH } from "./RadianceFieldLayout.js";

//==========================================================================================================================================
// WGSL
//==========================================================================================================================================
export const RADIANCE_FIELD_WGSL = /* wgsl */ `
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

struct RfTierSample { d : f32, tier : i32, };

// Toroidal distance clipmap Sample(): one hardware-trilinear fetch from the r16f tier volume (tier t at z layer 48t).
fn rfTierDistance(P : vec3f) -> RfTierSample {
  let levels = i32(rfH(23));
  var spc = rfH(22);
  var r : RfTierSample;
  r.d = 1e5; r.tier = 3;
  let depth = f32(levels * 48);
  for (var ti : i32 = 0; ti < 3; ti = ti + 1) {
    if (ti >= levels) { break; }
    let q = P / spc;
    let f0 = floor(q);
    let x = f0.x - rfH(24 + ti * 4); let y = f0.y - rfH(25 + ti * 4); let z = f0.z - rfH(26 + ti * 4);
    if (x >= 0.0 && y >= 0.0 && z >= 0.0 && x + 1.0 < 48.0 && y + 1.0 < 48.0 && z + 1.0 < 48.0) {
      let fr = q - f0;
      let uvw = vec3f((x + fr.x + 0.5) / 48.0, (y + fr.y + 0.5) / 48.0, (f32(ti) * 48.0 + z + fr.z + 0.5) / depth);
      r.d = textureSampleLevel(uRfDistTex, uRfVolSampler, uvw, 0.0).r;
      r.tier = ti;
      return r;
    }
    spc = spc * 2.0;
  }
  return r;
}

// One radiance grid (cascade c, mip m) from the stacked rgba16f volume; x/y padding is edge-replicated.
fn rfGridRgb(c : i32, m : i32, P : vec3f) -> vec3f {
  let h = 36 + c * 24;
  let dims = vec3f(rfH(h + 8 + m * 4), rfH(h + 9 + m * 4), rfH(h + 10 + m * 4));
  let lo = vec3f(rfH(h), rfH(h + 1), rfH(h + 2));
  let inv = vec3f(rfH(h + 4), rfH(h + 5), rfH(h + 6));
  let dm1 = max(dims - vec3f(1.0), vec3f(0.0));
  let f = clamp((P - lo) * inv * dm1, vec3f(0.0), dm1);
  let vol = vec3f(rfH(90), rfH(91), rfH(92));
  let uvw = vec3f((f.x + 0.5) / vol.x, (f.y + 0.5) / vol.y, (rfH(84 + c * 3 + m) + f.z + 0.5) / vol.z);
  return textureSampleLevel(uRfRadTex, uRfVolSampler, uvw, 0.0).rgb;
}

fn rfCascadeRadiance(casc : i32, P : vec3f, coneR : f32) -> vec3f {
  if (casc > 1) { return vec3f(0.0); }
  let h = 36 + casc * 24;
  let vs = rfH(h + 3);
  if (coneR <= vs * 1.1 || rfH(h + 12) < 2.0) {
    return rfGridRgb(casc, 0, P);
  }
  let t1 = vs * 2.2;
  if (coneR <= t1 || rfH(h + 16) < 2.0) {
    let t = clamp((coneR - vs * 1.1) / max(0.03, vs * 1.1), 0.0, 1.0);
    return mix(rfGridRgb(casc, 0, P), rfGridRgb(casc, 1, P), t);
  }
  let t = clamp((coneR - t1) / max(0.05, vs * 2.6), 0.0, 1.0);
  return mix(rfGridRgb(casc, 1, P), rfGridRgb(casc, 2, P), t);
}

fn rfConeGi(P : vec3f, Nin : vec3f, sky : vec3f, coneCount : i32) -> vec3f {
  if (rfH(2) < 0.5) { return vec3f(0.0); }
  let count = clamp(coneCount, 12, 24);
  let invC = 1.0 / f32(count);
  var N = Nin;
  if (length(N) < 1e-6) { N = vec3f(0.0, 0.0, 1.0); }
  N = normalize(N);
  let s = select(-1.0, 1.0, N.z >= 0.0);
  let a = -1.0 / (s + N.z);
  let bb = N.x * N.y * a;
  let T = vec3f(1.0 + s * N.x * N.x * a, s * bb, -s * N.x);
  let Bv = vec3f(bb, s + N.y * N.y * a, -N.y);
  let vs0 = rfH(36 + 3);
  let vs1 = rfH(60 + 3);
  let O = P + N * max(0.032, vs0 * 0.75);
  var gi = vec3f(0.0);
  for (var k : i32 = 0; k < 24; k = k + 1) {
    if (k >= count) { break; }
    let r = sqrt(clamp((f32(k) + 0.5) * invC, 0.015, 0.96));
    let ang = f32(k) * 2.39996323 + 0.31;
    let cd = normalize(T * (cos(ang) * r) + Bv * (sin(ang) * r) + N * sqrt(max(0.0, 1.0 - r * r)));
    var ct = max(0.14, vs0 * 1.15);
    var ca : f32 = 0.0;
    var col = vec3f(0.0);
    for (var st : i32 = 0; st < 24; st = st + 1) {
      if (ca >= 0.97 || ct >= 14.0) { break; }
      let sp = O + cd * ct;
      let ts = rfTierDistance(sp);
      let casc = ts.tier;
      let dd = ts.d;
      if (casc >= 3 || dd > 4e3) { break; }
      let vox = select(select(0.5, 0.25, casc == 1), 0.125, casc == 0);
      let coneR = max(vox * 1.15, ct * 0.42);
      if (dd < coneR) {
        var occ = (1.0 - smoothstep(0.0, coneR, dd)) * 0.78;
        let srad = rfCascadeRadiance(casc, sp, coneR * 1.45);
        let hh = select(max(0.05, vs1 * 0.9), max(0.02, vs0 * 0.9), casc == 0);
        let d0 = rfTierDistance(sp + vec3f(hh, -hh, -hh)).d;
        let d1 = rfTierDistance(sp + vec3f(-hh, -hh, hh)).d;
        let d2 = rfTierDistance(sp + vec3f(-hh, hh, -hh)).d;
        let d3 = rfTierDistance(sp + vec3f(hh, hh, hh)).d;
        var g = vec3f(d0 - d1 - d2 + d3, -d0 - d1 + d2 + d3, -d0 + d1 - d2 + d3);
        let gl = length(g);
        g = select(vec3f(0.0, 0.0, 1.0), g / gl, gl > 1e-6);
        let front = 0.45 + 0.7 * smoothstep(-0.15, 0.55, -dot(g, cd));
        if (ct < 0.85 && max(srad.x, max(srad.y, srad.z)) < 0.25) { occ = min(1.0, occ * 1.25); }
        let w = (1.0 - ca) * occ;
        col = col + min(srad, vec3f(2.5)) * front * w;
        ca = ca + w;
      }
      ct = ct + max(dd * 0.75, vox * 0.75);
    }
    let hem = 0.45 + 0.85 * (0.5 + 0.5 * cd.z);
    gi = gi + (col + sky * hem * (1.0 - ca)) * invC;
  }
  return min(gi, vec3f(18.0));
}

// LinearCosineLightIntegration diffuse AO (contact x chassis), interleaved-gradient-noise rotation per pixel.
fn rfAmbientOcclusion(P : vec3f, N : vec3f, pix : vec2f, rays : i32, contactR : f32, chassisR : f32) -> f32 {
  let cnt = clamp(max(12, rays), 12, 32);
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
const W = RADIANCE_FIELD_TEXTURE_WIDTH;
export const RADIANCE_FIELD_GLSL = /* glsl */ `
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
float rfTierDistance(vec3 P, out int tier) {
  int levels = int(rfH(23));
  float spc = rfH(22);
  float depth = float(levels * 48);
  tier = 3;
  for (int ti = 0; ti < 3; ++ti) {
    if (ti >= levels) break;
    vec3 q = P / spc;
    vec3 f0 = floor(q);
    float x = f0.x - rfH(24 + ti * 4), y = f0.y - rfH(25 + ti * 4), z = f0.z - rfH(26 + ti * 4);
    if (x >= 0.0 && y >= 0.0 && z >= 0.0 && x + 1.0 < 48.0 && y + 1.0 < 48.0 && z + 1.0 < 48.0) {
      vec3 fr = q - f0;
      tier = ti;
      return textureLod(uRfDistTex, vec3((x + fr.x + 0.5) / 48.0, (y + fr.y + 0.5) / 48.0, (float(ti) * 48.0 + z + fr.z + 0.5) / depth), 0.0).r;
    }
    spc *= 2.0;
  }
  return 1e5;
}

vec3 rfGridRgb(int c, int m, vec3 P) {
  int h = 36 + c * 24;
  vec3 dims = vec3(rfH(h + 8 + m * 4), rfH(h + 9 + m * 4), rfH(h + 10 + m * 4));
  vec3 lo = vec3(rfH(h), rfH(h + 1), rfH(h + 2));
  vec3 inv = vec3(rfH(h + 4), rfH(h + 5), rfH(h + 6));
  vec3 dm1 = max(dims - 1.0, vec3(0.0));
  vec3 f = clamp((P - lo) * inv * dm1, vec3(0.0), dm1);
  vec3 vol = vec3(rfH(90), rfH(91), rfH(92));
  return textureLod(uRfRadTex, vec3((f.x + 0.5) / vol.x, (f.y + 0.5) / vol.y, (rfH(84 + c * 3 + m) + f.z + 0.5) / vol.z), 0.0).rgb;
}

vec3 rfCascadeRadiance(int casc, vec3 P, float coneR) {
  if (casc > 1) return vec3(0.0);
  int h = 36 + casc * 24;
  float vs = rfH(h + 3);
  if (coneR <= vs * 1.1 || rfH(h + 12) < 2.0) return rfGridRgb(casc, 0, P);
  float t1 = vs * 2.2;
  if (coneR <= t1 || rfH(h + 16) < 2.0) {
    float t = clamp((coneR - vs * 1.1) / max(0.03, vs * 1.1), 0.0, 1.0);
    return mix(rfGridRgb(casc, 0, P), rfGridRgb(casc, 1, P), t);
  }
  float t = clamp((coneR - t1) / max(0.05, vs * 2.6), 0.0, 1.0);
  return mix(rfGridRgb(casc, 1, P), rfGridRgb(casc, 2, P), t);
}

vec3 rfConeGi(vec3 P, vec3 Nin, vec3 sky, int coneCount) {
  if (rfH(2) < 0.5) return vec3(0.0);
  int count = clamp(coneCount, 12, 24);
  float invC = 1.0 / float(count);
  vec3 N = length(Nin) < 1e-6 ? vec3(0.0, 0.0, 1.0) : normalize(Nin);
  float s = N.z >= 0.0 ? 1.0 : -1.0;
  float a = -1.0 / (s + N.z);
  float bb = N.x * N.y * a;
  vec3 T = vec3(1.0 + s * N.x * N.x * a, s * bb, -s * N.x);
  vec3 Bv = vec3(bb, s + N.y * N.y * a, -N.y);
  float vs0 = rfH(39);
  float vs1 = rfH(63);
  vec3 O = P + N * max(0.032, vs0 * 0.75);
  vec3 gi = vec3(0.0);
  for (int k = 0; k < 24; ++k) {
    if (k >= count) break;
    float r = sqrt(clamp((float(k) + 0.5) * invC, 0.015, 0.96));
    float ang = float(k) * 2.39996323 + 0.31;
    vec3 cd = normalize(T * (cos(ang) * r) + Bv * (sin(ang) * r) + N * sqrt(max(0.0, 1.0 - r * r)));
    float ct = max(0.14, vs0 * 1.15);
    float ca = 0.0;
    vec3 col = vec3(0.0);
    for (int st = 0; st < 24; ++st) {
      if (ca >= 0.97 || ct >= 14.0) break;
      vec3 sp = O + cd * ct;
      int casc;
      float dd = rfTierDistance(sp, casc);
      if (casc >= 3 || dd > 4e3) break;
      float vox = casc == 0 ? 0.125 : casc == 1 ? 0.25 : 0.5;
      float coneR = max(vox * 1.15, ct * 0.42);
      if (dd < coneR) {
        float occ = (1.0 - smoothstep(0.0, coneR, dd)) * 0.78;
        vec3 srad = rfCascadeRadiance(casc, sp, coneR * 1.45);
        float hh = casc == 0 ? max(0.02, vs0 * 0.9) : max(0.05, vs1 * 0.9);
        int dummy;
        float d0 = rfTierDistance(sp + vec3(hh, -hh, -hh), dummy);
        float d1 = rfTierDistance(sp + vec3(-hh, -hh, hh), dummy);
        float d2 = rfTierDistance(sp + vec3(-hh, hh, -hh), dummy);
        float d3 = rfTierDistance(sp + vec3(hh, hh, hh), dummy);
        vec3 g = vec3(d0 - d1 - d2 + d3, -d0 - d1 + d2 + d3, -d0 + d1 - d2 + d3);
        float gl = length(g);
        g = gl > 1e-6 ? g / gl : vec3(0.0, 0.0, 1.0);
        float front = 0.45 + 0.7 * smoothstep(-0.15, 0.55, -dot(g, cd));
        if (ct < 0.85 && max(srad.x, max(srad.y, srad.z)) < 0.25) occ = min(1.0, occ * 1.25);
        float w = (1.0 - ca) * occ;
        col += min(srad, vec3(2.5)) * front * w;
        ca += w;
      }
      ct += max(dd * 0.75, vox * 0.75);
    }
    float hem = 0.45 + 0.85 * (0.5 + 0.5 * cd.z);
    gi += (col + sky * hem * (1.0 - ca)) * invC;
  }
  return min(gi, vec3(18.0));
}

float rfAmbientOcclusion(vec3 P, vec3 N, vec2 pix, int rays, float contactR, float chassisR) {
  int cnt = clamp(max(12, rays), 12, 32);
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
