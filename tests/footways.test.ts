import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Ray, Vector3 } from "three";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  parseProject,
  validateGenerationBudget,
  controlPoints,
  roadDefaults,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import {
  buildNetwork,
  frameAt,
  edgePoint,
  type MeshData,
} from "../src/core/geometry";
import {
  footwayPoint,
  curbTopPoint,
  stationForParameter,
  inRamp,
} from "../src/core/footways";
import { splitRoad, resolveCrossings } from "../src/core/editing";
import { exportMeshManifest, exportOBJ } from "../src/core/export";
import { cubic, distance, distanceXZ, type V3 } from "../src/core/math";

function fixture(settings: Partial<RoadSettings> = {}): Project {
  const a = makeNode([0, 0, 0]),
    b = makeNode([120, 0, 0]);
  return {
    version: 1,
    name: "Footway fixture",
    nodes: [a, b],
    roads: [
      makeRoad(a, b, "Pedestrian road", { manholes: false, ...settings }),
    ],
  };
}
const vertices = (m: MeshData) =>
  Array.from(
    { length: m.positions.length / 3 },
    (_, i) => m.positions.slice(i * 3, i * 3 + 3) as V3,
  );
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
function rayHits(meshes: MeshData[], origin: V3, direction: V3) {
  const ray = new Ray(new Vector3(...origin), new Vector3(...direction)),
    hits: V3[] = [];
  for (const m of meshes)
    for (let i = 0; i < m.indices.length; i += 3) {
      const v = m.indices
        .slice(i, i + 3)
        .map((k) => new Vector3(...m.positions.slice(k * 3, k * 3 + 3)));
      const hit = ray.intersectTriangle(v[0], v[1], v[2], false, new Vector3());
      if (hit) hits.push(hit.toArray() as V3);
    }
  return hits;
}
function addEntry(p: Project, at = 0.5, side: 1 | -1 = 1) {
  p.roads[0].driveways.push({ id: "entry", at, side, width: 6, apron: 4 });
}

describe("continuous pedestrian footways and metric curb profiles", () => {
  it("new streets have wide footways; legacy imports receive the new bounded fields", () => {
    assert.equal(roadDefaults.sidewalk, 4.2);
    assert.equal(roadDefaults.curbHeight, 0.16);
    const p = fixture(),
      raw = JSON.parse(JSON.stringify(p));
    delete raw.roads[0].driveways;
    delete raw.roads[0].curbHeight;
    delete raw.roads[0].sidewalkCrossfall;
    delete raw.roads[0].curbDrainType;
    const r = parseProject(raw).roads[0];
    assert.deepEqual(r.driveways, []);
    assert.equal(r.curbHeight, 0.16);
    assert.equal(r.sidewalkCrossfall, 1.5);
    assert.equal(r.curbDrainType, "grate");
    raw.roads[0].sidewalk = 50;
    raw.roads[0].curbHeight = 100;
    raw.roads[0].rampRun = 100;
    raw.roads[0].sidewalkCrossfall = -100;
    const bounded = parseProject(raw).roads[0];
    assert.equal(bounded.sidewalk, 12);
    assert.equal(bounded.curbHeight, 0.3);
    assert.equal(bounded.rampRun, 6);
    assert.equal(bounded.sidewalkCrossfall, -3);
  });
  it("12 m footways follow the entire curve and crossfall rises away from the curb", () => {
    const n = buildNetwork(fixture({ sidewalk: 12, sidewalkCrossfall: 1.5 })),
      s = n.spans[0];
    for (const side of [-1, 1])
      for (const station of [s.frames[0].s, 60, s.frames.at(-1)!.s]) {
        const a = footwayPoint(s, station, side, 0),
          b = footwayPoint(s, station, side, 12);
        assert(Math.abs(distanceXZ(a, b) - 12) < 1e-8);
        assert(Math.abs(b[1] - a[1] - 0.18) < 1e-8);
      }
    finite(n.meshes);
    assert.equal(n.diagnostics.length, 0);
  });
  for (const [style, height] of [
    ["stone", 0.3],
    ["flush", 0.04],
    ["race", 0.08],
  ] as const)
    it(`${style} curb upstand and profile caps affect the actual vertices`, () => {
      const s = buildNetwork(fixture({ curbStyle: style, curbHeight: 0.3 }))
          .spans[0],
        f = frameAt(s, 60);
      assert.equal(f.curbHeight, height);
      for (const side of [-1, 1])
        assert(
          Math.abs(
            curbTopPoint(s, 60, side)[1] -
              edgePoint(f, side, "road")[1] -
              height,
          ) < 1e-8,
        );
    });
  it("endpoint footway vertices retain the exact pinned joint cross-sections", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r) => {
      r.sidewalk = 7.4;
      r.curbHeight = 0.23;
      r.sidewalkCrossfall = 2.1;
    });
    const n = buildNetwork(p);
    for (const s of n.spans)
      for (const f of [s.frames[0], s.frames.at(-1)!])
        for (const side of [-1, 1]) {
          const m = n.meshes.find(
            (m) =>
              m.owner === s.road.id &&
              m.material === `paving-${s.road.pattern}`,
          )!;
          assert(
            vertices(m).some(
              (v) => distance(v, footwayPoint(s, f.s, side, 0)) < 1e-9,
            ),
          );
          assert(
            vertices(m).some(
              (v) => distance(v, edgePoint(f, side, "outer")) < 1e-9,
            ),
          );
        }
    finite(n.meshes);
    assert(!n.diagnostics.some((d) => d.level === "error"));
  });
});

describe("corner and vehicle access ramps", () => {
  it("a tee receives graded crossing ramps, flares, tactile patches and clear landings", () => {
    const n = buildNetwork(makeTemplate("tee"));
    assert.equal(n.footways.filter((f) => f.kind === "corner-ramp").length, 6);
    for (const feature of n.footways) {
      const s = n.spans.find((s) => s.road.id === feature.owner)!,
        f = frameAt(s, feature.station),
        base = edgePoint(f, feature.side, "road"),
        r = s.footway!.ramps.find((r) => r.id === feature.id)!;
      assert(
        Math.abs(curbTopPoint(s, r.s, r.side)[1] - base[1] - 0.006) < 1e-8,
      );
      assert(
        Math.abs(
          footwayPoint(s, r.s, r.side, r.run)[1] -
            base[1] -
            f.curbHeight -
            (r.run * f.sidewalkCrossfall) / 100,
        ) < 1e-8,
      );
      assert(
        Math.abs(
          curbTopPoint(s, r.s + r.width / 2 + r.flare, r.side)[1] -
            edgePoint(
              frameAt(s, r.s + r.width / 2 + r.flare),
              r.side,
              "road",
            )[1] -
            f.curbHeight,
        ) < 1e-8,
      );
      assert(feature.landing >= 0.75);
      assert(feature.slope > 0 && feature.slope < 8.4);
    }
    assert(n.meshes.some((m) => m.material === "paving-tactile"));
    finite(n.meshes);
  });
  it("crossings, ramp and tactile controls remove only their intended geometry", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r) => (r.tactile = false));
    let n = buildNetwork(p);
    assert(n.footways.length > 0);
    assert(!n.meshes.some((m) => m.material === "paving-tactile"));
    p.roads.forEach((r) => (r.cornerRamps = false));
    assert.equal(buildNetwork(p).footways.length, 0);
    p.roads.forEach((r) => (r.cornerRamps = true));
    p.nodes.forEach((n) => (n.crossings = false));
    assert.equal(buildNetwork(p).footways.length, 0);
  });
  it("ramps are suppressed in merge throats, racing alignments, bridges and very narrow footways", () => {
    assert.equal(buildNetwork(makeTemplate("merge")).footways.length, 0);
    for (const settings of [
      { markingStyle: "race" },
      { bridge: true },
      { sidewalk: 0.5 },
    ] as Partial<RoadSettings>[]) {
      const p = makeTemplate("tee");
      p.roads.forEach((r) => Object.assign(r, settings));
      assert.equal(buildNetwork(p).footways.length, 0);
    }
  });
  it("driveway parameter, side, vehicle opening and beyond-footway apron generate actual meshes", () => {
    const p = fixture({ guardrails: true });
    addEntry(p);
    const n = buildNetwork(p),
      s = n.spans[0],
      feature = n.footways[0];
    assert.equal(feature.kind, "driveway");
    assert.equal(feature.side, 1);
    assert.equal(feature.width, 6);
    assert.equal(feature.apron, 4);
    assert.equal(feature.station, 60);
    assert(
      n.meshes.some((m) => m.kind === "paving" && m.material === "concrete"),
    );
    const apron = n.meshes
        .filter((m) => m.kind === "paving" && m.material === "concrete")
        .flatMap(vertices),
      f = frameAt(s, 60);
    assert(
      Math.abs(Math.max(...apron.map((v) => v[2])) - (f.hw + f.cw + f.sw + 4)) <
        1e-8,
    );
    assert(
      Math.abs(curbTopPoint(s, 60, 1)[1] - edgePoint(f, 1, "road")[1] - 0.006) <
        1e-8,
    );
    assert(
      Math.abs(
        curbTopPoint(s, 60, -1)[1] - edgePoint(f, -1, "road")[1] - 0.16,
      ) < 1e-8,
    );
    finite(n.meshes);
  });
  it("rails and the selected-side edge line do not block a vehicle crossing", () => {
    const p = fixture({ guardrails: true, markings: true });
    addEntry(p);
    const n = buildNetwork(p),
      s = n.spans[0],
      hw = s.frames[0].hw;
    for (const m of n.meshes.filter(
      (m) => m.kind === "rail" || m.kind === "marking",
    ))
      for (let i = 0; i < m.indices.length; i += 3) {
        const tri = m.indices
          .slice(i, i + 3)
          .map((k) => m.positions.slice(k * 3, k * 3 + 3) as V3);
        if (tri.every((v) => v[2] > (m.kind === "rail" ? 0 : hw - 0.3)))
          assert(
            !(
              Math.min(...tri.map((v) => v[0])) < 60 &&
              Math.max(...tri.map((v) => v[0])) > 60
            ),
            "no triangle spans the vehicle opening",
          );
      }
    assert(n.meshes.some((m) => m.kind === "rail"));
  });
  it("explicitly enabled signs and light poles stay clear of vehicle entry aprons", () => {
    const p = fixture({ signs: true, streetLights: true });
    addEntry(p, 0.925);
    const n = buildNetwork(p);
    assert(n.footways.some((f) => f.kind === "driveway"));
    const v = n.meshes
      .filter((m) => m.kind === "lamp" || m.kind === "sign")
      .flatMap(vertices)
      .filter((v) => v[2] > 0);
    assert(v.length > 0);
    assert(!v.some((v) => v[0] > 107 && v[0] < 115));
  });
  it("curbside parking bays and live capacity leave vehicle entries clear", () => {
    const p = fixture({ parking: "parallel" }),
      before = buildNetwork(p).parkingSpaces;
    addEntry(p);
    const n = buildNetwork(p);
    assert(n.parkingSpaces < before);
    const s = n.spans[0];
    for (const m of n.meshes.filter((m) => m.kind === "marking"))
      for (let i = 0; i < m.indices.length; i += 3) {
        const tri = m.indices
          .slice(i, i + 3)
          .map((k) => m.positions.slice(k * 3, k * 3 + 3) as V3);
        if (tri.every((v) => v[2] > s.frames[0].hw - 2.3))
          assert(
            !(
              Math.min(...tri.map((v) => v[0])) < 60 &&
              Math.max(...tri.map((v) => v[0])) > 60
            ),
          );
      }
  });
  it("nonuniform Bezier parameter mapping stays at the authored curve position", () => {
    const p = fixture();
    p.roads[0].h1 = [5, 0, 12];
    p.roads[0].h2 = [-45, 0, -12];
    addEntry(p, 0.42);
    const n = buildNetwork(p),
      s = n.spans[0],
      station = stationForParameter(s, 0.42),
      curvePoint = cubic(controlPoints(p, p.roads[0]), 0.42);
    assert.equal(n.footways[0].station, station);
    assert(distance(frameAt(s, station).p, curvePoint) < 0.06);
  });
  it("too-close and overlapping entries are preserved in the graph and reported, never doubled", () => {
    const p = fixture();
    addEntry(p, 0.01);
    p.roads[0].driveways.push(
      { id: "a", at: 0.5, side: 1, width: 6, apron: 4 },
      { id: "b", at: 0.51, side: 1, width: 6, apron: 4 },
    );
    const n = buildNetwork(p);
    assert.equal(p.roads[0].driveways.length, 3);
    assert.equal(n.footways.length, 1);
    assert(
      n.diagnostics.some(
        (d) => d.level === "warning" && d.message.includes("entry"),
      ),
    );
  });
  it("splitting remaps each entry once and preserves its world-space authoring position", () => {
    const p = fixture();
    p.roads[0].h1 = [7, 0, 14];
    p.roads[0].h2 = [-32, 0, -12];
    p.roads[0].driveways = [0.2, 0.6, 0.9].map((at, i) => ({
      id: `entry${i}`,
      at,
      side: 1,
      width: 6,
      apron: 4,
    }));
    const curve = controlPoints(p, p.roads[0]),
      points = new Map(
        p.roads[0].driveways.map((d) => [d.id, cubic(curve, d.at)]),
      );
    splitRoad(p, p.roads[0].id, 0.4);
    assert.equal(p.roads.flatMap((r) => r.driveways).length, 3);
    assert.equal(p.roads[0].driveways.length, 1);
    assert.equal(p.roads[1].driveways.length, 2);
    for (const r of p.roads)
      for (const d of r.driveways)
        assert(
          distance(cubic(controlPoints(p, r), d.at), points.get(d.id)!) < 1e-8,
        );
  });
  it("automatic crossing resolution also partitions driveway entries without duplication", () => {
    const p = fixture();
    addEntry(p, 0.8);
    const a = makeNode([40, 0, -30]),
      b = makeNode([40, 0, 30]);
    p.nodes.push(a, b);
    p.roads.push(makeRoad(a, b, "Crossing"));
    assert.equal(resolveCrossings(p), 1);
    assert.equal(p.roads.flatMap((r) => r.driveways).length, 1);
    const r = p.roads.find((r) => r.driveways.length)!;
    assert(
      distance(cubic(controlPoints(p, r), r.driveways[0].at), [96, 0, 0]) <
        1e-7,
    );
  });
});

describe("curb-face drainage and engine data", () => {
  it("side-entry construction removes the solid curb face and includes a throat and inspection slab", () => {
    const n = buildNetwork(fixture({ curbDrainType: "side-entry" })),
      s = n.spans[0],
      feature = n.services.find(
        (f) => f.style === "side-entry" && f.id.includes(":1:"),
      )!,
      origin: V3 = [
        feature.position[0],
        feature.position[1],
        s.frames[0].hw - 0.2,
      ];
    assert(n.services.every((s) => s.style === "side-entry"));
    assert(n.services.length > 0);
    assert.equal(n.inlets, n.services.length);
    assert.equal(
      rayHits(
        n.meshes.filter((m) => m.kind === "curb"),
        origin,
        [0, 0, 1],
      ).length,
      0,
      "the opening is not covered by an intact curb",
    );
    assert(
      rayHits(
        n.meshes.filter((m) => m.material === "utility-recess"),
        origin,
        [0, 0, 1],
      ).length > 0,
      "recess behind the open face",
    );
    assert(
      n.meshes.some((m) => m.kind === "drain" && m.material === "concrete"),
    );
    assert(!n.meshes.some((m) => m.material === "utility-iron"));
    finite(n.meshes);
  });
  it("hollow kerbs contain real arched apertures, recessed tunnels and occasional top access grates", () => {
    const n = buildNetwork(fixture({ curbDrainType: "hollow" })),
      s = n.spans[0],
      feature = n.services.find(
        (f) => f.style === "hollow" && f.id.endsWith(":1"),
      )!,
      origin: V3 = [
        feature.position[0],
        feature.position[1],
        s.frames[0].hw - 0.2,
      ];
    assert.equal(n.services.length, 2);
    assert(n.inlets > 200);
    assert.equal(
      n.inlets,
      n.services.reduce((n, s) => n + (s.ports ?? 1), 0),
    );
    assert(feature.accessGrates! > 0);
    assert.equal(
      rayHits(
        n.meshes.filter((m) => m.kind === "curb"),
        origin,
        [0, 0, 1],
      ).length,
      0,
      "arched opening has no solid face behind it",
    );
    assert(
      rayHits(
        n.meshes.filter((m) => m.material === "utility-recess"),
        origin,
        [0, 0, 1],
      ).length > 0,
    );
    origin[1] = edgePoint(frameAt(s, feature.position[0]), 1, "road")[1] + 0.13;
    assert(
      rayHits(
        n.meshes.filter((m) => m.kind === "curb"),
        origin,
        [0, 0, 1],
      ).length > 0,
      "upper kerb is solid",
    );
    const top: V3 = [
      17.875,
      edgePoint(frameAt(s, 17.875), 1, "road")[1] + 0.4,
      s.frames[0].hw + s.frames[0].cw / 2,
    ];
    assert.equal(
      rayHits(
        n.meshes.filter((m) => m.kind === "curb"),
        top,
        [0, -1, 0],
      ).length,
      0,
      "top grate does not sit over a solid roof",
    );
    assert(n.meshes.some((m) => m.material === "utility-iron"));
    finite(n.meshes);
  });
  it("hollow-module counts and metadata stay stable across editing and production tessellation", () => {
    const p = fixture({ curbDrainType: "hollow" });
    addEntry(p);
    const a = buildNetwork(p),
      b = buildNetwork(p, { detail: "production" });
    assert.deepEqual(a.services, b.services);
    assert.deepEqual(a.footways, b.footways);
    assert.equal(a.inlets, b.inlets);
    assert(b.triangles > a.triangles);
  });
  it("drains avoid graded corner and driveway curb openings", () => {
    for (const style of ["grate", "side-entry"] as const) {
      const p = fixture({ curbDrainType: style, inletSpacing: 6 });
      addEntry(p);
      const n = buildNetwork(p),
        s = n.spans[0];
      for (const inlet of s.footway!.inlets)
        assert(!inRamp(s.footway, inlet.s, inlet.side, 1));
      assert(n.inlets > 0);
    }
    const p = fixture({ curbDrainType: "hollow" }),
      full = buildNetwork(p).inlets;
    addEntry(p);
    const n = buildNetwork(p);
    assert(n.inlets < full);
    assert(n.inlets > 0);
  });
  it("low/flush curbs fall back to road grates and disabling drainage restores an unperforated curb", () => {
    for (const style of ["side-entry", "hollow"] as const) {
      const p = fixture({ curbDrainType: style, curbStyle: "flush" });
      let n = buildNetwork(p);
      assert(n.inlets > 0);
      assert(
        !n.services.some(
          (s) => s.style === "side-entry" || s.style === "hollow",
        ),
      );
      p.roads[0].drainage = false;
      n = buildNetwork(p);
      assert.equal(n.inlets, 0);
      assert(!n.meshes.some((m) => m.kind === "drain"));
    }
  });
  it("manifests and OBJ include ramp dimensions, port counts and tactile surfaces without scenery", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r) => (r.curbDrainType = "hollow"));
    addEntry(p, 0.5);
    const n = buildNetwork(p),
      manifest = exportMeshManifest(n, p);
    assert.deepEqual(manifest.footways, n.footways);
    assert(manifest.services.some((s) => s.style === "hollow" && s.ports! > 0));
    assert(
      manifest.footways.some((f) => f.kind === "driveway" && f.apron === 4),
    );
    assert(
      manifest.footways.every(
        (f) => Number.isFinite(f.slope) && f.landing >= 0,
      ),
    );
    const obj = exportOBJ(n);
    assert(obj.obj.includes("paving-tactile"));
    assert(obj.mtl.includes("newmtl paving-tactile"));
    assert(!n.meshes.some((m) => ["building", "landscape"].includes(m.kind)));
  });
  it("editable JSON round-trips the bounded curb, footway and authored-entry settings", () => {
    const p = fixture({
      sidewalk: 8.2,
      sidewalkCrossfall: -1.2,
      curbHeight: 0.22,
      rampRun: 4.8,
      rampWidth: 2.6,
      curbDrainType: "side-entry",
    });
    addEntry(p, 0.32, -1);
    const r = parseProject(JSON.parse(JSON.stringify(p))).roads[0];
    assert.deepEqual(r, JSON.parse(JSON.stringify(p.roads[0])));
  });
  it("invalid footway values and excessive driveway counts are rejected before mesh generation", () => {
    const p = fixture();
    p.roads[0].curbHeight = NaN;
    assert.throws(() => validateGenerationBudget(p), /footway/);
    p.roads[0].curbHeight = 0.16;
    p.roads[0].driveways = Array.from({ length: 21 }, (_, i) => ({
      id: `entry${i}`,
      at: 0.5,
      side: 1,
      width: 6,
      apron: 4,
    }));
    assert.throws(() => validateGenerationBudget(p), /driveway/);
    p.roads[0].driveways = [
      { id: "duplicate", at: 0.2, side: 1, width: 6, apron: 4 },
      { id: "duplicate", at: 0.6, side: 1, width: 6, apron: 4 },
    ];
    assert.throws(() => validateGenerationBudget(p), /driveway/);
  });
  it("dense hollow-kerb networks are bounded by the utility detail budget", () => {
    const p: Project = {
      version: 1,
      name: "Hollow budget",
      nodes: [],
      roads: [],
    };
    for (let i = 0; i < 20; i++) {
      const a = makeNode([0, 0, i * 20]),
        b = makeNode([300, 0, i * 20]);
      p.nodes.push(a, b);
      p.roads.push(
        makeRoad(a, b, "Hollow", { curbDrainType: "hollow", manholes: false }),
      );
    }
    assert.throws(() => validateGenerationBudget(p), /Utility detail budget/);
  });
});
