// UI smoke test: boots FractureEditor.js inside jsdom and drives every path — object list, filters, search, enable,
// materials, sliders, presets, seed, impact drag + keys, storage mode, bake / stale / revert, SDF, undo / redo,
// 3D viewport (WebGL mocked): piece meshes, click-to-place impact, marker drag, hover, explode, cutaway, drop test,
// card view, cross-window storage sync and the old `?object=` launch.  Layout and pixels are not checked.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/FractureEditor/Scripts/SmokeFractureEditor.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + '/'))('jsdom');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..') + '/';
const html = readFileSync(ROOT + 'index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const PREFIX = 'Frontier.Fracture.v2:';
// A recipe left behind by the old Project Zero editor must load untouched.
const legacy = { Owner: { Id: 'traffic-cone', Name: 'Traffic cone', Primitive: 'cone', Scale: [0.4, 0.7, 0.4] }, Settings: { Enabled: true, Mode: 'dynamic', PieceSdf: false, SdfResolution: 64, Material: 'plastic', Energy: 777, Seed: 5, Ceiling: 12, MinimumSize: 0.05, X: 0, Y: 0, Z: 0, EditedAt: 1 } };
const dom = new JSDOM(html, { url: 'http://localhost:8096/Experimental/FractureEditor/?object=window-pane', pretendToBeVisual: true });
const w = dom.window;
w.localStorage.setItem(PREFIX + 'traffic-cone', JSON.stringify(legacy));
const errors = [];
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e && e.stack || e)));
w.addEventListener('error', (e) => errors.push('window error: ' + (e.error && e.error.stack || e.message)));
const origError = console.error;
console.error = (...a) => errors.push('console.error: ' + a.map((x) => (x && x.stack) || String(x)).join(' '));

// ---------------------------------------------------------------- WebGL mock
const GL = { VERSION: 7938, SHADING_LANGUAGE_VERSION: 35724, FRAMEBUFFER_COMPLETE: 36053, ACTIVE_UNIFORMS: 35718, ACTIVE_ATTRIBUTES: 35721, MAX_TEXTURE_SIZE: 3379, MAX_SAMPLES: 36183 };
let constCounter = 50000;
const constMap = new Map();
function glMock(canvas) {
  const target = {
    canvas, drawingBufferWidth: 300, drawingBufferHeight: 150,
    getParameter(p) {
      if (p === GL.VERSION) return 'WebGL 2.0';
      if (p === GL.SHADING_LANGUAGE_VERSION) return 'WebGL GLSL ES 3.00';
      if (p === 2978 || p === 3088) return new Int32Array([0, 0, 300, 150]);
      return 16;
    },
    getShaderPrecisionFormat() { return { precision: 23, rangeMin: 127, rangeMax: 127 }; },
    getExtension(name) { return name === 'EXT_color_buffer_float' || name === 'WEBGL_lose_context' ? { loseContext() {} } : null; },
    getSupportedExtensions() { return []; },
    getContextAttributes() { return { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'default' }; },
    getShaderParameter() { return true; }, getProgramParameter(p, n) { return (n === GL.ACTIVE_UNIFORMS || n === GL.ACTIVE_ATTRIBUTES) ? 0 : true; },
    getShaderInfoLog() { return ''; }, getProgramInfoLog() { return ''; }, getShaderSource() { return ''; },
    checkFramebufferStatus() { return GL.FRAMEBUFFER_COMPLETE; },
    isContextLost() { return false; },
    getUniformLocation() { return {}; }, getAttribLocation() { return 0; }, getError() { return 0; },
    readPixels(x, y, wd, h, f, t, buf) { if (buf) buf.fill(0); },
    fenceSync() { return {}; }, clientWaitSync() { return 37149; },
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k)) { if (GL[k]) return GL[k]; if (!constMap.has(k)) constMap.set(k, constCounter++); return constMap.get(k); }
      if (typeof k === 'string' && k.startsWith('create')) return () => ({});
      return () => undefined;
    },
  });
}
function ctx2dMock(canvas) {
  const target = {
    canvas, measureText: (s) => ({ width: String(s).length * 6 }),
    createImageData: (a, b) => ({ width: a, height: b, data: new Uint8ClampedArray(a * b * 4) }),
    getImageData: (x, y, a, b) => ({ width: a, height: b, data: new Uint8ClampedArray(a * b * 4) }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({}),
    getTransform: () => ({ a: 1, d: 1 }),
  };
  return new Proxy(target, { get(t, k) { if (k in t) return t[k]; return () => undefined; }, set(t, k, v) { t[k] = v; return true; } });
}
w.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return (this._c2 ||= ctx2dMock(this));
  return (this._gl ||= glMock(this));
};
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
w.Element.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, width: 1000, height: 640, right: 1000, bottom: 640 }; };
w.Element.prototype.setPointerCapture = function () {};
w.Element.prototype.releasePointerCapture = function () {};
Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { get() { return this.closest('[hidden]') ? null : w.document.body; } });
Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 1000; } });
Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 640; } });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'localStorage', 'location', 'history', 'URL', 'URLSearchParams', 'requestAnimationFrame', 'cancelAnimationFrame', 'self', 'devicePixelRatio', 'addEventListener', 'removeEventListener']) {
  try { Object.defineProperty(globalThis, k, { value: k === 'self' ? w : typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? w[k].bind(w) : w[k], configurable: true, writable: true }); } catch { /* ignore */ }
}
globalThis.ResizeObserver = w.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { setTimeout(() => this.cb([]), 0); } disconnect() {} unobserve() {} };
w.navigator.clipboard ||= { writeText: async () => {} };
const PointerEvent = w.PointerEvent || class extends w.MouseEvent { constructor(t, o = {}) { super(t, o); this.pointerId = o.pointerId || 1; } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => w.document.getElementById(id);
const q = (sel, root = w.document) => root.querySelector(sel);
const qa = (sel, root = w.document) => [...root.querySelectorAll(sel)];
const click = (el) => { if (!el) throw new Error('click target missing'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const key = (k, opts = {}, target = w.document.body) => target.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
const setRange = (input, v, final = true) => { input.value = v; input.dispatchEvent(new w.Event('input', { bubbles: true })); if (final) input.dispatchEvent(new w.Event('change', { bubbles: true })); };
const setNum = (input, v) => { input.value = v; input.dispatchEvent(new w.Event('change', { bubbles: true })); };
const stored = (id) => JSON.parse(w.localStorage.getItem(PREFIX + id));
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const step = async (name, fn) => { const before = errors.length; try { await fn(); } catch (e) { errors.push(`[${name}] threw: ${e.stack}`); } console.log(`${errors.length > before ? 'FAIL' : ' ok '} ${name}`); };
const FE = () => w.FractureEditor;
const sel = () => FE().state.selected;
const pill = () => $('CrumbState').textContent;

await import(pathToFileURL(ROOT + 'FractureEditor.js'));
await sleep(20);

await step('boot honours ?object= and seeds storage', async () => {
  expect(sel() === 'window-pane', `selected ${sel()}`);
  const vp = FE().viewport;
  console.log('   rows:', qa('.obj-row').length, '| fracturing:', $('StatFracturing').textContent, '| need bake:', $('StatNeedBake').textContent, '| piece meshes:', vp.pieces.length, '| pill:', pill());
  expect(qa('.obj-row').length === 8, 'object rows');
  expect(vp.pieces.length > 10 && vp.pieces.length === +$('RPieces').textContent, 'piece meshes built');
  expect(stored('lobby-pillar').Settings.Baked, 'seeded bake');
});
await step('legacy Project Zero recipe loads untouched', async () => {
  click(q('[data-id="traffic-cone"]'));
  const s = FE().settings.get('traffic-cone');
  expect(s.Energy === 777 && s.Material === 'plastic' && s.Ceiling === 12, JSON.stringify(s));
  expect(q('.mat-tile.active').dataset.material === 'plastic', 'plastic tile active');
});
await step('select every object, notices for torus / mesh', async () => {
  for (const r of qa('.obj-row')) { click(r); await sleep(2); }
  click(q('[data-id="ring-gate"]'));
  expect($('StageEmpty').hidden === false, 'ring gate shows the off banner');
  expect(FE().viewport.pieces.length === 1, 'intact object shown when off');
  click(q('[data-action="enable"]'));
  expect(FE().settings.get('ring-gate').Enabled, 'enabled from the banner');
  console.log('   ring gate pieces:', FE().viewport.pieces.length, '| meta:', $('StageMeta').textContent);
  expect(FE().viewport.pieces.length > 2 && $('StageMeta').textContent.includes('convex'), 'torus fractures through convex wedges');
  click(q('[data-id="statue"]'));
  key('e');
  expect(FE().settings.get('statue').Enabled, 'E toggles');
  key('e');
});
await step('filters + search', async () => {
  click(q('#ObjectFilter [data-filter="bake"]'));
  console.log('   needs bake rows:', qa('.obj-row').length);
  click(q('#ObjectFilter [data-filter="on"]'));
  console.log('   on rows:', qa('.obj-row').length);
  click(q('#ObjectFilter [data-filter="all"]'));
  $('ObjectSearch').value = 'pill'; $('ObjectSearch').dispatchEvent(new w.Event('input'));
  expect(qa('.obj-row').length === 1, 'search filters');
  $('ObjectSearch').value = 'zzz'; $('ObjectSearch').dispatchEvent(new w.Event('input'));
  expect(q('.list-empty'), 'empty message');
  $('ObjectSearch').value = ''; $('ObjectSearch').dispatchEvent(new w.Event('input'));
});
await step('recipe: materials, energy, presets, seed, ceiling, min size', async () => {
  click(q('[data-id="supply-crate"]'));
  for (const t of qa('.mat-tile')) { click(t); await sleep(1); }
  expect(stored('supply-crate').Settings.Material === 'plastic', 'last tile stored');
  click(q('.mat-tile[data-material="concrete"]'));
  const energy = q('input[data-key="Energy"]');
  setRange(energy, 0.5, false);
  expect(q('input[data-key="Energy"]') === energy, 'slider survives live preview');
  setRange(energy, 0.5);
  console.log('   energy:', stored('supply-crate').Settings.Energy, '| out:', energy.parentElement.querySelector('output').textContent);
  click(qa('.presets button')[3]);
  expect(stored('supply-crate').Settings.Energy === 32000, 'blast preset');
  expect(qa('.presets button')[3].classList.contains('active'), 'preset highlighted');
  setNum(q('input[data-key="Seed"]'), 1234);
  expect(stored('supply-crate').Settings.Seed === 1234, 'seed');
  key('r');
  expect(stored('supply-crate').Settings.Seed !== 1234, 'reroll');
  setRange(q('input[data-key="Ceiling"]'), 10);
  console.log('   ceiling 10 → pieces', $('RPieces').textContent, '| limiter', q('.budget-row.win').dataset.limit);
  expect(q('.budget-row.win').dataset.limit === 'ceiling', 'ceiling wins');
  setRange(q('input[data-key="MinimumSize"]'), 0.3);
  expect(q('.budget-row.win').dataset.limit === 'size', 'size wins');
  setRange(q('input[data-key="Ceiling"]'), 160); setRange(q('input[data-key="MinimumSize"]'), 0.01);
});
await step('impact: click surface, marker drag, keys, numeric, centre', async () => {
  const vp = FE().viewport, canvas = $('Viewport');
  // Aim a ray at a known piece: stub the raycast so the surface point is deterministic.
  const piece = vp.pieces[vp.pieces.length - 1];
  const fakeHit = (x) => ({ object: piece, point: piece.localToWorld(new (piece.position.constructor)(0.01 * x / 100, 0, 0)) });
  const real = vp.hitAt.bind(vp);
  vp.hitAt = (x) => fakeHit(x);
  canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300, button: 0 }));
  canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 501, clientY: 300, button: 0 }));
  const s = stored('supply-crate').Settings, home = piece.userData.home;
  console.log('   clicked →', s.X, s.Y, s.Z, '| piece home', home.toArray().map((v) => +v.toFixed(3)).join(','));
  expect(Math.abs(s.Y - home.y) < 0.002 && Math.abs(s.Z - home.z) < 0.002, 'impact placed at the surface point (object space)');
  // Marker drag: grab the projected marker position.
  const [mx, my] = vp.markerScreen();
  canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: mx, clientY: my, button: 0 }));
  canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: mx + 30, clientY: my, buttons: 1 }));
  await sleep(40);
  canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: mx + 40, clientY: my, button: 0 }));
  expect(!$('UndoBtn').disabled, 'impact edits recorded for undo');
  // Hover shows the piece HUD with a halo material.
  canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 400, clientY: 300, buttons: 0 }));
  console.log('   hud:', $('PieceHud').textContent);
  expect(!$('PieceHud').hidden && vp.hovered >= 0, 'hover HUD');
  vp.hitAt = real;
  canvas.dispatchEvent(new w.Event('pointerleave'));
  const before = stored('supply-crate').Settings;
  key('ArrowRight', { shiftKey: true }, canvas);
  key('PageUp', {}, canvas);
  const after = stored('supply-crate').Settings;
  expect(after.X > before.X || after.X === 0.5, 'arrow nudges X');
  expect(after.Z > before.Z || after.Z === 0.5, 'page up nudges Z');
  setNum(q('.axis-z input'), 0.25);
  expect(stored('supply-crate').Settings.Z === 0.25, 'Z field');
  click(qa('.section-head .mini').find((b) => b.textContent === 'Centre'));
  const c = stored('supply-crate').Settings; expect(c.X === 0 && c.Y === 0 && c.Z === 0, 'centred');
});
await step('undo / redo per object', async () => {
  const before = FE().settings.get('supply-crate').X;
  setNum(q('.axis-x input'), 0.3);
  key('z', { ctrlKey: true });
  expect(FE().settings.get('supply-crate').X === before, 'undo');
  key('z', { ctrlKey: true, shiftKey: true });
  expect(FE().settings.get('supply-crate').X === 0.3, 'redo');
  click($('UndoBtn')); click($('RedoBtn'));
});
await step('shade modes, explode, cutaway, drop test, frame', async () => {
  const vp = FE().viewport;
  for (const k of '123') { key(k); await sleep(1); }
  const c2 = vp.pieces[0].material[0].color.getHexString();
  key('1');
  expect(vp.shade === 'material' && vp.pieces[0].material[0].color.getHexString() !== c2, 'shade recolours pieces');
  const ex = $('Explode'); ex.value = 0.8; ex.dispatchEvent(new w.Event('input'));
  const moved = vp.pieces.filter((m) => m.position.distanceTo(m.userData.home) > 1e-4).length;
  console.log('   exploded pieces moved:', moved, '/', vp.pieces.length);
  expect(moved > vp.pieces.length / 2, 'explode moves pieces');
  ex.value = 0; ex.dispatchEvent(new w.Event('input'));
  key('c');
  const hidden = vp.pieces.filter((m) => !m.visible).length;
  console.log('   cutaway hides', hidden, 'pieces');
  expect(hidden > 0 && hidden < vp.pieces.length, 'cutaway peels some pieces');
  key('c');
  expect(vp.pieces.every((m) => m.visible), 'cutaway off');
  key(' ');
  expect(vp.sim && $('SimBtn').classList.contains('on'), 'drop test running');
  await sleep(600);
  const fell = vp.sim.bodies.filter((b) => b.p.y < b.mesh.userData.home.y - 0.01).length;
  console.log('   drop test: fell', fell, '| t', vp.sim.t.toFixed(2));
  expect(fell > 0, 'pieces fall');
  expect(vp.sim.bodies.every((b) => b.p.y >= vp.sim.floor - 1e-6), 'pieces stay above the floor');
  key(' ');
  expect(!vp.sim && vp.pieces.every((m) => m.position.distanceTo(m.userData.home) < 1e-6), 'reassembled');
  key('f');
});
await step('baked: bake → ready → edit → stale diff → revert → ready', async () => {
  click(q('.mode-tile[data-mode="baked"]'));
  console.log('   pill:', pill());
  expect(pill() === 'Unbaked', 'unbaked');
  await FE().bake();
  expect(pill() === 'Baked', `ready after bake (got ${pill()})`);
  click(q('.mat-tile[data-material="glass"]'));
  expect(pill() === 'Stale', 'stale after edit');
  const diff = qa('.diff div').map((d) => d.textContent);
  console.log('   diff:', diff.join(' | '));
  expect(diff.some((d) => d.startsWith('Material')), 'diff lists material');
  click($('RevertBtn'));
  expect(pill() === 'Baked', 'revert makes it ready again');
  expect(F_sig_match(), 'stored signature matches');
});
function F_sig_match() { const s = stored('supply-crate').Settings; return s.Baked && JSON.parse(s.Baked.Signature).Recipe.Material === s.Material; }
await step('per-piece SDF + resolution, sdf pending → bake SDF', async () => {
  q('.recipe .switch:not(#EnableSwitch)') && null;
  const sdf = qa('.recipe .switch').find((x) => x.getAttribute('aria-label') === 'Per-piece SDF');
  sdf.checked = true; sdf.dispatchEvent(new w.Event('change'));
  expect(pill() === 'SDF pending', `sdf pending (got ${pill()})`);
  click(q('[data-res="128"]'));
  console.log('   memory:', q('.mem-rows').textContent);
  await FE().bake();
  expect(pill() === 'Baked', 'ready with SDF');
  click(q('[data-res="32"]'));
  expect(pill() === 'SDF pending', 'resolution change re-pends SDF only');
  key('b'); await sleep(900);
  expect(pill() === 'Baked', 'B key bakes');
});
await step('bake all', async () => {
  console.log('   need bake before:', $('StatNeedBake').textContent);
  await FE().bakeAll();
  expect($('StatNeedBake').textContent === '0', `need bake after: ${$('StatNeedBake').textContent}`);
});
await step('inspector card view', async () => {
  key('v');
  expect(!$('CardView').hidden && $('Work').classList.contains('card-mode'), 'card view shown');
  expect(q('.fx-card .card-preview img'), 'card preview is a viewport snapshot');
  console.log('   card:', q('.fx-card').textContent.replace(/\s+/g, ' ').slice(0, 110));
  click(q('.fx-card [data-mode="dynamic"]'));
  expect(FE().settings.get(sel()).Mode === 'dynamic', 'card mode switch');
  click(q('.fx-card [data-mode="baked"]'));
  click(q('[data-id="boulder"]'));
  if (q('[data-action="card-bake"]')) { click(q('[data-action="card-bake"]')); await sleep(800); }
  const cardSwitch = q('.fx-card .switch'); cardSwitch.checked = false; cardSwitch.dispatchEvent(new w.Event('change'));
  expect(!FE().settings.get('boulder').Enabled, 'card toggle');
  cardSwitch.checked = true; q('.fx-card .switch').checked = true; q('.fx-card .switch').dispatchEvent(new w.Event('change'));
  click(q('[data-action="card-open"]'));
  expect($('CardView').hidden, 'back to editor');
});
await step('storage event from another window', async () => {
  const id = sel(), next = { Owner: FE().objects.find((o) => o.owner.Id === id).owner, Settings: { ...FE().settings.get(id), Energy: 4321 } };
  const ev = new w.StorageEvent('storage', { key: PREFIX + id, newValue: JSON.stringify(next) });
  w.dispatchEvent(ev);
  expect(FE().settings.get(id).Energy === 4321, 'synced');
  expect(q('input[data-key="Energy"]').parentElement.querySelector('output').textContent === '4.32 kJ', 'UI shows synced energy');
  w.dispatchEvent(new w.StorageEvent('storage', { key: PREFIX + id, newValue: '{bad' }));
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'unrelated', newValue: '1' }));
});
await step('keyboard: shortcuts overlay, arrows, reset, copy', async () => {
  key('?'); expect(!$('KeysOverlay').hidden, 'overlay'); key('Escape'); expect($('KeysOverlay').hidden, 'closed');
  const before = sel(); key('ArrowDown'); console.log('   arrow:', before, '→', sel());
  click($('ResetRecipeBtn'));
  click($('CopyRecipeBtn'));
  await sleep(10);
});

await sleep(50);
console.error = origError;
console.log(`\n${errors.length} errors`);
for (const e of errors) console.log('-', e.split('\n').slice(0, 4).join('\n    ').slice(0, 700));
process.exit(errors.length ? 1 : 0);
