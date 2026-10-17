import type { SoundDef } from '../core/defs';
import { LEVEL_TRIMS } from './levels';

/**
 * Catalog entries are defined with loudness measured, not guessed:
 * every `level` value in the catalog is the trim required to bring that sound
 * to the library's reference loudness (see scripts/measure.mjs).
 */
export function define(def: SoundDef): SoundDef {
  if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(def.id)) {
    throw new Error(`Invalid sound id "${def.id}" (use lowerCamelCase).`);
  }
  return {
    variants: 1,
    minInterval: 30,
    level: LEVEL_TRIMS[def.id] ?? 0,
    space: 0.16,
    ...def,
  };
}
