import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createRng } from '../src/core/prng.js';
import { DEFAULT_EROSION_PARAMS } from '../src/erosion/erosion-presets.js';
import { GpuErosionEngine } from '../src/erosion/gpu-erosion-engine.js';
import { TERRAIN_STACK_PRESETS } from '../src/erosion/terrain-stack-presets.js';
import {
  describeWindRegime,
  effectiveWindAzimuthAtStep,
  effectiveWindAzimuthDeg,
  normalizeWindAzimuthDeg,
  normalizeWindShiftMode,
  sampleWindDirectionSequenceDeg,
  windDirectionScheduleDeg,
  windRoseWeightsDeg,
  windShiftModeValue,
} from '../src/erosion/wind-regime.js';
import { buildMacroFormation } from '../src/geology/formations.js';
import { generateRockFormation } from '../src/geology/generator.js';
import { FORMATION_PRESETS, resolveParams } from '../src/geology/presets.js';
import {
  applySdfErosionSuite,
  erodeSdfWithWind,
} from '../src/geology/sdf-erosion-suite.js';
import { createGeologicalSdfEvaluator } from '../src/geology/surface-detail.js';
import { createTectonicField } from '../src/geology/tectonics.js';

function approx(actual, expected, tolerance = 1e-9, message = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message || `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

const SECTOR_CENTRES_DEG = [-180, -135, -90, -45, 0, 45, 90, 135];

function relativeAzimuthDeg(azimuthDeg, prevailingDeg) {
  let rel = normalizeWindAzimuthDeg(azimuthDeg - prevailingDeg);
  if (rel > 180) rel -= 360;
  return rel;
}

function sectorIndexForRelativeDeg(relDeg) {
  return Math.floor((((relDeg + 202.5) % 360) + 360) % 360 / 45) % 8;
}

function sectorCountsForOffsets(offsetsDeg) {
  const counts = new Array(8).fill(0);
  for (const offset of offsetsDeg) counts[sectorIndexForRelativeDeg(offset)]++;
  return counts;
}

function sectorCountsForAzimuths(azimuthsDeg, prevailingDeg) {
  return sectorCountsForOffsets(azimuthsDeg.map((deg) => relativeAzimuthDeg(deg, prevailingDeg)));
}

function angularJumpDeg(a, b) {
  return Math.abs(relativeAzimuthDeg(b, a));
}

function makeDenseSdf(sdfFn, nx, ny, nz, h) {
  const gx = nx + 1, gy = ny + 1, gz = nz + 1;
  const strideY = gx, strideZ = gx * gy;
  const values = new Float32Array(gx * gy * gz);
  for (let iz = 0; iz < gz; iz++) {
    for (let iy = 0; iy < gy; iy++) {
      for (let ix = 0; ix < gx; ix++) {
        values[ix + iy * strideY + iz * strideZ] = sdfFn(ix * h, iy * h, iz * h);
      }
    }
  }
  return {
    nx, ny, nz, gx, gy, gz, strideY, strideZ,
    originX: 0, originY: 0, originZ: 0,
    voxelSize: h,
    values,
    ensureSample: (ix, iy, iz) => values[ix + iy * strideY + iz * strideZ],
  };
}

function roundedBoxSdf(cx, cy, cz, hx, hy, hz, r) {
  return (x, y, z) => {
    const qx = Math.abs(x - cx) - hx;
    const qy = Math.abs(y - cy) - hy;
    const qz = Math.abs(z - cz) - hz;
    const ax = Math.max(qx, 0), ay = Math.max(qy, 0), az = Math.max(qz, 0);
    return Math.hypot(ax, ay, az) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r;
  };
}

function faceMeanPhiDelta(before, after) {
  const faces = {
    west: { sum: 0, n: 0 },
    east: { sum: 0, n: 0 },
    south: { sum: 0, n: 0 },
    north: { sum: 0, n: 0 },
  };
  for (let iz = 0; iz < after.gz; iz++) {
    for (let iy = 0; iy < after.gy; iy++) {
      for (let ix = 0; ix < after.gx; ix++) {
        const idx = ix + iy * after.strideY + iz * after.strideZ;
        const f0 = before.values[idx];
        if (!Number.isFinite(f0) || Math.abs(f0) > 0.045) continue;
        const x = ix * after.voxelSize;
        const y = iy * after.voxelSize;
        const z = iz * after.voxelSize;
        if (y < 0.75 || y > 1.55) continue;
        const d = after.values[idx] - f0;
        if (x < 0.95 && z > 1.35 && z < 2.65) { faces.west.sum += d; faces.west.n++; }
        else if (x > 3.05 && z > 1.35 && z < 2.65) { faces.east.sum += d; faces.east.n++; }
        else if (z < 0.95 && x > 1.35 && x < 2.65) { faces.south.sum += d; faces.south.n++; }
        else if (z > 3.05 && x > 1.35 && x < 2.65) { faces.north.sum += d; faces.north.n++; }
      }
    }
  }
  return Object.fromEntries(Object.entries(faces).map(([name, v]) => {
    assert.ok(v.n > 40, `${name} face sample count`);
    return [name, v.sum / v.n];
  }));
}

function macroFor(archetype) {
  const params = resolveParams({ archetype, seed: 4029 });
  const rng = createRng(params.seed);
  const tectonics = createTectonicField(params, rng.fork('tectonics'));
  const macro = buildMacroFormation(params, tectonics, rng.fork('macro'));
  return { params, rng, macro };
}

function macroBounds(macro) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const block of macro.blocks) {
    b[0] = Math.min(b[0], block.minX); b[1] = Math.min(b[1], block.minY); b[2] = Math.min(b[2], block.minZ);
    b[3] = Math.max(b[3], block.maxX); b[4] = Math.max(b[4], block.maxY); b[5] = Math.max(b[5], block.maxZ);
  }
  return {
    min: b.slice(0, 3),
    max: b.slice(3),
    size: [b[3] - b[0], b[4] - b[1], b[5] - b[2]],
  };
}

test('Shared wind regimes dwell in sectors instead of sweeping like a windscreen wiper', () => {
  assert.equal(normalizeWindShiftMode(0), 'fixed');
  assert.equal(normalizeWindShiftMode(1), 'variable');
  assert.equal(normalizeWindShiftMode('seasonal_swing'), 'variable', 'legacy swing settings migrate to the variable wind rose');
  assert.equal(normalizeWindShiftMode('oscillate'), 'variable');
  assert.equal(normalizeWindShiftMode('weather-fronts'), 'sectors');
  assert.equal(normalizeWindShiftMode(3), 'rotate');
  assert.equal(windShiftModeValue('sectors'), 2);
  assert.equal(normalizeWindAzimuthDeg(181), -179);
  assert.equal(normalizeWindAzimuthDeg(-181), 179);

  const fixed = { windAzimuth: 35, windShiftMode: 'fixed', windShiftRange: 120 };
  for (const cycles of [0, 0.25, 1, 4.7]) assert.equal(effectiveWindAzimuthDeg(fixed, cycles), 35);

  const variable = {
    windAzimuth: 35,
    windShiftMode: 'variable',
    windShiftRange: 60,
    seed: 4029,
  };
  const schedule = windDirectionScheduleDeg(variable, 0);
  assert.equal(schedule.length, 32, 'one variable weather pattern contains many short direction episodes');

  // Every scheduled entry is held for its whole dwell slice; it does not
  // continuously lean from one extreme to the other between samples.
  for (let episode = 0; episode < schedule.length; episode++) {
    const early = effectiveWindAzimuthDeg(variable, (episode + 0.2) / schedule.length);
    const late = effectiveWindAzimuthDeg(variable, (episode + 0.8) / schedule.length);
    assert.equal(early, late, `episode ${episode} must dwell at one bearing`);
    assert.equal(early, normalizeWindAzimuthDeg(35 + schedule[episode]));
  }

  // Episode-to-episode changes include real weather jumps to widely
  // separated sectors, not just a smooth left-right-left oscillation.
  const episodeAzimuths = schedule.map((offset) => normalizeWindAzimuthDeg(35 + offset));
  const largeJumps = episodeAzimuths.slice(1)
    .filter((deg, i) => angularJumpDeg(episodeAzimuths[i], deg) >= 90).length;
  assert.ok(largeJumps >= 4, `variable weather should sometimes jump across the compass (${largeJumps} large jumps)`);
  assert.notDeepEqual(
    [0, 0.25, 0.5, 0.75, 1].map((c) => Math.round(effectiveWindAzimuthDeg(variable, c))),
    [35, 95, 35, -25, 35],
    'the rejected sinusoidal wiper sequence must not return'
  );

  // The configured prevailing sector is dominant, adjacent sectors are
  // common, all compass sectors occur, and mirrored sectors get exactly
  // the same quota in a complete weather-pattern cycle.
  const counts = sectorCountsForOffsets(schedule);
  assert.deepEqual(counts.map((_, i) => SECTOR_CENTRES_DEG[i]), SECTOR_CENTRES_DEG);
  assert.ok(counts.every((count) => count > 0), `all eight sectors need some wind (${counts})`);
  assert.equal(counts[3], counts[5], '-45° and +45° quotas must match');
  assert.equal(counts[2], counts[6], '-90° and +90° quotas must match');
  assert.equal(counts[1], counts[7], '-135° and +135° quotas must match');
  assert.equal(counts[4], Math.max(...counts), 'prevailing sector remains most common');
  assert.ok(counts[4] / schedule.length >= 0.30 && counts[4] / schedule.length <= 0.38,
    `prevailing share should dominate without monopolising (${counts})`);
  assert.ok(counts[3] > counts[2] && counts[2] > counts[1],
    `adjacent sectors should be more frequent than side/rear sectors (${counts})`);
  assert.ok(counts[0] >= 1, 'even the opposite sector occurs occasionally');
  const firstHalfCounts = sectorCountsForOffsets(schedule.slice(0, 16));
  assert.ok(firstHalfCounts.every((count) => count > 0),
    `rare sectors are spread through a cycle, not postponed to its end (${firstHalfCounts})`);

  // The ideal weights carry the same symmetry before integer quotas.
  const weights = windRoseWeightsDeg(variable);
  approx(weights.reduce((sum, entry) => sum + entry.weight, 0), 1, 1e-12);
  assert.equal(weights[3].weight, weights[5].weight);
  assert.equal(weights[2].weight, weights[6].weight);
  assert.equal(weights[1].weight, weights[7].weight);
  assert.ok(weights[4].weight > weights[3].weight && weights[3].weight > weights[2].weight);
  const narrowWeights = windRoseWeightsDeg({ ...variable, windShiftRange: 15 });
  const broadWeights = windRoseWeightsDeg({ ...variable, windShiftRange: 135 });
  assert.ok(narrowWeights[4].weight > weights[4].weight && weights[4].weight > broadWeights[4].weight,
    'increasing spread should move time away from only the prevailing sector');
  assert.ok(narrowWeights[0].weight < weights[0].weight && weights[0].weight < broadWeights[0].weight,
    'increasing spread should give rear/opposite sectors more time');

  // Legacy user settings get exactly the new episode schedule.
  assert.deepEqual(
    windDirectionScheduleDeg({ ...variable, windShiftMode: 'oscillate' }, 0),
    schedule
  );

  // Reporting samples actual dwell episodes across both cycles.
  const reported = sampleWindDirectionSequenceDeg(variable, 2, 17);
  assert.equal(reported.length, 17);
  assert.ok(new Set(reported.map((deg) => sectorIndexForRelativeDeg(relativeAzimuthDeg(deg, 35)))).size >= 6,
    `reported episodes should span several sectors (${reported})`);

  const fronts = {
    windAzimuth: 35,
    windShiftMode: 'sectors',
    windShiftRange: 80,
    windShiftSectors: 5,
    seed: 4029,
  };
  const frontSchedule = windDirectionScheduleDeg(fronts, 0);
  assert.deepEqual([...frontSchedule].sort((a, b) => a - b), [-80, -40, 0, 40, 80]);
  assert.notDeepEqual(frontSchedule, [-80, -40, 0, 40, 80], 'fronts must not sweep monotonically across the compass');
  assert.notDeepEqual(frontSchedule, [80, 40, 0, -40, -80], 'fronts must not sweep monotonically back across the compass');
  for (let episode = 0; episode < frontSchedule.length; episode++) {
    assert.equal(
      effectiveWindAzimuthDeg(fronts, (episode + 0.2) / frontSchedule.length),
      effectiveWindAzimuthDeg(fronts, (episode + 0.8) / frontSchedule.length),
      'each front sector also dwells'
    );
  }

  const rose = { windAzimuth: 35, windShiftMode: 'rotate', seed: 4029 };
  const roseSchedule = windDirectionScheduleDeg(rose, 0);
  assert.deepEqual(sectorCountsForOffsets(roseSchedule), [2, 2, 2, 2, 2, 2, 2, 2],
    'full wind rose means equal sector quotas, not continuous rotation');
  assert.notDeepEqual(
    [0, 0.25, 0.5, 0.75].map((c) => Math.round(effectiveWindAzimuthDeg(rose, c))),
    [35, 125, -145, -55],
    'full-rose mode must not behave like a clock hand'
  );

  const stepped = { ...variable, windShiftPeriod: 200 };
  assert.equal(effectiveWindAzimuthAtStep(stepped, 0), effectiveWindAzimuthAtStep(stepped, 5),
    'Terrain holds the first sector for multiple simulation steps');
  assert.notEqual(effectiveWindAzimuthAtStep(stepped, 5), effectiveWindAzimuthAtStep(stepped, 7),
    'Terrain then changes to the next scheduled sector');
  assert.match(describeWindRegime(stepped), /variable wind rose.*spread 60°/);
});

test('Terrain defaults and Utah expose moving prevailing wind, and GPU climate follows step count', () => {
  assert.equal(DEFAULT_EROSION_PARAMS.windShiftMode, 1);
  assert.ok(DEFAULT_EROSION_PARAMS.windShiftRange > 0);
  assert.ok(DEFAULT_EROSION_PARAMS.windShiftPeriod >= 30);

  const utahLayers = TERRAIN_STACK_PRESETS['utah-wind-rain-canyon'].layers();
  const utahWind = utahLayers.find((layer) => layer.type === 'wind-erosion');
  assert.ok(utahWind, 'Utah must retain its dedicated Wind layer');
  assert.equal(utahWind.params.windShiftMode, 2);
  assert.equal(utahWind.params.windShiftRange, 70);
  assert.equal(utahWind.params.windShiftPeriod, 220);
  assert.deepEqual(
    utahLayers.filter((layer) => ['wind-erosion', 'hydraulic-erosion'].includes(layer.type)).map((l) => l.type).sort(),
    ['hydraulic-erosion', 'wind-erosion'],
    'Utah weather remains Wind + Rain only'
  );

  const engine = Object.create(GpuErosionEngine.prototype);
  engine.params = {
    ...DEFAULT_EROSION_PARAMS,
    emitterMode: 'aeolian-wind',
    windAzimuth: 20,
    windSpeed: 0.8,
    windShiftMode: 1,
    windShiftRange: 70,
    windShiftPeriod: 100,
    snowfallRate: 0,
    snowline: 0.5,
    glacierStrength: 0,
  };
  engine.stepCount = 0;
  const atStart = engine._getClimateUniforms();
  engine.stepCount = 2;
  const stillFirstDwell = engine._getClimateUniforms();
  engine.stepCount = 4;
  const nextDwell = engine._getClimateUniforms();

  assert.equal(atStart.windAzimuthDeg, effectiveWindAzimuthAtStep(engine.params, 0));
  assert.equal(stillFirstDwell.windAzimuthDeg, atStart.windAzimuthDeg,
    'GPU erosion holds a sector for its dwell instead of changing every step');
  assert.notEqual(nextDwell.windAzimuthDeg, atStart.windAzimuthDeg,
    'GPU erosion then moves to the next weather sector');
  assert.ok(Math.abs(nextDwell.windVec[0] - atStart.windVec[0]) > 0.1 ||
    Math.abs(nextDwell.windVec[1] - atStart.windVec[1]) > 0.1,
  'the actual GPU wind vector follows the sector change');

  // Over four complete 100-step weather patterns the realized Terrain-step
  // distribution is prevailing-dominated and left/right balanced.
  const terrainAzimuths = [];
  for (let step = 0; step < 400; step++) {
    engine.stepCount = step;
    terrainAzimuths.push(engine._getClimateUniforms().windAzimuthDeg);
  }
  const terrainCounts = sectorCountsForAzimuths(terrainAzimuths, 20);
  assert.equal(terrainCounts[4], Math.max(...terrainCounts), `prevailing sector dominates Terrain steps (${terrainCounts})`);
  assert.ok(terrainCounts.every((count) => count > 0), `Terrain visits all sectors (${terrainCounts})`);
  assert.ok(Math.abs(terrainCounts[3] - terrainCounts[5]) <= 4, `±45° Terrain dwells are balanced (${terrainCounts})`);
  assert.ok(Math.abs(terrainCounts[2] - terrainCounts[6]) <= 2, `±90° Terrain dwells are balanced (${terrainCounts})`);
  assert.ok(Math.abs(terrainCounts[1] - terrainCounts[7]) <= 2, `±135° Terrain dwells are balanced (${terrainCounts})`);
});

test('Rock SDF wind dwells through equal full-rose sectors and abrades more than one face', () => {
  const make = () => makeDenseSdf(roundedBoxSdf(2, 1.2, 2, 1.15, 0.95, 1.15, 0.05), 64, 40, 64, 0.0625);
  const fresh = make();

  const fixedSdf = make();
  const fixed = erodeSdfWithWind(fixedSdf, {
    amount: 0.8,
    particleCount: 650,
    azimuthDeg: 0,
    shiftMode: 'fixed',
    turbulence: 0.18,
    streamlining: 0.55,
    edgeProtection: 0.7,
    rng: createRng(7331),
    groundY: 0,
  });
  const fixedFaces = faceMeanPhiDelta(fresh, fixedSdf);
  assert.equal(fixed.directionMode, 'fixed');
  assert.deepEqual(fixed.directionSamplesDeg, [0, 0, 0, 0, 0]);
  assert.deepEqual(fixed.directionSectorOffsetsDeg, SECTOR_CENTRES_DEG);
  assert.deepEqual(fixed.directionSectorCounts, [0, 0, 0, 0, 650, 0, 0, 0]);
  assert.deepEqual(fixed.directionSectorShares, [0, 0, 0, 0, 1, 0, 0, 0]);
  assert.ok(fixedFaces.west > fixedFaces.east + 0.00025, `fixed wind remains directional (${JSON.stringify(fixedFaces)})`);

  const rotatingSdf = make();
  const rotating = erodeSdfWithWind(rotatingSdf, {
    amount: 0.8,
    particleCount: 900,
    azimuthDeg: 0,
    shiftMode: 'rotate',
    shiftCycles: 1,
    turbulence: 0.18,
    streamlining: 0.55,
    edgeProtection: 0.7,
    rng: createRng(7331),
    groundY: 0,
  });
  const rotatingFaces = faceMeanPhiDelta(fresh, rotatingSdf);
  assert.equal(rotating.directionMode, 'rotate');
  assert.equal(rotating.directionCycles, 1);
  assert.equal(rotating.directionSamplesDeg.length, 16, 'reports all sixteen full-rose dwell episodes');
  assert.ok(new Set(rotating.directionSamplesDeg.map((deg) => sectorIndexForRelativeDeg(deg))).size === 8,
    `full-rose episodes cover all sectors (${rotating.directionSamplesDeg})`);
  assert.equal(rotating.directionSectorCounts.reduce((sum, count) => sum + count, 0), 900);
  assert.ok(rotating.directionSectorCounts.every((count) => count >= 100 && count <= 125),
    `full-rose particles are distributed equally across sectors (${rotating.directionSectorCounts})`);
  assert.ok(Math.abs(rotating.directionSectorCounts[3] - rotating.directionSectorCounts[5]) <= 3);
  assert.ok(Math.abs(rotating.directionSectorCounts[2] - rotating.directionSectorCounts[6]) <= 3);
  assert.ok(rotating.erodedVolume > 0);
  const recededFaces = Object.values(rotatingFaces).filter((v) => v > 0.00012).length;
  assert.ok(recededFaces >= 3, `full-rose wind must engage at least three faces (${JSON.stringify(rotatingFaces)})`);
  assert.ok(
    rotatingFaces.east > fixedFaces.east + 0.00008,
    `full-rose wind must eventually work the fixed-wind lee face (${rotatingFaces.east} vs ${fixedFaces.east})`
  );
});

test('SDF suite emits ordered watchable checkpoints without changing its final process result contract', () => {
  const sdf = makeDenseSdf(roundedBoxSdf(2, 1.2, 2, 1.15, 0.95, 1.15, 0.05), 56, 36, 56, 0.07);
  const frames = [];
  const stats = applySdfErosionSuite(sdf, {
    windAmount: 0.55,
    windParticles: 240,
    windAzimuthDeg: 15,
    windShiftMode: 'oscillate',
    windShiftRange: 65,
    windShiftCycles: 1.5,
    rainAmount: 0.4,
    rainDroplets: 180,
    edgeProtection: 0.75,
    groundY: 0,
    rng: createRng(9911),
    previewFrames: 5,
    onPreview: (frame) => frames.push(frame),
  });

  assert.ok(frames.length >= 3, `expected staged previews, got ${frames.length}`);
  assert.ok(frames.length <= 5, 'preview callback must not exceed the requested total frame count');
  assert.equal(stats.previewFrames, frames.length);
  assert.equal(frames[0].fraction, 0);
  assert.equal(frames.at(-1).fraction, 1);
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].fraction > frames[i - 1].fraction, 'preview fractions must advance monotonically');
  }
  assert.ok(frames.some((f) => f.process === 'wind'));
  assert.equal(stats.wind.directionMode, 'variable', 'legacy oscillate input is migrated, not replayed as a sine');
  // Reports are actual scheduled dwell episodes, and the particle-sector
  // counts prove the finite bake realized the intended balanced wind rose.
  assert.equal(stats.wind.directionSamplesDeg.length, 17);
  assert.ok(new Set(stats.wind.directionSamplesDeg.map((deg) =>
    sectorIndexForRelativeDeg(relativeAzimuthDeg(deg, 15)))).size >= 6,
  `reported bake episodes span several sectors (${stats.wind.directionSamplesDeg})`);
  assert.deepEqual(stats.wind.directionSectorOffsetsDeg, SECTOR_CENTRES_DEG);
  assert.equal(stats.wind.directionSectorCounts.reduce((sum, count) => sum + count, 0), 240);
  assert.ok(stats.wind.directionSectorCounts.every((count) => count > 0),
    `finite bake reaches every sector (${stats.wind.directionSectorCounts})`);
  assert.equal(stats.wind.directionSectorCounts[4], Math.max(...stats.wind.directionSectorCounts),
    `prevailing sector dominates the finite bake (${stats.wind.directionSectorCounts})`);
  assert.ok(Math.abs(stats.wind.directionSectorCounts[3] - stats.wind.directionSectorCounts[5]) <= 4,
    `±45° particle shares are balanced (${stats.wind.directionSectorCounts})`);
  assert.ok(Math.abs(stats.wind.directionSectorCounts[2] - stats.wind.directionSectorCounts[6]) <= 2,
    `±90° particle shares are balanced (${stats.wind.directionSectorCounts})`);
  approx(stats.wind.directionSectorShares.reduce((sum, share) => sum + share, 0), 1, 0.002);
});

test('Rock generator live preview frames are separate finite snapshots and final bake stays grounded/exportable-shaped', () => {
  const frames = [];
  const result = generateRockFormation({
    archetype: 'cliff-wall',
    seed: 4029,
    quality: 'fast',
    decimation: 0.5,
    sdfErosionSource: 'mesh',
    erosionSdfResolution: 64,
    erosionPreviewFrames: 5,
    erosionPreviewMaxTriangles: 24000,
    windErosionAmount: 0.55,
    windParticles: 260,
    windAzimuth: 35,
    windShiftMode: 'rotate',
    windShiftRange: 90,
    windShiftCycles: 1,
    rainErosionAmount: 0.35,
    rainDroplets: 220,
    rainEdgeProtection: 0.75,
  }, null, (frame) => frames.push(frame));

  assert.ok(frames.length >= 3, `generator must emit watchable frames, got ${frames.length}`);
  assert.ok(frames.length <= 5, 'generator must respect the requested total preview frame count');
  assert.equal(result.stats.sdfErosion.previewFrames, frames.length);
  assert.equal(result.stats.sdfErosion.previewError, null);
  assert.equal(result.stats.sdfErosion.wind.directionMode, 'rotate');
  assert.equal(result.stats.sdfErosion.wind.directionSamplesDeg.length, 16);
  assert.equal(result.stats.sdfErosion.wind.directionSectorCounts.reduce((sum, count) => sum + count, 0), 260);
  assert.ok(result.stats.sdfErosion.wind.directionSectorCounts.every((count) => count >= 25 && count <= 40),
    `generator forwards the equal-sector realization (${result.stats.sdfErosion.wind.directionSectorCounts})`);
  assert.equal(frames[0].fraction, 0);
  assert.equal(frames.at(-1).fraction, 1);

  for (const frame of frames) {
    const mesh = frame.mesh;
    assert.ok(mesh.positions.length > 300 && mesh.indices.length > 300);
    assert.ok(frame.triangles <= 25000, `preview triangle cap should be respected (${frame.triangles})`);
    assert.equal(mesh.normals.length, mesh.positions.length);
    assert.equal(mesh.uvs.length, (mesh.positions.length / 3) * 2);
    assert.equal(mesh.colors.length, (mesh.positions.length / 3) * 4);
    assert.notEqual(mesh, result.mesh, 'preview snapshots must not replace the final export mesh object');
    let minY = Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      assert.ok(Number.isFinite(mesh.positions[i]) && Number.isFinite(mesh.positions[i + 1]) && Number.isFinite(mesh.positions[i + 2]));
      minY = Math.min(minY, mesh.positions[i + 1]);
    }
    assert.ok(minY > -0.35 && minY < 0.35, `stable preview anchor keeps the base near ground (${minY})`);
  }

  let finalMinY = Infinity;
  for (let i = 1; i < result.mesh.positions.length; i += 3) finalMinY = Math.min(finalMinY, result.mesh.positions[i]);
  assert.ok(Math.abs(finalMinY) < 1e-4, `final placement mesh remains grounded (${finalMinY})`);
});

test('Named formation fixes: no fake Utah/Butte holes, continuous sedimentary wall, open slot, richer hoodoo fin', () => {
  for (const key of ['sedimentary-cliff', 'utah-canyon', 'slot-canyon', 'hoodoo-columns', 'sandstone-butte']) {
    assert.ok(FORMATION_PRESETS[key], `${key} remains available`);
  }

  const sedimentary = macroFor('sedimentary-cliff');
  const sedBounds = macroBounds(sedimentary.macro);
  assert.equal(sedimentary.macro.cuts.length, 0);
  assert.ok(sedimentary.macro.blocks.length >= 300);
  assert.ok(sedBounds.size[0] / sedBounds.size[1] >= 1.55, `sedimentary asset is a broad escarpment (${sedBounds.size})`);
  assert.ok(sedBounds.size[0] / sedBounds.size[2] >= 2.0, `sedimentary wall is much wider than deep (${sedBounds.size})`);

  const utah = macroFor('utah-canyon');
  assert.equal(utah.macro.cuts.length, 2, 'only the two narrow joint chimneys may remain as Utah cuts');
  for (const cut of utah.macro.cuts) {
    const width = cut.maxX - cut.minX;
    assert.ok(width < 1.5, `Utah cut must be a narrow fracture slot, not an alcove/vault (width ${width})`);
    assert.ok(cut.volume < 16, `Utah cut volume must stay slot-like (${cut.volume})`);
  }
  // Removing the boolean vault is not enough by itself: a recessed mid-wall
  // band under a projecting brow still renders as a fake cave. Sample the
  // actual macro front (+Z) and require a solid, non-roofed wall profile.
  const utahEvaluator = createGeologicalSdfEvaluator(utah.macro, utah.params, utah.rng.fork('detail'));
  const utahFrontZ = (x, y) => {
    let prevZ = 12;
    let prev = utahEvaluator.evalMacro(x, y, prevZ);
    for (let z = 11.9; z >= -8; z -= 0.1) {
      const value = utahEvaluator.evalMacro(x, y, z);
      if (prev > 0 && value <= 0) return prevZ + (z - prevZ) * (prev / (prev - value));
      prevZ = z;
      prev = value;
    }
    return null;
  };
  for (const y of [4.5, 6.0]) {
    const centre = utahFrontZ(0, y);
    const sideMax = Math.max(...[-5, -3, 3, 5].map((x) => utahFrontZ(x, y)));
    assert.ok(centre !== null && sideMax - centre < 1.0,
      `Utah centre must not be a deep alcove recess at y=${y} (centre ${centre}, sides ${sideMax})`);
  }
  const utahRoofProjection = utahFrontZ(0, 7.5) - utahFrontZ(0, 4.5);
  assert.ok(utahRoofProjection < 0.55,
    `Utah upper wall must not roof over the mid-wall (${utahRoofProjection})`);

  const butte = macroFor('sandstone-butte');
  assert.equal(butte.macro.cuts.length, 0, 'Butte broad alcove hole cut is removed');
  assert.ok(butte.macro.blocks.length >= 60);

  const slot = macroFor('slot-canyon');
  const slotBounds = macroBounds(slot.macro);
  assert.equal(slot.macro.cuts.length, 0);
  assert.ok(slot.macro.blocks.length >= 250);
  assert.ok(slotBounds.size[2] / slotBounds.size[0] >= 1.30, `slot is a long corridor asset (${slotBounds.size})`);
  assert.ok(slotBounds.size[1] / slotBounds.size[0] >= 0.82, `slot walls are tall relative to total width (${slotBounds.size})`);

  const evaluator = createGeologicalSdfEvaluator(slot.macro, slot.params, slot.rng.fork('detail'));
  for (const z of [-7.5, -3.5, 0, 3.5, 7.5]) {
    let maxClearance = -Infinity;
    for (let x = -6; x <= 6.001; x += 0.25) {
      maxClearance = Math.max(maxClearance, evaluator.evalMacro(x, 2.0, z));
    }
    assert.ok(maxClearance > 0.30, `slot must retain an open air corridor at z=${z} (clearance ${maxClearance})`);
  }

  const hoodoo = macroFor('hoodoo-columns');
  const hoodooBounds = macroBounds(hoodoo.macro);
  assert.equal(hoodoo.macro.cuts.length, 0);
  assert.ok(hoodoo.macro.blocks.length >= 110, `hoodoo fin keeps rich fused construction (${hoodoo.macro.blocks.length})`);
  assert.ok(hoodooBounds.size[1] >= 13, `hoodoo dominant towers retain landmark height (${hoodooBounds.size})`);
  assert.ok(hoodooBounds.size[2] >= 6, `hoodoo has foreground/background fin depth (${hoodooBounds.size})`);
});

test('Terrain and Rock UIs, worker and CLI expose sector-dwell wind plus user-controlled live erosion preview', () => {
  const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const html = read('../index.html');
  const main = read('../src/app/main.js');
  const worker = read('../src/worker/gen-worker.js');
  const terrainUi = read('../src/erosion/layer-stack-ui.js');
  const pipeline = read('../src/erosion/terrain-stack-pipeline.js');
  const cli = read('../tools/generate-cli.mjs');

  for (const token of [
    "key: 'windShiftMode'",
    "key: 'windShiftRange'",
    "key: 'windShiftPeriod'",
    'effectiveWindAzimuthAtStep',
    'seed: num(this.engine.params.seed, 1)',
    'Wind-Rose Spread / Sector Range',
  ]) assert.ok(terrainUi.includes(token), `Terrain Wind UI token ${token}`);
  for (const token of ['windShiftMode', 'windShiftRange', 'windShiftPeriod']) {
    assert.ok(pipeline.includes(token), `Terrain pipeline propagates ${token}`);
  }

  assert.ok(html.includes('id="select-wind-shift-mode"'));
  assert.ok(html.includes('value="variable" selected'));
  assert.ok(html.includes('Variable wind rose (prevailing + changing sectors)'));
  assert.ok(!html.includes('Seasonal swing around prevailing wind'));
  assert.ok(html.includes('id="chk-live-erosion-preview"'));
  assert.ok(html.includes('Watch erosion live'));
  for (const token of [
    "key: 'erosionPreviewFrames'",
    "key: 'erosionPreviewDelayMs'",
    "key: 'windShiftRange'",
    "key: 'windShiftCycles'",
    "windShiftMode: 'variable'",
    'directionSectorShares',
    "msg.type === 'erosion-preview'",
    'liveErosionPreview: state.params.liveErosionPreview',
    'windShiftCycles: state.params.windShiftCycles',
  ]) assert.ok(main.includes(token), `Rock Studio token ${token}`);

  assert.ok(worker.includes("type: 'erosion-preview'"));
  assert.ok(worker.includes('erosionPreviewDelayMs'));
  assert.ok(worker.includes('liveErosionPreview'));

  for (const token of ['--wind-shift', '--wind-shift-range', '--wind-shift-cycles', 'directionSamplesDeg', 'directionSectorShares', 'wind sector mix']) {
    assert.ok(cli.includes(token), `CLI token ${token}`);
  }
});
