/**
 * Landscape Studio authoring toolbar.
 *
 * Follows the Frontiers editor rail: a narrow vertical strip of icon buttons
 * grouped by what the tool does to the landmass, with the active tool mirrored
 * in the inspector. Every button is a real authoring tool — there are no
 * placeholder entries. Tools fall into three groups:
 *
 *   Navigate      — camera only
 *   Sculpt        — SDF brush strokes (destructive-free; stored as strokes)
 *   Landmass      — stamps that add or remove land volumes
 *
 * Brush size/strength/failure live directly under the rail because that is
 * what a sculptor actually changes mid-stroke.
 */

import { SCULPT_TOOLS, LANDMASS_STAMP_KINDS } from '../core/landscape-document.js';

const SCULPT_ICONS = {
  raise: '▲',
  lower: '▼',
  smooth: '≈',
  flatten: '▬',
  terrace: '☰',
  sharpen: '◤',
  noise: '⁙',
};

const STAMP_ICONS = {
  island: '◍',
  continent: '⬭',
  plateau: '⬒',
  mesa: '⬓',
  ridge: '◭',
  canyon: '⌄',
  crater: '◯',
  basin: '◡',
  strait: '⫽',
  delta: '⋔',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export class LandscapeToolbar {
  constructor(root, options = {}) {
    this.root = root;
    this.tool = 'navigate';
    this.brush = { radius: 900, strength: 0.5 };
    this.stampKind = 'island';
    this.stampScale = 1;
    this.onToolChange = options.onToolChange || (() => {});
    this.onBrushChange = options.onBrushChange || (() => {});
    this.onStampChange = options.onStampChange || (() => {});
    this.buttons = new Map();
    this._build();
  }

  _build() {
    this.root.innerHTML = '';
    this.root.classList.add('lm-toolrail');

    const header = el('div', 'lm-rail-section-label', 'AUTHOR');
    this.root.appendChild(header);

    const group = (label) => {
      const section = el('div', 'lm-rail-group');
      if (label) section.appendChild(el('div', 'lm-rail-group-label', label));
      this.root.appendChild(section);
      return section;
    };

    const nav = group('Navigate');
    this._addButton(nav, 'navigate', '◎', 'Navigate', 'Orbit, pan and zoom the landscape', 'navigate');

    const sculpt = group('SDF Sculpt');
    for (const tool of SCULPT_TOOLS) {
      this._addButton(sculpt, tool.id, SCULPT_ICONS[tool.id] || '◆', tool.label, tool.hint, 'sculpt');
    }

    const landmass = group('Landmass');
    for (const kind of LANDMASS_STAMP_KINDS) {
      this._addButton(
        landmass,
        `stamp:${kind.id}`,
        STAMP_ICONS[kind.id] || '●',
        kind.label,
        `Stamp a ${kind.label.toLowerCase()} into the field`,
        'stamp',
        kind.id
      );
    }

    const brush = el('div', 'lm-rail-brush');
    brush.appendChild(el('div', 'lm-rail-group-label', 'Brush'));
    brush.appendChild(this._slider({
      label: 'Radius',
      min: 40,
      max: 200_000,
      value: this.brush.radius,
      logarithmic: true,
      format: formatLength,
      onInput: (value) => {
        this.brush.radius = value;
        this.onBrushChange({ ...this.brush });
      },
      assignInput: (node) => { this.radiusSlider = node; },
      assignOutput: (node) => { this.radiusOut = node; },
    }));
    brush.appendChild(this._slider({
      label: 'Strength',
      min: 0.02,
      max: 1.6,
      step: 0.01,
      value: this.brush.strength,
      format: (value) => `${Math.round(value * 100)}%`,
      onInput: (value) => {
        this.brush.strength = value;
        this.onBrushChange({ ...this.brush });
      },
      assignInput: (node) => { this.strengthSlider = node; },
      assignOutput: (node) => { this.strengthOut = node; },
    }));
    brush.appendChild(this._slider({
      label: 'Stamp scale',
      min: 0.05,
      max: 6,
      step: 0.05,
      value: this.stampScale,
      format: (value) => `${value.toFixed(2)}×`,
      onInput: (value) => {
        this.stampScale = value;
        this.onStampChange({ kind: this.stampKind, scale: value });
      },
      assignInput: (node) => { this.stampSlider = node; },
      assignOutput: (node) => { this.stampOut = node; },
    }));
    this.root.appendChild(brush);

    this._syncBrushLabels();
  }

  _addButton(parent, id, glyph, label, hint, group, stampKind = null) {
    const button = el('button', 'lm-rail-btn');
    button.type = 'button';
    button.title = `${label} — ${hint}`;
    button.dataset.tool = id;
    button.dataset.group = group;
    if (stampKind) button.dataset.stamp = stampKind;
    const icon = el('span', 'lm-rail-glyph', glyph);
    const text = el('span', 'lm-rail-label', label);
    button.appendChild(icon);
    button.appendChild(text);
    button.addEventListener('click', () => this.setTool(id));
    parent.appendChild(button);
    this.buttons.set(id, button);
    return button;
  }

  /**
   * One slider implementation for every brush control. Logarithmic sliders work
   * on a 0..1000 track and map through a log curve, so 40 m and 200 km are both
   * comfortably reachable.
   */
  _slider({ label, min, max, step = 0, value, logarithmic = false, format, onInput, assignInput, assignOutput }) {
    const TRACK = 1000;
    const wrap = el('div', 'lm-rail-slider');
    const row = el('div', 'lm-rail-slider-label');
    row.appendChild(el('span', null, label));
    const out = el('output', null, format(value));
    row.appendChild(out);

    const input = el('input');
    input.type = 'range';
    if (logarithmic) {
      input.min = '0';
      input.max = String(TRACK);
      input.step = '1';
      input.value = String(toTrack(value, min, max));
    } else {
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(value);
    }

    const emit = (raw) => {
      const mapped = logarithmic ? fromTrack(raw, min, max) : raw;
      out.textContent = format(mapped);
      onInput(mapped);
    };
    input.addEventListener('input', () => emit(Number(input.value)));

    wrap.appendChild(row);
    wrap.appendChild(input);
    assignInput?.(input);
    assignOutput?.(out);
    wrap.__setValue = (next) => {
      out.textContent = format(next);
      input.value = String(logarithmic ? toTrack(next, min, max) : next);
    };
    return wrap;
  }

  _syncBrushLabels() {
    this.radiusOut && (this.radiusOut.textContent = formatLength(this.brush.radius));
    this.strengthOut && (this.strengthOut.textContent = `${Math.round(this.brush.strength * 100)}%`);
  }

  setTool(id) {
    this.tool = id;
    for (const [key, button] of this.buttons) {
      button.classList.toggle('active', key === id);
    }
    if (id.startsWith('stamp:')) {
      this.stampKind = id.slice('stamp:'.length);
      this.onStampChange({ kind: this.stampKind, scale: this.stampScale });
      if (this.stampSlider) {
        this.stampSlider.disabled = false;
        this.stampSlider.parentElement?.classList.add('enabled');
      }
    } else if (this.stampSlider) {
      this.stampSlider.parentElement?.classList.remove('enabled');
    }
    this.onToolChange(id, { kind: this.stampKind, scale: this.stampScale });
  }

  setBrush(brush = {}) {
    Object.assign(this.brush, brush);
    this.radiusSlider?.parentElement?.__setValue?.(this.brush.radius);
    this.strengthSlider?.parentElement?.__setValue?.(this.brush.strength);
  }

  setStampScale(scale) {
    this.stampScale = scale;
    this.stampSlider?.parentElement?.__setValue?.(scale);
  }
}

export function formatLength(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return '—';
  if (value >= 100_000) return `${(value / 1000).toFixed(0)} km`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)} km`;
  return `${Math.round(value)} m`;
}

function toTrack(value, min, max) {
  const t = (Math.log(Math.max(min, value)) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.round(Math.max(0, Math.min(1, t)) * 1000);
}

function fromTrack(track, min, max) {
  const t = Math.max(0, Math.min(1, track / 1000));
  return Math.round(Math.pow(10, Math.log10(min) + (Math.log10(max) - Math.log10(min)) * t));
}
