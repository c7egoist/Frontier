import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  DEFAULT_BASE_PARAMS,
  LANDSCAPE_DOCUMENT_VERSION,
  LANDSCAPE_LAYER_KINDS,
  LANDMASS_STAMP_KINDS,
  SCULPT_TOOLS,
  addLayer,
  addStamp,
  addStroke,
  createLandscapeDocument,
  createStamp,
  createStroke,
  deserializeLandscapeDocument,
  diffDocument,
  documentStats,
  ensureLayer,
  findLayer,
  moveLayer,
  normalizeLandscapeDocument,
  pushStrokePoint,
  removeLayer,
  removeOp,
  serializeLandscapeDocument,
  serializeLandscapeDocumentText,
  tilesForBounds,
  touchDocument,
  worldToTile,
} from '../src/core/landscape-document.js';
import {
  buildChunkSdfLattice,
  buildRegionMesh,
  computeOceanConnectivity,
  createLandscapeField,
  estimateLandFraction,
  octaveBudget,
} from '../src/core/landscape-field.js';
import {
  LandscapeTileScheduler,
  RING_LOD,
  estimateTileBytes,
  selectTilesAround,
} from '../src/core/landscape-tiles.js';
import {
  continentalProfile,
  fbm2,
  hash2,
  perlin2,
  spectral2,
  spectralRidged2,
} from '../src/core/landscape-math.js';
import { extractDualContourMesh } from '../src/core/dual-contour.js';
import { checkGlslScopes } from './glsl-scope-check.mjs';
import { LandscapeOceanSimulation } from '../src/app/landscape-ocean.js';
import {
  OCEAN_FRAGMENT,
  OCEAN_VERTEX,
  SKY_FRAGMENT,
  SKY_VERTEX,
  TERRAIN_FRAGMENT,
  TERRAIN_VERTEX,
} from '../src/app/landscape-shaders.js';

const SEA = 0;

/**
 * The ocean solver is a GPU pipeline, but everything it publishes *about* the
 * world — the bed, the surf field, the settings it derives uniforms from — is
 * plain data, so it can be built against a stub renderer.
 */
function makeOceanSimDouble() {
  const noop = () => {};
  const renderer = {
    domElement: { addEventListener: noop, removeEventListener: noop },
    setPixelRatio: noop,
    setSize: noop,
    setClearColor: noop,
    setRenderTarget: noop,
    getRenderTarget: () => null,
    getPixelRatio: () => 1,
    getContext: () => ({ getExtension: () => ({}) }),
    render: noop,
    clear: noop,
    dispose: noop,
  };
  const scene = new THREE.Scene();
  return new LandscapeOceanSimulation(renderer, scene, { spanMeters: 30_000, resolution: 64 });
}

function makeDoc(overrides = {}) {
  return createLandscapeDocument({ name: 'Test World', spanMeters: 400_000, seed: 4029, ...overrides });
}

function landformLayer(doc) {
  return doc.layers.find((layer) => layer.kind === 'landform');
}

function sculptLayer(doc) {
  return doc.layers.find((layer) => layer.kind === 'sculpt');
}

// ---------------------------------------------------------------------------
// Noise and spectrum
// ---------------------------------------------------------------------------

test('gradient noise is deterministic, bounded and continuous', () => {
  assert.equal(perlin2(12.5, -3.25, 7), perlin2(12.5, -3.25, 7));
  assert.notEqual(perlin2(12.5, -3.25, 7), perlin2(12.5, -3.25, 8));

  let max = 0;
  for (let i = 0; i < 4_000; i++) {
    const x = (i % 97) * 0.37;
    const z = Math.floor(i / 97) * 0.41;
    max = Math.max(max, Math.abs(perlin2(x, z, 3)));
  }
  assert.ok(max <= 1.3, `gradient noise should stay near [-1,1], saw ${max}`);

  // Continuity: a tiny step must never jump a whole feature.
  for (let i = 0; i < 500; i++) {
    const x = i * 0.13;
    const a = perlin2(x, 4.2, 11);
    const b = perlin2(x + 1e-4, 4.2, 11);
    assert.ok(Math.abs(a - b) < 1e-2, `noise discontinuity of ${Math.abs(a - b)} at x=${x}`);
  }
  // Hashing must not collapse for negative coordinates.
  assert.ok(hash2(-5, -9, 1) > 0 && hash2(-5, -9, 1) < 1);
});

test('octave budget is band-limited and monotone in sample spacing', () => {
  const wavelength = 34_000;
  assert.equal(octaveBudget(wavelength, 1e6, 12), 1, 'undersampled terms keep one octave');
  assert.ok(octaveBudget(wavelength, 100, 12) > octaveBudget(wavelength, 1_000, 12));
  assert.ok(octaveBudget(wavelength, 1_000, 12) > octaveBudget(wavelength, 10_000, 12));
  assert.ok(octaveBudget(wavelength, 0.1, 12) <= 12, 'budget respects the cap');
});

test('spectral noise carries a consistent slope across scale', () => {
  // Every octave should contribute comparable slope, which is the property that
  // makes the terrain read as terrain at every zoom (see landscape-math.js).
  const measure = (cell) => {
    let total = 0;
    let count = 0;
    for (let i = 1; i < 400; i++) {
      const budget = octaveBudget(20_000, cell, 12);
      const a = spectral2(i * cell, 0, 5, 20_000, 900, budget);
      const b = spectral2((i + 1) * cell, 0, 5, 20_000, 900, budget);
      total += Math.abs(b - a) / cell;
      count += 1;
    }
    return total / count;
  };
  const fine = measure(2);
  const coarse = measure(64);
  assert.ok(fine > 0.002, `fine slope should be non-trivial, got ${fine}`);
  assert.ok(coarse > 0 && coarse < fine * 3, `coarse slope should be comparable, got ${coarse}`);
  // Ridged variant must stay finite and non-negative.
  for (let i = 0; i < 100; i++) {
    const v = spectralRidged2(i * 91, -i * 37, 3, 4_000, 200, 6);
    assert.ok(Number.isFinite(v) && v >= 0);
  }
});

test('continuous continental shelf profile is monotone and bounded', () => {
  let previous = 0;
  for (let d = 0; d < 20_000; d += 50) {
    const value = continentalProfile(-d, 2_000, 700, 4_000);
    assert.ok(Number.isFinite(value));
    assert.ok(value <= previous + 1e-6, `shelf must deepen monotonically at d=${d}`);
    assert.ok(value >= -4_100, `shelf must not exceed the abyssal depth at d=${d}`);
    previous = value;
  }
  assert.equal(continentalProfile(500, 2_000, 700, 4_000), 500, 'land heights pass through untouched');
});

// ---------------------------------------------------------------------------
// Document model
// ---------------------------------------------------------------------------

test('document has a base field, layer stack and stable defaults', () => {
  const doc = makeDoc();
  assert.equal(doc.version, LANDSCAPE_DOCUMENT_VERSION);
  assert.equal(doc.seed, 4029);
  assert.equal(doc.world.spanMeters, 400_000);
  assert.deepEqual(
    doc.layers.map((layer) => layer.kind),
    ['base', 'landform', 'sculpt', 'ocean']
  );
  const base = doc.layers[0];
  assert.equal(base.params.seed, doc.seed);
  assert.equal(base.params.landCoverage, DEFAULT_BASE_PARAMS.landCoverage);
  // Planned layers are declared but not committed.
  assert.equal(LANDSCAPE_LAYER_KINDS.erosion.available, false);
  assert.equal(LANDSCAPE_LAYER_KINDS.cracks.available, false);
  assert.ok(SCULPT_TOOLS.length >= 7);
  assert.ok(LANDMASS_STAMP_KINDS.length >= 8);
});

test('document survives a serialisation round trip byte for byte', () => {
  const doc = makeDoc();
  addStamp(doc, landformLayer(doc).id, { kind: 'island', x: 1_000, z: -2_000, radius: 3_000, height: 400 });
  const stroke = createStroke({ tool: 'raise', radius: 500, strength: 0.4, seed: 11 });
  pushStrokePoint(stroke, 0, 0);
  pushStrokePoint(stroke, 300, 120);
  sculptLayer(doc).ops.push(stroke);

  const text = serializeLandscapeDocumentText(doc);
  const restored = deserializeLandscapeDocument(text);
  assert.equal(serializeLandscapeDocumentText(restored), text);

  const original = createLandscapeField(doc);
  const reloaded = createLandscapeField(restored);
  for (const [x, z] of [[0, 0], [900, -300], [-4_000, 6_000], [50_000, 50_000]]) {
    assert.equal(original.elevationAt(x, z, 64), reloaded.elevationAt(x, z, 64));
  }
});

test('normalising a hostile document never throws and never keeps unknown layers', () => {
  const doc = normalizeLandscapeDocument({
    name: 42,
    spanMeters: 'huge',
    seed: -1,
    layers: [
      null,
      'nope',
      { kind: 'not-a-layer', ops: [] },
      { kind: 'landform', ops: [{ type: 'stamp', kind: 'island', x: 0, z: 0, radius: 'x' }, { type: 'bogus' }] },
      { kind: 'landform', ops: [] },
    ],
  });
  const landformIds = doc.layers.filter((layer) => layer.kind === 'landform').map((layer) => layer.id);
  assert.equal(new Set(landformIds).size, landformIds.length, 'layer ids stay unique');
  assert.equal(doc.layers.filter((layer) => layer.kind === 'base').length, 1, 'a base layer is always present');
  assert.equal(doc.layers.find((layer) => layer.kind === 'landform').ops.length, 1, 'unknown ops are dropped');
  assert.ok(Number.isFinite(doc.world.spanMeters));
  const field = createLandscapeField(doc);
  assert.ok(Number.isFinite(field.elevationAt(0, 0, 100)));
});

test('authored documents stay kilobyte-sized even when heavily authored', () => {
  const doc = makeDoc();
  const lf = landformLayer(doc);
  for (let i = 0; i < 40; i++) {
    addStamp(doc, lf.id, {
      kind: LANDMASS_STAMP_KINDS[i % LANDMASS_STAMP_KINDS.length].id,
      x: (i % 8) * 20_000,
      z: Math.floor(i / 8) * 20_000,
      radius: 3_000 + i * 100,
      height: 300,
      seed: i + 1,
    });
  }
  for (let s = 0; s < 10; s++) {
    const stroke = createStroke({ tool: 'raise', radius: 400, strength: 0.3, seed: s + 1 });
    for (let p = 0; p < 30; p++) pushStrokePoint(stroke, p * 120, s * 500);
    sculptLayer(doc).ops.push(stroke);
  }
  const stats = documentStats(doc);
  assert.equal(stats.stamps, 40);
  assert.equal(stats.strokes, 10);
  assert.ok(stats.bytes < 96 * 1024, `heavily authored document should stay small, got ${stats.bytes} B`);
  // The point of the whole architecture: authored size must not scale with world area.
  const big = makeDoc({ spanMeters: 4_000_000 });
  big.layers = doc.layers;
  assert.ok(documentStats(big).bytes < 96 * 1024);
});

test('layer operations keep the base layer safe', () => {
  const doc = makeDoc();
  const base = doc.layers[0];
  const before = doc.layers.length;
  assert.equal(addLayer(doc, 'base'), base, 'singleton layer is returned, not duplicated');
  assert.equal(doc.layers.length, before);
  assert.equal(addLayer(doc, 'erosion'), null, 'unavailable layers cannot be added');
  const sculpt = ensureLayer(doc, 'sculpt');
  assert.ok(findLayer(doc, sculpt.id));
  assert.equal(moveLayer(doc, sculpt.id, -1), doc.layers.indexOf(sculpt));
  assert.ok(removeLayer(doc, sculpt.id));
  assert.equal(removeLayer(doc, 'missing'), null);
});

// ---------------------------------------------------------------------------
// Field evaluation
// ---------------------------------------------------------------------------

test('field is deterministic per document seed and independent of evaluation order', () => {
  const a = createLandscapeField(makeDoc());
  const b = createLandscapeField(makeDoc());
  const probes = [[0, 0], [13_000, -7_500], [-88_000, 41_000], [199_999, 199_999]];
  for (const [x, z] of probes) {
    assert.equal(a.elevationAt(x, z, 32), b.elevationAt(x, z, 32));
  }
  // Reversed traversal must give identical values (no accumulating state).
  const forward = probes.map(([x, z]) => a.elevationAt(x, z, 32));
  const backward = [...probes].reverse().map(([x, z]) => a.elevationAt(x, z, 32)).reverse();
  assert.deepEqual(forward, backward);

  const other = createLandscapeField(createLandscapeDocument({ spanMeters: 400_000, seed: 777 }));
  const different = probes.some(([x, z]) => other.elevationAt(x, z, 32) !== a.elevationAt(x, z, 32));
  assert.ok(different, 'a different seed must produce a different world');
});

test('neighbouring chunks agree exactly on their shared edge (no seams, no skirts)', () => {
  const doc = makeDoc();
  addStamp(doc, landformLayer(doc).id, { kind: 'island', x: 0, z: 0, radius: 20_000, height: 900 });
  const field = createLandscapeField(doc);
  const chunk = 16_384;
  const cell = 64;

  const left = buildRegionMesh(field, { tx: -1, tz: 0, chunkMeters: chunk, cellMeters: cell, lod: 3 });
  const right = buildRegionMesh(field, { tx: 0, tz: 0, chunkMeters: chunk, cellMeters: cell, lod: 3 });

  for (let row = 0; row < left.nx; row++) {
    assert.equal(left.heights[row * left.nx + left.nx - 1], right.heights[row * right.nx], `edge mismatch on row ${row}`);
  }
  // Both meshes must be watertight in the index-count sense.
  assert.equal(left.indices.length, (left.nx - 1) * (left.nx - 1) * 6);
  assert.equal(right.indices.length, (right.nx - 1) * (right.nx - 1) * 6);

  // Vertex normals must all be finite unit-length-ish values.
  for (let i = 0; i < left.normals.length; i += 3) {
    const length = Math.hypot(left.normals[i], left.normals[i + 1], left.normals[i + 2]);
    assert.ok(Math.abs(length - 1) < 1e-3, `normal length ${length}`);
  }
});

test('every sample is finite, and the ocean is genuinely below sea level', () => {
  const field = createLandscapeField(makeDoc());
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 3_000; i++) {
    const x = (i % 60) * 6_700 - 200_000;
    const z = Math.floor(i / 60) * 8_100 - 200_000;
    const e = field.elevationAt(x, z, 256);
    assert.ok(Number.isFinite(e), `NaN elevation at ${x},${z}`);
    min = Math.min(min, e);
    max = Math.max(max, e);
  }
  assert.ok(min < SEA, 'a default world must contain ocean');
  assert.ok(max > SEA, 'a default world must contain land');
  assert.ok(max - min > 500, 'a default world must have real relief');
});

test('default world is a plausible land/ocean mix, not a flat sheet', () => {
  const doc = makeDoc({ spanMeters: 900_000 });
  const fraction = estimateLandFraction(createLandscapeField(doc), 40);
  assert.ok(fraction > 0.05 && fraction < 0.8, `default land coverage was ${(fraction * 100).toFixed(1)}%`);
});

test('relief parameters change amplitude but never break the coastline', () => {
  const flat = makeDoc();
  flat.layers[0].params.hillsRelief = 0;
  flat.layers[0].params.detailRelief = 0;
  flat.layers[0].params.orogeny = 0;
  const flatField = createLandscapeField(flat);

  const rugged = makeDoc();
  rugged.layers[0].params.hillsRelief = 1;
  rugged.layers[0].params.detailRelief = 1;
  rugged.layers[0].params.orogeny = 1;
  const ruggedField = createLandscapeField(rugged);

  const totalVariation = (target) => {
    let total = 0;
    for (let i = 1; i < 300; i++) {
      total += Math.abs(target.elevationAt(i * 50, 0, 50) - target.elevationAt((i - 1) * 50, 0, 50));
    }
    return total;
  };
  // Search a land point so both documents are compared in comparable terrain.
  let x = 0;
  let z = 0;
  for (let r = 0; r < 4_000 && flatField.elevationAt(x, z, 500) < 50; r++) {
    x = Math.cos(r * 0.7) * r * 400;
    z = Math.sin(r * 0.7) * r * 400;
  }
  const pick = (field) => {
    let total = 0;
    for (let i = 1; i < 200; i++) {
      total += Math.abs(field.elevationAt(x + i * 60, z, 60) - field.elevationAt(x + (i - 1) * 60, z, 60));
    }
    return total;
  };
  assert.ok(pick(ruggedField) > pick(flatField), 'rugged must be rougher than flat');
  assert.ok(totalVariation(flatField) < 1e4, 'disabling relief must stay near-flat');
});

test('LOD sampling is consistent: a coarse sample tracks the fine mean', () => {
  const field = createLandscapeField(makeDoc());
  const probes = [[-120_000, 40_000], [33_000, -71_000], [150_000, 150_000]];
  for (const [x, z] of probes) {
    let fine = 0;
    const n = 8;
    for (let i = 0; i < n; i++) fine += field.elevationAt(x + i * 4, z, 4);
    fine /= n;
    const coarse = field.elevationAt(x, z, 32);
    // Coarse and fine differ by detail only, never by a whole landform.
    assert.ok(Math.abs(fine - coarse) < 400, `LOD drift of ${Math.abs(fine - coarse)} m at ${x},${z}`);
  }
});

// ---------------------------------------------------------------------------
// Landform stamps
// ---------------------------------------------------------------------------

test('every stamp kind builds a finite volume and only inside its bounds', () => {
  for (const kind of LANDMASS_STAMP_KINDS) {
    const doc = makeDoc();
    const layer = landformLayer(doc);
    const stamp = addStamp(doc, layer.id, {
      kind: kind.id,
      x: 5_000,
      z: -5_000,
      radius: kind.defaultRadius,
      height: kind.defaultHeight,
      seed: 5,
    });
    assert.ok(stamp.bounds, `${kind.id} must be culled by bounds`);
    const withStamp = createLandscapeField(doc);
    const withoutDoc = makeDoc();
    withoutDoc.layers = doc.layers.map((entry) => (entry.kind === 'landform' ? { ...entry, ops: [] } : entry));
    const without = createLandscapeField(withoutDoc);

    // Far outside the stamp the two fields agree exactly (bounds culling works).
    const outsideX = stamp.bounds.maxX + stamp.radius * 4;
    assert.equal(withStamp.elevationAt(outsideX, 0, 64), without.elevationAt(outsideX, 0, 64));

    // Inside, the stamp actually does something.
    const centre = withStamp.elevationAt(stamp.x, stamp.z, 32) - without.elevationAt(stamp.x, stamp.z, 32);
    assert.ok(Number.isFinite(centre));
    assert.ok(Math.abs(centre) > 1, `${kind.id} should displace the surface at its centre, got ${centre}`);
    if (stamp.negative) assert.ok(centre < 0, `${kind.id} should carve`);
    else assert.ok(centre > 0, `${kind.id} should raise`);
  }
});

test('crater builds a rim above its floor; canyon cuts a trench', () => {
  const doc = makeDoc();
  doc.layers[0].params.hillsRelief = 0;
  doc.layers[0].params.detailRelief = 0;
  doc.layers[0].params.orogeny = 0;
  doc.layers[0].params.landCoverage = 0.8;
  const layer = landformLayer(doc);
  const crater = addStamp(doc, layer.id, { kind: 'crater', x: 0, z: 0, radius: 6_000, height: 800, roughness: 0, seed: 3 });
  const field = createLandscapeField(doc);
  const floor = field.elevationAt(0, 0, 40);
  const rim = Math.max(
    field.elevationAt(crater.radius * 0.86, 0, 40),
    field.elevationAt(-crater.radius * 0.86, 0, 40),
    field.elevationAt(0, crater.radius * 0.86, 40)
  );
  assert.ok(rim > floor, `crater rim (${rim}) must stand above its floor (${floor})`);

  const doc2 = makeDoc();
  doc2.layers[0].params.landCoverage = 0.8;
  const canyon = addStamp(doc2, landformLayer(doc2).id, { kind: 'canyon', x: 0, z: 0, radius: 5_000, height: 600, seed: 9 });
  const field2 = createLandscapeField(doc2);
  const trench = field2.elevationAt(canyon.x, canyon.z, 40);
  const shoulder = field2.elevationAt(canyon.x, canyon.z + canyon.radius * 0.9, 40);
  assert.ok(trench < shoulder, `canyon (${trench}) must cut below its shoulder (${shoulder})`);
});

// ---------------------------------------------------------------------------
// Sculpt strokes
// ---------------------------------------------------------------------------

test('each sculpt tool changes the field only inside the stroke bounds', () => {
  const reference = makeDoc();
  const referenceField = createLandscapeField(reference);

  for (const tool of SCULPT_TOOLS) {
    const doc = makeDoc();
    const stroke = createStroke({ tool: tool.id, radius: 1_200, strength: 0.8, seed: 21, target: 100 });
    pushStrokePoint(stroke, -40_000, 20_000);
    pushStrokePoint(stroke, -34_000, 24_000);
    pushStrokePoint(stroke, -30_000, 30_000);
    sculptLayer(doc).ops.push(stroke);

    const field = createLandscapeField(doc);
    const inside = field.elevationAt(-36_000, 24_000, 16) - referenceField.elevationAt(-36_000, 24_000, 16);
    // Smoothing an already-smooth surface is legitimately a no-op, so the bar
    // differs per tool. Raise/lower must move real volume.
    const floor = tool.id === 'raise' || tool.id === 'lower' ? 1 : 1e-4;
    assert.ok(Math.abs(inside) > floor, `${tool.id} must affect the surface, delta was ${inside}`);

    const farX = stroke.bounds.maxX + stroke.radius * 3;
    assert.equal(
      field.elevationAt(farX, 24_000, 16),
      referenceField.elevationAt(farX, 24_000, 16),
      `${tool.id} must not leak outside its bounds`
    );
  }
});

test('raise then lower restores the surface approximately', () => {
  const base = makeDoc();
  const baseField = createLandscapeField(base);

  const doc = makeDoc();
  const up = createStroke({ tool: 'raise', radius: 800, strength: 0.5, seed: 4 });
  pushStrokePoint(up, 60_000, 60_000);
  sculptLayer(doc).ops.push(up);
  const raisedField = createLandscapeField(doc);
  const raised = raisedField.elevationAt(60_000, 60_000, 8);
  const original = baseField.elevationAt(60_000, 60_000, 8);
  assert.ok(raised > original);

  const down = createStroke({ tool: 'lower', radius: 800, strength: 0.5, seed: 4 });
  pushStrokePoint(down, 60_000, 60_000);
  sculptLayer(doc).ops.push(down);
  const restored = createLandscapeField(doc).elevationAt(60_000, 60_000, 8);
  assert.ok(Math.abs(restored - original) < Math.abs(raised - original) * 0.35);
});

test('stroke points are decimated by spacing, and bounds track the chain', () => {
  const stroke = createStroke({ tool: 'raise', radius: 300, strength: 0.5, seed: 1 });
  assert.equal(pushStrokePoint(stroke, 0, 0), true);
  assert.equal(pushStrokePoint(stroke, 10, 0, 1, 100), false, 'a too-close point is rejected');
  assert.equal(pushStrokePoint(stroke, 200, 0, 1, 100), true);
  assert.equal(stroke.points.length, 2);
  assert.ok(stroke.bounds.minX <= -300 * 2.35);
  assert.ok(stroke.bounds.maxX >= 200 + 300 * 2.35);
});

// ---------------------------------------------------------------------------
// Dirty tracking / tiling
// ---------------------------------------------------------------------------

test('dirty-region diffing reports only touched tiles', () => {
  const doc = makeDoc();
  touchDocument(doc);
  const before = deserializeLandscapeDocument(serializeLandscapeDocumentText(doc));

  const stamp = addStamp(doc, landformLayer(doc).id, { kind: 'island', x: 500_000, z: -500_000, radius: 4_000, height: 300 });
  const diff = diffDocument(before, doc);
  assert.equal(diff.full, false);
  assert.ok(diff.tiles.length >= 1);
  // Every reported tile must actually overlap the edited stamp's footprint.
  const expected = worldToTile(stamp.x, stamp.z, doc.world.tileMeters);
  const overlaps = diff.tiles.some((tile) => tile.coarse
    || (tile.tx <= expected.tx && expected.tx <= tile.tx + 1
      && tile.tz <= expected.tz && expected.tz <= tile.tz + 1)
    || (Math.abs(tile.tx - expected.tx) <= 1 && Math.abs(tile.tz - expected.tz) <= 1));
  assert.ok(overlaps, 'the edited stamp must appear in the dirty tile set');
  assert.equal(diff.ops.length, 1);

  // A base-parameter change invalidates everything, honestly reported as full.
  doc.layers[0].params.landCoverage = 0.6;
  touchDocument(doc);
  const fullDiff = diffDocument(before, doc);
  assert.equal(fullDiff.full, true);
});

test('bounds-to-tile mapping expands conservatively and stays capped', () => {
  const tiles = tilesForBounds({ minX: 0, maxX: 3_000, minZ: 0, maxZ: 3_000 }, 1_024);
  assert.equal(tiles.length, 9, 'three tiles per axis for a 3 km box at 1,024 m pitch');
  const huge = tilesForBounds({ minX: -2e6, maxX: 2e6, minZ: -2e6, maxZ: 2e6 }, 1_024);
  assert.equal(huge.length, 1, 'a continent-sized edit reports one coarse span, not millions of keys');
  assert.equal(huge[0].coarse, true);
});

test('tile scheduler respects its memory budget and evicts by least-recent use', () => {
  const evicted = [];
  const scheduler = new LandscapeTileScheduler({
    budgetBytes: 64 * 1024,
    tilesPerFrame: 4,
    maxTiles: 4,
    onEvict: (tile) => evicted.push(tile.key),
  });
  const build = (descriptor) => ({
    data: { geometry: null },
    bytes: estimateTileBytes(100, 300),
    key: descriptor.key,
  });
  for (let i = 0; i < 12; i++) {
    scheduler.request(`t${i}`, { key: `t${i}`, lod: 0, revision: 1 }, i);
    scheduler.pump(build);
  }
  const report = scheduler.report();
  assert.ok(report.tiles <= 4, `max tile count ignored: ${report.tiles}`);
  assert.ok(report.bytes <= 64 * 1024, `budget exceeded: ${report.bytes}`);
  assert.ok(report.evicted > 0, 'something should have been evicted');
  assert.ok(evicted.length > 0);

  // Recently used tiles survive; the oldest go first.
  scheduler.clear();
  for (let i = 0; i < 4; i++) {
    scheduler.request(`k${i}`, { key: `k${i}`, lod: 0, revision: 1 }, i);
    scheduler.pump(build);
  }
  scheduler.get('k0');
  scheduler.request('k4', { key: 'k4', lod: 0, revision: 1 }, 9);
  scheduler.pump(build);
  assert.ok(scheduler.get('k0'), 'recently used tile must not be evicted');
});

test('queued work for out-of-view tiles is cancelled instead of built', () => {
  const scheduler = new LandscapeTileScheduler({ budgetBytes: 1e9, tilesPerFrame: 1 });
  let built = 0;
  scheduler.request('a', { key: 'a', lod: 0, revision: 1 }, 1);
  scheduler.request('b', { key: 'b', lod: 0, revision: 1 }, 2);
  scheduler.cancel('a');
  scheduler.pump(() => {
    built += 1;
    return { data: {}, bytes: 8 };
  });
  assert.equal(built, 1, 'cancelled tile must not be built');
  assert.ok(scheduler.get('b'));
});

test('ring selection covers near and far without duplicating tiles', () => {
  const selected = selectTilesAround({ focusX: 0, focusZ: 0, viewDistance: 2_000_000, revision: 1, maxTiles: 400 });
  assert.ok(selected.length > 20);
  const keys = new Set(selected.map((tile) => tile.key));
  assert.equal(keys.size, selected.length, 'no duplicate tiles');
  assert.ok(selected.some((tile) => tile.ring === 0), 'near ring must be present');
  assert.ok(selected.some((tile) => tile.ring >= 3), 'far rings must be present');
  assert.ok(RING_LOD.every((ring, index) => index === 0 || ring.tileMeters > RING_LOD[index - 1].tileMeters));
});

// ---------------------------------------------------------------------------
// Ocean inputs
// ---------------------------------------------------------------------------

test('ocean connectivity separates enclosed basins from the open sea', () => {
  const doc = makeDoc({ spanMeters: 200_000 });
  doc.layers[0].params.landCoverage = 0.55;
  const layer = landformLayer(doc);
  // Ring of land around a depression: the middle must stay disconnected.
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    ring.push([Math.cos(angle) * 14_000, Math.sin(angle) * 14_000]);
  }
  for (const [x, z] of ring) {
    addStamp(doc, layer.id, { kind: 'island', x, z, radius: 7_000, height: 900, seed: 17 });
  }
  addStamp(doc, layer.id, { kind: 'basin', x: 0, z: 0, radius: 6_000, height: 1_200, seed: 19 });

  const field = createLandscapeField(doc);
  const connectivity = computeOceanConnectivity(field, {
    originX: -60_000,
    originZ: -60_000,
    spanMeters: 120_000,
    spacingMeters: 1_200,
    seaLevel: 0,
  });
  assert.equal(connectivity.mask.length, connectivity.nx * connectivity.nx);
  const centreIndex = Math.floor(connectivity.nx / 2) * connectivity.nx + Math.floor(connectivity.nx / 2);
  const centreBed = connectivity.heights[centreIndex];
  if (centreBed < 0) {
    assert.equal(connectivity.mask[centreIndex], 0, 'an enclosed basin must not be marked ocean-connected');
  }
  // Every masked cell must genuinely be below sea level.
  let masked = 0;
  for (let i = 0; i < connectivity.mask.length; i++) {
    if (!connectivity.mask[i]) continue;
    masked += 1;
    assert.ok(connectivity.heights[i] < 0, 'connected mask must only cover submerged cells');
  }
  const submerged = Array.from(connectivity.heights).filter((h) => h < 0).length;
  if (submerged > 0) assert.ok(masked > 0, 'open water in the window must be marked connected');
});

// ---------------------------------------------------------------------------
// Engine mesh pipeline integration
// ---------------------------------------------------------------------------

test('a landscape chunk feeds the existing sparse SDF dual contouring pipeline', () => {
  const doc = makeDoc({ spanMeters: 60_000 });
  addStamp(doc, landformLayer(doc).id, { kind: 'island', x: 0, z: 0, radius: 12_000, height: 700, seed: 5 });
  const field = createLandscapeField(doc);

  const lattice = buildChunkSdfLattice(field, {
    tx: -1,
    tz: -1,
    chunkMeters: 20_000,
    voxelMeters: 260,
    baseCellMeters: 120,
  });

  assert.equal(lattice.values.length, lattice.gx * lattice.gy * lattice.gz);
  assert.ok(lattice.nx > 4 && lattice.ny > 4 && lattice.nz > 4);
  // Field sign convention: below the surface is negative.
  const inside = lattice.values[0];
  assert.ok(Number.isFinite(inside));
  const midSample = lattice.ensureSample(1, 1, 1);
  assert.ok(Number.isFinite(midSample));

  const mesh = extractDualContourMesh(lattice, { qefRegularization: 0.05 });
  assert.ok(mesh.positions.length > 0, 'dual contouring must emit vertices for a real surface');
  assert.ok(mesh.indices.length > 0, 'dual contouring must emit triangles');
  assert.equal(mesh.positions.length % 3, 0);
  assert.equal(mesh.indices.length % 3, 0);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    assert.ok(Number.isFinite(mesh.positions[i]));
    assert.ok(mesh.positions[i + 1] > -2_000 && mesh.positions[i + 1] < 4_000, 'mesh must sit inside the lattice');
  }
  const maxIndex = Math.max(...mesh.indices);
  assert.ok(maxIndex < mesh.positions.length / 3, 'indices must be in range');

  // Vertices should land near the actual authored surface.
  let checked = 0;
  for (let i = 0; i < mesh.positions.length && checked < 40; i += 3 * 37) {
    const x = mesh.positions[i];
    const y = mesh.positions[i + 1];
    const z = mesh.positions[i + 2];
    const elevation = field.elevationAt(x, z, 260);
    assert.ok(Math.abs(y - elevation) < 900, `vertex ${checked} is ${Math.abs(y - elevation)} m off the authored surface`);
    checked += 1;
  }
});

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

test('every landscape shader passes the declaration-before-use scope check', () => {
  const pairs = [
    ['terrain', TERRAIN_VERTEX, TERRAIN_FRAGMENT],
    ['ocean', OCEAN_VERTEX, OCEAN_FRAGMENT],
    ['sky', SKY_VERTEX, SKY_FRAGMENT],
  ];
  for (const [name, vertex, fragment] of pairs) {
    assert.deepEqual(checkGlslScopes(vertex, `${name}-vertex`), []);
    assert.deepEqual(checkGlslScopes(fragment, `${name}-fragment`), []);
  }
});

test('ocean shader implements the physical pieces the brief requires', () => {
  const fragment = OCEAN_FRAGMENT;
  // Not a fake ocean: depth-graded absorption, Fresnel, sun specular, foam.
  assert.match(fragment, /transmittance\s*=\s*exp\(/);
  assert.match(fragment, /float fresnel\s*=/);
  assert.match(fragment, /specular/);
  assert.match(fragment, /foam/);
  // Surf must be driven by the simulated shoreline field (the bed texture's
  // surf channel plus advected whitewater), not by a constant.
  assert.match(fragment, /uBedTex/);
  assert.match(fragment, /breaker/);
  // Swell is Gerstner with analytic normals, not a scrolling texture.
  assert.match(OCEAN_VERTEX, /result\.offset\.x \+= d\.x/);
  assert.match(OCEAN_VERTEX, /result\.normal\.x -=/);
  // Terrain shading is flat lithology, no procedural colour noise.
  assert.doesNotMatch(TERRAIN_FRAGMENT, /hash|noise\(|noiseTexture/);
  assert.match(TERRAIN_FRAGMENT, /uSnowLine/);
});

test('ocean surface normals come from the simulated water, not the sea bed', () => {
  // A bed-derived normal would tilt the whole ocean towards the sea floor, which
  // is the classic "fake ocean" tell at the shoreline.
  assert.match(OCEAN_VERTEX, /stateAt\(c \+ ivec2\(-1, 0\)\)\.r/);
  assert.doesNotMatch(OCEAN_VERTEX, /bedAt\(c \+ ivec2\(-1, 0\)\)/);
});

test('the ocean simulation publishes a real surf field and a moving breaker line', () => {
  const sim = makeOceanSimDouble();
  const size = 64;
  const heights = new Float32Array(size * size);
  const connectivity = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    // Sea floor sloping from deep water into a beach at the far edge.
    const iz = (i / size) | 0;
    heights[i] = -400 + iz * 8;
    connectivity[i] = 1;
  }
  sim.syncBed(heights, connectivity, 0);
  const surf = sim._bedData;
  assert.ok(surf.some((value, index) => index % 4 === 2 && value > 0.5), 'shallow water must be marked breaking');
  assert.equal(surf[2], 0, 'deep water must not break');
  // Row 49 is the last wet row: the bed crosses sea level exactly there.
  const beachRow = 49;
  assert.ok(surf[(beachRow * size + 5) * 4 + 2] > 0.5, 'the surf band sits where the bed meets the surface');
  assert.ok(surf[(size - 1) * size * 4 + 2] === 0, 'dry land does not break');

  // Foam has to survive on screen long enough to be seen, and must be
  // advected by the simulated velocity rather than painted in place.
  const integrate = sim.integrateMaterial.fragmentShader;
  assert.match(integrate, /foam/i);
  assert.match(integrate, /velocity|uStateTex/);
  const fragment = OCEAN_FRAGMENT;
  assert.match(fragment, /surfPulse/);
  assert.match(fragment, /uTime/, 'the breaker line animates');
});

// ---------------------------------------------------------------------------
// Performance guardrails
// ---------------------------------------------------------------------------

test('distant LOD samples do less work than near LOD samples', () => {
  // Deterministic part: the octave budget that actually drives the cost.
  assert.ok(
    octaveBudget(34_000, 3_000, 12) < octaveBudget(34_000, 2, 12),
    'coarse sampling must evaluate fewer octaves'
  );

  const field = createLandscapeField(makeDoc());
  const cost = (cell) => {
    // Best of three to keep this a work measurement rather than a scheduler
    // measurement; GC and JIT warm-up otherwise dominate at these sizes.
    let best = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      for (let i = 0; i < 6_000; i++) {
        field.elevationAt((i % 200) * 3_000, Math.floor(i / 200) * 3_000, cell);
      }
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };
  const near = cost(2);
  const far = cost(3_000);
  assert.ok(far <= near * 1.15, `far LOD (${far.toFixed(1)} ms) should not cost more than near LOD (${near.toFixed(1)} ms)`);
});

test('a preview tile can be evaluated inside a tight per-frame budget', () => {
  const field = createLandscapeField(makeDoc());
  const started = performance.now();
  const mesh = buildRegionMesh(field, { tx: 0, tz: 0, chunkMeters: 1_024, cellMeters: 32, lod: 2 });
  const elapsed = performance.now() - started;
  assert.equal(mesh.heights.length, 33 * 33);
  assert.ok(elapsed < 400, `a 32 m tile took ${elapsed.toFixed(0)} ms, too slow for streaming`);
});
