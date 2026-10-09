// Junction hub. Every arm contributes a footprint from the junction centre out to its mouth
// station D. The hub is the closing of the carriageway footprints (concave corners filled with
// the corner radius r). Each band boundary Q_j is the closing of footprints widened by the band
// distance d_j with radius r - d_j, so concave corners keep a constant band width. Bands are the
// differences of consecutive boundaries. Mouth edges lie exactly on the arm mouth lines, so the
// road sections meet the hub without gaps (verified by tests).

import {
  closePolys,
  differencePolys,
  groupRings,
  offsetPolys,
  pointInPoly,
  polyArea,
  triangulate,
} from './clipper.js';
import { curveSlice, stationAt } from './curve.js';
import { EMBANK_SLOPE, FILL_RUN_MAX, GUTTER_DROP } from './profile.js';

const key = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`;

/**
 * footprint polygon of one arm, from the junction centre out past the mouth by ext metres,
 * widened by dd. The extension keeps the closing's convex-corner chamfers outside the hub; the
 * hub is clipped back to the mouth line afterwards (see beyondRect).
 */
export function armFootprint(arm, dd, ext = 0) {
  const far = arm.end === 'a' ? Math.min(arm.D + ext, arm.L) : Math.max(arm.L - arm.D - ext, 0);
  const stations =
    arm.end === 'a' ? curveSlice(arm.curve, 0, far) : curveSlice(arm.curve, arm.L, far);
  const left = stations.map((st) => [st.x + st.nx * (arm.W.L + dd), st.z + st.nz * (arm.W.L + dd)]);
  const right = stations.map((st) => [st.x - st.nx * (arm.W.R + dd), st.z - st.nz * (arm.W.R + dd)]);
  return left.concat(right.reverse());
}

/** the region beyond an arm's mouth line (away from the hub), removed from the closed hub */
export function beyondRect(arm, ext, wide) {
  const fr = mouthFrame(arm);
  const len = ext + 2;
  const nx = fr.n[0] * wide;
  const nz = fr.n[1] * wide;
  const ox = fr.o[0] * len;
  const oz = fr.o[1] * len;
  return [
    [fr.x + nx, fr.z + nz],
    [fr.x + nx + ox, fr.z + nz + oz],
    [fr.x - nx + ox, fr.z - nz + oz],
    [fr.x - nx, fr.z - nz],
  ];
}

export function circlePoly(cx, cz, r, n = 48) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
  }
  return out;
}

/** mouth frame of an arm: point, forward tangent, normal and outward direction (away from hub) */
export function mouthFrame(arm) {
  const s = arm.end === 'a' ? arm.D : arm.L - arm.D;
  const st = stationAt(arm.curve, s);
  const o = arm.end === 'a' ? [st.tx, st.tz] : [-st.tx, -st.tz];
  return { x: st.x, z: st.z, t: [st.tx, st.tz], n: [st.nx, st.nz], o };
}

function onMouth(p, frame, halfWidth) {
  const dx = p[0] - frame.x;
  const dz = p[1] - frame.z;
  const along = dx * frame.t[0] + dz * frame.t[1];
  const lat = dx * frame.n[0] + dz * frame.n[1];
  return Math.abs(along) < 0.003 && Math.abs(lat) <= halfWidth + 0.01;
}

/**
 * Build the hub of one junction and emit its meshes.
 * J: {x, z, y, radius}; arms: [{end, curve, L, D, W:{L,R}, bridged, bridgeDepth}]
 * bands: {g, k, f, v, kh}; opts: {owner, mats:{footway}}.
 * Returns {Q, planRings, warnings}.
 */
export function buildHub(J, arms, bands, mb, opts) {
  const owner = opts.owner;
  const warnings = [];
  const r = Math.max(0, J.radius ?? 6);
  const y = J.y ?? 0;
  const { g, k, f, v, kh } = bands;
  const d = [0, g, g + k, g + k + f, g + k + f + v];
  const gd = g > 0 ? GUTTER_DROP : 0;
  const footMat = opts.footwayMat || 'footway';
  const maxW = Math.max(...arms.map((a) => Math.max(a.W.L, a.W.R)));

  // extension past the mouths (see armFootprint); clipped back to the mouth lines below
  const minL = Math.min(...arms.map((a) => a.L));
  const ext = Math.max(0.5, Math.min(r + 2, 0.3 * minL));
  const Q = [];
  for (let j = 0; j < 5; j++) {
    const polys = arms.map((a) => armFootprint(a, d[j], ext));
    if (arms.length === 1) polys.push(circlePoly(J.x, J.z, Math.max(arms[0].W.L, arms[0].W.R) + d[j]));
    const closed = closePolys(polys, Math.max(0, r - d[j]));
    const wide = maxW + d[4] + ext + 4;
    const cut = arms.map((a) => beyondRect(a, ext, wide));
    Q.push(differencePolys(closed, cut));
  }
  const groups = Q.map((q) => groupRings(q));
  const keysOf = (rings) => {
    const s = new Set();
    for (const ring of rings) for (const p of ring) s.add(key(p));
    return s;
  };
  const bandOuter = [y - gd, y + kh, y + kh, y];
  const bandInner = [y, y + kh, y + kh, y];
  const planRings = [];
  const pushPlan = (mat, rings) => {
    planRings.push({ mat, rings });
  };

  // carriageway
  for (const grp of groups[0]) {
    const t = triangulate(grp.outer, grp.holes);
    emitTris(mb, 'asphalt', owner, t, () => y);
    pushPlan('asphalt', [grp.outer, ...grp.holes]);
  }

  // bands 0..3: gutter, kerb, footway, verge
  const bandMats = ['gutter', 'kerb', footMat, 'verge'];
  for (let j = 0; j < 4; j++) {
    const ring = differencePolys(Q[j + 1], Q[j]);
    if (!ring.length) continue;
    const innerKeys = keysOf(Q[j]);
    const bgroups = groupRings(ring);
    for (const grp of bgroups) {
      const t = triangulate(grp.outer, grp.holes);
      emitTris(mb, bandMats[j], owner, t, (p) => (innerKeys.has(key(p)) ? bandInner[j] : bandOuter[j]));
      pushPlan(bandMats[j], [grp.outer, ...grp.holes]);
    }
  }

  // kerb faces on the boundaries Q1 and Q3 (Q2 has equal heights either side)
  const mouthFrames = arms.map(mouthFrame);
  const isMouthEdge = (p, q) =>
    mouthFrames.some((fr, i) => {
      const hw = Math.max(arms[i].W.L, arms[i].W.R) + d[4];
      return onMouth(p, fr, hw) && onMouth(q, fr, hw);
    });
  for (const j of [1, 2, 3]) {
    const hIn = bandOuter[j - 1];
    const hOut = bandInner[j];
    if (Math.abs(hIn - hOut) < 1e-6) continue;
    {
      for (const ring of Q[j]) {
        const n = ring.length;
        for (let i = 0; i < n; i++) {
          const p = ring[i];
          const q = ring[(i + 1) % n];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6) continue;
          if (isMouthEdge(p, q)) continue;
          mb.quad('kerb', owner, [p[0], hIn, p[1]], [q[0], hIn, q[1]], [q[0], hOut, q[1]], [p[0], hOut, p[1]]);
        }
      }
    }
  }

  // embankment: fill slope from the verge outer edge, capped at FILL_RUN_MAX (a retaining wall drops
  // to ground beyond the cap), and cut at the mouth lines so the road sections take over there
  const outer4 = Q[4];
  if (y > 0.02 && opts.embankment !== false) {
    const run = Math.min(EMBANK_SLOPE * y, FILL_RUN_MAX);
    const yEnd = y - run / EMBANK_SLOPE;
    const ext = offsetPolys(outer4, run);
    let ring = differencePolys(ext, outer4);
    const blockers = mouthFrames.map((fr, i) => {
      const wBig = Math.max(arms[i].W.L, arms[i].W.R) + d[4] + run + 4;
      const nx = fr.n[0];
      const nz = fr.n[1];
      const ox = fr.o[0] * (run + 2);
      const oz = fr.o[1] * (run + 2);
      return [
        [fr.x + nx * wBig, fr.z + nz * wBig],
        [fr.x + nx * wBig + ox, fr.z + nz * wBig + oz],
        [fr.x - nx * wBig + ox, fr.z - nz * wBig + oz],
        [fr.x - nx * wBig, fr.z - nz * wBig],
      ];
    });
    ring = differencePolys(ring, blockers);
    const topKeys = keysOf(outer4);
    for (const grp of groupRings(ring)) {
      const t = triangulate(grp.outer, grp.holes);
      emitTris(mb, 'embank', owner, t, (p) => (topKeys.has(key(p)) ? y : yEnd));
      pushPlan('embank', [grp.outer, ...grp.holes]);
    }
    if (yEnd > 0.02) {
      for (const poly of ext) {
        const n = poly.length;
        for (let i = 0; i < n; i++) {
          const p = poly[i];
          const q = poly[(i + 1) % n];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6 || isMouthEdge(p, q)) continue;
          const mx = (p[0] + q[0]) / 2;
          const mz = (p[1] + q[1]) / 2;
          if (blockers.some((bl) => pointInPoly(mx, mz, bl))) continue;
          mb.quad('retain', owner, [p[0], yEnd, p[1]], [q[0], yEnd, q[1]], [q[0], 0, q[1]], [p[0], 0, p[1]]);
        }
      }
    }
  }

  // bridged hub: underside and fascia at the outer boundary
  const allBridged = arms.length > 0 && arms.every((a) => a.bridged);
  if (allBridged) {
    const dep = Math.max(...arms.map((a) => a.bridgeDepth || 0));
    const yu = y - dep;
    for (const grp of groups[4]) {
      const t = triangulate(grp.outer, grp.holes);
      emitTris(mb, 'deck', owner, t, () => yu);
    }
    if (dep > 0) {
      for (const ring of Q[4]) {
        const n = ring.length;
        for (let i = 0; i < n; i++) {
          const p = ring[i];
          const q = ring[(i + 1) % n];
          if (isMouthEdge(p, q)) continue;
          mb.quad('deck', owner, [p[0], y, p[1]], [q[0], y, q[1]], [q[0], yu, q[1]], [p[0], yu, p[1]]);
        }
      }
    }
  } else if (arms.some((a) => a.bridged) && arms.length > 1) {
    warnings.push(`${J.id}: only some arms are bridged; hub has no deck`);
  }

  const areaCheck = Q[0].reduce((s, p) => s + Math.abs(polyArea(p)), 0);
  if (!(areaCheck > 0)) warnings.push(`${J.id}: hub is empty`);
  return { Q, planRings, warnings, mouthFrames };
}

function emitTris(mb, mat, owner, t, heightOf) {
  for (const [a, b, c] of t.tris) {
    const pa = t.verts[a];
    const pb = t.verts[b];
    const pc = t.verts[c];
    mb.tri(mat, owner, [pa[0], heightOf(pa), pa[1]], [pb[0], heightOf(pb), pb[1]], [pc[0], heightOf(pc), pc[1]]);
  }
}
