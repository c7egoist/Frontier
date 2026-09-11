import { afterEach, describe, expect, it } from 'vitest';
import { PRESETS, cloneParams, DEFAULT_MESH, DEFAULT_BOTANY, DEFAULT_ROOTS, TreeParams, defaultEnvironment } from '../src/tree/params';
import { buildSkeleton } from '../src/tree/skeleton';
import { buildMesh } from '../src/tree/mesher';
import { validateTopology } from '../src/tree/validate';
import { toOBJ, toGLB, toGpuBuffers } from '../src/tree/export';

function build(params: TreeParams) {
  const skel = buildSkeleton(params);
  const { mesh, leaves, stats } = buildMesh(skel);
  const report = validateTopology(mesh);
  return { skel, mesh, leaves, stats, report };
}

// Each test is a long, fully synchronous mesh build. Between tests vitest only
// yields microtasks, so the worker never gets to drain its message port; once a
// file runs past the RPC timeout that surfaces as a spurious "Timeout calling
// onTaskUpdate" error. A macrotask yield (setTimeout 0) between tests
// lets the worker service its RPC replies.
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('welded branch mesh is a single closed manifold', () => {
  for (const preset of PRESETS) {
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
