// RayCommon.wgsl — shared types/tracing for the RTX ReSTIR GI path tracer.
// Software ray tracing over a two-level BVH (WebGPU compute; no hardware-RT
// API exists in WebGPU). All geometry lives in ONE packed vec4 buffer to stay
// inside WebGPU's 8-storage-buffer stage limit. +Z up.
struct Frame {
  eye: vec4f, right: vec4f, up: vec4f, fwd: vec4f,
  sunDir: vec4f, sunColor: vec4f,
  viewProj: mat4x4f, prevViewProj: mat4x4f,
  misc: vec4f,   // width, height, frameIndex, bounces
  misc2: vec4f,  // temporal, spatial, visibility, indirectScale
  misc3: vec4f,  // exposure, spatialRadius, spatialCount, temporalMLimit
  misc4: vec4f,  // sunIntensity, skyScale, pointLightCount, reserved
  pack1: vec4f,  // blasVec4Offset, instVec4Offset, prevVec4Offset, pixelCount
  pack2: vec4f,  // parity, reserved x3
  lightPos: array<vec4f, 16>,
  lightCol: array<vec4f, 16>,
};
struct Tri { a: vec4f, b: vec4f, c: vec4f, n: vec4f };
struct BNode { mn: vec4f, mx: vec4f }; // mn.w=left/triStart, mx.w=count(0=interior)
struct Instance { m: mat4x4f, inv: mat4x4f, info: vec4f };
struct Material { albedoRough: vec4f, emissionMetal: vec4f, coat: vec4f };
struct Reservoir { pos: vec4f, rad: vec4f, norm: vec4f, info: vec4f }; // info: Wsum, M, age, pdf

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<storage, read> sceneData: array<vec4f>; // tris(4/tri) then BLAS nodes(2/node)
@group(0) @binding(2) var<storage, read> frameData: array<vec4f>; // TLAS nodes(2), instances(9), prevMats(4)
@group(0) @binding(3) var<storage, read> mats: array<Material>;

fn getTri(i: u32) -> Tri { return Tri(sceneData[i*4u], sceneData[i*4u+1u], sceneData[i*4u+2u], sceneData[i*4u+3u]); }
fn getBlas(i: u32) -> BNode { let o = u32(frame.pack1.x) + i*2u; return BNode(sceneData[o], sceneData[o+1u]); }
fn getTlas(i: u32) -> BNode { return BNode(frameData[i*2u], frameData[i*2u+1u]); }
fn getInst(i: u32) -> Instance {
  let o = u32(frame.pack1.y) + i*9u;
  return Instance(mat4x4f(frameData[o], frameData[o+1u], frameData[o+2u], frameData[o+3u]),
                  mat4x4f(frameData[o+4u], frameData[o+5u], frameData[o+6u], frameData[o+7u]), frameData[o+8u]);
}
fn getPrevMat(i: u32) -> mat4x4f {
  let o = u32(frame.pack1.z) + i*4u;
  return mat4x4f(frameData[o], frameData[o+1u], frameData[o+2u], frameData[o+3u]);
}
// Packed G-buffer (one buffer, 7 sections of pixelCount vec4s):
// 0/1 pos ping-pong, 2/3 normal ping-pong, 4 albedo, 5 direct, 6 motion.
fn gOff(section: u32) -> u32 { return section * u32(frame.pack1.w); }
fn gParity() -> u32 { return u32(frame.pack2.x); }

fn touchScene() { _ = sceneData[0]; _ = frameData[0]; _ = mats[0]; }
const PI = 3.14159265359;
var<private> rngState: u32;
fn seedRng(s: u32) { rngState = s * 747796405u + 2891336453u; }
fn rnd() -> f32 {
  rngState = rngState * 747796405u + 2891336453u;
  var word = ((rngState >> ((rngState >> 28u) + 4u)) ^ rngState) * 277803737u;
  word = (word >> 22u) ^ word;
  return f32(word) / 4294967296.0;
}
fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

struct Hit { t: f32, inst: u32, tri: u32, u: f32, v: f32 };
fn rayBox(o: vec3f, invD: vec3f, mn: vec3f, mx: vec3f, tMax: f32) -> bool {
  let t0 = (mn - o) * invD; let t1 = (mx - o) * invD;
  let a = min(t0, t1); let b = max(t0, t1);
  return max(max(a.x, a.y), a.z) <= min(min(b.x, b.y), min(b.z, tMax));
}
fn triHit(o: vec3f, d: vec3f, tr: Tri, tMax: f32) -> vec3f {
  let e1 = tr.b.xyz - tr.a.xyz; let e2 = tr.c.xyz - tr.a.xyz;
  let p = cross(d, e2); let det = dot(e1, p);
  if (abs(det) < 1e-12) { return vec3f(-1.0); }
  let inv = 1.0 / det; let s = o - tr.a.xyz;
  let u = dot(s, p) * inv; if (u < -1e-6 || u > 1.000001) { return vec3f(-1.0); }
  let q = cross(s, e1); let v = dot(d, q) * inv;
  if (v < -1e-6 || u + v > 1.000001) { return vec3f(-1.0); }
  let t = dot(e2, q) * inv;
  if (t < 0.0 || t > tMax) { return vec3f(-1.0); }
  return vec3f(t, u, v);
}
fn traceScene(ro: vec3f, rd: vec3f, tMaxIn: f32) -> Hit {
  var hit = Hit(tMaxIn, 0u, 0u, 0.0, 0.0);
  let invD = 1.0 / rd;
  var tstack: array<u32, 48>; tstack[0] = 0u; var sp = 1;
  while (sp > 0) {
    sp -= 1; let node = getTlas(tstack[sp]);
    if (!rayBox(ro, invD, node.mn.xyz, node.mx.xyz, hit.t)) { continue; }
    let left = u32(node.mn.w); let cnt = u32(node.mx.w);
    if (cnt == 0u) { if (sp < 46) { tstack[sp] = left + 1u; tstack[sp+1] = left; sp += 2; } continue; }
    for (var ii = left; ii < left + cnt; ii++) {
      let inst = getInst(ii);
      let oL = (inst.inv * vec4f(ro, 1.0)).xyz;
      var dL = (inst.inv * vec4f(rd, 0.0)).xyz;
      let dl = length(dL); if (dl < 1e-12) { continue; } dL /= dl;
      let invL = 1.0 / dL;
      var bstack: array<u32, 64>; bstack[0] = u32(inst.info.x); var bp = 1;
      while (bp > 0) {
        bp -= 1; let bn = getBlas(bstack[bp]);
        if (!rayBox(oL, invL, bn.mn.xyz, bn.mx.xyz, hit.t * dl + 1.0)) { continue; }
        let bl = u32(bn.mn.w); let bc = u32(bn.mx.w);
        if (bc == 0u) { if (bp < 62) { bstack[bp] = bl + 1u; bstack[bp+1] = bl; bp += 2; } continue; }
        for (var ti = bl; ti < bl + bc; ti++) {
          let tr = getTri(ti);
          let r = triHit(oL, dL, tr, hit.t * dl + 1.0);
          if (r.x < 0.0) { continue; }
          let wp = (inst.m * vec4f(oL + dL * r.x, 1.0)).xyz;
          let wt = distance(wp, ro);
          if (wt < hit.t && wt > 1e-5) { hit.t = wt; hit.inst = ii; hit.tri = ti; hit.u = r.y; hit.v = r.z; }
        }
      }
    }
  }
  return hit;
}
fn anyHit(ro: vec3f, rd: vec3f, tMax: f32) -> bool {
  return traceScene(ro + rd * 1e-4, rd, tMax).t < tMax;
}
fn hitPoint(ro: vec3f, rd: vec3f, h: Hit) -> vec3f { return ro + rd * h.t; }
fn hitNormal(h: Hit) -> vec3f {
  return normalize((getInst(h.inst).m * vec4f(getTri(h.tri).n.xyz, 0.0)).xyz);
}
fn hitMaterial(h: Hit) -> Material {
  var mi = u32(getTri(h.tri).a.w);
  let ov = i32(getInst(h.inst).info.z);
  if (ov >= 0) { mi = u32(ov); }
  return mats[mi];
}
fn skyColor(d: vec3f) -> vec3f {
  let h = clamp(d.z, -1.0, 1.0);
  let zen = vec3f(0.18, 0.32, 0.62); let hor = vec3f(0.74, 0.80, 0.88); let gnd = vec3f(0.32, 0.30, 0.28);
  var c = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h < 0.0) { c = mix(hor, gnd, clamp(-h * 2.5, 0.0, 1.0)); }
  let s = max(dot(d, frame.sunDir.xyz), 0.0);
  c += frame.sunColor.rgb * (pow(s, 900.0) * 18.0 + pow(s, 18.0) * 0.22);
  return c * frame.misc4.y;
}
fn basis(n: vec3f) -> mat3x3f {
  let a = select(vec3f(1.0,0.0,0.0), vec3f(0.0,1.0,0.0), abs(n.x) > 0.9);
  let t = normalize(cross(a, n)); let b = cross(n, t);
  return mat3x3f(t, b, n);
}
fn cosineDir(n: vec3f) -> vec3f {
  let r1 = rnd(); let r2 = rnd(); let phi = 2.0 * PI * r1; let r = sqrt(r2);
  return basis(n) * vec3f(r * cos(phi), r * sin(phi), sqrt(max(0.0, 1.0 - r2)));
}
fn ggxDir(n: vec3f, wo: vec3f, rough: f32) -> vec3f {
  let a = rough * rough; let r1 = rnd(); let r2 = rnd();
  let phi = 2.0 * PI * r1; let cosT = sqrt((1.0 - r2) / (1.0 + (a*a - 1.0) * r2));
  let sinT = sqrt(max(0.0, 1.0 - cosT*cosT));
  let h = basis(n) * vec3f(sinT * cos(phi), sinT * sin(phi), cosT);
  return reflect(-wo, h);
}
fn ggxPdf(n: vec3f, wo: vec3f, wi: vec3f, rough: f32) -> f32 {
  let h = normalize(wo + wi); let a = rough * rough; let a2 = a * a;
  let ndh = max(dot(n, h), 0.0); let denom = ndh*ndh*(a2 - 1.0) + 1.0;
  let D = a2 / (PI * denom * denom);
  return D * ndh / max(4.0 * max(dot(wo, h), 0.0), 1e-6);
}
fn evalBsdf(mat: Material, n: vec3f, wo: vec3f, wi: vec3f) -> vec3f {
  let alb = mat.albedoRough.rgb; let rough = clamp(mat.albedoRough.w, 0.03, 1.0); let metal = mat.emissionMetal.w;
  let ndl = max(dot(n, wi), 0.0); if (ndl <= 0.0) { return vec3f(0.0); }
  let h = normalize(wo + wi); let a = rough*rough; let a2 = a*a;
  let ndh = max(dot(n,h),0.0); let denom = ndh*ndh*(a2-1.0)+1.0;
  let D = a2/(PI*denom*denom);
  let k = a*0.5; let ndv = max(dot(n,wo),0.0);
  let G = (ndl/(ndl*(1.0-k)+k)) * (ndv/(ndv*(1.0-k)+k));
  let F0 = mix(vec3f(0.04), alb, metal);
  let F = F0 + (1.0 - F0) * pow(1.0 - max(dot(h, wo), 0.0), 5.0);
  let spec = D * G * F / max(4.0 * ndl * ndv, 1e-6);
  return (alb * (1.0 - metal) / PI + spec) * ndl;
}
fn bsdfPdf(mat: Material, n: vec3f, wo: vec3f, wi: vec3f) -> f32 {
  let rough = clamp(mat.albedoRough.w, 0.03, 1.0); let metal = mat.emissionMetal.w;
  let specW = clamp(0.25 + 0.75 * metal + (1.0 - rough) * 0.35, 0.05, 0.95);
  return mix(max(dot(n, wi), 0.0) / PI, ggxPdf(n, wo, wi, rough), specW) + 1e-6;
}
struct Bsdf { f: vec3f, pdf: f32, wi: vec3f, spec: bool };
fn sampleBsdf(mat: Material, n: vec3f, wo: vec3f) -> Bsdf {
  let rough = clamp(mat.albedoRough.w, 0.03, 1.0); let metal = mat.emissionMetal.w;
  let specW = clamp(0.25 + 0.75 * metal + (1.0 - rough) * 0.35, 0.05, 0.95);
  var out: Bsdf;
  if (rnd() < specW) {
    out.wi = ggxDir(n, wo, rough); out.spec = true;
    if (dot(out.wi, n) <= 0.0) { out.wi = cosineDir(n); out.spec = false; }
  } else { out.wi = cosineDir(n); out.spec = false; }
  out.pdf = bsdfPdf(mat, n, wo, out.wi);
  out.f = evalBsdf(mat, n, wo, out.wi);
  return out;
}
fn nee(x: vec3f, n: vec3f, mat: Material, wo: vec3f) -> vec3f {
  var c = vec3f(0.0);
  let sd = frame.sunDir.xyz;
  if (!anyHit(x + n * 1e-3, sd, 600.0)) {
    c += evalBsdf(mat, n, wo, sd) * frame.sunColor.rgb * frame.misc4.x;
  }
  let count = u32(frame.misc4.z);
  if (count > 0u) {
    let li = min(count - 1u, u32(rnd() * f32(count)));
    let lp = frame.lightPos[li].xyz; let toL = lp - x; let dist = length(toL); let dir = toL / dist;
    if (dot(n, dir) > 0.0 && !anyHit(x + n * 1e-3, dir, dist - 0.05)) {
      c += evalBsdf(mat, n, wo, dir) * frame.lightCol[li].rgb * (frame.lightPos[li].w / max(dist * dist, 0.01)) * f32(count);
    }
  }
  return c;
}
fn targetPdf(x: vec3f, n: vec3f, r: Reservoir) -> f32 {
  if (r.info.y <= 0.0) { return 0.0; }
  let toY = r.pos.xyz - x; let d = length(toY); if (d < 1e-4) { return 0.0; }
  return lum(r.rad.xyz) * max(dot(n, toY / d), 0.0) + 1e-6;
}
