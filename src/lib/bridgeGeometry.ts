// Bridge generator — fully procedural superstructure + substructure.
//
//  Superstructure (beam): solid slab | I-girders + diaphragms | box girder(s)
//  Piers: single column | multi-column bent | wall | hammerhead | portal frame
//  Foundations: spread footing | elevated pile cap + round piles
//  Abutments: full-height cantilever | stub | spill-through
//  Arch: parabolic ribs + spandrel columns + mass thrust blocks
//
// All parts derive from the same curvature-safe station frames as roads.

import {
  Vec3, v_add, v_scale, v_sub, clamp, lerp,
} from './vec';
import {
  PatchSpec, patch, CrossLines, buildMarkings, buildGuardRail, StationFrame, COL,
} from './roadGeometry';
import type { BridgeSettings, CrossSection, RailSettings } from './model';

// ---------------------------------------------------------------------------
// Sweep / solid helpers
// ---------------------------------------------------------------------------

interface ProfilePt { off: number; dz: number }

/** Sweep a 2D profile (lateral offset, z offset) along per-station base points. */
function sweepProfile(
  base: Vec3[],
  normals: Vec3[],
  profile: ProfilePt[],
  closed: boolean,
  color: string,
  name: string,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const lines = profile.map((pt) =>
    base.map((b, i) => {
      const p = v_add(b, v_scale(normals[i], pt.off));
      return [p[0], p[1], p[2] + pt.dz] as Vec3;
    }),
  );
  const segs = closed ? profile.length : profile.length - 1;
  for (let k = 0; k < segs; k++) {
    const a = lines[k];
    const b = lines[(k + 1) % profile.length];
    out.push(patch(`${name} ${k}`, [a, b], color));
  }
  return out;
}

function capLoop(loop: Vec3[], color: string, name: string): PatchSpec | null {
  if (loop.length !== 4) return null;
  return patch(name, [[loop[0], loop[1]], [loop[3], loop[2]]], color);
}

/** Axis-aligned (yaw-rotated about Z) box. Local X = lateral, Y = longitudinal. */
function boxPatches(
  center: Vec3,
  sx: number,
  sy: number,
  sz: number,
  yawDeg: number,
  color: string,
  name: string,
): PatchSpec[] {
  const r = (yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const corner = (lx: number, ly: number, lz: number): Vec3 => [
    center[0] + lx * c - ly * s,
    center[1] + lx * s + ly * c,
    center[2] + lz,
  ];
  const hx = sx / 2; const hy = sy / 2; const hz = sz / 2;
  const t00 = corner(-hx, -hy, hz); const t10 = corner(hx, -hy, hz);
  const t01 = corner(-hx, hy, hz); const t11 = corner(hx, hy, hz);
  const b00 = corner(-hx, -hy, -hz); const b10 = corner(hx, -hy, -hz);
  const b01 = corner(-hx, hy, -hz); const b11 = corner(hx, hy, -hz);
  return [
    patch(`${name} top`, [[t00, t01], [t10, t11]], color),
    patch(`${name} bottom`, [[b00, b01], [b10, b11]], color),
    patch(`${name} +x`, [[b10, b11], [t10, t11]], color),
    patch(`${name} -x`, [[b01, b00], [t01, t00]], color),
    patch(`${name} +y`, [[b01, b11], [t01, t11]], color),
    patch(`${name} -y`, [[b10, b00], [t10, t00]], color),
  ];
}

/** Tapered box (frustum) — hammerhead columns, wall piers with batter. */
function taperedBox(
  center: Vec3,
  sxBot: number, syBot: number, sxTop: number, syTop: number,
  h: number, yawDeg: number, color: string, name: string,
): PatchSpec[] {
  const r = (yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const corner = (lx: number, ly: number, lz: number): Vec3 => [
    center[0] + lx * c - ly * s,
    center[1] + lx * s + ly * c,
    center[2] + lz,
  ];
  const hxb = sxBot / 2; const hyb = syBot / 2;
  const hxt = sxTop / 2; const hyt = syTop / 2;
  const hz = h / 2;
  const t00 = corner(-hxt, -hyt, hz); const t10 = corner(hxt, -hyt, hz);
  const t01 = corner(-hxt, hyt, hz); const t11 = corner(hxt, hyt, hz);
  const b00 = corner(-hxb, -hyb, -hz); const b10 = corner(hxb, -hyb, -hz);
  const b01 = corner(-hxb, hyb, -hz); const b11 = corner(hxb, hyb, -hz);
  return [
    patch(`${name} top`, [[t00, t01], [t10, t11]], color),
    patch(`${name} +x`, [[b10, b11], [t10, t11]], color),
    patch(`${name} -x`, [[b01, b00], [t01, t00]], color),
    patch(`${name} +y`, [[b01, b11], [t01, t11]], color),
    patch(`${name} -y`, [[b10, b00], [t10, t00]], color),
  ];
}

/** Vertical round tube (piles) — open ends, both hidden in cap/ground. */
function cylinderTube(
  x: number, y: number, z0: number, z1: number, radius: number, sides: number,
  color: string, name: string,
): PatchSpec[] {
  const ring = (z: number): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      out.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius, z]);
    }
    return out;
  };
  return [patch(name, [ring(z0), ring(z1)], color)];
}

/** Tapered round tube (column capitals, plinths) — open ends, both hidden. */
function taperedTube(
  x: number, y: number, z0: number, z1: number, rBot: number, rTop: number,
  sides: number, color: string, name: string,
): PatchSpec[] {
  const ring = (z: number, r: number): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      out.push([x + Math.cos(a) * r, y + Math.sin(a) * r, z]);
    }
    return out;
  };
  return [patch(name, [ring(z0, rBot), ring(z1, rTop)], color)];
}

/** General 8-corner solid (bottom ring + top ring, each CCW from above). */
function hexahedron(bot: Vec3[], top: Vec3[], color: string, name: string): PatchSpec[] {
  if (bot.length !== 4 || top.length !== 4) return [];
  const [b0, b1, b2, b3] = bot;
  const [t0, t1, t2, t3] = top;
  return [
    patch(`${name} top`, [[t0, t1], [t3, t2]], color),
    patch(`${name} bottom`, [[b0, b1], [b3, b2]], color),
    patch(`${name} s0`, [[b0, b1], [t0, t1]], color),
    patch(`${name} s1`, [[b1, b2], [t1, t2]], color),
    patch(`${name} s2`, [[b2, b3], [t2, t3]], color),
    patch(`${name} s3`, [[b3, b0], [t3, t0]], color),
  ];
}

/**
 * Height-adaptive column diameter: slender columns thicken automatically so
 * tall piers never read as sticks (slenderness capped at ~12:1).
 */
export function columnDiameter(minDia: number, colH: number): number {
  return Math.max(minDia, colH / 12);
}

/** Cap-beam depth scales with the deck it carries. */
export function capBeamDepth(deckW: number): number {
  return clamp(deckW / 10, 0.7, 1.4);
}

function yawFromFrame(f: StationFrame): number {
  return (Math.atan2(f.normal[1], f.normal[0]) * 180) / Math.PI;
}

function stationAtS(frames: StationFrame[], s: number): number {
  let best = 0; let bd = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const d = Math.abs(frames[i].s - s);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Girder centreline offsets for a deck of the given half-width. */
export function girderLayout(deckHalfW: number, superstructure: 'igirder' | 'box'): number[] {
  const usable = Math.max(0.6, deckHalfW - 0.4);
  if (superstructure === 'box') {
    if (deckHalfW * 2 > 11) {
      const off = usable * 0.55;
      return [-off, off];
    }
    return [0];
  }
  const n = clamp(Math.round((deckHalfW * 2) / 2.8), 2, 7);
  if (n === 1) return [0];
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(-usable + (2 * usable * k) / (n - 1));
  return out;
}

/** Per-station road half-width (for clamping substructure on curves). */
function stationHalfWidths(lines: CrossLines): number[] {
  return lines.frames.map((f, i) => {
    const wl = Math.hypot(lines.roadL[i][0] - f.center[0], lines.roadL[i][1] - f.center[1]);
    const wr = Math.hypot(lines.roadR[i][0] - f.center[0], lines.roadR[i][1] - f.center[1]);
    return Math.max(0.5, (wl + wr) / 2);
  });
}

function deckWidthAt(lines: CrossLines, i: number): number {
  const c = lines.frames[i].center;
  const wl = Math.hypot(lines.paveL[i][0] - c[0], lines.paveL[i][1] - c[1]);
  const wr = Math.hypot(lines.paveR[i][0] - c[0], lines.paveR[i][1] - c[1]);
  return wl + wr;
}

// ---------------------------------------------------------------------------
// Deck (shared by beam + arch)
// ---------------------------------------------------------------------------

function buildDeckSlab(lines: CrossLines, slabDepth: number): PatchSpec[] {
  const out: PatchSpec[] = [];
  const drop = (line: Vec3[]): Vec3[] => line.map((p) => [p[0], p[1], p[2] - slabDepth] as Vec3);
  const soffL = drop(lines.paveL);
  const soffR = drop(lines.paveR);
  out.push(patch('Fascia L', [lines.paveL, soffL], COL.concrete));
  out.push(patch('Fascia R', [soffR, lines.paveR], COL.concrete));
  out.push(patch('Soffit', [soffR, soffL], COL.concreteDark));
  return out;
}

function buildDeckTop(lines: CrossLines, cross: CrossSection): PatchSpec[] {
  return [
    patch('Deck surface', [lines.roadL, lines.roadR], COL.road),
    patch('Deck curb L', [lines.roadL, lines.curbTopL], COL.curb),
    patch('Deck walkway L', [lines.paveL, lines.curbTopL], COL.pavement),
    patch('Deck curb R', [lines.curbTopR, lines.roadR], COL.curb),
    patch('Deck walkway R', [lines.curbTopR, lines.paveR], COL.pavement),
    ...buildMarkings(lines, cross),
  ];
}

export interface ParapetRamps {
  /** Parapet height at the start/end (ramps down = approach bullnose). */
  startH?: number;
  endH?: number;
  /** Ramp length in metres. */
  rampLen?: number;
}

/** Parapet sweep with per-station height (landing ends ramp down to the rails). */
function buildParapets(lines: CrossLines, height: number, ramps?: ParapetRamps): PatchSpec[] {
  const out: PatchSpec[] = [];
  const H = Math.max(0.6, height);
  const rampLen = Math.max(0.5, ramps?.rampLen ?? 2);
  const total = lines.frames[lines.frames.length - 1].s;
  const smooth = (t: number) => {
    const c = clamp(t, 0, 1);
    return c * c * (3 - 2 * c);
  };
  const heights = lines.frames.map((f) => {
    let h = H;
    if (ramps?.startH !== undefined && f.s < rampLen) {
      h = ramps.startH + (H - ramps.startH) * smooth(f.s / rampLen);
    }
    if (ramps?.endH !== undefined && f.s > total - rampLen) {
      h = Math.min(h, ramps.endH + (H - ramps.endH) * smooth((total - f.s) / rampLen));
    }
    return h;
  });
  const normals = lines.frames.map((f) => f.normal);

  const side = (base: Vec3[], sgn: 1 | -1, name: string) => {
    const at = (off: number, top: boolean): Vec3[] =>
      base.map((p, i) => {
        const q = v_add(p, v_scale(normals[i], sgn * off));
        return [q[0], q[1], q[2] + (top ? heights[i] : 0)] as Vec3;
      });
    const ib = at(-0.03, false);
    const ob = at(0.24, false);
    const ot = at(0.24, true);
    const it = at(-0.03, true);
    out.push(patch(`${name} outer`, [ob, ot], COL.parapet));
    out.push(patch(`${name} top`, [ot, it], COL.parapet));
    out.push(patch(`${name} inner`, [it, ib], COL.parapet));
    out.push(patch(`${name} base`, [ib, ob], COL.parapet));
    for (const ei of [0, base.length - 1]) {
      const cap = capLoop([ib[ei], ob[ei], ot[ei], it[ei]], COL.parapet, `${name} cap ${ei}`);
      if (cap) out.push(cap);
    }
  };
  side(lines.paveL, 1, 'Parapet L');
  side(lines.paveR, -1, 'Parapet R');
  return out;
}

/** Parapet ramp options from span landing flags (undefined = no ramps). */
function rampOptsFor(opt: { rampStartH?: number; rampEndH?: number }): ParapetRamps | undefined {
  if (opt.rampStartH === undefined && opt.rampEndH === undefined) return undefined;
  return { startH: opt.rampStartH, endH: opt.rampEndH, rampLen: 2 };
}

/** Deck end plate at a free head (abutment face). */
function buildDeckEndPlate(lines: CrossLines, atStart: boolean, slabDepth: number): PatchSpec[] {
  const i = atStart ? 0 : lines.frames.length - 1;
  const f = lines.frames[i];
  const top = [
    lines.paveL[i], lines.curbTopL[i], lines.roadL[i], f.center,
    lines.roadR[i], lines.curbTopR[i], lines.paveR[i],
  ];
  const bottom = top.map((p) => [p[0], p[1], f.center[2] - slabDepth] as Vec3);
  const res = (pts: Vec3[]): Vec3[] => {
    const out: Vec3[] = [];
    for (let k = 0; k < 8; k++) {
      const t = (k / 7) * (pts.length - 1);
      const j = Math.min(pts.length - 2, Math.floor(t));
      out.push(lerp(pts[j], pts[j + 1], t - j));
    }
    return out;
  };
  return [patch(atStart ? 'Deck head start' : 'Deck head end', [res(bottom), res(top)], COL.concreteDark)];
}

// ---------------------------------------------------------------------------
// Superstructure
// ---------------------------------------------------------------------------

function buildIGirders(
  lines: CrossLines, halfW: number[], slabDepth: number, girderDepth: number,
): { patches: PatchSpec[]; layout: number[] } {
  const mid = halfW[Math.floor(halfW.length / 2)];
  const layout = girderLayout(mid, 'igirder');
  const normals = lines.frames.map((f) => f.normal);
  const D = Math.max(0.3, girderDepth);
  const ft = 0.15; // flange thickness
  const fw = 0.32; // half flange width
  const ww = 0.09; // half web width
  const prof: ProfilePt[] = [
    { off: -fw, dz: -slabDepth },
    { off: fw, dz: -slabDepth },
    { off: fw, dz: -slabDepth - ft },
    { off: ww, dz: -slabDepth - ft },
    { off: ww, dz: -slabDepth - D + ft },
    { off: fw, dz: -slabDepth - D + ft },
    { off: fw, dz: -slabDepth - D },
    { off: -fw, dz: -slabDepth - D },
    { off: -fw, dz: -slabDepth - D + ft },
    { off: -ww, dz: -slabDepth - D + ft },
    { off: -ww, dz: -slabDepth - ft },
    { off: -fw, dz: -slabDepth - ft },
  ];
  const out: PatchSpec[] = [];
  for (const go of layout) {
    const base = lines.frames.map((f, i) => {
      const gc = clamp(go, -(halfW[i] - 0.3), halfW[i] - 0.3);
      return v_add(f.center, v_scale(f.normal, gc));
    });
    out.push(...sweepProfile(base, normals, prof, true, COL.girder, 'I-girder'));
  }
  return { patches: out, layout };
}

function buildBoxGirders(
  lines: CrossLines, halfW: number[], slabDepth: number, girderDepth: number,
): { patches: PatchSpec[]; layout: number[] } {
  const mid = halfW[Math.floor(halfW.length / 2)];
  const layout = girderLayout(mid, 'box');
  const normals = lines.frames.map((f) => f.normal);
  const D = Math.max(0.4, girderDepth);
  const out: PatchSpec[] = [];
  for (const go of layout) {
    const base = lines.frames.map((f, i) => {
      const gc = clamp(go, -(halfW[i] - 0.5), halfW[i] - 0.5);
      return v_add(f.center, v_scale(f.normal, gc));
    });
    // trapezoid: top nearly full tributary width, bottom 55%
    const midHW = halfW[Math.floor(halfW.length / 2)];
    const topW = layout.length === 1 ? midHW * 1.5 : midHW * 0.72;
    const botW = topW * 0.55;
    const prof: ProfilePt[] = [
      { off: -topW / 2, dz: -slabDepth },
      { off: topW / 2, dz: -slabDepth },
      { off: botW / 2, dz: -slabDepth - D },
      { off: -botW / 2, dz: -slabDepth - D },
    ];
    out.push(...sweepProfile(base, normals, prof, true, COL.girder, 'Box girder'));
  }
  return { patches: out, layout };
}

/** Transverse diaphragms between I-girders at a support frame. */
function buildDiaphragms(
  f: StationFrame, layout: number[], slabDepth: number, girderDepth: number, deckW: number,
): PatchSpec[] {
  if (layout.length < 2) return [];
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  const h = girderDepth * 0.62;
  const topZ = f.center[2] - slabDepth;
  for (let k = 0; k < layout.length - 1; k++) {
    const a = layout[k]; const b = layout[k + 1];
    const mid = (a + b) / 2;
    const w = Math.abs(b - a) - 0.25;
    if (w < 0.3) continue;
    const cp = v_add(f.center, v_scale(f.normal, clamp(mid, -deckW / 2, deckW / 2)));
    out.push(...boxPatches([cp[0], cp[1], topZ - h / 2], w, 0.3, h, yaw, COL.girder, 'Diaphragm'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Piers + foundations
// ---------------------------------------------------------------------------

export interface SubstructureOptions {
  groundZ: number;
}

interface BearingLine { x: number }

function buildBearings(
  f: StationFrame, lines: BearingLine[], topZ: number,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  for (const g of lines) {
    const bp = v_add(f.center, v_scale(f.normal, g.x));
    out.push(...boxPatches([bp[0], bp[1], topZ - 0.09], 0.45, 0.45, 0.18, yaw, COL.post, 'Bearing'));
  }
  return out;
}

/** Spread footing or elevated pile cap + round piles. Returns top-of-foundation Z. */
function buildFoundation(
  f: StationFrame, deckW: number, groundZ: number, bridge: BridgeSettings,
  columnXs: number[], dia: number,
): { patches: PatchSpec[]; capTopZ: number } {
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  if (bridge.foundation === 'piles') {
    const capTopZ = groundZ + 1.8;
    const capT = 0.9;
    const capW = Math.max(2.2, deckW * 0.8, dia * 3);
    out.push(...boxPatches([f.center[0], f.center[1], capTopZ - capT / 2], capW, 2.0, capT, yaw, COL.concreteDark, 'Pile cap'));
    const pileR = Math.max(0.25, dia * 0.38);
    const nCols = clamp(Math.round(capW / 2.2), 2, 6);
    for (const rowOff of [-0.55, 0.55]) {
      for (let k = 0; k < nCols; k++) {
        const t = nCols === 1 ? 0 : (k / (nCols - 1)) * 2 - 1;
        const lat = t * (capW / 2 - 0.6);
        const ox = f.center[0] + f.normal[0] * lat + f.tangent[0] * rowOff;
        const oy = f.center[1] + f.normal[1] * lat + f.tangent[1] * rowOff;
        out.push(...cylinderTube(ox, oy, groundZ - 4, capTopZ - capT + 0.3, pileR, 12, COL.concrete, 'Pile'));
      }
    }
    void columnXs;
    return { patches: out, capTopZ };
  }
  // spread footing sized to the column layout + diameter
  const spread = columnXs.length > 1
    ? Math.max(...columnXs) - Math.min(...columnXs)
    : 0;
  const fw = Math.max(2.4, spread + 1.6, deckW * (bridge.pierStyle === 'wall' ? 0.7 : 0.4), dia * 3.2);
  const fd = bridge.pierStyle === 'wall' ? Math.max(1.8, dia + 1.3) : Math.max(2.1, dia * 2.6);
  const fh = clamp(dia * 1.3, 0.9, 1.5);
  const capTopZ = groundZ + 0.5;
  out.push(...boxPatches([f.center[0], f.center[1], capTopZ - fh / 2], fw, fd, fh, yaw, COL.concreteDark, 'Footing'));
  return { patches: out, capTopZ };
}

/** Cap beam with chamfered ends (full-depth middle + tapered tips). */
function buildCapBeam(
  f: StationFrame, capW: number, capD: number, capH: number, topZ: number,
  yawDeg: number, name: string,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const L = Math.min(1.4, capW * 0.18);
  const midW = Math.max(0.5, capW - 2 * L);
  out.push(...boxPatches(
    [f.center[0], f.center[1], topZ - capH / 2], midW, capD, capH, yawDeg, COL.concrete, `${name} mid`,
  ));
  const r = (yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const loc = (lx: number, ly: number, z: number): Vec3 => [
    f.center[0] + lx * c - ly * s,
    f.center[1] + lx * s + ly * c,
    z,
  ];
  for (const side of [1, -1]) {
    const x0 = side * (midW / 2); // root (inside the middle box)
    const x1 = side * (capW / 2); // tip
    const dTip = capD * 0.85;
    const zRoot = topZ - capH;
    const zTip = topZ - capH * 0.5;
    const bot: Vec3[] = side > 0
      ? [loc(x0, -capD / 2, zRoot), loc(x1, -dTip / 2, zTip), loc(x1, dTip / 2, zTip), loc(x0, capD / 2, zRoot)]
      : [loc(x1, -dTip / 2, zTip), loc(x0, -capD / 2, zRoot), loc(x0, capD / 2, zRoot), loc(x1, dTip / 2, zTip)];
    const top: Vec3[] = bot.map((p) => [p[0], p[1], topZ] as Vec3);
    out.push(...hexahedron(bot, top, COL.concrete, `${name} tip ${side > 0 ? '+' : '-'}`));
  }
  return out;
}

function buildPier(
  f: StationFrame,
  deckW: number,
  girderBottomZ: number,
  bearingXs: number[],
  bridge: BridgeSettings,
  groundZ: number,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  const style = bridge.pierStyle;
  const size = Math.max(0.3, bridge.pierSize);
  const round = bridge.columnShape === 'round';
  const bearingTopZ = girderBottomZ;
  const capBeamTopZ = bearingTopZ - 0.18; // under the bearings

  // column layout per style
  let columnXs: number[] = [0];
  const isWall = style === 'wall';
  const isPortal = style === 'portal';
  const isHammer = style === 'hammerhead';
  if (style === 'bent') {
    const n = clamp(Math.round(deckW / 3.5), 2, 5);
    const spread = Math.max(0.5, deckW / 2 - 0.7);
    columnXs = [];
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
      columnXs.push(t * spread);
    }
  } else if (isPortal) {
    const spread = Math.max(0.8, deckW / 2 - 0.5);
    columnXs = [-spread, spread];
  }

  // cap beam size (depth adapts to the deck it carries)
  const capW = style === 'single' ? size * 2.4 : deckW + (isPortal ? 0.6 : 1.0);
  const capD = isWall ? size + 0.5 : 0.9;
  const capH = Math.max(capBeamDepth(deckW), isPortal ? 1.0 : 0.7);
  const capBeamBotZ = capBeamTopZ - capH;

  // foundation (piles need room) + height-adaptive column diameter
  const usePiles = bridge.foundation === 'piles' && capBeamBotZ - (groundZ + 1.8) > 1.2;
  const baseGuess = usePiles ? groundZ + 1.8 : groundZ + 0.5;
  const colHGuess = Math.max(0.5, capBeamBotZ - baseGuess);
  const dia = isWall ? size : columnDiameter(isPortal ? size * 1.15 : size, colHGuess);
  const fnd = buildFoundation(
    f, deckW, groundZ, usePiles ? bridge : { ...bridge, foundation: 'spread' }, columnXs, dia,
  );
  out.push(...fnd.patches);
  const baseZ = fnd.capTopZ;

  // cap beam (chamfered ends on the wide styles)
  if (style === 'bent' || isWall || isHammer) {
    out.push(...buildCapBeam(f, capW, capD, capH, capBeamTopZ, yaw, 'Crosshead'));
  } else {
    out.push(...boxPatches(
      [f.center[0], f.center[1], capBeamTopZ - capH / 2], capW, capD, capH,
      yaw, COL.concrete, isPortal ? 'Portal beam' : 'Crosshead',
    ));
  }
  out.push(...buildBearings(f, bearingXs.map((x) => ({ x })), bearingTopZ));

  // shaft zone: plinth + shaft + capital per column
  const colH = capBeamBotZ - baseZ;
  if (colH < 0.8) {
    // too shallow for columns — solid stub pier(s), no voids
    if (colH > 0.1) {
      const midZ = (capBeamBotZ + baseZ) / 2;
      if (isWall) {
        const wallLen = Math.max(1.4, deckW * 0.72);
        out.push(...boxPatches([f.center[0], f.center[1], midZ], wallLen * 0.9, capD * 0.9, colH, yaw, COL.concrete, 'Stub pier'));
      } else if (isPortal) {
        for (const cx of columnXs) {
          const cp = v_add(f.center, v_scale(f.normal, cx));
          out.push(...boxPatches([cp[0], cp[1], midZ], dia * 1.5, dia * 1.5, colH, yaw, COL.concrete, 'Stub pier'));
        }
      } else if (style === 'bent') {
        const spread = columnXs.length > 1 ? Math.max(...columnXs) - Math.min(...columnXs) : 0;
        out.push(...boxPatches([f.center[0], f.center[1], midZ], spread + dia, capD * 0.9, colH, yaw, COL.concrete, 'Stub pier'));
      } else {
        out.push(...boxPatches([f.center[0], f.center[1], midZ], dia * 1.7, dia * 1.7, colH, yaw, COL.concrete, 'Stub pier'));
      }
    }
    return out;
  }
  if (isWall) {
    const wallLen = Math.max(1.4, deckW * 0.72);
    const colMidZ = (capBeamBotZ + baseZ) / 2;
    out.push(...taperedBox(
      [f.center[0], f.center[1], colMidZ],
      wallLen, dia + 0.45, wallLen * 0.94, dia + 0.25, colH, yaw, COL.concrete, 'Wall pier',
    ));
    return out;
  }

  const plinthH = clamp(colH * 0.2, 0.2, 0.5);
  const shaftAt = (cx: number, flareTop: number) => {
    const cp = v_add(f.center, v_scale(f.normal, cx));
    const x = cp[0]; const y = cp[1];
    let z0 = baseZ;
    if (colH > 0.9) {
      // pedestal plinth on the footing (height adapts to the column)
      if (round) out.push(...taperedTube(x, y, z0, z0 + plinthH, dia * 0.75, dia * 0.58, 14, COL.concrete, 'Plinth'));
      else {
        out.push(...taperedBox(
          [x, y, z0 + plinthH / 2], dia * 1.5, dia * 1.5, dia * 1.15, dia * 1.15, plinthH, yaw, COL.concrete, 'Plinth',
        ));
      }
      z0 += plinthH;
    }
    const capH2 = Math.min(0.8, colH * 0.25);
    const zCap = capBeamBotZ - capH2;
    if (zCap > z0 + 0.15) {
      // shaft
      if (round) out.push(...cylinderTube(x, y, z0, zCap, dia / 2, 14, COL.concrete, 'Pier column'));
      else out.push(...boxPatches([x, y, (z0 + zCap) / 2], dia, dia, zCap - z0, yaw, COL.concrete, 'Pier column'));
    }
    // flared capital into the cap beam
    if (round) out.push(...taperedTube(x, y, zCap, capBeamBotZ, dia / 2, (dia * flareTop) / 2, 14, COL.concrete, 'Capital'));
    else {
      out.push(...taperedBox(
        [x, y, (zCap + capBeamBotZ) / 2], dia, dia, dia * flareTop, dia * flareTop, capH2, yaw, COL.concrete, 'Capital',
      ));
    }
  };

  if (isHammer) {
    // full-height tapered column (the taper is the flare) + plinth
    const cp = v_add(f.center, v_scale(f.normal, 0));
    let z0 = baseZ;
    if (colH > 0.9) {
      if (round) out.push(...taperedTube(cp[0], cp[1], z0, z0 + plinthH, dia * 0.75, dia * 0.58, 14, COL.concrete, 'Plinth'));
      else {
        out.push(...taperedBox(
          [cp[0], cp[1], z0 + plinthH / 2], dia * 1.5, dia * 1.5, dia * 1.15, dia * 1.15, plinthH, yaw, COL.concrete, 'Plinth',
        ));
      }
      z0 += plinthH;
    }
    if (round) out.push(...taperedTube(cp[0], cp[1], z0, capBeamBotZ, dia * 0.55, dia * 0.85, 14, COL.concrete, 'Hammerhead column'));
    else {
      out.push(...taperedBox(
        [cp[0], cp[1], (z0 + capBeamBotZ) / 2], dia, dia, dia * 1.7, dia * 1.7,
        capBeamBotZ - z0, yaw, COL.concrete, 'Hammerhead column',
      ));
    }
    return out;
  }

  for (const cx of columnXs) shaftAt(cx, isPortal ? 1.35 : 1.6);
  return out;
}

// ---------------------------------------------------------------------------
// Abutments
// ---------------------------------------------------------------------------

function buildAbutment(
  f: StationFrame,
  deckW: number,
  deckTopZ: number,
  bearingXs: number[],
  groundZ: number,
  bridge: BridgeSettings,
  /** +1 if the span continues along +tangent (abutment sits behind, -tangent). */
  spanDir: 1 | -1,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  const kind = bridge.abutment;
  const botZ = groundZ - 0.3;

  const wingWalls = (rootX: number, len: number, topZ: number, h: number) => {
    for (const side of [1, -1]) {
      const wyaw = yaw + side * 38 * spanDir;
      const backoff = len / 2 - 0.4;
      const ex = f.center[0] + f.normal[0] * side * (deckW / 2 + rootX) - f.tangent[0] * spanDir * (1.0 + backoff);
      const ey = f.center[1] + f.normal[1] * side * (deckW / 2 + rootX) - f.tangent[1] * spanDir * (1.0 + backoff);
      out.push(...boxPatches([ex, ey, topZ - h / 2], 0.5, len, h, wyaw, COL.concrete, 'Wing wall'));
    }
  };

  if (kind === 'spill') {
    // backwall + cap on columns with a strip footing (soil spills through)
    const wallTop = deckTopZ + 0.1;
    const back = v_sub(f.center, v_scale(f.tangent, spanDir * 0.5));
    out.push(...boxPatches([back[0], back[1], wallTop - 0.55], deckW + 1.0, 1.0, 1.1, yaw, COL.concrete, 'Abutment backwall'));
    const capZ = wallTop - 1.1;
    out.push(...boxPatches([back[0], back[1], capZ - 0.35], deckW + 0.6, 0.9, 0.7, yaw, COL.concrete, 'Abutment cap'));
    const n = clamp(Math.round(deckW / 3), 2, 4);
    const colH = capZ - 0.7 - (groundZ + 0.4);
    if (colH > 0.5) {
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
        const cp = v_add([back[0], back[1], 0], v_scale(f.normal, t * Math.max(0.6, deckW / 2 - 0.8)));
        out.push(...boxPatches([cp[0], cp[1], groundZ + 0.4 + colH / 2], 0.6, 0.6, colH, yaw, COL.concrete, 'Abutment column'));
      }
    }
    out.push(...boxPatches([back[0], back[1], groundZ - 0.1], deckW + 1.2, 1.8, 0.8, yaw, COL.concreteDark, 'Abutment footing'));
    out.push(...buildBearings(f, bearingXs.map((x) => ({ x })), deckTopZ - 0.35));
    return out;
  }

  if (kind === 'stub') {
    // short wall on the embankment + strip footing + short wings
    const topZ = deckTopZ + 0.1;
    const h = Math.max(1.4, Math.min(2.6, topZ - botZ));
    const back = v_sub(f.center, v_scale(f.tangent, spanDir * 0.55));
    out.push(...boxPatches([back[0], back[1], topZ - h / 2], deckW + 1.2, 1.2, h, yaw, COL.concrete, 'Stub abutment'));
    out.push(...boxPatches([back[0], back[1], topZ - h - 0.3], deckW + 1.8, 2.0, 0.8, yaw, COL.concreteDark, 'Stub footing'));
    wingWalls(0.4, 2.2, topZ - 0.2, Math.max(0.8, h - 0.4));
    out.push(...buildBearings(f, bearingXs.map((x) => ({ x })), deckTopZ - 0.35));
    return out;
  }

  // cantilever (full-height) + footing + splayed wings
  const topZ = deckTopZ + 0.1;
  const h = Math.max(0.8, topZ - botZ);
  const back = v_sub(f.center, v_scale(f.tangent, spanDir * 0.6));
  out.push(...boxPatches([back[0], back[1], (topZ + botZ) / 2], deckW + 1.4, 1.4, h, yaw, COL.concrete, 'Abutment'));
  out.push(...boxPatches([back[0], back[1], groundZ - 0.2], deckW + 2.2, 2.6, 1.0, yaw, COL.concreteDark, 'Abutment footing'));
  wingWalls(0.5, 3.4, deckTopZ - 0.3, Math.max(0.8, deckTopZ - 0.3 - botZ));
  out.push(...buildBearings(f, bearingXs.map((x) => ({ x })), deckTopZ - 0.35));
  return out;
}

// ---------------------------------------------------------------------------
// Beam span
// ---------------------------------------------------------------------------

export interface BridgeSpanOptions extends SubstructureOptions {
  capStart: boolean;
  capEnd: boolean;
  /** Bridge end meeting a road at a straight join (flush support, no backwall). */
  landingStart?: boolean;
  landingEnd?: boolean;
  /** Closed ring run — no heads at all. */
  loop?: boolean;
  /** Parapet end heights at landings (ramps down to the adjoining rails). */
  rampStartH?: number;
  rampEndH?: number;
}

/**
 * Flush landing support where a bridge deck runs onto a road at a straight
 * join: wall + footing entirely below the deck (the road passes over flush)
 * with bearings under the girder lines.
 */
function buildLandingSupport(
  f: StationFrame,
  deckW: number,
  supportTopZ: number,
  bearingXs: number[],
  groundZ: number,
  spanDir: 1 | -1,
  massive: boolean,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  const wallTopZ = supportTopZ - 0.18; // bearings sit on the wall
  const botZ = groundZ - 0.3;
  const back = v_sub(f.center, v_scale(f.tangent, spanDir * 0.4));
  const t = massive ? 1.6 : 1.0;
  const w = deckW + (massive ? 1.6 : 0.6);
  if (wallTopZ - botZ > 0.4) {
    out.push(...boxPatches(
      [back[0], back[1], (wallTopZ + botZ) / 2], w, t, wallTopZ - botZ,
      yaw, COL.concrete, 'Landing wall',
    ));
  }
  out.push(...boxPatches(
    [back[0], back[1], groundZ - 0.1], w + 0.6, t + 0.8, 0.8,
    yaw, COL.concreteDark, 'Landing footing',
  ));
  out.push(...buildBearings(f, bearingXs.map((x) => ({ x })), supportTopZ));
  return out;
}

export function buildBeamSpan(
  lines: CrossLines,
  cross: CrossSection,
  bridge: BridgeSettings,
  rails: RailSettings,
  opt: BridgeSpanOptions,
): PatchSpec[] {
  if (lines.frames.length < 2) return [];
  const out: PatchSpec[] = [];
  const frames = lines.frames;
  const normals = frames.map((f) => f.normal);
  const halfW = stationHalfWidths(lines);
  const superstructure = bridge.superstructure;
  const slabDepth = superstructure === 'slab'
    ? Math.max(0.5, bridge.deckDepth * 2.2)
    : Math.max(0.2, bridge.deckDepth);
  const girderDepth = Math.max(0.3, bridge.girderDepth);

  out.push(...buildDeckTop(lines, cross));
  out.push(...buildDeckSlab(lines, slabDepth));

  // superstructure under the soffit
  let bearingXs: number[] = [];
  let girderBottom = slabDepth; // below deck centre
  if (superstructure === 'igirder') {
    const g = buildIGirders(lines, halfW, slabDepth, girderDepth);
    out.push(...g.patches);
    bearingXs = g.layout;
    girderBottom = slabDepth + girderDepth;
  } else if (superstructure === 'box') {
    const g = buildBoxGirders(lines, halfW, slabDepth, girderDepth);
    out.push(...g.patches);
    // bearings at box corners
    bearingXs = [];
    for (const go of g.layout) {
      const midHW = halfW[Math.floor(halfW.length / 2)];
      const spread = g.layout.length === 1 ? midHW * 0.55 : midHW * 0.26;
      bearingXs.push(go - spread, go + spread);
    }
    girderBottom = slabDepth + girderDepth;
  } else {
    const midHW = halfW[Math.floor(halfW.length / 2)];
    bearingXs = midHW > 5 ? [-(midHW - 0.8), 0, midHW - 0.8] : [-(midHW - 0.8), midHW - 0.8];
  }

  if (bridge.parapet === 'parapet') {
    out.push(...buildParapets(lines, bridge.parapetHeight, rampOptsFor(opt)));
  } else {
    out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0.3, 0.25));
    out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0.3, 0.25));
  }

  // piers along the span (+ diaphragms at supports for I-girders)
  const total = frames[frames.length - 1].s;
  const edge = 2.5;
  const usable = total - edge * 2;
  const pierStations: number[] = [];
  if (usable > 3) {
    const n = Math.max(1, Math.round(usable / Math.max(3, bridge.pierSpacing)));
    for (let k = 0; k <= n; k++) {
      const s = edge + (usable * k) / n;
      if (s <= edge * 0.5 || s >= total - edge * 0.5) continue;
      pierStations.push(s);
    }
  }
  for (const s of pierStations) {
    const idx = stationAtS(frames, s);
    const f = frames[idx];
    const deckW = deckWidthAt(lines, idx);
    const hw = halfW[idx];
    const bxs = bearingXs.map((x) => clamp(x, -(hw - 0.2), hw - 0.2));
    out.push(...buildPier(f, deckW, f.center[2] - girderBottom, bxs, bridge, opt.groundZ));
    if (superstructure === 'igirder' && bridge.diaphragms) {
      out.push(...buildDiaphragms(f, bxs, slabDepth, girderDepth, deckW));
    }
  }

  // heads
  const solidHeads = total >= 7;
  const endBearings = (idx: number) => {
    const hw = halfW[idx];
    return bearingXs.map((x) => clamp(x, -(hw - 0.2), hw - 0.2));
  };
  const landing = (atStart: boolean) => {
    const idx = atStart ? 0 : frames.length - 1;
    const f = frames[idx];
    out.push(...buildDeckEndPlate(lines, atStart, slabDepth));
    if (!solidHeads) return;
    out.push(...buildLandingSupport(
      f, deckWidthAt(lines, idx), f.center[2] - girderBottom, endBearings(idx),
      opt.groundZ, atStart ? 1 : -1, false,
    ));
    if (superstructure === 'igirder' && bridge.diaphragms) {
      out.push(...buildDiaphragms(f, endBearings(idx), slabDepth, girderDepth, deckWidthAt(lines, idx)));
    }
  };
  if (opt.capStart) {
    const f0 = frames[0];
    out.push(...buildDeckEndPlate(lines, true, slabDepth));
    if (solidHeads) {
      out.push(...buildAbutment(f0, deckWidthAt(lines, 0), f0.center[2], endBearings(0), opt.groundZ, bridge, 1));
      if (superstructure === 'igirder' && bridge.diaphragms) {
        out.push(...buildDiaphragms(f0, endBearings(0), slabDepth, girderDepth, deckWidthAt(lines, 0)));
      }
    }
  } else if (opt.landingStart) {
    landing(true);
  }
  if (opt.capEnd) {
    const last = frames.length - 1;
    const f1 = frames[last];
    out.push(...buildDeckEndPlate(lines, false, slabDepth));
    if (solidHeads) {
      out.push(...buildAbutment(f1, deckWidthAt(lines, last), f1.center[2], endBearings(last), opt.groundZ, bridge, -1));
      if (superstructure === 'igirder' && bridge.diaphragms) {
        out.push(...buildDiaphragms(f1, endBearings(last), slabDepth, girderDepth, deckWidthAt(lines, last)));
      }
    }
  } else if (opt.landingEnd) {
    landing(false);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Arch span (single span; returns null when the geometry is infeasible)
// ---------------------------------------------------------------------------

export function buildArchSpan(
  lines: CrossLines,
  cross: CrossSection,
  bridge: BridgeSettings,
  rails: RailSettings,
  opt: BridgeSpanOptions,
): PatchSpec[] | null {
  if (lines.frames.length < 2) return null;
  const frames = lines.frames;
  const total = frames[frames.length - 1].s;
  if (total < 8) return null;

  let minZ = Infinity;
  for (const f of frames) minZ = Math.min(minZ, f.center[2]);
  const clearance = minZ - opt.groundZ;
  if (clearance < 3.2) return null;

  const mid = frames.filter((f) => f.s > total * 0.3 && f.s < total * 0.7);
  let midMin = Infinity;
  for (const f of mid) midMin = Math.min(midMin, f.center[2]);
  const apexTarget = midMin - 1.6;
  let springZ = apexTarget - Math.max(1.5, bridge.archRise);
  springZ = Math.max(springZ, opt.groundZ + 0.7);
  const apexZ = Math.max(springZ + 1.5, apexTarget);
  if (apexZ - springZ < 1.5) return null;

  const out: PatchSpec[] = [];
  const normals = frames.map((f) => f.normal);
  const slabDepth = Math.max(0.2, bridge.deckDepth);

  out.push(...buildDeckTop(lines, cross));
  out.push(...buildDeckSlab(lines, slabDepth));

  // arch ribs (parabolic in elevation, following the planform curve)
  const ribOff = Math.max(1.0, lines.halfW - 0.5);
  const ribBase = (side: 1 | -1): Vec3[] =>
    frames.map((f) => {
      const t = clamp(f.s / total, 0, 1);
      const z = springZ + (apexZ - springZ) * 4 * t * (1 - t);
      const p = v_add(f.center, v_scale(f.normal, side * ribOff));
      return [p[0], p[1], z] as Vec3;
    });
  const ribProf: ProfilePt[] = [
    { off: -0.35, dz: -0.5 }, { off: 0.35, dz: -0.5 }, { off: 0.35, dz: 0.5 }, { off: -0.35, dz: 0.5 },
  ];
  const ribL = ribBase(1);
  const ribR = ribBase(-1);
  out.push(...sweepProfile(ribL, normals, ribProf, true, COL.concrete, 'Arch rib L'));
  out.push(...sweepProfile(ribR, normals, ribProf, true, COL.concrete, 'Arch rib R'));

  // spandrel columns from rib crown to deck soffit
  const step = 3.2;
  for (let s = step; s < total - 1; s += step) {
    const idx = stationAtS(frames, s);
    const f = frames[idx];
    const soffitZ = f.center[2] - slabDepth;
    for (const side of [1, -1]) {
      const rib = side === 1 ? ribL[idx] : ribR[idx];
      const topZ = soffitZ;
      const botZ = rib[2] + 0.5;
      const h = topZ - botZ;
      if (h < 0.6) continue;
      const cp = v_add(f.center, v_scale(f.normal, side * ribOff));
      out.push(...boxPatches([cp[0], cp[1], (topZ + botZ) / 2], 0.45, 0.45, h, yawFromFrame(f), COL.concrete, 'Spandrel'));
    }
  }

  if (bridge.parapet === 'parapet') {
    out.push(...buildParapets(lines, bridge.parapetHeight, rampOptsFor(opt)));
  } else {
    out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0.3, 0.25));
    out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0.3, 0.25));
  }

  // mass thrust blocks at free heads; flush landing walls at road joins
  const halfW = stationHalfWidths(lines);
  const f0 = frames[0];
  const f1 = frames[frames.length - 1];
  const bxs = (idx: number) => {
    const hw = halfW[idx];
    return [-hw * 0.5, hw * 0.5];
  };
  const thrust = { ...bridge, abutment: 'cantilever' as const };
  if (opt.capStart) {
    out.push(...buildDeckEndPlate(lines, true, slabDepth));
    out.push(...buildAbutment(f0, deckWidthAt(lines, 0) + 1.2, Math.max(f0.center[2], springZ + 2.0), bxs(0), opt.groundZ, thrust, 1));
  } else if (opt.landingStart) {
    out.push(...buildDeckEndPlate(lines, true, slabDepth));
    out.push(...buildLandingSupport(f0, deckWidthAt(lines, 0) + 1.2, f0.center[2] - slabDepth, bxs(0), opt.groundZ, 1, true));
  } else if (!opt.loop) {
    // trimmed (junction) end: no plate (deck flows into the tub) but the rib
    // springs need a wall to land on
    out.push(...buildLandingSupport(f0, deckWidthAt(lines, 0) + 1.2, f0.center[2] - slabDepth, bxs(0), opt.groundZ, 1, true));
  }
  if (opt.capEnd) {
    out.push(...buildDeckEndPlate(lines, false, slabDepth));
    out.push(...buildAbutment(f1, deckWidthAt(lines, frames.length - 1) + 1.2, Math.max(f1.center[2], springZ + 2.0), bxs(frames.length - 1), opt.groundZ, thrust, -1));
  } else if (opt.landingEnd) {
    out.push(...buildDeckEndPlate(lines, false, slabDepth));
    out.push(...buildLandingSupport(f1, deckWidthAt(lines, frames.length - 1) + 1.2, f1.center[2] - slabDepth, bxs(frames.length - 1), opt.groundZ, -1, true));
  } else if (!opt.loop) {
    out.push(...buildLandingSupport(f1, deckWidthAt(lines, frames.length - 1) + 1.2, f1.center[2] - slabDepth, bxs(frames.length - 1), opt.groundZ, -1, true));
  }
  return out;
}
