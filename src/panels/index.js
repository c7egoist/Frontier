/* ════════════════════════════════════════════════════════════════════════════════════════════
   BESPOKE PANELS
   Most entities are happy being generated from their schema. A few deserve an instrument instead:
   a moon you can see, a sun you can aim, water you can watch. This registry says which types have
   one, and which of their schema groups the instrument replaces — anything it does not claim is
   still generated underneath it, so no property is ever unreachable.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { moonPanel } from './moon.js';
import { sunPanel } from './sun.js';
import { waterPanel } from './water.js';
import { windPanel } from './wind.js';
import { skyPanel } from './sky.js';
import { starsPanel } from './stars.js';
import { fogPanel } from './fog.js';

export const CUSTOM_PANELS = {
  moon: { build: moonPanel, owns: ['Orbit', 'Appearance'] },
  sun: { build: sunPanel, owns: ['Orbit', 'Disc & light'] },
  water: { build: waterPanel, owns: ['Body', 'Waves', 'Surface'] },
  wind: { build: windPanel, owns: ['Field'] },
  sky: { build: skyPanel, owns: ['Atmosphere', 'Look', 'Rendering'] },
  stars: { build: starsPanel, owns: ['Field', 'Sphere'] },
  fog: { build: fogPanel, owns: ['Volumetrics'] },
};
