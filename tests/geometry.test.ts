import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeDemo,
  makeTemplate,
  makeNode,
  makeRoad,
  controlPoints,
  connected,
  parseProject,
  validateGenerationBudget,
  type Project,
} from "../src/core/model";
import { buildNetwork, edgePoint, type Network } from "../src/core/geometry";
import {
  detectCrossings,
  resolveCrossings,
  insertRoad,
  moveNode,
  splitRoad,
} from "../src/core/editing";
import { sampleAlignment } from "../src/core/curves";
import {
  cubic,
  distance,
  add,
  sub,
  polygonArea,
  type V3,
} from "../src/core/math";
import { exportOBJ } from "../src/core/export";
function checkMesh(n: Network) {
  for (const m of n.meshes) {
    assert(m.positions.every(Number.isFinite), m.name);
    assert(m.uvs.every(Number.isFinite));
    assert.equal(m.positions.length / 3, m.uvs.length / 2);
    assert.equal(m.indices.length % 3, 0);
    assert(
      m.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < m.positions.length / 3,
      ),
    );
  }
}
function checkSharedMouths(n: Network) {
  for (const joint of n.junctions) {
    const mesh = n.meshes.find(
      (m) => m.owner === joint.node.id && m.kind === "asphalt",
    )!;
    for (const arm of joint.arms)
      for (const point of [arm.center, arm.left, arm.right]) {
        let min = Infinity;
        for (let i = 0; i < mesh.positions.length; i += 3)
          min = Math.min(
            min,
            distance(point, mesh.positions.slice(i, i + 3) as V3),
          );
        assert(
          min < 1e-8,
          `${joint.node.name}: missing shared cross-section vertex`,
        );
      }
  }
}
function star(angles: number[], widths?: number[]): Project {
  const center = makeNode([0, 0, 0], "Shared pivot"),
    p: Project = {
      version: 1,
      name: "N-way fixture",
      nodes: [center],
      roads: [],
    };
  angles.forEach((angle, i) => {
    const a = (angle * Math.PI) / 180,
      end = makeNode([Math.cos(a) * 120, 0, Math.sin(a) * 120]);
    p.nodes.push(end);
    p.roads.push(
      makeRoad(center, end, `Arm ${i + 1}`, {
        lanes: widths?.[i] ?? 2,
        sidewalk: 2,
      }),
    );
  });
  return p;
}
function crossing(height = 0): Project {
  const a = makeNode([-60, 0, 0]),
    b = makeNode([60, 0, 0]),
    c = makeNode([0, height, -60]),
    d = makeNode([0, height, 60]);
  return {
    version: 1,
    name: "Crossing",
    nodes: [a, b, c, d],
    roads: [
      makeRoad(a, b, "Ground"),
      makeRoad(c, d, "Cross road", { bridge: height > 0 }),
    ],
  };
}
describe("templates and mesh invariants", () => {
  for (const template of ["district", "tee", "roundabout", "diamond"])
    it(`${template}: valid topology, finite indexed geometry and exact shared mouths`, () => {
      const p = makeTemplate(template),
        n = buildNetwork(p);
      assert.equal(n.diagnostics.length, 0, JSON.stringify(n.diagnostics));
      assert(n.triangles > 1000);
      checkMesh(n);
      checkSharedMouths(n);
      assert(n.junctions.every((j) => j.valid));
      assert.equal(detectCrossings(p).length, 0);
    });
  it("all generated asphalt top triangles point upward and are non-degenerate", () => {
    const n = buildNetwork(makeDemo());
    for (const mesh of n.meshes.filter((m) => m.kind === "asphalt")) {
      const p = mesh.positions;
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, b, c] = mesh.indices.slice(i, i + 3).map((i) => i * 3);
        const ny =
          (p[b + 2] - p[a + 2]) * (p[c] - p[a]) -
          (p[b] - p[a]) * (p[c + 2] - p[a + 2]);
        assert(ny > 1e-10, mesh.name);
      }
    }
  });
  it("junction triangulation covers each outline exactly without overlapping fans", () => {
    for (const p of [
      makeDemo(),
      makeTemplate("tee"),
      makeTemplate("diamond"),
      star([0, 45, 95, 180, 250]),
    ]) {
      const n = buildNetwork(p);
      for (const joint of n.junctions) {
        const mesh = n.meshes.find(
          (m) => m.owner === joint.node.id && m.kind === "asphalt",
        )!;
        let area = 0;
        for (let i = 0; i < mesh.indices.length; i += 3) {
          const points = mesh.indices
            .slice(i, i + 3)
            .map((k) => mesh.positions.slice(k * 3, k * 3 + 3) as V3);
          area += Math.abs(polygonArea(points));
        }
        assert(
          Math.abs(area - Math.abs(polygonArea(joint.boundary))) < 1e-5,
          `${joint.type}: overlapping triangulation`,
        );
      }
    }
  });
  for (const count of [3, 4, 5, 6, 8])
    it(`clean ${count}-way junction with a single shared node`, () => {
      const n = buildNetwork(
        star(Array.from({ length: count }, (_, i) => (i * 360) / count)),
      );
      assert.equal(n.junctions.length, 1);
      assert.equal(n.junctions[0].arms.length, count);
      assert.equal(n.diagnostics.length, 0);
      checkSharedMouths(n);
      checkMesh(n);
    });
  it("unequal lane counts stitch to the same junction cross-sections", () => {
    const n = buildNetwork(star([0, 80, 180, 265], [1, 2, 4, 3]));
    assert(n.junctions[0].valid);
    checkSharedMouths(n);
    checkMesh(n);
  });
  it("a canonical normal closes near-straight, degree-two joins", () => {
    const a = makeNode([-60, 0, 0]),
      m = makeNode([0, 0, 0]),
      b = makeNode([60, 0, 1]);
    const p: Project = {
      version: 1,
      name: "Straight join",
      nodes: [a, m, b],
      roads: [makeRoad(a, m), makeRoad(m, b)],
    };
    const n = buildNetwork(p);
    assert.equal(n.junctions.length, 0);
    const f = n.spans[0].frames.at(-1)!,
      g = n.spans[1].frames[0];
    for (const side of [-1, 1])
      for (const part of ["road", "outer", "bottom"] as const)
        assert(
          distance(edgePoint(f, side, part), edgePoint(g, side, part)) < 1e-9,
        );
  });
  it("tight curves clamp offsets instead of producing inverted parallel curves", () => {
    const a = makeNode([-6, 0, 0]),
      b = makeNode([6, 0, 0]);
    const p: Project = {
      version: 1,
      name: "Tight bend",
      nodes: [a, b],
      roads: [
        makeRoad(
          a,
          b,
          "Hairpin",
          { lanes: 4, sidewalk: 3 },
          [0, 0, 26],
          [0, 0, 26],
        ),
      ],
    };
    const n = buildNetwork(p);
    checkMesh(n);
    assert(n.diagnostics.some((d) => d.message.includes("tight-curve")));
    assert(n.spans[0].frames.some((f) => f.hw < 7));
  });
  it("self-crossing cubic loops are flagged instead of silently marked valid", () => {
    const a = makeNode([-20, 0, 0]),
      b = makeNode([20, 0, 0]);
    const p: Project = {
      version: 1,
      name: "Loop",
      nodes: [a, b],
      roads: [makeRoad(a, b, "Loop", {}, [120, 0, 80], [-120, 0, 80])],
    };
    const n = buildNetwork(p);
    checkMesh(n);
    assert(
      n.diagnostics.some(
        (d) => d.level === "error" && d.message.includes("self-crossing"),
      ),
    );
  });
  it("zero-length and short approaches are reported, never silently validated", () => {
    const a = makeNode([0, 0, 0]),
      b = makeNode([0, 0, 0]);
    const n = buildNetwork({
      version: 1,
      name: "Degenerate",
      nodes: [a, b],
      roads: [makeRoad(a, b)],
    });
    assert(n.diagnostics.some((d) => d.level === "error"));
    checkMesh(n);
  });
});
describe("graph editing and automatic intersections", () => {
  it("at-grade crossings split both cubics into one shared four-way joint", () => {
    const p = crossing();
    assert.equal(detectCrossings(p).length, 1);
    assert.equal(resolveCrossings(p), 1);
    assert.equal(p.roads.length, 4);
    const center = p.nodes.find((n) => connected(p, n.id).length === 4)!;
    assert(center);
    assert(distance(center.position, [0, 0, 0]) < 1e-9);
    const n = buildNetwork(p);
    assert.equal(n.junctions.length, 1);
    assert.equal(n.diagnostics.length, 0);
    checkSharedMouths(n);
    assert.equal(resolveCrossings(p), 0);
  });
  it("height-separated crossings remain overpasses, not false junctions", () => {
    const p = crossing(7),
      before = JSON.stringify(p);
    assert.equal(resolveCrossings(p), 0);
    assert.equal(JSON.stringify(p), before);
    const n = buildNetwork(p);
    assert.equal(n.junctions.length, 0);
    assert.equal(n.clearances.length, 1);
    assert(n.clearances[0].meters > 4.5);
  });
  it("insufficient headroom is explicitly flagged", () => {
    const n = buildNetwork(crossing(3));
    assert(n.diagnostics.some((d) => d.message.includes("clearance")));
  });
  it("node-on-curve snapping generates a T-joint", () => {
    const a = makeNode([-50, 0, 0]),
      b = makeNode([50, 0, 0]);
    const p: Project = {
      version: 1,
      name: "T touch",
      nodes: [a, b],
      roads: [makeRoad(a, b)],
    };
    assert(insertRoad(p, [0, 0, 0], [0, 0, 60]));
    assert.equal(p.roads.length, 3);
    assert.equal(buildNetwork(p).junctions[0].type, "3-way");
    assert.equal(detectCrossings(p).length, 0);
  });
  it("multiple crossings on a single cubic are sorted and all connected", () => {
    const p = crossing();
    for (const x of [-30, 30]) {
      const a = makeNode([x, 0, -60]),
        b = makeNode([x, 0, 60]);
      p.nodes.push(a, b);
      p.roads.push(makeRoad(a, b));
    }
    resolveCrossings(p);
    assert.equal(p.roads.length, 10);
    assert.equal(buildNetwork(p).junctions.length, 3);
    assert.equal(detectCrossings(p).length, 0);
    checkSharedMouths(buildNetwork(p));
  });
  it("de Casteljau splitting preserves the original cubic exactly", () => {
    const a = makeNode([-70, 0, -15]),
      b = makeNode([70, 0, 20]);
    const road = makeRoad(a, b, "Curve", {}, [30, 0, -40], [-30, 0, 40]),
      p: Project = {
        version: 1,
        name: "Curve split",
        nodes: [a, b],
        roads: [road],
      },
      curve = controlPoints(p, road),
      cut = 0.43;
    splitRoad(p, road.id, cut);
    for (let i = 0; i <= 40; i++) {
      const t = i / 40,
        segment = t < cut ? p.roads[0] : p.roads[1],
        local = t < cut ? t / cut : (t - cut) / (1 - cut);
      assert(
        distance(cubic(curve, t), cubic(controlPoints(p, segment), local)) <
          1e-8,
      );
    }
  });
  it("moving the one shared pivot moves its attached handles and all mouths", () => {
    const p = makeDemo(),
      node = p.nodes.find((n) => n.id === "j01")!,
      delta: V3 = [8, 1.5, -4],
      attached = connected(p, node.id);
    const originals = attached.map((r) => ({ r, curve: controlPoints(p, r) }));
    moveNode(p, node.id, add(node.position, delta));
    for (const { r, curve } of originals) {
      const next = controlPoints(p, r),
        indices = r.start === node.id ? [0, 1] : [2, 3];
      for (const i of indices)
        assert(distance(next[i], add(curve[i], delta)) < 1e-9);
    }
    checkSharedMouths(buildNetwork(p));
  });
  it("invalid short insertion is atomic and leaves no orphan nodes", () => {
    const p = makeDemo(),
      before = JSON.stringify(p);
    assert.equal(insertRoad(p, [200, 0, 200], [200.1, 0, 200.1]), null);
    assert.equal(JSON.stringify(p), before);
  });
  it("diamond interchange has connected ramps, moderate grades and real clearance", () => {
    const p = makeTemplate("diamond"),
      n = buildNetwork(p);
    assert.equal(n.junctions.length, 4);
    assert.equal(n.clearances.length, 1);
    assert(n.clearances[0].meters >= 5.7);
    assert(n.maxGrade < 8);
    const seen = new Set([p.nodes[0].id]);
    for (let i = 0; i < p.nodes.length; i++)
      for (const r of p.roads)
        if (seen.has(r.start) || seen.has(r.end)) {
          seen.add(r.start);
          seen.add(r.end);
        }
    assert.equal(seen.size, p.nodes.length);
  });
});
describe("details, persistence and export", () => {
  it("guardrails, paving, bridge supports and grates are actual mesh groups", () => {
    const n = buildNetwork(makeDemo());
    for (const kind of [
      "rail",
      "paving",
      "structure",
      "drain",
      "gutter",
      "marking",
    ])
      assert(
        n.meshes.some((m) => m.kind === kind),
        kind,
      );
    assert(n.inlets > 40);
    const bridge = n.meshes.filter((m) => m.owner === "r09");
    assert(bridge.some((m) => m.material === "concrete"));
    assert(bridge.some((m) => m.material === "steel"));
  });
  it("all paving patterns, bridge types and rail parameters regenerate valid meshes", () => {
    for (const pattern of [
      "herringbone",
      "running",
      "basket",
      "slabs",
    ] as const) {
      const p = makeDemo();
      p.roads[0].pattern = pattern;
      p.roads[0].guardrails = true;
      p.roads[0].railHeight = 1.2;
      p.roads[0].postSpacing = 2;
      const n = buildNetwork(p);
      assert(n.meshes.some((m) => m.material === `paving-${pattern}`));
      checkMesh(n);
    }
    const p = makeTemplate("diamond");
    p.roads.find((r) => r.bridge)!.structure = "concrete";
    checkMesh(buildNetwork(p));
  });
  it("barriers stitch around guarded junction corners without crossing the open mouths", () => {
    const p = makeTemplate("diamond"),
      n = buildNetwork(p);
    for (const joint of n.junctions) {
      const rails = n.meshes.find(
        (m) => m.owner === joint.node.id && m.kind === "rail",
      );
      assert(rails && rails.indices.length > 0);
    }
    checkMesh(n);
    checkSharedMouths(n);
  });
  it("turning drainage and markings off removes their mesh groups", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r) => {
      r.drainage = false;
      r.markings = false;
    });
    p.nodes.forEach((n) => (n.crossings = false));
    const n = buildNetwork(p);
    assert.equal(n.inlets, 0);
    assert(
      !n.meshes.some((m) => ["drain", "gutter", "marking"].includes(m.kind)),
    );
  });
  it("project JSON round-trips, with bounds and reference validation", () => {
    const p = makeDemo();
    assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
    const broken = JSON.parse(JSON.stringify(p));
    broken.roads[0].start = "missing";
    assert.throws(() => parseProject(broken), /missing/);
    broken.roads[0].start = p.roads[0].start;
    broken.nodes[0].position[0] = Infinity;
    assert.throws(() => parseProject(broken), /coordinates/);
    assert.throws(
      () => parseProject({ version: 5, nodes: [], roads: [] }),
      /Unsupported/,
    );
  });
  it("unreasonably large imported or edited tiles fail before allocating meshes", () => {
    const p = makeDemo();
    p.nodes[0].position = [90000, 0, 0];
    assert.throws(() => validateGenerationBudget(p), /5 km/);
    assert.throws(() => buildNetwork(p), /5 km/);
    assert.throws(() => parseProject(JSON.parse(JSON.stringify(p))), /5 km/);
  });
  it("OBJ export includes correct indexed geometry, UVs, normals and MTL materials", () => {
    const n = buildNetwork(makeTemplate("tee")),
      { obj, mtl } = exportOBJ(n, "test-network");
    assert(obj.includes("mtllib test-network.mtl"));
    assert(!obj.includes("NaN"));
    assert.equal(
      obj.split("\n").filter((s) => s.startsWith("f ")).length,
      n.triangles,
    );
    assert.equal(
      obj.split("\n").filter((s) => s.startsWith("v ")).length,
      n.vertices,
    );
    assert(mtl.includes("newmtl asphalt"));
    assert(mtl.includes("newmtl paving-ashlar"));
  });
  it("empty networks can be edited and exported without infinities", () => {
    const n = buildNetwork({ version: 1, name: "Empty", nodes: [], roads: [] });
    assert.equal(n.triangles, 0);
    assert(n.bounds.min.every(Number.isFinite));
    assert(n.bounds.max.every(Number.isFinite));
    assert.equal(exportOBJ(n).obj.split("\n").length, 2);
  });
});
