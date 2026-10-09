import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork } from '../src/geo/network.js';
import { stationAt } from '../src/geo/curve.js';
import { pointInPoly } from '../src/geo/clipper.js';
import { defaultJunction, defaultRoad, normalizeProject, emptyProject } from '../src/model/project.js';

/** two roads leave junction J0 at `deg` degrees; both ends are dead ends */
function twoArms(deg, L = 150) {
  const t = (deg * Math.PI) / 180;
  const raw = {
    ...emptyProject('angle'),
    junctions: [defaultJunction('J0', 0, 0, { radius: 6 }), defaultJunction('J1', L, 0), defaultJunction('J2', L * Math.cos(t), L * Math.sin(t))],
    roads: [defaultRoad('R1', 'J0', 'J1'), defaultRoad('R2', 'J0', 'J2')],
  };
  const { project, errors } = normalizeProject(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(errors, []);
  return buildNetwork(project);
}

for (const deg of [10, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90, 110, 135, 160, 170]) {
  test(`arms ${deg} degrees apart: no errors, mouths on the hub, spans clear of each other`, () => {
    const net = twoArms(deg);
    assert.deepEqual(net.warnings.filter((w) => w.level === 'error').map((w) => w.text), []);
    const verts = [];
    for (const h of net.plan.hubs) for (const ring of h.rings) for (const p of ring) verts.push(p);
    for (const rid of ['R1', 'R2']) {
      const c = net.curves.get(rid);
      const st = stationAt(c, net.ctxOf.get(rid).Da);
      for (const off of [3.5, 3.95, 4.1, 6.1, 7.1]) {
        for (const sg of [1, -1]) {
          const p = [st.x + st.nx * off * sg, st.z + st.nz * off * sg];
          assert.ok(verts.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 0.003), `${rid} mouth corner at ${off * sg} is not on the hub`);
        }
      }
    }
    for (const [a, b] of [['R1', 'R2'], ['R2', 'R1']]) {
      const polys = net.plan.roads.filter((p) => p.mat === 'asphalt' && p.owner === `R:${a}`).map((p) => p.poly);
      const c = net.curves.get(b);
      const D = net.ctxOf.get(b).Da;
      for (let k = 0.5; k <= 8; k += 0.5) {
        const st = stationAt(c, D + k);
        assert.ok(!polys.some((pl) => pointInPoly(st.x, st.z, pl)), `${b} runs into ${a} ${k} m past its mouth`);
      }
    }
  });
}
