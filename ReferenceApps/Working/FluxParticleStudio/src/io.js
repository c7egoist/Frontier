/* Flux I/O — composition JSON codec, PNG/WebM export, downloads. */
import {defaultComp, defaultLayer} from './state.js';
import {SHAPES} from './shaders.js';

export const FLUX_FORMAT = 'flux-comp';
export const FLUX_VERSION = 1;

const num = (v, d, lo = -1e9, hi = 1e9) => {
  const n = +v;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const HEX = /^#[0-9a-fA-F]{6}$/;
const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);

function sanitizeLayer(raw, i, warnings) {
  const d = defaultLayer(`l${i + 1}`, i + 1);
  const r = (raw && typeof raw === 'object') ? raw : {};
  const E = r.emitter || {}, F = r.forces || {}, K = r.look || {}, B = r.burst || {};
  const vec = (v, dd, n, lo, hi) => {
    const a = Array.isArray(v) ? v : dd;
    return Array.from({length: n}, (_, k) => num(a[k], dd[k], lo, hi));
  };
  return {
    id: typeof r.id === 'string' && r.id ? r.id : d.id,
    name: typeof r.name === 'string' && r.name ? String(r.name).slice(0, 48) : d.name,
    visible: r.visible !== false,
    opacity: num(r.opacity, 1, 0, 1),
    seed: Math.abs(Math.round(num(r.seed, (Math.random() * 1e9) | 0))) || 1,
    emitter: {
      shape: SHAPES.includes(E.shape) ? E.shape : 'sphere',
      count: Math.round(num(E.count, 6000, 100, 20000)),
      life: num(E.life, 4, 0.2, 30),
      speed: num(E.speed, 3, 0, 30),
      spread: num(E.spread, 0.6, 0, 3),
      dir: vec(E.dir, [0, 1, 0], 3, -1, 1),
      pos: vec(E.pos, [0, 0, 0], 3, -200, 200),
      radius: num(E.radius, 3, 0.1, 60),
      length: num(E.length, 10, 0.1, 200),
      width: num(E.width, 8, 0.1, 200),
      height: num(E.height, 2, 0.1, 200),
      depth: num(E.depth, 8, 0.1, 200),
    },
    forces: {
      gravity: num(F.gravity, -2, -30, 30),
      wind: vec(F.wind, [0, 0], 2, -20, 20),
      turbAmp: num(F.turbAmp, 1.2, 0, 10),
      turbScale: num(F.turbScale, 0.35, 0.02, 4),
      turbSpeed: num(F.turbSpeed, 0.7, 0, 6),
    },
    look: {
      shape: K.shape === 'cube' ? 'cube' : 'shard',
      tumble: num(K.tumble, 1.2, 0, 8),
      size0: num(K.size0, 0.22, 0.01, 4),
      size1: num(K.size1, 0.1, 0.01, 4),
      stretch: num(K.stretch, 1.5, 0, 8),
      bright: num(K.bright, 1.4, 0, 5),
      colA: col(K.colA, '#7ee7ff'), colB: col(K.colB, '#b78cff'), colC: col(K.colC, '#f6c66a'),
      colBias: num(K.colBias, 0.5, 0.05, 0.95),
      blending: K.blending === 'normal' ? 'normal' : 'add',
    },
    burst: {
      on: !!B.on,
      time: num(B.time, 2, 0, 30),
      power: num(B.power, 10, 0, 40),
    },
  };
}

export function parseComposition(text) {
  const warnings = [];
  let raw;
  try { raw = JSON.parse(text); }
  catch { throw new Error('Not valid JSON.'); }
  if (!raw || typeof raw !== 'object') throw new Error('Empty composition.');
  if (raw.format && raw.format !== FLUX_FORMAT) warnings.push(`format “${raw.format}” — attempted repair`);
  const dc = defaultComp();
  const c = (raw.comp && typeof raw.comp === 'object') ? raw.comp : {};
  const comp = {
    name: typeof c.name === 'string' && c.name ? String(c.name).slice(0, 64) : dc.name,
    duration: num(c.duration, 8, 1, 30),
    background: col(c.background, dc.background),
    bloom: {
      on: c.bloom?.on !== false,
      strength: num(c.bloom?.strength, 0.9, 0, 3),
      radius: num(c.bloom?.radius, 0.55, 0, 1.5),
      threshold: num(c.bloom?.threshold, 0, 0, 1),
    },
    trails: {
      on: c.trails?.on !== false,
      damp: num(c.trails?.damp, 0.88, 0.4, 0.99),
    },
  };
  const rawLayers = Array.isArray(raw.layers) ? raw.layers : [];
  if (!rawLayers.length) warnings.push('no layers — started with a fresh emitter');
  const layers = (rawLayers.length ? rawLayers : [{}]).slice(0, 24).map((r, i) => sanitizeLayer(r, i, warnings));
  const seen = new Set();
  layers.forEach((l, i) => {
    if (seen.has(l.id)) l.id = `l${i + 1}x`;
    seen.add(l.id);
  });
  return {doc: {comp, layers, nextId: layers.length + 1, selected: layers[0].id}, warnings};
}

export function serialize(store) {
  return JSON.stringify({format: FLUX_FORMAT, version: FLUX_VERSION,
    comp: store.comp, layers: store.layers}, null, 1);
}

export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

export function downloadText(text, filename) {
  downloadBlob(new Blob([text], {type: 'application/json'}), filename);
}

let recording = null;
/** Record exactly one loop to WebM. Returns a promise of the Blob. */
export function recordLoop(engine, hooks = {}) {
  if (recording) return Promise.resolve(null);
  const stream = engine.canvas.captureStream(60);
  const mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mimeType = mimes.find((m) => window.MediaRecorder?.isTypeSupported(m)) || '';
  let rec;
  try {
    rec = new MediaRecorder(stream, mimeType ? {mimeType, videoBitsPerSecond: 14_000_000} : undefined);
  } catch (e) {
    return Promise.reject(new Error('Recording is not supported in this browser.'));
  }
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const done = new Promise((resolve) => {
    rec.onstop = () => {
      recording = null;
      hooks.onDone?.();
      resolve(new Blob(chunks, {type: 'video/webm'}));
    };
  });
  recording = rec;
  const off = engine.onWrap(() => { off(); try { rec.stop(); } catch { /* noop */ } });
  rec.start(200);
  engine.seek(0);
  engine.play();
  hooks.onStart?.();
  const tick = () => {
    if (recording !== rec) return;
    hooks.onProgress?.(engine.time);
    requestAnimationFrame(tick);
  };
  tick();
  return done;
}

export function isRecording() { return !!recording; }
