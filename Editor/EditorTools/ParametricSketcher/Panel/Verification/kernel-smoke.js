#!/usr/bin/env node
/* Browser-free regression checks for the Frontier B-rep prototype. */
'use strict';
const assert = require('node:assert/strict');
const { FrontierCadKernel } = require('../cad-kernel.js');

const rectangle = (w = 40, d = 30) => [{ hole: false, segs: [
  { a: [-w / 2, -d / 2], b: [w / 2, -d / 2], eid: 0 },
  { a: [w / 2, -d / 2], b: [w / 2, d / 2], eid: 1 },
  { a: [w / 2, d / 2], b: [-w / 2, d / 2], eid: 2 },
  { a: [-w / 2, d / 2], b: [-w / 2, -d / 2], eid: 3 },
]}];
const triangles = mesh => [
  ...(mesh.tris || []),
  ...(mesh.quads || []).flatMap(q => [[q.p[0], q.p[1], q.p[2]], [q.p[0], q.p[2], q.p[3]]]),
];
const volume = mesh => Math.abs(triangles(mesh).reduce((v, [a, b, c]) => v + (
  a[0] * (b[1] * c[2] - b[2] * c[1]) -
  a[1] * (b[0] * c[2] - b[2] * c[0]) +
  a[2] * (b[0] * c[1] - b[1] * c[0])
) / 6, 0));
const build = (edits = [], faceOps = []) => FrontierCadKernel.build({ params: { height: 20 }, edits, faceOps }, rectangle(), { edits, faceOps });

const plain = build();
assert.equal(plain.brep.faces.length, 6, 'a prismatic rectangle has six faces');
assert.equal(volume(plain), 40 * 30 * 20, 'plain extrusion volume');
assert.deepEqual(FrontierCadKernel.audit(plain), [], 'plain extrusion passes topology audit');

const oneChamfer = build([{ type: 'chamfer', key: 'top:0', r: 3 }]);
const chamferFaces = oneChamfer.brep.faces.filter(f => /chamfer/.test(f.key));
assert.equal(chamferFaces.length, 1, 'one selected cap edge creates one chamfer band');
assert.ok(volume(oneChamfer) < volume(plain), 'chamfer removes material');
assert.deepEqual(FrontierCadKernel.audit(oneChamfer), [], 'single-edge chamfer stays valid');

const oneFillet = build([{ type: 'fillet', key: 'top:0', r: 3 }]);
assert.equal(oneFillet.brep.faces.filter(f => f.kind === 'cylinder').length, 1, 'one selected line edge creates one cylindrical fillet band');
assert.ok(oneFillet.brep.edges.filter(e => e.tangent).length >= 1, 'fillet boundaries are tangent topology');

const inset = build([], [{ op: 'inset', face: 'cap:top', d: 3 }]);
assert.ok(inset.brep.faces.some(f => f.key === 'inset:top:0'), 'inset creates a separate ring face');
assert.ok(inset.brep.faces.some(f => f.key === 'cap:top'), 'inset keeps the inner cap face addressable');

const pushed = build([], [{ op: 'push', face: 'cap:top', h: 5 }]);
assert.equal(volume(pushed), 40 * 30 * 25, 'pushing the cap changes the feature height, not mesh vertices');

const circle = [{ hole: false, segs: [
  { a: [-10, 0], b: [10, 0], bulge: 1, eid: 0, smooth: true },
  { a: [10, 0], b: [-10, 0], bulge: 1, eid: 0, smooth: true },
]}];
const cylinder = FrontierCadKernel.build({ params: { height: 20 } }, circle);
assert.equal(cylinder.brep.faces.filter(f => f.kind === 'cylinder').length, 1, 'a circular profile is one analytic cylindrical face');
assert.equal(cylinder.brep.edges.filter(e => /^(top|bot):/.test(e.key)).length, 2, 'a cylinder has two circular boundary edges');

const A = [[0, 0], [10, 0], [10, 10], [0, 10]];
const B = [[5, 0], [15, 0], [15, 10], [5, 10]];
const boolArea = loops => loops.reduce((sum, p) => sum + Math.abs(require('../cad-kernel.js').math.area2(p)), 0);
assert.equal(boolArea(FrontierCadKernel.boolean2D([A, B], 'union')), 150, '2D union arrangement');
assert.equal(boolArea(FrontierCadKernel.boolean2D([A, B], 'intersection')), 50, '2D intersection arrangement');
assert.equal(boolArea(FrontierCadKernel.boolean2D([A, B], 'subtract')), 50, '2D difference arrangement');
assert.equal(FrontierCadKernel.boolean2D([A, B], 'xor').length, 2, '2D xor keeps both disjoint lobes');
const circlePoly = (cx, r, n = 48) => Array.from({ length: n }, (_, i) => { const a = i * Math.PI * 2 / n; return [cx + Math.cos(a) * r, Math.sin(a) * r]; });
const analyticCircle = (cx, r) => ({ outer: circlePoly(cx, r), holes: [], analytic: { outer: [{ type: 'arc', c: [cx, 0], r, a0: 0, sweep: Math.PI * 2 }], holes: [] } });
const analyticUnion = FrontierCadKernel.boolean2D([analyticCircle(0, 10), analyticCircle(8, 10)], 'union');
assert.ok(analyticUnion.paths.length && analyticUnion.paths[0].every(s => s.type === 'arc'), 'boolean result retains circular analytic arcs');
assert.deepEqual(FrontierCadKernel.mirror2D([[2, 3], [5, 3]], [0, 0], [0, 1]), [[-2, 3], [-5, 3]], '2D mirror across the sketch V axis');

console.log('Frontier CAD kernel smoke: all checks passed');
