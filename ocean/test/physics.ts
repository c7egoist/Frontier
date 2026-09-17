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
const TARGET_RMS: Record<string, number> = { near: 0.7, mid: 1.1, far: 1.6 };
const BASE_WIND = 0.5;
function regulate(cfg: Cfg, st: { h: Float32Array }): { wind: number; boost: number } {
  const r = rms(st.h);
  const target = cfg.depthEff > 100 ? TARGET_RMS.far : cfg.depthEff > 30 ? TARGET_RMS.mid : TARGET_RMS.near;
  const wind = BASE_WIND * Math.max(0.04, Math.min(2.5, target / Math.max(r, 0.05)));
  const boost = 1.2 * Math.max(0, r / target - 0.85);
  return { wind, boost };
}

interface Cfg { size: number; res: number; depthEff: number; damping: number; diffusion: number; }

function initField(cfg: Cfg): { h: Float32Array; hv: Float32Array } {
  const N = cfg.res;
  const h = new Float32Array(N * N);
  const hv = new Float32Array(N * N);
  const c = waveSpeed(cfg.depthEff);
  const lMax = cfg.size * 0.30;
  const lMin = Math.max(cfg.size / N, 1) * 4;
  const nBands = Math.floor(Math.log(lMax / lMin) / Math.log(1 / 0.62)) + 1;
  for (let i = 0; i < Math.min(nBands, 6); i++) {
    const lambda = lMax * Math.pow(0.62, i);
    const k = 2 * PI / lambda;
    const amp = 0.62 * Math.pow(0.62, i);
    const ang = rnd() * 2 * PI;
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const omega = c * k;
    const ph0 = rnd() * 2 * PI;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const wx = (x + 0.5) / N * cfg.size;
        const wz = (z + 0.5) / N * cfg.size;
        const phase = (wx * dx + wz * dz) * k + ph0;
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
      let v = hv[i] + alpha * alpha * lap;
      v *= Math.exp(-(cfg.damping + dampBoost) * dt);
      // wind (uniform random in lieu of spatial noise; statistically similar injection)
      v += dt * windAmp * (rnd() - 0.5) * 2;
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

function rms(arr: Float32Array): number {
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s / arr.length);
}

// --- run scenarios -----------------------------------------------------------
const NEAR: Cfg = { size: 96, res: 128, depthEff: 12, damping: 0.02, diffusion: 0.012 };
const MID: Cfg = { size: 640, res: 256, depthEff: 40, damping: 0.022, diffusion: 0.012 };
const FINE: Cfg = { size: 96, res: 256, depthEff: 12, damping: 0.03, diffusion: 0.02 };

let ok = true;
function check(name: string, cond: boolean, detail: string): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  if (!cond) ok = false;
}

for (const [name, cfg, dt] of [
  ['near L0', NEAR, 1 / 60], ['mid', MID, 1 / 60], ['near fine', FINE, 1 / 120],
] as [string, Cfg, number][]) {
  // (a) regulated run: sea state must converge to target and stay bounded
  const st = initField(cfg);
  const rms0 = rms(st.h);
  let bounded = true;
  const total = 3600;
  for (let f = 0; f < total; f++) {
    const { wind, boost } = regulate(cfg, st);
    const maxH = step(cfg, st, dt, wind, f / 60, boost);
    if (!isFinite(maxH) || maxH > 40) { bounded = false; break; }
  }
  const rmsEnd = rms(st.h);
  const target = cfg.depthEff > 100 ? TARGET_RMS.far : cfg.depthEff > 30 ? TARGET_RMS.mid : TARGET_RMS.near;
  check(`${name} stability`, bounded, `finite/bounded over 60 s`);
  check(`${name} sea state regulation`, rmsEnd < target * 1.6 && rmsEnd > target * 0.3,
    `rms ${rms0.toFixed(2)} -> ${rmsEnd.toFixed(2)} m (target ${target})`);

  // (b) pure advection: with wind off, the field must translate at speed c
  const st2 = initField(cfg);
  let propagates = false;
  {
    const lag = 120; // 2 s
    let prev = st2.h.slice();
    for (let f = 0; f < lag; f++) step(cfg, st2, dt, 0, f / 60, 0);
    const shift = Math.round(2 * waveSpeed(cfg.depthEff) / (cfg.size / cfg.res));
    const N = cfg.res;
    let cu = 0;
    const dirs = [0, 0, 0, 0];
    for (let z = 0; z < N; z += 4) {
      for (let x = 0; x < N; x += 4) {
        const p0 = prev[z * N + x];
        cu += p0 * st2.h[z * N + x];
        dirs[0] += p0 * st2.h[z * N + ((x + shift) % N)];
        dirs[1] += p0 * st2.h[z * N + ((x - shift + N) % N)];
        dirs[2] += p0 * st2.h[((z + shift) % N) * N + x];
        dirs[3] += p0 * st2.h[((z - shift + N) % N) * N + x];
      }
    }
    propagates = Math.max(...dirs) > cu * 1.05;
  }
  check(`${name} propagation`, propagates, `translated field correlates best at shift c*2s`);
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
        s = Math.max(s, 0.55 * grad + 0.50 * curv + 0.15 * hvN);
      }
    }
    if (splash) {
      const d = Math.hypot(cx - splash.x, cz - splash.z);
      const ss = Math.max(0, Math.min(1, (14 - d) / 13));
      s += 2.0 * ss * ss * (3 - 2 * ss) * Math.min(Math.abs(splash.amp) * 2, 2);
    }
    return s;
  };
  const calm = scoreAt(NEAR.size / 2, NEAR.size / 2, null);
  const splashScore = scoreAt(NEAR.size / 2, NEAR.size / 2, { x: NEAR.size / 2, z: NEAR.size / 2, amp: 7.5 });
  check('AMR score: calm below coarsen threshold', calm < 0.38, `calm score ${calm.toFixed(3)} (< 0.38)`);
  check('AMR score: splash above refine threshold', splashScore > 0.8, `splash score ${splashScore.toFixed(3)} (> 0.8)`);
}

console.log(ok ? '\nALL PHYSICS CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
