// UI smoke test: boots FractureEditor.js inside jsdom and drives every path — object list, filters, search, enable,
// materials, sliders, presets, seed, impact drag + keys, storage mode, bake / stale / revert, SDF, undo / redo,
// card view, cross-window storage sync and the old `?object=` launch.  Layout and drawing are not checked.
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

w.Element.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, width: 1000, height: 640, right: 1000, bottom: 640 }; };
w.Element.prototype.setPointerCapture = function () {};
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'localStorage', 'location', 'history', 'URL', 'URLSearchParams']) {
  Object.defineProperty(globalThis, k, { value: w[k], configurable: true, writable: true });
}
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
  console.log('   rows:', qa('.obj-row').length, '| fracturing:', $('StatFracturing').textContent, '| need bake:', $('StatNeedBake').textContent, '| shards:', qa('#Stage .shard').length, '| pill:', pill());
  expect(qa('.obj-row').length === 8, 'object rows');
  expect(qa('#Stage .shard').length > 10, 'shards drawn');
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
  expect($('StageEmpty').hidden === false, 'ring gate shows empty state');
  console.log('   ring gate:', $('StageEmpty').textContent.slice(0, 60));
  click(q('[data-action="enable"]'));
  expect(FE().settings.get('ring-gate').Enabled, 'enabled from stage');
  console.log('   enabled ring gate:', $('StageEmpty').textContent.slice(0, 70), '| pieces', $('RPieces').textContent);
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
await step('impact: drag, keys, numeric, centre', async () => {
  const svg = $('Stage');
  svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 200 }));
  svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 320, clientY: 220 }));
  svg.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 330, clientY: 230 }));
  const s = stored('supply-crate').Settings;
  console.log('   dragged to', s.X, s.Y);
  expect(s.X < 0 && s.Y > 0, 'impact moved to upper-left');
  const undoDepth = FE().state && w.document.getElementById('UndoBtn').disabled === false;
  expect(undoDepth, 'drag recorded for undo');
  key('ArrowRight', { shiftKey: true }, svg);
  expect(stored('supply-crate').Settings.X > s.X, 'arrow nudges');
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
await step('shade modes + explode', async () => {
  for (const k of '123') { key(k); await sleep(1); }
  key('1');
  const ex = $('Explode'); ex.value = 0.8; ex.dispatchEvent(new w.Event('input'));
  expect(qa('#Stage .shard').length > 0, 'shards after explode');
  ex.value = 0; ex.dispatchEvent(new w.Event('input'));
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
