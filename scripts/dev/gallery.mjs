// Builds the curated preview gallery in shots/ (textured software renders).
import { installDomStub, loadCanvasBackend } from '../dom-stub.mjs';
installDomStub();
await loadCanvasBackend();
import * as THREE from 'three';
import path from 'node:path';
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');
const { renderToPNG } = await import('../render.mjs');

const gen = new BuildingGenerator(new MaterialLibrary());
const shots = [
  ['machiya', 'machiya', 'g1'],
  ['ramen', 'showa', 'g2'],
  ['temple', 'temple', 'g3'],
  ['shrine', 'edo', 'g4'],
  ['teahouse', 'bamboo', 'g5'],
  ['pagoda', 'lacquer', 'g6'],
  ['ryokan', 'imperial', 'g7'],
  ['konbini', 'citypop', 'g8'],
  ['arcade', 'neonDistrict', 'g9'],
  ['apartment', 'whitewash', 'g10'],
  ['office', 'neonDistrict', 'g11'],
  ['house', 'bamboo', 'g12'],
  ['shop', 'machiya', 'g13'],
  ['factory', 'whitewash', 'g14'],
  ['tower', 'imperial', 'g15'],
];
for (const [type, theme, seed] of shots) {
  const { group, info } = gen.generate(paramsFor(type, { seed, theme, detail: 2, groundStyle: 'street' }));
  const b = info.bounds;
  const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  const radius = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 0.5;
  const dir = new THREE.Vector3(0.7, 0.4, 1).normalize();
  const cam = center.clone().addScaledVector(dir, (radius / Math.tan((38 * Math.PI) / 360)) * 1.1);
  const file = path.resolve(`shots/hero-${type}.png`);
  renderToPNG(group, file, {
    width: 1000, height: 660, fov: 38, background: true,
    cameraPos: [cam.x, Math.max(cam.y, 0.7), cam.z],
    target: [center.x, center.y * 0.97, center.z],
    lightDir: [0.48, 0.8, 0.42], ambient: 0.44,
  });
  console.log(`  hero-${type}.png  ${info.floors}f  tris=${info.triangles}  “${info.name}”`);
}
