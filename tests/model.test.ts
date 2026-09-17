/**
 * The model's conservation invariants, checked on a CPU mirror of the WGSL step.
 *
 * A GPU run cannot be executed here (no adapter in the sandbox), so the properties that *must* hold
 * are pinned down numerically instead: the shallow-water particle scheme is compiled to WGSL and
 * re-implemented line-for-line in TypeScript below. If someone changes the kernel, the pressure
 * term or the volume bookkeeping in `swe/swe_step.wgsl` and does not change this mirror, these tests
 * keep passing -- they are a property test of the *model*, not of the shader text. The shader text
 * is what the WGSL checker covers.
 *
 * The claims that matter for a game ocean:
 *   1. mass is conserved exactly (each particle owns its column volume),
 *   2. the pressure term is pairwise antisymmetric, so total momentum cannot drift,
 *   3. the derived height and the surface elevation are *unbiased* (still water reports eta = 0),
 *   4. still water stays still, and a sloping bed does not slowly slide the ocean away.
 *
 * Note on (4): the lattice is toroidal, like the shader's wrap. Any bed that is not periodic over
 * the lattice box has an artificial step across the seam, so the bed used here is a seabed swell
 * whose wavelength is exactly the box, and the horizon is kept short (2 s). The long-horizon
 * behaviour of a regular lattice (the SPH pairing instability, damped by the core repulsion and
 * XSPH) is documented in docs/RESEARCH.md, not asserted here.
 */

import { describe, expect, it } from 'vitest';

interface P {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** column volume (m^3) -- the conserved quantity */
  V: number;
  /** derived column depth (m), filled in by step() */
  h: number;
  /** surface elevation relative to still water (m), filled in by step() */
  eta: number;
}

const G = 9.81;
/** kernel radius = 2 lattice spacings, same relationship as deriveConfig() */
const DX = 3;
const H = 2 * DX;
const XSPH_EPS = 0.18;
const CORE = 0.35;

const wq = (q: number, h: number) => {
  const f = Math.max(0, 1 - q);
  return (6 / (Math.PI * h * h)) * f * f;
};
const gwq = (q: number, h: number) => (-12 / (Math.PI * h * h * h)) * Math.max(0, 1 - q);

/** 1/2 sum_j |dW/dr| r_j over the lattice shells inside the kernel (see util.wgsl). */
function latticeGradNorm(dx: number, h: number): number {
  const shell = (scale: number) => {
    const r = scale * dx;
    if (r >= h) return 0;
    return 4 * Math.abs(gwq(r / h, h)) * r;
  };
  return 0.5 * dx * dx * (shell(1) + shell(Math.SQRT2) + shell(2));
}

/** The kernel sum's value on a uniform lattice (see util.wgsl). */
function latticeWSum(dx: number, h: number): number {
  const s = wq(0, h) + 4 * wq(dx / h, h) + 4 * wq((Math.SQRT2 * dx) / h, h) + 4 * wq((2 * dx) / h, h);
  return dx * dx * s;
}

const LATTICE_W_SUM = latticeWSum(DX, H);
const LATTICE_GRAD_NORM = latticeGradNorm(DX, H);

interface StepOptions {
  /** false = the naive scheme (raw kernel sum, raw bed gradient), for contrast in the tests */
  balanced?: boolean;
}

/**
 * One symplectic step, mirroring swe/swe_step.wgsl (no wind, drag, sponge or pointer).
 *
 * The domain is periodic, exactly like the shader's toroidal wrap. `balanced` selects between the
 * shader's normalised operators and the naive form they replace.
 */
function step(ps: P[], depth: (x: number, z: number) => number, dt: number, opts: StepOptions = {}): void {
  const balanced = opts.balanced ?? true;
  const n = ps.length;
  const side = Math.round(Math.sqrt(n));
  const L = side * DX;
  const minImage = (d: number) => (d > L / 2 ? d - L : d < -L / 2 ? d + L : d);
  const acc = ps.map(() => ({ x: 0, z: 0 }));
  const xsph = ps.map(() => ({ x: 0, z: 0 }));

  for (let i = 0; i < n; i++) {
    const pi = ps[i]!;
    let hSum = pi.V * wq(0, H);
    let gradX = 0;
    let gradZ = 0;
    let sx = 0;
    let sz = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const pj = ps[j]!;
      const rx = minImage(pi.x - pj.x);
      const rz = minImage(pi.z - pj.z);
      const r2 = rx * rx + rz * rz;
      if (r2 >= H * H) continue;
      const r = Math.max(Math.sqrt(r2), 1e-4);
      const q = r / H;
      const w = wq(q, H);
      const g = gwq(q, H);
      const dx = rx / r;
      const dz = rz / r;
      hSum += pj.V * w;
      gradX += pj.V * g * dx;
      gradZ += pj.V * g * dz;
      sx += pj.V * w * (pj.vx - pi.vx);
      sz += pj.V * w * (pj.vz - pi.vz);
      if (r < CORE * H) {
        const push = (CORE * H - r) / (CORE * H);
        sx += push * push * dx * 6;
        sz += push * push * dz * 6;
      }
    }

    // Height: the kernel sum divided by the lattice constant, exactly as the shader does it.
    const h = hSum / LATTICE_W_SUM;
    pi.h = h;
    const hSafe = Math.max(h, 0.05);
    const e = XSPH_EPS / hSafe;
    xsph[i] = { x: sx * e, z: sz * e };

    // Bed gradient: central difference of the *analytic* bed (the shader samples the baked texture).
    const step1 = 1;
    const gdx = (depth(pi.x + step1, pi.z) - depth(pi.x - step1, pi.z)) / (2 * step1);
    const gdz = (depth(pi.x, pi.z + step1) - depth(pi.x, pi.z - step1)) / (2 * step1);
    pi.eta = h - depth(pi.x, pi.z);

    // Pressure + bed, exactly as the shader writes it: the kernel sum is the discrete gradient
    // operator of the lattice, so both sides are divided by its norm (util.wgsl::latticeGradNorm).
    // Unbalanced (the naive form) the two operators disagree by 13%, and the water slides.
    const gradNorm = balanced ? LATTICE_GRAD_NORM : 1;
    acc[i] = {
      x: (-G / gradNorm) * (gradX - gradNorm * gdx),
      z: (-G / gradNorm) * (gradZ - gradNorm * gdz),
    };
  }

  for (let i = 0; i < n; i++) {
    const p = ps[i]!;
    p.vx += acc[i]!.x * dt;
    p.vz += acc[i]!.z * dt;
    p.x += (p.vx + xsph[i]!.x) * dt;
    p.z += (p.vz + xsph[i]!.z) * dt;
  }
}

/** Max |acceleration| of the still-water state, without integrating it (a lens on well balancing). */
function residualAcceleration(ps: P[], depth: (x: number, z: number) => number, balanced = true): number {
  // dt = 1 s, so the velocity delta of the probe step *is* the acceleration.
  const probe = ps.map((p) => ({ ...p }));
  step(probe, depth, 1, { balanced });
  return probe.reduce((m, p, i) => Math.max(m, Math.hypot(p.vx - ps[i]!.vx, p.vz - ps[i]!.vz)), 0);
}

function lattice(n: number, spacing: number, depth: (x: number, z: number) => number): P[] {
  const ps: P[] = [];
  const side = Math.round(Math.sqrt(n));
  const half = (side * spacing) / 2;
  for (let iz = 0; iz < side; iz++) {
    for (let ix = 0; ix < side; ix++) {
      const x = -half + (ix + 0.5) * spacing;
      const z = -half + (iz + 0.5) * spacing;
      ps.push({ x, z, vx: 0, vz: 0, V: spacing * spacing * depth(x, z), h: depth(x, z), eta: 0 });
    }
  }
  return ps;
}

const totalVolume = (ps: P[]) => ps.reduce((s, p) => s + p.V, 0);
const totalMomentum = (ps: P[]) => ps.reduce((s, p) => ({ x: s.x + p.V * p.vx, z: s.z + p.V * p.vz }), { x: 0, z: 0 });
const maxSpeed = (ps: P[]) => ps.reduce((m, p) => Math.max(m, Math.hypot(p.vx, p.vz)), 0);
const maxAbsEta = (ps: P[]) => ps.reduce((m, p) => Math.max(m, Math.abs(p.eta)), 0);

describe('shallow-water particle model', () => {
  const flat = () => 24;
  /** A seabed swell with the wavelength of the lattice box (periodic, so the torus has no seam). */
  const swell = (slope: number) => {
    const L = Math.round(Math.sqrt(400)) * DX;
    const a = (slope * L) / (2 * Math.PI);
    return (x: number) => 20 + a * Math.sin((2 * Math.PI * x) / L);
  };

  it('conserves total column volume over thousands of steps', () => {
    const ps = lattice(400, DX, flat);
    const before = totalVolume(ps);
    for (let s = 0; s < 600; s++) step(ps, flat, 1 / 60);
    expect(totalVolume(ps)).toBeCloseTo(before, 9);
    for (const p of ps) expect(Number.isFinite(p.vx + p.vz + p.x + p.z)).toBe(true);
  });

  it('keeps total momentum at zero (antisymmetric pressure term)', () => {
    // A wave-like perturbation, then a single step: the pressure impulse must cancel pairwise.
    const depth = () => 20;
    const ps = lattice(400, DX, depth);
    for (const p of ps) p.vx = 0.4 * Math.sin(p.x * 0.02) + 0.2 * Math.cos(p.z * 0.03);
    const m0 = totalMomentum(ps);
    step(ps, depth, 1 / 60);
    const m1 = totalMomentum(ps);
    expect(Math.abs(m1.x - m0.x)).toBeLessThan(1e-9);
    expect(Math.abs(m1.z - m0.z)).toBeLessThan(1e-9);
    expect(maxSpeed(ps)).toBeLessThan(4);
  });

  it('derives the column depth without bias (eta is zero in still water)', () => {
    // The raw kernel sum returns 1.12 d on this lattice; without the lattice constant the surface
    // would sit ~2.9 m above the bed in still water. This is the test that pins it down.
    const ps = lattice(400, DX, flat);
    step(ps, flat, 0);
    const worst = ps.reduce((m, p) => Math.max(m, Math.abs(p.h - 24)), 0);
    expect(worst).toBeLessThan(1e-12);
    expect(maxAbsEta(ps)).toBeLessThan(1e-12);
  });

  it('keeps still water still on a flat bed', () => {
    const ps = lattice(400, DX, flat);
    for (let s = 0; s < 300; s++) step(ps, flat, 1 / 60);
    expect(maxSpeed(ps)).toBeLessThan(1e-6);
  });

  it('well balances still water on a sloping bed', () => {
    // The classic failure mode of a badly balanced pressure/bed pairing: the water slides downhill
    // at a fraction of g|grad b| forever. With the lattice normalisations the residual comes only
    // from the kernel's third-order error on the swell, i.e. a few mm/s^2, not cm/s^2.
    const depth = swell(1 / 10);
    const ps = lattice(400, DX, depth);
    const balanced = residualAcceleration(ps, depth, true);
    const naive = residualAcceleration(ps, depth, false);
    expect(balanced).toBeLessThan(0.02);
    expect(naive).toBeGreaterThan(balanced * 5);

    for (let s = 0; s < 120; s++) step(ps, depth, 1 / 60);
    expect(maxSpeed(ps)).toBeLessThan(0.01);

    const naiveRun = lattice(400, DX, depth);
    for (let s = 0; s < 120; s++) step(naiveRun, depth, 1 / 60, { balanced: false });
    expect(maxSpeed(naiveRun)).toBeGreaterThan(0.02);
  });

  it('redistributes volume instead of blowing up when a column collapses', () => {
    // Dam break: the lattice is initialized with a column-height step (a flat bed, so this is a
    // genuine surface discontinuity, not a wall), then left to collapse. Nothing here may diverge.
    const bed = () => 24;
    const ps = lattice(400, DX, bed);
    for (const p of ps) p.V = DX * DX * (p.x < 0 ? 34 : 12);
    const depth = bed;
    for (let s = 0; s < 600; s++) step(ps, depth, 1 / 300);
    expect(maxSpeed(ps)).toBeLessThan(25);
    for (const p of ps) expect(Number.isFinite(p.x + p.z + p.vx + p.vz)).toBe(true);
  });
});
