import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETTE_GLSL,
  PALETTES,
  SCALAR_CHANNELS,
  colorAt,
  gradientCss,
} from '../src/core/palettes.js';

test('palettes expose seven analysis channels', () => {
  assert.equal(SCALAR_CHANNELS.length, 7);
  assert.equal(Object.keys(PALETTES).length, 7);
  for (const channel of SCALAR_CHANNELS) {
    assert.ok(PALETTES[channel.id], `missing palette for ${channel.id}`);
  }
});

test('CPU color ramps are clamped and generated GLSL is complete', () => {
  assert.deepEqual(colorAt('magnitude', -4), colorAt('magnitude', 0));
  assert.deepEqual(colorAt('magnitude', 4), colorAt('magnitude', 1));
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const color = colorAt('rainfall', t);
    assert.equal(color.length, 3);
    assert.ok(color.every((value) => value >= 0 && value <= 255));
  }
  assert.match(gradientCss('vegetation'), /linear-gradient/);
  assert.match(PALETTE_GLSL, /vec3 paletteColor\(int channel, float t\)/);
  assert.equal((PALETTE_GLSL.match(/vec3 palette/g) || []).length >= 7, true);
});
