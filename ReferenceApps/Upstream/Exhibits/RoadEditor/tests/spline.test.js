import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleRoad, headingDeg, cleanPoints, segmentsCross} from '../src/spline.js';

test('straight two-point road measures true distance with zero curvature', () => {
  const smp = sampleRoad([{x: 0, z: 0, y: 0}, {x: 30, z: 40, y: 5}], {step: 1});
  assert.equal(smp.length, 50);
  assert.ok(smp.count >= 40 && smp.count <= 60);
  assert.equal(smp.minRadius, Infinity);
  assert.ok(Math.abs(smp.maxGrade - 0.1) < 1e-6);
  assert.ok(smp.samples.every((s) => Number.isFinite(s.x) && Number.isFinite(s.hdg)));
});

test('resample spacing is close to the requested step', () => {
  const smp = sampleRoad([{x: 0, z: 0, y: 0}, {x: 100, z: 0, y: 0}], {step: 2});
  const ds = smp.samples[1].s - smp.samples[0].s;
  assert.ok(Math.abs(ds - 2) < 0.01);
});

test('eight points on a circle recover the circle radius', () => {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push({x: Math.cos(a) * 20, z: Math.sin(a) * 20, y: 0});
  }
  const smp = sampleRoad(pts, {closed: true, step: 1});
  assert.ok(smp.closed);
  assert.ok(Math.abs(smp.length - 2 * Math.PI * 20) < 2 * Math.PI * 20 * 0.06);
  assert.ok(smp.minRadius > 14 && smp.minRadius < 27);
});

test('closed loops wrap tangents without a seam kink', () => {
  const pts = [{x: -10, z: -10, y: 0}, {x: 10, z: -10, y: 0}, {x: 10, z: 10, y: 0}, {x: -10, z: 10, y: 0}];
  const smp = sampleRoad(pts, {closed: true, step: 1});
  const S = smp.samples;
  const first = S[0], last = S[S.length - 1];
  const dot = first.tx * last.tx + first.tz * last.tz;
  assert.ok(dot > 0.9, `seam tangent dot ${dot}`);
});

test('headings are compass-style: north 0, east 90', () => {
  assert.equal(Math.round(headingDeg(0, -1)), 0);
  assert.equal(Math.round(headingDeg(1, 0)), 90);
  assert.equal(Math.round(headingDeg(0, 1)), 180);
  assert.equal(Math.round(headingDeg(-1, 0)), 270);
});

test('duplicate and degenerate input stays finite', () => {
  const smp = sampleRoad([{x: 5, z: 5, y: 1}, {x: 5, z: 5, y: 1}, {x: 5, z: 5, y: 1}, {x: 9, z: 5, y: 1}], {step: 1});
  assert.ok(smp.length > 0);
  assert.ok(smp.samples.every((s) => [s.x, s.z, s.y, s.tx, s.tz].every(Number.isFinite)));
  assert.deepEqual(cleanPoints([{x: 0, z: 0}, {x: 0, z: 0}]).length, 1);
});

test('fewer than two distinct points samples empty', () => {
  assert.equal(sampleRoad([], {}).count, 0);
  assert.equal(sampleRoad([{x: 1, z: 2, y: 3}], {}).count, 0);
});

test('segment crossing detects proper intersections only', () => {
  const hit = segmentsCross({x: 0, z: 0}, {x: 10, z: 10}, {x: 0, z: 10}, {x: 10, z: 0});
  assert.ok(hit && Math.abs(hit.x - 5) < 1e-9 && Math.abs(hit.z - 5) < 1e-9);
  assert.equal(segmentsCross({x: 0, z: 0}, {x: 10, z: 0}, {x: 10, z: 0}, {x: 10, z: 10}), null);
  assert.equal(segmentsCross({x: 0, z: 0}, {x: 10, z: 0}, {x: 0, z: 1}, {x: 10, z: 1}), null);
});
