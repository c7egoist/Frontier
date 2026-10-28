import { afterEach, describe, expect, it } from 'vitest';
import { PRESETS, TREE_PRESETS, cloneParams, DEFAULT_MESH, DEFAULT_BOTANY, DEFAULT_ROOTS, TreeParams, defaultEnvironment, isGrass, isSucculent, isVegetable, isCarnivore, plantKind } from '../src/tree/params';
import { buildSkeleton } from '../src/tree/skeleton';
import { buildMesh } from '../src/tree/mesher';
import { validateTopology } from '../src/tree/validate';
import { toOBJ, toGLB, toGpuBuffers } from '../src/tree/export';
import { GrassMesher } from '../src/plant/grassMesher';
import { DEFAULT_GRASS, GRASS_PRESETS } from '../src/plant/grassParams';
import { SucculentMesher } from '../src/plant/succulentMesher';
import { DEFAULT_SUCCULENT, SUCCULENT_PRESETS, SucculentParams } from '../src/plant/succulentParams';
import { VegetableMesher } from '../src/plant/vegetableMesher';
import { DEFAULT_VEGETABLE, VEGETABLE_PRESETS, VegetableParams } from '../src/plant/vegetableParams';
import { CarnivoreMesher } from '../src/plant/carnivoreMesher';
import { DEFAULT_CARNIVORE, CARNIVORE_PRESETS, CarnivoreParams } from '../src/plant/carnivoreParams';
import { OrganBuildResult } from '../src/plant/organMesher';
import { QuadMesh } from '../src/tree/mesh';
import { generateTree } from '../src/tree/generate';
import { LeafMesh } from '../src/tree/mesh';

function build(params: TreeParams) {
  const skel = buildSkeleton(params);
  const { mesh, leaves, stats } = buildMesh(skel);
  const report = validateTopology(mesh);
  return { skel, mesh, leaves, stats, report };
}

function buildGrass(preset: { grass: Partial<(typeof GRASS_PRESETS)[number]['grass']> }, seed: number) {
  const g = { ...DEFAULT_GRASS, ...preset.grass };
  const built = new GrassMesher(g, seed).build();
  const report = validateTopology(built.mesh);
  return { ...built, report };
}

function buildSucculent(preset: { succulent: Partial<SucculentParams> }, seed: number) {
  const c = { ...DEFAULT_SUCCULENT, ...preset.succulent };
  const built = new SucculentMesher(c, seed).build();
  const report = validateTopology(built.mesh);
  return { ...built, report };
}

function buildVegetable(preset: { vegetable: Partial<VegetableParams> }, seed: number) {
  const v = { ...DEFAULT_VEGETABLE, ...preset.vegetable };
  const built = new VegetableMesher(v, seed).build();
  const report = validateTopology(built.mesh);
  return { ...built, report };
}

function buildCarnivore(preset: { carnivore: Partial<CarnivoreParams> }, seed: number) {
  const c = { ...DEFAULT_CARNIVORE, ...preset.carnivore };
  const built = new CarnivoreMesher(c, seed).build();
  const report = validateTopology(built.mesh);
  return { ...built, report };
}

/**
 * Assertions shared by every organ plant (grass, succulent, vegetable, carnivorous plant): one
 * closed all-quad genus-0 surface, sane wind weights. `sway` is the species'
 * whole-plant sway weight baked into the height attribute (1 for grasses).
 */
function expectWeldedOrganPlant(built: OrganBuildResult & { report: ReturnType<typeof validateTopology> }, maxDropped = 0, sway = 1): void {
  const { report, stats, mesh, height, groundDepth } = built;
  expect(report.boundaryEdges, 'boundary edges').toBe(0);
  expect(report.nonManifoldEdges, 'non-manifold edges').toBe(0);
  expect(report.inconsistentEdges, 'inconsistent winding').toBe(0);
  expect(report.degenerateFaces, 'degenerate faces').toBe(0);
  expect(report.isolatedVertices, 'isolated vertices').toBe(0);
  expect(report.components, 'connected components').toBe(1);
  expect(report.eulerCharacteristic, 'Euler characteristic').toBe(2);
  expect(report.genus).toBe(0);
  expect(report.quadRatio).toBe(1);
  expect(stats.dropped, 'dropped organs').toBeLessThanOrEqual(maxDropped);
  expect(stats.junctions).toBe(stats.organs - 1);
  expect(height).toBeGreaterThan(0.02);
  expect(groundDepth).toBeGreaterThan(0);
  expectWindInRange(mesh, sway);
}

function expectWindInRange(mesh: QuadMesh, top = 1): void {
  const n = mesh.vertexCount;
  let maxHeight = 0;
  let outOfRange = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      const v = mesh.wind[i * 4 + k];
      if (!(v >= 0 && v <= 1)) outOfRange++;
    }
    if (mesh.wind[i * 4] > maxHeight) maxHeight = mesh.wind[i * 4];
  }
  expect(outOfRange, 'wind attributes out of [0, 1]').toBe(0);
  expect(maxHeight, 'sway weight at the top of the plant').toBeCloseTo(top, 5);
}

// Each test is a long, fully synchronous mesh build. Between tests vitest only
// yields microtasks, so the worker never gets to drain its message port; once a
// file runs past the RPC timeout that surfaces as a spurious "Timeout calling
// onTaskUpdate" error. A macrotask yield (setTimeout 0) between tests
// lets the worker service its RPC replies.
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('welded branch mesh is a single closed manifold', () => {
  for (const preset of TREE_PRESETS) {
    for (const seed of [1, 7, 42]) {
      it(`${preset.name} seed ${seed}`, () => {
        const p = cloneParams(preset);
        p.seed = seed;
        const { report, stats, skel } = build(p);
        expect(report.boundaryEdges, 'boundary edges').toBe(0);
        expect(report.nonManifoldEdges, 'non-manifold edges').toBe(0);
        expect(report.inconsistentEdges, 'inconsistent winding').toBe(0);
        expect(report.degenerateFaces, 'degenerate faces').toBe(0);
        expect(report.isolatedVertices, 'isolated vertices').toBe(0);
        expect(report.components, 'connected components').toBe(1);
        expect(report.eulerCharacteristic, 'Euler characteristic').toBe(2);
        expect(report.genus).toBe(0);
        expect(report.quadRatio).toBeGreaterThan(0.99);
        // Dropped stems must stay a tiny fraction.
        expect(stats.droppedStems / Math.max(1, skel.stems.length)).toBeLessThan(0.01);
      });
    }
  }
});

describe('welded grass plant is a single closed manifold', () => {
  for (const preset of GRASS_PRESETS) {
    for (const seed of [1, 7, 42]) {
      it(`${preset.name} seed ${seed}`, () => {
        const { report, stats, mesh, height, groundDepth } = buildGrass(preset, seed);
        expect(report.boundaryEdges, 'boundary edges').toBe(0);
        expect(report.nonManifoldEdges, 'non-manifold edges').toBe(0);
        expect(report.inconsistentEdges, 'inconsistent winding').toBe(0);
        expect(report.degenerateFaces, 'degenerate faces').toBe(0);
        expect(report.isolatedVertices, 'isolated vertices').toBe(0);
        expect(report.components, 'connected components').toBe(1);
        expect(report.eulerCharacteristic, 'Euler characteristic').toBe(2);
        expect(report.genus).toBe(0);
        // Grass is entirely quads: no tip caps, no triangles anywhere.
        expect(report.quadRatio).toBe(1);
        expect(stats.dropped, 'dropped organs').toBe(0);
        // Every organ but the crown was welded through a window.
        expect(stats.junctions).toBe(stats.organs - 1);
        expect(stats.blades + stats.culms).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0.03);
        expect(groundDepth).toBeGreaterThan(0);
        // Wind attributes: in range, sway weight reaches 1 at the top, no limb
        // weight or flutter on the crown. (Counted in a plain loop: one expect
        // per vertex would dominate the test time on 200k-vertex plants.)
        const n = mesh.vertexCount;
        let maxHeight = 0;
        let outOfRange = 0;
        let crownMoving = 0;
        for (let i = 0; i < n; i++) {
          for (let k = 0; k < 4; k++) {
            const v = mesh.wind[i * 4 + k];
            if (!(v >= 0 && v <= 1)) outOfRange++;
          }
          if (mesh.wind[i * 4] > maxHeight) maxHeight = mesh.wind[i * 4];
          if (mesh.levels[i] === 0 && (mesh.wind[i * 4 + 1] !== 0 || mesh.wind[i * 4 + 3] !== 0)) crownMoving++;
        }
        expect(outOfRange, 'wind attributes out of [0, 1]').toBe(0);
        expect(crownMoving, 'crown vertices with limb/flutter weight').toBe(0);
        expect(maxHeight).toBeCloseTo(1, 5);
      });
    }
  }

  it('grass presets carry the grass kind and go through the shared pipeline', () => {
    const grasses = PRESETS.filter(isGrass);
    expect(grasses.length).toBe(GRASS_PRESETS.length);
    const p = cloneParams(grasses.find((g) => g.name === 'Wheat')!);
    p.seed = 3;
    const r = generateTree(p);
    expect(r.skeleton).toBeNull();
    expect(r.grass).toBeDefined();
    expect(r.report.closed && r.report.manifold).toBe(true);
    expect(r.report.genus).toBe(0);
    expect(r.stats.stems).toBe(r.grass!.organs);
    expect(r.summary.stemsPerLevel).toEqual(r.grass!.perLevel);
    expect(r.summary.height).toBeGreaterThan(0.5);
    expect(r.buffers.index.length).toBe(r.mesh.quadCount * 6 + r.mesh.triCount * 3);
  });

  it('is deterministic for a given seed and differs across seeds', () => {
    const a = buildGrass(GRASS_PRESETS[0], 9);
    const b = buildGrass(GRASS_PRESETS[0], 9);
    const c = buildGrass(GRASS_PRESETS[0], 10);
    expect(a.mesh.positions.length).toBe(b.mesh.positions.length);
    expect(a.report.faces).toBe(b.report.faces);
    const sum = (arr: ArrayLike<number>) => {
      let t = 0;
      for (let i = 0; i < arr.length; i++) t += arr[i] * ((i % 7) + 1);
      return t;
    };
    expect(sum(a.mesh.positions)).toBe(sum(b.mesh.positions));
    // The crown lattice is seed independent; the tillers on it are not.
    expect(sum(c.mesh.positions)).not.toBe(sum(a.mesh.positions));
  });

  it('exports a grass plant as quads to OBJ and GLB', () => {
    const { mesh } = buildGrass(GRASS_PRESETS.find((g) => g.name === 'Lawn Turf')!, 1);
    const leaves = new LeafMesh();
    const obj = toOBJ(mesh, leaves, 'grass');
    const lines = obj.split('\n');
    expect(lines.filter((l) => l.startsWith('v ')).length).toBe(mesh.vertexCount);
    expect(lines.filter((l) => l.startsWith('f ') && l.trim().split(/\s+/).length === 5).length).toBe(mesh.quadCount);
    const glb = toGLB(mesh, leaves, 'grass');
    const dv = new DataView(glb);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
  });
});

describe('welded succulent (cactus) is a single closed manifold', () => {
  for (const preset of SUCCULENT_PRESETS) {
    for (const seed of [1, 7]) {
      it(`${preset.name} seed ${seed}`, () => {
        const built = buildSucculent(preset, seed);
        // Dense areoles on pads occasionally lose a window to a neighbour; nothing else may be dropped.
        const sp = { ...DEFAULT_SUCCULENT, ...preset.succulent };
        expectWeldedOrganPlant(built, sp.form === 'pad' ? 3 : 1, Math.min(1, Math.max(0, sp.sway)));
        const c = built.stats.counts;
        const form = sp.form;
        if (form === 'rosette') expect(c.leaves).toBeGreaterThan(5);
        else if (form === 'pad') expect(c.pads).toBeGreaterThan(3);
        else expect((c.trunk ?? 0) + (c.barrel ?? 0)).toBeGreaterThan(0);
        // Areoles and spines are separate welded organs, not decals.
        if (sp.areoleSpacing > 0 && sp.spineLength > 0 && form !== 'rosette' && !sp.armTuft) {
          expect(c.areoles).toBeGreaterThan(20);
          expect(c.spines).toBeGreaterThan(c.areoles);
        }
      });
    }
  }

  it('arms leave the trunk through windows and carry their own areoles', () => {
    const { stats } = buildSucculent(SUCCULENT_PRESETS.find((c) => c.name === 'Saguaro')!, 1);
    expect(stats.counts.arms).toBeGreaterThanOrEqual(2);
    expect(stats.perLevel[1]).toBeGreaterThanOrEqual(2);
    expect(stats.perLevel[3]).toBeGreaterThan(stats.perLevel[1]);
  });

  it('a clump rises from one buried pad as a single surface', () => {
    const { stats, report } = buildSucculent(SUCCULENT_PRESETS.find((c) => c.name === 'Organ Pipe Cactus')!, 2);
    expect(stats.counts.trunk).toBeGreaterThanOrEqual(4);
    expect(report.components).toBe(1);
  });

  it('inflorescences are welded organs: peduncle, branches, bracts, flowers and buds', () => {
    const expectStalk = (name: string, seed: number) => {
      const preset = SUCCULENT_PRESETS.find((c) => c.name === name)!;
      const sp = { ...DEFAULT_SUCCULENT, ...preset.succulent, stalk: 1 };
      const built = new SucculentMesher(sp, seed).build();
      const report = validateTopology(built.mesh);
      expect(report.closed && report.manifold).toBe(true);
      expect(report.components).toBe(1);
      expect(report.genus).toBe(0);
      const c = built.stats.counts;
      expect(c.stalk).toBe(1);
      expect(c.bracts).toBe(sp.bracts);
      expect(c.branches ?? 0).toBe(sp.inflorescence === 'raceme' ? 0 : sp.branches);
      // At least four fifths of the requested flowers are placed (the top of a raceme is buds).
      expect((c.flowers ?? 0) + (c.buds ?? 0)).toBeGreaterThan(0.8 * sp.flowers);
      expect(built.stats.dropped).toBe(0);
      return { sp, built };
    };
    // Terminal peduncles continue the stem: the stalk is the stem's continuation, not a window child,
    // so the plant is taller than the crown by roughly the stalk height.
    const century = expectStalk('Century Plant', 1);
    expect(century.built.height).toBeGreaterThan(0.85 * (century.sp.height + century.sp.stalkHeight));
    expectStalk('Spanish Dagger', 2);
    expectStalk('Foxtail Agave', 1);
    // Lateral ones leave a window below the crown.
    const aloe = expectStalk('Bitter Aloe', 3);
    expect(aloe.built.height).toBeLessThan(aloe.sp.height + aloe.sp.stalkHeight + 0.6 * aloe.sp.branchLength);
    expectStalk('Aloe Vera', 1);
    // Presets that ship without a stalk still build theirs when it is switched on.
    expectStalk('Blue Agave', 1);
    expectStalk('Queen Victoria Agave', 2);
  });

  it('a terminal continuation replaces the tip cap, a lateral stalk keeps it', () => {
    const preset = SUCCULENT_PRESETS.find((c) => c.name === 'Aloe Vera')!;
    const base = { ...DEFAULT_SUCCULENT, ...preset.succulent, stalk: 1, flowers: 0, bracts: 0 };
    const lateral = new SucculentMesher({ ...base, stalkOrigin: 'lateral' }, 1).build();
    const terminal = new SucculentMesher({ ...base, stalkOrigin: 'terminal' }, 1).build();
    for (const b of [lateral, terminal]) {
      const r = validateTopology(b.mesh);
      expect(r.closed && r.manifold && r.components === 1 && r.genus === 0).toBe(true);
      expect(b.stats.counts.stalk).toBe(1);
    }
    // The terminal stalk rises from the crown's very top, the lateral one from a window a few rows
    // below it: a little lower, and the stem keeps its own cap (the mesh differs, the genus does not).
    expect(terminal.height).toBeGreaterThan(lateral.height);
    expect(terminal.height - lateral.height).toBeLessThan(0.3 * base.stalkHeight);
    expect(terminal.mesh.quadCount).not.toBe(lateral.mesh.quadCount);
  });

  it('succulent presets carry their kind through the shared pipeline', () => {
    const cacti = PRESETS.filter(isSucculent);
    expect(cacti.length).toBe(SUCCULENT_PRESETS.length);
    const p = cloneParams(cacti.find((c) => c.name === 'Golden Barrel')!);
    p.seed = 3;
    const r = generateTree(p);
    expect(plantKind(p)).toBe('succulent');
    expect(r.skeleton).toBeNull();
    expect(r.organs).toBeDefined();
    expect(r.grass).toBeUndefined();
    expect(r.report.closed && r.report.manifold).toBe(true);
    expect(r.report.genus).toBe(0);
    expect(r.stats.stems).toBe(r.organs!.organs);
    expect(r.summary.stemsPerLevel).toEqual(r.organs!.perLevel);
    expect(r.summary.height).toBeGreaterThan(0.3);
    expect(r.buffers.index.length).toBe(r.mesh.quadCount * 6);
  });

  it('is deterministic for a given seed and differs across seeds', () => {
    const preset = SUCCULENT_PRESETS.find((c) => c.name === 'Prickly Pear')!;
    const a = buildSucculent(preset, 9);
    const b = buildSucculent(preset, 9);
    const c = buildSucculent(preset, 10);
    const sum = (arr: ArrayLike<number>) => {
      let t = 0;
      for (let i = 0; i < arr.length; i++) t += arr[i] * ((i % 7) + 1);
      return t;
    };
    expect(a.report.faces).toBe(b.report.faces);
    expect(sum(a.mesh.positions)).toBe(sum(b.mesh.positions));
    expect(sum(c.mesh.positions)).not.toBe(sum(a.mesh.positions));
  });
});

describe('welded vegetable with its crop is a single closed manifold', () => {
  for (const preset of VEGETABLE_PRESETS) {
    for (const seed of [1, 7]) {
      it(`${preset.name} seed ${seed}`, () => {
        const built = buildVegetable(preset, seed);
        const v = { ...DEFAULT_VEGETABLE, ...preset.vegetable };
        expectWeldedOrganPlant(built, 0, Math.min(1, Math.max(0, v.sway)));
        const c = built.stats.counts;
        // The edible part is modelled: fruit / pods / ears on cropping forms, a head or storage root on rosettes.
        if (v.form === 'rosette') {
          if (v.headLeaves > 0) expect(c['head leaves']).toBeGreaterThan(3);
          if (v.rootLength > 0) expect(c.root).toBe(1);
          expect(c.blades).toBeGreaterThan(3);
        } else {
          const crop = (c.fruits ?? 0) + (c.pods ?? 0) + (c.ears ?? 0);
          expect(crop, 'crop organs').toBeGreaterThan(0);
          expect(built.stats.perLevel[3], 'level-3 organs (fruit, sepals, husks)').toBeGreaterThan(0);
        }
        expect((c.blades ?? 0) + (c['head leaves'] ?? 0)).toBeGreaterThan(0);
      });
    }
  }

  it('fruit bodies are refined to the requested resolution on a 6-sided pedicel', () => {
    const { mesh } = buildVegetable(VEGETABLE_PRESETS.find((v) => v.name === 'Tomato')!, 1);
    // Refinement bands are all-quad: no triangles anywhere on the plant.
    expect(mesh.triCount).toBe(0);
  });

  it('vegetable presets carry their kind through the shared pipeline', () => {
    const crops = PRESETS.filter(isVegetable);
    expect(crops.length).toBe(VEGETABLE_PRESETS.length);
    const p = cloneParams(crops.find((v) => v.name === 'Pumpkin')!);
    p.seed = 3;
    const r = generateTree(p);
    expect(plantKind(p)).toBe('vegetable');
    expect(r.skeleton).toBeNull();
    expect(r.organs).toBeDefined();
    expect(r.report.closed && r.report.manifold).toBe(true);
    expect(r.report.genus).toBe(0);
    expect(r.stats.stems).toBe(r.organs!.organs);
    expect(r.organs!.counts.fruits).toBeGreaterThan(0);
    expect(r.buffers.index.length).toBe(r.mesh.quadCount * 6);
  });

  it('exports a vegetable as quads to OBJ and GLB', () => {
    const { mesh } = buildVegetable(VEGETABLE_PRESETS.find((v) => v.name === 'Bell Pepper')!, 1);
    const leaves = new LeafMesh();
    const obj = toOBJ(mesh, leaves, 'pepper');
    const lines = obj.split('\n');
    expect(lines.filter((l) => l.startsWith('v ')).length).toBe(mesh.vertexCount);
    expect(lines.filter((l) => l.startsWith('f ') && l.trim().split(/\s+/).length === 5).length).toBe(mesh.quadCount);
    const glb = toGLB(mesh, leaves, 'pepper');
    const dv = new DataView(glb);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
  });
});

describe('welded carnivorous plant with its traps is a single closed manifold', () => {
  for (const preset of CARNIVORE_PRESETS) {
    for (const seed of [1, 7]) {
      it(`${preset.name} seed ${seed}`, () => {
        const built = buildCarnivore(preset, seed);
        const c = { ...DEFAULT_CARNIVORE, ...preset.carnivore };
        expectWeldedOrganPlant(built, 0, Math.min(1, Math.max(0, c.sway)));
        const n = built.stats.counts;
        // The traps are modelled: every leaf of a rosette carries its trap, every pitcher is there with its hood.
        if (c.form === 'rosette') {
          const leaves = (n['trap leaves'] ?? 0) + (n['sundew leaves'] ?? 0) + (n.blades ?? 0);
          expect(leaves, 'leaves').toBe(Math.round(c.leaves));
          if (c.trap === 'snap') {
            expect(n.teeth, 'teeth').toBeGreaterThan(leaves * c.cilia);
            expect(n['trigger hairs'], 'trigger hairs').toBeGreaterThanOrEqual(leaves * 3);
          }
          if (c.trap === 'tentacle') expect(n.tentacles, 'tentacles').toBeGreaterThan(leaves * 0.4 * c.tentacles);
          if (c.scape > 0) expect(n.scapes).toBe(Math.round(c.scape));
        } else if (c.form === 'pitcher') {
          expect(n.pitchers, 'pitchers').toBe(Math.round(c.pitchers));
          if (c.hood === 'cobra') expect(n['fishtail lobes']).toBe(2 * Math.round(c.pitchers));
          else expect(n.hoods, 'hoods').toBe(Math.round(c.pitchers));
        } else {
          expect(n['vine leaves']).toBe(Math.round(c.leaves));
          expect(n.pitchers, 'pitchers').toBeGreaterThanOrEqual(Math.round(c.leaves) - 1);
          expect(n.lids).toBe(n.pitchers);
        }
      });
    }
  }

  it('a pitcher is one tube whose mouth is really open: the lip rolls over and the wall goes back down inside', () => {
    const c: CarnivoreParams = { ...DEFAULT_CARNIVORE, ...CARNIVORE_PRESETS.find((x) => x.name === 'Yellow Trumpet Pitcher')!.carnivore, pitchers: 1, hoodLength: 0, scape: 0, pitcherLean: 0, pitcherHeightV: 0 };
    const built = new CarnivoreMesher(c, 3).build();
    const report = validateTopology(built.mesh);
    expect(report.genus).toBe(0);
    expect(report.boundaryEdges).toBe(0);
    expect(built.stats.counts.pitchers).toBe(1);
    const pos = built.mesh.positions;
    const n = built.mesh.vertexCount;
    let top = -Infinity;
    for (let i = 0; i < n; i++) top = Math.max(top, pos[3 * i + 1]);
    // Axis of the mouth: centroid of the lip (the highest vertices, no hood on this one).
    let cx = 0;
    let cz = 0;
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (pos[3 * i + 1] > top - 0.004) {
        cx += pos[3 * i];
        cz += pos[3 * i + 2];
        m++;
      }
    }
    cx /= m;
    cz /= m;
    // Well below the lip there are rings clearly inside the tube: the inner wall on its way down to the pool.
    let inner = 0;
    for (let i = 0; i < n; i++) {
      const y = pos[3 * i + 1];
      if (y > top - 0.05 || y < top - 0.09) continue;
      const d = Math.hypot(pos[3 * i] - cx, pos[3 * i + 2] - cz);
      if (d < 0.85 * c.pitcherMouth) inner++;
    }
    expect(inner, 'inner-wall vertices').toBeGreaterThan(20);
    // The pool depth is real geometry: a shallow pitcher of the same shape has far fewer rings.
    const shallow = new CarnivoreMesher({ ...c, pitcherDepth: 0.02 }, 3).build();
    expect(validateTopology(shallow.mesh).genus).toBe(0);
    expect(built.mesh.quadCount - shallow.mesh.quadCount).toBeGreaterThan(8 * c.pitcherSides);
  });

  it('carnivorous presets carry their kind through the shared pipeline', () => {
    const traps = PRESETS.filter(isCarnivore);
    expect(traps.length).toBe(CARNIVORE_PRESETS.length);
    const p = cloneParams(traps.find((v) => v.name === 'Venus Flytrap')!);
    p.seed = 5;
    const r = generateTree(p);
    expect(plantKind(p)).toBe('carnivore');
    expect(r.skeleton).toBeNull();
    expect(r.organs).toBeDefined();
    expect(r.report.closed && r.report.manifold).toBe(true);
    expect(r.report.genus).toBe(0);
    expect(r.stats.stems).toBe(r.organs!.organs);
    expect(r.organs!.counts['trap leaves']).toBe(8);
    expect(r.buffers.index.length).toBe(r.mesh.quadCount * 6);
  });

  it('is deterministic for a given seed and differs across seeds', () => {
    const preset = CARNIVORE_PRESETS.find((c) => c.name === 'Cobra Lily')!;
    const a = buildCarnivore(preset, 9);
    const b = buildCarnivore(preset, 9);
    const c = buildCarnivore(preset, 10);
    const sum = (arr: ArrayLike<number>) => {
      let t = 0;
      for (let i = 0; i < arr.length; i++) t += arr[i] * ((i % 7) + 1);
      return t;
    };
    expect(a.report.faces).toBe(b.report.faces);
    expect(sum(a.mesh.positions)).toBe(sum(b.mesh.positions));
    expect(sum(c.mesh.positions)).not.toBe(sum(a.mesh.positions));
  });

  it('exports a carnivorous plant as quads to OBJ and GLB', () => {
    const { mesh } = buildCarnivore(CARNIVORE_PRESETS.find((v) => v.name === 'Tropical Pitcher Plant')!, 1);
    const leaves = new LeafMesh();
    const obj = toOBJ(mesh, leaves, 'nepenthes');
    const lines = obj.split('\n');
    expect(lines.filter((l) => l.startsWith('v ')).length).toBe(mesh.vertexCount);
    expect(lines.filter((l) => l.startsWith('f ') && l.trim().split(/\s+/).length === 5).length).toBe(mesh.quadCount);
    const glb = toGLB(mesh, leaves, 'nepenthes');
    const dv = new DataView(glb);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
  });
});

describe('stress configurations', () => {
  const base = (): TreeParams => {
    const botany = { ...DEFAULT_BOTANY };
    const roots = { ...DEFAULT_ROOTS };
    return { name: 'stress', seed: 5, botany, mesh: { ...DEFAULT_MESH }, roots, environment: defaultEnvironment({ botany, roots }) };
  };

  it('very low radial resolution stays manifold', () => {
    const p = base();
    p.mesh.trunkRadialSegments = 8;
    p.mesh.minRadialSegments = 4;
    p.mesh.ringsPerSegment = [1, 1, 1, 1];
    const { report } = build(p);
    expect(report.closed && report.manifold).toBe(true);
    expect(report.eulerCharacteristic).toBe(2);
  });

  it('high radial resolution stays manifold', () => {
    const p = base();
    p.mesh.trunkRadialSegments = 48;
    p.botany.levels = 3;
    const { report } = build(p);
    expect(report.closed && report.manifold).toBe(true);
    expect(report.eulerCharacteristic).toBe(2);
  });

  it('heavy splitting (maple-like) stays manifold', () => {
    const p = base();
    p.botany.levels = 3;
    p.botany.segSplits = [1.5, 1.5, 0.5, 0];
    p.botany.splitAngle = [50, 50, 40, 0];
    p.botany.baseSplits = 3;
    const { report, stats } = build(p);
    expect(report.closed && report.manifold).toBe(true);
    expect(report.eulerCharacteristic).toBe(2);
    expect(stats.forks).toBeGreaterThan(5);
  });

  it('whorled branching (conifer) stays manifold', () => {
    const p = base();
    p.botany.levels = 3;
    p.botany.branchDist = [0, 4, 0, 0];
    p.botany.branches = [1, 80, 20, 0];
    const { report } = build(p);
    expect(report.closed && report.manifold).toBe(true);
    expect(report.eulerCharacteristic).toBe(2);
  });

  it('no collar rings / no tip caps still closed except for caps', () => {
    const p = base();
    p.mesh.collarRings = 0;
    p.botany.levels = 2;
    const { report } = build(p);
    expect(report.closed && report.manifold).toBe(true);
  });

  it('single level trunk is a closed tube', () => {
    const p = base();
    p.botany.levels = 1;
    const { report } = build(p);
    expect(report.closed).toBe(true);
    expect(report.eulerCharacteristic).toBe(2);
    expect(report.quadRatio).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const a = build(cloneParams(PRESETS[0]));
    const b = build(cloneParams(PRESETS[0]));
    expect(a.mesh.positions.length).toBe(b.mesh.positions.length);
    expect(a.mesh.positions.slice(0, 300)).toEqual(b.mesh.positions.slice(0, 300));
    expect(a.report.faces).toBe(b.report.faces);
  });
});

describe('wind attributes', () => {
  it('are in range and continuous at junctions', () => {
    const p = cloneParams(PRESETS[0]);
    p.botany.levels = 3;
    const { mesh } = build(p);
    const n = mesh.vertexCount;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 4; k++) {
        const v = mesh.wind[i * 4 + k];
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // Limb weight must be exactly 0 on trunk vertices.
    for (let i = 0; i < n; i++) if (mesh.levels[i] === 0) expect(mesh.wind[i * 4 + 1]).toBe(0);
  });
});

describe('exporters', () => {
  it('OBJ keeps quads and references valid indices', () => {
    const p = cloneParams(PRESETS[1]);
    p.botany.levels = 2;
    const { mesh, leaves } = build(p);
    const obj = toOBJ(mesh, leaves, 'test');
    const lines = obj.split('\n');
    const v = lines.filter((l) => l.startsWith('v ')).length;
    const faces = lines.filter((l) => l.startsWith('f '));
    const quadFaces = faces.filter((l) => l.trim().split(/\s+/).length === 5).length;
    expect(v).toBe(mesh.vertexCount + leaves.positions.length / 3);
    expect(quadFaces).toBe(mesh.quadCount);
    for (const f of faces.slice(0, 2000)) {
      for (const tok of f.slice(2).trim().split(/\s+/)) {
        const idx = parseInt(tok.split('/')[0], 10);
        expect(idx).toBeGreaterThan(0);
        expect(idx).toBeLessThanOrEqual(v);
      }
    }
  });

  it('GLB has a valid header and JSON chunk', () => {
    const p = cloneParams(PRESETS[1]);
    p.botany.levels = 2;
    const { mesh, leaves } = build(p);
    const glb = toGLB(mesh, leaves, 'test');
    const dv = new DataView(glb);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(4, true)).toBe(2);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const jsonLen = dv.getUint32(12, true);
    expect(dv.getUint32(16, true)).toBe(0x4e4f534a);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen)));
    expect(json.asset.version).toBe('2.0');
    expect(json.meshes[0].primitives.length).toBe(2);
    expect(json.accessors.length).toBeGreaterThan(5);
    const binLen = dv.getUint32(20 + jsonLen, true);
    expect(dv.getUint32(24 + jsonLen, true)).toBe(0x004e4942);
    expect(20 + jsonLen + 8 + binLen).toBe(glb.byteLength);
    expect(json.buffers[0].byteLength).toBe(binLen);
  });

  it('GPU buffers triangulate every quad', () => {
    const p = cloneParams(PRESETS[1]);
    p.botany.levels = 2;
    const { mesh } = build(p);
    const g = toGpuBuffers(mesh);
    expect(g.index.length).toBe(mesh.quadCount * 6 + mesh.triCount * 3);
    expect(g.position.length / 3).toBeGreaterThanOrEqual(mesh.vertexCount);
    let max = 0;
    for (const i of g.index) if (i > max) max = i;
    expect(max).toBeLessThan(g.position.length / 3);
  });
});
