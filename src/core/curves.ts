import type { GeometryProfile } from "./quality";
import {
  add,
  sub,
  cubic,
  derivative,
  normalizeXZ,
  normalXZ,
  distance,
  nearestSegment,
  lerp,
  clamp,
  splitCubic,
  type V3,
} from "./math";
import { controlPoints, type Project, type Road } from "./model";

export interface Station {
  p: V3;
  d: V3;
  n: V3;
  t: number;
  s: number;
}
export interface Alignment {
  road: Road;
  points: V3[];
  stations: Station[];
  length: number;
}
export function sampleAlignment(
  project: Project,
  road: Road,
  profile: Pick<GeometryProfile, "maxSegment" | "maxDeviation"> & {
    maxDepth?: number;
  } = { maxSegment: 2.8, maxDeviation: 0.045 },
): Alignment {
  const points = controlPoints(project, road);
  const sampled: { p: V3; t: number }[] = [{ p: points[0], t: 0 }];
  const subdivide = (p: V3[], ta: number, tb: number, depth: number) => {
    const chord = distance(p[0], p[3]);
    const flatness = Math.max(
      nearestSegment(p[1], p[0], p[3]).distance,
      nearestSegment(p[2], p[0], p[3]).distance,
    );
    if (
      depth >= (profile.maxDepth ?? 12) ||
      (chord <= profile.maxSegment && flatness <= profile.maxDeviation)
    )
      sampled.push({ p: p[3], t: tb });
    else {
      const [left, right] = splitCubic(p, 0.5),
        mid = (ta + tb) / 2;
      subdivide(left, ta, mid, depth + 1);
      subdivide(right, mid, tb, depth + 1);
    }
  };
  subdivide(points, 0, 1, 0);
  const unique = sampled.filter(
    (v, i) => i === 0 || distance(v.p, sampled[i - 1].p) > 1e-5,
  );
  if (unique.length === 1) unique.push({ p: points[3], t: 1 });
  let s = 0;
  const stations = unique.map((v, i) => {
    if (i) s += distance(v.p, unique[i - 1].p);
    let dir = derivative(points, v.t);
    if (Math.hypot(dir[0], dir[2]) < 1e-7)
      dir = sub(
        cubic(points, clamp(v.t + 0.001, 0, 1)),
        cubic(points, clamp(v.t - 0.001, 0, 1)),
      );
    const d = normalizeXZ(dir);
    return { ...v, d, n: normalXZ(d), s };
  });
  return { road, points, stations, length: s };
}
export function stationAt(a: Alignment, s: number): Station {
  s = clamp(s, 0, a.length);
  let lo = 0,
    hi = a.stations.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a.stations[mid].s < s) lo = mid;
    else hi = mid;
  }
  const left = a.stations[lo],
    right = a.stations[hi];
  const t =
    left.t +
    ((right.t - left.t) * (s - left.s)) / Math.max(1e-8, right.s - left.s);
  const p = cubic(a.points, t),
    d = normalizeXZ(derivative(a.points, t));
  return { p, d, n: normalXZ(d), s, t };
}
export function trimmedStations(
  a: Alignment,
  start: number,
  end: number,
): Station[] {
  const lo = clamp(start, 0, a.length),
    hi = clamp(a.length - end, lo, a.length);
  return [
    stationAt(a, lo),
    ...a.stations.filter((f) => f.s > lo + 1e-5 && f.s < hi - 1e-5),
    stationAt(a, hi),
  ];
}
export function closestOnAlignment(a: Alignment, point: V3) {
  let best = { distance: Infinity, t: 0, point: a.points[0], s: 0 };
  for (let i = 1; i < a.stations.length; i++) {
    const x = a.stations[i - 1],
      y = a.stations[i],
      near = nearestSegment(point, x.p, y.p);
    if (near.distance < best.distance) {
      const t = x.t + (y.t - x.t) * near.t;
      best = {
        distance: near.distance,
        t,
        point: cubic(a.points, t),
        s: x.s + (y.s - x.s) * near.t,
      };
    }
  }
  // Bounded ternary refinement makes curve snapping independent of tessellation.
  let lo = Math.max(0, best.t - 0.025),
    hi = Math.min(1, best.t + 0.025);
  for (let i = 0; i < 20; i++) {
    const ta = lo + (hi - lo) / 3,
      tb = hi - (hi - lo) / 3;
    if (
      nearestSegment(point, cubic(a.points, ta), cubic(a.points, ta)).distance <
      nearestSegment(point, cubic(a.points, tb), cubic(a.points, tb)).distance
    )
      hi = tb;
    else lo = ta;
  }
  best.t = (lo + hi) / 2;
  best.point = cubic(a.points, best.t);
  best.distance = Math.hypot(
    point[0] - best.point[0],
    point[2] - best.point[2],
  );
  return best;
}
export function offsetStation(f: Station, offset: number, elevation = 0): V3 {
  return add(f.p, [f.n[0] * offset, elevation, f.n[2] * offset]);
}
export function pointOnPolyline(points: V3[], t: number): V3 {
  const v = clamp(t, 0, 1) * (points.length - 1),
    i = Math.min(points.length - 2, Math.floor(v));
  return lerp(points[i], points[i + 1], v - i);
}
