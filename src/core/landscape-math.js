/**
 * Planet-scale landscape math: allocation-free hashes, gradient noise, fBm,
 * domain warp and analytic helpers shared by the CPU (worker) SDF and the GPU
 * preview shaders.
 *
 * Everything here is deterministic for a given seed and depends only on
 * absolute coordinates, which is what lets a landscape be authored in
 * independent, disjoint tiles and still agree exactly at the seams.
 *
 * Conventions used across the whole Landmass system:
 *   x, z  metres east / south on the landscape plane
 *   y     metres of elevation, sea level at y = 0 (a signed field, never a
 *         clamped heightmap)
 */

export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function saturate(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mix(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, value) {
  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Branch-free-ish polynomial smax/smin used for soft landmass unions. */
export function smax(a, b, k) {
  if (k <= 1e-6) return a > b ? a : b;
  const h = saturate(0.5 + (0.5 * (a - b)) / k);
  return lerp(b, a, h) + k * h * (1 - h);
}

export function smin(a, b, k) {
  if (k <= 1e-6) return a < b ? a : b;
  const h = saturate(0.5 - (0.5 * (a - b)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}

/** Signed power used by ridged multifractal noise. */
export function signedPow(value, exponent) {
  const s = value < 0 ? -1 : 1;
  return s * Math.pow(Math.abs(value), exponent);
}

/** Cheap exp2 used by LOD and octave weighting (avoids Math.pow in hot loops). */
export function exp2f(power) {
  return Math.pow(2, power);
}

// ---------------------------------------------------------------------------
// Integer hashing (no allocations, stable across platforms)
// ---------------------------------------------------------------------------

export function hash2(ix, iz, seed) {
  let n = (seed | 0) ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

export function hash3i(ix, iy, iz, seed) {
  let n = (seed | 0) ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x9e3779b1) ^ Math.imul(iz | 0, 0x165667b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

export function hashSigned2(ix, iz, seed) {
  return hash2(ix, iz, seed) * 2 - 1;
}

/** Deterministic 0..1 hash of a floating point position quantised to a salt grid. */
export function hashPosition(x, z, salt = 0) {
  return hash2(Math.round(x * 16), Math.round(z * 16), salt);
}

// ---------------------------------------------------------------------------
// 2D gradient (Perlin-style) noise. Gradient noise is used instead of value
// noise because its derivative never collapses to zero across a whole cell,
// so ridged/eroded features keep their crisp crests at continent scale.
// ---------------------------------------------------------------------------

const GRAD_X = new Float64Array([1, -1, 1, -1, 1.4142, -1.4142, 0, 0]);
const GRAD_Z = new Float64Array([1, 1, -1, -1, 0, 0, 1.4142, -1.4142]);

function gradDot(ix, iz, seed, dx, dz) {
  const idx = (hash2(ix, iz, seed) * 8) | 0;
  return GRAD_X[idx & 7] * dx + GRAD_Z[idx & 7] * dz;
}

export function perlin2(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const n00 = gradDot(ix, iz, seed, fx, fz);
  const n10 = gradDot(ix + 1, iz, seed, fx - 1, fz);
  const n01 = gradDot(ix, iz + 1, seed, fx, fz - 1);
  const n11 = gradDot(ix + 1, iz + 1, seed, fx - 1, fz - 1);
  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uz;
}

/**
 * Fractal Brownian motion. `octaves` may be fractional: the final octave is
 * blended by its fractional part. That is what lets a tile evaluate exactly
 * the octave set its world-space cell size can represent, so a 6 km region and
 * a 4,000 km map still describe the same continuous field, only band-limited.
 */
export function fbm2(x, z, seed = 0, octaves = 5, lacunarity = 2.02, gain = 0.5) {
  const full = Math.floor(octaves);
  const frac = octaves - full;
  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < full; i++) {
    sum += perlin2(x * frequency, z * frequency, seed + i * 1013) * amplitude;
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  if (frac > 1e-4) {
    sum += perlin2(x * frequency, z * frequency, seed + full * 1013) * amplitude * frac;
    norm += amplitude * frac;
  }
  return norm > 1e-9 ? sum / norm : 0;
}

/** Ridged multifractal in 0..1 with sharp crests (mountain chains, canyons). */
export function ridged2(x, z, seed = 0, octaves = 5, lacunarity = 2.07, gain = 0.5) {
  const full = Math.floor(octaves);
  const frac = octaves - full;
  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < full; i++) {
    const n = 1 - Math.abs(perlin2(x * frequency, z * frequency, seed + i * 733));
    sum += n * n * amplitude;
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  if (frac > 1e-4) {
    const n = 1 - Math.abs(perlin2(x * frequency, z * frequency, seed + full * 733));
    sum += n * n * amplitude * frac;
    norm += amplitude * frac;
  }
  return norm > 1e-9 ? clamp(sum / norm, 0, 1) : 0;
}

/** Billowy noise in 0..1 (rolling hills, sediment swells). */
export function billow2(x, z, seed = 0, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  const full = Math.floor(octaves);
  const frac = octaves - full;
  let sum = 0;
  let norm = 0;
  let amplitude = 1;
  let frequency = 1;
  for (let i = 0; i < full; i++) {
    sum += Math.abs(perlin2(x * frequency, z * frequency, seed + i * 311)) * amplitude;
    norm += amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  if (frac > 1e-4) {
    sum += Math.abs(perlin2(x * frequency, z * frequency, seed + full * 311)) * amplitude * frac;
    norm += amplitude * frac;
  }
  return norm > 1e-9 ? clamp(sum / norm, 0, 1) : 0;
}

/**
 * Spectral (self-affine) relief.
 *
 * `baseAmplitudeMeters` is the peak-to-trough relief carried by the *longest*
 * wavelength `baseWavelengthMeters`; each subsequent octave halves both, which
 * keeps the field's slope roughly constant from band to band — the property that
 * makes terrain look like terrain at every zoom instead of like dunes.
 *
 * Octave count is supplied by the caller from its own budget, so this is
 * band-limited per LOD by construction and never aliases.
 */
export function spectral2(x, z, seed = 0, baseWavelength = 10_000, baseAmplitudeMeters = 100, octaves = 8, lacunarity = 2.01, gain = 0.5) {
  if (!(baseWavelength > 0) || !(baseAmplitudeMeters > 0)) return 0;
  const full = Math.floor(octaves);
  const frac = octaves - full;
  let sum = 0;
  let amplitude = baseAmplitudeMeters;
  let frequency = 1 / baseWavelength;
  for (let i = 0; i < full; i++) {
    sum += perlin2(x * frequency, z * frequency, seed + i * 1013) * amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  if (frac > 1e-4) {
    sum += perlin2(x * frequency, z * frequency, seed + full * 1013) * amplitude * frac;
  }
  return sum;
}

/** Spectral ridged relief with crests preserved at every band. */
export function spectralRidged2(x, z, seed = 0, baseWavelength = 10_000, baseAmplitudeMeters = 100, octaves = 8, lacunarity = 2.02, gain = 0.52) {
  if (!(baseWavelength > 0) || !(baseAmplitudeMeters > 0)) return 0;
  const full = Math.floor(octaves);
  let sum = 0;
  let amplitude = baseAmplitudeMeters;
  let frequency = 1 / baseWavelength;
  for (let i = 0; i < full; i++) {
    const n = 1 - Math.abs(perlin2(x * frequency, z * frequency, seed + i * 733));
    sum += n * n * amplitude;
    frequency *= lacunarity;
    amplitude *= gain;
  }
  return sum;
}

/**
 * Domain warp: offsets the sample position by a low-frequency vector field.
 * This is the single most important ingredient for turning "noise blobs" into
 * coastlines with bays, headlands and straits. Written into `out` to avoid
 * allocating a pair per sample in the tiling loop.
 */
export function domainWarp2(x, z, seed, strength, frequency, out) {
  const wx = perlin2(x * frequency, z * frequency, seed + 9001);
  const wz = perlin2(x * frequency + 37.13, z * frequency - 11.71, seed + 9013);
  out[0] = x + wx * strength;
  out[1] = z + wz * strength;
}

// ---------------------------------------------------------------------------
// Analytic landmass primitives. Each returns a signed "field" value in metres
// where positive is above sea level. They are combined with smax/weighted sum
// so islands, gulfs, peninsulas and straits are real 3D volumes, not decals.
// ---------------------------------------------------------------------------

/**
 * Rotated anisotropic gaussian dome. Used for continuous continent seeds: a
 * handful of overlapping domes produce a plausible cratonic mass before any
 * noise is applied.
 */
export function domeField(x, z, cx, cz, radiusX, radiusZ, angle, amplitude) {
  const dx = x - cx;
  const dz = z - cz;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const qx = (dx * ca + dz * sa) / Math.max(1e-3, radiusX);
  const qz = (-dx * sa + dz * ca) / Math.max(1e-3, radiusZ);
  const d2 = qx * qx + qz * qz;
  return amplitude * Math.exp(-d2 * 1.15);
}

/** Smooth metaball strength (supports negative amplitude for basins/gulfs). */
export function metaballField(x, z, balls) {
  let sum = 0;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    const dx = x - b.x;
    const dz = z - b.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > b.reach * b.reach) continue;
    sum += b.amplitude * Math.exp(-d2 / (b.radius * b.radius));
  }
  return sum;
}

/**
 * Continents and islands generated from a seeded point set. Used for the
 * "islands / archipelago / gulf" authoring tools so each clicked landmass is a
 * real, deterministic volume that can be re-evaluated by any tile forever.
 */
export function makeLandmassBall(seed, x, z, radius, amplitude, kind = 'island') {
  const squash = 0.55 + hash2(seed, 17, 3) * 0.9;
  const stretch = 0.85 + hash2(seed, 31, 5) * 0.6;
  const angle = hash2(seed, 47, 7) * TAU;
  return {
    seed,
    x,
    z,
    radius,
    amplitude,
    reach: radius * (2.2 + hash2(seed, 59, 11) * 0.9),
    kind,
    squash,
    stretch,
    angle,
    // Lobes let one island be genuinely irregular instead of a circle.
    lobes: Array.from({ length: 3 + ((hash2(seed, 71, 13) * 4) | 0) }, (_, i) => ({
      angle: hash2(seed, 83 + i * 7, 17) * TAU,
      offset: 0.34 + hash2(seed, 89 + i * 7, 19) * 0.62,
      radius: 0.3 + hash2(seed, 97 + i * 7, 23) * 0.42,
      amplitude: 0.55 + hash2(seed, 101 + i * 7, 29) * 0.75,
    })),
  };
}

/** Evaluates a landmass ball including its irregular lobes, in metres. */
export function landmassBallField(landmass, x, z) {
  const dx = x - landmass.x;
  const dz = z - landmass.z;
  const ca = Math.cos(landmass.angle);
  const sa = Math.sin(landmass.angle);
  const qx = (dx * ca + dz * sa) / Math.max(1, landmass.radius * landmass.stretch);
  const qz = (-dx * sa + dz * ca) / Math.max(1, landmass.radius * landmass.squash);
  let field = landmass.amplitude * Math.exp(-(qx * qx + qz * qz) * 1.25);
  for (let i = 0; i < landmass.lobes.length; i++) {
    const lobe = landmass.lobes[i];
    const lx = landmass.x + Math.cos(lobe.angle) * landmass.radius * lobe.offset;
    const lz = landmass.z + Math.sin(lobe.angle) * landmass.radius * lobe.offset;
    const ddx = x - lx;
    const ddz = z - lz;
    const r = landmass.radius * lobe.radius;
    const d2 = (ddx * ddx + ddz * ddz) / Math.max(1, r * r);
    if (d2 > 9) continue;
    field += landmass.amplitude * lobe.amplitude * 0.72 * Math.exp(-d2 * 1.35);
  }
  return field;
}

/**
 * Shoreline "shelf" profile: given a base elevation field, reshape it so the
 * transition from land to abyssal plain follows a real continental shelf ->
 * slope -> rise profile instead of a symmetric noise blob. This is what makes
 * coastlines read as geology, and it is also what gives the ocean simulation a
 * physically sensible bathymetry to shade and break on.
 */
export function continentalProfile(height, shelfWidth, slopeDrop, abyssDepth) {
  if (height >= 0) return height;
  const d = -height;
  // Three-piece profile: gentle shelf, steep slope, flat abyssal plain.
  const shelf = shelfWidth;
  const slope = shelfWidth * 2.4;
  if (d <= shelf) return -d * 0.055;
  const shelfDepth = shelf * 0.055;
  const slopeDepth = slopeDrop;
  if (d <= shelf + slope) {
    const t = (d - shelf) / slope;
    return -(shelfDepth + (slopeDepth - shelfDepth) * (t * t * (3 - 2 * t)));
  }
  const over = (d - shelf - slope) / Math.max(1, shelf * 6);
  return -(slopeDepth + (abyssDepth - slopeDepth) * saturate(over));
}

// ---------------------------------------------------------------------------
// Angle / framing helpers
// ---------------------------------------------------------------------------

export function wrapAngle(angle) {
  let a = angle % TAU;
  if (a < -Math.PI) a += TAU;
  if (a > Math.PI) a -= TAU;
  return a;
}

export function shortestAngleDelta(from, to) {
  return wrapAngle(to - from);
}

/** Physical spacing for a slide whose value is 1..8 in powers of two (2^n metres). */
export function snapToDouble(value) {
  if (!(value > 0)) return 1;
  return Math.pow(2, Math.round(Math.log2(value)));
}
