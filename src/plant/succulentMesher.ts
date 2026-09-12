/**
 * Succulent & cactus mesher.
 *
 * Desert plants are built with the same discipline as the trees and grasses:
 * ONE closed quad manifold. A basal dome (or a basal ring for single stems)
 * carries the primary organs; arms, child pads, spines, teeth and fruits are
 * tubes grown from windows cut into their parent's ring grid and welded with
 * collar loops. Nothing is intersected, instanced or merged, so the topology
 * validator reports a single genus-0 surface.
 *
 * Organ levels (for the Levels view and the GLB TEXCOORD_1 channel):
 *   0 base · 1 primary organs (stems, basal pads, leaves) ·
 *   2 secondary structure (arms, child pads) · 3 small organs (spines, fruits).
 */

import { QuadMesh, VertexWind } from '../tree/mesh';
import { Random } from '../core/random';
import {
  V3, UP, TAU, DEG2RAD, add, addScaled, sub, dot, cross, normalize,
  lengthSq, lerp, mod, clamp, rotateTowards, rotateAxis, scale,
} from '../core/math';
import { Line, Frame, growLine } from './line';
import { bladePoint } from './grassMesher';
import { SucculentParams, succulentHeight } from './succulentParams';

export interface SucculentStats {
  /** Organs meshed (base, stems, pads, leaves, spines, fruits). */
  organs: number;
  /** Windows welded (every organ but the base has one). */
  junctions: number;
  dropped: number;
  dropReasons: Record<string, number>;
  /** base · primary · secondary · small organs */
  perLevel: [number, number, number, number];
  stems: number;
  pads: number;
  leaves: number;
  spines: number;
  fruits: number;
}

export interface SucculentBuildResult {
  mesh: QuadMesh;
  stats: SucculentStats;
  height: number;
  /** Depth of the root ball below the ground (metres). */
  groundDepth: number;
}

/** Where a child leaves its parent: a point on the parent surface with its frame. */
interface Exit {
  pos: V3;
  /** Outward surface normal. */
  normal: V3;
  /** Parent axis direction (UP for the base). */
  dir: V3;
  /** Physical size of the window (longest side), metres. */
  size: number;
  /** Vertices of the window loop = vertices around the child's rings. */
  N: number;
}

interface Attachment {
  /** Arc length of the exit along the parent. */
  s: number;
  /** Azimuth of the exit in the parent's ring frame, radians. */
  az: number;
  /** Window size in cells. */
  w: number;
  h: number;
  /** Half height of the window along the parent, metres. */
  hh: number;
  make: (exit: Exit) => Organ;
  /** Keep the planned arc position: the planner only shifts columns. Big organs
   *  stay inside the clear bands the small organs were planned around. */
  lockS?: boolean;
  // Filled in by the planner.
  j0: number;
  row0: number;
  row1: number;
}

interface Organ {
  level: number;
  line: Line;
  /** Arc length of the first ring (collar length). */
  sStart: number;
  /** Ring vertex j of N at arc length s, in the (right, up) frame of the centreline. */
  profile: (s: number, j: number, N: number) => { x: number; y: number };
  /** Local radius (window sizing, exits of children). */
  radius: (s: number) => number;
  /** Round cross-section: the ring phase is fitted to the window. */
  round: boolean;
  /** Extra mandatory ring stations. */
  extra: number[];
  /** Regular ring spacing. */
  spacing: number;
  children: Attachment[];
  wind: (s: number, y: number) => VertexWind;
  pivot: V3;
  /** Nominal radius for the collar fillet clamp. */
  r0: number;
}

interface Ring {
  idx: number[];
  s: number;
  f: Frame;
}

interface BaseWindow {
  a0: number;
  b0: number;
  w: number;
  h: number;
  make: (exit: Exit) => Organ;
}

/** (rows, columns) offsets tried when a window does not fit where the child wants it, cheapest first. */
const OFFSETS: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [3, 0],
  [-3, 0],
  [3, 1],
  [-3, 1],
  [4, 0],
  [-4, 0],
];

/** Diagonal cluster offsets (dcol, drow) for the spines sharing one areole. */
const CLUSTER: [number, number][] = [
  [0, 0],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];


/** A reserved band on a parent grid that small organs (spines) keep clear of. */
interface ClearZone {
  s: number;
  hh: number;
  /** Centre column (float). */
  col: number;
  /** Width in columns. */
  w: number;
  /** Full-width band: ring stations inside stay clean for the big window. */
  full: boolean;
}

/**
 * Slotted position of sibling i of n in [lo, hi]: neighbours stay at least
 * `span` apart (overlapping spans pollute each other's ring rows, identical
 * spans share them). Callers use a shared s when a slot is narrower than span.
 */
function slotT(rng: { next(): number }, i: number, n: number, lo: number, hi: number, span: number): number {
  const slotW = (hi - lo) / Math.max(1, n);
  const j = slotW > span ? 0.45 * (1 - span / slotW) : 0;
  return lo + slotW * (i + 0.5 + j * 2 * (rng.next() - 0.5));
}

/** Circular distance between two columns on a ring of N. */
function colDist(a: number, b: number, N: number): number {
  const d = Math.abs(mod(a - b, N));
  return Math.min(d, N - d);
}

function inClearZone(s: number, col: number, zones: ClearZone[], N: number, hh: number): boolean {
  for (const z of zones) {
    if (z.full) {
      if (Math.abs(s - z.s) < z.hh + hh * 3) return true;
    } else if (Math.abs(s - z.s) < z.hh + hh * 2.2 && colDist(col, z.col, N) < z.w / 2 + 1.2) return true;
  }
  return false;
}

const GOLDEN = 2.399963229728653;

export class SucculentMesher {
  readonly mesh = new QuadMesh();
  private readonly g: SucculentParams;
  private readonly rng: Random;
  private readonly stemRng: Random;
  private readonly padRng: Random;
  private readonly leafRng: Random;
  private readonly spineRng: Random;
  private plantH = 1;
  private groundDepth = 0;
  private padBudget = 0;
  private stats: SucculentStats = {
    organs: 0, junctions: 0, dropped: 0, dropReasons: {}, perLevel: [0, 0, 0, 0],
    stems: 0, pads: 0, leaves: 0, spines: 0, fruits: 0,
  };

  constructor(g: SucculentParams, seed: number) {
    this.g = g;
    this.rng = new Random((seed ^ 0x5bd1e995) >>> 0);
    this.stemRng = this.rng.fork();
    this.padRng = this.rng.fork();
    this.leafRng = this.rng.fork();
    this.spineRng = this.rng.fork();
  }

  build(): SucculentBuildResult {
    this.plantH = Math.max(0.05, succulentHeight(this.g));
    const single = (this.g.habit === 'columnar' || this.g.habit === 'barrel') && Math.round(this.g.stems) <= 1;
    if (single) this.meshSingleStem();
    else this.meshBase();
    // Normalise the sway weight by the real height of the plant.
    let maxY = 1e-3;
    const p = this.mesh.positions;
    for (let i = 1; i < p.length; i += 3) if (p[i] > maxY) maxY = p[i];
    const w = this.mesh.wind;
    for (let i = 0; i < w.length; i += 4) w[i] = clamp(p[(i / 4) * 3 + 1] / maxY, 0, 1);
    return { mesh: this.mesh, stats: this.stats, height: maxY, groundDepth: this.groundDepth };
  }

  // ---------------------------------------------------------------------------
  // Single stem: a basal ring at the ground, skirt + cap below, column above
  // ---------------------------------------------------------------------------

  private meshSingleStem(): void {
    const g = this.g;
    const mesh = this.mesh;
    const R = Math.max(0.02, g.stemRadius);
    const sink = Math.max(0, g.baseSink) + 0.004 + 0.08 * R;
    const ribs = Math.max(0, Math.round(g.ribs));
    let N = ribs > 0 ? Math.max(ribs * 3, Math.round(g.stemSides / ribs) * ribs) : evenSides(g.stemSides, 12, 96);
    if (N % 2 === 1) N += Math.max(1, ribs);
    // Basal ring: slightly narrower than the stem bottom so the collar hides under it.
    const rBase = R * 0.9;
    // Basal ring: ribbed circle at the ground, counter-clockwise seen from above.
    const still: VertexWind = { height: 0, limb: 0, phase: 0, detail: 0 };
    const origin = { x: 0, y: 0, z: 0 };
    const loop: number[] = [];
    for (let j = 0; j < N; j++) {
      // Negative step: counter-clockwise seen from above, matching the stem rings.
      const th = (-TAU * j) / N;
      const r = rBase * this.ribFactor(th, ribs, g.ribDepth, g.ribSharp, TAU / N / 2);
      loop.push(mesh.addVertex(r * Math.cos(th), -sink, r * Math.sin(th), still, origin, 0, 0));
    }
    this.stats.organs++;
    this.stats.perLevel[0]++;
    // Skirt below the ground and a ladder cap (invisible, keeps the mesh closed).
    const depth = Math.max(0.03, 0.4 * R);
    this.groundDepth = sink + depth;
    const below: number[] = [];
    for (let j = 0; j < N; j++) {
      below.push(mesh.addVertex(mesh.positions[loop[j] * 3] * 0.72, -sink - depth, mesh.positions[loop[j] * 3 + 2] * 0.72, still, origin, 0, 0));
    }
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      mesh.addQuad(below[j], below[j1], loop[j1], loop[j], [j / N, -0.1, (j + 1) / N, -0.1, (j + 1) / N, 0, j / N, 0]);
    }
    this.cap([...below].reverse());
    // The column rises from the basal ring.
    const rng = this.stemRng;
    const az = rng.next() * TAU;
    const exit: Exit = {
      pos: { x: 0, y: -sink, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      dir: { x: 0, y: 1, z: 0 },
      size: 2 * rBase,
      N: loop.length,
    };
    const vals = {
      az,
      lean: (g.stemLean + g.stemLeanV * rng.uniform()) * DEG2RAD,
      height: Math.max(0.05, g.stemHeight * (1 + g.stemHeightV * rng.uniform())),
      radius: Math.max(0.008, R * (1 + g.stemRadiusV * rng.uniform())),
      phase: rng.next(),
      curveJ: rng.uniform(),
      depth: 0,
      level: 1,
    };
    const organ = this.makeStem(exit, vals);
    this.stats.stems = 1;
    this.meshTube(organ, loop, exit, 1);
  }

  // ---------------------------------------------------------------------------
  // Base: a grid dome with the primary organs laid out on a lattice of windows
  // ---------------------------------------------------------------------------

  private meshBase(): void {
    const g = this.g;
    const mesh = this.mesh;
    const R = Math.max(0.03, g.baseRadius);
    const sink = Math.max(0, g.baseSink) + 0.004;
    const H = Math.max(0, g.baseHeight);
    const prof = Math.max(1.2, g.baseProfile);

    // Window shapes per primary organ kind.
    const ribs = Math.max(0, Math.round(g.ribs));
    let stemN = evenSides(g.stemSides, 12, 72);
    if (ribs > 0) stemN = Math.max(ribs * 3, Math.round(stemN / ribs) * ribs);
    if (stemN % 2 === 1) stemN += ribs;
    const stemW = windowFor(stemN);
    const leafN = evenSides(g.leafSides, 6, 12);
    const leafW = windowFor(leafN);
    const padN = evenSides(g.padSides, 8, 14);
    const padW = windowFor(padN);

    let primaries: { w: number; h: number; make: (exit: Exit, r: number, az: number) => Organ }[];
    let count: number;
    if (g.habit === 'columnar' || g.habit === 'barrel') {
      count = Math.max(1, Math.round(g.stems));
      primaries = [{ ...stemW, make: (exit, r, az) => this.makeDomeStem(exit, r, az) }];
    } else if (g.habit === 'pads') {
      count = Math.max(1, Math.min(3, Math.round(g.padBranch)));
      this.padBudget = Math.max(1, Math.round(g.pads));
      primaries = [{ ...padW, make: (exit) => this.makePad(exit, { depth: 0, level: 1, az: this.padRng.next() * TAU, length: 0, width: 0 }) }];
    } else {
      count = Math.max(1, Math.round(g.leaves));
      primaries = [{ ...leafW, make: (exit, r, az) => this.makeDomeLeaf(exit, r, az) }];
    }
    const pw = primaries[0];
    const pitch = Math.max(pw.w, pw.h) + 1;
    const need = count;
    const S = Math.max(2, Math.ceil(Math.sqrt((Math.max(1, need) * 1.25) / 0.7)));
    const K = S * pitch + 2;

    const domePoint = (u01: number, v01: number): V3 => {
      const u = 2 * u01 - 1;
      const v = 2 * v01 - 1;
      const x = u * Math.sqrt(Math.max(0, 1 - (v * v) / 2));
      const z = v * Math.sqrt(Math.max(0, 1 - (u * u) / 2));
      const r = Math.min(1, Math.sqrt(x * x + z * z));
      const y = -sink + H * (1 - Math.pow(r, prof));
      return { x: R * x, y, z: R * z };
    };
    const domeNormal = (u01: number, v01: number): V3 => {
      const e = 0.5 / K;
      const du = sub(domePoint(Math.min(1, u01 + e), v01), domePoint(Math.max(0, u01 - e), v01));
      const dv = sub(domePoint(u01, Math.min(1, v01 + e)), domePoint(u01, Math.max(0, v01 - e)));
      const n = cross(dv, du);
      return lengthSq(n) < 1e-18 ? { x: 0, y: 1, z: 0 } : normalize(n);
    };

    type Site = { i: number; k: number; r: number; az: number; free: boolean };
    const sites: Site[][] = [];
    for (let i = 0; i < S; i++) {
      sites.push([]);
      for (let k = 0; k < S; k++) {
        const ca = 1 + i * pitch + pitch / 2;
        const cb = 1 + k * pitch + pitch / 2;
        const p = domePoint(ca / K, cb / K);
        const r = Math.sqrt(p.x * p.x + p.z * p.z) / R;
        sites[i].push({ i, k, r, az: Math.atan2(p.z, p.x), free: r <= 0.955 });
      }
    }

    const windows: BaseWindow[] = [];
    // Rosette leaves and cluster stems: weighted choice of sites (inner organs upright).
    const free: Site[] = [];
    for (const row of sites) for (const s of row) if (s.free) free.push(s);
    const keyed = free.map((s) => ({ s, key: -Math.log(Math.max(1e-9, this.rng.next())) }));
    keyed.sort((a, b) => a.key - b.key);
    // Pads start near the middle; single organs take the most central site.
    if (g.habit === 'pads' || count <= 3) keyed.sort((a, b) => a.s.r - b.s.r);
    const n = Math.min(count, keyed.length);
    if (n < count) this.drop('no room on base', count - n);
    for (let m = 0; m < n; m++) {
      const s = keyed[m].s;
      s.free = false;
      const a0 = 1 + s.i * pitch + Math.floor((pitch - pw.w) / 2);
      const b0 = 1 + s.k * pitch + Math.floor((pitch - pw.h) / 2);
      const siteR = s.r;
      const siteAz = s.az;
      windows.push({ a0, b0, w: pw.w, h: pw.h, make: (exit) => pw.make(exit, siteR, siteAz) });
    }
    if (g.habit === 'columnar' || g.habit === 'barrel') this.stats.stems = n;
    else if (g.habit === 'pads') this.stats.pads = 0; // counted as pads mesh
    else this.stats.leaves = n;

    // ---- Grid vertices ------------------------------------------------------
    const cellWin = new Int32Array(K * K).fill(-1);
    windows.forEach((win, id) => {
      for (let a = win.a0; a < win.a0 + win.w; a++) for (let b = win.b0; b < win.b0 + win.h; b++) cellWin[a * K + b] = id;
    });
    const occ = (a: number, b: number): boolean => a >= 0 && b >= 0 && a < K && b < K && cellWin[a * K + b] >= 0;
    const interior = (a: number, b: number): boolean => occ(a - 1, b - 1) && occ(a - 1, b) && occ(a, b - 1) && occ(a, b);
    const vid = new Int32Array((K + 1) * (K + 1)).fill(-1);
    const still: VertexWind = { height: 0, limb: 0, phase: 0, detail: 0 };
    const origin = { x: 0, y: 0, z: 0 };
    for (let a = 0; a <= K; a++) {
      for (let b = 0; b <= K; b++) {
        if (interior(a, b)) continue;
        const p = domePoint(a / K, b / K);
        vid[a * (K + 1) + b] = mesh.addVertex(p.x, p.y, p.z, still, origin, 0, 0);
      }
    }
    const V = (a: number, b: number): number => vid[a * (K + 1) + b];
    this.stats.organs++;
    this.stats.perLevel[0]++;

    for (let a = 0; a < K; a++) {
      for (let b = 0; b < K; b++) {
        if (cellWin[a * K + b] >= 0) continue;
        mesh.addQuad(V(a, b), V(a, b + 1), V(a + 1, b + 1), V(a + 1, b), [a / K, b / K, a / K, (b + 1) / K, (a + 1) / K, (b + 1) / K, (a + 1) / K, b / K]);
      }
    }

    // Root ball below the ground.
    const depth = Math.max(0.02, 0.35 * R);
    this.groundDepth = sink + depth;
    const rim: number[] = [];
    for (let a = 0; a < K; a++) rim.push(V(a, K));
    for (let b = K; b > 0; b--) rim.push(V(K, b));
    for (let a = K; a > 0; a--) rim.push(V(a, 0));
    for (let b = 0; b < K; b++) rim.push(V(0, b));
    const below: number[] = [];
    for (const v of rim) below.push(mesh.addVertex(mesh.positions[v * 3] * 0.8, -sink - depth, mesh.positions[v * 3 + 2] * 0.8, still, origin, 0, 0));
    const M = rim.length;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      mesh.addQuad(below[j], below[j1], rim[j1], rim[j], [j / M, -0.1, (j + 1) / M, -0.1, (j + 1) / M, 0, j / M, 0]);
    }
    this.cap([...below].reverse());

    // ---- Primary organs -------------------------------------------------------
    const cell = (2 * R) / K;
    for (const win of windows) {
      const loop: number[] = [];
      const { a0, b0, w, h } = win;
      for (let a = a0; a < a0 + w; a++) loop.push(V(a, b0 + h));
      for (let b = b0 + h; b > b0; b--) loop.push(V(a0 + w, b));
      for (let a = a0 + w; a > a0; a--) loop.push(V(a, b0));
      for (let b = b0; b < b0 + h; b++) loop.push(V(a0, b));
      const uc = (a0 + w / 2) / K;
      const vc = (b0 + h / 2) / K;
      const exit: Exit = { pos: domePoint(uc, vc), normal: domeNormal(uc, vc), dir: { x: 0, y: 1, z: 0 }, size: Math.max(w, h) * cell, N: loop.length };
      const organ = win.make(exit);
      this.meshTube(organ, loop, exit, 1);
    }
  }

  private makeDomeStem(exit: Exit, r: number, az: number): Organ {
    const g = this.g;
    const rng = this.stemRng;
    return this.makeStem(exit, {
      az: az + rng.uniform() * 0.8,
      lean: ((g.stemLean * (0.3 + 0.7 * r) + g.stemLeanV * rng.uniform()) * DEG2RAD),
      height: Math.max(0.05, g.stemHeight * (1 + g.stemHeightV * rng.uniform()) * (1 - 0.25 * r)),
      radius: Math.max(0.008, g.stemRadius * (1 + g.stemRadiusV * rng.uniform())),
      phase: rng.next(),
      curveJ: rng.uniform(),
      depth: 0,
      level: 1,
    });
  }

  private makeDomeLeaf(exit: Exit, r: number, az: number): Organ {
    const g = this.g;
    const rb = this.leafRng;
    return this.makeLeaf(exit, {
      az: az + rb.uniform() * (0.5 + 1.2 * (1 - r)),
      lean: (g.leafLean * (0.25 + 0.75 * r) + 8 * rb.uniform()) * DEG2RAD,
      length: Math.max(0.02, g.leafLength * (1 + g.leafLengthV * rb.uniform()) * (1 - 0.3 * (1 - r))),
      width: Math.max(0.008, g.leafWidth * (1 + 0.12 * rb.uniform())),
      droop: (g.leafCurve + g.leafCurveV * rb.uniform()) * DEG2RAD,
      twist: (g.leafTwist + g.leafTwistV * rb.uniform()) * DEG2RAD * (rb.next() < 0.5 ? -1 : 1),
      phase: rb.next(),
      level: 1,
    });
  }

  // ---------------------------------------------------------------------------
  // Ribbed stems (columns, barrels, arms)
  // ---------------------------------------------------------------------------

  /** Radial factor of a ribbed stem at angle `theta`. Crests at multiples of 2π/ribs. */
  private ribFactor(theta: number, ribs: number, depth: number, sharp: number, phase = 0): number {
    if (ribs < 2 || depth <= 0) return 1;
    const c = Math.cos(ribs * (theta - phase));
    const k = 1 - 0.62 * clamp(sharp, 0, 1);
    const shaped = 2 * Math.pow(0.5 + 0.5 * c, k) - 1;
    return 1 + clamp(depth, 0, 0.4) * shaped;
  }

  private makeStem(
    exit: Exit,
    v: { az: number; lean: number; height: number; radius: number; phase: number; curveJ: number; depth: number; level: number },
  ): Organ {
    const g = this.g;
    const N = exit.N;
    const L = Math.max(0.05, v.height);
    const R0 = Math.max(0.006, v.radius);
    const ribs = v.depth === 0 ? Math.max(0, Math.round(g.ribs)) : Math.max(0, Math.round(g.armRibs)) || Math.max(0, Math.round(g.ribs));
    const colStep = TAU / N;
    const A = { x: Math.cos(v.az), y: 0, z: Math.sin(v.az) };
    const dir0 = normalize(add(scale(UP, Math.cos(v.lean)), scale(A, Math.sin(v.lean))));
    const right0 = normalize(cross(UP, A));
    const curve = (v.depth === 0 ? g.stemCurve : g.armCurve) * (1 + 0.3 * v.curveJ) * DEG2RAD;
    // Arms leave the trunk sideways and turn up; plain stems bend gently.
    const up0 = v.depth === 0 ? 0 : (90 - g.armCurve * 0.4) * DEG2RAD;
    const line = growLine(exit.pos, dir0, right0, L, Math.max(10, Math.round(g.stemSegments * 1.5)), (t0, t1) => ({
      gravity: curve * (Math.pow(t1, 1.4) - Math.pow(t0, 1.4)) - (up0 > 0 ? up0 * (Math.pow(1 - t0, 2) - Math.pow(1 - t1, 2)) * 0 : 0),
      yaw: 2 * DEG2RAD * (Math.sin(TAU * (1.1 * t1 + v.phase)) - Math.sin(TAU * (1.1 * t0 + v.phase))),
    }));
    // Radius along the stem: base flare, taper, barrel profile, dome tip.
    const barrel = v.depth === 0 ? clamp(g.barrel, 0, 1) : 0;
    const taper = clamp(v.depth === 0 ? g.stemTaper : 0.15, 0, 0.9);
    const domeH = clamp(0.5 * R0 * (1 + barrel * 2.2), 0.15 * R0, 0.3 * L);
    const ctrls: [number, number][] = barrel > 0.5
      ? [[0, 0.85], [0.22, 0.96], [0.48, 1], [0.74, 0.82], [0.92, 0.52], [1, 0.3]]
      : barrel > 0.05
        ? [[0, 0.88], [0.3, 0.97], [0.55, 1], [0.8, 0.88], [1, 0.55]]
        : [[0, 1], [0.5, 1 - taper * 0.5], [1, 1 - taper]];
    const baseR = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      let r = R0 * interpControls(ctrls, t);
      if (barrel < 0.05 && t < 0.12) r *= 1 + 0.25 * (1 - t / 0.12); // root flare (columns only)
      const td = (s - (L - domeH)) / domeH;
      if (td > 0) r *= Math.pow(Math.cos((Math.PI / 2) * Math.min(1, td)), 0.65) * 0.94 + 0.06;
      return Math.max(0.15 * R0, r);
    };

    // Areole spacing for the felt mounds (spines are separate organs, below).
    const spacing = Math.max(0.008, g.areoleSpacing * (v.depth === 0 ? 1 : 0.9));
    const z0 = v.depth === 0 ? clamp(g.spineZoneMin, 0, 1) : 0;
    const z1 = v.depth === 0 ? clamp(g.spineZoneMax, 0, 1) : 1;
    const perAreole = Math.max(0, Math.round(g.spinesPerAreole));
    const children: Attachment[] = [];
    // Spine row grid shared by the felt mounds and the spine organs. Rows stay
    // clear of the collar below and the dome above so every planned areole fits.
    const sStartStem = Math.min(0.3 * L, Math.max(0.4 * exit.size, this.collarLen(R0)));
    const spineRb = Math.max(0.0002, g.spineRadius);
    let spineHh = Math.max(0.25 * ((TAU * R0) / N), 1.3 * spineRb);
    spineHh = Math.min(spineHh, spacing / 7.5);
    const gridLo = Math.max(z0 * L, sStartStem + 6 * spineHh);
    const gridHi = Math.min(z1 * L, L - 2 * spineHh);
    const gridN = Math.max(1, Math.round((gridHi - gridLo) / spacing));
    const gridHas = ribs >= 2 && z1 > z0 && gridHi > gridLo + spacing * 0.5;
    const gridS = (ri: number): number => gridLo + ((ri + 0.5) * (gridHi - gridLo)) / gridN;
    const moundH = clamp(g.areoleMound, 0, 1.5) * Math.max(0.002, R0 * 0.06);
    const ribPhase = colStep / 2;
    const radius = (s: number): number => baseR(s);
    const profile = (s: number, j: number, n: number): { x: number; y: number } => {
      const th = (TAU * j) / n;
      let r = baseR(s) * this.ribFactor(th, ribs, g.ribDepth, g.ribSharp, ribPhase);
      if (moundH > 0.0002 && gridHas) {
        // Felt mound around the nearest areole (cheap: only the closest row matters).
        const approx = ((s - gridLo) / Math.max(1e-9, gridHi - gridLo)) * gridN - 0.5;
        const rc = clamp(Math.round(approx), 0, gridN - 1);
        const sk = gridS(rc);
        const ds = (s - sk) / (0.5 * spacing);
        if (Math.abs(ds) < 2.2) {
          let dth = Math.atan2(Math.sin(th - ribPhase), Math.cos(th - ribPhase));
          dth = Math.abs(((dth * ribs) / TAU) % 1);
          dth = Math.min(dth, 1 - dth) * (TAU / ribs);
          const dt = dth / (0.5 * colStep * Math.max(2, n / Math.max(1, ribs)));
          if (Math.abs(dt) < 2.2) r += moundH * Math.exp(-ds * ds) * Math.exp(-dt * dt);
        }
      }
      return { x: r * Math.cos(th), y: r * Math.sin(th) };
    };

    // Arms (or sub-branches for the cholla). Planned before the spines so the
    // spines can keep clear of their zones.
    const zones: ClearZone[] = [];
    const maxDepth = Math.max(0, Math.round(g.branching));
    let wantArms = v.depth === 0 ? Math.max(0, Math.round(g.arms)) : v.depth <= maxDepth ? Math.max(0, Math.round(g.arms)) : 0;
    if (wantArms > 0 && v.level < 2) {
      const armR = R0 * clamp(g.armRadius, 0.15, 0.9) * Math.pow(0.72, v.depth);
      const armL0 = (v.depth === 0 ? g.armLength : g.armLength * Math.pow(0.7, v.depth)) || 0.3;
      // Arm ring size: multiple of its rib count, window w+h = N/2.
      const aRibs = Math.round(g.armRibs) || ribs;
      let aN = Math.max(12, Math.round((N * armR) / R0));
      if (aRibs > 0) {
        let mult = Math.max(3, Math.round(aN / aRibs));
        if (aRibs % 2 === 1 && mult % 2 === 1) mult++;
        aN = mult * aRibs;
      }
      if (aN % 2 === 1) aN++;
      aN = Math.min(aN, N - 4);
      if (aN % 2 === 1) aN--;
      const aw = Math.max(1, Math.round(aN / 4));
      const ah = Math.max(1, aN / 2 - aw);
      const ahh = Math.max(armR * 0.9, 0.012);
      // Siblings share one arc position when the slots are narrower than their
      // spans (identical spans tile on shared rows; overlapping spans do not).
      const armSlotW = ((g.armAttachMax - g.armAttachMin) * L) / Math.max(1, wantArms);
      const armShareS = v.depth > 0 || armSlotW < 2 * ahh + 8 * spineHh;
      const armMidT = (g.armAttachMin + g.armAttachMax) / 2;
      // Same-ring arms need a column gap between windows: cap by the ring capacity.
      if (armShareS) wantArms = Math.min(wantArms, Math.floor(N / (aw + 1)));
      for (let aI = 0; aI < wantArms; aI++) {
        const t = armShareS
          ? armMidT
          : slotT(this.stemRng, aI, wantArms, g.armAttachMin, g.armAttachMax, (2 * ahh) / L);
        const s = clamp(t, 0.08, 0.93) * L;
        const az = aI * GOLDEN + this.stemRng.uniform() * 0.6;
        const armLen = Math.max(0.06, armL0 * (1 + g.armLengthV * this.stemRng.uniform()) * (v.depth === 0 ? 1 : 0.85));
        zones.push({ s, hh: ahh, col: az / colStep, w: aw, full: true });
        children.push({
          s, az, w: aw, h: ah, hh: ahh,
          lockS: true,
          j0: 0, row0: 0, row1: 0,
          make: (ex) => {
            const out = normalize(add(scale(ex.dir, Math.cos(62 * DEG2RAD)), scale(ex.normal, Math.sin(62 * DEG2RAD))));
            const r0 = normalize(cross(ex.dir, ex.normal));
            return this.makeArm(ex, out, r0, { length: armLen, radius: armR, phase: this.stemRng.next(), depth: v.depth + 1 });
          },
        });
      }
    }

    // Fruits near the top of primary stems (one shared row: identical spans tile cleanly).
    let fruits = v.depth === 0 && v.level === 1 ? Math.max(0, Math.round(g.fruits)) : 0;
    if (fruits > 0) {
      const fr = Math.max(0.006, g.fruitRadius);
      const fw = 2, fh = 1;
      fruits = Math.min(fruits, Math.floor(N / (fw + 1)));
      const fhh = Math.max(fr * 0.8, 0.008);
      const fs = Math.min(0.94 * L, L - domeH * 0.5);
      for (let f = 0; f < fruits; f++) {
        const faz = (f / fruits) * TAU + this.spineRng.uniform() * 0.4;
        zones.push({ s: fs, hh: fhh, col: faz / colStep, w: fw, full: true });
        children.push({
          s: fs, az: faz,
          w: fw, h: fh, hh: fhh,
          lockS: true,
          j0: 0, row0: 0, row1: 0,
          make: (ex) => this.makeFruit(ex, { radius: fr, length: Math.max(0.015, g.fruitLength), phase: v.phase }),
        });
      }
    }

    // Spines: diagonal clusters on the rib crests, sharing one row height.
    // Planned last: areoles inside an arm or fruit zone are skipped.
    if (perAreole > 0 && gridHas) {
      const rb = spineRb;
      const hh = spineHh;
      const rowH = 2 * hh;
      const colsPerRib = N / ribs;
      for (let ri = 0; ri < gridN; ri++) {
        const s = gridS(ri);
        for (let m = 0; m < ribs; m++) {
          const c = Math.round((m * colsPerRib + 0.5) % N);
          const nSp = Math.min(CLUSTER.length, perAreole);
          for (let q = 0; q < nSp; q++) {
            const [dc, dr] = CLUSTER[q];
            if (inClearZone(s + dr * rowH, c + dc, zones, N, hh)) continue;
            const central = q === 0 && g.centralSpine > 0;
            const len = Math.max(0.002, g.spineLength * (central ? g.centralSpine : 1) * (1 + g.spineLengthV * 0.5 * this.spineRng.uniform()));
            children.push({
              s: s + dr * rowH,
              az: (c + dc + 0.5) * colStep,
              w: 1, h: 1, hh,
              j0: 0, row0: 0, row1: 0,
              make: (ex) => this.makeSpine(ex, { length: len, radius: rb * (central ? 1.25 : 1), angle: g.spineAngle * DEG2RAD, curve: (central ? g.spineCurve : g.spineCurve * 0.25) * DEG2RAD, phase: v.phase }),
            });
          }
        }
      }
    }

    const wind = (s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: v.level === 1 ? 0 : clamp(0.06 * (s / L), 0, 1),
      phase: v.phase,
      detail: 0,
    });
    return {
      level: v.level,
      line,
      sStart: sStartStem,
      profile,
      radius,
      round: true,
      extra: [L - domeH, L - 0.4 * domeH],
      spacing: Math.max(1e-4, L / Math.max(1, Math.round(g.stemSegments))),
      children,
      wind,
      pivot: exit.pos,
      r0: R0,
    };
  }

  /** An arm: like a stem but starting sideways and turning up. */
  private makeArm(exit: Exit, dir0: V3, right0: V3, v: { length: number; radius: number; phase: number; depth: number }): Organ {
    const g = this.g;
    const L = Math.max(0.05, v.length);
    const R0 = Math.max(0.005, v.radius);
    const ribs = Math.max(0, Math.round(g.armRibs)) || Math.max(0, Math.round(g.ribs));
    const N = exit.N;
    const colStep = TAU / N;
    // Candelabra: the arm leaves sideways and bends up to the vertical.
    const upTurn = clamp(g.armCurve, 0, 120) * DEG2RAD;
    const line = growLine(exit.pos, dir0, right0, L, Math.max(10, Math.round(g.stemSegments)), (t0, t1) => {
      // Bend towards the vertical early, then grow straight up.
      const bend = (t: number): number => -upTurn * (1 - Math.pow(1 - Math.min(1, t * 1.6), 2)) * 0.85;
      return {
        gravity: bend(t1) - bend(t0),
        yaw: 2 * DEG2RAD * (Math.sin(TAU * (1.3 * t1 + v.phase)) - Math.sin(TAU * (1.3 * t0 + v.phase))),
      };
    });
    const sStartArm = Math.min(0.3 * L, Math.max(0.4 * exit.size, this.collarLen(R0)));
    const armSpacing = Math.max(0.008, g.areoleSpacing * 0.9);
    const armRb = Math.max(0.0002, g.spineRadius);
    let armHh = Math.max(0.25 * ((TAU * R0) / N), 1.3 * armRb);
    armHh = Math.min(armHh, armSpacing / 7.5);
    const armLo = Math.max(0.05 * L, sStartArm + 6 * armHh);
    const armHi = Math.min(0.95 * L, L - 2 * armHh);
    const armGridN = Math.max(1, Math.round((armHi - armLo) / armSpacing));
    const armGridHas = ribs >= 2 && armHi > armLo + armSpacing * 0.5;
    const armGridS = (ri: number): number => armLo + ((ri + 0.5) * (armHi - armLo)) / armGridN;
    const domeH = clamp(0.6 * R0, 0.15 * R0, 0.3 * L);
    const baseR = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      let r = R0 * (1 - 0.15 * t);
      const td = (s - (L - domeH)) / domeH;
      if (td > 0) r *= Math.pow(Math.cos((Math.PI / 2) * Math.min(1, td)), 0.65) * 0.94 + 0.06;
      return Math.max(0.15 * R0, r);
    };
    const children: Attachment[] = [];
    // Sub-branches for the cholla (planned before the spines: exclusion zones).
    const zones: ClearZone[] = [];
    const maxDepth = Math.max(0, Math.round(g.branching));
    if (v.depth <= maxDepth && g.arms > 0) {
      const subR = R0 * 0.7;
      let aN = Math.max(10, Math.round((N * subR) / R0));
      if (ribs > 0) {
        let mult = Math.max(3, Math.round(aN / ribs));
        if (ribs % 2 === 1 && mult % 2 === 1) mult++;
        aN = mult * ribs;
      }
      if (aN % 2 === 1) aN++;
      aN = Math.min(aN, N - 4);
      if (aN % 2 === 1) aN--;
      const aw = Math.max(1, Math.round(aN / 4));
      const ah = Math.max(1, aN / 2 - aw);
      const nSub = Math.min(Math.max(1, Math.round(g.arms * 0.75)), Math.floor(N / (aw + 1)));
      const subHh = Math.max(subR * 0.9, 0.008);
      const subShareS = (0.48 * L) / Math.max(1, nSub) < 2 * subHh + 8 * armHh;
      for (let aI = 0; aI < nSub; aI++) {
        const s = subShareS ? 0.68 * L : slotT(this.stemRng, aI, nSub, 0.44, 0.92, (2 * subHh) / L) * L;
        const az = aI * GOLDEN + this.stemRng.uniform() * 0.8;
        zones.push({ s, hh: subHh, col: az / colStep, w: aw, full: true });
        children.push({
          s, az, w: aw, h: ah, hh: subHh,
          lockS: true,
          j0: 0, row0: 0, row1: 0,
          make: (ex) => {
            const out = normalize(add(scale(ex.dir, Math.cos(55 * DEG2RAD)), scale(ex.normal, Math.sin(55 * DEG2RAD))));
            const r0 = normalize(cross(ex.dir, ex.normal));
            return this.makeArm(ex, out, r0, { length: L * 0.7, radius: subR, phase: this.stemRng.next(), depth: v.depth + 1 });
          },
        });
      }
    }
    // Spines over the whole arm (areoles inside a sub-branch zone are skipped).
    const perAreole = Math.max(0, Math.round(g.spinesPerAreole));
    const spacing = Math.max(0.008, g.areoleSpacing * 0.9);
    const moundH = clamp(g.areoleMound, 0, 1.5) * Math.max(0.002, R0 * 0.06);
    const ribPhase = colStep / 2;
    if (perAreole > 0 && armGridHas) {
      const rb = armRb;
      const hh = armHh;
      const rowH = 2 * hh;
      const colsPerRib = N / ribs;
      for (let ri = 0; ri < armGridN; ri++) {
        const s = armGridS(ri);
        for (let m = 0; m < ribs; m++) {
          const c = Math.round((m * colsPerRib + 0.5) % N);
          const nSp = Math.min(CLUSTER.length, perAreole);
          for (let q = 0; q < nSp; q++) {
            const [dc, dr] = CLUSTER[q];
            if (inClearZone(s + dr * rowH, c + dc, zones, N, hh)) continue;
            const central = q === 0 && g.centralSpine > 0;
            const len = Math.max(0.002, g.spineLength * (central ? g.centralSpine : 1) * (1 + g.spineLengthV * 0.5 * this.spineRng.uniform()));
            children.push({
              s: s + dr * rowH, az: (c + dc + 0.5) * colStep,
              w: 1, h: 1, hh,
              j0: 0, row0: 0, row1: 0,
              make: (ex) => this.makeSpine(ex, { length: len, radius: rb * (central ? 1.25 : 1), angle: g.spineAngle * DEG2RAD, curve: (central ? g.spineCurve : g.spineCurve * 0.25) * DEG2RAD, phase: v.phase }),
            });
          }
        }
      }
    }
    const wind = (s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: clamp(0.08 * (s / L), 0, 1),
      phase: v.phase,
      detail: 0,
    });
    return {
      level: 2,
      line,
      sStart: sStartArm,
      profile: (s, j, n) => {
        const th = (TAU * j) / n;
        let r = baseR(s) * this.ribFactor(th, ribs, g.ribDepth, g.ribSharp, ribPhase);
        if (moundH > 0.0002 && armGridHas) {
          const approx = ((s - armLo) / Math.max(1e-9, armHi - armLo)) * armGridN - 0.5;
          const rc = clamp(Math.round(approx), 0, armGridN - 1);
          const sk = armGridS(rc);
          const ds = (s - sk) / (0.5 * spacing);
          if (Math.abs(ds) < 2.2) {
            let dth = Math.atan2(Math.sin(th - ribPhase), Math.cos(th - ribPhase));
            dth = Math.abs(((dth * ribs) / TAU) % 1);
            dth = Math.min(dth, 1 - dth) * (TAU / ribs);
            const dt = dth / (0.5 * colStep * Math.max(2, n / Math.max(1, ribs)));
            if (Math.abs(dt) < 2.2) r += moundH * Math.exp(-ds * ds) * Math.exp(-dt * dt);
          }
        }
        return { x: r * Math.cos(th), y: r * Math.sin(th) };
      },
      radius: (s) => baseR(s),
      round: true,
      extra: [L - domeH],
      spacing: Math.max(1e-4, L / Math.max(1, Math.round(g.stemSegments * 0.7))),
      children,
      wind,
      pivot: exit.pos,
      r0: R0,
    };
  }

  // ---------------------------------------------------------------------------
  // Pads (prickly pear)
  // ---------------------------------------------------------------------------

  private makePad(exit: Exit, v: { depth: number; level: number; az: number; length: number; width: number }): Organ {
    const g = this.g;
    const rng = this.padRng;
    if (this.padBudget > 0) this.padBudget--;
    this.stats.pads++;
    const L = v.length > 0 ? v.length : Math.max(0.06, g.padLength * (1 + g.padLengthV * rng.uniform()));
    const W = v.width > 0 ? v.width : Math.max(0.03, g.padWidth * (1 + 0.15 * rng.uniform()));
    const T = Math.max(0.006, W * clamp(g.padThickness, 0.04, 0.5));
    const N = exit.N;
    // Pads grow up from the parent face, tilted by padAngle from the face normal.
    const tilt = v.depth === 0 ? (8 + 10 * rng.next()) * DEG2RAD : clamp(g.padAngle, 5, 80) * DEG2RAD * (0.8 + 0.4 * rng.next());
    const side = rng.next() < 0.5 ? 1 : -1;
    const dir0 = v.depth === 0
      ? normalize(add(scale(UP, Math.cos(tilt)), scale({ x: Math.cos(v.az), y: 0, z: Math.sin(v.az) }, Math.sin(tilt))))
      : normalize(add(scale(exit.dir, Math.cos(tilt)), scale(exit.normal, Math.sin(tilt))));
    const right0 = normalize(cross(UP, dir0));
    void side;
    const curve = g.padCurve * DEG2RAD;
    const line = growLine(exit.pos, dir0, right0, L, Math.max(8, Math.round(g.padSegments * 1.5)), (t0, t1) => ({
      gravity: curve * (t1 - t0),
      yaw: 3 * DEG2RAD * (Math.sin(TAU * (t1 + rng.next())) - Math.sin(TAU * (t0 + rng.next()))),
    }));
    // Obovate outline: narrow base, widest past the middle, rounded tip.
    const wCtrls: [number, number][] = [[0, 0.16], [0.25, 0.62], [0.55, 1], [0.8, 0.86], [1, 0.07]];
    const tCtrls: [number, number][] = [[0, 0.3], [0.4, 1], [0.7, 0.9], [1, 0.18]];
    const wAt = (s: number): number => W * interpControls(wCtrls, clamp(s / L, 0, 1));
    const tAt = (s: number): number => T * interpControls(tCtrls, clamp(s / L, 0, 1));
    const children: Attachment[] = [];
    const colStep = TAU / N;
    const chord = (TAU * 0.5 * (W + T)) / N;
    const sStartPad = Math.min(0.3 * L, Math.max(0.35 * exit.size, this.collarLen(0.5 * W * 0.16)));
    const padSpacing = Math.max(0.008, g.areoleSpacing);
    const gloRb = Math.max(0.00015, g.spineRadius);
    let gloHh = Math.max(0.22 * chord, 1.3 * gloRb);
    gloHh = Math.min(gloHh, padSpacing / 7.5);
    const gloLo = Math.max(0.14 * L, sStartPad + 6 * gloHh);
    const gloHi = Math.min(0.86 * L, L - 2 * gloHh);
    const gloGridN = Math.max(1, Math.round((gloHi - gloLo) / padSpacing));
    const gloGridHas = gloHi > gloLo + padSpacing * 0.5;
    const gloGridS = (ri: number): number => gloLo + ((ri + 0.5) * (gloHi - gloLo)) / gloGridN;

    // Child pads from the upper faces and rim (planned before the glochids: exclusion zones).
    const zones: ClearZone[] = [];
    const maxDepth = Math.max(0, Math.round(g.padDepth));
    if (v.depth < maxDepth && (this.padBudget > 0 || v.depth === 0)) {
      const cw = 2, ch = 2; // child pads mesh with 8 rings regardless of the parent
      const nCh = Math.min(Math.max(1, Math.round(g.padBranch * (0.7 + 0.6 * rng.next()))), Math.floor(N / (cw + 1)));
      const chh0 = clamp(0.09 * W, 0.012, 0.03);
      const chShareS = ((0.75 - 0.42) * L) / Math.max(1, nCh) < 2 * chh0 + 8 * gloHh;
      for (let cI = 0; cI < nCh; cI++) {
        if (this.padBudget <= 0 && v.depth > 0) break;
        const onRim = rng.next() < 0.35;
        const az = onRim
          ? (rng.next() < 0.5 ? 0 : Math.PI) + rng.uniform() * 0.5
          : (rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + rng.uniform() * 0.7;
        const s = chShareS ? 0.6 * L : slotT(rng, cI, nCh, 0.42, 0.75, (2 * chh0) / L) * L;
        const chh = chh0;
        zones.push({ s, hh: chh, col: az / colStep, w: cw, full: true });
        children.push({
          s, az, w: cw, h: ch, hh: chh,
          lockS: true,
          j0: 0, row0: 0, row1: 0,
          make: (ex) => this.makePad(ex, {
            depth: v.depth + 1, level: 2,
            az: rng.next() * TAU,
            length: Math.max(0.05, g.padLength * (0.75 + 0.3 * rng.next()) * (1 + g.padLengthV * 0.5 * rng.uniform())),
            width: Math.max(0.025, g.padWidth * (0.75 + 0.3 * rng.next())),
          }),
        });
      }
    }

    // Tunas (fruits) along the top rim.
    if (v.depth >= 1 && g.fruits > 0) {
      const nF = v.depth === 1 ? Math.min(3, Math.max(1, Math.round(g.fruits / 3)), Math.floor(N / 2)) : 0;
      for (let f = 0; f < nF; f++) {
        if (this.stats.fruits >= Math.round(g.fruits) * 2) break;
        const tunaAz = (rng.next() < 0.5 ? 0 : Math.PI) + rng.uniform() * 0.3;
        zones.push({ s: 0.9 * L, hh: Math.max(0.012, g.fruitRadius * 0.45), col: tunaAz / colStep, w: 1, full: true });
        children.push({
          s: 0.9 * L, az: tunaAz,
          w: 1, h: 2, hh: Math.max(0.012, g.fruitRadius * 0.45),
          lockS: true,
          j0: 0, row0: 0, row1: 0,
          make: (ex) => this.makeFruit(ex, { radius: Math.max(0.008, g.fruitRadius), length: Math.max(0.02, g.fruitLength), phase: rng.next() }),
        });
      }
    } else if (v.depth === 0 && g.fruits > 0 && g.habit === 'pads') {
      // A couple of fruits on the basal pads too (they read as lower joints).
      const nFB = Math.min(2, Math.floor(N / 2));
      for (let f = 0; f < nFB; f++) {
        const tunaAz2 = rng.next() * TAU;
        zones.push({ s: 0.88 * L, hh: Math.max(0.012, g.fruitRadius * 0.45), col: tunaAz2 / colStep, w: 1, full: true });
        children.push({
          s: 0.88 * L, az: tunaAz2,
          w: 1, h: 2, hh: Math.max(0.012, g.fruitRadius * 0.45),
          lockS: true,
          j0: 0, row0: 0, row1: 0,
          make: (ex) => this.makeFruit(ex, { radius: Math.max(0.008, g.fruitRadius), length: Math.max(0.02, g.fruitLength), phase: rng.next() }),
        });
      }
    }

    // Glochids / spines in rows on both faces and the rim (skipped inside child-pad and fruit zones).
    const perAreole = Math.max(0, Math.round(g.spinesPerAreole));
    const spacing = Math.max(0.008, g.areoleSpacing);
    // Face columns: theta=90° (front) and 270° (back); rim columns: 0° and 180°.
    const faceCols = [Math.round(N * 0.25 - 0.5), Math.round(N * 0.75 - 0.5)];
    const rimCols = [0, Math.round(N * 0.5 - 0.5)];
    if (perAreole > 0 && gloGridHas) {
      const rb = gloRb;
      const hh = gloHh;
      const rowH = 2 * hh;
      for (let ri = 0; ri < gloGridN; ri++) {
        const s = gloGridS(ri);
        // Staggered areole grid (like the real pads): faces on even rows, rim on odd.
        const cols = ri % 2 === 0 ? faceCols : rimCols;
        for (const c of cols) {
          const nSp = Math.min(CLUSTER.length, perAreole);
          for (let q = 0; q < nSp; q++) {
            const [dc, dr] = CLUSTER[q];
            if (inClearZone(s + dr * rowH, c + dc, zones, N, hh)) continue;
            const central = q === 0 && g.centralSpine > 0;
            const len = Math.max(0.0015, g.spineLength * (central ? g.centralSpine : 1) * (1 + g.spineLengthV * 0.5 * this.spineRng.uniform()));
            children.push({
              s: s + dr * rowH, az: mod(c + dc, N) * colStep + colStep / 2,
              w: 1, h: 1, hh,
              j0: 0, row0: 0, row1: 0,
              make: (ex) => this.makeSpine(ex, { length: len, radius: rb * (central ? 1.3 : 1), angle: g.spineAngle * DEG2RAD, curve: g.spineCurve * DEG2RAD * 0.3, phase: this.spineRng.next() }),
            });
          }
        }
      }
    }

    const moundH = clamp(g.areoleMound, 0, 1.5) * Math.max(0.0015, T * 0.12);
    const wind = (s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: clamp((v.level === 1 ? 0.03 : 0.1) * (s / L), 0, 1),
      phase: 0.5,
      detail: 0,
    });
    return {
      level: v.level,
      line,
      sStart: sStartPad,
      profile: (s, j, n) => {
        const th = (TAU * j) / n;
        const w = wAt(s);
        const th2 = tAt(s);
        let x = (w / 2) * Math.cos(th);
        let y = (th2 / 2) * Math.sin(th);
        if (moundH > 0.0002) {
          // Tubercle bumps at the areole lattice.
          const approx = ((s - gloLo) / Math.max(1e-9, gloHi - gloLo)) * gloGridN - 0.5;
          const rc = gloGridHas ? clamp(Math.round(approx), 0, gloGridN - 1) : 0;
          const sk = gloGridS(rc);
          const ds = (s - sk) / (0.5 * spacing);
          if (Math.abs(ds) < 2.2) {
            const dFace = Math.min(
              Math.abs(Math.atan2(Math.sin(th - Math.PI / 2), Math.cos(th - Math.PI / 2))),
              Math.abs(Math.atan2(Math.sin(th + Math.PI / 2), Math.cos(th + Math.PI / 2))),
              Math.abs(Math.atan2(Math.sin(th), Math.cos(th))),
              Math.abs(Math.atan2(Math.sin(th - Math.PI), Math.cos(th - Math.PI))),
            );
            const dt = dFace / (0.6 * colStep);
            if (Math.abs(dt) < 2.4) {
              const b = moundH * Math.exp(-ds * ds) * Math.exp(-dt * dt);
              const l = Math.sqrt(x * x + y * y) || 1;
              x += (x / l) * b;
              y += (y / l) * b;
            }
          }
        }
        return { x, y };
      },
      radius: (s) => 0.5 * (wAt(s) + tAt(s)) * 0.5,
      round: true,
      extra: [],
      spacing: Math.max(1e-4, L / Math.max(1, Math.round(g.padSegments))),
      children,
      wind,
      pivot: exit.pos,
      r0: 0.25 * W,
    };
  }

  // ---------------------------------------------------------------------------
  // Leaves (rosette succulents)
  // ---------------------------------------------------------------------------

  private makeLeaf(exit: Exit, o: { az: number; lean: number; length: number; width: number; droop: number; twist: number; phase: number; level: number }): Organ {
    const g = this.g;
    const L = Math.max(0.02, o.length);
    const W = Math.max(0.006, o.width);
    const A = { x: Math.cos(o.az), y: 0, z: Math.sin(o.az) };
    const dir0 = normalize(add(scale(UP, Math.cos(o.lean)), scale(A, Math.sin(o.lean))));
    const right0 = normalize(cross(UP, A));
    const steps = Math.max(10, Math.round(g.leafSegments) * 2);
    // Stiff base, arching tip.
    const line = growLine(exit.pos, dir0, right0, L, steps, (t0, t1) => ({
      gravity: o.droop * (Math.pow(t1, 1.7) - Math.pow(t0, 1.7)),
      roll: o.twist * (t1 - t0),
    }));
    // Lanceolate: sheathing base, widest in the lower third, long taper to the tip.
    const wCtrls: [number, number][] = [[0, 0.72], [0.22, 1], [0.5, 0.72], [0.8, 0.3], [1, 0.035]];
    const wAt = (s: number): number => W * interpControls(wCtrls, clamp(s / L, 0, 1));
    const thick = clamp(g.leafThickness, 0.05, 0.8);
    const keel = clamp(g.leafKeel, 0, 1);
    // Marginal teeth: a sawtooth the edge vertices ride on (no extra organs).
    const teeth = Math.max(0, Math.round(g.leafTeeth));
    const toothSize = Math.max(0, g.leafToothSize);
    const teethS0 = 0.12 * L;
    const teethS1 = 0.88 * L;
    const toothAt = (s: number): number => {
      if (teeth < 1 || toothSize <= 0 || s < teethS0 || s > teethS1) return 0;
      const u = ((s - teethS0) / (teethS1 - teethS0)) * teeth;
      const f = u - Math.floor(u);
      // Sawtooth leaning towards the tip: sharp rise, gradual fall.
      const tri = f < 0.3 ? f / 0.3 : 1 - (f - 0.3) / 0.7;
      const env = Math.sin(Math.PI * clamp((s - teethS0) / (teethS1 - teethS0), 0, 1));
      return toothSize * tri * (0.35 + 0.65 * env);
    };
    const children: Attachment[] = [];
    // Terminal spine near the tip, continuing the leaf direction.
    if (g.terminalSpine > 0.001) {
      const N = exit.N;
      const tipW = wAt(0.97 * L);
      const chord = (TAU * tipW * 0.4) / N;
      const hh = Math.max(0.3 * chord, 0.004, g.terminalSpine * 0.12);
      children.push({
        s: L - 2.2 * hh, az: Math.PI / 2,
        w: 1, h: 1, hh,
        j0: 0, row0: 0, row1: 0,
        make: (ex) => this.makeSpine(ex, { length: g.terminalSpine, radius: Math.max(0.0004, g.terminalSpine * 0.045), angle: 18 * DEG2RAD, curve: 0, phase: o.phase }),
      });
    }
    const sStart = Math.min(0.35 * L, Math.max(1.4 * W * 0.5 * 0.72, 0.8 * exit.size, this.collarLen(W * 0.2)));
    const wind = (s: number, y: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return {
        height: clamp(y / this.plantH, 0, 1),
        limb: clamp(0.25 * t * t, 0, 1),
        phase: o.phase,
        detail: clamp((t - 0.5) / 0.5, 0, 1) * 0.12,
      };
    };
    return {
      level: o.level,
      line,
      sStart,
      profile: (s, j, N) => {
        const t = clamp(s / L, 0, 1);
        const w = wAt(s);
        const th = W * thick * (1 - 0.55 * t) + w * 0.04;
        const q = bladePoint(N, j, w, th, keel, 0);
        const tooth = toothAt(s);
        if (tooth > 0) {
          // Lean the margin outwards; weight by |u| so both faces move.
          const m = N / 2;
          const u = j <= m ? 1 - (2 * j) / m : -1 + (2 * (j - m)) / m;
          const wgt = clamp((Math.abs(u) - 0.45) / 0.55, 0, 1);
          const sgn = u >= 0 ? 1 : -1;
          return { x: q.x + sgn * tooth * wgt, y: q.y + tooth * 0.18 * wgt };
        }
        return q;
      },
      radius: (s) => 0.5 * wAt(s),
      round: false,
      extra: [],
      spacing: Math.max(1e-4, (L - sStart) / Math.max(1, Math.round(g.leafSegments))),
      children,
      wind,
      pivot: exit.pos,
      r0: W * 0.3,
    };
  }

  // ---------------------------------------------------------------------------
  // Spines & fruits
  // ---------------------------------------------------------------------------

  private makeSpine(exit: Exit, v: { length: number; radius: number; angle: number; curve: number; phase: number }): Organ {
    const g = this.g;
    this.stats.spines++;
    const L = Math.max(0.0015, v.length);
    const rShaft = Math.max(0.00012, v.radius);
    const dir0 = normalize(add(scale(exit.dir, Math.cos(v.angle)), scale(exit.normal, Math.sin(v.angle))));
    const right0 = normalize(cross(exit.dir, exit.normal));
    const segs = Math.max(1, Math.round(g.spineSegments));
    const line = growLine(exit.pos, dir0, right0, L, segs * 2 + 1, (t0, t1) => ({
      gravity: v.curve * (Math.pow(t1, 1.5) - Math.pow(t0, 1.5)),
    }));
    // Areole cushion at the base, flaring to cover the window, then the shaft.
    const cushion = clamp(0.16 * exit.size, 2 * rShaft, 0.012);
    const radius = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      const neck = smoothstep(0, 0.18, t);
      const shaft = rShaft * (1 - 0.75 * t);
      return cushion + (shaft - cushion) * neck;
    };
    const wind = (_s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: 1,
      phase: v.phase,
      detail: 0,
    });
    return {
      level: 3,
      line,
      sStart: Math.min(0.3 * L, Math.max(0.4 * exit.size, this.collarLen(rShaft))),
      profile: (s, j, n) => {
        const r = radius(s);
        const th = (TAU * j) / n;
        return { x: r * Math.cos(th), y: r * Math.sin(th) };
      },
      radius,
      round: true,
      extra: L > 0.004 ? [0.18 * L] : [],
      spacing: Math.max(1e-5, L / segs),
      children: [],
      wind,
      pivot: exit.pos,
      r0: rShaft,
    };
  }

  private makeFruit(exit: Exit, v: { radius: number; length: number; phase: number }): Organ {
    this.stats.fruits++;
    const L = Math.max(0.012, v.length);
    const R0 = Math.max(0.005, v.radius);
    const dir0 = normalize(add(scale(exit.dir, Math.cos(48 * DEG2RAD)), scale(exit.normal, Math.sin(48 * DEG2RAD))));
    const right0 = normalize(cross(exit.dir, exit.normal));
    const line = growLine(exit.pos, dir0, right0, L, 8, (t0, t1) => ({ gravity: 12 * DEG2RAD * (t1 - t0) }));
    const radius = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      // Barrel-shaped: narrow at the stalk, bulging, rounded top.
      return R0 * (0.55 + 0.45 * Math.sin(Math.PI * clamp(0.12 + 0.76 * t, 0, 1))) * (1 - 0.25 * t * t);
    };
    const wind = (_s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: 1,
      phase: v.phase,
      detail: 0,
    });
    return {
      level: 3,
      line,
      sStart: Math.min(0.3 * L, Math.max(0.4 * exit.size, this.collarLen(R0))),
      profile: (s, j, n) => {
        const r = radius(s);
        const th = (TAU * j) / n;
        return { x: r * Math.cos(th), y: r * Math.sin(th) };
      },
      radius,
      round: true,
      extra: [0.5 * L],
      spacing: Math.max(1e-4, L / 5),
      children: [],
      wind,
      pivot: exit.pos,
      r0: R0,
    };
  }

  /** Distance from the exit to the first full ring: a sheath-like collar proportional to the child's size. */
  private collarLen(r: number): number {
    return Math.max(2.2 * r, 0.0015);
  }

  // ---------------------------------------------------------------------------
  // Tubes (window planning, ring stations, collars, caps)
  // ---------------------------------------------------------------------------

  private meshTube(o: Organ, loop: number[], exit: Exit, depth: number): void {
    const mesh = this.mesh;
    const N = loop.length;
    const L = o.line.length;
    const colStep = TAU / N;
    this.stats.organs++;
    this.stats.perLevel[Math.min(3, o.level)]++;

    if (o.round) {
      const f0 = o.line.at(o.sStart);
      const ph = this.fitPhase(loop, f0);
      if (Math.abs(ph) > 1e-6) {
        const rs = o.line.rights;
        for (let i = 0; i < rs.length; i++) rs[i] = rotateAxis(rs[i], o.line.dirs[i], ph);
      }
    }

    // ---- Plan the windows of the children. Big windows (arms, child pads,
    // ---- fruits) claim their space before the small ones (spines): with a
    // ---- 100:1 size ratio, s-order alone strands the big organs.
    const accepted: Attachment[] = [];
    const sizeKey = (a: Attachment): number => a.w * a.h * a.hh;
    const cands = o.children.slice().sort((a, b) => sizeKey(b) - sizeKey(a) || a.s - b.s);
    for (const c of cands) {
      const jBase = Math.round(c.az / colStep - c.w / 2);
      const sMin = o.sStart + 0.6 * c.hh;
      const sMax = L - 0.6 * c.hh;
      const epsSame = 0.6 * c.hh;
      let placed = false;
      const tries: [number, number][] = c.lockS ? [[0, 0]] : OFFSETS;
      if (c.lockS) {
        for (let k = 1; k < N; k++) {
          tries.push([0, k]);
          tries.push([0, -k]);
        }
      }
      for (const [dr, dj] of tries) {
        const s = c.s + dr * 2 * c.hh;
        const lo = s - c.hh;
        const hi = s + c.hh;
        if (lo < sMin || hi > sMax) continue;
        const j0 = mod(jBase + dj, N);
        let ok = true;
        for (const a of accepted) {
          const aLo = a.s - a.hh;
          const aHi = a.s + a.hh;
          if (circularOverlap(j0, c.w, a.j0, a.w, N)) {
            if (lo < aHi + epsSame && aLo < hi + epsSame) {
              ok = false;
              break;
            }
          } else if (circularOverlap(j0 - 1, c.w + 2, a.j0, a.w, N)) {
            if (lo < aHi - 1e-9 && aLo < hi - 1e-9) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;
        c.s = s;
        c.j0 = j0;
        c.az = (j0 + c.w / 2) * colStep;
        accepted.push(c);
        placed = true;
        break;
      }
      if (!placed) {
        if ((globalThis as any).process?.env?.SUCC_DEBUG) {
          console.log(`DROP1 lvl=${o.level} N=${loop.length} L=${L.toFixed(3)} w=${c.w} h=${c.h} hh=${c.hh.toFixed(4)} s=${c.s.toFixed(4)} az=${c.az.toFixed(2)} lockS=${c.lockS} acc=${accepted.length}`);
        }
        this.drop(L - o.sStart < 2.4 * c.hh ? 'organ too short' : 'window conflict');
      }
    }

    // ---- Ring stations.
    const st = this.stations(o, accepted);
    const K = st.length;
    const occupied = new Uint8Array(Math.max(1, K - 1) * N);
    const rows: Attachment[] = [];
    for (const c of accepted) {
      const row0 = nearestIndex(st, c.s - c.hh);
      const row1 = nearestIndex(st, c.s + c.hh);
      if (row0 < 1 || row1 > K - 1 || row1 - row0 !== c.h) {
        if ((globalThis as any).process?.env?.SUCC_DEBUG) {
          console.log(`DROP2 lvl=${o.level} N=${loop.length} L=${L.toFixed(3)} w=${c.w} h=${c.h} hh=${c.hh.toFixed(4)} s=${c.s.toFixed(4)} row0=${row0} row1=${row1} K=${K}`);
        }
        this.drop('no room on parent');
        continue;
      }
      let free = true;
      for (let i = row0; i < row1 && free; i++) for (let j = 0; j < c.w; j++) if (occupied[i * N + mod(c.j0 + j, N)]) free = false;
      if (!free) {
        this.drop('window conflict');
        continue;
      }
      for (let i = row0; i < row1; i++) for (let j = 0; j < c.w; j++) occupied[i * N + mod(c.j0 + j, N)] = 1;
      c.row0 = row0;
      c.row1 = row1;
      c.s = 0.5 * (st[row0] + st[row1]);
      rows.push(c);
    }

    // ---- Rings.
    const cellOcc = (i: number, j: number): boolean => i >= 0 && i < K - 1 && occupied[i * N + mod(j, N)] === 1;
    const interior = (i: number, j: number): boolean => cellOcc(i - 1, j - 1) && cellOcc(i - 1, j) && cellOcc(i, j - 1) && cellOcc(i, j);
    const a0 = o.line.dirs[0];
    const theta = Math.acos(clamp(dot(a0, exit.normal), -1, 1));
    const alpha = theta * 0.5 * clamp(o.sStart / Math.max(1e-6, 2.2 * o.r0), 0, 1);
    const tilt = alpha > 1e-3 ? rotateTowards(a0, exit.normal, alpha) : undefined;
    const rings: Ring[] = [];
    for (let i = 0; i < K; i++) rings.push(this.buildRing(o, st[i], N, i === 0 ? tilt : undefined, (j) => interior(i, j)));

    // ---- Collar, tube, cap.
    this.collar(loop, rings[0], exit, o);
    for (let i = 0; i < K - 1; i++) {
      const a = rings[i].idx;
      const b = rings[i + 1].idx;
      const va = st[i] / L;
      const vb = st[i + 1] / L;
      for (let j = 0; j < N; j++) {
        if (occupied[i * N + j]) continue;
        const j1 = (j + 1) % N;
        mesh.addQuad(a[j], a[j1], b[j1], b[j], [j / N, va, (j + 1) / N, va, (j + 1) / N, vb, j / N, vb]);
      }
    }
    this.cap(rings[K - 1].idx);

    // ---- Children.
    for (const c of rows) {
      const childLoop = this.holeLoop(rings, c, N);
      const f = o.line.at(c.s);
      const radial = normalize(add(scale(f.right, Math.cos(c.az)), scale(f.up, Math.sin(c.az))));
      const pos = addScaled(f.pos, radial, this.surfaceRadius(o, c.s, c.az, N));
      const childExit: Exit = { pos, normal: radial, dir: f.dir, size: Math.max(c.w * colStep * o.radius(c.s), 2 * c.hh), N: childLoop.length };
      const child = c.make(childExit);
      this.meshTube(child, childLoop, childExit, depth + 1);
    }
  }

  /** Radial distance of the parent surface at (s, az): ribs and mounds included. */
  private surfaceRadius(o: Organ, s: number, az: number, N: number): number {
    // Sample the profile at the nearest ring vertices and take the max:
    // the exit must sit on (or just outside) the ribbed surface.
    const j0 = Math.floor((az / TAU) * N);
    let r = o.radius(s);
    for (let k = 0; k <= 1; k++) {
      const q = o.profile(s, mod(j0 + k, N), N);
      const d = Math.sqrt(q.x * q.x + q.y * q.y);
      if (d > r) r = d;
    }
    return r;
  }

  private stations(o: Organ, windows: Attachment[]): number[] {
    const L = o.line.length;
    const sStart = o.sStart;
    if (L - sStart < 1e-6) return [sStart];
    type St = { s: number; pri: number };
    const spans: [number, number][] = windows.map((w) => [w.s - w.hh, w.s + w.hh]);
    const inside = (s: number): boolean => spans.some(([a, b]) => s > a + 1e-9 && s < b - 1e-9);
    const mand: St[] = [
      { s: sStart, pri: 3 },
      { s: L, pri: 3 },
    ];
    let minRow = Infinity;
    for (const w of windows) {
      mand.push({ s: w.s - w.hh, pri: 2 }, { s: w.s + w.hh, pri: 2 });
      for (let r = 1; r < w.h; r++) mand.push({ s: w.s - w.hh + (2 * w.hh * r) / w.h, pri: 2 });
      const cell = (2 * w.hh) / w.h;
      if (cell < minRow) minRow = cell;
    }
    for (const s of o.extra) if (s > sStart + 1e-6 && s < L - 1e-6 && !inside(s)) mand.push({ s, pri: 1 });
    const spacing = o.spacing;
    const eps = Math.min(spacing * 0.3, isFinite(minRow) ? minRow * 0.3 : Infinity);
    mand.sort((a, b) => a.s - b.s || b.pri - a.pri);
    const kept: St[] = [];
    for (const st of mand) {
      const last = kept[kept.length - 1];
      if (last && st.s - last.s < eps) {
        if (st.pri > last.pri) kept[kept.length - 1] = st;
        continue;
      }
      kept.push(st);
    }
    kept[kept.length - 1] = { s: L, pri: 3 };
    if (kept.length >= 2 && kept[kept.length - 1].s - kept[kept.length - 2].s < eps * 0.5) kept.splice(kept.length - 2, 1);
    const out: number[] = [];
    for (let i = 0; i < kept.length; i++) {
      out.push(kept[i].s);
      if (i === kept.length - 1) break;
      const gap = kept[i + 1].s - kept[i].s;
      if (inside(kept[i].s + 0.5 * gap)) continue;
      const n = Math.floor(gap / spacing);
      if (n >= 1) {
        const step = gap / (n + 1);
        for (let k = 1; k <= n; k++) out.push(kept[i].s + k * step);
      }
    }
    return out;
  }

  private buildRing(o: Organ, s: number, N: number, tiltNormal: V3 | undefined, skip: (j: number) => boolean): Ring {
    const f = o.line.at(s);
    const idx: number[] = new Array(N);
    const an = tiltNormal ? dot(f.dir, tiltNormal) : 1;
    for (let j = 0; j < N; j++) {
      if (skip(j)) {
        idx[j] = -1;
        continue;
      }
      const q = o.profile(s, j, N);
      const off = { x: q.x * f.right.x + q.y * f.up.x, y: q.x * f.right.y + q.y * f.up.y, z: q.x * f.right.z + q.y * f.up.z };
      if (tiltNormal && an > 0.3) {
        const lambda = -dot(off, tiltNormal) / an;
        off.x += f.dir.x * lambda;
        off.y += f.dir.y * lambda;
        off.z += f.dir.z * lambda;
      }
      const p = add(f.pos, off);
      idx[j] = this.mesh.addVertex(p.x, p.y, p.z, o.wind(s, p.y), o.pivot, o.level, 0);
    }
    return { idx, s, f };
  }

  private fitPhase(loop: number[], f: Frame): number {
    const M = loop.length;
    const xs: number[] = new Array(M);
    const ys: number[] = new Array(M);
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < M; k++) {
      const v = sub(this.pos(loop[k]), f.pos);
      xs[k] = dot(v, f.right);
      ys[k] = dot(v, f.up);
      cx += xs[k];
      cy += ys[k];
    }
    cx /= M;
    cy /= M;
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < M; k++) {
      const a = Math.atan2(ys[k] - cy, xs[k] - cx) - (TAU * k) / M;
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    return Math.atan2(sy, sx);
  }

  /** Bridge the window loop to the first ring through `collarRings` fillet loops. */
  private collar(loop: number[], first: Ring, exit: Exit, o: Organ): void {
    const mesh = this.mesh;
    const M = loop.length;
    const shift = this.bestShift(loop, first.idx);
    const lp: number[] = new Array(M);
    for (let k = 0; k < M; k++) lp[k] = loop[(k + shift) % M];
    const n = Math.max(0, Math.round(this.g.collarRings));
    const a0 = o.line.dirs[0];
    const radial = exit.normal;
    const cosT = Math.max(0.2, dot(a0, radial));
    const fillet = 0.7;
    let prev = lp;
    for (let q = 0; q < n; q++) {
      const k = (q + 1) / (n + 1);
      const mid: number[] = [];
      for (let i = 0; i < M; i++) {
        const a = this.pos(lp[i]);
        const b = this.pos(first.idx[i]);
        const chord = lerp(a, b, k);
        let mu = dot(sub(b, a), radial) / cosT;
        mu = clamp(mu, 0, 4 * o.r0);
        const c = addScaled(b, a0, -mu);
        const w0 = (1 - k) * (1 - k);
        const w1 = 2 * k * (1 - k);
        const w2 = k * k;
        const bez = { x: a.x * w0 + c.x * w1 + b.x * w2, y: a.y * w0 + c.y * w1 + b.y * w2, z: a.z * w0 + c.z * w1 + b.z * w2 };
        const p = lerp(chord, bez, fillet);
        mid.push(mesh.addVertex(p.x, p.y, p.z, o.wind(first.s * k, p.y), o.pivot, o.level, 1));
      }
      this.bridge(prev, mid);
      prev = mid;
    }
    this.bridge(prev, first.idx);
    for (const v of loop) mesh.junction[v] = 1;
    for (const v of first.idx) mesh.junction[v] = 1;
    this.stats.junctions++;
  }

  /** Cyclic shift of the loop that pairs each loop vertex with the nearest ring vertex (least twisted collar). */
  private bestShift(loop: number[], ring: number[]): number {
    const M = loop.length;
    const p = this.mesh.positions;
    let best = 0;
    let bestCost = Infinity;
    for (let sh = 0; sh < M; sh++) {
      let cost = 0;
      for (let k = 0; k < M; k++) {
        const a = loop[(k + sh) % M] * 3;
        const b = ring[k] * 3;
        const dx = p[a] - p[b];
        const dy = p[a + 1] - p[b + 1];
        const dz = p[a + 2] - p[b + 2];
        cost += dx * dx + dy * dy + dz * dz;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = sh;
      }
    }
    return best;
  }

  private bridge(a: number[], b: number[]): void {
    const M = a.length;
    for (let k = 0; k < M; k++) {
      const k1 = (k + 1) % M;
      this.mesh.addQuad(a[k], a[k1], b[k1], b[k], [k / M, -0.05, (k + 1) / M, -0.05, (k + 1) / M, 0, k / M, 0]);
    }
  }

  /** Ladder cap of a ring that runs counter-clockwise seen from outside. */
  private cap(ring: number[]): void {
    const M = ring.length;
    for (let i = 0; 2 * i <= M - 3; i++) {
      this.mesh.addQuad(ring[i], ring[i + 1], ring[M - 2 - i], ring[M - 1 - i], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  }

  /** Closed loop of vertex indices around a window, counter-clockwise seen from outside. */
  private holeLoop(rings: Ring[], h: Attachment, N: number): number[] {
    const loop: number[] = [];
    const { row0, row1, j0, w } = h;
    for (let j = 0; j <= w; j++) loop.push(rings[row0].idx[mod(j0 + j, N)]);
    for (let i = row0 + 1; i <= row1; i++) loop.push(rings[i].idx[mod(j0 + w, N)]);
    for (let j = w - 1; j >= 0; j--) loop.push(rings[row1].idx[mod(j0 + j, N)]);
    for (let i = row1 - 1; i >= row0 + 1; i--) loop.push(rings[i].idx[mod(j0, N)]);
    for (const v of loop) if (v < 0) throw new Error('holeLoop: window touches a skipped vertex');
    return loop;
  }

  private pos(i: number): V3 {
    const p = this.mesh.positions;
    return { x: p[i * 3], y: p[i * 3 + 1], z: p[i * 3 + 2] };
  }

  private drop(reason: string, n = 1): void {
    this.stats.dropped += n;
    this.stats.dropReasons[reason] = (this.stats.dropReasons[reason] ?? 0) + n;
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function evenSides(n: number, lo: number, hi: number): number {
  return clamp(Math.round(n / 2) * 2, lo, hi);
}

/** Window (w × h cells) whose boundary loop has N vertices: 2(w + h) = N. */
function windowFor(N: number): { w: number; h: number } {
  const half = Math.max(2, Math.round(N / 2));
  const w = Math.max(1, Math.round(half / 2));
  return { w, h: Math.max(1, half - w) };
}

/** Smooth interpolation through [t, value] controls with cosine easing. */
function interpControls(ctrls: [number, number][], t: number): number {
  if (t <= ctrls[0][0]) return ctrls[0][1];
  for (let i = 0; i < ctrls.length - 1; i++) {
    const [t0, v0] = ctrls[i];
    const [t1, v1] = ctrls[i + 1];
    if (t <= t1) {
      const u = (t - t0) / Math.max(1e-9, t1 - t0);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1));
      return v0 + (v1 - v0) * e;
    }
  }
  return ctrls[ctrls.length - 1][1];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / Math.max(1e-9, b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function nearestIndex(sorted: number[], v: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo] - v) <= Math.abs(sorted[hi] - v) ? lo : hi;
}

/** Do circular integer intervals [a, a+wa) and [b, b+wb) on a ring of N overlap? */
function circularOverlap(a: number, wa: number, b: number, wb: number, N: number): boolean {
  if (wa >= N || wb >= N) return true;
  a = mod(a, N);
  b = mod(b, N);
  const d = mod(b - a, N);
  if (d < wa) return true;
  const d2 = mod(a - b, N);
  return d2 < wb;
}
