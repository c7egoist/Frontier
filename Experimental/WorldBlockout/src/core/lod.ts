// Adaptive level-of-detail for water and terrain — the "Nanite for water" resolver.
//
// The ocean is drawn in four regimes, each with a bounded cost, chosen per screen-space
// projected error rather than a fixed distance:
//   0  simulated   GPU height-field / shallow-water sim, camera-centred, finite resolution
//   1  displaced   tessellated clipmap rings, vertices displaced by spectrum samples
//   2  flat+detail geometry collapses to a horizontal plane, normals from spectrum textures
//   3  horizon     2-triangle skirt with shading only
// `selectOceanLOD` is the single source of truth; the TS tests and the WGSL shader use the
// same rule (see shaders/common.wgsl `oceanLod`), so the CPU cannot disagree with the GPU.

export type OceanRegime = 'simulated' | 'displaced' | 'flat' | 'horizon';

export interface LODParams {
  /** Vertical field of view, radians. */
  fovY: number;
  /** Viewport height in pixels. */
  viewportHeight: number;
  /** Distance at which simulated water hands over to the displacement mesh, metres. */
  simRadius: number;
  /** Distance at which displacement stops and shading-only water begins. */
  flatDistance: number;
  /** Distance at which the horizon skirt begins. */
  horizonDistance: number;
  /** Screen-space error budget in pixels for the displacement mesh. */
  pixelErrorBudget: number;
}

/** Projected size in pixels of a world-space feature of `size` metres at `distance`. */
export function projectedPixels(size: number, distance: number, p: LODParams): number {
  const d = Math.max(distance, 1e-3);
  return (size / d) * (p.viewportHeight / (2 * Math.tan(p.fovY / 2)));
}

/**
 * Vertical amplitude of the spectrum that survives at a distance.
 * Geometric detail (the ~metre chop) is invisible past a few kilometres, so the resolver
 * measures oscillation amplitude against the pixel budget and drops levels that would alias.
 */
export function oceanRegime(distance: number, p: LODParams): OceanRegime {
  if (distance <= p.simRadius) return 'simulated';
  if (distance <= p.flatDistance) return 'displaced';
  if (distance <= p.horizonDistance) return 'flat';
  return 'horizon';
}

/** Continuous blend weight across a boundary, so handovers fade instead of popping. */
export function regimeBlend(distance: number, boundary: number, featherMetres: number): number {
  const t = (distance - (boundary - featherMetres)) / Math.max(featherMetres, 1e-3);
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/**
 * Ring table. Rings are geometric (spacing doubles each level) so the cost is independent of
 * view distance, but the *starting* spacing is resolved from the camera altitude against the
 * pixel budget: a map view does not pay for centimetre water, a low camera does. The result is
 * near-constant screen-space error at every ring — coarse where it is invisible, fine where it
 * is not.
 */
export interface ClipmapRing {
  index: number;
  /** Inner radius, metres. */
  inner: number;
  /** Outer radius, metres. */
  outer: number;
  /** Vertex spacing, metres. */
  spacing: number;
  /** Quads per side for the ring mesh. */
  verts: number;
  regime: OceanRegime;
  /** Projected pixel error of this ring's quads at its inner radius. */
  errorPx: number;
}

export const QUADS_PER_RING = 32;
const _clipmapCache = new Map<string, ClipmapRing[]>();

/**
 * Base (finest) spacing in metres for a camera at `cameraHeight` above the water.
 * We want a quad to be at least `pixelErrorBudget` pixels wide at the sim radius, otherwise
 * we are paying for detail that aliases.
 */
export function resolveBaseSpacing(cameraHeight: number, p: LODParams): number {
  const distance = Math.max(p.simRadius, cameraHeight * 0.5, 1);
  let spacing = 0.25;
  while (spacing < 64) {
    const px = projectedPixels(spacing * 2, distance, p);
    if (px < p.pixelErrorBudget * 2) spacing *= 2;
    else break;
  }
  return spacing;
}

export function buildClipmap(baseSpacing: number, levels: number, p: LODParams): ClipmapRing[] {
  const key = `${baseSpacing}|${levels}|${p.fovY}|${p.viewportHeight}|${p.pixelErrorBudget}|${p.simRadius}|${p.flatDistance}|${p.horizonDistance}`;
  const cached = _clipmapCache.get(key);
  if (cached) return cached;

  const rings: ClipmapRing[] = [];
  let inner = 0;
  for (let i = 0; i < levels; i++) {
    const spacing = baseSpacing * Math.pow(2, i);
    const outer = inner + spacing * QUADS_PER_RING;
    const mid = (inner + outer) / 2;
    rings.push({
      index: i,
      inner,
      outer,
      spacing,
      verts: QUADS_PER_RING,
      regime: oceanRegime(mid, p),
      errorPx: projectedPixels(spacing, Math.max(mid, 1), p),
    });
    inner = outer;
  }
  _clipmapCache.set(key, rings);
  return rings;
}

/** Spacing used by a given ring (metres per quad). */
export function ringSpacing(baseSpacing: number, ring: number, p: LODParams): number {
  const rings = buildClipmap(baseSpacing, Math.max(ring + 1, 1), p);
  return rings[Math.min(ring, rings.length - 1)].spacing;
}

/** How many rings are needed before the flat-shading handover distance is reached. */
export function ringsToCover(distance: number, baseSpacing: number): number {
  let inner = 0, levels = 0;
  while (inner < distance && levels < 24) {
    inner += baseSpacing * Math.pow(2, levels) * QUADS_PER_RING;
    levels++;
  }
  return Math.max(levels, 1);
}

export interface WaterLOD {
  baseSpacing: number;
  rings: ClipmapRing[];
  /** Start angle of the coarsening, used by the HUD to explain the decision. */
  reason: string;
  tris: number;
  maxErrorPx: number;
}

/** Single entry point used by the renderer: camera altitude -> complete water LOD plan. */
export function resolveWaterLod(cameraHeight: number, p: LODParams): WaterLOD {
  const baseSpacing = resolveBaseSpacing(cameraHeight, p);
  const levels = ringsToCover(p.flatDistance, baseSpacing);
  const rings = buildClipmap(baseSpacing, levels, p);
  const tris = clipmapTriangleCount(rings);
  const maxErrorPx = rings.reduce((m, r) => Math.max(m, r.errorPx), 0);
  return {
    baseSpacing,
    rings,
    tris,
    maxErrorPx,
    reason: `altitude ${cameraHeight.toFixed(0)} m -> ${baseSpacing} m quads, ${levels} rings, ${(tris / 1000).toFixed(0)}k tris, max err ${maxErrorPx.toFixed(1)} px`,
  };
}

/** Triangles per ring: a 32x32 annulus, two triangles per quad, four sides. */
export function clipmapTriangleCount(rings: ClipmapRing[]): number {
  return rings.reduce((n, r) => n + 2 * 3 * r.verts * r.verts, 0);
}

/**
 * Geomorph factor for a vertex at `distance` inside ring `i`: 0 = full current spacing,
 * 1 = fully morphed to the next coarser level. Removes LOD popping without extra vertices.
 */
export function geomorphAlpha(distance: number, ring: ClipmapRing, featherMetres: number): number {
  const start = ring.outer - featherMetres;
  if (distance <= start) return 0;
  const t = Math.min(1, (distance - start) / Math.max(featherMetres, 1e-3));
  return t * t * (3 - 2 * t);
}

/** Grid spacing snapped to a power-of-two world grid so the mesh does not swim when moving. */
export function snapSpacing(spacing: number, camCoord: number): { origin: number; offsetQuads: number } {
  const snapped = Math.floor(camCoord / spacing) * spacing;
  return { origin: snapped, offsetQuads: Math.round((camCoord - snapped) / spacing) };
}

/** Water sim timestep from the shallow-water CFL limit (stability guarantee). */
export function stableSimTimestep(cellSize: number, maxDepth: number, gravity = 9.81, cfl = 0.4): number {
  const waveSpeed = Math.sqrt(gravity * Math.max(maxDepth, 0.05));
  return (cfl * cellSize) / waveSpeed;
}
