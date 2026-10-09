// Application controller: state, tools, pointer/keyboard handling, undo, rebuilds, inspector,
// outliner and file I/O. The geometry lives in src/geo; this file only wires it to the screen.

import { buildNetwork } from '../geo/network.js';
import { normalizeProject, sampleProject, defaultRoad, defaultJunction, PATTERNS, CAMBER_MODES, CENTRE_MARKS, GUARD_SIDES, emptyProject } from '../model/project.js';
import { diamondExchange } from '../model/exchange.js';
import { exportProjectText, importProjectText, networkToObj } from '../io/exchange.js';
import { Plan2D } from '../render/plan2d.js';
import { PATTERN_LABELS } from '../render/paving.js';
import { icon } from './icons.js';

const TOOLS = [
  { id: 'select', label: 'Select', key: 'V', hint: 'Click to select. Drag a junction to move it, drag its ring to change the corner radius, drag the arrows to move along one axis. Double-click a road to add a control point.' },
  { id: 'junction', label: 'Junction', key: 'J', hint: 'Click to place a junction (one handle controls its whole joint).' },
  { id: 'road', label: 'Road', key: 'R', hint: 'Click a junction to start a road, click another to finish it. Click empty ground to add a junction and continue. Esc to stop.' },
  { id: 'area', label: 'Paving', key: 'A', hint: 'Click to add corners. Double-click or click the first corner to close. Esc to cancel.' },
  { id: 'exchange', label: 'Exchange', key: 'X', hint: 'Click to place a diamond exchange (bridged mainline, four ramps) with the settings in the Exchange card.' },
];

const ROAD_SECTIONS = [
  {
    title: 'Carriageway',
    rows: [
      { f: 'lanesL', label: 'Lanes left', type: 'int', min: 1, max: 4 },
      { f: 'lanesR', label: 'Lanes right', type: 'int', min: 1, max: 4 },
      { f: 'laneW', label: 'Lane width', unit: 'm', type: 'range', min: 2.5, max: 5, step: 0.05 },
      { f: 'camber', label: 'Camber', unit: '%', type: 'range', min: 0, max: 0.08, step: 0.001, scale: 100 },
      { f: 'camberMode', label: 'Fall', type: 'select', options: CAMBER_MODES.map((m) => [m, { crown: 'Crown', left: 'To left', right: 'To right' }[m]]) },
    ],
  },
  {
    title: 'Kerbs and footways',
    rows: [
      { f: 'gutter', label: 'Gutter', unit: 'm', type: 'range', min: 0, max: 1.2, step: 0.05 },
      { f: 'kerbH', label: 'Kerb height', unit: 'm', type: 'range', min: 0, max: 0.3, step: 0.01 },
      { f: 'kerbW', label: 'Kerb width', unit: 'm', type: 'range', min: 0, max: 0.5, step: 0.01 },
      { f: 'footway', label: 'Footway', unit: 'm', type: 'range', min: 0, max: 6, step: 0.1 },
      { f: 'verge', label: 'Verge', unit: 'm', type: 'range', min: 0, max: 8, step: 0.1 },
      { f: 'pattern', label: 'Paving pattern', type: 'select', options: PATTERNS.map((p) => [p, PATTERN_LABELS[p] || p]) },
      { f: 'colour', label: 'Paving colour', type: 'color' },
    ],
  },
  {
    title: 'Drainage and earthworks',
    rows: [
      { f: 'ditch', label: 'Verge ditch', type: 'bool' },
      { f: 'ditchDepth', label: 'Ditch depth', unit: 'm', type: 'range', min: 0, max: 1.5, step: 0.05 },
      { f: 'embankment', label: 'Fill slopes', type: 'bool' },
      { f: 'drain.gullies', label: 'Gullies', type: 'bool' },
      { f: 'drain.gullySpacing', label: 'Gully spacing', unit: 'm', type: 'range', min: 4, max: 100, step: 1 },
      { f: 'drain.pipes', label: 'Drain pipes', type: 'bool' },
      { f: 'drain.pipeDepth', label: 'Pipe depth', unit: 'm', type: 'range', min: 0.4, max: 3, step: 0.05 },
    ],
  },
  {
    title: 'Bridge',
    rows: [
      { f: 'bridge.on', label: 'Bridged (deck and piers)', type: 'bool' },
      { f: 'bridge.from', label: 'From station', unit: 'm', type: 'num', min: 0, step: 1 },
      { f: 'bridge.to', label: 'To station (blank = end)', unit: 'm', type: 'num', min: 0, step: 1, nullable: true },
      { f: 'bridge.depth', label: 'Deck depth', unit: 'm', type: 'range', min: 0.1, max: 3, step: 0.05 },
      { f: 'bridge.pierSpacing', label: 'Pier spacing', unit: 'm', type: 'range', min: 4, max: 80, step: 1 },
    ],
  },
  {
    title: 'Guardrail',
    rows: [
      { f: 'guard.on', label: 'Guardrail on', type: 'bool' },
      { f: 'guard.side', label: 'Side', type: 'select', options: GUARD_SIDES.map((s) => [s, { both: 'Both', left: 'Left', right: 'Right' }[s]]) },
      { f: 'guard.offset', label: 'Offset past footway', unit: 'm', type: 'range', min: 0, max: 3, step: 0.05 },
      { f: 'guard.postSpacing', label: 'Post spacing', unit: 'm', type: 'range', min: 1, max: 10, step: 0.1 },
    ],
  },
  {
    title: 'Road markings',
    rows: [
      { f: 'marks.centre', label: 'Centre line', type: 'select', options: CENTRE_MARKS.map((m) => [m, { solid: 'Solid', dashed: 'Dashed', none: 'None' }[m]]) },
      { f: 'marks.edges', label: 'Edge lines', type: 'bool' },
      { f: 'marks.lanes', label: 'Lane dividers', type: 'bool' },
    ],
  },
];

const AREA_SECTION = [
  { f: 'pattern', label: 'Paving pattern', type: 'select', options: PATTERNS.map((p) => [p, PATTERN_LABELS[p] || p]) },
  { f: 'colour', label: 'Paving colour', type: 'color' },
  { f: 'y', label: 'Height', unit: 'm', type: 'num', step: 0.05 },
];

const JUNCTION_SECTION = [
  { f: 'x', label: 'Position X', unit: 'm', type: 'num', step: 0.5 },
  { f: 'z', label: 'Position Z', unit: 'm', type: 'num', step: 0.5 },
  { f: 'y', label: 'Height', unit: 'm', type: 'num', step: 0.05 },
  { f: 'radius', label: 'Corner radius', unit: 'm', type: 'range', min: 0, max: 30, step: 0.5 },
];

const EX_SECTION = [
  { f: 'clearance', label: 'Deck clearance', unit: 'm', type: 'range', min: 4.5, max: 9, step: 0.1 },
  { f: 'grade', label: 'Approach grade', unit: '%', type: 'range', min: 0.03, max: 0.08, step: 0.005, scale: 100 },
  { f: 'deckHalf', label: 'Bridged half length', unit: 'm', type: 'range', min: 6, max: 30, step: 1 },
  { f: 'arm', label: 'Far arm length', unit: 'm', type: 'range', min: 20, max: 120, step: 5 },
  { f: 'angle', label: 'Rotation', unit: '°', type: 'range', min: -180, max: 180, step: 1 },
];

const state = {
  project: sampleProject(),
  net: null,
  sel: null,
  tool: 'select',
  pending: null,
  areaPts: [],
  ghost: null,
  hover: null,
  opts: { marks: true, guards: true, drain: true },
  view: 'split',
  history: [],
  future: [],
  exchange: { clearance: 5.5, grade: 0.05, deckHalf: 14, arm: 60, angle: 0 },
  drag: null,
  dragBefore: null,
  buildMs: 0,
  rebuildTimer: null,
  spaceDown: false,
  filter: '',
};

const $ = (id) => document.getElementById(id);
const els = {
  plan: $('plan'),
  planPane: $('planPane'),
  viewPane: $('viewPane'),
  viewports: $('viewports'),
  splitter: $('splitter'),
  tree: $('tree'),
  insp: $('inspector'),
  inspTitle: $('inspTitle'),
  inspStats: $('inspStats'),
  status: $('status'),
  toast: $('toast'),
  search: $('search'),
  sceneTitle: $('sceneTitle'),
  fileOpen: $('fileOpen'),
};

let plan = null;
let scene = null;

// ---------------------------------------------------------------- utilities

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

function toast(msg, isError = false) {
  els.toast.textContent = msg;
  els.toast.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (els.toast.className = 'toast'), 3200);
}

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

function findJ(p, id) {
  return p.junctions.find((j) => j.id === id);
}
function findR(p, id) {
  return p.roads.find((r) => r.id === id);
}
function findA(p, id) {
  return (p.areas || []).find((a) => a.id === id);
}

function nextId(prefix, list) {
  const used = new Set(list.map((x) => x.id));
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

// ---------------------------------------------------------------- edits and history

/** discrete edit: fn(draft) mutates a copy; undoable. Returns true when applied. */
function edit(label, fn) {
  const before = JSON.stringify(state.project);
  const draft = clone(state.project);
  const res = fn(draft);
  const { project, errors } = normalizeProject(draft);
  if (!project) {
    toast(`Not applied: ${errors[0]}`, true);
    return false;
  }
  state.history.push({ label, before });
  if (state.history.length > 200) state.history.shift();
  state.future = [];
  state.project = project;
  if (res && res.sel !== undefined) state.sel = res.sel;
  afterChange(true);
  return true;
}

/** live update during a drag: no history entry (beginDrag/endDrag wrap it) */
function liveEdit(fn) {
  const draft = clone(state.project);
  fn(draft);
  const { project } = normalizeProject(draft);
  if (project) state.project = project;
  scheduleRebuild();
}

function beginDrag() {
  state.dragBefore = JSON.stringify(state.project);
}

function endDrag(label) {
  if (state.dragBefore && state.dragBefore !== JSON.stringify(state.project)) {
    state.history.push({ label, before: state.dragBefore });
    if (state.history.length > 200) state.history.shift();
    state.future = [];
    afterChange(true);
  }
  state.dragBefore = null;
  state.drag = null;
  rebuild();
}

function undo() {
  const h = state.history.pop();
  if (!h) return toast('Nothing to undo');
  state.future.push({ label: h.label, before: JSON.stringify(state.project) });
  state.project = normalizeProject(JSON.parse(h.before)).project;
  afterChange(true);
  toast(`Undo: ${h.label}`);
}

function redo() {
  const h = state.future.pop();
  if (!h) return toast('Nothing to redo');
  state.history.push({ label: h.label, before: JSON.stringify(state.project) });
  state.project = normalizeProject(JSON.parse(h.before)).project;
  afterChange(true);
  toast(`Redo: ${h.label}`);
}

function afterChange(structural) {
  if (state.sel) {
    const p = state.project;
    const ok =
      (state.sel.kind === 'junction' && findJ(p, state.sel.id)) ||
      (state.sel.kind === 'road' && findR(p, state.sel.id)) ||
      (state.sel.kind === 'area' && findA(p, state.sel.id));
    if (!ok) state.sel = null;
  }
  rebuild();
  renderInspector(structural);
}

// ---------------------------------------------------------------- build and draw

function scheduleRebuild() {
  if (state.rebuildTimer) return;
  state.rebuildTimer = setTimeout(() => {
    state.rebuildTimer = null;
    rebuild();
  }, state.drag ? 90 : 0);
}

function rebuild() {
  clearTimeout(state.rebuildTimer);
  state.rebuildTimer = null;
  const t0 = performance.now();
  state.net = buildNetwork(state.project);
  state.buildMs = performance.now() - t0;
  if (scene) scene.setChunks(state.net.chunks);
  renderOutliner();
  renderStatus();
  syncGizmo();
  updateInspectorLive();
  draw();
}

function draw() {
  if (!plan) return;
  plan.draw({
    net: state.net,
    project: state.project,
    sel: state.sel,
    hover: state.hover,
    tool: state.tool,
    pending: state.pending,
    area: state.tool === 'area' ? state.areaPts : null,
    ghost: state.ghost,
    exGhost: state.tool === 'exchange' ? { extent: 160 } : null,
    opts: state.opts,
  });
}

function fitView() {
  const p = state.project;
  if (!p.junctions.length) return;
  const xs = p.junctions.map((j) => j.x);
  const zs = p.junctions.map((j) => j.z);
  plan.fitTo({ x0: Math.min(...xs) - 20, x1: Math.max(...xs) + 20, z0: Math.min(...zs) - 20, z1: Math.max(...zs) + 20 });
  draw();
  if (scene) {
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 60);
    scene.controls.target.set(cx, 0, cz);
    scene.camera.position.set(cx - span * 0.75, span * 0.85, cz + span * 1.0);
  }
}

// ---------------------------------------------------------------- outliner

function renderOutliner() {
  const p = state.project;
  const q = state.filter.trim().toLowerCase();
  const warnFor = (id) => {
    if (!state.net) return '';
    const hits = state.net.warnings.filter((w) => w.text && w.text.includes(id));
    if (hits.some((w) => w.level === 'error')) return 'error';
    if (hits.length) return 'warn';
    return '';
  };
  const row = (kind, id, name, meta) => {
    const sel = state.sel && state.sel.kind === kind && state.sel.id === id ? ' selected' : '';
    const w = warnFor(id);
    const label = name || id;
    if (q && !`${id} ${label}`.toLowerCase().includes(q)) return '';
    return `<div class="tree-row${sel}${w ? ' ' + w : ''}"><button class="object-button" data-kind="${kind}" data-id="${esc(id)}">${icon(kind === 'junction' ? 'junction' : kind === 'road' ? 'road' : 'area', 13)}<span>${esc(label)}</span><span class="meta">${esc(meta)}</span></button></div>`;
  };
  const js = p.junctions.map((j) => row('junction', j.id, j.name, `${j.x.toFixed(0)}, ${j.z.toFixed(0)}`)).join('');
  const rs = p.roads.map((r) => row('road', r.id, r.name, `${r.a} → ${r.b}${r.bridge.on ? ' · bridge' : ''}`)).join('');
  const as = (p.areas || []).map((a) => row('area', a.id, a.name, `${a.pts.length} pts`)).join('');
  els.tree.innerHTML = `
    <section class="group"><div class="group-label">Junctions<span class="group-count">${p.junctions.length}</span></div>${js || '<div class="empty">No junctions yet. Press J and click the plan.</div>'}</section>
    <section class="group"><div class="group-label">Roads<span class="group-count">${p.roads.length}</span></div>${rs || '<div class="empty">Press R and click two junctions.</div>'}</section>
    <section class="group"><div class="group-label">Paving areas<span class="group-count">${(p.areas || []).length}</span></div>${as || '<div class="empty">Press A to draw a plaza.</div>'}</section>`;
  els.sceneTitle.textContent = p.name;
}

// ---------------------------------------------------------------- status

function renderStatus() {
  const net = state.net;
  const w = net ? net.warnings : [];
  const nErr = w.filter((x) => x.level === 'error').length;
  const nWarn = w.filter((x) => x.level === 'warn').length;
  const tool = TOOLS.find((t) => t.id === state.tool);
  const st = net ? net.stats : { triangles: 0, roads: 0, junctions: 0 };
  els.status.innerHTML = `
    <span class="hint">${esc(tool ? tool.hint : '')}</span>
    <span class="spacer"></span>
    <span class="stat">${st.junctions} junctions · ${st.roads} roads · ${(st.triangles / 1000).toFixed(1)}k tris · ${state.buildMs.toFixed(0)} ms</span>
    ${nErr ? `<span class="err-count">${nErr} error${nErr > 1 ? 's' : ''}</span>` : ''}
    ${nWarn ? `<span class="warn-count">${nWarn} warning${nWarn > 1 ? 's' : ''}</span>` : ''}
    <span class="stat">${state.ghost ? `x ${state.ghost[0].toFixed(1)} · z ${state.ghost[1].toFixed(1)}` : ''}</span>`;
}

// ---------------------------------------------------------------- tools

function renderTools() {
  els.tools_el = $('tools');
  els.tools_el.innerHTML = TOOLS.map(
    (t) => `<button class="tool" data-tool="${t.id}" aria-pressed="${state.tool === t.id}" title="${t.label} (${t.key})">${icon(t.id === 'select' ? 'select' : t.id, 14)}<span>${t.label}</span><kbd>${t.key}</kbd></button>`,
  ).join('');
  $('btnUndo').innerHTML = icon('undo', 15);
  $('btnRedo').innerHTML = icon('redo', 15);
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  document.querySelectorAll('[data-opt]').forEach((b) => b.setAttribute('aria-pressed', String(!!state.opts[b.dataset.opt])));
  els.plan.className = state.tool === 'select' ? 'tool-select' : '';
}

function setTool(id) {
  state.tool = id;
  state.pending = null;
  state.areaPts = [];
  renderTools();
  renderStatus();
  renderInspector(true);
  draw();
}

function selectObject(kind, id, extra = {}) {
  state.sel = kind ? { kind, id, ...extra } : null;
  syncGizmo();
  renderOutliner();
  renderInspector(true);
  draw();
}

// ---------------------------------------------------------------- inspector

function fieldHTML(kind, id, spec, value) {
  const attrs = `data-kind="${kind}" data-id="${esc(id)}" data-f="${spec.f}"`;
  if (spec.type === 'bool') {
    return `<div class="field"><label>${esc(spec.label)}</label><button class="toggle${value ? ' on' : ''}" data-toggle="${kind}|${esc(id)}|${spec.f}" aria-pressed="${!!value}" aria-label="${esc(spec.label)}"><span></span></button></div>`;
  }
  if (spec.type === 'select') {
    const opts = spec.options.map(([v, l]) => `<option value="${v}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('');
    return `<div class="field"><label>${esc(spec.label)}</label><select class="txt" ${attrs}>${opts}</select></div>`;
  }
  if (spec.type === 'color') {
    return `<div class="field"><label>${esc(spec.label)}</label><input type="color" ${attrs} value="${value}"></div>`;
  }
  if (spec.type === 'range') {
    const shown = fmtRange(spec.scale ? value * spec.scale : value, spec.step);
    const pct = ((value - spec.min) / (spec.max - spec.min)) * 100;
    const unit = spec.unit ? `<span class="unit">${esc(spec.unit)}</span>` : '';
    const v = spec.scale ? value * spec.scale : value;
    return `<div class="field range-field"><label>${esc(spec.label)}</label><span class="num-out" data-out="${spec.f}" data-unit="${esc(spec.unit || '')}">${shown}${unit}</span>
      <input type="range" min="${spec.min * (spec.scale || 1)}" max="${spec.max * (spec.scale || 1)}" step="${spec.step * (spec.scale || 1)}" value="${v}" ${attrs} data-range="1" data-scale="${spec.scale || 1}" data-step="${spec.step}" style="--progress:${Math.max(0, Math.min(100, pct))}%"></div>`;
  }
  const v = value === null || value === undefined ? '' : value;
  const unit = spec.unit ? `<span class="unit">${esc(spec.unit)}</span>` : '';
  return `<div class="field"><label>${esc(spec.label)}${unit}</label><input class="num" type="number" ${spec.min !== undefined ? `min="${spec.min}"` : ''} ${spec.max !== undefined ? `max="${spec.max}"` : ''} step="${spec.step ?? 'any'}" value="${v}" placeholder="${spec.nullable ? 'end' : ''}" ${attrs} data-nullable="${spec.nullable ? 1 : 0}"></div>`;
}

function fmtRange(displayed, step) {
  return Number(displayed).toFixed(step < 0.1 ? 2 : 1);
}

function sectionHTML(title, rows, kind, id, obj) {
  return `<section class="card"><div class="card-heading"><span>${esc(title)}</span></div>${rows.map((r) => fieldHTML(kind, id, r, getPath(obj, r.f))).join('')}</section>`;
}

function warningsHTML() {
  const w = state.net ? state.net.warnings : [];
  const items = w.length
    ? w.map((x) => `<li class="${x.level}"><span class="dot ${x.level}"></span><span>${esc(x.text)}</span></li>`).join('')
    : '<li class="ok"><span class="dot ok"></span><span>No problems: every junction is watertight and every crossing is separated.</span></li>';
  return `<section class="card"><div class="card-heading"><span>Checks</span><small>${w.length} item${w.length === 1 ? '' : 's'}</small></div><ul class="warn-list">${items}</ul></section>`;
}

function renderInspector(structural = true) {
  if (!structural && state.inspKey === inspKey()) return updateInspectorLive();
  state.inspKey = inspKey();
  const p = state.project;
  const sel = state.sel;
  const parts = [];
  let title = 'Project';
  let stat = `${p.junctions.length} J · ${p.roads.length} R`;
  if (state.tool === 'exchange') {
    title = 'Exchange';
    parts.push(
      `<section class="card"><div class="card-heading"><span>Diamond exchange</span><small>click the plan to place</small></div>
        <p class="help">A bridged mainline crosses the cross road on a deck. Four 45° ramps connect the two. The result is ordinary junctions and roads, so every part can be edited afterwards.</p>
        ${EX_SECTION.map((r) => fieldHTML('exchange', 'ex', r, state.exchange[r.f] ?? 0)).join('')}
        <div class="btn-row"><button class="btn primary" data-act="place-exchange-centre">Place at view centre</button></div></section>`,
    );
  } else if (sel && sel.kind === 'junction' && findJ(p, sel.id)) {
    const j = findJ(p, sel.id);
    title = `Junction ${j.id}`;
    stat = `${j.x.toFixed(1)}, ${j.z.toFixed(1)} m`;
    const arms = p.roads.filter((r) => r.a === j.id || r.b === j.id);
    parts.push(
      `<section class="card"><div class="card-heading"><span>Joint</span><small>${arms.length} arm${arms.length === 1 ? '' : 's'}</small></div>
        <p class="help">One handle drives the whole joint: drag the disc to move it, the ring to change the corner radius, or the arrows to move along an axis.</p>
        ${JUNCTION_SECTION.map((r) => fieldHTML('junction', j.id, r, j[r.f])).join('')}
        <div class="btn-row"><button class="btn" data-act="road-from" data-id="${esc(j.id)}">Start road here</button><button class="btn danger" data-act="delete" data-kind="junction" data-id="${esc(j.id)}">Delete junction</button></div></section>`,
    );
  } else if (sel && sel.kind === 'road' && findR(p, sel.id)) {
    const r = findR(p, sel.id);
    title = `Road ${r.id}`;
    stat = `${r.a} → ${r.b}`;
    const len = state.net && state.net.curves.get(r.id) ? state.net.curves.get(r.id).length : 0;
    parts.push(
      `<section class="card"><div class="card-heading"><span>Alignment</span><small>${r.a} → ${r.b}</small></div>
        <div class="metric">${len.toFixed(0)}<small>m</small></div>
        <p class="help">Drag the squares on the plan to shape the road. Double-click the road to add a control point. Heights set on a control point (Y) lift the alignment there; blank is automatic.</p>
        <div class="field"><label>Control points</label><span class="small-pill">${r.ctrl.length}</span></div>
        <div class="btn-row"><button class="btn" data-act="add-ctrl" data-id="${esc(r.id)}">Add control point at middle</button><button class="btn" data-act="swap-ends" data-id="${esc(r.id)}">Swap ends</button><button class="btn danger" data-act="delete" data-kind="road" data-id="${esc(r.id)}">Delete road</button></div></section>`,
    );
    parts.push(...ROAD_SECTIONS.map((s) => sectionHTML(s.title, s.rows, 'road', r.id, r)));
  } else if (sel && sel.kind === 'area' && findA(p, sel.id)) {
    const a = findA(p, sel.id);
    title = `Paving ${a.id}`;
    stat = `${a.pts.length} corners`;
    parts.push(
      `<section class="card"><div class="card-heading"><span>Paving area</span><small>${esc(a.name)}</small></div>
        <p class="help">Drag its corners on the plan. Patterns are the same tiles used on footways.</p>
        ${AREA_SECTION.map((r) => fieldHTML('area', a.id, r, a[r.f])).join('')}
        <div class="btn-row"><button class="btn danger" data-act="delete" data-kind="area" data-id="${esc(a.id)}">Delete area</button></div></section>`,
    );
  } else {
    parts.push(
      `<section class="card"><div class="card-heading"><span>Project</span></div>
        <div class="field"><label>Name</label><input class="txt" data-kind="project" data-id="project" data-f="name" value="${esc(p.name)}"></div>
        <div class="metric">${p.roads.length}<small>roads</small></div>
        <p class="help">Select a junction, road or paving area to edit it. Tools: <kbd>V</kbd> select, <kbd>J</kbd> junction, <kbd>R</kbd> road, <kbd>A</kbd> paving, <kbd>X</kbd> exchange. <kbd>Ctrl Z</kbd> undo, <kbd>Del</kbd> delete, <kbd>F</kbd> frame.</p>
        <div class="btn-row"><button class="btn" data-act="open">Open JSON</button><button class="btn" data-act="save">Save JSON</button><button class="btn primary" data-act="obj">Export OBJ + MTL</button></div></section>`,
    );
  }
  parts.push(`<div id="warnCard">${warningsHTML()}</div>`);
  parts.push(`<p class="inspector-footer">Schema ${p.version} · ${state.net ? state.net.stats.triangles : 0} triangles · ${state.buildMs.toFixed(0)} ms build</p>`);
  els.inspTitle.innerHTML = `<span>${esc(title)}</span>`;
  els.inspStats.innerHTML = `<span class="small-pill">${esc(stat)}</span>`;
  els.insp.innerHTML = `<div class="cards">${parts.join('')}</div>`;
  for (const range of els.insp.querySelectorAll('input[type=range]')) {
    range.style.setProperty('--progress', `${((range.value - range.min) / (range.max - range.min)) * 100}%`);
  }
}

function inspKey() {
  return `${state.tool}|${state.sel ? state.sel.kind + state.sel.id : ''}`;
}

/** refresh numbers and warnings without rebuilding the inputs (keeps focus while dragging) */
function updateInspectorLive() {
  const wc = $('warnCard');
  if (wc) wc.innerHTML = warningsHTML();
  for (const el of els.insp.querySelectorAll('input[data-f], select[data-f]')) {
    if (document.activeElement === el) continue;
    const kind = el.dataset.kind;
    const id = el.dataset.id;
    const obj = kind === 'junction' ? findJ(state.project, id) : kind === 'road' ? findR(state.project, id) : kind === 'area' ? findA(state.project, id) : null;
    if (!obj) continue;
    const v = getPath(obj, el.dataset.f);
    if (el.type === 'color' || el.tagName === 'SELECT') el.value = v;
    else if (el.type === 'range') el.value = (v ?? 0) * (Number(el.dataset.scale) || 1);
    else if (el.type === 'number') el.value = v === null || v === undefined ? '' : v;
  }
}

function handleFieldInput(el, commit) {
  const kind = el.dataset.kind;
  const id = el.dataset.id;
  const f = el.dataset.f;
  let value;
  if (el.type === 'checkbox') value = el.checked;
  else if (el.type === 'range') value = Number(el.value) / (Number(el.dataset.scale) || 1);
  else if (el.type === 'number') {
    if (el.value === '' && el.dataset.nullable === '1') value = null;
    else value = Number(el.value);
    if (value !== null && !Number.isFinite(value)) return;
  } else value = el.value;
  if (kind === 'exchange') {
    state.exchange[f] = value;
    if (commit) renderInspector(true);
    return;
  }
  if (kind === 'project') {
    if (commit) edit('rename project', (d) => { d.name = value; });
    return;
  }
  const apply = (d) => {
    if (kind === 'junction') {
      const j = findJ(d, id);
      if (j) setPath(j, f, value);
    } else if (kind === 'road') {
      const r = findR(d, id);
      if (r) {
        let v = value;
        if (f === 'camber') v = value; // slider already in fraction
        setPath(r, f, v);
      }
    } else if (kind === 'area') {
      const a = findA(d, id);
      if (a) setPath(a, f, value);
    }
  };
  if (commit) edit(`${kind} ${f}`, (d) => apply(d));
  else liveEdit((d) => apply(d));
  if (commit) renderInspector(true);
}

function onInspectorChange(e) {
  const el = e.target;
  if (!el.dataset || !el.dataset.f && !el.dataset.kind) return;
  if (el.dataset.f === undefined) return;
  const commit = e.type === 'change';
  if (el.type === 'range' && e.type === 'input') {
    const out = els.insp.querySelector(`[data-out="${el.dataset.f}"]`);
    if (out) out.innerHTML = `${fmtRange(el.value, Number(el.dataset.step))}${out.dataset.unit ? `<span class="unit">${esc(out.dataset.unit)}</span>` : ''}`;
    el.style.setProperty('--progress', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
    handleFieldInput(el, false);
    return;
  }
  if (commit) handleFieldInput(el, true);
}

function onInspectorClick(e) {
  const t = e.target.closest('[data-toggle],[data-act]');
  if (!t) return;
  if (t.dataset.toggle) {
    const [kind, id, f] = t.dataset.toggle.split('|');
    const obj = kind === 'junction' ? findJ(state.project, id) : kind === 'road' ? findR(state.project, id) : findA(state.project, id);
    const cur = !!getPath(obj, f);
    edit(`${f}`, (d) => {
      const o = kind === 'junction' ? findJ(d, id) : kind === 'road' ? findR(d, id) : findA(d, id);
      setPath(o, f, !cur);
    });
    return;
  }
  const act = t.dataset.act;
  const id = t.dataset.id;
  if (act === 'place-exchange-centre') {
    const [x, z] = plan.s2w(plan.w / 2, plan.h / 2);
    placeExchange(x, z);
  } else if (act === 'road-from') {
    setTool('road');
    state.pending = id;
    draw();
  } else if (act === 'add-ctrl') {
    edit('add control point', (d) => {
      const r = findR(d, id);
      const j1 = findJ(d, r.a);
      const j2 = findJ(d, r.b);
      const mx = (j1.x + j2.x) / 2 + 4;
      const mz = (j1.z + j2.z) / 2 + 4;
      r.ctrl.splice(Math.floor(r.ctrl.length / 2), 0, { x: mx, z: mz, y: null });
    });
  } else if (act === 'swap-ends') {
    edit('swap road ends', (d) => {
      const r = findR(d, id);
      [r.a, r.b] = [r.b, r.a];
      r.ctrl.reverse();
    });
  } else if (act === 'delete') {
    deleteObject(t.dataset.kind, id);
  } else if (act === 'open') {
    els.fileOpen.click();
  } else if (act === 'save') {
    saveJSON();
  } else if (act === 'obj') {
    exportOBJ();
  }
}

// ---------------------------------------------------------------- object operations

function addJunctionAt(x, z) {
  let id = '';
  edit('add junction', (d) => {
    id = nextId('J', d.junctions);
    d.junctions.push(defaultJunction(id, round(x), round(z)));
    return { sel: { kind: 'junction', id } };
  });
  return id;
}

function round(v) {
  return Math.round(v * 100) / 100;
}

function addRoad(a, b) {
  if (a === b) return false;
  let id = '';
  edit('add road', (d) => {
    id = nextId('R', d.roads);
    d.roads.push(defaultRoad(id, a, b));
    return { sel: { kind: 'road', id } };
  });
  return !!id;
}

function deleteObject(kind, id) {
  edit(`delete ${kind}`, (d) => {
    if (kind === 'junction') {
      d.roads = d.roads.filter((r) => r.a !== id && r.b !== id);
      d.junctions = d.junctions.filter((j) => j.id !== id);
    } else if (kind === 'road') {
      d.roads = d.roads.filter((r) => r.id !== id);
    } else if (kind === 'area') {
      d.areas = d.areas.filter((a) => a.id !== id);
    }
    return { sel: null };
  });
  state.sel = null;
  renderInspector(true);
}

function placeExchange(x, z) {
  const ex = state.exchange;
  let prefix = 'X1';
  edit('add exchange', (d) => {
    let n = 1;
    while (d.roads.some((r) => r.id.startsWith(`X${n}-`))) n++;
    prefix = `X${n}`;
    const out = diamondExchange({ ...ex, prefix, x, z });
    d.junctions.push(...out.junctions);
    d.roads.push(...out.roads);
    return { sel: { kind: 'road', id: `${prefix}-M2` } };
  });
  toast(`Exchange ${prefix} placed`);
}

// ---------------------------------------------------------------- pointer input (plan)

function worldOf(e) {
  const r = els.plan.getBoundingClientRect();
  return plan.s2w(e.clientX - r.left, e.clientY - r.top);
}

function screenOf(e) {
  const r = els.plan.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function onPlanDown(e) {
  if (e.button === 1 || (e.button === 0 && state.spaceDown)) {
    state.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: plan.view.cx, cz: plan.view.cz };
    els.plan.setPointerCapture(e.pointerId);
    els.plan.classList.add('dragging');
    return;
  }
  if (e.button !== 0) return;
  const [sx, sy] = screenOf(e);
  const [wx, wz] = worldOf(e);
  const hit = plan.hit(sx, sy, { project: state.project, sel: state.sel, net: state.net });
  const tool = state.tool;
  if (tool === 'select') {
    if (hit && hit.kind === 'junction' && (hit.part === 'body' || hit.part === 'move-x' || hit.part === 'move-z')) {
      selectObject('junction', hit.id);
      const j = findJ(state.project, hit.id);
      state.drag = { kind: 'move', id: hit.id, ox: j.x - wx, oz: j.z - wz, axis: hit.part === 'move-x' ? 'x' : hit.part === 'move-z' ? 'z' : null, sx, sy, moved: false };
      beginDrag();
      els.plan.setPointerCapture(e.pointerId);
    } else if (hit && hit.kind === 'junction' && hit.part === 'radius') {
      selectObject('junction', hit.id);
      state.drag = { kind: 'radius', id: hit.id, moved: false };
      beginDrag();
      els.plan.setPointerCapture(e.pointerId);
    } else if (hit && hit.kind === 'ctrl') {
      selectObject('road', hit.id);
      state.drag = { kind: 'ctrl', id: hit.id, index: hit.index, moved: false };
      beginDrag();
      els.plan.setPointerCapture(e.pointerId);
    } else if (hit && hit.kind === 'area-vertex') {
      selectObject('area', hit.id);
      state.drag = { kind: 'area-vertex', id: hit.id, index: hit.index, moved: false };
      beginDrag();
      els.plan.setPointerCapture(e.pointerId);
    } else if (hit && hit.kind === 'road') {
      selectObject('road', hit.id);
    } else if (hit && hit.kind === 'area') {
      selectObject('area', hit.id);
    } else {
      selectObject(null);
      state.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: plan.view.cx, cz: plan.view.cz };
      els.plan.setPointerCapture(e.pointerId);
      els.plan.classList.add('dragging');
    }
    return;
  }
  if (tool === 'junction') {
    if (hit && hit.kind === 'junction') selectObject('junction', hit.id);
    else addJunctionAt(wx, wz);
    return;
  }
  if (tool === 'road') {
    let target = hit && hit.kind === 'junction' ? hit.id : null;
    if (!target) {
      target = addJunctionAt(wx, wz);
    }
    if (state.pending && state.pending !== target) {
      addRoad(state.pending, target);
    }
    state.pending = target;
    draw();
    return;
  }
  if (tool === 'area') {
    if (state.areaPts.length >= 3) {
      const [fx, fy] = plan.w2s(state.areaPts[0][0], state.areaPts[0][1]);
      if (Math.hypot(fx - sx, fy - sy) < 9) return finishArea();
    }
    // a click on the last corner (the first click of a double-click) adds nothing; dblclick finishes
    const last = state.areaPts[state.areaPts.length - 1];
    if (last && Math.hypot(last[0] - wx, last[1] - wz) < 0.2) return;
    state.areaPts.push([round(wx), round(wz)]);
    draw();
    return;
  }
  if (tool === 'exchange') {
    placeExchange(wx, wz);
    return;
  }
}

function onPlanMove(e) {
  const [sx, sy] = screenOf(e);
  const [wx, wz] = worldOf(e);
  state.ghost = [wx, wz];
  const d = state.drag;
  if (d && d.kind === 'pan') {
    plan.view.cx = d.cx - (e.clientX - d.sx) / plan.view.s;
    plan.view.cz = d.cz - (e.clientY - d.sy) / plan.view.s;
    draw();
    renderStatus();
    return;
  }
  if (d && d.kind === 'move') {
    d.moved = true;
    liveEdit((p) => {
      const j = findJ(p, d.id);
      if (!j) return;
      let nx = wx + d.ox;
      let nz = wz + d.oz;
      if (d.axis === 'x') nz = findJ(state.project, d.id).z;
      if (d.axis === 'z') nx = findJ(state.project, d.id).x;
      j.x = round(nx);
      j.z = round(nz);
    });
    syncInspectorNumbers();
  } else if (d && d.kind === 'radius') {
    d.moved = true;
    liveEdit((p) => {
      const j = findJ(p, d.id);
      if (!j) return;
      j.radius = round(Math.max(0, Math.min(30, Math.hypot(wx - j.x, wz - j.z))));
    });
    syncInspectorNumbers();
  } else if (d && d.kind === 'ctrl') {
    d.moved = true;
    liveEdit((p) => {
      const r = findR(p, d.id);
      if (r && r.ctrl[d.index]) {
        r.ctrl[d.index].x = round(wx);
        r.ctrl[d.index].z = round(wz);
      }
    });
  } else if (d && d.kind === 'area-vertex') {
    d.moved = true;
    liveEdit((p) => {
      const a = findA(p, d.id);
      if (a) a.pts[d.index] = [round(wx), round(wz)];
    });
  } else {
    // hover feedback
    const hit = plan.hit(sx, sy, { project: state.project, sel: state.sel, net: state.net });
    state.hover = hit && hit.kind === 'junction' ? { kind: 'junction', id: hit.id } : null;
    if (state.tool === 'road' && state.pending) draw();
    if (state.tool === 'area' && state.areaPts.length) draw();
    if (state.tool === 'exchange') draw();
    els.plan.style.cursor = hit ? (hit.part === 'radius' ? 'ew-resize' : hit.part === 'move-x' ? 'ew-resize' : hit.part === 'move-z' ? 'ns-resize' : 'pointer') : state.tool === 'select' ? 'default' : 'crosshair';
    if (!hit && state.tool === 'select') els.plan.style.cursor = 'default';
    draw();
    renderStatus();
    return;
  }
  draw();
  renderStatus();
}

function onPlanUp(e) {
  const d = state.drag;
  if (d && d.kind === 'pan') {
    state.drag = null;
    els.plan.classList.remove('dragging');
    return;
  }
  if (d && (d.kind === 'move' || d.kind === 'radius' || d.kind === 'ctrl' || d.kind === 'area-vertex')) {
    const labels = { move: 'move junction', radius: 'corner radius', ctrl: 'move control point', 'area-vertex': 'move paving corner' };
    endDrag(labels[d.kind]);
    renderInspector(true);
  }
  void e;
}

function onPlanDbl(e) {
  if (state.tool === 'area') return finishArea();
  if (state.tool !== 'select') return;
  const [sx, sy] = screenOf(e);
  const hit = plan.hit(sx, sy, { project: state.project, sel: state.sel, net: state.net });
  if (hit && hit.kind === 'road') {
    const [wx, wz] = worldOf(e);
    edit('add control point', (d) => {
      const r = findR(d, hit.id);
      const j1 = findJ(d, r.a);
      const j2 = findJ(d, r.b);
      const pts = [[j1.x, j1.z], ...r.ctrl.map((c) => [c.x, c.z]), [j2.x, j2.z]];
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wz - az) * dz) / l2));
        const dd = Math.hypot(ax + dx * t - wx, az + dz * t - wz);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      r.ctrl.splice(best, 0, { x: round(wx), z: round(wz), y: null });
      return { sel: { kind: 'road', id: r.id } };
    });
  }
}

function finishArea() {
  if (state.areaPts.length < 3) {
    state.areaPts = [];
    draw();
    return toast('A paving area needs three corners', true);
  }
  let id = '';
  const pts = state.areaPts.slice();
  edit('add paving area', (d) => {
    id = nextId('A', d.areas || []);
    d.areas = d.areas || [];
    d.areas.push({ id, name: `Paving ${id}`, pts, y: 0, pattern: 'herringbone', colour: '#b8a890' });
    return { sel: { kind: 'area', id } };
  });
  state.areaPts = [];
  setTool('select');
  selectObject('area', id);
}

function onPlanWheel(e) {
  e.preventDefault();
  const [sx, sy] = screenOf(e);
  const [wx, wz] = plan.s2w(sx, sy);
  const k = Math.exp(-e.deltaY * 0.0015);
  plan.view.s = Math.max(0.4, Math.min(60, plan.view.s * k));
  const [nx, nz] = plan.s2w(sx, sy);
  plan.view.cx += wx - nx;
  plan.view.cz += wz - nz;
  draw();
  renderStatus();
}

function syncInspectorNumbers() {
  for (const el of els.insp.querySelectorAll('input[data-f]')) {
    if (document.activeElement === el) continue;
    const obj = el.dataset.kind === 'junction' ? findJ(state.project, el.dataset.id) : null;
    if (!obj) continue;
    const v = getPath(obj, el.dataset.f);
    if (v !== undefined && el.type !== 'range') el.value = v;
    if (el.type === 'range') el.value = v;
  }
  const wc = $('warnCard');
  if (wc) wc.innerHTML = warningsHTML();
}

// ---------------------------------------------------------------- 3D gizmo

function syncGizmo() {
  if (!scene) return;
  const sel = state.sel;
  if (sel && sel.kind === 'junction') {
    const j = findJ(state.project, sel.id);
    if (!j) return scene.clearGizmo();
    scene.setGizmo(
      { x: j.x, y: j.y ?? 0, z: j.z },
      (pos) => {
        const id = state.sel && state.sel.id;
        liveEdit((p) => {
          const jj = findJ(p, id);
          if (jj) {
            jj.x = round(pos.x);
            jj.y = round(pos.y);
            jj.z = round(pos.z);
          }
        });
        syncInspectorNumbers();
      },
      (dragging) => {
        if (dragging) beginDrag();
        else endDrag('move junction (3D)');
        renderInspector(true);
      },
    );
  } else {
    scene.clearGizmo();
  }
}

// ---------------------------------------------------------------- files

function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

function safeName(s) {
  return String(s).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'road-network';
}

function saveJSON() {
  download(`${safeName(state.project.name)}.road.json`, exportProjectText(state.project));
  toast('Project saved as JSON');
}

function exportOBJ() {
  if (!state.net) return;
  const name = safeName(state.project.name);
  const { obj, mtl, vertices } = networkToObj(state.net.chunks, name);
  download(`${name}.obj`, obj, 'text/plain');
  setTimeout(() => download(`${name}.mtl`, mtl, 'text/plain'), 150);
  toast(`Exported ${name}.obj (${vertices} vertices)`);
}

function loadProject(project, label) {
  state.project = project;
  state.sel = null;
  state.history = [];
  state.future = [];
  state.pending = null;
  rebuild();
  renderInspector(true);
  fitView();
  toast(label);
}

function onFileChosen(e) {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const { project, errors } = importProjectText(String(reader.result));
    if (!project) {
      console.warn('Import failed:', errors);
      toast(`Import failed: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more)` : ''}`, true);
      return;
    }
    const before = JSON.stringify(state.project);
    state.history.push({ label: 'import', before });
    loadProject(project, `Loaded ${f.name}: ${project.junctions.length} junctions, ${project.roads.length} roads`);
  };
  reader.onerror = () => toast('Could not read that file', true);
  reader.readAsText(f);
}

// ---------------------------------------------------------------- keyboard

function onKey(e) {
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|SELECT|TEXTAREA/.test(tag) && e.target.type !== 'range') return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
    e.preventDefault();
    return undo();
  }
  if (((e.ctrlKey || e.metaKey) && k === 'z' && e.shiftKey) || ((e.ctrlKey || e.metaKey) && k === 'y')) {
    e.preventDefault();
    return redo();
  }
  if (k === ' ') {
    state.spaceDown = true;
    if (e.type === 'keydown') e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === 'escape') {
    state.pending = null;
    state.areaPts = [];
    if (state.tool !== 'select') setTool('select');
    else selectObject(null);
    return;
  }
  if (k === 'delete' || k === 'backspace') {
    if (!state.sel) return;
    if (state.sel.kind === 'road' && state.hover) return;
    e.preventDefault();
    return deleteObject(state.sel.kind, state.sel.id);
  }
  if (k === 'enter' && state.tool === 'area') return finishArea();
  if (k === 'f') return fitView();
  const map = { v: 'select', j: 'junction', r: 'road', a: 'area', x: 'exchange' };
  if (map[k] && e.type === 'keydown') return setTool(map[k]);
}

// ---------------------------------------------------------------- layout

function setSplit(px) {
  const total = els.viewports.clientWidth - 6;
  const clamped = Math.max(180, Math.min(total - 180, px));
  els.viewports.style.setProperty('--split', `${clamped}px`);
  localStorage.setItem('frontier-split', String(clamped));
  resizeAll();
}

function setView(v) {
  state.view = v;
  els.viewports.classList.toggle('plan-only', v === 'plan');
  els.viewports.classList.toggle('view-only', v === '3d');
  if (v === 'split') {
    const saved = Number(localStorage.getItem('frontier-split')) || els.viewports.clientWidth / 2;
    els.viewports.style.setProperty('--split', `${saved}px`);
  }
  renderTools();
  setTimeout(resizeAll, 0);
}

function resizeAll() {
  if (plan) {
    plan.resize();
    draw();
  }
  if (scene) scene.resize();
}

function initSplitter() {
  let dragging = false;
  els.splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    els.splitter.setPointerCapture(e.pointerId);
  });
  els.splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const r = els.viewports.getBoundingClientRect();
    setSplit(e.clientX - r.left);
  });
  els.splitter.addEventListener('pointerup', () => (dragging = false));
}

// ---------------------------------------------------------------- init

export async function init({ Scene3D }) {
  plan = new Plan2D(els.plan);
  renderTools();
  scene = new Scene3D($('view3d'));
  scene.onPick = null;
  // 3D picking on click (no drag)
  let down = null;
  $('view3d').addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
  $('view3d').addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    const owner = scene.pickAt(e.clientX, e.clientY);
    if (!owner) return;
    if (owner.startsWith('J:')) selectObject('junction', owner.slice(2));
    else if (owner.startsWith('R:')) selectObject('road', owner.slice(2));
    else if (owner.startsWith('A:')) selectObject('area', owner.slice(2));
  });

  els.plan.addEventListener('pointerdown', onPlanDown);
  els.plan.addEventListener('pointermove', onPlanMove);
  els.plan.addEventListener('pointerup', onPlanUp);
  els.plan.addEventListener('pointercancel', onPlanUp);
  els.plan.addEventListener('dblclick', onPlanDbl);
  els.plan.addEventListener('wheel', onPlanWheel, { passive: false });
  els.plan.addEventListener('pointerleave', () => {
    state.ghost = null;
    draw();
  });
  els.tools_el = $('tools');
  els.tools_el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-opt]').forEach((b) =>
    b.addEventListener('click', () => {
      state.opts[b.dataset.opt] = !state.opts[b.dataset.opt];
      renderTools();
      draw();
    }),
  );
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);
  $('btnNewJunction').addEventListener('click', () => setTool('junction'));
  $('btnSample').addEventListener('click', () => loadProject(sampleProject(), 'Sample loaded'));
  $('btnNewProject').addEventListener('click', () => loadProject(emptyProject('Untitled road network'), 'New project'));
  $('btnOpen').addEventListener('click', () => els.fileOpen.click());
  $('btnSave').addEventListener('click', saveJSON);
  $('btnObj').addEventListener('click', exportOBJ);
  els.fileOpen.addEventListener('change', onFileChosen);
  els.search.addEventListener('input', () => {
    state.filter = els.search.value;
    renderOutliner();
  });
  els.tree.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (b && b.dataset.id) selectObject(b.dataset.kind, b.dataset.id);
  });
  els.insp.addEventListener('input', onInspectorChange);
  els.insp.addEventListener('change', onInspectorChange);
  els.insp.addEventListener('click', onInspectorClick);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') state.spaceDown = false;
  });
  window.addEventListener('resize', resizeAll);
  if (window.ResizeObserver) new ResizeObserver(resizeAll).observe(els.viewports);
  initSplitter();
  const savedSplit = Number(localStorage.getItem('frontier-split'));
  if (savedSplit) els.viewports.style.setProperty('--split', `${savedSplit}px`);
  else els.viewports.style.setProperty('--split', '50%');
  // initial state
  resizeAll();
  rebuild();
  renderInspector(true);
  fitView();
  // expose a small hook for automated checks (browser tests)
  window.frontier = {
    get state() {
      return state;
    },
    edit,
    rebuild,
    fitView,
    setTool,
    selectObject,
    addJunctionAt,
    addRoad,
    placeExchange,
    finishArea,
    loadProject,
    scene: () => scene,
    plan: () => plan,
    exportText: () => exportProjectText(state.project),
    importText: (t) => importProjectText(t),
  };
  void defaultRoad;
  void TOOLS;
}
