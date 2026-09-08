/* ════════════════════════════════════════════════════════════════════════════════════════════
   FRONTIER — application shell
   Wires the four surfaces together: outliner tree, 3D viewport, billboard layer and property
   sheets (docked or floating). Selection is one set shared by all of them, so picking a cube in
   the viewport, in the tree, or from the command palette is the same event.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import './styles.css';
import * as THREE from 'three';
import { scene, flat, reflatten, byId, typeOf, isFolder, TYPES, CATEGORIES, makeNode, setSolo, soloId } from './world.js';
import { createViewport } from './viewport.js';
import { createBillboards } from './billboards.js';
import { createOutliner } from './outliner.js';
import { createPopups } from './popup.js';
import { buildSheet } from './inspector.js';
import { el, slider, dropdown, repaintSliders } from './kit.js';
import { ic } from './icons.js';
import { bus } from './bus.js';

/* ── state ─────────────────────────────────────────────────────────────────────────────────── */
const state = {
  selection: new Set(),
  cursorId: null,
  mode: 'split',
  cats: new Set(CATEGORIES),
  labelMode: 'hover',
  tod: 7.4,          // hours
  playing: false,
};

const $ = s => document.querySelector(s);
const stage = $('#stage');
const canvas = $('#gl');

/* ── viewport ──────────────────────────────────────────────────────────────────────────────── */
const vp = createViewport(canvas, {
  onPick: (id, e) => {
    if (id == null) { if (!e.shiftKey && !e.ctrlKey && !e.metaKey) app.select(null); return; }
    app.select(id, { additive: e.ctrlKey || e.metaKey });
  },
});
vp.setHudElements($('#vign'), $('#grain'));

const billboards = createBillboards($('#billboards'), vp, {
  onSelect: (node, e) => app.select(node.id, { additive: e.ctrlKey || e.metaKey }),
  onOpen: node => popups.openFor(node),
  onContext: (node, e) => { app.select(node.id); app.contextMenu(node, e); },
});
/* the popup layer talks to the app through a late-bound facade — popups exist before `app` does */
const popupHost = {
  select: (...a) => app.select(...a),
  focus: n => app.focus(n),
  soloNode: n => app.soloNode(n),
  showInspector: () => app.showInspector(),
  refreshChrome: () => app.refreshChrome(),
};
const popups = createPopups($('#popups'), popupHost, () => {
  const r = stage.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
});

/* ── time of day ───────────────────────────────────────────────────────────────────────────── */
function setTimeOfDay(h, { silent = false } = {}) {
  state.tod = (h + 24) % 24;
  const sun = flat.find(n => n.type === 'sun');
  const moon = flat.find(n => n.type === 'moon');
  const t = (state.tod - 6) / 12 * Math.PI;
  sun.props.elevation = 62 * Math.sin(t);
  sun.props.azimuth = (90 + (state.tod - 6) * 15 + 360) % 360;
  const tm = (state.tod - 18) / 12 * Math.PI;
  moon.props.elevation = 58 * Math.sin(tm);
  moon.props.azimuth = (90 + (state.tod - 18) * 15 + 360) % 360;
  moon.props.phase = (moon.props.phase + 0) % 1;
  vp.applyNode(sun);
  bus.emit('propchange', { node: sun, key: 'elevation', src: 'tod' });
  bus.emit('propchange', { node: moon, key: 'elevation', src: 'tod' });
  const hh = Math.floor(state.tod), mm = Math.floor((state.tod % 1) * 60);
  $('#todClock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  if (!silent) todSlider._set(state.tod);
}

/* ── app actions ───────────────────────────────────────────────────────────────────────────── */
const app = {
  selection: state.selection,
  get cursorId() { return state.cursorId; },

  select(id, { additive = false, range = false, silent = false } = {}) {
    if (id == null) { state.selection.clear(); state.cursorId = null; }
    else if (additive) {
      state.selection.has(id) ? state.selection.delete(id) : state.selection.add(id);
      state.cursorId = id;
    } else if (range && state.cursorId != null) {
      const order = flat.map(n => n.id);
      const a = order.indexOf(state.cursorId), b = order.indexOf(id);
      order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => state.selection.add(x));
      state.cursorId = id;
    } else {
      state.selection.clear(); state.selection.add(id); state.cursorId = id;
    }
    syncSelection();
    if (!silent && id != null) outliner.render();
  },

  focus(node) {
    if (!node) return;
    vp.focusOn(node);
    app.toast(`Framing <b>${node.name}</b>`);
  },

  soloNode(node) {
    const on = soloId() !== node.id;
    setSolo(on ? node.id : null);
    flat.forEach(n => n.solo = false);
    if (on) node.solo = true;
    app.applySolo();
    app.toast(on ? `Soloing <b>${node.name}</b>` : 'Solo cleared');
  },

  applySolo() {
    const sid = flat.find(n => n.solo)?.id ?? null;
    setSolo(sid);
    vp.applyAll();
    outliner.render();
  },

  contextMenu(node, e) { openContext(node, e); },
  toast,
  refreshChrome() { renderInspector(); outliner.render(); billboards.rebuild(billboardNodes()); },
  showInspector() { setMode(state.mode === 'outliner' ? 'split' : state.mode); },

  addEntity(type, parent) {
    const t = TYPES[type];
    /* drop it in the selected folder if there is one, otherwise the folder that owns the category */
    const target = (parent && isFolder(parent) ? parent : null)
      ?? scene.find(f => f.name === folderForCat(t.cat))
      ?? scene[2];
    const n = makeNode(uniqueName(t.label), type, []);
    /* drop new geometry in front of the camera so it is never born offscreen */
    if (n.props.pos) {
      const p = vp.camera.position.clone().add(vp.controls.target.clone().sub(vp.camera.position).setLength(
        Math.min(vp.camera.position.distanceTo(vp.controls.target), 9)));
      n.props.pos = [+p.x.toFixed(2), Math.max(+p.y.toFixed(2), 0.6), +p.z.toFixed(2)];
    }
    target.kids.push(n);
    target.open = true;
    reflatten();
    vp.applyNode(n);
    app.select(n.id);
    outliner.revealNode(n);
    billboards.rebuild(billboardNodes());
    app.toast(`Added <b>${n.name}</b>`);
  },

  duplicate(node) {
    if (!node || isFolder(node)) return;
    const copy = makeNode(uniqueName(node.name.replace(/ \d+$/, '')), node.type, [], {
      props: JSON.parse(JSON.stringify(node.props)), dynamic: node.dynamic, notes: node.notes,
    });
    if (copy.props.pos) copy.props.pos = copy.props.pos.map((v, i) => i === 0 ? v + 1.6 : v);
    const list = node.parent ? node.parent.kids : scene;
    list.splice(list.indexOf(node) + 1, 0, copy);
    reflatten();
    vp.applyNode(copy);
    app.select(copy.id);
    billboards.rebuild(billboardNodes());
    app.toast(`Duplicated <b>${node.name}</b>`);
  },

  remove(node) {
    if (!node) return;
    if (['sky', 'sun', 'water', 'post'].includes(node.type)) { app.toast('That entity is required by the world'); return; }
    const kill = n => { n.kids.slice().forEach(kill); vp.remove(n); };
    kill(node);
    const list = node.parent ? node.parent.kids : scene;
    list.splice(list.indexOf(node), 1);
    reflatten();
    state.selection.delete(node.id);
    if (popups.has(node.id)) popups.close(node.id);
    billboards.rebuild(billboardNodes());
    outliner.render();
    renderInspector();
    app.toast(`Deleted <b>${node.name}</b>`);
  },
};
function folderForCat(cat) {
  return ({ Environment: 'Environment', Water: 'Water', Geometry: 'Objects', Lighting: 'Lighting', Cameras: 'Cameras', Effects: 'Effects' })[cat] || 'Objects';
}
function uniqueName(base) {
  const names = new Set(flat.map(n => n.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/* ── outliner ──────────────────────────────────────────────────────────────────────────────── */
const outliner = createOutliner($('#outliner'), app);

/* ── inspector dock ────────────────────────────────────────────────────────────────────────── */
let currentSheet = null;
function renderInspector() {
  const body = $('#insBody');
  const node = byId(state.cursorId);
  if (currentSheet?._dispose) currentSheet._dispose();
  body.innerHTML = '';
  const t = node ? typeOf(node) : null;
  $('#insIcon').innerHTML = ic(t ? t.icon : 'settings', { size: 15, color: t ? t.color : undefined });
  $('#insTitle').textContent = node ? node.name : 'Inspector';
  $('#insSub').textContent = node
    ? (state.selection.size > 1 ? `${state.selection.size} selected · editing ${t.label}` : `${t.label} · #${String(node.id).padStart(3, '0')}`)
    : 'Nothing selected';
  $('#insFoot').textContent = node ? `${t.cat} · ${node.dynamic ? 'dynamic' : 'static'}${node.locked ? ' · locked' : ''}` : '—';
  if (!node) {
    body.innerHTML = `<div class="empty"><div><div class="big">No entity selected</div>
      Pick a billboard in the viewport, or a row in the outliner.<br>Press <span class="kbd">⌘K</span> to search the world.</div></div>`;
    currentSheet = null;
    return;
  }
  currentSheet = buildSheet(node, { onDirty: () => { outliner.render(); renderInspector(); } });
  body.appendChild(currentSheet);
  repaintSliders(body);
}

/* ── selection plumbing ────────────────────────────────────────────────────────────────────── */
function syncSelection() {
  vp.setSelection([...state.selection]);
  billboards.setSelection([...state.selection]);
  renderInspector();
  const node = byId(state.cursorId);
  $('#stSel').textContent = state.selection.size
    ? `${state.selection.size} selected · ${node ? node.name : ''}`
    : 'nothing selected';
  $('#hudSel').innerHTML = node
    ? `<b>${escape(node.name)}</b><br>${typeOf(node).label} · ${node.vis ? 'visible' : 'hidden'}${node.locked ? ' · locked' : ''}`
    : 'no selection';
}
const escape = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ── billboards ────────────────────────────────────────────────────────────────────────────── */
const billboardNodes = () => flat.filter(n => !isFolder(n) && !typeOf(n).noBillboard);
billboards.setCategories(state.cats);
billboards.rebuild(billboardNodes());

/* ── viewport furniture ────────────────────────────────────────────────────────────────────── */
const catBar = $('#catBar');
CATEGORIES.forEach(cat => {
  const b = el('button', 'chipbtn on', `<span class="swat" style="background:${catColor(cat)}"></span>${cat}`);
  b.onclick = () => {
    state.cats.has(cat) ? state.cats.delete(cat) : state.cats.add(cat);
    b.classList.toggle('on', state.cats.has(cat));
    billboards.setCategories(state.cats);
  };
  catBar.appendChild(b);
});
function catColor(cat) {
  const k = Object.values(TYPES).find(t => t.cat === cat);
  return k ? k.color : '#888';
}

const labelBar = $('#labelBar');
[['hover', 'Hover'], ['always', 'Labels'], ['none', 'Icons']].forEach(([m, label]) => {
  const b = el('button', `chipbtn${state.labelMode === m ? ' on' : ''}`, label);
  b.onclick = () => {
    state.labelMode = m;
    billboards.setLabelMode(m);
    labelBar.querySelectorAll('.chipbtn').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
  };
  labelBar.appendChild(b);
});

const todSlider = slider({
  min: 0, max: 24, value: state.tod, dec: 2, unit: 'h', thin: true,
  onInput: v => setTimeOfDay(v, { silent: true }),
});
todSlider.querySelector('.vpill').style.display = 'none';
$('#todSlider').appendChild(todSlider);
const todPlay = $('#todPlay');
todPlay.innerHTML = ic('play', { size: 12 });
todPlay.onclick = () => {
  state.playing = !state.playing;
  const sun = flat.find(n => n.type === 'sun');
  sun.props.animate = state.playing;
  todPlay.innerHTML = ic(state.playing ? 'pause' : 'play', { size: 12 });
  todPlay.classList.toggle('on', state.playing);
  bus.emit('propchange', { node: sun, key: 'animate', src: 'tod' });
};

/* topbar icons */
$('#brandMark').innerHTML = ic('world', { size: 15 });
$('#btnFrame').innerHTML = ic('focus', { size: 13 });
$('#btnClosePops').innerHTML = ic('close', { size: 13 });
$('#btnHelp').innerHTML = ic('command', { size: 13 });
$('#insPopout').innerHTML = ic('copy', { size: 13 });
$('#insFocus').innerHTML = ic('focus', { size: 13 });
$('#btnFrame').onclick = () => { vp.frameAll(); toast('Framed the world'); };
$('#btnClosePops').onclick = () => { popups.closeAll(); toast('Popups closed'); };
$('#btnHelp').onclick = () => openPalette('?');
$('#btnPalette').onclick = () => openPalette('');
$('#insFocus').onclick = () => app.focus(byId(state.cursorId));
$('#insPopout').onclick = () => { const n = byId(state.cursorId); if (n && !typeOf(n).noBillboard) popups.openFor(n); else if (n) toast('That entity has no billboard'); };

/* add-entity dropdown */
const ADDABLE = ['cube', 'sphere', 'torus', 'cylinder', 'plane', 'pointlight', 'spotlight', 'camera', 'particles', 'probe', 'audio'];
const addDD = dropdown(['Add entity…', ...ADDABLE.map(k => TYPES[k].label)], 'Add entity…', label => {
  const key = ADDABLE.find(k => TYPES[k].label === label);
  addDD._set('Add entity…');
  if (key) app.addEntity(key, byId(state.cursorId));
}, { width: 148 });
$('#addHost').appendChild(addDD);

/* layout modes */
function setMode(m) {
  state.mode = m;
  $('#outliner').classList.toggle('collapsed', m === 'inspector');
  $('#inspector').classList.toggle('collapsed', m === 'outliner');
  document.querySelectorAll('#layoutSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  setTimeout(() => { vp.resize(); repaintSliders(); }, 340);
}
document.querySelectorAll('#layoutSeg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));

/* ── context menu ──────────────────────────────────────────────────────────────────────────── */
const ctx = $('#ctxmenu');
function openContext(node, e) {
  const items = [
    ['Open settings popup', 'settings', () => popups.openFor(node), !typeOf(node).noBillboard && !isFolder(node)],
    ['Frame in viewport', 'focus', () => app.focus(node), true, 'F'],
    ['Rename', 'copy', () => { outliner.render(); const r = document.querySelector(`.row[data-id="${node.id}"] .nm`); r && r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }, true, 'F2'],
    ['sep'],
    [node.vis ? 'Hide' : 'Show', node.vis ? 'eyeoff' : 'eye', () => { node.vis = !node.vis; bus.emit('treechange'); }, true, 'H'],
    [node.locked ? 'Unlock' : 'Lock', node.locked ? 'unlock' : 'lock', () => { node.locked = !node.locked; bus.emit('treechange'); }, true, 'L'],
    ['Solo', 'solo', () => app.soloNode(node), !isFolder(node)],
    ['Duplicate', 'copy', () => app.duplicate(node), !isFolder(node), '⌘D'],
    ['sep'],
    ['Delete', 'trash', () => app.remove(node), true, '⌫', true],
  ];
  ctx.innerHTML = '';
  items.forEach(it => {
    if (it[0] === 'sep') { ctx.appendChild(el('div', 'sep')); return; }
    const [label, icon, fn, enabled = true, shortcut = '', danger = false] = it;
    if (!enabled) return;
    const mi = el('div', `mi${danger ? ' danger' : ''}`, `${ic(icon, { size: 13 })}<span>${label}</span>${shortcut ? `<span class="sc">${shortcut}</span>` : ''}`);
    mi.onclick = () => { ctx.classList.remove('open'); fn(); };
    ctx.appendChild(mi);
  });
  ctx.classList.add('open');
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.min(e.clientX, innerWidth - w - 10) + 'px';
  ctx.style.top = Math.min(e.clientY, innerHeight - h - 10) + 'px';
}
addEventListener('pointerdown', e => { if (!e.target.closest('#ctxmenu')) ctx.classList.remove('open'); });
stage.addEventListener('contextmenu', e => e.preventDefault());

/* ── toasts ────────────────────────────────────────────────────────────────────────────────── */
function toast(html) {
  const t = el('div', 'toast', html);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateY(6px)'; }, 1500);
  setTimeout(() => t.remove(), 1900);
}

/* ── command palette ───────────────────────────────────────────────────────────────────────── */
const pal = $('#palette'), palInput = $('#palInput'), palList = $('#palList');
let palItems = [], palIndex = 0;

function commands() {
  const node = byId(state.cursorId);
  return [
    { label: 'Frame everything', sub: 'view', run: () => vp.frameAll() },
    { label: 'Frame selection', sub: 'view', run: () => app.focus(node) },
    { label: 'Close all popups', sub: 'view', run: () => popups.closeAll() },
    { label: 'Labels: always on', sub: 'billboards', run: () => setLabels('always') },
    { label: 'Labels: on hover', sub: 'billboards', run: () => setLabels('hover') },
    { label: 'Labels: icons only', sub: 'billboards', run: () => setLabels('none') },
    { label: 'Time — sunrise 06:00', sub: 'time', run: () => setTimeOfDay(6) },
    { label: 'Time — golden hour 17:40', sub: 'time', run: () => setTimeOfDay(17.66) },
    { label: 'Time — blue hour 19:10', sub: 'time', run: () => setTimeOfDay(19.16) },
    { label: 'Time — midnight 00:00', sub: 'time', run: () => setTimeOfDay(0) },
    { label: 'Toggle day cycle', sub: 'time', run: () => todPlay.click() },
    { label: 'Layout — outliner only', sub: 'layout', run: () => setMode('outliner') },
    { label: 'Layout — split', sub: 'layout', run: () => setMode('split') },
    { label: 'Layout — inspector only', sub: 'layout', run: () => setMode('inspector') },
    ...ADDABLE.map(k => ({ label: `Add ${TYPES[k].label}`, sub: 'create', run: () => app.addEntity(k, node) })),
  ];
}

function openPalette(seed = '') {
  pal.classList.add('open');
  palInput.value = seed === '?' ? '' : seed;
  paintPalette();
  palInput.focus();
}
const closePalette = () => pal.classList.remove('open');
function paintPalette() {
  const q = palInput.value.trim().toLowerCase();
  const ents = flat.filter(n => !q || n.name.toLowerCase().includes(q) || typeOf(n).label.toLowerCase().includes(q))
    .slice(0, 40)
    .map(n => ({ label: n.name, sub: typeOf(n).label, icon: typeOf(n).icon, color: typeOf(n).color, run: () => { app.select(n.id); outliner.revealNode(n); app.focus(n); } }));
  const cmds = commands().filter(c => !q || c.label.toLowerCase().includes(q));
  palItems = [...ents, ...cmds];
  palIndex = 0;
  palList.innerHTML = palItems.map((it, i) =>
    `<div class="palrow${i === 0 ? ' on' : ''}" data-i="${i}">
       ${ic(it.icon || 'command', { size: 14, color: it.color })}<span>${escape(it.label)}</span><span class="sub">${it.sub}</span></div>`).join('')
    || '<div class="nohits">No matches</div>';
  palList.querySelectorAll('.palrow').forEach(r => {
    r.onclick = () => { palItems[+r.dataset.i].run(); closePalette(); };
    r.onmouseenter = () => { palIndex = +r.dataset.i; markPal(); };
  });
}
const markPal = () => palList.querySelectorAll('.palrow').forEach((r, i) => r.classList.toggle('on', i === palIndex));
palInput.addEventListener('input', paintPalette);
palInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') closePalette();
  if (e.key === 'ArrowDown') { palIndex = Math.min(palIndex + 1, palItems.length - 1); markPal(); scrollPal(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { palIndex = Math.max(palIndex - 1, 0); markPal(); scrollPal(); e.preventDefault(); }
  if (e.key === 'Enter') { palItems[palIndex]?.run(); closePalette(); }
});
const scrollPal = () => palList.querySelectorAll('.palrow')[palIndex]?.scrollIntoView({ block: 'nearest' });
pal.addEventListener('pointerdown', e => { if (!e.target.closest('.palbox')) closePalette(); });
function setLabels(m) {
  state.labelMode = m;
  billboards.setLabelMode(m);
  labelBar.querySelectorAll('.chipbtn').forEach((x, i) => x.classList.toggle('on', ['hover', 'always', 'none'][i] === m));
}

/* ── keyboard ──────────────────────────────────────────────────────────────────────────────── */
addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  const node = byId(state.cursorId);
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); openPalette(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'd') { e.preventDefault(); app.duplicate(node); return; }
  if (e.key === 'Escape') { closePalette(); ctx.classList.remove('open'); if (popups.count()) popups.closeAll(); else app.select(null); return; }
  if (k === 'f') { e.shiftKey ? vp.frameAll() : app.focus(node); return; }
  if (k === 'h' && node) { node.vis = !node.vis; bus.emit('treechange'); return; }
  if (k === 'l' && node) { node.locked = !node.locked; bus.emit('treechange'); return; }
  if (k === 'i' && node) { app.soloNode(node); return; }
  if (k === 'enter' && node && !typeOf(node).noBillboard && !isFolder(node)) { popups.toggle(node); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && node) { e.preventDefault(); app.remove(node); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const order = flat.filter(n => visibleInTree(n)).map(n => n.id);
    const i = order.indexOf(state.cursorId);
    const next = order[Math.min(Math.max(i + (e.key === 'ArrowDown' ? 1 : -1), 0), order.length - 1)];
    if (next != null) { app.select(next, { additive: false }); outliner.revealNode(byId(next)); }
  }
  if (e.key === 'ArrowRight' && node && node.kids.length) { node.open = true; outliner.render(); }
  if (e.key === 'ArrowLeft' && node) { if (node.kids.length && node.open) node.open = false; else if (node.parent) app.select(node.parent.id); outliner.render(); }
});
const visibleInTree = n => { let p = n.parent; while (p) { if (!p.open) return false; p = p.parent; } return true; };

/* ── bus ───────────────────────────────────────────────────────────────────────────────────── */
bus.on('propchange', ({ node, src }) => {
  vp.applyNode(node);
  if (src === 'tod') return;
  if (node.type === 'sun' || node.type === 'moon') syncTodFromSun();
});
bus.on('treechange', () => {
  reflatten();
  vp.applyAll();
  outliner.render();
  renderInspector();
  billboards.rebuild(billboardNodes());
  syncSelection();
});
function syncTodFromSun() {
  const sun = flat.find(n => n.type === 'sun');
  const h = 6 + (sun.props.azimuth - 90) / 15;
  state.tod = (h + 24) % 24;
  const hh = Math.floor(state.tod), mm = Math.floor((state.tod % 1) * 60);
  $('#todClock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  todSlider._set(state.tod);
}

/* ── axis orb ──────────────────────────────────────────────────────────────────────────────── */
const orb = $('#axisOrb');
const AXES = [
  { v: [1, 0, 0], label: 'X', color: 'var(--ax-x)' }, { v: [-1, 0, 0], label: '', color: 'var(--ax-x)', neg: true },
  { v: [0, 1, 0], label: 'Y', color: 'var(--ax-y)' }, { v: [0, -1, 0], label: '', color: 'var(--ax-y)', neg: true },
  { v: [0, 0, 1], label: 'Z', color: 'var(--ax-z)' }, { v: [0, 0, -1], label: '', color: 'var(--ax-z)', neg: true },
];
const orbEls = AXES.map(a => {
  const stem = el('div', 'stem');
  stem.style.background = a.color;
  const dot = el('div', `ax${a.neg ? ' neg' : ''}`, a.label);
  dot.style.background = a.color;
  dot.style.color = a.neg ? a.color : '#000';
  orb.append(stem, dot);
  return { stem, dot, a };
});

/* ── frame loop ────────────────────────────────────────────────────────────────────────────── */
let lastTod = 0;
vp.start(({ fps, camera, controls, dayFactor }) => {
  /* day cycle */
  const sun = flat.find(n => n.type === 'sun');
  if (sun.props.animate) {
    const dt = 1 / Math.max(fps, 1);
    setTimeOfDay(state.tod + dt * sun.props.rate / 600);
  }

  billboards.update();
  popups.update(billboards);

  /* axis orb */
  orbEls.forEach(({ stem, dot, a }) => {
    const v = new THREE.Vector3(...a.v).applyQuaternion(camera.quaternion.clone().invert());
    const x = 38 + v.x * 26, y = 38 - v.y * 26;
    dot.style.left = x + 'px'; dot.style.top = y + 'px';
    dot.style.marginLeft = '-8px'; dot.style.marginTop = '-8px';
    dot.style.opacity = String(0.35 + (v.z + 1) * 0.32);
    dot.style.zIndex = String(Math.round(100 + v.z * 50));
    const dx = x - 38, dy = y - 38;
    stem.style.width = Math.hypot(dx, dy) + 'px';
    stem.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    stem.style.opacity = String(0.15 + (v.z + 1) * 0.16);
  });

  /* hud */
  if (performance.now() - lastTod > 120) {
    lastTod = performance.now();
    const p = camera.position;
    $('#hudLeft').innerHTML =
      `<b>fps</b> <span class="k">${fps.toFixed(0)}</span> &nbsp; <b>daylight</b> <span class="k">${(dayFactor * 100).toFixed(0)}%</span><br>` +
      `<b>cam</b> ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)} &nbsp; <b>dist</b> ${camera.position.distanceTo(controls.target).toFixed(1)} m`;
    $('#stRender').textContent = `WebGL2 · ACES · ${fps.toFixed(0)} fps`;
    $('#stCam').textContent = `${state.tod.toFixed(2).padStart(5, '0')} h · sun ${flat.find(n => n.type === 'sun').props.elevation.toFixed(1)}°`;
  }
});

/* ── boot ──────────────────────────────────────────────────────────────────────────────────── */
setTimeOfDay(7.4);
vp.applyAll();
outliner.render();
setMode('split');
app.select(flat.find(n => n.name === 'Anchor Cube').id);
billboards.setLabelMode('hover');
setTimeout(() => toast('Click a billboard to select · click again for settings'), 700);

/* a tiny handle for automation, embedding and console poking */
window.frontier = { state, app, setTimeOfDay, vp, popups, outliner, billboards, world: { flat, scene } };
