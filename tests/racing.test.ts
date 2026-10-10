import { meshSurfaceY } from "../src/core/road-details";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeTemplate,
  makeNode,
  makeRoad,
  parseProject,
  patterns,
  validateGenerationBudget,
  type Project,
} from "../src/core/model";
import {
  buildNetwork,
  effectiveCrossing,
  edgePoint,
  type Network,
} from "../src/core/geometry";
import { deleteSelection, moveNode } from "../src/core/editing";
import {
  makeSite,
  siteOutline,
  sitePoint,
  insidePolygon,
} from "../src/core/sites";
import { parkingLayout, parkingPlan } from "../src/core/site-geometry";
import {
  simplePolygon,
  polygonArea,
  distance,
  add,
  type V3,
} from "../src/core/math";
import { exportOBJ } from "../src/core/export";
function finite(n: Network) {
  for (const m of n.meshes) {
    assert(m.positions.every(Number.isFinite), m.name);
    assert(m.uvs.every(Number.isFinite));
    assert.equal(m.positions.length / 3, m.uvs.length / 2);
    assert(
      m.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < m.positions.length / 3,
      ),
    );
  }
}
function mouths(n: Network) {
  for (const j of n.junctions) {
    const mesh = n.meshes.find(
      (m) => m.owner === j.node.id && m.kind === "asphalt",
    )!;
    for (const a of j.arms)
      for (const p of [a.left, a.center, a.right])
        assert(
          mesh.positions.some(
            (_, i) =>
              i % 3 === 0 &&
              distance(p, mesh.positions.slice(i, i + 3) as V3) < 1e-7,
          ),
        );
  }
}
function acute(degrees: number): Project {
  const c = makeNode([0, 0, 0], "Merge"),
    radians = (degrees * Math.PI) / 180,
    a = makeNode([-140, 0, 0]),
    b = makeNode([94, 0, 0]),
    r = makeNode([94 * Math.cos(radians), 0, 94 * Math.sin(radians)]);
  return {
    version: 1,
    name: "94 m merge fixture",
    nodes: [c, a, b, r],
    roads: [
      makeRoad(a, c, "Approach"),
      makeRoad(c, b, "Through"),
      makeRoad(
        r,
        c,
        "Ramp",
        { lanes: 2, sidewalk: 3.8, oneWay: true },
        undefined,
        undefined,
      ),
    ],
  };
}
function triangleUp(mesh: Network["meshes"][number]) {
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.slice(i, i + 3).map((v) => v * 3),
      p = mesh.positions;
    assert(
      (p[b + 2] - p[a + 2]) * (p[c] - p[a]) -
        (p[b] - p[a]) * (p[c + 2] - p[a + 2]) >
        1e-10,
      mesh.name,
    );
  }
}
describe("acute merge runout and pinned seams", () => {
  for (const angle of [15, 22, 35])
    it(`${angle} degree, 94 m approaches reserve the full fillet runout`, () => {
      const p = acute(angle),
        n = buildNetwork(p);
      assert.equal(n.diagnostics.length, 0);
      finite(n);
      mouths(n);
      const through = n.spans[1];
      if (angle < 25) assert(through.frames[0].s > 94 * 0.43 + 4);
      assert(through.frames.at(-1)!.s - through.frames[0].s >= 4);
      assert.equal(n.junctions[0].type, "Merge");
      assert(!effectiveCrossing(p, p.nodes[0].id));
      for (const j of n.junctions) {
        assert(simplePolygon(j.outer));
        assert(simplePolygon(j.boundary));
        for (const curve of j.corners)
          assert(curve.every((p) => p.every(Number.isFinite)));
      }
    });
  it("manual paving setback changes mouths without moving the shared pivot", () => {
    const p = acute(22),
      n = buildNetwork(p),
      position = [...p.nodes[0].position];
    p.nodes[0].setback = 8;
    const after = buildNetwork(p);
    assert.equal(after.spans[1].frames[0].s - n.spans[1].frames[0].s, 8);
    assert.deepEqual(p.nodes[0].position, position);
    mouths(after);
  });
  it("both ends share a length budget and report an impossible requested radius", () => {
    const p = acute(15),
      other = p.nodes[2];
    const east = makeNode([234, 0, 0]),
      branch = makeNode([
        94 - 140 * Math.cos(Math.PI / 12),
        0,
        140 * Math.sin(Math.PI / 12),
      ]);
    p.nodes.push(east, branch);
    p.roads.push(
      makeRoad(other, east, "East"),
      makeRoad(other, branch, "Second ramp"),
    );
    const n = buildNetwork(p),
      s = n.spans[1];
    assert(s.frames[0].s > 0 && s.frames.at(-1)!.s < s.alignment.length);
    assert(Math.abs(s.length - 4) < 1e-6);
    assert(
      n.diagnostics.some((d) => d.level === "warning" && d.owner === s.road.id),
    );
    finite(n);
    mouths(n);
  });
  it("wide inward paving offsets do not fold the acute nose", () => {
    const p = acute(15);
    p.roads.forEach((r) => (r.sidewalk = 6));
    p.nodes[0].radius = 3;
    const n = buildNetwork(p);
    assert(!n.diagnostics.some((d) => d.level === "error"));
    finite(n);
    assert(simplePolygon(n.junctions[0].outer));
    mouths(n);
  });
});
describe("racing and urban templates", () => {
  for (const name of [
    "merge",
    "urban",
    "signal",
    "cloverleaf",
    "trumpet",
    "race",
    "waterfront",
  ])
    it(`${name}: valid, round-trippable, connected graph with real detail`, () => {
      const p = makeTemplate(name),
        n = buildNetwork(p);
      assert.deepEqual(parseProject(p), p);
      assert.equal(n.diagnostics.length, 0);
      finite(n);
      mouths(n);
      const seen = new Set([p.nodes[0].id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const r of p.roads)
          if (seen.has(r.start) !== seen.has(r.end)) {
            seen.add(r.start);
            seen.add(r.end);
            changed = true;
          }
      }
      assert.equal(seen.size, p.nodes.length);
      for (const m of n.meshes.filter((m) => m.kind === "asphalt"))
        triangleUp(m);
    });
  it("cloverleaf and trumpet crossings have useful clearance, not false at-grade merges", () => {
    for (const name of ["cloverleaf", "trumpet"]) {
      const n = buildNetwork(makeTemplate(name));
      assert(n.clearances.length > 0);
      assert(Math.min(...n.clearances.map((c) => c.meters)) > 5.1);
      assert(n.maxGrade < 7);
      assert(n.meshes.some((m) => m.material === "girder"));
    }
  });
  it("racing circuit is a closed one-way graph with rumble strips, grid and barriers", () => {
    const p = makeTemplate("race"),
      sectors = p.roads.filter((r) => r.name.startsWith("Grand prix")),
      n = buildNetwork(p);
    assert.equal(sectors.length, 8);
    for (let i = 0; i < sectors.length; i++) {
      assert(sectors[i].oneWay);
      assert.equal(sectors[i].end, sectors[(i + 1) % sectors.length].start);
    }
    assert.equal(sectors.filter((r) => r.startingGrid).length, 1);
    assert(n.meshes.some((m) => m.material === "race-curb"));
    assert(n.meshes.some((m) => m.material === "rubber"));
    assert(n.meshes.some((m) => m.kind === "rail" && m.material === "curb"));
  });
  it("signalized junction paint is projected onto and contained by the asphalt", () => {
    const p = makeTemplate("signal");
    p.nodes.find((n) => n.boxJunction)!.signals = true;
    const n = buildNetwork(p),
      j = n.junctions.find((j) => j.node.signals)!;
    assert(
      n.meshes.some(
        (m) => m.owner === j.node.id && m.material === "signal-green",
      ),
    );
    assert(
      n.meshes.some((m) => m.owner === j.node.id && m.material === "yellow"),
    );
    const paint = n.meshes.filter(
      (m) => m.owner === j.node.id && m.kind === "marking",
    );
    for (const m of paint)
      for (let i = 0; i < m.positions.length; i += 3) {
        const point = m.positions.slice(i, i + 3) as V3;
        assert(insidePolygon(point, j.boundary));
        const asphalt = n.meshes.find(
          (m) => m.owner === j.node.id && m.kind === "asphalt",
        )!;
        assert(
          Math.abs(point[1] - meshSurfaceY(asphalt, point)! - 0.023) < 1e-7,
        );
      }
  });
  it("front-facing sign decals use normalized UVs rather than world projection", () => {
    const p = makeTemplate("merge");
    p.roads.forEach((r) => (r.signs = true));
    const n = buildNetwork(p);
    for (const m of n.meshes.filter((m) => m.material.startsWith("sign-"))) {
      assert(m.uvs.every((v) => v >= -1e-8 && v <= 1 + 1e-8));
      assert(m.indices.length > 0);
    }
    assert(n.meshes.some((m) => m.material === "sign-yield"));
  });
  it("pavement curb changes force a transition joint instead of open seams", () => {
    const a = makeNode([-80, 0, 0]),
      b = makeNode([0, 0, 0]),
      c = makeNode([80, 0, 0]),
      p: Project = {
        version: 1,
        name: "Profile transition",
        nodes: [a, b, c],
        roads: [
          makeRoad(a, b, "Stone"),
          makeRoad(b, c, "Rumble", { curbStyle: "race" }),
        ],
      };
    const n = buildNetwork(p);
    assert.equal(n.junctions.length, 1);
    assert.equal(n.diagnostics.length, 0);
    mouths(n);
  });
  it("all nine paving patterns, pedestrian rails and flush profiles generate finite geometry", () => {
    for (const pattern of patterns) {
      const p = makeTemplate("tee");
      p.roads.forEach((r) =>
        Object.assign(r, {
          pattern,
          surface: "pavers",
          curbStyle: "flush",
          guardrails: true,
          railStyle: "railing",
        }),
      );
      const n = buildNetwork(p);
      finite(n);
      assert(n.meshes.some((m) => m.material === `paving-${pattern}`));
      assert(n.meshes.some((m) => m.kind === "rail" && m.material === "pole"));
      mouths(n);
    }
  });
  it("wide/high-crossfall carriageway edges remain above the preview ground", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r) => {
      r.lanes = 6;
      r.laneWidth = 6;
      r.crossfall = 8;
    });
    const n = buildNetwork(p);
    for (const span of n.spans)
      for (const f of span.frames)
        for (const side of [-1, 1])
          assert(edgePoint(f, side, "road")[1] >= 0.039);
    finite(n);
  });
});
describe("editable sites and parking", () => {
  for (const kind of ["parking", "plaza", "island"] as const)
    it(`${kind}: standalone mesh ownership and finite indexed geometry`, () => {
      const site = makeSite(kind, [17, 0, -24]);
      site.yaw = 35;
      const p: Project = {
          version: 1,
          name: "Site fixture",
          nodes: [],
          roads: [],
          sites: [site],
        },
        n = buildNetwork(p);
      assert(n.meshes.length > 0);
      assert(
        n.meshes.every((m) => m.owner === site.id && m.ownerKind === "site"),
      );
      finite(n);
      assert.deepEqual(parseProject(p), p);
    });
  it("triangular paving is genuinely inset from every edge, including the hypotenuse", () => {
    const site = makeSite("island", [0, 0, 0]);
    const outline = siteOutline(site),
      inner = siteOutline(site, 2);
    assert(inner.every((p) => insidePolygon(p, outline)));
    assert(inner.every((p) => p[0] + p[2] < -2.7));
    assert(simplePolygon(inner));
    assert(Math.abs(polygonArea(inner)) < Math.abs(polygonArea(outline)) * 0.6);
  });
  it("parking keeps the entry throat clear and makes accessible spaces wider", () => {
    const site = makeSite("parking", [0, 0, 0]),
      layout = parkingLayout(site);
    assert(layout.some((s) => s.accessible && s.width > 3.3));
    assert(
      layout
        .filter((s) => s.side === -1)
        .every((s) =>
          s.corners.every(([x]) => Math.abs(x) >= site.entryWidth / 2 + 0.15),
        ),
    );
    const n = buildNetwork({
      version: 1,
      name: "Parking",
      nodes: [],
      roads: [],
      sites: [site],
    });
    assert.equal(n.parkingSpaces, layout.length);
    assert(n.meshes.some((m) => m.material === "marking-accessible"));
    assert(
      !n.meshes.some((m) =>
        ["building", "lamp", "sign", "landscape"].includes(m.kind),
      ),
    );
    assert(!n.meshes.some((m) => m.material === "wheel-stop"));
  });
  it("round/triangular courts never put rectangular bays outside the actual footprint", () => {
    for (const shape of ["circle", "triangle"] as const) {
      const site = makeSite("parking", [0, 0, 0]);
      site.shape = shape;
      const inner = siteOutline(site, 1.8);
      for (const slot of parkingLayout(site))
        for (const a of [-1, 1])
          for (const b of [-1, 1])
            assert(
              insidePolygon(
                sitePoint(
                  site,
                  slot.x + a * (slot.width / 2 - 0.05),
                  slot.z + b * 2.65,
                ),
                inner,
              ),
            );
    }
  });
  it("site deletion does not mutate the connected road graph", () => {
    const p = makeTemplate("district"),
      graph = JSON.stringify({ nodes: p.nodes, roads: p.roads }),
      id = p.sites![0].id;
    deleteSelection(p, "site", id);
    assert.equal(JSON.stringify({ nodes: p.nodes, roads: p.roads }), graph);
    assert(!p.sites!.some((s) => s.id === id));
  });
  it("road edits do not move independent parking surfaces", () => {
    const p = makeTemplate("urban"),
      sites = JSON.stringify(p.sites);
    moveNode(p, p.nodes[0].id, add(p.nodes[0].position, [2, 0, 1]));
    assert.equal(JSON.stringify(p.sites), sites);
    finite(buildNetwork(p));
  });
  it("older graph-only JSON receives backward-compatible defaults", () => {
    const raw = JSON.parse(JSON.stringify(makeTemplate("tee")));
    delete raw.sites;
    raw.nodes.forEach((n: Record<string, unknown>) => {
      delete n.setback;
      delete n.boxJunction;
      delete n.signals;
    });
    raw.roads.forEach((r: Record<string, unknown>) => {
      for (const key of [
        "curbStyle",
        "railStyle",
        "markingStyle",
        "markingSetback",
        "signs",
        "speedLimit",
        "streetLights",
        "parking",
        "median",
        "startingGrid",
      ])
        delete r[key];
    });
    const p = parseProject(raw);
    assert.equal(p.roads[0].railStyle, "wbeam");
    assert.equal(p.roads[0].markingSetback, 2);
    assert.equal(p.nodes[0].setback, 0);
    finite(buildNetwork(p));
  });
  it("invalid and overly dense site imports are rejected before allocating meshes", () => {
    const site = makeSite("parking", [0, 0, 0]);
    site.bayDepth = Infinity;
    const p: Project = {
      version: 1,
      name: "Oversized",
      nodes: [],
      roads: [],
      sites: [site],
    };
    assert.throws(() => validateGenerationBudget(p), /Invalid.*parking/);
    site.bayDepth = 5.2;
    site.width = 250;
    site.depth = 400;
    p.sites = Array.from({ length: 20 }, () => structuredClone(site));
    assert.throws(() => validateGenerationBudget(p), /detail budget/);
    const raw = makeTemplate("district");
    raw.sites![0].position = [NaN, 0, 0];
    assert.throws(() => parseProject(raw), /site position/);
  });
  it("placing a paving footprint across live road geometry reports the obstruction", () => {
    const p = makeTemplate("tee"),
      block = makeSite("plaza", [0, 0, 0]);
    p.sites = [block];
    const n = buildNetwork(p);
    assert(
      n.diagnostics.some(
        (d) => d.owner === block.id && /encroaches/.test(d.message),
      ),
    );
  });
  it("OBJ material UV transforms and texture paths agree with the standalone renderer", () => {
    const n = buildNetwork(makeTemplate("race"));
    const { mtl, obj } = exportOBJ(n, "race", {
      "race-curb": {
        path: "textures/race-curb.png",
        scale: [1 / 3, 1],
        alpha: false,
      },
      "paving-ashlar": {
        path: "textures/paving-ashlar.png",
        scale: [0.5, 0.5],
        alpha: false,
      },
    });
    assert(
      mtl.includes("map_Kd -s 0.3333333333333333 1 1 textures/race-curb.png"),
    );
    assert(mtl.includes("map_Kd -s 0.5 0.5 1 textures/paving-ashlar.png"));
    assert(!obj.includes("NaN"));
  });
});

describe("road-only authoring and procedural parking modules", () => {
  it("no default template generates environment props or city architecture", () => {
    for (const id of [
      "district",
      "urban",
      "merge",
      "signal",
      "race",
      "cloverleaf",
      "trumpet",
      "waterfront",
      "tee",
      "roundabout",
      "diamond",
    ]) {
      const p = makeTemplate(id),
        n = buildNetwork(p);
      assert(!p.sites?.some((s) => s.kind === "block" || s.kind === "water"));
      assert(
        !n.meshes.some(
          (m) =>
            ["building", "landscape", "lamp"].includes(m.kind) ||
            (m.kind === "sign" &&
              !(
                m.ownerKind === "node" &&
                p.nodes.find((n) => n.id === m.owner)?.signals
              )),
        ),
        id,
      );
    }
  });
  it("legacy architecture is ignored without changing the editable road graph", () => {
    const p = makeTemplate("district"),
      roads = structuredClone(p.roads);
    p.sites!.push(makeSite("block", [0, 0, 0]), makeSite("water", [0, 0, 0]));
    const parsed = parseProject(p);
    assert.deepEqual(parsed.roads, roads);
    assert(
      !parsed.sites?.some((s) => s.kind === "block" || s.kind === "water"),
    );
  });
  it("increasing footprint dimensions regenerates row count and capacity automatically", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.accessible = 0;
    s.depth = 25;
    const small = parkingPlan(s);
    s.depth = 58;
    const deep = parkingPlan(s);
    assert(deep.rows > small.rows);
    assert(deep.bays.length > small.bays.length);
    s.width = 94;
    const wide = parkingPlan(s);
    assert(wide.bays.length > deep.bays.length);
    assert.equal(s.bays, 0);
  });
  for (const angle of [45, 60, 90] as const)
    it(`${angle}° slots have exact dimensions and stay outside the entry spine`, () => {
      const s = makeSite("parking", [0, 0, 0]);
      s.width = 80;
      s.depth = 65;
      s.parkingAngle = angle;
      const p = parkingPlan(s),
        polygon = siteOutline(s, s.perimeterWidth + 0.22);
      assert(p.bays.length > 15);
      for (const b of p.bays) {
        assert.equal(b.angle, angle);
        const [a, z, c] = b.corners;
        assert(Math.abs(Math.hypot(a[0] - z[0], a[1] - z[1]) - b.width) < 1e-8);
        assert(Math.abs(Math.hypot(z[0] - c[0], z[1] - c[1]) - b.depth) < 1e-8);
        assert(
          b.corners.every(([x, z]) =>
            insidePolygon(sitePoint(s, x, z), polygon),
          ),
        );
        assert(b.corners.every(([x]) => Math.abs(x) > s.entryWidth / 2));
      }
      finite(
        buildNetwork({
          version: 1,
          name: "Angle",
          nodes: [],
          roads: [],
          sites: [s],
        }),
      );
    });
  it("changing drive aisle width changes module count, not just a UI label", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.depth = 54;
    s.aisleWidth = 4;
    const a = parkingPlan(s);
    s.aisleWidth = 9;
    const b = parkingPlan(s);
    assert(a.rows > b.rows);
    assert(b.aisles.every((a) => a.width === 9));
  });
  it("row modes deliberately produce single, double or repeated modules", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.depth = 70;
    s.parkingLayout = "single";
    assert.equal(parkingPlan(s).rows, 1);
    s.parkingLayout = "double";
    assert.equal(parkingPlan(s).rows, 2);
    s.parkingLayout = "automatic";
    assert(parkingPlan(s).rows >= 6);
  });
  it("small footprints return an explicit layout warning rather than fake stalls", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.depth = 8;
    assert.equal(parkingPlan(s).bays.length, 0);
    assert(parkingPlan(s).warnings.length > 0);
    const n = buildNetwork({
      version: 1,
      name: "small",
      nodes: [],
      roads: [],
      sites: [s],
    });
    assert(n.diagnostics.some((d) => d.owner === s.id));
  });
});
