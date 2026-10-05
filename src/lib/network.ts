// Network assembly — TransitArchitect-style graph build.
//
//  1. Sample each spline as ONE dense polyline; record node arc positions.
//  2. Split at arc positions: shared nodes, node-on-curve touches, and
//     curve crossings (exact XZ intersection + height match; height gaps
//     stay overpasses). Splits closer than MERGE_ARC fuse into one group.
//  3. Split splines into RUNS between splits; legs = run ends at a group.
//     Groups become junctions by the TA rule (3+ legs, or 2 legs with
//     >= 15 degrees of deflection); junction runs trim back by
//     cornerRadius, straight joins abut exactly, untrimmed.
//  4. Build ONE span per run (road or bridge) — no interior seams.
//  5. Derive approach frames from span end stations and build merged
//     junctions from them — watertight by construction.

import {
  Vec3, v_sub, v_scale, v_len, worldToRoad, roadToWorld, cubicBezier, arcLengths,
  left_normal,
} from './vec';
import {
  PatchSpec, CrossLines, buildFrames, buildRoadSpan, computeCrossLines,
  buildMergedJunction, JunctionLeg, StationFrame, SpanRailLinks, RailRedirect,
} from './roadGeometry';
import { buildBeamSpan, buildArchSpan } from './bridgeGeometry';
import type { Project, Spline, Point3D, RailSettings } from './model';
import { topologyName } from './model';

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

export interface JunctionArmInfo {
  splineId: string;
  splineName: string;
  color: string;
  angleDeg: number;
}

export interface BuiltJunction {
  id: string;
  position: Point3D;
  topology: string;
  /** 'shared' = built from shared nodes only; 'crossing' = a curve crossing or T-touch fused it */
  kind: 'shared' | 'crossing';
  arms: JunctionArmInfo[];
  patches: PatchSpec[];
}

export type SpanKind = 'road' | 'beam' | 'arch';

export interface BuiltSpan {
  splineId: string;
  kind: SpanKind;
  length: number;
  patches: PatchSpec[];
}

export interface BuiltNetwork {
  junctions: BuiltJunction[];
  spans: BuiltSpan[];
}

// --- spline sampling (world space, one polyline per spline) ------------------

interface SplineSample {
  spline: Spline;
  pts: Vec3[];
  lengths: number[];
  total: number;
  /** dense point index of each node */
  nodeIdx: number[];
}

function splinePairs(s: Spline): Array<{ a: number; b: number }> {
  const out: Array<{ a: number; b: number }> = [];
  for (let i = 0; i < s.nodes.length - 1; i++) out.push({ a: i, b: i + 1 });
  if (s.closed && s.nodes.length > 2) out.push({ a: s.nodes.length - 1, b: 0 });
  return out;
}

function sampleSpline(s: Spline): SplineSample | null {
  if (s.nodes.length < 2) return null;
  const pairs = splinePairs(s);
  const pts: Vec3[] = [];
  const nodeIdx: number[] = new Array(s.nodes.length).fill(-1);
  pairs.forEach(({ a, b }, pi) => {
    const n1 = s.nodes[a];
    const n2 = s.nodes[b];
    if (pi === 0) nodeIdx[a] = 0;
    else if (nodeIdx[a] < 0) nodeIdx[a] = pts.length - 1; // joint with previous pair
    for (let i = 1; i < PER_PAIR; i++) {
      const t = i / (PER_PAIR - 1);
      pts.push(cubicBezier(
        n1.position as Vec3, n1.handleOut as Vec3, n2.handleIn as Vec3, n2.position as Vec3, t,
      ));
    }
    if (pi === 0) pts.unshift([...n1.position] as Vec3);
    // closed loops: keep node 0 at index 0 (last pair re-ends there as a dup)
    if (nodeIdx[b] < 0 || !(s.closed && b === 0)) nodeIdx[b] = pts.length - 1;
  });
  const lengths = arcLengths(pts);
  return { spline: s, pts, lengths, total: lengths[lengths.length - 1], nodeIdx };
}

// --- node clustering --------------------------------------------------------

interface NodeRef { spline: Spline; index: number }
interface NodeGroup { position: Point3D; refs: NodeRef[] }

function clusterNodes(splines: Spline[]): NodeGroup[] {
  const groups: NodeGroup[] = [];
  for (const s of splines) {
    s.nodes.forEach((node, index) => {
      const g = groups.find((gg) => {
        const dx = gg.position[0] - node.position[0];
        const dz = gg.position[2] - node.position[2];
        const dy = gg.position[1] - node.position[1];
        return Math.hypot(dx, dz) < JOIN_XZ && Math.abs(dy) < JOIN_Y;
      });
      if (g) g.refs.push({ spline: s, index });
      else groups.push({ position: [...node.position] as Point3D, refs: [{ spline: s, index }] });
    });
  }
  return groups;
}

// --- 2D segment helpers (plan view) -------------------------------------------

/** Exact XZ intersection of segments ab / cd; returns [t, u] params or null. */
function segIntersectXZ(a: Vec3, b: Vec3, c: Vec3, d: Vec3): [number, number] | null {
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
function pointSegXZ(p: Vec3, a: Vec3, b: Vec3): { dist: number; t: number } {
  const abx = b[0] - a[0]; const abz = b[2] - a[2];
  const len2 = abx * abx + abz * abz;
  let t = len2 < 1e-12 ? 0 : ((p[0] - a[0]) * abx + (p[2] - a[2]) * abz) / len2;
  t = Math.min(1, Math.max(0, t));
  const dx = p[0] - (a[0] + abx * t); const dz = p[2] - (a[2] + abz * t);
  return { dist: Math.hypot(dx, dz), t };
}

/** Arc distance, circular for closed loops. */
function arcDist(a: number, b: number, total: number, closed: boolean): number {
  const d = Math.abs(a - b);
  return closed ? Math.min(d, total - d) : d;
}

// --- frame helpers -----------------------------------------------------------

/** Append a copy of the first frame at the end so closed loops wrap exactly. */
export function closeFrames(frames: StationFrame[]): StationFrame[] {
  if (frames.length < 3) return frames;
  const first = frames[0];
  const last = frames[frames.length - 1];
  const closing = v_len(v_sub(first.center, last.center));
  return [...frames, { ...first, s: last.s + closing }];
}

/** Point on a dense polyline at arc distance s (world). */
function pointAt(pts: Vec3[], lengths: number[], s: number): Vec3 {
  const total = lengths[lengths.length - 1];
  const c = Math.min(total, Math.max(0, s));
  let j = 0;
  while (j < pts.length - 2 && lengths[j + 1] < c) j++;
  const span = lengths[j + 1] - lengths[j];
  const lt = span <= 1e-9 ? 0 : (c - lengths[j]) / span;
  const a = pts[j]; const b = pts[j + 1];
  return [a[0] + (b[0] - a[0]) * lt, a[1] + (b[1] - a[1]) * lt, a[2] + (b[2] - a[2]) * lt];
}

// --- main build --------------------------------------------------------------

interface Run {
  spline: Spline;
  /** split-group id at each end (null = free spline end) */
  fromId: string | null;
  toId: string | null;
  /** world dense points from one end to the other (inclusive ends) */
  pts: Vec3[];
  trimStart: boolean;
  trimEnd: boolean;
  closedLoop: boolean;
}

interface ViableRun extends Run {
  /** road-space trimmed centerline */
  road: Vec3[];
  frames: StationFrame[];
  lines: CrossLines;
  capStart: boolean;
  capEnd: boolean;
  landingStart: boolean;
  landingEnd: boolean;
  /** road-run rail ends bent onto the adjoining bridge (set by link pass) */
  railLinks?: SpanRailLinks;
  /** bridge parapet end heights at landings (ramps down to the rails) */
  rampStartH?: number;
  rampEndH?: number;
}

export function buildNetwork(project: Project): BuiltNetwork {
  const junctions: BuiltJunction[] = [];
  const spans: BuiltSpan[] = [];
  const splines = project.splines.filter((s) => s.nodes.length >= 2);
  if (splines.length === 0) return { junctions, spans };

  const samples = new Map<string, SplineSample>();
  for (const s of splines) {
    const sm = sampleSpline(s);
    if (sm && sm.total > 0.5) samples.set(s.id, sm);
  }
  const groups = clusterNodes(splines);

  // --- splits: shared nodes + node-on-curve touches + curve crossings ---
  // Every split carries a group id; runs break at splits and groups with
  // 3+ run ends (or a bent degree-2 pair) become junctions. Spans can never
  // render crossed or overlapped: any at-grade touch fuses into a junction.
  interface Split { s: number; id: string }
  const splits = new Map<string, Split[]>();
  const groupKind = new Map<string, 'shared' | 'crossing'>();
  let splitSeq = 0;
  const remapGroup = (from: string, to: string) => {
    if (from === to) return;
    for (const arr of splits.values()) for (const sp of arr) if (sp.id === from) sp.id = to;
    if (groupKind.get(from) === 'crossing') groupKind.set(to, 'crossing');
    groupKind.delete(from);
  };
  const addSplit = (splineId: string, s: number, groupId?: string): string => {
    const sm = samples.get(splineId)!;
    let arr = splits.get(splineId);
    if (!arr) { arr = []; splits.set(splineId, arr); }
    for (const sp of arr) {
      if (arcDist(sp.s, s, sm.total, sm.spline.closed) < MERGE_ARC) {
        if (groupId && groupId !== sp.id) remapGroup(groupId, sp.id);
        return sp.id;
      }
    }
    const id = groupId ?? `x:${++splitSeq}`;
    if (!groupKind.has(id)) groupKind.set(id, 'crossing');
    arr.push({ s, id });
    return id;
  };
  const nodeS = (sm: SplineSample, idx: number) => sm.lengths[sm.nodeIdx[idx]];
  const existingGroupAt = (splineId: string, s: number): string | null => {
    const sm = samples.get(splineId)!;
    const arr = splits.get(splineId);
    if (!arr) return null;
    for (const sp of arr) {
      if (arcDist(sp.s, s, sm.total, sm.spline.closed) < MERGE_ARC) return sp.id;
    }
    return null;
  };

  // 1) node-node shares
  let shareSeq = 0;
  for (const g of groups) {
    if (g.refs.length < 2) continue;
    const gid = `n:${++shareSeq}`;
    groupKind.set(gid, 'shared');
    for (const r of g.refs) {
      const sm = samples.get(r.spline.id);
      if (sm && sm.nodeIdx[r.index] >= 0) addSplit(r.spline.id, nodeS(sm, r.index), gid);
    }
  }

  // 2) node-on-curve touches (T-joints anywhere along a curve)
  for (const A of splines) {
    const smA = samples.get(A.id);
    if (!smA) continue;
    for (let ni = 0; ni < A.nodes.length; ni++) {
      const P = A.nodes[ni].position as Vec3;
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
            best = {
              dist,
              s: smB.lengths[j] + t * (smB.lengths[j + 1] - smB.lengths[j]),
              y: a[1] + (b[1] - a[1]) * t,
            };
          }
        }
        if (best.dist < TOUCH_XZ && Math.abs(P[1] - best.y) < CROSS_Y) {
          const gA = existingGroupAt(A.id, nsA);
          const gB = existingGroupAt(B.id, best.s);
          if (gA !== null && gA === gB) continue; // already fused here (the share itself)
          const gid = addSplit(A.id, nsA);
          const gid2 = addSplit(B.id, best.s, gid);
          groupKind.set(gid2, 'crossing');
        }
      }
    }
  }

  // 3) curve-curve crossings (incl. self-crossings); height gaps = overpasses
  interface SegBB { minx: number; maxx: number; minz: number; maxz: number }
  const segBBs = new Map<string, SegBB[]>();
  for (const [id, sm] of samples) {
    const bbs: SegBB[] = [];
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
      const smA = samples.get(A)!; const smB = samples.get(B)!;
      const bbA = segBBs.get(A)!; const bbB = segBBs.get(B)!;
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
          if (Math.abs(yA - yB) >= CROSS_Y) continue;
          const sA = smA.lengths[i] + t * (smA.lengths[i + 1] - smA.lengths[i]);
          const sB = smB.lengths[j] + u * (smB.lengths[j + 1] - smB.lengths[j]);
          const gA = existingGroupAt(A, sA);
          const gB = existingGroupAt(B, sB);
          if (gA !== null && gA === gB) continue; // already fused here (the share itself)
          const gid = addSplit(A, sA);
          const gid2 = addSplit(B, sB, gid);
          groupKind.set(gid2, 'crossing');
        }
      }
    }
  }

  // 4) end seeking: free ends fuse across small gaps, and bridge ends ramp
  //    down to the network. A landing that merely sits NEAR a road still
  //    connects instead of dangling.
  for (const A of splines) {
    if (A.closed) continue;
    const smA = samples.get(A.id);
    if (!smA) continue;
    const seekXZ = A.bridge.enabled ? SEEK_XZ_BRIDGE : SEEK_XZ_ROAD;
    const seekY = A.bridge.enabled ? SEEK_Y_BRIDGE : SEEK_Y_ROAD;
    for (const ni of [0, A.nodes.length - 1]) {
      if (existingGroupAt(A.id, nodeS(smA, ni)) !== null) continue; // already fused
      const P = A.nodes[ni].position as Vec3;
      let found: { splineId: string; s: number; dist: number } | null = null;
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
          found = {
            splineId: B.id,
            s: smB.lengths[j] + t * (smB.lengths[j + 1] - smB.lengths[j]),
            dist,
          };
        }
      }
      if (found) {
        const gid = addSplit(A.id, nodeS(smA, ni));
        const gid2 = addSplit(found.splineId, found.s, gid);
        groupKind.set(gid2, 'crossing');
      }
    }
  }

  // --- runs: split at every split; trim flags assigned after the junction rule ---
  const runs: Run[] = [];
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
    const dedup: Split[] = [];
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
    const mkRun = (s0: number, s1: number, fromId: string | null, toId: string | null) => {
      if (s1 - s0 < 0.05) return;
      const pts: Vec3[] = [pointAt(sm.pts, sm.lengths, s0)];
      for (let j = 0; j < sm.pts.length; j++) {
        const L = sm.lengths[j];
        if (L > s0 + 1e-4 && L < s1 - 1e-4) pts.push(sm.pts[j]);
      }
      pts.push(pointAt(sm.pts, sm.lengths, s1));
      runs.push({ spline: s, fromId, toId, pts, trimStart: false, trimEnd: false, closedLoop: false });
    };
    const mkWrapRun = (s0: number, s1: number, fromId: string, toId: string) => {
      const gt: Vec3[] = [];
      const lt: Vec3[] = [];
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
      const bounds: { s: number; id: string | null }[] = [{ s: 0, id: null }, ...arr, { s: sm.total, id: null }];
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

  // --- junction rule over run ends (TA: 3+ ends, or 2 ends bent >= 15 deg) ---
  interface EndRef { run: Run; atStart: boolean }
  const endsByGroup = new Map<string, EndRef[]>();
  for (const run of runs) {
    if (run.fromId) {
      if (!endsByGroup.has(run.fromId)) endsByGroup.set(run.fromId, []);
      endsByGroup.get(run.fromId)!.push({ run, atStart: true });
    }
    if (run.toId) {
      if (!endsByGroup.has(run.toId)) endsByGroup.set(run.toId, []);
      endsByGroup.get(run.toId)!.push({ run, atStart: false });
    }
  }
  const arrivalDir = (run: Run, atStart: boolean): [number, number] => {
    const p = run.pts;
    const a = atStart ? p[0] : p[p.length - 1];
    const b = atStart ? p[1] : p[p.length - 2];
    const d: [number, number] = [a[0] - b[0], a[2] - b[2]];
    const l = Math.hypot(d[0], d[1]);
    return l < 1e-6 ? [1, 0] : [d[0] / l, d[1] / l];
  };
  const junctionGroups = new Set<string>();
  for (const [gid, ends] of endsByGroup) {
    if (ends.length >= 3) { junctionGroups.add(gid); continue; }
    if (ends.length < 2) continue;
    const d0 = arrivalDir(ends[0].run, ends[0].atStart);
    const d1 = arrivalDir(ends[1].run, ends[1].atStart);
    const dot = Math.max(-1, Math.min(1, d0[0] * d1[0] + d0[1] * d1[1]));
    if ((Math.acos(dot) * 180) / Math.PI < 165) junctionGroups.add(gid);
  }
  for (const run of runs) {
    run.trimStart = !!run.fromId && junctionGroups.has(run.fromId);
    run.trimEnd = !!run.toId && junctionGroups.has(run.toId);
  }

  // --- trim + frames + cross lines ---
  // Every run renders: junction-to-junction nubs become short chaining spans
  // (neighboring tubs share their end sections exactly), short stubs become
  // short capped arms. Runs are never swallowed, so the network can't gap.
  const cornerR = Math.max(2, project.junctions.cornerRadius);
  const viable: ViableRun[] = [];
  for (const run of runs) {
    const L = arcLengths(run.pts);
    const total = L[L.length - 1];
    let s0 = 0; let s1 = total;
    if (run.trimStart) s0 = Math.min(cornerR, total * 0.49);
    if (run.trimEnd) s1 = total - Math.min(cornerR, total * 0.49);
    if (s1 - s0 < 0.02) continue; // degenerate crumbs only
    const road: Vec3[] = [worldToRoad(pointAt(run.pts, L, s0))];
    for (let j = 0; j < run.pts.length; j++) {
      if (L[j] > s0 + 1e-4 && L[j] < s1 - 1e-4) road.push(worldToRoad(run.pts[j]));
    }
    road.push(worldToRoad(pointAt(run.pts, L, s1)));
    // closed loops: drop the duplicated closing point, then wrap exactly
    let frames = buildFrames(run.closedLoop ? road.slice(0, -1) : road);
    if (frames.length < 2) continue;
    if (run.closedLoop) frames = closeFrames(frames);
    const lines = computeCrossLines(frames, run.spline.cross, {
      depth: project.junctions.depth,
      inset: project.junctions.inset,
    });
    viable.push({
      ...run, road, frames, lines,
      capStart: false, capEnd: false, landingStart: false, landingEnd: false,
    });
  }

  // legs from viable runs only; junctions with <2 legs are dropped and
  // their runs un-trimmed (second pass over trim flags via leg lookup)
  interface LegRef { run: ViableRun; atStart: boolean }
  const legsByJunction = new Map<string, LegRef[]>();
  for (const run of viable) {
    if (run.trimStart && run.fromId) {
      if (!legsByJunction.has(run.fromId)) legsByJunction.set(run.fromId, []);
      legsByJunction.get(run.fromId)!.push({ run, atStart: true });
    }
    if (run.trimEnd && run.toId) {
      if (!legsByJunction.has(run.toId)) legsByJunction.set(run.toId, []);
      legsByJunction.get(run.toId)!.push({ run, atStart: false });
    }
  }

  // drop single-leg junctions: un-trim those runs (rebuild centerline quickly)
  for (const [g, legRefs] of legsByJunction) {
    if (legRefs.length >= 2) continue;
    for (const { run, atStart } of legRefs) {
      // rebuild this run without the trim on this side
      const L = arcLengths(run.pts);
      const total = L[L.length - 1];
      const ns0 = atStart ? 0 : (run.trimStart ? Math.min(cornerR, total * 0.49) : 0);
      const ns1 = !atStart ? total : (run.trimEnd ? total - Math.min(cornerR, total * 0.49) : total);
      const road: Vec3[] = [worldToRoad(pointAt(run.pts, L, ns0))];
      for (let j = 0; j < run.pts.length; j++) {
        if (L[j] > ns0 + 1e-4 && L[j] < ns1 - 1e-4) road.push(worldToRoad(run.pts[j]));
      }
      road.push(worldToRoad(pointAt(run.pts, L, ns1)));
      let frames = buildFrames(road);
      if (frames.length < 2) continue;
      if (run.closedLoop) frames = closeFrames(frames);
      run.frames = frames;
      run.lines = computeCrossLines(frames, run.spline.cross, {
        depth: project.junctions.depth,
        inset: project.junctions.inset,
      });
      if (atStart) run.trimStart = false;
      else run.trimEnd = false;
    }
    legsByJunction.delete(g);
  }

  // --- landing links: bridge-run ends <-> adjoining road-run ends ---
  // Rails flow across the joint as one geometry: road W-beams bend onto the
  // bridge parapet faces (or rail ends) and parapets ramp down to meet them.
  for (const run of viable) {
    run.capStart = !run.trimStart && !run.closedLoop && run.fromId == null;
    run.capEnd = !run.trimEnd && !run.closedLoop && run.toId == null;
    run.landingStart = !run.trimStart && !run.closedLoop && !run.capStart;
    run.landingEnd = !run.trimEnd && !run.closedLoop && !run.capEnd;
  }
  for (const brun of viable) {
    if (!brun.spline.bridge.enabled || brun.closedLoop) continue;
    for (const atStart of [true, false]) {
      if (!(atStart ? brun.landingStart : brun.landingEnd)) continue;
      const gid = atStart ? brun.fromId : brun.toId;
      if (!gid) continue;
      const mate = viable.find((r) =>
        r !== brun && !r.spline.bridge.enabled &&
        ((r.fromId === gid && !r.trimStart) || (r.toId === gid && !r.trimEnd)));
      const bi = atStart ? 0 : brun.lines.paveL.length - 1;
      const bf = atStart ? brun.frames[0] : brun.frames[brun.frames.length - 1];
      const n = bf.normal;
      const deckL = brun.lines.paveL[bi];
      const deckR = brun.lines.paveR[bi];
      const useParapet = brun.spline.bridge.parapet === 'parapet';
      // parapet ramps down to the road rail panel top (or a bullnose stub)
      if (useParapet) {
        const roadH = mate && mate.spline.rails.enabled ? mate.spline.rails.height * 0.8 : 0.45;
        const rampH = Math.min(brun.spline.bridge.parapetHeight, Math.max(0.45, roadH));
        if (atStart) brun.rampStartH = rampH;
        else brun.rampEndH = rampH;
      }
      if (!mate || !mate.spline.rails.enabled) continue;
      const mateAtStart = mate.fromId === gid && !mate.trimStart;
      if (!mate.railLinks) mate.railLinks = {};
      if (mateAtStart && (mate.railLinks.startL || mate.railLinks.startR)) continue;
      if (!mateAtStart && (mate.railLinks.endL || mate.railLinks.endR)) continue;
      // bridge-side targets: parapet end faces (embedded) or W-beam bases
      const tL: Vec3 = useParapet
        ? [deckL[0] + n[0] * 0.1, deckL[1] + n[1] * 0.1, deckL[2]]
        : [deckL[0] - n[0] * 0.25, deckL[1] - n[1] * 0.25, deckL[2]];
      const tR: Vec3 = useParapet
        ? [deckR[0] - n[0] * 0.1, deckR[1] - n[1] * 0.1, deckR[2]]
        : [deckR[0] + n[0] * 0.25, deckR[1] + n[1] * 0.25, deckR[2]];
      // pair road edges to bridge targets (2x2 match handles mirrored headings)
      const mi = mateAtStart ? 0 : mate.lines.paveL.length - 1;
      const mL = mate.lines.paveL[mi];
      const mR = mate.lines.paveR[mi];
      const dd = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const crossed = dd(mL, tR) + dd(mR, tL) < dd(mL, tL) + dd(mR, tR);
      const link = (t: Vec3): RailRedirect => ({ target: [...t] as Vec3, length: 3 });
      if (mateAtStart) {
        mate.railLinks.startL = link(crossed ? tR : tL);
        mate.railLinks.startR = link(crossed ? tL : tR);
      } else {
        mate.railLinks.endL = link(crossed ? tR : tL);
        mate.railLinks.endR = link(crossed ? tL : tR);
      }
    }
  }

  // --- spans ---
  for (const run of viable) {
    const s = run.spline;
    const spanLen = run.frames[run.frames.length - 1].s;
    const { capStart, capEnd, landingStart, landingEnd } = run;
    let kind: SpanKind = 'road';
    let patches: PatchSpec[];
    if (!s.bridge.enabled) {
      patches = buildRoadSpan(run.lines, s.cross, s.rails, {
        depth: project.junctions.depth,
        inset: project.junctions.inset,
        capStart,
        capEnd,
        railLinks: run.railLinks,
      });
    } else {
      const groundZ = project.scene.groundZ;
      const bopt = {
        groundZ, capStart, capEnd, landingStart, landingEnd, loop: run.closedLoop,
        rampStartH: run.rampStartH, rampEndH: run.rampEndH,
      };
      if (s.bridge.type === 'arch') {
        const arch = buildArchSpan(run.lines, s.cross, s.bridge, s.rails, bopt);
        if (arch) {
          kind = 'arch';
          patches = arch;
        } else {
          kind = 'beam';
          patches = buildBeamSpan(run.lines, s.cross, s.bridge, s.rails, bopt);
        }
      } else {
        kind = 'beam';
        patches = buildBeamSpan(run.lines, s.cross, s.bridge, s.rails, bopt);
      }
    }
    spans.push({ splineId: s.id, kind, length: spanLen, patches });
  }

  // --- junctions from span end stations (exact shared sections) ---
  let seq = 0;
  for (const [gid, legRefs] of legsByJunction) {
    const legs: JunctionLeg[] = [];
    const armInfos: JunctionArmInfo[] = [];
    let railAny = false;
    let railH = 0; let railT = 0; let railPosts = false; let railPS = Infinity;
    for (const { run, atStart } of legRefs) {
      const s = run.spline;
      const st = atStart ? run.frames[0] : run.frames[run.frames.length - 1];
      const li = atStart ? 0 : run.lines.roadL.length - 1;
      // arrival orientation: into the junction
      const arrival = atStart ? v_scale(st.tangent, -1) : st.tangent;
      const left = left_normal(arrival);
      const L = run.lines;
      const leg: JunctionLeg = {
        point: [...st.center] as Vec3,
        tangent: [...arrival] as Vec3,
        left: [...left] as Vec3,
        roadL: atStart ? [...L.roadR[li]] as Vec3 : [...L.roadL[li]] as Vec3,
        roadR: atStart ? [...L.roadL[li]] as Vec3 : [...L.roadR[li]] as Vec3,
        curbL: atStart ? [...L.curbTopR[li]] as Vec3 : [...L.curbTopL[li]] as Vec3,
        curbR: atStart ? [...L.curbTopL[li]] as Vec3 : [...L.curbTopR[li]] as Vec3,
        paveL: atStart ? [...L.paveR[li]] as Vec3 : [...L.paveL[li]] as Vec3,
        paveR: atStart ? [...L.paveL[li]] as Vec3 : [...L.paveR[li]] as Vec3,
        botL: atStart ? [...L.botR[li]] as Vec3 : [...L.botL[li]] as Vec3,
        botR: atStart ? [...L.botL[li]] as Vec3 : [...L.botR[li]] as Vec3,
        angle: Math.atan2(arrival[1], arrival[0]),
        splineId: s.id,
        splineName: s.name,
        color: s.color,
      };
      legs.push(leg);
      let deg = (leg.angle * 180) / Math.PI;
      if (deg < 0) deg += 360;
      armInfos.push({ splineId: s.id, splineName: s.name, color: s.color, angleDeg: deg });
      if (s.rails.enabled) {
        railAny = true;
        railH = Math.max(railH, s.rails.height);
        railT = Math.max(railT, s.rails.thickness);
        railPosts = railPosts || s.rails.posts;
        railPS = Math.min(railPS, s.rails.postSpacing);
      }
    }
    if (legs.length < 2) continue;
    const rails: RailSettings = {
      enabled: railAny, height: railH || 0.8, thickness: railT || 0.2,
      posts: railPosts, postSpacing: Number.isFinite(railPS) ? railPS : 2,
    };
    // center: mean of leg approach points (road space) — the true crossing point
    const center: Vec3 = [0, 0, 0];
    for (const leg of legs) {
      center[0] += leg.point[0]; center[1] += leg.point[1]; center[2] += leg.point[2];
    }
    center[0] /= legs.length; center[1] /= legs.length; center[2] /= legs.length;
    try {
      const patches = buildMergedJunction(legs, {
        center,
        cornerRadius: cornerR,
        filletSteps: project.junctions.filletSteps,
        depth: project.junctions.depth,
        rails,
      });
      seq += 1;
      junctions.push({
        id: `junction-${seq}`,
        position: roadToWorld(center) as Point3D,
        topology: topologyName(legs.length),
        kind: groupKind.get(gid) ?? 'shared',
        arms: armInfos,
        patches,
      });
    } catch (e) {
      console.error('junction build failed', e);
    }
  }

  return { junctions, spans };
}
