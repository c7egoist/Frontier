// Landform generator catalogue. Each generator displaces terrain height and
// is masked by the layer's 2D region + an "influence" falloff, so relief is
// FLAT at sea level at the region edge (no "heels") and rises inside.

export const LANDFORM_TYPES = {
  fractal: {
    label: 'Fractal FBM', color: '#4ade80',
    params: { amplitude: 40, scale: 0.004, octaves: 5, influence: 1.0 },
  },
  multifractal: {
    label: 'Multifractal', color: '#5ac8fa',
    params: { amplitude: 55, scale: 0.006, octaves: 5, gain: 2.0, influence: 1.0 },
  },
  ridged: {
    label: 'Ridged Multifractal', color: '#c792ea',
    params: { amplitude: 70, scale: 0.005, octaves: 5, sharpness: 2.0, influence: 1.0 },
  },
  badlands: {
    label: 'Badlands', color: '#f78c6c',
    params: { amplitude: 35, scale: 0.012, octaves: 4, talus: 0.6, influence: 1.0 },
  },
  craters: {
    label: 'Craters', color: '#ffcb6b',
    params: { count: 24, radius: 30, depth: 12, rim: 6, seed: 7, influence: 1.0 },
  },
  ridges: {
    label: 'Ridge Noise', color: '#82aaff',
    params: { amplitude: 45, scale: 0.003, octaves: 4, angle: 0.0, influence: 1.0 },
  },
  dunes: {
    label: 'Sand Dunes', color: '#eccd8d',
    params: { amplitude: 12, wavelength: 90, windAngle: 0.6, sharpness: 1.5, influence: 1.0 },
  },
};

export const LANDFORM_ORDER = ['fractal', 'multifractal', 'ridged', 'badlands', 'craters', 'ridges', 'dunes'];

export function createLandform(type, overrides = {}) {
  const spec = LANDFORM_TYPES[type];
  if (!spec) throw new Error(`unknown landform ${type}`);
  return { id: `lf-${Math.random().toString(36).slice(2, 9)}`, type, visible: true, params: { ...spec.params, ...overrides } };
}

export function landformParamsSpec(type) {
  const p = LANDFORM_TYPES[type].params;
  const ranges = {
    amplitude: [0, 200, 1], scale: [0.0005, 0.05, 0.0005], octaves: [1, 8, 1],
    gain: [0.5, 4, 0.1], sharpness: [0.5, 4, 0.1], talus: [0, 1, 0.05],
    count: [1, 128, 1], radius: [5, 120, 1], depth: [0, 60, 1], rim: [0, 30, 1],
    seed: [0, 999, 1], angle: [-3.14, 3.14, 0.05], wavelength: [10, 400, 1],
    windAngle: [-3.14, 3.14, 0.05], influence: [0, 1, 0.05],
  };
  return Object.keys(p).map((k) => ({ key: k, label: k, ...(ranges[k] || [0, 1, 0.01]) }));
}
