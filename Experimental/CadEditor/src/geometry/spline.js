// Continuity-controlled cubic spline chains.
//
// A chain is a list of knots (points the curve passes through). Each interior
// knot carries a joint continuity:
//   G0 - corner: the neighbouring segments meet with no tangent constraint.
//   G1 - tangent: both segments share one tangent vector (direction and speed), which is C1.
//   G2 - curvature: tangent and curvature vector match on both sides.
//
// Each segment is emitted as a cubic Bezier. Tangents are solved as one linear
// system per chain (Hermite form, uniform parameter per segment). G2 joints add
// the classic C2 cubic-spline equation, so curvature continuity holds exactly in
// the emitted Bezier controls, not only approximately.

export const CONTINUITY = ["G0", "G1", "G2"];

const EPS = 1e-12;

export const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vScale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vNorm = (a) => {
  const l = vLen(a);
  return l < EPS ? [0, 0, 0] : vScale(a, 1 / l);
};

// Gaussian elimination with partial pivoting. A is n x n, B is n x k.
export function solveLinear(A, B) {
  const n = A.length;
  const k = B[0].length;
  const M = A.map((row, i) => [...row, ...B[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < EPS) throw new Error("Singular continuity system");
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let j = c; j < n + k; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => row.slice(n).map((v) => v / M[i][i]));
}

// Normalise knots to { p, cont, scale, tangent }. Ends are always G0 (free ends).
export function normaliseKnots(knots) {
  return knots.map((k, i) => {
    const cont = i === 0 || i === knots.length - 1 ? "G0" : CONTINUITY.includes(k.cont) ? k.cont : "G1";
    return {
      p: [Number(k.p[0]) || 0, Number(k.p[1]) || 0, Number(k.p[2]) || 0],
      cont,
      scale: Number.isFinite(k.scale) && k.scale > 0 ? k.scale : 1,
      tangent: Array.isArray(k.tangent) && vLen(k.tangent) > EPS ? k.tangent : null,
    };
  });
}

// Split the knot list into chains at G0 knots. Chains share their break knot.
export function splitChains(knots) {
  const n = knots.length;
  const chains = [];
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (i === n - 1 || knots[i].cont === "G0") {
      if (i > start) chains.push({ first: start, last: i });
      start = i;
    }
  }
  return chains;
}

// Solve Hermite tangents for one chain; returns an array of tangent vectors (one per knot in chain).
function solveChain(knots, first, last) {
  const idx = [];
  for (let i = first; i <= last; i++) idx.push(i);
  const m = idx.length;
  const p = (local) => knots[idx[local]].p;
  const A = Array.from({ length: m }, () => new Array(m).fill(0));
  const B = Array.from({ length: m }, () => [0, 0, 0]);
  for (let k = 0; k < m; k++) {
    const knot = knots[idx[k]];
    const isEnd = k === 0 || k === m - 1;
    if (isEnd) {
      A[k][k] = 1;
      if (knot.tangent) {
        B[k] = knot.tangent;
      } else if (k === 0) {
        B[k] = vScale(vSub(p(1), p(0)), knot.scale);
      } else {
        B[k] = vScale(vSub(p(m - 1), p(m - 2)), knot.scale);
      }
      continue;
    }
    if (knot.tangent && knot.cont !== "G2") {
      A[k][k] = 1;
      B[k] = knot.tangent;
    } else if (knot.cont === "G2") {
      // C2 cubic-spline joint: 2 m_{k-1} + 8 m_k + 2 m_{k+1} = 6 (p_{k+1} - p_{k-1}).
      A[k][k - 1] = 2;
      A[k][k] = 8;
      A[k][k + 1] = 2;
      B[k] = vScale(vSub(p(k + 1), p(k - 1)), 6);
    } else {
      // G1 joint: Catmull-style tangent, scaled per knot.
      A[k][k] = 1;
      B[k] = vScale(vSub(p(k + 1), p(k - 1)), 0.5 * knot.scale);
    }
  }
  return solveLinear(A, B);
}

// Solve the whole knot list. Returns { knots, chains: [{ first, last, tangents }] }.
export function solveChains(rawKnots) {
  const knots = normaliseKnots(rawKnots);
  const chains = splitChains(knots).map(({ first, last }) => ({
    first,
    last,
    tangents: solveChain(knots, first, last),
  }));
  return { knots, chains };
}

// Cubic Bezier segments: [{ p0, c1, c2, p3, from, to }] with global knot indices.
export function chainToBeziers(rawKnots) {
  const { knots, chains } = solveChains(rawKnots);
  const segments = [];
  for (const { first, tangents } of chains) {
    for (let k = 0; k < tangents.length - 1; k++) {
      const a = first + k;
      const b = first + k + 1;
      const p0 = knots[a].p;
      const p3 = knots[b].p;
      segments.push({
        p0,
        c1: vAdd(p0, vScale(tangents[k], 1 / 3)),
        c2: vSub(p3, vScale(tangents[k + 1], 1 / 3)),
        p3,
        from: a,
        to: b,
      });
    }
  }
  return segments;
}

// Evaluate a cubic Bezier at t: position and first/second derivatives.
export function bezierAt(seg, t) {
  const { p0, c1, c2, p3 } = seg;
  const mt = 1 - t;
  const pos = [0, 1, 2].map(
    (i) => mt ** 3 * p0[i] + 3 * mt * mt * t * c1[i] + 3 * mt * t * t * c2[i] + t ** 3 * p3[i],
  );
  const d1 = [0, 1, 2].map(
    (i) => 3 * (mt * mt * (c1[i] - p0[i]) + 2 * mt * t * (c2[i] - c1[i]) + t * t * (p3[i] - c2[i])),
  );
  const d2 = [0, 1, 2].map((i) => 6 * (mt * (c2[i] - 2 * c1[i] + p0[i]) + t * (p3[i] - 2 * c2[i] + c1[i])));
  return { pos, d1, d2 };
}

// Curvature vector (bending direction, magnitude = curvature) from derivatives.
export function curvatureVector(d1, d2) {
  const speed2 = vDot(d1, d1);
  if (speed2 < EPS) return [0, 0, 0];
  const T = vNorm(d1);
  const normal = vSub(d2, vScale(T, vDot(d2, T)));
  return vScale(normal, 1 / speed2);
}

// Measured continuity at every interior knot. Returns one record per joint.
export function analyseJoints(rawKnots) {
  const knots = normaliseKnots(rawKnots);
  const segments = chainToBeziers(rawKnots);
  const records = [];
  for (let k = 1; k < knots.length - 1; k++) {
    const left = segments.find((s) => s.to === k);
    const right = segments.find((s) => s.from === k);
    if (!left || !right) {
      records.push({ knot: k, declared: knots[k].cont, measured: "G0", gap: 0, angleDeg: 180, curvatureError: NaN });
      continue;
    }
    const a = bezierAt(left, 1);
    const b = bezierAt(right, 0);
    const gap = vLen(vSub(a.pos, b.pos));
    const angleDeg = (Math.acos(Math.max(-1, Math.min(1, vDot(vNorm(a.d1), vNorm(b.d1))))) * 180) / Math.PI;
    const kA = curvatureVector(a.d1, a.d2);
    const kB = curvatureVector(b.d1, b.d2);
    const curvatureError = vLen(vSub(kA, kB)) / Math.max(vLen(kA), vLen(kB), 1e-9);
    let measured = "G0";
    if (gap < 1e-6 * Math.max(1, vLen(a.pos)) && angleDeg < 1e-3) {
      measured = curvatureError < 1e-3 ? "G2" : "G1";
    }
    records.push({ knot: k, declared: knots[k].cont, measured, gap, angleDeg, curvatureError });
  }
  return records;
}

// Polyline sample of the whole chain (for previews and tests).
export function sampleChain(rawKnots, perSegment = 24) {
  const out = [];
  for (const seg of chainToBeziers(rawKnots)) {
    for (let i = 0; i <= perSegment; i++) {
      if (out.length && i === 0) continue;
      out.push(bezierAt(seg, i / perSegment).pos);
    }
  }
  return out;
}
