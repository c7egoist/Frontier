import { mulberry32 } from "./rng.js";

// Gradient (Perlin) noise, cellular (Worley) distance, and the fractal sums
// used by the generators. Every sum returns roughly [-1, 1] or [0, 1]; the
// generators normalise the final field, so absolute scale does not matter here.
export function createNoise(seed) {
  const rnd = mulberry32(seed >>> 0);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rnd() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  const perlin = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const X = x0 & 255;
    const Y = y0 & 255;
    const g00 = perm[X + perm[Y]];
    const g10 = perm[X + 1 + perm[Y]];
    const g01 = perm[X + perm[Y + 1]];
    const g11 = perm[X + 1 + perm[Y + 1]];
    const n00 = gx[g00] * fx + gy[g00] * fy;
    const n10 = gx[g10] * (fx - 1) + gy[g10] * fy;
    const n01 = gx[g01] * fx + gy[g01] * (fy - 1);
    const n11 = gx[g11] * (fx - 1) + gy[g11] * (fy - 1);
    const u = fade(fx);
    const v = fade(fy);
    const a = n00 + (n10 - n00) * u;
    const b = n01 + (n11 - n01) * u;
    return (a + (b - a) * v) * 1.4142;
  };

  const hash2 = (ix, iy, salt) => {
    let h =
      (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul((seed ^ salt) | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  // Distance to the nearest jittered feature point (F1), in lattice units.
  const cellular = (x, y, jitter) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    let f1 = 9;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i;
        const cy = yi + j;
        const px = cx + 0.5 + (hash2(cx, cy, 1) - 0.5) * jitter;
        const py = cy + 0.5 + (hash2(cx, cy, 2) - 0.5) * jitter;
        const d = Math.hypot(px - x, py - y);
        if (d < f1) f1 = d;
      }
    }
    return f1;
  };

  return { perlin, cellular, hash2 };
}

export function fbm(n, x, y, octaves, lacunarity, gain) {
  let a = 1;
  let f = 1;
  let s = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * n(x * f, y * f);
    norm += a;
    a *= gain;
    f *= lacunarity;
  }
  return norm > 0 ? s / norm : 0;
}

// Musgrave ridged multifractal: sharp crests where the noise crosses zero.
export function ridged(n, x, y, octaves, lacunarity, gain, sharpness) {
  let a = 1;
  let f = 1;
  let s = 0;
  let norm = 0;
  let w = 1;
  for (let i = 0; i < octaves; i++) {
    let sig = Math.pow(1 - Math.abs(n(x * f, y * f)), sharpness);
    sig *= w;
    w = Math.min(1, Math.max(0, sig * gain));
    s += sig * a;
    norm += a;
    a *= 0.5;
    f *= lacunarity;
  }
  return norm > 0 ? s / norm : 0;
}

// Musgrave hybrid multifractal: rough, eroded-looking detail that grows with height.
export function hybrid(n, x, y, octaves, lacunarity, H, offset) {
  let f = 1;
  let pw = 1;
  let result = 0;
  let weight = 1;
  const step = Math.pow(lacunarity, -H);
  for (let i = 0; i < octaves; i++) {
    const sig = (n(x * f, y * f) + offset) * pw;
    if (i === 0) {
      result = sig;
      weight = sig;
    } else {
      if (weight > 1) weight = 1;
      result += weight * sig;
      weight *= sig;
    }
    f *= lacunarity;
    pw *= step;
  }
  return result;
}

export function billow(n, x, y, octaves, lacunarity, gain) {
  let a = 1;
  let f = 1;
  let s = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    s += a * Math.abs(n(x * f, y * f));
    norm += a;
    a *= gain;
    f *= lacunarity;
  }
  return norm > 0 ? s / norm : 0;
}
