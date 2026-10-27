/**
 * Centrelines for grass organs: a polyline with a transported frame, grown by
 * a turtle that pitches (about its own width axis), droops (about the
 * horizontal, i.e. under gravity) and yaws (about its normal).
 */

import { V3, UP, addScaled, anyPerpendicular, clone, cross, length, lengthSq, lerp, normalize, projectOnPlane, rotateAxis, sub } from '../core/math';

export interface Frame {
  pos: V3;
  dir: V3;
  /** Width axis of a blade / reference direction of a round organ. Perpendicular to `dir`. */
  right: V3;
  /** cross(dir, right): the adaxial (upper-face) normal of a blade. */
  up: V3;
}

const frame = (pos: V3, dir: V3, right: V3): Frame => ({ pos, dir, right, up: cross(dir, right) });

export class Line {
  readonly pts: V3[] = [];
  readonly dirs: V3[] = [];
  readonly rights: V3[] = [];
  readonly ss: number[] = [];

  get length(): number {
    return this.ss.length ? this.ss[this.ss.length - 1] : 0;
  }

  push(p: V3, d: V3, r: V3): void {
    const n = this.pts.length;
    this.ss.push(n === 0 ? 0 : this.ss[n - 1] + length(sub(p, this.pts[n - 1])));
    this.pts.push(p);
    this.dirs.push(d);
    this.rights.push(r);
  }

  /** Frame at arc length `s` (clamped). */
  at(s: number): Frame {
    const n = this.pts.length;
    if (s <= 0 || n === 1) return frame(clone(this.pts[0]), clone(this.dirs[0]), clone(this.rights[0]));
    if (s >= this.length) return frame(clone(this.pts[n - 1]), clone(this.dirs[n - 1]), clone(this.rights[n - 1]));
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.ss[mid] <= s) lo = mid;
      else hi = mid;
    }
    const t = (s - this.ss[lo]) / Math.max(1e-12, this.ss[hi] - this.ss[lo]);
    const pos = lerp(this.pts[lo], this.pts[hi], t);
    const dir = normalize(lerp(this.dirs[lo], this.dirs[hi], t));
    let right = projectOnPlane(lerp(this.rights[lo], this.rights[hi], t), dir);
    right = lengthSq(right) < 1e-12 ? anyPerpendicular(dir) : normalize(right);
    return frame(pos, dir, right);
  }
}

export interface Turn {
  /** Rotation about the width axis, radians; positive bends towards −up (a blade curling over). */
  pitch?: number;
  /** Rotation about the horizontal axis perpendicular to the heading, radians; positive droops under gravity. */
  gravity?: number;
  /** Rotation about the normal, radians (lateral waviness). */
  yaw?: number;
  /** Rotation of the width axis about the heading, radians (twist). */
  roll?: number;
}

/**
 * Grow a polyline of `steps` equal steps from `pos` along `dir`. `turn` is
 * asked for the rotation to apply over each step, given the normalised
 * positions of its start and end.
 */
export function growLine(pos: V3, dir: V3, right: V3, L: number, steps: number, turn: (t0: number, t1: number) => Turn): Line {
  const line = new Line();
  let p = clone(pos);
  let d = normalize(dir);
  let r = projectOnPlane(right, d);
  r = lengthSq(r) < 1e-12 ? anyPerpendicular(d) : normalize(r);
  line.push(p, d, r);
  const n = Math.max(1, Math.round(steps));
  const ds = L / n;
  for (let k = 0; k < n; k++) {
    const tr = turn(k / n, (k + 1) / n);
    if (tr.pitch) d = rotateAxis(d, r, tr.pitch);
    if (tr.gravity) {
      let h = cross(UP, d);
      h = lengthSq(h) < 1e-8 ? r : normalize(h);
      d = rotateAxis(d, h, tr.gravity);
      r = rotateAxis(r, h, tr.gravity);
    }
    if (tr.yaw) {
      const u = cross(d, r);
      d = rotateAxis(d, u, tr.yaw);
      r = rotateAxis(r, u, tr.yaw);
    }
    if (tr.roll) r = rotateAxis(r, d, tr.roll);
    d = normalize(d);
    r = projectOnPlane(r, d);
    r = lengthSq(r) < 1e-12 ? anyPerpendicular(d) : normalize(r);
    p = addScaled(p, d, ds);
    line.push(p, d, r);
  }
  return line;
}

/**
 * Smooth polyline through control points (centripetal Catmull-Rom), `samples`
 * points per segment, with `right0` transported along it. Used for organs
 * whose path is designed in space rather than grown by the turtle: vines
 * following the ground, head leaves wrapping a sphere, arching fruit stalks.
 */
export function lineThrough(pts: V3[], right0: V3, samples = 6): Line {
  const line = new Line();
  const n = pts.length;
  if (n === 0) return line;
  if (n === 1) {
    line.push(clone(pts[0]), { x: 0, y: 1, z: 0 }, normalize(right0));
    return line;
  }
  const P = (i: number): V3 => pts[Math.max(0, Math.min(n - 1, i))];
  const sample: V3[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const alpha = 0.5;
    const t0 = 0;
    const t1 = t0 + Math.pow(Math.max(1e-6, length(sub(p1, p0))), alpha);
    const t2 = t1 + Math.pow(Math.max(1e-6, length(sub(p2, p1))), alpha);
    const t3 = t2 + Math.pow(Math.max(1e-6, length(sub(p3, p2))), alpha);
    const m = Math.max(1, Math.round(samples));
    for (let k = 0; k < m; k++) {
      const t = t1 + ((t2 - t1) * k) / m;
      const A1 = lerp(p0, p1, (t - t0) / (t1 - t0));
      const A2 = lerp(p1, p2, (t - t1) / (t2 - t1));
      const A3 = lerp(p2, p3, (t - t2) / (t3 - t2));
      const B1 = lerp(A1, A2, (t - t0) / (t2 - t0));
      const B2 = lerp(A2, A3, (t - t1) / (t3 - t1));
      sample.push(lerp(B1, B2, (t - t1) / (t2 - t1)));
    }
  }
  sample.push(clone(pts[n - 1]));
  // Directions by central differences, frame by transport.
  let r = normalize(right0);
  for (let i = 0; i < sample.length; i++) {
    const a = sample[Math.max(0, i - 1)];
    const b = sample[Math.min(sample.length - 1, i + 1)];
    let d = sub(b, a);
    d = lengthSq(d) < 1e-16 ? (i > 0 ? line.dirs[i - 1] : { x: 0, y: 1, z: 0 }) : normalize(d);
    let rr = projectOnPlane(r, d);
    rr = lengthSq(rr) < 1e-12 ? anyPerpendicular(d) : normalize(rr);
    r = rr;
    line.push(sample[i], d, rr);
  }
  return line;
}
