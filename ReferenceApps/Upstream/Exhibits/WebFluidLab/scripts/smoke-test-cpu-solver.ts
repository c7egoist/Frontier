// Headless physics smoke test. This sandbox has no GPU/browser, so we can't
// exercise the WebGPU path directly — but CpuSolver implements the exact
// same WCSPH model in plain TypeScript, so we can run it under Node to catch
// NaN/blow-up bugs and sanity-check that each material actually behaves
// differently (settles at a different height, sticks to colliders more or
// less) before a human ever opens a browser.
import { CpuSolver } from "../src/sim/cpu/CpuSolver.ts";
import { defaultColliders } from "../src/colliders.ts";
import { MATERIAL_ORDER } from "../src/materials.ts";
import type { MaterialId } from "../src/types.ts";

const NOZZLE: [number, number, number] = [0, 3.0, 0];
const DT = 1 / 60;
const POUR_FRAMES = 180;
const SETTLE_FRAMES = 240;
const BUDGET = 1400;

function isFinitePos(x: number): boolean {
  return Number.isFinite(x);
}

function runMaterial(material: MaterialId) {
  const solver = new CpuSolver(BUDGET);
  solver.setColliders(defaultColliders());

  for (let f = 0; f < POUR_FRAMES; f++) {
    solver.spawn(
      { material, origin: NOZZLE, spread: 0.14, count: 6, initialVelocity: [0, -1.5, 0] },
      BUDGET,
    );
    solver.step(DT, 1);
  }
  for (let f = 0; f < SETTLE_FRAMES; f++) {
    solver.step(DT, 1);
  }

  const n = solver.activeCount;
  let minY = Infinity;
  let maxY = -Infinity;
  let sumY = 0;
  let maxSpeed = 0;
  let sumContact = 0;
  let nonFinite = 0;
  let outOfBounds = 0;
  for (let i = 0; i < n; i++) {
    const x = solver.posX[i];
    const y = solver.posY[i];
    const z = solver.posZ[i];
    const vx = solver.velX[i];
    const vy = solver.velY[i];
    const vz = solver.velZ[i];
    if (![x, y, z, vx, vy, vz].every(isFinitePos)) nonFinite++;
    if (y < -0.5 || y > 6 || Math.abs(x) > 4 || Math.abs(z) > 4) outOfBounds++;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    sumY += y;
    maxSpeed = Math.max(maxSpeed, Math.hypot(vx, vy, vz));
    sumContact += solver.contact[i];
  }

  const avgY = sumY / n;
  const avgContact = sumContact / n;

  console.log(
    `${material.padEnd(10)} active=${n.toString().padStart(4)} ` +
      `avgY=${avgY.toFixed(3)} minY=${minY.toFixed(3)} maxY=${maxY.toFixed(3)} ` +
      `maxSpeed=${maxSpeed.toFixed(2)} avgContact=${avgContact.toFixed(3)} ` +
      `nonFinite=${nonFinite} outOfBounds=${outOfBounds}`,
  );

  return { material, n, avgY, maxSpeed, avgContact, nonFinite, outOfBounds };
}

console.log("Headless WCSPH smoke test (CpuSolver) — pouring each material onto the same colliders.\n");
const results = MATERIAL_ORDER.map(runMaterial);

let failed = false;
for (const r of results) {
  if (r.nonFinite > 0) {
    console.error(`FAIL ${r.material}: ${r.nonFinite} particles have NaN/Infinity state`);
    failed = true;
  }
  if (r.outOfBounds > r.n * 0.05) {
    console.error(`FAIL ${r.material}: ${r.outOfBounds}/${r.n} particles escaped the tank bounds`);
    failed = true;
  }
  if (r.n === 0) {
    console.error(`FAIL ${r.material}: no active particles after the run`);
    failed = true;
  }
}

// Sanity-check material differentiation: mud/chocolate should pick up
// meaningfully more collider contact than water over the same run because
// of their higher adhesion coefficients.
const water = results.find((r) => r.material === "water")!;
const mud = results.find((r) => r.material === "mud")!;
if (mud.avgContact <= water.avgContact) {
  console.error(
    `FAIL materials: expected mud (avgContact=${mud.avgContact.toFixed(3)}) > water (avgContact=${water.avgContact.toFixed(3)})`,
  );
  failed = true;
}

console.log(failed ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED");
process.exit(failed ? 1 : 0);
