import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyPath, pathLength, dropCusps } from '../src/geo/sketch.js';
import { planSketch } from '../src/model/sketch.js';
import { sampleProject } from '../src/model/project.js';

test('simplifyPath keeps the ends and the real corners only', () => {
  const pts = [[0, 0], [1, 0.01], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2]];
  assert.deepEqual(simplifyPath(pts, 0.2), [[0, 0], [4, 0], [4, 2]]);
  assert.ok(Math.abs(pathLength([[0, 0], [3, 4]]) - 5) < 1e-12);
});

test('a sketch that doubles back over itself leaves no spike, but gentle bends stay', () => {
  assert.deepEqual(simplifyPath([[0, 0], [20, 0], [10, 0.3]], 0.5), [[0, 0], [10, 0.3]]);
  assert.equal(simplifyPath([[0, 0], [20, 0], [40, 15]], 0.5).length, 3);
  assert.deepEqual(dropCusps([[0, 0], [5, 0], [5, 0], [9, 0]]), [[0, 0], [5, 0], [9, 0]]); // duplicate removed, straight point kept
});

test('a sketch snaps its start to a nearby junction and creates the far end', () => {
  const p = sampleProject(); // J1 is at (-60, 0)
  const r = planSketch(p, [[-57, 1], [-30, 20], [10, 80]]);
  assert.equal(r.road.a, 'J1');
  assert.equal(r.newJunctions.length, 1);
  assert.equal(r.road.ctrl.length, 1);
  assert.equal(r.road.ctrl[0].y, null);
});

test('very short sketches and loops back to one junction are refused', () => {
  const p = sampleProject();
  assert.match(planSketch(p, [[0, 0], [2, 0]]).error, /under 6 m/);
  assert.match(planSketch(p, [[-57, 1], [-40, 30], [-57, -1]]).error, /same junction/);
});
