/**
 * Welded organ mesher — the machinery shared by every non-tree plant.
 *
 * A plant is ONE closed quad manifold. A ground pad (grid dome with a root
 * body below the soil) is the topological root; every organ — blade, culm,
 * cactus column, arm, pad, leaf, fruit, spine — is a closed tube grown along
 * a centreline that leaves its parent through a rectangular window cut into
 * the parent's ring grid and is welded to it with collar loops. Nothing is
 * intersected, instanced or merged, so the topology validator reports a single
 * genus-0 surface and the wind deformation is continuous across every joint.
 *
 * Subclasses (grass, succulents, vegetables) decide *what* grows *where*; this
 * class turns organs and their attachments into geometry.
 */

import { QuadMesh, VertexWind } from '../tree/mesh';
import { V3, TAU, add, addScaled, sub, dot, cross, normalize, lengthSq, lerp, mod, clamp, rotateTowards, rotateAxis, scale } from '../core/math';
import { Line, Frame } from './line';

export interface OrganStats {
  /** Organs meshed (the pad counts as one). */
  organs: number;
  /** Windows welded (every organ but the pad has one). */
  junctions: number;
  dropped: number;
  dropReasons: Record<string, number>;
  /** Organs per display level (0 pad/base · 1 · 2 · 3). */
  perLevel: [number, number, number, number];
  /** Named census (blades, culms, arms, fruits, …) shown in the inspector. */
  counts: Record<string, number>;
}

export interface OrganBuildResult {
  mesh: QuadMesh;
  stats: OrganStats;
  height: number;
  /** Depth of the plant below the ground (metres). */
  groundDepth: number;
}

/** Where a child leaves its parent: a point on the parent surface with its frame. */
export interface Exit {
  pos: V3;
  /** Outward surface normal. */
  normal: V3;
  /** Parent axis direction (UP for the pad). */
  dir: V3;
  /** Physical size of the window (longest side), metres. */
  size: number;
  /** Vertices of the window loop = vertices around the child's rings. */
  N: number;
}

export interface Attachment {
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
  /** Planning order: higher first (big organs claim their rows before the small ones). Default 0. */
  priority?: number;
  /** Never move the window when it does not fit (areoles must stay on their rib crest). */
  fixed?: boolean;
  /** A failure to place this window is not a dropped organ (dense optional detail such as spines). */
  optional?: boolean;
  /** Only place this window if that one was placed (the spines of an areole). */
  requires?: Attachment;
  /** Take the exit frame from the window loop itself instead of the parent's analytic radial (small windows on ribbed or flat parents). */
  loopExit?: boolean;
  /**
   * Side of the parent surface the child leaves from, for windows on concave
   * faces (the inside of a snap trap, the upper face of a channelled blade):
   * the measured loop normal is flipped to agree with it instead of pointing
   * away from the centreline.
   */
  normalHint?: V3;
  /**
   * Measure `az` in the frame of the parent's own centreline instead of the
   * ring frame the mesher fits to the parent's window (round organs are
   * rotated to face their window): for children that must sit on the physical
   * underside or top of a branch (pendent bells, upturned funnels).
   */
  azFrame?: 'line';
  // Filled in by the planner.
  j0: number;
  row0: number;
  row1: number;
  /** Ring vertex count of the band the window lives in (parents with refinement bands). */
  N?: number;
  /** Set by the planner once the window has claimed its cells. */
  placed?: boolean;
}

export interface Organ {
  level: number;
  line: Line;
  /** Arc length of the first ring (collar length). */
  sStart: number;
  /**
   * Ring vertex j of N at arc length s, in the (right, up) frame of the
   * centreline; `z` is an optional offset along the axis (dimples, kernels).
   */
  profile: (s: number, j: number, N: number) => { x: number; y: number; z?: number };
  /** Local radius (window sizing, exits of children). */
  radius: (s: number) => number;
  /** Round cross-section: the ring phase is fitted to the window (blades keep their width axis). */
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
  /** Collar loops between the window and the first ring (defaults to the mesher's setting). */
  collarRings?: number;
  /** Minimum distance between ring stations (defaults to 30 % of the spacing / window row). */
  minGap?: number;
  /** Set by the mesher for round organs: the phase the ring frame was rotated by to fit the window. */
  phase?: number;
  /**
   * Row lattice pitch: when set, every child window is snapped so that its
   * rows lie on `sStart + k · pitch` (and its height becomes h · pitch). All
   * windows of the organ then share one row grid and can never knock each
   * other out by inserting a ring station inside another window's span.
   */
  rowLattice?: number;
  /**
   * Arc lengths where the ring vertex count doubles (fruit bodies and heads
   * that are much wider than their stalk). Each is a ring station; the band
   * between it and the next station is meshed with the all-quad 1→3 / 1→1
   * transition template (valence-3 and valence-5 vertices, no triangles).
   * Windows are never planned across a refinement station.
   */
  refine?: number[];
  /**
   * Terminal continuation: instead of capping the tip, the organ hands its
   * last ring to this child as its base loop (the rosette stem of an agave
   * becoming the peduncle). The exit is the tip frame.
   */
  continuation?: (exit: Exit) => Organ;
}

export interface Ring {
  idx: number[];
  s: number;
  f: Frame;
}

export interface PadWindow {
  a0: number;
  b0: number;
  w: number;
  h: number;
  make: (exit: Exit) => Organ;
}

/** Ground pad: a grid dome (K × K cells over a disc of radius R) with a body of revolution below the soil. */
export interface PadSpec {
  R: number;
  /** Dome height above y = -sink. */
  H: number;
  sink: number;
  /** Dome profile exponent (2 rounded, higher flatter). */
  prof: number;
  K: number;
  /** Rings of the body below the rim: depth below the ground and horizontal scale of the rim. */
  below: { depth: number; scale: number }[];
}

/** (rows, columns) offsets tried when a window does not fit where the child wants it, cheapest first. */
export const OFFSETS: [number, number][] = [
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

const STILL: VertexWind = { height: 0, limb: 0, phase: 0, detail: 0 };
const ORIGIN: V3 = { x: 0, y: 0, z: 0 };

export abstract class OrganMesher {
  readonly mesh = new QuadMesh();
  readonly stats: OrganStats = { organs: 0, junctions: 0, dropped: 0, dropReasons: {}, perLevel: [0, 0, 0, 0], counts: {} };
  protected plantH = 1;
  /** Detail flutter weight: absolute in the shader, so small plants get less of it. */
  protected flutter = 1;
  protected groundDepth = 0;
  /** Collar loops used when an organ does not say otherwise. */
  protected collarRingsDefault = 1;
  /**
   * When set, two windows whose row spans overlap must share their rows
   * exactly (every row of one that falls inside the other's span coincides
   * with a row of the other). Meshers that lay windows on a lattice enable
   * it so that a small window can never insert a ring station inside a big
   * window's span and knock it out.
   */
  protected strictRows = false;

  /** Normalise the sway weight by the real height of the plant and return the build result. */
  protected finish(swayScale = 1): OrganBuildResult {
    let maxY = 1e-3;
    const p = this.mesh.positions;
    for (let i = 1; i < p.length; i += 3) if (p[i] > maxY) maxY = p[i];
    const w = this.mesh.wind;
    for (let i = 0; i < w.length; i += 4) w[i] = clamp((p[(i / 4) * 3 + 1] / maxY) * swayScale, 0, 1);
    return { mesh: this.mesh, stats: this.stats, height: maxY, groundDepth: this.groundDepth };
  }

  protected count(name: string, n = 1): void {
    this.stats.counts[name] = (this.stats.counts[name] ?? 0) + n;
  }

  // ---------------------------------------------------------------------------
  // Ground pad
  // ---------------------------------------------------------------------------

  /** Point of the dome for grid coordinates in [0, 1]² (square grid mapped onto the disc with the elliptical mapping). */
  protected domePoint(sp: PadSpec, u01: number, v01: number): V3 {
    const u = 2 * u01 - 1;
    const v = 2 * v01 - 1;
    const x = u * Math.sqrt(Math.max(0, 1 - (v * v) / 2));
    const z = v * Math.sqrt(Math.max(0, 1 - (u * u) / 2));
    const r = Math.min(1, Math.sqrt(x * x + z * z));
    const y = -sp.sink + sp.H * (1 - Math.pow(r, sp.prof));
    return { x: sp.R * x, y, z: sp.R * z };
  }

  protected domeNormal(sp: PadSpec, u01: number, v01: number): V3 {
    const e = 0.5 / sp.K;
    const du = sub(this.domePoint(sp, Math.min(1, u01 + e), v01), this.domePoint(sp, Math.max(0, u01 - e), v01));
    const dv = sub(this.domePoint(sp, u01, Math.min(1, v01 + e)), this.domePoint(sp, u01, Math.max(0, v01 - e)));
    const n = cross(dv, du);
    return lengthSq(n) < 1e-18 ? { x: 0, y: 1, z: 0 } : normalize(n);
  }

  /**
   * Mesh the pad: dome grid with the window cells left open, the body below
   * the soil, then every organ growing from its window.
   */
  protected meshPad(sp: PadSpec, windows: PadWindow[]): void {
    const mesh = this.mesh;
    const K = sp.K;
    const cell = (2 * sp.R) / K;
    const cellWin = new Int32Array(K * K).fill(-1);
    windows.forEach((win, id) => {
      for (let a = win.a0; a < win.a0 + win.w; a++) for (let b = win.b0; b < win.b0 + win.h; b++) cellWin[a * K + b] = id;
    });
    const occ = (a: number, b: number): boolean => a >= 0 && b >= 0 && a < K && b < K && cellWin[a * K + b] >= 0;
    const interior = (a: number, b: number): boolean => occ(a - 1, b - 1) && occ(a - 1, b) && occ(a, b - 1) && occ(a, b);
    const vid = new Int32Array((K + 1) * (K + 1)).fill(-1);
    for (let a = 0; a <= K; a++) {
      for (let b = 0; b <= K; b++) {
        if (interior(a, b)) continue;
        const p = this.domePoint(sp, a / K, b / K);
        vid[a * (K + 1) + b] = mesh.addVertex(p.x, p.y, p.z, STILL, ORIGIN, 0, 0);
      }
    }
    const V = (a: number, b: number): number => vid[a * (K + 1) + b];
    this.stats.organs++;
    this.stats.perLevel[0]++;

    // Top quads (skipping window cells): (a,b) → (a,b+1) → (a+1,b+1) → (a+1,b) faces up.
    for (let a = 0; a < K; a++) {
      for (let b = 0; b < K; b++) {
        if (cellWin[a * K + b] >= 0) continue;
        mesh.addQuad(V(a, b), V(a, b + 1), V(a + 1, b + 1), V(a + 1, b), [a / K, b / K, a / K, (b + 1) / K, (a + 1) / K, (b + 1) / K, (a + 1) / K, b / K]);
      }
    }

    // Body below the soil: the rim carried down through the given rings and closed with a ladder cap.
    const rim: number[] = [];
    for (let a = 0; a < K; a++) rim.push(V(a, K));
    for (let b = K; b > 0; b--) rim.push(V(K, b));
    for (let a = K; a > 0; a--) rim.push(V(a, 0));
    for (let b = 0; b < K; b++) rim.push(V(0, b));
    const M = rim.length;
    let prev = rim;
    let depthMax = sp.sink;
    for (let q = 0; q < sp.below.length; q++) {
      const { depth, scale: sc } = sp.below[q];
      const ring: number[] = [];
      for (const v of rim) ring.push(mesh.addVertex(mesh.positions[v * 3] * sc, -depth, mesh.positions[v * 3 + 2] * sc, STILL, ORIGIN, 0, 0));
      const va = -0.1 * (q + 1);
      const vb = -0.1 * q;
      for (let j = 0; j < M; j++) {
        const j1 = (j + 1) % M;
        mesh.addQuad(ring[j], ring[j1], prev[j1], prev[j], [j / M, va, (j + 1) / M, va, (j + 1) / M, vb, j / M, vb]);
      }
      prev = ring;
      if (depth > depthMax) depthMax = depth;
    }
    this.groundDepth = depthMax;
    this.cap([...prev].reverse());

    // Organs.
    for (const win of windows) {
      const loop: number[] = [];
      const { a0, b0, w, h } = win;
      // Counter-clockwise seen from above: +a along b0+h, −b along a0+w, −a along b0, +b along a0.
      for (let a = a0; a < a0 + w; a++) loop.push(V(a, b0 + h));
      for (let b = b0 + h; b > b0; b--) loop.push(V(a0 + w, b));
      for (let a = a0 + w; a > a0; a--) loop.push(V(a, b0));
      for (let b = b0; b < b0 + h; b++) loop.push(V(a0, b));
      const uc = (a0 + w / 2) / K;
      const vc = (b0 + h / 2) / K;
      const exit: Exit = { pos: this.domePoint(sp, uc, vc), normal: this.domeNormal(sp, uc, vc), dir: { x: 0, y: 1, z: 0 }, size: Math.max(w, h) * cell, N: loop.length };
      const organ = win.make(exit);
      this.meshTube(organ, loop, exit, 1);
    }
  }

  /**
   * Generic window placement on the pad grid: each request asks for a w × h
   * window centred on grid coordinates (u, v) ∈ [0, 1]². Windows keep a
   * one-cell margin from each other and from the rim; a request that does not
   * fit is nudged by up to `reach` cells, then dropped.
   */
  protected placePadWindows(K: number, wants: { u: number; v: number; w: number; h: number; make: (exit: Exit) => Organ; reach?: number }[]): PadWindow[] {
    const taken = new Uint8Array(K * K);
    const out: PadWindow[] = [];
    const rimOK = (a: number, b: number, w: number, h: number): boolean => {
      // Every window vertex must lie inside the disc's usable radius (cells at the rim are left intact).
      const c = K / 2;
      const rr = (K / 2 - 1.5) * (K / 2 - 1.5);
      for (const [x, y] of [
        [a, b],
        [a + w, b],
        [a, b + h],
        [a + w, b + h],
      ]) {
        const dx = x - c;
        const dy = y - c;
        if (dx * dx + dy * dy > rr) return false;
      }
      return true;
    };
    const free = (a: number, b: number, w: number, h: number): boolean => {
      if (a < 1 || b < 1 || a + w > K - 1 || b + h > K - 1) return false;
      if (!rimOK(a, b, w, h)) return false;
      for (let x = a - 1; x <= a + w; x++) for (let y = b - 1; y <= b + h; y++) if (taken[x * K + y]) return false;
      return true;
    };
    for (const q of wants) {
      const ca = Math.round(q.u * K - q.w / 2);
      const cb = Math.round(q.v * K - q.h / 2);
      const reach = q.reach ?? 3;
      let placed = false;
      for (let ring = 0; ring <= reach && !placed; ring++) {
        for (let da = -ring; da <= ring && !placed; da++) {
          for (let db = -ring; db <= ring && !placed; db++) {
            if (Math.max(Math.abs(da), Math.abs(db)) !== ring) continue;
            const a = ca + da;
            const b = cb + db;
            if (!free(a, b, q.w, q.h)) continue;
            for (let x = a; x < a + q.w; x++) for (let y = b; y < b + q.h; y++) taken[x * K + y] = 1;
            out.push({ a0: a, b0: b, w: q.w, h: q.h, make: q.make });
            placed = true;
          }
        }
      }
      if (!placed) this.drop('no room on pad');
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Packing helpers
  // ---------------------------------------------------------------------------

  /** Window shape for a flat organ (leaf, blade) whose ring has N vertices: wider across the base than tall. */
  protected leafWindow(N: number): { w: number; h: number } {
    const half = Math.max(2, N / 2);
    const h = Math.max(1, Math.floor(half / 4));
    return { w: half - h, h };
  }

  /**
   * Ring spacing needed to pack `n` windows (w × h cells) around a stem of `N`
   * columns within `len` metres of arc length, given the planner's rules (a
   * free row between windows in the same columns, a free column between
   * neighbours). Never coarser than `spacing`.
   */
  protected packSpacing(n: number, w: number, h: number, N: number, len: number, spacing: number): number {
    const perRow = Math.max(1, Math.floor(N / (w + 1)));
    const rows = Math.ceil(n / perRow) * (h + 1) + 1;
    return clamp(len / rows, 0.15 * spacing, spacing);
  }

  // ---------------------------------------------------------------------------
  // Base ring: a capped disc below the soil as the topological root of a
  // plant with a single hub organ (columns, stems, taproots)
  // ---------------------------------------------------------------------------

  protected baseRing(centre: V3, r: number, N: number, level = 0): { loop: number[]; exit: Exit } {
    const loop: number[] = [];
    for (let j = 0; j < N; j++) {
      const th = (TAU * j) / N;
      // Same convention as the rings of a vertical organ: right = +X, up = cross(UP, X) = −Z.
      loop.push(this.mesh.addVertex(centre.x + r * Math.cos(th), centre.y, centre.z - r * Math.sin(th), STILL, ORIGIN, level, 0));
    }
    this.cap([...loop].reverse());
    this.stats.organs++;
    this.stats.perLevel[0]++;
    if (-centre.y > this.groundDepth) this.groundDepth = -centre.y;
    return { loop, exit: { pos: { x: centre.x, y: centre.y, z: centre.z }, normal: { x: 0, y: 1, z: 0 }, dir: { x: 0, y: 1, z: 0 }, size: 2 * r, N } };
  }

  // ---------------------------------------------------------------------------
  // Tubes
  // ---------------------------------------------------------------------------

  /** Distance from the exit to the first full ring: a sheath-like collar proportional to the child's size. */
  protected collarLen(r: number, k = 2.2): number {
    return Math.max(k * r, 0.0015);
  }

  protected meshTube(o: Organ, loop: number[], exit: Exit, depth: number): void {
    const mesh = this.mesh;
    const N0 = loop.length;
    const L = o.line.length;
    this.stats.organs++;
    this.stats.perLevel[Math.min(3, o.level)]++;

    // Round organs: rotate the ring frame so ring vertex k faces loop vertex k.
    if (o.round) {
      const f0 = o.line.at(o.sStart);
      const ph = this.fitPhase(loop, f0);
      o.phase = ph;
      if (Math.abs(ph) > 1e-6) {
        const rs = o.line.rights;
        for (let i = 0; i < rs.length; i++) rs[i] = rotateAxis(rs[i], o.line.dirs[i], ph);
        // Children placed in the centreline frame keep their physical azimuth.
        for (const c of o.children) if (c.azFrame === 'line') c.az -= ph;
      }
    }

    // Refinement bands: the vertex count doubles after each refinement station.
    const refines = (o.refine ?? []).filter((r) => r > o.sStart + 1e-9 && r < L - 1e-9).sort((a, b) => a - b);
    const Nat = (s: number): number => {
      let n = N0;
      for (const r of refines) if (s > r + 1e-9) n *= 2;
      return n;
    };
    // Keep windows clear of the refinement bands: the guard is 40 % of the local station gap.
    const guards = refines.map((r) => {
      let d = o.spacing;
      for (const m of [o.sStart, L, ...o.extra, ...refines]) if (m !== r) d = Math.min(d, Math.abs(m - r));
      return 0.4 * d;
    });
    const nearRefine = (lo: number, hi: number): boolean => refines.some((r, i) => lo < r + guards[i] && hi > r - guards[i]);

    // ---- Plan the windows of the children.
    const accepted: Attachment[] = [];
    const cands = o.children.slice().sort((a, b) => a.s - b.s);
    if (cands.some((c) => c.priority)) cands.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const lattice = o.rowLattice && o.rowLattice > 0 ? o.rowLattice : 0;
    for (const c of cands) {
      if (c.requires && !c.requires.placed) continue;
      if (c.w > Nat(c.s) - 2 || c.h < 1 || c.w < 1) {
        if (c.optional) this.count('skipped');
        else this.drop('window too wide');
        continue;
      }
      if (lattice) {
        c.hh = 0.5 * c.h * lattice;
        const k = Math.round((c.s - c.hh - o.sStart) / lattice);
        c.s = o.sStart + k * lattice + c.hh;
      }
      const sMin = o.sStart + (lattice ? c.hh - 1e-9 : 0.6 * c.hh);
      const sMax = L - 0.6 * c.hh;
      const epsSame = lattice ? 0.5 * lattice : 0.6 * c.hh;
      let placed = false;
      for (const [dr, dj] of OFFSETS) {
        if (c.fixed && (dr !== 0 || dj !== 0)) break;
        const s = c.s + dr * (lattice ? lattice : 2 * c.hh);
        const lo = s - c.hh;
        const hi = s + c.hh;
        if (lo < sMin || hi > sMax) continue;
        if (refines.length && nearRefine(lo, hi)) continue;
        const Nc = Nat(s);
        const colStep = TAU / Nc;
        const jBase = Math.round(c.az / colStep - c.w / 2);
        const j0 = mod(jBase + dj, Nc);
        let ok = true;
        for (const a of accepted) {
          if ((a.N ?? N0) !== Nc) continue; // another band: its rows cannot overlap ours
          const aLo = a.s - a.hh;
          const aHi = a.s + a.hh;
          if (circularOverlap(j0, c.w, a.j0, a.w, Nc)) {
            // Same columns: keep a clear band of tube between the windows.
            if (lo < aHi + epsSame && aLo < hi + epsSame) {
              ok = false;
              break;
            }
          } else if (circularOverlap(j0 - 1, c.w + 2, a.j0, a.w, Nc)) {
            // Neighbouring columns: the windows may touch corner to corner but not overlap.
            if (lo < aHi - 1e-9 && aLo < hi - 1e-9) {
              ok = false;
              break;
            }
          }
          if (this.strictRows && lo < aHi - 1e-9 && aLo < hi - 1e-9 && !rowsCompatible(lo, hi, c.h, aLo, aHi, a.h)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        c.s = s;
        c.j0 = j0;
        c.N = Nc;
        c.az = (j0 + c.w / 2) * colStep;
        c.placed = true;
        accepted.push(c);
        placed = true;
        break;
      }
      if (!placed) {
        if (c.optional) this.count('skipped');
        else this.drop(L - o.sStart < (lattice ? 3.6 : 3.2) * c.hh ? 'organ too short' : 'window conflict');
      }
    }

    // ---- Ring stations.
    const st = this.stations(o, accepted, refines);
    const K = st.length;
    const Ns: number[] = st.map((s) => Nat(s));
    const transition: boolean[] = [];
    for (let i = 0; i < K - 1; i++) {
      transition.push(Ns[i + 1] !== Ns[i]);
      if (Ns[i + 1] !== Ns[i] && Ns[i + 1] !== 2 * Ns[i]) throw new Error('meshTube: refinement stations must be at least one ring spacing apart');
    }
    const occupied: Uint8Array[] = [];
    for (let i = 0; i < Math.max(1, K - 1); i++) occupied.push(new Uint8Array(Ns[Math.min(i, K - 1)]));
    const rows: Attachment[] = [];
    for (const c of accepted) {
      c.placed = false;
      if (c.requires && !c.requires.placed) continue;
      const Nc = c.N ?? N0;
      const row0 = nearestIndex(st, c.s - c.hh);
      const row1 = nearestIndex(st, c.s + c.hh);
      if (row0 < 1 || row1 > K - 1 || row1 - row0 !== c.h) {
        if (c.optional) this.count('skipped');
        else this.drop('no room on parent');
        continue;
      }
      let free = true;
      for (let i = row0; i < row1 && free; i++) {
        if (transition[i] || Ns[i] !== Nc) free = false;
        for (let j = 0; j < c.w && free; j++) if (occupied[i][mod(c.j0 + j, Nc)]) free = false;
      }
      if (!free) {
        if (c.optional) this.count('skipped');
        else this.drop('window conflict');
        continue;
      }
      c.placed = true;
      for (let i = row0; i < row1; i++) for (let j = 0; j < c.w; j++) occupied[i][mod(c.j0 + j, Nc)] = 1;
      c.row0 = row0;
      c.row1 = row1;
      c.s = 0.5 * (st[row0] + st[row1]);
      rows.push(c);
    }

    // ---- Rings.
    const cellOcc = (i: number, j: number): boolean => i >= 0 && i < K - 1 && !transition[i] && occupied[i][mod(j, Ns[i])] === 1;
    const interior = (i: number, j: number): boolean => cellOcc(i - 1, j - 1) && cellOcc(i - 1, j) && cellOcc(i, j - 1) && cellOcc(i, j);
    // Mitre: tilt the first ring towards the parent surface.
    const a0 = o.line.dirs[0];
    const theta = Math.acos(clamp(dot(a0, exit.normal), -1, 1));
    const alpha = theta * 0.5 * clamp(o.sStart / Math.max(1e-6, 2.2 * o.r0), 0, 1);
    const tilt = alpha > 1e-3 ? rotateTowards(a0, exit.normal, alpha) : undefined;
    const rings: Ring[] = [];
    for (let i = 0; i < K; i++) rings.push(this.buildRing(o, st[i], Ns[i], i === 0 ? tilt : undefined, (j) => interior(i, j)));

    // ---- Collar, tube, cap.
    this.collar(loop, rings[0], exit, o);
    for (let i = 0; i < K - 1; i++) {
      const a = rings[i].idx;
      const b = rings[i + 1].idx;
      const va = st[i] / L;
      const vb = st[i + 1] / L;
      if (transition[i]) {
        this.refineBand(o, rings[i], rings[i + 1], va, vb);
        continue;
      }
      const N = Ns[i];
      const occ = occupied[i];
      for (let j = 0; j < N; j++) {
        if (occ[j]) continue;
        const j1 = (j + 1) % N;
        mesh.addQuad(a[j], a[j1], b[j1], b[j], [j / N, va, (j + 1) / N, va, (j + 1) / N, vb, j / N, vb]);
      }
    }
    if (o.continuation) {
      // The tip ring is the base loop of the continuation (no cap).
      const last = rings[K - 1];
      const f = o.line.at(L);
      const tipExit: Exit = { pos: f.pos, normal: f.dir, dir: f.dir, size: 2 * Math.max(1e-4, o.radius(L)), N: last.idx.length };
      const next = o.continuation(tipExit);
      this.meshTube(next, last.idx, tipExit, depth + 1);
    } else {
      this.cap(rings[K - 1].idx);
    }

    // ---- Children.
    for (const c of rows) {
      const Nc = c.N ?? N0;
      const childLoop = this.holeLoop(rings, c, Nc);
      const childExit = this.childExit(o, c, childLoop, Nc);
      const child = c.make(childExit);
      this.meshTube(child, childLoop, childExit, depth + 1);
    }
  }

  /**
   * All-quad band between a ring of N vertices and the next ring of 2N:
   * even columns open into three (two extra vertices halfway up the band),
   * odd columns carry straight through. Same winding as the tube quads.
   */
  private refineBand(o: Organ, lower: Ring, upper: Ring, va: number, vb: number): void {
    const a = lower.idx;
    const c = upper.idx;
    const N = a.length;
    const sMid = 0.5 * (lower.s + upper.s);
    const fMid = o.line.at(sMid);
    const vm = 0.5 * (va + vb);
    for (let j = 0; j < N; j += 2) {
      const p = this.surfaceVertex(o, fMid, sMid, j + 0.4, N);
      const q = this.surfaceVertex(o, fMid, sMid, j + 0.8, N);
      const j1 = (j + 1) % N;
      const j2 = (j + 2) % N;
      const c0 = c[(2 * j) % (2 * N)];
      const c1 = c[(2 * j + 1) % (2 * N)];
      const c2 = c[(2 * j + 2) % (2 * N)];
      const c3 = c[(2 * j + 3) % (2 * N)];
      const c4 = c[(2 * j + 4) % (2 * N)];
      const u0 = j / N;
      const u1 = (j + 0.4) / N;
      const u2 = (j + 0.8) / N;
      const u3 = (j + 1) / N;
      const u4 = (j + 2) / N;
      const uc = (k: number): number => (2 * j + k) / (2 * N);
      this.mesh.addQuad(a[j], p, c1, c0, [u0, va, u1, vm, uc(1), vb, uc(0), vb]);
      this.mesh.addQuad(p, q, c2, c1, [u1, vm, u2, vm, uc(2), vb, uc(1), vb]);
      this.mesh.addQuad(q, a[j1], c3, c2, [u2, vm, u3, va, uc(3), vb, uc(2), vb]);
      this.mesh.addQuad(a[j], a[j1], q, p, [u0, va, u3, va, u2, vm, u1, vm]);
      this.mesh.addQuad(a[j1], a[j2], c4, c3, [u3, va, u4, va, uc(4), vb, uc(3), vb]);
    }
  }

  /** Vertex of the organ surface at arc length s and (possibly fractional) column j of N, no mitre. */
  private surfaceVertex(o: Organ, f: Frame, s: number, j: number, N: number): number {
    const q = o.profile(s, j, N);
    const z = q.z ?? 0;
    const p = {
      x: f.pos.x + q.x * f.right.x + q.y * f.up.x + z * f.dir.x,
      y: f.pos.y + q.x * f.right.y + q.y * f.up.y + z * f.dir.y,
      z: f.pos.z + q.x * f.right.z + q.y * f.up.z + z * f.dir.z,
    };
    return this.mesh.addVertex(p.x, p.y, p.z, o.wind(s, p.y), o.pivot, o.level, 0);
  }

  /** Exit frame of a child window. Round parents use the analytic radial; flat parents measure the loop. */
  private childExit(o: Organ, c: Attachment, childLoop: number[], N: number): Exit {
    const colStep = TAU / N;
    const f = o.line.at(c.s);
    if (o.round && !c.loopExit) {
      const radial = normalize(add(scale(f.right, Math.cos(c.az)), scale(f.up, Math.sin(c.az))));
      const pos = addScaled(f.pos, radial, o.radius(c.s));
      return { pos, normal: radial, dir: f.dir, size: Math.max(c.w * colStep * o.radius(c.s), 2 * c.hh), N: childLoop.length };
    }
    // Centroid and Newell normal of the loop polygon, oriented away from the centreline.
    const M = childLoop.length;
    const cen = { x: 0, y: 0, z: 0 };
    const nrm = { x: 0, y: 0, z: 0 };
    for (let k = 0; k < M; k++) {
      const p = this.pos(childLoop[k]);
      const q = this.pos(childLoop[(k + 1) % M]);
      cen.x += p.x / M;
      cen.y += p.y / M;
      cen.z += p.z / M;
      nrm.x += (p.y - q.y) * (p.z + q.z);
      nrm.y += (p.z - q.z) * (p.x + q.x);
      nrm.z += (p.x - q.x) * (p.y + q.y);
    }
    let normal = lengthSq(nrm) < 1e-18 ? sub(cen, f.pos) : normalize(nrm);
    if (dot(normal, c.normalHint ?? sub(cen, f.pos)) < 0) normal = scale(normal, -1);
    let size = 0;
    for (let k = 0; k < M; k++) {
      const p = this.pos(childLoop[k]);
      for (let m = k + 1; m < M; m++) {
        const d = lengthSq(sub(p, this.pos(childLoop[m])));
        if (d > size) size = d;
      }
    }
    return { pos: cen, normal: normalize(normal), dir: f.dir, size: Math.sqrt(size), N: M };
  }

  /**
   * Ring stations along an organ: the collar ring, the tip, the rows of every
   * window, the organ's own feature stations and regular fill in between.
   * Nothing is ever inserted inside a window span, so a window always gets
   * exactly the rows it was planned with.
   */
  protected stations(o: Organ, windows: Attachment[], refines: number[] = []): number[] {
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
    for (const r of refines) mand.push({ s: r, pri: 2 });
    let minRow = Infinity;
    for (const w of windows) {
      mand.push({ s: w.s - w.hh, pri: 2 }, { s: w.s + w.hh, pri: 2 });
      for (let r = 1; r < w.h; r++) mand.push({ s: w.s - w.hh + (2 * w.hh * r) / w.h, pri: 2 });
      const cell = (2 * w.hh) / w.h;
      if (cell < minRow) minRow = cell;
    }
    for (const s of o.extra) if (s > sStart + 1e-6 && s < L - 1e-6 && !inside(s)) mand.push({ s, pri: 1 });
    const spacing = o.spacing;
    const eps = o.minGap ?? Math.min(spacing * 0.3, isFinite(minRow) ? minRow * 0.3 : Infinity);
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
      const n = o.rowLattice ? Math.max(0, Math.round(gap / spacing) - 1) : Math.floor(gap / spacing);
      if (n >= 1) {
        const step = gap / (n + 1);
        for (let k = 1; k <= n; k++) out.push(kept[i].s + k * step);
      }
    }
    return out;
  }

  protected buildRing(o: Organ, s: number, N: number, tiltNormal: V3 | undefined, skip: (j: number) => boolean): Ring {
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
      if (q.z) {
        off.x += q.z * f.dir.x;
        off.y += q.z * f.dir.y;
        off.z += q.z * f.dir.z;
      }
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

  /**
   * Fit a regular angular spacing to a closed loop as seen along the organ's
   * axis: the starting angle that best aligns ring vertex k with loop vertex k
   * (angles measured from the projected centroid).
   */
  protected fitPhase(loop: number[], f: Frame): number {
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

  /** Bridge the window loop to the first ring through the collar's fillet loops. */
  protected collar(loop: number[], first: Ring, exit: Exit, o: Organ): void {
    const mesh = this.mesh;
    const M = loop.length;
    const shift = this.bestShift(loop, first.idx);
    const lp: number[] = new Array(M);
    for (let k = 0; k < M; k++) lp[k] = loop[(k + shift) % M];
    const n = Math.max(0, Math.round(o.collarRings ?? this.collarRingsDefault));
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
  protected bestShift(loop: number[], ring: number[]): number {
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

  protected bridge(a: number[], b: number[]): void {
    const M = a.length;
    for (let k = 0; k < M; k++) {
      const k1 = (k + 1) % M;
      this.mesh.addQuad(a[k], a[k1], b[k1], b[k], [k / M, -0.05, (k + 1) / M, -0.05, (k + 1) / M, 0, k / M, 0]);
    }
  }

  /** Ladder cap of a ring that runs counter-clockwise seen from outside. */
  protected cap(ring: number[]): void {
    const M = ring.length;
    for (let i = 0; 2 * i <= M - 3; i++) {
      this.mesh.addQuad(ring[i], ring[i + 1], ring[M - 2 - i], ring[M - 1 - i], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  }

  /** Closed loop of vertex indices around a window, counter-clockwise seen from outside. */
  protected holeLoop(rings: Ring[], h: Attachment, N: number): number[] {
    const loop: number[] = [];
    const { row0, row1, j0, w } = h;
    for (let j = 0; j <= w; j++) loop.push(rings[row0].idx[mod(j0 + j, N)]);
    for (let i = row0 + 1; i <= row1; i++) loop.push(rings[i].idx[mod(j0 + w, N)]);
    for (let j = w - 1; j >= 0; j--) loop.push(rings[row1].idx[mod(j0 + j, N)]);
    for (let i = row1 - 1; i >= row0 + 1; i--) loop.push(rings[i].idx[mod(j0, N)]);
    for (const v of loop) if (v < 0) throw new Error('holeLoop: window touches a skipped vertex');
    return loop;
  }

  protected pos(i: number): V3 {
    const p = this.mesh.positions;
    return { x: p[i * 3], y: p[i * 3 + 1], z: p[i * 3 + 2] };
  }

  protected drop(reason: string, n = 1): void {
    this.stats.dropped += n;
    this.stats.dropReasons[reason] = (this.stats.dropReasons[reason] ?? 0) + n;
  }
}

// -----------------------------------------------------------------------------
// Helpers shared by the organ meshers
// -----------------------------------------------------------------------------

export function evenSides(n: number, lo: number, hi: number): number {
  return clamp(Math.round(n / 2) * 2, lo, hi);
}

/** Window (w × h cells) whose boundary loop has N vertices: 2(w + h) = N. */
export function windowFor(N: number): { w: number; h: number } {
  switch (N) {
    case 4:
      return { w: 1, h: 1 };
    case 6:
      return { w: 1, h: 2 };
    case 8:
      return { w: 2, h: 2 };
    case 10:
      return { w: 2, h: 3 };
    default:
      return { w: 3, h: 3 };
  }
}

/** Square-ish window with a loop of N vertices (N even, ≥ 4). */
export function squareWindow(N: number): { w: number; h: number } {
  const half = Math.max(2, Math.round(N / 2));
  const w = Math.floor(half / 2);
  return { w, h: half - w };
}

export function nearestIndex(sorted: number[], v: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid;
    else hi = mid;
  }
  return Math.abs(sorted[lo] - v) <= Math.abs(sorted[hi] - v) ? lo : hi;
}

/**
 * Do two windows with overlapping row spans agree on their rows? Every row of
 * one that falls strictly inside the other's span must coincide with a row of
 * the other (so neither inserts a ring station inside the other's window).
 */
export function rowsCompatible(lo: number, hi: number, h: number, aLo: number, aHi: number, ah: number): boolean {
  const cell = (hi - lo) / Math.max(1, h);
  const aCell = (aHi - aLo) / Math.max(1, ah);
  const eps = 0.2 * Math.min(cell, aCell);
  const has = (v: number, from: number, step: number, n: number): boolean => {
    const k = Math.round((v - from) / step);
    return k >= 0 && k <= n && Math.abs(from + k * step - v) <= eps;
  };
  for (let k = 0; k <= h; k++) {
    const v = lo + k * cell;
    if (v > aLo + eps && v < aHi - eps && !has(v, aLo, aCell, ah)) return false;
  }
  for (let k = 0; k <= ah; k++) {
    const v = aLo + k * aCell;
    if (v > lo + eps && v < hi - eps && !has(v, lo, cell, h)) return false;
  }
  return true;
}

/** Do circular integer intervals [a, a+wa) and [b, b+wb) on a ring of N overlap? */
export function circularOverlap(a: number, wa: number, b: number, wb: number, N: number): boolean {
  if (wa >= N || wb >= N) return true;
  a = mod(a, N);
  b = mod(b, N);
  const d = mod(b - a, N);
  if (d < wa) return true;
  const d2 = mod(a - b, N);
  return d2 < wb;
}

/**
 * Cross-section of a blade with N vertices, counter-clockwise seen from the
 * tip: right edge → adaxial (upper) face → left edge → abaxial face. `keel`
 * folds the blade into a V along the midrib, `rolled` curls it towards a
 * tube (edges up and inwards).
 */
export function bladePoint(N: number, j: number, width: number, thickness: number, keel: number, rolled: number): { x: number; y: number } {
  const m = N / 2;
  let u: number;
  let top: boolean;
  if (j <= m) {
    u = 1 - (2 * j) / m;
    top = true;
  } else {
    u = -1 + (2 * (j - m)) / m;
    top = false;
  }
  const hw = width * 0.5;
  const th = thickness * 0.5 * (1 - Math.pow(u, 4));
  // Flat, keeled profile.
  const yk = keel * width * Math.pow(Math.abs(u), 1.5);
  const fx = u * hw;
  const fy = yk + (top ? th : -th);
  if (rolled <= 1e-4) return { x: fx, y: fy };
  // Rolled: an arc of angle phi whose midrib stays at the origin; edges curl up and inwards.
  const phi = 5.8 * Math.max(0.15, rolled);
  const gap = TAU - phi;
  const Rr = width / phi;
  const ang = Math.PI / 2 + gap / 2 + ((u + 1) / 2) * phi;
  const rho = Rr + (top ? -th : th);
  const ax = rho * Math.cos(ang);
  const ay = Rr + rho * Math.sin(ang);
  return { x: fx + (ax - fx) * rolled, y: fy + (ay - fy) * rolled };
}

/**
 * Cupped leaf section: an exact circular arc of angle `phi` (radians) and
 * developed width `width`, centred `width / phi` along +up from the midrib,
 * so a leaf whose centreline follows a sphere of that radius hugs it.
 * Same vertex order as `bladePoint`.
 */
export function cupPoint(N: number, j: number, width: number, thickness: number, phi: number): { x: number; y: number } {
  const m = N / 2;
  let u: number;
  let top: boolean;
  if (j <= m) {
    u = 1 - (2 * j) / m;
    top = true;
  } else {
    u = -1 + (2 * (j - m)) / m;
    top = false;
  }
  const th = thickness * 0.5 * (1 - Math.pow(u, 4));
  if (phi < 1e-3) return { x: u * width * 0.5, y: top ? th : -th };
  const Rr = width / phi;
  const ang = -Math.PI / 2 + u * phi * 0.5;
  const rho = Rr + (top ? -th : th);
  return { x: rho * Math.cos(ang), y: Rr + rho * Math.sin(ang) };
}

/**
 * Ribbed round section: N vertices, `ribs` ribs whose crests sit at the
 * centre of the cells j = m·N/ribs (so an areole window of one column can be
 * placed exactly on a crest). `depth` is the trough depth as a fraction of
 * the radius, `sharp` > 1 narrows the troughs (rounded ribs, V-shaped
 * troughs), < 1 widens them.
 */
export function ribbedPoint(N: number, j: number, r: number, ribs: number, depth: number, sharp: number, scaleJ = 1): { x: number; y: number } {
  const th = (TAU * j) / N;
  let rr = r;
  if (ribs > 0 && depth > 0) {
    const rib = 0.5 - 0.5 * Math.cos((TAU * ribs * (j - 0.5)) / N);
    rr = r * (1 - depth * Math.pow(rib, sharp));
  }
  rr *= scaleJ;
  return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
}

/** 0 at the crest of the nearest rib, 1 in the trough (same phase convention as `ribbedPoint`). */
export function ribPhase(N: number, j: number, ribs: number): number {
  return 0.5 - 0.5 * Math.cos((TAU * ribs * (j - 0.5)) / N);
}

/** Column index of the rib crest m (0 ≤ m < ribs) for a ring of N vertices. */
export function crestColumn(N: number, ribs: number, m: number): number {
  return mod(Math.round((m * N) / ribs), N);
}

/**
 * Flat "stadium" section for pads: flat faces of length 2(a − b) joined by
 * semicircular edges of radius b, vertices spaced evenly along the perimeter
 * starting at the right edge (vertex 0) so the left edge is vertex N/2.
 * Counter-clockwise seen from the tip: right edge → upper face → left edge → lower face.
 */
export function stadiumPoint(N: number, j: number, a: number, b: number): { x: number; y: number } {
  const bb = Math.max(1e-6, Math.min(a, b));
  const flat = Math.max(0, a - bb);
  const P = 4 * flat + TAU * bb;
  let d = mod((j * P) / N + (Math.PI * bb) / 2, P); // start at the right edge centre
  // Segment 1: right semicircle from bottom (angle -π/2) to top (π/2), length π·b.
  const arc = Math.PI * bb;
  if (d < arc) {
    const ang = -Math.PI / 2 + d / bb;
    return { x: flat + bb * Math.cos(ang), y: bb * Math.sin(ang) };
  }
  d -= arc;
  // Segment 2: top face from x = flat to x = -flat.
  if (d < 2 * flat) return { x: flat - d, y: bb };
  d -= 2 * flat;
  // Segment 3: left semicircle from top (π/2) to bottom (3π/2).
  if (d < arc) {
    const ang = Math.PI / 2 + d / bb;
    return { x: -flat + bb * Math.cos(ang), y: bb * Math.sin(ang) };
  }
  d -= arc;
  // Segment 4: bottom face from x = -flat to x = flat.
  return { x: -flat + d, y: -bb };
}

/** Smoothstep. */
export function smooth(t: number): number {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Cosine-spaced stations over [s0, s1] (denser towards s1) for rounded tips and bodies. */
export function cosineStations(s0: number, s1: number, n: number, towardsEnd = true): number[] {
  const out: number[] = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const u = towardsEnd ? Math.sin((Math.PI * t) / 2) : 1 - Math.cos((Math.PI * t) / 2);
    out.push(s0 + (s1 - s0) * u);
  }
  return out;
}
