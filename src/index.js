/** Frontier — public API (phase 1: roofs). */
export { buildRoof, faceArea } from './core/build-roof.js';
export { validateRoof, formatValidation } from './core/validate.js';
export { DEFAULT_SPEC, PRESETS, mergeSpec, presetSpec } from './core/spec.js';
export { buildSurface, FORM_TABLE } from './core/surface.js';
export { TILE_CATALOG, TILE_PRESETS, resolveTile, tileStats } from './core/tiles.js';
export { makeProfile, PITCH_TABLE, pitchFromSun } from './core/profile.js';
export { Part, partArea } from './core/geom.js';
export { toOBJ, toJSONReport } from './core/export.js';
