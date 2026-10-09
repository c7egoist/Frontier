// Network build: project model -> meshes, junction solutions, crossings and checks.
//
// The solve is iterative because the throat distance of each arm depends on its
// direction, and the direction depends on which interior points survive. Points
// that would fall inside a throat are ignored for shape (and reported) so that the
// straight stub always covers the throat.

import { withRoadDefaults, profileSlots, bandMaterial } from './profile.js';
import { buildCenterline } from './centerline.js';
import { solveJunction, buildJunctionMesh } from './junction.js';
import { buildRoadBody, stationList } from './road.js';
import { MeshBuilder } from './mesh.js';
import { makeTerrain } from './terrain.js';

const DEFAULT_NODE = { radius: 8, steps: 8 };
const MIN_STUB = 6;

const planDist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function segIntersect(p, q, r, s) {
  const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d;
  const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

function distToPolyline(x, z, poly) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const vx = b[0] - a[0];
    const vz = b[2] - a[2];
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[2]) * vz) / l2));
    const d = Math.hypot(a[0] + vx * t - x, a[2] + vz * t - z);
    if (d < best) best = d;
  }
  return best;
}

function normDir(dx, dz) {
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

export function buildNetwork(project, opts = {}) {
  const warnings = [];
  const clearance = Number(project.clearance ?? 5.5);
  const terrain = makeTerrain(project.terrain);
  const nodeById = new Map();
  for (const n of project.nodes || []) {
    nodeById.set(n.id, {
      ...DEFAULT_NODE,
      ...n,
      radius: Math.max(0, Number(n.radius ?? DEFAULT_NODE.radius)),
      steps: Math.round(Number(n.steps ?? DEFAULT_NODE.steps)),
    });
  }
  const roads = [];
  for (const r of project.roads || []) {
    const from = nodeById.get(r.from);
    const to = nodeById.get(r.to);
    if (!from || !to) {
      warnings.push(`road ${r.id} references a missing node`);
      continue;
    }
    if (from.id === to.id) {
      warnings.push(`road ${r.id} starts and ends at the same node`);
      continue;
    }
    const props = withRoadDefaults(r);
    roads.push({
      id: r.id,
      name: r.name || r.id,
      from,
      to,
      raw: r,
      props,
      sl: profileSlots(props),
      userPts: (r.points || []).map((p) => [Number(p.x), Number(p.y), Number(p.z)]),
    });
  }

  const dropped = new Map(); // road id -> count of ignored points

  // Interior points that survive for the given throat estimates. A point closer to a
  // node than its straight stub can cover is ignored (and reported).
  const effectivePts = (rd, Dm) => {
    const A = [rd.from.x, rd.from.y, rd.from.z];
    const B = [rd.to.x, rd.to.y, rd.to.z];
    const stubA = Math.max(MIN_STUB, (Dm.get(`${rd.id}:from`) ?? 0) + 2);
    const stubB = Math.max(MIN_STUB, (Dm.get(`${rd.id}:to`) ?? 0) + 2);
    let start = 0;
    let end = rd.userPts.length;
    while (start < end && planDist(rd.userPts[start], A) < stubA / 0.9 + 0.5) start++;
    while (end > start && planDist(rd.userPts[end - 1], B) < stubB / 0.9 + 0.5) end--;
    return { pts: rd.userPts.slice(start, end), dropped: rd.userPts.length - (end - start), start, end };
  };

  const armsFor = (node, ptsOf) => {
    const arms = [];
    for (const rd of roads) {
      let end = null;
      if (rd.from.id === node.id) end = 'from';
      else if (rd.to.id === node.id) end = 'to';
      if (!end) continue;
      const pts = ptsOf(rd);
      const other = end === 'from' ? rd.to : rd.from;
      const first = end === 'from' ? pts[0] : pts[pts.length - 1];
      const target = first ?? [other.x, other.y, other.z];
      const [dx, dz] = normDir(target[0] - node.x, target[2] - node.z);
      const sl = rd.sl;
      const band = [null];
      for (let b = 1; b <= 5; b++) {
        const info = sl.bands[b];
        band.push({ key: bandMaterial(rd.props, info.key), empty: info.empty, vertical: info.vertical });
      }
      arms.push({
        roadId: rd.id,
        end,
        dx,
        dz,
        offs: sl.slots.map((sv) => sv.o),
        dy: sl.slots.map((sv) => sv.dy),
        halfW: sl.carriageHalf,
        band,
        fanKey: bandMaterial(rd.props, 'carriage'),
        id: rd.id,
      });
    }
    return arms;
  };

  // Fixed point: points -> arms -> throat distances -> points. Stops when the points
  // and the throats they were filtered with agree, so the junction solve and the
  // centreline always see the same geometry.
  let Dcur = new Map();
  let ptsCur = new Map();
  let juncs = new Map();
  let dropCur = new Map();
  let rangeCur = new Map();
  for (let iter = 0; iter < 8; iter++) {
    const ptsNew = new Map();
    const dropNew = new Map();
    const rangeNew = new Map();
    for (const rd of roads) {
      const e = effectivePts(rd, Dcur);
      ptsNew.set(rd.id, e.pts);
      rangeNew.set(rd.id, [e.start, e.end]);
      if (e.dropped) dropNew.set(rd.id, e.dropped);
    }
    const juncNew = new Map();
    const Dnew = new Map();
    for (const node of nodeById.values()) {
      const arms = armsFor(node, (rd) => ptsNew.get(rd.id));
      if (!arms.length) continue;
      const J = solveJunction({ id: node.id, x: node.x, z: node.z, radius: node.radius, steps: node.steps, arms });
      juncNew.set(node.id, J);
      for (const a of J.arms) Dnew.set(`${a.roadId}:${a.end}`, a.D ?? 0);
    }
    let same = iter > 0 && Dnew.size === Dcur.size;
    if (same) for (const [k, v] of Dnew) if (Math.abs(v - (Dcur.get(k) ?? -1)) > 1e-6) same = false;
    if (same) for (const [k, v] of ptsNew) {
      const old = ptsCur.get(k) || [];
      if (old.length !== v.length || old.some((p, i) => p[0] !== v[i][0] || p[2] !== v[i][2])) same = false;
    }
    ptsCur = ptsNew;
    rangeCur = rangeNew;
    dropCur = dropNew;
    juncs = juncNew;
    Dcur = Dnew;
    if (same) break;
  }
  for (const [id, n] of dropCur) dropped.set(id, n);

  // centrelines and road spans, from the converged geometry
  const built = [];
  for (const rd of roads) {
    const pts = ptsCur.get(rd.id) || [];
    const A = [rd.from.x, rd.from.y, rd.from.z];
    const B = [rd.to.x, rd.to.y, rd.to.z];
    const dA = Dcur.get(`${rd.id}:from`) ?? 0;
    const dB = Dcur.get(`${rd.id}:to`) ?? 0;
    const stubA = Math.max(MIN_STUB, dA + 2);
    const stubB = Math.max(MIN_STUB, dB + 2);
    const cl = buildCenterline({ a: A, b: B, points: pts, stubA: pts.length ? stubA : 0, stubB: pts.length ? stubB : 0, ds: 1 });
    const L = cl.L;
    const s0 = dA;
    const s1 = L - dB;
    if (dropped.get(rd.id)) warnings.push(`${dropped.get(rd.id)} interior point(s) of ${rd.name} sit inside a junction and were ignored`);
    if (!(s1 - s0 > 0.2)) warnings.push(`${rd.name} is too short between its junctions`);
    if (pts.length && (cl.stubA + 1e-6 < dA || cl.stubB + 1e-6 < dB)) warnings.push(`throat on ${rd.name} exceeds its straight stub`);
    const [rs, re] = rangeCur.get(rd.id) || [0, rd.userPts.length];
    // station of every user point (null where the point was ignored)
    const userStations = rd.userPts.map((_, i) => (i >= rs && i < re ? cl.stations[i - rs] : null));
    built.push({ rd, cl, L, s0, s1, dA, dB, pts, userStations });
  }
  const byId = new Map(built.map((b) => [b.rd.id, b]));

  // Junction arms need the centreline height at their throat.
  for (const J of juncs.values()) {
    for (const a of J.arms) {
      const b = byId.get(a.roadId);
      if (!b) continue;
      const s = a.end === 'from' ? b.dA : b.L - b.dB;
      a.yD = b.cl.at(Math.max(0, Math.min(b.L, s))).p[1];
    }
  }

  // Crossings between road centrelines (plan intersections not inside a junction).
  const polys = new Map();
  for (const b of built) polys.set(b.rd.id, b.cl.pts);
  const nodeXZ = [...nodeById.values()].map((n) => [n.x, n.z]);
  const crossings = [];
  // plan bounding boxes: road pairs and segment pairs are only tested where boxes overlap
  const boxOf = (pts) => {
    const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const p of pts) {
      if (p[0] < b.x0) b.x0 = p[0];
      if (p[0] > b.x1) b.x1 = p[0];
      if (p[2] < b.z0) b.z0 = p[2];
      if (p[2] > b.z1) b.z1 = p[2];
    }
    return b;
  };
  const overlap = (a, b, pad = 0) => a.x0 <= b.x1 + pad && b.x0 <= a.x1 + pad && a.z0 <= b.z1 + pad && b.z0 <= a.z1 + pad;
  for (const b of built) b.box = boxOf(b.cl.pts);
  for (let i = 0; i < built.length; i++) {
    for (let j = i + 1; j < built.length; j++) {
      const A = built[i];
      const B = built[j];
      if (A.rd.from.id === B.rd.from.id || A.rd.from.id === B.rd.to.id || A.rd.to.id === B.rd.from.id || A.rd.to.id === B.rd.to.id) continue;
      if (!overlap(A.box, B.box)) continue;
      const pa = A.cl.pts;
      const pb = B.cl.pts;
      // stations along each polyline
      for (let p = 0; p + 1 < pa.length; p++) {
        const sa = boxOf([pa[p], pa[p + 1]]);
        for (let q = 0; q + 1 < pb.length; q++) {
          if (!overlap(sa, boxOf([pb[q], pb[q + 1]]))) continue;
          const hit = segIntersect([pa[p][0], pa[p][2]], [pa[p + 1][0], pa[p + 1][2]], [pb[q][0], pb[q][2]], [pb[q + 1][0], pb[q + 1][2]]);
          if (!hit) continue;
          const sA = A.cl.S[p] + (A.cl.S[p + 1] - A.cl.S[p]) * hit.t;
          const sB = B.cl.S[q] + (B.cl.S[q + 1] - B.cl.S[q]) * hit.u;
          const x = pa[p][0] + (pa[p + 1][0] - pa[p][0]) * hit.t;
          const z = pa[p][2] + (pa[p + 1][2] - pa[p][2]) * hit.t;
          if (sA < A.s0 - 0.5 || sA > A.s1 + 0.5 || sB < B.s0 - 0.5 || sB > B.s1 + 0.5) continue;
          if (nodeXZ.some(([nx, nz]) => Math.hypot(nx - x, nz - z) < 14)) continue;
          const yA = A.cl.at(sA).p[1];
          const yB = B.cl.at(sB).p[1];
          const dy = yA - yB;
          if (crossings.some((c) => ((c.a === A.rd.id && c.b === B.rd.id) || (c.a === B.rd.id && c.b === A.rd.id)) && Math.hypot(c.x - x, c.z - z) < 1.5)) continue;
          crossings.push({
            a: A.rd.id,
            b: B.rd.id,
            sA,
            sB,
            x,
            z,
            yA,
            yB,
            dy,
            grade: Math.abs(dy) >= clearance ? 'separated' : 'at-grade',
            upper: dy >= 0 ? A.rd.id : B.rd.id,
            lower: dy >= 0 ? B.rd.id : A.rd.id,
          });
        }
      }
    }
  }

  // Bridge flags per road: terrain height plus grade-separated crossings.
  const bridgeFlags = new Map();
  for (const b of built) {
    const stations = stationList(b.s0, b.s1, 1);
    const flags = stations.map((s) => {
      const f = b.cl.at(s);
      const g = terrain.height(f.p[0], f.p[2]);
      const thr = b.rd.props.bridge?.threshold ?? 2.5;
      return f.p[1] - g >= thr;
    });
    const mode = b.rd.props.bridge?.mode ?? 'auto';
    for (const c of crossings) {
      if (c.grade !== 'separated' || c.upper !== b.rd.id) continue;
      const other = byId.get(c.lower);
      const h = (other ? other.rd.sl.carriageHalf : 4) + 3;
      stations.forEach((s, i) => {
        if (Math.abs(s - c.sA) <= h) flags[i] = true;
      });
    }
    const forced = mode === 'on';
    const off = mode === 'off';
    bridgeFlags.set(b.rd.id, flags.map((v) => (off ? false : forced ? true : v)));
  }

  // Build meshes.
  const mb = new MeshBuilder();
  // true when (x, z) lies inside another road's footprint (piers must not stand there)
  const blocked = (x, z, selfId) => {
    for (const b of built) {
      if (b.rd.id === selfId) continue;
      const d = distToPolyline(x, z, polys.get(b.rd.id));
      if (d < b.rd.sl.totalHalf + 1.5) return true;
    }
    return false;
  };
  const junctionOut = [];
  for (const [nodeId, J] of juncs) {
    const node = nodeById.get(nodeId);
    const batterSlope = 2;
    const rec = buildJunctionMesh(mb, J, {
      terrain,
      batterSlope,
      batterMax: 12,
      fanKey: J.arms.reduce((best, a) => (!best || a.halfW > best.halfW ? a : best), null)?.fanKey || 'asphalt',
      batterKey: 'batter',
    });
    junctionOut.push({ id: nodeId, node, J, rec, warnings: J.warnings });
    for (const w of J.warnings) warnings.push(`${node?.name || nodeId}: ${w}`);
  }
  const roadOut = [];
  for (const b of built) {
    const body = buildRoadBody(mb, {
      id: b.rd.id,
      road: b.rd.props,
      cl: b.cl,
      s0: b.s0,
      s1: b.s1,
      terrain,
      bridgeFlags: bridgeFlags.get(b.rd.id),
      blocked: (x, z) => blocked(x, z, b.rd.id),
      step: 1,
      slope: 2,
      maxBatter: 12,
    });
    roadOut.push({ id: b.rd.id, name: b.rd.name, cl: b.cl, s0: b.s0, s1: b.s1, L: b.L, dA: b.dA, dB: b.dB, body, props: b.rd.props, from: b.rd.from.id, to: b.rd.to.id, userStations: b.userStations });
    for (const w of body.warnings) warnings.push(`${b.rd.name}: ${w}`);
  }
  const mesh = mb.finalize();
  const bridges = roadOut.flatMap((r) => (r.body.runs.bridge || []).map(([a, b]) => ({ road: r.id, s0: a, s1: b })));
  const stats = {
    roads: roadOut.length,
    junctions: junctionOut.length,
    crossings: crossings.length,
    separated: crossings.filter((c) => c.grade === 'separated').length,
    atGrade: crossings.filter((c) => c.grade === 'at-grade').length,
    bridges: bridges.length,
    triangles: mesh.triangles,
    vertices: mesh.vertices,
    warnings: warnings.length,
  };
  return { terrain, mesh, junctions: junctionOut, roads: roadOut, crossings, bridges, warnings, stats, dropped: [...dropped.entries()] };
}
