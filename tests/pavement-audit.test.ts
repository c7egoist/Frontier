import { makeSite } from "../src/core/sites";
import { insertConnectedBridge } from "../src/core/bridge-insertion";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import { buildNetwork, MeshBuilder, type MeshData } from "../src/core/geometry";
import {
  measureSurfaceClearances,
  measureSurfaceJoins,
} from "../src/core/pavement-audit";
import { detectCrossings } from "../src/core/editing";
import { exportMeshManifest } from "../src/core/export";
const close = (a: number, b: number, e = 1e-7) =>
  assert(Math.abs(a - b) < e, `${a} != ${b}`);
const settings: Partial<RoadSettings> = {
  lanes: 2,
  laneWidth: 3.65,
  shoulderWidth: 2,
  sidewalk: 0,
  oneWay: true,
  curbStyle: "flush",
  markingStyle: "motorway",
  roadClass: "mainline",
  manholes: false,
  drainage: false,
  signs: false,
};
function joined(
  a: Partial<RoadSettings> = {},
  b: Partial<RoadSettings> = {},
): Project {
  const x = makeNode([-120, 7.2, 0]),
    m = makeNode([0, 7.2, 0]),
    z = makeNode([120, 7.2, 0]);
  return {
    version: 1,
    name: "Surface transition",
    nodes: [x, m, z],
    roads: [
      makeRoad(x, m, "In", { ...settings, ...a }),
      makeRoad(m, z, "Out", { ...settings, ...b }),
    ],
    sites: [],
  };
}
function crossing(slope = 0.06, walk = 0): Project {
  const a = makeNode([-50, 8 - 50 * slope, 0]),
    z = makeNode([50, 8 + 50 * slope, 0]),
    l = makeNode([0, 0, -100]),
    q = makeNode([0, 0, 100]);
  return {
    version: 1,
    name: "Surface clearance",
    nodes: [a, z, l, q],
    roads: [
      makeRoad(a, z, "Upper", {
        ...settings,
        roadClass: "street",
        bridge: true,
        structure: "steel",
        bridgeDepth: 1.6,
      }),
      makeRoad(l, q, "Lower", {
        laneWidth: 3.5,
        sidewalk: walk,
        manholes: false,
        drainage: false,
      }),
    ],
    sites: [],
  };
}
function sheet(
  owner: string,
  kind: MeshData["kind"],
  y: (x: number, z: number) => number,
  x0 = -5,
  x1 = 5,
  z0 = -5,
  z1 = 5,
  down = false,
  material?: string,
) {
  const b = new MeshBuilder(owner, "road");
  b.quad(
    kind,
    material ?? (kind === "structure" ? "girder" : "asphalt"),
    [
      [x0, y(x0, z0), z0],
      [x1, y(x1, z0), z0],
      [x1, y(x1, z1), z1],
      [x0, y(x0, z1), z1],
    ],
    !down,
  );
  return b.output()[0];
}
const physical = (extra: MeshData[] = [], roof = 10, bottom = 7, low = 2) =>
  measureSurfaceClearances(
    [
      sheet("upper", "asphalt", () => roof),
      sheet("upper", "structure", () => bottom, -5, 5, -5, 5, true),
      sheet("lower", "asphalt", () => low),
      ...extra,
    ],
    new Set(["upper"]),
  );

describe("sealed generated pavement transitions", () => {
  it("different crossfall/crown sections get a real fitted transition instead of a centre-height slit", () => {
    const p = joined({ crossfall: 1.5 }, { crossfall: 4 }),
      n = buildNetwork(p),
      j = n.surfaceJoins.find((j) => j.owner === p.nodes[1].id)!;
    assert.equal(n.junctions.length, 1);
    assert.equal(j.transition, "junction");
    assert(j.sealed);
    assert(j.maximumGap < 1e-7);
    assert(j.comparedPoints >= 6);
    assert.deepEqual(n.diagnostics, []);
  });
  it("matching crowned sections remain a direct, zero-gap shared join", () => {
    const p = joined({ crossfall: 1.5 }, { crossfall: 1.5 }),
      n = buildNetwork(p);
    assert.equal(n.junctions.length, 0);
    assert.equal(n.surfaceJoins[0].transition, "direct");
    assert(n.surfaceJoins[0].sealed);
    close(n.surfaceJoins[0].maximumGap, 0);
  });
  it("opposite auxiliary sides cannot bypass a transition merely because their maximum widths match", () => {
    const p = joined(
        {
          auxiliaryLane: "exit",
          trafficSide: "right",
          auxiliaryLength: 40,
          auxiliaryTaper: 20,
        },
        {
          auxiliaryLane: "entry",
          trafficSide: "left",
          auxiliaryLength: 40,
          auxiliaryTaper: 20,
        },
      ),
      n = buildNetwork(p);
    assert.equal(n.junctions.length, 1);
    assert(n.surfaceJoins[0].sealed);
    assert(
      n.generatedSections.some(
        (s) => s.leftAsphaltRange[1] > s.rightAsphaltRange[0],
      ),
    );
  });
  it("a flush motorway edge and flush urban curb are compared by their actual effective profiles", () => {
    const p = joined(
        {},
        {
          markingStyle: "urban",
          roadClass: "street",
          shoulderWidth: 2,
          lanes: 2,
          laneWidth: 5.65,
        },
      ),
      n = buildNetwork(p);
    assert.equal(n.junctions.length, 1);
    assert(n.surfaceJoins[0].sealed);
    assert.deepEqual(n.diagnostics, []);
  });
  it("a lane drop with equal outer pavement width is still represented by a transition", () => {
    const p = joined(
        { lanes: 3, shoulderWidth: 0.175 },
        { lanes: 2, shoulderWidth: 2 },
      ),
      n = buildNetwork(p);
    assert.equal(n.junctions.length, 1);
    assert(n.surfaceJoins[0].sealed);
    assert.deepEqual(n.diagnostics, []);
  });
  it("endpoint curvature narrowing cannot bypass a fitted width transition into a straight neighbour", () => {
    const p = joined({ roadClass: "street" }, { roadClass: "street" });
    p.roads[0].h1 = [20, 0, -60];
    p.roads[0].h2 = [-0.4, 0, 0];
    const n = buildNetwork(p);
    assert(n.junctions.some((j) => j.node.id === p.nodes[1].id));
    assert(n.surfaceJoins.every((j) => j.sealed));
  });
  it("a genuine displaced direct seam is measured rather than reported as sealed", () => {
    const p = joined(),
      n = buildNetwork(p),
      a = n.spans[0].frames.at(-1)!;
    a.crownHeight = (a.crownHeight ?? 0.12) + 0.1;
    const measured = measureSurfaceJoins(n.spans, [], n.meshes)[0];
    assert(!measured.sealed);
    close(measured.maximumGap, 0.1);
  });
  it("generated lane widths report tight-curve narrowing separately from the nominal control", () => {
    const a = makeNode([-12, 0, 0]),
      z = makeNode([12, 0, 0]),
      p: Project = {
        version: 1,
        name: "Narrowed",
        nodes: [a, z],
        roads: [
          makeRoad(
            a,
            z,
            "Tight curve",
            { ...settings, roadClass: "street", sidewalk: 4.2 },
            [0, 0, -32],
            [0, 0, -32],
          ),
        ],
      },
      n = buildNetwork(p),
      m = n.generatedSections[0];
    assert(m.minimumProfileScale < 0.8);
    assert(m.minimumLaneWidth < m.requestedLaneWidth);
    close(m.minimumLaneWidth, m.minimumProfileScale * p.roads[0].laneWidth);
    assert(m.minimumWidthParameter >= 0 && m.minimumWidthParameter <= 1);
    assert(n.diagnostics.some((d) => d.message.includes("narrowed")));
  });
  it("parking-pocket footway widening does not falsely shrink the measured motor lane", () => {
    const c = makeNode([0, 0, 0]);
    c.radius = 10;
    const ends = [
        makeNode([-200, 0, 0]),
        makeNode([200, 0, 0]),
        makeNode([0, 0, -200]),
        makeNode([0, 0, 200]),
      ],
      p: Project = {
        version: 1,
        name: "Parking bulbs",
        nodes: [c, ...ends],
        roads: ends.map((e) =>
          makeRoad(c, e, "Bulbs", {
            lanes: 2,
            laneWidth: 3.1,
            parking: "parallel",
            curbExtensions: true,
            sidewalk: 4.2,
            manholes: false,
            drainage: false,
          }),
        ),
      },
      n = buildNetwork(p),
      section = n.generatedSections[0];
    close(section.minimumLaneWidth, 3.1);
    assert(section.sidewalkRange[1] > 4.2);
  });
});

describe("actual triangular pavement/structure clearance", () => {
  it("flat overlap has a finite exact gap and concrete witness positions", () => {
    const c = physical()[0];
    close(c.meters, 5);
    assert.equal(c.method, "triangulated-surface-overlap");
    close(c.undersidePosition[1] - c.lowerPosition[1], c.meters);
    assert.equal(c.lowerKind, "motor");
  });
  it("minimum affine clearance is found at the overlap boundary, not only at a centre sample", () => {
    const c = measureSurfaceClearances(
      [
        sheet("upper", "asphalt", () => 10),
        sheet("upper", "structure", (x) => 7 + 0.1 * x, -5, 5, -5, 5, true),
        sheet("lower", "asphalt", (x) => 2 - 0.05 * x, -2, 2, -2, 2),
      ],
      new Set(["upper"]),
    )[0];
    close(c.meters, 4.7);
    close(c.lowerPosition[0], -2);
    close(c.undersidePosition[1], 6.8);
  });
  it("sloped bridge-road footprint clearance is lower than the old centreline-only value", () => {
    const p = crossing(),
      n = buildNetwork(p),
      m = n.surfaceClearances.find((c) => c.lowerKind === "motor")!;
    close(m.meters, 6.14);
    close(m.lowerPosition[0], -3.5);
    assert(n.clearances[0].meters < 6.28);
    close(n.designReview.minimumClearance!, 6.14);
    assert.deepEqual(n.diagnostics, []);
  });
  it("parallel grade-separated roads with no centreline crossing still receive a physical clearance", () => {
    const a = makeNode([-100, 8, 0]),
      z = makeNode([100, 8, 0]),
      l = makeNode([-100, 0, 4]),
      q = makeNode([100, 0, 4]),
      p: Project = {
        version: 1,
        name: "Parallel overlap",
        nodes: [a, z, l, q],
        roads: [
          makeRoad(a, z, "Upper", {
            ...settings,
            bridge: true,
            structure: "steel",
            bridgeDepth: 1.6,
          }),
          makeRoad(l, q, "Lower", {
            sidewalk: 0,
            manholes: false,
            drainage: false,
          }),
        ],
      },
      n = buildNetwork(p);
    assert.equal(detectCrossings(p, Infinity).length, 0);
    assert(n.surfaceClearances.some((c) => c.lowerKind === "motor"));
    assert.equal(n.clearances.length, 1);
    assert(n.designReview.minimumClearance !== null);
    close(
      n.clearances[0].meters,
      n.surfaceClearances.find((c) => c.lowerKind === "motor")!.meters,
    );
  });
  it("connected bridge insertion refuses inadequate physical clearance that a centreline-only check would accept", () => {
    const a = makeNode([-360, 0, 0]),
      z = makeNode([360, 0, 0]),
      l = makeNode([0, -7, -100]),
      q = makeNode([0, 7, 100]),
      p: Project = {
        version: 1,
        name: "Graded lower road",
        nodes: [a, z, l, q],
        roads: [
          makeRoad(a, z, "Host", settings),
          makeRoad(l, q, "Graded lower", {
            sidewalk: 0,
            manholes: false,
            drainage: false,
          }),
        ],
      },
      before = JSON.stringify(p);
    assert.throws(
      () => insertConnectedBridge(p, p.roads[0].id),
      /physical pavement clearance/,
    );
    assert.equal(JSON.stringify(p), before);
  });
  it("surface intersections are errors even when the structure's roadway remains above the lower pavement", () => {
    const p = crossing(0);
    p.nodes[0].position[1] = p.nodes[1].position[1] = 1.2;
    const n = buildNetwork(p);
    assert(n.surfaceClearances.some((c) => c.meters < 0));
    assert(
      n.designReview.structureIssues.some(
        (i) => i.kind === "surface-intersection",
      ),
    );
    assert(n.diagnostics.some((d) => d.level === "error"));
    assert(!n.designReview.withinSelectedTargets);
  });
  it("footway/cycle heights are reported separately from the selected motor-clearance target", () => {
    const p = crossing(0, 4.2);
    p.roads[1].cycleMode = "protected";
    p.roads[1].cycleWidth = 1.9;
    p.roads[1].cycleSeparator = 0.6;
    const n = buildNetwork(p);
    assert(n.surfaceClearances.some((c) => c.lowerKind === "pedestrian"));
    assert(n.surfaceClearances.some((c) => c.lowerKind === "cycle"));
    assert(
      n.designReview.pavementAudit.minimumPedestrianClearance! <
        n.designReview.pavementAudit.minimumMotorClearance!,
    );
    assert(n.designReview.pavementAudit.minimumCycleClearance !== null);
  });
  it("a parking surface below the bridge affects its per-road target even without a road-road centreline crossing", () => {
    const a = makeNode([-120, 6.8, 0]),
      z = makeNode([120, 6.8, 0]),
      site = makeSite("parking", [0, 0, 0]),
      p: Project = {
        version: 1,
        name: "Parking clearance",
        nodes: [a, z],
        roads: [
          makeRoad(a, z, "Upper", {
            ...settings,
            bridge: true,
            structure: "steel",
            bridgeDepth: 1.6,
          }),
        ],
        sites: [site],
      },
      n = buildNetwork(p),
      m = n.designReview.roads[0];
    assert(
      n.surfaceClearances.some(
        (c) => c.lower === site.id && c.lowerKind === "motor",
      ),
    );
    assert(m.minimumPhysicalMotorClearance! < 5.2);
    assert(!m.meetsReference);
    assert(!n.designReview.withinSelectedTargets);
  });
  it("disjoint or edge-touching projections do not create phantom crossing clearances", () => {
    const meshes = [
      sheet("upper", "asphalt", () => 10),
      sheet("upper", "structure", () => 7, -5, 5, -5, 5, true),
      sheet("lower", "asphalt", () => 2, 5, 10, -5, 5),
    ];
    assert.deepEqual(measureSurfaceClearances(meshes, new Set(["upper"])), []);
  });
  it("same-owner and same-level connected surfaces are not treated as underpasses", () => {
    const meshes = [
      sheet("upper", "asphalt", () => 10),
      sheet("upper", "structure", () => 7, -5, 5, -5, 5, true),
      sheet("upper", "parking", () => 1),
      sheet("adjacent", "asphalt", () => 9.5),
    ];
    assert.deepEqual(measureSurfaceClearances(meshes, new Set(["upper"])), []);
  });
  it("road paint and raised cycle-separator concrete are not used as traffic pavement", () => {
    const meshes = [
      sheet("upper", "asphalt", () => 10),
      sheet("upper", "structure", () => 7, -5, 5, -5, 5, true),
      sheet("lower", "parking", () => 3, -5, 5, -5, 5, false, "paint"),
      sheet("separator", "cycle", () => 5, -5, 5, -5, 5, false, "curb"),
    ];
    assert.deepEqual(measureSurfaceClearances(meshes, new Set(["upper"])), []);
  });
  it("bus overlays are genuine motor surfaces and signed-zero metadata is portable", () => {
    const c = physical([
      sheet("bus", "bus", () => 3, -5, 5, -5, 5, false, "bus-red"),
    ]);
    assert(
      c.some(
        (c) =>
          c.lower === "bus" &&
          c.lowerKind === "motor" &&
          Math.abs(c.meters - 4) < 1e-7,
      ),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
  });
  it("an underside without its owner's actual pavement roof is not assigned invented height ordering", () => {
    const meshes = [
      sheet("upper", "structure", () => 7, -5, 5, -5, 5, true),
      sheet("lower", "asphalt", () => 2),
    ];
    assert.deepEqual(measureSurfaceClearances(meshes, new Set(["upper"])), []);
  });
  it("either triangle winding is respected through the generated upward/downward sheet geometry", () => {
    const c = physical();
    assert(c.length > 0);
    assert(c.every((c) => c.upperSurfaceHeight > c.lowerPosition[1] + 0.7));
  });
});

describe("reference layout preservation and engine metadata", () => {
  for (const id of ["diamond", "cloverleaf", "trumpet", "city", "europe"])
    it(`${id}: generated pavement widths/seams and reference-scale layouts remain valid`, () => {
      const p = makeTemplate(id),
        n = buildNetwork(p);
      assert.deepEqual(n.diagnostics, []);
      assert(n.surfaceJoins.every((j) => j.sealed));
      assert(n.generatedSections.every((s) => s.minimumLaneWidth > 0));
      assert(n.designReview.withinSelectedTargets);
      if (id === "europe") assert.equal(n.roadsideParking.length, 180);
      if (id !== "europe")
        assert(n.designReview.pavementAudit.minimumMotorClearance! >= 5.2);
    });
  it("OBJ engine manifests preserve actual surface witnesses and generated cross-section measurements", () => {
    const p = crossing(),
      n = buildNetwork(p),
      m = exportMeshManifest(n, p);
    assert.deepEqual(m.surfaceClearances, n.surfaceClearances);
    assert.deepEqual(m.surfaceJoins, n.surfaceJoins);
    assert.deepEqual(m.generatedSections, n.generatedSections);
    assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  });
  it("editing/production use the same physical crossing metric on linear graded sheets", () => {
    const p = crossing(),
      a = buildNetwork(p),
      b = buildNetwork(p, { detail: "production" });
    close(
      a.designReview.minimumClearance!,
      b.designReview.minimumClearance!,
      1e-6,
    );
    assert(a.surfaceJoins.every((j) => j.sealed));
    assert(b.surfaceJoins.every((j) => j.sealed));
  });
});
