// Textured render of a street row (checks scale, spacing and variety in context).
import { installDomStub, loadCanvasBackend } from '../dom-stub.mjs';
installDomStub();
await loadCanvasBackend();
import * as THREE from 'three';
import path from 'node:path';
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');
const { renderToPNG } = await import('../render.mjs');

const gen = new BuildingGenerator(new MaterialLibrary());
const types = ['machiya', 'shop', 'ramen', 'house', 'apartment', 'office', 'konbini', 'teahouse', 'ryokan', 'arcade'];
const row = new THREE.Group();
let cursor = 0;
const meta = [];
for (let i = 0; i < types.length; i++) {
  const p = paramsFor(types[i], { seed: `row-${i}`, detail: 2, ground: false, groundStyle: 'none', pole: i % 2 === 0 });
  p.width *= 0.9 + (i % 3) * 0.1;
  const { group, info } = gen.generate(p);
  group.position.set(cursor + p.width / 2, 0, -p.depth / 2);
  row.add(group);
  meta.push(`${types[i]}(${info.floors}f)`);
  cursor += p.width + 1.6;
}
console.log(meta.join('  '), '| row width', cursor.toFixed(1), 'm');
const mid = cursor / 2;
const cam = new THREE.Vector3(mid + cursor * 0.2, 15, 40);
renderToPNG(row, path.resolve('shots/street-hero.png'), {
  width: 1500, height: 640, fov: 40, background: true,
  cameraPos: [cam.x, cam.y, cam.z], target: [mid, 6, 0], ambient: 0.44,
  lightDir: [0.42, 0.78, 0.45],
});
console.log('shots/street-hero.png written');
