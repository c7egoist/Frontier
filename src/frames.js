// ---------------------------------------------------------------------------
// frames.js — station frames + cross-section offset lines.
//
// Station frames resample a dense centerline adaptively (more stations on
// curves) and measure the signed curvature radius at every station. Offset
// lines are clamped to the curvature limit so pavement/curbs can never invert
// on tight radii — the classic parallel-curve pinch is impossible by
// construction, and the clamp is smoothed along the alignment.
//
// Cross-section lines (per station): road edges, gutter (drainage channel),
// curb tops, pavement edges and the superstructure bottom. With a gutter the
// carriageway edge is pulled in and a sloped channel drops to the curb base.
// ---------------------------------------------------------------------------

import {
  vSub, vLen, vNorm, vAdd, vScale, vLerp, clamp,
  arcLengths, pointAtArc, planAngle,
} from './math.js';

const MAX_TURN_DEG = 4.5;
const MIN_STEP = 0.3;
const MAX_STATIONS = 1400;
const CURVE_SAFETY = 0.9;

/** Adaptive index refinement of a dense polyline -> station parameters. */
function adaptiveParams(points) {
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1, 0]];
  while (stack.length > 0) {
    const [i0, i1, depth] = stack.pop();
    if (i1 - i0 < 2 || depth > 8) {
      if (i1 - i0 > 24) {
        const mid = (i0 + i1) >> 1;
        keep.add(mid);
        stack.push([i0, mid, depth + 1]);
        stack.push([mid, i1, depth + 1]);
      } else {
        keep.add(i0);
        keep.add(i1);
      }
      continue;
    }
    const mid = (i0 + i1) >> 1;
    const d0 = vSub(points[mid], points[i0]);
    const d1 = vSub(points[i1], points[mid]);
    const turn = Math.abs(planAngle(d0, d1));
    const longest = Math.max(vLen(d0), vLen(d1));
    if ((turn > (MAX_TURN_DEG * Math.PI) / 180 && longest > MIN_STEP) || longest > 14) {
      keep.add(mid);
      stack.push([i0, mid, depth + 1]);
      stack.push([mid, i1, depth + 1]);
    } else {
      keep.add(i0);
      keep.add(i1);
      if (i1 - i0 > 24) {
        keep.add(mid);
        stack.push([i0, mid, depth + 1]);
        stack.push([mid, i1, depth + 1]);
      }
    }
  }
  const idx = [...keep].sort((a, b) => a - b);
  return idx.map((i) => i / (points.length - 1));
}

function sampleDense(points, lengths, total, t) {
  return pointAtArc(points, lengths, clamp(t, 0, 1) * total);
}

/**
 * Build station frames over a dense road-space centerline.
 * Frame: { center, tangent, normal, s, rho, maxLeft, maxRight }.
 */
export function buildFrames(dense) {
  if (dense.length < 2) return [];
  const lengths = arcLengths(dense);
  const total = lengths[lengths.length - 1];
  if (total < 1e-6) return [];

  let params = adaptiveParams(dense);
  if (params.length > MAX_STATIONS) {
    const stride = (params.length - 1) / (MAX_STATIONS - 1);
    params = Array.from({ length: MAX_STATIONS }, (_, i) => params[Math.round(i * stride)]);
  }
  const centers = params.map((t) => sampleDense(dense, lengths, total, t));
  const n = centers.length;

  const tangents = [];
  for (let i = 0; i < n; i++) {
    const a = centers[Math.max(0, i - 1)];
    const b = centers[Math.min(n - 1, i + 1)];
    tangents.push(vNorm(vSub(b, a)));
  }
  const normals = tangents.map((t) => {
    const flat = [-t[1], t[0], 0];
    return vLen(flat) < 1e-6 ? [1, 0, 0] : vNorm(flat);
  });

  const sArr = arcLengths(centers);
  const frames = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    const turn = planAngle(tangents[i0], tangents[i1]);
    const ds = Math.max(1e-6, sArr[i1] - sArr[i0]);
    const kappa = turn / ds; // + = turning left
    const rho = Math.abs(kappa) < 1e-7 ? Infinity : 1 / kappa;
    frames.push({ center: centers[i], tangent: tangents[i], normal: normals[i], s: sArr[i], rho, maxLeft: 1e9, maxRight: 1e9 });
  }

  // clamp limits from curvature radius (parallel-curve inversion guard)
  for (const f of frames) {
    if (Number.isFinite(f.rho)) {
      if (f.rho > 0) f.maxLeft = Math.max(0.4, f.rho * CURVE_SAFETY);
      else f.maxRight = Math.max(0.4, -f.rho * CURVE_SAFETY);
    }
  }
  // smooth the limits along the alignment so width eases in/out of curves
  const smooth = (pick, set) => {
    const w = 4;
    const vals = frames.map(pick);
    for (let i = 0; i < n; i++) {
      let a = 0;
      let c = 0;
      for (let k = -w; k <= w; k++) {
        const j = clamp(i + k, 0, n - 1);
        a += vals[j];
        c++;
      }
      set(frames[i], a / c);
    }
  };
  smooth((f) => f.maxLeft, (f, v) => { f.maxLeft = v; });
  smooth((f) => f.maxRight, (f, v) => { f.maxRight = v; });
  return frames;
}

/** Append a copy of the first frame at the end so closed loops wrap exactly. */
export function closeFrames(frames) {
  if (frames.length < 3) return frames;
  const first = frames[0];
  const last = frames[frames.length - 1];
  const closing = vLen(vSub(first.center, last.center));
  return [...frames, { ...first, s: last.s + closing }];
}

// ---------------------------------------------------------------------------
// Cross-section offset lines
// ---------------------------------------------------------------------------

export function computeCrossLines(frames, cross, drainage, opt) {
  const n = frames.length;
  const halfW = Math.max(0.5, cross.width / 2);
  const gutOn = !!(drainage && drainage.enabled && drainage.gutter);
  const gutterW = gutOn ? clamp(drainage.gutterWidth ?? 0.45, 0.1, Math.max(0.1, halfW - 0.4)) : 0;
  const gutterDrop = gutOn ? Math.max(0.01, drainage.gutterDepth ?? 0.05) : 0;
  const batter = Math.min(0.04, Math.max(0.015, cross.curbHeight * 0.2));
  const depth = opt.depth;
  const inset = opt.inset;

  const center = [];
  const roadL = [];
  const roadR = [];
  const gutOutL = [];
  const gutOutR = [];
  const curbTopL = [];
  const curbTopR = [];
  const paveL = [];
  const paveR = [];
  const botL = [];
  const botR = [];

  // carriageway half width (gutter eats into the outer strip)
  const roadHalf = gutOn ? Math.max(0.4, halfW - gutterW) : halfW;

  for (let i = 0; i < n; i++) {
    const f = frames[i];
    center.push(f.center);
    // road edges, clamped to the curvature limit (never invert)
    const oRoadL = Math.min(roadHalf, Math.max(0.25, f.maxLeft));
    const oRoadR = Math.min(roadHalf, Math.max(0.25, f.maxRight));
    const rL = vAdd(f.center, vScale(f.normal, oRoadL));
    const rR = vAdd(f.center, vScale(f.normal, -oRoadR));
    roadL.push(rL);
    roadR.push(rR);
    if (gutOn) {
      // gutter outer edge: at the nominal carriageway edge, dropped to the
      // curb base — the channel the grates sit in
      const goL = vAdd(f.center, vScale(f.normal, Math.min(halfW, Math.max(oRoadL + gutterW, f.maxLeft))));
      goL[2] -= gutterDrop;
      const goR = vAdd(f.center, vScale(f.normal, -Math.min(halfW, Math.max(oRoadR + gutterW, f.maxRight))));
      goR[2] -= gutterDrop;
      gutOutL.push(goL);
      gutOutR.push(goR);
    } else {
      gutOutL.push(rL);
      gutOutR.push(rR);
    }
    // curb top: raised + battered slightly inward, seated on the gutter base
    const ctL = vAdd(gutOutL[i], vScale(f.normal, -batter));
    ctL[2] += cross.curbHeight + (gutOn ? gutterDrop : 0);
    const ctR = vAdd(gutOutR[i], vScale(f.normal, batter));
    ctR[2] += cross.curbHeight + (gutOn ? gutterDrop : 0);
    curbTopL.push(ctL);
    curbTopR.push(ctR);
    // pavement outer edge: clamped, never narrower than the curb + a sliver,
    // with crossfall dropping away from the carriageway
    const reqL = halfW + Math.max(0, cross.paveLeft);
    const reqR = halfW + Math.max(0, cross.paveRight);
    const oPaveL = Math.min(reqL, Math.max(f.maxLeft, (gutOn ? halfW : oRoadL) + 0.03));
    const oPaveR = Math.min(reqR, Math.max(f.maxRight, (gutOn ? halfW : oRoadR) + 0.03));
    const pL = vAdd(f.center, vScale(f.normal, oPaveL));
    pL[2] += cross.curbHeight - Math.max(0, oPaveL - halfW) * cross.crossfall;
    const pR = vAdd(f.center, vScale(f.normal, -oPaveR));
    pR[2] += cross.curbHeight - Math.max(0, oPaveR - halfW) * cross.crossfall;
    paveL.push(pL);
    paveR.push(pR);
    // superstructure bottom (inset from the pavement edge)
    const oBotL = Math.max(oRoadL * 0.5, oPaveL - inset);
    const oBotR = Math.max(oRoadR * 0.5, oPaveR - inset);
    const bL = vAdd(f.center, vScale(f.normal, oBotL));
    bL[2] -= depth;
    const bR = vAdd(f.center, vScale(f.normal, -oBotR));
    bR[2] -= depth;
    botL.push(bL);
    botR.push(bR);
  }
  return {
    frames, center, roadL, roadR, gutOutL, gutOutR, curbTopL, curbTopR,
    paveL, paveR, botL, botR, halfW, roadHalf, gutterW, gutterDrop, gutter: gutOn,
  };
}
