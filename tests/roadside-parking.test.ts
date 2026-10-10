import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  presets,
  parseProject,
  motorHalfWidth,
  roadHalfWidth,
  cycleBufferWidth,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import {
  buildNetwork,
  frameAt,
  surfacePoint,
  MeshBuilder,
  type MeshData,
} from "../src/core/geometry";
import { buildParallelParking } from "../src/core/road-details";
import { sectionScale } from "../src/core/street-details";
import { parkingLayout } from "../src/core/site-geometry";
import { exportMeshManifest, exportOBJ } from "../src/core/export";
import { distance, distanceXZ, simplePolygon, type V3 } from "../src/core/math";

function fixture(settings: Partial<RoadSettings> = {}): Project {
  const a = makeNode([-60, 0, 0]),
    z = makeNode([60, 0, 0]);
  return {
    version: 1,
    name: "Roadside parking fixture",
    nodes: [a, z],
    roads: [
      makeRoad(a, z, "Parking street", {
        parking: "parallel",
        drainage: false,
        manholes: false,
        signs: false,
        streetLights: false,
        treePits: false,
        ...settings,
      }),
    ],
  };
}
const points = (m: MeshData) =>
  Array.from(
    { length: m.positions.length / 3 },
    (_, i) => m.positions.slice(i * 3, i * 3 + 3) as V3,
  );
const close = (a: number, b: number, epsilon = 1e-7) =>
  assert(Math.abs(a - b) < epsilon, `${a} != ${b}`);

describe("procedural European roadside parking", () => {
  for (const id of ["euro-boulevard", "cycle-street", "cycle-painted"])
    it(`${id}: new profiles include actual boxed roadside bays`, () => {
      const settings = presets.find((p) => p.id === id)!.settings,
        p = fixture(settings),
        n = buildNetwork(p);
      assert.equal(settings.parking, "parallel");
      assert(n.roadsideParking.length >= 30);
      assert.equal(n.parkingSpaces, n.roadsideParking.length);
      assert(n.meshes.some((m) => m.material === "marking-parking-bay"));
      assert(n.roadsideParking.some((b) => b.side === -1));
      assert(n.roadsideParking.some((b) => b.side === 1));
      assert.deepEqual(n.diagnostics, []);
    });

  it("the European quarter has roadside bays on all twelve roads and clear gated court accesses", () => {
    const p = makeTemplate("europe"),
      before = JSON.stringify(p),
      n = buildNetwork(p);
    assert.equal(p.roads.length, 12);
    assert.equal(new Set(n.roadsideParking.map((b) => b.owner)).size, 12);
    assert.equal(n.roadsideParking.length, 180);
    assert.equal(
      n.parkingSpaces,
      n.roadsideParking.length +
        p
          .sites!.filter((s) => s.kind === "parking")
          .reduce((sum, s) => sum + parkingLayout(s).length, 0),
    );
    assert.equal(n.footways.filter((f) => f.kind === "driveway").length, 4);
    assert.equal(n.blocks.length, 4);
    assert(n.blocks.every((b) => !b.hasBuildings));
    assert(n.plantings.every((b) => !b.containsTree));
    assert(!n.meshes.some((m) => ["building", "landscape"].includes(m.kind)));
    for (const span of n.spans)
      for (const bay of n.roadsideParking.filter(
        (b) => b.owner === span.road.id,
      )) {
        assert(bay.startStation - 0.05 >= span.frames[0].s + 10 - 1e-7);
        assert(bay.endStation + 0.05 <= span.frames.at(-1)!.s - 10 + 1e-7);
        assert(simplePolygon(bay.boundary));
        for (const ramp of span.footway!.ramps.filter(
          (r) => r.side === bay.side,
        ))
          assert(
            bay.endStation + 0.35 <= ramp.s - ramp.width / 2 - ramp.flare ||
              bay.startStation - 0.35 >= ramp.s + ramp.width / 2 + ramp.flare,
            `${bay.id} must not obstruct ${ramp.id}`,
          );
      }
    assert.deepEqual(n.diagnostics, []);
    assert.equal(JSON.stringify(p), before);
  });

  it("closed white boxes and P stencils stay inside the parking band, away from full-width bus and cycle lanes", () => {
    const p = fixture(presets.find((p) => p.id === "euro-boulevard")!.settings),
      r = p.roads[0],
      n = buildNetwork(p),
      span = n.spans[0],
      builder = new MeshBuilder(r.id, "road"),
      bays = buildParallelParking(builder, span),
      meshes = builder.output(),
      paint = meshes.find((m) => m.material === "paint")!,
      motorEdge = (r.lanes * r.laneWidth + r.median) / 2,
      parkingEdge = motorHalfWidth(r);
    close(motorEdge, 6.4);
    close(parkingEdge, 8.7);
    close(roadHalfWidth(r), 11.45);
    for (const m of meshes)
      for (const v of points(m)) {
        assert(Math.abs(v[2]) >= motorEdge + 0.05 - 1e-7);
        assert(Math.abs(v[2]) <= parkingEdge - 0.05 + 1e-7);
      }
    // Two longitudinal sides plus two end bars: a real complete box per bay.
    assert(paint.indices.length >= bays.length * 4 * 6);
    for (const bay of bays) {
      close(bay.length, 5.5);
      close(bay.width, 2.1);
    }
    assert(
      points(n.meshes.find((m) => m.material === "bus-red")!).every(
        (v) => Math.abs(v[2]) >= 3.2 - 1e-7 && Math.abs(v[2]) <= 6.4 + 1e-7,
      ),
    );
    assert(
      points(n.meshes.find((m) => m.material === "cycle-red")!).every(
        (v) => Math.abs(v[2]) >= 9.35 - 1e-7 && Math.abs(v[2]) <= 11.45 + 1e-7,
      ),
    );
  });

  it("painted cycle lanes get a separate hatched door buffer beside parking, but unparked painted roads keep their original width", () => {
    const settings = presets.find((p) => p.id === "cycle-painted")!.settings,
      p = fixture(settings),
      r = p.roads[0],
      n = buildNetwork(p),
      motor = motorHalfWidth(r),
      buffer = cycleBufferWidth(r);
    close(buffer, 0.6);
    close(roadHalfWidth(r), motor + buffer + r.cycleWidth);
    assert(
      points(n.meshes.find((m) => m.material === "cycle-green")!).every(
        (v) => Math.abs(v[2]) >= motor + buffer - 1e-7,
      ),
    );
    assert(
      points(n.meshes.find((m) => m.material === "paint")!).some(
        (v) =>
          Math.abs(v[2]) > motor + 0.07 &&
          Math.abs(v[2]) < motor + buffer - 0.07,
      ),
    );
    assert(!n.meshes.some((m) => m.kind === "cycle" && m.material === "curb"));
    r.parking = "none";
    close(cycleBufferWidth(r), 0);
    close(
      roadHalfWidth(r),
      (r.lanes * r.laneWidth + r.median) / 2 + r.cycleWidth,
    );
    assert.equal(buildNetwork(p).roadsideParking.length, 0);
  });

  it("driveway flares exclude the whole parking box on only the affected side", () => {
    const p = fixture(),
      baseline = buildNetwork(p).roadsideParking;
    p.roads[0].driveways = [
      { id: "drive-a", at: 0.35, side: 1, width: 6, apron: 3 },
      { id: "drive-b", at: 0.65, side: 1, width: 7, apron: 4 },
    ];
    const n = buildNetwork(p),
      ramps = n.spans[0].footway!.ramps;
    assert.equal(ramps.length, 2);
    assert(n.roadsideParking.length < baseline.length);
    assert.deepEqual(
      n.roadsideParking.filter((b) => b.side === -1),
      baseline.filter((b) => b.side === -1),
    );
    for (const bay of n.roadsideParking.filter((b) => b.side === 1))
      for (const ramp of ramps)
        assert(
          bay.endStation + 0.35 <= ramp.s - ramp.width / 2 - ramp.flare ||
            bay.startStation - 0.35 >= ramp.s + ramp.width / 2 + ramp.flare,
        );
  });

  for (const [name, settings] of [
    ["bridge", { bridge: true }],
    ["motorway", { markingStyle: "motorway" }],
    ["race circuit", { markingStyle: "race" }],
    ["two-way bus-only avenue", { busLanes: "outer", lanes: 2 }],
    ["one-way bus-only lane", { busLanes: "outer", lanes: 1, oneWay: true }],
    ["parking disabled", { parking: "none" }],
    ["markings disabled", { markings: false }],
  ] as [string, Partial<RoadSettings>][])
    it(`${name}: does not generate misleading car bays or capacity`, () => {
      const p = fixture(settings),
        n = buildNetwork(p),
        builder = new MeshBuilder(p.roads[0].id, "road");
      assert.equal(n.roadsideParking.length, 0);
      assert.equal(n.parkingSpaces, 0);
      assert.deepEqual(buildParallelParking(builder, n.spans[0]), []);
      assert.deepEqual(builder.output(), []);
      assert(!n.meshes.some((m) => m.material === "marking-parking-bay"));
      if (settings.busLanes)
        assert.notEqual(
          presets.find((p) => p.id === "bus-way")!.settings.parking,
          "parallel",
        );
    });

  it("squeezed and curved boxes are excluded unless the complete bay retains usable dimensions", () => {
    const p = fixture({ cycleMode: "protected", sidewalk: 5 });
    p.nodes[0].position = [-12, 0, 0];
    p.nodes[1].position = [12, 0, 0];
    p.roads[0].h1 = [0, 0, -32];
    p.roads[0].h2 = [0, 0, -32];
    const n = buildNetwork(p),
      span = n.spans[0];
    assert(span.frames.some((f) => sectionScale(span, f) * 2.1 < 1.9));
    assert(n.roadsideParking.length > 0);
    for (const bay of n.roadsideParking) {
      assert(bay.length >= 5);
      assert(bay.width >= 1.9);
      assert(simplePolygon(bay.boundary));
      for (let s = bay.startStation; s <= bay.endStation; s += 0.25)
        assert(sectionScale(span, frameAt(span, s)) * 2.1 >= 1.9 - 1e-7);
    }
    assert(n.roadsideParking.length < Math.floor((span.length - 20) / 6) * 2);
  });

  it("bay geometry follows elevation/crossfall and stencil orientation follows handedness and one-way traffic", () => {
    const p = fixture();
    p.nodes[1].position[1] = 3.6;
    p.roads[0].h1[1] = 1.2;
    p.roads[0].h2[1] = -1.2;
    const n = buildNetwork(p),
      span = n.spans[0];
    assert(n.roadsideParking.length > 20);
    for (const bay of n.roadsideParking) {
      const f = frameAt(span, bay.station),
        expected = surfacePoint(
          f,
          bay.side *
            (motorHalfWidth(p.roads[0]) - 1.15) *
            sectionScale(span, f),
          0.018,
        );
      assert(distance(expected, bay.position) < 1e-7);
      assert.equal(bay.direction, bay.side);
    }
    p.roads[0].trafficSide = "left";
    assert(
      buildNetwork(p).roadsideParking.every((b) => b.direction === -b.side),
    );
    p.roads[0].oneWay = true;
    assert(buildNetwork(p).roadsideParking.every((b) => b.direction === 1));
  });

  it("editing and production retain the same European bay capacity, IDs, dimensions and positions", () => {
    const p = makeTemplate("europe"),
      before = JSON.stringify(p),
      editing = buildNetwork(p),
      production = buildNetwork(p, { detail: "production" });
    assert.equal(editing.parkingSpaces, production.parkingSpaces);
    assert.equal(
      editing.roadsideParking.length,
      production.roadsideParking.length,
    );
    for (let i = 0; i < editing.roadsideParking.length; i++) {
      const a = editing.roadsideParking[i],
        b = production.roadsideParking[i];
      assert.equal(a.id, b.id);
      close(a.length, b.length);
      close(a.width, b.width);
      assert(distanceXZ(a.position, b.position) < 1e-7);
      close(a.position[1], b.position[1]);
    }
    assert.equal(JSON.stringify(p), before);
    assert.deepEqual(production.diagnostics, []);
  });

  it("OBJ manifests contain bay footprints and stencil meshes, while JSON retains explicit parking choices", () => {
    const p = fixture(presets.find((p) => p.id === "cycle-street")!.settings),
      parsed = parseProject(JSON.parse(JSON.stringify(p))),
      n = buildNetwork(parsed),
      manifest = exportMeshManifest(n, parsed),
      obj = exportOBJ(n, parsed.name);
    assert.deepEqual(manifest.roadsideParking, n.roadsideParking);
    assert(
      n.roadsideParking.every(
        (b) => b.boundary.length === 4 && b.owner === parsed.roads[0].id,
      ),
    );
    assert(obj.obj.includes("marking-parking-bay"));
    assert.equal(parsed.roads[0].parking, "parallel");
    const legacy = JSON.parse(JSON.stringify(p));
    delete legacy.roads[0].parking;
    const old = parseProject(legacy);
    assert.equal(old.roads[0].parking, "none");
    assert.deepEqual(buildNetwork(old).roadsideParking, []);
    legacy.roads[0].parking = "none";
    assert.equal(parseProject(legacy).roads[0].parking, "none");
  });
});
