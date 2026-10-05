// Bridge generator — beam spans (deck + girders + bents + abutments) and
// single-span arch bridges (ribs + spandrels + thrust blocks).
// Built from the same curvature-safe station frames as roads.

import {
  Vec3, v_add, v_scale, v_sub, clamp, lerp,
} from './vec';
import {
  PatchSpec, patch, CrossLines, buildMarkings, buildGuardRail, StationFrame, COL,
} from './roadGeometry';
import type { BridgeSettings, CrossSection, RailSettings } from './model';

// ---------------------------------------------------------------------------
// Sweep helpers
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

export function girderOffsets(halfW: number): number[] {
  const n = halfW * 2 > 12 ? 3 : 2;
  const off = Math.max(0.6, halfW - 0.3);
  if (n === 2) return [-off, off];
  return [-off, 0, off];
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

function buildDeckSlab(lines: CrossLines, deckDepth: number): PatchSpec[] {
  const out: PatchSpec[] = [];
  const drop = (line: Vec3[]): Vec3[] => line.map((p) => [p[0], p[1], p[2] - deckDepth] as Vec3);
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

function buildParapets(lines: CrossLines, height: number): PatchSpec[] {
  const out: PatchSpec[] = [];
  const H = Math.max(0.6, height);
  const profL: ProfilePt[] = [
    { off: -0.03, dz: 0 }, { off: 0.24, dz: 0 }, { off: 0.24, dz: H }, { off: -0.03, dz: H },
  ];
  const profR: ProfilePt[] = [
    { off: 0.03, dz: 0 }, { off: -0.24, dz: 0 }, { off: -0.24, dz: H }, { off: 0.03, dz: H },
  ];
  const normals = lines.frames.map((f) => f.normal);
  out.push(...sweepProfile(lines.paveL, normals, profL, true, COL.parapet, 'Parapet L'));
  out.push(...sweepProfile(lines.paveR, normals, profR, true, COL.parapet, 'Parapet R'));
  // end plates
  const ends = [0, lines.frames.length - 1];
  for (const ei of ends) {
    const mk = (base: Vec3, prof: ProfilePt[]): Vec3[] =>
      prof.map((pt) => {
        const p = v_add(base, v_scale(normals[ei], pt.off));
        return [p[0], p[1], p[2] + pt.dz] as Vec3;
      });
    const cL = capLoop(mk(lines.paveL[ei], profL), COL.parapet, `Parapet L cap ${ei}`);
    const cR = capLoop(mk(lines.paveR[ei], profR), COL.parapet, `Parapet R cap ${ei}`);
    if (cL) out.push(cL);
    if (cR) out.push(cR);
  }
  return out;
}

/** Deck end plate at a free head (abutment face). */
function buildDeckEndPlate(lines: CrossLines, atStart: boolean, deckDepth: number): PatchSpec[] {
  const i = atStart ? 0 : lines.frames.length - 1;
  const f = lines.frames[i];
  const top = [
    lines.paveL[i], lines.curbTopL[i], lines.roadL[i], f.center,
    lines.roadR[i], lines.curbTopR[i], lines.paveR[i],
  ];
  const bottom = top.map((p) => [p[0], p[1], f.center[2] - deckDepth] as Vec3);
  // resample both to 8 for a clean rectangular wall
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
// Piers + abutments
// ---------------------------------------------------------------------------

export interface SubstructureOptions {
  groundZ: number;
}

function buildPier(
  f: StationFrame,
  deckW: number,
  girderBottomZ: number,
  bridge: BridgeSettings,
  groundZ: number,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  const colTop = girderBottomZ - 0.8; // underside of crosshead
  const footingTop = groundZ + 0.5;
  const colH = colTop - footingTop;
  if (colH < 1.0) return []; // too shallow — abutment/embankment zone

  // crosshead
  const chC: Vec3 = [f.center[0], f.center[1], girderBottomZ - 0.4];
  out.push(...boxPatches(chC, deckW + 1.0, 0.9, 0.8, yaw, COL.concrete, 'Crosshead'));
  // bearings under each girder line
  for (const go of girderOffsets(deckW / 2)) {
    const bp = v_add(f.center, v_scale(f.normal, go));
    out.push(...boxPatches([bp[0], bp[1], girderBottomZ - 0.09], 0.45, 0.45, 0.18, yaw, COL.post, 'Bearing'));
  }
  const colMidZ = (colTop + footingTop) / 2;
  const col = (lateral: number, sx: number, sy: number) => {
    const cp = v_add(f.center, v_scale(f.normal, lateral));
    out.push(...boxPatches([cp[0], cp[1], colMidZ], sx, sy, colH, yaw, COL.concrete, 'Pier column'));
  };
  const footing = (sx: number, sy: number) => {
    out.push(...boxPatches([f.center[0], f.center[1], groundZ - 0.05], sx, sy, 1.1, yaw, COL.concreteDark, 'Footing'));
  };

  if (bridge.pierStyle === 'single') {
    col(0, bridge.pierSize, bridge.pierSize);
    footing(2.6, 2.6);
  } else if (bridge.pierStyle === 'wall') {
    col(0, Math.max(1.2, deckW * 0.7), bridge.pierSize + 0.25);
    footing(Math.max(2, deckW * 0.7 + 0.8), bridge.pierSize + 1.3);
  } else {
    const n = clamp(Math.round(deckW / 3.5), 2, 5);
    const spread = Math.max(0.5, deckW / 2 - 0.7);
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1)) * 2 - 1;
      col(t * spread, bridge.pierSize, bridge.pierSize);
    }
    footing(deckW + 0.8, 2.1);
  }
  return out;
}

function buildAbutment(
  f: StationFrame,
  deckW: number,
  deckTopZ: number,
  groundZ: number,
  /** +1 if the span continues along +tangent (abutment sits behind, -tangent). */
  spanDir: 1 | -1,
  beefy: boolean,
): PatchSpec[] {
  const out: PatchSpec[] = [];
  const yaw = yawFromFrame(f);
  const depth = beefy ? 2.0 : 1.4;
  const topZ = deckTopZ + 0.1;
  const botZ = groundZ - 0.3;
  const h = Math.max(0.8, topZ - botZ);
  // backwall sits just behind the deck head
  const back = v_sub(f.center, v_scale(f.tangent, spanDir * (depth / 2 - 0.1)));
  out.push(...boxPatches([back[0], back[1], (topZ + botZ) / 2], deckW + 1.4, depth, h, yaw, COL.concrete, 'Abutment'));
  // footing
  out.push(...boxPatches([back[0], back[1], groundZ - 0.2], deckW + 2.2, depth + 1.2, 1.0, yaw, COL.concreteDark, 'Abutment footing'));
  // wing walls splayed back at ±38°
  for (const side of [1, -1]) {
    const wyaw = yaw + side * 38 * spanDir;
    const L = 3.4;
    // wing root at the backwall end, body running back away from the span
    const backoff = L / 2 - 0.4;
    const ex = f.center[0] + f.normal[0] * side * (deckW / 2 + 0.5) - f.tangent[0] * spanDir * (1.0 + backoff);
    const ey = f.center[1] + f.normal[1] * side * (deckW / 2 + 0.5) - f.tangent[1] * spanDir * (1.0 + backoff);
    const wh = Math.max(0.8, deckTopZ - 0.3 - botZ);
    out.push(
      ...boxPatches([ex, ey, (deckTopZ - 0.3 + botZ) / 2], 0.5, L, wh, wyaw, COL.concrete, 'Wing wall'),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Beam span
// ---------------------------------------------------------------------------

export interface BridgeSpanOptions extends SubstructureOptions {
  capStart: boolean;
  capEnd: boolean;
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
  const normals = lines.frames.map((f) => f.normal);
  const deckDepth = Math.max(0.2, bridge.deckDepth);
  const girderDepth = Math.max(0.3, bridge.girderDepth);

  out.push(...buildDeckTop(lines, cross));
  out.push(...buildDeckSlab(lines, deckDepth));

  // longitudinal girders (box section swept under the soffit)
  const gw = 0.5;
  const gprof: ProfilePt[] = [
    { off: -gw / 2, dz: -deckDepth },
    { off: gw / 2, dz: -deckDepth },
    { off: gw / 2, dz: -deckDepth - girderDepth },
    { off: -gw / 2, dz: -deckDepth - girderDepth },
  ];
  for (const go of girderOffsets(lines.halfW)) {
    const base = lines.frames.map((f) => v_add(f.center, v_scale(f.normal, go)));
    out.push(...sweepProfile(base, normals, gprof, true, COL.girder, 'Girder'));
  }

  if (bridge.parapet === 'parapet') {
    out.push(...buildParapets(lines, bridge.parapetHeight));
  } else {
    out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0));
    out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0));
  }

  // piers along the span
  const total = lines.frames[lines.frames.length - 1].s;
  const edge = 2.5;
  const usable = total - edge * 2;
  if (usable > 3) {
    const n = Math.max(1, Math.round(usable / Math.max(3, bridge.pierSpacing)));
    for (let k = 0; k <= n; k++) {
      const s = n === 0 ? total / 2 : edge + (usable * k) / n;
      if (s <= edge * 0.5 || s >= total - edge * 0.5) continue;
      const idx = stationAtS(lines.frames, s);
      const f = lines.frames[idx];
      const deckW = deckWidthAt(lines, idx);
      const girderBottomZ = f.center[2] - deckDepth - girderDepth;
      out.push(...buildPier(f, deckW, girderBottomZ, bridge, opt.groundZ));
    }
  }

  // heads (abutments need room — short stubs get end plates only)
  const solidHeads = total >= 7;
  if (opt.capStart) {
    const f0 = lines.frames[0];
    out.push(...buildDeckEndPlate(lines, true, deckDepth));
    if (solidHeads) out.push(...buildAbutment(f0, deckWidthAt(lines, 0), f0.center[2], opt.groundZ, 1, false));
  }
  if (opt.capEnd) {
    const last = lines.frames.length - 1;
    const f1 = lines.frames[last];
    out.push(...buildDeckEndPlate(lines, false, deckDepth));
    if (solidHeads) out.push(...buildAbutment(f1, deckWidthAt(lines, last), f1.center[2], opt.groundZ, -1, false));
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

  // apex target: just under the middle-third deck
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
  const deckDepth = Math.max(0.2, bridge.deckDepth);

  out.push(...buildDeckTop(lines, cross));
  out.push(...buildDeckSlab(lines, deckDepth));

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
    const soffitZ = f.center[2] - deckDepth;
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
    out.push(...buildParapets(lines, bridge.parapetHeight));
  } else {
    out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0));
    out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0));
  }

  // thrust blocks at both heads (arch ends always need them)
  const f0 = frames[0];
  const f1 = frames[frames.length - 1];
  out.push(...buildDeckEndPlate(lines, true, deckDepth));
  out.push(...buildDeckEndPlate(lines, false, deckDepth));
  out.push(...buildAbutment(f0, deckWidthAt(lines, 0), Math.max(f0.center[2], springZ + 1.5), opt.groundZ, 1, true));
  out.push(...buildAbutment(f1, deckWidthAt(lines, frames.length - 1), Math.max(f1.center[2], springZ + 1.5), opt.groundZ, -1, true));
  return out;
}
