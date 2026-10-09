import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurve, curveSlice, nearestOnCurve, pchip, stationAt } from '../src/geo/curve.js';
import { near } from './helpers.js';

test('straight curve has its length and exact end stations', () => {
  const c = buildCurve([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }]);
  near(c.length, 100, 1e-9);
  near(c.x[c.n - 1], 100, 1e-9);
  const s = curveSlice(c, 10, 20);
  near(s[0].x, 10, 1e-9);
  near(s[s.length - 1].x, 20, 1e-9);
});

test('curve passes through its nodes and keeps heights at nodes', () => {
  const nodes = [
    { x: 0, y: 0, z: 0 },
    { x: 40, y: null, z: 30 },
    { x: 80, y: 6, z: 0 },
  ];
  const c = buildCurve(nodes);
  const near0 = nearestOnCurve(c, 40, 30);
  assert.ok(near0.d < 0.2, `node 1 off curve by ${near0.d}`);
  near(stationAt(c, 0).y, 0, 1e-9);
  near(stationAt(c, c.length).y, 6, 1e-9);
});

test('elevation is monotone between two heights (no overshoot)', () => {
  const f = pchip([0, 10, 20, 30], [0, 0, 5, 5]);
  let prev = -Infinity;
  for (let x = 0; x <= 30; x += 0.25) {
    const v = f(x);
    assert.ok(v >= prev - 1e-9, `non-monotone at ${x}`);
    assert.ok(v <= 5 + 1e-9 && v >= -1e-9, `overshoot at ${x}: ${v}`);
    prev = v;
  }
});

test('curved road length is longer than the chord and tangents are unit', () => {
  const c = buildCurve([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 + 1 }, { x: 60, y: 0, z: 60 }]);
  assert.ok(c.length > 60);
  for (let k = 0; k < c.n; k += 7) near(Math.hypot(c.tx[k], c.tz[k]), 1, 1e-6);
});

test('zero-length curves are rejected', () => {
  assert.throws(() => buildCurve([{ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }]));
});
