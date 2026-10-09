import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleProject, exportProject, normalizeProject, FORMAT } from '../src/model/project.js';
import { importProjectText, exportProjectText, networkToObj } from '../src/io/exchange.js';
import { buildNetwork } from '../src/geo/network.js';

test('export -> import -> export is byte identical', () => {
  const p = sampleProject();
  const t1 = exportProjectText(p);
  const r = importProjectText(t1);
  assert.deepEqual(r.errors, []);
  assert.equal(exportProjectText(r.project), t1);
});

test('imported sample builds the same network (triangle count)', () => {
  const p = sampleProject();
  const n1 = buildNetwork(p);
  const n2 = buildNetwork(importProjectText(exportProjectText(p)).project);
  assert.equal(n2.stats.triangles, n1.stats.triangles);
});

test('invalid files are rejected with field paths', () => {
  const bad = {
    format: FORMAT,
    version: 1,
    junctions: [{ id: 'J1', x: 0, z: 0 }, { id: 'J1', x: 1, z: 1 }],
    roads: [{ id: 'R1', a: 'J1', b: 'J9', lanesL: 2.5, colour: 'red', camberMode: 'sideways' }],
  };
  const r = normalizeProject(bad);
  assert.equal(r.project, null);
  const text = r.errors.join('\n');
  assert.match(text, /junctions\[1\]\.id: duplicate id "J1"/);
  assert.match(text, /roads\[0\]\.b: unknown junction "J9"/);
  assert.match(text, /roads\[0\]\.lanesL: must be a whole number/);
  assert.match(text, /roads\[0\]\.colour: must be #rrggbb/);
  assert.match(text, /roads\[0\]\.camberMode: must be one of/);
});

test('garbage text and wrong versions give readable errors, never a throw', () => {
  assert.match(importProjectText('{not json').errors[0], /not valid JSON/);
  assert.match(importProjectText('{"format":"x","version":9}').errors.join(), /format|version/);
  assert.equal(importProjectText('[]').project, null);
});

test('missing optional blocks get defaults', () => {
  const r = importProjectText(JSON.stringify({ format: FORMAT, version: 1, junctions: [{ id: 'A', x: 0, z: 0 }, { id: 'B', x: 40, z: 0 }], roads: [{ id: 'R', a: 'A', b: 'B' }] }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.project.roads[0].bridge.on, false);
  assert.equal(r.project.roads[0].marks.centre, 'dashed');
});

test('OBJ export has one group per owner and valid face indices', () => {
  const net = buildNetwork(sampleProject());
  const { obj, mtl } = networkToObj(net.chunks, 'sample');
  const lines = obj.split('\n');
  const v = lines.filter((l) => l.startsWith('v ')).length;
  const faces = lines.filter((l) => l.startsWith('f '));
  assert.ok(v > 100 && faces.length > 100);
  for (const f of faces) {
    for (const idx of f.split(' ').slice(1).map(Number)) assert.ok(idx >= 1 && idx <= v, `bad index ${idx}`);
  }
  assert.ok(lines.some((l) => l.startsWith('usemtl paving_')));
  assert.match(mtl, /newmtl asphalt/);
});
