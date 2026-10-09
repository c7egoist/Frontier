import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, addNode, addRoad, sampleProject, validateProject, migrateProject, removeNode, moveNode } from '../src/model/project.js';
import { splitRoad, commitAtGrade, createInterchange } from '../src/model/topology.js';
import { buildNetwork } from '../src/geom/network.js';
import { ROAD_DEFAULTS } from '../src/geom/profile.js';

test('roads store every default property', () => {
  const p = createProject('t');
  const a = addNode(p, { x: 0, y: 1, z: 0 });
  const b = addNode(p, { x: 100, y: 1, z: 0 });
  const r = addRoad(p, { from: a.id, to: b.id, lanes: 3 });
  for (const k of Object.keys(ROAD_DEFAULTS)) assert.ok(k in r, `missing ${k}`);
  assert.equal(r.lanes, 3);
  assert.equal(r.laneWidth, ROAD_DEFAULTS.laneWidth);
});

test('removing a node removes its roads and keeps the project valid', () => {
  const p = sampleProject('crossroads');
  const n = p.nodes[0].id;
  const before = p.roads.length;
  removeNode(p, n);
  assert.ok(p.roads.length < before);
  assert.equal(validateProject(p).errors.length, 0);
});

test('splitting a road keeps every interior point and every station order', () => {
  const p = createProject('split');
  const a = addNode(p, { x: -150, y: 1, z: 0 });
  const b = addNode(p, { x: 150, y: 1, z: 0 });
  const r = addRoad(p, { from: a.id, to: b.id, name: 'Long', points: [{ x: -60, y: 1, z: 25 }, { x: 0, y: 1, z: -25 }, { x: 60, y: 1, z: 25 }] });
  const net = buildNetwork(p);
  const rb = net.roads.find((x) => x.id === r.id);
  const mid = addNode(p, { x: 0, y: 1, z: -25, name: 'Split' });
  const ids = splitRoad(p, r.id, [{ s: (rb.s0 + rb.s1) / 2, node: mid.id }], net);
  assert.equal(ids.length, 2);
  const total = ids.reduce((s, id) => s + p.roads.find((x) => x.id === id).points.length, 0);
  assert.equal(total, 3, 'no interior point is lost');
  assert.equal(validateProject(p).errors.length, 0);
});

test('at-grade crossings become junctions on commit', () => {
  const p = createProject('grade');
  const a1 = addNode(p, { x: -100, y: 1, z: 0 });
  const a2 = addNode(p, { x: 100, y: 1, z: 0 });
  const b1 = addNode(p, { x: 0, y: 1.5, z: -100 });
  const b2 = addNode(p, { x: 0, y: 1.5, z: 100 });
  addRoad(p, { from: a1.id, to: a2.id, name: 'EW' });
  addRoad(p, { from: b1.id, to: b2.id, name: 'NS' });
  assert.equal(buildNetwork(p).crossings.filter((c) => c.grade === 'at-grade').length, 1);
  assert.equal(commitAtGrade(p), 1);
  const after = buildNetwork(p);
  assert.equal(after.crossings.length, 0);
  assert.equal(p.roads.length, 4);
  assert.equal(validateProject(p).errors.length, 0);
});

test('an interchange has a bridge over the lower road and four ramps', () => {
  const p = createProject('ix');
  p.terrain = { mode: 'rolling', amplitude: 2.4, wavelength: 180, seed: 7, base: 0 };
  const w = addNode(p, { x: -300, y: 1, z: 0 });
  const e = addNode(p, { x: 300, y: 1, z: 0 });
  const n = addNode(p, { x: 0, y: 1, z: -300 });
  const s = addNode(p, { x: 0, y: 1, z: 300 });
  const fw = addRoad(p, { from: w.id, to: e.id, name: 'Freeway', curb: 'none', drainage: { mode: 'ditches' } });
  const lc = addRoad(p, { from: n.id, to: s.id, name: 'Local', curb: 'low', sidewalk: 2 });
  const net = buildNetwork(p);
  const rec = createInterchange(p, net, {
    upper: fw.id,
    lower: lc.id,
    sU: (net.roads.find((r) => r.id === fw.id).s0 + net.roads.find((r) => r.id === fw.id).s1) / 2,
    sL: (net.roads.find((r) => r.id === lc.id).s0 + net.roads.find((r) => r.id === lc.id).s1) / 2,
    name: 'Diamond',
  });
  assert.equal(rec.nodes.length, 4);
  const ramps = rec.roads.filter((id) => /^ramp /i.test(p.roads.find((r) => r.id === id).name));
  assert.equal(ramps.length, 4);
  const built = buildNetwork(p);
  const sep = built.crossings.filter((c) => c.grade === 'separated');
  assert.equal(sep.length, 1, 'the freeway crosses the local road as a grade separation');
  assert.ok(built.bridges.length > 0);
  assert.equal(built.warnings.length, 0, built.warnings.join('; '));
  assert.equal(validateProject(p).errors.length, 0);
});

test('validation reports broken references and migration fills defaults', () => {
  const p = createProject('bad');
  p.nodes.push({ id: 'n1', x: 0, y: 0, z: 0 });
  p.roads.push({ id: 'r1', from: 'n1', to: 'missing', points: [] });
  assert.ok(validateProject(p).errors.some((e) => /missing node/.test(e)));
  const m = migrateProject({ nodes: [{ id: 'a', x: '3', y: 1, z: 2 }], roads: [{ id: 'r', from: 'a', to: 'a', points: [] }] });
  assert.equal(m.nodes[0].x, 3);
  assert.equal(m.nodes[0].radius, 8);
  assert.equal(typeof m.roads[0].lanes, 'number');
  assert.throws(() => migrateProject({ hello: 1 }));
});

test('moving a node updates the geometry it anchors', () => {
  const p = sampleProject('crossroads');
  const c = p.nodes.find((n) => n.name === 'Crossroads');
  moveNode(p, c.id, { x: 10, y: 1, z: 0 });
  assert.equal(p.nodes.find((n) => n.id === c.id).x, 10);
  assert.equal(buildNetwork(p).warnings.filter((w) => /overlap|too short/.test(w)).length, 0);
});
