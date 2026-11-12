// WGSL sources for the Particle Editor. Each module declares only the bindings it
// uses; the bind group layouts live in engine.js. Units: metres and seconds.
// 📝 Converted from an IIFE to an ES module. The body keeps its two-space indent on purpose: this
//    file holds WGSL in template literals, and dedenting would edit the shader source. Everywhere
//    else it keeps `git blame` pointing at whoever wrote the line rather than at this commit.
import { PE } from "./pe.js";

  // Shared structs and helpers. Every System uniform field is one vec4 (16 floats);
  // the offsets are mirrored in engine.js (SYS_SLOT).
  const COMMON = /* wgsl */ `
struct Glob {
  viewProj: mat4x4f,
  camRight: vec4f,
  camUp: vec4f,
  camPos: vec4f,
  windMin: vec4f,
  windSize: vec4f,
  windDim: vec4f,
  timing: vec4f,
  viz: vec4f,
  swirl: vec4f,    // x swirl strength (m/s), y spatial frequency (1/m), z animation rate
};

struct Sys {
  origin: vec4f,   // xyz origin, w radius
  dir: vec4f,      // xyz direction (unit), w spread (radians)
  speed: vec4f,    // x min, y max, z drag (1/s), w gravity (g units)
  life: vec4f,     // x min, y max, z size start, w size end
  colA: vec4f,
  colB: vec4f,
  colC: vec4f,
  phys: vec4f,     // x dt, y time, z frame, w kind (0 spark,1 leaf,3 atom,4 chem,5 vfx)
  phys2: vec4f,    // x wind coupling (1/s), y bounce, z buoyancy, w flutter
  phys3: vec4f,    // x capacity, y emit shape, z fraction A (chem), w emit count this frame
  phys4: vec4f,    // xyz box half extents, w head index
  mol: vec4f,      // x temperature, y epsilon, z sigma, w reaction rate
  mol2: vec4f,     // x cell size, y grid dim, z slots per cell, w dissociation rate
  mol3: vec4f,     // x reaction radius, y damping, z -, w -
  emit: vec4f,     // x head, y seed base, z shape (0 streak,1 sphere,2 leaf,3 soft), w leaf mode
  misc: vec4f,     // x size scale
};

struct Part {
  p: vec4f,        // xyz position, w age
  v: vec4f,        // xyz velocity, w lifetime (dead when age >= life)
  c: vec4f,        // rgba
  m: vec4f,        // x size, y angle, z spin, w seed (or species for molecules)
  e: vec4f,        // x hold time (s, transitions), y floor-impact time + 1 (0 = none, derez), zw unused
};

fn hash(x0: u32) -> u32 {
  var x = x0;
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

fn rnd(s: ptr<function, u32>) -> f32 {
  *s = hash(*s + 0x9e3779b9u);
  return f32(*s & 0xffffffu) / 16777216.0;
}

fn hashF(seed: f32, k: u32) -> f32 {
  let h = hash(u32(seed) * 31u + k * 977u + 17u);
  return f32(h & 0xffffffu) / 16777216.0;
}

fn randSphere(u: f32, v: f32) -> vec3f {
  let z = 2.0 * u - 1.0;
  let a = 6.2831853 * v;
  let r = sqrt(max(0.0, 1.0 - z * z));
  return vec3f(r * cos(a), z, r * sin(a));
}

fn basisFrom(d: vec3f) -> mat3x3f {
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(d.y) > 0.95);
  let t = normalize(cross(up, d));
  let b = cross(d, t);
  return mat3x3f(t, b, d);
}

fn rotAxis(v: vec3f, k: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
`;

  // ---------------------------------------------------------------- simulation
  const SIM = /* wgsl */ `
@group(0) @binding(0) var<uniform> G: Glob;
@group(0) @binding(1) var windTex: texture_3d<f32>;
@group(0) @binding(2) var windSamp: sampler;
@group(1) @binding(0) var<uniform> S: Sys;
@group(1) @binding(1) var<storage, read_write> parts: array<Part>;
@group(1) @binding(2) var<storage, read_write> stats: array<atomic<u32>, 8>;
@group(1) @binding(3) var<storage, read_write> cellCount: array<atomic<u32>>;
@group(1) @binding(4) var<storage, read_write> cellSlots: array<u32>;
@group(1) @binding(5) var<storage, read> snap: array<Part>;
@group(1) @binding(6) var<storage, read> fields: array<vec4f>;

// 📝 Force fields, packed by ForceFieldCatalogue (fields[0] = (count, time, 0, 0)). Field k uses 4 vec4 slots 1+4k..4+4k:
//   a = (centre.xyz, radius), b = (type 0 Attract / 1 Repel / 2 Lift / 3 Magnetic / 4 Orbit / 5 Gravity / 6 Drag, strength*env, swirl_or_guide, swallow),
//   c = (reach 0 Sphere / 1 Column / 2 Box, falloff 0 Smooth / 1 Linear / 2 InvSq / 3 None, bearingRad, height),
//   d = (halfX, halfZ, offsetZ, active).
fn fieldFalls(falloffType: u32, dist: f32, reach: f32) -> f32 {
  let r = max(reach, 1e-4);
  if (falloffType == 3u) { return select(0.0, 1.0, dist <= r); }
  let q = clamp(dist / r, 0.0, 1.0);
  if (q >= 1.0) { return 0.0; }
  if (falloffType == 1u) { return 1.0 - q; }
  if (falloffType == 2u) { return (1.0 - q * q) / (1.0 + 8.0 * q * q); }
  let s = 1.0 - q * q;
  return s * s;
}

fn fieldResolveReach(a: vec4f, c: vec4f, d: vec4f, p: vec3f) -> f32 {
  let delta = p - a.xyz;
  let reachType = u32(c.x + 0.5);
  let falloffType = u32(c.y + 0.5);
  if (reachType == 0u) {
    let sep = length(delta);
    return select(fieldFalls(falloffType, sep, a.w), 0.0, sep >= a.w);
  }
  if (reachType == 1u) {
    let h = max(0.5, c.w);
    if (delta.y < -min(15.0, h * 0.5) || delta.y > h * 1.3) { return 0.0; }
    let sepXZ = length(delta.xz);
    if (sepXZ >= a.w) { return 0.0; }
    let t = clamp((delta.y - h) / (0.3 * h), 0.0, 1.0);
    let taper = select(1.0, 1.0 - t * t * (3.0 - 2.0 * t), delta.y > h);
    return fieldFalls(falloffType, sepXZ, a.w) * taper;
  }
  let cs = cos(c.z);
  let sn = sin(c.z);
  let lx = delta.x * cs + delta.z * sn;
  let lz = -delta.x * sn + delta.z * cs + d.z;
  let sy = select(delta.y / max(1.0, c.w), -delta.y / max(1.5, c.w * 0.5), delta.y < 0.0);
  let share = max(max(abs(lx) / max(0.25, d.x), abs(lz) / max(0.25, d.y)), sy);
  return select(fieldFalls(falloffType, share, 1.0), 0.0, share >= 1.0);
}

fn evalFields(p: vec3f, vel: vec3f) -> vec4f {
  let n = min(u32(fields[0].x), 16u);
  var acc = vec3f(0.0);
  var damp = 0.0;
  for (var k = 0u; k < n; k++) {
    let a = fields[1u + 4u * k];
    let b = fields[2u + 4u * k];
    let c = fields[3u + 4u * k];
    let d = fields[4u + 4u * k];
    if (d.w < 0.5) { continue; }
    let g = fieldResolveReach(a, c, d, p);
    if (g <= 0.0) { continue; }
    let typ = u32(b.x + 0.5);
    let scale = b.y * g;
    if (typ == 6u) {
      damp += scale;
      continue;
    }
    if (typ == 2u) { acc.y += scale; continue; }
    if (typ == 5u) { acc.y -= scale; continue; }
    let rv = p - a.xyz;
    let sep = max(length(rv), 1e-3);
    let outDir = rv / sep;
    if (typ == 1u) {
      acc += outDir * scale;
    } else if (typ == 3u) {
      let rh = rv / max(sep, 0.4);
      let zAxis = vec3f(0.0, 0.0, 1.0);
      let B = 3.0 * dot(zAxis, rh) * rh - zAxis;
      let Bh = normalize(B);
      let vPerp = vel - Bh * dot(vel, Bh);
      acc += Bh * scale - vPerp * (b.z * g);
    } else {
      let tlen = max(length(outDir.xz), 1e-4);
      let tang = vec3f(-outDir.z / tlen, 0.0, outDir.x / tlen);
      if (typ == 4u) {
        acc += tang * scale;
      } else {
        acc += -outDir * scale + tang * (b.z * g);
      }
    }
  }
  return vec4f(acc, damp);
}

fn fieldSwallowed(p: vec3f) -> bool {
  let n = min(u32(fields[0].x), 16u);
  for (var k = 0u; k < n; k++) {
    let a = fields[1u + 4u * k];
    let b = fields[2u + 4u * k];
    let d = fields[4u + 4u * k];
    if (d.w >= 0.5 && u32(b.x + 0.5) == 0u && b.w > 0.0 && length(a.xyz - p) < b.w) { return true; }
  }
  return false;
}

const FMAX: f32 = 180.0;

fn sampleWind(p: vec3f) -> vec3f {
  let uvw = (p - G.windMin.xyz) / G.windSize.xyz;
  if (any(uvw < vec3f(0.0)) || any(uvw > vec3f(1.0))) { return vec3f(0.0); }
  return textureSampleLevel(windTex, windSamp, uvw, 0.0).xyz;
}

// 📝 Surface grid: local position in [-1, 1]^3 for cell i of a box surface (cap = 6 * g * g cells).
fn surfaceLocal(i: u32, cap: f32) -> vec3f {
  let g = max(1u, u32(floor(sqrt(cap / 6.0))));
  let cells = g * g;
  let face = i % 6u;
  let cell = (i / 6u) % cells;
  let cu = (f32(cell % g) + 0.5) / f32(g) * 2.0 - 1.0;
  let cv = (f32(cell / g) + 0.5) / f32(g) * 2.0 - 1.0;
  let ax = face / 2u;
  let sg = select(-1.0, 1.0, (face % 2u) == 0u);
  var lp = vec3f(0.0);
  lp[ax] = sg;
  lp[(ax + 1u) % 3u] = cu;
  lp[(ax + 2u) % 3u] = cv;
  return lp;
}

// 📝 Slot for particle i in an assembly mode: 1 = its surface cell, 2 = its place in a column on the floor.
fn assembleTarget(i: u32, mode: u32) -> vec3f {
  if (mode == 2u) {
    let sz = S.life.z * S.misc.x;
    return vec3f(S.origin.x, S.origin.y + (f32(i) + 0.5) * 0.2 * sz, S.origin.z);
  }
  return S.origin.xyz + surfaceLocal(i, S.phys3.x) * S.phys4.xyz;
}

// 📝 Release time (0..1) across the object. Corner: a wave from the min corner. Melt: patchy clumps that melt across the surface.
fn waveT(u: vec3f) -> f32 {
  // 📝 Glitch: blocky cells on a 7x5x7 grid, each with a hashed release time, plus a rising sweep.
  if (S.mol2.x > 1.5) {
    let cell = floor(u * vec3f(7.0, 5.0, 7.0));
    let h = fract(sin(dot(cell, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
    return clamp(0.6 * h + 0.4 * u.y, 0.0, 1.0);
  }
  if (S.mol2.x > 0.5) {
    return clamp(0.5 + 0.3 * sin(u.x * 5.0 + u.y * 3.0 + 0.7) + 0.2 * sin(u.y * 7.0 - u.z * 4.0 + 2.1), 0.0, 1.0);
  }
  return (u.x + u.y + u.z) / 3.0;
}

@compute @workgroup_size(64)
fn emitParticles(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let n = u32(S.phys3.w);
  if (i >= n) { return; }
  let cap = u32(S.phys3.x);
  let idx = (u32(S.emit.x) + i) % cap;
  var st = hash(idx * 2654435761u + u32(S.emit.y) * 40503u + 12345u);
  let r0 = rnd(&st); let r1 = rnd(&st); let r2 = rnd(&st); let r3 = rnd(&st);
  let r4 = rnd(&st); let r5 = rnd(&st); let r6 = rnd(&st);
  let kind = u32(S.phys.w);
  let shape = u32(S.phys3.y);
  let rad = S.origin.w;
  var pos = S.origin.xyz;
  if (shape == 1u) {
    pos += randSphere(r0, r1) * rad * pow(r2, 0.333);
  } else if (shape == 2u) {
    let a = 6.2831853 * r0;
    let rr = rad * sqrt(r1);
    pos += vec3f(cos(a) * rr, 0.0, sin(a) * rr);
  } else if (shape == 3u) {
    pos += (vec3f(r0, r1, r2) * 2.0 - 1.0) * S.phys4.xyz;
  } else if (shape == 4u) {
    // 📝 Box surface grid: the cells tile every face, so one full batch covers the whole surface.
    pos += surfaceLocal(i, S.phys3.x) * S.phys4.xyz;
  }
  var vel = vec3f(0.0);
  var life = mix(S.life.x, S.life.y, r3);
  var species = 0.0;
  let molecular = kind == 3u || kind == 4u;
  if (molecular) {
    life = 1.0e9;
    pos = S.origin.xyz + (vec3f(r0, r1, r2) * 2.0 - 1.0) * S.phys4.xyz;
    vel = (vec3f(r4, r5, r6) - 0.5) * sqrt(12.0 * S.mol.x);
    if (kind == 4u) { species = select(1.0, 0.0, r3 < S.phys3.z); }
  } else {
    let basis = basisFrom(S.dir.xyz);
    let cosT = 1.0 - r4 * (1.0 - cos(S.dir.w));
    let sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
    let phi = 6.2831853 * r5;
    let local = vec3f(sinT * cos(phi), sinT * sin(phi), cosT);
    vel = (basis * local) * mix(S.speed.x, S.speed.y, r6);
  }
  // 📝 Transitions (kind 5). Modes: 0 = hold, then burst or fall; 1 = rebuild from a shell; 2 = stack in a column.
  let amode = u32(S.mol2.z);
  let trans = kind == 5u && (S.mol3.x + S.mol3.y) > 0.0;
  var hold = 0.0;
  var eZ = 0.0;
  var eW = 0.0;
  if (trans) {
    var u01 = vec3f(0.5);
    if (amode == 1u) {
      u01 = surfaceLocal(i, S.phys3.x) * 0.5 + 0.5;
    } else if (shape == 4u) {
      u01 = clamp((pos - S.origin.xyz) / max(S.phys4.xyz, vec3f(1e-4)) * 0.5 + 0.5, vec3f(0.0), vec3f(1.0));
    }
    var tc = select(r2, waveT(u01), shape == 4u || amode == 1u);
    if (amode == 2u) { tc = f32(i) / max(S.phys3.x, 1.0); }
    let jit = select(0.15 * r2, 0.0, amode == 2u);
    hold = S.mol3.x + S.mol3.y * (tc + jit);
    if (amode == 0u) {
      life = hold + life;
      let outDir = normalize(pos - S.origin.xyz + vec3f(0.0, 0.35, 0.0));
      vel = select(vec3f(0.0), outDir * mix(S.speed.x, S.speed.y, r6), r4 < S.mol3.z);
    } else {
      // 📝 Assembly: start on a shell around the object (rebuild) or above the column (stack). Velocity holds the start point.
      life = 10000.0;
      if (amode == 1u) {
        let dirS = normalize(vec3f(r0, r1, r2) * 2.0 - 1.0 + vec3f(0.0, 0.001, 0.0));
        pos = S.origin.xyz + dirS * S.misc.w * (0.8 + 0.4 * r4);
      } else {
        pos = vec3f(S.origin.x + (r4 - 0.5) * 0.12, S.origin.y + S.misc.w, S.origin.z + (r5 - 0.5) * 0.12);
      }
      vel = pos;
      eZ = f32(i);
      eW = select(0.0, 1.0, amode == 2u);
    }
  }
  var initAge = 0.0;
  if (!molecular && kind == 0u && shape == 3u && S.mol3.w > 0.5) {
    pos.y = mix(0.25, S.origin.y + S.phys4.y, r2);
    initAge = mix(0.0, life * 0.45, 1.0 - r2);
  }
  var q: Part;
  q.p = vec4f(pos, initAge);
  q.v = vec4f(vel, life);
  q.c = S.colA;
  q.m = vec4f(S.life.z * S.misc.x, select(r0 * 6.2831853, 0.0, trans), (r1 - 0.5) * 4.0,
              select(f32(st & 0xffffffu), species, molecular));
  q.e = vec4f(hold, 0.0, eZ, eW);
  parts[idx] = q;
}

// Ballistic / wind-driven particles: sparks, leaves, rain, smoke, fire, explosions.
fn vehicleRoofY(lx: f32, lz: f32) -> f32 {
  let wEdge = smoothstep(1.24, 0.85, abs(lz));
  var y = 1.13;
  if (lx > 1.15) {
    y = mix(1.15, 1.12, clamp((lx - 1.15) / 1.95, 0.0, 1.0));
  } else if (lx > 0.50) {
    y = mix(1.77, 1.15, smoothstep(0.50, 1.15, lx));
  } else if (lx > -0.55) {
    y = 1.77;
  } else {
    y = mix(1.77, 1.20, smoothstep(-0.55, -2.85, lx));
  }
  return mix(0.82, y, wEdge);
}

@compute @workgroup_size(64)
fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cap = u32(S.phys3.x);
  if (i >= cap) { return; }
  let q = parts[i];
  let life = q.v.w;
  if (q.p.w >= life) { return; }
  let dt = S.phys.x;
  let kind = u32(S.phys.w);
  let age = q.p.w + dt;
  if (age >= life) { parts[i] = Part(); return; }
  let t01 = age / life;
  let seed = q.m.w;
  // 📝 Assembly (kind 5, modes 1 and 2): analytic flight to a fixed slot, then hold. No physics after release.
  let amode = u32(S.mol2.z);
  if (kind == 5u && amode > 0u) {
    let s0 = q.v.xyz;
    var p2 = assembleTarget(u32(q.e.z), amode);
    if (amode == 1u) {
      let u = clamp(age / max(q.e.x, 1e-4), 0.0, 1.0);
      let e = u * u * (3.0 - 2.0 * u);
      p2 = mix(s0, p2, e) + vec3f(0.0, 0.5 * sin(3.14159265 * u) * (1.0 - e), 0.0);
    } else {
      let g = 9.81;
      let tf = sqrt(2.0 * max(s0.y - p2.y, 0.0) / g);
      let tau = max(age - (q.e.x - tf), 0.0);
      if (tau < tf) {
        let k = clamp(tau / max(tf, 1e-4), 0.0, 1.0);
        p2 = vec3f(mix(s0.x, p2.x, k), s0.y - 0.5 * g * tau * tau, mix(s0.z, p2.z, k));
      } else {
        let b = max(age - q.e.x, 0.0);
        p2.y += 0.02 * exp(-8.0 * b) * abs(sin(25.0 * b));
      }
    }
    parts[i] = Part(vec4f(p2, age), q.v, q.c, q.m, q.e);
    return;
  }
  // 📝 Transition pieces wait on the object's surface until their hold time: no motion and no spin, so the object reads as solid.
  if (age < q.e.x) {
    parts[i] = Part(vec4f(q.p.xyz, age), q.v, q.c, vec4f(q.m.x, 0.0, q.m.z, seed), q.e);
    return;
  }
  var pos = q.p.xyz;
  var v = q.v.xyz;

  // Wind field: velocity relaxes toward the local wind (sampled from the ForceFieldCatalogue 3D volume).
  let sh = u32(S.emit.z);
  let wind = sampleWind(pos);
  let wMag = length(wind);
  let cGain = select(1.0, 1.35, sh == 7u);
  let k = min(S.phys2.x * cGain * dt, 1.0);
  let kEff = select(k * 0.12, k, wMag > 0.05 || S.phys.w > 0.5);
  v += (wind - v) * kEff;
  var extraDamp = 0.0;
  var fRes = vec4f(0.0);
  v.y += (-S.speed.w * 9.81 + S.phys2.z) * dt;
  // 📝 Force fields: Attractor, Repulsor, Lift, Magnetic, Orbit, Gravity, Drag — all strictly bounded.
  if (fields[0].x > 0.0) {
    if (fieldSwallowed(pos)) { parts[i] = Part(); return; }
    fRes = evalFields(pos, v);
    let accelGain = select(select(1.0, 1.35, sh == 0u), 2.4, sh == 7u);
    v += fRes.xyz * accelGain * dt;
    extraDamp = fRes.w;
  }
  let forceMag = wMag + length(fRes.xyz);
  let forceUp = wind.y + fRes.y;
  v *= exp(-(S.speed.z + extraDamp) * dt);
  if (S.phys2.w > 0.0) {
    let ph = age * 2.7 + seed * 0.013;
    v += vec3f(sin(ph), 0.25 * cos(ph * 1.3), cos(ph * 0.8 + 1.0)) * S.phys2.w * dt;
  }
  pos += v * dt;
  let vScale = G.windMin.w;
  if (vScale > 0.01 && kind == 0u) {
    let invSc = 1.0 / vScale;
    let dx = (pos.x - G.windSize.w) * invSc;
    let dz = (pos.z - G.camRight.w) * invSc;
    let dy = pos.y * invSc;
    let cy = cos(G.camUp.w);
    let sy = sin(G.camUp.w);
    let lx = dx * cy - dz * sy;
    let lz = dx * sy + dz * cy;
    if (abs(lx) < 3.12 && abs(lz) < 1.22 && dy > 0.14) {
      let ry = vehicleRoofY(lx, lz);
      if (dy < ry && v.y < 0.0) {
        pos.y = ry * vScale + 0.015;
        if (sh == 7u) {
          if (forceUp > 0.35 || forceMag > 1.8) {
            pos.y += 0.03;
            v.y = max(0.15, min(3.5, forceUp * 0.45 + forceMag * 0.12));
          } else {
            let slip = select(0.80, 0.96, forceMag >= 0.35);
            v = vec3f(v.x * slip, 0.0, v.z * slip);
          }
        } else {
          let nx = clamp((vehicleRoofY(lx - 0.12, lz) - vehicleRoofY(lx + 0.12, lz)) * 3.5, -0.55, 0.55);
          let nrm = normalize(vec3f(nx * cy, 0.88, -nx * sy + lz * 0.18));
          v = reflect(v, nrm) * max(0.24, S.phys2.y);
          v.y = max(v.y, 0.20);
        }
      }
    }
  }
  if (pos.y < 0.0) {
    // 📝 A derez cube breaks on its first floor impact. The parent stops here and its children are drawn procedurally.
    if (kind == 5u && S.mol2.w > 0.5 && q.e.y <= 0.0) {
      parts[i] = Part(vec4f(pos.x, 0.5 * q.m.x, pos.z, age), vec4f(v, age), q.c, q.m,
                      vec4f(q.e.x, S.phys.y + 1.0, 0.0, 0.0));
      return;
    }
    pos.y = 0.0;
    if (sh == 7u) {
      if (forceUp > 0.35 || forceMag > 1.8) {
        pos.y = 0.035;
        v.y = max(0.15, min(3.5, forceUp * 0.45 + forceMag * 0.12));
      } else {
        let slip = select(0.80, 0.96, forceMag >= 0.35);
        v = vec3f(v.x * slip, 0.0, v.z * slip);
      }
    } else if (kind == 1u) {
      v = vec3f(v.x * 0.55, 0.0, v.z * 0.55);
    } else {
      v.y = -v.y * S.phys2.y;
      v.x *= 0.7;
      v.z *= 0.7;
    }
  }
  if (length(pos - S.origin.xyz) > 60.0) { parts[i] = Part(); return; }

  let spin = q.m.z;
  let ang = q.m.y + spin * dt;
  let size = mix(S.life.z, S.life.w, t01) * S.misc.x * (0.7 + 0.6 * fract(seed * 0.618034));
  var c = mix(S.colA, S.colB, t01);
  c.a = c.a * smoothstep(0.0, 0.08, t01) * (1.0 - smoothstep(0.7, 1.0, t01));
  parts[i] = Part(vec4f(pos, age), vec4f(v, life), c, vec4f(size, ang, spin, seed), q.e);
}

fn cellOf(p: vec3f) -> vec3i {
  let gd = i32(S.mol2.y);
  let u = (p - S.origin.xyz + S.phys4.xyz) / S.mol2.x;
  return clamp(vec3i(floor(u)), vec3i(0), vec3i(gd - 1));
}

fn wallFix(c: f32, v: f32, B: f32) -> vec2f {
  if (c > B) { return vec2f(2.0 * B - c, -abs(v)); }
  if (c < -B) { return vec2f(-2.0 * B - c, abs(v)); }
  return vec2f(c, v);
}

@compute @workgroup_size(1)
fn resetStats() {
  for (var k = 0u; k < 8u; k++) { atomicStore(&stats[k], 0u); }
}

@compute @workgroup_size(64)
fn reduceStats(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cap = u32(S.phys3.x);
  if (i >= cap) { return; }
  let q = parts[i];
  if (q.p.w >= q.v.w) { return; }
  atomicAdd(&stats[0], 1u);
  atomicAdd(&stats[4], u32(dot(q.v.xyz, q.v.xyz) * 1000.0));
  if (u32(S.phys.w) == 4u) {
    let s = u32(clamp(q.m.w, 0.0, 2.0));
    atomicAdd(&stats[1u + s], 1u);
  }
}

@compute @workgroup_size(64)
fn molClear(@builtin(global_invocation_id) gid: vec3u) {
  let gd = u32(S.mol2.y);
  let i = gid.x;
  if (i >= gd * gd * gd) { return; }
  atomicStore(&cellCount[i], 0u);
}

@compute @workgroup_size(64)
fn molInsert(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cap = u32(S.phys3.x);
  if (i >= cap) { return; }
  let q = parts[i];
  if (q.p.w >= q.v.w) { return; }
  let K = u32(S.mol2.z);
  let gd = i32(S.mol2.y);
  let c = cellOf(q.p.xyz);
  let ci = u32(c.x + c.y * gd + c.z * gd * gd);
  let slot = atomicAdd(&cellCount[ci], 1u);
  if (slot < K) { cellSlots[ci * K + slot] = i; }
}

// Swarm step (kind 6): brute-force boids over the snapshot, plus wander, a weak leash to the
// emitter, wind coupling, and an optional pulse (fireflies). Reads snap, writes only its own particle.
@compute @workgroup_size(64)
fn swarmStep(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cap = u32(S.phys3.x);
  if (i >= cap) { return; }
  let me = snap[i];
  if (me.p.w >= me.v.w) { return; }
  let dt = S.phys.x;
  let R = max(S.mol3.x, 0.1);
  let vmax = max(S.mol3.y, 0.05);
  var sep = vec3f(0.0);
  var ali = vec3f(0.0);
  var coh = vec3f(0.0);
  var n = 0.0;
  for (var j = 0u; j < cap; j++) {
    if (j == i) { continue; }
    let o = snap[j];
    if (o.p.w >= o.v.w) { continue; }
    let rv = me.p.xyz - o.p.xyz;
    let d2 = dot(rv, rv);
    if (d2 > R * R) { continue; }
    let d = sqrt(max(d2, 1e-6));
    sep += rv / d * (1.0 - d / R);
    ali += o.v.xyz;
    coh += o.p.xyz;
    n += 1.0;
  }
  var a = vec3f(0.0);
  if (n > 0.0) {
    a += sep * 3.0;
    a += (ali / n - me.v.xyz) * 1.5;
    a += (coh / n - me.p.xyz) * 0.8;
  }
  let seed = me.m.w;
  let tt = S.phys.y * 0.9 + seed * 0.37;
  a += vec3f(sin(tt * 1.3 + seed), 0.5 * sin(tt * 0.7 + seed * 2.1), cos(tt * 1.1 + seed * 0.7)) * S.phys2.w;
  a += -(me.p.xyz - S.origin.xyz) * 0.12;
  var v = me.v.xyz + a * dt;
  let sp = length(v);
  if (sp > vmax) { v *= vmax / sp; }
  let wind = sampleWind(me.p.xyz);
  v += (wind - v) * min(S.phys2.x * dt, 1.0);
  v.y += (-S.speed.w * 9.81 + S.phys2.z) * dt;
  if (fields[0].x > 0.0) {
    let fRes = evalFields(me.p.xyz, v);
    v += fRes.xyz * dt;
    v *= exp(-fRes.w * dt);
  }
  var pos = me.p.xyz + v * dt;
  if (pos.y < 0.02) { pos.y = 0.02; v.y = abs(v.y) * 0.5; }
  let life = me.v.w;
  let age = me.p.w + dt;
  if (age >= life) { parts[i] = Part(); return; }
  let t01 = age / life;
  let size = mix(S.life.z, S.life.w, t01) * S.misc.x * (0.7 + 0.6 * fract(seed * 0.618034));
  let pulse = 1.0 - S.misc.z + S.misc.z * (0.5 + 0.5 * sin(S.phys.y * S.misc.y * 6.2831853 + seed * 6.2831853));
  var c = mix(S.colA, S.colB, t01);
  c.a = c.a * pulse * smoothstep(0.0, 0.08, t01) * (1.0 - smoothstep(0.7, 1.0, t01));
  parts[i] = Part(vec4f(pos, age), vec4f(v, life), c, vec4f(size, me.m.y, me.m.z, seed), vec4f(0.0));
}

// Molecular step: reads the snapshot (race-free), writes only its own particle.
// Kind 3: Lennard-Jones-style gas with Langevin thermostat.
// Kind 4: soft repulsion + stochastic A + B -> C reaction and C -> A/B dissociation.
@compute @workgroup_size(64)
fn molStep(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  let cap = u32(S.phys3.x);
  if (i >= cap) { return; }
  let me = snap[i];
  if (me.p.w >= me.v.w) { return; }
  let kind = u32(S.phys.w);
  let dt = S.phys.x;
  let sig = S.mol.z;
  let eps = S.mol.y;
  let rc = 2.5 * sig;
  let rc2 = rc * rc;
  let rr = S.mol3.x;
  let rr2 = rr * rr;
  let gd = i32(S.mol2.y);
  let K = u32(S.mol2.z);
  let c0 = cellOf(me.p.xyz);
  var f = vec3f(0.0);
  var sp = me.m.w;
  // Seed from the particle's position too: S.emit.y is constant within a frame, so without this
  // every sub-step would reuse the same thermostat noise and the noise would add coherently.
  var st = hash(i * 747796405u + u32(S.emit.y) * 2891336453u + bitcast<u32>(me.p.x) * 2654435761u + bitcast<u32>(me.p.y) * 2246822519u + 1u);
  for (var dz = -1; dz <= 1; dz++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let nc = c0 + vec3i(dx, dy, dz);
        if (any(nc < vec3i(0)) || any(nc >= vec3i(gd))) { continue; }
        let ci = u32(nc.x + nc.y * gd + nc.z * gd * gd);
        let cnt = min(atomicLoad(&cellCount[ci]), K);
        for (var s = 0u; s < cnt; s++) {
          let j = cellSlots[ci * K + s];
          if (j == i || j >= cap) { continue; }
          let o = snap[j];
          if (o.p.w >= o.v.w) { continue; }
          let rv = me.p.xyz - o.p.xyz;
          let d2 = dot(rv, rv);
          if (d2 < 1e-10 || d2 > rc2) { continue; }
          if (kind == 3u) {
            let r2 = max(d2, 0.04 * sig * sig);
            let sr2 = sig * sig / r2;
            let sr6 = sr2 * sr2 * sr2;
            let fm = clamp(24.0 * eps * (2.0 * sr6 * sr6 - sr6) / r2, -FMAX, FMAX);
            f += rv * fm;
          } else {
            let d = sqrt(d2);
            if (d < sig) { f += rv / d * (sig - d) * 120.0; }
            if (d2 < rr2) {
              let ot = o.m.w;
              let pair = (sp < 0.5 && ot > 0.5 && ot < 1.5) || (sp > 0.5 && sp < 1.5 && ot < 0.5);
              if (pair && rnd(&st) < S.mol.w * dt) { sp = 2.0; }
            }
          }
        }
      }
    }
  }
  if (kind == 4u && sp > 1.5 && rnd(&st) < S.mol2.w * dt) {
    sp = select(0.0, 1.0, rnd(&st) < 0.5);
  }
  var v = me.v.xyz;
  let fl = length(f);
  if (fl > FMAX) { f = f * (FMAX / fl); }
  v += f * dt;
  let gamma = S.mol3.y;
  v *= max(0.0, 1.0 - gamma * dt);
  let T = S.mol.x;
  let noise = vec3f(rnd(&st), rnd(&st), rnd(&st)) - vec3f(0.5);
  v += noise * sqrt(24.0 * gamma * T * dt);
  let sv = length(v);
  if (sv > 6.0) { v *= 6.0 / sv; }
  let Bh = S.phys4.x;
  let pos = me.p.xyz + v * dt;
  var local = pos - S.origin.xyz;
  let wx = wallFix(local.x, v.x, Bh);
  let wy = wallFix(local.y, v.y, Bh);
  let wz = wallFix(local.z, v.z, Bh);
  local = vec3f(wx.x, wy.x, wz.x);
  v = vec3f(wx.y, wy.y, wz.y);
  var outC: vec4f;
  if (kind == 3u) {
    outC = mix(S.colA, S.colB, clamp(length(v) / 1.2, 0.0, 1.0));
  } else {
    outC = select(select(S.colA, S.colB, sp > 0.5), S.colC, sp > 1.5);
  }
  let sz = sig * S.misc.x;
  parts[i] = Part(vec4f(S.origin.xyz + local, me.p.w + dt), vec4f(v, me.v.w), outC,
                  vec4f(sz, me.m.y, me.m.z, sp), vec4f(0.0));
}
`;

  // ---------------------------------------------------------------- wind field
  const WIND = /* wgsl */ `
@group(0) @binding(0) var<uniform> G: Glob;
@group(0) @binding(1) var<storage, read> comps: array<CompW>;
@group(0) @binding(2) var windOut: texture_storage_3d<rgba16float, write>;

struct CompW {
  a: vec4f,   // x, z, radius, type (0 directional,1 gust,2 tornado,3 radial)
  b: vec4f,   // strength m/s, bearing rad, frequency, enabled
};

fn h31(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}

fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(h31(i), h31(i + vec3f(1.0, 0.0, 0.0)), u.x),
              mix(h31(i + vec3f(0.0, 1.0, 0.0)), h31(i + vec3f(1.0, 1.0, 0.0)), u.x), u.y);
  let b = mix(mix(h31(i + vec3f(0.0, 0.0, 1.0)), h31(i + vec3f(1.0, 0.0, 1.0)), u.x),
              mix(h31(i + vec3f(0.0, 1.0, 1.0)), h31(i + vec3f(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}

// Curl of a vector potential built from three value-noise fields. The curl is divergence-free,
// so the swirl never creates sources or sinks: the grid turns over on itself, like a real eddy field.
fn noisePot(q: vec3f) -> vec3f {
  return vec3f(vnoise3(q), vnoise3(q + vec3f(17.3, 3.1, 9.7)), vnoise3(q + vec3f(5.2, 31.7, 1.9))) * 2.0 - 1.0;
}

fn curlNoise(q: vec3f) -> vec3f {
  let e = 0.05;
  let inv = 0.5 / e;
  let dAdx = (noisePot(q + vec3f(e, 0.0, 0.0)) - noisePot(q - vec3f(e, 0.0, 0.0))) * inv;
  let dAdy = (noisePot(q + vec3f(0.0, e, 0.0)) - noisePot(q - vec3f(0.0, e, 0.0))) * inv;
  let dAdz = (noisePot(q + vec3f(0.0, 0.0, e)) - noisePot(q - vec3f(0.0, 0.0, e))) * inv;
  return vec3f(dAdy.z - dAdz.y, dAdz.x - dAdx.z, dAdx.y - dAdy.x);
}

// Evaluates every enabled component on the voxel grid. Output rgb = velocity (m/s, already
// scaled by the global wind scale), a = magnitude. Linear superposition, like the reference
// HTML wind model (EvaluateWind), plus an animated turbulence term.
@compute @workgroup_size(4, 4, 4)
fn buildWind(@builtin(global_invocation_id) id: vec3u) {
  let dim = vec3u(G.windDim.xyz);
  if (id.x >= dim.x || id.y >= dim.y || id.z >= dim.z) { return; }
  let fid = vec3f(id);
  let wp = G.windMin.xyz + (fid + 0.5) / G.windDim.xyz * G.windSize.xyz;
  let t = G.timing.x;
  var acc = vec3f(0.0);
  let n = u32(G.windDim.w);
  for (var k = 0u; k < n; k++) {
    let c = comps[k];
    if (c.b.w < 0.5 || c.b.x == 0.0) { continue; }
    let typ = u32(c.a.w + 0.5);
    let S = c.b.x;
    let R = max(c.a.z, 0.5);
    let rel = vec2f(wp.x - c.a.x, wp.z - c.a.y);
    let rr = length(rel);
    let dirv = vec2f(sin(c.b.y), cos(c.b.y));
    let fall = max(0.0, 1.0 - (rr / R) * (rr / R));
    if (typ == 0u) {
      acc += vec3f(dirv.x, 0.0, dirv.y) * S;
    } else if (typ == 1u) {
      let front = dot(rel, dirv) * 0.08 - t * c.b.z * 0.6;
      let ph = fract(front);
      let env = exp(-pow((ph - 0.5) * 3.5, 2.0));
      acc += vec3f(dirv.x, 0.0, dirv.y) * S * env * fall * fall;
    } else if (typ == 2u) {
      let q = rr / R;
      let core = q * exp(1.0 - q);
      let inv = 1.0 / max(rr, 1e-3);
      let tang = vec2f(-rel.y, rel.x) * inv;
      let wob = 1.0 + 0.2 * sin(t * 2.0 + wp.y * 1.5);
      acc += vec3f(tang.x, 0.0, tang.y) * S * core * wob;
      acc += vec3f(-rel.x, 0.0, -rel.y) * inv * (0.25 * S * core);
      acc.y += S * 0.5 * core * clamp(1.0 - wp.y / G.windSize.y, 0.0, 1.0);
    } else {
      let outv = rel / max(rr, 1e-3);
      acc += vec3f(outv.x, 0.0, outv.y) * S * fall * fall;
    }
  }
  let turb = G.viz.w;
  if (turb > 0.0) {
    let q = wp * 0.45 + vec3f(t * 0.25, t * 0.13, t * 0.18);
    let nx = vnoise3(q);
    let ny = vnoise3(q + vec3f(17.3, 3.1, 9.7));
    let nz = vnoise3(q + vec3f(5.2, 31.7, 1.9));
    acc += (vec3f(nx, ny, nz) * 2.0 - 1.0) * turb * (1.0 + length(acc) * 0.2);
  }
  // Swirl: divergence-free curl noise, drifting in time so the arrows visibly turn over.
  let sw = G.swirl.x;
  if (sw > 0.0) {
    let tz = t * G.swirl.z;
    let q = wp * G.swirl.y + vec3f(tz, tz * 0.6, -tz * 0.8);
    acc += curlNoise(q) * sw;
  }
  acc *= G.timing.w;
  textureStore(windOut, vec3i(id), vec4f(acc, length(acc)));
}
`;

  // ---------------------------------------------------------------- rendering
  const RENDER = /* wgsl */ `
@group(0) @binding(0) var<uniform> G: Glob;
@group(0) @binding(1) var windTex: texture_3d<f32>;
@group(0) @binding(2) var windSamp: sampler;
@group(1) @binding(0) var<uniform> S: Sys;
@group(1) @binding(1) var<storage, read> parts: array<Part>;
@group(1) @binding(2) var<storage, read> segs: array<vec4f>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec4f,
  @location(2) ex: vec4f,
};

struct QO {
  @builtin(position) pos: vec4f,
  @location(0) s: f32,
  @location(1) inten: f32,
};

struct LI {
  @location(0) pos: vec3f,
  @location(1) col: vec4f,
};

struct LO {
  @builtin(position) pos: vec4f,
  @location(0) col: vec4f,
};

struct MI {
  @location(0) pos: vec3f,
  @location(1) norm: vec3f,
  @location(2) col: vec4f,
};

struct MO {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) norm: vec3f,
  @location(2) col: vec4f,
};

fn h21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn vnoise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2f(1.0, 0.0)), u.x),
             mix(h21(i + vec2f(0.0, 1.0)), h21(i + vec2f(1.0, 1.0)), u.x), u.y);
}

@vertex
fn vsPart(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  let q = parts[ii];
  if (!(q.p.w < q.v.w && q.c.a > 0.002 && q.m.x > 0.0)) { return o; }
  let cs = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
                           vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = cs[vi];
  let sz = q.m.x;
  let shape = u32(S.emit.z);
  var wp: vec3f;
  if (shape == 0u) {
    let ax = normalize(q.v.xyz + vec3f(0.0, 0.0001, 0.0));
    let toCam = normalize(G.camPos.xyz - q.p.xyz);
    var side = cross(ax, toCam);
    side = side / max(length(side), 1e-4);
    let L = sz * (1.1 + length(q.v.xyz) * 0.22);
    wp = q.p.xyz + ax * (c.y * L * 0.5) + side * (c.x * sz * 0.45);
  } else if (shape == 2u) {
    let sd = q.m.w;
    let ax = normalize(vec3f(hashF(sd, 1u) - 0.5, hashF(sd, 2u) - 0.5, hashF(sd, 3u) - 0.5)
                       + vec3f(0.0, 0.0001, 0.0));
    let local = vec3f(c.x * sz * 0.5, c.y * sz * 0.3, 0.0);
    wp = q.p.xyz + rotAxis(local, ax, q.m.y);
  } else if (shape == 5u) {
    // 📝 Coin: a disc in the plane of (cos a, 0, sin a) and up, so it flips edge-on as its spin angle turns.
    let h = sz * 0.5;
    let a = q.m.y;
    let flat = vec3f(c.x * h * cos(a), c.y * h, c.x * h * sin(a));
    let ax = normalize(vec3f(hashF(q.m.w, 1u) - 0.5, hashF(q.m.w, 2u) - 0.5, hashF(q.m.w, 3u) - 0.5)
                       + vec3f(0.0, 0.0001, 0.0));
    if (q.e.w > 0.5) {
      // 📝 Stacked coins lie flat: a disc in the horizontal plane.
      wp = q.p.xyz + vec3f(c.x * h * cos(a) - c.y * h * sin(a), 0.0, c.x * h * sin(a) + c.y * h * cos(a));
    } else {
      wp = q.p.xyz + rotAxis(flat, ax, 0.6 + hashF(q.m.w, 4u) * 0.8);
    }
  } else if (shape == 7u || shape == 8u) {
    let ca = cos(q.m.y);
    let sa = sin(q.m.y);
    let rc = vec2f(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    wp = q.p.xyz + G.camRight.xyz * (rc.x * sz * 0.52) + G.camUp.xyz * (rc.y * sz * 0.52);
  } else {
    wp = q.p.xyz + G.camRight.xyz * (c.x * sz * 0.5) + G.camUp.xyz * (c.y * sz * 0.5);
  }
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.uv = c;
  o.col = q.c;
  o.ex = vec4f(q.p.w / q.v.w, q.m.w, sz, 0.0);
  return o;
}

@fragment
fn fsPart(i: VO) -> @location(0) vec4f {
  let shape = u32(S.emit.z);
  var rgb = i.col.rgb;
  var a = 1.0;
  if (shape == 0u) {
    let x = abs(i.uv.x);
    a = pow(max(0.0, 1.0 - x), 2.0) * (1.0 - pow(abs(i.uv.y), 3.0) * 0.5);
    rgb = mix(rgb, vec3f(1.0), pow(max(0.0, 1.0 - x), 6.0) * 0.8);
  } else if (shape == 1u) {
    let r2 = dot(i.uv, i.uv);
    if (r2 > 1.0) { discard; }
    let n = vec3f(i.uv, sqrt(1.0 - r2));
    let L = normalize(vec3f(0.35, 0.55, 0.75));
    let nd = max(dot(n, L), 0.0);
    rgb = rgb * (0.3 + 0.7 * nd) + vec3f(0.6) * pow(nd, 16.0) * 0.35;
    a = smoothstep(1.0, 0.85, sqrt(r2));
  } else if (shape == 2u) {
    if (S.emit.w > 0.5) {
      if (abs(i.uv.y) > 0.6) { discard; }
      rgb = rgb * (0.85 + 0.15 * sin(i.ex.y + i.uv.x * 6.0));
    } else {
      let e = i.uv.x * i.uv.x + i.uv.y * i.uv.y * 2.8;
      if (e > 1.0) { discard; }
      let vein = exp(-i.uv.y * i.uv.y * 300.0) * step(abs(i.uv.x), 0.9);
      rgb = mix(rgb, rgb * 0.55, vein);
      rgb = rgb * (0.7 + 0.3 * sqrt(1.0 - e));
    }
  } else if (shape == 6u) {
    // 📝 Bubble: a thin transparent shell. Fresnel brightens the rim, a small highlight sits upper left, the body is nearly clear.
    let r2 = dot(i.uv, i.uv);
    if (r2 > 1.0) { discard; }
    let z = sqrt(1.0 - r2);
    let fres = pow(1.0 - z, 3.0);
    let L = normalize(vec3f(-0.4, 0.5, 0.75));
    let hl = pow(max(dot(vec3f(i.uv, z), L), 0.0), 40.0);
    rgb = rgb * 0.35 + vec3f(0.85, 0.95, 1.0) * fres + vec3f(1.0) * hl;
    a = clamp(0.06 + 0.85 * fres + 0.9 * hl, 0.0, 1.0) * smoothstep(1.0, 0.92, sqrt(r2));
  } else if (shape == 5u) {
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let rim = smoothstep(0.72, 1.0, r);
    rgb = rgb * (0.8 + 0.2 * (1.0 - r)) + vec3f(0.35) * rim;
    a = 1.0;
  } else if (shape == 7u) {
    // 📝 6-fold dendritic ice snowflake crystal
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let ang = atan2(i.uv.y, i.uv.x);
    let sec = 1.04719755;
    let folded = abs(ang - floor((ang + 0.5 * sec) / sec) * sec);
    let p = vec2f(cos(folded), sin(folded)) * r;
    let spine = smoothstep(0.085, 0.025, p.y) * smoothstep(0.96, 0.72, p.x);
    let b1 = smoothstep(0.065, 0.018, abs(p.y - max(p.x - 0.30, 0.0) * 0.72)) * step(0.30, p.x) * step(p.x, 0.68);
    let b2 = smoothstep(0.055, 0.016, abs(p.y - max(p.x - 0.58, 0.0) * 0.72)) * step(0.58, p.x) * step(p.x, 0.88);
    let core = smoothstep(0.24, 0.08, r);
    let crystal = clamp(max(max(spine, max(b1, b2)), core), 0.0, 1.0);
    let frost = exp(-r * r * 4.5) * 0.22;
    a = clamp(crystal * 0.96 + frost, 0.0, 1.0);
    if (a < 0.02) { discard; }
    rgb = mix(rgb, vec3f(1.0), crystal * 0.45);
  } else if (shape == 8u) {
    // 📝 Faceted translucent crystalline ice hailstone
    let r2 = dot(i.uv, i.uv);
    if (r2 > 1.0) { discard; }
    let r = sqrt(r2);
    let z = sqrt(1.0 - r2);
    let nSmooth = vec3f(i.uv, z);
    let nFacet = normalize(floor(nSmooth * 4.5 + 0.5) / 4.5);
    let n = normalize(mix(nSmooth, nFacet, 0.68));
    let L = normalize(vec3f(-0.35, 0.62, 0.70));
    let nd = max(dot(n, L), 0.0);
    let spec = pow(nd, 32.0);
    let fres = pow(1.0 - z, 2.2);
    rgb = mix(rgb * (0.58 + 0.42 * nd), vec3f(0.88, 0.96, 1.0), fres * 0.55) + vec3f(1.0) * spec * 0.9;
    a = smoothstep(1.0, 0.82, r) * clamp(0.68 + 0.32 * fres + 0.45 * spec, 0.0, 1.0);
  } else {
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let n = vnoise2(i.uv * 2.5 + vec2f(i.ex.y * 0.001, i.ex.x * 3.0));
    a = exp(-r * r * 3.5) * (0.6 + 0.8 * n) * (1.0 - r * r * 0.3);
    a = clamp(a, 0.0, 1.0);
  }
  let alpha = clamp(a * i.col.a, 0.0, 1.0);
  return vec4f(rgb * alpha, alpha);
}

// 📝 Cubes: 36 vertices per cube, six faces, shaded by face normal. Used by cube particles and derez children.
struct CO {
  @builtin(position) pos: vec4f,
  @location(0) col: vec4f,
  @location(1) shade: f32,
};

struct CV {
  p: vec3f,
  n: vec3f,
};

fn cubeCorner(k: u32) -> vec2f {
  let cs = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
                           vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  return cs[k];
}

fn cubeVert(vi: u32) -> CV {
  let f = vi / 6u;
  let ax = f / 2u;
  let sg = select(-1.0, 1.0, (f % 2u) == 0u);
  let c = cubeCorner(vi % 6u);
  var p = vec3f(0.0);
  p[ax] = 0.5 * sg;
  p[(ax + 1u) % 3u] = c.x * 0.5;
  p[(ax + 2u) % 3u] = c.y * 0.5;
  var n = vec3f(0.0);
  n[ax] = sg;
  return CV(p, n);
}

fn cubeShade(n: vec3f) -> f32 {
  return 0.45 + 0.55 * max(dot(n, normalize(vec3f(0.35, 0.8, 0.45))), 0.0);
}

@vertex
fn vsCube(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> CO {
  var o: CO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  let q = parts[ii];
  if (!(q.p.w < q.v.w && q.c.a > 0.002 && q.m.x > 0.0)) { return o; }
  // 📝 Morphing transitions: a piece is a cube only until its release time, then it becomes a butterfly.
  if (S.mol2.y > 0.5 && q.p.w >= q.e.x) { return o; }
  let cv = cubeVert(vi);
  let ax = normalize(vec3f(hashF(q.m.w, 1u) - 0.5, hashF(q.m.w, 2u) - 0.5, hashF(q.m.w, 3u) - 0.5)
                     + vec3f(0.0, 0.0001, 0.0));
  // 📝 Glitch: after release, each cube jumps in blocky steps (it moves 12 times a second).
  var jit = vec3f(0.0);
  if (S.mol2.x > 1.5 && q.p.w >= q.e.x) {
    let stepI = floor(q.p.w * 12.0);
    jit = (vec3f(hashF(q.m.w + stepI, 5u), hashF(q.m.w + stepI, 6u), hashF(q.m.w + stepI, 7u)) - vec3f(0.5)) * 0.12;
  }
  let wp = q.p.xyz + jit + rotAxis(cv.p * q.m.x, ax, q.m.y);
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.col = q.c;
  o.shade = cubeShade(rotAxis(cv.n, ax, q.m.y));
  return o;
}

// 📝 Derez children: each derez cube that hit the floor splits into 8 half-size cubes that burst off the impact point,
//    fall under gravity, rest on the floor and fade. Children are not particles and do not collide.
@vertex
fn vsShatter(@builtin(vertex_index) vi: u32) -> CO {
  var o: CO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  let pi = vi / 288u;
  let rem = vi % 288u;
  let child = rem / 36u;
  let q = parts[pi];
  if (q.e.y <= 0.0 || q.m.x <= 0.0) { return o; }
  let t = S.phys.y - (q.e.y - 1.0);
  let life = S.mol3.w;
  if (t < 0.0 || t >= life) { return o; }
  let cs = q.m.x * 0.5;
  let sc = q.m.w + f32(child) * 13.0;
  let oc = vec3f(f32(child & 1u), f32((child >> 1u) & 1u), f32((child >> 2u) & 1u)) * 2.0 - 1.0;
  let h = vec3f(hashF(sc, 1u), hashF(sc, 2u), hashF(sc, 3u));
  let dirv = normalize(oc * 0.5 + (h - 0.5) * 0.8 + vec3f(0.0, 0.9, 0.0));
  let speed = mix(1.2, 2.8, hashF(sc, 4u));
  let g = -S.speed.w * 9.81;
  var cp = q.p.xyz + vec3f(oc.x * cs * 0.5, 0.0, oc.z * cs * 0.5) + dirv * speed * t
         + vec3f(0.0, 0.5 * g * t * t, 0.0);
  cp.y = max(cp.y, cs * 0.5);
  let fade = 1.0 - smoothstep(0.6 * life, life, t);
  let ax = normalize(h - 0.5 + vec3f(0.0, 0.0001, 0.0));
  let ang = (hashF(sc, 5u) - 0.5) * 8.0 * t;
  let cv = cubeVert(vi % 36u);
  let wp = cp + rotAxis(cv.p * cs, ax, ang);
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.col = vec4f(q.c.rgb, q.c.a * fade);
  o.shade = cubeShade(rotAxis(cv.n, ax, ang));
  return o;
}

@fragment
fn fsCube(i: CO) -> @location(0) vec4f {
  let a = clamp(i.col.a, 0.0, 1.0);
  return vec4f(i.col.rgb * i.shade * a, a);
}

// 📝 Butterflies (dissolve into butterflies): a released piece becomes a flapping two-pair silhouette, billboarded to the camera.
// The wings open and close with cos(flap), foreshortening their width. Colour is a per-piece blend of the system's two colours.
@vertex
fn vsFly(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VO {
  var o: VO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  let q = parts[ii];
  if (S.mol2.y < 0.5) { return o; }
  if (!(q.p.w < q.v.w && q.c.a > 0.002 && q.m.x > 0.0 && q.p.w >= q.e.x)) { return o; }
  let cs = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
                           vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = cs[vi];
  let sd = q.m.w;
  let age = q.p.w;
  let rate = 9.0 + 5.0 * hashF(sd, 6u);
  let flap = cos(age * rate + 6.2831853 * hashF(sd, 7u));
  let wingW = 0.2 + 0.8 * abs(flap);
  let sz = q.m.x * 5.0;
  let wp = q.p.xyz + G.camRight.xyz * (c.x * sz * 0.5) + G.camUp.xyz * (c.y * sz * 0.5);
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.uv = c;
  o.ex = vec4f(wingW, flap, 0.0, 0.0);
  o.col = vec4f(mix(S.colA.rgb, S.colB.rgb, hashF(sd, 8u)), q.c.a);
  return o;
}

@fragment
fn fsFly(i: VO) -> @location(0) vec4f {
  let wingW = max(i.ex.x, 0.15);
  let x = abs(i.uv.x);
  let xs = x / wingW;                 // unfold the wing by its foreshortening
  let y = i.uv.y;
  // Forewing: large ellipse above the centre line. Hindwing: smaller ellipse below.
  let dF = length(vec2f((xs - 0.5) / 0.5, (y - 0.3) / 0.35));
  let dH = length(vec2f((xs - 0.4) / 0.36, (y + 0.3) / 0.26));
  let dMin = min(dF, dH);
  let wing = 1.0 - smoothstep(0.85, 1.0, dMin);
  let body = (1.0 - smoothstep(0.03, 0.05, x)) * step(abs(y), 0.6);
  if (wing < 0.01 && body < 0.01) { discard; }
  let edge = 0.75 + 0.5 * (1.0 - min(dMin, 1.0));
  let rgb = mix(i.col.rgb * edge, vec3f(0.08), body);
  let a = max(wing, body) * i.col.a;
  return vec4f(rgb * a, a);
}

fn segQuad(a: vec3f, b: vec3f, wa: f32, wb: f32, vi: u32) -> vec4f {
  let cs = array<vec2f, 6>(vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0),
                           vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let c = cs[vi];
  let dir = normalize(b - a + vec3f(1e-6));
  let mid = (a + b) * 0.5;
  let toCam = normalize(G.camPos.xyz - mid);
  var side = cross(dir, toCam);
  side = side / max(length(side), 1e-5);
  let w = mix(wa, wb, c.x);
  let p = mix(a, b, c.x) + side * (c.y * w);
  return vec4f(p, c.y);
}

// Lightning: each segment is two vec4 in the segs buffer: (a.xyz, width), (b.xyz, intensity).
@vertex
fn vsSeg(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> QO {
  var o: QO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  let a0 = segs[2u * ii];
  let b0 = segs[2u * ii + 1u];
  if (b0.w <= 0.0001) { return o; }
  let q = segQuad(a0.xyz, b0.xyz, a0.w, a0.w * 0.8, vi);
  o.pos = G.viewProj * vec4f(q.xyz, 1.0);
  o.s = q.w;
  o.inten = b0.w;
  return o;
}

@fragment
fn fsSeg(i: QO) -> @location(0) vec4f {
  let s = i.s;
  let glow = exp(-s * s * 4.0);
  let core = exp(-s * s * 60.0);
  let col = (vec3f(0.35, 0.6, 1.0) * glow * 0.9 + vec3f(1.0) * core) * i.inten;
  return vec4f(col, 1.0);
}

fn colormap(t: f32) -> vec3f {
  let a = vec3f(0.15, 0.35, 1.0);
  let b = vec3f(0.2, 0.9, 0.9);
  let c = vec3f(1.0, 0.85, 0.2);
  let d = vec3f(1.0, 0.25, 0.15);
  if (t < 0.33) { return mix(a, b, t / 0.33); }
  if (t < 0.66) { return mix(b, c, (t - 0.33) / 0.33); }
  return mix(c, d, (t - 0.66) / 0.34);
}

fn engineeringColormap(t: f32) -> vec3f {
  let u = clamp(max(0.20, t), 0.0, 1.0) * 4.0;
  let s0 = vec3f(0.059, 0.110, 0.149);
  let s1 = vec3f(0.180, 0.431, 0.490);
  let s2 = vec3f(0.349, 0.651, 0.431);
  let s3 = vec3f(0.831, 0.710, 0.400);
  let s4 = vec3f(0.910, 0.420, 0.310);
  if (u < 1.0) { return mix(s0, s1, u); }
  if (u < 2.0) { return mix(s1, s2, u - 1.0); }
  if (u < 3.0) { return mix(s2, s3, u - 2.0); }
  return mix(s3, s4, u - 3.0);
}

fn dirSpectrumColormap(dir: vec3f, t: f32) -> vec3f {
  // Smooth VectorayGen-style 3D vector direction spectrum (cyan/emerald/gold/orange/violet/magenta)
  let h = fract(atan2(dir.z, dir.x) * 0.15915494 + 0.5 + dir.y * 0.16);
  let k = vec3f(1.0, 2.0 / 3.0, 1.0 / 3.0);
  let p = abs(fract(vec3f(h) + k) * 6.0 - 3.0);
  let rgb = clamp(p - 1.0, vec3f(0.0), vec3f(1.0));
  let vivid = mix(vec3f(0.86), rgb, 0.78);
  return vivid * (0.58 + 0.38 * clamp(t, 0.0, 1.0));
}

fn flowDashColormap(t: f32) -> vec3f {
  // Holst-style terracotta-to-warm-ivory ramp
  let u = clamp(t, 0.0, 1.0);
  let lo = vec3f(0.62, 0.22, 0.16);
  let mid = vec3f(0.88, 0.52, 0.38);
  let hi = vec3f(0.97, 0.91, 0.87);
  if (u < 0.55) { return mix(lo, mid, u / 0.55); }
  return mix(mid, hi, (u - 0.55) / 0.45);
}

// 3D Vector Field Arrows (VectorayGen / VectorFieldVisualizer shaft + sharp cone, zero glow).
@vertex
fn vsArrow(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> MO {
  var o: MO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  o.wp = vec3f(0.0);
  o.norm = vec3f(0.0, 1.0, 0.0);
  o.col = vec4f(0.0);
  let gx = u32(G.windDim.x);
  let gy = u32(G.windDim.y);
  let x = ii % gx;
  let y = (ii / gx) % gy;
  let z = ii / (gx * gy);
  // Density: G.swirl.w is the arrow stride. Only every stride-th voxel on each axis draws an arrow.
  let st = max(1u, u32(G.swirl.w));
  if (x % st != 0u || y % st != 0u || z % st != 0u) { return o; }
  let v = textureLoad(windTex, vec3i(i32(x), i32(y), i32(z)), 0).xyz;
  let mag = length(v);
  if (mag < 0.05) { return o; }
  let cell = G.windSize.xyz / G.windDim.xyz;
  let wp = G.windMin.xyz + (vec3f(f32(x), f32(y), f32(z)) + 0.5) * cell;
  let dir = v / mag;
  let refUp = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(dir.y) < 0.96);
  let right = normalize(cross(refUp, dir));
  let fwd = cross(dir, right);
  let t = clamp(mag / max(1.0, G.viz.x), 0.0, 1.0);
  let style = u32(G.viz.y + 0.5);
  let lenScale = min(cell.x, cell.z) * (0.68 + 0.95 * t);
  let thickScale = (0.74 + 0.44 * t) * 0.65;

  var lp = vec3f(0.0);
  var ln = vec3f(0.0, 1.0, 0.0);
  let stepAng = 1.04719755;
  let isDash = style == 2u;
  if (vi < 36u) {
    let seg = vi / 6u;
    let c = vi % 6u;
    let a0 = f32(seg) * stepAng;
    let a1 = f32(seg + 1u) * stepAng;
    let amid = 0.5 * (a0 + a1);
    let rs = select(0.024, 0.042, isDash);
    let y0 = select(-0.36, -0.34, isDash);
    let y1 = select(0.24, 0.34, isDash);
    let p00 = vec3f(cos(a0) * rs, y0, sin(a0) * rs);
    let p10 = vec3f(cos(a1) * rs, y0, sin(a1) * rs);
    let p01 = vec3f(cos(a0) * rs, y1, sin(a0) * rs);
    let p11 = vec3f(cos(a1) * rs, y1, sin(a1) * rs);
    var verts = array<vec3f, 6>(p00, p10, p01, p10, p11, p01);
    lp = verts[c];
    ln = normalize(vec3f(cos(amid), 0.0, sin(amid)));
  } else {
    if (isDash) { return o; }
    let tri = (vi - 36u) / 3u;
    let c = (vi - 36u) % 3u;
    let a0 = f32(tri) * stepAng;
    let a1 = f32(tri + 1u) * stepAng;
    let amid = 0.5 * (a0 + a1);
    let rc = 0.080;
    let y0 = 0.24;
    let yTip = 0.64;
    var verts = array<vec3f, 3>(
      vec3f(cos(a0) * rc, y0, sin(a0) * rc),
      vec3f(cos(a1) * rc, y0, sin(a1) * rc),
      vec3f(0.0, yTip, 0.0)
    );
    lp = verts[c];
    ln = normalize(vec3f(cos(amid), 0.28, sin(amid)));
  }

  let worldPos = wp + right * (lp.x * thickScale) + dir * (lp.y * lenScale) + fwd * (lp.z * thickScale);
  o.pos = G.viewProj * vec4f(worldPos, 1.0);
  o.wp = worldPos;
  o.norm = right * ln.x + dir * ln.y + fwd * ln.z;
  var rgb = dirSpectrumColormap(dir, t);
  if (style == 1u) { rgb = engineeringColormap(t); }
  else if (style == 2u) { rgb = flowDashColormap(t); }
  o.col = vec4f(rgb, 0.94);
  return o;
}

@fragment
fn fsArrow(i: MO) -> @location(0) vec4f {
  let V = normalize(G.camPos.xyz - i.wp + vec3f(1e-5));
  var N = normalize(i.norm + vec3f(0.0, 1e-5, 0.0));
  if (dot(N, V) < 0.0) { N = -N; }
  let L1 = normalize(vec3f(0.45, 0.85, 0.35));
  let L2 = normalize(vec3f(-0.62, 0.35, -0.52));
  let d1 = max(dot(N, L1), 0.0);
  let d2 = max(dot(N, L2), 0.0);
  let lit = i.col.rgb * (0.48 + 0.44 * d1 + 0.18 * d2);
  return vec4f(lit * i.col.a, i.col.a);
}

@vertex
fn vsFloor(@builtin(vertex_index) vi: u32) -> VO {
  let cs = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
                           vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = cs[vi] * 60.0;
  var o: VO;
  o.uv = c;
  o.pos = G.viewProj * vec4f(c.x, 0.0, c.y, 1.0);
  return o;
}

@fragment
fn fsFloor(i: VO) -> @location(0) vec4f {
  let g = abs(fract(i.uv - 0.5) - 0.5) / fwidth(i.uv);
  let line = 1.0 - clamp(min(g.x, g.y), 0.0, 1.0);
  let dist = length(i.uv - G.camPos.xz);
  let fade = exp(-dist * 0.06);
  let base = vec3f(0.055, 0.058, 0.068);
  return vec4f(base + vec3f(0.19, 0.21, 0.25) * line * fade, 1.0);
}

@vertex
fn vsLine(i: LI) -> LO {
  var o: LO;
  o.pos = G.viewProj * vec4f(i.pos, 1.0);
  o.col = i.col;
  return o;
}

@fragment
fn fsLine(i: LO) -> @location(0) vec4f {
  return vec4f(i.col.rgb * i.col.a, i.col.a);
}

@vertex
fn vsMesh(i: MI) -> MO {
  var o: MO;
  o.pos = G.viewProj * vec4f(i.pos, 1.0);
  o.wp = i.pos;
  o.norm = i.norm;
  o.col = i.col;
  return o;
}

@fragment
fn fsMesh(i: MO) -> @location(0) vec4f {
  let V = normalize(G.camPos.xyz - i.wp + vec3f(1e-5));
  var N = normalize(i.norm + vec3f(0.0, 1e-5, 0.0));
  if (dot(N, V) < 0.0) { N = -N; }
  let L1 = normalize(vec3f(0.45, 0.85, 0.35));
  let L2 = normalize(vec3f(-0.62, 0.35, -0.52));
  let d1 = max(dot(N, L1), 0.0);
  let d2 = max(dot(N, L2), 0.0);
  let H = normalize(L1 + V);
  let spec = pow(max(dot(N, H), 0.0), 18.0) * 0.06;
  let rim = pow(1.0 - max(dot(N, V), 0.0), 2.4) * 0.14;
  let lit = i.col.rgb * (0.52 + 0.38 * d1 + 0.18 * d2) + vec3f(spec + rim * 0.35) * i.col.rgb;
  let a = clamp(i.col.a, 0.0, 1.0);
  return vec4f(lit * a, a);
}
`;

  // Light fibres (Strand Editor port + After-Effects Silk/Stream/Flower/Curl/Void visualizations).
  // Struct Fib is packed by PE.fillFibre in fibres.js; keep the two in step.
  const FIBRE = /* wgsl */ `
struct Fib {
  org: vec4f,     // xyz origin, w scale
  dir: vec4f,     // xyz direction in local axes, w windMix (force-field coupling)
  p0: vec4f,      // x length, y spread, z amplitude, w frequency / petals
  p1: vec4f,      // x sheet width / void radius, y ripple, z waves, w phase spread / twist
  p2: vec4f,      // x trail length, y loop fraction, z thickness px, w taper
  p3: vec4f,      // x intensity, y halo, z baseline, w light window
  p4: vec4f,      // x accent mix, y pulse depth, z projection scale px/m at w=1, w pixel scale
  p5: vec4f,      // x harmonic, y light heads per loop, z pulse rate per loop, w pulse shape
  p6: vec4f,      // x shape (0 streak, 1 ribbon, 2 trail, 3 blossom, 4 stream, 5 burst, 6 curl, 7 void), y strands, z segments, w seed
  p7: vec4f,      // x path samples, y spark share, z spark size (m), w spark brightness
  p8: vec4f,      // x viewport width px, y viewport height px, z stop count, w colour mode (0 solid, 1 ramp, 2 palette)
  colC: vec4f,    // rgb accent, w bokeh share (0..1)
  stopC: array<vec4f, 8>,   // colour stops (rgb)
  stopP: array<vec4f, 2>,   // stop positions 0..1 (8 floats)
};

@group(0) @binding(0) var<uniform> G: Glob;
@group(0) @binding(1) var windTex: texture_3d<f32>;
@group(0) @binding(2) var windSamp: sampler;
@group(1) @binding(0) var<uniform> FB: Fib;
@group(1) @binding(1) var<storage, read> FPath: array<vec4f>;

const FTAU: f32 = 6.283185307;
const FPI: f32 = 3.14159265;
const FGOLDEN: f32 = 2.39996323;

fn fbHash(k0: u32) -> u32 {
  var k = k0;
  k ^= k >> 16u;
  k *= 0x7feb352du;
  k ^= k >> 15u;
  k *= 0x846ca68bu;
  k ^= k >> 16u;
  return k;
}

fn fbUnit(id: f32, salt: f32) -> f32 {
  let key = u32(id) * 747796405u + u32(salt) * 2891336453u + u32(FB.p6.w) * 196613u;
  return f32(fbHash(key)) * (1.0 / 4294967296.0);
}

fn fbLocalAxis() -> vec3f {
  let d = FB.dir.xyz;
  return select(vec3f(1.0, 0.0, 0.0), normalize(d), length(d) > 1e-5);
}

// Streak: a cubic Bezier from a root cluster to a reach, wobbling with the loop phase.
fn fbBezier(s: f32, id: f32) -> vec3f {
  let len = FB.p0.x;
  let spread = FB.p0.y;
  let amp = FB.p0.z;
  let k = max(1.0, floor(FB.p0.w + 0.5));
  let axis = fbLocalAxis();
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(axis.y) > 0.9);
  let lateral = normalize(cross(up, axis));
  let normal = cross(axis, lateral);
  let angle = FTAU * fbUnit(id, 1.0);
  let radius = spread * sqrt(fbUnit(id, 2.0));
  let root = (lateral * cos(angle) + normal * sin(angle)) * radius;
  let tipAngle = FTAU * fbUnit(id, 3.0);
  let tipRadius = spread * 1.6 * sqrt(fbUnit(id, 4.0));
  let reach = axis * len + (lateral * cos(tipAngle) + normal * sin(tipAngle)) * tipRadius;
  let wt = FTAU * FB.p2.y * FB.p5.x;
  let c1 = root + axis * (len * 0.34)
         + (lateral * sin(k * wt + FTAU * fbUnit(id, 5.0)) + normal * cos(2.0 * k * wt + FTAU * fbUnit(id, 6.0))) * amp;
  let c2 = reach - axis * (len * 0.34)
         + (lateral * sin(k * wt + FTAU * fbUnit(id, 7.0)) + normal * sin(2.0 * k * wt + FTAU * fbUnit(id, 8.0))) * amp;
  let u = 1.0 - s;
  return u * u * u * root + 3.0 * u * u * s * c1 + 3.0 * u * s * s * c2 + s * s * s * reach;
}

// Ribbon: a sheet of fibres across SheetWidth, rippling in lift.
fn fbWave(s: f32, id: f32) -> vec3f {
  let across = (id + 0.5) / FB.p6.y - 0.5;
  let along = (s - 0.5) * FB.p0.x;
  let wt = FTAU * FB.p2.y * FB.p5.x;
  let lift = FB.p1.y * (sin(along * FB.p1.z + wt + across * FB.p1.w * FTAU) * 0.7
           + sin(across * FB.p1.x * FB.p1.z * 0.5 - 2.0 * wt + along * 0.35) * 0.3);
  return vec3f(along, across * FB.p1.x, lift);
}

fn fbPathPoint(f: f32) -> vec3f {
  let n = i32(FB.p7.x);
  let pos = fract(f) * f32(n);
  let idx = clamp(i32(floor(pos)), 0, n - 1);
  let nxt = select(idx + 1, 0, idx + 1 >= n);
  let r = pos - f32(idx);
  return mix(FPath[idx].xyz, FPath[nxt].xyz, r);
}

fn fbPathTangent(f: f32) -> vec3f {
  let step = 1.0 / FB.p7.x;
  let span = fbPathPoint(f + step) - fbPathPoint(f - step);
  return select(vec3f(1.0, 0.0, 0.0), normalize(span), length(span) > 1e-7);
}

// Trail: a bundle of fibres riding the path, each covering TrailLength of the loop behind its head.
fn fbTrail(s: f32, id: f32) -> vec3f {
  let lf = FB.p2.y;
  let harm = FB.p5.x;
  let head = fract(fbUnit(id, 9.0) * FB.p1.w / FTAU + lf * harm);
  let arc = fract(head - FB.p2.x * (1.0 - s));
  let axis = fbPathTangent(arc);
  let side = normalize(cross(axis, vec3f(0.0, 0.0, 1.0)));
  let angle = FTAU * fbUnit(id, 3.0);
  let radius = FB.p0.y * sqrt(fbUnit(id, 4.0));
  let k = max(1.0, floor(FB.p0.w + 0.5));
  let wob = FB.p0.z * s * sin(FTAU * k * s + FTAU * fbUnit(id, 5.0) + FTAU * lf * harm);
  return fbPathPoint(arc) + (side * cos(angle) + vec3f(0.0, 0.0, sin(angle))) * radius + side * wob;
}

// Curl-noise field helper: divergence-free 3D curl field for silky ribbon folds and oceanic eddies.
fn fbCurlSample(p: vec3f) -> vec3f {
  let f = max(0.3, FB.p1.z);
  let px = p * f;
  let dpsi_dy = cos(px.y * 1.1) * 1.1 - sin(px.y * 1.9 - px.z * 0.7) * 0.6;
  let dpsi_dz = -sin(px.z * 1.3) * 1.1 + cos(px.z * 1.7 + px.x * 0.8) * 0.6;
  let dpsi_dx = cos(px.x * 1.2) * 1.1 + sin(px.x * 1.8 - px.y * 0.6) * 0.6;
  return vec3f(dpsi_dy - dpsi_dz, dpsi_dz - dpsi_dx, dpsi_dx - dpsi_dy);
}

// Blossom (3): 3-layer curl-noise flower — inner stamen crown + dark outer ghost veil + 5 ruffled curl-displaced petals.
fn fbBlossom(s: f32, id: f32) -> vec3f {
  let role = fbUnit(id, 19.0);
  let spread = max(FB.p0.y, 0.2);
  let amp = FB.p0.z;
  let curlAmt = max(0.0, FB.p1.y);
  if (role < 0.28) {
    let theta = id * FGOLDEN + fbUnit(id, 20.0) * 0.55;
    let flare = 0.04 + 0.34 * pow(fbUnit(id, 21.0), 0.72);
    let r = spread * flare * pow(s, 1.18);
    let h = amp * (0.98 + 0.44 * fbUnit(id, 22.0)) * (s + 0.14 * sin(s * FPI));
    let baseP = vec3f(cos(theta) * r, sin(theta) * r, h);
    let c = fbCurlSample(baseP * 0.75 + vec3f(1.2, 2.3, 0.7));
    return baseP + c * (0.14 * curlAmt * pow(s, 1.4));
  }
  let isGhost = role < 0.44;
  let strands = max(FB.p6.y, 1.0);
  let petals = clamp(floor(FB.p0.w + 0.5), 3.0, 12.0);
  let u = (id + 0.5) / strands;
  let tier = floor(fbUnit(id, 21.0) * 3.0) - 1.0;
  let theta = u * FTAU + 0.24 * sin(u * FTAU * petals + fbUnit(id, 20.0) * 0.2);
  let petalWave = cos(petals * theta + 0.62 * s);
  let scallop = 0.055 * sin(petals * 3.0 * theta) * s * s;
  let reachScale = select(1.0, 1.18, isGhost);
  let reach = spread * reachScale * (0.68 + 0.28 * petalWave + scallop) * (0.86 + 0.20 * fbUnit(id, 22.0));
  let r = reach * pow(s, 0.76);
  let cupScale = select(1.0, 0.62, isGhost);
  let cup = amp * cupScale * (sin(s * 2.30) * 0.54 + 0.34 * petalWave * s * s + 0.14 * tier * s - 0.18 * s * s * s);
  let baseP = vec3f(cos(theta) * r, sin(theta) * r, cup);
  let c1 = fbCurlSample(baseP * 0.58 + vec3f(0.5, -1.1, 0.8));
  let c2 = fbCurlSample(baseP * 1.28 + vec3f(3.7, -1.9, 5.1));
  let disp = (c1 * 0.68 + c2 * 0.32) * (0.28 * curlAmt * pow(s, 1.35));
  return baseP + vec3f(disp.x * 0.72, disp.y * 0.72, disp.z * 0.58);
}

// Stream (4): still sculptural After-Effects silk stream curving upward into curled split wisps.
fn fbStream(s: f32, id: f32) -> vec3f {
  let strands = max(FB.p6.y, 1.0);
  let u = (id + 0.5) / strands - 0.5;
  let len = FB.p0.x;
  let along = (s - 0.42) * len;
  let sweep = FB.p0.z * pow(max(0.0, s - 0.12) / 0.88, 2.25);
  let flare = smoothstep(0.45, 1.0, s);
  let curl = FB.p1.y * sin(s * 4.6 + u * 2.6) * flare;
  let width = FB.p0.y * mix(0.24, 1.45, pow(s, 1.25)) * (0.76 + 0.24 * cos(u * 10.0));
  let twist = FB.p1.w * s * s;
  let fork = sign(u) * smoothstep(0.68, 1.0, s) * FB.p1.y * 0.52;
  let jitter = (fbUnit(id, 23.0) - 0.5) * 0.12 * FB.p0.y * s;
  let lateral = u * width + jitter;
  return vec3f(
    along + curl * 0.42 + sin(s * 3.1) * 0.18 * FB.p1.y,
    cos(twist) * lateral + fork * 0.38,
    sweep + sin(twist) * lateral * 0.82 + curl
  );
}

// Burst (5): poised upward fiber-optic anemone bouquet with dense central core & sweeping outer tendrils.
fn fbBurst(s: f32, id: f32) -> vec3f {
  let theta = id * FGOLDEN + fbUnit(id, 1.0) * 0.42;
  let cone = clamp(FB.p0.y, 0.2, 2.8);
  let elev = (0.04 + 0.96 * pow(fbUnit(id, 2.0), 1.32)) * cone;
  let len = FB.p0.x * (0.68 + 0.52 * fbUnit(id, 3.0));
  let r = sin(elev) * len * pow(s, 0.92);
  let up = cos(elev) * len * s;
  let ph = fbUnit(id, 5.0) * FTAU;
  let bend = FB.p0.z * s * s * sin(s * 2.3 + ph);
  let bend2 = FB.p0.z * s * s * cos(s * 2.1 + ph * 1.3);
  return vec3f(cos(theta) * r + bend * 0.45, sin(theta) * r + bend2 * 0.45, up);
}

fn fbCurl(s: f32, id: f32) -> vec3f {
  let band = floor(fbUnit(id, 15.0) * 5.0);
  let a = (band / 5.0) * FTAU + (fbUnit(id, 16.0) - 0.5) * 0.65;
  let rad = FB.p0.y * (0.25 + 0.75 * sqrt(fbUnit(id, 17.0)));
  var p = vec3f(cos(a) * rad, sin(a) * rad, (fbUnit(id, 18.0) - 0.5) * FB.p0.z);
  let stepLen = (FB.p0.x / 8.0) * s;
  let curlAmt = max(0.25, FB.p1.y);
  for (var k = 0; k < 8; k++) {
    let v = normalize(fbCurlSample(p) + vec3f(0.18, 0.08, 0.12));
    p += v * stepLen * curlAmt * 0.45;
  }
  return p;
}

// Void (7): radial silk filaments streaming cleanly around a crisp central void core.
fn fbVoid(s: f32, id: f32) -> vec3f {
  let rv = max(0.32, FB.p1.x * 0.36);
  let strands = max(FB.p6.y, 1.0);
  let u = (id + 0.5) / strands;
  let theta = u * FTAU + (fbUnit(id, 1.0) - 0.5) * (FTAU / strands) * 0.7;
  let tilt = (fbUnit(id, 2.0) - 0.5) * clamp(FB.p0.y, 0.15, 1.8);
  let r = rv + s * FB.p0.x;
  let swirl = FB.p0.z * sin(s * 4.4 + theta * 2.0) * smoothstep(0.0, 0.35, s) * 0.45;
  let phi = theta + swirl / max(r, 0.25);
  return vec3f(cos(phi) * cos(tilt) * r, sin(phi) * cos(tilt) * r, sin(tilt) * r + swirl * 0.28);
}

fn fbCurve(s: f32, id: f32) -> vec3f {
  let shape = i32(FB.p6.x + 0.5);
  if (shape == 7) { return fbVoid(s, id); }
  if (shape == 6) { return fbCurl(s, id); }
  if (shape == 5) { return fbBurst(s, id); }
  if (shape == 4) { return fbStream(s, id); }
  if (shape == 3) { return fbBlossom(s, id); }
  if (shape == 2) { return fbTrail(s, id); }
  if (shape == 1) { return fbWave(s, id); }
  return fbBezier(s, id);
}

// Local (path plane XY, lift Z) to the editor's Y-up world, then scaled, placed, and wind-deflected.
fn fbWindOffset(wp: vec3f, s: f32) -> vec3f {
  let mixAmt = FB.dir.w;
  if (abs(mixAmt) < 1e-4) { return vec3f(0.0); }
  let uvw = clamp((wp - G.windMin.xyz) / max(G.windSize.xyz, vec3f(0.01)), vec3f(0.0), vec3f(1.0));
  let vel = textureSampleLevel(windTex, windSamp, uvw, 0.0).xyz;
  return vel * (0.28 * mixAmt * s * s);
}

fn fbWorldAt(local: vec3f, s: f32) -> vec3f {
  let wp = FB.org.xyz + vec3f(local.x, local.z, local.y) * FB.org.w;
  return wp + fbWindOffset(wp, s);
}

fn fbWorldDir(local: vec3f) -> vec3f {
  return vec3f(local.x, local.z, local.y);
}

fn fbPeriodicGap(a: f32, b: f32) -> f32 {
  let g = abs(fract(a) - fract(b));
  return min(g, 1.0 - g);
}

fn fbPulseLevel(cycle: f32) -> f32 {
  if (i32(FB.p5.w) == 1) {
    let first = exp(-pow(fbPeriodicGap(cycle, 0.10) / 0.045, 2.0));
    let second = 0.55 * exp(-pow(fbPeriodicGap(cycle, 0.27) / 0.055, 2.0));
    return clamp(first + second, 0.0, 1.0);
  }
  return 0.5 - 0.5 * cos(FTAU * cycle);
}

// One front runs along the fibre once per cycle, then holds and fades. Edges ascend in every smoothstep.
fn fbSweep(pos: f32, cycle: f32) -> f32 {
  let front = -0.03 + 1.06 * min(cycle / 0.45, 1.0);
  let done = smoothstep(1.0, 1.01, front - 0.02);
  let origin = mix(smoothstep(0.0, 0.04, pos), 1.0, done);
  let body = origin * (1.0 - smoothstep(front - 0.02, front + 0.005, pos));
  let off = (pos - (front - 0.012)) / 0.012;
  let ridge = origin * exp(-0.5 * off * off) * smoothstep(0.0, 0.04, cycle)
            * (1.0 - smoothstep(0.85, 1.0, front - 0.012));
  let hold = 1.0 - smoothstep(0.75, 1.0, cycle);
  return clamp(hold * clamp(0.65 * body + 0.35 * ridge, 0.0, 1.0), 0.0, 1.0);
}

fn fbPulse(along: f32) -> f32 {
  let rate = FB.p5.z;
  let depth = FB.p4.y;
  let shape = i32(FB.p5.w);
  if (rate == 0.0 || depth <= 0.0) { return 1.0; }
  if (shape == 3) {
    return 1.0 - depth + depth * fbSweep(along, fract(rate * FB.p2.y));
  }
  let phase = rate * FB.p2.y - select(0.0, along, shape == 2);
  return 1.0 - depth + depth * fbPulseLevel(fract(phase));
}

// 📝 Colour: solid uses stop 0; ramp blends stops by position along the fibre; palette picks a stop per strand.
fn fbStopPos(i: u32) -> f32 {
  return FB.stopP[i / 4u][i % 4u];
}

fn fbRamp(t: f32) -> vec3f {
  let n = u32(FB.p8.z);
  if (n <= 1u || t <= fbStopPos(0u)) { return FB.stopC[0].xyz; }
  var col = FB.stopC[n - 1u].xyz;
  for (var k = 0u; k + 1u < n; k++) {
    let p0 = fbStopPos(k);
    let p1 = fbStopPos(k + 1u);
    if (t < p1) {
      return mix(FB.stopC[k].xyz, FB.stopC[k + 1u].xyz, clamp((t - p0) / max(p1 - p0, 1e-5), 0.0, 1.0));
    }
  }
  return col;
}

fn fbColourAt(t: f32, id: f32) -> vec3f {
  let mode = u32(FB.p8.w);
  let n = max(u32(FB.p8.z), 1u);
  if (mode == 0u) { return FB.stopC[0].xyz; }
  if (mode == 2u) {
    let k = min(u32(fbUnit(id, 14.0) * f32(n)), n - 1u);
    return FB.stopC[k].xyz;
  }
  return fbRamp(t);
}

struct FO {
  @builtin(position) pos: vec4f,
  @location(0) along: f32,
  @location(1) across: f32,
  @location(2) id: f32,
  @location(3) sigma: f32,
  @location(4) halo: f32,
  @location(5) fade: f32,
};

@vertex
fn vsFibre(@builtin(vertex_index) vi: u32) -> FO {
  var o: FO;
  let segs = u32(FB.p6.z);
  let quad = vi / 6u;
  let corner = vi - quad * 6u;
  let strand = quad / segs;
  let segment = quad - strand * segs;
  let alongStep = select(0.0, 1.0, corner == 2u || corner == 3u || corner == 5u);
  let sideStep = select(0.0, 1.0, corner == 1u || corner == 4u || corner == 5u);
  let id = f32(strand);
  let s = (f32(segment) + alongStep) / f32(segs);
  let side = sideStep * 2.0 - 1.0;

  let sp = min(s + 0.002, 1.0);
  let sm = max(s - 0.002, 0.0);
  let centre = fbWorldAt(fbCurve(s, id), s);
  let ahead = fbWorldAt(fbCurve(sp, id), sp);
  let behind = fbWorldAt(fbCurve(sm, id), sm);
  let tangent = ahead - behind;
  var lateral = cross(tangent, G.camPos.xyz - centre);
  let ll = length(lateral);
  lateral = select(vec3f(0.0, 1.0, 0.0), lateral / ll, ll > 1e-7);

  // Ultra-fine optical fibre hairlines + delicate micro-halo (0.28..0.6px core).
  let clip = G.viewProj * vec4f(centre, 1.0);
  let ppm = FB.p4.z / max(clip.w, 1e-3);
  let pixelScale = FB.p4.w;
  let sigmaPx = max(0.26 * pixelScale, FB.p2.z * pixelScale * 0.26);
  let haloPx = max(0.95 * pixelScale, 1.75 * sigmaPx);
  let envPx = 3.0 * haloPx;
  let fade = mix(1.0, pow(max(sin(FPI * s), 0.0), 0.5), FB.p2.w);
  let world = centre + lateral * (side * envPx / max(ppm, 1e-6));
  o.pos = G.viewProj * vec4f(world, 1.0);
  o.along = s;
  o.across = side * envPx;
  o.id = id;
  o.sigma = sigmaPx;
  o.halo = haloPx;
  o.fade = fade;
  return o;
}

@fragment
fn fsFibre(i: FO) -> @location(0) vec4f {
  let line = exp(-0.5 * i.across * i.across / (i.sigma * i.sigma));
  let glow = FB.p3.y * exp(-0.5 * i.across * i.across / (i.halo * i.halo));
  let win = clamp(FB.p3.w, 0.04, 0.95);
  let cyc = fract(fbUnit(i.id, 9.0) + FB.p5.y * FB.p2.y);
  let head = cyc * (1.0 + win);
  let dist = head - i.along;
  let inStreak = dist >= 0.0 && dist <= win;
  let front = smoothstep(0.0, 0.04, dist);
  let tail = pow(clamp(1.0 - dist / max(win, 1e-3), 0.0, 1.0), 1.65);
  let streak = select(0.0, tail * front, inStreak);
  let lit = FB.p3.z + (1.0 - FB.p3.z) * streak * 1.45;
  let ends = smoothstep(0.0, 0.03, i.along) * (1.0 - smoothstep(0.96, 1.0, i.along));
  let shape = i32(FB.p6.x + 0.5);
  let role = fbUnit(i.id, 19.0);
  let ghostMul = select(1.0, 0.24, shape == 3 && role >= 0.28 && role < 0.44);
  let rimGlow = select(1.0, 1.0 + 0.95 * smoothstep(0.84, 0.99, i.along), shape == 3 && role >= 0.44);
  let base = fbColourAt(i.along, i.id);
  let tint = mix(base, FB.colC.xyz, FB.p4.x * fbUnit(i.id, 12.0));
  let vary = 0.45 + 0.85 * fbUnit(i.id, 13.0);
  let level = FB.p3.x * vary * ghostMul * rimGlow * (line + glow) * lit * ends * i.fade * fbPulse(i.along);
  return vec4f(tint * level, 1.0);
}

// Travelling tiny pinpoint sparks & whisper-soft bokeh particles gliding from start (0) to end (1).
struct SO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
  @location(2) bokeh: f32,
};

@vertex
fn vsSpark(@builtin(vertex_index) vi: u32) -> SO {
  var o: SO;
  o.pos = vec4f(0.0, 0.0, 2.0, 1.0);
  o.uv = vec2f(0.0);
  o.col = vec3f(0.0);
  o.bokeh = 0.0;
  let strand = vi / 6u;
  let corner = vi - strand * 6u;
  if (strand >= u32(FB.p6.y)) { return o; }
  let id = f32(strand);
  if (fbUnit(id, 11.0) > FB.p7.y) { return o; }

  let shape = i32(FB.p6.x + 0.5);
  let role = fbUnit(id, 19.0);
  let win = clamp(FB.p3.w, 0.04, 0.95);
  let rPick = fbUnit(id, 24.0);
  let cyc = fract(fbUnit(id, 9.0) + FB.p5.y * FB.p2.y);
  let headS = cyc * (1.0 + win);
  let speedMul = 0.65 + 0.70 * fbUnit(id, 26.0);
  let driftS = fract(fbUnit(id, 25.0) + max(1.0, FB.p5.y) * FB.p2.y * speedMul);
  let s = select(driftS, clamp(headS, 0.0, 1.0), rPick < 0.62 && headS <= 1.0);
  let endFade = smoothstep(0.0, 0.04, s) * (1.0 - smoothstep(0.985, 1.0, s));
  if (endFade <= 0.005) { return o; }

  let isBokeh = select(0.0, 1.0, fbUnit(id, 30.0) < FB.colC.w);
  let centre = fbWorldAt(fbCurve(s, id), s);
  let clip = G.viewProj * vec4f(centre, 1.0);
  let depth = max(clip.w, 0.001);
  let rawPx = FB.p7.z * FB.org.w * FB.p4.z / depth;
  let sizePx = select(clamp(rawPx, 1.0, 3.6), clamp(rawPx * (1.7 + 1.1 * fbUnit(id, 31.0)), 2.5, 13.0), isBokeh > 0.5);
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
                                vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[corner];
  let half = sizePx * 0.5;
  let ndc = vec2f(c.x * half * 2.0 / FB.p8.x, c.y * half * 2.0 / FB.p8.y);
  o.pos = vec4f(clip.xy + ndc * clip.w, clip.z, clip.w);
  o.uv = c;
  let base = fbColourAt(s, id);
  var accent = mix(base, FB.colC.xyz, select(0.35, 0.85, rPick < 0.45));
  if (shape == 3 && fbUnit(id, 33.0) < 0.18 && isBokeh < 0.5) {
    accent = vec3f(0.95, 0.24, 0.85);
  }
  let tipFlare = select(1.0, 1.0 + 0.9 * smoothstep(0.75, 0.99, s) * select(0.5, 1.1, role < 0.28), shape == 3);
  let ghostSparkDim = select(1.0, 0.25, shape == 3 && role >= 0.28 && role < 0.44 && isBokeh < 0.5);
  let bGain = select(1.0, 0.06, isBokeh > 0.5);
  o.col = accent * FB.p7.w * tipFlare * ghostSparkDim * bGain * endFade * (0.65 + 0.75 * fbUnit(id, 10.0)) * fbPulse(s);
  o.bokeh = isBokeh;
  return o;
}

@fragment
fn fsSpark(i: SO) -> @location(0) vec4f {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  if (i.bokeh > 0.5) {
    let r = sqrt(r2);
    let disc = (1.0 - smoothstep(0.68, 1.0, r)) * (0.45 + 0.25 * smoothstep(0.45, 0.80, r));
    return vec4f(i.col * disc, 1.0);
  }
  let star = exp(-r2 * 13.0) + 0.28 * exp(-r2 * 3.0) * (1.0 - smoothstep(0.75, 1.0, r2));
  return vec4f(i.col * star, 1.0);
}
`;

  // Shared helpers are prepended to every module that needs them.
// 📝 Gravitational lensing (screen space). Samples a copy of the frame: inside the horizon the frame is black,
// outside it the background is bent outward by a weak-field mapping (source radius r - E^2/r, fading with distance),
// and a bright photon ring sits at about 1.3 horizon radii. This is an approximation, not a ray-traced metric.
const LENS = `
struct LensU {
  bh0: vec4f, bh1: vec4f, misc: vec4f,
  sh0: vec4f, sh1: vec4f, sh2: vec4f, sh3: vec4f, sh4: vec4f, sh5: vec4f, sh6: vec4f, sh7: vec4f,
  grade: vec4f, lensFx: vec4f, heatCfg: vec4f,
  gl0: vec4f, gl1: vec4f, bloomCfg: vec4f
};
@group(0) @binding(0) var<uniform> LU: LensU;
@group(0) @binding(1) var capTex: texture_2d<f32>;
@group(0) @binding(2) var capSamp: sampler;

fn h2(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2f(1.0, 0.0)), u.x), mix(h2(i + vec2f(0.0, 1.0)), h2(i + vec2f(1.0, 1.0)), u.x), u.y);
}

// 📝 Heat shimmer: a noise offset of the sampled UV that rises with time and fades toward the edge of its radius.
// sa = (centre uv, radius in screen-height units, strength in uv), sb = (time * rate, noise frequency).
fn shimmerOff(uv: vec2f, sa: vec4f, sb: vec4f) -> vec2f {
  let d = (uv - sa.xy) * vec2f(LU.misc.y, 1.0);
  let r = length(d) / max(sa.z, 1e-5);
  let fall = 1.0 - smoothstep(0.55, 1.0, r);
  let p = vec2f(uv.x * sb.y, uv.y * sb.y - sb.x * 1.5);
  let n = vec2f(vnoise(p), vnoise(p + vec2f(5.2, 1.3))) - vec2f(0.5);
  return n * sa.w * fall;
}

@vertex
fn vsLens(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[vi], 0.0, 1.0);
}

@fragment
fn fsLens(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dim = vec2f(textureDimensions(capTex));
  let uv = fc.xy / dim;
  let aspect = LU.misc.y;
  let n = u32(LU.misc.x);
  var src = uv;
  var bestR = 1e9;
  var inside = 0.0;
  var ring = 0.0;
  for (var k = 0u; k < 2u; k++) {
    if (k >= n) { break; }
    let bh = select(LU.bh1, LU.bh0, k == 0u);
    let c = bh.xy;
    let E = bh.z;
    let H = bh.w;
    let d = (uv - c) * vec2f(aspect, 1.0);
    let r = length(d);
    if (r < bestR) {
      bestR = r;
      let dir = d / max(r, 1e-5);
      // Inside the Einstein radius the signed source radius goes negative: the image comes from the far side.
      let rs = r - E * E / max(r, 1e-5);
      let taper = 1.0 - smoothstep(0.35, 0.6, r);
      let rr = mix(r, rs, taper);
      src = c + dir * rr / vec2f(aspect, 1.0);
    }
    inside = max(inside, 1.0 - smoothstep(H * 0.9, H, r));
    let q = (r - 1.3 * H) / (0.12 * H);
    ring += exp(-q * q);
  }
  var shOff = vec2f(0.0);
  if (LU.misc.w > 0.5) { shOff += shimmerOff(uv, LU.sh0, LU.sh1); }
  if (LU.misc.w > 1.5) { shOff += shimmerOff(uv, LU.sh2, LU.sh3); }
  if (LU.misc.w > 2.5) { shOff += shimmerOff(uv, LU.sh4, LU.sh5); }
  if (LU.misc.w > 3.5) { shOff += shimmerOff(uv, LU.sh6, LU.sh7); }
  if (LU.lensFx.z > 0.0001) {
    let hz = LU.heatCfg.y;
    let mask = select(1.0, smoothstep(hz * 0.55, 1.0, uv.y), hz > 0.01);
    let hp = vec2f(uv.x * LU.heatCfg.x, uv.y * LU.heatCfg.x - LU.lensFx.w * 1.6);
    let hn1 = vec2f(vnoise(hp), vnoise(hp + vec2f(5.2, 1.3))) - vec2f(0.5);
    let hn2 = vec2f(vnoise(hp * 2.1 + vec2f(1.7, -LU.lensFx.w * 0.9)), vnoise(hp * 2.1 + vec2f(8.4, 3.1))) - vec2f(0.5);
    shOff += (hn1 * 0.68 + hn2 * 0.32) * LU.lensFx.z * mask;
  }
  src += shOff;

  // Glitch: localized over active glitch emitters (gl0, gl1) plus optional full-frame glitch (heatCfg.z)
  var localGlitch = 0.0;
  if (LU.gl0.w > 0.001) {
    let gd0 = length((uv - LU.gl0.xy) * vec2f(aspect, 1.0)) / max(LU.gl0.z, 1e-4);
    localGlitch = max(localGlitch, LU.gl0.w * (1.0 - smoothstep(0.55, 1.0, gd0)));
  }
  if (LU.gl1.w > 0.001) {
    let gd1 = length((uv - LU.gl1.xy) * vec2f(aspect, 1.0)) / max(LU.gl1.z, 1e-4);
    localGlitch = max(localGlitch, LU.gl1.w * (1.0 - smoothstep(0.55, 1.0, gd1)));
  }
  let glitchAmt = max(LU.heatCfg.z, localGlitch);
  if (glitchAmt > 0.001) {
    let stepT = floor(LU.heatCfg.w * 14.0);
    let band = floor(uv.y * 34.0);
    let gate = step(0.76 - glitchAmt * 0.48, h2(vec2f(band, stepT)));
    let shift = (h2(vec2f(band + 17.0, stepT * 1.3)) - 0.5) * 0.055 * glitchAmt * gate;
    src.x += shift;
  }
  var col = textureSampleLevel(capTex, capSamp, src, 0.0).rgb;
  let chromaAmt = max(LU.lensFx.x, localGlitch * 0.7);
  if (chromaAmt > 0.001) {
    let off = (uv - vec2f(0.5)) * (0.014 * LU.lensFx.x) + vec2f(0.012 * localGlitch, 0.0);
    let cr = textureSampleLevel(capTex, capSamp, src + off, 0.0).r;
    let cb = textureSampleLevel(capTex, capSamp, src - off, 0.0).b;
    col = vec3f(cr, col.g, cb);
  }
  if (LU.lensFx.y > 0.001) {
    let thresh = LU.bloomCfg.x;
    let rad = max(0.3, LU.bloomCfg.y);
    let knee = max(0.04, LU.bloomCfg.z);
    let invDim = vec2f(1.0) / dim;
    var bloomAcc = vec3f(0.0);
    var wSum = 0.0;
    for (var b = 0u; b < 24u; b++) {
      let ang = f32(b) * 2.39996323;
      let tier = b / 6u;
      let ring = select(select(1.6, 3.6, tier == 1u), select(7.2, 13.5, tier == 3u), tier >= 2u) * rad;
      let off = vec2f(cos(ang), sin(ang)) * ring * invDim;
      let sCol = textureSampleLevel(capTex, capSamp, src + off, 0.0).rgb;
      let sLum = dot(sCol, vec3f(0.2126, 0.7152, 0.0722));
      let soft = clamp((sLum - thresh + knee) / max(2.0 * knee, 1e-4), 0.0, 1.0);
      let gate = smoothstep(max(0.0, thresh - knee), thresh + knee + 0.12, sLum) * 0.75 + soft * 0.25;
      let rw = 1.0 / (1.0 + f32(tier) * 0.45);
      bloomAcc += sCol * gate * rw;
      wSum += rw;
    }
    col += (bloomAcc / max(wSum, 1.0)) * (LU.lensFx.y * 2.2);
  }
  let glow = vec3f(1.0, 0.72, 0.4) * ring * LU.misc.z;
  var outCol = col * (1.0 - inside) + glow * (1.0 - inside);
  outCol *= max(LU.grade.x, 0.01);
  outCol = (outCol - vec3f(0.5)) * LU.grade.y + vec3f(0.5);
  let outLum = dot(outCol, vec3f(0.2126, 0.7152, 0.0722));
  outCol = mix(vec3f(outLum), outCol, LU.grade.z);
  if (LU.grade.w > 0.001) {
    let vd = (uv - vec2f(0.5)) * vec2f(aspect * 0.72, 1.0);
    let vig = clamp(1.0 - LU.grade.w * dot(vd, vd) * 1.35, 0.0, 1.0);
    outCol *= vig;
  }
  return vec4f(clamp(outCol, vec3f(0.0), vec3f(1.0)), 1.0);
}`;

  // ControlVehicle HMI transitions & 4-mode inspection shaders (Solid, Ghost 45%, Wireframe, X-Ray Scan Sweep + Material Ripple).
  const VEHICLE = /* wgsl */ `
struct VehU {
  bounds: vec4f,      // x minX, y maxX, z yawRad, w groundOffset
  modeCfg: vec4f,     // x mode (0 solid, 1 ghost, 2 wire, 3 scan), y scanX, z holoAmt, w ghostOpacity
  paintCur: vec4f,    // rgb linear, w roughness
  paintNext: vec4f,   // rgb linear, w roughness
  paintRip: vec4f,    // xyz world origin, w radius (<0 inactive)
  paintFlags: vec4f,  // x curMetal, y nextMetal, z curCoat, w nextCoat
  rimCur: vec4f,      // rgb linear, w roughness
  rimNext: vec4f,     // rgb linear, w roughness
  rimRip: vec4f,      // xyz world origin, w radius (<0 inactive)
  rimFlags: vec4f,    // x curMetal, y nextMetal, z wheelSpin, w timeSec
  accent: vec4f,      // rgb accent linear, w scanDir (-1 nose->tail, +1 tail->nose)
  posOff: vec4f,      // xyz vehicle world pos, w scale
  axles: array<vec4f, 4>, // xyz axle mount in Y-up local coords, w wireOpacity
};

@group(0) @binding(0) var<uniform> G: Glob;
@group(1) @binding(0) var<uniform> VU: VehU;

struct VIn {
  @location(0) pos: vec3f,
  @location(1) norm: vec3f,
  @location(2) col: vec4f,
  @location(3) partInfo: vec2f, // x = partKind (0..7), y = wheelIdx (-1 body, 0..3 wheels)
};

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) norm: vec3f,
  @location(2) col: vec4f,
  @location(3) partInfo: vec3f, // x = partKind, y = localX, z = wheelIdx
  @location(4) lp: vec3f,       // scaled local vehicle pos (ripple & scan alignment)
};

struct VEdgeIn {
  @location(0) pos: vec3f,
  @location(1) col: vec4f,
  @location(2) info: vec2f, // x = partKind, y = wheelIdx
};

struct VEdgeOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) col: vec4f,
  @location(2) info: vec2f, // x = localX, y = part
};

struct VCurtOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

fn vehTransformPos(p: vec3f, n: vec3f, wheelIdx: f32) -> array<vec3f, 3> {
  var lp = p;
  var ln = n;
  if (wheelIdx >= 0.0) {
    let idx = i32(clamp(wheelIdx, 0.0, 3.0));
    let ax = VU.axles[idx].xyz;
    let rel = lp - ax;
    let sp = VU.rimFlags.z;
    let cs = cos(sp);
    let sn = sin(sp);
    lp = vec3f(ax.x + rel.x * cs + rel.y * sn, ax.y - rel.x * sn + rel.y * cs, ax.z + rel.z);
    ln = vec3f(ln.x * cs + ln.y * sn, -ln.x * sn + ln.y * cs, ln.z);
  }
  let sc = max(0.05, VU.posOff.w);
  let cy = cos(VU.bounds.z);
  let sy = sin(VU.bounds.z);
  let wx = VU.posOff.x + (lp.x * cy + lp.z * sy) * sc;
  let wy = VU.posOff.y + lp.y * sc;
  let wz = VU.posOff.z + (-lp.x * sy + lp.z * cy) * sc;
  let wn = normalize(vec3f(ln.x * cy + ln.z * sy, ln.y, -ln.x * sy + ln.z * cy) + vec3f(1e-5));
  return array<vec3f, 3>(vec3f(wx, wy, wz), wn, vec3f(lp.x * sc, lp.y * sc, lp.z * sc));
}

fn vehScanBehind(localX: f32) -> f32 {
  let sc = max(0.05, VU.posOff.w);
  let sx = VU.modeCfg.y * sc;
  let dir = VU.accent.w;
  if (dir < 0.0) {
    return smoothstep(sx - 0.14 * sc, sx + 0.12 * sc, localX);
  }
  return smoothstep(sx + 0.14 * sc, sx - 0.12 * sc, localX);
}

@vertex
fn vsVeh(i: VIn) -> VOut {
  let tr = vehTransformPos(i.pos, i.norm, i.partInfo.y);
  var o: VOut;
  o.pos = G.viewProj * vec4f(tr[0], 1.0);
  o.wp = tr[0];
  o.norm = tr[1];
  o.col = i.col;
  o.partInfo = vec3f(i.partInfo.x, tr[2].x, i.partInfo.y);
  o.lp = tr[2];
  return o;
}

@fragment
fn fsVehSurface(i: VOut) -> @location(0) vec4f {
  let mode = u32(VU.modeCfg.x + 0.5);
  if (mode == 2u) { discard; }

  let part = u32(i.partInfo.x + 0.5);
  let sc = max(0.05, VU.posOff.w);
  let V = normalize(G.camPos.xyz - i.wp + vec3f(1e-5));
  var N = normalize(i.norm + vec3f(0.0, 1e-5, 0.0));
  if (dot(N, V) < 0.0) { N = -N; }

  var baseCol = i.col.rgb;
  var rough = 0.45;
  var metal = 0.05;
  var coat = 0.0;
  var emitCol = vec3f(0.0);
  var baseAlpha = i.col.a;
  var ringGlow = 0.0;
  var ringCol = VU.accent.rgb;

  if (part == 0u) {
    baseCol = VU.paintCur.rgb;
    rough = VU.paintCur.w;
    metal = VU.paintFlags.x;
    coat = VU.paintFlags.z;
    if (VU.paintRip.w >= 0.0) {
      let d = length(i.lp - VU.paintRip.xyz * sc);
      let m = 1.0 - smoothstep(VU.paintRip.w - 0.15, VU.paintRip.w + 0.04, d);
      let w = smoothstep(VU.paintRip.w - 0.22, VU.paintRip.w - 0.02, d) * (1.0 - smoothstep(VU.paintRip.w - 0.01, VU.paintRip.w + 0.09, d));
      baseCol = mix(VU.paintCur.rgb, VU.paintNext.rgb, m);
      rough = mix(VU.paintCur.w, VU.paintNext.w, m);
      metal = mix(VU.paintFlags.x, VU.paintFlags.y, m);
      coat = mix(VU.paintFlags.z, VU.paintFlags.w, m);
      ringGlow = w * 0.72;
      ringCol = mix(VU.paintNext.rgb, vec3f(0.75, 0.92, 1.0), 0.55);
    }
  } else if (part == 3u || part == 4u) {
    baseCol = select(VU.rimCur.rgb * 0.85, VU.rimCur.rgb, part == 4u);
    rough = VU.rimCur.w;
    metal = VU.rimFlags.x;
    coat = 0.35;
    if (VU.rimRip.w >= 0.0) {
      let d = length(i.lp - VU.rimRip.xyz * sc);
      let m = 1.0 - smoothstep(VU.rimRip.w - 0.14, VU.rimRip.w + 0.04, d);
      let w = smoothstep(VU.rimRip.w - 0.20, VU.rimRip.w - 0.02, d) * (1.0 - smoothstep(VU.rimRip.w - 0.01, VU.rimRip.w + 0.08, d));
      let nextRgb = select(VU.rimNext.rgb * 0.85, VU.rimNext.rgb, part == 4u);
      baseCol = mix(baseCol, nextRgb, m);
      rough = mix(VU.rimCur.w, VU.rimNext.w, m);
      metal = mix(VU.rimFlags.x, VU.rimFlags.y, m);
      ringGlow = w * 0.80;
      ringCol = mix(VU.rimNext.rgb, vec3f(0.82, 0.94, 1.0), 0.55);
    }
  } else if (part == 1u) {
    rough = 0.05;
    coat = 1.0;
    baseAlpha = 0.55;
  } else if (part == 2u || part == 5u) {
    rough = 0.76;
    metal = 0.04;
  } else if (part == 6u) {
    emitCol = vec3f(0.95, 0.96, 1.0) * 1.15;
    rough = 0.12;
  } else if (part == 7u) {
    emitCol = vec3f(0.95, 0.08, 0.12) * 1.05;
    rough = 0.14;
  }

  let L1 = normalize(vec3f(0.45, 0.86, 0.36));
  let L2 = normalize(vec3f(-0.62, 0.38, -0.52));
  let L3 = normalize(vec3f(0.15, 0.65, -0.74));
  let H1 = normalize(L1 + V);
  let H3 = normalize(L3 + V);
  let d1 = max(dot(N, L1), 0.0);
  let d2 = max(dot(N, L2), 0.0);
  let ndv = clamp(dot(N, V), 0.0, 1.0);
  let fres = pow(1.0 - ndv, 3.2);
  let specPow = mix(96.0, 14.0, clamp(rough, 0.02, 1.0));
  let specGain = mix(0.62, 0.08, clamp(rough, 0.02, 1.0)) + coat * 0.32;
  let spec = pow(max(dot(N, H1), 0.0), specPow) * specGain + pow(max(dot(N, H3), 0.0), specPow * 0.6) * specGain * 0.45;
  let envReflect = mix(vec3f(0.06, 0.08, 0.11), vec3f(0.24, 0.30, 0.38), clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  let diff = baseCol * (0.26 + 0.68 * d1 + 0.24 * d2);
  var lit = mix(diff, diff * 0.35 + baseCol * 0.75 * spec, metal * 0.72) + vec3f(spec) * mix(vec3f(1.0), baseCol, metal * 0.7) + envReflect * (fres * (0.35 + coat * 0.55 + metal * 0.35)) + emitCol;
  lit += ringCol * ringGlow;

  var outA = baseAlpha;
  if (mode == 1u) {
    let gOp = clamp(VU.modeCfg.w, 0.05, 0.95);
    let ghostRim = pow(1.0 - ndv, 2.0) * 0.65;
    lit = mix(lit, VU.accent.rgb * (0.45 + 0.75 * ghostRim), 0.58) + VU.accent.rgb * ghostRim * 0.55;
    outA = clamp(gOp * (0.68 + 0.62 * ghostRim), 0.08, 0.92);
  } else if (mode == 3u) {
    let behind = vehScanBehind(i.partInfo.y);
    let holo = behind * VU.modeCfg.z;
    if (holo > 0.82) { discard; }
    let delta = abs(i.partInfo.y - VU.modeCfg.y * sc);
    let beam = exp(-(delta * delta) * 90.0) * VU.modeCfg.z;
    lit = mix(lit, VU.accent.rgb * 0.55, holo * 0.85) + VU.accent.rgb * beam * 1.6;
    outA = mix(baseAlpha, 0.045, holo);
  }

  return vec4f(lit * outA, outA);
}

@fragment
fn fsVehHolo(i: VOut) -> @location(0) vec4f {
  let mode = u32(VU.modeCfg.x + 0.5);
  if (mode != 3u) { discard; }
  let behind = vehScanBehind(i.partInfo.y);
  let fade = behind * VU.modeCfg.z;
  if (fade <= 0.005) { discard; }

  let V = normalize(G.camPos.xyz - i.wp + vec3f(1e-5));
  var N = normalize(i.norm + vec3f(0.0, 1e-5, 0.0));
  if (dot(N, V) < 0.0) { N = -N; }
  let ndv = clamp(dot(N, V), 0.0, 1.0);
  let rim = pow(1.0 - ndv, 2.0);
  let scanLines = 0.52 + 0.48 * sin(i.wp.y * 44.0 - VU.rimFlags.w * 7.5);
  let delta = abs(i.partInfo.y - VU.modeCfg.y * max(0.05, VU.posOff.w));
  let band = exp(-(delta * delta) * 110.0);
  let col = VU.accent.rgb * (0.14 + rim * 0.95) * (0.65 + 0.35 * scanLines) + vec3f(0.75, 0.96, 1.0) * band * 0.9;
  let a = clamp((0.18 + rim * 0.72 + band * 0.65) * fade, 0.0, 1.0);
  return vec4f(col * a, a);
}

@vertex
fn vsVehEdge(i: VEdgeIn) -> VEdgeOut {
  let tr = vehTransformPos(i.pos, vec3f(0.0, 1.0, 0.0), i.info.y);
  var o: VEdgeOut;
  o.pos = G.viewProj * vec4f(tr[0], 1.0);
  o.wp = tr[0];
  o.col = i.col;
  o.info = vec2f(tr[2].x, i.info.x);
  return o;
}

@fragment
fn fsVehEdge(i: VEdgeOut) -> @location(0) vec4f {
  let mode = u32(VU.modeCfg.x + 0.5);
  if (mode == 0u) { discard; }
  let wireOp = VU.axles[0].w;
  var a = wireOp;
  var col = mix(i.col.rgb, VU.accent.rgb, 0.48);
  if (mode == 1u) {
    a = wireOp * 0.34;
  } else if (mode == 3u) {
    let behind = vehScanBehind(i.info.x);
    let delta = abs(i.info.x - VU.modeCfg.y * max(0.05, VU.posOff.w));
    let band = exp(-(delta * delta) * 120.0);
    a = wireOp * (0.14 + behind * 0.86) * VU.modeCfg.z;
    col = mix(col, vec3f(0.86, 0.98, 1.0), band);
  }
  return vec4f(col * a, a);
}

@vertex
fn vsVehCurtain(@builtin(vertex_index) vi: u32) -> VCurtOut {
  let ys = array<f32, 6>(0.02, 2.15, 0.02, 2.15, 2.15, 0.02);
  let zs = array<f32, 6>(-1.55, -1.55, 1.55, -1.55, 1.55, 1.55);
  let uvs = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0));
  let sc = max(0.05, VU.posOff.w);
  let cy = cos(VU.bounds.z);
  let sy = sin(VU.bounds.z);
  let lx = VU.modeCfg.y * sc;
  let ly = ys[vi] * sc;
  let lz = zs[vi] * sc;
  let wp = vec3f(VU.posOff.x + (lx * cy + lz * sy), VU.posOff.y + ly, VU.posOff.z + (-lx * sy + lz * cy));
  var o: VCurtOut;
  o.pos = G.viewProj * vec4f(wp, 1.0);
  o.uv = uvs[vi];
  return o;
}

@fragment
fn fsVehCurtain(i: VCurtOut) -> @location(0) vec4f {
  let mode = u32(VU.modeCfg.x + 0.5);
  if (mode != 3u || VU.modeCfg.z <= 0.02) { discard; }
  let edgeU = sin(i.uv.x * 3.14159265);
  let edgeV = pow(sin(i.uv.y * 3.14159265), 0.75);
  let sweepLine = 0.55 + 0.45 * sin(i.uv.y * 38.0 - VU.rimFlags.w * 8.0);
  let a = edgeU * edgeV * (0.28 + 0.20 * sweepLine) * VU.modeCfg.z;
  let col = mix(VU.accent.rgb, vec3f(0.88, 0.98, 1.0), 0.35);
  return vec4f(col * a, a);
}
`;

  PE.Shaders = {
    lens: LENS,
    sim: COMMON + SIM,
    wind: COMMON + WIND,
    render: COMMON + RENDER,
    fibre: COMMON + FIBRE,
    vehicle: COMMON + VEHICLE,
  };
