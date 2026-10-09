// ---------------------------------------------------------------------------
// network.js — orchestrates one full network build:
//   topology (splits/runs/junction rule) -> trim -> frames -> cross lines ->
//   landing links -> spans (road/bridge) -> merged junctions (with anchors
//   for the single junction handle) -> sanitized patches + stats.
//
// The build is total: it never throws. Degenerate runs are skipped, every
// junction is wrapped in try/catch, and every patch list is sanitized for
// rectangular, finite grids before it reaches the renderer.
// ---------------------------------------------------------------------------

import { vScale, vLen, vSub, worldToRoad, roadToWorld, arcLengths, pointAtArc, sanitizePatches, countTriangles } from './math.js';
import { buildTopology, pointAt } from './topology.js';
import { buildFrames, closeFrames, computeCrossLines } from './frames.js';
import { buildRoadSpan } from './roadSpan.js';
import { buildBeamSpan, buildArchSpan } from './bridge.js';
import { buildMergedJunction, legFromRunEnd } from './junction.js';
import { topologyName } from './model.js';

function trimRun(run, s0, s1, junctions) {
  const L = arcLengths(run.pts);
  const total = L[L.length - 1];
  const road = [worldToRoad(pointAtArc(run.pts, L, s0))];
  for (let j = 0; j < run.pts.length; j++) {
    if (L[j] > s0 + 1e-4 && L[j] < s1 - 1e-4) road.push(worldToRoad(run.pts[j]));
  }
  road.push(worldToRoad(pointAtArc(run.pts, L, s1)));
  let frames = buildFrames(run.closedLoop ? road.slice(0, -1) : road);
  if (frames.length < 2) return null;
  if (run.closedLoop) frames = closeFrames(frames);
  const lines = computeCrossLines(frames, run.spline.cross, run.spline.drainage, {
    depth: junctions.depth,
    inset: junctions.inset,
  });
  return { frames, lines };
}

export function buildNetwork(project) {
  const junctions = [];
  const spans = [];
  const topo = buildTopology(project);
  const { runs, junctionGroupIds, groups } = topo;
  if (runs.length === 0) return { junctions, spans, stats: emptyStats() };

  const cornerR = Math.max(2, project.junctions.cornerRadius);

  // --- trim + frames + cross lines ---
  const viable = [];
  for (const run of runs) {
    const L = arcLengths(run.pts);
    const total = L[L.length - 1];
    let s0 = 0;
    let s1 = total;
    if (run.trimStart) s0 = Math.min(cornerR, total * 0.49);
    if (run.trimEnd) s1 = total - Math.min(cornerR, total * 0.49);
    if (s1 - s0 < 0.02) continue; // degenerate crumbs only
    const built = trimRun(run, s0, s1, project.junctions);
    if (!built) continue;
    viable.push({
      ...run,
      frames: built.frames,
      lines: built.lines,
      capStart: false,
      capEnd: false,
      landingStart: false,
      landingEnd: false,
    });
  }

  // --- legs from viable runs; drop single-leg junctions (un-trim) ---
  const legsByJunction = new Map();
  for (const run of viable) {
    if (run.trimStart && run.fromId) {
      if (!legsByJunction.has(run.fromId)) legsByJunction.set(run.fromId, []);
      legsByJunction.get(run.fromId).push({ run, atStart: true });
    }
    if (run.trimEnd && run.toId) {
      if (!legsByJunction.has(run.toId)) legsByJunction.set(run.toId, []);
      legsByJunction.get(run.toId).push({ run, atStart: false });
    }
  }
  for (const [g, legRefs] of [...legsByJunction]) {
    if (legRefs.length >= 2) continue;
    for (const { run, atStart } of legRefs) {
      const L = arcLengths(run.pts);
      const total = L[L.length - 1];
      const ns0 = atStart ? 0 : (run.trimStart ? Math.min(cornerR, total * 0.49) : 0);
      const ns1 = !atStart ? total : (run.trimEnd ? total - Math.min(cornerR, total * 0.49) : total);
      const built = trimRun(run, ns0, ns1, project.junctions);
      if (!built) continue;
      run.frames = built.frames;
      run.lines = built.lines;
      if (atStart) run.trimStart = false;
      else run.trimEnd = false;
    }
    legsByJunction.delete(g);
  }

  // --- caps / landings ---
  for (const run of viable) {
    run.capStart = !run.trimStart && !run.closedLoop && run.fromId == null;
    run.capEnd = !run.trimEnd && !run.closedLoop && run.toId == null;
    run.landingStart = !run.trimStart && !run.closedLoop && !run.capStart;
    run.landingEnd = !run.trimEnd && !run.closedLoop && !run.capEnd;
  }

  // --- landing links: road W-beam bends onto the adjoining bridge parapet ---
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
      const nrm = bf.normal;
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
      const tL = useParapet
        ? [deckL[0] + nrm[0] * 0.1, deckL[1] + nrm[1] * 0.1, deckL[2]]
        : [deckL[0] - nrm[0] * 0.25, deckL[1] - nrm[1] * 0.25, deckL[2]];
      const tR = useParapet
        ? [deckR[0] - nrm[0] * 0.1, deckR[1] - nrm[1] * 0.1, deckR[2]]
        : [deckR[0] + nrm[0] * 0.25, deckR[1] + nrm[1] * 0.25, deckR[2]];
      // pair road edges to bridge targets (2x2 match handles mirrored headings)
      const mi = mateAtStart ? 0 : mate.lines.paveL.length - 1;
      const mL = mate.lines.paveL[mi];
      const mR = mate.lines.paveR[mi];
      const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const crossed = dd(mL, tR) + dd(mR, tL) < dd(mL, tL) + dd(mR, tR);
      const link = (t) => ({ target: [...t], length: 3 });
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
    let kind = 'road';
    let patches;
    const junctionAtStart = run.trimStart;
    const junctionAtEnd = run.trimEnd;
    if (!s.bridge.enabled) {
      patches = buildRoadSpan(run.lines, s.cross, s.rails, s.drainage, {
        depth: project.junctions.depth,
        inset: project.junctions.inset,
        capStart,
        capEnd,
        junctionAtStart,
        junctionAtEnd,
        railLinks: run.railLinks,
      });
    } else {
      const bopt = {
        groundZ: project.scene.groundZ,
        capStart, capEnd, landingStart, landingEnd, loop: run.closedLoop,
        rampStartH: run.rampStartH, rampEndH: run.rampEndH,
        drainage: s.drainage && s.drainage.enabled,
        scupperSpacing: s.drainage ? s.drainage.grateSpacing : 10,
        junctionAtStart,
        junctionAtEnd,
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
    spans.push({
      splineId: s.id,
      kind,
      length: spanLen,
      patches: sanitizePatches(patches),
      capStart,
      capEnd,
      junctionAtStart,
      junctionAtEnd,
    });
  }

  // --- junctions from span end stations (exact shared sections) ---
  let seq = 0;
  for (const [gid, legRefs] of legsByJunction) {
    const legs = [];
    const armInfos = [];
    let railAny = false;
    let railH = 0; let railT = 0; let railPosts = false; let railPS = Infinity;
    for (const { run, atStart } of legRefs) {
      const s = run.spline;
      const leg = legFromRunEnd(run, atStart);
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
    const rails = {
      enabled: railAny, height: railH || 0.75, thickness: railT || 0.18,
      posts: railPosts, postSpacing: Number.isFinite(railPS) ? railPS : 2.4,
      terminals: false,
    };
    // center: mean of leg approach points (road space) — the true crossing point
    const center = [0, 0, 0];
    for (const leg of legs) {
      center[0] += leg.point[0]; center[1] += leg.point[1]; center[2] += leg.point[2];
    }
    center[0] /= legs.length; center[1] /= legs.length; center[2] /= legs.length;
    // anchors: the single-handle refs that move the whole joint
    const group = groups.get(gid);
    const anchors = collectAnchors(group, legs, project);
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
        groupId: gid,
        position: roadToWorld(center),
        topology: topologyName(legs.length),
        kind: group ? group.kind : 'crossing',
        arms: armInfos,
        anchors,
        patches: sanitizePatches(patches),
      });
    } catch (e) {
      console.error('junction build failed', e);
    }
  }

  return { junctions, spans, stats: computeStats(spans, junctions) };
}

/**
 * Junction anchors — the node refs the single junction handle drags.
 * Shared-node groups anchor on their member nodes (the joint moves exactly).
 * Crossing groups anchor on each arm spline's nearest node to the junction.
 */
function collectAnchors(group, legs, project) {
  const anchors = [];
  const seen = new Set();
  const push = (splineId, nodeId) => {
    const key = `${splineId}:${nodeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push({ splineId, nodeId });
  };
  if (group && group.nodeRefs.length > 0) {
    for (const r of group.nodeRefs) push(r.splineId, r.nodeId);
  }
  if (anchors.length === 0) {
    const c = [0, 0, 0];
    for (const leg of legs) { c[0] += leg.point[0]; c[1] += leg.point[1]; c[2] += leg.point[2]; }
    c[0] /= legs.length; c[1] /= legs.length; c[2] /= legs.length;
    // leg points are road space; compare in XZ against node world positions
    const cx = c[0];
    const cz = -c[1]; // road (x, yFwd) -> world (x, z=-yFwd)
    const cy = c[2];
    for (const leg of legs) {
      const s = project.splines.find((sp) => sp.id === leg.splineId);
      if (!s) continue;
      let best = null;
      let bestD = Infinity;
      for (const node of s.nodes) {
        const d = Math.hypot(node.position[0] - cx, node.position[2] - cz);
        if (d < bestD) { bestD = d; best = node; }
      }
      if (best) push(s.id, best.id);
      void cy;
    }
  }
  return anchors;
}

function emptyStats() {
  return { patches: 0, triangles: 0, spans: 0, junctions: 0, length: 0 };
}

function computeStats(spans, junctions) {
  let patches = 0;
  let triangles = 0;
  let length = 0;
  for (const sp of spans) {
    patches += sp.patches.length;
    triangles += countTriangles(sp.patches);
    length += sp.length;
  }
  for (const j of junctions) {
    patches += j.patches.length;
    triangles += countTriangles(j.patches);
  }
  return { patches, triangles, spans: spans.length, junctions: junctions.length, length };
}
