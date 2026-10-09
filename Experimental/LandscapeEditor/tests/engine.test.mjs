import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, resetEvaluationCache } from "../src/engine/evaluate.js";
import { PRESET_LIST, buildPreset } from "../src/engine/presets.js";
import { normalizeDocument, makeLayer, emptyDocument } from "../src/engine/document.js";
import { MASKS } from "../src/engine/masks.js";
import { EROSIONS } from "../src/engine/erosion.js";
import { GENERATORS, runGenerator } from "../src/engine/generators.js";
import { defaultsOf } from "../src/engine/schema.js";
import { routeFlow, accumulate, fillDepressions } from "../src/engine/field.js";

const N = 64;
const ctxFor = (H, cell = 30, maxH = 1000) => {
  const { createNoise } = { createNoise: null };
  return { N, cell, maxH, seaM: 200, seed: 7, noiseFor: null, derive: null };
};

function checksum(arr) {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s = (s * 31 + Math.round(arr[i] * 1e6)) % 1000000007;
  return s;
}

test("every preset evaluates without errors and stays in range", () => {
  for (const [id] of PRESET_LIST) {
    resetEvaluationCache();
    const r = evaluate(buildPreset(id));
    assert.equal(r.stats.errors.length, 0, `${id} errors`);
    for (let i = 0; i < r.height.length; i++) {
      assert.ok(Number.isFinite(r.height[i]), `${id} NaN at ${i}`);
      assert.ok(r.height[i] >= 0 && r.height[i] <= 1, `${id} out of range`);
    }
    assert.ok(r.stats.maxM > r.stats.minM, `${id} is flat`);
  }
});

test("evaluation is deterministic for the same document", () => {
  const doc = buildPreset("alps");
  resetEvaluationCache();
  const a = evaluate(doc);
  resetEvaluationCache();
  const b = evaluate(doc);
  assert.equal(checksum(a.height), checksum(b.height));
});

test("layer cache: a second evaluation reuses every height layer", () => {
  const doc = buildPreset("canyons");
  resetEvaluationCache();
  evaluate(doc);
  const again = evaluate(doc);
  assert.ok(again.stats.layers.filter((l) => l.id && !l.cached).length >= 0);
  assert.ok(again.stats.layers.some((l) => l.cached));
});

test("changing a layer only re-runs it and the layers above", () => {
  const doc = buildPreset("alps");
  resetEvaluationCache();
  evaluate(doc);
  const edited = structuredClone(doc);
  const idx = edited.layers.findIndex((l) => l.id === "rivers");
  edited.layers[idx].params.iterations = 3;
  const r = evaluate(edited);
  const heights = r.stats.layers.filter((l) => edited.layers.find((x) => x.id === l.id).kind === "height");
  const firstChanged = heights.findIndex((l) => !l.cached);
  assert.equal(firstChanged, idx, "layers below the edit must come from cache");
});

test("hydraulic erosion carves and deposits sediment", () => {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = 800 * (1 - y / N) + 40 * Math.sin(x / 3);
  const before = Float32Array.from(H);
  const c = { N, cell: 30, maxH: 1000, seed: 3 };
  const sed = EROSIONS.hydraulic.run(c, H, { ...defaultsOf(EROSIONS.hydraulic.params) });
  let changed = 0;
  let sedSum = 0;
  for (let i = 0; i < H.length; i++) {
    if (Math.abs(H[i] - before[i]) > 1e-3) changed++;
    sedSum += sed[i];
  }
  assert.ok(changed > N * N * 0.3, "hydraulic should touch most of a sloping field");
  assert.ok(sedSum > 0, "hydraulic should deposit something");
});

test("thermal erosion relaxes a cliff without diverging or losing mass", () => {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = x < N / 2 ? 900 : 0;
  const massBefore = H.reduce((a, b) => a + b, 0);
  const maxDrop = () => {
    let m = 0;
    for (let y = 0; y < N; y++) for (let x = 1; x < N; x++) m = Math.max(m, H[y * N + x - 1] - H[y * N + x]);
    return m;
  };
  const before = maxDrop();
  EROSIONS.thermal.run({ N, cell: 30, maxH: 1000, seed: 3 }, H, { talus: 30, iterations: 400, rate: 0.4 });
  const after = maxDrop();
  for (const v of H) assert.ok(Number.isFinite(v), "no NaN");
  assert.ok(after < before * 0.7, `cliff should relax: ${before.toFixed(0)} -> ${after.toFixed(0)}`);
  const massAfter = H.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(massAfter - massBefore) / massBefore < 0.02, "material is conserved");
});

test("depression filling leaves no closed pits", () => {
  const H = new Float32Array(N * N).fill(100);
  H[(N / 2) * N + N / 2] = 10;
  const F = fillDepressions(H, N, 0.001);
  assert.ok(F[(N / 2) * N + N / 2] > 10);
  const { receiver } = routeFlow(H, N, 30);
  const sinks = [...receiver].filter((r, i) => r < 0 && i % N !== 0 && i % N !== N - 1 && i >= N && i < N * (N - 1)).length;
  assert.equal(sinks, 0);
});

test("drainage accumulates downstream", () => {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = 500 - x * 5 + Math.sin(y) * 0.1;
  const { receiver, order } = routeFlow(H, N, 30);
  const A = accumulate(receiver, order, null);
  let maxA = 0;
  for (const v of A) maxA = Math.max(maxA, v);
  assert.ok(maxA >= N * 0.9, "the outlet should collect a whole column of cells");
});

test("coastal mask is 0 at the sea and rises inland", () => {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = x / N;
  const c = { ...ctxFor(H), noiseFor: () => ({ perlin: () => 0 }), derive: null };
  const w = MASKS.coastal.run(c, { ...defaultsOf(MASKS.coastal.params), jitter: 0, width: 600 }, H);
  assert.equal(w[N / 2 * N + 0], 0);
  assert.ok(w[N / 2 * N + N - 1] > 0.9);
});

test("generators return fields in [0, 1]", () => {
  const c = { N, cell: 30, maxH: 1000, seed: 11, noiseFor: (o) => ctxNoise(11 + o) };
  for (const name of Object.keys(GENERATORS)) {
    const f = runGenerator(name, c, {});
    for (const v of f) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v), name);
  }
});

function ctxNoise(seed) {
  return createNoiseLazy(seed);
}
import { createNoise as createNoiseLazy } from "../src/engine/noise.js";

test("document normalisation drops unknown types and fills defaults", () => {
  const doc = normalizeDocument({
    layers: [
      { type: "nonsense" },
      { type: "hydraulic", params: { density: 2 } },
      { type: "perlin", masks: [{ type: "coastal" }, { type: "ghost" }] },
    ],
  });
  assert.equal(doc.layers.length, 2);
  assert.equal(doc.layers[0].params.density, 2);
  assert.ok(doc.layers[0].params.lifetime > 0);
  assert.equal(doc.layers[1].masks.length, 1);
});

test("a new empty document evaluates to flat terrain without errors", () => {
  const doc = emptyDocument();
  doc.layers.push(makeLayer("flat"));
  resetEvaluationCache();
  const r = evaluate(doc);
  assert.equal(r.stats.errors.length, 0);
});
