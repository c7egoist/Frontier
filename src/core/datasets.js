import { length3, sampleField, MODE_INDEX } from './fields.js';

export const CANONICAL_BOUNDS = {
  min: [-12, 0.5, -12],
  max: [12, 10.5, 12],
};

const HEADER_ALIASES = {
  x: ['x', 'pos_x', 'position_x', 'px', 'coord_x', 'longitude', 'lon'],
  y: ['y', 'pos_y', 'position_y', 'py', 'coord_y', 'height', 'altitude'],
  z: ['z', 'pos_z', 'position_z', 'pz', 'coord_z', 'latitude', 'lat'],
  u: ['u', 'vx', 'vel_x', 'velocity_x', 'vector_x', 'wind_u', 'fx'],
  v: ['v', 'vy', 'vel_y', 'velocity_y', 'vector_y', 'wind_v', 'fy'],
  w: ['w', 'vz', 'vel_z', 'velocity_z', 'vector_z', 'wind_w', 'fz'],
  scalar: ['scalar', 's', 'value', 'pressure', 'speed', 'magnitude', 'rain', 'rainfall', 'vegetation', 'density'],
};

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/[\s\-.]+/g, '_').replace(/^#/, '');
}

function findColumn(headers, aliases) {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index >= 0) return index;
  }
  return -1;
}

function splitDelimitedLine(line, delimiter) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(value.trim());
      value = '';
    } else {
      value += char;
    }
  }
  cells.push(value.trim());
  return cells;
}

export function parseDelimited(text) {
  const first = text.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
  const commaCount = (first.match(/,/g) || []).length;
  const tabCount = (first.match(/\t/g) || []).length;
  const semicolonCount = (first.match(/;/g) || []).length;
  const delimiter = tabCount > commaCount && tabCount > semicolonCount ? '\t'
    : semicolonCount > commaCount ? ';' : ',';
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => splitDelimitedLine(line, delimiter));
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueSorted(values) {
  const keys = new Map();
  for (const value of values) {
    const key = value.toFixed(6);
    keys.set(key, value);
  }
  return [...keys.values()].sort((a, b) => a - b);
}

function canonicalBoundsForDims(dims) {
  const min = [...CANONICAL_BOUNDS.min];
  const max = [...CANONICAL_BOUNDS.max];
  for (let axis = 0; axis < 3; axis += 1) {
    if (dims[axis] === 1) {
      const center = (min[axis] + max[axis]) * 0.5;
      if (axis === 1) min[axis] = 0.8;
      else min[axis] = center;
      max[axis] = min[axis] + 0.001;
    }
  }
  return { min, max };
}

function buildDataset({ name, dims, values, sourceBounds, sourceColumns, rows }) {
  const count = dims[0] * dims[1] * dims[2];
  const textureData = new Float32Array(count * 4);
  const counts = new Uint16Array(count);
  const accumulators = new Float64Array(count * 4);
  for (const entry of values) {
    if (!entry) continue;
    const { index, u, v, w, scalar } = entry;
    if (index < 0 || index >= count) continue;
    const base = index * 4;
    accumulators[base] += u;
    accumulators[base + 1] += v;
    accumulators[base + 2] += w;
    accumulators[base + 3] += scalar;
    counts[index] += 1;
  }
  let maxSpeed = 0;
  let sumSpeed = 0;
  let scalarMin = Infinity;
  let scalarMax = -Infinity;
  for (let i = 0; i < count; i += 1) {
    const base = i * 4;
    const divisor = Math.max(1, counts[i]);
    const u = accumulators[base] / divisor;
    const v = accumulators[base + 1] / divisor;
    const w = accumulators[base + 2] / divisor;
    const scalarValue = accumulators[base + 3] / divisor;
    textureData[base] = u;
    textureData[base + 1] = v;
    textureData[base + 2] = w;
    textureData[base + 3] = scalarValue;
    const speed = Math.hypot(u, v, w);
    maxSpeed = Math.max(maxSpeed, speed);
    sumSpeed += speed;
    scalarMin = Math.min(scalarMin, scalarValue);
    scalarMax = Math.max(scalarMax, scalarValue);
  }
  if (!Number.isFinite(scalarMin) || !Number.isFinite(scalarMax) || scalarMax - scalarMin < 1e-6) {
    scalarMin = 0;
    scalarMax = Math.max(1, maxSpeed);
  }
  const bounds = canonicalBoundsForDims(dims);
  const recommendedScale = maxSpeed > 8 ? Math.max(0.05, 8 / maxSpeed) : 1;
  return {
    name,
    kind: 'grid',
    dims,
    bounds,
    sourceBounds,
    textureData,
    scalarRange: [scalarMin, scalarMax],
    vectorRange: [0, maxSpeed],
    recommendedScale,
    meanSpeed: sumSpeed / Math.max(1, count),
    maxSpeed,
    rows: rows ?? count,
    sourceColumns: sourceColumns ?? [],
    createdAt: new Date().toISOString(),
  };
}

function inferDims(rows, columns) {
  const coordinates = [[], [], []];
  for (const row of rows) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = columns.position[axis] >= 0 ? numeric(row[columns.position[axis]]) : 0;
      coordinates[axis].push(value);
    }
  }
  const unique = coordinates.map(uniqueSorted);
  const dims = unique.map((values) => Math.max(1, values.length));
  const lookup = unique.map((values) => new Map(values.map((value, index) => [value.toFixed(6), index])));
  return { dims, unique, lookup };
}

function sourceBoundsFromUnique(unique) {
  return {
    min: unique.map((values) => (values.length ? values[0] : 0)),
    max: unique.map((values, axis) => {
      if (!values.length) return 1;
      if (values.length === 1) return values[0] + 1;
      return values[values.length - 1];
    }),
  };
}

export function parseCsvDataset(text, name = 'Imported field.csv') {
  const rows = parseDelimited(text);
  if (rows.length < 2) throw new Error('CSV has no data rows.');
  const headers = rows[0].map(normalizeHeader);
  const columns = {
    position: ['x', 'y', 'z'].map((key) => findColumn(headers, HEADER_ALIASES[key])),
    vector: ['u', 'v', 'w'].map((key) => findColumn(headers, HEADER_ALIASES[key])),
    scalar: findColumn(headers, HEADER_ALIASES.scalar),
  };
  if (columns.vector.some((index) => index < 0)) {
    throw new Error('CSV needs u/v/w, vx/vy/vz, or velocity_x/y/z columns.');
  }
  const dataRows = rows.slice(1);
  const { dims, unique, lookup } = inferDims(dataRows, columns);
  const expected = dims[0] * dims[1] * dims[2];
  if (dataRows.length !== expected) {
    throw new Error(`Expected a regular ${dims.join(' × ')} grid (${expected} rows), found ${dataRows.length}.`);
  }
  const values = [];
  const seen = new Set();
  for (const row of dataRows) {
    const indices = [0, 1, 2].map((axis) => {
      if (columns.position[axis] < 0) return 0;
      return lookup[axis].get(numeric(row[columns.position[axis]]).toFixed(6)) ?? 0;
    });
    const index = (indices[2] * dims[1] + indices[1]) * dims[0] + indices[0];
    seen.add(index);
    const u = numeric(row[columns.vector[0]]);
    const v = numeric(row[columns.vector[1]]);
    const w = numeric(row[columns.vector[2]]);
    const scalar = columns.scalar >= 0 ? numeric(row[columns.scalar]) : Math.hypot(u, v, w);
    values.push({ index, u, v, w, scalar });
  }
  if (seen.size !== expected) {
    throw new Error(`Grid coordinates do not cover every cell (${seen.size}/${expected}).`);
  }
  return buildDataset({
    name,
    dims,
    values,
    sourceBounds: sourceBoundsFromUnique(unique),
    sourceColumns: headers,
    rows: dataRows.length,
  });
}

function arrayFromField(obj, keys) {
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return null;
}

export function parseJsonDataset(text, name = 'Imported field.json') {
  const obj = JSON.parse(text);
  const dimsRaw = obj.dimensions || obj.dims || obj.size || obj.grid?.dimensions;
  if (!Array.isArray(dimsRaw) || dimsRaw.length < 2 || dimsRaw.length > 3) {
    throw new Error('JSON needs dimensions: [nx, ny, nz] (or a 2D [nx, nz] grid).');
  }
  const dims = dimsRaw.length === 2
    ? [Number(dimsRaw[0]), 1, Number(dimsRaw[1])]
    : dimsRaw.map(Number);
  if (dims.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error('JSON dimensions must be positive integers.');
  }
  const count = dims[0] * dims[1] * dims[2];
  const u = arrayFromField(obj, ['u', 'vx', 'vel_x', 'components_u']) || obj.fields?.u || obj.vectors?.u;
  const v = arrayFromField(obj, ['v', 'vy', 'vel_y', 'components_v']) || obj.fields?.v || obj.vectors?.v;
  const w = arrayFromField(obj, ['w', 'vz', 'vel_z', 'components_w']) || obj.fields?.w || obj.vectors?.w;
  const scalarArray = arrayFromField(obj, ['scalar', 's', 'pressure', 'value', 'magnitude']) || obj.fields?.scalar;
  const flat = arrayFromField(obj, ['data', 'vectors', 'values']);
  const values = [];

  if (Array.isArray(u) && Array.isArray(v) && Array.isArray(w)) {
    if (u.length < count || v.length < count || w.length < count) {
      throw new Error(`JSON vector channels must each contain ${count} values.`);
    }
    for (let i = 0; i < count; i += 1) {
      values.push({
        index: i,
        u: numeric(u[i]),
        v: numeric(v[i]),
        w: numeric(w[i]),
        scalar: scalarArray ? numeric(scalarArray[i]) : Math.hypot(numeric(u[i]), numeric(v[i]), numeric(w[i])),
      });
    }
  } else if (Array.isArray(flat)) {
    const objectRows = Array.isArray(flat[0]) && flat[0].length >= 3;
    const objectPoints = !Array.isArray(flat[0]) && typeof flat[0] === 'object';
    if (objectPoints) {
      for (const point of flat) {
        const p = point.position || point.p || [point.x, point.y, point.z];
        const vec = point.vector || point.v || [point.u, point.vx, point.vy, point.vz, point.w];
        const components = Array.isArray(vec) ? vec : [vec.u ?? vec.vx, vec.v ?? vec.vy, vec.w ?? vec.vz];
        const indices = [0, 1, 2].map((axis) => {
          const coordinate = numeric(p?.[axis]);
          return Math.round(coordinate);
        });
        const index = (indices[2] * dims[1] + indices[1]) * dims[0] + indices[0];
        values.push({
          index,
          u: numeric(components[0]),
          v: numeric(components[1]),
          w: numeric(components[2]),
          scalar: numeric(point.scalar ?? point.value ?? Math.hypot(...components.map(numeric))),
        });
      }
    } else if (objectRows) {
      if (flat.length < count) throw new Error(`JSON vectors must contain ${count} rows.`);
      for (let i = 0; i < count; i += 1) {
        const row = flat[i];
        values.push({
          index: i,
          u: numeric(row[0]),
          v: numeric(row[1]),
          w: numeric(row[2]),
          scalar: row.length > 3 ? numeric(row[3]) : Math.hypot(numeric(row[0]), numeric(row[1]), numeric(row[2])),
        });
      }
    } else {
      const stride = flat.length >= count * 4 ? 4 : 3;
      if (flat.length < count * stride) throw new Error(`JSON flat data must contain ${count * 3} or ${count * 4} values.`);
      for (let i = 0; i < count; i += 1) {
        const base = i * stride;
        const components = [numeric(flat[base]), numeric(flat[base + 1]), numeric(flat[base + 2])];
        values.push({
          index: i,
          u: components[0],
          v: components[1],
          w: components[2],
          scalar: stride === 4 ? numeric(flat[base + 3]) : Math.hypot(...components),
        });
      }
    }
  } else {
    throw new Error('JSON needs u/v/w arrays, vectors rows, or a flat data array.');
  }

  const sourceBounds = obj.bounds || obj.grid?.bounds || {
    min: dims.map(() => 0),
    max: dims.map((value) => value - 1),
  };
  return buildDataset({
    name: obj.name || name,
    dims,
    values,
    sourceBounds: {
      min: sourceBounds.min || sourceBounds[0] || dims.map(() => 0),
      max: sourceBounds.max || sourceBounds[1] || dims.map((value) => value - 1),
    },
    sourceColumns: Object.keys(obj),
    rows: count,
  });
}

export function parseDatasetFile(text, filename) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonDataset(text, filename);
  return parseCsvDataset(text, filename);
}

export function createSampleFieldCsv(dims = [16, 6, 16]) {
  const [nx, ny, nz] = dims;
  const rows = ['x,y,z,u,v,w,scalar'];
  const options = { mode: MODE_INDEX.wind, amplitude: 0.34, time: 8.0, scale: 1, dataScale: 1 };
  for (let iz = 0; iz < nz; iz += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let ix = 0; ix < nx; ix += 1) {
        const x = CANONICAL_BOUNDS.min[0] + (CANONICAL_BOUNDS.max[0] - CANONICAL_BOUNDS.min[0]) * ix / (nx - 1);
        const y = CANONICAL_BOUNDS.min[1] + (CANONICAL_BOUNDS.max[1] - CANONICAL_BOUNDS.min[1]) * iy / (ny - 1);
        const z = CANONICAL_BOUNDS.min[2] + (CANONICAL_BOUNDS.max[2] - CANONICAL_BOUNDS.min[2]) * iz / (nz - 1);
        const [u, v, w] = sampleField([x, y, z], options);
        const scalar = 0.5 + 0.1 * (-u + 2 * Math.sin(0.18 * x + 2) + 1.2 * Math.cos(0.2 * z - 1.2));
        rows.push([x, y, z, u, v, w, scalar].map((value) => value.toFixed(5)).join(','));
      }
    }
  }
  return `${rows.join('\n')}\n`;
}

export function datasetSummary(dataset) {
  if (!dataset) return 'No external dataset';
  return `${dataset.dims.join(' × ')} · ${dataset.rows.toLocaleString()} samples`;
}

export function sampleVectorMagnitude(row) {
  return length3(row);
}
