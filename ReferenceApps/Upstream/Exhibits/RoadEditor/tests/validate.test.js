import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProject, summarize} from '../src/validate.js';
import {sampleRoad} from '../src/spline.js';
import {newProject, defaultRoad} from '../src/io.js';

const road = (pts, over = {}) => defaultRoad('r1', 1, {points: pts, ...over});

test('gentle straight road validates clean', () => {
  const p = newProject('t');
  p.roads = [road([{x: 0, z: 0, y: 0}, {x: 100, z: 0, y: 2}])];
  assert.deepEqual(validateProject(p), []);
  const s = summarize(p, new Map([['r1', sampleRoad(p.roads[0].points, {step: 1})]]));
  assert.ok(Math.abs(s.length - 100) < 0.5);
  assert.equal(s.roads, 1);
});

test('hairpin corner raises a tight-curve error', () => {
  const p = newProject('t');
  p.roads = [road([{x: 0, z: 0, y: 0}, {x: 30, z: 0, y: 0}, {x: 30, z: 2, y: 0}])];
  const issues = validateProject(p);
  const tc = issues.find((i) => i.code === 'tight-curve');
  assert.ok(tc && tc.severity === 'error', JSON.stringify(issues));
  assert.ok(tc.x != null && tc.z != null);
});

test('ramp over 12% raises a steep-grade error, 9% a warning', () => {
  const steep = newProject('t');
  steep.roads = [road([{x: 0, z: 0, y: 0}, {x: 50, z: 0, y: 10}])];
  const se = validateProject(steep).find((i) => i.code === 'steep-grade');
  assert.ok(se && se.severity === 'error');

  const mild = newProject('t');
  mild.roads = [road([{x: 0, z: 0, y: 0}, {x: 100, z: 0, y: 9}])];
  const sw = validateProject(mild).find((i) => i.code === 'steep-grade');
  assert.ok(sw && sw.severity === 'warn');
});

test('bowtie alignment is caught as self-crossing', () => {
  const p = newProject('t');
  p.roads = [road([
    {x: 0, z: 0, y: 0}, {x: 30, z: 30, y: 0}, {x: 0, z: 30, y: 0}, {x: 30, z: 0, y: 0}
  ])];
  const issues = validateProject(p);
  assert.ok(issues.some((i) => i.code === 'self-crossing'), JSON.stringify(issues.map((i) => i.code)));
});

test('at-grade crossings resolve into intersections; only pinched angles warn', () => {
  const cross = newProject('t');
  cross.roads = [
    defaultRoad('r1', 1, {points: [{x: -20, z: 0, y: 0}, {x: 20, z: 0, y: 0}]}),
    defaultRoad('r2', 2, {points: [{x: 0, z: -20, y: 0}, {x: 0, z: 20, y: 0}]})
  ];
  assert.ok(!validateProject(cross).some((i) => i.code === 'intersection-angle'));

  // ~19° crossing pinches turning paths.
  const acute = newProject('t');
  acute.roads = [
    defaultRoad('r1', 1, {points: [{x: -40, z: 0, y: 0}, {x: 40, z: 0, y: 0}]}),
    defaultRoad('r2', 2, {points: [{x: -40, z: -14, y: 0}, {x: 40, z: 14, y: 0}]})
  ];
  const w = validateProject(acute).find((i) => i.code === 'intersection-angle');
  assert.ok(w && w.severity === 'warn');

  const touch = newProject('t');
  touch.roads = [
    defaultRoad('r1', 1, {points: [{x: 0, z: 0, y: 0}, {x: 20, z: 0, y: 0}]}),
    defaultRoad('r2', 2, {points: [{x: 20, z: 0, y: 0}, {x: 20, z: 20, y: 0}]})
  ];
  touch.junctions = [{id: 'j1', name: 'J', x: 20, z: 0, y: 0, links: [{road: 'r1', end: 'end'}, {road: 'r2', end: 'start'}]}];
  assert.ok(!validateProject(touch).some((i) => i.code === 'intersection-angle'));
});

test('low overpasses warn on clearance and suggest a bridge span', () => {
  const p = newProject('t');
  p.roads = [
    defaultRoad('r1', 1, {points: [{x: -40, z: 0, y: 0}, {x: 40, z: 0, y: 0}]}),
    defaultRoad('r2', 2, {points: [{x: 0, z: -40, y: 3}, {x: 0, z: 40, y: 3}]})
  ];
  const issues = validateProject(p);
  const c = issues.find((i) => i.code === 'low-clearance');
  assert.ok(c && c.severity === 'warn', JSON.stringify(issues.map((i) => i.code)));
  assert.ok(issues.some((i) => i.code === 'overpass-span'));
});

test('data hygiene: short roads, stacked points, dangling junctions', () => {
  const p = newProject('t');
  p.roads = [road([{x: 0, z: 0, y: 0}])];
  assert.ok(validateProject(p).some((i) => i.code === 'too-few-points'));

  const q = newProject('t');
  q.roads = [road([{x: 0, z: 0, y: 0}, {x: 0.01, z: 0, y: 0}, {x: 50, z: 0, y: 0}])];
  assert.ok(validateProject(q).some((i) => i.code === 'duplicate-point'));

  const j = newProject('t');
  j.roads = [road([{x: 0, z: 0, y: 0}, {x: 50, z: 0, y: 0}])];
  j.junctions = [{id: 'j9', name: 'Lonely', x: 0, z: 0, y: 0, links: [{road: 'r1', end: 'start'}]}];
  const codes = validateProject(j).map((i) => i.code);
  assert.ok(codes.includes('dangling-junction'));
});

test('long-road self-crossing is still reported (scan/topology agree)', () => {
  const p = newProject('t');
  p.roads = [defaultRoad('r1', 1, {points: [
    {x: -551.5, z: -551.5, y: 0}, {x: 550.5, z: 550.5, y: 0},
    {x: -551.5, z: 550.5, y: 0}, {x: 550.5, z: -551.5, y: 0},
  ]})];
  const codes = validateProject(p).map((i) => i.code);
  assert.ok(codes.includes('self-crossing'), `got ${codes.join(',')}`);
});
