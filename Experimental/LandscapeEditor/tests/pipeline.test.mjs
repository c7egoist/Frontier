// Regression checks for the terrain engine. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStack } from '../src/terrain/pipeline.js';
import { PRESETS } from '../src/terrain/presets.js';
import { createLayer } from '../src/terrain/catalog.js';
import { noiseTables, perlin2 } from '../src/terrain/noise.js';

test('noise is deterministic for a seed', () => {
  const a = noiseTables(42);
  const b = noiseTables(42);
  assert.equal(perlin2(a, 1.3, 2.7), perlin2(b, 1.3, 2.7));
});

for (const preset of PRESETS) {
  test(`preset "${preset.name}" evaluates to finite heights`, () => {
    const r = evaluateStack(structuredClone(preset.layers), { ...preset.settings, resolution: 96 });
    let bad = 0;
    for (const v of r.height) if (!Number.isFinite(v)) bad++;
    assert.equal(bad, 0);
    assert.ok(r.log.every((e) => e.profile.every(Number.isFinite)), 'every layer profile is finite');
  });
}

test('thermal erosion conserves total volume (material only moves downhill)', () => {
  const layers = [createLayer('generator', 'fbm', { freq: 3 }, { height: 800, base: 100 }), createLayer('erosion', 'thermal', { talus: 30, iterations: 20 })];
  const base = evaluateStack([layers[0]], { worldSize: 4000, resolution: 96, maxElevation: 1000, seaLevel: -100, seed: 3 });
  const eroded = evaluateStack(layers, { worldSize: 4000, resolution: 96, maxElevation: 1000, seaLevel: -100, seed: 3 });
  let a = 0;
  let b = 0;
  for (let i = 0; i < base.height.length; i++) { a += base.height[i]; b += eroded.height[i]; }
  assert.ok(Math.abs(a - b) / a < 1e-4, `volume drift ${(a - b) / a}`);
});

test('a fully masked-out layer leaves the terrain unchanged', () => {
  const gen = createLayer('generator', 'ridge', {}, { height: 500, base: 0 });
  const cut = createLayer('modifier', 'smooth', {});
  cut.masks = [{ id: 'm', type: 'noise', enabled: true, invert: false, strength: 0, breakup: 'none', breakupAmount: 0, breakupScale: 4, params: { freq: 3, threshold: 0.5, soft: 0.1 } }];
  const settings = { worldSize: 4000, resolution: 64, maxElevation: 800, seaLevel: -50, seed: 9 };
  const a = evaluateStack([gen], settings);
  const b = evaluateStack([gen, cut], settings);
  for (let i = 0; i < a.height.length; i++) assert.ok(Math.abs(a.height[i] - b.height[i]) < 1e-3);
});
