import {
  add,
  sub,
  mul,
  normalizeXZ,
  crossXZ,
  dotXZ,
  clamp,
  distanceXZ,
  cubic,
  derivative,
  type V3,
} from "./math";
import { geometryProfiles, type GeometryDetail } from "./quality";

export interface CornerPath {
  points: V3[];
  /** Exact planar right normals, not curvature inferred from a resampled polyline. */
  normals: V3[];
  insetLimits: number[];
  radius: number;
  fractions: number[];
}
export const effectiveCornerRadius = (
  requested: number,
  widths: { sw: number; cw: number }[],
) => Math.max(requested, ...widths.map((f) => f.sw + f.cw + 0.75));
const right = (d: V3): V3 => [d[2], 0, -d[0]];
/** Sample the analytic line/arc/line construction at equal PLAN distance.
 * Offsetting the old resampled chords made its curvature clamp alternate at
 * each sample and produced the saw-tooth footway wall in wide, raised corners.
 */
export function cornerPath(
  a: V3,
  da: V3,
  b: V3,
  db: V3,
  requested: number,
  detail: GeometryDetail = "editing",
): CornerPath {
  const profile = geometryProfiles[detail],
    towardA = mul(da, -1),
    towardB = mul(db, -1),
    det = crossXZ(towardA, towardB);
  if (Math.abs(det) > 1e-5) {
    const delta = sub(b, a),
      ta = crossXZ(delta, towardB) / det,
      tb = crossXZ(delta, towardA) / det,
      theta = Math.acos(clamp(dotXZ(da, db), -1, 1));
    if (ta > 0.05 && tb > 0.05 && theta > 0.03 && theta < Math.PI - 0.03) {
      const vertex = add(a, mul(towardA, ta)),
        half = theta / 2,
        r = Math.min(requested, Math.min(ta, tb) * 0.97 * Math.tan(half)),
        tangent = r / Math.tan(half),
        p = add(vertex, mul(da, tangent)),
        q = add(vertex, mul(db, tangent)),
        center = add(vertex, mul(normalizeXZ(add(da, db)), r / Math.sin(half))),
        angle = Math.atan2(p[2] - center[2], p[0] - center[0]);
      let sweep = Math.atan2(q[2] - center[2], q[0] - center[0]) - angle;
      while (sweep > Math.PI) sweep -= Math.PI * 2;
      while (sweep < -Math.PI) sweep += Math.PI * 2;
      const la = distanceXZ(a, p),
        arc = Math.abs(sweep) * r,
        lb = distanceXZ(q, b),
        total = la + arc + lb,
        // Sample the fillet itself, not just the long mouth-to-mouth path.
        // Exact tangent knots + a tip knot stop acute splitters becoming a
        // three-chord chamfer when the straight returns consume the samples.
        arcSegments = Math.min(
          2 * Math.floor((profile.maxCornerPoints - 5) / 4),
          Math.max(
            8,
            Math.ceil(
              Math.max(
                arc / (detail === "production" ? 0.18 : 0.45),
                Math.abs(sweep) /
                  (detail === "production" ? Math.PI / 90 : Math.PI / 36),
              ) / 2,
            ) * 2,
          ),
        ),
        lineSegments = Math.min(
          profile.maxCornerPoints - arcSegments - 1,
          Math.max(
            profile.minCornerPoints - arcSegments - 1,
            2,
            Math.ceil((la + lb) / profile.cornerSegment),
          ),
        ),
        aSegments =
          la < 1e-8
            ? 0
            : Math.max(
                1,
                Math.floor((lineSegments * la) / Math.max(1e-9, la + lb)),
              ),
        bSegments = lb < 1e-8 ? 0 : Math.max(1, lineSegments - aSegments),
        samples = [
          0,
          ...Array.from(
            { length: aSegments },
            (_, i) => (la * (i + 1)) / Math.max(1, aSegments),
          ),
          ...Array.from(
            { length: arcSegments },
            (_, i) => la + (arc * (i + 1)) / arcSegments,
          ),
          ...Array.from(
            { length: bSegments },
            (_, i) => la + arc + (lb * (i + 1)) / Math.max(1, bSegments),
          ),
        ],
        count = samples.length,
        fractions = samples.map((s) => s / Math.max(1e-8, total)),
        points: V3[] = [],
        normals: V3[] = [],
        limits: number[] = [];
      for (let i = 0; i < count; i++) {
        const s = samples[i],
          t = fractions[i];
        let point: V3,
          d: V3,
          limit = Infinity;
        if (s < la && la > 1e-9) {
          point = add(a, mul(towardA, s));
          d = towardA;
        } else if (s <= la + arc && arc > 1e-9) {
          const u = clamp((s - la) / arc, 0, 1),
            v = angle + sweep * u;
          point = [center[0] + Math.cos(v) * r, 0, center[2] + Math.sin(v) * r];
          d = [
            -Math.sin(v) * Math.sign(sweep),
            0,
            Math.cos(v) * Math.sign(sweep),
          ];
          if (sweep < 0) limit = Math.max(0.05, r - 0.35);
        } else {
          point = add(q, mul(db, Math.max(0, s - la - arc)));
          d = db;
        }
        point[1] = a[1] + (b[1] - a[1]) * t;
        points.push(point);
        normals.push(right(d));
        limits.push(limit);
      }
      points[0] = a;
      points[count - 1] = b;
      normals[0] = right(towardA);
      normals[count - 1] = right(db);
      return { points, normals, insetLimits: limits, radius: r, fractions };
    }
  }
  const length = distanceXZ(a, b),
    h = Math.min(length * 0.34, Math.max(1, requested)),
    ctrl = [a, add(a, mul(da, -h)), add(b, mul(db, -h)), b],
    count = Math.min(
      profile.maxCornerPoints,
      Math.max(
        profile.minCornerPoints,
        Math.ceil((length + h * 2) / profile.cornerSegment) + 1,
      ),
    ),
    points: V3[] = [],
    normals: V3[] = [],
    limits: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1),
      u = 1 - t,
      d = derivative(ctrl, t),
      dd = add(
        mul(add(sub(ctrl[2], mul(ctrl[1], 2)), ctrl[0]), 6 * u),
        mul(add(sub(ctrl[3], mul(ctrl[2], 2)), ctrl[1]), 6 * t),
      ),
      speed = Math.hypot(d[0], d[2]),
      turn = crossXZ(d, dd),
      radius = Math.abs(turn) > 1e-9 ? speed ** 3 / Math.abs(turn) : Infinity;
    points.push(cubic(ctrl, t));
    normals.push(right(normalizeXZ(d)));
    limits.push(turn < 0 ? Math.max(0.05, radius - 0.35) : Infinity);
  }
  points[0] = a;
  points[count - 1] = b;
  normals[0] = right(towardA);
  normals[count - 1] = right(db);
  return {
    points,
    normals,
    insetLimits: limits,
    radius: 0,
    fractions: points.map((_, i) => i / (count - 1)),
  };
}
/** Continuous width envelope; no alternating per-chord radius estimates. */
export function offsetCornerPath(
  path: CornerPath,
  start: V3,
  end: V3,
  widthA: number,
  widthB: number,
): V3[] {
  const count = path.points.length,
    desired = path.points.map(
      (_, i) => widthA + (widthB - widthA) * path.fractions[i],
    ),
    widths = desired.map((w, i) =>
      w >= 0 ? Math.min(w, path.insetLimits[i]) : w,
    );
  for (let i = 1; i < count; i++)
    if (desired[i] >= 0)
      widths[i] = Math.min(
        widths[i],
        widths[i - 1] + distanceXZ(path.points[i], path.points[i - 1]) * 0.65,
      );
  for (let i = count - 2; i >= 0; i--)
    if (desired[i] >= 0)
      widths[i] = Math.min(
        widths[i],
        widths[i + 1] + distanceXZ(path.points[i], path.points[i + 1]) * 0.65,
      );
  const points = path.points.map((p, i) => {
    const t = path.fractions[i],
      rise =
        (start[1] - path.points[0][1]) * (1 - t) +
        (end[1] - path.points[count - 1][1]) * t;
    return add(p, add(mul(path.normals[i], widths[i]), [0, rise, 0]));
  });
  points[0] = start;
  points[count - 1] = end;
  return points;
}
