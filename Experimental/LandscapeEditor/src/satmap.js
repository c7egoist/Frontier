// Satmaps: colour maps built from the terrain diagnostics (height, slope, protrusions, drainage,
// sediment, erosion). The satellite composite is deliberately stylised rather than photographic:
// the "Stylise" control pushes it toward a poster-like palette, and "Hillshade" controls relief lighting.

export const SATMAP_MODES = [
  { id: 'composite', label: 'Satellite (stylised)', hint: 'Rock, soil, vegetation, sand, snow and rivers, read from the terrain.' },
  { id: 'rivers', label: 'Rivers & drainage', hint: 'Drainage network from routed flow accumulation.' },
  { id: 'sediment', label: 'Sedimentation', hint: 'Where erosion parked its load: alluvial fans, floodplains, lee dunes.' },
  { id: 'protrusions', label: 'Protrusions', hint: 'Convex ridges warm, concave hollows cool (surface curvature).' },
  { id: 'elevation', label: 'Elevation', hint: 'Hypsometric tint from sea level to the highest point.' },
  { id: 'slope', label: 'Slope', hint: 'Steepness in degrees: cliffs and talus show red.' },
  { id: 'erosion', label: 'Erosion intensity', hint: 'Material removed by the erosion layers.' },
  { id: 'wetness', label: 'Wetness', hint: 'Drainage over gradient, a proxy for moisture and vegetation.' },
];

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [0, 2, 4].map((o) => parseInt(v.slice(o, o + 2), 16) / 255);
}

const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-9));
  return t * t * (3 - 2 * t);
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lum = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

function percentile(arr, p) {
  const step = Math.max(1, Math.floor(arr.length / 20000));
  const sample = [];
  for (let i = 0; i < arr.length; i += step) sample.push(Math.abs(arr[i]));
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(p * (sample.length - 1)))] || 1e-6;
}

// Ramp through a list of [t, [r,g,b]] stops.
function ramp(stops, t) {
  t = clamp(t);
  for (let k = 1; k < stops.length; k++) {
    if (t <= stops[k][0]) {
      const [t0, c0] = stops[k - 1];
      const [t1, c1] = stops[k];
      return mix3(c0, c1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return stops[stops.length - 1][1];
}

export function hillshade(result, azimuthDeg = 315, altitudeDeg = 42) {
  const { n, cs, height } = result;
  const out = new Float32Array(n * n);
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < n - 1 ? x + 1 : x;
      const ym = y > 0 ? y - 1 : y;
      const yp = y < n - 1 ? y + 1 : y;
      const dzdx = (height[y * n + xp] - height[y * n + xm]) / ((xp - xm || 1) * cs);
      const dzdy = (height[yp * n + x] - height[ym * n + x]) / ((yp - ym || 1) * cs);
      const slope = Math.atan(Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const s = Math.sin(alt) * Math.cos(slope) + Math.cos(alt) * Math.sin(slope) * Math.cos(az - aspect);
      out[y * n + x] = clamp(s);
    }
  }
  return out;
}

const SATELLITE = {
  rock: [0.42, 0.40, 0.38],
  soil: [0.42, 0.36, 0.26],
  veg: [0.32, 0.45, 0.24],
  sand: [0.84, 0.72, 0.52],
  snow: [0.96, 0.97, 0.98],
  water: [0.16, 0.36, 0.48],
};

// Builds an RGBA buffer (width = height = n) for the chosen satmap mode.
export function renderSatmap(result, opts) {
  const { mode = 'composite', palette = {}, stylise = 0.35, hillshadeAmount = 0.55, snowLine = 9999 } = opts;
  const { n, height, slope, curvature, flow, erosion, deposit, seaLevel, cs } = result;
  const shade = hillshade(result);
  const out = new Uint8ClampedArray(n * n * 4);
  const pal = {
    rock: palette.rock ? hexToRgb(palette.rock) : SATELLITE.rock,
    soil: palette.soil ? hexToRgb(palette.soil) : SATELLITE.soil,
    veg: palette.veg ? hexToRgb(palette.veg) : SATELLITE.veg,
    sand: palette.sand ? hexToRgb(palette.sand) : SATELLITE.sand,
    snow: palette.snow ? hexToRgb(palette.snow) : SATELLITE.snow,
    water: palette.water ? hexToRgb(palette.water) : SATELLITE.water,
  };
  const curvNorm = percentile(curvature, 0.95);
  const depNorm = percentile(deposit, 0.98) || 1e-6;
  const eroNorm = percentile(erosion, 0.98) || 1e-6;
  let logMax = 0;
  for (let i = 0; i < flow.length; i++) if (flow[i] > logMax) logMax = flow[i];
  const logFlow = Math.log(logMax + 1);
  const flowLog = Float32Array.from(flow, (v) => Math.log(v + 1) / logFlow);
  const riverThr = (() => {
    const s = Array.from(flowLog).sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.985)] || 0.5;
  })();
  const maxH = Math.max(seaLevel + 1, percentile(height, 1) || 1);

  for (let i = 0; i < n * n; i++) {
    const h = height[i];
    const s = slope[i];
    const c = clamp(curvature[i] / curvNorm, -1, 1);
    const wet = flowLog[i];
    let rgb;
    let hs = shade[i];

    if (mode === 'composite') {
      const water = h < seaLevel;
      const rock = Math.max(sstep(22, 42, s), sstep(0.35, 1, c) * 0.6);
      const snow = sstep(snowLine - 120, snowLine + 120, h) * (1 - sstep(35, 55, s) * 0.7);
      const veg = sstep(0.42, 0.72, wet + 0.25 * sstep(maxH * 0.1, 0, h)) * (1 - sstep(16, 30, s)) * (1 - rock);
      const sand = clamp(deposit[i] / depNorm) * (1 - rock) * (1 - veg);
      let col = pal.soil;
      col = mix3(col, pal.veg, veg);
      col = mix3(col, pal.rock, rock);
      col = mix3(col, pal.sand, clamp(sand * 1.3));
      col = mix3(col, pal.snow, snow);
      if (water) col = pal.water;
      // Rivers cut the surface where drainage is concentrated.
      const river = sstep(riverThr * 0.92, Math.min(1, riverThr * 1.05 + 0.02), wet);
      col = mix3(col, pal.water, river * 0.9);
      // Stylise: push saturation and contrast toward a poster-like read without leaving the palette.
      const l = lum(col);
      const boosted = [0, 1, 2].map((k) => clamp(l + (col[k] - l) * (1 + stylise * 0.6)));
      const posterised = boosted.map((v) => clamp((v - 0.5) * (1 + stylise * 0.25) + 0.5));
      rgb = mix3(col, posterised, stylise);
    } else if (mode === 'rivers') {
      const rv = sstep(riverThr * 0.5, 1, wet);
      rgb = mix3([0.55, 0.55, 0.55], [0.02, 0.09, 0.22], rv);
      rgb = mix3(rgb, [0.45, 0.85, 0.95], sstep(riverThr, 1, wet) * 0.8);
      if (h < seaLevel) rgb = pal.water;
    } else if (mode === 'sediment') {
      const d = clamp(deposit[i] / depNorm);
      rgb = ramp([[0, [0.22, 0.22, 0.24]], [0.4, [0.55, 0.45, 0.28]], [1, [0.98, 0.84, 0.46]]], Math.sqrt(d));
    } else if (mode === 'protrusions') {
      rgb = ramp([[0, [0.12, 0.25, 0.55]], [0.5, [0.55, 0.55, 0.55]], [1, [0.98, 0.72, 0.32]]], (c + 1) / 2);
      hs = 0.5 + 0.5 * hs;
    } else if (mode === 'elevation') {
      rgb = h < seaLevel
        ? ramp([[0, [0.04, 0.12, 0.25]], [1, [0.2, 0.42, 0.55]]], clamp((h - seaLevel + 800) / 800))
        : ramp([[0, [0.22, 0.42, 0.26]], [0.25, [0.5, 0.56, 0.32]], [0.55, [0.55, 0.42, 0.3]], [0.8, [0.6, 0.58, 0.55]], [1, [0.96, 0.97, 0.98]]], clamp((h - seaLevel) / (maxH - seaLevel || 1)));
    } else if (mode === 'slope') {
      rgb = ramp([[0, [0.2, 0.45, 0.25]], [0.35, [0.82, 0.8, 0.35]], [0.7, [0.85, 0.42, 0.2]], [1, [0.7, 0.12, 0.12]]], s / 60);
    } else if (mode === 'erosion') {
      const e = clamp(erosion[i] / eroNorm);
      rgb = mix3([0.18, 0.18, 0.2], ramp([[0, [0.18, 0.1, 0.3]], [0.5, [0.8, 0.3, 0.4]], [1, [1, 0.9, 0.5]]], Math.sqrt(e)), Math.min(1, e * 1.4 + 0.1));
    } else {
      // Wetness: dry tan to saturated navy.
      rgb = ramp([[0, [0.7, 0.6, 0.45]], [0.5, [0.35, 0.6, 0.6]], [1, [0.08, 0.18, 0.4]]], wet);
    }

    // Relief lighting: multiply the colour by the hillshade, scaled by the user's amount.
    const light = 1 - hillshadeAmount + hillshadeAmount * (0.35 + 0.95 * hs);
    const o = i * 4;
    out[o] = clamp(rgb[0] * light) * 255;
    out[o + 1] = clamp(rgb[1] * light) * 255;
    out[o + 2] = clamp(rgb[2] * light) * 255;
    out[o + 3] = 255;
  }
  return out;
}

// Normalised 0..1 legend stops for the current mode, drawn under the viewport.
export function legendFor(mode, result) {
  const labels = {
    composite: ['Lowland', 'Rock & soil', 'Snow'],
    rivers: ['Dry', 'Channel', 'Main river'],
    sediment: ['Bare', 'Deposited'],
    protrusions: ['Hollow', 'Flat', 'Protrusion'],
    elevation: ['Sea level', 'Highest point'],
    slope: ['0°', '30°', '60°'],
    erosion: ['None', 'Heavy'],
    wetness: ['Dry', 'Wet'],
  };
  return labels[mode] || [];
}
