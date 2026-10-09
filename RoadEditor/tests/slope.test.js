import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork } from '../src/geo/network.js';
import { defaultJunction, defaultRoad, normalizeProject, emptyProject } from '../src/model/project.js';

function net(j0y) {
  const raw = {
    ...emptyProject('slope'),
    junctions: [defaultJunction('J0', 0, 0, { y: j0y }), defaultJunction('J1', 60, 0, { y: 0 })],
    roads: [defaultRoad('R1', 'J0', 'J1')],
  };
  const { project } = normalizeProject(JSON.parse(JSON.stringify(raw)));
  return buildNetwork(project);
}
const retainTris = (n) => n.chunks.filter((c) => c.mat === 'retain').reduce((s, c) => s + c.positions.length / 9, 0);

test('a raised junction gets a capped fill slope and a retaining wall', () => {
  const n = net(16);
  assert.ok(retainTris(n) > 0, 'expected a retaining wall');
  // the arm runs along +x; the hub's fill slope must stop 8 m past the 7.1 m hub edge (lateral ~15 m)
  let lateral = 0;
  for (const h of n.plan.hubs.filter((x) => x.mat === 'embank')) {
    for (const r of h.rings) for (const p of r) lateral = Math.max(lateral, Math.abs(p[1]));
  }
  assert.ok(lateral < 15.5, `hub embankment reaches ${lateral.toFixed(1)} m sideways (uncapped it was ~31 m)`);
  for (const c of n.chunks) for (let i = 0; i < c.positions.length; i++) assert.ok(Number.isFinite(c.positions[i]));
});

test('a low junction has a plain slope and no retaining wall', () => {
  assert.equal(retainTris(net(3)), 0);
});
