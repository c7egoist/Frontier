// Headless checks for the level document (no DOM, no WebGL):
//   node Experimental/LevelDesigner/Scripts/CheckLevelDesigner.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as Doc from '../LevelDocument.js';
import { buildWing, VEHICLE_PARTS } from '../../Shared/Models/ControlVehicle.js';

const here = dirname(fileURLToPath(import.meta.url));
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

await test('Lobby defaults: one locked vehicle on a locked turntable, six hotspots, neutral studio', () => {
  const l = Doc.createLobbyLevel();
  assert.equal(l.schema, Doc.LEVEL_SCHEMA);
  assert.equal(l.name, 'Lobby');
  const v = l.entities.filter((e) => e.type === 'Vehicle');
  assert.equal(v.length, 1);
  assert.ok(v[0].locked && v[0].layer === 'base');
  assert.equal(v[0].props.colours.paint, '#9fb3c8', 'the reference photo’s ice blue');
  assert.ok(l.entities.find((e) => e.type === 'Turntable').locked);
  assert.deepEqual(l.hotspots.map((h) => h.name), ['Paint', 'Front wheel', 'Rear wheel', 'Headlights', 'Interior / glass', 'Wing / trim']);
  assert.ok(l.hotspots.every((h) => h.target.entity === v[0].id && h.options.length >= 4));
  assert.equal(l.environment.preset, 'lobby');
  assert.ok(l.environment.lights.every((x) => x.locked && x.layer === 'base'));
  assert.equal(l.entities.filter((e) => e.layer === 'premium').length, 0, 'premium layer starts empty');
  assert.deepEqual(Doc.checkLevel(l), []);
});

await test('Levels/Lobby.level.json is the built-in Lobby (authored data matches the defaults)', () => {
  const file = Doc.importLevel(readFileSync(join(here, '..', 'Levels', 'Lobby.level.json'), 'utf8'));
  assert.deepEqual(file, Doc.createLobbyLevel());
});

await test('round trip: export → import is lossless', () => {
  const l = Doc.createLobbyLevel();
  Doc.addPrimitive(l, 'premium', 'plinth');
  Doc.addLight(l, 'premium', 'spot');
  const back = Doc.importLevel(Doc.exportLevel(l));
  assert.deepEqual(back, l);
});

await test('normalise: malformed input is repaired, never thrown', () => {
  const l = Doc.normaliseLevel({ name: '  ', environment: { sun: { elevation: 400, intensity: -2, color: 'red' }, studio: { gloss: 9 }, lights: [{ type: 'laser' }, { type: 'point', transform: { location: [1, 'x'] } }] }, entities: [{ type: 'Nope' }, { type: 'Primitive', props: { shape: 'teapot' } }, { id: 'E9', type: 'Primitive' }, { id: 'E9', type: 'Primitive' }], hotspots: [{ options: [{ color: 'nope' }, { color: '#ABCDEF' }], choice: 7 }] });
  assert.equal(l.name, 'Lobby');
  assert.equal(l.environment.sun.elevation, 90);
  assert.equal(l.environment.sun.intensity, 0);
  assert.equal(l.environment.sun.color, Doc.ENVIRONMENT_PRESETS.lobby.sun.color);
  assert.equal(l.environment.studio.gloss, 1);
  assert.equal(l.environment.lights.length, 1);
  assert.deepEqual(l.environment.lights[0].transform.location, [0, 0, 0]);
  assert.equal(l.entities.length, 3);
  assert.equal(l.entities[0].props.shape, 'box');
  assert.equal(new Set(l.entities.map((e) => e.id)).size, 3, 'duplicate ids are renumbered');
  assert.deepEqual(l.hotspots[0].options, [{ label: '#ABCDEF', color: '#abcdef' }]);
  assert.equal(l.hotspots[0].choice, 0);
  assert.throws(() => Doc.importLevel('{"schema":"other.v9"}'), /Unsupported schema/);
});

await test('tiers: Basic adds nothing and cannot touch premium objects; Premium owns its layer', () => {
  const l = Doc.createLobbyLevel();
  for (const r of [Doc.addPrimitive(l, 'basic', 'box'), Doc.addLight(l, 'basic', 'point'), Doc.addMesh(l, 'basic', { id: 'A1', name: 'Rim' })]) assert.ok(!r.ok && /Premium/.test(r.reason));
  const box = Doc.addPrimitive(l, 'premium', 'box', { location: [3, 0, 3] });
  assert.ok(box.ok && box.record.layer === 'premium' && !box.record.locked);
  assert.deepEqual(box.record.transform.location, [3, 0.5, 3], 'sits on the floor');
  assert.ok(Doc.queryEditable(l, box.record.id, 'premium'));
  assert.ok(!Doc.queryEditable(l, box.record.id, 'basic'));
  assert.ok(!Doc.queryShown(box.record, 'basic') && Doc.queryShown(box.record, 'premium'));
  const refused = Doc.writeTransform(l, box.record.id, 'basic', { location: [0, 0, 0] });
  assert.ok(!refused.ok && /Premium/.test(refused.reason));
  assert.ok(!Doc.removeRecord(l, box.record.id, 'basic').ok);
  assert.equal(Doc.levelStats(l, 'basic').entities, 2);
  assert.equal(Doc.levelStats(l, 'premium').entities, 3);
});

await test('locks: authored items refuse edits on every tier until unlocked', () => {
  const l = Doc.createLobbyLevel();
  const car = l.entities.find((e) => e.type === 'Vehicle');
  for (const role of Doc.ROLES) {
    assert.ok(!Doc.queryEditable(l, car.id, role));
    const r = Doc.writeTransform(l, car.id, role, { location: [1, 0, 0] });
    assert.ok(!r.ok && /locked/.test(r.reason));
  }
  assert.ok(!Doc.removeRecord(l, car.id, 'premium').ok);
  assert.ok(Doc.toggleLock(l, car.id).ok && !car.locked);
  assert.ok(Doc.writeTransform(l, car.id, 'basic', { location: [1, 0, 0] }).ok);
  assert.deepEqual(car.transform.location, [1, 0, 0]);
  const box = Doc.addPrimitive(l, 'premium', 'box').record;
  assert.ok(!Doc.toggleLock(l, box.id).ok, 'premium objects do not lock');
  assert.ok(!Doc.toggleLock(l, l.hotspots[0].id).ok, 'hotspots do not lock');
});

await test('entity operations: duplicate, remove, unique names, light budget, one vehicle', () => {
  const l = Doc.createLobbyLevel();
  const a = Doc.addPrimitive(l, 'premium', 'sphere').record;
  const b = Doc.duplicateRecord(l, a.id, 'premium').record;
  assert.notEqual(a.id, b.id);
  assert.equal(b.name, 'Sphere2');
  assert.equal(b.transform.location[0], a.transform.location[0] + 0.6);
  assert.ok(!Doc.duplicateRecord(l, a.id, 'basic').ok);
  const car = l.entities.find((e) => e.type === 'Vehicle');
  assert.ok(!Doc.duplicateRecord(l, car.id, 'premium').ok);
  const lamp = Doc.duplicateRecord(l, l.environment.lights[0].id, 'premium').record;
  assert.ok(lamp.layer === 'premium' && !lamp.locked, 'a copy of an authored light belongs to the user');
  while (l.environment.lights.length < Doc.MAX_LIGHTS) assert.ok(Doc.addLight(l, 'premium', 'point').ok);
  assert.ok(!Doc.addLight(l, 'premium', 'point').ok);
  assert.ok(Doc.checkLevel(l).some((i) => /budget/.test(i.text)));
  assert.ok(Doc.removeRecord(l, a.id, 'premium').ok);
  assert.equal(Doc.findRecord(l, a.id), null);
  Doc.toggleLock(l, car.id);
  assert.ok(Doc.removeRecord(l, car.id, 'premium').ok);
  assert.ok(l.hotspots.every((h) => h.target.entity === ''), 'hotspots lose a removed target');
  assert.ok(Doc.checkLevel(l).some((i) => /No vehicle/.test(i.text)));
});

await test('hotspots: pose in radians, capture rounds back to degrees, options recolour the target slot', () => {
  const l = Doc.createLobbyLevel();
  const wheel = l.hotspots.find((h) => h.name === 'Front wheel');
  const pose = Doc.hotspotPose(wheel);
  assert.ok(Math.abs(pose.yaw - wheel.view.yaw * Math.PI / 180) < 1e-12);
  Doc.captureView(wheel, { target: [1, 0.5, 1], yaw: Math.PI / 4, pitch: 0.1, distance: 3.21234, focal: 85 });
  assert.deepEqual(wheel.view, { target: [1, 0.5, 1], yaw: 45, pitch: 5.73, distance: 3.212, focal: 85 });
  const car = l.entities.find((e) => e.id === wheel.target.entity);
  assert.equal(Doc.applyOption(l, wheel.id, 1), '#17181a');
  assert.equal(car.props.colours.rim, '#17181a');
  assert.equal(wheel.choice, 1);
  assert.equal(Doc.applyOption(l, wheel.id, 99), null);
  const h = Doc.addHotspot(l, { target: [0, 1, 0], yaw: 10, pitch: 5, distance: 4, focal: 35 }, { target: { entity: car.id, slot: 'glass' } }).record;
  assert.equal(h.id, 'H7');
  assert.deepEqual(h.anchor, [0, 1, 0]);
  assert.ok(Doc.queryEditable(l, h.id, 'basic'), 'hotspots are authoring records on any tier');
  assert.ok(Doc.writeTransform(l, h.id, 'basic', { location: [0, 2, 0] }).ok && h.anchor[1] === 2);
});

await test('environment presets and the sun direction', () => {
  const l = Doc.createLobbyLevel();
  assert.ok(Doc.applyPreset(l, 'dusk') && l.environment.preset === 'dusk');
  assert.equal(l.environment.sun.color, Doc.ENVIRONMENT_PRESETS.dusk.sun.color);
  assert.ok(!Doc.applyPreset(l, 'nope'));
  const d = Doc.sunDirection({ azimuth: 90, elevation: 0 });
  assert.ok(Math.abs(d[0] - 1) < 1e-9 && Math.abs(d[1]) < 1e-9 && Math.abs(d[2]) < 1e-9);
  const up = Doc.sunDirection({ azimuth: 0, elevation: 90 });
  assert.ok(Math.abs(up[1] - 1) < 1e-9);
  for (const p of Object.values(Doc.ENVIRONMENT_PRESETS)) assert.ok(p.studio.gloss >= 0 && p.studio.gloss <= 1 && p.sun.elevation >= -5);
});

await test('history: undo / redo snapshots, no duplicate pushes', () => {
  const l = Doc.createLobbyLevel();
  const hist = Doc.createHistory(l);
  assert.equal(hist.undo(), null);
  Doc.addPrimitive(l, 'premium', 'box');
  assert.ok(hist.push(l));
  assert.ok(!hist.push(l), 'unchanged level is not pushed');
  const before = hist.undo();
  assert.equal(before.entities.length, 2);
  const after = hist.redo();
  assert.equal(after.entities.length, 3);
  assert.equal(hist.redo(), null);
});

await test('shared ControlVehicle: parts list and the procedural wing', () => {
  assert.deepEqual(VEHICLE_PARTS.map((p) => p.key), ['body', 'tyre', 'rim', 'wing']);
  const wing = buildWing();
  assert.equal(wing.indices.length / 3, wing.families.length);
  assert.ok(new Set(wing.families).has(8) && new Set(wing.families).has(6));
});

await test('naming rules: no banned words in Level Designer identifiers', () => {
  const banned = /\b(?:\w*And[A-Z]\w*|\w*(?:Data|Info|Manager|Helper)\b|(?:get|set|make|handle)[A-Z]\w*)/;
  for (const f of ['LevelDocument.js', 'LobbyEnvironment.js', 'LobbyScene.js', 'Gizmo.js', 'LevelDesigner.js', 'Main.js']) {
    const src = readFileSync(join(here, '..', f), 'utf8').replace(/\/\/.*$/gm, '').replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    const decl = [...src.matchAll(/\b(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
    const bad = decl.filter((n) => banned.test(n));
    assert.deepEqual(bad, [], `${f}: ${bad.join(', ')}`);
  }
});

console.log(`\n${passed} checks passed`);
