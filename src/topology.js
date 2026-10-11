// ============================================================================================================================================
//                                                                TOPOLOGY.JS
// ============================================================================================================================================
// Converts authored cubic/Catmull-Rom road splines into a clean planar/grade-separated road network graph:
//   1. Detects shared nodes (Y-forks, T-joints, + hubs), node-on-curve touches, and curve-curve crossings.
//   2. Splits splines at every at-grade intersection so NO road ever passes through another road ("| layered on -" is impossible).
//   3. Computes angle-aware trim distances for each arm approaching an N-way junction so acute Y-branches and 90° + crossroads
//      have non-overlapping approach frames ready for merged Coons quad patch construction.
//   4. Binds all participating spline nodes into a single Junction Anchor set so dragging a Junction Gizmo moves the entire
//      intersection and all connected arms simultaneously.

import {
  clamp,
  lerp,
  vAdd,
  vSub,
  vScale,
  vLen,
  vNorm,
  vNormXZ,
  vDistXZ,
  leftNormalXZ,
  planAngleXZ,
  sampleSplineNodes,
  arcLengths,
  pointAtArc,
  tangentAtArc,
  pointSegXZ,
  segIntersectXZ,
} from './math.js';

const MERGE_NODE_XZ = 2.4;
const TOUCH_XZ = 2.8;
const CROSS_Y = 2.6; // height difference >= 2.6m is grade-separated (overpass / underpass)
const MERGE_ARC = 2.5;
const END_SNAP = 1.6;

/**
 * Build adaptive station frames along a trimmed 3D polyline in world space (Y-up).
 * Includes curvature clamping so wide sidewalks/curbs never self-intersect on tight bends.
 */
export function buildStationFrames(polyline, densityMult = 1.0) {
  if (!polyline || polyline.length < 2) return [];
  const L = arcLengths(polyline);
  const total = L[L.length - 1];
  if (total < 0.05) return [];

  // Target ~1.6m station spacing for dense, smooth quad topology (allows potholes & speed bumps to deform cleanly)
  const baseStep = clamp(1.65 / Math.max(0.4, densityMult), 0.65, 3.0);
  const count = clamp(Math.ceil(total / baseStep) + 1, 4, 420);

  const centers = [];
  for (let i = 0; i < count; i++) {
    const s = (total * i) / (count - 1);
    centers.push(pointAtArc(polyline, L, s));
  }
  // Pin exact start and end points
  centers[0] = [...polyline[0]];
  centers[centers.length - 1] = [...polyline[polyline.length - 1]];

  const tangents = [];
  for (let i = 0; i < count; i++) {
    const a = centers[Math.max(0, i - 1)];
    const b = centers[Math.min(count - 1, i + 1)];
    tangents.push(vNorm(vSub(b, a), [0, 0, -1]));
  }

  const lefts = tangents.map((t) => leftNormalXZ(t));
  const sArr = arcLengths(centers);

  const frames = [];
  for (let i = 0; i < count; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(count - 1, i + 1);
    const turn = planAngleXZ(tangents[i0], tangents[i1]);
    const ds = Math.max(1e-5, sArr[i1] - sArr[i0]);
    const kappa = turn / ds;
    const rho = Math.abs(kappa) < 1e-6 ? Infinity : 1 / kappa;
    let maxLeft = 1e6;
    let maxRight = 1e6;
    if (Number.isFinite(rho)) {
      if (rho > 0) maxLeft = Math.max(1.0, rho * 0.88);
      else maxRight = Math.max(1.0, -rho * 0.88);
    }
    frames.push({
      center: centers[i],
      tangent: tangents[i],
      left: lefts[i],
      right: [-lefts[i][0], 0, -lefts[i][2]],
      s: sArr[i],
      u: total > 0 ? sArr[i] / total : 0,
      kappa,
      rho,
      maxLeft,
      maxRight,
    });
  }

  return frames;
}

/**
 * Evaluates full network topology from project.splines.
 */
export function buildNetworkTopology(project) {
  const splines = (project.splines || []).filter((s) => s.nodes && s.nodes.length >= 2);
  const samples = new Map();
  for (const s of splines) {
    const sm = sampleSplineNodes(s.nodes, !!s.closed, 40);
    if (sm.total >= 0.5) {
      samples.set(s.id, { spline: s, ...sm });
    }
  }

  const splits = new Map();
  for (const id of samples.keys()) splits.set(id, []);
  const groups = new Map();
  const gradeSeparations = [];
  let nextGroupSeq = 1;

  const ensureGroup = (gid, kind = 'junction') => {
    if (!groups.has(gid)) {
      groups.set(gid, {
        id: gid,
        kind,
        position: null,
        nodeRefs: [],
        crossingRefs: [],
      });
    }
    return groups.get(gid);
  };

  const remapGroup = (fromId, toId) => {
    if (fromId === toId) return toId;
    for (const arr of splits.values()) {
      for (const sp of arr) {
        if (sp.id === fromId) sp.id = toId;
      }
    }
    const gFrom = groups.get(fromId);
    const gTo = groups.get(toId);
    if (gFrom && gTo) {
      if (!gTo.position && gFrom.position) gTo.position = gFrom.position;
      for (const nr of gFrom.nodeRefs) {
        if (!gTo.nodeRefs.some((x) => x.splineId === nr.splineId && x.nodeId === nr.nodeId)) {
          gTo.nodeRefs.push(nr);
        }
      }
      for (const cr of gFrom.crossingRefs) {
        gTo.crossingRefs.push(cr);
      }
    }
    groups.delete(fromId);
    return toId;
  };

  const addSplitOnSpline = (splineId, sVal, preferId = null) => {
    const sm = samples.get(splineId);
    const list = splits.get(splineId);
    if (!sm || !list) return preferId || `jgroup-${nextGroupSeq++}`;
    const clamped = clamp(sVal, 0, sm.total);

    for (const ex of list) {
      if (Math.abs(ex.s - clamped) < MERGE_ARC) {
        if (preferId && preferId !== ex.id) {
          return remapGroup(preferId, ex.id);
        }
        return ex.id;
      }
    }

    const id = preferId || `jgroup-${nextGroupSeq++}`;
    ensureGroup(id);
    list.push({ s: clamped, id });
    return id;
  };

  // 1. Cluster shared / nearby control nodes across all splines (Y-forks, T-joints, + hubs)
  const allNodes = [];
  for (const s of splines) {
    const sm = samples.get(s.id);
    if (!sm) continue;
    for (let i = 0; i < s.nodes.length; i++) {
      allNodes.push({
        spline: s,
        node: s.nodes[i],
        index: i,
        sArc: sm.nodeArc[i] ?? 0,
      });
    }
  }

  const visitedNodes = new Set();
  for (let i = 0; i < allNodes.length; i++) {
    if (visitedNodes.has(i)) continue;
    const seed = allNodes[i];
    const cluster = [seed];
    visitedNodes.add(i);

    for (let j = i + 1; j < allNodes.length; j++) {
      if (visitedNodes.has(j)) continue;
      const cand = allNodes[j];
      if (cand.spline.id === seed.spline.id) continue;
      const dXZ = vDistXZ(seed.node.position, cand.node.position);
      const dY = Math.abs(seed.node.position[1] - cand.node.position[1]);
      if (dXZ <= MERGE_NODE_XZ && dY < CROSS_Y) {
        cluster.push(cand);
        visitedNodes.add(j);
      }
    }

    if (cluster.length >= 2) {
      let gid = null;
      for (const item of cluster) {
        gid = addSplitOnSpline(item.spline.id, item.sArc, gid);
      }
      const grp = ensureGroup(gid, 'shared-node');
      const avg = [0, 0, 0];
      for (const item of cluster) {
        avg[0] += item.node.position[0];
        avg[1] += item.node.position[1];
        avg[2] += item.node.position[2];
        if (!grp.nodeRefs.some((r) => r.splineId === item.spline.id && r.nodeId === item.node.id)) {
          grp.nodeRefs.push({
            splineId: item.spline.id,
            nodeId: item.node.id,
            index: item.index,
          });
        }
      }
      grp.position = [
        avg[0] / cluster.length,
        avg[1] / cluster.length,
        avg[2] / cluster.length,
      ];
    }
  }

  // 2. Node-on-curve touches (T-joints where a spline endpoint/node lands on another spline's curve)
  for (const A of splines) {
    const smA = samples.get(A.id);
    if (!smA) continue;
    for (let ni = 0; ni < A.nodes.length; ni++) {
      const P = A.nodes[ni].position;
      const sA = smA.nodeArc[ni] ?? 0;
      for (const B of splines) {
        if (B.id === A.id) continue;
        const smB = samples.get(B.id);
        if (!smB) continue;
        let best = { dist: TOUCH_XZ, s: 0, y: 0, pt: null };
        for (let j = 0; j < smB.pts.length - 1; j++) {
          const a = smB.pts[j];
          const b = smB.pts[j + 1];
          const { dist, t } = pointSegXZ(P, a, b);
          if (dist < best.dist) {
            best = {
              dist,
              s: smB.lengths[j] + t * (smB.lengths[j + 1] - smB.lengths[j]),
              y: lerp(a[1], b[1], t),
              pt: [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
            };
          }
        }
        if (best.dist < TOUCH_XZ && Math.abs(P[1] - best.y) < CROSS_Y) {
          let gid = addSplitOnSpline(A.id, sA, null);
          gid = addSplitOnSpline(B.id, best.s, gid);
          const grp = ensureGroup(gid, 't-touch');
          if (!grp.position) {
            grp.position = [(P[0] + best.pt[0]) * 0.5, (P[1] + best.y) * 0.5, (P[2] + best.pt[2]) * 0.5];
          }
          if (!grp.nodeRefs.some((r) => r.splineId === A.id && r.nodeId === A.nodes[ni].id)) {
            grp.nodeRefs.push({ splineId: A.id, nodeId: A.nodes[ni].id, index: ni });
          }
        }
      }
    }
  }

  // 3. Curve-curve crossings (at-grade + / X junctions vs grade-separated overpasses)
  const sampleIds = [...samples.keys()];
  for (let ai = 0; ai < sampleIds.length; ai++) {
    for (let bi = ai + 1; bi < sampleIds.length; bi++) {
      const idA = sampleIds[ai];
      const idB = sampleIds[bi];
      const smA = samples.get(idA);
      const smB = samples.get(idB);
      for (let i = 0; i < smA.pts.length - 1; i++) {
        const a0 = smA.pts[i];
        const a1 = smA.pts[i + 1];
        for (let j = 0; j < smB.pts.length - 1; j++) {
          const b0 = smB.pts[j];
          const b1 = smB.pts[j + 1];
          const hit = segIntersectXZ(a0, a1, b0, b1);
          if (!hit) continue;
          const [t, u] = hit;
          const yA = lerp(a0[1], a1[1], t);
          const yB = lerp(b0[1], b1[1], u);
          const ix = lerp(a0[0], a1[0], t);
          const iz = lerp(a0[2], a1[2], t);
          const sA = smA.lengths[i] + t * (smA.lengths[i + 1] - smA.lengths[i]);
          const sB = smB.lengths[j] + u * (smB.lengths[j + 1] - smB.lengths[j]);

          if (Math.abs(yA - yB) >= CROSS_Y) {
            // Grade-separated overpass/underpass!
            gradeSeparations.push({
              upperSplineId: yA > yB ? idA : idB,
              lowerSplineId: yA > yB ? idB : idA,
              position: [ix, Math.min(yA, yB), iz],
              clearance: Math.abs(yA - yB),
              sUpper: yA > yB ? sA : sB,
              sLower: yA > yB ? sB : sA,
            });
            continue;
          }

          let gid = addSplitOnSpline(idA, sA, null);
          gid = addSplitOnSpline(idB, sB, gid);
          const grp = ensureGroup(gid, 'crossing');
          if (!grp.position) {
            grp.position = [ix, (yA + yB) * 0.5, iz];
          }
          grp.crossingRefs.push({ splineA: idA, sA, splineB: idB, sB });
        }
      }
    }
  }

  // 4. Split each spline into non-overlapping runs between intersection splits
  const runs = [];
  for (const s of splines) {
    const sm = samples.get(s.id);
    if (!sm) continue;
    let arr = splits.get(s.id) || [];
    for (const sp of arr) {
      if (sp.s < END_SNAP) sp.s = 0;
      else if (sm.total - sp.s < END_SNAP) sp.s = sm.total;
    }
    arr = [...arr].sort((a, b) => a.s - b.s);
    const dedup = [];
    for (const sp of arr) {
      const prev = dedup[dedup.length - 1];
      if (prev && Math.abs(prev.s - sp.s) < 0.25) {
        remapGroup(sp.id, prev.id);
      } else {
        dedup.push(sp);
      }
    }

    const bounds = [{ s: 0, id: null }, ...dedup, { s: sm.total, id: null }];
    // Merge start/end bounds if a split landed directly on 0 or total
    const cleanBounds = [];
    for (const b of bounds) {
      const prev = cleanBounds[cleanBounds.length - 1];
      if (prev && Math.abs(prev.s - b.s) < 0.15) {
        if (b.id) prev.id = b.id;
      } else {
        cleanBounds.push({ ...b });
      }
    }

    for (let k = 0; k < cleanBounds.length - 1; k++) {
      const b0 = cleanBounds[k];
      const b1 = cleanBounds[k + 1];
      if (b1.s - b0.s < 1.0) continue;
      const pts = [pointAtArc(sm.pts, sm.lengths, b0.s)];
      for (let j = 0; j < sm.pts.length; j++) {
        const L = sm.lengths[j];
        if (L > b0.s + 0.05 && L < b1.s - 0.05) {
          pts.push(sm.pts[j]);
        }
      }
      pts.push(pointAtArc(sm.pts, sm.lengths, b1.s));

      // Anchor junction endpoints to the exact group position in XZ/Y so approaches meet at a single mathematical point
      if (b0.id && groups.get(b0.id)?.position) {
        pts[0] = [...groups.get(b0.id).position];
      }
      if (b1.id && groups.get(b1.id)?.position) {
        pts[pts.length - 1] = [...groups.get(b1.id).position];
      }

      runs.push({
        id: `${s.id}-run-${k}`,
        spline: s,
        fromId: b0.id,
        toId: b1.id,
        sStart: b0.s,
        sEnd: b1.s,
        totalSplineLen: sm.total,
        pts,
        trimStart: false,
        trimEnd: false,
        trimStartDist: 0,
        trimEndDist: 0,
      });
    }
  }

  // 5. Identify active junctions (any group with >= 2 connected run ends) and compute angle-aware trim distances
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

  const junctionLayer = (project.roadLayers || []).find((l) => l.id === 'layer-junctions');
  const baseCornerRadius = junctionLayer?.params?.cornerRadius ?? 6.5;

  const activeJunctionGroups = new Map();
  for (const [gid, endRefs] of endsByGroup.entries()) {
    if (endRefs.length < 2) continue;

    // Compute outward direction of each arm from the junction center
    const grp = groups.get(gid);
    const center = grp?.position || [...endRefs[0].run.pts[0]];

    const armDirs = endRefs.map(({ run, atStart }) => {
      const L = arcLengths(run.pts);
      const total = L[L.length - 1];
      const sampleDist = Math.min(8.0, total * 0.35);
      const farPt = pointAtArc(run.pts, L, atStart ? sampleDist : Math.max(0, total - sampleDist));
      const d = vNormXZ(vSub(farPt, center), [1, 0, 0]);
      const angle = Math.atan2(d[2], d[0]);
      const halfSpanW = (run.spline.width || 10) * 0.5 + (run.spline.sidewalkWidth ?? 3.4);
      return { run, atStart, outward: d, angle, halfSpanW, total };
    });

    armDirs.sort((a, b) => a.angle - b.angle);

    // If only 2 arms meet and they are nearly 180° colinear with identical width, treat as a continuous join or 2-way bend
    const N = armDirs.length;
    for (let i = 0; i < N; i++) {
      const cur = armDirs[i];
      const prev = armDirs[(i - 1 + N) % N];
      const next = armDirs[(i + 1) % N];

      const angleNext = Math.acos(clamp(cur.outward[0] * next.outward[0] + cur.outward[2] * next.outward[2], -1, 1));
      const anglePrev = Math.acos(clamp(cur.outward[0] * prev.outward[0] + cur.outward[2] * prev.outward[2], -1, 1));
      const minNeighborAngle = Math.max(0.38, Math.min(angleNext, anglePrev));

      // Trim distance must clear both the neighbor arm's half-width along the miter and the fillet arc tangency
      const maxHalfW = Math.max(cur.halfSpanW, next.halfSpanW, prev.halfSpanW);
      const miterDist = maxHalfW / Math.tan(minNeighborAngle * 0.5);
      const effCornerRadius = project.junctionOverrides?.[gid]?.cornerRadius ?? baseCornerRadius;
      const filletExtra = effCornerRadius * 0.65;
      const desiredTrim = clamp(miterDist + filletExtra, maxHalfW + 1.8, cur.total * 0.44);

      if (cur.atStart) {
        cur.run.trimStart = true;
        cur.run.trimStartDist = desiredTrim;
      } else {
        cur.run.trimEnd = true;
        cur.run.trimEndDist = desiredTrim;
      }
    }

    // Collect all spline control nodes anchored to this junction so moving the junction gizmo moves all connected arms
    const anchors = [];
    const seen = new Set();
    const addAnchor = (splineId, nodeId, index) => {
      const key = `${splineId}:${nodeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        anchors.push({ splineId, nodeId, index });
      }
    };

    if (grp) {
      for (const nr of grp.nodeRefs) {
        addAnchor(nr.splineId, nr.nodeId, nr.index);
      }
    }
    // Also check each arm's spline for any node close to center
    for (const arm of armDirs) {
      const s = arm.run.spline;
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let ni = 0; ni < s.nodes.length; ni++) {
        const d = vDistXZ(s.nodes[ni].position, center);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = ni;
        }
      }
      if (bestIdx >= 0 && bestDist < 18.0) {
        addAnchor(s.id, s.nodes[bestIdx].id, bestIdx);
      }
    }

    activeJunctionGroups.set(gid, {
      id: gid,
      center,
      armCount: N,
      topologyShape:
        N === 2
          ? '2-Way Bend'
          : N === 3
            ? classifyThreeWayShape(armDirs)
            : N === 4
              ? '4-Way + Crossroads'
              : `${N}-Way Star Hub`,
      arms: armDirs,
      anchors,
    });
  }

  return {
    runs,
    junctionGroups: activeJunctionGroups,
    gradeSeparations,
    samples,
  };
}

function classifyThreeWayShape(sortedArms) {
  // Check if any pair of arms is ~180° apart (T-junction) vs three angled arms (Y-junction)
  for (let i = 0; i < 3; i++) {
    const a = sortedArms[i].outward;
    const b = sortedArms[(i + 1) % 3].outward;
    const dot = a[0] * b[0] + a[2] * b[2];
    const deg = (Math.acos(clamp(dot, -1, 1)) * 180) / Math.PI;
    if (deg > 158) {
      return '3-Way T-Junction';
    }
  }
  return '3-Way Y-Junction';
}
