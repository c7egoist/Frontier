/**
 * Planet-scale SDF landscape document.
 *
 * The document is the authored truth: a tiny, sparse, serialisable description
 * of a landscape. It never stores a heightmap and never stores a voxel grid.
 * Every tile of every LOD is a pure function of this document plus absolute
 * world coordinates, which is what allows hundreds of kilometres of terrain to
 * be regenerated on demand in any order, in any resolution, on any thread,
 * with exact seam agreement and a working set measured in megabytes.
 *
 * Storage budget notes (why this survives an HDD):
 *   A 3,000 km landscape at 1 m authoring detail would be 9e12 voxels. Here the
 *   same landscape is ~2-40 KB of JSON: a handful of landform stamps and brush
 *   strokes with bounding boxes. Only the *visible* region is ever realised as
 *   triangles, and only tiles that changed are re-evaluated. Nothing is paged
 *   from disk during play, so a seek-limited HDD is never in the hot path.
 *
 * Layer kinds that are not implemented yet still exist here so the outliner,
 * inspector, serialisation and invalidation logic are already correct when the
 * erosion work is ported (see Docs/PlanetLandmassPlan.md).
 */

import { clamp, hash2, TAU } from './landscape-math.js';

export const LANDSCAPE_DOCUMENT_VERSION = 3;

/** Grid pitch used to address dirty regions (metres). Tiles are addressed as
 * integer multiples of this, never as a global array index. */
export const DEFAULT_TILE_METERS = 1024;

export const WORLD_SIZE_MIN_METERS = 50_000;
export const WORLD_SIZE_MAX_METERS = 40_000_000;
export const WORLD_SIZE_DEFAULT_METERS = 3_200_000;

export const SCULPT_VOXEL_MIN_METERS = 0.25;
export const SCULPT_VOXEL_MAX_METERS = 32;
export const SCULPT_VOXEL_DEFAULT_METERS = 2;

/**
 * Layer kind registry. `available: false` entries are planned work: they are
 * listed in the editor with their category so the pipeline order is explicit,
 * but they cannot be committed until their implementation lands.
 */
export const LANDSCAPE_LAYER_KINDS = Object.freeze({
  base: Object.freeze({
    id: 'base',
    label: 'Planetary Base',
    category: 'Landform',
    available: true,
    description: 'Continents, ocean basins, continental shelves and mountain belts',
    singleton: true,
  }),
  landform: Object.freeze({
    id: 'landform',
    label: 'Landform Stamps',
    category: 'Landform',
    available: true,
    description: 'Islands, continents, plateaus, mesas, ridges, canyons, craters, basins, straits',
  }),
  sculpt: Object.freeze({
    id: 'sculpt',
    label: 'SDF Sculpt',
    category: 'Landform',
    available: true,
    description: 'Destructive-free brush strokes evaluated into the SDF lattice',
  }),
  erosion: Object.freeze({
    id: 'erosion',
    label: 'Particle Erosion',
    category: 'Simulation',
    available: false,
    description: 'Rain, hydraulic, thermal, wind and cryo particle erosion baked into the SDF',
  }),
  sediment: Object.freeze({
    id: 'sediment',
    label: 'Sedimentation Beds',
    category: 'Simulation',
    available: false,
    description: 'Stratigraphic beds, deposition layers and chemical cementation',
  }),
  cracks: Object.freeze({
    id: 'cracks',
    label: 'Fracture & Cracks',
    category: 'Detail',
    available: false,
    description: 'Joint network subtraction on the mesh output (SDF cannot hold hairline cracks)',
  }),
  ocean: Object.freeze({
    id: 'ocean',
    label: 'Ocean & Shore',
    category: 'Water',
    available: true,
    description: 'Sea level, swell, surf and shelf-driven shoreline simulation',
  }),
});

export const LANDMASS_STAMP_KINDS = Object.freeze([
  Object.freeze({ id: 'island', label: 'Island', defaultRadius: 4_200, defaultHeight: 420 }),
  Object.freeze({ id: 'continent', label: 'Continent', defaultRadius: 260_000, defaultHeight: 3_100 }),
  Object.freeze({ id: 'plateau', label: 'Plateau', defaultRadius: 9_000, defaultHeight: 780 }),
  Object.freeze({ id: 'mesa', label: 'Mesa / Butte', defaultRadius: 2_400, defaultHeight: 520 }),
  Object.freeze({ id: 'ridge', label: 'Ridge / Spine', defaultRadius: 12_000, defaultHeight: 1_400 }),
  Object.freeze({ id: 'canyon', label: 'Canyon', defaultRadius: 6_000, defaultHeight: 640 }),
  Object.freeze({ id: 'crater', label: 'Impact Crater', defaultRadius: 5_200, defaultHeight: 340 }),
  Object.freeze({ id: 'basin', label: 'Basin / Gulf', defaultRadius: 22_000, defaultHeight: 900 }),
  Object.freeze({ id: 'strait', label: 'Strait', defaultRadius: 15_000, defaultHeight: 500 }),
  Object.freeze({ id: 'delta', label: 'River Delta', defaultRadius: 3_400, defaultHeight: 90 }),
]);

const STAMP_IDS = new Set(LANDMASS_STAMP_KINDS.map((kind) => kind.id));

/** Stamp kinds that remove volume by default (they cut into the field). */
export const CARVING_STAMP_KINDS = Object.freeze(new Set(['basin', 'canyon', 'strait', 'crater']));

export const SCULPT_TOOLS = Object.freeze([
  Object.freeze({ id: 'raise', label: 'Raise', hint: 'Add volume to the SDF' }),
  Object.freeze({ id: 'lower', label: 'Lower', hint: 'Remove volume from the SDF' }),
  Object.freeze({ id: 'smooth', label: 'Smooth', hint: 'Relax the surface toward its local mean' }),
  Object.freeze({ id: 'flatten', label: 'Flatten', hint: 'Level to the height under the cursor' }),
  Object.freeze({ id: 'terrace', label: 'Terrace', hint: 'Quantise elevation into stepped benches' }),
  Object.freeze({ id: 'sharpen', label: 'Sharpen', hint: 'Crisp up a ridge line along the stroke' }),
  Object.freeze({ id: 'noise', label: 'Roughen', hint: 'Add authored fractal relief' }),
]);

const SCULPT_TOOL_IDS = new Set(SCULPT_TOOLS.map((tool) => tool.id));

let layerCounter = 0;

function nextLayerId(kind) {
  layerCounter += 1;
  return `${kind}-${Date.now().toString(36)}-${layerCounter.toString(36)}`;
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asId(value, fallbackPrefix) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  layerCounter += 1;
  return `${fallbackPrefix}-${layerCounter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Base terrain parameters
// ---------------------------------------------------------------------------

export const DEFAULT_BASE_PARAMS = Object.freeze({
  seaLevel: 0,
  /** Cell size of the global continent generator (metres). */
  continentCellMeters: 1_150_000,
  /** Sea level through the craton potential: fraction of the world covered by land. */
  landCoverage: 0.34,
  continentHeightMeters: 1_650,
  /** Global ocean floor below sea level. */
  abyssalDepthMeters: 4_900,
  shelfWidthMeters: 46_000,
  shelfSlopeDepthMeters: 900,
  /** Macro ruggedness of the cratons (0..1). */
  macroRelief: 0.55,
  /** Mountain belt strength (0..1). */
  orogeny: 0.62,
  orogenyCellMeters: 620_000,
  /** Hill-band relief (0..1): local slope and gully character. */
  hillsRelief: 0.55,
  /** Fine relief (0..1) and its base wavelength in metres. */
  detailRelief: 0.48,
  detailScaleMeters: 34_000,
  /** Snow line in metres. 0 = automatic, derived from the continent relief. */
  snowLineMeters: 0,
  /** Coastal roughness: how torn up the coastline is (0..1). */
  coastRoughness: 0.55,
  /** Inland lake / depression carving (0..1). */
  basinCarving: 0.34,
  /** How far terrain continues past the authored span: 'ocean' or 'infinite'. */
  edgeMode: 'infinite',
  /** Author seed. */
  seed: 4029,
});

export function normalizeBaseParams(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const d = DEFAULT_BASE_PARAMS;
  return {
    seaLevel: clamp(finite(src.seaLevel, 0), -2_000, 2_000),
    continentCellMeters: clamp(finite(src.continentCellMeters, d.continentCellMeters), 80_000, 8_000_000),
    landCoverage: clamp(finite(src.landCoverage, d.landCoverage), 0.02, 0.95),
      continentHeightMeters: clamp(finite(src.continentHeightMeters, d.continentHeightMeters), 60, 9_000),
    abyssalDepthMeters: clamp(finite(src.abyssalDepthMeters, d.abyssalDepthMeters), 120, 11_000),
    shelfWidthMeters: clamp(finite(src.shelfWidthMeters, d.shelfWidthMeters), 800, 400_000),
    shelfSlopeDepthMeters: clamp(finite(src.shelfSlopeDepthMeters, d.shelfSlopeDepthMeters), 40, 4_000),
    macroRelief: clamp(finite(src.macroRelief, d.macroRelief), 0, 1),
    orogeny: clamp(finite(src.orogeny, d.orogeny), 0, 1),
    orogenyCellMeters: clamp(finite(src.orogenyCellMeters, d.orogenyCellMeters), 40_000, 4_000_000),
    hillsRelief: clamp(finite(src.hillsRelief, d.hillsRelief), 0, 1),
    detailRelief: clamp(finite(src.detailRelief, d.detailRelief), 0, 1),
    detailScaleMeters: clamp(finite(src.detailScaleMeters, d.detailScaleMeters), 400, 400_000),
    snowLineMeters: clamp(finite(src.snowLineMeters, d.snowLineMeters), 0, 9_000),
    coastRoughness: clamp(finite(src.coastRoughness, d.coastRoughness), 0, 1),
    basinCarving: clamp(finite(src.basinCarving, d.basinCarving), 0, 1),
    edgeMode: src.edgeMode === 'ocean' ? 'ocean' : 'infinite',
    seed: Math.round(finite(src.seed, d.seed)) >>> 0,
  };
}

// ---------------------------------------------------------------------------
// Operations (stamps + brush strokes)
// ---------------------------------------------------------------------------

function stampBounds(radius, squishX = 1, squishZ = 1) {
  return {
    minX: -radius * squishX,
    maxX: radius * squishX,
    minZ: -radius * squishZ,
    maxZ: radius * squishZ,
  };
}

/**
 * A landform stamp: one authored mass of land or water. Stamps are pure
 * analytic volumes, so the same island is byte-identical at every LOD.
 */
export function createStamp({ kind = 'island', x = 0, z = 0, seed = 1, ...rest } = {}) {
  const base = LANDMASS_STAMP_KINDS.find((entry) => entry.id === kind) || LANDMASS_STAMP_KINDS[0];
  const stampKind = STAMP_IDS.has(kind) ? kind : 'island';
  const radius = clamp(finite(rest.radius, base.defaultRadius), 25, 2_000_000);
  const height = clamp(finite(rest.height, base.defaultHeight), 1, 12_000);
  const op = {
    type: 'stamp',
    id: asId(rest.id, 'stamp'),
    kind: stampKind,
    x: q(finite(x, 0), 2),
    z: q(finite(z, 0), 2),
    seed: Math.round(finite(seed, 1)) >>> 0,
    radius: q(radius, 2),
    height: q(height, 2),
    angle: q(finite(rest.angle, hash2(seed, 11, 5) * TAU), 5),
    stretch: q(clamp(finite(rest.stretch, 0.72 + hash2(seed, 23, 7) * 0.85), 0.25, 4), 4),
    sharpness: q(clamp(finite(rest.sharpness, 0.45), 0, 1), 4),
    roughness: q(clamp(finite(rest.roughness, 0.4), 0, 1), 4),
    erosion: q(clamp(finite(rest.erosion, 0.35), 0, 1), 4),
    negative: Boolean(rest.negative ?? CARVING_STAMP_KINDS.has(stampKind)),
    blend: q(finite(rest.blend, 0.55), 4),
  };
  const bx = stampBounds(op.radius * 3.2, op.stretch * 1.6, 1.6);
  op.bounds = {
    minX: op.x + bx.minX,
    maxX: op.x + bx.maxX,
    minZ: op.z + bx.minZ,
    maxZ: op.z + bx.maxZ,
  };
  return op;
}

/**
 * A brush stroke: a chain of stamped capsules. Storing the chain (rather than
 * baked height samples) keeps sculpting non-destructive and resolution
 * independent; the SDF is re-evaluated from the chain at whatever detail a tile
 * asks for.
 */
export function createStroke({ tool = 'raise', points = [], radius = 900, strength = 0.5, seed = 1, target = null } = {}) {
  const op = {
    type: 'stroke',
    id: asId(seed === 1 ? null : `stroke-${seed}`, 'stroke'),
    tool: SCULPT_TOOL_IDS.has(tool) ? tool : 'raise',
    radius: q(clamp(finite(radius, 900), 8, 400_000), 2),
    strength: q(clamp(finite(strength, 0.5), 0, 4), 4),
    seed: Math.round(finite(seed, 1)) >>> 0,
    target: Number.isFinite(Number(target)) ? Number(target) : null,
    points: [],
  };
  for (const point of points) {
    pushStrokePoint(op, point.x ?? point[0], point.z ?? point[1] ?? point[2], point.p ?? 1);
  }
  return op;
}

export function pushStrokePoint(stroke, x, z, pressure = 1, minSpacing = 0) {
  const px = finite(x, 0);
  const pz = finite(z, 0);
  const last = stroke.points[stroke.points.length - 1];
  if (last && minSpacing > 0 && Math.hypot(px - last.x, pz - last.z) < minSpacing) return false;
  stroke.points.push({ x: q(px, 3), z: q(pz, 3), p: q(clamp(finite(pressure, 1), 0, 1), 3) });
  recomputeStrokeBounds(stroke);
  return true;
}

export function recomputeStrokeBounds(stroke) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of stroke.points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  if (!Number.isFinite(minX)) {
    stroke.bounds = null;
    return stroke;
  }
  // A stroke's falloff reaches ~2.2 radii beyond the point chain, plus the
  // fractal perturbation of tools like 'noise'. Expanding here keeps the
  // bucket lookup conservative so no tile is ever missed.
  const reach = stroke.radius * 2.35;
  stroke.bounds = { minX: minX - reach, maxX: maxX + reach, minZ: minZ - reach, maxZ: maxZ + reach };
  return stroke;
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

export function createLayer(kind, overrides = {}) {
  const spec = LANDSCAPE_LAYER_KINDS[kind] || LANDSCAPE_LAYER_KINDS.landform;
  const layer = {
    id: asId(overrides.id, spec.id),
    kind: spec.id,
    name: typeof overrides.name === 'string' && overrides.name.trim() ? overrides.name.trim() : spec.label,
    visible: overrides.visible !== false,
    opacity: clamp(finite(overrides.opacity, 1), 0, 1),
    blend: overrides.blend === 'replace' || overrides.blend === 'min' ? overrides.blend : 'max',
    locked: Boolean(overrides.locked),
    ops: Array.isArray(overrides.ops) ? overrides.ops : [],
    params: overrides.params && typeof overrides.params === 'object' ? { ...overrides.params } : {},
  };
  if (spec.id === 'base') layer.params = normalizeBaseParams(layer.params);
  return layer;
}

export function findLayer(doc, id) {
  return doc.layers.find((layer) => layer.id === id) || null;
}

export function ensureLayer(doc, kind) {
  let layer = doc.layers.find((entry) => entry.kind === kind);
  if (!layer) {
    layer = createLayer(kind);
    doc.layers.push(layer);
  }
  return layer;
}

export function addLayer(doc, kind, overrides = {}) {
  const spec = LANDSCAPE_LAYER_KINDS[kind];
  if (!spec || !spec.available) return null;
  if (spec.singleton && doc.layers.some((layer) => layer.kind === kind)) {
    return doc.layers.find((layer) => layer.kind === kind);
  }
  const layer = createLayer(kind, overrides);
  doc.layers.push(layer);
  return layer;
}

export function removeLayer(doc, id) {
  const index = doc.layers.findIndex((layer) => layer.id === id);
  if (index < 0) return null;
  const [removed] = doc.layers.splice(index, 1);
  return removed;
}

export function moveLayer(doc, id, delta) {
  const index = doc.layers.findIndex((layer) => layer.id === id);
  if (index < 0) return index;
  const next = clamp(index + delta, 0, doc.layers.length - 1);
  if (next === index) return next;
  const [layer] = doc.layers.splice(index, 1);
  doc.layers.splice(next, 0, layer);
  return next;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/** Raw constructor. Never normalises, so it is safe to call from the normaliser. */
function buildDefaultDocument(overrides = {}) {
  const doc = {
    version: LANDSCAPE_DOCUMENT_VERSION,
    name: typeof overrides.name === 'string' ? overrides.name : 'Untitled Planet',
    seed: Math.round(finite(overrides.seed, 4029)) >>> 0,
    world: {
      spanMeters: clamp(finite(overrides.spanMeters, WORLD_SIZE_DEFAULT_METERS), WORLD_SIZE_MIN_METERS, WORLD_SIZE_MAX_METERS),
      tileMeters: clamp(finite(overrides.tileMeters, DEFAULT_TILE_METERS), 16, 65_536),
      sculptVoxelMeters: clamp(finite(overrides.sculptVoxelMeters, SCULPT_VOXEL_DEFAULT_METERS), SCULPT_VOXEL_MIN_METERS, SCULPT_VOXEL_MAX_METERS),
      previewCellMeters: clamp(finite(overrides.previewCellMeters, 32), 0.25, 4_096),
      meshMode: overrides.meshMode === 'sdf' ? 'sdf' : 'stream',
    },
    ocean: {
      seaLevel: 0,
      enabled: true,
      waveHeight: 1.35,
      waveLength: 148,
      swellDirectionDeg: 212,
      windSpeed: 11.5,
      choppiness: 0.45,
      foam: 0.75,
      clarity: 0.55,
      speed: 1,
    },
    layers: [],
    revision: 1,
  };

  const base = createLayer('base', {
    id: 'layer-base',
    name: 'Planetary Base',
    params: overrides.baseParams || {},
  });
  base.params.seed = doc.seed;
  base.params.seaLevel = 0;
  doc.layers.push(base);

  doc.layers.push(createLayer('landform', { id: 'layer-landform', name: 'Landforms' }));
  doc.layers.push(createLayer('sculpt', { id: 'layer-sculpt', name: 'SDF Sculpt' }));
  doc.layers.push(createLayer('ocean', { id: 'layer-ocean', name: 'Ocean & Shore' }));

  if (Array.isArray(overrides.layers) && overrides.layers.length) {
    doc.layers = overrides.layers;
  }
  return doc;
}

export function createLandscapeDocument(overrides = {}) {
  const doc = buildDefaultDocument(overrides);
  doc.revision = Math.max(1, Math.round(finite(overrides.revision, 1)));
  return normalizeLandscapeDocument(doc);
}

/** Accepts anything (including a hand-edited JSON file) and returns a doc that
 * the field evaluator can trust. Unknown layer kinds are dropped, not crashed on. */
export function normalizeLandscapeDocument(input) {
  const src = input && typeof input === 'object' ? input : {};
  const doc = buildDefaultDocument({ name: 'Untitled Planet', spanMeters: WORLD_SIZE_DEFAULT_METERS });
  doc.version = LANDSCAPE_DOCUMENT_VERSION;
  doc.name = typeof src.name === 'string' && src.name.trim() ? src.name.trim() : doc.name;
  doc.seed = Math.round(finite(src.seed, doc.seed)) >>> 0;

  const world = src.world && typeof src.world === 'object' ? src.world : {};
  doc.world.spanMeters = clamp(finite(world.spanMeters, doc.world.spanMeters), WORLD_SIZE_MIN_METERS, WORLD_SIZE_MAX_METERS);
  doc.world.tileMeters = clamp(finite(world.tileMeters, doc.world.tileMeters), 16, 65_536);
  doc.world.sculptVoxelMeters = clamp(
    finite(world.sculptVoxelMeters, doc.world.sculptVoxelMeters),
    SCULPT_VOXEL_MIN_METERS,
    SCULPT_VOXEL_MAX_METERS
  );
  doc.world.previewCellMeters = clamp(finite(world.previewCellMeters, doc.world.previewCellMeters), 0.25, 4_096);
  doc.world.meshMode = world.meshMode === 'sdf' ? 'sdf' : 'stream';

  const ocean = src.ocean && typeof src.ocean === 'object' ? src.ocean : {};
  doc.ocean.seaLevel = clamp(finite(ocean.seaLevel, doc.ocean.seaLevel), -2_000, 2_000);
  doc.ocean.enabled = ocean.enabled !== false;
  doc.ocean.waveHeight = clamp(finite(ocean.waveHeight, doc.ocean.waveHeight), 0, 24);
  doc.ocean.waveLength = clamp(finite(ocean.waveLength, doc.ocean.waveLength), 6, 4_000);
  doc.ocean.swellDirectionDeg = clamp(finite(ocean.swellDirectionDeg, doc.ocean.swellDirectionDeg), -360, 360);
  doc.ocean.windSpeed = clamp(finite(ocean.windSpeed, doc.ocean.windSpeed), 0, 60);
  doc.ocean.choppiness = clamp(finite(ocean.choppiness, doc.ocean.choppiness), 0, 1);
  doc.ocean.foam = clamp(finite(ocean.foam, doc.ocean.foam), 0, 1);
  doc.ocean.clarity = clamp(finite(ocean.clarity, doc.ocean.clarity), 0, 1);
  doc.ocean.speed = clamp(finite(ocean.speed, doc.ocean.speed), 0, 4);

  const layers = Array.isArray(src.layers) ? src.layers : [];
  const rebuilt = [];
  let sawBase = false;
  const seenIds = new Set();
  for (const entry of layers) {
    if (!entry || typeof entry !== 'object') continue;
    const spec = LANDSCAPE_LAYER_KINDS[entry.kind];
    if (!spec) continue;
    if (entry.kind === 'base') {
      if (sawBase) continue;
      sawBase = true;
    }
    const layer = createLayer(entry.kind, entry);
    // Duplicate ids would make selection and invalidation ambiguous; keep the
    // first and let the rest go rather than corrupting the stack.
    if (seenIds.has(layer.id)) continue;
    seenIds.add(layer.id);
    layer.ops = (Array.isArray(entry.ops) ? entry.ops : []).map(normalizeOp).filter(Boolean);
    layer.params = entry.kind === 'base' ? normalizeBaseParams({ ...(entry.params || {}), seaLevel: 0 }) : { ...(entry.params || {}) };
    rebuilt.push(layer);
  }
  if (!sawBase) rebuilt.unshift(createLayer('base', { id: 'layer-base', name: 'Planetary Base', params: { seed: doc.seed } }));
  doc.layers = rebuilt.length ? rebuilt : doc.layers;
  const baseLayer = doc.layers.find((layer) => layer.kind === 'base');
  if (baseLayer) {
    baseLayer.params = normalizeBaseParams({ ...baseLayer.params, seaLevel: 0, seed: baseLayer.params?.seed ?? doc.seed });
    baseLayer.params.seed = doc.seed;
  }
  doc.revision = Math.max(1, Math.round(finite(src.revision, 1)));
  return doc;
}

export function normalizeOp(input) {
  if (!input || typeof input !== 'object') return null;
  if (input.type === 'stamp') {
    return createStamp({
      kind: input.kind,
      x: input.x,
      z: input.z,
      radius: input.radius,
      height: input.height,
      seed: input.seed,
      angle: input.angle,
      stretch: input.stretch,
      sharpness: input.sharpness,
      roughness: input.roughness,
      erosion: input.erosion,
      negative: input.negative,
      blend: input.blend,
      id: input.id,
    });
  }
  if (input.type === 'stroke') {
    const stroke = createStroke({
      tool: input.tool,
      radius: input.radius,
      strength: input.strength,
      seed: input.seed,
      target: input.target,
    });
    if (input.id) stroke.id = String(input.id);
    for (const point of Array.isArray(input.points) ? input.points : []) {
      pushStrokePoint(stroke, point.x, point.z, point.p ?? 1);
    }
    return stroke;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mutation + dirty-region tracking
// ---------------------------------------------------------------------------

export function touchDocument(doc) {
  doc.revision = (doc.revision | 0) + 1;
  return doc.revision;
}

export function worldToTile(x, z, tileMeters) {
  return { tx: Math.floor(x / tileMeters), tz: Math.floor(z / tileMeters) };
}

export function tileKey(tx, tz) {
  return `${tx}:${tz}`;
}

export function parseTileKey(key) {
  const [tx, tz] = String(key).split(':');
  return { tx: Number(tx) || 0, tz: Number(tz) || 0 };
}

/** Tile keys covering an operation's influence, clamped to `limit` entries. */
export function tilesForBounds(bounds, tileMeters, limit = 4096) {
  if (!bounds) return [];
  const tiles = [];
  const tx0 = Math.floor(bounds.minX / tileMeters);
  const tx1 = Math.floor(bounds.maxX / tileMeters);
  const tz0 = Math.floor(bounds.minZ / tileMeters);
  const tz1 = Math.floor(bounds.maxZ / tileMeters);
  const width = tx1 - tx0 + 1;
  const depth = tz1 - tz0 + 1;
  if (width * depth > limit) {
    // A continent-sized stamp should not report millions of tiles: the
    // renderer only ever holds a few hundred around the camera, and any tile
    // it asks for later is still correct because the op is a pure function of
    // world position. Reporting the coarse span is enough to invalidate caches.
    return [{ tx: tx0, tz: tz0, tx1, tz1, coarse: true }];
  }
  for (let tz = tz0; tz <= tz1; tz++) {
    for (let tx = tx0; tx <= tx1; tx++) tiles.push({ tx, tz });
  }
  return tiles;
}

export function tilesForOp(doc, op, limit = 4096) {
  return tilesForBounds(op?.bounds || null, doc.world.tileMeters, limit);
}

export function diffDocument(before, after) {
  if (!before || !after) return { full: true, tiles: [], ops: [] };
  if (before.revision === after.revision) return { full: false, tiles: [], ops: [] };
  const beforeBase = before.layers.find((layer) => layer.kind === 'base');
  const afterBase = after.layers.find((layer) => layer.kind === 'base');
  const baseChanged = JSON.stringify(beforeBase?.params || {}) !== JSON.stringify(afterBase?.params || {});
  if (baseChanged) return { full: true, tiles: [], ops: [] };

  const tiles = new Map();
  const ops = [];
  const collect = (layer) => {
    const map = new Map(layer.ops.map((op) => [op.id, op]));
    return map;
  };
  for (const afterLayer of after.layers) {
    const beforeLayer = before.layers.find((layer) => layer.id === afterLayer.id);
    if (!beforeLayer) {
      for (const op of afterLayer.ops) {
        ops.push(op);
        for (const tile of tilesForOp(after, op)) tiles.set(tileKey(tile.tx, tile.tz), tile);
      }
      continue;
    }
    if (beforeLayer.visible !== afterLayer.visible) return { full: true, tiles: [], ops: [] };
    const beforeOps = collect(beforeLayer);
    const afterOps = collect(afterLayer);
    for (const [id, op] of afterOps) {
      const previous = beforeOps.get(id);
      if (previous && JSON.stringify(previous) === JSON.stringify(op)) continue;
      ops.push(op);
      for (const tile of tilesForOp(after, op)) tiles.set(tileKey(tile.tx, tile.tz), tile);
    }
    for (const [id, op] of beforeOps) {
      if (afterOps.has(id)) continue;
      for (const tile of tilesForOp(before, op)) tiles.set(tileKey(tile.tx, tile.tz), tile);
    }
  }
  for (const beforeLayer of before.layers) {
    if (after.layers.some((layer) => layer.id === beforeLayer.id)) continue;
    for (const op of beforeLayer.ops) {
      for (const tile of tilesForOp(before, op)) tiles.set(tileKey(tile.tx, tile.tz), tile);
    }
  }
  return { full: false, tiles: [...tiles.values()], ops };
}

// ---------------------------------------------------------------------------
// Authoring commands
// ---------------------------------------------------------------------------

export function addStamp(doc, layerId, stampInput) {
  const layer = findLayer(doc, layerId) || ensureLayer(doc, 'landform');
  const stamp = createStamp(stampInput);
  layer.ops.push(stamp);
  touchDocument(doc);
  return stamp;
}

export function addStroke(doc, layerId, strokeInput) {
  const layer = findLayer(doc, layerId) || ensureLayer(doc, 'sculpt');
  const stroke = createStroke(strokeInput);
  layer.ops.push(stroke);
  touchDocument(doc);
  return stroke;
}

export function removeOp(doc, layerId, opId) {
  const layer = findLayer(doc, layerId);
  if (!layer) return null;
  const index = layer.ops.findIndex((op) => op.id === opId);
  if (index < 0) return null;
  const [removed] = layer.ops.splice(index, 1);
  touchDocument(doc);
  return removed;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

export function serializeLandscapeDocument(doc) {
  const clean = {
    version: LANDSCAPE_DOCUMENT_VERSION,
    name: doc.name,
    seed: doc.seed,
    world: { ...doc.world },
    ocean: { ...doc.ocean },
    revision: doc.revision,
    layers: doc.layers.map((layer) => ({
      id: layer.id,
      kind: layer.kind,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blend: layer.blend,
      locked: layer.locked,
      params: { ...layer.params },
      ops: layer.ops.map((op) => {
        if (op.type === 'stroke') {
          return {
            type: 'stroke',
            id: op.id,
            tool: op.tool,
            radius: op.radius,
            strength: op.strength,
            seed: op.seed,
            target: op.target,
            points: op.points.map((point) => ({
              x: round(point.x, 3),
              z: round(point.z, 3),
              p: round(point.p, 3),
            })),
          };
        }
        return {
          type: 'stamp',
          id: op.id,
          kind: op.kind,
          x: round(op.x, 2),
          z: round(op.z, 2),
          seed: op.seed,
          radius: round(op.radius, 2),
          height: round(op.height, 2),
          angle: round(op.angle, 5),
          stretch: round(op.stretch, 4),
          sharpness: round(op.sharpness, 4),
          roughness: round(op.roughness, 4),
          erosion: round(op.erosion, 4),
          negative: op.negative,
          blend: round(op.blend, 4),
        };
      }),
    })),
  };
  return clean;
}

/** Quantise an authored scalar to the precision the document format stores. */
function q(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function round(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

export function serializeLandscapeDocumentText(doc) {
  return JSON.stringify(serializeLandscapeDocument(doc), null, 2);
}

export function deserializeLandscapeDocument(text) {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  return normalizeLandscapeDocument(parsed);
}

export function documentStats(doc) {
  let stamps = 0;
  let strokes = 0;
  let points = 0;
  let bounds = null;
  for (const layer of doc.layers) {
    for (const op of layer.ops) {
      if (op.type === 'stamp') stamps += 1;
      else if (op.type === 'stroke') {
        strokes += 1;
        points += op.points.length;
      }
      if (op.bounds) {
        bounds = bounds || { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
        bounds.minX = Math.min(bounds.minX, op.bounds.minX);
        bounds.maxX = Math.max(bounds.maxX, op.bounds.maxX);
        bounds.minZ = Math.min(bounds.minZ, op.bounds.minZ);
        bounds.maxZ = Math.max(bounds.maxZ, op.bounds.maxZ);
      }
    }
  }
  const bytes = JSON.stringify(serializeLandscapeDocument(doc)).length;
  return { stamps, strokes, points, bounds, bytes, layers: doc.layers.length };
}
