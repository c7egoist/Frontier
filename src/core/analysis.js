import {
  DOMAIN_MIN,
  DOMAIN_MAX,
  MODE_INDEX,
  curlField,
  divergenceField,
  effectiveScale,
  length3,
  sampleField,
  sampleFieldScaled,
  scalarSample,
  terrainHeight,
} from './fields.js';
import { clamp01 } from './palettes.js';

function linspace(min, max, count) {
  if (count <= 1) return [(min + max) * 0.5];
  return Array.from({ length: count }, (_, i) => min + (max - min) * i / (count - 1));
}

export function samplePositions(options, counts = [9, 4, 9]) {
  const [nx, ny, nz] = counts;
  const customBounds = options.mode === MODE_INDEX.custom ? options.dataset?.bounds : null;
  const minX = customBounds?.min[0] ?? -13;
  const maxX = customBounds?.max[0] ?? 13;
  const minZ = customBounds?.min[2] ?? -13;
  const maxZ = customBounds?.max[2] ?? 13;
  const minY = customBounds?.min[1] ?? 1.0;
  const maxY = customBounds?.max[1] ?? 11.0;
  const xs = linspace(minX, maxX, nx);
  const zs = linspace(minZ, maxZ, nz);
  const positions = [];
  for (let iy = 0; iy < ny; iy += 1) {
    const ratio = ny <= 1 ? 0.5 : iy / (ny - 1);
    for (const z of zs) {
      for (const x of xs) {
        const y = options.mode === MODE_INDEX.terrain
          ? terrainHeight(x, z, options.amplitude) + 0.45 + ratio * 5.2
          : minY + (maxY - minY) * ratio;
        positions.push([x, y, z]);
      }
    }
  }
  return positions;
}

export function computeFieldStats(options) {
  const positions = samplePositions(options);
  const bins = new Array(24).fill(0);
  let sumSpeed = 0;
  let maxSpeed = 0;
  let sumEnergy = 0;
  let sumCurl = 0;
  let sumDivergence = 0;
  let scalarMin = 1;
  let scalarMax = 0;
  for (const p of positions) {
    const raw = sampleField(p, options);
    const v = sampleFieldScaled(p, options);
    const speed = length3(v);
    const scalar = scalarSample(p, raw, options).normalized;
    const curl = length3(curlField(p, options));
    const divergence = divergenceField(p, options);
    sumSpeed += speed;
    maxSpeed = Math.max(maxSpeed, speed);
    sumEnergy += 0.5 * speed * speed;
    sumCurl += curl;
    sumDivergence += Math.abs(divergence);
    scalarMin = Math.min(scalarMin, scalar);
    scalarMax = Math.max(scalarMax, scalar);
    const bin = Math.min(bins.length - 1, Math.floor(clamp01(speed / 6) * (bins.length - 1)));
    bins[bin] += 1;
  }
  const count = Math.max(1, positions.length);
  const meanSpeed = sumSpeed / count;
  const meanDivergence = sumDivergence / count;
  return {
    samples: positions.length,
    meanSpeed,
    maxSpeed,
    energy: sumEnergy / count,
    meanCurl: sumCurl / count,
    meanDivergence,
    coherence: clamp01(1 - meanDivergence * 0.14),
    scalarMin,
    scalarMax,
    histogram: bins,
    histogramMax: Math.max(1, ...bins),
  };
}

export function probeSample(point, options) {
  const raw = sampleField(point, options);
  const vector = sampleFieldScaled(point, options);
  const speed = length3(vector);
  const scalar = scalarSample(point, raw, options);
  const scale = effectiveScale(options);
  const curl = length3(curlField(point, options)) * scale;
  const divergence = divergenceField(point, options) * scale;
  const horizontal = Math.hypot(vector[0], vector[2]);
  return {
    point: [...point],
    vector,
    speed,
    scalar,
    curl,
    divergence,
    azimuth: Math.atan2(vector[2], vector[0]) * 180 / Math.PI,
    inclination: Math.atan2(vector[1], horizontal) * 180 / Math.PI,
    insideDomain: point.every((value, axis) => value >= DOMAIN_MIN[axis] && value <= DOMAIN_MAX[axis]),
  };
}

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toExponential(1);
  return value.toFixed(digits);
}

export function formatClock(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':');
}
