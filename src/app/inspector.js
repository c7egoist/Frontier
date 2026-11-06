// Right dock — contextual inspector. Shows the active mask layer's properties and
// the selected landform's parameters (sliders bound to the live document).
import { LANDFORM_TYPES, landformParamsSpec } from '../core/landforms.js';

export class InspectorUI {
  constructor(store) {
    this.store = store;
    this.root = document.getElementById('tp-inspector-content');
  }

  render() {
    this.root.innerHTML = '';
    const layer = this.store.activeLayer();
    if (!layer) {
      this.root.appendChild(note('No layer selected. Press + in the Outliner to add a mask layer.'));
      return;
    }
    this.root.appendChild(this.layerSection(layer));
    const lf = layer.landforms.find((f) => f.id === this.store.doc.activeSubId);
    if (lf) this.root.appendChild(this.landformSection(layer, lf));
    else this.root.appendChild(note('Select a landform in the layer stack (or add one with +) to edit its generators.'));
  }

  layerSection(layer) {
    const s = section('Mask Layer');
    s.appendChild(row('Name', input(layer.name, (v) => { this.store.pushUndo(); layer.name = v; this.store.emit('doc'); })));
    const colorRow = document.createElement('label');
    colorRow.className = 'field-row';
    colorRow.innerHTML = '<span>Colour</span>';
    const sw = document.createElement('input');
    sw.type = 'color';
    sw.value = layer.color;
    sw.className = 'color-swatch';
    sw.addEventListener('change', () => { this.store.pushUndo(); layer.color = sw.value; this.store.emit('doc'); });
    colorRow.appendChild(sw);
    s.appendChild(colorRow);
    s.appendChild(slider('Base height (m)', layer.baseHeight, 0, 60, 1, (v) => { this.store.pushUndo(); layer.baseHeight = v; this.store.emit('doc'); }));
    s.appendChild(slider('Edge blur (m)', layer.edgeWidth, 1, 200, 1, (v) => { this.store.pushUndo(); layer.edgeWidth = v; this.store.emit('doc'); }));
    s.appendChild(slider('Region X', layer.region.x, -2000, 2000, 10, (v) => { this.store.pushUndo(); layer.region.x = v; this.store.emit('doc'); }));
    s.appendChild(slider('Region Z', layer.region.y, -2000, 2000, 10, (v) => { this.store.pushUndo(); layer.region.y = v; this.store.emit('doc'); }));
    s.appendChild(slider('Region W', layer.region.w, 10, 4000, 10, (v) => { this.store.pushUndo(); layer.region.w = v; this.store.emit('doc'); }));
    s.appendChild(slider('Region H', layer.region.h, 10, 4000, 10, (v) => { this.store.pushUndo(); layer.region.h = v; this.store.emit('doc'); }));
    const req = document.createElement('label');
    req.className = 'check-pill';
    req.innerHTML = `<input type="checkbox" ${layer.requireStrokes ? 'checked' : ''} /><span>Require painted strokes inside region</span>`;
    req.querySelector('input').addEventListener('change', (e) => { this.store.pushUndo(); layer.requireStrokes = e.target.checked; this.store.emit('doc'); });
    const tg = document.createElement('div'); tg.className = 'toggle-grid'; tg.appendChild(req);
    s.appendChild(tg);
    if (layer.regions.length) {
      const del = document.createElement('button');
      del.className = 'btn-secondary';
      del.textContent = `Clear ${layer.regions.length} box region(s)`;
      del.addEventListener('click', () => { this.store.pushUndo(); layer.regions = []; this.store.emit('doc'); });
      const br = document.createElement('div'); br.className = 'btn-row'; br.appendChild(del);
      s.appendChild(br);
    }
    return s;
  }

  landformSection(layer, lf) {
    const spec = LANDFORM_TYPES[lf.type];
    const s = section(spec.label);
    const head = document.createElement('div');
    head.className = 'section-header';
    head.innerHTML = `<span style="color:${spec.color}">● ${spec.label}</span><span class="tag-pill">${lf.visible ? 'VISIBLE' : 'MUTED'}</span>`;
    s.appendChild(head);
    for (const p of landformParamsSpec(lf.type)) {
      s.appendChild(slider(p.label, lf.params[p.key], p[0], p[1], p[2], (v) => {
        this.store.pushUndo();
        lf.params[p.key] = v;
        this.store.emit('doc');
      }, true));
    }
    return s;
  }
}

function section(title) {
  const s = document.createElement('div');
  s.className = 'panel-section';
  const h = document.createElement('div');
  h.className = 'section-header';
  h.innerHTML = `<span>${title}</span>`;
  s.appendChild(h);
  return s;
}

function row(label, control) {
  const r = document.createElement('label');
  r.className = 'field-row';
  const sp = document.createElement('span'); sp.textContent = label;
  r.appendChild(sp); r.appendChild(control);
  return r;
}

function input(value, onChange) {
  const i = document.createElement('input');
  i.type = 'text'; i.value = value; i.style.width = '150px';
  i.addEventListener('change', () => onChange(i.value));
  return i;
}

function slider(label, value, min, max, step, onChange, live = false) {
  const g = document.createElement('div');
  g.className = 'slider-group';
  const lab = document.createElement('div');
  lab.className = 'slider-label';
  const sp = document.createElement('span'); sp.textContent = label;
  const out = document.createElement('output'); out.textContent = fmt(value);
  lab.appendChild(sp); lab.appendChild(out);
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
  inp.addEventListener(live ? 'input' : 'change', () => {
    out.textContent = fmt(parseFloat(inp.value));
    onChange(parseFloat(inp.value));
  });
  g.appendChild(lab); g.appendChild(inp);
  return g;
}

function fmt(v) { return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2); }

function note(text) {
  const p = document.createElement('p');
  p.className = 'export-note';
  p.textContent = text;
  return p;
}
