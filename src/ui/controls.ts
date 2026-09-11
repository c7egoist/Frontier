/**
 * Small imperative UI toolkit (no framework): sections, slider rows,
 * per-level numeric rows with drag-to-scrub, selects, checks.
 */

export type Listener = () => void;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function section(title: string, parent: HTMLElement, opts: { collapsed?: boolean; hint?: string } = {}): HTMLElement {
  const s = el('div', 'section' + (opts.collapsed ? ' collapsed' : ''));
  const h = el('header');
  const chev = el('span', 'chev');
  h.append(chev, el('span', '', title));
  if (opts.hint) h.append(el('span', 'hint', opts.hint));
  const body = el('div', 'body');
  s.append(h, body);
  h.addEventListener('click', () => s.classList.toggle('collapsed'));
  parent.append(s);
  return body;
}

export interface SliderOpts {
  min: number;
  max: number;
  step?: number;
  title?: string;
  format?: (v: number) => string;
}

export function slider(
  parent: HTMLElement,
  label: string,
  get: () => number,
  set: (v: number) => void,
  opts: SliderOpts,
  onChange: Listener,
): { refresh: () => void } {
  const row = el('div', 'row');
  const lab = el('label', '', label);
  if (opts.title) lab.title = opts.title;
  const range = el('input');
  range.type = 'range';
  range.min = String(opts.min);
  range.max = String(opts.max);
  range.step = String(opts.step ?? (opts.max - opts.min) / 200);
  const num = el('input', 'num');
  num.type = 'text';
  const fmt = opts.format ?? ((v: number) => formatNumber(v, opts.step));
  const refresh = (): void => {
    const v = get();
    range.value = String(v);
    num.value = fmt(v);
  };
  range.addEventListener('input', () => {
    set(parseFloat(range.value));
    num.value = fmt(get());
    onChange();
  });
  const commit = (): void => {
    const v = parseFloat(num.value);
    if (!Number.isNaN(v)) {
      set(v);
      onChange();
    }
    refresh();
  };
  num.addEventListener('change', commit);
  num.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  });
  attachScrub(num, get, (v) => set(v), opts.step ?? 0.01, onChange, refresh);
  row.append(lab, range, num);
  parent.append(row);
  refresh();
  return { refresh };
}

export function select<T extends string | number>(
  parent: HTMLElement,
  label: string,
  options: { value: T; label: string }[],
  get: () => T,
  set: (v: T) => void,
  onChange: Listener,
): { refresh: () => void } {
  const row = el('div', 'row');
  const lab = el('label', '', label);
  const sel = el('select');
  for (const o of options) {
    const op = el('option', '', o.label);
    op.value = String(o.value);
    sel.append(op);
  }
  const refresh = (): void => {
    sel.value = String(get());
  };
  sel.addEventListener('change', () => {
    const raw = sel.value;
    const sample = options[0].value;
    set((typeof sample === 'number' ? Number(raw) : raw) as T);
    onChange();
  });
  row.append(lab, sel);
  parent.append(row);
  refresh();
  return { refresh };
}

export function check(parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void, onChange: Listener): { refresh: () => void } {
  const row = el('div', 'row');
  const lab = el('label', '', label);
  const wrap = el('div', 'check');
  const box = el('input');
  box.type = 'checkbox';
  const refresh = (): void => {
    box.checked = get();
  };
  box.addEventListener('change', () => {
    set(box.checked);
    onChange();
  });
  wrap.append(box);
  row.append(lab, wrap);
  parent.append(row);
  refresh();
  return { refresh };
}

export function levelsHeader(parent: HTMLElement, labels = ['Trunk', 'Limbs', 'Branches', 'Twigs']): void {
  const h = el('div', 'levels-head');
  h.append(el('span'));
  for (const l of labels) h.append(el('span', '', l));
  parent.append(h);
}

export interface LevelRowOpts {
  step?: number;
  min?: number;
  max?: number;
  title?: string;
  /** Number of enabled columns (levels). */
  enabled?: () => number;
  integer?: boolean;
}

export function levelRow(
  parent: HTMLElement,
  label: string,
  get: () => number[],
  set: (i: number, v: number) => void,
  opts: LevelRowOpts,
  onChange: Listener,
): { refresh: () => void } {
  const row = el('div', 'lrow');
  const lab = el('label', '', label);
  if (opts.title) lab.title = opts.title;
  row.append(lab);
  const inputs: HTMLInputElement[] = [];
  const step = opts.step ?? 0.01;
  for (let i = 0; i < 4; i++) {
    const num = el('input', 'num');
    num.type = 'text';
    const commit = (): void => {
      let v = parseFloat(num.value);
      if (!Number.isNaN(v)) {
        if (opts.integer) v = Math.round(v);
        if (opts.min !== undefined) v = Math.max(opts.min, v);
        if (opts.max !== undefined) v = Math.min(opts.max, v);
        set(i, v);
        onChange();
      }
      refresh();
    };
    num.addEventListener('change', commit);
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
    });
    attachScrub(
      num,
      () => get()[i],
      (v) => {
        if (opts.integer) v = Math.round(v);
        if (opts.min !== undefined) v = Math.max(opts.min, v);
        if (opts.max !== undefined) v = Math.min(opts.max, v);
        set(i, v);
      },
      step,
      onChange,
      () => refresh(),
    );
    inputs.push(num);
    row.append(num);
  }
  const refresh = (): void => {
    const vals = get();
    const n = opts.enabled ? opts.enabled() : 4;
    inputs.forEach((inp, i) => {
      inp.value = formatNumber(vals[i], step);
      inp.disabled = i >= n;
    });
  };
  parent.append(row);
  refresh();
  return { refresh };
}

/** Drag horizontally on a numeric field to scrub its value (DCC convention). */
function attachScrub(
  input: HTMLInputElement,
  get: () => number,
  set: (v: number) => void,
  step: number,
  onChange: Listener,
  refresh: () => void,
): void {
  let startX = 0;
  let startV = 0;
  let dragging = false;
  let moved = false;
  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    startX = e.clientX;
    startV = get();
    dragging = true;
    moved = false;
    input.setPointerCapture(e.pointerId);
  });
  input.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < 3) return;
    if (!moved) {
      moved = true;
      input.classList.add('dragging');
      input.blur();
    }
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = startV + dx * step * mult * 0.5;
    set(roundTo(v, step * (mult < 1 ? 0.1 : 1)));
    refresh();
    onChange();
  });
  const end = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    input.classList.remove('dragging');
    try {
      input.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (moved) e.preventDefault();
  };
  input.addEventListener('pointerup', end);
  input.addEventListener('pointercancel', end);
}

function roundTo(v: number, step: number): number {
  const d = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
  return parseFloat(v.toFixed(d));
}

export function formatNumber(v: number, step?: number): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '–';
  if (Number.isInteger(v)) return String(v);
  const d = step ? Math.max(0, Math.min(4, Math.ceil(-Math.log10(step)))) : 2;
  return v.toFixed(d);
}

export function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}
