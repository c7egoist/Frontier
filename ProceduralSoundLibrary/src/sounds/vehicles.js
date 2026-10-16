// Vehicles and machines: electric motor, tyre squeal, car crash.

import {
  alloc, samplesFor, addAt, modal, bandpass, lowpass, pinkNoise, brownNoise,
  cyclesOf, saw, tone, clamp, TAU,
} from "../dsp.js";
import { materialModes } from "../materials.js";
import { impact } from "./impacts.js";
import { glassShatter } from "./glass.js";

// Electric motor. The audible tone is set by the commutation frequency:
//   brushless (6-step drive): 6 x electrical frequency
//   brushed / induction:      slot count x mechanical frequency
// Brushed motors add brush-commutation crackle; the housing colours everything.
export function electricMotor(ctx, p = {}) {
  const { sr, r } = ctx;
  const type = p.type ?? "brushless";
  const rpm = clamp(p.rpm ?? 6000, 300, 24000);
  const poles = clamp(Math.round(p.poles ?? 4), 2, 12);
  const slots = clamp(Math.round(p.slots ?? 24), 6, 48);
  const load = clamp(p.load ?? 0.4, 0, 1);
  const ramp = clamp(p.ramp ?? 0.6, 0.02, 4);
  const dur = clamp(p.duration ?? 3, 0.4, 10);
  const profile = p.profile ?? "spinup";
  const brushAmt = clamp(p.brushNoise ?? 0.3, 0, 1);
  const housing = ctx.mat(p.housing ?? "aluminium");
  const n = samplesFor(dur, sr);

  const rpmAt = (i) => {
    const t = i / sr;
    if (profile === "spinup") return rpm * (1 - Math.exp(-t / ramp));
    if (profile === "spindown") return rpm * Math.exp(-t / ramp);
    return rpm;
  };
  const mech = (i) => Math.max(1, rpmAt(i)) / 60;
  const elec = (i) => mech(i) * (poles / 2);
  const commutation = type === "brushless" ? (i) => 6 * elec(i) : (i) => slots * mech(i);

  const harm = [[1, 1], [2, 0.55], [3, 0.3], [4, 0.16], [5, 0.09], [6, 0.05]].map(([k, a]) => [
    k,
    a * (0.35 + 0.65 * load),
  ]);
  const main = tone(n, sr, commutation, harm);

  // rotor rumble at the mechanical rate, very low
  const rumble = tone(n, sr, mech, [[1, 0.18 * (0.5 + load)]]);

  // slot ripple (induction and brushed): weak tone at slot count x mechanical
  const slot = tone(n, sr, (i) => slots * mech(i), [[1, 0.12 * load]]);

  // housing colour: the case resonates near its own bending mode
  const hous = bandpass(main, housing.base * 2.5, 2.5, sr);

  // brush crackle: a burst each time a brush segment passes
  const brush = alloc(n);
  if (type === "brushed" && brushAmt > 0) {
    const cyc = cyclesOf(n, sr, (i) => slots * mech(i));
    let last = Math.floor(cyc[0]);
    for (let i = 1; i < n; i++) {
      const c = Math.floor(cyc[i]);
      if (c !== last) {
        last = c;
        const amp = brushAmt * (0.4 + 0.6 * r.next()) * (0.3 + 0.7 * load);
        for (let k = 0; k < 40 && i + k < n; k++) brush[i + k] += amp * (r.next() * 2 - 1) * Math.exp(-k / 9);
      }
    }
  }

  const out = alloc(n);
  for (let i = 0; i < n; i++) {
    out[i] = (main[i] * 0.55 + rumble[i] + slot[i] + hous[i] * 0.25 + brush[i]) * (0.8 + 0.2 * load);
  }
  return out;
}

// Tyre squeal: stick-slip between tread and road. A formant band (set by the
// compound) is gated by a sawtooth whose rate follows the slip speed. Wet roads
// cut the squeal and add hiss, which is why wet tyres are quieter but noisier.
export function tyreSqueal(ctx, p = {}) {
  const { sr, r } = ctx;
  const surface = ctx.mat(p.surface ?? "asphalt");
  const hard = clamp(p.hard ?? 0.4, 0, 1);
  const speed0 = clamp(p.speed ?? 40, 5, 120);
  const slip = clamp(p.slip ?? 0.8, 0, 1);
  const dur = clamp(p.duration ?? 2, 0.3, 10);
  const burnout = clamp(p.burnout ?? 0, 0, 1);
  const n = samplesFor(dur, sr);
  const wetK = 1 - 0.6 * ctx.cond.wet;

  const sp = (i) => clamp(speed0 * (1 - 0.5 * (i / n)), 5, 120) / 120;
  const stickRate = (i) => 40 + 260 * sp(i);
  const cyc = cyclesOf(n, sr, stickRate);
  const formant = (i) => (2000 - 900 * hard) * (0.85 + 0.15 * sp(i)) * (1 + 0.02 * Math.sin((TAU * 6 * i) / sr));
  const f1 = tone(n, sr, formant, [[1, 1]]);
  const f2 = tone(n, sr, (i) => formant(i) * 1.47, [[1, 1]]);

  const out = alloc(n);
  for (let i = 0; i < n; i++) {
    const gate = Math.pow(0.5 + 0.5 * saw(cyc[i]), 3);
    out[i] = (f1[i] * 0.8 + f2[i] * 0.5) * gate * slip * wetK * 0.6;
  }

  // broadband tread hiss, louder on rough road and when wet
  const hiss = bandpass(pinkNoise(n, r), 4000, 1.0, sr);
  const hissGain = (0.08 + 0.15 * surface.grain) * (0.3 + 0.7 * slip) * (1 + 0.8 * ctx.cond.wet);
  for (let i = 0; i < n; i++) out[i] += hiss[i] * hissGain;

  // burnout: low rumble from wheelspin
  if (burnout > 0) {
    const rum = lowpass(brownNoise(n, r), 110, sr);
    for (let i = 0; i < n; i++) out[i] += rum[i] * burnout * 0.8;
  }

  // envelope: squeal starts sharp and fades with the lock
  const att = Math.min(n, Math.round(0.04 * sr));
  const rel = Math.min(n, Math.round(0.15 * sr));
  for (let i = 0; i < n; i++) {
    let e = 1;
    if (i < att) e = i / att;
    if (i > n - rel) e = Math.min(e, (n - i) / rel);
    out[i] *= e;
  }
  return out;
}

// Car crash: a composite of the parts that really happen, in order.
//   thud (chassis hit) -> crumple (many sheet-metal impacts, density drops off)
//   -> tearing/grinding -> glass shower -> debris -> tyres -> body ringing.
export function carCrash(ctx, p = {}) {
  const { sr, r } = ctx;
  const sev = clamp(p.severity ?? 0.7, 0, 1);
  const body = p.body ?? "steel";
  const dur = clamp(p.duration ?? 3.5, 1, 8);
  const n = samplesFor(dur, sr);
  const out = alloc(n);

  // 1) chassis thud: low sweep that falls in pitch
  const tn = samplesFor(0.35, sr);
  const thud = tone(tn, sr, (i) => 35 + 90 * Math.exp(-(i / sr) * 14), [[1, 1]]);
  for (let i = 0; i < tn; i++) thud[i] *= Math.exp(-(i / sr) / 0.09) * sev * 0.9;
  addAt(out, thud, 0);

  // 2) crumple: sheet metal folding; hits come fast early and thin out
  const count = Math.round(18 + 70 * sev);
  for (let k = 0; k < count; k++) {
    const u = r.next();
    const t = dur * 0.55 * u * u;
    const force = clamp(sev * (0.3 + 0.7 * r.next()) * (1 - u * 0.6), 0.05, 1);
    const size = 0.1 + 0.3 * r.next();
    addAt(out, impact(ctx, { material: body, force, contact: 0.3, variant: "bump", size }), t * sr);
  }

  // 3) tearing: band-limited friction on the bent panels, grinding in a rhythm
  const tearStart = Math.round(dur * 0.12 * sr);
  const tearEnd = Math.round(dur * 0.6 * sr);
  const tearLen = Math.max(1, tearEnd - tearStart);
  const tearRaw = bandpass(pinkNoise(tearLen, r), 1200, 2, sr);
  const grind = tone(tearLen, sr, () => 22, [[1, 1]]);
  for (let i = 0; i < tearLen; i++) {
    const x = i / tearLen;
    const env = Math.sin(Math.PI * x) * (0.6 + 0.4 * (0.5 + 0.5 * grind[i]));
    out[tearStart + i] += tearRaw[i] * env * sev * 0.25;
  }

  // 4) glass: side windows and the windscreen go in a tempered shower
  if (p.glass !== false) {
    addAt(out, glassShatter(ctx, {
      pane: "tempered", area: 1.4, thickness: 4, energy: 0.35 + 0.65 * sev,
      spread: Math.min(1.2, dur * 0.35), floor: p.surface ?? "asphalt",
    }), 0.1 * sr, 0.7);
  }

  // 5) debris and bumper parts bouncing
  const debris = 6;
  for (let j = 0; j < debris; j++) {
    const t = dur * (0.2 + 0.5 * (j / debris)) + 0.1 * r.next();
    addAt(out, impact(ctx, {
      material: j % 2 ? "plastic_abs" : body, force: sev * (0.6 - 0.07 * j), variant: "tap", contact: 0.7, size: 0.2,
    }), t * sr);
  }

  // 6) tyres locking and skidding
  if (p.squeal !== false) {
    addAt(out, tyreSqueal(ctx, {
      surface: p.surface ?? "asphalt", speed: 45 + 30 * sev, slip: 0.9, hard: 0.4,
      duration: Math.min(dur, 2.2),
    }), 0.05 * sr, 0.3 + 0.4 * sev);
  }

  // 7) the body rings after the hit
  const bodyMat = ctx.mat(body);
  const ringModes = materialModes({ ...bodyMat, t60: bodyMat.t60 * 2.2 }, 8, 90, r, 0);
  modal(out, 0.05 * sr, sr, ringModes, 0.25 * sev, 4);

  return out;
}
