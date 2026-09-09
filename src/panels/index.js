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
import { folderPanel } from './folder.js';
import { geometryPanel } from './geometry.js';
import { cloudsPanel } from './clouds.js';
import { lightPanel } from './lights.js';
import { advancedLightPanel } from './advancedLights.js';
import { effectsPanel } from './effects.js';
import { cameraPanel } from './cameras.js';
import { terrainPanel } from './terrain.js';
import { assetPanel } from './assets.js';
import { curvePanel } from './curves.js';

export const CUSTOM_PANELS = {
  folder: { build: folderPanel, owns: ['Group'] },
  cube: { build: geometryPanel, owns: ['Transform', 'Surface'] },
  sphere: { build: geometryPanel, owns: ['Transform', 'Surface'] },
  torus: { build: geometryPanel, owns: ['Transform', 'Surface'] },
  cylinder: { build: geometryPanel, owns: ['Transform', 'Surface'] },
  plane: { build: geometryPanel, owns: ['Transform', 'Surface'] },
  pointlight: { build: lightPanel, owns: ['Transform', 'Emission'] },
  spotlight: { build: lightPanel, owns: ['Transform', 'Cone'] },
  ieslight: { build: advancedLightPanel, owns: ['Transform', 'Photometry'] },
  arealight: { build: advancedLightPanel, owns: ['Transform', 'Emitter'] },
  tubelight: { build: advancedLightPanel, owns: ['Transform', 'Emitter'] },
  particles: { build: effectsPanel, owns: ['Emitter', 'Look'] },
  probe: { build: effectsPanel, owns: ['Capture'] },
  audio: { build: effectsPanel, owns: ['Source'] },
  post: { build: effectsPanel, owns: ['Tone', 'Image'] },
  camera: { build: cameraPanel, owns: ['Transform', 'Lens', 'Framing'] },
  cinecamera: { build: cameraPanel, owns: ['Transform', 'Cinema Lens'] },
  playercamera: { build: cameraPanel, owns: ['Transform', 'Player Rig'] },
  vehiclecamera: { build: cameraPanel, owns: ['Transform', 'Vehicle Rig'] },
  terrain: { build: terrainPanel, owns: ['Transform', 'Height Field'] },
  asset: { build: assetPanel, owns: ['Transform', 'Asset Source'] },
  curve: { build: curvePanel, owns: ['Transform', 'Curve'] },
  clouds: { build: cloudsPanel, owns: ['Layer', 'Motion & tint'] },
  moon: { build: moonPanel, owns: ['Orbit', 'Appearance'] },
  sun: { build: sunPanel, owns: ['Orbit', 'Disc & light'] },
  water: { build: waterPanel, owns: ['Body', 'Waves', 'Surface'] },
  wind: { build: windPanel, owns: ['Field'] },
  sky: { build: skyPanel, owns: ['Atmosphere', 'Look', 'Rendering'] },
  stars: { build: starsPanel, owns: ['Field', 'Sphere'] },
  fog: { build: fogPanel, owns: ['Volumetrics'] },
};
