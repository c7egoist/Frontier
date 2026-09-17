// Numeric validation of the column-sim physics (ports of the WGSL math in
// src/shaders/sim.ts). Verifies: field energy stays bounded (CFL), waves
// actually propagate, wind forcing reaches a sane equilibrium, and the AMR
// scoring separates calm vs steep regions.
const G = 9.81;
const PI = Math.PI;

const hash21 = (x: number, y: number): number => {
  let qx = (x * 123.34) % 1; qx = qx < 0 ? qx + 1 : qx;
  let qy = (y * 456.21) % 1; qy = qy < 0 ? qy + 1 : qy;
  const d = qx * (qy + 45.32) + qy * (qx + 45.32);
  let q = (d + 45.32) % 1; q = q < 0 ? q + 1 : q;
  return (qx * qy * 97.13) % 1; // rough stand-in, not shader-identical (fine for stats)
};

// deterministic pseudo-noise for testing
let seedState = 12345;
const rnd = () => {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
};

const waveSpeed = (d: number) => Math.sqrt(G * d);

// sea-state regulation: target rms height per cascade (m), wind scaled to hold it
const TARGET_RMS: Record<string, number> = { near: 0.28, mid: 0.45, far: 0.6 };
const BASE_WIND = 0.5;

interface Cfg { size: number; res: number; depthEff: number; damping: number; diffusion: number; }

function initField(cfg: Cfg): { h: Float32Array; hv: Float32Array } {
  const N = cfg.res;
  const h = new Float32Array(N * N);
  const hv = new Float32Array(N * N);
  const c = waveSpeed(cfg.depthEff);
  const lMax = cfg.size * 0.30;
  const lMin = Math.max(cfg.size / N, 1) * 4;
  const nBands = Math.floor(Math.log(lMax / lMin) / Math.log(1 / 0.62)) + 1;
  const dxc0 = cfg.size / cfg.res;
  for (let i = 0; i < Math.min(nBands, 6); i++) {
    // snap to integer wavenumbers (m,n) cycles per domain: the discrete sums
    // of sin/cos then factorize to exactly zero => field starts mean-free
    const lambda0 = lMax * Math.pow(0.62, i);
    const lc = Math.max(4, Math.round(lambda0 / dxc0)); // wavelength in cells
    const ang = (i * 2.399963) % (2 * PI); // deterministic golden-angle headings
    let m = Math.round((N * Math.cos(ang)) / lc);
    let n = Math.round((N * Math.sin(ang)) / lc);
    if (m === 0 && n === 0) n = 1;
    const kx = (2 * PI * m) / N, kz = (2 * PI * n) / N;
    const kk = Math.hypot(kx, kz);
    const k = kk; // snapped wavenumber magnitude
    const amp = 0.62 * Math.pow(0.62, i);
    const omega = c * kk;
    const ph0 = rnd() * 2 * PI;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const phase = kx * x + kz * z + ph0;
        const idx = z * N + x;
        h[idx] += amp * Math.sin(phase);
        hv[idx] += amp * omega * Math.cos(phase);
      }
    }
  }
  return { h, hv };
}

function step(cfg: Cfg, st: { h: Float32Array; hv: Float32Array }, dt: number, windAmp: number, time: number, dampBoost = 0): number {
  const N = cfg.res;
  const c = waveSpeed(cfg.depthEff);
  const alpha = (c * dt * N) / cfg.size;
  const { h, hv } = st;
  const hNew = new Float32Array(N * N);
  const hvNew = new Float32Array(N * N);
  let maxH = 0;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const i = z * N + x;
      const xl = z * N + ((x - 1 + N) % N), xr = z * N + ((x + 1) % N);
      const zu = ((z - 1 + N) % N) * N + x, zd = ((z + 1) % N) * N + x;
      const lap = h[xl] + h[xr] + h[zu] + h[zd] - 4 * h[i];
      let v = hv[i] + (alpha * alpha / dt) * lap; // wave eq needs dt*c^2*lap/dx^2
      v *= Math.exp(-(cfg.damping + dampBoost) * dt);
      // wind: Laplacian of a deterministic noise potential (zero spatial mean
      // on the torus — matches the shader's forcing)
      const pot = (xx: number, zz: number) => {
        const a = Math.sin(xx * 12.9898 + zz * 78.233 + time * 3.7) * 43758.5453;
        return a - Math.floor(a);
      };
      const pot2 = (xx: number, zz: number) => {
        const a = Math.sin((xx + 31.7) * 5.877 + (zz + 11.3) * 9.123 + time * 1.9) * 27142.7;
        return a - Math.floor(a);
      };
      const wlap = pot(x + 2, z) - pot(x - 2, z) + pot(x, z + 2) - pot(x, z - 2);
      const wlap2 = pot2(x + 6, z) - pot2(x - 6, z) + pot2(x, z + 6) - pot2(x, z - 6);
      v += dt * windAmp * 2.6 * (wlap + 1.2 * wlap2);
      let hh = h[i] + dt * v;
      const havg = 0.25 * (h[xl] + h[xr] + h[zu] + h[zd]);
      hh += (havg - hh) * cfg.diffusion;
      hNew[i] = hh; hvNew[i] = v;
      maxH = Math.max(maxH, Math.abs(hh));
    }
  }
  st.h = hNew; st.hv = hvNew;
  void time;
  return maxH;
}

function meanOf(arr: Float32Array): number {
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function rms(arr: Float32Array): number {
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s / arr.length);
}

// --- run scenarios -----------------------------------------------------------
const NEAR: Cfg = { size: 96, res: 128, depthEff: 12, damping: 0.015, diffusion: 0.008 };
const MID: Cfg = { size: 640, res: 256, depthEff: 40, damping: 0.018, diffusion: 0.008 };
const FINE: Cfg = { size: 96, res: 256, depthEff: 12, damping: 0.022, diffusion: 0.013 };

let ok = true;
function check(name: string, cond: boolean, detail: string): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!cond) ok = false;
}

for (const [name, cfg, dt] of [
  ['near L0', NEAR, 1 / 60], ['mid', MID, 1 / 60], ['near fine', FINE, 1 / 120],
] as [string, Cfg, number][]) {
  // (a) regulated run: 90 s; the plant's growth time is ~30 s, so initialize
  // the wind at its steady estimate and judge only the last 30 s (tail mean)
  const st = initField(cfg);
  const rms0 = rms(st.h);
  let bounded = true;
  const total = 5400; // 90 s
  const trace: number[] = [];
  const tgt0 = cfg.depthEff > 100 ? TARGET_RMS.far : cfg.depthEff > 30 ? TARGET_RMS.mid : TARGET_RMS.near;
  let regWind = BASE_WIND * Math.max(0.05, Math.min(2.5, tgt0 / Math.max(rms0, 0.05)));
  let rSm = rms(st.h);
  const rSmSamples: number[] = [];
  let lastBoost = 0;
  for (let f = 0; f < total; f++) {
    const tgt = tgt0;
    const r0 = rms(st.h);
    rSm += (r0 - rSm) * 0.02; // envelope smoothing: control the swell groups, not individual crests
    const windWanted = BASE_WIND * Math.max(0.05, Math.min(2.5, tgt / Math.max(rSm, 0.05)));
    const boostWanted = 0.6 * Math.max(0, rSm / (tgt * 1.3) - 1.0); // brake only genuinely oversize seas
    lastBoost = boostWanted;
    regWind += (windWanted - regWind) * 0.02;
    const maxH = step(cfg, st, dt, regWind, f / 60, boostWanted);
    if (!isFinite(maxH) || maxH > 40) { bounded = false; break; }
    if (f % 900 === 0) trace.push(rSm);
    if (f >= total - 1800) rSmSamples.push(rSm);
  }
  if (name === 'near L0') console.log(`   [rms trace] ${trace.map(v => v.toFixed(2)).join(' -> ')} (wind ends ${regWind.toFixed(2)}, boost ${lastBoost.toFixed(2)})`);
  const target = tgt0;
  check(`${name} stability`, bounded, `finite/bounded over 90 s`);
  const tailMean = rSmSamples.reduce((a, b) => a + b, 0) / rSmSamples.length;
  const meanEnd = meanOf(st.h);
  check(`${name} sea state regulation`, tailMean < target * 2.0 && tailMean > target * 0.5,
    `rms ${rms0.toFixed(2)} -> settled ${tailMean.toFixed(2)} m (target ${target})`);
  check(`${name} mean sea level pinned`, Math.abs(meanEnd) < 0.4, `mean h ${meanEnd.toFixed(3)} m`);

  // (b) exact advection: single plane wave must translate at exactly c
  let propagates = false;
  {
    const N = cfg.res, dxc = cfg.size / cfg.res;
    const c = waveSpeed(cfg.depthEff);
    const lambda = cfg.size / 4;
    const k = 2 * PI / lambda;
    const omega = c * k;
    const st2 = { h: new Float32Array(N * N), hv: new Float32Array(N * N) };
    for (let x = 0; x < N; x++) {
      const wx = (x + 0.5) * dxc;
      for (let z = 0; z < N; z++) {
        const i = z * N + x;
        st2.h[i] = Math.sin(k * wx);
        st2.hv[i] = omega * Math.cos(k * wx);
      }
    }
    const lag = Math.round(2 / dt); // 2 s of simulated time
    for (let f = 0; f < lag; f++) step(cfg, st2, dt, 0, f / 60, 0);
    // crest of sin(k(x - c*t)): peak at x0 = (3*lambda/4 - c*t) mod lambda
    const row = Math.floor(N / 2) * N;
    let peakX = 0, peakV = -1e9;
    for (let x = 0; x < N; x++) {
      if (st2.h[row + x] > peakV) { peakV = st2.h[row + x]; peakX = x; }
    }
    const expectedWx = (((lambda / 4 - c * 2) % cfg.size) + cfg.size) % cfg.size;
    const expectedCell = expectedWx / dxc - 0.5;
    const lamCells = lambda / dxc;
    let dcell = Math.abs(peakX - expectedCell) % lamCells;
    if (dcell > lamCells / 2) dcell = lamCells - dcell;
    propagates = dcell <= 2.0; // crest within 2 cells of exact prediction (mod wavelength)
  }
  check(`${name} propagation`, propagates, `crest within 2 cells of exact c*t after 2 s`);
}

// AMR score distribution over a developed sea at several sea states
{
  console.log('\n--- AMR score vs sea state (per-block max score) ---');
  for (const target of [0.28, 0.45, 0.6]) {
    const st = initField(NEAR);
    // regulate to target then measure block scores (16x16 coarse-cell blocks)
    let rWind = BASE_WIND, rSm = rms(st.h);
    for (let f = 0; f < 2400; f++) {
      const r = rms(st.h);
      rSm += (r - rSm) * 0.02;
      const wind = BASE_WIND * Math.max(0.05, Math.min(2.5, target / Math.max(rSm, 0.05)));
      const boost = 1.0 * Math.max(0, rSm / (target * 1.15) - 1.0);
      rWind += (wind - rWind) * 0.006;
      step(NEAR, st, 1 / 60, rWind, f / 60, boost);
    }
    const N = NEAR.res, dx = NEAR.size / NEAR.res, c = waveSpeed(NEAR.depthEff);
    const scores: number[] = [];
    for (let by = 0; by < 8; by++) {
      for (let bx = 0; bx < 8; bx++) {
        let mx = 0;
        for (let z = by * 16; z < (by + 1) * 16; z++) {
          for (let x = bx * 16; x < (bx + 1) * 16; x++) {
            const i = z * N + x;
            const hl = st.h[z * N + ((x - 1 + N) % N)], hr = st.h[z * N + ((x + 1) % N)];
            const hu = st.h[((z - 1 + N) % N) * N + x], hd = st.h[((z + 1) % N) * N + x];
            const grad = Math.hypot(hr - hl, hu - hd) / (2 * dx);
            const curv = Math.abs(hl + hr + hu + hd - 4 * st.h[i]) / dx;
            const hvN = Math.min(Math.abs(st.hv[i]) / c, 1);
            const crest = Math.min(Math.max(st.h[i], 0) * 0.45, 1);
            mx = Math.max(mx, 0.55 * grad + 0.50 * curv + 0.15 * hvN + 1.2 * crest);
          }
        }
        scores.push(mx);
      }
    }
    scores.sort((a, b) => b - a);
    let hmax = -1e9, hmin = 1e9;
    for (const v of st.h) { hmax = Math.max(hmax, v); hmin = Math.min(hmin, v); }
    console.log(`   [debug] h range [${hmin.toFixed(2)}, ${hmax.toFixed(2)}] mean ${meanOf(st.h).toFixed(3)}`);
    console.log(`target rms ${target} (actual ${rms(st.h).toFixed(2)}): max=${scores[0].toFixed(2)} p25=${scores[15].toFixed(2)} median=${scores[31].toFixed(2)} min=${scores[63].toFixed(2)} | blocks >0.5: ${scores.filter(s => s > 0.5).length}, >0.35: ${scores.filter(s => s > 0.35).length}`);
  }
}

// AMR score sanity: splash region must score high, calm region low
{
  const st = initField(NEAR);
  const dx = NEAR.size / NEAR.res;
  const c = waveSpeed(NEAR.depthEff);
  const scoreAt = (cx: number, cz: number, splash: { x: number; z: number; amp: number } | null): number => {
    const N = NEAR.res;
    let s = 0;
    for (let z = -8; z <= 8; z++) {
      for (let x = -8; x <= 8; x++) {
        const xi = ((Math.round(cx / dx) + x) % N + N) % N;
        const zi = ((Math.round(cz / dx) + z) % N + N) % N;
        const i = zi * N + xi;
        const hl = st.h[zi * N + ((xi - 1 + N) % N)], hr = st.h[zi * N + ((xi + 1) % N)];
        const hu = st.h[((zi - 1 + N) % N) * N + xi], hd = st.h[((zi + 1) % N) * N + xi];
        const grad = Math.hypot(hr - hl, hu - hd) / (2 * dx);
        const curv = Math.abs(hl + hr + hu + hd - 4 * st.h[i]) / dx;
        const hvN = Math.min(Math.abs(st.hv[i]) / c, 1);
        const crest = Math.min(Math.max(st.h[i], 0) * 0.45, 1);
        s = Math.max(s, 0.55 * grad + 0.50 * curv + 0.15 * hvN + 1.2 * crest);
      }
    }
    if (splash) {
      const d = Math.hypot(cx - splash.x, cz - splash.z);
      const ss = Math.max(0, Math.min(1, (14 - d) / 13));
      s += 2.0 * ss * ss * (3 - 2 * ss) * Math.min(Math.abs(splash.amp) * 2, 2);
    }
    return s;
  };
  // settled calm sea (slider ~0): regulate to a low target, then no block may
  // cross the refine threshold
  {
    const stC = initField(NEAR);
    const N = NEAR.res, dxc = NEAR.size / NEAR.res, cc = waveSpeed(NEAR.depthEff);
    let cWind = BASE_WIND, cSm = rms(stC.h);
    for (let f = 0; f < 2400; f++) {
      const r = rms(stC.h);
      cSm += (r - cSm) * 0.02;
      const wind = BASE_WIND * Math.max(0.05, Math.min(2.5, 0.10 / Math.max(cSm, 0.05)));
      const boost = 1.0 * Math.max(0, cSm / (0.10 * 1.15) - 1.0);
      cWind += (wind - cWind) * 0.006;
      step(NEAR, stC, 1 / 60, cWind, f / 60, boost);
    }
    let maxScore = 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const i = z * N + x;
        const hl = stC.h[z * N + ((x - 1 + N) % N)], hr = stC.h[z * N + ((x + 1) % N)];
        const hu = stC.h[((z - 1 + N) % N) * N + x], hd = stC.h[((z + 1) % N) * N + x];
        const grad = Math.hypot(hr - hl, hu - hd) / (2 * dxc);
        const curv = Math.abs(hl + hr + hu + hd - 4 * stC.h[i]) / dxc;
        const hvN = Math.min(Math.abs(stC.hv[i]) / cc, 1);
        const crest = Math.min(Math.max(stC.h[i], 0) * 0.45, 1);
        maxScore = Math.max(maxScore, 0.55 * grad + 0.50 * curv + 0.15 * hvN + 1.2 * crest);
      }
    }
    check('AMR score: calm sea below refine threshold', maxScore < 0.45,
      `max block score ${maxScore.toFixed(3)} (< 0.45 HI) at calm sea`);
    check('AMR: mean sea level pinned', Math.abs(meanOf(stC.h)) < 0.3,
      `mean h ${meanOf(stC.h).toFixed(3)} m after calm regulated run`);
  }
  const splashScore = scoreAt(NEAR.size / 2, NEAR.size / 2, { x: NEAR.size / 2, z: NEAR.size / 2, amp: 7.5 });
  check('AMR score: splash above refine threshold', splashScore > 3.0, `splash score ${splashScore.toFixed(3)} (> 3)`);
}

console.log(ok ? '\nALL PHYSICS CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
