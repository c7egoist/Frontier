// ---------------------------------------------------------------------------
// editing.js — pure editing helpers: magnetic snapping of dragged/drawn
// points onto existing nodes and curve centerlines (so joins land exactly and
// crossings/T-touches fuse into junctions instead of near-misses).
// ---------------------------------------------------------------------------

import { sampleCenterline, pointSegXZ } from './topology.js';

/**
 * Nearest snap target to p: nodes win over curves. Node targets snap exactly
 * (shared node -> node group); curve targets snap onto the centerline.
 */
export function findSnapTarget(project, p, opts = {}) {
  const nodeRadius = opts.nodeRadius ?? 2.0;
  const curveRadius = opts.curveRadius ?? 1.0;
  const heightTol = opts.heightTol ?? 0.8;

  let bestNode = null;
  let bestNodeD = nodeRadius;
  for (const s of project.splines) {
    for (const n of s.nodes) {
      if (n.id === opts.excludeNodeId) continue;
      const dxz = Math.hypot(n.position[0] - p[0], n.position[2] - p[2]);
      if (dxz < bestNodeD && Math.abs(n.position[1] - p[1]) < heightTol) {
        bestNodeD = dxz;
        bestNode = { point: [...n.position], kind: 'node', splineId: s.id, nodeId: n.id };
      }
    }
  }
  if (bestNode) return bestNode;

  let bestCurve = null;
  let bestCurveD = curveRadius;
  for (const s of project.splines) {
    const pts = sampleCenterline(s);
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j]; const b = pts[j + 1];
      if (p[0] < Math.min(a[0], b[0]) - curveRadius || p[0] > Math.max(a[0], b[0]) + curveRadius ||
        p[2] < Math.min(a[2], b[2]) - curveRadius || p[2] > Math.max(a[2], b[2]) + curveRadius) continue;
      const { dist, t } = pointSegXZ(p, a, b);
      if (dist < bestCurveD) {
        const qy = a[1] + (b[1] - a[1]) * t;
        if (Math.abs(qy - p[1]) < heightTol) {
          bestCurveD = dist;
          bestCurve = { point: [a[0] + (b[0] - a[0]) * t, qy, a[2] + (b[2] - a[2]) * t], kind: 'curve', splineId: s.id };
        }
      }
    }
  }
  return bestCurve;
}
