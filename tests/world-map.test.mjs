import test from 'node:test';
import assert from 'node:assert/strict';
import { addRegion, addShapeLayer, bakeWorld, createWorld, normalizeBounds, paintMask, regionMask } from '../src/world/world-map.js';

test('painted masks remain layer-local and bounds crop the correct map area', () => {
  const w = createWorld(), a = addShapeLayer(w), b = addShapeLayer(w);
  paintMask(a, .25, .5, .75, .5, .12);
  assert.equal(b.mask.some(Boolean), false);
  const r = addRegion(w, a.id, normalizeBounds(.2, .3, .8, .7));
  const crop = regionMask(w, r, 33);
  assert.ok(crop[16 * 33 + 16] > 240);
  assert.equal(crop[0], 0);
  paintMask(a, .5, .5, .5, .5, .05, true);
  assert.equal(regionMask(w, r, 33)[16 * 33 + 16], 0);
});

test('world preview combines baked terrain only within its selected mask and bounds', () => {
  const w = createWorld(), layer = addShapeLayer(w);
  paintMask(layer, .5, .5, .5, .5, .25);
  const r = addRegion(w, layer.id, normalizeBounds(.25, .25, .75, .75));
  r.bake = { size: 2, heights: new Float32Array([40, 40, 40, 40]) };
  const preview = bakeWorld(w, 65);
  assert.ok(preview.heights[32 * 65 + 32] > 39);
  assert.equal(preview.heights[0], 0);
  layer.visible = false;
  assert.equal(bakeWorld(w, 65).heights[32 * 65 + 32], 0);
});

test('terrain height bakes use the captured bedrock and sediment, not a generated substitute', async () => {
  const { bakeTerrainDocument } = await import('../src/app/world-terrain-session.js');
  const terrain = new Float32Array([
    1, 2, 3, 10, 4, 5, 6, 20,
    7, 8, 9, 30, 10, 11, 12, 40,
  ]);
  assert.deepEqual(Array.from(bakeTerrainDocument({ size: 2, terrain }, 2).heights), [6, 15, 24, 33]);
});

test('shape edits mark the stored mask revision stale', () => {
  const world = createWorld(), layer = addShapeLayer(world);
  const revision = layer.revision;
  paintMask(layer, .2, .2, .2, .2, .03);
  assert.ok(layer.revision > revision);
});
