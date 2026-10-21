import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoadMesh, roadNetworkToOBJ, countProjectTriangles, baseWidth, SURFACES} from '../src/geometry.js';
import {newProject, defaultRoad} from '../src/io.js';

const straight = () => defaultRoad('r1', 1, {
  lanes: 2, laneWidth: 3.5, shoulderL: 1, shoulderR: 1, camber: 0.08,
  centerMarking: 'single', edgeMarking: true,
  points: [{x: 0, z: 0, y: 0, w: 1}, {x: 60, z: 0, y: 0, w: 1}]
});

test('surface mesh is finite with camber crown and lane/shoulder colours', () => {
  const {parts, stats} = buildRoadMesh(straight(), {step: 2});
  const surf = parts.find((p) => p.name === 'surface');
  assert.ok(surf);
  assert.ok(stats.triangles > 40);
  assert.ok(surf.positions.every(Number.isFinite));
  assert.ok(surf.normals.every(Number.isFinite));
  assert.ok(surf.colors.every((c) => c >= 0 && c <= 1));
  assert.ok(surf.normals.filter((_, i) => i % 3 === 1).every((ny) => ny > 0.5));
  // Crown: centre column of the first row sits above the lane edge columns.
  const cols = surf.positions.length / 3 / (stats.length / 2 + 1);
  const row0 = (c) => surf.positions[c * 3 + 1];
  const mid = Math.floor(cols / 2);
  assert.ok(row0(mid) > row0(2) + 1e-4, 'camber crowns the centre');
  assert.ok(row0(mid) > row0(cols - 3) + 1e-4);
});

test('markings, kerbs and rails appear as named parts', () => {
  const road = straight();
  road.centerMarking = 'double';
  road.kerbL = true;
  road.guardrailR = true;
  const {parts} = buildRoadMesh(road, {step: 2});
  const names = parts.map((p) => p.name);
  assert.ok(names.includes('marking-center-L') && names.includes('marking-center-R'));
  assert.ok(names.includes('kerb-L') && !names.includes('kerb-R'));
  assert.ok(names.includes('rail-R') && names.includes('posts-R'));
  assert.ok(names.includes('marking-edge-L') && names.includes('marking-edge-R'));
});

test('dashed centreline is a strict subset of solid', () => {
  const a = buildRoadMesh({...straight(), centerMarking: 'single'}, {step: 1});
  const b = buildRoadMesh({...straight(), centerMarking: 'dashed'}, {step: 1});
  const ta = a.parts.find((p) => p.name === 'marking-center').triangles;
  const tb = b.parts.find((p) => p.name === 'marking-center').triangles;
  assert.ok(tb < ta && tb > 0);
});

test('drape conform hugs the terrain plus offset', () => {
  const road = {...straight(), conform: 'drape', drapeOffset: 0.4};
  const {parts} = buildRoadMesh(road, {step: 2, terrain: () => 10});
  const surf = parts.find((p) => p.name === 'surface');
  const ys = [];
  for (let i = 0; i < surf.positions.length; i += 3) ys.push(surf.positions[i + 1]);
  assert.ok(Math.min(...ys) >= 10.3 && Math.max(...ys) <= 10.6);
});

test('width scale widens the ribbon', () => {
  const narrow = buildRoadMesh(straight(), {step: 5}).parts.find((p) => p.name === 'surface');
  const wide = buildRoadMesh({...straight(), points: [{x: 0, z: 0, y: 0, w: 2}, {x: 60, z: 0, y: 0, w: 2}]}, {step: 5})
    .parts.find((p) => p.name === 'surface');
  const span = (arr) => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < arr.length; i += 3) { mn = Math.min(mn, arr[i + 2]); mx = Math.max(mx, arr[i + 2]); }
    return mx - mn;
  };
  assert.ok(Math.abs(span(wide.positions) / span(narrow.positions) - 2) < 0.01);
  assert.equal(baseWidth(straight()), 9);
});

test('OBJ export follows the engine header convention with valid faces', () => {
  const p = newProject('t');
  p.roads = [straight()];
  const obj = roadNetworkToOBJ(p, {step: 2});
  const lines = obj.split('\n');
  assert.ok(lines[0].startsWith('# Frontier road network | units: meters | Y-up'));
  assert.ok(lines.some((l) => l.startsWith('o Road_1__surface')));
  assert.ok(!lines.some((l) => l.startsWith('usemtl')), 'geometry only, like Terrain Lab');
  const nv = lines.filter((l) => l.startsWith('v ')).length;
  assert.ok(nv > 0);
  for (const l of lines.filter((x) => x.startsWith('f '))) {
    for (const m of l.matchAll(/(\d+)\/\d+\/\d+/g)) {
      const v = +m[1];
      assert.ok(v >= 1 && v <= nv, `face index ${v} in range`);
    }
  }
  assert.equal(countProjectTriangles(p, {step: 2}) > 0, true);
  assert.ok(Object.keys(SURFACES).length >= 4);
});

test('network: junction patch trims approaches watertight, bridge spans deck over terrain', async () => {
  const {buildNetworkMesh} = await import('../src/geometry.js');
  const {buildTopology} = await import('../src/topology.js');
  const {sampleRoad} = await import('../src/spline.js');
  const p = newProject('net');
  p.roads = [
    defaultRoad('r1', 1, {lanes: 2, laneWidth: 3.5, points: [{x: -40, z: 0, y: 0}, {x: 40, z: 0, y: 0}]}),
    defaultRoad('r2', 2, {lanes: 2, laneWidth: 3.5, points: [{x: 0, z: -40, y: 0}, {x: 0, z: 40, y: 0}]}),
    defaultRoad('r3', 3, {lanes: 2, laneWidth: 3, points: [{x: -40, z: -40, y: 10}, {x: 40, z: 40, y: 10}]}),
  ];
  p.roads[2].points[0].bridge = true; p.roads[2].points[1].bridge = true;
  const samples = new Map(p.roads.map((r) => [r.id, sampleRoad(r.points, {step: 1})]));
  const topo = buildTopology(p, samples);
  assert.equal(topo.intersections.length, 1);
  assert.equal(topo.intersections[0].kind, 'cross');
  const terrain = {size: 400, seg: 8, heightAt: () => 0};
  const {parts, stats} = buildNetworkMesh(p, samples, topo, terrain);
  const names = parts.map((q) => q.name);
  assert.ok(names.some((n) => n.startsWith('junction_')), 'junction patch present');
  assert.ok(parts.some((q) => q.name.startsWith('bridge-') && q.roadId === 'r3'), 'bridge deck present');
  for (const q of parts) {
    assert.ok(q.positions.every(Number.isFinite), `${q.name} finite positions`);
    assert.ok(q.normals.every(Number.isFinite), `${q.name} finite normals`);
    assert.ok(q.triangles > 0, `${q.name} has triangles`);
  }
  // Approaches are trimmed back from the crossing: no approach surface vertex inside the patch.
  const ix = topo.intersections[0];
  const R = ix.radius - 0.05; // approaches must end at the patch boundary, not inside it
  const members = new Set(ix.roads || []);
  let checked = 0;
  for (const q of parts) {
    if (q.junction || !q.name.startsWith('surface')) continue;
    if (!members.has(q.roadId)) continue; // overpassing roads legitimately fly over the patch
    for (let i = 0; i < q.positions.length; i += 3) {
      const dx = q.positions[i] - ix.x, dz = q.positions[i + 2] - ix.z;
      assert.ok(Math.hypot(dx, dz) >= R, `${q.name} overlaps junction patch`);
      checked++;
    }
  }
  assert.ok(checked > 100, 'watertight scan covered approach vertices');
  assert.ok(stats.junctions === 1 && stats.bridges === 1);
  assert.equal(countProjectTriangles(p, {terrain, samples, topo}), stats.triangles);
});

test('network: overpass upper deck survives with a gap over the lower road', async () => {
  const {buildNetworkMesh} = await import('../src/geometry.js');
  const {buildTopology} = await import('../src/topology.js');
  const {sampleRoad} = await import('../src/spline.js');
  const p = newProject('over');
  p.roads = [
    defaultRoad('r1', 1, {lanes: 2, laneWidth: 3.5, points: [{x: -40, z: 0, y: 0}, {x: 40, z: 0, y: 0}]}),
    defaultRoad('r2', 2, {lanes: 2, laneWidth: 3.5, points: [{x: 0, z: -40, y: 6}, {x: 0, z: 40, y: 6}]}),
  ];
  const samples = new Map(p.roads.map((r) => [r.id, sampleRoad(r.points, {step: 1})]));
  const topo = buildTopology(p, samples);
  assert.equal(topo.intersections.length, 0);
  assert.equal(topo.overpasses.length, 1);
  const terrain = {size: 400, seg: 8, heightAt: () => 0};
  const {parts, stats} = buildNetworkMesh(p, samples, topo, terrain);
  assert.ok(!parts.some((q) => q.name.startsWith('junction_')));
  assert.ok(stats.triangles > 20);
  for (const q of parts) assert.ok(q.positions.every(Number.isFinite), `${q.name} finite`);
});
