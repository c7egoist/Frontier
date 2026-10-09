// Junction geometry.
//
// Arms leave the node as straight throats (see centerline.js). For every slot k
// (0 = carriageway edge ... 5 = outer edge) the arms' offset lines are intersected
// pairwise to form a corner, and each corner is rounded with a quadratic fillet
// (control point = the miter corner, end points = tangent points along the arm
// lines). Walking the arms in angular order gives a closed loop per slot:
//
//   [T-(arm0), T+(arm0), fillet(0->1)..., T-(arm1), T+(arm1), fillet(1->2)..., ...]
//
// Every loop has the same number of vertices and the same correspondence, so the
// bands between consecutive loops are watertight quads. The carriageway (slot 0) is
// a triangle fan from the node. Throat vertices sit exactly on the arms' cross
// sections, so roads and junctions meet without gaps or overlaps.
//
// Dead ends (one arm) close with a half-round cap centred on the node.

import { batterToe } from './batter.js';

export const MARGIN = 0.75;
const TAU = Math.PI * 2;
const TMAX = 120;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function cornerAt(a, b, k, x, z) {
  const oi = a.offs[k];
  const oj = b.offs[k];
  const p1x = x + oi * a.nx;
  const p1z = z + oi * a.nz;
  const p2x = x - oj * b.nx;
  const p2z = z - oj * b.nz;
  const det = a.dx * b.dz - a.dz * b.dx;
  if (Math.abs(det) < 1e-7) return [(p1x + p2x) / 2, (p1z + p2z) / 2];
  const ex = p2x - p1x;
  const ez = p2z - p1z;
  const t = (ex * b.dz - ez * b.dx) / det;
  return [p1x + t * a.dx, p1z + t * a.dz];
}

function capRings(a, x, z, M) {
  const rings = [];
  const N = 2 * M + 1;
  const th0 = a.th + Math.PI / 2;
  for (let k = 0; k < 6; k++) {
    const o = a.offs[k];
    const ring = [];
    ring.push({ x: x - a.nx * o, z: z - a.nz * o, kind: 0, owner: 0, arm: 0, side: -1, k, c: -1 });
    ring.push({ x: x + a.nx * o, z: z + a.nz * o, kind: 1, owner: 0, arm: 0, side: 1, k, c: -1 });
    for (let s = 1; s < N; s++) {
      const beta = th0 + (Math.PI * s) / N;
      ring.push({
        x: x + o * Math.cos(beta),
        z: z + o * Math.sin(beta),
        kind: 2,
        owner: 0,
        arm: -1,
        ha: 0,
        hb: 0,
        t: s / N,
        k,
        c: 0,
        s,
      });
    }
    rings.push(ring);
  }
  return rings;
}

// Solve the plan geometry of a junction.
// arms: [{ id, dx, dz, offs: number[6], dy: number[6], halfW }]  (dx,dz point away from the node)
export function solveJunction({ id = '', x, z, radius = 8, steps = 8, arms = [], margin = MARGIN }) {
  const warnings = [];
  const M = clamp(Math.round(Number(steps) || 8), 2, 24);
  const R = Math.max(0, Number(radius) || 0);
  const list = arms
    .map((a, src) => {
      const l = Math.hypot(a.dx, a.dz) || 1;
      const dx = a.dx / l;
      const dz = a.dz / l;
      return { ...a, src, dx, dz, nx: -dz, nz: dx, th: Math.atan2(dz, dx) };
    })
    .sort((p, q) => p.th - q.th);
  const m = list.length;
  const J = { id, x, z, radius: R, steps: M, arms: list, rings: [], corners: [], warnings };
  if (m === 0) return J;
  if (m === 1) {
    list[0].D = 0;
    J.rings = capRings(list[0], x, z, M);
    J.fan = [];
    for (const q of J.rings[0]) {
      J.fan.push(q);
      if (q.kind === 0) J.fan.push({ x, z, kind: 3, owner: 0, arm: 0, side: 0, k: 0, c: -1 });
    }
    return J;
  }

  const corners = [];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const a = list[i];
    const b = list[j];
    let phi = i === m - 1 ? b.th + TAU - a.th : b.th - a.th;
    phi = ((phi % TAU) + TAU) % TAU;
    if (phi < 1e-6 || phi > TAU - 1e-6) warnings.push(`arms ${a.id} and ${b.id} overlap`);
    const psi = Math.acos(clamp(a.dx * b.dx + a.dz * b.dz, -1, 1));
    const convex = phi < Math.PI; // block-side corner: uses the node radius
    const r = convex ? R : clamp(0.3 * R, 0.5, 3);
    let t = psi > 1e-4 ? r / Math.tan(psi / 2) : 0;
    if (!Number.isFinite(t)) t = TMAX;
    if (t > TMAX) {
      t = TMAX;
      warnings.push('corner radius too large for a sharp angle; clamped');
    }
    const Cs = [];
    for (let k = 0; k < 6; k++) Cs.push(cornerAt(a, b, k, x, z));
    corners.push({ i, j, phi, psi, convex, r, t, Cs });
  }

  // Throat distances: beyond every fillet tangent point of both adjacent corners.
  for (const a of list) a.maxProj = -Infinity;
  for (const c of corners) {
    for (const C of c.Cs) {
      const px = C[0] - x;
      const pz = C[1] - z;
      const a = list[c.i];
      const b = list[c.j];
      a.maxProj = Math.max(a.maxProj, px * a.dx + pz * a.dz + c.t);
      b.maxProj = Math.max(b.maxProj, px * b.dx + pz * b.dz + c.t);
    }
  }
  for (const a of list) {
    a.D = margin + Math.max(0, a.maxProj);
    if (a.D > 60) warnings.push(`long throat on ${a.id} (${a.D.toFixed(1)} m)`);
  }

  const rings = [];
  let fan = [];
  for (let k = 0; k < 6; k++) {
    const ring = [];
    for (let i = 0; i < m; i++) {
      const a = list[i];
      const cx = x + a.dx * a.D;
      const cz = z + a.dz * a.D;
      const o = a.offs[k];
      ring.push({ x: cx - a.nx * o, z: cz - a.nz * o, kind: 0, owner: i, arm: i, side: -1, k, c: -1 });
      ring.push({ x: cx + a.nx * o, z: cz + a.nz * o, kind: 1, owner: i, arm: i, side: 1, k, c: -1 });
      const cn = corners[i];
      const b = list[cn.j];
      const C = cn.Cs[k];
      const Ax = C[0] + a.dx * cn.t;
      const Az = C[1] + a.dz * cn.t;
      const Bx = C[0] + b.dx * cn.t;
      const Bz = C[1] + b.dz * cn.t;
      const owner = a.halfW >= b.halfW ? i : cn.j;
      for (let s = 0; s <= M; s++) {
        const u = s / M;
        const w0 = (1 - u) * (1 - u);
        const w1 = 2 * u * (1 - u);
        const w2 = u * u;
        ring.push({
          x: w0 * Ax + w1 * C[0] + w2 * Bx,
          z: w0 * Az + w1 * C[1] + w2 * Bz,
          kind: 2,
          owner,
          arm: -1,
          ha: i,
          hb: cn.j,
          t: u,
          k,
          c: i,
          s,
        });
      }
    }
    rings.push(ring);
    if (k === 0) {
      // carriageway boundary: the same ring with each arm's crown point on its throat
      fan = [];
      for (const q of ring) {
        fan.push(q);
        if (q.kind === 0) {
          const a = list[q.arm];
          fan.push({ x: x + a.dx * a.D, z: z + a.dz * a.D, kind: 3, owner: q.arm, arm: q.arm, side: 0, k: 0, c: -1 });
        }
      }
    }
  }
  J.rings = rings;
  J.fan = fan;
  J.corners = corners.map((c) => ({ i: c.i, j: c.j, phi: c.phi, psi: c.psi, convex: c.convex, r: c.r, t: c.t }));
  return J;
}

// Outward plan direction per ring point (throats use the arm normal exactly, so the
// batter toes match the road bodies).
export function ringOutward(J, ring) {
  const N = ring.length;
  return ring.map((q, idx) => {
    if (q.kind === 0) return [-J.arms[q.arm].nx, -J.arms[q.arm].nz];
    if (q.kind === 1) return [J.arms[q.arm].nx, J.arms[q.arm].nz];
    const prev = ring[(idx - 1 + N) % N];
    const next = ring[(idx + 1) % N];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const l = Math.hypot(tx, tz);
    if (l < 1e-9) {
      const rx = q.x - J.x;
      const rz = q.z - J.z;
      const rl = Math.hypot(rx, rz) || 1;
      return [rx / rl, rz / rl];
    }
    return [tz / l, -tx / l];
  });
}

// Chains: runs of canonical ring vertices between consecutive throats. The throat
// segment (T-, T+) is excluded, because it is shared with the road body.
function throatChains(ring) {
  const L = ring.length;
  const m = ring.filter((q) => q.kind === 0).length;
  const pos = new Array(m);
  ring.forEach((q, idx) => {
    if (q.kind === 0) pos[q.arm] = idx;
  });
  const chains = [];
  for (let i = 0; i < m; i++) {
    const s0 = (pos[i] + 1) % L;
    const e = pos[(i + 1) % m];
    const idx = [];
    let c = s0;
    for (;;) {
      idx.push(c);
      if (c === e) break;
      c = (c + 1) % L;
    }
    chains.push({ arm: i, idx });
  }
  return chains;
}

// Emit the junction surfaces into a MeshBuilder.
// env: { terrain, batterSlope, batterMax, fanKey, batterKey }
export function buildJunctionMesh(mb, J, env) {
  const m = J.arms.length;
  if (!m || !J.rings.length) return null;
  const rings = J.rings;
  const yOf = (arm, k) => arm.yD + arm.dy[k];
  const P3 = rings.map((ring, k) =>
    ring.map((q) => {
      if (q.kind === 2) {
        const ya = yOf(J.arms[q.ha], k);
        const yb = yOf(J.arms[q.hb], k);
        return [q.x, ya + (yb - ya) * q.t, q.z];
      }
      return [q.x, yOf(J.arms[q.arm], k), q.z];
    })
  );

  // carriageway fan (boundary includes each throat's crown point)
  const fanPts = J.fan.map((q) => {
    if (q.kind === 3) return [q.x, J.arms[q.arm].yD, q.z];
    if (q.kind === 2) {
      const ya = yOf(J.arms[q.ha], 0);
      const yb = yOf(J.arms[q.hb], 0);
      return [q.x, ya + (yb - ya) * q.t, q.z];
    }
    return [q.x, yOf(J.arms[q.arm], 0), q.z];
  });
  const cy = fanPts.reduce((s, p) => s + p[1], 0) / fanPts.length;
  mb.addFan([J.x, cy, J.z], fanPts, env.fanKey || 'asphalt');

  // kerb, walk, gutter and ditch bands between consecutive loops, per throat-to-throat chain
  const outs = rings.map((ring) => ringOutward(J, ring));
  const chains = throatChains(rings[0]);
  for (let k = 0; k < 5; k++) {
    const b = k + 1;
    for (const ch of chains) {
      const idx = ch.idx;
      const C = idx.length;
      const flat = [];
      for (const j of idx) flat.push(P3[k][j]);
      for (const j of idx) flat.push(P3[k + 1][j]);
      // Band choice per column: the owner's band when it has width, otherwise the
      // other arm of this corner (so a kerbed road meeting a plain road still closes).
      const pick = idx.map((j) => {
        const q = rings[k][j];
        const own = q.owner;
        const A = ch.arm;
        const B = (ch.arm + 1) % m;
        const other = own === A ? B : A;
        const cand = [J.arms[own].band[b], J.arms[other].band[b]];
        return cand.find((bd) => bd && !bd.empty) || null;
      });
      const outs_k = outs[k];
      mb.addGrid(flat, 2, C, {
        key: (r, c) => pick[c].key,
        uv: 'planar',
        skip: (r, c) => !pick[c] || pick[c].vertical,
        expectCol: idx.map(() => [0, 1, 0]),
      });
      mb.addGrid(flat, 2, C, {
        key: (r, c) => pick[c].key,
        uv: 'strip',
        skip: (r, c) => !pick[c] || !pick[c].vertical,
        expectCol: idx.map((j) => [-outs_k[j][0], 0, -outs_k[j][1]]),
      });
    }
  }

  // batters from the outer loop, chain by chain
  const toeAll = new Array(rings[5].length);
  const slopeAll = new Array(rings[5].length);
  const batterSlope = env.batterSlope ?? 2;
  const batterMax = env.batterMax ?? 28;
  P3[5].forEach((p, j) => {
    const [ox, oz] = outs[5][j];
    const t = batterToe(env.terrain, p[0], p[2], ox, oz, p[1], batterSlope, batterMax);
    slopeAll[j] = t.s > 1e-6 ? (t.y - p[1]) / t.s : 0;
    toeAll[j] = [t.x, t.y, t.z];
  });
  for (const ch of chains) {
    const idx = ch.idx;
    const flat = [...idx.map((j) => P3[5][j]), ...idx.map((j) => toeAll[j])];
    mb.addGrid(flat, 2, idx.length, {
      key: () => env.batterKey || 'batter',
      uv: 'strip',
      expectCol: idx.map((j) => [-slopeAll[j] * outs[5][j][0], 1, -slopeAll[j] * outs[5][j][1]]),
    });
  }
  return { P3, toes: toeAll, outs, chains: chains.length, fanPts };
}
