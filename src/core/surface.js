/**
 * Frontier — roof surface
 * -----------------------
 * A roof is ONE parametric surface S(face, m, a):
 *   m = plan distance from the eave line, measured up-slope (the "flow" direction)
 *   a = position along the eave, in world units, before the corner warp
 *
 * Height:   y = hEave + lift(m, a) + P(m)
 * Plan:     the eave rectangle, warped outward near the corners (冲出 / 起翘)
 *
 * Everything else in the generator (tiles, battens, sheathing, rafters, purlins)
 * is sampled from this one function, which is why parts can never drift apart or
 * float: contact is structural, not coincidental.
 *
 * The plan layout follows the carpenter's rule — draw the eave outline, draw the
 * ridge, let every hip run at 45° in plan from an eave corner:
 *   • pure hip      → ridge length = eaveWidth − eaveDepth
 *   • hip-and-gable → hips stop where they meet the gable (tsuma) plane
 *   • gable roof    → no hips, only the eave planes
 * See docs/ROOF_RESEARCH.md §2 and §4.3.
 */

import { clamp, lerp, smoothstep, vsub, vadd, vmul, vcross, vnorm, vlen } from './geom.js';
import { makeProfile, pitchFromSun, hipFactor } from './profile.js';

/** Forms and how their plan behaves. */
export const FORM_TABLE = {
  // key: { family: japanese|chinese|korean, gableEnds, hips, gableInset, region }
  kirizuma:  { region: 'jp', gable: true,  hips: false, ridgeOverride: null },
  yosemune:  { region: 'jp', gable: false, hips: true,  ridgeOverride: null },
  irimoya:   { region: 'jp', gable: true,  hips: true,  ridgeOverride: null },
  hougyou:   { region: 'jp', gable: false, hips: true,  ridgeOverride: 0 },
  nagare:    { region: 'jp', gable: true,  hips: false, ridgeOverride: null, asymmetric: true },
  hisashi:   { region: 'jp', gable: false, hips: false, shed: true },
  xuanshan:  { region: 'cn', gable: true,  hips: false, ridgeOverride: null },
  yingshan:  { region: 'cn', gable: true,  hips: false, ridgeOverride: null, flushGable: true },
  wudian:    { region: 'cn', gable: false, hips: true,  ridgeOverride: null },
  xieshan:   { region: 'cn', gable: true,  hips: true,  ridgeOverride: null },
  cuanjian:  { region: 'cn', gable: false, hips: true,  ridgeOverride: 0 },
  juanpeng:  { region: 'cn', gable: true,  hips: false, ridgeOverride: null, roundRidge: true },
  matbae:    { region: 'kr', gable: true,  hips: false, ridgeOverride: null },
  ujingak:   { region: 'kr', gable: false, hips: true,  ridgeOverride: null },
  paljak:    { region: 'kr', gable: true,  hips: true,  ridgeOverride: null },
  moim:      { region: 'kr', gable: false, hips: true,  ridgeOverride: 0 },
};

export function buildSurface(spec) {
  const formDef = FORM_TABLE[spec.form];
  if (!formDef) throw new Error(`Unknown roof form "${spec.form}"`);
  const { width: W, depth: D } = spec.footprint;
  const o = spec.overhang;

  const ezPerp = D / 2 + o.eave;               // run from ridge to the ±Z eave line
  const ezF = formDef.asymmetric ? D / 2 + o.eave : ezPerp;
  const ezB = formDef.asymmetric ? D / 2 + o.rear : ezPerp;
  const ez = (ezF + ezB) / 2;
  const ex = W / 2 + o.gable;                  // run from centre to the ±X eave line

  const pitch = pitchFromSun(spec.pitch.sun);
  // Rise is set by the steeper (rear) side so the ridge stays a single level line.
  const hEave = spec.baseHeight;               // eave line height at mid-span
  const rise = formDef.asymmetric
    ? pitch * Math.min(ezF, ezB) * (spec.pitch.mode === 'front' ? (Math.max(ezF, ezB) / Math.min(ezF, ezB)) : 1) * (spec.pitch.mode === 'front' ? 1 : 1)
    : pitch * ez;
  const ridgeZ = (ezF - ezB) / 2;

  const curvature = spec.curvature;
  const profileMain = makeProfile({
    run: ez, rise, rule: curvature.rule, bays: curvature.purlins,
    smooth: curvature.smooth, ease: curvature.ease,
  });
  const profile = profileMain;                 // hips require symmetric runs

  // ── gable plane (tsuma) ────────────────────────────────────────────────────
  let gableX;
  const inset = o.gableInset ?? 0;
  if (formDef.ridgeOverride === 0) gableX = 0;                      // pyramid
  else if (formDef.ridgeOverride != null) gableX = formDef.ridgeOverride / 2;
  else if (!formDef.hips) gableX = ex;                              // gable roof
  else if (formDef.gable) gableX = W / 2 - inset;                   // irimoya / xieshan
  else gableX = ex - ez;                                            // pure hip ridge end
  if (formDef.gable && formDef.hips) gableX = Math.max(gableX, 0.05);
  // The ridge can never be longer than the eave it springs from.
  gableX = clamp(gableX, 0, ex - 1e-3);

  const hasEnds = formDef.hips || false;
  const hipRunGuess = ex - gableX;             // how far a hip travels in plan

  // ── corner sweep (起翘 up / 冲出 out) ──────────────────────────────────────
  const cup = curvature.corner || {};
  const rafterD = (spec.frame?.rafter?.width ?? 0.045) * 2.2 || 0.1;
  const liftAmount = cup.enabled === false ? 0 : (cup.qiaoFactor ?? 4) * (cup.rafterDiam ?? rafterD);
  const pushAmount = cup.enabled === false ? 0 : (cup.chongFactor ?? 3) * (cup.rafterDiam ?? rafterD);
  const sweepRun = cup.run ?? Math.min(2.6, Math.max(1.1, ez * 0.45));

  // 起翘/冲出 must vanish at the TOP of the 隅棟 as well as along the eave, otherwise
  // the corner warp would push the roof surface through the gable (tsuma) plane.
  const sweepTop = Math.max(0.3, hasEnds && hipRunGuess > 0.05 ? Math.min(ez, hipRunGuess) : ez);
  const fadeLen = Math.min(1.5, sweepTop);
  const swing = (t) => smoothstep(clamp((sweepRun - t) / sweepRun));
  const fade = (m) => smoothstep(clamp((sweepTop - m) / fadeLen));
  const liftAt = (m, t) => liftAmount * swing(t) * fade(m);
  const pushAt = (m, t) => pushAmount * swing(t) * fade(m);

  // ── faces ─────────────────────────────────────────────────────────────────
  const faces = [];
  const makeMain = (sign) => ({
    id: sign > 0 ? 'mainFront' : 'mainBack',
    kind: 'main',
    sign,
    axis: 'x',
    profile: profileMain,
    run: ez,
    half: ex,
    gable: gableX,
    hips: formDef.hips,
    eaveCoord: sign > 0 ? ezF : -ezB,
    wallM: o.eave,
    gableEnd: !formDef.hips,
    hasEnds,
    zRidge: ridgeZ,
  });
  faces.push(makeMain(1), makeMain(-1));
  if (hasEnds) {
    for (const sign of [1, -1]) {
      faces.push({
        id: sign > 0 ? 'endPos' : 'endNeg',
        kind: 'end',
        sign,
        axis: 'z',
        profile: profileMain,          // same profile ⇒ heights match along the hips
        run: ez,
        half: ez,
        gable: gableX,
        hips: true,
        eaveCoord: sign > 0 ? ex : -ex,
        wallM: o.gable,
        mMax: Math.min(ez, hipRunGuess), // irimoya hips die at the gable plane
        zRidge: ridgeZ,
        topAtGable: formDef.gable,
      });
    }
  }

  for (const f of faces) {
    f.mMax = f.mMax ?? f.run;
    f.mWall = f.wallM;
  }

  /**
   * Half-width of a face at metric m.
   *   • gable roof   → the full rectangle, no trim.
   *   • hip roof     → trimmed by the 45° hip: |a| ≤ half − m.
   *   • hip-and-gable→ trimmed by the hip until the hip meets the gable (tsuma)
   *                    plane, then by that plane:  m ≤ half − gable ? half − m : gable.
   * (This is the plan rule the validator checks: hips at 45°, ending exactly on the
   * gable plane at m = half − gable.)
   */
  function halfWidth(face, m) {
    if (face.kind === 'main') {
      if (!face.hips) return face.gable;
      const hipToGable = face.half - face.gable;
      return m <= hipToGable ? face.half - m : face.gable;
    }
    return face.half - m;                                        // end faces
  }

  /** World position of a surface point. */
  function sample(face, m, a) {
    const run = face.run;
    const mc = clamp(m, 0, face.mMax);
    let t, push, lift, x, z, y;
    if (face.kind === 'main') {
      t = Math.max(0, face.half - Math.abs(a));                  // distance to the nearest corner
      push = pushAt(mc, t);
      lift = liftAt(mc, t);
      x = a + Math.sign(a) * push;
      // +Z face: flow travels from z = ezF toward the ridge; -Z face: from z = −ezB
      z = face.sign > 0 ? face.eaveCoord - mc : face.eaveCoord + mc;
      z += face.sign * push;
    } else {
      t = Math.max(0, face.half - Math.abs(a));
      push = pushAt(mc, t);
      lift = liftAt(mc, t);
      x = face.eaveCoord - face.sign * mc;
      x += face.sign * push;
      z = a + Math.sign(a) * push;
    }
    y = hEave + lift + profileMain.h(mc);
    return [x, y, z];
  }

  /** Orthonormal frame on the surface, Y = outward normal, X = along the eave. */
  function frameAt(face, m, a) {
    const e = 1e-3;
    const dm = Math.min(e, face.mMax * 0.5);
    const p = sample(face, m, a);
    const pM = sample(face, clamp(m + dm, 0, face.mMax), a);
    const pM0 = sample(face, clamp(m - dm, 0, face.mMax), a);
    const up = vnorm(vsub(pM, pM0));                            // up-slope direction
    const da = e;
    const pA = sample(face, m, a + da);
    const pA0 = sample(face, m, a - da);
    const across = vnorm(vsub(pA, pA0));
    // normal points up/outward: pick the sign that has +Y
    let n = vnorm(vcross(up, across));
    if (n[1] < 0) n = vmul(n, -1);
    let xAx = vsub(across, vmul(n, 0));
    // make it exactly orthogonal to the normal
    xAx = vnorm(vsub(across, vmul(n, (across[0] * n[0] + across[1] * n[1] + across[2] * n[2]))));
    const yAx = n;
    const zAx = vnorm(vcross(xAx, yAx));
    return { origin: p, x: xAx, y: yAx, z: zAx, up, normal: n, tangent: up };
  }

  const normalAt = (face, m, a) => frameAt(face, m, a).normal;

  // Every face carries the arc length of its own upper edge: on a truncated face
  // (irimoya / xieshan ends, which stop at the break line) tiles and probes must stop
  // there, not at the profile's full run.
  for (const face of faces) face.arcMax = face.profile.arc(face.mMax);

  /** Sample the eave line (m = 0) of a face as n+1 world points. */
  function eaveLine(face, n = 64) {
    const hw = halfWidth(face, 0);
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(sample(face, 0, lerp(-hw, hw, i / n)));
    return pts;
  }

  /** Ridge endpoints in world space. */
  function ridgeLine() {
    const y = hEave + profileMain.h(profileMain.run);
    return [
      [-gableX, y, ridgeZ],
      [gableX, y, ridgeZ],
    ];
  }

  /**
   * Hip (隅棟) lines: from each eave corner to the top of the hip.
   * Runs at 45° in plan by construction — the validator asserts it.
   */
  function hipLines() {
    const out = [];
    if (!hasEnds) return out;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const mainF = faces.find((f) => f.kind === 'main' && f.sign === sz);
        const endF = faces.find((f) => f.kind === 'end' && f.sign === sx);
        const pts = [];
        const steps = 16;
        const mEnd = Math.min(mainF.mMax, endF.mMax);
        for (let i = 0; i <= steps; i++) {
          const m = lerp(0, mEnd, i / steps);
          // both faces must agree; average for numerical comfort
          const pm = sample(mainF, m, sx * (mainF.half - m));
          const pe = sample(endF, m, sz * (endF.half - m));
          pts.push([(pm[0] + pe[0]) / 2, (pm[1] + pe[1]) / 2, (pm[2] + pe[2]) / 2]);
        }
        out.push({ id: `hip_${sx > 0 ? 'E' : 'W'}_${sz > 0 ? 'S' : 'N'}`, sx, sz, points: pts });
      }
    }
    return out;
  }

  /** Gable (破風) outline for a gable/hip-and-gable end: ridge apex → hip base. */
  function gableOutline(sx) {
    if (!hasEnds && !formDef.gable) return null;
    if (!formDef.gable) return null;
    const [r0, r1] = ridgeLine();
    const apex = sx > 0 ? r1 : r0;
    const base = [];
    if (hasEnds) {
      const mainF = faces.find((f) => f.kind === 'main' && f.sign === 1);
      const mBreak = hipRunGuess;
      for (const sz of [1, -1]) {
        const pts = [];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;                      // 0 at hip base → 1 at apex
          const m = lerp(mBreak, 0, t);
          const a = sx * (mainF.half - m);
          pts.push(sample(mainF, m, a));
        }
        base.push({ sz, points: pts });
      }
    } else {
      // plain gable end: straight run from the eave end up to the apex
      const mainF = faces.find((f) => f.kind === 'main' && f.sign === 1);
      for (const sz of [1, -1]) {
        const pts = [];
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const m = lerp(0, mainF.mMax, i / steps);
          pts.push(sample(mainF, m, sx * mainF.half));
        }
        base.push({ sz, points: pts });
      }
    }
    return { sx, apex, hipped: hasEnds, edges: base };
  }

  return {
    form: spec.form, formDef, W, D, ex, ez, ezF, ezB, ridgeZ, ridgeHalf: gableX,
    eaveRuns: { eave: o.eave, gable: o.gable },
    hEave, hRidge: hEave + profileMain.h(profileMain.run),
    pitch, profile: profileMain, hipFactor: hipFactor(spec.pitch.sun),
    faces, faceById: (id) => faces.find((f) => f.id === id),
    halfWidth, sample, frameAt, normalAt, eaveLine, ridgeLine, hipLines, gableOutline,
    hipRun: hipRunGuess, sweepTop, sweep: { liftAmount, pushAmount, run: sweepRun, topM: sweepTop },
    endFaces: faces.filter((f) => f.kind === 'end'),
    mainFaces: faces.filter((f) => f.kind === 'main'),
    hasEnds, gableX,
  };
}
