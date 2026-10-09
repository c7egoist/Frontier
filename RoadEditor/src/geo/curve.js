// Road alignment: a C1 chain of cubic Bezier segments through the road nodes (plan XZ), with a
// monotone (PCHIP) elevation profile over arc length. Sampling is uniform in arc length so that
// junction footprints, road spans, markings and guardrails all share exactly the same stations.

import { norm2, clamp, EPS } from '../core/vec.js';

/** Fritsch-Carlson monotone cubic: returns a function f(x) */
export function pchip(xs, ys) {
  const n = xs.length;
  if (n === 0) return () => 0;
  if (n === 1) return () => ys[0];
  if (n === 2) {
    const d = (ys[1] - ys[0]) / (xs[1] - xs[0] || 1);
    return (x) => ys[0] + d * (x - xs[0]);
  }
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i] || 1e-9);
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array(n).fill(0);
  m[0] = ((2 * h[0] + h[1]) * d[0] - h[0] * d[1]) / (h[0] + h[1]);
  if (Math.sign(m[0]) !== Math.sign(d[0])) m[0] = 0;
  else if (Math.sign(d[0]) !== Math.sign(d[1]) && Math.abs(m[0]) > Math.abs(3 * d[0])) m[0] = 3 * d[0];
  m[n - 1] = ((2 * h[n - 2] + h[n - 3]) * d[n - 2] - h[n - 2] * d[n - 3]) / (h[n - 2] + h[n - 3]);
  if (Math.sign(m[n - 1]) !== Math.sign(d[n - 2])) m[n - 1] = 0;
  else if (Math.sign(d[n - 2]) !== Math.sign(d[n - 3]) && Math.abs(m[n - 1]) > Math.abs(3 * d[n - 2])) {
    m[n - 1] = 3 * d[n - 2];
  }
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) {
      m[k] = 0;
    } else {
      const w1 = 2 * h[k] + h[k - 1];
      const w2 = h[k] + 2 * h[k - 1];
      m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k]);
    }
  }
  return (x) => {
    let i = 0;
    if (x <= xs[0]) i = 0;
    else if (x >= xs[n - 1]) i = n - 2;
    else {
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (xs[mid] <= x) lo = mid;
        else hi = mid;
      }
      i = lo;
    }
    const hh = h[i];
    const t = (x - xs[i]) / hh;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return h00 * ys[i] + h10 * hh * m[i] + h01 * ys[i + 1] + h11 * hh * m[i + 1];
  };
}

function tangentsOf(P) {
  const n = P.length;
  const T = new Array(n);
  const dir = (a, b) => norm2(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i < n; i++) {
    if (i === 0) T[i] = n > 1 ? dir(P[0], P[1]) : [1, 0];
    else if (i === n - 1) T[i] = dir(P[n - 2], P[n - 1]);
    else {
      const a = dir(P[i - 1], P[i]);
      const b = dir(P[i], P[i + 1]);
      const sx = a[0] + b[0];
      const sz = a[1] + b[1];
      if (Math.hypot(sx, sz) < 1e-6) T[i] = [-a[1], a[0]];
      else T[i] = norm2(sx, sz);
    }
  }
  return T;
}

/**
 * Build the sampled alignment for a road.
 * nodes: [{x, y, z}] (y may be null for interior nodes -> interpolated)
 * returns {length, ds, n, s, x, y, z, tx, tz, nodeS, minRadius, ...}
 */
export function buildCurve(nodes, opts = {}) {
  if (!nodes || nodes.length < 2) throw new Error('curve needs at least two nodes');
  const P = nodes.map((p) => [p.x, p.z]);
  const T = tangentsOf(P);

  // dense polyline of the bezier chain, with the arc length at every node
  const dx = [];
  const dz = [];
  const dcum = [];
  const nodeS = new Array(nodes.length).fill(0);
  let acc = 0;
  dx.push(P[0][0]);
  dz.push(P[0][1]);
  dcum.push(0);
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (chord < 1e-6) {
      nodeS[i + 1] = acc;
      continue;
    }
    const h = chord / 3;
    const B0 = a;
    const B1 = [a[0] + T[i][0] * h, a[1] + T[i][1] * h];
    const B2 = [b[0] - T[i + 1][0] * h, b[1] - T[i + 1][1] * h];
    const B3 = b;
    const nsub = clamp(Math.ceil(chord / 0.2), 6, 800);
    let px = B0[0];
    let pz = B0[1];
    for (let k = 1; k <= nsub; k++) {
      const t = k / nsub;
      const u = 1 - t;
      const c0 = u * u * u;
      const c1 = 3 * u * u * t;
      const c2 = 3 * u * t * t;
      const c3 = t * t * t;
      const x = c0 * B0[0] + c1 * B1[0] + c2 * B2[0] + c3 * B3[0];
      const z = c0 * B0[1] + c1 * B1[1] + c2 * B2[1] + c3 * B3[1];
      acc += Math.hypot(x - px, z - pz);
      px = x;
      pz = z;
      dx.push(x);
      dz.push(z);
      dcum.push(acc);
    }
    nodeS[i + 1] = acc;
  }
  const L = acc;
  if (L < 1e-3) throw new Error('curve has zero length');

  // curvature-adaptive grid step (finer on tight bends)
  let minRadius = Infinity;
  for (let i = 1; i < dx.length - 1; i++) {
    const ax = dx[i] - dx[i - 1];
    const az = dz[i] - dz[i - 1];
    const bx = dx[i + 1] - dx[i];
    const bz = dz[i + 1] - dz[i];
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    if (la < EPS || lb < EPS) continue;
    const cross = Math.abs(ax * bz - az * bx);
    const turn = Math.asin(clamp(cross / (la * lb), 0, 1));
    if (turn > 1e-6) minRadius = Math.min(minRadius, (la + lb) * 0.5 / turn);
  }
  const maxStep = opts.ds ?? 1.0;
  const ds = Math.min(maxStep, Math.max(0.25, Number.isFinite(minRadius) ? minRadius * 0.2 : maxStep));
  const n = Math.max(2, Math.ceil(L / ds - 1e-9) + 1);

  const gs = new Float64Array(n);
  const gx = new Float64Array(n);
  const gz = new Float64Array(n);
  const gtx = new Float64Array(n);
  const gtz = new Float64Array(n);
  const gy = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = k === n - 1 ? L : Math.min(k * ds, L);
    gs[k] = s;
    while (j < dcum.length - 2 && dcum[j + 1] < s) j++;
    const s0 = dcum[j];
    const s1 = dcum[j + 1];
    const f = s1 - s0 > EPS ? clamp((s - s0) / (s1 - s0), 0, 1) : 0;
    gx[k] = dx[j] + (dx[j + 1] - dx[j]) * f;
    gz[k] = dz[j] + (dz[j + 1] - dz[j]) * f;
    const tt = norm2(dx[j + 1] - dx[j], dz[j + 1] - dz[j]);
    gtx[k] = tt[0];
    gtz[k] = tt[1];
  }
  // exact end tangents from the first / last segment direction
  if (n > 1) {
    const t0 = norm2(dx[1] - dx[0], dz[1] - dz[0]);
    gtx[0] = t0[0];
    gtz[0] = t0[1];
    const m = dx.length - 1;
    const t1 = norm2(dx[m] - dx[m - 1], dz[m] - dz[m - 1]);
    gtx[n - 1] = t1[0];
    gtz[n - 1] = t1[1];
  }

  // elevation: PCHIP over the nodes that carry an explicit height (ends are always explicit)
  const ys = [];
  const yx = [];
  nodes.forEach((p, i) => {
    if (p.y === null || p.y === undefined || !Number.isFinite(p.y)) return;
    let s = nodeS[i];
    if (yx.length && s <= yx[yx.length - 1]) s = yx[yx.length - 1] + 1e-6;
    yx.push(s);
    ys.push(p.y);
  });
  const height = yx.length ? pchip(yx, ys) : () => 0;
  for (let k = 0; k < n; k++) gy[k] = height(gs[k]);

  return {
    length: L,
    ds,
    n,
    minRadius: Number.isFinite(minRadius) ? minRadius : Infinity,
    nodeS,
    s: gs,
    x: gx,
    y: gy,
    z: gz,
    tx: gtx,
    tz: gtz,
    nodes: nodes.map((p) => ({ x: p.x, y: p.y ?? null, z: p.z })),
  };
}

/** index of the grid cell containing s */
function cellOf(curve, s) {
  const k = Math.floor(s / curve.ds);
  return clamp(k, 0, curve.n - 2);
}

/** interpolated station at arc length s (clamped to the alignment) */
export function stationAt(curve, s) {
  const sc = clamp(s, 0, curve.length);
  const k = cellOf(curve, sc);
  const s0 = curve.s[k];
  const s1 = curve.s[k + 1];
  const f = s1 - s0 > EPS ? clamp((sc - s0) / (s1 - s0), 0, 1) : 0;
  const lerp = (a, b) => a + (b - a) * f;
  const tx = lerp(curve.tx[k], curve.tx[k + 1]);
  const tz = lerp(curve.tz[k], curve.tz[k + 1]);
  const tn = norm2(tx, tz);
  return {
    s: sc,
    x: lerp(curve.x[k], curve.x[k + 1]),
    y: lerp(curve.y[k], curve.y[k + 1]),
    z: lerp(curve.z[k], curve.z[k + 1]),
    tx: tn[0],
    tz: tn[1],
    nx: tn[1],
    nz: -tn[0],
  };
}

/** stations from s0 to s1 inclusive: exact end points plus every grid station in between */
export function curveSlice(curve, s0, s1) {
  const a = clamp(Math.min(s0, s1), 0, curve.length);
  const b = clamp(Math.max(s0, s1), 0, curve.length);
  const out = [];
  const forward = s1 >= s0;
  const grid = [];
  for (let k = 0; k < curve.n; k++) {
    const s = curve.s[k];
    if (s > a + 1e-6 && s < b - 1e-6) grid.push(s);
  }
  const list = [a, ...grid, b];
  for (const s of list) out.push(stationAt(curve, s));
  if (!forward) out.reverse();
  return out;
}

/** nearest point on the sampled alignment to (x, z) */
export function nearestOnCurve(curve, x, z) {
  let best = { d: Infinity, s: 0, x: 0, z: 0 };
  for (let k = 0; k < curve.n - 1; k++) {
    const ax = curve.x[k];
    const az = curve.z[k];
    const bx = curve.x[k + 1];
    const bz = curve.z[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 > EPS ? clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1) : 0;
    const cx = ax + dx * t;
    const cz = az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best.d) best = { d, s: curve.s[k] + (curve.s[k + 1] - curve.s[k]) * t, x: cx, z: cz };
  }
  return best;
}

/** heading in degrees (0 = +x, CCW in plan with z pointing down) for UI display */
export function headingDeg(tx, tz) {
  return (Math.atan2(tz, tx) * 180) / Math.PI;
}
