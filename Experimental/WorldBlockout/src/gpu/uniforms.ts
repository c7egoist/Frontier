// CPU-side uniform layouts. These mirror the WGSL structs byte for byte; tests/uniforms.ts
// parses the shaders with wgsl_reflect and asserts every offset and total size.
//
// Keep this file as the single place where uniform offsets are written by hand.

export const FRAME_FLOATS = 76; // 2 mat4 + 11 vec4 = 304 B

/** Frame uniform: floats, indexed by FRAME_* offsets below. */
export const F = {
  viewProj: 0,
  invViewProj: 16,
  eye: 32,          // xyz eye, w time
  forward: 36,      // xyz forward, w simRadius
  sunDir: 40,       // xyz toSun, w intensity
  sunColor: 44,
  sky: 48,          // x exposure, y fogDensity, z cloudCover
  sim: 52,          // x simExtent, y simSpacing, z simCellMetres, w waterLevel
  screen: 56,       // xy pixels, zw inverse
  misc: 60,         // x flatDistance, y horizonDistance, z fovY, w cameraHeight
  wind: 64,         // xy direction, z windSpeed, w choppiness
  cascade: 68,      // xyz tiles, w abyssDepth
  world: 72,        // x worldSize, y halfWorld, z spectrumN, w gridN
} as const;

export interface FrameUniformInput {
  viewProj: Float32Array;
  invViewProj: Float32Array;
  eye: [number, number, number];
  time: number;
  forward: [number, number, number];
  simRadius: number;
  sunDir: [number, number, number];
  sunIntensity: number;
  sunColor: [number, number, number];
  exposure: number;
  fogDensity: number;
  cloudCover: number;
  simExtent: number;
  simSpacing: number;
  simCellMetres: number;
  waterLevel: number;
  screenWidth: number;
  screenHeight: number;
  flatDistance: number;
  horizonDistance: number;
  fovY: number;
  cameraHeight: number;
  windDir: [number, number];
  windSpeed: number;
  choppiness: number;
  cascadeTiles: [number, number, number];
  abyssDepth: number;
  worldSize: number;
  halfWorld: number;
  spectrumN: number;
  gridN: number;
}

export function writeFrame(out: Float32Array, u: FrameUniformInput): Float32Array {
  if (out.length < FRAME_FLOATS) throw new Error(`frame uniform needs ${FRAME_FLOATS} floats, got ${out.length}`);
  out.set(u.viewProj, F.viewProj);
  out.set(u.invViewProj, F.invViewProj);
  out.set([u.eye[0], u.eye[1], u.eye[2], u.time], F.eye);
  out.set([u.forward[0], u.forward[1], u.forward[2], u.simRadius], F.forward);
  out.set([u.sunDir[0], u.sunDir[1], u.sunDir[2], u.sunIntensity], F.sunDir);
  out.set([u.sunColor[0], u.sunColor[1], u.sunColor[2], 0], F.sunColor);
  out.set([u.exposure, u.fogDensity, u.cloudCover, 0], F.sky);
  out.set([u.simExtent, u.simSpacing, u.simCellMetres, u.waterLevel], F.sim);
  out.set([u.screenWidth, u.screenHeight, 1 / u.screenWidth, 1 / u.screenHeight], F.screen);
  out.set([u.flatDistance, u.horizonDistance, u.fovY, u.cameraHeight], F.misc);
  out.set([u.windDir[0], u.windDir[1], u.windSpeed, u.choppiness], F.wind);
  out.set([u.cascadeTiles[0], u.cascadeTiles[1], u.cascadeTiles[2], u.abyssDepth], F.cascade);
  out.set([u.worldSize, u.halfWorld, u.spectrumN, u.gridN], F.world);
  return out;
}

export const RING_FLOATS = 12; // 48 B: 9 floats + 3 pad floats (16 B binding alignment)

export interface RingUniformInput {
  origin: [number, number];
  spacing: number;
  inner: number;
  outer: number;
  index: number;
  regime: number;
  quads: number;
  amplitude: number;
}

export function writeRing(out: Float32Array, r: RingUniformInput) {
  out[0] = r.origin[0];
  out[1] = r.origin[1];
  out[2] = r.spacing;
  out[3] = r.inner;
  out[4] = r.outer;
  out[5] = r.index;
  out[6] = r.regime;
  out[7] = r.quads;
  out[8] = r.amplitude;
  return out;
}

export const SIM_PARAMS_FLOATS = 12;
export function writeSimParams(out: Float32Array, p: {
  n: number; dt: number; cell: number; gravity: number; drag: number; damping: number;
  waterLevel: number; tau: number; originX: number; originZ: number; tile: number;
}) {
  out[0] = p.n; out[1] = p.dt; out[2] = p.cell; out[3] = p.gravity;
  out[4] = p.drag; out[5] = p.damping; out[6] = p.waterLevel; out[7] = p.tau;
  out[8] = p.originX; out[9] = p.originZ; out[10] = p.tile; out[11] = 0;
  return out;
}

export const SIM_OCEAN_FLOATS = 8;
export function writeOceanSim(out: Float32Array, p: {
  time: number; n: number; choppiness: number; amplitude: number; tile: number;
}) {
  out[0] = p.time; out[1] = p.n; out[2] = p.choppiness; out[3] = p.amplitude;
  out[4] = p.tile; out[5] = 0; out[6] = 0; out[7] = 0;
  return out;
}

export const FFT_PARAMS_FLOATS = 4;
export function writeFftParams(out: Uint32Array, p: { n: number; axis: number; step: number; inv: number }) {
  out[0] = p.n; out[1] = p.axis; out[2] = p.step; out[3] = p.inv;
  return out;
}

export const RESOLVE_FLOATS = 4;
export function writeResolve(out: Float32Array, p: { n: number; tile: number; invScale: number; choppy: number }) {
  out[0] = p.n; out[1] = p.tile; out[2] = p.invScale; out[3] = p.choppy;
  return out;
}

export const TERRAIN_PARAMS_FLOATS = 8;
export function writeTerrainParams(out: Float32Array, p: {
  size: number; worldSize: number; centerX: number; centerZ: number;
  halfExtent: number; detailGain: number; seaLevel: number; gridN: number;
}) {
  out[0] = p.size; out[1] = p.worldSize; out[2] = p.centerX; out[3] = p.centerZ;
  out[4] = p.halfExtent; out[5] = p.detailGain; out[6] = p.seaLevel; out[7] = p.gridN;
  return out;
}

export const MAP_FLOATS = 8;
export function writeMap(out: Float32Array, p: {
  cx: number; cz: number; viewHalf: number; worldHalf: number;
  showRings: number; showCities: number; showCoast: number; simRadius: number;
}) {
  out[0] = p.cx; out[1] = p.cz; out[2] = p.viewHalf; out[3] = p.worldHalf;
  out[4] = p.showRings; out[5] = p.showCities; out[6] = p.showCoast; out[7] = p.simRadius;
  return out;
}

export const HORIZON_FLOATS = 4;
export function writeHorizon(out: Float32Array, p: { inner: number; outer: number; y: number; segments: number }) {
  out[0] = p.inner; out[1] = p.outer; out[2] = p.y; out[3] = p.segments;
  return out;
}

export const SLICE_FLOATS = 8;
export function writeSlice(out: Float32Array, p: {
  axisX: number; fixed: number; halfLen: number; heightScale: number; lineWidth: number;
}) {
  out[0] = p.axisX; out[1] = p.fixed; out[2] = p.halfLen; out[3] = p.heightScale;
  out[4] = p.lineWidth; out[5] = 0; out[6] = 0; out[7] = 0;
  return out;
}

/** Spec shape per uniform, consumed by tests/uniforms.ts. */
export const UNIFORM_SPECS = {
  Frame: { floats: FRAME_FLOATS, fields: [
    ['viewProj', F.viewProj, 16], ['invViewProj', F.invViewProj, 16],
    ['eye', F.eye, 4], ['forward', F.forward, 4], ['sunDir', F.sunDir, 4], ['sunColor', F.sunColor, 4],
    ['sky', F.sky, 4], ['sim', F.sim, 4], ['screen', F.screen, 4], ['misc', F.misc, 4],
    ['wind', F.wind, 4], ['cascade', F.cascade, 4], ['world', F.world, 4],
  ] },
  RingData: { floats: 12, fields: [['origin', 0, 2], ['spacing', 2, 1], ['inner', 3, 1], ['outer', 4, 1],
    ['index', 5, 1], ['regime', 6, 1], ['quads', 7, 1], ['amplitude', 8, 1]] },
  OceanSim: { floats: 8, fields: [['time', 0, 1], ['spectrumN', 1, 1], ['choppiness', 2, 1], ['amplitude', 3, 1], ['tile', 4, 1]] },
  FFTParams: { floats: 4, fields: [['n', 0, 1], ['axis', 1, 1], ['step', 2, 1], ['inv', 3, 1]] },
  ResolveParams: { floats: 4, fields: [['n', 0, 1], ['tile', 1, 1], ['invScale', 2, 1], ['choppy', 3, 1]] },
  SimParams: { floats: 12, fields: [['n', 0, 1], ['dt', 1, 1], ['cell', 2, 1], ['gravity', 3, 1], ['drag', 4, 1], ['damping', 5, 1], ['waterLevel', 6, 1], ['tau', 7, 1], ['originX', 8, 1], ['originZ', 9, 1], ['tile', 10, 1]] },
} as const;
