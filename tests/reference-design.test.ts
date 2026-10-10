import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  parseProject,
  controlPoints,
  roadHalfWidth,
  baseRoadHalfWidth,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import {
  buildNetwork,
  edgePoint,
  sideHalfWidth,
  frameAt,
  type Network,
  type MeshData,
} from "../src/core/geometry";
import {
  curveDesignMetrics,
  referenceLayout,
  designSources,
} from "../src/core/design-controls";
import { auxiliaryWidthAt } from "../src/core/road-sections";
import { bridgeAt } from "../src/core/bridge-profile";
import { insertConnectedBridge } from "../src/core/bridge-insertion";
import { detectCrossings } from "../src/core/editing";
import { exportMeshManifest, exportOBJ } from "../src/core/export";
import { distanceXZ, dotXZ, sub, type V3 } from "../src/core/math";

const cache = new Map<string, { p: Project; n: Network }>();
function template(id: string) {
  if (!cache.has(id)) {
    const p = makeTemplate(id);
    cache.set(id, { p, n: buildNetwork(p) });
  }
  return cache.get(id)!;
}
function fixture(settings: Partial<RoadSettings> = {}, length = 400): Project {
  const a = makeNode([-length / 2, 0, 0]),
    z = makeNode([length / 2, 0, 0]);
  return {
    version: 1,
    name: "Metric design fixture",
    nodes: [a, z],
    roads: [
      makeRoad(a, z, "Design road", {
        oneWay: true,
        lanes: 2,
        laneWidth: 3.65,
        shoulderWidth: 2,
        sidewalk: 0,
        curbStyle: "flush",
        markingStyle: "motorway",
        roadClass: "mainline",
        drainage: false,
        manholes: false,
        signs: false,
        ...settings,
      }),
    ],
  };
}
const close = (a: number, b: number, epsilon = 1e-7) =>
  assert(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const vertices = (m: MeshData) =>
  Array.from(
    { length: m.positions.length / 3 },
    (_, i) => m.positions.slice(i * 3, i * 3 + 3) as V3,
  );
function finite(n: Network) {
  for (const m of n.meshes) {
    assert(m.positions.every(Number.isFinite));
    assert(m.uvs.every(Number.isFinite));
    assert(m.indices.every((i) => i >= 0 && i < m.positions.length / 3));
  }
}

describe("published-reference interchange geometry", () => {
  it("the reference basis identifies actual published schematics and explicit metric choices", () => {
    assert(
      designSources.some(
        (s) => s.id === "modot" && s.url.endsWith("Alignment_Controls.pdf"),
      ),
    );
    assert(
      designSources.some(
        (s) => s.id === "caltrans" && s.sections.includes("504.3"),
      ),
    );
    assert(designSources.some((s) => s.id === "bridge-handbook"));
    assert.equal(referenceLayout.diamondTerminalSpacing, 260);
    assert.equal(referenceLayout.loopRadius, 120);
    assert.equal(referenceLayout.clearance, 5.2);
  });
  it("analytic endpoint curvature catches the old 18 m connection instead of accepting sparse preview frames", () => {
    const old = curveDesignMetrics([
      [50, 0, 7],
      [80, 0, 20],
      [86, 0, 65],
      [110, 0, 65],
    ]);
    assert(old.minimumRadius! > 17.7 && old.minimumRadius! < 18);
    const straight = curveDesignMetrics([
      [0, 0, 0],
      [100, 1, 0],
      [200, 2, 0],
      [300, 3, 0],
    ]);
    assert.equal(straight.minimumRadius, null);
    close(straight.maximumGrade, 1);
    close(straight.planLength, 300);
  });
  for (const id of ["diamond", "cloverleaf", "trumpet", "city"])
    it(`${id}: reference-classified cubic radii, widths, grades and true structural clearances meet the selected geometry targets`, () => {
      const { p, n } = template(id);
      assert(n.designReview.roads.length > 0);
      assert(n.designReview.roads.every((r) => r.meetsReference));
      assert(n.designReview.withinSelectedTargets);
      assert(n.maxGrade <= 4.05);
      assert(n.clearances.every((c) => c.meters >= referenceLayout.clearance));
      assert.deepEqual(n.diagnostics, []);
      assert.equal(detectCrossings(p).length, 0);
      finite(n);
      assert(!n.meshes.some((m) => ["building", "landscape"].includes(m.kind)));
    });
  it("a conventional diamond has 260 m terminals, perpendicular minor-road approaches and 24 m corner controls", () => {
    const { p, n } = template("diamond"),
      terminals = p.nodes.filter((n) => n.name.includes("ramp terminals"));
    assert.equal(terminals.length, 2);
    close(distanceXZ(terminals[0].position, terminals[1].position), 260);
    for (const node of terminals) {
      assert(node.signals);
      assert.equal(node.radius, 24);
    }
    for (const r of p.roads.filter((r) => r.name.includes("connected descent")))
      assert.equal(r.h2[0], 0);
    for (const r of p.roads.filter((r) => r.name.includes("connected ascent")))
      assert.equal(r.h1[0], 0);
    assert.equal(n.auxiliaryLanes.length, 4);
    assert(n.auxiliaryLanes.every((a) => !a.fitted));
  });
  it("the cloverleaf puts all four 270-degree loops on separate collector-distributor roads with measured nose spacing", () => {
    const { p, n } = template("cloverleaf"),
      loops = p.roads.filter((r) => r.roadClass === "loop");
    assert.equal(loops.length, 12);
    assert.equal(n.designReview.weaves.length, 4);
    assert(loops.every((r) => r.speedLimit === 50 && r.laneWidth === 4.9));
    assert(
      Math.min(
        ...n.designReview.roads
          .filter((r) => r.role === "loop")
          .map((r) => r.minimumRadius!),
      ) > 112,
    );
    assert(p.roads.filter((r) => r.roadClass === "collector").length >= 28);
    for (const w of n.designReview.weaves) {
      close(w.nodeSpacing, 304);
      assert(w.noseSpacing > 410 && w.noseSpacing < 412);
      assert(w.owners.length === 3);
    }
    assert.equal(n.auxiliaryLanes.length, 8);
  });
  it("the full metric cloverleaf also generates in production within the expanded, bounded tile budget", () => {
    const { p, n } = template("cloverleaf"),
      dense = buildNetwork(p, { detail: "production" });
    assert.deepEqual(dense.diagnostics, []);
    assert(dense.triangles > n.triangles);
    assert.equal(dense.designReview.bridgeLength, 384);
    assert(dense.designReview.withinSelectedTargets);
    assert.equal(dense.auxiliaryLanes.length, 8);
    finite(dense);
  });
  it("the trumpet is genuinely a single 270-degree loop with two direct links and one semi-direct movement", () => {
    const { p, n } = template("trumpet");
    assert.equal(p.roads.filter((r) => r.roadClass === "loop").length, 3);
    assert.equal(
      p.roads.filter((r) => r.name.includes("direct right-turn connector"))
        .length,
      2,
    );
    assert.equal(
      p.roads.filter((r) => r.name.includes("semi-direct ·")).length,
      3,
    );
    assert.equal(n.bridges.length, 2);
    assert.equal(n.auxiliaryLanes.length, 4);
    assert(p.name.includes("one loop"));
  });
  for (const [id, count, length] of [
    ["diamond", 2, 48],
    ["cloverleaf", 4, 96],
    ["trumpet", 2, 84],
  ] as const)
    it(`${id}: only short bounded overpasses are structural; approaches have closed earth support and real bearing abutments`, () => {
      const { p, n } = template(id);
      assert.equal(n.bridges.length, count);
      close(n.designReview.bridgeLength, count * length, 1e-4);
      assert(
        n.embankments.some((e) => e.kind === "approach-fill" && e.slope === 2),
      );
      assert(n.embankments.every((e) => !e.containsVegetation));
      for (const b of n.bridges) {
        close(distanceXZ(b.start, b.end), length);
        assert.equal(b.abutments?.length, 2);
        assert(b.girderCount! >= 3);
        assert(b.girderSpacing! <= 2.8 + 1e-7);
        assert(b.spanLengths!.every((l) => l > 0));
        close(
          b.spanLengths!.reduce((s, l) => s + l, 0),
          length,
          1e-4,
        );
        assert(Math.max(...b.spanLengths!) / (b.depth + 0.12) < 30);
        const surface = p.roads.find((r) => r.id === b.owner)!;
        assert.equal(surface.bridgeDepth, 1.6);
        assert(
          n.meshes.some(
            (m) => m.owner === surface.id && m.material === "girder",
          ),
        );
      }
    });
});

describe("physical one-sided speed-change lanes", () => {
  for (const trafficSide of ["right", "left"] as const)
    for (const mode of ["entry", "exit"] as const)
      it(`${trafficSide} / ${mode}: only the traffic-side edge gains a real extra lane and taper, without narrowing through lanes or shoulders`, () => {
        const p = fixture({
            trafficSide,
            auxiliaryLane: mode,
            auxiliaryLength: 200,
            auxiliaryTaper: 90,
          }),
          r = p.roads[0],
          n = buildNetwork(p),
          span = n.spans[0],
          side = trafficSide === "right" ? 1 : -1;
        close(baseRoadHalfWidth(r), 5.65);
        close(roadHalfWidth(r), 9.3);
        assert.equal(n.auxiliaryLanes.length, 1);
        assert(!n.auxiliaryLanes[0].fitted);
        assert.equal(n.auxiliaryLanes[0].side, side);
        for (const f of span.frames) {
          close(sideHalfWidth(f, -side), 5.65);
          close(
            sideHalfWidth(f, side) - sideHalfWidth(f, -side),
            auxiliaryWidthAt(r, f.s, span.alignment.length),
          );
          const edge = edgePoint(f, side, "road");
          close(dotXZ(sub(edge, f.p), f.n) * side, sideHalfWidth(f, side));
        }
        const asphalt = n.meshes.find((m) => m.kind === "asphalt")!,
          zs = vertices(asphalt).map((v) => v[2]);
        close(side === 1 ? Math.max(...zs) : -Math.min(...zs), 9.3);
        close(side === 1 ? -Math.min(...zs) : Math.max(...zs), 5.65);
        assert(n.meshes.some((m) => m.kind === "marking"));
        assert.equal(r.lanes, 2);
        assert.equal(r.laneWidth, 3.65);
        assert.equal(r.shoulderWidth, 2);
        assert.deepEqual(n.diagnostics, []);
        finite(n);
      });
  it("a user-enabled auxiliary lane on a bridge keeps all girders and shifted bearing/headstock geometry inside the actual asymmetric deck", () => {
    const p = fixture({
      bridge: true,
      auxiliaryLane: "entry",
      auxiliaryLength: 200,
      auxiliaryTaper: 90,
      structure: "steel",
      bridgeDepth: 1.6,
    });
    p.nodes.forEach((n) => (n.position[1] = 8));
    const n = buildNetwork(p),
      span = n.spans[0],
      b = n.bridges[0],
      g = n.meshes.find((m) => m.material === "girder")!;
    assert.equal(b.girderCount, 6);
    for (const v of vertices(g)) {
      const f = frameAt(span, v[0] + 200);
      assert(
        v[2] >= -sideHalfWidth(f, -1) - 1e-7 &&
          v[2] <= sideHalfWidth(f, 1) + 1e-7,
      );
    }
    assert(b.supports.some((p) => p.position[2] > 1));
    finite(n);
  });
  it("a shortened requested zone is reported, not silently presented as the full reference length", () => {
    const n = buildNetwork(
      fixture(
        { auxiliaryLane: "exit", auxiliaryLength: 150, auxiliaryTaper: 90 },
        100,
      ),
    );
    assert(n.auxiliaryLanes[0].fitted);
    close(
      n.auxiliaryLanes[0].fullWidthLength + n.auxiliaryLanes[0].taperLength,
      100,
    );
    assert(
      n.diagnostics.some((d) =>
        d.message.includes("speed-change lane/taper shortened"),
      ),
    );
    finite(n);
  });
  it("unsupported two-way/cycle/parked profiles never receive an extra highway lane on top of another use", () => {
    for (const settings of [
      { oneWay: false },
      { cycleMode: "protected" },
      { parking: "parallel" },
    ] as Partial<RoadSettings>[]) {
      const n = buildNetwork(fixture({ auxiliaryLane: "exit", ...settings }));
      assert.deepEqual(n.auxiliaryLanes, []);
      assert(n.spans[0].frames.every((f) => !f.auxWidth));
    }
  });
  it("highway shoulders have no raised urban curbs or pedestrian paving in merge throats", () => {
    const { n } = template("cloverleaf");
    for (const s of n.spans) {
      assert(
        s.frames.every((f) => f.cw === 0 && f.sw === 0 && f.curbHeight === 0),
      );
    }
    assert(!n.meshes.some((m) => m.kind === "paving" || m.kind === "curb"));
  });
});

describe("bounded bridge structure and editable/exported design data", () => {
  it("structure bounds clip girders and supports, keep exact boundary stations and leave two filled approaches", () => {
    const p = fixture(
      {
        bridge: true,
        embankment: true,
        bridgeFrom: 0.35,
        bridgeTo: 0.65,
        bridgeDepth: 1.6,
        structure: "steel",
      },
      240,
    );
    p.nodes.forEach((n) => (n.position[1] = 7.2));
    const n = buildNetwork(p),
      b = n.bridges[0],
      span = n.spans[0];
    close(b.start[0], -36);
    close(b.end[0], 36);
    close(n.designReview.bridgeLength, 72);
    assert(span.frames.some((f) => Math.abs(f.t - 0.35) < 1e-7));
    assert(span.frames.some((f) => Math.abs(f.t - 0.65) < 1e-7));
    assert.equal(b.abutments?.length, 2);
    assert.equal(
      n.embankments.filter((e) => e.kind === "approach-fill").length,
      2,
    );
    const girders = n.meshes.find((m) => m.material === "girder")!;
    assert(
      vertices(girders).every((v) => v[0] >= -36 - 1e-7 && v[0] <= 36 + 1e-7),
    );
    const fill = n.meshes.find((m) => m.material === "soil")!;
    assert(
      vertices(fill).every((v) => v[0] <= -36 + 1e-6 || v[0] >= 36 - 1e-6),
    );
    finite(n);
  });
  it("clearance uses girder depth only inside the structural interval, not the entire flagged road", () => {
    const p = fixture(
      { bridge: true, bridgeFrom: 0.45, bridgeTo: 0.55, bridgeDepth: 1.6 },
      1200,
    );
    p.nodes.forEach((n) => (n.position[1] = 7.2));
    for (const x of [0, 300]) {
      const a = makeNode([x, 0, -100]),
        z = makeNode([x, 0, 100]);
      p.nodes.push(a, z);
      p.roads.push(
        makeRoad(a, z, `Lower road ${x}`, { drainage: false, manholes: false }),
      );
    }
    const n = buildNetwork(p);
    assert.equal(n.clearances.length, 2);
    const sorted = n.clearances.map((c) => c.meters).sort((a, b) => a - b);
    close(sorted[0], 5.48);
    close(sorted[1], 6.6);
    assert(bridgeAt(p.roads[0], 0.5));
    assert(!bridgeAt(p.roads[0], 0.75));
  });
  it("connected insertion makes a 64 m deck, two earth approaches and a rise-dependent 4% runout without moving original endpoints", () => {
    const p = fixture({}, 720),
      before = structuredClone(p.nodes),
      r = p.roads[0],
      result = insertConnectedBridge(p, r.id, { rise: 8 }),
      n = buildNetwork(p);
    close(result.deckLength, 64);
    assert.equal(result.elevation, 8);
    assert.equal(p.roads.filter((r) => r.bridge).length, 1);
    assert(p.roads.filter((r) => !r.bridge).every((r) => r.embankment));
    assert(n.maxGrade <= 4.05);
    for (const old of before)
      assert.deepEqual(
        p.nodes.find((n) => n.id === old.id),
        old,
      );
    assert.equal(n.bridges[0].abutments?.length, 2);
    assert.equal(n.embankments.length, 2);
  });
  it("insufficient approach length or an authored auxiliary zone refuses atomically", () => {
    for (const settings of [
      {},
      { auxiliaryLane: "exit" },
    ] as Partial<RoadSettings>[]) {
      const p = fixture(settings, 600),
        before = JSON.stringify(p);
      assert.throws(() => insertConnectedBridge(p, p.roads[0].id, { rise: 8 }));
      assert.equal(JSON.stringify(p), before);
    }
  });
  it("new bounds/role/auxiliary/fill settings round-trip; legacy inputs get unintrusive defaults and invalid bounds clamp", () => {
    const p = fixture({
        bridge: true,
        embankment: true,
        bridgeFrom: 0.2,
        bridgeTo: 0.8,
        auxiliaryLane: "entry",
      }),
      raw = JSON.parse(JSON.stringify(p));
    assert.deepEqual(parseProject(raw), raw);
    for (const key of [
      "roadClass",
      "embankment",
      "bridgeFrom",
      "bridgeTo",
      "auxiliaryLane",
      "auxiliaryLength",
      "auxiliaryTaper",
    ])
      delete raw.roads[0][key];
    const legacy = parseProject(raw).roads[0];
    assert.equal(legacy.roadClass, "street");
    assert.equal(legacy.embankment, false);
    assert.equal(legacy.auxiliaryLane, "none");
    assert.equal(legacy.bridgeFrom, 0);
    assert.equal(legacy.bridgeTo, 1);
    raw.roads[0].bridgeFrom = 0.9;
    raw.roads[0].bridgeTo = 0.3;
    const bounded = parseProject(raw).roads[0];
    assert(bounded.bridgeTo - bounded.bridgeFrom >= 0.0199);
  });
  it("engine manifests retain measured sources, weave spacing, speed-change geometry and supported bridge spans", () => {
    const { p, n } = template("diamond"),
      manifest = exportMeshManifest(n, p),
      obj = exportOBJ(n);
    assert.deepEqual(manifest.designReview, n.designReview);
    assert.deepEqual(manifest.auxiliaryLanes, n.auxiliaryLanes);
    assert.deepEqual(manifest.embankments, n.embankments);
    assert(
      manifest.bridges.every(
        (b) => b.girderCount! >= 3 && b.abutments?.length === 2,
      ),
    );
    assert(
      obj.obj.includes("structure soil".replace(/ /g, "_")) ||
        obj.obj.includes("structure_soil"),
    );
  });
  it("the user's European parking layout is not re-scaled or populated with scenery by the interchange corrections", () => {
    const p = makeTemplate("europe"),
      n = buildNetwork(p);
    assert.equal(n.roadsideParking.length, 180);
    assert.deepEqual(n.embankments, []);
    assert.deepEqual(n.auxiliaryLanes, []);
    assert.deepEqual(n.diagnostics, []);
    assert(!n.meshes.some((m) => ["building", "landscape"].includes(m.kind)));
  });
});
