// Tetrahedral volumetric tyre: mesh generation, first-Piola FEM forces and a CPU reference integrator.
// The WebGPU path (gpuTyre.js + shaders.js) implements exactly the same equations; tests/ run this file.
// All matrices are column-major flat arrays of length 9 (WGSL convention).

export const DEFAULT_PARAMS = {
  // Mesh resolution: circumferential, radial (bead→tread), lateral node counts.
  NT: 48, NI: 5, NJ: 5,
  rimRadius: 0.2, treadRadius: 0.33,
  beadHalfWidth: 0.055, treadHalfWidth: 0.105, shoulder: 0.7,
  // Material. E in Pa, Poisson ratio, density in kg/m^3 (effective), inflation in Pa.
  youngs: 6.0e6, poisson: 0.3, density: 1000, pressure: 2.5e5, // density is mass-scaled for explicit stability (see README)
  damping: 4.0,
  // Contact against the procedural road (penalty spring + viscous friction clamped by Coulomb).
  // groundC, frictionC and beadC are damping RATES (1/s), applied per node as rate·mass·velocity so the
  // explicit step stays stable for the very light bead/sidewall nodes.
  groundK: 3.0e4, groundC: 60, friction: 0.9, frictionC: 600,
  // Road features: {x, w, h, kind}. kind 0 = raised-cosine speed bump centred on x (half-width w, height h);
  // kind 1 = kerb: block from x to x+w, height h, with 3 cm ramps. Up to MAX_ROAD features.
  road: [{ x: 4.0, w: 0.5, h: 0.03, kind: 0 }],
  // Wheel yaw (slip angle) relative to the direction of travel, radians. 0 = straight.
  yaw: 0,
  // Bead attachment to the rim and the rim's suspended mass.
  beadK: 2.5e4, beadC: 40,
  rimMass: 180, suspK: 9.0e4, suspC: 4000, targetY: 0.33,
  speed: 5, gravity: 9.81,
  dt: 1.0e-4,
};

// Kuhn (6-tet) split of a hex cell. Corner bit order: bit0 = theta, bit1 = radial, bit2 = lateral.
const KUHN_TETS = [[0, 1, 3, 7], [0, 1, 5, 7], [0, 2, 3, 7], [0, 2, 6, 7], [0, 4, 5, 7], [0, 4, 6, 7]];

export function nodeIndex(p, t, i, j) {
  const tt = ((t % p.NT) + p.NT) % p.NT;
  return (tt * p.NI + i) * p.NJ + j;
}

// Rounded sidewall: 0 at the bead, reaches the full tread half-width at u = shoulder.
export function shoulderProfile(u, shoulder) {
  const s = Math.min(u / shoulder, 1);
  return Math.sqrt(Math.max(0, 1 - (1 - s) * (1 - s)));
}

// Per-node [rest x, rest y, rest z, mass] for the GPU, for a given effective density.
export function nodeInfoArray(mesh, density) {
  const out = new Float32Array(4 * mesh.N);
  for (let n = 0; n < mesh.N; n++) {
    out[4 * n] = mesh.rest[3 * n]; out[4 * n + 1] = mesh.rest[3 * n + 1];
    out[4 * n + 2] = mesh.rest[3 * n + 2]; out[4 * n + 3] = density * mesh.nodeVolume[n];
  }
  return out;
}

export const MAX_ROAD = 8;
const KERB_RAMP = 0.03;

// Named road layouts for the UI. `h` is the obstacle height in metres.
export function roadPreset(name, h) {
  switch (name) {
    case 'speedbump': return [{ x: 4, w: 0.5, h, kind: 0 }];
    case 'kerb': return [{ x: 4, w: 0.25, h, kind: 1 }];
    case 'mixed': return [{ x: 3, w: 0.5, h, kind: 0 }, { x: 9, w: 0.25, h, kind: 1 }, { x: 14, w: 0.4, h: h * 0.6, kind: 0 }];
    default: return [];
  }
}

export function resolveParams(overrides = {}) {
  const p = { ...DEFAULT_PARAMS, ...overrides };
  // Explicit-FEM stability: the critical step scales with sqrt(density / E). Tested on the CPU reference:
  // 1e-4 s is stable at the defaults (E 6 MPa, density 1000); stiffer/lighter setups get a proportionally smaller step.
  p.dt = Math.min(DEFAULT_PARAMS.dt, DEFAULT_PARAMS.dt * Math.sqrt((p.density / 1000) * (6e6 / p.youngs)));
  return p;
}

export function buildTyreMesh(overrides = {}) {
  const p = resolveParams(overrides);
  const { NT, NI, NJ } = p;
  const N = NT * NI * NJ;
  const rest = new Float64Array(3 * N);

  for (let t = 0; t < NT; t++) {
    for (let i = 0; i < NI; i++) {
      for (let j = 0; j < NJ; j++) {
        const n = nodeIndex(p, t, i, j);
        const u = i / (NI - 1);
        const v = -1 + (2 * j) / (NJ - 1);
        const r = p.rimRadius + (p.treadRadius - p.rimRadius) * u;
        const hw = p.beadHalfWidth + (p.treadHalfWidth - p.beadHalfWidth) * shoulderProfile(u, p.shoulder);
        const th = (2 * Math.PI * t) / NT;
        rest[3 * n] = r * Math.cos(th);
        rest[3 * n + 1] = r * Math.sin(th);
        rest[3 * n + 2] = hw * v;
      }
    }
  }

  const tets = [];
  for (let t = 0; t < NT; t++) {
    for (let i = 0; i < NI - 1; i++) {
      for (let j = 0; j < NJ - 1; j++) {
        const corner = (bits) => nodeIndex(p, t + (bits & 1), i + ((bits >> 1) & 1), j + ((bits >> 2) & 1));
        for (const tet of KUHN_TETS) tets.push(tet.map(corner));
      }
    }
  }

  const T = tets.length;
  const tetIdx = new Uint32Array(4 * T);
  const tetGT = new Float64Array(9 * T); // per tet: columns of Dm^-T (G0,G1,G2)
  const tetV0 = new Float64Array(T);
  const nodeVolume = new Float64Array(N); // lumped rest volume per node; mass = density * volume
  const nodeRest = new Float64Array(4 * N); // xyz rest (rim-centred), w = mass (filled below)

  const X = (n) => [rest[3 * n], rest[3 * n + 1], rest[3 * n + 2]];
  for (let q = 0; q < T; q++) {
    const ids = tets[q];
    let det = detOf(X(ids[0]), X(ids[1]), X(ids[2]), X(ids[3]));
    if (det < 0) { [ids[2], ids[3]] = [ids[3], ids[2]]; det = -det; }
    const x0 = X(ids[0]), x1 = X(ids[1]), x2 = X(ids[2]), x3 = X(ids[3]);
    const Dm = [...sub(x1, x0), ...sub(x2, x0), ...sub(x3, x0)]; // column-major
    const B = invertColMajor(Dm);                                  // Dm^-1, column-major
    const GT = transposeC(B);                                      // Dm^-T
    tetGT.set(GT, 9 * q);
    const V0 = det / 6;
    tetV0[q] = V0;
    for (let k = 0; k < 4; k++) {
      tetIdx[4 * q + k] = ids[k];
      nodeVolume[ids[k]] += V0 / 4;
    }
  }
  for (let n = 0; n < N; n++) {
    nodeRest[4 * n] = rest[3 * n];
    nodeRest[4 * n + 1] = rest[3 * n + 1];
    nodeRest[4 * n + 2] = rest[3 * n + 2];
    nodeRest[4 * n + 3] = p.density * nodeVolume[n];
  }

  // Node → (tet*4 + local) adjacency in CSR form, so the GPU can gather forces without atomics.
  const adjCount = new Uint32Array(N + 1);
  for (let e = 0; e < 4 * T; e++) adjCount[tetIdx[e] + 1]++;
  for (let n = 0; n < N; n++) adjCount[n + 1] += adjCount[n];
  const adjStart = Uint32Array.from(adjCount);
  const fill = Uint32Array.from(adjCount.subarray(0, N));
  const adjList = new Uint32Array(4 * T);
  for (let e = 0; e < 4 * T; e++) adjList[fill[tetIdx[e]]++] = e;

  // Unique tetrahedron edges (wireframe view) and outer-surface triangles (solid view).
  const edgeSet = new Set();
  for (let q = 0; q < T; q++) {
    const ids = tetIdx.subarray(4 * q, 4 * q + 4);
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const lo = Math.min(ids[a], ids[b]), hi = Math.max(ids[a], ids[b]);
      edgeSet.add(lo * N + hi);
    }
  }
  const edges = [];
  for (const key of edgeSet) edges.push(Math.floor(key / N), key % N);

  const surface = [];
  const tri = (a, b, c) => surface.push(a, b, c);
  for (let t = 0; t < NT; t++) {
    for (let j = 0; j < NJ - 1; j++) { // tread (outer radial shell)
      const A = nodeIndex(p, t, NI - 1, j), B = nodeIndex(p, t + 1, NI - 1, j);
      const C = nodeIndex(p, t + 1, NI - 1, j + 1), D = nodeIndex(p, t, NI - 1, j + 1);
      tri(A, B, C); tri(A, C, D);
    }
    for (const j of [0, NJ - 1]) { // both sidewalls
      for (let i = 0; i < NI - 1; i++) {
        const A = nodeIndex(p, t, i, j), B = nodeIndex(p, t + 1, i, j);
        const C = nodeIndex(p, t + 1, i + 1, j), D = nodeIndex(p, t, i + 1, j);
        tri(A, B, C); tri(A, C, D);
      }
    }
  }

  return {
    params: p, N, T, rest, nodeRest, nodeVolume, tetIdx, tetGT, tetV0, adjStart, adjList,
    edges: Uint32Array.from(edges), surface: Uint32Array.from(surface),
  };
}

// ---- small column-major 3x3 helpers -------------------------------------------------------
export function mulMV(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}
export function mulMM(a, b) {
  return [...mulMV(a, b.slice(0, 3)), ...mulMV(a, b.slice(3, 6)), ...mulMV(a, b.slice(6, 9))];
}
export function transposeC(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
export function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function detOf(x0, x1, x2, x3) {
  return dot(sub(x1, x0), cross(sub(x2, x0), sub(x3, x0)));
}
export function invertColMajor(m) {
  // Build row-major rows of the matrix, invert via adjugate, return column-major.
  const a = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; // row-major
  const c00 = a[4] * a[8] - a[5] * a[7], c01 = a[5] * a[6] - a[3] * a[8], c02 = a[3] * a[7] - a[4] * a[6];
  const det = a[0] * c00 + a[1] * c01 + a[2] * c02;
  const inv = [
    c00 / det, (a[2] * a[7] - a[1] * a[8]) / det, (a[1] * a[5] - a[2] * a[4]) / det,
    c01 / det, (a[0] * a[8] - a[2] * a[6]) / det, (a[2] * a[3] - a[0] * a[5]) / det,
    c02 / det, (a[1] * a[6] - a[0] * a[7]) / det, (a[0] * a[4] - a[1] * a[3]) / det,
  ]; // row-major inverse
  return transposeC(inv); // back to column-major
}

// Road height at x: sum of features (same as the WGSL terrainH).
export function featureHeight(f, x) {
  if (f.kind === 1) {
    const up = smoothstep(f.x - KERB_RAMP, f.x, x);
    const down = 1 - smoothstep(f.x + f.w, f.x + f.w + KERB_RAMP, x);
    return f.h * up * down;
  }
  const d = (x - f.x) / f.w;
  if (Math.abs(d) >= 1) return 0;
  return f.h * 0.5 * (1 + Math.cos(Math.PI * d));
}
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function terrainHeight(x, p) {
  let h = 0;
  for (const f of p.road) h += featureHeight(f, x);
  return h;
}

// First Piola–Kirchhoff element forces, per tetrahedron, in the same form as the WGSL cs_tet pass.
//   Ψ = μ E:E + λ/2 tr(E)² with Green strain E, plus a volumetric pressure energy -p·V.
//   P = F·S − p·cof(F);  node k (1..3) force = −V0 · P · G_{k−1};  node 0 = −Σ.
export function tetElementForces(X, GT, V0, mu, lambda, pressure, out) {
  const Ds = [...sub(X[1], X[0]), ...sub(X[2], X[0]), ...sub(X[3], X[0])];
  const F = mulMM(Ds, transposeC(GT));
  const FtF = mulMM(transposeC(F), F);
  const E = [0.5 * (FtF[0] - 1), 0.5 * FtF[1], 0.5 * FtF[2],
    0.5 * FtF[3], 0.5 * (FtF[4] - 1), 0.5 * FtF[5],
    0.5 * FtF[6], 0.5 * FtF[7], 0.5 * (FtF[8] - 1)];
  const trE = E[0] + E[4] + E[8];
  const S = E.map((e, k) => 2 * mu * e + (k === 0 || k === 4 || k === 8 ? lambda * trE : 0));
  const f0 = F.slice(0, 3), f1 = F.slice(3, 6), f2 = F.slice(6, 9);
  const cof = [...cross(f1, f2), ...cross(f2, f0), ...cross(f0, f1)];
  const FS = mulMM(F, S);
  const Pm = FS.map((val, k) => val - pressure * cof[k]);
  const G = [GT.slice(0, 3), GT.slice(3, 6), GT.slice(6, 9)];
  const g = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const pv = mulMV(Pm, G[k]);
    const fk = [-V0 * pv[0], -V0 * pv[1], -V0 * pv[2]];
    out[3 * (k + 1)] = fk[0]; out[3 * (k + 1) + 1] = fk[1]; out[3 * (k + 1) + 2] = fk[2];
    g[0] += fk[0]; g[1] += fk[1]; g[2] += fk[2];
  }
  out[0] = -g[0]; out[1] = -g[1]; out[2] = -g[2];
  return out;
}

// Derived Lamé parameters from the UI's Young's modulus and Poisson ratio.
export function lameParameters(p) {
  const mu = p.youngs / (2 * (1 + p.poisson));
  const lambda = (p.youngs * p.poisson) / ((1 + p.poisson) * (1 - 2 * p.poisson));
  return { mu, lambda };
}

// Packs parameters in the exact field order of `struct Params` in shaders.js (28 scalars, then 8 road vec4s).
export const PARAM_LAYOUT = [
  'mu', 'lambda', 'pressure', 'dt', 'gravity', 'damping', 'groundK', 'groundC',
  'friction', 'frictionC', 'beadK', 'beadC', 'rimRadius', 'treadRadius', 'rimMass', 'suspK',
  'suspC', 'speed', 'targetY', 'roadCount', 'yaw', 'nodeCount', 'tetCount',
  'NT', 'NI', 'NJ', 'pad0', 'pad1',
];
export const PARAM_FLOATS = PARAM_LAYOUT.length + 4 * MAX_ROAD; // 60
export function packRoad(features) {
  const out = new Float32Array(4 * MAX_ROAD);
  features.slice(0, MAX_ROAD).forEach((f, i) => out.set([f.x, f.w, f.h, f.kind], 4 * i));
  return out;
}
export function packParams(p, N, T) {
  const { mu, lambda } = lameParameters(p);
  const values = { ...p, mu, lambda, roadCount: p.road.length, nodeCount: N, tetCount: T, pad0: 0, pad1: 0 };
  const out = new Float32Array(PARAM_FLOATS);
  PARAM_LAYOUT.forEach((k, i) => { out[i] = values[k]; });
  out.set(packRoad(p.road), PARAM_LAYOUT.length);
  return out;
}

// CPU reference of the GPU pipeline: tet forces → node gather/integrate (+bead springs, ground) → rim update.
export class CpuTyreSimulation {
  constructor(overrides = {}) {
    this.mesh = buildTyreMesh(overrides);
    this.p = this.mesh.params;
    const { N, T } = this.mesh;
    this.N = N; this.T = T;
    this.tetF = new Float64Array(12 * T);
    this.reset();
  }

  rimAngles() {
    return { alpha: this.rim[3], yaw: this.p.yaw };
  }

  reset() {
    const { N, rest } = this.mesh;
    const y0 = this.p.treadRadius + 0.005;
    this.x = new Float64Array(3 * N);
    this.v = new Float64Array(3 * N);
    this.react = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      this.x[3 * n] = rest[3 * n];
      this.x[3 * n + 1] = rest[3 * n + 1] + y0;
      this.x[3 * n + 2] = rest[3 * n + 2];
    }
    this.rim = [0, y0, 0];      // centre x, y, z
    this.rim[3] = 0;            // spin angle alpha (about the wheel axle)
    this.rimVel = [0, 0, 0, 0]; // vx, vy, vz, alpha-dot
    this.time = 0;
  }

  step() {
    const p = this.p, m = this.mesh, N = this.N, T = this.T;
    const dt = p.dt;
    const { mu, lambda } = lameParameters(p);
    const x = this.x, v = this.v, tetF = this.tetF;
    const X = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const elem = new Array(12).fill(0);

    // 1) per-tet forces at current positions
    for (let q = 0; q < T; q++) {
      for (let k = 0; k < 4; k++) {
        const n = m.tetIdx[4 * q + k];
        X[k][0] = x[3 * n]; X[k][1] = x[3 * n + 1]; X[k][2] = x[3 * n + 2];
      }
      const GT = m.tetGT.subarray(9 * q, 9 * q + 9);
      tetElementForces(X, GT, m.tetV0[q], mu, lambda, p.pressure, elem);
      for (let e = 0; e < 12; e++) tetF[12 * q + e] = elem[e];
    }

    // 2) node gather + bead springs + ground contact + semi-implicit integration
    const [rx0, ry0, rz0] = this.rim;
    const [rvx, rvy, rvz, alphaDot] = this.rimVel;
    const { alpha, yaw } = this.rimAngles();
    const c = Math.cos(alpha), s = Math.sin(alpha);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // Spin vector W = α̇ · axle, axle = Ry(yaw)·ẑ = (sin yaw, 0, cos yaw).
    const Wx = alphaDot * sy, Wy = 0, Wz = alphaDot * cy;
    for (let n = 0; n < N; n++) {
      const mass = m.nodeRest[4 * n + 3];
      const px = x[3 * n], py = x[3 * n + 1], pz = x[3 * n + 2];
      let vx = v[3 * n], vy = v[3 * n + 1], vz = v[3 * n + 2];
      let fx = 0, fy = -p.gravity * mass, fz = 0;
      for (let e = m.adjStart[n]; e < m.adjStart[n + 1]; e++) {
        const f = m.adjList[e]; // entry = tet*4 + local node; tetF holds 3 floats per entry
        fx += tetF[3 * f]; fy += tetF[3 * f + 1]; fz += tetF[3 * f + 2];
      }
      fx -= p.damping * mass * vx; fy -= p.damping * mass * vy; fz -= p.damping * mass * vz;

      const restX = m.nodeRest[4 * n], restY = m.nodeRest[4 * n + 1], restZ = m.nodeRest[4 * n + 2];
      let react = 0;
      if (Math.hypot(restX, restY) < p.rimRadius + 1e-4) {
        // target = rim + Ry(yaw)·Rz(alpha)·rest ; r = target − rim centre
        const ax = restX * c - restY * s, ay = restX * s + restY * c, az = restZ;
        const rX = ax * cy + az * sy, rY = ay, rZ = -ax * sy + az * cy;
        const tx = rx0 + rX, ty = ry0 + rY, tz = rz0 + rZ;
        // rim velocity + W × r
        const wvx = rvx + (Wy * rZ - Wz * rY), wvy = rvy + (Wz * rX - Wx * rZ), wvz = rvz + (Wx * rY - Wy * rX);
        const bx = p.beadK * (tx - px) + p.beadC * mass * (wvx - vx);
        const by = p.beadK * (ty - py) + p.beadC * mass * (wvy - vy);
        const bz = p.beadK * (tz - pz) + p.beadC * mass * (wvz - vz);
        fx += bx; fy += by; fz += bz;
        react = -by;
      }
      const h = terrainHeight(px, p);
      const pen = h - py;
      if (pen > 0) {
        const fn = Math.max(p.groundK * pen - p.groundC * mass * vy, 0);
        fy += fn;
        const vl = Math.hypot(vx, vz);
        if (vl > 1e-6) {
          const ft = Math.min(p.frictionC * mass * vl, p.friction * fn);
          fx -= (ft * vx) / vl; fz -= (ft * vz) / vl;
        }
      }
      vx += (dt * fx) / mass; vy += (dt * fy) / mass; vz += (dt * fz) / mass;
      v[3 * n] = vx; v[3 * n + 1] = vy; v[3 * n + 2] = vz;
      x[3 * n] = px + dt * vx; x[3 * n + 1] = py + dt * vy; x[3 * n + 2] = pz + dt * vz;
      this.react[n] = react;
    }

    // 3) rim: suspension + bead reaction in y; travel along x at `speed`; spin about its axle at −v·cos(yaw)/R
    let sumR = 0;
    for (let n = 0; n < N; n++) sumR += this.react[n];
    const M = p.rimMass;
    const ay = (p.suspK * (p.targetY - this.rim[1]) - p.suspC * this.rimVel[1] - M * p.gravity + sumR) / M;
    this.rimVel[1] += dt * ay;
    this.rim[1] += dt * this.rimVel[1];
    this.rimVel[0] = p.speed;
    this.rimVel[3] = (-p.speed * Math.cos(p.yaw)) / p.treadRadius;
    this.rim[0] += dt * this.rimVel[0];
    this.rim[3] += dt * this.rimVel[3];
    this.time += dt;
  }
}
