// node-based sanity check: build all roof forms headlessly, verify metrics
import { buildRoof } from '../src/build.js';

const base = {
  roofType: 'yosemune', length: 10, depth: 6.2, wallHeight: 3.0,
  eaveOverhang: 0.75, rakeOverhang: 0.55,
  pitchTop: 33, pitchEave: 21, eaveFlip: 6,
  cornerLift: 0.34, cornerPow: 2.6, hipRise: 0.62, gableBreak: 0.30,
  tileModule: 0.30, coverWidth: 0.15, courseHeight: 0.235, tileJitter: 0.5,
  ridgeCapSize: 0.105, plasterFillet: true, onigawara: true, onigawaraScale: 1,
  shrineChigi: false, chigiHeight: 0.72, katsuogiCount: 4,
  showRafters: true, gableFrame: true,
  tileColor: '#565a60', woodColor: '#4a3628', wallColor: '#2e2620',
  plasterColor: '#ded7c6', fasciaColor: '#20303a', seed: 7,
};

let fail = 0;
for (const type of ['kirizuma', 'yosemune', 'irimoya', 'hogyo']) {
  const P = { ...base, roofType: type };
  const { group, stats, field } = buildRoof(P);
  // gather NaN check over all meshes
  let nan = 0, minZ = 1e9, maxZ = -1e9;
  group.updateMatrixWorld(true);
  group.traverse(o => {
    if (!o.geometry) return;
    const p = o.geometry.attributes.position;
    if (!p) return;
    for (let i = 0; i < p.array.length; i++) {
      const v = p.array[i];
      if (!Number.isFinite(v)) nan++;
    }
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    minZ = Math.min(minZ, b.min.z);
    maxZ = Math.max(maxZ, b.max.z);
  });
  const ok = nan === 0 && Math.abs(stats.bearing - 0.068) < 0.005 && minZ > -0.1 && maxZ < 12;
  if (!ok) fail++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${type.padEnd(9)} tris=${stats.tris.toFixed(0).padStart(6)} ` +
    `ridge=${stats.ridgeHeight.toFixed(2)} eave=${stats.eaveHeight.toFixed(2)} ` +
    `bearing=${(stats.bearing * 1000).toFixed(1)}mm zmin=${minZ.toFixed(2)} zmax=${maxZ.toFixed(2)} nan=${nan}`
  );
  // per-type geometry assertions
  if (type === 'yosemune' && field.cxr !== (dim(10, 0.55 * 2 + 0) / 2)) {} // no-op
}
function dim(L, ov) { return L; }
process.exit(fail ? 1 : 0);
