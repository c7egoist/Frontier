/** Original, directionally connected road layouts. No scenery/building meshes.
 * Coordinates are metres. Motorway grade separation is in the graph, not props.
 */
import {
  makeNode,
  makeRoad,
  presets,
  type Project,
  type RoadNode,
  type RoadSettings,
} from "./model";
import { makeSite } from "./sites";
import { splitRoad } from "./editing";
import { sub, type V3 } from "./math";

const highway: Partial<RoadSettings> = {
  lanes: 2,
  laneWidth: 3.5,
  shoulderWidth: 1,
  oneWay: true,
  guardrails: true,
  railHeight: 0.95,
  postSpacing: 2.5,
  curbStyle: "flush",
  curbHeight: 0.05,
  markingStyle: "motorway",
  markingSetback: 1,
  signs: false,
  drainage: false,
  manholes: false,
  cornerRamps: false,
  speedLimit: 100,
  sidewalk: 0.8,
  structure: "steel",
  bridgeDepth: 1.25,
  pierSpacing: 32,
  railStyle: "boxbeam",
  crossfall: 1.5,
};
const ramp: Partial<RoadSettings> = {
  ...highway,
  lanes: 1,
  laneWidth: 3.8,
  shoulderWidth: 0.45,
  sidewalk: 0.6,
  railStyle: "thrie",
  railHeight: 0.95,
  postSpacing: 2.5,
  speedLimit: 60,
  bridge: true,
  structure: "concrete",
  bridgeDepth: 1.05,
};
function author(name: string) {
  const project: Project = {
    version: 1,
    name,
    nodes: [],
    roads: [],
    sites: [],
  };
  const node = (name: string, point: V3, radius = 3, crossings = false) => {
    const n = makeNode(point, name);
    n.radius = radius;
    n.crossings = crossings;
    project.nodes.push(n);
    return n;
  };
  const road = (
    a: RoadNode,
    b: RoadNode,
    name: string,
    settings: Partial<RoadSettings>,
    h1?: V3,
    h2?: V3,
  ) => {
    const r = makeRoad(a, b, name, settings, h1, h2);
    // Level grade tangents at landings/bridge seams; handles remain editable.
    r.h1[1] = 0;
    r.h2[1] = 0;
    project.roads.push(r);
    return r;
  };
  return { project, node, road };
}
type Author = ReturnType<typeof author>;
const rotate = (p: V3, quadrant: number): V3 => {
  const a = (-quadrant * Math.PI) / 2,
    c = Math.cos(a),
    s = Math.sin(a);
  return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
};
function cloverleaf(tInterchange = false) {
  const a = author(
      tInterchange
        ? "Twin-loop T interchange · three connected arms"
        : "Divided cloverleaf · connected flyovers",
    ),
    { node, road, project } = a;
  const labels = ["Eastbound", "Northbound", "Westbound", "Southbound"];
  const stations = [-900, -700, -480, -50, 50, 480, 700, 900];
  const rows = labels.map((label, q) =>
    stations
      .filter(
        (s) => !tInterchange || ((q !== 1 || s >= -50) && (q !== 3 || s <= 50)),
      )
      .map((s) => {
        const y = q % 2 && Math.abs(s) <= 700 ? 8 : 0;
        return node(
          `${label} · ${s < 0 ? "in" : "out"} ${Math.abs(s)} m`,
          rotate([s, y, 7], q),
          2.8,
        );
      }),
  );
  rows.forEach((row, q) =>
    row.slice(0, -1).forEach((n, i) => {
      road(n, row[i + 1], `${labels[q]} motorway · ${i + 1}`, {
        ...highway,
        bridge:
          q % 2 === 1 && (n.position[1] > 0 || row[i + 1].position[1] > 0),
      });
    }),
  );
  const r = 45,
    k = r * 0.5522847498307936;
  for (let q = 0; q < 4; q++) {
    const port = (quadrant: number, s: number) =>
      rows[quadrant].find(
        (n) => Math.abs(rotate(n.position, -quadrant)[0] - s) < 1e-5,
      )!;
    if (!tInterchange || q === 0 || q === 3) {
      const source = port(q, 50),
        target = port((q + 1) % 4, -50),
        sy = source.position[1],
        ey = target.position[1];
      const points: V3[] = [
        [110, 0, 65],
        [155, 0, 110],
        [110, 0, 155],
        [65, 0, 110],
      ];
      const ring = points.map((p, i) => {
        const point = rotate(p, q);
        point[1] = sy + ((ey - sy) * (i + 1)) / 5;
        return node(`${labels[q]} left-turn loop · ${i + 1}`, point, 1.2);
      });
      const loopSettings = { ...ramp, speedLimit: 40 };
      road(
        source,
        ring[0],
        `${labels[q]} loop · diverge`,
        loopSettings,
        rotate([30, 0, 13], q),
        rotate([-24, 0, 0], q),
      );
      const handles: [V3, V3][] = [
        [
          [k, 0, 0],
          [0, 0, -k],
        ],
        [
          [0, 0, k],
          [k, 0, 0],
        ],
        [
          [-k, 0, 0],
          [0, 0, k],
        ],
      ];
      for (let i = 0; i < 3; i++)
        road(
          ring[i],
          ring[i + 1],
          `${labels[q]} loop · 90° ${i + 1}`,
          loopSettings,
          rotate(handles[i][0], q),
          rotate(handles[i][1], q),
        );
      road(
        ring[3],
        target,
        `${labels[q]} loop · merge`,
        loopSettings,
        rotate([0, 0, -24], q),
        rotate([13, 0, 30], q),
      );
    }
    if (!tInterchange || q === 2 || q === 3)
      road(
        port(q, -480),
        port((q + 3) % 4, 480),
        `${labels[q]} direct right-turn connector`,
        {
          ...ramp,
          structure: "steel",
          bridgeDepth: 1.25,
          railStyle: "wbeam",
        },
        rotate([250, 0, 40], q),
        rotate([-40, 0, -250], q),
      );
  }
  return project;
}
/** Directional diamond: lower city avenue joins both elevated carriageways
 * through four genuine graph ramps. The centre underpass has no at-grade joint.
 */
function diamond(a: Author, x: number, west?: RoadNode) {
  const { node, road } = a;
  const values = [-700, -480, -285, -115, 115, 285, 480, 700];
  const south = values.map((z) =>
    node(
      `Southbound ${Math.abs(z)} m`,
      [x - 7, Math.abs(z) <= 285 ? 8 : 0, z],
      2.8,
    ),
  );
  const north = [...values]
    .reverse()
    .map((z) =>
      node(
        `Northbound ${Math.abs(z)} m`,
        [x + 7, Math.abs(z) <= 285 ? 8 : 0, z],
        2.8,
      ),
    );
  for (const [label, row] of [
    ["Southbound", south],
    ["Northbound", north],
  ] as [string, RoadNode[]][])
    row.slice(0, -1).forEach((n, i) =>
      road(n, row[i + 1], `${label} highway · ${i + 1}`, {
        ...highway,
        bridge: n.position[1] > 0 || row[i + 1].position[1] > 0,
      }),
    );
  const w = node("West ramp terminals", [x - 110, 0, 0], 5.2, true),
    e = node("East ramp terminals", [x + 110, 0, 0], 5.2, true);
  const street: Partial<RoadSettings> = {
    lanes: 2,
    laneWidth: 3.25,
    sidewalk: 3.4,
    cycleMode: "protected",
    cycleWidth: 1.8,
    cycleSeparator: 0.5,
    pattern: "linear",
    curbDrainType: "side-entry",
    streetLights: !!west,
    signs: !!west,
    speedLimit: 50,
  };
  const boundary = west ?? node("City west approach", [x - 260, 0, 0], 5.2);
  road(boundary, w, "City bridge approach · West", street);
  road(w, e, "Lower avenue · continuous underpass", street);
  road(
    e,
    node("City east approach", [x + 260, 0, 0], 5.2),
    "City bridge approach · East",
    street,
  );
  road(
    south[2],
    w,
    "Southbound exit · connected descent",
    ramp,
    [-15, 0, 130],
    [35, 0, -55],
  );
  road(
    w,
    south[5],
    "Southbound entry · connected ascent",
    ramp,
    [35, 0, 55],
    [-15, 0, -130],
  );
  road(
    north[2],
    e,
    "Northbound exit · connected descent",
    ramp,
    [15, 0, -130],
    [-35, 0, 55],
  );
  road(
    e,
    north[5],
    "Northbound entry · connected ascent",
    ramp,
    [-35, 0, -55],
    [15, 0, 130],
  );
  return a.project;
}
function city() {
  const a = author("Connected city network · streets and highway bridges"),
    { project, node, road } = a;
  const coords = [-280, -140, 0, 140, 280],
    grid = coords.map((z) =>
      coords.map((x) =>
        node(
          `${x === 0 ? "Central avenue" : `Street ${x / 140 + 3}`} / ${z === 0 ? "Civic boulevard" : `Cross street ${z / 140 + 3}`}`,
          [x, 0, z],
          5.5,
          true,
        ),
      ),
    );
  grid[2][2].signals = true;
  const local: Partial<RoadSettings> = {
    lanes: 2,
    laneWidth: 3.05,
    sidewalk: 3.2,
    parking: "parallel",
    curbExtensions: true,
    pattern: "herringbone",
    speedLimit: 30,
    streetLights: true,
    signs: true,
    curbDrainType: "side-entry",
    manholeSpacing: 48,
  };
  const boulevard: Partial<RoadSettings> = {
    ...presets.find((p) => p.id === "euro-boulevard")!.settings,
    lanes: 4,
    laneWidth: 3.15,
    median: 1.8,
    sidewalk: 4.6,
    treePits: true,
    pitWidth: 1.4,
    pitLength: 2.4,
    pitSpacing: 22,
    curbDrainType: "side-entry",
    streetLights: true,
    manholeSpacing: 48,
  };
  for (let z = 0; z < 5; z++)
    for (let x = 0; x < 4; x++)
      road(
        grid[z][x],
        grid[z][x + 1],
        z === 2
          ? `Civic boulevard · ${x + 1}`
          : `Neighbourhood street ${z + 1} · ${x + 1}`,
        z === 2
          ? boulevard
          : { ...local, sharedCycleStreet: z === 1 || z === 3 },
      );
  for (let x = 0; x < 5; x++)
    for (let z = 0; z < 4; z++)
      road(
        grid[z][x],
        grid[z + 1][x],
        x === 2
          ? `Central avenue · ${z + 1}`
          : `Local connector ${x + 1} · ${z + 1}`,
        x === 2
          ? {
              ...boulevard,
              busLanes: "none",
              cycleMode: "painted",
              median: 1.4,
            }
          : local,
      );
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 4; x++) {
      const cx = (coords[x] + coords[x + 1]) / 2,
        cz = (coords[z] + coords[z + 1]) / 2;
      const block = makeSite("urban-block", [cx, 0, cz]);
      Object.assign(block, {
        name: `Open city plot ${z * 4 + x + 1} · no buildings`,
        width: 84,
        depth: 84,
        blockBand: 2.8,
        blockInterior: "open",
        blockEntrySide: "north",
        blockEntryWidth: 10,
        pattern: "linear",
        cornerRadius: 2.2,
      });
      project.sites!.push(block);
      if (z % 3 === 0 && x % 3 === 0) {
        const court = makeSite("parking", [cx, 0, cz]);
        Object.assign(court, {
          name: `Connected parking court ${z * 4 + x + 1}`,
          width: 60,
          depth: 46,
          entrance: "north",
          entryWidth: 10,
          parkingIslands: true,
          islandEvery: 5,
          evBays: 4,
          bayFinish: "permeable",
          bays: 0,
        });
        project.sites!.push(court);
        const host = project.roads.find(
          (r) => r.start === grid[z][x].id && r.end === grid[z][x + 1].id,
        )!;
        const connection = splitRoad(project, host.id, 0.5);
        connection.name = `Parking access ${z * 4 + x + 1}`;
        connection.crossings = false;
        connection.radius = 3;
        const gate = node(
          `Court entrance ${z * 4 + x + 1}`,
          [cx, 0, cz - 23],
          2.5,
        );
        road(connection, gate, "Parking access · connected gate", {
          lanes: 2,
          laneWidth: 3,
          sidewalk: 0.8,
          cornerRamps: false,
          crossfall: 0,
          markings: false,
          drainage: false,
          manholes: false,
          speedLimit: 20,
          curbStyle: "flush",
        });
      }
    }
  // Continuous protected underpass links the city grid to the motorway ramps.
  diamond(a, 460, grid[2][4]);
  return project;
}
function dumbbell() {
  const a = author("Dumbbell junction · linked roundabouts"),
    { node, road, project } = a,
    radius = 19;
  const circles = [-78, 78].map((cx, q) => {
    const points = Array.from({ length: 8 }, (_, i) => {
      const angle = (-i * Math.PI) / 4;
      return node(
        `${q ? "East" : "West"} roundabout · ${i + 1}`,
        [cx + Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
        2.4,
      );
    });
    for (let i = 0; i < 8; i++) {
      const angle = (-i * Math.PI) / 4,
        next = (-(i + 1) * Math.PI) / 4,
        h = ((radius * 4) / 3) * Math.tan(Math.PI / 16);
      road(
        points[i],
        points[(i + 1) % 8],
        `${q ? "East" : "West"} circulation · ${i + 1}`,
        {
          lanes: 1,
          laneWidth: 5.5,
          oneWay: true,
          sidewalk: 3.2,
          markingSetback: 0.5,
          cornerRamps: false,
          drainage: true,
          manholes: false,
          speedLimit: 30,
          pattern: "linear",
        },
        [Math.sin(angle) * h, 0, -Math.cos(angle) * h],
        [-Math.sin(next) * h, 0, Math.cos(next) * h],
      );
    }
    const center = makeSite("plaza", [cx, 0, 0]);
    Object.assign(center, {
      name: `${q ? "East" : "West"} roundabout central paving`,
      width: 29,
      depth: 29,
      shape: "circle",
      pattern: "slate",
      cornerRadius: 2,
    });
    project.sites!.push(center);
    return points;
  });
  const approach: Partial<RoadSettings> = {
    lanes: 2,
    laneWidth: 3.2,
    sidewalk: 3.6,
    pattern: "linear",
    signs: true,
    speedLimit: 30,
  };
  road(
    circles[0][0],
    circles[1][4],
    "Roundabout link · two-way avenue",
    approach,
  );
  for (let q = 0; q < 2; q++)
    for (const [i, dx, dz] of [
      [q ? 0 : 4, q ? 125 : -125, 0],
      [2, 0, -125],
      [6, 0, 125],
    ]) {
      const n = circles[q][i],
        end = node(
          `${q ? "East" : "West"} approach ${i}`,
          [n.position[0] + dx, 0, n.position[2] + dz],
          4,
        );
      road(end, n, `Roundabout approach · ${q + 1}/${i}`, approach);
    }
  return project;
}
export function makeConnectedTemplate(id: string): Project | null {
  if (id === "cloverleaf") return cloverleaf();
  if (id === "trumpet") return cloverleaf(true);
  if (id === "city") return city();
  if (id === "bridge" || id === "diamond")
    return diamond(
      author(
        id === "bridge"
          ? "Connected highway bridge · directional ramps"
          : "Divided diamond interchange",
      ),
      0,
    );
  if (id === "dumbbell") return dumbbell();
  return null;
}
