// Network assembly — turns project splines into junctions + spans.
//
//  1. Cluster spline nodes into groups (shared nodes become junctions).
//     Clustering is height-aware so bridge overpasses never merge with the
//     road below them.
//  2. Build one N-way junction hub per multi-arm group (V3 topology).
//  3. Trim every node-pair curve at the junction mouths and build either a
//     road span or a bridge span from curvature-safe station frames.

import {
  Vec3, v_sub, v_len, worldToRoad, dirAngleDeg, arcLengths, pointAtArc, cubicBezier,
} from './vec';
import {
  PatchSpec, ArmSpec, NWayJunctionGenerator, buildFrames, buildRoadSpan, computeCrossLines,
} from './roadGeometry';
import { buildBeamSpan, buildArchSpan } from './bridgeGeometry';
import type { Project, Spline, SplineNode, Point3D } from './model';
import { topologyName } from './model';

const JOIN_XZ = 0.25;
const JOIN_Y = 0.6;
const DENSE_PER_PAIR = 140;

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

// --- bezier pair sampling (world space) -------------------------------------

interface PairCurve {
  n1: SplineNode;
  idx1: number;
  n2: SplineNode;
  idx2: number;
  /** Dense world-space points + arc table + total length. */
  pts: Vec3[];
  lengths: number[];
  total: number;
}

function samplePair(n1: SplineNode, idx1: number, n2: SplineNode, idx2: number): PairCurve {
  const p0 = n1.position as Vec3;
  const p1 = n1.handleOut as Vec3;
  const p2 = n2.handleIn as Vec3;
  const p3 = n2.position as Vec3;
  const pts: Vec3[] = [];
  for (let i = 0; i < DENSE_PER_PAIR; i++) {
    pts.push(cubicBezier(p0, p1, p2, p3, i / (DENSE_PER_PAIR - 1)));
  }
  const lengths = arcLengths(pts);
  return { n1, idx1, n2, idx2, pts, lengths, total: lengths[lengths.length - 1] };
}

function splinePairs(s: Spline): Array<{ a: number; b: number }> {
  const out: Array<{ a: number; b: number }> = [];
  for (let i = 0; i < s.nodes.length - 1; i++) out.push({ a: i, b: i + 1 });
  if (s.closed && s.nodes.length > 2) out.push({ a: s.nodes.length - 1, b: 0 });
  return out;
}

// --- node clustering --------------------------------------------------------

interface NodeRef { spline: Spline; index: number; node: SplineNode }
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
      if (g) g.refs.push({ spline: s, index, node });
      else groups.push({ position: [...node.position] as Point3D, refs: [{ spline: s, index, node }] });
    });
  }
  return groups;
}

const armId = (splineId: string, nodeIndex: number, end: 'start' | 'end') =>
  `${splineId}-${nodeIndex}-${end}`;

// --- main build --------------------------------------------------------------

export function buildNetwork(project: Project): BuiltNetwork {
  const junctions: BuiltJunction[] = [];
  const spans: BuiltSpan[] = [];
  const splines = project.splines.filter((s) => s.nodes.length >= 2);
  if (splines.length === 0) return { junctions, spans };

  const byId = new Map(splines.map((s) => [s.id, s]));
  const groups = clusterNodes(splines);

  // pair curves for every spline (world space, dense)
  const pairCurves = new Map<string, PairCurve[]>();
  for (const s of splines) {
    pairCurves.set(
      s.id,
      splinePairs(s).map(({ a, b }) => samplePair(s.nodes[a], a, s.nodes[b], b)),
    );
  }
  const findPair = (splineId: string, fromIdx: number, toIdx: number): PairCurve | undefined =>
    pairCurves.get(splineId)?.find(
      (pc) => (pc.idx1 === fromIdx && pc.idx2 === toIdx) || (pc.idx1 === toIdx && pc.idx2 === fromIdx),
    );

  const connectionMap = new Map<string, { R: number; MC: Vec3 }>();
  // hub discs for trimming + node lookups
  interface HubRec { x: number; z: number; rmax: number }
  const hubs: HubRec[] = [];
  const nodeHub = new Map<string, number>(); // `${splineId}:${nodeIndex}` -> hub index
  const nodeKey = (splineId: string, idx: number) => `${splineId}:${idx}`;
  const groupSize = new Map<string, number>();
  for (const g of groups) {
    for (const r of g.refs) groupSize.set(nodeKey(r.spline.id, r.index), g.refs.length);
  }

  // --- junctions (only at genuinely shared nodes) ---
  let junctionSeq = 0;
  for (const g of groups) {
    if (g.refs.length < 2) continue;
    const arms: ArmSpec[] = [];
    const armInfos: JunctionArmInfo[] = [];
    const centerRoad = worldToRoad(g.position as Vec3);

    for (const { spline, index, node } of g.refs) {
      const neighbours: Array<{ target: SplineNode; targetIdx: number; handle: Point3D; end: 'start' | 'end' }> = [];
      if (index > 0) {
        neighbours.push({ target: spline.nodes[index - 1], targetIdx: index - 1, handle: node.handleIn, end: 'end' });
      }
      if (index < spline.nodes.length - 1) {
        neighbours.push({ target: spline.nodes[index + 1], targetIdx: index + 1, handle: node.handleOut, end: 'start' });
      }
      if (spline.closed && spline.nodes.length > 2) {
        if (index === 0) {
          neighbours.push({
            target: spline.nodes[spline.nodes.length - 1],
            targetIdx: spline.nodes.length - 1,
            handle: node.handleIn,
            end: 'end',
          });
        } else if (index === spline.nodes.length - 1) {
          neighbours.push({ target: spline.nodes[0], targetIdx: 0, handle: node.handleOut, end: 'start' });
        }
      }

      for (const nb of neighbours) {
        // arm direction: handle first, neighbour node as fallback
        const hR = worldToRoad(nb.handle as Vec3);
        let dir = v_sub(hR, centerRoad);
        if (Math.hypot(dir[0], dir[1]) < 0.5) {
          dir = v_sub(worldToRoad(nb.target.position as Vec3), centerRoad);
        }
        if (Math.hypot(dir[0], dir[1]) < 1e-6) continue;
        const angle = dirAngleDeg(dir);

        // elevation profile along the arm for sloped mouths
        const pc = findPair(spline.id, index, nb.targetIdx);
        let getZAtRadius: ArmSpec['getZAtRadius'];
        if (pc && pc.total > 1e-6) {
          const road = pc.pts.map(worldToRoad);
          const forward = pc.idx1 === index; // curve runs away from the junction?
          getZAtRadius = (r: number) => {
            let best = 0; let bd = Infinity;
            for (let i = 0; i < road.length; i++) {
              const d = Math.hypot(road[i][0] - centerRoad[0], road[i][1] - centerRoad[1]);
              const diff = Math.abs(d - r);
              if (diff < bd) { bd = diff; best = i; }
            }
            const p = road[best];
            const q = road[forward ? Math.min(road.length - 1, best + 1) : Math.max(0, best - 1)];
            const run = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const dz = run > 1e-6 ? (q[2] - p[2]) / run : 0;
            return { z: p[2], dz };
          };
        }

        const id = armId(spline.id, index, nb.end);
        if (arms.some((a) => a.id === id)) continue;
        arms.push({
          id,
          name: 'Arm',
          angle_deg: angle,
          outer_height: g.position[1],
          fill_color: '#333333',
          width: spline.cross.width,
          pavement_width_left: spline.cross.paveLeft,
          pavement_width_right: spline.cross.paveRight,
          curb_height: spline.cross.curbHeight,
        });
        if (getZAtRadius) arms[arms.length - 1].getZAtRadius = getZAtRadius;
        armInfos.push({ splineId: spline.id, splineName: spline.name, color: spline.color, angleDeg: angle });
      }
    }

    // 2-arm straight pass-throughs join directly — no hub needed.
    if (arms.length === 2) {
      const a = (arms[0].angle_deg * Math.PI) / 180;
      const b = (arms[1].angle_deg * Math.PI) / 180;
      const between = Math.acos(Math.max(-1, Math.min(1, Math.cos(a) * Math.cos(b) + Math.sin(a) * Math.sin(b))));
      const deflection = Math.PI - between; // 0 = perfectly straight
      if (deflection < (25 * Math.PI) / 180) continue;
    }

    if (arms.length >= 2) {
      try {
        const gen = new NWayJunctionGenerator(centerRoad, project.junctions.hubDiv, project.junctions.filletRadius);
        const res = gen.build_case(arms, {
          height: g.position[1],
          railHeight: 0.8,
          railThickness: 0.2,
          railPosts: true,
          depth: project.junctions.depth,
          inset: project.junctions.inset,
        });
        let rmax = 0;
        for (const d of res.armData) {
          connectionMap.set(d.id, { R: d.R, MC: d.MC });
          rmax = Math.max(rmax, d.R);
        }
        const hubIdx = hubs.length;
        hubs.push({ x: g.position[0], z: g.position[2], rmax });
        for (const r of g.refs) nodeHub.set(nodeKey(r.spline.id, r.index), hubIdx);
        junctionSeq += 1;
        junctions.push({
          id: `junction-${junctionSeq}`,
          position: [...g.position] as Point3D,
          topology: topologyName(arms.length),
          arms: armInfos,
          patches: res.patches,
        });
      } catch (e) {
        console.error('junction build failed', e);
      }
    }
  }

  // --- spans ---
  for (const s of splines) {
    const curves = pairCurves.get(s.id) ?? [];
    for (const pc of curves) {
      if (pc.total < 0.5) continue;
      const conn1 = connectionMap.get(armId(s.id, pc.idx1, 'start'));
      const conn2 = connectionMap.get(armId(s.id, pc.idx2, 'end'));
      const h1 = nodeHub.has(nodeKey(s.id, pc.idx1)) ? hubs[nodeHub.get(nodeKey(s.id, pc.idx1))!] : null;
      const h2 = nodeHub.has(nodeKey(s.id, pc.idx2)) ? hubs[nodeHub.get(nodeKey(s.id, pc.idx2))!] : null;

      // Trim against endpoint hubs AND the opposite hub (pairs swallowed by an
      // oversized mouth, or starting inside a hub they don't connect to).
      // Mouth-center pinning applies only when the exit is interior to the
      // pair — this kills the V3 fold-back bug (spans doubling over pairs
      // shorter than the mouth radius).
      const distHub = (p: Vec3, h: HubRec) => Math.hypot(p[0] - h.x, p[2] - h.z);
      let s0 = 0;
      let s1 = pc.total;
      let pinS: Vec3 | null = null;
      let pinE: Vec3 | null = null;
      let dead = false;
      const trimStart: Array<{ h: HubRec | null; r: number; pin: Vec3 | null }> = [
        { h: h1, r: conn1?.R ?? h1?.rmax ?? 0, pin: conn1 ? ([...conn1.MC] as Vec3) : null },
        { h: h2, r: h2?.rmax ?? 0, pin: null },
      ];
      for (const t of trimStart) {
        if (!t.h || dead) continue;
        let ex = pc.total;
        for (let j = 0; j < pc.pts.length; j++) {
          if (distHub(pc.pts[j], t.h) >= t.r) { ex = pc.lengths[j]; break; }
        }
        if (ex >= pc.total - 1e-6) { dead = true; break; }
        if (ex > s0 + 1e-6) { s0 = ex; pinS = t.pin; }
      }
      const trimEnd: Array<{ h: HubRec | null; r: number; pin: Vec3 | null }> = [
        { h: h2, r: conn2?.R ?? h2?.rmax ?? 0, pin: conn2 ? ([...conn2.MC] as Vec3) : null },
        { h: h1, r: h1?.rmax ?? 0, pin: null },
      ];
      for (const t of trimEnd) {
        if (!t.h || dead) continue;
        let en = -1;
        for (let j = pc.pts.length - 1; j >= 0; j--) {
          if (distHub(pc.pts[j], t.h) >= t.r) { en = pc.lengths[j]; break; }
        }
        if (en < 0) { dead = true; break; }
        if (en < s1 - 1e-6) { s1 = en; pinE = t.pin; }
      }
      if (dead || s1 - s0 < 1.2) continue;

      // trimmed centerline in road space, pinned to junction mouths
      const road: Vec3[] = [];
      road.push(pinS ?? worldToRoad(pointAtArc(pc.pts, pc.lengths, s0)));
      for (let j = 0; j < pc.pts.length; j++) {
        if (pc.lengths[j] > s0 + 1e-4 && pc.lengths[j] < s1 - 1e-4) {
          road.push(worldToRoad(pc.pts[j]));
        }
      }
      road.push(pinE ?? worldToRoad(pointAtArc(pc.pts, pc.lengths, s1)));
      if (road.length < 2 || v_len(v_sub(road[road.length - 1], road[0])) < 0.5) continue;

      const frames = buildFrames(road);
      if (frames.length < 2) continue;
      const spanLen = frames[frames.length - 1].s;
      // caps only on truly free heads (unshared nodes, away from hubs)
      const nearHub = (p: Point3D) => hubs.some((h) => Math.hypot(p[0] - h.x, p[2] - h.z) < h.rmax + 2.5);
      const capStart = !conn1 && (groupSize.get(nodeKey(s.id, pc.idx1)) ?? 1) === 1 && !nearHub(pc.n1.position);
      const capEnd = !conn2 && (groupSize.get(nodeKey(s.id, pc.idx2)) ?? 1) === 1 && !nearHub(pc.n2.position);

      void byId;

      let kind: SpanKind = 'road';
      let patches: PatchSpec[];
      if (!s.bridge.enabled) {
        patches = buildRoadSpan(frames, s.cross, s.rails, {
          depth: project.junctions.depth,
          inset: project.junctions.inset,
          capStart,
          capEnd,
          postDrop: s.cross.curbHeight,
        });
      } else {
        // bridge spans need cross lines; build once and share
        const lines = computeCrossLines(frames, s.cross, { depth: 1.2, inset: 0.6 });
        const groundZ = project.scene.groundZ;
        if (s.bridge.type === 'arch') {
          const arch = buildArchSpan(lines, s.cross, s.bridge, s.rails, { groundZ, capStart, capEnd });
          if (arch) {
            kind = 'arch';
            patches = arch;
          } else {
            kind = 'beam';
            patches = buildBeamSpan(lines, s.cross, s.bridge, s.rails, { groundZ, capStart, capEnd });
          }
        } else {
          kind = 'beam';
          patches = buildBeamSpan(lines, s.cross, s.bridge, s.rails, { groundZ, capStart, capEnd });
        }
      }
      spans.push({ splineId: s.id, kind, length: spanLen, patches });
    }
  }

  return { junctions, spans };
}
