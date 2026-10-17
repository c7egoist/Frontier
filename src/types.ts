/**
 * Frontier UI Audio — Types
 * Sleek, cinematic interface sounds inspired by Stark HUD / Iron Man.
 * No samples. No chiptune. Pure procedural synthesis.
 */

export type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'sine-tri';

export interface PlayOptions {
  /** Volume 0..1 (default 0.85) */
  volume?: number;
  /** Pitch multiplier (default 1). 0.5 = octave down, 2 = octave up */
  pitch?: number;
  /** Stereo pan -1..1 */
  pan?: number;
  /** Playback rate variation for humanization (default true) */
  humanize?: boolean;
  /** Force mono, disable reverb send */
  dry?: boolean;
  /** Delay in seconds before playing */
  delay?: number;
  /** Custom velocity for dynamic expression 0..1 */
  velocity?: number;
}

export interface ToneOptions {
  freq: number;
  freqEnd?: number; // glide target
  freqCurve?: 'linear' | 'exponential';
  glideTime?: number;
  waveform?: Waveform;
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  gain?: number;
  detune?: number; // cents
  detuneEnd?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterFreqEnd?: number;
  filterQ?: number;
  pan?: number;
}

export interface FMOptions {
  carrierFreq: number;
  modFreq: number;
  modIndex: number; // modulation depth
  modIndexEnd?: number;
  attack?: number;
  decay?: number;
  gain?: number;
  filterFreq?: number;
}

export interface NoiseOptions {
  type?: 'white' | 'pink' | 'band';
  bandFreq?: number;
  bandQ?: number;
  attack?: number;
  decay?: number;
  gain?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterQ?: number;
  highpass?: number;
}

export interface SoundDefinition {
  /** Human readable description */
  description: string;
  /** Category for grouping */
  category: 'navigation' | 'state' | 'feedback' | 'motion' | 'system' | 'tactile';
  /** Procedural render function */
  render: (ctx: AudioContext, engine: IEngine, opts: Required<PlayOptions>) => void;
}

export interface IEngine {
  context: AudioContext;
  masterGain: GainNode;
  reverbGain: GainNode;
  reverbNode: ConvolverNode;
  compressor: DynamicsCompressorNode;
  getNoiseBuffer(type: 'white' | 'pink'): AudioBuffer;
  playTone(opts: ToneOptions, at?: number): void;
  playFMTone(opts: FMOptions, at?: number): void;
  playNoise(opts: NoiseOptions, at?: number): void;
  playTick(opts: { freq: number; gain?: number; decay?: number; filterFreq?: number; at?: number }): void;
  now(): number;
}

export type SoundName =
  | 'hover'
  | 'hoverSoft'
  | 'focus'
  | 'select'
  | 'click'
  | 'clickSoft'
  | 'tap'
  | 'toggleOn'
  | 'toggleOff'
  | 'activate'
  | 'deactivate'
  | 'open'
  | 'close'
  | 'expand'
  | 'collapse'
  | 'slideIn'
  | 'slideOut'
  | 'swipe'
  | 'success'
  | 'successSoft'
  | 'error'
  | 'errorSoft'
  | 'warning'
  | 'info'
  | 'confirm'
  | 'deny'
  | 'notification'
  | 'alert'
  | 'beacon'
  | 'scan'
  | 'processing'
  | 'typing'
  | 'whooshShort'
  | 'whooshLong'
  | 'powerOn'
  | 'powerOff'
  | 'lock'
  | 'unlock'
  | 'deploy'
  | 'complete'
  | 'charging'
  | 'pulse'
  | 'glitchSoft'
  | 'pop';

export interface FrontierOptions {
  masterVolume?: number;
  reverbAmount?: number; // 0..1
  enabled?: boolean;
  warmup?: boolean;
}
