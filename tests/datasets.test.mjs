import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_BOUNDS,
  createSampleFieldCsv,
  parseCsvDataset,
  parseDatasetFile,
  parseDelimited,
  parseJsonDataset,
} from '../src/core/datasets.js';
import { sampleDataset } from '../src/core/fields.js';

test('delimited parser supports separators and quoted cells', () => {
  const rows = parseDelimited('x;y;"velocity_x"\n0;1;"2.5"\n1;1;"3.5"\n');
  assert.deepEqual(rows[0], ['x', 'y', 'velocity_x']);
  assert.deepEqual(rows[2], ['1', '1', '3.5']);
});

test('CSV parser reconstructs a regular 3D grid', () => {
  const csv = createSampleFieldCsv([4, 3, 4]);
  const dataset = parseCsvDataset(csv, 'fixture.csv');
  assert.deepEqual(dataset.dims, [4, 3, 4]);
  assert.equal(dataset.rows, 48);
  assert.equal(dataset.textureData.length, 48 * 4);
  assert.ok(dataset.maxSpeed > 0);
  assert.ok(dataset.scalarRange[1] > dataset.scalarRange[0]);
  assert.deepEqual(dataset.bounds.min.slice(0, 1), [CANONICAL_BOUNDS.min[0]]);
  const corner = sampleDataset(dataset, [dataset.bounds.min[0], dataset.bounds.min[1], dataset.bounds.min[2]]);
  assert.ok(corner.every(Number.isFinite));
  assert.ok(Math.hypot(corner[0], corner[1], corner[2]) > 0);
});

test('CSV parser rejects incomplete grids', () => {
  const csv = 'x,y,z,u,v,w\n0,0,0,1,0,0\n1,0,0,1,0,0\n0,1,0,1,0,0\n';
  assert.throws(() => parseCsvDataset(csv), /regular|cover/i);
  assert.throws(() => parseCsvDataset('x,y,z,a,b,c\n0,0,0,1,2,3\n'), /u\/v\/w|velocity/i);
});

test('JSON parser accepts channel arrays and scalar data', () => {
  const dims = [2, 2, 2];
  const count = 8;
  const json = JSON.stringify({
    name: 'Dipole fixture',
    dimensions: dims,
    bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    u: Array.from({ length: count }, (_, i) => i * 0.1),
    v: Array.from({ length: count }, () => 0.2),
    w: Array.from({ length: count }, () => -0.3),
    scalar: Array.from({ length: count }, (_, i) => i),
  });
  const dataset = parseDatasetFile(json, 'fixture.json');
  assert.equal(dataset.name, 'Dipole fixture');
  assert.deepEqual(dataset.dims, dims);
  assert.deepEqual(dataset.scalarRange, [0, 7]);
  const sample = sampleDataset(dataset, dataset.bounds.min);
  assert.ok(Math.abs(sample[1] - 0.2) < 1e-6);
  assert.equal(sample[3], 0);
});

test('JSON parser accepts flat RGBA-like vector rows', () => {
  const dims = [2, 1, 2];
  const rows = [
    [1, 0, 0, 10], [0, 1, 0, 11],
    [0, 0, 1, 12], [1, 1, 1, 13],
  ];
  const dataset = parseJsonDataset(JSON.stringify({ dimensions: dims, vectors: rows }), 'rows.json');
  assert.deepEqual(dataset.dims, [2, 1, 2]);
  assert.equal(dataset.bounds.min[1] < dataset.bounds.max[1], true);
  assert.deepEqual(dataset.scalarRange, [10, 13]);
});
