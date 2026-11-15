// UI smoke test: boots Main.js inside jsdom with mocked WebGL / 2D canvas / Workers (workers run in-process) and
// drives the main paths — boot, tree, channels, drawer, simulate, graph, add / duplicate / delete, compile, details
// edits, Geometry Compile (every step, bake all, exports, open as Blueprint), content actions, tabs, file import.
// Rendering itself is not checked (no GPU); this catches wiring and runtime errors.
//   npm install --prefix /tmp/smoke jsdom@25
//   JSDOM_DIR=/tmp/smoke node Experimental/ComponentViewer/Scripts/SmokeComponentViewer.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { JSDOM } = createRequire(pathToFileURL(resolve(process.env.JSDOM_DIR || process.cwd()) + '/'))('jsdom');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..') + '/';
const REPO = resolve(ROOT, '../..');
const html = readFileSync(ROOT + 'index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://localhost:8095/Experimental/ComponentViewer/', pretendToBeVisual: true });
const w = dom.window;
const errors = [];
process.on('unhandledRejection', (e) => { errors.push('unhandledRejection: ' + (e && e.stack || e)); });
w.addEventListener('error', (e) => errors.push('window error: ' + (e.error && e.error.stack || e.message)));
const origError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map((x) => (x && x.stack) || String(x)).join(' ')); };

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
w.HTMLCanvasElement.prototype.toBlob = (cb) => cb(new Blob(['x']));
w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
w.HTMLCanvasElement.prototype.releasePointerCapture = function () {};
w.Element.prototype.setPointerCapture ||= function () {};
w.Element.prototype.releasePointerCapture ||= function () {};
w.Element.prototype.hasPointerCapture ||= function () { return false; };
w.Element.prototype.scrollIntoView ||= function () {};
// Layout: give every element a plausible size.
Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { get() { return this.closest('[hidden]') ? null : w.document.body; } });
Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { get() { return 800; } });
Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { get() { return 600; } });
w.Element.prototype.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }; };
w.SVGElement.prototype.getBBox = function () { return { x: 0, y: 0, width: 100, height: 20 }; };
w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
const downloads = [];

// ---------------------------------------------------------------- Worker mock (in-process)
class FakeWorker {
  constructor(url) { this.url = String(url); }
  postMessage(data) {
    setTimeout(async () => {
      try {
        let result;
        if (this.url.includes('SdfWorker')) { const { bakeSdf } = await import(pathToFileURL(ROOT + 'Engine/SdfBake.js')); result = bakeSdf(data.request.positions, data.request.indices, { resolution: data.request.resolution, band: data.request.band }); }
        else { const { buildClusterHierarchy } = await import(pathToFileURL(ROOT + 'Engine/ClusterHierarchy.js')); result = buildClusterHierarchy(data.request.positions, data.request.indices, data.request.build); }
        this.onmessage({ data: { ticket: data.ticket, type: 'done', result } });
      } catch (e) { this.onmessage({ data: { ticket: data.ticket, type: 'error', message: e.message } }); }
    }, 0);
  }
  terminate() {}
}

// ---------------------------------------------------------------- globals
const keys = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLCanvasElement', 'HTMLInputElement', 'HTMLImageElement', 'Element', 'Node', 'Event', 'KeyboardEvent', 'MouseEvent', 'WheelEvent', 'DragEvent', 'CustomEvent',
  'DOMParser', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'SVGElement', 'Image', 'FileReader', 'DocumentFragment', 'localStorage', 'sessionStorage', 'matchMedia', 'innerWidth', 'innerHeight', 'File', 'DataTransfer', 'addEventListener', 'removeEventListener', 'devicePixelRatio', 'self', 'location', 'history'];
for (const k of keys) { try { if (w[k] !== undefined) Object.defineProperty(globalThis, k, { value: k === 'window' || k === 'self' ? w : (typeof w[k] === 'function' && !/^[A-Z]/.test(k) ? w[k].bind(w) : w[k]), configurable: true, writable: true }); } catch (e) { /* ignore */ } }
globalThis.PointerEvent = w.PointerEvent || class extends w.MouseEvent { constructor(t, o = {}) { super(t, o); this.pointerId = o.pointerId || 1; this.pointerType = 'mouse'; } };
w.PointerEvent = globalThis.PointerEvent;
globalThis.ResizeObserver = w.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { setTimeout(() => this.cb([]), 0); } disconnect() {} unobserve() {} };
globalThis.Worker = w.Worker = FakeWorker;
w.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.matchMedia = w.matchMedia;
globalThis.fetch = w.fetch = async (u) => {
  const url = new URL(u, w.location.href);
  const path = REPO + decodeURIComponent(url.pathname);
  const bytes = readFileSync(path);
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), text: async () => bytes.toString('utf8'), json: async () => JSON.parse(bytes) };
};
globalThis.ImageData = w.ImageData = class { constructor(d, a, b) { if (typeof d === 'number') { this.width = d; this.height = a; this.data = new Uint8ClampedArray(d * a * 4); } else { this.data = d; this.width = a; this.height = b ?? d.length / 4 / a; } } };
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
w.HTMLImageElement.prototype.decode = async function () {};
// Fire image onload for data URLs.
const imgSrc = Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, 'src');
Object.defineProperty(w.HTMLImageElement.prototype, 'src', { get() { return imgSrc.get.call(this); }, set(v) { imgSrc.set.call(this, v); setTimeout(() => { this.onload && this.onload(); this.dispatchEvent(new w.Event('load')); }, 0); } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => w.document.getElementById(id);
const click = (el) => { if (!el) throw new Error('click target missing'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const key = (k, opts = {}) => w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
const step = async (name, fn) => { const before = errors.length; try { await fn(); } catch (e) { errors.push(`[${name}] threw: ${e.stack}`); } console.log(`${errors.length > before ? 'FAIL' : ' ok '} ${name}`); };

await import(pathToFileURL(ROOT + 'Main.js'));
for (let i = 0; i < 100 && !$('Boot').classList.contains('done') && !$('Boot').classList.contains('failed'); i++) await sleep(100);

await step('boot', async () => {
  console.log('   boot:', $('Boot').className, '|', $('BootText').textContent);
  console.log('   title:', $('BpTitle').textContent, '|', $('BpSubtitle').textContent, '| tabs:', $('BlueprintTabs').children.length, '| rows:', $('ComponentTree').querySelectorAll('.comp-row').length, '| comps:', $('StatComponents').textContent, '| tris:', $('StatTriangles').textContent);
  if (!$('Boot').classList.contains('done')) throw new Error('boot did not finish');
});
await step('select tree rows & details', async () => {
  const rows = [...$('ComponentTree').querySelectorAll('.comp-row')];
  for (const r of rows) { click(r); await sleep(5); }
  console.log('   details sections:', $('Details').querySelectorAll('.detail-section').length, '| head:', ($('Details').querySelector('.name-input') || {}).value);
});
await step('channels 1-7', async () => { for (const k of '1234567') { key(k); await sleep(20); } key('1'); console.log('   legend:', $('Legend').textContent.slice(0, 60)); });
await step('drawer compiled + curves', async () => {
  click($('DrawerHandle')); await sleep(20);
  console.log('   drawer open:', $('Drawer').classList.contains('open'), '| cards:', $('DrawerBody').querySelectorAll('.baked-card').length);
  click(w.document.querySelector('[data-drawer=curves]')); await sleep(20);
  console.log('   curve canvas:', !!$('DrawerBody').querySelector('canvas'));
  click(w.document.querySelector('[data-drawer=compiled]'));
});
await step('simulate', async () => {
  click($('SimulateBtn')); await sleep(300);
  console.log('   hud hidden:', $('SimHud').hidden, '| speed:', $('SimSpeed').textContent, '| rpm:', $('SimRpm').textContent);
  click($('SimulateBtn'));
});
await step('graph mode', async () => {
  const modes = [...$('CentreModes').querySelectorAll('button')];
  console.log('   centre modes:', modes.map((b) => b.textContent).join(','));
  click(modes[1]); await sleep(30);
  console.log('   nodes:', $('Graph').querySelectorAll('.gnode').length, '| pane hidden:', $('GraphPane').hidden);
  click(modes[0]);
});
await step('add component menu', async () => {
  click($('AddComponentBtn')); await sleep(10);
  const items = $('AddList').querySelectorAll('.menu-item');
  console.log('   menu items:', items.length);
  const pl = [...items].find((b) => /Point Light/.test(b.textContent));
  click(pl); await sleep(20);
  console.log('   comps after add:', $('StatComponents').textContent, '| state:', $('BpState').textContent);
});
await step('duplicate / delete / frame / grid', async () => {
  key('d', { ctrlKey: true }); await sleep(10);
  console.log('   after dup:', $('StatComponents').textContent);
  key('Delete'); await sleep(10);
  console.log('   after del:', $('StatComponents').textContent);
  key('f'); key('g'); await sleep(10);
});
await step('compile blueprint', async () => { click($('CompileBpBtn')); await sleep(300); console.log('   state:', $('BpState').textContent); });
await step('details edits (vec3, range, toggle, select)', async () => {
  const rows = [...$('ComponentTree').querySelectorAll('.comp-row')];
  click(rows[1]); await sleep(10);
  const inputs = [...$('Details').querySelectorAll('input, select')];
  let n = 0;
  for (const inp of inputs) {
    if (inp.type === 'range') { inp.value = inp.max; inp.dispatchEvent(new w.Event('input', { bubbles: true })); n++; }
    else if (inp.type === 'checkbox') { inp.checked = !inp.checked; inp.dispatchEvent(new w.Event('change', { bubbles: true })); n++; }
    else if (inp.tagName === 'SELECT' && inp.options.length > 1) { inp.selectedIndex = 1; inp.dispatchEvent(new w.Event('change', { bubbles: true })); n++; }
    else if (inp.type === 'text' && inp.closest('.axis')) { inp.value = '1.5'; inp.dispatchEvent(new w.Event('change', { bubbles: true })); n++; }
  }
  console.log('   inputs touched:', n);
});
await step('root details', async () => { click($('ComponentTree').querySelector('.comp-row')); await sleep(10); console.log('   root sections:', $('Details').querySelectorAll('.panel').length); });
await step('content tab + sample → Geometry Compile', async () => {
  click(w.document.querySelector('[data-left=content]')); await sleep(10);
  console.log('   content:', $('ContentCount').textContent, '| samples:', $('SampleList').children.length, '| formats:', $('ImportFormats').textContent.slice(0, 60));
  const sample = $('SampleList').querySelector('button');
  click(sample); await sleep(50);
  for (let i = 0; i < 100 && /…|ing/.test($('CompileStatus').textContent); i++) await sleep(50);
  console.log('   compile hidden:', $('Compile').hidden, '| status:', $('CompileStatus').textContent, '| steps:', $('StepList').children.length, '| count:', $('CompileStepCount').textContent);
});
await step('compile: visit every step + preview modes', async () => {
  const steps = [...$('StepList').querySelectorAll('.step-row')];
  for (const s of steps) {
    click(s); await sleep(10);
    const modes = [...$('PreviewModes').querySelectorAll('button')];
    for (const m of modes) { click(m); await sleep(5); }
    console.log(`   ${s.querySelector('b')?.textContent}: settings panels ${$('StepSettings').querySelectorAll('.panel').length}, modes ${modes.length}`);
  }
});
await step('compile all + open', async () => {
  click($('CompileRunAll'));
  for (let i = 0; i < 200; i++) { await sleep(50); if (/compiled|ready|done/i.test($('CompileStatus').textContent)) break; }
  console.log('   status:', $('CompileStatus').textContent, '| total:', $('CompileTotal').textContent, '| mem:', $('CompileMemory').textContent);
  for (const s of $('StepList').querySelectorAll('.step-row')) {
    click(s); await sleep(5);
    for (const b of $('StepSettings').querySelectorAll('button')) if (/export|download|obj|svg|r32|png/i.test(b.textContent)) { click(b); await sleep(5); }
  }
  console.log('   downloads:', downloads.join(', '));
  click($('CompileOpen')); await sleep(200);
  console.log('   compile hidden:', $('Compile').hidden, '| title:', $('BpTitle').textContent, '| tabs:', $('BlueprintTabs').children.length, '| content:', $('ContentCount').textContent);
});
await step('content row actions', async () => {
  const row = $('ContentList').querySelector('.content-row');
  const acts = row ? [...row.querySelectorAll('.content-actions button')] : [];
  console.log('   actions:', acts.map((b) => b.textContent).join(','));
  if (acts[0]) { click(acts[0]); await sleep(20); }
  console.log('   comps:', $('StatComponents').textContent);
  if (acts[2]) { click(acts[2]); await sleep(100); console.log('   recompile open:', !$('Compile').hidden); click($('CompileCancel')); await sleep(50); }
});
await step('switch tabs and close', async () => {
  const tabs = [...$('BlueprintTabs').querySelectorAll('.document-tab')];
  click(tabs[0]); await sleep(30);
  console.log('   title:', $('BpTitle').textContent);
  const close = $('BlueprintTabs').querySelectorAll('.tab-close');
  if (close.length > 1) { click(close[close.length - 1]); await sleep(20); }
  console.log('   tabs:', $('BlueprintTabs').children.length);
});
await step('import file (OBJ via FileInput)', async () => {
  const obj = 'v -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nv 0 1.5 0\nf 1 2 3 4\nf 1 5 2\nf 2 5 3\nf 3 5 4\nf 4 5 1\n';
  const file = new w.File([obj], 'Pyramid.obj');
  file.arrayBuffer = async () => new TextEncoder().encode(obj).buffer;
  Object.defineProperty($('FileInput'), 'files', { value: [file], configurable: true });
  $('FileInput').dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(500);
  console.log('   compile open:', !$('Compile').hidden, '| file:', $('CompileFile').textContent, '| status:', $('CompileStatus').textContent);
  key('Escape'); await sleep(50);
  console.log('   after esc hidden:', $('Compile').hidden);
});

await sleep(200);
console.error = origError;
console.log(`\n${errors.length} errors · downloads ${downloads.length}`);
const seen = new Set();
for (const e of errors) { const k = e.replace(/console.error: Error: Uncaught \[/, 'window error: ').split('\n').slice(0, 3).join(' | '); if (k.startsWith('console.error: Error: Uncaught')) continue; if (seen.has(k)) continue; seen.add(k); console.log('-', e.split('\n').slice(0, 4).join('\n    ').slice(0, 700)); }
process.exit(errors.length ? 1 : 0);
