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
  lodWorker: async (r) => buildClusterHierarchy(r.positions, r.indices, { ...r.build, families: r.families || null }),
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

// Edge use across every cluster of one level: a crack shows up as a new open edge, a fin as a 3+ edge.
function levelEdges(h, level, vertexCount) {
  const use = new Map();
  for (let c = 0; c < h.clusterCount; c++) {
    if (h.clusterLevel[c] !== level) continue;
    const f = h.clusterFirst[c];
    for (let i = 0; i < h.clusterSize[c]; i += 3) for (let k = 0; k < 3; k++) {
      const a = h.cornerVertex[f + i + k], b = h.cornerVertex[f + i + (k + 1) % 3];
      const key = a < b ? a * vertexCount + b : b * vertexCount + a;
      use.set(key, (use.get(key) || 0) + 1);
    }
  }
  let open = 0, over = 0;
  for (const u of use.values()) { if (u === 1) open++; else if (u > 2) over++; }
  return { open, over };
}

await test('Cluster LOD keeps per-face materials; preserved seams cut colour drift and stay crack-free', () => {
  const src = constructSource('torus', 12000);
  const V = src.positions.length / 3;
  const families = new Uint32Array(src.indices.length / 3);
  for (let t = 0; t < families.length; t++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const a = src.indices[t * 3 + k] * 3; x += src.positions[a]; y += src.positions[a + 1]; z += src.positions[a + 2]; }
    families[t] = ((Math.floor(Math.atan2(z, x) * 3) + 20) % 4) + (y > 0.1 ? 4 : 0);
  }
  const used = new Set(families);
  const plain = buildClusterHierarchy(src.positions, src.indices, { families, preserveMaterials: false });
  const held = buildClusterHierarchy(src.positions, src.indices, { families, preserveMaterials: true });
  const pinned = buildClusterHierarchy(src.positions, src.indices, { families, preserveMaterials: true, pinSeams: true });
  for (const h of [plain, held, pinned]) {
    assert.equal(h.triangleFamily.length, h.cornerVertex.length / 3);
    for (const f of h.triangleFamily) assert.ok(used.has(f), 'every LOD triangle carries a source family');
    for (const L of h.levels) assert.deepEqual(levelEdges(h, L.level, V), { open: 0, over: 0 }, `level ${L.level} watertight`);
  }
  assert.ok([...held.clusterFamily].every((f) => f >= 0), 'preserved: every cluster holds one material');
  assert.ok([...plain.clusterFamily].some((f) => f < 0), 'plain: clusters mix materials');
  // Compare at matched triangle budgets: the preserved build moves far less colour.
  const at = (h, tris) => h.levels.reduce((best, L) => (Math.abs(L.triangles - tris) < Math.abs(best.triangles - tris) ? L : best));
  for (const budget of [3000, 600]) {
    const a = at(plain, budget), b = at(held, budget);
    assert.ok(b.materialError < a.materialError * 0.6, `~${budget} tris: held ${b.materialError} vs plain ${a.materialError}`);
  }
  for (const L of pinned.levels) assert.ok(L.materialError < 0.01, `pinned seams keep colour within 1% (level ${L.level}: ${L.materialError})`);
});

await test('Vehicle body LOD: 8 materials survive every level, level 2 moves under 1% of colour', async () => {
  const raw = readFacet(buf(readFileSync(join(models, 'ControlVehicleBody.facet'))));
  const asset = createAsset({ name: 'Body', raw, settings: { source: { up: 'z' }, geometry: { centre: 'none' }, sdf: { enabled: false } } });
  await compileAll(asset, ctx);
  const h = asset.out.lod;
  assert.equal(h.materialFamilies, 8);
  assert.ok(h.preserveMaterials);
  assert.ok(h.levels[2].materialError < 0.01, `L2 drift ${h.levels[2].materialError}`);
  for (let L = 0; L < h.levels.length; L++) {
    const fams = new Set();
    for (let c = 0; c < h.clusterCount; c++) if (h.clusterLevel[c] === L) fams.add(h.clusterFamily[c]);
    assert.equal(fams.size, 8, `level ${L} keeps all 8 materials`);
  }
  const V = asset.out.geometry.positions.length / 3;
  const base = levelEdges(h, 0, V);
  for (const L of h.levels) { const e = levelEdges(h, L.level, V); assert.ok(e.open <= base.open && e.over <= base.over, `level ${L.level} adds no cracks`); }
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

await test('Glide camera: framing fits the bounds, flights take the short way round and settle, dolly zoom keeps the subject size', async () => {
  globalThis.addEventListener ??= () => {};
  const THREE = await import('../Vendor/three.esm.min.js');
  const { CameraRig } = await import('../Camera.js');
  const dom = { addEventListener() {}, clientHeight: 600, setPointerCapture() {} };
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 100);
  const rig = new CameraRig(camera, dom);
  const box = new THREE.Box3(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 1.5, 1));
  rig.frame(box, { yaw: 170, pitch: 20, animate: false });
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const half = THREE.MathUtils.degToRad(camera.fov) / 2;
  assert.ok(Math.abs(Math.sin(half) * rig.distance / 1.12 - sphere.radius) < 1e-6, 'bounding sphere fits the vertical fov with 12% margin');
  assert.ok(camera.position.distanceTo(sphere.center) - rig.distance < 1e-6);
  rig.flyTo({ yaw: THREE.MathUtils.degToRad(-170) }, { duration: 0.5 });
  let maxStep = 0, last = rig.yaw;
  for (let i = 0; i < 40; i++) { rig.update(1 / 60); maxStep = Math.max(maxStep, Math.abs(rig.yaw - last)); last = rig.yaw; }
  assert.ok(Math.abs(rig.yaw - THREE.MathUtils.degToRad(190)) < 1e-6, 'went 20° through 180°, not 340° back');
  assert.ok(maxStep < THREE.MathUtils.degToRad(2), 'eased: no frame jumps more than 2°');
  const size = () => rig.goal.distance * Math.tan(THREE.MathUtils.degToRad(2 * Math.atan(12 / rig.goal.focal) * 180 / Math.PI) / 2);
  const s0 = size();
  rig.dollyZoom(85); assert.ok(Math.abs(size() - s0) < 1e-9, 'subject height at the pivot unchanged at 85 mm');
  rig.dollyZoom(14); assert.ok(Math.abs(size() - s0) < 1e-9, 'and at 14 mm');
  for (let i = 0; i < 240; i++) rig.update(1 / 60);
  assert.ok(Math.abs(rig.focal - 14) < 1e-3 && Math.abs(camera.fov - 2 * Math.atan(12 / 14) * 180 / Math.PI) < 0.01, 'springs settle on the goal lens');
});

await test('Density view: smaller triangles map to the hot end of the ramp', async () => {
  const { densityColors } = await import('../Visuals.js');
  const tri = (s, x) => [x, 0, 0, x + s, 0, 0, x, s, 0];
  const colors = densityColors(new Float32Array([...tri(0.01, 0), ...tri(0.1, 1), ...tri(1, 2)]));
  const red = (t) => colors[t * 9], blue = (t) => colors[t * 9 + 2];
  assert.ok(red(0) > blue(0) && blue(2) > red(2), 'dense is red, sparse is blue');
  assert.ok(red(0) > red(1) && red(1) > red(2));
});

console.log(`\n${passed} checks passed`);
