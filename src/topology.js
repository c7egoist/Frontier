// ---------------------------------------------------------------------------
// topology.js — road-network topology: how splines fuse into junctions.
//
// Pipeline (the approach that makes intersections generate clean geometry):
//   1. Sample each spline as ONE dense polyline; record node arc positions.
//   2. Split at arc positions: shared nodes, node-on-curve touches (T-joints),
//      and curve crossings (exact XZ intersection + height match; height gaps
//      stay overpasses). Splits closer than MERGE_ARC fuse into one group.
//   3. Split splines into RUNS between splits; legs = run ends at a group.
//      Groups become junctions by the junction rule (3+ legs, or 2 legs with
//      >= 15 degrees of deflection); junction runs trim back by the corner
//      radius, straight joins abut exactly, untrimmed.
//   4. Groups also remember their member node refs — the junction's anchors,
//      which the single junction handle drags to move the whole joint.
//
// Runs are never swallowed: junction-to-junction nubs become short chaining
// spans, so the network cannot gap.
// ---------------------------------------------------------------------------

import { cubicBezier, arcLengths } from './math.js';

const JOIN_XZ = 0.25;
const JOIN_Y = 0.6;
/** height gate for curve touches/crossings: fuses hand-wobble, spares overpasses */
const CROSS_Y = 1.2;
const PER_PAIR = 60;
/** node-to-curve touch radius (XZ) that fuses a T-joint */
const TOUCH_XZ = 0.5;
/** free ends seek a landing this far (XZ) across gaps */
const SEEK_XZ_ROAD = 1.2;
const SEEK_XZ_BRIDGE = 2.5;
/** ... and this far vertically (bridge ends ramp down to the road) */
const SEEK_Y_ROAD = 1.2;
const SEEK_Y_BRIDGE = 3.5;
/** splits closer than this (arc) merge into one group — no slivers */
const MERGE_ARC = 0.6;
/** splits within this of a spline end snap to the end (no stub runs) */
const END_SNAP = 0.6;
/** two run ends at a group are a junction when deflection exceeds this */
const BEND_DEG = 15;

export const TOL = {
  JOIN_XZ, JOIN_Y, CROSS_Y, TOUCH_XZ, MERGE_ARC, END_SNAP,
  SEEK_XZ_ROAD, SEEK_XZ_BRIDGE, SEEK_Y_ROAD, SEEK_Y_BRIDGE, BEND_DEG, PER_PAIR,
};

// --- spline sampling (world space, one polyline per spline) ------------------

export function splinePairs(s) {
  const out = [];
  for (let i = 0; i < s.nodes.length - 1; i++) out.push({ a: i, b: i + 1 });
  if (s.closed && s.nodes.length > 2) out.push({ a: s.nodes.length - 1, b: 0 });
  return out;
}

export function sampleSpline(s) {
  if (s.nodes.length < 2) return null;
  const pairs = splinePairs(s);
  const pts = [];
  const nodeIdx = new Array(s.nodes.length).fill(-1);
  pairs.forEach(({ a, b }, pi) => {
    const n1 = s.nodes[a];
    const n2 = s.nodes[b];
    if (pi === 0) nodeIdx[a] = 0;
    else if (nodeIdx[a] < 0) nodeIdx[a] = pts.length - 1;
    for (let i = 1; i < PER_PAIR; i++) {
      const t = i / (PER_PAIR - 1);
      pts.push(cubicBezier(n1.position, n1.handleOut, n2.handleIn, n2.position, t));
    }
    if (pi === 0) pts.unshift([...n1.position]);
    if (nodeIdx[b] < 0 || !(s.closed && b === 0)) nodeIdx[b] = pts.length - 1;
  });
  const lengths = arcLengths(pts);
  return { spline: s, pts, lengths, total: lengths[lengths.length - 1], nodeIdx };
}

/** Dense world-space centerline samples (for snapping). */
export function sampleCenterline(s, perPair = 24) {
  const out = [];
  if (s.nodes.length < 2) {
    for (const n of s.nodes) out.push([...n.position]);
    return out;
  }
  splinePairs(s).forEach(({ a, b }, pi) => {
    const n1 = s.nodes[a];
    const n2 = s.nodes[b];
    if (pi === 0) out.push([...n1.position]);
    for (let i = 1; i < perPair; i++) {
      out.push(cubicBezier(n1.position, n1.handleOut, n2.handleIn, n2.position, i / (perPair - 1)));
    }
  });
  return out;
}

// --- 2D segment helpers (plan view) -------------------------------------------

/** Exact XZ intersection of segments ab / cd; returns [t, u] params or null. */
export function segIntersectXZ(a, b, c, d) {
  const rx = b[0] - a[0]; const rz = b[2] - a[2];
  const sx = d[0] - c[0]; const sz = d[2] - c[2];
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-12) return null;
  const qx = c[0] - a[0]; const qz = c[2] - a[2];
  const t = (qx * sz - qz * sx) / denom;
  const u = (qx * rz - qz * rx) / denom;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return [Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))];
}

/** XZ distance from p to segment ab + closest param. */
export function pointSegXZ(p, a, b) {
  const abx = b[0] - a[0]; const abz = b[2] - a[2];
  const len2 = abx * abx + abz * abz;
  let t = len2 < 1e-12 ? 0 : ((p[0] - a[0]) * abx + (p[2] - a[2]) * abz) / len2;
  t = Math.min(1, Math.max(0, t));
  const dx = p[0] - (a[0] + abx * t); const dz = p[2] - (a[2] + abz * t);
  return { dist: Math.hypot(dx, dz), t };
}

/** Arc distance, circular for closed loops. */
export function arcDist(a, b, total, closed) {
  const d = Math.abs(a - b);
  return closed ? Math.min(d, total - d) : d;
}

/** Point on a dense polyline at arc distance s (world). */
export function pointAt(pts, lengths, s) {
  const total = lengths[lengths.length - 1];
  const c = Math.min(total, Math.max(0, s));
  let j = 0;
  while (j < pts.length - 2 && lengths[j + 1] < c) j++;
  const span = lengths[j + 1] - lengths[j];
  const lt = span <= 1e-9 ? 0 : (c - lengths[j]) / span;
  const a = pts[j]; const b = pts[j + 1];
  return [a[0] + (b[0] - a[0]) * lt, a[1] + (b[1] - a[1]) * lt, a[2] + (b[2] - a[2]) * lt];
}

// --- main topology build -------------------------------------------------------

export function buildTopology(project) {
  const splines = project.splines.filter((s) => s.nodes.length >= 2);
  const result = {
    samples: new Map(),
    groups: new Map(),   // gid -> { id, position, kind, nodeRefs: [{splineId, nodeId, index}] }
    runs: [],            // see Run
    junctionGroupIds: new Set(),
    splines,
  };
  if (splines.length === 0) return result;

  for (const s of splines) {
    const sm = sampleSpline(s);
    if (sm && sm.total > 0.5) result.samples.set(s.id, sm);
  }
  const samples = result.samples;
  const groups = result.groups;

  const addGroup = (kind) => {
    const id = `g${groups.size + 1}`;
    groups.set(id, { id, position: null, kind, nodeRefs: [] });
    return id;
  };

  // --- splits bookkeeping ---
  const splits = new Map(); // splineId -> [{ s, id }]
  let splitSeq = 0;
  const remapGroup = (from, to) => {
    if (from === to) return;
    for (const arr of splits.values()) for (const sp of arr) if (sp.id === from) sp.id = to;
    const g = groups.get(from);
    if (g) {
      const t = groups.get(to);
      if (t) {
        if (g.kind === 'crossing') t.kind = 'crossing';
        t.nodeRefs.push(...g.nodeRefs);
      }
      groups.delete(from);
    }
  };
  const addSplit = (splineId, s, groupId) => {
    const sm = samples.get(splineId);
    let arr = splits.get(splineId);
    if (!arr) { arr = []; splits.set(splineId, arr); }
    for (const sp of arr) {
      if (arcDist(sp.s, s, sm.total, sm.spline.closed) < MERGE_ARC) {
        if (groupId && groupId !== sp.id) remapGroup(groupId, sp.id);
        return sp.id;
      }
    }
    const id = groupId ?? `x${++splitSeq}`;
    if (!groups.has(id)) addGroup('crossing');
    arr.push({ s, id });
    return id;
  };
  const existingGroupAt = (splineId, s) => {
    const sm = samples.get(splineId);
    const arr = splits.get(splineId);
    if (!arr) return null;
    for (const sp of arr) {
      if (arcDist(sp.s, s, sm.total, sm.spline.closed) < MERGE_ARC) return sp.id;
    }
    return null;
  };
  const nodeS = (sm, idx) => sm.lengths[sm.nodeIdx[idx]];
  const groupAt = (gid) => groups.get(gid);

  // 1) node-node shares -> groups with member node refs (the junction anchors)
  {
    const clusters = [];
    for (const s of splines) {
      s.nodes.forEach((node, index) => {
        const c = clusters.find((gg) => {
          const dx = gg.position[0] - node.position[0];
          const dz = gg.position[2] - node.position[2];
          const dy = gg.position[1] - node.position[1];
          return Math.hypot(dx, dz) < JOIN_XZ && Math.abs(dy) < JOIN_Y;
        });
        if (c) c.refs.push({ spline: s, index });
        else clusters.push({ position: [...node.position], refs: [{ spline: s, index }] });
      });
    }
    for (const c of clusters) {
      if (c.refs.length < 2) continue;
      const gid = addGroup('shared');
      const g = groupAt(gid);
      g.position = c.position;
      for (const r of c.refs) {
        g.nodeRefs.push({ splineId: r.spline.id, nodeId: r.spline.nodes[r.index].id, index: r.index });
        const sm = samples.get(r.spline.id);
        if (sm && sm.nodeIdx[r.index] >= 0) addSplit(r.spline.id, nodeS(sm, r.index), gid);
      }
    }
  }

  // 2) node-on-curve touches (T-joints anywhere along a curve)
  for (const A of splines) {
    const smA = samples.get(A.id);
    if (!smA) continue;
    for (let ni = 0; ni < A.nodes.length; ni++) {
      const P = A.nodes[ni].position;
      const nsA = nodeS(smA, ni);
      for (const B of splines) {
        const smB = samples.get(B.id);
        if (!smB || (B.id === A.id && A.nodes.length < 2)) continue;
        let best = { dist: TOUCH_XZ, s: 0, y: 0 };
        for (let j = 0; j < smB.pts.length - 1; j++) {
          if (B.id === A.id) {
            const segMid = (smB.lengths[j] + smB.lengths[j + 1]) / 2;
            if (arcDist(segMid, nsA, smB.total, smB.spline.closed) < 1.2) continue;
          }
          const a = smB.pts[j]; const b = smB.pts[j + 1];
          if (P[0] < Math.min(a[0], b[0]) - TOUCH_XZ || P[0] > Math.max(a[0], b[0]) + TOUCH_XZ ||
            P[2] < Math.min(a[2], b[2]) - TOUCH_XZ || P[2] > Math.max(a[2], b[2]) + TOUCH_XZ) continue;
          const { dist, t } = pointSegXZ(P, a, b);
          if (dist < best.dist) {
            best = { dist, s: smB.lengths[j] + t * (smB.lengths[j + 1] - smB.lengths[j]), y: a[1] + (b[1] - a[1]) * t };
          }
        }
        if (best.dist < TOUCH_XZ && Math.abs(P[1] - best.y) < CROSS_Y) {
          const gA = existingGroupAt(A.id, nsA);
          const gB = existingGroupAt(B.id, best.s);
          if (gA !== null && gA === gB) continue; // already fused here (the share itself)
          const gid = addSplit(A.id, nsA);
          addSplit(B.id, best.s, gid);
          const g = groupAt(gid);
          if (g && !g.position) g.position = [P[0], (P[1] + best.y) / 2, P[2]];
          // anchor: the touching node on A
          if (g && !g.nodeRefs.some((r) => r.nodeId === A.nodes[ni].id)) {
            g.nodeRefs.push({ splineId: A.id, nodeId: A.nodes[ni].id, index: ni });
          }
        }
      }
    }
  }

  // 3) curve-curve crossings (incl. self-crossings); height gaps = overpasses
  {
    const segBBs = new Map();
    for (const [id, sm] of samples) {
      const bbs = [];
      for (let j = 0; j < sm.pts.length - 1; j++) {
        const a = sm.pts[j]; const b = sm.pts[j + 1];
        bbs.push({
          minx: Math.min(a[0], b[0]), maxx: Math.max(a[0], b[0]),
          minz: Math.min(a[2], b[2]), maxz: Math.max(a[2], b[2]),
        });
      }
      segBBs.set(id, bbs);
    }
    const sampleIds = [...samples.keys()];
    for (let ai = 0; ai < sampleIds.length; ai++) {
      for (let bi = ai; bi < sampleIds.length; bi++) {
        const A = sampleIds[ai]; const B = sampleIds[bi];
        const smA = samples.get(A); const smB = samples.get(B);
        const bbA = segBBs.get(A); const bbB = segBBs.get(B);
        const self = A === B;
        for (let i = 0; i < smA.pts.length - 1; i++) {
          for (let j = self ? i + 2 : 0; j < smB.pts.length - 1; j++) {
            if (self && smA.spline.closed && i === 0 && j === smB.pts.length - 2) continue;
            const ba = bbA[i]; const bb = bbB[j];
            if (ba.maxx < bb.minx || bb.maxx < ba.minx || ba.maxz < bb.minz || bb.maxz < ba.minz) continue;
            const hit = segIntersectXZ(smA.pts[i], smA.pts[i + 1], smB.pts[j], smB.pts[j + 1]);
            if (!hit) continue;
            const [t, u] = hit;
            const yA = smA.pts[i][1] + (smA.pts[i + 1][1] - smA.pts[i][1]) * t;
            const yB = smB.pts[j][1] + (smB.pts[j + 1][1] - smB.pts[j][1]) * u;
            if (Math.abs(yA - yB) >= CROSS_Y) continue; // overpass — stays grade-separated
            const sA = smA.lengths[i] + t * (smA.lengths[i + 1] - smA.lengths[i]);
            const sB = smB.lengths[j] + u * (smB.lengths[j + 1] - smB.lengths[j]);
            const gA = existingGroupAt(A, sA);
            const gB = existingGroupAt(B, sB);
            if (gA !== null && gA === gB) continue;
            const gid = addSplit(A, sA);
            addSplit(B, sB, gid);
            const g = groupAt(gid);
            if (g && !g.position) {
              g.position = [(smA.pts[i][0] + smB.pts[j][0]) / 2, (yA + yB) / 2, (smA.pts[i][2] + smB.pts[j][2]) / 2];
            }
          }
        }
      }
    }
  }

  // 4) end seeking: free ends fuse across small gaps; bridge ends ramp down
  for (const A of splines) {
    if (A.closed) continue;
    const smA = samples.get(A.id);
    if (!smA) continue;
    const seekXZ = A.bridge.enabled ? SEEK_XZ_BRIDGE : SEEK_XZ_ROAD;
    const seekY = A.bridge.enabled ? SEEK_Y_BRIDGE : SEEK_Y_ROAD;
    for (const ni of [0, A.nodes.length - 1]) {
      if (existingGroupAt(A.id, nodeS(smA, ni)) !== null) continue;
      const P = A.nodes[ni].position;
      let found = null;
      for (const B of splines) {
        if (B.id === A.id) continue;
        const smB = samples.get(B.id);
        if (!smB) continue;
        for (let j = 0; j < smB.pts.length - 1; j++) {
          const a = smB.pts[j]; const b = smB.pts[j + 1];
          if (P[0] < Math.min(a[0], b[0]) - seekXZ || P[0] > Math.max(a[0], b[0]) + seekXZ ||
            P[2] < Math.min(a[2], b[2]) - seekXZ || P[2] > Math.max(a[2], b[2]) + seekXZ) continue;
          const { dist, t } = pointSegXZ(P, a, b);
          if (dist >= seekXZ || (found && dist >= found.dist)) continue;
          const y = a[1] + (b[1] - a[1]) * t;
          if (Math.abs(P[1] - y) >= seekY) continue;
          found = { splineId: B.id, s: smB.lengths[j] + t * (smB.lengths[j + 1] - smB.lengths[j]), dist };
        }
      }
      if (found) {
        const gid = addSplit(A.id, nodeS(smA, ni));
        addSplit(found.splineId, found.s, gid);
        const g = groupAt(gid);
        if (g && !g.position) g.position = [...P];
        if (g && !g.nodeRefs.some((r) => r.nodeId === A.nodes[ni].id)) {
          g.nodeRefs.push({ splineId: A.id, nodeId: A.nodes[ni].id, index: ni });
        }
      }
    }
  }

  // --- runs: split at every split ---
  const runs = [];
  for (const s of splines) {
    const sm = samples.get(s.id);
    if (!sm) continue;
    let arr = splits.get(s.id) ?? [];
    if (!s.closed) {
      for (const sp of arr) {
        if (sp.s < END_SNAP) sp.s = 0;
        else if (sm.total - sp.s < END_SNAP) sp.s = sm.total;
      }
    }
    arr = [...arr].sort((a, b) => a.s - b.s);
    const dedup = [];
    for (const sp of arr) {
      const prev = dedup[dedup.length - 1];
      if (prev && Math.abs(prev.s - sp.s) < 1e-6) remapGroup(sp.id, prev.id);
      else dedup.push(sp);
    }
    if (s.closed && dedup.length > 1) {
      const first = dedup[0]; const last = dedup[dedup.length - 1];
      if (first.s + (sm.total - last.s) < MERGE_ARC) {
        remapGroup(last.id, first.id);
        dedup.pop();
      }
    }
    arr = dedup;
    const mkRun = (s0, s1, fromId, toId) => {
      if (s1 - s0 < 0.05) return;
      const pts = [pointAt(sm.pts, sm.lengths, s0)];
      for (let j = 0; j < sm.pts.length; j++) {
        const L = sm.lengths[j];
        if (L > s0 + 1e-4 && L < s1 - 1e-4) pts.push(sm.pts[j]);
      }
      pts.push(pointAt(sm.pts, sm.lengths, s1));
      runs.push({ spline: s, fromId, toId, pts, trimStart: false, trimEnd: false, closedLoop: false });
    };
    const mkWrapRun = (s0, s1, fromId, toId) => {
      const gt = [];
      const lt = [];
      for (let j = 0; j < sm.pts.length; j++) {
        const L = sm.lengths[j];
        if (L > s0 + 1e-4) gt.push(sm.pts[j]);
        else if (L < s1 - 1e-4) lt.push(sm.pts[j]);
      }
      runs.push({
        spline: s, fromId, toId,
        pts: [pointAt(sm.pts, sm.lengths, s0), ...gt, ...lt, pointAt(sm.pts, sm.lengths, s1)],
        trimStart: false, trimEnd: false, closedLoop: false,
      });
    };
    if (!s.closed) {
      const bounds = [{ s: 0, id: null }, ...arr, { s: sm.total, id: null }];
      for (let k = 0; k < bounds.length - 1; k++) {
        mkRun(bounds[k].s, bounds[k + 1].s, bounds[k].id, bounds[k + 1].id);
      }
    } else if (arr.length === 0) {
      runs.push({ spline: s, fromId: null, toId: null, pts: [...sm.pts], trimStart: false, trimEnd: false, closedLoop: true });
    } else if (arr.length === 1) {
      mkWrapRun(arr[0].s, arr[0].s, arr[0].id, arr[0].id);
    } else {
      for (let k = 0; k < arr.length; k++) {
        const cur = arr[k]; const nxt = arr[(k + 1) % arr.length];
        if (k < arr.length - 1) mkRun(cur.s, nxt.s, cur.id, nxt.id);
        else mkWrapRun(cur.s, nxt.s, cur.id, nxt.id);
      }
    }
  }

  // --- junction rule over run ends ---
  const endsByGroup = new Map();
  for (const run of runs) {
    if (run.fromId) {
      if (!endsByGroup.has(run.fromId)) endsByGroup.set(run.fromId, []);
      endsByGroup.get(run.fromId).push({ run, atStart: true });
    }
    if (run.toId) {
      if (!endsByGroup.has(run.toId)) endsByGroup.set(run.toId, []);
      endsByGroup.get(run.toId).push({ run, atStart: false });
    }
  }
  const arrivalDir = (run, atStart) => {
    const p = run.pts;
    const a = atStart ? p[0] : p[p.length - 1];
    const b = atStart ? p[1] : p[p.length - 2];
    const d = [a[0] - b[0], a[2] - b[2]];
    const l = Math.hypot(d[0], d[1]);
    return l < 1e-6 ? [1, 0] : [d[0] / l, d[1] / l];
  };
  const junctionGroupIds = new Set();
  for (const [gid, ends] of endsByGroup) {
    if (ends.length >= 3) { junctionGroupIds.add(gid); continue; }
    if (ends.length < 2) continue;
    const d0 = arrivalDir(ends[0].run, ends[0].atStart);
    const d1 = arrivalDir(ends[1].run, ends[1].atStart);
    const dot = Math.max(-1, Math.min(1, d0[0] * d1[0] + d0[1] * d1[1]));
    if ((Math.acos(dot) * 180) / Math.PI < 180 - BEND_DEG) junctionGroupIds.add(gid);
  }
  for (const run of runs) {
    run.trimStart = !!run.fromId && junctionGroupIds.has(run.fromId);
    run.trimEnd = !!run.toId && junctionGroupIds.has(run.toId);
  }

  result.runs = runs;
  result.junctionGroupIds = junctionGroupIds;
  return result;
}
