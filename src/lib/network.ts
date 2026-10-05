// Network assembly — TransitArchitect-style graph build.
//
//  1. Sample each spline as ONE dense polyline; record node indices.
//  2. Cluster nodes; groups become junctions by the TA rule (3+ legs, or
//     2 legs with >= 15 degrees of deflection).
//  3. Split splines into RUNS at shared nodes (junction runs trim back by
//     cornerRadius; straight joins abut exactly, untrimmed).
//  4. Build ONE span per run (road or bridge) — no interior seams.
//  5. Derive approach frames from span end stations and build merged
//     junctions from them — watertight by construction.

import {
  Vec3, v_sub, v_scale, v_len, worldToRoad, cubicBezier, arcLengths,
  left_normal,
} from './vec';
import {
  PatchSpec, CrossLines, buildFrames, buildRoadSpan, computeCrossLines,
  buildMergedJunction, JunctionLeg, StationFrame,
} from './roadGeometry';
import { buildBeamSpan, buildArchSpan } from './bridgeGeometry';
import type { Project, Spline, Point3D, RailSettings } from './model';
import { topologyName } from './model';

const JOIN_XZ = 0.25;
const JOIN_Y = 0.6;
const PER_PAIR = 60;

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

const nodeKey = (splineId: string, idx: number) => `${splineId}:${idx}`;

// neighbor directions of a node along its spline (prev/next node indices)
function nodeNeighbors(s: Spline, idx: number): number[] {
  const out: number[] = [];
  if (idx > 0) out.push(idx - 1);
  if (idx < s.nodes.length - 1) out.push(idx + 1);
  if (s.closed && s.nodes.length > 2) {
    if (idx === 0) out.push(s.nodes.length - 1);
    else if (idx === s.nodes.length - 1) out.push(0);
  }
  return out;
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
  fromNode: number;
  toNode: number;
  /** world dense points from fromNode to toNode (inclusive ends) */
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

  // group size per node (for caps + run splitting)
  const groupSize = new Map<string, number>();
  const groupOf = new Map<string, NodeGroup>();
  for (const g of groups) {
    for (const r of g.refs) {
      groupSize.set(nodeKey(r.spline.id, r.index), g.refs.length);
      groupOf.set(nodeKey(r.spline.id, r.index), g);
    }
  }

  // --- junction detection (TA rule) ---
  interface JunctionCand { group: NodeGroup; legs: { spline: Spline; nodeIdx: number; nbrIdx: number }[] }
  const candidates: JunctionCand[] = [];
  for (const g of groups) {
    if (g.refs.length < 2) continue;
    const legs: JunctionCand['legs'] = [];
    for (const r of g.refs) {
      for (const nbr of nodeNeighbors(r.spline, r.index)) {
        legs.push({ spline: r.spline, nodeIdx: r.index, nbrIdx: nbr });
      }
    }
    if (legs.length < 2) continue;
    let isJunction = legs.length >= 3;
    if (!isJunction) {
      // degree 2: junction unless nearly straight (TA: angle < 165 -> junction)
      const dirs: [number, number][] = [];
      for (const leg of legs) {
        const sm = samples.get(leg.spline.id);
        const ni = sm?.nodeIdx[leg.nodeIdx] ?? -1;
        if (!sm || ni < 0) { dirs.push([1, 0]); continue; }
        const forward = leg.nbrIdx === leg.nodeIdx + 1 || (leg.nbrIdx === 0 && leg.nodeIdx === sm.spline.nodes.length - 1);
        const a = sm.pts[ni];
        const b = forward ? sm.pts[Math.min(sm.pts.length - 1, ni + 1)] : sm.pts[Math.max(0, ni - 1)];
        // leg direction: from the node TOWARD the neighbor (both cases)
        const d: [number, number] = [b[0] - a[0], b[2] - a[2]];
        const l = Math.hypot(d[0], d[1]);
        dirs.push(l < 1e-6 ? [1, 0] : [d[0] / l, d[1] / l]);
      }
      const dot = Math.max(-1, Math.min(1, dirs[0][0] * dirs[1][0] + dirs[0][1] * dirs[1][1]));
      const angleDeg = (Math.acos(dot) * 180) / Math.PI;
      isJunction = angleDeg < 165;
    }
    if (isJunction) candidates.push({ group: g, legs });
  }
  const junctionNodes = new Set<string>();
  for (const c of candidates) {
    for (const r of c.group.refs) junctionNodes.add(nodeKey(r.spline.id, r.index));
  }

  // --- runs: split at every shared node; trim at junction nodes ---
  const runs: Run[] = [];
  for (const s of splines) {
    const sm = samples.get(s.id);
    if (!sm) continue;
    const n = s.nodes.length;
    const sharedIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if ((groupSize.get(nodeKey(s.id, i)) ?? 1) > 1) sharedIdx.push(i);
    }
    if (!s.closed) {
      const bounds = [0, ...sharedIdx.filter((i) => i !== 0 && i !== n - 1), n - 1];
      for (let k = 0; k < bounds.length - 1; k++) {
        const a = bounds[k]; const b = bounds[k + 1];
        if (b <= a) continue;
        const i0 = sm.nodeIdx[a]; const i1 = sm.nodeIdx[b];
        if (i0 < 0 || i1 < 0 || i1 <= i0) continue;
        runs.push({
          spline: s, fromNode: a, toNode: b,
          pts: sm.pts.slice(i0, i1 + 1),
          trimStart: junctionNodes.has(nodeKey(s.id, a)),
          trimEnd: junctionNodes.has(nodeKey(s.id, b)),
          closedLoop: false,
        });
      }
    } else {
      if (sharedIdx.length === 0) {
        runs.push({ spline: s, fromNode: 0, toNode: 0, pts: [...sm.pts], trimStart: false, trimEnd: false, closedLoop: true });
      } else {
        const ring = [...sharedIdx].sort((x, y) => x - y);
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k];
          const b = ring[(k + 1) % ring.length];
          let slice: Vec3[];
          if (k < ring.length - 1) {
            const i0 = sm.nodeIdx[a]; const i1 = sm.nodeIdx[b];
            if (i0 < 0 || i1 < 0 || i1 <= i0) continue;
            slice = sm.pts.slice(i0, i1 + 1);
          } else {
            // wrap arc: node a -> end, then start -> node b
            const i0 = sm.nodeIdx[a]; const i1 = sm.nodeIdx[b];
            if (i0 < 0 || i1 < 0) continue;
            slice = [...sm.pts.slice(i0), ...sm.pts.slice(1, i1 + 1)];
          }
          runs.push({
            spline: s, fromNode: a, toNode: b,
            pts: slice,
            trimStart: junctionNodes.has(nodeKey(s.id, a)),
            trimEnd: junctionNodes.has(nodeKey(s.id, b)),
            closedLoop: false,
          });
        }
      }
    }
  }

  // --- trim + frames + cross lines (viability pass) ---
  const cornerR = Math.max(2, project.junctions.cornerRadius);
  const viable: ViableRun[] = [];
  for (const run of runs) {
    const L = arcLengths(run.pts);
    const total = L[L.length - 1];
    if (total < 1) continue;
    let s0 = 0; let s1 = total;
    if (run.trimStart) s0 = Math.min(cornerR, total * 0.49);
    if (run.trimEnd) s1 = total - Math.min(cornerR, total * 0.49);
    if (s1 - s0 < 1.5) continue; // swallowed by junctions — skip
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
    viable.push({ ...run, road, frames, lines });
  }

  // legs from viable runs only; junctions with <2 legs are dropped and
  // their runs un-trimmed (second pass over trim flags via leg lookup)
  interface LegRef { run: ViableRun; atStart: boolean }
  const legsByJunction = new Map<NodeGroup, LegRef[]>();
  for (const run of viable) {
    if (run.trimStart) {
      const g = groupOf.get(nodeKey(run.spline.id, run.fromNode));
      if (g) {
        if (!legsByJunction.has(g)) legsByJunction.set(g, []);
        legsByJunction.get(g)!.push({ run, atStart: true });
      }
    }
    if (run.trimEnd) {
      const g = groupOf.get(nodeKey(run.spline.id, run.toNode));
      if (g) {
        if (!legsByJunction.has(g)) legsByJunction.set(g, []);
        legsByJunction.get(g)!.push({ run, atStart: false });
      }
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

  // --- spans ---
  for (const run of viable) {
    const s = run.spline;
    const spanLen = run.frames[run.frames.length - 1].s;
    const capStart = !run.trimStart && !run.closedLoop && (groupSize.get(nodeKey(s.id, run.fromNode)) ?? 1) === 1;
    const capEnd = !run.trimEnd && !run.closedLoop && (groupSize.get(nodeKey(s.id, run.toNode)) ?? 1) === 1;
    let kind: SpanKind = 'road';
    let patches: PatchSpec[];
    if (!s.bridge.enabled) {
      patches = buildRoadSpan(run.lines, s.cross, s.rails, {
        depth: project.junctions.depth,
        inset: project.junctions.inset,
        capStart,
        capEnd,
      });
    } else {
      const groundZ = project.scene.groundZ;
      if (s.bridge.type === 'arch') {
        const arch = buildArchSpan(run.lines, s.cross, s.bridge, s.rails, { groundZ, capStart, capEnd });
        if (arch) {
          kind = 'arch';
          patches = arch;
        } else {
          kind = 'beam';
          patches = buildBeamSpan(run.lines, s.cross, s.bridge, s.rails, { groundZ, capStart, capEnd });
        }
      } else {
        kind = 'beam';
        patches = buildBeamSpan(run.lines, s.cross, s.bridge, s.rails, { groundZ, capStart, capEnd });
      }
    }
    spans.push({ splineId: s.id, kind, length: spanLen, patches });
  }

  // --- junctions from span end stations (exact shared sections) ---
  let seq = 0;
  for (const [g, legRefs] of legsByJunction) {
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
    try {
      const patches = buildMergedJunction(legs, {
        center: worldToRoad(g.position as Vec3),
        cornerRadius: cornerR,
        filletSteps: project.junctions.filletSteps,
        depth: project.junctions.depth,
        rails,
      });
      seq += 1;
      junctions.push({
        id: `junction-${seq}`,
        position: [...g.position] as Point3D,
        topology: topologyName(legs.length),
        arms: armInfos,
        patches,
      });
    } catch (e) {
      console.error('junction build failed', e);
    }
  }

  return { junctions, spans };
}
