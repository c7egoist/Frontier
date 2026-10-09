import { uid, type Pattern } from "./model";
import { add, clamp, simplePolygon, polygonArea, type V3 } from "./math";

export type SiteKind = "block" | "parking" | "plaza" | "island" | "water";
export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  position: V3;
  yaw: number;
  width: number;
  depth: number;
  pattern: Pattern;
  shape: "rectangle" | "triangle" | "circle";
  landscape: boolean;
  buildingHeight: number;
  bays: number;
  accessible: number;
  entrance: "north" | "south" | "east" | "west";
  bayWidth: number;
  bayDepth: number;
  aisleWidth: number;
  perimeterWidth: number;
  entryWidth: number;
  parkingAngle: 45 | 60 | 90;
  parkingLayout: "automatic" | "double" | "single";
  numbering: boolean;
  paintWear: number;
  drainage: boolean;
  manholes: boolean;
  manholeDiameter: number;
}
export const siteCatalog: {
  id: SiteKind;
  name: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "parking",
    name: "Procedural parking",
    description: "Auto rows · bay angle · drive aisles",
    icon: "square-parking",
  },
  {
    id: "plaza",
    name: "Paving surface",
    description: "Metric stone courses · edge detail",
    icon: "grid-2x2",
  },
  {
    id: "island",
    name: "Curbed splitter",
    description: "Rounded footprint · paving only",
    icon: "triangle",
  },
];
export function makeSite(kind: SiteKind, position: V3): Site {
  return {
    id: uid("site"),
    name:
      siteCatalog.find((s) => s.id === kind)?.name ??
      `Legacy ${kind} (excluded)`,
    kind,
    position: [...position],
    yaw: 0,
    width:
      kind === "water"
        ? 120
        : kind === "block"
          ? 62
          : kind === "parking"
            ? 54
            : kind === "plaza"
              ? 40
              : 24,
    depth:
      kind === "water"
        ? 240
        : kind === "block"
          ? 70
          : kind === "parking"
            ? 34
            : kind === "plaza"
              ? 36
              : 24,
    pattern: "ashlar",
    shape: kind === "island" ? "triangle" : "rectangle",
    landscape: false,
    buildingHeight: 0,
    bays: 0,
    accessible: 2,
    entrance: "north",
    bayWidth: 2.8,
    bayDepth: 5.2,
    aisleWidth: 6.5,
    perimeterWidth: 1.8,
    entryWidth: 7,
    parkingAngle: 90,
    parkingLayout: "automatic",
    numbering: false,
    paintWear: 0.08,
    drainage: true,
    manholes: kind === "parking",
    manholeDiameter: 0.65,
  };
}
export function sitePoint(site: Site, x: number, z: number, y = 0): V3 {
  const a = (site.yaw * Math.PI) / 180;
  return add(site.position, [
    x * Math.cos(a) - z * Math.sin(a),
    y,
    x * Math.sin(a) + z * Math.cos(a),
  ]);
}
/** Convex rounded footprints, shared by plan, selection, placement and meshes. */
export function siteOutline(site: Site, inset = 0, y = 0.12): V3[] {
  const w = Math.max(0.25, site.width / 2 - inset),
    d = Math.max(0.25, site.depth / 2 - inset);
  if (site.shape === "circle")
    return Array.from({ length: 64 }, (_, i) =>
      sitePoint(
        site,
        Math.cos((i * Math.PI) / 32) * w,
        Math.sin((i * Math.PI) / 32) * d,
        y,
      ),
    );
  let raw: [number, number][];
  if (site.shape === "triangle") {
    const hw = site.width / 2,
      hd = site.depth / 2,
      base: [number, number][] = [
        [-hw, -hd],
        [hw, -hd],
        [-hw, hd],
      ],
      inradius =
        (site.width + site.depth - Math.hypot(site.width, site.depth)) / 2,
      amount = Math.min(inset, inradius * 0.78);
    raw = base.map((point, i) => {
      const previous = base[(i + 2) % 3],
        next = base[(i + 1) % 3],
        a = [point[0] - previous[0], point[1] - previous[1]],
        b = [next[0] - point[0], next[1] - point[1]],
        la = Math.hypot(...a),
        lb = Math.hypot(...b),
        na = [-a[1] / la, a[0] / la],
        nb = [-b[1] / lb, b[0] / lb],
        factor = amount / (1 + na[0] * nb[0] + na[1] * nb[1]);
      return [
        point[0] + (na[0] + nb[0]) * factor,
        point[1] + (na[1] + nb[1]) * factor,
      ];
    });
  } else
    raw = [
      [-w, -d],
      [w, -d],
      [w, d],
      [-w, d],
    ];
  const minEdge = Math.min(
    ...raw.map((p, i) =>
      Math.hypot(
        p[0] - raw[(i + 1) % raw.length][0],
        p[1] - raw[(i + 1) % raw.length][1],
      ),
    ),
  );
  const rounding = Math.min(2.2, w * 0.16, d * 0.16, minEdge * 0.27),
    out: V3[] = [];
  raw.forEach((v, i) => {
    const previous = raw[(i + raw.length - 1) % raw.length],
      next = raw[(i + 1) % raw.length];
    const da = Math.hypot(previous[0] - v[0], previous[1] - v[1]),
      db = Math.hypot(next[0] - v[0], next[1] - v[1]);
    const a = [
        v[0] + ((previous[0] - v[0]) * rounding) / da,
        v[1] + ((previous[1] - v[1]) * rounding) / da,
      ],
      b = [
        v[0] + ((next[0] - v[0]) * rounding) / db,
        v[1] + ((next[1] - v[1]) * rounding) / db,
      ];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8,
        u = 1 - t;
      out.push(
        sitePoint(
          site,
          u * u * a[0] + 2 * u * t * v[0] + t * t * b[0],
          u * u * a[1] + 2 * u * t * v[1] + t * t * b[1],
          y,
        ),
      );
    }
  });
  return out;
}
export function insidePolygon(p: V3, polygon: V3[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[2] > p[2] !== b[2] > p[2] &&
      p[0] < ((b[0] - a[0]) * (p[2] - a[2])) / (b[2] - a[2]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function parseSites(raw: unknown, patterns: readonly string[]): Site[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 200)
    throw new Error("Invalid site collection (maximum 200).");
  const ids = new Set<string>();
  return raw
    .map((value) => {
      if (!value || typeof value !== "object") throw new Error("Invalid site.");
      const e = value as Record<string, unknown>;
      if (
        typeof e.id !== "string" ||
        e.id.length > 100 ||
        ids.has(e.id) ||
        !["parking", "plaza", "island", "block", "water"].includes(
          String(e.kind),
        )
      )
        throw new Error("Invalid or duplicate site ID/type.");
      ids.add(e.id);
      if (
        !Array.isArray(e.position) ||
        e.position.length !== 3 ||
        e.position.some(
          (n) =>
            typeof n !== "number" ||
            !Number.isFinite(n) ||
            Math.abs(n) > 100000,
        )
      )
        throw new Error("Invalid site position.");
      const fallback = makeSite(e.kind as SiteKind, e.position as V3);
      const num = (key: string, min: number, max: number) =>
        typeof e[key] === "number" && Number.isFinite(e[key])
          ? clamp(e[key] as number, min, max)
          : (fallback as unknown as Record<string, number>)[key];
      const site: Site = {
        ...fallback,
        id: e.id,
        name: typeof e.name === "string" ? e.name.slice(0, 80) : fallback.name,
        yaw: num("yaw", -360, 360),
        width: num("width", 8, 250),
        depth: num("depth", 8, 400),
        buildingHeight: num("buildingHeight", 0, 80),
        bays: Math.round(num("bays", 0, 70)),
        accessible: Math.round(num("accessible", 0, 6)),
        pattern: patterns.includes(String(e.pattern))
          ? (e.pattern as Pattern)
          : "ashlar",
        shape: ["rectangle", "triangle", "circle"].includes(String(e.shape))
          ? (e.shape as Site["shape"])
          : fallback.shape,
        landscape: false,
        entrance: ["north", "south", "east", "west"].includes(
          String(e.entrance),
        )
          ? (e.entrance as Site["entrance"])
          : "north",
        bayWidth: num("bayWidth", 2.4, 3.6),
        bayDepth: num("bayDepth", 4.5, 6.5),
        aisleWidth: num("aisleWidth", 4, 9),
        perimeterWidth: num("perimeterWidth", 0.3, 4),
        entryWidth: num("entryWidth", 3.5, 10),
        parkingAngle: [45, 60, 90].includes(Number(e.parkingAngle))
          ? (Number(e.parkingAngle) as 45 | 60 | 90)
          : 90,
        parkingLayout: ["automatic", "double", "single"].includes(
          String(e.parkingLayout),
        )
          ? (e.parkingLayout as Site["parkingLayout"])
          : "automatic",
        numbering: e.numbering === true,
        paintWear: num("paintWear", 0, 0.35),
        drainage: e.drainage !== false,
        manholes: e.manholes !== false && e.kind === "parking",
        manholeDiameter: num("manholeDiameter", 0.45, 1),
      };
      const polygon = siteOutline(site);
      if (!simplePolygon(polygon) || Math.abs(polygonArea(polygon)) < 1)
        throw new Error("Degenerate site footprint.");
      return site;
    })
    .filter((s) => s.kind !== "block" && s.kind !== "water");
}
