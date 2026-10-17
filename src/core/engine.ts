import type {
  AudioEngineOptions,
  EngineState,
  PlayOptions,
  SoundCategory,
  SoundMeta,
} from '../types';
import { getSound, listSounds, SOUNDS } from '../catalog';
import type { SoundDef } from './defs';
import { createGraph } from './graph';
import type { AudioGraph } from './graph';
import { clamp, dbToGain } from './dsp';
import { mulberry32 } from './rng';
import type { Rng } from './rng';
import { Voice } from './voice';
import {
  defaultOfflineContextFactory,
  encodeWavBlob,
  renderSound,
} from './render';
import type { RenderedSound, RenderOptions } from './render';

export interface PlaybackHandle {
  readonly id: string;
  /** Tail length in seconds from the moment it was scheduled. */
  readonly duration: number;
  readonly stopped: boolean;
  stop(fadeSeconds?: number): void;
}

export interface SequenceStep {
  id: string;
  /** Extra delay after the previous step, in seconds. */
  gap?: number;
  options?: PlayOptions;
}

interface ActiveVoice {
  voice: Voice;
  handle: PlaybackHandle;
  startedAt: number;
}

interface NormalisedOptions {
  volume: number;
  muted: boolean;
  maxVoices: number;
  autoUnlock: boolean;
  space: number;
  enabled: boolean;
  seed: number;
}

const noop = () => {};

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * FrontierAudio — a procedural UI sound engine.
 *
 * - Zero assets: every sound is synthesised in the Web Audio graph at play
 *   time, so there is nothing to download, decode or cache.
 * - Context-safe: importing or constructing on the server never touches
 *   browser APIs.
 * - Deterministic when you want it: pass a `seed` to `play` or `render`.
 *
 * @example
 * const audio = new FrontierAudio({ volume: 0.7 });
 * button.addEventListener('pointerdown', () => audio.play('click'));
 * await audio.unlock(); // call inside your first user gesture on mobile
 */
export class FrontierAudio {
  private options: NormalisedOptions;
  private ctx: BaseAudioContext | null = null;
  private ownContext = false;
  private unsupported = false;
  private graph: AudioGraph | null = null;
  private lastPlayed = new Map<string, number>();
  private active: ActiveVoice[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private detachUnlock: (() => void) | null = null;
  private warned = new Set<string>();
  private destroyed = false;

  constructor(options: AudioEngineOptions = {}) {
    this.options = {
      volume: clamp(options.volume ?? 0.8, 0, 1),
      muted: options.muted ?? false,
      maxVoices: Math.max(1, Math.floor(options.maxVoices ?? 24)),
      autoUnlock: options.autoUnlock ?? true,
      space: clamp(options.space ?? 1, 0, 1),
      enabled: options.enabled ?? true,
      seed: options.seed ?? randomSeed(),
    };
    if (options.context) {
      this.ctx = options.context;
      this.ownContext = false;
      this.safeBuildGraph();
    }
    if (this.options.autoUnlock) this.installUnlockListeners();
  }

  /* ---------------------------------------------------------------- *
   * Static helpers
   * ---------------------------------------------------------------- */

  /** True when the runtime can create a live AudioContext. */
  static isSupported(): boolean {
    if (typeof globalThis === 'undefined') return false;
    const g = globalThis as unknown as Record<string, unknown>;
    return Boolean(g.AudioContext || g.webkitAudioContext || g.OfflineAudioContext);
  }

  /** Library version, mirrored from package.json at build time. */
  static readonly version = '1.0.0';

  /** Full catalog metadata. */
  static sounds(category?: SoundCategory): SoundMeta[] {
    return listSounds(category);
  }

  /** Resolve an id/alias to metadata, or undefined. */
  static get(id: string): SoundMeta | undefined {
    const def = getSound(id);
    if (!def) return undefined;
    const { create: _create, level: _level, space: _space, ...meta } = def;
    return meta;
  }

  /* ---------------------------------------------------------------- *
   * State
   * ---------------------------------------------------------------- */

  get state(): EngineState {
    if (this.unsupported) return 'unsupported';
    if (!this.ctx) {
      if (typeof globalThis !== 'undefined') {
        const g = globalThis as unknown as Record<string, unknown>;
        if (!g.AudioContext && !g.webkitAudioContext) return 'unsupported';
      }
      return 'uninitialized';
    }
    return this.ctx.state as EngineState;
  }

  get volume(): number {
    return this.options.volume;
  }

  get muted(): boolean {
    return this.options.muted;
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  /** Spectrum tap for visualisers. Created lazily on first call. */
  get analyser(): AnalyserNode | null {
    if (!this.options.enabled) return null;
    this.ensureLiveContext();
    this.safeBuildGraph();
    return this.graph?.analyser ?? null;
  }

  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  /** Every sound id currently shipping. */
  get soundIds(): string[] {
    return SOUNDS.map((s) => s.id);
  }

  /** Number of voices currently alive. */
  get activeVoices(): number {
    return this.active.length;
  }

  /* ---------------------------------------------------------------- *
   * Unlock / lifecycle
   * ---------------------------------------------------------------- */

  /**
   * Resumes the audio context. Call this from a user gesture on iOS/Safari.
   * Safe to call repeatedly; resolves to true when audio is running.
   */
  async unlock(): Promise<boolean> {
    if (this.destroyed) return false;
    if (!this.options.enabled) return false;
    const ctx = this.ensureLiveContext();
    if (!ctx) return false;
    this.safeBuildGraph();
    try {
      const live = ctx as AudioContext;
      if (ctx.state === 'suspended' && typeof live.resume === 'function') {
        await live.resume();
      }
      // Silence kick: some WebKit versions only unlock on a real source.
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      source.stop(ctx.currentTime + 0.001);
    } catch {
      return this.ctx?.state === 'running';
    }
    this.detachUnlockListeners();
    return this.ctx?.state === 'running';
  }

  /** Detaches gesture listeners without changing audio state. */
  detachUnlockListeners(): void {
    if (this.detachUnlock) {
      this.detachUnlock();
      this.detachUnlock = null;
    }
  }

  private installUnlockListeners(): void {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const handler = () => {
      void this.unlock();
    };
    const events = ['pointerdown', 'keydown', 'touchstart'] as const;
    for (const event of events) {
      window.addEventListener(event, handler, { passive: true });
    }
    this.detachUnlock = () => {
      for (const event of events) window.removeEventListener(event, handler);
    };
  }

  /* ---------------------------------------------------------------- *
   * Playback
   * ---------------------------------------------------------------- */

  /**
   * Plays a catalog sound. Returns a handle, or null when the sound is
   * unknown, muted, disabled, throttled or the environment has no audio.
   */
  play(id: string, options: PlayOptions = {}): PlaybackHandle | null {
    if (this.destroyed || !this.options.enabled) return null;

    const def = getSound(id);
    if (!def) {
      if (!this.warned.has(id)) {
        this.warned.add(id);
        console.warn(
          `[frontier-audio] Unknown sound "${id}". Try one of: ${this.soundIds.slice(0, 8).join(', ')}…`,
        );
      }
      return null;
    }

    if (this.options.muted || this.options.volume <= 0) return null;

    // Throttle accidental machine-gunning of the same sound.
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const last = this.lastPlayed.get(def.id) ?? -Infinity;
    if (!options.force && def.minInterval && nowMs - last < def.minInterval) return null;

    const ctx = this.ensureLiveContext();
    if (!ctx) return null;
    this.safeBuildGraph();
    if (!this.graph) return null;

    // Autoplay policies: schedule anyway, the context will catch up on resume.
    const live = ctx as AudioContext;
    if (ctx.state === 'suspended' && typeof live.resume === 'function') {
      void live.resume().catch(noop);
    }

    try {
      const voice = this.createVoice(ctx, def, options);
      const tail = voice.finish();
      const handle = this.makeHandle(def.id, tail, voice);
      const entry: ActiveVoice = { voice, handle, startedAt: nowMs };

      this.active.push(entry);
      this.stealVoices();
      this.lastPlayed.set(def.id, nowMs);
      this.scheduleCleanup(entry, tail);
      return handle;
    } catch (error) {
      console.warn(`[frontier-audio] Failed to synthesise "${def.id}"`, error);
      return null;
    }
  }

  /**
   * Plays a short choreographed sequence. Steps are played with automatic
   * overlap compensation, so a boot sequence sounds intentional rather than
   * like a playlist.
   *
   * @returns the total scheduled duration in seconds.
   */
  sequence(steps: Array<string | SequenceStep>, options: PlayOptions = {}): number {
    let offset = 0;
    let total = 0;
    for (const step of steps) {
      const id = typeof step === 'string' ? step : step.id;
      const gap = typeof step === 'string' ? 0.14 : (step.gap ?? 0.14);
      const stepOptions = typeof step === 'string' ? {} : (step.options ?? {});
      const def = getSound(id);
      const handle = this.play(id, {
        ...options,
        ...stepOptions,
        when: (options.when ?? 0) + offset,
        force: true,
      });
      // `gap` is the delay after this step; long cinematic steps can still
      // overlap intentionally because the next sound is scheduled ahead.
      offset += handle ? gap : Math.max(0.05, def?.duration ?? 0.2);
      total = offset;
    }
    return total;
  }

  /** Stops every active voice with a short fade. */
  stopAll(fade = 0.06): void {
    for (const entry of this.active) entry.handle.stop(fade);
    this.active = [];
  }

  /** Stops the catalogue sound by id. */
  stop(id: string, fade = 0.04): void {
    const def = getSound(id);
    if (!def) return;
    this.active = this.active.filter((entry) => {
      if (entry.handle.id === def.id) {
        entry.handle.stop(fade);
        return false;
      }
      return true;
    });
  }

  /* ---------------------------------------------------------------- *
   * Mixer
   * ---------------------------------------------------------------- */

  setVolume(value: number): void {
    this.options.volume = clamp(value, 0, 1);
    this.options.muted = this.options.volume === 0;
    this.applyVolume();
  }

  mute(): void {
    this.options.muted = true;
    this.applyVolume();
  }

  unmute(): void {
    this.options.muted = false;
    if (this.options.volume === 0) this.options.volume = 0.8;
    this.applyVolume();
  }

  /** Master reverb amount 0..1. */
  setSpace(value: number): void {
    this.options.space = clamp(value, 0, 1);
    if (this.graph && this.ctx) {
      this.graph.wet.gain.setTargetAtTime(this.options.space, this.ctx.currentTime, 0.02);
    }
  }

  /** Hard enable/disable, e.g. tied to a user "interface sounds" setting. */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    if (!enabled) {
      this.stopAll(0.02);
      if (this.graph && this.ctx) {
        this.graph.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
      }
    } else {
      this.ensureLiveContext();
      this.safeBuildGraph();
      this.applyVolume();
    }
  }

  private applyVolume(): void {
    if (!this.graph || !this.ctx) return;
    const target = this.options.muted ? 0 : this.options.volume * 0.9;
    try {
      this.graph.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.015);
    } catch {
      this.graph.master.gain.value = target;
    }
  }

  /* ---------------------------------------------------------------- *
   * Offline rendering / export
   * ---------------------------------------------------------------- */

  /**
   * Renders a sound offline through the identical graph.
   * Useful for waveform previews, docs thumbnails and regression tests.
   */
  async render(id: string, options: RenderOptions = {}): Promise<RenderedSound | null> {
    const def = getSound(id);
    if (!def) return null;
    const merged: RenderOptions = {
      ...options,
      contextFactory: options.contextFactory ?? defaultOfflineContextFactory() ?? undefined,
    };
    return renderSound(def, merged);
  }

  /** Renders a sound and returns a downloadable 16-bit WAV Blob. */
  async exportWav(id: string, options: RenderOptions = {}): Promise<Blob | null> {
    const rendered = await this.render(id, options);
    return rendered ? encodeWavBlob(rendered.buffer) : null;
  }

  /* ---------------------------------------------------------------- *
   * Teardown
   * ---------------------------------------------------------------- */

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachUnlockListeners();
    this.stopAll(0.01);
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.graph?.dispose();
    this.graph = null;
    if (this.ownContext) {
      const ctx = this.ctx as AudioContext | null;
      if (ctx && typeof ctx.close === 'function') void ctx.close().catch(noop);
    }
    this.ctx = null;
    this.lastPlayed.clear();
    this.active = [];
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  private ensureLiveContext(): BaseAudioContext | null {
    if (this.unsupported || !this.options.enabled) return null;
    if (this.ctx) return this.ctx;
    if (typeof globalThis === 'undefined') return null;
    const g = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctor) {
      this.unsupported = true;
      return null;
    }
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.ownContext = true;
    } catch {
      // Older WebKit builds don't accept constructor options.
      try {
        this.ctx = new Ctor();
        this.ownContext = true;
      } catch {
        this.unsupported = true;
        return null;
      }
    }
    return this.ctx;
  }

  private safeBuildGraph(): void {
    if (this.graph || !this.ctx) return;
    try {
      this.graph = createGraph(this.ctx, { space: this.options.space });
      this.applyVolume();
    } catch (error) {
      console.warn('[frontier-audio] Could not build the audio graph', error);
      this.graph = null;
    }
  }

  private createVoice(
    ctx: BaseAudioContext,
    def: SoundDef,
    options: PlayOptions,
  ): Voice {
    const humanize = options.humanize ?? true;
    const seed = options.seed ?? ((this.options.seed + Math.floor(Math.random() * 0xffffff)) >>> 0);
    const rng: Rng = mulberry32(seed);

    // Pitch drift of a few cents keeps repeated UI sounds from sounding stamped.
    const driftCents = humanize ? (rng() * 2 - 1) * 6 : 0;
    const rate = clamp(options.rate ?? 1, 0.25, 4) * 2 ** (driftCents / 1200);
    const panJitter = humanize ? (rng() * 2 - 1) * 0.025 : 0;
    const pan = clamp((options.pan ?? 0) + panJitter, -1, 1);
    const levelJitter = humanize ? (rng() * 2 - 1) * 0.03 : 0;

    const t0 = ctx.currentTime + 0.015 + Math.max(0, options.when ?? 0);
    const voice = new Voice({
      ctx,
      t0,
      rng,
      dry: this.graph!.dry,
      wet: this.graph!.wet,
      rate,
      pan,
      space: clamp(options.space ?? def.space ?? 0.16, 0, 1),
    });

    const gain = dbToGain(def.level ?? 0) * clamp(options.volume ?? 1, 0, 4);
    voice.out.gain.value = Math.max(0, gain * (1 + levelJitter));

    def.create(voice);
    return voice;
  }

  private makeHandle(id: string, duration: number, voice: Voice): PlaybackHandle {
    let stopped = false;
    return {
      id,
      duration,
      get stopped() {
        return stopped;
      },
      stop: (fade = 0.04) => {
        if (stopped) return;
        stopped = true;
        voice.stop(fade);
      },
    };
  }

  private stealVoices(): void {
    while (this.active.length > this.options.maxVoices) {
      const oldest = this.active.shift();
      if (!oldest) break;
      oldest.handle.stop(0.03);
    }
  }

  private scheduleCleanup(entry: ActiveVoice, tail: number): void {
    // Offline contexts don't advance currentTime; rendering handles its own graph.
    if (this.ctx && 'startRendering' in this.ctx) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      entry.voice.dispose();
      const index = this.active.indexOf(entry);
      if (index >= 0) this.active.splice(index, 1);
    }, Math.max(80, (tail + 0.3) * 1000));
    this.timers.add(timer);
  }
}

/** Convenience factory mirroring the class API. */
export function createAudio(options: AudioEngineOptions = {}): FrontierAudio {
  return new FrontierAudio(options);
}
