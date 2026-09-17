import { installDomStub, loadCanvasBackend } from '../dom-stub.mjs';
installDomStub();
await loadCanvasBackend();
import * as THREE from 'three';
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');
const { renderToPNG } = await import('../render.mjs');
const gen = new BuildingGenerator(new MaterialLibrary());
for (const roofType of ['gable', 'hip', 'irimoya', 'pyramid', 'tiered', 'shed', 'flat']) {
  const { group, info } = gen.generate(paramsFor('teahouse', { seed: 'rm', roofType, detail: 2, groundStyle: 'plot', floors: roofType === 'tiered' ? 4 : 2 }));
  const b = info.bounds;
  const c = new THREE.Vector3((b.min[0]+b.max[0])/2, (b.min[1]+b.max[1])/2, (b.min[2]+b.max[2])/2);
  const r = Math.max(b.max[0]-b.min[0], b.max[1]-b.min[1], b.max[2]-b.min[2]) * 0.5;
  const d = new THREE.Vector3(0.7, 0.45, 1).normalize();
  const cam = c.clone().addScaledVector(d, (r / Math.tan((38*Math.PI)/360)) * 1.12);
  renderToPNG(group, `/home/user/Frontier/shots/test/roof-${roofType}.png`, { width: 620, height: 440, cameraPos: [cam.x, Math.max(cam.y,0.7), cam.z], target: [c.x, c.y*0.97, c.z], fov: 38, ambient: 0.45, background: true });
  console.log('roof-' + roofType, info.triangles);
}
