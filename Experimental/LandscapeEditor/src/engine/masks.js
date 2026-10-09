import { num, int, choice, defaultsOf } from "./schema.js";
import { clamp, smoothstep, smootherstep, distanceFrom, normalize } from "./field.js";
import { fbm, ridged, billow } from "./noise.js";
import { GENERATORS, runGenerator } from "./generators.js";

// Masks return a weight in [0, 1] per cell. A layer multiplies its effect by the combined weight,
// so a mask decides where a generator, erosion or modifier is allowed to act.
// `c` = { N, cell, maxH, seaM, noiseFor(offset), derive(H) }, and H is normalised [0, 1].


function field(c, fn) {
  const out = new Float32Array(c.N * c.N);
  const inv = 1 / c.N;
  for (let y = 0; y < c.N; y++) {
    for (let x = 0; x < c.N; x++) out[y * c.N + x] = fn(x * inv, y * inv, y * c.N + x);
  }
  return out;
}

export const MASKS = {
  coastal: {
    label: "Coastal falloff",
    blurb: "Fades the effect in from the shoreline, so coasts get a soft shelf instead of a hard line.",
    params: [
      num("width", "Falloff width", 50, 4000, 10, 900, "m"),
      num("shore", "Shoreline offset", -500, 500, 5, 0, "m"),
      num("jitter", "Shoreline jitter", 0, 800, 5, 150, "m"),
      num("sharpness", "Falloff curve", 0.3, 3, 0.05, 1),
      choice("side", "Side", [["land", "Inland"], ["shelf", "Offshore shelf"]], "land"),
      int("seed", "Seed offset", 0, 999, 0),
    ],
    run(c, p, H) {
      const { N, cell, maxH } = c;
      const n = c.noiseFor(p.seed + 17);
      const sea = c.seaM + p.shore;
      const cells = p.width / cell;
      const water = new Uint8Array(N * N);
      const land = new Uint8Array(N * N);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          const jit = (fbm(n.perlin, x * 6 / N, y * 6 / N, 4, 2, 0.5)) * p.jitter * 2;
          const isLand = H[i] * maxH + jit > sea;
          land[i] = isLand ? 1 : 0;
          water[i] = isLand ? 0 : 1;
        }
      }
      if (p.side === "land") {
        const d = distanceFrom(water, N);
        return field(c, (u, v, i) => {
          if (!land[i]) return 0;
          return Math.pow(smootherstep(0, cells, d[i]), p.sharpness);
        });
      }
      const d = distanceFrom(land, N);
      return field(c, (u, v, i) => {
        if (land[i]) return 0;
        return Math.pow(1 - smootherstep(0, cells, d[i]), p.sharpness);
      });
    },
  },
  elevation: {
    label: "Mountain falloff",
    blurb: "Smooth altitude falloff. Weight rises across a band of heights and rolls off near the summit.",
    params: [
      num("low", "Start height", 0, 1, 0.01, 0.3, "×"),
      num("high", "Full height", 0, 1, 0.01, 0.7, "×"),
      num("summitRoll", "Summit roll-off", 0, 1, 0.01, 0.25, "×"),
      num("breakup", "Edge breakup", 0, 0.3, 0.005, 0.04, "×"),
      int("seed", "Seed offset", 0, 999, 0),
    ],
    run(c, p, H) {
      const n = c.noiseFor(p.seed + 31);
      return field(c, (u, v, i) => {
        const h = H[i];
        const nz = (fbm(n.perlin, u * 8, v * 8, 4, 2, 0.5) * 0.5 + 0.5) - 0.5;
        const hh = h + p.breakup * nz * 2;
        const band = smootherstep(p.low, Math.max(p.low + 1e-3, p.high), hh);
        return band * (1 - p.summitRoll * smootherstep(p.high, 1, hh));
      });
    },
  },
  slope: {
    label: "Slope",
    blurb: "Weight by steepness in degrees. Good for scree on the flanks and bare rock on the crags.",
    params: [
      num("min", "Start angle", 0, 80, 0.5, 8, "°"),
      num("max", "Full angle", 0, 80, 0.5, 35, "°"),
    ],
    run(c, p, H) {
      const slope = c.derive(H).slope;
      return field(c, (u, v, i) => smoothstep(p.min, Math.max(p.min + 0.5, p.max), slope[i]));
    },
  },
  cliffs: {
    label: "Cliffs",
    blurb: "Only the steepest faces. Narrow bands with a breakup so the rock lines look geological, not drawn.",
    params: [
      num("threshold", "Cliff angle", 20, 80, 0.5, 42, "°"),
      num("softness", "Edge softness", 1, 20, 0.5, 6, "°"),
      num("breakup", "Breakup", 0, 1, 0.01, 0.3, "×"),
      int("seed", "Seed offset", 0, 999, 0),
    ],
    run(c, p, H) {
      const slope = c.derive(H).slope;
      const n = c.noiseFor(p.seed + 43);
      return field(c, (u, v, i) => {
        const band = smoothstep(p.threshold - p.softness, p.threshold + p.softness, slope[i]);
        const nz = fbm(n.perlin, u * 14, v * 14, 3, 2, 0.5) * 0.5 + 0.5;
        return band * (1 - p.breakup * (1 - nz));
      });
    },
  },
  strata: {
    label: "Stratify (strata)",
    blurb: "Horizontal bedding bands at a set interval, bent by warp. Ledges and layered sandstone.",
    params: [
      num("interval", "Bed interval", 10, 500, 1, 80, "m"),
      num("duty", "Ledge share", 0.05, 0.95, 0.01, 0.55),
      num("sharpness", "Bed sharpness", 0, 1, 0.01, 0.7),
      num("warp", "Bed warp", 0, 300, 1, 40, "m"),
      num("phase", "Phase", 0, 500, 1, 0, "m"),
      int("seed", "Seed offset", 0, 999, 0),
    ],
    run(c, p, H) {
      const { maxH } = c;
      const n = c.noiseFor(p.seed + 59);
      const edge = (1 - p.sharpness) * 0.25 + 0.002;
      return field(c, (u, v, i) => {
        const bend = fbm(n.perlin, u * 3, v * 3, 3, 2, 0.5) * p.warp;
        const t = (H[i] * maxH + p.phase + bend) / p.interval;
        const f = t - Math.floor(t);
        return 1 - smoothstep(p.duty - edge, p.duty + edge, f);
      });
    },
  },
  rift: {
    label: "Rift lines",
    blurb: "Thin bands along fault zones, from zero crossings of a warped noise field. Used to place cracks and grabens.",
    params: [
      num("frequency", "Fault frequency", 0.5, 8, 0.05, 2.2, "cycles"),
      num("width", "Fault zone width", 0.01, 0.3, 0.005, 0.06),
      num("warp", "Fault warp", 0, 1, 0.01, 0.5, "×"),
      int("seed", "Seed offset", 0, 999, 0),
    ],
    run(c, p) {
      const n = c.noiseFor(p.seed + 71);
      return field(c, (u, v) => {
        const wx = fbm(n.perlin, u * 2 + 4.1, v * 2 + 0.7, 3, 2, 0.5) * p.warp;
        const wy = fbm(n.perlin, u * 2 + 9.3, v * 2 + 6.2, 3, 2, 0.5) * p.warp;
        const z = n.perlin((u + wx * 0.5) * p.frequency, (v + wy * 0.5) * p.frequency);
        return 1 - smoothstep(0, p.width * 3, Math.abs(z));
      });
    },
  },
  ridges: {
    label: "Ridges (protrusion)",
    blurb: "Weights cells that stand above their surroundings. Picks out spurs, crests and peaks.",
    params: [
      num("scale", "Scale", 40, 2000, 10, 260, "m"),
      num("min", "Start", -100, 200, 1, 0, "m"),
      num("max", "Full", 0, 600, 1, 60, "m"),
    ],
    run(c, p, H) {
      const prot = c.derive(H).protrusion(p.scale);
      return field(c, (u, v, i) => smoothstep(p.min, Math.max(p.min + 1, p.max), prot[i]));
    },
  },
  noise: {
    label: "Generator noise",
    blurb: "A generator used as a mask. Breaks up any effect into organic patches.",
    params: [
      choice("generator", "Generator", [["perlin", "Perlin fBm"], ["ridged", "Ridged"], ["billow", "Billow"], ["voronoi", "Voronoi"]], "perlin"),
      num("frequency", "Frequency", 0.2, 12, 0.05, 3, "cycles"),
      int("octaves", "Octaves", 1, 10, 5),
      num("contrast", "Contrast", 0.2, 4, 0.05, 1.5),
      num("bias", "Bias", -1, 1, 0.01, 0),
      int("seed", "Seed offset", 0, 999, 0),
    ],
    run(c, p) {
      const g = runGenerator(p.generator, c, {
        frequency: p.frequency,
        octaves: p.octaves,
        seed: p.seed + 83,
        amplitude: 1,
        base: 0,
      });
      return field(c, (u, v, i) => clamp((g[i] - 0.5) * p.contrast + 0.5 + p.bias, 0, 1));
    },
  },
};

export const MASK_OPS = [
  ["multiply", "Multiply (both)"],
  ["add", "Add (either)"],
  ["subtract", "Subtract"],
  ["max", "Maximum"],
  ["min", "Minimum"],
];

// Combine the enabled masks of one layer into a single weight field, or null when there are none.
export function buildMask(masks, H, c) {
  let acc = null;
  for (const m of masks || []) {
    if (!m || m.enabled === false) continue;
    const def = MASKS[m.type];
    if (!def) continue;
    const params = { ...defaultsOf(def.params), ...m.params };
    const w = def.run(c, params, H);
    if (m.invert) for (let i = 0; i < w.length; i++) w[i] = 1 - w[i];
    if (m.strength !== undefined && m.strength !== 1) {
      for (let i = 0; i < w.length; i++) w[i] *= m.strength;
    }
    if (!acc) {
      acc = w;
      continue;
    }
    switch (m.op) {
      case "add":
        for (let i = 0; i < acc.length; i++) acc[i] = acc[i] + w[i] - acc[i] * w[i];
        break;
      case "subtract":
        for (let i = 0; i < acc.length; i++) acc[i] = acc[i] * (1 - w[i]);
        break;
      case "max":
        for (let i = 0; i < acc.length; i++) acc[i] = Math.max(acc[i], w[i]);
        break;
      case "min":
        for (let i = 0; i < acc.length; i++) acc[i] = Math.min(acc[i], w[i]);
        break;
      default:
        for (let i = 0; i < acc.length; i++) acc[i] *= w[i];
    }
  }
  return acc;
}
