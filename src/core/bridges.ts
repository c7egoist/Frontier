import {
  buildBearings,
  bearingDimensions,
  type BridgeBearing,
} from "./bridge-bearings";
import { bridgeAt, parameterStation } from "./bridge-profile";
import { SupportSurfaceIndex, supportOutline } from "./support-surfaces";
import earcut from "earcut";
import {
  frameAt,
  edgePoint,
  sideHalfWidth,
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
  dotXZ,
  type V3,
} from "./math";

export interface BridgeSupport {
  position: V3;
  top: number;
  footprint: [number, number];
  kind: "pier" | "portal";
  station?: number;
}
export interface BridgeFeature {
  owner: string;
  ownerKind: "road" | "node";
  kind: "span" | "joint";
  material: "steel" | "concrete";
  depth: number;
  girderCount?: number;
  girderSpacing?: number;
  girderSpacingRange?: [number, number];
  width?: number;
  widthRange?: [number, number];
  spanLengths?: number[];
  pierSpacing: number;
  connections: string[];
  start: V3;
  end: V3;
  supports: BridgeSupport[];
  excludedSupports: V3[];
  bearings?: BridgeBearing[];
  excludedAbutments?: { position: V3; station: number; part: string }[];
  abutments?: {
    position: V3;
    width: number;
    height: number;
    thickness: number;
  }[];
  members?: {
    road: string;
    material: "steel" | "concrete";
    mouthDepth: number;
    jointDepth: number;
    girderCount?: number;
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
  const bias = frame ? bridgeSection(frame).bias : 0,
    center = frame ? add(point, mul(frame.n, bias)) : point,
    capWidth = frame ? Math.max(2.1, bridgeSection(frame).width - 1.2) : 5.6;
  const roadClear = !alignments.some((a) => {
    if (a.road.id === owner) return false;
    const near = closestOnAlignment(a, center);
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
      outline: supportOutline(center, n, d, 3, 2.7),
      minY: -0.4,
      maxY: top + 0.08,
    }) &&
    surfaces.clear({
      outline: supportOutline(center, n, d, capWidth, 1.7),
      minY: top - 0.9,
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
/** About 2.5–3 m spacing and restrained overhangs, instead of only two
 * beams underneath a wide freeway deck. This is geometric preliminary sizing. */
function bridgeSection(f: Frame) {
  const left = sideHalfWidth(f, -1) + f.cw + f.sw,
    right = sideHalfWidth(f, 1) + f.cw + f.sw;
  return { width: left + right, bias: (right - left) / 2 };
}
export function girderOffsets(f: Frame, forcedCount?: number) {
  const { width, bias } = bridgeSection(f),
    overhang = Math.min(1, width * 0.16),
    extent = width / 2 - overhang,
    count = forcedCount ?? Math.max(3, Math.ceil((2 * extent) / 2.8) + 1);
  return Array.from(
    { length: count },
    (_, i) => bias - extent + (2 * extent * i) / (count - 1),
  );
}
function pier(
  b: MeshBuilder,
  f: Frame,
  depth: number,
  kind: BridgeSupport["kind"],
  girderCount?: number,
  bearings: BridgeBearing[] = [],
): BridgeSupport | null {
  const top = f.p[1] - depth - bearingDimensions.totalHeight,
    bottom = -0.27,
    section = bridgeSection(f),
    center = add(f.p, mul(f.n, section.bias));
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
      add(
        [center[0], y, center[2]],
        add(mul(f.n, u * scale), mul(f.d, v * scale)),
      ),
    );
  const lo = ring(bottom, 1.08),
    hi = ring(top - 0.86, 0.92),
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
    [center[0], top - 0.43, center[2]],
    Math.max(2.1, section.width - 1.2),
    0.86,
    1.7,
    f.d,
  );
  b.box(
    "structure",
    "foundation",
    [center[0], -0.18, center[2]],
    3.0,
    0.4,
    2.7,
    f.d,
  );
  bearings.push(
    ...buildBearings(b, f, depth, girderOffsets(f, girderCount), kind),
  );
  return {
    position: [center[0], 0, center[2]],
    top,
    footprint: [3, 2.7],
    kind,
    station: f.s,
  };
}
interface AbutmentPart {
  name: string;
  material: string;
  center: V3;
  width: number;
  height: number;
  length: number;
}
function abutmentParts(f: Frame, depth: number, outward: V3): AbutmentPart[] {
  const section = bridgeSection(f),
    width = section.width,
    seat = f.p[1] - depth - bearingDimensions.totalHeight,
    backHeight = f.p[1] - 0.28,
    center = (distance: number, y: number) => {
      const p = add(f.p, add(mul(outward, distance), mul(f.n, section.bias)));
      p[1] = y;
      return p;
    },
    parts: AbutmentPart[] = [
      {
        name: "breast wall",
        material: "concrete",
        center: center(0.35, seat / 2),
        width,
        height: seat,
        length: 1.3,
      },
      {
        name: "back wall",
        material: "concrete",
        center: center(1.12, (seat + backHeight) / 2),
        width,
        height: backHeight - seat,
        length: 0.25,
      },
      {
        name: "foundation",
        material: "foundation",
        center: center(0.35, -0.2),
        width: width + 0.6,
        height: 0.4,
        length: 2.1,
      },
    ];
  for (const side of [-1, 1]) {
    const p = add(
      f.p,
      add(
        mul(f.n, section.bias + side * (width / 2 - 0.12)),
        mul(outward, 2.1),
      ),
    );
    p[1] = backHeight / 2;
    parts.push({
      name: `wing ${side}`,
      material: "concrete",
      center: p,
      width: 0.24,
      height: backHeight,
      length: 3.4,
    });
  }
  return parts;
}
export function buildBridgeSpan(
  b: MeshBuilder,
  span: RoadSpan,
  project: Project,
  alignments: Alignment[],
  surfaces?: SupportSurfaceIndex,
  forcedCount?: number,
): BridgeFeature | undefined {
  const r = span.road;
  if (!r.bridge) return;
  const first = Math.max(
      span.frames[0].s,
      parameterStation(span.alignment, r.bridgeFrom),
    ),
    last = Math.min(
      span.frames.at(-1)!.s,
      parameterStation(span.alignment, r.bridgeTo),
    );
  if (last - first < 0.1) return;
  const frames = [
      frameAt(span, first),
      ...span.frames.filter((f) => f.s > first + 1e-7 && f.s < last - 1e-7),
      frameAt(span, last),
    ],
    depth = r.bridgeDepth,
    steel = r.structure === "steel";
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
  const count =
      forcedCount ?? Math.max(...frames.map((f) => girderOffsets(f).length)),
    beamOffsets = girderOffsets(frames[0], count);
  beamOffsets.forEach((_, i) =>
    girder(b, frames, (f) => girderOffsets(f, count)[i], depth, steel),
  );
  for (let s = first + 3.5; s < last - 1; s += steel ? 7 : 12) {
    const f = frameAt(span, s);
    b.box(
      "structure",
      steel ? "girder" : "concrete",
      add(f.p, add([0, -depth + 0.16, 0], mul(f.n, bridgeSection(f).bias))),
      girderOffsets(f, count).at(-1)! - girderOffsets(f, count)[0] + 0.4,
      0.22,
      0.14,
      f.d,
    );
  }
  const supports: BridgeSupport[] = [],
    excludedSupports: V3[] = [],
    bearings: BridgeBearing[] = [],
    excludedAbutments: NonNullable<BridgeFeature["excludedAbutments"]> = [],
    bays = Math.max(1, Math.ceil((last - first) / r.pierSpacing));
  const support = (f: Frame, kind: BridgeSupport["kind"]) => {
    if (f.p[1] < 2.2) return false;
    if (!supportIsClear(f.p, r.id, alignments, 2.5, surfaces, f, depth)) {
      excludedSupports.push([...f.p]);
      return false;
    }
    if (
      supports.some((p) =>
        p.station !== undefined
          ? Math.abs(p.station - f.s) < 7
          : distanceXZ(p.position, f.p) < 7,
      )
    )
      return true;
    const p = pier(b, f, depth, kind, count, bearings);
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
  const abutments: NonNullable<BridgeFeature["abutments"]> = [];
  // Only a structural-to-fill transition has an abutment. Connected bridge
  // members still meet at bearing seams, without walls across the deck.
  for (const [f, id] of [
    [frames[0], r.start],
    [frames.at(-1)!, r.end],
  ] as [Frame, string][]) {
    const neighbours = connected(project, id).filter((a) => a.id !== r.id);
    const atNode = Math.abs(f.t - (id === r.start ? 0 : 1)) < 1e-7,
      linkedBridge =
        bridgeAt(r, id === r.start ? 0 : 1) &&
        neighbours.some((a) => bridgeAt(a, a.start === id ? 0 : 1)),
      fill =
        (!atNode && r.embankment) ||
        (atNode &&
          neighbours.some(
            (a) => a.embankment && !bridgeAt(a, a.start === id ? 0 : 1),
          ));
    if (!linkedBridge && fill) {
      const outward = mul(f.d, id === r.start ? -1 : 1),
        section = bridgeSection(f),
        height = f.p[1] - depth - bearingDimensions.totalHeight;
      if (height > 0.5) {
        const parts = abutmentParts(f, depth, outward),
          blocked = surfaces
            ? parts.find(
                (p) =>
                  !surfaces.clear(
                    {
                      outline: supportOutline(
                        p.center,
                        f.n,
                        f.d,
                        p.width,
                        p.length,
                      ),
                      minY: p.center[1] - p.height / 2,
                      maxY: p.center[1] + p.height / 2,
                    },
                    r.id,
                  ),
              )
            : !supportIsClear(f.p, r.id, alignments, 2.5, undefined, f, depth)
              ? parts[0]
              : undefined;
        if (blocked)
          excludedAbutments.push({
            position: [...f.p],
            station: f.s,
            part: blocked.name,
          });
        else {
          for (const p of parts)
            b.box(
              "structure",
              p.material,
              p.center,
              p.width,
              p.height,
              p.length,
              f.d,
            );
          bearings.push(
            ...buildBearings(b, f, depth, girderOffsets(f, count), "abutment"),
          );
          abutments.push({
            position: [
              f.p[0] + f.n[0] * section.bias,
              0,
              f.p[2] + f.n[2] * section.bias,
            ],
            width: section.width,
            height,
            thickness: 1.3,
          });
        }
      }
    } else if (!linkedBridge) support(f, "portal");
  }
  const bearingStations = [
      first,
      ...supports.map(
        (p) =>
          p.station ??
          parameterStation(
            span.alignment,
            closestOnAlignment(span.alignment, p.position).t,
          ),
      ),
      last,
    ].sort((a, b) => a - b),
    spanLengths = bearingStations
      .slice(1)
      .map((s, i) => s - bearingStations[i]);
  const widths = frames.map((f) => bridgeSection(f).width),
    spacings = frames.map((f) => {
      const offsets = girderOffsets(f, count);
      return offsets[1] - offsets[0];
    });
  return {
    owner: r.id,
    ownerKind: "road",
    kind: "span",
    material: r.structure,
    depth,
    girderCount: beamOffsets.length,
    girderSpacing: beamOffsets.length > 1 ? beamOffsets[1] - beamOffsets[0] : 0,
    width: bridgeSection(frames[0]).width,
    widthRange: [Math.min(...widths), Math.max(...widths)],
    girderSpacingRange: [Math.min(...spacings), Math.max(...spacings)],
    spanLengths,
    pierSpacing: r.pierSpacing,
    connections: [r.start, r.end],
    start: [...frames[0].p],
    end: [...frames.at(-1)!.p],
    supports,
    excludedSupports,
    bearings,
    excludedAbutments,
    abutments,
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
  counts: ReadonlyMap<string, number> = new Map(),
): BridgeFeature | undefined {
  const elevated = arms.filter((a) => bridgeAt(a.road, a.isStart ? 0 : 1));
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
      {
        ...a.frame,
        d: mul(a.frame.d, sign),
        n: mul(a.frame.n, sign),
        auxSide: (a.frame.auxSide ?? 1) * sign,
      },
      {
        ...a.frame,
        p: node.position,
        d,
        n,
        auxSide: (a.frame.auxSide ?? 1) * sign,
      },
    ];
    const count =
      counts.get(a.road.id) ??
      Math.max(...frames.map((f) => girderOffsets(f).length));
    girderOffsets(frames[0], count).forEach((_, index) =>
      girder(
        b,
        frames,
        (f) => girderOffsets(f, count)[index],
        (i) => a.road.bridgeDepth + (depth - a.road.bridgeDepth) * i,
        a.road.structure === "steel",
      ),
    );
  }
  const supports: BridgeSupport[] = [],
    excludedSupports: V3[] = [],
    bearings: BridgeBearing[] = [],
    seatArm = [...elevated].sort(
      (a, b) => bridgeSection(b.frame).width - bridgeSection(a.frame).width,
    )[0],
    seatFrame = { ...seatArm.frame, p: node.position },
    seatCount = counts.get(seatArm.road.id) ?? girderOffsets(seatFrame).length;
  if (
    elevated.every((a) =>
      supportIsClear(
        node.position,
        node.id,
        alignments,
        2.5,
        surfaces,
        { ...a.frame, p: node.position },
        depth,
      ),
    )
  ) {
    const p = pier(b, seatFrame, depth, "pier", seatCount, bearings);
    if (p) {
      supports.push(p);
      bearings.forEach((b) => (b.members = [seatArm.road.id]));
      for (const arm of elevated) {
        if (arm === seatArm) continue;
        const f = { ...arm.frame, p: node.position },
          section = bridgeSection(f),
          center = add(f.p, mul(f.n, section.bias));
        center[1] = p.top - 0.43;
        const delta = sub(center, p.position),
          sameCap =
            Math.abs(Math.abs(dotXZ(f.d, seatFrame.d)) - 1) < 1e-8 &&
            Math.abs(dotXZ(delta, seatFrame.n)) +
              Math.max(2.1, section.width - 1.2) / 2 <=
              Math.max(2.1, bridgeSection(seatFrame).width - 1.2) / 2 + 1e-8 &&
            Math.abs(dotXZ(delta, seatFrame.d)) < 1e-8;
        if (!sameCap)
          b.box(
            "structure",
            "concrete",
            center,
            Math.max(2.1, section.width - 1.2),
            0.86,
            1.7,
            f.d,
          );
        bearings.push(
          ...buildBearings(
            b,
            f,
            depth,
            girderOffsets(f, counts.get(arm.road.id)),
            "pier",
            bearings,
            arm.road.id,
          ),
        );
      }
    }
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
      girderCount: counts.get(a.road.id) ?? girderOffsets(a.frame).length,
    })),
    start: [...node.position],
    end: [...node.position],
    supports,
    excludedSupports,
    bearings,
    excludedAbutments: [],
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
