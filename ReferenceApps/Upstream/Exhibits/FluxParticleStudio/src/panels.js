/* Flux panels — left (composition/layers/presets) + right (layer inspector). */
import {
  createIcons, Layers, Plus, Copy, Trash2, Eye, EyeOff, Sparkles, Wind,
  Palette, Zap, Gauge, ChevronRight, Dices, Bomb, SlidersHorizontal, Sun,
  Film, Box,
} from 'lucide';
import {SHAPES} from './shaders.js';
import {layerById} from './state.js';
import {PRESETS} from './presets.js';

const ICONS = {Layers, Plus, Copy, Trash2, Eye, EyeOff, Sparkles, Wind, Palette, Zap, Gauge, ChevronRight, Dices, Bomb, SlidersHorizontal, Sun, Film, Box};
const refreshIcons = () => { try { createIcons({icons: ICONS}); } catch { /* noop */ } };

const h = (tag, cls, parent, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  if (parent) parent.appendChild(el);
  return el;
};
const fmt = (v, d = 2) => (+v).toFixed(d);
const fmtInt = (v) => String(Math.round(+v));

export function createPanels(store, engine, api) {
  const openSecs = new Set(['composition', 'layers', 'layer', 'emitter', 'forces', 'look', 'burst']);

  function section(parent, key, title, icon, build, startOpen) {
    const open = startOpen ?? openSecs.has(key);
    const sec = h('div', 'sec' + (open ? '' : ' closed'), parent);
    const head = h('button', 'sec-head', sec,
      `<i data-lucide="${icon}"></i><span>${title}</span><i data-lucide="chevron-right" class="chev"></i>`);
    head.onclick = () => {
      sec.classList.toggle('closed');
      openSecs.has(key) ? openSecs.delete(key) : openSecs.add(key);
    };
    const body = h('div', 'sec-body', sec);
    build(body);
    return sec;
  }

  /** Slider with live update + single undo step on release. */
  function sliderRow(parent, label, {min, max, step, value, format = fmt, onLive}) {
    const wrap = h('div', 'ctl', parent);
    h('div', 'ctl-label', wrap, `<span>${label}</span>`);
    const pill = h('span', 'ctl-val', wrap.querySelector('.ctl-label'), format(value));
    const input = h('input', '', wrap);
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    let snap = null;
    input.addEventListener('input', () => {
      if (!snap) snap = store.snapshot();
      onLive(+input.value);
      engine.syncAll();
      pill.textContent = format(+input.value);
      api.onValues?.();
    });
    input.addEventListener('change', () => {
      if (snap) {
        store.past.push(snap);
        if (store.past.length > 60) store.past.shift();
        store.future.length = 0;
        store.dirty = true;
        snap = null;
        api.onValues?.();
      }
    });
    return input;
  }

  function commit(label, fn, structural = false) {
    store.commit(label, fn);
    engine.syncAll();
    if (structural) { renderLeft(); renderInspector(); api.onStructure?.(); }
    else api.onValues?.();
  }

  function selectRow(parent, label, options, value, onCommit) {
    const wrap = h('div', 'ctl', parent);
    h('div', 'ctl-label', wrap, `<span>${label}</span>`);
    const sel = h('select', 'combo', wrap);
    for (const [v, lab] of options) {
      const o = document.createElement('option');
      o.value = v; o.textContent = lab;
      if (v === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.onchange = () => onCommit(sel.value);
    return sel;
  }

  function switchRow(parent, label, value, onCommit) {
    const wrap = h('div', 'switch-row', parent);
    h('span', '', wrap, label);
    const sw = h('label', 'switch', wrap);
    const input = h('input', '', sw);
    input.type = 'checkbox'; input.checked = !!value;
    h('span', 'tk', sw);
    input.onchange = () => onCommit(input.checked);
    return input;
  }

  function colorRow(parent, label, value, onLive) {
    const wrap = h('div', 'ctl', parent);
    const lab = h('div', 'ctl-label', wrap, `<span>${label}</span>`);
    const dot = h('input', 'color-dot', lab);
    dot.type = 'color'; dot.value = value;
    let snap = null;
    dot.addEventListener('input', () => {
      if (!snap) snap = store.snapshot();
      onLive(dot.value);
      engine.syncAll();
      api.onValues?.();
    });
    dot.addEventListener('change', () => {
      if (snap) {
        store.past.push(snap);
        if (store.past.length > 60) store.past.shift();
        store.future.length = 0;
        store.dirty = true;
        snap = null;
      }
    });
    return dot;
  }

  function vecRow(parent, label, names, values, {min, max, step, onLive}) {
    const wrap = h('div', 'ctl', parent);
    h('div', 'ctl-label', wrap, `<span>${label}</span>`);
    const row = h('div', 'ctl-row', wrap);
    let snap = null;
    names.forEach((nm, i) => {
      const cell = h('div', 'mini', row);
      h('label', '', cell, nm);
      const inp = h('input', '', cell);
      inp.type = 'number'; inp.min = min; inp.max = max; inp.step = step; inp.value = values[i];
      inp.addEventListener('input', () => {
        if (!snap) snap = store.snapshot();
        onLive(i, +inp.value || 0);
        engine.syncAll();
        api.onValues?.();
      });
      inp.addEventListener('change', () => {
        if (snap) {
          store.past.push(snap);
          if (store.past.length > 60) store.past.shift();
          store.future.length = 0;
          store.dirty = true;
          snap = null;
        }
      });
    });
  }

  function textRow(parent, label, value, onCommit) {
    const wrap = h('div', 'ctl', parent);
    h('div', 'ctl-label', wrap, `<span>${label}</span>`);
    const inp = h('input', 'text-in', wrap);
    inp.type = 'text'; inp.value = value; inp.spellcheck = false;
    inp.addEventListener('change', () => onCommit(inp.value));
    return inp;
  }

  /* ── LEFT ─────────────────────────────────────────────── */
  function renderLeft() {
    const el = document.getElementById('left-scroll');
    el.innerHTML = '';
    const c = store.comp;

    section(el, 'composition', 'Composition', 'film', (b) => {
      colorRow(b, 'Background', c.background, (v) => { store.comp.background = v; });
      switchRow(b, 'Bloom', c.bloom.on, (v) => commit('toggle bloom', () => { store.comp.bloom.on = v; }));
      if (c.bloom.on) {
        sliderRow(b, 'Strength', {min: 0, max: 2, step: 0.05, value: c.bloom.strength, onLive: (v) => { store.comp.bloom.strength = v; }});
        sliderRow(b, 'Radius', {min: 0, max: 1.2, step: 0.05, value: c.bloom.radius, onLive: (v) => { store.comp.bloom.radius = v; }});
        sliderRow(b, 'Threshold', {min: 0, max: 1, step: 0.05, value: c.bloom.threshold, onLive: (v) => { store.comp.bloom.threshold = v; }});
      }
      switchRow(b, 'Light trails', c.trails.on, (v) => commit('toggle trails', () => { store.comp.trails.on = v; }));
      if (c.trails.on) {
        sliderRow(b, 'Trail length', {min: 0.4, max: 0.985, step: 0.005, value: c.trails.damp, format: (v) => fmt(v, 3), onLive: (v) => { store.comp.trails.damp = v; }});
      }
    });

    section(el, 'layers', `Layers · ${store.layers.length}`, 'layers', (b) => {
      for (const l of store.layers) {
        const it = h('button', 'layer-item' + (l.id === store.selected ? ' sel' : '') + (l.visible === false ? ' off' : ''), b);
        it.innerHTML = `<span class="sw" style="color:${l.look.colB};background:${l.look.colB}"></span>` +
          `<span class="nm">${l.name}</span><span class="ct">${fmtInt(l.emitter.count)}</span>`;
        it.title = 'Select layer';
        it.onclick = () => {
          store.selected = l.id;
          store.notify('selection');
          renderLeft(); renderInspector();
          api.onValues?.();
        };
        const eye = h('span', 'eye', it, `<i data-lucide="${l.visible === false ? 'eye-off' : 'eye'}"></i>`);
        eye.title = 'Toggle visibility';
        eye.onclick = (e) => {
          e.stopPropagation();
          commit('toggle layer', () => { l.visible = l.visible === false; }, true);
        };
      }
      const row = h('div', 'btn-row', b);
      const add = h('button', 'pill-btn', row, '<i data-lucide="plus"></i><span>Add</span>');
      add.title = 'Add emitter layer (L)';
      add.onclick = () => api.addLayer();
      const dup = h('button', 'pill-btn', row, '<i data-lucide="copy"></i><span>Dupl</span>');
      dup.title = 'Duplicate selected';
      dup.onclick = () => api.duplicateLayer();
      dup.disabled = !store.selected;
      const del = h('button', 'pill-btn danger', row, '<i data-lucide="trash-2"></i><span>Del</span>');
      del.title = 'Delete selected (Del)';
      del.onclick = () => api.deleteLayer();
      del.disabled = !store.selected;
    });

    section(el, 'presets', 'Presets', 'sparkles', (b) => {
      h('div', 'ctl-hint', b, 'One click replaces the whole composition.');
      for (const p of PRESETS) {
        const card = h('button', 'preset-card', b);
        card.innerHTML = `<span class="grad" style="background:linear-gradient(135deg,${p.grad[0]},${p.grad[1]})"></span>` +
          `<span><b>${p.name}</b><small>${p.sub}</small></span>`;
        card.onclick = () => api.loadPreset(p.key);
      }
    }, false);
    refreshIcons();
  }

  /* ── RIGHT (inspector) ────────────────────────────────── */
  function renderInspector() {
    const el = document.getElementById('inspector');
    el.innerHTML = '';
    const l = layerById(store, store.selected);
    if (!l) {
      h('div', 'ctl-hint', el, 'No layer selected. Add one with <b>Layer</b> or <b>L</b>.');
      return;
    }
    const E = l.emitter, F = l.forces, K = l.look, B = l.burst;
    const dur = store.comp.duration;

    section(el, 'layer', 'Layer', 'sliders-horizontal', (b) => {
      textRow(b, 'Name', l.name, (v) => commit('rename layer', () => { l.name = v || l.name; }, true));
      switchRow(b, 'Visible', l.visible !== false, (v) => commit('toggle layer', () => { l.visible = v; }, true));
      sliderRow(b, 'Opacity', {min: 0, max: 1, step: 0.01, value: l.opacity, onLive: (v) => { l.opacity = v; }});
      const row = h('div', 'btn-row', b);
      const dice = h('button', 'pill-btn', row, '<i data-lucide="dices"></i><span>New seed</span>');
      dice.title = 'Randomize particle arrangement';
      dice.onclick = () => commit('new seed', () => { l.seed = (Math.random() * 1e9) | 0; });
    });

    section(el, 'emitter', 'Emitter', 'circle-dot', (b) => {
      selectRow(b, 'Shape', SHAPES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]), E.shape,
        (v) => commit('emitter shape', () => { E.shape = v; }, true));
      if (E.shape === 'sphere' || E.shape === 'disc' || E.shape === 'ring') {
        sliderRow(b, 'Radius', {min: 0.2, max: 30, step: 0.1, value: E.radius, onLive: (v) => { E.radius = v; }});
      } else if (E.shape === 'line') {
        sliderRow(b, 'Length', {min: 0.5, max: 100, step: 0.5, value: E.length, onLive: (v) => { E.length = v; }});
      } else if (E.shape === 'box') {
        vecRow(b, 'Size W·H·D', ['W', 'H', 'D'], [E.width, E.height, E.depth],
          {min: 0.2, max: 100, step: 0.5, onLive: (i, v) => { E[['width', 'height', 'depth'][i]] = v; }});
      }
      sliderRow(b, 'Count', {min: 100, max: 20000, step: 100, value: E.count, format: fmtInt, onLive: (v) => { E.count = Math.round(v); }});
      sliderRow(b, 'Life', {min: 0.3, max: dur, step: 0.1, value: Math.min(E.life, dur), onLive: (v) => { E.life = v; }});
      sliderRow(b, 'Speed', {min: 0, max: 15, step: 0.1, value: E.speed, onLive: (v) => { E.speed = v; }});
      sliderRow(b, 'Spread', {min: 0, max: 2, step: 0.05, value: E.spread, onLive: (v) => { E.spread = v; }});
      vecRow(b, 'Direction', ['X', 'Y', 'Z'], E.dir, {min: -1, max: 1, step: 0.1, onLive: (i, v) => { E.dir[i] = v; }});
      vecRow(b, 'Position', ['X', 'Y', 'Z'], E.pos, {min: -60, max: 60, step: 0.5, onLive: (i, v) => { E.pos[i] = v; }});
    });

    section(el, 'forces', 'Forces', 'wind', (b) => {
      sliderRow(b, 'Gravity', {min: -20, max: 20, step: 0.2, value: F.gravity, onLive: (v) => { F.gravity = v; }});
      vecRow(b, 'Wind X·Z', ['X', 'Z'], F.wind, {min: -12, max: 12, step: 0.2, onLive: (i, v) => { F.wind[i] = v; }});
      sliderRow(b, 'Turbulence', {min: 0, max: 6, step: 0.1, value: F.turbAmp, onLive: (v) => { F.turbAmp = v; }});
      sliderRow(b, 'Turb scale', {min: 0.05, max: 2, step: 0.05, value: F.turbScale, onLive: (v) => { F.turbScale = v; }});
      sliderRow(b, 'Turb speed', {min: 0, max: 3, step: 0.1, value: F.turbSpeed, onLive: (v) => { F.turbSpeed = v; }});
    });

    section(el, 'look', 'Look', 'palette', (b) => {
      sliderRow(b, 'Size start', {min: 0.02, max: 2, step: 0.01, value: K.size0, onLive: (v) => { K.size0 = v; }});
      sliderRow(b, 'Size end', {min: 0.02, max: 2, step: 0.01, value: K.size1, onLive: (v) => { K.size1 = v; }});
      sliderRow(b, 'Streak', {min: 0, max: 6, step: 0.1, value: K.stretch, onLive: (v) => { K.stretch = v; }});
      sliderRow(b, 'Tumble', {min: 0, max: 6, step: 0.1, value: K.tumble ?? 1.2, onLive: (v) => { K.tumble = v; }});
      sliderRow(b, 'Brightness', {min: 0, max: 3, step: 0.05, value: K.bright, onLive: (v) => { K.bright = v; }});
      colorRow(b, 'Born', K.colA, (v) => { K.colA = v; });
      colorRow(b, 'Mid-life', K.colB, (v) => { K.colB = v; });
      colorRow(b, 'Dying', K.colC, (v) => { K.colC = v; });
      sliderRow(b, 'Colour bias', {min: 0.1, max: 0.9, step: 0.05, value: K.colBias, onLive: (v) => { K.colBias = v; }});
      selectRow(b, 'Blending', [['add', 'Additive (glow)'], ['normal', 'Normal']], K.blending,
        (v) => commit('blending', () => { K.blending = v; }));
      selectRow(b, 'Particle', [['shard', 'Shard (3D gem)'], ['cube', 'Cube (3D voxel)']], K.shape || 'shard',
        (v) => commit('particle solid', () => { K.shape = v; }));
    });

    section(el, 'burst', 'Starburst', 'bomb', (b) => {
      switchRow(b, 'Enabled', B.on, (v) => commit('toggle burst', () => { B.on = v; }));
      if (B.on) {
        sliderRow(b, 'Time', {min: 0, max: dur, step: 0.05, value: Math.min(B.time, dur), onLive: (v) => { B.time = v; }});
        sliderRow(b, 'Power', {min: 0, max: 30, step: 0.5, value: B.power, onLive: (v) => { B.power = v; }});
        h('div', 'ctl-hint', b, 'Radial kick + flash for every particle alive at <b>Time</b>. Amber ticks mark bursts on the timeline.');
      } else {
        h('div', 'ctl-hint', b, 'Fire a radial shockwave through the layer at a fixed time.');
      }
    });

    section(el, 'stats', 'Readout', 'gauge', (b) => {
      h('div', 'ctl-hint', b,
        `Shape <b>${E.shape}</b> · <b>${fmtInt(E.count)}</b> particles · life <b>${fmt(Math.min(E.life, dur))}s</b> of a <b>${fmt(dur)}s</b> loop.`);
    }, false);
    refreshIcons();
  }

  return {renderLeft, renderInspector, refreshIcons};
}
