import {
  geometryProfiles,
  normaliseDetail,
  type GeometryDetail,
} from "./quality";
import { siteOutline, insidePolygon } from "./sites";
import { parkingLayout, parkingPlan } from "./site-geometry";
import { buildSiteGeometry } from "./site-geometry";
import {
  buildRoadFurniture,
  buildMedian,
  buildParallelParking,
  buildJunctionMarkings,
  buildTrafficSignals,
} from "./road-details";
import earcut from "earcut";
import {
  add,
  sub,
  mul,
  lerp,
  normalizeXZ,
  normalXZ,
  dotXZ,
  crossXZ,
  clamp,
  distance,
  distanceXZ,
  segmentIntersection,
  resampleLine,
  simplePolygon,
  polygonArea,
  type V3,
} from "./math";
import { detectCrossings } from "./editing";
import {
  connected,
  getNode,
  validateGenerationBudget,
  roadHalfWidth,
  roadMaterial,
  type Project,
  type Road,
  type RoadNode,
} from "./model";
import {
  sampleAlignment,
  stationAt,
  trimmedStations,
  offsetStation,
  closestOnAlignment,
  type Alignment,
  type Station,
} from "./curves";

export type MeshKind =
  | "asphalt"
  | "paving"
  | "curb"
  | "marking"
  | "rail"
  | "structure"
  | "drain"
  | "gutter"
  | "sign"
  | "lamp"
  | "landscape"
  | "building"
  | "parking";
export interface MeshData {
  name: string;
  owner: string;
  ownerKind: "road" | "node" | "site";
  kind: MeshKind;
  material: string;
  positions: number[];
  indices: number[];
  uvs: number[];
}
export interface Frame extends Station {
  hw: number;
  sw: number;
  cw: number;
  crossfall: number;
  curbHeight: number;
}
export interface RoadSpan {
  road: Road;
  alignment: Alignment;
  frames: Frame[];
  startJoint: boolean;
  endJoint: boolean;
  length: number;
}
export interface Arm {
  road: Road;
  frame: Frame;
  d: V3;
  n: V3;
  angle: number;
  isStart: boolean;
  center: V3;
  left: V3;
  right: V3;
  outerLeft: V3;
  outerRight: V3;
}
export interface Junction {
  node: RoadNode;
  arms: Arm[];
  boundary: V3[];
  outer: V3[];
  corners: V3[][];
  type: string;
  valid: boolean;
}
export interface Diagnostic {
  level: "warning" | "error";
  message: string;
  owner: string;
}
export interface Network {
  spans: RoadSpan[];
  junctions: Junction[];
  meshes: MeshData[];
  diagnostics: Diagnostic[];
  length: number;
  triangles: number;
  vertices: number;
  inlets: number;
  bounds: { min: V3; max: V3 };
  maxGrade: number;
  clearances: { a: string; b: string; meters: number }[];
  parkingSpaces: number;
  detail: GeometryDetail;
}
const SURFACE = 0.12,
  CURB = 0.16;
export function edgePoint(
  f: Frame,
  side: number,
  part: "road" | "curbIn" | "curbOut" | "outer" | "bottom",
): V3 {
  const edgeHeight = surfaceHeight(f) - (f.hw * f.crossfall) / 100;
  const width =
    part === "road" || part === "curbIn"
      ? f.hw
      : part === "curbOut"
        ? f.hw + f.cw
        : f.hw + f.cw + f.sw;
  const height =
    part === "road"
      ? edgeHeight
      : part === "bottom"
        ? -0.48
        : edgeHeight + f.curbHeight - (part === "outer" ? f.sw * 0.01 : 0);
  return offsetStation(f, side * width, height);
}
export const surfaceHeight = (f: Frame) =>
  Math.max(SURFACE, 0.04 + (f.hw * f.crossfall) / 100);
export function surfacePoint(f: Frame, offset: number, extra = 0): V3 {
  return offsetStation(
    f,
    offset,
    surfaceHeight(f) - (Math.abs(offset) * f.crossfall) / 100 + extra,
  );
}
export class MeshBuilder {
  meshes = new Map<string, MeshData>();
  constructor(
    public owner: string,
    public ownerKind: "road" | "node" | "site",
  ) {}
  target(kind: MeshKind, material: string): MeshData {
    const key = `${kind}:${material}`;
    if (!this.meshes.has(key))
      this.meshes.set(key, {
        name: `${this.owner} ${kind}`,
        owner: this.owner,
        ownerKind: this.ownerKind,
        kind,
        material,
        positions: [],
        indices: [],
        uvs: [],
      });
    return this.meshes.get(key)!;
  }
  append(
    kind: MeshKind,
    material: string,
    points: V3[],
    indices: number[],
    upward?: boolean,
  ) {
    const mesh = this.target(kind, material),
      base = mesh.positions.length / 3;
    points.forEach((p) => {
      mesh.positions.push(...p);
      mesh.uvs.push(p[0], p[2]);
    });
    for (let i = 0; i < indices.length; i += 3) {
      let [a, b, c] = indices.slice(i, i + 3);
      const u = sub(points[b], points[a]),
        v = sub(points[c], points[a]);
      const nx = u[1] * v[2] - u[2] * v[1],
        ny = u[2] * v[0] - u[0] * v[2],
        nz = u[0] * v[1] - u[1] * v[0];
      if (Math.hypot(nx, ny, nz) < 1e-10) continue;
      if (upward !== undefined && (upward ? ny < 0 : ny > 0)) [b, c] = [c, b];
      mesh.indices.push(base + a, base + b, base + c);
    }
  }
  quad(kind: MeshKind, material: string, points: V3[], upward?: boolean) {
    this.append(kind, material, points, [0, 1, 2, 0, 2, 3], upward);
  }
  strip(kind: MeshKind, material: string, a: V3[], b: V3[], upward?: boolean) {
    const points = a.flatMap((p, i) => [p, b[i]]),
      indices: number[] = [];
    for (let i = 0; i < a.length - 1; i++) {
      const k = i * 2;
      indices.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
    const mesh = this.target(kind, material),
      uvStart = mesh.uvs.length;
    this.append(kind, material, points, indices, upward);
    if (material === "race-curb") {
      let arc = 0;
      for (let i = 0; i < a.length; i++) {
        if (i) arc += distance(a[i], a[i - 1]);
        mesh.uvs[uvStart + i * 4] = arc;
        mesh.uvs[uvStart + i * 4 + 1] = 0;
        mesh.uvs[uvStart + i * 4 + 2] = arc;
        mesh.uvs[uvStart + i * 4 + 3] = 1;
      }
    }
  }
  polygon(
    kind: MeshKind,
    material: string,
    boundary: V3[],
    center?: V3,
    upward = true,
  ) {
    const points = boundary.filter(
      (p, i) => !i || distance(p, boundary[i - 1]) > 1e-7,
    );
    if (points.length < 3) return;
    // A star-shaped junction uses a crowned fan, retaining EVERY mouth vertex,
    // including the center of the carriageway. This is the seam guarantee.
    if (
      center &&
      points.every(
        (p, i) =>
          crossXZ(
            sub(p, center),
            sub(points[(i + 1) % points.length], center),
          ) >= -1e-7,
      )
    ) {
      const count = points.length,
        indices = points.flatMap((_, i) => [count, i, (i + 1) % count]);
      this.append(kind, material, [...points, center], indices, upward);
      return;
    }
    let indices = earcut(points.flatMap((p) => [p[0], p[2]]));
    // Earcut may discard collinear boundary vertices. Reinsert them into the
    // boundary triangle, so shared crowned cross-sections remain watertight.
    const used = new Set(indices);
    for (let k = 0; k < points.length; k++)
      if (!used.has(k)) {
        let found = false;
        for (let j = 0; j < indices.length && !found; j += 3)
          for (let e = 0; e < 3; e++) {
            const ids = indices.slice(j, j + 3),
              a = ids[e],
              b = ids[(e + 1) % 3],
              c = ids[(e + 2) % 3];
            const ab = sub(points[b], points[a]),
              ak = sub(points[k], points[a]);
            const projection = dotXZ(ab, ak) / Math.max(1e-12, dotXZ(ab, ab));
            if (
              projection > 1e-7 &&
              projection < 1 - 1e-7 &&
              Math.abs(crossXZ(ab, ak)) < 1e-5
            ) {
              indices.splice(j, 3, a, k, c, k, b, c);
              used.add(k);
              found = true;
              break;
            }
          }
      }
    this.append(kind, material, points, indices, upward);
  }
  box(
    kind: MeshKind,
    material: string,
    center: V3,
    width: number,
    height: number,
    depth: number,
    d: V3 = [0, 0, 1],
  ) {
    const right: V3 = [d[2], 0, -d[0]];
    const p = (x: number, y: number, z: number): V3 =>
      add(
        center,
        add(
          mul(right, (x * width) / 2),
          add([0, (y * height) / 2, 0], mul(d, (z * depth) / 2)),
        ),
      );
    const verts = [
      p(-1, -1, -1),
      p(1, -1, -1),
      p(1, 1, -1),
      p(-1, 1, -1),
      p(-1, -1, 1),
      p(1, -1, 1),
      p(1, 1, 1),
      p(-1, 1, 1),
    ];
    for (const face of [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 4, 7, 3],
      [1, 2, 6, 5],
      [3, 7, 6, 2],
      [0, 1, 5, 4],
    ])
      this.quad(
        kind,
        material,
        face.map((i) => verts[i]),
      );
  }
  output() {
    return [...this.meshes.values()].filter((m) => m.indices.length);
  }
}
function pavingBands(
  b: MeshBuilder,
  inner: V3[],
  outer: V3[],
  widths: number[],
) {
  const band = 0.16,
    up = (p: V3) => add(p, [0, 0.004, 0]);
  b.strip(
    "paving",
    "pave-border",
    inner.map(up),
    inner.map((p, k) =>
      up(lerp(p, outer[k], Math.min(0.3, band / Math.max(0.01, widths[k])))),
    ),
    true,
  );
  b.strip(
    "paving",
    "pave-border",
    outer.map((p, k) =>
      up(lerp(p, inner[k], Math.min(0.3, band / Math.max(0.01, widths[k])))),
    ),
    outer.map(up),
    true,
  );
}
/** A shared metric curb profile keeps the chamfer exact at body/junction seams. */
export function curbSections(base: V3[], inner: V3[], outer: V3[]): V3[][] {
  const sizes = base.map((p, i) =>
    Math.min(
      0.015,
      Math.abs(inner[i][1] - p[1]) * 0.22,
      distanceXZ(inner[i], outer[i]) * 0.2,
    ),
  );
  return [
    base,
    inner.map((p, i) => add(p, [0, -sizes[i], 0])),
    inner.map((p, i) =>
      lerp(p, outer[i], sizes[i] / Math.max(1e-9, distanceXZ(p, outer[i]))),
    ),
    outer,
  ];
}
function sweepCurb(
  b: MeshBuilder,
  material: string,
  base: V3[],
  inner: V3[],
  outer: V3[],
) {
  const rows = curbSections(base, inner, outer);
  for (let i = 0; i < rows.length - 1; i++)
    b.strip("curb", material, rows[i], rows[i + 1], i > 0 ? true : undefined);
}
function needsJoint(
  project: Project,
  node: RoadNode,
  alignments: Map<string, Alignment>,
) {
  const roads = connected(project, node.id);
  if (roads.length >= 3) return true;
  if (roads.length !== 2) return false;
  if (roads[0].curbStyle !== roads[1].curbStyle) return true;
  if (
    Math.abs(roadHalfWidth(roads[0]) * 2 - roadHalfWidth(roads[1]) * 2) >
      0.02 ||
    Math.abs(roads[0].sidewalk - roads[1].sidewalk) > 0.02
  )
    return true;
  const dirs = roads.map((r) => {
    const a = alignments.get(r.id)!;
    return mul(
      r.start === node.id ? a.stations[0].d : a.stations.at(-1)!.d,
      r.start === node.id ? 1 : -1,
    );
  });
  return dotXZ(dirs[0], dirs[1]) > -Math.cos((12 * Math.PI) / 180);
}
function trimDistance(
  project: Project,
  node: RoadNode,
  alignments: Map<string, Alignment>,
) {
  const roads = connected(project, node.id),
    widths = roads.map(roadHalfWidth),
    maxWidth = Math.max(...widths);
  const angles = roads
    .map((r) => {
      const a = alignments.get(r.id)!,
        d =
          r.start === node.id ? a.stations[0].d : mul(a.stations.at(-1)!.d, -1);
      return Math.atan2(d[2], d[0]);
    })
    .sort((a, b) => a - b);
  let minAngle = Math.PI;
  angles.forEach((angle, i) => {
    const gap =
      (angles[(i + 1) % angles.length] - angle + Math.PI * 2) % (Math.PI * 2);
    minAngle = Math.min(minAngle, gap);
  });
  const radius = Math.max(node.radius, ...roads.map((r) => r.sidewalk + 1));
  return (
    Math.max(
      radius + maxWidth + 0.8,
      (radius + maxWidth) / Math.max(0.075, Math.tan(minAngle / 2)) + 0.8,
    ) + (node.setback ?? 0)
  );
}
function frameWithWidth(s: Station, road: Road, scale = 1): Frame {
  return {
    ...s,
    hw: roadHalfWidth(road) * scale,
    sw: road.sidewalk * scale,
    cw: (road.curbStyle === "race" ? 0.6 : 0.22) * scale,
    crossfall: road.crossfall,
    curbHeight:
      road.curbStyle === "flush"
        ? 0.04
        : road.curbStyle === "race"
          ? 0.08
          : CURB,
  };
}
function hasSelfCrossing(alignment: Alignment): boolean {
  const stations = alignment.stations;
  if (
    alignment.length > 1 &&
    distanceXZ(stations[0].p, stations.at(-1)!.p) < 0.1 &&
    Math.abs(stations[0].p[1] - stations.at(-1)!.p[1]) < 0.7
  )
    return true;
  const cells = new Map<string, { a: Station; b: Station; index: number }[]>();
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1],
      b = stations[i];
    for (
      let x = Math.floor(Math.min(a.p[0], b.p[0]) / 20);
      x <= Math.floor(Math.max(a.p[0], b.p[0]) / 20);
      x++
    )
      for (
        let z = Math.floor(Math.min(a.p[2], b.p[2]) / 20);
        z <= Math.floor(Math.max(a.p[2], b.p[2]) / 20);
        z++
      ) {
        const key = `${x},${z}`,
          bucket = cells.get(key) ?? [];
        for (const segment of bucket) {
          if (Math.abs(i - segment.index) <= 2) continue;
          const hit = segmentIntersection(a.p, b.p, segment.a.p, segment.b.p);
          if (
            hit &&
            hit[0] > 1e-5 &&
            hit[0] < 1 - 1e-5 &&
            hit[1] > 1e-5 &&
            hit[1] < 1 - 1e-5
          ) {
            const ay = a.p[1] + (b.p[1] - a.p[1]) * hit[0],
              by = segment.a.p[1] + (segment.b.p[1] - segment.a.p[1]) * hit[1];
            if (Math.abs(ay - by) < 0.7) return true;
          }
        }
        bucket.push({ a, b, index: i });
        cells.set(key, bucket);
      }
  }
  return false;
}
function makeFrames(
  stations: Station[],
  road: Road,
  diagnostics: Diagnostic[],
) {
  let limited = false;
  const frames = stations.map((s, i) => {
    const a = stations[Math.max(0, i - 1)],
      b = stations[Math.min(stations.length - 1, i + 1)];
    const angle = Math.acos(clamp(dotXZ(a.d, b.d), -1, 1)),
      radius = angle > 1e-5 ? distanceXZ(a.p, b.p) / angle : Infinity;
    const scale = Math.min(
      1,
      (radius * 0.78) / (roadHalfWidth(road) + road.sidewalk + 0.6),
    );
    if (scale < 0.98) limited = true;
    return frameWithWidth(s, road, Math.max(0.05, scale));
  });
  if (limited)
    diagnostics.push({
      level: "warning",
      message: `${road.name}: offsets narrowed to prevent a tight-curve fold.`,
      owner: road.id,
    });
  return frames;
}
export function frameAt(span: RoadSpan, s: number): Frame {
  if (s <= span.frames[0].s) return span.frames[0];
  if (s >= span.frames.at(-1)!.s) return span.frames.at(-1)!;
  const i = span.frames.findIndex((f) => f.s >= s),
    a = span.frames[i - 1],
    b = span.frames[i],
    t = (s - a.s) / Math.max(1e-8, b.s - a.s);
  return {
    ...stationAt(span.alignment, s),
    hw: a.hw + (b.hw - a.hw) * t,
    sw: a.sw + (b.sw - a.sw) * t,
    cw: a.cw + (b.cw - a.cw) * t,
    crossfall: span.road.crossfall,
    curbHeight: a.curbHeight,
  };
}
export function ribbon(
  builder: MeshBuilder,
  span: RoadSpan,
  from: number,
  to: number,
  offset: number,
  width: number,
  material = "paint",
) {
  if (to - from < 0.04) return;
  const frames = [
    frameAt(span, from),
    ...span.frames.filter((f) => f.s > from && f.s < to),
    frameAt(span, to),
  ];
  builder.strip(
    "marking",
    material,
    frames.map((f) =>
      surfacePoint(
        f,
        ((offset - width / 2) * f.hw) / roadHalfWidth(span.road),
        0.018,
      ),
    ),
    frames.map((f) =>
      surfacePoint(
        f,
        ((offset + width / 2) * f.hw) / roadHalfWidth(span.road),
        0.018,
      ),
    ),
    true,
  );
}
function crosswalk(builder: MeshBuilder, span: RoadSpan, s: number) {
  const f = frameAt(span, s),
    width = f.hw * 2 - 0.65;
  const stripes = Math.max(3, Math.floor(width / 0.85));
  for (let i = 0; i < stripes; i++) {
    const offset = -width / 2 + ((i + 0.5) * width) / stripes;
    const p = (dx: number, dz: number) =>
      add(surfacePoint(f, offset + dx, 0.023), mul(f.d, dz));
    builder.quad(
      "marking",
      "paint",
      [p(-0.24, -1.25), p(0.24, -1.25), p(0.24, 1.25), p(-0.24, 1.25)],
      true,
    );
  }
}
export function arrow(
  builder: MeshBuilder,
  f: Frame,
  offset: number,
  direction: number,
) {
  const shape: [number, number][] = [
    [-0.12, -1.5],
    [0.12, -1.5],
    [0.12, 0.3],
    [0.48, 0.3],
    [0, 1.3],
    [-0.48, 0.3],
    [-0.12, 0.3],
  ];
  builder.polygon(
    "marking",
    "paint",
    shape.map(([x, z]) =>
      add(surfacePoint(f, offset + x, 0.024), mul(f.d, z * direction)),
    ),
    undefined,
    true,
  );
}
export function minimumApproachAngle(project: Project, nodeId: string): number {
  const angles = connected(project, nodeId)
    .map((r) => {
      const a = sampleAlignment(project, r),
        d =
          r.start === nodeId ? a.stations[0].d : mul(a.stations.at(-1)!.d, -1);
      return Math.atan2(d[2], d[0]);
    })
    .sort((a, b) => a - b);
  if (angles.length < 2) return Math.PI;
  return Math.min(
    ...angles.map(
      (a, i) =>
        (angles[(i + 1) % angles.length] - a + Math.PI * 2) % (Math.PI * 2),
    ),
  );
}
export function effectiveCrossing(project: Project, nodeId: string): boolean {
  return (
    getNode(project, nodeId).crossings &&
    connected(project, nodeId).some((r) => r.markingStyle === "urban") &&
    minimumApproachAngle(project, nodeId) > Math.PI * 0.29
  );
}
function buildMarkings(builder: MeshBuilder, span: RoadSpan, project: Project) {
  const road = span.road;
  if (!road.markings) return;
  const start = span.frames[0].s,
    end = span.frames.at(-1)!.s;
  const startCrossing =
      span.startJoint && effectiveCrossing(project, road.start),
    endCrossing = span.endJoint && effectiveCrossing(project, road.end);
  const from = start + (startCrossing ? 5 : 0.35) + road.markingSetback,
    to = end - (endCrossing ? 5 : 0.35) - road.markingSetback;
  const hw = roadHalfWidth(road),
    travel = (road.lanes * road.laneWidth) / 2;
  for (const side of [-1, 1])
    ribbon(
      builder,
      span,
      start + 0.3,
      end - 0.3,
      side * (travel + road.median / 2 - 0.22),
      0.13,
    );
  for (
    let lane = 1;
    lane < road.lanes && road.markingStyle !== "race";
    lane++
  ) {
    const offset =
      -travel +
      road.laneWidth * lane +
      (lane < road.lanes / 2
        ? -road.median / 2
        : lane > road.lanes / 2
          ? road.median / 2
          : 0);
    if (lane === road.lanes / 2 && road.median > 0) continue;
    if (
      road.lanes >= 4 &&
      lane === road.lanes / 2 &&
      !road.oneWay &&
      road.markingStyle === "urban"
    ) {
      ribbon(builder, span, from, to, offset - 0.12, 0.1, "yellow");
      ribbon(builder, span, from, to, offset + 0.12, 0.1, "yellow");
    } else
      for (
        let s = Math.ceil(from / 6) * 6;
        s < to - 0.1;
        s += road.markingStyle === "motorway" ? 10 : 6
      )
        ribbon(
          builder,
          span,
          s,
          Math.min(to, s + (road.markingStyle === "motorway" ? 5 : 2.7)),
          offset,
          0.13,
        );
  }
  if (road.markingStyle === "race" && road.startingGrid) {
    const a = from + 3,
      z = Math.min(to, from + 5.2);
    if (z > a)
      for (let row = 0; row < 2; row++)
        for (let cell = 0; cell < 16; cell++) {
          const f = frameAt(span, a + ((z - a) * row) / 2),
            g = frameAt(span, a + ((z - a) * (row + 1)) / 2),
            lo = -f.hw + (f.hw * 2 * cell) / 16,
            hi = -f.hw + (f.hw * 2 * (cell + 1)) / 16;
          builder.quad(
            "marking",
            (cell + row) % 2 ? "paint" : "rubber",
            [
              surfacePoint(f, lo, 0.022),
              surfacePoint(f, hi, 0.022),
              surfacePoint(g, -g.hw + (g.hw * 2 * (cell + 1)) / 16, 0.022),
              surfacePoint(g, -g.hw + (g.hw * 2 * cell) / 16, 0.022),
            ],
            true,
          );
        }

    for (let lane = 0; lane < 2; lane++)
      for (let i = 0; i < 5; i++) {
        const s = from + 10 + i * 7;
        if (s + 2 < to) {
          ribbon(
            builder,
            span,
            s,
            s + 2,
            (lane === 0 ? -1 : 1) * travel * 0.5 - 0.65,
            0.11,
          );
          ribbon(
            builder,
            span,
            s,
            s + 2,
            (lane === 0 ? -1 : 1) * travel * 0.5 + 0.65,
            0.11,
          );
        }
      }
  }
  if (startCrossing && end - start > 14)
    ribbon(builder, span, start + 4.1, start + 4.45, -hw * 0.5, hw - 0.5);
  if (endCrossing && end - start > 14)
    ribbon(builder, span, end - 4.45, end - 4.1, hw * 0.5, hw - 0.5);
  if (startCrossing && end - start > 9) crosswalk(builder, span, start + 2);
  if (endCrossing && end - start > 9) crosswalk(builder, span, end - 2);
  if (end - start > 26) {
    if (span.startJoint)
      arrow(builder, frameAt(span, start + 11), -hw / 2, road.oneWay ? 1 : -1);
    if (span.endJoint) arrow(builder, frameAt(span, end - 11), hw / 2, 1);
  }
}
function alternativeRail(
  b: MeshBuilder,
  path: V3[],
  normals: V3[],
  height: (t: number) => number,
  style: "railing" | "concrete",
  spacing: number,
) {
  const profiles =
    style === "concrete"
      ? [
          [
            [-0.32, 0],
            [-0.23, 0.18],
            [-0.09, 1],
            [0.09, 1],
            [0.23, 0.18],
            [0.32, 0],
          ],
        ]
      : [0.4, 0.72, 0.97].map((h) => [
          [-0.022, h - 0.023],
          [0.022, h - 0.023],
          [0.022, h + 0.023],
          [-0.022, h + 0.023],
        ]);
  for (const profile of profiles) {
    const row = (i: number) =>
      path.map((p, k) =>
        add(
          p,
          add(mul(normals[k], profile[i][0]), [
            0,
            profile[i][1] * height(k / (path.length - 1)),
            0,
          ]),
        ),
      );
    for (let i = 0; i < profile.length; i++)
      b.strip(
        "rail",
        style === "concrete" ? "curb" : "pole",
        row(i),
        row((i + 1) % profile.length),
      );
    for (const index of [0, path.length - 1]) {
      const points = profile.map((_, i) => row(i)[index]),
        center = mul(
          points.reduce((a, p) => add(a, p), [0, 0, 0] as V3),
          1 / points.length,
        );
      b.append(
        "rail",
        style === "concrete" ? "curb" : "pole",
        [center, ...points],
        points.flatMap((_, i) => [0, i + 1, ((i + 1) % points.length) + 1]),
      );
    }
  }
  if (style === "railing") {
    const length = path
        .slice(1)
        .reduce((s, p, i) => s + distance(p, path[i]), 0),
      posts = resampleLine(
        path,
        Math.max(2, Math.ceil(length / Math.min(spacing, 2.5)) + 1),
      );
    for (let i = 0; i < posts.length; i++) {
      const h = height(i / (posts.length - 1)),
        d = normalizeXZ(
          sub(
            posts[Math.min(i + 1, posts.length - 1)],
            posts[Math.max(0, i - 1)],
          ),
        );
      b.box(
        "rail",
        "pole",
        add(posts[i], [0, h / 2 - 0.04, 0]),
        0.065,
        h + 0.08,
        0.065,
        d,
      );
    }
  }
}
function buildRails(builder: MeshBuilder, span: RoadSpan) {
  if (!span.road.guardrails) return;
  if (span.road.railStyle !== "wbeam") {
    for (const side of [-1, 1])
      alternativeRail(
        builder,
        span.frames.map((f) => edgePoint(f, side, "outer")),
        span.frames.map((f) => mul(f.n, side)),
        () => span.road.railHeight,
        span.road.railStyle,
        span.road.postSpacing,
      );
    return;
  }
  for (const side of [-1, 1]) {
    const base = span.frames.map((f) => edgePoint(f, side, "outer"));
    // A corrugated W-beam, not a floating tube. Profile is swept in the same
    // frames as the deck, with solid posts embedded in the pavement/deck.
    const profile = [
      [-0.035, -0.16],
      [0.04, -0.08],
      [-0.035, 0],
      [0.04, 0.08],
      [-0.035, 0.16],
    ];
    for (let row = 0; row < profile.length - 1; row++) {
      const curve = (i: number) =>
        base.map((p, k) =>
          add(
            p,
            add(mul(span.frames[k].n, side * profile[i][0]), [
              0,
              span.road.railHeight - 0.06 + profile[i][1],
              0,
            ]),
          ),
        );
      builder.strip("rail", "steel", curve(row), curve(row + 1));
    }
    for (
      let s = span.frames[0].s + 0.6;
      s < span.frames.at(-1)!.s - 0.4;
      s += span.road.postSpacing
    ) {
      const f = frameAt(span, s),
        p = edgePoint(f, side, "outer");
      builder.box(
        "rail",
        "steel",
        add(p, [0, span.road.railHeight / 2 - 0.05, 0]),
        0.12,
        span.road.railHeight + 0.12,
        0.17,
        f.d,
      );
    }
  }
}
function addInlet(builder: MeshBuilder, f: Frame, side: number) {
  const p = offsetStation(
    f,
    side * (f.hw + 0.04),
    surfaceHeight(f) - (f.hw * f.crossfall) / 100 + 0.009,
  );
  builder.box("drain", "drain-dark", p, 0.36, 0.045, 0.7, f.d);
  for (let i = 0; i < 7; i++)
    builder.box(
      "drain",
      "steel-dark",
      add(p, add(mul(f.d, (i - 3) * 0.09), [0, 0.028, 0])),
      0.31,
      0.025,
      0.034,
      f.d,
    );
}
function buildDrainage(builder: MeshBuilder, span: RoadSpan) {
  if (!span.road.drainage) return 0;
  let inlets = 0;
  for (const side of [-1, 1]) {
    const a = span.frames.map((f) =>
      offsetStation(
        f,
        side * (f.hw - 0.06),
        surfaceHeight(f) - (f.hw * f.crossfall) / 100 + 0.006,
      ),
    );
    const b = span.frames.map((f) =>
      offsetStation(
        f,
        side * (f.hw + 0.065),
        surfaceHeight(f) - (f.hw * f.crossfall) / 100 + 0.006,
      ),
    );
    builder.strip("gutter", "gutter", a, b, true);
    for (
      let s = span.frames[0].s + 5;
      s < span.frames.at(-1)!.s - 2;
      s += span.road.inletSpacing
    ) {
      addInlet(builder, frameAt(span, s), side);
      inlets++;
    }
  }
  return inlets;
}
function buildBridge(
  builder: MeshBuilder,
  span: RoadSpan,
  allAlignments: Alignment[],
) {
  if (!span.road.bridge) return;
  const frames = span.frames,
    steel = span.road.structure === "steel";
  for (const side of [-1, 1]) {
    const a = frames.map((f) =>
      offsetStation(f, side * f.hw * 0.68 - 0.14, -0.4),
    );
    const b = frames.map((f) =>
      offsetStation(f, side * f.hw * 0.68 + 0.14, -0.4),
    );
    const c = a.map((p) => add(p, [0, steel ? -0.72 : -0.4, 0])),
      d = b.map((p) => add(p, [0, steel ? -0.72 : -0.4, 0]));
    builder.strip("structure", steel ? "girder" : "concrete", a, b, true);
    builder.strip("structure", steel ? "girder" : "concrete", a, c);
    builder.strip("structure", steel ? "girder" : "concrete", b, d);
    builder.strip("structure", steel ? "girder" : "concrete", c, d, false);
    if (steel)
      for (const h of [-0.4, -1.1])
        builder.strip(
          "structure",
          "girder",
          frames.map((f) => offsetStation(f, side * f.hw * 0.68 - 0.3, h)),
          frames.map((f) => offsetStation(f, side * f.hw * 0.68 + 0.3, h)),
          true,
        );
  }
  const first = frames[0].s,
    last = frames.at(-1)!.s;
  const bayCount = Math.max(1, Math.ceil((last - first) / 26));
  for (let i = 1; i < bayCount; i++) {
    const f = frameAt(span, first + ((last - first) * i) / bayCount);
    if (f.p[1] < 2.2) continue;
    // No support is placed inside an underlying carriageway. Moving either
    // road re-evaluates this exclusion, so interchange piers cannot block it.
    if (
      allAlignments.some(
        (a) =>
          a.road.id !== span.road.id &&
          !a.road.bridge &&
          closestOnAlignment(a, f.p).distance <
            (a.road.lanes * a.road.laneWidth) / 2 + 2.8 &&
          closestOnAlignment(a, f.p).point[1] < f.p[1] - 2,
      )
    )
      continue;
    const bottom = -0.27,
      top = f.p[1] - (steel ? 1.15 : 0.92),
      height = Math.max(0.5, top - bottom);
    const center = [f.p[0], bottom + height / 2, f.p[2]] as V3;
    builder.box("structure", "concrete", center, 1.65, height, 1.4, f.d);
    builder.box(
      "structure",
      "concrete",
      [f.p[0], top - 0.18, f.p[2]],
      f.hw * 1.7,
      0.58,
      1.75,
      f.d,
    );
    builder.box(
      "structure",
      "foundation",
      [f.p[0], -0.2, f.p[2]],
      3.4,
      0.45,
      3,
      f.d,
    );
  }
  for (const f of [frames[0], frames.at(-1)!])
    if (f.p[1] > 1) {
      builder.box(
        "structure",
        "concrete",
        [f.p[0], f.p[1] / 2 - 0.35, f.p[2]],
        (f.hw + f.sw + 0.22) * 2,
        f.p[1] - 0.35,
        1.35,
        f.d,
      );
    }
}
function buildSpan(
  span: RoadSpan,
  project: Project,
  allAlignments: Alignment[],
) {
  const b = new MeshBuilder(span.road.id, "road"),
    frames = span.frames,
    road = span.road;
  const center = frames.map((f) => surfacePoint(f, 0)),
    left = frames.map((f) => edgePoint(f, 1, "road")),
    right = frames.map((f) => edgePoint(f, -1, "road"));
  b.strip("asphalt", roadMaterial(road), left, center, true);
  b.strip("asphalt", roadMaterial(road), center, right, true);
  for (const side of [-1, 1]) {
    const inner = frames.map((f) => edgePoint(f, side, "road")),
      curbIn = frames.map((f) => edgePoint(f, side, "curbIn"));
    const curbOut = frames.map((f) => edgePoint(f, side, "curbOut")),
      outer = frames.map((f) => edgePoint(f, side, "outer"));
    const bottom = frames.map((f) => edgePoint(f, side, "bottom"));
    const curbMaterial = road.curbStyle === "race" ? "race-curb" : "curb";
    sweepCurb(b, curbMaterial, inner, curbIn, curbOut);
    if (road.sidewalk > 0.01) {
      b.strip("paving", `paving-${road.pattern}`, curbOut, outer, true);
      pavingBands(
        b,
        curbOut,
        outer,
        frames.map((f) => f.sw),
      );
    }
    b.strip("structure", "road-base", outer, bottom);
  }
  b.strip(
    "structure",
    "road-base",
    frames.map((f) => edgePoint(f, 1, "bottom")),
    frames.map((f) => edgePoint(f, -1, "bottom")),
    false,
  );
  // Only true dead ends get a cap. Shared straight joins abut without overlap.
  for (const [f, id] of [
    [frames[0], road.start],
    [frames.at(-1)!, road.end],
  ] as [Frame, string][])
    if (connected(project, id).length === 1) {
      const profile = (side: number) =>
        curbSections(
          [edgePoint(f, side, "road")],
          [edgePoint(f, side, "curbIn")],
          [edgePoint(f, side, "curbOut")],
        ).map((row) => row[0]);
      const top = [
        edgePoint(f, -1, "outer"),
        ...profile(-1).reverse(),
        surfacePoint(f, 0),
        ...profile(1),
        edgePoint(f, 1, "outer"),
      ];
      for (let i = 0; i < top.length - 1; i++)
        b.quad("structure", "road-base", [
          top[i],
          top[i + 1],
          [top[i + 1][0], f.p[1] - 0.48, top[i + 1][2]],
          [top[i][0], f.p[1] - 0.48, top[i][2]],
        ]);
    }
  buildMarkings(b, span, project);
  buildMedian(b, span);
  buildParallelParking(b, span);
  buildRoadFurniture(b, span, project);
  buildRails(b, span);
  const inlets = buildDrainage(b, span);
  buildBridge(b, span, allAlignments);
  return { meshes: b.output(), inlets };
}
/** Tangent circular fillet with a bounded cubic fallback for reflex corners. */
export function cornerCurve(
  a: V3,
  da: V3,
  b: V3,
  db: V3,
  requestedRadius: number,
  detail: GeometryDetail = "editing",
): V3[] {
  const towardA = mul(da, -1),
    towardB = mul(db, -1),
    det = crossXZ(towardA, towardB);
  if (Math.abs(det) > 1e-5) {
    const delta = sub(b, a),
      ta = crossXZ(delta, towardB) / det,
      tb = crossXZ(delta, towardA) / det;
    const cosine = clamp(dotXZ(da, db), -1, 1),
      theta = Math.acos(cosine);
    if (ta > 0.05 && tb > 0.05 && theta > 0.03 && theta < Math.PI - 0.03) {
      const vertex = add(a, mul(towardA, ta)),
        half = theta / 2;
      const radius = Math.min(
        requestedRadius,
        Math.min(ta, tb) * 0.97 * Math.tan(half),
      );
      const tangentLength = radius / Math.tan(half),
        p = add(vertex, mul(da, tangentLength)),
        q = add(vertex, mul(db, tangentLength));
      const bisector = normalizeXZ(add(da, db)),
        center = add(vertex, mul(bisector, radius / Math.sin(half)));
      let angle = Math.atan2(p[2] - center[2], p[0] - center[0]),
        deltaAngle = Math.atan2(q[2] - center[2], q[0] - center[0]) - angle;
      while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
      while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
      const profile = geometryProfiles[detail],
        arcLength = Math.abs(deltaAngle) * radius;
      const arcSteps =
        detail === "editing"
          ? 24
          : Math.max(64, Math.min(512, Math.ceil(arcLength / 0.15)));
      const points: V3[] = [a];
      for (let i = 0; i <= arcSteps; i++) {
        const t = i / arcSteps;
        points.push([
          center[0] + Math.cos(angle + deltaAngle * t) * radius,
          a[1] + (b[1] - a[1]) * t,
          center[2] + Math.sin(angle + deltaAngle * t) * radius,
        ]);
      }
      points.push(b);
      const length = points
          .slice(1)
          .reduce((sum, p, i) => sum + distance(points[i], p), 0),
        count = Math.min(
          profile.maxCornerPoints,
          Math.max(
            profile.minCornerPoints,
            Math.ceil(length / profile.cornerSegment) + 1,
          ),
        );
      const out = resampleLine(points, count);
      out[0] = a;
      out[out.length - 1] = b;
      return out;
    }
  }
  const length = distanceXZ(a, b),
    h = Math.min(length * 0.34, Math.max(1, requestedRadius));
  const c1 = add(a, mul(da, -h)),
    c2 = add(b, mul(db, -h));
  const profile = geometryProfiles[detail],
    count = Math.min(
      profile.maxCornerPoints,
      Math.max(
        profile.minCornerPoints,
        Math.ceil((length + h * 2) / profile.cornerSegment) + 1,
      ),
    );
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1),
      u = 1 - t;
    return add(
      add(mul(a, u * u * u), mul(c1, 3 * u * u * t)),
      add(mul(c2, 3 * u * t * t), mul(b, t * t * t)),
    );
  });
}
function offsetCorner(
  base: V3[],
  start: V3,
  end: V3,
  widthA: number,
  widthB: number,
): V3[] {
  const points = base.map((p, i) => {
    const a = base[Math.max(0, i - 1)],
      b = base[Math.min(base.length - 1, i + 1)],
      d = normalizeXZ(sub(b, a)),
      t = i / (base.length - 1);
    const n: V3 = [d[2], 0, -d[0]],
      requestedWidth = widthA * (1 - t) + widthB * t;
    const da = normalizeXZ(sub(p, a)),
      db = normalizeXZ(sub(b, p)),
      turn = Math.acos(clamp(dotXZ(da, db), -1, 1));
    const curvatureRadius =
      turn > 1e-4
        ? (distanceXZ(a, p) + distanceXZ(p, b)) / (2 * turn)
        : Infinity;
    // A wide footway cannot invert around a short-radius merge nose.
    // Preserve exact mouth widths; narrow only the inside of the fillet.
    const width =
      i === 0 || i === base.length - 1
        ? requestedWidth
        : Math.min(requestedWidth, curvatureRadius * 0.82);
    const y =
      (start[1] - base[0][1]) * (1 - t) + (end[1] - base.at(-1)![1]) * t;
    return add(p, add(mul(n, width), [0, y, 0]));
  });
  points[0] = start;
  points[points.length - 1] = end;
  return points;
}
function buildCornerRails(builder: MeshBuilder, curve: V3[], a: Arm, b: Arm) {
  if (!a.road.guardrails || !b.road.guardrails) return;
  const normals = curve.map((_, i) => {
    const d = normalizeXZ(
      sub(curve[Math.min(curve.length - 1, i + 1)], curve[Math.max(0, i - 1)]),
    );
    return [d[2], 0, -d[0]] as V3;
  });
  if (a.road.railStyle === b.road.railStyle && a.road.railStyle !== "wbeam") {
    alternativeRail(
      builder,
      curve,
      normals,
      (t) => a.road.railHeight * (1 - t) + b.road.railHeight * t,
      a.road.railStyle,
      (a.road.postSpacing + b.road.postSpacing) / 2,
    );
    return;
  }
  const profile = [
    [-0.035, -0.16],
    [0.04, -0.08],
    [-0.035, 0],
    [0.04, 0.08],
    [-0.035, 0.16],
  ];
  const heightAt = (t: number) =>
    a.road.railHeight * (1 - t) + b.road.railHeight * t;
  const row = (i: number) =>
    curve.map((p, k) =>
      add(
        p,
        add(mul(normals[k], profile[i][0]), [
          0,
          heightAt(k / (curve.length - 1)) - 0.06 + profile[i][1],
          0,
        ]),
      ),
    );
  for (let i = 0; i < profile.length - 1; i++)
    builder.strip("rail", "steel", row(i), row(i + 1));
  const length = curve
      .slice(1)
      .reduce((sum, p, i) => sum + distance(p, curve[i]), 0),
    spacing = (a.road.postSpacing + b.road.postSpacing) / 2;
  const posts = resampleLine(
    curve,
    Math.max(3, Math.ceil(length / spacing) + 1),
  );
  for (let i = 1; i < posts.length - 1; i++) {
    const height = heightAt(i / (posts.length - 1)),
      d = normalizeXZ(sub(posts[i + 1], posts[i - 1]));
    builder.box(
      "rail",
      "steel",
      add(posts[i], [0, height / 2 - 0.05, 0]),
      0.12,
      height + 0.12,
      0.17,
      d,
    );
  }
}
function makeArm(span: RoadSpan, node: RoadNode): Arm {
  const isStart = span.road.start === node.id,
    f = isStart ? span.frames[0] : span.frames.at(-1)!,
    sign = isStart ? 1 : -1;
  const d = mul(f.d, sign),
    n = normalXZ(d);
  return {
    road: span.road,
    frame: f,
    d,
    n,
    angle: Math.atan2(d[2], d[0]),
    isStart,
    center: surfacePoint(f, 0),
    left: edgePoint(f, sign, "road"),
    right: edgePoint(f, -sign, "road"),
    outerLeft: edgePoint(f, sign, "outer"),
    outerRight: edgePoint(f, -sign, "outer"),
  };
}
function armPart(
  arm: Arm,
  side: number,
  part: "road" | "curbIn" | "curbOut" | "outer" | "bottom",
) {
  return edgePoint(arm.frame, side * (arm.isStart ? 1 : -1), part);
}
function buildJunction(
  node: RoadNode,
  spans: RoadSpan[],
  diagnostics: Diagnostic[],
  detail: GeometryDetail,
) {
  const b = new MeshBuilder(node.id, "node"),
    arms = spans.map((s) => makeArm(s, node)).sort((a, b) => a.angle - b.angle);
  const boundary: V3[] = [],
    outer: V3[] = [],
    corners: V3[][] = [];
  const material = arms.reduce(
    (a, r) => (r.road.lanes > a.road.lanes ? r : a),
    arms[0],
  );
  const junctionRoad = material.road,
    asphaltMaterial = roadMaterial(junctionRoad);
  const radius = Math.max(node.radius, ...arms.map((a) => a.frame.sw + 1));
  let inlets = 0;
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i],
      next = arms[(i + 1) % arms.length],
      curve = cornerCurve(a.left, a.d, next.right, next.d, radius, detail);
    const curbIn = curve.map((p, k) =>
      add(p, [
        0,
        a.frame.curbHeight +
          ((next.frame.curbHeight - a.frame.curbHeight) * k) /
            (curve.length - 1),
        0,
      ]),
    );
    curbIn[0] = armPart(a, 1, "curbIn");
    curbIn[curbIn.length - 1] = armPart(next, -1, "curbIn");
    const curbOut = offsetCorner(
      curve,
      armPart(a, 1, "curbOut"),
      armPart(next, -1, "curbOut"),
      a.frame.cw,
      next.frame.cw,
    );
    const paved = offsetCorner(
      curve,
      a.outerLeft,
      next.outerRight,
      a.frame.cw + a.frame.sw,
      next.frame.cw + next.frame.sw,
    );
    buildCornerRails(b, paved, a, next);
    corners.push(curve);
    boundary.push(a.right, a.center, a.left, ...curve.slice(1, -1));
    outer.push(a.outerRight, a.outerLeft, ...paved.slice(1, -1));
    sweepCurb(
      b,
      a.road.curbStyle === "race" && next.road.curbStyle === "race"
        ? "race-curb"
        : "curb",
      curve,
      curbIn,
      curbOut,
    );
    if (a.frame.sw > 0 || next.frame.sw > 0) {
      b.strip("paving", `paving-${a.road.pattern}`, curbOut, paved, true);
      pavingBands(
        b,
        curbOut,
        paved,
        curbOut.map((p, k) => distanceXZ(p, paved[k])),
      );
    }
    const bottom = paved.map(
      (p) => [p[0], node.position[1] - 0.48, p[2]] as V3,
    );
    bottom[0] = armPart(a, 1, "bottom");
    bottom[bottom.length - 1] = armPart(next, -1, "bottom");
    b.strip("structure", "road-base", paved, bottom);
    if (a.road.drainage) {
      const f = { ...a.frame, d: a.d, n: a.n };
      addInlet(b, f, 1);
      inlets++;
    }
  }
  const valid =
    simplePolygon(boundary) && Math.abs(polygonArea(boundary)) > 0.1;
  if (!valid)
    diagnostics.push({
      level: "error",
      message: `${node.name}: overlapping approaches. Move the node or separate nearly parallel arms.`,
      owner: node.id,
    });
  b.polygon(
    "asphalt",
    asphaltMaterial,
    boundary,
    add(node.position, [0, SURFACE, 0]),
  );
  buildJunctionMarkings(b, node, arms, b.target("asphalt", asphaltMaterial));
  buildTrafficSignals(b, node, arms);
  const bottom = outer.map((p) => [p[0], node.position[1] - 0.48, p[2]] as V3);
  arms.forEach((arm) => {
    for (const [top, bot] of [
      [arm.outerLeft, armPart(arm, 1, "bottom")],
      [arm.outerRight, armPart(arm, -1, "bottom")],
    ] as [V3, V3][]) {
      const k = outer.indexOf(top);
      if (k >= 0) bottom[k] = bot;
    }
  });
  b.polygon(
    "structure",
    "road-base",
    bottom,
    add(node.position, [0, -0.48, 0]),
    false,
  );
  const type = arms.some(
    (a, i) =>
      (arms[(i + 1) % arms.length].angle - a.angle + Math.PI * 2) %
        (Math.PI * 2) <
      Math.PI * 0.29,
  )
    ? "Merge"
    : arms.length === 2
      ? "Bend"
      : arms.length === 3
        ? "3-way"
        : arms.length === 4
          ? "4-way"
          : `${arms.length}-way`;
  return {
    junction: { node, arms, boundary, outer, corners, type, valid },
    meshes: b.output(),
    inlets,
  };
}
export function buildNetwork(
  project: Project,
  options: { detail?: GeometryDetail } = {},
): Network {
  const detail = normaliseDetail(options.detail),
    profile = geometryProfiles[detail];
  validateGenerationBudget(project);
  // Dense meshes need a separate preflight budget, before any allocation.
  if (detail === "production") {
    const estimate = project.roads.reduce((sum, r) => {
      const p = getNode(project, r.start).position,
        q = getNode(project, r.end).position;
      return (
        sum +
        distance([0, 0, 0], r.h1) +
        distance(add(p, r.h1), add(q, r.h2)) +
        distance([0, 0, 0], r.h2)
      );
    }, 0);
    if (estimate > 15000)
      throw new RangeError(
        "Production geometry budget: 15 km of control-polygon length per editor tile. Export larger worlds as separate tiles.",
      );
  }
  const diagnostics: Diagnostic[] = [],
    alignments = new Map(
      project.roads.map((r) => [r.id, sampleAlignment(project, r, profile)]),
    );
  const jointNodes = project.nodes.filter((n) =>
      needsJoint(project, n, alignments),
    ),
    jointIDs = new Set(jointNodes.map((n) => n.id));
  const backs = new Map(
    jointNodes.map((n) => [n.id, trimDistance(project, n, alignments)]),
  );
  const spans: RoadSpan[] = [],
    meshes: MeshData[] = [],
    junctions: Junction[] = [];
  let length = 0,
    inlets = 0,
    maxGrade = 0;
  for (const road of project.roads) {
    const alignment = alignments.get(road.id)!;
    length += alignment.length;
    if (hasSelfCrossing(alignment))
      diagnostics.push({
        level: "error",
        message: `${road.name}: self-crossing alignment. Adjust the Bézier handles or use separate connected roads.`,
        owner: road.id,
      });
    if (alignment.length < 0.2) {
      diagnostics.push({
        level: "error",
        message: `${road.name}: zero-length road.`,
        owner: road.id,
      });
      continue;
    }
    const requiredA = backs.get(road.start) ?? 0,
      requiredB = backs.get(road.end) ?? 0;
    // Spend the available approach length, not a hard 43% at BOTH ends.
    // A free-ended 94 m road can give an acute merge its full fillet runout.
    const available = Math.max(
        0,
        alignment.length - Math.min(4, alignment.length * 0.2),
      ),
      factor = Math.min(1, available / Math.max(1e-8, requiredA + requiredB)),
      start = requiredA * factor,
      end = requiredB * factor;
    if (factor < 0.99)
      diagnostics.push({
        level: "warning",
        message: `${road.name}: short approach limits the junction radius.`,
        owner: road.id,
      });
    const stations = trimmedStations(alignment, start, end);
    // Near-straight degree-two joins share a canonical cross-section normal.
    // A tiny handle-angle mismatch cannot leave a hairline gap in the deck.
    for (const [index, nodeID] of [
      [0, road.start],
      [stations.length - 1, road.end],
    ] as [number, string][]) {
      const incident = connected(project, nodeID);
      if (jointIDs.has(nodeID) || incident.length !== 2) continue;
      const dirs = incident.map((r) => {
        const a = alignments.get(r.id)!;
        return mul(
          r.start === nodeID ? a.stations[0].d : a.stations.at(-1)!.d,
          r.start === nodeID ? 1 : -1,
        );
      });
      const canonical = normalizeXZ(sub(dirs[0], dirs[1]));
      const sign =
        (incident[0].id === road.id ? 1 : -1) *
        (road.start === nodeID ? 1 : -1);
      stations[index].d = mul(canonical, sign);
      stations[index].n = normalXZ(stations[index].d);
    }
    const frames = makeFrames(stations, road, diagnostics);
    const span: RoadSpan = {
      road,
      alignment,
      frames,
      startJoint: jointIDs.has(road.start),
      endJoint: jointIDs.has(road.end),
      length: alignment.length - start - end,
    };
    spans.push(span);
    for (const f of alignment.stations) {
      const before = alignment.points;
      const t = f.t,
        u = 1 - t;
      const dy =
        3 * u * u * (before[1][1] - before[0][1]) +
        6 * u * t * (before[2][1] - before[1][1]) +
        3 * t * t * (before[3][1] - before[2][1]);
      const dx =
        3 * u * u * (before[1][0] - before[0][0]) +
        6 * u * t * (before[2][0] - before[1][0]) +
        3 * t * t * (before[3][0] - before[2][0]);
      const dz =
        3 * u * u * (before[1][2] - before[0][2]) +
        6 * u * t * (before[2][2] - before[1][2]) +
        3 * t * t * (before[3][2] - before[2][2]);
      maxGrade = Math.max(
        maxGrade,
        (Math.abs(dy) / Math.max(0.001, Math.hypot(dx, dz))) * 100,
      );
    }
    const result = buildSpan(span, project, [...alignments.values()]);
    meshes.push(...result.meshes);
    inlets += result.inlets;
  }
  for (const node of jointNodes) {
    const result = buildJunction(
      node,
      spans.filter((s) => s.road.start === node.id || s.road.end === node.id),
      diagnostics,
      detail,
    );
    junctions.push(result.junction);
    meshes.push(...result.meshes);
    inlets += result.inlets;
  }
  if (maxGrade > 14)
    diagnostics.push({
      level: "warning",
      message: `Maximum grade is ${maxGrade.toFixed(1)}%. Lengthen the approach or reduce its elevation.`,
      owner: "",
    });
  const clearances: { a: string; b: string; meters: number }[] = [];
  for (const crossing of detectCrossings(project, Infinity)) {
    const a = alignments.get(crossing.a)!,
      b = alignments.get(crossing.b)!;
    const heightAt = (curve: V3[], t: number) => {
      const u = 1 - t;
      return (
        u * u * u * curve[0][1] +
        3 * u * u * t * curve[1][1] +
        3 * u * t * t * curve[2][1] +
        t * t * t * curve[3][1]
      );
    };
    const ay = heightAt(a.points, crossing.ta),
      by = heightAt(b.points, crossing.tb),
      gap = Math.abs(ay - by);
    if (gap <= 0.7) {
      diagnostics.push({
        level: "warning",
        message:
          "Unresolved at-grade crossing. Finish the edit or rebuild to create a shared junction.",
        owner: crossing.a,
      });
      continue;
    }
    const upper = ay > by ? a.road : b.road,
      depth = upper.bridge ? (upper.structure === "steel" ? 1.12 : 0.92) : 0.48,
      lower = ay > by ? b.road : a.road,
      meters =
        gap -
        depth -
        Math.max(
          SURFACE,
          0.04 + (roadHalfWidth(lower) * lower.crossfall) / 100,
        );
    clearances.push({ a: crossing.a, b: crossing.b, meters });
    if (meters < 4.5)
      diagnostics.push({
        level: "warning",
        message: `Low overpass clearance: ${meters.toFixed(2)} m. Raise the deck to provide at least 4.5 m.`,
        owner: upper.id,
      });
  }
  for (const site of project.sites ?? []) {
    meshes.push(...buildSiteGeometry(site));
    if (site.kind === "parking")
      for (const message of parkingPlan(site).warnings)
        diagnostics.push({
          level: "warning",
          owner: site.id,
          message: `${site.name}: ${message}`,
        });
    if (site.kind === "water" || site.kind === "block") continue;
    const footprint = siteOutline(site),
      minX = Math.min(...footprint.map((p) => p[0])),
      maxX = Math.max(...footprint.map((p) => p[0])),
      minZ = Math.min(...footprint.map((p) => p[2])),
      maxZ = Math.max(...footprint.map((p) => p[2]));
    const hits =
      spans.some((span) =>
        span.frames.some((f) => {
          if (
            Math.abs(f.p[1] - site.position[1]) > 0.7 ||
            f.p[0] < minX - f.hw ||
            f.p[0] > maxX + f.hw ||
            f.p[2] < minZ - f.hw ||
            f.p[2] > maxZ + f.hw
          )
            return false;
          // An access driveway may deliberately abut a parking entrance.
          if (
            site.kind === "parking" &&
            (f.s < 6 || span.alignment.length - f.s < 6)
          )
            return false;
          return (
            insidePolygon(f.p, footprint) ||
            insidePolygon(edgePoint(f, -1, "road"), footprint) ||
            insidePolygon(edgePoint(f, 1, "road"), footprint)
          );
        }),
      ) ||
      junctions.some(
        (j) =>
          Math.abs(j.node.position[1] - site.position[1]) < 0.7 &&
          (insidePolygon(j.node.position, footprint) ||
            footprint.some((p) => insidePolygon(p, j.boundary))),
      );
    if (hits)
      diagnostics.push({
        level: "warning",
        message: `${site.name}: footprint encroaches into a driveable road. Move or resize the site.`,
        owner: site.id,
      });
  }
  const min: V3 = [Infinity, Infinity, Infinity],
    max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const mesh of meshes)
    for (let i = 0; i < mesh.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], mesh.positions[i + k]);
        max[k] = Math.max(max[k], mesh.positions[i + k]);
      }
  if (!meshes.length) {
    min.fill(-30);
    max.fill(30);
  }
  return {
    detail,
    spans,
    junctions,
    meshes,
    diagnostics,
    length,
    inlets,
    maxGrade,
    clearances,
    parkingSpaces:
      spans.reduce(
        (sum, s) =>
          sum +
          (s.road.parking === "parallel" && s.road.markings
            ? Math.max(
                0,
                Math.ceil((s.frames.at(-1)!.s - s.frames[0].s - 25.5) / 6),
              ) * 2
            : 0),
        0,
      ) +
      (project.sites ?? [])
        .filter((s) => s.kind === "parking")
        .reduce((sum, s) => sum + parkingLayout(s).length, 0),
    bounds: { min, max },
    triangles: meshes.reduce((s, m) => s + m.indices.length / 3, 0),
    vertices: meshes.reduce((s, m) => s + m.positions.length / 3, 0),
  };
}
