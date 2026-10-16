// A 2D-editor drawing (shape layer) must go through the same remesh and stay watertight, including across the seam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGenerator } from './helpers.mjs';
import { buildTyreQuadMesh, auditQuadMesh } from '../TyreTopology.js';
const G = loadGenerator(); const { T, dims } = G;
test('drawn shapes (stroke across the seam, block, dimple, mirrored sipe) remesh to a watertight quad torus', { timeout: 120000 }, () => {
  G.applyPresetState(0);
  const d = dims(), C = d.circ;
  G.P.layers.push({ type: 'shape', tag: 'drawn', depth: 1, shapes: [
    { kind: 'stroke', pts: [[C - 120, -40], [C + 60, -40]], width: 4, depth: 1 },
    { kind: 'polygon', pts: [[300, -60], [360, -60], [360, -30], [300, -30]], depth: 1 },
    { kind: 'circle', pts: [[1000, 70]], r: 6, depth: 0.5 },
    { kind: 'stroke', pts: [[500, 30], [520, 70], [540, 30]], width: 1.2, depth: 0.7 },
    { kind: 'stroke', pts: [[500, -30], [520, -70], [540, -30]], width: 1.2, depth: 0.7 },
  ] });
  const m = buildTyreQuadMesh({ d, pattern: { layers: G.P.layers }, treadDepth: T.treadDepth, wear: T.wear, wearBias: T.wearBias,
    crown: T.crown, bulge: T.bulge, rimWidthFrac: T.rimWidthFrac, spacing: 15, chamfer: 0.25, faceBudget: 120000 });
  const a = auditQuadMesh(m);
  assert.equal(a.boundaryEdges, 0); assert.equal(a.nonManifoldEdges, 0); assert.equal(a.inconsistentEdges, 0);
  assert.equal(a.eulerCharacteristic, 0); assert.ok(a.watertight);
  assert.ok(m.quads.length % 4 === 0 && m.quads.length > 0);
});
