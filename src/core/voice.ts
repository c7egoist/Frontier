import type {
  BellOptions,
  FilterOptions,
  NoiseOptions,
  PluckOptions,
  ThumpOptions,
  ToneOptions,
} from '../types';
import {
  MIN_GAIN,
  clamp,
  createPanner,
  glide,
  noiseBuffer,
  scheduleEnvelope,
} from './dsp';
import { rand } from './rng';
import type { Rng } from './rng';

export interface VoiceEndpoints {
  /** Dry bus input. */
  dry: AudioNode;
  /** Reverb send bus input. */
  wet: AudioNode;
}

export interface VoiceConfig {
  ctx: BaseAudioContext;
  t0: number;
  rng: Rng;
  dry: AudioNode;
  wet: AudioNode;
  /** Pitch multiplier applied to every oscillator and filter. */
  rate: number;
  /** Pan offset added to every source. */
  pan: number;
  /** 0..1 reverb send. */
  space: number;
}

type Source = OscillatorNode | AudioBufferSourceNode;

/**
 * A Voice is a tiny graph builder scoped to one playback.
 *
 * Catalog entries compose `tone`, `noise`, `bell`, `thump` and `pluck` calls;
 * the voice keeps track of every node so the engine can tear the whole graph
 * down precisely when the sound (and its tail) is over.
 */
export class Voice {
  readonly cfg: VoiceConfig;
  readonly t0: number;
  readonly rng: Rng;
  readonly rate: number;

  private nodes: AudioNode[] = [];
  private sources: Source[] = [];
  private endTime: number;
  private stopped = false;

  /** Voice output (engine applies the loudness trim here). */
  readonly out: GainNode;
  private readonly panner: AudioNode | null;
  private readonly send: GainNode;

  constructor(cfg: VoiceConfig) {
    this.cfg = cfg;
    this.t0 = cfg.t0;
    this.rng = cfg.rng;
    this.rate = cfg.rate;
    this.endTime = cfg.t0;

    const ctx = cfg.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.nodes.push(this.out);

    this.send = ctx.createGain();
    this.send.gain.value = clamp(cfg.space, 0, 1);
    this.nodes.push(this.send);
    this.out.connect(this.send);
    this.send.connect(cfg.wet);

    if (Math.abs(cfg.pan) > 0.001) {
      this.panner = createPanner(ctx, cfg.pan);
      this.nodes.push(this.panner);
      this.out.connect(this.panner);
      this.panner.connect(cfg.dry);
    } else {
      this.panner = null;
      this.out.connect(cfg.dry);
    }
  }

  /** Absolute end time of the longest scheduled element. */
  get end(): number {
    return this.endTime;
  }

  /** Marks a time as the voice's end (used to schedule cleanup). */
  private mark(t: number) {
    if (Number.isFinite(t) && t > this.endTime) this.endTime = t;
  }

  private track<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  private register<T extends Source>(source: T): T {
    this.sources.push(source);
    this.nodes.push(source);
    return source;
  }

  /** Route a source through optional per-source panning into the voice bus. */
  private route(source: AudioNode, pan?: number): AudioNode {
    if (pan !== undefined && Math.abs(pan) > 0.001) {
      const panner = this.track(createPanner(this.cfg.ctx, clamp(pan + this.cfg.pan, -1, 1)));
      source.connect(panner);
      panner.connect(this.out);
      return panner;
    }
    source.connect(this.out);
    return source;
  }

  /** Builds an optional filter chain; returns its head and tail. */
  private withFilters(
    filters: FilterOptions | FilterOptions[] | undefined,
    start: number,
    sweep: number,
  ): { input: AudioNode; output: AudioNode; nodes: AudioNode[] } | null {
    if (!filters) return null;
    const ctx = this.cfg.ctx;
    const list = Array.isArray(filters) ? filters : [filters];
    const nodes = list.map((opts) => {
      const node = ctx.createBiquadFilter();
      node.type = opts.type ?? 'lowpass';
      if (opts.q !== undefined) node.Q.value = opts.q;
      if (opts.gain !== undefined) node.gain.value = opts.gain;
      const when = start + (opts.when ?? 0);
      const hasSweep = opts.f1 !== undefined;
      const sweepTime = Math.max(0.01, opts.sweepTime ?? sweep);
      node.frequency.setValueAtTime(clamp(opts.f * this.rate, 20, 20000), when);
      if (hasSweep) {
        node.frequency.exponentialRampToValueAtTime(
          clamp(opts.f1! * this.rate, 20, 20000),
          when + sweepTime,
        );
      }
      this.track(node);
      return node;
    });
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return { input: nodes[0], output: nodes[nodes.length - 1], nodes };
  }

  /* ---------------------------------------------------------------- *
   * Musical primitives
   * ---------------------------------------------------------------- */

  /**
   * A flexible oscillator voice.
   *
   * @example
   * v.tone({ freq: 440, type: 'sine', dur: 0.3, gain: 0.1 });
   * v.tone({ freq: 180, glideTo: 720, dur: 0.5, filter: { f: 1200, f1: 4800 } });
   */
  tone(opts: ToneOptions): this {
    if (this.stopped) return this;
    const ctx = this.cfg.ctx;
    const when = this.t0 + (opts.when ?? 0);
    const dur = Math.max(0.01, opts.dur ?? 0.2);
    const attack = opts.attack ?? Math.min(0.006, dur * 0.25);
    const hold = opts.hold ?? (opts.sustain ? dur * opts.sustain : 0);
    const release = opts.release ?? Math.max(0.02, dur - attack - hold);
    const peak = Math.max(MIN_GAIN, opts.gain ?? 0.15);
    const sweep = attack + hold + release;

    const gain = this.track(ctx.createGain());
    const end = scheduleEnvelope(gain.gain, when, { attack, hold, release, peak });
    this.mark(end);

    const osc = this.register(ctx.createOscillator());
    osc.type = opts.type ?? 'sine';
    const freq = Math.max(1, opts.freq * this.rate);
    if (opts.glideTo !== undefined) {
      glide(osc.frequency, when, freq, opts.glideTo * this.rate, opts.glideTime ?? dur);
    } else {
      osc.frequency.setValueAtTime(freq, when);
    }
    if (opts.detune) osc.detune.value = opts.detune;

    if (opts.vibrato) {
      const lfo = this.register(ctx.createOscillator());
      const lfoGain = this.track(ctx.createGain());
      lfo.frequency.value = opts.vibrato.rate;
      lfoGain.gain.value = opts.vibrato.depth;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.detune);
      lfo.start(when);
      lfo.stop(end + 0.02);
    }

    const filterChain = this.withFilters(opts.filter, when, sweep);
    osc.connect(gain);
    if (filterChain) {
      gain.connect(filterChain.input);
      this.route(filterChain.output, opts.pan);
    } else {
      this.route(gain, opts.pan);
    }
    osc.start(when);
    osc.stop(end + 0.02);
    return this;
  }

  /**
   * FM bell — glassy or metallic depending on `ratio`.
   * This is the main source of the "expensive interface" shimmer.
   */
  bell(opts: BellOptions): this {
    if (this.stopped) return this;
    const ctx = this.cfg.ctx;
    const when = this.t0 + (opts.when ?? 0);
    const dur = Math.max(0.05, opts.dur ?? 0.8);
    const attack = opts.attack ?? 0.002;
    const peak = Math.max(MIN_GAIN, opts.gain ?? 0.06);
    const freq = Math.max(20, opts.freq * this.rate);

    const carrier = this.register(ctx.createOscillator());
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, when);

    const modulator = this.register(ctx.createOscillator());
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(freq * (opts.ratio ?? 2), when);

    const modDepth = this.track(ctx.createGain());
    const index = Math.max(1, (opts.index ?? 1) * freq);
    modDepth.gain.setValueAtTime(index, when);
    modDepth.gain.exponentialRampToValueAtTime(index * 0.06, when + dur * 0.6);
    modDepth.gain.exponentialRampToValueAtTime(MIN_GAIN, when + dur);
    modulator.connect(modDepth);
    modDepth.connect(carrier.frequency);

    const gain = this.track(ctx.createGain());
    const end = scheduleEnvelope(gain.gain, when, {
      attack,
      hold: 0,
      release: dur,
      peak,
    });
    this.mark(end);
    carrier.connect(gain);
    this.route(gain, opts.pan);

    carrier.start(when);
    carrier.stop(end + 0.02);
    modulator.start(when);
    modulator.stop(end + 0.02);
    return this;
  }

  /**
   * Filtered noise — the air, hiss and swoosh material.
   * `color: 'pink'` is warmer and works better under tonal layers.
   */
  noise(opts: NoiseOptions = {}): this {
    if (this.stopped) return this;
    const ctx = this.cfg.ctx;
    const when = this.t0 + (opts.when ?? 0);
    const dur = Math.max(0.01, opts.dur ?? 0.2);
    const attack = opts.attack ?? Math.min(0.005, dur * 0.25);
    const hold = opts.hold ?? 0;
    const release = opts.release ?? Math.max(0.015, dur - attack - hold);
    const peak = Math.max(MIN_GAIN, opts.gain ?? 0.05);
    const sweep = attack + hold + release;

    const source = this.register(ctx.createBufferSource());
    source.buffer = noiseBuffer(ctx, opts.color ?? 'white');
    source.loop = true;
    // Random read offset keeps repeated plays from sounding identical.
    const offset = rand(this.rng, 0, Math.max(0.01, source.buffer!.duration - dur - 0.05));

    const gain = this.track(ctx.createGain());
    const end = scheduleEnvelope(gain.gain, when, { attack, hold, release, peak });
    this.mark(end);

    const chain = this.withFilters(opts.filter, when, sweep);
    if (chain) {
      source.connect(chain.input);
      chain.output.connect(gain);
    } else {
      source.connect(gain);
    }
    this.route(gain, opts.pan);
    source.start(when, offset);
    source.stop(end + 0.02);
    return this;
  }

  /** Low sine with a pitch drop — physical weight without EDM boom. */
  thump(opts: ThumpOptions = {}): this {
    if (this.stopped) return this;
    const ctx = this.cfg.ctx;
    const when = this.t0 + (opts.when ?? 0);
    const dur = Math.max(0.05, opts.dur ?? 0.35);
    const freq = Math.max(20, opts.freq ?? 60);
    const peak = Math.max(MIN_GAIN, opts.gain ?? 0.18);
    const drop = opts.drop ?? 2.4;

    const osc = this.register(ctx.createOscillator());
    osc.type = 'sine';
    glide(osc.frequency, when, freq * drop, freq, dur * 0.55);

    const gain = this.track(ctx.createGain());
    const end = scheduleEnvelope(gain.gain, when, {
      attack: 0.004,
      hold: dur * 0.08,
      release: dur * 0.92,
      peak,
    });
    this.mark(end);
    osc.connect(gain);
    this.route(gain, opts.pan);
    osc.start(when);
    osc.stop(end + 0.02);

    // A breath of low noise gives the thump a physical body.
    this.noise({
      dur: dur * 0.7,
      gain: peak * 0.16,
      when: opts.when ?? 0,
      color: 'pink',
      pan: opts.pan,
      filter: { type: 'lowpass', f: 220, f1: 90, q: 0.9 },
    });
    return this;
  }

  /** Smooth plucked harmonic (triangle + closing lowpass). */
  pluck(opts: PluckOptions): this {
    const dur = opts.dur ?? 0.5;
    return this.tone({
      freq: opts.freq,
      type: 'triangle',
      dur,
      gain: opts.gain ?? 0.12,
      attack: 0.004,
      release: dur * 0.95,
      when: opts.when,
      pan: opts.pan,
      filter: {
        type: 'lowpass',
        f: opts.brightness ?? 2600,
        f1: (opts.brightness ?? 2600) * 0.35,
        q: 0.6,
        sweepTime: dur * 0.7,
      },
    });
  }

  /** Convenience: several tones at once with level compensation. */
  chord(freqs: number[], opts: Omit<ToneOptions, 'freq'> = {}): this {
    const gain = (opts.gain ?? 0.12) / Math.sqrt(Math.max(1, freqs.length));
    for (const freq of freqs) this.tone({ ...opts, freq, gain });
    return this;
  }

  /** Convenience: a tiny bright transient used by clicks and locks. */
  transient(opts: { gain?: number; freq?: number; when?: number; pan?: number } = {}): this {
    const gain = opts.gain ?? 0.04;
    return this.noise({
      dur: 0.028,
      gain,
      attack: 0.0006,
      when: opts.when,
      pan: opts.pan,
      filter: { type: 'highpass', f: opts.freq ?? 3200, q: 0.7 },
    });
  }

  /**
   * Smooth energy sweep: noise + tonal core rising together.
   * Used by power/charge/shield sounds.
   */
  sweep(opts: {
    from: number;
    to: number;
    dur?: number;
    gain?: number;
    when?: number;
    filterFrom?: number;
    filterTo?: number;
    pan?: number;
  }): this {
    const dur = opts.dur ?? 0.6;
    this.tone({
      freq: opts.from,
      glideTo: opts.to,
      dur,
      gain: (opts.gain ?? 0.06) * 0.6,
      attack: dur * 0.35,
      release: dur * 0.65,
      when: opts.when,
      pan: opts.pan,
      type: 'sine',
    });
    this.noise({
      dur,
      gain: (opts.gain ?? 0.06) * 0.35,
      attack: dur * 0.45,
      release: dur * 0.55,
      when: opts.when,
      pan: opts.pan,
      color: 'pink',
      filter: {
        type: 'bandpass',
        f: opts.filterFrom ?? 400,
        f1: opts.filterTo ?? 4000,
        q: 0.7,
        sweepTime: dur,
      },
    });
    return this;
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  /** Finalises the voice and returns its tail length in seconds. */
  finish(): number {
    // Always give the tail a floor so cleanup is predictable.
    this.endTime = Math.max(this.endTime, this.t0 + 0.02);
    return this.endTime - this.t0;
  }

  /** Immediately (with a short fade) silences this voice. */
  stop(fade = 0.04): void {
    if (this.stopped) return;
    this.stopped = true;
    const now = this.cfg.ctx.currentTime;
    const t = Math.min(now + Math.max(0.005, fade), this.endTime);
    try {
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(this.out.gain.value, now);
      this.out.gain.linearRampToValueAtTime(0, t);
      for (const source of this.sources) {
        try {
          source.stop(t + 0.01);
        } catch {
          /* already stopped */
        }
      }
    } catch {
      /* context may be closed */
    }
  }

  /** Releases every node. Called by the engine once the tail has elapsed. */
  dispose(): void {
    this.stopped = true;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* noop */
      }
      try {
        source.disconnect();
      } catch {
        /* noop */
      }
    }
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        /* noop */
      }
    }
    this.sources = [];
    this.nodes = [];
  }
}
