// Road geometry — segment + N-way junction builders.
//
// Segment builder is a curvature-aware rewrite of Roadnet V3's
// RoadSegmentGenerator: adaptive resampling on curves, slope-correct frames,
// offset clamping so pavement/curbs can never invert on tight radii, battered
// curb faces, pavement crossfall, guard-rail posts, lane markings and end caps.
//
// The junction builder follows the TransitArchitect (GRIT) approach: the
// junction is generated FROM the trimmed approach frames of the adjoining
// runs, with true arc fillets and shared boundary curves — watertight by
// construction.

import {
  Vec3, v_add, v_sub, v_scale, v_len, v_norm, lerp, clamp,
  coonsPatch, arcLengths,
} from './vec';
import type { CrossSection, RailSettings } from './model';

// ---------------------------------------------------------------------------
// Patches
// ---------------------------------------------------------------------------

export interface PatchSpec {
  name: string;
  /** grid[i][j] — rows along the feature, columns across it. */
  grid: Vec3[][];
  fill_color: string;
  alpha: number;
}

export const patch = (name: string, grid: Vec3[][], fill_color: string, alpha = 1): PatchSpec => ({
  name, grid, fill_color, alpha,
});

export function countTriangles(patches: PatchSpec[]): number {
  let n = 0;
  for (const p of patches) {
    if (p.grid.length > 1 && p.grid[0].length > 1) n += (p.grid.length - 1) * (p.grid[0].length - 1) * 2;
  }
  return n;
}

// ---------------------------------------------------------------------------
// V3 palette
// ---------------------------------------------------------------------------

export const COL = {
  road: '#333333',
  curb: '#737373',
  pavement: '#a3a3a3',
  side: '#888888',
  bottom: '#777777',
  rail: '#cbd5e1',
  post: '#52525b',
  markingWhite: '#d9d9d9',
  markingAmber: '#d8b84a',
  concrete: '#9a9a9a',
  concreteDark: '#6f6f6f',
  girder: '#7d7d7d',
  parapet: '#8f8f8f',
} as const;

// ---------------------------------------------------------------------------
// Station frames — curvature-aware resampling + offset clamping.
//
// The V3 bug on curves: offsets were applied blindly, so whenever
// (halfWidth + pavement) exceeded the local radius of curvature the inner
// edge looped back on itself (inverted / pinched pavement and curbs).
// Here we measure the signed curvature radius at every station and clamp
// each offset line to it, smoothed along the alignment.
// ---------------------------------------------------------------------------

export interface StationFrame {
  center: Vec3;
  tangent: Vec3;
  /** Horizontal left-hand normal (widths are measured in plan). */
  normal: Vec3;
  /** Arc distance from the span start. */
  s: number;
  /** Signed curvature radius (+ = curving left). Infinity on straights. */
  rho: number;
  /** Max safe offset before the parallel curve inverts. */
  maxLeft: number;
  maxRight: number;
}

const MAX_TURN_DEG = 4.5;
const MIN_STEP = 0.3;
const MAX_STATIONS = 1400;

function planAngle(a: Vec3, b: Vec3): number {
  const ax = a[0]; const ay = a[1];
  const bx = b[0]; const by = b[1];
  const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cross = ax * by - ay * bx;
  const dot = (ax * bx + ay * by) / (la * lb);
  return Math.atan2(cross, clamp(dot, -1, 1)); // signed, + = left turn
}

/** Adaptive index refinement of a dense polyline. Returns station parameters. */
function adaptiveParams(points: Vec3[]): number[] {
  const keep = new Set<number>([0, points.length - 1]);
  const stack: Array<[number, number, number]> = [[0, points.length - 1, 0]];
  while (stack.length > 0) {
    const [i0, i1, depth] = stack.pop()!;
    if (i1 - i0 < 2 || depth > 8) {
      // still keep sparse intermediate points on long straights
      if (i1 - i0 > 24) {
        const mid = (i0 + i1) >> 1;
        keep.add(mid);
        stack.push([i0, mid, depth + 1]);
        stack.push([mid, i1, depth + 1]);
      } else {
        keep.add(i0); keep.add(i1);
      }
      continue;
    }
    const mid = (i0 + i1) >> 1;
    const d0 = v_sub(points[mid], points[i0]);
    const d1 = v_sub(points[i1], points[mid]);
    const turn = Math.abs(planAngle(d0, d1));
    const longest = Math.max(v_len(d0), v_len(d1));
    if ((turn > (MAX_TURN_DEG * Math.PI) / 180 && longest > MIN_STEP) || longest > 14) {
      keep.add(mid);
      stack.push([i0, mid, depth + 1]);
      stack.push([mid, i1, depth + 1]);
    } else {
      keep.add(i0); keep.add(i1);
      if (i1 - i0 > 24) {
        keep.add(mid);
        stack.push([i0, mid, depth + 1]);
        stack.push([mid, i1, depth + 1]);
      }
    }
  }
  const idx = [...keep].sort((a, b) => a - b);
  // map kept indices to fractional positions for smooth interpolation
  return idx.map((i) => i / (points.length - 1));
}

function sampleDense(points: Vec3[], lengths: number[], total: number, t: number): Vec3 {
  const target = clamp(t, 0, 1) * total;
  let j = 0;
  while (j < points.length - 2 && lengths[j + 1] < target) j++;
  const span = lengths[j + 1] - lengths[j];
  const lt = span <= 1e-9 ? 0 : clamp((target - lengths[j]) / span, 0, 1);
  return lerp(points[j], points[j + 1], lt);
}

export function buildFrames(dense: Vec3[]): StationFrame[] {
  if (dense.length < 2) return [];
  const lengths = arcLengths(dense);
  const total = lengths[lengths.length - 1];
  if (total < 1e-6) return [];

  let params = adaptiveParams(dense);
  if (params.length > MAX_STATIONS) {
    const stride = (params.length - 1) / (MAX_STATIONS - 1);
    params = Array.from({ length: MAX_STATIONS }, (_, i) => params[Math.round(i * stride)]);
  }
  const centers = params.map((t) => sampleDense(dense, lengths, total, t));
  const n = centers.length;

  const tangents: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = centers[Math.max(0, i - 1)];
    const b = centers[Math.min(n - 1, i + 1)];
    tangents.push(v_norm(v_sub(b, a)));
  }
  const normals: Vec3[] = tangents.map((t) => {
    const flat: Vec3 = [-t[1], t[0], 0];
    return v_len(flat) < 1e-6 ? ([1, 0, 0] as Vec3) : v_norm(flat);
  });

  // arc distances of the resampled stations
  const sArr = arcLengths(centers);

  // signed curvature radius per station
  const frames: StationFrame[] = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    const turn = planAngle(tangents[i0], tangents[i1]);
    const ds = Math.max(1e-6, sArr[i1] - sArr[i0]);
    const kappa = turn / ds; // + = turning left
    const rho = Math.abs(kappa) < 1e-7 ? Infinity : 1 / kappa;
    frames.push({ center: centers[i], tangent: tangents[i], normal: normals[i], s: sArr[i], rho, maxLeft: 1e9, maxRight: 1e9 });
  }

  // clamp limits from curvature radius (parallel-curve inversion guard)
  const SAFETY = 0.9;
  for (const f of frames) {
    if (Number.isFinite(f.rho)) {
      if (f.rho > 0) f.maxLeft = Math.max(0.4, f.rho * SAFETY); // inside on the left
      else f.maxRight = Math.max(0.4, -f.rho * SAFETY);
    }
  }
  // smooth the limits along the alignment so width eases in/out of curves
  const smooth = (pick: (f: StationFrame) => number, set: (f: StationFrame, v: number) => void) => {
    const w = 4;
    const vals = frames.map(pick);
    for (let i = 0; i < n; i++) {
      let a = 0; let c = 0;
      for (let k = -w; k <= w; k++) {
        const j = clamp(i + k, 0, n - 1);
        a += vals[j]; c++;
      }
      set(frames[i], a / c);
    }
  };
  smooth((f) => f.maxLeft, (f, v) => { f.maxLeft = v; });
  smooth((f) => f.maxRight, (f, v) => { f.maxRight = v; });
  return frames;
}

// ---------------------------------------------------------------------------
// Cross-section offset lines (shared by roads and bridge decks).
// ---------------------------------------------------------------------------

export interface CrossLines {
  frames: StationFrame[];
  center: Vec3[];
  roadL: Vec3[];
  roadR: Vec3[];
  curbTopL: Vec3[];
  curbTopR: Vec3[];
  paveL: Vec3[];
  paveR: Vec3[];
  botL: Vec3[];
  botR: Vec3[];
  halfW: number;
}

export interface SectionOptions {
  depth: number;
  inset: number;
}

export function computeCrossLines(frames: StationFrame[], cross: CrossSection, opt: SectionOptions): CrossLines {
  const n = frames.length;
  const halfW = Math.max(0.5, cross.width / 2);
  const center: Vec3[] = [];
  const roadL: Vec3[] = [];
  const roadR: Vec3[] = [];
  const curbTopL: Vec3[] = [];
  const curbTopR: Vec3[] = [];
  const paveL: Vec3[] = [];
  const paveR: Vec3[] = [];
  const botL: Vec3[] = [];
  const botR: Vec3[] = [];
  const batter = Math.min(0.04, Math.max(0.015, cross.curbHeight * 0.2));

  for (let i = 0; i < n; i++) {
    const f = frames[i];
    center.push(f.center);
    // road edges, clamped to the curvature limit (never invert)
    const oRoadL = Math.min(halfW, Math.max(0.25, f.maxLeft));
    const oRoadR = Math.min(halfW, Math.max(0.25, f.maxRight));
    const rL = v_add(f.center, v_scale(f.normal, oRoadL));
    const rR = v_add(f.center, v_scale(f.normal, -oRoadR));
    roadL.push(rL);
    roadR.push(rR);
    // curb top: raised + battered slightly inward
    const ctL = v_add(rL, v_scale(f.normal, -batter));
    ctL[2] += cross.curbHeight;
    const ctR = v_add(rR, v_scale(f.normal, batter));
    ctR[2] += cross.curbHeight;
    curbTopL.push(ctL);
    curbTopR.push(ctR);
    // pavement outer edge: clamped, never narrower than the curb + a sliver,
    // with crossfall dropping away from the carriageway
    const reqL = halfW + Math.max(0, cross.paveLeft);
    const reqR = halfW + Math.max(0, cross.paveRight);
    const oPaveL = Math.min(reqL, Math.max(f.maxLeft, oRoadL + 0.03));
    const oPaveR = Math.min(reqR, Math.max(f.maxRight, oRoadR + 0.03));
    const pL = v_add(f.center, v_scale(f.normal, oPaveL));
    pL[2] += cross.curbHeight - Math.max(0, oPaveL - oRoadL) * cross.crossfall;
    const pR = v_add(f.center, v_scale(f.normal, -oPaveR));
    pR[2] += cross.curbHeight - Math.max(0, oPaveR - oRoadR) * cross.crossfall;
    paveL.push(pL);
    paveR.push(pR);
    // superstructure bottom (inset from the pavement edge)
    const oBotL = Math.max(oRoadL * 0.5, oPaveL - opt.inset);
    const oBotR = Math.max(oRoadR * 0.5, oPaveR - opt.inset);
    const bL = v_add(f.center, v_scale(f.normal, oBotL));
    bL[2] -= opt.depth;
    const bR = v_add(f.center, v_scale(f.normal, -oBotR));
    bR[2] -= opt.depth;
    botL.push(bL);
    botR.push(bR);
  }
  return { frames, center, roadL, roadR, curbTopL, curbTopR, paveL, paveR, botL, botR, halfW };
}

// ---------------------------------------------------------------------------
// Guard rails (W-beam + posts). `base` sits on the pavement/deck edge.
// ---------------------------------------------------------------------------

export function buildGuardRail(
  base: Vec3[],
  normals: Vec3[],
  pointRight: boolean,
  rails: RailSettings,
  postDrop = 0,
  /** Shift the rail line inward (onto the pavement) so posts embed in structure. */
  baseInset = 0,
): PatchSpec[] {
  if (!rails.enabled || rails.height <= 0 || rails.thickness <= 0) return [];
  const out: PatchSpec[] = [];
  if (baseInset !== 0) {
    base = base.map((p, i) => {
      const n = normals[i];
      // inward == opposite of the rail offset direction
      const s = pointRight ? 1 : -1;
      return [p[0] + n[0] * s * baseInset, p[1] + n[1] * s * baseInset, p[2]] as Vec3;
    });
  }
  const hTop = rails.height * 0.8;
  const hBottom = rails.height * 0.4;
  const hMid = (hTop + hBottom) / 2;
  const hQ3 = hBottom + (hTop - hBottom) * 0.75;
  const hQ1 = hBottom + (hTop - hBottom) * 0.25;
  const profile = [
    { offset: rails.thickness, z: hTop },
    { offset: 0, z: hQ3 },
    { offset: rails.thickness, z: hMid },
    { offset: 0, z: hQ1 },
    { offset: rails.thickness, z: hBottom },
  ];
  const lines = profile.map((prof) =>
    base.map((p, i) => {
      const n = normals[i];
      const nx = pointRight ? -n[0] : n[0];
      const ny = pointRight ? -n[1] : n[1];
      return [p[0] + nx * prof.offset, p[1] + ny * prof.offset, p[2] + prof.z] as Vec3;
    }),
  );
  for (let i = 0; i < profile.length - 1; i++) {
    out.push(patch(`Rail strip ${i}`, pointRight ? [lines[i], lines[i + 1]] : [lines[i + 1], lines[i]], COL.rail));
  }

  if (rails.posts) {
    const postSize = 0.15;
    const ph = postSize / 2;
    const off = rails.thickness + ph;
    let dist = 0;
    for (let i = 0; i < base.length; i++) {
      if (i > 0) {
        dist += Math.hypot(base[i][0] - base[i - 1][0], base[i][1] - base[i - 1][1]);
      }
      const last = i === base.length - 1;
      if (i !== 0 && !last && dist < rails.postSpacing) continue;
      dist = 0;
      const p = base[i];
      const n = normals[i];
      const nx = pointRight ? -n[0] : n[0];
      const ny = pointRight ? -n[1] : n[1];
      // tangent for the post's planform orientation
      const a = base[Math.max(0, i - 1)];
      const b = base[Math.min(base.length - 1, i + 1)];
      let tx = b[0] - a[0]; let ty = b[1] - a[1];
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-6) { tx = 1; ty = 0; } else { tx /= tl; ty /= tl; }
      const cx = p[0] + nx * off;
      const cy = p[1] + ny * off;
      const z0 = p[2] - postDrop;
      const z1 = p[2] + hTop;
      const px = (sx: number, sy: number): Vec3 => [cx + nx * sx + tx * sy, cy + ny * sx + ty * sy, 0];
      const c00 = px(-ph, ph); const c01 = px(-ph, -ph);
      const c10 = px(ph, ph); const c11 = px(ph, -ph);
      const q = (c: Vec3, z: number): Vec3 => [c[0], c[1], z];
      out.push(patch('Post', [[q(c00, z0), q(c01, z0)], [q(c00, z1), q(c01, z1)]], COL.post));
      out.push(patch('Post', [[q(c11, z0), q(c10, z0)], [q(c11, z1), q(c10, z1)]], COL.post));
      out.push(patch('Post', [[q(c10, z0), q(c00, z0)], [q(c10, z1), q(c00, z1)]], COL.post));
      out.push(patch('Post', [[q(c01, z0), q(c11, z0)], [q(c01, z1), q(c11, z1)]], COL.post));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lane markings — thin strips floating just above the wearing surface.
// ---------------------------------------------------------------------------

interface MarkingRun { left: Vec3[]; right: Vec3[] }

function dashedRuns(
  frames: StationFrame[], offset: number, width: number, lift: number, dash: number, gap: number, phase = 0,
): MarkingRun[] {
  const runs: MarkingRun[] = [];
  let cur: MarkingRun | null = null;
  const period = dash + gap;
  for (const f of frames) {
    const t = ((f.s + phase) % period + period) % period;
    const inside = t < dash;
    // taper the ends: skip the first/last station of each dash
    if (inside) {
      const c = v_add(f.center, v_scale(f.normal, offset));
      const hw = width / 2;
      const l = v_add(c, v_scale(f.normal, hw)); l[2] += lift;
      const r = v_add(c, v_scale(f.normal, -hw)); r[2] += lift;
      if (!cur) { cur = { left: [], right: [] }; runs.push(cur); }
      cur.left.push(l);
      cur.right.push(r);
    } else {
      cur = null;
    }
  }
  return runs.filter((r) => r.left.length >= 2);
}

function solidStrip(frames: StationFrame[], offset: number, width: number, lift: number): MarkingRun | null {
  if (frames.length < 2) return null;
  const hw = width / 2;
  const left: Vec3[] = [];
  const right: Vec3[] = [];
  for (const f of frames) {
    const c = v_add(f.center, v_scale(f.normal, offset));
    const l = v_add(c, v_scale(f.normal, hw)); l[2] += lift;
    const r = v_add(c, v_scale(f.normal, -hw)); r[2] += lift;
    left.push(l);
    right.push(r);
  }
  return { left, right };
}

export function buildMarkings(lines: CrossLines, cross: CrossSection): PatchSpec[] {
  const out: PatchSpec[] = [];
  const lift = 0.02;
  const halfW = lines.halfW;
  if (cross.showCenterLine && halfW > 1.2) {
    for (const run of dashedRuns(lines.frames, 0, 0.15, lift, 3, 6)) {
      out.push(patch('Center line', [run.left, run.right], COL.markingAmber));
    }
  }
  if (cross.showEdgeLines && halfW > 1.6) {
    const off = halfW - 0.45;
    const l = solidStrip(lines.frames, off, 0.12, lift);
    const r = solidStrip(lines.frames, -off, 0.12, lift);
    if (l) out.push(patch('Edge line L', [l.left, l.right], COL.markingWhite));
    if (r) out.push(patch('Edge line R', [r.left, r.right], COL.markingWhite));
  }
  if (cross.showLaneLines && cross.lanes > 1) {
    for (let k = 1; k < cross.lanes; k++) {
      const off = -halfW + (2 * halfW * k) / cross.lanes;
      if (Math.abs(off) < 0.05 && cross.showCenterLine) continue;
      for (const run of dashedRuns(lines.frames, off, 0.12, lift, 3, 4.5, k * 1.7)) {
        out.push(patch('Lane line', [run.left, run.right], COL.markingWhite));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// End caps for dead-end heads (the section profile resampled into a wall).
// ---------------------------------------------------------------------------

function resampleLine(pts: Vec3[], count: number): Vec3[] {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: count }, () => [...pts[0]] as Vec3);
  const L = arcLengths(pts);
  const total = L[L.length - 1];
  if (total < 1e-9) return Array.from({ length: count }, () => [...pts[0]] as Vec3);
  const out: Vec3[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = (total * i) / (count - 1);
    while (j < pts.length - 2 && L[j + 1] < t) j++;
    const span = L[j + 1] - L[j];
    out.push(lerp(pts[j], pts[j + 1], span <= 1e-9 ? 0 : clamp((t - L[j]) / span, 0, 1)));
  }
  return out;
}

export function buildEndCap(lines: CrossLines, atStart: boolean): PatchSpec[] {
  const i = atStart ? 0 : lines.frames.length - 1;
  const f = lines.frames[i];
  const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const bottom = resampleLine(
    [lines.botL[i], mid(lines.botL[i], lines.botR[i]), lines.botR[i]], 8,
  );
  const top = resampleLine(
    [
      lines.paveL[i], lines.curbTopL[i], lines.roadL[i], f.center,
      lines.roadR[i], lines.curbTopR[i], lines.paveR[i],
    ],
    8,
  );
  if (bottom.length === 8 && top.length === 8) {
    return [patch(atStart ? 'Start cap' : 'End cap', [bottom, top], COL.side)];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Road span builder.
// ---------------------------------------------------------------------------

export interface SpanOptions extends SectionOptions {
  capStart: boolean;
  capEnd: boolean;
}

export function buildRoadSpan(
  lines: CrossLines,
  cross: CrossSection,
  rails: RailSettings,
  opt: SpanOptions,
): PatchSpec[] {
  if (lines.frames.length < 2) return [];
  const out: PatchSpec[] = [];
  const normals = lines.frames.map((f) => f.normal);

  out.push(patch('Road surface', [lines.roadL, lines.roadR], COL.road));
  out.push(patch('Left curb', [lines.roadL, lines.curbTopL], COL.curb));
  out.push(patch('Left pavement', [lines.paveL, lines.curbTopL], COL.pavement));
  out.push(patch('Right curb', [lines.curbTopR, lines.roadR], COL.curb));
  out.push(patch('Right pavement', [lines.curbTopR, lines.paveR], COL.pavement));
  out.push(patch('Left side', [lines.botL, lines.paveL], COL.side));
  out.push(patch('Right side', [lines.botR, lines.paveR], COL.side));
  out.push(patch('Bottom', [lines.botR, lines.botL], COL.bottom));

  out.push(...buildGuardRail(lines.paveL, normals, false, rails, 0.6, 0.3));
  out.push(...buildGuardRail(lines.paveR, normals, true, rails, 0.6, 0.3));
  out.push(...buildMarkings(lines, cross));

  if (opt.capStart) out.push(...buildEndCap(lines, true));
  if (opt.capEnd) out.push(...buildEndCap(lines, false));
  return out;
}

// ---------------------------------------------------------------------------
// Merged N-way junction — TransitArchitect-style topology.
//
// Unlike the old hub (an independent island pinned to mouth centres), this
// junction is built FROM the trimmed approach frames of the adjoining runs,
// so every boundary curve is shared exactly with a span end: watertight by
// construction. Corners are true tangent-continuous arcs; curb and pavement
// corner layers are offsets of the same road fillet with pinned endpoints.
// ---------------------------------------------------------------------------

/** Approach cross-section at a run's trimmed end, oriented into the junction. */
export interface ApproachFrame {
  /** Trim point (== span end centre, shared exactly). */
  point: Vec3;
  /** Unit arrival tangent, pointing INTO the junction. */
  tangent: Vec3;
  /** Unit left normal of the arrival tangent. */
  left: Vec3;
  roadL: Vec3;
  roadR: Vec3;
  curbL: Vec3;
  curbR: Vec3;
  paveL: Vec3;
  paveR: Vec3;
  /** Superstructure bottom corners (span bottom edge, shared exactly). */
  botL: Vec3;
  botR: Vec3;
  /** atan2(tangent.y, tangent.x) — sort key around the junction. */
  angle: number;
}

export interface JunctionLeg extends ApproachFrame {
  splineId: string;
  splineName: string;
  color: string;
}

export interface MergedJunctionOptions {
  /** Node position (road space). */
  center: Vec3;
  cornerRadius: number;
  filletSteps: number;
  /** Tub depth below the surface. */
  depth: number;
  rails: RailSettings;
}

/**
 * True circular fillet arc between two road-edge points with arrival
 * tangents. Returns [P1, ...arc..., P2] (endpoints included).
 */
export function filletBetweenEdges(
  p1: Vec3, t1: Vec3,
  p2: Vec3, t2: Vec3,
  radius: number,
  steps = 8,
): Vec3[] {
  const straight = (): Vec3[] => [[...p1] as Vec3, [...p2] as Vec3];
  let dax = t1[0]; let day = t1[1];
  let dbx = t2[0]; let dby = t2[1];
  const la = Math.hypot(dax, day);
  const lb = Math.hypot(dbx, dby);
  if (la < 1e-3 || lb < 1e-3) return straight();
  dax /= la; day /= la; dbx /= lb; dby /= lb;

  // intersect the OUTWARD rays (reversed arrival tangents) -> sharp corner V
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-3) return straight();
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const t = (dx * dby - dy * dbx) / denom;
  const vx = p1[0] + dax * t;
  const vy = p1[1] + day * t;
  if ((vx - p1[0]) * dax + (vy - p1[1]) * day < -0.05) return straight();
  if ((vx - p2[0]) * dbx + (vy - p2[1]) * dby < -0.05) return straight();

  // VA/VB point from V back toward the trim points
  const vax = -dax; const vay = -day;
  const vbx = -dbx; const vby = -dby;
  const daDist = Math.hypot(p1[0] - vx, p1[1] - vy);
  const dbDist = Math.hypot(p2[0] - vx, p2[1] - vy);
  const cosTheta = clamp(vax * vbx + vay * vby, -1, 1);
  const theta = Math.acos(cosTheta);
  if (theta < 0.02 || theta > Math.PI - 0.02) return straight();
  const alpha = theta * 0.5;
  const tanA = Math.tan(alpha);
  const sinA = Math.sin(alpha);
  if (tanA < 1e-3 || sinA < 1e-3) return straight();

  let T = radius / tanA;
  const tMax = Math.min(Math.max(daDist, 0), Math.max(dbDist, 0)) * 0.95;
  let r = radius;
  if (T > tMax) {
    T = tMax;
    r = T * tanA;
  }
  const tpx = vx + vax * T; const tpy = vy + vay * T;
  const tqx = vx + vbx * T; const tqy = vy + vby * T;

  let bdx = vax + vbx; let bdy = vay + vby;
  const bl = Math.hypot(bdx, bdy);
  if (bl < 1e-3) return straight();
  bdx /= bl; bdy /= bl;
  const cx = vx + bdx * (r / sinA);
  const cy = vy + bdy * (r / sinA);

  const aStart = Math.atan2(tpy - cy, tpx - cx);
  const aEnd = Math.atan2(tqy - cy, tqx - cx);
  let delta = aEnd - aStart;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const out: Vec3[] = [[...p1] as Vec3];
  for (let i = 0; i <= steps; i++) {
    const f = steps === 0 ? 0 : i / steps;
    const a = aStart + delta * f;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, p1[2] + (p2[2] - p1[2]) * f]);
  }
  out.push([...p2] as Vec3);
  return out;
}

/**
 * Offset a base curve toward start/end targets, interpolating width and Z,
 * with endpoints pinned EXACTLY to the targets (the merge guarantee).
 */
export function offsetCurveFromTargets(base: Vec3[], startTarget: Vec3, endTarget: Vec3): Vec3[] {
  if (base.length === 0) return [];
  if (base.length === 1) return [[...startTarget] as Vec3];
  const startDelta = v_sub(startTarget, base[0]);
  const endDelta = v_sub(endTarget, base[base.length - 1]);
  const tangentAt = (i: number): [number, number] => {
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(base.length - 1, i + 1)];
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l <= 1e-3) return [1, 0];
    return [dx / l, dy / l];
  };
  // pick the normal sign that agrees with the targets
  const t0 = tangentAt(0);
  const tn = tangentAt(base.length - 1);
  const n0: [number, number] = [-t0[1], t0[0]];
  const nn: [number, number] = [-tn[1], tn[0]];
  const pos = n0[0] * startDelta[0] + n0[1] * startDelta[1] + nn[0] * endDelta[0] + nn[1] * endDelta[1];
  const neg = -n0[0] * startDelta[0] - n0[1] * startDelta[1] - nn[0] * endDelta[0] - nn[1] * endDelta[1];
  const sign = pos >= neg ? 1 : -1;

  const total = base.length - 1;
  const startW = Math.hypot(startDelta[0], startDelta[1]);
  const endW = Math.hypot(endDelta[0], endDelta[1]);
  const out: Vec3[] = [];
  for (let i = 0; i < base.length; i++) {
    const f = total === 0 ? 0 : i / total;
    const t = tangentAt(i);
    let nx = -t[1] * sign;
    let ny = t[0] * sign;
    const nl = Math.hypot(nx, ny);
    if (nl <= 1e-3) {
      nx = startW > 1e-3 ? startDelta[0] / startW : 0;
      ny = startW > 1e-3 ? startDelta[1] / startW : 1;
    } else {
      nx /= nl; ny /= nl;
    }
    const w = (1 - f) * startW + f * endW;
    const z = (1 - f) * startDelta[2] + f * endDelta[2];
    const p = base[i];
    out.push([p[0] + nx * w, p[1] + ny * w, p[2] + z]);
  }
  out[0] = [...startTarget] as Vec3;
  out[out.length - 1] = [...endTarget] as Vec3;
  return out;
}

/** Coons patch with boundary resampling to compatible counts. */
export function coonsBlend(
  bottom: Vec3[], top: Vec3[], left: Vec3[], right: Vec3[],
  uSeg: number, vSeg: number,
): Vec3[][] {
  return coonsPatch(
    resampleLine(bottom, uSeg + 1),
    resampleLine(top, uSeg + 1),
    resampleLine(left, vSeg + 1),
    resampleLine(right, vSeg + 1),
  );
}

/** Eased spoke from A to B (points cluster near B). */
function easedSpoke(a: Vec3, b: Vec3, count: number, easeOut: boolean): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1);
    const e = easeOut ? 1 - Math.pow(1 - f, 1.5) : Math.pow(f, 1.5);
    out.push(lerp(a, b, e));
  }
  return out;
}

/**
 * Merged junction — every boundary curve is shared exactly with a span end
 * (approach frames), so runs flow into the junction with no gaps or overlaps.
 */
export function buildMergedJunction(legs: JunctionLeg[], o: MergedJunctionOptions): PatchSpec[] {
  const out: PatchSpec[] = [];
  if (legs.length < 2) return out;
  const sorted = [...legs].sort((a, b) => a.angle - b.angle);
  const N = sorted.length;
  const C = o.center;
  const depth = Math.max(0.3, o.depth);
  const drop = (p: Vec3): Vec3 => [p[0], p[1], p[2] - depth];
  const filletR = Math.max(o.cornerRadius * 0.6, 1.5);

  // 1. road fillets per corner + curb/pavement layers offset from the same
  //    fillet, endpoints pinned to the approach cross-sections
  const roadF: Vec3[][] = [];
  const curbF: Vec3[][] = [];
  const paveF: Vec3[][] = [];
  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];
    let f = filletBetweenEdges(cur.roadR, cur.tangent, nxt.roadL, nxt.tangent, filletR, o.filletSteps);
    f = resampleLine(f, Math.max(o.filletSteps, f.length - 1) + 1);
    roadF.push(f);
    const cf = offsetCurveFromTargets(f, cur.curbR, nxt.curbL);
    curbF.push(cf);
    paveF.push(offsetCurveFromTargets(cf, cur.paveR, nxt.paveL));
  }

  // 2. interior top — same asphalt as the roads so the joints disappear
  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];
    const f = roadF[i];
    const half = Math.floor((f.length - 1) / 2) + 1;
    const h1 = f.slice(0, half);
    const h2 = f.slice(half - 1);
    const s1 = Math.max(1, h1.length - 1);
    const s2 = Math.max(1, h2.length - 1);
    out.push(patch(
      `Junction top ${i}a`,
      coonsBlend([cur.point, cur.roadR], [C, h1[h1.length - 1]], easedSpoke(cur.point, C, s1 + 1, true), h1, 1, s1),
      COL.road,
    ));
    out.push(patch(
      `Junction top ${i}b`,
      coonsBlend([C, h2[0]], [nxt.point, nxt.roadL], easedSpoke(C, nxt.point, s2 + 1, false), h2, 1, s2),
      COL.road,
    ));
  }

  // 3. corner curb + pavement strips (shared fillet boundaries)
  for (let i = 0; i < N; i++) {
    out.push(patch(`Junction curb ${i}`, [roadF[i], curbF[i]], COL.curb));
    const mid = curbF[i].map((p, k) => lerp(p, paveF[i][k], 0.5));
    out.push(patch(`Junction pavement ${i}`, [curbF[i], mid, paveF[i]], COL.pavement));
  }

  // 4. tub — side walls + bottom membrane, all edges shared with span ends.
  // Side-wall bottom rims are pinned to the span bottom corners; the membrane
  // approach edges ARE the span bottom edges (no flicker, no slots).
  const Cd = drop(C);
  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];
    const base = paveF[i].map(drop);
    base[0] = [...cur.botR] as Vec3;
    base[base.length - 1] = [...nxt.botL] as Vec3;
    out.push(patch(`Junction side ${i}`, [paveF[i], base], COL.side));
    const half = Math.floor((base.length - 1) / 2) + 1;
    const b1 = base.slice(0, half);
    const b2 = base.slice(half - 1);
    const s1 = Math.max(1, b1.length - 1);
    const s2 = Math.max(1, b2.length - 1);
    const midCur: Vec3 = [
      (cur.botL[0] + cur.botR[0]) / 2,
      (cur.botL[1] + cur.botR[1]) / 2,
      (cur.botL[2] + cur.botR[2]) / 2,
    ];
    const midNxt: Vec3 = [
      (nxt.botL[0] + nxt.botR[0]) / 2,
      (nxt.botL[1] + nxt.botR[1]) / 2,
      (nxt.botL[2] + nxt.botR[2]) / 2,
    ];
    out.push(patch(
      `Junction bottom ${i}a`,
      coonsBlend([midCur, cur.botR], [Cd, b1[b1.length - 1]], easedSpoke(midCur, Cd, s1 + 1, true), b1, 1, s1),
      COL.bottom,
    ));
    out.push(patch(
      `Junction bottom ${i}b`,
      coonsBlend([Cd, b2[0]], [midNxt, nxt.botL], easedSpoke(Cd, midNxt, s2 + 1, false), b2, 1, s2),
      COL.bottom,
    ));
  }

  // 5. guardrails along the pavement fillets (posts embedded in the tub)
  if (o.rails.enabled) {
    for (let i = 0; i < N; i++) {
      const curve = paveF[i];
      const normals: Vec3[] = curve.map((_, k) => {
        const a = curve[Math.max(0, k - 1)];
        const b = curve[Math.min(curve.length - 1, k + 1)];
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        const l = Math.hypot(dx, dy);
        if (l < 1e-9) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
        return [-dy, dx, 0] as Vec3;
      });
      out.push(...buildGuardRail(curve, normals, true, o.rails, 0.6, 0.3));
    }
  }
  return out;
}

