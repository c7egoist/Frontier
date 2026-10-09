import { createNoise, fbm, ridged, hybrid, billow } from "./noise.js";
import { clamp, normalize, smoothstep } from "./field.js";
import { num, int, choice, defaultsOf, GENERATOR_COMMON } from "./schema.js";

// Base-shape generators. Each returns an N*N field in [0, 1].
// `c` is the evaluation context: { N, seed, noiseFor(offset) }.

function sampleField(c, fn) {
  const { N } = c;
  const out = new Float32Array(N * N);
  const inv = 1 / N;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) out[y * N + x] = fn(x * inv, y * inv);
  }
  return out;
}

function finish(out, p) {
  normalize(out);
  for (let i = 0; i < out.length; i++) out[i] = clamp(p.base + p.amplitude * out[i], 0, 1);
  return out;
}

const SHARED = {
  frequency: num("frequency", "Frequency", 0.2, 12, 0.05, 2, "cycles"),
  octaves: int("octaves", "Octaves", 1, 12, 6),
  lacunarity: num("lacunarity", "Lacunarity", 1.2, 3.5, 0.05, 2),
  gain: num("gain", "Gain (persistence)", 0.1, 0.9, 0.01, 0.5),
  warp: num("warp", "Domain warp", 0, 1, 0.01, 0.3, "×"),
};

// Domain warp: bend the sample space with low-frequency noise so features stop looking grid-aligned.
function warped(n, u, v, amount) {
  if (amount <= 0) return [u, v];
  const wx = fbm(n.perlin, u + 5.2, v + 1.3, 3, 2, 0.5);
  const wy = fbm(n.perlin, u + 8.3, v + 2.8, 3, 2, 0.5);
  return [u + amount * wx * 0.6, v + amount * wy * 0.6];
}

export const GENERATORS = {
  perlin: {
    label: "Perlin fBm",
    category: "generator",
    blurb: "Rolling, soft relief. The workhorse for foothills, plains and dune fields.",
    params: [SHARED.frequency, SHARED.octaves, SHARED.lacunarity, SHARED.gain, SHARED.warp, ...GENERATOR_COMMON],
    run(c, p) {
      const n = c.noiseFor(p.seed);
      const sc = p.frequency;
      return finish(
        sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * sc, v * sc, p.warp);
          return fbm(n.perlin, a, b, p.octaves, p.lacunarity, p.gain);
        }),
        p,
      );
    },
  },
  multifractal: {
    label: "Multifractal (hybrid)",
    category: "generator",
    blurb: "Musgrave hybrid multifractal. Rough, uneven ground that gets busier with height, like weathered massifs.",
    params: [
      num("frequency", "Frequency", 0.2, 10, 0.05, 2, "cycles"),
      int("octaves", "Octaves", 1, 12, 8),
      num("roughness", "Roughness (H)", 0.1, 1.5, 0.01, 0.8),
      num("offset", "Offset", 0.5, 1.5, 0.01, 0.9),
      SHARED.warp,
      ...GENERATOR_COMMON,
    ],
    run(c, p) {
      const n = c.noiseFor(p.seed);
      return finish(
        sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
          return hybrid(n.perlin, a, b, p.octaves, 2, p.roughness, p.offset);
        }),
        p,
      );
    },
  },
  ridged: {
    label: "Ridged multifractal",
    category: "generator",
    blurb: "Sharp crests and valleys. Pure ridge structure for spines and folded sierras.",
    params: [
      num("frequency", "Frequency", 0.2, 10, 0.05, 2.5, "cycles"),
      int("octaves", "Octaves", 1, 10, 6),
      num("sharpness", "Crest sharpness", 0.5, 3, 0.05, 1.2),
      SHARED.warp,
      ...GENERATOR_COMMON,
    ],
    run(c, p) {
      const n = c.noiseFor(p.seed);
      return finish(
        sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
          return ridged(n.perlin, a, b, p.octaves, 2, 2, p.sharpness);
        }),
        p,
      );
    },
  },
  mountain: {
    label: "Mountain range",
    category: "generator",
    blurb: "Ridged crests grouped into ranges. Coverage decides how much of the map is mountain at all.",
    params: [
      num("frequency", "Range scale", 0.5, 6, 0.05, 1.6, "cycles"),
      int("octaves", "Detail octaves", 1, 10, 7),
      num("sharpness", "Crest sharpness", 0.5, 3, 0.05, 1.7),
      num("coverage", "Range coverage", 0, 1, 0.01, 0.55, "×"),
      num("peaks", "Peak exponent", 0.5, 3, 0.05, 1.4),
      SHARED.warp,
      ...GENERATOR_COMMON,
    ],
    run(c, p) {
      const n = c.noiseFor(p.seed);
      const { coverage, peaks } = p;
      const ridgeField = sampleField(c, (u, v) => {
        const [a, b] = warped(n, u * p.frequency * 1.6, v * p.frequency * 1.6, Math.max(p.warp, 0.6));
        return ridged(n.perlin, a, b, p.octaves, 2.1, 2, p.sharpness);
      });
      const cover = sampleField(c, (u, v) => {
        const [a, b] = warped(n, u * p.frequency * 0.5 + 9.1, v * p.frequency * 0.5 + 3.7, 0.5);
        return billow(n.perlin, a, b, 3, 2, 0.5);
      });
      normalize(cover);
      const out = new Float32Array(ridgeField.length);
      for (let i = 0; i < out.length; i++) {
        const mask = smoothstep(coverage - 0.25, coverage + 0.25, cover[i]);
        out[i] = Math.pow(ridgeField[i], peaks) * mask + 0.08 * mask * cover[i];
      }
      return finish(out, p);
    },
  },
  billow: {
    label: "Billow noise",
    category: "generator",
    blurb: "Absolute-value noise. Soft bulbous mounds, good for dunes and rounded hills.",
    params: [
      num("frequency", "Frequency", 0.2, 12, 0.05, 3, "cycles"),
      int("octaves", "Octaves", 1, 10, 5),
      num("gain", "Gain (persistence)", 0.1, 0.9, 0.01, 0.5),
      SHARED.warp,
      ...GENERATOR_COMMON,
    ],
    run(c, p) {
      const n = c.noiseFor(p.seed);
      return finish(
        sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
          return billow(n.perlin, a, b, p.octaves, 2, p.gain);
        }),
        p,
      );
    },
  },
  voronoi: {
    label: "Voronoi terraces",
    category: "generator",
    blurb: "Cellular plates. With terrace steps it reads as lava plateaux, mesa caps and tilted fault blocks.",
    params: [
      num("frequency", "Cell count", 1, 16, 0.1, 4, "cells"),
      num("jitter", "Jitter", 0, 1, 0.01, 0.9),
      int("steps", "Terrace steps (0 = smooth)", 0, 16, 5),
      num("edge", "Edge softness", 0, 1, 0.01, 0.35),
      ...GENERATOR_COMMON,
    ],
    run(c, p) {
      const n = c.noiseFor(p.seed);
      const out = sampleField(c, (u, v) => {
        const d = n.cellular(u * p.frequency, v * p.frequency, p.jitter);
        return 1 - clamp(d, 0, 1);
      });
      normalize(out);
      if (p.steps > 0) {
        const soft = p.edge;
        for (let i = 0; i < out.length; i++) {
          const t = out[i] * p.steps;
          const f = Math.floor(t);
          const r = t - f;
          const s = smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, r);
          out[i] = (f + s) / p.steps;
        }
      }
      return finish(out, p);
    },
  },
  island: {
    label: "Island / continent",
    category: "generator",
    blurb: "A landmass inside a basin. Radius and falloff set how much sea surrounds the coast.",
    params: [
      num("radius", "Land radius", 0.1, 0.7, 0.01, 0.4, "×"),
      num("falloff", "Coast falloff", 0.02, 0.6, 0.01, 0.22, "×"),
      num("frequency", "Coastline detail", 0.5, 8, 0.05, 2.4, "cycles"),
      int("octaves", "Octaves", 1, 10, 7),
      SHARED.warp,
      ...GENERATOR_COMMON,
    ],
    run(c, p) {
      const n = c.noiseFor(p.seed);
      const out = sampleField(c, (u, v) => {
        const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp + 0.2);
        const detail = fbm(n.perlin, a, b, p.octaves, 2, 0.5) * 0.5 + 0.5;
        const dx = (u - 0.5) * 2;
        const dy = (v - 0.5) * 2;
        const r = Math.hypot(dx, dy) / Math.SQRT2;
        const coast = p.radius + (detail - 0.5) * 0.35;
        const land = 1 - smoothstep(coast - p.falloff, coast + p.falloff, r);
        return land * (0.45 + 0.55 * detail);
      });
      return finish(out, p);
    },
  },
  flat: {
    label: "Flat plateau",
    category: "generator",
    blurb: "Constant height. Start here when a later layer should do all the shaping.",
    params: [num("level", "Level", 0, 1, 0.01, 0.3, "×"), int("seed", "Seed offset", 0, 999, 0)],
    run(c, p) {
      return new Float32Array(c.N * c.N).fill(clamp(p.level, 0, 1));
    },
  },
};

// Sample a generator once more, used by masks and satmap layers that carry their own noise.
export function runGenerator(name, c, overrides) {
  const g = GENERATORS[name] || GENERATORS.perlin;
  const p = { ...defaultsOf(g.params), ...overrides };
  return g.run(c, p);
}

// Fine breakup noise in [0, 1], used to roughen mask edges and satmap colour.
export function breakupNoise(c, frequency, seed) {
  return runGenerator("perlin", c, { frequency, octaves: 4, warp: 0.1, seed, amplitude: 1, base: 0 });
}
