/**
 * Parameter block + quality model.
 *
 * GLOBALS_SCHEMA is the single source of truth for the uniform buffer that every shader binds at
 * @group(0) @binding(0). The WGSL `struct Globals` is generated from it (see ocean.wgsl), so a
 * field can never drift between CPU and GPU.
 *
 * Quality model: presets give *particle budgets* (the only thing that actually costs GPU time),
 * and the world-space domains are derived from them. A closed-loop controller then ramps the
 * workload up from a deliberately conservative start until the frame budget is full.
 */

import type { FieldSpec } from '@/common/uniform';
import { UniformSchema } from '@/common/uniform';
import type { Capabilities } from '@/core/gpu';

// ---------------------------------------------------------------------------
// Globals: everything every shader can read
// ---------------------------------------------------------------------------

export const GLOBALS_FIELDS: FieldSpec[] = [
  // --- frame -----------------------------------------------------------------
  { name: 'resolution', type: 'vec2f', doc: 'render target size in pixels' },
  { name: 'invResolution', type: 'vec2f' },
  { name: 'time', type: 'f32', doc: 'seconds since start' },
  { name: 'dt', type: 'f32', doc: 'real frame delta (clamped)' },
  { name: 'simDt', type: 'f32', doc: 'particle solver delta used this frame' },
  { name: 'simDtInv', type: 'f32' },
  { name: 'frame', type: 'u32' },
  { name: 'frameParity', type: 'u32' },

  // --- camera / lighting -----------------------------------------------------
  { name: 'cameraPos', type: 'vec3f' },
  { name: 'cameraUnderwater', type: 'u32' },
  { name: 'nearPlane', type: 'f32' },
  { name: 'farPlane', type: 'f32' },
  { name: 'projScaleY', type: 'f32', doc: 'projection y scale = 1/tan(fovY/2); used to size particle splats' },
  { name: 'viewProj', type: 'mat4x4f' },
  { name: 'invViewProj', type: 'mat4x4f' },
  { name: 'view', type: 'mat4x4f' },
  { name: 'invView', type: 'mat4x4f' },
  { name: 'sunDir', type: 'vec3f', doc: 'unit vector pointing *towards* the sun' },
  { name: 'sunIntensity', type: 'f32' },
  { name: 'sunColor', type: 'vec3f' },
  { name: 'exposure', type: 'f32' },
  { name: 'windDir', type: 'vec2f' },
  { name: 'windSpeed', type: 'f32' },
  { name: 'gravity', type: 'f32' },
  { name: 'fogDensity', type: 'f32' },
  { name: 'waterTint', type: 'vec3f', doc: 'per-metre absorption, e.g. (0.35, 0.09, 0.05)' },
  { name: 'foamBrightness', type: 'f32' },

  // --- bathymetry (procedural, shared by solver + renderer) ------------------
  { name: 'bedOrigin', type: 'vec2f', doc: 'world XZ of the bathymetry domain centre' },
  { name: 'bedDepth', type: 'f32', doc: 'open-ocean depth (m, positive down)' },
  { name: 'bedShoalAmp', type: 'f32', doc: 'maximum shoal rise (m); kept under the surface' },
  { name: 'bedShoalScale', type: 'f32', doc: 'shoal feature size (m)' },
  { name: 'bedSeed', type: 'f32' },
  { name: 'bedMinDepth', type: 'f32', doc: 'shallowest water depth over a shoal (m)' },
  { name: 'bedWorldHalf', type: 'f32', doc: 'half extent of the baked bathymetry texture (m)' },
  { name: 'sweInitAmp', type: 'f32', doc: 'amplitude of the analytic seed sea state (m)' },
  { name: 'sweInitWavelength', type: 'f32', doc: 'dominant wavelength of the seed sea state (m)' },

  // --- domain bookkeeping (camera-following lattices) -----------------------
  { name: 'domainOffset', type: 'vec2f', doc: 'world shift applied this frame to camera-following lattices' },

  // --- fine shallow-water particle layer ------------------------------------
  { name: 'sweOrigin', type: 'vec2f', doc: 'min corner of the fine particle lattice (world XZ)' },
  { name: 'sweSize', type: 'vec2f' },
  { name: 'sweDx', type: 'f32', doc: 'lattice spacing (m). base area per particle = dx*dx' },
  { name: 'sweH', type: 'f32', doc: 'SPH kernel radius (m)' },
  { name: 'sweDepth', type: 'f32', doc: 'rest column depth (m)' },
  { name: 'sweViscosity', type: 'f32' },
  { name: 'sweDryDepth', type: 'f32', doc: 'depth below which particles are parked (m)' },
  { name: 'sweBreaking', type: 'f32', doc: 'Froude-like threshold that spawns whitecaps' },
  { name: 'sweCellSize', type: 'f32' },
  { name: 'sweCount', type: 'u32' },
  { name: 'sweGridW', type: 'u32' },
  { name: 'sweGridH', type: 'u32' },
  { name: 'sweSubsteps', type: 'u32' },
  { name: 'sweDamping', type: 'f32' },
  { name: 'sweSponge', type: 'f32', doc: 'width (m) of the absorbing band on the domain edge' },

  // --- coarse shallow-water layer (mid/far field, nested around the fine one) --
  { name: 'cswOrigin', type: 'vec2f', doc: 'min corner of the coarse lattice (world XZ)' },
  { name: 'cswSize', type: 'vec2f' },
  { name: 'cswDx', type: 'f32', doc: 'coarse lattice spacing (m); same solver, bigger cells' },
  { name: 'cswH', type: 'f32' },
  { name: 'cswCellSize', type: 'f32' },
  { name: 'cswCount', type: 'u32' },
  { name: 'cswGridW', type: 'u32' },
  { name: 'cswGridH', type: 'u32' },
  { name: 'cswHz', type: 'f32', doc: 'update rate of the coarse layer (Hz); lower than the fine one' },

  // --- far swell: wave particles --------------------------------------------
  { name: 'waveCount', type: 'u32' },
  { name: 'waveDomain', type: 'f32', doc: 'half-extent of the camera-following swell domain (m)' },
  { name: 'waveAmp', type: 'f32' },
  { name: 'waveAmpVariance', type: 'f32' },
  { name: 'waveAmpMean', type: 'f32' },
  { name: 'waveWavelength', type: 'f32' },
  { name: 'waveSpeedScale', type: 'f32' },
  { name: 'waveSteepness', type: 'f32' },
  { name: 'waveDistScale', type: 'f32', doc: 'extra spread of long waves with distance' },

  // --- near-field MLS-MPM ----------------------------------------------------
  { name: 'mpmOrigin', type: 'vec3f', doc: 'min corner of the near-field grid' },
  { name: 'mpmDx', type: 'f32' },
  { name: 'mpmGrid', type: 'vec3u' },
  { name: 'mpmMaxParticles', type: 'u32' },
  { name: 'mpmParticleRadius', type: 'f32' },
  { name: 'mpmMass', type: 'f32' },
  { name: 'mpmStiffness', type: 'f32', doc: 'Tait equation stiffness k' },
  { name: 'mpmGamma', type: 'f32' },
  { name: 'mpmViscosity', type: 'f32' },
  { name: 'mpmFriction', type: 'f32' },
  { name: 'mpmTileSize', type: 'u32', doc: 'cells per tile edge (tiles are the dispatch unit)' },
  { name: 'mpmTiles', type: 'vec3u', doc: 'tiles per axis' },
  { name: 'mpmActiveTiles', type: 'u32' },
  { name: 'mpmActiveRadius', type: 'f32', doc: 'radius around the camera that is simulated (m)' },
  { name: 'mpmDepth', type: 'f32', doc: 'vertical extent of the near-field box (m)' },
  { name: 'mpmSubsteps', type: 'u32' },
  { name: 'mpmCfl', type: 'f32' },
  { name: 'mpmRestDensity', type: 'f32', doc: 'reference density (kg/m^3), used for EOS + node thresholds' },
  { name: 'mpmAbsorbDepth', type: 'f32', doc: 'depth below the 2D surface at which 3D water is returned to it' },
  { name: 'mpmSpawnRate', type: 'f32', doc: 'per-particle probability per frame of spawning a 3D particle at a breaking crest' },
  { name: 'mpmSpawnBreaking', type: 'f32', doc: 'whitecap metric above which crests feed the 3D layer' },
  { name: 'foamBreakingBias', type: 'f32' },

  // --- foam / spray ----------------------------------------------------------
  { name: 'foamCount', type: 'u32' },
  { name: 'foamLifetime', type: 'f32' },
  { name: 'foamSpawnRate', type: 'f32' },
  { name: 'foamDrag', type: 'f32' },
  { name: 'sprayCount', type: 'u32' },
  { name: 'sprayLifetime', type: 'f32' },
  { name: 'sprayGravity', type: 'f32' },
  { name: 'foamFarOrigin', type: 'vec2f' },
  { name: 'foamFarSize', type: 'vec2f' },

  // --- height / normal maps --------------------------------------------------
  { name: 'nearHeightOrigin', type: 'vec2f' },
  { name: 'nearHeightSize', type: 'vec2f' },
  { name: 'farHeightOrigin', type: 'vec2f' },
  { name: 'farHeightSize', type: 'vec2f' },
  { name: 'nearHeightRes', type: 'vec2u', doc: 'near height field resolution in texels' },
  { name: 'farHeightRes', type: 'vec2u' },
  { name: 'seaLevel', type: 'f32' },
  { name: 'nearHeightUse', type: 'f32', doc: '1 when the near field was updated this frame' },

  // --- ocean rendering -------------------------------------------------------
  { name: 'detailAmp', type: 'f32' },
  { name: 'detailScale', type: 'f32' },
  { name: 'detailSpeed', type: 'f32' },
  { name: 'sssStrength', type: 'f32' },
  { name: 'ssrStrength', type: 'f32' },
  { name: 'foamStrength', type: 'f32' },
  { name: 'shoreFoam', type: 'f32' },
  { name: 'meshMorph', type: 'f32', doc: 'clipmap geomorph amount 0..1 (0 = pure per-level grid)' },
  { name: 'meshLevel0Spacing', type: 'f32' },
  { name: 'meshLevels', type: 'u32' },
  { name: 'meshRes', type: 'u32' },

  // --- screen-space fluid (near-field 3D particles) --------------------------
  { name: 'fluidParticleRadius', type: 'f32' },
  { name: 'fluidFilterRadius', type: 'f32' },
  { name: 'fluidThicknessScale', type: 'f32' },
  { name: 'fluidRefraction', type: 'f32' },
  { name: 'fluidSpecular', type: 'f32' },
  { name: 'fluidAbsorb', type: 'f32' },
  { name: 'fluidFoam', type: 'f32' },
  { name: 'fluidFilterRange', type: 'f32', doc: 'narrow-range filter depth tolerance (m)' },
  { name: 'fluidFoamSpeed', type: 'f32', doc: 'speed (m/s) at which 3D particles start to read as foam' },
  { name: 'fluidScatter', type: 'f32' },
  { name: 'shadowSteps', type: 'u32' },
  { name: 'shadowSoftness', type: 'f32' },
  { name: 'shadowStrength', type: 'f32' },

  // --- forcing / interaction -------------------------------------------------
  { name: 'windStress', type: 'f32', doc: 'wind -> surface stress coefficient (m/s^2 per unit windSpeed^2)' },
  { name: 'pointerPos', type: 'vec2f', doc: 'interaction point in world XZ' },
  { name: 'pointerPrev', type: 'vec2f' },
  { name: 'pointerForce', type: 'f32' },
  { name: 'pointerRadius', type: 'f32' },
  { name: 'pointerActive', type: 'u32' },
  { name: 'pointerMode', type: 'u32', doc: '0 none, 1 push, 2 stir, 3 calm, 4 lift (feeds the MPM layer)' },
  { name: 'maxAccel', type: 'f32', doc: 'safety clamp on particle acceleration (m/s^2)' },
  { name: 'bottomDrag', type: 'f32', doc: 'quadratic bottom friction coefficient' },

  // --- quality / debug -------------------------------------------------------
  { name: 'debugView', type: 'u32', doc: '0 = shaded, 1 = height, 2 = normals, 3 = foam, 4 = velocity, 5 = cells' },
  { name: 'qualityLevel', type: 'u32' },
  { name: 'renderScale', type: 'f32' },
  { name: 'maxNeighbors', type: 'u32', doc: 'hard cap of the SPH inner loop (perf guard)' },
  { name: 'seed', type: 'u32' },
];

export const GLOBALS = new UniformSchema('Globals', GLOBALS_FIELDS);

/** Default values; anything not listed is zero. */
export function defaultParams(): Record<string, number | readonly number[]> {
  return {
    gravity: 9.81,
    seaLevel: 0,
    exposure: 1.0,
    fogDensity: 0.00009,
    foamBrightness: 1.0,
    waterTint: [0.32, 0.07, 0.035],
    sunIntensity: 1.0,
    sunColor: [1.0, 0.96, 0.9],
    sssStrength: 0.55,
    ssrStrength: 0.6,
    foamStrength: 1.0,
    detailAmp: 0.12,
    detailScale: 0.35,
    detailSpeed: 1.0,
    meshMorph: 1,
    maxNeighbors: 64,
    seed: 1337,
    wavesAmp: 1,
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export interface OceanPreset {
  name: string;
  /** particle budgets -- the thing that actually costs time */
  sweParticles: number;
  mpmParticles: number;
  foamParticles: number;
  sprayParticles: number;
  waveParticles: number;
  /** world-space size of each layer */
  sweRadius: number;
  /** nested coarse layer: covers the mid/far field at a much lower update rate */
  coarseSwe: boolean;
  coarseSweParticles: number;
  coarseSweRadius: number;
  coarseSweHz: number;
  mpmRadius: number;
  mpmDepth: number;
  mpmElementsPerParticle: number; // particles per grid cell (MLS-MPM sweet spot ~ 2-4 for liquids)
  waveDomain: number;
  /** rendering */
  renderScale: number;
  nearHeightRes: number;
  farHeightRes: number;
  fluidFilterRadius: number;
  ssr: boolean;
  shadows: boolean;
  shadowSteps: number;
  meshLevels: number;
  meshRes: number;
  underwater: boolean;
  /** simulation rates */
  sweHz: number;
  mpmHz: number;
}

export const PRESETS: Record<string, OceanPreset> = {
  // Integrated GPU / Apple silicon: small but complete, ~720p.
  igpu: {
    name: 'Integrated GPU',
    sweParticles: 65_536,          // 768 m at 3 m spacing
    coarseSwe: true,
    coarseSweParticles: 16_384,    // 4 km at 32 m
    coarseSweRadius: 2048,
    coarseSweHz: 10,
    waveParticles: 8_000,
    mpmParticles: 20_000,
    foamParticles: 8_000,
    sprayParticles: 1_500,
    sweRadius: 384,
    waveDomain: 3000,
    mpmRadius: 6,
    mpmDepth: 3.5,
    mpmElementsPerParticle: 3,
    renderScale: 0.62,
    nearHeightRes: 512,
    farHeightRes: 256,
    fluidFilterRadius: 6,
    ssr: false,
    shadows: false,
    shadowSteps: 24,
    meshLevels: 5,
    meshRes: 96,
    underwater: true,
    sweHz: 60,
    mpmHz: 60,
  },
  // GTX 1060/1650 class: the default target. 1080p60.
  // SWE: 512^2 at 1.5 m (768 m) + 256^2 at 16 m (4 km) + 24k wave packets + 140k MPM particles.
  gtx: {
    name: 'GTX (1080p60)',
    sweParticles: 262_144,
    coarseSwe: true,
    coarseSweParticles: 65_536,
    coarseSweRadius: 2048,
    coarseSweHz: 15,
    waveParticles: 24_000,
    mpmParticles: 140_000,
    foamParticles: 60_000,
    sprayParticles: 10_000,
    sweRadius: 384,
    waveDomain: 6000,
    mpmRadius: 11,
    mpmDepth: 5,
    mpmElementsPerParticle: 3,
    renderScale: 0.85,
    nearHeightRes: 1024,
    farHeightRes: 512,
    fluidFilterRadius: 10,
    ssr: true,
    shadows: true,
    shadowSteps: 32,
    meshLevels: 6,
    meshRes: 128,
    underwater: true,
    sweHz: 60,
    mpmHz: 60,
  },
  // RTX 3060+ class: ~4x the particle work.
  rtx: {
    name: 'RTX (1440p+)',
    sweParticles: 1_048_576,
    coarseSwe: true,
    coarseSweParticles: 262_144,
    coarseSweRadius: 2048,
    coarseSweHz: 30,
    waveParticles: 64_000,
    mpmParticles: 400_000,
    foamParticles: 200_000,
    sprayParticles: 40_000,
    sweRadius: 768,
    waveDomain: 9000,
    mpmRadius: 16,
    mpmDepth: 6,
    mpmElementsPerParticle: 3,
    renderScale: 1,
    nearHeightRes: 1536,
    farHeightRes: 1024,
    fluidFilterRadius: 12,
    ssr: true,
    shadows: true,
    shadowSteps: 40,
    meshLevels: 7,
    meshRes: 160,
    underwater: true,
    sweHz: 60,
    mpmHz: 60,
  },
};

PRESETS.safe = {
  ...PRESETS.igpu!,
  name: 'Safe mode',
  sweParticles: 16_384,
  coarseSwe: false,
  mpmParticles: 4_000,
  foamParticles: 4_000,
  sprayParticles: 500,
  waveParticles: 2_000,
  sweRadius: 192,
  renderScale: 0.5,
  nearHeightRes: 256,
  farHeightRes: 128,
  ssr: false,
  shadows: false,
  meshLevels: 4,
  meshRes: 64,
};

/** Fully derived, GPU-ready description of one simulation frame. */
export interface DerivedConfig {
  preset: OceanPreset;
  swe: { count: number; dx: number; h: number; radius: number; gridW: number; gridH: number; cellSize: number; bytes: number };
  coarse: { count: number; dx: number; h: number; radius: number; gridSize: number; cellSize: number };
  mpm: {
    maxParticles: number;
    dx: number;
    grid: [number, number, number];
    tiles: [number, number, number];
    tileSize: number;
    radius: number;
    depth: number;
    bytes: number;
  };
  bedRes: number;
  nearRes: number;
  farRes: number;
  /** world extent (m) of the near height field: the fine layer's domain plus a small margin */
  nearSize: number;
  /** world extent (m) of the far height field: the packet domain doubled */
  farSize: number;
  foam: { count: number; gridSize: number; cellSize: number };
  spray: { count: number };
  wave: { count: number; domain: number; texelsPerWave: number };
  totalBytes: number;
}

/**
 * Turns budgets + world sizes into concrete lattice spacings and grid dimensions, and clamps
 * everything to what the adapter can actually bind (WebGPU's default per-binding limit is 128 MB,
 * which a 2 M particle layer would blow through).
 */
export function deriveConfig(preset: OceanPreset, caps: Capabilities): DerivedConfig {
  const bytesPerSweParticle = 76; // 2x state (32B) + two index arrays + cell list slack
  const maxBinding = caps.maxStorageBufferBindingSize;
  const limitByBinding = (bytes: number) => Math.max(64, Math.floor((maxBinding * 0.9) / bytes));

  const sweCount = Math.min(preset.sweParticles, limitByBinding(bytesPerSweParticle));
  const sweRadius = preset.sweRadius;
  const sweDx = (2 * sweRadius) / Math.sqrt(sweCount);
  const sweH = sweDx * 2; // kernel radius = 2 lattice spacings: ~12-13 neighbours in 2D
  const sweCellSize = sweH;
  const sweGridW = Math.ceil((2 * sweRadius) / sweCellSize) + 2;
  const sweGridH = sweGridW;

  const coarse = preset.coarseSwe
    ? (() => {
        const count = preset.coarseSweParticles;
        const dx = (2 * preset.coarseSweRadius) / Math.sqrt(count);
        const h = dx * 2.2;
        return { count, dx, h, radius: preset.coarseSweRadius, gridSize: Math.ceil((2 * preset.coarseSweRadius) / h) + 2, cellSize: h };
      })()
    : { count: 0, dx: 1, h: 1, radius: 0, gridSize: 1, cellSize: 1 };

  // MLS-MPM: particle spacing dp = (box volume / count)^(1/3); cell size = dp * ppc^(1/3)
  // so that every cell holds `mpmElementsPerParticle` particles on average.
  const vol = (2 * preset.mpmRadius) ** 2 * preset.mpmDepth;
  const dp = Math.cbrt(vol / Math.max(1, preset.mpmParticles));
  const mpmDxFinal = Math.max(0.06, dp * Math.cbrt(preset.mpmElementsPerParticle));
  const tileSize = 8;
  const grid: [number, number, number] = [
    Math.ceil((2 * preset.mpmRadius) / mpmDxFinal) + 1,
    Math.ceil(preset.mpmDepth / mpmDxFinal) + 1,
    Math.ceil((2 * preset.mpmRadius) / mpmDxFinal) + 1,
  ];
  const tiles: [number, number, number] = [
    Math.ceil(grid[0] / tileSize) + 1,
    Math.ceil(grid[1] / tileSize) + 1,
    Math.ceil(grid[2] / tileSize) + 1,
  ];
  const mpmBytes =
    preset.mpmParticles * 96 + // particle state (2 buffers)
    grid[0] * grid[1] * grid[2] * 32 + // grid: m + mv (+ scratch)
    tiles[0] * tiles[1] * tiles[2] * 64;

  const foamCellSize = sweH;
  const foamGridSize = sweGridW;

  const totalBytes = sweCount * bytesPerSweParticle + coarse.count * 76 + mpmBytes + (preset.foamParticles + preset.sprayParticles) * 48;

  return {
    preset,
    bedRes: 512,
    nearRes: preset.nearHeightRes,
    farRes: preset.farHeightRes,
    nearSize: 2 * sweRadius * 1.06,
    farSize: 2 * preset.waveDomain,
    swe: { count: sweCount, dx: sweDx, h: sweH, radius: sweRadius, gridW: sweGridW, gridH: sweGridH, cellSize: sweCellSize, bytes: sweCount * bytesPerSweParticle },
    coarse,
    mpm: {
      maxParticles: preset.mpmParticles,
      dx: mpmDxFinal,
      grid,
      tiles,
      tileSize,
      radius: preset.mpmRadius,
      depth: preset.mpmDepth,
      bytes: mpmBytes,
    },
    foam: { count: preset.foamParticles, gridSize: foamGridSize, cellSize: foamCellSize },
    spray: { count: preset.sprayParticles },
    wave: { count: preset.waveParticles, domain: preset.waveDomain, texelsPerWave: 0 },
    totalBytes,
  };
}

/**
 * Bathymetry, closed form and *identical* to `bedDepthAt` in common/util.wgsl: a continental shelf
 * ramping to a shoreline at -Z plus one broad shoal, in metres below sea level (positive down).
 *
 * Both sides must agree exactly: the CPU uses this to seed each particle's column volume
 * (V = dx^2 * depth, which makes still water a fixed point of the solver), while the GPU bakes it
 * into the texture the solver reads its bed gradient from.
 */
export function bedDepthAt(x: number, z: number, values: Record<string, number | readonly number[]>): number {
  const half = Math.max(Number(values.bedWorldHalf ?? 8192), 1);
  const ramp = Math.min(1, Math.max(0, (half - Math.abs(z)) / (half * 0.9)));
  const dx = x - -half * 0.82;
  const dz = z - half * 0.35;
  const scale = Math.max(Number(values.bedShoalScale ?? 1400), 1);
  const shoal = Number(values.bedShoalAmp ?? 16) * Math.exp(-(dx * dx + dz * dz) / (scale * scale));
  return Math.max(Number(values.bedMinDepth ?? 4), Math.max(Number(values.bedDepth ?? 30), 0.1) * (0.22 + 0.78 * ramp) - shoal);
}

/**
 * Fills the uniform block from the derived configuration. Anything that describes *geometry*
 * (counts, spacings, grid sizes, world extents) is written here rather than in the presets, so the
 * numbers the shaders use are the same ones the buffers were allocated from -- there is no second
 * source of truth for `sweCount`, `sweDx`, `cswGridW`, the height-field resolutions, and so on.
 */
export function applyConfig(
  values: Record<string, number | readonly number[]>,
  cfg: DerivedConfig,
  preset: OceanPreset,
): void {
  const set = (name: string, value: number | readonly number[]) => {
    values[name] = value;
  };
  const norm = (v: [number, number]): [number, number] => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };

  // --- bathymetry ------------------------------------------------------------------------------
  set('seaLevel', 0);
  set('gravity', 9.81);
  set('bedWorldHalf', 8192);
  set('bedOrigin', [0, 0]);
  set('bedDepth', 30);
  set('bedMinDepth', 4);
  set('bedShoalAmp', 17);
  set('bedShoalScale', 1500);
  set('bedSeed', 1337);

  // --- fine shallow-water layer ----------------------------------------------------------------
  set('sweSize', [2 * cfg.swe.radius, 2 * cfg.swe.radius]);
  set('sweDx', cfg.swe.dx);
  set('sweH', cfg.swe.h);
  set('sweCellSize', cfg.swe.cellSize);
  set('sweCount', cfg.swe.count);
  set('sweGridW', cfg.swe.gridW);
  set('sweGridH', cfg.swe.gridH);
  set('sweSubsteps', 2);
  set('sweDepth', 26);
  set('sweViscosity', 0.045);
  set('sweDamping', 0.015);
  set('sweSponge', Math.max(24, cfg.swe.radius * 0.09));
  set('sweBreaking', 1.2);
  set('sweInitAmp', 0.55);
  set('sweInitWavelength', 95);
  set('maxNeighbors', 64);

  // --- coarse nesting layer --------------------------------------------------------------------
  const cr = cfg.coarse;
  set('cswSize', [Math.max(2 * cr.radius, 1), Math.max(2 * cr.radius, 1)]);
  set('cswDx', Math.max(cr.dx, 1e-3));
  set('cswH', Math.max(cr.h, 1e-3));
  set('cswCellSize', Math.max(cr.cellSize, 1e-3));
  set('cswCount', cr.count);
  set('cswGridW', Math.max(cr.gridSize, 1));
  set('cswGridH', Math.max(cr.gridSize, 1));
  set('cswHz', preset.coarseSweHz);

  // --- far swell: wave particles ---------------------------------------------------------------
  set('waveCount', cfg.wave.count);
  set('waveDomain', preset.waveDomain);
  set('waveAmp', 1.15);
  set('waveAmpMean', 0.9);
  set('waveAmpVariance', 0.55);
  set('waveWavelength', Math.max(60, preset.waveDomain * 0.06));
  set('waveSpeedScale', 1.0);
  set('waveSteepness', 0.62);
  set('waveDistScale', 0.35);

  // --- near-field MLS-MPM ----------------------------------------------------------------------
  const ppc = Math.max(preset.mpmElementsPerParticle, 1);
  const dp = cfg.mpm.dx / Math.cbrt(ppc); // particle spacing
  set('mpmMass', 1000 * dp * dp * dp);
  set('mpmStiffness', 2.2e5);
  set('mpmGamma', 1.0);
  set('mpmViscosity', 0.08);
  set('mpmFriction', 0.25);
  set('mpmRestDensity', 1000);
  set('mpmAbsorbDepth', 1.2);
  set('mpmSpawnRate', 0.55);
  set('mpmSpawnBreaking', 0.75);
  set('mpmSubsteps', 3);
  set('mpmCfl', 0.55);
  set('mpmActiveTiles', cfg.mpm.tiles[0] * cfg.mpm.tiles[1] * cfg.mpm.tiles[2]);

  // --- foam / spray bookkeeping ----------------------------------------------------------------
  set('foamCount', cfg.foam.count);
  set('foamLifetime', 3.5);
  set('foamSpawnRate', 3);
  set('foamDrag', 0.7);
  set('foamBreakingBias', 0.15);
  set('sprayCount', cfg.spray.count);
  set('sprayLifetime', 1.6);
  set('sprayGravity', 9.81);
  set('foamFarOrigin', [0, 0]);
  set('foamFarSize', [cfg.farSize, cfg.farSize]);

  // --- height fields ---------------------------------------------------------------------------
  set('nearHeightRes', [cfg.nearRes, cfg.nearRes]);
  set('farHeightRes', [cfg.farRes, cfg.farRes]);
  set('nearHeightSize', [cfg.nearSize, cfg.nearSize]);
  set('farHeightSize', [cfg.farSize, cfg.farSize]);
  set('nearHeightUse', 1);

  // --- rendering -------------------------------------------------------------------------------
  set('detailAmp', 0.11);
  set('detailScale', 0.5);
  set('detailSpeed', 1.0);
  set('sssStrength', 0.6);
  set('ssrStrength', 0.6);
  set('foamStrength', 1.1);
  set('shoreFoam', 0.65);
  set('foamBrightness', 1.0);
  set('waterTint', [0.32, 0.07, 0.035]);
  set('fogDensity', 0.00009);
  set('exposure', 1.0);
  set('meshLevel0Spacing', cfg.swe.dx * 2);
  set('meshLevels', 2);
  set('meshRes', preset.meshRes);
  set('shadowSteps', preset.shadowSteps);
  set('sunDir', [0.38, 0.26, -0.42]);
  set('sunColor', [1.0, 0.95, 0.88]);
  set('sunIntensity', 1.15);

  // --- fluid (SSFR) ----------------------------------------------------------------------------
  const fdp = dp;
  set('fluidParticleRadius', Math.max(0.05, fdp * 1.15));
  set('fluidFilterRadius', preset.fluidFilterRadius);
  set('fluidFilterRange', Math.max(0.35, fdp * 6));
  set('fluidThicknessScale', 2.2);
  set('fluidRefraction', 0.055);
  set('fluidSpecular', 1.0);
  set('fluidAbsorb', 3.5);
  set('fluidFoam', 1.2);
  set('fluidFoamSpeed', 5.5);
  set('fluidScatter', 1.0);

  // --- interaction / weather -------------------------------------------------------------------
  set('windDir', norm([0.86, 0.5]));
  set('windSpeed', 12);
  set('windStress', 1.4e-4);
  set('bottomDrag', 0.0026);
  set('maxAccel', 40);
  set('seed', 20260917);
  set('debugView', 0);
  set('qualityLevel', 0.35);
  set('cameraUnderwater', 0);
  set('pointerPos', [0, 0]);
  set('pointerPrev', [0, 0]);
  set('pointerActive', 0);
  set('pointerForce', 0);
  set('pointerRadius', 40);
  set('pointerMode', 0);
  set('resolution', [1280, 720]);
}

// ---------------------------------------------------------------------------
// Adaptive quality
// ---------------------------------------------------------------------------

export interface QualityState {
  /** 0 = minimum, 1 = full preset. Scales particle-driven passes and render scale. */
  level: number;
  renderScale: number;
  effects: number; // 0 = off, 1 = reflections only, 2 = +shadows, 3 = +spray/sss
  targetMs: number;
  gpuMs: number;
  fps: number;
}

/**
 * Closed-loop quality controller.
 *
 * Starts at `minLevel` and grows the workload while frame time stays under budget. This is not
 * just a nicety: it means the same build runs "as efficiently as possible" on a GTX 1650 and
 * spends an RTX 4090's headroom automatically.
 */
export class AdaptiveQuality {
  level: number;
  effects: number;
  renderScale: number;
  targetMs: number;
  private accumulated = 0;
  private frames = 0;
  private cooldown = 0;
  private gpuMs = 0;
  readonly minLevel: number;

  /** Ceiling on render effects: an iGPU never gets shadow rays even if the preset asks for them. */
  readonly maxEffects: number;

  constructor(
    private readonly preset: OceanPreset,
    readonly caps: Capabilities,
    opts: { minLevel?: number; startLevel?: number; targetFps?: number } = {},
  ) {
    this.minLevel = opts.minLevel ?? 0.35;
    this.level = opts.startLevel ?? this.minLevel;
    this.targetMs = 1000 / (opts.targetFps ?? 60);
    // Shadows/SSR are the two most expensive render features; only enable them where they fit.
    this.maxEffects = caps.tier === 'igpu' || caps.tier === 'unknown' ? 1 : preset.shadows ? (preset.ssr ? 3 : 2) : preset.ssr ? 1 : 0;
    this.effects = Math.min(this.maxEffects, preset.shadows ? (preset.ssr ? 2 : 1) : preset.ssr ? 1 : 0);
    this.renderScale = preset.renderScale * 0.8;
  }

  /** Call once per frame with measured GPU and wall-clock frame time. */
  update(gpuMs: number, frameMs: number): QualityState {
    this.accumulated += frameMs;
    this.frames++;
    if (this.frames < 30) return this.state(gpuMs, frameMs);
    const avg = this.accumulated / this.frames;
    this.gpuMs = gpuMs > 0 ? gpuMs : avg;
    this.accumulated = 0;
    this.frames = 0;

    if (this.cooldown > 0) this.cooldown--;

    const headroom = this.targetMs - this.gpuMs;
    if (headroom > this.targetMs * 0.35 && this.gpuMs > 0 && this.cooldown === 0) {
      // Lots of headroom: raise the particle budget first (it is what you actually see).
      if (this.level < 1) this.level = Math.min(1, this.level + 0.08);
      else if (this.renderScale < this.preset.renderScale) this.renderScale = Math.min(this.preset.renderScale, this.renderScale + 0.05);
      else if (this.effects < this.maxEffects) this.effects++;
      this.cooldown = 8;
    } else if (this.gpuMs > this.targetMs * 0.97 && this.cooldown === 0) {
      // Over budget: drop render features before geometry detail -- cheaper and less visible.
      if (this.effects > 0) this.effects--;
      else if (this.renderScale > 0.5) this.renderScale = Math.max(0.5, this.renderScale - 0.06);
      else this.level = Math.max(this.minLevel, this.level - 0.1);
      this.cooldown = 12;
    }
    return this.state(gpuMs, frameMs);
  }

  private state(gpuMs: number, frameMs: number): QualityState {
    return { level: this.level, renderScale: this.renderScale, effects: this.effects, targetMs: this.targetMs, gpuMs, fps: 1000 / Math.max(frameMs, 0.001) };
  }

  get wantsShadows(): boolean {
    return this.effects >= 2;
  }

  get wantsScreenSpaceReflections(): boolean {
    return this.effects >= 1;
  }

  get wantsSpray(): boolean {
    return this.effects >= 3;
  }
}

/** `?preset=gtx&scale=0.75&safe=1&bench=1` */
export function parseUrlOptions(search: string): {
  preset: keyof typeof PRESETS;
  scale?: number;
  minLevel?: number;
  startLevel?: number;
  bench: boolean;
  tier: 'auto' | keyof typeof PRESETS;
} {
  const q = new URLSearchParams(search);
  const preset = (q.get('preset') ?? 'gtx') as keyof typeof PRESETS;
  const scale = q.get('scale');
  const bench = q.get('bench') === '1';
  return {
    preset: preset in PRESETS ? preset : 'gtx',
    scale: scale ? Number(scale) : undefined,
    minLevel: q.has('min') ? Number(q.get('min')) : undefined,
    startLevel: q.has('level') ? Number(q.get('level')) : undefined,
    bench,
    tier: (q.get('tier') ?? 'auto') as 'auto' | keyof typeof PRESETS,
  };
}
