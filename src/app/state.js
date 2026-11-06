// Central document model + tiny observable store + undo/redo.
import { createLandform } from '../core/landforms.js';

let layerSeq = 1;

export function createLayer(name = `Layer ${layerSeq++}`, color = '#4ade80') {
  return {
    id: `layer-${Date.now().toString(36)}-${layerSeq}`,
    name,
    color,
    visible: true,
    strokes: [],        // resolution-independent 2D capsule strokes
    regions: [],        // box-selected rects {x,y,w,h} added to this layer
    requireStrokes: false,
    baseHeight: 10,     // flat slab height above sea level (m)
    edgeWidth: 25,      // smooth edge blur width (m)
    landforms: [],      // per-layer landform stack
  };
}

export function defaultDocument() {
  const doc = {
    name: 'Untitled Landscape',
    layers: [],
    activeLayerId: null,
    activeSubId: null, // selected landform id within active layer
  };
  const l = createLayer('Desert', '#eccd8d');
  l.region = { x: -400, y: -400, w: 800, h: 800 };
  l.landforms.push(createLandform('dunes'));
  l.landforms.push(createLandform('fractal', { amplitude: 25 }));
  doc.layers.push(l);
  doc.activeLayerId = l.id;
  return doc;
}

export class Store {
  constructor() {
    this.doc = defaultDocument();
    this.listeners = new Set();
    this.undoStack = [];
    this.redoStack = [];
    this.mode = 'mask'; // 'mask' | 'landscape'
    this.selection = null; // {x,y,w,h} box selection in 2D editor
  }
  onChange(fn) { this.listeners.add(fn); }
  emit(what = 'doc') { for (const fn of this.listeners) fn(what); }
  snapshot() { return JSON.stringify(this.doc); }
  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.doc = JSON.parse(this.undoStack.pop());
    this.emit('doc');
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.doc = JSON.parse(this.redoStack.pop());
    this.emit('doc');
  }
  activeLayer() { return this.doc.layers.find((l) => l.id === this.doc.activeLayerId) || null; }
  selectLayer(id) { this.doc.activeLayerId = id; this.doc.activeSubId = null; this.emit('doc'); }
  addLayer() {
    this.pushUndo();
    const l = createLayer();
    this.doc.layers.unshift(l); // newest at top
    this.doc.activeLayerId = l.id;
    this.emit('doc');
  }
  removeLayer(id) {
    this.pushUndo();
    this.doc.layers = this.doc.layers.filter((l) => l.id !== id);
    if (this.doc.activeLayerId === id) this.doc.activeLayerId = this.doc.layers[0]?.id || null;
    this.emit('doc');
  }
  addLandform(layerId, type) {
    this.pushUndo();
    const l = this.doc.layers.find((x) => x.id === layerId);
    if (!l) return;
    const lf = createLandform(type);
    l.landforms.push(lf);
    this.doc.activeSubId = lf.id;
    this.emit('doc');
  }
  removeLandform(layerId, lfId) {
    this.pushUndo();
    const l = this.doc.layers.find((x) => x.id === layerId);
    if (l) l.landforms = l.landforms.filter((f) => f.id !== lfId);
    if (this.doc.activeSubId === lfId) this.doc.activeSubId = null;
    this.emit('doc');
  }
  setMode(mode) { this.mode = mode; this.emit('mode'); }
  save() {
    localStorage.setItem('frontier-landscape-doc', this.snapshot());
  }
  load() {
    const raw = localStorage.getItem('frontier-landscape-doc');
    if (raw) { this.doc = JSON.parse(raw); this.emit('doc'); return true; }
    return false;
  }
  exportJSON() {
    const blob = new Blob([JSON.stringify(this.doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.doc.name.replace(/\s+/g, '-')}.frontier-landscape.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
