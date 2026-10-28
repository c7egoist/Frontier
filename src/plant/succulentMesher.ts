/**
 * Cactus and succulent mesher.
 *
 * One closed quad manifold per plant, built with the organ mesher: a buried
 * base ring is the topological root; the trunk column (or barrel, first pad,
 * rosette stem) grows from it and every arm, pad, leaf, flower stalk, fruit,
 * areole, spine and marginal tooth leaves its parent through a window welded
 * with collar loops. A terminal flower stalk continues the rosette stem from
 * its tip ring instead of a cap; its branches, bracts, flowers and buds leave
 * it through windows in turn, and every axis ends in a terminal flower or bud.
 * Fruit bodies, areoles, pads and flowering branches that are much wider than
 * their necks double their ring resolution through all-quad refinement bands.
 *
 * Organ levels (Levels view / GLB TEXCOORD_1):
 *   0 body (trunk, barrel, first pad, rosette stem) · 1 arms, pads, flower
 *   stalks and their branches · 2 leaves, fruits, bracts, flowers, buds ·
 *   3 areoles, spines, teeth.
 */

import { VertexWind } from '../tree/mesh';
import { Random } from '../core/random';
import { V3, UP, TAU, DEG2RAD, add, cross, normalize, scale, clamp, rotateAxis, projectOnPlane, lengthSq, anyPerpendicular, lerp1 } from '../core/math';
import { growLine, Line } from './line';
import { OrganMesher, OrganStats, OrganBuildResult, Exit, Organ, Attachment, PadSpec, evenSides, squareWindow, ribbedPoint, crestColumn, stadiumPoint, cupPoint, smooth, cosineStations } from './organMesher';
import { SucculentParams, succulentHeight } from './succulentParams';

export type SucculentStats = OrganStats;

export interface SucculentBuildResult extends OrganBuildResult {
  stats: SucculentStats;
}

type FlowerShape = 'tube' | 'funnel' | 'bell' | 'bud';

const GOLDEN = 2.399963229728653; // 137.5°

/** Wind state inherited from the parent at the attachment: keeps the deformation continuous across the weld. */
interface WindBase {
  limb: number;
  phase: number;
  pivot: V3;
}

interface ColumnSpec {
  level: number;
  /** Total centreline length from the exit. */
  L: number;
  /** Arc length of the ground (trunk only; 0 for arms). */
  sGround: number;
  r: number;
  N: number;
  ribs: number;
  dir0: V3;
  right0: V3;
  base: WindBase;
  /** Parent's rib count / vertex count, for arms of arms. */
  parentN: number;
}

interface PadSpecV {
  level: number;
  L: number;
  W: number;
  T: number;
  dir0: V3;
  right0: V3;
  base: WindBase;
  children: number;
  /** Depth of the neck below the ground (first pad only). */
  sGround: number;
}

interface LeafSpec {
  spread: number;
  L: number;
  W: number;
  base: WindBase;
  twistSign: number;
  level: number;
}

const STILL_DETAIL = 0;

export class SucculentMesher extends OrganMesher {
  private readonly p: SucculentParams;
  private readonly rng: Random;
  private readonly detailRng: Random;
  private readonly leafRng: Random;
  /** Trunk height above the ground (metres). */
  private H = 1;
  private flexMax = 0.25;

  constructor(p: SucculentParams, seed: number) {
    super();
    this.p = p;
    this.collarRingsDefault = Math.max(0, Math.round(p.collarRings));
    this.rng = new Random((seed ^ 0x5acc0de5) >>> 0);
    this.detailRng = this.rng.fork();
    this.leafRng = this.rng.fork();
  }

  build(): SucculentBuildResult {
    const p = this.p;
    this.plantH = Math.max(0.05, succulentHeight(p));
    this.flutter = clamp(this.plantH / 1.5, 0.15, 1);
    this.flexMax = clamp(p.flex, 0, 1);
    switch (p.form) {
      case 'pad':
        this.buildPads();
        break;
      case 'rosette':
        this.buildRosette();
        break;
      default:
        this.buildColumn();
    }
    const r = this.finish(clamp(p.sway, 0, 1));
    return { ...r, stats: this.stats };
  }

  // ---------------------------------------------------------------------------
  // Columns and barrels
  // ---------------------------------------------------------------------------

  private bodySides(ribs: number, sides: number): number {
    if (ribs > 0) {
      const per = clamp(Math.round(sides), 2, 4);
      let N = ribs * per;
      if (N % 2) N = ribs * (per === 3 ? 2 : per + 1 > 4 ? 2 : per + 1);
      return N;
    }
    return evenSides(sides, 8, 96);
  }

  private buildColumn(): void {
    const p = this.p;
    const r = Math.max(0.01, p.radius);
    const ribs = Math.max(0, Math.round(p.ribs));
    const N = this.bodySides(ribs, p.sides);
    const stems = Math.max(1, Math.round(p.stems + p.stemsV * this.rng.uniform()));
    const bt = clamp(p.baseTaper, 0.3, 1.5);
    const rBase = r * bt * (1 - 0.5 * clamp(p.ribDepth, 0, 0.6));
    const stemSpec = (exit: Exit, H: number, depth: number, phase: number): Organ => {
      const az = this.rng.next() * TAU;
      const lean = (p.lean + p.leanV * this.rng.uniform()) * DEG2RAD;
      const A = { x: Math.cos(az), y: 0, z: Math.sin(az) };
      const dir0 = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
      const right0 = normalize(cross(UP, A));
      return this.makeColumn(exit, { level: 0, L: depth + H, sGround: depth, r, N, ribs, dir0, right0, base: { limb: 0, phase, pivot: { x: 0, y: 0, z: 0 } }, parentN: N });
    };
    if (stems === 1) {
      const H = Math.max(0.05, p.height * (1 + p.heightV * this.rng.uniform()));
      this.H = H;
      const depth = Math.max(0.03, 0.25 * r);
      const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, rBase, N);
      this.meshTube(stemSpec(exit, H, depth, this.rng.next()), loop, exit, 1);
      return;
    }
    // Clump: the stems rise from a buried pad (a flat grid dome below the soil) through square windows.
    this.H = Math.max(0.05, p.height);
    const { w, h } = squareWindow(N);
    const R = Math.max(p.clumpRadius, 1.6 * r * Math.sqrt(stems));
    const pitch = Math.max(w, h) + 1;
    // Cells sized so a window spans the stem's base ring.
    const K = Math.max(pitch * 3 + 2, Math.ceil((2 * R) / ((rBase * 1.9) / Math.max(w, h))));
    const sink = 0.06 + 0.6 * rBase;
    const sp: PadSpec = { R, H: 0, sink, prof: 2, K, below: [{ depth: sink + Math.max(0.03, 0.3 * r), scale: 0.85 }] };
    // Stem sites: golden-angle spiral, packed from the centre.
    const wants: { u: number; v: number; w: number; h: number; make: (exit: Exit) => Organ; reach?: number }[] = [];
    const az0 = this.rng.next() * TAU;
    const rMax = Math.max(0, R - 1.3 * r);
    for (let k = 0; k < stems; k++) {
      const rr = rMax * Math.sqrt((k + 0.5) / stems);
      const az = az0 + k * GOLDEN;
      const H = Math.max(0.05, p.height * (1 + p.heightV * this.rng.uniform()) * (1 - 0.35 * (rr / Math.max(1e-6, rMax)) * this.rng.next()));
      const phase = this.rng.next();
      wants.push({ u: 0.5 + (rr * Math.cos(az)) / (2 * R), v: 0.5 + (rr * Math.sin(az)) / (2 * R), w, h, reach: 6, make: (exit) => stemSpec(exit, H, sink, phase) });
    }
    this.meshPad(sp, this.placePadWindows(K, wants));
  }

  private makeColumn(exit: Exit, c: ColumnSpec): Organ {
    const p = this.p;
    const { level, r, N, ribs } = c;
    const isTrunk = level === 0;
    const barrel = isTrunk && p.body === 'barrel';
    const rng = this.rng;

    // ---- Arms carried by this organ, drawn first: an arm that forks must be long enough for its
    // children's windows (the stubby forks of tree aloes ask for 0.7-radius children on a branch
    // three radii long), so its length is raised to what the windows need.
    let L = c.L;
    const armLevels = Math.max(0, Math.round(p.armLevels));
    const tufted = p.armTuft > 0 && p.leaves > 0 && level >= 1 && (level >= armLevels || p.armChildren <= 0);
    let nArms = 0;
    if (level < armLevels && !tufted) {
      nArms = level === 0 ? Math.max(0, Math.round(p.arms + p.armsV * rng.uniform())) : Math.max(0, Math.round(p.armChildren + (p.armChildren > 1 ? 0.99 * rng.uniform() : 0)));
      if (nArms > 0 && !isTrunk) {
        const ratio = clamp(p.armRadius2, 0.15, 1.2);
        const armRibs = ribs === 0 && p.armRibs === 0 ? 0 : p.armRibs > 0 ? Math.max(3, Math.round(p.armRibs)) : Math.max(4, Math.round(ribs * ratio));
        const { w, h } = squareWindow(this.childSides(N, ratio, armRibs, p.ribs > 0 ? p.sides : 0));
        const spacing0 = Math.max(0.002, p.ringAspect * ((TAU * r) / N));
        const perRow = Math.max(1, Math.floor(N / (w + 1)));
        const rows = Math.ceil(nArms / perRow);
        const collar = Math.max(this.collarLen(r, 1.6), 0.55 * exit.size);
        L = Math.max(L, collar + (rows * (h + 1) + h + 1.5) * spacing0 + Math.max(0.02, p.domeHeight * r));
      }
    }

    // ---- Centreline.
    const steps = isTrunk ? 16 : 14;
    const curve = (isTrunk ? p.curve : p.curve * 0.5) * DEG2RAD * (1 + 0.5 * rng.uniform());
    const rise = isTrunk ? 0 : p.armRise * DEG2RAD;
    const riseLen = clamp(p.armRiseLength, 0.05, 1);
    const droop = isTrunk ? 0 : p.armDroop * DEG2RAD;
    const wob = rng.next() * TAU;
    const line = growLine(exit.pos, c.dir0, c.right0, L, steps, (t0, t1) => ({
      pitch: curve * (t1 - t0),
      gravity: -rise * (smooth(t1 / riseLen) - smooth(t0 / riseLen)) + droop * (Math.pow(Math.max(0, t1 - 0.45), 2) - Math.pow(Math.max(0, t0 - 0.45), 2)) * 3.3,
      yaw: isTrunk ? 0 : 6 * DEG2RAD * (Math.sin(TAU * (0.8 * t1) + wob) - Math.sin(TAU * (0.8 * t0) + wob)),
    }));

    // ---- Radius profile.
    const sStart = isTrunk ? 0.35 * c.sGround : Math.min(0.3 * L, Math.max(this.collarLen(r, 1.6), 0.55 * exit.size));
    const s0 = isTrunk ? c.sGround : 0;
    const span = Math.max(1e-3, L - s0);
    const domeLen = Math.min(0.6 * span, Math.max(0.02, p.domeHeight * r));
    const belly = clamp(p.bellyPos, 0.15, 0.85);
    const bt = clamp(p.baseTaper, 0.3, 1.5);
    const con = isTrunk ? 0 : clamp(p.constriction, 0, 0.6);
    const conL = Math.max(0.03, p.constrictionLength);
    const rad = (s: number): number => {
      const t = clamp((s - s0) / span, -1, 1);
      let rr: number;
      if (barrel) {
        if (t < belly) rr = r * (bt + (1 - bt) * Math.sin((Math.PI / 2) * clamp(t / belly, 0, 1)));
        else {
          const u = (t - belly) / (1 - belly);
          rr = r * Math.max(0.035, Math.pow(Math.max(0, 1 - u * u), 0.45));
        }
      } else {
        const base = isTrunk ? bt : 0.86;
        rr = r * (base + (1 - base) * smooth(t / 0.15));
        const td = (s - (L - domeLen)) / domeLen;
        if (td > 0) rr *= Math.max(0.035, Math.sqrt(Math.max(0, 1 - td * td)));
      }
      if (con > 0) {
        const u = (s - sStart) / conL - Math.floor((s - sStart) / conL);
        const d = (u - 0.5) / 0.13;
        rr *= 1 - con * Math.exp(-d * d);
      }
      return rr;
    };
    const ribDepth = clamp(p.ribDepth, 0, 0.6);
    const ribSharp = clamp(p.ribSharp, 0.4, 4);
    const depthAt = (s: number): number => {
      if (!ribs) return 0;
      const td = barrel ? (clamp((s - s0) / span, 0, 1) - belly) / (1 - belly) : (s - (L - domeLen)) / domeLen;
      return ribDepth * (1 - 0.75 * smooth(td));
    };

    // ---- Stations.
    let spacing = Math.max(0.002, p.ringAspect * ((TAU * r) / N));
    if (tufted) {
      // Ring spacing that fits the tuft's leaf windows in the top half of the branch (down to 15 % of the natural spacing).
      const leafN = evenSides(p.leafSides, 6, 16);
      const { w, h } = this.leafWindow(leafN);
      spacing = this.packSpacing(Math.round(p.leaves) + 2, w, h, N, Math.max(0.05, 0.5 * (L - sStart) - domeLen), spacing);
    }
    const extra: number[] = [];
    if (barrel) {
      extra.push(...cosineStations(s0 + belly * span, L, 9, true));
      extra.push(...cosineStations(sStart, s0 + belly * span, 4, false));
    } else {
      extra.push(...cosineStations(L - domeLen, L, 6, true));
    }
    if (con > 0) {
      for (let s = sStart + 0.5 * conL; s < L - 0.5 * conL; s += conL) extra.push(s - 0.2 * conL, s - 0.08 * conL, s, s + 0.08 * conL, s + 0.2 * conL);
    }

    // ---- Wind.
    const flexHere = clamp(this.flexMax * (1 + 0.35 * Math.max(0, level - 1)), 0, 1);
    const wind = (s: number, y: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return isTrunk ? { height: 0, limb: 0, phase: c.base.phase, detail: STILL_DETAIL } : { height: 0, limb: lerp1(c.base.limb, Math.max(c.base.limb, flexHere), Math.pow(t, 1.3)), phase: c.base.phase, detail: STILL_DETAIL };
    };
    const limbAt = (s: number): number => wind(s, 0).limb;
    const pivot = isTrunk ? c.base.pivot : level === 1 ? exit.pos : c.base.pivot;

    // ---- Children.
    const children: Attachment[] = [];
    if (nArms > 0) {
      const from = level === 0 ? p.armFrom : p.armFrom2;
      const to = level === 0 ? p.armTo : p.armTo2;
      const az0 = rng.next() * TAU;
      const spanRange = level === 0 ? this.H : L;
      const base0 = level === 0 ? c.sGround : 0;
      const ratio = clamp(level === 0 ? p.armRadius : p.armRadius2, 0.15, 1.2);
      const armRibs = ribs === 0 && p.armRibs === 0 ? 0 : p.armRibs > 0 ? Math.max(3, Math.round(p.armRibs)) : Math.max(4, Math.round(ribs * ratio));
      const Nc = this.childSides(N, ratio, armRibs, p.ribs > 0 ? p.sides : 0);
      const { w, h } = squareWindow(Nc);
      // The windows must sit below the dome and its cosine stations: forks asked for at the very tip
      // (dichotomous quiver trees, `armTo2` → 1) come down to the highest station that fits.
      const sTop = L - domeLen - (0.5 * h + 1) * spacing;
      const sLo = Math.min(base0 + spanRange * from, sTop);
      const sHi = Math.min(base0 + spanRange * to, sTop);
      // Arms spread along a trunk go round it in golden-angle steps; a few arms asked for within one
      // window height of each other are a fork: they share the height and are spaced evenly round it.
      const fork = sHi - sLo < (h + 1) * spacing && nArms * (w + 1) <= N;
      for (let k = 0; k < nArms; k++) {
        const f = (k + rng.next()) / nArms;
        const az = fork ? az0 + (k * TAU) / nArms + 0.4 * (TAU / N) * rng.uniform() : az0 + k * GOLDEN + 0.35 * rng.uniform();
        const s = sLo + (sHi - sLo) * f;
        const lenJ = 1 + p.armLengthV * rng.uniform();
        const armAngle = p.armAngle * DEG2RAD * (1 + 0.12 * rng.uniform());
        const phase = rng.next();
        children.push({
          s,
          az,
          w,
          h,
          hh: 0.5 * h * spacing,
          priority: 2,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => {
            const dir0 = normalize(add(scale(ex.dir, Math.cos(armAngle)), scale(ex.normal, Math.sin(armAngle))));
            const right0 = normalize(cross(ex.normal, ex.dir));
            const parentR = rad(s);
            const La = Math.max(0.03, p.armLength * lenJ * (level === 0 ? this.H : L));
            return this.makeColumn(ex, {
              level: level + 1,
              L: La,
              sGround: 0,
              r: Math.max(0.004, ratio * parentR),
              N: Nc,
              ribs: armRibs,
              dir0,
              right0,
              base: { limb: limbAt(s), phase: level === 0 ? phase : c.base.phase, pivot: level === 0 ? ex.pos : pivot },
              parentN: N,
            });
          },
        });
      }
    }

    // Leaf tufts at the tips of the terminal arms (tree aloes).
    if (tufted) this.addTuft(children, { L, sStart, spacing, domeLen, N, limbAt, pivot, phase: c.base.phase, rad });

    // Areoles along the rib crests.
    if (ribs > 0 && p.areoleSpacing > 0) {
      const rowsPer = Math.max(2, Math.round(p.areoleSpacing / spacing));
      const spA = rowsPer * spacing;
      const tipGap = clamp(p.areoleTipGap, 0, 0.5) * span;
      const sA0 = Math.max(sStart + 1.5 * spacing, s0 + 0.35 * spA);
      const sA1 = L - tipGap - 0.5 * spacing;
      const colStep = TAU / N;
      for (let m = 0; m < ribs; m++) {
        const col = crestColumn(N, ribs, m);
        const az = (col + 0.5) * colStep;
        const off = this.detailRng.int(rowsPer) * spacing;
        for (let s = sA0 + off; s < sA1; s += spA) {
          const sk = s;
          children.push({
            s: sk,
            az,
            w: 1,
            h: 1,
            hh: 0.5 * spacing,
            fixed: true,
            optional: true,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeAreole(ex, { limb: limbAt(sk), phase: c.base.phase, pivot }, 1),
          });
        }
      }
    }

    this.count(isTrunk ? (barrel ? 'barrel' : 'trunk') : 'arms');
    return {
      level: Math.min(3, level),
      line,
      sStart,
      profile: (s, j, NN) => ribbedPoint(NN, j, rad(s), ribs, depthAt(s), ribSharp),
      radius: rad,
      round: true,
      extra,
      spacing,
      rowLattice: spacing,
      children,
      wind,
      pivot,
      r0: r,
    };
  }

  /** Ring vertex count of an arm: ribbed arms keep whole ribs, smooth arms follow the radius ratio with a floor for the tufts. */
  private childSides(parentN: number, ratio: number, ribs: number, sidesPerRib: number): number {
    if (ribs > 0) {
      const ideal = (parentN * ratio) / ribs;
      let best = 2;
      let bestErr = Infinity;
      for (const per of [2, 3, 4]) {
        if ((ribs * per) % 2) continue;
        if (sidesPerRib > 0 && per > sidesPerRib) continue;
        const err = Math.abs(per - ideal);
        if (err < bestErr) {
          bestErr = err;
          best = per;
        }
      }
      return ribs * best;
    }
    const floor = Math.min(parentN, 24);
    return evenSides(Math.round(parentN * ratio), floor, parentN);
  }

  // ---------------------------------------------------------------------------
  // Areoles and spines
  // ---------------------------------------------------------------------------

  private makeAreole(exit: Exit, base: WindBase, sizeScale: number): Organ {
    const p = this.p;
    const rc = Math.max(0.0008, p.areoleRadius * sizeScale);
    const rs = Math.max(0.0002, p.spineRadius);
    const spines = p.spineLength > 0 ? (Math.round(p.spines) >= 3 ? 4 : Math.round(p.spines) >= 1 ? 2 : 0) : 0;
    const fine = spines === 4;
    // Cushion cells are square once the ring has its final vertex count (8 or 4).
    const cell = fine ? 0.785 * rc : 1.11 * rc;
    const central = p.centralSpine > 0 && p.spineLength > 0;
    const sStart = Math.max(this.collarLen(rc, 1.4), 0.3 * exit.size);
    const sR = sStart + cell; // 4 → 8 refinement band (fine areoles)
    const s2 = fine ? sR + cell : sStart + cell;
    const s3 = s2 + cell; // spine row between s2 and s3
    const sC = s3 + 0.5 * cell; // shoulder
    const spineLen = Math.max(0.001, p.spineLength * (1 + p.spineLengthV * this.detailRng.uniform()));
    const s5 = central ? sC + 0.6 * cell : sC + 0.35 * cell;
    const L = central ? s5 + spineLen : s5;
    const hook = p.spineHook * DEG2RAD;
    const tilt = p.areoleTilt * DEG2RAD;
    const dir0 = normalize(add(scale(exit.normal, Math.cos(tilt)), scale(exit.dir, Math.sin(tilt))));
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const t5 = s5 / L;
    const line = growLine(exit.pos, dir0, right0, L, central && hook !== 0 ? 8 : 2, (t0, t1) => {
      if (!central || hook === 0) return {};
      const P = (t: number): number => Math.pow(clamp((t - t5) / Math.max(1e-6, 1 - t5), 0, 1), 1.4);
      return { pitch: hook * (P(t1) - P(t0)) };
    });
    const rad = (s: number): number => {
      if (s <= s3) return rc;
      if (s <= sC) return rc * (1 - 0.3 * smooth((s - s3) / (sC - s3)));
      if (!central) return rc * 0.7 * (1 - 0.6 * smooth((s - sC) / (s5 - sC)));
      if (s <= s5) return lerp1(0.7 * rc, rs, smooth((s - sC) / (s5 - sC)));
      return rs * (1 - 0.7 * clamp((s - s5) / (L - s5), 0, 1));
    };
    const wind = (): VertexWind => ({ height: 0, limb: base.limb, phase: base.phase, detail: STILL_DETAIL });
    const children: Attachment[] = [];
    const spineAngle = p.spineAngle * DEG2RAD;
    const NA = fine ? 8 : 4;
    for (let k = 0; k < spines; k++) {
      const col = (k * NA) / spines;
      const len = Math.max(0.001, p.spineLength * (1 + p.spineLengthV * this.detailRng.uniform()));
      const angJ = spineAngle * (1 + 0.15 * this.detailRng.uniform());
      children.push({
        s: s2 + 0.5 * cell,
        az: (col + 0.5) * (TAU / NA),
        w: 1,
        h: 1,
        hh: 0.5 * cell,
        fixed: true,
        optional: true,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeSpine(ex, base, len, rs, angJ),
      });
    }
    const extra = fine ? [sR, s2, s3, sC, s5] : [s2, s3, sC, s5];
    if (central && hook !== 0) extra.push(s5 + 0.33 * (L - s5), s5 + 0.66 * (L - s5));
    this.count('areoles');
    return {
      level: 3,
      line,
      sStart,
      profile: (s, j, N) => {
        const rr = rad(s);
        const th = (TAU * j) / N;
        return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
      },
      radius: rad,
      round: true,
      extra,
      spacing: cell,
      rowLattice: cell,
      refine: fine ? [sR] : undefined,
      children,
      wind,
      pivot: base.pivot,
      r0: rc,
      minGap: 0.2 * cell,
    };
  }

  private makeSpine(exit: Exit, base: WindBase, len: number, rs: number, angle: number): Organ {
    const dir0 = normalize(add(scale(exit.normal, Math.cos(angle)), scale(exit.dir, Math.sin(angle))));
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const sStart = Math.min(0.4 * len, this.collarLen(rs, 2.2));
    const L = Math.max(len, sStart + 0.002);
    const line = growLine(exit.pos, dir0, right0, L, 1, () => ({}));
    const rad = (s: number): number => rs * (1 - 0.72 * clamp((s - sStart) / Math.max(1e-6, L - sStart), 0, 1));
    this.count('spines');
    return {
      level: 3,
      line,
      sStart,
      profile: (s, j, N) => {
        const rr = rad(s);
        const th = (TAU * j) / N;
        return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
      },
      radius: rad,
      round: true,
      extra: [sStart + 0.5 * (L - sStart)],
      spacing: L,
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: STILL_DETAIL }),
      pivot: base.pivot,
      r0: rs,
      collarRings: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Leaves (rosettes and tufts)
  // ---------------------------------------------------------------------------

  private addTuft(
    children: Attachment[],
    c: { L: number; sStart: number; spacing: number; domeLen: number; N: number; limbAt: (s: number) => number; pivot: V3; phase: number; rad: (s: number) => number },
  ): void {
    const p = this.p;
    const n = Math.max(1, Math.round(p.leaves));
    const leafN = evenSides(p.leafSides, 6, 16);
    const { w, h } = this.leafWindow(leafN);
    // Rows the tuft needs at the branch's ring spacing (the spacing was already packed for it in makeColumn).
    const perRow = Math.max(1, Math.floor(c.N / (w + 1)));
    const rows = Math.ceil(n / perRow) * (h + 1) + 1;
    const sTo = c.L - c.domeLen - 0.5 * h * c.spacing;
    const sFrom = Math.max(c.sStart + c.spacing * (h + 1), Math.min(sTo - 0.45 * (c.L - c.sStart), sTo - rows * c.spacing));
    const az0 = this.leafRng.next() * TAU;
    for (let k = 0; k < n; k++) {
      const f = n > 1 ? k / (n - 1) : 1;
      const s = sFrom + (sTo - sFrom) * f;
      const az = az0 + k * GOLDEN;
      const spread = lerp1(p.leafSpread, p.leafSpreadTop, smooth(f)) * DEG2RAD;
      const L = Math.max(0.02, p.leafLength * (1 + p.leafLengthV * this.leafRng.uniform()) * (f > 0.75 ? lerp1(1, 0.6, (f - 0.75) / 0.25) : 1));
      const twistSign = this.leafRng.next() < 0.5 ? -1 : 1;
      children.push({
        s,
        az,
        w,
        h,
        hh: 0.5 * h * c.spacing,
        priority: 1,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeLeaf(ex, { spread, L, W: p.leafWidth, base: { limb: c.limbAt(s), phase: c.phase, pivot: c.pivot }, twistSign, level: 2 }),
      });
    }
  }

  private makeLeaf(exit: Exit, v: LeafSpec): Organ {
    const p = this.p;
    const { L, W } = v;
    const dir0 = normalize(add(scale(exit.dir, Math.cos(v.spread)), scale(exit.normal, Math.sin(v.spread))));
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const bend = p.leafBend * DEG2RAD;
    const twist = p.leafTwist * DEG2RAD * v.twistSign;
    // The blade narrows into a hard terminal spine (agaves, yuccas): the same tube, carried on past the
    // blade and rounded off into a tapering cone.
    const tip = Math.max(0, p.leafTipSpine);
    const Lt = L + tip;
    const line = growLine(exit.pos, dir0, right0, Lt, tip > 0 ? 14 : 12, (t0, t1) => ({
      gravity: bend * (Math.pow(t1, 1.5) - Math.pow(t0, 1.5)),
      roll: twist * (t1 - t0),
    }));
    const w0 = Math.min(W, 0.9 * exit.size);
    const widest = clamp(p.leafWidest, 0.1, 0.8);
    const taper = clamp(p.leafTaper, 1, 6);
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      const grow = w0 + (W - w0) * smooth(t / widest);
      const u = Math.max(0, (t - widest) / (1 - widest));
      const outline = W * Math.pow(Math.max(0, 1 - Math.pow(u, taper)), 0.85);
      return Math.max(0.05 * W, Math.min(grow, t < widest ? grow : outline));
    };
    const thk = clamp(p.leafThickness, 0.03, 0.8);
    const cup = p.leafCup * DEG2RAD;
    // Spine: round, as thick as the blade's end allows, tapering to a point.
    const rSpine = tip > 0 ? Math.min(0.5 * widthAt(L), Math.max(0.001, 0.07 * tip)) : 0;
    const spineRad = (s: number): number => rSpine * (1 - 0.85 * clamp((s - L) / Math.max(1e-6, tip), 0, 1));
    const radiusAt = (s: number): number => (s > L && tip > 0 ? spineRad(s) : 0.5 * widthAt(s));
    const sStart = Math.min(0.3 * L, Math.max(0.8 * w0, 0.8 * exit.size, this.collarLen(0.5 * w0, 1.4)));
    const perimeter = 2 * W * (1 + 0.6 * thk);
    const N = evenSides(p.leafSides, 6, 16);
    const spacing = Math.max(0.004, (p.ringAspect * perimeter) / N);
    const flex = Math.max(v.base.limb, this.flexMax);
    const flutter = this.flutter;
    const wind = (s: number): VertexWind => {
      const t = clamp(s / Lt, 0, 1);
      return { height: 0, limb: lerp1(v.base.limb, flex, t * t), phase: v.base.phase, detail: 0.15 * t * t * flutter };
    };
    const children: Attachment[] = [];
    const teeth = Math.max(0, Math.round(p.teeth));
    if (teeth > 0 && p.toothLength > 0) {
      const colStep = TAU / N;
      for (let k = 0; k < teeth; k++) {
        const t = 0.1 + (0.82 * (k + 0.5)) / teeth;
        for (const j0 of [N - 1, N / 2 - 1]) {
          const sk = t * L;
          children.push({
            s: sk,
            az: (j0 + 1) * colStep,
            w: 2,
            h: 1,
            hh: 0.5 * spacing,
            fixed: true,
            optional: true,
            loopExit: true,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeTooth(ex, { limb: wind(sk).limb, phase: v.base.phase, pivot: v.base.pivot }, line, sk),
          });
        }
      }
    }
    this.count('leaves');
    const extra = cosineStations(0.8 * L, L, 3, true);
    if (tip > 0) extra.push(L, L + 0.5 * tip);
    return {
      level: v.level,
      line,
      sStart,
      profile: (s, j, NN) => {
        const t = clamp(s / L, 0, 1);
        const w = widthAt(s);
        const q = cupPoint(NN, j, w, W * thk * (1 - 0.8 * t), cup * (1 - 0.4 * t));
        if (tip <= 0) return q;
        // Blend the channelled blade into the round spine over the last part of the blade.
        const b = s >= L ? 1 : smooth((t - 0.85) / 0.15);
        if (b <= 0) return q;
        const th = (TAU * j) / NN;
        const rc = lerp1(0.5 * w, rSpine, b);
        const rr = s > L ? spineRad(s) : rc;
        return { x: lerp1(q.x, rr * Math.cos(th), b), y: lerp1(q.y, rr * Math.sin(th), b) };
      },
      radius: radiusAt,
      round: false,
      extra,
      spacing,
      rowLattice: spacing,
      children,
      wind,
      pivot: v.base.pivot,
      r0: 0.5 * w0,
    };
  }

  private makeTooth(exit: Exit, base: WindBase, leaf: Line, sLeaf: number): Organ {
    const p = this.p;
    const len = Math.max(0.0005, p.toothLength);
    const rt = 0.38 * len;
    const f = leaf.at(sLeaf);
    // Point outwards along the margin, raked towards the tip.
    const dir0 = normalize(add(scale(exit.normal, 0.82), scale(f.dir, 0.57)));
    let right0 = projectOnPlane(f.up, dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const sStart = Math.min(0.45 * len, Math.max(this.collarLen(rt, 1.2), 0.25 * exit.size));
    const L = Math.max(len, sStart + 0.001);
    const line = growLine(exit.pos, dir0, right0, L, 1, () => ({}));
    const rad = (s: number): number => rt * (1 - 0.8 * clamp((s - sStart) / Math.max(1e-6, L - sStart), 0, 1));
    this.count('teeth');
    return {
      level: 3,
      line,
      sStart,
      profile: (s, j, N) => {
        const rr = rad(s);
        const th = (TAU * j) / N;
        return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
      },
      radius: rad,
      round: true,
      extra: [],
      spacing: L,
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: STILL_DETAIL }),
      pivot: base.pivot,
      r0: rt,
      collarRings: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Rosettes
  // ---------------------------------------------------------------------------

  private buildRosette(): void {
    const p = this.p;
    const r = Math.max(0.01, p.radius);
    const N = evenSides(p.sides, 12, 96);
    const depth = 0.1 + 0.4 * r;
    const H = Math.max(0.05, p.height * (1 + p.heightV * this.rng.uniform()));
    this.H = H;
    const L = depth + H;
    const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, 0.92 * r, N);
    const sStart = 0.3 * depth;
    // The stem narrows towards the crown and ends in a pointed bud — the central spear of unopened
    // leaves — short and slim enough to stay hidden among the youngest leaves.
    const domeLen = Math.min(0.3 * H, 0.8 * r);
    const n = Math.max(0, Math.round(p.leaves));
    const leafN = evenSides(p.leafSides, 6, 16);
    const { w, h } = this.leafWindow(leafN);
    const spacing0 = Math.max(0.003, p.ringAspect * ((TAU * r) / N));
    // Trunked rosettes (yuccas, foxtail agaves) carry their leaves only on the top part of the stem.
    const zone = clamp(p.leafZone, 0.1, 1);
    const spacing = this.packSpacing(n + (p.stalk > 0 && p.stalkOrigin !== 'terminal' ? 3 : 0) + Math.floor(N / (w + 1)), w, h, N, Math.max(0.02, zone * (L - domeLen - Math.max(sStart, depth - 0.02) - 2 * spacing0)), spacing0);
    const hasStalk = p.stalk > 0 && p.stalkHeight > 0;
    const terminal = hasStalk && p.stalkOrigin === 'terminal';
    // A terminal peduncle continues the stem: the bud narrows to the stalk radius instead of a point.
    const tipF = terminal ? clamp(p.stalkRadius / (0.5 * r), 0.1, 0.95) : 0.06;
    const rad = (s: number): number => {
      const t = clamp((s - depth) / H, -1, 1);
      let rr = r * (1 - 0.5 * smooth(t));
      const td = (s - (L - domeLen)) / domeLen;
      if (td > 0) rr *= Math.max(tipF, Math.pow(Math.max(0, 1 - td), 0.65));
      return rr;
    };
    const lean = p.leanV * DEG2RAD * this.rng.uniform();
    const azL = this.rng.next() * TAU;
    const A = { x: Math.cos(azL), y: 0, z: Math.sin(azL) };
    const dir0 = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
    const line = growLine(exit.pos, dir0, normalize(cross(UP, A)), L, 6, () => ({}));
    const phase = this.rng.next();
    const pivot = { x: 0, y: 0, z: 0 };

    const children: Attachment[] = [];
    const sTop = L - domeLen - (0.5 * h + 1) * spacing;
    // A lateral flower stalk takes the top rows below the dome; the leaves stop a clear row beneath it.
    const sTo = hasStalk && !terminal ? sTop - 3.5 * spacing : sTop;
    const sFrom0 = Math.max(sStart + (0.5 * h + 1) * spacing, depth + 0.005);
    const sFrom = zone < 1 ? Math.max(sFrom0, sTo - zone * (sTo - sFrom0)) : sFrom0;
    const az0 = this.leafRng.next() * TAU;
    // Phyllotaxis on the lattice: leaf k sits on row ⌊k / perRow⌋ (rows h + 1 lattice pitches apart, so the
    // windows of consecutive rows clear each other) and the golden angle picks its column; within a row the
    // columns are pushed apart to whole windows so no two leaves of a row can collide.
    const perRow = Math.max(1, Math.floor(N / (w + 1)));
    const pitch = (h + 1) * spacing;
    const rowsAvail = Math.max(1, Math.floor((sTo - sFrom) / pitch) + 1);
    const rowsUsed = Math.min(rowsAvail, Math.ceil(n / perRow));
    // Rows sit on whole lattice pitches so they can never merge; spread over the zone when there are spare rows.
    const rowPitch = rowsUsed > 1 ? pitch * Math.max(1, Math.floor((sTo - sFrom) / pitch / (rowsUsed - 1))) : pitch;
    // Columns: the leaves of a row sit `pitchCols` columns apart (at least a window and a free column);
    // whatever is left over is used as per-leaf jitter so the spiral does not look machined.
    const colStep = TAU / N;
    const pitchCols = Math.max(w + 1, Math.floor(N / perRow));
    const slackCols = pitchCols - (w + 1);
    // A partly filled row goes at the bottom: the crown must close around the bud.
    const fill = rowsUsed * perRow >= n ? (perRow - (n % perRow)) % perRow : 0;
    for (let k = 0; k < n; k++) {
      const f = n > 1 ? k / (n - 1) : 1;
      const row = Math.min(rowsUsed - 1, Math.floor((k + fill) / perRow));
      const s = sFrom + rowPitch * row;
      // Golden-angle rotation from row to row, then whole-column slots so no two windows of a row can touch.
      const slot = (k + fill) % perRow;
      const base = Math.round((az0 + row * GOLDEN) / colStep);
      const jit = slackCols > 0 ? Math.floor(((k * GOLDEN) % 1) * (slackCols + 1)) : 0;
      const az = (base + slot * pitchCols + jit + 0.5 * w) * colStep;
      const spread = lerp1(p.leafSpread, p.leafSpreadTop, smooth(f)) * DEG2RAD;
      let lenF = 1;
      if (f < 0.15) lenF = lerp1(0.75, 1, f / 0.15);
      else if (f > 0.7) lenF = lerp1(1, 0.58, smooth((f - 0.7) / 0.3));
      const Lf = Math.max(0.02, p.leafLength * lenF * (1 + p.leafLengthV * this.leafRng.uniform()));
      const twistSign = this.leafRng.next() < 0.5 ? -1 : 1;
      children.push({
        s,
        az,
        w,
        h,
        hh: 0.5 * h * spacing,
        priority: 1,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeLeaf(ex, { spread, L: Lf, W: p.leafWidth * (0.75 + 0.25 * lenF), base: { limb: 0, phase: this.leafRng.next(), pivot: ex.pos }, twistSign, level: 2 }),
      });
    }
    const stalkPhase = this.rng.next();
    if (hasStalk && !terminal) {
      const s = sTop - 1.5 * spacing;
      children.push({
        s,
        az: this.rng.next() * TAU,
        w: 3,
        h: 2,
        hh: spacing,
        priority: 3,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makePeduncle(ex, { limb: 0, phase: stalkPhase, pivot: ex.pos }, false),
      });
    }
    this.count('stem');
    const organ: Organ = {
      level: 0,
      line,
      sStart,
      profile: (s, j, NN) => {
        const rr = rad(s);
        const th = (TAU * j) / NN;
        return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
      },
      radius: rad,
      round: true,
      extra: cosineStations(L - domeLen, L, 5, true),
      spacing,
      rowLattice: spacing,
      children,
      wind: () => ({ height: 0, limb: 0, phase, detail: STILL_DETAIL }),
      pivot,
      r0: r,
      continuation: terminal ? (ex) => this.makePeduncle(ex, { limb: 0, phase: stalkPhase, pivot: ex.pos }, true) : undefined,
    };
    this.meshTube(organ, loop, exit, 1);
  }

  // ---------------------------------------------------------------------------
  // Inflorescences: peduncle, branches, bracts and flowers
  // ---------------------------------------------------------------------------

  /**
   * The flower stalk (peduncle). Terminal ones continue the rosette stem from
   * its tip ring; lateral ones leave a window below the crown. Along it:
   * scale-like bracts, the side branches of a panicle or candelabra and, for a
   * raceme / spike, the flowers themselves over the top `flowerZone`; a panicle
   * keeps a small terminal cluster above its last branch and a candelabra its
   * central raceme.
   */
  private makePeduncle(exit: Exit, base: WindBase, terminal: boolean): Organ {
    const p = this.p;
    const r = Math.max(0.002, Math.min(p.stalkRadius, terminal ? 0.5 * exit.size : 0.45 * exit.size));
    const L = Math.max(0.05, p.stalkHeight);
    const N = exit.N;
    const cell = Math.max(0.002, (p.ringAspect * TAU * r) / N);
    const kind = p.inflorescence;
    const dir0 = terminal ? exit.dir : normalize(add(scale(exit.normal, 0.5), UP));
    let right0 = projectOnPlane(cross(UP, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    // Lateral stalks straighten up over their first third; the arch (foxtail agave) builds up along the
    // length and the very tip turns back up towards the light.
    const arch = clamp(p.stalkArch, 0, 180) * DEG2RAD;
    const archW = (t: number): number => (t < 0.8 ? Math.pow(t / 0.8, 2) : 1 - 0.22 * smooth((t - 0.8) / 0.2));
    const line = growLine(exit.pos, dir0, right0, L, 48, (t0, t1) => ({
      gravity: (terminal ? 0 : -0.45 * (smooth(t1 / 0.35) - smooth(t0 / 0.35))) + arch * (archW(t1) - archW(t0)),
    }));
    const sStart = terminal ? this.collarLen(r, 1.0) : Math.max(this.collarLen(r, 1.6), 0.5 * exit.size);
    // The tip narrows to a terminal flower (panicle) or bud (raceme) that continues the axis.
    const rf = Math.max(0.0005, p.flowerRadius);
    const tipKind: FlowerShape = kind === 'panicle' ? p.flowerKind : 'bud';
    const rTip = Math.max(0.0008, Math.min(0.35 * r, (tipKind === 'bud' ? 0.4 : 0.3) * rf));
    const tipLen = Math.max(4 * cell, 0.03 * L);
    const rad = (s: number): number => {
      const rr = r * (1 - 0.65 * Math.pow(clamp(s / L, 0, 1), 0.9));
      return Math.min(rr, lerp1(rr, rTip, smooth((s - (L - tipLen)) / tipLen)));
    };
    const flex = this.flexMax;
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: 0, limb: flex * t * t, phase: base.phase, detail: STILL_DETAIL };
    };
    const children: Attachment[] = [];
    // A lateral stalk leaves through a 3 × 2 window (10 vertices round): it doubles up just past the collar.
    const refineAt = N < 16 ? sStart + 1.5 * cell : -1;
    const Nf = refineAt > 0 ? 2 * N : N;

    // ---- Bracts: appressed triangular scales in a spiral, largest at the base.
    const bracts = Math.max(0, Math.round(p.bracts));
    for (let k = 0; k < bracts; k++) {
      const t = 0.08 + (0.84 * (k + 0.5)) / bracts;
      const sk = t * L;
      const len = clamp(4 * r, 0.012, 0.11) * lerp1(1.4, 0.7, t) * (1 + 0.15 * this.detailRng.uniform());
      children.push({
        s: sk,
        az: k * GOLDEN + 0.4 * this.detailRng.uniform(),
        w: 2,
        h: 1,
        hh: 0.5 * cell,
        optional: true,
        priority: 1,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeBract(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, len),
      });
    }

    // ---- Branches of a panicle / candelabra, and how the flowers are shared out.
    const nBranches = kind === 'raceme' ? 0 : Math.max(0, Math.round(p.branches));
    const flowersTotal = Math.max(0, Math.round(p.flowers));
    let flowersHere = flowersTotal;
    if (nBranches > 0) {
      const zone = clamp(p.branchZone, 0.1, 0.85);
      // Panicle: branches up to just below the tip. Candelabra: all below the central raceme.
      const s1 = kind === 'panicle' ? 0.93 * L : Math.min(0.93 * L, L - clamp(p.flowerZone, 0.05, 0.95) * L - 3 * cell);
      const s0 = Math.max(sStart + 3 * cell, s1 - zone * L);
      // Panicle: the lowest branches are the longest (conical outline); candelabra: all alike.
      const lens: number[] = [];
      for (let k = 0; k < nBranches; k++) {
        const u = nBranches > 1 ? k / (nBranches - 1) : 0;
        lens.push(Math.max(0.03, p.branchLength * (kind === 'panicle' ? lerp1(1, 0.32, Math.pow(u, 0.9)) : lerp1(0.85, 1, u)) * (1 + 0.1 * this.detailRng.uniform())));
      }
      const lenSum = lens.reduce((a, b) => a + b, 0);
      // The peduncle keeps a share for its own tip: a small terminal cluster (panicle) or the central raceme.
      const share = kind === 'panicle' ? 0.08 : 1.3 / (nBranches + 1.3);
      flowersHere = Math.round(flowersTotal * share);
      const onBranches = flowersTotal - flowersHere;
      for (let k = 0; k < nBranches; k++) {
        const u = nBranches > 1 ? k / (nBranches - 1) : 0;
        const sk = s0 + (s1 - s0) * u;
        const nF = Math.round((onBranches * lens[k]) / lenSum);
        children.push({
          s: sk,
          az: k * GOLDEN + 0.5 * this.detailRng.uniform(),
          w: 3,
          h: 2,
          hh: cell,
          priority: 3,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeBranch(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, lens[k], nF),
        });
      }
    }

    // ---- Flowers on the peduncle itself.
    if (flowersHere > 0 && p.flowerLength > 0) {
      const zone = kind === 'panicle' && nBranches > 0 ? 0.06 : clamp(p.flowerZone, 0.05, 0.95);
      this.placeFlowers(children, Nf, cell, L, Math.max(sStart + 3 * cell, L - zone * L), L - 1.5 * cell, flowersHere, wind, base, null);
    }
    this.count('stalk');
    const tipWind = { limb: wind(L).limb, phase: base.phase, pivot: base.pivot };
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => {
        const rr = rad(s);
        const th = (TAU * j) / NN;
        return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
      },
      radius: rad,
      round: true,
      extra: [],
      spacing: cell,
      rowLattice: cell,
      refine: refineAt > 0 ? [refineAt] : undefined,
      children,
      wind,
      pivot: base.pivot,
      r0: r,
      continuation: p.flowerLength > 0 ? (ex) => this.makeFlower(ex, tipWind, tipKind, p.flowerDroop * DEG2RAD, tipKind === 'bud' ? 0.5 : 1, true) : undefined,
    };
  }

  /**
   * Flower windows over [sFrom, sTo] of an axis of N columns: as many rows as
   * the count needs (never closer than a free row apart), the columns of a row
   * spread round the axis — or, on a branch, over its underside / top only
   * (`side`), so pendent bells and upturned funnels never cross the branch.
   * The top of a raceme carries buds: shorter, closed, pointing up.
   */
  private placeFlowers(children: Attachment[], N: number, cell: number, L: number, sFrom: number, sTo: number, count: number, wind: (s: number) => VertexWind, base: WindBase, side: 'under' | 'top' | null): void {
    const p = this.p;
    if (count <= 0 || sTo <= sFrom) return;
    const rf = Math.max(0.0005, p.flowerRadius);
    // Small flowers fit through a 1 × 1 window (4 → 8 vertices round), larger ones through 2 × 1 (6 → 12 / 24).
    const w = rf < 0.0095 ? 1 : 2;
    const h = 1;
    const span = side ? Math.floor(N / 2) - 1 : N;
    const perRow = Math.max(1, Math.floor(span / (w + 1)));
    const cellsAvail = Math.max(1, Math.floor((sTo - sFrom) / cell));
    // As many rows as the zone allows (a free row between them), as few flowers per row as the count
    // needs: a dense spiral from the bottom to the top of the zone rather than sparse whorls.
    const maxRows = Math.floor((cellsAvail - 1) / (h + 1)) + 1;
    const perRowUsed = clamp(Math.ceil(count / maxRows), 1, perRow);
    const rowsUsed = Math.max(1, Math.min(maxRows, Math.ceil(count / perRowUsed)));
    const pitchCells = rowsUsed > 1 ? (cellsAvail - 1) / (rowsUsed - 1) : 0;
    const colPitch = Math.max(w + 1, Math.floor(span / perRowUsed));
    const droop = p.flowerDroop * DEG2RAD;
    const budFrom = 0.86;
    let k = 0;
    for (let row = 0; row < rowsUsed && k < count; row++) {
      const s = sFrom + (Math.round(row * pitchCells) + 0.5) * cell;
      const t = rowsUsed > 1 ? row / (rowsUsed - 1) : 0;
      // Each row turns on by a golden fraction of the column pitch: a spiral, not columns.
      const shift = Math.floor(((row * GOLDEN) / TAU) % 1 * colPitch);
      for (let c = 0; c < perRowUsed && k < count; c++) {
        const col = c * colPitch + shift;
        if (side && col + w > span) break;
        const j0 = side ? (side === 'under' ? N / 2 + 1 + col : 1 + col) : col;
        const bud = rowsUsed >= 6 && t > budFrom;
        const budSize = lerp1(0.55, 0.38, (t - budFrom) / (1 - budFrom));
        const sk = s;
        children.push({
          s: sk,
          az: (j0 + 0.5 * w) * (TAU / N),
          w,
          h,
          hh: 0.5 * cell,
          fixed: true,
          optional: true,
          azFrame: side ? 'line' : undefined,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeFlower(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, bud ? 'bud' : p.flowerKind, bud ? -75 * DEG2RAD : droop, bud ? budSize : 1, false),
        });
        k++;
      }
    }
  }

  /** A side branch: the arm of a panicle ending in a cluster of upturned funnels or hung with bells, or an erect raceme of a candelabra. */
  private makeBranch(exit: Exit, base: WindBase, len: number, nFlowers: number): Organ {
    const p = this.p;
    const kind = p.inflorescence;
    const r = Math.max(0.0015, Math.min(0.4 * exit.size, kind === 'candelabra' ? 0.7 * p.stalkRadius : 0.3 * p.stalkRadius));
    const angle = clamp(p.branchAngle, 5, 110) * DEG2RAD;
    const curve = clamp(p.branchCurve, -90, 90) * DEG2RAD;
    const dir0 = normalize(add(scale(exit.dir, Math.cos(angle)), scale(exit.normal, Math.sin(angle))));
    // right = circumferential: the frame's up then points up-and-inwards along the branch, and a bend by
    // "gravity" keeps it so — the underside (az 3π/2) and top (az π/2) of the branch stay where they are.
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const L = Math.max(0.03, len);
    const line = growLine(exit.pos, dir0, right0, L, 16, (t0, t1) => ({ gravity: curve * (Math.pow(t1, 1.2) - Math.pow(t0, 1.2)) }));
    const sStart = Math.max(this.collarLen(r, 1.4), 0.4 * exit.size);
    const N0 = exit.N;
    const N = 2 * N0;
    const cell = Math.max(0.0015, (p.ringAspect * TAU * r) / N);
    const taper = kind === 'candelabra' ? 0.35 : 0.5;
    const rf = Math.max(0.0005, p.flowerRadius);
    const tipKind: FlowerShape = kind === 'candelabra' ? 'bud' : p.flowerKind;
    const rTip = Math.max(0.0006, Math.min((1 - taper) * r, (tipKind === 'bud' ? 0.4 : 0.3) * rf));
    const tipLen = Math.max(3 * cell, 0.05 * L);
    const rad = (s: number): number => {
      const rr = r * (1 - taper * clamp(s / L, 0, 1));
      return Math.min(rr, lerp1(rr, rTip, smooth((s - (L - tipLen)) / tipLen)));
    };
    const flex = Math.max(base.limb, this.flexMax);
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: 0, limb: lerp1(base.limb, flex, t * t), phase: base.phase, detail: STILL_DETAIL };
    };
    const children: Attachment[] = [];
    const zone = clamp(p.flowerZone, 0.05, 0.95);
    const sTo = L - 1.5 * cell;
    const sFrom = Math.max(sStart + 2.5 * cell, L - zone * L);
    // The branch doubles its vertex count where the flowers begin.
    const refineAt = Math.max(sStart + 1.5 * cell, sFrom - 2 * cell);
    const rising = p.flowerDroop < 0;
    this.placeFlowers(children, N, cell, L, Math.max(sFrom, refineAt + 1.5 * cell), sTo, nFlowers, wind, base, kind === 'candelabra' ? null : rising ? 'top' : 'under');
    this.count('branches');
    const tipWind = { limb: wind(L).limb, phase: base.phase, pivot: base.pivot };
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => {
        const rr = rad(s);
        const th = (TAU * j) / NN;
        return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
      },
      radius: rad,
      round: true,
      extra: [],
      spacing: cell,
      rowLattice: cell,
      refine: refineAt < sTo - 3 * cell ? [refineAt] : undefined,
      children,
      wind,
      pivot: base.pivot,
      r0: r,
      continuation: p.flowerLength > 0 ? (ex) => this.makeFlower(ex, tipWind, tipKind, p.flowerDroop * DEG2RAD, tipKind === 'bud' ? 0.5 : 1, true) : undefined,
    };
  }

  /** A bract: a scale-like triangular leaf pressed to the peduncle, its tip curling out. */
  private makeBract(exit: Exit, base: WindBase, len: number): Organ {
    const spreadA = 22 * DEG2RAD;
    const dir0 = normalize(add(scale(exit.dir, Math.cos(spreadA)), scale(exit.normal, Math.sin(spreadA))));
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const W = Math.min(0.5 * len, 0.9 * exit.size);
    const L = Math.max(len, 1.5 * W);
    const line = growLine(exit.pos, dir0, right0, L, 6, (t0, t1) => ({ pitch: 0.7 * (t1 * t1 - t0 * t0) }));
    const sStart = Math.min(0.3 * L, Math.max(0.6 * exit.size, this.collarLen(0.5 * W, 1.2)));
    const widthAt = (s: number): number => Math.max(0.1 * W, W * Math.pow(1 - clamp(s / L, 0, 1), 0.9));
    this.count('bracts');
    return {
      level: 2,
      line,
      sStart,
      profile: (s, j, N) => cupPoint(N, j, widthAt(s), 0.1 * W, 0.6),
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: [0.5 * L, 0.8 * L],
      spacing: Math.max(0.004, 0.35 * L),
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: STILL_DETAIL }),
      pivot: base.pivot,
      r0: 0.5 * W,
      collarRings: 0,
    };
  }

  /**
   * One flower: pedicel → perianth → exserted stamens (or, for a bell, the wall
   * folding back up inside the open mouth). Tubes (aloes) are slightly
   * inflated at the base and narrow to a six-lobed mouth; funnels (agaves)
   * flare, with a bundle of long stamens tipped by anthers; bells (yuccas) are
   * six-ribbed and really open; buds are short closed spindles.
   */
  private makeFlower(exit: Exit, base: WindBase, kind: FlowerShape, droop: number, sizeF: number, terminal: boolean): Organ {
    const p = this.p;
    const rf = Math.max(0.0005, p.flowerRadius * (kind === 'bud' ? 0.8 : 1) * (1 + 0.06 * this.detailRng.uniform()));
    const len = Math.max(0.002, p.flowerLength * sizeF * (1 + 0.1 * this.detailRng.uniform()));
    // A terminal flower continues the axis from its (already narrowed) tip ring: the pedicel matches it.
    const rp = terminal ? Math.max(0.0003, 0.5 * exit.size) : Math.max(0.0003, Math.min(0.3 * rf, 0.3 * exit.size));
    const pedF = kind === 'bell' ? 0.55 : kind === 'funnel' ? 0.2 : kind === 'bud' ? 0.25 : 0.35;
    const Lp = terminal ? Math.max(0.004, 0.4 * pedF * len) : Math.max(1.4 * exit.size, pedF * len);
    const isBell = kind === 'bell';
    const stamens = kind === 'tube' || kind === 'funnel' ? Math.max(0, p.stamens) * len : 0;
    const Lin = isBell ? 0.4 * len : 0;
    const Lm = Lp + len;
    const L = Lm + Lin + stamens;
    // The pedicel leaves along the surface normal and bends under gravity until the flower hangs (or
    // points up) at `droop` from the horizontal, whatever side of the branch it left from.
    const el = Math.asin(clamp(exit.normal.y, -1, 1));
    // A terminal flower carries on from the tip, nodding halfway towards its droop; buds carry straight on.
    const bend = terminal ? (kind === 'bud' ? 0 : clamp(0.5 * (el + droop), -1.2, 1.2)) : clamp(el + droop + 0.1 * this.detailRng.uniform(), -2.4, 2.4);
    // A little scatter in where each pedicel points, so dense racemes do not read as a lattice.
    const dir0 = terminal ? exit.dir : normalize(rotateAxis(exit.normal, exit.dir, 0.2 * this.detailRng.uniform()));
    let right0 = projectOnPlane(cross(UP, dir0), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const tP = Lp / L;
    const line = growLine(exit.pos, dir0, right0, L, 10, (t0, t1) => ({ gravity: bend * (smooth(t1 / tP) - smooth(t0 / tP)) }));
    const sStart = terminal ? Math.min(0.5 * Lp, Math.max(0.002, 0.3 * exit.size)) : Math.min(0.3 * Lp, Math.max(this.collarLen(rp, 1.5), 0.3 * exit.size));
    const perianth = (t: number): number => {
      switch (kind) {
        case 'tube':
          return rf * (0.78 + 0.22 * Math.sin(Math.PI * Math.pow(t, 0.75))) * (1 - 0.12 * smooth((t - 0.7) / 0.3));
        case 'funnel':
          return rf * (0.3 + 0.7 * Math.pow(t, 1.4));
        case 'bell':
          return rf * (0.3 + 0.7 * Math.sin(0.5 * Math.PI * Math.min(1, t / 0.78))) * (1 - 0.12 * smooth((t - 0.78) / 0.22));
        default:
          return rf * 0.85 * (0.45 + 0.55 * Math.sin(Math.PI * Math.pow(t, 0.9)));
      }
    };
    const rad = (s: number): number => {
      if (s < Lp) return rp * (1 + 0.3 * smooth((s - (Lp - 0.3 * len)) / (0.3 * len)));
      if (s <= Lm) return Math.max(1.3 * rp, perianth((s - Lp) / len));
      if (isBell) return lerp1(0.82 * perianth(1), 0.25 * rf, smooth((s - Lm) / Lin));
      // Stamens: a bundle of filaments ending in anthers.
      const u = (s - Lm) / Math.max(1e-6, stamens);
      return rf * (u < 0.82 ? 0.14 : lerp1(0.14, 0.3, Math.sin(Math.PI * clamp((u - 0.82) / 0.18, 0, 1))));
    };
    const ribs = kind === 'tube' ? { from: 0.7, depth: 0.12 } : kind === 'funnel' ? { from: 0.45, depth: 0.3 } : kind === 'bell' ? { from: 0.35, depth: 0.22 } : { from: 2, depth: 0 };
    this.count(kind === 'bud' ? 'buds' : 'flowers');
    const extra: number[] = [Lp];
    for (let k = 1; k <= 6; k++) extra.push(Lp + (len * k) / 7);
    if (isBell) for (let k = 0; k < 3; k++) extra.push(Lm + (Lin * k) / 3);
    if (stamens > 0) extra.push(Lm, Lm + 0.5 * stamens, Lm + 0.82 * stamens, Lm + 0.91 * stamens);
    // Refinement: 4/6-vertex pedicel → 8/12-vertex corolla; wide bells refine twice (→ 24).
    const refineAt = clamp(Lp - 0.35 * len, sStart + 0.35 * (Lp - sStart), Lp - 0.002);
    const refines: number[] = [];
    if (!terminal) {
      if (refineAt - sStart > 0.006 && rf > 0.009) refines.push(0.5 * (sStart + refineAt));
      refines.push(refineAt);
    }
    return {
      level: 2,
      line,
      sStart,
      profile: (s, j, N) => {
        const rr = rad(s);
        if (s <= Lp) {
          const th = (TAU * j) / N;
          return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
        }
        if (s <= Lm) {
          const t = (s - Lp) / len;
          return ribbedPoint(N, j, rr, 6, ribs.depth * smooth((t - ribs.from) / Math.max(1e-6, 1 - ribs.from)), 1);
        }
        if (isBell) {
          // Inside the bell: the ring centre keeps advancing along the line, the surface goes back in.
          const pt = ribbedPoint(N, j, rr, 6, 0.5 * ribs.depth, 1);
          return { x: pt.x, y: pt.y, z: -2 * (s - Lm) };
        }
        return ribbedPoint(N, j, rr, 3, 0.45, 0.7);
      },
      radius: rad,
      round: true,
      extra,
      spacing: Math.max(0.3 * Lp, 0.0015),
      refine: refines.length ? refines : undefined,
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0.2 * this.flutter }),
      pivot: base.pivot,
      r0: rp,
      collarRings: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Pads (opuntia)
  // ---------------------------------------------------------------------------

  private buildPads(): void {
    const p = this.p;
    // The first joint of an old opuntia is a stout, half-woody pad: thicker and a little narrower than
    // the young pads it carries.
    const T = Math.max(0.004, 1.5 * p.padThickness);
    const W = Math.max(0.03, 0.85 * p.padWidth);
    const rNeck = Math.max(0.006, 0.9 * T);
    const depth = 0.04 + 0.5 * rNeck;
    const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, rNeck, 8);
    const az = this.rng.next() * TAU;
    const A = { x: Math.cos(az), y: 0, z: Math.sin(az) };
    const lean = 6 * DEG2RAD * this.rng.uniform();
    const dir0 = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
    const right0 = normalize(cross(UP, A));
    const L = depth + Math.max(0.03, 1.05 * p.padLength * (1 + 0.5 * p.padLengthV * this.rng.uniform()));
    const budget = { left: Math.max(0, Math.round(p.pads) - 1) };
    const organ = this.makePad(exit, { level: 0, L, W, T, dir0, right0, base: { limb: 0, phase: this.rng.next(), pivot: { x: 0, y: 0, z: 0 } }, children: this.padChildren(0, budget), sGround: depth }, budget);
    this.meshTube(organ, loop, exit, 1);
  }

  /** Children of a pad at `level`, drawn from the plant's pad budget so the chain has about `pads` pads in `padLevels` levels. */
  private padChildren(level: number, budget: { left: number }): number {
    const p = this.p;
    const levels = Math.max(1, Math.round(p.padLevels));
    if (level >= levels - 1 || budget.left <= 0) return 0;
    const total = Math.max(1, Math.round(p.pads));
    // Branching factor c with (c^levels − 1)/(c − 1) ≈ pads.
    let c = 1;
    let bestErr = Infinity;
    for (let cc = 1; cc <= 4; cc++) {
      const nodes = cc === 1 ? levels : (Math.pow(cc, levels) - 1) / (cc - 1);
      const err = Math.abs(nodes - total);
      if (err < bestErr) {
        bestErr = err;
        c = cc;
      }
    }
    let n = Math.max(level === 0 ? Math.min(3, c + 1) : 1, Math.round(c + 0.8 * this.rng.uniform()));
    n = Math.min(n, budget.left);
    budget.left -= n;
    return n;
  }

  private makePad(exit: Exit, v: PadSpecV, budget: { left: number }): Organ {
    const p = this.p;
    const { L, W, T, level } = v;
    const isBase = level === 0;
    const rng = this.rng;
    const up = p.padUp * DEG2RAD * (1 + 0.3 * rng.uniform());
    const line = growLine(exit.pos, v.dir0, v.right0, L, 10, (t0, t1) => ({ gravity: -up * (smooth(t1 / 0.7) - smooth(t0 / 0.7)) }));

    const NF = evenSides(p.padSides, 8, 32) >= 24 ? 32 : evenSides(p.padSides, 8, 32) >= 12 ? 16 : 8;
    const doublings = NF === 32 ? 2 : NF === 16 ? 1 : 0;
    const perimeter = 2 * (W - T) + Math.PI * T;
    const spacing = Math.max(0.003, (p.ringAspect * perimeter) / NF);
    const wNeck = Math.min(W, Math.max(1.6 * T, 0.9 * exit.size));
    const sStart = isBase ? 0.35 * v.sGround : Math.min(0.25 * L, Math.max(this.collarLen(0.5 * wNeck, 1.4), 0.6 * exit.size));
    const s0 = isBase ? v.sGround : 0;
    const span = Math.max(1e-3, L - s0);
    const refine: number[] = [];
    for (let d = 0; d < doublings; d++) refine.push(sStart + (2 * d + 1.5) * spacing);
    const widen = Math.max(0.3, (refine.length ? refine[refine.length - 1] + 2 * spacing - s0 : 0.2 * span) / span);
    // Obovate outline: an egg with its broad end up, widest at 58 % of the length, on a narrow neck.
    // The buried first pad is already broad where it meets the ground: its neck widens from the collar.
    const growFrom = isBase ? sStart : s0;
    const growLen = isBase ? 0.2 * (L - sStart) : widen * span;
    const widthAt = (s: number): number => {
      const t = clamp((s - s0) / span, -0.5, 1);
      const grow = wNeck + (W - wNeck) * smooth(Math.max(0, s - growFrom) / growLen);
      const c = 0.58;
      const u = t < c ? (c - t) / c : (t - c) / (1 - c);
      const outline = W * Math.pow(Math.max(0, 1 - u * u), t < c ? 0.6 : 0.5);
      return Math.max(0.06 * W, Math.min(grow, outline));
    };
    const thickAt = (s: number): number => {
      const t = clamp((s - s0) / span, -0.5, 1);
      return T * (0.7 + 0.3 * smooth(Math.max(0, t) / widen)) * (1 - 0.45 * smooth((t - 0.8) / 0.2));
    };
    const flex = Math.max(v.base.limb, clamp(this.flexMax * (1 + 0.3 * level), 0, 1));
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: 0, limb: isBase ? 0 : lerp1(v.base.limb, flex, t), phase: v.base.phase, detail: STILL_DETAIL };
    };
    const limbAt = (s: number): number => wind(s).limb;
    const pivot = isBase ? v.base.pivot : level === 1 ? exit.pos : v.base.pivot;
    const colStep = TAU / NF;
    const children: Attachment[] = [];

    // ---- Child pads on the rim: alternate edges, and stack the windows of one edge at least a window
    // height apart (the 2×2 rim windows of successive children would otherwise collide).
    const edgeNext: [number, number] = [s0 + span * p.padFrom, s0 + span * p.padFrom];
    const sLast = L - 2.5 * spacing; // highest rim window that still clears the tip
    const slotsPerEdge = Math.max(1, Math.floor((sLast - edgeNext[0]) / (3.5 * spacing)) + 1);
    const nChildren = Math.min(v.children, 2 * slotsPerEdge);
    budget.left += v.children - nChildren; // pads that do not fit here go to later pads
    for (let k = 0; k < nChildren; k++) {
      const right = nChildren === 1 ? rng.next() < 0.5 : k % 2 === 0;
      const j0 = right ? NF - 1 : NF / 2 - 1;
      const f = p.padFrom + ((p.padTo - p.padFrom) * (k + rng.next())) / Math.max(1, nChildren);
      const e = right ? 0 : 1;
      const s = Math.min(sLast, Math.max(edgeNext[e], s0 + span * clamp(f, 0.3, 0.97)));
      edgeNext[e] = s + 3.5 * spacing;
      // Child pads fan out from the rim (opuntias spread as much as they rise), lean out of the parent's
      // plane towards one face or the other, and twist their own plane away from the parent's.
      const angle = (p.padAngle + 17 * rng.uniform()) * DEG2RAD;
      const tilt = p.padTilt * DEG2RAD * rng.uniform();
      const twist = p.padTwist * DEG2RAD * (rng.next() < 0.5 ? -1 : 1) * (0.35 + 0.65 * rng.next());
      const lenJ = 1 + p.padLengthV * rng.uniform();
      const phase = rng.next();
      const childCount = this.padChildren(level + 1, budget);
      children.push({
        s,
        az: (j0 + 1) * colStep,
        w: 2,
        h: 2,
        hh: spacing,
        priority: 2,
        loopExit: true,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => {
          const f0 = line.at(s);
          const side = normalize(add(scale(ex.normal, Math.cos(tilt)), scale(f0.up, Math.sin(tilt))));
          const dir0 = normalize(add(scale(ex.dir, Math.cos(angle)), scale(side, Math.sin(angle))));
          const upC = normalize(projectOnPlane(rotateAxis(f0.up, dir0, twist), dir0));
          const right0 = normalize(cross(upC, dir0));
          return this.makePad(
            ex,
            {
              level: level + 1,
              L: Math.max(0.03, p.padLength * lenJ * (1 - 0.08 * level)),
              W: Math.max(0.03, p.padWidth * (1 - 0.06 * level)),
              T: Math.max(0.004, p.padThickness * (level === 0 ? 1.25 : 1)),
              dir0,
              right0,
              base: { limb: limbAt(s), phase: isBase ? phase : v.base.phase, pivot: isBase ? ex.pos : pivot },
              children: childCount,
              sGround: 0,
            },
            budget,
          );
        },
      });
    }

    // ---- Fruits (tunas) in a row along the upper rim of the terminal pads: alternate edges, each edge
    // stacked from the apex down at the pitch the 2×1 rim windows allow.
    const fruits = nChildren === 0 && !isBase ? Math.max(0, Math.round(p.fruits + 0.99 * rng.uniform())) : 0;
    const sFruitTop = L - 2 * spacing;
    const fruitPitch = 2.5 * spacing;
    const fruitSlots = Math.max(0, Math.floor((sFruitTop - (s0 + 0.55 * span)) / fruitPitch) + 1);
    for (let k = 0; k < Math.min(fruits, 2 * fruitSlots); k++) {
      const right = k % 2 === 0;
      const j0 = right ? NF - 1 : NF / 2 - 1;
      const s = sFruitTop - Math.floor(k / 2) * fruitPitch - 0.25 * spacing * rng.next();
      const len = Math.max(0.01, p.fruitLength * (1 + 0.15 * rng.uniform()));
      const rJ = 1 + 0.12 * rng.uniform();
      children.push({
        s,
        az: (j0 + 1) * colStep,
        w: 2,
        h: 1,
        hh: 0.5 * spacing,
        priority: 1,
        loopExit: true,
        optional: true,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeFruit(ex, { limb: limbAt(s), phase: v.base.phase, pivot }, len, rJ),
      });
    }

    // ---- Areoles on both faces.
    if (p.areoleSpacing > 0 && p.spineLength > 0) {
      const rowStep = Math.max(1, Math.round(p.areoleSpacing / spacing));
      const colPitch = Math.max(2, Math.round(p.areoleSpacing / (perimeter / NF)));
      const tA0 = Math.max(widen + 0.05, 0.2);
      let row = 0;
      for (let s = s0 + span * tA0; s < L - 2 * spacing; s += rowStep * spacing, row++) {
        const a = 0.5 * widthAt(s);
        const b = 0.5 * thickAt(s);
        const sk = s;
        for (let j = 0; j < NF; j++) {
          const q = stadiumPoint(NF, j + 0.5, a, b);
          const onFace = Math.abs(q.y) > 0.9 * b && Math.abs(q.x) < a - 1.2 * b;
          if (!onFace) continue;
          if ((j + row * Math.ceil(colPitch / 2)) % colPitch !== 0) continue;
          children.push({
            s: sk,
            az: (j + 0.5) * colStep,
            w: 1,
            h: 1,
            hh: 0.5 * spacing,
            fixed: true,
            optional: true,
            loopExit: true,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeAreole(ex, { limb: limbAt(sk), phase: v.base.phase, pivot }, 1),
          });
        }
      }
    }

    this.count('pads');
    return {
      level: Math.min(3, level === 0 ? 0 : 1),
      line,
      sStart,
      profile: (s, j, NN) => {
        // Rounded rim, faces that swell gently towards the middle (a lens, not a slab).
        const a = 0.5 * widthAt(s);
        const q = stadiumPoint(NN, j, a, 0.5 * thickAt(s));
        const u = q.x / a;
        return { x: q.x, y: q.y * (1 + 0.3 * (1 - u * u)) };
      },
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: cosineStations(s0 + 0.82 * span, L, 4, true),
      spacing,
      rowLattice: spacing,
      refine,
      children,
      wind,
      pivot,
      r0: 0.5 * wNeck,
    };
  }

  /** A tuna: barrel-shaped, narrow at the areole, nearly cylindrical, with a flat, dimpled top. */
  private makeFruit(exit: Exit, base: WindBase, len: number, rJ = 1): Organ {
    const p = this.p;
    const R = Math.max(0.004, p.fruitRadius * rJ);
    const dir0 = normalize(add(scale(exit.normal, 0.7), scale(exit.dir, 0.7)));
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const rNeck = Math.min(0.6 * R, 0.45 * exit.size);
    const sStart = Math.min(0.15 * len, Math.max(this.collarLen(rNeck, 1.2), 0.3 * exit.size));
    const L = Math.max(len, sStart + 0.004);
    const span = L - sStart;
    const line = growLine(exit.pos, dir0, right0, L, 3, () => ({}));
    const sR = sStart + 0.08 * span;
    const body = (t: number): number => {
      if (t < 0.5) return 0.6 + 0.4 * smooth(t / 0.5); // shoulder from the neck to the full radius
      if (t < 0.82) return 1 - 0.03 * ((t - 0.5) / 0.32); // nearly cylindrical belly
      const u = (t - 0.82) / 0.18; // rounded top, ending in a small flat disc
      return 0.97 * Math.sqrt(Math.max(0, 1 - 0.9 * u * u));
    };
    const rad = (s: number): number => {
      const t = clamp((s - sStart) / span, 0, 1);
      if (t < 0.08) return lerp1(rNeck, R * body(0.08), t / 0.08);
      return R * body(t);
    };
    const stations = [sR, ...[0.2, 0.35, 0.5, 0.66, 0.82, 0.9, 0.96].map((t) => sStart + t * span)];
    this.count('fruits');
    return {
      level: 2,
      line,
      sStart,
      profile: (s, j, N) => {
        const rr = rad(s);
        const th = (TAU * j) / N;
        const t = (s - sStart) / span;
        // Umbilicus: the top rings are pushed back into the body.
        const z = t > 0.9 ? -0.14 * R * ((t - 0.9) / 0.1) : 0;
        return { x: rr * Math.cos(th), y: rr * Math.sin(th), z };
      },
      radius: rad,
      round: true,
      extra: stations,
      spacing: L,
      refine: [sR],
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: STILL_DETAIL }),
      pivot: base.pivot,
      r0: rNeck,
      minGap: 0.01 * L,
    };
  }
}

