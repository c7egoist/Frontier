// Browser-tier smoke test: boots the REAL index.html shell inside jsdom and drives
// the store + panels + plan-view end to end (renders, selection matrix, every
// custom control, canvas pointer gestures, draw sessions, welding, terrain,
// exports). Canvas 2D is a Proxy stub, so drawing calls are absorbed but all
// interaction logic (hit-testing, snapping, state transitions) runs for real.
//
// jsdom is an OPTIONAL dev dependency: if it is not installed this file
// self-skips and `npm test` still passes. Enable with:
//     npm i --no-save jsdom && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let JSDOM = null;
let VirtualConsole = null;
try {
  ({ JSDOM, VirtualConsole } = await import('jsdom'));
} catch { /* optional tier — tests below self-skip */ }

test('browser smoke: full UI flow in jsdom', { skip: !JSDOM }, async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(e));

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:5174/',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;

  // ---- browser globals the app expects ----
  globalThis.window = window;
  globalThis.document = window.document;
  for (const k of ['Element', 'HTMLElement', 'SVGElement', 'Node', 'Event',
    'MouseEvent', 'KeyboardEvent', 'HTMLInputElement', 'HTMLCanvasElement',
    'HTMLImageElement', 'Image']) {
    if (window[k]) globalThis[k] = window[k];
  }
  globalThis.localStorage = window.localStorage;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  window.Element.prototype.getBoundingClientRect = () => (
    { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, x: 0, y: 0, toJSON() {} }
  );
  // Absorbing 2D context: every method is a noop, props are stored, image
  // buffers are real so ImageData read/write paths execute.
  window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== '2d') return null;
    const canvas = this;
    const store = {};
    return new Proxy(store, {
      get(t, prop) {
        if (prop === 'canvas') return canvas;
        if (prop === 'measureText') return () => ({ width: 12 });
        if (prop === 'createImageData') {
          return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        }
        if (prop === 'getImageData') {
          return (_x, _y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        }
        if (prop in t) return t[prop];
        return typeof prop === 'string' ? () => undefined : undefined;
      },
      set(t, prop, v) { t[prop] = v; return true; },
    });
  };
  // jsdom anchors would attempt navigation on export clicks — stub for the download path.
  if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:stub';
  if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};

  const { createStore } = await import('../src/state.js');
  const { buildTopology } = await import('../src/topology.js');
  const { starterProject, parseProject, createDemoHills, createGridSampler, serializeProject } = await import('../src/io.js');
  const { validateProject, summarize } = await import('../src/validate.js');
  const { createPlanView } = await import('../src/plan.js');
  const { createPanels } = await import('../src/panels.js');

  // ---- boot (mirrors main.js wiring) ----
  const store = createStore(starterProject());
  const env = {
    samples: {}, issues: [], summary: null, terrain: null,
  };
  // Real sampler for interaction tests (plan imports it internally for terrain
  // only, so tests that need samples compute them with the real function).
  const { sampleRoad } = await import('../src/spline.js');
  const { effectivePoints } = await import('../src/state.js');
  const resample = () => {
    const p = store.project;
    env.samples = new Map(p.roads.map((r) => [
      r.id, sampleRoad(effectivePoints(p, r), { closed: r.closed, step: 1.0 }),
    ]));
    env.topo = buildTopology(p, env.samples);
    env.issues = validateProject(p, env.topo);
    env.summary = summarize(p, env.samples, env.terrain);
  };
  resample();

  const calls = {};
  const api = {
    getSamples: (id) => env.samples.get(id) || null,
    getSampleMap: () => env.samples,
    getTopology: () => env.topo,
    getIssues: () => env.issues,
    getSummary: () => env.summary,
    getTerrain: () => env.terrain,
    plan: null, preview: null,
    toast: (m) => calls.toasted = m,
    newProject: () => { calls.newProject = true; },
    openProjectFile: () => { calls.openProjectFile = true; },
    saveProjectFile: () => { calls.saveProjectFile = true; },
    loadSample: (n) => { calls.loadSample = n; },
    importHeightFile: () => { calls.importHeightFile = true; },
    makeDemoHills: () => { calls.makeDemoHills = true; },
    clearTerrain: () => { calls.clearTerrain = true; },
    gotoIssue: (i) => { calls.gotoIssue = i; },
    gotoPoint: (r, ix) => { calls.gotoPoint = [r, ix]; },
    zoomRoad: (id) => { calls.zoomRoad = id; },
    startDrive: (id, leg) => { calls.startDrive = [id, leg]; },
    autosaveNote: () => { calls.autosaveNote = true; },
  };
  const planStubCalls = [];
  const previewStub = {
    refresh: () => planStubCalls.push('refresh'),
    resize: () => planStubCalls.push('resize'),
    resetCamera: () => planStubCalls.push('resetCamera'),
    screenshot: () => planStubCalls.push('screenshot'),
    toggleDrivePlay: () => true,
    setDriveSpeed: () => {},
    driving: false,
    stopDrive: () => {},
  };
  const panels = createPanels(store, api);
  api.preview = previewStub;
  const plan = createPlanView(document.getElementById('plan'), store, {
    getSamples: api.getSamples,
    getIssues: api.getIssues,
    getTerrain: api.getTerrain,
    getTopology: api.getTopology,
    toast: (m) => panels.toast(m),
    onCursor: (c) => panels.renderStatus(c),
  });
  api.plan = plan;
  store.subscribe(() => resample());
  const $ = (id) => document.getElementById(id);
  const redrawAll = () => {
    panels.renderLeft(); panels.renderInspector();
    panels.renderMetrics(); panels.renderStatus();
    panels.refreshHeader(); plan.redraw();
  };
  redrawAll();

  // ================= A. initial render =================
  assert.equal(document.querySelectorAll('.road-item').length, 3, 'three road rows');
  assert.equal(document.querySelectorAll('.issue-row').length, env.issues.length, 'issue rows match');
  assert.ok($('metrics').textContent.includes('m'), 'metrics show length');
  assert.ok($('statusbar').textContent.includes('SELECT'), 'status shows tool');
  assert.equal($('project-name').textContent, store.project.name, 'project name shown');
  assert.equal($('dirty-dot').hidden, true, 'starts clean');

  // ================= B. selection matrix =================
  store.select({ kind: 'road', roadId: 'r1' }); panels.renderInspector();
  assert.ok($('inspector').textContent.includes('Cross-section'), 'road inspector');
  store.select({ kind: 'point', roadId: 'r1', index: 0 }); panels.renderInspector();
  assert.ok($('inspector').textContent.includes('Point #1'), 'point inspector');
  assert.ok($('inspector').textContent.includes('Drape point'), 'point actions');
  assert.ok($('inspector').textContent.includes('Delete'), 'point delete');
  store.select({ kind: 'junction', junctionId: 'j4' }); panels.renderInspector();
  assert.ok($('inspector').textContent.includes('Position'), 'junction inspector');
  store.select(null); panels.renderInspector();
  assert.ok($('inspector').textContent.includes('Select a road'), 'empty inspector');

  // ================= C. every custom control commits =================
  store.select({ kind: 'road', roadId: 'r1' }); panels.renderInspector();
  // -- slider drag (Lanes) via synthetic pointer events
  const laneSlider = document.querySelector('#inspector .slider');
  assert.ok(laneSlider, 'lane slider exists');
  const down = new window.Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(down, { clientX: 600, clientY: 10, button: 0, pointerId: 7 });
  laneSlider.dispatchEvent(down);
  const move = new window.Event('pointermove', { bubbles: true, cancelable: true });
  Object.assign(move, { clientX: 900, clientY: 10, button: 0, pointerId: 7 });
  laneSlider.dispatchEvent(move);
  laneSlider.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
  panels.renderInspector(); panels.refreshHeader();
  const r1of = () => store.project.roads.find((r) => r.id === 'r1');
  assert.equal(r1of().lanes, 5, 'slider drag set lanes=5, got ' + r1of().lanes);
  assert.ok(store.canUndo(), 'slider drag checkpointed');
  assert.equal($('dirty-dot').hidden, false, 'dirty dot lights');
  store.undo(); panels.renderInspector();
  assert.equal(r1of().lanes, 2, 'slider drag undoes');
  // -- dropdown (Surface)
  const ddHead = [...document.querySelectorAll('#inspector .dd-head')]
    .find((el) => el.textContent.includes('Asphalt'));
  assert.ok(ddHead, 'surface dropdown found');
  ddHead.click();
  assert.equal($('popup-menu').hidden, false, 'dropdown opens');
  const opt = [...$('popup-menu').querySelectorAll('.mi')].find((m) => m.textContent.includes('Concrete'));
  opt.click();
  assert.equal(r1of().surface, 'concrete', 'dropdown picks concrete');
  assert.equal($('popup-menu').hidden, true, 'dropdown closes');
  // -- switch (kerb left)
  const kerbRow = [...document.querySelectorAll('#inspector .ctl-row')]
    .find((r) => r.textContent.includes('Kerb left'));
  kerbRow.querySelector('.switch').click();
  assert.equal(r1of().kerbL, true, 'switch toggles kerb');
  // -- segmented (centre marking)
  const segBtn = [...document.querySelectorAll('#inspector .seg-opt')]
    .find((b) => b.textContent.includes('Single solid'));
  segBtn.click();
  assert.equal(r1of().centerMarking, 'single', 'segment sets marking');
  // -- native color input behind the swatch
  const native = document.querySelector('#inspector input[type="color"]');
  assert.ok(native, 'color input exists');
  native.value = '#ff8800';
  native.dispatchEvent(new window.Event('input', { bubbles: true }));
  native.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(store.project.roads[0].color, '#ff8800', 'color commits');
  assert.ok(store.canUndo(), 'color drag undoable in one step, label=' + store.undoLabel());
  store.undo();
  assert.notEqual(store.project.roads[0].color, '#ff8800', 'color undoes');

  // ================= D. road list actions =================
  store.select(null); panels.renderLeft();
  const items = () => [...document.querySelectorAll('.road-item')];
  items()[1].click();
  assert.deepEqual(store.selection, { kind: 'road', roadId: 'r2', index: -1, junctionId: null }, 'click selects road');
  panels.renderLeft();
  // eye toggle
  [...items()[1].querySelectorAll('.mini-btn')].find((b) => b.title === 'Hide' || b.title === 'Show').click();
  assert.equal(store.project.roads[1].visible, false, 'eye hides road');
  store.undo(); panels.renderLeft();
  assert.equal(store.project.roads[1].visible, true, 'eye undoes');
  // duplicate then delete
  const n0 = store.project.roads.length;
  [...items()[0].querySelectorAll('.mini-btn')].find((b) => b.title === 'Duplicate').click();
  panels.renderLeft();
  assert.equal(store.project.roads.length, n0 + 1, 'duplicate adds road');
  [...items()[0].querySelectorAll('.mini-btn')].find((b) => b.title === 'Delete road').click();
  panels.renderLeft();
  assert.equal(store.project.roads.length, n0, 'delete removes road');
  store.undo(); panels.renderLeft();
  assert.equal(store.project.roads.length, n0 + 1, 'delete undoes');
  // double-click rename
  items()[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  const renameInput = items()[0].querySelector('.name input');
  assert.ok(renameInput, 'rename input appears');
  renameInput.value = 'Renamed road';
  renameInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  panels.renderLeft();
  assert.ok(store.project.roads.some((r) => r.name === 'Renamed road'), 'rename commits');

  // ================= E. toolbars + view =================
  document.querySelector('#plan-toolbar [data-tool="draw"]').click();
  assert.equal(store.tool, 'draw', 'toolbar sets draw tool');
  panels.refreshToolbars();
  assert.ok(document.querySelector('#plan-toolbar [data-tool="draw"]').classList.contains('sel'), 'tool btn active');
  document.querySelector('#plan-toolbar [data-tool="select"]').click();
  document.querySelector('#plan-toolbar [data-snap="grid"]').click();
  assert.equal(store.ui.snapGrid, false, 'snap toggle flips grid');
  panels.refreshToolbars();
  document.querySelector('#plan-toolbar [data-act="fit"]').click();
  // view segmented (mirrors main: store change + panels.refreshView)
  [...document.querySelectorAll('#view-seg button')].find((b) => b.textContent === 'Split').click();
  assert.equal(store.view, 'split', 'view seg sets split');
  panels.refreshView();
  assert.ok($('stage').classList.contains('view-split'), 'stage gets split class');
  store.setView('plan'); panels.refreshView();

  // ================= F. plan canvas gestures =================
  const canvas = $('plan');
  assert.ok(canvas, 'plan canvas exists');
  plan.fitAll(); plan.redraw();
  const pe = (type, x, y, extra = {}) => {
    const e = new window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, button: 0, pointerId: 1 }, extra);
    return e;
  };
  // -- click selects a control point, drag moves it (grid snap 1m)
  document.querySelector('#plan-toolbar [data-snap="grid"]').click();
  assert.equal(store.ui.snapGrid, true, 'snap toggle re-enables grid');
  panels.refreshToolbars();
  store.select(null);
  const p0 = store.project.roads.find((r) => r.id === 'r1').points[0];
  const p0x = p0.x, p0z = p0.z;
  const [sx, sy] = plan.w2s(p0.x, p0.z);
  const dragRoads = store.project.roads.length;
  canvas.dispatchEvent(pe('pointerdown', sx, sy));
  assert.deepEqual(store.selection, { kind: 'point', roadId: 'r1', index: 0, junctionId: null }, 'click grabs point, got ' + JSON.stringify(store.selection));
  canvas.dispatchEvent(pe('pointermove', sx + 40, sy + 40));
  canvas.dispatchEvent(pe('pointerup', sx + 40, sy + 40));
  const p0b = store.project.roads.find((r) => r.id === 'r1').points[0];
  assert.ok(p0b.x !== p0x || p0b.z !== p0z, 'drag moved the point');
  assert.equal(Number.isInteger(p0b.x) && Number.isInteger(p0b.z), true, 'drag snapped to 1m grid');
  assert.equal(store.project.roads.length, dragRoads, 'drag adds no roads');
  store.undo();
  // -- draw session: 3 clicks + Enter creates a road
  store.select({ kind: null });
  store.setTool('draw'); panels.refreshToolbars();
  const dn0 = store.project.roads.length;
  canvas.dispatchEvent(pe('pointerdown', 150, 150));
  canvas.dispatchEvent(pe('pointerup', 150, 150));
  canvas.dispatchEvent(pe('pointerdown', 250, 200));
  canvas.dispatchEvent(pe('pointerup', 250, 200));
  canvas.dispatchEvent(pe('pointerdown', 350, 150));
  canvas.dispatchEvent(pe('pointerup', 350, 150));
  assert.ok(plan.drawing, 'draw session active');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.ok(!plan.drawing, 'Enter finishes draw');
  assert.equal(store.project.roads.length, dn0 + 1, 'draw created a road');
  assert.equal(store.project.roads.at(-1).points.length, 3, 'draw road has 3 points');
  // -- Esc cancels a fresh draw (removes the road)
  store.setTool('draw');
  canvas.dispatchEvent(pe('pointerdown', 500, 500));
  canvas.dispatchEvent(pe('pointerup', 500, 500));
  assert.ok(plan.drawing, 'second draw active');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok(!plan.drawing, 'Esc ends draw');
  assert.equal(store.project.roads.length, dn0 + 1, 'Esc cancelled the new road');
  // -- undo is blocked while drawing (regression: draw-cancel accounting)
  store.setTool('draw');
  canvas.dispatchEvent(pe('pointerdown', 520, 520));
  canvas.dispatchEvent(pe('pointerup', 520, 520));
  const undoLabelBefore = store.undoLabel();
  $('btn-undo').click();
  assert.equal(store.undoLabel(), undoLabelBefore, 'undo blocked mid-draw');
  assert.equal($('toast').hidden, false, 'undo-block toasts');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  store.setTool('select');
  // -- Alt+click inserts a midpoint
  resample();
  const r1 = store.project.roads.find((r) => r.id === 'r1');
  const r1smp = env.samples.get('r1').samples;
  const r1pts = store.project.roads.find((r) => r.id === 'r1').points;
  // Pick a sample well clear of every control point so the click hits road body, not a node.
  let mid = r1smp[Math.floor(r1smp.length / 2)], midClear = 0;
  for (const smp of r1smp) {
    const clear = Math.min(...r1pts.map((q) => Math.hypot(q.x - smp.x, q.z - smp.z)));
    if (clear > midClear) { midClear = clear; mid = smp; }
  }
  assert.ok(midClear > 5, 'test setup: found sample clear of nodes, got ' + midClear.toFixed(1) + 'm');
  const [mx, my] = plan.w2s(mid.x, mid.z);
  const mCount = r1.points.length;
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Alt' }));
  canvas.dispatchEvent(pe('pointerdown', mx, my));
  canvas.dispatchEvent(pe('pointerup', mx, my));
  window.dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Alt' }));
  assert.equal(store.project.roads.find((r) => r.id === 'r1').points.length, mCount + 1, 'alt-click inserts');
  store.undo();
  // -- double-click extends the last selected road (selection was cleared)
  const r2 = store.project.roads.find((r) => r.id === 'r2');
  store.select({ kind: 'road', roadId: 'r2' });
  const r2End = r2.points.at(-1);
  const [ex, ey] = plan.w2s(r2End.x + 12, r2End.z + 8);
  const eCount2 = r2.points.length;
  canvas.dispatchEvent(pe('pointerdown', ex, ey));
  canvas.dispatchEvent(pe('pointerup', ex, ey));
  assert.equal(store.selection.kind, null, 'empty click clears selection');
  canvas.dispatchEvent(pe('dblclick', ex, ey));
  assert.equal(store.project.roads.find((r) => r.id === 'r2').points.length, eCount2 + 1, 'dblclick extends last road');
  store.undo();
  // -- wheel zooms (mapping changes)
  const before = plan.w2s(0, 0);
  canvas.dispatchEvent(pe('wheel', 600, 400, { deltaY: -120 }));
  const after = plan.w2s(0, 0);
  assert.ok(before[0] !== after[0] || before[1] !== after[1], 'wheel zoom changes mapping');
  // -- drag an endpoint onto another endpoint welds a junction
  const r2e = store.project.roads.find((r) => r.id === 'r2').points.at(-1);
  const r1s = store.project.roads.find((r) => r.id === 'r1').points[0];
  const [wx0, wy0] = plan.w2s(r2e.x, r2e.z);
  const [wx1, wy1] = plan.w2s(r1s.x, r1s.z);
  const j0 = store.project.junctions.length;
  canvas.dispatchEvent(pe('pointerdown', wx0, wy0));
  canvas.dispatchEvent(pe('pointermove', wx1, wy1));
  canvas.dispatchEvent(pe('pointerup', wx1, wy1));
  assert.equal(store.project.junctions.length, j0 + 1, 'endpoint drag welds junction');
  const jw = store.project.junctions.at(-1);
  assert.equal(jw.links.length, 2, 'weld links both roads');
  store.undo();
  assert.equal(store.project.junctions.length, j0, 'weld undoes');

  // ================= G. issues / projects / terrain buttons =================
  panels.renderLeft();
  const row = document.querySelector('.issue-row');
  if (row) {
    row.click();
    assert.ok(calls.gotoIssue, 'issue click calls gotoIssue');
  }
  document.querySelector('#plan-toolbar [data-tool="pan"]').click();
  panels.refreshToolbars();
  assert.equal(store.tool, 'pan', 'pan tool selectable');
  document.querySelector('#plan-toolbar [data-tool="select"]').click();
  // samples + terrain buttons call through
  [...document.querySelectorAll('.sample-card')][0].click();
  assert.ok(calls.loadSample, 'sample card calls loadSample');
  [...document.querySelectorAll('#left-panel button')].find((b) => b.textContent.includes('Demo hills')).click();
  assert.ok(calls.makeDemoHills, 'demo hills calls through');

  // ================= H. terrain phase: underlay + drape =================
  const tbounds = { minX: -160, maxX: 160, minZ: -160, maxZ: 160 };
  const { grid: tgrid, w: tw, h: th } = createDemoHills(tbounds, 64);
  env.terrain = createGridSampler(tgrid, tw, th, tbounds, 1);
  resample(); plan.redraw();
  assert.ok(true, 'redraw with terrain underlay runs');
  store.select({ kind: 'road', roadId: 'r1' }); panels.renderInspector();
  const r1yBefore = JSON.stringify(store.project.roads.find((r) => r.id === 'r1').points.map((p) => p.y));
  [...document.querySelectorAll('#inspector button')].find((b) => b.textContent.includes('Drape all')).click();
  const r1yAfter = JSON.stringify(store.project.roads.find((r) => r.id === 'r1').points.map((p) => p.y));
  assert.ok(r1yBefore !== r1yAfter, 'drape-all rewrites elevations');
  store.undo();

  // ================= I. exports execute =================
  const realClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = () => {};
  try {
    panels.exportJSON('t');
    panels.exportCSV('t');
    panels.exportOBJ('t', 1);
    const csv = (await import('../src/io.js')).centerlineCSV(store.project);
    assert.ok(csv.startsWith('road_id,road_name,s_m'), 'csv has header');
    const obj = (await import('../src/geometry.js')).roadNetworkToOBJ(store.project, { terrain: env.terrain });
    assert.ok(obj.includes('Frontier road network'), 'obj has frontier header');
    const json = serializeProject(store.project);
    assert.equal(parseProject(json).project.roads.length, store.project.roads.length, 'json round-trips');
  } finally {
    window.HTMLAnchorElement.prototype.click = realClick;
  }
  // export menu opens and closes
  $('btn-export').click();
  assert.equal($('export-menu').hidden, false, 'export menu opens');
  panels.closeMenu();
  assert.equal($('export-menu').hidden, true, 'export menu closes');

  // ================= J. drive capsule / help / toast / autosave =================
  panels.showDrive(true, 'Ridge Pass', true);
  assert.equal($('drive-capsule').hidden, false, 'drive capsule shows');
  assert.ok($('drive-capsule').textContent.includes('Ridge Pass'), 'capsule names road');
  panels.syncDrivePlay(false);
  assert.ok($('drive-capsule').querySelector('svg'), 'capsule icon renders');
  panels.showDrive(false);
  assert.equal($('drive-capsule').hidden, true, 'capsule hides');
  $('btn-help').click();
  assert.equal($('help').hidden, false, 'help opens');
  $('help-close').click();
  assert.equal($('help').hidden, true, 'help closes');
  panels.toast('hello smoke');
  assert.ok($('toast').textContent.includes('hello smoke'), 'toast shows');
  assert.equal(store.autosave(), true, 'autosave writes');
  const { loadAutosave } = await import('../src/state.js');
  assert.equal(loadAutosave().project.roads.length, store.project.roads.length, 'autosave round-trips');

  // ================= K. no jsdom errors =================
  assert.equal(errors.length, 0, 'zero jsdom errors, got: ' + errors.map(String).join(' | ').slice(0, 2000));
});
