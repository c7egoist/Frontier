// Deterministic noise, RNG and the analytic world functions shared between JS and GLSL.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.f = mulberry32(seed); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
}

function hash2(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise in [0,1]; period > 0 makes it tileable. */
export function valueNoise(x, y, seed = 0, period = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = fade(x - x0), fy = fade(y - y0);
  const wrap = (v) => (period > 0 ? ((v % period) + period) % period : v);
  const a = hash2(wrap(x0), wrap(y0), seed);
  const b = hash2(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(x, y, oct = 4, seed = 0, period = 0) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise(x * f, y * f, seed + i * 17, period ? period * f : 0);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return s / norm;
}

// ---------------------------------------------------------------------------
// Terrain height. MUST stay identical to `terrainHeightGLSL` below.
export function terrainHeight(x, z) {
  return (
    2.4 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 + 0.4) +
    1.1 * Math.sin(x * 0.047 - z * 0.039 + 2.0) +
    0.35 * Math.sin(x * 0.11 + z * 0.09) * Math.sin(z * 0.13 - 1.0)
  );
}
export const terrainHeightGLSL = /* glsl */ `
float terrainH(vec2 p){
  return 2.4*sin(p.x*0.021+1.3)*cos(p.y*0.017+0.4)
       + 1.1*sin(p.x*0.047-p.y*0.039+2.0)
       + 0.35*sin(p.x*0.11+p.y*0.09)*sin(p.y*0.13-1.0);
}`;

// ---------------------------------------------------------------------------
// Wind. Same maths in JS and GLSL so CPU-animated predators sway with the decoys.
export const WIND_DIR = [0.8, 0.6];
export function windValue(x, z, t) {
  return (
    Math.sin(t * 1.25 + x * 0.21 + z * 0.17) +
    0.45 * Math.sin(t * 2.3 + x * 0.5 - z * 0.43)
  );
}
export const windGLSL = /* glsl */ `
float windValue(vec2 p, float t){
  return sin(t*1.25 + p.x*0.21 + p.y*0.17) + 0.45*sin(t*2.3 + p.x*0.5 - p.y*0.43);
}`;

// Sway amplitude (metres) for a point at height y of a plant of height H.
export function swayAmp(y, H) {
  const k = Math.max(0, y / H);
  return k * k * H * 0.035;
}
