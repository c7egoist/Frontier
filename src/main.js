/* ════════════════════════════════════════════════════════════════════════════════════════════
   FRONTIER — application shell
   Wires the four surfaces together: outliner tree, 3D viewport, billboard layer and property
   sheets (docked or floating). Selection is one set shared by all of them, so picking a cube in
   the viewport, in the tree, or from the command palette is the same event.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import './styles.css';
import * as THREE from 'three';
import {
  scene, flat, reflatten, byId, typeOf, isFolder, TYPES, CATEGORIES, makeNode,
  setIsolation, isolatedIds, isIsolating, isIsolated, effectiveVis,
} from './world.js';
import { createViewport } from './viewport.js';
import { createBillboards } from './billboards.js';
import { createOutliner } from './outliner.js';
import { createPopups } from './popup.js';
import { createLang } from './lang.js';
import { buildSheet, setProp } from './inspector.js';
import { el, slider, repaintSliders } from './kit.js';
import { ic } from './icons.js';
import { bus } from './bus.js';

/* ── state ─────────────────────────────────────────────────────────────────────────────────── */
const state = {
  selection: new Set(),
  cursorId: null,
  mode: 'split',
  docks: { left: true, right: true },
  cats: new Set(CATEGORIES),
  labelMode: 'hover',
  view: 'persp',       // which standard view the camera is parked on, if any
  tod: 7.4,            // hours
  dayCycle: false,     // the sun runs on its own
  transport: 'edit',   // edit | simulate | play
  paused: false,
  realtime: true,      // Unreal's viewport realtime toggle
  playCamId: null,
  snapshot: null,      // world state captured when a run starts, restored on stop
  autoPopup: true,     // selecting an entity opens its settings popup
  gravity: 9.81,
};

const $ = s => document.querySelector(s);
const stage = $('#stage');
const vpView = $('#vpView');
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
  toggleIsolateNode: n => app.toggleIsolateNode(n),
  showInspector: () => app.showInspector(),
  refreshChrome: () => app.refreshChrome(),
};
const popups = createPopups($('#popups'), popupHost, () => {
  const r = vpView.getBoundingClientRect();
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

  /* ── isolate ───────────────────────────────────────────────────────────────────────────────
     Isolation is a set: any number of entities can be isolated at once, and isolating a folder
     keeps its whole subtree. Toggling with the same selection exits, like Unreal. */
  isolate(ids) {
    const want = new Set([...ids].filter(id => byId(id)));
    const cur = isolatedIds();
    const same = want.size === cur.size && [...want].every(id => cur.has(id));
    setIsolation(same ? [] : want);
    app.applyIsolation();
    const n = isolatedIds().size;
    app.toast(n ? `Isolated <b>${n}</b> ${n === 1 ? 'entity' : 'entities'}` : 'Isolation cleared');
  },

  toggleIsolateSelection() {
    if (!state.selection.size) { if (isIsolating()) app.isolate([]); return; }
    app.isolate([...state.selection]);
  },

  toggleIsolateNode(node) {
    const cur = new Set(isolatedIds());
    cur.has(node.id) ? cur.delete(node.id) : cur.add(node.id);
    setIsolation(cur);
    app.applyIsolation();
  },

  exitIsolation() { setIsolation([]); app.applyIsolation(); app.toast('Isolation cleared'); },

  applyIsolation() {
    flat.forEach(n => n.solo = isIsolated(n));
    vp.applyAll();
    outliner.render();
    paintStats();
    renderIsolationBanner();
  },

  soloNode(node) { app.isolate([node.id]); },   // kept: single-entity shorthand

  contextMenu(node, e) { openContext(node, e); },
  toast,
  refreshChrome() { renderInspector(); outliner.render(); billboards.rebuild(billboardNodes()); paintStats(); },
  showInspector() { setDock('right', true); },

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
    return n;
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

  /* delete from RAM — the scene loses the entity AND the driver gets its buffers back. A run in
     progress will not restore it on Stop either: purged is purged. */
  purge(node) {
    if (!node) return null;
    if (['sky', 'sun', 'water', 'post'].includes(node.type)) { app.toast('That entity is required by the world'); return null; }
    const t = { geometries: 0, materials: 0, textures: 0, triangles: 0, nodes: 0 };
    const kill = n => {
      n.kids.slice().forEach(kill);
      const f = vp.purge(n) || {};
      t.geometries += f.geometries || 0; t.materials += f.materials || 0;
      t.textures += f.textures || 0; t.triangles += f.triangles || 0; t.nodes++;
      state.selection.delete(n.id);
      if (popups.has(n.id)) popups.close(n.id);
      if (state.snapshot) {
        state.snapshot.nodes = state.snapshot.nodes.filter(r => r.id !== n.id);
        state.snapshot.ids = state.snapshot.ids.filter(id => id !== n.id);
      }
    };
    kill(node);
    const list = node.parent ? node.parent.kids : scene;
    const i = list.indexOf(node);
    if (i >= 0) list.splice(i, 1);
    reflatten();
    if (state.cursorId === node.id) state.cursorId = null;
    billboards.rebuild(billboardNodes());
    outliner.render();
    renderInspector();
    paintStats();
    return t;
  },

  addable: () => ADDABLE.map(k => ({ key: k, ...TYPES[k] })),

  setPhysics(nodes, on) {
    nodes.forEach(n => { n.physics = on; n.vel = 0; });
    outliner.render();
    renderInspector();
    paintStats();
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
  /* the settings popup follows the selection — the inspector dock being open or shut, or not
     existing at all in outliner-only layout, has nothing to do with it */
  if (state.autoPopup && state.transport !== 'play') {
    if (node && !isFolder(node)) {
      popups.closeAuto(node.id);
      popups.openFor(node, { auto: true });
    } else popups.closeAuto();
  }
  paintStats();
}
const escape = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* ── billboards ────────────────────────────────────────────────────────────────────────────── */
const billboardNodes = () => flat.filter(n => !isFolder(n) && !typeOf(n).noBillboard);
billboards.setCategories(state.cats);
billboards.rebuild(billboardNodes());

/* ── viewport furniture ────────────────────────────────────────────────────────────────────── */
/* ── viewport header menus ─────────────────────────────────────────────────────────────────────
   Everything that used to float over the image as a pill lives in the header now: one menu for
   what is shown, one for how markers read, one for the view itself. */
const vpMenus = $('#vpMenus');
const TICK = ic('check', { size: 12, width: 3 });

function menu(label, build) {
  const wrap = el('div', 'vm');
  const btn = el('button', 'vmbtn', '');
  const pop = el('div', 'vmpop');
  wrap.append(btn, pop);
  vpMenus.appendChild(wrap);

  const api = {
    wrap, btn, pop,
    setLabel(html) { btn.innerHTML = `${html}<span class="caret">${ic('chevdown', { size: 12 })}</span>`; },
    close() { wrap.classList.remove('open'); },
    paint() { pop.innerHTML = ''; build(api, pop); },
  };
  api.row = (html, on, fn, { keep = false } = {}) => {
    const r = el('div', `vmrow${on ? ' on' : ''}`, `<span class="tick">${TICK}</span>${html}`);
    r.onclick = e => { e.stopPropagation(); fn(); api.paint(); if (!keep) api.close(); };
    pop.appendChild(r);
    return r;
  };
  api.head = t => pop.appendChild(el('div', 'vmhead', t));
  api.sep = () => pop.appendChild(el('div', 'vmsep'));

  btn.onclick = e => {
    e.stopPropagation();
    const wasOpen = wrap.classList.contains('open');
    document.querySelectorAll('.vm.open').forEach(x => x.classList.remove('open'));
    if (!wasOpen) { api.paint(); wrap.classList.add('open'); }
  };
  api.paint();
  api.setLabel(label);
  return api;
}
addEventListener('pointerdown', e => {
  if (!e.target.closest('.vm')) document.querySelectorAll('.vm.open').forEach(x => x.classList.remove('open'));
});

function catColor(cat) {
  const k = Object.values(TYPES).find(t => t.cat === cat);
  return k ? k.color : '#888';
}
const catCount = cat => flat.filter(n => !isFolder(n) && typeOf(n).cat === cat).length;

const showMenu = menu('', (m, pop) => {
  m.head('Show in viewport');
  CATEGORIES.forEach(cat => m.row(
    `<span class="swat" style="background:${catColor(cat)}"></span>${cat}<span class="n">${catCount(cat)}</span>`,
    state.cats.has(cat),
    () => {
      state.cats.has(cat) ? state.cats.delete(cat) : state.cats.add(cat);
      billboards.setCategories(state.cats);
      paintShowLabel();
    },
    { keep: true },
  ));
  m.sep();
  m.row('All categories', state.cats.size === CATEGORIES.length,
    () => { state.cats = new Set(CATEGORIES); billboards.setCategories(state.cats); paintShowLabel(); }, { keep: true });
  m.row('None', state.cats.size === 0,
    () => { state.cats = new Set(); billboards.setCategories(state.cats); paintShowLabel(); }, { keep: true });
});
function paintShowLabel() {
  const n = state.cats.size, all = CATEGORIES.length;
  showMenu.setLabel(`${ic('layers', { size: 13 })}Show <span class="val">${n === all ? 'All' : n === 0 ? 'None' : `${n}/${all}`}</span>`);
}
paintShowLabel();

const LABEL_MODES = [['hover', 'Names on hover'], ['always', 'Names always'], ['none', 'Icons only']];
const markerMenu = menu('', (m) => {
  m.head('Markers');
  LABEL_MODES.forEach(([mode, label]) => m.row(label, state.labelMode === mode, () => setLabels(mode)));
  m.sep();
  m.head('On select');
  m.row('Open the settings popup', state.autoPopup, () => act.autoPopup(!state.autoPopup), { keep: true });
  m.sep();
  m.row('Close all open popups', false, () => { popups.closeAll(); toast('Popups closed'); });
});
function paintMarkerLabel() {
  const cur = LABEL_MODES.find(([m]) => m === state.labelMode);
  markerMenu.setLabel(`${ic('tag', { size: 13 })}Markers <span class="val">${cur ? cur[1].replace('Names ', '').replace('Icons only', 'Icons') : ''}</span>`);
}
paintMarkerLabel();

const VIEW_ROWS = [['front', 'Front', 'Z'], ['back', 'Back', ''], ['right', 'Right', 'X'],
  ['left', 'Left', ''], ['top', 'Top', 'Y'], ['bottom', 'Bottom', '']];
const viewMenu = menu('', (m) => {
  m.head('Standard views');
  VIEW_ROWS.forEach(([k, label]) => m.row(label, state.view === k, () => snapView(k)));
  m.sep();
  m.row(`Frame everything<span class="sc">⇧F</span>`, false, () => { vp.frameAll(); state.view = 'persp'; paintViewLabel(); });
  m.row(`Frame selection<span class="sc">F</span>`, false, () => app.focus(byId(state.cursorId)));
});
function paintViewLabel() {
  const cur = VIEW_ROWS.find(([k]) => k === state.view);
  viewMenu.setLabel(`${ic('camera', { size: 13 })}View <span class="val">${cur ? cur[1] : 'Perspective'}</span>`);
}
paintViewLabel();


/* ── transport: play · simulate · pause · step · stop ──────────────────────────────────────────
   Unreal's model. SIMULATE runs the world with the editor camera still free; PLAY runs it looking
   through a scene camera with the gate masked in and the editor furniture hidden; PAUSE freezes
   the clock and STEP advances a single frame; STOP restores the world exactly as it was when the
   run started, so nothing you nudge while it is running leaks back into the authored scene. */
const transportEl = $('#transport');
const tbtn = (cls, icon, title) => {
  const b = el('button', `tbtn ${cls}`, ic(icon, { size: 13 }));
  b.title = title;
  transportEl.appendChild(b);
  return b;
};
const btnPlay = tbtn('play', 'play', 'Play — run the world through a scene camera  (Alt P)');
const btnSim = tbtn('sim', 'sim', 'Simulate — run the world, keep the editor camera  (Alt S)');
const btnPause = tbtn('pause', 'pause', 'Pause / resume  (P)');
const btnStep = tbtn('step', 'step', 'Advance one frame  (.)');
const btnStop = tbtn('stop', 'stop', 'Stop — restore the editor state  (Esc)');
transportEl.appendChild(el('div', 'sep'));
const btnRealtime = el('button', 'tbtn rt on', '<span class="led"></span>Realtime');
btnRealtime.title = 'Realtime viewport — animate and redraw continuously  (Ctrl R)';
transportEl.appendChild(btnRealtime);
const stateChip = el('div', 'statechip edit', 'Edit');
transportEl.appendChild(stateChip);

const gateMask = $('#gateMask');
const barL = el('div', 'bar l'), barR = el('div', 'bar r');
gateMask.append(barL, barR);

const GATE_RATIO = { '16:9': 16 / 9, '2.39:1': 2.39, '4:3': 4 / 3, '1:1': 1 };
function applyGate(camNode) {
  if (!camNode) { gateMask.classList.remove('on'); return; }
  const r = vpView.getBoundingClientRect();
  const ratio = GATE_RATIO[camNode.props.gate] || 16 / 9;
  const view = r.width / r.height;
  const bt = view > ratio ? 0 : (r.height - r.width / ratio) / 2;
  const bl = view > ratio ? (r.width - r.height * ratio) / 2 : 0;
  gateMask.classList.add('on');
  gateMask.querySelector('.bar.t').style.height = bt + 'px';
  gateMask.querySelector('.bar.b').style.height = bt + 'px';
  barL.style.width = bl + 'px';
  barR.style.width = bl + 'px';
  const tag = $('#gateTag');
  tag.textContent = `${camNode.name} · ${camNode.props.gate} · ${Math.round(camNode.props.fov)}° · f/${camNode.props.aperture}`;
  tag.style.top = (bt + 10) + 'px';
  tag.style.left = (bl + 14) + 'px';
}

const CAMERA_TYPES = ['camera', 'cinecamera', 'playercamera', 'vehiclecamera'];
const playCameraNode = () => {
  const cur = byId(state.cursorId);
  if (cur && CAMERA_TYPES.includes(cur.type)) return cur;
  return flat.find(n => n.type === 'playercamera') || flat.find(n => CAMERA_TYPES.includes(n.type)) || null;
};

function snapshotWorld() {
  state.snapshot = {
    tod: state.tod,
    iso: [...isolatedIds()],
    ids: flat.map(n => n.id),
    nodes: flat.map(n => ({
      id: n.id, name: n.name, vis: n.vis, locked: n.locked, dynamic: n.dynamic, physics: !!n.physics,
      props: JSON.parse(JSON.stringify(n.props)),
    })),
  };
}
function restoreWorld() {
  const snap = state.snapshot;
  if (!snap) return;
  /* anything spawned during the run is discarded, exactly like leaving PIE */
  const known = new Set(snap.ids);
  flat.filter(n => !known.has(n.id)).forEach(n => {
    vp.remove(n);
    const list = n.parent ? n.parent.kids : scene;
    const i = list.indexOf(n);
    if (i >= 0) list.splice(i, 1);
    state.selection.delete(n.id);
    if (popups.has(n.id)) popups.close(n.id);
  });
  reflatten();
  snap.nodes.forEach(rec => {
    const n = byId(rec.id);
    if (!n) return;
    n.name = rec.name; n.vis = rec.vis; n.locked = rec.locked; n.dynamic = rec.dynamic;
    n.physics = rec.physics; n.vel = 0;
    n.props = rec.props;
  });
  setIsolation(snap.iso);
  flat.forEach(n => n.solo = isIsolated(n));
  state.snapshot = null;
  setTimeOfDay(snap.tod);
  vp.applyAll();
  outliner.render();
  renderInspector();
  renderIsolationBanner();
  billboards.rebuild(billboardNodes());
}

function setTransport(mode) {
  if (mode !== 'edit' && state.transport === 'edit') toast('Running — <b>Esc</b> stops and restores the editor state');
  if (mode === 'edit') {
    const was = state.transport;
    if (was !== 'edit') restoreWorld();
    state.transport = 'edit';
    state.paused = false;
    state.playCamId = null;
    vp.setViewCamera(null);
    document.body.classList.remove('playing');
    applyGate(null);
    if (was !== 'edit') toast('Stopped · editor state restored');
  } else {
    if (state.transport === 'edit') snapshotWorld();
    state.realtime = true;              // a run is always realtime
    state.paused = false;
    if (mode === 'play') {
      const cam = playCameraNode();
      if (cam && vp.setViewCamera(cam)) {
        state.transport = 'play';
        state.playCamId = cam.id;
        document.body.classList.add('playing');
        applyGate(cam);
        toast(`Playing through <b>${cam.name}</b>`);
      } else {
        toast('No camera to play through — simulating instead');
        mode = 'simulate';
      }
    }
    if (mode === 'simulate') {
      state.transport = 'simulate';
      state.playCamId = null;
      vp.setViewCamera(null);
      document.body.classList.remove('playing');
      applyGate(null);
      toast('Simulating');
    }
  }
  updateTransport();
}

function setPaused(p) {
  state.paused = p;
  updateTransport();
  toast(p ? 'Paused' : 'Resumed');
}
function stepFrame() {
  if (!state.paused) setPaused(true);
  const dt = 1 / 30;
  vp.stepOnce(dt);
  if (dayClockRunning(true)) setTimeOfDay(state.tod + dt * sunNode().props.rate / 600);
}
function setRealtime(v) {
  state.realtime = v;
  updateTransport();
}

function updateTransport() {
  const running = state.transport !== 'edit';
  btnPlay.classList.toggle('on', state.transport === 'play');
  btnSim.classList.toggle('on', state.transport === 'simulate');
  btnPause.classList.toggle('on', state.paused);
  btnPause.innerHTML = ic(state.paused ? 'play' : 'pause', { size: 13 });
  btnStep.disabled = !state.paused;
  btnStop.disabled = !running;
  btnRealtime.classList.toggle('on', state.realtime);
  btnRealtime.disabled = running;
  const label = state.paused ? 'Paused' : state.transport === 'play' ? 'Play'
    : state.transport === 'simulate' ? 'Simulate' : state.realtime ? 'Edit' : 'Edit · static';
  stateChip.textContent = label;
  stateChip.className = 'statechip ' + (state.paused ? 'paused' : state.transport);
  /* one authority for "is the world moving": the viewport animates and redraws, or it does not */
  const live = state.realtime && !state.paused;
  vp.setClock({ animate: live, render: live });
}

btnPlay.onclick = () => setTransport(state.transport === 'play' ? 'edit' : 'play');
btnSim.onclick = () => setTransport(state.transport === 'simulate' ? 'edit' : 'simulate');
btnPause.onclick = () => setPaused(!state.paused);
btnStep.onclick = () => stepFrame();
btnStop.onclick = () => setTransport('edit');
btnRealtime.onclick = () => setRealtime(!state.realtime);

/* ── isolation banner ──────────────────────────────────────────────────────────────────────── */
function renderIsolationBanner() {
  const b = $('#isoBanner');
  const n = isolatedIds().size;
  if (!n) { b.style.display = 'none'; b.innerHTML = ''; return; }
  b.style.display = 'flex';
  b.title = `${n} ${n === 1 ? 'entity is' : 'entities are'} isolated — everything else is hidden`;
  b.innerHTML = `${ic('solo', { size: 11, color: 'currentColor' })}<span>${n}</span>`;
  const x = el('button', 'chipbtn', 'Exit');
  x.onclick = () => app.exitIsolation();
  b.appendChild(x);
}

const sunNode = () => flat.find(n => n.type === 'sun');
const dayClockRunning = (ignorePause = false) =>
  (ignorePause || (state.realtime && !state.paused)) &&
  (state.transport !== 'edit' || sunNode().props.animate);

const todSlider = slider({
  min: 0, max: 24, value: state.tod, dec: 2, unit: 'h', thin: true,
  onInput: v => setTimeOfDay(v, { silent: true }),
});
todSlider.querySelector('.vpill').style.display = 'none';
$('#todSlider').appendChild(todSlider);
const todPlay = $('#todPlay');
todPlay.innerHTML = ic('play', { size: 12 });
todPlay.onclick = () => {
  state.dayCycle = !state.dayCycle;
  const sun = sunNode();
  sun.props.animate = state.dayCycle;
  todPlay.innerHTML = ic(state.dayCycle ? 'pause' : 'play', { size: 12 });
  todPlay.classList.toggle('on', state.dayCycle);
  bus.emit('propchange', { node: sun, key: 'animate', src: 'tod' });
  if (state.dayCycle && !state.realtime) setRealtime(true);
};

$('#vpBrand').innerHTML = ic('world', { size: 15 });
$('#insPopout').innerHTML = ic('copy', { size: 13 });
$('#insFocus').innerHTML = ic('focus', { size: 13 });
$('#insFocus').onclick = () => app.focus(byId(state.cursorId));
$('#insPopout').onclick = () => { const n = byId(state.cursorId); if (n && !typeOf(n).noBillboard) popups.openFor(n); else if (n) toast('That entity has no billboard'); };

const ADDABLE = ['cube', 'sphere', 'torus', 'cylinder', 'plane', 'pointlight', 'spotlight', 'ieslight', 'arealight', 'tubelight', 'camera', 'cinecamera', 'playercamera', 'vehiclecamera', 'particles', 'probe', 'audio'];

/* ── the docks ─────────────────────────────────────────────────────────────────────────────────
   There is no application chrome above the workspace any more: the two panels are toggled from
   the viewport header itself, so the editor is the world plus exactly the panels you asked for. */
const docksEl = $('#vpDocks');
const dockBtn = (side, icon, label, key) => {
  const b = el('button', 'dockbtn', ic(icon, { size: 14 }));
  b.title = `${label} panel  (${key})`;
  b.onclick = () => setDock(side, !state.docks[side]);
  docksEl.appendChild(b);
  return b;
};
const btnDockL = dockBtn('left', 'panelL', 'Outliner', '[');
const btnDockR = dockBtn('right', 'panelR', 'Inspector', ']');

function setDock(side, on) {
  state.docks[side] = on;
  state.mode = state.docks.left && state.docks.right ? 'split'
    : state.docks.left ? 'outliner' : state.docks.right ? 'inspector' : 'viewport';
  $('#outliner').classList.toggle('collapsed', !state.docks.left);
  $('#inspector').classList.toggle('collapsed', !state.docks.right);
  btnDockL.classList.toggle('on', state.docks.left);
  btnDockR.classList.toggle('on', state.docks.right);
  setTimeout(() => { vp.resize(); repaintSliders(); fitStats(); }, 340);
}
/* the old three-way layout switch, kept as an idea rather than a widget */
function setMode(m) {
  setDock('left', m === 'split' || m === 'outliner');
  setDock('right', m === 'split' || m === 'inspector');
}

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
    [isIsolated(node) ? 'Leave isolation' : 'Isolate', 'solo', () => app.toggleIsolateNode(node), true, 'I'],
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

/* ── the command console ───────────────────────────────────────────────────────────────────────
   A line under the viewport that takes plain English. Everything the editor can do is reachable
   from it, and it says what it understood before it does it. ⌘K puts the caret here.

   "rotate anchor cube 40 degrees on z" · "add sphere at x 3 y 2 z -1" · "enable physics on
   selected objects" · "set roughness of chrome sphere to 0.2" · "delete from ram marker post" */
const consoleEl = $('#console'), cmdInput = $('#cmdInput'), cmdSug = $('#cmdSug');
const cmdTyped = $('#cmdTyped'), cmdRest = $('#cmdRest'), cmdEcho = $('#cmdEcho');
$('#cmdIcon').innerHTML = ic('command', { size: 14 });
$('#cmdRun').innerHTML = ic('play', { size: 13 });

/* what the console is allowed to do to the world */
const act = {
  find(nodes) {
    app.select(nodes[0].id);
    nodes.slice(1).forEach(n => app.select(n.id, { additive: true }));
    outliner.revealNode(nodes[0]);
    vp.focusOn(nodes[0]);
    if (!state.autoPopup) popups.openFor(nodes[0]);
  },
  commit(nodes, key) {
    nodes.forEach(n => bus.emit('propchange', { node: n, key, value: n.props[key], src: 'console' }));
    renderInspector();
  },
  add(type, { pos, name } = {}) {
    const n = app.addEntity(type, byId(state.cursorId));
    if (pos) { n.props.pos = pos.slice(); bus.emit('propchange', { node: n, key: 'pos', src: 'console' }); }
    if (name) { n.name = uniqueName(name); bus.emit('treechange'); }
    vp.focusOn(n);
    return n;
  },
  physics(nodes, on) {
    app.setPhysics(nodes, on);
    if (on && state.transport === 'edit') toast('Press <b>Simulate</b> (Alt S) to let them fall');
  },
  isolate(nodes) { app.isolate(nodes.map(n => n.id)); },
  exitIsolation() { app.exitIsolation(); },
  purge(nodes) {
    const t = { geometries: 0, materials: 0, textures: 0, triangles: 0, nodes: 0 };
    const names = nodes.map(n => n.name);
    nodes.forEach(n => {
      const f = app.purge(n);
      if (!f) return;
      t.geometries += f.geometries; t.materials += f.materials;
      t.textures += f.textures; t.triangles += f.triangles; t.nodes += f.nodes;
    });
    if (!t.nodes) return 'Nothing was purged';
    return `Purged <b>${names.join(', ')}</b> — freed ${fmt(t.triangles)} triangles, ${t.geometries} ${t.geometries === 1 ? 'geometry' : 'geometries'}, ${t.materials} materials`;
  },
  remove(nodes) { nodes.forEach(n => app.remove(n)); },
  visible(nodes, v) { nodes.forEach(n => n.vis = v); bus.emit('treechange'); },
  lock(nodes, v) { nodes.forEach(n => n.locked = v); bus.emit('treechange'); },
  rename(node, name) { node.name = uniqueName(name); bus.emit('treechange'); renderInspector(); },
  duplicate(nodes) { nodes.forEach(n => app.duplicate(n)); },
  focus(node) { app.focus(node); },
  frameAll() { vp.frameAll(); state.view = 'persp'; paintViewLabel(); },
  snapView(k) { snapView(k); },
  setTime(h) { setTimeOfDay(h); },
  dayCycle(on) { if (state.dayCycle !== on) todPlay.click(); },
  transport(m) { setTransport(m); },
  pause(p) { setPaused(p); },
  step() { stepFrame(); },
  labels(m) { setLabels(m); },
  autoPopup(on) {
    state.autoPopup = on;
    if (!on) popups.closeAuto();
    else { const n = byId(state.cursorId); if (n && !isFolder(n)) popups.openFor(n, { auto: true }); }
    paintMarkerLabel();
  },
  openSettings(nodes) { nodes.slice(0, 4).forEach(n => popups.openFor(n)); },
  closePopups() { popups.closeAll(); },
  setProp(node, key, value) { setProp(node, key, value, null); renderInspector(); },
  help() { cmdInput.value = ''; openConsole(); paintSug(); },
};

const lang = createLang({ state, act });

/* the editor's own canned commands still live in the list, under the English ones */
function quickCommands() {
  const node = byId(state.cursorId);
  return [
    { label: 'Play — run through a camera', sub: 'transport', run: () => setTransport('play') },
    { label: 'Simulate — run the world', sub: 'transport', run: () => setTransport('simulate') },
    { label: 'Pause / resume', sub: 'transport', run: () => setPaused(!state.paused) },
    { label: 'Step one frame', sub: 'transport', run: () => stepFrame() },
    { label: 'Stop and restore', sub: 'transport', run: () => setTransport('edit') },
    { label: `Realtime viewport: turn ${state.realtime ? 'off' : 'on'}`, sub: 'viewport', run: () => setRealtime(!state.realtime) },
    { label: 'Isolate selection', sub: 'view', run: () => app.toggleIsolateSelection() },
    { label: 'Frame everything', sub: 'view', run: () => vp.frameAll() },
    { label: 'Frame selection', sub: 'view', run: () => app.focus(node) },
    { label: 'Close all popups', sub: 'view', run: () => popups.closeAll() },
    { label: `Settings popup on select: turn ${state.autoPopup ? 'off' : 'on'}`, sub: 'behaviour', run: () => act.autoPopup(!state.autoPopup) },
    { label: `Outliner panel: ${state.docks.left ? 'hide' : 'show'}`, sub: 'layout', run: () => setDock('left', !state.docks.left) },
    { label: `Inspector panel: ${state.docks.right ? 'hide' : 'show'}`, sub: 'layout', run: () => setDock('right', !state.docks.right) },
    { label: 'Layout — both panels', sub: 'layout', run: () => setMode('split') },
    { label: 'Layout — viewport only', sub: 'layout', run: () => setMode('viewport') },
    ...ADDABLE.map(k => ({ label: `Add ${TYPES[k].label}`, sub: 'create', run: () => app.addEntity(k, node) })),
  ];
}

let sugRows = [], sugIndex = 0, ghost = '';
const history = [];
let histAt = -1;

const openConsole = () => consoleEl.classList.add('open', 'on');
const closeSug = () => consoleEl.classList.remove('open');

function paintSug() {
  const text = cmdInput.value;
  sugRows = lang.suggest(text, quickCommands());
  sugIndex = 0;
  ghost = lang.completion(text, sugRows);
  cmdTyped.textContent = text;
  cmdRest.textContent = ghost;
  consoleEl.classList.toggle('bad', !!(text.trim() && sugRows[0] && sugRows[0].bad));
  cmdSug.innerHTML = '';
  if (!sugRows.length) { cmdSug.innerHTML = '<div class="csughead">Nothing matches — try “help”</div>'; return; }
  cmdSug.appendChild(el('div', 'csughead', text.trim() ? 'What this will do' : 'Say something like'));
  sugRows.forEach((r, i) => {
    const row = el('div', `crow2${r.primary ? ' primary' : ''}${r.bad ? ' bad' : ''}${r.danger ? ' danger' : ''}`,
      `${ic(r.icon || 'command', { size: 14, color: r.color })}
       <span class="t">${escape(r.title)}</span>
       <span class="sub">${escape(r.sub || (r.insert ? 'complete' : 'run'))}</span>`);
    row.onmouseenter = () => { sugIndex = i; markSug(); };
    row.onclick = e => { e.preventDefault(); runRow(i); };
    row.onmousedown = e => e.preventDefault();      // keep the caret in the field
    cmdSug.appendChild(row);
  });
  markSug();
}
const markSug = () => cmdSug.querySelectorAll('.crow2').forEach((r, i) => r.classList.toggle('on', i === sugIndex));

function echo(html, bad = false) {
  cmdEcho.innerHTML = html;
  cmdEcho.classList.toggle('err', bad);
  cmdEcho.classList.add('show');
  clearTimeout(echo._t);
  echo._t = setTimeout(() => cmdEcho.classList.remove('show'), 3200);
}

function runRow(i) {
  const row = sugRows[i];
  if (!row) return;
  if (row.insert && !row.run) {          /* a completion, not an action */
    cmdInput.value = row.insert;
    cmdInput.focus();
    paintSug();
    return;
  }
  if (row.bad || !row.run) { echo(row.error || 'I did not understand that', true); return; }
  const said = cmdInput.value.trim();
  let msg;
  try { msg = row.run(); }
  catch (err) { echo(err.message || 'That did not work', true); return; }
  if (said && history[history.length - 1] !== said) history.push(said);
  histAt = -1;
  const text = typeof msg === 'string' ? msg : row.title;
  echo(text);
  toast(text);
  cmdInput.value = '';
  paintSug();
  closeSug();
}

cmdInput.addEventListener('focus', () => { openConsole(); paintSug(); });
cmdInput.addEventListener('blur', () => {
  consoleEl.classList.remove('on', 'bad');
  setTimeout(closeSug, 120);
});
cmdInput.addEventListener('input', () => { openConsole(); paintSug(); });
cmdInput.addEventListener('keydown', e => {
  e.stopPropagation();                                  /* the console owns every key it gets */
  const atEnd = cmdInput.selectionStart === cmdInput.value.length;
  if (e.key === 'Escape') { cmdInput.value = ''; paintSug(); closeSug(); cmdInput.blur(); return; }
  if (e.key === 'Tab' || (e.key === 'ArrowRight' && atEnd && ghost)) {
    if (ghost) { e.preventDefault(); cmdInput.value += ghost; paintSug(); return; }
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!cmdInput.value && history.length) { histAt = Math.max(histAt - 1, -1); cmdInput.value = histAt < 0 ? '' : history[history.length - 1 - histAt]; paintSug(); return; }
    sugIndex = Math.min(sugIndex + 1, sugRows.length - 1); markSug(); scrollSug(); return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!cmdInput.value && history.length) { histAt = Math.min(histAt + 1, history.length - 1); cmdInput.value = history[history.length - 1 - histAt]; paintSug(); return; }
    sugIndex = Math.max(sugIndex - 1, 0); markSug(); scrollSug(); return;
  }
  if (e.key === 'Enter') { e.preventDefault(); runRow(sugIndex); }
});
const scrollSug = () => cmdSug.querySelectorAll('.crow2')[sugIndex]?.scrollIntoView({ block: 'nearest' });
$('#cmdRun').onclick = () => runRow(sugIndex);
$('#cmdKbd').onclick = () => focusConsole();
function focusConsole(seed = null) {
  if (seed != null) cmdInput.value = seed;
  openConsole();
  cmdInput.focus();
  cmdInput.select();
  paintSug();
}

function setLabels(m) {
  state.labelMode = m;
  billboards.setLabelMode(m);
  paintMarkerLabel();
}

/* ── keyboard ──────────────────────────────────────────────────────────────────────────────── */
addEventListener('keydown', e => {
  if (e.target.matches('input, textarea')) return;
  const node = byId(state.cursorId);
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); focusConsole(''); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'd') { e.preventDefault(); app.duplicate(node); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'r') { e.preventDefault(); setRealtime(!state.realtime); return; }
  if (e.altKey && k === 'p') { e.preventDefault(); setTransport(state.transport === 'play' ? 'edit' : 'play'); return; }
  if (e.altKey && k === 's') { e.preventDefault(); setTransport(state.transport === 'simulate' ? 'edit' : 'simulate'); return; }
  if (k === 'p' && !e.altKey && !e.metaKey && !e.ctrlKey) { setPaused(!state.paused); return; }
  if (e.key === '.') { stepFrame(); return; }
  if (e.key === 'Escape') {
    closeSug(); ctx.classList.remove('open');
    if (state.transport !== 'edit') { setTransport('edit'); return; }
    if (isIsolating()) { app.exitIsolation(); return; }
    if (popups.count()) popups.closeAll(); else app.select(null);
    return;
  }
  if (k === 'f') { e.shiftKey ? vp.frameAll() : app.focus(node); return; }
  if (k === 'h' && node) { node.vis = !node.vis; bus.emit('treechange'); return; }
  if (k === 'l' && node) { node.locked = !node.locked; bus.emit('treechange'); return; }
  if (k === 'i') { app.toggleIsolateSelection(); return; }
  if (e.key === '[') { setDock('left', !state.docks.left); return; }
  if (e.key === ']') { setDock('right', !state.docks.right); return; }
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
/* an instrument that moves the sky moves the clock with it */
bus.on('settod', h => setTimeOfDay(h));

function syncTodFromSun() {
  const sun = flat.find(n => n.type === 'sun');
  const h = 6 + (sun.props.azimuth - 90) / 15;
  state.tod = (h + 24) % 24;
  const hh = Math.floor(state.tod), mm = Math.floor((state.tod % 1) * 60);
  $('#todClock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  todSlider._set(state.tod);
}

/* ── view gizmo ────────────────────────────────────────────────────────────────────────────────
   The orb is not decoration: each knob snaps the camera to that axis, dragging the body orbits,
   and a double click frames the world. Front is +Z, right is +X, top is +Y. */
const orb = $('#axisOrb');
const orbHint = $('#orbHint');
const VIEWS = {
  right:  { v: [1, 0, 0],  label: 'X', color: 'var(--ax-x)' },
  left:   { v: [-1, 0, 0], label: '',  color: 'var(--ax-x)', neg: true },
  top:    { v: [0, 1, 0],  label: 'Y', color: 'var(--ax-y)' },
  bottom: { v: [0, -1, 0], label: '',  color: 'var(--ax-y)', neg: true },
  front:  { v: [0, 0, 1],  label: 'Z', color: 'var(--ax-z)' },
  back:   { v: [0, 0, -1], label: '',  color: 'var(--ax-z)', neg: true },
};
function snapView(name) {
  const view = VIEWS[name];
  if (!view) return;
  if (state.transport === 'play') { toast('Stop the run to move the editor camera'); return; }
  vp.snapView(new THREE.Vector3(...view.v));
  state.view = name;
  paintViewLabel();
  toast(`${name[0].toUpperCase() + name.slice(1)} view`);
}
/* The label stops claiming a standard view the moment the camera no longer looks down that axis —
   checked against the camera itself, so it is true however the view was moved. */
const leaveStandardView = () => { if (state.view !== 'persp') { state.view = 'persp'; paintViewLabel(); } };
function auditView(camera, controls) {
  if (state.view === 'persp' || vp.isFlying) return;
  const want = VIEWS[state.view];
  if (!want) return;
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.dot(new THREE.Vector3(...want.v)) < 0.9995) leaveStandardView();
}
const orbEls = Object.entries(VIEWS).map(([name, a]) => {
  const stem = el('div', 'stem');
  stem.style.background = a.color;
  const dot = el('div', `ax${a.neg ? ' neg' : ''}`, a.label);
  dot.style.background = a.color;
  dot.style.color = a.neg ? a.color : '#000';
  dot.title = `${name[0].toUpperCase() + name.slice(1)} view`;
  dot.addEventListener('pointerdown', e => e.stopPropagation());
  dot.addEventListener('click', e => { e.stopPropagation(); snapView(name); });
  dot.addEventListener('pointerenter', () => { orbHint.textContent = name; });
  dot.addEventListener('pointerleave', () => { orbHint.textContent = 'drag to orbit'; });
  orb.append(stem, dot);
  return { stem, dot, a };
});
orbHint.textContent = 'drag to orbit';

/* drag the orb body to orbit the editor camera */
orb.addEventListener('pointerdown', e => {
  if (e.target.closest('.ax') || state.transport === 'play') return;
  orb.setPointerCapture(e.pointerId);
  let last = { x: e.clientX, y: e.clientY };
  const mv = ev => { vp.orbitBy(ev.clientX - last.x, ev.clientY - last.y); last = { x: ev.clientX, y: ev.clientY }; };
  const up = () => { orb.removeEventListener('pointermove', mv); orb.removeEventListener('pointerup', up); };
  orb.addEventListener('pointermove', mv);
  orb.addEventListener('pointerup', up);
});
orb.addEventListener('dblclick', () => { vp.frameAll(); toast('Framed the world'); });

/* ── viewport footer counters ──────────────────────────────────────────────────────────────────
   One row of live numbers: how fast, how heavy, how much of the world you are actually looking
   at. Cells are declared once and only their values are written per frame. */
const statsHost = $('#vpStats');
const STAT_CELLS = [['perf', 'fps'], ['geo', 'tris'], ['ents', 'entities'],
  ['day', 'daylight'], ['phys', 'physics'], ['iso', 'isolated'], ['cam', 'camera', 'opt']];
const STAT_TIPS = {
  perf: 'Frames per second and the time each frame took',
  geo: 'Triangles and draw calls in the last frame, across every pass',
  ents: 'Entities in the world, and how many are visible right now',
  day: 'How much daylight the sun is giving, and its elevation',
  phys: 'Physics bodies, and how many are still moving',
  iso: 'How many entities the isolation set is holding',
  cam: 'Where the editor camera is, and how far it is from what it orbits',
};
const statCells = {};
STAT_CELLS.forEach(([k, label, opt]) => {
  const cell = el('div', `stat${opt ? ' opt' : ''}`, `<span class="lb">${label}</span><span class="vl">—</span>`);
  cell.title = STAT_TIPS[k] || '';
  statsHost.appendChild(cell);
  statCells[k] = { cell, vl: cell.querySelector('.vl') };
});
const setStat = (k, v, sub = '', { show = true, warn = false, dim = false } = {}) => {
  const c = statCells[k];
  if (!c) return;
  c.cell.classList.toggle('hide', !show);
  c.cell.classList.toggle('warn', warn);
  c.vl.classList.toggle('dim', dim);
  const html = sub ? `${v}<span class="sub"> · ${sub}</span>` : String(v);
  if (c.vl.innerHTML !== html) c.vl.innerHTML = html;
};
const fmt = n => n.toLocaleString('en-US');

/* the footer never clips: if the cells no longer fit, they drop their secondary halves first */
function fitStats() {
  const foot = statsHost.parentElement;
  statsHost.classList.remove('lite', 'tight');             /* always measure the roomy layout */
  if (foot.scrollWidth > foot.clientWidth) statsHost.classList.add('lite');    /* camera goes */
  if (foot.scrollWidth > foot.clientWidth) statsHost.classList.add('tight');   /* then the subs */
}
addEventListener('resize', fitStats);

/* the counters that only move when the world does, not every frame */
function paintStats() {
  const ents = flat.filter(n => !isFolder(n));
  const visible = ents.filter(n => effectiveVis(n));
  setStat('ents', ents.length, `${visible.length} visible`);
  const iso = isolatedIds().size;
  setStat('iso', iso, '', { show: iso > 0, warn: true });
  const bodies = ents.filter(n => n.physics);
  const awake = bodies.filter(n => !n.resting).length;
  setStat('phys', bodies.length, bodies.length ? (awake ? `${awake} awake` : 'at rest') : '', { show: bodies.length > 0 });
  fitStats();

}

/* ── physics ───────────────────────────────────────────────────────────────────────────────────
   Not an engine — a believable fall. A body accelerates under gravity, lands on the platform (or
   the sea if it is off the edge), bounces a little and goes to sleep. It only runs while the world
   is running, so the authored scene never drifts, and Stop restores it like everything else. */
const HALF = { cube: 0.5, plane: 0.02, sphere: 0.6, cylinder: 0.5, torus: 0.92 };
const PLATFORM_R = 3.6, PLATFORM_TOP = -0.175;
const restHeight = n => (HALF[n.type] ?? 0.4) * Math.abs(n.props.scale ? n.props.scale[1] : 1);

function stepPhysics(dt) {
  if (dt <= 0) return;
  const bodies = flat.filter(n => n.physics && !isFolder(n) && !n.locked && Array.isArray(n.props.pos));
  if (!bodies.length) return;
  const sea = flat.find(n => n.type === 'water')?.props.level ?? -0.6;
  bodies.forEach(n => {
    const p = n.props.pos;
    const onPlatform = Math.hypot(p[0], p[2]) < PLATFORM_R;
    const floor = (onPlatform ? PLATFORM_TOP : sea) + restHeight(n);
    n.vel = (n.vel || 0) - state.gravity * dt;
    p[1] = +(p[1] + n.vel * dt).toFixed(4);
    if (p[1] <= floor) {
      p[1] = floor;
      if (Math.abs(n.vel) > 0.8) { n.vel = -n.vel * 0.34; n.resting = false; }   /* bounce */
      else { n.vel = 0; n.resting = true; }
    } else n.resting = false;
    bus.emit('propchange', { node: n, key: 'pos', value: p, src: 'physics' });
  });
}

/* ── frame loop ────────────────────────────────────────────────────────────────────────────── */
let lastTod = 0;
vp.start(({ fps, dt, camera, controls, dayFactor, playing }) => {
  if (dt > 0 && dayClockRunning()) setTimeOfDay(state.tod + dt * sunNode().props.rate / 600);
  if (dt > 0 && state.transport !== 'edit') stepPhysics(dt);

  billboards.update();
  popups.update(billboards);

  /* axis orb — always shows where the editor camera is looking */
  const orbCam = vp.camera;
  orbEls.forEach(({ stem, dot, a }) => {
    const v = new THREE.Vector3(...a.v).applyQuaternion(orbCam.quaternion.clone().invert());
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

  auditView(vp.camera, controls);

  /* footer counters, four times a second — writing them every frame would cost more than the frame */
  if (performance.now() - lastTod > 250) {
    lastTod = performance.now();
    const r = vp.renderInfo;
    setStat('perf', fps.toFixed(0), `${(1000 / Math.max(fps, 1)).toFixed(1)} ms`, { warn: fps < 24 });
    setStat('geo', fmt(r.triangles), `${fmt(r.calls)} draws`);
    setStat('day', `${(dayFactor * 100).toFixed(0)}%`, `${sunNode().props.elevation.toFixed(0)}°`);
    if (flat.some(n => n.physics)) paintStats();      /* the awake count changes while bodies fall */
    fitStats();

    const p = camera.position;
    setStat('cam', playing ? `through ${byId(state.playCamId)?.name || 'camera'}`
      : `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
    playing ? '' : `${camera.position.distanceTo(controls.target).toFixed(1)} m`, { dim: true });
  }
});

/* the aspect mask has to follow the stage, whatever changes its size */
addEventListener('resize', () => { if (state.transport === 'play') applyGate(byId(state.playCamId)); });

/* ── boot ──────────────────────────────────────────────────────────────────────────────────── */
setTimeOfDay(7.4);
vp.applyAll();
outliner.render();
setDock('left', true);
setDock('right', true);
app.select(flat.find(n => n.name === 'Anchor Cube').id);
billboards.setLabelMode('hover');
renderIsolationBanner();
updateTransport();
setTimeout(() => toast('Click a billboard to select · click again for settings'), 700);

/* a tiny handle for automation, embedding and console poking */
window.frontier = {
  state, app, setTimeOfDay, vp, popups, outliner, billboards, world: { flat, scene },
  setTransport, setPaused, setRealtime, stepFrame, snapView, setMode, setDock,
  lang, focusConsole,
  /* run a line of English exactly as if it were typed into the console */
  run(text) { const p = lang.parse(text); if (!p) return null; if (!p.ok) { echo(p.error, true); return p; } const msg = p.run(); echo(typeof msg === 'string' ? msg : p.title); toast(typeof msg === 'string' ? msg : p.title); return p; },
};
