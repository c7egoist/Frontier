import type { PlayOptions } from '../types';
import type { SoundDef } from './defs';
import { createGraph } from './graph';
import { dbToGain } from './dsp';
import { mulberry32 } from './rng';
import { Voice } from './voice';

export type OfflineContextFactory = (
  channels: number,
  length: number,
  sampleRate: number,
) => BaseAudioContext;

export interface RenderOptions {
  sampleRate?: number;
  /** Explicit render length in seconds (defaults to def.duration + tail). */
  duration?: number;
  rate?: number;
  space?: number;
  volume?: number;
  seed?: number;
  /** Provide a constructor in non-browser environments (tests/Node/SSR). */
  contextFactory?: OfflineContextFactory;
}

export interface RenderedSound {
  buffer: AudioBuffer;
  /** Measured audible length in seconds (trailing silence trimmed). */
  duration: number;
  sampleRate: number;
}

/** Resolves the platform's OfflineAudioContext, if one exists. */
export function defaultOfflineContextFactory(): OfflineContextFactory | null {
  const g = globalThis as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };
  const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
  if (!Ctor) return null;
  return (channels, length, sampleRate) => new Ctor(channels, length, sampleRate);
}

function findAudibleEnd(buffer: AudioBuffer, threshold = 5e-4): number {
  let last = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = data.length - 1; i >= 0; i--) {
      if (Math.abs(data[i]) > threshold) {
        if (i > last) last = i;
        break;
      }
    }
  }
  return last / buffer.sampleRate;
}

/**
 * Renders a single catalog sound through the exact same graph used live.
 *
 * This powers waveform previews, WAV export and the audio regression tests.
 */
export async function renderSound(
  def: SoundDef,
  options: RenderOptions = {},
): Promise<RenderedSound> {
  const factory = options.contextFactory ?? defaultOfflineContextFactory();
  if (!factory) throw new Error('OfflineAudioContext is not available in this environment.');

  const sampleRate = options.sampleRate ?? 44100;
  const pad = 0.6;
  const renderSeconds = Math.max(0.25, options.duration ?? (def.duration + pad));
  const frames = Math.ceil(renderSeconds * sampleRate);
  const ctx = factory(2, frames, sampleRate);
  if (!('startRendering' in ctx)) {
    throw new Error('Provided context is not an OfflineAudioContext.');
  }

  const graph = createGraph(ctx, { space: 1 });
  const voice = new Voice({
    ctx,
    // A small offset avoids scheduling exactly at t=0 (some engines dislike it).
    t0: 0.01,
    rng: mulberry32(options.seed ?? 0x5eed),
    dry: graph.dry,
    wet: graph.wet,
    rate: options.rate ?? 1,
    pan: 0,
    space: options.space ?? def.space ?? 0.16,
  });

  voice.out.gain.value = dbToGain(def.level ?? 0) * (options.volume ?? 1);
  def.create(voice);
  voice.finish();

  const buffer = await (ctx as OfflineAudioContext).startRendering();
  const duration = Math.max(
    0.05,
    Math.min(findAudibleEnd(buffer) + 0.08, buffer.duration),
  );
  return { buffer, duration, sampleRate };
}

/* ------------------------------------------------------------------ *
 * WAV export
 * ------------------------------------------------------------------ */

/** Encodes an AudioBuffer as a 16-bit PCM stereo WAV byte buffer. */
export function encodeWav(buffer: AudioBuffer, gain = 1): ArrayBuffer {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) channelData.push(buffer.getChannelData(ch));

  const fadeInFrames = Math.floor(buffer.sampleRate * 0.002);
  const fadeOutFrames = Math.floor(buffer.sampleRate * 0.01);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    let fade = 1;
    if (i < fadeInFrames) fade = i / fadeInFrames;
    const remaining = frames - i;
    if (remaining < fadeOutFrames) fade = Math.min(fade, remaining / fadeOutFrames);
    for (let ch = 0; ch < channels; ch++) {
      const sample = Math.max(-1, Math.min(1, channelData[ch][i] * gain * fade));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return arrayBuffer;
}

/** Encodes an AudioBuffer as a WAV Blob (browser). */
export function encodeWavBlob(buffer: AudioBuffer, gain = 1): Blob {
  return new Blob([encodeWav(buffer, gain)], { type: 'audio/wav' });
}

/** Renders a catalog sound and returns a WAV Blob. */
export async function renderWav(def: SoundDef, options: RenderOptions = {}): Promise<Blob> {
  const { buffer } = await renderSound(def, options);
  return encodeWavBlob(buffer);
}
