import { SupportSurfaceIndex, supportOutline } from "./support-surfaces";
import earcut from "earcut";
import {
  frameAt,
  edgePoint,
  type MeshBuilder,
  type RoadSpan,
  type Frame,
  type Arm,
} from "./geometry";
import { connected, roadHalfWidth, type Project, type RoadNode } from "./model";
import { closestOnAlignment, type Alignment } from "./curves";
import {
  add,
  mul,
  sub,
  normalizeXZ,
  normalXZ,
  distanceXZ,
  type V3,
} from "./math";

export interface BridgeSupport {
  position: V3;
  top: number;
  footprint: [number, number];
  kind: "pier" | "portal";
}
export interface BridgeFeature {
  owner: string;
  ownerKind: "road" | "node";
  kind: "span" | "joint";
  material: "steel" | "concrete";
  depth: number;
  pierSpacing: number;
  connections: string[];
  start: V3;
  end: V3;
  supports: BridgeSupport[];
  excludedSupports: V3[];
  members?: {
    road: string;
    material: "steel" | "concrete";
    mouthDepth: number;
    jointDepth: number;
  }[];
  physicalGeometry: true;
}
/** Rebuild-time clearance gate includes lower bridge ramps, cycle tracks and
 * footways, plus the FULL foundation footprint — not just the column centre.
 */
export function supportIsClear(
  point: V3,
  owner: string,
  alignments: Alignment[],
  margin = 2.5,
  surfaces?: SupportSurfaceIndex,
  frame?: Frame,
  depth = 1.2,
) {
  const roadClear = !alignments.some((a) => {
    if (a.road.id === owner) return false;
    const near = closestOnAlignment(a, point);
    return (
      near.point[1] < point[1] - 2 &&
      near.distance < roadHalfWidth(a.road) + a.road.sidewalk + margin
    );
  });
  if (!roadClear || !surfaces) return roadClear;
  const n = frame?.n ?? ([1, 0, 0] as V3),
    d = frame?.d ?? ([0, 0, 1] as V3),
    top = point[1] - depth - 0.07;
  // Reserve the actual oriented footing footprint along the support, then test
  // the wider headstock at its own height. Gateways and open plot holes are
  // respected by the indexed triangles, not approximated by a filled rectangle.
  return (
    surfaces.clear({
      outline: supportOutline(point, n, d, 3, 2.7),
      minY: -0.4,
      maxY: top + 0.08,
    }) &&
    surfaces.clear({
      outline: supportOutline(
        point,
        n,
        d,
        Math.max(2.1, (frame?.hw ?? 3.5) * 1.6),
        1.7,
      ),
      minY: top - 0.38,
      maxY: top + 0.08,
    })
  );
}
function profileSweep(
  b: MeshBuilder,
  frames: Frame[],
  offset: (f: Frame) => number,
  profile:
    [number, number][] | ((frame: Frame, index: number) => [number, number][]),
  material: string,
) {
  const sections = frames.map((f, i) =>
      typeof profile === "function" ? profile(f, i) : profile,
    ),
    rows = sections[0].map((_, k) =>
      frames.map((f, i) => {
        const [u, y] = sections[i][k];
        return add(f.p, add(mul(f.n, offset(f) + u), [0, y, 0]));
      }),
    );
  for (let i = 0; i < rows.length; i++)
    b.strip("structure", material, rows[i], rows[(i + 1) % rows.length]);
  for (const i of [0, frames.length - 1])
    b.append(
      "structure",
      material,
      rows.map((r) => r[i]),
      earcut(sections[i].flat(), undefined, 2).reduce<number[]>(
        (out, v, k, triangles) => {
          out.push(i === 0 ? v : triangles[k - (k % 3) + (2 - (k % 3))]);
          return out;
        },
        [],
      ),
    );
}
function girder(
  b: MeshBuilder,
  frames: Frame[],
  offset: (f: Frame) => number,
  depth: number | ((index: number) => number),
  steel: boolean,
) {
  if (steel) {
    const top = -0.455;
    profileSweep(
      b,
      frames,
      offset,
      (_, index) => {
        const bottom = -(typeof depth === "number" ? depth : depth(index));
        return [
          [-0.19, top],
          [0.19, top],
          [0.19, top - 0.035],
          [0.02, top - 0.035],
          [0.02, bottom + 0.045],
          [0.17, bottom + 0.045],
          [0.17, bottom],
          [-0.17, bottom],
          [-0.17, bottom + 0.045],
          [-0.02, bottom + 0.045],
          [-0.02, top - 0.035],
          [-0.19, top - 0.035],
        ];
      },
      "girder",
    );
  } else {
    const top = -0.455;
    profileSweep(
      b,
      frames,
      offset,
      (_, index) => {
        const bottom = -(typeof depth === "number" ? depth : depth(index));
        return [
          [-0.4, top],
          [0.4, top],
          [0.29, top - 0.1],
          [0.22, bottom + 0.09],
          [0.3, bottom + 0.09],
          [0.3, bottom],
          [-0.3, bottom],
          [-0.3, bottom + 0.09],
          [-0.22, bottom + 0.09],
          [-0.29, top - 0.1],
        ];
      },
      "concrete",
    );
  }
}
function pier(
  b: MeshBuilder,
  f: Frame,
  depth: number,
  kind: BridgeSupport["kind"],
): BridgeSupport | null {
  const top = f.p[1] - depth - 0.07,
    bottom = -0.27;
  if (top < 1) return null;
  const shape: [number, number][] = [
    [-0.48, -0.62],
    [0.48, -0.62],
    [0.64, -0.46],
    [0.64, 0.46],
    [0.48, 0.62],
    [-0.48, 0.62],
    [-0.64, 0.46],
    [-0.64, -0.46],
  ];
  const ring = (y: number, scale: number) =>
    shape.map(([u, v]) =>
      add([f.p[0], y, f.p[2]], add(mul(f.n, u * scale), mul(f.d, v * scale))),
    );
  const lo = ring(bottom, 1.08),
    hi = ring(top - 0.34, 0.92),
    close = (r: V3[]) => [...r, r[0]];
  b.strip("structure", "concrete", close(lo), close(hi));
  b.append(
    "structure",
    "concrete",
    lo,
    earcut(shape.flat(), undefined, 2),
    false,
  );
  b.append(
    "structure",
    "concrete",
    hi,
    earcut(shape.flat(), undefined, 2),
    true,
  );
  b.box(
    "structure",
    "concrete",
    [f.p[0], top - 0.17, f.p[2]],
    Math.max(2.1, f.hw * 1.6),
    0.42,
    1.7,
    f.d,
  );
  b.box("structure", "foundation", [f.p[0], -0.18, f.p[2]], 3.0, 0.4, 2.7, f.d);
  for (const side of [-1, 1])
    b.box(
      "structure",
      "rubber",
      add([f.p[0], top + 0.045, f.p[2]], mul(f.n, side * f.hw * 0.62)),
      0.34,
      0.07,
      0.55,
      f.d,
    );
  return { position: [f.p[0], 0, f.p[2]], top, footprint: [3, 2.7], kind };
}
export function buildBridgeSpan(
  b: MeshBuilder,
  span: RoadSpan,
  project: Project,
  alignments: Alignment[],
  surfaces?: SupportSurfaceIndex,
): BridgeFeature | undefined {
  const r = span.road;
  if (!r.bridge) return;
  const frames = span.frames,
    depth = r.bridgeDepth,
    steel = r.structure === "steel",
    first = frames[0].s,
    last = frames.at(-1)!.s;
  // The deck slab is closed and follows every alignment station/width taper.
  const row = (side: number, y: number) =>
    frames.map((f) => {
      const p = edgePoint(f, side, "bottom");
      return [p[0], f.p[1] + y, p[2]] as V3;
    });
  const left = row(-1, -0.279),
    right = row(1, -0.279),
    leftBottom = row(-1, -0.46),
    rightBottom = row(1, -0.46);
  b.strip("structure", "concrete", left, right, true);
  b.strip("structure", "concrete", left, leftBottom);
  b.strip("structure", "concrete", rightBottom, right);
  b.strip("structure", "concrete", leftBottom, rightBottom, false);
  for (const i of [0, frames.length - 1])
    b.quad("structure", "concrete", [
      left[i],
      right[i],
      rightBottom[i],
      leftBottom[i],
    ]);
  for (const side of [-1, 1])
    girder(b, frames, (f) => side * f.hw * 0.62, depth, steel);
  for (let s = first + 3.5; s < last - 1; s += steel ? 7 : 12) {
    const f = frameAt(span, s);
    b.box(
      "structure",
      steel ? "girder" : "concrete",
      add(f.p, [0, -depth + 0.16, 0]),
      f.hw * 1.35,
      0.22,
      0.14,
      f.d,
    );
  }
  const supports: BridgeSupport[] = [],
    excludedSupports: V3[] = [],
    bays = Math.max(1, Math.ceil((last - first) / r.pierSpacing));
  const support = (f: Frame, kind: BridgeSupport["kind"]) => {
    if (f.p[1] < 2.2) return false;
    if (!supportIsClear(f.p, r.id, alignments, 2.5, surfaces, f, depth)) {
      excludedSupports.push([...f.p]);
      return false;
    }
    if (supports.some((p) => distanceXZ(p.position, f.p) < 7)) return true;
    const p = pier(b, f, depth, kind);
    if (p) supports.push(p);
    return !!p;
  };
  for (let i = 1; i < bays; i++) {
    const station = first + ((last - first) * i) / bays,
      f = frameAt(span, station);
    if (support(f, "pier") || f.p[1] < 2.2) continue;
    for (const sign of [-1, 1])
      for (
        let offset = r.pierSpacing / 3;
        offset <= r.pierSpacing * 0.65;
        offset += 2
      ) {
        const s = station + sign * offset;
        if (s <= first + 2 || s >= last - 2) break;
        const candidate = frameAt(span, s);
        if (
          supportIsClear(
            candidate.p,
            r.id,
            alignments,
            2.5,
            surfaces,
            candidate,
            depth,
          ) &&
          support(candidate, "pier")
        )
          break;
      }
  }
  // Shared elevated span ends are bearing seams, NEVER full-height walls.
  for (const [f, id] of [
    [frames[0], r.start],
    [frames.at(-1)!, r.end],
  ] as [Frame, string][]) {
    const neighbours = connected(project, id).filter((a) => a.id !== r.id);
    if (!neighbours.some((a) => a.bridge)) support(f, "portal");
    for (const side of [-1, 1])
      b.box(
        "structure",
        "steel",
        add(f.p, add(mul(f.n, side * f.hw * 0.62), [0, -depth + 0.06, 0])),
        0.35,
        0.06,
        0.5,
        f.d,
      );
  }
  return {
    owner: r.id,
    ownerKind: "road",
    kind: "span",
    material: r.structure,
    depth,
    pierSpacing: r.pierSpacing,
    connections: [r.start, r.end],
    start: [...frames[0].p],
    end: [...frames.at(-1)!.p],
    supports,
    excludedSupports,
    physicalGeometry: true,
  };
}
/** Junction superstructures stitch trimmed bridge spans into a continuous
 * elevated deck; node movement re-sweeps the girders and support exclusion.
 */
export function buildBridgeJoint(
  b: MeshBuilder,
  node: RoadNode,
  arms: Arm[],
  bottom: V3[],
  alignments: Alignment[],
  surfaces?: SupportSurfaceIndex,
): BridgeFeature | undefined {
  const elevated = arms.filter((a) => a.road.bridge);
  if (!elevated.length || node.position[1] < 1.6) return;
  const depth = Math.max(...elevated.map((a) => a.road.bridgeDepth)),
    steel = elevated.some((a) => a.road.structure === "steel");
  const slabBottom = bottom.map((p) => add(p, [0, -0.2, 0])),
    close = (p: V3[]) => [...p, p[0]];
  b.polygon("structure", "concrete", bottom, undefined, true);
  b.strip("structure", "concrete", close(bottom), close(slabBottom));
  b.polygon("structure", "concrete", slabBottom, undefined, false);
  for (const a of elevated) {
    const d = normalizeXZ(sub(node.position, a.frame.p)),
      n = normalXZ(d);
    const sign = a.isStart ? -1 : 1;
    const frames = [
      { ...a.frame, d: mul(a.frame.d, sign), n: mul(a.frame.n, sign) },
      { ...a.frame, p: node.position, d, n },
    ];
    for (const side of [-1, 1])
      girder(
        b,
        frames,
        (f) => side * f.hw * 0.62,
        (i) => a.road.bridgeDepth + (depth - a.road.bridgeDepth) * i,
        a.road.structure === "steel",
      );
  }
  const supports: BridgeSupport[] = [],
    excludedSupports: V3[] = [];
  if (
    supportIsClear(
      node.position,
      node.id,
      alignments,
      2.5,
      surfaces,
      { ...elevated[0].frame, p: node.position },
      depth,
    )
  ) {
    const a = elevated[0],
      p = pier(b, { ...a.frame, p: node.position }, depth, "pier");
    if (p) supports.push(p);
  } else excludedSupports.push([...node.position]);
  return {
    owner: node.id,
    ownerKind: "node",
    kind: "joint",
    material: steel ? "steel" : "concrete",
    depth,
    pierSpacing: elevated[0].road.pierSpacing,
    connections: arms.map((a) => a.road.id),
    members: elevated.map((a) => ({
      road: a.road.id,
      material: a.road.structure,
      mouthDepth: a.road.bridgeDepth,
      jointDepth: depth,
    })),
    start: [...node.position],
    end: [...node.position],
    supports,
    excludedSupports,
    physicalGeometry: true,
  };
}

/** Effective member depth inside a trimmed transition, used by clearance
 * reporting as well as the swept beam sections. A shallow incoming member
 * cannot report its old depth after the joint has tapered it deeper. */
export function bridgeDepthAt(
  span: RoadSpan,
  station: number,
  bridges: BridgeFeature[],
) {
  const r = span.road,
    first = span.frames[0].s,
    last = span.frames.at(-1)!.s;
  const atNode = (id: string) =>
    bridges
      .find((b) => b.owner === id && b.kind === "joint")
      ?.members?.find((m) => m.road === r.id)?.jointDepth ?? r.bridgeDepth;
  if (station < first && first > 1e-8)
    return (
      atNode(r.start) +
      (r.bridgeDepth - atNode(r.start)) * Math.max(0, station / first)
    );
  if (station > last && span.alignment.length - last > 1e-8)
    return (
      r.bridgeDepth +
      (atNode(r.end) - r.bridgeDepth) *
        Math.min(1, (station - last) / (span.alignment.length - last))
    );
  return r.bridgeDepth;
}
