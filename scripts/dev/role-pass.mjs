import { installDomStub } from '../dom-stub.mjs';
installDomStub();
import * as THREE from 'three';
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');
const { renderToPNG } = await import('../render.mjs');
const gen = new BuildingGenerator(new MaterialLibrary());
const type = process.argv[2] || 'machiya';
const { group, info } = gen.generate(paramsFor(type, { seed: 'role', detail: 2, groundStyle: 'plot' }));
const b = info.bounds;
const center = new THREE.Vector3((b.min[0]+b.max[0])/2, (b.min[1]+b.max[1])/2, (b.min[2]+b.max[2])/2);
const radius = Math.max(b.max[0]-b.min[0], b.max[1]-b.min[1], b.max[2]-b.min[2]) * 0.5;
const dir = new THREE.Vector3(0.72, 0.55, 1).normalize();
const cam = center.clone().addScaledVector(dir, (radius / Math.tan((38*Math.PI)/360)) * 1.06);
renderToPNG(group, `/home/user/Frontier/shots/role-${type}.png`, {
  width: 1000, height: 680, roleColors: true,
  cameraPos: [cam.x, Math.max(cam.y, 0.6), cam.z], target: [center.x, center.y*0.96, center.z], fov: 38, background: true, ambient: 0.95,
});
console.log('role pass written for', type);
