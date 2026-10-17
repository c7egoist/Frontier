import type { SoundMeta } from '../types';
import type { Voice } from './voice';

/**
 * A catalog entry. `create` is a pure graph-building function; it never
 * touches the live context directly, which is what makes offline rendering,
 * waveform previews and WAV export bit-identical to live playback.
 */
export interface SoundDef extends SoundMeta {
  create: (voice: Voice) => void;
  /** Loudness trim in dB, measured with scripts/measure.mjs. */
  level?: number;
  /** Default reverb send 0..1 for this sound. */
  space?: number;
}
