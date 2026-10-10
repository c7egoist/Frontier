import { parameterStation } from "./bridge-profile";
/** Published geometric references inform these editable game-asset defaults.
 * They are not a site-specific civil, structural, traffic-capacity or safety approval.
 */
import {
  controlPoints,
  connected,
  getNode,
  type Project,
  type Road,
} from "./model";
import {
  derivative,
  distanceXZ,
  normalizeXZ,
  dotXZ,
  sub,
  type V3,
} from "./math";
import { sampleAlignment } from "./curves";

import { designSources, referenceLayout, type RoadClass } from "./design-basis";
export {
  designSources,
  referenceLayout,
  roadClasses,
  type RoadClass,
} from "./design-basis";

export interface RoadDesignMeasure {
  owner: string;
  role: RoadClass;
  planLength: number;
  minimumRadius: number | null;
  maximumGrade: number;
  laneWidth: number;
  shoulderWidth: number;
  radiusTarget: number;
  gradeTarget: number;
  widthTarget: number;
  meetsReference: boolean;
}
export interface WeaveMeasure {
  merge: string;
  diverge: string;
  owners: string[];
  nodeSpacing: number;
  noseSpacing: number;
  mergeNose: V3;
  divergeNose: V3;
}
export interface DesignReview {
  units: "metres";
  basis: "Reference-scaled game geometry, not civil certification";
  sources: typeof designSources;
  roads: RoadDesignMeasure[];
  bridgeLength: number;
  minimumClearance: number | null;
  clearanceTarget: number;
  withinSelectedTargets: boolean;
  weaves: WeaveMeasure[];
  extent: [number, number];
  limitations: string[];
}
export function curveDesignMetrics(points: V3[]) {
  let minimumRadius = Infinity,
    maximumGrade = 0,
    planLength = 0;
  let previous = points[0];
  // Evaluate the cubic itself, not the preview's sparse/chordal frame mesh.
  // Including endpoints detects tiny off-ramp/merge radii previously missed.
  const count = 512;
  for (let i = 0; i <= count; i++) {
    const t = i / count,
      u = 1 - t,
      d = derivative(points, t),
      dd = points[0].map(
        (_, k) =>
          6 *
          (u * (points[2][k] - 2 * points[1][k] + points[0][k]) +
            t * (points[3][k] - 2 * points[2][k] + points[1][k])),
      ) as V3,
      speed = Math.hypot(d[0], d[2]),
      cross = Math.abs(d[0] * dd[2] - d[2] * dd[0]);
    if (speed > 1e-8) {
      maximumGrade = Math.max(maximumGrade, (100 * Math.abs(d[1])) / speed);
      if (cross > 1e-8)
        minimumRadius = Math.min(minimumRadius, speed ** 3 / cross);
    }
    const point = points[0].map(
      (_, k) =>
        u ** 3 * points[0][k] +
        3 * u * u * t * points[1][k] +
        3 * u * t * t * points[2][k] +
        t ** 3 * points[3][k],
    ) as V3;
    if (i) planLength += distanceXZ(previous, point);
    previous = point;
  }
  return {
    planLength,
    minimumRadius: Number.isFinite(minimumRadius) ? minimumRadius : null,
    maximumGrade,
  };
}
export function measureRoadDesign(
  project: Project,
  r: Road,
): RoadDesignMeasure {
  const role = r.roadClass,
    metric = curveDesignMetrics(controlPoints(project, r)),
    radiusTarget =
      role === "loop"
        ? r.speedLimit >= 50
          ? 100
          : 65
        : role === "mainline"
          ? r.speedLimit >= 100
            ? 600
            : r.speedLimit >= 80
              ? 400
              : 260
          : r.speedLimit >= 70
            ? 260
            : 150,
    gradeTarget =
      role === "mainline"
        ? referenceLayout.mainGrade
        : referenceLayout.rampGrade,
    widthTarget = role === "loop" ? 4.57 : 3.65;
  return {
    owner: r.id,
    role,
    ...metric,
    laneWidth: r.laneWidth,
    shoulderWidth: r.shoulderWidth,
    radiusTarget,
    gradeTarget,
    widthTarget,
    meetsReference:
      (metric.minimumRadius === null ||
        metric.minimumRadius >= radiusTarget - 0.1) &&
      metric.maximumGrade <= gradeTarget + 0.05 &&
      r.laneWidth >= widthTarget - 0.01,
  };
}
export function measureWeaves(
  project: Project,
  splitters: { owner: string; pavingNose: V3 }[],
): WeaveMeasure[] {
  const out: WeaveMeasure[] = [];
  for (const merge of project.nodes) {
    const incident = connected(project, merge.id);
    if (!incident.some((r) => r.roadClass === "loop" && r.end === merge.id))
      continue;
    const nose = splitters.find((s) => s.owner === merge.id)?.pavingNose;
    if (!nose) continue;
    let cursor = merge.id,
      steps = 0,
      planLength = 0;
    const owners: string[] = [];
    let firstDirection: V3 | undefined, lastDirection: V3 | undefined;
    while (steps++ < project.roads.length) {
      const r = project.roads.find(
        (r) => r.roadClass === "collector" && r.start === cursor,
      );
      if (!r || owners.includes(r.id)) break;
      const points = controlPoints(project, r);
      firstDirection ??= normalizeXZ(derivative(points, 0));
      lastDirection = normalizeXZ(derivative(points, 1));
      planLength += curveDesignMetrics(points).planLength;
      owners.push(r.id);
      cursor = r.end;
      if (
        connected(project, cursor).some(
          (r) => r.roadClass === "loop" && r.start === cursor,
        )
      ) {
        const diverge = getNode(project, cursor),
          end = splitters.find((s) => s.owner === cursor)?.pavingNose;
        if (end)
          out.push({
            merge: merge.id,
            diverge: cursor,
            owners,
            nodeSpacing: planLength,
            noseSpacing:
              planLength +
              Math.max(0, dotXZ(sub(merge.position, nose), firstDirection)) +
              Math.max(0, dotXZ(sub(end, diverge.position), lastDirection)),
            mergeNose: [...nose],
            divergeNose: [...end],
          });
        break;
      }
    }
  }
  return out;
}
export function reviewDesign(
  project: Project,
  clearances: { meters: number }[],
  bridges?: { spanLengths?: number[]; kind: "span" | "joint" }[],
  splitters: { owner: string; pavingNose: V3 }[] = [],
): DesignReview {
  const xs = project.nodes.map((n) => n.position[0]),
    zs = project.nodes.map((n) => n.position[2]);
  const roads = project.roads
    .filter((r) => r.roadClass !== "street")
    .map((r) => measureRoadDesign(project, r));
  return {
    units: "metres",
    basis: "Reference-scaled game geometry, not civil certification",
    sources: designSources,
    roads,
    clearanceTarget: referenceLayout.clearance,
    withinSelectedTargets:
      roads.every((r) => r.meetsReference) &&
      clearances.every((c) => c.meters >= referenceLayout.clearance),
    weaves: measureWeaves(project, splitters),
    bridgeLength: bridges
      ? bridges
          .filter((b) => b.kind === "span")
          .reduce(
            (s, b) => s + (b.spanLengths ?? []).reduce((v, l) => v + l, 0),
            0,
          )
      : project.roads
          .filter((r) => r.bridge)
          .reduce((s, r) => {
            const a = sampleAlignment(project, r);
            return (
              s +
              parameterStation(a, r.bridgeTo) -
              parameterStation(a, r.bridgeFrom)
            );
          }, 0),
    minimumClearance: clearances.length
      ? Math.min(...clearances.map((c) => c.meters))
      : null,
    extent: xs.length
      ? [Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)]
      : [0, 0],
    limitations: [
      "Chosen template cross-sections are editable assumptions, not universal jurisdiction standards.",
      "Traffic demand, queue storage, weaving capacity, stopping/decision sight distance and superelevation require site-specific review.",
      "Bridge members and foundations are geometric assets, not structural load designs.",
    ],
  };
}
