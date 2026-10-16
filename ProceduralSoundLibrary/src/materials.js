// Surface / material model. Every sound is built from these physical-ish knobs:
//   set    - resonator family (plate, bar, bell, block, shard, rubber): sets the mode ratios
//   base   - fundamental Hz of a 0.3 m piece of this material
//   t60    - seconds for the fundamental to decay by 60 dB (ring length)
//   bright - how much energy the upper modes and contact transients carry (0..1)
//   grain  - surface roughness: how much friction/scrape is noise rather than tone (0..1)
//   hard   - contact stiffness: hard contact gives a crisp click, soft gives a thud (0..1)
//   density- kg/m3, used for loudness and low-end weight
// Several values follow the fracture editor's material table (glass, tempered glass,
// pine, concrete, granite, ABS) so the two tools describe the same surfaces.

import { clamp } from "./dsp.js";

export const MODE_SETS = {
  plate: [1, 1.59, 2.14, 2.3, 2.92, 3.6, 4.1, 4.9, 5.6, 6.4],
  bar: [1, 2.76, 5.4, 8.93, 13.34, 18.6, 24.1, 30.0, 36.3, 42.7],
  bell: [1, 2.32, 4.25, 6.63, 9.38, 12.6, 16.0, 19.7, 23.6, 27.6],
  block: [1, 1.5, 2.1, 2.8, 3.5, 4.3, 5.1, 6.0, 6.9, 7.9],
  shard: [1, 2.1, 3.3, 4.6, 6.4, 7.9, 9.8, 11.6, 13.4, 15.5],
  rubber: [1, 1.7, 2.4, 3.1, 3.8, 4.6, 5.5, 6.3, 7.2, 8.1],
};

export const MATERIALS = {
  // ---- metals
  steel: { label: "Steel plate", group: "Metal", set: "plate", base: 680, t60: 1.6, bright: 0.6, grain: 0.35, hard: 0.9, density: 7850 },
  aluminium: { label: "Aluminium", group: "Metal", set: "plate", base: 900, t60: 1.2, bright: 0.7, grain: 0.3, hard: 0.75, density: 2700 },
  cast_iron: { label: "Cast iron", group: "Metal", set: "block", base: 420, t60: 0.9, bright: 0.3, grain: 0.6, hard: 0.9, density: 7200 },
  copper: { label: "Copper sheet", group: "Metal", set: "plate", base: 1100, t60: 1.0, bright: 0.6, grain: 0.25, hard: 0.7, density: 8930 },
  // ---- wood
  pine: { label: "Pine (softwood)", group: "Wood", set: "block", base: 380, t60: 0.25, bright: 0.3, grain: 0.65, hard: 0.4, density: 520 },
  oak: { label: "Oak (hardwood)", group: "Wood", set: "block", base: 330, t60: 0.35, bright: 0.35, grain: 0.55, hard: 0.55, density: 750 },
  plywood: { label: "Plywood", group: "Wood", set: "block", base: 260, t60: 0.2, bright: 0.25, grain: 0.7, hard: 0.4, density: 600 },
  // ---- glass
  glass: { label: "Annealed glass", group: "Glass", set: "shard", base: 1400, t60: 1.4, bright: 0.9, grain: 0.2, hard: 1.0, density: 2500 },
  tempered_glass: { label: "Tempered glass", group: "Glass", set: "shard", base: 1400, t60: 0.9, bright: 0.9, grain: 0.2, hard: 1.0, density: 2500 },
  // ---- stone & masonry
  concrete: { label: "Concrete", group: "Stone", set: "block", base: 240, t60: 0.12, bright: 0.3, grain: 0.95, hard: 0.85, density: 2350 },
  brick: { label: "Brick", group: "Stone", set: "block", base: 320, t60: 0.1, bright: 0.4, grain: 0.9, hard: 0.85, density: 1900 },
  granite: { label: "Granite", group: "Stone", set: "block", base: 500, t60: 0.2, bright: 0.6, grain: 0.8, hard: 1.0, density: 2700 },
  marble: { label: "Marble", group: "Stone", set: "block", base: 430, t60: 0.45, bright: 0.6, grain: 0.4, hard: 0.9, density: 2650 },
  ceramic_tile: { label: "Ceramic tile", group: "Stone", set: "plate", base: 1000, t60: 0.5, bright: 0.7, grain: 0.35, hard: 0.9, density: 2300 },
  asphalt: { label: "Asphalt road", group: "Ground", set: "block", base: 200, t60: 0.05, bright: 0.3, grain: 0.9, hard: 0.6, density: 2300 },
  gravel: { label: "Gravel", group: "Ground", set: "block", base: 150, t60: 0.02, bright: 0.5, grain: 1.0, hard: 0.7, density: 1700 },
  // ---- polymers & soft
  plastic_abs: { label: "ABS plastic", group: "Polymer", set: "block", base: 600, t60: 0.18, bright: 0.3, grain: 0.3, hard: 0.5, density: 1050 },
  rubber: { label: "Rubber", group: "Polymer", set: "rubber", base: 160, t60: 0.04, bright: 0.05, grain: 0.5, hard: 0.1, density: 1100 },
  cardboard: { label: "Cardboard box", group: "Polymer", set: "block", base: 220, t60: 0.06, bright: 0.15, grain: 0.7, hard: 0.15, density: 690 },
};

export const CUSTOM_DEFAULT = {
  label: "Custom surface", group: "Custom", set: "plate", base: 700, t60: 0.6,
  bright: 0.5, grain: 0.4, hard: 0.6, density: 2000,
};

export const MATERIAL_IDS = Object.keys(MATERIALS);

export const DEFAULT_CONDITION = { wet: 0, wear: 0, size: 1, room: 0.15 };

// Resolve a material id into concrete numbers, applying custom overrides and the
// global condition (wet film, wear). Returns a fresh object each call.
export function effectiveMaterial(id, cond = DEFAULT_CONDITION, custom = null) {
  const base = id === "custom" ? { ...CUSTOM_DEFAULT, ...(custom || {}) } : MATERIALS[id] || MATERIALS.steel;
  const wet = clamp(cond.wet ?? 0, 0, 1);
  const wear = clamp(cond.wear ?? 0, 0, 1);
  return {
    ...base,
    id,
    wet,
    wear,
    t60: Math.max(0.005, base.t60 * (1 - 0.55 * wet) * (1 - 0.3 * wear)),
    bright: clamp(base.bright * (1 - 0.45 * wet), 0, 1),
    grain: clamp(base.grain * (1 + 0.4 * wear) * (1 - 0.25 * wet), 0, 1),
    hard: clamp(base.hard * (1 - 0.5 * wet), 0, 1),
  };
}

// Resonator modes for a material at a given fundamental. Partials decay faster
// than the fundamental, and dull materials lose their upper partials quickly.
export function materialModes(m, count, f0, rng = null, wear = 0) {
  const ratios = MODE_SETS[m.set] || MODE_SETS.plate;
  const out = [];
  const n = Math.min(count, ratios.length);
  for (let k = 0; k < n; k++) {
    let f = f0 * ratios[k];
    if (rng && wear > 0) f *= 1 + wear * 0.012 * rng.gauss();
    const a = Math.pow(k + 1, -(0.6 + (1 - m.bright) * 1.6));
    const t60 = m.t60 / (1 + 0.35 * k * (1 + (1 - m.bright)));
    out.push({ f, t60, a });
  }
  return out;
}

export const surfaceOptions = () =>
  MATERIAL_IDS.map((id) => ({ id, label: MATERIALS[id].label, group: MATERIALS[id].group }));
