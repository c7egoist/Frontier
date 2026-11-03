// Focused verification for the world/ocean math that the GPU path must match.
// Run: npm test
import { FFT2D } from '../src/core/fft.ts';
import {
  makeCascades, evaluateCascadeCPU, significantWaveHeight, DEFAULT_OCEAN,
} from '../src/core/oceanSpectrum.ts';

let pass = 0, fail = 0;
const results: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; results.push(`  ok   ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; results.push(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function stats(a: Float32Array) {
  let mean = 0, min = Infinity, max = -Infinity;
  for (const v of a) { mean += v; if (v < min) min = v; if (v > max) max = v; }
  mean /= a.length;
  let v = 0;
  for (const x of a) v += (x - mean) * (x - mean);
  return { mean, min, max, std: Math.sqrt(v / a.length) };
}

console.log('FFT');
{
  const fft = new FFT2D(32);
  const n = 32;
  const re = new Float64Array(n * n), im = new Float64Array(n * n);
  const src = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) { src[i] = Math.sin(i * 0.37) + Math.cos((i % n) * 0.91); re[i] = src[i]; }
  fft.transform(re, im, false);
  fft.transform(re, im, true);
  let err = 0;
  for (let i = 0; i < n * n; i++) err = Math.max(err, Math.abs(re[i] - src[i]) + Math.abs(im[i]));
  check('2D inverse round trip', err < 1e-9, `max err ${err.toExponential(2)}`);
}

console.log('Spectrum');
const t0 = Date.now();
const cascades = makeCascades([512, 64, 8], 128, 12345, DEFAULT_OCEAN);
console.log(`  built ${cascades.length} cascades in ${Date.now() - t0} ms`);
{
  const total = cascades.reduce((a, c) => a + (c.targetHs / 4) ** 2, 0);
  const expected = significantWaveHeight(DEFAULT_OCEAN.windSpeed);
  check('target Hs from wind is physical', expected > 1.5 && expected < 4,
    `U=${DEFAULT_OCEAN.windSpeed} m/s -> Hs=${expected.toFixed(2)} m`);
  check('cascades split variance', Math.abs(Math.sqrt(total) * 4 - expected) < 0.05,
    `combined Hs=${(Math.sqrt(total) * 4).toFixed(2)} m`);
  for (const c of cascades) {
    check(`cascade ${c.cfg.tile}m calibration applied`, Number.isFinite(c.scale) && c.scale > 0,
      `raw Hs ${c.rawHs.toFixed(3)} -> ${c.targetHs.toFixed(2)} m, scale ${c.scale.toExponential(2)}`);
  }
}
const step = evaluateCascadeCPU(cascades[0], 12.5, DEFAULT_OCEAN.choppiness);
{
  const h = stats(step.height);
  const hsMeasured = h.std * 4;
  check('time step produces Gaussian-ish surface', Math.abs(h.mean) < 0.05,
    `mean ${h.mean.toFixed(4)} m, std ${h.std.toFixed(3)} m, Hs ${hsMeasured.toFixed(2)} m`);
  check('significant wave height matches calibration', Math.abs(hsMeasured - cascades[0].targetHs) / cascades[0].targetHs < 0.12,
    `${hsMeasured.toFixed(2)} m vs ${cascades[0].targetHs.toFixed(2)} m`);
  const j = stats(step.jacobian);
  check('Jacobian centred on 1 (fold detection)', Math.abs(j.mean - 1) < 0.1, `mean ${j.mean.toFixed(3)}`);
  const steep = Math.atan(stats(step.slopeX).std) * 180 / Math.PI;
  check('surface slope is wave-like, not noise', steep > 1 && steep < 25, `RMS slope ${steep.toFixed(1)} deg`);
}
// Temporal coherence: adjacent frames must be correlated, not random per frame.
{
  const a = evaluateCascadeCPU(cascades[0], 12.4, 1);
  const b = evaluateCascadeCPU(cascades[0], 12.5, 1);
  const c = evaluateCascadeCPU(cascades[0], 30.0, 1);
  const corr = (u: Float32Array, v: Float32Array) => {
    let su = 0, sv = 0, suv = 0;
    for (let i = 0; i < u.length; i++) { su += u[i]; sv += v[i]; suv += u[i] * v[i]; }
    su /= u.length; sv /= v.length;
    let du = 0, dv = 0;
    for (let i = 0; i < u.length; i++) { du += (u[i] - su) ** 2; dv += (v[i] - sv) ** 2; }
    return (suv / u.length - su * sv) / (Math.sqrt(du / u.length) * Math.sqrt(dv / u.length) || 1);
  };
  const near = corr(a.height, b.height);
  const far = corr(a.height, c.height);
  check('waves evolve continuously in time', near > 0.8 && Math.abs(far) < 0.5,
    `corr(0.1 s)=${near.toFixed(3)}, corr(17.5 s)=${far.toFixed(3)}`);
}
// Determinism: same seed = same world.
{
  const again = makeCascades([512], 128, 12345, DEFAULT_OCEAN);
  let same = true;
  for (let i = 0; i < 512 * 512; i++) if (cascades[0].h0Re[i] !== again[0].h0Re[i]) { same = false; break; }
  check('spectrum is deterministic per seed', same);
}

const line = '─'.repeat(72);
console.log(`\n${line}\n${results.join('\n')}\n${line}`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
