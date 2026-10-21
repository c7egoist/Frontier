import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore, linkForPoint, effectivePoints, setPointPosition, roadById} from '../src/state.js';
import {starterProject} from '../src/io.js';

test('commit/undo/redo round-trips labelled edits', () => {
  const store = createStore(starterProject());
  assert.equal(store.canUndo(), false);
  store.commit('add point', (p) => { p.roads[0].points.push({x: 1, z: 2, y: 3, w: 1}); });
  assert.equal(store.canUndo(), true);
  assert.equal(store.undoLabel(), 'add point');
  assert.equal(store.project.roads[0].points.length, 9);
  assert.equal(store.undo(), 'add point');
  assert.equal(store.project.roads[0].points.length, 8);
  assert.equal(store.canRedo(), true);
  store.redo();
  assert.equal(store.project.roads[0].points.length, 9);
  assert.equal(store.canRedo(), false);
});

test('transient gestures collapse to one undo step', () => {
  const store = createStore(starterProject());
  store.checkpoint('drag point');
  store.transient((p) => { p.roads[0].points[0].x = 5; });
  store.transient((p) => { p.roads[0].points[0].x = 6; });
  store.endGesture();
  assert.equal(store.undo(), 'drag point');
  assert.equal(store.project.roads[0].points[0].x, -150);
  assert.equal(store.canUndo(), false);
});

test('no-op gestures leave no history', () => {
  const store = createStore(starterProject());
  store.checkpoint('nothing');
  store.endGesture();
  assert.equal(store.canUndo(), false);
});

test('welded endpoints resolve through the junction and move together', () => {
  const store = createStore(starterProject());
  const p = store.project;
  // Starter welds r1 end to r2 start at (52, 2, 22).
  const j = linkForPoint(p, 'r1', 7);
  assert.ok(j && j.id === 'j4');
  assert.equal(linkForPoint(p, 'r1', 3), null);
  const eff = effectivePoints(p, p.roads[0]);
  assert.deepEqual([eff[7].x, eff[7].z], [52, 2]);
  // Moving the welded end moves the junction record (both roads follow).
  setPointPosition(p, 'r1', 7, 60, 9, undefined);
  assert.equal(p.junctions[0].x, 60);
  assert.equal(p.junctions[0].z, 9);
  const eff2 = effectivePoints(p, p.roads[1]);
  assert.deepEqual([eff2[0].x, eff2[0].z], [60, 9]);
  // Interior points move alone.
  setPointPosition(p, 'r1', 3, 0, 0, undefined);
  assert.equal(p.roads[0].points[3].x, 0);
  assert.equal(roadById(p, 'nope'), null);
});

test('selection clamps to surviving roads and points', () => {
  const store = createStore(starterProject());
  store.select({kind: 'point', roadId: 'r1', index: 99});
  assert.equal(store.selection.kind, 'road');
  store.select({kind: 'point', roadId: 'r1', index: 2});
  store.commit('delete road', (p) => { p.roads = p.roads.filter((r) => r.id !== 'r1'); });
  store.select(store.selection); // re-clamp path
  assert.equal(store.selection.kind, null);
  store.select({kind: 'junction', junctionId: 'j4'});
  assert.equal(store.selection.junctionId, 'j4');
});
