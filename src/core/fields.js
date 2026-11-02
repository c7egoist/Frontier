import { clamp01 } from './palettes.js';

export const DOMAIN_MIN = [-16, 0, -16];
export const DOMAIN_MAX = [16, 14, 16];
export const TERRAIN_EXTENT = 16;

export const FIELD_MODES = [
  {
    id: 'wind',
    label: 'Wind / Air',
    title: 'Atmospheric flow',
    subtitle: 'Obstacle wake, gusts and vortex shedding over a relief surface.',
    note: 'Procedural incompressible-style wind field',
    amplitude: 0.34,
    icon: 'wind',
  },
  {
    id: 'force',
    label: 'Force field',
    title: 'Potential force field',
    subtitle: 'Attractive and repulsive sources with superposition and curl.',
    note: 'Two-source inverse-square field',
    amplitude: 0.12,
    icon: 'force',
  },
  {
    id: 'terrain',
    label: 'Terrain flow',
    title: 'Terrain flow systems',
    subtitle: 'Slope-driven runoff, rainfall accumulation and vegetation response.',
    note: 'Heightfield + hydrology layers',
    amplitude: 1.0,
    icon: 'terrain',
  },
  {
    id: 'custom',
    label: 'Imported data',
    title: 'Generic vector field',
    subtitle: 'Trilinear sampled grid from CSV or JSON vector data.',
    note: 'User-supplied grid',
    amplitude: 0.18,
    icon: 'data',
  },
];

export const MODE_INDEX = Object.fromEntries(FIELD_MODES.map((mode, i) => [mode.id, i]));

export function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

export function length3(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function terrainBase(x, z) {
  const ridge = 0.82 * Math.sin(0.24 * x + 0.3) * Math.cos(0.19 * z - 0.4);
  const waves = 0.38 * Math.sin(0.13 * x + 0.42 * z) + 0.22 * Math.cos(0.51 * x - 0.27 * z);
  const hillA = 2.1 * Math.exp(-((x + 7) ** 2 + (z - 5) ** 2) / 72);
  const hillB = 2.6 * Math.exp(-((x - 8) ** 2 + (z + 6) ** 2) / 54);
  const basin = -1.2 * Math.exp(-(x ** 2 + z ** 2) / 42);
  return ridge + waves + hillA + hillB + basin;
}

export function terrainHeight(x, z, amplitude = 1) {
  return terrainBase(x, z) * amplitude;
}

export function terrainGradient(x, z, amplitude = 1) {
  const e = 0.16;
  return [
    (terrainBase(x + e, z) - terrainBase(x - e, z)) * amplitude / (2 * e),
    (terrainBase(x, z + e) - terrainBase(x, z - e)) * amplitude / (2 * e),
  ];
}

export function rainfallValue(x, z, time, amplitude) {
  const h = terrainHeight(x, z, amplitude);
  return clamp01(
    0.48
    + 0.27 * Math.sin(0.18 * x + 0.13 * z + 0.11 * time)
    + 0.18 * Math.cos(0.31 * z - 0.08 * time)
    - 0.055 * h,
  );
}

export function vegetationValue(x, z, time, amplitude) {
  const rain = rainfallValue(x, z, time, amplitude);
  const gradient = terrainGradient(x, z, amplitude);
  const slope = clamp01(Math.hypot(gradient[0], gradient[1]) / 1.35);
  const h = terrainHeight(x, z, amplitude);
  return clamp01(
    rain * 0.72 + (1 - slope) * 0.26 - Math.max(0, h) * 0.045
    + 0.06 * Math.sin(0.7 * x + 0.5 * z),
  );
}

function windField(p, time) {
  const [x, y, z] = p;
  const r = Math.hypot(x, z) + 0.001;
  const tangent = [-z / r, x / r];
  const radial = [x / r, z / r];
  const swirl = 2.35 * Math.exp(-r / 10);
  const obstacle = (1 - smoothstep(2.0, 5.6, r)) * 3.0;
  const gust = 0.45 * Math.sin(0.24 * z + 0.35 * time) + 0.22 * Math.sin(0.5 * x - 0.28 * time);
  const wake = smoothstep(2.0, 8.0, x) * Math.exp(-Math.abs(z) / 3.4) * Math.sin(0.8 * x - 1.2 * time);
  return [
    2.8 + gust + swirl * tangent[0] + obstacle * radial[0] + 0.35 * Math.sin(0.3 * y + 0.2 * time),
    0.22 * Math.sin(0.25 * x + 0.42 * time) + 0.14 * Math.cos(0.3 * z - 0.2 * time)
      + 0.6 * Math.exp(-r / 4) * (1 - y / 12),
    0.35 * Math.cos(0.22 * x - 0.3 * time) + swirl * tangent[1] + obstacle * radial[1] + 1.1 * wake,
  ];
}

function forceField(p, time) {
  const sources = [
    { c: [-5.2, 5.4, 0], q: 1.35 },
    { c: [5.2, 5.4, 0], q: -1.15 },
  ];
  const result = [0.18, 0.02 * Math.sin(time * 0.25), 0];
  for (const source of sources) {
    const d = [p[0] - source.c[0], p[1] - source.c[1], p[2] - source.c[2]];
    const r2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 + 1.8;
    const k = source.q * 18 / (r2 * Math.sqrt(r2));
    result[0] += d[0] * k;
    result[1] += d[1] * k;
    result[2] += d[2] * k;
  }
  const r = Math.hypot(p[0], p[2]) + 0.001;
  const vortex = 1.1 * Math.exp(-r / 9);
  result[0] += (-p[2] / r) * vortex;
  result[2] += (p[0] / r) * vortex;
  return result;
}

function terrainField(p, time, amplitude) {
  const [x, , z] = p;
  const gradient = terrainGradient(x, z, amplitude);
  const slope = [-gradient[0], -gradient[1]];
  const g = Math.hypot(gradient[0], gradient[1]) + 0.001;
  const contour = [-gradient[1] / g, gradient[0] / g];
  const r = Math.hypot(x, z) + 0.001;
  const basinSwirl = 0.85 * Math.exp(-r / 8.5);
  const seasonal = 0.18 * Math.sin(0.22 * x + 0.16 * time);
  return [
    slope[0] * 1.55 + contour[0] * (0.72 + seasonal) + (-z / r) * basinSwirl,
    -0.075 * (slope[0] ** 2 + slope[1] ** 2) + 0.16 * Math.sin(0.32 * x + 0.21 * time),
    slope[1] * 1.55 + contour[1] * (0.72 + seasonal) + (x / r) * basinSwirl,
  ];
}

function componentAt(data, dims, ix, iy, iz, component) {
  const [nx, ny, nz] = dims;
  const x = Math.min(nx - 1, Math.max(0, ix));
  const y = Math.min(ny - 1, Math.max(0, iy));
  const z = Math.min(nz - 1, Math.max(0, iz));
  return data[((z * ny + y) * nx + x) * 4 + component];
}

export function sampleDataset(dataset, p) {
  if (!dataset?.textureData) return [0, 0, 0, 0];
  const { dims, bounds, textureData } = dataset;
  const q = [0, 1, 2].map((axis) => clamp01(
    (p[axis] - bounds.min[axis]) / (bounds.max[axis] - bounds.min[axis] || 1e-6),
  ));
  const g = q.map((v, axis) => v * (dims[axis] - 1));
  const i0 = g.map((v) => Math.floor(v));
  const f = g.map((v, axis) => v - i0[axis]);
  const i1 = i0.map((v, axis) => Math.min(dims[axis] - 1, v + 1));
  const result = [];
  for (let channel = 0; channel < 4; channel += 1) {
    const c00 = componentAt(textureData, dims, i0[0], i0[1], i0[2], channel) * (1 - f[0])
      + componentAt(textureData, dims, i1[0], i0[1], i0[2], channel) * f[0];
    const c10 = componentAt(textureData, dims, i0[0], i1[1], i0[2], channel) * (1 - f[0])
      + componentAt(textureData, dims, i1[0], i1[1], i0[2], channel) * f[0];
    const c01 = componentAt(textureData, dims, i0[0], i0[1], i1[2], channel) * (1 - f[0])
      + componentAt(textureData, dims, i1[0], i0[1], i1[2], channel) * f[0];
    const c11 = componentAt(textureData, dims, i0[0], i1[1], i1[2], channel) * (1 - f[0])
      + componentAt(textureData, dims, i1[0], i1[1], i1[2], channel) * f[0];
    result.push(
      (c00 * (1 - f[1]) + c10 * f[1]) * (1 - f[2])
      + (c01 * (1 - f[1]) + c11 * f[1]) * f[2],
    );
  }
  return result;
}

export function sampleField(p, options = {}) {
  const mode = options.mode ?? MODE_INDEX.wind;
  const time = options.time ?? 0;
  const amplitude = options.amplitude ?? 1;
  if (mode === MODE_INDEX.wind) return windField(p, time);
  if (mode === MODE_INDEX.force) return forceField(p, time);
  if (mode === MODE_INDEX.terrain) return terrainField(p, time, amplitude);
  return sampleDataset(options.dataset, p).slice(0, 3);
}

export function effectiveScale(options = {}) {
  return (options.scale ?? 1) * (options.dataScale ?? 1);
}

export function sampleFieldScaled(p, options = {}) {
  const v = sampleField(p, options);
  const scale = effectiveScale(options);
  return [v[0] * scale, v[1] * scale, v[2] * scale];
}

function pressureValue(p, v, options) {
  const time = options.time ?? 0;
  const amplitude = options.amplitude ?? 1;
  const [x, y, z] = p;
  if (options.mode === MODE_INDEX.force) {
    const r1 = Math.hypot(x + 5.2, y - 5.4, z) + 2;
    const r2 = Math.hypot(x - 5.2, y - 5.4, z) + 2;
    return clamp01(0.5 + 0.055 * (12 / r1 - 12 / r2));
  }
  if (options.mode === MODE_INDEX.terrain) {
    return clamp01(0.5 - 0.12 * terrainHeight(x, z, amplitude) + 0.08 * Math.sin(0.18 * x + 0.15 * time));
  }
  const r2 = x * x + z * z;
  return clamp01(
    0.5 + 0.1 * (
      -v[0] + 2 * Math.sin(0.18 * x + 0.25 * time)
      + 1.2 * Math.cos(0.2 * z - 0.15 * time)
      - 0.8 * Math.exp(-r2 / 25)
    ),
  );
}

export function curlField(p, options = {}) {
  const h = 0.32;
  const dx = [h, 0, 0];
  const dy = [0, h, 0];
  const dz = [0, 0, h];
  const fxp = sampleField([p[0] + dx[0], p[1], p[2]], options);
  const fxm = sampleField([p[0] - dx[0], p[1], p[2]], options);
  const fyp = sampleField([p[0], p[1] + dy[1], p[2]], options);
  const fym = sampleField([p[0], p[1] - dy[1], p[2]], options);
  const fzp = sampleField([p[0], p[1], p[2] + dz[2]], options);
  const fzm = sampleField([p[0], p[1], p[2] - dz[2]], options);
  const dvzdy = (fyp[2] - fym[2]) / (2 * h);
  const dvydz = (fzp[1] - fzm[1]) / (2 * h);
  const dvxdz = (fzp[0] - fzm[0]) / (2 * h);
  const dvzdx = (fxp[2] - fxm[2]) / (2 * h);
  const dvydx = (fxp[1] - fxm[1]) / (2 * h);
  const dvxdy = (fyp[0] - fym[0]) / (2 * h);
  return [dvzdy - dvydz, dvxdz - dvzdx, dvydx - dvxdy];
}

export function divergenceField(p, options = {}) {
  const h = 0.32;
  const fxp = sampleField([p[0] + h, p[1], p[2]], options);
  const fxm = sampleField([p[0] - h, p[1], p[2]], options);
  const fyp = sampleField([p[0], p[1] + h, p[2]], options);
  const fym = sampleField([p[0], p[1] - h, p[2]], options);
  const fzp = sampleField([p[0], p[1], p[2] + h], options);
  const fzm = sampleField([p[0], p[1], p[2] - h], options);
  return (fxp[0] - fxm[0] + fyp[1] - fym[1] + fzp[2] - fzm[2]) / (2 * h);
}

export function scalarSample(p, v, options = {}) {
  const channel = options.scalarMode ?? 0;
  const scale = effectiveScale(options);
  const speed = length3(v) * scale;
  if (channel === 0) return { raw: speed, normalized: clamp01(speed / 6) };
  if (channel === 1) {
    if (options.mode === MODE_INDEX.custom && options.dataset) {
      const raw = sampleDataset(options.dataset, p)[3];
      const [lo, hi] = options.dataset.scalarRange || [0, 1];
      return { raw, normalized: clamp01((raw - lo) / (hi - lo || 1e-6)) };
    }
    const normalized = pressureValue(p, v, options);
    return { raw: normalized, normalized };
  }
  if (channel === 2) {
    const raw = length3(curlField(p, options)) * scale;
    return { raw, normalized: clamp01(raw / 5) };
  }
  if (channel === 3) {
    const raw = divergenceField(p, options) * scale;
    return { raw, normalized: clamp01(0.5 + raw * 0.16) };
  }
  const [x, , z] = p;
  const time = options.time ?? 0;
  const amplitude = options.amplitude ?? 1;
  if (channel === 4) {
    const raw = terrainHeight(x, z, amplitude);
    return { raw, normalized: clamp01((raw + 2.2) / 8.5) };
  }
  if (channel === 5) {
    const normalized = rainfallValue(x, z, time, amplitude);
    return { raw: normalized, normalized };
  }
  const normalized = vegetationValue(x, z, time, amplitude);
  return { raw: normalized, normalized };
}

export function defaultOptions(modeId = 'wind') {
  const mode = FIELD_MODES.find((entry) => entry.id === modeId) || FIELD_MODES[0];
  return {
    mode: MODE_INDEX[mode.id],
    amplitude: mode.amplitude,
    time: 0,
    scale: 1,
    dataScale: 1,
    scalarMode: 0,
    dataset: null,
  };
}
