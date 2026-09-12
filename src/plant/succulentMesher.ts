/**
 * Welded desert-flora mesher.
 *
 * Cacti and rosette succulents use the same window/collar discipline as the
 * grass mesher, but their organs are deliberately different: ribbed tubes,
 * flattened pads, keeled leaves, areole bosses and real spine/teeth tubes.
 * Every child removes a cell window from its parent ring grid and grows through
 * that window; there are no decals, intersecting proxy meshes, or floating
 * detail pieces.  The root organ is capped with quads, so the final result is
 * one closed quad manifold.
 */

import { Random } from '../core/random';
import {
  V3,
  UP,
  TAU,
  DEG2RAD,
  add,
  addScaled,
  anyPerpendicular,
  clamp,
  cross,
  dot,
  lengthSq,
  lerp,
  mod,
  normalize,
  rotateAxis,
  scale,
  sub,
} from '../core/math';
import { Line, growLine } from './line';
import { QuadMesh, VertexWind } from '../tree/mesh';
import { SucculentParams, succulentHeight } from './succulentParams';

export interface SucculentStats {
  /** Closed organs including the root body, pads, leaves and every spine. */
  organs: number;
  /** Successful parent windows bridged by collar loops. */
  junctions: number;
  dropped: number;
  dropReasons: Record<string, number>;
  /** body · arms/canes/pads · leaves/areoles · spines/teeth */
  perLevel: [number, number, number, number];
  arms: number;
  pads: number;
  leaves: number;
  canes: number;
  areoles: number;
  spines: number;
  teeth: number;
}

export interface SucculentSample {
  level: number;
  kind: string;
  pos: [number, number, number];
  dir: [number, number, number];
  parentDir: [number, number, number];
  radius: number;
  parentRadius: number;
}

export interface SucculentBuildResult {
  mesh: QuadMesh;
  stats: SucculentStats;
  height: number;
  groundDepth: number;
  samples: SucculentSample[];
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
  tag?: 'arm' | 'pad' | 'leaf' | 'cane' | 'areole' | 'spine' | 'tooth';
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
  tag?: Attachment['tag'];
}

interface Ring {
  idx: number[];
  s: number;
  f: { pos: V3; dir: V3; right: V3; up: V3 };
}

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
];

const GOLDEN = 2.399963229728653;

export class SucculentMesher {
  readonly mesh = new QuadMesh();
  private readonly p: SucculentParams;
  private readonly rng: Random;
  private plantH = 1;
  private groundDepth = 0;
  private stats: SucculentStats = {
    organs: 0,
    junctions: 0,
    dropped: 0,
    dropReasons: {},
    perLevel: [0, 0, 0, 0],
    arms: 0,
    pads: 0,
    leaves: 0,
    canes: 0,
    areoles: 0,
    spines: 0,
    teeth: 0,
  };
  private readonly samples: SucculentSample[] = [];

  constructor(params: SucculentParams, seed: number) {
    this.p = params;
    this.rng = new Random((seed ^ 0x4d3a9f1b) >>> 0);
  }

  build(): SucculentBuildResult {
    this.plantH = Math.max(0.2, succulentHeight(this.p) * (1 + this.p.heightV * 0.25 * this.rng.uniform()));
    let root: Organ;
    let rootN: number;
    switch (this.p.form) {
      case 'saguaro':
        ({ root, rootN } = this.buildSaguaro());
        break;
      case 'barrel':
        ({ root, rootN } = this.buildBarrel());
        break;
      case 'pricklyPear':
        ({ root, rootN } = this.buildPricklyPear());
        break;
      case 'cholla':
        ({ root, rootN } = this.buildCholla());
        break;
      case 'hedgehog':
        ({ root, rootN } = this.buildHedgehog());
        break;
      case 'ocotillo':
        ({ root, rootN } = this.buildOcotillo());
        break;
      case 'agave':
        ({ root, rootN } = this.buildRosette('agave'));
        break;
      case 'yucca':
        ({ root, rootN } = this.buildRosette('yucca'));
        break;
      case 'desertSpoon':
        ({ root, rootN } = this.buildRosette('desertSpoon'));
        break;
      case 'aloe':
        ({ root, rootN } = this.buildRosette('aloe'));
        break;
    }
    this.meshOrgan(root, rootN, undefined, undefined, true);

    let maxY = 1e-5;
    for (let i = 1; i < this.mesh.positions.length; i += 3) maxY = Math.max(maxY, this.mesh.positions[i]);
    for (let i = 0; i < this.mesh.wind.length; i += 4) {
      const y = this.mesh.positions[(i / 4) * 3 + 1];
      this.mesh.wind[i] = clamp(y / maxY, 0, 1);
    }
    this.groundDepth = Math.max(0.02, this.p.rootDepth);
    return {
      mesh: this.mesh,
      stats: this.stats,
      height: maxY,
      groundDepth: this.groundDepth,
      samples: this.samples,
    };
  }

  // ---------------------------------------------------------------------------
  // Species builders
  // ---------------------------------------------------------------------------

  private buildSaguaro(): { root: Organ; rootN: number } {
    const p = this.p;
    const H = this.plantH;
    const N = even(p.radialSegments, 16, 48);
    const r = p.bodyRadius * (0.95 + 0.1 * this.rng.next());
    const children: Attachment[] = [];
    const armCount = Math.max(1, Math.round(p.arms + this.rng.uniform() * 0.8));
    for (let k = 0; k < armCount; k++) {
      const s = clamp(p.armHeight * (0.88 + 0.12 * this.rng.next()), H * 0.28, H * 0.78);
      const az = (k * GOLDEN + this.rng.uniform() * 0.3) % TAU;
      const L = Math.max(0.7, p.armLength * (1 + p.armLengthV * this.rng.uniform()));
      children.push({ s, az, w: 3, h: 1, hh: Math.max(0.045, 0.035 * H / 2), make: (ex) => this.makeArm(ex, L, p.armRadius * (0.92 + 0.12 * this.rng.next()), k), tag: 'arm', j0: 0, row0: 0, row1: 0 });
    }
    this.addCactusAreoles(children, H, N, p.areoleRows, p.areolesPerRow, r, 'saguaro');
    const root = this.makeRound(
      verticalLine(H, 0),
      N,
      (s) => {
        const t = clamp(s / H, 0, 1);
        return r * (1 + 0.26 * Math.exp(-7 * t) - 0.2 * Math.pow(t, 1.8));
      },
      p.ribs,
      p.ribDepth,
      p.ribSharpness,
      0,
      children,
      { pivot: { x: 0, y: 0, z: 0 }, phase: this.rng.next(), spacing: H / Math.max(5, p.bodySegments), root: true, tag: undefined },
    );
    return { root, rootN: N };
  }

  private buildBarrel(): { root: Organ; rootN: number } {
    const p = this.p;
    const H = this.plantH;
    const N = even(p.radialSegments, 20, 48);
    const r = p.bodyRadius * (0.96 + 0.08 * this.rng.next());
    const children: Attachment[] = [];
    this.addCactusAreoles(children, H, N, p.areoleRows, p.areolesPerRow, r, 'barrel');
    // A woolly crown is represented by a dense, short areole cluster at the
    // crown rather than a floating texture patch.
    children.push({
      s: H * 0.78,
      az: this.rng.next() * TAU,
      w: 2,
      h: 1,
      hh: Math.max(0.025, H * 0.045),
      make: (ex) => this.makeCrownTuft(ex),
      tag: 'areole',
      j0: 0,
      row0: 0,
      row1: 0,
    });
    const root = this.makeRound(
      verticalLine(H, 0),
      N,
      (s) => {
        const t = clamp(s / H, 0, 1);
        const barrel = 0.08 + 0.92 * Math.pow(Math.sin(Math.PI * clamp(t, 0.03, 0.97)), 0.52);
        return r * barrel;
      },
      p.ribs,
      p.ribDepth,
      p.ribSharpness,
      0,
      children,
      { pivot: { x: 0, y: 0, z: 0 }, phase: this.rng.next(), spacing: H / Math.max(6, p.bodySegments), root: true },
    );
    return { root, rootN: N };
  }

  private buildHedgehog(): { root: Organ; rootN: number } {
    const p = this.p;
    const H = this.plantH;
    const N = even(p.radialSegments, 16, 40);
    const r = p.bodyRadius * (0.95 + 0.1 * this.rng.next());
    const children: Attachment[] = [];
    const heads = Math.max(1, Math.round(p.arms + 1));
    for (let k = 0; k < heads; k++) {
      const az = (k * GOLDEN + this.rng.uniform() * 0.2) % TAU;
      children.push({
        s: H * (0.44 + 0.12 * this.rng.next()),
        az,
        w: 2,
        h: 1,
        hh: Math.max(0.02, H * 0.05),
        make: (ex) => this.makeHedgehogHead(ex, H * (0.65 + 0.15 * this.rng.next()), r * 0.62, k),
        tag: 'arm',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    this.addCactusAreoles(children, H, N, Math.max(1, p.areoleRows - 3), Math.min(p.areolesPerRow, 6), r, 'hedgehog');
    const root = this.makeRound(
      verticalLine(H * 0.72, 0),
      N,
      (s) => r * (0.72 + 0.28 * Math.sin((Math.PI * s) / Math.max(1e-6, H * 0.72))),
      p.ribs,
      p.ribDepth,
      p.ribSharpness,
      0,
      children,
      { pivot: { x: 0, y: 0, z: 0 }, phase: this.rng.next(), spacing: H / 7, root: true },
    );
    return { root, rootN: N };
  }

  private buildPricklyPear(): { root: Organ; rootN: number } {
    const p = this.p;
    const N = even(p.radialSegments, 20, 40);
    const baseH = Math.max(0.24, this.plantH * 0.25);
    const children: Attachment[] = [];
    this.padBudget = Math.max(1, Math.round(p.pads));
    this.padsMade = 0;
    const base = Math.min(3, this.padBudget);
    for (let k = 0; k < base; k++) {
      const az = (k * GOLDEN + this.rng.uniform() * 0.25) % TAU;
      children.push({
        s: baseH * (0.55 + 0.2 * this.rng.next()),
        az,
        w: 6,
        h: 1,
        hh: Math.max(0.028, baseH * 0.08),
        make: (ex) => this.makePad(ex, 0, k),
        tag: 'pad',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    const root = this.makeRound(
      verticalLine(baseH, 0),
      N,
      (s) => p.bodyRadius * (1.15 - 0.28 * (s / baseH)),
      0,
      0,
      1,
      0,
      children,
      { pivot: { x: 0, y: 0, z: 0 }, phase: this.rng.next(), spacing: baseH / 5, root: true },
    );
    return { root, rootN: N };
  }

  private padBudget = 0;
  private padsMade = 0;

  private makePad(exit: Exit, depth: number, index: number): Organ {
    const p = this.p;
    this.padsMade++;
    const h = p.padHeight * (0.9 + 0.18 * this.rng.next());
    const w = p.padWidth * (0.9 + 0.15 * this.rng.next());
    const thick = Math.max(0.025, p.padThickness * (0.92 + 0.15 * this.rng.next()));
    const outward = normalize({ x: exit.normal.x, y: 0, z: exit.normal.z });
    const up = normalize(addScaled(UP, outward, 0.14 + 0.04 * this.rng.next()));
    const line = growLine(exit.pos, up, anyPerpendicular(up), h, Math.max(8, p.bodySegments * 2), (a, b) => ({
      gravity: (8 + 14 * (b - a)) * DEG2RAD,
      roll: (index % 2 === 0 ? 0.12 : -0.12) * (b - a),
    }));
    const children: Attachment[] = [];
    this.addPadAreoles(children, h, exit.N);
    if (depth < 2 && this.padsMade < this.padBudget) {
      const n = Math.min(2, this.padBudget - this.padsMade);
      for (let k = 0; k < n; k++) {
        const az = (k === 0 ? 0.25 : Math.PI - 0.25) + this.rng.uniform() * 0.18;
        children.push({
          s: h * (0.88 + 0.025 * k),
          az,
          w: Math.min(3, Math.max(2, Math.floor(exit.N / 3))),
          h: 1,
          hh: Math.max(0.025, h * 0.08),
          make: (ex) => this.makePad(ex, depth + 1, index + k + 1),
          tag: 'pad',
          j0: 0,
          row0: 0,
          row1: 0,
        });
      }
    }
    const shape = (s: number): number => {
      const t = clamp(s / h, 0, 1);
      return 0.12 + 0.88 * Math.pow(Math.max(0.02, Math.sin(Math.PI * t)), 0.36);
    };
    return this.makeFlat(
      line,
      (s, j, N) => {
        const q = shape(s);
        const a = (TAU * j) / N;
        return { x: (w * 0.5 * q) * Math.cos(a), y: (thick * 0.5 * q) * Math.sin(a) };
      },
      (s) => Math.max(0.004, w * 0.5 * shape(s)),
      1,
      children,
      { pivot: exit.pos, phase: this.rng.next(), spacing: Math.max(0.01, h / 8), sStart: this.collarStart(h, w * 0.18, exit.size), tag: 'pad', index },
    );
  }

  private addPadAreoles(children: Attachment[], L: number, parentN: number): void {
    const p = this.p;
    const rows = Math.max(2, Math.round(p.areoleRows));
    const per = Math.max(2, Math.min(Math.round(p.areolesPerRow), Math.max(2, Math.floor(parentN / 6))));
    const total = rows * per;
    for (let i = 0; i < total; i++) {
      const q = (i + 0.5) / total;
      const s = L * (0.14 + 0.58 * q);
      const az = i % 2 === 0 ? Math.PI * 0.5 : Math.PI * 1.5;
      children.push({
        s,
        az,
        w: 1,
        h: 1,
        hh: Math.max(0.008, L * 0.018),
        make: (ex) => this.makeAreole(ex, 1.2),
        tag: 'areole',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
  }

  private buildCholla(): { root: Organ; rootN: number } {
    const p = this.p;
    const N = even(p.radialSegments, 16, 40);
    this.jointBudget = Math.max(1, Math.round(p.joints));
    this.jointsMade = 0;
    const H = this.plantH;
    const baseH = Math.min(0.55, H * 0.32);
    const children: Attachment[] = [];
    const bases = Math.min(2, this.jointBudget);
    for (let k = 0; k < bases; k++) {
      children.push({
        s: baseH * (0.55 + 0.22 * this.rng.next()),
        az: (k * GOLDEN + this.rng.uniform() * 0.25) % TAU,
        w: 3,
        h: 1,
        hh: Math.max(0.018, baseH * 0.08),
        make: (ex) => this.makeChollaJoint(ex, 0, k),
        tag: 'arm',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    this.addCactusAreoles(children, baseH, N, Math.max(2, p.areoleRows - 2), Math.min(p.areolesPerRow, 6), p.bodyRadius, 'cholla');
    const root = this.makeRound(
      verticalLine(baseH, 0),
      N,
      () => p.bodyRadius * 1.05,
      p.ribs,
      p.ribDepth,
      p.ribSharpness,
      0,
      children,
      { pivot: { x: 0, y: 0, z: 0 }, phase: this.rng.next(), spacing: baseH / 4, root: true },
    );
    return { root, rootN: N };
  }

  private jointBudget = 0;
  private jointsMade = 0;

  private makeChollaJoint(exit: Exit, depth: number, index: number): Organ {
    const p = this.p;
    this.jointsMade++;
    const L = Math.max(0.16, this.plantH * (0.18 + 0.04 * this.rng.next()));
    const outward = normalize({ x: exit.normal.x, y: 0, z: exit.normal.z });
    const dir = normalize(add(scale(UP, 0.84), scale(outward, 0.54)));
    const right = normalize(cross(dir, outward));
    const line = growLine(exit.pos, dir, right, L, Math.max(5, p.bodySegments), (a, b) => ({
      gravity: (2 + 8 * (b - a)) * DEG2RAD,
      yaw: 2 * DEG2RAD * (b - a),
    }));
    const children: Attachment[] = [];
    const ownN = Math.max(4, exit.N);
    this.addCactusAreoles(children, L, ownN, Math.max(2, p.areoleRows - 2), Math.min(p.areolesPerRow, Math.floor(ownN / 2)), p.bodyRadius, 'cholla');
    if (depth < 2 && this.jointsMade < this.jointBudget) {
      const n = Math.min(Math.max(1, Math.round(p.branches)), this.jointBudget - this.jointsMade);
      for (let k = 0; k < n; k++) {
        children.push({
          s: L * (0.62 + 0.1 * k),
          az: (k * GOLDEN + 0.7) % TAU,
          w: 2,
          h: 1,
          hh: Math.max(0.012, L * 0.07),
          make: (ex) => this.makeChollaJoint(ex, depth + 1, index + k + 1),
          tag: 'arm',
          j0: 0,
          row0: 0,
          row1: 0,
        });
      }
    }
    return this.makeRound(
      line,
      ownN,
      (s) => p.bodyRadius * (0.94 - 0.18 * (s / L)),
      Math.max(5, p.ribs),
      p.ribDepth * 0.65,
      p.ribSharpness,
      1,
      children,
      { pivot: exit.pos, phase: this.rng.next(), spacing: L / 5, sStart: this.collarStart(L, p.bodyRadius, exit.size), tag: 'arm' },
    );
  }

  private buildOcotillo(): { root: Organ; rootN: number } {
    const p = this.p;
    const N = even(p.radialSegments, 16, 40);
    const baseH = Math.max(0.25, this.plantH * 0.18);
    const children: Attachment[] = [];
    const count = Math.max(5, Math.round(p.canes + this.rng.uniform()));
    for (let k = 0; k < count; k++) {
      children.push({
        s: baseH * (0.32 + 0.55 * this.rng.next()),
        az: (k * GOLDEN + this.rng.uniform() * 0.24) % TAU,
        w: 2,
        h: 1,
        hh: Math.max(0.018, baseH * 0.07),
        make: (ex) => this.makeCane(ex, k),
        tag: 'cane',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    const root = this.makeRound(
      verticalLine(baseH, 0),
      N,
      (s) => p.bodyRadius * (1.1 - 0.25 * (s / baseH)),
      0,
      0,
      1,
      0,
      children,
      { pivot: { x: 0, y: 0, z: 0 }, phase: this.rng.next(), spacing: baseH / 4, root: true },
    );
    return { root, rootN: N };
  }

  private makeCane(exit: Exit, index: number): Organ {
    const p = this.p;
    const L = p.caneLength * (0.9 + 0.14 * this.rng.next());
    const outward = normalize({ x: exit.normal.x, y: 0, z: exit.normal.z });
    const line = this.caneLine(exit.pos, outward, L, p.caneLean, p.caneCurve, index);
    const children: Attachment[] = [];
    const n = Math.max(0, Math.round(p.caneLeaves));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.55) / (n + 1);
      children.push({
        s: L * t,
        az: (k % 2) * Math.PI + this.rng.uniform() * 0.25,
        w: 1,
        h: 1,
        hh: Math.max(0.004, L * 0.012),
        make: (ex) => this.makeSmallLeaf(ex, 0.11 * (1 - 0.25 * t), 0.025, 0.55),
        tag: 'leaf',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    return this.makeRound(
      line,
      Math.max(6, exit.N),
      (s) => p.caneRadius * (1 - 0.42 * Math.pow(s / L, 1.2)),
      0,
      0,
      1,
      1,
      children,
      { pivot: exit.pos, phase: this.rng.next(), spacing: L / 12, sStart: this.collarStart(L, p.caneRadius, exit.size), tag: 'cane' },
    );
  }

  private buildRosette(kind: 'agave' | 'yucca' | 'desertSpoon' | 'aloe'): { root: Organ; rootN: number } {
    const p = this.p;
    const N = even(p.radialSegments, 20, 40);
    const isYucca = kind === 'yucca';
    const baseH = isYucca ? Math.max(0.45, this.plantH - p.leafLength * 0.72) : kind === 'desertSpoon' ? 0.2 : kind === 'aloe' ? 0.14 : 0.24;
    const children: Attachment[] = [];
    const count = Math.max(4, Math.round(p.leaves));
    // A ring window reserves a skin cell on either side.  More bands keep a
    // dense rosette from trying to put every golden-angle leaf on the same
    // axial station, while still leaving the leaf bases visibly clustered.
    const bands = Math.max(3, Math.ceil(count / Math.max(2, Math.floor(N / 10))));
    for (let i = 0; i < count; i++) {
      const band = i % bands;
      const tBand = bands <= 1 ? 0.5 : band / (bands - 1);
      const az = (i * GOLDEN + this.rng.uniform() * 0.12) % TAU;
      children.push({
        s: baseH * (0.58 + 0.34 * tBand),
        az,
        w: Math.min(3, Math.max(2, Math.floor(N / 10))),
        h: 1,
        hh: Math.max(0.0015, baseH * 0.006),
        make: (ex) => this.makeRosetteLeaf(ex, i, kind),
        tag: 'leaf',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    const root = this.makeRound(
      verticalLine(baseH, 0),
      N,
      (s) => p.bodyRadius * (1.12 - 0.35 * (s / Math.max(1e-6, baseH))),
      0,
      0,
      1,
      0,
      children,
      { pivot: { x: 0, y: 0, z: 0 }, phase: this.rng.next(), spacing: Math.max(0.025, baseH / 5), root: true },
    );
    return { root, rootN: N };
  }

  private makeRosetteLeaf(exit: Exit, index: number, kind: 'agave' | 'yucca' | 'desertSpoon' | 'aloe'): Organ {
    const p = this.p;
    const L = Math.max(0.08, p.leafLength * (1 + p.leafLengthV * this.rng.uniform()));
    const outward = normalize({ x: exit.normal.x, y: 0, z: exit.normal.z });
    const line = this.leafLine(exit.pos, outward, L, p.leafLean, p.leafCurve, p.leafCurl, index);
    const children: Attachment[] = [];
    const teeth = Math.max(0, Math.round(p.marginalTeeth));
    for (let k = 0; k < teeth; k++) {
      const t = 0.2 + (0.62 * (k + 0.5)) / Math.max(1, teeth);
      for (const side of [0, Math.PI]) {
        children.push({
          s: L * t,
          az: side,
          w: 1,
          h: 1,
          hh: Math.max(0.0025, L * 0.012),
          make: (ex) => this.makeTooth(ex, p.toothLength * (0.8 + 0.35 * this.rng.next())),
          tag: 'tooth',
          j0: 0,
          row0: 0,
          row1: 0,
        });
      }
    }
    if (p.terminalSpine) {
      children.push({
        s: L * 0.82,
        az: 0,
        w: 1,
        h: 1,
        hh: Math.max(0.0025, L * 0.012),
        make: (ex) => this.makeTipSpine(ex, Math.max(0.012, p.toothLength * 1.7)),
        tag: 'spine',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    const width = p.leafWidth * (kind === 'desertSpoon' ? 0.85 : 1);
    const thick = p.leafThickness * (kind === 'aloe' ? 1.2 : 1);
    return this.makeLeaf(line, exit, L, width, thick, p.leafTaper, p.leafKeel, p.leafCurl, children, 2, index);
  }

  // ---------------------------------------------------------------------------
  // Organ factories and defensive detail
  // ---------------------------------------------------------------------------

  private makeArm(exit: Exit, L: number, radius: number, index: number): Organ {
    const p = this.p;
    const outward = normalize({ x: exit.normal.x, y: 0, z: exit.normal.z });
    const line = this.armLine(exit.pos, outward, L, Math.max(0.15, p.armLean), index);
    const children: Attachment[] = [];
    const N = Math.max(6, exit.N);
    this.addCactusAreoles(children, L, N, Math.max(4, p.areoleRows - 2), Math.min(p.areolesPerRow, Math.floor(N / 2)), radius, 'arm');
    return this.makeRound(
      line,
      N,
      (s) => radius * (1 - 0.38 * Math.pow(s / L, 1.25)),
      p.ribs,
      p.ribDepth,
      p.ribSharpness,
      1,
      children,
      { pivot: exit.pos, phase: this.rng.next(), spacing: L / 10, sStart: this.collarStart(L, radius, exit.size), tag: 'arm' },
    );
  }

  private makeHedgehogHead(exit: Exit, L: number, radius: number, index: number): Organ {
    const children: Attachment[] = [];
    this.addCactusAreoles(children, L, Math.max(6, exit.N), 3, Math.min(8, Math.floor(Math.max(6, exit.N) / 2)), radius, 'hedgehog');
    const line = growLine(exit.pos, normalize(add(scale(exit.normal, 0.35), scale(UP, 0.94))), anyPerpendicular(exit.normal), L, 8, (a, b) => ({ gravity: 4 * DEG2RAD * (b - a) }));
    return this.makeRound(
      line,
      Math.max(6, exit.N),
      (s) => radius * (0.82 + 0.18 * Math.cos((Math.PI * s) / L)),
      this.p.ribs,
      this.p.ribDepth,
      this.p.ribSharpness,
      1,
      children,
      { pivot: exit.pos, phase: this.rng.next(), spacing: L / 5, sStart: this.collarStart(L, radius, exit.size), tag: 'arm' },
    );
  }

  private makeCrownTuft(exit: Exit): Organ {
    const p = this.p;
    const L = Math.max(0.05, this.plantH * 0.09);
    const children: Attachment[] = [];
    const count = Math.max(3, Math.round(p.spineClusters));
    for (let k = 0; k < count; k++) {
      children.push({ s: L * 0.58, az: (k * GOLDEN) % TAU, w: 1, h: 1, hh: Math.max(0.004, L * 0.08), make: (ex) => this.makeSpine(ex, p.spineLength * 1.2), tag: 'spine', j0: 0, row0: 0, row1: 0 });
    }
    const line = growLine(exit.pos, exit.normal, anyPerpendicular(exit.normal), L, 4, () => ({}));
    return this.makeRound(line, Math.max(4, exit.N), () => Math.max(0.012, exit.size * 0.35), 0, 0, 1, 2, children, { pivot: exit.pos, phase: this.rng.next(), spacing: L / 3, sStart: this.collarStart(L, exit.size * 0.25, exit.size), tag: 'areole' });
  }

  private makeAreole(exit: Exit, scaleFactor = 1): Organ {
    const p = this.p;
    const L = Math.max(0.018, p.spineLength * 0.55 * scaleFactor + 0.012);
    const r = Math.max(0.0025, Math.min(0.014, exit.size * 0.18));
    const children: Attachment[] = [];
    const n = Math.max(1, Math.min(Math.round(p.spineClusters), Math.max(1, Math.floor(exit.N / 3))));
    for (let k = 0; k < n; k++) {
      children.push({
        s: L * (0.62 + 0.08 * (k % 2)),
        az: (k * GOLDEN + this.rng.uniform() * 0.18) % TAU,
        w: 1,
        h: 1,
        hh: Math.max(0.0025, L * 0.09),
        make: (ex) => this.makeSpine(ex, Math.max(0.006, p.spineLength * (0.82 + p.spineLengthV * this.rng.uniform()))),
        tag: 'spine',
        j0: 0,
        row0: 0,
        row1: 0,
      });
    }
    const line = growLine(exit.pos, exit.normal, anyPerpendicular(exit.normal), L, 3, () => ({}));
    return this.makeRound(line, Math.max(4, exit.N), () => r * (1 - 0.25 * 0.5), 0, 0, 1, 3, children, { pivot: exit.pos, phase: this.rng.next(), spacing: L / 2, sStart: this.collarStart(L, r, exit.size), tag: 'areole' });
  }

  private makeSpine(exit: Exit, L: number): Organ {
    const radius = Math.max(0.00025, Math.min(this.p.spineRadius, exit.size * 0.22));
    const outward = normalize(exit.normal);
    const line = growLine(exit.pos, outward, anyPerpendicular(outward), Math.max(0.004, L), 3, () => ({}));
    this.stats.spines++;
    return this.makeRound(line, Math.max(4, exit.N), (s) => radius * (1 - 0.72 * Math.pow(s / Math.max(1e-6, line.length), 0.8)), 0, 0, 1, 3, [], { pivot: exit.pos, phase: this.rng.next(), spacing: line.length / 2, sStart: this.collarStart(line.length, radius, exit.size), tag: 'spine' });
  }

  private makeTooth(exit: Exit, L: number): Organ {
    const radius = Math.max(0.0003, Math.min(0.003, exit.size * 0.19));
    const line = growLine(exit.pos, normalize(exit.normal), anyPerpendicular(exit.normal), Math.max(0.004, L), 3, () => ({}));
    this.stats.teeth++;
    return this.makeRound(line, Math.max(4, exit.N), (s) => radius * (1 - 0.7 * Math.pow(s / Math.max(1e-6, line.length), 0.8)), 0, 0, 1, 3, [], { pivot: exit.pos, phase: this.rng.next(), spacing: line.length / 2, sStart: this.collarStart(line.length, radius, exit.size), tag: 'tooth' });
  }

  private makeTipSpine(exit: Exit, L: number): Organ {
    const radius = Math.max(0.0003, Math.min(0.003, exit.size * 0.19));
    const direction = normalize(exit.dir);
    const line = growLine(exit.pos, direction, anyPerpendicular(direction), Math.max(0.004, L), 3, () => ({}));
    this.stats.spines++;
    return this.makeRound(line, Math.max(4, exit.N), (s) => radius * (1 - 0.72 * Math.pow(s / Math.max(1e-6, line.length), 0.8)), 0, 0, 1, 3, [], { pivot: exit.pos, phase: this.rng.next(), spacing: line.length / 2, sStart: this.collarStart(line.length, radius, exit.size), tag: 'spine' });
  }

  private makeSmallLeaf(exit: Exit, L: number, width: number, lean: number): Organ {
    const outward = normalize(exit.normal);
    const line = this.leafLine(exit.pos, outward, L, lean * 55, 15, 0.02, 0);
    return this.makeLeaf(line, exit, L, width, width * 0.22, 0.75, 0.15, 0.02, [], 2, 0);
  }

  private makeLeaf(
    line: Line,
    exit: Exit,
    L: number,
    width: number,
    thickness: number,
    taper: number,
    keel: number,
    rolled: number,
    children: Attachment[],
    level: number,
    index: number,
  ): Organ {
    const half = Math.max(0.0006, width * 0.5);
    const taperPow = 1 + 3 * clamp(taper, 0, 1);
    const widthAt = (s: number): number => width * ((1 - Math.pow(clamp(s / L, 0, 1), taperPow)) * 0.9 + 0.1);
    return this.makeFlat(
      line,
      (s, j, N) => bladePoint(N, j, widthAt(s), thickness * (1 - 0.65 * clamp(s / L, 0, 1)), keel, rolled),
      (s) => Math.max(half * 0.1, widthAt(s) * 0.5),
      level,
      children,
      { pivot: exit.pos, phase: this.rng.next(), spacing: Math.max(0.004, L / 8), sStart: Math.min(0.18 * L, Math.max(1.8 * half, exit.size * 0.55)), tag: 'leaf', index },
    );
  }

  private addCactusAreoles(children: Attachment[], L: number, parentN: number, rows: number, perRow: number, radius: number, kind: SucculentParams['form'] | 'arm'): void {
    void radius;
    const rr = Math.max(1, Math.round(rows));
    const pp = Math.max(1, Math.min(Math.round(perRow), Math.max(1, Math.floor(parentN / 3))));
    const start = L * 0.12;
    const span = L * 0.72;
    for (let row = 0; row < rr; row++) {
      const t = (row + 0.5) / rr;
      for (let col = 0; col < pp; col++) {
        const az = (TAU * (col + 0.5)) / pp + (kind === 'cholla' ? row * 0.22 : 0);
        const s = start + span * t + (col % 2 === 0 ? -0.008 * L : 0.008 * L);
        children.push({
          s,
          az,
          w: 1,
          h: 1,
          hh: Math.max(0.006, L / Math.max(20, rr * 5)),
          make: (ex) => this.makeAreole(ex, kind === 'barrel' ? 1.1 : 1),
          tag: 'areole',
          j0: 0,
          row0: 0,
          row1: 0,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Generic organ mesher: plan windows, remove cells, bridge collars.
  // ---------------------------------------------------------------------------

  private makeRound(
    line: Line,
    NHint: number,
    radius: (s: number) => number,
    ribs: number,
    ribDepth: number,
    ribSharpness: number,
    level: number,
    children: Attachment[],
    opts: { pivot: V3; phase: number; spacing: number; root?: boolean; sStart?: number; tag?: Attachment['tag'] },
  ): Organ {
    const L = Math.max(0.002, line.length);
    const r0 = Math.max(0.00025, radius(Math.min(L, Math.max(0, opts.sStart ?? 0))));
    const sStart = opts.sStart ?? this.collarStart(L, r0, 0);
    const phase = opts.phase;
    const ribN = Math.max(0, Math.round(ribs));
    const sharp = Math.max(1, ribSharpness);
    const wind = this.windFor(level, opts.pivot, phase, L, false);
    return {
      level,
      line,
      sStart: Math.min(L * 0.35, Math.max(0.0008, sStart)),
      profile: (s, j, N) => {
        const theta = (TAU * j) / N;
        const base = Math.max(0.00015, radius(s));
        const crest = ribN > 0 ? Math.pow(Math.max(0, Math.cos(ribN * theta + phase * 0.15)), sharp) : 0;
        const modulation = ribN > 0 ? 1 - ribDepth * 0.34 + ribDepth * crest : 1;
        return { x: base * modulation * Math.cos(theta), y: base * modulation * Math.sin(theta) };
      },
      radius,
      round: true,
      extra: [],
      spacing: Math.max(0.0008, opts.spacing),
      children,
      wind,
      pivot: opts.pivot,
      r0: Math.max(r0, radius(Math.min(L, Math.max(sStart, 0.0008)))),
      tag: opts.tag,
    };
  }

  private makeFlat(
    line: Line,
    profile: Organ['profile'],
    radius: Organ['radius'],
    level: number,
    children: Attachment[],
    opts: { pivot: V3; phase: number; spacing: number; sStart: number; tag?: Attachment['tag']; index?: number },
  ): Organ {
    const L = Math.max(0.002, line.length);
    const wind = this.windFor(level, opts.pivot, opts.phase, L, true);
    return {
      level,
      line,
      sStart: Math.min(L * 0.32, Math.max(0.0008, opts.sStart)),
      profile,
      radius,
      round: false,
      extra: [],
      spacing: Math.max(0.0008, opts.spacing),
      children,
      wind,
      pivot: opts.pivot,
      r0: Math.max(0.0005, radius(opts.sStart)),
      tag: opts.tag,
    };
  }

  private windFor(level: number, pivot: V3, phase: number, L: number, detail: boolean): Organ['wind'] {
    const stiffness = this.p.form === 'ocotillo' ? 0.8 : this.p.form === 'yucca' || this.p.form === 'agave' || this.p.form === 'aloe' ? 0.65 : 0.25;
    return (s: number, y: number) => {
      const t = clamp(s / Math.max(1e-6, L), 0, 1);
      return {
        height: clamp(y / this.plantH, 0, 1),
        limb: level === 0 ? 0 : clamp((0.12 + 0.88 * t) * (0.45 + 0.55 * stiffness), 0, 1),
        phase: clamp(0.5 + 0.5 * Math.sin(phase * TAU), 0, 1),
        detail: detail ? clamp((0.22 + 0.78 * t) * (0.32 + 0.68 * this.p.detail), 0, 1) : clamp(0.08 * this.p.detail, 0, 1),
      };
    };
  }

  private meshOrgan(o: Organ, NHint: number, parentLoop?: number[], exit?: Exit, root = false): void {
    const N = even(NHint, 4, 48);
    if (o.round) this.fitPhase(o, parentLoop, N);
    this.stats.organs++;
    this.stats.perLevel[Math.min(3, Math.max(0, o.level))]++;
    if (o.tag === 'arm' || o.tag === 'cane' || o.tag === 'pad') {
      if (o.tag === 'arm') this.stats.arms++;
      if (o.tag === 'pad') this.stats.pads++;
      if (o.tag === 'cane') this.stats.canes++;
    }
    if (o.tag === 'leaf') this.stats.leaves++;
    if (o.tag === 'areole') this.stats.areoles++;

    const accepted = this.planWindows(o, N);
    const stations = this.stations(o, accepted);
    const K = stations.length;
    const occupied = new Uint8Array(Math.max(1, K - 1) * N);
    const rows: Attachment[] = [];
    for (const c of accepted) {
      const row0 = nearestIndex(stations, c.s - c.hh);
      const row1 = nearestIndex(stations, c.s + c.hh);
      if (row0 < 1 || row1 > K - 1 || row1 <= row0) {
        this.drop('window did not land on a ring cell');
        continue;
      }
      // A neighbouring organ may have forced an extra station through this
      // interval.  Widening the cell span preserves the welded loop (and the
      // child's ring count) instead of throwing away a healthy organ.
      c.h = row1 - row0;
      let free = true;
      for (let i = row0; i < row1 && free; i++) for (let j = 0; j < c.w; j++) if (occupied[i * N + mod(c.j0 + j, N)]) free = false;
      if (!free) {
        this.drop('window conflict');
        continue;
      }
      const candidate = (i: number, j: number): boolean => {
        if (i < row0 || i >= row1) return false;
        for (let q = 0; q < c.w; q++) if (mod(c.j0 + q, N) === mod(j, N)) return true;
        return false;
      };
      let createsInterior = false;
      for (let i = row0 - 1; i <= row1; i++) {
        for (let j = c.j0 - 1; j <= c.j0 + c.w; j++) {
          const cell = (a: number, b: number): boolean => a >= 0 && a < K - 1 && (occupied[a * N + mod(b, N)] === 1 || candidate(a, b));
          const full = cell(i - 1, j - 1) && cell(i - 1, j) && cell(i, j - 1) && cell(i, j);
          const allNew = candidate(i - 1, j - 1) && candidate(i - 1, j) && candidate(i, j - 1) && candidate(i, j);
          if (full && !allNew) createsInterior = true;
        }
      }
      if (createsInterior) {
        this.drop('window conflict');
        continue;
      }
      for (let i = row0; i < row1; i++) for (let j = 0; j < c.w; j++) occupied[i * N + mod(c.j0 + j, N)] = 1;
      c.row0 = row0;
      c.row1 = row1;
      c.s = 0.5 * (stations[row0] + stations[row1]);
      rows.push(c);
    }

    const cellOcc = (i: number, j: number): boolean => i >= 0 && i < K - 1 && occupied[i * N + mod(j, N)] === 1;
    const interior = (i: number, j: number): boolean => cellOcc(i - 1, j - 1) && cellOcc(i - 1, j) && cellOcc(i, j - 1) && cellOcc(i, j);
    const rings: Ring[] = [];
    for (let i = 0; i < K; i++) rings.push(this.buildRing(o, stations[i], N, interior, i, i === 0 && !root ? exit : undefined));

    if (!root && parentLoop && exit) {
      this.collar(parentLoop, rings[0], exit, o);
    } else {
      this.cap([...rings[0].idx].reverse());
    }
    for (let i = 0; i < K - 1; i++) {
      const a = rings[i].idx;
      const b = rings[i + 1].idx;
      const va = stations[i] / Math.max(1e-6, o.line.length);
      const vb = stations[i + 1] / Math.max(1e-6, o.line.length);
      for (let j = 0; j < N; j++) {
        if (occupied[i * N + j]) continue;
        const j1 = (j + 1) % N;
        this.mesh.addQuad(a[j], a[j1], b[j1], b[j], [j / N, va, (j + 1) / N, va, (j + 1) / N, vb, j / N, vb]);
      }
    }
    this.cap(rings[K - 1].idx);

    for (const c of rows) {
      const childLoop = this.holeLoop(rings, c, N);
      const f = pointFrame(o.line, c.s);
      const radial = normalize(add(scale(f.right, Math.cos(c.az)), scale(f.up, Math.sin(c.az))));
      const pos = addScaled(f.pos, radial, Math.max(0.0001, o.radius(c.s)));
      const childExit: Exit = { pos, normal: radial, dir: f.dir, size: Math.max(c.w * (TAU / N) * o.radius(c.s), 2 * c.hh), N: childLoop.length };
      const child = c.make(childExit);
      const childDir = child.line.dirs[0] ?? childExit.dir;
      this.samples.push({
        level: child.level,
        kind: c.tag ?? child.tag ?? 'organ',
        pos: [childExit.pos.x, childExit.pos.y, childExit.pos.z],
        dir: [childDir.x, childDir.y, childDir.z],
        parentDir: [f.dir.x, f.dir.y, f.dir.z],
        radius: child.r0,
        parentRadius: o.radius(c.s),
      });
      this.meshOrgan(child, childExit.N, childLoop, childExit, false);
    }
  }

  private planWindows(o: Organ, N: number): Attachment[] {
    const L = o.line.length;
    const colStep = TAU / N;
    const out: Attachment[] = [];
    const cands = o.children.slice().sort((a, b) => a.s - b.s || a.az - b.az);
    for (const c of cands) {
      const w = Math.max(1, Math.min(N - 2, Math.round(c.w)));
      const h = Math.max(1, Math.round(c.h));
      const jBase = Math.round(c.az / colStep - w / 2);
      const sMin = o.sStart + Math.max(0.5 * c.hh, 0.0004);
      const sMax = L - Math.max(0.5 * c.hh, 0.0004);
      let placed = false;
      for (const [dr, dj] of OFFSETS) {
        const s = c.s + dr * 2 * c.hh;
        const lo = s - c.hh;
        const hi = s + c.hh;
        if (lo < sMin || hi > sMax) continue;
        const j0 = mod(jBase + dj, N);
        let ok = true;
        for (const a of out) {
          const aLo = a.s - a.hh;
          const aHi = a.s + a.hh;
          const axialOverlap = lo < aHi + 1e-9 && aLo < hi + 1e-9;
          // Leave a cell of parent skin between neighbouring windows.  Besides
          // keeping collars readable at close range this guarantees that a
          // 2×2 patch of removed cells can never isolate a parent vertex.
          if (axialOverlap && circularOverlap(j0 - 1, w + 2, a.j0, a.w, N)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        c.s = s;
        c.w = w;
        c.h = h;
        c.j0 = j0;
        out.push(c);
        placed = true;
        break;
      }
      if (!placed) this.drop(`${L - o.sStart < 3 * c.hh ? 'organ too short' : 'window conflict'} [${o.tag ?? 'body'}→${c.tag ?? 'organ'}]`);
    }
    return out;
  }

  private stations(o: Organ, windows: Attachment[]): number[] {
    const L = o.line.length;
    const start = Math.min(L * 0.35, Math.max(0.0008, o.sStart));
    const inside = (s: number): boolean => windows.some((w) => s > w.s - w.hh + 1e-8 && s < w.s + w.hh - 1e-8);
    const mand: number[] = [start, L];
    for (const w of windows) {
      mand.push(w.s - w.hh, w.s + w.hh);
      for (let i = 1; i < w.h; i++) mand.push(w.s - w.hh + (2 * w.hh * i) / w.h);
    }
    for (const s of o.extra) if (s > start + 1e-7 && s < L - 1e-7 && !inside(s)) mand.push(s);
    mand.sort((a, b) => a - b);
    const eps = Math.min(o.spacing * 0.22, 0.0002 + Math.min(...windows.map((w) => w.hh), L) * 0.22);
    const kept: number[] = [];
    for (const s0 of mand) {
      const s = clamp(s0, start, L);
      if (kept.length && s - kept[kept.length - 1] < eps) kept[kept.length - 1] = Math.max(kept[kept.length - 1], s);
      else kept.push(s);
    }
    if (kept.length < 2) return [start, L];
    kept[0] = start;
    kept[kept.length - 1] = L;
    const out: number[] = [];
    for (let i = 0; i < kept.length; i++) {
      out.push(kept[i]);
      if (i === kept.length - 1) break;
      const gap = kept[i + 1] - kept[i];
      if (inside(kept[i] + gap * 0.5)) continue;
      const n = Math.floor(gap / Math.max(1e-5, o.spacing));
      for (let k = 1; k <= n; k++) out.push(kept[i] + (gap * k) / (n + 1));
    }
    return uniqueSorted(out);
  }

  private buildRing(o: Organ, s: number, N: number, interior: (i: number, j: number) => boolean, row: number, tiltExit?: Exit): Ring {
    const f = pointFrame(o.line, s);
    const idx: number[] = new Array(N);
    const tilt = tiltExit && o.line.dirs.length ? rotateTowardsSafe(f.dir, tiltExit.normal, 0.35) : undefined;
    const an = tilt ? dot(f.dir, tilt) : 1;
    for (let j = 0; j < N; j++) {
      if (interior(row, j)) {
        idx[j] = -1;
        continue;
      }
      const q = o.profile(s, j, N);
      let off = add(scale(f.right, q.x), scale(f.up, q.y));
      if (tilt && an > 0.2) off = addScaled(off, f.dir, -dot(off, tilt) / an);
      const pos = add(f.pos, off);
      idx[j] = this.mesh.addVertex(pos.x, pos.y, pos.z, o.wind(s, pos.y), o.pivot, o.level, 0);
    }
    return { idx, s, f };
  }

  private fitPhase(o: Organ, loop: number[] | undefined, N: number): void {
    if (!loop || loop.length < 3 || !o.round) return;
    const f = pointFrame(o.line, o.sStart);
    let sx = 0;
    let sy = 0;
    for (let k = 0; k < loop.length; k++) {
      const p = this.position(loop[k]);
      const v = sub(p, f.pos);
      const a = Math.atan2(dot(v, f.up), dot(v, f.right)) - (TAU * k) / loop.length;
      sx += Math.cos(a);
      sy += Math.sin(a);
    }
    const phase = Math.atan2(sy, sx);
    for (let i = 0; i < o.line.rights.length; i++) o.line.rights[i] = rotateAxis(o.line.rights[i], o.line.dirs[i], phase);
  }

  private collar(loop: number[], first: Ring, exit: Exit, o: Organ): void {
    const M = loop.length;
    const shift = this.bestShift(loop, first.idx);
    const lp: number[] = new Array(M);
    for (let k = 0; k < M; k++) lp[k] = loop[(k + shift) % M];
    const n = 1;
    let prev = lp;
    const a0 = o.line.dirs[0];
    const radial = exit.normal;
    const cosT = Math.max(0.2, dot(a0, radial));
    for (let q = 0; q < n; q++) {
      const t = (q + 1) / (n + 1);
      const mid: number[] = [];
      for (let i = 0; i < M; i++) {
        const a = this.position(lp[i]);
        const b = this.position(first.idx[i]);
        const chord = lerp(a, b, t);
        let mu = dot(sub(b, a), radial) / cosT;
        mu = clamp(mu, 0, 4 * o.r0);
        const c = addScaled(b, a0, -mu);
        const w0 = (1 - t) * (1 - t);
        const w1 = 2 * t * (1 - t);
        const w2 = t * t;
        const bez = { x: a.x * w0 + c.x * w1 + b.x * w2, y: a.y * w0 + c.y * w1 + b.y * w2, z: a.z * w0 + c.z * w1 + b.z * w2 };
        const pos = lerp(chord, bez, 0.72);
        mid.push(this.mesh.addVertex(pos.x, pos.y, pos.z, o.wind(first.s * t, pos.y), o.pivot, o.level, 1));
      }
      this.bridge(prev, mid);
      prev = mid;
    }
    this.bridge(prev, first.idx);
    for (const v of loop) this.mesh.junction[v] = 1;
    for (const v of first.idx) this.mesh.junction[v] = 1;
    this.stats.junctions++;
  }

  private bridge(a: number[], b: number[]): void {
    const M = a.length;
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      this.mesh.addQuad(a[i], a[j], b[j], b[i], [i / M, -0.05, (i + 1) / M, -0.05, (i + 1) / M, 0, i / M, 0]);
    }
  }

  private cap(ring: number[]): void {
    const M = ring.length;
    for (let i = 0; 2 * i <= M - 3; i++) {
      this.mesh.addQuad(ring[i], ring[i + 1], ring[M - 2 - i], ring[M - 1 - i], [0, 0, 1, 0, 1, 1, 0, 1]);
    }
  }

  private holeLoop(rings: Ring[], h: Attachment, N: number): number[] {
    const loop: number[] = [];
    const { row0, row1, j0, w } = h;
    for (let j = 0; j <= w; j++) loop.push(rings[row0].idx[mod(j0 + j, N)]);
    for (let i = row0 + 1; i <= row1; i++) loop.push(rings[i].idx[mod(j0 + w, N)]);
    for (let j = w - 1; j >= 0; j--) loop.push(rings[row1].idx[mod(j0 + j, N)]);
    for (let i = row1 - 1; i >= row0 + 1; i--) loop.push(rings[i].idx[mod(j0, N)]);
    if (loop.some((v) => v < 0)) throw new Error('succulent window touches an interior skipped vertex');
    return loop;
  }

  private bestShift(loop: number[], ring: number[]): number {
    let best = 0;
    let costBest = Infinity;
    for (let shift = 0; shift < loop.length; shift++) {
      let cost = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = this.position(loop[(i + shift) % loop.length]);
        const b = this.position(ring[i]);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        cost += dx * dx + dy * dy + dz * dz;
      }
      if (cost < costBest) {
        costBest = cost;
        best = shift;
      }
    }
    return best;
  }

  private position(i: number): V3 {
    const p = this.mesh.positions;
    return { x: p[i * 3], y: p[i * 3 + 1], z: p[i * 3 + 2] };
  }

  private collarStart(L: number, radius: number, exitSize: number): number {
    return Math.min(L * 0.22, Math.max(2.35 * Math.max(0.00025, radius), 0.55 * exitSize, 0.0008));
  }

  private drop(reason: string, n = 1): void {
    this.stats.dropped += n;
    this.stats.dropReasons[reason] = (this.stats.dropReasons[reason] ?? 0) + n;
  }

  // ---------------------------------------------------------------------------
  // Centreline and profile helpers
  // ---------------------------------------------------------------------------

  private armLine(start: V3, outward: V3, L: number, lean: number, index: number): Line {
    const line = new Line();
    const side = normalize({ x: -outward.z, y: 0, z: outward.x });
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = t < 0.55 ? 0.96 * (t / 0.55) : 0.96 + 0.1 * ((t - 0.55) / 0.45);
      const rise = t < 0.55 ? 0.035 * t : 0.035 + 0.965 * Math.pow((t - 0.55) / 0.45, 1.12);
      const sway = Math.sin((t + index * 0.17) * Math.PI) * 0.035 * L;
      const pos = add(start, addScaled(addScaled(scale(outward, L * u), UP, L * rise), side, sway));
      const t2 = Math.min(1, t + 1 / steps);
      const u2 = t2 < 0.55 ? 0.96 * (t2 / 0.55) : 0.96 + 0.1 * ((t2 - 0.55) / 0.45);
      const r2 = t2 < 0.55 ? 0.035 * t2 : 0.035 + 0.965 * Math.pow((t2 - 0.55) / 0.45, 1.12);
      const next = add(start, addScaled(scale(outward, L * u2), UP, L * r2));
      const dir = normalize(sub(next, pos));
      const right = normalize(cross(dir, outward));
      line.push(pos, dir, lengthSq(right) > 1e-8 ? right : side);
    }
    return line;
  }

  private caneLine(start: V3, outward: V3, L: number, lean: number, curve: number, index: number): Line {
    const line = new Line();
    const side = normalize({ x: -outward.z, y: 0, z: outward.x });
    const steps = 16;
    const leanR = lean * DEG2RAD;
    const curveR = curve * DEG2RAD;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const radial = L * (0.12 + 0.32 * Math.sin(Math.PI * t) + 0.08 * t);
      const y = L * (t + 0.05 * Math.sin(Math.PI * t));
      const lateral = Math.sin(t * Math.PI * 1.3 + index) * Math.sin(leanR) * 0.15 * L;
      const pos = add(start, addScaled(addScaled(scale(outward, radial), UP, y), side, lateral));
      const t2 = Math.min(1, t + 1 / steps);
      const radial2 = L * (0.12 + 0.32 * Math.sin(Math.PI * t2) + 0.08 * t2);
      const y2 = L * (t2 + 0.05 * Math.sin(Math.PI * t2));
      const lateral2 = Math.sin(t2 * Math.PI * 1.3 + index) * Math.sin(leanR) * 0.15 * L;
      const next = add(start, addScaled(addScaled(scale(outward, radial2), UP, y2), side, lateral2));
      const dir = normalize(sub(next, pos));
      const right = normalize(cross(dir, outward));
      line.push(pos, dir, lengthSq(right) > 1e-8 ? right : side);
    }
    // `curve` is used as a gentle phase offset rather than a sharp kink; this
    // keeps the 5–10 canes whiplike and avoids a mechanical fan silhouette.
    void curveR;
    return line;
  }

  private leafLine(start: V3, outward: V3, L: number, lean: number, curve: number, curl: number, index: number): Line {
    const a = clamp(lean, 0, 88) * DEG2RAD;
    const dir = normalize(add(scale(UP, Math.cos(a)), scale(outward, Math.sin(a))));
    const right = normalize(cross(dir, outward));
    return growLine(start, dir, right, L, 12, (t0, t1) => ({
      gravity: (curve * (Math.pow(t1, 1.45) - Math.pow(t0, 1.45))) * DEG2RAD,
      yaw: 2.5 * DEG2RAD * (Math.sin(TAU * (t1 + index * 0.07)) - Math.sin(TAU * (t0 + index * 0.07))),
      roll: curl * (t1 - t0),
    }));
  }
}

function verticalLine(L: number, x: number): Line {
  const line = new Line();
  const steps = Math.max(4, Math.round(L * 3));
  for (let i = 0; i <= steps; i++) line.push({ x, y: (L * i) / steps, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
  return line;
}

function pointFrame(line: Line, s: number): { pos: V3; dir: V3; right: V3; up: V3 } {
  const f = line.at(s);
  return { pos: f.pos, dir: f.dir, right: f.right, up: cross(f.dir, f.right) };
}

function bladePoint(N: number, j: number, width: number, thickness: number, keel: number, rolled: number): { x: number; y: number } {
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
  const yk = keel * width * Math.pow(Math.abs(u), 1.5);
  const fx = u * hw;
  const fy = yk + (top ? th : -th);
  if (rolled <= 1e-4) return { x: fx, y: fy };
  const phi = 5.8 * Math.max(0.15, rolled);
  const gap = TAU - phi;
  const rr = width / phi;
  const angle = Math.PI / 2 + gap / 2 + ((u + 1) / 2) * phi;
  const rho = rr + (top ? -th : th);
  const ax = rho * Math.cos(angle);
  const ay = rr + rho * Math.sin(angle);
  return { x: fx + (ax - fx) * rolled, y: fy + (ay - fy) * rolled };
}

function even(n: number, lo: number, hi: number): number {
  return clamp(Math.round(n / 2) * 2, lo, hi);
}

function nearestIndex(a: number[], v: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= v) lo = mid;
    else hi = mid;
  }
  return Math.abs(a[lo] - v) <= Math.abs(a[hi] - v) ? lo : hi;
}

function uniqueSorted(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values.sort((a, b) => a - b)) if (!out.length || Math.abs(v - out[out.length - 1]) > 1e-7) out.push(v);
  return out;
}

function circularOverlap(a: number, wa: number, b: number, wb: number, N: number): boolean {
  if (wa >= N || wb >= N) return true;
  a = mod(a, N);
  b = mod(b, N);
  const d = mod(b - a, N);
  if (d < wa) return true;
  return mod(a - b, N) < wb;
}

function rotateTowardsSafe(a: V3, b: V3, amount: number): V3 {
  const d = clamp(dot(a, b), -1, 1);
  if (Math.acos(d) <= amount) return b;
  let axis = cross(a, b);
  if (lengthSq(axis) < 1e-12) axis = anyPerpendicular(a);
  return rotateAxis(a, normalize(axis), amount);
}
