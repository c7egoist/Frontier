/**
 * Landmass Studio core heightfield tools.
 *
 * This is deliberately much simpler than Terrain Studio: one signed
 * elevation field, sea level at y=0 by default, direct sculpting, and
 * shoreline geometry extraction. There is no erosion, sediment, climate,
 * vegetation, cave, or river simulation here. Later work can place detailed
 * Terrain Studio patches on top of this broad continent/island base.
 */

export const LANDMASS_SHAPES = Object.freeze([
  Object.freeze({ id: 'continent', label: 'Continent', description: 'One large irregular landmass' }),
  Object.freeze({ id: 'island', label: 'Island', description: 'One compact island' }),
  Object.freeze({ id: 'archipelago', label: 'Archipelago', description: 'Several separate islands' }),
  Object.freeze({ id: 'peninsula', label: 'Peninsula', description: 'Land connected from the west' }),
  Object.freeze({ id: 'coast', label: 'Coastline', description: 'Land to the west, ocean to the east' }),
]);

const SHAPE_IDS = new Set(LANDMASS_SHAPES.map((shape) => shape.id));

export const DEFAULT_LANDMASS_PARAMS = Object.freeze({
  shape: 'continent',
  seed: 4029,
  gridSize: 256,
  worldSpan: 2400,
  landCoverage: 0.54,
  coastRoughness: 0.62,
  relief: 230,
  roughness: 0.58,
  oceanDepth: 72,
});

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(ix, iz, seed) {
  let n = (seed >>> 0) ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash01(ix, iz, seed) * 2 - 1;
  const b = hash01(ix + 1, iz, seed) * 2 - 1;
  const c = hash01(ix, iz + 1, seed) * 2 - 1;
  const d = hash01(ix + 1, iz + 1, seed) * 2 - 1;
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

function fbm(x, z, seed, octaves = 5) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, z * frequency, seed + i * 1013) * amplitude;
    norm += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum / Math.max(1e-6, norm);
}

function ridgedFbm(x, z, seed, octaves = 5) {
  let sum = 0;
  let amplitude = 0.52;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * frequency, z * frequency, seed + i * 733));
    sum += n * n * amplitude;
    norm += amplitude;
    frequency *= 2.11;
    amplitude *= 0.5;
  }
  return clamp(sum / Math.max(1e-6, norm), 0, 1);
}

function smoothMax(a, b, softness = 9) {
  const m = Math.max(a, b);
  return m + Math.log1p(Math.exp(softness * (Math.min(a, b) - m))) / softness;
}

export function normalizeLandmassParams(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const shape = SHAPE_IDS.has(src.shape) ? src.shape : DEFAULT_LANDMASS_PARAMS.shape;
  return {
    shape,
    seed: Math.round(finiteOr(src.seed, DEFAULT_LANDMASS_PARAMS.seed)) >>> 0,
    gridSize: Math.round(clamp(finiteOr(src.gridSize, DEFAULT_LANDMASS_PARAMS.gridSize), 64, 320)),
    worldSpan: clamp(finiteOr(src.worldSpan, DEFAULT_LANDMASS_PARAMS.worldSpan), 400, 8000),
    landCoverage: clamp(finiteOr(src.landCoverage, DEFAULT_LANDMASS_PARAMS.landCoverage), 0.12, 0.86),
    coastRoughness: clamp(finiteOr(src.coastRoughness, DEFAULT_LANDMASS_PARAMS.coastRoughness), 0, 1),
    relief: clamp(finiteOr(src.relief, DEFAULT_LANDMASS_PARAMS.relief), 20, 420),
    roughness: clamp(finiteOr(src.roughness, DEFAULT_LANDMASS_PARAMS.roughness), 0, 1),
    oceanDepth: clamp(finiteOr(src.oceanDepth, DEFAULT_LANDMASS_PARAMS.oceanDepth), 10, 180),
  };
}

function makeLobes(params, rng) {
  const scale = 0.72 + params.landCoverage * 0.58;
  const lobe = (x, z, rx, rz, amplitude = 1) => ({
    x,
    z,
    rx: rx * scale,
    rz: rz * scale,
    angle: (rng() - 0.5) * 1.5,
    amplitude,
  });

  if (params.shape === 'island') {
    return [
      lobe((rng() - 0.5) * 0.18, (rng() - 0.5) * 0.18, 0.49, 0.38, 1),
      lobe((rng() - 0.5) * 0.42, (rng() - 0.5) * 0.42, 0.28, 0.22, 0.82),
      lobe((rng() - 0.5) * 0.36, (rng() - 0.5) * 0.36, 0.22, 0.18, 0.72),
    ];
  }
  if (params.shape === 'archipelago') {
    const lobes = [];
    for (let i = 0; i < 7; i++) {
      lobes.push(lobe(
        (rng() * 2 - 1) * 0.58,
        (rng() * 2 - 1) * 0.58,
        0.17 + rng() * 0.16,
        0.14 + rng() * 0.14,
        0.78 + rng() * 0.3
      ));
    }
    return lobes;
  }
  if (params.shape === 'peninsula') {
    return [
      lobe(-0.38, (rng() - 0.5) * 0.16, 0.68, 0.29, 1),
      lobe(-0.02, (rng() - 0.5) * 0.34, 0.34, 0.2, 0.86),
      lobe(-0.62, (rng() - 0.5) * 0.4, 0.36, 0.34, 0.92),
    ];
  }
  if (params.shape === 'coast') return [];

  const lobes = [
    lobe((rng() - 0.5) * 0.14, (rng() - 0.5) * 0.14, 0.66, 0.5, 1),
  ];
  for (let i = 0; i < 4; i++) {
    lobes.push(lobe(
      (rng() * 2 - 1) * 0.47,
      (rng() * 2 - 1) * 0.47,
      0.33 + rng() * 0.21,
      0.25 + rng() * 0.18,
      0.82 + rng() * 0.24
    ));
  }
  return lobes;
}

function lobePotential(lobes, x, z) {
  let potential = -2.2;
  for (const item of lobes) {
    const dx = x - item.x;
    const dz = z - item.z;
    const ca = Math.cos(item.angle);
    const sa = Math.sin(item.angle);
    const qx = (dx * ca + dz * sa) / Math.max(0.02, item.rx);
    const qz = (-dx * sa + dz * ca) / Math.max(0.02, item.rz);
    const d = Math.sqrt(qx * qx + qz * qz);
    potential = smoothMax(potential, (1 - d) * item.amplitude, 8);
  }
  return potential;
}

export function generateLandmass(input = {}) {
  const params = normalizeLandmassParams(input);
  const size = params.gridSize;
  const heights = new Float32Array(size * size);
  const shapePotential = new Float32Array(size * size);
  const rng = mulberry32(params.seed ^ 0x51ab3f19);
  const lobes = makeLobes(params, rng);
  const coastAngle = (rng() - 0.5) * 0.72;
  const coastCos = Math.cos(coastAngle);
  const coastSin = Math.sin(coastAngle);
  const coverageOffset = (params.landCoverage - 0.5) * 0.3;
  const warpAmount = 0.045 + params.coastRoughness * 0.24;
  const detailScale = 2.6 + params.roughness * 4.4;

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let landCells = 0;

  for (let iz = 0; iz < size; iz++) {
    const nz = (iz / Math.max(1, size - 1)) * 2 - 1;
    for (let ix = 0; ix < size; ix++) {
      const nx = (ix / Math.max(1, size - 1)) * 2 - 1;
      const wx = nx + fbm(nx * 1.45 + 11.3, nz * 1.45 - 4.1, params.seed ^ 0x31a7, 4) * warpAmount;
      const wz = nz + fbm(nx * 1.45 - 7.8, nz * 1.45 + 15.6, params.seed ^ 0x9c41, 4) * warpAmount;

      let potential;
      if (params.shape === 'coast') {
        const axis = wx * coastCos + wz * coastSin;
        potential = -axis * 0.92 + coverageOffset;
      } else {
        potential = lobePotential(lobes, wx, wz) + coverageOffset;
        if (params.shape === 'peninsula') {
          potential = smoothMax(potential, (-nx - 0.53) * 0.62, 7);
        }
      }
      potential += fbm(nx * 3.15 + 3.7, nz * 3.15 - 8.2, params.seed ^ 0x77d3, 4)
        * (0.025 + params.coastRoughness * 0.15);

      const inland = smoothstep(0, 0.42, potential);
      const plains = fbm(nx * 2.05 - 5.2, nz * 2.05 + 9.4, params.seed ^ 0x1209, 5);
      const hills = fbm(nx * detailScale + 17.1, nz * detailScale - 2.6, params.seed ^ 0x54be, 5);
      const mountainNoise = fbm(nx * 1.28 + 4.4, nz * 1.28 - 13.5, params.seed ^ 0x8ad1, 3) * 0.5 + 0.5;
      const ridge = ridgedFbm(nx * (2.1 + params.roughness * 2.6) - 9.2, nz * (2.1 + params.roughness * 2.6) + 6.8, params.seed ^ 0x2f6b, 5);
      const mountainMask = smoothstep(0.52, 0.78, mountainNoise + potential * 0.14);
      const interior = Math.max(
        0.002,
        0.035 + plains * 0.105 + hills * 0.16 + Math.pow(ridge, 1.65) * mountainMask * 0.95
      );

      let height;
      if (potential >= 0) {
        height = 2.4 * (1 - Math.exp(-potential * 5.2)) + params.relief * interior * inland;
      } else {
        const seabedNoise = fbm(nx * 3.4 + 8.8, nz * 3.4 - 1.4, params.seed ^ 0x651e, 4)
          * params.oceanDepth * 0.055 * smoothstep(0, -0.28, potential);
        height = -params.oceanDepth * (1 - Math.exp(potential * 2.65)) + seabedNoise;
      }

      if (params.shape === 'continent' || params.shape === 'island' || params.shape === 'archipelago') {
        const edgeDistance = 1 - Math.max(Math.abs(nx), Math.abs(nz));
        const edgeT = smoothstep(0.012, 0.1, edgeDistance);
        height = lerp(-params.oceanDepth * 0.94, height, edgeT);
      }

      const idx = iz * size + ix;
      heights[idx] = height;
      shapePotential[idx] = potential;
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
      if (height >= 0) landCells++;
    }
  }

  return {
    params,
    size,
    worldSpan: params.worldSpan,
    heights,
    shapePotential,
    stats: {
      minHeight,
      maxHeight,
      landFraction: landCells / Math.max(1, size * size),
    },
  };
}

export function landmassIndex(field, ix, iz) {
  return clamp(Math.round(iz), 0, field.size - 1) * field.size + clamp(Math.round(ix), 0, field.size - 1);
}

export function sampleLandmassHeight(field, worldX, worldZ) {
  const size = field.size;
  const span = field.worldSpan;
  const fx = clamp((worldX / span + 0.5) * (size - 1), 0, size - 1);
  const fz = clamp((worldZ / span + 0.5) * (size - 1), 0, size - 1);
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const ix1 = Math.min(size - 1, ix + 1);
  const iz1 = Math.min(size - 1, iz + 1);
  const h00 = field.heights[iz * size + ix];
  const h10 = field.heights[iz * size + ix1];
  const h01 = field.heights[iz1 * size + ix];
  const h11 = field.heights[iz1 * size + ix1];
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}

export function sampleLandmassGradient(field, worldX, worldZ) {
  const step = field.worldSpan / Math.max(1, field.size - 1);
  const hx0 = sampleLandmassHeight(field, worldX - step, worldZ);
  const hx1 = sampleLandmassHeight(field, worldX + step, worldZ);
  const hz0 = sampleLandmassHeight(field, worldX, worldZ - step);
  const hz1 = sampleLandmassHeight(field, worldX, worldZ + step);
  return [(hx1 - hx0) / (2 * step), (hz1 - hz0) / (2 * step)];
}

export function computeLandmassStats(field, seaLevel = 0) {
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  let landCells = 0;
  for (const h of field.heights) {
    minHeight = Math.min(minHeight, h);
    maxHeight = Math.max(maxHeight, h);
    if (h >= seaLevel) landCells++;
  }
  return {
    minHeight,
    maxHeight,
    landFraction: landCells / Math.max(1, field.heights.length),
  };
}

export function applyLandmassBrush(field, options = {}) {
  const size = field.size;
  const span = field.worldSpan;
  const x = finiteOr(options.x, 0);
  const z = finiteOr(options.z, 0);
  const radius = Math.max(1, finiteOr(options.radius, span * 0.06));
  const strength = finiteOr(options.strength, 2);
  const mode = ['raise', 'lower', 'smooth', 'flatten'].includes(options.mode) ? options.mode : 'raise';
  const protectBorder = options.protectBorder !== false;
  const targetHeight = Number.isFinite(Number(options.targetHeight))
    ? Number(options.targetHeight)
    : sampleLandmassHeight(field, x, z);
  const source = mode === 'smooth' ? field.heights.slice() : field.heights;

  const toIndex = (world) => (world / span + 0.5) * (size - 1);
  const minIx = Math.max(0, Math.floor(toIndex(x - radius)));
  const maxIx = Math.min(size - 1, Math.ceil(toIndex(x + radius)));
  const minIz = Math.max(0, Math.floor(toIndex(z - radius)));
  const maxIz = Math.min(size - 1, Math.ceil(toIndex(z + radius)));
  const bounds = { minIx: size, maxIx: -1, minIz: size, maxIz: -1, changed: 0 };

  for (let iz = minIz; iz <= maxIz; iz++) {
    const wz = (iz / Math.max(1, size - 1) - 0.5) * span;
    for (let ix = minIx; ix <= maxIx; ix++) {
      const wx = (ix / Math.max(1, size - 1) - 0.5) * span;
      const dist = Math.hypot(wx - x, wz - z);
      if (dist > radius) continue;
      const t = 1 - dist / radius;
      let falloff = t * t * (3 - 2 * t);
      if (protectBorder) {
        const edgeCells = Math.min(ix, iz, size - 1 - ix, size - 1 - iz);
        falloff *= smoothstep(2, 13, edgeCells);
      }
      if (falloff <= 0.0001) continue;
      const idx = iz * size + ix;
      const before = field.heights[idx];
      if (mode === 'raise') {
        field.heights[idx] = before + strength * falloff;
      } else if (mode === 'lower') {
        field.heights[idx] = before - strength * falloff;
      } else if (mode === 'flatten') {
        field.heights[idx] = lerp(before, targetHeight, clamp(Math.abs(strength) / 8, 0, 0.9) * falloff);
      } else {
        const left = source[iz * size + Math.max(0, ix - 1)];
        const right = source[iz * size + Math.min(size - 1, ix + 1)];
        const down = source[Math.max(0, iz - 1) * size + ix];
        const up = source[Math.min(size - 1, iz + 1) * size + ix];
        const avg = (left + right + down + up + source[idx]) / 5;
        field.heights[idx] = lerp(before, avg, clamp(Math.abs(strength) / 7, 0, 0.88) * falloff);
      }
      if (Math.abs(field.heights[idx] - before) > 1e-7) {
        bounds.minIx = Math.min(bounds.minIx, ix);
        bounds.maxIx = Math.max(bounds.maxIx, ix);
        bounds.minIz = Math.min(bounds.minIz, iz);
        bounds.maxIz = Math.max(bounds.maxIz, iz);
        bounds.changed++;
      }
    }
  }
  if (bounds.changed === 0) return { minIx: 0, maxIx: -1, minIz: 0, maxIz: -1, changed: 0 };
  field.stats = computeLandmassStats(field, finiteOr(options.seaLevel, 0));
  return bounds;
}

const MARCHING_SQUARE_SEGMENTS = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 2], [0, 1]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[0, 2]],
  [[0, 3], [1, 2]],
  [[1, 2]],
  [[1, 3]],
  [[0, 1]],
  [[0, 3]],
  [],
];

export function extractShorelineContours(field, seaLevel = 0) {
  const size = field.size;
  const span = field.worldSpan;
  const cell = span / Math.max(1, size - 1);
  const points = new Map();
  const adjacency = new Map();
  const edges = [];

  const worldCoord = (index) => (index / Math.max(1, size - 1) - 0.5) * span;
  const heightAt = (ix, iz) => field.heights[iz * size + ix] - seaLevel;

  function pointFor(kind, ix, iz) {
    const id = `${kind}:${ix},${iz}`;
    const existing = points.get(id);
    if (existing) return existing;
    let x;
    let z;
    if (kind === 'h') {
      const a = heightAt(ix, iz);
      const b = heightAt(ix + 1, iz);
      const t = Math.abs(b - a) < 1e-9 ? 0.5 : clamp(-a / (b - a), 0, 1);
      x = worldCoord(ix) + t * cell;
      z = worldCoord(iz);
    } else {
      const a = heightAt(ix, iz);
      const b = heightAt(ix, iz + 1);
      const t = Math.abs(b - a) < 1e-9 ? 0.5 : clamp(-a / (b - a), 0, 1);
      x = worldCoord(ix);
      z = worldCoord(iz) + t * cell;
    }
    const point = { id, x, z };
    points.set(id, point);
    adjacency.set(id, []);
    return point;
  }

  function edgePoint(ix, iz, edge) {
    if (edge === 0) return pointFor('h', ix, iz);
    if (edge === 1) return pointFor('v', ix + 1, iz);
    if (edge === 2) return pointFor('h', ix, iz + 1);
    return pointFor('v', ix, iz);
  }

  function addSegment(a, b) {
    if (a.id === b.id) return;
    edges.push([a.id, b.id]);
    adjacency.get(a.id).push(b.id);
    adjacency.get(b.id).push(a.id);
  }

  for (let iz = 0; iz < size - 1; iz++) {
    for (let ix = 0; ix < size - 1; ix++) {
      let mask = 0;
      if (heightAt(ix, iz) >= 0) mask |= 1;
      if (heightAt(ix + 1, iz) >= 0) mask |= 2;
      if (heightAt(ix + 1, iz + 1) >= 0) mask |= 4;
      if (heightAt(ix, iz + 1) >= 0) mask |= 8;
      for (const [e0, e1] of MARCHING_SQUARE_SEGMENTS[mask]) {
        addSegment(edgePoint(ix, iz, e0), edgePoint(ix, iz, e1));
      }
    }
  }

  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const used = new Set();
  const contours = [];

  function extend(path, atStart, state) {
    while (!state.closed) {
      const current = atStart ? path[0] : path[path.length - 1];
      const neighbors = adjacency.get(current) || [];
      let advanced = false;
      for (const next of neighbors) {
        const key = edgeKey(current, next);
        if (used.has(key)) continue;
        used.add(key);
        if (next === (atStart ? path[path.length - 1] : path[0]) && path.length > 2) {
          state.closed = true;
        } else if (atStart) {
          path.unshift(next);
        } else {
          path.push(next);
        }
        advanced = true;
        break;
      }
      if (!advanced) break;
    }
  }

  for (const [a, b] of edges) {
    const key = edgeKey(a, b);
    if (used.has(key)) continue;
    used.add(key);
    const path = [a, b];
    const state = { closed: false };
    extend(path, false, state);
    if (!state.closed) extend(path, true, state);
    const coords = path.map((id) => {
      const p = points.get(id);
      return [p.x, p.z];
    });
    let length = 0;
    for (let i = 1; i < coords.length; i++) {
      length += Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    }
    if (state.closed && coords.length > 2) {
      length += Math.hypot(coords[0][0] - coords.at(-1)[0], coords[0][1] - coords.at(-1)[1]);
    }
    if (coords.length >= 2 && length >= cell * 0.75) {
      contours.push({ points: coords, closed: state.closed, length });
    }
  }

  contours.sort((a, b) => b.length - a.length);
  return contours;
}

function smoothContourPoints(input, closed) {
  if (input.length < 3) return input.map((p) => [...p]);
  return input.map((p, i) => {
    const prev = closed ? input[(i - 1 + input.length) % input.length] : input[Math.max(0, i - 1)];
    const next = closed ? input[(i + 1) % input.length] : input[Math.min(input.length - 1, i + 1)];
    return [
      p[0] + ((prev[0] + next[0]) * 0.5 - p[0]) * 0.18,
      p[1] + ((prev[1] + next[1]) * 0.5 - p[1]) * 0.18,
    ];
  });
}

function pointHash(x, z, seed, salt = 0) {
  return hash01(Math.round(x * 0.37) + salt * 1931, Math.round(z * 0.37) - salt * 917, seed ^ (salt * 0x45d9f3b));
}

/**
 * Build foam as actual shoreline-following mesh bands and broken surf
 * patches. This intentionally does not generate foam in a fragment shader
 * and does not use foam particles: every visible foam edge is a vertex in
 * the returned geometry.
 */
export function buildFoamGeometry(field, options = {}) {
  const seaLevel = finiteOr(options.seaLevel, 0);
  const foamWidth = Math.max(1, finiteOr(options.foamWidth, 16));
  const surfEnergy = clamp(finiteOr(options.surfEnergy, 0.68), 0, 1);
  const seed = Math.round(finiteOr(options.seed, field?.params?.seed ?? 4029)) >>> 0;
  const contours = extractShorelineContours(field, seaLevel);
  const positions = [];
  const colors = [];
  const meta = [];
  const indices = [];
  const cell = field.worldSpan / Math.max(1, field.size - 1);

  function addVertex(point, seaward, offset, y, color, phase, mobility) {
    positions.push(point[0] + seaward[0] * offset, y, point[1] + seaward[1] * offset);
    colors.push(color[0], color[1], color[2]);
    meta.push(seaward[0], seaward[1], phase, mobility);
    return positions.length / 3 - 1;
  }

  function addBandSegment(infoA, infoB, band) {
    const rowCount = 3;
    const start = positions.length / 3;
    const strip = [];
    for (const info of [infoA, infoB]) {
      const rows = [];
      for (let row = 0; row < rowCount; row++) {
        const anchor = info.bandOffsets[band][0];
        const rawOffset = info.bandOffsets[band][row];
        const offset = anchor + (rawOffset - anchor) * info.bandScales[band];
        const y = seaLevel + info.bandHeights[band][row];
        const color = info.bandColors[band][row];
        rows.push(addVertex(info.point, info.seaward, offset, y, color, info.phase, [0.22, 0.62, 1][band]));
      }
      strip.push(rows);
    }
    for (let row = 0; row < rowCount - 1; row++) {
      const a = strip[0][row] - start;
      const b = strip[1][row] - start;
      const c = strip[0][row + 1] - start;
      const d = strip[1][row + 1] - start;
      const base = start;
      indices.push(base + a, base + c, base + b, base + b, base + c, base + d);
    }
  }

  contours.forEach((contour, contourIndex) => {
    const smoothed = smoothContourPoints(contour.points, contour.closed);
    const extended = contour.closed ? [...smoothed, smoothed[0]] : smoothed;
    if (extended.length < 2) return;
    const infos = [];
    const contourPhase = pointHash(contourIndex * 91, Math.round(contour.length), seed, 211) * Math.PI * 2;
    // Foam is laid down as tapered surf patches, not as one perfect
    // continuous outline. This envelope reaches zero in genuine gaps and
    // at patch tips; addBandSegment collapses each band toward its inner
    // edge as the envelope falls, producing lens-shaped geometry.
    const patchScaleAt = (distance, band) => {
      const baseLength = foamWidth * [5.4, 4.2, 3.1][band];
      const cycle = distance / Math.max(8, baseLength)
        + band * 0.37
        + contourIndex * 1.71
        + Math.sin(distance * 0.0021 + band * 1.7) * 0.18;
      const u = cycle - Math.floor(cycle);
      const duty = [0.9, 0.72, 0.55][band];
      if (u > duty) return 0;
      return Math.pow(Math.sin(Math.PI * u / duty), 0.62);
    };
    let cumulative = 0;

    for (let i = 0; i < extended.length; i++) {
      const point = extended[i];
      if (i > 0) cumulative += Math.hypot(point[0] - extended[i - 1][0], point[1] - extended[i - 1][1]);
      const prev = extended[Math.max(0, i - 1)];
      const next = extended[Math.min(extended.length - 1, i + 1)];
      let tangent = [next[0] - prev[0], next[1] - prev[1]];
      const tangentLength = Math.hypot(tangent[0], tangent[1]) || 1;
      tangent = [tangent[0] / tangentLength, tangent[1] / tangentLength];

      const gradient = sampleLandmassGradient(field, point[0], point[1]);
      const gradLength = Math.hypot(gradient[0], gradient[1]);
      let seaward;
      if (gradLength > 1e-5) {
        seaward = [-gradient[0] / gradLength, -gradient[1] / gradLength];
      } else {
        seaward = [-tangent[1], tangent[0]];
        const hA = sampleLandmassHeight(field, point[0] + seaward[0] * cell, point[1] + seaward[1] * cell);
        const hB = sampleLandmassHeight(field, point[0] - seaward[0] * cell, point[1] - seaward[1] * cell);
        if (hA > hB) seaward = [-seaward[0], -seaward[1]];
      }

      const slope = gradLength;
      const beachFactor = clamp(1 - slope / 0.62, 0, 1);
      // Foam width and motion vary in broad surf groups, not from
      // point-to-point random hashes. The small edge-detail terms are also
      // low-frequency FBM sampled along shoreline distance, so neighbouring
      // foam vertices form coherent lace rather than a spiky comb.
      const waveGroup = 0.5 + 0.5 * Math.sin(
        cumulative * 0.014 + contourPhase + Math.sin(cumulative * 0.0031) * 1.4
      );
      const surfEnvelope = 0.58 + waveGroup * 0.54;
      const widthHere = foamWidth * (0.18 + beachFactor * 1.02) * surfEnvelope;
      const jag0 = fbm(cumulative * 0.018, contourIndex * 7.3 + 1.7, seed ^ 0x51c3, 3) * 0.5 + 0.5;
      const jag1 = fbm(cumulative * 0.013, contourIndex * 7.3 + 9.2, seed ^ 0x9a17, 3) * 0.5 + 0.5;
      const jag2 = fbm(cumulative * 0.009, contourIndex * 7.3 + 15.8, seed ^ 0x2bd4, 3) * 0.5 + 0.5;
      const phase = (cumulative * 0.009 + contourIndex * 0.37) % 1;
      const waterlineScale = 0.46 + waveGroup * 0.54;
      const bandPatch = [
        patchScaleAt(cumulative, 0),
        patchScaleAt(cumulative, 1),
        patchScaleAt(cumulative, 2),
      ];

      infos.push({
        point,
        seaward,
        slope,
        cumulative,
        waveGroup,
        phase,
        bandPatch,
        bandScales: [
          0.12 + bandPatch[0] * 0.88,
          0.08 + bandPatch[1] * 0.92,
          0.08 + bandPatch[2] * 0.92,
        ],
        bandOffsets: [
          [
            -widthHere * 0.06 * waterlineScale,
            widthHere * 0.11 * waterlineScale,
            widthHere * (0.25 + jag0 * 0.055) * waterlineScale,
          ],
          [
            widthHere * (0.31 + jag1 * 0.035),
            widthHere * (0.48 + jag1 * 0.045),
            widthHere * (0.67 + jag1 * 0.075),
          ],
          [
            widthHere * (0.79 + jag2 * 0.04),
            widthHere * (0.96 + jag2 * 0.05),
            widthHere * (1.13 + jag2 * 0.09),
          ],
        ],
        bandHeights: [
          [0.12, 0.31, 0.14],
          [0.1, 0.24, 0.1],
          [0.08, 0.18, 0.08],
        ],
        bandColors: [
          [[0.9, 0.96, 0.99], [1, 1, 1], [0.72, 0.88, 0.95]],
          [[0.82, 0.92, 0.97], [0.98, 1, 1], [0.62, 0.82, 0.92]],
          [[0.74, 0.88, 0.95], [0.93, 0.98, 1], [0.54, 0.76, 0.89]],
        ],
      });
    }

    // One neighbour pass removes any remaining one-cell steps in foam
    // width. The shoreline itself stays where marching squares found it;
    // only the seaward offsets of the foam mesh are smoothed.
    const rawOffsets = infos.map((info) => info.bandOffsets.map((rows) => [...rows]));
    for (let i = 1; i < infos.length - 1; i++) {
      for (let band = 0; band < 3; band++) {
        for (let row = 0; row < 3; row++) {
          infos[i].bandOffsets[band][row] =
            rawOffsets[i - 1][band][row] * 0.22 +
            rawOffsets[i][band][row] * 0.56 +
            rawOffsets[i + 1][band][row] * 0.22;
        }
      }
    }

    for (let i = 0; i < infos.length - 1; i++) {
      const a = infos[i];
      const b = infos[i + 1];
      if (Math.max(a.bandPatch[0], b.bandPatch[0]) > 0.015) {
        addBandSegment(a, b, 0);
      }
      const midDistance = (a.cumulative + b.cumulative) * 0.5;
      const waveGroup = (a.waveGroup + b.waveGroup) * 0.5;
      const laceDetail = fbm(midDistance * 0.012, contourIndex * 11.6 + 4.4, seed ^ 0x70e3, 3) * 0.5 + 0.5;
      if (
        surfEnergy > 0.01
        && Math.max(a.bandPatch[1], b.bandPatch[1]) > 0.015
        && waveGroup > 1.14 - surfEnergy * 0.86
        && laceDetail > 0.16
      ) {
        addBandSegment(a, b, 1);
      }
      if (
        surfEnergy > 0.08
        && Math.max(a.bandPatch[2], b.bandPatch[2]) > 0.015
        && waveGroup > 1.34 - surfEnergy * 0.76
        && laceDetail > 0.3
        && laceDetail < 0.94
      ) {
        addBandSegment(a, b, 2);
      }
    }
  });

  const positionArray = new Float32Array(positions);
  return {
    positions: positionArray,
    basePositions: new Float32Array(positionArray),
    colors: new Float32Array(colors),
    meta: new Float32Array(meta),
    indices: new Uint32Array(indices),
    contours,
    vertexCount: positionArray.length / 3,
    triangleCount: indices.length / 3,
    shorelineLength: contours.reduce((sum, contour) => sum + contour.length, 0),
    seaLevel,
    foamWidth,
  };
}

export function animateFoamGeometry(foam, timeSeconds = 0, options = {}) {
  if (!foam?.positions || !foam?.basePositions || !foam?.meta) return foam;
  const speed = Math.max(0, finiteOr(options.speed, 1));
  const amplitude = Math.max(0, finiteOr(options.amplitude, Math.max(0.5, (foam.foamWidth || 16) * 0.09)));
  const lift = Math.max(0, finiteOr(options.lift, 0.08));
  const tau = Math.PI * 2;
  for (let i = 0; i < foam.vertexCount; i++) {
    const p = i * 3;
    const m = i * 4;
    const phase = foam.meta[m + 2] * tau;
    const mobility = foam.meta[m + 3];
    const wave = Math.sin(timeSeconds * speed * (0.75 + mobility * 0.42) + phase);
    const travel = wave * amplitude * mobility;
    foam.positions[p] = foam.basePositions[p] + foam.meta[m] * travel;
    foam.positions[p + 1] = foam.basePositions[p + 1] + (wave * 0.5 + 0.5) * lift * mobility;
    foam.positions[p + 2] = foam.basePositions[p + 2] + foam.meta[m + 1] * travel;
  }
  return foam;
}

function mixColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function buildLandmassColors(field, seaLevel = 0) {
  const size = field.size;
  const colors = new Float32Array(size * size * 3);
  const cell = field.worldSpan / Math.max(1, size - 1);
  const deep = [0.16, 0.25, 0.29];
  const shallow = [0.58, 0.56, 0.42];
  const beach = [0.76, 0.68, 0.49];
  const lowland = [0.38, 0.5, 0.31];
  const hills = [0.52, 0.47, 0.31];
  const rock = [0.43, 0.42, 0.4];
  const summit = [0.78, 0.8, 0.8];

  for (let iz = 0; iz < size; iz++) {
    for (let ix = 0; ix < size; ix++) {
      const idx = iz * size + ix;
      const h = field.heights[idx];
      const left = field.heights[iz * size + Math.max(0, ix - 1)];
      const right = field.heights[iz * size + Math.min(size - 1, ix + 1)];
      const down = field.heights[Math.max(0, iz - 1) * size + ix];
      const up = field.heights[Math.min(size - 1, iz + 1) * size + ix];
      const slope = Math.hypot((right - left) / (2 * cell), (up - down) / (2 * cell));
      let color;
      if (h < seaLevel) {
        color = mixColor(shallow, deep, smoothstep(2, 62, seaLevel - h));
      } else if (h < seaLevel + 3.2) {
        color = beach;
      } else if (h < seaLevel + 72) {
        color = mixColor(lowland, hills, smoothstep(seaLevel + 24, seaLevel + 72, h));
      } else if (h < seaLevel + 170) {
        color = mixColor(hills, rock, smoothstep(seaLevel + 92, seaLevel + 170, h));
      } else {
        color = mixColor(rock, summit, smoothstep(seaLevel + 215, seaLevel + 330, h));
      }
      color = mixColor(color, rock, smoothstep(0.48, 1.05, slope) * 0.62);
      colors[idx * 3] = color[0];
      colors[idx * 3 + 1] = color[1];
      colors[idx * 3 + 2] = color[2];
    }
  }
  return colors;
}
