// Full textured software render of one building (verifies materials + UVs end to end).
import { installDomStub, loadCanvasBackend } from '../dom-stub.mjs';
installDomStub();
await loadCanvasBackend();
import * as THREE from 'three';
import path from 'node:path';
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');
const { renderToPNG } = await import('../render.mjs');

const type = process.argv[2] || 'machiya';
const theme = process.argv[3] || 'machiya';
const seed = process.argv[4] || 'hero';
const gen = new BuildingGenerator(new MaterialLibrary());
const { group, info } = gen.generate(paramsFor(type, { seed, theme, detail: 2, groundStyle: 'street' }));
const b = info.bounds;
const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
const radius = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 0.5;
const angles = JSON.parse(process.env.ANGLES || '{"iso":[0.7,0.42,1],"front":[0,0.22,1]}');
for (const [name, d] of Object.entries(angles)) {
  const dir = new THREE.Vector3(...d).normalize();
  const cam = center.clone().addScaledVector(dir, (radius / Math.tan((38 * Math.PI) / 360)) * 1.09);
  renderToPNG(group, path.resolve(`shots/tex-${type}-${name}.png`), {
    width: 1000, height: 680, fov: 38,
    cameraPos: [cam.x, Math.max(cam.y, 0.7), cam.z], target: [center.x, center.y * 0.97, center.z],
    lightDir: [0.5, 0.8, 0.42], ambient: 0.44,
  });
  console.log(`shots/tex-${type}-${name}.png  tris=${info.triangles}  ${name}=“${info.name}”`);
}
