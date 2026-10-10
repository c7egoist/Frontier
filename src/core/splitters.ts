import { meshSurfaceY } from "./road-details";
import type { Arm, MeshData } from "./geometry";
import type { CornerPath } from "./corners";
import type { RoadNode } from "./model";
import { add, mul, sub, normalizeXZ, normalXZ, dotXZ, type V3 } from "./math";
export interface SplitterFeature {
  owner: string;
  corner: number;
  gap: number;
  curbRadius: number;
  pavingNose: V3;
  paintedTip: V3;
  paintedEnd: V3;
  length: number;
  halfWidth: number;
  direction: V3;
  outline: V3[];
}
/** Gores derive from the sampled, actual curb tip. They always stop before
 * that physical nose, and their width is gated by the triangulated asphalt. */
export function splitterLayout(
  node: RoadNode,
  arms: Arm[],
  paths: CornerPath[],
  surface: MeshData,
): SplitterFeature[] {
  const features: SplitterFeature[] = [];
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i],
      z = arms[(i + 1) % arms.length],
      gap = (z.angle - a.angle + Math.PI * 2) % (Math.PI * 2),
      path = paths[i];
    if (
      !path ||
      !a.road.markings ||
      !z.road.markings ||
      gap > Math.PI * 0.29 ||
      gap < 0.015
    )
      continue;
    const direction = normalizeXZ(add(a.d, z.d)),
      normal = normalXZ(direction),
      projection = (p: V3) => dotXZ(sub(p, node.position), direction),
      pavingNose = path.points.reduce((p, q) =>
        projection(p) < projection(q) ? p : q,
      ),
      reach = projection(pavingNose),
      length = Math.min(18, reach * 0.45);
    if (length < 3.5) continue;
    const paintedEnd = add(pavingNose, mul(direction, -1.6)),
      paintedTip = add(paintedEnd, mul(direction, -length));
    if (
      meshSurfaceY(surface, paintedTip) === undefined ||
      meshSurfaceY(surface, paintedEnd) === undefined
    )
      continue;
    let halfWidth = Math.min(1.7, (a.road.laneWidth + z.road.laneWidth) / 4);
    while (
      halfWidth > 0.35 &&
      [-1, 1].some(
        (side) =>
          meshSurfaceY(
            surface,
            add(paintedEnd, mul(normal, side * (halfWidth + 0.1))),
          ) === undefined,
      )
    )
      halfWidth -= 0.1;
    if (halfWidth <= 0.35) continue;
    const outline = [
      paintedTip,
      add(paintedEnd, mul(normal, halfWidth)),
      add(paintedEnd, mul(normal, -halfWidth)),
    ];
    features.push({
      owner: node.id,
      corner: i,
      gap,
      curbRadius: path.radius,
      pavingNose: [...pavingNose],
      paintedTip,
      paintedEnd,
      length,
      halfWidth,
      direction,
      outline,
    });
  }
  return features;
}
