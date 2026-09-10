// Headless smoke test for viewer/app.js: stub DOM + null-GL (or no-GL), real backend.
//
// Usage (server must be running):
//   node tools/studio_smoke.js              # WebGL path, with derivatives ext
//   EXT=0 node tools/studio_smoke.js        # WebGL path, no derivatives ext
//   NOGL=1 node tools/studio_smoke.js       # no-WebGL fallback (2D preview) path
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const EXT = process.env.EXT !== '0';
const NOGL = process.env.NOGL === '1';
const BASE = process.env.STUDIO_URL || 'http://localhost:8123/';
const ROOT = path.dirname(__dirname);

/* ---------- null GL ---------- */
let attribN = 0;
const glStub = new Proxy({}, { get(t, p) {
  if (typeof p === 'string' && /^[A-Z][A-Z0-9_]*$/.test(p)) return 1;
  if (p === 'getShaderParameter' || p === 'getProgramParameter') return () => true;
  if (p === 'getShaderInfoLog' || p === 'getProgramInfoLog') return () => '';
  if (p === 'getAttribLocation') return () => attribN++;
  if (p === 'getUniformLocation') return () => ({});
  if (p === 'getExtension') return n => (n === 'OES_standard_derivatives' ? (EXT ? {} : null) : {});
  if (p === 'createShader' || p === 'createProgram' || p === 'createTexture' || p === 'createBuffer') return () => ({});
  return (...a) => {};
}});
const ctx2d = { fillStyle: '', createRadialGradient: () => ({ addColorStop() {} }),
  fillRect() {}, getImageData: () => ({ data: [], width: 256, height: 256 }) };

/* ---------- DOM stub ---------- */
function makeEl(tag, id) {
  const el = { tag, id: id || '', children: [], dataset: {}, style: { display: '' },
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false, src: '',
    width: 0, height: 0, clientWidth: 800, clientHeight: 600, className: '',
    classList: { _s: new Set(),
      toggle(c, f) { if (f === undefined) this._s.has(c) ? this._s.delete(c) : this._s.add(c);
        else f ? this._s.add(c) : this._s.delete(c); },
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); } },
    appendChild(c) { el.children.push(c); c.parent = el; return c; },
    addEventListener() {}, setPointerCapture() {}, click() {},
    querySelector() { const c = makeEl('x'); el.children.push(c); return c; },
    querySelectorAll(sel) { return docQuery(sel, el); },
    getContext(k) {
      if (k === '2d') return ctx2d;
      return NOGL ? null : glStub; // webgl2/webgl/experimental-webgl
    } };
  return el;
}
const IDS = ['gl','view','err','loader','loadMsg','stVerts','stTris','stH','stEuler','validBadge',
  'renderMode','presets','tabs','tab-gen','tab-wind','tab-lab','shapeControls','seed','dice','lod','genBtn',
  'wind','windVal','speed','speedVal','nrmStr','nrmVal','showGround','showBark','showLeaves',
  'wire','spin','dlGlb','dlObj','healthPct','healthBars','validRows','meshRows',
  'fallback','previewImg','fallbackNote','statusLine'];
const reg = {};
for (const id of IDS) reg[id] = makeEl('div', id);
for (let i = 0; i < 5; i++) reg.healthBars.appendChild(makeEl('span'));
for (const t of ['gen', 'wind', 'lab']) {
  const b = makeEl('button'); b.dataset.tab = t; reg.tabs.appendChild(b);
}
function deepInputs(el, out) {
  for (const c of el.children) {
    if (c.tag === 'input' && c.type === 'range') out.push(c);
    deepInputs(c, out);
  }
  return out;
}
function docQuery(sel, root) {
  if (sel === '#presets .preset') return reg.presets.children;
  if (sel === '#shapeControls input[type=range]') return deepInputs(root || reg.shapeControls, []);
  if (sel === '#tabs button') return reg.tabs.children;
  if (sel === '.tabpage') return [reg['tab-gen'], reg['tab-wind'], reg['tab-lab']];
  return [];
}
global.document = {
  getElementById: id => { if (!reg[id]) { reg[id] = makeEl('div', id); } return reg[id]; },
  createElement: t => makeEl(t),
  querySelectorAll: sel => docQuery(sel, null),
};
// cross-check: every id the app touches must exist in index.html
const html = fs.readFileSync(path.join(ROOT, 'viewer', 'index.html'), 'utf8');
for (const id of Object.keys(reg)) {
  if (!html.includes('id="' + id + '"')) throw new Error('id missing from index.html: ' + id);
}
global.window = { addEventListener() {} };
global.Image = class { set src(u) { this._src = u; if (this.onload) this.onload(); } };
global.ImageData = class { constructor(d, w, h) { this.data = d; } };
const pendingRAF = [];
global.requestAnimationFrame = cb => pendingRAF.push(cb);
global.devicePixelRatio = 1;
global.URL.createObjectURL = () => 'blob:x';
global.URL.revokeObjectURL = () => {};
const nodeFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url.startsWith('tree.json')) return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'viewer', 'tree.json'), 'utf8')) };
  if (url.startsWith('api/')) return nodeFetch(BASE + url, opts);
  throw new Error('unexpected fetch ' + url);
};

/* defaults mirroring index.html */
reg.seed.value = '1'; reg.lod.value = '2';
reg.wind.value = '0.6'; reg.speed.value = '1.0'; reg.nrmStr.value = '1.0';
reg.showGround.checked = reg.showBark.checked = reg.showLeaves.checked = true;
reg.spin.checked = true;

async function waitFor(fn, ms, what) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('timeout: ' + what);
}

(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'viewer', 'app.js'), 'utf8');
  vm.runInThisContext(src, { filename: 'app.js' });
  await waitFor(() => reg.shapeControls.children.length > 0, 15000, 'spec sliders');
  const nInputs = docQuery('#shapeControls input[type=range]').length;
  console.log(`boot OK (NOGL=${NOGL} EXT=${EXT}): presets=${reg.presets.children.length} sliders=${nInputs} stats=${reg.stVerts.textContent}/${reg.stTris.textContent}/${reg.stH.textContent} renderMode=${reg.renderMode.textContent} status=${reg.statusLine.textContent}`);
  if (reg.presets.children.length !== 4) throw new Error('preset count');
  if (nInputs !== 22) throw new Error('slider count ' + nInputs);
  if (reg.stVerts.textContent === '–' || reg.stVerts.textContent === '') throw new Error('stats empty');

  if (!NOGL) {
    if (pendingRAF.length < 1) throw new Error('no rAF scheduled');
    pendingRAF.shift()(1000); pendingRAF.shift()(1016);
    console.log('frames OK');
  } else {
    if (reg.fallback.style.display !== 'flex') throw new Error('fallback not shown');
    await waitFor(() => reg.previewImg.src !== '', 60000, 'preview img');
    console.log('fallback preview OK:', reg.previewImg.src);
    reg.err.textContent = ''; // sticky fallback notice is expected; clear for final assert
  }

  for (const b of reg.tabs.children) b.onclick();
  console.log('tabs OK');

  reg.seed.value = '7'; reg.lod.value = '2';
  reg.genBtn.onclick();
  await waitFor(() => reg.genBtn.disabled === false, 90000, 'generate');
  console.log(`generate OK: stats=${reg.stVerts.textContent}/${reg.stTris.textContent}/${reg.stH.textContent} badge=${reg.validBadge.textContent}`);
  if (NOGL) await waitFor(() => reg.previewImg.src !== '', 60000, 'preview after generate');

  reg.dlGlb.onclick();
  await waitFor(() => reg.genBtn.disabled === false, 90000, 'export');
  console.log('export OK');

  if (!NOGL && reg.err.textContent !== '') throw new Error('page error: ' + reg.err.textContent);
  console.log('SMOKE PASS (NOGL=' + NOGL + ' EXT=' + EXT + ')');
})().catch(e => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
