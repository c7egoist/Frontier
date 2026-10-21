// Topology: crossings, T-touches, merges, overpasses, welds, runs, bridges.
import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject, defaultRoad} from '../src/io.js';
import {sampleRoad} from '../src/spline.js';
import {effectivePoints} from '../src/state.js';
import {buildTopology, sampleAtStation, stationOfPoint} from '../src/topology.js';

const road = (id, pts, over = {}) => defaultRoad(id, 1, {points: pts, ...over});
const P = (x, z, y = 0) => ({x, z, y, w: 1});
const samplesFor = (p) => {
  const m = new Map();
  for (const r of p.roads) m.set(r.id, sampleRoad(effectivePoints(p, r), {closed: r.closed, step: 1.0}));
  return m;
};
const topo = (p, opts) => buildTopology(p, samplesFor(p), opts);

test('X crossing becomes a 4-leg cross with trimmed runs', () => {
  const p = newProject('t');
  p.roads = [
    road('r1', [P(-40, 0), P(40, 0)]),
    road('r2', [P(0, -40), P(0, 40)]),
  ];
  const t = topo(p);
  assert.equal(t.intersections.length, 1);
  const ix = t.intersections[0];
  assert.equal(ix.kind, 'cross');
  assert.equal(ix.legs.length, 4);
  assert.ok(Math.abs(ix.x) < 1 && Math.abs(ix.z) < 1, `center near origin, got ${ix.x},${ix.z}`);
  // Each road split into two runs, none covering the middle.
  for (const id of ['r1', 'r2']) {
    const runs = t.runs.get(id);
    assert.equal(runs.length, 2, `${id} has 2 runs, got ${runs.length}`);
    const mid = 40;
    for (const run of runs) {
      const covers = run[0].s < mid && run[run.length - 1].s > mid;
      assert.ok(!covers, `${id} run avoids the box`);
    }
  }
});

test('endpoint on another road is a tee; shallow arrival is a merge', () => {
  const p = newProject('t');
  p.roads = [
    road('r1', [P(-40, 0), P(40, 0)]),
    road('r2', [P(0, -30), P(0, -5), P(0.4, 0)]), // steep arrival
  ];
  const t = topo(p);
  assert.equal(t.intersections.length, 1);
  assert.equal(t.intersections[0].kind, 'tee');
  assert.equal(t.intersections[0].legs.length, 3);

  const q = newProject('t');
  q.roads = [
    road('r1', [P(-40, 0), P(40, 0)]),
    road('r2', [P(-30, -14), P(-8, -3.5), P(0.3, 0)]), // shallow arrival
  ];
  const t2 = topo(q);
  assert.equal(t2.intersections.length, 1);
  assert.equal(t2.intersections[0].kind, 'merge');
});

test('height-separated crossing is an overpass, not an intersection', () => {
  const p = newProject('t');
  p.roads = [
    road('r1', [P(-40, 0, 0), P(40, 0, 0)]),
    road('r2', [P(0, -40, 6), P(0, 40, 6)]),
  ];
  const t = topo(p);
  assert.equal(t.intersections.length, 0);
  assert.equal(t.overpasses.length, 1);
  const o = t.overpasses[0];
  assert.equal(o.upper, 'r2');
  assert.equal(o.lower, 'r1');
  assert.ok(Math.abs(o.gap - 6) < 0.5, `gap ~6, got ${o.gap}`);
  assert.equal(t.runs.get('r1').length, 1, 'roads render uncut');
  assert.equal(t.runs.get('r2').length, 1);
});

test('straight 2-weld abuts; bent 2-weld is an elbow; 3-weld is a wye', () => {
  const straight = newProject('t');
  straight.roads = [road('r1', [P(-30, 0), P(0, 0)]), road('r2', [P(0, 0), P(30, 0)])];
  straight.junctions = [{id: 'j1', x: 0, z: 0, y: 0,
    links: [{road: 'r1', end: 'end'}, {road: 'r2', end: 'start'}]}];
  assert.equal(topo(straight).intersections.length, 0, 'straight weld abuts');

  const bent = newProject('t');
  bent.roads = [road('r1', [P(-30, 0), P(0, 0)]), road('r2', [P(0, 0), P(0, 30)])];
  bent.junctions = [{id: 'j1', x: 0, z: 0, y: 0,
    links: [{road: 'r1', end: 'end'}, {road: 'r2', end: 'start'}]}];
  const tb = topo(bent);
  assert.equal(tb.intersections.length, 1);
  assert.equal(tb.intersections[0].kind, 'elbow');

  const wye = newProject('t');
  wye.roads = [road('r1', [P(-30, 0), P(0, 0)]), road('r2', [P(0, 0), P(30, 0)]), road('r3', [P(0, 0), P(0, 30)])];
  wye.junctions = [{id: 'j1', x: 0, z: 0, y: 0, links: [
    {road: 'r1', end: 'end'}, {road: 'r2', end: 'start'}, {road: 'r3', end: 'start'}]}];
  const tw = topo(wye);
  assert.equal(tw.intersections.length, 1);
  assert.equal(tw.intersections[0].kind, 'wye');
});

test('nearby crossings merge into one multi group', () => {
  const p = newProject('t');
  p.roads = [
    road('r1', [P(-40, 0), P(40, 0)]),
    road('r2', [P(0, -40), P(0, 40)]),
    road('r3', [P(-40, -40), P(2, 2)]), // ends right at the crossing
  ];
  const t = topo(p);
  assert.equal(t.intersections.length, 1, `fused, got ${t.intersections.length}`);
  assert.equal(t.intersections[0].kind, 'multi');
  assert.ok(t.intersections[0].legs.length >= 5, `legs fused, got ${t.intersections[0].legs.length}`);
});

test('disabled intersections drop out and roads render whole', () => {
  const p = newProject('t');
  p.roads = [road('r1', [P(-40, 0), P(40, 0)]), road('r2', [P(0, -40), P(0, 40)])];
  const t1 = topo(p);
  assert.equal(t1.intersections.length, 1);
  p.intersectionOverrides = {[t1.intersections[0].id]: {enabled: false}};
  const t2 = topo(p);
  assert.equal(t2.intersections.length, 0);
  assert.equal(t2.disabled.length, 1);
  assert.equal(t2.runs.get('r1').length, 1, 'r1 whole again');
});

test('flagged control points become bridge spans in station space', () => {
  const p = newProject('t');
  p.roads = [road('r1', [P(-30, 0), P(-10, 0), P(10, 0), P(30, 0)])];
  p.roads[0].points[1].bridge = true;
  p.roads[0].points[2].bridge = true;
  const t = topo(p);
  assert.equal(t.bridges.length, 1);
  const b = t.bridges[0];
  assert.equal(b.roadId, 'r1');
  assert.ok(b.s1 - b.s0 > 15, `span covers the middle, got ${b.s0}..${b.s1}`);
  // A lone flagged point is not a span.
  p.roads[0].points[2].bridge = false;
  assert.equal(topo(p).bridges.length, 0);
});

test('closed loop crossing keeps two approaches and wrapped cuts', () => {
  const p = newProject('t');
  p.roads = [road('r1', [P(0, -30), P(24, 0), P(0, 30), P(-24, 0)], {closed: true}),
    road('r2', [P(-40, 0), P(40, 0)])];
  const t = topo(p);
  assert.ok(t.intersections.length >= 1, `loop crossing detected, got ${t.intersections.length}`);
  const runs = t.runs.get('r1');
  assert.ok(runs.length >= 1 && runs.every((r) => r.length >= 2), 'loop runs valid');
});

test('station helpers interpolate and invert', () => {
  const p = newProject('t');
  p.roads = [road('r1', [P(0, 0), P(100, 0)])];
  const S = samplesFor(p).get('r1').samples;
  const mid = sampleAtStation(S, 50);
  assert.ok(Math.abs(mid.x - 50) < 1, `mid x ~50, got ${mid.x}`);
  assert.ok(Math.abs(stationOfPoint(S, 75, 0) - 75) < 1.5);
});

test('at-grade self-crossing paves a 4-leg multi; separated self-crossing stays an overpass', () => {
  const bowtie = (dy) => {
    const p = newProject('t');
    p.roads = [road('r1', [P(-40, -40), P(40, 40), P(-40, 40, dy), P(40, -40, dy)])];
    return p;
  };
  const flat = topo(bowtie(0));
  assert.equal(flat.intersections.length, 1);
  assert.equal(flat.intersections[0].legs.length, 4);
  assert.equal(flat.intersections[0].roads.length, 1);
  assert.equal(flat.overpasses.length, 0);
  assert.equal(flat.runs.get('r1').length, 3);

  const stacked = topo(bowtie(5));
  assert.equal(stacked.intersections.length, 0);
  assert.equal(stacked.overpasses.length, 1);
  assert.ok(stacked.overpasses[0].gap > 1.5);
  assert.equal(stacked.runs.get('r1').length, 1);
});

test('long-road crossing is found (odd-segment trap the old stride missed)', () => {
  // 1102 m roads: the origin crossing sits mid-segment-551 (odd, interior)
  // of each. The old stride-2 scan only tested even segments and missed it.
  const p = newProject('t');
  p.roads = [
    road('r1', [P(-551.5, 0), P(550.5, 0)]),
    road('r2', [P(0, -551.5), P(0, 550.5)]),
  ];
  const t = topo(p);
  assert.equal(t.intersections.length, 1);
  assert.equal(t.intersections[0].kind, 'cross');
});

test('planOverpassBridge plants a span that clears the lower road', async () => {
  const {planOverpassBridge} = await import('../src/topology.js');
  const {buildNetworkMesh} = await import('../src/geometry.js');
  const p = newProject('t');
  p.roads = [
    defaultRoad('r1', 1, {lanes: 2, laneWidth: 3.5, points: [P(-60, 0), P(60, 0)]}),
    defaultRoad('r2', 2, {lanes: 2, laneWidth: 3.5, points: [P(0, -60, 7), P(0, 60, 7)]}),
  ];
  const samples = samplesFor(p);
  const t = buildTopology(p, samples);
  assert.equal(t.overpasses.length, 1);
  const o = t.overpasses[0];
  const plan = planOverpassBridge(p, samples, t, o.id);
  assert.ok(!plan.error, plan.error || '');
  assert.equal(plan.roadId, 'r2');
  // Apply exactly like the panels action does.
  for (const ins of plan.inserts) {
    p.roads[1].points.splice(Math.min(ins.index, p.roads[1].points.length), 0, {...ins.point});
  }
  for (const f of plan.flags) p.roads[1].points[f].bridge = true;
  const t2 = buildTopology(p, samplesFor(p));
  assert.equal(t2.bridges.length, 1);
  const b = t2.bridges[0];
  assert.ok(b.s0 < o.sUpper && b.s1 > o.sUpper, 'span covers the crossing');
  assert.ok(b.s1 - b.s0 >= 2 * (3.5 + 1 + 1) + 6, 'span clears lower road + abutments');
  const terrain = {size: 400, seg: 8, heightAt: () => 0};
  const {parts, stats} = buildNetworkMesh(p, samplesFor(p), t2, terrain);
  assert.ok(stats.bridges === 1 && parts.some((q) => q.name.startsWith('bridge-')));
  for (const q of parts) assert.ok(q.positions.every(Number.isFinite), `${q.name} finite`);
});
