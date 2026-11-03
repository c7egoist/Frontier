import {
  WorldField, bakeHeightmap, buildTerrainMesh, extractCoastline, DEFAULT_WORLD,
  pointInPolygon, coastSignedDistance, sampleBake, type ContinentShape,
} from '../src/core/terrain.ts';
import { MERIDIAN, VESPER, THULE, GULFS } from '../src/world/presets.ts';
import { check, report } from './harness.ts';

console.log('World field');
const field = new WorldField({ ...DEFAULT_WORLD, gridSize: 256 }, [MERIDIAN, VESPER, THULE], [...GULFS]);
const t0 = Date.now();
const bake = bakeHeightmap(field, 256);
const bakeMs = Date.now() - t0;
console.log(`  baked 256² in ${bakeMs} ms (${(256 * 256 / bakeMs).toFixed(0)}k cells/s)`);

check('world spans 10,000 km', DEFAULT_WORLD.worldSize === 10_000_000);
check('bake has ocean and land', bake.min < -2000 && bake.max > 1000,
  `min ${bake.min.toFixed(0)} m, max ${bake.max.toFixed(0)} m`);
check('land fraction plausible for a world map', bake.landFraction > 0.12 && bake.landFraction < 0.5,
  `${(bake.landFraction * 100).toFixed(1)}% land`);
check('coast distance is negative inland and positive offshore',
  coastSignedDistance(0.42, 0.52, MERIDIAN, 1e7) < 0 && coastSignedDistance(0.05, 0.05, MERIDIAN, 1e7) > 0);
check('polygon test respects the outline', pointInPolygon(0.42, 0.52, MERIDIAN.ring) && !pointInPolygon(0.05, 0.05, MERIDIAN.ring));

console.log('SDF -> mesh');
const mesh = buildTerrainMesh(bake, { stride: 2 });
check('mesh is built from the SDF', mesh.positions.length > 0 && mesh.triangleCount > 1000,
  `${mesh.triangleCount.toLocaleString()} triangles, ${(mesh.positions.length / 3).toLocaleString()} vertices`);
check('mesh normals are unit length', (() => {
  for (let i = 0; i < Math.min(mesh.normals.length, 3000); i += 3) {
    const l = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
    if (Math.abs(l - 1) > 1e-4) return false;
  }
  return true;
})());
let maxY = -Infinity, minY = Infinity;
for (const y of mesh.heights) { if (y > maxY) maxY = y; if (y < minY) minY = y; }
check('mesh vertex heights match the bake', Math.abs(maxY - bake.max) < 400 && Math.abs(minY - bake.min) < 400,
  `mesh ${minY.toFixed(0)}..${maxY.toFixed(0)} m vs bake ${bake.min.toFixed(0)}..${bake.max.toFixed(0)} m`);

console.log('Coastline');
const coast = extractCoastline(bake);
const longest = coast.reduce((m, c) => Math.max(m, c.points.length), 0);
check('coastline contours exist', coast.length > 0 && longest > 20,
  `${coast.length} rings, longest ${longest} points`);

console.log('Brushes');
const sculpted = new WorldField({ ...DEFAULT_WORLD, gridSize: 128 }, [MERIDIAN, VESPER, THULE], []);
const before = sampleBake(bakeHeightmap(sculpted, 128), 0, 0);
sculpted.addOp({ kind: 'raise', x: 0, z: 0, radius: 300_000, strength: 1200, falloff: 0.6 });
const after = sampleBake(bakeHeightmap(sculpted, 128), 0, 0);
check('raise brush adds height', after > before + 1000, `${before.toFixed(0)} -> ${after.toFixed(0)} m at the brush centre`);
sculpted.addOp({ kind: 'gulf', x: 900_000, z: 900_000, radius: 500_000, strength: 0.9 });
const gulfBake = bakeHeightmap(sculpted, 128);
const gulfH = sampleBake(gulfBake, 900_000, 900_000);
check('gulf brush pushes terrain below sea level', gulfH < 0, `${gulfH.toFixed(0)} m at the gulf centre`);
sculpted.addOp({ kind: 'flatten', x: -420_000, z: 260_000, radius: 60_000, strength: 0.95, target: 120 });
const flat = bakeHeightmap(sculpted, 512);
const a = sampleBake(flat, -440_000, 260_000), b = sampleBake(flat, -400_000, 260_000);
check('flatten brush levels a city pad', Math.abs(a - b) < 40 && Math.abs(a - 120) < 60, `${a.toFixed(0)} m vs ${b.toFixed(0)} m across 40 km, target 120 m`);
report();
