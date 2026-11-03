import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  animateFoamGeometry,
  applyLandmassBrush,
  buildFoamGeometry,
  extractShorelineContours,
  generateLandmass,
  normalizeLandmassParams,
  sampleLandmassHeight,
} from '../src/core/landmass.js';

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

test('Landmass shape presets cover island, archipelago, peninsula, and coastline bases', () => {
  for (const shape of ['island', 'archipelago', 'peninsula', 'coast']) {
    const field = generateLandmass({ shape, gridSize: 112, seed: 4029 });
    assert.ok(field.stats.minHeight < 0 && field.stats.maxHeight > 0, `${shape} has both seabed and land`);
    assert.ok(field.stats.landFraction > 0.08 && field.stats.landFraction < 0.72, `${shape} leaves useful ocean around the land`);
  }
  const archipelago = generateLandmass({ shape: 'archipelago', gridSize: 128, seed: 4029 });
  assert.ok(landComponents(archipelago).length >= 2, 'Archipelago produces separated islands');
  assert.equal(normalizeLandmassParams({ shape: 'not-a-shape' }).shape, 'continent');
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

test('Shoreline foam is actual animated mesh geometry, not a shader or particle representation', () => {
  const field = generateLandmass({ shape: 'continent', gridSize: 128, seed: 4029 });
  const contours = extractShorelineContours(field, 0);
  assert.ok(contours.length >= 1 && contours[0].closed, 'A continent shoreline contour is traced from the elevation field');

  const foam = buildFoamGeometry(field, { seaLevel: 0, foamWidth: 16, surfEnergy: 0.68 });
  assert.ok(foam.vertexCount > 1000, 'Foam has real shoreline vertices');
  assert.ok(foam.triangleCount > 500, 'Foam has real shoreline triangles');
  assert.equal(foam.positions.length, foam.vertexCount * 3);
  assert.equal(foam.meta.length, foam.vertexCount * 4);
  assert.ok(foam.shorelineLength > field.worldSpan, 'Foam follows a full irregular shoreline');
  for (let i = 0; i < foam.vertexCount; i++) {
    const y = foam.positions[i * 3 + 1];
    assert.ok(y > 0 && y < 0.5, 'Foam geometry sits just above sea level');
  }

  const baseBefore = [...foam.basePositions.slice(0, 12)];
  animateFoamGeometry(foam, 1.35, { speed: 1 });
  assert.deepEqual([...foam.basePositions.slice(0, 12)], baseBefore, 'Animation preserves generated base geometry');
  assert.notDeepEqual(
    [...foam.positions.slice(0, 12)],
    baseBefore,
    'Surf motion moves foam vertices rather than changing a fragment pattern'
  );

  const viewportSrc = fs.readFileSync(new URL('../src/app/landmass-viewport.js', import.meta.url), 'utf8');
  const coreSrc = fs.readFileSync(new URL('../src/core/landmass.js', import.meta.url), 'utf8');
  assert.ok(coreSrc.includes('every visible foam edge is a vertex'), 'Core documents the geometry-foam contract');
  assert.ok(!viewportSrc.includes('ShaderMaterial'), 'Landmass viewport uses no custom foam shader material');
  assert.ok(!viewportSrc.includes('THREE.Points'), 'Landmass viewport uses no foam particles');
  assert.ok(viewportSrc.includes('buildFoamGeometry') && viewportSrc.includes('animateFoamGeometry'));
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
    'FOAM GEOMETRY',
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
