import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShard, cubeBase, shardBase, solidOf} from '../src/engine.js';

test('shard is an 8-face octahedron with outward unit normals', () => {
  const s = buildShard();
  assert.equal(s.index, null);
  assert.equal(s.position.count, 24);
  assert.equal(s.normal.count, 24);
  const p = s.position.array, n = s.normal.array;
  let maxR = 0;
  for (let i = 0; i < 24; i++) {
    const r = Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    maxR = Math.max(maxR, r);
    const nl = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
    assert.ok(Math.abs(nl - 1) < 1e-6, `normal ${i} is unit`);
    // Outward: normal must agree with the face centroid direction.
    const f = Math.floor(i / 3) * 9;
    const cx = (p[f] + p[f + 3] + p[f + 6]) / 3;
    const cy = (p[f + 1] + p[f + 4] + p[f + 7]) / 3;
    const cz = (p[f + 2] + p[f + 5] + p[f + 8]) / 3;
    assert.ok(n[i * 3] * cx + n[i * 3 + 1] * cy + n[i * 3 + 2] * cz > 0, `face ${f} points outward`);
  }
  assert.ok(Math.abs(maxR - 0.5) < 1e-6, 'unit solid spans ±0.5');
});

test('cube base is a unit box with normals + index', () => {
  const c = cubeBase();
  assert.equal(c.position.count, 24);
  assert.equal(c.normal.count, 24);
  assert.equal(c.index.count, 36);
  const p = c.position.array;
  let maxAbs = 0;
  for (const v of p) maxAbs = Math.max(maxAbs, Math.abs(v));
  assert.ok(Math.abs(maxAbs - 0.5) < 1e-6, 'unit box spans ±0.5');
});

test('solid bases are cached singletons; solidOf defaults to shard', () => {
  assert.equal(shardBase(), shardBase());
  assert.equal(cubeBase(), cubeBase());
  assert.equal(solidOf({look: {shape: 'cube'}}), 'cube');
  assert.equal(solidOf({look: {shape: 'shard'}}), 'shard');
  assert.equal(solidOf({look: {}}), 'shard');
  assert.equal(solidOf({}), 'shard');
});
