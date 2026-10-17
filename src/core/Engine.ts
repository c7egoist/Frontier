/**
 * Frontier Audio Engine
 * Central AudioContext manager + master bus + procedural primitives.
 * Designed for low-latency UI — <10ms scheduling, no sample loading.
 */

import { createWhiteNoiseBuffer, createPinkNoiseBuffer } from './NoiseBuffer.js';
import { createTinyRoomIR } from '../effects/Reverb.js';
import type { IEngine, ToneOptions, FMOptions, NoiseOptions } from '../types.js';

export class AudioEngine implements IEngine {
  context!: AudioContext;
  masterGain!: GainNode;
  reverbGain!: GainNode;
  reverbNode!: ConvolverNode;
  compressor!: DynamicsCompressorNode;

  private whiteBuffer?: AudioBuffer;
  private pinkBuffer?: AudioBuffer;
  private initialized = false;
  private reverbAmount = 0.22;

  get isInitialized() {
    return this.initialized;
  }

  async init(reverbAmount = 0.22): Promise<void> {
    if (this.initialized) return;

    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    this.context = new AudioCtx({ latencyHint: 'interactive' } as any);

    this.reverbAmount = reverbAmount;

    // Master chain: compressor for glue, prevents clipping on layered sounds
    this.compressor = this.context.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 2.5;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.08;

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.9;

    // Reverb bus — tiny sleek room
    this.reverbNode = this.context.createConvolver();
    this.reverbNode.buffer = createTinyRoomIR(this.context);

    this.reverbGain = this.context.createGain();
    this.reverbGain.gain.value = this.reverbAmount;

    // Routing: dry -> compressor -> destination
    //          -> reverb -> reverbGain -> compressor
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.context.destination);

    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.compressor);

    // Pre-generate noise buffers
    this.whiteBuffer = createWhiteNoiseBuffer(this.context, 2);
    this.pinkBuffer = createPinkNoiseBuffer(this.context, 2);

    // Resume if suspended (autoplay policy)
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.initialized = true;
  }

  async ensureRunning(): Promise<void> {
    if (!this.initialized) await this.init(this.reverbAmount);
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
  }

  now(): number {
    return this.context.currentTime;
  }

  getNoiseBuffer(type: 'white' | 'pink'): AudioBuffer {
    if (!this.whiteBuffer || !this.pinkBuffer) {
      // fallback generate synchronously
      this.whiteBuffer = createWhiteNoiseBuffer(this.context, 2);
      this.pinkBuffer = createPinkNoiseBuffer(this.context, 2);
    }
    return type === 'pink' ? this.pinkBuffer : this.whiteBuffer;
  }

  setMasterVolume(v: number): void {
    if (!this.masterGain) return;
    const t = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, v)), t + 0.05);
  }

  setReverbAmount(v: number): void {
    this.reverbAmount = Math.max(0, Math.min(1, v));
    if (!this.reverbGain) return;
    const t = this.context.currentTime;
    this.reverbGain.gain.linearRampToValueAtTime(this.reverbAmount, t + 0.1);
  }

  // ─────────────────────────────────────────────
  // PRIMITIVES — sleek, not chiptune
  // ─────────────────────────────────────────────

  /**
   * Sleek tone — sine/tri with exponential pitch glide, soft filter, ADSR
   * Avoids square wave, avoids harsh overtones.
   */
  playTone(opts: ToneOptions, at?: number): void {
    const ctx = this.context;
    const t0 = at ?? ctx.currentTime;

    const freq = opts.freq;
    const freqEnd = opts.freqEnd ?? freq;
    const glide = opts.glideTime ?? (freqEnd !== freq ? opts.decay ?? 0.2 : 0);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const panNode = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    // Waveform selection — prefer sine/triangle blend for glassy tone
    if (opts.waveform === 'sine-tri') {
      // create custom blended: use sine but add subtle triangle via second osc
      osc.type = 'sine';
    } else {
      osc.type = (opts.waveform as OscillatorType) ?? 'sine';
    }

    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== freq && glide > 0.001) {
      if (opts.freqCurve === 'linear') {
        osc.frequency.linearRampToValueAtTime(freqEnd, t0 + glide);
      } else {
        // exponential for natural feel
        try {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + glide);
        } catch {
          osc.frequency.linearRampToValueAtTime(freqEnd, t0 + glide);
        }
      }
    }

    if (opts.detune !== undefined) {
      osc.detune.setValueAtTime(opts.detune, t0);
      if (opts.detuneEnd !== undefined) {
        osc.detune.linearRampToValueAtTime(opts.detuneEnd, t0 + (opts.decay ?? 0.2));
      }
    }

    // Filter — always present to keep it sleek, not raw
    filter.type = opts.filterType ?? 'lowpass';
    filter.frequency.setValueAtTime(opts.filterFreq ?? 8000, t0);
    if (opts.filterFreqEnd && opts.filterFreqEnd !== opts.filterFreq) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(80, opts.filterFreqEnd),
        t0 + (opts.decay ?? 0.2)
      );
    }
    filter.Q.value = opts.filterQ ?? 0.7;

    // ADSR — very soft attack (no click), exponential decay for premium feel
    const attack = opts.attack ?? 0.006;
    const decay = opts.decay ?? 0.18;
    const sustain = opts.sustain ?? 0;
    const release = opts.release ?? 0.08;
    const peakGain = opts.gain ?? 0.5;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain, t0 + attack);
    if (sustain > 0) {
      gain.gain.linearRampToValueAtTime(peakGain * sustain, t0 + attack + decay);
      gain.gain.setValueAtTime(peakGain * sustain, t0 + attack + decay);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
    } else {
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
    }

    // Optional blended triangle layer for warmth without harshness
    let osc2: OscillatorNode | null = null;
    let gain2: GainNode | null = null;
    if (opts.waveform === 'sine-tri') {
      osc2 = ctx.createOscillator();
      gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 1.005, t0);
      if (freqEnd !== freq) {
        try {
          osc2.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd * 1.005), t0 + glide);
        } catch {
          osc2.frequency.linearRampToValueAtTime(freqEnd * 1.005, t0 + glide);
        }
      }
      gain2.gain.setValueAtTime(0, t0);
      gain2.gain.linearRampToValueAtTime(peakGain * 0.22, t0 + attack);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
      osc2.connect(gain2);
      gain2.connect(filter);
      osc2.start(t0);
      osc2.stop(t0 + attack + decay + release + 0.05);
    }

    // Routing
    osc.connect(filter);
    filter.connect(gain);

    if (panNode && opts.pan !== undefined) {
      panNode.pan.setValueAtTime(opts.pan, t0);
      gain.connect(panNode);
      panNode.connect(this.masterGain);
      // subtle reverb send for sleek tail
      const revSend = ctx.createGain();
      revSend.gain.value = 0.35;
      panNode.connect(revSend);
      revSend.connect(this.reverbNode);
      // cleanup
      setTimeout(() => {
        try { revSend.disconnect(); } catch {}
      }, (attack + decay + release + 1) * 1000);
    } else {
      gain.connect(this.masterGain);
      const revSend = ctx.createGain();
      revSend.gain.value = 0.35;
      gain.connect(revSend);
      revSend.connect(this.reverbNode);
      setTimeout(() => {
        try { revSend.disconnect(); } catch {}
      }, (attack + decay + release + 1) * 1000);
    }

    osc.start(t0);
    osc.stop(t0 + attack + decay + release + 0.1);
  }

  /**
   * FM tone — glassy, bell-like, perfect for Stark HUD confirmations
   * Low modulation index = sleek, high = alien (we keep low)
   */
  playFMTone(opts: FMOptions, at?: number): void {
    const ctx = this.context;
    const t0 = at ?? ctx.currentTime;

    const carrier = ctx.createOscillator();
    const modulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    carrier.type = 'sine';
    modulator.type = 'sine';

    carrier.frequency.setValueAtTime(opts.carrierFreq, t0);
    modulator.frequency.setValueAtTime(opts.modFreq, t0);

    modGain.gain.setValueAtTime(opts.modIndex, t0);
    if (opts.modIndexEnd !== undefined) {
      modGain.gain.exponentialRampToValueAtTime(
        Math.max(0.01, opts.modIndexEnd),
        t0 + (opts.decay ?? 0.3)
      );
    }

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(opts.filterFreq ?? 6000, t0);
    filter.Q.value = 0.8;

    const attack = opts.attack ?? 0.008;
    const decay = opts.decay ?? 0.35;
    const peak = opts.gain ?? 0.5;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    carrier.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    // Reverb send — essential for sleekness
    const revSend = ctx.createGain();
    revSend.gain.value = 0.42;
    gain.connect(revSend);
    revSend.connect(this.reverbNode);

    carrier.start(t0);
    modulator.start(t0);
    carrier.stop(t0 + attack + decay + 0.1);
    modulator.stop(t0 + attack + decay + 0.1);

    setTimeout(() => {
      try { revSend.disconnect(); } catch {}
    }, (attack + decay + 1) * 1000);
  }

  /**
   * Filtered noise — air, whoosh, tactile tick
   * Bandpassed to avoid harsh white noise.
   */
  playNoise(opts: NoiseOptions, at?: number): void {
    const ctx = this.context;
    const t0 = at ?? ctx.currentTime;

    const buffer = this.getNoiseBuffer(opts.type === 'pink' ? 'pink' : 'white');
    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    const filter2 = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    src.playbackRate.value = 1;

    if (opts.type === 'band') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(opts.bandFreq ?? 3500, t0);
      filter.Q.value = opts.bandQ ?? 1.2;
      filter2.type = 'highpass';
      filter2.frequency.setValueAtTime(opts.highpass ?? 800, t0);
    } else {
      filter.type = opts.filterType ?? 'bandpass';
      filter.frequency.setValueAtTime(opts.filterFreq ?? 4000, t0);
      filter.Q.value = opts.filterQ ?? 0.9;
      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime((opts.filterFreq ?? 4000) * 1.8, t0);
    }

    const attack = opts.attack ?? 0.002;
    const decay = opts.decay ?? 0.12;
    const peak = opts.gain ?? 0.3;

    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);

    src.connect(filter);
    filter.connect(filter2);
    filter2.connect(gain);
    gain.connect(this.masterGain);

    // Light reverb for air
    const revSend = ctx.createGain();
    revSend.gain.value = 0.25;
    gain.connect(revSend);
    revSend.connect(this.reverbNode);

    src.start(t0);
    src.stop(t0 + attack + decay + 0.05);

    setTimeout(() => {
      try { revSend.disconnect(); } catch {}
    }, (attack + decay + 1) * 1000);
  }

  /**
   * Ultra-short tick — the foundation of tactile UI
   * Combination of filtered noise + high sine blip
   */
  playTick(opts: { freq: number; gain?: number; decay?: number; filterFreq?: number; at?: number }): void {
    const t0 = opts.at ?? this.context.currentTime;
    // Tonal component — very short glassy tick
    this.playTone(
      {
        freq: opts.freq,
        waveform: 'sine',
        attack: 0.001,
        decay: opts.decay ?? 0.07,
        gain: (opts.gain ?? 0.4) * 0.9,
        filterType: 'highpass',
        filterFreq: 600,
        filterQ: 0.7
      },
      t0
    );
    // Transient air — filtered noise burst 2-4ms
    this.playNoise(
      {
        type: 'band',
        bandFreq: opts.filterFreq ?? 6000,
        bandQ: 1.8,
        attack: 0.0005,
        decay: 0.025,
        gain: (opts.gain ?? 0.4) * 0.22
      },
      t0
    );
  }
}
