import { installDomStub } from '../dom-stub.mjs';
installDomStub();
import * as THREE from 'three';
const { BuildingGenerator, paramsFor } = await import('../../src/lib/building.js');
const { MaterialLibrary } = await import('../../src/lib/materials.js');
const gen = new BuildingGenerator(new MaterialLibrary());
const type = process.argv[2] || 'machiya';
const { group, info } = gen.generate(paramsFor(type, { seed: 'role', detail: 2, groundStyle: 'plot' }));
console.log('bounds from generator:', JSON.stringify(info.bounds), 'height', info.height.toFixed(1));
const rows = [];
group.traverse((o) => {
  if (!o.isMesh) return;
  o.geometry.computeBoundingBox();
  const bb = o.geometry.boundingBox;
  rows.push({
    name: o.name,
    role: o.material.userData?.role,
    min: [bb.min.x, bb.min.y, bb.min.z].map((v) => +v.toFixed(2)),
    max: [bb.max.x, bb.max.y, bb.max.z].map((v) => +v.toFixed(2)),
    size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => +v.toFixed(2)),
  });
});
rows.sort((a, b) => b.size[1] - a.size[1]);
console.log('\nmesh (sorted by height) — size x/y/z and y-range:');
for (const r of rows) {
  const flag = r.min[1] < -0.6 || r.size[0] > 40 || r.size[2] > 40 ? '  <<< SUSPECT' : '';
  console.log(`  ${r.name.padEnd(22)} [${String(r.role).padEnd(10)}] size=${r.size.join(' × ').padEnd(22)} y=${r.min[1]}..${r.max[1]}${flag}`);
}
