import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newProject, parseProject, serializeProject, starterProject,
  centerlineCSV, sampleGrid, createGridSampler, createDemoHills, ROAD_FORMAT
} from '../src/io.js';

test('starter project round-trips byte-stable through the codec', () => {
  const a = starterProject();
  const {project: b, warnings} = parseProject(serializeProject(a));
  assert.deepEqual(warnings, []);
  assert.deepEqual(b, a);
  assert.equal(b.format, ROAD_FORMAT);
});

test('parser repairs garbage with warnings instead of throwing', () => {
  const {project, warnings} = parseProject({format: '???', roads: [
    {id: 'r1', lanes: 99, laneWidth: -3, surface: 'marble', points: [{x: 'NaN', z: 1}, {x: 10, z: 0, y: 0}]}
  ]});
  assert.ok(warnings.length >= 2);
  assert.equal(project.roads[0].lanes, 6);
  assert.equal(project.roads[0].laneWidth, 1.5);
  assert.equal(project.roads[0].surface, 'asphalt');
  assert.equal(project.roads[0].points[0].x, 0);
  assert.throws(() => parseProject('nope{'), /valid JSON/);
});

test('centreline CSV carries stations, headings and widths', () => {
  const p = newProject('t');
  p.roads = starterProject().roads.slice(0, 1);
  const csv = centerlineCSV(p, {step: 4});
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'road_id,road_name,s_m,x_m,y_m,z_m,heading_deg,grade_pct,radius_m,width_m');
  assert.ok(lines.length > 20);
  assert.ok(lines[1].startsWith('r1,"Ridge Pass",0.00,'));
  const width = parseFloat(lines[1].split(',').pop());
  assert.ok(Math.abs(width - (2 * 3.5 + 1.2 + 1.2)) < 0.01);
});

test('bilinear grid sampling interpolates and clips', () => {
  const grid = new Float32Array([0, 10, 20, 30]); // 2x2
  assert.equal(sampleGrid(grid, 2, 2, 0, 0), 0);
  assert.equal(sampleGrid(grid, 2, 2, 1, 1), 30);
  assert.equal(sampleGrid(grid, 2, 2, 0.5, 0.5), 15);
  assert.equal(sampleGrid(grid, 2, 2, -0.1, 0), null);
  assert.equal(sampleGrid(grid, 2, 2, 0, 1.01), null);
});

test('grid sampler maps bounds and reports range', () => {
  const grid = new Float32Array([4, 6, 8, 10]);
  const s = createGridSampler(grid, 2, 2, {minX: -10, maxX: 10, minZ: -10, maxZ: 10});
  assert.equal(s.sample(-10, -10), 4);
  assert.equal(s.sample(10, 10), 10);
  assert.equal(s.sample(11, 0), null);
  assert.equal(s.minY, 4);
  assert.equal(s.maxY, 10);
});

test('demo hills are deterministic and smooth', () => {
  const a = createDemoHills({minX: -50, maxX: 50, minZ: -50, maxZ: 50}, 32);
  const b = createDemoHills({minX: -50, maxX: 50, minZ: -50, maxZ: 50}, 32);
  assert.deepEqual(a.grid, b.grid);
  let maxStep = 0;
  const w = 32;
  for (let j = 0; j < 32; j++) {
    for (let i = 1; i < w; i++) {
      maxStep = Math.max(maxStep, Math.abs(a.grid[j * w + i] - a.grid[j * w + i - 1]));
    }
  }
  assert.ok(maxStep < 4, `smooth hills, max cell step ${maxStep}`);
});
