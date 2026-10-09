// Road centrelines.
//
// A road runs from node `a` to node `b` through its interior points. The path is
// a cubic Hermite spline (uniform Catmull-Rom tangents) with two *straight stubs*
// leaving each node. The stubs keep junction throats straight, which is what makes
// the junction loops watertight: every arm's cross-section at the throat is exactly
// perpendicular to the node-to-node direction.
//
// Stations `s` are measured in PLAN (x, z) arc length. Heights are interpolated
// along the sampled path, so `at(s).p[1]` is the surface height on the centreline.

import { add3, sub3, mul3, lerp3, norm3, EPS } from './vec.js';

function hermite(p0, p1, m0, m1, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return [
    h00 * p0[0] + h10 * m0[0] + h01 * p1[0] + h11 * m1[0],
    h00 * p0[1] + h10 * m0[1] + h01 * p1[1] + h11 * m1[1],
    h00 * p0[2] + h10 * m0[2] + h01 * p1[2] + h11 * m1[2],
  ];
}

const planDist = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[2]);

export function buildCenterline({ a, b, points = [], stubA = 0, stubB = 0, ds = 1 }) {
  // 1. control polyline
  const P = [];
  let dirA = null;
  let dirB = null;
  if (points.length === 0) {
    P.push(a, b);
  } else {
    const q0 = points[0];
    const qn = points[points.length - 1];
    dirA = norm3(sub3(q0, a));
    dirB = norm3(sub3(b, qn));
    const planA = planDist(q0, a);
    const planB = planDist(b, qn);
    const sa = Math.min(Math.max(0, stubA), planA * 0.9);
    const sb = Math.min(Math.max(0, stubB), planB * 0.9);
    const pa = Math.hypot(dirA[0], dirA[2]) || 1;
    const pb = Math.hypot(dirB[0], dirB[2]) || 1;
    const astub = add3(a, mul3(dirA, sa / pa));
    const bstub = sub3(b, mul3(dirB, sb / pb));
    P.push(a, astub, ...points, bstub, b);
  }

  // 2. segments: stub, Hermite spans, stub
  const n = P.length;
  const segs = [];
  if (n === 2) {
    segs.push({ type: 'lin', p0: P[0], p1: P[1] });
  } else {
    segs.push({ type: 'lin', p0: P[0], p1: P[1] });
    const m = new Array(n);
    const chord = (i, j) => Math.hypot(P[j][0] - P[i][0], P[j][2] - P[i][2]);
    m[1] = mul3(dirA, chord(1, 2));
    m[n - 2] = mul3(dirB, chord(n - 3, n - 2));
    for (let i = 2; i <= n - 3; i++) m[i] = mul3(sub3(P[i + 1], P[i - 1]), 0.5);
    for (let i = 1; i <= n - 3; i++) {
      segs.push({ type: 'herm', p0: P[i], p1: P[i + 1], m0: m[i], m1: m[i + 1] });
    }
    segs.push({ type: 'lin', p0: P[n - 2], p1: P[n - 1] });
  }

  // 3. sample
  const pts = [];
  const S = [];
  const stationOfControl = new Array(n).fill(0);
  let total = 0;
  const pushPt = (p) => {
    if (pts.length) {
      const q = pts[pts.length - 1];
      const d = planDist(p, q);
      if (d < 1e-7) {
        if (Math.abs(p[1] - q[1]) < 1e-9) return;
        pts.push(p);
        S.push(total);
        return;
      }
      total += d;
    }
    pts.push(p);
    S.push(total);
  };
  for (let si = 0; si < segs.length; si++) {
    const sg = segs[si];
    const chord = planDist(sg.p1, sg.p0);
    const N = Math.max(1, Math.ceil(chord / Math.max(0.05, ds)));
    for (let j = 0; j < N; j++) {
      const u = j / N;
      const p = sg.type === 'lin' ? lerp3(sg.p0, sg.p1, u) : hermite(sg.p0, sg.p1, sg.m0, sg.m1, u);
      pushPt(p);
      if (j === 0) stationOfControl[si] = S[S.length - 1];
    }
  }
  pushPt(P[n - 1]);
  stationOfControl[n - 1] = S[S.length - 1];
  const L = total;
  const stations = points.map((_, q) => stationOfControl[q + 2]);

  // 4. evaluation
  const at = (s) => {
    const ss = Math.min(L, Math.max(0, s));
    let lo = 0;
    let hi = S.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (S[mid] <= ss) lo = mid;
      else hi = mid;
    }
    const span = S[hi] - S[lo];
    const u = span > 1e-12 ? (ss - S[lo]) / span : 0;
    const p = lerp3(pts[lo], pts[hi], u);
    let i0 = lo;
    let i1 = hi;
    let dx = pts[i1][0] - pts[i0][0];
    let dz = pts[i1][2] - pts[i0][2];
    let l = Math.hypot(dx, dz);
    if (l < 1e-9) {
      // vertical-only span: borrow the nearest horizontal direction
      for (let q = hi; q < pts.length - 1 && l < 1e-9; q++) {
        dx = pts[q + 1][0] - pts[q][0];
        dz = pts[q + 1][2] - pts[q][2];
        l = Math.hypot(dx, dz);
      }
      for (let q = lo; q > 0 && l < 1e-9; q--) {
        dx = pts[q][0] - pts[q - 1][0];
        dz = pts[q][2] - pts[q - 1][2];
        l = Math.hypot(dx, dz);
      }
      if (l < 1e-9) {
        dx = 1;
        dz = 0;
        l = 1;
      }
    }
    const tx = dx / l;
    const tz = dz / l;
    return { p, t: [tx, tz], n: [-tz, tx], s: ss };
  };

  return {
    a,
    b,
    L,
    S,
    pts,
    stations,
    stubA: segs.length > 1 ? planDist(P[1], P[0]) : 0,
    stubB: segs.length > 1 ? planDist(P[n - 1], P[n - 2]) : 0,
    at,
    valid: L > EPS && pts.length >= 2,
  };
}
