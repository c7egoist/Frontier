// Evaluates a layer stack top to bottom into a heightmap plus the diagnostics the satmaps read.
//
// Layer kinds:
//   generator - base shape. Writes a new elevation through its blend mode.
//   modifier  - sculpting operation (stratify, terrace, cliffs, rift, smooth, ...).
//   erosion   - physical erosion model. Also records how much material was removed and redeposited.
//
// Every layer can carry masks. The masks multiply together, then the layer's opacity scales the result.
import { makeGrid, slopeDegrees, laplacian, lerp } from './grid.js';
import { noiseTables } from './noise.js';
import { GENERATORS } from './generators.js';
import { MODIFIERS } from './modifiers.js';
import { runErosion, priorityFlood, receivers, descendingOrder, accumulate } from './erosion.js';
import { evaluateMask } from './masks.js';

export const BLEND_MODES = [
  { id: 'replace', label: 'Replace' },
  { id: 'add', label: 'Add' },
  { id: 'max', label: 'Union (max)' },
  { id: 'min', label: 'Cut (min)' },
];

// Generator output lands between base and base + height metres.
function blendGenerator(h, g, base, height, mode) {
  const out = new Float32Array(h.length);
  for (let i = 0; i < out.length; i++) {
    const e = base + g[i] * height;
    switch (mode) {
      case 'add': out[i] = h[i] + g[i] * height; break;
      case 'max': out[i] = Math.max(h[i], e); break;
      case 'min': out[i] = Math.min(h[i], e); break;
      default: out[i] = e;
    }
  }
  return out;
}

export function evaluateStack(layers, settings, report = () => {}) {
  const n = settings.resolution;
  const cs = settings.worldSize / n;
  const seed = settings.seed | 0;
  let h = makeGrid(n, 0);
  const erosion = makeGrid(n);
  const deposit = makeGrid(n);
  const log = [];
  const ctx = {
    n,
    cs,
    seed,
    seaLevel: settings.seaLevel,
    maxElevation: settings.maxElevation,
    tables: noiseTables(seed),
    slope: null,
    curv: null,
  };

  const active = layers.filter((l) => l.enabled !== false);
  active.forEach((layer, li) => {
    const t0 = performance.now();
    // Each layer gets its own deterministic seed so repeated generators do not clone each other.
    const layerSeed = (seed * 9973 + li * 7919 + (layer.seed | 0)) >>> 0;
    ctx.seed = layerSeed;
    ctx.tables = noiseTables(layerSeed);
    ctx.slope = null;
    ctx.curv = null;

    // Masks multiply. A layer with no masks is fully applied.
    const weight = makeGrid(n, 1);
    for (const mask of layer.masks || []) {
      if (mask.enabled === false) continue;
      const m = evaluateMask(ctx, mask, h);
      for (let i = 0; i < n * n; i++) weight[i] *= m[i];
      ctx.slope = null;
      ctx.curv = null;
    }
    const opacity = layer.opacity ?? 1;
    for (let i = 0; i < weight.length; i++) weight[i] *= opacity;

    let next;
    let eroded = 0;
    let deposited = 0;
    if (layer.kind === 'generator') {
      const def = GENERATORS[layer.type] || GENERATORS.fbm;
      const g = def.run(ctx, layer.params || {});
      next = blendGenerator(h, g, layer.base ?? 0, layer.height ?? 1000, layer.blend || 'replace');
    } else if (layer.kind === 'modifier') {
      const def = MODIFIERS[layer.type] || MODIFIERS.smooth;
      next = def.run(ctx, layer.params || {}, h);
    } else {
      const res = runErosion(layer.type, ctx, layer.params || {}, h);
      next = res.height;
      for (let i = 0; i < n * n; i++) {
        erosion[i] += res.erosion[i] * weight[i];
        deposit[i] += res.deposit[i] * weight[i];
      }
      eroded = sum(res.erosion) * cs * cs;
      deposited = sum(res.deposit) * cs * cs;
    }

    for (let i = 0; i < h.length; i++) h[i] = lerp(h[i], next[i], clamp01(weight[i]));
    // Middle row of the heightmap after this layer, drawn as a cross-section in the inspector.
    const mid = Math.floor(n / 2) * n;
    log.push({
      id: layer.id,
      name: layer.name,
      ms: Math.round(performance.now() - t0),
      eroded,
      deposited,
      profile: Float32Array.from(h.subarray(mid, mid + n)),
    });
    report(li + 1, active.length, layer.name);
  });

  // Final diagnostics: drainage (for rivers and wetness), slope, and curvature (for protrusions).
  const cellUnits = Float32Array.from(h, (v) => v / cs);
  const filled = priorityFlood(cellUnits, n);
  const recv = receivers(filled, n);
  const order = descendingOrder(filled);
  const flow = accumulate(order, recv);
  const slope = slopeDegrees(h, n, cs);
  const curvature = laplacian(h, n, cs);

  return {
    n,
    cs,
    height: h,
    erosion,
    deposit,
    flow,
    slope,
    curvature,
    seaLevel: settings.seaLevel,
    log,
  };
}

function sum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
