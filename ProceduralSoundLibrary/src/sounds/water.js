// Water: drips, pours, splashes, streams and puddle steps.
// Drips use the Minnaert bubble frequency (f = 3.26 / radius), so the drop size
// sets the pitch. Splash and pour are filtered noise with bubble chirps on top.
// The surface under the water colours the result through its own resonance.

import { alloc, samplesFor, addAt, bandpass, lowpass, highpass, pinkNoise, clamp, expDecay, TAU } from "../dsp.js";
import { impact } from "./impacts.js";

// one bubble: a sine whose pitch dips quickly, then decays
function bubble(out, at, sr, f0, tau, amp, r) {
  const len = Math.min(out.length - Math.round(at), samplesFor(tau * 7, sr));
  if (len <= 0) return;
  const o = Math.max(0, Math.round(at));
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = f0 * (1 + 0.5 * Math.exp(-t / 0.004));
    ph += (TAU * f) / sr;
    out[o + i] += Math.sin(ph) * Math.exp(-t / tau) * amp;
  }
}

export function water(ctx, p = {}) {
  const { sr, r } = ctx;
  const mode = p.mode ?? "drip";
  const surf = ctx.mat(p.surface ?? "ceramic_tile");
  const dur = clamp(p.duration ?? 1.5, 0.3, 8);
  const volume = clamp(p.volume ?? 0.5, 0.02, 5);
  const height = clamp(p.height ?? 0.2, 0.01, 2);
  const depth = clamp(p.depth ?? 0.01, 0.001, 0.2);
  const turb = clamp(p.turbulence ?? 0.5, 0, 1);
  const n = samplesFor(dur, sr);
  const out = alloc(n);

  const impactSpeed = Math.sqrt(2 * 9.81 * height); // m/s
  const force = clamp(impactSpeed / 4.4, 0.05, 1);
  const shallow = clamp(1 - depth / 0.05, 0, 1);      // shallow film = brighter splash

  if (mode === "drip") {
    // Minnaert: drop radius in mm -> bubble frequency in Hz
    const rate = 1.2 + 3 * turb;
    let t = 0.02;
    while (t < dur - 0.05) {
      const rMm = clamp(1.4 + 1.6 * volume, 1.2, 4.5);
      bubble(out, t * sr, sr, 3260 / rMm, 0.012 + 0.01 * rMm / 4, 0.55 * (0.4 + 0.6 * force), r);
      addAt(out, impact(ctx, { material: p.surface ?? "ceramic_tile", force: 0.08 * force, contact: 0.9, variant: "tap", size: 0.05 }), t * sr);
      t += r.expo(1 / rate);
    }
    return lowpass(out, 4000 + 9000 * surf.bright, sr);
  }

  if (mode === "pour" || mode === "stream") {
    // continuous water: broadband body plus a crowd of bubbles
    const body = bandpass(pinkNoise(n, r), 900 + 2500 * force * (0.5 + turb), 0.8, sr);
    const bubblesPerSec = (mode === "pour" ? 150 : 60) * (0.4 + volume * 0.6) * (0.3 + turb);
    let t = 0;
    while (t < dur) {
      t += r.expo(1 / Math.max(1, bubblesPerSec));
      const f = 400 + 2200 * r.next() * (0.5 + turb);
      bubble(out, t * sr, sr, f, 0.002 + 0.006 * r.next(), 0.05 + 0.12 * force, r);
    }
    for (let i = 0; i < n; i++) {
      const wobble = 0.8 + 0.2 * Math.sin((TAU * 2 * i) / sr);
      out[i] += body[i] * (0.18 + 0.32 * force) * wobble;
    }
    addAt(out, impact(ctx, { material: p.surface ?? "ceramic_tile", force: 0.25 * force, contact: 0.7, variant: "bump", size: 0.2 }), 0);
    return highpass(lowpass(out, 3000 + 12000 * surf.bright * (0.5 + shallow * 0.5), sr), 120, sr);
  }

  if (mode === "splash") {
    // a single splash: sharp hiss decaying over time, crown droplets, one thump
    const hiss = bandpass(pinkNoise(n, r), 2000 + 4000 * force, 0.7, sr);
    const env = expDecay(n, sr, 0.06 + 0.12 * height);
    for (let i = 0; i < n; i++) {
      const a = Math.min(1, i / (0.002 * sr));
      out[i] += hiss[i] * env[i] * a * (0.4 + 0.6 * force);
    }
    const drops = Math.round(20 + 120 * force * (0.5 + turb));
    for (let k = 0; k < drops; k++) {
      const t = Math.pow(r.next(), 1.8) * 0.5;
      bubble(out, t * sr, sr, 800 + 3000 * r.next(), 0.004 + 0.01 * r.next(), 0.1 * force, r);
    }
    addAt(out, impact(ctx, { material: p.surface ?? "ceramic_tile", force: 0.5 * force, contact: 0.6, variant: "thud", size: 0.6 }), 0);
    return highpass(lowpass(out, 3500 + 10000 * surf.bright * (0.4 + 0.6 * shallow), sr), 150, sr);
  }

  if (mode === "puddle") {
    // a foot into a puddle: heavy thump, then a short splash
    addAt(out, impact(ctx, { material: "concrete", force: 0.6 + 0.3 * force, contact: 0.3, variant: "thud", size: 1.0 }), 0);
    const splashLen = Math.min(n, samplesFor(0.6, sr));
    const sp = new Float32Array(splashLen);
    const hiss = bandpass(pinkNoise(splashLen, r), 1500 + 1000 * force, 0.6, sr);
    const env = expDecay(splashLen, sr, 0.12);
    for (let i = 0; i < splashLen; i++) sp[i] = hiss[i] * env[i] * (0.5 + 0.5 * force);
    addAt(out, sp, 0.02 * sr, 0.9);
    const drops = Math.round(30 + 60 * force);
    for (let k = 0; k < drops; k++) {
      const t = 0.02 + Math.pow(r.next(), 2) * 0.4;
      bubble(out, t * sr, sr, 600 + 2000 * r.next(), 0.006, 0.08 * force, r);
    }
    return lowpass(out, 6000 + 6000 * surf.bright, sr);
  }

  return out;
}
