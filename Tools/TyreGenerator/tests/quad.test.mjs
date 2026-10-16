// Node tests for the quad remesher. Run: npm test  (set ALL=1 to include the dense presets)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGenerator } from './helpers.mjs';
import { buildTyreQuadMesh, auditQuadMesh } from '../TyreTopology.js';

const G = loadGenerator();
const { T, PRESETS, dims } = G;
const DENSE = new Set([9]);   // Frostbite Sipe: 800 zig-zag sipe lines, ~20 s per build; run with ALL=1
const run = (i) => {
  G.applyPresetState(i);
  const t0 = Date.now();
  const m = buildTyreQuadMesh({ d: dims(), pattern: { layers: G.P.layers }, treadDepth: T.treadDepth, wear: T.wear, wearBias: T.wearBias,
    crown: T.crown, bulge: T.bulge, rimWidthFrac: T.rimWidthFrac, spacing: 15, chamfer: 0.25, faceBudget: 120000 });
  return { m, ms: Date.now() - t0, audit: auditQuadMesh(m) };
};

for (let i = 0; i < PRESETS.length; i++) {
  const skip = DENSE.has(i) && !process.env.ALL;
  test(`preset ${i} ${PRESETS[i].name}: watertight pure-quad torus`, { skip, timeout: 120000 }, () => {
    const { m, ms, audit } = run(i);
    assert.equal(audit.degenerateFaces, 0);
    assert.equal(audit.boundaryEdges, 0, 'open edges');
    assert.equal(audit.nonManifoldEdges, 0);
    assert.equal(audit.inconsistentEdges, 0);
    assert.equal(audit.eulerCharacteristic, 0, 'torus');
    assert.ok(audit.watertight);
    assert.ok(m.quads.length > 0 && m.quads.length % 4 === 0, 'flat quad index array');
    assert.equal(new Set(Array.from(m.quads)).size, m.positions.length / 3, 'no unused vertices');
    console.log(`  ${PRESETS[i].name}: ${m.quads.length / 4} quads, ${ms} ms, contour ${m.spacing.contour} mm`);
  });
}

import * as THREE from 'three';
import { quadMeshToGeometry, quadMeshToObj } from '../TyreTopology.js';

test('GPU geometry: two groups, seam-unwrapped UVs, no stretched faces, OBJ is quads only', { timeout: 120000 }, () => {
  const { m } = run(0);
  const g = quadMeshToGeometry(THREE, m);
  const idx = g.index.array, uv = g.attributes.uv.array, uv1 = g.attributes.uv1.array, nrm = g.attributes.normal.array;
  assert.equal(g.groups.length, 2);
  assert.equal(g.groups[0].count + g.groups[1].count, idx.length);
  assert.ok(g.groups[0].count > 0 && g.groups[1].count > 0);
  // Tread faces use uv, sidewall faces use uv1. The only allowed UV fold is the bead cap (v1 = -0.05, hidden inside the rim),
  // where the mirrored left-wall UV meets the shared cap column; the welded topology is kept on purpose.
  let stretched = 0, capFolds = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const tread = t < g.groups[0].count;
    const set = tread ? uv : uv1; const ids = [idx[t], idx[t + 1], idx[t + 2]];
    const us = ids.map(i => set[2 * i]);
    if (Math.max(...us) - Math.min(...us) > 0.5) {
      if (!tread && ids.every(i => Math.abs(uv1[2 * i + 1] + 0.05) < 1e-6)) capFolds++; else stretched++;
    }
  }
  assert.equal(stretched, 0, 'no tread or wall triangle spans more than half the circumference in UV');
  assert.ok(capFolds <= 4, 'only bead-cap triangles may fold');
  for (let i = 0; i < nrm.length; i += 3) assert.ok(Math.abs(Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) - 1) < 1e-3, 'unit normals');
  const obj = quadMeshToObj(m);
  const faces = obj.split('\n').filter(l => l.startsWith('f '));
  assert.equal(faces.length, m.quads.length / 4);
  assert.ok(faces.every(l => l.split(' ').length === 5), 'every OBJ face has four corners');
});

test('mesh carcass matches the page profile (outer radius, bead radius, section half-width)', { timeout: 120000 }, () => {
  G.applyPresetState(0);
  const d = dims(); const prof = G.buildProfile(d);
  const pmax = Math.max(...prof.map(p => p.r)), pxmax = Math.max(...prof.map(p => p.x)), pxmin = Math.min(...prof.map(p => p.x));
  const { m } = run(0);
  let rmax = 0, xmax = -Infinity, xmin = Infinity;
  for (let i = 0; i < m.positions.length; i += 3) { rmax = Math.max(rmax, Math.hypot(m.positions[i + 1], m.positions[i + 2])); xmax = Math.max(xmax, m.positions[i]); xmin = Math.min(xmin, m.positions[i]); }
  assert.ok(Math.abs(rmax - pmax) < 0.05, `outer radius ${rmax} vs profile ${pmax}`);
  assert.ok(Math.abs(xmax - pxmax) < 0.05 && Math.abs(xmin - pxmin) < 0.05, `section x ${xmin}..${xmax} vs profile ${pxmin}..${pxmax}`);
});
