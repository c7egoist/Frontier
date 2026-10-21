/* ════════════════════════════════════════════════════════════════════
   main.js — boot, derived data (samples/issues/summary), terrain, files,
   keyboard shortcuts, and the store → views refresh flow.
   ════════════════════════════════════════════════════════════════════ */
import './style.css';
import {createStore, roadById, effectivePoints, loadAutosave} from './state.js';
import {sampleRoad} from './spline.js';
import {validateProject, summarize} from './validate.js';
import {buildTopology} from './topology.js';
import {
  newProject, parseProject, starterProject, samplerFromImage, fileToDataURL,
  createGridSampler, createDemoHills
} from './io.js';
import {createPlanView} from './plan.js';
import {createPreview} from './preview3d.js';
import {createPanels} from './panels.js';

/* ── derived data ─────────────────────────────────────────────────── */
const samples = new Map();
let issues = [];
let summary = {length: 0, minRadius: Infinity, maxGrade: 0, points: 0, roads: 0};
let topology = {intersections: [], disabled: [], overpasses: [], runs: new Map(), bridges: []};
let terrain = null; // {sample, rev, bounds, minY, maxY, w, h, name, kind, image?}
let terrainRev = 0;
let lastCursor = null;
let lastAutosave = null;

function recompute(live = false) {
  samples.clear();
  let total = 0;
  for (const road of store.project.roads) {
    const smp = sampleRoad(effectivePoints(store.project, road), {closed: road.closed, step: 1.0});
    samples.set(road.id, smp);
    total += smp.count;
  }
  // Validation runs segment-pair tests; skip it mid-gesture on huge networks
  // (it always refreshes on release via the committed 'project' tag).
  topology = buildTopology(store.project, samples);
  if (!live || total < 8000) issues = validateProject(store.project, topology);
  summary = summarize(store.project, samples);
}

/* ── store ────────────────────────────────────────────────────────── */
const boot = loadAutosave();
let initial = starterProject();
let restoredNote = '';
if (boot) {
  try {
    const {project, warnings} = parseProject(boot.project);
    initial = project;
    restoredNote = `Restored autosave from ${new Date(boot.at).toLocaleTimeString()}${warnings.length ? ` (${warnings.length} repaired)` : ''}`;
  } catch { /* fall through to starter */ }
}
const store = createStore(initial);

/* ── API shared with panels ───────────────────────────────────────── */
const api = {
  plan: null, preview: null,
  getSamples: (id) => samples.get(id) || null,
  getSampleMap: () => samples,
  getTopology: () => topology,
  getIssues: () => issues,
  getSummary: () => summary,
  getTerrain: () => terrain,
  autosaveNote: () => (lastAutosave ? `saved ${new Date(lastAutosave).toLocaleTimeString()}` : 'pending first edit'),
  toast: (m) => panels.toast(m),

  newProject() {
    if (store.dirty && !window.confirm('Discard unsaved changes and start a new project?')) return;
    if (plan.drawing) plan.finishDraw(true);
    terrain = null;
    store.loadProject(newProject('Untitled route'));
    plan.fitAll();
    panels.toast('New project — draw roads with D');
  },

  async openProjectFile(file) {
    try {
      const text = await file.text();
      const {project, warnings} = parseProject(text);
      if (store.dirty && !window.confirm(`Open “${file.name}”? Unsaved changes will be lost.`)) return;
      if (plan.drawing) plan.finishDraw(true);
      await loadProjectData(project);
      plan.fitAll();
      panels.toast(warnings.length ? `Opened with ${warnings.length} repair${warnings.length === 1 ? '' : 's'} — first: ${warnings[0]}` : `Opened ${project.name}`);
    } catch (e) {
      panels.toast(`Open failed: ${e.message}`);
    }
  },

  saveProjectFile() { panels.exportJSON(); },

  async loadSample(key) {
    if (store.dirty && !window.confirm('Load a sample? Unsaved changes will be lost.')) return;
    if (plan.drawing) plan.finishDraw(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${key}.road.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const {project, warnings} = parseProject(await res.text());
      await loadProjectData(project);
      plan.fitAll();
      panels.toast(warnings.length ? `Sample loaded (${warnings.length} repairs)` : `Sample loaded: ${project.name}`);
    } catch (e) {
      panels.toast(`Sample failed: ${e.message}`);
    }
  },

  async importHeightFile(file) {
    try {
      const dataURL = await fileToDataURL(file);
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('could not decode image'));
        im.src = dataURL;
      });
      // Default footprint: fit the roads, or a 320 m square.
      const b = roadsBounds() || {minX: -160, maxX: 160, minZ: -160, maxZ: 160};
      const aspect = img.naturalHeight / Math.max(1, img.naturalWidth);
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const w = Math.max(60, b.maxX - b.minX + 80);
      const bounds = {minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - (w * aspect) / 2, maxZ: cz + (w * aspect) / 2};
      const sampler = await samplerFromImage(dataURL, {bounds, base: 0, scale: 30});
      const rec = {
        name: file.name.replace(/\.[^.]+$/, ''), kind: 'image',
        width: sampler.gridW, height: sampler.gridH,
        ...bounds, base: 0, scale: 30, image: dataURL
      };
      store.commit('import heightmap', (p) => { p.heightmap = rec; });
      setTerrainFromSampler(sampler, rec.name, 'image', dataURL);
      panels.toast(`Heightmap on ${(bounds.maxX - bounds.minX).toFixed(0)}×${(bounds.maxZ - bounds.minZ).toFixed(0)} m · white = +30 m`);
      if (dataURL.length > 3_000_000) panels.toast('Note: embedded image is large — project JSON will be heavy');
    } catch (e) {
      panels.toast(`Heightmap failed: ${e.message}`);
    }
  },

  makeDemoHills() {
    const b = roadsBounds() || {minX: -160, maxX: 160, minZ: -160, maxZ: 160};
    const pad = 60;
    const bounds = {minX: b.minX - pad, maxX: b.maxX + pad, minZ: b.minZ - pad, maxZ: b.maxZ + pad};
    const {grid, w, h} = createDemoHills(bounds, 128);
    const sampler = createGridSampler(grid, w, h, bounds, 1);
    store.commit('grow demo hills', (p) => {
      p.heightmap = {name: 'Demo hills', kind: 'demo', width: w, height: h, ...bounds, base: 0, scale: 1, image: null};
    });
    setTerrainFromSampler(sampler, 'Demo hills', 'demo', null);
    panels.toast('Demo hills grown — try Drape all on a road');
  },

  clearTerrain() {
    terrain = null;
    store.commit('remove terrain', (p) => { p.heightmap = null; });
  },

  gotoIssue(it) {
    if (it.roadId && roadById(store.project, it.roadId)) {
      store.select({kind: 'road', roadId: it.roadId});
    }
    if (it.x != null) {
      if (store.view === 'td') store.setView('split');
      plan.centerOn(it.x, it.z, 10);
      store.ping(it.x, it.z);
    }
  },

  gotoPoint(x, z) {
    if (store.view === 'td') store.setView('split');
    plan.centerOn(x, z, 10);
    store.ping(x, z);
  },

  zoomRoad(roadId) {
    const smp = samples.get(roadId);
    if (!smp || !smp.count) return;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of smp.samples) {
      if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z; if (s.z > maxZ) maxZ = s.z;
    }
    const r = document.getElementById('plan').getBoundingClientRect();
    const scale = Math.min((r.width - 120) / Math.max(10, maxX - minX), (r.height - 120) / Math.max(10, maxZ - minZ));
    if (store.view === 'td') store.setView('split');
    plan.centerOn((minX + maxX) / 2, (minZ + maxZ) / 2, Math.min(60, Math.max(0.5, scale)));
  },

  startDrive() {
    const p = store.project;
    let target = store.selection.roadId && roadById(p, store.selection.roadId) && samples.get(store.selection.roadId)?.count
      ? store.selection.roadId : null;
    if (!target) {
      let best = 0;
      for (const [id, smp] of samples) {
        if (smp.length > best && roadById(p, id)?.visible !== false) { best = smp.length; target = id; }
      }
    }
    if (!target) { panels.toast('Draw a road first — nothing to drive'); return; }
    if (store.view === 'plan') store.setView('td');
    requestAnimationFrame(() => {
      const road = roadById(store.project, target);
      if (preview.drive(target, 16)) {
        panels.showDrive(true, road?.name || target, true);
        panels.toast(`Driving ${road?.name || ''} — Esc exits`);
      }
    });
  }
};

function roadsBounds() {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let any = false;
  for (const smp of samples.values()) {
    for (const s of smp.samples || []) {
      any = true;
      if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z; if (s.z > maxZ) maxZ = s.z;
    }
  }
  return any ? {minX, maxX, minZ, maxZ} : null;
}

function setTerrainFromSampler(sampler, name, kind, image) {
  terrainRev++;
  terrain = {
    sample: sampler.sample, bounds: sampler.bounds,
    minY: sampler.minY, maxY: sampler.maxY,
    w: sampler.gridW, h: sampler.gridH,
    rev: terrainRev, name, kind, image: image || null
  };
  store.notify('project');
}

async function restoreTerrain(rec) {
  if (!rec) { terrain = null; return; }
  try {
    if (rec.kind === 'demo') {
      const {grid, w, h} = createDemoHills(
        {minX: rec.minX, maxX: rec.maxX, minZ: rec.minZ, maxZ: rec.maxZ}, 128);
      setTerrainFromSampler(createGridSampler(grid, w, h, {minX: rec.minX, maxX: rec.maxX, minZ: rec.minZ, maxZ: rec.maxZ}, 1),
        rec.name || 'Demo hills', 'demo', null);
    } else if (rec.image) {
      const sampler = await samplerFromImage(rec.image, {
        bounds: {minX: rec.minX, maxX: rec.maxX, minZ: rec.minZ, maxZ: rec.maxZ},
        base: rec.base || 0, scale: rec.scale || 30
      });
      setTerrainFromSampler(sampler, rec.name || 'heightmap', 'image', rec.image);
    } else if (rec.grid) {
      const g = Float32Array.from(rec.grid);
      setTerrainFromSampler(createGridSampler(g, rec.width, rec.height,
        {minX: rec.minX, maxX: rec.maxX, minZ: rec.minZ, maxZ: rec.maxZ}, 1),
        rec.name || 'heightmap', 'image', null);
    } else {
      terrain = null;
    }
  } catch (e) {
    console.error(e);
    panels.toast('Embedded heightmap could not be decoded — starting flat');
    terrain = null;
  }
}

async function loadProjectData(project) {
  store.loadProject(project);
  await restoreTerrain(project.heightmap);
  store.notify('project');
}

/* ── views ────────────────────────────────────────────────────────── */
const plan = createPlanView(document.getElementById('plan'), store, {
  getSamples: api.getSamples,
  getIssues: api.getIssues,
  getTerrain: api.getTerrain,
  getTopology: api.getTopology,
  toast: (m) => panels.toast(m),
  onCursor: (x, z) => {
    lastCursor = x == null ? null : {x, z};
    panels.renderStatus(lastCursor);
  }
});
api.plan = plan;

const preview = createPreview(document.getElementById('view3d'), store, {
  getSamples: api.getSamples,
  getSampleMap: api.getSampleMap,
  getTopology: api.getTopology,
  getTerrain: api.getTerrain,
  toast: (m) => panels.toast(m),
  onDriveState: (on) => {
    panels.showDrive(on);
    panels.refreshToolbars();
  }
});
api.preview = preview;

const panels = createPanels(store, api);

/* ── refresh flow ─────────────────────────────────────────────────── */
let previewTimer = 0;
let saveTimer = 0;
const queuePreview = () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => preview.refresh(), 140);
};
const queueAutosave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (store.autosave()) {
      lastAutosave = Date.now();
      panels.renderLeft();
    }
  }, 900);
};

store.subscribe((tag) => {
  if (tag === 'project' || tag === 'project-live') {
    recompute(tag === 'project-live');
    // Views subscribed before this handler repainted with stale topology;
    // repaint the plan now that samples + topology are fresh.
    plan.redraw();
    panels.renderMetrics();
    panels.renderStatus(lastCursor);
    queuePreview();
    if (tag === 'project') {
      panels.renderLeft();
      panels.renderInspector();
      panels.refreshHeader();
      queueAutosave();
    }
  } else if (tag === 'selection') {
    panels.renderLeft();
    panels.renderInspector();
    panels.renderStatus(lastCursor);
  } else if (tag === 'tool') {
    panels.refreshToolbars();
    panels.renderStatus(lastCursor);
  } else if (tag === 'view') {
    panels.refreshView();
    panels.refreshToolbars();
    if (store.view === 'plan' && preview.driving) preview.stopDrive();
    if (store.view !== 'plan') queuePreview();
  } else if (tag === 'ui') {
    panels.refreshToolbars();
    panels.renderStatus(lastCursor);
  } else if (tag === 'saved') {
    panels.refreshHeader();
  }
});

/* ── file inputs ──────────────────────────────────────────────────── */
document.getElementById('file-road').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) api.openProjectFile(f);
});
document.getElementById('file-height').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) api.importHeightFile(f);
});

/* ── keyboard ─────────────────────────────────────────────────────── */
window.addEventListener('keydown', (e) => {
  const typing = /^(input|textarea|select)$/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
  // Drive transport always wins for Space/Escape while driving.
  if (preview.driving && (e.code === 'Space' || e.key === 'Escape')) {
    e.preventDefault();
    if (e.code === 'Space') panels.syncDrivePlay(preview.toggleDrivePlay());
    else preview.stopDrive();
    return;
  }
  if (plan.drawing && (((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) ||
      (!e.ctrlKey && !e.metaKey) && (e.key === 'Delete' || e.key === 'Backspace'))) {
    e.preventDefault();
    panels.toast('Finish the draw first — Enter keeps it, Esc cancels');
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (typing) e.target.blur();
    if (e.shiftKey) { if (store.redo()) panels.toast('Redone'); }
    else { const l = store.undo(); if (l) panels.toast(`Undid ${l}`); else panels.toast('Nothing to undo'); }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    if (store.redo()) panels.toast('Redone');
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    panels.exportJSON();
    return;
  }
  if (typing) return;
  if (e.key === 'Escape') {
    panels.closeMenu();
    document.getElementById('help').hidden = true;
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'v': store.setTool('select'); break;
    case 'd': store.setTool('draw'); break;
    case 'h': store.setTool('pan'); break;
    case 'f': plan.fitAll(); break;
    case '1': store.setView('plan'); break;
    case '2': store.setView('split'); break;
    case '3': store.setView('td'); break;
    case '?': document.getElementById('help').hidden = false; break;
    case 'delete':
    case 'backspace':
      e.preventDefault();
      panels.deleteSelection?.(e.shiftKey);
      break;
  }
});

window.addEventListener('beforeunload', (e) => {
  if (store.dirty) e.preventDefault();
});

/* ── boot ─────────────────────────────────────────────────────────── */
recompute();
panels.renderLeft();
panels.renderInspector();
panels.renderMetrics();
panels.renderStatus(null);
panels.refreshHeader();
panels.refreshView();
panels.refreshToolbars();
requestAnimationFrame(() => {
  plan.fitAll();
  preview.refresh();
  preview.resetCamera(false);
});
(async () => {
  if (initial.heightmap) await restoreTerrain(initial.heightmap);
  if (restoredNote) panels.toast(restoredNote);
})();
