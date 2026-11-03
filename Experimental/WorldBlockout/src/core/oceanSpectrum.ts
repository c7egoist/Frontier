// Spectral ocean — Tessendorf (2001) directional spectrum with finite-depth dispersion.
//
// Why this and not a scrolling "wave texture": the surface is the inverse FFT of a physically
// derived spectrum over *wave vectors*, so the height field is a real 2.5D surface with correct
// dispersion (long waves travel faster), directionality, choppy crests and a foam Jacobian.
// The spectrum is computed on the CPU (it depends only on wind/depth, so it is upload-once),
// then each frame the GPU evaluates h(k,t) = h0(k) e^{i w t} + h0*(-k) e^{-i w t} and transforms.
//
// Conventions: metres, seconds, gravity 9.81, y up, world XZ plane.
// Sign convention matches Tessendorf 2001 for h0 and the dispersion term.

import { FFT2D, synthesizeField, waveNumber } from './fft.ts';

export const GRAVITY = 9.81;

export interface OceanParams {
  /** Dominant wind speed at 10 m, m/s. */
  windSpeed: number;
  /** Full wind direction in radians (0 = +X, PI/2 = +Z). */
  windDirection: number;
  /** Wind alignment exponent: 2 = wide spread, larger = narrowly aligned chop. */
  windExponent: number;
  /** Global amplitude multiplier. */
  amplitude: number;
  /** Shortest wave kept, as a fraction of tile / N (small wave filtering). */
  shortWaveCutoff: number;
  /** Wave age / fetch indicator used for the low frequency cutoff (1 = fully developed sea). */
  waveAge: number;
  /** Choppiness of horizontal displacement. */
  choppiness: number;
  /** Water depth in metres for dispersion; large = deep water. */
  depth: number;
}

export const DEFAULT_OCEAN: OceanParams = {
  windSpeed: 11,
  windDirection: 0.6,
  windExponent: 2.4,
  amplitude: 1,
  shortWaveCutoff: 0.02,
  waveAge: 1,
  choppiness: 1.15,
  depth: 200,
};

export interface CascadeConfig {
  /** Tile length in metres. */
  tile: number;
  /** Resolution (power of two). */
  size: number;
  /** Spectrum seed. */
  seed: number;
  /** Grid rotation (radians), used so cascades do not tile-align with each other. */
  rotation: number;
  /** World-space offset applied when sampling (metres, perturbed by camera to hide tiling). */
  jitterScale: number;
}

export interface SpectrumCascade {
  cfg: CascadeConfig;
  fft: FFT2D;
  /** h0(k) real / imag, index = kz * n + kx (wrapped). */
  h0Re: Float32Array;
  h0Im: Float32Array;
  /** Frequency omega per texel (rad / s) including finite depth. */
  omega: Float32Array;
  /** |k| per texel, rad / m. */
  kmag: Float32Array;
  /** k̂ per texel (unit wave vector), for choppy displacement. */
  kdirX: Float32Array;
  kdirZ: Float32Array;
  /** Phillips spectrum per texel, kept for diagnostics and CSV evidence. */
  phillips: Float32Array;
  totalEnergy: number;
  /** Amplitude calibration so the cascade carries its share of the target sea state. */
  scale: number;
  /** Target significant wave height for this cascade (m). */
  targetHs: number;
  /** Achieved significant wave height before calibration (m). */
  rawHs: number;
}

/** Gaussian pair, Box-Muller from a deterministic 32-bit generator. */
function makeRng(seed: number) {
  let s = (seed >>> 0) || 1;
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    let u1 = s / 4294967296;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    let u2 = s / 4294967296;
    if (u1 <= 1e-12) u1 = 1e-12;
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  };
}

/**
 * Phillips spectrum P(k), m^4 (Philips 1957 / Tessendorf 2001):
 *   P(k) = A * exp(-1/(k L)^2) / k^4 * |k_hat . w_hat|^alpha * exp(-k^2 l^2)
 * L = U^2/g is the largest wave the wind sustains, l = L * shortWaveCutoff filters capillary chop.
 */
export function phillipsSpectrum(kx: number, kz: number, p: OceanParams): number {
  const k2 = kx * kx + kz * kz;
  if (k2 < 1e-12) return 0;
  const k = Math.sqrt(k2);
  const L = ((p.windSpeed * p.windSpeed) / GRAVITY) * p.waveAge;
  const wx = Math.cos(p.windDirection), wz = Math.sin(p.windDirection);
  const dir = (kx / k) * wx + (kz / k) * wz;
  const dirTerm = Math.pow(Math.abs(dir), p.windExponent);
  const l = L * p.shortWaveCutoff;
  const shortFilter = Math.exp(-k2 * l * l);
  const longFilter = Math.exp(-1 / Math.max(k2 * L * L, 1e-9));
  return (p.amplitude * longFilter * dirTerm * shortFilter) / (k2 * k2);
}

/** deep water: w = sqrt(g k); finite depth: w = sqrt(g k tanh(k d)). */
export function dispersion(k: number, depth: number): number {
  if (k < 1e-9) return 0;
  return Math.sqrt(GRAVITY * k * Math.tanh(k * Math.max(depth, 0.01)));
}

/**
 * Build one cascade's initial spectrum. h0 is derived from the Phillips spectrum with complex
 * Gaussian coefficients; a deterministic RNG keeps cascades reproducible across reloads.
 */
export function buildCascade(cfg: CascadeConfig, p: OceanParams, existing?: SpectrumCascade): SpectrumCascade {
  const n = cfg.size;
  const fft = existing?.fft ?? new FFT2D(n);
  const h0Re = existing?.h0Re ?? new Float32Array(n * n);
  const h0Im = existing?.h0Im ?? new Float32Array(n * n);
  const omega = existing?.omega ?? new Float32Array(n * n);
  const kmag = existing?.kmag ?? new Float32Array(n * n);
  const kdirX = existing?.kdirX ?? new Float32Array(n * n);
  const kdirZ = existing?.kdirZ ?? new Float32Array(n * n);
  const phillips = existing?.phillips ?? new Float32Array(n * n);

  const rng = makeRng(cfg.seed);
  let energy = 0;
  // Variance normalisation: sum of P(k) over the grid gives the surface variance.
  // We fill h0 for all texels, but each conjugate pair only needs one sample; fill both
  // consistently via h0(-k) = conj(h0(k)) by evaluating the same random draws.
  const h0rTmp = new Float32Array(n * n);
  const h0iTmp = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const [kx, kz] = waveNumber(ix, iz, n, cfg.tile);
      const k = Math.hypot(kx, kz);
      kmag[i] = k;
      omega[i] = dispersion(k, p.depth);
      const inv = k > 1e-9 ? 1 / k : 0;
      kdirX[i] = kx * inv;
      kdirZ[i] = kz * inv;
      const P = phillipsSpectrum(kx, kz, p);
      // Scale so the spectrum integrates to a reasonable surface height for this wind speed.
      // P already contains 1/k^4; the grid measure is dk^2 = (2pi/L)^2.
      const dkx = (2 * Math.PI) / cfg.tile;
      const scaled = P * dkx * dkx;
      phillips[i] = scaled;
      energy += scaled;
      const amp = Math.sqrt(scaled * 0.5);
      h0rTmp[i] = rng() * amp;
      h0iTmp[i] = rng() * amp;
    }
  }
  // Enforce Hermitian symmetry: h0(-k) = conj(h0(k)).
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const jx = (n - ix) & (n - 1), jz = (n - iz) & (n - 1);
      const j = jz * n + jx;
      h0Re[i] = h0rTmp[i];
      h0Im[i] = h0iTmp[i];
      if (j !== i) {
        h0Re[j] = h0rTmp[i];
        h0Im[j] = -h0iTmp[i];
      }
    }
  }
  return { cfg, fft, h0Re, h0Im, omega, kmag, kdirX, kdirZ, phillips, totalEnergy: energy, scale: 1, targetHs: 0, rawHs: 0 };
}

/** RMS surface height implied by the spectrum; used to calibrate wave height readouts. */
export function spectrumRms(c: SpectrumCascade): number {
  // For a zero-mean Gaussian surface, variance = sum over half the modes of |h0|^2.
  let v = 0;
  const n = c.cfg.size;
  for (let i = 0; i < n * n; i++) v += c.h0Re[i] * c.h0Re[i] + c.h0Im[i] * c.h0Im[i];
  return Math.sqrt(v);
}

/**
 * CPU reference evaluation of the time-dependent spectrum (matches shaders/ocean/spectrum.wgsl):
 *   h(k,t)  = h0(k) e^{i w t} + conj(h0(-k)) e^{-i w t}
 *   Dx(k,t) = -i (kx/k) h(k,t) * choppiness        (horizontal displacement, Tessendorf)
 *   Dz(k,t) = -i (kz/k) h(k,t) * choppiness
 * Spatial fields are the inverse transforms; slopes are spectral derivatives of h.
 */
export interface TimeStepResult {
  size: number;
  tile: number;
  height: Float32Array;
  dispX: Float32Array;
  dispZ: Float32Array;
  slopeX: Float32Array;
  slopeZ: Float32Array;
  jacobian: Float32Array;
}

function ifftReal(c: SpectrumCascade, re: Float64Array, im: Float64Array, out: Float32Array) {
  c.fft.transform(re, im, true);
  for (let i = 0; i < out.length; i++) out[i] = re[i];
}

export function evaluateCascadeCPU(c: SpectrumCascade, time: number, choppiness = 1): TimeStepResult {
  const n = c.cfg.size;
  const N = n * n;
  const hRe = new Float64Array(N), hIm = new Float64Array(N);
  const dxRe = new Float64Array(N), dxIm = new Float64Array(N);
  const dzRe = new Float64Array(N), dzIm = new Float64Array(N);
  const sxRe = new Float64Array(N), sxIm = new Float64Array(N);
  const szRe = new Float64Array(N), szIm = new Float64Array(N);

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const jx = (n - ix) & (n - 1), jz = (n - iz) & (n - 1);
      const j = jz * n + jx;
      const t = c.omega[i] * time;
      const cw = Math.cos(t), sw = Math.sin(t);

      // a = h0(k) * e^{+iwt}
      const ar = c.h0Re[i] * cw - c.h0Im[i] * sw;
      const ai = c.h0Re[i] * sw + c.h0Im[i] * cw;
      const sc = c.scale;
      // b = conj(h0(-k)) * e^{-iwt}
      const br = c.h0Re[j] * cw + c.h0Im[j] * sw;
      const bi = -c.h0Re[j] * sw + c.h0Im[j] * cw;

      const hr = (ar + br) * sc, hi = (ai + bi) * sc;
      hRe[i] = hr; hIm[i] = hi;

      const kx = c.kdirX[i] * c.kmag[i];
      const kz = c.kdirZ[i] * c.kmag[i];
      const kn = c.kmag[i];

      // D = -i k_hat h * choppy  =>  (-i * k_hat) * h
      const kxh = kn > 1e-9 ? kx / kn : 0, kzh = kn > 1e-9 ? kz / kn : 0;
      dxRe[i] = (hi * kxh) * choppiness;      // Re(-i a h) = Im(h) * a
      dxIm[i] = (-hr * kxh) * choppiness;
      dzRe[i] = (hi * kzh) * choppiness;
      dzIm[i] = (-hr * kzh) * choppiness;

      // slopes: d/dx h = i kx h  => Re = -kx hi, Im = kx hr
      sxRe[i] = -kx * hi; sxIm[i] = kx * hr;
      szRe[i] = -kz * hi; szIm[i] = kz * hr;
    }
  }

  const height = new Float32Array(N);
  const dispX = new Float32Array(N);
  const dispZ = new Float32Array(N);
  const slopeX = new Float32Array(N);
  const slopeZ = new Float32Array(N);
  ifftReal(c, hRe, hIm, height);
  ifftReal(c, dxRe, dxIm, dispX);
  ifftReal(c, dzRe, dzIm, dispZ);
  ifftReal(c, sxRe, sxIm, slopeX);
  ifftReal(c, szRe, szIm, slopeZ);

  // Horizontal displacement derivatives for the Jacobian (finite differences on the tile).
  const d = 1;
  const jacobian = new Float32Array(N);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const ipx = iz * n + ((ix + d) & (n - 1));
      const imx = iz * n + ((ix - d) & (n - 1));
      const ipz = ((iz + d) & (n - 1)) * n + ix;
      const imz = ((iz - d) & (n - 1)) * n + ix;
      const ddx = (dispX[ipx] - dispX[imx]) / (2 * d * (c.cfg.tile / n));
      const ddz = (dispZ[ipz] - dispZ[imz]) / (2 * d * (c.cfg.tile / n));
      jacobian[i] = (1 + ddx) * (1 + ddz);
    }
  }
  return { size: n, tile: c.cfg.tile, height, dispX, dispZ, slopeX, slopeZ, jacobian };
}

/**
 * Fully developed sea significant wave height from wind speed (empirical, WMO-ish):
 *   Hs ~= 0.21 U^2 / g  (U at 10 m). Used only to set the *amount* of energy; the shape of the
 * spectrum stays Phillips. Calibration measures the actual field variance by FFT so that the
 * resulting Hs matches the target regardless of grid resolution or tile size.
 */
export function significantWaveHeight(windSpeed: number): number {
  return (0.21 * windSpeed * windSpeed) / GRAVITY;
}

/**
 * Distribute the sea state across cascades. Long tiles carry swell, short tiles carry chop;
 * variance is additive, so weights are applied to sigma^2.
 */
export function calibrateCascades(c: SpectrumCascade[], windSpeed: number, weights?: number[]): SpectrumCascade[] {
  const hs = significantWaveHeight(windSpeed);
  const w = weights ?? c.map((_, i) => Math.pow(0.45, i));
  const wsum = w.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < c.length; i++) {
    const cascade = c[i];
    const targetSigma = (hs / 4) * Math.sqrt(w[i] / wsum);
    // Measure the raw field at t=0 (same synthesis the shader performs).
    const n = cascade.cfg.size;
    const re = new Float64Array(n * n), im = new Float64Array(n * n);
    for (let k = 0; k < n * n; k++) { re[k] = cascade.h0Re[k]; im[k] = cascade.h0Im[k]; }
    cascade.fft.transform(re, im, true);
    let sum = 0;
    for (let k = 0; k < n * n; k++) sum += re[k] * re[k];
    const rawSigma = Math.sqrt(sum / (n * n));
    const scale = rawSigma > 1e-12 ? targetSigma / rawSigma : 1;
    cascade.scale = scale;
    cascade.targetHs = targetSigma * 4;
    cascade.rawHs = rawSigma * 4;
  }
  return c;
}

export function makeCascades(tiles: number[], size: number, baseSeed = 12345, p: OceanParams = DEFAULT_OCEAN): SpectrumCascade[] {
  const chains = tiles.map((tile, i) =>
    buildCascade(
      { tile, size, seed: baseSeed + i * 7919, rotation: i === 0 ? 0 : i * 0.7, jitterScale: 1 },
      p,
    ),
  );
  return calibrateCascades(chains, p.windSpeed);
}
