export const PALETTES = {
  magnitude: [
    [0.0, '#08123b'], [0.18, '#174eb6'], [0.40, '#00b9d4'],
    [0.62, '#45eb83'], [0.82, '#ffe45c'], [1.0, '#ff7226'],
  ],
  scalar: [
    [0.0, '#204fc7'], [0.25, '#4e95d4'], [0.5, '#28474b'],
    [0.75, '#d28b55'], [1.0, '#e85a3c'],
  ],
  vorticity: [
    [0.0, '#10143a'], [0.28, '#5531a8'], [0.58, '#d43f91'],
    [0.82, '#ffb35c'], [1.0, '#f7f0c8'],
  ],
  divergence: [
    [0.0, '#14b7a0'], [0.28, '#174a5f'], [0.5, '#0c1823'],
    [0.74, '#6d3b70'], [1.0, '#f27aa2'],
  ],
  elevation: [
    [0.0, '#071b17'], [0.24, '#0d4a35'], [0.5, '#3a7c45'],
    [0.72, '#a9b96a'], [0.88, '#e5d2a0'], [1.0, '#f8f3df'],
  ],
  rainfall: [
    [0.0, '#071a2c'], [0.28, '#1260a0'], [0.58, '#31b8d6'],
    [0.82, '#a6e7e5'], [1.0, '#f2fbff'],
  ],
  vegetation: [
    [0.0, '#102019'], [0.28, '#1c4a28'], [0.58, '#4d8a3a'],
    [0.82, '#a7d86a'], [1.0, '#e5f5a8'],
  ],
};

export const SCALAR_CHANNELS = [
  { id: 'magnitude', label: 'Velocity', unit: 'm/s', description: 'Vector magnitude' },
  { id: 'scalar', label: 'Pressure', unit: 'norm.', description: 'Scalar potential' },
  { id: 'vorticity', label: 'Vorticity', unit: 's⁻¹', description: 'Local curl' },
  { id: 'divergence', label: 'Divergence', unit: 's⁻¹', description: 'Local flux' },
  { id: 'elevation', label: 'Elevation', unit: 'm', description: 'Surface height' },
  { id: 'rainfall', label: 'Rainfall', unit: 'norm.', description: 'Accumulation' },
  { id: 'vegetation', label: 'Vegetation', unit: 'norm.', description: 'Cover density' },
];

export const SCALAR_INDEX = Object.fromEntries(
  SCALAR_CHANNELS.map((channel, index) => [channel.id, index]),
);

export function clamp01(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToCss([r, g, b], alpha = 1) {
  return alpha === 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`;
}

export function colorAt(paletteId, t) {
  const stops = PALETTES[paletteId] || PALETTES.magnitude;
  const value = clamp01(t);
  let upper = stops.findIndex(([position]) => position >= value);
  if (upper < 0) upper = stops.length - 1;
  if (upper === 0) return hexToRgb(stops[0][1]);
  const [p0, c0] = stops[upper - 1];
  const [p1, c1] = stops[upper];
  const a = hexToRgb(c0);
  const b = hexToRgb(c1);
  const f = (value - p0) / Math.max(p1 - p0, 1e-6);
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * f));
}

export function colorCss(paletteId, t, alpha = 1) {
  return rgbToCss(colorAt(paletteId, t), alpha);
}

export function gradientCss(paletteId, direction = 'to top') {
  const stops = PALETTES[paletteId] || PALETTES.magnitude;
  return `linear-gradient(${direction}, ${stops.map(([p, c]) => `${c} ${(p * 100).toFixed(1)}%`).join(', ')})`;
}

function glslVec3(hex) {
  return `vec3(${[0, 2, 4].map((i) => (parseInt(hex.slice(1 + i, 3 + i), 16) / 255).toFixed(5)).join(',')})`;
}

function glslRamp(stops) {
  const lines = [];
  for (let i = 1; i < stops.length; i += 1) {
    const [p0, c0] = stops[i - 1];
    const [p1, c1] = stops[i];
    lines.push(`  if (t <= ${p1.toFixed(4)}) return mix(${glslVec3(c0)}, ${glslVec3(c1)}, clamp((t - ${p0.toFixed(4)}) / ${Math.max(p1 - p0, 1e-6).toFixed(6)}, 0.0, 1.0));`);
  }
  lines.push(`  return ${glslVec3(stops.at(-1)[1])};`);
  return lines.join('\n');
}

export const PALETTE_GLSL = `
vec3 paletteMagnitude(float t) {
${glslRamp(PALETTES.magnitude)}
}
vec3 paletteScalar(float t) {
${glslRamp(PALETTES.scalar)}
}
vec3 paletteVorticity(float t) {
${glslRamp(PALETTES.vorticity)}
}
vec3 paletteDivergence(float t) {
${glslRamp(PALETTES.divergence)}
}
vec3 paletteElevation(float t) {
${glslRamp(PALETTES.elevation)}
}
vec3 paletteRainfall(float t) {
${glslRamp(PALETTES.rainfall)}
}
vec3 paletteVegetation(float t) {
${glslRamp(PALETTES.vegetation)}
}
vec3 paletteColor(int channel, float t) {
  t = clamp(t, 0.0, 1.0);
  if (channel == 1) return paletteScalar(t);
  if (channel == 2) return paletteVorticity(t);
  if (channel == 3) return paletteDivergence(t);
  if (channel == 4) return paletteElevation(t);
  if (channel == 5) return paletteRainfall(t);
  if (channel == 6) return paletteVegetation(t);
  return paletteMagnitude(t);
}
`;
