import { describe, expect, it } from 'vitest';
// @ts-ignore - pure-JS Web Audio implementation used for offline rendering.
import { OfflineAudioContext as NodeOfflineContext } from 'web-audio-engine';
import { SOUNDS } from '../src/catalog';
import { encodeWav, renderSound } from '../src/core/render';
import type { OfflineContextFactory } from '../src/core/render';
import { getSound } from '../src/catalog';

const factory: OfflineContextFactory = (channels, length, sampleRate) =>
  new NodeOfflineContext(channels, length, sampleRate) as unknown as BaseAudioContext;

function analyse(buffer: AudioBuffer) {
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  let peak = 0;
  let energy = 0;
  let nan = 0;
  for (let i = 0; i < left.length; i++) {
    const l = left[i];
    const r = right[i];
    if (!Number.isFinite(l) || !Number.isFinite(r)) nan++;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    energy += l * l + r * r;
  }
  const rms = Math.sqrt(energy / (left.length * 2));
  return { peak, rms, nan };
}

describe('offline rendering', () => {
  it('renders representative sounds from every category without clipping', async () => {
    const ids = ['click', 'navigate', 'confirm', 'powerOn', 'whoosh', 'sync', 'sonar'];
    for (const id of ids) {
      const def = getSound(id)!;
      const rendered = await renderSound(def, { contextFactory: factory, seed: 42 });
      const { peak, rms, nan } = analyse(rendered.buffer);
      expect(nan, `${id} produced non-finite samples`).toBe(0);
      expect(peak, `${id} clips`).toBeLessThanOrEqual(1);
      expect(peak, `${id} is silent`).toBeGreaterThan(0.01);
      expect(rms, `${id} is too quiet`).toBeGreaterThan(0.0005);
      expect(rendered.duration).toBeGreaterThan(0.05);
      expect(rendered.duration).toBeLessThanOrEqual(def.duration + 0.75);
    }
  });

  it('is deterministic for a fixed seed', async () => {
    const def = getSound('charging')!;
    const a = await renderSound(def, { contextFactory: factory, seed: 1234 });
    const b = await renderSound(def, { contextFactory: factory, seed: 1234 });
    const ca = a.buffer.getChannelData(0);
    const cb = b.buffer.getChannelData(0);
    let maxDelta = 0;
    for (let i = 0; i < ca.length; i++) maxDelta = Math.max(maxDelta, Math.abs(ca[i] - cb[i]));
    expect(maxDelta).toBeLessThan(1e-5);
  });

  it('produces different variation for different seeds', async () => {
    const def = getSound('powerOn')!;
    const a = await renderSound(def, { contextFactory: factory, seed: 1 });
    const b = await renderSound(def, { contextFactory: factory, seed: 2 });
    const ca = a.buffer.getChannelData(0);
    const cb = b.buffer.getChannelData(0);
    let maxDelta = 0;
    for (let i = 0; i < ca.length; i++) maxDelta = Math.max(maxDelta, Math.abs(ca[i] - cb[i]));
    expect(maxDelta).toBeGreaterThan(1e-4);
  });

  it('renders the whole catalog within sane loudness bounds', async () => {
    for (const def of SOUNDS) {
      const { buffer } = await renderSound(def, {
        contextFactory: factory,
        sampleRate: 22050,
        seed: 7,
      });
      const { peak, rms } = analyse(buffer);
      expect(peak, `${def.id} clips`).toBeLessThanOrEqual(0.999);
      expect(peak, `${def.id} is inaudible`).toBeGreaterThan(0.02);
      expect(rms, `${def.id} has no body`).toBeGreaterThan(0.0004);
    }
  });

  it('encodes a valid 16-bit stereo WAV', async () => {
    const def = getSound('click')!;
    const { buffer } = await renderSound(def, { contextFactory: factory });
    const wav = encodeWav(buffer);
    const view = new DataView(wav);
    const text = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(wav, offset, length));

    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(view.getUint32(24, true)).toBe(buffer.sampleRate);
    expect(wav.byteLength).toBe(44 + buffer.length * 2 * 2);
    expect(text(36, 4)).toBe('data');

    // Check a positive sample exists (i.e. it isn't a silent header).
    let found = false;
    for (let i = 44; i < wav.byteLength; i += 2) {
      if (view.getInt16(i, true) !== 0) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('throws a clear error when no offline context exists', async () => {
    const def = getSound('click')!;
    const saved = (globalThis as any).OfflineAudioContext;
    const savedWebkit = (globalThis as any).webkitOfflineAudioContext;
    try {
      delete (globalThis as any).OfflineAudioContext;
      delete (globalThis as any).webkitOfflineAudioContext;
      await expect(renderSound(def)).rejects.toThrow(/OfflineAudioContext/);
    } finally {
      if (saved) (globalThis as any).OfflineAudioContext = saved;
      if (savedWebkit) (globalThis as any).webkitOfflineAudioContext = savedWebkit;
    }
  });
});
