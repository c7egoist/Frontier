import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTerrain } from '../src/geom/terrain.js';
import { buildCenterline } from '../src/geom/centerline.js';
import { profileSlots, withRoadDefaults } from '../src/geom/profile.js';
import { solveJunction, buildJunctionMesh } from '../src/geom/junction.js';
import { MeshBuilder } from '../src/geom/mesh.js';
import { buildNetwork } from '../src/geom/network.js';
import { batterToe } from '../src/geom/batter.js';
import { sampleProject } from '../src/model/project.js';
import { openEdges, selfIntersections, signedArea } from './helpers.mjs';

function arm(dx, dz, props = {}) {
  const road = withRoadDefaults(props);
  const sl = profileSlots(road);
  const l = Math.hypot(dx, dz);
  return {
    id: 'a',
    dx: dx / l,
    dz: dz / l,
    offs: sl.slots.map((s) => s.o),
    dy: sl.slots.map((s) => s.dy),
    halfW: sl.carriageHalf,
    yD: 0,
    band: [null, ...[1, 2, 3, 4, 5].map((b) => ({ key: 'x', empty: sl.bands[b].empty, vertical: sl.bands[b].vertical }))],
  };
}

test('terrain is deterministic and flat when requested', () => {
  const t = makeTerrain({ mode: 'rolling', amplitude: 2.4, wavelength: 180, seed: 7 });
  assert.equal(t.height(12.5, -40), t.height(12.5, -40));
  const f = makeTerrain({ mode: 'flat', base: 3 });
  assert.equal(f.height(100, 100), 3);
});

test('centreline stubs are straight and stations are monotonic', () => {
  const a = [0, 1, 0];
  const q0 = [30, 1, 20];
  const cl = buildCenterline({ a, b: [100, 1, 0], points: [q0, [60, 1, -20]], stubA: 8, stubB: 8 });
  // the first 8 m of plan length lie on the line from a towards the first point
  const dir = [q0[0] - a[0], q0[2] - a[2]];
  const l = Math.hypot(dir[0], dir[1]);
  for (const s of [2, 5, 7.5]) {
    const p = cl.at(s).p;
    const cross = (p[0] - a[0]) * dir[1] / l - (p[2] - a[2]) * dir[0] / l;
    assert.ok(Math.abs(cross) < 1e-6, `stub point at ${s} m is off the stub line`);
  }
  for (let i = 1; i < cl.S.length; i++) assert.ok(cl.S[i] >= cl.S[i - 1] - 1e-9);
  assert.ok(cl.L > 100);
});

test('junction loops are simple and CCW for common layouts', () => {
  const layouts = {
    cross: [arm(1, 0), arm(0, 1), arm(-1, 0), arm(0, -1)],
    tee: [arm(1, 0), arm(-1, 0), arm(0, 1)],
    bend: [arm(1, 0), arm(0, 1)],
    dead: [arm(1, 0)],
    skew: [arm(1, 0), arm(Math.cos(2.6), Math.sin(2.6)), arm(-1, -0.4)],
    five: [arm(1, 0), arm(Math.cos(1.2), Math.sin(1.2)), arm(Math.cos(2.4), Math.sin(2.4)), arm(-1, -0.5), arm(0.2, -1)],
  };
  for (const [name, arms] of Object.entries(layouts)) {
    const J = solveJunction({ id: name, x: 0, z: 0, radius: 8, steps: 8, arms });
    for (let k = 0; k < 6; k++) {
      const poly = J.rings[k].map((q) => [q.x, q.z]);
      assert.equal(selfIntersections(poly), 0, `${name} ring ${k} self-intersects`);
      assert.ok(signedArea(poly) > 0, `${name} ring ${k} is not CCW`);
      assert.equal(J.rings[k].length, J.rings[0].length - (arms.length === 1 ? 0 : 0) || J.rings[k].length, 'ring sizes');
    }
    const mb = new MeshBuilder();
    buildJunctionMesh(mb, J, { terrain: { height: () => 0 }, fanKey: 'asphalt', batterKey: 'batter' });
    const f = mb.finalize();
    assert.ok(f.triangles > 0, name);
    for (const g of f.groups.values()) for (const v of g.position) assert.ok(Number.isFinite(v), `${name} NaN`);
  }
});

test('batter meets the ground at its toe', () => {
  const terrain = { height: (x) => (x > 10 ? 2 : 0) };
  const t = batterToe(terrain, 0, 0, 1, 0, 3, 2, 28);
  assert.ok(t.s > 0 && t.s < 28);
  assert.ok(Math.abs(t.y - terrain.height(t.x, t.z)) < 1e-9);
});

// Edges lying over a bridge span (parapet tops and deck sides) are allowed to stay open.
function deckSpan(net, a, b) {
  const mid = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2];
  return net.roads.some((r) =>
    r.body.runs.bridge.some(([s0, s1]) => {
      const p0 = r.cl.at(s0).p;
      const p1 = r.cl.at(s1).p;
      const t = Math.max(0, Math.min(1, ((mid[0] - p0[0]) * (p1[0] - p0[0]) + (mid[1] - p0[2]) * (p1[2] - p0[2])) / ((p1[0] - p0[0]) ** 2 + (p1[2] - p0[2]) ** 2 || 1)));
      const cx = p0[0] + (p1[0] - p0[0]) * t;
      const cz = p0[2] + (p1[2] - p0[2]) * t;
      return Math.hypot(cx - mid[0], cz - mid[1]) < 6 && Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0;
    })
  );
}

for (const [name, project] of [
  ['crossroads village', sampleProject('crossroads')],
  ['valley crossing', sampleProject('valley')],
]) {
  test(`network closes at every throat: ${name}`, () => {
    const net = buildNetwork(project);
    assert.equal(net.warnings.filter((w) => /overlap|too short|exceeds/.test(w)).length, 0, net.warnings.join('; '));
    const open = openEdges(net.mesh.groups);
    const T = net.terrain;
    // Bridge decks meet the embankments at their ends and carry zero-thickness parapets,
    // so edges within 1.5 m of a deck boundary may stay open. Everything else must close.
    const deckEnds = net.roads.flatMap((r) => r.body.runs.bridge.flatMap(([s0, s1]) => [[s0, r], [s1, r]]));
    const nearDeckEnd = (p) => deckEnds.some(([s, r]) => Math.hypot(r.cl.at(s).p[0] - p[0], r.cl.at(s).p[2] - p[2]) < 1.5);
    const off = open.filter(([a, b]) => (Math.abs(a[1] - T.height(a[0], a[2])) > 0.05 || Math.abs(b[1] - T.height(b[0], b[2])) > 0.05) && !(nearDeckEnd(a) && nearDeckEnd(b)) && !deckSpan(net, a, b));
    assert.equal(off.length, 0, `${off.length} open edges above ground, e.g. ${JSON.stringify(off[0])}`);
  });
}

test('network closes for an elevated junction over flat ground with kerbs', () => {
  const p = {
    version: 1, clearance: 5.5, terrain: { mode: 'flat', base: 0 },
    nodes: [
      { id: 'n', x: 0, y: 1, z: -120, radius: 8, steps: 8 },
      { id: 's', x: 0, y: 1, z: 120, radius: 8, steps: 8 },
      { id: 'w', x: -120, y: 1, z: 0, radius: 8, steps: 8 },
      { id: 'e', x: 120, y: 1, z: 0, radius: 8, steps: 8 },
      { id: 'c', x: 0, y: 1, z: 0, radius: 9, steps: 10 },
    ],
    roads: [
      { id: 'a', from: 'n', to: 'c', points: [], curb: 'low', sidewalk: 2 },
      { id: 'b', from: 'c', to: 's', points: [], curb: 'low', sidewalk: 2 },
      { id: 'd', from: 'w', to: 'c', points: [], curb: 'high', sidewalk: 3 },
      { id: 'e2', from: 'c', to: 'e', points: [], curb: 'high', sidewalk: 3 },
    ],
  };
  const net = buildNetwork(p);
  const open = openEdges(net.mesh.groups);
  const off = open.filter(([a, b]) => a[1] > 0.05 || b[1] > 0.05);
  assert.equal(off.length, 0, `open edges at height: ${off.length}`);
});

test('network closes for a bent road with interior points and ditches', () => {
  const p = {
    version: 1, clearance: 5.5, terrain: { mode: 'rolling', amplitude: 1.5, wavelength: 150, seed: 5 },
    nodes: [
      { id: 'a', x: -150, y: 1.2, z: 0 },
      { id: 'b', x: 80, y: 1.2, z: 120 },
      { id: 'c', x: 160, y: 1.2, z: -40 },
    ],
    roads: [
      { id: 'ab', from: 'a', to: 'b', points: [{ x: -40, y: 1.2, z: 10 }, { x: 20, y: 1.2, z: 60 }], curb: 'none', drainage: { mode: 'ditches' } },
      { id: 'bc', from: 'b', to: 'c', points: [{ x: 120, y: 1.2, z: 60 }], curb: 'none', drainage: { mode: 'ditches' } },
    ],
  };
  const net = buildNetwork(p);
  assert.equal(net.warnings.length, 0, net.warnings.join('; '));
  const open = openEdges(net.mesh.groups);
  const T = net.terrain;
  const off = open.filter(([a, b]) => Math.abs(a[1] - T.height(a[0], a[2])) > 0.05 || Math.abs(b[1] - T.height(b[0], b[2])) > 0.05);
  assert.equal(off.length, 0);
});
