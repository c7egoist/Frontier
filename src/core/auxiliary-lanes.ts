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
  return {
    owner: r.id,
    kind: r.auxiliaryLane,
    side,
    laneWidth: r.laneWidth,
    fullWidthLength: run,
    taperLength: taper,
    startStation: start,
    endStation: end,
    start: point(first),
    end: point(last),
    fitted: scale < 0.999,
    physicalGeometry: true,
  };
}
