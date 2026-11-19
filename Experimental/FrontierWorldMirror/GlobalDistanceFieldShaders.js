//==========================================================================================================================================
// FILE: GlobalDistanceFieldShaders.js
// PURPOSE: WGSL source for the GPU-only, Lumen-style global illumination (GlobalDistanceFieldGi.js runs it):
//
//   1. GLOBAL DISTANCE FIELD  (persistent, built once, patched incrementally)
//        StaticBuildEntry   analytic primitive SDFs -> static clip voxels (only the dirty voxel box of changed primitives)
//        LocalBakeEntry     vehicle mesh SDF baked ONCE per mesh on the GPU (BVH closest-triangle query, port of Nearest())
//        ComposeEntry       active field = min(static, moving mesh SDFs) inside the dirty box only (old ∪ new instance bounds)
//   2. SURFACE CACHE RADIANCE (Lumen surface cache + radiosity, voxel flavour)
//        SurfaceLightEntry  every surface voxel: direct sun / moon / area lights / emissive primitives with distance-field soft
//                           shadows (fresh every frame -> no lag on moving shadows) + temporally accumulated multi-bounce
//                           irradiance gathered by tracing the global distance field into the previous frame's radiance.
//   3. WORLD RADIANCE CACHE PROBES (DDGI engine)
//        ProbeTraceEntry / ProbeBlendEntry  probes trace the distance field, shade hits from the surface cache, and blend
//                           octahedral irradiance + Chebyshev depth moments with hysteresis.
//   The scene shader's final gather (RadianceFieldShaders.js) traces the same field per pixel (voxel_sdf engine) or reads the
//   probes (ddgi engine). Emitters are NEVER cone-gathered: area lights and emissive primitives are integrated analytically
//   (clipped-polygon form factors / sphere illuminance) with traced visibility, and the surface cache stores reflected light
//   only, so the gather never double counts an emitter.
//==========================================================================================================================================

// Distance-field sampling / tracing shared by the compute kernels and the scene shader. `Field`, `Rad`, `Samp` name the bound
// stacked 3D textures + sampler of the host module.
export function GdfTracingWgsl(Field, Rad, Samp) {
  return /* wgsl */ `
struct GdfLayout {
  center : vec3f,
  half0 : f32, half1 : f32, voxel0 : f32, voxel1 : f32,
  res0 : f32, res1 : f32, stackW : f32, stackD : f32, zoff1 : f32,
  band1 : f32,
};

struct GdfHit {
  hit : bool,
  t   : f32,
  p   : vec3f,
};

fn gdfClipOf(L : GdfLayout, p : vec3f) -> i32 {
  let a = abs(p - L.center);
  let m = max(a.x, max(a.y, a.z));
  if (m < L.half0 - 1.5 * L.voxel0) { return 0; }
  if (m < L.half1 - 1.5 * L.voxel1) { return 1; }
  return 2;
}

fn gdfVoxelOf(L : GdfLayout, c : i32) -> f32 { return select(L.voxel1, L.voxel0, c == 0); }

fn gdfUvw(L : GdfLayout, c : i32, p : vec3f) -> vec3f {
  let h = select(L.half1, L.half0, c == 0);
  let vx = select(L.voxel1, L.voxel0, c == 0);
  let r = select(L.res1, L.res0, c == 0);
  let zo = select(L.zoff1, 0.0, c == 0);
  let f = clamp((p - L.center + vec3f(h)) / vx, vec3f(0.5), vec3f(r - 0.5));
  return vec3f(f.x / L.stackW, f.y / L.stackW, (zo + f.z) / L.stackD);
}

fn gdfDistanceIn(L : GdfLayout, c : i32, p : vec3f) -> f32 {
  return textureSampleLevel(${Field}, ${Samp}, gdfUvw(L, c, p), 0.0).x;
}

fn gdfDistance(L : GdfLayout, p : vec3f) -> f32 {
  let c = gdfClipOf(L, p);
  if (c == 2) {
    let a = abs(p - L.center) - vec3f(L.half1);
    return max(length(max(a, vec3f(0.0))), L.band1);
  }
  return gdfDistanceIn(L, c, p);
}

fn gdfNormal(L : GdfLayout, p : vec3f) -> vec3f {
  let c = min(gdfClipOf(L, p), 1);
  let h = gdfVoxelOf(L, c) * 0.75;
  let d0 = gdfDistanceIn(L, c, p + vec3f(h, -h, -h));
  let d1 = gdfDistanceIn(L, c, p + vec3f(-h, -h, h));
  let d2 = gdfDistanceIn(L, c, p + vec3f(-h, h, -h));
  let d3 = gdfDistanceIn(L, c, p + vec3f(h, h, h));
  let g = vec3f(d0 - d1 - d2 + d3, -d0 - d1 + d2 + d3, -d0 + d1 - d2 + d3);
  let gl = length(g);
  return select(vec3f(0.0, 0.0, 1.0), g / gl, gl > 1e-6);
}

// Sphere tracing through the truncated clipmap: clip 0 near the centre, clip 1 outside, miss when the ray leaves clip 1.
fn gdfTrace(L : GdfLayout, o : vec3f, d : vec3f, tMax : f32) -> GdfHit {
  var r : GdfHit;
  r.hit = false;
  r.t = tMax;
  r.p = o + d * tMax;
  var t : f32 = 0.0;
  for (var i : i32 = 0; i < 112; i = i + 1) {
    let p = o + d * t;
    let c = gdfClipOf(L, p);
    if (c == 2) { break; }
    let vx = gdfVoxelOf(L, c);
    let s = gdfDistanceIn(L, c, p);
    if (s < 0.3 * vx) {
      r.hit = true;
      r.t = t;
      r.p = p;
      break;
    }
    t = t + max(s * 0.9, 0.35 * vx);
    if (t > tMax) { break; }
  }
  return r;
}

// Distance-field soft shadow (penumbra from the closest approach ratio, k = 1 / tan(half cone)).
fn gdfSoftShadow(L : GdfLayout, o : vec3f, d : vec3f, tMax : f32, k : f32) -> f32 {
  var res : f32 = 1.0;
  var t : f32 = 0.0;
  for (var i : i32 = 0; i < 96; i = i + 1) {
    let p = o + d * t;
    let c = gdfClipOf(L, p);
    if (c == 2) { break; }
    let vx = gdfVoxelOf(L, c);
    let s = gdfDistanceIn(L, c, p);
    if (s < 0.2 * vx) { return 0.0; }
    res = min(res, k * s / max(t, vx));
    t = t + max(s * 0.9, 0.35 * vx);
    if (t > tMax) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

// Surface-cache radiance at a traced hit (premultiplied coverage -> no darkening at the surface band edge).
fn gdfRadiance(L : GdfLayout, p : vec3f) -> vec3f {
  let c = gdfClipOf(L, p);
  if (c == 2) { return vec3f(0.0); }
  let r = textureSampleLevel(${Rad}, ${Samp}, gdfUvw(L, c, p), 0.0);
  if (r.a < 0.02) { return vec3f(0.0); }
  return r.rgb / r.a;
}
`;
}

// Analytic emitter integration shared by the surface cache and the scene shader (diffuse irradiance / PI only).
export const GDF_EMITTER_WGSL = /* wgsl */ `
fn gdfEdgeZ(v1 : vec3f, v2 : vec3f) -> f32 {
  let x = clamp(dot(v1, v2), -0.99999, 0.99999);
  let ax = abs(x);
  let a = 5.42031 + (3.12829 + 0.0902326 * ax) * ax;
  let b = 3.45068 + (4.18814 + ax) * ax;
  var tos = a / b;
  if (x < 0.0) { tos = 3.14159265 / sqrt(max(1e-8, 1.0 - x * x)) - tos; }
  return (v1.x * v2.y - v1.y * v2.x) * tos;
}

// Form factor of a quad (corners relative to the receiver, in the receiver's (T, B, N) frame), clipped to the horizon.
fn gdfQuadFormFactor(q0 : vec3f, q1 : vec3f, q2 : vec3f, q3 : vec3f) -> f32 {
  var q = array<vec3f, 4>(q0, q1, q2, q3);
  var c = array<vec3f, 8>();
  var n : i32 = 0;
  for (var i : i32 = 0; i < 4; i = i + 1) {
    let cur = q[i];
    let nxt = q[(i + 1) & 3];
    if (cur.z >= 0.0) { c[n] = cur; n = n + 1; }
    if ((cur.z >= 0.0) != (nxt.z >= 0.0)) {
      var h = cur + (nxt - cur) * (cur.z / (cur.z - nxt.z));
      h.z = 0.0;
      c[n] = h;
      n = n + 1;
    }
  }
  if (n < 3) { return 0.0; }
  var sum : f32 = 0.0;
  for (var i : i32 = 0; i < 8; i = i + 1) {
    if (i >= n) { break; }
    let j = select(i + 1, 0, i + 1 >= n);
    sum = sum + gdfEdgeZ(normalize(c[i]), normalize(c[j]));
  }
  return clamp(abs(sum) / 6.28318531, 0.0, 1.0);
}

fn gdfFrame(N : vec3f) -> mat3x3f {
  let s = select(-1.0, 1.0, N.z >= 0.0);
  let a = -1.0 / (s + N.z);
  let b = N.x * N.y * a;
  let T = vec3f(1.0 + s * N.x * N.x * a, s * b, -s * N.x);
  let B = vec3f(b, s + N.y * N.y * a, -N.y);
  return mat3x3f(T, B, N);
}

fn gdfQuadFF(p : vec3f, N : vec3f, c : vec3f, hu : vec3f, hv : vec3f) -> f32 {
  let F = transpose(gdfFrame(N));
  return gdfQuadFormFactor(F * (c - hu - hv - p), F * (c + hu - hv - p), F * (c + hu + hv - p), F * (c - hu + hv - p));
}

// Exact irradiance factor of a spherical emitter (Snyder / Frostbite horizon handling): E = L * result.
fn gdfSphereIlluminance(cosT : f32, sinS2 : f32) -> f32 {
  if (cosT * cosT > sinS2) { return 3.14159265 * sinS2 * max(cosT, 0.0); }
  let sinT = sqrt(max(1e-6, 1.0 - cosT * cosT));
  let x = sqrt(max(1e-6, 1.0 / sinS2 - 1.0));
  let y = clamp(-x * (cosT / sinT), -1.0, 1.0);
  let sty = sinT * sqrt(max(0.0, 1.0 - y * y));
  return max(0.0, (cosT * acos(y) - x * sty) * sinS2 + atan(sty / x));
}
`;

// GLSL twin of GDF_EMITTER_WGSL (needs gdfFrame from GdfTracingGlsl): Lambert polygon form factor of a horizon-clipped quad and the
// exact horizon-clipped sphere illuminance. Shared by the WebGL2 surface-cache kernels and the viewport scene shader.
export const GDF_EMITTER_GLSL = /* glsl */ `
float gdfEdgeZ(vec3 v1, vec3 v2) {
  float x = clamp(dot(v1, v2), -0.99999, 0.99999);
  float ax = abs(x);
  float a = 5.42031 + (3.12829 + 0.0902326 * ax) * ax;
  float b = 3.45068 + (4.18814 + ax) * ax;
  float tos = a / b;
  if (x < 0.0) tos = 3.14159265 / sqrt(max(1e-8, 1.0 - x * x)) - tos;
  return (v1.x * v2.y - v1.y * v2.x) * tos;
}

float gdfQuadFormFactor(vec3 q0, vec3 q1, vec3 q2, vec3 q3) {
  vec3 q[4];
  q[0] = q0; q[1] = q1; q[2] = q2; q[3] = q3;
  vec3 c[8];
  int n = 0;
  for (int i = 0; i < 4; ++i) {
    vec3 cur = q[i];
    vec3 nxt = q[(i + 1) & 3];
    if (cur.z >= 0.0) { c[n] = cur; n++; }
    if ((cur.z >= 0.0) != (nxt.z >= 0.0)) {
      vec3 h = cur + (nxt - cur) * (cur.z / (cur.z - nxt.z));
      h.z = 0.0;
      c[n] = h;
      n++;
    }
  }
  if (n < 3) return 0.0;
  float sum = 0.0;
  for (int i = 0; i < 8; ++i) {
    if (i >= n) break;
    int j = i + 1 >= n ? 0 : i + 1;
    sum += gdfEdgeZ(normalize(c[i]), normalize(c[j]));
  }
  return clamp(abs(sum) / 6.28318531, 0.0, 1.0);
}

float gdfQuadFF(vec3 p, vec3 N, vec3 c, vec3 hu, vec3 hv) {
  mat3 F = transpose(gdfFrame(N));
  return gdfQuadFormFactor(F * (c - hu - hv - p), F * (c + hu - hv - p), F * (c + hu + hv - p), F * (c - hu + hv - p));
}

float gdfSphereIlluminance(float cosT, float sinS2) {
  if (cosT * cosT > sinS2) return 3.14159265 * sinS2 * max(cosT, 0.0);
  float sinT = sqrt(max(1e-6, 1.0 - cosT * cosT));
  float x = sqrt(max(1e-6, 1.0 / sinS2 - 1.0));
  float y = clamp(-x * (cosT / sinT), -1.0, 1.0);
  float sty = sinT * sqrt(max(0.0, 1.0 - y * y));
  return max(0.0, (cosT * acos(y) - x * sty) * sinS2 + atan(sty / x));
}
`;

//==========================================================================================================================================
// Compute module
//==========================================================================================================================================
const GI_PARAMS_WGSL = /* wgsl */ `
struct GiParams {
  center   : vec4f,
  extent   : vec4f,
  res      : vec4i,
  boxMin   : vec4i,
  boxMax   : vec4i,
  counts   : vec4i,
  sunDir   : vec4f,
  sunIrr   : vec4f,
  moonDir  : vec4f,
  moonIrr  : vec4f,
  band     : vec4f,
  rot0     : vec4f,
  rot1     : vec4f,
  rot2     : vec4f,
  probeMin : vec4f,
  probeSp  : vec4f,
  probeCnt : vec4i,
  probeOff : vec4i,
  sky      : vec4f,
  spare    : vec4f,
};
`;

export const GDF_GI_COMPUTE_WGSL = /* wgsl */ `
${GI_PARAMS_WGSL}
@group(0) @binding(0) var<uniform> P : GiParams;
@group(0) @binding(1) var<storage, read> uScenePack : array<vec4f, 3168>;
@group(0) @binding(2) var<storage, read> uBvhNodes : array<vec4f>;
@group(0) @binding(3) var<storage, read> uBvhTris : array<vec4f>;
@group(0) @binding(4) var<storage, read> uDynInst : array<vec4f>;
@group(0) @binding(5) var<storage, read_write> uLocalSdf : array<vec2f>;
@group(0) @binding(6) var<storage, read> uMeshGrid : array<vec4f>;
@group(0) @binding(7) var tStaticDistOut : texture_storage_3d<rgba16float, write>;
@group(0) @binding(8) var tStaticAttrOut : texture_storage_3d<rgba16float, write>;
@group(0) @binding(9) var tStaticDist : texture_3d<f32>;
@group(0) @binding(10) var tStaticAttr : texture_3d<f32>;
@group(0) @binding(11) var tFieldOut : texture_storage_3d<rgba16float, write>;
@group(0) @binding(12) var tAttrOut : texture_storage_3d<rgba16float, write>;
@group(0) @binding(13) var tField : texture_3d<f32>;
@group(0) @binding(14) var tAttr : texture_3d<f32>;
@group(0) @binding(15) var tRadPrev : texture_3d<f32>;
@group(0) @binding(16) var tRadOut : texture_storage_3d<rgba16float, write>;
@group(0) @binding(17) var sLinear : sampler;
@group(0) @binding(18) var tSky : texture_2d<f32>;
@group(0) @binding(19) var sSky : sampler;
@group(0) @binding(20) var<storage, read_write> uField : array<vec4f>;
@group(0) @binding(21) var<storage, read_write> uProbeRays : array<vec4f>;
@group(0) @binding(22) var tIndPrev : texture_3d<f32>;
@group(0) @binding(23) var tIndOut : texture_storage_3d<rgba16float, write>;

const PI : f32 = 3.14159265359;

${GdfTracingWgsl("tField", "tRadPrev", "sLinear")}
${GDF_EMITTER_WGSL}

fn layoutFromParams() -> GdfLayout {
  var L : GdfLayout;
  L.center = P.center.xyz;
  L.half0 = P.extent.x; L.half1 = P.extent.y; L.voxel0 = P.extent.z; L.voxel1 = P.extent.w;
  L.res0 = f32(P.res.x); L.res1 = f32(P.res.y); L.stackW = f32(P.res.z); L.stackD = f32(P.res.x + P.res.y);
  L.zoff1 = f32(P.res.w); L.band1 = P.band.y;
  return L;
}

fn sp(col : i32, row : i32) -> vec4f { return uScenePack[row * 8 + col]; }
fn clipRes(c : i32) -> i32 { return select(P.res.y, P.res.x, c == 0); }
fn clipHalf(c : i32) -> f32 { return select(P.extent.y, P.extent.x, c == 0); }
fn clipVoxel(c : i32) -> f32 { return select(P.extent.w, P.extent.z, c == 0); }
fn clipBand(c : i32) -> f32 { return select(P.band.y, P.band.x, c == 0); }
fn clipTexel(c : i32, v : vec3i) -> vec3i { return vec3i(v.x, v.y, v.z + select(P.res.w, 0, c == 0)); }
fn voxelCenter(c : i32, v : vec3i) -> vec3f { return P.center.xyz - vec3f(clipHalf(c)) + (vec3f(v) + 0.5) * clipVoxel(c); }

fn hashU(x : u32) -> u32 {
  var h = x * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return (h >> 22u) ^ h;
}
fn hashF(x : u32) -> f32 { return f32(hashU(x) & 16777215u) / 16777216.0; }

fn frameRotate(d : vec3f) -> vec3f { return vec3f(dot(P.rot0.xyz, d), dot(P.rot1.xyz, d), dot(P.rot2.xyz, d)); }

fn sphericalFibonacci(i : i32, n : i32) -> vec3f {
  let z = 1.0 - (2.0 * f32(i) + 1.0) / f32(n);
  let r = sqrt(max(0.0, 1.0 - z * z));
  let phi = f32(i) * 2.39996323;
  return vec3f(r * cos(phi), r * sin(phi), z);
}

fn octDecode(uv : vec2f) -> vec3f {
  let o = uv * 2.0 - 1.0;
  var n = vec3f(o.x, o.y, 1.0 - abs(o.x) - abs(o.y));
  if (n.z < 0.0) {
    n = vec3f((1.0 - abs(o.y)) * select(-1.0, 1.0, o.x >= 0.0), (1.0 - abs(o.x)) * select(-1.0, 1.0, o.y >= 0.0), n.z);
  }
  return normalize(n);
}

fn skyUv(dir : vec3f) -> vec2f {
  let kLimb = 1.576404012;
  let kHalfH = 54.0;
  let az = atan2(dir.y, dir.x);
  let polar = acos(clamp(dir.z, -1.0, 1.0));
  let u = fract(az * (0.5 / PI) + 0.5);
  var y = kHalfH + sqrt(clamp((polar - kLimb) / (PI - kLimb), 0.0, 1.0)) * (kHalfH - 1.0);
  if (polar <= kLimb) { y = sqrt(clamp(1.0 - polar / kLimb, 0.0, 1.0)) * (kHalfH - 1.0); }
  return vec2f(u, (y + 0.5) / (kHalfH * 2.0));
}

fn skyRadiance(dir : vec3f) -> vec3f {
  if ((P.counts.w & 16) == 0) { return vec3f(0.0); }
  return textureSampleLevel(tSky, sSky, skyUv(dir), 0.0).rgb * P.moonIrr.w;
}

//------------------------------------------------------------------------------------------------------------------------------------------
// Primitive SDFs (exact, matching the scene's analytic intersectors)
//------------------------------------------------------------------------------------------------------------------------------------------
fn sdBox(p : vec3f, h : vec3f) -> f32 {
  let q = abs(p) - h;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdCappedCone(p : vec3f, z0 : f32, z1 : f32, r0 : f32, r1 : f32) -> f32 {
  let H = max(1e-5, 0.5 * (z1 - z0));
  let q = vec2f(length(p.xy), p.z - 0.5 * (z0 + z1));
  let k1 = vec2f(r1, H);
  let k2 = vec2f(r1 - r0, 2.0 * H);
  let ca = vec2f(q.x - min(q.x, select(r1, r0, q.y < 0.0)), abs(q.y) - H);
  let t = clamp(dot(k1 - q, k2) / max(1e-9, dot(k2, k2)), 0.0, 1.0);
  let cb = q - k1 + k2 * t;
  let s = select(1.0, -1.0, cb.x < 0.0 && ca.y < 0.0);
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

fn primLocalSd(shape : i32, p : vec3f, h : vec3f) -> f32 {
  if (shape == 0) { return sdBox(p, h); }
  if (shape == 1) {
    let k0 = length(p / h);
    let k1 = length(p / (h * h));
    return select(-min(h.x, min(h.y, h.z)), k0 * (k0 - 1.0) / k1, k1 > 1e-9);
  }
  if (shape == 4) {
    let rMinor = h.z;
    let rMajor = max(rMinor * 1.25, max(h.x, h.y) - rMinor);
    return length(vec2f(length(p.xy) - rMajor, p.z)) - rMinor;
  }
  let rad = max(h.x, h.y);
  if (shape == 3) {
    let zf = -0.78 * h.z;
    let bd = sdBox(p - vec3f(0.0, 0.0, 0.5 * (zf - h.z)), vec3f(rad, rad, 0.5 * (zf + h.z)));
    return min(bd, sdCappedCone(p, zf, h.z, 0.72 * rad, 0.13 * rad));
  }
  if (shape == 5) {
    let zf = -0.84 * h.z;
    return min(sdCappedCone(p, -h.z, zf, rad, 0.94 * rad), sdCappedCone(p, zf, h.z, 0.5 * rad, 0.37 * rad));
  }
  return sdCappedCone(p, -h.z, h.z, rad, rad);
}

fn primDistance(i : i32, p : vec3f) -> f32 {
  let ps = sp(0, i);
  let h = sp(1, i).xyz;
  let lp = vec3f(dot(sp(2, i).xyz, p - ps.xyz), dot(sp(3, i).xyz, p - ps.xyz), dot(sp(4, i).xyz, p - ps.xyz));
  return primLocalSd(i32(ps.w + 0.5), lp, h);
}

fn primInField(i : i32) -> bool {
  let flags = i32(sp(1, i).w + 0.5);
  return (flags & 3) != 0 && (flags & 4) == 0;
}

//------------------------------------------------------------------------------------------------------------------------------------------
// 1a. Static field: analytic primitives inside the dirty voxel box of clip boxMin.w
//------------------------------------------------------------------------------------------------------------------------------------------
@compute @workgroup_size(4, 4, 4)
fn StaticBuildEntry(@builtin(global_invocation_id) gid : vec3u) {
  let c = P.boxMin.w;
  let v = P.boxMin.xyz + vec3i(gid);
  if (any(v >= P.boxMax.xyz)) { return; }
  let p = voxelCenter(c, v);
  let band = clipBand(c);
  var best = band;
  var bestIdx : i32 = -1;
  for (var i : i32 = 0; i < P.counts.x; i = i + 1) {
    if (!primInField(i)) { continue; }
    let lower = length(p - sp(0, i).xyz) - length(sp(1, i).xyz);
    if (lower >= best) { continue; }
    let d = primDistance(i, p);
    if (d < best) { best = d; bestIdx = i; }
  }
  let tx = clipTexel(c, v);
  textureStore(tStaticDistOut, tx, vec4f(clamp(best, -band, band), 0.0, 0.0, 0.0));
  var attr = vec4f(0.0);
  if (bestIdx >= 0) { attr = vec4f(clamp(sp(6, bestIdx).rgb, vec3f(0.0), vec3f(1.0)), 0.0); }
  textureStore(tStaticAttrOut, tx, attr);
}

//------------------------------------------------------------------------------------------------------------------------------------------
// 1b. Local mesh SDF bake (once per vehicle mesh): unsigned closest-triangle distance + material over a node-centred grid
//------------------------------------------------------------------------------------------------------------------------------------------
fn closestTriDist2(p : vec3f, a : vec3f, b : vec3f, c : vec3f) -> f32 {
  let ab = b - a; let ac = c - a; let ap = p - a;
  let d1 = dot(ab, ap); let d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) { return dot(ap, ap); }
  let bp = p - b;
  let d3 = dot(ab, bp); let d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) { return dot(bp, bp); }
  let vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) { let q = a + ab * (d1 / (d1 - d3)); return dot(p - q, p - q); }
  let cp = p - c;
  let d5 = dot(ab, cp); let d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) { return dot(cp, cp); }
  let vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) { let q = a + ac * (d2 / (d2 - d6)); return dot(p - q, p - q); }
  let va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && (d4 - d3) >= 0.0 && (d5 - d6) >= 0.0) {
    let q = b + (c - b) * ((d4 - d3) / ((d4 - d3) + (d5 - d6)));
    return dot(p - q, p - q);
  }
  let dn = 1.0 / (va + vb + vc);
  let q = a + ab * (vb * dn) + ac * (vc * dn);
  return dot(p - q, p - q);
}

fn aabbDist2(p : vec3f, mn : vec3f, mx : vec3f) -> f32 {
  let d = max(max(mn - p, vec3f(0.0)), p - mx);
  return dot(d, d);
}

@compute @workgroup_size(64)
fn LocalBakeEntry(@builtin(global_invocation_id) gid : vec3u) {
  let m = P.boxMin.w;
  let g0 = uMeshGrid[m * 3];
  let g1 = uMeshGrid[m * 3 + 1];
  let g2 = uMeshGrid[m * 3 + 2];
  let dims = vec3i(g1.xyz + 0.5);
  let idx = i32(gid.x);
  if (idx >= dims.x * dims.y * dims.z) { return; }
  let vx = idx % dims.x;
  let vy = (idx / dims.x) % dims.y;
  let vz = idx / (dims.x * dims.y);
  let p = g0.xyz + vec3f(f32(vx), f32(vy), f32(vz)) * g0.w;
  var best2 : f32 = 1e30;
  var bestMat : f32 = 6.0;
  var stack : array<i32, 64>;
  var top : i32 = 1;
  stack[0] = i32(g2.x + 0.5);
  while (top > 0) {
    top = top - 1;
    let ni = stack[top];
    let n0 = uBvhNodes[ni * 2];
    let n1 = uBvhNodes[ni * 2 + 1];
    if (aabbDist2(p, n0.xyz, n1.xyz) >= best2) { continue; }
    let lf = i32(round(n0.w));
    let cnt = i32(round(n1.w));
    if (cnt > 0) {
      for (var t : i32 = 0; t < cnt; t = t + 1) {
        let tb = (lf + t) * 4;
        let a = uBvhTris[tb];
        let d2 = closestTriDist2(p, a.xyz, uBvhTris[tb + 1].xyz, uBvhTris[tb + 2].xyz);
        if (d2 < best2) { best2 = d2; bestMat = a.w; }
      }
    } else if (top < 62) {
      let l0 = uBvhNodes[lf * 2]; let l1 = uBvhNodes[lf * 2 + 1];
      let r0 = uBvhNodes[(lf + 1) * 2]; let r1 = uBvhNodes[(lf + 1) * 2 + 1];
      let dl = aabbDist2(p, l0.xyz, l1.xyz);
      let dr = aabbDist2(p, r0.xyz, r1.xyz);
      if (dl < dr) { stack[top] = lf + 1; stack[top + 1] = lf; } else { stack[top] = lf; stack[top + 1] = lf + 1; }
      top = top + 2;
    }
  }
  uLocalSdf[i32(g1.w + 0.5) + idx] = vec2f(sqrt(best2), bestMat);
}

//------------------------------------------------------------------------------------------------------------------------------------------
// 1c. Compose: active = min(static, moving mesh SDFs) in the dirty voxel box only
//------------------------------------------------------------------------------------------------------------------------------------------
fn sampleLocalSdf(m : i32, lp : vec3f) -> vec2f {
  let g0 = uMeshGrid[m * 3];
  let g1 = uMeshGrid[m * 3 + 1];
  let dims = vec3i(g1.xyz + 0.5);
  let off = i32(g1.w + 0.5);
  let q = (lp - g0.xyz) / g0.w;
  let qc = clamp(q, vec3f(0.0), vec3f(dims - vec3i(1)));
  let outside = length(q - qc) * g0.w;
  let i0 = min(vec3i(floor(qc)), dims - vec3i(2));
  let f = qc - vec3f(i0);
  var d : f32 = 0.0;
  for (var k : i32 = 0; k < 8; k = k + 1) {
    let o = vec3i(k & 1, (k >> 1u) & 1, (k >> 2u) & 1);
    let w = select(1.0 - f.x, f.x, o.x == 1) * select(1.0 - f.y, f.y, o.y == 1) * select(1.0 - f.z, f.z, o.z == 1);
    let c = i0 + o;
    d = d + w * uLocalSdf[off + (c.z * dims.y + c.y) * dims.x + c.x].x;
  }
  let n = vec3i(floor(qc + vec3f(0.5)));
  let mat = uLocalSdf[off + (n.z * dims.y + n.y) * dims.x + n.x].y;
  return vec2f(d + outside, mat);
}

// Diffuse albedo (rgb) + implicit emission (a) of the vehicle material ids used by buildVehicleMaterial.
fn vehicleAttr(matId : i32, paint : vec3f) -> vec4f {
  if (matId == 6) { return vec4f(paint * 0.75, 0.0); }
  if (matId == 7) { return vec4f(0.045, 0.052, 0.070, 0.0) * 0.92; }
  if (matId == 8 || matId == 15 || matId == 16) { return vec4f(vec3f(0.075, 0.08, 0.09) * 0.85, 0.0); }
  if (matId == 9) { return vec4f(vec3f(0.045, 0.048, 0.055) * 0.94, 0.0); }
  if (matId == 10) { return vec4f(vec3f(0.76, 0.79, 0.84) * 0.08, 0.0); }
  if (matId == 11) { return vec4f(vec3f(0.055, 0.058, 0.065) * 0.98, 0.0); }
  if (matId == 12) { return vec4f(vec3f(0.84, 0.86, 0.90) * 0.05, 0.0); }
  if (matId == 13) { return vec4f(1.0, 0.97, 0.90, 5.0); }
  if (matId == 14) { return vec4f(1.0, 0.08, 0.06, 3.8); }
  return vec4f(paint * 0.75, 0.0);
}

@compute @workgroup_size(4, 4, 4)
fn ComposeEntry(@builtin(global_invocation_id) gid : vec3u) {
  let c = P.boxMin.w;
  let v = P.boxMin.xyz + vec3i(gid);
  if (any(v >= P.boxMax.xyz)) { return; }
  let tx = clipTexel(c, v);
  let p = voxelCenter(c, v);
  let band = clipBand(c);
  // Unsigned mesh distance: interpolated |d| across a thin sheet peaks at voxel / 2, so a quarter-voxel shell + the 0.3-voxel hit
  // threshold of gdfTrace guarantees thin panels are never stepped through.
  let shell = 0.25 * clipVoxel(c);
  var d = textureLoad(tStaticDist, tx, 0).x;
  var attr = textureLoad(tStaticAttr, tx, 0);
  for (var i : i32 = 0; i < P.boxMax.w; i = i + 1) {
    let b = i * 8;
    let mn = uDynInst[b + 3];
    let mx = uDynInst[b + 4];
    if (any(p < mn.xyz - vec3f(band)) || any(p > mx.xyz + vec3f(band))) { continue; }
    let r0 = uDynInst[b]; let r1 = uDynInst[b + 1]; let r2 = uDynInst[b + 2];
    let lp = vec3f(dot(r0.xyz, p) + r0.w, dot(r1.xyz, p) + r1.w, dot(r2.xyz, p) + r2.w);
    let ls = sampleLocalSdf(i32(mn.w + 0.5), lp);
    let dl = ls.x * mx.w - shell;
    if (dl < d) {
      d = dl;
      let ov = i32(round(uDynInst[b + 6].x)) - 1;
      attr = vehicleAttr(select(i32(round(ls.y)), ov, ov >= 0), uDynInst[b + 5].xyz);
    }
  }
  textureStore(tFieldOut, tx, vec4f(clamp(d, -band, band), 0.0, 0.0, 1.0));
  textureStore(tAttrOut, tx, attr);
}

//------------------------------------------------------------------------------------------------------------------------------------------
// 2. Surface cache radiance (one clip per dispatch)
//------------------------------------------------------------------------------------------------------------------------------------------
fn fieldAt(c : i32, v : vec3i) -> f32 {
  let r = clipRes(c) - 1;
  return textureLoad(tField, clipTexel(c, clamp(v, vec3i(0), vec3i(r))), 0).x;
}

fn fieldNormalAt(c : i32, v : vec3i) -> vec3f {
  let g = vec3f(fieldAt(c, v + vec3i(1, 0, 0)) - fieldAt(c, v - vec3i(1, 0, 0)),
                fieldAt(c, v + vec3i(0, 1, 0)) - fieldAt(c, v - vec3i(0, 1, 0)),
                fieldAt(c, v + vec3i(0, 0, 1)) - fieldAt(c, v - vec3i(0, 0, 1)));
  let gl = length(g);
  return select(vec3f(0.0, 0.0, 1.0), g / gl, gl > 1e-6);
}

// Direct irradiance from explicit emitters + sun + moon at a surface point (traced distance-field visibility).
fn directIrradiance(L : GdfLayout, p : vec3f, N : vec3f, o : vec3f) -> vec3f {
  let flags = P.counts.w;
  var E = vec3f(0.0);
  if ((flags & 1) != 0) {
    let ndl = dot(N, P.sunDir.xyz);
    if (ndl > 0.0 && dot(P.sunIrr.rgb, vec3f(1.0)) > 1e-6) {
      E = E + P.sunIrr.rgb * ndl * gdfSoftShadow(L, o, P.sunDir.xyz, P.band.z, P.sunDir.w);
    }
    let mdl = dot(N, P.moonDir.xyz);
    if (mdl > 0.0 && dot(P.moonIrr.rgb, vec3f(1.0)) > 1e-7) {
      E = E + P.moonIrr.rgb * mdl * gdfSoftShadow(L, o, normalize(P.moonDir.xyz), P.band.z, P.sunDir.w);
    }
  }
  for (var li : i32 = 0; li < P.counts.y; li = li + 1) {
    let row = 384 + li;
    let l0 = sp(0, row); let l1 = sp(1, row); let l2 = sp(2, row);
    let omni = l2.z > 0.5;
    if (omni && (flags & 4) == 0) { continue; }
    if (!omni && (flags & 2) == 0) { continue; }
    let ln = sp(5, row).xyz;
    if (!omni && dot(p - l0.xyz, ln) <= 0.0) { continue; }
    let ff = gdfQuadFF(p, N, l0.xyz, sp(3, row).xyz * l0.w, sp(4, row).xyz * l1.x);
    if (ff <= 1e-5) { continue; }
    let toL = l0.xyz - p;
    let dist = length(toL);
    let k = clamp(dist / max(0.05, max(l0.w, l1.x)), 1.5, 24.0);
    let vis = gdfSoftShadow(L, o, toL / max(dist, 1e-4), max(0.0, dist - 0.06), k);
    E = E + l1.yzw * (PI * ff * select(1.0, 1.35, omni) * vis);
  }
  if ((flags & 8) != 0) {
    for (var ei : i32 = 0; ei < P.counts.x; ei = ei + 1) {
      let g = sp(6, ei);
      if (g.w <= 0.05) { continue; }
      let ps = sp(0, ei);
      let h = sp(1, ei).xyz;
      let shape = i32(ps.w + 0.5);
      let Le = g.rgb * g.w;
      let toE = ps.xyz - p;
      let dist = length(toE);
      let rad = length(h);
      if (dist < rad * 0.6) { continue; }
      var e : f32 = 0.0;
      if (shape == 1) {
        let r = (h.x + h.y + h.z) / 3.0;
        let s2 = clamp(r * r / max(dist * dist, 1e-6), 0.0, 0.9999);
        e = gdfSphereIlluminance(dot(N, toE / dist), s2);
      } else {
        let scale = select(0.785398, 1.0, shape == 0);
        let c0 = sp(2, ei).xyz; let c1 = sp(3, ei).xyz; let c2 = sp(4, ei).xyz;
        for (var f : i32 = 0; f < 6; f = f + 1) {
          let ax = f >> 1u;
          let sg = select(-1.0, 1.0, (f & 1) == 1);
          let na = select(select(c2, c1, ax == 1), c0, ax == 0);
          let ua = select(select(c0, c2, ax == 1), c1, ax == 0);
          let va = select(select(c1, c0, ax == 1), c2, ax == 0);
          let ha = select(select(h.z, h.y, ax == 1), h.x, ax == 0);
          let hu = select(select(h.x, h.z, ax == 1), h.y, ax == 0);
          let hv = select(select(h.y, h.x, ax == 1), h.z, ax == 0);
          let fc = ps.xyz + na * (sg * ha);
          if (dot(p - fc, na * sg) <= 0.0) { continue; }
          e = e + PI * gdfQuadFF(p, N, fc, ua * hu, va * hv) * scale;
        }
      }
      if (e <= 1e-6) { continue; }
      let vis = gdfSoftShadow(L, o, toE / dist, max(0.0, dist - rad * 1.05), clamp(dist / max(rad, 0.05), 1.5, 24.0));
      E = E + Le * (e * vis);
    }
  }
  return E;
}

@compute @workgroup_size(4, 4, 4)
fn SurfaceLightEntry(@builtin(global_invocation_id) gid : vec3u) {
  let c = P.boxMin.w;
  let r = clipRes(c);
  let v = vec3i(gid);
  if (any(v >= vec3i(r))) { return; }
  let tx = clipTexel(c, v);
  let vx = clipVoxel(c);
  let d = textureLoad(tField, tx, 0).x;
  if (abs(d) > 1.5 * vx) {
    textureStore(tRadOut, tx, vec4f(0.0));
    textureStore(tIndOut, tx, vec4f(0.0));
    return;
  }
  let N = fieldNormalAt(c, v);
  let p = voxelCenter(c, v) - N * d;
  let attr = textureLoad(tAttr, tx, 0);
  let L = layoutFromParams();
  let o = p + N * (vx * 1.05);
  let Ed = directIrradiance(L, p, N, o);

  // Multi-bounce: trace the persistent distance field into last frame's surface radiance (cosine-weighted, rotated per frame).
  let rays = max(1, P.counts.z);
  let F = gdfFrame(N);
  let seed = hashU((u32(tx.x) * 73856093u) ^ (u32(tx.y) * 19349663u) ^ (u32(tx.z) * 83492791u));
  let j0 = hashF(seed ^ u32(P.center.w * 7919.0));
  let j1 = hashF((seed * 3u) + u32(P.center.w * 104729.0));
  var acc = vec3f(0.0);
  for (var k : i32 = 0; k < 16; k = k + 1) {
    if (k >= rays) { break; }
    let u1 = fract((f32(k) + j0) / f32(rays));
    let phi = 6.28318531 * fract(f32(k) * 0.61803399 + j1);
    let st = sqrt(u1);
    let dir = F * vec3f(st * cos(phi), st * sin(phi), sqrt(max(0.0, 1.0 - u1)));
    let h = gdfTrace(L, o, dir, P.band.z);
    if (h.hit) {
      if ((P.counts.w & 32) != 0) { acc = acc + gdfRadiance(L, h.p); }
    } else {
      acc = acc + skyRadiance(dir);
    }
  }
  var EiNew = PI * acc / f32(rays);
  // SdfGiBilateral: normal-aware 6-neighbour filter of the radiosity history (surface-cache spatial reuse).
  if ((P.counts.w & 64) != 0) {
    var sum = EiNew * 2.0;
    var ws : f32 = 2.0;
    for (var f : i32 = 0; f < 6; f = f + 1) {
      let ax = f >> 1u;
      let o = select(-1, 1, (f & 1) == 1);
      let nv = v + vec3i(select(0, o, ax == 0), select(0, o, ax == 1), select(0, o, ax == 2));
      if (any(nv < vec3i(0)) || any(nv >= vec3i(r))) { continue; }
      let ni = textureLoad(tIndPrev, clipTexel(c, nv), 0);
      if (ni.a < 0.5) { continue; }
      let w = pow(max(dot(fieldNormalAt(c, nv), N), 0.0), 8.0);
      sum = sum + ni.rgb * w;
      ws = ws + w;
    }
    EiNew = sum / ws;
  }
  let prevInd = textureLoad(tIndPrev, tx, 0);
  let Ei = select(EiNew, mix(prevInd.rgb, EiNew, P.sunIrr.w), prevInd.a > 0.5);
  let Lout = attr.rgb / PI * (Ed + Ei) + attr.rgb * attr.a;
  textureStore(tRadOut, tx, vec4f(Lout, 1.0));
  textureStore(tIndOut, tx, vec4f(Ei, 1.0));
}

//------------------------------------------------------------------------------------------------------------------------------------------
// 3. World radiance cache probes (DDGI layout, see GlobalDistanceFieldLayout.js)
//------------------------------------------------------------------------------------------------------------------------------------------
fn probeGridPos(ci : i32) -> vec3f {
  let cx = ci % P.probeCnt.x;
  let cy = (ci / P.probeCnt.x) % P.probeCnt.y;
  let cz = ci / (P.probeCnt.x * P.probeCnt.y);
  return P.probeMin.xyz + vec3f(f32(cx), f32(cy), f32(cz)) * P.probeSp.xyz;
}

// Probes buried in (or touching) geometry are pushed out along the field gradient (DDGI probe relocation).
fn probePos(L : GdfLayout, ci : i32) -> vec3f {
  let g = probeGridPos(ci);
  let c = gdfClipOf(L, g);
  if (c == 2) { return g; }
  let vx = gdfVoxelOf(L, c);
  let d = gdfDistanceIn(L, c, g);
  let want = max(vx * 1.25, 0.08);
  if (d >= want) { return g; }
  let n = gdfNormal(L, g);
  return g + n * min(want - d, 0.45 * P.probeMin.w);
}

fn probeRayDir(r : i32) -> vec3f { return frameRotate(sphericalFibonacci(r, P.probeCnt.w)); }

@compute @workgroup_size(64)
fn ProbeTraceEntry(@builtin(workgroup_id) wid : vec3u, @builtin(local_invocation_index) lid : u32) {
  let ci = i32(wid.x);
  let L = layoutFromParams();
  let o = probePos(L, ci);
  let rays = P.probeCnt.w;
  let maxD = P.probeSp.w;
  for (var r : i32 = i32(lid); r < rays; r = r + 64) {
    let dir = probeRayDir(r);
    let h = gdfTrace(L, o, dir, maxD);
    var rad = vec3f(0.0);
    var dist = maxD;
    var back = false;
    if (h.hit) {
      dist = h.t;
      back = dot(gdfNormal(L, h.p), dir) > 0.25 || h.t < 1e-4;
      rad = gdfRadiance(L, h.p);
    } else {
      rad = skyRadiance(dir);
    }
    uProbeRays[ci * 256 + r] = vec4f(rad, select(dist, -max(dist, 1e-4), back));
  }
}

@compute @workgroup_size(64)
fn ProbeBlendEntry(@builtin(workgroup_id) wid : vec3u, @builtin(local_invocation_index) lid : u32) {
  let ci = i32(wid.x);
  let t = i32(lid);
  let rays = P.probeCnt.w;
  let maxD = P.probeSp.w;
  let alpha = P.moonDir.w;
  // irradiance texel t of the 8x8 octahedral sheet
  let nTex = octDecode((vec2f(f32(t % 8), f32(t / 8)) + 0.5) / 8.0);
  var acc = vec3f(0.0);
  var wsum : f32 = 0.0;
  for (var r : i32 = 0; r < rays; r = r + 1) {
    let ray = uProbeRays[ci * 256 + r];
    let w = max(0.0, dot(nTex, probeRayDir(r)));
    acc = acc + ray.rgb * w;
    wsum = wsum + w;
  }
  let irrNew = acc / max(wsum, 1e-4);
  let ii = P.probeOff.y + ci * 64 + t;
  let old = uField[ii].xyz;
  uField[ii] = vec4f(mix(old, irrNew, alpha), 1.0);
  // depth moment texels 4t .. 4t+3 of the 16x16 sheet (two per vec4)
  for (var hb : i32 = 0; hb < 2; hb = hb + 1) {
    var mom = vec4f(0.0);
    for (var e : i32 = 0; e < 2; e = e + 1) {
      let tex = t * 4 + hb * 2 + e;
      let nM = octDecode((vec2f(f32(tex % 16), f32(tex / 16)) + 0.5) / 16.0);
      var m1 : f32 = 0.0;
      var m2 : f32 = 0.0;
      var ws : f32 = 0.0;
      for (var r : i32 = 0; r < rays; r = r + 1) {
        let dd = min(abs(uProbeRays[ci * 256 + r].w), maxD);
        let w = pow(max(0.0, dot(nM, probeRayDir(r))), 50.0);
        m1 = m1 + w * dd;
        m2 = m2 + w * dd * dd;
        ws = ws + w;
      }
      let mv = select(vec2f(maxD, maxD * maxD), vec2f(m1, m2) / ws, ws > 1e-5);
      if (e == 0) { mom = vec4f(mv, mom.zw); } else { mom = vec4f(mom.xy, mv); }
    }
    let mi = P.probeOff.z + ci * 128 + t * 2 + hb;
    uField[mi] = mix(uField[mi], mom, alpha);
  }
  if (t == 0) {
    var back : i32 = 0;
    for (var r : i32 = 0; r < rays; r = r + 1) {
      if (uProbeRays[ci * 256 + r].w < 0.0) { back = back + 1; }
    }
    let L = layoutFromParams();
    uField[P.probeOff.x + ci] = vec4f(probePos(L, ci), select(0.0, 1.0, f32(back) > 0.25 * f32(rays)));
  }
}
`;

// GLSL ES 3.00 port of GdfTracingWgsl (WebGL2 scene shader + fragment-pass GI kernels).
export function GdfTracingGlsl(Field, Rad) {
  return /* glsl */ `
struct GdfLayout {
  vec3 center;
  float half0, half1, voxel0, voxel1, res0, res1, stackW, stackD, zoff1, band1;
};

int gdfClipOf(GdfLayout L, vec3 p) {
  vec3 a = abs(p - L.center);
  float m = max(a.x, max(a.y, a.z));
  if (m < L.half0 - 1.5 * L.voxel0) return 0;
  if (m < L.half1 - 1.5 * L.voxel1) return 1;
  return 2;
}

float gdfVoxelOf(GdfLayout L, int c) { return c == 0 ? L.voxel0 : L.voxel1; }

vec3 gdfUvw(GdfLayout L, int c, vec3 p) {
  float h = c == 0 ? L.half0 : L.half1;
  float vx = c == 0 ? L.voxel0 : L.voxel1;
  float r = c == 0 ? L.res0 : L.res1;
  float zo = c == 0 ? 0.0 : L.zoff1;
  vec3 f = clamp((p - L.center + vec3(h)) / vx, vec3(0.5), vec3(r - 0.5));
  return vec3(f.x / L.stackW, f.y / L.stackW, (zo + f.z) / L.stackD);
}

float gdfDistanceIn(GdfLayout L, int c, vec3 p) { return textureLod(${Field}, gdfUvw(L, c, p), 0.0).x; }

float gdfDistance(GdfLayout L, vec3 p) {
  int c = gdfClipOf(L, p);
  if (c == 2) {
    vec3 a = abs(p - L.center) - vec3(L.half1);
    return max(length(max(a, vec3(0.0))), L.band1);
  }
  return gdfDistanceIn(L, c, p);
}

vec3 gdfNormal(GdfLayout L, vec3 p) {
  int c = min(gdfClipOf(L, p), 1);
  float h = gdfVoxelOf(L, c) * 0.75;
  float d0 = gdfDistanceIn(L, c, p + vec3(h, -h, -h));
  float d1 = gdfDistanceIn(L, c, p + vec3(-h, -h, h));
  float d2 = gdfDistanceIn(L, c, p + vec3(-h, h, -h));
  float d3 = gdfDistanceIn(L, c, p + vec3(h, h, h));
  vec3 g = vec3(d0 - d1 - d2 + d3, -d0 - d1 + d2 + d3, -d0 + d1 - d2 + d3);
  float gl = length(g);
  return gl > 1e-6 ? g / gl : vec3(0.0, 0.0, 1.0);
}

bool gdfTrace(GdfLayout L, vec3 o, vec3 d, float tMax, out float tHit, out vec3 pHit) {
  float t = 0.0;
  tHit = tMax;
  pHit = o + d * tMax;
  for (int i = 0; i < 112; ++i) {
    vec3 p = o + d * t;
    int c = gdfClipOf(L, p);
    if (c == 2) break;
    float vx = gdfVoxelOf(L, c);
    float s = gdfDistanceIn(L, c, p);
    if (s < 0.3 * vx) { tHit = t; pHit = p; return true; }
    t += max(s * 0.9, 0.35 * vx);
    if (t > tMax) break;
  }
  return false;
}

float gdfSoftShadow(GdfLayout L, vec3 o, vec3 d, float tMax, float k) {
  float res = 1.0;
  float t = 0.0;
  for (int i = 0; i < 96; ++i) {
    vec3 p = o + d * t;
    int c = gdfClipOf(L, p);
    if (c == 2) break;
    float vx = gdfVoxelOf(L, c);
    float s = gdfDistanceIn(L, c, p);
    if (s < 0.2 * vx) return 0.0;
    res = min(res, k * s / max(t, vx));
    t += max(s * 0.9, 0.35 * vx);
    if (t > tMax) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 gdfRadiance(GdfLayout L, vec3 p) {
  int c = gdfClipOf(L, p);
  if (c == 2) return vec3(0.0);
  vec4 r = textureLod(${Rad}, gdfUvw(L, c, p), 0.0);
  if (r.a < 0.02) return vec3(0.0);
  return r.rgb / r.a;
}

mat3 gdfFrame(vec3 N) {
  float s = N.z >= 0.0 ? 1.0 : -1.0;
  float a = -1.0 / (s + N.z);
  float b = N.x * N.y * a;
  return mat3(vec3(1.0 + s * N.x * N.x * a, s * b, -s * N.x), vec3(b, s + N.y * N.y * a, -N.y), N);
}
`;
}
