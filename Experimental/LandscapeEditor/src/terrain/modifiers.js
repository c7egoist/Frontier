// Sculpting modifiers. Each takes the current height (metres) and returns a new height of the same size.
// The layer blends that result into the stack through its mask and opacity.
import { makeGrid, blur, clamp, smoothstep, slopeDegrees } from './grid.js';
import { perlin2, fbm } from './noise.js';

const P = (key, label, min, max, step, def, unit = '') => ({ key, label, min, max, step, default: def, unit });

// Stable 0..1 hash per integer (used to give every rock bed its own hardness).
function bedHash(k, seed) {
  let h = (k * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const MODIFIERS = {
  stratify: {
    id: 'stratify',
    label: 'Stratify (rock beds)',
    description: 'Sedimentary bedding. Hard beds form flat-topped ledges with sharp steps; soft beds slope back. Tilt moves the beds across the map.',
    params: [
      P('thickness', 'Bed thickness', 10, 400, 1, 90, 'm'),
      P('tilt', 'Bed tilt', 0, 30, 0.1, 4, '°'),
      P('contrast', 'Hard / soft contrast', 0, 1, 0.01, 0.7, ''),
      P('jitter', 'Bed irregularity', 0, 60, 0.5, 14, 'm'),
      P('strength', 'Strength', 0, 1, 0.01, 0.85, ''),
    ],
    run(ctx, p, h) {
      const { n, cs, tables } = ctx;
      const out = makeGrid(n);
      const t = Math.tan((p.tilt * Math.PI) / 180);
      const k = 3 / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          const jitter = p.jitter * fbm(tables, x * k, y * k, 3, 0.5);
          const s = (h[i] + jitter + x * cs * t) / p.thickness;
          const band = Math.floor(s);
          const f = s - band;
          const hard = bedHash(band, ctx.seed);
          // Hard beds have a short rise (a cliff); soft beds a long slope.
          const edge = clamp(0.95 - hard * p.contrast * 0.85, 0.08, 0.95);
          const v = band + smoothstep(0, edge, f);
          out[i] = v * p.thickness - jitter - x * cs * t;
        }
      }
      return blendWith(h, out, p.strength);
    },
  },

  terrace: {
    id: 'terrace',
    label: 'Terrace (stepped)',
    description: 'Quantises the surface into flat steps with soft risers. Reads as river terraces or mesas.',
    params: [
      P('step', 'Step height', 10, 500, 1, 120, 'm'),
      P('edge', 'Riser softness', 0.02, 0.5, 0.01, 0.12, ''),
      P('strength', 'Strength', 0, 1, 0.01, 0.8, ''),
    ],
    run(ctx, p, h) {
      const out = makeGrid(ctx.n);
      for (let i = 0; i < out.length; i++) {
        const t = h[i] / p.step;
        const f = Math.floor(t);
        const frac = t - f;
        out[i] = (f + smoothstep(0.5 - p.edge, 0.5 + p.edge, frac)) * p.step;
      }
      return blendWith(h, out, p.strength);
    },
  },

  cliff: {
    id: 'cliff',
    label: 'Cliffs (escarpment)',
    description: 'Steepens existing slopes that already exceed a threshold, sharpening the break at the top and base of a face.',
    params: [
      P('threshold', 'Steep threshold', 15, 75, 0.5, 38, '°'),
      P('amount', 'Steepening', 0, 1, 0.01, 0.6, ''),
      P('radius', 'Face radius', 1, 6, 1, 2, 'cells'),
    ],
    run(ctx, p, h) {
      const { n } = ctx;
      const slope = slopeDegrees(h, n, ctx.cs);
      const smooth = Float32Array.from(h);
      blur(smooth, n, 1, Math.round(p.radius));
      const out = makeGrid(n);
      for (let i = 0; i < out.length; i++) {
        const gate = smoothstep(p.threshold - 4, p.threshold + 4, slope[i]);
        out[i] = h[i] + p.amount * gate * (h[i] - smooth[i]) * 2.2;
      }
      return out;
    },
  },

  rift: {
    id: 'rift',
    label: 'Rift / canyon',
    description: 'Carves a meandering rift or canyon along a bearing, with walls that stay steep. Deep cuts for canyonlands.',
    params: [
      P('width', 'Rift width', 60, 1500, 5, 260, 'm'),
      P('depth', 'Depth', 0, 1200, 5, 380, 'm'),
      P('meander', 'Meander amplitude', 0, 800, 5, 260, 'm'),
      P('bearing', 'Bearing', 0, 179, 1, 35, '°'),
      P('walls', 'Wall sharpness', 0.5, 4, 0.01, 1.8, ''),
    ],
    run(ctx, p, h) {
      const { n, cs, tables } = ctx;
      const out = Float32Array.from(h);
      const a = (p.bearing * Math.PI) / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const worldM = n * cs;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const wx = (x - n / 2) * cs;
          const wy = (y - n / 2) * cs;
          const along = wx * ca + wy * sa;
          const across = -wx * sa + wy * ca;
          // The centreline wanders with low-frequency noise along the rift.
          const centre = p.meander * perlin2(tables, along / (worldM * 0.22), 3.7);
          const d = Math.abs(across - centre);
          const t = clamp(1 - d / p.width);
          const cut = Math.pow(t, p.walls);
          const i = y * n + x;
          out[i] = h[i] - p.depth * cut;
        }
      }
      return out;
    },
  },

  smooth: {
    id: 'smooth',
    label: 'Smooth (weather)',
    description: 'Averages the surface, removing micro-noise and softening sharp edges.',
    params: [
      P('passes', 'Passes', 1, 12, 1, 3, ''),
      P('radius', 'Radius', 1, 4, 1, 1, 'cells'),
      P('strength', 'Strength', 0, 1, 0.01, 1, ''),
    ],
    run(ctx, p, h) {
      const out = Float32Array.from(h);
      blur(out, ctx.n, Math.round(p.passes), Math.round(p.radius));
      return blendWith(h, out, p.strength);
    },
  },

  sharpen: {
    id: 'sharpen',
    label: 'Sharpen ridges',
    description: 'Unsharp-masks the surface so crests and gullies read more crisply.',
    params: [
      P('amount', 'Amount', 0, 2, 0.01, 0.5, ''),
      P('radius', 'Radius', 1, 6, 1, 2, 'cells'),
    ],
    run(ctx, p, h) {
      const smooth = Float32Array.from(h);
      blur(smooth, ctx.n, 1, Math.round(p.radius));
      const out = makeGrid(ctx.n);
      for (let i = 0; i < out.length; i++) out[i] = h[i] + p.amount * (h[i] - smooth[i]);
      return out;
    },
  },

  remap: {
    id: 'remap',
    label: 'Elevation curve',
    description: 'Gamma and lift on the elevation range. Lower gamma lifts the lowlands; higher gamma concentrates relief in the peaks.',
    params: [
      P('gamma', 'Gamma', 0.3, 3, 0.01, 1, ''),
      P('lift', 'Lift', -300, 300, 1, 0, 'm'),
    ],
    run(ctx, p, h) {
      const out = makeGrid(ctx.n);
      const top = ctx.maxElevation || 1;
      for (let i = 0; i < out.length; i++) {
        const t = clamp(h[i] / top);
        out[i] = Math.pow(t, p.gamma) * top + p.lift;
      }
      return out;
    },
  },
};

export const MODIFIER_LIST = Object.values(MODIFIERS);

// Mix `next` into `prev` by strength. Used by modifiers that expose a strength control.
function blendWith(prev, next, strength) {
  const out = new Float32Array(prev.length);
  for (let i = 0; i < out.length; i++) out[i] = prev[i] + (next[i] - prev[i]) * strength;
  return out;
}

