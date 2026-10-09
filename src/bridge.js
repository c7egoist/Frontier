// ---------------------------------------------------------------------------
// bridge.js — bridge superstructure + substructure, built from the same
// curvature-safe station frames as roads.
//
//   beam: deck slab + I-girders + diaphragms + piers (single / bent / wall)
//         + spread footings + end abutments + concrete parapets (or rails)
//   arch: parabolic ribs under the deck + spandrel columns + thrust blocks
//
// Landing ends (where a bridge meets a road in a straight abutment) ramp the
// parapet down to the road's rail height so the hand-over reads cleanly.
// Scuppers (deck-edge drainage outlets) hang below the deck at intervals.
// ---------------------------------------------------------------------------

import { vAdd, vScale, vSub, vLen, vLerp, clamp, arcLengths, resampleLine } from './math.js';
import { COL, buildGuardRail } from './details.js';
import { buildMarkings } from './markings.js';

const patch = (name, grid, fill_color, alpha = 1) => ({ name, grid, fill_color, alpha });

// --- sweep helpers -----------------------------------------------------------

/** Sweep a closed 2D profile (lateral offset, z offset) along stations. */
function sweepProfile(base, normals, profile, closed, color, name) {
  const out = [];
  const lines = profile.map((pt) =>
    base.map((b, i) => {
      const p = vAdd(b, vScale(normals[i], pt.off));
      return [p[0], p[1], p[2] + pt.dz];
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

/** Axis-aligned (yaw-rotated about Z) box. Local X = lateral, Y = longitudinal. */
function boxPatches(center, sx, sy, sz, yawDeg, color, name) {
  const r = (yawDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const corner = (lx, ly, lz) => [
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
    patch(`${name} -x`, [[t00, t10], [b00, b10]], color),
    patch(`${name} +x`, [[t01, t11], [b01, b11]], color),
    patch(`${name} -y`, [[t00, t01], [b00, b01]], color),
    patch(`${name} +y`, [[t10, t11], [b10, b11]], color),
  ];
}

/** N-gon prism (vertical column) centred at (x, y) from z0 to z1. */
function columnPatches(x, y, z0, z1, radius, sides, color, name, square = false) {
  const out = [];
  const h = z1 - z0;
  const ring = (z) => {
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const rx = square ? radius * Math.cos(a) / Math.cos(Math.PI / sides) : radius * Math.cos(a);
      const ry = square ? radius * Math.sin(a) / Math.cos(Math.PI / sides) : radius * Math.sin(a);
      pts.push([x + rx, y + ry, z]);
    }
    return pts;
  };
  const bot = ring(z0);
  const top = ring(z1);
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    out.push(patch(`${name} side`, [[bot[k], bot[k2]], [top[k], top[k2]]], color));
  }
  // caps (fan)
  const cB = [x, y, z0];
  const cT = [x, y, z1];
  const fan = (ringPts, ctr, flip) => {
    const rows = [];
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      rows.push([ctr, flip ? ringPts[k2] : ringPts[k], flip ? ringPts[k] : ringPts[k2]]);
    }
    return rows;
  };
  for (const tri of fan(bot, cB, true)) out.push(patch(`${name} cap`, [tri], color));
  for (const tri of fan(top, cT, false)) out.push(patch(`${name} cap`, [tri], color));
  void h;
  return out;
}

// --- shared deck ---------------------------------------------------------------

/** Deck wearing surface + curbs/pavement (same as a road top). */
function buildDeckTop(lines, cross, out) {
  out.push(patch('Deck surface', [lines.roadL, lines.roadR], COL.road));
  out.push(patch('Deck curb L', [lines.roadL, lines.curbTopL], COL.curb));
  out.push(patch('Deck pavement L', [lines.paveL, lines.curbTopL], COL.pavement));
  out.push(patch('Deck curb R', [lines.curbTopR, lines.roadR], COL.curb));
  out.push(patch('Deck pavement R', [lines.curbTopR, lines.paveR], COL.pavement));
}

/** Parapet (concrete barrier) swept along a deck edge line. Ramps down to
 *  rampStartH / rampEndH over the first/last `rampLen` metres (landing hand-over). */
function buildParapet(edgeLine, normals, frames, pointRight, height, rampStartH, rampEndH, out, name, rampLen = 4) {
  const n = edgeLine.length;
  if (n < 2 || height <= 0) return;
  const s = pointRight ? 1 : -1;
  const total = frames.length > 1 ? frames[frames.length - 1].s : 0;
  const prof = [
    { off: 0, dz: 0 },
    { off: 0.14 * s, dz: 0 },
    { off: 0.11 * s, dz: height * 0.55 },
    { off: 0, dz: height },
  ];
  const hAt = (i) => {
    const st = frames[i].s;
    let h = height;
    if (rampStartH != null && rampStartH < height && st < rampLen) {
      h = vLerpNum(rampStartH, height, clamp(st / rampLen, 0, 1));
    }
    if (rampEndH != null && rampEndH < height && total - st < rampLen) {
      h = vLerpNum(rampEndH, height, clamp((total - st) / rampLen, 0, 1));
    }
    return h;
  };
  const lines = prof.map((pt) => edgeLine.map((p, i) => {
    const h = hAt(i);
    const q = vAdd(p, vScale(normals[i], pt.off));
    return [q[0], q[1], q[2] + pt.dz * (h / height)];
  }));
  for (let k = 0; k < prof.length - 1; k++) {
    out.push(patch(`${name} ${k}`, [lines[k], lines[k + 1]], COL.parapet));
  }
  out.push(patch(`${name} top`, [lines[0], lines[prof.length - 1]], COL.parapet));
}

const vLerpNum = (a, b, t) => a + (b - a) * t;

/** Scuppers: small drainage outlet boxes hanging below the deck edge. */
function buildScuppers(lines, groundZ, spacing, out) {
  const n = lines.frames.length;
  if (n < 2 || !(spacing > 0)) return;
  const total = lines.frames[n - 1].s;
  const deckBot = -0.4; // below the wearing surface (deck slab)
  for (let s = spacing; s < total - 0.5; s += spacing) {
    let i = 0;
    while (i < n - 2 && lines.frames[i + 1].s < s) i++;
    for (const side of [0, 1]) {
      const edge = side === 0 ? lines.paveL : lines.paveR;
      const f = lines.frames[i];
      const p = edge[i];
      const yaw = Math.atan2(f.tangent[1], f.tangent[0]) * 180 / Math.PI;
      const cx = p[0] + (side === 0 ? f.normal[0] : -f.normal[0]) * 0.1;
      const cy = p[1] + (side === 0 ? f.normal[1] : -f.normal[1]) * 0.1;
      out.push(...boxPatches(
        [cx, cy, p[2] + deckBot - 0.15], 0.3, 0.12, 0.3, yaw, COL.concreteDark, 'Scupper',
      ));
      void groundZ;
    }
  }
}

// --- beam bridge ---------------------------------------------------------------

/**
 * Beam bridge span.
 * @param lines CrossLines, cross CrossSection, bridge BridgeSettings (enabled),
 *   rails RailSettings, opt { groundZ, capStart, capEnd, landingStart, landingEnd,
 *   rampStartH, rampEndH, loop, junctionAtStart, junctionAtEnd }
 */
export function buildBeamSpan(lines, cross, bridge, rails, opt) {
  const out = [];
  const frames = lines.frames;
  const n = frames.length;
  if (n < 2) return [];
  const normals = frames.map((f) => f.normal);
  const deckDepth = Math.max(0.15, bridge.deckDepth || 0.4);

  // deck top (wearing surface + curbs + pavement)
  buildDeckTop(lines, cross, out);

  // deck slab: sides + soffit
  const slabBotL = lines.paveL.map((p) => [p[0], p[1], p[2] - deckDepth]);
  const slabBotR = lines.paveR.map((p) => [p[0], p[1], p[2] - deckDepth]);
  out.push(patch('Slab side L', [lines.paveL, slabBotL], COL.concreteDark));
  out.push(patch('Slab side R', [slabBotR, lines.paveR], COL.concreteDark));
  out.push(patch('Slab soffit', [slabBotR, slabBotL], COL.concreteDark));

  // I-girders under the slab
  const girderDepth = Math.max(0.3, bridge.girderDepth || 1.1);
  const gCount = clamp(Math.round(bridge.girderCount || 3), 1, 6);
  const girderSpan = lines.paveR.map((_, i) => i);
  void girderSpan;
  const width = lines.halfW * 2;
  for (let g = 0; g < gCount; g++) {
    const frac = gCount === 1 ? 0.5 : g / (gCount - 1);
    const off = -lines.halfW + frac * width;
    // girder base line runs along the deck at lateral offset `off`, at the soffit
    const base = frames.map((f) => {
      const p = vAdd(f.center, vScale(f.normal, off));
      return [p[0], p[1], p[2] - deckDepth];
    });
    const gnormals = frames.map(() => [1, 0, 0]);
    // I-profile (off, dz), dz measured down from the soffit
    const fl = 0.18; // flange half width
    const ft = 0.09; // flange thickness
    const wt = 0.05; // web half thickness
    const D = girderDepth;
    const iProf = [
      { off: -fl, dz: 0 }, { off: fl, dz: 0 }, { off: fl, dz: -ft },
      { off: wt, dz: -ft }, { off: wt, dz: -(D - ft) }, { off: fl, dz: -(D - ft) },
      { off: fl, dz: -D }, { off: -fl, dz: -D }, { off: -fl, dz: -(D - ft) },
      { off: -wt, dz: -(D - ft) }, { off: -wt, dz: -ft }, { off: -fl, dz: -ft },
    ];
    out.push(...sweepProfile(base, gnormals, iProf, true, COL.girder, `Girder ${g}`));
  }

  // diaphragms between girders (transverse plates) at intervals + near ends
  if (bridge.diaphragms !== false) {
    const total = frames[n - 1].s;
    const step = Math.max(6, Math.min(10, total / 6));
    for (let s = step / 2; s < total; s += step) {
      let i = 0;
      while (i < n - 2 && frames[i + 1].s < s) i++;
      const f = frames[i];
      const yaw = Math.atan2(f.tangent[1], f.tangent[0]) * 180 / Math.PI;
      const cx = f.center[0];
      const cy = f.center[1];
      const cz = f.center[2] - deckDepth - girderDepth / 2;
      out.push(...boxPatches(
        [cx, cy, cz], width * 0.96, 0.12, girderDepth * 0.92, yaw, COL.girder, 'Diaphragm',
      ));
    }
  }

  // piers every pierSpacing (skip a margin near the ends)
  const spacing = Math.max(6, bridge.pierSpacing || 14);
  const total = frames[n - 1].s;
  const groundZ = opt.groundZ ?? 0;
  const pierSize = Math.max(0.3, bridge.pierSize || 0.7);
  const style = bridge.pierStyle || 'bent';
  const round = (bridge.columnShape || 'round') === 'round';
  const sides = round ? 10 : 4;
  const pierStations = [];
  for (let s = spacing; s < total - spacing * 0.5; s += spacing) pierStations.push(s);
  if (pierStations.length === 0 && total > spacing * 1.2) pierStations.push(total / 2);
  for (const s of pierStations) {
    let i = 0;
    while (i < n - 2 && frames[i + 1].s < s) i++;
    const f = frames[i];
    const deckBotZ = f.center[2] - deckDepth;
    const footZ = Math.min(groundZ, deckBotZ - girderDepth - 2);
    const cols = style === 'single' ? 1 : 2;
    const colOff = cols === 2 ? Math.min(lines.halfW * 0.55, width * 0.3) : 0;
    const colXs = cols === 2
      ? [vAdd(f.center, vScale(f.normal, colOff)), vAdd(f.center, vScale(f.normal, -colOff))]
      : [f.center];
    if (style === 'wall') {
      const yaw = Math.atan2(f.tangent[1], f.tangent[0]) * 180 / Math.PI;
      out.push(...boxPatches(
        [f.center[0], f.center[1], (deckBotZ + footZ) / 2],
        width * 0.9, pierSize * 0.6, deckBotZ - footZ, yaw, COL.concrete, 'Pier wall',
      ));
    } else {
      for (const cp of colXs) {
        out.push(...columnPatches(cp[0], cp[1], footZ, deckBotZ, pierSize / 2, sides, COL.concrete, 'Pier col', !round));
      }
      if (cols === 2) {
        // bent cap beam across the two columns
        const yaw = Math.atan2(f.tangent[1], f.tangent[0]) * 180 / Math.PI;
        const cz = deckBotZ - pierSize * 0.4;
        out.push(...boxPatches(
          [f.center[0], f.center[1], cz],
          colOff * 2 + pierSize, pierSize * 0.8, pierSize * 0.8, yaw, COL.concrete, 'Pier cap',
        ));
      }
    }
    // spread footing under each pier line
    const yaw = Math.atan2(f.tangent[1], f.tangent[0]) * 180 / Math.PI;
    const footW = style === 'wall' ? width * 0.9 : (style === 'single' ? pierSize * 2.2 : colOff * 2 + pierSize * 2);
    out.push(...boxPatches(
      [f.center[0], f.center[1], footZ + 0.35],
      footW, pierSize * 1.4, 0.7, yaw, COL.concreteDark, 'Footing',
    ));
    if (bridge.foundation === 'piles') {
      for (const cp of (style === 'wall' || style === 'single' ? [f.center] : colXs)) {
        out.push(...columnPatches(cp[0], cp[1], footZ - 3, footZ, pierSize * 0.3, 8, COL.concreteDark, 'Pile', false));
      }
    }
  }

  // abutments at free ends
  if (bridge.abutment !== false) {
    for (const atStart of [true, false]) {
      const cap = atStart ? opt.capStart : opt.capEnd;
      if (!cap) continue;
      const i = atStart ? 0 : n - 1;
      const f = frames[i];
      const yaw = Math.atan2(f.tangent[1], f.tangent[0]) * 180 / Math.PI;
      const deckBotZ = f.center[2] - deckDepth;
      const footZ = Math.min(groundZ, deckBotZ - 2.5);
      out.push(...boxPatches(
        [f.center[0], f.center[1], (deckBotZ + footZ) / 2],
        width * 0.98, 0.8, deckBotZ - footZ + 0.8, yaw, COL.concrete, 'Abutment',
      ));
    }
  }

  // parapets (or W-beam rails on the deck edge)
  if (bridge.parapet === 'rail') {
    out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0, 0.1, { capStart: opt.capStart, capEnd: opt.capEnd }));
    out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0, 0.1, { capStart: opt.capStart, capEnd: opt.capEnd }));
  } else {
    const ph = Math.max(0.4, bridge.parapetHeight || 1.1);
    buildParapet(lines.paveL, normals, frames, false, ph, opt.rampStartH, opt.rampEndH, out, 'Parapet L');
    buildParapet(lines.paveR, normals, frames, true, ph, opt.rampStartH, opt.rampEndH, out, 'Parapet R');
  }

  // deck drainage scuppers
  if (drainageEnabled(opt)) {
    buildScuppers(lines, groundZ, Math.max(6, (opt.scupperSpacing || 10)), out);
  }

  // markings on the deck
  out.push(...buildMarkings(lines, cross, {
    junctionAtStart: opt.junctionAtStart,
    junctionAtEnd: opt.junctionAtEnd,
  }));

  // deck end caps (seal the slab at dead ends)
  for (const atStart of [true, false]) {
    const cap = atStart ? opt.capStart : opt.capEnd;
    if (!cap) continue;
    const i = atStart ? 0 : n - 1;
    out.push(patch(atStart ? 'Deck cap S' : 'Deck cap E', [
      [slabBotL[i], slabBotR[i]],
      [lines.paveL[i], lines.paveR[i]],
    ], COL.concreteDark));
  }
  return out;
}

function drainageEnabled(opt) {
  return !!(opt && opt.drainage);
}

// --- arch bridge ---------------------------------------------------------------

/**
 * Arch bridge span: deck on parabolic ribs with spandrel columns.
 */
export function buildArchSpan(lines, cross, bridge, rails, opt) {
  const out = [];
  const frames = lines.frames;
  const n = frames.length;
  if (n < 4) return null;
  const normals = frames.map((f) => f.normal);
  const deckDepth = Math.max(0.15, bridge.deckDepth || 0.4);
  const rise = Math.max(1.5, bridge.archRise || 5);
  const total = frames[n - 1].s;
  const groundZ = opt.groundZ ?? 0;

  // deck (slab + surface)
  buildDeckTop(lines, cross, out);
  const slabBotL = lines.paveL.map((p) => [p[0], p[1], p[2] - deckDepth]);
  const slabBotR = lines.paveR.map((p) => [p[0], p[1], p[2] - deckDepth]);
  out.push(patch('Slab side L', [lines.paveL, slabBotL], COL.concreteDark));
  out.push(patch('Slab side R', [slabBotR, lines.paveR], COL.concreteDark));
  out.push(patch('Slab soffit', [slabBotR, slabBotL], COL.concreteDark));

  // arch rib curve in the vertical plane of the alignment: parabola dipping
  // from the springings (deck soffit at the ends) down by `rise` at midspan
  const ribCount = 2;
  const ribOffs = ribCount === 2 ? [-lines.halfW * 0.55, lines.halfW * 0.55] : [0];
  for (let r = 0; r < ribCount; r++) {
    const base = frames.map((f, i) => {
      const t = total > 1e-6 ? frames[i].s / total : 0;
      const dip = rise * 4 * t * (1 - t); // 0 at ends, `rise` at mid
      const p = vAdd(f.center, vScale(f.normal, ribOffs[r]));
      return [p[0], p[1], p[2] - deckDepth - dip];
    });
    const gnormals = frames.map(() => [1, 0, 0]);
    const ribProf = [
      { off: -0.22, dz: 0.25 }, { off: 0.22, dz: 0.25 },
      { off: 0.22, dz: -0.25 }, { off: -0.22, dz: -0.25 },
    ];
    out.push(...sweepProfile(base, gnormals, ribProf, true, COL.girder, `Arch rib ${r}`));
    // spandrel columns from the rib up to the soffit
    const colEvery = 4;
    let acc = 0;
    for (let i = 0; i < n - 1; i++) {
      acc += vLen(vSub(frames[i + 1].center, frames[i].center));
      if (acc < colEvery) continue;
      acc = 0;
      const f = frames[i];
      const t = total > 1e-6 ? f.s / total : 0;
      const dip = rise * 4 * t * (1 - t);
      const top = f.center[2] - deckDepth;
      const bot = top - dip;
      if (top - bot < 0.4) continue;
      const p = vAdd(f.center, vScale(f.normal, ribOffs[r]));
      out.push(...columnPatches(p[0], p[1], bot, top, 0.16, 8, COL.concrete, `Spandrel ${r}`, false));
    }
  }

  // thrust blocks at the springings
  for (const atStart of [true, false]) {
    const i = atStart ? 0 : n - 1;
    const f = frames[i];
    const yaw = Math.atan2(f.tangent[1], f.tangent[0]) * 180 / Math.PI;
    const deckBotZ = f.center[2] - deckDepth;
    const footZ = Math.min(groundZ, deckBotZ - rise - 1);
    out.push(...boxPatches(
      [f.center[0], f.center[1], (deckBotZ + footZ) / 2],
      lines.halfW * 2 * 0.9, 1.2, deckBotZ - footZ + 1, yaw, COL.concrete, 'Thrust block',
    ));
  }

  // parapets
  if (bridge.parapet === 'rail') {
    out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0, 0.1, { capStart: opt.capStart, capEnd: opt.capEnd }));
    out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0, 0.1, { capStart: opt.capStart, capEnd: opt.capEnd }));
  } else {
    const ph = Math.max(0.4, bridge.parapetHeight || 1.1);
    buildParapet(lines.paveL, normals, frames, false, ph, opt.rampStartH, opt.rampEndH, out, 'Parapet L');
    buildParapet(lines.paveR, normals, frames, true, ph, opt.rampStartH, opt.rampEndH, out, 'Parapet R');
  }
  if (drainageEnabled(opt)) {
    buildScuppers(lines, groundZ, Math.max(6, (opt.scupperSpacing || 10)), out);
  }
  out.push(...buildMarkings(lines, cross, {
    junctionAtStart: opt.junctionAtStart,
    junctionAtEnd: opt.junctionAtEnd,
  }));
  return out;
}
