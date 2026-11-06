import test from 'node:test';
import assert from 'node:assert/strict';
import { createStroke, layerMaskSDF, rasterizeLayer } from '../src/core/mask2d.js';
import { layerHeight, layerSDF, worldSDF, layerFalloff } from '../src/core/landscape.js';
import { createLandform } from '../src/core/landforms.js';

function makeLayer() {
  return {
    region: { x: -100, y: -100, w: 200, h: 200 },
    regions: [],
    strokes: [],
    requireStrokes: false,
    baseHeight: 10,
    edgeWidth: 20,
    visible: true,
    landforms: [createLandform('fractal', { amplitude: 30 })],
  };
}

test('strokes are resolution independent: mask SDF identical at any sample point', () => {
  const s = createStroke([{ x: 0, y: 0 }, { x: 50, y: 0 }], 10, 'add', 'L');
  assert.ok(layerMaskSDF([s], 25, 0) < 0, 'on the stroke is inside');
  assert.ok(layerMaskSDF([s], 25, 30) > 0, 'far away is outside');
  const a = rasterizeLayer([s], 64, -100, -100, 200 / 64);
  const b = rasterizeLayer([s], 512, -100, -100, 200 / 512);
  assert.equal(a.length, 64 * 64);
  assert.equal(b.length, 512 * 512);
});

test('terrain is flat at sea level outside the region edge (no heels)', () => {
  const l = makeLayer();
  // far outside region: height must be 0
  assert.equal(layerHeight(l, 500, 500), 0);
  // at the smooth edge band height ramps smoothly (monotonic, no cliff)
  const h1 = layerHeight(l, 100 + 5, 0);   // just outside
  const h2 = layerHeight(l, 100 - 20, 0);   // deep inside
  assert.ok(h1 < h2, 'height increases toward the interior');
  assert.ok(h1 >= 0 && h1 <= h2);
});

test('base slab is flat inside the region when no landform relief', () => {
  const l = makeLayer();
  l.landforms = [];
  const h = layerHeight(l, 0, 0);
  assert.ok(Math.abs(h - l.baseHeight) < 1e-6, `flat base at ${h}`);
  // solid below surface, empty above
  assert.ok(layerSDF(l, 0, l.baseHeight - 1, 0) < 0);
  assert.ok(layerSDF(l, 0, l.baseHeight + 5, 0) > 0);
  assert.ok(layerSDF(l, 500, 0, 500) > 0, 'outside region is empty');
});

test('world SDF unions visible layers', () => {
  const a = makeLayer();
  const b = makeLayer();
  b.region = { x: 300, y: 300, w: 100, h: 100 };
  const doc = { layers: [a, b] };
  assert.ok(worldSDF(doc, 0, -20, 0) < 0);
  assert.ok(worldSDF(doc, 350, -20, 350) < 0);
  assert.ok(worldSDF(doc, 250, -20, 250) > 0);
});

test('edge falloff interpolates smoothly across edge width', () => {
  const l = makeLayer();
  const fIn = layerFalloff(l, 0, 0);
  const fEdge = layerFalloff(l, 100, 0); // exactly on boundary
  const fOut = layerFalloff(l, 200, 0);
  assert.equal(fIn, 1);
  assert.ok(fEdge > 0 && fEdge < 1);
  assert.equal(fOut, 0);
});
