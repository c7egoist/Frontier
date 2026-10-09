// Base-shape generators. Each returns a field normalised to [0, 1] over the whole grid.
// The layer that owns the generator decides the elevation range (metres), so every generator
// reads the same way in the inspector regardless of its internal scale.
import { makeGrid, minMaxNormalize, smoothstep, clamp } from './grid.js';
import { fbm, ridged, hybridMultifractal, cellular, warpPoint, perlin2 } from './noise.js';

// Parameter descriptors are shared with the inspector, which builds one slider per entry.
export const P = {
  freq: { key: 'freq', label: 'Frequency', min: 0.5, max: 12, step: 0.1, default: 3, unit: 'tiles' },
  octaves: { key: 'octaves', label: 'Octaves', min: 1, max: 8, step: 1, default: 6, unit: '' },
  warp: { key: 'warp', label: 'Domain warp', min: 0, max: 1.2, step: 0.01, default: 0.35, unit: '' },
};

// `sample(u, v, t)` is called per cell with noise-space coordinates; `t` is the cell's normalised position.
function field(ctx, p, sample) {
  const { n, tables } = ctx;
  const out = makeGrid(n);
  const k = p.freq / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x * k;
      const v = y * k;
      const [wu, wv] = warpPoint(tables, u, v, p.warp);
      out[y * n + x] = sample(wu, wv, x / n, y / n, ctx);
    }
  }
  return minMaxNormalize(out);
}

export const GENERATORS = {
  fbm: {
    id: 'fbm',
    label: 'Perlin fBm',
    group: 'Noise',
    description: 'Classic gradient noise. Soft rolling relief; the default starting shape.',
    params: [P.freq, P.octaves, P.warp,
      { key: 'gain', label: 'Persistence', min: 0.2, max: 0.9, step: 0.01, default: 0.5, unit: '' },
      { key: 'lacunarity', label: 'Lacunarity', min: 1.5, max: 3, step: 0.05, default: 2, unit: '' },
    ],
    run: (ctx, p) => field(ctx, p, (u, v) => fbm(ctx.tables, u, v, p.octaves, p.gain, p.lacunarity)),
  },

  multifractal: {
    id: 'multifractal',
    label: 'Multifractal (hybrid)',
    group: 'Noise',
    description: 'Hybrid Musgrave multifractal. Detail grows on high ground, flats stay calm. Good for mixed relief.',
    params: [P.freq, P.octaves, P.warp,
      { key: 'H', label: 'Roughness H', min: 0.05, max: 1, step: 0.01, default: 0.25, unit: '' },
      { key: 'offset', label: 'Offset', min: 0.1, max: 1.5, step: 0.01, default: 0.7, unit: '' },
    ],
    run: (ctx, p) => field(ctx, p, (u, v) => hybridMultifractal(ctx.tables, u, v, p.octaves, p.H, 2, p.offset)),
  },

  ridge: {
    id: 'ridge',
    label: 'Ridge noise',
    group: 'Noise',
    description: 'Ridged multifractal. Sharp crests and branching spines, used for ranges and sierras.',
    params: [P.freq, P.octaves, P.warp,
      { key: 'sharpness', label: 'Crest gain', min: 1, max: 3, step: 0.01, default: 2, unit: '' },
      { key: 'offset', label: 'Crest offset', min: 0.5, max: 1.5, step: 0.01, default: 1, unit: '' },
    ],
    run: (ctx, p) => field(ctx, p, (u, v) => ridged(ctx.tables, u, v, p.octaves, p.sharpness, 2, p.offset)),
  },

  mountain: {
    id: 'mountain',
    label: 'Mountain noise',
    group: 'Noise',
    description: 'Ridges blended with billows, lifted to peaks. Dominant massifs with rounded foothills.',
    params: [P.freq, P.octaves, P.warp,
      { key: 'ridgeMix', label: 'Ridge share', min: 0, max: 1, step: 0.01, default: 0.7, unit: '' },
      { key: 'peak', label: 'Peak sharpness', min: 0.5, max: 4, step: 0.01, default: 1.8, unit: '' },
    ],
    run: (ctx, p) => field(ctx, p, (u, v) => {
      const r = ridged(ctx.tables, u, v, p.octaves, 2.1, 2, 1);
      const b = fbm(ctx.tables, u * 1.3 + 3, v * 1.3 - 2, Math.max(2, p.octaves - 2), 0.5);
      const mixed = r * p.ridgeMix + (0.5 + 0.5 * b) * (1 - p.ridgeMix);
      return Math.pow(clamp(mixed), p.peak);
    }),
  },

  voronoi: {
    id: 'voronoi',
    label: 'Cellular rock',
    group: 'Noise',
    description: 'Worley cells. Angular blocks, boulder fields and fractured outcrops.',
    params: [P.freq, P.warp,
      { key: 'jitter', label: 'Cell jitter', min: 0.1, max: 1, step: 0.01, default: 0.9, unit: '' },
      { key: 'mode', label: 'Mode (0 = blocks, 1 = cracks)', min: 0, max: 1, step: 0.01, default: 0.3, unit: '' },
    ],
    run: (ctx, p) => field(ctx, p, (u, v) => {
      const [f1, f2] = cellular(u, v, ctx.seed, p.jitter);
      const blocks = f1;
      const cracks = f2 - f1;
      return blocks * (1 - p.mode) + (1 - Math.min(1, cracks * 4)) * p.mode;
    }),
  },

  dunes: {
    id: 'dunes',
    label: 'Dune field',
    group: 'Sand',
    description: 'Crest-and-slipface dune ridges aligned to the prevailing wind, broken up with sand-sheet noise.',
    params: [
      { key: 'wavelength', label: 'Crest spacing', min: 40, max: 400, step: 1, default: 160, unit: 'm' },
      { key: 'bearing', label: 'Wind bearing', min: 0, max: 359, step: 1, default: 60, unit: '°' },
      { key: 'sharpness', label: 'Crest sharpness', min: 0.2, max: 3, step: 0.01, default: 1.2, unit: '' },
      { key: 'sheet', label: 'Sand-sheet break-up', min: 0, max: 1, step: 0.01, default: 0.35, unit: '' },
      { key: 'warp', label: 'Crest sinuosity', min: 0, max: 1.2, step: 0.01, default: 0.45, unit: '' },
    ],
    run: (ctx, p) => {
      const { n, cs, tables } = ctx;
      const out = makeGrid(n);
      const a = (p.bearing * Math.PI) / 180;
      // Crest direction is perpendicular to the wind; the crests are the wind-normal axis.
      const dx = -Math.sin(a);
      const dy = Math.cos(a);
      const kz = (2 * Math.PI) / p.wavelength;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const wx = x * cs;
          const wy = y * cs;
              const across = wx * dx + wy * dy;
          const n1 = fbm(tables, wx / (p.wavelength * 4), wy / (p.wavelength * 4), 3, 0.5);
          const phase = across * kz + n1 * p.warp * 4;
          let crest = (1 - Math.cos(phase)) * 0.5;
          crest = Math.pow(crest, p.sharpness);
          const sheetNoise = 0.5 + 0.5 * fbm(tables, wx / 900, wy / 900, 4, 0.5);
          const sheet = 1 - p.sheet * (1 - sheetNoise);
          out[y * n + x] = crest * sheet;
        }
      }
      return minMaxNormalize(out);
    },
  },

  mesa: {
    id: 'mesa',
    label: 'Plateau & mesa',
    group: 'Sand',
    description: 'Stepped tablelands with flat tops and hard edges. Shape for canyonlands and sandstone country.',
    params: [P.freq, P.warp,
      { key: 'steps', label: 'Terrace count', min: 1, max: 12, step: 1, default: 4, unit: '' },
      { key: 'edge', label: 'Edge softness', min: 0.02, max: 0.5, step: 0.01, default: 0.12, unit: '' },
    ],
    run: (ctx, p) => {
      const base = field(ctx, { ...p, freq: p.freq * 0.7 }, (u, v) => 0.6 * fbm(ctx.tables, u, v, 4, 0.5) + 0.4 * perlin2(ctx.tables, u * 3, v * 3));
      const out = makeGrid(ctx.n);
      for (let i = 0; i < out.length; i++) {
        const t = base[i] * p.steps;
        const f = Math.floor(t);
        const frac = t - f;
        out[i] = (f + smoothstep(0.5 - p.edge, 0.5 + p.edge, frac)) / p.steps;
      }
      return minMaxNormalize(out);
    },
  },

  hills: {
    id: 'hills',
    label: 'Rolling hills',
    group: 'Noise',
    description: 'Low-frequency fBm with few octaves. Gentle, soft landforms.',
    params: [
      { key: 'freq', label: 'Frequency', min: 0.5, max: 6, step: 0.1, default: 1.6, unit: 'tiles' },
      { key: 'octaves', label: 'Octaves', min: 1, max: 5, step: 1, default: 3, unit: '' },
      P.warp,
    ],
    run: (ctx, p) => field(ctx, p, (u, v) => fbm(ctx.tables, u, v, p.octaves, 0.45)),
  },

  shield: {
    id: 'shield',
    label: 'Shield volcano',
    group: 'Volcanic',
    description: 'Broad radial shield with a summit caldera. Basis for Icelandic and volcanic islands.',
    params: [
      { key: 'radius', label: 'Radius', min: 0.2, max: 1, step: 0.01, default: 0.7, unit: 'of grid' },
      { key: 'slope', label: 'Flank steepness', min: 0.5, max: 4, step: 0.01, default: 1.6, unit: '' },
      { key: 'caldera', label: 'Caldera depth', min: 0, max: 1, step: 0.01, default: 0.35, unit: '' },
      { key: 'rim', label: 'Rim break-up', min: 0, max: 1, step: 0.01, default: 0.3, unit: '' },
    ],
    run: (ctx, p) => {
      const { n, tables } = ctx;
      const out = makeGrid(n);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const u = x / n - 0.5;
          const v = y / n - 0.5;
          const r = Math.hypot(u, v) / (p.radius * 0.5);
          const rough = 1 + p.rim * 0.5 * fbm(tables, u * 9, v * 9, 4, 0.5);
          const flank = Math.exp(-Math.pow(r * rough, p.slope));
          const summit = smoothstep(0.35, 0, r * rough) * p.caldera * -1;
          out[y * n + x] = flank + summit * 0.6 + 0.02;
        }
      }
      return minMaxNormalize(out);
    },
  },

  ramp: {
    id: 'ramp',
    label: 'Tilted plane',
    group: 'Basic',
    description: 'Simple inclined plane. Use it as a base when another layer does the shaping.',
    params: [
      { key: 'bearing', label: 'Downhill bearing', min: 0, max: 359, step: 1, default: 90, unit: '°' },
    ],
    run: (ctx, p) => {
      const { n } = ctx;
      const out = makeGrid(n);
      const a = (p.bearing * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) out[y * n + x] = (x / n - 0.5) * dx + (y / n - 0.5) * dy;
      }
      return minMaxNormalize(out);
    },
  },
};

export const GENERATOR_LIST = Object.values(GENERATORS);
