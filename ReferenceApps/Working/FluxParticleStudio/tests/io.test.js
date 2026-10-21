import test from 'node:test';
import assert from 'node:assert/strict';
import {parseComposition, serialize, FLUX_FORMAT} from '../src/io.js';
import {createStore} from '../src/state.js';
import {STARTER, buildPreset} from '../src/presets.js';

test('serialize → parse round-trips a document', () => {
  const store = createStore(buildPreset(STARTER));
  const doc = parseComposition(serialize(store)).doc;
  assert.equal(doc.comp.name, store.comp.name);
  assert.equal(doc.layers.length, store.layers.length);
  assert.equal(doc.layers[0].emitter.count, store.layers[0].emitter.count);
  assert.equal(doc.layers[1].look.colB, store.layers[1].look.colB);
});

test('parse repairs garbage instead of throwing', () => {
  const {doc, warnings} = parseComposition(JSON.stringify({
    format: 'nope', comp: {duration: 999, background: 'red', bloom: {strength: 'x'}},
    layers: [{emitter: {shape: 'wormhole', count: -5}, look: {colA: 'blue'}},
      {id: 'dup'}, {id: 'dup'}],
  }));
  assert.ok(warnings.length >= 1);
  assert.equal(doc.comp.duration, 30);
  assert.equal(doc.comp.background, '#050507');
  assert.equal(doc.layers[0].emitter.shape, 'sphere');
  assert.equal(doc.layers[0].emitter.count, 100);
  assert.equal(doc.layers[0].look.colA, '#7ee7ff');
  assert.notEqual(doc.layers[1].id, doc.layers[2].id);
});

test('parse rejects non-JSON and empty docs', () => {
  assert.throws(() => parseComposition('{nope'), /JSON/);
  assert.throws(() => parseComposition('null'), /Empty/);
});

test('missing layers yield a fresh emitter', () => {
  const {doc, warnings} = parseComposition(JSON.stringify({format: FLUX_FORMAT, comp: {}}));
  assert.equal(doc.layers.length, 1);
  assert.ok(warnings.some((w) => w.includes('fresh emitter')));
});
