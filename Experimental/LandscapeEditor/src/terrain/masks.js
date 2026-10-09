// Masks gate a layer. Each returns a 0..1 field. A mask can also carry its own generator ("breakup"),
// so an edge that would otherwise be a clean line picks up natural irregularity.
import { makeGrid, smoothstep, smootherstep, clamp, distanceTo, laplacian, slopeDegrees } from './grid.js';
import { fbm, cellular } from './noise.js';

// Cached per-evaluation derived fields. Built once by the pipeline and reused by every mask.
export function derivedFields(ctx, height) {
  const { n, cs } = ctx;
  if (!ctx.slope) ctx.slope = slopeDegrees(height, n, cs);
  if (!ctx.curv) {
    const lap = laplacian(height, n, cs);
    // Normalise by the 95th percentile of |curvature| so the mask thresholds are scale-free.
    const abs = Float32Array.from(lap, Math.abs).sort();
    const p95 = abs[Math.floor(abs.length * 0.95)] || 1e-6;
    for (let i = 0; i < lap.length; i++) lap[i] /= p95;
    ctx.curv = lap;
  }
  return ctx;
}

export const P_MASK = (key, label, min, max, step, def, unit = '') => ({ key, label, min, max, step, default: def, unit });

export const MASKS = {
  coastal: {
    id: 'coastal',
    label: 'Coastal falloff',
    description: 'Distance from the shoreline. Gives the coast a soft, realistic falloff instead of a hard waterline.',
    params: [
      P_MASK('width', 'Falloff width', 10, 1500, 5, 220, 'm'),
      P_MASK('side', 'Side (0 = land, 1 = sea)', 0, 1, 1, 0, ''),
      P_MASK('curve', 'Curve', 0.3, 3, 0.01, 1.2, ''),
    ],
    run(ctx, p, height) {
      const { n, cs } = ctx;
      // Water is any cell below the datum. Distance to water is measured in metres.
      const water = new Uint8Array(n * n);
      for (let i = 0; i < water.length; i++) water[i] = height[i] < ctx.seaLevel ? 1 : 0;
      const d = distanceTo(n, water);
      const out = makeGrid(n);
      for (let i = 0; i < out.length; i++) {
        const metres = d[i] * cs;
        const land = water[i] ? 0 : Math.pow(smootherstep(0, p.width, metres), p.curve);
        const sea = water[i] ? Math.pow(smootherstep(0, p.width, metres), p.curve) : 0;
        out[i] = p.side >= 0.5 ? sea : land;
      }
      return out;
    },
  },

  altitude: {
    id: 'altitude',
    label: 'Mountain falloff',
    description: 'Smooth altitude falloff. Ramps the effect in over a band of heights, so peaks ease off into lowland with no hard seam.',
    params: [
      P_MASK('low', 'Start height', 0, 3000, 5, 400, 'm'),
      P_MASK('high', 'Full height', 0, 4000, 5, 1400, 'm'),
      P_MASK('curve', 'Shoulder curve', 0.3, 4, 0.01, 1.6, ''),
    ],
    run(ctx, p, height) {
      const out = makeGrid(ctx.n);
      for (let i = 0; i < out.length; i++) {
        out[i] = Math.pow(smootherstep(p.low, Math.max(p.low + 1, p.high), height[i]), p.curve);
      }
      return out;
    },
  },

  slope: {
    id: 'slope',
    label: 'Slope',
    description: 'Steepness band in degrees. Use to target cliffs (high) or flats (low).',
    params: [
      P_MASK('from', 'From', 0, 90, 0.5, 25, '°'),
      P_MASK('to', 'To', 0, 90, 0.5, 55, '°'),
      P_MASK('soft', 'Softness', 0.5, 30, 0.5, 8, '°'),
    ],
    run(ctx, p) {
      const out = makeGrid(ctx.n);
      for (let i = 0; i < out.length; i++) {
        const s = ctx.slope[i];
        out[i] = smootherstep(p.from - p.soft, p.from + p.soft, s) * (1 - smootherstep(p.to - p.soft, p.to + p.soft, s));
      }
      return out;
    },
  },

  curvature: {
    id: 'curvature',
    label: 'Protrusion / hollow',
    description: 'Convex crests (protrusions) or concave hollows, from surface curvature.',
    params: [
      P_MASK('sign', 'Target (1 = crests, -1 = hollows)', -1, 1, 2, 1, ''),
      P_MASK('threshold', 'Threshold', 0, 1, 0.01, 0.35, ''),
      P_MASK('width', 'Softness', 0.02, 0.6, 0.01, 0.2, ''),
    ],
    run(ctx, p) {
      const out = makeGrid(ctx.n);
      const s = p.sign >= 0 ? 1 : -1;
      for (let i = 0; i < out.length; i++) {
        out[i] = smoothstep(p.threshold - p.width, p.threshold + p.width, s * ctx.curv[i]);
      }
      return out;
    },
  },

  noise: {
    id: 'noise',
    label: 'Noise',
    description: 'Fractal noise threshold. Scatters a mask across the map without any terrain input.',
    params: [
      P_MASK('freq', 'Frequency', 0.5, 12, 0.1, 3, 'tiles'),
      P_MASK('threshold', 'Coverage', 0, 1, 0.01, 0.5, ''),
      P_MASK('soft', 'Softness', 0.01, 0.5, 0.01, 0.15, ''),
    ],
    run(ctx, p) {
      const out = makeGrid(ctx.n);
      const k = p.freq / ctx.n;
      for (let y = 0; y < ctx.n; y++) {
        for (let x = 0; x < ctx.n; x++) {
          const v = 0.5 + 0.5 * fbm(ctx.tables, x * k + 40, y * k - 20, 5, 0.5);
          out[y * ctx.n + x] = smoothstep(p.threshold - p.soft, p.threshold + p.soft, v);
        }
      }
      return out;
    },
  },

  radial: {
    id: 'radial',
    label: 'Radial falloff',
    description: 'Centred island or basin falloff. Fades the terrain toward the edges of the map.',
    params: [
      P_MASK('radius', 'Radius', 0.1, 1.2, 0.01, 0.8, 'of grid'),
      P_MASK('soft', 'Softness', 0.02, 1, 0.01, 0.4, ''),
    ],
    run(ctx, p) {
      const n = ctx.n;
      const out = makeGrid(n);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const r = Math.hypot(x / n - 0.5, y / n - 0.5) * 2;
          out[y * n + x] = 1 - smootherstep(p.radius - p.soft, p.radius, r);
        }
      }
      return out;
    },
  },

  strata: {
    id: 'strata',
    label: 'Stratigraphy bands',
    description: 'Horizontal rock bands in elevation. Selects the hard beds that form ledges and cliffs.',
    params: [
      P_MASK('period', 'Band period', 5, 600, 1, 90, 'm'),
      P_MASK('duty', 'Hard-bed share', 0.05, 0.95, 0.01, 0.4, ''),
      P_MASK('soft', 'Edge softness', 0.01, 0.5, 0.01, 0.08, ''),
    ],
    run(ctx, p, height) {
      const out = makeGrid(ctx.n);
      for (let i = 0; i < out.length; i++) {
        const f = (height[i] / p.period) - Math.floor(height[i] / p.period);
        out[i] = smoothstep(p.duty - p.soft, p.duty, f) * (1 - smoothstep(1 - p.soft, 1, f));
      }
      return out;
    },
  },
};

export const MASK_LIST = Object.values(MASKS);

// Applies an optional generator "breakup" to a mask. `amount` 0 leaves the mask untouched.
export function applyBreakup(ctx, mask, node) {
  if (!node.breakup || node.breakup === 'none' || !node.breakupAmount) return mask;
  const { n, tables } = ctx;
  const k = (node.breakupScale || 4) / n;
  const a = node.breakupAmount;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let noise;
      if (node.breakup === 'cellular') {
        const [f1] = cellular(x * k, y * k, ctx.seed + 7, 1);
        noise = clamp(f1);
      } else {
        noise = 0.5 + 0.5 * fbm(tables, x * k + 13, y * k + 71, 4, 0.5);
      }
      // Push the mask toward 0 or 1 where the breakup noise is far from 0.5, so the edge is ragged.
      mask[i] = clamp(mask[i] + a * (noise - 0.5) * 2);
    }
  }
  return mask;
}

export const BREAKUP_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'fbm', label: 'Perlin fBm' },
  { id: 'cellular', label: 'Cellular' },
];

// Evaluates one mask node: its type, its parameters, its breakup, then invert and strength.
export function evaluateMask(ctx, node, height) {
  const def = MASKS[node.type] || MASKS.noise;
  derivedFields(ctx, height);
  let m = def.run(ctx, node.params, height);
  m = applyBreakup(ctx, m, node);
  const inv = node.invert ? 1 : 0;
  const strength = node.strength ?? 1;
  for (let i = 0; i < m.length; i++) {
    let v = inv ? 1 - m[i] : m[i];
    v = clamp(v * strength);
    m[i] = v;
  }
  return m;
}
