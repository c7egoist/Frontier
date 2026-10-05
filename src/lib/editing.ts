// Pure editing helpers: magnetic snapping of dragged/drawn points onto
// existing nodes and curve centerlines (so joins always land exactly and
// crossings/T-touches fuse into junctions instead of near-misses).
import type { Point3D, Project, Spline } from './model';
import { cubicBezier } from './vec';
import type { Vec3 } from './vec';

export interface SnapTarget {
  point: Point3D;
  kind: 'node' | 'curve';
  splineId: string;
  nodeId?: string;
}

export interface SnapOptions {
  /** node to ignore (the one being dragged) */
  excludeNodeId?: string;
  /** XZ snap radius for nodes */
  nodeRadius?: number;
  /** XZ snap radius for curve centerlines */
  curveRadius?: number;
  /** vertical tolerance for both */
  heightTol?: number;
}

/** Dense world-space centerline samples for snapping. */
export function sampleCenterline(s: Spline, perPair = 24): Vec3[] {
  const out: Vec3[] = [];
  if (s.nodes.length < 2) {
    for (const n of s.nodes) out.push([...n.position] as Vec3);
    return out;
  }
  const pairs: Array<{ a: number; b: number }> = [];
  for (let i = 0; i < s.nodes.length - 1; i++) pairs.push({ a: i, b: i + 1 });
  if (s.closed && s.nodes.length > 2) pairs.push({ a: s.nodes.length - 1, b: 0 });
  pairs.forEach(({ a, b }, pi) => {
    const n1 = s.nodes[a];
    const n2 = s.nodes[b];
    if (pi === 0) out.push([...n1.position] as Vec3);
    for (let i = 1; i < perPair; i++) {
      out.push(cubicBezier(
        n1.position as Vec3, n1.handleOut as Vec3, n2.handleIn as Vec3, n2.position as Vec3,
        i / (perPair - 1),
      ));
    }
  });
  return out;
}

/**
 * Nearest snap target to p: nodes win over curves. Returns null when nothing
 * is within radius. Node targets snap exactly (shared node → node group);
 * curve targets snap onto the centerline (T-touch → crossing group).
 */
export function findSnapTarget(project: Project, p: Point3D, opts: SnapOptions = {}): SnapTarget | null {
  const nodeRadius = opts.nodeRadius ?? 2.0;
  const curveRadius = opts.curveRadius ?? 1.0;
  const heightTol = opts.heightTol ?? 0.8;

  let bestNode: SnapTarget | null = null;
  let bestNodeD = nodeRadius;
  for (const s of project.splines) {
    for (const n of s.nodes) {
      if (n.id === opts.excludeNodeId) continue;
      const dxz = Math.hypot(n.position[0] - p[0], n.position[2] - p[2]);
      if (dxz < bestNodeD && Math.abs(n.position[1] - p[1]) < heightTol) {
        bestNodeD = dxz;
        bestNode = { point: [...n.position] as Point3D, kind: 'node', splineId: s.id, nodeId: n.id };
      }
    }
  }
  if (bestNode) return bestNode;

  // exact projection onto centerline segments (no gaps between samples)
  let bestCurve: SnapTarget | null = null;
  let bestCurveD = curveRadius;
  for (const s of project.splines) {
    const pts = sampleCenterline(s);
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j]; const b = pts[j + 1];
      if (p[0] < Math.min(a[0], b[0]) - curveRadius || p[0] > Math.max(a[0], b[0]) + curveRadius ||
        p[2] < Math.min(a[2], b[2]) - curveRadius || p[2] > Math.max(a[2], b[2]) + curveRadius) continue;
      const abx = b[0] - a[0]; const abz = b[2] - a[2];
      const len2 = abx * abx + abz * abz;
      let t = len2 < 1e-12 ? 0 : ((p[0] - a[0]) * abx + (p[2] - a[2]) * abz) / len2;
      t = Math.min(1, Math.max(0, t));
      const qx = a[0] + abx * t; const qz = a[2] + abz * t;
      const dxz = Math.hypot(p[0] - qx, p[2] - qz);
      if (dxz < bestCurveD) {
        const qy = a[1] + (b[1] - a[1]) * t;
        if (Math.abs(qy - p[1]) < heightTol) {
          bestCurveD = dxz;
          bestCurve = { point: [qx, qy, qz] as Point3D, kind: 'curve', splineId: s.id };
        }
      }
    }
  }
  return bestCurve;
}
