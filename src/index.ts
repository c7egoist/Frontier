/**
 * Frontier Audio
 * Procedural cinematic interface sound system.
 *
 * @packageDocumentation
 */

export { FrontierAudio, createAudio } from './core/engine';
export type { PlaybackHandle, SequenceStep } from './core/engine';

export {
  SOUNDS,
  SOUND_CATEGORIES,
  SOUND_ALIASES,
  getSound,
  listSounds,
  searchSounds,
  normalizeId,
} from './catalog';
export type { CategoryInfo } from './catalog';
export type { SoundDef } from './core/defs';

export {
  renderSound,
  renderWav,
  encodeWav,
  encodeWavBlob,
  defaultOfflineContextFactory,
} from './core/render';
export type {
  RenderOptions,
  RenderedSound,
  OfflineContextFactory,
} from './core/render';

export { Voice } from './core/voice';
export type { VoiceConfig, VoiceEndpoints } from './core/voice';
export { NOTE, dbToGain } from './core/dsp';

export type {
  AudioEngineOptions,
  BellOptions,
  EngineState,
  FilterOptions,
  NoiseOptions,
  PlayOptions,
  PluckOptions,
  SoundCategory,
  SoundMeta,
  ThumpOptions,
  ToneOptions,
} from './types';
