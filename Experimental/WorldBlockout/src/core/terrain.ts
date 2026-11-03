// SDF-first world authoring.
//
// The blockout field is a continuous signed distance surface evaluated as a heightfield:
//     f(x, y, z) = y - h(x, z)        (implicit surface; inside = below the surface)
// Authoring edits *that field*, not a bitmap. Bakes then rasterise it to heightmaps, coastlines
// and meshes, so a brush stroke at planet scale and a city pad at 1 km scale stay consistent.
//
// Units: metres. y = 0 is sea level. World spans [-half, +half] on X and Z.

import { Noise } from './noise.ts';
import { clamp, lerp, smoothstep } from './math.ts';

export interface WorldParams {
  /** World width in metres. */
  worldSize: number;
  /** Baked grid resolution (cells per side). */
  gridSize: number;
  seed: number;
  seaLevel: number;
  /** Deepest ocean floor, metres below sea level. */
  abyssDepth: number;
  /** Width of the continental shelf, metres. */
  shelfWidth: number;
  /** Shelf break depth, metres below sea level (where the slope starts). */
  shelfDepth: number;
  /** Peak inland elevation, metres above sea level. */
  peakHeight: number;
  /** Continental interior uplift (plateau), metres. */
  plateauHeight: number;
  mountainAmount: number;
  roughness: number;
}

export const DEFAULT_WORLD: WorldParams = {
  worldSize: 10_000_000,
  gridSize: 1024,
  seed: 20261103,
  seaLevel: 0,
  abyssDepth: 4200,
  shelfWidth: 220_000,
  shelfDepth: 180,
  peakHeight: 5200,
  plateauHeight: 900,
  mountainAmount: 1,
  roughness: 1,
};

/** A continent is a polygon in normalised world space (0..1, u = x, v = z). */
export interface ContinentShape {
  name: string;
  /** Outer ring, normalised coordinates. */
  ring: [number, number][];
  /** Elevation multiplier (craton height). */
  uplift: number;
  /** Mountain belt spine in the same coordinates; ridged noise is concentrated here. */
  spine?: [number, number][];
  /** Mountain intensity multiplier along the spine. */
  mountain?: number;
}

export type BrushKind = 'raise' | 'lower' | 'flatten' | 'smooth' | 'shelf' | 'blob' | 'gulf';

export interface BrushOp {
  kind: BrushKind;
  /** Centre in metres. */
  x: number;
  z: number;
  /** Radius in metres. */
  radius: number;
  /** Strength: metres for raise/lower (positive), 0..1 otherwise. */
  strength: number;
  /** Target height for flatten, metres. */
  target?: number;
  /** Falloff exponent (1 = smooth, 2 = soft core). */
  falloff?: number;
  /** SDF blob shape: 0 = circle, 0..1 = squareness (superellipse). */
  squareness?: number;
  /** Label for the outliner. */
  name?: string;
  /** Set when the op is added, for export metadata. */
  id?: number;
}

// ---------------------------------------------------------------------------
// Polygon / SDF helpers
// ---------------------------------------------------------------------------

/** Winding-independent point-in-polygon (even-odd). */
export function pointInPolygon(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

/** Unsigned distance to the polygon boundary, metres (world space). */
export function polygonDistance(x: number, y: number, ring: [number, number][], scale: number): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * scale, az = ring[j][1] * scale;
    const bx = ring[i][0] * scale, bz = ring[i][1] * scale;
    const abx = bx - ax, abz = bz - az;
    const t = clamp(((x - ax) * abx + (y - az) * abz) / (abx * abx + abz * abz || 1e-9), 0, 1);
    const dx = x - (ax + abx * t), dz = y - (az + abz * t);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Rasterised SDF layers (exact Euclidean distance transform)
// ---------------------------------------------------------------------------

/** Squared Euclidean distance transform, Felzenszwalb & Huttenlocher (2012). */
export function edt2d(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const grid = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  // columns
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, d, v, z, h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  // rows
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, d, v, z, w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = Math.sqrt(grid[i]);
  return out;
}

function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** Scanline rasterise a normalised polygon ring into a sizing x sizing mask. */
export function rasterizeRing(ring: [number, number][], size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5) / size;
    const xs: number[] = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i][1], yj = ring[j][1];
      if ((yi > y) !== (yj > y)) {
        const t = (y - yj) / (yi - yj || 1e-12);
        xs.push(ring[j][0] + (ring[i][0] - ring[j][0]) * t);
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] * size - 0.5));
      const x1 = Math.min(size - 1, Math.floor(xs[k + 1] * size - 0.5));
      for (let px = x0; px <= x1; px++) mask[py * size + px] = 1;
    }
  }
  return mask;
}

/** Rasterise a polyline as one-cell-wide seeds, used as an EDT source. */
export function rasterizePolyline(line: [number, number][], size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const put = (px: number, py: number) => {
    if (px >= 0 && py >= 0 && px < size && py < size) mask[py * size + px] = 1;
  };
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][0] * size, ay = line[i][1] * size;
    const bx = line[i + 1][0] * size, by = line[i + 1][1] * size;
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      put(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t));
    }
  }
  return mask;
}

/**
 * World SDF layers sampled by the terrain field. This *is* the blockout SDF: signed distance to
 * coastline (metres), continental uplift and mountain-spine influence, all as grids that brushes
 * and bakes read. Resolution is independent of the bake resolution.
 */
export interface WorldLayers {
  size: number;
  worldSize: number;
  /** Negative inland, positive offshore, metres. */
  coast: Float32Array;
  /** 0..1 craton uplift. */
  uplift: Float32Array;
  /** 0..1 mountain spine influence. */
  spine: Float32Array;
}

export function buildWorldLayers(continents: ContinentShape[], worldSize: number, size = 512): WorldLayers {
  const cell = worldSize / size;
  let inside = new Uint8Array(size * size);
  const uplift = new Float32Array(size * size);
  const spine = new Float32Array(size * size);

  for (const c of continents) {
    const m = rasterizeRing(c.ring, size);
    for (let i = 0; i < m.length; i++) {
      if (m[i]) {
        inside[i] = 1;
        uplift[i] = Math.max(uplift[i], c.uplift);
      }
    }
    if (c.spine) {
      const seeds = rasterizePolyline(c.spine, size);
      const dist = edt2d(seeds, size, size); // cells to the spine
      const sigma = 0.075 * size; // 7.5% of the world
      for (let i = 0; i < dist.length; i++) {
        if (!inside[i]) continue;
        const d = dist[i];
        const v = Math.exp(-((d / sigma) ** 2)) * (c.mountain ?? 1);
        if (v > spine[i]) spine[i] = v;
      }
    }
  }

  // Signed distance: negative inside the union, positive outside, in metres.
  const outside = new Uint8Array(size * size);
  for (let i = 0; i < inside.length; i++) outside[i] = inside[i] ? 0 : 1;
  const distToLand = edt2d(inside, size, size);
  const distToSea = edt2d(outside, size, size);
  const coast = new Float32Array(size * size);
  for (let i = 0; i < coast.length; i++) {
    coast[i] = (inside[i] ? -(distToSea[i] - 0.5) : distToLand[i] - 0.5) * cell;
  }
  return { size, worldSize, coast, uplift, spine };
}

/** Bilinear sampler for a square layer grid. */
export function sampleLayer(layer: Float32Array, size: number, worldSize: number, x: number, z: number): number {
  const half = worldSize / 2;
  const fx = ((x + half) / worldSize) * size - 0.5;
  const fz = ((z + half) / worldSize) * size - 0.5;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fx - x0, tz = fz - z0;
  const cx = (v: number) => (v < 0 ? 0 : v > size - 1 ? size - 1 : v);
  const a = layer[cx(z0) * size + cx(x0)];
  const b = layer[cx(z0) * size + cx(x0 + 1)];
  const c = layer[cx(z0 + 1) * size + cx(x0)];
  const d = layer[cx(z0 + 1) * size + cx(x0 + 1)];
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

/**
 * Signed distance to a continent in metres: negative inland, positive offshore.
 * Offshore distance is exact to the polygon; inland uses a distance transform proxy
 * (distance to boundary) which is what the shelf profile needs.
 */
export function coastSignedDistance(x: number, z: number, shape: ContinentShape, worldSize: number): number {
  const d = polygonDistance(x, z, shape.ring, worldSize);
  return pointInPolygon(x, z, shape.ring) ? -d : d;
}

export function distanceToPolyline(x: number, z: number, line: [number, number][], worldSize: number): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = line[i][0] * worldSize, az = line[i][1] * worldSize;
    const bx = line[i + 1][0] * worldSize, bz = line[i + 1][1] * worldSize;
    const abx = bx - ax, abz = bz - az;
    const t = clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1e-9), 0, 1);
    const d = Math.hypot(x - (ax + abx * t), z - (az + abz * t));
    if (d < best) best = d;
  }
  return best;
}

/** Superellipse SDF blob, returns signed distance in metres (negative inside). */
function blobDistance(x: number, z: number, op: BrushOp): number {
  const dx = Math.abs(x - op.x), dz = Math.abs(z - op.z);
  const sq = clamp(op.squareness ?? 0, 0, 0.95);
  if (sq <= 0.001) return Math.hypot(dx, dz) - op.radius;
  // Smooth blend between circle and square so gulfs can be long and boxy.
  const ellipse = Math.hypot(dx, dz) - op.radius;
  const box = Math.max(dx, dz) - op.radius;
  return lerp(ellipse, box, sq);
}

// ---------------------------------------------------------------------------
// The world field
// ---------------------------------------------------------------------------

export class WorldField {
  readonly params: WorldParams;
  readonly noise: Noise;
  readonly detail: Noise;
  readonly continents: ContinentShape[];
  readonly layers: WorldLayers;
  ops: BrushOp[] = [];
  private nextOpId = 1;
  /** Bumped on every edit so caches (GPU textures, bakes, city pads) can invalidate. */
  revision = 0;

  constructor(params: WorldParams, continents: ContinentShape[], ops: BrushOp[] = [], layerSize = 512) {
    this.params = params;
    this.noise = new Noise(params.seed);
    this.detail = new Noise(params.seed ^ 0x9e3779b9);
    this.continents = continents;
    this.ops = ops.map(o => ({ ...o, id: o.id ?? this.nextOpId++ }));
    for (const o of this.ops) if (o.id !== undefined) this.nextOpId = Math.max(this.nextOpId, o.id + 1);
    this.layers = buildWorldLayers(continents, params.worldSize, layerSize);
  }

  /** Signed distance to the nearest coastline, metres (negative inland). */
  coastDistance(x: number, z: number): number {
    if (!this.continents.length) return this.params.worldSize;
    return sampleLayer(this.layers.coast, this.layers.size, this.layers.worldSize, x, z);
  }

  /** Base terrain before brush ops: the SDF blockout evaluated as a heightfield. */
  private baseHeight(x: number, z: number): number {
    const p = this.params;
    const ws = p.worldSize;
    const s = 1 / ws; // one noise unit = the whole world

    // Domain warp keeps coastlines organic instead of polygonal.
    const [wx, wz] = this.noise.warp2(x * s, z * s, 0.055, 1.9, 3);
    const px = wx * ws, pz = wz * ws;

    const coast = this.coastDistance(px, pz);
    const uplift = Math.max(0.25, sampleLayer(this.layers.uplift, this.layers.size, ws, px, pz));
    const spine = sampleLayer(this.layers.spine, this.layers.size, ws, px, pz);

    // --- sea floor ---------------------------------------------------------
    const ridge = this.noise.ridged2(x * s * 22 + 4.1, z * s * 22 - 2.7, 4);
    const abyss = -p.abyssDepth * (0.82 + 0.3 * ridge * p.roughness);

    // Shelf: from abyss up to shelfDepth over shelfWidth of offshore distance.
    const offshore = Math.max(coast, 0);
    const shelfT = 1 - smoothstep(0, p.shelfWidth, offshore);
    const shelfFloor = -p.shelfDepth;
    const seaFloor = lerp(abyss, shelfFloor, shelfT * shelfT);

    // --- land --------------------------------------------------------------
    const inland = Math.max(-coast, 0);
    const inlandT = smoothstep(0, ws * 0.16, inland);
    const plateau = p.plateauHeight * uplift * (0.35 + 0.65 * inlandT);
    const plains = this.noise.fbm2(x * s * 30 + 9.7, z * s * 30 + 3.3, 5) * 220 * p.roughness;
    const mountains = this.noise.ridged2(x * s * 46 - 12.3, z * s * 46 + 7.9, 6) *
      Math.min(1, spine * 1.35) * p.peakHeight * p.mountainAmount;
    // Coastal plain bias: land near the coast sits low, as real coastlines do.
    const coastalBias = -smoothstep(0, ws * 0.05, inland) * 120;
    const land = Math.max(6, plateau + plains + mountains + coastalBias);

    // Blend across the shoreline over ~2 km so there is a beach, not a step.
    const shoreT = smoothstep(-2500, 2500, coast);
    let h = lerp(land, seaFloor, shoreT);
    // Cliff / bluff detail near the shore, fading inland.
    h += this.detail.noise2(x * s * 640, z * s * 640) * 45 * Math.exp(-Math.abs(coast) / 26000);
    return h;
  }

  /** Height in metres at world position, including every sculpt op. */
  heightAt(x: number, z: number): number {
    let h = this.baseHeight(x, z);
    if (!this.ops.length) return h;

    let delta = 0;
    let flattenTarget = 0, flattenWeight = 0, flattenStrength = 0;
    let smoothWeight = 0;
    let blobTop = -Infinity;
    let gulfCut = 0;
    let gulfDepth = 0;

    for (const op of this.ops) {
      const d = blobDistance(x, z, op);
      if (d > op.radius) continue;
      const t = clamp(1 - d / op.radius, 0, 1);
      const w = Math.pow(t, op.falloff ?? 1.4);
      switch (op.kind) {
        case 'raise': delta += op.strength * w; break;
        case 'lower': delta -= op.strength * w; break;
        case 'flatten': {
          // Pad profile: full strength across a flat core, feathered rim (city plateaus).
          const pad = smoothstep(0, 0.32, t);
          flattenTarget += (op.target ?? h) * pad;
          flattenWeight += pad;
          flattenStrength = Math.max(flattenStrength, op.strength);
          break;
        }
        case 'smooth': smoothWeight = Math.max(smoothWeight, w * clamp(op.strength, 0, 1)); break;
        case 'shelf': {
          const target = -this.params.shelfDepth;
          if (h < target) delta += (target - h) * w * clamp(op.strength, 0, 1);
          break;
        }
        case 'blob': {
          const top = this.params.plateauHeight * (0.25 + 0.75 * clamp(op.strength, 0, 1));
          const dome = top * smoothstep(0, 1, t);
          if (dome > blobTop) blobTop = dome;
          break;
        }
        case 'gulf': {
          // Subtract water: blend the field down to a bowl whose depth is guaranteed below sea
          // level at the centre, whatever the continent's elevation was underneath.
          const st = clamp(op.strength, 0, 1);
          const depth = this.params.shelfDepth * (1.2 + 2.0 * st) * smoothstep(0, 0.9, t);
          const weight = Math.pow(smoothstep(0, 0.95, t), op.falloff ?? 1);
          gulfCut = Math.max(gulfCut, weight);
          gulfDepth = Math.max(gulfDepth, depth);
          break;
        }
      }
    }

    h += delta;
    if (blobTop > -Infinity) h = Math.max(h, blobTop);
    if (gulfCut > 0) h = lerp(h, -gulfDepth, gulfCut);
    if (flattenWeight > 0) {
      const target = flattenTarget / flattenWeight;
      h = lerp(h, target, clamp(flattenWeight, 0, 1) * flattenStrength);
    }
    if (smoothWeight > 0) {
      // Symbolic smoothing toward the regional mean (no bake dependency, so ops stay order-free).
      const r = Math.max(2000, x === 0 && z === 0 ? 6000 : 6000);
      const mean = (this.baseHeight(x + r, z) + this.baseHeight(x - r, z) + this.baseHeight(x, z + r) + this.baseHeight(x, z - r)) / 4;
      h = lerp(h, mean, smoothWeight);
    }
    return h;
  }

  /** Surface normal (unit) from central differences of the field. */
  normalAt(x: number, z: number, eps = 250): [number, number, number] {
    const hx = this.heightAt(x + eps, z) - this.heightAt(x - eps, z);
    const hz = this.heightAt(x, z + eps) - this.heightAt(x, z - eps);
    const nx = -hx, nz = -hz, ny = 2 * eps;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  }

  addOp(op: BrushOp): BrushOp {
    const withId = { ...op, id: this.nextOpId++ };
    this.ops.push(withId);
    this.revision++;
    return withId;
  }

  removeOp(id: number): boolean {
    const i = this.ops.findIndex(o => o.id === id);
    if (i < 0) return false;
    this.ops.splice(i, 1);
    this.revision++;
    return true;
  }

  /** Is this position water? */
  isWater(x: number, z: number): boolean {
    return this.heightAt(x, z) < this.params.seaLevel;
  }
}

// ---------------------------------------------------------------------------
// Bakes: heightmap, SDF grid, mesh, coastline
// ---------------------------------------------------------------------------

export interface HeightBake {
  size: number;
  /** Cell size in metres. */
  cell: number;
  worldSize: number;
  seaLevel: number;
  /** Row-major, index = z * size + x. Metres. */
  heights: Float32Array;
  min: number;
  max: number;
  landFraction: number;
}

export function bakeHeightmap(field: WorldField, size: number): HeightBake {
  const ws = field.params.worldSize;
  const cell = ws / size;
  const half = ws / 2;
  const heights = new Float32Array(size * size);
  let min = Infinity, max = -Infinity, land = 0;
  const sea = field.params.seaLevel;
  for (let z = 0; z < size; z++) {
    const wz = -half + (z + 0.5) * cell;
    for (let x = 0; x < size; x++) {
      const wx = -half + (x + 0.5) * cell;
      const h = field.heightAt(wx, wz);
      heights[z * size + x] = h;
      if (h < min) min = h;
      if (h > max) max = h;
      if (h > sea) land++;
    }
  }
  return { size, cell, worldSize: ws, seaLevel: sea, heights, min, max, landFraction: land / (size * size) };
}

/** Signed distance grid: positive above sea level (metres of elevation), negative below. */
export function bakeSdf(bake: HeightBake): Float32Array {
  const out = new Float32Array(bake.heights.length);
  for (let i = 0; i < out.length; i++) out[i] = bake.heights[i] - bake.seaLevel;
  return out;
}

export interface TerrainMesh {
  positions: Float32Array;
  normals: Float32Array;
  /** 0 = sea floor, 1 = peak, for shading. */
  heights: Float32Array;
  indices: Uint32Array;
  triangleCount: number;
  /** True where the cell straddles sea level (used to darken shoreline). */
  shore: Uint8Array;
}

/**
 * SDF -> mesh. For an implicit heightfield surface the isosurface is a regular grid, so the
 * conversion is a quad mesh at the baked resolution with normals from central differences.
 * Only cells that are not fully below sea level are emitted when `cullSeafloor` is set.
 */
export function buildTerrainMesh(bake: HeightBake, opts: { stride?: number; cullSeafloor?: boolean } = {}): TerrainMesh {
  const stride = Math.max(1, opts.stride ?? 1);
  const size = bake.size;
  const vertsPerSide = Math.floor((size - 1) / stride) + 1;
  const vcount = vertsPerSide * vertsPerSide;
  const positions = new Float32Array(vcount * 3);
  const normals = new Float32Array(vcount * 3);
  const heights = new Float32Array(vcount);
  const shore = new Uint8Array(vcount);
  const half = bake.worldSize / 2;
  const h = bake.heights;

  for (let vz = 0; vz < vertsPerSide; vz++) {
    for (let vx = 0; vx < vertsPerSide; vx++) {
      const gx = Math.min(size - 1, vx * stride), gz = Math.min(size - 1, vz * stride);
      const i = vz * vertsPerSide + vx;
      const x = -half + gx * bake.cell;
      const z = -half + gz * bake.cell;
      const y = h[gz * size + gx];
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      heights[i] = y;

      const xm = h[gz * size + Math.max(0, gx - stride)];
      const xp = h[gz * size + Math.min(size - 1, gx + stride)];
      const zm = h[Math.max(0, gz - stride) * size + gx];
      const zp = h[Math.min(size - 1, gz + stride) * size + gx];
      const dx = ((xp - xm) / (2 * stride * bake.cell)) || 0;
      const dz = ((zp - zm) / (2 * stride * bake.cell)) || 0;
      const nx = -dx, ny = 1, nz = -dz;
      const l = Math.hypot(nx, ny, nz) || 1;
      normals[i * 3] = nx / l;
      normals[i * 3 + 1] = ny / l;
      normals[i * 3 + 2] = nz / l;
      const aboveSea = y > bake.seaLevel;
      shore[i] = (aboveSea && (xm <= bake.seaLevel || xp <= bake.seaLevel || zm <= bake.seaLevel || zp <= bake.seaLevel)) ||
        (!aboveSea && (xm > bake.seaLevel || xp > bake.seaLevel || zm > bake.seaLevel || zp > bake.seaLevel)) ? 1 : 0;
    }
  }

  const indices: number[] = [];
  for (let vz = 0; vz < vertsPerSide - 1; vz++) {
    for (let vx = 0; vx < vertsPerSide - 1; vx++) {
      const a = vz * vertsPerSide + vx;
      const b = a + 1;
      const c = a + vertsPerSide;
      const d = c + 1;
      if (opts.cullSeafloor) {
        const above = heights[a] > bake.seaLevel || heights[b] > bake.seaLevel || heights[c] > bake.seaLevel || heights[d] > bake.seaLevel;
        if (!above) continue;
      }
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    positions, normals, heights, shore,
    indices: new Uint32Array(indices),
    triangleCount: indices.length / 3,
  };
}

export interface CoastPolyline {
  points: [number, number][];
  closed: boolean;
}

/**
 * Coastline extraction with marching squares on the height == seaLevel contour.
 * Used for the map view, city placement scoring and SVG export.
 */
export function extractCoastline(bake: HeightBake): CoastPolyline[] {
  const size = bake.size, h = bake.heights, sea = bake.seaLevel;
  const half = bake.worldSize / 2;
  const segments: [number, number, number, number][] = [];
  const interp = (xa: number, za: number, xb: number, zb: number, ha: number, hb: number): [number, number] => {
    const t = (sea - ha) / (hb - ha || 1e-9);
    return [xa + (xb - xa) * t, za + (zb - za) * t];
  };
  for (let z = 0; z < size - 1; z++) {
    for (let x = 0; x < size - 1; x++) {
      const h00 = h[z * size + x], h10 = h[z * size + x + 1];
      const h01 = h[(z + 1) * size + x], h11 = h[(z + 1) * size + x + 1];
      const x0 = -half + x * bake.cell, z0 = -half + z * bake.cell;
      const x1 = x0 + bake.cell, z1 = z0 + bake.cell;
      const idx = (h00 > sea ? 1 : 0) | (h10 > sea ? 2 : 0) | (h11 > sea ? 4 : 0) | (h01 > sea ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const top = interp(x0, z0, x1, z0, h00, h10);
      const right = interp(x1, z0, x1, z1, h10, h11);
      const bottom = interp(x0, z1, x1, z1, h01, h11);
      const left = interp(x0, z0, x0, z1, h00, h01);
      switch (idx) {
        case 1: case 14: segments.push([left[0], left[1], top[0], top[1]]); break;
        case 2: case 13: segments.push([top[0], top[1], right[0], right[1]]); break;
        case 3: case 12: segments.push([left[0], left[1], right[0], right[1]]); break;
        case 4: case 11: segments.push([right[0], right[1], bottom[0], bottom[1]]); break;
        case 6: case 9: segments.push([top[0], top[1], bottom[0], bottom[1]]); break;
        case 7: case 8: segments.push([left[0], left[1], bottom[0], bottom[1]]); break;
        case 5: segments.push([left[0], left[1], top[0], top[1]], [right[0], right[1], bottom[0], bottom[1]]); break;
        case 10: segments.push([top[0], top[1], right[0], right[1]], [left[0], left[1], bottom[0], bottom[1]]); break;
      }
    }
  }
  return joinSegments(segments, bake.cell * 1.5);
}

function key(x: number, y: number, q: number) {
  return `${Math.round(x / q)},${Math.round(y / q)}`;
}

/** Stitch marching-squares segments into polylines (coastline rings). */
export function joinSegments(segments: [number, number, number, number][], tolerance: number): CoastPolyline[] {
  const buckets = new Map<string, number[]>();
  const used = new Uint8Array(segments.length);
  segments.forEach((s, i) => {
    for (const [x, y] of [[s[0], s[1]], [s[2], s[3]]]) {
      const k = key(x, y, tolerance);
      const arr = buckets.get(k);
      if (arr) arr.push(i); else buckets.set(k, [i]);
    }
  });
  const out: CoastPolyline[] = [];
  const findNext = (x: number, y: number): number => {
    const k = key(x, y, tolerance);
    for (const i of buckets.get(k) ?? []) if (!used[i]) return i;
    return -1;
  };
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const s = segments[i];
    const pts: [number, number][] = [[s[0], s[1]], [s[2], s[3]]];
    // extend from the end
    for (;;) {
      const [ex, ey] = pts[pts.length - 1];
      const n = findNext(ex, ey);
      if (n < 0) break;
      used[n] = 1;
      const t = segments[n];
      const same = key(t[0], t[1], tolerance) === key(ex, ey, tolerance);
      pts.push(same ? [t[2], t[3]] : [t[0], t[1]]);
    }
    // extend from the start
    for (;;) {
      const [sx, sy] = pts[0];
      const n = findNext(sx, sy);
      if (n < 0) break;
      used[n] = 1;
      const t = segments[n];
      const same = key(t[0], t[1], tolerance) === key(sx, sy, tolerance);
      pts.unshift(same ? [t[2], t[3]] : [t[0], t[1]]);
    }
    const closed = pts.length > 3 && key(pts[0][0], pts[0][1], tolerance) === key(pts[pts.length - 1][0], pts[pts.length - 1][1], tolerance);
    if (closed) pts.pop();
    if (pts.length > 2) out.push({ points: pts, closed });
  }
  return out;
}

// ---------------------------------------------------------------------------
// World heightmap import / export
// ---------------------------------------------------------------------------

/** Bilinear sample of a bake at world position, for camera collision and city pads. */
export function sampleBake(bake: HeightBake, x: number, z: number): number {
  const half = bake.worldSize / 2;
  const fx = (x + half) / bake.cell - 0.5;
  const fz = (z + half) / bake.cell - 0.5;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fx - x0, tz = fz - z0;
  const cx = (v: number) => clamp(v, 0, bake.size - 1);
  const h00 = bake.heights[cx(z0) * bake.size + cx(x0)];
  const h10 = bake.heights[cx(z0) * bake.size + cx(x0 + 1)];
  const h01 = bake.heights[cx(z0 + 1) * bake.size + cx(x0)];
  const h11 = bake.heights[cx(z0 + 1) * bake.size + cx(x0 + 1)];
  return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
}
