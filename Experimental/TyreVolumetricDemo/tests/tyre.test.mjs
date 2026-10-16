import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildTyreMesh, tetElementForces, mulMM, transposeC, invertColMajor, sub,
  CpuTyreSimulation, packParams, PARAM_LAYOUT, PARAM_FLOATS, resolveParams, nodeInfoArray, roadPreset,
} from '../src/tyreCore.js';
import { SIM_WGSL } from '../src/shaders.js';

const SMALL = { NT: 24 };

test('mesh topology: counts, positive volumes, complete adjacency', () => {
  const m = buildTyreMesh(SMALL);
  assert.equal(m.N, 24 * 5 * 5);
  assert.equal(m.T, 24 * 4 * 4 * 6);
  for (let q = 0; q < m.T; q++) assert.ok(m.tetV0[q] > 0, `tet ${q} inverted`);
  const total = m.tetV0.reduce((a, b) => a + b, 0);
  // Pappus estimate: cross-section area (2 · radial span · mean half-width) x mid-radius circumference.
  // Mean half-width of the rounded profile: 0.055 + 0.05·∫shoulder du, with ∫shoulder = 0.7·π/4 + 0.3.
  const meanHalfWidth = 0.055 + 0.05 * (0.7 * Math.PI / 4 + 0.3);
  const pappus = 2 * (0.33 - 0.2) * meanHalfWidth * 2 * Math.PI * 0.265;
  assert.ok(total > 0.9 * pappus && total < 1.1 * pappus, `volume ${total} vs Pappus ${pappus}`);
  assert.equal(m.adjStart[m.N], 4 * m.T);
  for (let n = 0; n < m.N; n++) assert.ok(m.adjStart[n + 1] > m.adjStart[n], `node ${n} has no tets`);
  for (let n = 0; n < m.N; n++) assert.ok(m.nodeRest[4 * n + 3] > 0, `node ${n} massless`);
});

test('column-major inverse is correct', () => {
  const M = [1, 0.2, 0.1, 0.3, 1.1, 0.05, 0.1, 0.2, 0.9];
  const I = mulMM(M, invertColMajor(M));
  [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, k) => assert.ok(Math.abs(I[k] - v) < 1e-12));
});

test('rest shape carries no elastic force without inflation', () => {
  const m = buildTyreMesh(SMALL);
  const out = new Array(12).fill(0);
  let worst = 0;
  for (let q = 0; q < m.T; q++) {
    const X = [0, 1, 2, 3].map((k) => { const n = m.tetIdx[4 * q + k]; return [m.rest[3 * n], m.rest[3 * n + 1], m.rest[3 * n + 2]]; });
    tetElementForces(X, m.tetGT.subarray(9 * q, 9 * q + 9), m.tetV0[q], 1e6, 1e6, 0, out);
    for (const v of out) worst = Math.max(worst, Math.abs(v));
  }
  assert.ok(worst < 1e-9, `max rest force ${worst}`);
});

test('element forces equal the negative gradient of the stored energy (finite differences)', () => {
  const GT = transposeC(invertColMajor([1, 0, 0, 0, 1, 0, 0, 0, 1]));
  const mu = 1.0, lam = 2.0, pr = 0.3, V0 = 1 / 6;
  const energy = (X) => {
    const F = mulMM([...sub(X[1], X[0]), ...sub(X[2], X[0]), ...sub(X[3], X[0])], transposeC(GT));
    const FtF = mulMM(transposeC(F), F);
    const E = [0.5 * (FtF[0] - 1), 0.5 * FtF[1], 0.5 * FtF[2], 0.5 * FtF[3], 0.5 * (FtF[4] - 1), 0.5 * FtF[5], 0.5 * FtF[6], 0.5 * FtF[7], 0.5 * (FtF[8] - 1)];
    const EE = E.reduce((a, e) => a + e * e, 0), trE = E[0] + E[4] + E[8];
    const J = F[0] * (F[4] * F[8] - F[7] * F[5]) - F[3] * (F[1] * F[8] - F[7] * F[2]) + F[6] * (F[1] * F[5] - F[4] * F[2]);
    return V0 * (mu * EE + 0.5 * lam * trE * trE) - pr * V0 * J;
  };
  const X = [[0.05, 0.02, 0], [1.1, 0.03, -0.02], [0.04, 1.05, 0.01], [0.02, 0.03, 1.08]];
  const out = new Array(12).fill(0);
  tetElementForces(X, GT, V0, mu, lam, pr, out);
  for (let k = 0; k < 4; k++) for (let c = 0; c < 3; c++) {
    const h = 1e-6, Xp = X.map((a) => [...a]), Xm = X.map((a) => [...a]);
    Xp[k][c] += h; Xm[k][c] -= h;
    const g = -(energy(Xp) - energy(Xm)) / (2 * h);
    assert.ok(Math.abs(g - out[3 * k + c]) < 1e-7, `node ${k} comp ${c}: ${g} vs ${out[3 * k + c]}`);
  }
});

test('packed uniform layout matches the WGSL Params struct field order', () => {
  const body = SIM_WGSL.match(/struct Params \{([\s\S]*?)\};/)[1];
  const fields = [...body.matchAll(/(\w+)\s*:\s*f32/g)].map((m) => m[1]);
  assert.deepEqual(fields, PARAM_LAYOUT);
  assert.equal(PARAM_LAYOUT.length, 28);
  assert.equal(packParams(resolveParams(SMALL), 10, 10).length, PARAM_FLOATS);
  assert.equal(nodeInfoArray(buildTyreMesh(SMALL), 1000).length, 4 * 600);
});

test('explicit time step shrinks for stiff or light setups only', () => {
  assert.equal(resolveParams({}).dt, 1e-4);
  assert.ok(resolveParams({ youngs: 10e6 }).dt < 1e-4);
  assert.equal(resolveParams({ youngs: 2e6 }).dt, 1e-4);
});

test('tyre settles under load at a sensible ride height without blowing up', { timeout: 120000 }, () => {
  const sim = new CpuTyreSimulation({ ...SMALL, speed: 0 });
  let maxSpeed = 0, lateRimSpeed = 0;
  for (let s = 0; s < 2000; s++) {
    sim.step();
    for (let i = 0; i < sim.v.length; i++) maxSpeed = Math.max(maxSpeed, Math.abs(sim.v[i]));
    if (s >= 1800) lateRimSpeed = Math.max(lateRimSpeed, Math.abs(sim.rimVel[1]));
  }
  assert.ok(Number.isFinite(sim.rim[1]));
  // Dropping onto the road gives a transient peak of a few m/s; it must stay bounded and then settle.
  assert.ok(maxSpeed < 15, `max node speed ${maxSpeed}`);
  assert.ok(lateRimSpeed < 0.05, `rim still moving at the end: ${lateRimSpeed}`);
  // Load ~ 1.8 kN per corner; expect a few mm to ~2 cm of tyre compression below the free radius.
  assert.ok(sim.rim[1] < 0.332 && sim.rim[1] > 0.30, `rim height ${sim.rim[1]}`);
});

test('rolling advances the rim and spins it at -v/R (contact patch sticks to the road)', { timeout: 120000 }, () => {
  const sim = new CpuTyreSimulation({ ...SMALL, speed: 5, road: [] });
  for (let s = 0; s < 3000; s++) sim.step();
  assert.ok(Math.abs(sim.rim[0] - 5 * sim.time) < 1e-9);
  assert.ok(Math.abs(sim.rim[3] + sim.rim[0] / sim.p.treadRadius) < 1e-6);
  // Nodes in contact should be almost stationary relative to the road. The old sign gave ~2x forward speed.
  let sum = 0, c = 0;
  for (let n = 0; n < sim.N; n++) if (sim.x[3 * n + 1] < 0.01) { sum += sim.v[3 * n]; c++; }
  assert.ok(c > 0);
  assert.ok(Math.abs(sum / c) < 1.0, `mean contact-patch vx ${sum / c}`);
  assert.ok(sim.x.every(Number.isFinite));
});

test('slip angle: spin scales with cos(yaw) and the tyre stays finite', { timeout: 120000 }, () => {
  const sim = new CpuTyreSimulation({ ...SMALL, speed: 5, yaw: 0.2, road: [] });
  for (let s = 0; s < 1500; s++) sim.step();
  assert.ok(Math.abs(sim.rimVel[3] + (5 * Math.cos(0.2)) / sim.p.treadRadius) < 1e-9);
  assert.ok(sim.x.every(Number.isFinite));
});

test('kerb strike lifts the tread over the obstacle without blowing up', { timeout: 120000 }, () => {
  const sim = new CpuTyreSimulation({ ...SMALL, speed: 4, road: roadPreset('kerb', 0.1) });
  let maxSpeed = 0;
  for (let s = 0; s < 1500; s++) {
    sim.step();
    for (let i = 0; i < sim.v.length; i++) maxSpeed = Math.max(maxSpeed, Math.abs(sim.v[i]));
  }
  assert.ok(sim.x.every(Number.isFinite));
  assert.ok(maxSpeed < 20, `max node speed ${maxSpeed}`);
});

test('stiff, fast, high-pressure case stays finite with the adaptive step', { timeout: 120000 }, () => {
  const sim = new CpuTyreSimulation({ ...SMALL, youngs: 10e6, pressure: 4e5, road: roadPreset('speedbump', 0.08), speed: 20 });
  for (let s = 0; s < 1000; s++) sim.step();
  assert.ok(Number.isFinite(sim.rim[1]) && Math.abs(sim.rim[1]) < 1);
});
