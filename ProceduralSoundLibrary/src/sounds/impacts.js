// Impacts (bump, knock, tap, thud) and surface friction (scratch, scrape).

import {
  alloc, samplesFor, addAt, modal, click, bandpass, lowpass, pinkNoise,
  expDecay, clamp, TAU,
} from "../dsp.js";
import { materialModes } from "../materials.js";

// A single object struck by something. Modes come from the material's resonator
// family; contact controls how much of the crisp transient and upper partials survive.
export function impact(ctx, p = {}) {
  const { sr, r } = ctx;
  const m = ctx.mat(p.material ?? "steel");
  const force = clamp(p.force ?? 0.6, 0, 1);
  const contact = clamp(p.contact ?? 0.6, 0, 1);
  const size = Math.max(0.01, (p.size ?? 0.3) * ctx.cond.size);
  const variant = p.variant ?? "bump";
  const body = Math.min(2.4, 0.12 + m.t60 * 1.2);
  const dur = variant === "knock" ? body + 0.4 : body;
  const out = alloc(samplesFor(dur, sr));

  const hits =
    variant === "knock" ? [[0, 1], [0.16, 0.8], [0.3, 0.65]] : [[0, 1]];
  const hitGain = variant === "tap" ? 0.45 : variant === "thud" ? 0.9 : 1;
  const f0 = m.base * Math.pow(0.3 / size, 0.8);
  const loud = 0.8 + 0.2 * clamp(m.density / 7850, 0.1, 1);

  for (const [t, k] of hits) {
    const amp = (0.25 + 0.75 * force) * hitGain * k * loud;
    const modes = materialModes(m, 10, f0 * (1 + 0.008 * r.gauss()), r, ctx.cond.wear).map((x, i) =>
      i === 0 ? x : { ...x, a: x.a * (0.25 + 0.75 * contact) }
    );
    modal(out, t * sr, sr, modes, amp, body);

    // contact transient: hard surfaces click, soft ones only thud
    const clickAmp = amp * 0.7 * m.hard * (0.3 + 0.7 * contact);
    addAt(out, click(r, sr, 0.0006 + 0.0025 * (1 - m.hard), 1200 + 6500 * m.hard * contact, 1.0, clickAmp), t * sr);
    // surface grain: roughness adds a short noisy scuff
    const grainAmp = amp * 0.12 * m.grain;
    addAt(out, click(r, sr, 0.003 + 0.012 * m.grain, 500 + 1500 * m.grain, 0.8, grainAmp), t * sr);
  }

  if (variant === "thud" || (variant === "bump" && force > 0.5)) {
    // low body thump of the struck mass (what you feel more than hear)
    const f = 60 + 60 * (1 - clamp(size / 1.5, 0, 1));
    const tau = variant === "thud" ? 0.07 : 0.02;
    const len = Math.min(out.length, samplesFor(tau * 7, sr));
    const env = expDecay(len, sr, tau);
    const amp = 0.55 * force * (variant === "thud" ? 1 : 0.4);
    for (let i = 0; i < len; i++) out[i] += Math.sin((TAU * f * i) / sr) * env[i] * amp;
  }
  return out;
}

// Friction across a surface. The tool drives the stick-slip, the surface supplies
// the resonance (hard surfaces ring, soft ones only hiss), grit sets the pitch:
// pitch = speed / grit spacing, so a fine grit above ~2 kHz turns into hiss.
export function scratch(ctx, p = {}) {
  const { sr, r } = ctx;
  const s = ctx.mat(p.material ?? "steel");
  const tl = ctx.mat(p.tool ?? "steel");
  const speed = clamp(p.speed ?? 0.3, 0.02, 2);
  const pressure = clamp(p.pressure ?? 0.6, 0, 1);
  const grit = Math.max(0.05, p.grit ?? 0.5) / 1000;
  const len = clamp(p.length ?? 1.2, 0.1, 6);
  const jitter = clamp(p.jitter ?? 0.25, 0, 1);
  const n = samplesFor(len, sr);

  // impulse train at the grain rate (one impulse per asperity)
  const train = alloc(n);
  const rate = Math.min(speed / grit, 4000);
  const pulseAmp = (0.2 + 0.8 * pressure) * (0.4 + 0.6 * tl.hard);
  let t = 0;
  while (t < len) {
    const idx = Math.floor(t * sr);
    if (idx >= 0 && idx < n) train[idx] += pulseAmp * (0.55 + 0.9 * r.next());
    t += (1 / Math.max(rate, 5)) * Math.max(0.3, 1 + jitter * 0.35 * r.gauss());
  }
  // the surface resonance rings with each asperity; metals ring long, wood thuds
  const fRes = clamp(s.base * 2.2 * (0.8 + 0.4 * tl.bright), 180, 7000);
  const q = 2 + 22 * clamp(s.t60 / 1.0, 0, 1) + 4 * s.hard;
  const ring = bandpass(train, fRes, q, sr);
  for (let i = 0; i < n; i++) ring[i] *= 4 * (1 - 0.3 * s.grain);

  // hiss: friction noise, louder on rough surfaces
  const hissBase = bandpass(pinkNoise(n, r), clamp(2500 + 3000 * s.grain, 1200, 9000), 0.9, sr);
  const gate = alloc(n);
  for (let i = 0; i < n; i++) {
    // slow stick-slip rhythm modulates the friction noise
    const ph = (i / sr) * clamp(speed / grit / 40, 2, 60);
    gate[i] = 0.55 + 0.45 * Math.sin(TAU * ph);
  }
  const hiss = alloc(n);
  for (let i = 0; i < n; i++) hiss[i] = hissBase[i] * gate[i] * (0.08 + 0.3 * s.grain) * (0.3 + 0.7 * pressure);

  // low rumble from slow scrapes
  const rumble = lowpass(pinkNoise(n, r), 300 + 600 * speed, sr);
  const out = alloc(n);
  const attack = Math.min(n, Math.round(0.02 * sr));
  const release = Math.min(n, Math.round(0.06 * sr));
  for (let i = 0; i < n; i++) {
    let env = 1;
    if (i < attack) env = i / attack;
    if (i > n - release) env = Math.min(env, (n - i) / release);
    out[i] = env * (ring[i] * (0.4 + 0.6 * tl.hard) * (0.4 + 0.6 * pressure) + hiss[i] + rumble[i] * 0.15 * pressure);
  }
  return out;
}
