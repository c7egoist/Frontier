import { num, int, choice } from "./schema.js";
import { clamp, robustNormalize, lerp, protrusion as protrusionField } from "./field.js";
import { breakupNoise, runGenerator } from "./generators.js";

// Satmap layers colour the finished terrain. Each one reads a scalar (a channel of the terrain
// or a generator), maps it through a palette, and composites it over the layers below.
// The palettes are stylised on purpose: they are a reading aid, not a survey of real rock.

export const PALETTES = {
  sandstone: {
    label: "Sandstone bands",
    stops: [[0, "#3a2315"], [0.25, "#7e3f22"], [0.5, "#b8703f"], [0.75, "#dc9c64"], [1, "#f1cc99"]],
  },
  alpine: {
    label: "Alpine meadow to rock",
    stops: [[0, "#2d4a2a"], [0.3, "#4d6a3a"], [0.55, "#8b8a6b"], [0.75, "#8d8680"], [1, "#e7eaee"]],
  },
  snowrock: {
    label: "Snow and bare rock",
    stops: [[0, "#4a4d52"], [0.5, "#7d8189"], [0.8, "#cdd3dc"], [1, "#ffffff"]],
  },
  desert: {
    label: "Desert sand",
    stops: [[0, "#b98f58"], [0.5, "#dcb97e"], [1, "#f6e2b6"]],
  },
  volcanic: {
    label: "Basalt and ash",
    stops: [[0, "#131313"], [0.4, "#3a312d"], [0.7, "#6b5b52"], [1, "#a89383"]],
  },
  steppe: {
    label: "Dry steppe",
    stops: [[0, "#6a6b3e"], [0.5, "#a09a5b"], [1, "#d8c88f"]],
  },
  forest: {
    label: "Forest to scree",
    stops: [[0, "#1d3a1f"], [0.5, "#3b6a33"], [0.8, "#7c8a54"], [1, "#c9c9a2"]],
  },
  ice: {
    label: "Glacier ice",
    stops: [[0, "#7db0d4"], [0.5, "#cde5f1"], [1, "#ffffff"]],
  },
  coastal: {
    label: "Coastal sand and cliff",
    stops: [[0, "#2b2a27"], [0.35, "#6c6255"], [0.6, "#b49e7a"], [1, "#e6d6b4"]],
  },
  rock: {
    label: "Grey limestone",
    stops: [[0, "#2e2d2b"], [0.5, "#777268"], [1, "#c9c2b2"]],
  },
};

export const CHANNELS = {
  altitude: "Altitude",
  slope: "Slope (steepness)",
  protrusion: "Protrusion (convexity)",
  rivers: "Rivers (drainage)",
  sediment: "Sedimentation",
  wetness: "Wetness",
  exposure: "Sun exposure",
};

export const BLEND_MODES = [
  ["over", "Over"],
  ["multiply", "Multiply"],
  ["overlay", "Overlay"],
  ["screen", "Screen"],
  ["add", "Add"],
];

export const SATMAP_TYPE = {
  label: "Satmap",
  category: "satmap",
  blurb: "Colours the terrain from a channel or a generator, with palette, masks and breakup.",
  params: [
    choice("source", "Source", [["channel", "Terrain channel"], ["generator", "Generator"]], "channel"),
    choice("channel", "Channel", Object.entries(CHANNELS), "altitude"),
    choice("generator", "Generator", [["perlin", "Perlin fBm"], ["ridged", "Ridged"], ["billow", "Billow"], ["voronoi", "Voronoi"]], "perlin"),
    num("genFrequency", "Generator frequency", 0.2, 12, 0.05, 2.5, "cycles"),
    int("genOctaves", "Generator octaves", 1, 10, 5),
    choice("palette", "Palette", Object.entries(PALETTES).map(([k, v]) => [k, v.label]), "sandstone"),
    num("contrast", "Contrast", 0.2, 4, 0.05, 1),
    num("bias", "Bias", -0.5, 0.5, 0.01, 0),
    num("breakup", "Breakup", 0, 1, 0.01, 0.15, "×"),
    num("breakupScale", "Breakup scale", 0.5, 16, 0.1, 6, "cycles"),
    choice("blend", "Blend mode", BLEND_MODES, "over"),
    int("seed", "Seed offset", 0, 999, 0),
  ],
};

const lutCache = new Map();
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// 256-entry look-up table per palette, flat [r, g, b, ...] in [0, 1].
export function paletteLut(id) {
  if (lutCache.has(id)) return lutCache.get(id);
  const pal = PALETTES[id] || PALETTES.sandstone;
  const lut = new Float32Array(256 * 3);
  for (let k = 0; k < 256; k++) {
    const t = k / 255;
    let a = pal.stops[0];
    let b = pal.stops[pal.stops.length - 1];
    for (let s = 0; s < pal.stops.length - 1; s++) {
      if (t >= pal.stops[s][0] && t <= pal.stops[s + 1][0]) {
        a = pal.stops[s];
        b = pal.stops[s + 1];
        break;
      }
    }
    const span = b[0] - a[0] || 1;
    const u = clamp((t - a[0]) / span, 0, 1);
    const ca = hexToRgb(a[1]);
    const cb = hexToRgb(b[1]);
    for (let ch = 0; ch < 3; ch++) lut[k * 3 + ch] = lerp(ca[ch], cb[ch], u);
  }
  lutCache.set(id, lut);
  return lut;
}

// Terrain channels, all normalised [0, 1] except exposure which is already a lambert term.
export function computeChannels({ H, Hm, sed, flowA, slope, gx, gy, N, sun }) {
  const altitude = robustNormalize(Hm);
  const slopeN = robustNormalize(slope);
  const prot = robustNormalize(protrusionField(Hm, N, Math.max(2, Math.round(N / 48))));
  const logA = new Float32Array(flowA.length);
  for (let i = 0; i < flowA.length; i++) logA[i] = Math.log(1 + flowA[i]);
  const rivers = robustNormalize(logA);
  const sedN = robustNormalize(sed);
  const wet = new Float32Array(N * N);
  for (let i = 0; i < wet.length; i++) wet[i] = rivers[i] * (1 - slopeN[i] * 0.85);
  const exposure = new Float32Array(N * N);
  const az = (sun.azimuth * Math.PI) / 180;
  const el = (sun.elevation * Math.PI) / 180;
  const Lx = Math.cos(el) * Math.cos(az);
  const Ly = Math.cos(el) * Math.sin(az);
  const Lz = Math.sin(el);
  for (let i = 0; i < exposure.length; i++) {
    const nx = -gx[i];
    const ny = -gy[i];
    const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    exposure[i] = clamp((nx * inv * Lx + ny * inv * Ly + inv * Lz), 0, 1);
  }
  return { altitude, slope: slopeN, protrusion: prot, rivers, sediment: sedN, wetness: wet, exposure };
}

function blendPixel(mode, base, c, w) {
  switch (mode) {
    case "multiply":
      return lerp(base, base * c, w);
    case "overlay": {
      const o = base < 0.5 ? 2 * base * c : 1 - 2 * (1 - base) * (1 - c);
      return lerp(base, o, w);
    }
    case "screen":
      return lerp(base, 1 - (1 - base) * (1 - c), w);
    case "add":
      return clamp(base + c * w, 0, 1);
    default:
      return lerp(base, c, w);
  }
}

// Composite one satmap layer into the rgb buffer (Float32Array N*N*3, mutated).
export function applySatmapLayer(rgb, layer, { N, maps, c, weight, opacity }) {
  const p = { ...defaultsFor(SATMAP_TYPE), ...layer.params };
  let scalar;
  if (p.source === "generator") {
    scalar = runGenerator(p.generator, c, { frequency: p.genFrequency, octaves: p.genOctaves, seed: p.seed + 211, amplitude: 1, base: 0 });
  } else {
    scalar = maps[p.channel] || maps.altitude;
  }
  const breakup = p.breakup > 0 ? breakupNoise(c, p.breakupScale, p.seed + 307) : null;
  const lut = paletteLut(p.palette);
  for (let i = 0; i < N * N; i++) {
    let s = scalar[i];
    if (breakup) s += (breakup[i] - 0.5) * p.breakup;
    s = clamp((s + p.bias - 0.5) * p.contrast + 0.5, 0, 1);
    const k = Math.round(s * 255) * 3;
    const cr = lut[k];
    const cg = lut[k + 1];
    const cb = lut[k + 2];
    const w = clamp((weight ? weight[i] : 1) * opacity, 0, 1);
    const j = i * 3;
    rgb[j] = blendPixel(p.blend, rgb[j], cr, w);
    rgb[j + 1] = blendPixel(p.blend, rgb[j + 1], cg, w);
    rgb[j + 2] = blendPixel(p.blend, rgb[j + 2], cb, w);
  }
}

function defaultsFor(def) {
  const out = {};
  for (const p of def.params) out[p.key] = p.def;
  return out;
}

export const BASE_SATMAP = [0.48, 0.45, 0.41];
