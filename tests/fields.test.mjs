import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DOMAIN_MIN,
  DOMAIN_MAX,
  FIELD_MODES,
  MODE_INDEX,
  curlField,
  defaultOptions,
  divergenceField,
  rainfallValue,
  sampleField,
  sampleFieldScaled,
  scalarSample,
  terrainBase,
  terrainGradient,
  terrainHeight,
  vegetationValue,
} from '../src/core/fields.js';

const options = defaultOptions('wind');

function assertFiniteVector(vector, label) {
  assert.equal(vector.length, 3, `${label} should have three components`);
  for (const value of vector) assert.ok(Number.isFinite(value), `${label} contains ${value}`);
}

test('domain and mode metadata are internally consistent', () => {
  assert.equal(FIELD_MODES.length, 4);
  assert.equal(MODE_INDEX.wind, 0);
  assert.equal(MODE_INDEX.force, 1);
  assert.equal(MODE_INDEX.terrain, 2);
  assert.equal(MODE_INDEX.custom, 3);
  assert.ok(DOMAIN_MIN.every((value, axis) => value < DOMAIN_MAX[axis]));
});

test('terrain height and gradient agree with finite differences', () => {
  for (const [x, z] of [[-8, -4], [0, 0], [6.5, 9.2]]) {
    assert.ok(Number.isFinite(terrainBase(x, z)));
    const gradient = terrainGradient(x, z, 1);
    const e = 0.001;
    const dx = (terrainHeight(x + e, z, 1) - terrainHeight(x - e, z, 1)) / (2 * e);
    const dz = (terrainHeight(x, z + e, 1) - terrainHeight(x, z - e, 1)) / (2 * e);
    assert.ok(Math.abs(gradient[0] - dx) < 0.01, `dx mismatch at ${x},${z}`);
    assert.ok(Math.abs(gradient[1] - dz) < 0.01, `dz mismatch at ${x},${z}`);
  }
});

test('all procedural fields return finite vectors', () => {
  const points = [[-10, 2, -8], [0, 5, 0], [9, 11, 7]];
  for (const mode of ['wind', 'force', 'terrain']) {
    for (const time of [0, 8, 31.7]) {
      const fieldOptions = { ...defaultOptions(mode), time };
      for (const point of points) {
        assertFiniteVector(sampleField(point, fieldOptions), `${mode} at ${time}`);
        assertFiniteVector(sampleFieldScaled(point, { ...fieldOptions, scale: 1.4 }), `${mode} scaled`);
      }
    }
  }
});

test('scalar channels stay normalized across modes', () => {
  for (const mode of ['wind', 'force', 'terrain']) {
    const fieldOptions = defaultOptions(mode);
    for (let channel = 0; channel < 7; channel += 1) {
      const point = [2.5, 4.2, -3.1];
      const raw = sampleField(point, fieldOptions);
      const sample = scalarSample(point, raw, { ...fieldOptions, scalarMode: channel });
      assert.ok(Number.isFinite(sample.raw), `${mode}/${channel} raw is finite`);
      assert.ok(sample.normalized >= 0 && sample.normalized <= 1, `${mode}/${channel} normalized=${sample.normalized}`);
    }
  }
});

test('curl, divergence and terrain response layers remain finite', () => {
  const point = [1.2, 5.5, -2.4];
  for (const mode of ['wind', 'force', 'terrain']) {
    const fieldOptions = { ...defaultOptions(mode), time: 12.5 };
    assertFiniteVector(curlField(point, fieldOptions), `${mode} curl`);
    assert.ok(Number.isFinite(divergenceField(point, fieldOptions)));
    assert.ok(rainfallValue(1.2, -2.4, 12.5, fieldOptions.amplitude) >= 0);
    assert.ok(vegetationValue(1.2, -2.4, 12.5, fieldOptions.amplitude) <= 1);
  }
});
