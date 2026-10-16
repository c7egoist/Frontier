// Renders drawn shapes through the page's own renderPattern (canvas via @napi-rs/canvas) and checks pixel positions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadGenerator } from './helpers.mjs';
const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document = { createElement: t => { if (t !== 'canvas') throw new Error(t); const c = createCanvas(1, 1); return c; } };
const G = loadGenerator(); const { T, dims, renderPattern } = G;
test('drawn grooves, blocks and circles land at the right tread coordinates', () => {
  G.applyPresetState(0);
  const d = dims(), C = d.circ, H = 384, k = H / (2 * d.acrossHalf);
  const layer = { type: 'shape', tag: 'drawn', depth: 1, shapes: [
    { kind: 'stroke', pts: [[500, -40], [700, -40]], width: 4, depth: 1 },
    { kind: 'polygon', pts: [[1000, 10], [1060, 10], [1060, 40], [1000, 40]], depth: 1 },
    { kind: 'circle', pts: [[1600, 0]], r: 8, depth: 1 },
  ] };
  const map = renderPattern({ name: 'x', type: 'x', layers: [layer] }, d, H, 0, 0, T.treadDepth, true);
  // renderPattern returns the depth grid used by the meshes: 1 = deepest cut, 0 = land
  const px = (u, v) => { const x = Math.round(u * map.W / C), y = Math.round(H / 2 + v * k); return 255 * (1 - map.depth[y * map.W + x]); };
  assert.ok(px(600, -40) < 60, 'stroke centre is dark (deep cut)');
  assert.ok(px(600, 40) > 200, 'land away from the stroke stays light');
  assert.ok(px(1030, 25) < 60, 'block interior is dark');
  assert.ok(px(1100, 25) > 200, 'outside the block is light');
  assert.ok(px(1600, 0) < 60, 'dimple centre is dark');
  assert.ok(px(1600, 20) > 200, 'outside the dimple radius is light');
  // seam: a stroke that crosses u = C must be drawn on both sides of the image
  const seam = { type: 'shape', tag: 'drawn', depth: 1, shapes: [{ kind: 'stroke', pts: [[C - 30, 60], [C + 30, 60]], width: 4, depth: 1 }] };
  const sm = renderPattern({ name: 'y', type: 'y', layers: [seam] }, d, H, 0, 0, T.treadDepth, true);
  const pxs = (u, v) => 255 * (1 - sm.depth[Math.round(H / 2 + v * k) * sm.W + Math.round(u * sm.W / C)]);
  assert.ok(pxs(C - 10, 60) < 60 && pxs(10, 60) < 60, 'seam stroke is visible on both ends of the image');
});
