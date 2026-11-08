/* Headless smoke test: runs the whole app module in Node with a stubbed
 * WebGL context + DOM. Catches runtime JS errors without a GPU. */
import { createServer } from 'vite';
import fs from 'node:fs';

const GL_CONST = {
  VERSION: 7938, SHADING_LANGUAGE_VERSION: 35724, VENDOR: 7936, RENDERER: 7937,
  MAX_TEXTURE_SIZE: 3379, MAX_CUBE_MAP_TEXTURE_SIZE: 34076, MAX_TEXTURE_IMAGE_UNITS: 34930,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
  MAX_VERTEX_ATTRIBS: 34921, MAX_VERTEX_UNIFORM_VECTORS: 36347, MAX_FRAGMENT_UNIFORM_VECTORS: 36349,
  MAX_VARYING_VECTORS: 36348, MAX_SAMPLES: 36183, MAX_RENDERBUFFER_SIZE: 34024,
  SCISSOR_BOX: 3088, VIEWPORT: 2978, DEPTH_BITS: 3414, STENCIL_BITS: 3415,
  MAX_3D_TEXTURE_SIZE: 32883, MAX_ARRAY_TEXTURE_LAYERS: 35071, MAX_ELEMENTS_VERTICES: 33000,
  MAX_ELEMENTS_INDICES: 33001, MAX_UNIFORM_BUFFER_BINDINGS: 35375, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047,
  FRAMEBUFFER_COMPLETE: 36053, NO_ERROR: 0, TEXTURE0: 33984, ARRAY_BUFFER: 34962,
  RGBA: 6408, UNSIGNED_BYTE: 5121, FLOAT: 5126, TRIANGLES: 4, DEPTH_TEST: 2929,
  COLOR_ATTACHMENT0: 36064, FRAMEBUFFER: 36160, TEXTURE_2D: 3553,
};
const gl = new Proxy({}, {
  get(t, k) {
    if (k in GL_CONST) return GL_CONST[k];
    if (k === 'drawingBufferWidth' || k === 'drawingBufferHeight') return 1024;
    if (k === 'canvas') return null;
    if (k === 'getParameter') return (p) => {
      if (p === 7938) return 'WebGL 2.0 (stub)';       // VERSION
      if (p === 35724) return 'WebGL GLSL ES 3.00';     // SHADING_LANGUAGE_VERSION
      if (p === 7936 || p === 7937) return 'stub';      // VENDOR / RENDERER
      if (p === 3379 || p === 34024 || p === 34921 || p === 34930) return 4096;
      if (p === 35661) return 32;                       // MAX_COMBINED_TEXTURE_IMAGE_UNITS
      if (p === 36349 || p === 36348) return 1024;      // MAX_*_TEXTURE_SIZE
      if (p === GL_CONST.SCISSOR_BOX || p === GL_CONST.VIEWPORT) return new Int32Array([0, 0, 1024, 1024]);
      return 4;
    };
    if (k === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
    if (k === 'getSupportedExtensions') return () => [];
    if (k === 'getContextAttributes') return () => ({ alpha: true, antialias: true });
    if (k === 'checkFramebufferStatus') return () => 36053;
    if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
    if (k === 'getUniformLocation') return () => ({});
    if (k === 'createBuffer' || k === 'createTexture' || k === 'createFramebuffer' || k === 'createRenderbuffer' || k === 'createProgram' || k === 'createShader' || k === 'createVertexArray' || k === 'createSampler' || k === 'createQuery' || k === 'createTransformFeedback') return () => ({});
    if (k === 'getProgramInfoLog' || k === 'getShaderInfoLog') return () => '';
    if (k === 'getActiveUniform' || k === 'getActiveAttrib') return () => ({ name: 'u', type: 5126, size: 1 });
    if (k === 'getActiveUniforms') return () => [];
    if (k === 'getUniformBlockIndex') return () => 0;
    if (k === 'isContextLost') return () => false;
    if (k === 'getExtension') return () => ({
      loseContext() {}, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 1,
      framebufferTexture2DMultisampleEXT() {}, renderbufferStorageMultisampleEXT() {},
      COMPRESSED_RGBA_S3TC_DXT5_EXT: 1, UNSIGNED_NORMALIZED_EXT: 1,
    });
    if (k === 'getAttribLocation') return () => 0;
    if (k === 'getError') return () => 0;
    if (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k)) return 1;
    if (typeof k === 'string' && /^is[A-Z]/.test(k)) return () => false;
    return () => ({});
  },
});
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray((w || x) * (h || y) * 4), width: w || x, height: h || y });
    return () => {};
  },
});
const mkCanvas = () => ({
  width: 256, height: 256, style: {}, clientWidth: 800, clientHeight: 600,
  getContext: (type) => (type === '2d' ? ctx2d : gl),
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  setAttribute() {}, addEventListener() {}, removeEventListener() {},
  ownerDocument: globalThis.document,
  toDataURL: () => 'data:image/png;base64,',
});
const elements = {};
function mkEl(tag) {
  const el = {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild(c) { el.children.push(c); },
    setAttribute() {}, getAttribute: () => null, focus() {},
    querySelectorAll: () => [], querySelector: () => null,
    getContext: (t) => (t === '2d' ? ctx2d : gl),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    ownerDocument: null,
    width: 256, height: 256,
  };
  return el;
}
const doc = {
  createElement: (t) => (t === 'canvas' ? mkCanvas() : mkEl(t)),
  createElementNS: (ns, t) => (t === 'canvas' ? mkCanvas() : mkEl(t)),
  getElementById: (id) => (elements[id] ||= (() => { const e = mkEl('canvas'); e.ownerDocument = doc; return e; })()),
  querySelector: () => mkEl('div'),
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  body: mkEl('body'),
  documentElement: mkEl('html'),
};
for (const k of Object.keys(doc)) {
  if (typeof doc[k] === 'function' && k !== 'createElement' && k !== 'createElementNS') {
    doc[k] = doc[k].bind(doc);
  }
}
globalThis.document = doc;
globalThis.window = {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 2,
  addEventListener() {}, removeEventListener() {},
  requestAnimationFrame: (cb) => setTimeout(() => cb(performance.now()), 16),
  cancelAnimationFrame: () => {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  location: { href: 'http://localhost/', search: '' },
};
globalThis.self = globalThis;
try { Object.defineProperty(globalThis, "navigator", { value: { userAgent: "node", maxTouchPoints: 0 }, configurable: true }); } catch {}
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = () => {};
globalThis.setTimeout = setTimeout;
globalThis.Image = class { set src(v) { setTimeout(() => this.onload && this.onload(), 0); } };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };

const errors = [];
process.on('uncaughtException', (e) => errors.push(e));
process.on('unhandledRejection', (e) => errors.push(e));

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  await server.ssrLoadModule('/src/main.js');
  console.log('✔ main.js loaded without throwing');
} catch (e) {
  console.log('✘ FAILED:', e.message);
  console.log(e.stack.split('\n').slice(0, 6).join('\n'));
  errors.push(e);
}

// let a few frames run
await new Promise((r) => setTimeout(r, 900));
// only errors originating in OUR source matter; stub-GL noise is expected
const own = errors.filter((e) => {
  const st = e.stack || '';
  return /\/src\//.test(st) || /candy-dragon\/src/.test(st);
});
if (own.length) {
  console.log('✘ app-source errors:', own.length);
  for (const e of own.slice(0, 4)) {
    console.log('  ' + e.message);
    console.log('  ' + (e.stack || '').split('\n').find((l) => l.includes('/src/')));
  }
} else {
  console.log('✔ no errors from app source (' + errors.length + ' stub/GL noise ignored)');
}
await server.close();
process.exit(own.length ? 1 : 0);
