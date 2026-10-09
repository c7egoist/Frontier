// ---------------------------------------------------------------------------
// junction.js — merged N-way junction geometry.
//
// The junction is generated FROM the trimmed approach frames of the adjoining
// runs, so every boundary curve is shared exactly with a span end: watertight
// by construction. Corners are true tangent-continuous arc fillets; curb and
// pavement corner layers are offsets of the same road fillet with pinned
// endpoints; the interior is a Coons blend to the junction centre; the tub
// (side walls + bottom membrane) hangs below with edges pinned to the span
// bottom corners.
// ---------------------------------------------------------------------------

import {
  vSub, vAdd, vScale, vLerp, vLen, clamp, leftNormal,
  resampleLine, coonsBlend,
} from './math.js';
import { buildGuardRail, COL } from './details.js';

/** True circular fillet arc between two road-edge points with arrival
 *  tangents. Returns [P1, ...arc..., P2] (endpoints included). */
export function filletBetweenEdges(p1, t1, p2, t2, radius, steps = 10) {
  const straight = () => [[...p1], [...p2]];
  let dax = t1[0]; let day = t1[1];
  let dbx = t2[0]; let dby = t2[1];
  const la = Math.hypot(dax, day);
  const lb = Math.hypot(dbx, dby);
  if (la < 1e-3 || lb < 1e-3) return straight();
  dax /= la; day /= la; dbx /= lb; dby /= lb;

  // intersect the OUTWARD rays (reversed arrival tangents) -> sharp corner V
  const denom = dax * dby - day * dbx;
  if (Math.abs(denom) < 1e-3) return straight();
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const t = (dx * dby - dy * dbx) / denom;
  const vx = p1[0] + dax * t;
  const vy = p1[1] + day * t;
  if ((vx - p1[0]) * dax + (vy - p1[1]) * day < -0.05) return straight();
  if ((vx - p2[0]) * dbx + (vy - p2[1]) * dby < -0.05) return straight();

  // tangent points: from V back toward the trim points
  const vax = -dax; const vay = -day;
  const vbx = -dbx; const vby = -dby;
  const daDist = Math.hypot(p1[0] - vx, p1[1] - vy);
  const dbDist = Math.hypot(p2[0] - vx, p2[1] - vy);
  const cosTheta = clamp(vax * vbx + vay * vby, -1, 1);
  const theta = Math.acos(cosTheta);
  if (theta < 0.02 || theta > Math.PI - 0.02) return straight();
  const alpha = theta * 0.5;
  const tanA = Math.tan(alpha);
  const sinA = Math.sin(alpha);
  if (tanA < 1e-3 || sinA < 1e-3) return straight();

  let T = radius / tanA;
  const tMax = Math.min(Math.max(daDist, 0), Math.max(dbDist, 0)) * 0.95;
  let r = radius;
  if (T > tMax) {
    T = tMax;
    r = T * tanA;
  }
  const tpx = vx + vax * T; const tpy = vy + vay * T;
  const tqx = vx + vbx * T; const tqy = vy + vby * T;

  let bdx = vax + vbx; let bdy = vay + vby;
  const bl = Math.hypot(bdx, bdy);
  if (bl < 1e-3) return straight();
  bdx /= bl; bdy /= bl;
  const cx = vx + bdx * (r / sinA);
  const cy = vy + bdy * (r / sinA);

  const aStart = Math.atan2(tpy - cy, tpx - cx);
  const aEnd = Math.atan2(tqy - cy, tqx - cx);
  let delta = aEnd - aStart;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const out = [[...p1]];
  for (let i = 0; i <= steps; i++) {
    const f = steps === 0 ? 0 : i / steps;
    const a = aStart + delta * f;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, p1[2] + (p2[2] - p1[2]) * f]);
  }
  out.push([...p2]);
  return out;
}

/**
 * Offset a base curve toward start/end targets, interpolating width and Z,
 * with endpoints pinned EXACTLY to the targets (the merge guarantee).
 */
export function offsetCurveFromTargets(base, startTarget, endTarget) {
  if (base.length === 0) return [];
  if (base.length === 1) return [[...startTarget]];
  const startDelta = vSub(startTarget, base[0]);
  const endDelta = vSub(endTarget, base[base.length - 1]);
  const tangentAt = (i) => {
    const a = base[Math.max(0, i - 1)];
    const b = base[Math.min(base.length - 1, i + 1)];
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l <= 1e-3) return [1, 0];
    return [dx / l, dy / l];
  };
  // pick the normal sign that agrees with the targets
  const t0 = tangentAt(0);
  const tn = tangentAt(base.length - 1);
  const n0 = [-t0[1], t0[0]];
  const nn = [-tn[1], tn[0]];
  const pos = n0[0] * startDelta[0] + n0[1] * startDelta[1] + nn[0] * endDelta[0] + nn[1] * endDelta[1];
  const neg = -pos;
  const sign = pos >= neg ? 1 : -1;

  const total = base.length - 1;
  const startW = Math.hypot(startDelta[0], startDelta[1]);
  const endW = Math.hypot(endDelta[0], endDelta[1]);
  const out = [];
  for (let i = 0; i < base.length; i++) {
    const f = total === 0 ? 0 : i / total;
    const t = tangentAt(i);
    let nx = -t[1] * sign;
    let ny = t[0] * sign;
    const nl = Math.hypot(nx, ny);
    if (nl <= 1e-3) {
      nx = startW > 1e-3 ? startDelta[0] / startW : 0;
      ny = startW > 1e-3 ? startDelta[1] / startW : 1;
    } else {
      nx /= nl; ny /= nl;
    }
    const w = (1 - f) * startW + f * endW;
    const z = (1 - f) * startDelta[2] + f * endDelta[2];
    const p = base[i];
    out.push([p[0] + nx * w, p[1] + ny * w, p[2] + z]);
  }
  out[0] = [...startTarget];
  out[out.length - 1] = [...endTarget];
  return out;
}

/** Eased spoke from A to B (points cluster near B for A->centre). */
function easedSpoke(a, b, count, easeOut) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1);
    const e = easeOut ? 1 - Math.pow(1 - f, 1.5) : Math.pow(f, 1.5);
    out.push(vLerp(a, b, e));
  }
  return out;
}

/**
 * Merged junction — every boundary curve is shared exactly with a span end
 * (approach frames), so runs flow into the junction with no gaps or overlaps.
 *
 * legs: JunctionLeg[] { point, tangent (into junction), left, roadL/R,
 *   curbL/R, paveL/R, botL/R, angle, splineId, splineName, color }
 * o: { center, cornerRadius, filletSteps, depth, rails }
 */
export function buildMergedJunction(legs, o) {
  const out = [];
  if (legs.length < 2) return out;
  const sorted = [...legs].sort((a, b) => a.angle - b.angle);
  const N = sorted.length;
  const C = o.center;
  const depth = Math.max(0.3, o.depth);
  const drop = (p) => [p[0], p[1], p[2] - depth];
  const filletR = Math.max(o.cornerRadius * 0.6, 1.5);

  // 1. road fillets per corner + curb/pavement layers offset from the same
  //    fillet, endpoints pinned to the approach cross-sections
  const roadF = [];
  const curbF = [];
  const paveF = [];
  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];
    let f = filletBetweenEdges(cur.roadR, cur.tangent, nxt.roadL, nxt.tangent, filletR, o.filletSteps);
    f = resampleLine(f, Math.max(o.filletSteps, f.length - 1) + 1);
    roadF.push(f);
    const cf = offsetCurveFromTargets(f, cur.curbR, nxt.curbL);
    curbF.push(cf);
    paveF.push(offsetCurveFromTargets(cf, cur.paveR, nxt.paveL));
  }

  // 2. interior top — same asphalt as the roads so the joints disappear
  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];
    const f = roadF[i];
    const half = Math.floor((f.length - 1) / 2) + 1;
    const h1 = f.slice(0, half);
    const h2 = f.slice(half - 1);
    const s1 = Math.max(1, h1.length - 1);
    const s2 = Math.max(1, h2.length - 1);
    out.push({
      name: `Junction top ${i}a`,
      grid: coonsBlend([cur.point, cur.roadR], [C, h1[h1.length - 1]], easedSpoke(cur.point, C, s1 + 1, true), h1, 1, s1),
      fill_color: COL.road, alpha: 1,
    });
    out.push({
      name: `Junction top ${i}b`,
      grid: coonsBlend([C, h2[0]], [nxt.point, nxt.roadL], easedSpoke(C, nxt.point, s2 + 1, false), h2, 1, s2),
      fill_color: COL.road, alpha: 1,
    });
  }

  // 3. corner curb + pavement strips (shared fillet boundaries)
  for (let i = 0; i < N; i++) {
    out.push({ name: `Junction curb ${i}`, grid: [roadF[i], curbF[i]], fill_color: COL.curb, alpha: 1 });
    const mid = curbF[i].map((p, k) => vLerp(p, paveF[i][k], 0.5));
    out.push({ name: `Junction pavement ${i}`, grid: [curbF[i], mid, paveF[i]], fill_color: COL.pavement, alpha: 1 });
  }

  // 4. tub — side walls + bottom membrane, all edges shared with span ends.
  const Cd = drop(C);
  for (let i = 0; i < N; i++) {
    const cur = sorted[i];
    const nxt = sorted[(i + 1) % N];
    const base = paveF[i].map(drop);
    base[0] = [...cur.botR];
    base[base.length - 1] = [...nxt.botL];
    out.push({ name: `Junction side ${i}`, grid: [paveF[i], base], fill_color: COL.side, alpha: 1 });
    const half = Math.floor((base.length - 1) / 2) + 1;
    const b1 = base.slice(0, half);
    const b2 = base.slice(half - 1);
    const s1 = Math.max(1, b1.length - 1);
    const s2 = Math.max(1, b2.length - 1);
    const midCur = [
      (cur.botL[0] + cur.botR[0]) / 2,
      (cur.botL[1] + cur.botR[1]) / 2,
      (cur.botL[2] + cur.botR[2]) / 2,
    ];
    const midNxt = [
      (nxt.botL[0] + nxt.botR[0]) / 2,
      (nxt.botL[1] + nxt.botR[1]) / 2,
      (nxt.botL[2] + nxt.botR[2]) / 2,
    ];
    out.push({
      name: `Junction bottom ${i}a`,
      grid: coonsBlend([midCur, cur.botR], [Cd, b1[b1.length - 1]], easedSpoke(midCur, Cd, s1 + 1, true), b1, 1, s1),
      fill_color: COL.bottom, alpha: 1,
    });
    out.push({
      name: `Junction bottom ${i}b`,
      grid: coonsBlend([Cd, b2[0]], [midNxt, nxt.botL], easedSpoke(Cd, midNxt, s2 + 1, false), b2, 1, s2),
      fill_color: COL.bottom, alpha: 1,
    });
  }

  // 5. guardrails along the pavement fillets (posts embedded in the tub)
  if (o.rails && o.rails.enabled) {
    for (let i = 0; i < N; i++) {
      const curve = paveF[i];
      const normals = curve.map((_, k) => {
        const a = curve[Math.max(0, k - 1)];
        const b = curve[Math.min(curve.length - 1, k + 1)];
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        const l = Math.hypot(dx, dy);
        if (l < 1e-9) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
        return [-dy, dx, 0];
      });
      out.push(...buildGuardRail(curve, normals, true, o.rails, 0.6, 0.3, { terminals: false }));
    }
  }
  return out;
}

/** Build a JunctionLeg from a run's end station (road space). */
export function legFromRunEnd(run, atStart) {
  const st = atStart ? run.frames[0] : run.frames[run.frames.length - 1];
  const li = atStart ? 0 : run.lines.roadL.length - 1;
  const arrival = atStart ? vScale(st.tangent, -1) : st.tangent;
  const left = leftNormal(arrival);
  const L = run.lines;
  return {
    point: [...st.center],
    tangent: [...arrival],
    left: [...left],
    roadL: atStart ? [...L.roadR[li]] : [...L.roadL[li]],
    roadR: atStart ? [...L.roadL[li]] : [...L.roadR[li]],
    curbL: atStart ? [...L.curbTopR[li]] : [...L.curbTopL[li]],
    curbR: atStart ? [...L.curbTopL[li]] : [...L.curbTopR[li]],
    paveL: atStart ? [...L.paveR[li]] : [...L.paveL[li]],
    paveR: atStart ? [...L.paveL[li]] : [...L.paveR[li]],
    botL: atStart ? [...L.botR[li]] : [...L.botL[li]],
    botR: atStart ? [...L.botL[li]] : [...L.botR[li]],
    angle: Math.atan2(arrival[1], arrival[0]),
    splineId: run.spline.id,
    splineName: run.spline.name,
    color: run.spline.color,
  };
}
