// Radix-2 FFT used for: (a) reference CPU ocean synthesis, (b) spectrum verification tests.
// The live ocean runs the same transform on the GPU (shaders/ocean/fft.wgsl); this module is the
// ground truth that the GPU path is checked against.

export class FFT2D {
  readonly n: number;
  private readonly rev: Uint32Array;
  private readonly twRe: Float64Array;
  private readonly twIm: Float64Array;

  constructor(n: number) {
    if ((n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);
    this.n = n;
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.twRe = new Float64Array(n / 2);
    this.twIm = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.twRe[i] = Math.cos((-2 * Math.PI * i) / n);
      this.twIm[i] = Math.sin((-2 * Math.PI * i) / n);
    }
  }

  /** In-place 1D complex transform over strided data. */
  private fft1(re: Float64Array, im: Float64Array, off: number, stride: number, inverse: boolean) {
    const n = this.n, rev = this.rev, twRe = this.twRe, twIm = this.twIm;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        const ia = off + i * stride, ib = off + j * stride;
        let t = re[ia]; re[ia] = re[ib]; re[ib] = t;
        t = im[ia]; im[ia] = im[ib]; im[ib] = t;
      }
    }
    const sgn = inverse ? -1 : 1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = twRe[k * step], wi = sgn * twIm[k * step];
          const a = off + (start + k) * stride;
          const b = off + (start + k + half) * stride;
          const xr = re[b], xi = im[b];
          const tr = xr * wr - xi * wi;
          const ti = xr * wi + xi * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
    if (inverse) {
      const s = 1 / n;
      for (let i = 0; i < n; i++) { re[off + i * stride] *= s; im[off + i * stride] *= s; }
    }
  }

  /** 2D transform, rows then columns. Arrays must be n*n. */
  transform(re: Float64Array, im: Float64Array, inverse = false) {
    const n = this.n;
    for (let r = 0; r < n; r++) this.fft1(re, im, r * n, 1, inverse);
    for (let c = 0; c < n; c++) this.fft1(re, im, c, n, inverse);
  }
}

/** Spectrum layout matching the GPU: index = z * N + x, frequency index wrapped. */
export function freqIndex(i: number, n: number): number {
  const h = i & (n - 1);
  return h < n / 2 ? h : h - n;
}

/** Wavenumber vector for spectrum-layout index (rad / m). */
export function waveNumber(ix: number, iz: number, n: number, tile: number): [number, number] {
  const k = (2 * Math.PI) / tile;
  return [freqIndex(ix, n) * k, freqIndex(iz, n) * k];
}

/**
 * Real-field synthesis: given a Hermitian spectrum H(k) in wrapped layout,
 * produce the spatial field f(x) = sum_k H(k) e^{i k x}. The result is the real part.
 */
export function synthesizeField(
  fft: FFT2D,
  hRe: Float64Array,
  hIm: Float64Array,
  out: Float32Array,
  scale = 1,
) {
  const n = fft.n;
  const re = new Float64Array(hRe);
  const im = new Float64Array(hIm);
  fft.transform(re, im, true);
  for (let i = 0; i < n * n; i++) out[i] = re[i] * scale;
}
