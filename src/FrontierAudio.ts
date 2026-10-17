/**
 * FrontierAudio — Main API
 * Procedural Iron Man-inspired UI audio library.
 *
 * Usage:
 *   import { frontierAudio } from '@frontier/ui-audio'
 *   await frontierAudio.init()
 *   frontierAudio.play('click')
 *   frontierAudio.play('success', { pitch: 1.1, volume: 0.8 })
 */

import { AudioEngine } from './core/Engine.js';
import { SOUNDS } from './presets/definitions.js';
import type {
  SoundName,
  PlayOptions,
  SoundDefinition,
  FrontierOptions,
  IEngine
} from './types.js';

export class FrontierAudio {
  private engine = new AudioEngine();
  private sounds = new Map<string, SoundDefinition>(Object.entries(SOUNDS));
  private enabled = true;
  private masterVolume = 1;
  private humanizeDefault = true;

  // For custom user sounds
  private customSounds = new Map<string, SoundDefinition>();

  /**
   * Initialize audio engine. Must be called after user gesture for autoplay policy.
   * Safe to call multiple times.
   */
  async init(opts: FrontierOptions = {}): Promise<void> {
    this.enabled = opts.enabled ?? true;
    this.masterVolume = opts.masterVolume ?? 1;
    const reverb = opts.reverbAmount ?? 0.22;

    await this.engine.init(reverb);
    this.engine.setMasterVolume(this.masterVolume);

    if (opts.warmup) {
      // Warmup — play silent tick to fully unlock context on some browsers
      try {
        this.engine.playTone({
          freq: 100,
          waveform: 'sine',
          attack: 0.001,
          decay: 0.001,
          gain: 0.0001
        });
      } catch {}
    }
  }

  /**
   * Ensure context is running (resume if suspended)
   */
  async resume(): Promise<void> {
    await this.engine.ensureRunning();
  }

  /**
   * Play a sound by name.
   * @example frontierAudio.play('click')
   * @example frontierAudio.play('success', { pitch: 1.2, volume: 0.7 })
   */
  play(name: SoundName | string, options: PlayOptions = {}): boolean {
    if (!this.enabled) return false;
    if (!this.engine.isInitialized) {
      console.warn('[FrontierAudio] Engine not initialized. Call init() first (requires user gesture).');
      // Try to init lazily — may fail due to autoplay
      this.engine.init().catch(() => {});
      return false;
    }

    // Ensure running
    if (this.engine.context.state === 'suspended') {
      this.engine.context.resume().catch(() => {});
    }

    const def = this.sounds.get(name) ?? this.customSounds.get(name);
    if (!def) {
      console.warn(`[FrontierAudio] Unknown sound: ${name}`);
      return false;
    }

    const pitchBase = options.pitch ?? 1;
    const humanize = options.humanize ?? this.humanizeDefault;
    const pitch = humanize ? pitchBase * (1 + (Math.random() * 2 - 1) * 0.025) : pitchBase;

    const playOpts: Required<PlayOptions> = {
      volume: (options.volume ?? 0.85) * this.masterVolume,
      pitch,
      pan: options.pan ?? 0,
      humanize,
      dry: options.dry ?? false,
      delay: options.delay ?? 0,
      velocity: options.velocity ?? 1
    };

    try {
      def.render(this.engine.context, this.engine as IEngine, playOpts);
      return true;
    } catch (e) {
      console.error(`[FrontierAudio] Failed to play ${name}`, e);
      return false;
    }
  }

  /**
   * Play multiple sounds in sequence with timing
   */
  playSequence(
    sequence: Array<{ name: SoundName | string; at: number; opts?: PlayOptions }>,
    baseDelay = 0
  ): void {
    for (const item of sequence) {
      this.play(item.name, { ...(item.opts || {}), delay: baseDelay + item.at });
    }
  }

  /**
   * Define a custom sound
   * @example
   * frontierAudio.define('myBlip', {
   *   description: 'Custom',
   *   category: 'tactile',
   *   render: (ctx, engine, opts) => { engine.playTone({freq: 440 * opts.pitch, ...}) }
   * })
   */
  define(name: string, definition: SoundDefinition): void {
    this.customSounds.set(name, definition);
  }

  /**
   * Remove custom sound
   */
  undefine(name: string): boolean {
    return this.customSounds.delete(name);
  }

  /**
   * List all available sounds
   */
  list(): Array<{ name: string; description: string; category: string }> {
    const all = [
      ...Array.from(this.sounds.entries()).map(([name, def]) => ({
        name,
        description: def.description,
        category: def.category
      })),
      ...Array.from(this.customSounds.entries()).map(([name, def]) => ({
        name,
        description: def.description,
        category: def.category
      }))
    ];
    return all;
  }

  /**
   * List by category
   */
  listByCategory() {
    const grouped: Record<string, typeof this.list extends () => infer R ? R : never> = {};
    for (const item of this.list()) {
      if (!grouped[item.category]) grouped[item.category] = [] as any;
      grouped[item.category].push(item);
    }
    return grouped;
  }

  /**
   * Check if sound exists
   */
  has(name: string): boolean {
    return this.sounds.has(name) || this.customSounds.has(name);
  }

  // ── Controls ────────────────────────────────────────────────

  setVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.engine.isInitialized) {
      this.engine.setMasterVolume(this.masterVolume);
    }
  }

  getVolume(): number {
    return this.masterVolume;
  }

  setReverb(amount: number): void {
    if (this.engine.isInitialized) {
      this.engine.setReverbAmount(amount);
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setHumanize(enabled: boolean): void {
    this.humanizeDefault = enabled;
  }

  /**
   * Get raw engine for advanced procedural use
   */
  getEngine(): AudioEngine | null {
    return this.engine.isInitialized ? this.engine : null;
  }

  /**
   * Get AudioContext for custom nodes
   */
  getContext(): AudioContext | null {
    return this.engine.isInitialized ? this.engine.context : null;
  }

  /**
   * Bind UI sounds automatically via data attributes
   * @example <button data-ui-sound="click" data-ui-sound-hover="hover">Click</button>
   */
  bindAutoSounds(root: HTMLElement | Document = document): () => void {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      const el = target.closest('[data-ui-sound]') as HTMLElement | null;
      if (!el) return;

      const type = e.type;

      if (type === 'click') {
        const sound = el.getAttribute('data-ui-sound') || 'click';
        this.play(sound);
      } else if (type === 'mouseenter') {
        const hoverSound = el.getAttribute('data-ui-sound-hover');
        if (hoverSound) this.play(hoverSound);
      } else if (type === 'focusin') {
        const focusSound = el.getAttribute('data-ui-sound-focus') || 'focus';
        if (el.hasAttribute('data-ui-sound-focus') || el.matches('button, a, input, [tabindex]')) {
          // only if explicitly wanted or common focusable
          if (el.hasAttribute('data-ui-sound-focus')) this.play(focusSound);
        }
      }
    };

    const enterHandler = (e: Event) => {
      const target = e.target as HTMLElement;
      const el = target.closest('[data-ui-sound-hover]') as HTMLElement | null;
      if (el) {
        const sound = el.getAttribute('data-ui-sound-hover')!;
        this.play(sound);
      }
    };

    root.addEventListener('click', handler);
    root.addEventListener('mouseenter', enterHandler, true);
    // Note: focusin for focus sounds
    root.addEventListener('focusin', handler);

    // Return unbind
    return () => {
      root.removeEventListener('click', handler);
      root.removeEventListener('mouseenter', enterHandler, true);
      root.removeEventListener('focusin', handler);
    };
  }

  /**
   * Create a themed variant (e.g., higher pitch for compact UI)
   */
  createVariant(basePitch = 1, baseVolume = 1) {
    return {
      play: (name: SoundName | string, opts: PlayOptions = {}) =>
        this.play(name, {
          ...opts,
          pitch: (opts.pitch ?? 1) * basePitch,
          volume: (opts.volume ?? 0.85) * baseVolume
        })
    };
  }
}

// Singleton instance
export const frontierAudio = new FrontierAudio();

// Also export class for multiple instances if needed
export default frontierAudio;
