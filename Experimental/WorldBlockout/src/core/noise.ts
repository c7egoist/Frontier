// Deterministic gradient noise (2D/3D) for world-shape fields.
// Pure TS so the same field is reproducible in tests, workers and the editor.

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export class Noise {
  readonly perm = new Uint8Array(512);
  readonly permMod12 = new Uint8Array(512);
  readonly seed: number;

  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // xorshift32 shuffle
    let s = this.seed || 1;
    const rnd = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise2(xin: number, yin: number): number {
    const perm = this.perm, pm = this.permMod12;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const X0 = i - t, Y0 = j - t;
    const x0 = xin - X0, y0 = yin - Y0;
    let i1 = 0, j1 = 1;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi = pm[ii + perm[jj]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi = pm[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi = pm[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  noise3(xin: number, yin: number, zin: number): number {
    const perm = this.perm, pm = this.permMod12;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const gi = pm[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0 + GRAD3[gi + 2] * z0);
    }
    let t1 = 0.6 - (x0 - i1 + G3) ** 2 - (y0 - j1 + G3) ** 2 - (z0 - k1 + G3) ** 2;
    if (t1 > 0) {
      const gi = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD3[gi] * (x0 - i1 + G3) + GRAD3[gi + 1] * (y0 - j1 + G3) + GRAD3[gi + 2] * (z0 - k1 + G3));
    }
    let t2 = 0.6 - (x0 - i2 + 2 * G3) ** 2 - (y0 - j2 + 2 * G3) ** 2 - (z0 - k2 + 2 * G3) ** 2;
    if (t2 > 0) {
      const gi = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD3[gi] * (x0 - i2 + 2 * G3) + GRAD3[gi + 1] * (y0 - j2 + 2 * G3) + GRAD3[gi + 2] * (z0 - k2 + 2 * G3));
    }
    let t3 = 0.6 - (x0 - 1 + 3 * G3) ** 2 - (y0 - 1 + 3 * G3) ** 2 - (z0 - 1 + 3 * G3) ** 2;
    if (t3 > 0) {
      const gi = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (GRAD3[gi] * (x0 - 1 + 3 * G3) + GRAD3[gi + 1] * (y0 - 1 + 3 * G3) + GRAD3[gi + 2] * (z0 - 1 + 3 * G3));
    }
    return 32 * (n0 + n1 + n2 + n3);
  }

  /** Fractal Brownian motion, normalised to roughly [-1, 1]. */
  fbm2(x: number, y: number, octaves = 6, lacunarity = 2, gain = 0.5): number {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += a * this.noise2(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal, output ~[0,1]; great for mountain chains. */
  ridged2(x: number, y: number, octaves = 6, lacunarity = 2.02, gain = 0.5): number {
    let a = 0.5, f = 1, sum = 0, norm = 0, prev = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise2(x * f, y * f));
      n *= n;
      n *= prev;
      prev = n;
      sum += n * a;
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return sum / (norm || 1);
  }

  /** Billowed noise, output ~[0,1]; soft rolling hills, dunes, seabed. */
  billow2(x: number, y: number, octaves = 5): number {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += a * Math.abs(this.noise2(x * f, y * f));
      norm += a;
      a *= 0.5;
      f *= 2.01;
    }
    return sum / norm;
  }

  /** Warped coordinates: p' = p + warp * fbm(p). */
  warp2(x: number, y: number, warp: number, freq = 0.5, octaves = 3): [number, number] {
    const wx = this.fbm2(x * freq + 11.3, y * freq - 4.7, octaves);
    const wy = this.fbm2(x * freq - 7.1, y * freq + 19.2, octaves);
    return [x + warp * wx, y + warp * wy];
  }
}

export const defaultNoise = new Noise(1337);
