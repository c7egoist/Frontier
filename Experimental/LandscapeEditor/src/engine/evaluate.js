import { createNoise } from "./noise.js";
import { hashString } from "./rng.js";
import { clamp, lerp, gradient, slopeDegrees, routeFlow, accumulate, protrusion as protrusionField } from "./field.js";
import { buildMask } from "./masks.js";
import { HEIGHT_TYPES, normalizeDocument } from "./document.js";
import { computeChannels, applySatmapLayer, BASE_SATMAP } from "./satmap.js";
import { defaultsOf } from "./schema.js";

// Evaluation pipeline. Height layers run in order and each one is cached under a key chained
// from every layer above it. Changing layer 7 therefore recomputes layers 7 and up, not 1-6.

const heightCache = new Map();

export function resetEvaluationCache() {
  heightCache.clear();
}

function seedFor(terrainSeed, layerId) {
  return (Math.imul(terrainSeed | 0, 2654435761) ^ hashString(layerId)) >>> 0;
}

function makeContext({ N, cell, maxH, seaM, seed }) {
  const noises = new Map();
  const c = {
    N,
    cell,
    maxH,
    seaM,
    seed,
    noiseFor(offset) {
      const k = offset | 0;
      if (!noises.has(k)) noises.set(k, createNoise((seed + Math.imul(k, 7919)) >>> 0));
      return noises.get(k);
    },
    derive: null,
  };
  let memoFor = null;
  let memo = null;
  c.derive = (Hn) => {
    if (memoFor === Hn && memo) return memo;
    const Hm = new Float32Array(Hn.length);
    for (let i = 0; i < Hn.length; i++) Hm[i] = Hn[i] * maxH;
    const { gx, gy } = gradient(Hm, N, cell);
    const slope = slopeDegrees(gx, gy);
    const protCache = new Map();
    memo = {
      slope,
      gx,
      gy,
      protrusion(scaleM) {
        const r = Math.max(1, Math.round(scaleM / (2 * cell)));
        if (!protCache.has(r)) protCache.set(r, protrusionField(Hm, N, r));
        return protCache.get(r);
      },
    };
    memoFor = Hn;
    return memo;
  };
  return c;
}

function blendHeight(mode, a, b) {
  switch (mode) {
    case "add":
      return a + b;
    case "subtract":
      return a - b;
    case "multiply":
      return a * b;
    case "max":
      return Math.max(a, b);
    case "min":
      return Math.min(a, b);
    case "mix":
      return (a + b) * 0.5;
    default:
      return b;
  }
}

// Apply one height layer. Returns fresh arrays: nothing stored in the cache is mutated later.
function applyHeightLayer(layer, Hprev, sedPrev, c) {
  const info = HEIGHT_TYPES[layer.type];
  if (!info) throw new Error(`Unknown height layer ${layer.type}`);
  const N2 = Hprev.length;
  const p = { ...defaultsOf(info.params), ...layer.params };
  const w = buildMask(layer.masks, Hprev, c);
  const opacity = typeof layer.opacity === "number" ? layer.opacity : 1;
  const out = new Float32Array(N2);
  const sedNew = Float32Array.from(sedPrev);
  if (info.category === "generator") {
    const g = info.run(c, p);
    const mode = layer.blend || "replace";
    for (let i = 0; i < N2; i++) out[i] = clamp(blendHeight(mode, Hprev[i], g[i]), 0, 1);
  } else if (info.category === "erosion") {
    const Hm = new Float32Array(N2);
    for (let i = 0; i < N2; i++) Hm[i] = Hprev[i] * c.maxH;
    const sedAdd = info.run(c, Hm, p);
    for (let i = 0; i < N2; i++) {
      out[i] = clamp(Hm[i] / c.maxH, 0, 1);
      const wi = (w ? w[i] : 1) * opacity;
      sedNew[i] += sedAdd[i] * wi;
    }
  } else {
    const m = info.run(c, Hprev, p);
    for (let i = 0; i < N2; i++) out[i] = m[i];
  }
  const result = new Float32Array(N2);
  for (let i = 0; i < N2; i++) {
    const wi = (w ? w[i] : 1) * opacity;
    result[i] = clamp(lerp(Hprev[i], out[i], wi), 0, 1);
  }
  return { H: result, sed: sedNew, mask: w };
}

// Evaluate the document. opts.maskLayerId returns that layer's combined mask for the viewport.
export function evaluate(rawDoc, opts = {}) {
  const t0 = performance.now();
  const doc = normalizeDocument(rawDoc);
  const T = doc.terrain;
  const N = parseInt(T.size, 10);
  const cell = Number(T.cell);
  const maxH = Number(T.maxHeight);
  const seaM = Number(T.seaLevel);
  const N2 = N * N;

  let H = new Float32Array(N2).fill(0);
  let sed = new Float32Array(N2);
  let key = `${N}|${cell}|${maxH}|${T.seed}|${seaM}`;
  let maskPreview = null;
  const timings = [];
  const used = new Set();
  const errors = [];

  for (const layer of doc.layers) {
    if (layer.kind !== "height" || layer.enabled === false) continue;
    key = String(hashString(key + "::" + JSON.stringify([layer.id, layer.type, layer.params, layer.masks, layer.blend, layer.opacity])));
    used.add(key);
    const t1 = performance.now();
    let entry = heightCache.get(key);
    let cached = !!entry;
    let mask = null;
    if (!entry) {
      try {
        const seed = seedFor(T.seed, layer.id);
        const c = makeContext({ N, cell, maxH, seaM, seed });
        const res = applyHeightLayer(layer, H, sed, c);
        entry = { H: res.H, sed: res.sed, mask: res.mask };
      } catch (err) {
        errors.push({ id: layer.id, message: String(err && err.message ? err.message : err) });
        entry = { H: H, sed: sed, mask: null };
      }
      heightCache.set(key, entry);
    }
    mask = entry.mask;
    H = entry.H;
    sed = entry.sed;
    if (opts.maskLayerId === layer.id) maskPreview = mask;
    timings.push({ id: layer.id, ms: performance.now() - t1, cached });
  }
  for (const k of [...heightCache.keys()]) if (!used.has(k)) heightCache.delete(k);

  // Derived terrain for satmaps and the viewport.
  const Hm = new Float32Array(N2);
  let minM = Infinity;
  let maxM = -Infinity;
  let sumM = 0;
  for (let i = 0; i < N2; i++) {
    Hm[i] = H[i] * maxH;
    if (Hm[i] < minM) minM = Hm[i];
    if (Hm[i] > maxM) maxM = Hm[i];
    sumM += Hm[i];
  }
  const { gx, gy } = gradient(Hm, N, cell);
  const slope = slopeDegrees(gx, gy);
  const { receiver, slopeTo, order } = routeFlow(Hm, N, cell);
  const flowA = accumulate(receiver, order, null);
  const sun = { azimuth: Number(doc.sun.azimuth), elevation: Number(doc.sun.elevation) };
  const maps = computeChannels({ H, Hm, sed, flowA, slope, gx, gy, N, sun });

  // Satmap layers.
  const rgb = new Float32Array(N2 * 3);
  for (let i = 0; i < N2; i++) {
    rgb[i * 3] = BASE_SATMAP[0];
    rgb[i * 3 + 1] = BASE_SATMAP[1];
    rgb[i * 3 + 2] = BASE_SATMAP[2];
  }
  for (const layer of doc.layers) {
    if (layer.kind !== "satmap" || layer.enabled === false) continue;
    const t1 = performance.now();
    let w = null;
    try {
      const c = makeContext({ N, cell, maxH, seaM, seed: seedFor(T.seed, layer.id) });
      w = buildMask(layer.masks, H, c);
      applySatmapLayer(rgb, layer, { N, maps, c, weight: w, opacity: typeof layer.opacity === "number" ? layer.opacity : 1 });
    } catch (err) {
      errors.push({ id: layer.id, message: String(err && err.message ? err.message : err) });
    }
    if (opts.maskLayerId === layer.id) maskPreview = w;
    timings.push({ id: layer.id, ms: performance.now() - t1, cached: false });
  }

  const rgba = new Uint8ClampedArray(N2 * 4);
  for (let i = 0; i < N2; i++) {
    rgba[i * 4] = Math.round(clamp(rgb[i * 3], 0, 1) * 255);
    rgba[i * 4 + 1] = Math.round(clamp(rgb[i * 3 + 1], 0, 1) * 255);
    rgba[i * 4 + 2] = Math.round(clamp(rgb[i * 3 + 2], 0, 1) * 255);
    rgba[i * 4 + 3] = 255;
  }
  let sedSum = 0;
  for (let i = 0; i < N2; i++) sedSum += sed[i];

  return {
    N,
    cell,
    maxH,
    seaM,
    height: H,
    altitude: Hm,
    slope,
    exposure: maps.exposure,
    rivers: maps.rivers,
    sediment: maps.sediment,
    protrusion: maps.protrusion,
    wetness: maps.wetness,
    rgba,
    mask: maskPreview,
    stats: {
      minM,
      maxM,
      meanM: sumM / N2,
      sedM: sedSum / N2,
      ms: performance.now() - t0,
      layers: timings,
      errors,
      cacheSize: heightCache.size,
    },
  };
}
