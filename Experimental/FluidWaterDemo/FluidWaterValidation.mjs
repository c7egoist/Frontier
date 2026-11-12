import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OUTLINER_ROWS,
  SCENE_PRESETS,
  DEBUG_VIEWS,
  BOUNDARY_MODES,
  BOAT_MODES,
  OutlinerMetadata,
} from './src/SceneModel.js';
import {
  CreateWaveMirror,
  ResetWaveMirror,
  InjectMirrorImpulse,
  StepWaveMirror,
  CreateBoatState,
  ResetBoatState,
  StepBoatPhysics,
  BuildBoatModelMatrix,
  BuildBoatMesh,
  SampleMirrorWave,
  SampleShoreBedY,
  EstimateShorelineX,
} from './src/BoatPhysics.js';
import * as Shaders from './src/Shaders.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;

function Test(name, fn) {
  fn();
  passed++;
  console.log(`PASS [${passed}]: ${name}`);
}

Test('Outliner contains WaterBody, Boat, Shore, Cameras, and World entities', () => {
  const ids = new Set(OUTLINER_ROWS.map((r) => r.Id));
  assert(ids.has('waterbody'), 'Missing WaterBody');
  assert(ids.has('boat'), 'Missing Boat');
  assert(ids.has('shore'), 'Missing Shore');
  assert(ids.has('atmosphere'), 'Missing Atmosphere');
  assert(ids.has('sun'), 'Missing Sun');
  assert(ids.has('wind'), 'Missing Wind');
  assert(ids.has('seabed'), 'Missing Ocean Basin');
  assert(ids.has('camera'), 'Missing Editor Camera');
  assert(ids.has('post'), 'Missing Post Process');
});

Test('All 3 scene presets build valid WaterBody bounds, Shore bathymetry, and bounded Foam continuum settings', () => {
  assert.equal(SCENE_PRESETS.length, 3);
  for (const preset of SCENE_PRESETS) {
    const val = preset.Build();
    assert(val.waterbody.BoundWidth >= 18 && val.waterbody.BoundLength >= 18);
    assert(val.waterbody.WaterDepth > 1.0);
    assert.equal(val.waterbody.ShowBounds, true);
    assert(val.waterbody.MaxFoamBudget <= 1.2);
    assert(val.boat.HullLength > 2.0 && val.boat.HullBeam > 1.0);
    const metaW = OutlinerMetadata(OUTLINER_ROWS.find((r) => r.Id === 'waterbody'), val);
    assert(metaW.includes('×'), `Unexpected WaterBody metadata: ${metaW}`);
    const metaS = OutlinerMetadata(OUTLINER_ROWS.find((r) => r.Id === 'shore'), val);
    assert(metaS.length > 0);
  }
  const coastal = SCENE_PRESETS[0].Build();
  const deepY = SampleShoreBedY(-20, 0, coastal.waterbody, coastal.shore);
  const dryY = SampleShoreBedY(25, 0, coastal.waterbody, coastal.shore);
  assert(deepY < -3.0 && dryY > 0.2, `Shore slope check failed: deep=${deepY}, dry=${dryY}`);
  const shoreX = EstimateShorelineX(0, coastal.waterbody, coastal.shore);
  assert(shoreX < coastal.waterbody.BoundWidth * 0.5 && shoreX > 0);
  assert.equal(DEBUG_VIEWS.length, 4);
  assert.equal(BOUNDARY_MODES.length, 2);
  assert.equal(BOAT_MODES.length, 4);
});

Test('Sculpted 3D Boat mesh builds valid finite geometry and indexed triangles', () => {
  const mesh = BuildBoatMesh();
  assert(mesh.vertices.length >= 7 * 40, 'Boat mesh too sparse');
  assert(mesh.indices.length >= 60, 'Boat triangles missing');
  assert.equal(mesh.indices.length % 3, 0);
  const vCount = mesh.vertices.length / 7;
  for (let i = 0; i < mesh.vertices.length; i++) {
    assert(Number.isFinite(mesh.vertices[i]), 'Non-finite boat vertex component');
  }
  for (let i = 0; i < mesh.indices.length; i++) {
    assert(mesh.indices[i] < vCount, 'Boat index out of bounds');
  }
});

Test('Coupled 6-DOF Boat + 2.5D Wave Mirror converges without NaNs and creates Kelvin wake', () => {
  const val = SCENE_PRESETS[0].Build();
  const mirror = CreateWaveMirror(48);
  const boat = CreateBoatState();
  const keys = new Set();

  let maxWakeH = 0;
  for (let step = 0; step < 180; step++) {
    const t = step * (1 / 60);
    StepWaveMirror(mirror, 1 / 60, t, val.waterbody, val.wind, boat, val.boat, true, val.shore);
    StepBoatPhysics(boat, 1 / 60, t, mirror, val.waterbody, val.wind, val.boat, keys, val.shore);
    for (let i = 0; i < mirror.h.length; i++) {
      maxWakeH = Math.max(maxWakeH, Math.abs(mirror.h[i]));
    }
  }

  assert(Number.isFinite(boat.x) && Number.isFinite(boat.y) && Number.isFinite(boat.z));
  assert(Number.isFinite(boat.pitch) && Number.isFinite(boat.roll));
  assert(boat.speed > 1.5, `Boat failed to cruise under figure8 autopilot: speed=${boat.speed}`);
  assert(Math.abs(boat.x) <= val.waterbody.BoundWidth * 0.5, 'Boat escaped X bounds');
  assert(boat.x < EstimateShorelineX(boat.z, val.waterbody, val.shore), 'Boat grounded past shoreline');
  assert(Math.abs(boat.z) <= val.waterbody.BoundLength * 0.5, 'Boat escaped Z bounds');
  assert(maxWakeH > 0.01, `Expected boat displacement wake > 0.01m, got ${maxWakeH}`);

  const mat = BuildBoatModelMatrix(boat, val.boat);
  assert.equal(mat.length, 16);
  for (let i = 0; i < 16; i++) assert(Number.isFinite(mat[i]));

  InjectMirrorImpulse(mirror, -4, 0, 2.5, 1.8, 0.5, -0.5);
  StepWaveMirror(mirror, 1 / 60, 3.1, val.waterbody, val.wind, boat, val.boat, true, val.shore);
  const hCenter = SampleMirrorWave(mirror, -4, 0, 3.1, val.waterbody, val.wind);
  assert(Number.isFinite(hCenter));

  ResetBoatState(boat, val.waterbody, val.shore);
  ResetWaveMirror(mirror);
  assert.equal(boat.speed, 0);
});

Test('Shaders enforce mass-conserving foam & shore bathymetry with zero canned textures', () => {
  const required = [
    'FULLSCREEN_VERT',
    'VORTICITY_FRAG',
    'SWE_STEP_FRAG',
    'FOAM_STEP_FRAG',
    'FLOW_ADVECTION_FRAG',
    'SKY_VERT',
    'SKY_FRAG',
    'WATER_SURFACE_VERT',
    'WATER_SURFACE_FRAG',
    'WATER_SKIRT_VERT',
    'WATER_SKIRT_FRAG',
    'SEABED_VERT',
    'SEABED_FRAG',
    'BOAT_VERT',
    'BOAT_FRAG',
    'LINE_VERT',
    'LINE_FRAG',
    'POST_FRAG',
  ];
  for (const k of required) {
    assert.equal(typeof Shaders[k], 'string', `Missing shader export ${k}`);
    assert(Shaders[k].includes('#version 300 es'), `${k} missing GLSL ES 3.00 directive`);
  }
  assert(Shaders.WATER_SURFACE_FRAG.includes('voronoiPlateau'), 'Missing Plateau border Voronoi foam');
  assert(Shaders.WATER_SURFACE_FRAG.includes('evalPhysicalCellularFoam'), 'Missing analytical cellular evaluator');
  assert(Shaders.FOAM_STEP_FRAG.includes('uMaxFoamBudget'), 'Missing foam saturation budget');
  assert(Shaders.FOAM_STEP_FRAG.includes('lace  -= transferToThick'), 'Missing mass-conserving convergence transfer');
  assert(!Shaders.FOAM_STEP_FRAG.includes('1.18'), 'Exponential 1.18x amplification factor must be removed');
  assert(Shaders.SEABED_VERT.includes('shoreBedY'), 'Missing 3D shore terrain displacement');
  assert(Shaders.FLOW_ADVECTION_FRAG.includes('uResetA'), 'Missing dual-phase flow advection');
  assert(!Shaders.WATER_SURFACE_FRAG.includes('uFoamBitmap'), 'Must not use foam bitmap texture');
});

Test('Local fonts, CSS tokens, HTML shell, and Serve.py exist on disk', () => {
  for (const rel of [
    'index.html',
    'Editor.css',
    'Serve.py',
    'src/App.js',
    'src/UI.js',
    'src/FluidWaterEngine.js',
    'Fonts/dm-sans-latin-300-normal.woff2',
    'Fonts/dm-sans-latin-400-normal.woff2',
    'Fonts/dm-sans-latin-500-normal.woff2',
  ]) {
    assert(fs.existsSync(path.join(__dirname, rel)), `Missing file: ${rel}`);
  }
  const css = fs.readFileSync(path.join(__dirname, 'Editor.css'), 'utf8');
  assert(css.includes('.outliner-row.selected:before') && css.includes('#ffb454'));
  assert(css.includes('.property-card') && css.includes('.slider-pill'));
});

console.log(`\nALL ${passed}/${passed} FLUID WATER VALIDATION SUITES PASSED`);
