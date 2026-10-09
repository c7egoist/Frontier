// ---------------------------------------------------------------------------
// tests/smoke.mjs — headless geometry pipeline tests (no DOM, no three.js).
// Run: node tests/smoke.mjs
// ---------------------------------------------------------------------------

import { buildNetwork } from '../src/network.js';
import { filletBetweenEdges, offsetCurveFromTargets } from '../src/junction.js';
import { buildFrames, computeCrossLines } from '../src/frames.js';
import { buildTopology } from '../src/topology.js';
import { worldToRoad, roadToWorld, gridIsFinite, vDist, arcLengths, pointAtArc } from '../src/math.js';
import { demoInterchange, demoHarbour, defaultProject, makeSpline, makeNode, migrateProject, addInterchange } from '../src/model.js';
import { alongAxisUnderRay, touchPlaneUnderRay, snapStep } from '../src/gizmoMath.js';
import { findSnapTarget } from '../src/editing.js';
import { networkToObj } from '../src/exportObj.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name} ${detail}`);
  }
}

function allPatchesFinite(net) {
  for (const sp of net.spans) for (const p of sp.patches) if (!gridIsFinite(p.grid)) return false;
  for (const j of net.junctions) for (const p of j.patches) if (!gridIsFinite(p.grid)) return false;
  return true;
}

function rectangular(patches) {
  for (const p of patches) {
    const cols = p.grid[0].length;
    for (const row of p.grid) if (row.length !== cols) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
console.log('\n[1] diamond interchange — the exchange must work');
{
  const net = buildNetwork(demoInterchange());
  check('no throw, stats present', !!net.stats);
  check('6 splines -> spans cover all', net.spans.length >= 6, `spans=${net.spans.length}`);
  check('8 T-junctions (4 ramps x 2 landings)', net.junctions.length === 8, `junctions=${net.junctions.length}`);
  check('all patches finite', allPatchesFinite(net));
  check('all patch grids rectangular', [...net.spans, ...net.junctions].every((x) => rectangular(x.patches)));
  check('triangle count healthy', net.stats.triangles > 10000, `tris=${net.stats.triangles}`);
  // the A/B crossing must stay grade-separated: no junction near the origin
  const nearOrigin = net.junctions.filter((j) => Math.hypot(j.position[0], j.position[2]) < 4);
  check('overpass crossing is NOT a junction', nearOrigin.length === 0, `near=${nearOrigin.length}`);
  // every junction has anchors for the single handle
  check('every junction has >=2 anchors', net.junctions.every((j) => j.anchors.length >= 2),
    `anchors=${net.junctions.map((j) => j.anchors.length).join(',')}`);
  // overpass spline is a beam bridge span
  const kinds = new Set(net.spans.map((s) => s.kind));
  check('beam bridge spans present', kinds.has('beam'), `kinds=${[...kinds].join(',')}`);
  // OBJ export contains geometry
  const obj = networkToObj(net, 'interchange');
  check('OBJ export has faces', (obj.match(/^f /gm) || []).length > 1000);
}

// ---------------------------------------------------------------------------
console.log('\n[2] harbour scene — 4-way shared-node junction + bridge landing');
{
  const net = buildNetwork(demoHarbour());
  check('4-way junction exists', net.junctions.some((j) => j.topology === '4-way intersection'),
    `topologies=${net.junctions.map((j) => j.topology).join('|')}`);
  check('all patches finite', allPatchesFinite(net));
  check('bridge spans present', net.spans.some((s) => s.kind === 'beam'));
  // the shore/north shared node junction has shared-node anchors
  const j4 = net.junctions.find((j) => j.topology === '4-way intersection');
  check('4-way junction has 2 shared-node anchors', j4 && j4.anchors.length === 2, `anchors=${j4 && j4.anchors.length}`);
  check('stats consistent', net.stats.junctions === net.junctions.length && net.stats.spans === net.spans.length);
}

// ---------------------------------------------------------------------------
console.log('\n[3] junction geometry quality — fillets are tangent-continuous, endpoints pinned');
{
  // convex corner like a real junction leg pair: leg A arrives heading +X at
  // its right edge, leg B arrives heading +Y at its left edge (SW corner of
  // a 4-way crossing)
  const p1 = [-7, -4, 0];
  const t1 = [1, 0, 0];
  const p2 = [-4, -7, 0];
  const t2 = [0, 1, 0];
  const arc = filletBetweenEdges(p1, t1, p2, t2, 4.2, 12);
  check('fillet keeps endpoints exact', vDist(arc[0], p1) < 1e-9 && vDist(arc[arc.length - 1], p2) < 1e-9);
  // tangent continuity: first arc segment direction ~ t1
  const d0 = [arc[1][0] - arc[0][0], arc[1][1] - arc[0][1]];
  const l0 = Math.hypot(...d0);
  const dot0 = l0 > 1e-9 ? (d0[0] * t1[0] + d0[1] * t1[1]) / l0 : 0;
  check('fillet starts tangent to edge 1', dot0 > 0.98, `dot=${dot0.toFixed(4)}`);
  const dn = [arc[arc.length - 1][0] - arc[arc.length - 2][0], arc[arc.length - 1][1] - arc[arc.length - 2][1]];
  const ln = Math.hypot(...dn);
  const dotn = ln > 1e-9 ? (dn[0] * t2[0] + dn[1] * t2[1]) / ln : 0;
  // the fillet is the junction boundary traversed from leg 1's edge to leg
  // 2's edge, so at the p2 end it runs collinear with edge 2's line
  // (opposite to leg 2's travel direction)
  check('fillet ends collinear with edge 2', Math.abs(dotn) > 0.98, `dot=${dotn.toFixed(4)}`);
  // the arc itself must leave tp along +t1 and arrive at tq along the edge-2 line
  const dArc0 = [arc[2][0] - arc[1][0], arc[2][1] - arc[1][1]];
  const lArc0 = Math.hypot(...dArc0);
  const dotArc0 = lArc0 > 1e-9 ? (dArc0[0] * t1[0] + dArc0[1] * t1[1]) / lArc0 : 0;
  check('arc leaves tangent point along edge 1', dotArc0 > 0.98, `dot=${dotArc0.toFixed(4)}`);
  // reflex corner (outward rays meet behind an edge) falls back to straight
  const reflex = filletBetweenEdges([0, 0, 0], [1, 0, 0], [6, 6, 0], [0, 1, 0], 3, 12);
  check('reflex corner falls back to straight', reflex.length === 2);
  // offset curve pins endpoints exactly
  const off = offsetCurveFromTargets(arc, [1, 1, 0.2], [5, 5, 0.4]);
  check('offset pins start target', vDist(off[0], [1, 1, 0.2]) < 1e-9);
  check('offset pins end target', vDist(off[off.length - 1], [5, 5, 0.4]) < 1e-9);
  check('offset finite', gridIsFinite([off]));
}

// ---------------------------------------------------------------------------
console.log('\n[4] curvature clamp — tight hairpin never inverts its offsets');
{
  // hairpin: radius ~8 m, road width 16 m (halfW 8 > 0.9 * 8) — the inside
  // edge MUST clamp to the curvature limit instead of looping back
  const s = makeSpline('Hairpin', '#a8bbeb');
  s.cross.width = 16;
  s.cross.paveLeft = 2;
  s.cross.paveRight = 2;
  s.nodes = [
    makeNode([-8, 0.05, 0]),
    makeNode([0, 0.05, 8]),
    makeNode([8, 0.05, 0]),
  ];
  s.nodes[0].handleOut = [-4.4, 0.05, 0];
  s.nodes[1].handleIn = [-4.4, 0.05, 4.4];
  s.nodes[1].handleOut = [4.4, 0.05, 4.4];
  s.nodes[2].handleIn = [4.4, 0.05, 0];
  const p = defaultProject();
  p.splines = [s];
  const net = buildNetwork(p);
  check('hairpin builds', net.spans.length === 1);
  check('hairpin patches finite', allPatchesFinite(net));
  // no-invert: every road-edge point stays on its own side of the centerline
  let inverted = 0;
  let minSide = Infinity;
  const topo = buildTopology(p);
  for (const run of topo.runs) {
    const L = arcLengths(run.pts);
    const road = [worldToRoad(pointAtArc(run.pts, L, 0))];
    for (let j = 0; j < run.pts.length; j++) road.push(worldToRoad(run.pts[j]));
    road.push(worldToRoad(pointAtArc(run.pts, L, L[L.length - 1])));
    const frames = buildFrames(road);
    const lines = computeCrossLines(frames, s.cross, s.drainage, { depth: 1.5, inset: 1.5 });
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const dl = (lines.roadL[i][0] - f.center[0]) * f.normal[0] + (lines.roadL[i][1] - f.center[1]) * f.normal[1];
      const dr = (lines.roadR[i][0] - f.center[0]) * -f.normal[0] + (lines.roadR[i][1] - f.center[1]) * -f.normal[1];
      minSide = Math.min(minSide, dl, dr);
      if (dl <= 0 || dr <= 0) inverted++;
    }
  }
  check('no inverted offsets anywhere', inverted === 0, `inverted=${inverted}`);
  check('inner edge stays at least 0.25 m off-center', minSide >= 0.24, `minSide=${minSide.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
console.log('\n[5] details — paving patterns, drainage grates, guardrails, terminals');
{
  const p = demoHarbour();
  const net = buildNetwork(p);
  const names = new Set();
  for (const sp of net.spans) for (const pch of sp.patches) names.add(pch.name.split(' ')[0]);
  for (const j of net.junctions) for (const pch of j.patches) names.add(pch.name.split(' ')[0]);
  check('slab joints generated', [...names].includes('Slab'));
  check('paver joints generated', [...names].includes('Paver'));
  check('gravel flecks generated', [...names].includes('Gravel'));
  check('grates generated', [...names].includes('Grate'));
  check('rail faces generated', [...names].includes('Rail'));
  check('posts generated', [...names].includes('Post'));
  check('crosswalk stripes at junctions', [...names].includes('Crosswalk'));
  check('gutter strips generated', [...names].includes('Gutter'));
  check('bridge girders generated', [...names].includes('Girder'));
  check('piers generated', [...names].includes('Pier'));
  check('parapets generated', [...names].includes('Parapet'));
}

// ---------------------------------------------------------------------------
console.log('\n[6] closed loop (roundabout) builds without junctions');
{
  const s = makeSpline('Loop', '#93c779');
  const R = 14;
  const k = R * 0.5523;
  s.closed = true;
  s.nodes = [
    { ...makeNode([R, 0.05, 0]), handleIn: [R, 0.05, -k], handleOut: [R, 0.05, k] },
    { ...makeNode([0, 0.05, R]), handleIn: [k, 0.05, R], handleOut: [-k, 0.05, R] },
    { ...makeNode([-R, 0.05, 0]), handleIn: [-R, 0.05, k], handleOut: [-R, 0.05, -k] },
    { ...makeNode([0, 0.05, -R]), handleIn: [-k, 0.05, -R], handleOut: [k, 0.05, -R] },
  ];
  const p = defaultProject();
  p.splines = [s];
  const net = buildNetwork(p);
  check('loop builds as one span', net.spans.length === 1, `spans=${net.spans.length}`);
  check('loop has no junctions', net.junctions.length === 0);
  check('loop patches finite', allPatchesFinite(net));
}

// ---------------------------------------------------------------------------
console.log('\n[7] self-crossing spline becomes a junction (figure-eight)');
{
  const s = makeSpline('Eight', '#e8b65f');
  s.nodes = [
    makeNode([-16, 0.05, -8]),
    makeNode([16, 0.05, 8]),
    makeNode([-16, 0.05, 8]),
    makeNode([16, 0.05, -8]),
  ];
  const p = defaultProject();
  p.splines = [s];
  const net = buildNetwork(p);
  check('figure-eight yields a 4-way junction', net.junctions.some((j) => j.topology === '4-way intersection'),
    `topologies=${net.junctions.map((j) => j.topology).join('|')}`);
  check('figure-eight finite', allPatchesFinite(net));
}

// ---------------------------------------------------------------------------
console.log('\n[8] gizmo math — axis/plane ray arithmetic + snap');
{
  const o = [0, 0, 0];
  const d = alongAxisUnderRay([1, 0, 0], o, [0, 5, 0], [0, -1, 0]);
  check('axis param under ray', Math.abs(d) < 1e-9, `d=${d}`);
  const d2 = alongAxisUnderRay([0, 1, 0], [0, 0, 0], [3, 5, 0], [0, -1, 0]);
  check('axis param offset ray', Math.abs(d2 - 0) < 1e-9);
  const t = touchPlaneUnderRay([0, 1, 0], [0, 0, 0], [0, 5, 0], [0, -1, 0]);
  check('plane touch point', t && Math.abs(t[1]) < 1e-9, `t=${t}`);
  const t2 = touchPlaneUnderRay([0, 1, 0], [0, 0, 0], [0, 5, 0], [1, 0, 0]);
  check('parallel ray misses plane', t2 === null);
  check('snap step', snapStep(0.3, 0.25) === 0.25 && snapStep(0.13, 0.25) === 0.25 && snapStep(0.12, 0.25) === 0);
}

// ---------------------------------------------------------------------------
console.log('\n[9] snapping — node wins over curve, curve snap lands on centerline');
{
  const p = demoHarbour();
  const target = p.splines[0].nodes[2].position; // shore node 3 (the shared one)
  const near = [target[0] + 0.8, target[1], target[2] + 0.3];
  const hit = findSnapTarget(p, near, { nodeRadius: 2, curveRadius: 1 });
  check('snaps to node', hit && hit.kind === 'node', `hit=${hit && hit.kind}`);
  const curveHit = findSnapTarget(p, [-30, 0.05, -11.2], { nodeRadius: 0.5, curveRadius: 1.5 });
  check('snaps to curve', curveHit && curveHit.kind === 'curve', `hit=${curveHit && curveHit.kind}`);
}

// ---------------------------------------------------------------------------
console.log('\n[10] serialization — migrate round-trip + interchange insertion');
{
  const p = demoInterchange();
  const json = JSON.parse(JSON.stringify(p));
  const back = migrateProject(json);
  check('round-trip keeps spline count', back.splines.length === p.splines.length);
  check('round-trip keeps nodes', back.splines.every((s, i) => s.nodes.length === p.splines[i].nodes.length));
  check('round-trip fills defaults', back.splines.every((s) => s.drainage && s.bridge && s.rails && s.cross.markings));
  const grown = addInterchange(defaultProject(), 100, 50);
  check('addInterchange adds 6 splines', grown.splines.length === 6);
  const net = buildNetwork(grown);
  check('inserted interchange builds 8 junctions', net.junctions.length === 8, `j=${net.junctions.length}`);
  check('inserted interchange finite', allPatchesFinite(net));
}

// ---------------------------------------------------------------------------
console.log('\n[11] world/road space mapping is a proper involution');
{
  const w = [3, 1.5, -7];
  const r = worldToRoad(w);
  const w2 = roadToWorld(r);
  check('round trip', vDist(w, w2) < 1e-12);
}

// ---------------------------------------------------------------------------
console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
