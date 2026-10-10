import { supportsAuxiliary, auxiliaryDimensions } from "./road-sections";
import {
  frameAt,
  surfacePoint,
  ribbon,
  arrow,
  type MeshBuilder,
  type RoadSpan,
} from "./geometry";
import { sectionScale } from "./street-details";
import type { V3 } from "./math";

export interface AuxiliaryLaneFeature {
  owner: string;
  kind: "entry" | "exit";
  side: -1 | 1;
  laneWidth: number;
  fullWidthLength: number;
  taperLength: number;
  startStation: number;
  endStation: number;
  requestedStartStation: number;
  requestedEndStation: number;
  meshedFullWidthLength: number;
  meshedTaperLength: number;
  junctionContinuation: {
    node: string;
    end: "start" | "end";
    length: number;
  }[];
  start: V3;
  end: V3;
  fitted: boolean;
  physicalGeometry: true;
}
export function buildAuxiliaryLane(
  b: MeshBuilder,
  span: RoadSpan,
): AuxiliaryLaneFeature | undefined {
  const r = span.road;
  if (!supportsAuxiliary(r) || r.auxiliaryLane === "none") return;
  const { run, taper, scale } = auxiliaryDimensions(r, span.alignment.length),
    side = r.trafficSide === "left" ? -1 : 1,
    start =
      r.auxiliaryLane === "exit" ? span.alignment.length - run - taper : 0,
    end = r.auxiliaryLane === "exit" ? span.alignment.length : run + taper,
    first = Math.max(span.frames[0].s, start),
    last = Math.min(span.frames.at(-1)!.s, end),
    motor = (r.lanes * r.laneWidth + r.median) / 2;
  if (last - first < 0.04) return;
  if (r.markings && last > first) {
    for (let s = first; s < last - 0.3; s += 10) {
      const a = frameAt(span, s),
        z = frameAt(span, Math.min(last, s + 5));
      if (Math.min(a.auxWidth ?? 0, z.auxWidth ?? 0) < 0.3) continue;
      ribbon(b, span, s, Math.min(last, s + 5), side * (motor + 0.065), 0.13);
    }
    const s = r.auxiliaryLane === "exit" ? last - 18 : first + 18,
      f = frameAt(span, s);
    if (s >= first && s <= last && (f.auxWidth ?? 0) > r.laneWidth * 0.95)
      arrow(
        b,
        f,
        side * (motor * sectionScale(span, f) + (f.auxWidth ?? 0) / 2),
        1,
      );
  }
  const point = (s: number) => {
    const f = frameAt(span, s);
    return surfacePoint(
      f,
      side * (motor * sectionScale(span, f) + (f.auxWidth ?? 0) / 2),
    );
  };
  const overlap = (a: number, z: number) =>
      Math.max(0, Math.min(z, last) - Math.max(a, first)),
    length = span.alignment.length,
    meshedFullWidthLength =
      r.auxiliaryLane === "exit"
        ? overlap(length - run, length)
        : overlap(0, run),
    meshedTaperLength =
      r.auxiliaryLane === "exit"
        ? overlap(length - run - taper, length - run)
        : overlap(run, run + taper),
    junctionContinuation: AuxiliaryLaneFeature["junctionContinuation"] = [];
  if (span.startJoint && first > start + 1e-7)
    junctionContinuation.push({
      node: r.start,
      end: "start",
      length: first - start,
    });
  if (span.endJoint && end > last + 1e-7)
    junctionContinuation.push({ node: r.end, end: "end", length: end - last });
  return {
    owner: r.id,
    kind: r.auxiliaryLane,
    side,
    laneWidth: r.laneWidth,
    fullWidthLength: run,
    taperLength: taper,
    startStation: first,
    endStation: last,
    requestedStartStation: start,
    requestedEndStation: end,
    meshedFullWidthLength,
    meshedTaperLength,
    junctionContinuation,
    start: point(first),
    end: point(last),
    fitted: scale < 0.999,
    physicalGeometry: true,
  };
}
