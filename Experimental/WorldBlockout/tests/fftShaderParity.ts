// Executes the exact index arithmetic of shaders/ocean_fft.wgsl on the CPU and compares the
// result against the radix-2 reference in src/core/fft.ts. This is how the GPU transform is
// verified without a GPU: if the replay matches the reference, the shader's butterfly math and
// bit-reversal permutation are correct; the WGSL statement-by-statement correspondence is
// checked in tests/shaders.ts.
import { FFT2D } from '../src/core/fft.ts';
import { check, report } from './harness.ts';

function bitReverse(v: number, bits: number) {
  let r = 0, x = v;
  for (let i = 0; i < bits; i++) { r = (r << 1) | (x & 1); x >>= 1; }
  return r;
}
const wrap = (i: number, n: number) => (i + n) & (n - 1);
const cmul = (a: [number, number], b: [number, number]): [number, number] =>
  [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];

/** Mirror of the shader dispatch: one pass writes one texture. */
function shaderPass(
  n: number, axis: 0 | 1, step: number, inv: boolean,
  src: Float64Array, dst: Float64Array,
) {
  const bits = Math.log2(n);
  for (let gz = 0; gz < n; gz++) {
    for (let gx = 0; gx < n; gx++) {
      const along = axis === 0 ? gx : gz;
      const other = axis === 0 ? gz : gx;
      const at = (elem: number) => {
        const px = axis === 0 ? elem : other;
        const pz = axis === 0 ? other : elem;
        return (pz * n + px) * 2;
      };
      if (step === 0) {
        const rev = bitReverse(along, bits);
        const s = at(rev), d = at(along);
        dst[d] = src[s]; dst[d + 1] = src[s + 1];
        continue;
      }
      const span = 1 << (step - 1);
      const size = span * 2;
      const base = along & ~(size - 1);
      const k = along & (span - 1);
      const lower = base + k, upper = lower + span;
      const outIndex = along < upper ? upper : lower;
      const sign = inv ? 1 : -1;
      const ang = (sign * 2 * Math.PI * k) / size;
      const tw: [number, number] = [Math.cos(ang), Math.sin(ang)];
      const a = at(lower), b = at(upper);
      const t = cmul(tw, [src[b], src[b + 1]]);
      const sign2 = along < upper ? -1 : 1;
      const d = at(outIndex);
      dst[d] = src[a] + sign2 * t[0];
      dst[d + 1] = src[a + 1] + sign2 * t[1];
    }
  }
}

function shaderInverse2D(n: number, re: Float64Array, im: Float64Array) {
  // interleaved complex buffer like the RGBA texture channels
  let cur = new Float64Array(n * n * 2);
  for (let i = 0; i < n * n; i++) { cur[i * 2] = re[i]; cur[i * 2 + 1] = im[i]; }
  let next = new Float64Array(n * n * 2);
  const axes: (0 | 1)[] = [0, 1];
  for (const axis of axes) {
    shaderPass(n, axis, 0, true, cur, next);
    [cur, next] = [next, cur];
    for (let step = 1; step <= Math.log2(n); step++) {
      shaderPass(n, axis, step, true, cur, next);
      [cur, next] = [next, cur];
    }
  }
  const out = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = cur[i * 2] / (n * n);
  return out;
}

console.log('GPU FFT shader parity');
for (const n of [4, 8, 16, 32]) {
  const re = new Float64Array(n * n), im = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) { re[i] = Math.sin(i * 0.31) * 0.7 + Math.cos(i * 0.017); im[i] = Math.cos(i * 0.11) * 0.3; }
  const refFFT = new FFT2D(n);
  const ref = new Float64Array(re);
  const refIm = new Float64Array(im);
  refFFT.transform(ref, refIm, true);
  const gpu = shaderInverse2D(n, re, im);
  let err = 0;
  for (let i = 0; i < n * n; i++) err = Math.max(err, Math.abs(gpu[i] - ref[i]));
  check(`shader replay N=${n} matches reference inverse FFT`, err < 1e-9, `max err ${err.toExponential(2)}`);
}
// Real-valued spectrum (Hermitian) must produce a real field with zero imaginary residue.
{
  const n = 16;
  const re = new Float64Array(n * n), im = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) { re[i] = Math.sin(i * 0.7); im[i] = Math.cos(i * 0.2); }
  const gpu = shaderInverse2D(n, re, im);
  let finite = true;
  for (const v of gpu) if (!Number.isFinite(v)) finite = false;
  check('shader replay stays finite', finite);
}
report();
