/**
 * DSP primitives shared by the whole catalog.
 *
 * Sounds are built only from these: sine/triangle oscillators, shaped noise,
 * biquad filters, FM bells and pitch-dropping thumps. There are deliberately
 * no square/saw leads and no bitcrushing anywhere in the catalog — the
 * aesthetic target is brushed metal, glass and soft plasma rather than
 * retro game hardware.
 */

import type { FilterOptions } from '../types';

export const MIN_GAIN = 0.0001;

/** Equal-tempered note table used across the catalog (A4 = 440 Hz). */
export const NOTE = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760.0,
} as const;

export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export const dbToGain = (db: number) => 10 ** (db / 20);

/* ------------------------------------------------------------------ *
 * Shared noise buffers (one white + one pink per context)
 * ------------------------------------------------------------------ */

interface NoiseBuffers {
  white: AudioBuffer;
  pink: AudioBuffer;
}

const noiseCache = new WeakMap<BaseAudioContext, NoiseBuffers>();

function buildNoise(ctx: BaseAudioContext, kind: 'white' | 'pink'): AudioBuffer {
  const seconds = 2;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (kind === 'white') {
    // Deterministic noise so offline renders are reproducible.
    const rng = mulberry32Local(0x9e3779b9);
    for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;
  } else {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    const rng = mulberry32Local(0x85ebca6b);
    for (let i = 0; i < data.length; i++) {
      const w = rng() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  // Avoid a click if a source loops/ends at the buffer boundary.
  data[0] = 0;
  data[data.length - 1] = 0;
  return buffer;
}

function mulberry32Local(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noiseBuffer(ctx: BaseAudioContext, kind: 'white' | 'pink' = 'white'): AudioBuffer {
  let entry = noiseCache.get(ctx);
  if (!entry) {
    entry = { white: buildNoise(ctx, 'white'), pink: buildNoise(ctx, 'pink') };
    noiseCache.set(ctx, entry);
  }
  return entry[kind];
}

/* ------------------------------------------------------------------ *
 * Envelope helpers
 * ------------------------------------------------------------------ */

export interface EnvelopeShape {
  attack: number;
  hold: number;
  release: number;
  peak: number;
}

/**
 * Schedules a smooth percussive envelope on a gain param.
 * Returns the absolute time at which the envelope reaches silence.
 */
export function scheduleEnvelope(
  param: AudioParam,
  start: number,
  shape: EnvelopeShape,
): number {
  const attack = Math.max(0.0005, shape.attack);
  const hold = Math.max(0, shape.hold);
  const release = Math.max(0.012, shape.release);
  const peak = Math.max(MIN_GAIN, shape.peak);
  const sustain = peak * 0.7;

  param.setValueAtTime(MIN_GAIN, start);
  param.exponentialRampToValueAtTime(peak, start + attack);
  if (hold > 0) param.setValueAtTime(peak, start + attack + hold);
  // Exponential decays read as "natural" for metallic/glass material.
  param.exponentialRampToValueAtTime(sustain, start + attack + hold + release * 0.55);
  param.exponentialRampToValueAtTime(MIN_GAIN, start + attack + hold + release);
  param.setValueAtTime(0, start + attack + hold + release + 0.005);
  return start + attack + hold + release + 0.005;
}

/** Simple one-shot pitch curve: start -> end exponentially. */
export function glide(
  param: AudioParam,
  start: number,
  from: number,
  to: number,
  duration: number,
) {
  const safeFrom = Math.max(1, from);
  const safeTo = Math.max(1, to);
  param.setValueAtTime(safeFrom, start);
  param.exponentialRampToValueAtTime(safeTo, start + Math.max(0.01, duration));
}

/** Builds a serial chain of biquad filters. Returns [input, output]. */
export function buildFilterChain(
  ctx: BaseAudioContext,
  filters: FilterOptions | FilterOptions[] | undefined,
  start: number,
  fallbackSweep: number,
  rate: number,
): [AudioNode, AudioNode] | null {
  if (!filters) return null;
  const list = Array.isArray(filters) ? filters : [filters];
  const nodes = list.map((opts) => {
    const node = ctx.createBiquadFilter();
    node.type = opts.type ?? 'lowpass';
    if (opts.q !== undefined) node.Q.value = opts.q;
    if (opts.gain !== undefined) node.gain.value = opts.gain;
    const when = start + (opts.when ?? 0);
    const sweep = opts.f1 !== undefined ? Math.max(0.01, opts.sweepTime ?? fallbackSweep) : 0;
    node.frequency.setValueAtTime(clamp(opts.f * rate, 20, 20000), when);
    if (opts.f1 !== undefined) {
      node.frequency.exponentialRampToValueAtTime(
        clamp(opts.f1 * rate, 20, 20000),
        when + sweep,
      );
    }
    return node;
  });
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return [nodes[0], nodes[nodes.length - 1]];
}

/** Cheap stereo panner helper with a graceful mono fallback. */
export function createPanner(ctx: BaseAudioContext, pan: number): AudioNode {
  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    return panner;
  }
  const panner = ctx.createPanner();
  panner.panningModel = 'equalpower';
  panner.setPosition(clamp(pan, -1, 1), 0, 1 - Math.abs(pan));
  return panner;
}

/**
 * Soft saturation curve. Used extremely gently on the master bus so stacked
 * layers never clip; at these drive levels it adds glue, not distortion.
 */
export function softClipCurve(amount = 1.4, length = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const x = (i / (length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}
