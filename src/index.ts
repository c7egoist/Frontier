/**
 * @frontier/ui-audio
 * Procedurally generated, sleek Iron Man-inspired UI sounds.
 *
 * No samples. No chiptune. No alien blips.
 * Pure Web Audio synthesis — glassy, tactile, cinematic.
 *
 * @example
 * import { frontierAudio } from '@frontier/ui-audio'
 * await frontierAudio.init()
 * frontierAudio.play('click')
 */

export { FrontierAudio, frontierAudio } from './FrontierAudio.js';
export { AudioEngine } from './core/Engine.js';
export { SOUNDS } from './presets/definitions.js';
export { THEMES } from './presets/themes.js';
export * from './types.js';
export * from './utils.js';

// Synthesis primitives for custom sound design
export * as primitives from './synthesis/Primitives.js';
export * as effects from './effects/Reverb.js';

// Convenience re-export
export { default } from './FrontierAudio.js';
