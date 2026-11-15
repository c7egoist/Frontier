// BrushDynamics.js — verbatim extract of TextureStudio Engine/TexturePaintEngine.js (lines 69–336): stroke curves, HSL
// shifting, colour / opacity dynamics modes, gradient presets and resolveDabVariation.  Copied unchanged so the Brush
// Studio's colour / opacity dynamics and curves resolve exactly as the texture painter does.  The rest of that file
// (three.js meshes, UV painting, compositing) is deliberately not copied — the studio's Drawing Pad has its own 2D engine.
// Source: unassignedinbox/Frontier · arena/6eeea758-frontier · Experimental/TextureStudio/Engine/TexturePaintEngine.js

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function hexToRgb01(hex) {
  const m = /^#?([a-f\d]{6})$/i.exec(String(hex || "#e8c27a"));
  if (!m) return [0.91, 0.76, 0.48];
  return [
    parseInt(m[1].slice(0, 2), 16) / 255,
    parseInt(m[1].slice(2, 4), 16) / 255,
    parseInt(m[1].slice(4, 6), 16) / 255,
  ];
}

function rgb01ToHex(r, g, b) {
  const toH = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, "0");
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

export const CURVE_PRESETS = {
  linear: [[0, 0], [1, 1]],
  flat: [[0, 1], [1, 1]],
  ease: [[0, 0], [0.35, 0.14], [0.7, 0.82], [1, 1]],
  punch: [[0, 0], [0.22, 0.72], [0.62, 0.94], [1, 1]],
  scurve: [[0, 0], [0.28, 0.08], [0.72, 0.92], [1, 1]],
  bell: [[0, 0], [0.22, 0.86], [0.5, 1], [0.78, 0.86], [1, 0]],
  inverse: [[0, 1], [1, 0]],
};

export function sampleCurve(points, t) {
  const x = clamp(t, 0, 1);
  if (!Array.isArray(points) || points.length === 0) return x;
  if (points.length === 1) return clamp(points[0][1], 0, 1);
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= pts[0][0]) return clamp(pts[0][1], 0, 1);
  if (x >= pts[pts.length - 1][0]) return clamp(pts[pts.length - 1][1], 0, 1);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) {
      const span = Math.max(1e-5, x1 - x0);
      const u = (x - x0) / span;
      // Smooth Catmull-Rom tangent estimate for responsive spline shape
      const pPrev = pts[Math.max(0, i - 1)];
      const pNext = pts[Math.min(pts.length - 1, i + 2)];
      const m0 = ((y1 - pPrev[1]) / Math.max(1e-4, x1 - pPrev[0])) * span * 0.5;
      const m1 = ((pNext[1] - y0) / Math.max(1e-4, pNext[0] - x0)) * span * 0.5;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      return clamp(h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1, 0, 1);
    }
  }
  return clamp(pts[pts.length - 1][1], 0, 1);
}

export function sampleCurveLut(points, count = 17) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = sampleCurve(points, count <= 1 ? 1 : i / (count - 1));
  }
  return out;
}

export function getToolChannels(brush, toolOverride = null) {
  const t = toolOverride || brush?.tool || "paint";
  if (t === "erase") return brush?.eraseChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
  if (t === "gradient") return brush?.gradientChannels || brush?.fillChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
  if (t === "fill") return brush?.fillChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
  if (t === "text") return brush?.textChannels || brush?.paintChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
  return brush?.paintChannels || brush?.channels || { albedo: true, roughness: true, metalness: true, height: true };
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) * 0.5;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  const hue = ((h % 1) + 1) % 1;
  if (s <= 1e-4) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const tc = (t) => {
    const x = ((t % 1) + 1) % 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 0.5) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [tc(hue + 1 / 3), tc(hue), tc(hue - 1 / 3)];
}

export function shiftHslHex(hex, hDelta = 0, sDelta = 0, lDelta = 0) {
  const [r, g, b] = hexToRgb01(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(h + hDelta, clamp(s + sDelta, 0, 1), clamp(l + lDelta, 0, 1));
  return rgb01ToHex(nr, ng, nb);
}

function prngHash(seed, salt = 0) {
  let x = (Math.imul(Math.floor(seed) | 0, 374761393) + Math.imul(salt | 0, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

export const COLOUR_DYNAMIC_MODES = [
  { id: "solid", label: "Solid + H/S/V Jitter", sub: "Base ink with HSL jitter & hue curve", dot: "#9ea2aa" },
  { id: "stroke-gradient", label: "Stroke Gradient", sub: "Smooth multi-stop colour ramp along stroke", dot: "#9ea2aa" },
  { id: "multicolour", label: "Multicolour Scatter", sub: "Random swatch selection per dab", dot: "#9ea2aa" },
  { id: "multicolour-cycle", label: "Multicolour Cycle", sub: "Sequential palette stepping along stroke", dot: "#9ea2aa" },
  { id: "temperature", label: "Warm ↔ Cool Split", sub: "Alternating painterly temperature contrast", dot: "#9ea2aa" },
  { id: "rainbow", label: "Spectrum Sweep", sub: "Full 360° chromatic rotation per stroke", dot: "#9ea2aa" },
  { id: "velocity", label: "Speed & Velocity Shift", sub: "Hue & saturation react to stroke speed", dot: "#9ea2aa" },
];

export const OPACITY_DYNAMIC_MODES = [
  { id: "constant", label: "Constant + Jitter", sub: "Steady stroke with per-dab opacity jitter", dot: "#9ea2aa" },
  { id: "fade-out", label: "Fade Out Tail", sub: "Tapers smoothly toward stroke end", dot: "#9ea2aa" },
  { id: "fade-in", label: "Fade In Entry", sub: "Soft entry ramping up along stroke", dot: "#9ea2aa" },
  { id: "bell", label: "Soft Entry & Exit", sub: "Tapered both ends of stroke", dot: "#9ea2aa" },
  { id: "pulse", label: "Opacity Pulse Wave", sub: "Rhythmic opacity wave along path", dot: "#9ea2aa" },
  { id: "velocity", label: "Speed Reactive Opacity", sub: "Stroke velocity modulates dab opacity", dot: "#9ea2aa" },
  { id: "curve", label: "Opacity Curve Driven", sub: "Uses Opacity Over Stroke spline", dot: "#9ea2aa" },
];

export const COLOUR_GRADIENT_PRESETS = [
  { id: "ember", label: "Ember Glow", sub: "Hot coral to golden cream", stops: ["#ff3d2e", "#ff9d3b", "#ffe38e"] },
  { id: "oceanic", label: "Oceanic Mint", sub: "Deep cobalt to seafoam", stops: ["#0d4f8b", "#2fe6a7", "#c4fff0"] },
  { id: "iridescent", label: "Iridescent Oil", sub: "Violet, mint, coral & amber", stops: ["#7b2cbf", "#2fe6a7", "#ff6d6d", "#ffd166"] },
  { id: "sunset", label: "Sunset Neon", sub: "Magenta into luminous gold", stops: ["#ff2a85", "#ff8c42", "#ffe66d"] },
  { id: "bronze", label: "Oxidized Bronze", sub: "Verdigris patina to warm copper", stops: ["#2d5a4c", "#5ca4a9", "#d49b54"] },
  { id: "terracotta", label: "Earth & Indigo", sub: "Terracotta ochre, indigo & ivory", stops: ["#8f321e", "#e8a838", "#234a6b", "#f4ecd8"] },
  { id: "aurora", label: "Arctic Aurora", sub: "Midnight blue through cyan & lime", stops: ["#1e2a78", "#38b6ff", "#2fe6a7", "#f2ff9f"] },
  { id: "magma", label: "Volcanic Magma", sub: "Charcoal ember to white-hot gold", stops: ["#2a0a0d", "#a61c1c", "#ff6d28", "#fff08a"] },
  { id: "patina", label: "Gold Foil Patina", sub: "Antique brass to mineral jade", stops: ["#78591c", "#e8c27a", "#fff3cb", "#4c7c6f"] },
  { id: "cyber", label: "Cyber Berry", sub: "Neon magenta, violet & emerald", stops: ["#ff4ecd", "#7f5af0", "#2cb67d"] },
];

export function sampleHexGradient(stops, u = 0) {
  const list = Array.isArray(stops) && stops.length ? stops : ["#e8c27a", "#2fe6a7"];
  if (list.length === 1) return list[0];
  const t = clamp(u, 0, 1) * (list.length - 1);
  const idx = Math.min(list.length - 2, Math.floor(t));
  const f = t - idx;
  const [r0, g0, b0] = hexToRgb01(list[idx]);
  const [r1, g1, b1] = hexToRgb01(list[idx + 1]);
  return rgb01ToHex(r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f);
}

/**
 * Resolve per-dab brush geometry, Colour Dynamics (Stroke Gradients, Multicolour, Temperature,
 * Rainbow, Velocity), Opacity Dynamics (Fade, Pulse, Velocity, Opacity Jitter) & Stroke Curves.
 */
export function resolveDabVariation(brush, strokeT = 0, seed = 1, followAngleDeg = null, strokeMeta = {}) {
  const j = brush.jitter || {};
  const cd = brush.colourDynamics || {};
  const curves = brush.curves || {};

  const t = clamp(strokeT, 0, 1);
  const dabIdx = Math.max(0, Number(strokeMeta.dabIndex ?? Math.round(t * 48)));
  const speed = clamp(Number(strokeMeta.speed ?? 0.35), 0, 1);
  const gradLen = Math.max(4, Number(cd.gradientLength ?? 36));
  const wrap = cd.gradientWrap || "pingpong";

  let uWrap = clamp(dabIdx / gradLen, 0, 1);
  if (wrap === "loop") uWrap = (dabIdx % gradLen) / gradLen;
  else if (wrap === "pingpong") {
    const cy = (dabIdx / gradLen) % 2;
    uWrap = cy <= 1 ? cy : 2 - cy;
  }

  const sizeCurve = curves.sizeOverStroke ? sampleCurve(curves.sizeOverStroke, t) : 1;
  const flowCurve = curves.opacityOverStroke ? sampleCurve(curves.opacityOverStroke, t) : 1;
  const hueCurveVal = curves.hueOverStroke ? sampleCurve(curves.hueOverStroke, t) : 0.5;

  const rSize = prngHash(seed, 1) * 2 - 1;
  const rAngle = prngHash(seed, 2) * 2 - 1;
  const rScatA = prngHash(seed, 3) * Math.PI * 2;
  const rScatR = Math.sqrt(prngHash(seed, 4));
  const rFlow = prngHash(seed, 5);
  const rHue = prngHash(seed, 6) * 2 - 1;
  const rSat = prngHash(seed, 7) * 2 - 1;
  const rVal = prngHash(seed, 8) * 2 - 1;
  const rPal = prngHash(seed, 9);
  const rOp = prngHash(seed, 10);

  const sizeScale = clamp(sizeCurve * (1 + rSize * (j.size || 0) * 0.75), 0.12, 2.4);

  // Opacity Dynamics (changing opacity along stroke / pulse / velocity / jitter)
  const opMode = cd.opacityMode || "constant";
  const opMin = clamp(cd.opacityMin ?? 0.18, 0.02, 1.0);
  let opMod = 1.0;
  if (opMode === "fade-out") opMod = 1 - (1 - opMin) * clamp(t, 0, 1);
  else if (opMode === "fade-in") opMod = opMin + (1 - opMin) * clamp(t, 0, 1);
  else if (opMode === "bell") opMod = opMin + (1 - opMin) * Math.sin(clamp(t, 0, 1) * Math.PI);
  else if (opMode === "pulse") {
    const freq = clamp(cd.opacityPulseFreq ?? 0.45, 0.08, 2.0);
    opMod = opMin + (1 - opMin) * (0.5 + 0.5 * Math.cos(dabIdx * freq));
  } else if (opMode === "velocity") {
    opMod = 1 - (1 - opMin) * clamp(speed, 0, 1);
  }
  const opJitterMul = 1 - rOp * clamp(cd.opacityJitter || 0, 0, 0.95);
  const flowScale = clamp(flowCurve * opMod * opJitterMul * (1 - rFlow * (j.flow || 0)), 0.02, 1.0);

  const baseAngle = (brush.angle || 0) + (followAngleDeg !== null && brush.followDirection ? followAngleDeg : 0);
  const angle = baseAngle + rAngle * (j.angle || 0);
  const scatterMag = rScatR * (j.scatter || 0);
  const scatterU = Math.cos(rScatA) * scatterMag;
  const scatterV = Math.sin(rScatA) * scatterMag;

  // Functional Base Colour resolution
  const mode = cd.mode || (cd.strokeGradient ? "stroke-gradient" : "solid");
  const stops = Array.isArray(cd.gradientStops) && cd.gradientStops.length >= 2
    ? cd.gradientStops
    : ["#ff3d2e", "#ff9d3b", "#ffe38e"];
  const palette = Array.isArray(cd.paletteColors) && cd.paletteColors.length >= 2
    ? cd.paletteColors
    : ["#ff3d2e", "#2fe6a7", "#63a8ff", "#ffd166"];

  let baseHex = brush.color || "#e8c27a";
  if (mode === "stroke-gradient") {
    baseHex = sampleHexGradient(stops, uWrap);
  } else if (mode === "multicolour") {
    const pIdx = Math.min(palette.length - 1, Math.floor(rPal * palette.length));
    baseHex = palette[pIdx];
  } else if (mode === "multicolour-cycle") {
    const pIdx = dabIdx % palette.length;
    baseHex = palette[pIdx];
  } else if (mode === "rainbow") {
    baseHex = shiftHslHex(baseHex, uWrap, 0.14, 0.02);
  } else if (mode === "temperature") {
    const warm = (dabIdx % 2 === 0 ? 1 : -1) * clamp(cd.temperatureShift ?? 0.35, 0, 1);
    baseHex = shiftHslHex(baseHex, warm * 0.11, warm * 0.15, warm * 0.09);
  } else if (mode === "velocity") {
    baseHex = shiftHslHex(baseHex, (speed - 0.35) * 0.42, (speed - 0.3) * 0.35, (speed - 0.5) * 0.16);
  }

  const hCurveShift = cd.strokeGradient ? (hueCurveVal - 0.5) * 1.0 : 0;
  const hDelta = hCurveShift + rHue * (cd.hueJitter || 0) * 0.5;
  const sDelta = rSat * (cd.satJitter || 0) * 0.75;
  const vDelta = rVal * (cd.valJitter || 0) * 0.65;
  const color = (hDelta !== 0 || sDelta !== 0 || vDelta !== 0)
    ? shiftHslHex(baseHex, hDelta, sDelta, vDelta)
    : baseHex;

  return {
    ...brush,
    color,
    angle,
    flow: clamp((brush.flow ?? 0.78) * flowScale, 0.02, 1.0),
    sizeScale,
    scatterU,
    scatterV,
  };
}
