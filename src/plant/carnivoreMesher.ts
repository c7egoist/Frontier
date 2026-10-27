/**
 * Carnivorous-plant mesher: the plant WITH its traps as one closed quad
 * manifold.
 *
 * Built on the organ mesher. A buried crown (rosettes, pitcher clumps) or a
 * base ring under a scrambling stem (Nepenthes) is the topological root;
 * every leaf, pitcher, hood, lid, fishtail lobe, scape, flower, tooth,
 * trigger hair and glue tentacle is a tube welded to its parent through a
 * window of the parent's ring grid.
 *
 * The traps themselves are the organs' own cross-sections:
 *   · a flytrap leaf is one tube whose flat petiole section morphs into a
 *     "W": two dished lobes hinged on the midrib, teeth welded to the lobe
 *     margins and trigger hairs to the inner faces;
 *   · a sundew blade carries its tentacles on a row lattice of its upper
 *     face and margins;
 *   · a pitcher is a tube that flares to the mouth, rolls over the lip and
 *     goes back DOWN inside (ring offsets along the axis), closing on the
 *     surface of the digestive pool, so the mouth is really open; the wing
 *     is a ridge of the same section, the hood a blade from a window just
 *     below the lip;
 *   · a Nepenthes leaf is one tube: blade → tendril (hooking back up) →
 *     upright pitcher with its lid.
 *
 * Organ levels (Levels view / GLB TEXCOORD_1):
 *   0 crown, stem · 1 leaves, pitchers, scapes · 2 hoods, lids, fishtail
 *   lobes, flowers · 3 teeth, trigger hairs, tentacles.
 */

import { VertexWind } from '../tree/mesh';
import { Random } from '../core/random';
import { V3, UP, TAU, DEG2RAD, add, cross, normalize, scale, clamp, projectOnPlane, lengthSq, anyPerpendicular, lerp1, wrapAngle } from '../core/math';
import { growLine, Line } from './line';
import { OrganMesher, OrganStats, OrganBuildResult, Exit, Organ, Attachment, evenSides, squareWindow, bladePoint, ribbedPoint, smooth } from './organMesher';
import { CarnivoreParams, carnivoreHeight } from './carnivoreParams';

export type CarnivoreStats = OrganStats;

export interface CarnivoreBuildResult extends OrganBuildResult {
  stats: CarnivoreStats;
}

const GOLDEN = 2.399963229728653;

interface WindBase {
  limb: number;
  phase: number;
  pivot: V3;
}

interface Slot {
  s: number;
  az: number;
  /** Age position 0 (oldest, lowest) … 1 (youngest). */
  f: number;
}

/** Geometry of a pitcher body shared by the clump pitchers and the Nepenthes leaf. */
interface PitcherGeom {
  /** Arc length where the body starts and its length along the line. */
  s0: number;
  Hp: number;
  /** Body radius at t ∈ [0, 1]. */
  R: (t: number) => number;
  /** Rolled lip radius and visible inside depth. */
  rho: number;
  Lin: number;
  /** Wing ridge height (× local radius), its azimuth in the right/up frame and whether it is a pair. */
  wing: number;
  wingAz: number;
  wingPair: boolean;
}

/** Blade-like child (hood, lid, fishtail lobe). */
interface FlapSpec {
  level: number;
  L: number;
  W: number;
  thk: number;
  dir0: V3;
  right0: V3;
  turn: (t0: number, t1: number) => { pitch?: number; gravity?: number; yaw?: number; roll?: number };
  /** Width outline along the flap, 0..1 of W. */
  outline: (t: number) => number;
  /** Curl across the width (radians of arc); positive curls towards −up. */
  cup: number;
  base: WindBase;
  flutter: number;
  name: string;
}

/**
 * Cross-section of an arched blade: an arc of `|phi|` radians and developed
 * width `width`, curling towards +up for phi > 0 and towards −up for phi < 0.
 * Same vertex order as `bladePoint` whichever way it curls, so a flap can be
 * convex without reversing its winding.
 */
function archPoint(N: number, j: number, width: number, thickness: number, phi: number): { x: number; y: number } {
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
  const th = thickness * 0.5 * (1 - Math.pow(u, 4)) * (top ? 1 : -1);
  const a = Math.abs(phi);
  if (a < 1e-3) return { x: u * width * 0.5, y: th };
  const sign = phi > 0 ? 1 : -1;
  const Rr = width / a;
  const ang = u * a * 0.5;
  const x = Rr * Math.sin(ang);
  const y = sign * Rr * (1 - Math.cos(ang));
  // Unit normal of the arc on its +up side.
  const nx = -sign * Math.sin(ang);
  const ny = Math.cos(ang);
  return { x: x + th * nx, y: y + th * ny };
}

export class CarnivoreMesher extends OrganMesher {
  private readonly p: CarnivoreParams;
  private readonly rng: Random;
  private readonly leafRng: Random;
  private readonly detailRng: Random;
  private flexMax = 0.3;

  constructor(p: CarnivoreParams, seed: number) {
    super();
    this.p = p;
    this.collarRingsDefault = Math.max(0, Math.round(p.collarRings));
    this.rng = new Random((seed ^ 0x3c6ef372) >>> 0);
    this.leafRng = this.rng.fork();
    this.detailRng = this.rng.fork();
  }

  build(): CarnivoreBuildResult {
    const p = this.p;
    this.plantH = Math.max(0.03, carnivoreHeight(p));
    this.flutter = clamp(this.plantH / 1.2, 0.25, 1);
    this.flexMax = clamp(p.flex, 0, 1);
    if (p.form === 'vine') this.buildVine();
    else this.buildCrown();
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

  /** Horizontal-ish width axis for a blade leaving along `dir0`, upper face up. */
  private levelRight(exit: Exit, dir0: V3): V3 {
    let right0 = projectOnPlane(cross(UP, dir0), dir0);
    if (lengthSq(right0) < 1e-6) right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    if (cross(dir0, right0).y < 0) right0 = scale(right0, -1);
    return right0;
  }

  /** Width axis so that the blade's up points along `upWanted` (as far as it can). */
  private rightFromUp(dir0: V3, upWanted: V3): V3 {
    let r = projectOnPlane(cross(upWanted, dir0), dir0);
    r = lengthSq(r) < 1e-12 ? anyPerpendicular(dir0) : normalize(r);
    return r;
  }

  /** Stations of the whole-column lattice: leaf k sits on a row and a slot column so no two windows of a row can touch. */
  private latticeSlots(n: number, N: number, w: number, h: number, sFrom: number, sTo: number, spacing: number, maxPerRow: number, rng: Random): Slot[] {
    const perRow = Math.max(1, Math.min(maxPerRow, Math.floor(N / (w + 1))));
    const pitch = (h + 1) * spacing;
    const rowsAvail = Math.max(1, Math.floor((sTo - sFrom) / pitch) + 1);
    const total = Math.min(n, rowsAvail * perRow);
    if (total < n) this.count('skipped', n - total);
    const rowsUsed = Math.min(rowsAvail, Math.ceil(total / perRow));
    const rowPitch = rowsUsed > 1 ? pitch * Math.max(1, Math.floor((sTo - sFrom) / pitch / (rowsUsed - 1))) : pitch;
    const colStep = TAU / N;
    const pitchCols = Math.max(w + 1, Math.floor(N / perRow));
    const slackCols = pitchCols - (w + 1);
    const fill = rowsUsed * perRow >= total ? (perRow - (total % perRow)) % perRow : 0;
    const az0 = rng.next() * TAU;
    const out: Slot[] = [];
    for (let k = 0; k < total; k++) {
      const row = Math.min(rowsUsed - 1, Math.floor((k + fill) / perRow));
      const slot = (k + fill) % perRow;
      const base = Math.round((az0 + row * GOLDEN) / colStep);
      const jit = slackCols > 0 ? Math.floor(((k * GOLDEN) % 1) * (slackCols + 1)) : 0;
      out.push({ s: sFrom + rowPitch * row, az: (base + slot * pitchCols + jit + 0.5 * w) * colStep, f: total > 1 ? k / (total - 1) : 1 });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Crown: rhizome below the soil, a short stem above it carrying the leaves
  // or pitchers on a row lattice, flower scapes at the top
  // ---------------------------------------------------------------------------

  private buildCrown(): void {
    const p = this.p;
    const pitcherForm = p.form === 'pitcher';
    const r = Math.max(0.004, p.radius);
    const N = evenSides(p.sides, 12, 96);
    const depth = 0.03 + 1.5 * r;
    let H = Math.max(0.004, p.height * (1 + p.heightV * this.rng.uniform()));
    const n = Math.max(0, Math.round(pitcherForm ? p.pitchers : p.leaves));

    // Neck window of a leaf / pitcher.
    let w: number;
    let h: number;
    let refineChild = false;
    if (pitcherForm) {
      const target = evenSides(p.pitcherSides, 12, 48);
      refineChild = target >= 24;
      ({ w, h } = squareWindow(refineChild ? target / 2 : target));
    } else {
      ({ w, h } = this.leafWindow(evenSides(p.leafSides, 8, 24)));
    }
    const scapes = p.scape > 0 && p.scapeHeight > 0 && p.flowerRadius > 0 ? Math.max(1, Math.round(p.scape)) : 0;
    const spacing0 = Math.max(0.0015, (p.ringAspect * TAU * r) / N);
    // Pitchers emerge from the rhizome a little below the soil; rosette leaves leave the crown at the surface.
    const below = pitcherForm ? 0.02 : -0.002;
    const sStart = 0.3 * depth;
    const base0 = Math.max(depth - below, sStart);
    const rowsWanted = pitcherForm ? Math.min(3, Math.ceil(n / 2)) : Math.ceil(n / Math.max(1, Math.floor(N / (w + 1))));
    // Lattice length in ring spacings: half a window and a free row at both ends, the scape rows, the leaf rows.
    const units = 2 * (0.5 * h + 1) + (scapes > 0 ? 4.5 : 0) + (rowsWanted - 1) * (h + 1) + 0.5;
    // The crown grows as tall as its lattice needs (short crowns carrying many leaves); the bud takes
    // half of a short crown and at most 0.8 r of a tall one.
    const minLen = units * 0.15 * spacing0;
    const extraBase = base0 - depth;
    H = Math.max(H, Math.min(2 * (minLen + extraBase), minLen + extraBase + 0.8 * r));
    const budLen = Math.min(0.5 * H, 0.8 * r);
    const L = depth + H;
    const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, 0.92 * r, N);
    const spacing = clamp((L - budLen - base0) / units, 0.15 * spacing0, spacing0);
    const sTop = L - budLen - (0.5 * h + 1) * spacing;
    const sTo = scapes > 0 ? sTop - 4.5 * spacing : sTop;
    const sFrom = base0 + (0.5 * h + 1) * spacing;
    const perRowCap = pitcherForm ? Math.max(2, Math.ceil(n / rowsWanted)) : 99;
    const slots = this.latticeSlots(n, N, w, h, sFrom, Math.max(sFrom, sTo), spacing, perRowCap, this.leafRng);

    const taperTop = pitcherForm ? 0.2 : 0.4;
    const rad = (s: number): number => {
      const t = clamp((s - depth) / H, -1, 1);
      let rr = r * (1 - taperTop * smooth(t));
      const td = (s - (L - budLen)) / budLen;
      if (td > 0) rr *= Math.max(0.06, Math.pow(Math.max(0, 1 - td), 0.65));
      return rr;
    };
    const line = growLine(exit.pos, UP, { x: 1, y: 0, z: 0 }, L, 4, () => ({}));
    const phase = this.rng.next();
    const pivot = { x: 0, y: 0, z: 0 };
    const children: Attachment[] = [];
    for (const slot of slots) {
      const f = slot.f;
      const wb: WindBase = { limb: 0, phase: this.leafRng.next(), pivot: { x: 0, y: 0, z: 0 } };
      if (pitcherForm) {
        const Hp = Math.max(0.03, p.pitcherHeight * (1 + p.pitcherHeightV * this.leafRng.uniform()) * lerp1(1, 0.8, smooth(Math.max(0, f - 0.6) / 0.4)));
        children.push({ s: slot.s, az: slot.az, w, h, hh: 0.5 * h * spacing, priority: 1, j0: 0, row0: 0, row1: 0, make: (ex) => this.makeClumpPitcher(ex, Hp, wb, refineChild) });
      } else {
        const spread = lerp1(p.leafSpread, p.leafSpreadTop, smooth(f)) * DEG2RAD;
        let lenF = 1;
        if (f < 0.12) lenF = lerp1(0.8, 1, f / 0.12);
        else if (f > 0.65) lenF = lerp1(1, 0.5, smooth((f - 0.65) / 0.35));
        const Lf = Math.max(0.01, p.leafLength * lenF * (1 + p.leafLengthV * this.leafRng.uniform()));
        children.push({
          s: slot.s,
          az: slot.az,
          w,
          h,
          hh: 0.5 * h * spacing,
          priority: 1,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => (p.trap === 'snap' ? this.makeSnapLeaf(ex, Lf, spread, f, wb) : this.makeBladeLeaf(ex, Lf, spread, f, wb)),
        });
      }
    }
    if (scapes > 0) {
      const s = sTop - 1.5 * spacing;
      const perRow = Math.max(1, Math.floor(N / 3));
      const az0 = this.rng.next() * TAU;
      for (let k = 0; k < Math.min(scapes, perRow); k++) {
        children.push({
          s,
          az: az0 + (TAU * k) / Math.min(scapes, perRow),
          w: 2,
          h: 2,
          hh: spacing,
          priority: 3,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeScape(ex, { limb: 0, phase: this.rng.next(), pivot: ex.pos }),
        });
      }
    }
    this.count('crown');
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
      extra: [L - budLen, L - 0.5 * budLen],
      spacing,
      rowLattice: spacing,
      children,
      wind: () => ({ height: 0, limb: 0, phase, detail: 0 }),
      pivot,
      r0: r,
    };
    this.meshTube(organ, loop, exit, 1);
  }

  // ---------------------------------------------------------------------------
  // Snap-trap leaf (Dionaea): petiole strip → two dished lobes on a hinge
  // ---------------------------------------------------------------------------

  private makeSnapLeaf(exit: Exit, L: number, spread: number, f: number, base: WindBase): Organ {
    const p = this.p;
    const N = Math.max(8, Math.round(evenSides(p.leafSides, 8, 24) / 4) * 4);
    const m = N / 4;
    const dir0 = this.outDir(exit, spread);
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const droop = p.leafDroop * DEG2RAD;
    // Traps are held with their hinge a little above the petiole: the leaf lifts into the trap.
    const lift = 12 * DEG2RAD;
    const Lp = clamp(p.petiole, 0.2, 0.85) * L;
    const Lt = L - Lp;
    const line = growLine(exit.pos, dir0, right0, L, 20, (t0, t1) => {
      const g = droop * (Math.pow(t1, 1.7) - Math.pow(t0, 1.7));
      const a0 = (t0 * L - Lp) / Lt;
      const a1 = (t1 * L - Lp) / Lt;
      return { gravity: g - lift * (smooth(a1 / 0.15) - smooth(a0 / 0.15)) };
    });
    const Wp = Math.max(0.003, p.leafWidth);
    const wNeck = Math.min(Wp, Math.max(0.9 * exit.size, 0.35 * Wp));
    const wIsth = 0.28 * Wp;
    const sStart = Math.min(0.2 * L, Math.max(this.collarLen(0.5 * wNeck, 1.2), 0.6 * exit.size));
    const petioleWidth = (t: number): number => {
      // t along the petiole 0..1: neck → broad wing → isthmus.
      const g = wNeck + (Wp - wNeck) * smooth(t / 0.35);
      const tail = t > 0.7 ? lerp1(Wp, wIsth, smooth((t - 0.7) / 0.3)) : Wp;
      return Math.min(g, tail);
    };
    const Wl = Math.max(0.003, p.trapWidth);
    const open = clamp(p.trapOpen * (1 + p.trapOpenV * this.leafRng.uniform()) * lerp1(1, 0.75, smooth(Math.max(0, f - 0.7) / 0.3)), 5, 175) * DEG2RAD;
    const alphaOpen = 0.5 * (Math.PI - open);
    const dish = 32 * DEG2RAD;
    const thk = clamp(p.leafThickness, 0.02, 0.4);
    // Lobe width along the trap: a rounded outline from the isthmus to the tip.
    const lobeWidth = (u: number): number => Math.max(0.5 * wIsth, Wl * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.55) * (u < 0.5 ? 1 : lerp1(1, 0.9, (u - 0.5) * 2)));
    const alphaAt = (u: number): number => alphaOpen * smooth(u / 0.14) * (u > 0.9 ? lerp1(1, 0.8, (u - 0.9) / 0.1) : 1);
    const spacing0 = Math.max(0.0008, (p.ringAspect * 4 * Wl) / N);
    const cilia = Math.max(0, Math.round(p.cilia));
    const spacingC = cilia > 0 ? (0.82 * Lt) / (2 * cilia) : spacing0;
    const spacing = Math.max(0.0005, Math.min(spacing0, spacingC));
    const flex = Math.max(base.limb, this.flexMax);
    const flutter = this.flutter;
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: 0, limb: lerp1(base.limb, flex, t * t), phase: base.phase, detail: 0.2 * t * t * flutter };
    };
    // Position on a lobe at fraction d (0 hinge → 1 margin) for section s (local x along the lobe side, y up).
    const lobePoint = (u: number, d: number, inner: boolean): { x: number; y: number } => {
      const W = lobeWidth(u);
      const a0 = alphaAt(u);
      const b = dish * smooth(u / 0.14);
      let xi: number;
      let eta: number;
      if (b < 1e-4) {
        xi = W * d * Math.cos(a0);
        eta = W * d * Math.sin(a0);
      } else {
        const R = W / b;
        xi = R * (Math.sin(a0 + b * d) - Math.sin(a0));
        eta = R * (Math.cos(a0) - Math.cos(a0 + b * d));
      }
      const a = a0 + b * d;
      const th = 0.5 * Wl * thk * (1 - Math.pow(d, 4)) * (inner ? 1 : -1);
      return { x: xi - th * Math.sin(a), y: eta + th * Math.cos(a) };
    };
    const profile = (s: number, j: number, NN: number): { x: number; y: number } => {
      if (s <= Lp) return bladePoint(NN, j, petioleWidth(s / Lp), Wp * thk * 1.5, 0.12, 0);
      const u = (s - Lp) / Lt;
      const q = (4 * j) / NN; // quadrant position 0..4
      let side: number;
      let d: number;
      let inner: boolean;
      if (q < 1) {
        side = 1;
        d = 1 - q;
        inner = true;
      } else if (q < 2) {
        side = -1;
        d = q - 1;
        inner = true;
      } else if (q < 3) {
        side = -1;
        d = 3 - q;
        inner = false;
      } else {
        side = 1;
        d = q - 3;
        inner = false;
      }
      const pt = lobePoint(u, d, inner);
      return { x: side * pt.x, y: pt.y };
    };
    const children: Attachment[] = [];
    const colStep = TAU / N;
    // Teeth along both margins (the margin vertices are columns 0 and N/2).
    if (cilia > 0 && p.ciliaLength > 0) {
      for (let k = 0; k < cilia; k++) {
        const u = 0.1 + (0.8 * (k + 0.5)) / cilia;
        const sk = Lp + u * Lt;
        for (const j0 of [N - 1, N / 2 - 1]) {
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
            make: (ex) => this.makeTooth(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, line, sk, Math.pow(Math.sin(Math.PI * u), 0.5)),
          });
        }
      }
    }
    // Trigger hairs on the inner faces: column m/2 of each lobe.
    const hairs = Math.max(0, Math.round(p.triggerHairs));
    if (hairs > 0) {
      for (let k = 0; k < hairs; k++) {
        const u = 0.3 + (0.45 * k) / Math.max(1, hairs - 1);
        const sk = Lp + u * Lt;
        for (const side of [1, -1]) {
          const j = side > 0 ? Math.floor(m / 2) : m + Math.floor(m / 2);
          const d = side > 0 ? 1 - (j + 0.5) / m : (j + 0.5 - m) / m;
          const a = alphaAt(u) + dish * smooth(u / 0.14) * d;
          const fr = line.at(sk);
          // Inner-face normal of that lobe, in world space.
          const hint = normalize(add(scale(fr.right, -side * Math.sin(a)), scale(fr.up, Math.cos(a))));
          children.push({
            s: sk,
            az: (j + 0.5) * colStep,
            w: 1,
            h: 1,
            hh: 0.5 * spacing,
            fixed: true,
            optional: true,
            loopExit: true,
            normalHint: hint,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeHair(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, hint),
          });
        }
      }
    }
    this.count('trap leaves');
    const extra: number[] = [Lp, Lp + 0.07 * Lt, Lp + 0.14 * Lt];
    for (let k = 1; k <= 4; k++) extra.push(L - Lt * 0.1 * (1 - Math.cos((0.5 * Math.PI * k) / 5)));
    return {
      level: 1,
      line,
      sStart,
      profile,
      radius: (s) => (s <= Lp ? 0.5 * petioleWidth(s / Lp) : lobeWidth((s - Lp) / Lt)),
      round: false,
      extra,
      spacing,
      rowLattice: spacing,
      children,
      wind,
      pivot: base.pivot,
      r0: 0.5 * wNeck,
    };
  }

  /** Marginal tooth (cilium) of a snap trap: a tapering spike in the plane of the lobe. */
  private makeTooth(exit: Exit, base: WindBase, leaf: Line, sLeaf: number, lenScale: number): Organ {
    const p = this.p;
    const len = Math.max(0.0005, p.ciliaLength * lenScale * (0.85 + 0.3 * this.detailRng.next()));
    const rt = Math.max(0.0001, Math.min(0.16 * len, 0.45 * exit.size));
    const fr = leaf.at(sLeaf);
    const dir0 = normalize(add(scale(exit.normal, 0.95), scale(fr.dir, 0.3)));
    const right0 = this.rightFromUp(dir0, fr.up);
    const sStart = Math.min(0.4 * len, Math.max(this.collarLen(rt, 1.2), 0.3 * exit.size));
    const L = Math.max(len, sStart + 0.0005);
    const curl = 0.5 * this.detailRng.uniform();
    const line = growLine(exit.pos, dir0, right0, L, 3, (t0, t1) => ({ yaw: curl * (t1 - t0) }));
    const rad = (s: number): number => rt * (1 - 0.85 * clamp((s - sStart) / Math.max(1e-6, L - sStart), 0, 1));
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
      extra: [sStart + 0.5 * (L - sStart)],
      spacing: L,
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0.1 * this.flutter }),
      pivot: base.pivot,
      r0: rt,
      collarRings: 0,
    };
  }

  /** Trigger hair on the inner face of a lobe. */
  private makeHair(exit: Exit, base: WindBase, dirIn: V3): Organ {
    const len = Math.max(0.0008, 0.0025 * (0.9 + 0.2 * this.detailRng.next()));
    const rt = Math.max(0.00008, Math.min(0.06 * len, 0.3 * exit.size));
    const dir0 = normalize(add(scale(dirIn, 1), scale(exit.dir, 0.15)));
    const right0 = this.rightFromUp(dir0, exit.dir);
    const sStart = Math.min(0.45 * len, Math.max(this.collarLen(rt, 1.2), 0.3 * exit.size));
    const L = Math.max(len, sStart + 0.0005);
    const line = growLine(exit.pos, dir0, right0, L, 1, () => ({}));
    const rad = (s: number): number => rt * (1 - 0.5 * clamp((s - sStart) / Math.max(1e-6, L - sStart), 0, 1));
    this.count('trigger hairs');
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
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0 }),
      pivot: base.pivot,
      r0: rt,
      collarRings: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Blade leaves: sundews (tentacles on the upper face and margins) and
  // butterworts (a bare, up-rolled flypaper blade)
  // ---------------------------------------------------------------------------

  private makeBladeLeaf(exit: Exit, L: number, spread: number, f: number, base: WindBase): Organ {
    const p = this.p;
    const sundew = p.trap === 'tentacle';
    const N = evenSides(p.leafSides, 8, 24);
    const dir0 = this.outDir(exit, spread);
    let right0 = projectOnPlane(cross(exit.dir, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const droop = p.leafDroop * DEG2RAD;
    const tp = clamp(p.petiole, 0, 0.85);
    const Lp = tp * L;
    const Lb = L - Lp;
    const W = Math.max(0.002, p.leafWidth);
    const round = W > 0.6 * Lb;
    // Young sundew leaves unroll from a curl of the blade tip towards the upper face.
    const curl = sundew ? p.tipCurl * DEG2RAD * smooth((f - 0.45) / 0.55) : 0;
    const line = growLine(exit.pos, dir0, right0, L, 24, (t0, t1) => {
      const g = droop * (Math.pow(t1, 1.6) - Math.pow(t0, 1.6));
      const c0 = clamp(((t0 - tp) / (1 - tp) - 0.6) / 0.4, 0, 1);
      const c1 = clamp(((t1 - tp) / (1 - tp) - 0.6) / 0.4, 0, 1);
      return { gravity: g, pitch: -curl * (c1 * c1 - c0 * c0) };
    });
    const wp = Math.max(0.0015, (round ? 0.16 : 0.42) * W);
    const wNeck = Math.min(Math.max(wp, 0.5 * W), Math.max(0.9 * exit.size, 0.3 * wp));
    const sStart = Math.min(0.2 * L, Math.max(this.collarLen(0.5 * wNeck, 1.2), 0.6 * exit.size));
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      const neck = wNeck + (wp - wNeck) * smooth(t / Math.max(0.08, 0.6 * tp));
      if (Lp > 0 && s < Lp) return Math.max(0.6 * wp, Math.min(neck, wp));
      const u = Lb > 0 ? clamp((s - Lp) / Lb, 0, 1) : 1;
      let outline: number;
      if (round) outline = Math.pow(Math.max(0, 1 - Math.pow(2 * u - 1, 2)), 0.45);
      else if (sundew) outline = Math.min(1, u / 0.18) * (u > 0.82 ? Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.82) / 0.18, 2))) : 1);
      else outline = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (u - 0.62) / 0.38), 1.6)), 0.6) * Math.min(1, Math.pow(u / 0.62, 0.7));
      const wOut = Math.max(wp, W * outline);
      return Math.max(0.04 * W, Math.min(Lp > 0 ? Math.max(wp, wOut) : neck > wOut ? wOut : neck, wOut));
    };
    const thk = clamp(p.leafThickness, 0.02, 0.5);
    const cup = p.leafCup * DEG2RAD;
    const perimeter = 2 * W * (1 + 0.5 * thk);
    const spacing0 = Math.max(0.0006, (p.ringAspect * perimeter) / N);
    // Tentacles: alternate rows of margin pairs and upper-face columns; thin the lattice to the requested count.
    const nFace = Math.max(0, N / 4 - 1);
    const perPair = 2 + nFace;
    const tentacles = sundew ? Math.max(0, Math.round(p.tentacles)) : 0;
    const spacingT = tentacles > 0 ? (0.9 * Lb) / Math.max(2, (2 * tentacles) / perPair) : spacing0;
    const spacing = Math.max(0.0005, Math.min(spacing0, spacingT));
    const flex = Math.max(base.limb, this.flexMax);
    const flutter = this.flutter;
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: 0, limb: lerp1(base.limb, flex, t * t), phase: base.phase, detail: 0.25 * t * t * flutter };
    };
    const children: Attachment[] = [];
    if (tentacles > 0 && p.tentacleLength > 0) {
      const colStep = TAU / N;
      const rows = Math.floor((0.92 * Lb) / spacing);
      let made = 0;
      for (let i = 0; i < rows && made < tentacles; i++) {
        const sk = Lp + (0.04 + 0.92 * ((i + 0.5) / rows)) * Lb;
        const u = (sk - Lp) / Lb;
        const wb: WindBase = { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot };
        if (i % 2 === 0) {
          for (const j0 of [N - 1, N / 2 - 1]) {
            const side = j0 === N - 1 ? 1 : -1;
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
              make: (ex) => this.makeTentacle(ex, wb, 1.35 * Math.pow(Math.sin(Math.PI * u), 0.4), line, sk, side, true),
            });
            made++;
          }
        } else {
          for (let c = 0; c < nFace; c++) {
            const j = 2 * (c + 1);
            const fr = line.at(sk);
            children.push({
              s: sk,
              az: (j + 0.5) * colStep,
              w: 1,
              h: 1,
              hh: 0.5 * spacing,
              fixed: true,
              optional: true,
              loopExit: true,
              normalHint: fr.up,
              j0: 0,
              row0: 0,
              row1: 0,
              make: (ex) => this.makeTentacle(ex, wb, 0.75 + 0.2 * this.detailRng.next(), line, sk, (j < N / 4 ? 1 : -1) * (Math.abs(j - N / 4) / Math.max(1, N / 4)), false),
            });
            made++;
          }
        }
      }
    }
    this.count(sundew ? 'sundew leaves' : 'blades');
    const extra: number[] = [];
    if (Lp > 0) extra.push(Lp, Lp + 0.08 * Lb);
    for (let k = 1; k <= 3; k++) extra.push(L - Lb * 0.12 * (1 - Math.cos((0.5 * Math.PI * k) / 4)));
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => {
        const t = clamp(s / L, 0, 1);
        const wv = widthAt(s);
        const c = s < Lp ? 0.35 * cup : cup * (1 - 0.3 * t);
        return archPoint(NN, j, wv, W * thk * (1 - 0.5 * t), c);
      },
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra,
      spacing,
      rowLattice: spacing,
      children,
      wind,
      pivot: base.pivot,
      r0: 0.5 * wNeck,
    };
  }

  /** Glue tentacle of a sundew: a thread with a glandular knob. */
  private makeTentacle(exit: Exit, base: WindBase, lenScale: number, leaf: Line, sLeaf: number, side: number, marginal: boolean): Organ {
    const p = this.p;
    const len = Math.max(0.0004, p.tentacleLength * lenScale * (0.9 + 0.2 * this.detailRng.next()));
    const rt = Math.max(0.00005, Math.min(p.tentacleRadius, 0.3 * exit.size));
    const fr = leaf.at(sLeaf);
    let dir0: V3;
    if (marginal) dir0 = normalize(add(add(scale(exit.normal, 0.8), scale(fr.up, 0.55)), scale(fr.dir, 0.1 * this.detailRng.uniform())));
    else dir0 = normalize(add(add(fr.up, scale(fr.right, 0.3 * side)), scale(fr.dir, 0.12 * this.detailRng.uniform())));
    const right0 = this.rightFromUp(dir0, fr.dir);
    const sStart = Math.min(0.35 * len, Math.max(this.collarLen(rt, 1.5), 0.3 * exit.size));
    const L = Math.max(len, sStart + 0.0004);
    const line = growLine(exit.pos, dir0, right0, L, 2, () => ({}));
    const rad = (s: number): number => {
      const t = clamp((s - sStart) / Math.max(1e-6, L - sStart), 0, 1);
      if (t < 0.7) return rt;
      return rt * (1 + 1.3 * Math.sin((Math.PI * (t - 0.7)) / 0.3));
    };
    this.count('tentacles');
    const span = L - sStart;
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
      extra: [sStart + 0.7 * span, sStart + 0.85 * span, sStart + 0.95 * span],
      spacing: L,
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0.15 * this.flutter }),
      pivot: base.pivot,
      r0: rt,
      collarRings: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Pitchers
  // ---------------------------------------------------------------------------

  /** Body radius of a pitcher at t ∈ [0, 1] from the species parameters (no neck blending). */
  private bodyRadius(Rb: number, Rm: number): (t: number) => number {
    const p = this.p;
    const taper = clamp(p.pitcherTaper, 0.2, 6);
    const belly = Math.max(0.3, p.pitcherBelly);
    const bw = Math.max(0.03, p.pitcherBellyWidth);
    const bp = clamp(p.pitcherBellyPos, 0, 1);
    const cobra = p.form === 'pitcher' && p.hood === 'cobra';
    const bulge = Math.max(1, p.headBulge);
    return (t: number): number => {
      const tt = clamp(t, 0, 1);
      let r = lerp1(Rb, Rm, Math.pow(tt, taper));
      if (belly !== 1) r *= 1 + (belly - 1) * Math.exp(-Math.pow((tt - bp) / bw, 2));
      if (cobra) r *= 1 + (bulge - 1) * Math.exp(-Math.pow((tt - 0.85) / 0.09, 2));
      return r;
    };
  }

  /** Section point of a pitcher (body with wing, rolled lip, inner wall going back down). */
  private pitcherPoint(g: PitcherGeom, s: number, j: number, N: number): { x: number; y: number; z?: number } {
    const th = (TAU * j) / N;
    const sM = g.s0 + g.Hp;
    if (s <= sM + 1e-9) {
      const t = (s - g.s0) / g.Hp;
      let r = g.R(t);
      if (g.wing > 0) {
        const hgt = g.wing * r * Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.6);
        const bump = (az: number): number => {
          const d = Math.abs(wrapAngle(th - az));
          return Math.pow(Math.max(0, 1 - d / 0.3), 1.3);
        };
        const b = g.wingPair ? Math.max(bump(g.wingAz - 0.24), bump(g.wingAz + 0.24)) : bump(g.wingAz);
        r += hgt * b;
      }
      return { x: r * Math.cos(th), y: r * Math.sin(th) };
    }
    const Rm = g.R(1);
    const lipArc = Math.PI * g.rho;
    let radial: number;
    let zAct: number;
    if (s <= sM + lipArc + 1e-9) {
      const psi = (s - sM) / g.rho;
      radial = Rm + g.rho * Math.sin(psi);
      zAct = g.rho * (1 - Math.cos(psi));
    } else {
      const d = s - sM - lipArc;
      zAct = 2 * g.rho - d;
      const tEq = clamp(1 - Math.max(0, d - 2 * g.rho) / g.Hp, 0, 1);
      radial = 0.92 * g.R(tEq);
    }
    return { x: radial * Math.cos(th), y: radial * Math.sin(th), z: zAct - (s - sM) };
  }

  /** Feature stations of a pitcher: dense body rings, the lip roll, the inner wall. */
  private pitcherStations(g: PitcherGeom, spacing: number): number[] {
    const out: number[] = [];
    const sM = g.s0 + g.Hp;
    const ds = Math.min(spacing, g.Hp / 16);
    const n = Math.max(1, Math.round(g.Hp / ds));
    for (let k = 1; k < n; k++) out.push(g.s0 + (g.Hp * k) / n);
    out.push(sM);
    for (const q of [0.25, 0.5, 0.75, 1]) out.push(sM + Math.PI * g.rho * q);
    return out;
  }

  private makeClumpPitcher(exit: Exit, Hp: number, base: WindBase, refine: boolean): Organ {
    const p = this.p;
    const cobra = p.hood === 'cobra';
    const Rb = Math.max(0.002, p.pitcherBase);
    const Rm = Math.max(Rb, p.pitcherMouth);
    const rNeck = Math.max(Rb, 0.42 * exit.size);
    const body = this.bodyRadius(Rb, Rm);
    const R = (t: number): number => Math.max(body(t), rNeck * (1 - smooth(t / 0.12)));
    const lean = p.pitcherLean * DEG2RAD * (1 + 0.15 * this.leafRng.uniform());
    const curve = p.pitcherCurve * DEG2RAD;
    const twist = p.pitcherTwist * DEG2RAD * (this.leafRng.next() < 0.5 ? -1 : 1);
    const bend = cobra ? p.headBend * DEG2RAD : 0;
    const dir0 = this.outDir(exit, lean);
    // up = outward (hood side), −up = towards the crown (wing side).
    const right0 = normalize(cross(exit.normal, dir0));
    const rho = Math.max(0.0005, p.peristome * Rm);
    const lipArc = Math.PI * rho;
    const Lin = Math.max(0.01, p.pitcherDepth * Hp);
    const Ltot = Hp + lipArc + Lin;
    const tB = Hp / Ltot;
    const line = growLine(exit.pos, dir0, right0, Ltot, 36, (t0, t1) => {
      const u0 = clamp(t0 / tB, 0, 1);
      const u1 = clamp(t1 / tB, 0, 1);
      const turn: { gravity?: number; roll?: number; pitch?: number } = {};
      if (curve) turn.gravity = -curve * (smooth(u1 / 0.75) - smooth(u0 / 0.75));
      if (twist) turn.roll = twist * (u1 - u0);
      if (bend) turn.pitch = bend * (smooth((u1 - 0.7) / 0.27) - smooth((u0 - 0.7) / 0.27));
      return turn;
    });
    const sStart = Math.min(0.15 * Hp, Math.max(this.collarLen(rNeck, 1.2), 0.6 * exit.size));
    const geom: PitcherGeom = { s0: 0, Hp, R, rho, Lin, wing: Math.max(0, p.wing), wingAz: 1.5 * Math.PI, wingPair: false };
    const N0 = exit.N;
    const N = refine ? 2 * N0 : N0;
    const spacing = Math.max(0.002, (p.ringAspect * TAU * Rm) / N);
    const flex = Math.max(base.limb, this.flexMax);
    const wind = (s: number): VertexWind => {
      const t = clamp(s / Hp, 0, 1);
      return { height: 0, limb: lerp1(base.limb, flex, Math.pow(t, 1.5)), phase: base.phase, detail: 0 };
    };
    const extra = this.pitcherStations(geom, spacing);
    const refineAt = refine ? 0.28 * Hp : -1;
    const children: Attachment[] = [];
    const colStep = TAU / N;
    const colW = colStep * Rm;
    // Hood from the back, just below the lip.
    if (!cobra && p.hoodLength > 0 && p.hoodWidth > 0) {
      const w = clamp(Math.round((0.3 * p.hoodWidth) / colW), 2, Math.max(2, Math.floor(N / 4)));
      const h = clamp(Math.round((0.3 * p.hoodLength) / spacing), 2, 4);
      const sH = Hp - (0.5 * h + 1.2) * spacing;
      children.push({
        s: sH,
        az: 0.5 * Math.PI,
        w,
        h,
        hh: 0.5 * h * spacing,
        priority: 2,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeHood(ex, { limb: wind(sH).limb, phase: base.phase, pivot: base.pivot }, p.hood === 'erect' ? 'erect' : 'over', p.hoodLength, p.hoodWidth),
      });
    }
    // Fishtail of a cobra lily: two lobes from the far lip of the mouth.
    if (cobra && p.fishtail > 0) {
      const w = clamp(Math.round((0.4 * p.fishtailWidth) / colW), 2, Math.max(2, Math.floor(N / 6)));
      const h = 2;
      const sF = Hp - (0.5 * h + 1.2) * spacing;
      for (const side of [-1, 1]) {
        children.push({
          s: sF,
          az: 0.5 * Math.PI + side * (0.5 * w + 1) * colStep,
          w,
          h,
          hh: 0.5 * h * spacing,
          priority: 2,
          j0: 0,
          row0: 0,
          row1: 0,
          make: (ex) => this.makeFishtailLobe(ex, { limb: wind(sF).limb, phase: base.phase, pivot: base.pivot }, side),
        });
      }
    }
    this.count('pitchers');
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => this.pitcherPoint(geom, s, j, NN),
      radius: (s) => R(clamp(s / Hp, 0, 1)),
      round: false,
      extra,
      spacing,
      refine: refineAt > 0 ? [refineAt] : undefined,
      children,
      wind,
      pivot: base.pivot,
      r0: rNeck,
    };
  }

  /** Hood of a pitcher: arching over the mouth ('over') or standing behind it as a ruffled collar ('erect'). */
  private makeHood(exit: Exit, base: WindBase, kind: 'over' | 'erect', Lh: number, Wh: number): Organ {
    const p = this.p;
    const angle = p.hoodAngle * DEG2RAD;
    const cup = p.hoodCup * DEG2RAD;
    let dir0: V3;
    if (kind === 'over') dir0 = normalize(add(scale(exit.normal, 0.3), UP));
    else dir0 = normalize(add(scale(exit.normal, Math.sin(angle)), scale(UP, Math.cos(angle))));
    // up = outward (away from the mouth): a positive pitch bends the hood over the mouth.
    const right0 = normalize(cross(exit.normal, dir0));
    const wave = kind === 'erect' ? 0.35 : 0.12;
    const ph = this.detailRng.next() * TAU;
    const spec: FlapSpec = {
      level: 2,
      L: Math.max(0.004, Lh),
      W: Math.max(0.003, Wh),
      thk: 0.05,
      dir0,
      right0,
      turn: (t0, t1) => {
        if (kind === 'over') return { pitch: angle * (smooth((t1 - 0.22) / 0.55) - smooth((t0 - 0.22) / 0.55)), roll: wave * (Math.sin(4 * t1 + ph) - Math.sin(4 * t0 + ph)) };
        return { pitch: -0.3 * angle * (t1 * t1 - t0 * t0), roll: wave * (Math.sin(5 * t1 + ph) - Math.sin(5 * t0 + ph)) };
      },
      outline: (t) => {
        if (kind === 'over') return t < 0.25 ? lerp1(0.3, 0.45, t / 0.25) : t < 0.55 ? lerp1(0.45, 1, smooth((t - 0.25) / 0.3)) : Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.55) / 0.45, 2)));
        return t < 0.4 ? lerp1(0.35, 1, smooth(t / 0.4)) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.4) / 0.6, 2)), 0.5);
      },
      cup: -cup,
      base,
      flutter: 0.2,
      name: 'hoods',
    };
    return this.makeFlap(exit, spec);
  }

  /** One lobe of a cobra lily's fishtail, hanging from the lip and spreading sideways. */
  private makeFishtailLobe(exit: Exit, base: WindBase, side: number): Organ {
    const p = this.p;
    const spreadA = 32 * DEG2RAD;
    const sideways = normalize(cross(exit.normal, UP));
    const down = { x: 0, y: -1, z: 0 };
    const dir0 = normalize(add(add(scale(exit.normal, 0.55), scale(down, 0.8)), scale(sideways, side * Math.sin(spreadA))));
    const right0 = this.rightFromUp(dir0, exit.normal);
    const spec: FlapSpec = {
      level: 2,
      L: Math.max(0.005, p.fishtail),
      W: Math.max(0.003, p.fishtailWidth),
      thk: 0.05,
      dir0,
      right0,
      turn: (t0, t1) => ({ gravity: 0.5 * (t1 - t0), roll: side * 0.6 * (t1 - t0), yaw: side * 0.35 * (smooth(t1 / 0.5) - smooth(t0 / 0.5)) }),
      outline: (t) => (t < 0.45 ? lerp1(0.4, 1, smooth(t / 0.45)) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.45) / 0.55, 2.2)), 0.55)),
      cup: -0.5,
      base,
      flutter: 0.3,
      name: 'fishtail lobes',
    };
    return this.makeFlap(exit, spec);
  }

  /** Lid of a Nepenthes pitcher, hinged at the back of the rim and held open over the mouth. */
  private makeLid(exit: Exit, base: WindBase): Organ {
    const p = this.p;
    const a = p.hoodAngle * DEG2RAD;
    // exit.normal points backwards (out of the dorsal wall): the lid leans forward over the mouth.
    const fwd = normalize(scale(projectOnPlane(exit.normal, UP), -1));
    const dir0 = normalize(add(scale(fwd, Math.cos(a)), scale(UP, Math.sin(a))));
    const right0 = this.rightFromUp(dir0, normalize(add(scale(UP, Math.cos(a)), scale(fwd, -Math.sin(a)))));
    const spec: FlapSpec = {
      level: 2,
      L: Math.max(0.004, p.hoodLength),
      W: Math.max(0.003, p.hoodWidth),
      thk: 0.05,
      dir0,
      right0,
      turn: (t0, t1) => ({ pitch: 0.35 * (t1 * t1 - t0 * t0) }),
      outline: (t) => (t < 0.35 ? lerp1(0.45, 1, smooth(t / 0.35)) : Math.pow(Math.max(0, 1 - Math.pow((t - 0.35) / 0.65, 2)), 0.5)),
      cup: -p.hoodCup * DEG2RAD,
      base,
      flutter: 0.15,
      name: 'lids',
    };
    return this.makeFlap(exit, spec);
  }

  /** Generic blade-like child: hood, lid, fishtail lobe. Doubles its ring once when the window is small. */
  private makeFlap(exit: Exit, v: FlapSpec): Organ {
    const { L, W } = v;
    const N0 = exit.N;
    const refine = N0 < 16;
    const N = refine ? 2 * N0 : N0;
    const line = growLine(exit.pos, v.dir0, v.right0, L, 14, v.turn);
    const w0 = Math.min(W * v.outline(0), Math.max(0.9 * exit.size, 0.2 * W));
    const sStart = Math.min(0.2 * L, Math.max(this.collarLen(0.5 * w0, 1.2), 0.6 * exit.size));
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      const neck = w0 + (W - w0) * smooth(t / 0.3);
      return Math.max(0.05 * W, Math.min(neck, W * Math.max(0.05, v.outline(t))));
    };
    const spacing = Math.max(0.0015, (this.p.ringAspect * 2 * W) / N);
    const flex = Math.max(v.base.limb, this.flexMax);
    const refineAt = refine ? Math.max(sStart + 1.2 * spacing, 0.22 * L) : -1;
    const extra: number[] = [];
    for (let k = 1; k <= 3; k++) extra.push(L - L * 0.15 * (1 - Math.cos((0.5 * Math.PI * k) / 4)));
    this.count(v.name);
    return {
      level: v.level,
      line,
      sStart,
      profile: (s, j, NN) => {
        const t = clamp(s / L, 0, 1);
        return archPoint(NN, j, widthAt(s), W * v.thk * (1 - 0.5 * t), v.cup * smooth(t / 0.4));
      },
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra,
      spacing,
      refine: refineAt > 0 && refineAt < L - 2 * spacing ? [refineAt] : undefined,
      children: [],
      wind: (s) => {
        const t = clamp(s / L, 0, 1);
        return { height: 0, limb: lerp1(v.base.limb, flex, t * t), phase: v.base.phase, detail: v.flutter * t * this.flutter };
      },
      pivot: v.base.pivot,
      r0: 0.5 * w0,
    };
  }

  // ---------------------------------------------------------------------------
  // Scapes and flowers
  // ---------------------------------------------------------------------------

  /** Flower scape: a thin stalk whose tip nods and opens into the terminal flower, lateral flowers along its top. */
  private makeScape(exit: Exit, base: WindBase): Organ {
    const p = this.p;
    const r = Math.max(0.0004, p.scapeRadius);
    const Ls = Math.max(0.02, p.scapeHeight * (1 + 0.12 * this.rng.uniform()));
    const Rf = Math.max(0.001, p.flowerRadius);
    const Lf = Math.max(0.002, p.flowerLength);
    const isBell = Lf >= 1.1 * Rf;
    const Lin = isBell ? 0.45 * Lf : 0;
    const Lm = Ls + Lf;
    const L = Lm + Lin;
    const tM = Lm / L;
    const N = 8;
    const nod = clamp(p.flowerNod, 0, 170) * DEG2RAD;
    const dir0 = normalize(add(scale(exit.normal, 0.4), UP));
    let right0 = projectOnPlane(cross(UP, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    // Sundews carry a one-sided raceme on an arching scape; the others hold their flowers in a terminal cluster.
    const raceme = p.form === 'rosette' && p.trap === 'tentacle' && p.flowers > 2;
    const arch = raceme ? 0.5 : 0.08;
    const nodFrom = tM - Math.min(0.5, (2.5 * Lf) / L);
    const line = growLine(exit.pos, dir0, right0, L, 24, (t0, t1) => ({
      gravity: -0.22 * (smooth(t1 / 0.3) - smooth(t0 / 0.3)) + arch * (Math.pow(Math.min(t1, tM), 2.5) - Math.pow(Math.min(t0, tM), 2.5)) + nod * (smooth((t1 - nodFrom) / (tM - nodFrom)) - smooth((t0 - nodFrom) / (tM - nodFrom))),
    }));
    const sStart = Math.max(this.collarLen(r, 1.6), 0.5 * exit.size);
    const cell = Math.max(0.0015, (p.ringAspect * TAU * r * 1.6) / N);
    const bell = this.flowerProfile(1.3 * r, Rf, Lf);
    const rad = (s: number): number => (s < Ls ? r * (1 - 0.25 * clamp(s / Ls, 0, 1)) : s <= Lm ? bell((s - Ls) / Lf) : lerp1(0.82 * bell(1), 0.25 * Rf, smooth((s - Lm) / Lin)));
    const flex = this.flexMax;
    const wind = (s: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: 0, limb: flex * t * t, phase: base.phase, detail: 0.15 * t * this.flutter };
    };
    const children: Attachment[] = [];
    const flowers = Math.max(0, Math.round(p.flowers));
    if (flowers > 0) {
      const sF1 = Ls - 2 * cell;
      const perRow = raceme ? 1 : 2;
      const rows = Math.max(1, Math.ceil(flowers / perRow));
      // A raceme packs its flowers a few cells apart; a terminal cluster spreads them along the top of the scape.
      const rowPitch = raceme ? Math.max(2 * cell, Math.min(4 * cell, (0.4 * Ls) / rows)) : Math.max(2 * cell, Math.min(0.12 * Ls, (0.35 * Ls) / rows));
      const sF0 = sF1 - rows * rowPitch;
      let k = 0;
      for (let row = 0; row < rows && k < flowers; row++) {
        for (let c = 0; c < perRow && k < flowers; c++) {
          // Opposite pairs, alternating by a quarter turn; a raceme keeps to one side (columns 1 and 2, i.e. −up).
          const j0 = raceme ? 1 + (row % 2) : (2 * (row % 2) + 4 * c) % N;
          const s = sF0 + row * rowPitch + 0.5 * cell;
          const sk = s;
          children.push({
            s,
            az: (j0 + 1) * (TAU / N),
            w: 2,
            h: 1,
            hh: 0.5 * cell,
            fixed: true,
            optional: true,
            j0: 0,
            row0: 0,
            row1: 0,
            make: (ex) => this.makeFlower(ex, { limb: wind(sk).limb, phase: base.phase, pivot: base.pivot }, 0.75),
          });
          k++;
        }
      }
    }
    this.count('scapes');
    const starFrom = 0.55;
    const starDepth = isBell ? 0.2 : 0.32;
    const refineAt = Ls - 1.5 * cell;
    const refines: number[] = [];
    if (Rf > 6 * r && refineAt - 2 * cell > sStart + 2 * cell) refines.push(refineAt - 2 * cell);
    if (refineAt > sStart + 2 * cell) refines.push(refineAt);
    const extra: number[] = [Ls];
    for (let k = 1; k <= 9; k++) extra.push(Ls + (Lf * k) / 10);
    if (isBell) for (let k = 0; k < 4; k++) extra.push(Lm + (Lin * k) / 4);
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => {
        const rr = rad(s);
        if (s <= Ls) {
          const th = (TAU * j) / NN;
          return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
        }
        const tf = clamp((s - Ls) / Lf, 0, 1);
        const depthStar = starDepth * smooth((tf - starFrom) / (1 - starFrom)) * (s > Lm ? 0.5 : 1);
        const pt = ribbedPoint(NN, j, rr, 5, depthStar, 1);
        return s > Lm ? { x: pt.x, y: pt.y, z: -2 * (s - Lm) } : pt;
      },
      radius: rad,
      round: true,
      extra,
      spacing: cell,
      rowLattice: cell,
      refine: refines.length > 0 ? refines : undefined,
      children,
      wind,
      pivot: base.pivot,
      r0: r,
    };
  }

  /**
   * Radius of a flower along its length: a flat five-pointed star opening from
   * the ovary (flytraps, sundews) or, when it is longer than wide, a nodding
   * globe or bell with a narrower mouth (pitcher plants, butterworts).
   */
  private flowerProfile(r0: number, Rf: number, Lf: number): (tf: number) => number {
    if (Lf >= 1.1 * Rf) {
      return (tf: number): number => {
        const t = clamp(tf, 0, 1);
        // A hanging bell: widest at two thirds of its length, the mouth stays open at 0.85 R.
        const bell = Rf * (0.3 + 0.7 * Math.sin(Math.PI * (0.08 + 0.62 * t)));
        return Math.max(r0, lerp1(r0, bell, smooth(t / 0.25)));
      };
    }
    // A dish: the petals open quickly from the ovary and flatten out towards the rim.
    return (tf: number): number => lerp1(r0, Rf, Math.pow(clamp(tf, 0, 1), 0.55)) * (1 - 0.08 * Math.sin(Math.PI * clamp(tf, 0, 1)));
  }

  /** Lateral flower on a short pedicel: a nodding five-lobed star or bell. */
  private makeFlower(exit: Exit, base: WindBase, sizeF: number): Organ {
    const p = this.p;
    const Rf = Math.max(0.0008, p.flowerRadius * sizeF);
    const Lf = Math.max(0.0015, p.flowerLength * sizeF);
    const rp = Math.max(0.0002, Math.min(0.35 * Rf, 0.3 * exit.size));
    const Lp = Math.max(1.5 * Rf, 2.5 * exit.size);
    // A bell is really open: past the rim the wall folds back up inside the corolla (`Lin`).
    const isBell = Lf >= 1.1 * Rf;
    const Lin = isBell ? 0.45 * Lf : 0;
    const Lm = Lp + Lf;
    const L = Lm + Lin;
    const nod = clamp(p.flowerNod, 0, 170) * DEG2RAD;
    const dir0 = normalize(add(scale(exit.normal, 1), scale(UP, 0.5)));
    let right0 = projectOnPlane(cross(UP, exit.normal), dir0);
    right0 = lengthSq(right0) < 1e-12 ? anyPerpendicular(dir0) : normalize(right0);
    const tP = Lp / L;
    const tM = Lm / L;
    const line = growLine(exit.pos, dir0, right0, L, 10, (t0, t1) => ({ gravity: nod * (smooth((t1 - 0.4 * tP) / (tM - 0.4 * tP)) - smooth((t0 - 0.4 * tP) / (tM - 0.4 * tP))) }));
    const sStart = Math.min(0.3 * Lp, Math.max(this.collarLen(rp, 1.5), 0.3 * exit.size));
    const bell = this.flowerProfile(1.3 * rp, Rf, Lf);
    const rad = (s: number): number => (s < Lp ? rp : s <= Lm ? bell((s - Lp) / Lf) : lerp1(0.82 * bell(1), 0.25 * Rf, smooth((s - Lm) / Lin)));
    const starDepth = isBell ? 0.2 : 0.32;
    this.count('flowers');
    const extra: number[] = [Lp];
    for (let k = 1; k <= 6; k++) extra.push(Lp + (Lf * k) / 7);
    if (isBell) for (let k = 0; k < 3; k++) extra.push(Lm + (Lin * k) / 3);
    // Two refinement bands (6 → 24 sides) so five lobes read on a flower much wider than its pedicel.
    const refineAt = Lp - 0.3 * Lf;
    const refines: number[] = [];
    const refine2 = refineAt - Math.max(0.3 * Lf, 0.0025);
    if (Rf > 5 * rp && refine2 > sStart + 0.002) refines.push(refine2);
    if (refineAt > sStart + 0.002) refines.push(refineAt);
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
        const tf = clamp((s - Lp) / Lf, 0, 1);
        const pt = ribbedPoint(N, j, rr, 5, starDepth * smooth((tf - 0.55) / 0.45) * (s > Lm ? 0.5 : 1), 1);
        // Inside the bell: the ring centre keeps advancing along the line, the surface goes back in.
        return s > Lm ? { x: pt.x, y: pt.y, z: -2 * (s - Lm) } : pt;
      },
      radius: rad,
      round: true,
      extra,
      spacing: Math.max(0.5 * Lp, 0.002),
      refine: refines.length > 0 ? refines : undefined,
      children: [],
      wind: () => ({ height: 0, limb: base.limb, phase: base.phase, detail: 0.2 * this.flutter }),
      pivot: base.pivot,
      r0: rp,
      collarRings: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Nepenthes: a scrambling stem whose leaves run out into tendrils and pitchers
  // ---------------------------------------------------------------------------

  private buildVine(): void {
    const p = this.p;
    const r = Math.max(0.002, p.radius);
    const N = evenSides(p.sides, 8, 24);
    const depth = 0.04 + 2 * r;
    const H = Math.max(0.1, p.height * (1 + p.heightV * this.rng.uniform()));
    const L = depth + H;
    const { loop, exit } = this.baseRing({ x: 0, y: -depth, z: 0 }, 0.95 * r, N);
    const sStart = 0.3 * depth;
    const lean = clamp(p.lean, 0, 85) * DEG2RAD;
    const azL = this.rng.next() * TAU;
    const A = { x: Math.cos(azL), y: 0, z: Math.sin(azL) };
    const dir0 = normalize(add(scale(UP, Math.cos(0.05)), scale(A, Math.sin(0.05))));
    const wobble = this.rng.fork();
    const line = growLine(exit.pos, dir0, normalize(cross(UP, A)), L, 30, (t0, t1) => ({
      gravity: lean * (Math.pow(t1, 1.8) - Math.pow(t0, 1.8)),
      yaw: 0.5 * wobble.uniform() * (t1 - t0) * 6,
    }));
    const rad = (s: number): number => {
      const t = clamp((s - depth) / H, -1, 1);
      return r * (1 - 0.45 * smooth(Math.max(0, t))) * (t > 0.96 ? Math.max(0.15, 1 - (t - 0.96) / 0.04) : 1);
    };
    const n = Math.max(0, Math.round(p.leaves));
    const leafN = evenSides(p.leafSides, 8, 16);
    const { w, h } = this.leafWindow(leafN);
    const spacing = Math.max(0.0015, (p.ringAspect * TAU * r) / N);
    const sFrom = depth + 0.1 * H;
    const sTo = L - 0.06 * H;
    const slots = this.latticeSlots(n, N, w, h, sFrom, sTo, spacing, 1, this.leafRng);
    const phase = this.rng.next();
    const children: Attachment[] = [];
    for (const slot of slots) {
      const f = slot.f;
      const Lb = Math.max(0.03, p.leafLength * (1 + p.leafLengthV * this.leafRng.uniform()) * lerp1(1, 0.6, smooth((f - 0.75) / 0.25)));
      const Hp = Math.max(0.02, p.pitcherHeight * (1 + p.pitcherHeightV * this.leafRng.uniform()) * lerp1(1, 0.5, smooth((f - 0.7) / 0.3)));
      const Lt = Math.max(0.02, p.tendrilLength * (1 + 0.2 * this.leafRng.uniform()));
      const spread = lerp1(p.leafSpread, p.leafSpreadTop, f) * DEG2RAD;
      const sk = slot.s;
      children.push({
        s: sk,
        az: slot.az,
        w,
        h,
        hh: 0.5 * h * spacing,
        priority: 1,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeVineLeaf(ex, { Lb, Lt, Hp, spread, withPitcher: f < 0.92 }, { limb: this.flexMax * Math.pow(clamp((sk - depth) / H, 0, 1), 1.5), phase: this.leafRng.next(), pivot: { x: 0, y: 0, z: 0 } }),
      });
    }
    this.count('stem');
    const flex = this.flexMax;
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
      extra: [L - 0.04 * H, L - 0.02 * H],
      spacing,
      rowLattice: spacing,
      children,
      wind: (s) => ({ height: 0, limb: flex * Math.pow(clamp((s - depth) / H, 0, 1), 1.5), phase, detail: 0 }),
      pivot: { x: 0, y: 0, z: 0 },
      r0: r,
    };
    this.meshTube(organ, loop, exit, 1);
  }

  /** One Nepenthes leaf: blade → tendril hooking back up → upright pitcher with its lid, all one tube. */
  private makeVineLeaf(exit: Exit, v: { Lb: number; Lt: number; Hp: number; spread: number; withPitcher: boolean }, base: WindBase): Organ {
    const p = this.p;
    const { Lb, Lt, Hp } = v;
    const N0 = exit.N;
    const dir0 = this.outDir(exit, v.spread);
    const right0 = this.levelRight(exit, dir0);
    const droop = p.leafDroop * DEG2RAD;
    const W = Math.max(0.004, p.leafWidth);
    const rt = Math.max(0.0004, p.tendrilRadius);
    const Rb = Math.max(rt, p.pitcherBase);
    const Rm = Math.max(Rb, p.pitcherMouth);
    const rho = Math.max(0.0005, p.peristome * Rm);
    const lipArc = Math.PI * rho;
    const Lin = Math.max(0.01, p.pitcherDepth * Hp);
    const withP = v.withPitcher;
    const Ltot = withP ? Lb + Lt + Hp + lipArc + Lin : Lb + Lt;
    const sT0 = Lb;
    const sP0 = Lb + Lt;
    // Elevation profile of the tendril: continues the drooped blade, falls to −72°, hooks back up to vertical.
    const elev0 = Math.asin(clamp(dir0.y, -1, 1));
    const phiStart = elev0 - droop;
    const phiLow = -72 * DEG2RAD;
    const phiEnd = 89 * DEG2RAD;
    const phi = (u: number): number => (u < 0.5 ? lerp1(phiStart, phiLow, smooth(u / 0.5)) : lerp1(phiLow, phiEnd, smooth((u - 0.5) / 0.5)));
    const yawT = 0.4 * this.leafRng.uniform();
    const line = growLine(exit.pos, dir0, right0, Ltot, 60, (t0, t1) => {
      const s0 = t0 * Ltot;
      const s1 = t1 * Ltot;
      if (s1 <= sT0) return { gravity: droop * (Math.pow(s1 / Lb, 1.6) - Math.pow(s0 / Lb, 1.6)) };
      if (s0 >= sP0) return {};
      const u0 = clamp((s0 - sT0) / Lt, 0, 1);
      const u1 = clamp((s1 - sT0) / Lt, 0, 1);
      const g = s0 < sT0 ? droop * (1 - Math.pow(s0 / Lb, 1.6)) : 0;
      return { gravity: g - (phi(u1) - phi(u0)), yaw: yawT * (u1 - u0) };
    });
    const wNeck = Math.min(0.5 * W, Math.max(0.9 * exit.size, 0.25 * W));
    const sStart = Math.min(0.15 * Lb, Math.max(this.collarLen(0.5 * wNeck, 1.2), 0.6 * exit.size));
    const bladeWidth = (s: number): number => {
      const u = clamp(s / Lb, 0, 1);
      const neck = wNeck + (W - wNeck) * smooth(u / 0.3);
      const outline = W * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (u - 0.3) / 0.7), 1.4)), 0.8);
      return Math.max(2.2 * rt, Math.min(neck, outline));
    };
    const body = this.bodyRadius(Rb, Rm);
    const R = (t: number): number => lerp1(rt, body(t), smooth(t / 0.1));
    const geom: PitcherGeom = { s0: sP0, Hp, R, rho, Lin, wing: Math.max(0, p.wing), wingAz: 0.5 * Math.PI, wingPair: true };
    const thk = clamp(p.leafThickness, 0.01, 0.4);
    const cup = p.leafCup * DEG2RAD;
    const spacing = Math.max(0.002, (p.ringAspect * 2 * W) / N0);
    const refineAt = withP ? sP0 - 1.5 * spacing : -1;
    const extra: number[] = [Lb];
    for (let k = 1; k <= 3; k++) extra.push(Lb - Lb * 0.14 * (1 - Math.cos((0.5 * Math.PI * k) / 4)));
    if (withP) {
      extra.push(sP0, sP0 + 0.4 * spacing);
      for (const s of this.pitcherStations(geom, spacing)) if (s > sP0 + 0.6 * spacing) extra.push(s);
    } else {
      extra.push(Ltot - 0.3 * spacing);
    }
    const flex = Math.max(base.limb, this.flexMax);
    const wind = (s: number): VertexWind => {
      const t = clamp(s / (Lb + Lt), 0, 1);
      return { height: 0, limb: lerp1(base.limb, flex, t * t), phase: base.phase, detail: (s < Lb ? 0.3 * t : 0.1) * this.flutter };
    };
    const children: Attachment[] = [];
    if (withP && p.hoodLength > 0 && p.hoodWidth > 0) {
      const N = 2 * N0;
      const colW = (TAU / N) * Rm;
      const w = clamp(Math.round((0.35 * p.hoodWidth) / colW), 2, Math.max(2, Math.floor(N / 4)));
      const h = 2;
      const sL = sP0 + Hp - (0.5 * h + 1.2) * spacing;
      children.push({
        s: sL,
        az: 1.5 * Math.PI,
        w,
        h,
        hh: 0.5 * h * spacing,
        priority: 2,
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => this.makeLid(ex, { limb: flex, phase: base.phase, pivot: base.pivot }),
      });
    }
    this.count('vine leaves');
    if (withP) this.count('pitchers');
    return {
      level: 1,
      line,
      sStart,
      profile: (s, j, NN) => {
        if (s < sT0) {
          const u = s / Lb;
          const q = archPoint(NN, j, bladeWidth(s), W * thk * (1 - 0.5 * u), cup * (1 - 0.3 * u));
          // Blend the blade into the round tendril over its last part.
          const b = smooth((u - 0.86) / 0.14);
          if (b <= 0) return q;
          const th = (TAU * j) / NN;
          const rc = lerp1(0.5 * bladeWidth(s), rt, b);
          return { x: lerp1(q.x, rc * Math.cos(th), b), y: lerp1(q.y, rc * Math.sin(th), b) };
        }
        if (s < sP0 || !withP) {
          const th = (TAU * j) / NN;
          const rr = withP ? rt : rt * (1 - 0.6 * clamp((s - sP0 + 0.3 * spacing) / (0.3 * spacing), 0, 1));
          return { x: rr * Math.cos(th), y: rr * Math.sin(th) };
        }
        return this.pitcherPoint(geom, s, j, NN);
      },
      radius: (s) => (s < sT0 ? 0.5 * bladeWidth(s) : s < sP0 || !withP ? rt : R(clamp((s - sP0) / Hp, 0, 1))),
      round: false,
      extra,
      spacing,
      refine: refineAt > 0 ? [refineAt] : undefined,
      children,
      wind,
      pivot: base.pivot,
      r0: 0.5 * wNeck,
    };
  }
}
