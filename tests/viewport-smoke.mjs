// ---------------------------------------------------------------------------
// viewport-smoke.mjs — headless tests for the pure parts of src/viewport.js
// (patch→geometry conversion and the manual geometry merge, which is the LIVE
// merge path: the vendored three core build has no BufferGeometryUtils).
// Run: node tests/viewport-smoke.mjs
// ---------------------------------------------------------------------------
import { makeTester } from './stubdom.mjs';

const THREE = await import('../vendor/three.module.min.js');
const { demoInterchange } = await import('../src/model.js');
const { buildNetwork } = await import('../src/network.js');
const { patchToGeometry, mergeGeometriesManual, LAYER_SCENE, LAYER_2D, LAYER_3D } = await import('../src/viewport.js');

const { t, eq, group, summary } = makeTester('viewport-smoke');

group('vendored three build');
t('core build has no BufferGeometryUtils (manual merge is the live path)', THREE.BufferGeometryUtils === undefined);
t('layer constants are distinct bits', LAYER_SCENE === 1 && LAYER_2D === 2 && LAYER_3D === 3);

group('patchToGeometry');
const net = buildNetwork(demoInterchange());
const allPatches = [...net.spans.flatMap((s) => s.patches), ...net.junctions.flatMap((j) => j.patches)];
t('demo produces patches', allPatches.length > 50, allPatches.length);
const g0 = patchToGeometry(allPatches[0]);
eq('vertex count = rows*cols', g0.attributes.position.count, allPatches[0].grid.length * allPatches[0].grid[0].length);
eq('two triangles per grid cell', g0.index.count, (allPatches[0].grid.length - 1) * (allPatches[0].grid[0].length - 1) * 6);
t('bounding sphere computed', g0.boundingSphere && g0.boundingSphere.radius > 0);
t('normals computed', g0.attributes.normal && g0.attributes.normal.count === g0.attributes.position.count);
let finite = true;
for (let i = 0; i < g0.attributes.position.array.length; i++) {
  if (!Number.isFinite(g0.attributes.position.array[i])) finite = false;
}
t('all vertices finite', finite);
// winding: every triangle's normal should point up-ish for a road patch (road space Z is up)
{
  const pos = g0.attributes.position.array;
  const idx = g0.index.array;
  let up = 0;
  let total = 0;
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < idx.length; i += 3) {
    a.set(pos[idx[i] * 3], pos[idx[i] * 3 + 1], pos[idx[i] * 3 + 2]);
    b.set(pos[idx[i + 1] * 3], pos[idx[i + 1] * 3 + 1], pos[idx[i + 1] * 3 + 2]);
    c.set(pos[idx[i + 2] * 3], pos[idx[i + 2] * 3 + 1], pos[idx[i + 2] * 3 + 2]);
    n.subVectors(b, a).cross(c.clone().sub(a));
    total++;
    if (n.y > 0) up++;
  }
  t('road patch triangles face up', up / total > 0.9, `${up}/${total}`);
}

group('mergeGeometriesManual');
t('empty input returns null', mergeGeometriesManual([]) === null);
const geos = allPatches.slice(0, 25).map(patchToGeometry);
const merged = mergeGeometriesManual(geos);
const sumVerts = geos.reduce((a, g) => a + g.attributes.position.count, 0);
const sumIdx = geos.reduce((a, g) => a + g.index.count, 0);
eq('merged vertex count = sum of parts', merged.attributes.position.count, sumVerts);
eq('merged index count = sum of parts', merged.index.count, sumIdx);
t('merged has normals', !!merged.attributes.normal);
t('merged has a bounding sphere', merged.boundingSphere && merged.boundingSphere.radius > 0);
let idxOk = true;
for (let i = 0; i < merged.index.count; i++) {
  if (merged.index.array[i] >= merged.attributes.position.count) idxOk = false;
}
t('all indices in range after offsetting', idxOk);
// vertices of the second geometry must appear verbatim in the merged buffer
{
  const off = geos[0].attributes.position.count * 3;
  const src = geos[1].attributes.position.array;
  const dst = merged.attributes.position.array;
  let same = true;
  for (let i = 0; i < src.length; i++) if (src[i] !== dst[off + i]) same = false;
  t('second geometry vertices preserved at the offset', same);
}
// full-network merge (the real renderer path)
const allGeos = allPatches.map(patchToGeometry);
const full = mergeGeometriesManual(allGeos);
eq('full network merge keeps every vertex', full.attributes.position.count, allGeos.reduce((a, g) => a + g.attributes.position.count, 0));
t('full network merge is finite', (() => {
  const arr = full.attributes.position.array;
  for (let i = 0; i < arr.length; i += 997) if (!Number.isFinite(arr[i])) return false;
  return true;
})());
// decal vs solid bucketing key used by setNetwork
{
  const keys = new Set(allPatches.map((p) => `${p.fill_color}|${p.decal ? 1 : 0}`));
  t('patches split into decal + solid buckets', keys.size > 5, keys.size);
  t('markings/paving patches are flagged decal', allPatches.some((p) => p.decal), allPatches.filter((p) => p.decal).length);
}

summary();
