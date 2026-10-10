import {
  supportsAuxiliary,
  auxiliaryDimensions,
  auxiliaryWidthAt,
} from "./road-sections";
import {
  buildAuxiliaryLane,
  type AuxiliaryLaneFeature,
} from "./auxiliary-lanes";
import {
  buildApproachFill,
  buildRetainedJoint,
  type EmbankmentFeature,
} from "./embankments";
import { bridgeAt, parameterStation } from "./bridge-profile";
import { reviewDesign, type DesignReview } from "./design-controls";
import { SupportSurfaceIndex } from "./support-surfaces";
import type { SplitterFeature } from "./splitters";
import {
  sectionScale,
  motorLanes,
  crossingStations,
  canExtendCurbs,
  extensionWeight,
  streetFeatures,
  type StreetFeature,
} from "./street-details";
import {
  buildBridgeSpan,
  buildBridgeJoint,
  bridgeDepthAt,
  type BridgeFeature,
} from "./bridges";
import { buildBarrierPath, type BarrierFeature } from "./barriers";
import {
  buildRoadMobility,
  buildJunctionMobility,
  type MobilityFeature,
} from "./mobility";
import type { PlantingFeature } from "./planting";
import { blockSolidAt, type BlockFeature } from "./planning-sites";
import {
  cornerPath,
  offsetCornerPath,
  effectiveCornerRadius,
  type CornerPath,
} from "./corners";
import {
  prepareFootways,
  stationForParameter,
  buildSpanFootways,
  clearRuns,
  type FootwayFeature,
  type FootwayLayout,
} from "./footways";
import {
  addGratedInlet,
  buildRoadManholes,
  buildLinearDrain,
  roadSampler,
  type UtilityFeature,
} from "./utilities";
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
  type RoadsideParkingBay,
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
  baseRoadHalfWidth,
  roadHalfWidthAt,
  roadCurbWidth,
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
  | "parking"
  | "utility"
  | "cycle"
  | "bus"
  | "planting";
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
  auxWidth?: number;
  auxSide?: number;
  /** Motor-lane scale is independent of parking-pocket curb extensions. */
  profileScale?: number;
  crownHeight?: number;
  roadBaseDepth?: number;
  hw: number;
  sw: number;
  cw: number;
  crossfall: number;
  curbHeight: number;
  sidewalkCrossfall: number;
}
export interface RoadSpan {
  road: Road;
  alignment: Alignment;
  frames: Frame[];
  startJoint: boolean;
  endJoint: boolean;
  length: number;
  footway?: FootwayLayout;
  detail?: GeometryDetail;
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
  pavedCorners: V3[][];
  type: string;
  valid: boolean;
  radius: number;
  requestedRadius: number;
  cornerRadii: number[];
}
export interface Diagnostic {
  level: "warning" | "error";
  message: string;
  owner: string;
}
export interface Network {
  designReview: DesignReview;
  embankments: EmbankmentFeature[];
  auxiliaryLanes: AuxiliaryLaneFeature[];
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
  roadsideParking: RoadsideParkingBay[];
  services: UtilityFeature[];
  manholes: number;
  detail: GeometryDetail;
  footways: FootwayFeature[];
  plantings: PlantingFeature[];
  blocks: BlockFeature[];
  mobility: MobilityFeature[];
  barriers: BarrierFeature[];
  bridges: BridgeFeature[];
  streetDetails: StreetFeature[];
  splitters: SplitterFeature[];
}
const SURFACE = 0.12,
  CURB = 0.16;
export const sideHalfWidth = (f: Frame, side: number) =>
  f.hw + (side === f.auxSide ? (f.auxWidth ?? 0) : 0);
export function edgePoint(
  f: Frame,
  side: number,
  part: "road" | "curbIn" | "curbOut" | "outer" | "bottom",
): V3 {
  const hw = sideHalfWidth(f, side),
    edgeHeight = surfaceHeight(f) - (hw * f.crossfall) / 100;
  const width =
    part === "road" || part === "curbIn"
      ? hw
      : part === "curbOut"
        ? hw + f.cw
        : hw + f.cw + f.sw;
  const height =
    part === "road"
      ? edgeHeight
      : part === "bottom"
        ? -(f.roadBaseDepth ?? 0.48)
        : edgeHeight +
          f.curbHeight +
          (part === "outer" ? (f.sw * f.sidewalkCrossfall) / 100 : 0);
  return offsetStation(f, side * width, height);
}
export const surfaceHeight = (f: Frame) =>
  f.crownHeight ?? Math.max(SURFACE, 0.04 + (f.hw * f.crossfall) / 100);
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
        name: ["cycle", "bus", "planting", "rail", "structure"].includes(kind)
          ? `${this.owner} ${kind} ${material}`
          : `${this.owner} ${kind}`,
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
    let projection: "xz" | "xy" | "zy" = "xz";
    if (
      (["curb", "cycle"].includes(kind) && material === "curb") ||
      (kind === "drain" && material === "concrete") ||
      ["rail", "structure"].includes(kind)
    ) {
      for (let i = 0; i < indices.length; i += 3) {
        const u = sub(points[indices[i + 1]], points[indices[i]]),
          v = sub(points[indices[i + 2]], points[indices[i]]),
          x = Math.abs(u[1] * v[2] - u[2] * v[1]),
          y = Math.abs(u[2] * v[0] - u[0] * v[2]),
          z = Math.abs(u[0] * v[1] - u[1] * v[0]);
        if (Math.max(x, y, z) < 1e-10) continue;
        if (y < Math.max(x, z)) projection = x > z ? "zy" : "xy";
        break;
      }
    }
    points.forEach((p) => {
      mesh.positions.push(...p);
      mesh.uvs.push(
        projection === "zy" ? p[2] : p[0],
        projection === "xz" ? p[2] : p[1],
      );
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
  quad(
    kind: MeshKind,
    material: string,
    points: V3[],
    upward?: boolean,
    uv?: [number, number][],
  ) {
    const mesh = this.target(kind, material),
      start = mesh.uvs.length;
    this.append(kind, material, points, [0, 1, 2, 0, 2, 3], upward);
    if (uv) uv.flat().forEach((v, i) => (mesh.uvs[start + i] = v));
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
    if (
      ["rail", "structure"].includes(kind) &&
      ["steel", "steel-dark", "girder", "pole", "concrete"].includes(material)
    ) {
      let arc = 0;
      for (let i = 0; i < a.length; i++) {
        if (i)
          arc += distance(lerp(a[i], b[i], 0.5), lerp(a[i - 1], b[i - 1], 0.5));
        mesh.uvs[uvStart + i * 4] = arc;
        mesh.uvs[uvStart + i * 4 + 1] = 0;
        mesh.uvs[uvStart + i * 4 + 2] = arc;
        mesh.uvs[uvStart + i * 4 + 3] = distance(a[i], b[i]);
      }
    }
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
  faceWithHoles(
    kind: MeshKind,
    material: string,
    boundary: V3[],
    holes: V3[][],
    upward = true,
  ) {
    const rows = [boundary, ...holes.filter((h) => h.length >= 3)],
      points = rows.flat(),
      starts: number[] = [];
    let count = boundary.length;
    for (const row of rows.slice(1)) {
      starts.push(count);
      count += row.length;
    }
    this.append(
      kind,
      material,
      points,
      earcut(
        points.flatMap((p) => [p[0], p[2]]),
        starts,
        2,
      ),
      upward,
    );
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
export function pavingBands(
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
export function sweepCurb(
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
  if (
    roads.every((r) => bridgeAt(r, r.start === node.id ? 0 : 1)) &&
    (roads[0].structure !== roads[1].structure ||
      Math.abs(roads[0].bridgeDepth - roads[1].bridgeDepth) > 0.001)
  )
    return true;
  if (roads[0].curbStyle !== roads[1].curbStyle) return true;
  if (
    Math.abs(
      roads.map((r) => {
        const a = alignments.get(r.id)!;
        return roadHalfWidthAt(r, r.start === node.id ? 0 : a.length, a.length);
      })[0] -
        roads.map((r) => {
          const a = alignments.get(r.id)!;
          return roadHalfWidthAt(
            r,
            r.start === node.id ? 0 : a.length,
            a.length,
          );
        })[1],
    ) > 0.01 ||
    Math.abs(roads[0].sidewalk - roads[1].sidewalk) > 0.02 ||
    Math.abs(roads[0].curbHeight - roads[1].curbHeight) > 0.001 ||
    Math.abs(roads[0].sidewalkCrossfall - roads[1].sidewalkCrossfall) > 0.001
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
    widths = roads.map(
      (r) =>
        roadHalfWidthAt(
          r,
          r.start === node.id ? 0 : alignments.get(r.id)!.length,
          alignments.get(r.id)!.length,
        ) -
        (canExtendCurbs(r) && effectiveCrossing(project, node.id) ? 2.1 : 0),
    ),
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
  const radius = effectiveCornerRadius(
    node.radius,
    roads.map((r) => ({
      sw:
        r.sidewalk +
        (canExtendCurbs(r) && effectiveCrossing(project, node.id) ? 2.1 : 0),
      cw: roadCurbWidth(r),
    })),
  );
  return (
    Math.max(
      radius + maxWidth + 0.8,
      (radius + maxWidth) / Math.max(0.075, Math.tan(minAngle / 2)) + 0.8,
    ) + (node.setback ?? 0)
  );
}
function frameWithWidth(s: Station, road: Road, scale = 1, length = 1): Frame {
  return {
    ...s,
    auxWidth: auxiliaryWidthAt(road, s.s, length) * scale,
    auxSide: road.trafficSide === "left" ? -1 : 1,
    profileScale: scale,
    crownHeight: Math.max(
      SURFACE,
      0.04 +
        (roadHalfWidthAt(road, s.s, length) * scale * road.crossfall) / 100,
    ),
    roadBaseDepth: bridgeAt(road, s.t) ? 0.28 : 0.48,
    hw: baseRoadHalfWidth(road) * scale,
    sw: road.sidewalk * scale,
    cw: roadCurbWidth(road) * scale,
    crossfall: road.crossfall,
    sidewalkCrossfall: road.sidewalkCrossfall,
    curbHeight:
      road.curbStyle === "flush"
        ? road.markingStyle === "motorway"
          ? 0
          : Math.min(0.04, road.curbHeight)
        : road.curbStyle === "race"
          ? Math.min(0.08, road.curbHeight)
          : road.curbHeight,
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
  project: Project,
  startJoint: boolean,
  endJoint: boolean,
  length: number,
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
    const f = frameWithWidth(s, road, Math.max(0.05, scale), length);
    if (canExtendCurbs(road)) {
      const weight = extensionWeight(
        s.s,
        stations[0].s,
        stations.at(-1)!.s,
        startJoint && effectiveCrossing(project, road.start),
        endJoint && effectiveCrossing(project, road.end),
      );
      const inset = 2.1 * (f.profileScale ?? 1) * weight;
      // Consume ONLY the parking bay, never a motor lane. Outside boundary stays fixed.
      const outsideRise =
        (f.sw * f.sidewalkCrossfall) / 100 - (inset * f.crossfall) / 100;
      f.hw -= inset;
      f.sw += inset;
      // Anchor the existing outer walk elevation while the bulb fills the bay.
      f.sidewalkCrossfall = (outsideRise / Math.max(0.05, f.sw)) * 100;
    }
    return f;
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
    roadBaseDepth: bridgeAt(span.road, stationAt(span.alignment, s).t)
      ? 0.28
      : 0.48,
    profileScale:
      (a.profileScale ?? 1) +
      ((b.profileScale ?? 1) - (a.profileScale ?? 1)) * t,
    auxWidth: (a.auxWidth ?? 0) + ((b.auxWidth ?? 0) - (a.auxWidth ?? 0)) * t,
    auxSide: a.auxSide,
    crownHeight: surfaceHeight(a) + (surfaceHeight(b) - surfaceHeight(a)) * t,
    hw: a.hw + (b.hw - a.hw) * t,
    sw: a.sw + (b.sw - a.sw) * t,
    cw: a.cw + (b.cw - a.cw) * t,
    crossfall: span.road.crossfall,
    curbHeight: a.curbHeight,
    sidewalkCrossfall:
      a.sidewalkCrossfall + (b.sidewalkCrossfall - a.sidewalkCrossfall) * t,
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
      surfacePoint(f, (offset - width / 2) * sectionScale(span, f), 0.018),
    ),
    frames.map((f) =>
      surfacePoint(f, (offset + width / 2) * sectionScale(span, f), 0.018),
    ),
    true,
  );
}
function crosswalk(builder: MeshBuilder, span: RoadSpan, s: number) {
  const f = frameAt(span, s),
    width = f.hw * 2 - 0.36,
    length = span.road.rampWidth,
    stripes = Math.max(3, Math.floor(width / 0.85));
  for (let i = 0; i < stripes; i++) {
    const offset = -width / 2 + ((i + 0.5) * width) / stripes;
    if (
      span.road.median >= 1.2 &&
      Math.abs(offset) < (span.road.median * sectionScale(span, f)) / 2 + 0.18
    )
      continue;
    const p = (dx: number, ds: number) =>
      surfacePoint(frameAt(span, s + ds), offset + dx, 0.023);
    builder.quad(
      "marking",
      "paint",
      [
        p(-0.24, -length / 2),
        p(0.24, -length / 2),
        p(0.24, length / 2),
        p(-0.24, length / 2),
      ],
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
  const hw = (road.lanes * road.laneWidth + road.median) / 2,
    travel = (road.lanes * road.laneWidth) / 2;
  for (const side of [-1, 1])
    for (const [a, z] of clearRuns(span, side, true)) {
      const first = Math.max(start + 0.3, a),
        last = Math.min(end - 0.3, z),
        offset =
          side *
          (travel +
            road.median / 2 +
            (road.markingStyle === "motorway" && road.shoulderWidth > 0
              ? 0.065
              : -0.22));
      if (
        supportsAuxiliary(road) &&
        road.auxiliaryLane !== "none" &&
        side === (road.trafficSide === "left" ? -1 : 1)
      ) {
        const fs = [
            frameAt(span, first),
            ...span.frames.filter((f) => f.s > first && f.s < last),
            frameAt(span, last),
          ],
          edge = (dx: number) =>
            fs.map((f) =>
              surfacePoint(
                f,
                (offset + dx) * sectionScale(span, f) +
                  side * (f.auxWidth ?? 0),
                0.018,
              ),
            );
        if (last - first > 0.04)
          builder.strip("marking", "paint", edge(-0.065), edge(0.065), true);
      } else ribbon(builder, span, first, last, offset, 0.13);
    }
  for (
    let lane = 1;
    lane < road.lanes &&
    road.markingStyle !== "race" &&
    !road.sharedCycleStreet;
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
      ribbon(builder, span, from, to, offset - 0.12, 0.1, "paint");
      ribbon(builder, span, from, to, offset + 0.12, 0.1, "paint");
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
  for (const crossing of crossingStations(span, project)) {
    if (end - start > 14) {
      const s = crossing.s - crossing.direction * (road.rampWidth / 2 + 0.8);
      const incoming = motorLanes(road).filter(
        (l) => l.direction === crossing.direction,
      );
      for (const lane of incoming)
        ribbon(
          builder,
          span,
          s - 0.18,
          s + 0.18,
          lane.offset,
          road.laneWidth - 0.1,
        );
    }
    crosswalk(builder, span, crossing.s);
  }
  if (
    road.markingStyle === "urban" &&
    !road.sharedCycleStreet &&
    end - start > 32
  ) {
    const draw = (s: number, dir: number) => {
      const f = frameAt(span, s);
      const shape: [number, number][] = [
        [-0.12, -1.5],
        [0.12, -1.5],
        [0.12, 0.3],
        [0.48, 0.3],
        [0, 1.3],
        [-0.48, 0.3],
        [-0.12, 0.3],
      ];
      for (const lane of motorLanes(road).filter(
        (l) => !l.bus && l.direction === dir,
      ))
        builder.polygon(
          "marking",
          "paint",
          shape.map(([x, ds]) => {
            const at = frameAt(span, s + ds * dir);
            return surfacePoint(
              at,
              (lane.offset + x) * sectionScale(span, at),
              0.024,
            );
          }),
          undefined,
          true,
        );
    };
    if (span.startJoint && !road.oneWay) draw(start + 12, -1);
    if (span.endJoint) draw(end - 12, 1);
    else if (span.startJoint && road.oneWay) draw(start + 12, 1);
  }
}

function buildRails(builder: MeshBuilder, span: RoadSpan) {
  if (!span.road.guardrails) return;
  for (const side of [-1, 1])
    for (const [a, z] of clearRuns(span, side)) {
      const frames = [
        frameAt(span, a),
        ...span.frames.filter((f) => f.s > a && f.s < z),
        frameAt(span, z),
      ];
      buildBarrierPath(
        builder,
        frames.map((f) => edgePoint(f, side, "outer")),
        frames.map((f) => mul(f.n, side)),
        () => span.road.railHeight,
        span.road.railStyle,
        span.road.postSpacing,
        span.detail,
      );
    }
}
function addInlet(
  builder: MeshBuilder,
  span: RoadSpan,
  station: number,
  side: number,
): UtilityFeature {
  const f = frameAt(span, station),
    offset = side * (sideHalfWidth(f, side) - 0.28);
  addGratedInlet(builder, roadSampler(span, station, offset));
  return {
    id: `${builder.owner}:inlet:${side}:${Math.round(station * 100)}`,
    owner: builder.owner,
    ownerKind: builder.ownerKind,
    kind: "curb-inlet",
    style: "grate",
    position: surfacePoint(f, offset, 0.015),
  };
}
function buildDrainage(
  builder: MeshBuilder,
  span: RoadSpan,
  services: UtilityFeature[],
) {
  if (!span.road.drainage) return 0;
  let inlets = 0;
  for (const side of [-1, 1]) {
    const a = span.frames.map((f) =>
        surfacePoint(f, side * (sideHalfWidth(f, side) - 0.035), 0.004),
      ),
      b = span.frames.map((f) =>
        surfacePoint(f, side * (sideHalfWidth(f, side) - 0.15), 0.004),
      );
    builder.strip("gutter", "gutter", a, b, true);
    if (span.road.drainageType !== "curb")
      services.push(buildLinearDrain(builder, span, side));
    if (
      span.road.drainageType !== "linear" &&
      (span.road.curbDrainType !== "hollow" || span.frames[0].curbHeight < 0.11)
    )
      for (const inlet of (span.footway?.inlets ?? []).filter(
        (i) => i.side === side,
      )) {
        if (
          span.road.curbDrainType === "side-entry" &&
          services.some(
            (s) =>
              s.style === "side-entry" &&
              s.id.endsWith(`${side}:${Math.round(inlet.s * 100)}`),
          )
        )
          continue;
        services.push(addInlet(builder, span, inlet.s, side));
        inlets++;
      }
  }
  return inlets;
}
function buildSpan(span: RoadSpan, project: Project) {
  const b = new MeshBuilder(span.road.id, "road"),
    frames = span.frames,
    road = span.road;
  const center = frames.map((f) => surfacePoint(f, 0)),
    left = frames.map((f) => edgePoint(f, 1, "road")),
    right = frames.map((f) => edgePoint(f, -1, "road"));
  b.strip("asphalt", roadMaterial(road), left, center, true);
  b.strip("asphalt", roadMaterial(road), center, right, true);
  const footwayResult = buildSpanFootways(b, span, project);
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
          [top[i + 1][0], f.p[1] - (f.roadBaseDepth ?? 0.48), top[i + 1][2]],
          [top[i][0], f.p[1] - (f.roadBaseDepth ?? 0.48), top[i][2]],
        ]);
    }
  const embankments = buildApproachFill(b, span);
  const mobility = buildRoadMobility(b, span);
  buildMarkings(b, span, project);
  const auxiliaryLane = buildAuxiliaryLane(b, span);
  const refuges = buildMedian(b, span, project);
  const streetDetails = [...streetFeatures(span, project), ...refuges];
  const roadsideParking = buildParallelParking(b, span);
  buildRoadFurniture(b, span, project);
  buildRails(b, span);
  const services = [...footwayResult.services, ...buildRoadManholes(b, span)],
    inlets = buildDrainage(b, span, services);
  return {
    meshes: b.output(),
    inlets,
    services,
    streetDetails,
    roadsideParking,
    embankments,
    auxiliaryLane,
    footways: footwayResult.features,
    plantings: footwayResult.plantings,
    mobility,
  };
}
/** Public corner sampler; topology/offsets use the same analytic construction. */
export function cornerCurve(
  a: V3,
  da: V3,
  b: V3,
  db: V3,
  requestedRadius: number,
  detail: GeometryDetail = "editing",
): V3[] {
  return cornerPath(a, da, b, db, requestedRadius, detail).points;
}
function buildCornerRails(
  builder: MeshBuilder,
  curve: V3[],
  a: Arm,
  b: Arm,
  normals: V3[],
  detail: GeometryDetail,
) {
  if (!a.road.guardrails || !b.road.guardrails) return;
  const height = (t: number) =>
      a.road.railHeight * (1 - t) + b.road.railHeight * t,
    spacing = (a.road.postSpacing + b.road.postSpacing) / 2;
  if (a.road.railStyle === b.road.railStyle) {
    buildBarrierPath(
      builder,
      curve,
      normals,
      height,
      a.road.railStyle,
      spacing,
      detail,
    );
    return;
  }
  const i = Math.floor(curve.length / 2);
  buildBarrierPath(
    builder,
    curve.slice(0, i + 1),
    normals.slice(0, i + 1),
    (t) => height(t * 0.5),
    a.road.railStyle,
    spacing,
    detail,
  );
  buildBarrierPath(
    builder,
    curve.slice(i),
    normals.slice(i),
    (t) => height(0.5 + t * 0.5),
    b.road.railStyle,
    spacing,
    detail,
  );
  const d = normalizeXZ(
    sub(curve[Math.min(i + 1, curve.length - 1)], curve[Math.max(0, i - 1)]),
  );
  builder.box(
    "rail",
    "steel",
    add(curve[i], [0, height(0.5) - 0.04, 0]),
    0.21,
    0.18,
    0.45,
    d,
  );
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
    corners: V3[][] = [],
    pavedCorners: V3[][] = [],
    paths: CornerPath[] = [];
  const material = arms.reduce(
    (a, r) => (r.road.lanes > a.road.lanes ? r : a),
    arms[0],
  );
  const junctionRoad = material.road,
    asphaltMaterial = roadMaterial(junctionRoad);
  const radius = effectiveCornerRadius(
    node.radius,
    arms.map((a) => a.frame),
  );
  const baseDepth =
    arms.some((a) => bridgeAt(a.road, a.isStart ? 0 : 1)) &&
    node.position[1] > 1.6
      ? 0.28
      : 0.48;
  let inlets = 0;
  const services: UtilityFeature[] = [];
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i],
      next = arms[(i + 1) % arms.length],
      path = cornerPath(a.left, a.d, next.right, next.d, radius, detail),
      curve = path.points;
    const curbIn = curve.map((p, k) =>
      add(p, [
        0,
        a.frame.curbHeight +
          (next.frame.curbHeight - a.frame.curbHeight) * path.fractions[k],
        0,
      ]),
    );
    curbIn[0] = armPart(a, 1, "curbIn");
    curbIn[curbIn.length - 1] = armPart(next, -1, "curbIn");
    const curbOut = offsetCornerPath(
      path,
      armPart(a, 1, "curbOut"),
      armPart(next, -1, "curbOut"),
      a.frame.cw,
      next.frame.cw,
    );
    const paved = offsetCornerPath(
      path,
      a.outerLeft,
      next.outerRight,
      a.frame.cw + a.frame.sw,
      next.frame.cw + next.frame.sw,
    );
    buildCornerRails(b, paved, a, next, path.normals, detail);
    corners.push(curve);
    pavedCorners.push(paved);
    paths.push(path);
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
      (p) => [p[0], node.position[1] - baseDepth, p[2]] as V3,
    );
    bottom[0] = armPart(a, 1, "bottom");
    bottom[bottom.length - 1] = armPart(next, -1, "bottom");
    b.strip("structure", "road-base", paved, bottom);
    if (
      a.road.drainage &&
      a.road.drainageType !== "linear" &&
      a.road.curbDrainType === "grate"
    ) {
      const span = spans.find((s) => s.road.id === a.road.id)!;
      const station = a.isStart
        ? span.frames[0].s + 1.2
        : span.frames.at(-1)!.s - 1.2;
      if (span.length > 3) {
        services.push(addInlet(b, span, station, a.isStart ? 1 : -1));
        inlets++;
      }
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
  const mobility = buildJunctionMobility(
    b,
    node,
    arms,
    paths,
    b.output().filter((m) => m.kind === "asphalt"),
  );
  const splitters = buildJunctionMarkings(
    b,
    node,
    arms,
    b.target("asphalt", asphaltMaterial),
    paths,
  );
  buildTrafficSignals(b, node, arms);
  const bottom = outer.map(
    (p) => [p[0], node.position[1] - baseDepth, p[2]] as V3,
  );
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
    add(node.position, [0, -baseDepth, 0]),
    false,
  );
  const embankment = buildRetainedJoint(
    b,
    node.id,
    bottom,
    arms.some((a) => a.road.embankment) &&
      !arms.some((a) => bridgeAt(a.road, a.isStart ? 0 : 1)),
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
    junction: {
      node,
      arms,
      boundary,
      outer,
      corners,
      pavedCorners,
      type,
      valid,
      radius,
      requestedRadius: node.radius,
      cornerRadii: paths.map((p) => p.radius),
    },
    meshes: b.output(),
    inlets,
    services,
    mobility,
    splitters,
    bottom,
    embankment,
  };
}
/** Short mouths cannot contain an arbitrarily wide inward offset. Fit the
 * shared approach footway once, then taper it along the road before meshing;
 * pinning a 12 m end onto a 2 m fillet would otherwise create another spike. */
function fitJunctionFootways(
  nodes: RoadNode[],
  spans: RoadSpan[],
  diagnostics: Diagnostic[],
) {
  const caps = new Map<Frame, { sw: number; cw: number }>();
  for (const node of nodes) {
    const arms = spans
      .filter((s) => s.road.start === node.id || s.road.end === node.id)
      .map((s) => makeArm(s, node))
      .sort((a, z) => a.angle - z.angle);
    if (arms.length < 2) continue;
    const radius = effectiveCornerRadius(
      node.radius,
      arms.map((a) => a.frame),
    );
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i],
        z = arms[(i + 1) % arms.length],
        path = cornerPath(a.left, a.d, z.right, z.d, radius, "production"),
        limit = Math.min(...path.insetLimits);
      if (!Number.isFinite(limit)) continue;
      for (const arm of [a, z]) {
        const f = arm.frame,
          prior = caps.get(f) ?? { sw: f.sw, cw: f.cw },
          cw = Math.min(prior.cw, Math.max(0.03, limit * 0.25)),
          sw = Math.min(prior.sw, Math.max(0.08, limit - cw - 0.4));
        caps.set(f, { sw, cw });
      }
    }
  }
  for (const span of spans) {
    const first = span.frames[0],
      last = span.frames.at(-1)!,
      a = caps.get(first) ?? { sw: first.sw, cw: first.cw },
      z = caps.get(last) ?? { sw: last.sw, cw: last.cw };
    let limited = false;
    for (const f of span.frames) {
      const sw = Math.min(
          f.sw,
          a.sw + (f.s - first.s) * 0.65,
          z.sw + (last.s - f.s) * 0.65,
        ),
        cw = Math.min(
          f.cw,
          a.cw + (f.s - first.s) * 0.05,
          z.cw + (last.s - f.s) * 0.05,
        );
      if (sw < f.sw - 0.01 || cw < f.cw - 0.01) limited = true;
      f.sw = sw;
      f.cw = cw;
    }
    if (limited)
      diagnostics.push({
        owner: span.road.id,
        level: "warning",
        message: `${span.road.name}: footways tapered to fit a short junction approach. Lengthen the road to retain the requested width.`,
      });
  }
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
    if (estimate > 32000)
      throw new RangeError(
        "Production geometry budget: 32 km of control-polygon length per editor tile. Export larger worlds as separate tiles.",
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
    junctions: Junction[] = [],
    services: UtilityFeature[] = [],
    footways: FootwayFeature[] = [],
    plantings: PlantingFeature[] = [],
    blocks: BlockFeature[] = [],
    mobility: MobilityFeature[] = [],
    bridges: BridgeFeature[] = [],
    streetDetails: StreetFeature[] = [],
    roadsideParking: RoadsideParkingBay[] = [],
    embankments: EmbankmentFeature[] = [],
    auxiliaryLanes: AuxiliaryLaneFeature[] = [],
    splitters: SplitterFeature[] = [],
    bridgeJoints: { node: RoadNode; arms: Arm[]; bottom: V3[] }[] = [];
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
    const stations = trimmedStations(alignment, start, end),
      stationFirst = stations[0].s,
      stationLast = stations.at(-1)!.s;
    if (road.bridge)
      for (const t of [road.bridgeFrom, road.bridgeTo]) {
        const s = parameterStation(alignment, t);
        if (
          s > stationFirst + 1e-7 &&
          s < stationLast - 1e-7 &&
          !stations.some((f) => Math.abs(f.s - s) < 1e-7)
        )
          stations.push(stationAt(alignment, s));
      }
    if (road.auxiliaryLane !== "none" && supportsAuxiliary(road)) {
      const { run, taper, scale } = auxiliaryDimensions(road, alignment.length);
      const knots =
        road.auxiliaryLane === "exit"
          ? [alignment.length - run - taper, alignment.length - run]
          : [run, run + taper];
      for (const s of knots)
        if (
          s > stationFirst + 1e-7 &&
          s < stationLast - 1e-7 &&
          !stations.some((f) => Math.abs(f.s - s) < 1e-7)
        )
          stations.push(stationAt(alignment, s));
      if (scale < 0.999)
        diagnostics.push({
          owner: road.id,
          level: "warning",
          message: `${road.name}: speed-change lane/taper shortened to fit. Lengthen the alignment to retain the requested ${road.auxiliaryLength + road.auxiliaryTaper} m.`,
        });
    }
    stations.sort((a, b) => a.s - b.s);
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
    const frames = makeFrames(
      stations,
      road,
      diagnostics,
      project,
      jointIDs.has(road.start),
      jointIDs.has(road.end),
      alignment.length,
    );
    const span: RoadSpan = {
      road,
      detail,
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
  }
  fitJunctionFootways(jointNodes, spans, diagnostics);
  for (const span of spans) {
    const road = span.road;
    span.footway = prepareFootways(span, project);
    if (
      span.footway.ramps.filter((a) => a.kind === "driveway").length <
      road.driveways.length
    )
      diagnostics.push({
        owner: road.id,
        level: "warning",
        message: `${road.name}: an entry is too close to a junction, overlaps another ramp, or needs a wider non-bridge sidewalk. Move the entry or widen the footway.`,
      });
    const result = buildSpan(span, project);
    meshes.push(...result.meshes);
    inlets += result.inlets;
    services.push(...result.services);
    footways.push(...result.footways);
    plantings.push(...result.plantings);
    mobility.push(...result.mobility);
    streetDetails.push(...result.streetDetails);
    roadsideParking.push(...result.roadsideParking);
    embankments.push(...result.embankments);
    if (result.auxiliaryLane) auxiliaryLanes.push(result.auxiliaryLane);
  }
  for (const node of jointNodes) {
    const result = buildJunction(
      node,
      spans.filter((s) => s.road.start === node.id || s.road.end === node.id),
      diagnostics,
      detail,
    );
    junctions.push(result.junction);
    if (result.embankment) embankments.push(result.embankment);
    bridgeJoints.push({
      node,
      arms: result.junction.arms,
      bottom: result.bottom,
    });
    mobility.push(...result.mobility);
    splitters.push(...result.splitters);
    meshes.push(...result.meshes);
    inlets += result.inlets;
    services.push(...result.services);
  }
  if (maxGrade > 14)
    diagnostics.push({
      level: "warning",
      message: `Maximum grade is ${maxGrade.toFixed(1)}%. Lengthen the approach or reduce its elevation.`,
      owner: "",
    });
  const clearances: { a: string; b: string; meters: number }[] = [];
  for (const site of project.sites ?? []) {
    meshes.push(...buildSiteGeometry(site, services, plantings, blocks));
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
    const contains = (p: V3) =>
      site.kind === "urban-block"
        ? blockSolidAt(site, p)
        : insidePolygon(p, footprint);
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
            contains(f.p) ||
            contains(edgePoint(f, -1, "road")) ||
            contains(edgePoint(f, 1, "road"))
          );
        }),
      ) ||
      junctions.some(
        (j) =>
          Math.abs(j.node.position[1] - site.position[1]) < 0.7 &&
          (contains(j.node.position) ||
            footprint.some((p) => contains(p) && insidePolygon(p, j.boundary))),
      );
    if (hits)
      diagnostics.push({
        level: "warning",
        message: `${site.name}: footprint encroaches into a driveable road. Move or resize the site.`,
        owner: site.id,
      });
  }
  // Structural supports come after the complete road/site surfaces, so their
  // exclusion masks use real junction returns and clipped plot/parking bands.
  if (spans.some((s) => s.road.bridge)) {
    const regions = spans
      .filter((s) => s.road.bridge)
      .map((s) => {
        const x = s.frames.map((f) => f.p[0]),
          z = s.frames.map((f) => f.p[2]),
          margin = Math.max(
            3,
            ...s.frames.map(
              (f) =>
                Math.max(sideHalfWidth(f, -1), sideHalfWidth(f, 1)) * 0.8 + 2,
            ),
          );
        return {
          minX: Math.min(...x) - margin,
          maxX: Math.max(...x) + margin,
          minZ: Math.min(...z) - margin,
          maxZ: Math.max(...z) + margin,
          maxY:
            Math.max(...s.frames.map((f) => f.p[1])) -
            s.road.bridgeDepth +
            0.02,
        };
      });
    for (const j of bridgeJoints.filter((j) =>
      j.arms.some((a) => a.road.bridge),
    )) {
      const margin = Math.max(
        3,
        ...j.arms.map(
          (a) =>
            Math.max(sideHalfWidth(a.frame, -1), sideHalfWidth(a.frame, 1)) *
              0.8 +
            2,
        ),
      );
      regions.push({
        minX: j.node.position[0] - margin,
        maxX: j.node.position[0] + margin,
        minZ: j.node.position[2] - margin,
        maxZ: j.node.position[2] + margin,
        maxY:
          j.node.position[1] -
          Math.max(
            ...j.arms
              .filter((a) => a.road.bridge)
              .map((a) => a.road.bridgeDepth),
          ) +
          0.02,
      });
    }
    const surfaces = new SupportSurfaceIndex(meshes, regions),
      allAlignments = [...alignments.values()];
    for (const span of spans.filter((s) => s.road.bridge)) {
      const builder = new MeshBuilder(span.road.id, "road"),
        bridge = buildBridgeSpan(
          builder,
          span,
          project,
          allAlignments,
          surfaces,
        );
      meshes.push(...builder.output());
      if (bridge) bridges.push(bridge);
    }
    for (const { node, arms, bottom } of bridgeJoints) {
      const builder = new MeshBuilder(node.id, "node"),
        bridge = buildBridgeJoint(
          builder,
          node,
          arms,
          bottom,
          allAlignments,
          surfaces,
        );
      meshes.push(...builder.output());
      if (bridge) bridges.push(bridge);
    }
  }
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
      upperSpan = spans.find((s) => s.road.id === upper.id),
      depth =
        bridgeAt(upper, ay > by ? crossing.ta : crossing.tb) && upperSpan
          ? bridgeDepthAt(
              upperSpan,
              stationForParameter(
                upperSpan,
                ay > by ? crossing.ta : crossing.tb,
              ),
              bridges,
            )
          : 0.48,
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
    designReview: reviewDesign(project, clearances, bridges, splitters),
    embankments,
    auxiliaryLanes,
    detail,
    footways,
    plantings,
    blocks,
    mobility,
    bridges,
    streetDetails,
    roadsideParking,
    splitters,
    barriers: [
      ...spans
        .filter((s) => s.road.guardrails)
        .map((s) => ({
          owner: s.road.id,
          ownerKind: "road" as const,
          style: s.road.railStyle,
          length: s.length,
          height: s.road.railHeight,
          postSpacing: s.road.postSpacing,
          sides: 2,
          physicalGeometry: true as const,
        })),
      ...junctions.flatMap((j) =>
        j.arms.flatMap((a, i) => {
          const z = j.arms[(i + 1) % j.arms.length],
            points = j.pavedCorners[i];
          if (!a.road.guardrails || !z.road.guardrails) return [];
          return [
            {
              owner: j.node.id,
              ownerKind: "node" as const,
              style: a.road.railStyle,
              ...(a.road.railStyle !== z.road.railStyle
                ? { transitionTo: z.road.railStyle }
                : {}),
              length: points
                .slice(1)
                .reduce((s, p, i) => s + distance(p, points[i]), 0),
              height: (a.road.railHeight + z.road.railHeight) / 2,
              postSpacing: (a.road.postSpacing + z.road.postSpacing) / 2,
              sides: 1,
              physicalGeometry: true as const,
            },
          ];
        }),
      ),
    ],
    spans,
    junctions,
    meshes,
    diagnostics,
    length,
    inlets: services
      .filter((s) => s.kind === "curb-inlet")
      .reduce((n, s) => n + (s.ports ?? 1), 0),
    maxGrade,
    clearances,
    services,
    manholes: services.filter((s) => s.kind === "manhole").length,
    parkingSpaces:
      roadsideParking.length +
      (project.sites ?? [])
        .filter((s) => s.kind === "parking")
        .reduce((sum, s) => sum + parkingLayout(s).length, 0),
    bounds: { min, max },
    triangles: meshes.reduce((s, m) => s + m.indices.length / 3, 0),
    vertices: meshes.reduce((s, m) => s + m.positions.length / 3, 0),
  };
}
