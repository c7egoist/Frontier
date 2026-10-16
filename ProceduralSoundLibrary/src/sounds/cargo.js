// Cargo: crates and loads moving on a floor. Force follows mass; the box material
// and the contents set the thud, the rattle and the friction character.

import { alloc, samplesFor, addAt, clamp } from "../dsp.js";
import { impact, scratch } from "./impacts.js";
import { creakTone } from "./doors.js";

export function cargo(ctx, p = {}) {
  const { sr, r } = ctx;
  const mode = p.mode ?? "drop";
  const box = p.box ?? "cardboard";
  const floor = p.floor ?? "concrete";
  const mass = clamp(p.mass ?? 40, 1, 2000);
  const contents = p.contents ?? "packed";
  const dur = clamp(p.duration ?? 2.5, 0.5, 8);
  const n = samplesFor(dur + 0.5, sr);
  const out = alloc(n);
  const force = clamp(0.2 + 0.25 * Math.log10(mass / 3), 0.1, 1);

  // what rattles inside: loose fittings (steel), packing or tins (plastic), or nothing
  const rattleMat = contents === "packed" ? "steel" : "plastic_abs";
  const rattleRate = contents === "packed" ? 0.5 : contents === "hollow" ? 0.12 : 0;

  const rattle = (start, length, scale = 1) => {
    if (rattleRate <= 0) return;
    let t = start;
    while (t < start + length) {
      t += r.expo(rattleRate);
      if (t >= start + length) break;
      addAt(out, impact(ctx, {
        material: rattleMat, force: force * 0.4 * scale * (0.5 + r.next()),
        contact: 1, variant: "tap", size: 0.05 + 0.1 * r.next(),
      }), t * sr);
    }
  };

  if (mode === "drop") {
    // crate hits the floor, bounces once, and the contents settle
    addAt(out, impact(ctx, { material: box, force, contact: 0.4, variant: "thud", size: 0.5 }), 0);
    addAt(out, impact(ctx, { material: floor, force: force * 0.9, contact: 0.5, variant: "thud", size: 1.5 }), 0.003 * sr);
    addAt(out, impact(ctx, { material: box, force: force * 0.35, contact: 0.5, variant: "bump", size: 0.5 }), 0.14 * sr);
    rattle(0.1, dur * 0.8, 0.8);
  } else if (mode === "slide") {
    // friction across the floor, with a clack at each floor joint
    addAt(out, scratch(ctx, {
      material: floor, tool: box, speed: 0.25 + 0.5 * force, pressure: force, grit: 1.2, length: dur, jitter: 0.4,
    }), 0);
    const joints = Math.max(1, Math.round(dur / 0.45));
    for (let j = 0; j < joints; j++) {
      const t = (j + 0.5) * (dur / joints) + 0.05 * r.gauss();
      addAt(out, impact(ctx, { material: floor, force: force * 0.35, contact: 0.7, variant: "tap", size: 0.2 }), t * sr);
    }
  } else if (mode === "shift") {
    // strapped load shifting: strap creak with occasional thunks as it moves
    const c = creakTone(ctx, {
      n: samplesFor(dur, sr), material: "steel", amount: 0.7,
      speedAt: (i) => (0.5 + 0.5 * Math.sin((2 * Math.PI * i) / (sr * 0.9))),
      pitchBias: 0.7,
    });
    addAt(out, c, 0, 0.7);
    const thunks = Math.round(dur * 1.5);
    for (let k = 0; k < thunks; k++) {
      const t = r.next() * dur;
      addAt(out, impact(ctx, { material: box, force: force * 0.5, contact: 0.5, variant: "bump", size: 0.6 }), t * sr);
    }
  } else if (mode === "rattle") {
    // loose contents only (a van on a bumpy road, a bin of tins)
    addAt(out, impact(ctx, { material: box, force: force * 0.3, contact: 0.5, variant: "bump", size: 0.6 }), 0);
    rattle(0.02, dur, 1.2);
  } else if (mode === "strap") {
    // ratchet strap tightening: clicks at a steady pace, creak on tension
    const c = creakTone(ctx, {
      n: samplesFor(dur, sr), material: "steel", amount: 0.45,
      speedAt: (i) => clamp(0.3 + 0.5 * (i / (sr * dur)), 0, 1),
      pitchBias: 1.1,
    });
    addAt(out, c, 0, 0.5);
    const clicks = Math.max(2, Math.round(dur / 0.12));
    for (let k = 0; k < clicks; k++) {
      const t = 0.05 + k * (dur - 0.1) / clicks;
      addAt(out, impact(ctx, { material: "steel", force: 0.3 + 0.2 * (k / clicks), contact: 1, variant: "tap", size: 0.04 }), t * sr);
    }
  }
  return out;
}
