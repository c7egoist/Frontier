import './ui/styles.css';
import { PRESETS, PRESET_GROUPS, TreeParams, cloneParams, SHAPE_NAMES, Shape, scatterFor, trunkBaseRadius, rootReach } from './tree/params';
import { Viewer, DEFAULT_VIEW, ViewerSettings, DisplayMode } from './viewer/scene';
import { el, section, slider, select, check, levelsHeader, levelRow, fmtInt } from './ui/controls';
import type { WorkerRequest, WorkerResponse, GenerateResponse } from './worker/tree.worker';
import { LeafMesh } from './tree/mesh';
import { GpuBuffers } from './tree/export';
import { ObstacleKind, ObstacleSpec, makeObstacle, scatterObstacles } from './env/environment';
import { Random } from './core/random';

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

let params: TreeParams = cloneParams(PRESETS[0]);
const view: ViewerSettings = { ...DEFAULT_VIEW };
let lastResult: GenerateResponse | null = null;
let busy = false;
let pending = false;
let reqId = 0;

const worker = new Worker(new URL('./worker/tree.worker.ts', import.meta.url), { type: 'module' });

// -----------------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------------

const app = document.getElementById('app')!;

const topbar = el('div', 'topbar');
const brand = el('div', 'brand');
brand.append(el('span', 'mark'), el('span', '', 'Frontier'), el('span', 'sub', 'Tree Generator'));
topbar.append(brand);

const modeSeg = el('div', 'seg');
const MODES: { id: DisplayMode; label: string }[] = [
  { id: 'shaded', label: 'Shaded' },
  { id: 'matcap', label: 'Clay' },
  { id: 'wireframe', label: 'Wire' },
  { id: 'levels', label: 'Levels' },
  { id: 'junctions', label: 'Junctions' },
  { id: 'wind', label: 'Wind weights' },
];
const modeButtons = new Map<DisplayMode, HTMLButtonElement>();
for (const m of MODES) {
  const b = el('button', m.id === view.mode ? 'active' : '', m.label);
  b.addEventListener('click', () => {
    view.mode = m.id;
    syncView();
  });
  modeButtons.set(m.id, b);
  modeSeg.append(b);
}
topbar.append(el('div', 'spacer'), modeSeg);

const wireToggle = el('button', 'btn ghost', 'Quad overlay');
wireToggle.addEventListener('click', () => {
  view.showWire = !view.showWire;
  syncView();
});
const windToggle = el('button', 'btn ghost', 'Wind');
windToggle.addEventListener('click', () => {
  view.windEnabled = !view.windEnabled;
  syncView();
});
const frameBtn = el('button', 'btn ghost');
frameBtn.append(document.createTextNode('Frame '), Object.assign(el('kbd'), { textContent: 'F' }));
const exportObj = el('button', 'btn', 'Export OBJ');
const exportGlb = el('button', 'btn', 'Export GLB');
const shotBtn = el('button', 'btn ghost', 'Screenshot');
const topGroup = el('div', 'group');
topGroup.append(wireToggle, windToggle, frameBtn, shotBtn, exportObj, exportGlb);
topbar.append(topGroup);

const viewport = el('div', 'viewport');
const canvas = el('canvas');
viewport.append(canvas);

const hud = el('div', 'hud');
const status = el('div', 'status');
const statusDot = el('span', 'dot');
const statusText = el('span', '', 'Idle');
status.append(statusDot, statusText);
const chip = el('div', 'chip');
hud.append(status, chip);
viewport.append(hud);

const legend = el('div', 'legend');
viewport.append(legend);

const toast = el('div', 'toast');
viewport.append(toast);

const panel = el('aside', 'panel');
const tabs = el('div', 'tabs');
const tabBotany = el('button', 'active', 'Botany');
const tabRoots = el('button', '', 'Roots & Site');
const tabMesh = el('button', '', 'Mesh');
const tabView = el('button', '', 'Viewport');
const tabReport = el('button', '', 'Topology');
tabs.append(tabBotany, tabRoots, tabMesh, tabView, tabReport);
const scroll = el('div', 'scroll');
panel.append(tabs, scroll);

const pages = {
  botany: el('div'),
  roots: el('div'),
  mesh: el('div'),
  view: el('div'),
  report: el('div'),
};
scroll.append(pages.botany, pages.roots, pages.mesh, pages.view, pages.report);
const tabMap: [HTMLButtonElement, HTMLElement][] = [
  [tabBotany, pages.botany],
  [tabRoots, pages.roots],
  [tabMesh, pages.mesh],
  [tabView, pages.view],
  [tabReport, pages.report],
];
function showTab(btn: HTMLButtonElement): void {
  for (const [b, p] of tabMap) {
    b.classList.toggle('active', b === btn);
    p.style.display = b === btn ? '' : 'none';
  }
}
for (const [btn] of tabMap) btn.addEventListener('click', () => showTab(btn));
showTab(tabBotany);

const statusbar = el('div', 'statusbar');
const sbLeft = el('span');
const sbMid = el('span');
const sbRight = el('span', 'right');
statusbar.append(sbLeft, sbMid, sbRight);

app.append(topbar, viewport, panel, statusbar);

// -----------------------------------------------------------------------------
// Viewer
// -----------------------------------------------------------------------------

const viewer = new Viewer(canvas);
viewer.onFrame(() => {
  sbRight.textContent = `${viewer.fps.toFixed(0)} fps`;
});
frameBtn.addEventListener('click', () => viewer.frame());
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  if (e.key === 'f' || e.key === 'F') viewer.frame();
  if (e.key === 'b' || e.key === 'B') viewer.frameBase(rootReach(params));
  if (e.key === 'r' || e.key === 'R') randomSeed();
  if (e.key === 'w' || e.key === 'W') {
    view.showWire = !view.showWire;
    syncView();
  }
  if (e.key === 'Escape' && viewer.isPlacing) setPlacing(false);
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObstacle >= 0) removeObstacle(selectedObstacle);
});

// Object placement: drag existing objects on the ground, click to add in placement mode.
let selectedObstacle = -1;
let addKind: ObstacleKind = 'rock';
viewer.onPlacement((ev) => {
  const obs = params.environment.obstacles;
  if (ev.phase === 'add') {
    const rng = new Random((Date.now() ^ (obs.length * 7919)) >>> 0);
    const sc = params.environment.scatter;
    const size = rng.range(sc.minSize, sc.maxSize);
    obs.push(makeObstacle(addKind, ev.x, ev.z, size, rng, sc.burial, sc.roughness));
    selectedObstacle = obs.length - 1;
    setPlacing(false);
    buildRootsPage();
    scheduleGenerate(true);
    return;
  }
  const o = obs[ev.index];
  if (!o) return;
  if (ev.phase === 'move') {
    viewer.offsetObstacle(ev.index, ev.x - o.x, ev.z - o.z);
    return;
  }
  o.x = ev.x;
  o.z = ev.z;
  selectedObstacle = ev.index;
  buildRootsPage();
  scheduleGenerate(true);
});

function setPlacing(on: boolean): void {
  viewer.setPlacing(on);
  for (const r of placementRefreshers) r();
  if (on) showToast(`Click on the ground to place a ${addKind === 'rock' ? 'rock' : 'block'} · Esc to cancel`);
}

function removeObstacle(i: number): void {
  params.environment.obstacles.splice(i, 1);
  selectedObstacle = -1;
  buildRootsPage();
  scheduleGenerate(true);
}
const placementRefreshers: (() => void)[] = [];
shotBtn.addEventListener('click', () => {
  const url = viewer.screenshot();
  download(url, `${slug(params.name)}_${params.seed}.png`);
});

function syncView(): void {
  viewer.applySettings(view);
  for (const [id, b] of modeButtons) b.classList.toggle('active', id === view.mode);
  wireToggle.classList.toggle('primary', view.showWire);
  windToggle.classList.toggle('primary', view.windEnabled);
  legend.style.display = view.mode === 'levels' || view.mode === 'junctions' || view.mode === 'wind' ? '' : 'none';
  legend.innerHTML = '';
  if (view.mode === 'levels') {
    const items: [string, string][] = [
      ['Trunk', '#8a5a3c'],
      ['Limbs', '#c98b4b'],
      ['Branches', '#6fa16b'],
      ['Twigs', '#5aa1c9'],
      ['Roots', '#b86b5c'],
    ];
    for (const [n, c] of items) {
      const s = el('span');
      const i = el('i');
      i.style.background = c;
      s.append(i, document.createTextNode(n));
      legend.append(s);
    }
  } else if (view.mode === 'junctions') {
    const s = el('span');
    const i = el('i');
    i.style.background = '#f26b2e';
    s.append(i, document.createTextNode('Welded junction loops (collars & crotches)'));
    legend.append(s);
  } else if (view.mode === 'wind') {
    const s = el('span');
    s.append(document.createTextNode('Limb bend weight: '));
    const i0 = el('i');
    i0.style.background = '#1a338c';
    const i1 = el('i');
    i1.style.background = '#33bf8c';
    const i2 = el('i');
    i2.style.background = '#fad940';
    s.append(i0, document.createTextNode('rigid '), i1, document.createTextNode('mid '), i2, document.createTextNode('flexible'));
    legend.append(s);
  }
  for (const r of viewRefreshers) r();
}

// -----------------------------------------------------------------------------
// Generation
// -----------------------------------------------------------------------------

let debounceTimer = 0;
/** Re-frame the camera once the next tree arrives (species change: sizes differ wildly). */
let frameOnNext = false;

function scheduleGenerate(immediate = false): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => generate(), immediate ? 0 : 140);
}

function generate(): void {
  if (busy) {
    pending = true;
    return;
  }
  busy = true;
  setStatus('busy', 'Generating…');
  const id = ++reqId;
  const msg: WorkerRequest = { type: 'generate', id, params: cloneParams(params) };
  worker.postMessage(msg);
}

worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  const msg = ev.data;
  if (msg.type === 'error') {
    busy = false;
    setStatus('err', `Error: ${msg.message}`);
    console.error(msg.message);
    return;
  }
  if (msg.type === 'exported') {
    const blob = new Blob([msg.data], { type: msg.format === 'obj' ? 'text/plain' : 'model/gltf-binary' });
    download(URL.createObjectURL(blob), `${slug(params.name)}_${params.seed}.${msg.format}`);
    showToast(`${msg.format.toUpperCase()} exported`);
    exportObj.disabled = exportGlb.disabled = false;
    return;
  }
  if (msg.type === 'generated') {
    busy = false;
    if (msg.id !== reqId) {
      if (pending) {
        pending = false;
        generate();
      }
      return;
    }
    lastResult = msg;
    const buffers: GpuBuffers = msg.buffers;
    const leaves = new LeafMesh();
    leaves.positions = Array.from(msg.leaves.positions);
    leaves.normals = Array.from(msg.leaves.normals);
    leaves.uvs = Array.from(msg.leaves.uvs);
    leaves.wind = Array.from(msg.leaves.wind);
    leaves.pivots = Array.from(msg.leaves.pivots);
    leaves.indices = Array.from(msg.leaves.indices);
    const firstTree = !hasTree;
    viewer.setTree(buffers, leaves, msg.summary.height);
    viewer.setObstacles(msg.obstacles);
    if (firstTree || frameOnNext) viewer.frame();
    frameOnNext = false;
    hasTree = true;
    updateReport(msg);
    if (pending) {
      pending = false;
      generate();
    }
  }
};
let hasTree = false;

function setStatus(kind: 'ok' | 'warn' | 'err' | 'busy' | '', text: string): void {
  statusDot.className = 'dot ' + kind;
  statusText.textContent = text;
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------

function updateReport(r: GenerateResponse): void {
  const rep = r.report;
  const ok = rep.closed && rep.manifold && rep.components === 1 && rep.genus === 0;
  setStatus(ok ? 'ok' : 'warn', ok ? 'Closed manifold · genus 0' : 'Topology issues – see report');

  chip.innerHTML = '';
  const kv = (k: string, v: string): void => {
    chip.append(el('span', '', k), el('b', '', v));
  };
  kv('Faces', fmtInt(rep.faces));
  kv('Quads', `${(rep.quadRatio * 100).toFixed(2)} %`);
  kv('Vertices', fmtInt(rep.vertices));
  kv('Stems', fmtInt(r.summary.stems));
  kv('Roots', fmtInt(r.summary.rootStems));
  kv('Height', `${r.summary.height.toFixed(1)} m`);
  kv('Build', `${r.timings.total.toFixed(0)} ms`);

  sbLeft.innerHTML = `<b>${params.name}</b> · seed ${params.seed}`;
  sbMid.textContent = `stems L0–L3: ${r.summary.stemsPerLevel.slice(0, 4).join(' / ')} · roots ${r.summary.primaryRoots}/${r.summary.rootStems} · objects ${r.summary.obstacles} · leaves ${fmtInt(r.summary.leaves)} · dropped ${r.stats.droppedStems}`;

  const page = pages.report;
  page.innerHTML = '';
  const s1 = section('Manifold checks', page);
  const list = el('div', 'check-list');
  const item = (label: string, pass: boolean, detail: string): void => {
    const it = el('div', 'item');
    it.append(el('span', 'dot ' + (pass ? 'ok' : 'err')), el('span', '', label), el('small', '', detail));
    list.append(it);
  };
  item('Closed surface (no boundary edges)', rep.boundaryEdges === 0, `${rep.boundaryEdges} open`);
  item('2-manifold (every edge has 2 faces)', rep.nonManifoldEdges === 0, `${rep.nonManifoldEdges} bad`);
  item('Consistent winding', rep.inconsistentEdges === 0, `${rep.inconsistentEdges} flipped`);
  item('Single connected piece', rep.components === 1, `${rep.components} part${rep.components === 1 ? '' : 's'}`);
  item('Genus 0  (V − E + F = 2)', rep.eulerCharacteristic === 2, `χ = ${rep.eulerCharacteristic}`);
  item('No degenerate faces', rep.degenerateFaces === 0, `${rep.degenerateFaces}`);
  item('No isolated vertices', rep.isolatedVertices === 0, `${rep.isolatedVertices}`);
  s1.append(list);

  const s2 = section('Mesh statistics', page);
  const grid = el('div', 'kv');
  const add = (k: string, v: string, cls = ''): void => {
    grid.append(el('span', '', k), el('b', cls, v));
  };
  add('Vertices', fmtInt(rep.vertices));
  add('Edges', fmtInt(rep.edges));
  add('Faces', fmtInt(rep.faces));
  add('Quads', `${fmtInt(rep.quads)}  (${(rep.quadRatio * 100).toFixed(2)} %)`, rep.quadRatio > 0.99 ? 'ok' : 'warn');
  add('Triangles', fmtInt(rep.tris), rep.tris === 0 ? 'ok' : '');
  add('Triangulated', fmtInt(r.buffers.index.length / 3));
  add('Poles (valence ≠ 4)', `${fmtInt(rep.poles)}  (${((rep.poles / Math.max(1, rep.vertices)) * 100).toFixed(1)} %)`);
  add('Min edge length', `${(rep.minEdgeLength * 1000).toFixed(1)} mm`);
  add('Junctions welded', fmtInt(r.stats.junctions));
  add('Forks (Y crotches)', fmtInt(r.stats.forks));
  add('Root stems welded', `${fmtInt(r.stats.rootStems)}  (${r.summary.primaryRoots} primary)`);
  add('Stems dropped', fmtInt(r.stats.droppedStems), r.stats.droppedStems ? 'warn' : 'ok');
  add('Roots dropped', fmtInt(r.stats.droppedRoots), r.stats.droppedRoots ? 'warn' : 'ok');
  s2.append(grid);

  const s3 = section('Valence histogram', page, { collapsed: true });
  const bars = el('div', 'bars');
  const entries = Object.entries(rep.valenceHistogram)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const maxV = Math.max(1, ...entries.map((e) => e[1]));
  for (const [val, count] of entries) {
    bars.append(el('span', '', `v${val}`));
    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = `${(count / maxV) * 100}%`;
    bar.append(fill);
    bars.append(bar, el('span', '', fmtInt(count)));
  }
  s3.append(bars);

  const s4 = section('Timings', page, { collapsed: true });
  const tg = el('div', 'kv');
  const t = r.timings;
  const addT = (k: string, v: number): void => {
    tg.append(el('span', '', k), el('b', '', `${v.toFixed(1)} ms`));
  };
  addT('Skeleton', t.skeleton);
  addT('Roots', t.roots);
  addT('Welded mesh', t.mesh);
  addT('Validation', t.validate);
  addT('GPU buffers', t.buffers);
  addT('Total', t.total);
  s4.append(tg);

  if (r.stats.droppedStems > 0) {
    const s5 = section('Dropped stems', page, { collapsed: true });
    const dg = el('div', 'kv');
    for (const [k, v] of Object.entries(r.stats.dropReasons)) dg.append(el('span', '', k), el('b', '', fmtInt(v)));
    s5.append(dg, el('p', 'note', 'A stem is dropped when no window can be opened for it on the parent without overlapping another junction. Increase trunk radial segments or rings per segment to make room.'));
  }
}

// -----------------------------------------------------------------------------
// Botany page
// -----------------------------------------------------------------------------

const refreshers: (() => void)[] = [];
const viewRefreshers: (() => void)[] = [];
const onChange = (): void => {
  scheduleGenerate();
  for (const r of refreshers) r();
};

function buildBotanyPage(): void {
  const page = pages.botany;
  page.innerHTML = '';
  const b = params.botany;

  const sPreset = section('Species', page);
  const presetRow = el('div', 'preset-row');
  const presetSel = el('select');
  const grouped = new Set<string>();
  const addGroup = (label: string, names: string[]): void => {
    const og = el('optgroup');
    og.label = label;
    for (const name of names) {
      if (!PRESETS.some((p) => p.name === name)) continue;
      const o = el('option', '', name);
      o.value = name;
      og.append(o);
      grouped.add(name);
    }
    if (og.childElementCount > 0) presetSel.append(og);
  };
  for (const g of PRESET_GROUPS) addGroup(g.label, g.names);
  addGroup('Other', PRESETS.map((p) => p.name).filter((n) => !grouped.has(n)));
  presetSel.value = params.name;
  presetSel.addEventListener('change', () => {
    const seed = params.seed;
    params = cloneParams(PRESETS.find((p) => p.name === presetSel.value)!);
    params.seed = seed;
    selectedObstacle = -1;
    frameOnNext = true;
    buildBotanyPage();
    buildRootsPage();
    buildMeshPage();
    scheduleGenerate(true);
  });
  presetRow.append(presetSel);
  sPreset.append(presetRow);

  const seedRow = el('div', 'seed-row');
  const seedLabel = el('span', '', 'Seed');
  seedLabel.style.color = 'var(--text-1)';
  seedLabel.style.width = '110px';
  const seedInput = el('input', 'num');
  seedInput.type = 'text';
  seedInput.value = String(params.seed);
  seedInput.addEventListener('change', () => {
    const v = parseInt(seedInput.value, 10);
    if (!Number.isNaN(v)) {
      params.seed = v;
      scheduleGenerate(true);
    }
  });
  const rnd = el('button', 'btn');
  rnd.append(document.createTextNode('Randomise '), Object.assign(el('kbd'), { textContent: 'R' }));
  rnd.addEventListener('click', () => randomSeed());
  seedRow.append(seedLabel, seedInput, rnd);
  sPreset.append(seedRow);
  refreshers.push(() => {
    seedInput.value = String(params.seed);
  });

  const sGlobal = section('Form', page);
  select(
    sGlobal,
    'Crown shape',
    (Object.keys(SHAPE_NAMES) as unknown as Shape[]).map((k) => ({ value: Number(k) as Shape, label: SHAPE_NAMES[Number(k) as Shape] })),
    () => params.botany.shape,
    (v) => (params.botany.shape = v),
    onChange,
  );
  slider(sGlobal, 'Height (m)', () => params.botany.scale, (v) => (params.botany.scale = v), { min: 1, max: 60, step: 0.5 }, onChange);
  slider(sGlobal, 'Height variation', () => params.botany.scaleV, (v) => (params.botany.scaleV = v), { min: 0, max: 20, step: 0.5 }, onChange);
  slider(sGlobal, 'Levels', () => params.botany.levels, (v) => (params.botany.levels = Math.round(v)), { min: 1, max: 4, step: 1 }, () => {
    onChange();
    for (const r of refreshers) r();
  });
  slider(sGlobal, 'Trunk ratio', () => params.botany.ratio, (v) => (params.botany.ratio = v), { min: 0.005, max: 0.06, step: 0.001, title: 'Trunk radius as a fraction of trunk length' }, onChange);
  slider(sGlobal, 'Ratio power', () => params.botany.ratioPower, (v) => (params.botany.ratioPower = v), { min: 0.5, max: 3, step: 0.05, title: 'How fast child radius falls off with relative length' }, onChange);
  slider(sGlobal, 'Root flare', () => params.botany.flare, (v) => (params.botany.flare = v), { min: 0, max: 3, step: 0.05 }, onChange);
  slider(sGlobal, 'Base splits', () => params.botany.baseSplits, (v) => (params.botany.baseSplits = Math.round(v)), { min: -3, max: 4, step: 1, title: 'Clones at the base of the trunk (negative = up to N, random)' }, onChange);
  slider(sGlobal, 'Attraction up', () => params.botany.attractionUp, (v) => (params.botany.attractionUp = v), { min: -4, max: 4, step: 0.1, title: 'Vertical tropism. Negative droops (willow), positive reaches up.' }, onChange);
  slider(sGlobal, 'Canopy flattening', () => params.botany.flatten, (v) => (params.botany.flatten = v), { min: 0, max: 1, step: 0.05, title: 'Pulls the fine growth towards the horizontal: flat-topped canopies (acacia).' }, onChange);
  slider(sGlobal, 'Culm nodes', () => params.botany.nodeSwell, (v) => (params.botany.nodeSwell = v), { min: 0, max: 0.4, step: 0.01, title: 'Periodic swelling of the trunk (bamboo). 0 = none.' }, onChange);
  slider(sGlobal, 'Node spacing', () => params.botany.nodeSpacing, (v) => (params.botany.nodeSpacing = v), { min: 0.02, max: 0.2, step: 0.005, title: 'Distance between culm nodes as a fraction of the trunk length.' }, onChange);

  const enabled = (): number => params.botany.levels;
  const lvl = (key: keyof typeof b): (() => number[]) => () => params.botany[key] as number[];
  const setLvl = (key: keyof typeof b) => (i: number, v: number) => {
    (params.botany[key] as number[])[i] = v;
  };

  const sLen = section('Length & shape per level', page);
  levelsHeader(sLen);
  levelRow(sLen, 'Length', lvl('length'), setLvl('length'), { step: 0.01, min: 0, enabled, title: 'Relative length (trunk: fraction of height)' }, onChange);
  levelRow(sLen, 'Length var.', lvl('lengthV'), setLvl('lengthV'), { step: 0.01, min: 0, enabled }, onChange);
  levelRow(sLen, 'Base size', lvl('baseSize'), setLvl('baseSize'), { step: 0.01, min: 0, max: 0.95, enabled, title: 'Bare fraction at the base of each stem' }, onChange);
  levelRow(sLen, 'Taper', lvl('taper'), setLvl('taper'), { step: 0.01, min: 0, max: 3, enabled, title: '0–1 linear taper, 1–2 spherical end, 2–3 periodic' }, onChange);
  levelRow(sLen, 'Radius mod.', lvl('radiusMod'), setLvl('radiusMod'), { step: 0.01, min: 0.05, max: 2, enabled }, onChange);

  const sCurve = section('Curvature per level', page);
  levelsHeader(sCurve);
  levelRow(sCurve, 'Segments', lvl('curveRes'), setLvl('curveRes'), { step: 1, min: 1, max: 24, integer: true, enabled }, onChange);
  levelRow(sCurve, 'Curve °', lvl('curve'), setLvl('curve'), { step: 1, enabled }, onChange);
  levelRow(sCurve, 'Curve back °', lvl('curveBack'), setLvl('curveBack'), { step: 1, enabled, title: 'S-curve: second half bends by this instead' }, onChange);
  levelRow(sCurve, 'Curve var. °', lvl('curveV'), setLvl('curveV'), { step: 1, min: 0, enabled }, onChange);
  levelRow(sCurve, 'Bend var. °', lvl('bendV'), setLvl('bendV'), { step: 1, min: 0, enabled, title: 'Random side-to-side wobble' }, onChange);

  const sSplit = section('Splitting (forks)', page);
  levelsHeader(sSplit);
  levelRow(sSplit, 'Splits / seg', lvl('segSplits'), setLvl('segSplits'), { step: 0.05, min: 0, max: 3, enabled, title: 'Clones per segment; fractional values are distributed' }, onChange);
  levelRow(sSplit, 'Split angle °', lvl('splitAngle'), setLvl('splitAngle'), { step: 1, min: 0, max: 120, enabled }, onChange);
  levelRow(sSplit, 'Split var. °', lvl('splitAngleV'), setLvl('splitAngleV'), { step: 1, min: 0, enabled }, onChange);

  const sBranch = section('Branching', page);
  levelsHeader(sBranch, ['—', 'Limbs', 'Branches', 'Twigs']);
  levelRow(sBranch, 'Count', lvl('branches'), setLvl('branches'), { step: 1, min: 0, max: 400, integer: true, enabled, title: 'Maximum children per parent stem' }, onChange);
  levelRow(sBranch, 'Down angle °', lvl('downAngle'), setLvl('downAngle'), { step: 1, min: 0, max: 170, enabled, title: 'Angle from the parent axis at emergence' }, onChange);
  levelRow(sBranch, 'Down var. °', lvl('downAngleV'), setLvl('downAngleV'), { step: 1, enabled, title: 'Negative: varies with position along the parent' }, onChange);
  levelRow(sBranch, 'Rotate °', lvl('rotate'), setLvl('rotate'), { step: 1, enabled, title: 'Phyllotactic angle between successive children (negative = alternate)' }, onChange);
  levelRow(sBranch, 'Rotate var. °', lvl('rotateV'), setLvl('rotateV'), { step: 1, min: 0, enabled }, onChange);
  levelRow(sBranch, 'Distribution', lvl('branchDist'), setLvl('branchDist'), { step: 0.5, min: 0, max: 8, enabled, title: '0 alternate · 1 opposite · >1 whorled' }, onChange);

  const sLeaf = section('Leaves (proxy cards)', page, { collapsed: true });
  slider(sLeaf, 'Leaves per twig', () => params.botany.leaves, (v) => (params.botany.leaves = Math.round(v)), { min: 0, max: 200, step: 1 }, onChange);
  slider(sLeaf, 'Leaf size', () => params.botany.leafScale, (v) => (params.botany.leafScale = v), { min: 0.02, max: 0.6, step: 0.01 }, onChange);
  slider(sLeaf, 'Leaf width', () => params.botany.leafScaleX, (v) => (params.botany.leafScaleX = v), { min: 0.1, max: 2, step: 0.05 }, onChange);
}


// -----------------------------------------------------------------------------
// Roots & site page
// -----------------------------------------------------------------------------

function buildRootsPage(): void {
  const page = pages.roots;
  page.innerHTML = '';
  placementRefreshers.length = 0;
  const R = (): TreeParams['roots'] => params.roots;
  const E = (): TreeParams['environment'] => params.environment;

  const s1 = section('Root system', page);
  check(s1, 'Grow roots', () => R().enabled, (v) => (R().enabled = v), onChange);
  slider(s1, 'Primary roots', () => R().count, (v) => (R().count = Math.round(v)), { min: 1, max: 12, step: 1, title: 'Roots leaving the trunk base; the trunk gets one buttress lobe per root' }, onChange);
  slider(s1, 'Length', () => R().length, (v) => (R().length = v), { min: 0.04, max: 0.6, step: 0.01, title: 'Fraction of the tree height', format: (v) => `${(v * params.botany.scale).toFixed(1)} m` }, onChange);
  slider(s1, 'Length variation', () => R().lengthV, (v) => (R().lengthV = v), { min: 0, max: 0.3, step: 0.01 }, onChange);
  slider(s1, 'Radius', () => R().radius, (v) => (R().radius = v), { min: 0.1, max: 0.68, step: 0.01, title: 'Fraction of the trunk radius' }, onChange);
  slider(s1, 'Radius variation', () => R().radiusV, (v) => (R().radiusV = v), { min: 0, max: 0.5, step: 0.01 }, onChange);
  slider(s1, 'Taper', () => R().taper, (v) => (R().taper = v), { min: 0.3, max: 2, step: 0.05, title: '<1 stays thick for longer, >1 thins out quickly' }, onChange);
  slider(s1, 'Exit height', () => R().emergeHeight, (v) => (R().emergeHeight = v), { min: 0, max: 2.5, step: 0.05, title: 'Height of the root above the ground where it leaves the trunk, in root radii' }, onChange);
  slider(s1, 'Descent °', () => R().descent, (v) => (R().descent = v), { min: 0, max: 60, step: 1, title: 'Initial pitch below the horizontal' }, onChange);
  slider(s1, 'Exposure', () => R().exposure, (v) => (R().exposure = v), { min: 0, max: 1, step: 0.02, title: '0 = flush with the soil · 0.5 = half buried · 1 = lying on top' }, onChange);
  slider(s1, 'Meander', () => R().wander, (v) => (R().wander = v), { min: 0, max: 1.5, step: 0.05 }, onChange);
  slider(s1, 'Dive at', () => R().dive, (v) => (R().dive = v), { min: 0.3, max: 1, step: 0.02, title: 'Fraction of the length after which the tip dives underground' }, onChange);

  const s2 = section('Branching', page);
  slider(s2, 'Fork chance', () => R().forks, (v) => (R().forks = v), { min: 0, max: 1, step: 0.05 }, onChange);
  slider(s2, 'Laterals per root', () => R().laterals, (v) => (R().laterals = Math.round(v)), { min: 0, max: 6, step: 1 }, onChange);
  slider(s2, 'Lateral radius', () => R().lateralRadius, (v) => (R().lateralRadius = v), { min: 0.2, max: 0.68, step: 0.01, title: 'Relative to the parent root' }, onChange);
  slider(s2, 'Lateral length', () => R().lateralLength, (v) => (R().lateralLength = v), { min: 0.1, max: 1.2, step: 0.05, title: 'Relative to the remaining parent length' }, onChange);

  const s3 = section('Response to objects', page);
  slider(s3, 'Attraction', () => R().attraction, (v) => (R().attraction = v), { min: 0, max: 1, step: 0.05, title: 'Pull towards nearby objects (0 = indifferent)' }, onChange);
  slider(s3, 'Grip', () => R().grip, (v) => (R().grip = v), { min: 0, max: 1, step: 0.05, title: 'How deeply the root presses into the object it follows' }, onChange);
  slider(s3, 'Climb height', () => R().climb, (v) => (R().climb = v), { min: 0, max: 12, step: 0.5, title: 'Objects up to this many root diameters tall are climbed over; taller ones are skirted' }, onChange);

  const s4 = section('Objects on site', page, { hint: `${E().obstacles.length}` });
  const tools = el('div', 'obj-tools');
  const kindSel = el('select');
  for (const [v, l] of [
    ['rock', 'Rock'],
    ['block', 'Block'],
  ] as [ObstacleKind, string][]) {
    const o = el('option', '', l);
    o.value = v;
    kindSel.append(o);
  }
  kindSel.value = addKind;
  kindSel.addEventListener('change', () => (addKind = kindSel.value as ObstacleKind));
  const placeBtn = el('button', 'btn', 'Place in viewport');
  placeBtn.addEventListener('click', () => setPlacing(!viewer.isPlacing));
  placementRefreshers.push(() => placeBtn.classList.toggle('primary', viewer.isPlacing));
  const scatterBtn = el('button', 'btn ghost', 'Scatter');
  scatterBtn.title = 'Replace the objects with a random layout within root reach';
  scatterBtn.addEventListener('click', () => {
    const sc = E().scatter;
    const next = scatterFor(params, Math.floor(Math.random() * 99999) + 1, sc.count);
    next.blocks = sc.blocks;
    next.burial = sc.burial;
    next.roughness = sc.roughness;
    E().scatter = next;
    E().obstacles = scatterObstacles(next, trunkBaseRadius(params.botany));
    selectedObstacle = -1;
    buildRootsPage();
    scheduleGenerate(true);
  });
  const clearBtn = el('button', 'btn ghost', 'Clear');
  clearBtn.addEventListener('click', () => {
    E().obstacles = [];
    selectedObstacle = -1;
    buildRootsPage();
    scheduleGenerate(true);
  });
  tools.append(kindSel, placeBtn, scatterBtn, clearBtn);
  s4.append(tools);
  slider(s4, 'Scatter count', () => E().scatter.count, (v) => (E().scatter.count = Math.round(v)), { min: 0, max: 12, step: 1 }, () => undefined);
  slider(s4, 'Block share', () => E().scatter.blocks, (v) => (E().scatter.blocks = v), { min: 0, max: 1, step: 0.05, title: 'Fraction of scattered objects that are blocks' }, () => undefined);

  const list = el('div', 'obj-list');
  const obs = E().obstacles;
  if (obs.length === 0) list.append(el('p', 'note', 'No objects. Place one in the viewport, or scatter a few – roots grow onto whatever stands within their reach and can be dragged around afterwards.'));
  obs.forEach((o, i) => {
    const row = el('div', 'obj-row' + (i === selectedObstacle ? ' selected' : ''));
    const head = el('div', 'obj-head');
    const title = el('span', 'obj-title', `${o.kind === 'rock' ? 'Rock' : 'Block'} ${i + 1}`);
    const pos = el('span', 'obj-pos', `${o.x.toFixed(2)}, ${o.z.toFixed(2)} m`);
    const del = el('button', 'btn ghost small', 'Remove');
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeObstacle(i);
    });
    head.append(title, pos, del);
    head.addEventListener('click', () => {
      selectedObstacle = selectedObstacle === i ? -1 : i;
      buildRootsPage();
    });
    row.append(head);
    if (i === selectedObstacle) {
      const body = el('div', 'obj-body');
      const set = (fn: (o: ObstacleSpec) => void) => (): void => {
        fn(o);
        pos.textContent = `${o.x.toFixed(2)}, ${o.z.toFixed(2)} m`;
        onChange();
      };
      select(body, 'Type', [{ value: 'rock', label: 'Rock' }, { value: 'block', label: 'Block' }], () => o.kind, (v) => (o.kind = v as ObstacleKind), set(() => undefined));
      slider(body, 'Size (m)', () => o.size, (v) => (o.size = v), { min: 0.1, max: 4, step: 0.05 }, set(() => undefined));
      slider(body, 'X (m)', () => o.x, (v) => (o.x = v), { min: -15, max: 15, step: 0.05 }, set(() => undefined));
      slider(body, 'Z (m)', () => o.z, (v) => (o.z = v), { min: -15, max: 15, step: 0.05 }, set(() => undefined));
      slider(body, 'Rotation °', () => (o.yaw * 180) / Math.PI, (v) => (o.yaw = (v * Math.PI) / 180), { min: 0, max: 360, step: 1 }, set(() => undefined));
      slider(body, 'Burial', () => o.burial, (v) => (o.burial = v), { min: 0, max: 0.9, step: 0.02, title: '0 = resting on the ground · 0.5 = half buried' }, set(() => undefined));
      slider(body, 'Roughness', () => o.roughness, (v) => (o.roughness = v), { min: 0, max: 0.5, step: 0.01 }, set(() => undefined));
      slider(body, 'Stretch X', () => o.aspect[0], (v) => (o.aspect[0] = v), { min: 0.4, max: 3, step: 0.05 }, set(() => undefined));
      slider(body, 'Height', () => o.aspect[1], (v) => (o.aspect[1] = v), { min: 0.2, max: 3, step: 0.05 }, set(() => undefined));
      slider(body, 'Stretch Z', () => o.aspect[2], (v) => (o.aspect[2] = v), { min: 0.4, max: 3, step: 0.05 }, set(() => undefined));
      row.append(body);
    }
    list.append(row);
  });
  s4.append(list);

  page.append(
    Object.assign(el('p', 'note'), {
      textContent:
        'Roots are grown by a turtle that senses the ground and the objects around the tree: it climbs onto whatever it can, presses into the surface it follows, wraps around what it cannot climb and dives underground at the tip. Every root is welded into the trunk through a junction window like any branch, so the whole plant stays one closed quad surface. Drag objects in the viewport to move them; press B to frame the base.',
      style: 'padding: 10px 14px',
    }),
  );
}

function buildMeshPage(): void {
  const page = pages.mesh;
  page.innerHTML = '';
  const m = (): TreeParams['mesh'] => params.mesh;
  const s1 = section('Resolution', page);
  slider(s1, 'Trunk ring segments', () => m().trunkRadialSegments, (v) => (m().trunkRadialSegments = Math.round(v / 2) * 2), { min: 8, max: 48, step: 2, title: 'Vertices around the trunk. Children derive their ring size from the window they grow out of.' }, onChange);
  levelsHeader(s1);
  levelRow(s1, 'Rings / segment', () => m().ringsPerSegment, (i, v) => (m().ringsPerSegment[i] = v), { step: 1, min: 1, max: 8, integer: true, enabled: () => params.botany.levels }, onChange);
  slider(s1, 'Root ring segments', () => m().rootRadialSegments, (v) => (m().rootRadialSegments = Math.round(v / 2) * 2), { min: 6, max: 24, step: 2, title: 'Minimum vertices around a primary root where it leaves the trunk' }, onChange);
  slider(s1, 'Min radius (mm)', () => m().minRadius * 1000, (v) => (m().minRadius = v / 1000), { min: 1, max: 30, step: 0.5 }, onChange);
  slider(s1, 'Cull below (mm)', () => m().cullRadius * 1000, (v) => (m().cullRadius = v / 1000), { min: 0, max: 40, step: 0.5, title: 'Skip stems thinner than this (LOD)' }, onChange);
  check(s1, 'Cap stem tips', () => m().capTips, (v) => (m().capTips = v), onChange);

  const s2 = section('Junctions', page);
  slider(s2, 'Collar width', () => m().collarScale, (v) => (m().collarScale = v), { min: 1.0, max: 2.2, step: 0.05, title: 'Window size relative to the child diameter' }, onChange);
  slider(s2, 'Collar length', () => m().collarLength, (v) => (m().collarLength = v), { min: 0.2, max: 2.5, step: 0.05, title: 'Distance of the first full child ring from the parent surface, in child radii' }, onChange);
  slider(s2, 'Collar rings', () => m().collarRings, (v) => (m().collarRings = Math.round(v)), { min: 0, max: 3, step: 1, title: 'Intermediate edge loops between the window and the first child ring' }, onChange);
  slider(s2, 'Collar fillet', () => m().collarFillet, (v) => (m().collarFillet = v), { min: 0, max: 1, step: 0.05, title: '0 = straight chamfer, 1 = tangent-continuous fillet' }, onChange);
  slider(s2, 'Collar mitre', () => m().collarMitre, (v) => (m().collarMitre = v), { min: 0, max: 0.9, step: 0.05, title: 'Tilt of the first child ring towards the parent surface' }, onChange);
  slider(s2, 'Fork area conservation', () => m().forkRadiusConservation, (v) => (m().forkRadiusConservation = v), { min: 0, max: 1, step: 0.05, title: '0: forks keep the parent radius (Weber–Penn) · 1: cross-section area is conserved (da Vinci rule)' }, onChange);

  const s3 = section('Root buttresses', page);
  slider(s3, 'Lobes', () => m().rootLobes, (v) => (m().rootLobes = Math.round(v)), { min: 0, max: 9, step: 1, title: 'Used when the root system is disabled; otherwise one lobe per primary root' }, onChange);
  slider(s3, 'Amplitude', () => m().rootLobeAmplitude, (v) => (m().rootLobeAmplitude = v), { min: 0, max: 1, step: 0.02 }, onChange);
  slider(s3, 'Height', () => m().rootLobeHeight, (v) => (m().rootLobeHeight = v), { min: 0.02, max: 0.3, step: 0.01, title: 'Fraction of trunk length over which the lobes fade' }, onChange);

  page.append(
    Object.assign(el('p', 'note'), {
      textContent:
        'The branch system is a single closed quad surface. Side branches grow out of a rectangular window cut into the parent ring grid; forks split the parent ring into arcs joined by a crotch bridge. Nothing is intersected or merged.',
      style: 'padding: 10px 14px',
    }),
  );
}

function buildViewPage(): void {
  const page = pages.view;
  page.innerHTML = '';
  const s1 = section('Wind', page);
  viewRefreshers.push(check(s1, 'Enabled', () => view.windEnabled, (v) => (view.windEnabled = v), syncView).refresh);
  viewRefreshers.push(slider(s1, 'Strength', () => view.windStrength, (v) => (view.windStrength = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Gustiness', () => view.windGust, (v) => (view.windGust = v), { min: 0, max: 1.5, step: 0.05 }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Direction °', () => view.windDirection, (v) => (view.windDirection = v), { min: 0, max: 360, step: 1 }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Trunk flex', () => view.trunkFlex, (v) => (view.trunkFlex = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Limb flex', () => view.limbFlex, (v) => (view.limbFlex = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Detail flutter', () => view.detailFlex, (v) => (view.detailFlex = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);

  const s2 = section('Display', page);
  viewRefreshers.push(check(s2, 'Quad overlay', () => view.showWire, (v) => (view.showWire = v), syncView).refresh);
  viewRefreshers.push(check(s2, 'Leaf cards', () => view.showLeaves, (v) => (view.showLeaves = v), syncView).refresh);
  viewRefreshers.push(check(s2, 'Grid', () => view.showGrid, (v) => (view.showGrid = v), syncView).refresh);
  viewRefreshers.push(check(s2, 'Site objects', () => view.showObstacles, (v) => (view.showObstacles = v), syncView).refresh);
  viewRefreshers.push(check(s2, 'See-through ground', () => view.xrayGround, (v) => (view.xrayGround = v), syncView).refresh);
  viewRefreshers.push(check(s2, 'Turntable', () => view.autoRotate, (v) => (view.autoRotate = v), syncView).refresh);
  page.append(
    Object.assign(el('p', 'note'), {
      textContent: 'Wind is evaluated in the vertex shader from per-vertex data baked by the generator: normalised height (trunk sway), limb weight + pivot (limb bending) and a detail weight (twig flutter). Because branches and twigs share one welded surface, the deformation is continuous through every junction.',
      style: 'padding: 10px 14px',
    }),
  );
}

function randomSeed(): void {
  params.seed = Math.floor(Math.random() * 99999) + 1;
  for (const r of refreshers) r();
  scheduleGenerate(true);
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

function requestExport(format: 'obj' | 'glb'): void {
  exportObj.disabled = exportGlb.disabled = true;
  showToast(`Building ${format.toUpperCase()}…`);
  const msg: WorkerRequest = { type: 'export', id: ++reqId, params: cloneParams(params), format, includeLeaves: view.showLeaves };
  worker.postMessage(msg);
}
exportObj.addEventListener('click', () => requestExport('obj'));
exportGlb.addEventListener('click', () => requestExport('glb'));

function download(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 5000);
}

let toastTimer = 0;
function showToast(text: string): void {
  toast.textContent = text;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------

buildBotanyPage();
buildRootsPage();
buildMeshPage();
buildViewPage();
syncView();
generate();

// Expose for debugging / automation.
(window as unknown as { frontier: unknown }).frontier = {
  get params() {
    return params;
  },
  get result() {
    return lastResult;
  },
  view,
  viewer,
  setPreset(name: string) {
    params = cloneParams(PRESETS.find((p) => p.name === name) ?? PRESETS[0]);
    selectedObstacle = -1;
    frameOnNext = true;
    buildBotanyPage();
    buildRootsPage();
    buildMeshPage();
    scheduleGenerate(true);
  },
  setSeed(seed: number) {
    params.seed = seed;
    scheduleGenerate(true);
  },
  /** Deep-merge arbitrary parameter overrides (debug / automation). */
  setParams(partial: {
    botany?: Partial<TreeParams['botany']>;
    mesh?: Partial<TreeParams['mesh']>;
    roots?: Partial<TreeParams['roots']>;
    environment?: Partial<TreeParams['environment']>;
    seed?: number;
    name?: string;
  }) {
    if (partial.botany) Object.assign(params.botany, partial.botany);
    if (partial.mesh) Object.assign(params.mesh, partial.mesh);
    if (partial.roots) Object.assign(params.roots, partial.roots);
    if (partial.environment) Object.assign(params.environment, partial.environment);
    if (partial.seed !== undefined) params.seed = partial.seed;
    if (partial.name) params.name = partial.name;
    buildBotanyPage();
    buildRootsPage();
    buildMeshPage();
    scheduleGenerate(true);
  },
  frameBase: () => viewer.frameBase(rootReach(params)),
  /** Replace the site objects (debug / automation). */
  setObstacles(obstacles: ObstacleSpec[]) {
    params.environment.obstacles = obstacles;
    selectedObstacle = -1;
    buildRootsPage();
    scheduleGenerate(true);
  },
  setMode(mode: DisplayMode) {
    view.mode = mode;
    syncView();
  },
  setView(partial: Partial<ViewerSettings>) {
    Object.assign(view, partial);
    syncView();
  },
  regenerate: () => scheduleGenerate(true),
  frame: () => viewer.frame(),
  ready: () => !busy && hasTree,
  setCamera(pos: [number, number, number], target: [number, number, number]) {
    viewer.camera.position.set(pos[0], pos[1], pos[2]);
    viewer.controls.target.set(target[0], target[1], target[2]);
    viewer.controls.update();
  },
  /** Find a junction (side attachment) of a given level for close-up inspection. */
  junctionSamples(level: number, count = 3, kind?: string) {
    const r = lastResult;
    if (!r) return [];
    return r.samples.filter((s) => s.level === level && (!kind || s.kind === kind)).slice(0, count);
  },
};
