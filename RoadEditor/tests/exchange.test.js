import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork } from '../src/geo/network.js';
import { diamondExchange } from '../src/model/exchange.js';
import { emptyProject, normalizeProject } from '../src/model/project.js';

test('diamond exchange builds cleanly, bridges the mainline and has four-way hubs', () => {
  const ex = diamondExchange({ prefix: 'X1', x: 0, z: 0, angle: 0 });
  const raw = { ...emptyProject('exchange'), junctions: ex.junctions, roads: ex.roads };
  const { project, errors } = normalizeProject(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(errors, []);
  const net = buildNetwork(project);
  const errs = net.warnings.filter((w) => w.level === 'error');
  assert.deepEqual(errs, [], JSON.stringify(errs));
  // the mainline crosses the cross road at height 5.5 m: no collision warning
  assert.ok(!net.warnings.some((w) => /cross/.test(w.text) && w.level !== 'info'), JSON.stringify(net.warnings));
  assert.equal(net.plan.crossings.length, 1, 'one grade-separated crossing');
  assert.ok(net.plan.crossings[0].clearance > 4, `clearance ${net.plan.crossings[0].clearance}`);
  // every central junction has four arms
  const deg = (id) => project.roads.filter((r) => r.a === id || r.b === id).length;
  assert.equal(deg('X1-MW'), 4);
  assert.equal(deg('X1-XS'), 4);
  assert.ok(net.plan.piers.length >= 4, 'piers under the bridge');
  assert.equal(net.stats.skipped, 0);
});
