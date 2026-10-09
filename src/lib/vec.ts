// Vector math helpers. Two conventions are used across the studio:
//
//  - World (three.js):  X right, Y up, Z toward viewer. Spline nodes live here.
//  - Road (generator):  X right, Y forward, Z up. All mesh patches are built here,
//    then mapped to world on render as (x, y, z) -> (x, z, -y).
//
// A Vec3 is a plain [x, y, z] tuple in whichever space the function documents.

export type Vec3 = [number, number, number];

export const v_add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const v_sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const v_scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const v_dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const v_cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const v_len = (a: Vec3): number => Math.sqrt(v_dot(a, a));
export const v_len2d = (a: Vec3): number => Math.hypot(a[0], a[1]);

export function v_norm(a: Vec3): Vec3 {
  const l = v_len(a);
  if (l <= 1e-9) return [1, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerpNum = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Angle of a 2D direction in degrees, 0=+X, CCW toward +Y. */
export function dirAngleDeg(d: Vec3): number {
  let a = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

export function angle_unit(angle_deg: number): Vec3 {
  const r = (angle_deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), 0];
}

/** Left-hand normal of a planform direction (road space, Z-up). */
export function left_normal(d: Vec3): Vec3 {
  return [-d[1], d[0], 0];
}

export function cubicBezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const mt = 1 - t;
  const w0 = mt * mt * mt;
  const w1 = 3 * mt * mt * t;
  const w2 = 3 * mt * t * t;
  const w3 = t * t * t;
  return [
    w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
    w0 * p0[2] + w1 * p1[2] + w2 * p2[2] + w3 * p3[2],
  ];
}

export function cubicTangent(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const mt = 1 - t;
  // derivative of cubic bezier
  const a = v_scale(v_sub(p1, p0), 3 * mt * mt);
  const b = v_scale(v_sub(p2, p1), 6 * mt * t);
  const c = v_scale(v_sub(p3, p2), 3 * t * t);
  return v_add(v_add(a, b), c);
}

export function sampleLinear(a: Vec3, b: Vec3, count: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) out.push(lerp(a, b, count === 1 ? 0 : i / (count - 1)));
  return out;
}

export function sampleBezierQuadratic(p0: Vec3, p1: Vec3, p2: Vec3, count: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const mt = 1 - t;
    // planform quadratic; elevation eased smoothly between endpoints
    const tz = t * t * (3 - 2 * t);
    out.push([
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
      p0[2] + (p2[2] - p0[2]) * tz,
    ]);
  }
  return out;
}

export function sampleBezierCubic(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, count: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i++) out.push(cubicBezier(p0, p1, p2, p3, count === 1 ? 0 : i / (count - 1)));
  return out;
}

/** Coons patch interpolation between 4 boundary curves. */
export function coonsPatch(bottom: Vec3[], top: Vec3[], left: Vec3[], right: Vec3[]): Vec3[][] {
  const uDiv = bottom.length - 1;
  const vDiv = left.length - 1;
  const p00 = bottom[0];
  const p10 = bottom[bottom.length - 1];
  const p01 = top[0];
  const p11 = top[top.length - 1];
  const grid: Vec3[][] = [];
  for (let i = 0; i <= uDiv; i++) {
    const u = uDiv === 0 ? 0 : i / uDiv;
    const b = bottom[i];
    const t = top[i];
    const column: Vec3[] = [];
    for (let j = 0; j <= vDiv; j++) {
      const v = vDiv === 0 ? 0 : j / vDiv;
      const l = left[j];
      const r = right[j];
      const bl: Vec3 = [
        (1 - u) * (1 - v) * p00[0] + u * (1 - v) * p10[0] + (1 - u) * v * p01[0] + u * v * p11[0],
        (1 - u) * (1 - v) * p00[1] + u * (1 - v) * p10[1] + (1 - u) * v * p01[1] + u * v * p11[1],
        (1 - u) * (1 - v) * p00[2] + u * (1 - v) * p10[2] + (1 - u) * v * p01[2] + u * v * p11[2],
      ];
      column.push([
        (1 - v) * b[0] + v * t[0] + (1 - u) * l[0] + u * r[0] - bl[0],
        (1 - v) * b[1] + v * t[1] + (1 - u) * l[1] + u * r[1] - bl[1],
        (1 - v) * b[2] + v * t[2] + (1 - u) * l[2] + u * r[2] - bl[2],
      ]);
    }
    grid.push(column);
  }
  return grid;
}

/** Resample a polyline to `count` evenly spaced (arc-length) points. */
export function polylineResample(points: Vec3[], count: number): Vec3[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => [...points[0]] as Vec3);
  const lengths: number[] = [0];
  for (let i = 0; i < points.length - 1; i++) {
    lengths.push(lengths[lengths.length - 1] + v_len(v_sub(points[i + 1], points[i])));
  }
  const total = lengths[lengths.length - 1];
  if (total <= 1e-9) return Array.from({ length: count }, () => [...points[0]] as Vec3);
  const out: Vec3[] = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (j < points.length - 2 && lengths[j + 1] < target) j++;
    const span = lengths[j + 1] - lengths[j];
    const lt = span <= 1e-9 ? 0 : clamp((target - lengths[j]) / span, 0, 1);
    out.push(lerp(points[j], points[j + 1], lt));
  }
  return out;
}

/** Cumulative arc lengths of a polyline. */
export function arcLengths(points: Vec3[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + v_len(v_sub(points[i], points[i - 1])));
  return out;
}

/** Point on a polyline at arc distance `s` (clamped). */
export function pointAtArc(points: Vec3[], lengths: number[], s: number): Vec3 {
  const total = lengths[lengths.length - 1];
  const c = clamp(s, 0, total);
  let j = 0;
  while (j < points.length - 2 && lengths[j + 1] < c) j++;
  const span = lengths[j + 1] - lengths[j];
  const lt = span <= 1e-9 ? 0 : (c - lengths[j]) / span;
  return lerp(points[j], points[j + 1], clamp(lt, 0, 1));
}

/** World (x, yUp, z) -> road space (x, -z, yUp). */
export const worldToRoad = (p: Vec3): Vec3 => [p[0], -p[2], p[1]];
/** Road space (x, yFwd, zUp) -> world (x, zUp, -yFwd). */
export const roadToWorld = (p: Vec3): Vec3 => [p[0], p[2], -p[1]];
