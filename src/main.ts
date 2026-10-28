import './ui/styles.css';
import { PRESETS, PRESET_GROUPS, TreeParams, PlantKind, cloneParams, SHAPE_NAMES, Shape, scatterFor, trunkBaseRadius, rootReach, isGrass, isSucculent, isVegetable, isCarnivore, isOrganPlant, plantKind } from './tree/params';
import { GrassParams, Inflorescence, INFLORESCENCE_NAMES, HEAD_BRANCH_NAMES, grassHeight, grassHabit } from './plant/grassParams';
import { SucculentParams, SucculentForm, SUCCULENT_FORM_NAMES, Inflorescence as StalkInflorescence, INFLORESCENCE_NAMES as STALK_INFLORESCENCE_NAMES, StalkOrigin, STALK_ORIGIN_NAMES, FlowerKind, FLOWER_KIND_NAMES, succulentHeight, succulentHabit } from './plant/succulentParams';
import { VegetableParams, VegetableForm, FruitShape, LeafShape, VEGETABLE_FORM_NAMES, FRUIT_SHAPE_NAMES, vegetableHeight, vegetableHabit } from './plant/vegetableParams';
import { CarnivoreParams, CarnivoreForm, TrapKind, HoodKind, CARNIVORE_FORM_NAMES, TRAP_NAMES, HOOD_NAMES, carnivoreHeight, carnivoreHabit } from './plant/carnivoreParams';
import { Viewer, DEFAULT_VIEW, ViewerSettings, DisplayMode } from './viewer/scene';
import { el, icon, button, section, slider, select, check, stepper, levelsHeader, levelRow, fmtInt, fmtCompact } from './ui/controls';
import type { WorkerRequest, WorkerResponse, GenerateResponse } from './worker/tree.worker';
import { LeafMesh } from './tree/mesh';
import { GpuBuffers } from './tree/export';
import { ObstacleKind, ObstacleSpec, makeObstacle, scatterObstacles } from './env/environment';
import { Random } from './core/random';

const APP_NAME = 'Frontier';

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
// Layout: three floating cards – Library · Viewport · Inspector
// -----------------------------------------------------------------------------

const app = document.getElementById('app')!;
app.append(el('div', 'bg'));

// ---- Library (left) ---------------------------------------------------------

const library = el('aside', 'card library');
{
  const head = el('div', 'card-head');
  const h1 = el('h1');
  h1.append(el('span', 'dot green'), document.createTextNode('Library'));
  head.append(h1, el('span', 'badge', APP_NAME + ' · species'));
  library.append(head);
}
const libTiles = el('div', 'tiles');
const tileSpecies = el('div', 'tile');
const tileFaces = el('div', 'tile');
libTiles.append(tileSpecies, tileFaces);
library.append(libTiles);

const searchRow = el('div', 'search');
searchRow.append(icon('search'));
const searchInput = el('input');
searchInput.placeholder = 'Search species…';
searchInput.spellcheck = false;
searchRow.append(searchInput);
library.append(searchRow);

const libTree = el('div', 'tree');
library.append(libTree);

const libFoot = el('div', 'card-foot');
library.append(libFoot);

// ---- Viewport (centre) ------------------------------------------------------

const viewport = el('main', 'card viewport');
const canvas = el('canvas');
viewport.append(canvas);

const vtop = el('div', 'vtop');
const modeSeg = el('div', 'seg');
const MODES: { id: DisplayMode; label: string }[] = [
  { id: 'shaded', label: 'Shaded' },
  { id: 'matcap', label: 'Clay' },
  { id: 'wireframe', label: 'Wire' },
  { id: 'levels', label: 'Levels' },
  { id: 'junctions', label: 'Junctions' },
  { id: 'wind', label: 'Wind' },
];
const modeButtons = new Map<DisplayMode, HTMLButtonElement>();
for (const m of MODES) {
  const b = el('button', m.id === view.mode ? 'on' : '', m.label);
  b.addEventListener('click', () => {
    view.mode = m.id;
    syncView();
  });
  modeButtons.set(m.id, b);
  modeSeg.append(b);
}
const toggleSeg = el('div', 'seg');
const wireToggle = el('button');
wireToggle.append(icon('quad'), el('span', '', 'Quads'));
wireToggle.title = 'Quad overlay';
wireToggle.addEventListener('click', () => {
  view.showWire = !view.showWire;
  syncView();
});
const windToggle = el('button');
windToggle.append(icon('wind'), el('span', '', 'Wind'));
windToggle.title = 'Animate wind';
windToggle.addEventListener('click', () => {
  view.windEnabled = !view.windEnabled;
  syncView();
});
const leavesToggle = el('button');
leavesToggle.append(icon('leaf'), el('span', '', 'Leaves'));
leavesToggle.title = 'Leaf cards';
leavesToggle.addEventListener('click', () => {
  view.showLeaves = !view.showLeaves;
  syncView();
});
const touchToggle = el('button');
touchToggle.append(icon('touch'), el('span', '', 'Touch'));
touchToggle.title = 'GPU collision: a walker and a draggable hand collider bend the plant through a spring displacement field computed on the GPU';
touchToggle.addEventListener('click', () => {
  view.pushEnabled = !view.pushEnabled;
  syncView();
});
toggleSeg.append(wireToggle, leavesToggle, windToggle, touchToggle);
const actionSeg = el('div', 'seg');
const frameBtn = el('button');
frameBtn.append(icon('frame'), el('span', '', 'Frame'));
frameBtn.title = 'Frame the tree · F';
const shotBtn = el('button');
shotBtn.append(icon('camera'));
shotBtn.title = 'Save a PNG of the viewport';
actionSeg.append(frameBtn, shotBtn);
const exportSeg = el('div', 'seg');
const exportObj = el('button');
exportObj.append(icon('download'), el('span', '', 'OBJ'));
const exportGlb = el('button');
exportGlb.append(icon('download'), el('span', '', 'GLB'));
exportSeg.append(exportObj, exportGlb);
vtop.append(modeSeg, el('span', 'spacer'), toggleSeg, actionSeg, exportSeg);
viewport.append(vtop);

const axisHud = el('div', 'axis-hud');
const camPill = el('div', 'pill');
const sizePill = el('div', 'pill');
axisHud.append(sizePill, camPill);
viewport.append(axisHud);

const vtitle = el('div', 'vtitle');
const vtitleName = el('span', 'n');
const vtitleMeta = el('span', 'm');
vtitle.append(vtitleName, vtitleMeta);
viewport.append(vtitle);

const hud = el('div', 'hud');
const navPill = el('div', 'nav glass keysbar');
const keys = el('div', 'keys');
for (const [k, l] of [
  ['LMB', 'orbit'],
  ['RMB', 'pan'],
  ['F', 'frame'],
  ['B', 'base'],
  ['R', 'reseed'],
]) {
  keys.append(el('span', 'k', k), el('span', 'kl', l));
}
navPill.append(keys);
const status = el('div', 'nav glass status');
const statusDot = el('span', 'sdot');
const statusText = el('span', '', 'Idle');
status.append(statusDot, statusText);
hud.append(status, navPill);
viewport.append(hud);

const legend = el('div', 'legend');
viewport.append(legend);

const toast = el('div', 'toast');
viewport.append(toast);

const errBar = el('div', 'errbar');
viewport.append(errBar);

// ---- Inspector (right) ------------------------------------------------------

const panel = el('aside', 'card inspector');
const inspectorBadge = el('span', 'badge', 'tree · welded');
{
  const head = el('div', 'card-head');
  const h1 = el('h1');
  h1.append(el('span', 'dot orange'), document.createTextNode('Inspector'));
  head.append(h1, inspectorBadge);
  panel.append(head);
}
const hero = el('div', 'hero');
panel.append(hero);
const presence = el('div', 'presence');
panel.append(presence);

const tabs = el('div', 'tabs');
const tabBotany = el('button', 'on', 'Botany');
const tabGrass = el('button', '', 'Grass');
const tabSucculent = el('button', '', 'Succulent');
const tabVegetable = el('button', '', 'Crop');
const tabCarnivore = el('button', '', 'Trap');
const tabRoots = el('button', '', 'Roots');
const tabMesh = el('button', '', 'Mesh');
const tabView = el('button', '', 'View');
const tabReport = el('button', '', 'Topology');
tabs.append(tabBotany, tabGrass, tabSucculent, tabVegetable, tabCarnivore, tabRoots, tabMesh, tabView, tabReport);
const scroll = el('div', 'insp');
panel.append(tabs, scroll);

const pages = {
  botany: el('div'),
  grass: el('div'),
  succulent: el('div'),
  vegetable: el('div'),
  carnivore: el('div'),
  roots: el('div'),
  mesh: el('div'),
  view: el('div'),
  report: el('div'),
};
scroll.append(pages.botany, pages.grass, pages.succulent, pages.vegetable, pages.carnivore, pages.roots, pages.mesh, pages.view, pages.report);
const tabMap: [HTMLButtonElement, HTMLElement][] = [
  [tabBotany, pages.botany],
  [tabGrass, pages.grass],
  [tabSucculent, pages.succulent],
  [tabVegetable, pages.vegetable],
  [tabCarnivore, pages.carnivore],
  [tabRoots, pages.roots],
  [tabMesh, pages.mesh],
  [tabView, pages.view],
  [tabReport, pages.report],
];
/** Tabs that only apply to one plant kind (the View and Topology tabs are shared). */
const kindTabs: Record<PlantKind, HTMLButtonElement[]> = {
  tree: [tabBotany, tabRoots, tabMesh],
  grass: [tabGrass],
  succulent: [tabSucculent],
  vegetable: [tabVegetable],
  carnivore: [tabCarnivore],
};
const KIND_LABEL: Record<PlantKind, string> = { tree: 'tree', grass: 'grass', succulent: 'succulent', vegetable: 'vegetable', carnivore: 'carnivorous' };
function showTab(btn: HTMLButtonElement): void {
  for (const [b, p] of tabMap) {
    b.classList.toggle('on', b === btn);
    p.style.display = b === btn ? '' : 'none';
  }
  scroll.scrollTop = 0;
}
for (const [btn] of tabMap) btn.addEventListener('click', () => showTab(btn));
/** Show the tabs of the current plant kind; switch to its first tab if the active one does not apply. */
function syncTabs(): void {
  const kind = plantKind(params);
  const mine = new Set(kindTabs[kind]);
  const others = new Set<HTMLButtonElement>();
  for (const k of Object.keys(kindTabs) as PlantKind[]) if (k !== kind) kindTabs[k].forEach((b) => others.add(b));
  for (const [b] of tabMap) b.style.display = others.has(b) && !mine.has(b) ? 'none' : '';
  const active = tabMap.find(([b]) => b.classList.contains('on'))?.[0];
  if (!active || active.style.display === 'none') showTab(kindTabs[kind][0]);
  inspectorBadge.textContent = `${KIND_LABEL[kind]} · welded`;
}
showTab(tabBotany);

const cmdline = el('div', 'cmdline');
const cmdPrompt = el('span', 'prompt', '›');
const cmdInput = el('input');
cmdInput.placeholder = 'command · seed 42 · preset oak · mode wire · export glb · help';
cmdInput.spellcheck = false;
cmdline.append(cmdPrompt, cmdInput);
panel.append(cmdline);

app.append(library, viewport, panel);

// -----------------------------------------------------------------------------
// Viewer
// -----------------------------------------------------------------------------

const viewer = new Viewer(canvas);
const narrowObserver = new ResizeObserver(() => viewport.classList.toggle('narrow', viewport.clientWidth < 860));
narrowObserver.observe(viewport);
let camTick = 0;
viewer.onFrame(() => {
  if (++camTick % 6 !== 0) return;
  const az = ((viewer.controls.getAzimuthalAngle() * 180) / Math.PI + 360) % 360;
  const elv = 90 - (viewer.controls.getPolarAngle() * 180) / Math.PI;
  camPill.textContent = `persp · az ${az.toFixed(0)}° · el ${elv.toFixed(0)}° · d ${viewer.controls.getDistance().toFixed(1)} m · ${viewer.fps.toFixed(0)} fps`;
});
frameBtn.addEventListener('click', () => viewer.frame());
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  if (e.key === 'f' || e.key === 'F') viewer.frame();
  if (e.key === 'b' || e.key === 'B') viewer.frameBase(baseReach());
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

/** Radius of interest around the base: root reach for trees, the crown / clump / vine spread for the other plants. */
function baseReach(): number {
  if (isGrass(params) && params.grass) return Math.max(0.2, params.grass.crownRadius * 3);
  if (isSucculent(params) && params.succulent) {
    const c = params.succulent;
    return Math.max(0.3, c.form === 'rosette' ? c.leafLength * 1.2 : c.form === 'pad' ? c.padLength * 2 : Math.max(c.radius * 4, c.stems > 1 ? c.clumpRadius * 1.5 : 0));
  }
  if (isVegetable(params) && params.vegetable) {
    const v = params.vegetable;
    return Math.max(0.3, v.form === 'vine' ? v.height * 0.8 : v.form === 'rosette' ? v.leafLength * 1.5 : v.height * 0.5);
  }
  if (isCarnivore(params) && params.carnivore) {
    const c = params.carnivore;
    return Math.max(0.2, c.form === 'vine' ? c.height * 0.6 : c.form === 'pitcher' ? c.pitcherHeight * 0.6 : c.leafLength * 1.5);
  }
  return rootReach(params);
}

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
  if (lastResult) refreshPresence();
  for (const [id, b] of modeButtons) b.classList.toggle('on', id === view.mode);
  wireToggle.classList.toggle('on', view.showWire);
  windToggle.classList.toggle('on', view.windEnabled);
  touchToggle.classList.toggle('on', view.pushEnabled);
  leavesToggle.classList.toggle('on', view.showLeaves);
  legend.style.display = view.mode === 'levels' || view.mode === 'junctions' || view.mode === 'wind' ? '' : 'none';
  legend.innerHTML = '';
  if (view.mode === 'levels') {
    const names = LEVEL_NAMES[plantKind(params)];
    const items: [string, string][] = isOrganPlant(params)
      ? [
          [names[0], '#8a5a3c'],
          [names[1], '#c98b4b'],
          [names[2], '#6fa16b'],
          [names[3], '#5aa1c9'],
        ]
      : [
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
    setStatus('err', 'Generation failed');
    errBar.textContent = msg.message;
    errBar.classList.add('show');
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
  statusDot.className = 'sdot ' + kind;
  statusText.textContent = text;
  if (kind !== 'err') errBar.classList.remove('show');
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------

function kvSpan(ico: string, label: string, value: string, cls = ''): HTMLElement {
  const sp = el('span', 'kv' + (cls ? ' ' + cls : ''));
  sp.append(icon(ico), document.createTextNode(label + (value ? ' ' : '')));
  if (value) sp.append(el('b', '', value));
  return sp;
}

function refreshPresence(): void {
  const cells = presence.querySelectorAll<HTMLElement>('.pcell');
  const states = [view.showLeaves, view.showObstacles, view.showGrid, view.windEnabled];
  cells.forEach((c, i) => c.classList.toggle('on', states[i]));
}

/** Display names of the four organ levels per plant kind (Levels view, census, spark chart). */
const LEVEL_NAMES: Record<PlantKind, [string, string, string, string]> = {
  tree: ['Trunk', 'Limbs', 'Branches', 'Twigs'],
  grass: ['Crown', 'Culms', 'Blades', 'Heads'],
  succulent: ['Body', 'Arms · pads', 'Leaves · fruit', 'Areoles · spines'],
  vegetable: ['Stem · root', 'Branches · stalks', 'Leaves', 'Fruit · pods'],
  carnivore: ['Crown · stem', 'Leaves · pitchers', 'Hoods · flowers', 'Teeth · tentacles'],
};

function groupOf(name: string): string {
  return PRESET_GROUPS.find((g) => g.names.includes(name))?.label ?? 'Custom';
}

function groupIcon(name: string): string {
  const g = groupOf(name);
  if (GROUP_ICON[g]) return GROUP_ICON[g];
  if (g.includes('conifer') || g.includes('Rocky')) return 'conifer';
  if (g === 'Jungle') return 'palm';
  if (g === 'Savanna') return 'acacia';
  if (g === 'Desert') return 'yucca';
  return 'tree';
}

/** Tiny bar chart of stems per level (trunk → twigs → roots) in the hero card. */
function drawSpark(cv: HTMLCanvasElement, levels: number[], roots: number, labels = ['L0', 'L1', 'L2', 'L3', 'R']): void {
  const w = 96;
  const h = 56;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const vals = labels.length > levels.length ? [...levels, roots] : levels;
  const max = Math.max(1, ...vals);
  const colours = ['#8a5a3c', '#c98b4b', '#6fa16b', '#5aa1c9', '#b86b5c'];
  const bw = 12;
  const gap = (w - bw * vals.length) / (vals.length - 1);
  vals.forEach((v, i) => {
    const bh = Math.max(2, (Math.log1p(v) / Math.log1p(max)) * (h - 14));
    const x = i * (bw + gap);
    ctx.fillStyle = colours[i];
    ctx.globalAlpha = 0.9;
    roundRect(ctx, x, h - 12 - bh, bw, bh, 3);
    ctx.fill();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.font = '8px JetBrains Mono Variable, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + bw / 2, h - 2);
  });
  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function updateReport(r: GenerateResponse): void {
  const rep = r.report;
  const ok = rep.closed && rep.manifold && rep.components === 1 && rep.genus === 0;
  setStatus(ok ? 'ok' : 'warn', ok ? 'Closed manifold · genus 0' : 'Topology issues – see report');

  // Hero card: species, height, mesh census.
  hero.innerHTML = '';
  const cTop = el('div', 'c-top');
  const ico = el('span', 'ico');
  ico.append(icon(groupIcon(params.name)));
  const heroText = el('div', 't');
  heroText.append(el('span', 'n', params.name), el('span', 'm', `${groupOf(params.name).toLowerCase()} · seed ${params.seed} · ${r.timings.total.toFixed(0)} ms`));
  cTop.append(ico, heroText);
  const grass = isGrass(params);
  const organ = isOrganPlant(params);
  const kind = plantKind(params);
  const big = el('div', 'big');
  const hSmall = r.summary.height < 1;
  big.append(el('span', 'v', hSmall ? (r.summary.height * 100).toFixed(0) : r.summary.height.toFixed(organ ? 2 : 1)), el('span', 'u', hSmall ? 'cm' : 'm'), el('span', 'lab', 'height'));
  const side = el('div', 'side');
  const cell = (k: string, v: string, cls = ''): void => {
    const d = el('div');
    d.append(el('span', 'k', k), el('span', 'v2' + (cls ? ' ' + cls : ''), v));
    side.append(d);
  };
  cell('faces', fmtCompact(rep.faces));
  cell('quads', `${(rep.quadRatio * 100).toFixed(rep.quadRatio > 0.9995 ? 0 : 1)} %`);
  if (grass && r.grass) {
    cell('blades', fmtInt(r.grass.blades));
    cell('culms', fmtInt(r.grass.culms));
    cell('organs', fmtCompact(r.grass.organs));
  } else if (organ && r.organs) {
    const top = organCensus(r.organs, kind).slice(0, 2);
    for (const [k, v] of top) cell(k, fmtCompact(v));
    cell('organs', fmtCompact(r.organs.organs));
  } else {
    cell('stems', fmtInt(r.summary.stems));
    cell('roots', `${r.summary.primaryRoots} / ${r.summary.rootStems}`);
    cell('leaves', fmtCompact(r.summary.leaves));
  }
  cell('genus', ok ? '0 · closed' : `${rep.genus} · ${rep.components} part${rep.components === 1 ? '' : 's'}`, ok ? 'ok' : 'warn');
  const spark = el('canvas', 'spark');
  hero.append(cTop, big, side, spark);
  if (organ) drawSpark(spark, r.summary.stemsPerLevel.slice(0, 4), 0, LEVEL_NAMES[kind].map((n) => n.split(' ')[0].toLowerCase()));
  else drawSpark(spark, r.summary.stemsPerLevel.slice(0, 4), r.summary.rootStems);

  // Presence grid: the four toggles that decide what the viewport shows.
  presence.innerHTML = '';
  const pcell = (name: string, label: string, on: boolean, click: () => void): void => {
    const c = el('button', 'pcell' + (on ? ' on' : ''));
    c.append(icon(name), el('span', '', label));
    c.addEventListener('click', click);
    presence.append(c);
  };
  pcell('leaf', 'Leaves', view.showLeaves, () => {
    view.showLeaves = !view.showLeaves;
    syncView();
  });
  pcell('ground', 'Objects', view.showObstacles, () => {
    view.showObstacles = !view.showObstacles;
    syncView();
  });
  pcell('grid', 'Grid', view.showGrid, () => {
    view.showGrid = !view.showGrid;
    syncView();
  });
  pcell('wind', 'Wind', view.windEnabled, () => {
    view.windEnabled = !view.windEnabled;
    syncView();
  });

  vtitleName.textContent = params.name;
  vtitleMeta.textContent = organ
    ? `seed ${params.seed} · ${fmtInt(r.summary.stems)} organs welded${r.stats.droppedStems ? ` · ${r.stats.droppedStems} dropped` : ''}`
    : `seed ${params.seed} · ${fmtInt(r.summary.stems)} stems · ${r.summary.obstacles} object${r.summary.obstacles === 1 ? '' : 's'}${r.stats.droppedStems ? ` · ${r.stats.droppedStems} dropped` : ''}`;
  sizePill.textContent = `${fmtInt(rep.faces)} F · ${fmtInt(rep.vertices)} V · ${fmtInt(r.buffers.index.length / 3)} tris`;
  tileFaces.innerHTML = '';
  tileFaces.className = 'tile ' + (ok ? 'ok' : 'warn');
  tileFaces.append(el('span', 'l', 'Faces'), el('span', 's', ok ? 'genus 0' : `${rep.boundaryEdges + rep.nonManifoldEdges} bad edges`), el('b', '', fmtCompact(rep.faces)));
  libFoot.innerHTML = '';
  const census = el('div', 'census');
  const parts = organ ? r.summary.stemsPerLevel.slice(0, 4) : [...r.summary.stemsPerLevel.slice(0, 4), r.summary.rootStems];
  const total = Math.max(1, parts.reduce((a, b) => a + b, 0));
  const colours = ['#8a5a3c', '#c98b4b', '#6fa16b', '#5aa1c9', '#b86b5c'];
  parts.forEach((n, i) => {
    const bar = el('i');
    bar.style.width = `${(n / total) * 100}%`;
    bar.style.background = colours[i];
    census.append(bar);
  });
  const footRow = el('div', 'foot-row');
  if (organ) footRow.append(kvSpan(groupIcon(params.name), 'organs', fmtInt(r.summary.stems)), kvSpan('layers', 'junctions', fmtInt(r.stats.junctions)), el('span', 'sp'), kvSpan('check', ok ? 'clean' : 'issues', '', ok ? 'ok' : 'warn'));
  else footRow.append(kvSpan('tree', 'stems', fmtInt(r.summary.stems)), kvSpan('layers', 'levels', String(params.botany.levels)), el('span', 'sp'), kvSpan('check', ok ? 'clean' : 'issues', '', ok ? 'ok' : 'warn'));
  libFoot.append(census, footRow);

  const page = pages.report;
  page.innerHTML = '';
  const s1 = section('Manifold checks', page, { hint: ok ? 'all pass' : 'issues' });
  const list = el('div', 'list');
  const item = (label: string, pass: boolean, detail: string): void => {
    const it = el('div', 'li' + (pass ? '' : ' warn'));
    it.append(el('span', 'dot'), el('span', 't', label), el('span', 'm', detail));
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

  const s2 = section('Mesh statistics', page, { hint: `${fmtCompact(rep.faces)} faces` });
  const grid = el('div', 'kvgrid');
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
  if (grass && r.grass) {
    add('Organs welded', `${fmtInt(r.grass.organs)}  (${r.grass.junctions} windows)`);
    add('Blades · culms', `${fmtInt(r.grass.blades)} · ${fmtInt(r.grass.culms)}`);
    add('Culm leaves', fmtInt(Math.max(0, r.grass.perLevel[2] - r.grass.blades)));
    add('Head parts', fmtInt(r.grass.perLevel[3]));
    add('Organs dropped', fmtInt(r.grass.dropped), r.grass.dropped ? 'warn' : 'ok');
  } else if (organ && r.organs) {
    add('Organs welded', `${fmtInt(r.organs.organs)}  (${r.organs.junctions} windows)`);
    for (const [k, v] of organCensus(r.organs, kind)) add(k[0].toUpperCase() + k.slice(1), fmtInt(v));
    if (r.organs.counts.skipped) add('Detail skipped', fmtInt(r.organs.counts.skipped), '');
    add('Organs dropped', fmtInt(r.organs.dropped), r.organs.dropped ? 'warn' : 'ok');
  } else {
    add('Junctions welded', fmtInt(r.stats.junctions));
    add('Forks (Y crotches)', fmtInt(r.stats.forks));
    add('Root stems welded', `${fmtInt(r.stats.rootStems)}  (${r.summary.primaryRoots} primary)`);
    add('Stems dropped', fmtInt(r.stats.droppedStems), r.stats.droppedStems ? 'warn' : 'ok');
    add('Roots dropped', fmtInt(r.stats.droppedRoots), r.stats.droppedRoots ? 'warn' : 'ok');
  }
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

  const t = r.timings;
  const s4 = section('Timings', page, { collapsed: true, hint: `${t.total.toFixed(0)} ms` });
  const tg = el('div', 'kvgrid');
  const addT = (k: string, v: number): void => {
    tg.append(el('span', '', k), el('b', '', `${v.toFixed(1)} ms`));
  };
  if (!organ) {
    addT('Skeleton', t.skeleton);
    addT('Roots', t.roots);
  }
  addT('Welded mesh', t.mesh);
  addT('Validation', t.validate);
  addT('GPU buffers', t.buffers);
  addT('Total', t.total);
  s4.append(tg);

  if (r.stats.droppedStems > 0) {
    const s5 = section('Dropped stems', page, { collapsed: true, hint: String(r.stats.droppedStems) });
    const dg = el('div', 'kvgrid');
    for (const [k, v] of Object.entries(r.stats.dropReasons)) dg.append(el('span', '', k), el('b', '', fmtInt(v)));
    s5.append(dg, el('p', 'note', organ ? 'An organ is dropped when no window can be opened for it on its parent without overlapping another one: fewer organs, a longer parent or more sides make room.' : 'A stem is dropped when no window can be opened for it on the parent without overlapping another junction. Increase trunk radial segments or rings per segment to make room.'));
  }
}

/** Named organ counts worth showing for a plant kind, most interesting first. */
function organCensus(st: { counts: Record<string, number> }, kind: PlantKind): [string, number][] {
  const order = kind === 'succulent' ? ['arms', 'pads', 'fruits', 'leaves', 'flowers', 'areoles', 'spines', 'teeth'] : ['fruits', 'pods', 'ears', 'branches', 'blades', 'head leaves', 'leaflets', 'vines', 'sepals'];
  const out: [string, number][] = [];
  for (const k of order) if (st.counts[k]) out.push([k, st.counts[k]]);
  for (const [k, v] of Object.entries(st.counts)) if (!order.includes(k) && k !== 'skipped' && !out.some((o) => o[0] === k)) out.push([k, v]);
  return out;
}

// -----------------------------------------------------------------------------
// Library (species browser)
// -----------------------------------------------------------------------------

const GROUP_ICON: Record<string, string> = {
  Oaks: 'tree',
  'Forest · broadleaf': 'tree',
  'Forest · conifers': 'conifer',
  Jungle: 'palm',
  Savanna: 'acacia',
  Desert: 'yucca',
  'Rocky terrain': 'mountain',
  'Desert · columnar cacti': 'saguaro',
  'Desert · barrels & pads': 'barrel',
  'Desert · succulent trees': 'saguaro',
  'Desert · agaves, yuccas & aloes': 'agave',
  'Grasses · turf & meadow': 'grass',
  'Grasses · tussock': 'tussock',
  'Grasses · cereals & reeds': 'wheat',
  'Vegetables · fruiting bushes': 'tomato',
  'Vegetables · vines': 'pumpkin',
  'Vegetables · heads, roots & grain': 'carrot',
  'Carnivorous · traps & sundews': 'flytrap',
  'Carnivorous · pitcher plants': 'pitcher',
};
const GROUP_ACCENT: Record<string, string> = {
  Oaks: '#c98b4b',
  'Forest · broadleaf': '#6fa16b',
  'Forest · conifers': '#4fd8e0',
  Jungle: '#34c759',
  Savanna: '#e5d33a',
  Desert: '#ffb454',
  'Rocky terrain': '#b48cff',
  'Desert · columnar cacti': '#7fc26e',
  'Desert · barrels & pads': '#a8c95a',
  'Desert · succulent trees': '#6fbfa4',
  'Desert · agaves, yuccas & aloes': '#5fc9b8',
  'Grasses · turf & meadow': '#8fd15a',
  'Grasses · tussock': '#c9d36a',
  'Grasses · cereals & reeds': '#e2b95b',
  'Vegetables · fruiting bushes': '#ff6b57',
  'Vegetables · vines': '#ffa14a',
  'Vegetables · heads, roots & grain': '#c7d94f',
  'Carnivorous · traps & sundews': '#ff7a9e',
  'Carnivorous · pitcher plants': '#c45cff',
};
const closedGroups = new Set<string>();

function speciesMeta(name: string): string {
  const p = PRESETS.find((x) => x.name === name);
  if (!p) return '';
  const fmtH = (h: number): string => (h < 1 ? `${Math.round(h * 100)} cm` : `${h.toFixed(1)} m`);
  if (isGrass(p) && p.grass) {
    const g = p.grass;
    return `${grassHabit(g)} · ${fmtH(grassHeight(g))} · ${g.head === 'none' ? 'vegetative' : g.head}`;
  }
  if (isSucculent(p) && p.succulent) return `${succulentHabit(p.succulent)} · ${fmtH(succulentHeight(p.succulent))}`;
  if (isVegetable(p) && p.vegetable) return `${vegetableHabit(p.vegetable)} · ${fmtH(vegetableHeight(p.vegetable))}`;
  if (isCarnivore(p) && p.carnivore) return `${carnivoreHabit(p.carnivore)} · ${fmtH(carnivoreHeight(p.carnivore))}`;
  const b = p.botany;
  return `${SHAPE_NAMES[b.shape].toLowerCase()} · ${b.scale} m · L${b.levels}`;
}

function buildLibrary(): void {
  libTree.innerHTML = '';
  const q = searchInput.value.trim().toLowerCase();
  const grouped = new Set<string>();
  const groups = [...PRESET_GROUPS.map((g) => ({ label: g.label, names: g.names.filter((n) => PRESETS.some((p) => p.name === n)) }))];
  for (const g of groups) g.names.forEach((n) => grouped.add(n));
  const rest = PRESETS.map((p) => p.name).filter((n) => !grouped.has(n));
  if (rest.length) groups.push({ label: 'Other', names: rest });
  let shown = 0;
  for (const g of groups) {
    const names = g.names.filter((n) => !q || n.toLowerCase().includes(q) || g.label.toLowerCase().includes(q));
    if (names.length === 0) continue;
    const grp = el('div', 'grp' + (closedGroups.has(g.label) && !q ? ' closed' : ''));
    const gh = el('div', 'grp-h');
    gh.append(icon('caret', 'i car'), el('span', '', g.label), el('span', 'cnt', String(names.length)));
    gh.addEventListener('click', () => {
      if (closedGroups.has(g.label)) closedGroups.delete(g.label);
      else closedGroups.add(g.label);
      grp.classList.toggle('closed');
    });
    const kids = el('div', 'kids');
    for (const name of names) {
      const row = el('div', 'row' + (name === params.name ? ' sel' : ''));
      row.style.setProperty('--acc', GROUP_ACCENT[g.label] ?? '#9aa4b2');
      const ico = el('span', 'ico');
      ico.append(icon(GROUP_ICON[g.label] ?? 'tree'));
      const txt = el('div', 'txt');
      txt.append(el('span', 'name', name), el('span', 'meta', speciesMeta(name)));
      row.append(ico, txt);
      if (name === params.name) {
        const st = el('span', 'st ok');
        st.append(icon('check'));
        row.append(st);
      }
      row.addEventListener('click', () => {
        if (name !== params.name) selectPreset(name);
      });
      kids.append(row);
      shown++;
    }
    grp.append(gh, kids);
    libTree.append(grp);
  }
  if (shown === 0) {
    const empty = el('div', 'empty');
    empty.append(el('b', '', 'No species match'), document.createTextNode('Try a family name such as “oak”, “conifer”, “cacti”, “grass”, “vegetables” or “carnivorous”.'));
    libTree.append(empty);
  }
  tileSpecies.innerHTML = '';
  tileSpecies.className = 'tile ok';
  tileSpecies.append(el('span', 'l', 'Species'), el('span', 's', `${groups.length} families`), el('b', '', String(PRESETS.length)));
}
searchInput.addEventListener('input', () => buildLibrary());
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchInput.value = '';
    buildLibrary();
    searchInput.blur();
  }
});

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

  const sSeed = section('Seed', page, { hint: groupOf(params.name).toLowerCase() });
  const seedRow = el('div', 'ctl rowctl seed');
  seedRow.append(el('span', 'lab', 'Seed'));
  const stp = el('div', 'stp');
  const seedInput = el('input', 'n');
  seedInput.type = 'text';
  seedInput.spellcheck = false;
  seedInput.value = String(params.seed);
  seedInput.addEventListener('change', () => {
    const v = parseInt(seedInput.value, 10);
    if (!Number.isNaN(v)) {
      params.seed = v;
      scheduleGenerate(true);
    }
  });
  seedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') seedInput.blur();
  });
  const seedDec = el('button', 'b', '−');
  seedDec.addEventListener('click', () => setSeed(params.seed - 1));
  const seedInc = el('button', 'b', '+');
  seedInc.addEventListener('click', () => setSeed(params.seed + 1));
  stp.append(seedDec, seedInput, seedInc);
  const rnd = button('Randomise', () => randomSeed(), { icon: 'dice', kbd: 'R', cls: 'slim' });
  seedRow.append(stp, rnd);
  sSeed.append(seedRow);
  const resetRow = el('div', 'actions');
  resetRow.append(
    button('Reset species', () => {
      const seed = params.seed;
      params = cloneParams(PRESETS.find((p) => p.name === params.name) ?? PRESETS[0]);
      params.seed = seed;
      selectedObstacle = -1;
      rebuildPages();
      scheduleGenerate(true);
    }, { icon: 'reset', title: 'Restore the preset values of the current species' }),
  );
  sSeed.append(resetRow);
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
  slider(sGlobal, 'Height', () => params.botany.scale, (v) => (params.botany.scale = v), { min: 1, max: 80, step: 0.5, unit: 'm' }, onChange);
  slider(sGlobal, 'Height variation', () => params.botany.scaleV, (v) => (params.botany.scaleV = v), { min: 0, max: 20, step: 0.5, unit: 'm' }, onChange);
  stepper(sGlobal, 'Levels', () => params.botany.levels, (v) => (params.botany.levels = v), { min: 1, max: 4, integer: true, title: 'Recursion depth: trunk, limbs, branches, twigs' }, () => {
    onChange();
    for (const r of refreshers) r();
  });
  slider(sGlobal, 'Trunk ratio', () => params.botany.ratio, (v) => (params.botany.ratio = v), { min: 0.005, max: 0.16, step: 0.001, title: 'Trunk radius as a fraction of trunk length' }, onChange);
  slider(sGlobal, 'Ratio power', () => params.botany.ratioPower, (v) => (params.botany.ratioPower = v), { min: 0.5, max: 3, step: 0.05, title: 'How fast child radius falls off with relative length' }, onChange);
  slider(sGlobal, 'Root flare', () => params.botany.flare, (v) => (params.botany.flare = v), { min: 0, max: 3, step: 0.05 }, onChange);
  stepper(sGlobal, 'Base splits', () => params.botany.baseSplits, (v) => (params.botany.baseSplits = v), { min: -3, max: 4, integer: true, title: 'Clones at the base of the trunk (negative = up to N, random)' }, onChange);
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

  const sLeaf = section('Leaves', page, { collapsed: true, hint: 'proxy cards' });
  slider(sLeaf, 'Leaves per twig', () => params.botany.leaves, (v) => (params.botany.leaves = Math.round(v)), { min: 0, max: 300, step: 1 }, onChange);
  slider(sLeaf, 'Leaf length', () => params.botany.leafScale, (v) => (params.botany.leafScale = v), { min: 0.02, max: 0.6, step: 0.01, unit: 'm' }, onChange);
  slider(sLeaf, 'Leaf width', () => params.botany.leafScaleX, (v) => (params.botany.leafScaleX = v), { min: 0.1, max: 2, step: 0.05, unit: '×' }, onChange);
  slider(sLeaf, 'Tip tuft', () => params.botany.leafTuft, (v) => (params.botany.leafTuft = v), { min: 0.05, max: 1, step: 0.05, title: 'Fraction of each terminal stem, from the tip, that carries leaves. 1 = the whole stem; small values gather the leaves into a tip rosette (yucca) or brush (foxtail pine).' }, onChange);
}


// -----------------------------------------------------------------------------
// Grass page
// -----------------------------------------------------------------------------

/** Seed + reset header shared by the organ-plant pages (grass, succulent, crop). */
function seedHeader(page: HTMLElement): void {
  const sSeed = section('Seed', page, { hint: groupOf(params.name).toLowerCase() });
  const seedRow = el('div', 'ctl rowctl seed');
  seedRow.append(el('span', 'lab', 'Seed'));
  const stp = el('div', 'stp');
  const seedInput = el('input', 'n');
  seedInput.type = 'text';
  seedInput.spellcheck = false;
  seedInput.value = String(params.seed);
  seedInput.addEventListener('change', () => {
    const v = parseInt(seedInput.value, 10);
    if (!Number.isNaN(v)) {
      params.seed = v;
      scheduleGenerate(true);
    }
  });
  seedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') seedInput.blur();
  });
  const seedDec = el('button', 'b', '−');
  seedDec.addEventListener('click', () => setSeed(params.seed - 1));
  const seedInc = el('button', 'b', '+');
  seedInc.addEventListener('click', () => setSeed(params.seed + 1));
  stp.append(seedDec, seedInput, seedInc);
  seedRow.append(stp, button('Randomise', () => randomSeed(), { icon: 'dice', kbd: 'R', cls: 'slim' }));
  sSeed.append(seedRow);
  const resetRow = el('div', 'actions');
  resetRow.append(
    button('Reset species', () => {
      const seed = params.seed;
      params = cloneParams(PRESETS.find((p) => p.name === params.name) ?? PRESETS[0]);
      params.seed = seed;
      rebuildPages();
      scheduleGenerate(true);
    }, { icon: 'reset', title: 'Restore the preset values of the current species' }),
  );
  sSeed.append(resetRow);
  refreshers.push(() => {
    seedInput.value = String(params.seed);
  });
}

const cm = { format: (v: number) => (v * 100).toFixed(v < 0.1 ? 1 : 0), unit: 'cm' };
const mm = { format: (v: number) => (v * 1000).toFixed(v < 0.01 ? 1 : 0), unit: 'mm' };
const pct = { format: (v: number) => (v * 100).toFixed(0), unit: '%' };

function buildGrassPage(): void {
  const page = pages.grass;
  page.innerHTML = '';
  if (!isGrass(params) || !params.grass) return;
  const G = (): GrassParams => params.grass!;
  const g = G();
  seedHeader(page);

  const sCrown = section('Crown & habit', page);
  slider(sCrown, 'Crown radius', () => G().crownRadius, (v) => (G().crownRadius = v), { min: 0.02, max: 0.8, step: 0.005, ...cm, title: 'Radius of the tussock base at ground level' }, onChange);
  slider(sCrown, 'Crown height', () => G().crownHeight, (v) => (G().crownHeight = v), { min: 0, max: 0.4, step: 0.005, ...cm, title: 'Dome of the tussock above the soil' }, onChange);
  slider(sCrown, 'Sunk into soil', () => G().crownSink, (v) => (G().crownSink = v), { min: 0, max: 0.1, step: 0.002, ...cm, title: 'Buries the crown so the blades rise straight out of the ground' }, onChange);
  slider(sCrown, 'Dome profile', () => G().crownProfile, (v) => (G().crownProfile = v), { min: 1.2, max: 6, step: 0.1, title: '2 = rounded · higher = flat top with a rounded shoulder' }, onChange);
  slider(sCrown, 'Centre bias', () => G().centreBias, (v) => (G().centreBias = v), { min: -1, max: 1, step: 0.05, title: '−1 tillers in a ring at the rim · 0 even · 1 crowded at the centre' }, onChange);

  const sBlade = section('Leaf blades', page, { hint: `${g.blades} blades` });
  slider(sBlade, 'Blades', () => G().blades, (v) => (G().blades = Math.round(v)), { min: 0, max: 800, step: 1 }, onChange);
  slider(sBlade, 'Length', () => G().bladeLength, (v) => (G().bladeLength = v), { min: 0.02, max: 2.5, step: 0.01, ...cm }, onChange);
  slider(sBlade, 'Length variation', () => G().bladeLengthV, (v) => (G().bladeLengthV = v), { min: 0, max: 0.8, step: 0.02, unit: '±' }, onChange);
  slider(sBlade, 'Width', () => G().bladeWidth, (v) => (G().bladeWidth = v), { min: 0.001, max: 0.06, step: 0.0005, ...mm }, onChange);
  slider(sBlade, 'Thickness', () => G().bladeThickness, (v) => (G().bladeThickness = v), { min: 0.02, max: 0.6, step: 0.01, unit: '× w', title: 'Blade thickness as a fraction of its width' }, onChange);
  slider(sBlade, 'Taper', () => G().bladeTaper, (v) => (G().bladeTaper = v), { min: 0, max: 1, step: 0.05, title: '0 narrows evenly from the base · 1 keeps its width and ends in a fine point' }, onChange);
  slider(sBlade, 'Keel', () => G().keel, (v) => (G().keel = v), { min: 0, max: 1, step: 0.05, title: 'V-fold along the midrib' }, onChange);
  slider(sBlade, 'Rolled', () => G().rolled, (v) => (G().rolled = v), { min: 0, max: 1, step: 0.05, title: '0 flat · 1 rolled into a bristle (fescue, marram)' }, onChange);
  slider(sBlade, 'Twist', () => G().twist, (v) => (G().twist = v), { min: 0, max: 360, step: 5, unit: '°' }, onChange);
  slider(sBlade, 'Twist variation', () => G().twistV, (v) => (G().twistV = v), { min: 0, max: 180, step: 5, unit: '°' }, onChange);
  slider(sBlade, 'Lean', () => G().lean, (v) => (G().lean = v), { min: 0, max: 80, step: 1, unit: '°', title: 'Tilt from the vertical at the rim of the crown; the centre stays upright' }, onChange);
  slider(sBlade, 'Lean variation', () => G().leanV, (v) => (G().leanV = v), { min: 0, max: 40, step: 1, unit: '°' }, onChange);
  slider(sBlade, 'Droop', () => G().droop, (v) => (G().droop = v), { min: 0, max: 180, step: 2, unit: '°', title: 'Arch from base to tip' }, onChange);
  slider(sBlade, 'Droop variation', () => G().droopV, (v) => (G().droopV = v), { min: 0, max: 90, step: 2, unit: '°' }, onChange);
  slider(sBlade, 'Droop profile', () => G().droopPower, (v) => (G().droopPower = v), { min: 1, max: 4, step: 0.1, title: '1 bends evenly · higher keeps the base stiff and lets the tip hang' }, onChange);
  slider(sBlade, 'Waviness', () => G().wave, (v) => (G().wave = v), { min: 0, max: 30, step: 1, unit: '°' }, onChange);

  const sCulm = section('Culms', page, { hint: g.culms ? `${g.culms} culms` : 'none' });
  slider(sCulm, 'Culms', () => G().culms, (v) => (G().culms = Math.round(v)), { min: 0, max: 80, step: 1, title: 'Flowering stems' }, onChange);
  slider(sCulm, 'Height', () => G().culmHeight, (v) => (G().culmHeight = v), { min: 0.05, max: 4, step: 0.01, ...cm }, onChange);
  slider(sCulm, 'Height variation', () => G().culmHeightV, (v) => (G().culmHeightV = v), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
  slider(sCulm, 'Radius', () => G().culmRadius, (v) => (G().culmRadius = v), { min: 0.0005, max: 0.02, step: 0.0001, ...mm }, onChange);
  slider(sCulm, 'Lean', () => G().culmLean, (v) => (G().culmLean = v), { min: 0, max: 60, step: 1, unit: '°' }, onChange);
  slider(sCulm, 'Lean variation', () => G().culmLeanV, (v) => (G().culmLeanV = v), { min: 0, max: 30, step: 1, unit: '°' }, onChange);
  slider(sCulm, 'Curve', () => G().culmCurve, (v) => (G().culmCurve = v), { min: 0, max: 90, step: 1, unit: '°', title: 'Bend along the culm' }, onChange);
  stepper(sCulm, 'Leaf nodes', () => G().nodes, (v) => (G().nodes = v), { min: 0, max: 12, integer: true }, onChange);
  slider(sCulm, 'Node swelling', () => G().nodeSwell, (v) => (G().nodeSwell = v), { min: 0, max: 0.6, step: 0.01 }, onChange);
  slider(sCulm, 'Culm leaf length', () => G().culmLeafLength, (v) => (G().culmLeafLength = v), { min: 0.1, max: 1.5, step: 0.05, unit: '×', title: 'Relative to the basal blades' }, onChange);
  slider(sCulm, 'Culm leaf width', () => G().culmLeafWidth, (v) => (G().culmLeafWidth = v), { min: 0.3, max: 2, step: 0.05, unit: '×' }, onChange);
  slider(sCulm, 'Culm leaf angle', () => G().culmLeafAngle, (v) => (G().culmLeafAngle = v), { min: 5, max: 90, step: 1, unit: '°' }, onChange);

  const sHead = section('Inflorescence', page, { hint: g.head === 'none' ? 'none' : g.head });
  select(
    sHead,
    'Type',
    (Object.keys(INFLORESCENCE_NAMES) as Inflorescence[]).map((k) => ({ value: k, label: INFLORESCENCE_NAMES[k] })),
    () => G().head,
    (v) => (G().head = v),
    () => {
      onChange();
      buildGrassPage();
    },
  );
  if (g.head !== 'none') {
    const branchName = HEAD_BRANCH_NAMES[g.head];
    const spread = g.head === 'panicle' || g.head === 'plume';
    slider(sHead, 'Head length', () => G().headLength, (v) => (G().headLength = v), { min: 0.01, max: 0.8, step: 0.005, ...cm }, onChange);
    if (!spread) slider(sHead, 'Head width', () => G().headWidth, (v) => (G().headWidth = v), { min: 0.004, max: 0.08, step: 0.001, ...mm }, onChange);
    slider(sHead, 'Nod', () => G().headDroop, (v) => (G().headDroop = v), { min: 0, max: 120, step: 1, unit: '°' }, onChange);
    slider(sHead, branchName, () => G().headBranches, (v) => (G().headBranches = Math.round(v)), { min: 0, max: 400, step: 1 }, onChange);
    if (spread) {
      slider(sHead, 'Branchlet length', () => G().headBranchLength, (v) => (G().headBranchLength = v), { min: 0.05, max: 1.2, step: 0.05, unit: '× head' }, onChange);
      slider(sHead, 'Attach over', () => G().headBranchSpread, (v) => (G().headBranchSpread = v), { min: 0.1, max: 1, step: 0.05, title: 'Fraction of the head, from its base, over which branchlets attach' }, onChange);
      stepper(sHead, 'Secondaries', () => G().headSecondary, (v) => (G().headSecondary = v), { min: 0, max: 8, integer: true, title: 'Secondary branchlets per branchlet' }, onChange);
    }
    slider(sHead, `${branchName.slice(0, -1)} angle`, () => G().headBranchAngle, (v) => (G().headBranchAngle = v), { min: 5, max: 90, step: 1, unit: '°' }, onChange);
    slider(sHead, `${branchName.slice(0, -1)} droop`, () => G().headBranchDroop, (v) => (G().headBranchDroop = v), { min: 0, max: 120, step: 2, unit: '°' }, onChange);
    slider(sHead, `${branchName.slice(0, -1)} radius`, () => G().headBranchRadius, (v) => (G().headBranchRadius = v), { min: 0.0001, max: 0.003, step: 0.00005, format: (v) => (v * 1000).toFixed(2), unit: 'mm' }, onChange);
    if (g.head === 'spike' || g.head === 'panicle') {
      slider(sHead, 'Spikelet', () => G().spikelet, (v) => (G().spikelet = v), { min: 0, max: 0.01, step: 0.0002, format: (v) => (v * 1000).toFixed(1), unit: 'mm' }, onChange);
      slider(sHead, 'Awn', () => G().awn, (v) => (G().awn = v), { min: 0, max: 0.2, step: 0.002, ...cm }, onChange);
    }
  }

  const sRes = section('Resolution', page, { collapsed: true });
  stepper(sRes, 'Blade sides', () => G().bladeSides, (v) => (G().bladeSides = v), { min: 4, max: 8, step: 2, integer: true, title: '4 flat strip · 6 keeled · 8 keeled and wide' }, onChange);
  stepper(sRes, 'Blade rings', () => G().bladeSegments, (v) => (G().bladeSegments = v), { min: 3, max: 24, integer: true }, onChange);
  stepper(sRes, 'Culm sides', () => G().culmSides, (v) => (G().culmSides = v), { min: 6, max: 12, step: 2, integer: true }, onChange);
  stepper(sRes, 'Culm rings', () => G().culmSegments, (v) => (G().culmSegments = v), { min: 4, max: 40, integer: true }, onChange);
  stepper(sRes, 'Branchlet rings', () => G().branchletSegments, (v) => (G().branchletSegments = v), { min: 1, max: 8, integer: true }, onChange);
  stepper(sRes, 'Collar rings', () => G().collarRings, (v) => (G().collarRings = v), { min: 0, max: 3, integer: true, title: 'Intermediate loops between a window and the first ring of the tiller' }, onChange);

  page.append(
    Object.assign(el('p', 'note'), {
      textContent:
        'A grass plant is one closed quad surface, like the trees. The crown is a grid dome; every blade, culm, culm leaf, branchlet, spikelet and awn leaves its parent through a window cut into the parent\'s ring grid and is welded to it with collar loops, so the wind deformation runs continuously from the soil to the tip of every awn.',
    }),
  );
}

// -----------------------------------------------------------------------------
// Succulent page (cacti, agaves, aloes)
// -----------------------------------------------------------------------------

function buildSucculentPage(): void {
  const page = pages.succulent;
  page.innerHTML = '';
  if (!isSucculent(params) || !params.succulent) return;
  const C = (): SucculentParams => params.succulent!;
  const c = C();
  seedHeader(page);
  const rebuild = (): void => {
    onChange();
    buildSucculentPage();
  };
  const column = c.form === 'column';
  const pad = c.form === 'pad';
  const rosette = c.form === 'rosette';
  const barrel = column && c.body === 'barrel';
  const arms = column && c.armLevels > 0;
  const tufted = column && c.armTuft > 0;

  const sForm = section('Growth form', page, { hint: SUCCULENT_FORM_NAMES[c.form].split(' ')[0].toLowerCase() });
  select(sForm, 'Form', (Object.keys(SUCCULENT_FORM_NAMES) as SucculentForm[]).map((k) => ({ value: k, label: SUCCULENT_FORM_NAMES[k] })), () => C().form, (v) => (C().form = v), rebuild);
  if (column) select(sForm, 'Body', [{ value: 'column', label: 'Column' }, { value: 'barrel', label: 'Barrel / globe' }] as { value: 'column' | 'barrel'; label: string }[], () => C().body, (v) => (C().body = v), rebuild);
  if (!pad) {
    slider(sForm, rosette ? 'Stem height' : 'Height', () => C().height, (v) => (C().height = v), { min: 0.03, max: 12, step: 0.01, ...cm, title: 'Height of the trunk / barrel / rosette stem above the soil' }, onChange);
    slider(sForm, 'Height variation', () => C().heightV, (v) => (C().heightV = v), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
    slider(sForm, 'Radius', () => C().radius, (v) => (C().radius = v), { min: 0.01, max: 0.8, step: 0.005, ...cm }, onChange);
  }
  if (column) {
    slider(sForm, 'Stems', () => C().stems, (v) => (C().stems = Math.round(v)), { min: 1, max: 24, step: 1, title: 'More than one stem makes a clump rising from a buried pad' }, rebuild);
    if (c.stems > 1) {
      slider(sForm, 'Stems variation', () => C().stemsV, (v) => (C().stemsV = Math.round(v)), { min: 0, max: 8, step: 1, unit: '±' }, onChange);
      slider(sForm, 'Clump radius', () => C().clumpRadius, (v) => (C().clumpRadius = v), { min: 0.05, max: 2, step: 0.01, ...cm }, onChange);
    }
    slider(sForm, 'Base taper', () => C().baseTaper, (v) => (C().baseTaper = v), { min: 0.3, max: 1.5, step: 0.01, unit: '×', title: 'Radius at the base as a fraction of the body radius' }, onChange);
    if (barrel) slider(sForm, 'Belly position', () => C().bellyPos, (v) => (C().bellyPos = v), { min: 0.15, max: 0.85, step: 0.01, title: 'Height fraction of the widest point' }, onChange);
    else slider(sForm, 'Dome height', () => C().domeHeight, (v) => (C().domeHeight = v), { min: 0.1, max: 1.5, step: 0.05, unit: '× r', title: 'Height of the rounded tip as a fraction of the radius' }, onChange);
    slider(sForm, 'Lean', () => C().lean, (v) => (C().lean = v), { min: 0, max: 40, step: 1, unit: '°' }, onChange);
    slider(sForm, 'Lean variation', () => C().leanV, (v) => (C().leanV = v), { min: 0, max: 30, step: 1, unit: '°' }, onChange);
    slider(sForm, 'Curve', () => C().curve, (v) => (C().curve = v), { min: 0, max: 60, step: 1, unit: '°', title: 'Bend along the trunk' }, onChange);
  }
  if (rosette) slider(sForm, 'Lean variation', () => C().leanV, (v) => (C().leanV = v), { min: 0, max: 30, step: 1, unit: '°' }, onChange);

  if (column) {
    const sRib = section('Ribs', page, { hint: c.ribs ? `${c.ribs} ribs` : 'smooth' });
    stepper(sRib, 'Ribs', () => C().ribs, (v) => (C().ribs = v), { min: 0, max: 40, integer: true, title: '0 = smooth stem (euphorbias, chollas, quiver tree)' }, rebuild);
    if (c.ribs > 0) {
      slider(sRib, 'Rib depth', () => C().ribDepth, (v) => (C().ribDepth = v), { min: 0, max: 0.5, step: 0.01, unit: '× r' }, onChange);
      slider(sRib, 'Rib profile', () => C().ribSharp, (v) => (C().ribSharp = v), { min: 0.4, max: 4, step: 0.1, title: '> 1 broad rounded ribs with narrow troughs · < 1 knife-edge ribs' }, onChange);
    }
    slider(sRib, 'Constriction', () => C().constriction, (v) => (C().constriction = v), { min: 0, max: 0.5, step: 0.01, unit: '× r', title: 'Periodic waist of the arms (segmented euphorbias, cholla joints)' }, onChange);
    if (c.constriction > 0) slider(sRib, 'Segment length', () => C().constrictionLength, (v) => (C().constrictionLength = v), { min: 0.03, max: 1, step: 0.01, ...cm }, onChange);
  }

  if (column) {
    const sArm = section('Arms', page, { hint: c.armLevels > 0 && c.arms > 0 ? `${c.arms} arms · ${c.armLevels} level${c.armLevels > 1 ? 's' : ''}` : 'none' });
    stepper(sArm, 'Arm levels', () => C().armLevels, (v) => (C().armLevels = v), { min: 0, max: 3, integer: true, title: '0 none · 1 arms · 2 arms of arms · 3 a third order' }, rebuild);
    if (arms) {
      slider(sArm, 'Arms', () => C().arms, (v) => (C().arms = Math.round(v)), { min: 0, max: 40, step: 1 }, onChange);
      slider(sArm, 'Arms variation', () => C().armsV, (v) => (C().armsV = Math.round(v)), { min: 0, max: 10, step: 1, unit: '±' }, onChange);
      if (c.armLevels > 1) slider(sArm, 'Arms per arm', () => C().armChildren, (v) => (C().armChildren = v), { min: 0, max: 4, step: 0.5 }, onChange);
      slider(sArm, 'Attach from', () => C().armFrom, (v) => (C().armFrom = v), { min: -0.5, max: 0.95, step: 0.01, title: 'Lowest attachment as a fraction of the trunk height (negative = below the soil, for clumps)' }, onChange);
      slider(sArm, 'Attach to', () => C().armTo, (v) => (C().armTo = v), { min: 0, max: 1, step: 0.01 }, onChange);
      if (c.armLevels > 1) {
        slider(sArm, 'Sub-arms from', () => C().armFrom2, (v) => (C().armFrom2 = v), { min: 0, max: 0.95, step: 0.01 }, onChange);
        slider(sArm, 'Sub-arms to', () => C().armTo2, (v) => (C().armTo2 = v), { min: 0.05, max: 1, step: 0.01 }, onChange);
      }
      slider(sArm, 'Arm length', () => C().armLength, (v) => (C().armLength = v), { min: 0.05, max: 1.5, step: 0.01, unit: '× parent' }, onChange);
      slider(sArm, 'Length variation', () => C().armLengthV, (v) => (C().armLengthV = v), { min: 0, max: 0.6, step: 0.01, unit: '±' }, onChange);
      slider(sArm, 'Arm radius', () => C().armRadius, (v) => (C().armRadius = v), { min: 0.15, max: 1.2, step: 0.01, unit: '× trunk' }, onChange);
      if (c.armLevels > 1) slider(sArm, 'Sub-arm radius', () => C().armRadius2, (v) => (C().armRadius2 = v), { min: 0.3, max: 1.2, step: 0.01, unit: '× parent' }, onChange);
      stepper(sArm, 'Arm ribs', () => C().armRibs, (v) => (C().armRibs = v), { min: 0, max: 24, integer: true, title: '0 = scaled from the trunk ribs' }, onChange);
      slider(sArm, 'Arm angle', () => C().armAngle, (v) => (C().armAngle = v), { min: 10, max: 110, step: 1, unit: '°', title: 'Angle from the parent axis where the arm leaves it' }, onChange);
      slider(sArm, 'Rise', () => C().armRise, (v) => (C().armRise = v), { min: 0, max: 120, step: 1, unit: '°', title: 'How far the arm turns back towards the vertical (the saguaro elbow)' }, onChange);
      slider(sArm, 'Rise over', () => C().armRiseLength, (v) => (C().armRiseLength = v), { min: 0.05, max: 1, step: 0.01, title: 'Fraction of the arm length over which it rises' }, onChange);
      slider(sArm, 'Droop', () => C().armDroop, (v) => (C().armDroop = v), { min: 0, max: 90, step: 1, unit: '°', title: 'Outer part of the arm hanging under its weight (chollas)' }, onChange);
      check(sArm, 'Leaf tuft at the tips', () => C().armTuft > 0, (v) => (C().armTuft = v ? 1 : 0), rebuild);
    }
  }

  if (pad) {
    const sPad = section('Pads', page, { hint: `${c.pads} pads` });
    slider(sPad, 'Pads', () => C().pads, (v) => (C().pads = Math.round(v)), { min: 1, max: 60, step: 1 }, onChange);
    stepper(sPad, 'Chain depth', () => C().padLevels, (v) => (C().padLevels = v), { min: 1, max: 6, integer: true }, onChange);
    slider(sPad, 'Pad length', () => C().padLength, (v) => (C().padLength = v), { min: 0.05, max: 0.6, step: 0.005, ...cm }, onChange);
    slider(sPad, 'Length variation', () => C().padLengthV, (v) => (C().padLengthV = v), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
    slider(sPad, 'Pad width', () => C().padWidth, (v) => (C().padWidth = v), { min: 0.03, max: 0.5, step: 0.005, ...cm }, onChange);
    slider(sPad, 'Pad thickness', () => C().padThickness, (v) => (C().padThickness = v), { min: 0.005, max: 0.08, step: 0.001, ...mm }, onChange);
    slider(sPad, 'Spread angle', () => C().padAngle, (v) => (C().padAngle = v), { min: 10, max: 90, step: 1, unit: '°', title: 'Angle between a child pad and its parent, in the parent plane (±17° random)' }, onChange);
    slider(sPad, 'Tilt', () => C().padTilt, (v) => (C().padTilt = v), { min: 0, max: 60, step: 1, unit: '°', title: 'Lean of a child pad out of its parent plane, towards one face (± random)' }, onChange);
    slider(sPad, 'Twist', () => C().padTwist, (v) => (C().padTwist = v), { min: 0, max: 90, step: 1, unit: '°', title: 'Rotation of a child pad\'s own plane against its parent plane (± random)' }, onChange);
    slider(sPad, 'Upward curve', () => C().padUp, (v) => (C().padUp = v), { min: 0, max: 80, step: 1, unit: '°' }, onChange);
    slider(sPad, 'Children from', () => C().padFrom, (v) => (C().padFrom = v), { min: 0.3, max: 0.95, step: 0.01, title: 'Attachment range along the parent rim' }, onChange);
    slider(sPad, 'Children to', () => C().padTo, (v) => (C().padTo = v), { min: 0.35, max: 0.98, step: 0.01 }, onChange);
    const sFruit = section('Fruits', page, { hint: c.fruits ? `${c.fruits} per pad` : 'none' });
    slider(sFruit, 'Fruits per pad', () => C().fruits, (v) => (C().fruits = Math.round(v)), { min: 0, max: 8, step: 1, title: 'Prickly pears on the upper rim of the terminal pads' }, onChange);
    slider(sFruit, 'Fruit length', () => C().fruitLength, (v) => (C().fruitLength = v), { min: 0.02, max: 0.12, step: 0.001, ...mm }, onChange);
    slider(sFruit, 'Fruit radius', () => C().fruitRadius, (v) => (C().fruitRadius = v), { min: 0.008, max: 0.05, step: 0.001, ...mm }, onChange);
  }

  if (!rosette && !tufted) {
    const sAre = section('Areoles & spines', page, { hint: c.areoleSpacing > 0 && c.spineLength > 0 ? `${c.spines + c.centralSpine} spines` : 'none' });
    slider(sAre, 'Areole spacing', () => C().areoleSpacing, (v) => (C().areoleSpacing = v), { min: 0, max: 0.15, step: 0.002, ...cm, title: '0 = no areoles' }, onChange);
    slider(sAre, 'Areole radius', () => C().areoleRadius, (v) => (C().areoleRadius = v), { min: 0.001, max: 0.02, step: 0.0005, ...mm }, onChange);
    slider(sAre, 'Areole tilt', () => C().areoleTilt, (v) => (C().areoleTilt = v), { min: -30, max: 40, step: 1, unit: '°', title: 'Upward tilt of the cluster' }, onChange);
    slider(sAre, 'Tip gap', () => C().areoleTipGap, (v) => (C().areoleTipGap = v), { min: 0, max: 0.4, step: 0.01, title: 'Fraction of each stem, from the tip, left without areoles' }, onChange);
    stepper(sAre, 'Radial spines', () => C().spines, (v) => (C().spines = v), { min: 0, max: 4, step: 2, integer: true }, onChange);
    check(sAre, 'Central spine', () => C().centralSpine > 0, (v) => (C().centralSpine = v ? 1 : 0), onChange);
    slider(sAre, 'Spine length', () => C().spineLength, (v) => (C().spineLength = v), { min: 0, max: 0.1, step: 0.001, ...mm }, onChange);
    slider(sAre, 'Length variation', () => C().spineLengthV, (v) => (C().spineLengthV = v), { min: 0, max: 0.6, step: 0.01, unit: '±' }, onChange);
    slider(sAre, 'Spine radius', () => C().spineRadius, (v) => (C().spineRadius = v), { min: 0.0002, max: 0.004, step: 0.0001, format: (v) => (v * 1000).toFixed(2), unit: 'mm' }, onChange);
    slider(sAre, 'Spine angle', () => C().spineAngle, (v) => (C().spineAngle = v), { min: 5, max: 80, step: 1, unit: '°', title: 'Radial spines raised from the surface' }, onChange);
    slider(sAre, 'Hook', () => C().spineHook, (v) => (C().spineHook = v), { min: 0, max: 150, step: 5, unit: '°', title: 'Curvature of the central spine (fishhook barrels)' }, onChange);
  }

  if (rosette || tufted) {
    const sLeaf = section(tufted ? 'Leaf tufts' : 'Leaves', page, { hint: `${c.leaves} leaves` });
    slider(sLeaf, tufted ? 'Leaves per tuft' : 'Leaves', () => C().leaves, (v) => (C().leaves = Math.round(v)), { min: 1, max: 80, step: 1 }, onChange);
    slider(sLeaf, 'Leaf length', () => C().leafLength, (v) => (C().leafLength = v), { min: 0.05, max: 2.5, step: 0.01, ...cm }, onChange);
    slider(sLeaf, 'Length variation', () => C().leafLengthV, (v) => (C().leafLengthV = v), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
    slider(sLeaf, 'Leaf width', () => C().leafWidth, (v) => (C().leafWidth = v), { min: 0.01, max: 0.4, step: 0.005, ...cm }, onChange);
    slider(sLeaf, 'Thickness', () => C().leafThickness, (v) => (C().leafThickness = v), { min: 0.05, max: 0.8, step: 0.01, unit: '× w' }, onChange);
    slider(sLeaf, 'Channel', () => C().leafCup, (v) => (C().leafCup = v), { min: 0, max: 150, step: 5, unit: '°', title: 'Arc of the leaf cross-section' }, onChange);
    slider(sLeaf, 'Spread (outer)', () => C().leafSpread, (v) => (C().leafSpread = v), { min: 0, max: 110, step: 1, unit: '°', title: 'Angle from the vertical of the oldest leaves' }, onChange);
    slider(sLeaf, 'Spread (inner)', () => C().leafSpreadTop, (v) => (C().leafSpreadTop = v), { min: 0, max: 90, step: 1, unit: '°' }, onChange);
    slider(sLeaf, 'Bend', () => C().leafBend, (v) => (C().leafBend = v), { min: 0, max: 90, step: 1, unit: '°', title: 'Outward arch along the leaf' }, onChange);
    slider(sLeaf, 'Twist', () => C().leafTwist, (v) => (C().leafTwist = v), { min: 0, max: 60, step: 1, unit: '°' }, onChange);
    slider(sLeaf, 'Widest at', () => C().leafWidest, (v) => (C().leafWidest = v), { min: 0.1, max: 0.8, step: 0.01, title: 'Position of the widest point along the leaf: 0.2 lanceolate, 0.55 obovate (artichoke agaves)' }, onChange);
    slider(sLeaf, 'Tip taper', () => C().leafTaper, (v) => (C().leafTaper = v), { min: 1, max: 6, step: 0.1, title: '1 = straight taper (triangular), 1.6 = lanceolate, 4 = broad with an abrupt tip' }, onChange);
    slider(sLeaf, 'Terminal spine', () => C().leafTipSpine, (v) => (C().leafTipSpine = v), { min: 0, max: 0.08, step: 0.001, ...mm, title: 'Hard spine the leaf narrows into (agaves, yuccas)' }, onChange);
    if (!tufted) slider(sLeaf, 'Leaf zone', () => C().leafZone, (v) => (C().leafZone = v), { min: 0.1, max: 1, step: 0.01, title: 'Fraction of the stem, from the top, that carries leaves — trunked agaves and yuccas use about a half' }, onChange);
    stepper(sLeaf, 'Teeth per edge', () => C().teeth, (v) => (C().teeth = v), { min: 0, max: 40, integer: true }, onChange);
    slider(sLeaf, 'Tooth length', () => C().toothLength, (v) => (C().toothLength = v), { min: 0.001, max: 0.03, step: 0.0005, ...mm }, onChange);
  }
  if (rosette) {
    const sStalk = section('Flower stalk', page, { hint: c.stalk ? STALK_INFLORESCENCE_NAMES[c.inflorescence].toLowerCase() : 'none' });
    check(sStalk, 'Flower stalk', () => C().stalk > 0, (v) => (C().stalk = v ? 1 : 0), rebuild);
    if (c.stalk > 0) {
      const branched = c.inflorescence !== 'raceme';
      select(sStalk, 'Inflorescence', (Object.keys(STALK_INFLORESCENCE_NAMES) as StalkInflorescence[]).map((k) => ({ value: k, label: STALK_INFLORESCENCE_NAMES[k] })), () => C().inflorescence, (v) => (C().inflorescence = v), rebuild);
      select(sStalk, 'Rises from', (Object.keys(STALK_ORIGIN_NAMES) as StalkOrigin[]).map((k) => ({ value: k, label: STALK_ORIGIN_NAMES[k] })), () => C().stalkOrigin, (v) => (C().stalkOrigin = v), rebuild);
      slider(sStalk, 'Stalk height', () => C().stalkHeight, (v) => (C().stalkHeight = v), { min: 0.1, max: 8, step: 0.01, ...cm, title: 'Length of the peduncle above the crown' }, onChange);
      slider(sStalk, 'Stalk radius', () => C().stalkRadius, (v) => (C().stalkRadius = v), { min: 0.003, max: 0.08, step: 0.0005, ...mm, title: 'Radius at the base; the stalk tapers to a third of it' }, onChange);
      slider(sStalk, 'Arch', () => C().stalkArch, (v) => (C().stalkArch = v), { min: 0, max: 180, step: 1, unit: '°', title: 'How far the stalk bends over along its length (foxtail agave)' }, onChange);
      stepper(sStalk, 'Bracts', () => C().bracts, (v) => (C().bracts = v), { min: 0, max: 40, integer: true }, onChange);
      if (branched) {
        stepper(sStalk, 'Branches', () => C().branches, (v) => (C().branches = v), { min: 1, max: 40, integer: true }, onChange);
        slider(sStalk, 'Branch length', () => C().branchLength, (v) => (C().branchLength = v), { min: 0.05, max: 1.5, step: 0.01, ...cm, title: 'Longest (lowest) branch of a panicle; every raceme of a candelabra' }, onChange);
        slider(sStalk, 'Branch angle', () => C().branchAngle, (v) => (C().branchAngle = v), { min: 10, max: 90, step: 1, unit: '°', title: 'Angle a branch leaves the stalk at' }, onChange);
        slider(sStalk, 'Branch curve', () => C().branchCurve, (v) => (C().branchCurve = v), { min: -60, max: 60, step: 1, unit: '°', title: 'Negative sweeps the branches up (agave candelabra), positive lets them droop' }, onChange);
        slider(sStalk, 'Branch zone', () => C().branchZone, (v) => (C().branchZone = v), { min: 0.1, max: 0.8, step: 0.01, ...pct, title: 'Fraction of the stalk that carries branches' }, onChange);
      }
      select(sStalk, 'Flower', (Object.keys(FLOWER_KIND_NAMES) as FlowerKind[]).map((k) => ({ value: k, label: FLOWER_KIND_NAMES[k] })), () => C().flowerKind, (v) => (C().flowerKind = v), rebuild);
      slider(sStalk, 'Flowers', () => C().flowers, (v) => (C().flowers = Math.round(v)), { min: 0, max: 2000, step: 10, title: 'Flowers on the whole inflorescence; the top of a raceme carries buds' }, onChange);
      slider(sStalk, 'Flower length', () => C().flowerLength, (v) => (C().flowerLength = v), { min: 0.01, max: 0.1, step: 0.001, ...mm }, onChange);
      slider(sStalk, 'Flower radius', () => C().flowerRadius, (v) => (C().flowerRadius = v), { min: 0.001, max: 0.03, step: 0.0002, ...mm }, onChange);
      slider(sStalk, 'Flower droop', () => C().flowerDroop, (v) => (C().flowerDroop = v), { min: -90, max: 100, step: 1, unit: '°', title: 'Angle below the horizontal the open flowers hang at; negative points them up (agaves)' }, onChange);
      if (c.flowerKind !== 'bell') slider(sStalk, 'Stamens', () => C().stamens, (v) => (C().stamens = v), { min: 0, max: 2, step: 0.05, title: 'Length of the stamens beyond the mouth, as a multiple of the flower length' }, onChange);
      slider(sStalk, 'Flower zone', () => C().flowerZone, (v) => (C().flowerZone = v), { min: 0.1, max: 0.9, step: 0.01, ...pct, title: 'Fraction of each raceme / branch, from its tip, that carries flowers' }, onChange);
    }
  }

  const sRes = section('Resolution & wind', page, { collapsed: true });
  if (column && c.ribs > 0) stepper(sRes, 'Vertices per rib', () => C().sides, (v) => (C().sides = v), { min: 3, max: 4, integer: true }, onChange);
  else if (!pad) stepper(sRes, 'Stem sides', () => C().sides, (v) => (C().sides = v), { min: 8, max: 96, step: 2, integer: true }, onChange);
  if (pad) stepper(sRes, 'Pad sides', () => C().padSides, (v) => (C().padSides = v), { min: 8, max: 32, step: 8, integer: true, title: '8 · 16 · 32 vertices around a pad' }, onChange);
  if (rosette || tufted) stepper(sRes, 'Leaf sides', () => C().leafSides, (v) => (C().leafSides = v), { min: 6, max: 16, step: 2, integer: true }, onChange);
  slider(sRes, 'Ring aspect', () => C().ringAspect, (v) => (C().ringAspect = v), { min: 0.5, max: 3, step: 0.1, unit: '×', title: 'Ring spacing as a multiple of the vertex spacing around the stem' }, onChange);
  stepper(sRes, 'Collar rings', () => C().collarRings, (v) => (C().collarRings = v), { min: 0, max: 3, integer: true }, onChange);
  slider(sRes, 'Sway', () => C().sway, (v) => (C().sway = v), { min: 0, max: 1, step: 0.05, title: 'Whole-plant sway weight (cacti barely move)' }, onChange);
  slider(sRes, 'Flex', () => C().flex, (v) => (C().flex = v), { min: 0, max: 1, step: 0.05, title: 'Bending of arms, pads and leaves about their base' }, onChange);

  page.append(
    Object.assign(el('p', 'note'), {
      textContent:
        'A cactus is one closed quad surface, like the trees and grasses. The body rises from a buried base ring; every arm, pad, leaf, flower, fruit, areole cushion and spine leaves its parent through a window cut into the parent\'s ring grid and is welded with collar loops. Areoles sit on the rib crests, and fruit bodies double their ring resolution through all-quad refinement bands.',
    }),
  );
}

// -----------------------------------------------------------------------------
// Crop page (vegetables with their fruit)
// -----------------------------------------------------------------------------

function buildVegetablePage(): void {
  const page = pages.vegetable;
  page.innerHTML = '';
  if (!isVegetable(params) || !params.vegetable) return;
  const V = (): VegetableParams => params.vegetable!;
  const v = V();
  seedHeader(page);
  const rebuild = (): void => {
    onChange();
    buildVegetablePage();
  };
  const bush = v.form === 'bush';
  const vine = v.form === 'vine';
  const rosette = v.form === 'rosette';
  const stalk = v.form === 'stalk';
  const hasFruit = !rosette;

  const sForm = section('Growth form', page, { hint: VEGETABLE_FORM_NAMES[v.form].split(' ')[0].toLowerCase() });
  select(sForm, 'Form', (Object.keys(VEGETABLE_FORM_NAMES) as VegetableForm[]).map((k) => ({ value: k, label: VEGETABLE_FORM_NAMES[k] })), () => V().form, (val) => (V().form = val), rebuild);
  slider(sForm, vine ? 'Vine length' : rosette ? 'Stem height' : 'Height', () => V().height, (val) => (V().height = val), { min: 0.02, max: 4, step: 0.01, ...cm }, onChange);
  slider(sForm, 'Height variation', () => V().heightV, (val) => (V().heightV = val), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
  slider(sForm, 'Stem radius', () => V().radius, (val) => (V().radius = val), { min: 0.002, max: 0.05, step: 0.0005, ...mm }, onChange);
  if (bush || stalk) {
    slider(sForm, 'Lean', () => V().lean, (val) => (V().lean = val), { min: 0, max: 30, step: 1, unit: '°' }, onChange);
    slider(sForm, 'Lean variation', () => V().leanV, (val) => (V().leanV = val), { min: 0, max: 20, step: 1, unit: '°' }, onChange);
    slider(sForm, 'Curve', () => V().curve, (val) => (V().curve = val), { min: 0, max: 40, step: 1, unit: '°' }, onChange);
  }
  if (vine) {
    slider(sForm, 'Vines', () => V().vines, (val) => (V().vines = Math.round(val)), { min: 1, max: 8, step: 1 }, onChange);
    slider(sForm, 'Wander', () => V().vineWander, (val) => (V().vineWander = val), { min: 0, max: 60, step: 1, unit: '°', title: 'Sinuosity of the vines along the ground' }, onChange);
  }
  if (stalk) stepper(sForm, 'Nodes', () => V().nodes, (val) => (V().nodes = val), { min: 2, max: 20, integer: true }, onChange);

  if (bush) {
    const sBr = section('Branches', page, { hint: `${v.branches} branches` });
    slider(sBr, 'Branches', () => V().branches, (val) => (V().branches = Math.round(val)), { min: 0, max: 16, step: 1 }, onChange);
    slider(sBr, 'Branches variation', () => V().branchesV, (val) => (V().branchesV = Math.round(val)), { min: 0, max: 6, step: 1, unit: '±' }, onChange);
    slider(sBr, 'Attach from', () => V().branchFrom, (val) => (V().branchFrom = val), { min: 0.05, max: 0.9, step: 0.01 }, onChange);
    slider(sBr, 'Attach to', () => V().branchTo, (val) => (V().branchTo = val), { min: 0.1, max: 0.98, step: 0.01 }, onChange);
    slider(sBr, 'Branch length', () => V().branchLength, (val) => (V().branchLength = val), { min: 0.05, max: 1, step: 0.01, unit: '× height' }, onChange);
    slider(sBr, 'Length variation', () => V().branchLengthV, (val) => (V().branchLengthV = val), { min: 0, max: 0.6, step: 0.01, unit: '±' }, onChange);
    slider(sBr, 'Branch radius', () => V().branchRadius, (val) => (V().branchRadius = val), { min: 0.2, max: 1, step: 0.01, unit: '× stem' }, onChange);
    slider(sBr, 'Branch angle', () => V().branchAngle, (val) => (V().branchAngle = val), { min: 10, max: 90, step: 1, unit: '°' }, onChange);
    slider(sBr, 'Droop', () => V().branchDroop, (val) => (V().branchDroop = val), { min: 0, max: 90, step: 1, unit: '°', title: 'Branch bending under the fruit load' }, onChange);
  }

  const sLeaf = section('Leaves', page, { hint: `${v.leafShape}` });
  select(sLeaf, 'Leaf shape', (['simple', 'lobed', 'pinnate', 'strap'] as LeafShape[]).map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })), () => V().leafShape, (val) => (V().leafShape = val), rebuild);
  if (rosette) {
    slider(sLeaf, 'Rosette leaves', () => V().rosetteLeaves, (val) => (V().rosetteLeaves = Math.round(val)), { min: 0, max: 40, step: 1, title: 'Open outer leaves' }, onChange);
    slider(sLeaf, 'Spread', () => V().rosetteSpread, (val) => (V().rosetteSpread = val), { min: 10, max: 100, step: 1, unit: '°', title: 'Angle from the vertical of the outermost leaves' }, onChange);
  } else {
    slider(sLeaf, vine ? 'Leaves per vine' : 'Leaves on the stem', () => V().leaves, (val) => (V().leaves = Math.round(val)), { min: 0, max: 30, step: 1 }, onChange);
    if (bush) slider(sLeaf, 'Leaves per branch', () => V().branchLeaves, (val) => (V().branchLeaves = Math.round(val)), { min: 0, max: 10, step: 1 }, onChange);
  }
  slider(sLeaf, 'Leaf length', () => V().leafLength, (val) => (V().leafLength = val), { min: 0.03, max: 1.2, step: 0.005, ...cm }, onChange);
  slider(sLeaf, 'Length variation', () => V().leafLengthV, (val) => (V().leafLengthV = val), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
  slider(sLeaf, 'Width', () => V().leafWidth, (val) => (V().leafWidth = val), { min: 0.1, max: 1.3, step: 0.01, unit: '× length' }, onChange);
  slider(sLeaf, 'Thickness', () => V().leafThickness, (val) => (V().leafThickness = val), { min: 0.01, max: 0.3, step: 0.005, unit: '× w' }, onChange);
  if (!stalk) {
    slider(sLeaf, 'Petiole', () => V().petiole, (val) => (V().petiole = val), { min: 0, max: 2, step: 0.05, unit: '× blade', title: 'Leaf stalk length; 0 = sessile' }, onChange);
    slider(sLeaf, 'Petiole radius', () => V().petioleRadius, (val) => (V().petioleRadius = val), { min: 0.0008, max: 0.012, step: 0.0001, format: (x) => (x * 1000).toFixed(1), unit: 'mm' }, onChange);
  }
  if (!rosette) slider(sLeaf, 'Leaf angle', () => V().leafAngle, (val) => (V().leafAngle = val), { min: 5, max: 90, step: 1, unit: '°' }, onChange);
  slider(sLeaf, 'Droop', () => V().leafDroop, (val) => (V().leafDroop = val), { min: 0, max: 120, step: 1, unit: '°' }, onChange);
  slider(sLeaf, 'Cupping', () => V().leafCup, (val) => (V().leafCup = val), { min: -60, max: 120, step: 5, unit: '°', title: 'Arc of the blade cross-section; negative folds downwards' }, onChange);
  if (v.leafShape === 'pinnate' || v.leafShape === 'lobed') {
    stepper(sLeaf, v.leafShape === 'pinnate' ? 'Leaflets per side' : 'Lobes per side', () => V().leaflets, (val) => (V().leaflets = val), { min: 0, max: 8, integer: true }, onChange);
    if (v.leafShape === 'lobed') slider(sLeaf, 'Lobe depth', () => V().lobeDepth, (val) => (V().lobeDepth = val), { min: 0.1, max: 1, step: 0.05 }, onChange);
  }

  if (rosette) {
    const sHead = section('Head & root', page, { hint: v.headLeaves > 0 ? 'head' : v.rootLength > 0 ? 'storage root' : 'open' });
    slider(sHead, 'Head leaves', () => V().headLeaves, (val) => (V().headLeaves = Math.round(val)), { min: 0, max: 20, step: 1, title: 'Wrapped leaves forming a head (cabbage, lettuce)' }, onChange);
    slider(sHead, 'Head radius', () => V().headRadius, (val) => (V().headRadius = val), { min: 0.02, max: 0.25, step: 0.002, ...cm }, onChange);
    slider(sHead, 'Wrap', () => V().headWrap, (val) => (V().headWrap = val), { min: 0, max: 1, step: 0.05, title: '0 loose · 1 tight' }, onChange);
    slider(sHead, 'Root length', () => V().rootLength, (val) => (V().rootLength = val), { min: 0, max: 0.4, step: 0.005, ...cm, title: '0 = fibrous root, not modelled' }, rebuild);
    if (v.rootLength > 0) {
      slider(sHead, 'Root radius', () => V().rootRadius, (val) => (V().rootRadius = val), { min: 0.005, max: 0.08, step: 0.001, ...mm }, onChange);
      select(sHead, 'Root shape', [{ value: 'tapered', label: 'Tapered (carrot)' }, { value: 'round', label: 'Round (beet)' }] as { value: 'tapered' | 'round'; label: string }[], () => V().rootShape, (val) => (V().rootShape = val), onChange);
      slider(sHead, 'Shoulders exposed', () => V().rootExposed, (val) => (V().rootExposed = val), { min: 0, max: 0.6, step: 0.01, ...pct, title: 'Fraction of the root showing above the soil' }, onChange);
    }
  }

  if (hasFruit) {
    const crop = v.fruitShape === 'ear' ? 'Ears' : v.fruitShape === 'pod' ? 'Pods' : 'Fruits';
    const sFr = section(crop, page, { hint: FRUIT_SHAPE_NAMES[v.fruitShape].split(' ')[0].toLowerCase() });
    select(sFr, 'Shape', (Object.keys(FRUIT_SHAPE_NAMES) as FruitShape[]).map((k) => ({ value: k, label: FRUIT_SHAPE_NAMES[k] })), () => V().fruitShape, (val) => (V().fruitShape = val), rebuild);
    slider(sFr, bush ? `${crop} per branch` : vine ? `${crop} per vine` : crop, () => V().fruits, (val) => (V().fruits = Math.round(val)), { min: 0, max: 12, step: 1 }, onChange);
    slider(sFr, 'Variation', () => V().fruitsV, (val) => (V().fruitsV = Math.round(val)), { min: 0, max: 4, step: 1, unit: '±' }, onChange);
    slider(sFr, 'Attach from', () => V().fruitFrom, (val) => (V().fruitFrom = val), { min: 0.05, max: 0.9, step: 0.01 }, onChange);
    slider(sFr, 'Attach to', () => V().fruitTo, (val) => (V().fruitTo = val), { min: 0.1, max: 0.98, step: 0.01 }, onChange);
    slider(sFr, 'Length', () => V().fruitLength, (val) => (V().fruitLength = val), { min: 0.01, max: 0.4, step: 0.002, ...cm }, onChange);
    slider(sFr, 'Length variation', () => V().fruitLengthV, (val) => (V().fruitLengthV = val), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
    slider(sFr, 'Radius', () => V().fruitRadius, (val) => (V().fruitRadius = val), { min: 0.003, max: 0.25, step: 0.001, ...mm }, onChange);
    if (v.fruitShape === 'oblate' || v.fruitShape === 'oblong' || v.fruitShape === 'tapered') {
      stepper(sFr, 'Ribs', () => V().fruitRibs, (val) => (V().fruitRibs = val), { min: 0, max: 24, integer: true }, onChange);
      slider(sFr, 'Rib depth', () => V().fruitRibDepth, (val) => (V().fruitRibDepth = val), { min: 0, max: 0.3, step: 0.01, unit: '× r' }, onChange);
    }
    slider(sFr, stalk ? 'Shank length' : 'Pedicel', () => V().pedicel, (val) => (V().pedicel = val), { min: 0.005, max: 0.12, step: 0.001, ...mm, title: 'Fruit stalk length' }, onChange);
    slider(sFr, 'Pedicel radius', () => V().pedicelRadius, (val) => (V().pedicelRadius = val), { min: 0.0008, max: 0.012, step: 0.0001, format: (x) => (x * 1000).toFixed(1), unit: 'mm' }, onChange);
    if (!vine) slider(sFr, stalk ? 'Ear angle' : 'Hang', () => V().fruitDroop, (val) => (V().fruitDroop = val), { min: -90, max: 90, step: 1, unit: '°', title: 'Droop of the fruit stalk from the horizontal; negative points up (okra, maize ears)' }, onChange);
    if (bush) stepper(sFr, 'Truss', () => V().truss, (val) => (V().truss = val), { min: 1, max: 8, integer: true, title: 'Fruits per fruit stalk' }, onChange);
    if (v.fruitShape === 'round' || v.fruitShape === 'oblong' || v.fruitShape === 'tapered') {
      stepper(sFr, 'Calyx sepals', () => V().calyx, (val) => (V().calyx = val), { min: 0, max: 8, integer: true }, onChange);
      slider(sFr, 'Sepal length', () => V().calyxLength, (val) => (V().calyxLength = val), { min: 0.003, max: 0.06, step: 0.001, ...mm }, onChange);
    }
    if (v.fruitShape === 'ear') {
      stepper(sFr, 'Husk leaves', () => V().husk, (val) => (V().husk = val), { min: 0, max: 6, integer: true }, onChange);
      slider(sFr, 'Husk opened', () => V().huskOpen, (val) => (V().huskOpen = val), { min: 0, max: 1, step: 0.01, ...pct, title: 'How far the husks are peeled back from the tip' }, onChange);
      slider(sFr, 'Silk', () => V().silk, (val) => (V().silk = val), { min: 0, max: 0.15, step: 0.005, ...cm }, onChange);
      select(sFr, 'Kernel rows', [{ value: 0, label: 'Smooth ear' }, { value: 12, label: '12 rows' }, { value: 16, label: '16 rows' }, { value: 24, label: '24 rows' }, { value: 32, label: '32 rows' }], () => V().kernelRows, (val) => (V().kernelRows = val), rebuild);
      if (v.kernelRows > 0) {
        stepper(sFr, 'Kernels per row', () => V().kernels, (val) => (V().kernels = val), { min: 8, max: 60, integer: true }, onChange);
        slider(sFr, 'Kernel relief', () => V().kernelDepth, (val) => (V().kernelDepth = val), { min: 0, max: 0.3, step: 0.01, ...pct, title: 'Depth of the grooves between kernels, as a fraction of the ear radius' }, onChange);
      }
    }
  }
  if (stalk) {
    const sTas = section('Tassel', page, { hint: v.tassel ? `${v.tasselBranches} branches` : 'none' });
    check(sTas, 'Tassel', () => V().tassel > 0, (val) => (V().tassel = val ? 1 : 0), rebuild);
    if (v.tassel > 0) {
      slider(sTas, 'Tassel length', () => V().tasselLength, (val) => (V().tasselLength = val), { min: 0.05, max: 0.8, step: 0.01, ...cm }, onChange);
      slider(sTas, 'Tassel branches', () => V().tasselBranches, (val) => (V().tasselBranches = Math.round(val)), { min: 0, max: 30, step: 1 }, onChange);
    }
  }

  const sRes = section('Resolution & wind', page, { collapsed: true });
  stepper(sRes, 'Stem sides', () => V().stemSides, (val) => (V().stemSides = val), { min: 8, max: 24, step: 2, integer: true }, onChange);
  stepper(sRes, 'Leaf sides', () => V().leafSides, (val) => (V().leafSides = val), { min: 6, max: 16, step: 2, integer: true }, onChange);
  if (hasFruit) stepper(sRes, 'Fruit sides', () => V().fruitSides, (val) => (V().fruitSides = val), { min: 8, max: 32, step: 4, integer: true, title: 'Vertices around the fruit at its equator (6 → 12 → 24 through refinement bands)' }, onChange);
  slider(sRes, 'Ring aspect', () => V().ringAspect, (val) => (V().ringAspect = val), { min: 0.5, max: 3, step: 0.1, unit: '×' }, onChange);
  stepper(sRes, 'Collar rings', () => V().collarRings, (val) => (V().collarRings = val), { min: 0, max: 3, integer: true }, onChange);
  slider(sRes, 'Sway', () => V().sway, (val) => (V().sway = val), { min: 0, max: 1, step: 0.05 }, onChange);
  slider(sRes, 'Flex', () => V().flex, (val) => (V().flex = val), { min: 0, max: 1, step: 0.05, title: 'Bending of branches, leaves and fruit stalks about their base' }, onChange);

  page.append(
    Object.assign(el('p', 'note'), {
      textContent:
        'A vegetable is modelled with its crop as one closed quad surface: the stem rises from a buried base ring (or the storage root), and every branch, petiole, blade, leaflet, fruit stalk, fruit, sepal, husk and silk is welded to its parent through a window. Fruit bodies double their ring resolution through all-quad refinement bands right after the neck, so a tomato is 24 vertices around on a 6-vertex pedicel.',
    }),
  );
}

// -----------------------------------------------------------------------------
// Trap page (carnivorous plants)
// -----------------------------------------------------------------------------

function buildCarnivorePage(): void {
  const page = pages.carnivore;
  page.innerHTML = '';
  if (!isCarnivore(params) || !params.carnivore) return;
  const C = (): CarnivoreParams => params.carnivore!;
  const c = C();
  seedHeader(page);
  const rebuild = (): void => {
    onChange();
    buildCarnivorePage();
  };
  const rosette = c.form === 'rosette';
  const pitcher = c.form === 'pitcher';
  const vine = c.form === 'vine';
  const snap = rosette && c.trap === 'snap';
  const sundew = rosette && c.trap === 'tentacle';
  const cobra = pitcher && c.hood === 'cobra';

  const sForm = section('Growth form', page, { hint: CARNIVORE_FORM_NAMES[c.form].split(' ')[0].toLowerCase() });
  select(sForm, 'Form', (Object.keys(CARNIVORE_FORM_NAMES) as CarnivoreForm[]).map((k) => ({ value: k, label: CARNIVORE_FORM_NAMES[k] })), () => C().form, (val) => (C().form = val), rebuild);
  slider(sForm, vine ? 'Stem length' : 'Crown height', () => C().height, (val) => (C().height = val), { min: 0.003, max: vine ? 4 : 0.15, step: 0.001, ...cm }, onChange);
  slider(sForm, 'Height variation', () => C().heightV, (val) => (C().heightV = val), { min: 0, max: 0.5, step: 0.01, unit: '±' }, onChange);
  slider(sForm, vine ? 'Stem radius' : 'Crown radius', () => C().radius, (val) => (C().radius = val), { min: 0.002, max: 0.06, step: 0.0005, ...mm }, onChange);
  if (vine) slider(sForm, 'Lean', () => C().lean, (val) => (C().lean = val), { min: 0, max: 85, step: 1, unit: '°', title: 'How far the scrambling stem leans over by its top' }, onChange);

  if (!pitcher) {
    const sLeaf = section('Leaves', page, { hint: `${c.leaves} leaves` });
    slider(sLeaf, 'Leaves', () => C().leaves, (val) => (C().leaves = Math.round(val)), { min: 1, max: 30, step: 1 }, onChange);
    slider(sLeaf, vine ? 'Blade length' : 'Leaf length', () => C().leafLength, (val) => (C().leafLength = val), { min: 0.01, max: 0.5, step: 0.001, ...cm }, onChange);
    slider(sLeaf, 'Length variation', () => C().leafLengthV, (val) => (C().leafLengthV = val), { min: 0, max: 0.6, step: 0.01, unit: '±' }, onChange);
    slider(sLeaf, snap ? 'Petiole width' : 'Blade width', () => C().leafWidth, (val) => (C().leafWidth = val), { min: 0.002, max: 0.12, step: 0.0005, ...mm }, onChange);
    slider(sLeaf, 'Thickness', () => C().leafThickness, (val) => (C().leafThickness = val), { min: 0.01, max: 0.4, step: 0.005, unit: '× width' }, onChange);
    if (rosette) {
      slider(sLeaf, 'Spread · outer', () => C().leafSpread, (val) => (C().leafSpread = val), { min: 0, max: 95, step: 1, unit: '°', title: 'Angle from the vertical of the oldest leaves' }, onChange);
      slider(sLeaf, 'Spread · inner', () => C().leafSpreadTop, (val) => (C().leafSpreadTop = val), { min: 0, max: 95, step: 1, unit: '°' }, onChange);
      slider(sLeaf, 'Petiole', () => C().petiole, (val) => (C().petiole = val), { min: 0, max: 0.85, step: 0.01, unit: '× length', title: 'Share of the leaf that is petiole; the rest is the trap or blade' }, onChange);
    } else {
      slider(sLeaf, 'Spread', () => C().leafSpread, (val) => (C().leafSpread = val), { min: 10, max: 95, step: 1, unit: '°' }, onChange);
      slider(sLeaf, 'Spread · top', () => C().leafSpreadTop, (val) => (C().leafSpreadTop = val), { min: 10, max: 95, step: 1, unit: '°' }, onChange);
    }
    slider(sLeaf, 'Droop', () => C().leafDroop, (val) => (C().leafDroop = val), { min: -30, max: 90, step: 1, unit: '°' }, onChange);
    if (!snap) slider(sLeaf, 'Channel', () => C().leafCup, (val) => (C().leafCup = val), { min: 0, max: 150, step: 1, unit: '°', title: 'Arc of the blade across its width' }, onChange);
    if (sundew) slider(sLeaf, 'Tip curl', () => C().tipCurl, (val) => (C().tipCurl = val), { min: 0, max: 270, step: 5, unit: '°', title: 'Young blades unroll from a curl' }, onChange);
  }

  if (rosette) {
    const sTrap = section('Trap', page, { hint: TRAP_NAMES[c.trap].split(' ')[0].toLowerCase() });
    select(sTrap, 'Kind', (Object.keys(TRAP_NAMES) as TrapKind[]).map((k) => ({ value: k, label: TRAP_NAMES[k] })), () => C().trap, (val) => (C().trap = val), rebuild);
    if (snap) {
      slider(sTrap, 'Lobe width', () => C().trapWidth, (val) => (C().trapWidth = val), { min: 0.003, max: 0.05, step: 0.0005, ...mm }, onChange);
      slider(sTrap, 'Opening', () => C().trapOpen, (val) => (C().trapOpen = val), { min: 5, max: 175, step: 1, unit: '°', title: 'Angle between the lobes: shut to flat open' }, onChange);
      slider(sTrap, 'Opening variation', () => C().trapOpenV, (val) => (C().trapOpenV = val), { min: 0, max: 0.8, step: 0.01, unit: '±' }, onChange);
      slider(sTrap, 'Teeth per lobe', () => C().cilia, (val) => (C().cilia = Math.round(val)), { min: 0, max: 24, step: 1 }, onChange);
      slider(sTrap, 'Tooth length', () => C().ciliaLength, (val) => (C().ciliaLength = val), { min: 0, max: 0.012, step: 0.0001, ...mm }, onChange);
      slider(sTrap, 'Trigger hairs', () => C().triggerHairs, (val) => (C().triggerHairs = Math.round(val)), { min: 0, max: 6, step: 1, unit: 'per lobe' }, onChange);
    }
    if (sundew) {
      slider(sTrap, 'Tentacles per leaf', () => C().tentacles, (val) => (C().tentacles = Math.round(val)), { min: 0, max: 200, step: 1 }, onChange);
      slider(sTrap, 'Tentacle length', () => C().tentacleLength, (val) => (C().tentacleLength = val), { min: 0.0005, max: 0.012, step: 0.0001, ...mm }, onChange);
      slider(sTrap, 'Tentacle radius', () => C().tentacleRadius, (val) => (C().tentacleRadius = val), { min: 0.00005, max: 0.001, step: 0.00001, format: (v: number) => (v * 1000).toFixed(2), unit: 'mm' }, onChange);
    }
  }

  if (pitcher || vine) {
    const sPit = section('Pitchers', page, { hint: pitcher ? `${c.pitchers} pitchers` : `${cm.format(c.pitcherHeight)} cm` });
    if (pitcher) slider(sPit, 'Pitchers', () => C().pitchers, (val) => (C().pitchers = Math.round(val)), { min: 1, max: 24, step: 1 }, onChange);
    slider(sPit, 'Height', () => C().pitcherHeight, (val) => (C().pitcherHeight = val), { min: 0.02, max: 1.2, step: 0.005, ...cm }, onChange);
    slider(sPit, 'Height variation', () => C().pitcherHeightV, (val) => (C().pitcherHeightV = val), { min: 0, max: 0.6, step: 0.01, unit: '±' }, onChange);
    slider(sPit, 'Base radius', () => C().pitcherBase, (val) => (C().pitcherBase = val), { min: 0.001, max: 0.04, step: 0.0005, ...mm }, onChange);
    slider(sPit, 'Mouth radius', () => C().pitcherMouth, (val) => (C().pitcherMouth = val), { min: 0.003, max: 0.1, step: 0.0005, ...mm }, onChange);
    slider(sPit, 'Flare', () => C().pitcherTaper, (val) => (C().pitcherTaper = val), { min: 0.3, max: 4, step: 0.05, title: 'Exponent of the widening: 1 is a straight cone, higher a trumpet, lower bulges early' }, onChange);
    slider(sPit, 'Belly', () => C().pitcherBelly, (val) => (C().pitcherBelly = val), { min: 0.6, max: 2.5, step: 0.01, unit: '×' }, onChange);
    slider(sPit, 'Belly position', () => C().pitcherBellyPos, (val) => (C().pitcherBellyPos = val), { min: 0, max: 1, step: 0.01 }, onChange);
    slider(sPit, 'Belly width', () => C().pitcherBellyWidth, (val) => (C().pitcherBellyWidth = val), { min: 0.05, max: 0.6, step: 0.01 }, onChange);
    if (pitcher) {
      slider(sPit, 'Lean', () => C().pitcherLean, (val) => (C().pitcherLean = val), { min: 0, max: 85, step: 1, unit: '°' }, onChange);
      slider(sPit, 'Curve up', () => C().pitcherCurve, (val) => (C().pitcherCurve = val), { min: 0, max: 90, step: 1, unit: '°', title: 'A leaning pitcher curving back towards the vertical' }, onChange);
      slider(sPit, 'Twist', () => C().pitcherTwist, (val) => (C().pitcherTwist = val), { min: 0, max: 360, step: 5, unit: '°', title: 'Twist of the tube over its length (shows in the wing)' }, onChange);
    }
    slider(sPit, 'Wing', () => C().wing, (val) => (C().wing = val), { min: 0, max: 1.2, step: 0.01, unit: '× radius' }, onChange);
    slider(sPit, 'Rolled lip', () => C().peristome, (val) => (C().peristome = val), { min: 0, max: 0.5, step: 0.01, unit: '× mouth' }, onChange);
    slider(sPit, 'Visible depth', () => C().pitcherDepth, (val) => (C().pitcherDepth = val), { min: 0.05, max: 0.9, step: 0.01, unit: '× height', title: 'How far down the inside is modelled before the pool' }, onChange);

    const sHood = section(vine ? 'Lid' : 'Hood', page, { hint: vine ? 'lid' : HOOD_NAMES[c.hood].split(' ')[0].toLowerCase() });
    if (pitcher) select(sHood, 'Kind', (Object.keys(HOOD_NAMES) as HoodKind[]).map((k) => ({ value: k, label: HOOD_NAMES[k] })), () => C().hood, (val) => (C().hood = val), rebuild);
    if (!cobra) {
      slider(sHood, 'Length', () => C().hoodLength, (val) => (C().hoodLength = val), { min: 0, max: 0.2, step: 0.001, ...cm }, onChange);
      slider(sHood, 'Width', () => C().hoodWidth, (val) => (C().hoodWidth = val), { min: 0, max: 0.2, step: 0.001, ...cm }, onChange);
      slider(sHood, vine ? 'Opening' : c.hood === 'erect' ? 'Tilt back' : 'Arch', () => C().hoodAngle, (val) => (C().hoodAngle = val), { min: 0, max: 150, step: 1, unit: '°' }, onChange);
      slider(sHood, 'Curl', () => C().hoodCup, (val) => (C().hoodCup = val), { min: -120, max: 150, step: 1, unit: '°', title: 'Curl of the margins towards the mouth (negative: away)' }, onChange);
    } else {
      slider(sHood, 'Head bend', () => C().headBend, (val) => (C().headBend = val), { min: 60, max: 200, step: 1, unit: '°' }, onChange);
      slider(sHood, 'Dome', () => C().headBulge, (val) => (C().headBulge = val), { min: 1, max: 4, step: 0.05, unit: '× radius' }, onChange);
      slider(sHood, 'Fishtail length', () => C().fishtail, (val) => (C().fishtail = val), { min: 0, max: 0.15, step: 0.001, ...cm }, onChange);
      slider(sHood, 'Fishtail width', () => C().fishtailWidth, (val) => (C().fishtailWidth = val), { min: 0.005, max: 0.06, step: 0.0005, ...mm }, onChange);
    }
    if (vine) {
      slider(sHood, 'Tendril length', () => C().tendrilLength, (val) => (C().tendrilLength = val), { min: 0.02, max: 0.6, step: 0.005, ...cm }, onChange);
      slider(sHood, 'Tendril radius', () => C().tendrilRadius, (val) => (C().tendrilRadius = val), { min: 0.0005, max: 0.005, step: 0.0001, ...mm }, onChange);
    }
  }

  if (!vine) {
    const sFl = section('Flowers', page, { hint: c.scape > 0 ? `${c.scape} scape${c.scape > 1 ? 's' : ''}` : 'none', collapsed: c.scape === 0 });
    slider(sFl, 'Scapes', () => C().scape, (val) => (C().scape = Math.round(val)), { min: 0, max: 4, step: 1 }, rebuild);
    if (c.scape > 0) {
      slider(sFl, 'Scape height', () => C().scapeHeight, (val) => (C().scapeHeight = val), { min: 0.03, max: 1, step: 0.005, ...cm }, onChange);
      slider(sFl, 'Scape radius', () => C().scapeRadius, (val) => (C().scapeRadius = val), { min: 0.0004, max: 0.006, step: 0.0001, ...mm }, onChange);
      slider(sFl, 'Lateral flowers', () => C().flowers, (val) => (C().flowers = Math.round(val)), { min: 0, max: 24, step: 1, title: 'Flowers along the top of the scape besides the terminal one' }, onChange);
      slider(sFl, 'Flower radius', () => C().flowerRadius, (val) => (C().flowerRadius = val), { min: 0.001, max: 0.06, step: 0.0005, ...mm }, onChange);
      slider(sFl, 'Flower length', () => C().flowerLength, (val) => (C().flowerLength = val), { min: 0.002, max: 0.08, step: 0.0005, ...mm }, onChange);
      slider(sFl, 'Nod', () => C().flowerNod, (val) => (C().flowerNod = val), { min: 0, max: 170, step: 1, unit: '°' }, onChange);
    }
  }

  const sRes = section('Resolution · motion', page, { hint: `${c.sides} sides`, collapsed: true });
  slider(sRes, vine ? 'Stem sides' : 'Crown sides', () => C().sides, (val) => (C().sides = Math.round(val / 2) * 2), { min: 8, max: 96, step: 2 }, onChange);
  if (!pitcher) slider(sRes, 'Leaf sides', () => C().leafSides, (val) => (C().leafSides = Math.round(val / 4) * 4), { min: 8, max: 24, step: 4 }, onChange);
  if (pitcher || vine) slider(sRes, 'Pitcher sides', () => C().pitcherSides, (val) => (C().pitcherSides = Math.round(val)), { min: 12, max: 48, step: 2 }, onChange);
  slider(sRes, 'Ring aspect', () => C().ringAspect, (val) => (C().ringAspect = val), { min: 0.5, max: 2.5, step: 0.05, title: 'Ring spacing relative to the width of a quad' }, onChange);
  stepper(sRes, 'Collar rings', () => C().collarRings, (val) => (C().collarRings = val), { min: 0, max: 3, integer: true }, onChange);
  slider(sRes, 'Sway', () => C().sway, (val) => (C().sway = val), { min: 0, max: 1, step: 0.05 }, onChange);
  slider(sRes, 'Flex', () => C().flex, (val) => (C().flex = val), { min: 0, max: 1, step: 0.05, title: 'Bending of leaves, pitchers and scapes about their base' }, onChange);

  page.append(
    Object.assign(el('p', 'note'), {
      textContent:
        'A carnivorous plant is modelled with its traps as one closed quad surface. A flytrap leaf is a single tube whose flat petiole section turns into two dished lobes on a hinge, with the teeth and trigger hairs welded to the lobes; a sundew blade carries its tentacles on a row lattice; a pitcher is a tube that flares to the mouth, rolls over the lip and goes back down inside to the surface of the pool, so the mouth is really open, with the hood or lid welded just below the lip.',
    }),
  );
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

  const s1 = section('Root system', page, { hint: R().enabled ? `${R().count} primary` : 'off' });
  check(s1, 'Grow roots', () => R().enabled, (v) => (R().enabled = v), onChange);
  stepper(s1, 'Primary roots', () => R().count, (v) => (R().count = v), { min: 1, max: 12, integer: true, title: 'Roots leaving the trunk base; the trunk gets one buttress lobe per root' }, onChange);
  slider(s1, 'Length', () => R().length, (v) => (R().length = v), { min: 0.04, max: 0.6, step: 0.01, title: 'Fraction of the tree height', format: (v) => `${(v * params.botany.scale).toFixed(1)}`, unit: 'm' }, onChange);
  slider(s1, 'Length variation', () => R().lengthV, (v) => (R().lengthV = v), { min: 0, max: 0.3, step: 0.01 }, onChange);
  slider(s1, 'Radius', () => R().radius, (v) => (R().radius = v), { min: 0.1, max: 0.68, step: 0.01, title: 'Fraction of the trunk radius' }, onChange);
  slider(s1, 'Radius variation', () => R().radiusV, (v) => (R().radiusV = v), { min: 0, max: 0.5, step: 0.01 }, onChange);
  slider(s1, 'Taper', () => R().taper, (v) => (R().taper = v), { min: 0.3, max: 2, step: 0.05, title: '<1 stays thick for longer, >1 thins out quickly' }, onChange);
  slider(s1, 'Exit height', () => R().emergeHeight, (v) => (R().emergeHeight = v), { min: 0, max: 2.5, step: 0.05, title: 'Height of the root above the ground where it leaves the trunk, in root radii' }, onChange);
  slider(s1, 'Descent', () => R().descent, (v) => (R().descent = v), { min: 0, max: 60, step: 1, title: 'Initial pitch below the horizontal', unit: '°' }, onChange);
  slider(s1, 'Exposure', () => R().exposure, (v) => (R().exposure = v), { min: 0, max: 1, step: 0.02, title: '0 = flush with the soil · 0.5 = half buried · 1 = lying on top' }, onChange);
  slider(s1, 'Meander', () => R().wander, (v) => (R().wander = v), { min: 0, max: 1.5, step: 0.05 }, onChange);
  slider(s1, 'Dive at', () => R().dive, (v) => (R().dive = v), { min: 0.3, max: 1, step: 0.02, title: 'Fraction of the length after which the tip dives underground' }, onChange);

  const s2 = section('Branching', page);
  slider(s2, 'Fork chance', () => R().forks, (v) => (R().forks = v), { min: 0, max: 1, step: 0.05 }, onChange);
  stepper(s2, 'Laterals per root', () => R().laterals, (v) => (R().laterals = v), { min: 0, max: 6, integer: true }, onChange);
  slider(s2, 'Lateral radius', () => R().lateralRadius, (v) => (R().lateralRadius = v), { min: 0.2, max: 0.68, step: 0.01, title: 'Relative to the parent root' }, onChange);
  slider(s2, 'Lateral length', () => R().lateralLength, (v) => (R().lateralLength = v), { min: 0.1, max: 1.2, step: 0.05, title: 'Relative to the remaining parent length' }, onChange);

  const s3 = section('Response to objects', page);
  slider(s3, 'Attraction', () => R().attraction, (v) => (R().attraction = v), { min: 0, max: 1, step: 0.05, title: 'Pull towards nearby objects (0 = indifferent)' }, onChange);
  slider(s3, 'Grip', () => R().grip, (v) => (R().grip = v), { min: 0, max: 1, step: 0.05, title: 'How deeply the root presses into the object it follows' }, onChange);
  slider(s3, 'Climb height', () => R().climb, (v) => (R().climb = v), { min: 0, max: 12, step: 0.5, title: 'Objects up to this many root diameters tall are climbed over; taller ones are skirted', unit: '⌀' }, onChange);

  const s4 = section('Objects on site', page, { hint: `${E().obstacles.length} placed` });
  const tools = el('div', 'actions');
  const kindSel = el('select', 'dd');
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
  const placeBtn = button('Place', () => setPlacing(!viewer.isPlacing), { icon: 'place', title: 'Click on the ground in the viewport to add an object' });
  placementRefreshers.push(() => placeBtn.classList.toggle('primary', viewer.isPlacing));
  const scatterBtn = button('Scatter', () => {
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
  }, { icon: 'scatter', title: 'Replace the objects with a random layout within root reach' });
  const clearBtn = button('Clear', () => {
    E().obstacles = [];
    selectedObstacle = -1;
    buildRootsPage();
    scheduleGenerate(true);
  }, { icon: 'trash', cls: 'danger' });
  tools.append(kindSel, placeBtn, scatterBtn, clearBtn);
  s4.append(tools);
  stepper(s4, 'Scatter count', () => E().scatter.count, (v) => (E().scatter.count = v), { min: 0, max: 12, integer: true }, () => undefined);
  slider(s4, 'Block share', () => E().scatter.blocks, (v) => (E().scatter.blocks = v), { min: 0, max: 1, step: 0.05, title: 'Fraction of scattered objects that are blocks' }, () => undefined);

  const list = el('div', 'obj-list');
  const obs = E().obstacles;
  if (obs.length === 0) list.append(el('p', 'note', 'No objects. Place one in the viewport, or scatter a few – roots grow onto whatever stands within their reach and can be dragged around afterwards.'));
  obs.forEach((o, i) => {
    const row = el('div', 'obj-row' + (i === selectedObstacle ? ' selected' : ''));
    const head = el('div', 'li obj-head');
    const title = el('span', 't', `${o.kind === 'rock' ? 'Rock' : 'Block'} ${i + 1}`);
    const pos = el('span', 'm', `${o.x.toFixed(2)}, ${o.z.toFixed(2)} m`);
    const del = el('button', 'ib');
    del.title = 'Remove';
    del.append(icon('x'));
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      removeObstacle(i);
    });
    head.append(el('span', 'dot'), title, pos, del);
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
      slider(body, 'Size', () => o.size, (v) => (o.size = v), { min: 0.1, max: 4, step: 0.05, unit: 'm' }, set(() => undefined));
      slider(body, 'X', () => o.x, (v) => (o.x = v), { min: -15, max: 15, step: 0.05, unit: 'm' }, set(() => undefined));
      slider(body, 'Z', () => o.z, (v) => (o.z = v), { min: -15, max: 15, step: 0.05, unit: 'm' }, set(() => undefined));
      slider(body, 'Rotation', () => (o.yaw * 180) / Math.PI, (v) => (o.yaw = (v * Math.PI) / 180), { min: 0, max: 360, step: 1, unit: '°' }, set(() => undefined));
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
    }),
  );
}

function buildMeshPage(): void {
  const page = pages.mesh;
  page.innerHTML = '';
  const m = (): TreeParams['mesh'] => params.mesh;
  const s1 = section('Resolution', page);
  slider(s1, 'Trunk ring segments', () => m().trunkRadialSegments, (v) => (m().trunkRadialSegments = Math.round(v / 2) * 2), { min: 8, max: 48, step: 2, title: 'Vertices around the trunk. Children derive their ring size from the window they grow out of.', unit: 'v' }, onChange);
  levelsHeader(s1);
  levelRow(s1, 'Rings / segment', () => m().ringsPerSegment, (i, v) => (m().ringsPerSegment[i] = v), { step: 1, min: 1, max: 8, integer: true, enabled: () => params.botany.levels }, onChange);
  slider(s1, 'Root ring segments', () => m().rootRadialSegments, (v) => (m().rootRadialSegments = Math.round(v / 2) * 2), { min: 6, max: 24, step: 2, title: 'Minimum vertices around a primary root where it leaves the trunk', unit: 'v' }, onChange);
  slider(s1, 'Min radius', () => m().minRadius * 1000, (v) => (m().minRadius = v / 1000), { min: 1, max: 30, step: 0.5, unit: 'mm' }, onChange);
  slider(s1, 'Cull below', () => m().cullRadius * 1000, (v) => (m().cullRadius = v / 1000), { min: 0, max: 40, step: 0.5, title: 'Skip stems thinner than this (LOD)', unit: 'mm' }, onChange);
  check(s1, 'Cap stem tips', () => m().capTips, (v) => (m().capTips = v), onChange);

  const s2 = section('Junctions', page);
  slider(s2, 'Collar width', () => m().collarScale, (v) => (m().collarScale = v), { min: 1.0, max: 2.2, step: 0.05, title: 'Window size relative to the child diameter' }, onChange);
  slider(s2, 'Collar length', () => m().collarLength, (v) => (m().collarLength = v), { min: 0.2, max: 2.5, step: 0.05, title: 'Distance of the first full child ring from the parent surface, in child radii' }, onChange);
  stepper(s2, 'Collar rings', () => m().collarRings, (v) => (m().collarRings = v), { min: 0, max: 3, integer: true, title: 'Intermediate edge loops between the window and the first child ring' }, onChange);
  slider(s2, 'Collar fillet', () => m().collarFillet, (v) => (m().collarFillet = v), { min: 0, max: 1, step: 0.05, title: '0 = straight chamfer, 1 = tangent-continuous fillet' }, onChange);
  slider(s2, 'Collar mitre', () => m().collarMitre, (v) => (m().collarMitre = v), { min: 0, max: 0.9, step: 0.05, title: 'Tilt of the first child ring towards the parent surface' }, onChange);
  slider(s2, 'Fork area conservation', () => m().forkRadiusConservation, (v) => (m().forkRadiusConservation = v), { min: 0, max: 1, step: 0.05, title: '0: forks keep the parent radius (Weber–Penn) · 1: cross-section area is conserved (da Vinci rule)' }, onChange);

  const s3 = section('Root buttresses', page);
  stepper(s3, 'Lobes', () => m().rootLobes, (v) => (m().rootLobes = v), { min: 0, max: 9, integer: true, title: 'Used when the root system is disabled; otherwise one lobe per primary root' }, onChange);
  slider(s3, 'Amplitude', () => m().rootLobeAmplitude, (v) => (m().rootLobeAmplitude = v), { min: 0, max: 1, step: 0.02 }, onChange);
  slider(s3, 'Height', () => m().rootLobeHeight, (v) => (m().rootLobeHeight = v), { min: 0.02, max: 0.3, step: 0.01, title: 'Fraction of trunk length over which the lobes fade' }, onChange);

  page.append(
    Object.assign(el('p', 'note'), {
      textContent:
        'The branch system is a single closed quad surface. Side branches grow out of a rectangular window cut into the parent ring grid; forks split the parent ring into arcs joined by a crotch bridge. Nothing is intersected or merged.',
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
  viewRefreshers.push(slider(s1, 'Direction', () => view.windDirection, (v) => (view.windDirection = v), { min: 0, max: 360, step: 1, unit: '°' }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Trunk flex', () => view.trunkFlex, (v) => (view.trunkFlex = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Limb flex', () => view.limbFlex, (v) => (view.limbFlex = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);
  viewRefreshers.push(slider(s1, 'Detail flutter', () => view.detailFlex, (v) => (view.detailFlex = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);

  const fieldHint = viewer.fieldSupported ? 'GPU spring field' : 'no float targets — instantaneous fallback';
  const sT = section('Interaction', page, { hint: 'off' });
  const hintEl = sT.parentElement?.querySelector('.hint');
  viewRefreshers.push(() => {
    if (hintEl) hintEl.textContent = view.pushEnabled ? fieldHint : 'off';
  });
  viewRefreshers.push(check(sT, 'Collision', () => view.pushEnabled, (v) => (view.pushEnabled = v), syncView, { title: 'Colliders bend the plant on the GPU; drag the translucent hand sphere into the plant' }).refresh);
  viewRefreshers.push(check(sT, 'Walker sweep', () => view.pushSweep, (v) => (view.pushSweep = v), syncView, { title: 'A character-sized capsule walks a figure-of-eight through the plant' }).refresh);
  viewRefreshers.push(slider(sT, 'Sweep speed', () => view.pushSpeed, (v) => (view.pushSpeed = v), { min: 0, max: 3, step: 0.05 }, syncView).refresh);
  viewRefreshers.push(slider(sT, 'Hand radius', () => view.pushRadius, (v) => (view.pushRadius = v), { min: 0, max: 1.5, step: 0.01, ...cm, title: '0 sizes the hand collider from the plant height' }, syncView).refresh);
  viewRefreshers.push(slider(sT, 'Rigidity', () => view.pushStiff, (v) => (view.pushStiff = v), { min: 0, max: 1, step: 0.01, title: 'Soft foliage yields locally; rigid stems move as whole limbs' }, syncView).refresh);
  viewRefreshers.push(slider(sT, 'Spring', () => view.pushSpring, (v) => (view.pushSpring = v), { min: 0, max: 1, step: 0.01, title: 'How fast the plant returns after the collider has passed' }, syncView).refresh);
  viewRefreshers.push(slider(sT, 'Damping', () => view.pushDamping, (v) => (view.pushDamping = v), { min: 0, max: 1, step: 0.01, title: 'Low damping springs back with a wobble, high damping settles at once' }, syncView).refresh);

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
    }),
  );
}

function setSeed(seed: number): void {
  params.seed = Math.max(0, Math.round(seed));
  for (const r of refreshers) r();
  scheduleGenerate(true);
}

function rebuildPages(): void {
  buildBotanyPage();
  buildGrassPage();
  buildSucculentPage();
  buildVegetablePage();
  buildCarnivorePage();
  buildRootsPage();
  buildMeshPage();
  buildLibrary();
  syncTabs();
}

function selectPreset(name: string): void {
  const seed = params.seed;
  params = cloneParams(PRESETS.find((p) => p.name === name) ?? PRESETS[0]);
  params.seed = seed;
  selectedObstacle = -1;
  frameOnNext = true;
  rebuildPages();
  scheduleGenerate(true);
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
function showToast(text: string, ms = 1800): void {
  toast.textContent = text;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), ms);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------

buildBotanyPage();
buildGrassPage();
buildSucculentPage();
buildVegetablePage();
buildCarnivorePage();
buildRootsPage();
buildMeshPage();
buildViewPage();
buildLibrary();
syncTabs();
syncView();
generate();

// -----------------------------------------------------------------------------
// Command line (Inspector footer)
// -----------------------------------------------------------------------------

function runCommand(line: string): void {
  const [verb, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(' ');
  const v = verb.toLowerCase();
  if (!v) return;
  if (v === 'seed') {
    const n = parseInt(arg, 10);
    if (Number.isNaN(n)) randomSeed();
    else setSeed(n);
  } else if (v === 'preset' || v === 'species') {
    const q = arg.toLowerCase();
    const hit = PRESETS.find((p) => p.name.toLowerCase() === q) ?? PRESETS.find((p) => p.name.toLowerCase().includes(q));
    if (hit) selectPreset(hit.name);
    else showToast(`No species matches “${arg}”`);
  } else if (v === 'mode') {
    const hit = MODES.find((m) => m.id === arg.toLowerCase() || m.label.toLowerCase() === arg.toLowerCase());
    if (hit) {
      view.mode = hit.id;
      syncView();
    } else showToast('Modes: ' + MODES.map((m) => m.id).join(' · '));
  } else if (v === 'export') {
    const f = arg.toLowerCase();
    if (f === 'obj' || f === 'glb') requestExport(f);
    else showToast('export obj | export glb');
  } else if (v === 'frame') {
    if (arg === 'base') viewer.frameBase(baseReach());
    else viewer.frame();
  } else if (v === 'wind') {
    view.windEnabled = arg ? arg === 'on' : !view.windEnabled;
    syncView();
  } else if (v === 'leaves') {
    view.showLeaves = arg ? arg === 'on' : !view.showLeaves;
    syncView();
  } else if (v === 'touch' || v === 'collide') {
    view.pushEnabled = arg ? arg === 'on' : !view.pushEnabled;
    syncView();
  } else if (v === 'quads' || v === 'wire') {
    view.showWire = arg ? arg === 'on' : !view.showWire;
    syncView();
  } else if (v === 'scatter') {
    const n = parseInt(arg, 10);
    const sc = params.environment.scatter;
    const next = scatterFor(params, Math.floor(Math.random() * 99999) + 1, Number.isNaN(n) ? sc.count : n);
    next.blocks = sc.blocks;
    next.burial = sc.burial;
    next.roughness = sc.roughness;
    params.environment.scatter = next;
    params.environment.obstacles = scatterObstacles(next, trunkBaseRadius(params.botany));
    selectedObstacle = -1;
    buildRootsPage();
    scheduleGenerate(true);
  } else if (v === 'clear') {
    params.environment.obstacles = [];
    selectedObstacle = -1;
    buildRootsPage();
    scheduleGenerate(true);
  } else if (v === 'shot' || v === 'screenshot') {
    download(viewer.screenshot(), `${slug(params.name)}_${params.seed}.png`);
  } else if (v === 'help' || v === '?') {
    showToast('seed [n] · preset <name> · mode <shaded|matcap|wireframe|levels|junctions|wind> · export obj|glb · frame [base] · wind|leaves|quads|touch [on|off] · scatter [n] · clear · shot', 5000);
  } else {
    showToast(`Unknown command “${verb}” · type help`);
  }
}
cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    runCommand(cmdInput.value);
    cmdInput.value = '';
  } else if (e.key === 'Escape') {
    cmdInput.value = '';
    cmdInput.blur();
  }
  e.stopPropagation();
});

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
    rebuildPages();
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
    grass?: Partial<GrassParams>;
    succulent?: Partial<SucculentParams>;
    vegetable?: Partial<VegetableParams>;
    carnivore?: Partial<CarnivoreParams>;
    seed?: number;
    name?: string;
  }) {
    if (partial.botany) Object.assign(params.botany, partial.botany);
    if (partial.grass && params.grass) Object.assign(params.grass, partial.grass);
    if (partial.succulent && params.succulent) Object.assign(params.succulent, partial.succulent);
    if (partial.vegetable && params.vegetable) Object.assign(params.vegetable, partial.vegetable);
    if (partial.carnivore && params.carnivore) Object.assign(params.carnivore, partial.carnivore);
    if (partial.mesh) Object.assign(params.mesh, partial.mesh);
    if (partial.roots) Object.assign(params.roots, partial.roots);
    if (partial.environment) Object.assign(params.environment, partial.environment);
    if (partial.seed !== undefined) params.seed = partial.seed;
    if (partial.name) params.name = partial.name;
    rebuildPages();
    scheduleGenerate(true);
  },
  frameBase: () => viewer.frameBase(baseReach()),
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
