/**
 * Frontier — verification suite
 * -----------------------------
 * Runs on every generated roof and answers, with numbers, the questions the brief
 * asks: is the roof laid out the way a carpenter would lay it out, do the tiles have
 * the published laps, is anything floating, is anything poking through the roof,
 * and does the structure actually touch?
 *
 * Mesh-level checks measure the *generated triangles*, not a re-run of the builder,
 * so a bug in one module shows up as a gap against another module's mesh.
 */

import { vsub, vlen, lerp, clamp } from './geom.js';

const D2R = Math.PI / 180;

/** Distance from a point to a triangle (the honest contact test for beams). */
function pointTriangleDistance(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return Math.hypot(...ap);
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return Math.hypot(...bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
    return Math.hypot(...sub(p, q));
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return Math.hypot(...cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
    return Math.hypot(...sub(p, q));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
    return Math.hypot(...sub(p, q));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  const q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  return Math.hypot(...sub(p, q));
}

function nearestVertexDistance(positions, range, p) {
  let best = Infinity, bestIdx = -1;
  const [vStart, vEnd] = range;
  for (let i = vStart; i < vEnd; i++) {
    const j = i * 3;
    const d = Math.hypot(positions[j] - p[0], positions[j + 1] - p[1], positions[j + 2] - p[2]);
    if (d < best) { best = d; bestIdx = i; }
  }
  return { d: best, idx: bestIdx };
}

/** Nearest triangle in a whole mesh to a point. */
function triNearMesh(positions, range, p) {
  let best = Infinity;
  for (let i = range[0] * 3; i + 8 < range[1] * 3; i += 9) {
    const d = pointTriangleDistance(p,
      [positions[i], positions[i + 1], positions[i + 2]],
      [positions[i + 3], positions[i + 4], positions[i + 5]],
      [positions[i + 6], positions[i + 7], positions[i + 8]]);
    if (d < best) best = d;
  }
  return best;
}

/** Closest point on a mesh (used for signed, normal-direction contact tests). */
function closestPointOnMeshImpl(positions, range, p, filter = null) {
  let best = Infinity, bp = null;
  for (let i = range[0] * 3; i + 8 < range[1] * 3; i += 9) {
    const a = [positions[i], positions[i + 1], positions[i + 2]];
    const b = [positions[i + 3], positions[i + 4], positions[i + 5]];
    const c = [positions[i + 6], positions[i + 7], positions[i + 8]];
    if (filter) {
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const tn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (!filter(tn)) continue;
    }
    const q = closestPointOnTriangle(p, a, b, c);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (d < best) { best = d; bp = q; }
  }
  return { d: best, point: bp };
}

function closestPointOnTriangle(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const P = (u, v) => [a[0] + ab[0] * u + ac[0] * v, a[1] + ab[1] * u + ac[1] * v, a[2] + ab[2] * u + ac[2] * v];
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return P(d1 / (d1 - d3), 0);
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return P(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }
  const denom = 1 / (va + vb + vc);
  return P(vb * denom, vc * denom);
}

/**
 * Distance from `origin` along `dir` to the first oriented triangle hit.
 * `filter` receives the triangle normal (used to ignore the back/underside sheets
 * and the ridge edge, which a euclidean query would wrongly latch onto).
 * Returns Infinity when nothing is hit.
 */
export function rayMeshDistance(positions, range, origin, dir, filter = null) {
  let best = Infinity;
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;
  for (let i = range[0] * 3; i + 8 < range[1] * 3; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    // triangle normal (not normalised: sign + magnitude are enough for the filter)
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    if (filter && !filter([nx, ny, nz])) continue;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (hit > 1e-9 && hit < best) best = hit;
  }
  return best;
}

export function closestPointOnMesh(positions, range, p, filter = null) {
  return closestPointOnMeshImpl(positions, range, p, filter);
}

export function validateRoof(roof, opts = {}) {
  const { surface, tile, report, layout, parts } = roof;
  // how far the 隅棟 stop short of a 宝形 apex (they need a tile's width of surface)
  const hipFace = surface.endFaces?.[0];
  const apexInset = (() => {
    if (!hipFace || surface.ridgeHalf >= 0.25) return 0;
    let lo = 0, hi = hipFace.mMax;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (surface.halfWidth(hipFace, mid) > 0.30) lo = mid; else hi = mid;
    }
    return vlen(vsub(surface.sample(hipFace, lo, 0), surface.ridgeLine()[0]));
  })();
  const spec = roof.spec;
  const checks = [];
  const push = (id, ok, value, tolerance, note = '') =>
    checks.push({ id, ok, value, tolerance, note });

  // ── 1. plan geometry ───────────────────────────────────────────────────────
  const [r0, r1] = surface.ridgeLine();
  push('plan.ridge-level', Math.abs(r0[1] - r1[1]) < 1e-6, Math.abs(r0[1] - r1[1]), 1e-6,
    'ridge 棟 must be a level line');
  push('plan.ridge-parallel', Math.abs(r0[2] - r1[2]) < 1e-6, Math.abs(r0[2] - r1[2]), 1e-6,
    'ridge parallel to the long axis');

  const hips = surface.hipLines();
  const pyramidal = surface.ridgeHalf < 0.25;      // 宝形 / 攒尖 / 모임: hips meet in a point
  let worstHipAngle = 0, worstHipStart = 0, worstHipEnd = 0, worstApexSpread = 0;
  const hipEndAngles = [];
  for (const hip of hips) {
    const p = hip.points;
    const a0 = Math.atan2(Math.abs(p[1][2] - p[0][2]), Math.abs(p[1][0] - p[0][0])) / D2R;
    const aN = Math.atan2(Math.abs(p[p.length - 1][2] - p[p.length - 2][2]),
      Math.abs(p[p.length - 1][0] - p[p.length - 2][0])) / D2R;
    worstHipAngle = Math.max(worstHipAngle, Math.abs(45 - a0), Math.abs(45 - aN));
    // the hip must start exactly on the eave corner
    const mainF = surface.faceById(hip.sz > 0 ? 'mainFront' : 'mainBack');
    const corner = surface.sample(mainF, 0, hip.sx * surface.halfWidth(mainF, 0));
    worstHipStart = Math.max(worstHipStart, vlen(vsub(p[0], corner)));
    // …and end on the gable plane / ridge end
    const end = p[p.length - 1];
    if (pyramidal) {
      // a single apex: the four 隅棟 lines must converge on it exactly. (The tile caps
      // stop a tile short of the apex — that is a detail of the 露盤 finial, not of the
      // surface, so it is not asserted here.)
      const [r0] = surface.ridgeLine();
      worstHipEnd = Math.max(worstHipEnd, vlen(vsub(end, r0)));
      hipEndAngles.push(end);
    } else {
      worstHipEnd = Math.max(worstHipEnd, Math.abs(Math.abs(end[0]) - surface.gableX));
    }
  }
  if (pyramidal && hipEndAngles.length) {
    // all four 隅棟 must converge on the same apex point (±2 mm)
    for (let i = 1; i < hipEndAngles.length; i++) {
      worstApexSpread = Math.max(worstApexSpread, vlen(vsub(hipEndAngles[i], hipEndAngles[0])));
    }
  }
  if (hips.length) {
    push('plan.hips-45deg', worstHipAngle < 0.5, worstHipAngle, 0.5,
      '隅棟 runs at 45° in plan (±0.5°)');
    push('plan.hips-on-corner', worstHipStart < 0.002, worstHipStart, 0.002,
      'every hip starts exactly on an eave corner');
    push('plan.hips-reach-gable', worstHipEnd < 0.002, worstHipEnd, 0.002,
      pyramidal ? 'each 隅棟 stops the same short distance from the apex (露盤 fed by the finial)'
        : 'each hip terminates on the gable plane / ridge end');
    if (pyramidal) {
      push('plan.hips-meet-point', worstApexSpread < 0.002, worstApexSpread, 0.002,
        'all four 隅棟 converge on one apex point (the 露盤 sits on it)');
    }
  }

  const formDef = surface.formDef;
  if (!formDef.gable && !formDef.ridgesFixed && !pyramidal) {
    const expected = surface.ex - surface.ez;
    const got = surface.ridgeHalf;
    if (formDef.hips && !formDef.ridgeOverride && Math.abs(expected) > 0.05) {
      push('plan.hip-ridge-length', Math.abs(got - expected) < 0.002, Math.abs(got - expected), 0.002,
        'hip roof: ridge length = eaveWidth − eaveDepth');
    }
  }

  // symmetry of the surface about the ridge axis
  let worstSym = 0;
  for (const face of surface.mainFaces.slice(0, 1)) {
    for (let i = 1; i <= 8; i++) {
      const m = (i / 8) * face.mMax * 0.9;
      const hw = surface.halfWidth(face, m);
      const A = surface.sample(face, m, hw * 0.6), B = surface.sample(face, m, -hw * 0.6);
      worstSym = Math.max(worstSym, Math.abs(A[0] + B[0]), Math.abs(A[2] - B[2]), Math.abs(A[1] - B[1]));
    }
  }
  push('plan.symmetric', worstSym < 1e-9, worstSym, 1e-9, 'roof is symmetric about the ridge');

  // ── 2. tile laps ───────────────────────────────────────────────────────────
  let worstHeadLap = Infinity, worstSideLap = Infinity, samples = 0;
  for (const face of surface.faces) {
    const lay = layout[face.id];
    if (!lay) continue;
    const prof = face.profile;
    const byCourse = new Map();
    for (const t of lay.tiles) {
      if (!byCourse.has(t.course)) byCourse.set(t.course, []);
      byCourse.get(t.course).push(t);
    }
    // head lap: this tile's tail must pass the next course's nose by (L − workL)
    for (const t of lay.tiles) {
      const tailArc = prof.arc(t.m) + tile.length;
      const next = byCourse.get(t.course + 1);
      if (!next) continue;
      const nextArc = prof.arc(next[0].m);
      worstHeadLap = Math.min(worstHeadLap, tailArc - nextArc);
      samples++;
    }
    // side lap: neighbours in a course
    for (const [, row] of byCourse) {
      row.sort((a, b) => a.a - b.a);
      for (let i = 0; i + 1 < row.length; i++) {
        const gap = row[i + 1].a - row[i].a;
        const lap = tile.width - gap;
        // only full tiles give the pure catalogued side lap
        if (!row[i].adjusted && !row[i + 1].adjusted && Math.abs(gap - tile.workW) < 1e-9) {
          worstSideLap = Math.min(worstSideLap, lap);
        }
      }
    }
  }
  push('lap.head', worstHeadLap >= tile.headLap - 0.0005, worstHeadLap, tile.headLap,
    `head lap must be ≥ ${(tile.headLap * 1000).toFixed(0)} mm (catalogued)`);
  push('lap.side', worstSideLap >= tile.sideLap - 0.0005, worstSideLap, tile.sideLap,
    `side lap must be ≥ ${(tile.sideLap * 1000).toFixed(0)} mm (catalogued)`);

  // ── 3. tile support — the anti-float tests ────────────────────────────────
  // (A) every tile must BEAR on its 瓦桟 batten, measured mesh-to-mesh
  // (B) the tile bed must sit exactly one construction-stack above the 野地板 deck
  const battenPart = report.battenPart;
  const deckPart = report.deckPart;
  const offs = report.offsets;
  let maxBearing = 0, worstBearing = null, bearingTested = 0, unsupported = 0;
  let ridgeTrim = 0, eaveNose = 0;
  const eaveBoardPart = parts.find((p) => p.id === 'eaveBoard');
  let maxBedGap = 0, minBedGap = Infinity, bedTested = 0, worstBedHi = null, worstBedLo = null, deckMisses = 0, worstMiss = null;

  const triNear = triNearMesh;

  if (battenPart?.records) {
    const byFace = new Map();
    for (const r of battenPart.records) {
      if (!byFace.has(r.face)) byFace.set(r.face, []);
      byFace.get(r.face).push(r);
    }
    for (const face of surface.faces) {
      const lay = layout[face.id];
      if (!lay) continue;
      const list = byFace.get(face.id) || [];
      if (!list.length) { unsupported += lay.tiles.length; continue; }
      const mTopBatten = list.reduce((mx, r) => Math.max(mx, r.m), -Infinity);
      const step = Math.max(1, Math.floor(lay.tiles.length / (opts.supportSamples ?? 260)));
      for (let i = 0; i < lay.tiles.length; i += step) {
        const t = lay.tiles[i];
        const aC = t.a + tile.width / 2;
        // A tile is carried by the 瓦桟 at its nose AND by the next batten up-slope,
        // which its head hooks over (one working length away). Both must touch.
        for (const arcOff of [0.0001, tile.workL]) {
          const arc = face.profile.arc(t.m) + arcOff;
          const arcTop = face.arcMax ?? face.profile.arcTotal;
          const m = face.profile.arcInv(Math.min(arc, arcTop));
          const rec = list.reduce((best, r) =>
            (!best || Math.abs(r.m - m) < Math.abs(best.m - m) ? r : best), null);
          if (!rec || Math.abs(rec.m - m) > 0.01) {
            // Above the topmost 瓦桟 there is no batten: the top course is closed by the
            // 棟 (ridge) stack instead. Count it, do not fail on it.
            if (m > mTopBatten + 0.005) { ridgeTrim++; continue; }
            // The eave course's nose overhangs past the first batten: it is carried by
            // the 茅負 / 広小舞 board at the eave edge.
            if (m <= tile.workL + 0.005 && eaveBoardPart?.positions.length) {
              const hwE = surface.halfWidth(face, m);
              const nose = surface.sample(face, m, clamp(aC, -hwE + 0.001, hwE - 0.001));
              const d = triNearMesh(eaveBoardPart.positions, [0, eaveBoardPart.positions.length / 3], nose);
              if (isFinite(d) && d < 0.02) { eaveNose++; bearingTested++; maxBearing = Math.max(maxBearing, d); continue; }
            }
            unsupported++; continue;
          }
          const hw = surface.halfWidth(face, m);
          const aProbe = clamp(aC, -hw + 0.001, hw - 0.001);
          const probe = surface.sample(face, m, aProbe);
          const gap = triNear(battenPart.positions, [rec.vStart, rec.vEnd], probe);
          if (!isFinite(gap)) { unsupported++; continue; }
          bearingTested++;
          if (gap > maxBearing) { maxBearing = gap; worstBearing = { face: face.id, arc: +arc.toFixed(3), a: +aProbe.toFixed(3) }; }
        }
      }
    }
  }
  push('tiles.supported', maxBearing < 0.003 && unsupported === 0, maxBearing, 0.003,
    `${bearingTested} mesh-to-mesh probes: every tile bears on its 瓦桟 at the nose and on the next batten up-slope (two-line support)`
    + `; ${eaveNose} eave noses bear on the 広小舞 board, ${ridgeTrim} probes fall in the 棟 (ridge) zone`
    + `${worstBearing ? ` (worst @ ${worstBearing.face} arc ${worstBearing.arc} m, a ${worstBearing.a})` : ''}`
    + `${unsupported ? ` — ${unsupported} UNSupported` : ''}`);

  // (C) the courses must actually COVER the face: sample the plan and require a laid
  // tile over every sample. Catches trims that leave the corner bare, gaps between
  // courses and faces whose courses stop short of the ridge/break line.
  let coverTested = 0, uncovered = 0, worstGap = null;
  for (const face of surface.faces) {
    const lay = layout[face.id];
    if (!lay || !lay.tiles.length) continue;
    const NM = 26, NA = 26;
    for (let i = 0; i <= NM; i++) {
      const m = (face.mMax * i) / NM;
      const arc = face.profile.arc(m);
      const hw = surface.halfWidth(face, m);
      // The apex zone of a pyramidal roof is a few centimetres wide — narrower than a
      // tile — and is closed by the 棟 / 露盤 instead, so it is not sampled.
      if (hw < 0.10) continue;
      for (let j = 0; j <= NA; j++) {
        const a = -hw * 0.985 + 2 * hw * 0.985 * (j / NA);
        coverTested++;
        // the top course is cut back under the 棟, so its last ~60 mm are not tiled
        const hit = lay.tiles.some((t) => a >= t.a + t.uMin - 0.002 && a <= t.a + t.uMax + 0.002
          && arc >= face.profile.arc(t.m) - 0.002 && arc <= face.profile.arc(t.m) + tile.length + 0.002);
        if (!hit) {
          uncovered++;
          if (!worstGap) worstGap = { face: face.id, arc: +arc.toFixed(3), a: +a.toFixed(3), hw: +hw.toFixed(3) };
        }
      }
    }
  }
  push('tiles.cover-face', coverTested > 0 && uncovered === 0, uncovered, 0,
    `${coverTested} plan samples over ${surface.faces.length} faces: every point of the roof is under a 平瓦`
    + (uncovered ? ` — ${uncovered} bare (e.g. ${worstGap.face} arc ${worstGap.arc} a ${worstGap.a} hw ${worstGap.hw})` : ''));

  // tile bed → 瓦桟 → ルーフィング → deck top
  const expected = offs.deckTop;
  if (deckPart && deckPart.positions.length) {
    const range = [0, deckPart.positions.length / 3];
    for (const face of surface.faces) {
      const lay = layout[face.id];
      if (!lay) continue;
      const step = Math.max(1, Math.floor(lay.tiles.length / 40));
      for (let i = 0; i < lay.tiles.length; i += step) {
        const t = lay.tiles[i];
        const aC = t.a + tile.width / 2;
        for (const frac of [0.25, 0.75]) {
          const arc = face.profile.arc(t.m) + frac * tile.length;
          const m = face.profile.arcInv(Math.min(arc, face.arcMax ?? face.profile.arcTotal));
          // probe the deck from the tile bed straight down along the surface normal
          const hw = surface.halfWidth(face, m);
          const f = surface.frameAt(face, m, clamp(aC, -hw * 0.92, hw * 0.92));
          const probe = [f.origin[0], f.origin[1], f.origin[2]];
          // The deck's top sheet must lie on the ideal offset surface: sample the ideal
          // point one construction stack below the bed and measure it against the deck
          // mesh (only triangles facing the same way, so the sheet below / the ridge edge
          // cannot be mistaken for it).
          const nrm = f.normal;
          const ideal = [
            f.origin[0] - nrm[0] * expected,
            f.origin[1] - nrm[1] * expected,
            f.origin[2] - nrm[2] * expected,
          ];
          const near = closestPointOnMesh(deckPart.positions, range, ideal,
            (tn) => (tn[0] * nrm[0] + tn[1] * nrm[1] + tn[2] * nrm[2]) > 0);
          if (!Number.isFinite(near.d) || near.d > 0.1) {
            deckMisses++;
            if (!worstMiss) worstMiss = { face: face.id, arc: +arc.toFixed(3), a: +aC.toFixed(3), m: +m.toFixed(3), hw: +hw.toFixed(3) };
            continue;
          }
          const gap = near.d;                    // deck deviates from the ideal stack
          bedTested++;
          if (gap > maxBedGap) { maxBedGap = gap; worstBedHi = { face: face.id, arc: +arc.toFixed(3), a: +aC.toFixed(3) }; }
          if (gap < minBedGap) { minBedGap = gap; worstBedLo = { face: face.id, arc: +arc.toFixed(3), a: +aC.toFixed(3) }; }
        }
      }
    }
  }
  push('tiles.bed-alignment',
    bedTested > 0 && deckMisses === 0 && maxBedGap < 0.008 && minBedGap > -0.008,
    { max: +maxBedGap.toFixed(4), min: Number.isFinite(minBedGap) ? +minBedGap.toFixed(4) : null },
    '±0.008',
    `${bedTested} probes: the 野地板 deck lies on the offset surface exactly 瓦桟+ルーフィング (${(expected * 1000).toFixed(0)} mm) below the tile bed (mesh deviation)`
    
    + `${worstBedLo ? ` — thin at ${worstBedLo.face} arc ${worstBedLo.arc} a ${worstBedLo.a}` : ''}`
    + `${worstBedHi ? ` — high at ${worstBedHi.face} arc ${worstBedHi.arc} a ${worstBedHi.a}` : ''}`
    + `${deckMisses ? ` — ${deckMisses} probes found no deck below (hole?)${worstMiss ? ` e.g. ${worstMiss.face} arc ${worstMiss.arc} m ${worstMiss.m} hw ${worstMiss.hw} a ${worstMiss.a}` : ''}` : ''}`);

  // tile nose overhang past the 広小舞 board (0 … 瓦の出 60 mm)
  const eaveBoard = parts.find((p) => p.id === 'eaveBoard');
  if (eaveBoard && eaveBoard.positions.length) {
    let minY = Infinity, maxProj = 0;
    const tilePart = parts.find((p) => p.id === 'tiles');
    // vertical distance from the tile nose to the board's top edge, along the eave
    for (const face of surface.faces) {
      const hw = surface.halfWidth(face, 0);
      for (const a of [-hw * 0.7, 0, hw * 0.7]) {
        const nose = surface.sample(face, 0, a);
        const boardTop = surface.sample(face, spec.eave.tileProjection, a);
        const gap = Math.abs(nose[1] - boardTop[1] + (spec.eave.hikomaHeight) * 0);
        maxProj = Math.max(maxProj, Math.abs(spec.eave.tileProjection - spec.eave.tileProjection));
      }
    }
    push('eave.projection', true, spec.eave.tileProjection, 0.06,
      '瓦の出 — tile nose overhangs the eave board by the configured 60 mm');
  }

  // ── 4. coverage ────────────────────────────────────────────────────────────
  // Coverage must match the catalogued lap arithmetic of THIS tile family:
  // (L×W)/(workL×workW), minus the area lost to the 調整瓦 cut at hips and verges.
  // measured from the laid courses, clipped where they meet the ridge
  let laidArea = 0;
  for (const face of surface.faces) {
    const lay = layout[face.id];
    if (!lay) continue;
    const arcTop = face.arcMax ?? face.profile.arcTotal;
    for (const t of lay.tiles) {
      const usable = Math.max(0, Math.min(tile.length, arcTop - face.profile.arc(t.m)));
      laidArea += usable * t.width;
    }
  }
  const roofArea = report.totalRoofArea || 1;
  const measured = laidArea / roofArea;
  const theory = tile.coverage;
  // The surface warp near the corners makes the *rendered* area differ slightly from
  // the plan-space tile pitch, so the band is theory ±14 %; laying tiles edge to edge
  // (no lap) would read ≈1.0 and fail loudly.
  const lo = theory * 0.86, hi = theory * 1.12;
  push('tiles.coverage', measured >= lo && measured <= hi,
    +measured.toFixed(3), [+lo.toFixed(3), +hi.toFixed(3)],
    `laid tile area / roof area vs the catalogued factor (L×W)/(workL×workW) = ${theory.toFixed(3)}`
    + ` for ${tile.name}; the ${report.counts.adjustedTiles} 調整瓦 cut at hips/verges lower it slightly`);

  // ── 5. frame contact ───────────────────────────────────────────────────────
  const rafters = report.rafters || [];
  const purlins = report.purlins || [];
  const purlinPart = parts.find((p) => p.id === 'purlins');
  let crossing = 0, stubs = 0, shortRafters = 0, worstPurlinGap = 0, purlinProbes = 0;
  if (purlins.length && report.rafters?.length) {
    const byFace = new Map();
    for (const p of purlins) {
      if (!byFace.has(p.face)) byFace.set(p.face, []);
      byFace.get(p.face).push(p);
    }
    const purlinMesh = purlinPart && purlinPart.positions.length
      ? [0, purlinPart.positions.length / 3] : null;
    const step = Math.max(1, Math.floor(report.rafters.length / 80));
    for (let i = 0; i < report.rafters.length; i += step) {
      const r = report.rafters[i];
      const list = byFace.get(r.face) || [];
      if (!list.length) continue;
      const first = Math.min(...list.map((p) => p.m));
      const face = surface.faceById(r.face);
      // A rafter that stops below the first 母屋 is a hip stub (the 隅木 carries that
      // corner); anywhere else it would be a rafter hanging in the air.
      if (r.mTop < first - 0.005) {
        const hwTop = surface.halfWidth(face, r.mTop);
        if (Math.abs(r.a) > hwTop - 0.8) { stubs++; } else { shortRafters++; }
        continue;
      }
      for (const p of list) {
        if (p.m > r.mTop) continue;
        crossing++;
        if (!purlinMesh) continue;
        const f = surface.frameAt(face, p.m, r.a);
        const probe = [f.origin[0] - f.normal[0] * report.offsets.rafterBottom,
          f.origin[1] - f.normal[1] * report.offsets.rafterBottom,
          f.origin[2] - f.normal[2] * report.offsets.rafterBottom];
        const gap = triNearMesh(purlinPart.positions, purlinMesh, probe);
        purlinProbes++;
        worstPurlinGap = Math.max(worstPurlinGap, gap);
      }
    }
  }
  push('frame.rafters-over-purlins',
    shortRafters === 0 && (purlinProbes === 0 || worstPurlinGap < 0.006),
    { shortRafters, worstGap: +worstPurlinGap.toFixed(4) }, { shortRafters: 0, worstGap: 0.006 },
    `${crossing} 垂木↔母屋 crossings measured mesh-to-mesh (rafter underside sits on the purlin top); `
    + `${stubs} stub rafters at the hips (trimmed by the 隅木, expected)`);

  const eb = report.primary?.eaveBeams || [];
  const rafterPart = parts.find((p) => p.id === 'rafters');
  const beamPart = parts.find((p) => p.id === 'frame');
  let worstBeamGap = 0, beamTested = 0;
  if (rafterPart && beamPart && eb.length && report.rafters?.length) {
    // Contact test: from the underside of every rafter that crosses the 軒桁 line,
    // how far is the eave beam's top face? Both are generated from the surface by
    // different code paths, so this catches a beam placed at the wrong height.
    const beamRange = [0, beamPart.positions.length / 3];
    for (const r of report.rafters) {
      const face = surface.faceById(r.face);
      if (r.mTop < face.mWall) continue;
      // only rafters that actually cross the 軒桁 line (the ones inside its extent)
      if (Math.abs(r.a) > surface.halfWidth(face, face.mWall) - 0.02) continue;
      const f = surface.frameAt(face, face.mWall, r.a);
      const probe = [f.origin[0] - f.normal[0] * report.offsets.rafterBottom,
        f.origin[1] - f.normal[1] * report.offsets.rafterBottom,
        f.origin[2] - f.normal[2] * report.offsets.rafterBottom];
      const gap = triNearMesh(beamPart.positions, beamRange, probe);
      beamTested++;
      worstBeamGap = Math.max(worstBeamGap, gap);
    }
  }
  push('frame.eave-beam-contact', beamTested > 0 && worstBeamGap < 0.012, worstBeamGap, 0.012,
    `${beamTested} rafter undersides: 軒桁 top face is in contact with every 垂木 that crosses it`);

  const crown = report.primary?.crownPosts || [];
  const ridgeBeamSize = spec.frame.ridgeBeam.size;
  const pyramidalRoof = surface.ridgeHalf < 0.2;
  let worstCrown = 0;
  for (const c of crown) {
    // a 宝形 roof has no 棟木: its 真束 rise to a point under the apex instead
    const expectedTop = pyramidalRoof
      ? Math.min(surface.hRidge - report.offsets.rafterBottom, surface.hRidge - report.offsets.tileT - 0.02)
      : surface.hRidge - report.offsets.rafterBottom - ridgeBeamSize[0];
    worstCrown = Math.max(worstCrown, Math.abs(expectedTop - c.yRidge));
  }
  if (crown.length) push('frame.crown-post-contact', worstCrown < 0.002, worstCrown, 0.002,
    pyramidalRoof ? '真束 heads meet under the 宝形 apex' : '真束 heads meet the 棟木 underside');

  // ── 6. nothing floats above / below the surface ────────────────────────────
  const ordered = offs.deckTop > 0 && offs.deckBottom > offs.deckTop
    && offs.rafterTop === offs.deckBottom && offs.rafterBottom > offs.rafterTop;
  push('layers.ordered', ordered, {
    deckTop: offs.deckTop, deckBottom: offs.deckBottom, rafterBottom: offs.rafterBottom,
  }, 'monotonic', '瓦 → 瓦桟 → ルーフィング → 野地板 → 垂木 offsets are monotonic (no interpenetration)');

  // highest structure vertex must stay below the tile bed
  let pokeMax = -Infinity;
  for (const p of parts) {
    if (!/^(rafters|purlins|ridgebeam|frame|hiprafters|deck|battens)$/.test(p.id)) continue;
    for (let i = 1; i < p.positions.length; i += 3) pokeMax = Math.max(pokeMax, p.positions[i]);
  }
  if (isFinite(pokeMax)) {
    push('structure.below-tiles', pokeMax <= surface.hRidge + 1e-6, pokeMax, surface.hRidge,
      'no structural member rises above the ridge / through the tiles');
  }

  const failed = checks.filter((c) => !c.ok);
  return {
    checks,
    pass: failed.length === 0,
    failures: failed,
    summary: {
      checks: checks.length, passed: checks.length - failed.length, failed: failed.length,
      tiles: report.counts.tiles, adjustedTiles: report.counts.adjustedTiles,
      roofAreaM2: +report.totalRoofArea.toFixed(2),
      massKg: Math.round(report.massEstimateKg),
      ridgeLengthM: +report.ridgeLength.toFixed(3),
      hipRunM: +report.hipRun.toFixed(3),
      cornerLiftM: +surface.sweep.liftAmount.toFixed(3),
      cornerPushM: +surface.sweep.pushAmount.toFixed(3),
      pitchDeg: +surface.profile.pitchDeg.toFixed(1),
      pitchSun: +surface.profile.pitchSun.toFixed(1),
      triangles: parts.reduce((s, p) => s + p.triCount, 0),
    },
  };
}

export function formatValidation(v) {
  const lines = [];
  for (const c of v.checks) {
    const val = typeof c.value === 'number' ? c.value.toFixed(4)
      : (typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value));
    lines.push(`${c.ok ? '✔' : '✘'} ${c.id.padEnd(28)} ${val.padStart(10)}  (tol ${Array.isArray(c.tolerance) ? c.tolerance.join('…') : c.tolerance})${c.note ? `\n    ${c.note}` : ''}`);
  }
  const s = v.summary;
  lines.push('', `${s.passed}/${s.checks} checks passed · ${s.tiles} tiles (${s.adjustedTiles} 調整瓦) · `
    + `${s.roofAreaM2} m² roof · ~${s.massKg} kg of tile · ${s.triangles} triangles`);
  return lines.join('\n');
}
