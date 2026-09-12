import test from 'node:test';
import assert from 'node:assert/strict';
import { SketchKernel } from '../cad-kernel.js';

const round = value => Math.round(value * 1e6) / 1e6;

test('shared vertices are topological references, not duplicate coordinates', () => {
  const sketch = new SketchKernel();
  const a = sketch.addPoint(0, 0), b = sketch.addPoint(10, 0), c = sketch.addPoint(10, 10);
  const first = sketch.addLine(a, b), second = sketch.addLine(b, c);
  sketch.movePoint(b.id, { x: 12, y: 0 });
  assert.equal(sketch.entity(first.id).b, sketch.entity(second.id).a);
  assert.deepEqual(sketch.point(b.id), { id: b.id, x: 12, y: 0, fixed: false });
});

test('a partial entity move detaches shared topology so it cannot deform an unselected curve', () => {
  const sketch = new SketchKernel();
  const a = sketch.addPoint(0, 0), b = sketch.addPoint(10, 0), c = sketch.addPoint(10, 10);
  const first = sketch.addLine(a, b), second = sketch.addLine(b, c);
  sketch.translateEntities([first.id], 5, 0);
  assert.equal(sketch.point(sketch.entity(second.id).a).x, 10);
  assert.equal(sketch.point(sketch.entity(first.id).b).x, 15);
  assert.notEqual(sketch.entity(first.id).b, sketch.entity(second.id).a);
});

test('rectangle is built as four analytical line entities with shared vertices and constraints', () => {
  const sketch = new SketchKernel();
  const sides = sketch.addRectangle({ x: 0, y: 0 }, { x: 40, y: 20 });
  assert.equal(sides.length, 4);
  assert.equal(sketch.points.length, 4);
  assert.equal(sketch.constraints.filter(c => c.type === 'horizontal').length, 2);
  assert.equal(sketch.constraints.filter(c => c.type === 'vertical').length, 2);
});

test('a driving length dimension changes the analytical line', () => {
  const sketch = new SketchKernel();
  const line = sketch.addLine({ x: 0, y: 0 }, { x: 10, y: 0 });
  const dimension = sketch.addConstraint('length', { entity: line.id, value: 25 });
  assert.equal(round(sketch.lineLength(line.id)), 25);
  sketch.updateConstraintValue(dimension.id, 40);
  assert.equal(round(sketch.lineLength(line.id)), 40);
});

test('chamfer replaces line corner endpoints and adds one analytical line', () => {
  const sketch = new SketchKernel();
  const x = sketch.addLine({ x: 0, y: 0 }, { x: 20, y: 0 });
  const y = sketch.addLine({ x: 20, y: 0 }, { x: 20, y: 20 });
  const chamfer = sketch.chamfer(x.id, y.id, 4);
  assert.equal(chamfer.type, 'line');
  assert.equal(sketch.entities.length, 3);
  assert.equal(round(sketch.lineLength(chamfer.id)), round(Math.sqrt(32)));
  sketch.assertValid();
});

test('fillet adds an analytical arc with the requested radius', () => {
  const sketch = new SketchKernel();
  const x = sketch.addLine({ x: 0, y: 0 }, { x: 20, y: 0 });
  const y = sketch.addLine({ x: 20, y: 0 }, { x: 20, y: 20 });
  const arc = sketch.fillet(x.id, y.id, 5);
  assert.equal(arc.type, 'arc');
  assert.equal(arc.radius, 5);
  assert.ok(sketch.entityLength(arc.id) > 7.8 && sketch.entityLength(arc.id) < 7.9);
  sketch.assertValid();
});

test('serialization preserves IDs and constraints', () => {
  const sketch = new SketchKernel();
  const circle = sketch.addCircle({ x: 2, y: 3 }, 7);
  sketch.addConstraint('radius', { entity: circle.id, value: 9 });
  const restored = SketchKernel.fromJSON(sketch.toJSON());
  assert.equal(restored.entity(circle.id).radius, 9);
  assert.equal(restored.constraints.length, 1);
});
