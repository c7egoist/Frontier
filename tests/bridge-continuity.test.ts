import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  controlPoints,
  type RoadSettings,
  type Project,
} from "../src/core/model";
import {
  buildNetwork,
  frameAt,
  type Network,
  type MeshData,
} from "../src/core/geometry";
import { girderOffsets } from "../src/core/bridges";
import { bearingDimensions } from "../src/core/bridge-bearings";
import { insertConnectedBridge } from "../src/core/bridge-insertion";
import { sampleAlignment } from "../src/core/curves";
import { dotXZ, sub, distanceXZ, type V3 } from "../src/core/math";
import { makeSite } from "../src/core/sites";
import { exportMeshManifest, exportOBJ } from "../src/core/export";

const close = (a: number, b: number, e = 1e-7) =>
  assert(Math.abs(a - b) < e, `${a} != ${b}`);
function fixture(
  settings: Partial<RoadSettings> = {},
  length = 400,
  height = 7.2,
): Project {
  const a = makeNode([-length / 2, height, 0]),
    z = makeNode([length / 2, height, 0]);
  a.crossings = z.crossings = false;
  return {
    version: 1,
    name: "Continuity fixture",
    nodes: [a, z],
    roads: [
      makeRoad(a, z, "Bridge", {
        bridge: true,
        structure: "steel",
        bridgeDepth: 1.6,
        roadClass: "mainline",
        oneWay: true,
        lanes: 2,
        laneWidth: 3.65,
        shoulderWidth: 2,
        sidewalk: 0,
        curbStyle: "flush",
        markingStyle: "motorway",
        drainage: false,
        manholes: false,
        ...settings,
      }),
    ],
    sites: [],
  };
}
function lowerRoad(p: Project, x = 0, width = 3.5, walk = 4.2) {
  const a = makeNode([x, 0, -100]),
    z = makeNode([x, 0, 100]);
  p.nodes.push(a, z);
  p.roads.push(
    makeRoad(a, z, "Lower road", {
      laneWidth: width,
      sidewalk: walk,
      manholes: false,
      drainage: false,
    }),
  );
}
const vertices = (m: MeshData) =>
  Array.from(
    { length: m.positions.length / 3 },
    (_, i) => m.positions.slice(i * 3, i * 3 + 3) as V3,
  );
function finite(n: Network) {
  for (const m of n.meshes) {
    assert(m.positions.every(Number.isFinite));
    assert(m.uvs.every(Number.isFinite));
  }
}
function bearingChecks(n: Network) {
  for (const b of n.bridges.filter((b) => b.kind === "span")) {
    const span = n.spans.find((s) => s.road.id === b.owner)!;
    assert(b.bearings!.length > 0);
    for (const bearing of b.bearings!) {
      const f = frameAt(span, bearing.station),
        offsets = girderOffsets(f, b.girderCount);
      close(bearing.top, f.p[1] - b.depth);
      close(bearing.top - bearing.bottom, bearingDimensions.totalHeight);
      close(
        bearing.plateHeight * 2 + bearing.rubberHeight,
        bearingDimensions.totalHeight,
      );
      close(
        dotXZ(sub(bearing.position, f.p), f.n),
        offsets[bearing.girderIndex],
      );
      assert.equal(bearing.girderCount, b.girderCount);
      assert.deepEqual(JSON.parse(JSON.stringify(bearing)), bearing);
      const steel = n.meshes.find(
        (m) =>
          m.owner === b.owner &&
          m.kind === "structure" &&
          m.material === "steel",
      )!;
      const rubber = n.meshes.find(
        (m) =>
          m.owner === b.owner &&
          m.kind === "structure" &&
          m.material === "rubber",
      )!;
      assert(
        vertices(steel).some((v) => Math.abs(v[1] - bearing.bottom) < 1e-7),
      );
      assert(vertices(steel).some((v) => Math.abs(v[1] - bearing.top) < 1e-7));
      assert(
        vertices(rubber).some(
          (v) => Math.abs(v[1] - (bearing.bottom + bearing.plateHeight)) < 1e-7,
        ),
      );
    }
  }
}

describe("seated, continuous bridge member geometry", () => {
  for (const structure of ["steel", "concrete"] as const)
    it(`${structure}: lower plate, elastomer and upper plate meet the actual seat and girder without gaps`, () => {
      const n = buildNetwork(fixture({ structure }));
      bearingChecks(n);
      finite(n);
      const b = n.bridges[0];
      assert.equal(b.bearings!.length, b.supports.length * b.girderCount!);
      for (const support of b.supports) {
        assert(support.station !== undefined);
        for (const seat of b.bearings!.filter(
          (b) => Math.abs(b.station - support.station!) < 1e-7,
        ))
          close(seat.bottom, support.top);
      }
    });
  for (const trafficSide of ["right", "left"] as const)
    it(`${trafficSide}: tapered six-girder decks retain six correctly aligned bearings on every local support`, () => {
      const n = buildNetwork(fixture({ auxiliaryLane: "entry", trafficSide })),
        b = n.bridges[0];
      assert.equal(b.girderCount, 6);
      assert(b.girderSpacingRange![1] - b.girderSpacingRange![0] > 0.5);
      assert(b.widthRange![1] > b.widthRange![0] + 3);
      bearingChecks(n);
      for (const support of b.supports)
        assert.equal(
          b.bearings!.filter(
            (b) => Math.abs(b.station - support.station!) < 1e-7,
          ).length,
          6,
        );
      assert.deepEqual(n.diagnostics, []);
    });
  it("equal-width connected deck ends share the same girder pattern even when only one span has an upstream taper", () => {
    const p = fixture({ auxiliaryLane: "entry" }),
      old = p.roads[0],
      end = p.nodes[1],
      z = makeNode([600, 7.2, 0]);
    p.nodes.push(z);
    p.roads.push(
      makeRoad(end, z, "Next deck", { ...old, auxiliaryLane: "none" }),
    );
    p.roads[1].id = "next-deck";
    p.roads[1].start = end.id;
    p.roads[1].end = z.id;
    const n = buildNetwork(p),
      a = n.bridges.find((b) => b.owner === old.id)!,
      b = n.bridges.find((b) => b.owner === "next-deck")!;
    assert.equal(a.girderCount, 6);
    assert.equal(b.girderCount, 6);
    const sa = n.spans.find((s) => s.road.id === old.id)!,
      sb = n.spans.find((s) => s.road.id === "next-deck")!;
    assert.deepEqual(
      girderOffsets(sa.frames.at(-1)!, a.girderCount),
      girderOffsets(sb.frames[0], b.girderCount),
    );
    assert.equal(n.bridges.filter((b) => b.kind === "joint").length, 0);
    bearingChecks(n);
    assert.deepEqual(n.diagnostics, []);
  });
  it("mixed-width/depth joints seat all member groups on real crossheads and deduplicate coincident bearings", () => {
    const p = fixture({}, 240),
      left = p.nodes[0],
      right = p.nodes[1],
      mid = makeNode([0, 7.2, 0]);
    p.nodes.push(mid);
    const a = makeRoad(
        left,
        mid,
        "Steel member",
        { ...p.roads[0] },
        [40, 0, 0],
        [-40, 0, 0],
      ),
      b = makeRoad(
        mid,
        right,
        "Concrete member",
        {
          ...p.roads[0],
          lanes: 1,
          shoulderWidth: 1.5,
          structure: "concrete",
          bridgeDepth: 1.9,
        },
        [40, 0, 0],
        [-40, 0, 0],
      );
    a.id = "member-a";
    a.start = left.id;
    a.end = mid.id;
    b.id = "member-b";
    b.start = mid.id;
    b.end = right.id;
    p.roads = [a, b];
    const n = buildNetwork(p),
      joint = n.bridges.find((b) => b.owner === mid.id)!;
    assert(joint.bearings!.some((b) => b.members?.includes(a.id)));
    assert(joint.bearings!.some((bearing) => bearing.members?.includes(b.id)));
    for (let i = 0; i < joint.bearings!.length; i++)
      for (let j = i + 1; j < joint.bearings!.length; j++)
        assert(
          distanceXZ(joint.bearings![i].position, joint.bearings![j].position) >
            1e-7,
        );
    for (const bearing of joint.bearings!)
      close(bearing.top, mid.position[1] - joint.depth);
    assert(joint.bearings!.some((b) => (b.members?.length ?? 0) > 1));
    finite(n);
    assert.deepEqual(n.diagnostics, []);
  });
  for (const id of ["diamond", "cloverleaf", "trumpet"])
    it(`${id}: all default bridge seats remain clear and their actual bearing stacks are complete`, () => {
      const n = buildNetwork(makeTemplate(id));
      assert.deepEqual(n.diagnostics, []);
      assert(n.designReview.withinSelectedTargets);
      assert(
        n.bridges.every(
          (b) => b.abutments?.length === 2 && !b.excludedAbutments?.length,
        ),
      );
      bearingChecks(n);
    });
});

describe("lower-road-safe bridge bounds and approaches", () => {
  it("an abutment placed across the underpass is omitted, reported and never leaves a wall or fill blocking traffic", () => {
    const p = fixture(
      { embankment: true, bridgeFrom: 0.5, bridgeTo: 0.75 },
      600,
    );
    lowerRoad(p);
    const n = buildNetwork(p),
      b = n.bridges[0];
    assert.equal(b.excludedAbutments!.length, 1);
    assert.equal(b.abutments!.length, 1);
    assert(n.designReview.structureIssues.some((i) => i.kind === "abutment"));
    assert(!n.designReview.withinSelectedTargets);
    assert(
      n.diagnostics.some(
        (d) =>
          (d.level === "error" && d.message.includes("abutment")) ||
          d.message.includes("breast wall"),
      ),
    );
    assert(!n.embankments.some((e) => e.owner === p.roads[0].id));
    assert(
      !n.meshes.some((m) => m.owner === p.roads[0].id && m.material === "soil"),
    );
  });
  it("putting the crossing outside the structural interval withholds earthwork rather than calling a filled ramp a clear overpass", () => {
    const p = fixture(
      { embankment: true, bridgeFrom: 0.6, bridgeTo: 0.8 },
      600,
    );
    lowerRoad(p);
    const n = buildNetwork(p);
    assert(n.clearances[0].meters > 5.2);
    assert(
      n.designReview.structureIssues.some((i) => i.kind === "approach-fill"),
    );
    assert(!n.designReview.withinSelectedTargets);
    assert(!n.embankments.length);
  });
  it("moving structural bounds back to clear landings restores the geometry without changing the editable graph", () => {
    const p = fixture(
      { embankment: true, bridgeFrom: 0.5, bridgeTo: 0.75 },
      600,
    );
    lowerRoad(p);
    const before = structuredClone(p.nodes);
    assert(buildNetwork(p).designReview.structureIssues.length > 0);
    p.roads[0].bridgeFrom = 0.35;
    const n = buildNetwork(p);
    assert.deepEqual(n.diagnostics, []);
    assert(n.designReview.withinSelectedTargets);
    assert.equal(n.bridges[0].abutments!.length, 2);
    assert.equal(n.embankments.length, 2);
    assert.deepEqual(p.nodes, before);
  });
  it("actual parking/plot surfaces, not only centreline crossings, protect wide abutment foundations", () => {
    const p = fixture(
        { embankment: true, sidewalk: 8, bridgeFrom: 0.4, bridgeTo: 0.7 },
        300,
      ),
      site = makeSite("plaza", [-28, 0, 12]);
    site.width = 8;
    site.depth = 8;
    p.sites = [site];
    const n = buildNetwork(p);
    assert(n.bridges[0].excludedAbutments!.length > 0);
    assert(n.designReview.structureIssues.some((i) => i.kind === "abutment"));
  });
  it("height clipping does not reject a paved surface above an abutment seat", () => {
    const p = fixture(
        { embankment: true, bridgeFrom: 0.4, bridgeTo: 0.7 },
        300,
      ),
      site = makeSite("plaza", [-28, 20, 0]);
    site.width = 8;
    site.depth = 8;
    p.sites = [site];
    const n = buildNetwork(p);
    assert(!n.bridges[0].excludedAbutments!.length);
    assert.deepEqual(n.designReview.structureIssues, []);
  });
  it("atomic insertion refuses a lower road beneath a would-be filled approach without altering any endpoint", () => {
    const p = fixture({ bridge: false }, 720, 0);
    lowerRoad(p, 40);
    const before = JSON.stringify(p);
    assert.throws(
      () => insertConnectedBridge(p, p.roads[0].id),
      /approach crosses|structural interval|clear landing/,
    );
    assert.equal(JSON.stringify(p), before);
  });
  it("atomic insertion refuses landings whose wide lower-road walkways would be blocked by the abutment", () => {
    const p = fixture({ bridge: false }, 720, 0);
    lowerRoad(p, 0, 6, 12);
    const before = JSON.stringify(p);
    // The lower corridor is broad enough to intersect the 64 m structural end.
    p.roads[1].lanes = 6;
    p.roads[1].median = 4;
    p.roads[1].crossfall = 0;
    const current = JSON.stringify(p);
    assert.throws(
      () => insertConnectedBridge(p, p.roads[0].id),
      /overlaps|landing/,
    );
    assert.equal(JSON.stringify(p), current);
    assert.equal(p.nodes.length, JSON.parse(before).nodes.length);
  });
});

describe("honest auxiliary dimensions and lane-marking continuity", () => {
  for (const id of ["diamond", "cloverleaf", "trumpet"])
    it(`${id}: exported auxiliary endpoints use meshed stations, separately from requested zones and junction continuation`, () => {
      const p = makeTemplate(id),
        n = buildNetwork(p);
      for (const a of n.auxiliaryLanes) {
        const span = n.spans.find((s) => s.road.id === a.owner)!;
        assert(a.startStation >= span.frames[0].s);
        assert(a.endStation <= span.frames.at(-1)!.s);
        close(
          a.meshedFullWidthLength + a.meshedTaperLength,
          a.endStation - a.startStation,
        );
        close(
          a.fullWidthLength + a.taperLength,
          a.requestedEndStation - a.requestedStartStation,
        );
        close(
          a.endStation -
            a.startStation +
            a.junctionContinuation.reduce((s, c) => s + c.length, 0),
          a.fullWidthLength + a.taperLength,
        );
        assert(a.junctionContinuation.length > 0);
        assert(a.meshedFullWidthLength < a.fullWidthLength);
      }
      const m = exportMeshManifest(n, p);
      assert.deepEqual(m.auxiliaryLanes, n.auxiliaryLanes);
    });
  for (const trafficSide of ["right", "left"] as const)
    it(`${trafficSide}: widening only the outer edge never compresses the three through-lane guides at a motorway split`, () => {
      const a = makeNode([-800, 0, 0]),
        mid = makeNode([0, 0, 0]),
        z = makeNode([800, 0, 0]),
        r = makeNode([500, 0, 160]);
      mid.radius = 1.2;
      const settings: Partial<RoadSettings> = {
          bridge: false,
          lanes: 3,
          laneWidth: 3.65,
          shoulderWidth: 2,
          sidewalk: 0,
          oneWay: true,
          trafficSide,
          curbStyle: "flush",
          markingStyle: "motorway",
          roadClass: "mainline",
          drainage: false,
          manholes: false,
        },
        p: Project = {
          version: 1,
          name: "Guide continuity",
          nodes: [a, mid, z, r],
          roads: [
            makeRoad(a, mid, "In", {
              ...settings,
              auxiliaryLane: "exit",
              auxiliaryLength: 150,
            }),
            makeRoad(mid, z, "Through", settings),
            makeRoad(
              mid,
              r,
              "Ramp",
              { ...settings, lanes: 1 },
              [150, 0, 30],
              [-150, 0, -10],
            ),
          ],
        },
        n = buildNetwork(p),
        j = n.junctions.find((j) => j.node.id === mid.id)!,
        arm = j.arms.find((a) => a.road.name === "In")!,
        paint = n.meshes.find(
          (m) => m.owner === mid.id && m.kind === "marking",
        )!;
      assert.deepEqual(n.diagnostics, []);
      const near = vertices(paint).filter(
        (v) => Math.abs(v[0] - arm.center[0]) < 1.5,
      );
      for (const z of [-1.825, 1.825])
        assert(
          near.some((v) => Math.abs(v[2] - z) < 0.08),
          "through divider must meet its uncompressed road stripe",
        );
      const side = trafficSide === "left" ? -1 : 1;
      assert(
        near.some((v) => Math.abs(v[2] - side * 5.54) < 0.08),
        "auxiliary divider must continue at the real through-lane edge",
      );
      const lanes = n.designReview.junctionLanes.find(
        (j) => j.owner === mid.id,
      )!;
      assert.equal(lanes.incoming, 4);
      assert.equal(lanes.outgoing, 4);
      assert(lanes.balanced);
    });
  it("all default mainline auxiliary merges account for the extra incoming or outgoing lane", () => {
    for (const id of ["diamond", "cloverleaf", "trumpet"]) {
      const n = buildNetwork(makeTemplate(id));
      const js = n.designReview.junctionLanes.filter(
        (j) => j.auxiliaryApproaches,
      );
      assert(js.length >= 4);
      assert(
        js.every((j) => j.incoming === 3 && j.outgoing === 3 && j.balanced),
      );
    }
  });
  it("large valid production groups export OBJ without an unbounded spread call", () => {
    const p = fixture(),
      n = buildNetwork(p),
      count = 160_000;
    n.meshes = [
      {
        name: "Large girder group",
        owner: p.roads[0].id,
        ownerKind: "road",
        kind: "structure",
        material: "girder",
        positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: Array.from({ length: count * 3 }, (_, i) => i % 3),
      },
    ];
    n.triangles = count;
    n.vertices = 3;
    const obj = exportOBJ(n);
    assert.equal(obj.obj.match(/^f /gm)?.length, count);
    assert.equal(obj.obj.match(/^vn /gm)?.length, count);
    assert(obj.obj.includes("usemtl girder"));
  });
  it("the continuation changes retain Euro parking, no buildings/trees and portable physical metadata", () => {
    const p = makeTemplate("europe"),
      n = buildNetwork(p);
    assert.equal(n.roadsideParking.length, 180);
    assert.deepEqual(n.diagnostics, []);
    assert(!n.meshes.some((m) => ["building", "landscape"].includes(m.kind)));
    const t = fixture(),
      b = buildNetwork(t),
      m = exportMeshManifest(b, t);
    assert.deepEqual(m.bridges, b.bridges);
    assert(m.bridges[0].bearings!.length > 0);
    assert.deepEqual(m.designReview.structureIssues, []);
  });
});
