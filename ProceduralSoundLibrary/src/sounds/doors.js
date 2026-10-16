// Doors: opening (hinge creak, latch), closing (swing whoosh, slam into the frame,
// latch clack, optional rebound). Both are built from the same stick-slip creak
// model and the impact model, so changing the door material re-voices everything.

import {
  alloc, samplesFor, addAt, bandpass, pinkNoise, cyclesOf, saw, clamp,
} from "../dsp.js";
import { impact } from "./impacts.js";

// Stick-slip creak: a noise band rung by a sawtooth-gated slip rhythm.
// speedAt(i) returns door speed 0..1 which raises the slip rate and pitch.
export function creakTone(ctx, { n, material = "oak", amount = 0.5, speedAt, pitchBias = 1 }) {
  const { sr, r } = ctx;
  const m = ctx.mat(material);
  const amt = clamp(amount, 0, 1);
  const slipRate = (i) => 2 + 18 * amt * speedAt(i) + 3;
  const cyc = cyclesOf(n, sr, slipRate);
  const fc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    fc[i] = (320 + 900 * (1 - m.bright * 0.5)) * pitchBias * (0.8 + 0.4 * speedAt(i));
  }
  const band = bandpass(pinkNoise(n, r), fc, 9 + 10 * m.bright, sr);
  const out = alloc(n);
  for (let i = 0; i < n; i++) {
    const gate = Math.pow(0.5 + 0.5 * saw(cyc[i]), 4);
    out[i] = band[i] * gate * (0.1 + 0.9 * speedAt(i)) * amt * 1.6;
  }
  return out;
}

export function doorOpen(ctx, p = {}) {
  const { sr } = ctx;
  const dur = clamp(p.duration ?? 2.2, 0.5, 8);
  const n = samplesFor(dur + 0.3, sr);
  const creak = clamp(p.creak ?? 0.5, 0, 1);
  const out = alloc(n);

  // swing profile: smooth ease-in-out; its derivative is the door speed
  const speedAt = (i) => {
    const x = clamp(i / (sr * dur), 0, 1);
    return clamp((6 * x * (1 - x)) / 1.5, 0, 1);
  };
  const body = creakTone(ctx, {
    n, material: p.material ?? "oak", amount: creak, speedAt, pitchBias: 1,
  });
  for (let i = 0; i < n; i++) out[i] += body[i];

  // hinge rub: broadband, quiet, sits under the creak
  const rub = bandpass(pinkNoise(n, ctx.r), 1100, 1.2, sr);
  for (let i = 0; i < n; i++) out[i] += rub[i] * 0.06 * creak * speedAt(i);

  // latch disengages at the start, and the door stop clacks at the end
  addAt(out, impact(ctx, { material: "steel", force: 0.22, contact: 0.95, variant: "bump", size: 0.05 }), 0.01 * sr);
  if (p.latch !== false) {
    addAt(out, impact(ctx, { material: "steel", force: 0.3, contact: 1, variant: "tap", size: 0.04 }), dur * 0.97 * sr);
  }
  return out;
}

export function doorClose(ctx, p = {}) {
  const { sr, r } = ctx;
  const dur = clamp(p.duration ?? 1.6, 0.5, 8);
  const slam = clamp(p.slam ?? 0.5, 0, 1);
  const speed = clamp(p.speed ?? 0.6, 0.1, 1);
  const tImp = dur * 0.72;
  const n = samplesFor(tImp + 1.2, sr);
  const out = alloc(n);

  // swing whoosh: accelerates into the frame (air pushed past the leaf)
  const whooshLen = samplesFor(tImp, sr);
  const air = bandpass(pinkNoise(whooshLen, r), 220 + 500 * speed, 0.8, sr);
  for (let i = 0; i < whooshLen; i++) {
    const x = i / whooshLen;
    out[i] += air[i] * (0.04 + 0.3 * x * x) * speed;
  }

  // leaf strikes the frame, and the frame answers
  addAt(out, impact(ctx, { material: p.material ?? "oak", force: slam, contact: 0.5, variant: "thud", size: 0.9 }), tImp * sr);
  addAt(out, impact(ctx, { material: p.frame ?? "pine", force: slam * 0.6, contact: 0.8, variant: "thud", size: 1.8 }), (tImp + 0.003) * sr);
  // latch bolt clacks into the keep
  if (p.latch !== false) {
    addAt(out, impact(ctx, { material: "steel", force: 0.12 + 0.3 * slam, contact: 1, variant: "tap", size: 0.04 }), (tImp + 0.06) * sr);
  }
  // rebound after a hard slam
  if (slam > 0.6 && p.bounce !== false) {
    addAt(out, impact(ctx, { material: p.material ?? "oak", force: 0.15 * slam, contact: 0.4, variant: "bump", size: 0.9 }), (tImp + 0.22) * sr);
  }
  // settle with a little creak as the leaf comes to rest
  const settleStart = tImp + 0.08;
  const settleLen = Math.min(n - Math.round(settleStart * sr), samplesFor(0.4, sr));
  if (settleLen > 0) {
    const sp = (i) => clamp(0.4 * (1 - i / settleLen), 0, 1);
    const c = creakTone(ctx, { n: settleLen, material: p.material ?? "oak", amount: 0.25, speedAt: sp, pitchBias: 0.8 });
    addAt(out, c, settleStart * sr, 0.8);
  }
  return out.subarray(0, Math.min(out.length, samplesFor(dur + 0.6, sr)));
}
