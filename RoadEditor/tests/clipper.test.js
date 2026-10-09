import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { unionPolys, offsetPolys, closePolys, triangulate, differencePolys, groupRings, orientPositive } from '../src/geo/clipper.js';
import { areaOf, ringsArea, near } from './helpers.js';

const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

test('union of two overlapping rectangles', () => {
  const u = unionPolys([rect(0, 0, 10, 4), rect(5, -2, 7, 6)]);
  assert.equal(u.length, 1);
  near(areaOf(u[0]), 48, 1e-6, 'union area');
});

test('round-join offset of a 10x4 rectangle by 1 m', () => {
  // 12 x 6 box minus the four corner cuts (1 - pi/4) r^2
  const expected = 72 - 4 * (1 - Math.PI / 4);
  const o = offsetPolys([rect(0, 0, 10, 4)], 1);
  near(ringsArea(o), expected, 0.01, 'offset area');
});

test('closing fills a concave corner with a fillet of area r^2 (1 - pi/4)', () => {
  // L-shape: two rectangles meeting at a reflex corner
  const L = [rect(0, 0, 20, 4), rect(0, 4, 4, 20)];
  const base = ringsArea(unionPolys(L).filter((p) => areaOf(p) > 0));
  const closed = closePolys(L, 3);
  const extra = ringsArea(closed.filter((p) => areaOf(p) > 0)) - base;
  near(extra, 9 * (1 - Math.PI / 4), 0.02, 'fillet area');
});

test('closing leaves convex corners sharp', () => {
  const r = closePolys([rect(0, 0, 10, 10)], 3);
  near(ringsArea(r), 100, 0.01, 'convex area unchanged');
});

test('triangulate covers the polygon area with holes', () => {
  const outer = rect(0, 0, 10, 10);
  const hole = rect(3, 3, 6, 6);
  const t = triangulate(outer, [hole]);
  let a = 0;
  for (const [i, j, k] of t.tris) {
    const p = t.verts[i];
    const q = t.verts[j];
    const r = t.verts[k];
    a += Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1])) / 2;
  }
  near(a, 100 - 9, 1e-6, 'triangulated area');
});

test('difference and grouping produce outer rings with holes', () => {
  const ring = differencePolys([rect(0, 0, 10, 10)], [rect(2, 2, 4, 4)]);
  const groups = groupRings(ring);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].holes.length, 1, 'the inner square must be a hole');
});

test('orientPositive makes clockwise rings counter-clockwise', () => {
  const cw = rect(0, 0, 1, 1).reverse();
  assert.ok(areaOf(orientPositive(cw)) > 0);
  const { polyArea } = { polyArea: (p) => areaOf(p) };
  assert.equal(polyArea(orientPositive(cw)), 1);
});
