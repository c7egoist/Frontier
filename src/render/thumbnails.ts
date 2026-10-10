import { insertConnectedBridge } from "../core/bridge-insertion";
import { railStyles, type RailStyle } from "../core/model";
import { edgePoint } from "../core/geometry";
import {
  makeNode,
  makeRoad,
  roadDefaults,
  makeTemplate,
  presets,
  type Project,
} from "../core/model";
import { makeSite, type SiteKind } from "../core/sites";
import { buildNetwork, type Network, type MeshData } from "../core/geometry";
import { patternCanvas, utilityMaps, graphicCanvas } from "./materials";
import { type V3 } from "../core/math";

const cache = new Map<string, string>(),
  textures = new Map<string, HTMLCanvasElement>();
const palette: Record<string, string> = {
  asphalt: "#454b4c",
  concrete: "#9b9a95",
  pole: "#434646",
  soil: "#514334",
  "tree-grate": "#565c58",
  "cycle-red": "#914a43",
  "cycle-green": "#54775e",
  "bus-red": "#77463f",
  curb: "#b4b0a8",
  gutter: "#343a38",
  steel: "#a6b1ad",
  "steel-dark": "#65726c",
  girder: "#637476",
  foundation: "#767975",
  "road-base": "#5a615d",
  paint: "#e4e1d8",
  yellow: "#d2bc78",
  "utility-iron": "#777d75",
  "utility-recess": "#1a211e",
  "utility-cover": "#586159",
  "utility-grate": "#707c71",
  rubber: "#242b28",
  "pave-border": "#565d58",
};
function texture(material: string) {
  if (textures.has(material)) return textures.get(material);
  let image: HTMLCanvasElement | undefined;
  if (material === "utility-cover" || material === "utility-grate")
    image = utilityMaps(material).albedo;
  else if (material.startsWith("paving-"))
    image = patternCanvas(
      material.slice(7) as Parameters<typeof patternCanvas>[0],
    );
  else if (material.startsWith("marking-"))
    image = graphicCanvas(material.slice(8));
  else if (
    ["soil", "tree-grate", "cycle-red", "cycle-green", "bus-red"].includes(
      material,
    )
  )
    image = patternCanvas(material as Parameters<typeof patternCanvas>[0]);
  if (image) textures.set(material, image);
  return image;
}
function texturedTriangle(
  c: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  p: [number, number][],
  uv: [number, number][],
) {
  const u = uv.map((p) => [p[0] * image.width, p[1] * image.height]),
    du1 = u[1][0] - u[0][0],
    dv1 = u[1][1] - u[0][1],
    du2 = u[2][0] - u[0][0],
    dv2 = u[2][1] - u[0][1],
    den = du1 * dv2 - du2 * dv1;
  if (Math.abs(den) < 1e-8) return;
  const dx1 = p[1][0] - p[0][0],
    dy1 = p[1][1] - p[0][1],
    dx2 = p[2][0] - p[0][0],
    dy2 = p[2][1] - p[0][1],
    a = (dx1 * dv2 - dx2 * dv1) / den,
    b = (dy1 * dv2 - dy2 * dv1) / den,
    d = (du1 * dy2 - du2 * dy1) / den,
    e = (du1 * dx2 - du2 * dx1) / den;
  c.save();
  c.beginPath();
  c.moveTo(...p[0]);
  c.lineTo(...p[1]);
  c.lineTo(...p[2]);
  c.closePath();
  c.clip();
  c.transform(
    a,
    b,
    e,
    d,
    p[0][0] - a * u[0][0] - e * u[0][1],
    p[0][1] - b * u[0][0] - d * u[0][1],
  );
  c.fillStyle = c.createPattern(image, "repeat")!;
  const minX = Math.min(...u.map((v) => v[0])),
    minY = Math.min(...u.map((v) => v[1])),
    maxX = Math.max(...u.map((v) => v[0])),
    maxY = Math.max(...u.map((v) => v[1]));
  c.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
  c.restore();
}
function render(network: Network, focus?: V3, focusScale = 165) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 184;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#202426";
  c.fillRect(0, 0, 384, 184);
  const iso = (p: V3): [number, number, number] => [
    p[0] * 0.83 - p[2] * 0.56,
    p[0] * 0.24 + p[2] * 0.35 - p[1] * 0.87,
    p[0] * 0.5 + p[2] * 0.66 + p[1] * 0.56,
  ];
  const world = network.meshes.flatMap((m) =>
      Array.from({ length: m.positions.length / 3 }, (_, i) =>
        iso(m.positions.slice(i * 3, i * 3 + 3) as V3),
      ),
    ),
    limits = world.reduce(
      (b, v) => ({
        minX: Math.min(b.minX, v[0]),
        maxX: Math.max(b.maxX, v[0]),
        minY: Math.min(b.minY, v[1]),
        maxY: Math.max(b.maxY, v[1]),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    ),
    center = focus
      ? iso(focus)
      : [(limits.minX + limits.maxX) / 2, (limits.minY + limits.maxY) / 2, 0];
  const width = limits.maxX - limits.minX,
    height = limits.maxY - limits.minY,
    scale = focus
      ? focusScale
      : Math.min(350 / Math.max(1, width), 146 / Math.max(1, height));
  const faces: { m: MeshData; ids: number[]; p: V3[]; depth: number }[] = [];
  for (const m of network.meshes)
    for (let i = 0; i < m.indices.length; i += 3) {
      const ids = m.indices.slice(i, i + 3),
        p = ids.map((i) => m.positions.slice(i * 3, i * 3 + 3) as V3);
      faces.push({
        m,
        ids,
        p,
        depth: p.reduce((s, v) => s + iso(v)[2], 0) / 3,
      });
    }
  // A deterministic layer pass prevents long road triangles from hiding
  // coplanar covers in a CPU thumbnail (the live scene uses a real z-buffer).
  const layers: Record<string, number> = {
    structure: 0,
    asphalt: 1,
    bus: 1.3,
    cycle: 1.4,
    paving: 2,
    planting: 4.5,
    gutter: 3,
    curb: 4,
    marking: 5,
    drain: 6,
    utility: 7,
    rail: 8,
    sign: 9,
    lamp: 10,
  };
  const rank = (m: MeshData) =>
    (m.material.startsWith("marking-")
      ? 5
      : m.kind === "cycle" && m.material === "curb"
        ? 4
        : (layers[m.kind] ?? 0)) *
      10 +
    (m.kind === "utility"
      ? m.material === "utility-cover"
        ? 1
        : m.material === "utility-recess"
          ? 2
          : 0
      : m.kind === "drain"
        ? m.material === "utility-recess"
          ? 0
          : m.material === "utility-grate"
            ? 2
            : 1
        : 0);
  faces.sort((a, b) => rank(a.m) - rank(b.m) || a.depth - b.depth);
  for (const f of faces) {
    const p = f.p.map((v) => {
      const q = iso(v);
      return [
        192 + (q[0] - center[0]) * scale,
        92 + (q[1] - center[1]) * scale,
      ] as [number, number];
    });
    if (
      p.every((v) => v[0] < 0) ||
      p.every((v) => v[0] > 384) ||
      p.every((v) => v[1] < 0) ||
      p.every((v) => v[1] > 184)
    )
      continue;
    const image = texture(f.m.material);
    if (image) {
      const factor =
        f.m.material.startsWith("paving-") && f.m.material !== "paving-tactile"
          ? 0.5
          : 1;
      const uv = f.ids.map(
        (i) =>
          [f.m.uvs[i * 2] * factor, f.m.uvs[i * 2 + 1] * factor] as [
            number,
            number,
          ],
      );
      texturedTriangle(c, image, p, uv);
      continue;
    }
    c.beginPath();
    c.moveTo(...p[0]);
    c.lineTo(...p[1]);
    c.lineTo(...p[2]);
    c.closePath();
    c.fillStyle =
      palette[f.m.material] ??
      (f.m.material.startsWith("paint") ? "#e1dfd6" : "#8d9890");
    c.fill();
  }
  return canvas.toDataURL("image/png");
}
/** Cached previews are generated from the actual procedural mesh, not stock icons. */
export function assetThumbnail(
  category: "road" | "structure" | "site",
  id: string,
): string {
  const key = `${category}:${id}`;
  if (cache.has(key)) return cache.get(key)!;
  const p: Project = {
    version: 1,
    name: "Asset preview",
    nodes: [],
    roads: [],
  };
  let focus: V3 | undefined,
    focusScale = 165;
  if (category === "structure" && id === "bridge-kit") {
    const a = makeNode([-300, 0, 0]),
      z = makeNode([300, 0, 0]);
    p.nodes = [a, z];
    p.roads = [
      makeRoad(a, z, "Connected bridge preview", {
        lanes: 2,
        laneWidth: 3.65,
        oneWay: true,
        shoulderWidth: 2,
        roadClass: "mainline",
        sidewalk: 0,
        markingStyle: "motorway",
        curbStyle: "flush",
        manholes: false,
        drainage: false,
        guardrails: true,
        railStyle: "boxbeam",
        railHeight: 0.95,
      }),
    ];
    insertConnectedBridge(p, p.roads[0].id);
  } else if (category === "structure" && id === "corner") {
    Object.assign(p, makeTemplate("tee"));
    p.roads.forEach((r) => {
      r.signs = false;
      r.streetLights = false;
      r.manholes = false;
      r.drainage = false;
    });
  } else if (category === "site") {
    const s = makeSite(id as SiteKind, [0, 0, 0]);
    if (id !== "tree-pit") {
      s.width = id === "parking" ? 38 : id === "urban-block" ? 44 : 24;
      s.depth = id === "parking" ? 26 : id === "urban-block" ? 36 : 20;
    }
    if (id === "urban-block") s.blockEntryWidth = 7;
    if (id === "parking") {
      s.parkingIslands = true;
      s.bayFinish = "permeable";
      s.evBays = 2;
    }
    p.sites = [s];
  } else {
    const elevated = id === "bridge" || id === "steel",
      a = makeNode([-24, elevated ? 6 : 0, -3]),
      b = makeNode([24, elevated ? 6 : 0, 3]);
    p.nodes = [a, b];
    const settings =
      category === "road"
        ? (presets.find((s) => s.id === id)?.settings ?? {})
        : id === "bridge"
          ? { bridge: true, sidewalk: 1.2 }
          : id === "steel"
            ? { bridge: true, structure: "steel" as const, sidewalk: 1.2 }
            : id === "rail"
              ? { guardrails: true, sidewalk: 0.8 }
              : id === "channel"
                ? {
                    drainage: true,
                    drainageType: "linear" as const,
                    manholes: false,
                  }
                : { drainage: id === "drain", manholes: id === "manhole" };
    if (category === "structure" && id.startsWith("rail-")) {
      const style = id.slice(5) as RailStyle;
      if (railStyles.includes(style))
        Object.assign(settings, {
          guardrails: true,
          railStyle: style,
          railHeight:
            style === "parapet" ? 1.2 : style === "railing" ? 1.05 : 0.95,
          sidewalk: 0.8,
          manholes: false,
          drainage: false,
          markings: false,
        });
    }
    if (
      category === "structure" &&
      ["sidewalk", "driveway", "kerb", "hollow"].includes(id)
    )
      Object.assign(settings, {
        sidewalk: 4.2,
        drainage: ["kerb", "hollow"].includes(id),
        curbDrainType: id === "hollow" ? "hollow" : "side-entry",
        manholes: false,
      });
    p.roads = [
      makeRoad(
        a,
        b,
        "Preview",
        {
          ...roadDefaults,
          ...settings,
          signs: false,
          streetLights: false,
          ...(category === "structure" &&
          ["manhole", "drain", "channel"].includes(id)
            ? { markings: false }
            : {}),
          ...(elevated ? { guardrails: true } : {}),
        },
        category === "structure" ? [16, 0, 0] : [16, 0, -5],
        category === "structure" ? [-16, 0, 0] : [-16, 0, 5],
      ),
    ];
  }
  if (id === "driveway")
    p.roads[0].driveways.push({
      id: "preview",
      at: 0.5,
      side: 1,
      width: 6,
      apron: 4,
    });
  const n = buildNetwork(p);
  if (category === "structure" && (id === "rail" || id.startsWith("rail-"))) {
    const span = n.spans[0];
    focus = edgePoint(
      span.frames[Math.floor(span.frames.length / 2)],
      1,
      "outer",
    );
    focusScale = 31;
  }
  if (["manhole", "drain", "channel"].includes(id))
    focus = n.services.find(
      (s) =>
        s.kind ===
        (id === "manhole"
          ? "manhole"
          : id === "channel"
            ? "channel-drain"
            : "curb-inlet"),
    )?.position;
  if (id === "corner" || id === "driveway") {
    focus = n.footways.find(
      (f) => f.kind === (id === "corner" ? "corner-ramp" : "driveway"),
    )?.position;
    focusScale = id === "corner" ? 52 : 34;
  }
  if (id === "kerb" || id === "hollow") {
    focus = n.services.find(
      (s) => s.style === (id === "kerb" ? "side-entry" : "hollow"),
    )?.position;
    focusScale = id === "kerb" ? 100 : 75;
  }
  const image = render(n, focus, focusScale);
  cache.set(key, image);
  return image;
}
