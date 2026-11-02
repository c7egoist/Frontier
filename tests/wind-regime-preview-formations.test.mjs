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

test('Shared wind regimes cover fixed, seasonal swing, front sectors and a full wind rose', () => {
  assert.equal(normalizeWindShiftMode(0), 'fixed');
  assert.equal(normalizeWindShiftMode('seasonal_swing'), 'oscillate');
  assert.equal(normalizeWindShiftMode('weather-fronts'), 'sectors');
  assert.equal(normalizeWindShiftMode(3), 'rotate');
  assert.equal(windShiftModeValue('sectors'), 2);
  assert.equal(normalizeWindAzimuthDeg(181), -179);
  assert.equal(normalizeWindAzimuthDeg(-181), 179);

  const fixed = { windAzimuth: 35, windShiftMode: 'fixed', windShiftRange: 120 };
  for (const cycles of [0, 0.25, 1, 4.7]) assert.equal(effectiveWindAzimuthDeg(fixed, cycles), 35);

  const swing = { windAzimuth: 35, windShiftMode: 'oscillate', windShiftRange: 60 };
  const swingSamples = [0, 0.25, 0.5, 0.75, 1].map((c) => effectiveWindAzimuthDeg(swing, c));
  assert.deepEqual(swingSamples.map((v) => Math.round(v)), [35, 95, 35, -25, 35]);

  const fronts = {
    windAzimuth: 35,
    windShiftMode: 'sectors',
    windShiftRange: 80,
    windShiftSectors: 5,
  };
  const frontSamples = [0, 0.2, 0.4, 0.6, 0.8].map((c) => effectiveWindAzimuthDeg(fronts, c));
  assert.deepEqual(frontSamples.map((v) => Math.round(v)), [-45, -5, 35, 75, 115]);

  const rose = { windAzimuth: 35, windShiftMode: 'rotate' };
  assert.equal(effectiveWindAzimuthDeg(rose, 0.25), 125);
  assert.equal(effectiveWindAzimuthDeg(rose, 0.5), -145);
  assert.equal(effectiveWindAzimuthDeg(rose, 1), 35);

  const stepped = { ...swing, windShiftPeriod: 200 };
  assert.equal(effectiveWindAzimuthAtStep(stepped, 0), 35);
  approx(effectiveWindAzimuthAtStep(stepped, 50), 95, 1e-9);
  approx(effectiveWindAzimuthAtStep(stepped, 150), -25, 1e-9);
  assert.match(describeWindRegime(stepped), /seasonal swing ±60°/);
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
  engine.stepCount = 25;
  const atQuarter = engine._getClimateUniforms();
  engine.stepCount = 75;
  const atThreeQuarters = engine._getClimateUniforms();

  approx(atStart.windAzimuthDeg, 20, 1e-9);
  approx(atQuarter.windAzimuthDeg, 90, 1e-9);
  approx(atThreeQuarters.windAzimuthDeg, -50, 1e-9);
  assert.ok(Math.abs(atQuarter.windVec[0] - atStart.windVec[0]) > 0.25);
  assert.ok(Math.abs(atThreeQuarters.windVec[1] - atQuarter.windVec[1]) > 0.5);
});

test('Rock SDF wind samples multiple directions and abrades more than one face in rotate mode', () => {
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
  assert.deepEqual(rotating.directionSamplesDeg, [0, 90, 180, -90, 0]);
  assert.ok(rotating.erodedVolume > 0);
  const recededFaces = Object.values(rotatingFaces).filter((v) => v > 0.00012).length;
  assert.ok(recededFaces >= 3, `rotating wind must engage at least three faces (${JSON.stringify(rotatingFaces)})`);
  assert.ok(
    rotatingFaces.east > fixedFaces.east + 0.00008,
    `rotating wind must eventually work the fixed-wind lee face (${rotatingFaces.east} vs ${fixedFaces.east})`
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
  assert.equal(stats.wind.directionMode, 'oscillate');
  assert.ok(new Set(stats.wind.directionSamplesDeg).size >= 3);
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
  assert.deepEqual(result.stats.sdfErosion.wind.directionSamplesDeg, [35, 125, -145, -55, 35]);
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

test('Terrain and Rock UIs, worker and CLI expose shifting wind plus user-controlled live erosion preview', () => {
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
  ]) assert.ok(terrainUi.includes(token), `Terrain Wind UI token ${token}`);
  for (const token of ['windShiftMode', 'windShiftRange', 'windShiftPeriod']) {
    assert.ok(pipeline.includes(token), `Terrain pipeline propagates ${token}`);
  }

  assert.ok(html.includes('id="select-wind-shift-mode"'));
  assert.ok(html.includes('id="chk-live-erosion-preview"'));
  assert.ok(html.includes('Watch erosion live'));
  for (const token of [
    "key: 'erosionPreviewFrames'",
    "key: 'erosionPreviewDelayMs'",
    "key: 'windShiftRange'",
    "key: 'windShiftCycles'",
    "windShiftMode: 'oscillate'",
    "msg.type === 'erosion-preview'",
    'liveErosionPreview: state.params.liveErosionPreview',
    'windShiftCycles: state.params.windShiftCycles',
  ]) assert.ok(main.includes(token), `Rock Studio token ${token}`);

  assert.ok(worker.includes("type: 'erosion-preview'"));
  assert.ok(worker.includes('erosionPreviewDelayMs'));
  assert.ok(worker.includes('liveErosionPreview'));

  for (const token of ['--wind-shift', '--wind-shift-range', '--wind-shift-cycles', 'directionSamplesDeg']) {
    assert.ok(cli.includes(token), `CLI token ${token}`);
  }
});
