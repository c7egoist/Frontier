/* ════════════════════════════════════════════════════════════════════════════════════════════
   BILLBOARD LAYER
   Every entity in the world gets a screen-space marker projected from its 3D anchor. The marker
   IS the handle: hover names it, click selects it, click again (or the gear) opens its settings
   popup right where the object lives. DOM is used instead of sprites so the glyphs stay crisp,
   the labels stay legible at any distance, and hit-testing is exact.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { flat, typeOf, effectiveVis } from './world.js';
import { ic } from './icons.js';
import { el } from './kit.js';

export function createBillboards(host, vp, { onSelect, onOpen, onContext } = {}) {
  const chips = new Map();       // node.id → element
  let visibleCats = new Set();   // category filter driven by the viewport toolbar
  let selection = new Set();
  let labelMode = 'hover';       // hover | always | none
  const v = new THREE.Vector3();

  function rebuild(nodes) {
    const wanted = new Set(nodes.map(n => n.id));
    chips.forEach((elm, id) => { if (!wanted.has(id)) { elm.remove(); chips.delete(id); } });
    nodes.forEach(n => { if (!chips.has(n.id)) chips.set(n.id, make(n)); });
  }

  function make(node) {
    const t = typeOf(node);
    const b = el('div', 'bb');
    b.dataset.id = node.id;
    b.innerHTML =
      `<div class="ring"></div>
       <div class="disc">${ic(t.icon, { size: 15, color: t.color })}</div>
       <div class="tag"></div>`;
    b.querySelector('.tag').textContent = node.name;
    b.addEventListener('pointerdown', e => e.stopPropagation());
    b.addEventListener('click', e => {
      e.stopPropagation();
      const already = selection.has(node.id) && selection.size === 1;
      onSelect && onSelect(node, e);
      if (already || e.detail === 2) onOpen && onOpen(node, b);
    });
    b.addEventListener('dblclick', e => { e.stopPropagation(); onOpen && onOpen(node, b); });
    b.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); onContext && onContext(node, e); });
    host.appendChild(b);
    return b;
  }

  /* declutter: markers are sorted front-to-back, and a marker that lands on top of a nearer one
     loses its label and fades, so a crowded scene never turns into a wall of pills. */
  function update() {
    const cam = vp.camera;
    const rect = host.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const list = [];

    chips.forEach((elm, id) => {
      const node = flat.find(n => n.id === id);
      if (!node) { elm.remove(); chips.delete(id); return; }
      const a = vp.anchors.get(id);
      const t = typeOf(node);
      if (!a || !visibleCats.has(t.cat)) { elm.style.display = 'none'; return; }
      v.copy(a).project(cam);
      if (v.z > 1) { elm.style.display = 'none'; return; }
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (x < -80 || y < -60 || x > w + 80 || y > h + 60) { elm.style.display = 'none'; return; }
      const dist = cam.position.distanceTo(a);
      list.push({ elm, node, x, y, dist, id });
    });

    list.sort((p, q) => p.dist - q.dist);
    const placed = [];
    list.forEach(item => {
      const { elm, node, x, y, dist } = item;
      const sel = selection.has(item.id);
      const scale = THREE.MathUtils.clamp(1.12 - Math.log10(Math.max(dist, 1)) * 0.16, 0.72, 1.12);
      let crowded = false;
      const gapX = labelMode === 'always' ? 116 : 34;   // labels need far more room than discs
      for (const p of placed) { if (Math.abs(p.x - x) < gapX && Math.abs(p.y - y) < 30) { crowded = true; break; } }
      placed.push(item);

      elm.style.display = 'flex';
      elm.style.transform = `translate3d(${(x - 15).toFixed(1)}px, ${(y - 15).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      elm.style.zIndex = String(4000 - Math.round(dist * 4));
      elm.classList.toggle('sel', sel);
      elm.classList.toggle('dim', crowded && !sel);
      elm.classList.toggle('muted', !effectiveVis(node));
      elm.classList.toggle('named', labelMode === 'always' && !crowded);
      if (labelMode === 'none' && !sel) elm.classList.remove('named');
      const tag = elm.querySelector('.tag');
      if (tag.textContent !== node.name) tag.textContent = node.name;
    });
  }

  return {
    rebuild, update,
    setSelection(ids) { selection = new Set(ids); },
    setCategories(cats) { visibleCats = new Set(cats); },
    setLabelMode(m) { labelMode = m; },
    elementFor(id) { return chips.get(id); },
    screenPos(id) {
      const elm = chips.get(id);
      if (!elm || elm.style.display === 'none') return null;
      const r = elm.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },
  };
}
