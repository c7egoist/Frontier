import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  presets,
  parseProject,
  roadDefaults,
  roadHalfWidth,
  motorHalfWidth,
  validateGenerationBudget,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import {
  buildNetwork,
  surfacePoint,
  frameAt,
  edgePoint,
  type Network,
  type MeshData,
} from "../src/core/geometry";
import {
  cornerPath,
  offsetCornerPath,
  effectiveCornerRadius,
} from "../src/core/corners";
import { meshSurfaceY } from "../src/core/road-details";
import {
  distance,
  distanceXZ,
  add,
  mul,
  simplePolygon,
  type V3,
} from "../src/core/math";
import { moveNode } from "../src/core/editing";
import { exportMeshManifest, exportOBJ } from "../src/core/export";

const fixture = (settings: Partial<RoadSettings> = {}): Project => {
  const a = makeNode([-100, 0, 0]),
    z = makeNode([100, 0, 0]);
  return {
    version: 1,
    name: "Mobility fixture",
    nodes: [a, z],
    roads: [
      makeRoad(a, z, "Mobility road", {
        drainage: false,
        manholes: false,
        ...settings,
      }),
    ],
  };
};
const points = (m: MeshData) =>
  Array.from(
    { length: m.positions.length / 3 },
    (_, i) => m.positions.slice(i * 3, i * 3 + 3) as V3,
  );
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
function crossroads(widths: number[], length = 85, mixed = false): Project {
  const c = makeNode([0, 3, 0]);
  c.radius = 2;
  c.crossings = false;
  const ends = widths.map((_, i) =>
    makeNode([
      Math.cos((i * Math.PI) / 2) * length,
      3 + (mixed ? i * 0.3 : 0),
      Math.sin((i * Math.PI) / 2) * length,
    ]),
  );
  return {
    version: 1,
    name: "Wide corner regression",
    nodes: [c, ...ends],
    roads: ends.map((z, i) =>
      makeRoad(c, z, `Arm ${i}`, {
        sidewalk: widths[i],
        laneWidth: 3.3,
        lanes: mixed && i === 1 ? 4 : 2,
        drainage: false,
        manholes: false,
        cornerRamps: false,
      }),
    ),
  };
}
describe("analytic, non-spiking widened corner offsets", () => {
  for (const width of [4.2, 8, 12])
    for (const detail of ["editing", "production"] as const)
      it(`${width} m walkway, ${detail}: exact normals retain a constant metric offset`, () => {
        const a: V3 = [28, 3, 3.3],
          z: V3 = [3.3, 3.4, 28],
          w = width + 0.22,
          r = effectiveCornerRadius(2, [{ sw: width, cw: 0.22 }]),
          path = cornerPath(a, [1, 0, 0], z, [0, 0, 1], r, detail),
          start = add(a, [0, 0.16, w]),
          end = add(z, [w, 0.16, 0]),
          paved = offsetCornerPath(path, start, end, w, w);
        assert.deepEqual(paved[0], start);
        assert.deepEqual(paved.at(-1), end);
        assert(path.radius > w + 0.34);
        for (let i = 0; i < path.points.length; i++) {
          assert(Math.abs(distanceXZ(path.points[i], paved[i]) - w) < 1e-7);
          if (i) {
            const base = distanceXZ(path.points[i], path.points[i - 1]);
            assert(
              distanceXZ(paved[i], paved[i - 1]) <= base * 1.02 + 1e-6,
              "no alternating-width offset spikes",
            );
          }
          assert(paved[i].every(Number.isFinite));
        }
      });
  for (const width of [4.2, 8, 12])
    it(`raised radius-2 junction / ${width} m footways has a simple outside contour and pinned mouths`, () => {
      const p = crossroads([width, width, width, width]),
        n = buildNetwork(p),
        j = n.junctions[0];
      finite(n);
      assert.equal(n.diagnostics.length, 0);
      assert(j.valid);
      assert(simplePolygon(j.outer));
      assert.equal(j.requestedRadius, 2);
      assert(j.radius >= width + 0.96);
      const pavement = n.meshes.filter(
        (m) => m.owner === j.node.id && m.kind === "paving",
      );
      for (const a of j.arms)
        for (const side of [-1, 1]) {
          const v = edgePoint(a.frame, side * (a.isStart ? 1 : -1), "outer");
          assert(
            pavement.some((m) => points(m).some((q) => distance(q, v) < 1e-7)),
          );
        }
    });
  it("mixed widths, lane counts and approach elevations stay simple and continuous", () => {
    const n = buildNetwork(crossroads([12, 4.8, 7, 3.8], 100, true));
    finite(n);
    assert(n.junctions[0].valid);
    assert(simplePolygon(n.junctions[0].outer));
    assert.equal(n.diagnostics.length, 0);
  });
  for (const length of [8, 15, 20])
    it(`short ${length} m approaches taper their pinned footways, rather than generating a star`, () => {
      const p = crossroads([12, 12], length),
        n = buildNetwork(p);
      finite(n);
      assert(n.junctions.every((j) => j.valid));
      assert(n.diagnostics.some((d) => d.message.includes("tapered")));
      for (const s of n.spans)
        for (let i = 1; i < s.frames.length; i++)
          assert(
            Math.abs(s.frames[i].sw - s.frames[i - 1].sw) <=
              0.65001 * Math.abs(s.frames[i].s - s.frames[i - 1].s) + 1e-6,
          );
      assert(simplePolygon(n.junctions[0].outer));
    });
});
it("the exact raised Northbank radius-2 / 12 m reproduction is clean and reports short-fit width tapering", () => {
  const p = makeTemplate("district");
  moveNode(p, "j01", [0, 3, 0]);
  p.nodes.find((n) => n.id === "j01")!.radius = 2;
  p.roads
    .filter((r) => r.start === "j01" || r.end === "j01")
    .forEach((r) => {
      r.sidewalk = 12;
      r.laneWidth = 3.3;
    });
  const n = buildNetwork(p),
    j = n.junctions.find((j) => j.node.id === "j01")!;
  finite(n);
  assert(j.valid);
  assert(simplePolygon(j.outer));
  assert(j.radius > 12);
  assert(
    Math.abs(
      j.radius - Math.max(...j.arms.map((a) => a.frame.sw + a.frame.cw + 0.75)),
    ) < 1e-8,
  );
  assert(n.diagnostics.some((d) => d.message.includes("tapered")));
  assert(!n.diagnostics.some((d) => d.level === "error"));
});
describe("bus and cycle geometry / motor-space separation", () => {
  for (const id of [
    "euro-boulevard",
    "bus-way",
    "cycle-street",
    "cycle-painted",
  ])
    it(`${id}: a real mesh profile, not just a library description`, () => {
      const preset = presets.find((p) => p.id === id)!,
        p = fixture(preset.settings),
        n = buildNetwork(p);
      finite(n);
      assert(n.mobility.some((m) => m.kind === "cycle-track"));
      assert(n.meshes.some((m) => m.kind === "cycle"));
      if (p.roads[0].busLanes === "outer") {
        assert.equal(n.mobility.filter((m) => m.kind === "bus-lane").length, 2);
        assert(n.meshes.some((m) => m.material === "marking-bus"));
      }
      assert(
        !n.meshes.some((m) => m.kind === "building" || m.kind === "landscape"),
      );
    });
  it("bus lanes reserve the outer motor lanes; protected cycle zones add their own width", () => {
    const p = fixture(presets.find((p) => p.id === "euro-boulevard")!.settings),
      r = p.roads[0],
      n = buildNetwork(p);
    assert.equal(r.lanes, 4);
    assert.equal(motorHalfWidth(r), 8.7);
    assert.equal(roadHalfWidth(r), 11.45);
    assert.equal(n.spans[0].frames[0].hw, 11.45);
    const buses = n.meshes.find((m) => m.material === "bus-red")!;
    assert(
      points(buses).every(
        (p) => Math.abs(p[2]) >= 3.2 - 1e-7 && Math.abs(p[2]) <= 6.4 + 1e-7,
      ),
    );
    const cycle = n.meshes.find((m) => m.material === "cycle-red")!;
    assert(
      points(cycle).every(
        (p) => Math.abs(p[2]) >= 9.35 - 1e-7 && Math.abs(p[2]) <= 11.45 + 1e-7,
      ),
    );
    const buffer = n.meshes.find(
      (m) => m.kind === "cycle" && m.material === "curb",
    )!;
    assert(
      points(buffer).every(
        (p) => Math.abs(p[2]) >= 8.7 && Math.abs(p[2]) <= 9.35,
      ),
    );
  });
  it("one-way bus reservation uses one lane; a one-lane bus road is not duplicated", () => {
    for (const lanes of [1, 4]) {
      const n = buildNetwork(
        fixture({ busLanes: "outer", busSurface: "red", oneWay: true, lanes }),
      );
      finite(n);
      assert.equal(n.mobility.filter((m) => m.kind === "bus-lane").length, 1);
    }
  });
  it("concrete buffers leave a full physical gap through vehicle crossings", () => {
    const p = fixture(presets.find((p) => p.id === "cycle-street")!.settings);
    p.roads[0].driveways.push({
      id: "entry",
      at: 0.5,
      side: 1,
      width: 7,
      apron: 4,
    });
    const n = buildNetwork(p),
      s = n.spans[0],
      f = frameAt(s, 100),
      q = surfacePoint(f, motorHalfWidth(s.road) + s.road.cycleSeparator / 2),
      m = n.meshes.find((m) => m.kind === "cycle" && m.material === "curb")!;
    assert.equal(meshSurfaceY(m, q), undefined);
    const elsewhere = surfacePoint(
      frameAt(s, 80),
      motorHalfWidth(s.road) + s.road.cycleSeparator / 2,
    );
    assert(meshSurfaceY(m, elsewhere)! > elsewhere[1] + 0.09);
  });
  it("painted lanes have no accidental raised protection; bus/bicycle decals have bounded UVs", () => {
    const n = buildNetwork(
      fixture(presets.find((p) => p.id === "cycle-painted")!.settings),
    );
    assert(!n.meshes.some((m) => m.kind === "cycle" && m.material === "curb"));
    for (const m of n.meshes.filter((m) => m.material.startsWith("marking-")))
      assert(m.uvs.every((v) => v >= 0 && v <= 1));
  });
  it("cycle junction ribbons conform to the actual deck and connect the four approach mouths", () => {
    const p = crossroads([4.8, 4.8, 4.8, 4.8]);
    p.nodes[0].crossings = true;
    p.roads.forEach((r) =>
      Object.assign(
        r,
        presets.find((p) => p.id === "euro-boulevard")!.settings,
      ),
    );
    const n = buildNetwork(p),
      j = n.junctions[0],
      asphalt = n.meshes.find(
        (m) => m.owner === j.node.id && m.kind === "asphalt",
      )!;
    assert.equal(
      n.mobility.filter((m) => m.kind === "cycle-connection").length,
      4,
    );
    assert.equal(
      n.mobility.filter((m) => m.kind === "cycle-crossing").length,
      4,
    );
    for (const m of n.meshes.filter(
      (m) => m.owner === j.node.id && m.material === "cycle-red",
    ))
      for (const p of points(m)) {
        const y = meshSurfaceY(asphalt, p);
        assert(y !== undefined);
        assert(Math.abs(p[1] - y - 0.004) < 1e-6);
      }
    finite(n);
  });
  it("legacy imports default to no bus / cycle reservation; malformed widths are bounded", () => {
    const raw = JSON.parse(JSON.stringify(fixture()));
    for (const k of [
      "busLanes",
      "busSurface",
      "cycleMode",
      "cycleWidth",
      "cycleSeparator",
      "treePits",
      "pitWidth",
      "pitLength",
      "pitSpacing",
      "pitGrate",
    ])
      delete raw.roads[0][k];
    const r = parseProject(raw).roads[0];
    assert.equal(r.busLanes, "none");
    assert.equal(r.cycleMode, "none");
    assert.equal(r.treePits, false);
    raw.roads[0].cycleWidth = 100;
    raw.roads[0].cycleSeparator = -20;
    assert.equal(parseProject(raw).roads[0].cycleWidth, 3.5);
    assert.equal(parseProject(raw).roads[0].cycleSeparator, 0.3);
    const p = fixture();
    p.roads[0].cycleWidth = Infinity;
    assert.throws(() => validateGenerationBudget(p));
  });
  it("JSON/OBJ manifest includes usable mobility, planting and offset metadata", () => {
    const p = fixture(presets.find((p) => p.id === "euro-boulevard")!.settings),
      n = buildNetwork(p),
      manifest = exportMeshManifest(n, p);
    assert.deepEqual(manifest.mobility, n.mobility);
    assert.deepEqual(manifest.plantings, n.plantings);
    assert(exportOBJ(n).mtl.includes("newmtl cycle-red"));
    assert(exportOBJ(n).mtl.includes("newmtl bus-red"));
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(parseProject(JSON.parse(JSON.stringify(p))).roads[0]),
      ),
      JSON.parse(JSON.stringify(p.roads[0])),
    );
  });
});
