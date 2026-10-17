/**
 * High-level procedural primitives for Iron Man-style UI.
 * These are composition helpers built on top of Engine primitives.
 * Goal: sleek, tactile, cinematic — NOT 8-bit, NOT alien.
 */

import type { IEngine } from '../types.js';

function jitter(base: number, amount = 0.03): number {
  return base * (1 + (Math.random() * 2 - 1) * amount);
}

// ─────────────────────────────────────────────
// GLASS TICK — base tactile element
// ─────────────────────────────────────────────
export function glassTick(
  engine: IEngine,
  freq = 1800,
  gain = 0.4,
  opts: { bright?: boolean; at?: number } = {}
) {
  const t0 = opts.at ?? engine.now();
  const bright = opts.bright ?? false;

  // Main sine with ultra-short decay
  engine.playTone(
    {
      freq: jitter(freq, 0.02),
      freqEnd: freq * 0.72,
      glideTime: 0.06,
      waveform: 'sine-tri',
      attack: 0.0015,
      decay: 0.09,
      gain: gain * 0.85,
      filterType: 'bandpass',
      filterFreq: bright ? 5000 : 3200,
      filterQ: 0.9
    },
    t0
  );

  // Subtle sub for weight (Iron Man clicks have mass)
  engine.playTone(
    {
      freq: freq * 0.18,
      waveform: 'sine',
      attack: 0.002,
      decay: 0.12,
      gain: gain * 0.12,
      filterType: 'lowpass',
      filterFreq: 400
    },
    t0
  );
}

// ─────────────────────────────────────────────
// CONFIRM BLIP — rising, affirmative
// ─────────────────────────────────────────────
export function confirmBlip(engine: IEngine, baseFreq = 800, gain = 0.5, at?: number) {
  const t0 = at ?? engine.now();

  // First tone — lower
  engine.playTone(
    {
      freq: baseFreq,
      freqEnd: baseFreq * 1.25,
      glideTime: 0.08,
      waveform: 'sine-tri',
      attack: 0.004,
      decay: 0.14,
      gain: gain * 0.6,
      filterFreq: 6000
    },
    t0
  );

  // Second tone — higher, delayed 60ms, major third (sleek = consonant)
  engine.playTone(
    {
      freq: baseFreq * 1.5, // perfect fifth
      freqEnd: baseFreq * 1.9,
      glideTime: 0.12,
      waveform: 'sine',
      attack: 0.003,
      decay: 0.22,
      gain: gain * 0.75,
      filterFreq: 7000
    },
    t0 + 0.065
  );

  // Air tick
  engine.playNoise(
    {
      type: 'band',
      bandFreq: 7200,
      bandQ: 1.2,
      attack: 0.001,
      decay: 0.04,
      gain: gain * 0.18
    },
    t0
  );
}

// ─────────────────────────────────────────────
// DENY / ERROR — descending minor second, FM for dissonance but still sleek
// ─────────────────────────────────────────────
export function denyBlip(engine: IEngine, baseFreq = 600, gain = 0.5, at?: number) {
  const t0 = at ?? engine.now();

  engine.playFMTone(
    {
      carrierFreq: baseFreq,
      modFreq: baseFreq * 0.98,
      modIndex: 12,
      modIndexEnd: 1,
      attack: 0.005,
      decay: 0.28,
      gain: gain * 0.6,
      filterFreq: 3800
    },
    t0
  );

  engine.playTone(
    {
      freq: baseFreq * 0.93, // minor second down
      freqEnd: baseFreq * 0.72,
      glideTime: 0.22,
      waveform: 'triangle',
      attack: 0.006,
      decay: 0.3,
      gain: gain * 0.5,
      filterType: 'lowpass',
      filterFreq: 3200
    },
    t0 + 0.07
  );
}

// ─────────────────────────────────────────────
// WHOOSH — filtered noise sweep, cinematic motion
// ─────────────────────────────────────────────
export function whoosh(
  engine: IEngine,
  duration = 0.35,
  gain = 0.45,
  direction: 'in' | 'out' = 'out',
  at?: number
) {
  const t0 = at ?? engine.now();
  const ctx = engine.context;

  // Noise sweep via automated bandpass
  const buffer = engine.getNoiseBuffer('white');
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 0.8;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;

  const gainNode = ctx.createGain();

  // Frequency sweep
  const startFreq = direction === 'out' ? 200 : 6000;
  const endFreq = direction === 'out' ? 7000 : 300;

  bp.frequency.setValueAtTime(startFreq, t0);
  bp.frequency.exponentialRampToValueAtTime(Math.max(100, endFreq), t0 + duration * 0.9);

  lp.frequency.setValueAtTime(12000, t0);
  lp.frequency.linearRampToValueAtTime(4000, t0 + duration);

  gainNode.gain.setValueAtTime(0, t0);
  gainNode.gain.linearRampToValueAtTime(gain * 0.6, t0 + duration * 0.12);
  gainNode.gain.linearRampToValueAtTime(gain * 0.35, t0 + duration * 0.65);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(bp);
  bp.connect(hp);
  hp.connect(lp);
  lp.connect(gainNode);
  gainNode.connect(engine.masterGain);

  // Slight reverb
  const rev = ctx.createGain();
  rev.gain.value = 0.3;
  gainNode.connect(rev);
  rev.connect(engine.reverbNode);

  src.start(t0);
  src.stop(t0 + duration + 0.05);

  // Add tonal sheen — high sine that follows sweep
  engine.playTone(
    {
      freq: direction === 'out' ? 1200 : 800,
      freqEnd: direction === 'out' ? 2800 : 400,
      glideTime: duration * 0.85,
      waveform: 'sine',
      attack: duration * 0.15,
      decay: duration * 0.7,
      gain: gain * 0.22,
      filterFreq: 8000
    },
    t0 + 0.01
  );
}

// ─────────────────────────────────────────────
// SCAN / PROCESSING — rhythmic pulse with FM shimmer
// ─────────────────────────────────────────────
export function scanPulse(engine: IEngine, baseFreq = 1200, gain = 0.38, at?: number) {
  const t0 = at ?? engine.now();
  engine.playFMTone(
    {
      carrierFreq: jitter(baseFreq, 0.015),
      modFreq: baseFreq * 2.01,
      modIndex: 4,
      modIndexEnd: 0.2,
      attack: 0.003,
      decay: 0.18,
      gain: gain,
      filterFreq: 5500
    },
    t0
  );

  engine.playNoise(
    {
      type: 'band',
      bandFreq: 5000,
      bandQ: 2,
      attack: 0.001,
      decay: 0.03,
      gain: gain * 0.18
    },
    t0
  );
}

// ─────────────────────────────────────────────
// POWER — boot/shutdown with layered rise
// ─────────────────────────────────────────────
export function powerOn(engine: IEngine, gain = 0.6, at?: number) {
  const t0 = at ?? engine.now();

  // Sub rise
  engine.playTone(
    {
      freq: 80,
      freqEnd: 160,
      glideTime: 0.6,
      waveform: 'sine',
      attack: 0.08,
      decay: 0.7,
      gain: gain * 0.35,
      filterFreq: 500
    },
    t0
  );

  // Mid glassy sweep
  engine.playTone(
    {
      freq: 300,
      freqEnd: 1200,
      glideTime: 0.55,
      waveform: 'sine-tri',
      attack: 0.12,
      decay: 0.65,
      gain: gain * 0.55,
      filterFreq: 5000
    },
    t0 + 0.05
  );

  // High shimmer at end
  engine.playTone(
    {
      freq: 1800,
      freqEnd: 2400,
      glideTime: 0.25,
      waveform: 'sine',
      attack: 0.02,
      decay: 0.35,
      gain: gain * 0.4,
      filterFreq: 8000
    },
    t0 + 0.45
  );

  engine.playFMTone(
    {
      carrierFreq: 2400,
      modFreq: 4800,
      modIndex: 2,
      modIndexEnd: 0.1,
      attack: 0.01,
      decay: 0.4,
      gain: gain * 0.3
    },
    t0 + 0.48
  );
}

export function powerOff(engine: IEngine, gain = 0.55, at?: number) {
  const t0 = at ?? engine.now();

  engine.playTone(
    {
      freq: 1200,
      freqEnd: 180,
      glideTime: 0.45,
      waveform: 'sine-tri',
      attack: 0.01,
      decay: 0.5,
      gain: gain * 0.6,
      filterFreq: 6000,
      filterFreqEnd: 800
    },
    t0
  );

  engine.playTone(
    {
      freq: 180,
      freqEnd: 40,
      glideTime: 0.6,
      waveform: 'sine',
      attack: 0.04,
      decay: 0.65,
      gain: gain * 0.4,
      filterFreq: 600
    },
    t0 + 0.05
  );

  engine.playNoise(
    {
      type: 'band',
      bandFreq: 2500,
      bandQ: 0.8,
      attack: 0.01,
      decay: 0.25,
      gain: gain * 0.15
    },
    t0 + 0.1
  );
}
