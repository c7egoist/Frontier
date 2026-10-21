/* Flux store — composition state + snapshot undo. Pure, no DOM. */

export function defaultLayer(id, n, over = {}) {
  return {
    id, name: `Emitter ${n}`, visible: true, opacity: 1,
    seed: Math.floor(Math.random() * 1e9),
    emitter: {
      shape: 'sphere', count: 6000, life: 4, speed: 3, spread: 0.6,
      dir: [0, 1, 0], pos: [0, 0, 0],
      radius: 3, length: 10, width: 8, height: 2, depth: 8,
    },
    forces: {gravity: -2, wind: [0, 0], turbAmp: 1.2, turbScale: 0.35, turbSpeed: 0.7},
    look: {
      shape: 'shard', tumble: 1.2,
      size0: 0.22, size1: 0.1, stretch: 1.5, bright: 1.4,
      colA: '#7ee7ff', colB: '#b78cff', colC: '#f6c66a', colBias: 0.5,
      blending: 'add',
    },
    burst: {on: false, time: 2, power: 10},
    ...over,
  };
}

export function defaultComp() {
  return {
    name: 'Untitled', duration: 8,
    background: '#050507',
    bloom: {on: true, strength: 0.9, radius: 0.55, threshold: 0},
    trails: {on: true, damp: 0.88},
  };
}

export function createStore(initial) {
  const listeners = new Set();
  const store = {
    comp: initial?.comp || defaultComp(),
    layers: initial?.layers || [defaultLayer('l1', 1)],
    nextId: initial?.nextId || 2,
    selected: initial?.selected || null,
    dirty: false,
    past: [], future: [],

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify(tag = 'comp') { for (const fn of listeners) fn(tag); },

    snapshot() {
      return JSON.stringify({comp: store.comp, layers: store.layers, nextId: store.nextId});
    },
    restore(json) {
      const s = JSON.parse(json);
      store.comp = s.comp; store.layers = s.layers; store.nextId = s.nextId;
      if (!store.layers.some((l) => l.id === store.selected)) {
        store.selected = store.layers[0]?.id || null;
      }
      store.dirty = true;
    },
    commit(label, fn) {
      store.past.push(store.snapshot());
      if (store.past.length > 60) store.past.shift();
      store.future.length = 0;
      fn();
      store.dirty = true;
      store.notify('comp');
    },
    undo() {
      if (!store.past.length) return false;
      store.future.push(store.snapshot());
      store.restore(store.past.pop());
      store.notify('comp');
      return true;
    },
    redo() {
      if (!store.future.length) return false;
      store.past.push(store.snapshot());
      store.restore(store.future.pop());
      store.notify('comp');
      return true;
    },
    markSaved() { store.dirty = false; store.notify('saved'); },
  };
  if (!store.selected) store.selected = store.layers[0]?.id || null;
  return store;
}

export const layerById = (store, id) => store.layers.find((l) => l.id === id);
