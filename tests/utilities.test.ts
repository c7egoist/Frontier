import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  parseProject,
  validateGenerationBudget,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import {
  buildNetwork,
  MeshBuilder,
  surfaceHeight,
  type MeshData,
} from "../src/core/geometry";
import { addManhole, addGratedInlet } from "../src/core/utilities";
import {
  makeSite,
  siteOutline,
  insidePolygon,
  type Site,
} from "../src/core/sites";
import { parkingPlan, parkingFootprint } from "../src/core/site-geometry";
import { inside2 } from "../src/core/polygons";
import { exportOBJ, exportMeshManifest } from "../src/core/export";
import { type V3, type V2 } from "../src/core/math";
const vertices = (m: MeshData) =>
  Array.from(
    { length: m.positions.length / 3 },
    (_, i) => m.positions.slice(i * 3, i * 3 + 3) as V3,
  );
function road(settings: Partial<RoadSettings> = {}): Project {
  const a = makeNode([0, 0, 0]),
    b = makeNode([120, 0, 0]);
  return {
    version: 1,
    name: "Utility fixture",
    nodes: [a, b],
    roads: [makeRoad(a, b, "Utility road", settings)],
  };
}
function finite(meshes: MeshData[]) {
  for (const m of meshes) {
    assert(m.positions.every(Number.isFinite));
    assert(m.uvs.every(Number.isFinite));
    assert.equal(m.positions.length / 3, m.uvs.length / 2);
    assert(
      m.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < m.positions.length / 3,
      ),
    );
  }
}
function parking(s: Site): Project {
  return {
    version: 1,
    name: "Utility parking",
    nodes: [],
    roads: [],
    sites: [s],
  };
}

describe("procedural utility primitives", () => {
  it("cast-iron lids have real ring/recess/lifting geometry and normalized disk UVs", () => {
    const b = new MeshBuilder("cover", "road");
    addManhole(
      b,
      (u, v, h = 0) => [u, 0.12 + 0.04 * u - 0.03 * v + h, v],
      0.65,
    );
    const n = b.output();
    finite(n);
    const lid = n.find((m) => m.material === "utility-cover")!;
    assert.equal(lid.indices.length / 3, 64);
    assert(lid.uvs.every((u) => u >= 0 && u <= 1));
    assert(n.some((m) => m.material === "utility-iron"));
    assert(n.some((m) => m.material === "utility-recess"));
    for (const p of vertices(lid))
      assert(
        Math.abs(p[1] - (0.12 + 0.04 * p[0] - 0.03 * p[2] + 0.008)) < 1e-8,
      );
    const all = n.flatMap(vertices);
    assert(
      Math.abs(
        Math.max(...all.map((p) => p[0])) -
          Math.min(...all.map((p) => p[0])) -
          0.65,
      ) < 1e-8,
    );
  });
  it("multiple lids retain independent 0..1 UVs in a batched mesh", () => {
    const b = new MeshBuilder("covers", "site");
    for (const x of [0, 3, 9])
      addManhole(b, (u, v, h = 0) => [x + u, 0.12 + h, v]);
    const lid = b.output().find((m) => m.material === "utility-cover")!;
    assert.equal(lid.positions.length / 3, 65 * 3);
    assert(lid.uvs.every((u) => u >= 0 && u <= 1));
  });
  it("curb inlets have frames and geometric bars, not flat paint", () => {
    const b = new MeshBuilder("grate", "road");
    addGratedInlet(b, (u, v, h = 0) => [u, 0.12 + 0.05 * u - 0.06 * v + h, v]);
    const meshes = b.output();
    finite(meshes);
    assert(meshes.every((m) => m.kind === "drain"));
    assert(meshes.some((m) => m.material === "utility-recess"));
    assert(
      meshes.find((m) => m.material === "utility-iron")!.indices.length > 100,
    );
    for (const p of meshes.flatMap(vertices)) {
      const lift = p[1] - (0.12 + 0.05 * p[0] - 0.06 * p[2]);
      assert(lift >= -0.040001 && lift <= 0.013001);
    }
  });
});

describe("road infrastructure placement", () => {
  it("cover interval, diameter and toggles regenerate real meshes and stable services", () => {
    const p = road(),
      n = buildNetwork(p),
      features = n.services.filter((s) => s.kind === "manhole");
    assert.equal(features.length, 3);
    assert.equal(n.manholes, features.length);
    assert(
      features.every((s) => s.ownerKind === "road" && s.diameter === 0.65),
    );
    assert.equal(new Set(n.services.map((s) => s.id)).size, n.services.length);
    p.roads[0].manholeSpacing = 12;
    assert(buildNetwork(p).manholes > n.manholes);
    p.roads[0].manholes = false;
    const off = buildNetwork(p);
    assert.equal(off.manholes, 0);
    assert(!off.meshes.some((m) => m.kind === "utility"));
  });
  it("covers and inlet frames are kept inside the carriageway at extreme lateral offsets", () => {
    for (const offset of [-8, 0, 8]) {
      const n = buildNetwork(
        road({
          lanes: 1,
          laneWidth: 2,
          manholeDiameter: 1,
          manholeOffset: offset,
        }),
      );
      assert(n.manholes > 0);
      for (const p of n.meshes
        .filter((m) => m.kind === "utility" || m.kind === "drain")
        .flatMap(vertices))
        assert(Math.abs(p[2]) <= 0.931, "road lip clipping");
    }
  });
  it("covers follow actual longitudinal grade and 8% crown/crossfall", () => {
    const p = road({ crossfall: 8 });
    p.nodes[0].position[1] = -0.6;
    p.nodes[1].position[1] = 1;
    p.roads[0].h1 = [40, 1.6 / 3, 0];
    p.roads[0].h2 = [-40, -1.6 / 3, 0];
    const n = buildNetwork(p),
      height = surfaceHeight(n.spans[0].frames[0]);
    for (const v of n.meshes
      .filter((m) => m.material === "utility-cover")
      .flatMap(vertices))
      assert(
        Math.abs(
          v[1] -
            (-0.6 +
              (v[0] * 1.6) / 120 +
              height -
              Math.abs(v[2]) * 0.08 +
              0.008),
        ) < 1e-7,
      );
    assert(n.manholes > 0);
  });
  it("service covers exclude bridge decks without assuming that world Y zero is ground level", () => {
    for (const bridge of [false, true]) {
      const p = road({ bridge });
      for (const node of p.nodes) node.position[1] = 20;
      const n = buildNetwork(p);
      assert.equal(n.manholes, bridge ? 0 : 3);
      assert.equal(
        n.meshes.some((m) => m.material === "utility-cover"),
        !bridge,
      );
    }
  });
  it("raised medians remain clear of service covers", () => {
    const n = buildNetwork(road({ median: 4, manholeOffset: 0 }));
    assert(n.manholes > 0);
    for (const v of n.meshes
      .filter((m) => m.kind === "utility")
      .flatMap(vertices))
      assert(Math.abs(v[2]) >= 2.1799);
  });
  for (const mode of ["curb", "linear", "both"] as const)
    it(`${mode} construction is represented by the matching meshes and metadata`, () => {
      const n = buildNetwork(road({ drainageType: mode }));
      assert.equal(
        n.inlets,
        n.services.filter((s) => s.kind === "curb-inlet").length,
      );
      assert.equal(
        n.services.filter((s) => s.kind === "channel-drain").length,
        mode === "curb" ? 0 : 2,
      );
      assert.equal(n.inlets > 0, mode !== "linear");
      assert.equal(
        n.meshes.some((m) => m.material === "utility-grate"),
        mode !== "curb",
      );
      finite(n.meshes);
      for (const m of n.meshes.filter((m) => m.material === "utility-grate")) {
        assert(Math.max(...m.uvs) > 100);
        assert(
          m.uvs.filter((_, i) => i % 2 === 1).every((v) => v === 0 || v === 1),
        );
      }
    });
  it("disabling drainage removes channels, frames, grilles and gutter strips", () => {
    const n = buildNetwork(road({ drainage: false, drainageType: "both" }));
    assert.equal(n.inlets, 0);
    assert(!n.services.some((s) => s.kind !== "manhole"));
    assert(!n.meshes.some((m) => m.kind === "drain" || m.kind === "gutter"));
  });
  it("junction inlet ownership and service counts survive editing/production profiles", () => {
    const p = makeTemplate("tee"),
      a = buildNetwork(p),
      b = buildNetwork(p, { detail: "production" });
    assert(
      a.services.some((s) => s.ownerKind === "node" && s.kind === "curb-inlet"),
    );
    assert.equal(
      a.inlets,
      a.services.filter((s) => s.kind === "curb-inlet").length,
    );
    assert.deepEqual(
      a.services.map((s) => s.id),
      b.services.map((s) => s.id),
    );
    assert.equal(a.manholes, b.manholes);
  });
});

describe("procedural parking utilities", () => {
  for (const shape of ["rectangle", "circle", "triangle"] as const)
    it(`${shape}: manholes fit completely in connected drive aisles and rotated footprints`, () => {
      const s = makeSite("parking", [30, 1, -50]);
      Object.assign(s, { width: 62, depth: 54, yaw: 37, shape });
      const n = buildNetwork(parking(s)),
        plan = parkingPlan(s),
        mask = parkingFootprint(s);
      assert(n.manholes > 0);
      const a = (s.yaw * Math.PI) / 180;
      for (const v of n.meshes
        .filter((m) => m.kind === "utility")
        .flatMap(vertices)) {
        assert(insidePolygon(v, siteOutline(s)));
        const x = v[0] - s.position[0],
          z = v[2] - s.position[2],
          local: V2 = [
            x * Math.cos(a) + z * Math.sin(a),
            -x * Math.sin(a) + z * Math.cos(a),
          ];
        assert(inside2(mask, local));
        assert(
          plan.aisles.some(
            (aisle) => aisle.connected && inside2(aisle.polygon, local),
          ),
        );
        assert(v[1] >= 1.0799 && v[1] <= 1.1301);
      }
    });
  it("parking inlets count as services and both parking utility toggles are independent", () => {
    const s = makeSite("parking", [0, 0, 0]),
      p = parking(s),
      n = buildNetwork(p);
    assert(n.inlets > 0);
    assert(n.manholes > 0);
    assert.equal(
      n.inlets,
      n.services.filter((s) => s.kind === "curb-inlet").length,
    );
    s.drainage = false;
    assert.equal(buildNetwork(p).inlets, 0);
    assert(buildNetwork(p).manholes > 0);
    s.manholes = false;
    const off = buildNetwork(p);
    assert.equal(off.manholes, 0);
    assert(!off.meshes.some((m) => m.kind === "utility" || m.kind === "drain"));
  });
  it("plain paving and splitter assets do not add service-cover props", () => {
    for (const kind of ["plaza", "island"] as const)
      assert.equal(
        buildNetwork(parking(makeSite(kind, [0, 0, 0]))).services.length,
        0,
      );
  });
});

describe("utility persistence, safety and export", () => {
  it("legacy v1 imports receive compatible utility defaults and explicit toggles round-trip", () => {
    const p = road();
    p.sites = [makeSite("parking", [0, 0, 30])];
    const raw = JSON.parse(JSON.stringify(p));
    for (const r of raw.roads)
      for (const key of [
        "manholes",
        "manholeDiameter",
        "manholeSpacing",
        "manholeOffset",
        "drainageType",
      ])
        delete r[key];
    for (const s of raw.sites)
      for (const key of ["manholes", "manholeDiameter", "drainage"])
        delete s[key];
    const loaded = parseProject(raw);
    assert.equal(loaded.roads[0].manholeDiameter, 0.65);
    assert.equal(loaded.roads[0].manholes, true);
    assert.equal(loaded.roads[0].drainageType, "curb");
    assert.equal(loaded.sites![0].manholes, true);
    assert.equal(loaded.sites![0].drainage, true);
    p.roads[0].manholes = false;
    p.roads[0].drainageType = "both";
    p.sites![0].drainage = false;
    assert.deepEqual(parseProject(p), p);
  });
  it("invalid direct utility settings reject before mesh allocation; import clamps them", () => {
    const p = road();
    p.roads[0].manholeSpacing = 0;
    assert.throws(() => buildNetwork(p), /utility parameters/);
    assert.equal(parseProject(p).roads[0].manholeSpacing, 12);
    p.roads[0].manholeSpacing = 35;
    p.roads[0].manholeOffset = Infinity;
    assert.throws(() => validateGenerationBudget(p), /utility parameters/);
    const s = makeSite("parking", [0, 0, 0]);
    s.manholeDiameter = NaN;
    assert.throws(() => buildNetwork(parking(s)), /parking parameters/);
  });
  it("utility vertex preflight bounds dense cover/inlet repeats before allocation", () => {
    const p: Project = {
      version: 1,
      name: "Utility load budget",
      nodes: [],
      roads: [],
    };
    for (let i = 0; i < 9; i++) {
      const a = makeNode([0, 0, i * 20]),
        b = makeNode([2000, 0, i * 20]);
      p.nodes.push(a, b);
      p.roads.push(
        makeRoad(a, b, "Dense services", {
          manholeSpacing: 12,
          inletSpacing: 6,
        }),
      );
    }
    assert.throws(() => validateGenerationBudget(p), /Utility detail budget/);
  });
  it("OBJ and mesh manifest contain real covers/drains, surface UVs, material bindings and service IDs", () => {
    const p = road({ drainageType: "both" }),
      n = buildNetwork(p),
      output = exportOBJ(n, "utilities", {
        "utility-cover": {
          path: "textures/utility-cover.png",
          scale: [1, 1],
          alpha: false,
          normalPath: "textures/utility-cover-normal.png",
          roughnessPath: "textures/utility-cover-roughness.png",
        },
      }),
      manifest = exportMeshManifest(n, p);
    assert(output.obj.includes("usemtl utility-cover"));
    assert(output.obj.includes("usemtl utility-grate"));
    assert(output.mtl.includes("Pm 0.72"));
    assert(output.mtl.includes("map_Kd -s 1 1 1 textures/utility-cover.png"));
    assert(output.mtl.includes("norm -s 1 1 1"));
    assert(output.mtl.includes("map_Pr -s 1 1 1"));
    assert.deepEqual(manifest.services, n.services);
    assert(manifest.objects.some((o) => o.kind === "utility"));
    assert(!output.obj.includes("NaN"));
  });
});
