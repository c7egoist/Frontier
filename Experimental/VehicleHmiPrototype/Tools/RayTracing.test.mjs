import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BuildBvh } from '../Source/RayTracing/BvhBuilder.js';

const Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('binned-SAH BVH: leaves cover every triangle exactly once and bounds are finite', () => {
  // two triangles far apart + a cluster
  const pos = new Float32Array([
    0,0,0, 1,0,0, 0,1,0,
    10,0,0, 11,0,0, 10,1,0,
    0,10,0, 1,10,0, 0,11,0,
    0,0,10, 1,0,10, 0,1,10,
    5,5,5, 6,5,5, 5,6,5,
    5,5,6, 6,5,6, 5,6,6,
  ]);
  const { nodes, indices } = BuildBvh(pos);
  assert.equal(indices.length, 6);
  assert.deepEqual([...indices].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  const u = new Uint32Array(nodes.buffer);
  let covered = 0;
  for (let i = 0; i < nodes.length; i += 8) {
    for (let k = 0; k < 8; k++) if (k !== 3 && k !== 7) assert.ok(Number.isFinite(nodes[i + k]));
    if (nodes[i + 7] > 0) covered += nodes[i + 7];
    else assert.ok(nodes[i + 3] < nodes.length / 8, 'interior child in range');
  }
  assert.equal(covered, 6);
});

test('ReSTIR path tracer is wired as the default renderer with all four passes', () => {
  const host = fs.readFileSync(path.join(Root, 'Source/IlluminationHost.js'), 'utf8');
  assert.match(host, /Renderer: Query\.get\("renderer"\) === "gtx" \? "gtx" : "raytracing"/);
  assert.match(host, /new RestirPathTracer/);
  const tracer = fs.readFileSync(path.join(Root, 'Source/RayTracing/RestirPathTracer.js'), 'utf8');
  for (const entry of ['Generate', 'Temporal', 'Spatial', 'Resolve', 'Present'])
    assert.match(tracer, new RegExp(entry));
  for (const shader of ['RayCommon.wgsl', 'RayGenerate.wgsl', 'RayReservoirTemporal.wgsl', 'RayReservoirSpatial.wgsl', 'RayResolve.wgsl', 'RayPresent.wgsl'])
    assert.ok(fs.existsSync(path.join(Root, 'Shader', shader)), shader);
  const common = fs.readFileSync(path.join(Root, 'Shader/RayCommon.wgsl'), 'utf8');
  for (const fn of ['traceScene', 'anyHit', 'sampleBsdf', 'evalBsdf', 'nee', 'targetPdf'])
    assert.match(common, new RegExp(`fn ${fn}`));
});
