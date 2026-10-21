import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTER, PRESETS, buildPreset} from '../src/presets.js';
import {SHAPES} from '../src/shaders.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

test('starter builds a valid two-layer document', () => {
  const doc = buildPreset(STARTER);
  assert.equal(doc.layers.length, 2);
  assert.ok(doc.comp.duration >= 1);
  assert.ok(doc.selected);
});

test('every preset expands to sane layers', () => {
  assert.ok(PRESETS.length >= 7, `expected 7+ presets, got ${PRESETS.length}`);
  for (const p of PRESETS) {
    const doc = buildPreset(p);
    assert.ok(doc.layers.length >= 1, `${p.key} has layers`);
    assert.ok(doc.comp.duration >= 1 && doc.comp.duration <= 30, `${p.key} duration`);
    for (const l of doc.layers) {
      assert.ok(SHAPES.includes(l.emitter.shape), `${p.key}/${l.name} shape`);
      assert.ok(l.emitter.count >= 100 && l.emitter.count <= 20000, `${p.key}/${l.name} count`);
      assert.ok(l.emitter.life > 0 && l.emitter.life <= doc.comp.duration + 1e-6,
        `${p.key}/${l.name} life ${l.emitter.life} fits loop ${doc.comp.duration}`);
      assert.ok(l.forces.turbScale > 0, `${p.key}/${l.name} turbScale`);
      for (const k of ['colA', 'colB', 'colC']) {
        assert.ok(HEX.test(l.look[k]), `${p.key}/${l.name} ${k}=${l.look[k]}`);
      }
      assert.ok(['add', 'normal'].includes(l.look.blending), `${p.key}/${l.name} blending`);
      if (l.burst.on) {
        assert.ok(l.burst.time >= 0 && l.burst.time <= doc.comp.duration, `${p.key}/${l.name} burst time`);
        assert.ok(l.burst.power > 0, `${p.key}/${l.name} burst power`);
      }
    }
  }
});

test('presets cover all emitter shapes and both dots + streaks', () => {
  const shapes = new Set();
  let dots = 0, streaks = 0, bursts = 0;
  for (const p of PRESETS) {
    for (const l of buildPreset(p).layers) {
      shapes.add(l.emitter.shape);
      if (l.look.stretch === 0) dots++; else streaks++;
      if (l.burst.on) bursts++;
    }
  }
  assert.ok(shapes.size >= 5, `shapes: ${[...shapes].join(',')}`);
  assert.ok(dots > 0 && streaks > 0, 'dots and streaks both present');
  assert.ok(bursts > 0, 'at least one starburst preset');
});
