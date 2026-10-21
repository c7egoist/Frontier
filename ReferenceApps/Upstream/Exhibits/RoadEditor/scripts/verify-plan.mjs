// Headless plan-mode check: boots the REAL createPlanView in jsdom with a
// RECORDING 2D context, draws a crossing project, and asserts the plan shows
// trimmed ribbons + a junction disc (not two overlapping ribbons). Then it
// simulates a drag and asserts the disc/RUN rendering follows.
import {JSDOM} from 'jsdom';
import {createStore, effectivePoints} from '../src/state.js';
import {newProject, defaultRoad} from '../src/io.js';
import {sampleRoad} from '../src/spline.js';
import {buildTopology} from '../src/topology.js';
import {createPlanView} from '../src/plan.js';

const dom = new JSDOM('<div id="wrap"><canvas id="plan"></canvas></div>', {pretendToBeVisual: true});
const {window} = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.requestAnimationFrame = (fn) => 0;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.Element.prototype.getBoundingClientRect = () => (
  {left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON() {}});

// ---- recording 2d context ----
function recordingCtx() {
  const calls = {fills: [], strokes: [], texts: [], arcs: []};
  const store = {};
  let path = [];
  const api = {
    canvas: null,
    get fillStyle() { return store.fillStyle; },
    set fillStyle(v) { store.fillStyle = v; },
    get strokeStyle() { return store.strokeStyle; },
    set strokeStyle(v) { store.strokeStyle = v; },
    set lineWidth(v) { store.lineWidth = v; },
    setLineDash() {}, setTransform() {},
    save() {}, restore() {}, translate() {}, rotate() {},
    beginPath() { path = []; },
    closePath() {},
    moveTo(x, y) { path.push([x, y]); },
    lineTo(x, y) { path.push([x, y]); },
    arc(x, y, r) { path.push([x, y, r]); calls.arcs.push({x, y, r, stroke: store.strokeStyle, fill: store.fillStyle}); },
    rect() {}, roundRect() {}, fillRect() {}, clearRect() {},
    fill() { calls.fills.push({style: store.fillStyle, path: path.slice()}); path = []; },
    stroke() { calls.strokes.push({style: store.strokeStyle, path: path.slice()}); path = []; },
    fillText(text, x, y) { calls.texts.push({text, x, y}); },
    measureText: () => ({width: 12}),
  };
  return {ctx: api, calls};
}
const rec = recordingCtx();
window.HTMLCanvasElement.prototype.getContext = function (t) {
  if (t !== '2d') return null;
  rec.ctx.canvas = this;
  return rec.ctx;
};

// ---- project: X crossing at origin ----
const p = newProject('x');
p.roads = [
  defaultRoad('r1', 1, {points: [{x: -40, z: 0, y: 0}, {x: 40, z: 0, y: 0}]}),
  defaultRoad('r2', 2, {points: [{x: 0, z: -40, y: 0}, {x: 0, z: 40, y: 0}]}),
];
const store = createStore(p);
const samples = new Map();
let topo = null;
const resample = () => {
  samples.clear();
  for (const road of store.project.roads) {
    samples.set(road.id, sampleRoad(effectivePoints(store.project, road), {closed: road.closed, step: 1}));
  }
  topo = buildTopology(store.project, samples);
};
store.subscribe((tag) => {
  if (tag === 'project' || tag === 'project-live') resample();
});
resample();

const canvas = window.document.getElementById('plan');
const plan = createPlanView(canvas, store, {
  getSamples: (id) => samples.get(id) || null,
  getIssues: () => [],
  getTerrain: () => null,
  getTopology: () => topo,
  toast: () => {},
  onCursor: () => {},
});
const s2w = plan.s2w;

function analyze(label) {
  rec.calls.fills.length = 0; rec.calls.strokes.length = 0;
  rec.calls.texts.length = 0; rec.calls.arcs.length = 0;
  plan.redraw();
  const discs = rec.calls.fills.filter((f) => f.style === 'rgba(38,40,45,.92)');
  const roadFills = rec.calls.fills.filter((f) => ['#43474e', '#33363c'].includes(f.style));
  // Closest approach of any road ribbon vertex to the crossing, in world metres.
  let minD = Infinity;
  for (const f of roadFills) {
    for (const [sx, sy] of f.path) {
      const w = s2w(sx, sy);
      const d = Math.hypot(w.x - crossAt.x, w.z - crossAt.z);
      if (d < minD) minD = d;
    }
  }
  const glyphs = rec.calls.texts.filter((t) => ['X', 'T', 'M', 'Y', 'L', '*', '?'].includes(t.text));
  // Fused patch: a pavement fill whose polygon CONTAINS the crossing.
  const pip = (poly, x, z) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  let patchCovers = false;
  for (const f of rec.calls.fills) {
    if (f.path.length < 3) continue;
    if (!['#43474e', 'rgba(0,0,0,.9)'].includes(f.style)) continue;
    const world = f.path.map(([sx, sy]) => { const w = s2w(sx, sy); return [w.x, w.z]; });
    if (pip(world, crossAt.x, crossAt.z) && f.style === '#43474e') patchCovers = true;
  }
  console.log(`${label}: patchCovers=${patchCovers} glyphs=${glyphs.map((g) => g.text).join(',') || '(none)'} ` +
    `roadFills=${roadFills.length} minRibbonDist=${minD.toFixed(2)}m topoIx=${topo.intersections.length} ` +
    `R=${topo.intersections[0] ? topo.intersections[0].radius.toFixed(1) : '-'}`);
  return {discs, glyphs, roadFills, minD, patchCovers};
}

let crossAt = {x: 0, z: 0};
const a1 = analyze('initial ');
// Simulate a drag: shift r2 east so the crossing moves to (10, 0).
for (const pt of store.project.roads[1].points) pt.x += 10;
crossAt = {x: 10, z: 0};
store.notify('project-live');
const a2 = analyze('dragged ');

const ok1 = a1.patchCovers && a1.glyphs.length === 1 && a1.minD > 9;
const ok2 = a2.patchCovers && a2.glyphs.length === 1 && a2.minD > 9;
console.log(ok1 && ok2 ? 'PLAN OK: fused patch + trimmed ribbons + badge, follows drags' : 'PLAN BROKEN');
process.exit(ok1 && ok2 ? 0 : 1);
