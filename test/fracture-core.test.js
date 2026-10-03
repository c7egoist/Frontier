import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCliffNetworks,
  faceArea,
  generateFractureNetwork,
  makeRockPolyhedron,
  networkToJSON,
  polyhedronVolume,
} from '../fracture-core.js';

function sumVolume(pieces) {
  return pieces.reduce((sum, piece) => sum + polyhedronVolume(piece.faces), 0);
}

function assertClosedPolyhedron(faces) {
  const edgeCounts = new Map();
  for (const face of faces) {
    assert.ok(face.points.length >= 3);
    for (let index = 0; index < face.points.length; index += 1) {
      const start = face.points[index];
      const end = face.points[(index + 1) % face.points.length];
      const a = [start.x, start.y, start.z].map((value) => value.toFixed(5)).join(',');
      const b = [end.x, end.y, end.z].map((value) => value.toFixed(5)).join(',');
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edgeCounts.values()].every((count) => count === 2), 'each polyhedral edge must be shared by exactly two faces');
}

test('same seed and parameters produce identical 3D crack geometry', () => {
  const outline = makeRockPolyhedron(2417);
  const options = { seed: 2417, density: 58, wander: 48, angle: -8 };
  const first = generateFractureNetwork(outline, options);
  const second = generateFractureNetwork(outline, options);

  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.finalPieces, second.finalPieces);
});

test('sequential plane cuts create closed 3D polyhedra and conserve volume', () => {
  const outline = makeRockPolyhedron(51);
  const network = generateFractureNetwork(outline, { seed: 51, density: 78, wander: 71, angle: 13 });

  assert.ok(network.events.length >= 5, `expected multiple joint planes, got ${network.events.length}`);
  assert.equal(network.states.length, network.events.length + 1);
  assert.equal(network.finalPieces.length, network.events.length + 1);

  for (const piece of network.finalPieces) assertClosedPolyhedron(piece.faces);
  const fragmentVolume = sumVolume(network.finalPieces);
  assert.ok(Math.abs(network.rootVolume - fragmentVolume) / network.rootVolume < 1e-8, 'fragments must conserve the source rock volume');
});

test('each joint is an explicit 3D plane face with a surface trace', () => {
  const network = generateFractureNetwork(makeRockPolyhedron(123), { seed: 123, density: 68, wander: 85, angle: -19 });

  assert.ok(network.events.length > 0);
  for (const event of network.events) {
    assert.ok(event.cap.length >= 3);
    assert.ok(faceArea(event.cap) > 0);
    assert.ok(Math.abs(Math.hypot(event.normal.x, event.normal.y, event.normal.z) - 1) < 1e-8);
    assert.ok(event.surfaceSegments.length > 0);
    assert.ok(event.kind === 'primary' || event.kind === 'secondary' || event.kind === 'abutting');
  }
});

test('cliff stack fractures independent 3D rocks and keeps each rock volume', () => {
  const networks = buildCliffNetworks({ seed: 17, density: 58, wander: 48, angle: -8 });

  assert.equal(networks.length, 6);
  assert.ok(networks.every((network) => network.transform.position.length === 3));
  for (const network of networks) {
    assert.ok(network.events.length >= 2);
    assert.ok(Math.abs(network.rootVolume - sumVolume(network.finalPieces)) / network.rootVolume < 1e-8);
  }
});

test('export includes true 3D vertices, fracture faces, and plane normals', () => {
  const network = generateFractureNetwork(makeRockPolyhedron(9), { seed: 9, density: 44 });
  const payload = networkToJSON(network);

  assert.equal(payload.seed, 9);
  assert.equal(payload.fragments.length, network.finalPieces.length);
  assert.equal(payload.joints.length, network.events.length);
  assert.ok(payload.fragments.every((fragment) => fragment.faces.every((face) => face.vertices.every((point) => point.length === 3))));
  assert.ok(payload.joints.every((joint) => joint.planeNormal.length === 3 && joint.fractureFace.length >= 3));
});
