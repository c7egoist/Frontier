import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildRealtimeScene, createVehicleState, loadFacetStream, stepVehicle } from '../src/scene.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const archives = ['ControlVehicleBody.facet', 'ControlVehicleTyre.facet', 'ControlVehicleRim.facet'];
const expected = { 'ControlVehicleBody.facet': 2924, 'ControlVehicleTyre.facet': 3968, 'ControlVehicleRim.facet': 1568 };
for (const name of archives) {
  const data = fs.readFileSync(path.join(root, 'assets', name));
  const stream = loadFacetStream(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), name);
  assert.equal(stream.facetCount, expected[name], `${name} should retain Project-Drive facet count`);
  assert.equal(stream.positions.length, stream.vertexCount * 3);
}

globalThis.fetch = async (url) => {
  const name = String(url).split('/').at(-1);
  const data = fs.readFileSync(path.join(root, 'assets', name));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return new Response(buffer, { status: 200 });
};

const scene = await buildRealtimeScene();
assert.equal(scene.objectCount, 6, 'expected body, four wheel instances, and studio');
assert.equal(scene.builtMeshes.length, 4, 'expected body, handed wheels, and studio BLAS');
assert.ok(scene.totalTriangles > 14_000, `expected the full car BLAS plus studio triangles, got ${scene.totalTriangles}`);
assert.ok(scene.totalNodes > scene.builtMeshes.length, 'per-mesh BVHs should contain traversal nodes');
assert.ok(scene.sceneData.byteLength > 0 && scene.triangleData.byteLength > 0, 'packed GPU scene data must be present');
const update = scene.updateObjectRecords();
assert.equal(update.records.byteLength, scene.objectCount * scene.objectWords * 4);
assert.equal(update.byteOffset, scene.offsets.objectOffset * 4);
scene.advanceVehicle({ forward: true, left: true }, 1 / 60);
assert.ok(scene.vehicle.speed > 0 && scene.vehicle.x > 0, 'arcade drive inputs should advance the ControlVehicle');

const handling = createVehicleState();
for (let frame = 0; frame < 90; frame++) stepVehicle(handling, { forward: true }, 1 / 60);
const forwardSpeed = handling.speed;
assert.ok(forwardSpeed > 0 && forwardSpeed <= 14, 'throttle should accelerate within the forward speed cap');
for (let frame = 0; frame < 120; frame++) stepVehicle(handling, { reverse: true }, 1 / 60);
assert.ok(handling.speed < 0, 'braking against forward travel should transition to reverse');

const steering = createVehicleState();
steering.speed = 6;
for (let frame = 0; frame < 45; frame++) stepVehicle(steering, { left: true }, 1 / 60);
assert.ok(steering.yaw > 0.01, 'left steering should turn the vehicle');

const bounded = createVehicleState();
Object.assign(bounded, { x: 13.99, speed: 14 });
stepVehicle(bounded, { forward: true }, 1 / 60);
assert.equal(bounded.x, 14, 'the vehicle should remain within the expanded east play-area limit');
assert.equal(bounded.speed, 0, 'forward motion into the soft boundary should be stopped');
console.log(`[scene validation] ${scene.totalTriangles.toLocaleString()} triangles, ${scene.totalNodes.toLocaleString()} BVH nodes, ${scene.lights.length} area lights; throttle, reverse, steering, and boundary checks passed`);
