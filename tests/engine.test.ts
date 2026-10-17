import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-ignore - pure-JS Web Audio implementation used for offline rendering.
import { OfflineAudioContext as NodeOfflineContext } from 'web-audio-engine';
import { FrontierAudio, createAudio } from '../src/index';

function offlineContext() {
  return new NodeOfflineContext(2, 44100, 44100) as unknown as BaseAudioContext;
}

const engines: FrontierAudio[] = [];

function make(options: ConstructorParameters<typeof FrontierAudio>[0] = {}) {
  const engine = createAudio({ autoUnlock: false, ...options });
  engines.push(engine);
  return engine;
}

afterEach(() => {
  for (const engine of engines.splice(0)) engine.destroy();
});

describe('engine', () => {
  it('exposes catalog metadata statically', () => {
    expect(FrontierAudio.sounds().length).toBeGreaterThan(60);
    expect(FrontierAudio.get('powerOn')?.name).toBe('Power On');
    expect(FrontierAudio.get('boot')?.id).toBe('powerOn');
    expect(FrontierAudio.get('does-not-exist')).toBeUndefined();
    expect(FrontierAudio.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports unsupported in a bare Node environment without throwing', async () => {
    const engine = make();
    expect(engine.state).toBe('unsupported');
    expect(engine.analyser).toBeNull();
    expect(engine.play('click')).toBeNull();
    expect(await engine.unlock()).toBe(false);
    // Rendering is still possible offline when a factory is provided.
    expect(typeof engine.render).toBe('function');
  });

  it('plays through an injected context and returns a handle', () => {
    const engine = make({ context: offlineContext(), enabled: true });
    const handle = engine.play('click');
    expect(handle).not.toBeNull();
    expect(handle!.id).toBe('click');
    expect(handle!.duration).toBeGreaterThan(0.05);
    expect(handle!.stopped).toBe(false);
    expect(engine.activeVoices).toBe(1);
    handle!.stop();
    expect(handle!.stopped).toBe(true);
  });

  it('throttles repeated playback of the same sound unless forced', () => {
    const engine = make({ context: offlineContext() });
    expect(engine.play('toggleOn')).not.toBeNull();
    expect(engine.play('toggleOn')).toBeNull();
    expect(engine.play('toggleOn', { force: true })).not.toBeNull();
  });

  it('returns null for unknown ids and warns once', () => {
    const engine = make({ context: offlineContext() });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(engine.play('not-a-sound')).toBeNull();
    expect(engine.play('not-a-sound')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('respects mute, volume and the enabled switch', () => {
    const engine = make({ context: offlineContext(), volume: 0.6 });
    engine.mute();
    expect(engine.play('click')).toBeNull();
    engine.unmute();
    expect(engine.play('click')).not.toBeNull();

    engine.setVolume(0);
    expect(engine.play('tap')).toBeNull();
    engine.setEnabled(false);
    expect(engine.enabled).toBe(false);
    expect(engine.play('tap')).toBeNull();
    engine.setEnabled(true);
    engine.setVolume(0.5);
    expect(engine.volume).toBe(0.5);
    expect(engine.play('tap')).not.toBeNull();
  });

  it('stops individual sounds and everything at once', () => {
    const engine = make({ context: offlineContext() });
    const first = engine.play('confirm', { force: true })!;
    engine.play('notify', { force: true });
    expect(engine.activeVoices).toBe(2);
    engine.stop('confirm');
    expect(first.stopped).toBe(true);
    engine.stopAll();
    expect(engine.activeVoices).toBe(0);
  });

  it('choreographs sequences and reports their length', () => {
    const engine = make({ context: offlineContext() });
    const total = engine.sequence([
      { id: 'powerOn', gap: 1 },
      { id: 'pulse', gap: 0.8 },
      { id: 'systemReady', gap: 1.2 },
    ]);
    expect(total).toBeCloseTo(3, 5);
    expect(engine.activeVoices).toBe(3);
  });

  it('clamps volume, space and pitch into safe ranges', () => {
    const engine = make({ context: offlineContext(), volume: 5, space: 10 });
    expect(engine.volume).toBe(1);
    engine.setVolume(-3);
    expect(engine.volume).toBe(0);
    engine.setSpace(-1);
    expect(() => engine.play('click', { rate: 99, pan: 9 })).not.toThrow();
  });

  it('renders and exports WAV through the public API', async () => {
    const engine = make();
    const rendered = await engine.render('complete', {
      contextFactory: (channels, length, rate) =>
        new NodeOfflineContext(channels, length, rate) as unknown as BaseAudioContext,
      sampleRate: 22050,
    });
    expect(rendered).not.toBeNull();
    expect(rendered!.duration).toBeGreaterThan(0.5);

    const blob = await engine.exportWav('complete', {
      contextFactory: (channels, length, rate) =>
        new NodeOfflineContext(channels, length, rate) as unknown as BaseAudioContext,
      sampleRate: 22050,
    });
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe('audio/wav');
    expect(blob!.size).toBeGreaterThan(1000);

    expect(await engine.render('nope')).toBeNull();
  });

  it('destroys cleanly and becomes inert', () => {
    const engine = make({ context: offlineContext() });
    engine.play('click');
    engine.destroy();
    expect(engine.activeVoices).toBe(0);
    expect(engine.play('click')).toBeNull();
    expect(() => engine.destroy()).not.toThrow();
  });

  it('does not create an AudioContext at import time in Node', () => {
    expect((globalThis as any).AudioContext).toBeUndefined();
  });
});
