// ---------------------------------------------------------------------------
// math.js — vector / curve / patch helpers for the road editor.
//
// Two coordinate conventions (same as the studio's generators):
//   world     X right, Y up, Z toward viewer. Spline nodes live here.
//   road      X lateral (right of travel), Y forward, Z up. All mesh patches
//             are built in road space, then mapped to world on render as
//             (x, y, z) -> (x, z, -y).
//
// A Vec3 is a plain [x, y, z] tuple in whichever space the function documents.
// Everything in this file is pure and dependency-free so the geometry
// pipeline can be unit-tested headlessly in Node.
// ---------------------------------------------------------------------------

export const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vLen = (a) => Math.sqrt(vDot(a, a));
export const vDist = (a, b) => vLen(vSub(a, b));
export const vLerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerpNum = (a, b, t) => a + (b - a) * t;

export function vNorm(a) {
  const l = vLen(a);
  if (l <= 1e-9) return [1, 0, 0];
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Left-hand normal of a planform direction (road space, Z-up): +Y fwd -> +X left? No:
 *  for travel +Y the left side is -X in road space? Convention here: left of
 *  direction d=(dx,dy) is n=(-dy,dx) (CCW 90°). */
export function leftNormal(d) {
  return [-d[1], d[0], 0];
}

/** Signed plan angle from a to b; + = turning left (CCW). */
export function planAngle(a, b) {
  const la = Math.hypot(a[0], a[1]);
  const lb = Math.hypot(b[0], b[1]);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cross = a[0] * b[1] - a[1] * b[0];
  const dot = (a[0] * b[0] + a[1] * b[1]) / (la * lb);
  return Math.atan2(cross, clamp(dot, -1, 1));
}

export function dirAngleDeg(d) {
  let a = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

// --- bezier ---------------------------------------------------------------

export function cubicBezier(p0, p1, p2, p3, t) {
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

// --- polylines --------------------------------------------------------------

/** Cumulative arc lengths of a polyline. */
export function arcLengths(points) {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + vDist(points[i], points[i - 1]));
  }
  return out;
}

/** Point on a polyline at arc distance s (clamped). */
export function pointAtArc(points, lengths, s) {
  const total = lengths[lengths.length - 1];
  const c = clamp(s, 0, total);
  let j = 0;
  while (j < points.length - 2 && lengths[j + 1] < c) j++;
  const span = lengths[j + 1] - lengths[j];
  const lt = span <= 1e-9 ? 0 : (c - lengths[j]) / span;
  return vLerp(points[j], points[j + 1], clamp(lt, 0, 1));
}

/** Resample a polyline to `count` evenly arc-spaced points. */
export function resampleLine(points, count) {
  if (count <= 0) return [];
  if (points.length === 0) return [];
  if (points.length === 1 || count === 1) {
    return Array.from({ length: count }, () => [...points[0]]);
  }
  const L = arcLengths(points);
  const total = L[L.length - 1];
  if (total <= 1e-9) return Array.from({ length: count }, () => [...points[0]]);
  const out = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (j < points.length - 2 && L[j + 1] < target) j++;
    const span = L[j + 1] - L[j];
    out.push(vLerp(points[j], points[j + 1], span <= 1e-9 ? 0 : clamp((target - L[j]) / span, 0, 1)));
  }
  return out;
}

/** Coons patch interpolation between 4 boundary curves.
 *  bottom/top run along U (same point count), left/right along V. */
export function coonsPatch(bottom, top, left, right) {
  const uDiv = Math.max(1, bottom.length - 1);
  const vDiv = Math.max(1, left.length - 1);
  const p00 = bottom[0];
  const p10 = bottom[bottom.length - 1];
  const p01 = top[0];
  const p11 = top[top.length - 1];
  const grid = [];
  for (let i = 0; i <= uDiv; i++) {
    const u = i / uDiv;
    const b = bottom[Math.min(i, bottom.length - 1)];
    const t = top[Math.min(i, top.length - 1)];
    const column = [];
    for (let j = 0; j <= vDiv; j++) {
      const v = j / vDiv;
      const l = left[Math.min(j, left.length - 1)];
      const r = right[Math.min(j, right.length - 1)];
      const bl = [
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

/** Coons patch with boundary resampling to compatible counts. */
export function coonsBlend(bottom, top, left, right, uSeg, vSeg) {
  return coonsPatch(
    resampleLine(bottom, uSeg + 1),
    resampleLine(top, uSeg + 1),
    resampleLine(left, vSeg + 1),
    resampleLine(right, vSeg + 1),
  );
}

// --- space mapping ------------------------------------------------------------

/** World (x, yUp, z) -> road space (x, yFwd=-z, zUp=y). */
export const worldToRoad = (p) => [p[0], -p[2], p[1]];
/** Road space (x, yFwd, zUp) -> world (x, zUp, -yFwd). */
export const roadToWorld = (p) => [p[0], p[2], -p[1]];

// --- validation ---------------------------------------------------------------

/** True when every point of a patch grid is finite. */
export function gridIsFinite(grid) {
  for (const row of grid) {
    for (const p of row) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return false;
    }
  }
  return true;
}

/** Drop patches whose grid is empty, non-rectangular or non-finite. */
export function sanitizePatches(patches) {
  const out = [];
  for (const p of patches) {
    if (!p || !Array.isArray(p.grid) || p.grid.length === 0) continue;
    const cols = p.grid[0].length;
    if (cols === 0) continue;
    let ok = true;
    for (const row of p.grid) {
      if (!Array.isArray(row) || row.length !== cols) { ok = false; break; }
    }
    if (!ok) continue;
    if (!gridIsFinite(p.grid)) continue;
    out.push(p);
  }
  return out;
}

export function countTriangles(patches) {
  let n = 0;
  for (const p of patches) {
    if (p.grid.length > 1 && p.grid[0].length > 1) {
      n += (p.grid.length - 1) * (p.grid[0].length - 1) * 2;
    }
  }
  return n;
}
