// Road geometry — segment + N-way junction builders.
//
// Segment builder is a curvature-aware rewrite of Roadnet V3's
// RoadSegmentGenerator: adaptive resampling on curves, slope-correct frames,
// offset clamping so pavement/curbs can never invert on tight radii, battered
// curb faces, pavement crossfall, guard-rail posts, lane markings and end caps.
//
// The junction builder is a faithful port of Roadnet V3's
// NWayJunctionGenerator (Coons-patch hub + quadratic corner fillets), which is
// the clean topology we want to keep.

import {
  Vec3, v_add, v_sub, v_scale, v_dot, v_len, v_norm, lerp, clamp,
  left_normal, angle_unit, sampleBezierQuadratic, sampleBezierCubic,
  sampleLinear, coonsPatch, arcLengths,
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
  hub: '#d4d4d4',
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
): PatchSpec[] {
  if (!rails.enabled || rails.height <= 0 || rails.thickness <= 0) return [];
  const out: PatchSpec[] = [];
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
  postDrop: number;
}

export function buildRoadSpan(
  frames: StationFrame[],
  cross: CrossSection,
  rails: RailSettings,
  opt: SpanOptions,
): PatchSpec[] {
  if (frames.length < 2) return [];
  const out: PatchSpec[] = [];
  const lines = computeCrossLines(frames, cross, opt);
  const normals = frames.map((f) => f.normal);

  out.push(patch('Road surface', [lines.roadL, lines.roadR], COL.road));
  out.push(patch('Left curb', [lines.roadL, lines.curbTopL], COL.curb));
  out.push(patch('Left pavement', [lines.paveL, lines.curbTopL], COL.pavement));
  out.push(patch('Right curb', [lines.curbTopR, lines.roadR], COL.curb));
  out.push(patch('Right pavement', [lines.curbTopR, lines.paveR], COL.pavement));
  out.push(patch('Left side', [lines.botL, lines.paveL], COL.side));
  out.push(patch('Right side', [lines.botR, lines.paveR], COL.side));
  out.push(patch('Bottom', [lines.botR, lines.botL], COL.bottom));

  out.push(...buildGuardRail(lines.paveL, normals, false, rails, opt.postDrop));
  out.push(...buildGuardRail(lines.paveR, normals, true, rails, opt.postDrop));
  out.push(...buildMarkings(lines, cross));

  if (opt.capStart) out.push(...buildEndCap(lines, true));
  if (opt.capEnd) out.push(...buildEndCap(lines, false));
  return out;
}

// ---------------------------------------------------------------------------
// N-way junction generator — faithful port of Roadnet V3's hub topology.
// ---------------------------------------------------------------------------

export interface ArmSpec {
  id: string;
  name: string;
  angle_deg: number;
  outer_height: number;
  fill_color: string;
  width: number;
  pavement_width_left: number;
  pavement_width_right: number;
  curb_height: number;
  slope?: number;
  getZAtRadius?: (r: number) => { z: number; dz: number };
}

export function createRadialCurve(center: Vec3, edge: Vec3, dz: number, count: number): Vec3[] {
  const dist = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
  if (dist === 0) return sampleLinear(center, edge, count);
  const handleLen = dist / 3;
  const dirX = (center[0] - edge[0]) / dist;
  const dirY = (center[1] - edge[1]) / dist;
  const p2: Vec3 = [edge[0] + dirX * handleLen, edge[1] + dirY * handleLen, edge[2] - dz * handleLen];
  const p1: Vec3 = [center[0] - dirX * handleLen, center[1] - dirY * handleLen, center[2]];
  return sampleBezierCubic(center, p1, p2, edge, count);
}

export interface JunctionBuildOptions {
  height: number;
  railHeight: number;
  railThickness: number;
  railPosts: boolean;
  depth: number;
  inset: number;
}

export class NWayJunctionGenerator {
  center: Vec3;
  hub_div: number;
  fillet_radius: number;

  constructor(center: Vec3, hub_div: number, fillet_radius = 5) {
    this.center = center;
    this.hub_div = hub_div;
    this.fillet_radius = fillet_radius;
  }

  build_case(
    arms: ArmSpec[],
    o: JunctionBuildOptions,
  ): { patches: PatchSpec[]; armData: { id: string; R: number; MC: Vec3 }[] } {
    const sorted = [...arms].sort((a, b) => a.angle_deg - b.angle_deg);
    const N = sorted.length;
    const depth = o.depth;
    const inset = o.inset;
    const intersection_height = o.height;

    const D: Vec3[] = [];
    const Norm: Vec3[] = [];
    const HalfW: number[] = [];
    const PaveL: number[] = [];
    const PaveR: number[] = [];
    for (let i = 0; i < N; i++) {
      D.push(angle_unit(sorted[i].angle_deg));
      Norm.push(left_normal(D[i]));
      HalfW.push(sorted[i].width * 0.5);
      PaveL.push(sorted[i].pavement_width_left);
      PaveR.push(sorted[i].pavement_width_right);
    }

    // Corner intersections (inner / outer / bottom)
    const C: Vec3[] = [];
    const C_outer: Vec3[] = [];
    const C_bottom: Vec3[] = [];
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const d1 = D[i];
      const d2 = D[next];
      const det = d1[0] * d2[1] - d1[1] * d2[0];
      const intersect = (offA: number, offB: number, fallback: number, z: number): Vec3 => {
        const p1 = v_add(this.center, v_scale(Norm[i], offA));
        const p2 = v_add(this.center, v_scale(Norm[next], offB));
        let c: Vec3;
        if (Math.abs(det) < 1e-6) {
          c = v_add(p1, v_scale(d1, fallback));
        } else {
          const dx = p2[0] - p1[0];
          const dy = p2[1] - p1[1];
          const t1 = (dx * d2[1] - dy * d2[0]) / det;
          c = v_add(p1, v_scale(d1, t1));
        }
        c[2] = z;
        return c;
      };
      C.push(intersect(HalfW[i], -HalfW[next], HalfW[i] * 2, 0));
      C_outer.push(intersect(HalfW[i] + PaveL[i], -(HalfW[next] + PaveR[next]), (HalfW[i] + PaveL[i]) * 2, 0));
      C_bottom.push(
        intersect(
          HalfW[i] + PaveL[i] - inset,
          -(HalfW[next] + PaveR[next] - inset),
          (HalfW[i] + PaveL[i] - inset) * 2,
          intersection_height - depth,
        ),
      );
    }

    // Mouth radius per arm
    const R: number[] = [];
    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const projL = v_dot(v_sub(C[i], this.center), D[i]);
      const projR = v_dot(v_sub(C[prev], this.center), D[i]);
      const projOuterL = v_dot(v_sub(C_outer[i], this.center), D[i]);
      const projOuterR = v_dot(v_sub(C_outer[prev], this.center), D[i]);
      R.push(Math.max(projL, projR, projOuterL, projOuterR) + this.fillet_radius);
    }

    // Mouth points
    const MC: Vec3[] = [];
    const ML: Vec3[] = [];
    const MR: Vec3[] = [];
    const ML_outer: Vec3[] = [];
    const MR_outer: Vec3[] = [];
    const ML_bottom: Vec3[] = [];
    const MR_bottom: Vec3[] = [];
    for (let i = 0; i < N; i++) {
      const mc = v_add(this.center, v_scale(D[i], R[i]));
      MC.push(mc);
      ML.push(v_add(mc, v_scale(Norm[i], HalfW[i])));
      MR.push(v_sub(mc, v_scale(Norm[i], HalfW[i])));
      ML_outer.push(v_add(mc, v_scale(Norm[i], HalfW[i] + PaveL[i])));
      MR_outer.push(v_sub(mc, v_scale(Norm[i], HalfW[i] + PaveR[i])));
      const mlb = v_add(mc, v_scale(Norm[i], HalfW[i] + PaveL[i] - inset));
      mlb[2] = intersection_height - depth;
      ML_bottom.push(mlb);
      const mrb = v_sub(mc, v_scale(Norm[i], HalfW[i] + PaveR[i] - inset));
      mrb[2] = intersection_height - depth;
      MR_bottom.push(mrb);
    }

    const P_center: Vec3 = [this.center[0], this.center[1], intersection_height];
    const P_center_bottom: Vec3 = [this.center[0], this.center[1], intersection_height - depth];
    const MC_bottom: Vec3[] = [];
    let sumZ = 0;
    const armDz: number[] = [];
    for (let i = 0; i < N; i++) {
      let z = intersection_height;
      let dz = 0;
      if (sorted[i].getZAtRadius) {
        const res = sorted[i].getZAtRadius!(R[i]);
        z = res.z;
        dz = res.dz;
      } else {
        const slope = sorted[i].slope || 0;
        z = intersection_height + slope * R[i];
        dz = slope;
      }
      armDz.push(dz);
      MC[i][2] = z;
      ML[i][2] = z;
      MR[i][2] = z;
      ML_outer[i][2] = z;
      MR_outer[i][2] = z;
      ML_bottom[i][2] = z - depth;
      MR_bottom[i][2] = z - depth;
      sumZ += z;
    }
    P_center[2] = sumZ / N;
    P_center_bottom[2] = P_center[2] - depth;

    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      const z = (ML[i][2] + MR[next][2]) / 2;
      C[i][2] = z;
      C_outer[i][2] = z;
      C_bottom[i][2] = z - depth;
      MC_bottom.push([MC[i][0], MC[i][1], MC[i][2] - depth]);
    }

    const ArcMid: Vec3[] = [];
    const ArcMid_bottom: Vec3[] = [];
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      ArcMid.push([
        0.25 * ML[i][0] + 0.5 * C[i][0] + 0.25 * MR[next][0],
        0.25 * ML[i][1] + 0.5 * C[i][1] + 0.25 * MR[next][1],
        (ML[i][2] + C[i][2] * 2 + MR[next][2]) / 4,
      ]);
      ArcMid_bottom.push([
        0.25 * ML_bottom[i][0] + 0.5 * C_bottom[i][0] + 0.25 * MR_bottom[next][0],
        0.25 * ML_bottom[i][1] + 0.5 * C_bottom[i][1] + 0.25 * MR_bottom[next][1],
        (ML_bottom[i][2] + C_bottom[i][2] * 2 + MR_bottom[next][2]) / 4,
      ]);
    }

    const patches: PatchSpec[] = [];
    const arcDz: number[] = [];
    for (let i = 0; i < N; i++) {
      const next = (i + 1) % N;
      arcDz.push((armDz[i] + armDz[next]) / 2);
    }

    const railOpts: RailSettings = {
      enabled: o.railHeight > 0,
      height: o.railHeight,
      thickness: o.railThickness,
      posts: o.railPosts,
      postSpacing: 2,
    };

    for (let i = 0; i < N; i++) {
      const prev = (i - 1 + N) % N;
      const next = (i + 1) % N;
      const curbH = sorted[i].curb_height;

      const fullArcPrev = sampleBezierQuadratic(ML[prev], C[prev], MR[i], 2 * this.hub_div + 1);
      const rightArcHalf = fullArcPrev.slice(this.hub_div, 2 * this.hub_div + 1);
      patches.push(
        patch(
          `Hub Right ${i}`,
          coonsPatch(
            createRadialCurve(P_center, ArcMid[prev], arcDz[prev], this.hub_div + 1),
            sampleLinear(MC[i], MR[i], this.hub_div + 1),
            createRadialCurve(P_center, MC[i], armDz[i], this.hub_div + 1),
            rightArcHalf,
          ),
          COL.hub,
        ),
      );

      const fullArcPrevB = sampleBezierQuadratic(ML_bottom[prev], C_bottom[prev], MR_bottom[i], 2 * this.hub_div + 1);
      const rightArcHalfB = fullArcPrevB.slice(this.hub_div, 2 * this.hub_div + 1);
      patches.push(
        patch(
          `Hub Right Bottom ${i}`,
          coonsPatch(
            createRadialCurve(P_center_bottom, ArcMid_bottom[prev], arcDz[prev], this.hub_div + 1),
            sampleLinear(MC_bottom[i], MR_bottom[i], this.hub_div + 1),
            createRadialCurve(P_center_bottom, MC_bottom[i], armDz[i], this.hub_div + 1),
            rightArcHalfB,
          ),
          COL.bottom,
        ),
      );

      const fullArcCurr = sampleBezierQuadratic(ML[i], C[i], MR[next], 2 * this.hub_div + 1);
      const leftArcHalf = fullArcCurr.slice(0, this.hub_div + 1).reverse();
      patches.push(
        patch(
          `Hub Left ${i}`,
          coonsPatch(
            createRadialCurve(P_center, ArcMid[i], arcDz[i], this.hub_div + 1).reverse(),
            sampleLinear(ML[i], MC[i], this.hub_div + 1),
            leftArcHalf,
            createRadialCurve(P_center, MC[i], armDz[i], this.hub_div + 1),
          ),
          COL.hub,
        ),
      );

      const fullArcCurrB = sampleBezierQuadratic(ML_bottom[i], C_bottom[i], MR_bottom[next], 2 * this.hub_div + 1);
      const leftArcHalfB = fullArcCurrB.slice(0, this.hub_div + 1).reverse();
      patches.push(
        patch(
          `Hub Left Bottom ${i}`,
          coonsPatch(
            createRadialCurve(P_center_bottom, ArcMid_bottom[i], arcDz[i], this.hub_div + 1).reverse(),
            sampleLinear(ML_bottom[i], MC_bottom[i], this.hub_div + 1),
            leftArcHalfB,
            createRadialCurve(P_center_bottom, MC_bottom[i], armDz[i], this.hub_div + 1),
          ),
          COL.bottom,
        ),
      );

      // --- corner pavement / curb / superstructure ---
      const paveDiv = 2;
      const fullOuterArcCurr = sampleBezierQuadratic(ML_outer[i], C_outer[i], MR_outer[next], 2 * this.hub_div + 1);
      const curbDropGrid: Vec3[][] = [
        fullArcCurr.map((p) => [p[0], p[1], p[2]] as Vec3),
        fullArcCurr.map((p) => [p[0], p[1], p[2] + curbH] as Vec3),
      ];
      patches.push(patch(`Corner Curb ${i}`, curbDropGrid, COL.curb));

      const paveBottom = fullArcCurr.map((p) => [p[0], p[1], p[2] + curbH] as Vec3);
      const paveTop = fullOuterArcCurr.map((p) => [p[0], p[1], p[2] + curbH] as Vec3);
      patches.push(
        patch(
          `Corner Pavement ${i}`,
          coonsPatch(
            paveBottom,
            paveTop,
            sampleLinear(paveBottom[0], paveTop[0], paveDiv + 1),
            sampleLinear(paveBottom[paveBottom.length - 1], paveTop[paveTop.length - 1], paveDiv + 1),
          ),
          COL.pavement,
        ),
      );

      // corner guard rail with posts along the outer arc
      const cornerNormals: Vec3[] = [];
      for (let k = 0; k < paveTop.length; k++) {
        const a = paveTop[Math.max(0, k - 1)];
        const b = paveTop[Math.min(paveTop.length - 1, k + 1)];
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        const l = Math.hypot(dx, dy);
        if (l < 1e-9) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
        cornerNormals.push([-dy, dx, 0] as Vec3); // left normal; pointRight flips outward
      }
      patches.push(...buildGuardRail(paveTop, cornerNormals, true, railOpts, curbH));

      patches.push(
        patch(
          `Corner Side ${i}`,
          coonsPatch(
            paveTop,
            fullArcCurrB,
            sampleLinear(paveTop[0], fullArcCurrB[0], paveDiv + 1),
            sampleLinear(paveTop[paveTop.length - 1], fullArcCurrB[fullArcCurrB.length - 1], paveDiv + 1),
          ),
          COL.side,
        ),
      );
    }

    const armData = sorted.map((arm, i) => ({ id: arm.id, R: R[i], MC: MC[i] }));
    return { patches, armData };
  }
}
