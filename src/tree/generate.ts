/**
 * One-shot generation pipeline:
 * skeleton → environment → roots → welded mesh → validation → GPU buffers.
 * Used by the worker, the tests and the CLI.
 */

import { TreeParams, DEFAULT_ROOTS } from './params';
import { buildSkeleton, Skeleton } from './skeleton';
import { buildMesh, MesherStats } from './mesher';
import { validateTopology, TopologyReport } from './validate';
import { toGpuBuffers, GpuBuffers } from './export';
import { LeafMesh, QuadMesh } from './mesh';
import { Environment, ObstacleMeshData, DEFAULT_ENVIRONMENT } from '../env/environment';
import { buildRoots } from './roots';

export interface Timings {
  skeleton: number;
  roots: number;
  mesh: number;
  validate: number;
  buffers: number;
  total: number;
}

export interface SkeletonSummary {
  stems: number;
  stemsPerLevel: number[];
  leaves: number;
  height: number;
  treeScale: number;
  /** Primary roots grown / root stems in total (primaries + laterals + fork children). */
  primaryRoots: number;
  rootStems: number;
  obstacles: number;
}

export interface GenerateResult {
  skeleton: Skeleton;
  environment: Environment;
  mesh: QuadMesh;
  leaves: LeafMesh;
  obstacles: ObstacleMeshData[];
  report: TopologyReport;
  stats: MesherStats;
  buffers: GpuBuffers;
  timings: Timings;
  summary: SkeletonSummary;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Fill in fields older parameter sets (saved presets, tests) may lack. */
export function completeParams(params: TreeParams): TreeParams {
  const p = params as Partial<TreeParams> & { botany: TreeParams['botany']; mesh: TreeParams['mesh'] };
  if (!p.roots) p.roots = { ...DEFAULT_ROOTS };
  if (!p.environment) p.environment = { ...DEFAULT_ENVIRONMENT, scatter: { ...DEFAULT_ENVIRONMENT.scatter }, obstacles: [] };
  if (p.mesh.rootRadialSegments === undefined) p.mesh.rootRadialSegments = 12;
  return p as TreeParams;
}

export function generateTree(params: TreeParams, options: { validate?: boolean; obstacleMeshes?: boolean } = {}): GenerateResult {
  completeParams(params);
  const t0 = now();
  const skeleton = buildSkeleton(params);
  const t1 = now();
  const environment = new Environment(params.environment);
  const primaries = buildRoots(skeleton, environment);
  const t2 = now();
  const { mesh, leaves, stats } = buildMesh(skeleton);
  const t3 = now();
  const report = options.validate === false ? emptyReport(mesh) : validateTopology(mesh);
  const t4 = now();
  const buffers = toGpuBuffers(mesh);
  const obstacles = options.obstacleMeshes === false ? [] : environment.meshAll();
  const t5 = now();
  return {
    skeleton,
    environment,
    mesh,
    leaves,
    obstacles,
    report,
    stats,
    buffers,
    timings: { skeleton: t1 - t0, roots: t2 - t1, mesh: t3 - t2, validate: t4 - t3, buffers: t5 - t4, total: t5 - t0 },
    summary: {
      stems: skeleton.stems.length,
      stemsPerLevel: skeleton.stemsPerLevel,
      leaves: leaves.count,
      height: skeleton.height,
      treeScale: skeleton.treeScale,
      primaryRoots: primaries.filter((r) => !r.dropped).length,
      rootStems: stats.rootStems,
      obstacles: environment.count,
    },
  };
}

function emptyReport(mesh: QuadMesh): TopologyReport {
  const F = mesh.quadCount + mesh.triCount;
  return {
    vertices: mesh.vertexCount,
    edges: 0,
    faces: F,
    quads: mesh.quadCount,
    tris: mesh.triCount,
    quadRatio: F ? mesh.quadCount / F : 1,
    boundaryEdges: 0,
    nonManifoldEdges: 0,
    inconsistentEdges: 0,
    isolatedVertices: 0,
    eulerCharacteristic: 0,
    components: 0,
    closed: false,
    manifold: false,
    poles: 0,
    valenceHistogram: {},
    degenerateFaces: 0,
    minEdgeLength: 0,
  };
}
