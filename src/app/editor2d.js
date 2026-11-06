// 2D mask editor: resolution-independent paint canvas.
// Strokes are stored as world-space capsule polylines; the canvas re-rasterizes
// at any zoom, so the world is infinite and the mask rebuilds at any resolution.
import { createStroke, appendPoint, rasterizeLayer } from '../core/mask2d.js';

export class Editor2D {
  constructor(canvas, store, hud) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store;
    this.hud = hud;
    this.cam = { x: 0, z: 0, scale: 0.5 }; // world center + px per meter
    this.tool = 'brush';
    this.brushRadius = 30;
    this.currentStroke = null;
    this.dragging = false;
    this.panning = false;
    this.boxStart = null;
    this.lastPointer = null;
    this._bind();
    this.resize();
  }

  resize() {
    const wrap = this.canvas.parentElement;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = wrap.clientWidth * dpr;
    this.canvas.height = wrap.clientHeight * dpr;
    this.dpr = dpr;
    this.draw();
  }

  toWorld(sx, sy) {
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    return {
      x: this.cam.x + (sx - w / 2) / this.cam.scale,
      z: this.cam.z + (sy - h / 2) / this.cam.scale,
    };
  }
  toScreen(wx, wz) {
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    return {
      x: (wx - this.cam.x) * this.cam.scale + w / 2,
      y: (wz - this.cam.z) * this.cam.scale + h / 2,
    };
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const before = this.toWorld(sx, sy);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.cam.scale = Math.max(0.02, Math.min(40, this.cam.scale * factor));
      const after = this.toWorld(sx, sy);
      this.cam.x += before.x - after.x;
      this.cam.z += before.z - after.z;
      this.hud.zoom = this.cam.scale;
      this.draw();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'b') this.setTool('brush');
      else if (k === 'e') this.setTool('erase');
      else if (k === 'h') this.setTool('pan');
      else if (k === 'r') this.setTool('box');
      else if (k === '+' || k === '=') this.brushRadius = Math.min(300, this.brushRadius * 1.2);
      else if (k === '-') this.brushRadius = Math.max(2, this.brushRadius / 1.2);
    });
  }

  setTool(t) {
    this.tool = t;
    document.querySelectorAll('#toolbar-2d [data-tool]').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === t);
    });
  }

  onDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = this.toWorld(sx, sy);
    this.lastPointer = { sx, sy };
    if (this.tool === 'pan' || e.button === 1 || e.spaceKey) {
      this.panning = true;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (this.tool === 'box') {
      this.boxStart = w;
      this.store.selection = null;
      this.emitSelection();
      return;
    }
    const layer = this.store.activeLayer();
    if (!layer) return;
    this.store.pushUndo();
    this.currentStroke = createStroke([{ x: w.x, y: w.z }], this.brushRadius, this.tool === 'erase' ? 'erase' : 'add', layer.id);
    layer.strokes.push(this.currentStroke);
    this.dragging = true;
    this.canvas.setPointerCapture(e.pointerId);
  }

  onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const w = this.toWorld(sx, sy);
    this.hud.cursor = { x: w.x, z: w.z };
    if (this.panning && this.lastPointer) {
      this.cam.x -= (sx - this.lastPointer.sx) / this.cam.scale;
      this.cam.z -= (sy - this.lastPointer.sy) / this.cam.scale;
      this.lastPointer = { sx, sy };
      this.draw();
      return;
    }
    this.lastPointer = { sx, sy };
    if (this.dragging && this.currentStroke) {
      appendPoint(this.currentStroke, w.x, w.z, this.brushRadius * 0.15);
      this.draw();
      return;
    }
    if (this.boxStart) {
      this.store.selection = normRect(this.boxStart, w);
      this.emitSelection();
      this.draw();
    }
  }

  onUp() {
    if (this.dragging) { this.dragging = false; this.currentStroke = null; this.store.emit('doc'); }
    if (this.boxStart) { this.boxStart = null; }
    this.panning = false;
  }

  emitSelection() {
    const sel = this.store.selection;
    const add = document.getElementById('btn-add-region');
    const clr = document.getElementById('btn-clear-selection');
    if (add) add.disabled = !sel;
    if (clr) clr.disabled = !sel;
  }

  addSelectionToActiveLayer() {
    const layer = this.store.activeLayer();
    const sel = this.store.selection;
    if (!layer || !sel) return;
    this.store.pushUndo();
    layer.regions.push({ ...sel });
    this.store.selection = null;
    this.emitSelection();
    this.store.emit('doc');
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, w, h);

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    const step = 100 * this.cam.scale;
    if (step > 12) {
      ctx.beginPath();
      for (let x = (-this.cam.x * this.cam.scale) % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = (-this.cam.z * this.cam.scale) % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    }

    // layers (bottom to top)
    const layers = [...this.store.doc.layers].reverse();
    for (const layer of layers) {
      if (!layer.visible) continue;
      // region rect
      const r = layer.region;
      const a = this.toScreen(r.x, r.y), b = this.toScreen(r.x + r.w, r.y + r.h);
      ctx.fillStyle = hexA(layer.color, 0.06);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = hexA(layer.color, 0.35);
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
      for (const reg of layer.regions || []) {
        const ra = this.toScreen(reg.x, reg.y), rb = this.toScreen(reg.x + reg.w, reg.y + reg.h);
        ctx.fillStyle = hexA(layer.color, 0.12);
        ctx.fillRect(ra.x, ra.y, rb.x - ra.x, rb.y - ra.y);
        ctx.strokeStyle = hexA(layer.color, 0.6);
        ctx.strokeRect(ra.x, ra.y, rb.x - ra.x, rb.y - ra.y);
      }
      // strokes as filled capsules
      for (const s of layer.strokes) {
        ctx.strokeStyle = s.mode === 'erase' ? 'rgba(255,90,80,0.9)' : hexA(layer.color, 0.85);
        ctx.lineWidth = Math.max(1.5, s.radius * 2 * this.cam.scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        s.points.forEach((p, i) => {
          const sp = this.toScreen(p.x, p.y);
          if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
        });
        ctx.stroke();
      }
    }

    // active layer highlight
    const al = this.store.activeLayer();
    if (al && al.visible) {
      const r = al.region;
      const a = this.toScreen(r.x, r.y), b = this.toScreen(r.x + r.w, r.y + r.h);
      ctx.strokeStyle = 'rgba(90,200,250,0.8)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }

    // box selection
    const sel = this.store.selection;
    if (sel) {
      const a = this.toScreen(sel.x, sel.y), b = this.toScreen(sel.x + sel.w, sel.y + sel.h);
      ctx.fillStyle = 'rgba(90,200,250,0.12)';
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = 'rgba(90,200,250,0.9)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }

    // brush cursor
    if ((this.tool === 'brush' || this.tool === 'erase') && this.lastPointer) {
      ctx.strokeStyle = this.tool === 'erase' ? 'rgba(255,90,80,0.8)' : 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(this.lastPointer.sx, this.lastPointer.sy, this.brushRadius * this.cam.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function normRect(a, b) {
  return {
    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y),
  };
}

function hexA(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
