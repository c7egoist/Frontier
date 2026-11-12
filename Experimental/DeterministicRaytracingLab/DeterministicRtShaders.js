// Frontier Engine — 100% Deterministic WebGPU Full Raytracing Shaders (WGSL)
// Zero Monte Carlo RNG | Zero Russian Roulette | 4-Wide SIMD BVH4 + Fibonacci DDGI + Analytic LTC + Cone-Footprint Specular & Glass

export const COMMON_WGSL = /* wgsl */ `
struct FrameUniforms {
  camPosFov      : vec4<f32>, // xyz: camPos, w: tanHalfFov
  camFwdAspect   : vec4<f32>, // xyz: camFwd, w: aspect
  camRightSplit  : vec4<f32>, // xyz: camRight, w: splitRatio
  camUpViewMode  : vec4<f32>, // xyz: camUp, w: viewMode (0=Split,1=FullRT,2=ClayGI,3=Probes3D,4=ReflGlass,5=BvhHeat)
  sunDirRadius   : vec4<f32>, // xyz: sunDir, w: sunAreaRadius
  paintBounces   : vec4<f32>, // xyz: paintColor, w: maxSpecBounces
  resFilter      : vec4<f32>, // x: width, y: height, z: filterStep, w: frameIndex
  ddgiOriginRays : vec4<f32>, // xyz: origin (-15.5,-11.5,0.42), w: probeRayCount (32 or 64)
  ddgiSpaceHyst  : vec4<f32>, // xyz: spacing (1.63,1.53,0.96), w: hysteresis (0..0.92)
  lightKnobs     : vec4<f32>, // x: portalGain, y: ddgiGain, z: shadowRays, w: aoRays
  flagsA         : vec4<f32>, // x: enableDdgi, y: enableLtc, z: enableSoftShadow, w: enableContactAo
  flagsB         : vec4<f32>, // x: enableGlassRefract, y: show3dProbes, z: ddgiReadBounce, w: probeSliceIdx (-1=all, 0..3=slice)
};

struct Bvh4Node {
  cMinX  : vec4<f32>,
  cMaxX  : vec4<f32>,
  cMinY  : vec4<f32>,
  cMaxY  : vec4<f32>,
  cMinZ  : vec4<f32>,
  cMaxZ  : vec4<f32>,
  cIndex : vec4<f32>,
  cCount : vec4<f32>,
};

struct PackedTri {
  v0Mat : vec4<f32>, // xyz: p0, w: matId
  e1N0  : vec4<f32>, // xyz: e1, w: octN0
  e2N1  : vec4<f32>, // xyz: e2, w: octN1
  uvN2  : vec4<f32>, // w: octN2
};

struct InstanceGpu {
  l2w      : mat4x4<f32>,
  w2l      : mat4x4<f32>,
  instInfo : vec4<i32>,  // x: matOverride, y: meshIdx
};

@group(0) @binding(0) var<uniform> u : FrameUniforms;
@group(0) @binding(1) var<storage, read> bvh4Nodes : array<Bvh4Node>;
@group(0) @binding(2) var<storage, read> tris      : array<PackedTri>;
@group(0) @binding(3) var<storage, read> instances : array<InstanceGpu>;
@group(0) @binding(4) var<storage, read> ddgiRead  : array<vec4<f32>>;

const PI       : f32 = 3.14159265359;
const INV_PI   : f32 = 0.31830988618;
const DDGI_NX  : i32 = 20;
const DDGI_NY  : i32 = 16;
const DDGI_NZ  : i32 = 6;

fn safeInvDir(d : vec3<f32>) -> vec3<f32> {
  let sx = select(-1e-8, 1e-8, d.x >= 0.0);
  let sy = select(-1e-8, 1e-8, d.y >= 0.0);
  let sz = select(-1e-8, 1e-8, d.z >= 0.0);
  return vec3<f32>(
    1.0 / select(sx, d.x, abs(d.x) > 1e-8),
    1.0 / select(sy, d.y, abs(d.y) > 1e-8),
    1.0 / select(sz, d.z, abs(d.z) > 1e-8)
  );
}

fn unpackOct20(packed : f32) -> vec3<f32> {
  let p = u32(round(packed));
  let u0 = (f32(p & 1023u) / 1023.0) * 2.0 - 1.0;
  let v0 = (f32((p >> 10u) & 1023u) / 1023.0) * 2.0 - 1.0;
  var n = vec3<f32>(u0, v0, 1.0 - abs(u0) - abs(v0));
  if (n.z < 0.0) {
    let ox = n.x;
    let oy = n.y;
    n.x = (1.0 - abs(oy)) * select(-1.0, 1.0, ox >= 0.0);
    n.y = (1.0 - abs(ox)) * select(-1.0, 1.0, oy >= 0.0);
  }
  return normalize(n);
}

fn xformPt(m : mat4x4<f32>, p : vec3<f32>) -> vec3<f32> {
  return (m * vec4<f32>(p, 1.0)).xyz;
}

fn xformVec(m : mat4x4<f32>, v : vec3<f32>) -> vec3<f32> {
  return (m * vec4<f32>(v, 0.0)).xyz;
}

struct RtHit {
  hit   : bool,
  t     : f32,
  pos   : vec3<f32>,
  nrm   : vec3<f32>,
  matId : i32,
  steps : i32,
};

fn traceBvh4(worldRo : vec3<f32>, worldRd : vec3<f32>, tMin : f32, tMax : f32, skipGlass : bool) -> RtHit {
  var best : RtHit;
  best.hit = false;
  best.t = tMax;
  best.pos = vec3<f32>(0.0);
  best.nrm = vec3<f32>(0.0, 0.0, 1.0);
  best.matId = 0;
  best.steps = 0;

  var ro = worldRo;
  var rd = worldRd;
  var invD = safeInvDir(rd);
  var activeInst : i32 = -1;

  var stack : array<i32, 32>;
  var sp : i32 = 1;
  stack[0] = 0;

  var guard : i32 = 0;
  while (sp > 0 && guard < 256) {
    guard = guard + 1;
    sp = sp - 1;
    var idx = stack[sp];
    if (idx == -1) {
      activeInst = -1;
      ro = worldRo;
      rd = worldRd;
      invD = safeInvDir(rd);
      continue;
    }
    if (idx <= -10) {
      let packed = -idx - 10;
      let instIdx = packed & 15;
      let blasRoot = packed >> 4;
      activeInst = instIdx;
      let w2l = instances[instIdx].w2l;
      ro = xformPt(w2l, worldRo);
      rd = xformVec(w2l, worldRd);
      invD = safeInvDir(rd);
      if (sp < 31) {
        stack[sp] = -1;
        sp = sp + 1;
      }
      idx = blasRoot;
    }

    best.steps = best.steps + 1;
    let n = bvh4Nodes[idx];

    let t0x = (n.cMinX - vec4<f32>(ro.x)) * invD.x;
    let t1x = (n.cMaxX - vec4<f32>(ro.x)) * invD.x;
    let t0y = (n.cMinY - vec4<f32>(ro.y)) * invD.y;
    let t1y = (n.cMaxY - vec4<f32>(ro.y)) * invD.y;
    let t0z = (n.cMinZ - vec4<f32>(ro.z)) * invD.z;
    let t1z = (n.cMaxZ - vec4<f32>(ro.z)) * invD.z;

    let tNear4 = max(max(min(t0x, t1x), min(t0y, t1y)), max(min(t0z, t1z), vec4<f32>(tMin)));
    let tFar4  = min(min(max(t0x, t1x), max(t0y, t1y)), min(max(t0z, t1z), vec4<f32>(best.t)));

    var hitT   : array<f32, 4>;
    var hitSlot: array<i32, 4>;
    var hitCnt : i32 = 0;

    for (var k : i32 = 0; k < 4; k = k + 1) {
      if (n.cMinX[k] <= n.cMaxX[k] && tNear4[k] <= tFar4[k]) {
        hitT[hitCnt] = tNear4[k];
        hitSlot[hitCnt] = k;
        hitCnt = hitCnt + 1;
      }
    }

    // Sort descending so nearest child sits on top of LIFO stack
    for (var i : i32 = 0; i < hitCnt - 1; i = i + 1) {
      for (var j : i32 = i + 1; j < hitCnt; j = j + 1) {
        if (hitT[i] < hitT[j]) {
          let tmpT = hitT[i]; hitT[i] = hitT[j]; hitT[j] = tmpT;
          let tmpS = hitSlot[i]; hitSlot[i] = hitSlot[j]; hitSlot[j] = tmpS;
        }
      }
    }

    for (var h : i32 = 0; h < hitCnt; h = h + 1) {
      let k = hitSlot[h];
      let cnt = i32(round(n.cCount[k]));
      let cIdx = i32(round(n.cIndex[k]));
      if (cnt == 0) {
        if (sp < 31) {
          stack[sp] = cIdx;
          sp = sp + 1;
        }
      } else if (cnt < 0) {
        let instIdx = (-cnt) - 1;
        if (sp < 31) {
          stack[sp] = -(10 + ((cIdx << 4) | instIdx));
          sp = sp + 1;
        }
      } else {
        for (var ti : i32 = 0; ti < cnt; ti = ti + 1) {
          let tr = tris[cIdx + ti];
          var triMat = i32(round(tr.v0Mat.w));
          if (activeInst >= 0 && instances[activeInst].instInfo.x >= 0) {
            triMat = instances[activeInst].instInfo.x;
          }
          if (skipGlass && triMat == 7) {
            continue;
          }
          let p0 = tr.v0Mat.xyz;
          let e1 = tr.e1N0.xyz;
          let e2 = tr.e2N1.xyz;
          let pv = cross(rd, e2);
          let det = dot(e1, pv);
          if (abs(det) < 1e-8) {
            continue;
          }
          let invDet = 1.0 / det;
          let tv = ro - p0;
          let bu = dot(tv, pv) * invDet;
          if (bu < 0.0 || bu > 1.0) {
            continue;
          }
          let qv = cross(tv, e1);
          let bv = dot(rd, qv) * invDet;
          if (bv < 0.0 || bu + bv > 1.0) {
            continue;
          }
          let tt = dot(e2, qv) * invDet;
          if (tt > tMin && tt < best.t) {
            best.hit = true;
            best.t = tt;
            best.matId = triMat;
            let n0 = unpackOct20(tr.e1N0.w);
            let n1 = unpackOct20(tr.e2N1.w);
            let n2 = unpackOct20(tr.uvN2.w);
            let ln = normalize(n0 * (1.0 - bu - bv) + n1 * bu + n2 * bv);
            if (activeInst >= 0) {
              best.nrm = normalize(xformVec(instances[activeInst].l2w, ln));
            } else {
              best.nrm = ln;
            }
            best.pos = worldRo + worldRd * tt;
          }
        }
      }
    }
  }
  return best;
}

struct SurfaceMat {
  albedo    : vec3<f32>,
  roughness : f32,
  metalness : f32,
  emissive  : vec3<f32>,
  coat      : f32,
  coatRough : f32,
};

fn evalMat(matId : i32, pos : vec3<f32>, paint : vec3<f32>) -> SurfaceMat {
  var m : SurfaceMat;
  m.albedo = vec3<f32>(0.5);
  m.roughness = 0.5;
  m.metalness = 0.0;
  m.emissive = vec3<f32>(0.0);
  m.coat = 0.0;
  m.coatRough = 0.04;

  if (matId == 1) {
    let gx = abs(pos.x * 0.5 - floor(pos.x * 0.5 + 0.5));
    let gy = abs(pos.y * 0.5 - floor(pos.y * 0.5 + 0.5));
    let line = (1.0 - smoothstep(0.0, 0.016, min(gx, gy))) * 0.08;
    m.albedo = vec3<f32>(0.50, 0.52, 0.55) + vec3<f32>(line);
    m.roughness = 0.30;
    m.metalness = 0.04;
    m.coat = 0.38;
    m.coatRough = 0.14;
  } else if (matId == 2) {
    m.albedo = vec3<f32>(0.93, 0.95, 0.98);
    m.roughness = 0.025;
    m.metalness = 0.96;
  } else if (matId == 3) {
    m.albedo = vec3<f32>(0.96, 0.77, 0.35);
    m.roughness = 0.04;
    m.metalness = 0.94;
  } else if (matId == 4) {
    m.albedo = vec3<f32>(0.66, 0.68, 0.72);
    m.roughness = 0.42;
    m.metalness = 0.12;
  } else if (matId == 5) {
    m.albedo = vec3<f32>(1.0);
    m.roughness = 0.10;
    m.emissive = vec3<f32>(9.5, 10.2, 11.5);
  } else if (matId == 6) {
    m.albedo = paint;
    m.roughness = 0.11;
    m.metalness = 0.22;
    m.coat = 1.0;
    m.coatRough = 0.025;
  } else if (matId == 7) {
    m.albedo = vec3<f32>(0.06, 0.10, 0.14);
    m.roughness = 0.015;
    m.coat = 1.0;
    m.coatRough = 0.015;
  } else if (matId == 8 || matId == 15 || matId == 16) {
    m.albedo = vec3<f32>(0.14, 0.15, 0.17);
    m.roughness = 0.42;
    m.metalness = 0.30;
  } else if (matId == 9 || matId == 10) {
    m.albedo = vec3<f32>(0.90, 0.92, 0.96);
    m.roughness = select(0.12, 0.05, matId == 10);
    m.metalness = 0.92;
  } else if (matId == 11) {
    m.albedo = vec3<f32>(0.048, 0.050, 0.055);
    m.roughness = 0.60;
    m.metalness = 0.02;
  } else if (matId == 12 || matId == 13) {
    m.albedo = vec3<f32>(0.90, 0.95, 1.0);
    m.roughness = 0.04;
    m.emissive = vec3<f32>(9.0, 9.6, 11.0);
    m.coat = 1.0;
  } else if (matId == 14) {
    m.albedo = vec3<f32>(0.65, 0.03, 0.04);
    m.roughness = 0.05;
    m.emissive = vec3<f32>(8.5, 0.45, 0.35);
    m.coat = 1.0;
  } else if (matId == 17) {
    m.albedo = vec3<f32>(0.92, 0.28, 0.05);
    m.roughness = 0.16;
    m.metalness = 0.10;
    m.coat = 0.65;
    m.coatRough = 0.07;
  } else if (matId == 18) {
    m.albedo = vec3<f32>(0.94, 0.05, 0.07);
    m.roughness = 0.85;
  } else if (matId == 19) {
    m.albedo = vec3<f32>(0.04, 0.68, 0.95);
    m.roughness = 0.85;
  } else if (matId == 20) {
    m.albedo = vec3<f32>(0.88, 0.89, 0.91);
    m.roughness = 0.85;
  }
  return m;
}

fn evalSky(dir : vec3<f32>, sunDir : vec3<f32>) -> vec3<f32> {
  let up = clamp(dir.z, -0.2, 1.0);
  let hor = vec3<f32>(0.52, 0.66, 0.86);
  let zen = vec3<f32>(0.09, 0.21, 0.48);
  let gnd = vec3<f32>(0.06, 0.065, 0.075);
  var sky : vec3<f32>;
  if (up >= 0.0) {
    sky = mix(hor, zen, pow(up, 0.58));
  } else {
    sky = mix(hor * 0.45, gnd, clamp(-up * 6.0, 0.0, 1.0));
  }
  let sc = max(dot(dir, sunDir), 0.0);
  return sky + vec3<f32>(1.0, 0.82, 0.56) * (pow(sc, 16.0) * 0.55)
             + vec3<f32>(1.0, 0.93, 0.80) * (smoothstep(0.99935, 0.99985, sc) * 12.0);
}

struct LtcOut {
  diff : vec3<f32>,
  spec : vec3<f32>,
};

fn evalAnalyticLtcPortals(pos : vec3<f32>, nrm : vec3<f32>, viewDir : vec3<f32>, rough : f32, portalGain : f32) -> LtcOut {
  var o : LtcOut;
  o.diff = vec3<f32>(0.0);
  o.spec = vec3<f32>(0.0);
  if (pos.z >= 6.20 || portalGain <= 0.001 || u.flagsA.y < 0.5) {
    return o;
  }
  let reflDir = reflect(-viewDir, nrm);
  let alpha = max(rough * rough, 0.025);
  for (var i : i32 = -1; i <= 1; i = i + 1) {
    let px = f32(i) * 12.5;
    let nearPt = vec3<f32>(clamp(pos.x, px - 0.30, px + 0.30), clamp(pos.y, -13.8, 13.7), 6.22);
    let d = nearPt - pos;
    let dist2 = max(dot(d, d), 0.25);
    let lDir = d * inverseSqrt(dist2);
    let solidAngle = (0.60 * 4.8 * max(-lDir.z, 0.0)) / (dist2 + 3.2);
    o.diff = o.diff + vec3<f32>(1.05, 1.15, 1.35) * (max(dot(nrm, lDir), 0.0) * solidAngle * portalGain);
    if (reflDir.z > 0.02) {
      let tP = (6.22 - pos.z) / reflDir.z;
      let hp = pos + reflDir * tP;
      let dx = max(0.0, abs(hp.x - px) - 0.30);
      let dy = max(0.0, abs(hp.y) - 13.75);
      let cf = max(0.06, tP * alpha * 0.85);
      o.spec = o.spec + vec3<f32>(6.5, 7.2, 8.4) * (exp(-(dx * dx + dy * dy) / (2.0 * cf * cf)) / (1.0 + alpha * 6.0) * portalGain);
    }
  }
  return o;
}

fn octDecode(u0 : f32, v0 : f32) -> vec3<f32> {
  var n = vec3<f32>(u0, v0, 1.0 - abs(u0) - abs(v0));
  if (n.z < 0.0) {
    let ox = n.x;
    let oy = n.y;
    n.x = (1.0 - abs(oy)) * select(-1.0, 1.0, ox >= 0.0);
    n.y = (1.0 - abs(ox)) * select(-1.0, 1.0, oy >= 0.0);
  }
  return normalize(n);
}

fn octEncode01(d : vec3<f32>) -> vec2<f32> {
  let l1 = abs(d.x) + abs(d.y) + abs(d.z) + 1e-8;
  var ox = d.x / l1;
  var oy = d.y / l1;
  if (d.z < 0.0) {
    let tx = (1.0 - abs(oy)) * select(-1.0, 1.0, ox >= 0.0);
    let ty = (1.0 - abs(ox)) * select(-1.0, 1.0, oy >= 0.0);
    ox = tx;
    oy = ty;
  }
  return vec2<f32>(ox * 0.5 + 0.5, oy * 0.5 + 0.5);
}

fn ddgiProbePos(ix : i32, iy : i32, iz : i32) -> vec3<f32> {
  return u.ddgiOriginRays.xyz + vec3<f32>(f32(ix), f32(iy), f32(iz)) * u.ddgiSpaceHyst.xyz;
}

fn sampleProbeOctIrr(pIdx : i32, dir : vec3<f32>) -> vec3<f32> {
  let uv = octEncode01(dir);
  let fx = clamp(uv.x * 6.0 - 0.5, 0.0, 4.999);
  let fy = clamp(uv.y * 6.0 - 0.5, 0.0, 4.999);
  let x0 = i32(fx);
  let y0 = i32(fy);
  let x1 = min(x0 + 1, 5);
  let y1 = min(y0 + 1, 5);
  let tx = fx - f32(x0);
  let ty = fy - f32(y0);
  let base = pIdx * 36;
  let c00 = ddgiRead[(base + y0 * 6 + x0) * 2].xyz;
  let c10 = ddgiRead[(base + y0 * 6 + x1) * 2].xyz;
  let c01 = ddgiRead[(base + y1 * 6 + x0) * 2].xyz;
  let c11 = ddgiRead[(base + y1 * 6 + x1) * 2].xyz;
  return mix(mix(c00, c10, tx), mix(c01, c11, tx), ty);
}

fn sampleProbeOctDist(pIdx : i32, dir : vec3<f32>) -> vec2<f32> {
  let uv = octEncode01(dir);
  let fx = clamp(uv.x * 6.0 - 0.5, 0.0, 4.999);
  let fy = clamp(uv.y * 6.0 - 0.5, 0.0, 4.999);
  let x0 = i32(fx);
  let y0 = i32(fy);
  let x1 = min(x0 + 1, 5);
  let y1 = min(y0 + 1, 5);
  let tx = fx - f32(x0);
  let ty = fy - f32(y0);
  let base = pIdx * 36;
  let i00 = (base + y0 * 6 + x0) * 2;
  let i10 = (base + y0 * 6 + x1) * 2;
  let i01 = (base + y1 * 6 + x0) * 2;
  let i11 = (base + y1 * 6 + x1) * 2;
  let d00 = vec2<f32>(ddgiRead[i00].w, ddgiRead[i00 + 1].x);
  let d10 = vec2<f32>(ddgiRead[i10].w, ddgiRead[i10 + 1].x);
  let d01 = vec2<f32>(ddgiRead[i01].w, ddgiRead[i01 + 1].x);
  let d11 = vec2<f32>(ddgiRead[i11].w, ddgiRead[i11 + 1].x);
  return mix(mix(d00, d10, tx), mix(d01, d11, tx), ty);
}

fn sampleWorldIrradiance(pos : vec3<f32>, nrm : vec3<f32>, vBias : vec3<f32>) -> vec3<f32> {
  if (u.flagsA.x < 0.5) {
    return vec3<f32>(0.10, 0.13, 0.18);
  }
  let biased = pos + nrm * 0.22 + vBias * 0.08;
  let rel = (biased - u.ddgiOriginRays.xyz) / u.ddgiSpaceHyst.xyz;
  let gx = clamp(rel.x, 0.0, f32(DDGI_NX) - 1.001);
  let gy = clamp(rel.y, 0.0, f32(DDGI_NY) - 1.001);
  let gz = clamp(rel.z, 0.0, f32(DDGI_NZ) - 1.001);
  let x0 = i32(gx);
  let y0 = i32(gy);
  let z0 = i32(gz);
  let fx = gx - f32(x0);
  let fy = gy - f32(y0);
  let fz = gz - f32(z0);

  var sumIrr = vec3<f32>(0.0);
  var sumW   = 0.0;
  for (var dz : i32 = 0; dz <= 1; dz = dz + 1) {
    for (var dy : i32 = 0; dy <= 1; dy = dy + 1) {
      for (var dx : i32 = 0; dx <= 1; dx = dx + 1) {
        let ix = min(x0 + dx, DDGI_NX - 1);
        let iy = min(y0 + dy, DDGI_NY - 1);
        let iz = min(z0 + dz, DDGI_NZ - 1);
        let pIdx = (iz * DDGI_NY + iy) * DDGI_NX + ix;
        let pPos = ddgiProbePos(ix, iy, iz);
        let toP = pPos - pos;
        let dist = length(toP);
        let dir = select(nrm, toP / max(dist, 1e-4), dist > 1e-4);

        let wrap = max(0.001, (dot(dir, nrm) + 0.25) / 1.25);
        var w = wrap * wrap + 0.002;

        let mom = sampleProbeOctDist(pIdx, -dir);
        if (dist > mom.x) {
          let variance = max(abs(mom.y - mom.x * mom.x), 0.02);
          let diff = dist - mom.x;
          let cheb = variance / (variance + diff * diff);
          w = w * max(cheb * cheb * cheb, 0.005);
        }

        let wx = select(1.0 - fx, fx, dx == 1);
        let wy = select(1.0 - fy, fy, dy == 1);
        let wz = select(1.0 - fz, fz, dz == 1);
        w = w * max(wx * wy * wz, 0.001);

        sumIrr = sumIrr + sampleProbeOctIrr(pIdx, nrm) * w;
        sumW = sumW + w;
      }
    }
  }
  return select(vec3<f32>(0.10, 0.12, 0.16), sumIrr / sumW, sumW > 0.0);
}

fn shadeSurfaceDirectAndGi(
  pos : vec3<f32>,
  nrm : vec3<f32>,
  matId : i32,
  viewDir : vec3<f32>,
  sunVis : f32,
  contactAo : f32,
  clayMode : bool
) -> vec3<f32> {
  var m = evalMat(matId, pos, u.paintBounces.xyz);
  if (clayMode && matId != 5 && matId != 18 && matId != 19) {
    m.albedo = vec3<f32>(0.84, 0.85, 0.87);
    m.metalness = 0.0;
    m.coat = 0.0;
    m.roughness = 0.88;
    m.emissive = vec3<f32>(0.0);
  }

  let effRough = select(m.roughness, m.coatRough, m.coat > 0.0);
  var ltc = evalAnalyticLtcPortals(pos, nrm, viewDir, effRough, u.lightKnobs.x);
  if (clayMode) {
    ltc.spec = vec3<f32>(0.0);
  }

  let aoTerm = select(1.0, contactAo, u.flagsA.w > 0.5);
  let ddgiIrr = sampleWorldIrradiance(pos, nrm, viewDir) * (u.lightKnobs.y * aoTerm);

  let sunDir = u.sunDirRadius.xyz;
  let ndl = max(dot(nrm, sunDir), 0.0);
  let sunIrr = vec3<f32>(4.4, 3.95, 3.40) * (ndl * sunVis);

  let f0 = mix(vec3<f32>(0.04), m.albedo, m.metalness);
  let h = normalize(sunDir + viewDir);
  let ndh = max(dot(nrm, h), 0.0);
  let rBlend = select(m.roughness, mix(m.roughness, m.coatRough, m.coat * 0.70), m.coat > 0.0);
  let r = max(rBlend, 0.035);
  let a2 = r * r * r * r;
  let den = ndh * ndh * (a2 - 1.0) + 1.0;
  let ggx = a2 / max(PI * den * den, 1e-4);
  let sunSpec = select(
    f0 * vec3<f32>(3.5, 3.15, 2.75) * (min(ggx * 0.22, 16.0) * ndl * sunVis),
    vec3<f32>(0.0),
    clayMode
  );

  let diffAlbedo = m.albedo * (1.0 - m.metalness);
  return m.emissive
       + diffAlbedo * ((sunIrr + ltc.diff * aoTerm) * INV_PI + ddgiIrr)
       + sunSpec
       + ltc.spec * select(0.22, 0.0, clayMode);
}

fn makeCamRay(px : f32, py : f32) -> vec3<f32> {
  let uvx = ((px + 0.5) / u.resFilter.x) * 2.0 - 1.0;
  let uvy = 1.0 - ((py + 0.5) / u.resFilter.y) * 2.0;
  return normalize(
    u.camFwdAspect.xyz +
    u.camRightSplit.xyz * (uvx * u.camFwdAspect.w * u.camPosFov.w) +
    u.camUpViewMode.xyz * (uvy * u.camPosFov.w)
  );
}
`;

// ============================================================================
// Pass 1: Deterministic Spherical-Fibonacci DDGI Probe Update (64 threads = 1 probe)
// ============================================================================
export const DDGI_PROBE_UPDATE_WGSL = COMMON_WGSL + /* wgsl */ `
@group(1) @binding(0) var<storage, read_write> ddgiWrite : array<vec4<f32>>;

var<workgroup> sharedRad  : array<vec3<f32>, 64>;
var<workgroup> sharedDist : array<f32, 64>;

@compute @workgroup_size(64, 1, 1)
fn main(
  @builtin(workgroup_id) wgId : vec3<u32>,
  @builtin(local_invocation_id) lidVec : vec3<u32>
) {
  let pIdx = i32(wgId.x);
  let lid = i32(lidVec.x);
  let validProbe = pIdx < (DDGI_NX * DDGI_NY * DDGI_NZ);
  let sliceMode = i32(round(u.flagsB.w));
  let activeSlice = validProbe && ((sliceMode < 0) || ((pIdx & 3) == sliceMode));

  let rayCount = clamp(i32(round(u.ddgiOriginRays.w)), 16, 64);
  let ix = pIdx % DDGI_NX;
  let iy = (pIdx / DDGI_NX) % DDGI_NY;
  let iz = pIdx / (DDGI_NX * DDGI_NY);
  let pOrigin = ddgiProbePos(ix, iy, iz);
  let sunDir = u.sunDirRadius.xyz;

  if (activeSlice && lid < rayCount) {
    // Deterministic Spherical Fibonacci Lattice (ZERO RNG!)
    let z = 1.0 - 2.0 * (f32(lid) + 0.5) / f32(rayCount);
    let r = sqrt(max(0.0, 1.0 - z * z));
    let phi = f32(lid) * 2.39996323;
    let dir = vec3<f32>(r * cos(phi), r * sin(phi), z);

    let h = traceBvh4(pOrigin, dir, 0.02, 42.0, true);
    if (!h.hit) {
      sharedRad[lid] = evalSky(dir, sunDir) * 0.52;
      sharedDist[lid] = 24.0;
    } else if (dot(h.nrm, dir) > 0.0) {
      sharedRad[lid] = vec3<f32>(0.0);
      sharedDist[lid] = h.t * 0.20;
    } else {
      sharedDist[lid] = h.t;
      let sm = evalMat(h.matId, h.pos, u.paintBounces.xyz);
      var sunVis = 0.0;
      if (dot(h.nrm, sunDir) > 0.02) {
        let sh = traceBvh4(h.pos + h.nrm * 0.01, sunDir, 0.008, 36.0, true);
        sunVis = select(1.0, 0.0, sh.hit);
      }
      let ltc = evalAnalyticLtcPortals(h.pos, h.nrm, -dir, sm.roughness, u.lightKnobs.x);
      let sunIrr = vec3<f32>(4.4, 3.95, 3.40) * (max(dot(h.nrm, sunDir), 0.0) * sunVis);
      var multiBounce = vec3<f32>(0.12, 0.16, 0.22);
      if (u.flagsB.z > 0.5) {
        multiBounce = sampleWorldIrradiance(h.pos, h.nrm, -dir) * 0.85;
      }
      let diffTint = select(
        sm.albedo * (1.0 - sm.metalness),
        mix(sm.albedo * (1.0 - sm.metalness), sm.albedo * 0.68, 0.65),
        h.matId == 6
      );
      sharedRad[lid] = clamp(sm.emissive + diffTint * ((sunIrr + ltc.diff) * INV_PI + multiBounce), vec3<f32>(0.0), vec3<f32>(18.0));
    }
  } else {
    sharedRad[lid] = vec3<f32>(0.0);
    sharedDist[lid] = 24.0;
  }

  workgroupBarrier();

  if (!validProbe) {
    return;
  }
  if (!activeSlice) {
    if (lid < 36) {
      let idx2 = (pIdx * 36 + lid) * 2;
      ddgiWrite[idx2]     = ddgiRead[idx2];
      ddgiWrite[idx2 + 1] = ddgiRead[idx2 + 1];
    }
    return;
  }

  if (lid < 36) {
    let tx = lid % 6;
    let ty = lid / 6;
    let u0 = ((f32(tx) + 0.5) / 6.0) * 2.0 - 1.0;
    let v0 = ((f32(ty) + 0.5) / 6.0) * 2.0 - 1.0;
    let texDir = octDecode(u0, v0);

    var irrSum = vec3<f32>(0.0);
    var wIrr = 0.0;
    var dSum = 0.0;
    var d2Sum = 0.0;
    var wDist = 0.0;

    for (var rIdx : i32 = 0; rIdx < rayCount; rIdx = rIdx + 1) {
      let zz = 1.0 - 2.0 * (f32(rIdx) + 0.5) / f32(rayCount);
      let rr = sqrt(max(0.0, 1.0 - zz * zz));
      let pp = f32(rIdx) * 2.39996323;
      let rDir = vec3<f32>(rr * cos(pp), rr * sin(pp), zz);

      let cw = max(0.0, dot(texDir, rDir));
      if (cw > 0.0) {
        irrSum = irrSum + sharedRad[rIdx] * cw;
        wIrr = wIrr + cw;
        let dw = pow(cw, 8.0);
        let cd = min(sharedDist[rIdx], 18.0);
        dSum = dSum + cd * dw;
        d2Sum = d2Sum + cd * cd * dw;
        wDist = wDist + dw;
      }
    }

    let newIrr = select(vec3<f32>(0.0), irrSum / wIrr, wIrr > 0.0);
    let newM1  = select(12.0, dSum / wDist, wDist > 0.0);
    let newM2  = select(144.0, d2Sum / wDist, wDist > 0.0);

    let outIdx = (pIdx * 36 + lid) * 2;
    let hyst = clamp(u.ddgiSpaceHyst.w, 0.0, 0.95);
    if (hyst > 0.001) {
      let prev0 = ddgiRead[outIdx];
      let prev1 = ddgiRead[outIdx + 1];
      ddgiWrite[outIdx]     = vec4<f32>(mix(newIrr, prev0.xyz, hyst), mix(newM1, prev0.w, hyst));
      ddgiWrite[outIdx + 1] = vec4<f32>(mix(newM2, prev1.x, hyst), 0.0, 0.0, 0.0);
    } else {
      ddgiWrite[outIdx]     = vec4<f32>(newIrr, newM1);
      ddgiWrite[outIdx + 1] = vec4<f32>(newM2, 0.0, 0.0, 0.0);
    }
  }
}
`;

// ============================================================================
// Pass 2: Full-Res Primary Camera BVH4 Raytrace + Deterministic Solar Frustum & BVH4 Contact AO
// ============================================================================
export const PRIMARY_AND_SHADOW_WGSL = COMMON_WGSL + /* wgsl */ `
@group(1) @binding(0) var gPosTOut      : texture_storage_2d<rgba32float, write>;
@group(1) @binding(1) var gNrmMatOut    : texture_storage_2d<rgba16float, write>;
@group(1) @binding(2) var gShadowRawOut : texture_storage_2d<rgba16float, write>;

fn bayer4Phase(x : i32, y : i32) -> f32 {
  let bx = u32(x) & 3u;
  let by = u32(y) & 3u;
  let b0 = ((bx ^ by) & 1u) << 3u;
  let b1 = (by & 1u) << 2u;
  let b2 = (((bx >> 1u) ^ (by >> 1u)) & 1u) << 1u;
  let b3 = (by >> 1u) & 1u;
  return (f32(b0 | b1 | b2 | b3) / 16.0) * 6.2831853;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(u.resFilter.x);
  let h = i32(u.resFilter.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) {
    return;
  }

  let rd = makeCamRay(f32(x), f32(y));
  let hit = traceBvh4(u.camPosFov.xyz, rd, 0.10, 180.0, false);

  if (!hit.hit) {
    textureStore(gPosTOut, vec2<i32>(x, y), vec4<f32>(0.0, 0.0, 0.0, -1.0));
    textureStore(gNrmMatOut, vec2<i32>(x, y), vec4<f32>(0.0, 0.0, 1.0, 0.0));
    textureStore(gShadowRawOut, vec2<i32>(x, y), vec4<f32>(1.0, 0.0, 1.0, f32(hit.steps)));
    return;
  }

  textureStore(gPosTOut, vec2<i32>(x, y), vec4<f32>(hit.pos, hit.t));
  textureStore(gNrmMatOut, vec2<i32>(x, y), vec4<f32>(hit.nrm, f32(hit.matId)));

  var totalSteps = hit.steps;
  var vis = 1.0;
  var blocker = 0.0;
  var contactAo = 1.0;

  if (hit.matId != 7) {
    let phase = bayer4Phase(x, y);
    let sunDir = u.sunDirRadius.xyz;

    // 1. Deterministic Vogel-Spiral Solar Frustum Shadow (ZERO RNG!)
    if (dot(hit.nrm, sunDir) <= 0.0) {
      vis = 0.0;
    } else if (u.flagsA.z < 0.5) {
      let sh = traceBvh4(hit.pos + hit.nrm * 0.006, sunDir, 0.004, 45.0, true);
      totalSteps = totalSteps + sh.steps;
      vis = select(1.0, 0.0, sh.hit);
    } else {
      let upS = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(sunDir.z) < 0.92);
      let sunT = normalize(cross(upS, sunDir));
      let sunB = cross(sunDir, sunT);
      let nSh = clamp(i32(round(u.lightKnobs.z)), 1, 12);
      let sunRad = u.sunDirRadius.w * 0.046;
      var vSum = 0.0;
      var bSum = 0.0;
      var bCnt = 0;
      for (var s : i32 = 0; s < nSh; s = s + 1) {
        let r = select(0.0, sqrt((f32(s) + 0.5) / f32(nSh)) * sunRad, nSh > 1);
        let a = phase + f32(s) * 2.39996323;
        let sDir = normalize(sunDir + (sunT * cos(a) + sunB * sin(a)) * r);
        let sh = traceBvh4(hit.pos + hit.nrm * 0.006, sDir, 0.004, 45.0, true);
        totalSteps = totalSteps + sh.steps;
        if (!sh.hit) {
          vSum = vSum + 1.0;
        } else {
          bSum = bSum + sh.t;
          bCnt = bCnt + 1;
        }
      }
      vis = vSum / f32(nSh);
      blocker = select(0.0, bSum / f32(bCnt), bCnt > 0);
    }

    // 2. True Deterministic BVH4 Hemisphere Contact AO (ZERO screen-space rings!)
    if (u.flagsA.w > 0.5) {
      let nAo = clamp(i32(round(u.lightKnobs.w)), 1, 8);
      let upA = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(hit.nrm.z) < 0.92);
      let tA = normalize(cross(upA, hit.nrm));
      let bA = cross(hit.nrm, tA);
      var aoSum = 0.0;
      for (var k : i32 = 0; k < nAo; k = k + 1) {
        let r = sqrt((f32(k) + 0.5) / f32(nAo)) * 0.85;
        let a = phase + f32(k) * 2.39996323;
        let z = sqrt(max(0.05, 1.0 - r * r));
        let aoDir = normalize(tA * (r * cos(a)) + bA * (r * sin(a)) + hit.nrm * z);
        let ah = traceBvh4(hit.pos + hit.nrm * 0.006, aoDir, 0.005, 0.55, true);
        totalSteps = totalSteps + ah.steps;
        aoSum = aoSum + select(1.0, smoothstep(0.02, 0.55, ah.t), ah.hit);
      }
      contactAo = 0.25 + 0.75 * (aoSum / f32(nAo));
    }
  }

  textureStore(gShadowRawOut, vec2<i32>(x, y), vec4<f32>(vis, blocker, contactAo, f32(totalSteps)));
}
`;

// ============================================================================
// Pass 3: Coplanar Blocker Dilation (Smooth Contact-to-Umbra Penumbra Expansion)
// ============================================================================
export const BLOCKER_DILATE_WGSL = COMMON_WGSL + /* wgsl */ `
@group(1) @binding(0) var gPosTTex      : texture_2d<f32>;
@group(1) @binding(1) var gNrmMatTex    : texture_2d<f32>;
@group(1) @binding(2) var gShadowRawTex : texture_2d<f32>;
@group(1) @binding(3) var gShadowOut    : texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(u.resFilter.x);
  let h = i32(u.resFilter.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) {
    return;
  }

  let cPosT = textureLoad(gPosTTex, vec2<i32>(x, y), 0);
  let cRaw  = textureLoad(gShadowRawTex, vec2<i32>(x, y), 0);
  if (cPosT.w < 0.0) {
    textureStore(gShadowOut, vec2<i32>(x, y), cRaw);
    return;
  }
  let cNrm = textureLoad(gNrmMatTex, vec2<i32>(x, y), 0).xyz;
  var maxBlk = cRaw.y;

  for (var dy : i32 = -2; dy <= 2; dy = dy + 1) {
    for (var dx : i32 = -2; dx <= 2; dx = dx + 1) {
      let qx = clamp(x + dx * 2, 0, w - 1);
      let qy = clamp(y + dy * 2, 0, h - 1);
      let qPosT = textureLoad(gPosTTex, vec2<i32>(qx, qy), 0);
      if (qPosT.w > 0.0) {
        let qNrm = textureLoad(gNrmMatTex, vec2<i32>(qx, qy), 0).xyz;
        if (dot(cNrm, qNrm) > 0.85 && abs(dot(cNrm, qPosT.xyz - cPosT.xyz)) < 0.08) {
          let qBlk = textureLoad(gShadowRawTex, vec2<i32>(qx, qy), 0).y;
          maxBlk = max(maxBlk, qBlk * 0.94);
        }
      }
    }
  }
  textureStore(gShadowOut, vec2<i32>(x, y), vec4<f32>(cRaw.x, maxBlk, cRaw.z, cRaw.w));
}
`;

// ============================================================================
// Pass 4: Continuous-Sigma Plane-Aware Shadow & Contact AO Integration
// ============================================================================
export const SHADOW_AO_FILTER_WGSL = COMMON_WGSL + /* wgsl */ `
@group(1) @binding(0) var gPosTTex   : texture_2d<f32>;
@group(1) @binding(1) var gNrmMatTex : texture_2d<f32>;
@group(1) @binding(2) var gShadowIn  : texture_2d<f32>;
@group(1) @binding(3) var gShadowOut : texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(u.resFilter.x);
  let h = i32(u.resFilter.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) {
    return;
  }

  let cPosT = textureLoad(gPosTTex, vec2<i32>(x, y), 0);
  let cSh   = textureLoad(gShadowIn, vec2<i32>(x, y), 0);
  if (cPosT.w < 0.0) {
    textureStore(gShadowOut, vec2<i32>(x, y), cSh);
    return;
  }

  let stepPx = max(1, i32(round(u.resFilter.z)));
  let cNrm = textureLoad(gNrmMatTex, vec2<i32>(x, y), 0).xyz;
  let dilBlk = cSh.y;
  let sigma = select(
    clamp(0.22 + dilBlk * 1.55, 0.22, 3.0),
    clamp(0.80 + dilBlk * 1.40, 0.80, 2.8),
    stepPx == 1 && u.flagsA.z > 0.5
  );

  var sSum = 0.0;
  var sW   = 0.0;
  var aSum = 0.0;
  var aW   = 0.0;

  for (var dy : i32 = -2; dy <= 2; dy = dy + 1) {
    for (var dx : i32 = -2; dx <= 2; dx = dx + 1) {
      let qx = clamp(x + dx * stepPx, 0, w - 1);
      let qy = clamp(y + dy * stepPx, 0, h - 1);
      let qPosT = textureLoad(gPosTTex, vec2<i32>(qx, qy), 0);
      if (qPosT.w > 0.0) {
        let qNrm = textureLoad(gNrmMatTex, vec2<i32>(qx, qy), 0).xyz;
        let qSh  = textureLoad(gShadowIn, vec2<i32>(qx, qy), 0);
        let wn = pow(max(dot(cNrm, qNrm), 0.0), 32.0);
        let wp = exp(-abs(dot(cNrm, qPosT.xyz - cPosT.xyz)) * 50.0);
        let r2 = f32(dx * dx + dy * dy);
        let wgS = select(exp(-r2 / (2.0 * sigma * sigma)), 1.0, dx == 0 && dy == 0);
        let wgA = select(exp(-r2 / (2.0 * 1.35 * 1.35)), 1.0, dx == 0 && dy == 0);
        let ws = wn * wp * select(0.0, wgS, u.flagsA.z > 0.5 || (dx == 0 && dy == 0));
        let wa = wn * wp * wgA;
        sSum = sSum + qSh.x * ws;
        sW   = sW + ws;
        aSum = aSum + qSh.z * wa;
        aW   = aW + wa;
      }
    }
  }

  let outVis = select(cSh.x, sSum / sW, sW > 0.0);
  let outAo  = select(cSh.z, aSum / aW, aW > 0.0);
  textureStore(gShadowOut, vec2<i32>(x, y), vec4<f32>(outVis, dilBlk, outAo, cSh.w));
}
`;

// ============================================================================
// Pass 5: Multi-Bounce Cone-Footprint Specular + Snell's-Law Cabin Glass Refraction
// ============================================================================
export const SPECULAR_AND_GLASS_WGSL = COMMON_WGSL + /* wgsl */ `
@group(1) @binding(0) var gPosTTex     : texture_2d<f32>;
@group(1) @binding(1) var gNrmMatTex   : texture_2d<f32>;
@group(1) @binding(2) var gSpecGlassOut: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(u.resFilter.x);
  let h = i32(u.resFilter.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) {
    return;
  }

  let viewMode = i32(round(u.camUpViewMode.w));
  if (viewMode == 2) {
    textureStore(gSpecGlassOut, vec2<i32>(x, y), vec4<f32>(0.0));
    return;
  }

  let posT = textureLoad(gPosTTex, vec2<i32>(x, y), 0);
  if (posT.w < 0.0) {
    textureStore(gSpecGlassOut, vec2<i32>(x, y), vec4<f32>(0.0));
    return;
  }

  let nrmMat = textureLoad(gNrmMatTex, vec2<i32>(x, y), 0);
  let pos = posT.xyz;
  let nrm = nrmMat.xyz;
  let matId = i32(round(nrmMat.w));
  let rd = makeCamRay(f32(x), f32(y));
  let viewDir = -rd;
  let sunDir = u.sunDirRadius.xyz;
  var extraSteps : i32 = 0;

  // Cabin Glass (mat 7): Deterministic Fresnel Reflection + Snell's-Law Cockpit Refraction
  if (matId == 7) {
    let noV = max(dot(nrm, viewDir), 0.02);
    let fres = 0.06 + 0.90 * pow(1.0 - noV, 5.0);
    let rDir = reflect(rd, nrm);
    let rh = traceBvh4(pos + nrm * 0.006, rDir, 0.005, 80.0, true);
    extraSteps = extraSteps + rh.steps;
    var rCol = evalSky(rDir, sunDir);
    if (rh.hit) {
      var rSv = 0.0;
      if (dot(rh.nrm, sunDir) > 0.02) {
        let sh = traceBvh4(rh.pos + rh.nrm * 0.008, sunDir, 0.006, 40.0, true);
        extraSteps = extraSteps + sh.steps;
        rSv = select(1.0, 0.0, sh.hit);
      }
      rCol = shadeSurfaceDirectAndGi(rh.pos, rh.nrm, rh.matId, -rDir, rSv, 1.0, false);
    }

    var tCol = rCol * 0.35;
    if (u.flagsB.x > 0.5) {
      let eta = 1.0 / 1.46;
      let cosi = clamp(-dot(nrm, rd), -1.0, 1.0);
      let k = 1.0 - eta * eta * (1.0 - cosi * cosi);
      let tDir = select(rDir, normalize(rd * eta + nrm * (eta * cosi - sqrt(max(k, 0.0)))), k > 0.0);
      let th = traceBvh4(pos - nrm * 0.015, tDir, 0.01, 80.0, true);
      extraSteps = extraSteps + th.steps;
      if (th.hit) {
        var tSv = 0.0;
        if (dot(th.nrm, sunDir) > 0.02) {
          let sh = traceBvh4(th.pos + th.nrm * 0.008, sunDir, 0.006, 40.0, true);
          extraSteps = extraSteps + sh.steps;
          tSv = select(1.0, 0.0, sh.hit);
        }
        tCol = shadeSurfaceDirectAndGi(th.pos, th.nrm, th.matId, -tDir, tSv, 0.85, false);
      } else {
        tCol = evalSky(tDir, sunDir);
      }
      tCol = tCol * vec3<f32>(0.58, 0.66, 0.74);
    }

    let glassHdr = tCol * (1.0 - fres) + rCol * fres;
    textureStore(gSpecGlassOut, vec2<i32>(x, y), vec4<f32>(glassHdr, f32(extraSteps)));
    return;
  }

  // Opaque Dielectric / Clearcoat / Metallic Cone-Footprint Specular Bounces
  let maxB = clamp(i32(round(u.paintBounces.w)), 0, 4);
  let m = evalMat(matId, pos, u.paintBounces.xyz);
  let effRough = select(m.roughness, mix(m.roughness, m.coatRough, m.coat * 0.78), m.coat > 0.0);

  if (maxB <= 0 || effRough >= 0.48) {
    textureStore(gSpecGlassOut, vec2<i32>(x, y), vec4<f32>(0.0));
    return;
  }

  var reflRad = vec3<f32>(0.0);
  var cO = pos;
  var cN = nrm;
  var rDir = normalize(reflect(rd, cN));
  var tp = vec3<f32>(1.0);
  var coneRadius = 0.0;
  var curRough = effRough;

  for (var b : i32 = 1; b <= maxB; b = b + 1) {
    let bh = traceBvh4(cO + cN * 0.006, rDir, 0.004, 80.0, true);
    extraSteps = extraSteps + bh.steps;
    if (!bh.hit) {
      reflRad = reflRad + tp * evalSky(rDir, sunDir);
      break;
    }

    coneRadius = coneRadius + bh.t * max(0.002, curRough * curRough * 0.35);
    var bSv = 0.0;
    if (dot(bh.nrm, sunDir) > 0.02) {
      let sh = traceBvh4(bh.pos + bh.nrm * 0.008, sunDir, 0.006, 40.0, true);
      extraSteps = extraSteps + sh.steps;
      bSv = select(1.0, 0.0, sh.hit);
    }

    var hitCol = shadeSurfaceDirectAndGi(bh.pos, bh.nrm, bh.matId, -rDir, bSv, 0.92, false);
    let bm = evalMat(bh.matId, bh.pos, u.paintBounces.xyz);
    let coneBlur = clamp(coneRadius * 0.65, 0.0, 0.70);
    if (coneBlur > 0.01) {
      let preInt = bm.emissive + bm.albedo * (sampleWorldIrradiance(bh.pos, bh.nrm, -rDir) * 1.40);
      hitCol = mix(hitCol, preInt, coneBlur);
    }

    let bounceRefl = clamp((bm.metalness * 0.75 + bm.coat * 0.45) * (1.0 - bm.roughness), 0.0, 0.95);
    if (b == maxB || bounceRefl < 0.05) {
      reflRad = reflRad + tp * hitCol;
      break;
    }

    let fb = clamp(bounceRefl + (1.0 - bounceRefl) * pow(1.0 - max(dot(bh.nrm, -rDir), 0.02), 5.0) * 0.45, 0.0, 0.92);
    reflRad = reflRad + tp * (hitCol * (1.0 - fb * 0.55));
    tp = tp * fb;
    if (max(tp.x, max(tp.y, tp.z)) < 0.025) {
      break;
    }

    cO = bh.pos;
    cN = select(-bh.nrm, bh.nrm, dot(bh.nrm, rDir) < 0.0);
    rDir = normalize(reflect(rDir, cN));
    curRough = min(1.0, curRough + 0.08);
  }

  textureStore(gSpecGlassOut, vec2<i32>(x, y), vec4<f32>(reflRad, f32(extraSteps)));
}
`;

// ============================================================================
// Pass 6: Final Deterministic Composite + 3D DDGI Probe Spheres + BVH4 Heatmap + ACES
// ============================================================================
export const COMPOSITE_WGSL = COMMON_WGSL + /* wgsl */ `
@group(1) @binding(0) var gPosTTex     : texture_2d<f32>;
@group(1) @binding(1) var gNrmMatTex   : texture_2d<f32>;
@group(1) @binding(2) var gShadowTex   : texture_2d<f32>;
@group(1) @binding(3) var gSpecGlassTex: texture_2d<f32>;
@group(1) @binding(4) var outDisplayTex: texture_storage_2d<rgba16float, write>;

fn acesTonemap(v : vec3<f32>) -> vec3<f32> {
  return clamp((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn heatmapColor(t : f32) -> vec3<f32> {
  let c = clamp(t, 0.0, 1.0);
  if (c < 0.25) {
    return mix(vec3<f32>(0.05, 0.12, 0.35), vec3<f32>(0.0, 0.72, 0.92), c * 4.0);
  } else if (c < 0.55) {
    return mix(vec3<f32>(0.0, 0.72, 0.92), vec3<f32>(0.18, 0.92, 0.35), (c - 0.25) / 0.30);
  } else if (c < 0.80) {
    return mix(vec3<f32>(0.18, 0.92, 0.35), vec3<f32>(0.98, 0.78, 0.12), (c - 0.55) / 0.25);
  }
  return mix(vec3<f32>(0.98, 0.78, 0.12), vec3<f32>(0.98, 0.16, 0.14), (c - 0.80) / 0.20);
}

fn traceDdgiProbeSpheres(camPos : vec3<f32>, rd : vec3<f32>, maxT : f32, curHdr : vec3<f32>) -> vec3<f32> {
  var bestT = maxT;
  var outHdr = curHdr;
  let viewDir = -rd;
  for (var iz : i32 = 0; iz <= 2; iz = iz + 1) {
    for (var iy : i32 = 3; iy <= 12; iy = iy + 1) {
      for (var ix : i32 = 4; ix <= 15; ix = ix + 1) {
        let center = ddgiProbePos(ix, iy, iz);
        let oc = camPos - center;
        let b = dot(oc, rd);
        let c = dot(oc, oc) - 0.092 * 0.092;
        let disc = b * b - c;
        if (disc > 0.0) {
          let tp = -b - sqrt(disc);
          if (tp > 0.20 && tp < bestT) {
            bestT = tp;
            let spN = normalize(camPos + rd * tp - center);
            let pIdx = (iz * DDGI_NY + iy) * DDGI_NX + ix;
            let pIrr = sampleProbeOctIrr(pIdx, spN);
            let rim = pow(1.0 - max(dot(spN, viewDir), 0.0), 3.0);
            outHdr = pIrr * 1.35 + vec3<f32>(0.18, 0.26, 0.38) * rim;
          }
        }
      }
    }
  }
  return outHdr;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(u.resFilter.x);
  let h = i32(u.resFilter.y);
  let x = i32(gid.x);
  let y = i32(gid.y);
  if (x >= w || y >= h) {
    return;
  }

  let viewMode = i32(round(u.camUpViewMode.w));
  let splitPx  = i32(round(u.resFilter.x * u.camRightSplit.w));
  let isSplitClay = (viewMode == 0 && x >= splitPx);
  let rd = makeCamRay(f32(x), f32(y));
  let viewDir = -rd;

  let posT   = textureLoad(gPosTTex, vec2<i32>(x, y), 0);
  let nrmMat = textureLoad(gNrmMatTex, vec2<i32>(x, y), 0);
  let shData = textureLoad(gShadowTex, vec2<i32>(x, y), 0);
  let sgData = textureLoad(gSpecGlassTex, vec2<i32>(x, y), 0);

  // Mode 5: 4-Wide BVH4 Traversal Steps Heatmap
  if (viewMode == 5) {
    let totalSteps = shData.w + sgData.w;
    let heat = heatmapColor(totalSteps / 95.0);
    textureStore(outDisplayTex, vec2<i32>(x, y), vec4<f32>(heat, 1.0));
    return;
  }

  var hdr = vec3<f32>(0.0);
  let maxDepth = select(posT.w, 120.0, posT.w < 0.0);

  if (posT.w < 0.0) {
    hdr = evalSky(rd, u.sunDirRadius.xyz) * 0.82;
  } else {
    let pos = posT.xyz;
    let nrm = nrmMat.xyz;
    let matId = i32(round(nrmMat.w));
    let sunVis = shData.x;
    let contactAo = shData.z;

    if (viewMode == 2 || isSplitClay) {
      hdr = shadeSurfaceDirectAndGi(pos, nrm, matId, viewDir, sunVis, contactAo, true) * 0.78;
    } else if (viewMode == 4) {
      hdr = sgData.xyz * 0.85;
    } else if (matId == 7) {
      hdr = sgData.xyz * 0.82;
    } else {
      let baseLit = shadeSurfaceDirectAndGi(pos, nrm, matId, viewDir, sunVis, contactAo, false);
      let m = evalMat(matId, pos, u.paintBounces.xyz);
      let f0 = mix(vec3<f32>(0.04), m.albedo, m.metalness);
      let s5 = pow(1.0 - max(dot(nrm, viewDir), 0.02), 5.0);
      let cF = m.coat * (0.04 + 0.96 * s5);
      let baseFres = (f0 + (vec3<f32>(1.0) - f0) * s5) * (1.0 - cF) + vec3<f32>(cF);
      let fade = 1.0 - smoothstep(0.32, 0.78, m.roughness * (1.0 - m.coat * 0.70));
      let rw = clamp(baseFres * fade, vec3<f32>(0.0), vec3<f32>(0.95));
      hdr = (baseLit * (vec3<f32>(1.0) - rw * 0.45) + sgData.xyz * rw) * 0.78;
    }
  }

  let drawProbes = (viewMode == 3) || (u.flagsB.y > 0.5 && (viewMode != 0 || isSplitClay));
  if (drawProbes) {
    hdr = traceDdgiProbeSpheres(u.camPosFov.xyz, rd, maxDepth, hdr);
  }

  var srgb = pow(acesTonemap(hdr), vec3<f32>(1.0 / 2.2));
  if (viewMode == 0 && abs(x - splitPx) <= 1) {
    srgb = vec3<f32>(0.94, 0.97, 1.0);
  }
  textureStore(outDisplayTex, vec2<i32>(x, y), vec4<f32>(srgb, 1.0));
}
`;

// ============================================================================
// Fullscreen Present Pass (rgba16float Display Texture -> Canvas Swapchain)
// ============================================================================
export const PRESENT_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0)       uv  : vec2<f32>,
};

@vertex
fn vsMain(@builtin(vertex_index) vid : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 3.0, -1.0),
    vec2<f32>(-1.0,  3.0)
  );
  var o : VsOut;
  o.pos = vec4<f32>(p[vid], 0.0, 1.0);
  o.uv  = vec2<f32>((p[vid].x + 1.0) * 0.5, (1.0 - p[vid].y) * 0.5);
  return o;
}

@group(0) @binding(0) var displayTex : texture_2d<f32>;

@fragment
fn fsMain(inp : VsOut) -> @location(0) vec4<f32> {
  let dims = vec2<f32>(textureDimensions(displayTex, 0));
  let coord = clamp(vec2<i32>(inp.uv * dims), vec2<i32>(0), vec2<i32>(dims) - vec2<i32>(1));
  return textureLoad(displayTex, coord, 0);
}
`;
