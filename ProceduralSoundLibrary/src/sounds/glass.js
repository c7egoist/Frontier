// Glass: shatter (many fragments hitting the floor over time) and break
// (a crack propagates, the pane rings, then a few pieces fall).
// Each fragment is a tiny shard resonator. Size sets pitch and ring length, and
// the pane type sets how many fragments there are and how they are distributed.

import { alloc, samplesFor, addAt, modal, click, clamp } from "../dsp.js";
import { materialModes } from "../materials.js";
import { impact } from "./impacts.js";

export const PANE_KEYS = { annealed: "glass", tempered: "tempered_glass", laminated: "glass" };

export function glassShatter(ctx, p = {}) {
  const { sr, r } = ctx;
  const pane = p.pane ?? "annealed";
  const laminated = pane === "laminated";
  const tempered = pane === "tempered";
  const m0 = ctx.mat(PANE_KEYS[pane] ?? "glass");
  const m = laminated ? { ...m0, t60: m0.t60 * 0.35, bright: m0.bright * 0.7 } : m0;
  const energy = clamp(p.energy ?? 0.6, 0, 1);
  const area = clamp((p.area ?? 1) * ctx.cond.size, 0.05, 6);
  const thick = clamp(p.thickness ?? 6, 2, 19) / 1000;
  const spread = clamp(p.spread ?? 1.0, 0.1, 6);
  const floor = p.floor ?? "concrete";

  // fragment count: tempered glass dices into hundreds of small pieces;
  // annealed breaks into a few dozen long shards; laminated holds together
  let count;
  if (tempered) count = Math.round(clamp(40 + 260 * energy * Math.sqrt(area), 20, 900));
  else count = Math.round(clamp(6 + 40 * energy * Math.sqrt(area), 4, 160));
  if (laminated) count = Math.max(3, Math.round(count * 0.2));

  const dur = spread + 0.9;
  const out = alloc(samplesFor(dur, sr));
  const avgSize = tempered ? 0.018 : 0.12;

  for (let i = 0; i < count; i++) {
    // most pieces fall in the first moments; a tail of tinkles comes later
    const t = r.chance(0.65) ? spread * 0.25 * r.next() * r.next() : spread * (0.25 + 0.75 * r.next());
    const sz = clamp(avgSize * Math.exp(0.6 * r.gauss()), 0.003, 0.4);
    // thin glass rings higher; a bigger piece rings lower and longer
    const f0 = clamp(2600 * Math.pow(0.02 / sz, 0.9) * Math.pow(0.004 / thick, 0.35), 700, 14000);
    const modes = materialModes(m, 5, f0 * (1 + 0.02 * r.gauss()), null, 0).map((x) => ({
      ...x,
      t60: x.t60 * clamp(0.3 + sz / 0.05, 0.3, 2.5),
    }));
    const amp = (0.25 + 0.75 * r.next()) * (0.3 + 0.7 * energy) * 0.5 / Math.sqrt(Math.max(1, count / 12));
    modal(out, t * sr, sr, modes, amp, 1.5);
    addAt(out, click(r, sr, 0.0004, 5000 + 6000 * r.next(), 1, amp * 0.8), t * sr);
  }

  // larger annealed shards land on the floor and make a dull thump each
  if (!tempered) {
    const hits = Math.min(6, 2 + Math.round(4 * energy));
    for (let j = 0; j < hits; j++) {
      const t = spread * (0.3 + 0.7 * (j / Math.max(1, hits)));
      addAt(out, impact(ctx, { material: floor, force: 0.3 * energy, variant: "bump", contact: 0.8, size: 0.5 }), t * sr, 0.8);
    }
  } else {
    // the pane itself hits the ground once, as a soft dull thud
    addAt(out, impact(ctx, { material: floor, force: 0.2 * energy, variant: "thud", contact: 0.4, size: 1.2 }), 0.02 * sr, 0.5);
  }
  return out;
}

export function glassBreak(ctx, p = {}) {
  const { sr, r } = ctx;
  const pane = p.pane ?? "annealed";
  const energy = clamp(p.energy ?? 0.6, 0, 1);
  const cracks = Math.round(clamp(p.cracks ?? 8, 2, 30));
  const shards = Math.round(clamp(p.shards ?? 3, 0, 8));
  const floor = p.floor ?? "concrete";
  const thick = clamp(p.thickness ?? 5, 2, 19) / 1000;
  const m0 = ctx.mat(PANE_KEYS[pane] ?? "glass");
  const m = pane === "laminated" ? { ...m0, t60: m0.t60 * 0.35 } : m0;
  const dur = 1.8;
  const out = alloc(samplesFor(dur, sr));

  // the first crack: a sharp pop
  addAt(out, click(r, sr, 0.0015, 3500 + 2000 * r.next(), 0.9, 0.5 + 0.5 * energy), 0);

  // crack propagation: ticks that arrive faster and louder as the crack runs
  for (let k = 0; k < cracks; k++) {
    const u = (k + 1) / cracks;
    const t = 0.02 + 0.6 * Math.pow(u, 1.6) + 0.02 * r.gauss();
    const amp = (0.2 + 0.5 * u) * (0.3 + 0.7 * energy) * (0.6 + 0.4 * r.next());
    addAt(out, click(r, sr, 0.0006, 4000 + 4000 * u, 1.1, amp), Math.max(0, t) * sr);
  }

  // the cracked pane rings briefly with its own modes
  const ringModes = materialModes(m, 6, (thick > 0 ? 1200 * Math.pow(0.005 / thick, 0.4) : 1200), null, 0);
  modal(out, 0.02 * sr, sr, ringModes.map((x) => ({ ...x, t60: x.t60 * 0.35 })), 0.2 * energy, 1.2);

  // a few pieces fall and land after the crack
  for (let j = 0; j < shards; j++) {
    const t = 0.4 + 0.5 * (j / Math.max(1, shards)) + 0.15 * r.next();
    addAt(out, glassShatter(ctx, { pane: "annealed", energy: 0.15, spread: 0.25, area: 0.2, thickness: thick * 1000, floor }), t * sr, 0.8);
  }
  addAt(out, impact(ctx, { material: floor, force: 0.25 + 0.25 * energy, variant: "bump", contact: 0.7, size: 0.5 }), 0.45 * sr);
  return out;
}
