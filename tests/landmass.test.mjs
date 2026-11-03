import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  applyLandmassBrush,
  computeOceanConnectedMask,
  createRandomLandmassParams,
  extractShorelineContours,
  generateLandmass,
  normalizeLandmassParams,
  sampleLandmassHeight,
} from '../src/core/landmass.js';
import {
  LANDMASS_OCEAN_FLUX_FRAG,
  LANDMASS_OCEAN_INIT_FRAG,
  LANDMASS_OCEAN_INTEGRATE_FRAG,
} from '../src/app/landmass-ocean.js';
import { checkGlslScopes } from './glsl-scope-check.mjs';

function landComponents(field) {
  const seen = new Uint8Array(field.heights.length);
  const sizes = [];
  for (let start = 0; start < field.heights.length; start++) {
    if (field.heights[start] < 0 || seen[start]) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop();
      size++;
      const ix = idx % field.size;
      const iz = Math.floor(idx / field.size);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= field.size || nz >= field.size) continue;
        const next = nz * field.size + nx;
        if (!seen[next] && field.heights[next] >= 0) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

test('Landmass generation is deterministic, signed around sea level, and keeps continent borders underwater', () => {
  const a = generateLandmass({ shape: 'continent', gridSize: 128, seed: 4029 });
  const b = generateLandmass({ shape: 'continent', gridSize: 128, seed: 4029 });
  const c = generateLandmass({ shape: 'continent', gridSize: 128, seed: 7714 });

  assert.deepEqual([...a.heights], [...b.heights], 'Same seed must reproduce the same base landmass');
  assert.notDeepEqual([...a.heights], [...c.heights], 'A different seed must make a different landmass');
  assert.ok(a.stats.minHeight < -20, 'Continent generation includes a real underwater seabed');
  assert.ok(a.stats.maxHeight > 80, 'Continent generation includes rough above-sea relief');
  assert.ok(a.stats.landFraction > 0.25 && a.stats.landFraction < 0.65, 'Continent coverage is a substantial single base landmass');
  assert.equal(landComponents(a).length, 1, 'Default continent is one connected landmass');

  let maxBorderHeight = -Infinity;
  for (let i = 0; i < a.size; i++) {
    maxBorderHeight = Math.max(
      maxBorderHeight,
      a.heights[i],
      a.heights[(a.size - 1) * a.size + i],
      a.heights[i * a.size],
      a.heights[i * a.size + a.size - 1]
    );
  }
  assert.ok(maxBorderHeight < 0, 'Continent domain edges remain underwater instead of ending as a square land cut');
});

test('Landmass shape presets cover island, archipelago, peninsula, coastline, and open-world bases', () => {
  for (const shape of ['island', 'archipelago', 'peninsula', 'coast', 'open']) {
    const field = generateLandmass({ shape, gridSize: 112, seed: 4029 });
    assert.ok(field.stats.minHeight < 0 && field.stats.maxHeight > 0, `${shape} has both seabed and land`);
    assert.ok(field.stats.landFraction > 0.08 && field.stats.landFraction < 0.72, `${shape} leaves useful ocean around the land`);
  }
  const archipelago = generateLandmass({ shape: 'archipelago', gridSize: 128, seed: 4029 });
  assert.ok(landComponents(archipelago).length >= 2, 'Archipelago produces separated islands');

  const open = generateLandmass({ shape: 'open', gridSize: 128, seed: 4029 });
  let openBorderLand = 0;
  for (let i = 0; i < open.size; i++) {
    if (open.heights[i] >= 0) openBorderLand++;
    if (open.heights[(open.size - 1) * open.size + i] >= 0) openBorderLand++;
    if (open.heights[i * open.size] >= 0) openBorderLand++;
    if (open.heights[i * open.size + open.size - 1] >= 0) openBorderLand++;
  }
  assert.ok(openBorderLand > 0, 'Open World land may continue to the flat map edges instead of being trapped as an island');

  assert.equal(normalizeLandmassParams({ shape: 'not-a-shape' }).shape, 'continent');
  assert.equal(normalizeLandmassParams({ gridSize: 999 }).gridSize, 512, 'Land+water resolution is capped at the supported 512² grid');
  assert.equal(normalizeLandmassParams({ worldSizeKm: 999999 }).worldSizeKm, 40075, 'Flat world size is capped at full planet scale');
});

test('Random landmass recipes vary the whole base shape while staying inside safe generation ranges', () => {
  const rollsA = [0.05, 0.123, 0.22, 0.41, 0.58, 0.66, 0.74];
  const rollsB = [0.66, 0.987, 0.83, 0.19, 0.31, 0.48, 0.9];
  let aIndex = 0;
  let bIndex = 0;
  const a = createRandomLandmassParams(() => rollsA[aIndex++]);
  const b = createRandomLandmassParams(() => rollsB[bIndex++]);

  assert.equal(a.shape, 'open');
  assert.equal(b.shape, 'archipelago');
  assert.notEqual(a.seed, b.seed, 'Random landmass changes more than a numeric seed');
  assert.notEqual(a.landCoverage, b.landCoverage);
  assert.notEqual(a.coastRoughness, b.coastRoughness);
  assert.notEqual(a.relief, b.relief);
  for (const params of [a, b]) {
    assert.equal(params.gridSize, 256, 'Random bases use the default land+water resolution unless preserved from the studio');
    assert.equal(params.worldSpan, 2400);
    assert.equal(params.worldSizeKm, 40075, 'Random bases default to the full planet-scale flat world');
    assert.ok(params.landCoverage >= 0.28 && params.landCoverage <= 0.68);
    assert.ok(params.coastRoughness >= 0.28 && params.coastRoughness <= 0.92);
    assert.ok(params.relief >= 120 && params.relief <= 365);
    assert.ok(params.roughness >= 0.24 && params.roughness <= 0.88);
    assert.ok(params.oceanDepth >= 42 && params.oceanDepth <= 125);
    const field = generateLandmass({ ...params, gridSize: 96 });
    assert.ok(field.stats.minHeight < 0 && field.stats.maxHeight > 0, `${params.shape} random recipe creates land plus ocean bed`);
  }

  const preserved = createRandomLandmassParams(() => 0.5, { gridSize: 512, worldSizeKm: 100, worldSpan: 2400 });
  assert.equal(preserved.gridSize, 512, 'Random landmass preserves the selected land+water resolution');
  assert.equal(preserved.worldSizeKm, 100, 'Random landmass preserves the selected flat world size');

  const viewportSrc = fs.readFileSync(new URL('../src/app/landmass-viewport.js', import.meta.url), 'utf8');
  assert.ok(viewportSrc.includes('this.params = createRandomLandmassParams();'), 'Opening Landmass Studio starts from a randomized base');
  assert.ok(viewportSrc.includes('createRandomLandmassParams(Math.random, this.params)'), 'Random button preserves world size and resolution');
  assert.ok(viewportSrc.includes('syncGeneratorInputs();'), 'Random recipes are reflected in the visible generator controls');
});

test('Ocean-connected mask admits the sea but does not pre-fill enclosed inland depressions', () => {
  const field = {
    size: 7,
    heights: new Float32Array([
      -5, -5, -5, -5, -5, -5, -5,
      -5, 10, 10, 10, 10, 10, -5,
      -5, 10, -3, -3, -3, 10, -5,
      -5, 10, -3, -3, -3, 10, -5,
      -5, 10, -3, -3, -3, 10, -5,
      -5, 10, 10, 10, 10, 10, -5,
      -5, -5, -5, -5, -5, -5, -5,
    ]),
  };
  const mask = computeOceanConnectedMask(field, 0);
  assert.equal(mask[0], 1, 'Boundary ocean is connected');
  assert.equal(mask[3 * 7 + 3], 0, 'A below-sea inland bowl is not initially treated as ocean');
  assert.ok(LANDMASS_OCEAN_INIT_FRAG.includes('oceanMaskAt(c)'), 'Initial ocean depth respects ocean connectivity');
  assert.ok(LANDMASS_OCEAN_INIT_FRAG.includes('waveEta(cellWorld(c))'), 'Reset seeds the incoming swell instead of a motionless flat ocean');
});

test('Direct landmass sculpting raises terrain but cannot raise the protected square border', () => {
  const field = generateLandmass({ shape: 'continent', gridSize: 96, seed: 4029 });
  const centerBefore = sampleLandmassHeight(field, 0, 0);
  const raised = applyLandmassBrush(field, { x: 0, z: 0, radius: 260, strength: 8, mode: 'raise' });
  assert.ok(raised.changed > 100);
  assert.ok(sampleLandmassHeight(field, 0, 0) > centerBefore + 3, 'Raise brush changes the simple heightfield');

  const borderBefore = field.heights[0];
  applyLandmassBrush(field, { x: -field.worldSpan / 2, z: -field.worldSpan / 2, radius: 320, strength: 9, mode: 'raise' });
  assert.equal(field.heights[0], borderBefore, 'Protected continent corner remains fixed underwater');
});

test('Ocean foam is persistent whitewater from the Terrain Studio-style 2.5D virtual-pipe state, not decorative foam', () => {
  const field = generateLandmass({ shape: 'continent', gridSize: 128, seed: 4029 });
  const contours = extractShorelineContours(field, 0);
  assert.ok(contours.length >= 1 && contours[0].closed, 'A continent shoreline contour is traced from the elevation field');

  for (const token of [
    'float surfC = bedC + depth;',
    'vec4 dh = vec4(surfC - surfR',
    'oldFlux * retain + dh *',
    'volumeAvailable = depth * area / dt',
    'antiOvershoot = max(maxDh, 0.0) * area * 0.5 / dt',
  ]) {
    assert.ok(LANDMASS_OCEAN_FLUX_FRAG.includes(token), `Virtual-pipe flux missing: ${token}`);
  }
  for (const token of [
    'dt * (totalIn - totalOut)',
    'float foamAdvected = texture(uStateTex, backUv).g;',
    'foam *= exp(-dt * foamDecayRate / max(0.25, uSim.w));',
    'float breaker =',
    'float uprush =',
    'float impact =',
    'outState = vec4(depth, foam, velocity.x, velocity.y);',
  ]) {
    assert.ok(LANDMASS_OCEAN_INTEGRATE_FRAG.includes(token), `Persistent foam integration missing: ${token}`);
  }

  for (const [name, src] of Object.entries({
    init: LANDMASS_OCEAN_INIT_FRAG,
    flux: LANDMASS_OCEAN_FLUX_FRAG,
    integrate: LANDMASS_OCEAN_INTEGRATE_FRAG,
  })) {
    assert.deepEqual(checkGlslScopes(src, `landmass-ocean-${name}`), [], `${name} ocean shader has no undeclared identifiers`);
  }

  const viewportSrc = fs.readFileSync(new URL('../src/app/landmass-viewport.js', import.meta.url), 'utf8');
  const coreSrc = fs.readFileSync(new URL('../src/core/landmass.js', import.meta.url), 'utf8');
  const oceanSrc = fs.readFileSync(new URL('../src/app/landmass-ocean.js', import.meta.url), 'utf8');
  assert.ok(viewportSrc.includes('new LandmassOceanSimulation'));
  assert.ok(viewportSrc.includes('_createOceanSimulation()'), 'Ocean simulation can be recreated at a new resolution');
  assert.ok(viewportSrc.includes('this.ocean.dispose()'), 'Resolution changes dispose the previous ocean simulation');
  assert.ok(viewportSrc.includes('this.ocean?.update(delta)'));
  assert.ok(!viewportSrc.includes('buildFoamGeometry'), 'Old shoreline foam strips are no longer the visible foam source');
  assert.ok(!viewportSrc.includes('animateFoamGeometry'), 'Old scripted vertex surf motion is gone');
  assert.ok(!coreSrc.includes('export function buildFoamGeometry'), 'Superseded shoreline-strip foam builder is removed');
  assert.ok(!oceanSrc.includes('THREE.Points'), 'Simulated foam is not particle foam');
  assert.ok(!oceanSrc.includes('valueNoise2'), 'Foam state is not painted from procedural noise');
  assert.ok(oceanSrc.includes('this.foamMesh = new THREE.Mesh'), 'Whitewater remains a displaced surface mesh');
  assert.ok(oceanSrc.includes('reset(warmupSteps = null)'), 'Ocean reset warms up flux, velocity, and foam before presentation');
  assert.ok(oceanSrc.includes('36864 / this.size'), 'Ocean warm-up adapts to land+water resolution');
  assert.ok(oceanSrc.includes('dispose()'), 'Ocean resources can be disposed when resolution changes');
  assert.ok(oceanSrc.includes('sqrt(max(0.2, uSim.z) * max(1.0, uDomain.y)) * k'), 'Swell forcing uses virtual-pipe wave celerity');
});

test('Landmass Studio is wired as a third simple workspace without Terrain Studio simulation panels', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('../src/app/main.js', import.meta.url), 'utf8');
  for (const token of [
    'id="mode-btn-landmass"',
    'Landmass Studio',
    'id="left-landmass-panels"',
    'id="right-landmass-panels"',
    'id="landmass-viewport"',
    'data-lm-shape="open"',
    'Open World',
    'id="lm-world-size"',
    'id="lm-world-resolution"',
    'Land + water resolution',
    'SURF &amp; WHITEWATER FOAM',
    'no erosion, rivers, snow, rocks, vegetation, or other systems',
  ]) {
    assert.ok(html.includes(token), `Landmass HTML missing ${token}`);
  }
  for (const token of [
    "mode === 'landmass'",
    "setStudioMode('landmass')",
    "window.location.hash === '#landmass'",
    'ensureLandmassViewport',
    "getElementById('left-landmass-panels')",
  ]) {
    assert.ok(main.includes(token), `Workspace switching missing ${token}`);
  }
});
