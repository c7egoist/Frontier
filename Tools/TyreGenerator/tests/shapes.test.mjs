import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitShape, mirrorShape, moveShape, shapeDistance } from '../TyreTopology.js';
const C = 2000;
test('polygon hit: inside, outside, edge tolerance', () => {
  const sq = { kind: 'polygon', pts: [[10, -5], [30, -5], [30, 5], [10, 5]] };
  assert.ok(hitShape(sq, 20, 0, C));
  assert.ok(!hitShape(sq, 50, 0, C));
  assert.ok(hitShape(sq, 31, 0, C, 2));
  assert.ok(!hitShape(sq, 31, 0, C, 0.5));
});
test('periodic: a shape across the u=0/C seam is hit from either side', () => {
  const wrap = { kind: 'polygon', pts: [[1990, -5], [2005, -5], [2005, 5], [1990, 5]] };
  assert.ok(hitShape(wrap, 3, 0, C, 0)); assert.ok(hitShape(wrap, 1995, 0, C, 0));
  const st = { kind: 'stroke', pts: [[1990, 0], [2005, 0]], width: 4 };
  assert.ok(hitShape(st, 3, 0, C, 0.5)); assert.ok(hitShape(st, 1995, 0, C, 0.5));
  const ci = { kind: 'circle', pts: [[0, 0]], r: 3 };
  assert.ok(hitShape(ci, 1999, 0, C, 0.5));
});
test('stroke distance is measured from the centre line minus half the width', () => {
  const st = { kind: 'stroke', pts: [[100, 0], [200, 0]], width: 4 };
  assert.ok(Math.abs(shapeDistance(st, 150, 5, C) - 3) < 1e-9);
  assert.equal(shapeDistance(st, 150, 1, C), 0);
});
test('mirror across the centre line and move keep the periodic range', () => {
  const st = { kind: 'stroke', pts: [[10, 4], [20, 6]], width: 2 };
  assert.deepEqual(mirrorShape(st).pts, [[10, -4], [20, -6]]);
  assert.deepEqual(moveShape(st, -20, 0, C).pts, [[1990, 4], [2000, 6]].map(([u, v]) => [u % C, v]));
});
