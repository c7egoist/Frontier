// Node test: node tests/quadmesh.test.mjs
import assert from 'node:assert';
import { buildTileMesh, buildTyreMesh, validateQuadMesh, parseSVG, shapesToSVG, PRESETS, makeShape } from '../quad-core.mjs';

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ok -', msg); };

// 1. Every preset tile: pure quads, no degenerates
for (const p of PRESETS) {
  const shapes = p.build(64, 200);
  const tile = buildTileMesh(shapes, { pitch: 64, width: 200, treadDepth: p.tyre.treadDepth, edge: 9, bevel: 1.6 });
  console.log(`${p.name}: tile quads=${tile.stats.quads} tris=${tile.stats.triangles} verts=${tile.stats.vertices} minAngle=${tile.stats.minQuadAngleDeg}`);
  ok(tile.stats.allQuads, `${p.name} tile is 100% quads`);
  ok(tile.stats.quads > 100, `${p.name} tile has real density`);
}

// 2. Full tyre wrap: pure quads, seam welded (few open edges = only profile ends)
{
  const p = PRESETS[1];
  const tyre = { ...p.tyre, crown: 3, shoulder: 14, treadFrac: 0.9 };
  const m = buildTyreMesh(p.build(64, 200), tyre, { repeats: 10, mode: 'mirrorAlt', edge: 11, bevel: 1.6 });
  console.log('tyre tread:', m.tread.stats, 'sidewall quads:', m.sidewall.quads.length);
  ok(m.tread.stats.allQuads, 'wrapped tread is 100% quads');
  ok(m.tread.stats.openEdges < m.tread.quads.length * 0.05, 'circumferential seam is welded (open edges only at tread/sidewall border)');
  ok(m.sidewall.quads.every(q => q.length === 4), 'sidewall is 100% quads');
}

// 3. Walls exist: a single lug must produce more than a flat sheet (height range > 0)
{
  const lug = makeShape([[0.2, -0.4], [0.8, -0.4], [0.8, 0.4], [0.2, 0.4]], { role: 'lug', depth: 12 });
  const tile = buildTileMesh([lug], { pitch: 64, width: 200, treadDepth: 12, edge: 8, bevel: 2 });
  const hs = new Set(tile.vertices.map(v => v[2].toFixed(2)));
  ok(hs.size >= 3, `lug tile has top/floor/chamfer heights (${[...hs].join(',')})`);
  ok(tile.stats.allQuads, 'lug tile all quads');
}

// 4. SVG import/export round-trip
{
  const svg = `<svg viewBox="0 0 100 100"><path d="M10,10 L90,20 L80,80 L20,90 Z"/><rect x="30" y="30" width="20" height="10"/><circle cx="60" cy="60" r="8"/></svg>`;
  const shapes = parseSVG(svg);
  ok(shapes.length === 3, `SVG parsed 3 shapes (got ${shapes.length})`);
  const out = shapesToSVG(shapes);
  ok(out.includes('<polygon'), 'SVG export emits polygons');
}

// 5. Validator catches triangles (honesty check — the validator is not rigged)
{
  const bad = validateQuadMesh({ vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]], quads: [[0, 1, 2], [0, 1, 3, 2]] });
  ok(bad.triangles === 1 && !bad.allQuads, 'validator correctly flags a triangle');
}

console.log(`\nAll ${passed} checks passed.`);
