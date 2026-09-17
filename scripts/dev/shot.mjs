// Dev tool: render one building from several standard angles with auto-framing.
// usage: node scripts/dev/shot.mjs [type] [theme] [seed]
import { installDomStub } from '../dom-stub.mjs';
installDomStub();
import * as THREE from 'three';
import path from 'node:path';
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');
const { renderToPNG } = await import('../render.mjs');

const type = process.argv[2] || 'machiya';
const theme = process.argv[3] || 'machiya';
const seed = process.argv[4] || 'shot';
const gen = new BuildingGenerator(new MaterialLibrary());
const params = paramsFor(type, { seed, theme, detail: 2, groundStyle: process.env.GROUND || 'plot' });
const { group, info } = gen.generate(params);

const b = info.bounds;
const center = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
const size = new THREE.Vector3(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
const radius = Math.max(size.x, size.y, size.z) * 0.5;

const angles = JSON.parse(process.env.ANGLES || '{"front":[0.05,0.3,1],"iso":[0.72,0.55,1],"iso2":[-0.75,0.5,0.9],"top":[0.12,1.3,0.5]}');

for (const [name, dirArr] of Object.entries(angles)) {
  const dir = new THREE.Vector3(...dirArr).normalize();
  const dist = (radius / Math.tan((38 * Math.PI) / 360)) * 1.06;
  const cam = center.clone().addScaledVector(dir, dist);
  const file = path.resolve(`shots/${type}-${name}.png`);
  renderToPNG(group, file, {
    width: 1000,
    height: 680,
    cameraPos: [cam.x, Math.max(cam.y, 0.6), cam.z],
    target: [center.x, center.y * 0.96, center.z],
    fov: 38,
    lightDir: [0.45, 0.78, 0.42],
    ambient: 0.36,
    background: true,
  });
  console.log(`${file}  tris=${info.triangles}`);
}
