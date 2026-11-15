// Fracture Editor — UI only.  Per-object fracture recipes (material, break energy, seed, piece ceiling, minimum size,
// impact point), storage mode (Dynamic / Baked + per-piece SDF) and bake freshness, over a schematic section preview.
// Recipes persist in the Project Zero format (`Frontier.Fracture.v2:<objectId>` → {Owner, Settings}) and sync live
// with any other window through `storage` events.  `?object=<id>` opens a given object, as the old launcher did.
import * as F from './FractureModel.js';
import { icon } from './Icons.js';

// ------------------------------------------------------------------ tiny DOM kit
const $ = (id) => document.getElementById(id);
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}
const ico = (name, size = 16, cls = '') => el('span', { class: `ico ${cls}`.trim(), html: icon(name, size) });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastTimer = 0;
function toast(text) { const t = $('Toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000); }
function hydrateIcons(root = document) {
  for (const n of root.querySelectorAll('[data-icon]')) { if (n.dataset.iconDone) continue; n.dataset.iconDone = '1'; n.insertAdjacentHTML('afterbegin', icon(n.dataset.icon, +(n.dataset.iconSize || 16))); }
}

// ------------------------------------------------------------------ colour
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const RAMP = ['#306bf2', '#29c7c2', '#59d15c', '#f7cc40', '#f04d3d'].map(hex);
function ramp(t) { t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1); const i = Math.min(RAMP.length - 2, Math.floor(t)); return mix(RAMP[i], RAMP[i + 1], t - i); }
const AMBER = hex('#ffb238');

// ------------------------------------------------------------------ scene (demo objects standing in for the level)
const SCENE = [
  { subject: { Id: 'lobby-pillar', Name: 'Lobby pillar', Icon: 'editor-cylinder' }, values: { Location: [4, 1.6, -2], Scale: [0.8, 3.2, 0.8] }, seed: { Enabled: true, Mode: 'baked', Material: 'concrete', Energy: 6000, Seed: 1187, Ceiling: 64, Y: 0.6, bake: true } },
  { subject: { Id: 'supply-crate', Name: 'Supply crate', Icon: 'editor-cube' }, values: { Location: [1.5, 0.5, 3], Scale: [1, 1, 1] }, seed: { Enabled: true, Material: 'wood', Energy: 3200, Seed: 77, X: 0.18, Y: 0.1 } },
  { subject: { Id: 'window-pane', Name: 'Window pane', Icon: 'editor-cube' }, values: { Location: [0, 1.4, -4], Scale: [1.6, 1.1, 0.02] }, seed: { Enabled: true, Material: 'glass', Energy: 900, Seed: 4021, Ceiling: 90, MinimumSize: 0.02, X: -0.32, Y: 0.14 } },
  { subject: { Id: 'boulder', Name: 'Boulder', Icon: 'editor-sphere' }, values: { Location: [-6, 0.9, 5], Scale: [2.4, 1.8, 2.1] }, seed: { Enabled: true, Mode: 'baked', Material: 'rock', Energy: 14000, Seed: 9, Ceiling: 40, X: 0.5, Y: 0.4, staleFrom: { Energy: 8000 } } },
  { subject: { Id: 'shower-door', Name: 'Shower door', Icon: 'editor-cube' }, values: { Location: [-2, 0.95, -6], Scale: [0.9, 1.9, 0.01] }, seed: { Enabled: true, Mode: 'baked', Material: 'tempered', Energy: 1200, Seed: 310, Ceiling: 120, MinimumSize: 0.02, PieceSdf: true, SdfResolution: 32, bake: true } },
  { subject: { Id: 'traffic-cone', Name: 'Traffic cone', Icon: 'editor-cone' }, values: { Location: [3, 0.35, 6], Scale: [0.4, 0.7, 0.4] }, seed: { Material: 'plastic', Energy: 600 } },
  { subject: { Id: 'ring-gate', Name: 'Ring gate', Icon: 'editor-torus' }, values: { Location: [0, 1.5, 9], Scale: [3, 3, 0.5] }, seed: {} },
  { subject: { Id: 'statue', Name: 'Statue', Icon: 'editor-mesh' }, values: { Location: [-3, 1.1, 1], Scale: [1, 2.2, 1] }, seed: {} },
];
const PRIM_ICON = { cube: 'cube', sphere: 'sphere', cylinder: 'cylinder', cone: 'cone', torus: 'torus' };
const primIcon = (p) => PRIM_ICON[p] || 'mesh';
const STATE_LABEL = { off: 'Off', dynamic: 'Live', unbaked: 'Unbaked', stale: 'Stale', 'sdf-pending': 'SDF pending', ready: 'Baked' };
const STATE_ICON = { off: 'off', dynamic: 'bolt', unbaked: 'clock', stale: 'alert', 'sdf-pending': 'sdf', ready: 'check' };
const needsBake = (st) => st === 'stale' || st === 'unbaked' || st === 'sdf-pending';

// ------------------------------------------------------------------ state
const store = window.localStorage;
const objects = SCENE.map((o) => ({ ...o, owner: F.describe(o.subject, o.values) }));
const byId = new Map(objects.map((o) => [o.owner.Id, o]));
const settings = new Map();
const history = new Map();
const state = { selected: objects[0].owner.Id, view: 'editor', shade: 'material', explode: 0, filter: 'all', search: '', baking: null, dragBase: null };

function bakedRecord(owner, s, pieces) {
  return { Signature: F.signature(owner, s), Pieces: pieces, At: Date.now() - 1000 * 60 * 42, Sdf: null };
}
for (const o of objects) {
  const stored = F.readStored(store, o.owner.Id);
  let s;
  if (stored) s = F.normalize(stored.Settings);
  else {
    const { bake, staleFrom, ...seed } = o.seed;
    s = F.normalize(seed);
    if (bake) s.Baked = bakedRecord(o.owner, s, F.pieceBudget(o.owner, s).pieces);
    if (staleFrom) { const then = F.normalize({ ...s, ...staleFrom }); s.Baked = bakedRecord(o.owner, then, F.pieceBudget(o.owner, then).pieces); }
    F.writeStored(store, o.owner, s);
  }
  settings.set(o.owner.Id, s);
  history.set(o.owner.Id, { undo: [], redo: [] });
}
const wanted = new URLSearchParams(location.search).get('object');
if (wanted && byId.has(wanted)) state.selected = wanted;

const current = () => byId.get(state.selected);
const cur = () => settings.get(state.selected);

// ------------------------------------------------------------------ edits
function persist(id) { F.writeStored(store, byId.get(id).owner, settings.get(id)); }

// Live edit (slider drag, impact drag): updates preview, no history entry yet.
function preview(patch) {
  if (!state.dragBase) state.dragBase = JSON.stringify(cur());
  settings.set(state.selected, F.normalize({ ...cur(), ...patch }));
  refresh({ light: true });
}

function commit(patch, id = state.selected) {
  const before = id === state.selected && state.dragBase ? state.dragBase : JSON.stringify(settings.get(id));
  state.dragBase = null;
  const next = F.normalize({ ...settings.get(id), ...patch, EditedAt: Date.now() });
  if (patch.Baked === undefined && 'Baked' in patch) delete next.Baked;
  const strip = (v) => { const { EditedAt, ...rest } = F.normalize(v); void EditedAt; return JSON.stringify(rest); };
  settings.set(id, next);
  if (strip(next) !== strip(JSON.parse(before))) {
    const h = history.get(id);
    h.undo.push(before); if (h.undo.length > 100) h.undo.shift();
    h.redo.length = 0;
  }
  persist(id);
  refresh();
}

function undoRedo(dir) {
  const h = history.get(state.selected), from = dir < 0 ? h.undo : h.redo, to = dir < 0 ? h.redo : h.undo;
  if (!from.length) return;
  to.push(JSON.stringify(cur()));
  settings.set(state.selected, F.normalize({ ...JSON.parse(from.pop()), EditedAt: Date.now() }));
  persist(state.selected);
  toast(dir < 0 ? 'Undo' : 'Redo');
  rebuildRecipe();
  refresh();
}

function select(id) {
  if (!byId.has(id) || id === state.selected) return;
  state.selected = id; state.dragBase = null; state.explode = 0; $('Explode').value = 0; paintRange($('Explode'));
  const url = new URL(location.href); url.searchParams.set('object', id); history_replace(url);
  rebuildRecipe();
  refresh();
}
function history_replace(url) { try { window.history.replaceState(null, '', url); } catch { /* sandboxed */ } }

// ------------------------------------------------------------------ bake (UI simulation of the browser bake)
function bake(id = state.selected, { quiet = false } = {}) {
  const o = byId.get(id), s = settings.get(id);
  if (!s.Enabled || s.Mode !== 'baked' || (state.baking && state.baking.id === id)) return Promise.resolve(false);
  const st = F.bakeState(o.owner, s), sdfOnly = st === 'sdf-pending';
  const sig = F.signature(o.owner, s), pieces = sdfOnly ? s.Baked.Pieces ?? F.pieceBudget(o.owner, s).pieces : F.shatter(o.owner, s).cells.length || F.pieceBudget(o.owner, s).pieces;
  const res = s.SdfResolution, wantSdf = s.PieceSdf;
  const phases = [...(sdfOnly ? [] : [['Splitting pieces', 10], ['Sealing faces', 6]]), ...(wantSdf ? [[`Writing SDF · ${pieces} × ${res}³`, Math.round(6 + res / 16)]] : [])];
  const total = phases.reduce((a, p) => a + p[1], 0) || 1;
  state.baking = { id, progress: 0, text: phases[0]?.[0] || 'Baking' };
  refresh({ light: true });
  return new Promise((resolve) => {
    let tick = 0;
    const step = () => {
      tick++;
      let acc = 0, text = phases[phases.length - 1]?.[0];
      for (const [label, n] of phases) { if (tick <= acc + n) { text = label; break; } acc += n; }
      state.baking = { id, progress: Math.min(1, tick / total), text };
      paintBakeVeil();
      if (tick < total) { setTimeout(step, 28); return; }
      state.baking = null;
      const prev = settings.get(id).Baked;
      const Baked = { Signature: sdfOnly ? prev.Signature : sig, Pieces: pieces, At: Date.now(), Sdf: wantSdf ? { Resolution: res, Bytes: pieces * res ** 3 * 2 } : null };
      commit({ Baked }, id);
      if (!quiet) toast(`${o.owner.Name}: ${wantSdf ? `${pieces} pieces + SDF baked` : `${pieces} pieces baked`}`);
      resolve(true);
    };
    setTimeout(step, 28);
  });
}

async function bakeAll() {
  const ids = objects.filter((o) => needsBake(F.bakeState(o.owner, settings.get(o.owner.Id)))).map((o) => o.owner.Id);
  for (const id of ids) await bake(id, { quiet: true });
  if (ids.length) toast(`Baked ${ids.length} object${ids.length > 1 ? 's' : ''}`);
}

// ------------------------------------------------------------------ object list
function renderList() {
  const list = $('ObjectList'), q = state.search.trim().toLowerCase();
  list.replaceChildren();
  let shown = 0, on = 0, need = 0;
  for (const o of objects) {
    const s = settings.get(o.owner.Id), st = F.bakeState(o.owner, s);
    if (s.Enabled) on++;
    if (needsBake(st)) need++;
    if (q && !o.owner.Name.toLowerCase().includes(q) && !o.owner.Primitive.includes(q)) continue;
    if (state.filter === 'on' && !s.Enabled) continue;
    if (state.filter === 'bake' && !needsBake(st)) continue;
    shown++;
    const sub = s.Enabled ? `${F.MATERIAL[s.Material].name} · ${F.pieceBudget(o.owner, s).pieces} pcs · ${s.Mode === 'baked' ? 'Baked' : 'Dynamic'}` : `Off · ${o.owner.Primitive}`;
    const row = el('button', { type: 'button', role: 'option', class: `obj-row${o.owner.Id === state.selected ? ' selected' : ''}${s.Enabled ? '' : ' is-off'}`, 'aria-selected': String(o.owner.Id === state.selected), dataset: { id: o.owner.Id }, onclick: () => select(o.owner.Id) },
      el('span', { class: 'obj-icon', html: icon(primIcon(o.owner.Primitive), 18) }),
      el('span', { class: 'obj-text' }, el('span', {}, o.owner.Name), el('small', {}, sub)),
      el('span', { class: `pill ${st}` }, STATE_LABEL[st]));
    list.append(row);
  }
  if (!shown) list.append(el('div', { class: 'list-empty' }, 'No objects match.'));
  $('StatFracturing').textContent = on;
  $('StatNeedBake').textContent = need;
  $('ObjectCaption').textContent = `${objects.length} in scene`;
  const bakeAllBtn = $('BakeAllBtn');
  bakeAllBtn.disabled = !need || !!state.baking;
  bakeAllBtn.lastChild.textContent = need ? `Bake ${need} object${need > 1 ? 's' : ''}` : 'All bakes up to date';
}

// ------------------------------------------------------------------ section schematic
const VB = { w: 1000, h: 640, pad: 74 };
function fitFor(owner, w = VB.w, h = VB.h, pad = VB.pad, lift = 18) {
  const [sx, sy] = owner.Scale, k = Math.min((w - pad * 2) / sx, (h - pad * 2 - lift) / sy);
  return { k, cx: w / 2, cy: h / 2 - lift / 2, to: ([x, y]) => [w / 2 + x * k, h / 2 - lift / 2 - y * k], from: ([px, py]) => [(px - w / 2) / k, -(py - (h / 2 - lift / 2)) / k] };
}

function shardFill(cell, i, n, result, s, mode, hist) {
  const m = F.MATERIAL[s.Material];
  if (mode === 'size') { const L = Math.log(hist.lo), H = Math.log(hist.hi); return rgb(ramp(H - L < 1e-9 ? 0.5 : 1 - (Math.log(cell.size) - L) / (H - L))); }
  if (mode === 'release') return rgb(ramp(1 - i / Math.max(1, n - 1)));
  const [sx, sy] = result.owner.Scale, base = hex(m.tone);
  const lit = 0.66 + 0.26 * cell.shade + 0.1 * ((-cell.centroid[0] / sx) + (cell.centroid[1] / sy));
  const heat = Math.max(0, 1 - cell.dist / (Math.hypot(sx, sy) * 0.22)) * 0.5;
  return rgb(mix(base.map((v) => v * lit), AMBER, heat));
}

function insetPoly(poly, c, k) { return poly.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]); }

function shardsMarkup(result, s, fit, { mode = 'material', explode = 0, gap = 2.2 } = {}) {
  if (!result.shape) return '';
  const n = result.cells.length, hist = F.histogram(result.cells), m = F.MATERIAL[s.Material];
  const [ix, iy] = result.impact, R = Math.hypot(...result.owner.Scale.slice(0, 2)) / 2;
  const opacity = m.id === 'glass' || m.id === 'tempered' ? 0.82 : 1;
  const parts = [`<path class="ghost" d="M${result.shape.map((p) => fit.to(p).map((v) => v.toFixed(1)).join(' ')).join('L')}Z"/>`];
  result.cells.forEach((cell, i) => {
    let dx = 0, dy = 0;
    if (explode > 0) {
      const vx = cell.centroid[0] - ix, vy = cell.centroid[1] - iy, len = Math.hypot(vx, vy) || 1;
      const push = explode * R * 0.3 * (0.35 + 0.65 * Math.exp(-cell.dist / R));
      dx = (vx / len) * push; dy = (vy / len) * push;
    }
    const areaPx = cell.area * fit.k * fit.k, k = Math.max(0.5, 1 - gap / Math.sqrt(areaPx));
    const pts = insetPoly(cell.poly, cell.centroid, k).map(([x, y]) => fit.to([x + dx, y + dy]).map((v) => v.toFixed(1)).join(',')).join(' ');
    parts.push(`<polygon class="shard" points="${pts}" fill="${shardFill(cell, i, n, result, s, mode, hist)}" fill-opacity="${opacity}"/>`);
  });
  return parts.join('');
}

function renderStage() {
  const o = current(), s = cur(), svg = $('Stage'), well = $('StageWell'), empty = $('StageEmpty');
  const result = F.shatter(o.owner, s);
  state.result = result;
  const fit = fitFor(o.owner);
  state.fit = fit;
  let body = `<defs><radialGradient id="ImpactGlow"><stop offset="0" stop-color="#ffb238" stop-opacity=".55"/><stop offset=".45" stop-color="#ffb238" stop-opacity=".16"/><stop offset="1" stop-color="#ffb238" stop-opacity="0"/></radialGradient></defs>`;
  if (result.shape) {
    body += `<g class="shards">${shardsMarkup(result, s, fit, { mode: state.shade, explode: state.explode })}</g>`;
    const [px, py] = fit.to(result.impact), glow = 50 + 140 * Math.sqrt(s.Energy / F.LIMITS.Energy[1]);
    const off = s.X !== result.impact[0] || s.Y !== result.impact[1];
    body += `<g class="impact" data-role="impact" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})"><circle r="${glow.toFixed(1)}" fill="url(#ImpactGlow)"/><circle r="17" fill="#ffb238" fill-opacity=".22"/><circle r="8" fill="#ffb238"/>`
      + `<text x="16" y="-14" style="fill:#ffb238;font-size:12px">${off ? 'clamped · ' : ''}Z ${s.Z.toFixed(2)} m</text></g>`;
    // Dimensions as type only, a filled pill for scale — no rule lines.
    const [sx, sy] = o.owner.Scale, b = fit.to([0, -sy / 2]), r = fit.to([sx / 2, 0]);
    body += `<text x="${b[0].toFixed(1)}" y="${(b[1] + 30).toFixed(1)}" text-anchor="middle">${esc(F.formatLength(sx))}</text>`;
    body += `<text x="${(r[0] + 16).toFixed(1)}" y="${(r[1] + 4).toFixed(1)}">${esc(F.formatLength(sy))}</text>`;
    let unit = 1; while (unit * fit.k > 220) unit /= 10; while (unit * fit.k < 30) unit *= 10;
    body += `<rect class="scale-pill" x="28" y="${VB.h - 46}" width="${(unit * fit.k).toFixed(1)}" height="6" rx="3"/><text x="28" y="${VB.h - 56}">${esc(F.formatLength(unit))}</text>`;
  }
  svg.innerHTML = body;
  svg.setAttribute('tabindex', result.shape && s.Enabled ? '0' : '-1');
  well.classList.toggle('disabled', !s.Enabled || !result.shape);
  empty.replaceChildren();
  empty.hidden = s.Enabled && !!result.shape;
  if (!s.Enabled) {
    empty.append(el('span', { class: 'big-ico', html: icon(primIcon(o.owner.Primitive), 28) }), el('h3', {}, `Fracture is off for ${o.owner.Name}`),
      el('p', {}, 'Turn it on to author how this object breaks. Nothing is generated or stored until you do.'),
      el('button', { type: 'button', class: 'primary', 'data-action': 'enable', onclick: () => commit({ Enabled: true }) }, ico('shatter', 14), 'Enable fracture'));
  } else if (!result.shape) {
    empty.append(el('span', { class: 'big-ico', html: icon(primIcon(o.owner.Primitive), 28) }), el('h3', {}, result.notice),
      el('p', {}, `The recipe still applies — about ${result.budget.pieces} pieces with these settings. The section preview covers cubes, spheres, cylinders and cones.`));
  }
  $('StageHint').hidden = !s.Enabled || !result.shape;
  paintBakeVeil();
}

function paintBakeVeil() {
  const b = state.baking, show = !!b && b.id === state.selected;
  $('BakeVeil').hidden = !show;
  if (show) { $('BakeFill').style.width = `${(b.progress * 100).toFixed(0)}%`; $('BakeText').textContent = b.text; }
}

function renderReadouts() {
  const s = cur(), r = state.result, stats = F.pieceStats(r.cells);
  const pieces = r.shape ? stats.count : r.budget.pieces;
  $('RPieces').textContent = r.shape ? pieces : `~${pieces}`;
  $('RSmallest').textContent = r.shape ? F.formatLength(stats.smallest) : '—';
  $('RMedian').textContent = r.shape ? F.formatLength(stats.median) : '—';
  $('RLargest').textContent = r.shape ? F.formatLength(stats.largest) : '—';
  const mem = F.storageEstimate(pieces, s);
  $('RMemory').textContent = s.Enabled ? F.formatBytes(s.Mode === 'baked' ? mem.total : mem.mesh) : '—';
  $('RMemoryLabel').textContent = s.Mode === 'baked' ? 'stored' : 'at impact';
  const h = F.histogram(r.cells), max = Math.max(1, ...h.bins), wrap = $('Histogram');
  wrap.replaceChildren(...h.bins.map((v, i) => el('i', { title: `${v} piece${v === 1 ? '' : 's'}`, style: { height: `${(v / max) * 100}%`, background: state.shade === 'size' ? rgb(ramp(1 - i / (h.bins.length - 1))) : v ? '#4a4a4a' : '#222' } })));
  $('HistLo').textContent = r.cells.length ? F.formatLength(h.lo) : '—';
  $('HistHi').textContent = r.cells.length ? F.formatLength(h.hi) : '—';
}

function renderHeader() {
  const o = current(), s = cur(), st = F.bakeState(o.owner, s);
  $('CrumbIcon').innerHTML = icon(primIcon(o.owner.Primitive), 14);
  $('CrumbName').textContent = o.owner.Name;
  $('CrumbState').className = `pill ${st}`; $('CrumbState').textContent = STATE_LABEL[st];
  $('StageTitle').textContent = o.owner.Name;
  const m = F.MATERIAL[s.Material];
  $('StageMeta').replaceChildren(
    el('span', { class: 'chip' }, ico(primIcon(o.owner.Primitive), 10), o.owner.Primitive),
    el('span', { class: 'chip' }, o.owner.Scale.map((v) => +v.toFixed(3)).join(' × '), ' m'),
    s.Enabled ? el('span', { class: 'chip' }, el('i', { class: 'swatch', style: { background: m.tone } }), m.name) : null,
    s.Enabled ? el('span', { class: 'chip' }, `seed ${s.Seed}`) : null);
  const h = history.get(state.selected);
  $('UndoBtn').disabled = !h.undo.length; $('RedoBtn').disabled = !h.redo.length;
  $('RerollBtn').disabled = !s.Enabled;
  document.title = `${o.owner.Name} · Fracture Editor`;
}

// ------------------------------------------------------------------ recipe panel
let binds = [];
function paintRange(input) { input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min || 1)) * 100}%`); }

function sliderField({ label, min, max, step, get, key, fmt, toSlider = (v) => v, fromSlider = (v) => v, note }) {
  const out = el('output', {});
  const input = el('input', { type: 'range', min, max, step, 'aria-label': label, dataset: { key } });
  input.addEventListener('input', () => { input.dataset.live = '1'; paintRange(input); preview({ [key]: fromSlider(+input.value) }); });
  input.addEventListener('change', () => { delete input.dataset.live; commit({ [key]: fromSlider(+input.value) }); });
  binds.push((s) => { out.textContent = fmt(get(s)); if (!input.dataset.live) input.value = toSlider(get(s)); paintRange(input); });
  return el('label', { class: 'field' }, el('span', {}, label), out, input, note ? el('small', {}, note) : null);
}

function numberInput({ key, step = 1, label, get = (s) => s[key], cls = 'num' }) {
  const input = el('input', { type: 'number', class: cls, step, 'aria-label': label, dataset: { key } });
  input.addEventListener('change', () => commit({ [key]: +input.value }));
  binds.push((s) => { if (document.activeElement !== input) input.value = +(+get(s)).toFixed(4); });
  return input;
}

function rebuildRecipe() {
  binds = [];
  const o = current(), host = $('Recipe');
  host.replaceChildren();

  const pill = el('span', { class: 'pill' });
  binds.push((s) => { const st = F.bakeState(o.owner, s); pill.className = `pill ${st}`; pill.textContent = STATE_LABEL[st]; });
  host.append(el('div', { class: 'recipe-head' }, el('h2', {}, 'Recipe'), pill));

  const sw = el('input', { type: 'checkbox', class: 'switch', id: 'EnableSwitch', 'aria-label': 'Enable fracture' });
  sw.addEventListener('change', () => commit({ Enabled: sw.checked }));
  const master = el('label', { class: 'master' }, el('span', {}, 'Fracture this object', el('small', { class: 'master-sub' }, '')), sw);
  binds.push((s) => { sw.checked = s.Enabled; master.classList.toggle('on', s.Enabled); master.querySelector('.master-sub').textContent = s.Enabled ? F.STATE_TEXT[F.bakeState(o.owner, s)] : 'Off — the object stays whole.'; });
  host.append(master);

  const group = el('div', { class: 'group' });
  binds.push((s) => group.classList.toggle('locked', !s.Enabled));
  host.append(group);

  // Material
  const tiles = el('div', { class: 'materials', role: 'radiogroup', 'aria-label': 'Material' });
  for (const m of F.MATERIALS) {
    const t = el('button', { type: 'button', class: 'mat-tile', role: 'radio', dataset: { material: m.id }, title: m.note, onclick: () => commit({ Material: m.id }) },
      el('span', { class: 'mat-swatch', style: { background: `linear-gradient(135deg, ${m.tone} 0 48%, ${rgb(hex(m.tone).map((v) => v * 0.7))} 52% 100%)` } }), el('span', {}, m.name));
    tiles.append(t);
  }
  const matNote = el('div', { class: 'mat-note' });
  binds.push((s) => { for (const t of tiles.children) { const on = t.dataset.material === s.Material; t.classList.toggle('active', on); t.setAttribute('aria-checked', String(on)); } matNote.textContent = F.MATERIAL[s.Material].note; });
  group.append(el('h4', { class: 'section-head' }, el('span', {}, 'MATERIAL')), el('div', {}, tiles, matNote));

  // Break
  const presets = el('div', { class: 'presets' }, ...F.ENERGY_PRESETS.map((p) => el('button', { type: 'button', dataset: { joules: p.joules }, title: F.formatEnergy(p.joules), onclick: () => commit({ Energy: p.joules }) }, p.label)));
  binds.push((s) => { for (const b of presets.children) b.classList.toggle('active', +b.dataset.joules === s.Energy); });
  const energy = sliderField({ label: 'Energy', key: 'Energy', min: 0, max: 1, step: 0.001, get: (s) => s.Energy, fmt: F.formatEnergy, toSlider: F.energyToSlider, fromSlider: F.sliderToEnergy });
  energy.append(presets);
  const dice = el('button', { type: 'button', class: 'icon-btn', title: 'New seed (R)', 'aria-label': 'New seed', html: icon('dice', 16), onclick: reroll });
  const seedField = el('div', { class: 'field' }, el('span', {}, 'Seed'), el('span'), el('div', { class: 'field-wide seed-row' }, numberInput({ key: 'Seed', label: 'Seed' }), dice), el('small', {}, 'Same seed, same pieces — every time, on every machine.'));
  group.append(el('h4', { class: 'section-head' }, el('span', {}, 'BREAK')), el('div', { class: 'panel' }, energy, seedField));

  // Pieces
  const ceiling = sliderField({ label: 'Piece ceiling', key: 'Ceiling', min: 2, max: 160, step: 1, get: (s) => s.Ceiling, fmt: (v) => `${v} max` });
  const minSize = sliderField({ label: 'Minimum size', key: 'MinimumSize', min: 0.002, max: 0.3, step: 0.001, get: (s) => s.MinimumSize, fmt: F.formatLength });
  const budget = el('div', { class: 'budget', 'aria-label': 'What limits the piece count' });
  const rows = { energy: 'Energy asks', ceiling: 'Ceiling allows', size: 'Size allows' };
  const rowEls = Object.fromEntries(Object.entries(rows).map(([k, label]) => { const r = el('div', { class: 'budget-row', dataset: { limit: k } }, el('span', {}, label), el('span', { class: 'bar' }, el('i')), el('b', {}, '0')); budget.append(r); return [k, r]; }));
  const budgetNote = el('p', {});
  binds.push((s) => {
    const b = F.pieceBudget(o.owner, s), vals = { energy: b.byEnergy, ceiling: b.ceiling, size: b.bySize }, top = 160;
    for (const [k, r] of Object.entries(rowEls)) { r.classList.toggle('win', b.limiter === k); r.querySelector('i').style.width = `${Math.min(100, (vals[k] / top) * 100)}%`; r.querySelector('b').textContent = vals[k] > 999 ? '999+' : vals[k]; }
    budgetNote.textContent = { energy: `${b.pieces} pieces — more energy would make more.`, ceiling: `${b.pieces} pieces — capped by the ceiling.`, size: `${b.pieces} pieces — smaller would break the minimum size.` }[b.limiter];
  });
  group.append(el('h4', { class: 'section-head' }, el('span', {}, 'PIECES')), el('div', { class: 'panel' }, ceiling, minSize, budget, budgetNote));

  // Impact
  const center = el('button', { type: 'button', class: 'mini', title: 'Centre the impact', onclick: () => commit({ X: 0, Y: 0, Z: 0 }) }, 'Centre');
  const vec = el('div', { class: 'vec3' }, ...['X', 'Y', 'Z'].map((a) => el('label', { class: `axis axis-${a.toLowerCase()}` }, el('i', {}, a), numberInput({ key: a, step: 0.01, label: `Impact ${a}`, cls: '' }))));
  group.append(el('h4', { class: 'section-head' }, el('span', {}, 'IMPACT'), center), el('div', { class: 'panel' }, el('div', { class: 'vec-head' }, el('span', {}, 'Point'), el('small', {}, 'metres, object space')), vec, el('p', {}, 'Drag the amber point on the section, or focus the section and use the arrow keys.')));

  // Storage
  const modeTiles = el('div', { class: 'mode-tiles', role: 'radiogroup', 'aria-label': 'Storage mode' },
    el('button', { type: 'button', class: 'mode-tile', role: 'radio', dataset: { mode: 'dynamic' }, onclick: () => commit({ Mode: 'dynamic' }) }, el('span', {}, ico('bolt', 13), 'Dynamic'), el('small', {}, 'Generate on impact. Nothing stored.')),
    el('button', { type: 'button', class: 'mode-tile', role: 'radio', dataset: { mode: 'baked' }, onclick: () => commit({ Mode: 'baked' }) }, el('span', {}, ico('bake', 13), 'Baked'), el('small', {}, 'Precompute once, reuse instantly.')));
  const bakeHost = el('div', {});
  const sdfSwitch = el('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Per-piece SDF' });
  sdfSwitch.addEventListener('change', () => commit({ PieceSdf: sdfSwitch.checked }));
  const resSeg = el('div', { class: 'segmented fill small', role: 'radiogroup', 'aria-label': 'SDF resolution per piece' }, ...F.SDF_RESOLUTIONS.map((r) => el('button', { type: 'button', dataset: { res: r }, onclick: () => commit({ SdfResolution: r }) }, `${r}³`)));
  const memRows = el('div', { class: 'mem-rows' });
  const sdfBlock = el('div', { class: 'panel' }, el('label', { class: 'toggle-row' }, el('span', {}, 'Per-piece SDF', el('small', {}, 'Distance field per piece (R16F) for contact and soft shadows.')), sdfSwitch), el('div', { class: 'field sdf-res' }, el('span', {}, 'Resolution per piece'), el('span'), el('div', { class: 'field-wide' }, resSeg)), memRows);
  binds.push((s) => {
    for (const t of modeTiles.children) { const on = t.dataset.mode === s.Mode; t.classList.toggle('active', on); t.setAttribute('aria-checked', String(on)); }
    const baked = s.Mode === 'baked';
    bakeHost.hidden = !baked; sdfBlock.hidden = !baked;
    sdfSwitch.checked = s.PieceSdf;
    sdfBlock.querySelector('.sdf-res').hidden = !s.PieceSdf;
    for (const b of resSeg.children) b.classList.toggle('active', +b.dataset.res === s.SdfResolution);
    const pieces = state.result ? (state.result.shape ? state.result.cells.length : state.result.budget.pieces) : F.pieceBudget(o.owner, s).pieces;
    const mem = F.storageEstimate(pieces, s);
    memRows.replaceChildren(el('span', {}, `Pieces · ${pieces}`), el('b', {}, F.formatBytes(mem.mesh)), ...(s.PieceSdf ? [el('span', {}, `SDF · ${pieces} × ${s.SdfResolution}³ × 2 B`), el('b', {}, F.formatBytes(mem.sdf))] : []), el('span', {}, 'Total stored'), el('b', {}, F.formatBytes(mem.total)));
    if (baked) renderBakeCard(bakeHost, o, s);
  });
  group.append(el('h4', { class: 'section-head' }, el('span', {}, 'STORAGE')), el('div', { class: 'panel' }, modeTiles, bakeHost), sdfBlock);

  host.append(el('div', { class: 'recipe-foot' },
    el('button', { type: 'button', id: 'ResetRecipeBtn', title: 'Restore default recipe (keeps on/off and storage mode)', onclick: () => { const d = F.DEFAULTS; commit({ Material: d.Material, Energy: d.Energy, Seed: d.Seed, Ceiling: d.Ceiling, MinimumSize: d.MinimumSize, X: 0, Y: 0, Z: 0 }); toast('Recipe reset'); } }, ico('reset', 13), 'Reset recipe'),
    el('button', { type: 'button', id: 'CopyRecipeBtn', title: 'Copy the stored JSON', onclick: copyRecipe }, ico('copy', 13), 'Copy JSON')));
}

function timeAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

function renderBakeCard(host, o, s) {
  const st = F.bakeState(o.owner, s), busy = state.baking && state.baking.id === o.owner.Id;
  const meta = s.Baked ? `#${F.shortHash(s.Baked.Signature)} · ${s.Baked.Pieces ?? '?'} pieces · ${s.Baked.At ? timeAgo(s.Baked.At) : 'earlier'}` : `will store #${F.shortHash(F.signature(o.owner, s))}`;
  const card = el('div', { class: `bake-card ${st}` },
    el('div', { class: 'bake-status' }, el('span', { class: `disc ${st}`, html: icon(STATE_ICON[st], 14) }), el('div', {}, F.STATE_TEXT[st], el('small', {}, meta))));
  if (st === 'stale') {
    const diff = F.recipeDiff(o.owner, s);
    card.append(el('div', { class: 'diff' }, ...diff.map((d) => el('div', {}, el('span', {}, d.label), el('b', { html: `${esc(d.from)} → <em>${esc(d.to)}</em>` })))));
  }
  const actions = el('div', { class: 'bake-actions' });
  const label = busy ? 'Baking…' : st === 'ready' ? 'Rebake' : st === 'sdf-pending' ? 'Bake SDF' : st === 'stale' ? 'Rebake' : 'Bake';
  actions.append(el('button', { type: 'button', id: 'BakeBtn', class: `primary${needsBake(st) ? ' amber' : ''}`, disabled: busy, title: 'Bake (B)', onclick: () => bake() }, ico('bake', 14), label));
  if (st === 'stale' && F.bakedRecipe(s)) actions.append(el('button', { type: 'button', id: 'RevertBtn', title: 'Put the recipe back to what was baked', onclick: () => { commit(F.bakedRecipe(s)); toast('Recipe reverted to the bake'); } }, ico('undo', 14), 'Revert'));
  card.append(actions);
  host.replaceChildren(card);
}

function reroll() {
  if (!cur().Enabled) return;
  let seed;
  do seed = 1 + Math.floor(Math.random() * 999998); while (seed === cur().Seed);
  commit({ Seed: seed });
}

async function copyRecipe() {
  const text = JSON.stringify({ Owner: current().owner, Settings: cur() }, null, 2);
  try { await navigator.clipboard.writeText(text); toast('Recipe JSON copied'); } catch { toast('Clipboard unavailable'); }
}

// ------------------------------------------------------------------ inspector card (compact)
function renderCard() {
  const o = current(), s = cur(), st = F.bakeState(o.owner, s), host = $('CardHost');
  $('CardObjIcon').innerHTML = icon(primIcon(o.owner.Primitive), 16);
  $('CardObjName').textContent = o.owner.Name;
  const v = o.values;
  $('CardTransform').replaceChildren(...[['Location', v.Location], ['Rotation', [0, 0, 0]], ['Scale', v.Scale]].flatMap(([k, a]) => [el('span', {}, k), el('b', {}, a.map((x) => (+x).toFixed(2)).join('  '))]));
  const sw = el('input', { type: 'checkbox', class: 'switch', 'aria-label': 'Enable fracture' });
  sw.checked = s.Enabled;
  sw.addEventListener('change', () => commit({ Enabled: sw.checked }));
  const card = el('section', { class: `faux-card fx-card${s.Enabled ? ' on' : ''}`, 'data-card': 'Fracture' },
    el('header', {}, el('div', { class: 'fx-card-title' }, el('span', { class: 'ico fx-card-mark', html: icon('shatter', 14) }), el('div', {}, el('h3', {}, 'Fracture'), el('small', {}, 'PER-OBJECT GEOMETRY'))), el('span', { class: `pill ${st}` }, STATE_LABEL[st])),
    el('label', { class: 'toggle-row' }, el('span', {}, 'Enable fracture'), sw));
  if (s.Enabled) {
    const r = F.shatter(o.owner, s), preview = el('div', { class: 'card-preview' });
    if (r.shape) {
      const fit = fitFor(o.owner, 300, 112, 14, 0), [px, py] = fit.to(r.impact);
      preview.innerHTML = `<svg viewBox="0 0 300 112" aria-label="Fracture preview"><defs><radialGradient id="CardGlow"><stop offset="0" stop-color="#ffb238" stop-opacity=".5"/><stop offset="1" stop-color="#ffb238" stop-opacity="0"/></radialGradient></defs>${shardsMarkup(r, s, fit, { gap: 1.1 })}<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="20" fill="url(#CardGlow)"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="#ffb238"/></svg>`;
    } else preview.append(el('p', {}, r.notice));
    const m = F.MATERIAL[s.Material];
    const modeSeg = el('div', { class: 'segmented fill small', role: 'radiogroup', 'aria-label': 'Storage mode' }, ...['dynamic', 'baked'].map((id) => el('button', { type: 'button', class: s.Mode === id ? 'active' : '', dataset: { mode: id }, onclick: () => commit({ Mode: id }) }, id === 'dynamic' ? 'Dynamic' : 'Baked')));
    const status = el('div', { class: 'card-status' }, el('span', { class: `disc ${st}`, html: icon(STATE_ICON[st], 11) }), el('span', {}, F.STATE_TEXT[st]));
    if (needsBake(st)) status.append(el('button', { type: 'button', class: 'primary amber', 'data-action': 'card-bake', disabled: !!(state.baking && state.baking.id === o.owner.Id), onclick: () => bake() }, st === 'sdf-pending' ? 'Bake SDF' : 'Bake'));
    card.append(preview,
      el('div', { class: 'chips' }, el('span', { class: 'chip' }, el('i', { class: 'swatch', style: { background: m.tone } }), m.name), el('span', { class: 'chip' }, `${r.shape ? r.cells.length : '~' + r.budget.pieces} pieces`), el('span', { class: 'chip' }, F.formatEnergy(s.Energy)), s.Mode === 'baked' && s.PieceSdf ? el('span', { class: 'chip' }, `SDF ${s.SdfResolution}³`) : null),
      modeSeg, status,
      el('button', { type: 'button', class: 'card-open', 'data-action': 'card-open', onclick: () => setView('editor') }, ico('open', 13), `Edit ${o.owner.Name} fracture`));
  } else {
    card.append(el('p', { style: { margin: 0, fontSize: '10px', color: '#6e6e6e' } }, 'Off — the object stays whole.'));
  }
  host.replaceChildren(card);
}

function setView(view) {
  state.view = view;
  $('Work').classList.toggle('card-mode', view === 'card');
  $('CardView').hidden = view !== 'card';
  for (const b of $('ViewTabs').children) b.classList.toggle('active', b.dataset.view === view);
  refresh();
}

// ------------------------------------------------------------------ refresh
function refresh({ light = false } = {}) {
  renderStage();
  renderReadouts();
  for (const b of binds) b(cur());
  renderHeader();
  if (!light) renderList();
  else { const row = $('ObjectList').querySelector(`[data-id="${state.selected}"] small`); if (row) { const s = cur(); row.textContent = s.Enabled ? `${F.MATERIAL[s.Material].name} · ${F.pieceBudget(current().owner, s).pieces} pcs · ${s.Mode === 'baked' ? 'Baked' : 'Dynamic'}` : `Off · ${current().owner.Primitive}`; } }
  if (state.view === 'card') renderCard();
}

// ------------------------------------------------------------------ stage interaction (impact drag)
function stagePoint(ev) {
  const svg = $('Stage'), r = svg.getBoundingClientRect(), s = Math.min(r.width / VB.w, r.height / VB.h) || 1;
  const ox = r.left + (r.width - VB.w * s) / 2, oy = r.top + (r.height - VB.h * s) / 2;
  return [(ev.clientX - ox) / s, (ev.clientY - oy) / s];
}
function impactFromEvent(ev) {
  const [x, y] = state.fit.from(stagePoint(ev)), [sx, sy] = current().owner.Scale;
  return { X: +Math.max(-sx / 2, Math.min(sx / 2, x)).toFixed(3), Y: +Math.max(-sy / 2, Math.min(sy / 2, y)).toFixed(3) };
}
function wireStage() {
  const svg = $('Stage');
  let dragging = false;
  svg.addEventListener('pointerdown', (ev) => {
    if (!cur().Enabled || !state.result?.shape) return;
    dragging = true; svg.classList.add('dragging');
    try { svg.setPointerCapture(ev.pointerId); } catch { /* jsdom */ }
    preview(impactFromEvent(ev));
  });
  svg.addEventListener('pointermove', (ev) => { if (dragging) preview(impactFromEvent(ev)); });
  const end = (ev) => { if (!dragging) return; dragging = false; svg.classList.remove('dragging'); commit(impactFromEvent(ev)); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', () => { if (dragging) { dragging = false; svg.classList.remove('dragging'); commit({}); } });
  svg.addEventListener('keydown', (ev) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
    if (!d || !cur().Enabled) return;
    ev.preventDefault(); ev.stopPropagation();
    const [sx, sy] = current().owner.Scale, stepSize = (ev.shiftKey ? 0.1 : 0.01) * Math.max(sx, sy), s = cur();
    commit({ X: +Math.max(-sx / 2, Math.min(sx / 2, s.X + d[0] * stepSize)).toFixed(3), Y: +Math.max(-sy / 2, Math.min(sy / 2, s.Y + d[1] * stepSize)).toFixed(3) });
  });
}

// ------------------------------------------------------------------ wiring
function wire() {
  hydrateIcons();
  for (const b of $('ViewTabs').children) b.addEventListener('click', () => setView(b.dataset.view));
  for (const b of $('ShadeMode').children) b.addEventListener('click', () => setShade(b.dataset.shade));
  for (const b of $('ObjectFilter').children) b.addEventListener('click', () => { state.filter = b.dataset.filter; for (const x of $('ObjectFilter').children) x.classList.toggle('active', x === b); renderList(); });
  $('ObjectSearch').addEventListener('input', (e) => { state.search = e.target.value; renderList(); });
  $('Explode').addEventListener('input', (e) => { state.explode = +e.target.value; paintRange(e.target); renderStage(); });
  paintRange($('Explode'));
  $('RerollBtn').addEventListener('click', reroll);
  $('UndoBtn').addEventListener('click', () => undoRedo(-1));
  $('RedoBtn').addEventListener('click', () => undoRedo(1));
  $('BakeAllBtn').addEventListener('click', bakeAll);
  $('KeysBtn').addEventListener('click', () => { $('KeysOverlay').hidden = false; });
  $('KeysClose').addEventListener('click', () => { $('KeysOverlay').hidden = true; });
  $('KeysOverlay').addEventListener('click', (e) => { if (e.target === $('KeysOverlay')) $('KeysOverlay').hidden = true; });
  wireStage();

  document.addEventListener('keydown', (ev) => {
    const t = ev.target, typing = t && (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'z' && !typing) { ev.preventDefault(); undoRedo(ev.shiftKey ? 1 : -1); return; }
    if (mod && ev.key.toLowerCase() === 'y' && !typing) { ev.preventDefault(); undoRedo(1); return; }
    if (typing || mod || ev.altKey) return;
    if (ev.key === 'Escape') { $('KeysOverlay').hidden = true; return; }
    if (ev.key === '?') { $('KeysOverlay').hidden = !$('KeysOverlay').hidden; return; }
    const k = ev.key.toLowerCase();
    if (k === 'r') reroll();
    else if (k === 'e') commit({ Enabled: !cur().Enabled });
    else if (k === 'b') bake();
    else if (k === 'v') setView(state.view === 'editor' ? 'card' : 'editor');
    else if (k === '1' || k === '2' || k === '3') setShade(['material', 'size', 'release'][+k - 1]);
    else if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (t === document.body || t.classList?.contains('obj-row'))) {
      const visible = [...$('ObjectList').querySelectorAll('.obj-row')].map((r) => r.dataset.id), i = visible.indexOf(state.selected);
      const next = visible[Math.max(0, Math.min(visible.length - 1, (i < 0 ? 0 : i) + (ev.key === 'ArrowDown' ? 1 : -1)))];
      if (next) { ev.preventDefault(); select(next); $('ObjectList').querySelector(`[data-id="${next}"]`)?.focus(); }
    }
  });

  // Live sync with other windows (another editor, or the Project Zero inspector card).
  window.addEventListener('storage', (ev) => {
    if (!ev.key || !ev.key.startsWith(F.STORAGE_PREFIX)) return;
    const id = ev.key.slice(F.STORAGE_PREFIX.length);
    if (!byId.has(id)) return;
    let next = F.normalize({});
    try { if (ev.newValue) next = F.normalize(JSON.parse(ev.newValue).Settings); } catch { return; }
    settings.set(id, next);
    if (id === state.selected) { state.dragBase = null; toast(`${byId.get(id).owner.Name} updated in another window`); }
    const badge = $('SyncBadge'); badge.classList.add('flash'); setTimeout(() => badge.classList.remove('flash'), 900);
    refresh();
  });
}

function setShade(mode) {
  state.shade = mode;
  for (const b of $('ShadeMode').children) b.classList.toggle('active', b.dataset.shade === mode);
  renderStage(); renderReadouts();
}

wire();
rebuildRecipe();
refresh();
window.FractureEditor = { state, settings, objects, select, bake, bakeAll, commit, setView };
