import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCliffMesh, cliffTypeInfo } from '../cliff-core.js';

function assertWatertightTriangleSoup(positions) {
  assert.equal(positions.length % 9, 0);
  const edgeUse = new Map();
  for (let index = 0; index < positions.length; index += 9) {
    const vertices = [0, 1, 2].map((corner) => [
      positions[index + corner * 3],
      positions[index + corner * 3 + 1],
      positions[index + corner * 3 + 2],
    ].map((value) => value.toFixed(5)).join(','));
    for (let corner = 0; corner < 3; corner += 1) {
      const first = vertices[corner];
      const second = vertices[(corner + 1) % 3];
      const edge = first < second ? `${first}|${second}` : `${second}|${first}`;
      edgeUse.set(edge, (edgeUse.get(edge) ?? 0) + 1);
    }
  }
  assert.ok(edgeUse.size > 0, 'the cliff must polygonize to a non-empty surface');
  assert.ok([...edgeUse.values()].every((count) => count === 2), 'each mesh edge must be shared by two triangles with no open borders');
}

test('layered, basalt, and breccia layouts fuse into one watertight 3D mesh', () => {
  for (const cliffType of ['layered', 'basalt', 'breccia']) {
    const cliff = buildCliffMesh({
      seed: 3,
      cliffType,
      density: 68,
      opening: 100,
      resolution: { nx: 30, ny: 22, nz: 16 },
    });
    assert.ok(cliff.summary.rockCount > 100, `${cliffType} should use a clustered rock assembly`);
    assert.ok(cliff.summary.jointTraces > 0, `${cliffType} should include polygon-first joint traces`);
    assert.equal(cliff.summary.triangleCount, cliff.mesh.triangleCount);
    assert.equal(cliff.summary.watertight, true);
    assertWatertightTriangleSoup(cliff.mesh.positions);
    assert.ok([...cliff.mesh.positions].every(Number.isFinite));
  }
});

test('high relief and different seeds do not open seams in the fused shell', () => {
  const cases = [
    ['layered', 1],
    ['basalt', 1], ['basalt', 2], ['basalt', 5],
    ['breccia', 3], ['breccia', 5],
  ];
  for (const [cliffType, seed] of cases) {
    const cliff = buildCliffMesh({
      seed,
      cliffType,
      density: 68,
      opening: 100,
      resolution: { nx: 26, ny: 20, nz: 14 },
    });
    assertWatertightTriangleSoup(cliff.mesh.positions);
  }
});

test('cliff base has an irregular low-poly ridge and the rocks vary in scale', () => {
  const cliff = buildCliffMesh({
    seed: 2417,
    cliffType: 'layered',
    density: 58,
    resolution: { nx: 28, ny: 20, nz: 14 },
  });
  const ridgeHeights = cliff.base.ridge.map(([, y]) => y);
  const frontDepths = cliff.base.frontNodes.map((point) => point.z);
  const widths = cliff.rocks.map((rock) => rock.size[0]);
  assert.ok(Math.max(...ridgeHeights) - Math.min(...ridgeHeights) > 0.5, 'the cliff crown should not be a straight horizontal line');
  assert.ok(Math.max(...frontDepths) - Math.min(...frontDepths) > 0.35, 'the low-poly base should curve through depth');
  assert.ok(Math.max(...widths) / Math.min(...widths) > 2.5, 'rock widths should include visibly different scales');
});

test('base contour and face-relief controls scale the low-poly form independently', () => {
  const options = { seed: 2417, cliffType: 'layered', density: 50, resolution: { nx: 24, ny: 18, nz: 12 } };
  const subtle = buildCliffMesh({ ...options, cliffContour: 0, cliffRelief: 0 });
  const pushed = buildCliffMesh({ ...options, cliffContour: 100, cliffRelief: 100 });
  const spread = (values) => Math.max(...values) - Math.min(...values);
  assert.equal(spread(subtle.base.ridge.map(([, y]) => y)), 0);
  assert.equal(spread(subtle.base.frontNodes.map(({ z }) => z)), 0);
  assert.ok(spread(pushed.base.ridge.map(([, y]) => y)) > 0.8);
  assert.ok(spread(pushed.base.frontNodes.map(({ z }) => z)) > 1);
  assertWatertightTriangleSoup(subtle.mesh.positions);
  assertWatertightTriangleSoup(pushed.mesh.positions);
});

test('rock palettes and geometry-aware material data vary without crack textures', () => {
  const cliff = buildCliffMesh({ seed: 2417, cliffType: 'layered', resolution: { nx: 26, ny: 18, nz: 12 } });
  const paletteColors = new Set(cliff.rocks.map((rock) => rock.color.map((channel) => channel.toFixed(3)).join(',')));
  assert.ok(paletteColors.size > 20, 'individual rock forms should receive visible mineral-color variation');
  assert.equal(cliff.mesh.colors.length, cliff.mesh.positions.length);
  assert.ok(Math.max(...cliff.mesh.colors) - Math.min(...cliff.mesh.colors) > 0.25);
  assert.match(cliff.material.shading, /curvature\/AO/);
  assert.equal(cliff.material.crackTexture, false);
  assert.ok(cliff.recipe.every((rock) => rock.color?.length === 3), 'the recipe should retain each rock color');
});

test('cliff profile metadata describes distinct selectable rock mixes', () => {
  const layered = cliffTypeInfo('layered');
  const basalt = cliffTypeInfo('basalt');
  const breccia = cliffTypeInfo('breccia');
  assert.match(layered.name, /sedimentary/i);
  assert.match(basalt.name, /basalt/i);
  assert.match(breccia.name, /breccia/i);
  assert.notEqual(layered.mix, basalt.mix);
  assert.notEqual(layered.mix, breccia.mix);
});
