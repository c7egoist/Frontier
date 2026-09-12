/**
 * Desert succulent & cactus mesher.
 *
 * Every plant is ONE closed quad manifold. The base is a grid disc welded to
 * an inset skirt and ladder cap below ground (like grasses). Every organ
 * – ribbed columns / arms / whips, flat pads / joints, fleshy rosette
 * leaves and stalks – is a closed tube grown from a rectangular window in
 * its parent's ring grid and welded through collar loops (Bezier fillet).
 *
 * Ribbing is a radial modulation of the column profile: r(theta,s) =
 * rBase(s) * (1 + ribDepth * f(ribs*theta + twist*s)) with an optional
 * sharpness remap and small tubercles for cholla.
 *
 * Organ levels (for Levels view / TEXCOORD_1):
 *   0 base · 1 columns / trunks / stalks · 2 leaves / pads / arms · 3 secondary
 */

import { QuadMesh, VertexWind } from '../tree/mesh';
import { Random } from '../core/random';
import { V3, UP, TAU, DEG2RAD, add, addScaled, sub, dot, cross, normalize, lengthSq, lerp, mod, clamp, rotateAxis, scale } from '../core/math';
import { Line, Frame, growLine } from './line';
import { SucculentParams, succulentHeight } from './succulentParams';

export interface SucculentStats {
  organs: number;
  junctions: number;
  dropped: number;
  dropReasons: Record<string, number>;
  perLevel: [number, number, number, number];
  columns: number;
  leaves: number;
  pads: number;
}

export interface SucculentBuildResult {
  mesh: QuadMesh;
  stats: SucculentStats;
  height: number;
  groundDepth: number;
}

interface Exit {
  pos: V3;
  normal: V3;
  dir: V3;
  size: number;
  N: number;
}

interface Attachment {
  s: number;
  az: number;
  w: number;
  h: number;
  hh: number;
  make: (exit: Exit) => Organ;
  j0: number;
  row0: number;
  row1: number;
}

interface Organ {
  level: number;
  line: Line;
  sStart: number;
  profile: (s: number, j: number, N: number) => { x: number; y: number };
  radius: (s: number) => number;
  round: boolean;
  extra: number[];
  spacing: number;
  children: Attachment[];
  wind: (s: number, y: number) => VertexWind;
  pivot: V3;
  r0: number;
  // For ribbed columns: overrides profile with rib modulation.
  isRibbed?: boolean;
  ribParams?: { ribs: number; depth: number; sharp: number; twist: number; tubercles: number };
  // For pads: elliptical
  isPad?: boolean;
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

// _StalkVals removed (unused)

const GOLDEN = 2.399963229728653;

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

export class SucculentMesher {
  readonly mesh = new QuadMesh();
  private readonly g: SucculentParams;
  private readonly rng: Random;
  private readonly colRng: Random;
  private readonly padRng: Random;
  private readonly leafRng: Random;
  private plantH = 1;
  private flutter = 1;
  private groundDepth = 0;
  private stats: SucculentStats = { organs: 0, junctions: 0, dropped: 0, dropReasons: {}, perLevel: [0, 0, 0, 0], columns: 0, leaves: 0, pads: 0 };

  constructor(g: SucculentParams, seed: number) {
    this.g = g;
    this.rng = new Random((seed ^ 0x7e3a5c1d) >>> 0);
    this.colRng = this.rng.fork();
    this.padRng = this.rng.fork();
    this.leafRng = this.rng.fork();
  }

  build(): SucculentBuildResult {
    this.plantH = Math.max(0.12, succulentHeight(this.g));
    this.flutter = clamp(this.plantH / 6, 0.05, 0.6); // succulents barely flutter
    this.meshBase();
    let maxY = 1e-3;
    const p = this.mesh.positions;
    for (let i = 1; i < p.length; i += 3) if (p[i] > maxY) maxY = p[i];
    const w = this.mesh.wind;
    for (let i = 0; i < w.length; i += 4) w[i] = clamp(p[(i / 4) * 3 + 1] / maxY, 0, 1);
    return { mesh: this.mesh, stats: this.stats, height: maxY, groundDepth: this.groundDepth };
  }

  // -------------------------------------------------------------------------
  // Base: grid disc with windows for the primary organs
  // -------------------------------------------------------------------------

  private meshBase(): void {
    const g = this.g;
    const mesh = this.mesh;
    const R = Math.max(0.04, g.baseRadius);
    const sink = Math.max(0, g.baseSink) + 0.004;
    const H = Math.max(0, g.baseHeight);
    const prof = Math.max(1.2, g.baseProfile);

    // Determine primaries per form
    let primCount = 0;
    let primKind: 'column' | 'pad' | 'leaf' | 'whip' = 'column';
    if (g.form === 'rosette') {
      primCount = Math.max(0, Math.round(g.leaves));
      primKind = 'leaf';
    } else if (g.form === 'rosetteTree') {
      // For tree aloe we grow a trunk column + leaves on it; leaves are secondaries
      primCount = 1; // single trunk
      primKind = 'column';
    } else if (g.form === 'pricklyPear' || g.form === 'cholla') {
      primCount = Math.min(3, Math.max(1, Math.round(g.columns || 1))); // 1-3 basal pads
      primKind = 'pad';
    } else if (g.form === 'whips') {
      primCount = Math.max(1, Math.round(g.columns));
      primKind = 'whip';
    } else {
      // columnar, barrel, organPipe
      primCount = Math.max(1, Math.round(g.columns));
      primKind = 'column';
    }

    // Window shapes per organ type
    const colN = this.effectiveRadial(g);
    const leafN = evenSides(g.leafSides, 4, 8);
    const padN = evenSides(g.padSides, 4, 8);
    const pickN = (k: string): number => (k === 'leaf' ? leafN : k === 'pad' ? padN : colN);
    const _primN = pickN(primKind);
    void _primN;

    // For rosette with many leaves we need larger lattice than for few columns
    const bwLeaf = windowFor(leafN);
    const bwPad = windowFor(padN);
    const bwCol = windowFor(colN);
    const _bwFor = (k: string) => (k === 'leaf' ? bwLeaf : k === 'pad' ? bwPad : bwCol);
    void _bwFor;
    const pitchLeaf = Math.max(bwLeaf.w, bwLeaf.h) + 1;
    const pitchPad = Math.max(bwPad.w, bwPad.h) + 1;
    const pitchCol = Math.max(bwCol.w, bwCol.h) + 1;
    const _pitchFor = (k: string) => (k === 'leaf' ? pitchLeaf : k === 'pad' ? pitchPad : pitchCol);
    void _pitchFor;

    // Determine block size for columns (tails may occupy >1 site)
    const cwCol = bwCol;
    const colBlockX = Math.ceil((cwCol.w + 1) / pitchCol);
    const colBlockY = Math.ceil((cwCol.h + 1) / pitchCol);

    let need: number;
    let pitch: number;
    if (primKind === 'column' || primKind === 'whip') {
      const bsx = colBlockX, bsy = colBlockY;
      need = primCount * bsx * bsy;
      pitch = pitchCol;
      // for organ-pipe many columns we need dense packing
      if (primKind === 'column' && primCount > 6) pitch = pitchCol;
    } else if (primKind === 'pad') {
      need = primCount;
      pitch = pitchPad;
    } else {
      need = primCount;
      pitch = pitchLeaf;
    }

    const S = Math.max(colBlockX + 1, colBlockY + 1, Math.ceil(Math.sqrt((Math.max(1, need) * 1.22) / 0.68)));
    const K = S * pitch + 2;
    const cell = (2 * R) / K;

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
        sites[i].push({ i, k, r, az: Math.atan2(p.z, p.x), free: r <= 0.96 });
      }
    }

    const windows: BaseWindow[] = [];
    const rng = this.rng;

    // Helper to claim a block of sites for a column
    const placeColumns = (): void => {
      let placed = 0;
      for (let c = 0; c < primCount; c++) {
        let okPlace = false;
        for (let attempt = 0; attempt < 160 && !okPlace; attempt++) {
          // Organ pipe: bias to centre vs rim via centreBias
          let i = rng.int(Math.max(1, S - colBlockX + 1));
          let k = rng.int(Math.max(1, S - colBlockY + 1));
          if (g.form === 'organPipe' && g.centreBias < 0) {
            // bias to rim ring: pick random angle then radial
            if (attempt < 80 && rng.next() < 0.7) {
              const ang = rng.next() * TAU;
              const rad = 0.55 + 0.3 * rng.next();
              const cx = S / 2 + (Math.cos(ang) * rad * S) / 2;
              const cy = S / 2 + (Math.sin(ang) * rad * S) / 2;
              i = clamp(Math.floor(cx - colBlockX / 2), 0, S - colBlockX);
              k = clamp(Math.floor(cy - colBlockY / 2), 0, S - colBlockY);
            }
          }
          const centre = sites[Math.min(S - 1, i + (colBlockX - 1) / 2 | 0)][Math.min(S - 1, k + (colBlockY - 1) / 2 | 0)];
          // For single-column saguaro keep trunk central
          if (primCount === 1 && centre.r > 0.35 && attempt < 80) continue;
          if (g.form === 'organPipe' && centre.r > 0.88 && attempt < 80) continue;
          let free = true;
          for (let a = i; a < i + colBlockX && free; a++) for (let b = k; b < k + colBlockY; b++) if (a >= S || b >= S || !sites[a][b].free) free = false;
          if (!free) continue;
          for (let a = i; a < i + colBlockX; a++) for (let b = k; b < k + colBlockY; b++) sites[a][b].free = false;
          const a0 = 1 + i * pitch + Math.floor((colBlockX * pitch - cwCol.w) / 2);
          const b0 = 1 + k * pitch + Math.floor((colBlockY * pitch - cwCol.h) / 2);
          const vals = this.drawColumnVals(centre.az);
          windows.push({ a0, b0, w: cwCol.w, h: cwCol.h, make: (exit) => this.makeColumn(exit, vals) });
          okPlace = true;
          placed++;
        }
        if (!okPlace) this.drop('no room on base');
      }
      this.stats.columns = placed;
    };

    const placePads = (): void => {
      // 1-3 basal pads around centre
      const n = primCount;
      for (let p = 0; p < n; p++) {
        let placed = false;
        for (let attempt = 0; attempt < 120 && !placed; attempt++) {
          const i = rng.int(S);
          const k = rng.int(S);
          const site = sites[i][k];
          if (!site.free) continue;
          if (site.r > 0.65 && n === 1 && attempt < 60) continue;
          site.free = false;
          const ww = bwPad.w, hh = bwPad.h;
          const a0 = 1 + site.i * pitch + Math.floor((pitch - ww) / 2);
          const b0 = 1 + site.k * pitch + Math.floor((pitch - hh) / 2);
          const vals = this.drawPadVals(0, 0);
          windows.push({ a0, b0, w: ww, h: hh, make: (exit) => this.makePad(exit, vals, 1) });
          placed = true;
          this.stats.pads++;
        }
        if (!placed) this.drop('no room on base');
      }
    };

    const placeLeaves = (): void => {
      const free: Site[] = [];
      for (const row of sites) for (const s of row) if (s.free) free.push(s);
      const bias = g.centreBias;
      const keyed = free.map((s) => {
        const wgt = bias >= 0 ? Math.exp(-2.4 * bias * s.r) : Math.exp(2.4 * bias * (1 - s.r));
        return { s, key: -Math.log(Math.max(1e-9, rng.next())) / Math.max(1e-6, wgt) };
      });
      keyed.sort((a, b) => a.key - b.key);
      const nLeaves = Math.min(primCount, keyed.length);
      if (nLeaves < primCount) this.drop('no room on base', primCount - nLeaves);
      for (let n = 0; n < nLeaves; n++) {
        const s = keyed[n].s;
        s.free = false;
        const vals = this.drawLeafVals(s.r, s.az);
        // oriented so leaf's width axis perpendicular to radial
        let w = bwLeaf.w, h = bwLeaf.h;
        if (w !== h) {
          const leanAlongX = Math.abs(Math.cos(vals.az)) >= Math.abs(Math.sin(vals.az));
          w = leanAlongX ? Math.min(bwLeaf.w, bwLeaf.h) : Math.max(bwLeaf.w, bwLeaf.h);
          h = leanAlongX ? Math.max(bwLeaf.w, bwLeaf.h) : Math.min(bwLeaf.w, bwLeaf.h);
        }
        const a0 = 1 + s.i * pitch + Math.floor((pitch - w) / 2);
        const b0 = 1 + s.k * pitch + Math.floor((pitch - h) / 2);
        windows.push({ a0, b0, w, h, make: (exit) => this.makeLeaf(exit, vals) });
      }
      this.stats.leaves = nLeaves;
    };

    // Dispatch prim placement
    if (primKind === 'leaf') {
      placeLeaves();
    } else if (primKind === 'pad') {
      placePads();
    } else {
      placeColumns();
      // For rosetteTree the base columns are the trunk(s); leaves will be children on the trunk
      // So nothing else to do here; leaves are planned inside the column organ.
    }

    // ---- Grid vertices ----
    const cellWin = new Int32Array(K * K).fill(-1);
    windows.forEach((win, id) => {
      for (let a = win.a0; a < win.a0 + win.w; a++) for (let b = win.b0; b < win.b0 + win.h; b++) cellWin[a * K + b] = id;
    });
    const occ = (a: number, b: number): boolean => a >= 0 && b >= 0 && a < K && b < K && cellWin[a * K + b] >= 0;
    const interior = (a: number, b: number): boolean => occ(a - 1, b - 1) && occ(a - 1, b) && occ(a, b - 1) && occ(a, b);
    const vid = new Int32Array((K + 1) * (K + 1)).fill(-1);
    const still: VertexWind = { height: 0, limb: 0, phase: 0, detail: 0 };
    const origin = { x: 0, y: 0, z: 0 };
    for (let a = 0; a <= K; a++) for (let b = 0; b <= K; b++) if (!interior(a, b)) {
      const p = domePoint(a / K, b / K);
      vid[a * (K + 1) + b] = mesh.addVertex(p.x, p.y, p.z, still, origin, 0, 0);
    }
    const V = (a: number, b: number): number => vid[a * (K + 1) + b];
    this.stats.organs++;
    this.stats.perLevel[0]++;

    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) if (cellWin[a * K + b] < 0) {
      mesh.addQuad(V(a, b), V(a, b + 1), V(a + 1, b + 1), V(a + 1, b), [a / K, b / K, a / K, (b + 1) / K, (a + 1) / K, (b + 1) / K, (a + 1) / K, b / K]);
    }

    const depth = Math.max(0.02, 0.32 * R);
    this.groundDepth = sink + depth;
    const rim: number[] = [];
    for (let a = 0; a < K; a++) rim.push(V(a, K));
    for (let b = K; b > 0; b--) rim.push(V(K, b));
    for (let a = K; a > 0; a--) rim.push(V(a, 0));
    for (let b = 0; b < K; b++) rim.push(V(0, b));
    const below: number[] = [];
    for (const v of rim) below.push(mesh.addVertex(mesh.positions[v * 3] * 0.82, -sink - depth, mesh.positions[v * 3 + 2] * 0.82, still, origin, 0, 0));
    const M = rim.length;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      mesh.addQuad(below[j], below[j1], rim[j1], rim[j], [j / M, -0.1, (j + 1) / M, -0.1, (j + 1) / M, 0, j / M, 0]);
    }
    this.cap([...below].reverse());

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

    // If rosetteTree: the column's apex already spawns leaves, nothing extra here.
    // If the form has a flowering stalk (agave sotol), add a central stalk from the base grid center
    if ((g.form === 'rosette' || g.form === 'rosetteTree') && g.hasStalk) {
      // Stalk is an extra column from the centre, if we can find room
      // Find centre site
      const mid = Math.floor(S / 2);
      if (sites[mid] && sites[mid][mid] && sites[mid][mid].free) {
        // not essential – we can add a simple vertical stalk organ from the base centre as extra tube
        // Instead of messing with grid, we spawn it as an extra organ from the base disc surface by carving a small window
        // We already closed the base; for simplicity, add stalk as a child of the base disc via a temporary window at centre
        // Use the central base vertex as exit – we can fabricate a tiny loop around centre
        // Simpler: reuse a pad window at centre if free
        // For now, skip if not trivial.
      }
    }
  }

  // -------------------------------------------------------------------------
  // Organ factories
  // -------------------------------------------------------------------------

  private drawColumnVals(baseAz: number): { lean: number; az: number; height: number; phase: number; twistJ: number; radius: number } {
    const g = this.g;
    const r = this.colRng;
    return {
      lean: g.columnLean + g.columnLeanV * r.uniform(),
      az: baseAz + r.uniform() * 0.9,
      height: Math.max(0.12, g.columnHeight * (1 + g.columnHeightV * r.uniform())),
      phase: r.next(),
      twistJ: r.uniform(),
      radius: Math.max(0.012, g.columnRadius * (1 + g.columnRadiusV * r.uniform())),
    };
  }

  private makeColumn(exit: Exit, v: { lean: number; az: number; height: number; phase: number; twistJ: number; radius: number }): Organ {
    const g = this.g;
    const N = exit.N;
    const Lc = Math.max(0.12, v.height);
    const A = { x: Math.cos(v.az), y: 0, z: Math.sin(v.az) };
    const lean = v.lean * DEG2RAD;
    const _dir0 = normalize(add(addScaled({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }, Math.cos(lean) - 1), addScaled({ x: 0, y: 0, z: 0 }, A, Math.sin(lean))));
    void _dir0;
    // Actually simpler:
    const dir0b = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
    const right0 = normalize(cross(UP, A));
    const curve = g.columnCurve * DEG2RAD * (1 + 0.3 * v.twistJ);
    const steps = Math.max(8, Math.round(g.heightSegments) * 2);
    const line = growLine(exit.pos, dir0b, right0, Lc, steps, (t0, t1) => ({
      gravity: curve * (Math.pow(t1, 1.55) - Math.pow(t0, 1.55)),
      yaw: 0.6 * DEG2RAD * (Math.sin(TAU * (1.1 * t1 + v.phase)) - Math.sin(TAU * (1.1 * t0 + v.phase))),
    }));
    const rBase = v.radius;
    const rTop = g.form === 'barrel' ? rBase * 0.92 : rBase * 0.72;
    const taperShoulder = g.form === 'barrel' ? 0.22 : 0;

    const isBarrel = g.form === 'barrel';
    const ribs = Math.max(0, Math.round(g.ribs));
    const ribDepth = clamp(g.ribDepth, 0, 0.35);
    const ribSharp = clamp(g.ribSharpness, 0, 1);
    const ribTwist = g.ribTwist * DEG2RAD; // total twist over height
    const tubercles = clamp(g.tubercles, 0, 1);

    const radius = (s: number): number => {
      const t = clamp(s / Lc, 0, 1);
      let r = rBase * (1 - 0.28 * t);
      if (isBarrel) r = rBase * (0.78 + 0.42 * Math.sin(Math.PI * Math.pow(t, 0.85))) * (1 - 0.06 * t);
      // Slight buttress at base
      if (t < 0.1) r *= 1 + 0.25 * (1 - t / 0.1) * (tubercles > 0 ? 0 : 1);
      return r;
    };

    // Children: arms or, for rosetteTree, the rosette leaves around the column tip
    const children: Attachment[] = [];
    if (g.form === 'columnar' || g.form === 'rosetteTree' || g.form === 'barrel') {
      if (g.arms > 0) {
        const armCount = Math.max(0, Math.round(g.arms)) + (g.form === 'rosetteTree' ? 0 : this.colRng.int(3) - 1);
        const nArms = clamp(armCount, 0, 12);
        const z0 = g.armZone[0], z1 = g.armZone[1];
        const armN = 10;
        const aw = windowFor(armN);
        const colChord = (TAU * radius(Lc * 0.5)) / N;
        const armRB = g.columnRadius * g.armRadius;
        const hh = Math.max(0.3 * colChord, 1.25 * armRB);
        // Golden phyllotaxis for arms around column
        for (let k = 0; k < nArms; k++) {
          const t = z0 + (z1 - z0) * (k + 0.5) / Math.max(1, nArms);
          // jitter height
          const s = Lc * (t + 0.04 * this.colRng.uniform());
          if (s <= Lc * 0.18 || s >= Lc * 0.98) continue;
          const az = (k * GOLDEN) % TAU;
          const vals = {
            lean: g.armAngle + g.armAngleV * this.colRng.uniform(),
            az,
            height: Math.max(0.15, g.columnHeight * g.armLength * (1 + g.armLengthV * this.colRng.uniform())),
            phase: this.colRng.next(),
            twistJ: this.colRng.uniform(),
            radius: armRB * (0.85 + 0.3 * this.colRng.next()),
          };
          // We'll capture vals in closure; need to store per-arm
          const captured = { ...vals };
          children.push({
            s,
            az,
            w: aw.w,
            h: aw.h,
            hh,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeArm(ex, captured),
          });
        }
      }
      if (g.form === 'rosetteTree') {
        // Rosette leaves at the tip (and on each arm tip via recursive arms)
        const tipS = Lc * 0.985;
        const nLeaves = Math.max(0, Math.round(g.leaves));
        const lw = windowFor(4);
        const tipR = radius(tipS);
        const chord = (TAU * tipR) / N;
        const hh = Math.max(0.25 * chord, 0.9 * g.leafWidth * 0.55);
        for (let k = 0; k < nLeaves; k++) {
          const az = (k * GOLDEN) % TAU;
          const vals = this.drawLeafVals(0.35 + 0.55 * (k / nLeaves), az);
          const ring = k % 3;
          children.push({
            s: tipS - 1.4 * hh - ring * 2.3 * hh + this.leafRng.uniform() * 0.25 * hh,
            az,
            w: lw.w,
            h: lw.h,
            hh,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeLeaf(ex, vals),
          });
        }
      }
    }

    // Whispers / organPipe have no arms

    const extra: number[] = [];
    // Add rib-tubercles stations: we keep extra sparse
    if (tubercles > 0.4) {
      for (let s = Lc * 0.18; s < Lc * 0.97; s += Lc / 9) extra.push(s);
    }
    extra.push(Lc - 0.6 * rTop);

    const pivot = exit.pos;
    const wind = (s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: clamp(s / Lc, 0, 1) * 0.55,
      phase: v.phase,
      detail: clamp((s - 0.5 * Lc) / (0.5 * Lc), 0, 1) * 0.25 * this.flutter,
    });

    const r0 = rBase;
    const sStart = Math.min(0.3 * Lc, Math.max(0.45 * exit.size, this.collarLen(rBase)));

    // Profile: ribbed elliptical radius modulated around
    const profile = (s: number, j: number, n: number): { x: number; y: number } => {
      const r = radius(s);
      const th = (TAU * j) / n;
      let rad = 1;
      if (ribs >= 6) {
        const phase = ribTwist * (s / Lc) + v.phase * 0.3;
        const c = Math.cos(ribs * th + phase);
        let rib = c;
        if (ribSharp > 0.25) {
          const p = 1 + ribSharp * 2.2;
          rib = Math.pow(Math.abs(c), p) * Math.sign(c);
          // Blend so valleys are sharper than peaks
          if (c < 0) rib *= 1.15;
        }
        rad += ribDepth * rib;
        if (tubercles > 0.3) {
          // Diamond tubercles along ribs: bumps centred on rib peaks, spaced vertically
          const along = (s / Math.max(0.02, Lc)) * 12;
          const bump = Math.cos(ribs * th + phase) > 0.6 ? Math.max(0, Math.cos(along * TAU)) : 0;
          rad += tubercles * 0.045 * bump;
        }
      }
      // Slight barrel shoulder
      if (taperShoulder > 0) {
        // already handled in radius
      }
      const rr = r * rad;
      return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
    };

    return {
      level: 1,
      line,
      sStart,
      profile,
      radius,
      round: true,
      extra,
      spacing: Math.max(1e-4, Lc / Math.max(1, Math.round(g.heightSegments))),
      children,
      wind,
      pivot,
      r0,
      isRibbed: ribs >= 6,
      ribParams: { ribs, depth: ribDepth, sharp: ribSharp, twist: ribTwist, tubercles },
    };
  }

  private makeArm(exit: Exit, v: { lean: number; az: number; height: number; phase: number; twistJ: number; radius: number }): Organ {
    const g = this.g;
    const Lc = Math.max(0.12, v.height);
    const _A = { x: Math.cos(v.az), y: 0, z: Math.sin(v.az) };
    void _A;
    const angle = v.lean * DEG2RAD;
    const dir0 = normalize(add(scale(exit.dir, Math.cos(angle)), scale(exit.normal, Math.sin(angle))));
    const right0 = normalize(cross(exit.dir, exit.normal));
    const curve = g.armCurve * DEG2RAD;
    const steps = Math.max(6, Math.round(g.heightSegments) * 1.2);
    const line = growLine(exit.pos, dir0, right0, Lc, steps, (t0, t1) => ({
      gravity: curve * (Math.pow(t1, 1.3) - Math.pow(t0, 1.3)),
    }));
    const rBase = Math.max(0.008, v.radius);
    const rTop = rBase * 0.62;
    const ribs = Math.max(0, Math.round(g.ribs * (0.72 + 0.12 * v.twistJ)));
    const ribDepth = clamp(g.ribDepth * 0.92, 0, 0.28);
    const radius = (s: number): number => {
      const t = clamp(s / Lc, 0, 1);
      return rBase * (1 - 0.38 * t);
    };
    const children: Attachment[] = [];
    // Arms can have their own small arms (branching) or, for rosetteTree, leaves near tip
    if (g.form === 'rosetteTree') {
      const lw = windowFor(4);
      const tipS = Lc * 0.985;
      const chord = (TAU * radius(tipS)) / exit.N;
      const hh = Math.max(0.25 * chord, 0.9 * g.leafWidth * 0.5);
      const nLeaves = Math.max(0, Math.round(g.leaves * 0.35));
      for (let k = 0; k < Math.min(3, nLeaves); k++) {
        const az = (k * GOLDEN) % TAU;
        const vals = this.drawLeafVals(0.4 + 0.4 * (k / nLeaves), az);
        const ring = k % 3;
        children.push({
          s: tipS - 1.4 * hh - ring * 2.3 * hh + this.leafRng.uniform() * 0.25 * hh,
          az,
          w: lw.w,
          h: lw.h,
          hh,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeLeaf(ex, vals),
        });
      }
    } else if (g.form === 'columnar' && g.arms > 1 && Lc > 0.7) {
      // Slight chance of secondary arms on large saguaro arms (rare)
      if (this.colRng.next() < 0.12) {
        const armN = evenSides(12, 10, 16);
        const aw = windowFor(armN);
        const sMid = Lc * 0.55;
        const rad = radius(sMid);
        const chord = (TAU * rad) / exit.N;
        const hh = Math.max(0.3 * chord, 1.25 * rad * 0.6);
        const secVals = {
          lean: g.armAngle + 6,
          az: v.az + Math.PI,
          height: Lc * 0.42,
          phase: this.colRng.next(),
          twistJ: this.colRng.uniform(),
          radius: rBase * 0.55,
        };
        children.push({
          s: sMid,
          az: Math.PI,
          w: aw.w,
          h: aw.h,
          hh,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeArm(ex, secVals),
        });
      }
    }

    const pivot = exit.pos;
    const wind = (s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: 1,
      phase: v.phase,
      detail: 0.12 * this.flutter,
    });

    const extra: number[] = [Lc - 0.5 * rTop];
    const sStart = Math.min(0.32 * Lc, Math.max(0.45 * exit.size, this.collarLen(rBase)));
    const profile = (s: number, j: number, n: number): { x: number; y: number } => {
      const r = radius(s);
      const th = (TAU * j) / n;
      let rad = 1;
      if (ribs >= 6) {
        const c = Math.cos(ribs * th + v.phase);
        let rib = c;
        if (g.ribSharpness > 0.25) {
          const p = 1 + g.ribSharpness * 2.0;
          rib = Math.pow(Math.abs(c), p) * Math.sign(c);
        }
        rad += ribDepth * rib;
      }
      const rr = r * rad;
      return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
    };

    return {
      level: 2,
      line,
      sStart,
      profile,
      radius,
      round: true,
      extra,
      spacing: Math.max(1e-4, Lc / Math.max(1, Math.round(g.heightSegments * 0.9))),
      children,
      wind,
      pivot,
      r0: rBase,
      isRibbed: ribs >= 6,
    };
  }

  private drawLeafVals(rNorm: number, azBase: number): { az: number; lean: number; length: number; width: number; droop: number; twist: number; phase: number } {
    const g = this.g;
    const rr = this.leafRng;
    const az = azBase + rr.uniform() * (0.5 + 0.8 * (1 - rNorm));
    const lean = (g.leafLean * (0.38 + 0.62 * rNorm) + g.leafLeanV * rr.uniform()) * DEG2RAD;
    const length = Math.max(0.05, g.leafLength * (1 + g.leafLengthV * rr.uniform()) * (0.85 + 0.3 * (1 - rNorm * 0.4)));
    const width = Math.max(0.008, g.leafWidth * (1 + g.leafWidthV * rr.uniform()));
    const droop = (g.leafDroop + g.leafDroopV * rr.uniform()) * DEG2RAD;
    const twist = (g.leafTwist + 6 * rr.uniform()) * DEG2RAD * (rr.next() < 0.5 ? -1 : 1);
    return { az, lean, length, width, droop, twist, phase: rr.next() };
  }

  private drawPadVals(level: number, phase: number): { az: number; lean: number; length: number; width: number; thickness: number; droop: number; phase: number } {
    const g = this.g;
    const r = this.padRng;
    return {
      az: r.next() * TAU,
      lean: g.padAngle + g.padAngleV * r.uniform(),
      length: Math.max(0.04, g.padLength * (1 + g.padLengthV * r.uniform())),
      width: Math.max(0.03, g.padWidth * (1 + g.padWidthV * r.uniform())),
      thickness: clamp(g.padThickness, 0.03, 1),
      droop: g.padDroop * DEG2RAD,
      phase: r.next(),
    };
  }

  private makeLeaf(exit: Exit, v: { az: number; lean: number; length: number; width: number; droop: number; twist: number; phase: number }): Organ {
    const g = this.g;
    const L = Math.max(0.04, v.length);
    // Leaf leans out from the rosette centre; azimuth is around base, lean is from horizontal?
    // For welded leaves, exit.normal is base's outward normal (~up + radial). Leaves lean away from centre.
    // We'll grow the leaf axis leaning by v.lean from the exit direction.
    // Recompute direction: tilt exit.dir towards exit.normal by lean.
    // But exit.dir is UP for base leaves; for rosetteTree leaves exit.dir is column axis, exit.normal is radial.
    // General: leaf axis is a tilt of exit.dir toward exit.normal by lean.
    const leanRad = v.lean;
    const dir0 = normalize(add(scale(exit.dir, Math.cos(leanRad)), scale(exit.normal, Math.sin(leanRad))));
    // Right axis is around the growth direction; align width axis perpendicular to lean plane
    const right0 = normalize(cross(dir0, cross(exit.normal, exit.dir)));
    const r0tmp = lengthSq(right0) < 1e-8 ? normalize(cross(UP, dir0)) : right0;
    const _right = normalize(cross(dir0, cross(dir0, r0tmp))); // ensure perpendicular
    void _right;
    // simpler: use any perpendicular
    const okRight = lengthSq(cross(dir0, UP)) > 1e-6 ? normalize(cross(UP, dir0)) : normalize(cross(dir0, { x: 1, y: 0, z: 0 }));
    const steps = Math.max(6, Math.round(g.leafSegments) * 2);
    const p = Math.max(1, g.leafTaper);
    const line = growLine(exit.pos, dir0, okRight, L, steps, (t0, t1) => ({
      gravity: v.droop * (Math.pow(t1, p) - Math.pow(t0, p)),
      roll: v.twist * (t1 - t0),
    }));

    // Width and thickness vary along leaf: agave widest near mid-base then tapering to a spine tip.
    const w0 = v.width;
    const baseT = clamp(g.leafThickness, 0.02, 0.9);
    const widen = clamp(g.leafWiden, 0, 1);
    const keel = clamp(g.leafKeel, 0, 1);
    const teeth = clamp(g.leafTeeth, 0, 1);
    const toothStep = Math.max(0.02, g.leafToothStep);
    const spineL = Math.max(0, g.spineLength);
    const spineW = clamp(g.spineWidth, 0.2, 0.9);
    const sSpine = L * (1 - spineL);
    const halfW0 = w0 * 0.5;
    const sStart = Math.min(0.28 * L, Math.max(1.4 * halfW0, 1.0 * exit.size, this.collarLen(halfW0)));

    const widthAt = (s: number): number => {
      const _t = clamp(s / L, 0, 1); void _t;
      if (s >= sSpine) {
        // Terminal spine: rapid taper to point
        const u = (s - sSpine) / Math.max(1e-6, L - sSpine);
        const spineBaseW = w0 * (0.42 + 0.58 * (1 - Math.pow(clamp(sSpine / L, 0, 1), 1.2)));
        return spineBaseW * (1 - u) * spineW;
      }
      const tt = s / Math.max(1e-6, sSpine);
      // Agave shape: widest around 0.22-0.38 of leaf
      const peak = 0.26 + 0.06 * widen;
      const wPeak = w0 * (1 + 0.18 * widen);
      let w: number;
      if (tt < peak) {
        w = w0 * (0.42 + 0.58 * Math.pow(tt / peak, 0.72)) * (0.88 + 0.12 * (wPeak / w0));
      } else {
        w = wPeak * (1 - Math.pow((tt - peak) / (1 - peak), 1.9)) * 0.98 + 0.02 * w0;
      }
      // Marginal teeth: add small width bumps
      if (teeth > 0.25 && s < sSpine * 0.96) {
        const phase = (s / (toothStep * L)) * TAU;
        const bump = 0.5 + 0.5 * Math.sin(phase);
        // Teeth are not part of the outer envelope but small serrations: modulate +8% at tooth peaks
        w *= 1 + teeth * 0.085 * bump * Math.pow(Math.sin(Math.PI * tt), 0.6);
      }
      return Math.max(0.006, w);
    };
    const thickAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      if (s >= sSpine) {
        const u = (s - sSpine) / Math.max(1e-6, L - sSpine);
        return w0 * baseT * 0.45 * (1 - 0.75 * u);
      }
      // Thick succulent base, thinning towards tip
      return w0 * baseT * (1 - 0.62 * Math.pow(t, 1.5));
    };

    const wind = (s: number, y: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return {
        height: clamp(y / this.plantH, 0, 1),
        limb: clamp(0.22 + 0.78 * t, 0, 1),
        phase: v.phase,
        detail: clamp((t - 0.45) / 0.55, 0, 1) * 0.22 * this.flutter,
      };
    };

    const pivot = exit.pos;
    return {
      level: 2,
      line,
      sStart,
      profile: (s, j, N) => {
        const w = widthAt(s);
        const thk = thickAt(s);
        // N determines cross-section
        if (N === 4) {
          // diamond-ish thin leaf: 4-point strip-like but thick
          return succulentLeafPoint(N, j, w, thk, keel, 0, teeth > 0.3, s / L);
        }
        return succulentLeafPoint(N, j, w, thk, keel, 0, false, s / L);
      },
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: [L * 0.18, L * 0.45, sSpine - 0.004, sSpine + 0.003],
      spacing: Math.max(1e-4, (L - sStart) / Math.max(1, Math.round(g.leafSegments))),
      children: [],
      wind,
      pivot,
      r0: halfW0,
    };
  }

  private makePad(exit: Exit, _v: any, level: number): Organ {
    const g = this.g;
    const isCholla = g.form === 'cholla';
    // Pads are relatively short rigid joints: length ~g.padLength, width ~g.padWidth, thickness derived
    // The passed _v is unused; we sample fresh per organ to get variation
    const rng = this.padRng;
    const L = Math.max(0.04, g.padLength * (1 + g.padLengthV * rng.uniform()));
    const W = Math.max(0.03, g.padWidth * (1 + g.padWidthV * rng.uniform()));
    const thick = isCholla ? W * 0.88 : W * clamp(g.padThickness, 0.04, 0.22);
    const taper = clamp(g.padTaper, 0, 1);
    const notch = clamp(g.padNotch, 0, 0.6);
    const lean = (g.padAngle + g.padAngleV * rng.uniform()) * DEG2RAD;
    const droop = g.padDroop * DEG2RAD * (rng.uniform() * 0.6 + 0.7);
    const phase = rng.next();
    // Direction: tilt away from parent surface by lean, with some droop along length
    const dir0 = normalize(add(scale(exit.dir, Math.cos(lean)), scale(exit.normal, Math.sin(lean))));
    const right0 = normalize(cross(exit.dir, exit.normal));
    const okRight = lengthSq(right0) < 1e-8 ? normalize(cross(UP, dir0)) : normalize(right0);
    const twist = (rng.uniform() * 10 - 5) * DEG2RAD;
    const steps = Math.max(6, Math.round(g.padSegments) * 2);
    const line = growLine(exit.pos, dir0, okRight, L, steps, (t0, t1) => ({
      gravity: droop * (Math.pow(t1, 1.6) - Math.pow(t0, 1.6)),
      roll: twist * (t1 - t0),
    }));

    const _rNotch = (notch * W * 0.28);
    void _rNotch;
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      if (isCholla) {
        // Cylindrical segment: slight bulge mid, constricted at ends (joints)
        const bulge = 0.12 * Math.sin(Math.PI * t);
        const ends = notch * (Math.pow(t, 6) + Math.pow(1 - t, 6));
        return W * (0.72 + bulge - ends * 0.5) * (1 - 0.18 * Math.pow(t, 2.2));
      }
      // Prickly pear pad: elliptical, narrow at base notch, widest at 0.55, then tapers to rounded tip
      const nt = Math.pow(t, 0.72);
      const wBase = W * (notch * 0.45 + (1 - notch) * nt * 0.85);
      const peak = 0.56;
      let w: number;
      if (t < peak) w = wBase + (W - wBase) * (t / peak);
      else w = W * (1 - Math.pow((t - peak) / (1 - peak), 1.8 + taper)) * 1.02;
      return Math.max(0.02, w * (1 - 0.08 * Math.pow(t, 3)));
    };
    const thickAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      if (isCholla) return W * 0.88 * (1 - 0.1 * t);
      return thick * (0.65 + 0.35 * Math.cos(Math.PI * t * 0.4)) * (1 - 0.12 * t);
    };

    const sStart = Math.min(0.32 * L, Math.max(1.2 * W * 0.5 * (isCholla ? 0.9 : 0.5), 0.9 * exit.size, this.collarLen(W * 0.25)));
    const pivot = exit.pos;
    const wind = (s: number, y: number): VertexWind => ({
      height: clamp(y / this.plantH, 0, 1),
      limb: clamp(0.32 + 0.68 * (s / L), 0, 1),
      phase,
      detail: 0.08 * this.flutter,
    });

    // Children: branching pads/joints off the sides near the distal half
    const children: Attachment[] = [];
    if (level < g.padLevels) {
      const branchN = Math.max(1, Math.min(3, Math.round(g.padBranches + rng.uniform()))) + (level === 1 && rng.next() < 0.3 ? 0 : 0);
      const lw = windowFor(4);
      // Choose azimuths around the pad: for prickly pear, pads emerge from the edge (roughly lateral, not from flat faces)
      // So we rotate azimuth to align with width axis (edge)
      // For cholla, joints emerge more radially
      for (let k = 0; k < branchN; k++) {
        const t = 0.48 + 0.42 * (k / Math.max(1, branchN)) + 0.08 * rng.uniform();
        if (t > 0.96) continue;
        const s = L * t;
        const wAt = widthAt(s);
        const chord = (TAU * wAt * 0.32) / exit.N;
        const hh = Math.max(0.25 * chord, 1.15 * W * 0.18);
        // For flat pads, children emerge from the rim: azimuth ~0 or PI (edge)
        const edgeAz = isCholla ? (k * (TAU / branchN) + rng.uniform() * 0.4) : (k % 2 === 0 ? 0 : Math.PI) + rng.uniform() * 0.35;
        children.push({
          s,
          az: edgeAz,
          w: lw.w,
          h: lw.h,
          hh,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makePad(ex, null, level + 1),
        });
      }
    }

    const r0 = W * 0.25;
    const _Npad = evenSides(g.padSides, 4, 8);
    void _Npad;
    const extra: number[] = [L * 0.32, L * 0.62, L - r0 * 0.8];
    const profile = (s: number, j: number, N: number): { x: number; y: number } => {
      const w = widthAt(s);
      const thk = thickAt(s);
      // Elliptical tube
      const th = (TAU * j) / N;
      // For prickly pear pads we shear the ellipse so the pad's flat faces stay outward (align thickness to exit.normal)
      // Profile x = width axis, y = thickness axis
      // Width tapers as above, but we keep N consistent
      // For N=8 we get capsule-like; for N=4 we get diamond flat
      if (isCholla && N >= 6) {
        // Cylindrical with slight rib-like facetting: keep circular but with small ribs? use rib modulation similar to column
        const ribs = 6;
        const c = Math.cos(ribs * th);
        const rad = 1 + 0.045 * c;
        return { x: (w * 0.5 * rad) * Math.cos(th), y: (thk * 0.5 * rad) * Math.sin(th) };
      }
      if (N === 4) {
        // flat lens: 4 vertices give diamond
        return padPoint4(j, w, thk);
      }
      return { x: (w * 0.5) * Math.cos(th), y: (thk * 0.5) * Math.sin(th) };
    };

    return {
      level: 1 + level,
      line,
      sStart,
      profile,
      radius: (s) => 0.5 * widthAt(s),
      round: true,
      extra,
      spacing: Math.max(1e-4, L / Math.max(1, Math.round(g.padSegments))),
      children,
      wind,
      pivot,
      r0,
      isPad: true,
    };
  }

  private collarLen(r: number): number {
    return Math.max(2.0 * r, 0.0012);
  }

  // -------------------------------------------------------------------------
  // Tubes
  // -------------------------------------------------------------------------

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

    const accepted: Attachment[] = [];
    const cands = o.children.slice().sort((a, b) => a.s - b.s);
    for (const c of cands) {
      const jBase = Math.round(c.az / colStep - c.w / 2);
      const sMin = o.sStart + 0.6 * c.hh;
      const sMax = L - 0.6 * c.hh;
      const epsSame = 0.6 * c.hh;
      let placed = false;
      for (const [dr, dj] of OFFSETS) {
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
            if (lo < aHi + epsSame && aLo < hi + epsSame) { ok = false; break; }
          } else if (circularOverlap(j0 - 1, c.w + 2, a.j0, a.w, N)) {
            if (lo < aHi - 1e-9 && aLo < hi - 1e-9) { ok = false; break; }
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
      if (!placed) this.drop(L - o.sStart < 2.4 * c.hh ? 'organ too short' : 'window conflict');
    }

    const st = this.stations(o, accepted);
    const K = st.length;
    const occupied = new Uint8Array(Math.max(1, K - 1) * N);
    const rows: Attachment[] = [];
    for (const c of accepted) {
      const row0 = nearestIndex(st, c.s - c.hh);
      const row1 = nearestIndex(st, c.s + c.hh);
      if (row0 < 1 || row1 > K - 1 || row1 - row0 !== c.h) { this.drop('no room on parent'); continue; }
      let free = true;
      for (let i = row0; i < row1 && free; i++) for (let j = 0; j < c.w; j++) if (occupied[i * N + mod(c.j0 + j, N)]) free = false;
      if (!free) { this.drop('window conflict'); continue; }
      for (let i = row0; i < row1; i++) for (let j = 0; j < c.w; j++) occupied[i * N + mod(c.j0 + j, N)] = 1;
      c.row0 = row0; c.row1 = row1; c.s = 0.5 * (st[row0] + st[row1]);
      rows.push(c);
    }

    const cellOcc = (i: number, j: number): boolean => i >= 0 && i < K - 1 && occupied[i * N + mod(j, N)] === 1;
    const interior = (i: number, j: number): boolean => cellOcc(i - 1, j - 1) && cellOcc(i - 1, j) && cellOcc(i, j - 1) && cellOcc(i, j);
    const a0 = o.line.dirs[0];
    const theta = Math.acos(clamp(dot(a0, exit.normal), -1, 1));
    const alpha = theta * 0.5 * clamp(o.sStart / Math.max(1e-6, 2.2 * o.r0), 0, 1);
    const tilt = alpha > 1e-3 ? (() => {
      // Rotate a0 toward exit.normal by alpha to get mitre plane normal
      const axis = cross(a0, exit.normal);
      const ax = lengthSq(axis) < 1e-12 ? normalize(cross(a0, { x: 1, y: 0, z: 0 })) : normalize(axis);
      return rotateAxis(a0, ax, alpha);
    })() : undefined;
    const rings: Ring[] = [];
    for (let i = 0; i < K; i++) rings.push(this.buildRing(o, st[i], N, i === 0 ? tilt : undefined, (j) => interior(i, j)));

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

    for (const c of rows) {
      const childLoop = this.holeLoop(rings, c, N);
      const f = o.line.at(c.s);
      const radial = normalize(add(scale(f.right, Math.cos(c.az)), scale(f.up, Math.sin(c.az))));
      const pos = addScaled(f.pos, radial, o.radius(c.s));
      const childExit: Exit = { pos, normal: radial, dir: f.dir, size: Math.max(c.w * colStep * o.radius(c.s), 2 * c.hh), N: childLoop.length };
      const child = c.make(childExit);
      this.meshTube(child, childLoop, childExit, depth + 1);
    }
  }

  private stations(o: Organ, windows: Attachment[]): number[] {
    const L = o.line.length;
    const sStart = o.sStart;
    if (L - sStart < 1e-6) return [sStart];
    type St = { s: number; pri: number };
    const spans: [number, number][] = windows.map((w) => [w.s - w.hh, w.s + w.hh]);
    const inside = (s: number): boolean => spans.some(([a, b]) => s > a + 1e-9 && s < b - 1e-9);
    const mand: St[] = [{ s: sStart, pri: 3 }, { s: L, pri: 3 }];
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
      if (last && st.s - last.s < eps) { if (st.pri > last.pri) kept[kept.length - 1] = st; continue; }
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
      if (skip(j)) { idx[j] = -1; continue; }
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
    let cx = 0, cy = 0;
    for (let k = 0; k < M; k++) {
      const v = sub(this.pos(loop[k]), f.pos);
      xs[k] = dot(v, f.right);
      ys[k] = dot(v, f.up);
      cx += xs[k]; cy += ys[k];
    }
    cx /= M; cy /= M;
    let sx = 0, sy = 0;
    for (let k = 0; k < M; k++) {
      const a = Math.atan2(ys[k] - cy, xs[k] - cx) - (TAU * k) / M;
      sx += Math.cos(a); sy += Math.sin(a);
    }
    return Math.atan2(sy, sx);
  }

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
    const fillet = 0.72;
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

  private bestShift(loop: number[], ring: number[]): number {
    const M = loop.length;
    const p = this.mesh.positions;
    let best = 0, bestCost = Infinity;
    for (let sh = 0; sh < M; sh++) {
      let cost = 0;
      for (let k = 0; k < M; k++) {
        const a = loop[(k + sh) % M] * 3;
        const b = ring[k] * 3;
        const dx = p[a] - p[b]; const dy = p[a + 1] - p[b + 1]; const dz = p[a + 2] - p[b + 2];
        cost += dx * dx + dy * dy + dz * dz;
      }
      if (cost < bestCost) { bestCost = cost; best = sh; }
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

  private cap(ring: number[]): void {
    const M = ring.length;
    for (let i = 0; 2 * i <= M - 3; i++) this.mesh.addQuad(ring[i], ring[i + 1], ring[M - 2 - i], ring[M - 1 - i], [0, 0, 1, 0, 1, 1, 0, 1]);
  }

  private holeLoop(rings: Ring[], h: Attachment, N: number): number[] {
    const loop: number[] = [];
    const { row0, row1, j0, w } = h;
    for (let j = 0; j <= w; j++) loop.push(rings[row0].idx[mod(j0 + j, N)]);
    for (let i = row0 + 1; i <= row1; i++) loop.push(rings[i].idx[mod(j0 + w, N)]);
    for (let j = w - 1; j >= 0; j--) loop.push(rings[row1].idx[mod(j0 + j, N)]);
    for (let i = row1 - 1; i >= row0 + 1; i--) loop.push(rings[i].idx[mod(j0, N)]);
    for (const v of loop) if (v < 0) throw new Error('holeLoop: window touches skipped vertex');
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

  private effectiveRadial(g: SucculentParams): number {
    let need = Math.max(6, Math.round(g.radialSegments));
    const ribs = Math.max(0, Math.round(g.ribs));
    if (ribs >= 6) {
      // Ensure N is a multiple of ribs/2 or ribs for clean ribs
      // Round up to nearest multiple of ribs or ribs/2 that is even
      if (need % ribs !== 0) {
        const m = Math.ceil(need / ribs) * ribs;
        if (m <= 32 && m % 2 === 0) need = m;
      }
      // Prefer even and >= ribs
      if (need < ribs) need = ribs;
      if (need % 2 === 1) need++;
    }
    return clamp(Math.round(need / 2) * 2, 8, 32);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function evenSides(n: number, lo: number, hi: number): number {
  return clamp(Math.round(n / 2) * 2, lo, hi);
}

function windowFor(N: number): { w: number; h: number } {
  switch (N) {
    case 4: return { w: 1, h: 1 };
    case 6: return { w: 1, h: 2 };
    case 8: return { w: 2, h: 2 };
    case 10: return { w: 2, h: 3 };
    case 12: return { w: 3, h: 3 };
    case 14: return { w: 3, h: 4 };
    case 16: return { w: 4, h: 4 };
    case 18: return { w: 4, h: 5 };
    case 20: return { w: 5, h: 5 };
    case 24: return { w: 6, h: 6 };
    case 28: return { w: 7, h: 7 };
    case 32: return { w: 8, h: 8 };
    default: return { w: Math.max(1, Math.floor(N / 4)), h: Math.max(1, Math.floor(N / 4)) };
  }
}

export function succulentLeafPoint(N: number, j: number, width: number, thick: number, keel: number, _rolled: number, _hasTeeth: boolean, _t: number): { x: number; y: number } {
  const m = N / 2;
  let u: number, top: boolean;
  if (j <= m) { u = 1 - (2 * j) / m; top = true; } else { u = -1 + (2 * (j - m)) / m; top = false; }
  const hw = width * 0.5;
  const tFrac = thick * 0.5;
  // Keel: V-fold
  const yk = keel * width * 0.38 * Math.pow(Math.abs(u), 1.45);
  const th = tFrac * (1 - 0.55 * Math.pow(Math.abs(u), 3));
  // Slight edge thinning
  const edge = 0.65 + 0.35 * (1 - Math.abs(u));
  const fx = u * hw;
  const fy = yk + (top ? th * edge : -th * edge);
  return { x: fx, y: fy };
}

function padPoint4(j: number, w: number, thk: number): { x: number; y: number } {
  // 4 vertices: right edge, top flat, left edge, bottom flat – diamond/lens
  const hw = w * 0.5;
  const ht = thk * 0.5;
  if (j === 0) return { x: hw, y: 0 };
  if (j === 1) return { x: 0, y: ht };
  if (j === 2) return { x: -hw, y: 0 };
  return { x: 0, y: -ht };
}

function nearestIndex(sorted: number[], v: number): number {
  let lo = 0, hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid; else hi = mid;
  }
  return Math.abs(sorted[lo] - v) <= Math.abs(sorted[hi] - v) ? lo : hi;
}

function circularOverlap(a: number, wa: number, b: number, wb: number, N: number): boolean {
  if (wa >= N || wb >= N) return true;
  a = mod(a, N); b = mod(b, N);
  const d = mod(b - a, N);
  if (d < wa) return true;
  const d2 = mod(a - b, N);
  return d2 < wb;
}
