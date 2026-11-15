// Headless checks for Geometry Compile and the Component Viewer model:
//   node Experimental/ComponentViewer/Scripts/CheckComponentViewer.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readGeometry, readObj, readStl, readPly, readGlb, readFacet } from '../Engine/ImportFormats.js';
import { convertSource, analyseTopology, cornerNormals, fitCollision, computeBounds } from '../Engine/MeshAnalysis.js';
import { createAsset, compileAll, invalidate, isCompiled, staleSteps, runStep } from '../CompileSteps.js';
import { bakeSdf } from '../Engine/SdfBake.js';
import { buildClusterHierarchy } from '../Engine/ClusterHierarchy.js';
import { constructSource } from '../Engine/SourceGeometry.js';
import {
  createBlueprint, addComponent, attachComponent, removeComponent, duplicateComponent, renameComponent, findComponent, childrenOf,
  validateBlueprint, sampleCurve, stepDrive, createDriveState, createComponent, VEHICLE_SHEET,
} from '../Blueprint.js';

const here = dirname(fileURLToPath(import.meta.url));
const models = join(here, '..', 'Models');
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };
const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

const CUBE_OBJ = `# cube\nv -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nusemtl a\nf 1 4 3 2\nf 5 6 7 8\nusemtl b\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n`;

const ctx = {
  sdfWorker: async (r) => bakeSdf(r.positions, r.indices, { resolution: r.resolution, band: r.band }),
  lodWorker: async (r) => buildClusterHierarchy(r.positions, r.indices, r.build),
  renderIcon: async () => 'data:image/png;base64,stub',
};

console.log('Geometry Compile');

await test('OBJ reader fan-triangulates quads and keeps usemtl slots', () => {
  const raw = readObj(CUBE_OBJ);
  assert.equal(raw.indices.length / 3, 12);
  assert.deepEqual(raw.slotNames, ['a', 'b']);
  assert.equal(raw.families.filter((f) => f === 1).length, 8);
});

await test('STL binary + ASCII, PLY ASCII + binary, GLB readers produce triangles', () => {
  const tri = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const stl = new ArrayBuffer(84 + 50);
  const v = new DataView(stl);
  v.setUint32(80, 1, true);
  tri.forEach((x, i) => v.setFloat32(84 + 12 + i * 4, x, true));
  assert.equal(readStl(stl).indices.length, 3);
  const ascii = new TextEncoder().encode('solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n');
  assert.equal(readStl(buf(ascii)).positions.length, 9);
  const plyA = new TextEncoder().encode('ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n1 1 0\n0 1 0\n4 0 1 2 3\n');
  assert.equal(readPly(buf(plyA)).indices.length, 6);
  const head = new TextEncoder().encode('ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n');
  const body = new ArrayBuffer(36 + 1 + 12);
  const bv = new DataView(body);
  tri.forEach((x, i) => bv.setFloat32(i * 4, x, true));
  bv.setUint8(36, 3); [0, 1, 2].forEach((x, i) => bv.setInt32(37 + i * 4, x, true));
  const plyB = new Uint8Array(head.length + body.byteLength); plyB.set(head); plyB.set(new Uint8Array(body), head.length);
  assert.equal(readPly(plyB.buffer).indices.length, 3);
  // Minimal GLB: one triangle, node translated by +2 in X.
  const bin = new ArrayBuffer(36); const fv = new Float32Array(bin); fv.set(tri);
  const json = { asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [2, 0, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }], bufferViews: [{ buffer: 0, byteLength: 36 }], buffers: [{ byteLength: 36 }] };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const jsPad = Math.ceil(js.length / 4) * 4; const jsc = new Uint8Array(jsPad).fill(0x20); jsc.set(js); js = jsc;
  const glb = new ArrayBuffer(12 + 8 + js.length + 8 + 36); const gv = new DataView(glb);
  gv.setUint32(0, 0x46546c67, true); gv.setUint32(4, 2, true); gv.setUint32(8, glb.byteLength, true);
  gv.setUint32(12, js.length, true); gv.setUint32(16, 0x4e4f534a, true); new Uint8Array(glb, 20, js.length).set(js);
  gv.setUint32(20 + js.length, 36, true); gv.setUint32(24 + js.length, 0x004e4942, true); new Uint8Array(glb, 28 + js.length, 36).set(new Uint8Array(bin));
  const g = readGlb(glb);
  assert.equal(g.indices.length, 3);
  assert.equal(g.positions[0], 2);
  assert.throws(() => readGeometry('car.fbx', new ArrayBuffer(4)), /no reader/);
});

await test('FCT1 ControlVehicle streams decode with their authored counts', () => {
  const body = readFacet(buf(readFileSync(join(models, 'ControlVehicleBody.facet'))));
  const tyre = readFacet(buf(readFileSync(join(models, 'ControlVehicleTyre.facet'))));
  const rim = readFacet(buf(readFileSync(join(models, 'ControlVehicleRim.facet'))));
  assert.equal(body.indices.length / 3, 2924); assert.equal(body.positions.length / 3, 1492);
  assert.equal(tyre.indices.length / 3, 3968); assert.equal(rim.indices.length / 3, 1568);
  assert.ok(body.families.includes(6) && body.families.includes(13));
});

await test('Units and Z-up conversion: body becomes 6.22 m long, 1.46 m tall, Y-up', () => {
  const raw = readFacet(buf(readFileSync(join(models, 'ControlVehicleBody.facet'))));
  const s = convertSource(raw, { unit: 'm', up: 'z' });
  const b = computeBounds(s.positions);
  assert.ok(Math.abs(b.size[0] - 6.2202) < 1e-3);
  assert.ok(Math.abs(b.size[1] - 1.4574) < 1e-3, `height ${b.size[1]}`);
  assert.ok(Math.abs(b.size[2] - 2.4996) < 1e-3);
  assert.equal(s.families.length, s.indices.length / 3);
  const cm = convertSource(raw, { unit: 'cm', up: 'z' });
  assert.ok(Math.abs(computeBounds(cm.positions).size[0] - 0.062202) < 1e-5);
});

await test('Topology: welded cube is closed; loose STL triangles weld only with a tolerance', () => {
  const cube = convertSource(readObj(CUBE_OBJ));
  const t = analyseTopology(cube.indices, cube.positions.length / 3);
  assert.ok(t.closed); assert.equal(t.boundary, 0); assert.equal(t.parts, 1);
  const quad = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1.0004, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2, 3, 4, 5]), families: null };
  assert.equal(convertSource(quad, { weld: 0 }).positions.length / 3, 5);
  assert.equal(convertSource(quad, { weld: 0.001 }).positions.length / 3, 4);
});

await test('Corner normals: flat cube faces are axis aligned, angle split keeps cube edges hard', () => {
  const cube = convertSource(readObj(CUBE_OBJ));
  for (const mode of ['flat', 'angle']) {
    const n = cornerNormals(cube.positions, cube.indices, mode, 40);
    for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.max(Math.abs(n[i]), Math.abs(n[i + 1]), Math.abs(n[i + 2])) - 1) < 1e-5, mode);
  }
  const smooth = cornerNormals(cube.positions, cube.indices, 'smooth');
  assert.ok(Math.abs(Math.abs(smooth[0]) - 1) > 0.1, 'smooth normals blend across the corner');
});

await test('Collision fits: box = bounds, sphere encloses all points, capsule along the long axis', () => {
  const p = new Float32Array([-2, -0.5, -0.5, 2, 0.5, 0.5, 0, 0, 0, 1, -0.3, 0.2]);
  const box = fitCollision(p, 'box');
  assert.deepEqual(box.half, [2, 0.5, 0.5]);
  const s = fitCollision(p, 'sphere');
  for (let i = 0; i < p.length; i += 3) assert.ok(Math.hypot(p[i] - s.centre[0], p[i + 1] - s.centre[1], p[i + 2] - s.centre[2]) <= s.radius + 1e-6);
  const c = fitCollision(p, 'capsule');
  assert.equal(c.axis, 0); assert.ok(c.halfHeight > 0);
});

await test('Pipeline compiles a preset end to end; settings invalidate downstream steps only', async () => {
  const src = constructSource('torus', 6000);
  const asset = createAsset({ name: 'Torus', raw: { positions: src.positions, indices: src.indices, families: null, format: 'Procedural' } });
  await compileAll(asset, ctx);
  assert.ok(isCompiled(asset));
  assert.ok(asset.out.uv.layout.charts.length > 1);
  for (const v of asset.out.uv.uvs) assert.ok(v >= -1e-6 && v <= 1 + 1e-6);
  assert.ok(asset.out.sdf.insideShare > 0 && asset.out.sdf.insideShare < 1);
  assert.ok(asset.out.lod.levels.length > 2);
  assert.equal(asset.out.lod.levels[0].triangles, asset.out.geometry.indices.length / 3);
  assert.ok(Math.abs(asset.out.geometry.bounds.lo[1]) < 1e-6, 'floor pivot');
  invalidate(asset, 'uv');
  assert.deepEqual(staleSteps(asset), ['uv']);
  invalidate(asset, 'geometry');
  assert.deepEqual(staleSteps(asset), ['geometry', 'uv', 'sdf', 'lod', 'collision', 'icon']);
  asset.settings.lod.enabled = false;
  invalidate(asset, 'lod');
  await compileAll(asset, ctx);
  assert.equal(asset.steps.lod.state, 'off');
  asset.settings.collision.type = 'sdf';
  invalidate(asset, 'collision');
  await runStep(asset, 'collision', ctx);
  assert.equal(asset.out.collision.resolution, asset.out.sdf.dims);
});

await test('Vehicle body compiles with authored pivot kept (centre: none) and 8 material families', async () => {
  const raw = readFacet(buf(readFileSync(join(models, 'ControlVehicleBody.facet'))));
  const asset = createAsset({ name: 'Body', raw, settings: { source: { up: 'z' }, geometry: { centre: 'none' }, sdf: { enabled: false }, lod: { enabled: false } } });
  await compileAll(asset, ctx);
  assert.ok(Math.abs(asset.out.geometry.bounds.lo[1] - -0.10586) < 1e-4);
  assert.equal(new Set(asset.out.geometry.families).size, 8);
});

console.log('Component Viewer model');

await test('Blueprint tree: add, attach, refuse cycles, delete lifts children', () => {
  const bp = createBlueprint('BP_Test');
  const a = addComponent(bp, 'StaticMesh', { name: 'Body' });
  const b = addComponent(bp, 'StaticMesh', { parentId: a.id, name: 'Wheel' });
  const c = addComponent(bp, 'PointLight', { parentId: b.id });
  assert.equal(b.parent, a.id);
  assert.equal(attachComponent(bp, a.id, c.id), false, 'no cycles');
  assert.equal(attachComponent(bp, bp.rootId, a.id), false, 'root stays root');
  assert.ok(attachComponent(bp, c.id, a.id));
  const vm = addComponent(bp, 'VehicleMovement', { parentId: a.id });
  assert.equal(vm.parent, null, 'actor components have no parent');
  removeComponent(bp, a.id);
  assert.equal(findComponent(bp, b.id).parent, bp.rootId);
  assert.equal(childrenOf(bp, bp.rootId).length, 2);
  const d = duplicateComponent(bp, b.id);
  assert.equal(d.name, 'Wheel1');
  assert.equal(renameComponent(bp, d.id, 'Wheel'), false, 'names are unique');
  assert.ok(renameComponent(bp, d.id, 'Spare'));
});

await test('Validation flags missing meshes, wheel count and a non-increasing torque curve', () => {
  const bp = createBlueprint('BP_V');
  addComponent(bp, 'StaticMesh');
  const vm = addComponent(bp, 'VehicleMovement');
  vm.props.torqueCurve[3][0] = 100;
  const issues = validateBlueprint(bp, new Map());
  assert.ok(issues.some((i) => /no static mesh/.test(i.text)));
  assert.ok(issues.some((i) => /4 expected/.test(i.text)));
  assert.ok(issues.some((i) => i.level === 'error' && /RPM/.test(i.text)));
});

await test('Torque curve interpolation hits authored samples; drive preview accelerates and shifts', () => {
  const vm = createComponent('VehicleMovement').props;
  const [[r0, t0], [r1, t1]] = vm.torqueCurve.slice(4, 6);
  for (const mode of ['linear', 'smooth', 'ease', 'step']) for (const [r, t] of vm.torqueCurve) assert.ok(Math.abs(sampleCurve(vm.torqueCurve, r, mode) - t) < 1e-9, mode);
  assert.ok(Math.abs(sampleCurve(vm.torqueCurve, (r0 + r1) / 2, 'linear') - (t0 + t1) / 2) < 1e-9);
  assert.equal(Math.max(...vm.torqueCurve.map((p) => p[1])), 520);
  const s = createDriveState();
  s.throttle = 1;
  for (let i = 0; i < 600; i++) stepDrive(s, vm, 1 / 60);
  assert.ok(s.speed * 3.6 > 60, `10 s at full throttle reaches ${(s.speed * 3.6).toFixed(0)} km/h`);
  assert.ok(s.gear >= 1, 'upshifted');
  assert.equal(VEHICLE_SHEET.axleMount.length, 4);
});

console.log(`\n${passed} checks passed`);
