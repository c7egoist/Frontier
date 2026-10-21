/* ════════════════════════════════════════════════════════════════════
   spline.js — centripetal Catmull-Rom centreline sampling (pure, no DOM).
   Points are {x, z, y, w}: plan metres, elevation, width-scale.
   Plan convention: +X east, +Z south (screen down), -Z north (screen up).
   ════════════════════════════════════════════════════════════════════ */

const EPS = 1e-9;

/** Remove consecutive duplicates (and closing duplicate) so parametrisation stays finite. */
export function cleanPoints(points, eps = 1e-6) {
  const out = [];
  for (const p of points || []) {
    const q = {x: +p.x || 0, z: +p.z || 0, y: +p.y || 0, w: p.w == null ? 1 : (+p.w || 0)};
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - q.x) < eps && Math.abs(last.z - q.z) < eps && Math.abs(last.y - q.y) < eps) continue;
    out.push(q);
  }
  // Drop a closing duplicate for closed loops (keep it open; wrapping handles closure).
  if (out.length > 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps && Math.abs(a.y - b.y) < eps) out.pop();
  }
  return out;
}

function catmullPoint(p0, p1, p2, p3, t) {
  // Centripetal Catmull-Rom (Barry–Goldman formulation), stable on uneven spacing.
  const dt = (a, b) => Math.pow(Math.max(EPS, Math.hypot(b.x - a.x, b.z - a.z, (b.y - a.y) * 0.35)), 0.5);
  const t0 = 0;
  const t1 = t0 + dt(p0, p1);
  const t2 = t1 + dt(p1, p2);
  const t3 = t2 + dt(p2, p3);
  const tt = t1 + t * (t2 - t1);
  const lerp = (a, b, ta, tb) => {
    const d = tb - ta;
    if (Math.abs(d) < EPS) return {x: a.x, z: a.z, y: a.y, w: a.w};
    const s = (tt - ta) / d;
    return {x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s, y: a.y + (b.y - a.y) * s, w: a.w + (b.w - a.w) * s};
  };
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** Heading in degrees, compass-style: 0 = north (-Z), 90 = east (+X), clockwise. */
export function headingDeg(tx, tz) {
  const d = (Math.atan2(tx, -tz) * 180) / Math.PI;
  return (d + 360) % 360;
}

function smooth(values, window = 1) {
  if (window <= 0) return values.slice();
  const n = values.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let k = -window; k <= window; k++) {
      const j = i + k;
      if (j >= 0 && j < n) { sum += values[j]; cnt++; }
    }
    out[i] = sum / cnt;
  }
  return out;
}

/**
 * Sample a road centreline at ~uniform arc-length spacing.
 * @returns {{samples, length, count, closed}} where each sample holds
 *   {x,z,y, tx,tz (unit plan tangent), hdg, s (arclength), curve, radius, grade, w}
 */
export function sampleRoad(rawPoints, {closed = false, step = 1.0} = {}) {
  const empty = {samples: [], length: 0, count: 0, closed: !!closed};
  const pts = cleanPoints(rawPoints);
  if (pts.length < 2) return empty;

  // 1 ─ dense polyline (fixed subdivisions per span; robust, then resampled).
  const dense = [];
  const n = pts.length;
  const spanCount = closed ? n : n - 1;
  const SUB = 16;
  for (let i = 0; i < spanCount; i++) {
    const p1 = pts[i % n];
    const p2 = pts[(i + 1) % n];
    const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < SUB; k++) dense.push(catmullPoint(p0, p1, p2, p3, k / SUB));
  }
  if (!closed) dense.push({...pts[n - 1]});

  // 2 ─ cumulative plan length (grade uses dy/ds separately).
  const cum = new Array(dense.length);
  let total = 0;
  cum[0] = 0;
  for (let i = 1; i < dense.length; i++) {
    total += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
    cum[i] = total;
  }
  if (closed) total += Math.hypot(dense[0].x - dense[dense.length - 1].x, dense[0].z - dense[dense.length - 1].z);
  if (!(total > EPS)) return empty;

  // 3 ─ walk the table at uniform spacing.
  const stepLen = Math.max(0.1, step);
  const count = Math.max(2, Math.round(total / stepLen) + (closed ? 0 : 1));
  const spacing = total / (closed ? count : count - 1);
  const samples = [];
  let j = 0;
  const at = (s) => {
    if (!closed && s >= total) return {...dense[dense.length - 1], s: total};
    let ss = closed ? ((s % total) + total) % total : Math.min(s, total);
    while (j < dense.length - 2 && cum[j + 1] < ss) j++;
    while (j > 0 && cum[j] > ss) j--;
    const s0 = cum[j];
    let s1, pA = dense[j], pB;
    if (j + 1 < dense.length) { s1 = cum[j + 1]; pB = dense[j + 1]; }
    else if (closed) { s1 = total; pB = dense[0]; }
    else return {...pA, s: total};
    const f = s1 - s0 < EPS ? 0 : (ss - s0) / (s1 - s0);
    return {
      x: pA.x + (pB.x - pA.x) * f,
      z: pA.z + (pB.z - pA.z) * f,
      y: pA.y + (pB.y - pA.y) * f,
      w: pA.w + (pB.w - pA.w) * f,
      s: ss
    };
  };
  for (let i = 0; i < count; i++) samples.push(at(i * spacing));

  // 4 ─ tangents, curvature, grade.
  const m = samples.length;
  const idx = (i) => closed ? ((i % m) + m) % m : Math.min(m - 1, Math.max(0, i));
  const rawCurve = new Array(m).fill(0);
  const rawGrade = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    const a = samples[idx(i - 1)], b = samples[idx(i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const L = Math.hypot(tx, tz);
    if (L < EPS) {
      const c = samples[i], d = samples[idx(i + 1)];
      tx = d.x - c.x; tz = d.z - c.z;
      const L2 = Math.hypot(tx, tz) || 1;
      tx /= L2; tz /= L2;
    } else { tx /= L; tz /= L; }
    samples[i].tx = tx; samples[i].tz = tz;
    samples[i].hdg = headingDeg(tx, tz);
    rawGrade[i] = L < EPS ? 0 : (b.y - a.y) / L;
  }
  for (let i = 0; i < m; i++) {
    const p = samples[idx(i - 1)], q = samples[idx(i + 1)];
    const ang = Math.atan2(p.tx * q.tz - p.tz * q.tx, p.tx * q.tx + p.tz * q.tz);
    const ds = closed || (i > 0 && i < m - 1)
      ? Math.hypot(q.x - p.x, q.z - p.z)
      : Math.max(EPS, spacing);
    rawCurve[i] = Math.abs(ang) / Math.max(EPS, ds);
  }
  const curve = smooth(rawCurve, 1);
  const grade = smooth(rawGrade, 1);
  let minRadius = Infinity, maxGrade = 0;
  for (let i = 0; i < m; i++) {
    samples[i].curve = curve[i];
    samples[i].radius = curve[i] < 1e-6 ? Infinity : 1 / curve[i];
    samples[i].grade = grade[i];
    if (Number.isFinite(samples[i].radius)) minRadius = Math.min(minRadius, samples[i].radius);
    maxGrade = Math.max(maxGrade, Math.abs(grade[i]));
  }
  return {samples, length: total, count: m, closed: !!closed, minRadius, maxGrade};
}

/** Axis-aligned bounds of samples (or raw points). */
export function boundsOf(list) {
  const b = {minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, minY: Infinity, maxY: -Infinity};
  for (const p of list || []) {
    if (p.x < b.minX) b.minX = p.x;
    if (p.x > b.maxX) b.maxX = p.x;
    if (p.z < b.minZ) b.minZ = p.z;
    if (p.z > b.maxZ) b.maxZ = p.z;
    if ((p.y || 0) < b.minY) b.minY = p.y || 0;
    if ((p.y || 0) > b.maxY) b.maxY = p.y || 0;
  }
  if (!Number.isFinite(b.minX)) return {minX: -50, maxX: 50, minZ: -50, maxZ: 50, minY: 0, maxY: 0};
  return b;
}

/** Distance from point to segment (XZ), returns {d, t} with t clamped 0..1. */
export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 < EPS ? 0 : ((px - ax) * dx + (pz - az) * dz) / L2;
  t = Math.min(1, Math.max(0, t));
  return {d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t};
}

/** Proper segment intersection in XZ (excludes shared endpoints). Returns {x,z,t,u} or null. */
export function segmentsCross(a, b, c, d) {
  return segmentsTouch(a, b, c, d, -1e-4);
}

/**
 * Segment intersection with endpoint tolerance: catches crossings that land
 * exactly on sample nodes (common when roads are snapped together).
 * tol > 0 widens the accepted (t,u) window; tol < 0 shrinks it; 0 accepts touches.
 */
export function segmentsTouch(a, b, c, d, tol = 0) {
  const rX = b.x - a.x, rZ = b.z - a.z;
  const sX = d.x - c.x, sZ = d.z - c.z;
  const denom = rX * sZ - rZ * sX;
  if (Math.abs(denom) < EPS) return null;
  const t = ((c.x - a.x) * sZ - (c.z - a.z) * sX) / denom;
  const u = ((c.x - a.x) * rZ - (c.z - a.z) * rX) / denom;
  if (t > -tol && t < 1 + tol && u > -tol && u < 1 + tol) {
    const tc = Math.min(1, Math.max(0, t));
    return {x: a.x + rX * tc, z: a.z + rZ * tc, t, u};
  }
  return null;
}
