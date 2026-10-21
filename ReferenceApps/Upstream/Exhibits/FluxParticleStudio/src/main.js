/* Flux main — boot, store → engine → panels wiring, shortcuts, exports. */
import './style.css';
import {
  createIcons, SkipBack, Play, Pause, Repeat, Plus, Download, ChevronDown,
  CircleHelp, Sparkles, Spline, Focus, Image, Clapperboard, Save, FolderOpen,
} from 'lucide';
import {createStore, layerById, defaultLayer} from './state.js';
import {createEngine} from './engine.js';
import {createPanels} from './panels.js';
import {createTimeline} from './timeline.js';
import {STARTER, PRESETS, buildPreset} from './presets.js';
import {parseComposition, serialize, downloadText, downloadBlob, recordLoop} from './io.js';

const $ = (id) => document.getElementById(id);
const AUTOSAVE_KEY = 'flux.autosave.v1';

/* ── boot document ─────────────────────────────────────────── */
let initial = null;
try {
  const saved = localStorage.getItem(AUTOSAVE_KEY);
  if (saved) initial = parseComposition(saved).doc;
} catch { /* fall through to starter */ }
if (!initial) initial = buildPreset(STARTER);
const store = createStore(initial);

/* ── toasts ────────────────────────────────────────────────── */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ── engine + views ────────────────────────────────────────── */
const engine = createEngine($('viewport'), store, {
  onTime: () => timeline.paint(),
  onFps: (fps) => { $('st-fps').textContent = `${Math.round(fps)} fps`; },
  onPlaying: () => timeline.setPlayIcon(),
});

function updateStatus() {
  const n = engine.liveParticles();
  $('st-parts').textContent = n >= 1000 ? `${(n / 1000).toFixed(1)}k particles` : `${n} particles`;
  const sel = layerById(store, store.selected);
  $('st-sel').textContent = sel ? sel.name : 'no layer';
  const saved = $('st-saved');
  saved.textContent = store.dirty ? 'unsaved' : 'saved';
  saved.classList.toggle('dirty', !!store.dirty);
}

function syncCompName() {
  const inp = $('comp-name');
  if (document.activeElement !== inp) inp.value = store.comp.name;
}

const api = {
  toast,
  onValues: () => { updateStatus(); timeline.paintTicks(); },
  onStructure: () => { updateStatus(); syncCompName(); timeline.paintTicks(); },
  addLayer() {
    store.commit('add layer', () => {
      const id = `l${store.nextId++}`;
      store.layers.push(defaultLayer(id, store.layers.length + 1));
      store.selected = id;
    });
    panels.renderLeft(); panels.renderInspector();
    api.onStructure();
    toast('Emitter layer added');
  },
  duplicateLayer() {
    const src = layerById(store, store.selected);
    if (!src) return;
    store.commit('duplicate layer', () => {
      const id = `l${store.nextId++}`;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = id;
      copy.name = `${src.name} copy`;
      store.layers.splice(store.layers.indexOf(src) + 1, 0, copy);
      store.selected = id;
    });
    panels.renderLeft(); panels.renderInspector();
    api.onStructure();
  },
  deleteLayer() {
    const sel = layerById(store, store.selected);
    if (!sel) return;
    store.commit('delete layer', () => {
      store.layers = store.layers.filter((l) => l.id !== sel.id);
      store.selected = store.layers[0]?.id || null;
    });
    panels.renderLeft(); panels.renderInspector();
    api.onStructure();
  },
  loadPreset(key) {
    const p = PRESETS.find((q) => q.key === key);
    if (!p) return;
    if (store.dirty && !window.confirm(`Replace “${store.comp.name}” with preset “${p.name}”? Unsaved changes will be lost.`)) return;
    store.commit('load preset', () => {
      const doc = buildPreset(p);
      store.comp = doc.comp; store.layers = doc.layers;
      store.nextId = doc.nextId; store.selected = doc.selected;
    });
    engine.seek(0);
    panels.renderLeft(); panels.renderInspector();
    api.onStructure();
    toast(`Preset loaded: ${p.name}`);
  },
};

const panels = createPanels(store, engine, api);
const timeline = createTimeline(store, engine, api);

store.subscribe(() => {
  engine.syncAll();
  updateStatus();
  timeline.paintTicks();
});

/* ── header ────────────────────────────────────────────────── */
syncCompName();
$('comp-name').addEventListener('change', (e) => {
  store.commit('rename composition', () => {
    store.comp.name = e.target.value.trim() || 'Untitled';
  });
  syncCompName();
});

const exportMenu = $('export-menu');
$('btn-export').onclick = (e) => { e.stopPropagation(); exportMenu.classList.toggle('hidden'); };
document.addEventListener('click', () => exportMenu.classList.add('hidden'));
exportMenu.addEventListener('click', (e) => e.stopPropagation());

const slug = (s) => (s || 'flux').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flux';

exportMenu.querySelector('[data-x="png"]').onclick = async () => {
  exportMenu.classList.add('hidden');
  const blob = await engine.captureFrame();
  if (blob) { downloadBlob(blob, `${slug(store.comp.name)}-frame.png`); toast('Frame exported'); }
};
exportMenu.querySelector('[data-x="webm"]').onclick = async () => {
  exportMenu.classList.add('hidden');
  $('rec-badge').classList.remove('hidden');
  toast('Rendering loop…');
  try {
    const blob = await recordLoop(engine, {
      onProgress: (t) => { $('rec-time').textContent = `${t.toFixed(1)}s`; },
      onDone: () => $('rec-badge').classList.add('hidden'),
    });
    if (blob?.size) {
      downloadBlob(blob, `${slug(store.comp.name)}-loop.webm`);
      toast('Loop rendered');
    }
  } catch (err) {
    $('rec-badge').classList.add('hidden');
    toast(err.message || 'Render failed');
  }
};
exportMenu.querySelector('[data-x="save"]').onclick = () => {
  exportMenu.classList.add('hidden');
  downloadText(serialize(store), `${slug(store.comp.name)}.flux.json`);
  store.markSaved();
  updateStatus();
  toast('Composition saved');
};
exportMenu.querySelector('[data-x="open"]').onclick = () => {
  exportMenu.classList.add('hidden');
  $('file-open').click();
};
$('file-open').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const {doc, warnings} = parseComposition(await file.text());
    if (store.dirty && !window.confirm(`Open “${file.name}”? Unsaved changes will be lost.`)) return;
    store.commit('open composition', () => {
      store.comp = doc.comp; store.layers = doc.layers;
      store.nextId = doc.nextId; store.selected = doc.selected;
    });
    engine.seek(0);
    panels.renderLeft(); panels.renderInspector();
    api.onStructure();
    toast(warnings.length ? `Opened with ${warnings.length} repair${warnings.length === 1 ? '' : 's'}` : `Opened ${doc.comp.name}`);
  } catch (err) {
    toast(`Open failed: ${err.message}`);
  }
});

$('btn-add').onclick = () => api.addLayer();
$('btn-help').onclick = () => $('help').classList.remove('hidden');
$('help-close').onclick = () => $('help').classList.add('hidden');
$('help').addEventListener('click', (e) => { if (e.target.id === 'help') $('help').classList.add('hidden'); });

// View toolbar mirrors.
$('v-bloom').onclick = () => {
  store.commit('toggle bloom', () => { store.comp.bloom.on = !store.comp.bloom.on; });
  $('v-bloom').classList.toggle('on', store.comp.bloom.on);
  panels.renderLeft();
};
$('v-trails').onclick = () => {
  store.commit('toggle trails', () => { store.comp.trails.on = !store.comp.trails.on; });
  $('v-trails').classList.toggle('on', store.comp.trails.on);
  panels.renderLeft();
};
$('v-home').onclick = () => engine.resetCamera();
function syncViewToolbar() {
  $('v-bloom').classList.toggle('on', !!store.comp.bloom.on);
  $('v-trails').classList.toggle('on', !!store.comp.trails.on);
}

/* ── shortcuts ─────────────────────────────────────────────── */
const typing = () => {
  const t = document.activeElement?.tagName;
  return t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA';
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !typing()) { e.preventDefault(); engine.toggle(); return; }
  if (typing()) return;
  if (e.code === 'Home') engine.stop();
  else if (e.key === 'f' || e.key === 'F') engine.resetCamera();
  else if ((e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.metaKey) api.addLayer();
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) api.deleteLayer();
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo(); else store.undo();
    panels.renderLeft(); panels.renderInspector();
    syncCompName(); syncViewToolbar(); updateStatus(); timeline.paintTicks();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    exportMenu.querySelector('[data-x="save"]').click();
  } else if (e.key === '?') {
    $('help').classList.toggle('hidden');
  }
});

/* ── autosave ──────────────────────────────────────────────── */
let saveTimer = 0;
store.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(AUTOSAVE_KEY, serialize(store)); } catch { /* quota */ }
  }, 800);
});
window.addEventListener('beforeunload', (e) => {
  if (store.dirty) e.preventDefault();
});

/* ── diagnostics badge (GPU status always visible in viewport) ── */
window.__flux = {store, engine};
{
  const badge = document.createElement('button');
  badge.id = 'gl-badge';
  badge.title = 'GPU status — click for full diagnostics';
  badge.textContent = 'gpu …';
  $('viewport').appendChild(badge);
  const overlay = document.createElement('div');
  overlay.id = 'diag-overlay';
  overlay.className = 'hidden';
  overlay.innerHTML = `<div class="diag-card">
      <div class="diag-head"><b>Flux diagnostics</b>
        <span><button id="diag-copy" class="pill-btn">Copy report</button>
        <button id="diag-close" class="tbtn" title="Close">✕</button></span>
      </div><pre id="diag-body">…</pre></div>`;
  document.body.appendChild(overlay);
  const fmtRep = (r) => [
    `draw: ${r.line} · points ${r.points} · geometries ${r.geometries} · textures ${r.textures}`,
    `gl: ${r.glVersion} · ${r.glRenderer}`,
    `canvas: ${r.canvasSize} · composer targets: ${r.floatTargets ? 'half-float' : 'byte (fallback)'}`,
    `ext: EXT_color_buffer_float=${r.extFloat} half=${r.extHalf} float_linear=${r.extFloatLinear}`,
    ...r.layers.map((l) => `layer "${l.name}": solid=${l.solid} count=${l.count} instances=${l.instances} visible=${l.visible} blend=${l.blend}`),
    '--- console (three.js logs shader failures here) ---',
    ...(r.console.length ? r.console : ['(no errors or warnings)']),
  ].join('\n');
  badge.onclick = () => {
    try { $('diag-body').textContent = fmtRep(engine.debug.report()); }
    catch (e) { $('diag-body').textContent = `report failed: ${e?.message || e}`; }
    overlay.classList.remove('hidden');
  };
  $('diag-close').onclick = () => overlay.classList.add('hidden');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  $('diag-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('diag-body').textContent); toast('Diagnostics copied'); }
    catch { toast('Copy failed — select the text manually'); }
  };
  setInterval(() => {
    try {
      const r = engine.debug.report();
      badge.textContent = r.line;
      badge.classList.toggle('bad', r.tris < 100);
      badge.title = r.tris < 100
        ? 'GPU drew almost nothing — click for full diagnostics'
        : 'GPU status — click for full diagnostics';
    } catch { badge.textContent = 'gpu error'; badge.classList.add('bad'); }
  }, 1000);
}

/* ── go ────────────────────────────────────────────────────── */
try {
  createIcons({icons: {SkipBack, Play, Pause, Repeat, Plus, Download, ChevronDown, CircleHelp, Sparkles, Spline, Focus, Image, Clapperboard, Save, FolderOpen}});
} catch { /* noop */ }
panels.renderLeft();
panels.renderInspector();
syncViewToolbar();
updateStatus();
timeline.setPlayIcon();
timeline.paint();
timeline.paintTicks();
engine.play();
