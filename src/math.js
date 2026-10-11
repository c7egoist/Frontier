// ============================================================================================================================================
//                                                                  MATH.JS
// ============================================================================================================================================
// Pure 3D linear algebra, Catmull-Rom / Cubic Bezier spline evaluation, adaptive curvature-clamped parallel offset curves,
// tangent-continuous circular arc corner fillets, Coons bilinear quad patch interpolation, and 3D gizmo ray-axis/plane projections.
// Coordinate convention: World space is X right, Y up, Z toward viewer (meters).

export const EPS = 1e-6;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / Math.max(EPS, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vMad = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vCross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const vDistXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
export const vLerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export function vNorm(a, fallback = [1, 0, 0]) {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l <= 1e-9) return [...fallback];
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function vNormXZ(a, fallback = [1, 0, 0]) {
  const l = Math.hypot(a[0], a[2]);
  if (l <= 1e-9) return [...fallback];
  return [a[0] / l, 0, a[2] / l];
}

/**
 * Right-hand lateral normal in XZ plane for a forward direction d = [dx, dy, dz].
 * In Y-up right-handed world space (X right, Y up, Z out):
 * Forward = (0, 0, -1) -> Right = (+1, 0, 0), Left = (-1, 0, 0).
 * Specifically: Left = normalize([dz, 0, -dx]), Right = normalize([-dz, 0, dx]).
 */
export function leftNormalXZ(tangent) {
  const l = Math.hypot(tangent[0], tangent[2]);
  if (l <= 1e-9) return [-1, 0, 0];
  return [tangent[2] / l, 0, -tangent[0] / l];
}

export function rightNormalXZ(tangent) {
  const l = Math.hypot(tangent[0], tangent[2]);
  if (l <= 1e-9) return [1, 0, 0];
  return [-tangent[2] / l, 0, tangent[0] / l];
}

/** Signed turn angle in XZ plane from vector a to vector b (+ = CCW when viewed from +Y). */
export function planAngleXZ(a, b) {
  const la = Math.hypot(a[0], a[2]);
  const lb = Math.hypot(b[0], b[2]);
  if (la < 1e-9 || lb < 1e-9) return 0;
  const cross = a[2] * b[0] - a[0] * b[2];
  const dot = (a[0] * b[0] + a[2] * b[2]) / (la * lb);
  return Math.atan2(cross, clamp(dot, -1, 1));
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                                  SPLINE & CURVE INTERPOLATION
// --------------------------------------------------------------------------------------------------------------------------------------------

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

export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  const w0 = 3 * mt * mt;
  const w1 = 6 * mt * t;
  const w2 = 3 * t * t;
  return vNorm([
    w0 * (p1[0] - p0[0]) + w1 * (p2[0] - p1[0]) + w2 * (p3[0] - p2[0]),
    w0 * (p1[1] - p0[1]) + w1 * (p2[1] - p1[1]) + w2 * (p3[1] - p2[1]),
    w0 * (p1[2] - p0[2]) + w1 * (p2[2] - p1[2]) + w2 * (p3[2] - p2[2]),
  ]);
}

/**
 * Evaluates a Catmull-Rom / Cardinal spline with tension tau (default 0.5)
 * or uses explicit Bezier handles if present on control nodes.
 */
export function sampleSplineNodes(nodes, closed = false, stepsPerSegment = 36) {
  if (!nodes || nodes.length === 0) return { pts: [], lengths: [0], total: 0, nodeArc: [] };
  if (nodes.length === 1) {
    return { pts: [[...nodes[0].position]], lengths: [0], total: 0, nodeArc: [0] };
  }

  const N = nodes.length;
  const segCount = closed ? N : N - 1;
  const pts = [];
  const nodeSampleIndices = new Array(N).fill(0);

  // Compute smooth auto-tangents for nodes that don't specify custom handles
  const tangents = new Array(N);
  for (let i = 0; i < N; i++) {
    const cur = nodes[i].position;
    const prev = closed ? nodes[(i - 1 + N) % N].position : nodes[Math.max(0, i - 1)].position;
    const next = closed ? nodes[(i + 1) % N].position : nodes[Math.min(N - 1, i + 1)].position;
    const tension = nodes[i].tension ?? 0.34;
    if (!closed && i === 0) {
      tangents[i] = vScale(vSub(next, cur), tension);
    } else if (!closed && i === N - 1) {
      tangents[i] = vScale(vSub(cur, prev), tension);
    } else {
      tangents[i] = vScale(vSub(next, prev), tension * 0.5);
    }
  }

  for (let s = 0; s < segCount; s++) {
    const i0 = s;
    const i1 = (s + 1) % N;
    const n0 = nodes[i0];
    const n1 = nodes[i1];
    const p0 = n0.position;
    const p3 = n1.position;
    const p1 = n0.handleOut ? vAdd(p0, n0.handleOut) : vAdd(p0, tangents[i0]);
    const p2 = n1.handleIn ? vAdd(p3, n1.handleIn) : vSub(p3, tangents[i1]);

    nodeSampleIndices[i0] = pts.length;
    const steps = Math.max(8, stepsPerSegment);
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      pts.push(cubicBezier(p0, p1, p2, p3, t));
    }
  }

  if (closed) {
    pts.push([...nodes[0].position]);
  } else {
    nodeSampleIndices[N - 1] = pts.length;
    pts.push([...nodes[N - 1].position]);
  }

  const lengths = arcLengths(pts);
  const total = lengths[lengths.length - 1] || 0;
  const nodeArc = nodeSampleIndices.map((idx) => lengths[Math.min(idx, lengths.length - 1)] || 0);

  return { pts, lengths, total, nodeArc, nodeSampleIndices };
}

export function arcLengths(points) {
  if (!points || points.length === 0) return [0];
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + vDist(points[i], points[i - 1]));
  }
  return out;
}

export function pointAtArc(points, lengths, s) {
  if (!points || points.length === 0) return [0, 0, 0];
  if (points.length === 1) return [...points[0]];
  const total = lengths[lengths.length - 1];
  const c = clamp(s, 0, total);
  let lo = 0;
  let hi = lengths.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lengths[mid] <= c) lo = mid;
    else hi = mid - 1;
  }
  const span = lengths[lo + 1] - lengths[lo];
  const t = span <= 1e-9 ? 0 : clamp((c - lengths[lo]) / span, 0, 1);
  return vLerp(points[lo], points[lo + 1], t);
}

export function tangentAtArc(points, lengths, s) {
  if (!points || points.length < 2) return [0, 0, -1];
  const total = lengths[lengths.length - 1];
  const ds = Math.min(0.35, Math.max(0.05, total * 0.01));
  const p0 = pointAtArc(points, lengths, Math.max(0, s - ds));
  const p1 = pointAtArc(points, lengths, Math.min(total, s + ds));
  return vNorm(vSub(p1, p0), [0, 0, -1]);
}

export function resamplePolyline(points, count) {
  if (count <= 0 || !points || points.length === 0) return [];
  if (points.length === 1 || count === 1) {
    return Array.from({ length: count }, () => [...points[0]]);
  }
  const L = arcLengths(points);
  const total = L[L.length - 1];
  if (total <= 1e-9) {
    return Array.from({ length: count }, () => [...points[0]]);
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    out.push(pointAtArc(points, L, target));
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                       FILLETS, PARALLEL OFFSETS & COONS QUAD PATCHES
// --------------------------------------------------------------------------------------------------------------------------------------------

/**
 * True circular fillet arc in XZ (with smooth Y interpolation) between two approach edge points p1, p2
 * with arrival tangents t1, t2 pointing INTO the junction.
 * Returns [p1, ...arcPoints..., p2] with exact pinned endpoints.
 */
export function filletBetweenEdgesXZ(p1, t1, p2, t2, radius, steps = 12) {
  const fallback = () => resamplePolyline([p1, p2], Math.max(2, steps + 1));

  let dax = t1[0];
  let daz = t1[2];
  let dbx = t2[0];
  let dbz = t2[2];
  const la = Math.hypot(dax, daz);
  const lb = Math.hypot(dbx, dbz);
  if (la < 1e-4 || lb < 1e-4) return fallback();
  dax /= la;
  daz /= la;
  dbx /= lb;
  dbz /= lb;

  // Intersect rays p1 + s*d_a and p2 + u*d_b in XZ
  const denom = dax * dbz - daz * dbx;
  if (Math.abs(denom) < 0.04) {
    // Nearly parallel or antiparallel approaches (e.g., 180° straight-through side edge):
    // Use a cubic Hermite curve in XZ so the outer boundary flows smoothly without kinks.
    const dist = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
    const handleLen = dist * 0.36;
    const c1 = [p1[0] + dax * handleLen, p1[1], p1[2] + daz * handleLen];
    const c2 = [p2[0] + dbx * handleLen, p2[1], p2[2] + dbz * handleLen];
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      out.push(cubicBezier(p1, c1, c2, p2, f));
    }
    out[0] = [...p1];
    out[out.length - 1] = [...p2];
    return out;
  }

  const dx = p2[0] - p1[0];
  const dz = p2[2] - p1[2];
  const t = (dx * dbz - dz * dbx) / denom;
  const u = (dx * daz - dz * dax) / denom;
  const vx = p1[0] + dax * t;
  const vz = p1[2] + daz * t;

  // If corner apex is behind the approach trim points, use smooth cubic Hermite transition
  if (t < -0.2 || u < -0.2) {
    const dist = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
    const handleLen = dist * 0.34;
    const c1 = [p1[0] + dax * handleLen, p1[1], p1[2] + daz * handleLen];
    const c2 = [p2[0] + dbx * handleLen, p2[1], p2[2] + dbz * handleLen];
    const out = [];
    for (let i = 0; i <= steps; i++) {
      out.push(cubicBezier(p1, c1, c2, p2, i / steps));
    }
    out[0] = [...p1];
    out[out.length - 1] = [...p2];
    return out;
  }

  // Outward unit vectors from apex V back toward p1 and p2
  const vax = -dax;
  const vaz = -daz;
  const vbx = -dbx;
  const vbz = -dbz;
  const daDist = Math.hypot(p1[0] - vx, p1[2] - vz);
  const dbDist = Math.hypot(p2[0] - vx, p2[2] - vz);
  const cosTheta = clamp(vax * vbx + vaz * vbz, -1, 1);
  const theta = Math.acos(cosTheta);
  if (theta < 0.04 || theta > Math.PI - 0.04) return fallback();

  const alpha = theta * 0.5;
  const tanA = Math.tan(alpha);
  const sinA = Math.sin(alpha);
  if (tanA < 1e-3 || sinA < 1e-3) return fallback();

  let T = radius / tanA;
  const tMax = Math.min(Math.max(daDist, 0.1), Math.max(dbDist, 0.1)) * 0.92;
  let r = radius;
  if (T > tMax) {
    T = tMax;
    r = T * tanA;
  }

  const tpx = vx + vax * T;
  const tpz = vz + vaz * T;
  const tqx = vx + vbx * T;
  const tqz = vz + vbz * T;

  let bdx = vax + vbx;
  let bdz = vaz + vbz;
  const bl = Math.hypot(bdx, bdz);
  if (bl < 1e-4) return fallback();
  bdx /= bl;
  bdz /= bl;

  const cx = vx + bdx * (r / sinA);
  const cz = vz + bdz * (r / sinA);

  const aStart = Math.atan2(tpz - cz, tpx - cx);
  const aEnd = Math.atan2(tqz - cz, tqx - cx);
  let delta = aEnd - aStart;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const raw = [[...p1]];
  for (let i = 0; i <= steps; i++) {
    const f = steps === 0 ? 0 : i / steps;
    const a = aStart + delta * f;
    const y = lerp(p1[1], p2[1], f);
    raw.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  raw.push([...p2]);

  const resampled = resamplePolyline(raw, steps + 1);
  resampled[0] = [...p1];
  resampled[resampled.length - 1] = [...p2];
  return resampled;
}

/**
 * Offset a base 3D curve toward exact pinned startTarget and endTarget endpoints.
 * Guarantees 100% watertight vertex sharing at both ends of junction curb/sidewalk fillets.
 */
export function offsetCurvePinnedXZ(base, startTarget, endTarget) {
  if (!base || base.length === 0) return [];
  if (base.length === 1) return [[...startTarget]];

  const n = base.length;
  const startDelta = vSub(startTarget, base[0]);
  const endDelta = vSub(endTarget, base[n - 1]);

  const tangentXZAt = (i) => {
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const l = Math.hypot(dx, dz);
    if (l <= 1e-5) return [1, 0];
    return [dx / l, dz / l];
  };

  const t0 = tangentXZAt(0);
  const tn = tangentXZAt(n - 1);
  const n0 = [-t0[1], t0[0]];
  const nn = [-tn[1], tn[0]];
  const posScore =
    n0[0] * startDelta[0] +
    n0[1] * startDelta[2] +
    nn[0] * endDelta[0] +
    nn[1] * endDelta[2];
  const sign = posScore >= 0 ? 1 : -1;

  const startW = Math.hypot(startDelta[0], startDelta[2]);
  const endW = Math.hypot(endDelta[0], endDelta[2]);

  const out = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const t = tangentXZAt(i);
    const nx = -t[1] * sign;
    const nz = t[0] * sign;
    const w = lerp(startW, endW, f);
    const dy = lerp(startDelta[1], endDelta[1], f);
    const p = base[i];
    out.push([p[0] + nx * w, p[1] + dy, p[2] + nz * w]);
  }
  out[0] = [...startTarget];
  out[n - 1] = [...endTarget];
  return out;
}

/**
 * Coons bilinear patch interpolation over 4 boundary curves:
 * bottom (u: 0..1 at v=0), top (u: 0..1 at v=1), left (v: 0..1 at u=0), right (v: 0..1 at u=1).
 * Returns a (uSeg + 1) x (vSeg + 1) structured grid of 3D points -> directly yields uSeg * vSeg clean Quads!
 */
export function coonsPatchGrid(bottom, top, left, right, uSeg, vSeg) {
  const B = resamplePolyline(bottom, uSeg + 1);
  const T = resamplePolyline(top, uSeg + 1);
  const L = resamplePolyline(left, vSeg + 1);
  const R = resamplePolyline(right, vSeg + 1);

  // Pin corners consistently
  const p00 = [...B[0]];
  const p10 = [...B[uSeg]];
  const p01 = [...T[0]];
  const p11 = [...T[uSeg]];
  L[0] = [...p00];
  L[vSeg] = [...p01];
  R[0] = [...p10];
  R[vSeg] = [...p11];

  const grid = [];
  for (let i = 0; i <= uSeg; i++) {
    const u = i / uSeg;
    const b = B[i];
    const t = T[i];
    const row = [];
    for (let j = 0; j <= vSeg; j++) {
      const v = j / vSeg;
      const l = L[j];
      const r = R[j];
      const bl = [
        (1 - u) * (1 - v) * p00[0] + u * (1 - v) * p10[0] + (1 - u) * v * p01[0] + u * v * p11[0],
        (1 - u) * (1 - v) * p00[1] + u * (1 - v) * p10[1] + (1 - u) * v * p01[1] + u * v * p11[1],
        (1 - u) * (1 - v) * p00[2] + u * (1 - v) * p10[2] + (1 - u) * v * p01[2] + u * v * p11[2],
      ];
      row.push([
        (1 - v) * b[0] + v * t[0] + (1 - u) * l[0] + u * r[0] - bl[0],
        (1 - v) * b[1] + v * t[1] + (1 - u) * l[1] + u * r[1] - bl[1],
        (1 - v) * b[2] + v * t[2] + (1 - u) * l[2] + u * r[2] - bl[2],
      ]);
    }
    grid.push(row);
  }
  return grid;
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                                  2D/3D INTERSECTION & GIZMO MATH
// --------------------------------------------------------------------------------------------------------------------------------------------

/** Closest distance and parameter t in [0,1] from point P to segment AB in XZ plane. */
export function pointSegXZ(P, A, B) {
  const abx = B[0] - A[0];
  const abz = B[2] - A[2];
  const lenSq = abx * abx + abz * abz;
  if (lenSq <= 1e-10) {
    return { dist: Math.hypot(P[0] - A[0], P[2] - A[2]), t: 0 };
  }
  const t = clamp(((P[0] - A[0]) * abx + (P[2] - A[2]) * abz) / lenSq, 0, 1);
  const qx = A[0] + abx * t;
  const qz = A[2] + abz * t;
  return { dist: Math.hypot(P[0] - qx, P[2] - qz), t, point: [qx, lerp(A[1], B[1], t), qz] };
}

/** Strict segment-segment intersection in XZ plane. Returns [t, u] in [0,1]^2 or null. */
export function segIntersectXZ(a0, a1, b0, b1) {
  const rx = a1[0] - a0[0];
  const rz = a1[2] - a0[2];
  const sx = b1[0] - b0[0];
  const sz = b1[2] - b0[2];
  const denom = rx * sz - rz * sx;
  if (Math.abs(denom) < 1e-8) return null;
  const qpx = b0[0] - a0[0];
  const qpz = b0[2] - a0[2];
  const t = (qpx * sz - qpz * sx) / denom;
  const u = (qpx * rz - qpz * rx) / denom;
  if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
    return [clamp(t, 0, 1), clamp(u, 0, 1)];
  }
  return null;
}

/** Signed distance along a 3D axis from origin to the point on the axis nearest the camera ray. */
export function alongAxisUnderRay(axis, origin, rayOrigin, rayDir) {
  const w0 = vSub(origin, rayOrigin);
  const a = vDot(axis, axis);
  const b = vDot(axis, rayDir);
  const c = vDot(rayDir, rayDir);
  const d = vDot(axis, w0);
  const e = vDot(rayDir, w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-6) return 0;
  return (b * e - c * d) / denom;
}

/** Ray-plane intersection through `origin` with `normal`. */
export function touchPlaneUnderRay(normal, origin, rayOrigin, rayDir) {
  const facing = vDot(rayDir, normal);
  if (Math.abs(facing) < 1e-7) return null;
  const along = vDot(vSub(origin, rayOrigin), normal) / facing;
  if (along < 0) return null;
  return vMad(rayOrigin, rayDir, along);
}

/** Distance from a ray (rayOrigin, rayDir) to a 3D segment AB, used for picking gizmo axes. */
export function raySegmentDistance(rayOrigin, rayDir, A, B) {
  const u = vSub(B, A);
  const v = rayDir;
  const w = vSub(A, rayOrigin);
  const a = vDot(u, u);
  const b = vDot(u, v);
  const c = vDot(v, v);
  const d = vDot(u, w);
  const e = vDot(v, w);
  const D = a * c - b * b;
  let sc;
  let tc;
  if (D < 1e-7) {
    sc = 0.0;
    tc = b > c ? d / b : e / c;
  } else {
    sc = clamp((b * e - c * d) / D, 0, 1);
    tc = (a * e - b * d) / D;
  }
  if (tc < 0) return Infinity;
  const pSeg = vMad(A, u, sc);
  const pRay = vMad(rayOrigin, v, tc);
  return vDist(pSeg, pRay);
}

// --------------------------------------------------------------------------------------------------------------------------------------------
//                                                  4x4 MATRIX & CAMERA PROJECTION
// --------------------------------------------------------------------------------------------------------------------------------------------

export function mat4Identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function mat4PerspectiveZO(fovYRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovYRad * 0.5);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / Math.max(0.01, aspect), 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, far * near * nf, 0,
  ]);
}

export function mat4PerspectiveNO(fovYRad, aspect, near, far) {
  const f = 1.0 / Math.tan(fovYRad * 0.5);
  const nf = 1.0 / (near - far);
  return new Float32Array([
    f / Math.max(0.01, aspect), 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function mat4LookAt(eye, target, up = [0, 1, 0]) {
  const z = vNorm(vSub(eye, target), [0, 0, 1]);
  const x = vNorm(vCross(up, z), [1, 0, 0]);
  const y = vCross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -vDot(x, eye), -vDot(y, eye), -vDot(z, eye), 1,
  ]);
}

export function projectWorldToScreen(point, viewProj, width, height) {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
  const cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
  const cz = viewProj[2] * x + viewProj[6] * y + viewProj[10] * z + viewProj[14];
  const cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
  if (cw <= 0.001) return null;
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  const ndcZ = cz / cw;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    z: ndcZ,
    w: cw,
  };
}

export function screenToWorldRay(px, py, width, height, eye, target, up, fovYRad) {
  const aspect = Math.max(0.05, width / Math.max(1, height));
  const ndcX = (px / Math.max(1, width)) * 2 - 1;
  const ndcY = 1 - (py / Math.max(1, height)) * 2;
  const tanHalf = Math.tan(fovYRad * 0.5);

  const fwd = vNorm(vSub(target, eye), [0, 0, -1]);
  const right = vNorm(vCross(fwd, up), [1, 0, 0]);
  const camUp = vCross(right, fwd);

  const dir = vNorm([
    fwd[0] + right[0] * ndcX * aspect * tanHalf + camUp[0] * ndcY * tanHalf,
    fwd[1] + right[1] * ndcX * aspect * tanHalf + camUp[1] * ndcY * tanHalf,
    fwd[2] + right[2] * ndcX * aspect * tanHalf + camUp[2] * ndcY * tanHalf,
  ]);
  return { origin: [...eye], dir };
}
