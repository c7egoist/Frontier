// ---------------------------------------------------------------------------
// editor-smoke.mjs — drives the REAL src/editor.js headlessly with a scripted
// fake viewport: draw flow, snapping, node/handle/spline drags, the junction
// SINGLE-handle drag (acceptance criterion), deselect-on-click, undo/redo,
// delete, keyboard, save/export. Run: node tests/editor-smoke.mjs
// ---------------------------------------------------------------------------
import { installGlobals, makeTester, StubEl } from './stubdom.mjs';

const G = installGlobals();
const { win, raf, storage, downloads } = G;

const THREE = await import('../vendor/three.module.min.js');
const { createEditor } = await import('../src/editor.js');

const { t, eq, group, summary } = makeTester('editor-smoke');

// --- scripted fake viewport ---------------------------------------------------
const gizmoCalls = [];
const camCalls = [];
const frameCalls = [];
let pickFn = () => ({ kind: 'empty' });
let gizmoFn = () => null;

const topDownRay = (x, y) => ({
  ray: new THREE.Ray(new THREE.Vector3(x, 100, y), new THREE.Vector3(0, -1, 0)),
  camera: { getWorldDirection: (v) => v.set(0, -1, 0) },
});

function makeFakeGizmo() {
  return {
    began: 0, ended: 0, part: null, nextTotal: null,
    beginDrag(part) { this.began++; this.part = part; return true; },
    dragMove() { return this.nextTotal; },
    endDrag() { this.ended++; },
  };
}

const viewport = {
  domElement: new StubEl('canvas'),
  setProject() {}, setSceneSettings() {}, setNetwork() {},
  setGizmo(target) { gizmoCalls.push(target); },
  pick: (x, y) => pickFn(x, y),
  gizmoAt: (x, y) => gizmoFn(x, y),
  rayFromClient: (x, y) => topDownRay(x, y),
  startCameraDrag: (x, y, b) => camCalls.push(['start', x, y, b]),
  moveCameraDrag: (x, y) => camCalls.push(['move', x, y]),
  endCameraDrag: () => camCalls.push(['end']),
  zoomAt: (x, y, d) => camCalls.push(['zoom', x, y, d]),
  frameAll: (b) => frameCalls.push(['all', b]),
  frameTop: () => frameCalls.push(['top']),
  frameIso: () => frameCalls.push(['iso']),
  frameFront: () => frameCalls.push(['front']),
  setSplit() {}, getSplit: () => 0.5, resize() {},
};
const lastGizmo = () => gizmoCalls[gizmoCalls.length - 1];

// --- boot ----------------------------------------------------------------------
let stateCalls = 0;
const editor = createEditor(viewport, { onState: () => { stateCalls++; } });
let st = editor.getState();

group('boot');
t('demo interchange loaded by default', st.project.splines.length === 6, st.project.splines.length);
t('demo builds 8 clean T-junctions', st.network.junctions.length === 8, st.network.junctions.length);
t('demo has spans + patches', st.network.spans.length >= 6 && st.stats.patches > 0, st.stats);
t('mode starts as select', st.mode === 'select');
t('onState fired during boot', stateCalls > 0);

// --- draw flow on an empty project ---------------------------------------------
editor.newProject(false);
raf.flush();
st = editor.getState();
group('draw flow');
t('new empty project has no splines', st.project.splines.length === 0);

editor.setMode('draw');
pickFn = () => ({ kind: 'ground', point: [10, 0.05, 10], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 10, clientY: 10 });
let R1 = editor.getState().project.splines[0];
t('first click creates a spline', !!R1);
eq('first node at click point', R1.nodes[0].position, [10, 0.05, 10]);
t('selection follows the new node', editor.getState().selection.kind === 'node');
t('active spline tracked', editor.getState().activeSplineId === R1.id);

pickFn = () => ({ kind: 'ground', point: [20, 0.05, 10], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 20, clientY: 10 });
pickFn = () => ({ kind: 'ground', point: [30, 0.05, 10], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 30, clientY: 10 });
R1 = editor.getState().project.splines[0];
t('three clicks -> three nodes', R1.nodes.length === 3, R1.nodes.length);
eq('node 2 position', R1.nodes[1].position, [20, 0.05, 10]);
eq('node 3 position', R1.nodes[2].position, [30, 0.05, 10]);

// --- curve snap while drawing onto ANOTHER road (exact T-join) -------------------
group('draw snap + T-junction by curve');
editor.setMode('draw');
pickFn = () => ({ kind: 'ground', point: [50, 0.05, 20], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 50, clientY: 20 });
st = editor.getState();
t('ground click with no active spline starts a new road', st.project.splines.length === 2, st.project.splines.length);
const R2 = st.project.splines.find((s) => s.id !== R1.id);
pickFn = () => ({ kind: 'ground', point: [25, 0.05, 10.8], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 25, clientY: 10.8 });
st = editor.getState();
const R2n = st.project.splines.find((s) => s.id === R2.id);
eq('draw snaps exactly onto the other road\'s centerline', R2n.nodes[1].position, [25, 0.05, 10]);
t('snap hint reports the curve snap', /curve/i.test(st.snapHint || ''), st.snapHint);
raf.flush();
st = editor.getState();
t('snapped end fuses into exactly one T-junction', st.network.junctions.length === 1, st.network.junctions.length);
t('T-junction has 3 arms', st.network.junctions[0].arms.length === 3, st.network.junctions[0].arms.length);
t('T-junction has 2+ anchors (single-handle refs)', st.network.junctions[0].anchors.length >= 2, st.network.junctions[0].anchors.length);

// --- start a third road sharing a mid-spline node (shared-node junction) ------------
group('shared-node junction');
editor.setMode('draw');
const nodeB = editor.getState().project.splines.find((s) => s.id === R1.id).nodes[1];
pickFn = () => ({ kind: 'node', splineId: R1.id, nodeId: nodeB.id, isEndpoint: false, view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 20, clientY: 10 });
st = editor.getState();
t('clicking a node in draw mode starts a new spline', st.project.splines.length === 3, st.project.splines.length);
const R3 = st.project.splines.find((s) => s.id !== R1.id && s.id !== R2.id);
eq('new spline shares the node position', R3.nodes[0].position, nodeB.position);
pickFn = () => ({ kind: 'ground', point: [20, 0.05, 25], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 20, clientY: 25 });
pickFn = () => ({ kind: 'ground', point: [35, 0.05, 25], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 35, clientY: 25 });
raf.flush();
st = editor.getState();
group('topology from drawing');
t('shared node adds a second junction (2 total)', st.network.junctions.length === 2, st.network.junctions.map((j) => j.position));
const nodeBId = nodeB.id;
const JB = st.network.junctions.find((j) => j.anchors.some((a) => a.splineId === R1.id && a.nodeId === nodeBId));
t('shared-node junction anchors on the shared node', !!JB, st.network.junctions.map((j) => j.anchors));
t('shared-node junction has 3 arms', JB && JB.arms.length === 3, JB && JB.arms.length);
t('shared-node junction has 2+ anchors', JB && JB.anchors.length >= 2, JB && JB.anchors.length);

// close the loop by clicking the far endpoint of the active spline
// (triangle so the closed ring does not overlap itself)
pickFn = () => ({ kind: 'node', splineId: R3.id, nodeId: R3.nodes[0].id, isEndpoint: true, view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 20, clientY: 10 });
st = editor.getState();
t('clicking the other endpoint closes the loop', st.project.splines.find((s) => s.id === R3.id).closed === true);
t('close loop returns to select mode', st.mode === 'select');

// --- direct node drag ------------------------------------------------------------
group('node drag');
editor.setMode('select');
const R3c = editor.getState().project.splines.find((s) => s.id === R3.id);
const N3 = R3c.nodes[R3c.nodes.length - 1];
const n3Start = [...N3.position];
const n3In = [...N3.handleIn];
const n3Out = [...N3.handleOut];
editor.select({ kind: 'node', splineId: R3.id, nodeId: N3.id });
pickFn = () => ({ kind: 'node', splineId: R3.id, nodeId: N3.id, isEndpoint: true, view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 35, clientY: 25 });
win.fire('pointermove', { clientX: 65, clientY: 45, ctrlKey: false });
win.fire('pointerup', {});
let n3 = editor.getState().project.splines.find((s) => s.id === R3.id).nodes.find((n) => n.id === N3.id);
eq('node follows the view-plane drag (+30, 0, +20)', n3.position, [n3Start[0] + 30, n3Start[1], n3Start[2] + 20]);
eq('handle-in shifts with the node', n3.handleIn, [n3In[0] + 30, n3In[1], n3In[2] + 20]);
eq('handle-out shifts with the node', n3.handleOut, [n3Out[0] + 30, n3Out[1], n3Out[2] + 20]);

// snap onto another node on release (exact joins)
viewport.domElement.fire('pointerdown', { button: 0, clientX: 65, clientY: 45 });
win.fire('pointermove', { clientX: 20.5, clientY: 25.4, ctrlKey: false });
win.fire('pointerup', {});
const R3d = editor.getState().project.splines.find((s) => s.id === R3.id);
n3 = R3d.nodes.find((n) => n.id === N3.id);
const N2 = R3d.nodes[1];
eq('release snaps the node exactly onto the target node', n3.position, N2.position);
raf.flush();

// --- THE junction single handle ---------------------------------------------------
group('junction single handle');
raf.flush();
st = editor.getState();
// the shared-node junction at B: identified by anchoring on R1's node B
const nodeBId2 = editor.getState().project.splines.find((s) => s.id === R1.id).nodes[1].id;
const J = st.network.junctions.find((j) => j.anchors.some((a) => a.splineId === R1.id && a.nodeId === nodeBId2));
t('found the shared-node junction at B', !!J, st.network.junctions.map((j) => j.anchors));
editor.select({ kind: 'junction', junctionId: J.id });
eq('gizmo sits at the junction center', lastGizmo().position, J.position);

const anchorPts = J.anchors.map((a) => {
  const s = st.project.splines.find((x) => x.id === a.splineId);
  const n = s.nodes.find((x) => x.id === a.nodeId);
  return { a, pos: [...n.position], hin: [...n.handleIn], hout: [...n.handleOut] };
});
t('junction has anchors to move', anchorPts.length >= 2, anchorPts.length);
// a bystander node that must NOT move
const R1now = st.project.splines.find((s) => s.id === R1.id);
const bystander = R1now.nodes[0];
const bystanderPos = [...bystander.position];

const fakeGizmo = makeFakeGizmo();
pickFn = () => ({ kind: 'gizmo', view: '3d' });
gizmoFn = () => ({ gizmo: fakeGizmo, part: 'move-x', ray: topDownRay(0, 0).ray, view: '3d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 400, clientY: 300 });
t('gizmo drag begins', fakeGizmo.began === 1);
fakeGizmo.nextTotal = [5, 0, 3];
win.fire('pointermove', { clientX: 430, clientY: 315, ctrlKey: false });
st = editor.getState();
let allMoved = true;
let handlesMoved = true;
for (const { a, pos, hin, hout } of anchorPts) {
  const s = st.project.splines.find((x) => x.id === a.splineId);
  const n = s.nodes.find((x) => x.id === a.nodeId);
  if (Math.abs(n.position[0] - (pos[0] + 5)) > 1e-6
    || Math.abs(n.position[1] - (pos[1] + 0)) > 1e-6
    || Math.abs(n.position[2] - (pos[2] + 3)) > 1e-6) allMoved = false;
  if (Math.abs(n.handleIn[0] - (hin[0] + 5)) > 1e-6 || Math.abs(n.handleIn[2] - (hin[2] + 3)) > 1e-6) handlesMoved = false;
  if (Math.abs(n.handleOut[0] - (hout[0] + 5)) > 1e-6 || Math.abs(n.handleOut[2] - (hout[2] + 3)) > 1e-6) handlesMoved = false;
}
t('ONE handle moves every anchor node of the joint', allMoved);
t('anchor handles move with the joint', handlesMoved);
const bystanderNow = editor.getState().project.splines.find((s) => s.id === R1.id).nodes[0];
eq('non-anchor nodes stay put', bystanderNow.position, bystanderPos);
win.fire('pointerup', {});
t('gizmo drag ends on release', fakeGizmo.ended === 1);
raf.flush();
st = editor.getState();
t('joint still fuses into a clean junction after the move', st.network.junctions.length >= 1, st.network.junctions.length);

// --- spline gizmo ------------------------------------------------------------------
group('spline gizmo');
editor.select({ kind: 'spline', splineId: R1.id });
st = editor.getState();
const R1s = st.project.splines.find((s) => s.id === R1.id);
const cx = R1s.nodes.reduce((a, n) => a + n.position[0], 0) / R1s.nodes.length;
const cz = R1s.nodes.reduce((a, n) => a + n.position[2], 0) / R1s.nodes.length;
eq('spline gizmo sits at the centroid', lastGizmo().position, [cx, 0.55, cz]);
const before = R1s.nodes.map((n) => [...n.position]);
const fakeG2 = makeFakeGizmo();
pickFn = () => ({ kind: 'gizmo', view: '3d' });
gizmoFn = () => ({ gizmo: fakeG2, part: 'move-x', ray: topDownRay(0, 0).ray, view: '3d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 400, clientY: 300 });
fakeG2.nextTotal = [2, 0, 0];
win.fire('pointermove', { clientX: 420, clientY: 300, ctrlKey: false });
win.fire('pointerup', {});
const after = editor.getState().project.splines.find((s) => s.id === R1.id).nodes;
let splineOk = true;
after.forEach((n, i) => {
  if (Math.abs(n.position[0] - (before[i][0] + 2)) > 1e-6
    || Math.abs(n.position[2] - before[i][2]) > 1e-6) splineOk = false;
});
t('spline handle translates every node', splineOk);

// --- handle (bezier) drag ------------------------------------------------------------
group('bezier handle drag');
const Ra = editor.getState().project.splines.find((s) => s.id === R1.id).nodes[0];
const haOut = [...Ra.handleOut];
const haPos = [...Ra.position];
pickFn = () => ({ kind: 'handle', splineId: R1.id, nodeId: Ra.id, which: 'out', view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 12, clientY: 10 });
win.fire('pointermove', { clientX: 15, clientY: 12, ctrlKey: false });
win.fire('pointerup', {});
const Ra2 = editor.getState().project.splines.find((s) => s.id === R1.id).nodes[0];
eq('handle drag moves only the handle', Ra2.handleOut, [15, haOut[1], 12]);
eq('node position untouched by handle drag', Ra2.position, haPos);

// --- deselect on clean ground click (regression: pendingDeselect) ---------------------
group('select-mode ground click');
editor.select({ kind: 'node', splineId: R1.id, nodeId: Ra.id });
pickFn = () => ({ kind: 'ground', point: [999, 0, 999], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 500, clientY: 500 });
win.fire('pointerup', {});
t('clean click on ground deselects', editor.getState().selection.kind === 'scene', editor.getState().selection);
editor.select({ kind: 'node', splineId: R1.id, nodeId: Ra.id });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 500, clientY: 500 });
win.fire('pointermove', { clientX: 600, clientY: 600, ctrlKey: false });
win.fire('pointerup', {});
t('dragging on ground keeps the selection', editor.getState().selection.kind === 'node', editor.getState().selection);

// --- camera drag ------------------------------------------------------------------------
group('camera drag');
camCalls.length = 0;
pickFn = () => ({ kind: 'ground', point: [0, 0, 0], view: '3d' });
viewport.domElement.fire('pointerdown', { button: 2, clientX: 100, clientY: 100 });
win.fire('pointermove', { clientX: 140, clientY: 130, ctrlKey: false });
win.fire('pointerup', {});
t('right-drag pans the camera', camCalls.some((c) => c[0] === 'start' && c[3] === 2)
  && camCalls.some((c) => c[0] === 'move') && camCalls.some((c) => c[0] === 'end'), camCalls);
camCalls.length = 0;
viewport.domElement.fire('wheel', { deltaY: 120, clientX: 10, clientY: 10 });
t('wheel zooms', camCalls.some((c) => c[0] === 'zoom'), camCalls);

// --- undo / redo ---------------------------------------------------------------------------
group('history');
const splinesBefore = editor.getState().project.splines.length;
editor.setMode('draw');
pickFn = () => ({ kind: 'ground', point: [100, 0.05, 100], view: '2d' });
viewport.domElement.fire('pointerdown', { button: 0, clientX: 100, clientY: 100 });
t('draw adds a spline', editor.getState().project.splines.length === splinesBefore + 1);
editor.undo();
t('undo removes it again', editor.getState().project.splines.length === splinesBefore, editor.getState().project.splines.length);
editor.redo();
t('redo restores it', editor.getState().project.splines.length === splinesBefore + 1);

// --- delete ----------------------------------------------------------------------------------
group('delete');
const R1e = editor.getState().project.splines.find((s) => s.id === R1.id);
editor.select({ kind: 'node', splineId: R1.id, nodeId: R1e.nodes[0].id });
editor.deleteSelected();
t('delete removes a node', editor.getState().project.splines.find((s) => s.id === R1.id).nodes.length === R1e.nodes.length - 1);
editor.select({ kind: 'spline', splineId: R1.id });
editor.deleteSelected();
t('delete removes a spline', !editor.getState().project.splines.some((s) => s.id === R1.id));

// --- keyboard -----------------------------------------------------------------------------------
group('keyboard');
const key = (k, mods = {}) => win.fire('keydown', { key: k, target: { tagName: 'CANVAS' }, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });
key('p'); t('P enters draw mode', editor.getState().mode === 'draw');
key('v'); t('V enters select mode', editor.getState().mode === 'select');
key('h'); t('H enters pan mode', editor.getState().mode === 'pan');
key('v');
const gridBefore = editor.getState().project.scene.showGrid;
key('g'); t('G toggles the grid', editor.getState().project.scene.showGrid === !gridBefore);
frameCalls.length = 0;
key('f'); t('F frames all', frameCalls.some((c) => c[0] === 'all'));
key('1'); t('1 frames iso', frameCalls.some((c) => c[0] === 'iso') && frameCalls.some((c) => c[0] === 'all'));
key('2'); t('2 frames top', frameCalls.some((c) => c[0] === 'top'));
key('3'); t('3 frames front', frameCalls.some((c) => c[0] === 'front'));
key('Escape'); t('Esc deselects', editor.getState().selection.kind === 'scene');
const splineCount = editor.getState().project.splines.length;
key('z', { ctrlKey: true });
t('Ctrl+Z undoes the last change', editor.getState().canRedo && editor.getState().project.splines.length !== splineCount,
  { before: splineCount, after: editor.getState().project.splines.length });
key('y', { ctrlKey: true });
t('Ctrl+Y redoes it', editor.getState().project.splines.length === splineCount, editor.getState().project.splines.length);

// --- save / export / import -----------------------------------------------------------------------
group('persistence + export');
editor.save();
t('save writes localStorage', !!storage.getItem('frontier-road-editor:v2'));
t('state reports saved', editor.getState().saved === true);
downloads.length = 0;
editor.exportObj();
t('OBJ export downloads a file', downloads.length === 1 && /\.obj$/.test(downloads[0].download), downloads);
downloads.length = 0;
editor.exportJson();
t('JSON export downloads a file', downloads.length === 1 && /\.road\.json$/.test(downloads[0].download), downloads);
const roundTrip = editor.getState().project;
await new Promise((resolve) => {
  editor.importJsonFile({ _content: JSON.stringify(roundTrip) });
  setTimeout(resolve, 10);
});
t('JSON import round-trips', editor.getState().project.splines.length === roundTrip.splines.length);

// --- demos ---------------------------------------------------------------------------------------------
group('demos');
editor.newProject('interchange');
raf.flush();
st = editor.getState();
t('interchange demo: 6 splines', st.project.splines.length === 6, st.project.splines.length);
t('interchange demo: 8 junctions (fixed exchange)', st.network.junctions.length === 8, st.network.junctions.length);
t('interchange demo: grade-separated crossing has no junction at origin',
  !st.network.junctions.some((j) => Math.hypot(j.position[0], j.position[2]) < 2),
  st.network.junctions.map((j) => j.position));
editor.newProject('harbour');
raf.flush();
st = editor.getState();
t('harbour demo has junctions', st.network.junctions.length >= 1, st.network.junctions.length);
editor.newProject(false);
raf.flush();
editor.addInterchangeHere();
raf.flush();
st = editor.getState();
t('addInterchangeHere inserts a working exchange (8 junctions)', st.network.junctions.length === 8, st.network.junctions.length);
t('every junction has 2+ anchors for the single handle',
  st.network.junctions.every((j) => j.anchors.length >= 2),
  st.network.junctions.map((j) => j.anchors.length));

summary();
