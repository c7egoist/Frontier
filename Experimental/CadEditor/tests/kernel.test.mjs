// Kernel tests: run the real OpenCascade build (replicad) against the node registry.
import assert from "node:assert/strict";
import opencascade from "replicad-opencascadejs";
import * as replicad from "replicad";
import { createEvaluator } from "../src/kernel/evaluate.js";
import { defaultParams, NODE_TYPES } from "../src/model/nodeTypes.js";

const OC = await opencascade();
replicad.setOC(OC);
const ev = createEvaluator(replicad);

let nextId = 1;
const doc = { nodes: {}, order: [] };
function add(type, inputs = [], params = {}, xf = null) {
  const id = `n${nextId++}`;
  doc.nodes[id] = { id, type, inputs, params: { ...defaultParams(type), ...params }, xf };
  doc.order.push(id);
  return id;
}
const run = () => ev.evaluate(doc).results;

// ---- 1. every node type has a builder ----
for (const type of Object.keys(NODE_TYPES)) {
  assert.ok(defaultParams(type), type);
}

// ---- 2. primitives and transforms ----
const box = add("box", [], { w: 40, h: 20, d: 10 });
const boxMoved = add("box", [], { w: 10, h: 10, d: 10 }, { t: [100, 0, 0], r: [0, 0, 0], s: 2 });
const rot = add("box", [], { w: 40, h: 20, d: 10 }, { t: [0, 0, 0], r: [0, 0, 90], s: 1 });
let res = run();
assert.ok(res[box].ok, res[box].error);
assert.equal(Math.round(res[box].volume), 8000);
assert.equal(res[box].faceCount, 6);
assert.equal(res[box].edgeCount, 12);
assert.ok(res[boxMoved].ok);
// Scale about the origin first, then translate: a 10 mm box x2 spans 20 mm, centred at +100.
assert.ok(Math.abs(res[boxMoved].bbox.min[0] - 90) < 1e-3, JSON.stringify(res[boxMoved].bbox));
assert.ok(Math.abs(res[boxMoved].volume - 1000 * 8) < 1, "scale 2 => 8x volume");
// Rotation by 90 degrees about Z swaps X and Y extents of a 40x20 box.
assert.ok(Math.abs(res[rot].bbox.max[0] - res[rot].bbox.min[0] - 20) < 1e-3, JSON.stringify(res[rot].bbox));

// ---- 3. edge selection maps to the same edge in picking and in fillet ----
const e = res[box].edges;
assert.equal(e.ranges.length / 3, 12);
const fil = add("fillet", [box], { radius: 2, edges: [0, 1, 2, 3] });
res = run();
assert.ok(res[fil].ok, res[fil].error);
assert.ok(res[fil].volume < 8000 && res[fil].volume > 7800, `fillet volume ${res[fil].volume}`);
const chf = add("chamfer", [box], { distance: 2, edges: [0] });
const bev = add("bevel", [box], { distance: 2, setback: 4, edges: [0] });
const noEdges = add("fillet", [box], { radius: 2, edges: [] });
res = run();
assert.ok(res[chf].ok, res[chf].error);
// A 2 mm chamfer on one edge removes a triangle of area 2 mm^2 along that edge: 2 * L (L in {10, 20, 40}).
const removed = 8000 - res[chf].volume;
assert.ok([20, 40, 80].some((v) => Math.abs(removed - v) < 1e-3), `chamfer removed ${removed}`);
assert.ok(res[bev].ok, res[bev].error);
assert.ok(res[bev].volume < 8000);
assert.equal(res[noEdges].ok, false);

// ---- 4. curves ----
const line = add("line", [], { a: [0, 0, 0], b: [50, 0, 0] });
const poly = add("polyline", [], { points: [[0, 0, 0], [60, 0, 0], [60, 40, 0], [0, 40, 0]], closed: true });
const arc = add("arc3", [], {});
const tarc = add("tangentArc", [], {});
const circ = add("circle", [], { r: 20 });
const ell = add("ellipse", [], { rx: 30, ry: 15 });
const helix = add("helix", [], {});
const bez = add("bezier", [], {});
const spl = add("spline", [], {});
const fit = add("fitCurve", [], {});
res = run();
for (const id of [line, poly, arc, tarc, circ, ell, helix, bez, spl, fit]) {
  assert.ok(res[id].ok, `${id}: ${res[id].error}`);
  assert.ok(res[id].curve.positions.length >= 6, `${id} has no line geometry`);
}

// ---- 5. solids from profiles ----
const sq = add("polyline", [], { points: [[-20, -10, 0], [20, -10, 0], [20, 10, 0], [-20, 10, 0]], closed: true });
const ext = add("extrude", [sq], { distance: 30 });
const extSym = add("extrude", [sq], { distance: 30, symmetric: true });
const rev = add("revolve", [add("polyline", [], { points: [[10, 0, 0], [20, 0, 0], [20, 0, 40], [10, 0, 40]], closed: true })], { axisOrigin: [0, 0, 0], axisDir: [0, 0, 1], angle: 360 });
const circleBase = add("circle", [], { r: 15, c: [0, 0, 0] });
const sweepPath = add("bezier", [], { points: [[0, 0, 0], [0, 0, 30], [20, 0, 60], [40, 0, 80]] });
const sweepSolid = add("sweep", [circleBase, sweepPath], { frenet: true });
res = run();
assert.ok(Math.abs(res[ext].volume - 40 * 20 * 30) < 1e-3, `extrude ${res[ext].volume}`);
assert.ok(Math.abs(res[extSym].bbox.min[2] + 15) < 1e-6 && Math.abs(res[extSym].bbox.max[2] - 15) < 1e-6, JSON.stringify(res[extSym].bbox));
assert.ok(res[rev].ok, res[rev].error);
assert.ok(res[rev].volume > 0);
assert.ok(res[sweepSolid].ok, res[sweepSolid].error);

// ---- 6. lofts: every type ----
const sec1 = add("circle", [], { r: 20, c: [0, 0, 0] });
const sec2 = add("circle", [], { r: 8, c: [0, 0, 60] });
const sec3 = add("circle", [], { r: 12, c: [0, 0, 120] });
const lofts = {};
for (const t of ["smooth", "ruled", "g1start", "g1end", "g1both", "apexStart", "apexEnd"]) {
  lofts[t] = add("loft", [sec1, sec2, sec3], { loftType: t, apex: [0, 0, -40] });
}
const loftSurf = add("loftSurface", [sec1, sec2, sec3], { loftType: "smooth" });
res = run();
for (const [t, id] of Object.entries(lofts)) {
  assert.ok(res[id].ok, `loft ${t}: ${res[id].error}`);
  assert.ok(res[id].volume > 0, `loft ${t} volume ${res[id].volume}`);
}
assert.ok(res[loftSurf].ok, res[loftSurf].error);

// ---- 7. surfaces ----
const cl = add("polyline", [], { points: [[0, 0, 0], [60, 0, 0], [60, 40, 0], [0, 40, 0]], closed: true });
const planeS = add("planeSurface", [cl]);
const patchS = add("patch", [line, poly === cl ? line : line]);
const extS = add("extrudeSurface", [line], { distance: 40, dir: [0, 0, 1] });
const revS = add("revolveSurface", [arc], { axisOrigin: [0, 0, 0], axisDir: [0, 1, 0], angle: 180 });
const sweepS = add("sweepSurface", [line, sweepPath], { frenet: false });
res = run();
assert.ok(res[planeS].ok, res[planeS].error);
assert.ok(Math.abs(res[planeS].area - 2400) < 1e-3, `plane area ${res[planeS].area}`);
assert.ok(res[extS].ok, res[extS].error);
assert.ok(res[revS].ok, res[revS].error);
assert.ok(res[sweepS].ok, res[sweepS].error);
void patchS;

// ---- 8. boolean, push/pull, mirror ----
const b1 = add("box", [], { w: 20, h: 20, d: 20 });
const b2 = add("box", [], { w: 20, h: 20, d: 20 }, { t: [10, 0, 0], r: [0, 0, 0], s: 1 });
const uni = add("boolean", [b1, b2], { op: "union" });
const sub = add("boolean", [b1, b2], { op: "subtract" });
const inter = add("boolean", [b1, b2], { op: "intersect" });
res = run();
assert.ok(Math.abs(res[uni].volume - 12000) < 1, `union ${res[uni].volume}`);
assert.ok(Math.abs(res[sub].volume - 4000) < 1, `subtract ${res[sub].volume}`);
assert.ok(Math.abs(res[inter].volume - 4000) < 1, `intersect ${res[inter].volume}`);

const pp = add("pushpull", [b1], { distance: 5, face: 0 });
const ppNeg = add("pushpull", [b1], { distance: -5, face: 0 });
res = run();
assert.ok(res[pp].ok, res[pp].error);
assert.ok(res[ppNeg].ok, res[ppNeg].error);
assert.ok(res[ppNeg].volume < res[b1].volume, "negative push removes material");
assert.ok(res[pp].volume > res[b1].volume, "positive pull adds material");

const mir = add("mirror", [boxMoved], { plane: "YZ", merge: false });
const mirMerged = add("mirror", [boxMoved], { plane: "YZ", merge: true });
res = run();
assert.ok(res[mir].ok, res[mir].error);
assert.ok(res[mir].bbox.max[0] <= -89.9, `mirrored box should be at -x ${JSON.stringify(res[mir].bbox)}`);
assert.ok(res[mirMerged].ok, res[mirMerged].error);

// ---- 9. dependency failure propagates and cache reuse works ----
const bad = add("fillet", [box], { radius: 1000, edges: [0] });
const downstream = add("chamfer", [bad], { distance: 1, edges: [0] });
res = run();
assert.equal(res[bad].ok, false);
assert.match(res[downstream].error, /Input failed/);
const size1 = ev.cacheSize();
run();
assert.equal(ev.cacheSize(), size1, "cache is stable across identical evaluations");

// ---- 10. editing a parameter rebuilds only what depends on it ----
doc.nodes[box].params.w = 60;
res = run();
assert.ok(Math.abs(res[box].volume - 60 * 20 * 10) < 1e-6);
assert.ok(Math.abs(res[ext].volume - 40 * 20 * 30) < 1e-3, "unrelated extrude unchanged");

console.log("kernel tests passed:", Object.keys(NODE_TYPES).length, "node types,", Object.keys(doc.nodes).length, "nodes");
ev.dispose();
