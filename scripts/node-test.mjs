// Headless generator verification: runs the full procedural graph in Node with a
// DOM stub, checks every building type / roof form / tile / detail level, verifies
// determinism and geometry sanity, and writes software-rendered PNG previews.
import { installDomStub, loadCanvasBackend } from './dom-stub.mjs';
installDomStub();
// use the real (napi) canvas so procedural textures + GLB image export work
await loadCanvasBackend();

import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { renderToPNG } from './render.mjs';

const { BuildingGenerator, paramsFor, DEFAULT_PARAMS, TYPE_PRESETS } = await import('../src/lib/building.js');
const { MaterialLibrary } = await import('../src/lib/materials.js');
const { BUILDING_TYPES, PALETTE_KEYS } = await import('../src/data/names.js');
const { TILE_TYPES } = await import('../src/lib/roofs.js');

// automated previews go to shots/test/ ; the curated gallery in shots/ is produced
// by the dev tools (scripts/dev/textured-shot.mjs, street-shot.mjs)
const OUT = path.resolve('shots/test');
fs.mkdirSync(OUT, { recursive: true });

const lib = new MaterialLibrary();
const gen = new BuildingGenerator(lib);

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log('  ✗ ' + msg);
};

function sanity(info, group, label) {
  let bad = 0;
  let tris = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (!Number.isFinite(p.getX(i)) || !Number.isFinite(p.getY(i)) || !Number.isFinite(p.getZ(i))) {
        bad++;
        break;
      }
    }
    tris += Math.floor((o.geometry.index ? o.geometry.index.count : p.count) / 3);
  });
  const box = new THREE.Box3().setFromObject(group);
  if (bad) fail(`${label}: ${bad} mesh(es) with NaN vertices`);
  if (tris === 0) fail(`${label}: no geometry produced`);
  if (!box.isEmpty()) {
    const s = box.getSize(new THREE.Vector3());
    if (s.y < 1.5) fail(`${label}: suspiciously short (${s.y.toFixed(2)}m)`);
    if (s.x > 200 || s.z > 200) fail(`${label}: runaway extents ${s.x.toFixed(1)}x${s.z.toFixed(1)}`);
    if (box.min.y < -3) fail(`${label}: geometry far below ground (${box.min.y.toFixed(2)})`);
  }
  return { tris, box, bad };
}

console.log('\n=== 1. every building type (detail 2) ===');
const typeRows = [];
for (const type of BUILDING_TYPES) {
  try {
    const t0 = performance.now();
    const p = paramsFor(type, { seed: `t-${type}`, detail: 2 });
    const { group, info, lights } = gen.generate(p);
    const ms = performance.now() - t0;
    const { tris, box } = sanity(info, group, type);
    typeRows.push({ type, tris, ms, lights: lights.length, h: info.height, name: info.name });
    console.log(
      `  ✓ ${type.padEnd(10)} tris=${String(tris).padStart(7)}  h=${info.height.toFixed(1).padStart(5)}m  floors=${info.floors}  lights=${String(lights.length).padStart(2)}  ${ms.toFixed(0)}ms  “${info.name}”`
    );
  } catch (e) {
    fail(`${type}: ${e.message}\n     ${(e.stack || '').split('\n').slice(1, 3).join('\n     ')}`);
  }
}

console.log('\n=== 2. roof form × tile type ===');
let roofOk = 0;
let roofTotal = 0;
for (const roofType of ['gable', 'hip', 'irimoya', 'pyramid', 'tiered', 'shed', 'flat', 'skirt']) {
  const row = [];
  for (const tile of TILE_TYPES) {
    roofTotal++;
    try {
      const p = paramsFor('machiya', { seed: `r-${roofType}-${tile}`, roofType, roofTile: tile, detail: 2, floors: 3 });
      const { group, info } = gen.generate(p);
      sanity(info, group, `${roofType}/${tile}`);
      roofOk++;
      row.push(`${tile}:${info.triangles}`);
    } catch (e) {
      fail(`roof ${roofType}/${tile}: ${e.message}`);
    }
  }
  console.log(`  ${roofType.padEnd(9)} ${row.join('  ')}`);
}
console.log(`  → ${roofOk}/${roofTotal} roof+tile combinations built`);

console.log('\n=== 3. all themes × detail levels ===');
for (const theme of PALETTE_KEYS) {
  try {
    const { info, group } = gen.generate(paramsFor('shop', { seed: `th-${theme}`, theme, detail: 2 }));
    sanity(info, group, theme);
  } catch (e) {
    fail(`theme ${theme}: ${e.message}`);
  }
}
console.log(`  ✓ ${PALETTE_KEYS.length} themes ok`);
const detailRows = [];
for (const detail of [0, 1, 2, 3]) {
  const t0 = performance.now();
  const { info, group } = gen.generate(paramsFor('temple', { seed: `d-${detail}`, detail }));
  sanity(info, group, `detail${detail}`);
  detailRows.push({ detail, tris: info.triangles, ms: +(performance.now() - t0).toFixed(0) });
}
console.log('  detail levels:', detailRows.map((d) => `d${d.detail}: ${d.tris} tris/${d.ms}ms`).join('  '));

console.log('\n=== 4. determinism + edge cases ===');
const s1 = gen.generate(paramsFor('shop', { seed: 'same-seed', detail: 2 }));
const s2 = gen.generate(paramsFor('shop', { seed: 'same-seed', detail: 2 }));
console.log(`  same seed → identical triangle count: ${s1.info.triangles === s2.info.triangles} (${s1.info.triangles})`);
if (s1.info.triangles !== s2.info.triangles) fail('determinism: same seed produced different geometry');
const s3 = gen.generate(paramsFor('shop', { seed: 'other-seed', detail: 2 }));
console.log(`  different seed → different result: ${s1.info.triangles !== s3.info.triangles}`);
const edges = [
  ['1 floor, tiny', { type: 'machiya', floors: 1, width: 3, depth: 3, seed: 'e1' }],
  ['12 floors', { type: 'office', floors: 12, seed: 'e2' }],
  ['no roof tile', { type: 'shop', roofTile: 'slate', seed: 'e3' }],
  ['everything off', { type: 'house', windows: false, balcony: false, plants: false, crates: false, seating: false, pole: false, vending: false, lanterns: false, shopfront: false, seed: 'e4' }],
  ['everything on', {
    type: 'shop', neon: true, lanterns: true, posters: true, posterCount: 8, tanzaku: true, torii: true,
    boundaryWall: true, solar: true, waterTank: true, antenna: true, roofRail: true, vending: true,
    bicycles: true, crates: true, plants: true, seating: true, parasol: true, mailbox: true, fireBox: true,
    detail: 3, seed: 'e5',
  }],
  ['zero curve', { type: 'temple', roofCurve: 0, seed: 'e6' }],
  ['max curve', { type: 'temple', roofCurve: 1, seed: 'e7' }],
  ['user signage text', { type: 'ramen', name: '一風堂 拉麺', nameSub: 'IPPUDO', seed: 'e8', signs: { main: '一風堂', side: '拉麺', neon: '24時間営業', banner: '大盛無料', lantern: '麺', aboard: '本日のおすすめ', posterTitle: '求人募集', posterBody: 'スタッフ募集\n経験不問\n時給1200円', menu: 'お品書き' } }],
];
for (const [label, params] of edges) {
  try {
    const { info, group } = gen.generate({ ...DEFAULT_PARAMS, ...params });
    sanity(info, group, label);
    console.log(`  ✓ ${label.padEnd(18)} tris=${String(info.triangles).padStart(7)} name=“${info.name}”`);
  } catch (e) {
    fail(`${label}: ${e.message}`);
  }
}

console.log('\n=== 5. software-rendered previews ===');
const views = [
  ['hero-machiya', ['machiya', { theme: 'machiya', seed: 'hero' }]],
  ['hero-temple', ['temple', { theme: 'temple', seed: 'hero2' }]],
  ['hero-pagoda', ['pagoda', { theme: 'lacquer', seed: 'hero3' }]],
  ['hero-ramen', ['ramen', { theme: 'showa', seed: 'hero4' }]],
  ['hero-konbini', ['konbini', { theme: 'citypop', seed: 'hero5' }]],
  ['hero-ryokan', ['ryokan', { theme: 'edo', seed: 'hero6' }]],
  ['hero-arcade', ['arcade', { theme: 'neonDistrict', seed: 'hero7' }]],
  ['hero-house', ['house', { theme: 'bamboo', seed: 'hero8' }]],
];
for (const [name, [type, over]] of views) {
  const { group, info } = gen.generate(paramsFor(type, { ...over, detail: 2, groundStyle: 'street' }));
  const b = info.bounds;
  const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const radius = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 0.5;
  const dir = new THREE.Vector3(0.72, 0.5, 1).normalize();
  const dist = (radius / Math.tan((38 * Math.PI) / 360)) * 1.08;
  const cam = center.clone().addScaledVector(dir, dist);
  const t0 = performance.now();
  const res = renderToPNG(group, path.join(OUT, `${name}.png`), {
    width: 960, height: 640, background: true,
    cameraPos: [cam.x, Math.max(cam.y, 0.7), cam.z], target: [center.x, center.y * 0.96, center.z], fov: 38,
  });
  console.log(`  ${name}.png  ${res.width}x${res.height}  ${(res.bytes / 1024).toFixed(0)}kB  tris=${info.triangles}  render=${(performance.now() - t0).toFixed(0)}ms`);
}

console.log('\n=== 6. UI panel smoke test ===');
{
  const { buildPanel, getPath, setPath, humanize, rgbToHex } = await import('../src/ui.js');
  const store = { a: { b: 3 }, txt: 'x' };
  if (getPath(store, 'a.b') !== 3) fail('getPath');
  setPath(store, 'a.c.d', 5);
  if (getPath(store, 'a.c.d') !== 5) fail('setPath nested create');
  if (humanize('metal-rib') !== 'Metal Rib') fail('humanize');
  if (rgbToHex('#abc') !== '#aabbcc') fail('rgbToHex short hex');
  const root = document.createElement('div');
  const changes = [];
  const panel = buildPanel(
    root,
    [
      {
        title: 'Test',
        id: 'g1',
        items: [
          { k: 'a.b', t: 'range', min: 0, max: 10, step: 1, label: 'Num' },
          { k: 'flag', t: 'toggle', label: 'Flag' },
          { k: 'mode', t: 'select', label: 'Mode', options: ['x', 'y'] },
          { k: 'txt', t: 'text', label: 'Text' },
          { k: 'col', t: 'color', label: 'Colour' },
          { t: 'chips', k: 'mode', label: 'Chips', options: [{ value: 'x', label: 'X' }] },
          { t: 'buttons', items: [{ label: 'Go', action: 'go' }] },
          { t: 'note', text: 'note' },
        ],
      },
    ],
    {
      get: (p) => getPath(store, p),
      set: (p, v) => setPath(store, p, v),
      resolved: () => '#ff0000',
      onAction: (n) => changes.push(n),
      onChange: (p) => changes.push(p),
    }
  );
  panel.refresh();
  if (root.children.length !== 1) fail('panel did not build a group');
  if (!panel.groups.g1) fail('panel group id missing');
  console.log(`  ✓ panel built ${root.children[0].children[1].children.length} controls, refresh() ok`);
}

console.log('\n=== 7. GLB export (Blender handoff) ===');
{
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  for (const [type, theme] of [['machiya', 'machiya'], ['temple', 'temple'], ['konbini', 'citypop']]) {
    const { group, info } = gen.generate(paramsFor(type, { seed: `glb-${type}`, theme, detail: 2 }));
    const buf = await new Promise((resolve, reject) => {
      new GLTFExporter().parse(group, resolve, reject, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    });
    const dv = new DataView(buf);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    const jsonLen = dv.getUint32(12, true);
    const json = JSON.parse(Buffer.from(buf, 20, jsonLen).toString('utf8'));
    if (magic !== 'glTF' || !json.meshes?.length) fail(`GLB export for ${type}`);
    console.log(
      `  ✓ ${type.padEnd(8)} ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB  meshes=${json.meshes.length} ` +
        `materials=${json.materials.length} baked images=${(json.images || []).length}`
    );
  }
}

console.log('\n=== 8. street row ===');
const street = new THREE.Group();
let cursor = 0;
let streetTris = 0;
const types = ['machiya', 'shop', 'ramen', 'apartment', 'office', 'konbini', 'teahouse', 'ryokan'];
for (let i = 0; i < types.length; i++) {
  const p = paramsFor(types[i], { seed: `street-${i}`, detail: 2, ground: true, groundStyle: 'plot' });
  p.floors = Math.max(1, p.floors + (i % 3) - 1);
  const { group, info } = gen.generate(p);
  group.position.set(cursor + p.width / 2, 0, -p.depth / 2);
  street.add(group);
  cursor += p.width + 1.4;
  streetTris += info.triangles;
}
console.log(`  ${types.length} buildings, ${streetTris} tris, row width ${cursor.toFixed(1)}m`);
{
  // frame the whole row from a slightly elevated three-quarter view
  const mid = cursor / 2;
  const span = cursor * 0.62 + 26;
  const cam = new THREE.Vector3(mid + span * 0.34, span * 0.42, span * 0.72);
  renderToPNG(street, path.join(OUT, 'street-row.png'), {
    width: 1500, height: 620, fov: 36, background: true,
    cameraPos: [cam.x, cam.y, cam.z],
    target: [mid, 7, 0],
    ambient: 0.42,
  });
  console.log('  street-row.png written');
}

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} PROBLEM(S)`}`);
process.exit(failures === 0 ? 0 : 1);
