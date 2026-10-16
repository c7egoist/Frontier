// The library catalogue: every preset the batch exporter renders. Each entry is a
// complete, reproducible recipe (type + params + condition + seed). The UI shows the
// same list so a preset can be auditioned and tweaked before export.

import { MATERIAL_IDS, MATERIALS } from "./materials.js";

const METALS = ["steel", "aluminium", "cast_iron", "copper"];
const WOODS = ["pine", "oak", "plywood"];
const STONES = ["concrete", "brick", "granite", "marble", "ceramic_tile"];
const POLYMERS = ["plastic_abs", "rubber", "cardboard"];
const GROUND = ["asphalt", "gravel"];

const item = (group, type, slug, label, params, cond = {}, seed = 1) => ({
  id: `${group}/${slug}`,
  group,
  type,
  label,
  params,
  cond: { wet: 0, wear: 0, size: 1, room: 0.15, ...cond },
  seed,
});

export function buildCatalog() {
  const items = [];
  let seed = 100;
  const next = () => (seed += 7);

  // Impacts: every surface, dry and wet, bump + knock
  for (const m of MATERIAL_IDS) {
    for (const variant of ["bump", "knock"]) {
      for (const wet of [0, 1]) {
        items.push(item("impacts", "impact", `${m}-${variant}-${wet ? "wet" : "dry"}`,
          `${MATERIALS[m].label} · ${variant}${wet ? " (wet)" : ""}`,
          { material: m, variant, force: variant === "knock" ? 0.55 : 0.6, contact: 0.6, size: 0.3 },
          { wet }, next()));
      }
    }
    items.push(item("impacts", "impact", `${m}-tap-hard`, `${MATERIALS[m].label} · tap (hard contact)`,
      { material: m, variant: "tap", force: 0.5, contact: 0.95, size: 0.1 }, {}, next()));
  }

  // Friction: scratches with three tools across all surfaces
  for (const m of MATERIAL_IDS) {
    items.push(item("friction", "scratch", `${m}-scratch-steel`, `${MATERIALS[m].label} · scratch (steel tool)`,
      { material: m, tool: "steel", speed: 0.3, pressure: 0.6, grit: 0.5, length: 1.2 }, {}, next()));
    items.push(item("friction", "scratch", `${m}-scrape-wood`, `${MATERIALS[m].label} · scrape (wood tool)`,
      { material: m, tool: "pine", speed: 0.15, pressure: 0.8, grit: 1.5, length: 1.8 }, {}, next()));
  }

  // Doors: opening and closing across door materials
  for (const m of ["pine", "oak", "plywood", "steel", "aluminium", "plastic_abs"]) {
    items.push(item("doors", "door_open", `${m}-open`, `${MATERIALS[m].label} door · opening`,
      { material: m, creak: m === "steel" || m === "aluminium" ? 0.2 : 0.6, duration: 2.2, latch: true }, {}, next()));
    items.push(item("doors", "door_close", `${m}-close-soft`, `${MATERIALS[m].label} door · closing (soft)`,
      { material: m, frame: "pine", slam: 0.25, speed: 0.4, duration: 1.6 }, {}, next()));
    items.push(item("doors", "door_close", `${m}-slam`, `${MATERIALS[m].label} door · slam`,
      { material: m, frame: "concrete", slam: 0.9, speed: 0.8, duration: 1.4 }, {}, next()));
  }

  // Electric motors
  items.push(item("electric", "electric_motor", "brushless-6k-spinup", "Brushless 6 000 rpm · spin-up",
    { type: "brushless", rpm: 6000, poles: 4, slots: 24, load: 0.4, ramp: 0.6, profile: "spinup", housing: "aluminium", duration: 3 }, {}, next()));
  items.push(item("electric", "electric_motor", "brushless-18k-steady", "Brushless 18 000 rpm · steady, loaded",
    { type: "brushless", rpm: 18000, poles: 8, slots: 12, load: 0.9, ramp: 0.2, profile: "steady", housing: "aluminium", duration: 2.5 }, {}, next()));
  items.push(item("electric", "electric_motor", "brushed-3k-steady", "Brushed DC 3 000 rpm · steady",
    { type: "brushed", rpm: 3000, poles: 2, slots: 18, load: 0.5, brushNoise: 0.7, profile: "steady", housing: "steel", duration: 2.5 }, {}, next()));
  items.push(item("electric", "electric_motor", "brushed-9k-spindown", "Brushed DC 9 000 rpm · spin-down",
    { type: "brushed", rpm: 9000, poles: 2, slots: 18, load: 0.3, brushNoise: 0.5, ramp: 0.8, profile: "spindown", housing: "plastic_abs", duration: 3 }, {}, next()));
  items.push(item("electric", "electric_motor", "induction-1500-steady", "Induction 1 500 rpm · steady",
    { type: "induction", rpm: 1500, poles: 4, slots: 36, load: 0.8, profile: "steady", housing: "cast_iron", duration: 2.5 }, {}, next()));

  // Vehicles: tyres and crashes
  for (const [s, label] of [["asphalt", "Asphalt"], ["concrete", "Concrete"], ["ceramic_tile", "Tile"]]) {
    items.push(item("vehicles", "tyre_squeal", `${s}-dry-squeal`, `Tyre squeal · ${label} (dry)`,
      { surface: s, hard: 0.4, speed: 40, slip: 0.85, duration: 2 }, {}, next()));
    items.push(item("vehicles", "tyre_squeal", `${s}-wet-squeal`, `Tyre squeal · ${label} (wet)`,
      { surface: s, hard: 0.4, speed: 40, slip: 0.85, duration: 2 }, { wet: 1 }, next()));
  }
  items.push(item("vehicles", "tyre_squeal", "asphalt-hard-compound-burnout", "Tyre squeal · hard compound + burnout",
    { surface: "asphalt", hard: 0.9, speed: 25, slip: 1, burnout: 0.8, duration: 3 }, {}, next()));
  items.push(item("vehicles", "car_crash", "crash-light-steel", "Car crash · light (steel body)",
    { severity: 0.35, body: "steel", glass: false, squeal: true, surface: "asphalt", duration: 2.5 }, {}, next()));
  items.push(item("vehicles", "car_crash", "crash-heavy-steel", "Car crash · heavy (steel body, glass)",
    { severity: 0.9, body: "steel", glass: true, squeal: true, surface: "asphalt", duration: 3.5 }, {}, next()));
  items.push(item("vehicles", "car_crash", "crash-heavy-alu", "Car crash · heavy (aluminium body)",
    { severity: 0.85, body: "aluminium", glass: true, squeal: true, surface: "concrete", duration: 3.5 }, {}, next()));

  // Glass: shatter, break, across pane types and floors
  for (const pane of ["annealed", "tempered", "laminated"]) {
    for (const floor of ["concrete", "pine"]) {
      items.push(item("glass", "glass_shatter", `${pane}-shatter-${floor}`, `${pane[0].toUpperCase() + pane.slice(1)} glass · shatter on ${floor}`,
        { pane, thickness: pane === "tempered" ? 6 : 6, area: 1.2, energy: 0.8, spread: 1.6, floor }, {}, next()));
    }
    items.push(item("glass", "glass_break", `${pane}-break`, `${pane[0].toUpperCase() + pane.slice(1)} glass · crack & break`,
      { pane, thickness: 5, cracks: 10, shards: 3, energy: 0.6, floor: "concrete" }, {}, next()));
  }
  items.push(item("glass", "glass_shatter", "annealed-small-tile", "Small annealed pane · shatter on tile",
    { pane: "annealed", thickness: 4, area: 0.2, energy: 0.4, spread: 0.6, floor: "ceramic_tile" }, {}, next()));

  // Cargo
  for (const box of ["cardboard", "plywood", "steel"]) {
    items.push(item("cargo", "cargo", `${box}-drop`, `${box} crate · drop & bounce`,
      { mode: "drop", box, floor: "concrete", mass: 60, contents: "packed", duration: 2.5 }, {}, next()));
    items.push(item("cargo", "cargo", `${box}-slide`, `${box} crate · slide on steel floor`,
      { mode: "slide", box, floor: "steel", mass: 120, contents: "empty", duration: 2.5 }, {}, next()));
  }
  items.push(item("cargo", "cargo", "load-shift-strap", "Load shift · strapped (steel strap)",
    { mode: "shift", box: "plywood", floor: "pine", mass: 500, contents: "packed", duration: 3 }, {}, next()));
  items.push(item("cargo", "cargo", "tins-rattle", "Tins rattle · hollow box in a van",
    { mode: "rattle", box: "cardboard", floor: "steel", mass: 15, contents: "hollow", duration: 2.5 }, {}, next()));
  items.push(item("cargo", "cargo", "ratchet-strap", "Ratchet strap tightening",
    { mode: "strap", box: "plywood", floor: "pine", mass: 200, contents: "empty", duration: 2.2 }, {}, next()));

  // Water: drips, pours, splashes and puddle steps across surfaces
  for (const s of ["ceramic_tile", "steel", "glass", "pine", "concrete"]) {
    items.push(item("water", "water", `${s}-drip`, `Drip · ${MATERIALS[s].label}`,
      { mode: "drip", surface: s, volume: 0.3, height: 0.5, depth: 0.005, turbulence: 0.4, duration: 2.5 }, {}, next()));
  }
  for (const s of ["ceramic_tile", "steel", "pine", "concrete"]) {
    items.push(item("water", "water", `${s}-pour`, `Pour · ${MATERIALS[s].label}`,
      { mode: "pour", surface: s, volume: 1.5, height: 0.3, depth: 0.02, turbulence: 0.6, duration: 2.5 }, {}, next()));
    items.push(item("water", "water", `${s}-splash`, `Splash · ${MATERIALS[s].label}`,
      { mode: "splash", surface: s, volume: 0.6, height: 0.8, depth: 0.01, turbulence: 0.7, duration: 1.2 }, {}, next()));
  }
  items.push(item("water", "water", "puddle-step-wet", "Puddle step · wet concrete",
    { mode: "puddle", surface: "concrete", volume: 0.5, height: 0.1, depth: 0.03, turbulence: 0.5, duration: 1.2 }, { wet: 0.5 }, next()));
  items.push(item("water", "water", "stream-steel", "Stream · steel sink",
    { mode: "stream", surface: "steel", volume: 2, height: 0.4, depth: 0.02, turbulence: 0.7, duration: 3 }, {}, next()));

  return items;
}

export const CATALOG_GROUPS = ["impacts", "friction", "doors", "electric", "vehicles", "glass", "cargo", "water"];

// Ensure ids are unique; throws during development if not.
export function assertUnique(items) {
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) throw new Error(`duplicate catalogue id ${it.id}`);
    seen.add(it.id);
  }
  return items;
}
