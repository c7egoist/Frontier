/**
 * Grass mesher.
 *
 * A grass plant is built with the same discipline as the trees: ONE closed
 * quad manifold. The crown (tussock base) is a grid dome; every blade, culm,
 * culm leaf, rachis branchlet, spikelet and awn is a closed tube that leaves
 * its parent through a rectangular window cut into the parent's ring grid and
 * is welded to it with collar loops. Nothing is intersected, instanced or
 * merged, so the topology validator reports a single genus-0 surface and the
 * wind deformation is continuous from the soil to the tip of every awn.
 *
 * Organ levels (for the Levels view and the GLB TEXCOORD_1 channel):
 *   0 crown · 1 culms (incl. the rachis) · 2 blades and culm leaves ·
 *   3 inflorescence parts (branchlets, bristles, spikelets, awns).
 */

import { VertexWind } from '../tree/mesh';
import { Random } from '../core/random';
import { V3, UP, TAU, DEG2RAD, add, cross, normalize, clamp, mod, scale } from '../core/math';
import { growLine } from './line';
import { GrassParams, grassHeight } from './grassParams';
import { OrganMesher, OrganStats, OrganBuildResult, Exit, Organ, Attachment, PadWindow, PadSpec, evenSides, windowFor, bladePoint } from './organMesher';

export { bladePoint } from './organMesher';

export interface GrassStats extends OrganStats {
  culms: number;
  blades: number;
}

export interface GrassBuildResult extends OrganBuildResult {
  stats: GrassStats;
}

type HeadVals = { length: number; droop: number; secondaries: number; bodyR: number; awnL: number; angle: number; rb: number; phase: number };

const GOLDEN = 2.399963229728653; // 137.5°

export class GrassMesher extends OrganMesher {
  readonly stats: GrassStats = { organs: 0, junctions: 0, dropped: 0, dropReasons: {}, perLevel: [0, 0, 0, 0], counts: {}, culms: 0, blades: 0 };
  private readonly g: GrassParams;
  private readonly rng: Random;
  private readonly bladeRng: Random;
  private readonly culmRng: Random;
  private readonly headRng: Random;

  constructor(g: GrassParams, seed: number) {
    super();
    this.g = g;
    this.collarRingsDefault = g.collarRings;
    this.rng = new Random((seed ^ 0x6ea55c0d) >>> 0);
    this.bladeRng = this.rng.fork();
    this.culmRng = this.rng.fork();
    this.headRng = this.rng.fork();
  }

  build(): GrassBuildResult {
    this.plantH = Math.max(0.05, grassHeight(this.g));
    this.flutter = clamp(this.plantH / 1.5, 0.15, 1);
    this.meshCrown();
    const r = this.finish();
    return { ...r, stats: this.stats };
  }

  // ---------------------------------------------------------------------------
  // Crown: a grid dome with the tillers laid out on a lattice of windows
  // ---------------------------------------------------------------------------

  private meshCrown(): void {
    const g = this.g;
    const R = Math.max(0.01, g.crownRadius);
    const sink = Math.max(0, g.crownSink) + 0.004;
    const H = Math.max(0, g.crownHeight);
    const prof = Math.max(1.2, g.crownProfile);

    // Window shapes.
    const bladeN = evenSides(g.bladeSides, 4, 8);
    const culmN = evenSides(g.culmSides, 6, 12);
    const bw = windowFor(bladeN);
    const cw = windowFor(culmN);
    const pitch = Math.max(bw.w, bw.h) + 1;
    const bsx = Math.ceil((cw.w + 1) / pitch);
    const bsy = Math.ceil((cw.h + 1) / pitch);
    const blades = Math.max(0, Math.round(g.blades));
    const culms = Math.max(0, Math.round(g.culms));
    const need = blades + culms * bsx * bsy;
    const S = Math.max(bsx + 1, bsy + 1, Math.ceil(Math.sqrt((Math.max(1, need) * 1.18) / 0.7)));
    const K = S * pitch + 2;

    // Dome geometry: the root ball carries the rim straight down, inset, and is closed below ground.
    const depth = Math.max(0.02, 0.35 * R);
    const sp: PadSpec = { R, H, sink, prof, K, below: [{ depth: sink + depth, scale: 0.8 }] };
    const domePoint = (u01: number, v01: number): V3 => this.domePoint(sp, u01, v01);

    // Sites: one per pitch×pitch block of cells.
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

    const windows: PadWindow[] = [];
    const rngL = this.rng;

    // Culms first: they claim blocks of sites in the middle of the tuft.
    let culmsPlaced = 0;
    for (let c = 0; c < culms; c++) {
      let placed = false;
      for (let attempt = 0; attempt < 120 && !placed; attempt++) {
        const i = rngL.int(Math.max(1, S - bsx + 1));
        const k = rngL.int(Math.max(1, S - bsy + 1));
        const centre = sites[Math.min(S - 1, i + (bsx - 1) / 2) | 0][Math.min(S - 1, k + (bsy - 1) / 2) | 0];
        if (centre.r > 0.82 && attempt < 100) continue;
        let ok = true;
        for (let a = i; a < i + bsx && ok; a++) for (let b = k; b < k + bsy; b++) if (a >= S || b >= S || !sites[a][b].free) ok = false;
        if (!ok) continue;
        for (let a = i; a < i + bsx; a++) for (let b = k; b < k + bsy; b++) sites[a][b].free = false;
        const a0 = 1 + i * pitch + Math.floor((bsx * pitch - cw.w) / 2);
        const b0 = 1 + k * pitch + Math.floor((bsy * pitch - cw.h) / 2);
        const rc = this.culmRng;
        const vals = {
          lean: g.culmLean + g.culmLeanV * rc.uniform(),
          az: centre.az + rc.uniform() * 1.0,
          height: g.culmHeight * (1 + g.culmHeightV * rc.uniform()),
          phase: rc.next(),
          curveJ: rc.uniform(),
          leafAz: rc.next() * TAU,
        };
        windows.push({ a0, b0, w: cw.w, h: cw.h, make: (exit) => this.makeCulm(exit, vals) });
        placed = true;
        culmsPlaced++;
      }
      if (!placed) this.drop('no room on crown');
    }

    // Blades: weighted choice of the remaining sites.
    const free: Site[] = [];
    for (const row of sites) for (const s of row) if (s.free) free.push(s);
    const bias = g.centreBias;
    const keyed = free.map((s) => {
      const wgt = bias >= 0 ? Math.exp(-3 * bias * s.r) : Math.exp(3 * bias * (1 - s.r));
      return { s, key: -Math.log(Math.max(1e-9, rngL.next())) / Math.max(1e-6, wgt) };
    });
    keyed.sort((a, b) => a.key - b.key);
    const nBlades = Math.min(blades, keyed.length);
    if (nBlades < blades) this.drop('no room on crown', blades - nBlades);
    for (let n = 0; n < nBlades; n++) {
      const s = keyed[n].s;
      s.free = false;
      const rb = this.bladeRng;
      const az = s.az + rb.uniform() * (0.6 + 1.6 * (1 - s.r));
      const lean = (g.lean * (0.25 + 0.75 * s.r) + g.leanV * rb.uniform()) * DEG2RAD;
      const vals = {
        az,
        lean,
        length: Math.max(0.01, g.bladeLength * (1 + g.bladeLengthV * rb.uniform())),
        width: Math.max(0.0005, g.bladeWidth * (1 + 0.15 * rb.uniform())),
        droop: (g.droop + g.droopV * rb.uniform()) * DEG2RAD,
        twist: (g.twist + g.twistV * rb.uniform()) * DEG2RAD * (rb.next() < 0.5 ? -1 : 1),
        wavePhase: rb.next(),
        phase: rb.next(),
      };
      // A 1×2 window has its long side along the blade's width axis, which is
      // perpendicular to the lean direction (the blade leans in its normal plane).
      let w = bw.w;
      let h = bw.h;
      if (w !== h) {
        const leanAlongX = Math.abs(Math.cos(az)) >= Math.abs(Math.sin(az));
        w = leanAlongX ? Math.min(bw.w, bw.h) : Math.max(bw.w, bw.h);
        h = leanAlongX ? Math.max(bw.w, bw.h) : Math.min(bw.w, bw.h);
      }
      const a0 = 1 + s.i * pitch + Math.floor((pitch - w) / 2);
      const b0 = 1 + s.k * pitch + Math.floor((pitch - h) / 2);
      windows.push({ a0, b0, w, h, make: (exit) => this.makeBlade(exit, { ...vals, level: 2, limb0: 0, pivot: exit.pos, segments: g.bladeSegments }) });
    }
    this.stats.culms = culmsPlaced;
    this.stats.blades = nBlades;

    this.meshPad(sp, windows);
  }

  // ---------------------------------------------------------------------------
  // Organs
  // ---------------------------------------------------------------------------

  private makeBlade(
    exit: Exit,
    o: {
      az: number;
      lean: number;
      length: number;
      width: number;
      droop: number;
      twist: number;
      wavePhase: number;
      phase: number;
      level: number;
      limb0: number;
      pivot: V3;
      segments: number;
      dir0?: V3;
      right0?: V3;
    },
  ): Organ {
    const g = this.g;
    const L = o.length;
    let dir0: V3;
    let right0: V3;
    if (o.dir0 && o.right0) {
      dir0 = o.dir0;
      right0 = o.right0;
    } else {
      const A = { x: Math.cos(o.az), y: 0, z: Math.sin(o.az) };
      dir0 = normalize(add(scale(UP, Math.cos(o.lean)), scale(A, Math.sin(o.lean))));
      right0 = normalize(cross(UP, A));
    }
    const steps = Math.max(6, Math.round(o.segments) * 2);
    const p = Math.max(1, g.droopPower);
    const W = g.wave * DEG2RAD;
    const line = growLine(exit.pos, dir0, right0, L, steps, (t0, t1) => ({
      gravity: o.droop * (Math.pow(t1, p) - Math.pow(t0, p)),
      roll: o.twist * (t1 - t0),
      yaw: W * (Math.sin(TAU * (1.5 * t1 + o.wavePhase)) - Math.sin(TAU * (1.5 * t0 + o.wavePhase))),
    }));
    const taperP = 1 + 3 * clamp(g.bladeTaper, 0, 1);
    const keel = clamp(g.keel, 0, 1);
    const rolled = clamp(g.rolled, 0, 1);
    const thick = Math.max(0.02, g.bladeThickness);
    const halfW0 = o.width * 0.5;
    const sStart = Math.min(0.35 * L, Math.max(1.6 * halfW0, 1.0 * exit.size, this.collarLen(halfW0)));
    const limb0 = o.limb0;
    const flutter = this.flutter;
    const wind = (s: number, y: number): VertexWind => {
      const t = clamp(s / L, 0, 1);
      return { height: clamp(y / this.plantH, 0, 1), limb: clamp(limb0 + (1 - limb0) * t, 0, 1), phase: o.phase, detail: clamp((t - 0.35) / 0.65, 0, 1) * 0.5 * flutter };
    };
    const widthAt = (s: number): number => {
      const t = clamp(s / L, 0, 1);
      return o.width * ((1 - Math.pow(t, taperP)) * 0.92 + 0.08);
    };
    return {
      level: o.level,
      line,
      sStart,
      profile: (s, j, N) => {
        const t = clamp(s / L, 0, 1);
        const w = widthAt(s);
        const th = o.width * thick * (1 - 0.7 * t);
        return bladePoint(N, j, w, th, keel, rolled);
      },
      radius: (s) => 0.5 * widthAt(s),
      round: false,
      extra: [],
      spacing: Math.max(1e-4, (L - sStart) / Math.max(1, Math.round(o.segments))),
      children: [],
      wind,
      pivot: o.pivot,
      r0: halfW0,
    };
  }

  private makeCulm(exit: Exit, v: { lean: number; az: number; height: number; phase: number; curveJ: number; leafAz: number }): Organ {
    const g = this.g;
    const N = exit.N;
    const Lc = Math.max(0.02, v.height);
    const hasHead = g.head !== 'none';
    const Lh = hasHead ? Math.max(0.005, g.headLength) : 0;
    const L = Lc + Lh;
    const A = { x: Math.cos(v.az), y: 0, z: Math.sin(v.az) };
    const lean = v.lean * DEG2RAD;
    const dir0 = normalize(add(scale(UP, Math.cos(lean)), scale(A, Math.sin(lean))));
    const right0 = normalize(cross(UP, A));
    const curve = g.culmCurve * (1 + 0.4 * v.curveJ) * DEG2RAD;
    const nod = g.headDroop * DEG2RAD;
    const angleAt = (s: number): number => (s <= Lc ? curve * Math.pow(s / Lc, 1.6) : curve + (Lh > 0 ? nod * Math.pow((s - Lc) / Lh, 0.8) : 0));
    const steps = Math.max(8, Math.round(g.culmSegments) * 2 + (hasHead ? 8 : 0));
    const line = growLine(exit.pos, dir0, right0, L, steps, (t0, t1) => ({
      gravity: angleAt(t1 * L) - angleAt(t0 * L),
      yaw: 1.5 * DEG2RAD * (Math.sin(TAU * (1.2 * t1 + v.phase)) - Math.sin(TAU * (1.2 * t0 + v.phase))),
    }));
    const rBase = Math.max(0.0003, g.culmRadius);
    const rTop = rBase * 0.7;
    const base = (s: number): number => rBase * (1 - 0.3 * (s / Lc));

    // Nodes, sheaths and the leaf windows at the top of the sheaths.
    const nodes = Math.max(0, Math.round(g.nodes));
    const nodeS: number[] = [];
    for (let k = 0; k < nodes; k++) nodeS.push(Lc * Math.pow((k + 1) / (nodes + 1), 1.25));
    const sheath = 0.45;
    // Leaf window: as many columns (the leaf's width axis) as the culm ring allows.
    const bladeN = evenSides(g.bladeSides, 4, 8);
    const lw = { w: Math.min(bladeN / 2 - 1, N / 2 - 1), h: 1 };
    lw.h = bladeN / 2 - lw.w;
    const nodeHH = nodeS.map((s) => 0.5 * lw.h * ((TAU * base(s) * (1 + sheath)) / N));
    const sheathTop: number[] = [];
    const leafS: number[] = [];
    for (let k = 0; k < nodes; k++) {
      const next = k + 1 < nodes ? nodeS[k + 1] : Lc;
      const len = Math.max(4.5 * nodeHH[k], Math.min(0.55 * (next - nodeS[k]), next - nodeS[k] - 3 * nodeHH[k]));
      sheathTop.push(nodeS[k] + len);
      leafS.push(nodeS[k] + len - nodeHH[k]);
    }
    const swell = Math.max(0, g.nodeSwell);
    const radius = (s: number): number => {
      if (s <= Lc) {
        let r = base(s);
        for (let k = 0; k < nodes; k++) {
          const hh = nodeHH[k];
          if (swell > 0) {
            const d = (s - nodeS[k]) / Math.max(1e-6, 1.1 * hh);
            r *= 1 + swell * Math.exp(-d * d);
          }
          const up = clamp((s - nodeS[k] - 0.5 * hh) / (1.5 * hh), 0, 1);
          const down = 1 - clamp((s - sheathTop[k]) / (2 * hh), 0, 1);
          r *= 1 + sheath * up * down;
        }
        return r;
      }
      const t = (s - Lc) / Math.max(1e-6, Lh);
      return rTop * (1 - 0.5 * t);
    };
    const wind = (s: number, y: number): VertexWind => ({ height: clamp(y / this.plantH, 0, 1), limb: clamp(s / L, 0, 1), phase: v.phase, detail: s > Lc ? 0.5 * this.flutter : 0 });
    const pivot = exit.pos;
    const extra: number[] = [];
    for (let k = 0; k < nodes; k++) {
      const hh = nodeHH[k];
      extra.push(nodeS[k] - 1.5 * hh, nodeS[k], nodeS[k] + 0.5 * hh, nodeS[k] + 1.25 * hh, nodeS[k] + 2 * hh, sheathTop[k] + hh, sheathTop[k] + 2 * hh);
    }
    if (hasHead) extra.push(Lc);
    else extra.push(L - 0.5 * rTop);

    const children: Attachment[] = [];
    // Culm leaves: distichous (alternate sides), the flag leaf shortest.
    for (let k = 0; k < nodes; k++) {
      const s = leafS[k];
      const az = v.leafAz + k * Math.PI + this.culmRng.uniform() * 0.25;
      const frac = nodes > 1 ? k / (nodes - 1) : 0;
      const len = Math.max(0.01, g.bladeLength * g.culmLeafLength * (1 - 0.3 * frac) * (1 + 0.15 * this.culmRng.uniform()));
      const width = Math.max(0.0005, g.bladeWidth * g.culmLeafWidth);
      const angle = g.culmLeafAngle * DEG2RAD;
      const droop = (g.droop * 0.8 + g.droopV * 0.5 * this.culmRng.uniform()) * DEG2RAD;
      const twist = (g.twist * 0.7 + g.twistV * 0.5 * this.culmRng.uniform()) * DEG2RAD * (this.culmRng.next() < 0.5 ? -1 : 1);
      const wavePhase = this.culmRng.next();
      const limb0 = clamp(s / L, 0, 1);
      children.push({
        s,
        az,
        w: lw.w,
        h: lw.h,
        hh: nodeHH[k],
        j0: 0,
        row0: 0,
        row1: 0,
        make: (ex) => {
          const d0 = normalize(add(scale(ex.dir, Math.cos(angle)), scale(ex.normal, Math.sin(angle))));
          const r0 = normalize(cross(ex.dir, ex.normal));
          return this.makeBlade(ex, { az: 0, lean: 0, length: len, width, droop, twist, wavePhase, phase: v.phase, level: 2, limb0, pivot, segments: g.bladeSegments, dir0: d0, right0: r0 });
        },
      });
    }
    if (hasHead) this.planHead(children, Lc, Lh, radius, N, v.phase, pivot);

    return {
      level: 1,
      line,
      sStart: Math.min(0.3 * L, Math.max(0.45 * exit.size, this.collarLen(rBase))),
      profile: (s, j, n) => {
        const r = radius(s);
        const th = (TAU * j) / n;
        return { x: r * Math.cos(th), y: r * Math.sin(th) };
      },
      radius,
      round: true,
      extra,
      spacing: Math.max(1e-4, Lc / Math.max(1, Math.round(g.culmSegments))),
      children,
      wind,
      pivot,
      r0: rBase,
    };
  }

  /**
   * Attach the inflorescence parts to the rachis (the continuation of the culm
   * beyond Lc). All head windows share one row height so that windows in
   * different columns line up on the same ring stations.
   */
  private planHead(children: Attachment[], Lc: number, Lh: number, radius: (s: number) => number, N: number, phase: number, pivot: V3): void {
    const g = this.g;
    const rng = this.headRng;
    const count = Math.max(0, Math.round(g.headBranches));
    if (count === 0) return;
    const colStep = TAU / N;
    const chordAt = (s: number): number => (TAU * radius(s)) / N;
    const angle = clamp(g.headBranchAngle, 3, 100) * DEG2RAD;
    const spikelet = Math.max(0, g.spikelet);
    const awn = Math.max(0, g.awn);
    const kind = g.head;
    const flutter = this.flutter;
    const headWind = (s: number, y: number, L: number): VertexWind => ({ height: clamp(y / this.plantH, 0, 1), limb: 1, phase, detail: clamp(0.5 + (0.5 * s) / L, 0, 1) * flutter });
    // Branchlets cannot be thicker than the window they leave through.
    const rbFor = (s: number): number => Math.max(0.00012, Math.min(g.headBranchRadius, 0.42 * chordAt(s)));
    const sRef = Lc + 0.1 * Lh;
    const hh = Math.max(0.25 * chordAt(sRef), 1.25 * rbFor(sRef));
    const rowH = 2 * hh;
    const s0 = Lc + 0.02 * Lh;
    const nRows = Math.max(1, Math.floor((0.96 * Lh) / rowH));
    const rowS = (row: number): number => s0 + (clamp(row, 0, nRows - 1) + 0.5) * rowH;
    const colAz = (c: number): number => (mod(c, N) + 0.5) * colStep;

    const push = (s: number, az: number, vals: HeadVals): void => {
      children.push({ s, az, w: 1, h: 1, hh, j0: 0, row0: 0, row1: 0, make: (exit) => this.makeBranchlet(exit, vals, pivot, headWind, 0) });
    };

    if (kind === 'spike') {
      // Two opposite rows of sessile, appressed spikelets.
      const c0 = rng.int(N);
      const used = Math.min(count, nRows);
      if (used < count) this.drop('head too short', count - used);
      for (let k = 0; k < used; k++) {
        const row = Math.round(((nRows - 1) * k) / Math.max(1, used - 1));
        const s = rowS(row);
        const rb = rbFor(s);
        const body = Math.max(spikelet, 1.3 * rb);
        const stalk = Math.max(2 * rb, 0.6 * body);
        // Appressed, but clear of the rachis: the body centre must sit at least one body radius out.
        const minAngle = Math.asin(clamp(body / (stalk + 1.6 * body), 0, 0.95));
        push(s, colAz(c0 + (k % 2) * (N / 2)), { length: stalk, droop: g.headBranchDroop * DEG2RAD, secondaries: 0, bodyR: body, awnL: awn, angle: Math.max(angle, minAngle), rb, phase });
      }
    } else if (kind === 'foxtail') {
      // Dense whorls of bristles, alternating column parity from row to row.
      const perWhorl = Math.max(1, Math.floor(N / 2));
      const whorls = Math.ceil(count / perWhorl);
      const used = Math.min(whorls, nRows);
      if (used < whorls) this.drop('head too short', (whorls - used) * perWhorl);
      let k = 0;
      for (let wI = 0; wI < used && k < count; wI++) {
        const row = Math.round(((nRows - 1) * wI) / Math.max(1, used - 1));
        const s = rowS(row);
        const rb = rbFor(s);
        const t = (s - Lc) / Lh;
        for (let m = 0; m < perWhorl && k < count; m++, k++) {
          const c = 2 * m + (row % 2);
          let length = Math.max(2 * rb, (g.headWidth * 0.5 - radius(s)) / Math.max(0.15, Math.sin(angle)));
          length *= (1 + 0.2 * rng.uniform()) * (1 - 0.35 * Math.pow(Math.max(0, t - 0.7) / 0.3, 2));
          push(s, colAz(c), { length, droop: (g.headBranchDroop + 10 * rng.uniform()) * DEG2RAD, secondaries: 0, bodyR: 0, awnL: 0, angle, rb, phase });
        }
      }
    } else {
      // Panicle / plume: branchlets spread over the lower part of the head, shorter towards the tip.
      const spread = clamp(g.headBranchSpread, 0.05, 1);
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        const row = Math.round((spread * nRows - 1) * t);
        const s = rowS(row);
        const rb = rbFor(s);
        const az = colAz(Math.round((k * GOLDEN) / colStep));
        const length = Math.max(3 * rb, g.headBranchLength * Lh * (1 - 0.45 * t) * (1 + 0.2 * rng.uniform()));
        const droop = g.headBranchDroop * (0.8 + 0.4 * rng.next()) * DEG2RAD;
        push(s, az, { length, droop, secondaries: Math.max(0, Math.round(g.headSecondary)), bodyR: kind === 'panicle' ? spikelet : 0, awnL: kind === 'panicle' ? awn : 0, angle, rb, phase });
      }
    }
  }

  /** A branchlet, bristle or spikelet: a thin tube with an optional spikelet bulge and awn, and optional secondaries. */
  private makeBranchlet(exit: Exit, v: HeadVals, pivot: V3, headWind: (s: number, y: number, L: number) => VertexWind, depth: number): Organ {
    const g = this.g;
    const rng = this.headRng;
    const N = exit.N;
    const Lb = Math.max(0.002, v.length);
    const hasBody = v.bodyR > v.rb * 1.05;
    const Ls = hasBody ? 3.2 * v.bodyR : 0;
    const La = v.awnL > 0 ? v.awnL : 0;
    const L = Lb + Ls + La;
    const dir0 = normalize(add(scale(exit.dir, Math.cos(v.angle)), scale(exit.normal, Math.sin(v.angle))));
    const right0 = normalize(cross(exit.dir, exit.normal));
    const segs = Math.max(1, Math.round(g.branchletSegments));
    const steps = segs * 2 + (hasBody ? 4 : 0) + (La > 0 ? 3 : 0);
    const angleAt = (s: number): number => (s <= Lb ? v.droop * Math.pow(s / Lb, 1.3) : v.droop);
    const line = growLine(exit.pos, dir0, right0, L, steps, (t0, t1) => ({ gravity: angleAt(t1 * L) - angleAt(t0 * L) }));
    const rAwn = 0.45 * v.rb;
    const radius = (s: number): number => {
      if (s <= Lb) return v.rb * (1 - 0.25 * (s / Lb));
      if (s <= Lb + Ls) {
        const t = clamp((s - Lb) / Ls, 0, 1);
        const b0 = 0.75 * v.rb;
        const end = La > 0 ? rAwn : 0.4 * v.rb;
        return b0 + (end - b0) * t + (v.bodyR - b0) * Math.pow(Math.sin(Math.PI * t), 0.8);
      }
      const t = (s - Lb - Ls) / Math.max(1e-6, La);
      return rAwn * (1 - 0.5 * t);
    };
    const extra: number[] = [];
    if (hasBody) extra.push(Lb, Lb + 0.2 * Ls, Lb + 0.5 * Ls, Lb + 0.8 * Ls, Lb + Ls);
    if (La > 0) extra.push(Lb + Ls + 0.4 * La);
    if (!hasBody && La === 0) extra.push(L - 0.6 * v.rb);
    const children: Attachment[] = [];
    if (v.secondaries > 0 && depth < 1) {
      const n = v.secondaries;
      const chord = (TAU * radius(0.5 * Lb)) / N;
      const rb2 = Math.max(0.0001, Math.min(v.rb * 0.7, 0.42 * chord));
      const hh = Math.max(0.25 * chord, 1.25 * rb2);
      const rows = Math.max(1, Math.floor((0.6 * Lb) / (2 * hh)));
      for (let k = 0; k < n; k++) {
        const t = 0.3 + (0.6 * (k + 0.5)) / n;
        const row = Math.round((rows - 1) * ((k + 0.5) / n));
        const s = 0.3 * Lb + (row + 0.5) * 2 * hh;
        const az = ((k % 2) * (N / 2) + 0.5) * (TAU / N);
        const vals: HeadVals = {
          length: Math.max(3 * rb2, Lb * (0.5 - 0.25 * t) * (1 + 0.2 * rng.uniform())),
          droop: v.droop * 0.8,
          secondaries: 0,
          bodyR: v.bodyR * 0.85,
          awnL: v.awnL * 0.8,
          angle: (30 + 15 * rng.uniform()) * DEG2RAD,
          rb: rb2,
          phase: v.phase,
        };
        children.push({ s, az, w: 1, h: 1, hh, j0: 0, row0: 0, row1: 0, make: (ex) => this.makeBranchlet(ex, vals, pivot, headWind, depth + 1) });
      }
    }
    return {
      level: 3,
      line,
      sStart: Math.min(0.3 * L, Math.max(0.45 * exit.size, this.collarLen(v.rb))),
      profile: (s, j, n) => {
        const r = radius(s);
        const th = (TAU * j) / n;
        return { x: r * Math.cos(th), y: r * Math.sin(th) };
      },
      radius,
      round: true,
      extra,
      spacing: Math.max(1e-5, Lb / segs, La / 4),
      children,
      wind: (s, y) => headWind(s, y, L),
      pivot,
      r0: v.rb,
    };
  }
}
