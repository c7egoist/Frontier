// Procedural track for FRONTIER // ZIPPER CIRCUIT.
//
// The centreline is drawn with a "turtle" (straights and constant-radius arcs),
// resampled by arc length and given a height profile (hills, dips, jump ramps).
// Banking is derived from horizontal curvature. Everything is plain math with no
// three.js dependency, so the geometry can be unit-tested under Node.

export const DS = 2; // nominal sample spacing in metres
const DEG = Math.PI / 180;

// One half of the circuit. The full lap is this half followed by a copy rotated
// 180 degrees (same turn sequence), which makes the loop close exactly.
// Right turns are positive angles; each half turns 180 degrees in total.
const HALF_SEGMENTS = [
  { name: 'start', len: 380 },
  { name: 'turnA', r: 75, turn: 80 },
  { name: 'avenue', len: 210 },        // traffic avenue
  { name: 'turnB', r: 60, turn: -50 },
  { name: 'zipper', len: 330 },        // bollard zipper straight
  { name: 'sweepC', r: 110, turn: 60 },
  { name: 'crossing', len: 200 },      // level crossing (train)
  { name: 'turnD', r: 85, turn: 40 },
  { name: 'jumpRun', len: 150 },       // jump ramp
  { name: 'turnE', r: 100, turn: 50 },
];

export const TRACK_SEGMENTS = [
  ...HALF_SEGMENTS,
  ...HALF_SEGMENTS.map((s) => ({ ...s, name: s.name + '_2' })),
];

// Height features, keyed by base section name (applies to both halves).
const FEATURES = [
  { type: 'jump', sec: 'jumpRun', at: 0.2, len: 40, A: 4.2 },
  { type: 'hill', sec: 'sweepC', A: 6 },
  { type: 'hill', sec: 'turnD', A: -6 },
  { type: 'hill', sec: 'avenue', A: 3 },
];

const BANK_K = 22;      // radians of bank per 1/m of curvature
const BANK_MAX = 0.36;  // ~20 degrees

function heightAt(s, secs) {
  let h = 0;
  for (const f of FEATURES) {
    for (const name of [f.sec, f.sec + '_2']) {
      const sec = secs[name];
      if (!sec) continue;
      if (f.type === 'hill') {
        if (s >= sec.s0 && s <= sec.s1) {
          const u = (s - sec.s0) / (sec.s1 - sec.s0);
          h += f.A * 0.5 * (1 - Math.cos(2 * Math.PI * u));
        }
      } else if (f.type === 'jump') {
        const a = sec.s0 + f.at * (sec.s1 - sec.s0);
        const b = a + f.len;
        if (s >= a && s <= b) h += f.A * (s - a) / (b - a);
        else if (s > b && s <= b + 10) h += f.A * 0.5 * (1 + Math.cos(Math.PI * (s - b) / 10));
      }
    }
  }
  return h;
}

// Draw the centreline. Returns {xz: [[x,z]...] at fine resolution, secs, total}.
function turtle(segs) {
  let x = 0, z = 0, dx = 0, dz = 1, dist = 0;
  const raw = [];
  const secs = {};
  for (const seg of segs) {
    const turnRad = (seg.turn || 0) * DEG;
    const len = seg.len ?? seg.r * Math.abs(turnRad);
    const n = Math.max(1, Math.round(len / 0.25));
    const dl = len / n;
    const w = turnRad / len; // signed rad per metre, right turn positive
    secs[seg.name] = { s0: dist, s1: dist + len };
    for (let i = 0; i < n; i++) {
      raw.push({ x, z, d: dist });
      // rotate heading (right-positive), then advance
      const a = w * dl;
      const c = Math.cos(a), sn = Math.sin(a);
      const ndx = dx * c - dz * sn;
      const ndz = dz * c + dx * sn;
      dx = ndx; dz = ndz;
      x += dx * dl;
      z += dz * dl;
      dist += dl;
    }
  }
  raw.push({ x, z, d: dist });
  return { raw, secs, total: dist };
}

function interpPath(raw, s) {
  // raw is sorted by d; binary search
  let lo = 0, hi = raw.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (raw[mid].d <= s) lo = mid; else hi = mid;
  }
  const a = raw[lo], b = raw[hi];
  const t = b.d === a.d ? 0 : (s - a.d) / (b.d - a.d);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export class Track {
  constructor(segments = TRACK_SEGMENTS) {
    const { raw, secs, total } = turtle(segments);
    this.secs = secs;
    this.L = total;
    const N = Math.round(total / DS);
    this.N = N;
    this.ds = total / N;
    const ds = this.ds;

    // Resample on uniform arc length.
    const X = new Float64Array(N + 1), Z = new Float64Array(N + 1), H = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const p = interpPath(raw, i * ds);
      X[i] = p.x; Z[i] = p.z;
    }
    // Close the loop: spread the closure error along the length.
    const ex = X[N] - X[0], ez = Z[N] - Z[0];
    for (let i = 0; i <= N; i++) {
      X[i] -= ex * (i / N);
      Z[i] -= ez * (i / N);
      H[i] = heightAt(i * ds, secs);
    }
    this.closureError = Math.hypot(ex, ez);
    // Index N is the same point as 0 after closure correction; use modular neighbours.
    const M = N; // number of unique samples
    const idx = (i) => ((i % M) + M) % M;

    // Horizontal tangent, curvature, slope.
    const Th = new Array(M);
    for (let i = 0; i < M; i++) {
      const a = idx(i + 1), b = idx(i - 1);
      const dx = X[a] - X[b], dz = Z[a] - Z[b];
      const l = Math.hypot(dx, dz) || 1;
      Th[i] = [dx / l, 0, dz / l];
    }
    const kRaw = new Float64Array(M);
    for (let i = 0; i < M; i++) {
      const a = idx(i + 1), b = idx(i - 1);
      const r0 = [-Th[i][2], 0, Th[i][0]]; // right vector
      const dT = [Th[a][0] - Th[b][0], 0, Th[a][2] - Th[b][2]];
      kRaw[i] = (dT[0] * r0[0] + dT[2] * r0[2]) / (2 * ds);
    }
    const smooth = (arr, w) => {
      const out = new Float64Array(M);
      for (let i = 0; i < M; i++) {
        let sum = 0;
        for (let k = -w; k <= w; k++) sum += arr[idx(i + k)];
        out[i] = sum / (2 * w + 1);
      }
      return out;
    };
    const kappa = smooth(kRaw, 5);
    const slopeRaw = new Float64Array(M), d2Raw = new Float64Array(M);
    for (let i = 0; i < M; i++) {
      const a = idx(i + 1), b = idx(i - 1);
      slopeRaw[i] = (H[a] - H[b]) / (2 * ds);
      d2Raw[i] = (H[a] - 2 * H[i] + H[b]) / (ds * ds);
    }
    const slope = smooth(slopeRaw, 2);
    const d2 = smooth(d2Raw, 3);
    const bankRaw = new Float64Array(M);
    for (let i = 0; i < M; i++) bankRaw[i] = Math.max(-BANK_MAX, Math.min(BANK_MAX, kappa[i] * BANK_K));
    const bank = smooth(bankRaw, 4);

    // Frames.
    const P = new Float32Array(M * 3), T = new Float32Array(M * 3);
    const R = new Float32Array(M * 3), U = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      P[i * 3] = X[i]; P[i * 3 + 1] = H[i]; P[i * 3 + 2] = Z[i];
      const th = Th[i];
      const t = norm3([th[0], slope[i], th[2]]);
      const r0 = [-th[2], 0, th[0]];
      const u0 = norm3(cross3(r0, t));
      const b = bank[i];
      const r = norm3([
        r0[0] * Math.cos(b) + u0[0] * Math.sin(b),
        r0[1] * Math.cos(b) + u0[1] * Math.sin(b),
        r0[2] * Math.cos(b) + u0[2] * Math.sin(b),
      ]);
      const u = norm3(cross3(r, t));
      T[i * 3] = t[0]; T[i * 3 + 1] = t[1]; T[i * 3 + 2] = t[2];
      R[i * 3] = r[0]; R[i * 3 + 1] = r[1]; R[i * 3 + 2] = r[2];
      U[i * 3] = u[0]; U[i * 3 + 1] = u[1]; U[i * 3 + 2] = u[2];
    }
    Object.assign(this, { P, T, R, U, H, kappa, slope, d2, bank, M });
    this._scratch = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
  }

  wrap(s) {
    const L = this.L;
    return ((s % L) + L) % L;
  }

  sectionAt(s) {
    const w = this.wrap(s);
    for (const [name, sec] of Object.entries(this.secs)) {
      if (w >= sec.s0 && w < sec.s1) return name;
    }
    return 'start';
  }

  // Interpolated frame at arc length s. Fills and returns `out`.
  // out: {p, t, r, u (arrays), H, slope, kappa, bank, d2}
  frame(s, out = {}) {
    const M = this.M;
    const f = this.wrap(s) / this.ds;
    const i0 = Math.floor(f) % M;
    const i1 = (i0 + 1) % M;
    const t = f - Math.floor(f);
    const { P, T, R, U } = this;
    const lerp = (arr, k) => arr[i0 * 3 + k] + (arr[i1 * 3 + k] - arr[i0 * 3 + k]) * t;
    const p = out.p || (out.p = [0, 0, 0]);
    const tt = out.t || (out.t = [0, 0, 0]);
    const rr = out.r || (out.r = [0, 0, 0]);
    const uu = out.u || (out.u = [0, 0, 0]);
    for (let k = 0; k < 3; k++) {
      p[k] = lerp(P, k);
      tt[k] = lerp(T, k);
      rr[k] = lerp(R, k);
      uu[k] = lerp(U, k);
    }
    const n1 = norm3(tt), n2 = norm3(rr), n3 = norm3(uu);
    tt[0] = n1[0]; tt[1] = n1[1]; tt[2] = n1[2];
    rr[0] = n2[0]; rr[1] = n2[1]; rr[2] = n2[2];
    uu[0] = n3[0]; uu[1] = n3[1]; uu[2] = n3[2];
    const li = (arr) => arr[i0] + (arr[i1] - arr[i0]) * t;
    out.H = li(this.H);
    out.slope = li(this.slope);
    out.kappa = li(this.kappa);
    out.bank = li(this.bank);
    out.d2 = li(this.d2);
    out.s = this.wrap(s);
    return out;
  }

  // World position of a point at arc length s, lateral x, height h above the centreline.
  // Writes into `out` (array of 3) and returns it.
  worldPoint(s, x, h, out = [0, 0, 0]) {
    const f = this.frame(s, this._scratch);
    out[0] = f.p[0] + f.r[0] * x + f.u[0] * h;
    out[1] = f.p[1] + f.r[1] * x + f.u[1] * h;
    out[2] = f.p[2] + f.r[2] * x + f.u[2] * h;
    return out;
  }

  // Sorted list of [name, s0, s1]
  sectionList() {
    return Object.entries(this.secs).map(([k, v]) => [k, v.s0, v.s1]);
  }
}
