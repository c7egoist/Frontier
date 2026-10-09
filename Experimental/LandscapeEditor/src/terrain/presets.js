// Landscape presets. Each one is an ordinary layer stack, so it can be opened, edited and re-saved like any other.
// Seeds are fixed per layer so a preset always reproduces the same terrain.
import { createLayer, createMask } from './catalog.js';

function stack(seedBase, list) {
  return list.map((layer, i) => ({ ...layer, seed: (seedBase + i * 131) % 9973 }));
}

const G = (type, overrides, extra) => createLayer('generator', type, overrides, extra);
const M = (type, overrides, extra) => createLayer('modifier', type, overrides, extra);
const E = (type, overrides, extra) => createLayer('erosion', type, overrides, extra);
const mask = (type, overrides, extra) => createMask(type, overrides, extra);

export const PRESETS = [
  {
    id: 'canyons',
    name: 'Canyons',
    subtitle: 'Sandstone canyons',
    description: 'Stepped sandstone tablelands cut by meandering slot canyons. Bedding on the walls, talus at the foot, sand on the floor.',
    settings: { worldSize: 5000, maxElevation: 1100, seaLevel: -400, seed: 1404, resolution: 256 },
    snowLine: 9999,
    palette: { rock: '#b5623c', soil: '#c99763', veg: '#8c8a5a', sand: '#dcb27a', snow: '#ffffff', water: '#3d6f86' },
    layers: stack(1404, [
      G('mesa', { freq: 2.2, steps: 5, edge: 0.1, warp: 0.25 }, { height: 800, base: 260 }),
      G('fbm', { freq: 6, octaves: 5, warp: 0.2 }, { height: 120, base: 0, blend: 'add' }),
      M('stratify', { thickness: 58, tilt: 2, contrast: 0.85, jitter: 10, strength: 0.75 }),
      M('rift', { width: 360, depth: 520, meander: 420, bearing: 30, walls: 2.2 }),
      M('rift', { width: 190, depth: 240, meander: 300, bearing: 110, walls: 2.6 }),
      E('fluvial', { erodibility: 0.6, mExp: 0.5, nExp: 1, rounds: 4, sweeps: 6, depositFrac: 0.6, uplift: 0 }),
      E('thermal', { talus: 36, rate: 0.25, iterations: 40 }),
      E('aeolian', { bearing: 240, strength: 0.35, lee: 0.5, iterations: 8 }),
    ]),
  },
  {
    id: 'sandstone-cliffs',
    name: 'Sandstone cliffs',
    subtitle: 'Layered escarpments',
    description: 'Flat-topped mesas whose faces are built from hard and soft beds. Ledges step down to talus slopes.',
    settings: { worldSize: 4000, maxElevation: 900, seaLevel: -300, seed: 2207, resolution: 256 },
    snowLine: 9999,
    palette: { rock: '#c67d4a', soil: '#a7794f', veg: '#7e7f55', sand: '#e0b681', snow: '#ffffff', water: '#3d6f86' },
    layers: stack(2207, [
      G('mesa', { freq: 1.6, steps: 3, edge: 0.08, warp: 0.3 }, { height: 520, base: 220 }),
      M('stratify', { thickness: 110, tilt: 1, contrast: 0.9, jitter: 18, strength: 1 }, {
        masks: [mask('altitude', { low: 240, high: 560, curve: 1.2 })],
      }),
      M('cliff', { threshold: 30, amount: 0.9, radius: 2 }),
      E('hydraulic', { drops: 60000, inertia: 0.05, capacity: 4, erodeRate: 0.3, depositRate: 0.3, evaporation: 0.02, radius: 3 }),
      E('thermal', { talus: 42, rate: 0.3, iterations: 60 }),
      E('fluvial', { erodibility: 0.35, rounds: 3, sweeps: 4 }),
    ]),
  },
  {
    id: 'coastal-cliffs',
    name: 'Coastal cliffs',
    subtitle: 'Sea-battered headlands',
    description: 'A rocky coast where cliffs rise straight from the sea. The coastal mask keeps the cliff edge soft, then falls off to beaches.',
    settings: { worldSize: 4000, maxElevation: 420, seaLevel: 0, seed: 3101, resolution: 256 },
    snowLine: 9999,
    palette: { rock: '#6e6962', soil: '#5f6f48', veg: '#5a7d46', sand: '#cdbf98', snow: '#f4f6f8', water: '#2f6f86' },
    layers: stack(3101, [
      G('fbm', { freq: 2.2, octaves: 6, warp: 0.4 }, { height: 600, base: -130 }),
      M('cliff', { threshold: 22, amount: 1, radius: 2 }, {
        masks: [mask('coastal', { width: 190, side: 0, curve: 0.6 }, { breakup: 'fbm', breakupAmount: 0.35, breakupScale: 5 })],
      }),
      M('terrace', { step: 34, edge: 0.2, strength: 0.5 }),
      E('hydraulic', { drops: 90000, inertia: 0.05, capacity: 4, erodeRate: 0.35, depositRate: 0.3, evaporation: 0.02, radius: 2 }),
      E('thermal', { talus: 45, rate: 0.35, iterations: 80 }),
    ]),
  },
  {
    id: 'himalaya',
    name: 'Himalayan mountain',
    subtitle: 'High range & deep gorges',
    description: 'Towering massifs with deep river gorges and a glacial band near the snowline. Erosion is strongest on the high ground.',
    settings: { worldSize: 12000, maxElevation: 7000, seaLevel: -1000, seed: 4242, resolution: 256 },
    snowLine: 4200,
    palette: { rock: '#6d6258', soil: '#7a6f56', veg: '#4f6b3c', sand: '#b8a57f', snow: '#f2f5f8', water: '#3d7d95' },
    layers: stack(4242, [
      G('mountain', { freq: 2.6, octaves: 7, warp: 0.4, ridgeMix: 0.75, peak: 1.6 }, { height: 6200, base: 300 }),
      M('rift', { width: 700, depth: 900, meander: 500, bearing: 60, walls: 1.2 }),
      E('fluvial', { erodibility: 0.75, mExp: 0.45, nExp: 1.1, rounds: 5, sweeps: 6, depositFrac: 0.4, uplift: 0.3 }),
      E('glacial', { ela: 4400, reach: 0.6, width: 500, strength: 0.5, passes: 2 }, {
        masks: [mask('altitude', { low: 3200, high: 4500, curve: 1 })],
      }),
      E('hydraulic', { drops: 150000, inertia: 0.05, capacity: 5, erodeRate: 0.4, depositRate: 0.25, evaporation: 0.02, radius: 3 }),
      E('thermal', { talus: 40, rate: 0.3, iterations: 80 }),
    ]),
  },
  {
    id: 'icelandic',
    name: 'Icelandic',
    subtitle: 'Volcanic shield & basalt',
    description: 'A shield volcano with a caldera, lava plateaus stacked in flows, basalt columns on the steep faces, and U-valleys carved by ice.',
    settings: { worldSize: 9000, maxElevation: 1500, seaLevel: 0, seed: 5150, resolution: 256 },
    snowLine: 900,
    palette: { rock: '#4b4a4f', soil: '#5b5a4e', veg: '#6c8a5b', sand: '#3a3838', snow: '#f5f8fb', water: '#3c6e88' },
    layers: stack(5150, [
      G('shield', { radius: 0.78, slope: 1.5, caldera: 0.35, rim: 0.3 }, { height: 1450, base: -40 }),
      G('ridge', { freq: 2.5, octaves: 5, warp: 0.3, sharpness: 1.8 }, { height: 260, base: 0, blend: 'add' }, {
        masks: [mask('altitude', { low: 300, high: 900, curve: 1.4 })],
      }),
      M('stratify', { thickness: 180, tilt: 0, contrast: 0.7, jitter: 40, strength: 0.6 }),
      G('voronoi', { freq: 9, warp: 0.1, jitter: 0.8, mode: 0.2 }, { height: 70, base: 0, blend: 'add' }, {
        masks: [mask('slope', { from: 15, to: 60, soft: 8 })],
      }),
      E('glacial', { ela: 700, reach: 0.4, width: 420, strength: 0.5, passes: 3 }),
      E('hydraulic', { drops: 80000, inertia: 0.05, capacity: 4, erodeRate: 0.3, depositRate: 0.3, evaporation: 0.02, radius: 3 }),
      E('thermal', { talus: 36, rate: 0.3, iterations: 50 }),
    ]),
  },
  {
    id: 'alps',
    name: 'Alps',
    subtitle: 'Glaciated alpine valleys',
    description: 'Sharp summits and broad U-shaped valleys. Glaciers have widened the valley floors; rivers have cut the flanks.',
    settings: { worldSize: 12000, maxElevation: 4800, seaLevel: -1000, seed: 6066, resolution: 256 },
    snowLine: 2300,
    palette: { rock: '#7a7468', soil: '#6f6a52', veg: '#587a3c', sand: '#b8ab88', snow: '#f7f9fb', water: '#3f7e97' },
    layers: stack(6066, [
      G('mountain', { freq: 2.2, octaves: 7, warp: 0.35, ridgeMix: 0.65, peak: 1.5 }, { height: 3800, base: 400 }),
      M('sharpen', { amount: 0.3, radius: 2 }),
      E('fluvial', { erodibility: 0.6, mExp: 0.5, nExp: 1, rounds: 4, sweeps: 5, depositFrac: 0.5 }),
      E('glacial', { ela: 2300, reach: 0.75, width: 550, strength: 0.7, passes: 4 }),
      E('hydraulic', { drops: 120000, inertia: 0.05, capacity: 4, erodeRate: 0.35, depositRate: 0.3, evaporation: 0.02, radius: 3 }),
      E('thermal', { talus: 37, rate: 0.3, iterations: 60 }),
    ]),
  },
  {
    id: 'snowy-mountains',
    name: 'Snowy mountains',
    subtitle: 'Sharp peaks & high snow',
    description: 'Ridge-dominated peaks above a high snowline. Cirques and arêtes form where ice has been longest.',
    settings: { worldSize: 9000, maxElevation: 5200, seaLevel: -1000, seed: 7300, resolution: 256 },
    snowLine: 1800,
    palette: { rock: '#6b6862', soil: '#66604f', veg: '#56703f', sand: '#aba48c', snow: '#ffffff', water: '#4c8aa0' },
    layers: stack(7300, [
      G('ridge', { freq: 3, octaves: 7, warp: 0.35, sharpness: 2.3, offset: 1.05 }, { height: 4300, base: 600 }),
      G('fbm', { freq: 5, octaves: 4, warp: 0.2 }, { height: 320, base: 0, blend: 'add' }),
      M('sharpen', { amount: 0.6, radius: 2 }),
      E('glacial', { ela: 1800, reach: 0.9, width: 380, strength: 0.8, passes: 5 }),
      E('fluvial', { erodibility: 0.55, rounds: 3, sweeps: 4 }),
      E('thermal', { talus: 40, rate: 0.35, iterations: 80 }),
    ]),
  },
  {
    id: 'rugged-outcrops',
    name: 'Rugged outcrops',
    subtitle: 'Fractured rock & boulder fields',
    description: 'Blocky outcrops broken by joints, scattered across ridged ground. Scree aprons pile at the base of each rock.',
    settings: { worldSize: 3000, maxElevation: 500, seaLevel: -200, seed: 8128, resolution: 256 },
    snowLine: 9999,
    palette: { rock: '#8b7b6a', soil: '#7c6e5c', veg: '#7b8a4c', sand: '#c9b38e', snow: '#f1f2f2', water: '#43768a' },
    layers: stack(8128, [
      G('ridge', { freq: 2, octaves: 6, warp: 0.4, sharpness: 1.9 }, { height: 380, base: 60 }),
      G('voronoi', { freq: 6, warp: 0.25, jitter: 0.95, mode: 0.65 }, { height: 170, base: 0, blend: 'add' }, {
        masks: [mask('noise', { freq: 3, threshold: 0.52, soft: 0.12 }, { breakup: 'cellular', breakupAmount: 0.3, breakupScale: 6 })],
      }),
      M('cliff', { threshold: 42, amount: 0.5, radius: 2 }),
      E('hydraulic', { drops: 60000, inertia: 0.05, capacity: 4, erodeRate: 0.3, depositRate: 0.3, evaporation: 0.02, radius: 2 }),
      E('thermal', { talus: 44, rate: 0.35, iterations: 90 }),
    ]),
  },
  {
    id: 'desert-dunes',
    name: 'Desert dunes',
    subtitle: 'Wind-built sand seas',
    description: 'Crest-and-slipface dunes built by prevailing wind, sand sheets between them. Deposition builds up on the lee side.',
    settings: { worldSize: 3000, maxElevation: 260, seaLevel: -500, seed: 9009, resolution: 256 },
    snowLine: 9999,
    palette: { rock: '#b99a7a', soil: '#c9a57d', veg: '#a09a6a', sand: '#e3bd8c', snow: '#ffffff', water: '#3d6f86' },
    layers: stack(9009, [
      G('fbm', { freq: 1.5, octaves: 4, warp: 0.25 }, { height: 80, base: 40 }),
      G('dunes', { wavelength: 180, bearing: 60, sharpness: 1.2, sheet: 0.35, warp: 0.45 }, { height: 140, base: 40, blend: 'add' }, {
        masks: [mask('noise', { freq: 2.5, threshold: 0.5, soft: 0.2 })],
      }),
      E('aeolian', { bearing: 240, strength: 0.7, lee: 0.8, iterations: 30 }),
      E('thermal', { talus: 32, rate: 0.12, iterations: 12 }),
    ]),
  },
  {
    id: 'rocky-desert',
    name: 'Rocky desert',
    subtitle: 'Mesas, wadis & boulder plains',
    description: 'Tablelands and rock-strewn plains cut by dry washes. Wind scours the flats and drops sand against the rock.',
    settings: { worldSize: 5000, maxElevation: 900, seaLevel: -400, seed: 1771, resolution: 256 },
    snowLine: 9999,
    palette: { rock: '#9a7150', soil: '#b08a62', veg: '#8f8a5a', sand: '#d6b48a', snow: '#ffffff', water: '#3d6f86' },
    layers: stack(1771, [
      G('mesa', { freq: 1.2, steps: 6, edge: 0.2, warp: 0.3 }, { height: 320, base: 150 }),
      G('voronoi', { freq: 6, warp: 0.2, jitter: 0.9, mode: 0.6 }, { height: 70, base: 0, blend: 'add' }, {
        masks: [mask('slope', { from: 25, to: 60, soft: 8 })],
      }),
      M('stratify', { thickness: 45, tilt: 5, contrast: 0.5, jitter: 6, strength: 0.5 }, {
        masks: [mask('altitude', { low: 150, high: 300, curve: 1 })],
      }),
      M('rift', { width: 180, depth: 90, meander: 300, bearing: 80, walls: 1.5 }),
      E('fluvial', { erodibility: 0.45, rounds: 3, sweeps: 4, depositFrac: 0.7 }),
      E('aeolian', { bearing: 220, strength: 0.4, lee: 0.5, iterations: 10 }),
      E('thermal', { talus: 40, rate: 0.3, iterations: 40 }),
    ]),
  },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
