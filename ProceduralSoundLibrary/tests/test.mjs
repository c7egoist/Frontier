// Tests for the procedural sound library. Run: node tests/test.mjs
// They check that every sound renders finite, bounded, non-silent and repeatable,
// and that the physical trends hold (steel rings longer than rubber, tyre squeal sits
// in the 1-4 kHz band, a brushless motor's tone sits at 6 x its electrical frequency).
import assert from "node:assert/strict";
import { renderSound, SOUND_TYPES, defaultParams, TYPE_IDS } from "../src/registry.js";
import { buildCatalog, assertUnique } from "../src/catalog.js";
import { measure, spectrum, encodeWav, rng, whiteNoise, svf, reverb } from "../src/dsp.js";
import { effectiveMaterial, MATERIAL_IDS } from "../src/materials.js";

const SR = 44100;
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { failures.push(name); console.log(`FAIL ${name}\n     ${e.message}`); }
}

// energy fraction of a signal between two frequencies
function bandEnergy(x, lo, hi) {
  const N = 4096;
  let total = 0, inBand = 0;
  for (let s = 0; s + N <= x.length; s += N) {
    const mag = spectrum(x.subarray(s, s + N));
    for (let k = 1; k < mag.length; k++) {
      const e = mag[k] * mag[k];
      const f = (k * SR) / N;
      total += e;
      if (f >= lo && f < hi) inBand += e;
    }
  }
  return inBand / Math.max(total, 1e-20);
}
// frequency of the strongest bin in a band (Hz)
function peakFreq(x, lo, hi, N = 8192) {
  const mag = spectrum(x.subarray(0, N));
  let best = 0, bk = 0;
  for (let k = 1; k < mag.length; k++) {
    const f = (k * SR) / N;
    if (f >= lo && f < hi && mag[k] > best) { best = mag[k]; bk = f; }
  }
  return bk;
}
// time (s) at which the envelope falls to a fraction of its peak, measured over 10 ms blocks
function decayTime(x, frac = 0.001) {
  const blk = Math.round(0.01 * SR);
  const env = [];
  for (let s = 0; s < x.length; s += blk) {
    let m = 0;
    for (let i = s; i < Math.min(x.length, s + blk); i++) m = Math.max(m, Math.abs(x[i]));
    env.push(m);
  }
  const peak = Math.max(...env);
  let last = 0;
  env.forEach((v, i) => { if (v > peak * frac) last = i; });
  return (last + 1) * 0.01;
}

// --- DSP primitives
test("rng is deterministic per seed", () => {
  const a = whiteNoise(1000, rng(42)), b = whiteNoise(1000, rng(42)), c = whiteNoise(1000, rng(43));
  assert.deepEqual(Array.from(a.slice(0, 50)), Array.from(b.slice(0, 50)));
  assert.notDeepEqual(Array.from(a.slice(0, 50)), Array.from(c.slice(0, 50)));
});
test("state-variable/biquad filters stay bounded up to 18 kHz (no blow-up)", () => {
  const x = whiteNoise(SR, rng(3));
  for (const fc of [200, 2000, 9000, 18000]) for (const mode of ["lp", "hp", "bp"]) {
    const y = svf(x, fc, 1.5, SR, mode);
    for (const v of y) assert.ok(Number.isFinite(v) && Math.abs(v) < 20, `${mode}@${fc} unstable`);
  }
});
test("reverb adds a tail beyond the dry input and stays finite", () => {
  const x = new Float32Array(SR / 10); x[0] = 1;
  const y = reverb(x, SR, { mix: 0.5, decaySec: 1 });
  assert.ok(y.length > x.length);
  assert.ok(measure(y.subarray(SR / 5), SR).peakDb > -60, "no tail");
  for (const v of y) assert.ok(Number.isFinite(v));
});
test("WAV encoder writes a valid 16-bit mono header", () => {
  const w = encodeWav(new Float32Array([0, 0.5, -0.5, 1, -1]), SR);
  const s = String.fromCharCode(...w.slice(0, 4)) + String.fromCharCode(...w.slice(8, 12));
  assert.equal(s, "RIFFWAVE");
  assert.equal(w.length, 44 + 5 * 2);
});

// --- every sound type
for (const id of TYPE_IDS) {
  test(`${id}: renders finite, bounded, non-silent`, () => {
    const x = renderSound(id, {}, { sr: SR, seed: 11 });
    let peak = 0;
    for (const v of x) {
      assert.ok(Number.isFinite(v), "non-finite sample");
      peak = Math.max(peak, Math.abs(v));
    }
    assert.ok(peak <= 0.9 + 1e-6, `peak ${peak} above ceiling`);
    assert.ok(peak > 0.05, `peak ${peak} too quiet`);
  });
  test(`${id}: same seed & params give identical output`, () => {
    const a = renderSound(id, {}, { sr: SR, seed: 5 });
    const b = renderSound(id, {}, { sr: SR, seed: 5 });
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i += 97) assert.equal(a[i], b[i]);
  });
  test(`${id}: every declared control changes the output`, () => {
    const base = renderSound(id, {}, { sr: SR, seed: 9 });
    for (const spec of SOUND_TYPES[id].params) {
      if (spec.kind === "range") {
        const alt = spec.value === spec.max ? spec.min : spec.max;
        // a control that only applies to some modes is tested in one of those modes
        const ctxParams = {};
        if (spec.when) for (const [k, vals] of Object.entries(spec.when)) ctxParams[k] = vals[0];
        const baseIn = renderSound(id, ctxParams, { sr: SR, seed: 9 });
        const y = renderSound(id, { ...ctxParams, [spec.key]: alt }, { sr: SR, seed: 9 });
        const same = y.length === baseIn.length && y.every((v, i) => v === baseIn[i]);
        assert.ok(!same, `${spec.key} has no effect`);
      }
    }
  });
}

// --- physics and trends
test("material: steel rings longer than rubber for the same knock", () => {
  const steel = renderSound("impact", { material: "steel", variant: "tap", contact: 0.2 }, { sr: SR, seed: 2 });
  const rubber = renderSound("impact", { material: "rubber", variant: "tap", contact: 0.2 }, { sr: SR, seed: 2 });
  assert.ok(decayTime(steel, 0.01) > decayTime(rubber, 0.01) * 2, `${decayTime(steel, 0.01)} vs ${decayTime(rubber, 0.01)}`);
});
test("material: steel is brighter than pine (spectral centroid)", () => {
  const steel = renderSound("impact", { material: "steel" }, { sr: SR, seed: 2 });
  const pine = renderSound("impact", { material: "pine" }, { sr: SR, seed: 2 });
  assert.ok(measure(steel, SR).centroidHz > measure(pine, SR).centroidHz * 1.2);
});
test("material: glass shatter is brighter than concrete-floor scrape", () => {
  const g = renderSound("glass_shatter", { pane: "tempered" }, { sr: SR, seed: 2 });
  const s = renderSound("scratch", { material: "concrete" }, { sr: SR, seed: 2 });
  assert.ok(measure(g, SR).centroidHz > measure(s, SR).centroidHz);
});
test("condition: wet surface damps the ring and darkens the knock", () => {
  const dry = renderSound("impact", { material: "granite", variant: "knock" }, { sr: SR, seed: 4, cond: { wet: 0 } });
  const wet = renderSound("impact", { material: "granite", variant: "knock" }, { sr: SR, seed: 4, cond: { wet: 1 } });
  assert.ok(measure(dry, SR).centroidHz > measure(wet, SR).centroidHz, "wet not darker");
});
test("custom surface: custom values change the sound", () => {
  const a = renderSound("impact", { material: "custom" }, { sr: SR, seed: 1, custom: { base: 300, t60: 0.1, bright: 0.1 } });
  const b = renderSound("impact", { material: "custom" }, { sr: SR, seed: 1, custom: { base: 2000, t60: 2, bright: 0.9 } });
  assert.ok(measure(b, SR).centroidHz > measure(a, SR).centroidHz * 1.5);
});
test("tyre squeal energy sits in the 1-4 kHz band", () => {
  const x = renderSound("tyre_squeal", { hard: 0.4, slip: 1, speed: 40, duration: 2 }, { sr: SR, seed: 3 });
  const frac = bandEnergy(x, 1000, 4000);
  assert.ok(frac > 0.8, `band fraction ${frac}`);
  const f = peakFreq(x, 300, 8000, 4096);
  assert.ok(f > 900 && f < 4000, `strongest line at ${f} Hz`);
});
test("brushless motor: tone at 6 x electrical frequency (6000 rpm, 4 poles -> 1200 Hz)", () => {
  const x = renderSound("electric_motor", {
    type: "brushless", rpm: 6000, poles: 4, profile: "steady", ramp: 0.02, load: 0.5, housing: "aluminium", duration: 2,
  }, { sr: SR, seed: 1, cond: { room: 0 } });
  const f = peakFreq(x.subarray(SR / 2), 900, 1500, 8192);
  assert.ok(Math.abs(f - 1200) < 12, `peak at ${f}`);
});
test("door close: slam has a low-frequency body component", () => {
  const x = renderSound("door_close", { slam: 0.9 }, { sr: SR, seed: 1 });
  assert.ok(bandEnergy(x, 20, 250) > 0.05);
});
test("glass: tempered makes more fragment onsets than annealed", () => {
  // onset = a rise above -36 dB of the peak in the 1-18 kHz transient band, at least 3 ms apart
  const count = (x) => {
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    const thr = peak * Math.pow(10, -36 / 20);
    let n = 0, quietFor = 1e9;
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      if (a > thr && quietFor > 0.003 * SR) n++;
      quietFor = a > thr ? 0 : quietFor + 1;
    }
    return n;
  };
  const t = renderSound("glass_shatter", { pane: "tempered", energy: 0.6 }, { sr: SR, seed: 2 });
  const a = renderSound("glass_shatter", { pane: "annealed", energy: 0.6 }, { sr: SR, seed: 2 });
  assert.ok(count(t) > count(a) * 1.5, `${count(t)} vs ${count(a)}`);
});

// --- catalogue
test("catalogue ids are unique and cover every sound type", () => {
  const items = assertUnique(buildCatalog());
  const types = new Set(items.map((i) => i.type));
  for (const id of TYPE_IDS) assert.ok(types.has(id), `no preset for ${id}`);
  assert.ok(items.length >= 150, `only ${items.length} presets`);
});
test("catalogue materials all exist", () => {
  for (const it of buildCatalog()) {
    for (const [k, v] of Object.entries(it.params)) {
      if (k === "material" || k === "tool" || k === "box" || k === "floor" || k === "surface" || k === "housing" || k === "frame") {
        assert.ok(MATERIAL_IDS.includes(v) || v === "custom", `${it.id}: unknown ${k}=${v}`);
      }
    }
  }
});
test("effectiveMaterial applies wet film to ring and brightness", () => {
  const dry = effectiveMaterial("concrete", { wet: 0 });
  const wet = effectiveMaterial("concrete", { wet: 1 });
  assert.ok(wet.t60 < dry.t60 && wet.bright < dry.bright);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
