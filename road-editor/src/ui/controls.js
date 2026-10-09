// Small DOM helpers for the inspector: numbered sections, range rows with a live
// output, toggle switches, selects and text/number fields.

export function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

let sectionNo = 0;
export function section(title) {
  sectionNo += 1;
  const num = String(sectionNo).padStart(2, '0');
  return el('div', { class: 'section-label' }, [el('span', { class: 'num', text: num }), el('span', { text: title })]);
}
export function resetSections() {
  sectionNo = 0;
}

export function rowShell(label, control, hint) {
  return el('div', { class: 'row' }, [el('label', { class: 'row-label', text: label, title: hint || '' }), control]);
}

// Range with a live numeric output. onInput previews; onCommit records history.
export function rangeRow({ label, value, min, max, step, unit = '', fmt, onInput, onCommit, hint }) {
  const show = (v) => (fmt ? fmt(v) : `${Number(v).toFixed(decimals(step))}${unit ? ` ${unit}` : ''}`);
  const out = el('output', { class: 'row-out', text: show(value) });
  const input = el('input', { type: 'range', min, max, step, value });
  input.addEventListener('pointerdown', () => onCommit && onCommit('begin'));
  input.addEventListener('input', () => {
    out.textContent = show(input.value);
    onInput && onInput(Number(input.value));
  });
  input.addEventListener('change', () => onCommit && onCommit('end'));
  input.addEventListener('keydown', () => onCommit && onCommit('begin'));
  input.addEventListener('keyup', () => onCommit && onCommit('end'));
  const wrap = el('div', { class: 'range-wrap' }, [input, out]);
  const row = el('div', { class: 'row' }, [el('label', { class: 'row-label', text: label, title: hint || '' }), wrap]);
  row.dataset.key = label;
  row._sync = (v) => {
    if (document.activeElement !== input) input.value = v;
    out.textContent = show(v);
  };
  return row;
}

function decimals(step) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

export function toggleRow({ label, value, onChange, hint }) {
  const input = el('input', { type: 'checkbox', class: 'switch' });
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));
  const row = el('div', { class: 'row' }, [el('label', { class: 'row-label', text: label, title: hint || '' }), el('label', { class: 'switch-wrap' }, [input, el('span', { class: 'knob' })])]);
  row._sync = (v) => {
    input.checked = !!v;
  };
  return row;
}

export function selectRow({ label, value, options, onChange, hint }) {
  const sel = el('select', {}, options.map((o) => el('option', { value: o.value ?? o, text: o.label ?? o })));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  const row = el('div', { class: 'row' }, [el('label', { class: 'row-label', text: label, title: hint || '' }), sel]);
  row._sync = (v) => {
    if (document.activeElement !== sel) sel.value = v;
  };
  return row;
}

export function textRow({ label, value, onChange, hint, type = 'text', step, min, max }) {
  const input = el('input', { type, value: value ?? '', step, min, max });
  input.addEventListener('change', () => onChange(type === 'number' ? Number(input.value) : input.value));
  const row = el('div', { class: 'row' }, [el('label', { class: 'row-label', text: label, title: hint || '' }), input]);
  row._sync = (v) => {
    if (document.activeElement !== input) input.value = v ?? '';
  };
  return row;
}

export function buttonRow({ label, buttons }) {
  return el('div', { class: 'row button-row' }, [el('span', { class: 'row-label', text: label }), el('div', { class: 'buttons' }, buttons.map((b) => el('button', { class: `btn ${b.danger ? 'danger' : ''}`, text: b.text, title: b.title || '', onClick: b.onClick, disabled: b.disabled })))]);
}

export function infoRow(label, value) {
  return el('div', { class: 'row info' }, [el('span', { class: 'row-label', text: label }), el('span', { class: 'info-val', text: value })]);
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}
