// ---------------------------------------------------------------------------
// roadSpan.js — at-grade road span: surface, gutter channel, curbs,
// pavement (with paving pattern), tub sides/bottom, guardrails, markings and
// dead-end caps. All patches are road-space grids (see math.js).
// ---------------------------------------------------------------------------

import { vLerp, arcLengths, resampleLine } from './math.js';
import { COL, buildGuardRail, buildPavingPattern, buildGrates, makeStrip } from './details.js';
import { buildMarkings } from './markings.js';

const patch = (name, grid, fill_color, alpha = 1) => ({ name, grid, fill_color, alpha });

/** End cap for a dead-end head (the section profile resampled into a wall). */
export function buildEndCap(lines, atStart) {
  const i = atStart ? 0 : lines.frames.length - 1;
  const f = lines.frames[i];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const bottom = resampleLine([lines.botL[i], mid(lines.botL[i], lines.botR[i]), lines.botR[i]], 8);
  const top = resampleLine([
    lines.paveL[i], lines.curbTopL[i], lines.roadL[i], f.center,
    lines.roadR[i], lines.curbTopR[i], lines.paveR[i],
  ], 8);
  if (bottom.length === 8 && top.length === 8) {
    return [patch(atStart ? 'Start cap' : 'End cap', [bottom, top], COL.side)];
  }
  return [];
}

/**
 * Build one road span.
 * @param lines    CrossLines (frames + offset lines, gutter-aware)
 * @param cross    CrossSection
 * @param rails    RailSettings
 * @param drainage DrainageSettings
 * @param opt      { depth, inset, capStart, capEnd, junctionAtStart, junctionAtEnd,
 *                   railLinks: { startL, startR, endL, endR } }
 */
export function buildRoadSpan(lines, cross, rails, drainage, opt) {
  if (lines.frames.length < 2) return [];
  const out = [];
  const normals = lines.frames.map((f) => f.normal);
  const m = cross.markings || {};

  // --- wearing surface + gutter channel ---
  out.push(patch('Road surface', [lines.roadL, lines.roadR], COL.road));
  if (lines.gutter) {
    out.push(patch('Gutter L', [lines.roadL, lines.gutOutL], COL.gutter));
    out.push(patch('Gutter R', [lines.gutOutR, lines.roadR], COL.gutter));
  }

  // --- curbs + pavement ---
  out.push(patch('Left curb', [lines.gutOutL, lines.curbTopL], COL.curb));
  out.push(patch('Left pavement', [lines.paveL, lines.curbTopL], COL.pavement));
  out.push(patch('Right curb', [lines.curbTopR, lines.gutOutR], COL.curb));
  out.push(patch('Right pavement', [lines.curbTopR, lines.paveR], COL.pavement));

  // --- tub: sides + bottom ---
  out.push(patch('Left side', [lines.botL, lines.paveL], COL.side));
  out.push(patch('Right side', [lines.botR, lines.paveR], COL.side));
  out.push(patch('Bottom', [lines.botR, lines.botL], COL.bottom));

  // --- paving patterns (decals on the pavement strips) ---
  if (cross.pavePattern && cross.pavePattern !== 'none') {
    const scale = cross.patternScale || 1;
    const leftStrip = makeStrip(lines.curbTopL, lines.paveL, lines.frames);
    const rightStrip = makeStrip(lines.curbTopR, lines.paveR, lines.frames);
    out.push(...buildPavingPattern(leftStrip, cross.pavePattern, scale));
    out.push(...buildPavingPattern(rightStrip, cross.pavePattern, scale));
  }

  // --- drainage: inlet grates set into the gutter ---
  if (drainage && drainage.enabled && drainage.grates && lines.gutter) {
    const spacing = Math.max(4, drainage.grateSpacing || 14);
    const leftGutter = makeStrip(lines.roadL, lines.gutOutL, lines.frames);
    const rightGutter = makeStrip(lines.gutOutR, lines.roadR, lines.frames);
    out.push(...buildGrates(leftGutter, spacing));
    out.push(...buildGrates(rightGutter, spacing));
  }

  // --- guardrails (W-beam + posts; turned-down terminals at dead ends) ---
  out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0.6, 0.3, {
    capStart: opt.capStart, capEnd: opt.capEnd,
    redirectStart: opt.railLinks?.startL,
    redirectEnd: opt.railLinks?.endL,
  }));
  out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0.6, 0.3, {
    capStart: opt.capStart, capEnd: opt.capEnd,
    redirectStart: opt.railLinks?.startR,
    redirectEnd: opt.railLinks?.endR,
  }));

  // --- markings ---
  out.push(...buildMarkings(lines, cross, {
    junctionAtStart: opt.junctionAtStart,
    junctionAtEnd: opt.junctionAtEnd,
  }));

  // --- dead-end caps ---
  if (opt.capStart) out.push(...buildEndCap(lines, true));
  if (opt.capEnd) out.push(...buildEndCap(lines, false));
  return out;
}
