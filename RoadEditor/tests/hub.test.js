import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNetwork } from '../src/geo/network.js';
import { stationAt } from '../src/geo/curve.js';
import { pointInPoly } from '../src/geo/clipper.js';
import { defaultJunction, defaultRoad, normalizeProject, emptyProject } from '../src/model/project.js';
import { areaOf, near } from './helpers.js';

function build(junctions, roads, areas = []) {
  const raw = { ...emptyProject('test'), junctions, roads, areas };
  const { project, errors } = normalizeProject(JSON.parse(JSON.stringify(raw)));
  assert.deepEqual(errors, []);
  return buildNetwork(project);
}

/** carriageway area of the hub that contains the junction centre (x, z) */
function hubAsphaltAt(net, x, z) {
  let area = 0;
  for (const h of net.plan.hubs) {
    if (h.mat !== 'asphalt') continue;
    for (const ring of h.rings.slice(0, 1)) {
      if (pointInPoly(x, z, ring)) area += h.rings.reduce((a, r, i) => a + (i ? -areaOf(r) : areaOf(r)), 0);
    }
  }
  return area;
}

const J = (id, x, z, extra = {}) => defaultJunction(id, x, z, extra);
const R = (id, a, b, extra = {}) => defaultRoad(id, a, b, extra);
const REACH = 1.5 * 6 + (0.45 + 0.15 + 2 + 1) + 3.5 + 3; // 19.1 m, default settings

test('straight road through a junction: hub carriageway is the full rectangle', () => {
  const net = build([J('J1', -60, 0), J('J2', 0, 0), J('J3', 60, 0)], [R('R1', 'J1', 'J2'), R('R2', 'J2', 'J3')]);
  assert.ok(net.warnings.every((w) => w.level !== 'error'), JSON.stringify(net.warnings));
  near(hubAsphaltAt(net, 0, 0), 2 * REACH * 7, 0.6, 'straight hub area');
});

test('T junction: union of arms plus two fillets of r^2 (1 - pi/4)', () => {
  const r = 6;
  const net = build(
    [J('J1', -60, 0), J('J2', 0, 0, { radius: r }), J('J3', 60, 0), J('J4', 0, 60)],
    [R('R1', 'J1', 'J2'), R('R2', 'J2', 'J3'), R('R3', 'J2', 'J4')],
  );
  const straight = 2 * REACH * 7;
  const stem = REACH * 7;
  const overlap = 3.5 * 7; // stem's half that lies inside the straight band
  const fillets = 2 * r * r * (1 - Math.PI / 4);
  near(hubAsphaltAt(net, 0, 0), straight + stem - overlap + fillets, 0.8, 'T hub area');
});

test('dead end: round cap behind the junction', () => {
  const net = build([J('J1', 0, 0), J('J2', 60, 0)], [R('R1', 'J1', 'J2')]);
  const expected = REACH * 7 + (Math.PI * 3.5 * 3.5) / 2;
  near(hubAsphaltAt(net, 0, 0), expected, 0.8, 'dead-end cap area');
});

test('mouth corners are hub vertices and band boundaries nest', () => {
  const net = build(
    [J('J1', -60, 0), J('J2', 0, 0, { radius: 8 }), J('J3', 60, 0), J('J4', 0, 60)],
    [R('R1', 'J1', 'J2'), R('R2', 'J2', 'J3'), R('R3', 'J2', 'J4')],
  );
  const verts = [];
  for (const h of net.plan.hubs) for (const ring of h.rings) for (const p of ring) verts.push(p);
  const offsets = [3.5, 3.5 + 0.45, 3.5 + 0.6, 3.5 + 2.6, 3.5 + 3.6]; // carriageway edge and every band edge
  for (const [road, end] of [['R1', 'b'], ['R2', 'a'], ['R3', 'a']]) {
    const c = net.curves.get(road);
    const ctx = net.ctxOf.get(road);
    const s = end === 'a' ? ctx.Da : c.length - ctx.Db;
    const st = stationAt(c, s);
    for (const off of offsets) {
      for (const sg of [1, -1]) {
        const p = [st.x + st.nx * off * sg, st.z + st.nz * off * sg];
        const hit = verts.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 0.003);
        assert.ok(hit, `mouth vertex of ${road} at lateral ${(off * sg).toFixed(2)} is not on a hub boundary`);
      }
    }
  }
});

test('cross roads without a junction are flagged, grade-separated ones are not', () => {
  const flat = build([J('A1', -60, 0), J('A2', 60, 0), J('B1', 0, -60), J('B2', 0, 60)], [R('RA', 'A1', 'A2'), R('RB', 'B1', 'B2')]);
  assert.ok(flat.warnings.some((w) => w.level === 'error' && /cross/.test(w.text)));
  const over = build(
    [J('A1', -60, 0, { y: 6 }), J('A2', 60, 0, { y: 6 }), J('B1', 0, -60), J('B2', 0, 60)],
    [R('RA', 'A1', 'A2', { bridge: { on: true, from: 0, to: null, depth: 0.9, pierSpacing: 18, pierW: 1.2 } }), R('RB', 'B1', 'B2')],
  );
  assert.ok(!over.warnings.some((w) => w.level === 'error'), JSON.stringify(over.warnings));
});
