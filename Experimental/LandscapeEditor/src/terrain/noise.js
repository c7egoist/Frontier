// Seeded noise primitives. Everything is deterministic for a given seed, so a layer stack always
// reproduces the same landscape. All functions take coordinates in noise space (not cells).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a 512-entry permutation table and a 256-entry table of unit gradient vectors from a seed.
function makeTables(seed) {
  const rng = mulberry32(seed);
  const p = new Uint16Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint16Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rng() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  return { perm, gx, gy };
}

const cache = new Map();
export function noiseTables(seed) {
  const key = seed >>> 0;
  let t = cache.get(key);
  if (!t) {
    t = makeTables(key);
    if (cache.size > 32) cache.clear();
    cache.set(key, t);
  }
  return t;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Gradient noise in roughly [-1, 1].
export function perlin2(tables, x, y) {
  const { perm, gx, gy } = tables;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const X = xi & 255;
  const Y = yi & 255;
  const g00 = perm[perm[X] + Y];
  const g10 = perm[perm[X + 1] + Y];
  const g01 = perm[perm[X] + Y + 1];
  const g11 = perm[perm[X + 1] + Y + 1];
  const d00 = gx[g00] * xf + gy[g00] * yf;
  const d10 = gx[g10] * (xf - 1) + gy[g10] * yf;
  const d01 = gx[g01] * xf + gy[g01] * (yf - 1);
  const d11 = gx[g11] * (xf - 1) + gy[g11] * (yf - 1);
  const u = fade(xf);
  const v = fade(yf);
  const a = d00 + (d10 - d00) * u;
  const b = d01 + (d11 - d01) * u;
  return (a + (b - a) * v) * 1.4142;
}

export function fbm(tables, x, y, octaves = 5, gain = 0.5, lacunarity = 2) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin2(tables, fx, fy);
    norm += amp;
    amp *= gain;
    fx = fx * lacunarity + 17.1;
    fy = fy * lacunarity + 9.7;
  }
  return norm ? sum / norm : 0;
}

// Ridged multifractal (Musgrave). Sharp crests where the noise crosses zero; `weight` feeds detail into crests only.
export function ridged(tables, x, y, octaves = 6, gain = 2, lacunarity = 2, offset = 1) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let weight = 1;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    let s = offset - Math.abs(perlin2(tables, fx, fy));
    s *= s;
    s *= weight;
    weight = Math.min(1, Math.max(0, s * gain));
    sum += s * amp;
    norm += amp;
    amp *= 0.5;
    fx = fx * lacunarity + 31.7;
    fy = fy * lacunarity + 4.3;
  }
  return norm ? sum / norm : 0;
}

// Hybrid multifractal (Musgrave). `H` controls roughness: higher H is smoother, lower H is more rugged.
export function hybridMultifractal(tables, x, y, octaves = 6, H = 0.25, lacunarity = 2, offset = 0.7) {
  let fx = x;
  let fy = y;
  let pw = 1;
  const exp = Math.pow(lacunarity, -H);
  let result = (perlin2(tables, fx, fy) + offset) * pw;
  let weight = result;
  fx = fx * lacunarity + 11.3;
  fy = fy * lacunarity + 7.9;
  pw *= exp;
  for (let o = 1; o < octaves; o++) {
    weight = Math.min(1, Math.max(0, weight));
    const signal = (perlin2(tables, fx, fy) + offset) * pw;
    result += weight * signal;
    weight *= signal;
    pw *= exp;
    fx = fx * lacunarity + 11.3;
    fy = fy * lacunarity + 7.9;
  }
  return result;
}

// Hashes an integer lattice point to [0, 1). Used by cellular noise.
function cellHash(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Cellular (Worley) noise. Returns [F1, F2] distances to the nearest and second-nearest feature points.
export function cellular(x, y, seed, jitter = 1) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i;
      const cy = yi + j;
      const px = cx + 0.5 + (cellHash(cx, cy, seed) - 0.5) * jitter;
      const py = cy + 0.5 + (cellHash(cx, cy, seed + 101) - 0.5) * jitter;
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return [f1, f2];
}

// Domain warp (Quilez style): offsets the sample point by two fBm fields, giving organic, non-grid shapes.
export function warpPoint(tables, x, y, amount, octaves = 4) {
  if (!amount) return [x, y];
  const wx = fbm(tables, x + 5.2, y + 1.3, octaves, 0.5);
  const wy = fbm(tables, x + 1.7, y + 9.2, octaves, 0.5);
  return [x + wx * amount, y + wy * amount];
}
