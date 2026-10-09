// Builds layers and masks with their default parameters, so the inspector, the presets and the
// persisted project all agree on one schema.
import { GENERATORS } from './generators.js';
import { MODIFIERS } from './modifiers.js';
import { EROSIONS } from './erosion.js';
import { MASKS, BREAKUP_OPTIONS } from './masks.js';
import { BLEND_MODES } from './pipeline.js';

export const KINDS = [
  { id: 'generator', label: 'Generator', hint: 'Base shape' },
  { id: 'modifier', label: 'Modifier', hint: 'Sculpt' },
  { id: 'erosion', label: 'Erosion', hint: 'Physical' },
];

const REGISTRY = { generator: GENERATORS, modifier: MODIFIERS, erosion: EROSIONS };

export function typesOf(kind) {
  return Object.values(REGISTRY[kind]);
}

export function defaultParams(def, overrides = {}) {
  const out = {};
  for (const p of def.params) out[p.key] = p.default;
  return { ...out, ...overrides };
}

let counter = 0;
export function uid(prefix = 'l') {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function createMask(type = 'coastal', overrides = {}, extra = {}) {
  const def = MASKS[type];
  return {
    id: uid('m'),
    type,
    name: def.label,
    enabled: true,
    invert: false,
    strength: 1,
    breakup: 'none',
    breakupAmount: 0.25,
    breakupScale: 4,
    params: defaultParams(def, overrides),
    ...extra,
  };
}

export function createLayer(kind = 'generator', type, overrides = {}, extra = {}) {
  const registry = REGISTRY[kind];
  const key = type || Object.keys(registry)[0];
  const def = registry[key];
  const layer = {
    id: uid('L'),
    kind,
    type: key,
    name: def.label,
    enabled: true,
    opacity: 1,
    blend: 'replace',
    seed: Math.floor(Math.random() * 9999),
    params: defaultParams(def, overrides),
    masks: [],
    ...extra,
  };
  if (kind === 'generator') {
    layer.height = extra.height ?? 900;
    layer.base = extra.base ?? 0;
  } else {
    layer.blend = 'replace';
  }
  return layer;
}

export const MASK_OPTIONS = Object.values(MASKS);
export { BREAKUP_OPTIONS, BLEND_MODES };

// Erosion models that suit a mask-only edit, shown as hints in the inspector.
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.id, k.label]));
