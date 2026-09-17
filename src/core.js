// ============================================================================
// core.js — profile curves, roof height-fields, low-level geometry buffer
// Frontier Roof Generator v1 (Japanese/East Asian roofs)
// ============================================================================

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Profile: curved roof slope. d = horizontal distance from ridge crest.
// t = d / run  (t=0 ridge, t=tWall at wall face, t=1 eave edge)
// Pitch is steep near the ridge, shallower at the eave, and flips slightly
// upward at the very edge (nokiage / eave kick). Integrated numerically so the
// deck surface is C1-continuous.
// ---------------------------------------------------------------------------
export function makeProfile(opts) {
  const N = 1536;
  const T_MAX = 1.07;
  const run = opts.run;
  const tWall = clamp(opts.halfDepth / run, 0.2, 0.95);

  const pitchAt = (t) => {
    const ramp = 1 - smoothstep(0, tWall * 1.12, t);          // 1 at ridge -> 0 at lower slope
    let pitchDeg = lerp(opts.pitchEaveDeg, opts.pitchTopDeg, ramp);
    const tF = 0.88;                                          // nokiage kick near edge
    if (t > tF) {
      const u = clamp((t - tF) / (1 - tF), 0, 1);
      pitchDeg -= opts.flipDeg * Math.pow(Math.sin((Math.PI / 2) * u), 1.6);
    }
    return pitchDeg * DEG;
  };

  // cumulative integral of tan(pitch) dt (times run)
  const cum = new Float64Array(N + 1);
  const dt = (T_MAX * run) / N;
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * T_MAX, t1 = ((i + 1) / N) * T_MAX;
    cum[i + 1] = cum[i] + Math.tan(pitchAt((t0 + t1) / 2)) * (t1 - t0) * run;
  }
  const cumAt = (t) => {
    t = clamp(t, 0, T_MAX);
    const x = (t / T_MAX) * N;
    const i = Math.min(Math.floor(x), N - 1);
    return lerp(cum[i], cum[i + 1], x - i);
  };

  // z(t) relative to the deck plane at the wall face (z(tWall) = 0)
  const cWall = cumAt(tWall);
  const zRel = (t) => cWall - cumAt(t);

  return {
    run, tWall, N,
    pitchAt,
    z: zRel,                 // relative height above wall-face deck plane
    rise: zRel(0),           // ridge rise above wall-face plane
    drop: -zRel(1),          // eave-edge drop below wall-face plane
  };
}

// ---------------------------------------------------------------------------
// Height-field. All four roof forms are the same "pyramid over a rectangle
// with a crest segment" field — d = max(|y|, (|x|-cxr)/ax) — with different
// crest half-lengths / aspect:
//   kirizuma : cxr = Lext/2          (x-term inactive -> pure gable)
//   yosemune : cxr = Lext/2 - Dext/2 (45-degree hip folds)
//   irimoya  : same as yosemune, plus a steeper upper gable field, Z = max
//   hōgyō    : cxr = 0, ax = Lext/Dext (square-normalised pyramid)
// Level sets are rectangles (the tile courses), fold lines are the hips.
// ---------------------------------------------------------------------------
export function makeField(type, dim, prof, extras = {}) {
  const Dext = dim.D + 2 * dim.ov;
  const Lext = dim.L + 2 * dim.rakeOv;
  const halfD = Dext / 2;
  const halfL = Lext / 2;
  let cxr, ax;
  if (type === 'kirizuma')      { cxr = halfL;            ax = 1; }
  else if (type === 'yosemune') { cxr = halfL - halfD;    ax = 1; }
  else if (type === 'hogyo')    { cxr = 0;                ax = Lext / Dext; }
  else                          { cxr = halfL - halfD;    ax = 1; } // irimoya hip part

  const dAt = (x, y) => Math.max(Math.abs(y), (Math.abs(x) - cxr) / ax);
  const tOf = (d) => clamp(d / halfD, 0, prof.T_MAX);
  const xTerm = (x) => (Math.abs(x) - cxr) / ax;

  const cornerF = (x, y) => {
    const a = clamp((2 * Math.abs(x)) / Lext, 0, 1);
    const b = clamp((2 * Math.abs(y)) / Dext, 0, 1);
    return Math.pow(a * b, dim.cornerPow);
  };

  const baseZ = (x, y) => {
    const d = dAt(x, y);
    return prof.z(tOf(d)) + dim.cornerLift * cornerF(x, y) * Math.pow(tOf(d), 2);
  };

  const field = {
    type, cxr, ax, halfD, halfL, Dext, Lext, prof, dim,
    dAt, tOf, baseZ,
    flow: (x, y) => (Math.abs(y) >= xTerm(x) ? [0, Math.sign(y) || 1] : [Math.sign(x) || 1, 0]),
    // contour point at level d, fraction f along the rectangle perimeter
    contour(d, f) {
      const hx = cxr + d * ax, hy = d;
      const P = 4 * hx + 4 * hy;
      let s = ((f % 1) + 1) % 1 * P;
      // walk: start at (-hx,-hy) going +x (bottom edge), then +y, -x, -y
      if (s < 2 * hx)  return { x: -hx + s,        y: -hy,          tx: 1, ty: 0 };
      s -= 2 * hx;
      if (s < 2 * hy)  return { x: hx,             y: -hy + s,      tx: 0, ty: 1 };
      s -= 2 * hy;
      if (s < 2 * hx)  return { x: hx - s,         y: hy,           tx: -1, ty: 0 };
      s -= 2 * hx;
      return               { x: -hx,            y: hy - s,          tx: 0, ty: -1 };
    },
    perim(d) { return 4 * (cxr + d * ax) + 4 * d; },
  };

  // ---- irimoya: upper gable field + junction ------------------------------
  if (type === 'irimoya') {
    const hipRise = prof.rise * extras.hipRiseFrac;
    // hip profile normalised so that z(tWall) is exactly the wall-face plane
    const hipZ = (x, y) => {
      const d = dAt(x, y);
      const t = tOf(d);
      return prof.z(t) * (hipRise / prof.rise) + dim.cornerLift * cornerF(x, y) * Math.pow(t, 2);
    };
    const y1 = clamp(extras.breakT, 0.12, 0.6) * halfD;
    const HrUp = prof.rise;
    const kg = (HrUp - hipZ(0, y1)) / y1;                    // gable plane slope
    const gableZ = (x, y) => HrUp - kg * Math.abs(y);
    field.hipZ = hipZ;
    field.gableZ = gableZ;
    field.kg = kg;
    // upper gable planes exist only over the roof span (|x| <= halfL);
    // beyond the rake line the hip surface is the roof.
    field.Z = (x, y) =>
      Math.abs(x) <= halfL ? Math.max(hipZ(x, y), gableZ(x, y)) : hipZ(x, y);
    field.onHip = (x, y) => hipZ(x, y) >= gableZ(x, y) - 1e-4;
    // junction curve gable∩hip: for each x, bisect y in [0, halfD]
    field.junction = () => {
      const pts = [];
      const n = 48;
      for (let i = 0; i <= n; i++) {
        const x = -halfL + (i / n) * Lext;
        let lo = 0, hi = halfD;
        if (gableZ(x, 0) <= hipZ(x, 0)) { pts.push({ x, y: 0 }); continue; }
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2;
          if (gableZ(x, mid) > hipZ(x, mid)) lo = mid; else hi = mid;
        }
        pts.push({ x, y: (lo + hi) / 2 });
      }
      return pts;
    };
  } else {
    field.Z = baseZ;
  }
  return field;
}

// ---------------------------------------------------------------------------
// GeoBuf — flat-shaded vertex-coloured geometry accumulator (one draw call)
// ---------------------------------------------------------------------------
export class GeoBuf {
  constructor() { this.p = []; this.n = []; this.c = []; this.idx = []; this.v = 0; }
  tri(a, b, c, col, nrm) {
    let n = nrm;
    if (!n) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
    }
    for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); }
    const s = col;
    for (let k = 0; k < 3; k++) this.c.push(s[0], s[1], s[2]);
    this.idx.push(this.v, this.v + 1, this.v + 2);
    this.v += 3;
  }
  quad(a, b, c, d, col, nrm) { this.tri(a, b, c, col, nrm); this.tri(a, c, d, col, nrm); }

  // oriented box: centre c, axes u/v/w (unit, orthonormal-ish), half sizes
  box(c, u, v, w, hu, hv, hw, col) {
    const P = (su, sv, sw) => [
      c[0] + u[0] * hu * su + v[0] * hv * sv + w[0] * hw * sw,
      c[1] + u[1] * hu * su + v[1] * hv * sv + w[1] * hw * sw,
      c[2] + u[2] * hu * su + v[2] * hv * sv + w[2] * hw * sw];
    const p = [P(1,1,1),P(-1,1,1),P(-1,-1,1),P(1,-1,1),P(1,1,-1),P(-1,1,-1),P(-1,-1,-1),P(1,-1,-1)];
    this.quad(p[0],p[3],p[2],p[1],col); this.quad(p[4],p[5],p[6],p[7],col);
    this.quad(p[0],p[1],p[5],p[4],col); this.quad(p[3],p[7],p[6],p[2],col);
    this.quad(p[0],p[4],p[7],p[3],col); this.quad(p[1],p[2],p[6],p[5],col);
  }

  // tube (full or arc) between p0->p1 with radius taper, oriented by up
  tube(p0, p1, r0, r1, opts = {}) {
    const sides = opts.sides ?? 8;
    const a0 = opts.arc0 ?? -Math.PI * 0.58, a1 = opts.arc1 ?? Math.PI * 0.58;
    const col = opts.col, colFn = opts.colFn;
    const up = opts.up || [0, 0, 1];
    let ax = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
    const al = Math.hypot(...ax) || 1e-6;
    ax = [ax[0]/al, ax[1]/al, ax[2]/al];
    let s0 = [up[1]*ax[2]-up[2]*ax[1], up[2]*ax[0]-up[0]*ax[2], up[0]*ax[1]-up[1]*ax[0]];
    let sl = Math.hypot(...s0);
    if (sl < 1e-6) s0 = [1, 0, 0]; else s0 = [s0[0]/sl, s0[1]/sl, s0[2]/sl];
    const u2 = [ax[1]*s0[2]-ax[2]*s0[1], ax[2]*s0[0]-ax[0]*s0[2], ax[0]*s0[1]-ax[1]*s0[0]];
    const nseg = Math.max(1, opts.rings ?? 1);
    const ringPts = (i) => {
      const u = i / nseg;
      const r = lerp(r0, r1, u);
      const px = lerp(p0[0], p1[0], u), py = lerp(p0[1], p1[1], u), pz = lerp(p0[2], p1[2], u);
      const ring = [];
      for (let k = 0; k <= sides; k++) {
        const phi = lerp(a0, a1, k / sides);
        const cs = Math.cos(phi) * r, sn = Math.sin(phi) * r;
        ring.push([px + s0[0]*cs + u2[0]*sn, py + s0[1]*cs + u2[1]*sn, pz + s0[2]*cs + u2[2]*sn]);
      }
      return ring;
    };
    let prev = ringPts(0);
    for (let i = 1; i <= nseg; i++) {
      const cur = ringPts(i);
      for (let k = 0; k < sides; k++) {
        const cc = colFn ? colFn(i / nseg, k / sides) : col;
        this.quad(prev[k], prev[k+1], cur[k+1], cur[k], cc);
      }
      prev = cur;
    }
    if (opts.caps) {
      const capC = [p0[0] + u2[0]*0 + s0[0]*0, p0[1], p0[2]]; // centre of start cap
      const ring = ringPts(0);
      const centre0 = [p0[0], p0[1], p0[2]];
      for (let k = 0; k < sides; k++) this.tri(centre0, ring[k+1], ring[k], opts.capCol || col);
      const centre1 = [p1[0], p1[1], p1[2]];
      const ring1 = ringPts(nseg);
      for (let k = 0; k < sides; k++) this.tri(centre1, ring1[k], ring1[k+1], opts.capCol || col);
    }
  }

  // ribbon surface through sampled rows: rows = [[p,...],[p,...]] with per-p
  // {x,y,z} and shared color; builds quads between consecutive rows
  ribbon(rows, col, colFn) {
    for (let i = 0; i < rows.length - 1; i++) {
      const ra = rows[i], rb = rows[i + 1];
      const n = Math.min(ra.length, rb.length);
      for (let j = 0; j < n - 1; j++) {
        const cc = colFn ? colFn(i / (rows.length - 1), j / (n - 1)) : col;
        this.quad([ra[j].x, ra[j].y, ra[j].z], [ra[j+1].x, ra[j+1].y, ra[j+1].z],
                  [rb[j+1].x, rb[j+1].y, rb[j+1].z], [rb[j].x, rb[j].y, rb[j].z], cc);
      }
    }
  }

  // plank following a polyline of 3D points with given up, cross w(h) t(h)
  plank(pts, up, width, thick, col) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const c = [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2];
      let u = [b.x - a.x, b.y - a.y, b.z - a.z];
      const l = Math.hypot(...u) || 1e-6;
      u = [u[0]/l, u[1]/l, u[2]/l];
      let w = [u[1]*up[2]-u[2]*up[1], u[2]*up[0]-u[0]*up[2], u[0]*up[1]-u[1]*up[0]];
      const wl = Math.hypot(...w) || 1;
      w = [w[0]/wl, w[1]/wl, w[2]/wl];
      this.box(c, u, w, up, l / 2 + 0.004, width / 2, thick / 2, col);
    }
  }

  get triangles() { return this.idx.length / 3; }
}
