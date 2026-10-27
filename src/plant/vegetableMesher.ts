/**
 * Vegetable mesher: the plant AND its crop as one closed quad manifold.
 *
 * Built on the organ mesher. A buried base ring (or a ground pad for vines)
 * is the topological root; the main stem grows from it and every branch,
 * petiole, blade, leaflet, pedicel, fruit, calyx sepal, husk leaf, ear, silk,
 * tassel branch and storage root is a tube welded to its parent through a
 * window. Fruits are much wider than their stalks, so their rings double
 * once or twice through the all-quad refinement bands right after the neck.
 *
 * Organ levels (Levels view / GLB TEXCOORD_1):
 *   0 main stem, vines, storage root · 1 branches, petioles, pedicels,
 *   tassel · 2 blades, leaflets, head leaves · 3 fruits, pods, ears, sepals,
 *   silks.
 */

import { VertexWind } from '../tree/mesh';
import { Random } from '../core/random';
import { V3, UP, TAU, DEG2RAD, add, addScaled, sub, cross, normalize, scale, clamp, projectOnPlane, lengthSq, anyPerpendicular, lerp1, lerp } from '../core/math';
import { growLine, lineThrough, Line } from './line';
import { OrganMesher, OrganStats, OrganBuildResult, Exit, Organ, Attachment, PadSpec, evenSides, squareWindow, ribbedPoint, cupPoint, bladePoint, smooth, cosineStations } from './organMesher';
import { VegetableParams, vegetableHeight, FruitShape } from './vegetableParams';

export type VegetableStats = OrganStats;

export interface VegetableBuildResult extends OrganBuildResult {
  stats: VegetableStats;
}

const GOLDEN = 2.399963229728653;

interface WindBase {
  limb: number;
  phase: number;
  pivot: V3;
}

interface StemSpec {
  level: number;
  L: number;
  sGround: number;
  r: number;
  N: number;
  dir0: V3;
  right0: V3;
  base: WindBase;
}

interface FruitSpec {
  shape: FruitShape;
  L: number;
  R: number;
  base: WindBase;
  dir0: V3;
  right0: V3;
  /** Ribs and their depth (oblate / pepper). */
  ribs: number;
  ribDepth: number;
  /** Fruit sits on the ground (vines): its axis is horizontal-ish and it is squashed slightly. */
  onGround: boolean;
}

const round = (rr: number, j: number, N: number): { x: number; y: number } => {
  const th = (TAU * j) / N;
  return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
};

export class VegetableMesher extends OrganMesher {
  private readonly p: VegetableParams;
  private readonly rng: Random;
  private readonly leafRng: Random;
  private readonly fruitRng: Random;
  private H = 1;
  private flexMax = 0.5;

  constructor(p: VegetableParams, seed: number) {
    super();
    this.p = p;
    this.collarRingsDefault = Math.max(0, Math.round(p.collarRings));
    this.rng = new Random((seed ^ 0x7e9e7ab1) >>> 0);
    this.leafRng = this.rng.fork();
    this.fruitRng = this.rng.fork();
  }

  build(): VegetableBuildResult {
    const p = this.p;
    this.plantH = Math.max(0.05, vegetableHeight(p));
    this.flutter = clamp(this.plantH / 1.2, 0.2, 1);
    this.flexMax = clamp(p.flex, 0, 1);
    switch (p.form) {
      case 'vine':
        this.buildVines();
        break;
      case 'rosette':
        this.buildRosette();
        break;
      case 'stalk':
        this.buildStalk();
        break;
      default:
        this.buildBush();
    }
    const r = this.finish(clamp(p.sway, 0, 1));
    return { ...r, stats: this.stats };
  }

  // ---------------------------------------------------------------------------
  // Frames
  // ---------------------------------------------------------------------------

  /** Direction leaving a surface at `angle` from the parent axis towards the outward normal. */
  private outDir(exit: Exit, angle: number): V3 {
    return normalize(add(scale(exit.dir, Math.cos(angle)), scale(exit.normal, Math.sin(angle))));
  }

  private rightFor(exit: Exit, dir0: V3): V3 {
    let r = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    r = lengthSq(r) < 1e-12 ? anyPerpendicular(dir0) : normalize(r);
    return r;
  }

  private still(base: WindBase, detail = 0): VertexWind {
    return { height: 0, limb: base.limb, phase: base.phase, detail };
  }

  // ---------------------------------------------------------------------------
  // Bush: main stem, branches, leaves, fruit on pedicels
  // ---------------------------------------------------------------------------

  private buildBush(): void {
    const p = this.p;
    const r = Math.max(0.002, p.radius);
    const N = evenSides(p.stemSides, 8, 24);
    const H = Math.max(0.05, p.height * (1 + p.heightV * this.rng.uniform()));
    this.H = H;
    const depth = 0.03 + 2 * r;
    const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, r * 1.05, N);
    const az = this.rng.next() * TAU;
    const lean = (p.lean + p.leanV * this.rng.uniform()) * DEG2RAD;
    const A = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    const dir0 = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
    const organ = this.makeStem(exit, { level: 0, L: depth + H, sGround: depth, r, N, dir0, right0: normalize(cross(UP, A)), base: { limb: 0, phase: this.rng.next(), pivot: { x: 0, y: 0, z: 0 } } });
    this.meshTube(organ, loop, exit, 1);
  }

  private makeStem(exit: Exit, c: StemSpec): Organ {
    const p = this.p;
    const { level, L, r, N } = c;
    const main = level === 0;
    const rng = this.rng;
    const curve = (main ? p.curve : p.branchDroop) * DEG2RAD * (1 + 0.4 * rng.uniform());
    const wob = rng.next() * TAU;
    const line = growLine(exit.pos, c.dir0, c.right0, L, 14, (t0, t1) => ({
      pitch: main ? curve * (t1 - t0) : 0,
      gravity: main ? 0 : curve * (Math.pow(t1, 1.6) - Math.pow(t0, 1.6)),
      yaw: 4 * DEG2RAD * (Math.sin(TAU * t1 + wob) - Math.sin(TAU * t0 + wob)),
    }));
    const s0 = main ? c.sGround : 0;
    const span = Math.max(1e-3, L - s0);
    const sStart = main ? 0.35 * c.sGround : Math.min(0.3 * L, Math.max(this.collarLen(r, 1.6), 0.55 * exit.size));
    const rad = (s: number): number => {
      const t = clamp((s - s0) / span, -1, 1);
      return r * (1 - 0.55 * Math.max(0, t)) * (t > 0.96 ? Math.max(0.3, 1 - ((t - 0.96) / 0.04) * 0.6) : 1);
    };
    const spacing0 = Math.max(0.002, p.ringAspect * ((TAU * r) / N));
    const flex = this.flexMax;
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return main ? { height: 0, limb: 0, phase: c.base.phase, detail: 0 } : { height: 0, limb: lerp1(c.base.limb, Math.max(c.base.limb, flex), t * t), phase: c.base.phase, detail: 0 };
    };
    const limbAt = (s: number): number => wind(s).limb;
    const pivot = main ? c.base.pivot : exit.pos;

    // ---- Plan the children.
    const children: Attachment[] = [];
    const leafN = evenSides(p.leafSides, 6, 16);
    const petN = this.petioleSides(leafN);
    const lw = p.petiole > 0 ? squareWindow(petN) : this.leafWindow(leafN);
    const nLeaves = Math.max(0, Math.round(main ? p.leaves : p.branchLeaves));
    const nBranches = main ? Math.max(0, Math.round(p.branches + p.branchesV * rng.uniform())) : 0;
    const nFruits = !main ? Math.max(0, Math.round(p.fruits + p.fruitsV * rng.uniform())) : 0;
    const bw = squareWindow(this.branchSides(N));
    const pedN = 6;
    const pw = squareWindow(pedN);
    // Row lattice fine enough to pack everything.
    const items = nLeaves + nBranches + nFruits;
    const maxCells = Math.max(lw.h, bw.h, pw.h);
    const spacing = this.packSpacing(items, Math.max(lw.w, bw.w, pw.w), maxCells, N, 0.9 * (L - sStart), spacing0);

    const az0 = rng.next() * TAU;
    let k = 0;
    // Branches.
    for (let i = 0; i < nBranches; i++, k++) {
      const f = p.branchFrom + ((p.branchTo - p.branchFrom) * (i + 0.5 + 0.3 * rng.uniform())) / Math.max(1, nBranches);
      const s = s0 + span * clamp(f, 0.05, 0.97);
      const az = az0 + k * GOLDEN;
      const lenJ = 1 + p.branchLengthV * rng.uniform();
      const angle = p.branchAngle * DEG2RAD * (1 + 0.15 * rng.uniform());
      const phase = rng.next();
      children.push({
        s,
        az,
        w: bw.w,
        h: bw.h,
        hh: 0.5 * bw.h * spacing,
        priority: 3,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => {
          const dir0 = this.outDir(ex, angle);
          return this.makeStem(ex, {
            level: 1,
            L: Math.max(0.02, p.branchLength * lenJ * this.H),
            sGround: 0,
            r: Math.max(0.0015, p.branchRadius * rad(s)),
            N: this.branchSides(N),
            dir0,
            right0: this.rightFor(ex, dir0),
            base: { limb: 0, phase, pivot: ex.pos },
          });
        },
      });
    }
    // Fruits (on branches): pedicels leaving the branch.
    for (let i = 0; i < nFruits; i++, k++) {
      const f = p.fruitFrom + ((p.fruitTo - p.fruitFrom) * (i + 0.5 + 0.3 * rng.uniform())) / Math.max(1, nFruits);
      const s = s0 + span * clamp(f, 0.05, 0.97);
      const az = az0 + k * GOLDEN + 0.4;
      const truss = Math.max(1, Math.round(p.truss));
      children.push({
        s,
        az,
        w: pw.w,
        h: pw.h,
        hh: 0.5 * pw.h * spacing,
        priority: 2,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makePedicel(ex, { limb: limbAt(s), phase: c.base.phase, pivot }, truss, false),
      });
    }
    // Leaves.
    for (let i = 0; i < nLeaves; i++, k++) {
      const f = 0.12 + (0.86 * (i + 0.5 + 0.2 * rng.uniform())) / Math.max(1, nLeaves);
      const s = s0 + span * clamp(f, 0.05, 0.98);
      const az = az0 + k * GOLDEN + 1.1;
      const lenJ = 1 + p.leafLengthV * this.leafRng.uniform();
      children.push({
        s,
        az,
        w: lw.w,
        h: lw.h,
        hh: 0.5 * lw.h * spacing,
        priority: 1,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeLeafOrPetiole(ex, { limb: limbAt(s), phase: c.base.phase, pivot }, lenJ, p.leafAngle * DEG2RAD, 1),
      });
    }
    this.count(main ? 'stem' : 'branches');
    return {
      level: main ? 0 : 1,
      line,
      sStart,
      profile: (s, j, NN) => round(rad(s), j, NN),
      radius: rad,
      round: true,
      extra: [],
      spacing,
      rowLattice: spacing,
      children,
      wind,
      pivot,
      r0: r,
    };
  }

  private branchSides(N: number): number {
    return evenSides(Math.round(N * 0.7), 6, N);
  }

  /** Ring vertices of a petiole: enough columns for the blade's window plus a free column either side. */
  private petioleSides(leafN: number): number {
    const { w } = this.leafWindow(leafN);
    return evenSides(Math.max(6, w + 2), 6, 16);
  }

  /** Does the petiole have room for the blade window? Otherwise the leaf is sessile. */
  private petioleFits(petL: number, rp: number, leafN: number): boolean {
    const N = this.petioleSides(leafN);
    const cell = (TAU * rp) / N;
    const { h } = this.leafWindow(leafN);
    return petL > (h + 3.5) * cell + this.collarLen(rp, 1.6);
  }

  // ---------------------------------------------------------------------------
  // Leaves: petiole + blade (simple / lobed / pinnate / strap)
  // ---------------------------------------------------------------------------

  /** A leaf leaving a stem: a petiole carrying the blade, or the blade itself for sessile leaves. */
  private makeLeafOrPetiole(exit: Exit, base: WindBase, lenJ: number, angle: number, level: number): Organ {
    const p = this.p;
    const bladeL = Math.max(0.01, p.leafLength * lenJ);
    const petL = Math.max(0.005, p.petiole * bladeL);
    const rp = Math.max(0.0006, p.petioleRadius);
    const bladeN = evenSides(p.leafSides, 6, 16);
    if (p.petiole <= 0 || !this.petioleFits(petL, rp, bladeN)) return this.makeBlade(exit, base, bladeL, angle, level + 1, 0);
    const dir0 = this.outDir(exit, angle);
    const right0 = this.rightFor(exit, dir0);
    const droop = p.leafDroop * DEG2RAD * 0.5;
    const line = growLine(exit.pos, dir0, right0, petL, 6, (t0, t1) => ({ gravity: droop * (t1 * t1 - t0 * t0) }));
    const sStart = Math.min(0.35 * petL, Math.max(this.collarLen(rp, 1.6), 0.5 * exit.size));
    const rad = (s: number): number => rp * (1 - 0.25 * clamp(s / petL, 0, 1));
    const flex = Math.max(base.limb, this.flexMax);
    const wind = (s: number): VertexWind => ({ height: 0, limb: lerp1(base.limb, flex, 0.5 * clamp(s / petL, 0, 1)), phase: base.phase, detail: 0 });
    const N = this.petioleSides(bladeN);
    const { w, h } = this.leafWindow(bladeN);
    const cell = (TAU * rp) / N;
    // The blade continues from the tip of the petiole: window on the upper side near the tip, blade running on.
    const children: Attachment[] = [
      {
        s: petL - (0.5 * h + 1.2) * cell,
        az: Math.PI / 2,
        w,
        h,
        hh: 0.5 * h * cell,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeBlade(ex, { limb: wind(petL).limb, phase: base.phase, pivot: base.pivot }, bladeL, 0, level + 1, 1),
      },
    ];
    this.count('petioles');
    return {
      level,
      line,
      sStart,
      profile: (s, j, NN) => round(rad(s), j, NN),
      radius: rad,
      round: true,
      extra: [],
      spacing: cell,
      rowLattice: cell,
      children,
      wind,
      pivot: base.pivot,
      r0: rp,
    };
  }

  /**
   * A blade: a tube with a leaf cross-section along a drooping midrib.
   * `mode` 0 = sessile (leaves the stem at `angle`), 1 = continues from the
   * tip of a petiole (leaves the petiole's upper side and turns along it).
   */
  private makeBlade(exit: Exit, base: WindBase, L: number, angle: number, level: number, mode: number): Organ {
    const p = this.p;
    const W = Math.max(0.004, p.leafWidth * L);
    let dir0: V3;
    if (mode === 1) dir0 = normalize(add(scale(exit.dir, 0.9), scale(exit.normal, 0.45)));
    else dir0 = this.outDir(exit, angle);
    // Width axis: horizontal-ish, perpendicular to the direction.
    let right0 = projectOnPlane(cross(UP, dir0), dir0);
    if (lengthSq(right0) < 1e-6) right0 = this.rightFor(exit, dir0);
    right0 = normalize(right0);
    // The blade's upper face (up = dir × right) must face upwards.
    if (cross(dir0, right0).y < 0) right0 = scale(right0, -1);
    const droop = p.leafDroop * DEG2RAD;
    const shape = p.leafShape;
    const strap = shape === 'strap';
    const line = growLine(exit.pos, dir0, right0, L, strap ? 14 : 10, (t0, t1) => ({
      gravity: droop * (Math.pow(t1, strap ? 2.2 : 1.6) - Math.pow(t0, strap ? 2.2 : 1.6)),
      roll: strap ? 0.25 * (t1 - t0) : 0,
    }));
    const N = evenSides(p.leafSides, 6, 16);
    const wNeck = Math.min(W, Math.max(0.9 * exit.size, 0.35 * W));
    const sStart = Math.min(0.25 * L, Math.max(this.collarLen(0.5 * wNeck, 1.2), 0.6 * exit.size));
    const grow = strap ? 0.25 : 0.32;
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      const g = wNeck + (W - wNeck) * smooth(t / grow);
      let outline: number;
      if (strap) outline = W * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.45) / 0.55), 1.8)), 0.7);
      else if (shape === 'pinnate') outline = W * 0.28 * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.5) / 0.5), 2)), 0.6);
      else outline = W * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.4) / 0.6), 1.7)), 0.65);
      return Math.max(0.04 * W, Math.min(g, outline));
    };
    const thk = clamp(p.leafThickness, 0.01, 0.5);
    const cup = p.leafCup * DEG2RAD;
    const perimeter = 2 * W * (1 + 0.5 * thk);
    const spacing0 = Math.max(0.003, (p.ringAspect * perimeter) / N);
    const flex = Math.max(base.limb, this.flexMax);
    const flutter = this.flutter;
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: 0, limb: lerp1(base.limb, flex, t * t), phase: base.phase, detail: 0.35 * t * t * flutter };
    };
    const children: Attachment[] = [];
    const pinnate = shape === 'pinnate';
    const lobed = shape === 'lobed';
    const nSide = Math.max(0, Math.round(p.leaflets));
    let spacing = spacing0;
    if ((pinnate || lobed) && nSide > 0) {
      const leafletN = Math.max(6, N - 2);
      const { w, h } = this.leafWindow(leafletN);
      spacing = this.packSpacing(nSide, w, h, N / 2, 0.75 * (L - sStart), spacing0);
      const colStep = TAU / N;
      for (let i = 0; i < nSide; i++) {
        const f = pinnate ? 0.15 + (0.7 * (i + 0.5)) / nSide : 0.2 + (0.6 * (i + 0.5)) / nSide;
        const sk = sStart + (L - sStart) * f;
        const size = pinnate ? lerp1(0.55, 0.32, i / Math.max(1, nSide - 1)) * L : Math.max(0.2, p.lobeDepth) * 0.5 * W * lerp1(1.2, 0.8, i / Math.max(1, nSide - 1));
        for (const side of [1, -1]) {
          const j0 = side > 0 ? N - 1 - Math.floor(w / 2) : N / 2 - 1 - Math.floor(w / 2);
          children.push({
            s: sk,
            az: (j0 + w / 2) * colStep,
            w,
            h,
            hh: 0.5 * h * spacing,
            optional: true,
            loopExit: true,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeLeaflet(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, size, level, line, sk, pinnate),
          });
        }
      }
    }
    this.count(mode === 2 ? 'leaflets' : 'blades');
    return {
      level,
      line,
      sStart,
      profile: (s, j, NN) => {
        const t = clamp(s / L, 0, 1);
        const w = widthAt(s);
        return strap ? bladePoint(NN, j, w, W * thk * (1 - 0.6 * t), 0.35 * (1 - t), 0) : cupPoint(NN, j, w, W * thk * (1 - 0.6 * t), cup * (1 - 0.3 * t));
      },
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: cosineStations(0.8 * L, L, 3, true),
      spacing,
      rowLattice: spacing,
      children,
      wind,
      pivot: base.pivot,
      r0: 0.5 * wNeck,
    };
  }

  /** Leaflet (pinnate) or lobe (lobed) leaving the margin of a blade. */
  private makeLeaflet(exit: Exit, base: WindBase, L: number, level: number, parent: Line, sParent: number, pinnate: boolean): Organ {
    const p = this.p;
    const f = parent.at(sParent);
    // Along the margin normal, raked towards the tip; lobes stay in the blade plane, leaflets droop a little.
    const rake = pinnate ? 0.55 : 0.35;
    let dir0 = normalize(add(scale(exit.normal, 1 - rake), scale(f.dir, rake)));
    dir0 = normalize(addScaled(dir0, f.up, pinnate ? -0.1 : 0.05));
    // The leaflet lies in the plane of its parent blade: width axis ⟂ dir0 within that plane, upper face
    // with the parent's upper face (dir0 × right0 = f.up).
    let right0 = projectOnPlane(cross(f.up, dir0), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const W = Math.max(0.003, (pinnate ? 0.55 : 0.9) * L);
    const line = growLine(exit.pos, dir0, right0, L, 6, (t0, t1) => ({ gravity: (pinnate ? 0.35 : 0.1) * (t1 * t1 - t0 * t0) }));
    const wNeck = Math.min(W, Math.max(0.9 * exit.size, 0.3 * W));
    const sStart = Math.min(0.3 * L, Math.max(this.collarLen(0.5 * wNeck, 1.2), 0.5 * exit.size));
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      const g = wNeck + (W - wNeck) * smooth(t / 0.35);
      const outline = W * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.35) / 0.65), 1.7)), 0.65);
      return Math.max(0.05 * W, Math.min(g, outline));
    };
    const thk = clamp(p.leafThickness, 0.01, 0.5);
    const N = exit.N;
    const spacing = Math.max(0.002, (p.ringAspect * 2 * W) / N);
    this.count(pinnate ? 'leaflets' : 'lobes');
    return {
      level,
      line,
      sStart,
      profile: (s, j, NN) => cupPoint(NN, j, widthAt(s), W * thk, 0.5 * p.leafCup * DEG2RAD),
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: cosineStations(0.8 * L, L, 2, true),
      spacing,
      children: [],
      wind: (s) => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0.4 * clamp(s / L, 0, 1) * this.flutter }),
      pivot: base.pivot,
      r0: 0.5 * wNeck,
    };
  }

  // ---------------------------------------------------------------------------
  // Fruits: pedicel → fruit body (+ calyx), trusses, pods, ears
  // ---------------------------------------------------------------------------

  /** Fruit stalk leaving a branch / vine, carrying one fruit (or a truss of them). */
  private makePedicel(exit: Exit, base: WindBase, truss: number, onGround: boolean): Organ {
    const p = this.p;
    const rp = Math.max(0.0008, p.pedicelRadius);
    const N = 6;
    const cell = (TAU * rp) / N;
    const trussN = Math.max(1, truss);
    const single = trussN === 1;
    const L0 = Math.max(0.006, p.pedicel);
    const droop = p.fruitDroop * DEG2RAD;
    let line: Line;
    if (onGround) {
      // Fruit on the soil: the stalk climbs from the vine to the top of the fruit (oblate / round) or to
      // the height of its axis (oblong), leaving the vine sideways.
      const upright = p.fruitShape === 'oblate' || p.fruitShape === 'round';
      const Rv = Math.max(0.002, p.fruitRadius);
      const yTip = upright ? Math.max(0.004, p.fruitLength) * 0.98 + 0.004 : Rv + 0.003;
      const rise = Math.max(0, yTip - exit.pos.y);
      const run = Math.max(L0, upright ? 0.6 * Rv + 0.5 * L0 : 0.8 * L0);
      const out = normalize({ x: exit.normal.x, y: 0, z: exit.normal.z });
      const tip = add(exit.pos, { x: out.x * run, y: rise, z: out.z * run });
      const mid = add(exit.pos, { x: out.x * run * 0.45, y: rise * 0.35, z: out.z * run * 0.45 });
      line = lineThrough([exit.pos, addScaled(exit.pos, exit.normal, 0.25 * run), mid, tip], this.rightFor(exit, exit.normal), 4);
    } else {
      // Leave the branch outwards, then turn down (or up for okra) by `droop`.
      const dir0 = this.outDir(exit, 70 * DEG2RAD);
      const right0 = this.rightFor(exit, dir0);
      line = growLine(exit.pos, dir0, right0, single ? L0 : L0 * (1 + 0.55 * trussN), 8, (t0, t1) => ({ gravity: droop * (smooth(t1 / 0.6) - smooth(t0 / 0.6)) }));
    }
    const L = line.length;
    const sStart = Math.min(0.3 * L, Math.max(this.collarLen(rp, 1.5), 0.5 * exit.size));
    const rad = (): number => rp;
    const flex = Math.max(base.limb, this.flexMax);
    const wind = (s: number): VertexWind => ({ height: 0, limb: lerp1(base.limb, flex, clamp(s / L, 0, 1)), phase: base.phase, detail: 0 });
    const children: Attachment[] = [];
    const fw = squareWindow(N); // 1×2: the fruit's neck window, refined right after
    const spacing = single ? cell : Math.max(cell, (L - sStart) / (trussN * 2.6));
    if (single) {
      // The fruit continues from the tip of the pedicel: window in the last cells, fruit along the axis.
      children.push({
        s: L - (0.5 * fw.h + 1.2) * spacing,
        az: -Math.PI / 2 + (onGround ? Math.PI : 0),
        w: fw.w,
        h: fw.h,
        hh: 0.5 * fw.h * spacing,
        loopExit: true,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeFruit(ex, this.fruitSpec(ex, base, onGround, 1, true)),
      });
    } else {
      for (let i = 0; i < trussN; i++) {
        const f = 0.3 + (0.65 * (i + 0.5)) / trussN;
        const sk = sStart + (L - sStart) * f;
        const az = i * GOLDEN + Math.PI / 2;
        children.push({
          s: sk,
          az,
          w: fw.w,
          h: fw.h,
          hh: 0.5 * fw.h * spacing,
          optional: true,
          loopExit: true,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeFruit(ex, this.fruitSpec(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, onGround, 1 - 0.06 * i, false)),
        });
      }
    }
    this.count('pedicels');
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => round(rad(), j, NN),
      radius: rad,
      round: true,
      extra: [],
      spacing,
      rowLattice: spacing,
      children,
      wind,
      pivot: base.pivot,
      r0: rp,
    };
  }

  private fruitSpec(exit: Exit, base: WindBase, onGround: boolean, sizeJ: number, alongAxis: boolean): FruitSpec {
    const p = this.p;
    const j = 1 + p.fruitLengthV * this.fruitRng.uniform();
    let dir0: V3;
    if (alongAxis) dir0 = normalize(add(scale(exit.dir, 1), scale(exit.normal, 0.5)));
    else dir0 = normalize(add(scale(exit.normal, 0.7), scale(UP, -0.7)));
    if (onGround) {
      // Fruit lying on the soil: axis vertical for oblate / round fruit (stalk on top), horizontal for oblong fruit.
      const horiz = normalize({ x: exit.dir.x + 1e-4, y: 0, z: exit.dir.z });
      dir0 = p.fruitShape === 'oblate' || p.fruitShape === 'round' ? normalize(add(scale(horiz, 0.08), scale(UP, -1))) : normalize({ x: horiz.x, y: -0.05, z: horiz.z });
    }
    const right0 = this.rightFor(exit, dir0);
    return {
      shape: p.fruitShape,
      L: Math.max(0.004, p.fruitLength * j * sizeJ),
      R: Math.max(0.002, p.fruitRadius * j * sizeJ),
      base,
      dir0,
      right0,
      ribs: Math.max(0, Math.round(p.fruitRibs)),
      ribDepth: clamp(p.fruitRibDepth, 0, 0.4),
      onGround,
    };
  }

  /** Radius profile of a fruit body along t ∈ [0, 1] (neck to blossom end), in units of R. */
  private fruitProfile(shape: FruitShape): (t: number) => number {
    switch (shape) {
      case 'oblate':
        return (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.42) * (1 - 0.05 * t);
      case 'oblong':
        return (t) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 3.2)), 0.5) * (0.82 + 0.18 * Math.sin(Math.PI * t));
      case 'pod':
        return (t) => (t < 0.08 ? lerp1(0.4, 1, t / 0.08) : t > 0.85 ? Math.max(0.15, 1 - ((t - 0.85) / 0.15) * 0.85) : 1 + 0.12 * Math.sin(TAU * 4 * t));
      case 'tapered':
        return (t) => (t < 0.12 ? Math.pow(Math.sin((Math.PI / 2) * (t / 0.12)), 0.6) : Math.max(0.08, Math.pow(1 - (t - 0.12) / 0.88, 0.8)));
      case 'ear':
        return (t) => (t < 0.1 ? lerp1(0.55, 1, smooth(t / 0.1)) : t > 0.7 ? Math.max(0.15, 1 - Math.pow((t - 0.7) / 0.3, 1.6) * 0.9) : 1);
      default:
        return (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.85)), 0.55);
    }
  }

  private makeFruit(exit: Exit, v: FruitSpec): Organ {
    const p = this.p;
    const { shape, L, R } = v;
    const N0 = exit.N; // 6 (pedicel window) — refined to 12 / 24
    const target = evenSides(p.fruitSides, 8, 32);
    const doublings = target >= 4 * N0 ? 2 : target >= 2 * N0 ? 1 : 0;
    const rNeck = Math.min(0.5 * R, 0.45 * exit.size);
    const sStart = Math.max(this.collarLen(rNeck, 1.2), 0.3 * exit.size);
    const total = sStart + L;
    const line = growLine(exit.pos, v.dir0, v.right0, total, 4, (t0, t1) => ({ gravity: v.onGround ? 0 : 0.15 * (t1 - t0) }));
    const prof = this.fruitProfile(shape);
    const refine: number[] = [];
    const neckLen = Math.min(0.2 * L, Math.max(2.5 * rNeck, 0.03 * L));
    for (let d = 0; d < doublings; d++) refine.push(sStart + (neckLen * (d + 1)) / (doublings + 1));
    const rad = (s: number): number => {
      const t = clamp((s - sStart) / L, 0, 1);
      const tn = clamp((s - sStart) / neckLen, 0, 1);
      const body = R * prof(t);
      return Math.max(0.35 * rNeck, lerp1(rNeck, Math.max(rNeck, body), smooth(tn)) * (tn >= 1 ? body / Math.max(rNeck, body) : 1));
    };
    const ribs = shape === 'oblate' || shape === 'oblong' || shape === 'tapered' ? v.ribs : 0;
    const ribDepth = v.ribDepth;
    const stations: number[] = [];
    const nBody = shape === 'pod' ? 10 : shape === 'ear' ? 12 : 14;
    for (let k = 1; k < nBody; k++) {
      const t = k / nBody;
      // Denser at both ends of round bodies.
      const u = 0.5 - 0.5 * Math.cos(Math.PI * t);
      stations.push(sStart + neckLen + (L - neckLen) * u);
    }
    // Ear kernels: rows of dimples via the profile's z offset are too fine; the ear stays smooth with a husk.
    const children: Attachment[] = [];
    const calyx = shape === 'round' || shape === 'oblong' || shape === 'tapered' ? Math.max(0, Math.round(p.calyx)) : 0;
    const Nbody = N0 * Math.pow(2, doublings);
    const cellBody = (TAU * R) / Nbody;
    if (calyx > 0 && p.calyxLength > 0) {
      const sCal = sStart + neckLen + 1.2 * cellBody;
      for (let k = 0; k < calyx; k++) {
        const col = Math.round((k * Nbody) / calyx);
        children.push({
          s: sCal,
          az: (col + 0.5) * (TAU / Nbody),
          w: 1,
          h: 1,
          hh: 0.5 * cellBody,
          fixed: true,
          optional: true,
          loopExit: true,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeSepal(ex, v.base, Math.max(0.002, p.calyxLength), line),
        });
      }
    }
    if (shape === 'ear') {
      // Husk leaves wrapped around the ear and a silk tuft at the tip.
      const husk = Math.max(0, Math.round(p.husk));
      for (let k = 0; k < husk; k++) {
        const col = Math.round((k * Nbody) / Math.max(1, husk));
        const sH = sStart + neckLen + 1.5 * cellBody;
        children.push({
          s: sH,
          az: (col + 0.5) * (TAU / Nbody),
          w: 2,
          h: 1,
          hh: 0.5 * cellBody,
          optional: true,
          loopExit: true,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeHusk(ex, v.base, L, R, line, sStart),
        });
      }
      if (p.silk > 0) {
        for (let k = 0; k < 6; k++) {
          children.push({
            s: sStart + L - 1.6 * cellBody * 0.5,
            az: (k * Nbody) / 6 * (TAU / Nbody) + 0.5 * (TAU / Nbody),
            w: 1,
            h: 1,
            hh: 0.25 * cellBody,
            optional: true,
            fixed: true,
            loopExit: true,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeSilk(ex, v.base, p.silk),
          });
        }
      }
    }
    this.count(shape === 'pod' ? 'pods' : shape === 'ear' ? 'ears' : 'fruits');
    const squash = v.onGround && (shape === 'oblate' || shape === 'round') ? 0.9 : 1;
    return {
      level: 3,
      line,
      sStart,
      profile: (s, j, NN) => {
        const rr = rad(s);
        const q = ribbedPoint(NN, j, rr, ribs, ribDepth * clamp((s - sStart - neckLen) / (0.15 * L), 0, 1), 1.6);
        // Blossom-end dimple / stem-end shoulder for oblate fruit.
        const t = clamp((s - sStart) / L, 0, 1);
        let z = 0;
        if (shape === 'oblate' && t > 0.9) z = -0.12 * R * ((t - 0.9) / 0.1);
        return { x: q.x * squash, y: q.y, z };
      },
      radius: rad,
      round: true,
      extra: stations,
      spacing: L,
      refine: refine.length ? refine : undefined,
      children,
      wind: () => this.still(v.base),
      pivot: v.base.pivot,
      r0: rNeck,
      minGap: Math.min(0.25 * cellBody, (0.45 * neckLen) / (doublings + 1)),
    };
  }

  private makeSepal(exit: Exit, base: WindBase, len: number, fruit: Line): Organ {
    const f = fruit.at(0);
    // Sepals lie back along the fruit's shoulder, pointing away from the stalk.
    const dir0 = normalize(add(scale(exit.normal, 0.5), scale(f.dir, 0.85)));
    let right0 = projectOnPlane(cross(f.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const W = 0.32 * len;
    const line = growLine(exit.pos, dir0, right0, len, 3, (t0, t1) => ({ pitch: -0.5 * (t1 - t0) }));
    const sStart = Math.min(0.3 * len, Math.max(this.collarLen(0.3 * W, 1.2), 0.4 * exit.size));
    const widthAt = (s: number): number => {
      const t = clamp(s / len, 0, 1);
      return Math.max(0.15 * W, Math.min(W, Math.max(0.9 * exit.size, 0.4 * W) + (W - Math.max(0.9 * exit.size, 0.4 * W)) * smooth(t / 0.3)) * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.3) / 0.7), 1.5)), 0.7));
    };
    this.count('sepals');
    return {
      level: 3,
      line,
      sStart,
      profile: (s, j, N) => cupPoint(N, j, widthAt(s), 0.12 * W, 1.2),
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: [],
      spacing: 0.3 * len,
      children: [],
      wind: () => this.still(base),
      pivot: base.pivot,
      r0: 0.3 * W,
      collarRings: 0,
    };
  }

  /** Husk leaf: a broad blade wrapped around the ear, following its axis and flaring at the tip. */
  private makeHusk(exit: Exit, base: WindBase, earL: number, earR: number, ear: Line, sEar0: number): Organ {
    const N = exit.N; // 6 → the husk is a 6-vertex cupped blade
    const len = earL * 1.15;
    const f = ear.at(sEar0);
    const dir0 = normalize(add(scale(f.dir, 1), scale(exit.normal, 0.35)));
    let right0 = projectOnPlane(cross(f.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const line = growLine(exit.pos, dir0, right0, len, 8, (t0, t1) => ({ pitch: -0.32 * (Math.pow(t1, 2) - Math.pow(t0, 2)) }));
    const W = 1.5 * earR;
    const wNeck = Math.max(0.9 * exit.size, 0.4 * W);
    const sStart = Math.min(0.2 * len, Math.max(this.collarLen(0.5 * wNeck, 1.2), 0.5 * exit.size));
    const widthAt = (s: number): number => {
      const t = clamp(s / len, 0, 1);
      const g = wNeck + (W - wNeck) * smooth(t / 0.25);
      const outline = W * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.55) / 0.45), 2)), 0.8);
      return Math.max(0.05 * W, Math.min(g, outline));
    };
    const spacing = Math.max(0.004, (2 * W) / N);
    this.count('husks');
    return {
      level: 2,
      line,
      sStart,
      profile: (s, j, NN) => cupPoint(NN, j, widthAt(s), 0.04 * W, 1.6 * (1 - 0.5 * clamp(s / len, 0, 1))),
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: [],
      spacing,
      children: [],
      wind: (s) => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0.2 * clamp(s / len, 0, 1) * this.flutter }),
      pivot: base.pivot,
      r0: 0.5 * wNeck,
    };
  }

  private makeSilk(exit: Exit, base: WindBase, len: number): Organ {
    const rs = Math.max(0.0004, 0.35 * exit.size);
    const dir0 = normalize(add(scale(exit.dir, 1), scale(exit.normal, 0.6)));
    const right0 = this.rightFor(exit, dir0);
    const line = growLine(exit.pos, dir0, right0, len, 4, (t0, t1) => ({ gravity: 1.2 * (t1 * t1 - t0 * t0) }));
    const sStart = Math.min(0.3 * len, this.collarLen(rs, 1.5));
    this.count('silks');
    return {
      level: 3,
      line,
      sStart,
      profile: (s, j, N) => round(rs * (1 - 0.5 * clamp(s / len, 0, 1)), j, N),
      radius: (s) => rs * (1 - 0.5 * clamp(s / len, 0, 1)),
      round: true,
      extra: [],
      spacing: 0.25 * len,
      children: [],
      wind: (s) => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0.6 * clamp(s / len, 0, 1) * this.flutter }),
      pivot: base.pivot,
      r0: rs,
      collarRings: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Vines: a buried pad with trailing stems, leaves on tall petioles, fruit on the soil
  // ---------------------------------------------------------------------------

  private buildVines(): void {
    const p = this.p;
    const r = Math.max(0.002, p.radius);
    const N = evenSides(p.stemSides, 8, 16);
    const { w, h } = squareWindow(N);
    const vines = Math.max(1, Math.round(p.vines));
    const R = Math.max(0.06, 3.2 * r * (vines + 1));
    const K = Math.max(3 * (Math.max(w, h) + 1) + 2, Math.ceil((2 * R) / ((r * 2.1) / Math.max(w, h))));
    const sink = 0.02 + 2 * r;
    const sp: PadSpec = { R, H: 0, sink, prof: 2, K, below: [{ depth: sink + 0.03 + 2 * r, scale: 0.85 }] };
    const wants: { u: number; v: number; w: number; h: number; make: (exit: Exit) => Organ; reach?: number }[] = [];
    const az0 = this.rng.next() * TAU;
    for (let k = 0; k < vines; k++) {
      const az = az0 + (TAU * k) / vines + 0.4 * this.rng.uniform();
      const rr = 0.45 * R;
      const L = Math.max(0.1, p.height * (1 + p.heightV * this.rng.uniform()));
      const phase = this.rng.next();
      wants.push({ u: 0.5 + (rr * Math.cos(az)) / (2 * R), v: 0.5 + (rr * Math.sin(az)) / (2 * R), w, h, reach: 6, make: (exit) => this.makeVine(exit, az, L, sink, r, N, phase) });
    }
    this.meshPad(sp, this.placePadWindows(K, wants));
  }

  private makeVine(exit: Exit, az: number, L: number, sink: number, r: number, N: number, phase: number): Organ {
    const p = this.p;
    const rng = this.rng;
    // Path: rise out of the soil, arch over and run along the ground, wandering.
    const pts: V3[] = [];
    const A = { x: Math.cos(az), z: Math.sin(az) };
    const wander = p.vineWander * DEG2RAD;
    let heading = az;
    let x = exit.pos.x;
    let z = exit.pos.z;
    pts.push({ x, y: exit.pos.y, z });
    pts.push({ x: x + 0.02 * A.x, y: 0.4 * r + 0.01, z: z + 0.02 * A.z });
    const segs = 9;
    const step = L / segs;
    for (let i = 1; i <= segs; i++) {
      heading += wander * rng.uniform() * 0.9;
      x += step * Math.cos(heading);
      z += step * Math.sin(heading);
      pts.push({ x, y: r * (1.05 + 0.25 * Math.sin(i * 1.7 + phase * 6)), z });
    }
    const line = lineThrough(pts, normalize(cross(UP, { x: A.x, y: 0, z: A.z })), 5);
    const Lt = line.length;
    const sStart = 0.35 * sink;
    const s0 = Math.min(Lt, sink + 0.03);
    const rad = (s: number): number => {
      const t = clamp((s - s0) / Math.max(1e-3, Lt - s0), 0, 1);
      return r * (1 - 0.5 * t) * (t > 0.96 ? Math.max(0.35, 1 - ((t - 0.96) / 0.04) * 0.6) : 1);
    };
    const spacing0 = Math.max(0.003, p.ringAspect * ((TAU * r) / N));
    const children: Attachment[] = [];
    const nLeaves = Math.max(0, Math.round(p.leaves));
    const nFruits = Math.max(0, Math.round(p.fruits + p.fruitsV * rng.uniform()));
    const petN = this.petioleSides(evenSides(p.leafSides, 6, 16));
    const lw = squareWindow(petN);
    const spacing = this.packSpacing(nLeaves + nFruits, lw.w, lw.h, N, 0.85 * (Lt - s0), spacing0);
    const colStep = TAU / N;
    // Vine frame: right ≈ horizontal, up ≈ world up; leaves leave from the upper columns, fruit from the sides.
    const topAz = (): number => {
      // Column whose radial best matches world up at mid vine.
      const f = line.at(0.5 * Lt);
      let best = 0;
      let bestDot = -2;
      for (let j = 0; j < N; j++) {
        const th = (j + 0.5) * colStep;
        const rd = add(scale(f.right, Math.cos(th)), scale(f.up, Math.sin(th)));
        if (rd.y > bestDot) {
          bestDot = rd.y;
          best = th;
        }
      }
      return best;
    };
    const up = topAz();
    for (let i = 0; i < nLeaves; i++) {
      const f = 0.1 + (0.85 * (i + 0.5 + 0.2 * rng.uniform())) / nLeaves;
      const s = s0 + (Lt - s0) * clamp(f, 0.03, 0.97);
      const lenJ = 1 + p.leafLengthV * this.leafRng.uniform();
      const side = i % 2 === 0 ? 1 : -1;
      children.push({
        s,
        az: up + side * 0.9 * colStep,
        w: lw.w,
        h: lw.h,
        hh: 0.5 * lw.h * spacing,
        priority: 1,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeLeafOrPetiole(ex, { limb: 0, phase: this.leafRng.next(), pivot: ex.pos }, lenJ, (90 - p.leafAngle) * DEG2RAD, 1),
      });
    }
    for (let i = 0; i < nFruits; i++) {
      const f = p.fruitFrom + ((p.fruitTo - p.fruitFrom) * (i + 0.5 + 0.3 * rng.uniform())) / Math.max(1, nFruits);
      const s = s0 + (Lt - s0) * clamp(f, 0.05, 0.95);
      const side = rng.next() < 0.5 ? 1 : -1;
      children.push({
        s,
        az: up + side * Math.PI * 0.5,
        w: lw.w,
        h: lw.h,
        hh: 0.5 * lw.h * spacing,
        priority: 2,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makePedicel(ex, { limb: 0, phase, pivot: ex.pos }, 1, true),
      });
    }
    this.count('vines');
    return {
      level: 0,
      line,
      sStart,
      profile: (s, j, NN) => round(rad(s), j, NN),
      radius: rad,
      round: true,
      extra: [],
      spacing,
      rowLattice: spacing,
      children,
      wind: () => ({ height: 0, limb: 0, phase, detail: 0 }),
      pivot: { x: 0, y: 0, z: 0 },
      r0: r,
    };
  }

  // ---------------------------------------------------------------------------
  // Rosettes: storage root + short stem + leaves (+ wrapped head)
  // ---------------------------------------------------------------------------

  private buildRosette(): void {
    const p = this.p;
    const r = Math.max(0.004, p.radius);
    const N = evenSides(p.stemSides, 8, 24);
    const H = Math.max(0.01, p.height);
    this.H = H;
    const hasRoot = p.rootLength > 0;
    const rootL = hasRoot ? Math.max(0.02, p.rootLength) : 0;
    const rootR = hasRoot ? Math.max(r, p.rootRadius) : r;
    const exposed = clamp(p.rootExposed, 0, 0.6);
    const depth = hasRoot ? rootL * (1 - exposed) + 0.005 : 0.03 + 2 * r;
    const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, hasRoot ? (p.rootShape === 'round' ? 0.35 * rootR : 0.12 * rootR) : r, N);
    const L = depth + H;
    const az = this.rng.next() * TAU;
    const lean = p.leanV * DEG2RAD * this.rng.uniform();
    const A = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    const dir0 = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
    const sGround = depth;
    const sStart = hasRoot ? 0.02 * depth : 0.35 * depth;
    // Radius: root body (below ground and shoulders) blending into the stem.
    const shoulder = sGround + exposed * rootL;
    const rad = (s: number): number => {
      if (!hasRoot) return r * (1 - 0.3 * clamp((s - sGround) / H, 0, 1));
      const t = clamp(s / rootL, 0, 1); // along the root from the tip
      let rr: number;
      if (p.rootShape === 'round') rr = rootR * Math.pow(Math.sin(Math.PI * Math.pow(0.05 + 0.9 * t, 0.9)), 0.5);
      else rr = rootR * Math.pow(t, 0.55);
      if (s > shoulder) {
        const u = clamp((s - shoulder) / Math.max(1e-3, 0.6 * (L - shoulder) + 0.02), 0, 1);
        rr = lerp1(Math.max(r, rr), r, smooth(u));
      }
      return Math.max(0.3 * r, rr);
    };
    const spacing0 = Math.max(0.003, p.ringAspect * ((TAU * r) / N));
    const leafN = evenSides(p.leafSides, 6, 16);
    const petN = this.petioleSides(leafN);
    const lw = p.petiole > 0 && this.petioleFits(p.petiole * p.leafLength, Math.max(0.0006, p.petioleRadius), leafN) ? squareWindow(petN) : this.leafWindow(leafN);
    const nOuter = Math.max(0, Math.round(p.rosetteLeaves));
    const nHead = Math.max(0, Math.round(p.headLeaves));
    const total = nOuter + nHead;
    const perRow = Math.max(1, Math.floor(N / (lw.w + 1)));
    const rowsNeeded = Math.ceil(total / perRow) * (lw.h + 1) + 3;
    const zoneStart = Math.max(sStart + (lw.h + 1) * spacing0, shoulder + spacing0);
    // The stem grows as tall as its leaves need (a cabbage stem is longer inside the head than it looks).
    const spacing = clamp((L - zoneStart) / rowsNeeded, 0.25 * spacing0, spacing0);
    const L2 = Math.max(L, zoneStart + rowsNeeded * spacing);
    const line = growLine(exit.pos, dir0, normalize(cross(UP, A)), L2, 10, () => ({}));
    const extra: number[] = hasRoot ? cosineStations(0, 0.5 * rootL, 5, false).concat(cosineStations(0.5 * rootL, shoulder, 4, true)) : [];
    const children: Attachment[] = [];
    const az0 = this.leafRng.next() * TAU;
    const sFrom = zoneStart;
    const sTo = L2 - (0.5 * lw.h + 1) * spacing;
    const headR = Math.max(0.01, p.headRadius);
    const headCentre = { x: 0, y: L2 - depth + headR * 0.7, z: 0 };
    for (let k = 0; k < total; k++) {
      const f = total > 1 ? k / (total - 1) : 1;
      const s = sFrom + (sTo - sFrom) * f;
      const azk = az0 + k * GOLDEN;
      const isHead = k >= nOuter;
      const lenJ = 1 + p.leafLengthV * this.leafRng.uniform();
      const spread = isHead ? 0 : lerp1(p.rosetteSpread, 0.35 * p.rosetteSpread, smooth(k / Math.max(1, nOuter - 1))) * DEG2RAD;
      const wrapT = isHead ? (k - nOuter) / Math.max(1, nHead - 1) : 0;
      children.push({
        s,
        az: azk,
        w: lw.w,
        h: lw.h,
        hh: 0.5 * lw.h * spacing,
        priority: isHead ? 1 : 2,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) =>
          isHead
            ? this.makeHeadLeaf(ex, { limb: 0, phase: this.leafRng.next(), pivot: ex.pos }, headCentre, headR * (1 - 0.4 * wrapT), lenJ)
            : this.makeLeafOrPetiole(ex, { limb: 0, phase: this.leafRng.next(), pivot: ex.pos }, lenJ, spread, 1),
      });
    }
    this.count(hasRoot ? 'root' : 'stem');
    const organ: Organ = {
      level: 0,
      line,
      sStart,
      profile: (s, j, NN) => round(rad(s), j, NN),
      radius: rad,
      round: true,
      extra,
      spacing,
      rowLattice: spacing,
      children,
      wind: () => ({ height: 0, limb: 0, phase: 0, detail: 0 }),
      pivot: { x: 0, y: 0, z: 0 },
      r0: r,
    };
    this.meshTube(organ, loop, exit, 1);
  }

  /**
   * Head leaf: a broad, round-tipped blade whose midrib follows a great circle
   * of the head sphere from the stem up the side and over the top, cupped
   * across so its whole width hugs the sphere. Successive leaves wrap nested
   * spheres (`R` shrinks towards the core), so the head reads as a ball.
   */
  private makeHeadLeaf(exit: Exit, base: WindBase, centre: V3, R: number, lenJ: number): Organ {
    const p = this.p;
    const wrap = clamp(p.headWrap, 0, 1);
    const rel0 = sub(exit.pos, centre);
    const horiz = normalize({ x: rel0.x + 1e-5, y: 0, z: rel0.z });
    const pts: V3[] = [];
    const nPts = 10;
    // Elevation of the exit on the sphere and of the tip: a tight head crosses the pole, a loose one stops short of it.
    const startAng = Math.atan2(rel0.y, Math.sqrt(rel0.x * rel0.x + rel0.z * rel0.z));
    const endAng = Math.PI / 2 + lerp1(-0.6, 0.55, wrap);
    const arc = Math.max(0.6, endAng - startAng);
    // Leave the stem outwards before joining the sphere: the first fifth blends from the exit to the great circle.
    for (let i = 0; i <= nPts; i++) {
      const t = i / nPts;
      const ang = startAng + arc * t;
      const onSphere = add(centre, { x: horiz.x * R * Math.cos(ang), y: R * Math.sin(ang), z: horiz.z * R * Math.cos(ang) });
      const blend = smooth(Math.min(1, t / 0.22));
      const out = addScaled(exit.pos, exit.normal, 0.4 * R * t);
      pts.push(i === 0 ? exit.pos : lerp(out, onSphere, blend));
    }
    const line = lineThrough(pts, normalize(cross(UP, horiz)), 3);
    const L = line.length;
    // Developed width: a fraction of the sphere's circumference so several leaves close the ball.
    const W = Math.max(0.01, Math.min(p.leafWidth * p.leafLength * lenJ * (0.9 + 0.4 * wrap), 0.55 * TAU * R));
    const N = evenSides(p.leafSides, 8, 16);
    const wNeck = Math.min(W, Math.max(0.9 * exit.size, 0.25 * W));
    const sStart = Math.min(0.2 * L, Math.max(this.collarLen(0.5 * wNeck, 1.2), 0.6 * exit.size));
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      const g = wNeck + (W - wNeck) * smooth(t / 0.3);
      // Broad with a rounded end (elliptical tip over the last 40 %).
      const outline = W * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.6) / 0.4), 2.2)));
      return Math.max(0.05 * W, Math.min(g, outline));
    };
    const thk = clamp(p.leafThickness, 0.01, 0.5);
    const spacing = Math.max(0.003, (p.ringAspect * 2 * W) / N);
    // Cup angle = developed width over the sphere radius, so the cross-section is an arc of the head sphere.
    const cupOf = (s: number): number => clamp(widthAt(s) / R, 0.2, 3.2) * lerp1(0.55, 1, wrap) * smooth(clamp(s / L, 0, 1) / 0.25);
    this.count('head leaves');
    return {
      level: 2,
      line,
      sStart,
      profile: (s, j, NN) => cupPoint(NN, j, widthAt(s), W * thk, cupOf(s)),
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: cosineStations(0.7 * L, L, 4, true),
      spacing,
      rowLattice: spacing,
      children: [],
      wind: () => this.still(base),
      pivot: base.pivot,
      r0: 0.5 * wNeck,
    };
  }

  // ---------------------------------------------------------------------------
  // Stalk (maize): culm with nodes, strap leaves, ears, tassel
  // ---------------------------------------------------------------------------

  private buildStalk(): void {
    const p = this.p;
    const r = Math.max(0.003, p.radius);
    const N = evenSides(p.stemSides, 8, 24);
    const H = Math.max(0.2, p.height * (1 + p.heightV * this.rng.uniform()));
    this.H = H;
    const depth = 0.04 + 2 * r;
    const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, r * 1.1, N);
    const az = this.rng.next() * TAU;
    const lean = (p.lean + p.leanV * this.rng.uniform()) * DEG2RAD;
    const A = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    const dir0 = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
    const curve = p.curve * DEG2RAD;
    const L = depth + H;
    const line = growLine(exit.pos, dir0, normalize(cross(UP, A)), L, 16, (t0, t1) => ({ pitch: curve * (t1 * t1 - t0 * t0) }));
    const sStart = 0.35 * depth;
    const nodes = Math.max(1, Math.round(p.nodes));
    const nodeS: number[] = [];
    for (let k = 0; k < nodes; k++) nodeS.push(depth + H * Math.pow((k + 1) / (nodes + 1), 1.15) * 0.92);
    const rad = (s: number): number => {
      const t = clamp((s - depth) / H, 0, 1);
      let rr = r * (1 - 0.45 * t);
      for (const ns of nodeS) {
        const d = (s - ns) / (0.6 * r);
        rr *= 1 + 0.12 * Math.exp(-d * d);
      }
      return rr;
    };
    const spacing0 = Math.max(0.003, p.ringAspect * ((TAU * r) / N));
    const leafN = evenSides(p.leafSides, 6, 12);
    const lw = this.leafWindow(leafN);
    const nLeaves = Math.max(0, Math.round(p.leaves));
    const nEars = Math.max(0, Math.round(p.fruits + p.fruitsV * this.rng.uniform()));
    const pw = squareWindow(6);
    const spacing = this.packSpacing(nLeaves + nEars + 1, Math.max(lw.w, pw.w), Math.max(lw.h, pw.h), N, 0.8 * H, spacing0);
    const children: Attachment[] = [];
    const az0 = this.rng.next() * TAU;
    const phase = this.rng.next();
    const pivot = { x: 0, y: 0, z: 0 };
    // Leaves: one per node, alternate (distichous) ± a little.
    for (let i = 0; i < nLeaves; i++) {
      const ns = nodeS[Math.min(nodes - 1, Math.floor((i * nodes) / Math.max(1, nLeaves)))];
      const s = ns + (2 + lw.h) * spacing * 0.6;
      const azk = az0 + Math.PI * i + 0.25 * this.leafRng.uniform();
      const lenJ = (1 + p.leafLengthV * this.leafRng.uniform()) * (i < 2 ? 0.7 : i > nLeaves - 3 ? 0.75 : 1);
      children.push({
        s,
        az: azk,
        w: lw.w,
        h: lw.h,
        hh: 0.5 * lw.h * spacing,
        priority: 1,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeBlade(ex, { limb: 0, phase: this.leafRng.next(), pivot: ex.pos }, Math.max(0.05, p.leafLength * lenJ), p.leafAngle * DEG2RAD, 2, 0),
      });
    }
    // Ears in the axils around mid height.
    for (let i = 0; i < nEars; i++) {
      const f = p.fruitFrom + ((p.fruitTo - p.fruitFrom) * (i + 0.5)) / Math.max(1, nEars);
      const s = depth + H * clamp(f, 0.1, 0.9);
      const azk = az0 + Math.PI * (i + 0.5) + 0.6 * this.rng.uniform();
      children.push({
        s,
        az: azk,
        w: pw.w,
        h: pw.h,
        hh: 0.5 * pw.h * spacing,
        priority: 3,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeEarStalk(ex, { limb: 0, phase, pivot: ex.pos }),
      });
    }
    // Tassel: the culm continues as a thin rachis with branchlets.
    const tassel = p.tassel > 0 && p.tasselLength > 0;
    const Ltot = tassel ? L + Math.max(0.05, p.tasselLength) : L;
    const lineT = tassel ? growLine(exit.pos, dir0, normalize(cross(UP, A)), Ltot, 20, (t0, t1) => ({ pitch: curve * (t1 * t1 - t0 * t0) })) : line;
    const radT = (s: number): number => (s <= L ? rad(s) : rad(L) * lerp1(0.55, 0.25, clamp((s - L) / (Ltot - L), 0, 1)));
    if (tassel) {
      const nb = Math.max(0, Math.round(p.tasselBranches));
      const cell = spacing;
      for (let i = 0; i < nb; i++) {
        const f = 0.15 + (0.6 * i) / Math.max(1, nb);
        const s = L + (Ltot - L) * f;
        const azk = az0 + i * GOLDEN;
        children.push({
          s,
          az: azk,
          w: 1,
          h: 1,
          hh: 0.5 * cell,
          optional: true,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeTasselBranch(ex, { limb: this.flexMax * 0.6, phase, pivot }, (Ltot - L) * (0.55 - 0.3 * f)),
        });
      }
    }
    this.count('stalk');
    const organ: Organ = {
      level: 0,
      line: lineT,
      sStart,
      profile: (s, j, NN) => round(radT(s), j, NN),
      radius: radT,
      round: true,
      extra: tassel ? [L] : [],
      spacing,
      rowLattice: spacing,
      children,
      wind: (s) => ({ height: 0, limb: s > L ? this.flexMax * 0.6 * clamp((s - L) / (Ltot - L), 0, 1) : 0, phase, detail: s > L ? 0.3 : 0 }),
      pivot,
      r0: r,
    };
    this.meshTube(organ, loop, exit, 1);
  }

  /** Short shank leaving the culm upwards, carrying a husked ear. */
  private makeEarStalk(exit: Exit, base: WindBase): Organ {
    const p = this.p;
    const rp = Math.max(0.002, p.pedicelRadius);
    const N = exit.N;
    const cell = (TAU * rp) / N;
    const L = Math.max(0.02, p.pedicel + 0.05);
    const angle = -p.fruitDroop * DEG2RAD; // negative droop = pointing up along the culm
    const dir0 = this.outDir(exit, clamp(Math.PI / 2 - angle, 0.15, 1.3));
    const right0 = this.rightFor(exit, dir0);
    const line = growLine(exit.pos, dir0, right0, L, 4, (t0, t1) => ({ gravity: -0.2 * (t1 - t0) }));
    const sStart = Math.min(0.3 * L, Math.max(this.collarLen(rp, 1.5), 0.5 * exit.size));
    const fw = squareWindow(N);
    const children: Attachment[] = [
      {
        s: L - (0.5 * fw.h + 1.2) * cell,
        az: Math.PI / 2,
        w: fw.w,
        h: fw.h,
        hh: 0.5 * fw.h * cell,
        loopExit: true,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeFruit(ex, this.fruitSpec(ex, base, false, 1, true)),
      },
    ];
    this.count('shanks');
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => round(rp, j, NN),
      radius: () => rp,
      round: true,
      extra: [],
      spacing: cell,
      rowLattice: cell,
      children,
      wind: () => this.still(base),
      pivot: base.pivot,
      r0: rp,
    };
  }

  private makeTasselBranch(exit: Exit, base: WindBase, len: number): Organ {
    const rs = Math.max(0.0006, 0.3 * exit.size);
    const dir0 = this.outDir(exit, 40 * DEG2RAD);
    const right0 = this.rightFor(exit, dir0);
    const L = Math.max(0.02, len);
    const line = growLine(exit.pos, dir0, right0, L, 5, (t0, t1) => ({ gravity: 0.9 * (t1 * t1 - t0 * t0) }));
    const sStart = Math.min(0.2 * L, Math.max(this.collarLen(rs, 1.5), 0.4 * exit.size));
    this.count('tassel branches');
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, N) => round(rs * (1 - 0.5 * clamp(s / L, 0, 1)), j, N),
      radius: (s) => rs * (1 - 0.5 * clamp(s / L, 0, 1)),
      round: true,
      extra: [],
      spacing: 0.2 * L,
      children: [],
      wind: (s) => ({ height: 0, limb: clamp(base.limb + 0.3 * (s / L), 0, 1), phase: base.phase, detail: 0.5 * this.flutter }),
      pivot: base.pivot,
      r0: rs,
      collarRings: 0,
    };
  }
}

