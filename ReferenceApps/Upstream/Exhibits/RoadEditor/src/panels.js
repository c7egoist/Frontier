/* ════════════════════════════════════════════════════════════════════
   panels.js — Exhibits control builders + left panel + inspector + toolbars.
   Rebuilds panels on committed edits; live drags only refresh metrics/status
   so text focus is never stolen.
   ════════════════════════════════════════════════════════════════════ */
import {
  createIcons, Route, Spline, Waypoints, Milestone, Ruler, Gauge, TrendingUp,
  ArrowUpDown, Mountain, MountainSnow, Layers, Link2, Unlink, CircleDot, Eye,
  EyeOff, Plus, Copy, Trash2, Pencil, Save, FolderOpen, Upload, FileJson, Image,
  Table, Camera, Flag, Move, Hash, Info, TriangleAlert, Check, X, ChevronDown,
  Crosshair, Palette, OctagonX, RefreshCcw,
  Map as MapIcon, Box, Columns2, Undo2, Redo2, Download,
  Keyboard, MousePointer2, PenLine, Hand, Grid3x3, Magnet, Maximize, Orbit,
  Scan, Triangle, Rotate3d, Car, LocateFixed, Pause, Play, Square
} from 'lucide';
import {roadById, linkForPoint, effectivePoints, setPointPosition} from './state.js';
import {kindLabel, sampleAtStation, planOverpassBridge} from './topology.js';
import {SURFACES, SURFACE_IDS, CENTER_MARKINGS, baseWidth, roadNetworkToOBJ, countProjectTriangles} from './geometry.js';
import {allocId, defaultRoad, serializeProject, centerlineCSV, downloadText} from './io.js';

const ICONS = {
  Route, Spline, Waypoints, Milestone, Ruler, Gauge, TrendingUp, ArrowUpDown,
  Mountain, MountainSnow, Layers, Link2, Unlink, CircleDot, Eye, EyeOff, Plus,
  Copy, Trash2, Pencil, Save, FolderOpen, Upload, FileJson, Image, Table, Camera,
  Flag, Move, Hash, Info, TriangleAlert, Check, X, ChevronDown, Crosshair, Palette,
  OctagonX, RefreshCcw,
  Map: MapIcon, Box, Columns2, Undo2, Redo2, Download, Keyboard, MousePointer2,
  PenLine, Hand, Grid3x3, Magnet, Maximize, Orbit, Scan, Triangle, Rotate3d, Car,
  LocateFixed, Pause, Play, Square
};
const refreshIcons = () => { try { createIcons({icons: ICONS}); } catch (e) { console.error(e); } };

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
const fmtLen = (m) => (!Number.isFinite(m) ? '—' : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(m < 100 ? 1 : 0)} m`);

function h(tag, cls, parent, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  if (parent) parent.appendChild(el);
  return el;
}

export const SAMPLES = [
  {key: 'diamond-interchange', name: 'Diamond Interchange', sub: 'Overpass · ramps · bridges'},
  {key: 'mountain-pass', name: 'Alpine Descent', sub: 'Hairpins · guardrails · grades'},
  {key: 'quarry-haul', name: 'Quarry Haul Road', sub: 'Wide gravel · switchbacks'},
  {key: 'village-loop', name: 'Village Loop', sub: 'Closed loop · junctions'}
];

export function createPanels(store, api) {
  const $ = (id) => document.getElementById(id);
  const leftPanel = $('left-panel'), inspector = $('inspector');
  const metricsEl = $('metrics'), statusEl = $('statusbar');
  const collapsed = new Map();
  let toastTimer = 0;
  let menuCloser = null;

  /* ── toast + menus ──────────────────────────────────────────── */
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => (t.hidden = true), 220); }, 3200);
  }

  function closeMenu() {
    $('export-menu').hidden = true;
    $('popup-menu').hidden = true;
    document.querySelectorAll('.dropdown.open').forEach((d) => d.classList.remove('open'));
    if (menuCloser) { menuCloser(); menuCloser = null; }
  }

  function openMenu(el, anchor, build) {
    closeMenu();
    el.innerHTML = '';
    build(el);
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    const mw = el.offsetWidth, mh = el.offsetHeight;
    let left = Math.min(window.innerWidth - mw - 10, Math.max(10, r.left));
    let top = r.bottom + 8;
    if (top + mh > window.innerHeight - 10) top = Math.max(10, r.top - mh - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    refreshIcons();
    const onDown = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    const onScroll = () => closeMenu();
    setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', onScroll);
    }, 0);
    menuCloser = () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
    };
  }

  const menuItem = (parent, {icon, label, sub, selected, fn}) => {
    const it = h('div', 'mi' + (selected ? ' sel' : ''), parent);
    it.innerHTML = `${icon ? `<i data-lucide="${icon}"></i>` : ''}<span class="ml">${label}${sub ? `<small>${sub}</small>` : ''}</span>${selected ? '<span class="radio"></span>' : ''}`;
    it.onclick = (e) => { e.stopPropagation(); closeMenu(); fn?.(); };
    return it;
  };

  /* ── Exhibits control builders ──────────────────────────────── */
  // Number pill with focus-armed checkpointing (no-op focus/blur leaves no history).
  function numBox({value, step = 1, unit = '', min, max, wide = false, onchange, oninput, disabled = false}) {
    const box = h('div', 'valuebox' + (wide ? ' wide' : ''));
    const numEl = h('div', 'num', box);
    const input = h('input', '', numEl);
    input.type = 'number';
    input.value = Number.isFinite(value) ? +value.toFixed(4) : 0;
    if (step) input.step = step;
    if (min != null) input.min = min;
    if (max != null) input.max = max;
    input.disabled = disabled;
    if (unit) h('div', 'unitseg', box, unit);
    let armed = false;
    input.addEventListener('focus', () => { store.checkpoint('edit value'); armed = true; input.select(); });
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) return;
      const c = min != null && max != null ? Math.min(max, Math.max(min, v)) : v;
      store.transient(() => oninput(c));
    });
    input.addEventListener('change', () => {
      if (armed) { armed = false; store.endGesture(); }
      onchange?.();
    });
    input.addEventListener('blur', () => { if (armed) { armed = false; store.endGesture(); } });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.blur(); }
      e.stopPropagation();
    });
    return {box, input, set(v) { if (document.activeElement !== input) input.value = +v.toFixed(4); }};
  }

  function textBox({value, onchange, placeholder = ''}) {
    const box = h('div', 'valuebox wide');
    const numEl = h('div', 'num', box);
    const input = h('input', '', numEl);
    input.type = 'text'; input.value = value; input.placeholder = placeholder;
    input.style.textAlign = 'left';
    let armed = false;
    input.addEventListener('focus', () => { store.checkpoint('rename'); armed = true; input.select(); });
    input.addEventListener('input', () => store.transient(() => onchange(input.value)));
    input.addEventListener('change', () => { if (armed) { armed = false; store.endGesture(); } });
    input.addEventListener('blur', () => { if (armed) { armed = false; store.endGesture(); } });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); });
    return box;
  }

  function sliderRow(parent, label, {min, max, step, unit, value, fmt: f = (v) => v, oninput}) {
    const row = h('div', 'slider-row', parent);
    h('label', '', row, label);
    const nb = numBox({value, step, unit, min, max, oninput});
    row.appendChild(nb.box);
    const track = h('div', 'slider', row, '<div class="fill"></div><div class="knob"></div>');
    const fill = track.querySelector('.fill'), knob = track.querySelector('.knob');
    const paint = (v) => {
      const t = (v - min) / (max - min);
      fill.style.width = `${t * 100}%`;
      knob.style.left = `${t * 100}%`;
      nb.set(v);
    };
    paint(value);
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      track.setPointerCapture(e.pointerId);
      store.checkpoint('adjust ' + label.toLowerCase());
      const set = (ev) => {
        const r = track.getBoundingClientRect();
        let v = min + (Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))) * (max - min);
        v = Math.round(v / step) * step;
        v = Math.min(max, Math.max(min, +v.toFixed(5)));
        store.transient(() => oninput(v));
        paint(v);
      };
      set(e);
      const mv = (ev) => set(ev);
      const up = () => {
        track.removeEventListener('pointermove', mv);
        track.removeEventListener('pointerup', up);
        store.endGesture();
      };
      track.addEventListener('pointermove', mv);
      track.addEventListener('pointerup', up);
    });
    return {paint};
  }

  function segRow(parent, label, options, value, onselect) {
    const row = h('div', 'ctl-row', parent);
    h('label', '', row, label);
    const seg = h('div', 'segment', row);
    for (const o of options) {
      const b = h('div', 'seg-opt' + (o.value === value ? ' sel' : ''), seg, o.label);
      b.title = o.title || '';
      b.onclick = () => {
        if (o.value === value) return;
        store.commit('set ' + label.toLowerCase(), () => onselect(o.value));
      };
    }
  }

  function switchRow(parent, label, value, ontoggle, icon) {
    const row = h('div', 'ctl-row', parent);
    h('label', '', row, (icon ? `<i data-lucide="${icon}" style="width:11px;height:11px;vertical-align:-1px"></i> ` : '') + label);
    const grow = h('div', 'grow', row);
    grow.style.display = 'flex';
    grow.style.justifyContent = 'flex-end';
    const sw = h('div', 'switch' + (value ? ' on' : ''), grow, '<div class="nub"></div>');
    sw.onclick = () => store.commit('toggle ' + label.toLowerCase(), () => ontoggle(!value));
  }

  function dropdownRow(parent, label, options, value, onselect) {
    const row = h('div', 'ctl-row', parent);
    h('label', '', row, label);
    const dd = h('div', 'dropdown', row);
    const cur = options.find((o) => o.value === value);
    dd.innerHTML = `<div class="dd-head"><span class="cur">${cur ? cur.label : '—'}</span><span class="caret"><i data-lucide="chevron-down"></i></span></div>`;
    dd.querySelector('.dd-head').onclick = (e) => {
      e.stopPropagation();
      dd.classList.add('open');
      openMenu($('popup-menu'), dd, (menu) => {
        for (const o of options) {
          menuItem(menu, {
            icon: o.icon, label: o.label, sub: o.sub, selected: o.value === value,
            fn: () => {
              if (o.value !== value) store.commit('set ' + label.toLowerCase(), () => onselect(o.value));
            }
          });
        }
      });
    };
  }

  function colorRow(parent, label, hex, onpick) {
    const row = h('div', 'ctl-row', parent);
    h('label', '', row, label);
    const bar = h('div', 'colorbar', row);
    bar.innerHTML = `<div class="swatchseg"><div class="circle" style="background:${hex}"></div><div class="cname">${hex}</div></div><div class="caret"><i data-lucide="chevron-down"></i></div>`;
    const native = h('input', '', row);
    native.type = 'color';
    native.value = hex;
    native.style.display = 'none';
    let armed = false;
    bar.onclick = () => { armed = false; native.click(); };
    native.addEventListener('input', () => {
      if (!armed) { store.checkpoint('set colour'); armed = true; }
      store.transient(() => onpick(native.value));
    });
    native.addEventListener('change', () => { if (armed) { armed = false; store.endGesture(); } });
  }

  function actionBtn(parent, label, icon, fn, kind = '') {
    const b = h('button', 'btn ' + kind, parent, `<i data-lucide="${icon}"></i>${label}`);
    b.onclick = fn;
    return b;
  }

  function section(parent, id, title, icon, body, {collapsible = true, startOpen = true} = {}) {
    const s = h('div', 'prop-section', parent);
    const t = h('div', 'prop-title' + (collapsible ? ' foldable' : ''), s,
      `${icon ? `<i data-lucide="${icon}"></i>` : ''}${title}${collapsible ? '<i data-lucide="chevron-down" class="chev"></i>' : ''}`);
    const c = h('div', 'prop-content', s);
    body(c);
    const isCollapsed = collapsible && (collapsed.has(id) ? collapsed.get(id) : !startOpen);
    const apply = () => {
      t.classList.toggle('collapsed', isCollapsed);
      c.style.maxHeight = isCollapsed ? '0' : `${c.scrollHeight + 40}px`;
    };
    if (collapsible) {
      if (isCollapsed) t.classList.add('collapsed');
      t.onclick = () => {
        const now = !t.classList.contains('collapsed');
        t.classList.toggle('collapsed', now);
        collapsed.set(id, now);
        c.style.maxHeight = now ? '0' : `${c.scrollHeight + 40}px`;
      };
      requestAnimationFrame(apply);
    }
    return {sec: s, content: c};
  }

  const kv = (parent, k, v) => h('div', 'kv', parent, `<span class="k">${k}</span><span class="v">${v}</span>`);

  /* ── road / junction mutations ────────────────────────────────── */
  function pruneJunctions(p) {
    p.junctions = (p.junctions || []).filter((j) => (j.links || []).length >= 2);
  }

  function deleteRoad(id) {
    store.commit('delete road', (p) => {
      p.roads = p.roads.filter((r) => r.id !== id);
      for (const j of p.junctions || []) j.links = (j.links || []).filter((l) => l.road !== id);
      pruneJunctions(p);
    });
    store.select({kind: null});
    toast('Road deleted — Ctrl+Z restores it');
  }

  function duplicateRoad(id) {
    const src = roadById(store.project, id);
    if (!src) return;
    const nid = allocId(store.project, 'r');
    store.commit('duplicate road', (p) => {
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = nid;
      copy.name = `${src.name} copy`;
      copy.points = copy.points.map((q) => ({...q, x: q.x + 6, z: q.z + 6}));
      p.roads.push(copy);
    });
    store.select({kind: 'road', roadId: nid});
  }

  function deletePoint(roadId, index) {
    const road = roadById(store.project, roadId);
    if (!road || !road.points[index]) return;
    store.commit('delete point', (p) => {
      const r = roadById(p, roadId);
      r.points.splice(index, 1);
      if (r.closed && r.points.length < 3) r.closed = false;
      for (const j of p.junctions || []) j.links = (j.links || []).filter((l) => l.road !== roadId);
      pruneJunctions(p);
    });
    const left = roadById(store.project, roadId)?.points.length || 0;
    store.select(left ? {kind: 'road', roadId} : {kind: null});
  }

  function unweldPoint(roadId, index) {
    store.commit('unweld point', (p) => {
      for (const j of p.junctions || []) j.links = (j.links || []).filter((l) => l.road !== roadId);
      pruneJunctions(p);
    });
    toast('Endpoint unwelded from its junction');
  }

  function toggleIntersection(id, off) {
    store.commit(off ? 'enable intersection' : 'disable intersection', (pp) => {
      pp.intersectionOverrides = pp.intersectionOverrides || {};
      pp.intersectionOverrides[id] = {enabled: off};
    });
  }

  function deleteSelection(shift) {
    const sel = store.selection;
    if (shift && sel.roadId) { deleteRoad(sel.roadId); return; }
    if (sel.kind === 'point') deletePoint(sel.roadId, sel.index);
    else if (sel.kind === 'road') deleteRoad(sel.roadId);
    else if (sel.kind === 'junction') {
      store.commit('delete junction', (p) => {
        p.junctions = (p.junctions || []).filter((j) => j.id !== sel.junctionId);
      });
      store.select({kind: null});
      toast('Junction removed — endpoints keep their positions');
    }
  }

  function smoothRoad(road) {
    store.commit('smooth grades', (p) => {
      const r = roadById(p, road.id);
      const ys = r.points.map((q) => q.y);
      for (let pass = 0; pass < 2; pass++) {
        const next = ys.slice();
        for (let i = 1; i < ys.length - 1; i++) next[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
        for (let i = 0; i < ys.length; i++) ys[i] = next[i];
      }
      r.points.forEach((q, i) => { q.y = +ys[i].toFixed(2); });
      // Welded ends follow their junctions back into agreement.
      for (const j of p.junctions || []) {
        for (const l of j.links || []) {
          if (l.road !== r.id) continue;
          const idx = l.end === 'start' ? 0 : r.points.length - 1;
          if (r.points[idx]) j.y = r.points[idx].y;
        }
      }
    });
    toast('Grades smoothed');
  }

  function drapeRoad(road) {
    const t = api.getTerrain();
    if (!t) { toast('Import a heightmap or grow demo hills first'); return; }
    store.commit('drape to terrain', (p) => {
      const r = roadById(p, road.id);
      let n = 0;
      r.points.forEach((q, i) => {
        const gv = t.sample(q.x, q.z);
        if (gv == null) return;
        const y = +(gv + (r.drapeOffset || 0)).toFixed(2);
        setPointPosition(p, r.id, i, undefined, undefined, y);
        n++;
      });
      if (!n) toast('No points inside the terrain bounds');
      else toast(`Draped ${n} point${n === 1 ? '' : 's'} to terrain`);
    });
  }

  function reverseRoad(road) {
    store.commit('reverse direction', (p) => {
      const r = roadById(p, road.id);
      r.points.reverse();
      for (const j of p.junctions || []) {
        for (const l of j.links || []) {
          if (l.road === r.id) l.end = l.end === 'start' ? 'end' : 'start';
        }
      }
    });
  }

  /* ── LEFT PANEL ───────────────────────────────────────────────── */
  function renderLeft() {
    leftPanel.innerHTML = '';
    const wrap = h('div', 'panel-scroll', leftPanel);
    const p = store.project;

    section(wrap, 'project', 'Project', 'folder-open', (c) => {
      h('div', 'ctl-label', c, 'Name');
      c.appendChild(textBox({
        value: p.name,
        onchange: (v) => { store.project.name = v; }
      }));
      const row = h('div', 'btn-row', c);
      actionBtn(row, 'New', 'plus', () => api.newProject());
      actionBtn(row, 'Open', 'upload', () => $('file-road').click());
      actionBtn(row, 'Save', 'save', () => api.saveProjectFile());
      kv(c, 'Format', 'frontier-road-network · v1');
      kv(c, 'Units', 'metres · Y-up');
      kv(c, 'Autosave', api.autosaveNote());
    });

    section(wrap, 'roads', `Roads · ${p.roads.length}`, 'route', (c) => {
      if (!p.roads.length) h('div', 'empty-note', c, 'No roads yet.<br>Draw one on the plan (D).');
      for (const road of p.roads) {
        const smp = api.getSamples(road.id);
        const it = h('div', 'road-item' + (store.selection.roadId === road.id ? ' sel' : ''), c);
        it.innerHTML = `<span class="dot" style="background:${road.color}"></span>
          <span class="meta"><span class="name">${road.name}${road.closed ? '<span class="loop-tag">LOOP</span>' : ''}</span>
          <span class="sub">${smp ? fmtLen(smp.length) : '—'} · ${road.points.length} pts · ${road.lanes}×${fmt(road.laneWidth, 1)} m</span></span>
          <span class="acts"></span>`;
        it.title = 'Click to select · double-click to rename';
        it.onclick = () => store.select({kind: 'road', roadId: road.id});
        it.ondblclick = (e) => {
          e.stopPropagation();
          const nameEl = it.querySelector('.name');
          const cur = road.name;
          nameEl.innerHTML = '';
          const inp = h('input', '', nameEl);
          inp.type = 'text'; inp.value = cur;
          inp.onclick = (ev) => ev.stopPropagation();
          inp.onkeydown = (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') inp.blur();
            if (ev.key === 'Escape') { inp.value = cur; inp.blur(); }
          };
          inp.onchange = () => {
            const v = inp.value.trim() || cur;
            if (v !== cur) store.commit('rename road', (pp) => { roadById(pp, road.id).name = v; });
            else renderLeft();
          };
          inp.focus(); inp.select();
        };
        const acts = it.querySelector('.acts');
        const eye = h('button', 'mini-btn' + (road.visible === false ? ' off' : ''), acts,
          `<i data-lucide="${road.visible === false ? 'eye-off' : 'eye'}"></i>`);
        eye.title = road.visible === false ? 'Show' : 'Hide';
        eye.onclick = (e) => {
          e.stopPropagation();
          store.commit('toggle visibility', (pp) => { roadById(pp, road.id).visible = road.visible === false; });
        };
        const dup = h('button', 'mini-btn', acts, '<i data-lucide="copy"></i>');
        dup.title = 'Duplicate';
        dup.onclick = (e) => { e.stopPropagation(); duplicateRoad(road.id); };
        const del = h('button', 'mini-btn', acts, '<i data-lucide="trash-2"></i>');
        del.title = 'Delete road';
        del.onclick = (e) => { e.stopPropagation(); deleteRoad(road.id); };
      }
      actionBtn(c, 'Draw a road', 'pen-line', () => {
        const id = allocId(store.project, 'r');
        const n = store.project.roads.length + 1;
        store.commit('add road', (pp) => { pp.roads.push(defaultRoad(id, n)); });
        store.select({kind: 'road', roadId: id});
        store.setTool('draw');
        toast('Click the plan to lay points · Enter finishes');
      }, 'primary');
    });

    section(wrap, 'intersections', `Intersections · ${api.getTopology().intersections.length}`, 'network', (c) => {
      const topo = api.getTopology();
      const all = [...topo.intersections, ...topo.disabled];
      if (!all.length && !topo.overpasses.length && !topo.bridges.length) {
        h('div', 'ctl-hint', c, 'Cross roads at grade for a paved junction · separate heights for an overpass · flag points to span a bridge.');
      }
      sliderRow(c, 'Corner radius', {min: 2, max: 14, step: 0.5, unit: 'm', value: p.settings?.cornerRadius ?? 6,
        oninput: (v) => {
          store.project.settings = store.project.settings || {};
          store.project.settings.cornerRadius = v;
        }});
      for (const ix of all) {
        const off = topo.disabled.includes(ix);
        const names = ix.roads.map((id) => roadById(p, id)?.name || id).join(' × ');
        const it = h('div', 'junc-item', c);
        if (off) it.style.opacity = '.45';
        it.innerHTML = `<span class="dia"></span><span class="meta"><span class="name">${kindLabel(ix.kind)} <small>· ${ix.legs.length} legs</small></span><span class="sub">${names}</span></span><span class="acts"></span>`;
        it.title = 'Click to zoom';
        it.onclick = () => api.gotoPoint(ix.x, ix.z);
        const eye = h('button', 'mini-btn' + (off ? ' off' : ''), it.querySelector('.acts'),
          `<i data-lucide="${off ? 'eye-off' : 'eye'}"></i>`);
        eye.title = off ? 'Enable' : 'Disable (roads render uncut)';
        eye.onclick = (e) => { e.stopPropagation(); toggleIntersection(ix.id, off); };
      }
      for (const o of topo.overpasses) {
        const un = roadById(p, o.upper)?.name || o.upper, ln = roadById(p, o.lower)?.name || o.lower;
        const it = h('div', 'junc-item', c);
        it.innerHTML = `<span class="dia"></span><span class="meta"><span class="name">Overpass <small>· ${o.gap.toFixed(1)} m</small></span><span class="sub">${un} over ${ln}</span></span><span class="acts"></span>`;
        it.title = 'Click to zoom';
        it.onclick = () => api.gotoPoint(o.x, o.z);
        const bb = h('button', 'mini-btn', it.querySelector('.acts'), '<i data-lucide="landmark"></i>');
        bb.title = 'Build a bridge span over the lower road';
        bb.onclick = (e) => {
          e.stopPropagation();
          const plan = planOverpassBridge(store.project, api.getSampleMap(), api.getTopology(), o.id);
          if (plan.error) { api.toast(plan.error); return; }
          store.commit('Bridge overpass', () => {
            const road = roadById(store.project, plan.roadId);
            for (const ins of plan.inserts) {
              road.points.splice(Math.min(ins.index, road.points.length), 0, {...ins.point});
            }
            for (const f of plan.flags) if (road.points[f]) road.points[f].bridge = true;
          });
          api.toast(`Bridge span planted on ${roadById(store.project, plan.roadId)?.name || 'road'}`);
        };
      }
      for (const b of topo.bridges) {
        const r = roadById(p, b.roadId);
        const it = h('div', 'junc-item', c);
        it.innerHTML = `<span class="dia"></span><span class="meta"><span class="name">Bridge <small>· ${(b.s1 - b.s0).toFixed(0)} m</small></span><span class="sub">${r?.name || b.roadId}</span></span>`;
        it.title = 'Click to zoom';
        it.onclick = () => {
          const smp = api.getSamples(b.roadId);
          const st = smp && sampleAtStation(smp.samples, (b.s0 + b.s1) / 2);
          if (st) api.gotoPoint(st.x, st.z);
        };
      }
    });

    section(wrap, 'terrain', 'Terrain', 'mountain', (c) => {
      const t = api.getTerrain();
      if (!t) {
        h('div', 'ctl-hint', c, 'Flat world. Import a <b>heightmap PNG</b> (white = high) or grow <b>demo hills</b> to drape roads onto ground.');
      } else {
        kv(c, 'Source', t.name);
        kv(c, 'Grid', `${t.w} × ${t.h}`);
        kv(c, 'Height', `${fmt(t.minY, 1)} … ${fmt(t.maxY, 1)} m`);
        if (t.image) {
          const img = h('img', 'hm-preview', c);
          img.src = t.image;
          img.alt = 'Heightmap preview';
        }
      }
      const row = h('div', 'btn-row', c);
      actionBtn(row, 'Import PNG', 'image', () => $('file-height').click());
      actionBtn(row, 'Demo hills', 'mountain-snow', () => api.makeDemoHills());
      if (t) actionBtn(c, 'Remove terrain', 'trash-2', () => api.clearTerrain());
    });

    section(wrap, 'junctions', `Junctions · ${(p.junctions || []).length}`, 'waypoints', (c) => {
      if (!(p.junctions || []).length) {
        h('div', 'ctl-hint', c, 'Drag one road <b>endpoint</b> onto another — they weld into a shared junction node. <b>Both roads keep their own lanes and markings.</b>');
      }
      for (const j of p.junctions || []) {
        const it = h('div', 'junc-item' + (store.selection.junctionId === j.id ? ' sel' : ''), c);
        const linkNames = (j.links || []).map((l) => {
          const r = roadById(p, l.road);
          return r ? `${r.name} ${l.end === 'start' ? 'Ⓐ' : 'Ⓑ'}` : '?';
        }).join(' · ');
        it.innerHTML = `<span class="dia"></span><span class="meta"><span class="name">${j.name || j.id}</span><span class="sub">${linkNames || 'no links'}</span></span>`;
        it.onclick = () => {
          store.select({kind: 'junction', junctionId: j.id});
          api.gotoPoint(j.x, j.z);
        };
      }
    });

    section(wrap, 'samples', 'Samples', 'flag', (c) => {
      for (const s of SAMPLES) {
        const b = h('button', 'sample-card', c,
          `<i data-lucide="milestone"></i><span><b>${s.name}</b><span>${s.sub}</span></span>`);
        b.onclick = () => api.loadSample(s.key);
      }
    }, {startOpen: false});

    section(wrap, 'about', 'About', 'info', (c) => {
      h('div', 'ctl-hint', c, 'Spline centreline editor. Exports <b>.road.json</b> (reloadable), <b>.obj</b> mesh, <b>.csv</b> stations and <b>.png</b> captures. Engine loader lives in <b>integration/</b>.');
    }, {startOpen: false});

    refreshIcons();
  }

  /* ── INSPECTOR ────────────────────────────────────────────────── */
  function roadStats(c, road) {
    const smp = api.getSamples(road.id);
    if (!smp || !smp.count) {
      h('div', 'empty-note', c, 'Add at least 2 points to sample this road.');
      return;
    }
    kv(c, 'Length', fmtLen(smp.length));
    kv(c, 'Width', `${fmt(baseWidth(road), 1)} m`);
    kv(c, 'Min radius', Number.isFinite(smp.minRadius) ? `${fmt(smp.minRadius, 1)} m` : 'straight');
    kv(c, 'Max grade', `${fmt((smp.maxGrade || 0) * 100, 1)}%`);
  }

  function renderInspector() {
    inspector.innerHTML = '';
    const wrap = h('div', 'panel-scroll', inspector);
    const sel = store.selection;
    const p = store.project;
    const road = sel.roadId ? roadById(p, sel.roadId) : null;

    // Issues always on top when present.
    const issues = api.getIssues();
    if (issues.length) {
      const errs = issues.filter((i) => i.severity === 'error').length;
      const warns = issues.filter((i) => i.severity === 'warn').length;
      const s = section(wrap, 'issues', `Issues · ${errs} errors ${warns} warnings`, 'triangle-alert', (c) => {
        for (const it of issues.slice(0, 30)) {
          const r = h('div', `issue-row ${it.severity}`, c,
            `<i data-lucide="${it.severity === 'error' ? 'octagon-x' : it.severity === 'warn' ? 'triangle-alert' : 'info'}"></i><span><span class="msg">${it.message}</span><br><span class="loc">${it.x != null ? `(${fmt(it.x, 1)}, ${fmt(it.z, 1)})` : ''}</span></span>`);
          r.onclick = () => api.gotoIssue(it);
        }
        if (issues.length > 30) h('div', 'empty-note', c, `…and ${issues.length - 30} more`);
      });
      s.sec.classList.add('alert');
    }

    if (!road) {
      const j = sel.kind === 'junction' ? (p.junctions || []).find((q) => q.id === sel.junctionId) : null;
      if (j) {
        section(wrap, 'junc', 'Junction', 'waypoints', (c) => {
          h('div', 'ctl-label', c, 'Name');
          c.appendChild(textBox({value: j.name || j.id, onchange: (v) => {
            const jj = store.project.junctions.find((q) => q.id === j.id);
            if (jj) jj.name = v;
          }}));
          const row = h('div', 'ctl-row', c);
          h('label', '', row, 'Position');
          const grow = h('div', 'grow', row);
          grow.style.cssText = 'display:flex;gap:6px;';
          for (const [ax, key, unit] of [['X', 'x', 'm'], ['Z', 'z', 'm'], ['Y', 'y', 'm']]) {
            const cell = h('div', 'valuebox', grow);
            cell.style.flex = '1';
            cell.innerHTML = `<div class="axisseg">${ax}</div><div class="num"><input type="number" step="0.5"></div>`;
            const inp = cell.querySelector('input');
            inp.value = +j[key].toFixed(3);
            let armed = false;
            inp.addEventListener('focus', () => { store.checkpoint('move junction'); armed = true; });
            inp.addEventListener('input', () => {
              const v = parseFloat(inp.value);
              if (!Number.isFinite(v)) return;
              store.transient((pp) => {
                const jj = pp.junctions.find((q) => q.id === j.id);
                if (jj) jj[key] = v;
              });
            });
            inp.addEventListener('change', () => { if (armed) { armed = false; store.endGesture(); } });
            inp.addEventListener('blur', () => { if (armed) { armed = false; store.endGesture(); } });
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
          }
          h('div', 'ctl-label', c, `Links · ${j.links.length}`);
          for (const l of j.links || []) {
            const r = roadById(p, l.road);
            kv(c, r ? r.name : '(deleted)', l.end === 'start' ? 'start Ⓐ' : 'end Ⓑ');
          }
          const br = h('div', 'btn-row', c);
          actionBtn(br, 'Zoom to', 'crosshair', () => api.gotoPoint(j.x, j.z));
          actionBtn(br, 'Unweld all', 'unlink', () => {
            store.commit('delete junction', (pp) => {
              pp.junctions = pp.junctions.filter((q) => q.id !== j.id);
            });
            store.select({kind: null});
          }, 'danger');
        });
      } else {
        section(wrap, 'none', 'Inspector', 'crosshair', (c) => {
          h('div', 'empty-note', c, 'Select a road, a control point, or a junction to edit it here.');
          h('div', 'ctl-hint', c, '<b>V</b> select · <b>D</b> draw · <b>Alt+click</b> insert point · <b>double-click</b> extend · <b>Del</b> remove.');
        });
      }
      refreshIcons();
      return;
    }

    /* — road section — */
    section(wrap, 'road', 'Road', 'route', (c) => {
      h('div', 'ctl-label', c, 'Name');
      c.appendChild(textBox({
        value: road.name,
        onchange: (v) => { roadById(store.project, road.id).name = v; }
      }));
      colorRow(c, 'Colour', road.color, (v) => { roadById(store.project, road.id).color = v; });
      switchRow(c, 'Visible', road.visible !== false, (v) => { roadById(store.project, road.id).visible = v; }, 'eye');
      switchRow(c, 'Closed loop', !!road.closed, (v) => {
        const r = roadById(store.project, road.id);
        if (v && r.points.length < 3) { toast('A loop needs at least 3 points'); return; }
        r.closed = v;
        if (v) {
          // Closing drops end welds (loops have no ends).
          for (const j of store.project.junctions || []) j.links = (j.links || []).filter((l) => l.road !== r.id);
          pruneJunctions(store.project);
        }
      }, 'refresh-ccw');
      dropdownRow(c, 'Surface', SURFACE_IDS.map((id) => ({value: id, label: SURFACES[id].label})), road.surface,
        (v) => { roadById(store.project, road.id).surface = v; });
      roadStats(c, road);
    });

    section(wrap, 'xsec', 'Cross-section', 'spline', (c) => {
      sliderRow(c, 'Lanes', {min: 1, max: 6, step: 1, unit: '', value: road.lanes,
        oninput: (v) => { roadById(store.project, road.id).lanes = Math.round(v); }});
      sliderRow(c, 'Lane width', {min: 2, max: 6, step: 0.1, unit: 'm', value: road.laneWidth,
        oninput: (v) => { roadById(store.project, road.id).laneWidth = v; }});
      sliderRow(c, 'Shoulder L', {min: 0, max: 6, step: 0.1, unit: 'm', value: road.shoulderL,
        oninput: (v) => { roadById(store.project, road.id).shoulderL = v; }});
      sliderRow(c, 'Shoulder R', {min: 0, max: 6, step: 0.1, unit: 'm', value: road.shoulderR,
        oninput: (v) => { roadById(store.project, road.id).shoulderR = v; }});
      sliderRow(c, 'Camber', {min: 0, max: 0.3, step: 0.01, unit: 'm', value: road.camber,
        oninput: (v) => { roadById(store.project, road.id).camber = v; }});
      h('div', 'ctl-label', c, 'Centre marking');
      {
        const row = h('div', 'ctl-row', c);
        h('label', '', row, 'Style');
        const seg = h('div', 'segment', row);
        for (const [value, label] of Object.entries(CENTER_MARKINGS)) {
          const b = h('div', 'seg-opt' + (road.centerMarking === value ? ' sel' : ''), seg, label);
          b.onclick = () => {
            if (road.centerMarking !== value) {
              store.commit('set marking', (pp) => { roadById(pp, road.id).centerMarking = value; });
            }
          };
        }
      }
      switchRow(c, 'Edge lines', !!road.edgeMarking, (v) => { roadById(store.project, road.id).edgeMarking = v; });
      switchRow(c, 'Kerb left', !!road.kerbL, (v) => { roadById(store.project, road.id).kerbL = v; });
      switchRow(c, 'Kerb right', !!road.kerbR, (v) => { roadById(store.project, road.id).kerbR = v; });
      switchRow(c, 'Rail left', !!road.guardrailL, (v) => { roadById(store.project, road.id).guardrailL = v; });
      switchRow(c, 'Rail right', !!road.guardrailR, (v) => { roadById(store.project, road.id).guardrailR = v; });
      dropdownRow(c, 'Conform', [
        {value: 'design', label: 'Design heights', sub: 'Ribbon follows control-point Y'},
        {value: 'drape', label: 'Drape to terrain', sub: 'Ribbon hugs the heightfield'}
      ], road.conform, (v) => { roadById(store.project, road.id).conform = v; });
      sliderRow(c, 'Drape lift', {min: -2, max: 5, step: 0.05, unit: 'm', value: road.drapeOffset,
        oninput: (v) => { roadById(store.project, road.id).drapeOffset = v; }});
    });

    section(wrap, 'structure', 'Structure', 'landmark', (c) => {
      const spans = api.getTopology().bridges.filter((b) => b.roadId === road.id);
      const total = spans.reduce((a, b) => a + (b.s1 - b.s0), 0);
      kv(c, 'Bridge spans', spans.length ? `${spans.length} · ${total.toFixed(0)} m deck` : 'None — flag 2+ adjacent points');
      dropdownRow(c, 'Parapet', [
        {value: 'rail', label: 'Steel rail', sub: 'W-beam on posts'},
        {value: 'wall', label: 'Concrete wall', sub: 'Parapet + steel band'}
      ], road.bridgeParapet || 'rail', (v) => { roadById(store.project, road.id).bridgeParapet = v; });
      sliderRow(c, 'Pier spacing', {min: 4, max: 30, step: 1, unit: 'm', value: road.bridgeSpacing || 12,
        oninput: (v) => { roadById(store.project, road.id).bridgeSpacing = v; }});
      const br = h('div', 'btn-row', c);
      actionBtn(br, 'Flag all', 'flag', () => {
        store.commit('flag bridge span', (pp) => { roadById(pp, road.id).points.forEach((q) => { q.bridge = true; }); });
      });
      actionBtn(br, 'Clear', 'eraser', () => {
        store.commit('clear bridge span', (pp) => { roadById(pp, road.id).points.forEach((q) => { delete q.bridge; }); });
      });
    });

    /* — point section — */
    if (sel.kind === 'point' && road.points[sel.index]) {
      const idx = sel.index;
      const pt = road.points[idx];
      const j = linkForPoint(p, road.id, idx);
      const eff = j || pt;
      section(wrap, 'point', `Point #${idx + 1}`, 'circle-dot', (c) => {
        if (j) h('div', 'ctl-hint', c, `Welded to junction <b>${j.name || j.id}</b> — moving it moves every road on that node.`);
        const mkAxis = (label, key, step) => {
          const row = h('div', 'ctl-row tight', c);
          h('label', '', row, label);
          const grow = h('div', 'grow', row);
          const nb = numBox({
            value: eff[key], step, unit: 'm',
            oninput: (v) => setPointPosition(store.project, road.id, idx,
              key === 'x' ? v : undefined, key === 'z' ? v : undefined, key === 'y' ? v : undefined)
          });
          grow.appendChild(nb.box);
        };
        mkAxis('X east', 'x', 0.5);
        mkAxis('Z south', 'z', 0.5);
        mkAxis('Y height', 'y', 0.25);
        sliderRow(c, 'Width ×', {min: 0.3, max: 3, step: 0.05, unit: '×', value: pt.w || 1,
          oninput: (v) => { roadById(store.project, road.id).points[idx].w = v; }});
        switchRow(c, 'Bridge deck', !!pt.bridge, (v) => {
          const q = roadById(store.project, road.id).points[idx];
          if (v) q.bridge = true; else delete q.bridge;
        });
        const br = h('div', 'btn-row', c);
        actionBtn(br, '− Before', 'plus', () => insertAdjacent(road, idx, -1));
        actionBtn(br, '+ After', 'plus', () => insertAdjacent(road, idx, 1));
        const br2 = h('div', 'btn-row', c);
        actionBtn(br2, 'Drape point', 'mountain', () => {
          const t = api.getTerrain();
          if (!t) { toast('No terrain loaded'); return; }
          const gv = t.sample(eff.x, eff.z);
          if (gv == null) { toast('Point is outside the terrain bounds'); return; }
          store.commit('drape point', (pp) => {
            setPointPosition(pp, road.id, idx, undefined, undefined, +(gv + (road.drapeOffset || 0)).toFixed(2));
          });
        });
        if (j) actionBtn(br2, 'Unweld', 'unlink', () => unweldPoint(road.id, idx), 'danger');
        else actionBtn(br2, 'Delete', 'trash-2', () => deletePoint(road.id, idx), 'danger');
      });
    }

    /* — vertical + actions — */
    section(wrap, 'vertical', 'Vertical', 'trending-up', (c) => {
      const ys = road.points.map((q) => q.y);
      if (ys.length) kv(c, 'Height range', `${fmt(Math.min(...ys), 1)} … ${fmt(Math.max(...ys), 1)} m`);
      const br = h('div', 'btn-row', c);
      actionBtn(br, 'Smooth', 'trending-up', () => smoothRoad(road));
      actionBtn(br, 'Drape all', 'mountain', () => drapeRoad(road));
      const fr = h('div', 'ctl-row', c);
      h('label', '', fr, 'Flatten to');
      const grow = h('div', 'grow', fr);
      grow.style.display = 'flex';
      grow.style.gap = '6px';
      const nb = numBox({value: ys.length ? ys[0] : 0, step: 0.5, unit: 'm', oninput: () => {}});
      grow.appendChild(nb.box);
      const apply = h('button', 'btn', grow, 'Apply');
      apply.style.cssText = 'width:auto;margin:0;padding:8px 14px;flex-shrink:0;';
      apply.onclick = () => {
        const v = parseFloat(nb.input.value);
        if (!Number.isFinite(v)) return;
        store.commit('flatten heights', (pp) => {
          const r = roadById(pp, road.id);
          r.points.forEach((q, i) => setPointPosition(pp, r.id, i, undefined, undefined, v));
        });
      };
      actionBtn(c, 'Reverse direction', 'arrow-up-down', () => reverseRoad(road));
    });

    section(wrap, 'actions', 'Road actions', 'flag', (c) => {
      const br = h('div', 'btn-row', c);
      actionBtn(br, 'Duplicate', 'copy', () => duplicateRoad(road.id));
      actionBtn(br, 'Delete', 'trash-2', () => deleteRoad(road.id), 'danger');
      actionBtn(c, 'Zoom to road', 'crosshair', () => api.zoomRoad(road.id));
    }, {startOpen: false});

    refreshIcons();
  }

  function insertAdjacent(road, idx, dir) {
    const pts = effectivePoints(store.project, road);
    const n = pts.length;
    const a = pts[idx];
    let b;
    if (dir < 0) {
      b = idx > 0 ? pts[idx - 1] : (road.closed ? pts[n - 1] : null);
      if (!b) { toast('Already at the start — double-click the plan to extend'); return; }
    } else {
      b = idx < n - 1 ? pts[idx + 1] : (road.closed ? pts[0] : null);
      if (!b) { toast('Already at the end — double-click the plan to extend'); return; }
    }
    const at = dir < 0 ? idx : idx + 1;
    store.commit('insert point', (p) => {
      const r = roadById(p, road.id);
      r.points.splice(at, 0, {
        x: +((a.x + b.x) / 2).toFixed(3), z: +((a.z + b.z) / 2).toFixed(3),
        y: +((a.y + b.y) / 2).toFixed(2), w: 1
      });
    });
    store.select({kind: 'point', roadId: road.id, index: at});
  }

  /* ── metrics + status + header ────────────────────────────────── */
  function renderMetrics() {
    const topo = api.getTopology();
    const topoN = {ix: topo.intersections.length, over: topo.overpasses.length, br: topo.bridges.length};
    const s = api.getSummary();
    const issues = api.getIssues();
    const errs = issues.filter((i) => i.severity === 'error').length;
    const warns = issues.filter((i) => i.severity === 'warn').length;
    const rCls = Number.isFinite(s.minRadius) && s.minRadius < 7 ? 'bad' : Number.isFinite(s.minRadius) && s.minRadius < 15 ? 'warnm' : '';
    const gCls = s.maxGrade > 0.12 ? 'bad' : s.maxGrade > 0.08 ? 'warnm' : '';
    metricsEl.innerHTML = `
      <div class="metric"><i data-lucide="ruler"></i><div><div class="mm-label">Total length</div><div class="mm-val">${fmtLen(s.length)}</div></div></div>
      <div class="metric"><i data-lucide="route"></i><div><div class="mm-label">Roads · Points</div><div class="mm-val">${s.roads} <small>· ${s.points} pts</small></div></div></div>
      <div class="metric ${rCls}"><i data-lucide="spline"></i><div><div class="mm-label">Min radius</div><div class="mm-val">${Number.isFinite(s.minRadius) ? `${fmt(s.minRadius, 1)} <small>m</small>` : '—'}</div></div></div>
      <div class="metric ${gCls}"><i data-lucide="trending-up"></i><div><div class="mm-label">Max grade</div><div class="mm-val">${fmt(s.maxGrade * 100, 1)} <small>%</small></div></div></div>
      <div class="metric"><i data-lucide="network"></i><div><div class="mm-label">Junctions</div><div class="mm-val">${topoN.ix} <small>· ${topoN.over} over · ${topoN.br} br</small></div></div></div>
      <div class="metric ${errs ? 'bad' : warns ? 'warnm' : ''}"><i data-lucide="triangle-alert"></i><div><div class="mm-label">Validation</div><div class="mm-val">${errs ? `${errs} <small>errors</small>` : warns ? `${warns} <small>warnings</small>` : '<small>clean</small>'}</div></div></div>`;
    refreshIcons();
  }

  const TOOL_HINTS = {
    select: 'Drag points · Alt+click inserts · double-click extends · Del removes',
    draw: 'Click to append · click first point to close · Enter finishes · Esc cancels',
    pan: 'Drag to pan · wheel to zoom · F fits all'
  };

  function renderStatus(cursor) {
    const issues = api.getIssues();
    const errs = issues.filter((i) => i.severity === 'error').length;
    const ui = store.ui;
    const snapTxt = [ui.snapGrid ? `GRID ${ui.gridSize}m` : null, ui.snapNode ? 'NODE' : null].filter(Boolean).join(' · ') || 'OFF';
    statusEl.innerHTML = `
      <span class="stat"><i data-lucide="${store.tool === 'draw' ? 'pen-line' : store.tool === 'pan' ? 'hand' : 'mouse-pointer-2'}"></i><b>${store.tool.toUpperCase()}</b></span>
      <div class="vf-sep"></div>
      <span class="hint">${TOOL_HINTS[store.tool]}</span>
      <div class="vf-sep"></div>
      <span class="stat"><i data-lucide="crosshair"></i>${cursor ? `<b>X ${fmt(cursor.x, 1)}</b> · <b>Z ${fmt(cursor.z, 1)}</b>` : '<b>—</b>'}</span>
      <div class="vf-sep"></div>
      <span class="stat"><i data-lucide="magnet"></i><b>${snapTxt}</b></span>
      <span class="spacer"></span>
      <span class="stat"><i data-lucide="triangle-alert"></i><b>${errs ? `${errs} err` : `${issues.length} issues`}</b></span>
      <div class="vf-sep"></div>
      <span class="stat">${store.dirty ? '<b>● unsaved</b>' : '<b>saved</b>'}</span>
      <span class="live"><span class="pulse"></span>Live</span>`;
    refreshIcons();
  }

  function refreshHeader() {
    $('project-name').textContent = store.project.name || 'Untitled route';
    $('dirty-dot').hidden = !store.dirty;
    $('btn-undo').disabled = !store.canUndo();
    $('btn-redo').disabled = !store.canRedo();
    $('btn-undo').title = store.canUndo() ? `Undo: ${store.undoLabel()} (Ctrl+Z)` : 'Nothing to undo';
  }

  function refreshView() {
    const v = store.view;
    $('stage').className = `stage view-${v}`;
    document.querySelectorAll('#view-seg button').forEach((b) => b.classList.toggle('sel', b.dataset.view === v));
    $('view3d-wrap').hidden = v === 'plan';
    requestAnimationFrame(() => {
      api.plan.redraw();
      api.preview.resize();
    });
  }

  function refreshToolbars() {
    document.querySelectorAll('#plan-toolbar [data-tool]').forEach((b) =>
      b.classList.toggle('sel', b.dataset.tool === store.tool));
    const ui = store.ui;
    document.querySelectorAll('#plan-toolbar [data-snap]').forEach((b) => {
      const k = b.dataset.snap;
      const on = k === 'grid' ? ui.snapGrid : k === 'node' ? ui.snapNode : ui.showIssues;
      b.classList.toggle('sel', !!on);
    });
    document.querySelectorAll('#td-toolbar [data-act]').forEach((b) => {
      const a = b.dataset.act;
      if (a === 'wire') b.classList.toggle('sel', !!ui.wireframe);
      if (a === 'spin') b.classList.toggle('sel', !!ui.autoRotate);
      if (a === 'drive') b.classList.toggle('sel', api.preview.driving);
    });
  }

  function showDrive(on, roadName, playing) {
    $('drive-capsule').hidden = !on;
    if (on) {
      $('drive-road').textContent = roadName || '—';
      syncDrivePlay(playing !== false);
    }
  }

  function syncDrivePlay(playing) {
    const btn = document.querySelector('#drive-capsule [data-d="play"]');
    btn.innerHTML = `<i data-lucide="${playing ? 'pause' : 'play'}"></i>`;
    btn.title = playing ? 'Pause (Space)' : 'Resume (Space)';
    refreshIcons();
  }

  /* ── exports ──────────────────────────────────────────────────── */
  function exportJSON() {
    const name = (store.project.name || 'route').replace(/[^\w-]+/g, '-').toLowerCase();
    downloadText(`${name}.road.json`, serializeProject(store.project), 'application/json');
    store.markSaved();
    toast('Project JSON downloaded');
  }

  function exportOBJ() {
    const terr = api.getTerrain()?.sample || null;
    const sm = api.getSampleMap(), tp = api.getTopology();
    const tris = countProjectTriangles(store.project, {terrain: terr, samples: sm, topo: tp});
    const name = (store.project.name || 'route').replace(/[^\w-]+/g, '-').toLowerCase();
    const obj = roadNetworkToOBJ(store.project, {terrain: terr, samples: sm, topo: tp});
    downloadText(`${name}.obj`, obj, 'text/plain');
    toast(`OBJ exported · ${tris.toLocaleString()} triangles · Y-up metres`);
  }

  function exportCSV() {
    const name = (store.project.name || 'route').replace(/[^\w-]+/g, '-').toLowerCase();
    downloadText(`${name}-centerlines.csv`, centerlineCSV(store.project), 'text/csv');
    toast('Centreline stations exported');
  }

  function wireChrome() {
    document.querySelectorAll('#view-seg button').forEach((b) =>
      b.onclick = () => store.setView(b.dataset.view));
    const guardDraw = () => {
      if (api.plan?.drawing) { toast('Finish the draw first — Enter keeps it, Esc cancels'); return true; }
      return false;
    };
    $('btn-undo').onclick = () => { if (guardDraw()) return; const l = store.undo(); if (l) toast(`Undid ${l}`); };
    $('btn-redo').onclick = () => { if (guardDraw()) return; if (store.redo()) toast('Redone'); };
    $('btn-help').onclick = () => { $('help').hidden = false; };
    $('help-close').onclick = () => { $('help').hidden = true; };
    $('help').addEventListener('mousedown', (e) => { if (e.target === $('help')) $('help').hidden = true; });

    $('btn-export').onclick = (e) => {
      e.stopPropagation();
      openMenu($('export-menu'), $('btn-export'), (menu) => {
        h('div', 'menu-cap', menu, 'Project');
        menuItem(menu, {icon: 'file-json', label: 'Road project (.json)', sub: 'Reloadable here + engine-readable', fn: exportJSON});
        h('div', 'menu-sep', menu);
        h('div', 'menu-cap', menu, 'Mesh + data');
        menuItem(menu, {icon: 'box', label: 'Mesh (.obj)', sub: 'Y-up metres, Terrain Lab convention', fn: exportOBJ});
        menuItem(menu, {icon: 'table', label: 'Centrelines (.csv)', sub: 'Stations, headings, grades, radii', fn: exportCSV});
        h('div', 'menu-sep', menu);
        h('div', 'menu-cap', menu, 'Captures');
        menuItem(menu, {icon: 'map', label: 'Plan capture (.png)', fn: () => api.plan.exportPNG('road-plan.png')});
        menuItem(menu, {icon: 'camera', label: '3D capture (.png)', fn: () => api.preview.screenshot('road-3d.png')});
      });
    };

    document.querySelectorAll('#plan-toolbar [data-tool]').forEach((b) =>
      b.onclick = () => store.setTool(b.dataset.tool));
    document.querySelectorAll('#plan-toolbar [data-snap]').forEach((b) =>
      b.onclick = () => {
        const k = b.dataset.snap;
        if (k === 'grid') store.setUI({snapGrid: !store.ui.snapGrid});
        else if (k === 'node') store.setUI({snapNode: !store.ui.snapNode});
        else store.setUI({showIssues: !store.ui.showIssues});
      });
    document.querySelector('#plan-toolbar [data-act="fit"]').onclick = () => api.plan.fitAll();

    document.querySelectorAll('#td-toolbar [data-act]').forEach((b) =>
      b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'orbit' || a === 'top') {
          document.querySelector('#td-toolbar [data-act="orbit"]').classList.toggle('sel', a === 'orbit');
          document.querySelector('#td-toolbar [data-act="top"]').classList.toggle('sel', a === 'top');
          api.preview.resetCamera(a === 'top');
        }
        else if (a === 'wire') store.setUI({wireframe: !store.ui.wireframe});
        else if (a === 'spin') store.setUI({autoRotate: !store.ui.autoRotate});
        else if (a === 'drive') api.startDrive();
        else if (a === 'shot') api.preview.screenshot('road-3d.png');
        else if (a === 'reset') api.preview.resetCamera(false);
      });

    document.querySelectorAll('#drive-capsule [data-d]').forEach((b) =>
      b.onclick = () => {
        const d = b.dataset.d;
        if (d === 'play') syncDrivePlay(api.preview.toggleDrivePlay());
        else if (d === 'stop') api.preview.stopDrive();
        else {
          document.querySelectorAll('#drive-capsule [data-d]').forEach((x) => {
            if (['slow', 'cruise', 'fast'].includes(x.dataset.d)) x.classList.toggle('sel', x === b);
          });
          api.preview.setDriveSpeed(d === 'slow' ? 8 : d === 'fast' ? 30 : 16);
        }
      });
  }

  wireChrome();
  refreshIcons();

  return {
    renderLeft, renderInspector, renderMetrics, renderStatus,
    refreshHeader, refreshView, refreshToolbars,
    showDrive, syncDrivePlay, toast, closeMenu,
    exportJSON, exportOBJ, exportCSV,
    deleteSelection, deleteRoad, deletePoint
  };
}
