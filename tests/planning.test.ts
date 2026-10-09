import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  parseProject,
  validateGenerationBudget,
  presets,
  type Project,
} from "../src/core/model";
import { makeSite, sitePoint, siteOutline, type Site } from "../src/core/sites";
import {
  buildNetwork,
  frameAt,
  type Network,
  type MeshData,
} from "../src/core/geometry";
import { footwayPoint, inRamp } from "../src/core/footways";
import { meshSurfaceY } from "../src/core/road-details";
import { parkingPlan } from "../src/core/site-geometry";
import { overlap2 } from "../src/core/polygons";
import { exportMeshManifest, exportOBJ } from "../src/core/export";
import { add, distance, type V3 } from "../src/core/math";
const project = (site: Site): Project => ({
  version: 1,
  name: "Planning piece",
  nodes: [],
  roads: [],
  sites: [site],
});
const fixture = (): Project => {
  const a = makeNode([0, 0, 0]),
    z = makeNode([150, 0, 0]),
    r = makeRoad(a, z, "Planting street", {
      sidewalk: 4.8,
      treePits: true,
      manholes: false,
      drainage: false,
    });
  return { version: 1, name: "Empty footway pits", nodes: [a, z], roads: [r] };
};
const height = (meshes: MeshData[], p: V3) =>
  meshes
    .map((m) => meshSurfaceY(m, p))
    .filter((y): y is number => y !== undefined);
function finite(n: Network) {
  for (const m of n.meshes) {
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
describe("real empty planting openings, never trees", () => {
  it("road pits cut the footway, keep 2 m clear walk and contain recessed soil", () => {
    const p = fixture();
    p.roads[0].driveways.push({
      id: "entry",
      at: 0.5,
      side: 1,
      width: 7,
      apron: 3,
    });
    const n = buildNetwork(p),
      s = n.spans[0];
    assert(n.plantings.length >= 12);
    for (const pit of n.plantings) {
      assert.equal(pit.containsTree, false);
      assert(pit.clearWalkWidth! >= 2);
      assert.equal(
        height(
          n.meshes.filter((m) => m.owner === pit.owner && m.kind === "paving"),
          pit.position,
        ).length,
        0,
        "no paving sheet beneath the opening",
      );
      const soil = height(
        n.meshes.filter((m) => m.material === "soil"),
        pit.position,
      );
      assert(soil.some((y) => Math.abs(y - pit.position[1] + 0.16) < 1e-6));
      const spec = s.footway!.pits!.find(
        (a) =>
          Math.abs(a.s - pit.position[0]) < 1e-6 &&
          a.side === (pit.position[2] > 0 ? 1 : -1),
      )!;
      assert(spec);
      assert(!inRamp(s.footway!, spec.s, spec.side, spec.length / 2 + 1));
    }
    finite(n);
    assert(
      !n.meshes.some((m) => m.kind === "landscape" || m.kind === "building"),
    );
  });
  it("narrow walks and bridges suppress pits rather than blocking pedestrians", () => {
    for (const settings of [{ sidewalk: 3.5 }, { bridge: true }]) {
      const p = fixture();
      Object.assign(p.roads[0], settings);
      const n = buildNetwork(p);
      assert.equal(n.plantings.length, 0);
    }
  });
  for (const grate of [false, true])
    for (const size of [0.8, 1.8])
      it(`standalone ${size} m piece, grate=${grate}: legal small dimensions and an actual root opening`, () => {
        const s = makeSite("tree-pit", [17, 2, -9]);
        Object.assign(s, {
          width: size,
          depth: size === 0.8 ? 0.8 : 3,
          pitGrate: grate,
          yaw: 27,
        });
        const n = buildNetwork(project(s));
        finite(n);
        assert.equal(n.plantings.length, 1);
        assert.equal(n.plantings[0].containsTree, false);
        const center = sitePoint(s, 0, 0, 0.12);
        assert.equal(
          height(
            n.meshes.filter(
              (m) => m.material === "curb" || m.material === "tree-grate",
            ),
            center,
          ).length,
          0,
        );
        assert(
          height(
            n.meshes.filter((m) => m.material === "soil"),
            center,
          ).some((y) => Math.abs(y - center[1] + 0.16) < 1e-7),
        );
        assert.equal(siteOutline(s).length, 4);
      });
  it("grates have physical slots away from their central root opening", () => {
    const s = makeSite("tree-pit", [0, 0, 0]);
    s.pitGrate = true;
    const n = buildNetwork(project(s)),
      m = n.meshes.find((m) => m.material === "tree-grate")!;
    assert.equal(meshSurfaceY(m, sitePoint(s, 0, -1.24, 0.12)), undefined);
    assert(meshSurfaceY(m, sitePoint(s, 0.45, 0, 0.12)) !== undefined);
    assert(m.indices.length > 100);
  });
  it("tree-pit imports stay small and rectangular; invalid transforms/details fail preflight", () => {
    const s = makeSite("tree-pit", [0, 0, 0]),
      raw = JSON.parse(JSON.stringify(project(s)));
    raw.sites[0].shape = "circle";
    raw.sites[0].width = 100;
    const parsed = parseProject(raw).sites![0];
    assert.equal(parsed.width, 6);
    assert.equal(parsed.shape, "rectangle");
    const p = project(s);
    s.position[0] = Infinity;
    assert.throws(() => validateGenerationBudget(p), /transform/);
    s.position[0] = 0;
    s.width = 0.1;
    assert.throws(() => validateGenerationBudget(p), /dimensions/);
  });
});
describe("open block frontage / courtyard pieces", () => {
  for (const shape of ["rectangle", "circle", "triangle"] as const)
    it(`${shape}: the plot has no hidden building, paving roof or bottom slab`, () => {
      const s = makeSite("urban-block", [4, 1, -8]);
      s.shape = shape;
      s.yaw = 31;
      const n = buildNetwork(project(s));
      finite(n);
      const center = sitePoint(
        s,
        shape === "triangle" ? -s.width / 6 : 0,
        shape === "triangle" ? -s.depth / 6 : 0,
      );
      assert.equal(height(n.meshes, center).length, 0);
      assert.equal(n.blocks.length, 1);
      assert.equal(n.blocks[0].hasBuildings, false);
      assert(n.blocks[0].plotArea > 100);
      assert(
        !n.meshes.some((m) => m.kind === "building" || m.kind === "landscape"),
      );
    });
  for (const side of ["north", "south", "east", "west"] as const)
    it(`${side} vehicle gateway cuts the frontage, border and plinth`, () => {
      const s = makeSite("urban-block", [0, 0, 0]);
      s.blockEntrySide = side;
      s.blockEntryWidth = 7;
      s.yaw = 38;
      const n = buildNetwork(project(s)),
        x =
          side === "west"
            ? -s.width / 2 + s.blockBand / 2
            : side === "east"
              ? s.width / 2 - s.blockBand / 2
              : 0,
        z =
          side === "north"
            ? -s.depth / 2 + s.blockBand / 2
            : side === "south"
              ? s.depth / 2 - s.blockBand / 2
              : 0;
      assert.equal(height(n.meshes, sitePoint(s, x, z)).length, 0);
      assert.deepEqual(n.blocks[0].entry, { side, width: 7 });
      assert(
        height(
          n.meshes,
          sitePoint(
            s,
            x + (side === "north" || side === "south" ? 8 : 0),
            z + (side === "east" || side === "west" ? 8 : 0),
          ),
        ).length > 0,
      );
      finite(n);
    });
  it("a paved courtyard is an explicit option, not silently added architecture", () => {
    const s = makeSite("urban-block", [0, 0, 0]);
    s.blockInterior = "paved";
    const n = buildNetwork(project(s));
    assert(
      height(n.meshes, sitePoint(s, 0, 0)).some(
        (y) => Math.abs(y - 0.12) < 1e-7,
      ),
    );
    assert.equal(n.blocks[0].interior, "paved");
  });
});
describe("modern procedural parking / empty islands / EV reservations", () => {
  for (const angle of [45, 60, 90] as const)
    it(`${angle}° islands replace valid bays, preserve circulation and subtract from reported capacity`, () => {
      const s = makeSite("parking", [0, 0, 0]);
      Object.assign(s, {
        width: 64,
        depth: 54,
        parkingAngle: angle,
        accessible: 4,
      });
      const baseline = parkingPlan(s);
      s.parkingIslands = true;
      s.islandEvery = 6;
      s.evBays = 4;
      s.bayFinish = "permeable";
      const p = parkingPlan(s),
        n = buildNetwork(project(s));
      assert(p.islands.length > 0);
      assert.equal(p.bays.length + p.islands.length, baseline.bays.length);
      assert.equal(
        p.bays.filter((b) => b.accessible).length,
        baseline.bays.filter((b) => b.accessible).length,
      );
      assert.equal(p.bays.filter((b) => b.ev).length, 4);
      assert(p.bays.filter((b) => b.ev).every((b) => !b.accessible));
      for (const island of p.islands) {
        assert(!island.accessible);
        for (const aisle of p.aisles)
          assert(!overlap2(island.corners, aisle.polygon));
        assert(!overlap2(island.corners, p.spine.polygon));
        assert(!overlap2(island.corners, p.entry.apron));
      }
      assert.equal(n.parkingSpaces, p.bays.length);
      assert.equal(n.plantings.length, p.islands.length);
      for (const pit of n.plantings)
        assert.equal(
          height(
            n.meshes.filter((m) => m.kind === "parking"),
            pit.position,
          ).length,
          0,
        );
      assert(
        n.meshes.some(
          (m) => m.kind === "parking" && m.material === "paving-permeable",
        ),
      );
      assert(n.meshes.some((m) => m.material === "marking-ev"));
      finite(n);
    });
  it("asphalt/concrete/permeable finishes regenerate the real bay surfaces", () => {
    for (const finish of ["asphalt", "concrete", "permeable"] as const) {
      const s = makeSite("parking", [0, 0, 0]);
      s.bayFinish = finish;
      const n = buildNetwork(project(s));
      assert(
        n.meshes.some(
          (m) =>
            m.kind === "parking" &&
            m.material ===
              (finish === "permeable" ? "paving-permeable" : finish),
        ),
      );
      finite(n);
    }
  });
  it("reservations/islands do not renumber capacity with gaps, and requests are import-bounded", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.parkingIslands = true;
    s.evBays = 100;
    const raw = JSON.parse(JSON.stringify(project(s))),
      parsed = parseProject(raw).sites![0];
    assert.equal(parsed.evBays, 30);
    assert.throws(() => validateGenerationBudget(project(s)));
    s.evBays = 30;
    assert.deepEqual(
      parkingPlan(s).bays.map((b) => b.number),
      parkingPlan(s).bays.map((_, i) => i + 1),
    );
  });
});
describe("European quarter authoring / engine payload", () => {
  it("a connected European example contains aligned gated blocks, procedural courts and real bus/cycle details, without trees/buildings", () => {
    const p = makeTemplate("europe"),
      n = buildNetwork(p);
    finite(n);
    assert.deepEqual(n.diagnostics, []);
    assert.equal(n.blocks.length, 4);
    assert.equal(p.sites!.filter((s) => s.kind === "parking").length, 4);
    assert(n.plantings.length > 40);
    assert(n.mobility.length > 30);
    assert(n.parkingSpaces > 100);
    assert.equal(n.footways.filter((f) => f.kind === "driveway").length, 4);
    assert(
      !n.meshes.some((m) => m.kind === "building" || m.kind === "landscape"),
    );
    const parsed = parseProject(JSON.parse(JSON.stringify(p)));
    assert.deepEqual(
      JSON.parse(JSON.stringify(parsed)),
      JSON.parse(JSON.stringify(p)),
    );
  });
  it("production retains logical planting/parking IDs and export describes empty space honestly", () => {
    const p = fixture(),
      editing = buildNetwork(p),
      production = buildNetwork(p, { detail: "production" });
    assert.deepEqual(
      production.plantings.map((p) => p.id),
      editing.plantings.map((p) => p.id),
    );
    const s = makeSite("urban-block", [0, 0, 0]),
      n = buildNetwork(project(s)),
      manifest = exportMeshManifest(n, project(s));
    assert.deepEqual(manifest.blocks, n.blocks);
    const pit = makeSite("tree-pit", [0, 0, 0]);
    pit.pitGrate = true;
    const obj = exportOBJ(buildNetwork(project(pit)));
    assert(obj.mtl.includes("newmtl soil"));
    assert(obj.mtl.includes("newmtl tree-grate"));
    assert(obj.mtl.includes("Pm 0.72"));
  });
});
