/* Flux presets — compositions tuned to the reference looks. */
import {defaultLayer, defaultComp} from './state.js';

function deepMerge(base, over) {
  if (Array.isArray(over)) return [...over];
  if (over && typeof over === 'object') {
    const out = {...base};
    for (const k of Object.keys(over)) out[k] = deepMerge(base?.[k], over[k]);
    return out;
  }
  return over === undefined ? base : over;
}

const L = (id, n, over) => deepMerge(defaultLayer(id, n), over);

/** Expand a preset into a full {comp, layers, nextId} document. */
export function buildPreset(p) {
  const comp = deepMerge(defaultComp(), {name: p.name, ...(p.comp || {})});
  const layers = (p.layers || []).map((l, i) => L(`l${i + 1}`, i + 1, l));
  return {comp, layers, nextId: layers.length + 1, selected: layers[0]?.id || null};
}

export const STARTER = {
  key: 'starter', name: 'First Light',
  comp: {duration: 8, background: '#050507'},
  layers: [
    {name: 'Violet streams', emitter: {shape: 'line', count: 8000, life: 5, speed: 3.2, spread: 0.25, dir: [1, 0.25, 0], length: 4},
     forces: {gravity: 0, turbAmp: 1.6, turbScale: 0.3, turbSpeed: 0.8},
     look: {size0: 0.16, size1: 0.07, stretch: 2.6, bright: 1.5, colA: '#4ad7ff', colB: '#8a5cff', colC: '#ff7ae0'}},
    {name: 'Gold dust', emitter: {shape: 'sphere', count: 2500, life: 6, speed: 0.7, spread: 1, radius: 7},
     forces: {gravity: -0.3, turbAmp: 0.7, turbScale: 0.5, turbSpeed: 0.4},
     look: {size0: 0.12, size1: 0.05, stretch: 0, bright: 1.2, colA: '#ffe9a8', colB: '#f6c66a', colC: '#b78cff'}},
  ],
};

export const PRESETS = [
  {key: 'prism-burst', name: 'Prism Burst', sub: 'Radial starburst · silk streaks', grad: ['#bfe9ff', '#8a5cff'],
   comp: {duration: 6},
   layers: [
     {name: 'Burst silk', emitter: {shape: 'sphere', count: 12000, life: 3.2, speed: 7, spread: 1, radius: 0.6},
      forces: {gravity: 0, turbAmp: 0.5, turbScale: 0.4, turbSpeed: 0.6},
      look: {size0: 0.14, size1: 0.04, stretch: 3.2, bright: 1.7, colA: '#ffffff', colB: '#7ec8ff', colC: '#ff8ad8'},
      burst: {on: true, time: 0.4, power: 14}},
     {name: 'Core glow', emitter: {shape: 'sphere', count: 1500, life: 2, speed: 1.2, spread: 1, radius: 1.2},
      forces: {gravity: 0, turbAmp: 0.3},
      look: {size0: 0.5, size1: 0.1, stretch: 0, bright: 2.2, colA: '#ffffff', colB: '#ffd9f2', colC: '#8a5cff'},
      burst: {on: true, time: 0.4, power: 6}},
   ]},
  {key: 'nebula-flow', name: 'Iris Flow', sub: 'Blue/gold ribbons · deep curl', grad: ['#4ad7ff', '#f6c66a'],
   comp: {duration: 10},
   layers: [
     {name: 'Ribbons', emitter: {shape: 'box', count: 10000, life: 7, speed: 1.6, spread: 0.7, dir: [1, 0.15, 0.2], width: 6, height: 5, depth: 6},
      forces: {gravity: 0, turbAmp: 2.6, turbScale: 0.22, turbSpeed: 0.55},
      look: {size0: 0.2, size1: 0.08, stretch: 2.8, bright: 1.5, colA: '#4ad7ff', colB: '#7e8fff', colC: '#f6c66a'}},
     {name: 'Ember grain', emitter: {shape: 'box', count: 3000, life: 6, speed: 0.9, spread: 1, width: 10, height: 7, depth: 10},
      forces: {gravity: -0.4, turbAmp: 1, turbScale: 0.4, turbSpeed: 0.4},
      look: {size0: 0.09, size1: 0.04, stretch: 0.4, bright: 1.3, colA: '#ffd9a0', colB: '#ff9a5c', colC: '#4ad7ff'}},
   ]},
  {key: 'voxel-bloom', name: 'Voxel Bloom', sub: 'Green/orange radial flower', grad: ['#9dff6e', '#ff9a3c'],
   comp: {duration: 6},
   layers: [
     {name: 'Petals', emitter: {shape: 'sphere', count: 9000, life: 3, speed: 5.5, spread: 1, radius: 0.8},
      forces: {gravity: 0.5, turbAmp: 1.4, turbScale: 0.5, turbSpeed: 0.9},
      look: {size0: 0.16, size1: 0.05, stretch: 2.2, bright: 1.6, colA: '#eaffd0', colB: '#6ee85c', colC: '#ff8a3c', shape: 'cube', tumble: 2.4, blending: 'normal'},
      burst: {on: true, time: 0.3, power: 12}},
   ]},
  {key: 'silver-tide', name: 'Silver Tide', sub: 'Moonlit contour streams', grad: ['#f4f4f5', '#8a9aa8'],
   comp: {duration: 12, bloom: {strength: 0.7}},
   layers: [
     {name: 'Tide lines', emitter: {shape: 'line', count: 7000, life: 8, speed: 1.4, spread: 0.2, dir: [1, 0.1, 0], length: 3},
      forces: {gravity: 0, turbAmp: 2.2, turbScale: 0.16, turbSpeed: 0.45},
      look: {size0: 0.1, size1: 0.05, stretch: 3.4, bright: 1.35, colA: '#ffffff', colB: '#cfd8de', colC: '#5c6b78'}},
     {name: 'Drift motes', emitter: {shape: 'box', count: 1200, life: 9, speed: 0.4, spread: 1, width: 16, height: 8, depth: 10},
      forces: {gravity: -0.2, turbAmp: 0.5},
      look: {size0: 0.14, size1: 0.06, stretch: 0, bright: 1.1, colA: '#ffffff', colB: '#dfe3e6', colC: '#8a9aa8'}},
   ]},
  {key: 'teal-current', name: 'Teal Current', sub: 'Electric river · spray', grad: ['#2ee6c8', '#0e7d8c'],
   comp: {duration: 9},
   layers: [
     {name: 'Current', emitter: {shape: 'box', count: 11000, life: 5.5, speed: 4.5, spread: 0.3, dir: [1, -0.05, 0], width: 3, height: 4, depth: 7},
      forces: {gravity: -0.6, turbAmp: 1.1, turbScale: 0.35, turbSpeed: 1},
      look: {size0: 0.12, size1: 0.05, stretch: 3, bright: 1.6, colA: '#d8fff6', colB: '#2ee6c8', colC: '#0e7d8c'}},
     {name: 'Spray', emitter: {shape: 'disc', count: 2000, life: 3, speed: 2.5, spread: 0.8, dir: [0, 1, 0], radius: 4},
      forces: {gravity: -3, turbAmp: 0.6},
      look: {size0: 0.1, size1: 0.04, stretch: 0.6, bright: 1.4, colA: '#ffffff', colB: '#7ef2dd', colC: '#0e7d8c'}},
   ]},
  {key: 'violet-split', name: 'Violet Split', sub: 'Twin magenta/cyan jets', grad: ['#ff7ae0', '#4ad7ff'],
   comp: {duration: 8},
   layers: [
     {name: 'Jet cyan', emitter: {shape: 'disc', count: 6000, life: 4.5, speed: 4, spread: 0.35, dir: [1, 0.3, 0], pos: [-4, 0, 0], radius: 1.4},
      forces: {gravity: 0, turbAmp: 1.3, turbScale: 0.3, turbSpeed: 0.8},
      look: {size0: 0.15, size1: 0.06, stretch: 2.8, bright: 1.6, colA: '#d8f6ff', colB: '#4ad7ff', colC: '#2b6cff'}},
     {name: 'Jet magenta', emitter: {shape: 'disc', count: 6000, life: 4.5, speed: 4, spread: 0.35, dir: [-1, 0.35, 0], pos: [4, 0.5, 0], radius: 1.4},
      forces: {gravity: 0, turbAmp: 1.3, turbScale: 0.3, turbSpeed: 0.8},
      look: {size0: 0.15, size1: 0.06, stretch: 2.8, bright: 1.6, colA: '#ffe3f6', colB: '#ff7ae0', colC: '#8a2be2'}},
   ]},
  {key: 'jade-flower', name: 'Jade Flower', sub: 'Petal ring · dotted halo', grad: ['#6effa8', '#1d5c4d'],
   comp: {duration: 10},
   layers: [
     {name: 'Petals', emitter: {shape: 'ring', count: 8000, life: 6, speed: 1.1, spread: 0.5, dir: [0, 1, 0], radius: 2.2},
      forces: {gravity: 0.4, turbAmp: 1, turbScale: 0.45, turbSpeed: 0.5},
      look: {size0: 0.16, size1: 0.06, stretch: 1.6, bright: 1.5, colA: '#eafff2', colB: '#4fe08a', colC: '#1d5c4d'}},
     {name: 'Halo dots', emitter: {shape: 'ring', count: 1500, life: 8, speed: 0.25, spread: 0.1, dir: [0, 1, 0], radius: 3.4},
      forces: {gravity: 0, turbAmp: 0.25, turbScale: 0.6, turbSpeed: 0.3},
      look: {size0: 0.11, size1: 0.08, stretch: 0, bright: 1.8, colA: '#ffffff', colB: '#a8ffd0', colC: '#4fe08a'}},
   ]},
];
