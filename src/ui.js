// Schema-driven control panel. Each control binds to a dotted path in `params`.
export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const parts = path.split('.');
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {};
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} root
 * @param {Array} schema
 * @param {{get:(p:string)=>any,set:(p:string,v:any)=>void,resolved?:(p:string)=>string,onAction:(name:string,payload?:any)=>void,onChange:(p:string)=>void}} api
 * @returns {{refresh:()=>void, groups:Record<string,HTMLElement>}}
 */
export function buildPanel(root, schema, api) {
  const updaters = [];
  const groups = {};
  root.innerHTML = '';

  for (const group of schema) {
    const details = el('details', 'group');
    details.open = group.open !== false;
    const summary = el('summary');
    const chev = el('span', 'chev', '▶');
    summary.appendChild(chev);
    summary.appendChild(el('span', null, group.title));
    if (group.badge) summary.appendChild(el('span', 'badge', group.badge));
    details.appendChild(summary);
    const body = el('div', 'group-body');
    details.appendChild(body);
    for (const item of group.items || []) buildItem(body, item, api, updaters);
    root.appendChild(details);
    if (group.id) groups[group.id] = details;
  }

  return {
    refresh: () => updaters.forEach((f) => f()),
    groups,
  };
}

function buildItem(body, item, api, updaters) {
  if (item.t === 'custom') {
    item.render(body, api);
    return;
  }
  if (item.t === 'buttons') {
    const wrap = el('div', 'field');
    if (item.label) wrap.appendChild(el('div', 'field-label', item.label));
    const row = el('div', item.columns === 3 ? 'grid3' : 'row');
    for (const b of item.items) {
      const btn = el('button', b.kind || 'tiny', b.label);
      if (b.primary) btn.classList.add('primary');
      btn.title = b.title || '';
      btn.addEventListener('click', () => api.onAction(b.action, b.payload));
      row.appendChild(btn);
    }
    wrap.appendChild(row);
    if (item.hint) wrap.appendChild(el('div', 'hint', item.hint));
    body.appendChild(wrap);
    return;
  }
  if (item.t === 'chips') {
    const wrap = el('div', 'field');
    if (item.label) wrap.appendChild(el('div', 'field-label', item.label));
    const row = el('div', 'chips');
    const chips = [];
    for (const opt of item.options) {
      const value = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? opt : opt.label;
      const c = el('div', 'chip', label);
      c.addEventListener('click', () => {
        api.set(item.k, value);
        api.onChange(item.k);
      });
      row.appendChild(c);
      chips.push([c, value]);
    }
    wrap.appendChild(row);
    body.appendChild(wrap);
    updaters.push(() => {
      const cur = api.get(item.k);
      for (const [c, value] of chips) c.classList.toggle('active', cur === value);
    });
    return;
  }
  if (item.t === 'toggle') {
    const wrap = el('label', 'field inline');
    const label = el('span', 'field-label', item.label);
    if (item.title) label.title = item.title;
    const sw = el('span', 'switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    const track = el('span', 'track');
    const thumb = el('span', 'thumb');
    sw.append(input, track, thumb);
    wrap.append(label, sw);
    if (item.hint) {
      const f = el('div', 'field');
      f.append(wrap, el('div', 'hint', item.hint));
      body.appendChild(f);
    } else body.appendChild(wrap);
    input.addEventListener('change', () => {
      api.set(item.k, input.checked);
      api.onChange(item.k);
    });
    updaters.push(() => {
      input.checked = !!api.get(item.k);
    });
    return;
  }
  if (item.t === 'range') {
    const wrap = el('div', 'field');
    const lab = el('div', 'field-label');
    lab.appendChild(el('span', null, item.label));
    const val = el('span', 'val');
    lab.appendChild(val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = item.min;
    input.max = item.max;
    input.step = item.step ?? 0.01;
    wrap.append(lab, input);
    body.appendChild(wrap);
    const fmt = (v) => `${Number(v).toFixed(item.dp ?? (item.step && item.step < 1 ? 2 : 0))}${item.unit || ''}`;
    input.addEventListener('input', () => {
      val.textContent = fmt(input.value);
      api.set(item.k, Number(input.value));
      api.onChange(item.k, true);
    });
    input.addEventListener('change', () => api.onChange(item.k, false));
    updaters.push(() => {
      const v = Number(api.get(item.k) ?? item.min);
      input.value = v;
      val.textContent = fmt(v);
    });
    return;
  }
  if (item.t === 'select') {
    const wrap = el('div', 'field');
    wrap.appendChild(el('div', 'field-label', item.label));
    const sel = document.createElement('select');
    for (const opt of item.options) {
      const value = typeof opt === 'string' ? opt : opt.value;
      const label = typeof opt === 'string' ? humanize(opt) : opt.label;
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      sel.appendChild(o);
    }
    wrap.appendChild(sel);
    if (item.hint) wrap.appendChild(el('div', 'hint', item.hint));
    body.appendChild(wrap);
    sel.addEventListener('change', () => {
      api.set(item.k, sel.value);
      api.onChange(item.k);
    });
    updaters.push(() => {
      sel.value = api.get(item.k);
    });
    return;
  }
  if (item.t === 'color') {
    const wrap = el('div', 'colorrow');
    wrap.appendChild(el('span', 'swatch-label', item.label));
    const input = document.createElement('input');
    input.type = 'color';
    const auto = el('button', 'tiny ghost', 'auto');
    wrap.append(input, auto);
    body.appendChild(wrap);
    const apply = (v, silent = true) => {
      api.set(item.k, v);
      if (!silent) api.onChange(item.k);
    };
    input.addEventListener('input', () => apply(input.value));
    input.addEventListener('change', () => apply(input.value, false));
    auto.addEventListener('click', () => {
      api.set(item.k, '');
      api.onChange(item.k);
    });
    updaters.push(() => {
      const raw = api.get(item.k);
      const shown = raw || (api.resolved ? api.resolved(item.k) : '#888888');
      try {
        input.value = rgbToHex(shown);
      } catch {
        input.value = '#888888';
      }
      auto.classList.toggle('on', !raw);
    });
    return;
  }
  if (item.t === 'text' || item.t === 'textarea') {
    const wrap = el('div', 'field');
    wrap.appendChild(el('div', 'field-label', item.label));
    const input = item.t === 'textarea' ? el('textarea') : document.createElement('input');
    if (item.t === 'textarea') input.rows = item.rows || 4;
    else input.type = 'text';
    input.dataset.path = item.k;
    input.placeholder = item.placeholder || '';
    if (item.maxlength) input.maxLength = item.maxlength;
    wrap.appendChild(input);
    if (item.hint) wrap.appendChild(el('div', 'hint', item.hint));
    body.appendChild(wrap);
    let t = null;
    const push = (immediate) => {
      api.set(item.k, input.value);
      if (immediate) {
        api.onChange(item.k, true);
        return;
      }
      clearTimeout(t);
      t = setTimeout(() => api.onChange(item.k, false), 420);
    };
    input.addEventListener('input', () => push(false));
    input.addEventListener('change', () => push(true));
    updaters.push(() => {
      const v = api.get(item.k) ?? '';
      if (document.activeElement !== input) input.value = v;
    });
    return;
  }
  if (item.t === 'number') {
    const wrap = el('div', 'field');
    wrap.appendChild(el('div', 'field-label', item.label));
    const input = document.createElement('input');
    input.type = 'number';
    input.min = item.min ?? 0;
    input.max = item.max ?? 100;
    input.step = item.step ?? 1;
    wrap.appendChild(input);
    body.appendChild(wrap);
    input.addEventListener('change', () => {
      api.set(item.k, Number(input.value));
      api.onChange(item.k);
    });
    updaters.push(() => {
      input.value = api.get(item.k);
    });
    return;
  }
  if (item.t === 'note') {
    body.appendChild(el('div', 'hint', item.text));
  }
}

export function humanize(str) {
  return String(str)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAboard\b/, 'A-board')
    .replace(/\bAcunits\b/, 'AC units');
}

export function rgbToHex(c) {
  if (typeof c === 'string' && c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    if (c.length === 4) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    return c;
  }
  const col = c && c.isColor ? c : null;
  if (col) return `#${col.getHexString()}`;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = c || '#888888';
  return ctx.fillStyle;
}

export function toast(msg, ms = 1900) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = el('div', 'toast');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}
