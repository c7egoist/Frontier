import { add, sub, mul, clamp, distance, type V3 } from "./math";

export type Surface = "asphalt" | "concrete" | "cobble";
export type Pattern = "herringbone" | "running" | "slabs" | "basket";
export interface RoadNode {
  id: string;
  name: string;
  position: V3;
  radius: number;
  crossings: boolean;
}
export interface RoadSettings {
  lanes: number;
  laneWidth: number;
  sidewalk: number;
  surface: Surface;
  pattern: Pattern;
  markings: boolean;
  guardrails: boolean;
  drainage: boolean;
  crossfall: number;
  inletSpacing: number;
  railHeight: number;
  postSpacing: number;
  bridge: boolean;
  structure: "concrete" | "steel";
  oneWay: boolean;
}
export interface Road extends RoadSettings {
  id: string;
  name: string;
  start: string;
  end: string;
  /** Relative Bezier handles: translating a shared node also translates its handles. */
  h1: V3;
  h2: V3;
}
export interface Project {
  version: 1;
  name: string;
  nodes: RoadNode[];
  roads: Road[];
}
export type Selection = { kind: "node" | "road"; id: string } | null;
export const roadDefaults: RoadSettings = {
  lanes: 2,
  laneWidth: 3.5,
  sidewalk: 2.4,
  surface: "asphalt",
  pattern: "herringbone",
  markings: true,
  guardrails: false,
  drainage: true,
  crossfall: 2,
  inletSpacing: 18,
  railHeight: 0.8,
  postSpacing: 3.4,
  bridge: false,
  structure: "concrete",
  oneWay: false,
};
export const presets: {
  id: string;
  name: string;
  description: string;
  settings: Partial<RoadSettings>;
}[] = [
  {
    id: "urban",
    name: "Urban street",
    description: "2 lanes · paved sidewalks",
    settings: {},
  },
  {
    id: "arterial",
    name: "Arterial road",
    description: "4 lanes · generous shoulders",
    settings: { lanes: 4, laneWidth: 3.25, sidewalk: 1.8 },
  },
  {
    id: "highway",
    name: "Divided highway",
    description: "4 lanes · safety barriers",
    settings: {
      lanes: 4,
      laneWidth: 3.6,
      sidewalk: 0.8,
      guardrails: true,
      drainage: false,
    },
  },
  {
    id: "path",
    name: "Pedestrian path",
    description: "3 m · stone paving",
    settings: {
      lanes: 1,
      laneWidth: 3,
      sidewalk: 0.25,
      surface: "cobble",
      markings: false,
      drainage: false,
      oneWay: true,
    },
  },
];
let serial = 0;
export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(++serial).toString(36)}`;
export const getNode = (p: Project, id: string) =>
  p.nodes.find((n) => n.id === id)!;
export const connected = (p: Project, id: string) =>
  p.roads.filter((r) => r.start === id || r.end === id);
export const controlPoints = (p: Project, r: Road): V3[] => {
  const a = getNode(p, r.start).position,
    b = getNode(p, r.end).position;
  return [a, add(a, r.h1), add(b, r.h2), b];
};
export function makeNode(position: V3, name = "Control point"): RoadNode {
  return { id: uid("node"), name, position, radius: 6, crossings: true };
}
export function makeRoad(
  a: RoadNode,
  b: RoadNode,
  name = "New road",
  settings: Partial<RoadSettings> = {},
  h1?: V3,
  h2?: V3,
): Road {
  const direction = sub(b.position, a.position);
  return {
    ...roadDefaults,
    ...settings,
    id: uid("road"),
    name,
    start: a.id,
    end: b.id,
    h1: h1 ?? mul(direction, 1 / 3),
    h2: h2 ?? mul(direction, -1 / 3),
  };
}
export function makeDemo(): Project {
  const p: Project = {
    version: 1,
    name: "Northbank district",
    nodes: [],
    roads: [],
  };
  const n = (id: string, x: number, z: number, y = 0, radius = 6) => {
    const node: RoadNode = {
      id,
      name:
        id === "j01"
          ? "Junction 01"
          : id === "j02"
            ? "Junction 02"
            : "Control point",
      position: [x, y, z],
      radius,
      crossings: true,
    };
    p.nodes.push(node);
    return node;
  };
  const c = n("j01", 0, 0),
    w = n("west", -78, 13),
    e = n("east", 78, -5),
    s = n("south", 9, 73);
  const north = n("j02", 0, -48, 0, 5),
    end = n("north-end", 8, -100);
  const nw = n("north-west", -73, -48),
    ne = n("north-east", 76, -53);
  const r = (
    id: string,
    a: RoadNode,
    b: RoadNode,
    name: string,
    h1?: V3,
    h2?: V3,
    settings: Partial<RoadSettings> = {},
  ) => {
    const road = makeRoad(a, b, name, settings, h1, h2);
    road.id = id;
    p.roads.push(road);
  };
  r("r01", w, c, "Northbank avenue · West", [26, 0, -10], [-26, 0, 0]);
  r("r02", c, e, "Northbank avenue · East", [26, 0, 0], [-26, 0, 0]);
  r("r03", c, s, "Willow street", [0, 0, 26], [-8, 0, -26]);
  r("r04", north, c, "Market street", [0, 0, 16], [0, 0, -16]);
  r("r05", end, north, "Market street · North", [-8, 0, 18], [0, 0, -18]);
  r("r06", nw, north, "Park lane · West", [24, 0, 0], [-24, 0, 0], {
    pattern: "slabs",
    sidewalk: 2,
  });
  r("r07", north, ne, "Park lane · East", [25, 0, 0], [-25, 0, 0], {
    pattern: "slabs",
    sidewalk: 2,
  });
  // A real, continuous viaduct with flat-tangent approach ramps. All connections
  // are shared graph nodes; the elevated crossing never joins the avenue below.
  const bn = n("bridge-north", 51, -110),
    b1 = n("bridge-a", 49, -38, 5.8, 3);
  const b2 = n("bridge-b", 56, 32, 5.8, 3),
    bs = n("bridge-south", 67, 104);
  const bridgeSettings = {
    sidewalk: 1.1,
    pattern: "slabs" as Pattern,
    guardrails: true,
    drainage: true,
  };
  r(
    "r08",
    bn,
    b1,
    "Canal approach · North",
    [0, 0, 26],
    [0, 0, -26],
    bridgeSettings,
  );
  r("r09", b1, b2, "Canal viaduct", [0, 0, 24], [-5, 0, -24], {
    ...bridgeSettings,
    bridge: true,
  });
  r(
    "r10",
    b2,
    bs,
    "Canal approach · South",
    [5, 0, 26],
    [0, 0, -26],
    bridgeSettings,
  );
  return p;
}
export function makeTemplate(type: string): Project {
  if (type === "district") return makeDemo();
  const p: Project = {
    version: 1,
    name:
      type === "diamond"
        ? "Diamond interchange"
        : type === "roundabout"
          ? "Garden roundabout"
          : "Three-way junction",
    nodes: [],
    roads: [],
  };
  const n = (name: string, x: number, z: number, y = 0, radius = 7) => {
    const node = makeNode([x, y, z], name);
    node.radius = radius;
    p.nodes.push(node);
    return node;
  };
  const r = (
    a: RoadNode,
    b: RoadNode,
    name: string,
    settings: Partial<RoadSettings> = {},
    h1?: V3,
    h2?: V3,
  ) => p.roads.push(makeRoad(a, b, name, settings, h1, h2));
  if (type === "diamond") {
    const w = n("West boundary", -240, 0),
      wm = n("West ramp terminal", -130, 0),
      em = n("East ramp terminal", 130, 0),
      e = n("East boundary", 240, 0);
    const no = n("North boundary", 0, -260),
      nt = n("North terminal", 0, -84, 7, 8);
    const st = n("South terminal", 0, 84, 7, 8),
      so = n("South boundary", 0, 260);
    const highway: Partial<RoadSettings> = {
      lanes: 4,
      laneWidth: 3.5,
      sidewalk: 0.8,
      guardrails: true,
      drainage: false,
    };
    r(w, wm, "West highway", highway);
    r(wm, em, "Cross highway", highway);
    r(em, e, "East highway", highway);
    r(no, nt, "North approach", highway, [0, 0, 62], [0, 0, -62]);
    r(
      nt,
      st,
      "Overpass deck",
      { ...highway, bridge: true, structure: "steel" },
      [0, 0, 56],
      [0, 0, -56],
    );
    r(st, so, "South approach", highway, [0, 0, 62], [0, 0, -62]);
    const ramp: Partial<RoadSettings> = {
      lanes: 1,
      laneWidth: 4.2,
      sidewalk: 0.65,
      guardrails: true,
      drainage: false,
      oneWay: true,
    };
    r(nt, wm, "Ramp 01 · Northwest", ramp, [-58, 0, 10], [10, 0, -48]);
    r(em, nt, "Ramp 02 · Northeast", ramp, [-10, 0, -48], [58, 0, 10]);
    r(wm, st, "Ramp 03 · Southwest", ramp, [10, 0, 48], [-58, 0, -10]);
    r(st, em, "Ramp 04 · Southeast", ramp, [58, 0, -10], [-10, 0, 48]);
    p.nodes.forEach((node) => (node.crossings = false));
  } else if (type === "roundabout") {
    const radius = 27,
      k = 0.55228475 * radius;
    const ring = [
      n("East entry", radius, 0, 0, 4),
      n("South entry", 0, radius, 0, 4),
      n("West entry", -radius, 0, 0, 4),
      n("North entry", 0, -radius, 0, 4),
    ];
    const handles: [V3, V3][] = [
      [
        [0, 0, k],
        [k, 0, 0],
      ],
      [
        [-k, 0, 0],
        [0, 0, k],
      ],
      [
        [0, 0, -k],
        [-k, 0, 0],
      ],
      [
        [k, 0, 0],
        [0, 0, -k],
      ],
    ];
    ring.forEach((a, i) => {
      r(
        a,
        ring[(i + 1) % 4],
        `Circulation ${i + 1}`,
        {
          sidewalk: 1.7,
          lanes: 1,
          laneWidth: 6,
          oneWay: true,
          drainage: false,
        },
        ...handles[i],
      );
      const pos = mul(a.position, 3.1),
        end = n(`Approach ${i + 1}`, pos[0], pos[2]);
      r(a, end, `Garden approach ${i + 1}`, {
        sidewalk: 2,
        pattern: "running",
      });
    });
  } else {
    const center = n("Junction 01", 0, 0),
      w = n("West boundary", -72, 0),
      e = n("East boundary", 72, 0),
      s = n("South boundary", 0, 68);
    r(w, center, "West avenue");
    r(center, e, "East avenue");
    r(center, s, "Branch street");
  }
  return p;
}

/** Strict, bounded parsing: imported JSON is never treated as executable data. */
export function parseProject(raw: unknown): Project {
  if (!raw || typeof raw !== "object")
    throw new Error("This is not a Frontier road project.");
  const data = raw as Record<string, unknown>;
  if (
    data.version !== 1 ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.roads)
  )
    throw new Error("Unsupported project format. Expected version 1.");
  if (data.nodes.length > 1500 || data.roads.length > 500)
    throw new Error("Project is too large (maximum 500 roads).");
  const text = (value: unknown, fallback: string) =>
    typeof value === "string" ? value.slice(0, 80) : fallback;
  const vec = (value: unknown): V3 => {
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      value.some(
        (v) =>
          typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 100000,
      )
    )
      throw new Error("Invalid point coordinates.");
    return [...value] as V3;
  };
  const number = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
  const ids = new Set<string>();
  const nodes: RoadNode[] = data.nodes.map((entry: Record<string, unknown>) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      ids.has(entry.id) ||
      entry.id.length > 100
    )
      throw new Error("Invalid or duplicate node ID.");
    ids.add(entry.id);
    return {
      id: entry.id,
      name: text(entry.name, "Control point"),
      position: vec(entry.position),
      radius: number(entry.radius, 6, 1, 30),
      crossings: entry.crossings !== false,
    };
  });
  const roadIDs = new Set<string>();
  const roads: Road[] = data.roads.map((entry: Record<string, unknown>) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      roadIDs.has(entry.id) ||
      entry.id.length > 100
    )
      throw new Error("Invalid or duplicate road ID.");
    if (
      typeof entry.start !== "string" ||
      typeof entry.end !== "string" ||
      !ids.has(entry.start) ||
      !ids.has(entry.end) ||
      entry.start === entry.end
    )
      throw new Error("A road references a missing or identical endpoint.");
    roadIDs.add(entry.id);
    return {
      ...roadDefaults,
      id: entry.id,
      name: text(entry.name, "Road"),
      start: entry.start,
      end: entry.end,
      h1: vec(entry.h1),
      h2: vec(entry.h2),
      lanes: Math.round(number(entry.lanes, 2, 1, 6)),
      laneWidth: number(entry.laneWidth, 3.5, 2, 6),
      railHeight: number(entry.railHeight, 0.8, 0.5, 1.4),
      postSpacing: number(entry.postSpacing, 3.4, 1.5, 6),
      sidewalk: number(entry.sidewalk, 2.4, 0, 6),
      crossfall: number(entry.crossfall, 2, 0, 8),
      inletSpacing: number(entry.inletSpacing, 18, 6, 80),
      surface: ["asphalt", "concrete", "cobble"].includes(String(entry.surface))
        ? (entry.surface as Surface)
        : "asphalt",
      pattern: ["herringbone", "running", "slabs", "basket"].includes(
        String(entry.pattern),
      )
        ? (entry.pattern as Pattern)
        : "herringbone",
      structure: entry.structure === "steel" ? "steel" : "concrete",
      markings: entry.markings !== false,
      guardrails: entry.guardrails === true,
      drainage: entry.drainage !== false,
      bridge: entry.bridge === true,
      oneWay: entry.oneWay === true,
    };
  });
  const project: Project = {
    version: 1,
    name: text(data.name, "Imported network"),
    nodes,
    roads,
  };
  validateGenerationBudget(project);
  return project;
}

/** A bounded editor tile protects both imported and interactively edited graphs
 * from enormous meshes/inlet counts. Larger worlds can export multiple tiles. */
export function validateGenerationBudget(project: Project): void {
  if (project.roads.length > 500 || project.nodes.length > 1500)
    throw new RangeError("Editor tile limit: 500 roads and 1,500 nodes.");
  let total = 0,
    minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const road of project.roads) {
    const points = controlPoints(project, road);
    const estimated =
      distance(points[0], points[1]) +
      distance(points[1], points[2]) +
      distance(points[2], points[3]);
    if (!Number.isFinite(estimated) || estimated > 5000)
      throw new RangeError(
        "An alignment must be shorter than 5 km. Split this road into a separate editor tile.",
      );
    total += estimated;
    for (const point of points) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minZ = Math.min(minZ, point[2]);
      maxZ = Math.max(maxZ, point[2]);
    }
  }
  if (total > 35000)
    throw new RangeError(
      "Editor tile generation budget exceeded: 35 km of control-polygon length.",
    );
  if (maxX - minX > 5000 || maxZ - minZ > 5000)
    throw new RangeError("The editor tile must fit inside a 5 × 5 km area.");
}
