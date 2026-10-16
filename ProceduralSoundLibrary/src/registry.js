// Registry of sound types. Each type describes its own controls (so the UI can be
// generated from it) and its generator. renderSound() is the single entry point
// used by the browser UI, the batch exporter and the tests.

import { makeCtx, finish } from "./context.js";
import { MATERIAL_IDS } from "./materials.js";
import { impact, scratch } from "./sounds/impacts.js";
import { doorOpen, doorClose } from "./sounds/doors.js";
import { glassShatter, glassBreak } from "./sounds/glass.js";
import { electricMotor, tyreSqueal, carCrash } from "./sounds/vehicles.js";
import { cargo } from "./sounds/cargo.js";
import { water } from "./sounds/water.js";

const range = (key, label, min, max, step, value, unit = "") => ({ kind: "range", key, label, min, max, step, value, unit });
const select = (key, label, options, value) => ({ kind: "select", key, label, options, value });
const material = (key, label, choices, value) => ({ kind: "material", key, label, choices, value });
const bool = (key, label, value) => ({ kind: "bool", key, label, value });
// `when` shows a control only for some values of another control: when: { type: "brushed" }
const only = (spec, when) => ({ ...spec, when });

const SURFACES = MATERIAL_IDS;
const HARD_FLOORS = ["concrete", "ceramic_tile", "granite", "marble", "asphalt", "pine", "oak", "steel", "plywood", "brick"];
const BOXES = ["cardboard", "plywood", "plastic_abs", "steel"];
const WATER_SURFACES = ["ceramic_tile", "steel", "copper", "glass", "pine", "oak", "concrete", "granite", "marble", "plastic_abs"];

export const SOUND_TYPES = {
  impact: {
    label: "Bump · knock · tap · thud",
    group: "Impacts",
    description: "One object struck. Metal rings, wood thuds, stone clacks; the contact sets how hard it hits.",
    params: [
      material("material", "Surface", SURFACES, "steel"),
      select("variant", "Strike", [["bump", "Bump"], ["knock", "Knock (x3)"], ["tap", "Tap"], ["thud", "Heavy thud"]], "bump"),
      range("force", "Force", 0, 1, 0.01, 0.6),
      range("contact", "Contact hardness", 0, 1, 0.01, 0.6),
      range("size", "Object size", 0.02, 2, 0.01, 0.3, "m"),
    ],
    intensity: (p) => p.force,
    run: (ctx, p) => impact(ctx, p),
  },
  scratch: {
    label: "Scratch · scrape",
    group: "Friction",
    description: "A tool dragged over a surface. Grit spacing and speed set the pitch; fine grit becomes hiss.",
    params: [
      material("material", "Surface", SURFACES, "steel"),
      material("tool", "Tool material", SURFACES, "steel"),
      range("speed", "Speed", 0.02, 2, 0.01, 0.3, "m/s"),
      range("pressure", "Pressure", 0, 1, 0.01, 0.6),
      range("grit", "Grit spacing", 0.05, 3, 0.01, 0.5, "mm"),
      range("length", "Length", 0.1, 6, 0.05, 1.2, "s"),
      range("jitter", "Irregularity", 0, 1, 0.01, 0.25),
    ],
    intensity: (p) => p.pressure,
    run: (ctx, p) => scratch(ctx, p),
  },
  door_open: {
    label: "Door opening",
    group: "Doors",
    description: "Hinge creak as the leaf swings, latch release and the stop clack at the end.",
    params: [
      material("material", "Door material", ["pine", "oak", "plywood", "steel", "aluminium", "plastic_abs"], "oak"),
      range("creak", "Hinge wear (creak)", 0, 1, 0.01, 0.5),
      range("duration", "Swing time", 0.5, 8, 0.05, 2.2, "s"),
      bool("latch", "Latch clack at end", true),
    ],
    intensity: () => 0.7,
    run: (ctx, p) => doorOpen(ctx, p),
  },
  door_close: {
    label: "Door closing · slam",
    group: "Doors",
    description: "Swing whoosh, leaf into the frame, latch clack, optional rebound.",
    params: [
      material("material", "Door material", ["pine", "oak", "plywood", "steel", "aluminium", "plastic_abs"], "oak"),
      material("frame", "Frame material", ["pine", "oak", "concrete", "brick", "steel"], "pine"),
      range("slam", "Slam force", 0, 1, 0.01, 0.5),
      range("speed", "Closing speed", 0.1, 1, 0.01, 0.6),
      range("duration", "Swing time", 0.5, 8, 0.05, 1.6, "s"),
      bool("latch", "Latch clack", true),
      bool("bounce", "Rebound on hard slam", true),
    ],
    intensity: (p) => p.slam,
    run: (ctx, p) => doorClose(ctx, p),
  },
  electric_motor: {
    label: "Electric motor",
    group: "Electric",
    description: "Commutation whine set by RPM and pole/slot count, with brush crackle and housing colour.",
    params: [
      select("type", "Motor type", [["brushless", "Brushless (6-step)"], ["brushed", "Brushed DC"], ["induction", "Induction"]], "brushless"),
      range("rpm", "Speed", 300, 24000, 10, 6000, "rpm"),
      range("poles", "Poles", 2, 12, 2, 4),
      range("slots", "Slots", 6, 48, 1, 24),
      range("load", "Load", 0, 1, 0.01, 0.4),
      range("ramp", "Spin-up time", 0.02, 4, 0.01, 0.6, "s"),
      select("profile", "Profile", [["spinup", "Spin-up"], ["steady", "Steady"], ["spindown", "Spin-down"]], "spinup"),
      only(range("brushNoise", "Brush crackle", 0, 1, 0.01, 0.3), { type: ["brushed"] }),
      material("housing", "Housing material", ["steel", "aluminium", "plastic_abs", "cast_iron", "copper"], "aluminium"),
      range("duration", "Length", 0.4, 10, 0.05, 3, "s"),
    ],
    intensity: (p) => 0.4 + 0.6 * p.load,
    run: (ctx, p) => electricMotor(ctx, p),
  },
  tyre_squeal: {
    label: "Tyre squeal · skid",
    group: "Vehicles",
    description: "Stick-slip squeal from tread on road. Compound, speed and slip set the pitch and the bite.",
    params: [
      material("surface", "Road surface", ["asphalt", "concrete", "ceramic_tile", "granite", "marble", "steel"], "asphalt"),
      range("hard", "Compound (soft ↔ hard)", 0, 1, 0.01, 0.4),
      range("speed", "Speed", 5, 120, 1, 40, "km/h"),
      range("slip", "Slip", 0, 1, 0.01, 0.8),
      range("burnout", "Burnout rumble", 0, 1, 0.01, 0),
      range("duration", "Length", 0.3, 10, 0.05, 2, "s"),
    ],
    intensity: (p) => p.slip,
    run: (ctx, p) => tyreSqueal(ctx, p),
  },
  car_crash: {
    label: "Car crash",
    group: "Vehicles",
    description: "Chassis thud, crumple, tearing, a tempered-glass shower, debris, tyres and body ringing.",
    params: [
      range("severity", "Severity", 0, 1, 0.01, 0.7),
      select("body", "Body material", [["steel", "Steel"], ["aluminium", "Aluminium"]], "steel"),
      bool("glass", "Glass shower", true),
      bool("squeal", "Tyre squeal", true),
      material("surface", "Road surface", ["asphalt", "concrete"], "asphalt"),
      range("duration", "Length", 1, 8, 0.1, 3.5, "s"),
    ],
    intensity: (p) => p.severity,
    run: (ctx, p) => carCrash(ctx, p),
  },
  glass_shatter: {
    label: "Glass shatter",
    group: "Glass",
    description: "A pane bursts. Tempered glass dices into hundreds of pieces; annealed breaks into long shards.",
    params: [
      select("pane", "Pane type", [["annealed", "Annealed"], ["tempered", "Tempered"], ["laminated", "Laminated"]], "annealed"),
      range("thickness", "Thickness", 2, 19, 0.5, 6, "mm"),
      range("area", "Pane area", 0.05, 6, 0.05, 1, "m²"),
      range("energy", "Impact energy", 0, 1, 0.01, 0.6),
      range("spread", "Spread", 0.1, 6, 0.05, 1.0, "s"),
      material("floor", "Floor", HARD_FLOORS, "concrete"),
    ],
    intensity: (p) => p.energy,
    run: (ctx, p) => glassShatter(ctx, p),
  },
  glass_break: {
    label: "Glass break (crack)",
    group: "Glass",
    description: "A crack runs through the pane, the pane rings, then a few pieces fall.",
    params: [
      select("pane", "Pane type", [["annealed", "Annealed"], ["tempered", "Tempered"], ["laminated", "Laminated"]], "annealed"),
      range("thickness", "Thickness", 2, 19, 0.5, 5, "mm"),
      range("cracks", "Crack ticks", 2, 30, 1, 8),
      range("shards", "Falling pieces", 0, 8, 1, 3),
      range("energy", "Energy", 0, 1, 0.01, 0.6),
      material("floor", "Floor", HARD_FLOORS, "concrete"),
    ],
    intensity: (p) => p.energy,
    run: (ctx, p) => glassBreak(ctx, p),
  },
  cargo: {
    label: "Cargo · crate",
    group: "Cargo",
    description: "Crates and loads: drop, slide, shift, rattle of contents, strap tightening.",
    params: [
      select("mode", "Motion", [["drop", "Drop & bounce"], ["slide", "Slide"], ["shift", "Shift (strapped)"], ["rattle", "Rattle"], ["strap", "Strap tightening"]], "drop"),
      material("box", "Box material", BOXES, "cardboard"),
      material("floor", "Floor", HARD_FLOORS, "concrete"),
      range("mass", "Mass", 1, 2000, 1, 40, "kg"),
      select("contents", "Contents", [["empty", "Empty"], ["hollow", "Hollow (tins)"], ["packed", "Packed (loose metal)"]], "packed"),
      range("duration", "Length", 0.5, 8, 0.05, 2.5, "s"),
    ],
    intensity: (p) => 0.4 + 0.6 * Math.min(1, Math.log10(Math.max(1, p.mass)) / 3),
    run: (ctx, p) => cargo(ctx, p),
  },
  water: {
    label: "Water",
    group: "Water",
    description: "Drips (Minnaert bubble pitch), pours, splashes, streams and puddle steps, coloured by the surface.",
    params: [
      select("mode", "Motion", [["drip", "Drip"], ["pour", "Pour"], ["stream", "Stream"], ["splash", "Splash"], ["puddle", "Puddle step"]], "drip"),
      material("surface", "Surface", WATER_SURFACES, "ceramic_tile"),
      range("volume", "Volume", 0.02, 5, 0.01, 0.5, "L"),
      range("height", "Fall height", 0.01, 2, 0.01, 0.2, "m"),
      only(range("depth", "Liquid depth", 0.001, 0.2, 0.001, 0.01, "m"), { mode: ["pour", "stream", "splash", "puddle"] }),
      range("turbulence", "Turbulence", 0, 1, 0.01, 0.5),
      range("duration", "Length", 0.3, 8, 0.05, 1.5, "s"),
    ],
    intensity: (p) => 0.3 + 0.7 * Math.min(1, p.volume / 2),
    run: (ctx, p) => water(ctx, p),
  },
};

export const TYPE_IDS = Object.keys(SOUND_TYPES);

export function defaultParams(typeId) {
  const type = SOUND_TYPES[typeId];
  const out = {};
  for (const spec of type.params) out[spec.key] = spec.value;
  return out;
}

// Render one sound. `opts` = { sr, seed, cond, custom }.
export function renderSound(typeId, params = {}, opts = {}) {
  const type = SOUND_TYPES[typeId];
  if (!type) throw new Error(`Unknown sound type: ${typeId}`);
  const p = { ...defaultParams(typeId), ...params };
  const ctx = makeCtx(opts);
  const raw = type.run(ctx, p);
  const level = type.intensity ? type.intensity(p) : 1;
  return finish(ctx, raw, level);
}
