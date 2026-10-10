import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  type Project,
} from "../src/core/model";
import { buildNetwork, MeshBuilder, type MeshData } from "../src/core/geometry";
import {
  SupportSurfaceIndex,
  supportOutline,
} from "../src/core/support-surfaces";
import { supportIsClear, bridgeDepthAt } from "../src/core/bridges";
import { sampleAlignment } from "../src/core/curves";
import { makeSite, sitePoint } from "../src/core/sites";
import { buildSiteGeometry } from "../src/core/site-geometry";
import { buildTrafficSignals, meshSurfaceY } from "../src/core/road-details";
import { exportMeshManifest } from "../src/core/export";
import { add, mul, sub, dotXZ, distanceXZ, type V3 } from "../src/core/math";

function bridgeLine(): Project {
  const a = makeNode([-160, 8, 0]),
    z = makeNode([160, 8, 0]);
  return {
    version: 1,
    name: "Support polish",
    nodes: [a, z],
    roads: [
      makeRoad(a, z, "Raised deck", {
        bridge: true,
        structure: "steel",
        bridgeDepth: 1.25,
        pierSpacing: 32,
        sidewalk: 0.8,
        drainage: false,
        manholes: false,
      }),
    ],
  };
}
const verts = (m: MeshData) =>
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

describe("actual support surface exclusion", () => {
  it("height-clips sloped triangles before projection, not by their whole bounding box", () => {
    const b = new MeshBuilder("slope", "road");
    b.append(
      "asphalt",
      "asphalt",
      [
        [0, 0, 0],
        [20, 20, 0],
        [0, 0, 20],
      ],
      [0, 1, 2],
      true,
    );
    const index = new SupportSurfaceIndex(b.output());
    assert(
      index.clear({
        outline: supportOutline([17, 0, 0.3], [1, 0, 0], [0, 0, 1], 1, 1, 0),
        minY: -0.4,
        maxY: 5,
      }),
    );
    assert(
      !index.clear({
        outline: supportOutline([2, 0, 2], [1, 0, 0], [0, 0, 1], 1, 1, 0),
        minY: -0.4,
        maxY: 5,
      }),
    );
  });
  it("uses positive-area contact and ignores truly vertical faces", () => {
    const b = new MeshBuilder("edge", "site");
    b.quad(
      "paving",
      "paving-slate",
      [
        [0, 0, 0],
        [4, 0, 0],
        [4, 0, 4],
        [0, 0, 4],
      ],
      true,
    );
    b.quad("paving", "paving-slate", [
      [10, 0, 0],
      [10, 4, 0],
      [10, 4, 4],
      [10, 0, 4],
    ]);
    const index = new SupportSurfaceIndex(b.output());
    assert.equal(index.triangleCount, 2);
    assert(
      index.clear({
        outline: supportOutline([5, 0, 2], [1, 0, 0], [0, 0, 1], 2, 2, 0),
        minY: -1,
        maxY: 2,
      }),
    );
    assert(
      !index.clear({
        outline: supportOutline([4.9, 0, 2], [1, 0, 0], [0, 0, 1], 2, 2, 0),
        minY: -1,
        maxY: 2,
      }),
    );
  });
  it("spatial regions preserve collision answers while omitting irrelevant distant surfaces", () => {
    const b = new MeshBuilder("regions", "site");
    for (const x of [0, 500])
      b.quad(
        "paving",
        "paving-slate",
        [
          [x, 0, 0],
          [x + 4, 0, 0],
          [x + 4, 0, 4],
          [x, 0, 4],
        ],
        true,
      );
    const all = new SupportSurfaceIndex(b.output()),
      local = new SupportSurfaceIndex(b.output(), [
        { minX: -5, maxX: 10, minZ: -5, maxZ: 10, maxY: 2 },
      ]);
    assert.equal(all.triangleCount, 4);
    assert.equal(local.triangleCount, 2);
    for (const x of [-3, 0, 3, 6]) {
      const envelope = {
        outline: supportOutline([x, 0, 2], [1, 0, 0], [0, 0, 1], 1, 1),
        minY: -0.4,
        maxY: 2,
      };
      assert.equal(local.clear(envelope), all.clear(envelope));
    }
  });
  it("the actual open block band blocks supports, while its gateway and open courtyard do not", () => {
    const site = makeSite("urban-block", [0, 0, 0]);
    Object.assign(site, {
      width: 60,
      depth: 60,
      blockBand: 4,
      blockEntryWidth: 10,
      blockEntrySide: "north",
      blockInterior: "open",
      yaw: 23,
    });
    const index = new SupportSurfaceIndex(buildSiteGeometry(site)),
      a = (site.yaw * Math.PI) / 180,
      normal: V3 = [Math.cos(a), 0, Math.sin(a)],
      direction: V3 = [-Math.sin(a), 0, Math.cos(a)],
      clear = (x: number, z: number) =>
        index.clear({
          outline: supportOutline(
            sitePoint(site, x, z),
            normal,
            direction,
            3,
            2.7,
          ),
          minY: -0.4,
          maxY: 7,
        });
    assert(clear(0, 0));
    assert(clear(0, -29));
    assert(!clear(13, -29));
    assert(!clear(29, 0));
  });
  it("parking below a bridge removes a conflicting central footing without removing the parking surface", () => {
    const p = bridgeLine(),
      site = makeSite("parking", [0, 0, 0]);
    site.width = 44;
    site.depth = 36;
    p.sites = [site];
    const n = buildNetwork(p),
      bridge = n.bridges.find((b) => b.owner === p.roads[0].id)!;
    assert(bridge.excludedSupports.some((p) => Math.abs(p[0]) < 0.01));
    assert(bridge.supports.every((s) => Math.abs(s.position[0]) > 23));
    assert(n.meshes.some((m) => m.owner === site.id && m.kind === "parking"));
    assert.deepEqual(n.diagnostics, []);
    finite(n.meshes);
  });
  it("rounded crossroads paving catches a collision missed by road-centreline distance alone", () => {
    const c = makeNode([0, 0, 0]);
    c.radius = 20;
    c.crossings = false;
    const p: Project = {
      version: 1,
      name: "Wide lower junction",
      nodes: [c],
      roads: [],
    };
    for (const [x, z] of [
      [100, 0],
      [-100, 0],
      [0, 100],
      [0, -100],
    ]) {
      const end = makeNode([x, 0, z]);
      p.nodes.push(end);
      p.roads.push(
        makeRoad(c, end, "Lower arm", {
          sidewalk: 1,
          drainage: false,
          manholes: false,
        }),
      );
    }
    const n = buildNetwork(p),
      point: V3 = [9, 8, 9],
      alignments = p.roads.map((r) => sampleAlignment(p, r));
    assert(supportIsClear(point, "upper", alignments));
    const junction = n.junctions[0],
      asphalt = n.meshes.find((m) => m.owner === c.id && m.kind === "asphalt")!;
    assert(meshSurfaceY(asphalt, point) !== undefined);
    assert(
      !supportIsClear(
        point,
        "upper",
        alignments,
        2.5,
        new SupportSurfaceIndex(n.meshes),
      ),
    );
  });
  it("footings follow their actual rotation rather than a world-axis centre-point check", () => {
    const b = new MeshBuilder("thin", "site");
    b.quad(
      "paving",
      "paving-slate",
      [
        [1.8, 0, -0.2],
        [2.2, 0, -0.2],
        [2.2, 0, 0.2],
        [1.8, 0, 0.2],
      ],
      true,
    );
    const index = new SupportSurfaceIndex(b.output()),
      normal: V3 = [Math.SQRT1_2, 0, Math.SQRT1_2],
      direction: V3 = [-Math.SQRT1_2, 0, Math.SQRT1_2];
    assert(
      !index.clear({
        outline: supportOutline([0, 0, 0], normal, direction, 3, 2.7),
        minY: -0.4,
        maxY: 7,
      }),
    );
    assert(
      index.clear({
        outline: supportOutline([0, 0, 0], [1, 0, 0], [0, 0, 1], 3, 2.7),
        minY: -0.4,
        maxY: 7,
      }),
    );
  });
});

describe("mixed bridge member transitions", () => {
  for (const mixed of [false, true])
    it(`${mixed ? "concrete/steel" : "steel/steel"} depth change creates a connected section transition even on a straight two-arm join`, () => {
      const p = bridgeLine(),
        c = makeNode([0, 8, 0]);
      c.crossings = false;
      c.radius = 3;
      p.nodes.push(c);
      p.roads = [
        makeRoad(p.nodes[0], c, "Shallow member", {
          bridge: true,
          structure: mixed ? "concrete" : "steel",
          bridgeDepth: 1.05,
          sidewalk: 0.8,
          drainage: false,
          manholes: false,
        }),
        makeRoad(c, p.nodes[1], "Deep member", {
          bridge: true,
          structure: "steel",
          bridgeDepth: 1.8,
          sidewalk: 0.8,
          drainage: false,
          manholes: false,
        }),
      ];
      const n = buildNetwork(p),
        joint = n.junctions.find((j) => j.node.id === c.id)!,
        feature = n.bridges.find((b) => b.owner === c.id)!;
      assert(joint);
      assert.equal(feature.kind, "joint");
      assert.equal(feature.members?.length, 2);
      assert.deepEqual(n.diagnostics, []);
      finite(n.meshes);
      for (const member of feature.members!) {
        const arm = joint.arms.find((a) => a.road.id === member.road)!,
          material = member.material === "steel" ? "girder" : "concrete",
          mesh = n.meshes.find(
            (m) => m.owner === c.id && m.material === material,
          )!;
        assert.equal(member.mouthDepth, arm.road.bridgeDepth);
        assert.equal(member.jointDepth, 1.8);
        // Both outer faces of the member pin to the original mouth's underside.
        const ends = verts(mesh).filter(
          (p) =>
            distanceXZ(p, arm.frame.p) < arm.frame.hw &&
            Math.abs(dotXZ(sub(p, arm.frame.p), arm.d)) < 1e-7,
        );
        assert(
          ends.some(
            (p) =>
              Math.abs(p[1] - (arm.frame.p[1] - arm.road.bridgeDepth)) < 1e-7,
          ),
        );
        assert(
          mesh.positions.some(
            (_, i) => i % 3 === 1 && Math.abs(mesh.positions[i] - 6.2) < 1e-7,
          ),
        );
      }
      const manifest = exportMeshManifest(n, p);
      assert.deepEqual(
        manifest.bridges.find((b) => b.owner === c.id)!.members,
        feature.members,
      );
    });
});

describe("transition clearance uses the actual tapered depth", () => {
  it("a lower road beneath the shallow member's joint throat is not reported using its original depth", () => {
    const p = bridgeLine(),
      c = makeNode([0, 8, 0]);
    c.radius = 3;
    c.crossings = false;
    p.nodes.push(c);
    p.roads = [
      makeRoad(p.nodes[0], c, "Shallow", {
        bridge: true,
        structure: "concrete",
        bridgeDepth: 1.05,
        sidewalk: 0.8,
        drainage: false,
        manholes: false,
      }),
      makeRoad(c, p.nodes[1], "Deep", {
        bridge: true,
        structure: "steel",
        bridgeDepth: 1.8,
        sidewalk: 0.8,
        drainage: false,
        manholes: false,
      }),
    ];
    const a = makeNode([-2, 0, -100]),
      z = makeNode([-2, 0, 100]);
    p.nodes.push(a, z);
    p.roads.push(
      makeRoad(a, z, "Below joint", {
        sidewalk: 1,
        drainage: false,
        manholes: false,
      }),
    );
    const n = buildNetwork(p),
      span = n.spans.find((s) => s.road.name === "Shallow")!,
      depth = bridgeDepthAt(span, 158, n.bridges);
    assert(depth > 1.5 && depth < 1.8);
    assert.equal(n.clearances.length, 1);
    assert(Math.abs(n.clearances[0].meters - (8 - depth - 0.12)) < 1e-5);
    assert(n.clearances[0].meters < 6.4);
    assert.deepEqual(n.diagnostics, []);
  });
});

describe("incoming-only traffic signals and handed pole placement", () => {
  for (const side of ["right", "left"] as const)
    it(`${side} driving mirrors signal poles and mast arms onto the incoming kerb side`, () => {
      const p = makeTemplate("tee");
      p.roads.forEach((r) => {
        r.trafficSide = side;
        r.oneWay = true;
        r.drainage = false;
        r.manholes = false;
      });
      const n = buildNetwork(p),
        j = n.junctions[0],
        b = new MeshBuilder(j.node.id, "node");
      buildTrafficSignals(b, { ...j.node, signals: true }, j.arms);
      const meshes = b.output(),
        pole = meshes.find((m) => m.material === "pole")!,
        points = verts(pole);
      const incoming = j.arms.filter((a) => !a.road.oneWay || !a.isStart);
      assert.equal(incoming.length, 1);
      assert.equal(
        meshes
          .filter((m) => m.material.startsWith("signal-"))
          .reduce((sum, m) => sum + m.indices.length / 3, 0),
        48,
      );
      const a = incoming[0],
        origin = add(
          side === "left" ? a.outerLeft : a.outerRight,
          mul(a.d, 3.8),
        );
      assert(points.some((p) => distanceXZ(p, origin) < 0.09));
      const armDirection = side === "left" ? mul(a.n, -1) : a.n;
      assert(
        points.some(
          (p) => Math.abs(dotXZ(sub(p, origin), armDirection) - 2.5) < 0.2,
        ),
      );
      finite(meshes);
    });
  it("purely outgoing one-way approaches do not receive a signal head", () => {
    const p = makeTemplate("tee");
    p.roads.forEach((r) => {
      r.oneWay = true;
      const c = p.nodes[0];
      if (r.end === c.id) {
        [r.start, r.end] = [r.end, r.start];
        [r.h1, r.h2] = [r.h2, r.h1];
      }
    });
    const n = buildNetwork(p),
      j = n.junctions[0],
      b = new MeshBuilder(j.node.id, "node");
    buildTrafficSignals(b, { ...j.node, signals: true }, j.arms);
    assert.equal(b.output().length, 0);
  });
});
