import { GENERATORS } from "./generators.js";
import { EROSIONS } from "./erosion.js";
import { MODIFIERS } from "./modifiers.js";
import { MASKS } from "./masks.js";
import { SATMAP_TYPE, PALETTES, CHANNELS } from "./satmap.js";
import { num, int, choice, defaultsOf } from "./schema.js";

// The document is plain JSON: terrain settings, a sun for shading and exposure, and an ordered
// layer list. Height layers run first, in order. Satmap layers colour the result afterwards.

export const HEIGHT_TYPES = { ...GENERATORS, ...EROSIONS, ...MODIFIERS };
export const BLEND_HEIGHT = [
  ["replace", "Replace"],
  ["add", "Add"],
  ["subtract", "Subtract"],
  ["multiply", "Multiply"],
  ["max", "Maximum"],
  ["min", "Minimum"],
  ["mix", "Average"],
];

export const TERRAIN_PARAMS = [
  choice("size", "Grid size", [["128", "128 × 128 (fast)"], ["256", "256 × 256"], ["512", "512 × 512 (slow)"]], "256"),
  num("cell", "Cell size", 5, 200, 1, 30, "m"),
  num("maxHeight", "Max relief", 100, 6000, 10, 1800, "m"),
  num("seaLevel", "Sea level", 0, 3000, 5, 400, "m"),
  int("seed", "Seed", 0, 99999, 1337),
];

export const SUN_PARAMS = [
  num("azimuth", "Sun azimuth", 0, 360, 1, 315, "°"),
  num("elevation", "Sun elevation", 5, 85, 1, 38, "°"),
];

export function uid(prefix) {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${r}${Date.now().toString(36).slice(-3)}`;
}

export function layerInfo(type) {
  if (type === "satmap") return SATMAP_TYPE;
  return HEIGHT_TYPES[type] || null;
}

export function makeLayer(type, overrides = {}) {
  const info = layerInfo(type);
  if (!info) throw new Error(`Unknown layer type ${type}`);
  const kind = info.category === "satmap" ? "satmap" : "height";
  return {
    id: overrides.id || uid("layer"),
    kind,
    type,
    name: overrides.name || info.label,
    enabled: true,
    opacity: 1,
    blend: "replace",
    params: { ...defaultsOf(info.params), ...(overrides.params || {}) },
    masks: overrides.masks || [],
  };
}

export function makeMask(type, overrides = {}) {
  const def = MASKS[type];
  if (!def) throw new Error(`Unknown mask ${type}`);
  return {
    id: overrides.id || uid("mask"),
    type,
    enabled: true,
    invert: false,
    strength: 1,
    op: "multiply",
    params: { ...defaultsOf(def.params), ...(overrides.params || {}) },
  };
}

export function emptyDocument() {
  return {
    version: 2,
    name: "Untitled landscape",
    terrain: defaultsOf(TERRAIN_PARAMS),
    sun: defaultsOf(SUN_PARAMS),
    layers: [],
  };
}

// Repair a document loaded from JSON or a preset: drop unknown types, fill missing params.
export function normalizeDocument(raw) {
  const base = emptyDocument();
  const doc = {
    version: 2,
    name: typeof raw?.name === "string" ? raw.name : base.name,
    terrain: { ...base.terrain, ...(raw?.terrain || {}) },
    sun: { ...base.sun, ...(raw?.sun || {}) },
    layers: [],
  };
  doc.terrain.size = String(doc.terrain.size);
  if (!["128", "256", "512"].includes(doc.terrain.size)) doc.terrain.size = "256";
  for (const l of raw?.layers || []) {
    const info = layerInfo(l.type);
    if (!info) continue;
    const kind = info.category === "satmap" ? "satmap" : "height";
    const masks = [];
    for (const m of l.masks || []) {
      const def = MASKS[m.type];
      if (!def) continue;
      masks.push({
        id: m.id || uid("mask"),
        type: m.type,
        enabled: m.enabled !== false,
        invert: !!m.invert,
        strength: typeof m.strength === "number" ? m.strength : 1,
        op: m.op || "multiply",
        params: { ...defaultsOf(def.params), ...(m.params || {}) },
      });
    }
    doc.layers.push({
      id: l.id || uid("layer"),
      kind,
      type: l.type,
      name: l.name || info.label,
      enabled: l.enabled !== false,
      opacity: typeof l.opacity === "number" ? l.opacity : 1,
      blend: l.blend || "replace",
      params: { ...defaultsOf(info.params), ...(l.params || {}) },
      masks,
    });
  }
  return doc;
}

export const MASK_LIST = Object.entries(MASKS).map(([k, v]) => [k, v.label]);
export const EROSION_LIST = Object.entries(EROSIONS).map(([k, v]) => [k, v.label]);
export const GENERATOR_LIST = Object.entries(GENERATORS).map(([k, v]) => [k, v.label]);
export const MODIFIER_LIST = Object.entries(MODIFIERS).map(([k, v]) => [k, v.label]);
export const PALETTE_LIST = Object.entries(PALETTES).map(([k, v]) => [k, v.label]);
export const CHANNEL_LIST = Object.entries(CHANNELS);
