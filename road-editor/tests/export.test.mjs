import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZip, readZip, crc32 } from '../src/export/zip.js';
import { buildObj, parseObj } from '../src/export/obj.js';
import { projectJson, parseProjectJson, bundleEntries, importFile, bundleZip } from '../src/export/project-io.js';
import { buildNetwork } from '../src/geom/network.js';
import { sampleProject, validateProject } from '../src/model/project.js';

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip store round trip keeps names and bytes', async () => {
  const bytes = createZip([
    { name: 'a.txt', data: 'hello world' },
    { name: 'dir/b.bin', data: new Uint8Array([0, 255, 1, 2, 3]) },
  ]);
  const files = await readZip(bytes);
  assert.equal(new TextDecoder().decode(files.get('a.txt')), 'hello world');
  assert.deepEqual([...files.get('dir/b.bin')], [0, 255, 1, 2, 3]);
});

test('OBJ export carries v, vt, vn, usemtl and parses back to the same triangle count', () => {
  const net = buildNetwork(sampleProject('crossroads'));
  const { obj, mtl, triangles } = buildObj(net.mesh, { name: 'test' });
  assert.match(obj, /^# Frontier/m);
  assert.equal((obj.match(/^v /gm) || []).length, [...net.mesh.groups.values()].reduce((s, g) => s + g.vertexCount, 0));
  assert.equal((obj.match(/^vt /gm) || []).length, (obj.match(/^v /gm) || []).length);
  assert.equal((obj.match(/^vn /gm) || []).length, (obj.match(/^v /gm) || []).length);
  assert.ok((obj.match(/^usemtl /gm) || []).length >= 5);
  assert.match(mtl, /newmtl asphalt/);
  const back = parseObj(obj);
  assert.equal(back.triangles, triangles);
});

test('project JSON round trips exactly', () => {
  const p = sampleProject('crossroads');
  const text = projectJson(p);
  const { project, warnings } = parseProjectJson(text);
  assert.deepEqual(project.nodes, p.nodes);
  assert.deepEqual(project.roads, p.roads);
  assert.equal(project.name, p.name);
  assert.equal(validateProject(project).errors.length, 0);
  assert.ok(Array.isArray(warnings));
});

test('bundle zip imports back as a project and as a reference OBJ', async () => {
  const p = sampleProject('valley');
  const net = buildNetwork(p);
  const zip = bundleZip(p, net.mesh, new Map(), 'valley');
  const res = await importFile('valley.zip', zip);
  assert.equal(res.kind, 'zip');
  assert.equal(res.project.roads.length, p.roads.length);
  const entries = bundleEntries(p, net.mesh, new Map(), 'valley').map((e) => e.name);
  assert.deepEqual(entries.sort(), ['README.txt', 'project.json', 'valley.mtl', 'valley.obj'].sort());
});

test('invalid project files are rejected with a message', async () => {
  await assert.rejects(importFile('bad.json', new TextEncoder().encode('{nope')), /not valid JSON/);
  assert.throws(() => parseProjectJson(JSON.stringify({ nodes: [{ id: 'a', x: 0, y: 0, z: 0 }], roads: [{ id: 'r', from: 'a', to: 'zz', points: [] }] })), /invalid project/);
});
