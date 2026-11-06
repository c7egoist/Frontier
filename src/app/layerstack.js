// Left dock — mask layer stack (Outliner). Each layer card expands to show its
// own landform sub-stack, so every mask layer owns an independent generator stack.
import { LANDFORM_TYPES, LANDFORM_ORDER } from '../core/landforms.js';

export class LayerStackUI {
  constructor(store) {
    this.store = store;
    this.listEl = document.getElementById('tp-layer-list');
    this.countEl = document.getElementById('tp-layer-count');
    document.getElementById('tp-btn-add-layer').addEventListener('click', () => store.addLayer());
    document.getElementById('tp-layer-search-input').addEventListener('input', () => this.render());
  }

  render() {
    const q = (document.getElementById('tp-layer-search-input').value || '').toLowerCase();
    const layers = this.store.doc.layers.filter((l) => l.name.toLowerCase().includes(q));
    this.countEl.textContent = this.store.doc.layers.length;
    this.listEl.innerHTML = '';
    for (const layer of layers) {
      this.listEl.appendChild(this.layerCard(layer));
    }
  }

  layerCard(layer) {
    const card = document.createElement('div');
    card.className = 'tp-layer-card' + (layer.id === this.store.doc.activeLayerId ? ' selected' : '');
    card.addEventListener('click', () => this.store.selectLayer(layer.id));

    const row = document.createElement('div');
    row.className = 'tp-layer-row';
    row.innerHTML = `
      <span class="tp-layer-glyph" style="background:${layer.color}">M</span>
      <span class="tp-layer-name"></span>
      <span class="tp-layer-meta" style="display:contents">
        <button class="tp-layer-vis ${layer.visible ? '' : 'off'}" title="Toggle visibility">${layer.visible ? '👁' : '–'}</button>
      </span>`;
    const nameEl = row.querySelector('.tp-layer-name');
    nameEl.textContent = layer.name;
    nameEl.title = 'Click to rename';
    nameEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.value = layer.name;
      nameEl.textContent = '';
      nameEl.appendChild(input);
      input.focus();
      input.addEventListener('blur', () => {
        this.store.pushUndo();
        layer.name = input.value || layer.name;
        this.store.emit('doc');
      });
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); });
    });
    row.querySelector('.tp-layer-vis').addEventListener('click', (e) => {
      e.stopPropagation();
      this.store.pushUndo();
      layer.visible = !layer.visible;
      this.store.emit('doc');
    });
    card.appendChild(row);

    const meta = document.createElement('div');
    meta.className = 'tp-layer-meta';
    meta.innerHTML = `<span>${layer.strokes.length} strokes</span><span>${layer.regions.length} regions</span><span>${layer.landforms.length} landforms</span>`;
    card.appendChild(meta);

    // per-layer landform sub-stack
    const sub = document.createElement('div');
    sub.className = 'tp-substack';
    const head = document.createElement('div');
    head.className = 'tp-substack-head';
    head.innerHTML = `<span>Landform stack</span>`;
    const add = document.createElement('button');
    add.className = 'tp-sub-add';
    add.textContent = '+';
    add.title = 'Add landform generator to this layer';
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showAddMenu(add, layer.id);
    });
    head.appendChild(add);
    sub.appendChild(head);

    for (const lf of layer.landforms) {
      const spec = LANDFORM_TYPES[lf.type];
      const item = document.createElement('div');
      item.className = 'tp-sub-item' + (lf.id === this.store.doc.activeSubId ? ' selected' : '');
      item.innerHTML = `<span class="dot" style="background:${spec.color}"></span><span class="nm">${spec.label}</span>
        <button class="vis ${lf.visible ? '' : 'off'}">${lf.visible ? '👁' : '–'}</button>
        <button class="del">✕</button>`;
      item.addEventListener('click', () => {
        this.store.selectLayer(layer.id);
        this.store.doc.activeSubId = lf.id;
        this.store.emit('doc');
      });
      item.querySelector('.vis').addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.pushUndo();
        lf.visible = !lf.visible;
        this.store.emit('doc');
      });
      item.querySelector('.del').addEventListener('click', (e) => {
        e.stopPropagation();
        this.store.removeLandform(layer.id, lf.id);
      });
      sub.appendChild(item);
    }
    card.appendChild(sub);
    return card;
  }

  showAddMenu(anchor, layerId) {
    this.removeMenu();
    const menu = document.createElement('div');
    menu.className = 'panel-section';
    menu.style.cssText = 'position:fixed;z-index:100;background:#141416;border:1px solid rgba(255,255,255,0.13);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:2px;min-width:180px;box-shadow:0 12px 32px rgba(0,0,0,0.5)';
    for (const type of LANDFORM_ORDER) {
      const spec = LANDFORM_TYPES[type];
      const b = document.createElement('button');
      b.className = 'tp-sub-item';
      b.style.cursor = 'pointer';
      b.innerHTML = `<span class="dot" style="background:${spec.color}"></span><span class="nm">${spec.label}</span>`;
      b.addEventListener('click', () => {
        this.store.addLandform(layerId, type);
        this.removeMenu();
      });
      menu.appendChild(b);
    }
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${r.left - 160}px`;
    menu.style.top = `${r.bottom + 4}px`;
    document.body.appendChild(menu);
    this._menu = menu;
    setTimeout(() => document.addEventListener('pointerdown', this._menuClose = (e) => {
      if (!menu.contains(e.target)) this.removeMenu();
    }), 0);
  }

  removeMenu() {
    if (this._menu) { this._menu.remove(); this._menu = null; }
    if (this._menuClose) { document.removeEventListener('pointerdown', this._menuClose); this._menuClose = null; }
  }
}
