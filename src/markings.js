// ---------------------------------------------------------------------------
// markings.js — road markings: centre / edge / lane lines, plus zebra
// crosswalks and stop bars on junction approaches. Thin decal strips float
// just above the wearing surface. Everything is built from the span's own
// station frames, so markings stop exactly at junction trims and never
// overrun into the junction interior.
// ---------------------------------------------------------------------------

import { vAdd, vScale, clamp } from './math.js';
import { COL } from './details.js';

const patch = (name, grid, fill_color, alpha = 1) => ({ name, grid, fill_color, alpha, decal: true });

const LIFT = 0.02;

/** Dashed runs along an offset from the centreline. */
function dashedRuns(frames, offset, width, lift, dash, gap, phase = 0) {
  const runs = [];
  let cur = null;
  const period = dash + gap;
  for (const f of frames) {
    const t = ((f.s + phase) % period + period) % period;
    const inside = t < dash;
    if (inside) {
      const c = vAdd(f.center, vScale(f.normal, offset));
      const hw = width / 2;
      const l = vAdd(c, vScale(f.normal, hw)); l[2] += lift;
      const r = vAdd(c, vScale(f.normal, -hw)); r[2] += lift;
      if (!cur) { cur = { left: [], right: [] }; runs.push(cur); }
      cur.left.push(l);
      cur.right.push(r);
    } else {
      cur = null;
    }
  }
  return runs.filter((r) => r.left.length >= 2);
}

function solidStrip(frames, offset, width, lift) {
  if (frames.length < 2) return null;
  const hw = width / 2;
  const left = [];
  const right = [];
  for (const f of frames) {
    const c = vAdd(f.center, vScale(f.normal, offset));
    const l = vAdd(c, vScale(f.normal, hw)); l[2] += lift;
    const r = vAdd(c, vScale(f.normal, -hw)); r[2] += lift;
    left.push(l);
    right.push(r);
  }
  return { left, right };
}

/** Zebra crosswalk across the road surface within [s0, s1] arc window. */
function crosswalk(frames, halfW, s0, s1, lift) {
  const out = [];
  if (halfW < 1.2) return out;
  const stripe = 0.45;
  const period = 0.9;
  let next = s0 + period / 2;
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].s < s0) i++;
  for (; i < frames.length - 1 && frames[i].s < s1; i++) {
    const f0 = frames[i];
    const f1 = frames[i + 1];
    const span = f1.s - f0.s;
    if (span <= 1e-6) continue;
    while (next <= f1.s + 1e-6) {
      const a = clamp((next - stripe / 2 - f0.s) / span, 0, 1);
      const b = clamp((next + stripe / 2 - f0.s) / span, 0, 1);
      if (b > a + 1e-4) {
        const lerpF = (f, g, t) => ({
          center: [
            f.center[0] + (g.center[0] - f.center[0]) * t,
            f.center[1] + (g.center[1] - f.center[1]) * t,
            f.center[2] + (g.center[2] - f.center[2]) * t,
          ],
          normal: f.normal,
        });
        const g0 = lerpF(f0, f1, a);
        const g1 = lerpF(f0, f1, b);
        const mk = (fr, off) => {
          const c = vAdd(fr.center, vScale(fr.normal, off));
          c[2] += lift;
          return c;
        };
        out.push(patch('Crosswalk stripe', [
          [mk(g0, -halfW + 0.25), mk(g1, -halfW + 0.25)],
          [mk(g0, halfW - 0.25), mk(g1, halfW - 0.25)],
        ], COL.markingWhite));
      }
      next += period;
    }
  }
  return out;
}

/** Stop bar: solid white bar across the carriageway at arc position s. */
function stopBar(frames, halfW, s, lift) {
  if (halfW < 1.2) return null;
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].s < s) i++;
  const f0 = frames[i];
  const f1 = frames[Math.min(frames.length - 1, i + 1)];
  const span = f1.s - f0.s;
  const a = clamp((s - 0.25 - f0.s) / Math.max(1e-6, span), 0, 1);
  const b = clamp((s + 0.25 - f0.s) / Math.max(1e-6, span), 0, 1);
  if (b <= a + 1e-4) return null;
  const lerpF = (t) => ({
    center: [
      f0.center[0] + (f1.center[0] - f0.center[0]) * t,
      f0.center[1] + (f1.center[1] - f0.center[1]) * t,
      f0.center[2] + (f1.center[2] - f0.center[2]) * t,
    ],
    normal: f0.normal,
  });
  const g0 = lerpF(a);
  const g1 = lerpF(b);
  const mk = (fr, off) => {
    const c = vAdd(fr.center, vScale(fr.normal, off));
    c[2] += lift;
    return c;
  };
  return patch('Stop bar', [
    [mk(g0, -halfW + 0.3), mk(g1, -halfW + 0.3)],
    [mk(g0, halfW - 0.3), mk(g1, halfW - 0.3)],
  ], COL.markingWhite);
}

/**
 * @param lines  CrossLines (frames + halfW)
 * @param cross  CrossSection (markings toggles, lanes)
 * @param opt    { junctionAtStart, junctionAtEnd, crosswalkSetback }
 *               junctionAt* mark span ends that flow into a junction —
 *               crosswalks/stop bars are placed on that approach.
 */
export function buildMarkings(lines, cross, opt = {}) {
  const out = [];
  const m = cross.markings || {};
  const halfW = lines.halfW;
  const frames = lines.frames;
  const total = frames.length > 1 ? frames[frames.length - 1].s : 0;
  const setback = opt.crosswalkSetback ?? 7;

  if (m.centerLine && halfW > 1.2) {
    for (const run of dashedRuns(frames, 0, 0.15, LIFT, 3, 6)) {
      out.push(patch('Center line', [run.left, run.right], COL.markingAmber));
    }
  }
  if (m.edgeLines && halfW > 1.6) {
    const off = halfW - 0.45;
    const l = solidStrip(frames, off, 0.12, LIFT);
    const r = solidStrip(frames, -off, 0.12, LIFT);
    if (l) out.push(patch('Edge line L', [l.left, l.right], COL.markingWhite));
    if (r) out.push(patch('Edge line R', [r.left, r.right], COL.markingWhite));
  }
  if (m.laneLines && cross.lanes > 1) {
    for (let k = 1; k < cross.lanes; k++) {
      const off = -halfW + (2 * halfW * k) / cross.lanes;
      if (Math.abs(off) < 0.05 && m.centerLine) continue;
      for (const run of dashedRuns(frames, off, 0.12, LIFT, 3, 4.5, k * 1.7)) {
        out.push(patch('Lane line', [run.left, run.right], COL.markingWhite));
      }
    }
  }

  // junction approaches: zebra crosswalk + optional stop bar
  if (m.crosswalks) {
    if (opt.junctionAtEnd && total > setback + 1) {
      out.push(...crosswalk(frames, halfW, total - setback, total - 1.2, LIFT));
    }
    if (opt.junctionAtStart && total > setback + 1) {
      out.push(...crosswalk(frames, halfW, 1.2, setback, LIFT));
    }
  }
  if (m.stopBars) {
    if (opt.junctionAtEnd && total > setback + 2) {
      const sb = stopBar(frames, halfW, total - setback - 1.5, LIFT);
      if (sb) out.push(sb);
    }
    if (opt.junctionAtStart && total > setback + 2) {
      const sb = stopBar(frames, halfW, setback + 1.5, LIFT);
      if (sb) out.push(sb);
    }
  }
  return out;
}
