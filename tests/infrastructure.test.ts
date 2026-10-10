import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeTemplate,
  makeNode,
  makeRoad,
  parseProject,
  roadHalfWidth,
  railStyles,
  controlPoints,
  validateGenerationBudget,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import {
  buildNetwork,
  edgePoint,
  frameAt,
  surfacePoint,
  type MeshData,
  type Network,
} from "../src/core/geometry";
import { sampleAlignment } from "../src/core/curves";
import { detectCrossings, moveNode } from "../src/core/editing";
import { insertConnectedBridge } from "../src/core/bridge-insertion";
import { supportIsClear } from "../src/core/bridges";
import {
  crossingStations,
  motorLanes,
  sectionScale,
} from "../src/core/street-details";
import { cornerPath, offsetCornerPath } from "../src/core/corners";
import { meshSurfaceY } from "../src/core/road-details";
import { blockSolidAt } from "../src/core/planning-sites";
import { makeSite, sitePoint } from "../src/core/sites";
import { exportMeshManifest, exportOBJ } from "../src/core/export";
import {
  add,
  mul,
  sub,
  dotXZ,
  crossXZ,
  normalizeXZ,
  normalXZ,
  distance,
  distanceXZ,
  cubic,
  polygonArea,
  simplePolygon,
  type V3,
} from "../src/core/math";

const cache = new Map<string, { p: Project; n: Network }>();
function template(id: string, detail: "editing" | "production" = "editing") {
  const key = `${id}:${detail}`;
  if (!cache.has(key)) {
    const p = makeTemplate(id);
    cache.set(key, { p, n: buildNetwork(p, { detail }) });
  }
  return cache.get(key)!;
}
function finite(n: Network) {
  for (const m of n.meshes) {
    assert(m.positions.every(Number.isFinite), m.name);
    assert(m.uvs.every(Number.isFinite), m.name);
    assert.equal(m.positions.length / 3, m.uvs.length / 2);
    assert(
      m.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < m.positions.length / 3,
      ),
      m.name,
    );
  }
}
function vertices(m: MeshData) {
  return Array.from(
    { length: m.positions.length / 3 },
    (_, i) => m.positions.slice(i * 3, i * 3 + 3) as V3,
  );
}
function reachable(p: Project, start: string, directed = false) {
  const seen = new Set([start]);
  let more = true;
  while (more) {
    more = false;
    for (const r of p.roads) {
      if (seen.has(r.start) && !seen.has(r.end)) {
        seen.add(r.end);
        more = true;
      }
      if ((!directed || !r.oneWay) && seen.has(r.end) && !seen.has(r.start)) {
        seen.add(r.start);
        more = true;
      }
    }
  }
  return seen;
}
function line(settings: Partial<RoadSettings> = {}, length = 600): Project {
  const a = makeNode([-length / 2, 0, 0]),
    z = makeNode([length / 2, 0, 0]);
  return {
    version: 1,
    name: "Infrastructure test",
    nodes: [a, z],
    roads: [
      makeRoad(a, z, "Long road", {
        drainage: false,
        manholes: false,
        sidewalk: 0.8,
        ...settings,
      }),
    ],
  };
}

describe("connected divided motorways and city templates", () => {
  for (const id of [
    "bridge",
    "diamond",
    "cloverleaf",
    "trumpet",
    "city",
    "dumbbell",
  ]) {
    it(`${id}: finite shared-node network, no at-grade crossing mistakes or scenery`, () => {
      const { p, n } = template(id);
      assert.deepEqual(n.diagnostics, []);
      finite(n);
      assert.equal(detectCrossings(p).length, 0);
      assert.equal(reachable(p, p.nodes[0].id).size, p.nodes.length);
      assert(
        !n.meshes.some((m) => m.kind === "building" || m.kind === "landscape"),
      );
      assert(
        p.sites?.every((s) => s.buildingHeight === 0 && !s.landscape) ?? true,
      );
      for (const j of n.junctions) {
        assert(j.valid);
        assert(simplePolygon(j.boundary));
        assert(simplePolygon(j.outer));
      }
    });
  }
  it("cloverleaf has four separate one-way carriageways, four left loops and four right links", () => {
    const { p } = template("cloverleaf");
    assert(p.roads.every((r) => r.oneWay));
    assert.equal(
      p.roads.filter((r) => r.name.includes("direct right-turn")).length,
      4,
    );
    assert.equal(
      p.roads.filter((r) => r.name.includes("loop · 90°")).length,
      12,
    );
    const incoming = p.nodes.filter(
        (n) =>
          p.roads.filter((r) => r.start === n.id || r.end === n.id).length ===
            1 && p.roads.some((r) => r.start === n.id),
      ),
      outgoing = p.nodes.filter(
        (n) =>
          p.roads.filter((r) => r.start === n.id || r.end === n.id).length ===
            1 && p.roads.some((r) => r.end === n.id),
      );
    assert.equal(incoming.length, 4);
    assert.equal(outgoing.length, 4);
    for (const a of incoming)
      for (const z of outgoing)
        assert(
          reachable(p, a.id, true).has(z.id),
          `${a.name} cannot reach ${z.name}`,
        );
  });
  it("the T interchange connects all six movements between its three arms", () => {
    const { p } = template("trumpet"),
      boundaries = p.nodes.filter(
        (n) =>
          p.roads.filter((r) => r.start === n.id || r.end === n.id).length ===
          1,
      ),
      incoming = boundaries.filter((n) =>
        p.roads.some((r) => r.start === n.id),
      ),
      outgoing = boundaries.filter((n) => p.roads.some((r) => r.end === n.id));
    assert.equal(incoming.length, 3);
    assert.equal(outgoing.length, 3);
    let movements = 0;
    for (const a of incoming)
      for (const z of outgoing)
        if (distanceXZ(a.position, z.position) > 20) {
          assert(reachable(p, a.id, true).has(z.id));
          movements++;
        }
    assert.equal(movements, 6);
    assert.equal(
      p.roads.filter((r) => r.name.includes("loop · 90°")).length,
      6,
    );
  });
  for (const id of ["bridge", "cloverleaf", "trumpet", "city"])
    it(`${id}: actual girder clearances and gradual highway approaches`, () => {
      const { p, n } = template(id);
      assert(n.maxGrade < 6.2);
      assert(n.clearances.length >= 2);
      assert(Math.min(...n.clearances.map((c) => c.meters)) > 6.4);
      assert(n.bridges.some((b) => b.kind === "joint"));
      assert(n.bridges.some((b) => b.material === "steel"));
      for (const r of p.roads.filter(
        (r) => r.name.includes("motorway") || r.name.includes("highway"),
      )) {
        assert.equal(r.lanes, 2);
        assert.equal(r.laneWidth, 3.5);
        assert.equal(r.shoulderWidth, 1);
        assert.equal(roadHalfWidth(r), 4.5);
      }
    });
  it("city has a road hierarchy, true shared-cycle pavement, refuge passages, connected parking and empty plots", () => {
    const { p, n } = template("city");
    assert.equal(
      p.roads.filter(
        (r) =>
          r.name.includes("connected ascent") ||
          r.name.includes("connected descent"),
      ).length,
      4,
    );
    assert.equal(p.sites?.filter((s) => s.kind === "urban-block").length, 16);
    assert.equal(p.sites?.filter((s) => s.kind === "parking").length, 4);
    assert(p.roads.some((r) => r.sharedCycleStreet));
    assert(p.roads.some((r) => r.busLanes === "outer"));
    for (const kind of [
      "curb-extension",
      "crossing-refuge",
      "shared-cycle-street",
      "crosswalk",
    ])
      assert(n.streetDetails.some((f) => f.kind === kind));
    assert(n.meshes.some((m) => m.material === "signal-red"));
    assert(n.plantings.length > 0);
    assert(n.plantings.every((p) => !p.containsTree));
    assert(n.blocks.every((b) => !b.hasBuildings && b.interior === "open"));
    for (const r of p.roads.filter(
      (r) => r.name === "Parking access · connected gate",
    )) {
      assert(reachable(p, r.start).has(r.end));
      assert.equal(
        p.roads.filter((a) => a.start === r.start || a.end === r.start).length,
        3,
      );
    }
  });
  for (const id of ["city", "bridge", "dumbbell"])
    it(`${id}: production geometry fits the tile budget and round-trips`, () => {
      const { p, n } = template(id, "production");
      finite(n);
      assert.deepEqual(n.diagnostics, []);
      assert.deepEqual(
        parseProject(JSON.parse(JSON.stringify(p))),
        JSON.parse(JSON.stringify(p)),
      );
      assert(n.triangles > template(id).n.triangles * 1.3);
    });
  it("channelized crossroads uses compact dimensions and right-turn slip directions", () => {
    const { p, n } = template("signal");
    assert.deepEqual(n.diagnostics, []);
    const avenues = p.roads.filter((r) => r.name.startsWith("Avenue"));
    assert(avenues.every((r) => r.lanes === 2 && r.laneWidth === 3.25));
    assert(p.sites?.every((s) => s.width === 10 && s.cornerRadius === 0.9));
    for (const r of p.roads.filter((r) => r.name.startsWith("Free-flow"))) {
      const a = p.nodes.find((n) => n.id === r.start)!,
        z = p.nodes.find((n) => n.id === r.end)!,
        incoming = normalizeXZ(mul(a.position, -1)),
        outgoing = normalizeXZ(z.position);
      assert(
        crossXZ(incoming, outgoing) > 0.99,
        "right-driving slip cannot turn across opposing traffic",
      );
      assert.equal(r.laneWidth, 3.5);
    }
    assert(
      n.junctions.find((j) => j.node.name === "Signalized crossing")!.radius <
        7,
    );
  });
  it("dumbbell circulates counterclockwise for keep-right traffic", () => {
    const { p } = template("dumbbell");
    for (const r of p.roads.filter((r) => r.name.includes("circulation"))) {
      assert(r.oneWay);
      const a = p.nodes.find((n) => n.id === r.start)!,
        b = p.nodes.find((n) => n.id === r.end)!,
        cx = a.position[0] < 0 ? -78 : 78;
      assert(
        crossXZ(sub(a.position, [cx, 0, 0]), sub(b.position, [cx, 0, 0])) < 0,
      );
    }
  });
});

describe("highway bridge geometry and atomic insertion", () => {
  it("each placed footing clears the full lower road and footway, including lower bridge ramps", () => {
    const { p, n } = template("bridge"),
      alignments = p.roads.map((r) => sampleAlignment(p, r));
    for (const bridge of n.bridges)
      for (const support of bridge.supports) {
        const point: V3 = [
          support.position[0],
          support.top + bridge.depth + 0.07,
          support.position[2],
        ];
        assert(supportIsClear(point, bridge.owner, alignments));
      }
    const p2 = line({ bridge: true }),
      a = makeNode([0, 3, -100]),
      b = makeNode([0, 3, 100]),
      lower = makeRoad(a, b, "Lower bridge ramp", {
        bridge: true,
        sidewalk: 5,
      });
    p2.nodes.push(a, b);
    p2.roads.push(lower);
    assert(
      !supportIsClear(
        [0, 8, 0],
        p2.roads[0].id,
        p2.roads.map((r) => sampleAlignment(p2, r)),
      ),
    );
    assert(
      !supportIsClear(
        [9, 8, 0],
        p2.roads[0].id,
        p2.roads.map((r) => sampleAlignment(p2, r)),
      ),
    );
  });
  it("the blocked underpass pier moves to two safe corridor edges instead of leaving an oversized bay", () => {
    const { p, n } = template("bridge");
    for (const span of n.spans.filter((s) =>
      s.road.name.includes("highway · 4"),
    )) {
      const bridge = n.bridges.find((b) => b.owner === span.road.id)!,
        near = bridge.supports.filter((s) => Math.abs(s.position[2]) < 20);
      assert.equal(near.length, 2);
      assert(near.every((s) => Math.abs(s.position[2]) > 11.45));
      assert(distanceXZ(near[0].position, near[1].position) < 27);
      assert(bridge.excludedSupports.some((p) => Math.abs(p[2]) < 0.01));
    }
  });
  it("bridge decks use thin bases, closed I-girders and named structural groups", () => {
    const { n } = template("bridge");
    for (const span of n.spans.filter((s) => s.road.bridge)) {
      assert.equal(span.frames[0].roadBaseDepth, 0.28);
      const bottom = edgePoint(span.frames[0], 1, "bottom");
      assert(Math.abs(bottom[1] - span.frames[0].p[1] + 0.28) < 1e-8);
      const girder = n.meshes.find(
        (m) => m.owner === span.road.id && m.material === "girder",
      );
      if (span.road.structure === "steel") {
        assert(girder);
        assert(girder.name.endsWith("structure girder"));
        assert(
          vertices(girder).some(
            (p) =>
              Math.abs(p[1] - (span.frames[0].p[1] - span.road.bridgeDepth)) <
              1e-7,
          ),
        );
      }
    }
  });
  it("level linked spans no longer have full-width, full-height abutment walls at shared ends", () => {
    const p = line({ bridge: true, structure: "steel", sidewalk: 0.8 }, 320);
    p.nodes.forEach((n) => (n.position[1] = 8));
    const mid = makeNode([0, 8, 0]);
    p.nodes.push(mid);
    const r = p.roads[0];
    r.end = mid.id;
    r.h1 = [53, 0, 0];
    r.h2 = [-53, 0, 0];
    p.roads.push(
      makeRoad(
        mid,
        p.nodes[1],
        "Connected deck",
        { ...r },
        [53, 0, 0],
        [-53, 0, 0],
      ),
    );
    // Strip copied identity fields: a test fixture must author two distinct edges.
    p.roads[1].id = "joined-deck";
    p.roads[1].start = mid.id;
    p.roads[1].end = p.nodes[1].id;
    const n = buildNetwork(p);
    for (const bridge of n.bridges) {
      assert(bridge.supports.every((s) => Math.abs(s.position[0]) > 2));
      const concrete = n.meshes.find(
        (m) => m.owner === bridge.owner && m.material === "concrete",
      );
      const wall = vertices(concrete!).filter(
        (p) => Math.abs(p[0]) < 1.4 && p[1] > 1 && p[1] < 6,
      );
      assert.equal(
        wall.length,
        0,
        "a shared deck end must not get a wall across the road",
      );
    }
  });
  it("insertion preserves original endpoints, exact XZ plan shape and direction", () => {
    const p = line({
      oneWay: true,
      markingStyle: "motorway",
      shoulderWidth: 1,
    });
    const r = p.roads[0],
      curve = controlPoints(p, r),
      ends = p.nodes.map((n) => ({ ...n, position: [...n.position] }));
    const result = insertConnectedBridge(p, r.id),
      n = buildNetwork(p);
    assert.equal(p.nodes.length, 4);
    assert.equal(p.roads.length, 3);
    assert.deepEqual(n.diagnostics, []);
    assert(n.maxGrade <= 5.01);
    for (const node of ends)
      assert.deepEqual(
        p.nodes.find((n) => n.id === node.id),
        node,
      );
    const inRoad = p.roads.find((r) => r.id === result.approaches[0])!,
      deck = p.roads.find((r) => r.id === result.bridge)!,
      outRoad = p.roads.find((r) => r.id === result.approaches[1])!;
    assert.equal(inRoad.end, deck.start);
    assert.equal(deck.end, outRoad.start);
    assert(p.roads.every((r) => r.bridge && r.oneWay));
    for (const [road, lo, hi] of [
      [inRoad, 0, 0.4],
      [deck, 0.4, 0.6],
      [outRoad, 0.6, 1],
    ] as const)
      for (let i = 0; i <= 20; i++) {
        const a = cubic(controlPoints(p, road), i / 20),
          b = cubic(curve, lo + ((hi - lo) * i) / 20);
        assert(distanceXZ(a, b) < 1e-7);
      }
    assert.equal(n.bridges.length, 3);
    assert.equal(result.elevation, 8);
  });
  it("insertion lands above a lower road with real clearance, not an automatic at-grade split", () => {
    const p = line({ oneWay: true, markingStyle: "motorway" }),
      a = makeNode([0, 0, -150]),
      z = makeNode([0, 0, 150]);
    p.nodes.push(a, z);
    p.roads.push(
      makeRoad(a, z, "Lower avenue", { drainage: false, manholes: false }),
    );
    insertConnectedBridge(p, p.roads[0].id);
    const n = buildNetwork(p);
    assert.equal(detectCrossings(p).length, 0);
    assert.equal(n.clearances.length, 1);
    assert(n.clearances[0].meters > 6.5);
  });
  for (const kind of ["short", "driveways", "steep", "conflict"] as const)
    it(`${kind} insertion refuses atomically without lifting neighbouring endpoints`, () => {
      const p = line({}, kind === "short" ? 300 : 600);
      if (kind === "driveways")
        p.roads[0].driveways.push({
          id: "entry",
          at: 0.5,
          side: 1,
          width: 6,
          apron: 0,
        });
      if (kind === "steep") p.nodes[1].position[1] = 14;
      if (kind === "conflict") {
        const a = makeNode([0, 8, -100]),
          z = makeNode([0, 8, 100]);
        p.nodes.push(a, z);
        p.roads.push(makeRoad(a, z, "Existing flyover", { bridge: true }));
      }
      const before = JSON.stringify(p);
      assert.throws(() => insertConnectedBridge(p, p.roads[0].id));
      assert.equal(JSON.stringify(p), before);
    });
  it("moving a bridge landing re-sweeps the actual deck and retains graph connection IDs", () => {
    const p = line({ markingStyle: "motorway" });
    const result = insertConnectedBridge(p, p.roads[0].id);
    moveNode(p, result.joints[0], [-100, 8, 8]);
    const n = buildNetwork(p);
    assert(!n.diagnostics.some((d) => d.level === "error"));
    assert(n.bridges.some((b) => b.connections.includes(result.joints[0])));
    finite(n);
  });
});

describe("metric splitter tips and markings", () => {
  for (const angle of [10, 15, 25, 40])
    it(`${angle}° splitter samples its rounded tip even with very long straight returns`, () => {
      const theta = (angle * Math.PI) / 180,
        da: V3 = [Math.cos(-theta / 2), 0, Math.sin(-theta / 2)],
        db: V3 = [Math.cos(theta / 2), 0, Math.sin(theta / 2)],
        a = mul(da, 240),
        b = mul(db, 240),
        radius = 4,
        path = cornerPath(a, da, b, db, radius),
        centre: V3 = [radius / Math.sin(theta / 2), 0, 0],
        tip: V3 = [centre[0] - radius, 0, 0];
      assert.equal(path.radius, 4);
      assert(path.points.some((p) => distanceXZ(p, tip) < 1e-8));
      const arc = path.points.filter(
        (p) => Math.abs(distanceXZ(p, centre) - radius) < 1e-7,
      );
      assert(arc.length >= 20);
      for (let i = 1; i < arc.length; i++)
        assert(distanceXZ(arc[i], arc[i - 1]) < 0.5);
      assert(
        path.fractions.every((t, i) => i === 0 || t >= path.fractions[i - 1]),
      );
    });
  for (const id of ["merge", "cloverleaf", "signal"])
    it(`${id}: one gore per physical splitter, ending before the rounded curb and staying on asphalt`, () => {
      const { n } = template(id);
      assert(n.splitters.length > 0);
      const ids = new Set<string>();
      for (const g of n.splitters) {
        const id = `${g.owner}:${g.corner}`;
        assert(!ids.has(id));
        ids.add(id);
        assert(
          Math.abs(dotXZ(sub(g.pavingNose, g.paintedEnd), g.direction) - 1.6) <
            1e-7,
        );
        assert(g.curbRadius > 0);
        assert(g.halfWidth <= 1.7);
        assert(g.length <= 18);
        const asphalt = n.meshes.find(
          (m) => m.owner === g.owner && m.kind === "asphalt",
        )!;
        assert(g.outline.every((p) => meshSurfaceY(asphalt, p) !== undefined));
        const marking = n.meshes.filter(
          (m) => m.owner === g.owner && m.kind === "marking",
        );
        for (const m of marking)
          for (const p of vertices(m))
            assert(
              meshSurfaceY(asphalt, p) !== undefined,
              "junction marking escaped the asphalt",
            );
      }
    });
  it("ordinary crossroads no longer carry unrelated merge lane separators through the centre", () => {
    const p = makeTemplate("tee");
    p.nodes.forEach((n) => {
      n.boxJunction = false;
      n.signals = false;
      n.crossings = false;
    });
    const n = buildNetwork(p);
    assert(
      !n.meshes.some((m) => m.ownerKind === "node" && m.kind === "marking"),
    );
  });
});

describe("curb pockets, handed lane markings and refuge passages", () => {
  it("bulbs consume only parking width, preserve motor scale/crown, and hold the outside footway level", () => {
    const { n } = template("city"),
      feature = n.streetDetails.find((f) => f.kind === "curb-extension")!,
      span = n.spans.find((s) => s.road.id === feature.owner)!,
      f = frameAt(span, feature.station),
      regular = frameAt(span, span.frames[0].s + 15);
    assert(Math.abs(regular.hw - f.hw - 2.1) < 1e-8);
    assert(Math.abs(f.sw - regular.sw - 2.1) < 1e-8);
    assert.equal(sectionScale(span, f), sectionScale(span, regular));
    assert(
      Math.abs(surfacePoint(f, 0)[1] - surfacePoint(regular, 0)[1]) < 1e-8,
    );
    assert(
      Math.abs(
        edgePoint(f, 1, "outer")[1] - edgePoint(regular, 1, "outer")[1],
      ) < 1e-8,
    );
    assert(f.hw >= (span.road.lanes * span.road.laneWidth) / 2);
  });
  it("white zebras and actual dropped curb ramps use the same station and length", () => {
    const { n } = template("city");
    for (const zebra of n.streetDetails.filter((f) => f.kind === "crosswalk")) {
      const ramps = n.footways.filter(
        (f) =>
          f.owner === zebra.owner &&
          f.kind === "corner-ramp" &&
          Math.abs(f.station - zebra.station) < 1e-8,
      );
      assert.equal(ramps.length, 2);
      assert(ramps.every((r) => r.width === zebra.length));
    }
  });
  for (const trafficSide of ["right", "left"] as const)
    it(`${trafficSide} driving: stop bars cover incoming lanes only, including one-way streets`, () => {
      const p = makeTemplate("tee");
      p.roads.forEach((r) => {
        r.trafficSide = trafficSide;
        r.oneWay = true;
      });
      const n = buildNetwork(p);
      for (const stop of n.streetDetails.filter((f) => f.kind === "stop-line"))
        assert.equal(stop.end, "end");
      for (const r of p.roads) {
        assert(motorLanes(r).every((l) => l.direction === 1));
      }
      p.roads.forEach((r) => (r.oneWay = false));
      for (const lane of motorLanes(p.roads[0]))
        assert.equal(
          lane.direction,
          Math.sign(lane.offset) * (trafficSide === "right" ? 1 : -1),
        );
    });
  it("raised median noses are continuous but leave a genuinely flat tactile refuge crossing", () => {
    const { n } = template("city"),
      feature = n.streetDetails.find((f) => f.kind === "crossing-refuge")!,
      span = n.spans.find((s) => s.road.id === feature.owner)!,
      owner = n.meshes.filter(
        (m) => m.owner === feature.owner && ["curb", "paving"].includes(m.kind),
      ),
      flat = surfacePoint(frameAt(span, feature.station), 0);
    assert(
      !owner.some((m) => {
        const y = meshSurfaceY(m, flat);
        return y !== undefined && y > flat[1] + 0.03;
      }),
    );
    const beyond = surfacePoint(
      frameAt(span, feature.station + feature.length / 2 + 1.3),
      0,
    );
    assert(
      owner.some((m) => {
        const y = meshSurfaceY(m, beyond);
        return y !== undefined && y > beyond[1] + 0.12;
      }),
    );
    assert(owner.some((m) => m.material === "paving-tactile"));
  });
  it("protected tracks prevent parking bulbs from pinching separate bicycle lanes", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r) =>
      Object.assign(r, {
        parking: "parallel",
        curbExtensions: true,
        cycleMode: "protected",
      }),
    );
    assert(
      !buildNetwork(p).streetDetails.some((f) => f.kind === "curb-extension"),
    );
  });
  it("gated open-plot collision masks exclude the real gate and open interior, but retain the solid ring", () => {
    const s = makeSite("urban-block", [12, 0, -18]);
    s.yaw = 31;
    s.blockEntryWidth = 9;
    s.blockEntrySide = "north";
    assert(!blockSolidAt(s, sitePoint(s, 0, -s.depth / 2 + 1)));
    assert(!blockSolidAt(s, sitePoint(s, 0, 0)));
    assert(blockSolidAt(s, sitePoint(s, 12, -s.depth / 2 + 1)));
  });
});

describe("seven actual barrier profiles and engine metadata", () => {
  const signatures = new Set<string>();
  for (const style of railStyles)
    it(`${style}: real swept geometry, finite caps/posts and retained material/UV data`, () => {
      const p = line(
          {
            guardrails: true,
            railStyle: style,
            railHeight: 1.1,
            postSpacing: 2.5,
          },
          48,
        ),
        n = buildNetwork(p),
        rail = n.meshes.filter((m) => m.kind === "rail");
      assert(rail.length > 0);
      finite(n);
      const signature = rail
        .map((m) => [m.material, m.positions.length, m.indices.length])
        .join("/");
      assert(
        !signatures.has(signature),
        "designs must not just relabel one profile",
      );
      signatures.add(signature);
      assert.equal(n.barriers[0].style, style);
      assert(n.barriers[0].physicalGeometry);
      const manifest = exportMeshManifest(n, p);
      assert.equal(manifest.barriers[0].style, style);
      const obj = exportOBJ(n);
      assert(obj.obj.includes("_rail_"));
      assert(obj.obj.includes("usemtl"));
    });
  it("parapet has vertical infill and plinth; cable has four independent steel cables and sockets", () => {
    for (const style of ["parapet", "cable"] as const) {
      const n = buildNetwork(
        line({ guardrails: true, railStyle: style, railHeight: 1.2 }, 30),
      );
      assert(
        n.meshes.some(
          (m) =>
            m.kind === "rail" &&
            m.material === (style === "parapet" ? "concrete" : "steel"),
        ),
      );
      assert(
        n.meshes
          .filter((m) => m.kind === "rail")
          .reduce((s, m) => s + m.indices.length, 0) > 2000,
      );
    }
  });
  it("mixed guardrail designs stitch through an editable shared corner instead of disappearing", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r, i) =>
      Object.assign(r, {
        guardrails: true,
        railStyle: i === 0 ? "boxbeam" : "thrie",
      }),
    );
    const n = buildNetwork(p);
    finite(n);
    assert(n.meshes.some((m) => m.ownerKind === "node" && m.kind === "rail"));
    const joint = n.junctions[0];
    for (const arm of joint.arms) {
      const point = arm.outerLeft;
      assert(
        n.meshes
          .filter((m) => m.owner === joint.node.id && m.kind === "rail")
          .some((m) => vertices(m).some((p) => distanceXZ(p, point) < 0.081)),
      );
    }
  });
  it("OBJ manifest persists connected bridge, splitters, street features and physical guardrail tables", () => {
    const { p, n } = template("city"),
      m = exportMeshManifest(n, p);
    assert.equal(m.bridges.length, n.bridges.length);
    assert.equal(m.splitters.length, n.splitters.length);
    assert.equal(m.streetDetails.length, n.streetDetails.length);
    assert.equal(m.barriers.length, n.barriers.length);
    assert(m.bridges.every((b) => b.physicalGeometry));
    assert(m.bridges.some((b) => b.kind === "joint"));
    assert(!m.includesPreviewEnvironment);
  });
  it("new settings round-trip; legacy imports default safely and oversized direct bridge/shoulder input fails", () => {
    const p = line({
      railStyle: "thrie",
      trafficSide: "left",
      curbExtensions: true,
      sharedCycleStreet: true,
      bridgeDepth: 1.8,
      pierSpacing: 26,
      shoulderWidth: 1.2,
    });
    assert.deepEqual(
      parseProject(JSON.parse(JSON.stringify(p))),
      JSON.parse(JSON.stringify(p)),
    );
    const legacy = JSON.parse(JSON.stringify(p));
    for (const key of [
      "bridgeDepth",
      "pierSpacing",
      "trafficSide",
      "curbExtensions",
      "sharedCycleStreet",
      "shoulderWidth",
    ])
      delete legacy.roads[0][key];
    const parsed = parseProject(legacy).roads[0];
    assert.equal(parsed.bridgeDepth, 1.2);
    assert.equal(parsed.trafficSide, "right");
    assert.equal(parsed.shoulderWidth, 0);
    for (const [key, value] of [
      ["bridgeDepth", 10],
      ["pierSpacing", Infinity],
      ["shoulderWidth", 12],
    ] as const) {
      const p = line();
      (p.roads[0] as unknown as Record<string, unknown>)[key] = value;
      assert.throws(() => validateGenerationBudget(p));
    }
  });
});
