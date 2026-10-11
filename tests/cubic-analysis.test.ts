import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeCubic, cubicProfile } from "../src/core/cubic-analysis";
import { derivative, cubic, distanceXZ, type V3 } from "../src/core/math";
import {
  makeNode,
  makeRoad,
  makeTemplate,
  controlPoints,
  type Project,
  type RoadSettings,
} from "../src/core/model";
import { sampleAlignment, stationAt } from "../src/core/curves";
import { geometryProfiles } from "../src/core/quality";
import { buildNetwork } from "../src/core/geometry";
import {
  curveDesignMetrics,
  measureRoadDesign,
  measureGradeJoins,
} from "../src/core/design-controls";
import { insertConnectedBridge } from "../src/core/bridge-insertion";
import { exportMeshManifest } from "../src/core/export";
const close = (a: number, b: number, e = 1e-7) =>
  assert(Math.abs(a - b) < e, `${a} != ${b}`);
function fromVelocity(x: number[], y: number[], z: number[]): V3[] {
  const vs = [x, y, z],
    p0: V3 = [0, 0, 0],
    p1 = vs.map((v) => v[0] / 3) as V3,
    p2 = vs.map((v, i) => 2 * p1[i] + v[1] / 6) as V3,
    p3 = vs.map((v, i) => 3 * p2[i] - 3 * p1[i] + v[2] / 3) as V3;
  return [p0, p1, p2, p3];
}
function fixture(points: V3[], settings: Partial<RoadSettings> = {}): Project {
  const a = makeNode([...points[0]]),
    z = makeNode([...points[3]]);
  a.crossings = z.crossings = false;
  return {
    version: 1,
    name: "Cubic audit",
    nodes: [a, z],
    roads: [
      makeRoad(
        a,
        z,
        "Audit road",
        {
          lanes: 2,
          laneWidth: 3.65,
          shoulderWidth: 2,
          oneWay: true,
          sidewalk: 0,
          markingStyle: "motorway",
          curbStyle: "flush",
          roadClass: "mainline",
          manholes: false,
          drainage: false,
          signs: false,
          ...settings,
        },
        points[1].map((v, i) => v - points[0][i]) as V3,
        points[2].map((v, i) => v - points[3][i]) as V3,
      ),
    ],
    sites: [],
  };
}
function sparseGrade(p: V3[]) {
  let g = 0;
  for (let i = 0; i <= 512; i++) {
    const d = derivative(p, i / 512);
    g = Math.max(
      g,
      (100 * Math.abs(d[1])) / Math.max(1e-8, Math.hypot(d[0], d[2])),
    );
  }
  return g;
}
const a = 0.50135,
  C = 6000,
  epsilon = 1e-6,
  b = 0.05,
  narrow = fromVelocity(
    [C * (a * a + epsilon), -2 * C * a, C],
    [C * epsilon, 0, 0],
    [-C * b * a, C * b, 0],
  );
const reverse: V3[] = [
    [0, 0, 0],
    [200, 0, 0],
    [-200, 0, 0],
    [100, 0, 0],
  ],
  vertical: V3[] = [
    [0, 0, 0],
    [0, 1, 0],
    [100, 2, 0],
    [300, 3, 0],
  ],
  north: V3[] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 100],
    [0, 0, 300],
  ];

describe("cubic differential extrema and limiting tangents", () => {
  it("a narrow 100% grade peak between fixed samples is found at its actual controlling parameter", () => {
    assert(sparseGrade(narrow) < 4.05);
    const m = analyzeCubic(narrow);
    close(m.maximumGrade!, 100, 0.001);
    close(m.maximumGradeParameter, a, 1e-10);
    assert(m.minimumRadius! < 1e-6);
    close(m.minimumRadiusParameter!, a, 1e-10);
    assert.equal(m.method, "polynomial-extrema");
    assert.deepEqual(m.issues, []);
  });
  it("the exact differential equation measures a small-radius peak rather than the preview chord's radius", () => {
    const m = analyzeCubic(narrow);
    close(m.minimumRadius!, (C * epsilon ** 2) / b, 1e-10);
    const profile = cubicProfile(narrow);
    close(profile.radiusAt(m.minimumRadiusParameter!), m.minimumRadius!, 1e-12);
  });
  it("a collinear reversing cubic is not advertised as a straight, usable road", () => {
    const m = analyzeCubic(reverse);
    assert.equal(m.minimumRadius, 0);
    assert.equal(m.issues.filter((i) => i.kind === "plan-reversal").length, 2);
    assert(m.planLength > 200);
    assert.equal(m.maximumGrade, 0);
    assert(m.criticalParameters.length >= 2);
  });
  it("an interior monotone stationary parameter is not confused with a geometric reversal", () => {
    const p = fromVelocity(
        [10000 * a * a, -20000 * a, 10000],
        [100 * a * a, -200 * a, 100],
        [0, 0, 0],
      ),
      m = analyzeCubic(p);
    assert.deepEqual(m.issues, []);
    assert.equal(m.minimumRadius, null);
    close(m.maximumGrade!, 1);
    assert(m.stationaryParameters.some((t) => Math.abs(t - a) < 1e-10));
    assert.deepEqual(cubicProfile(p).tangentAt(a), [1, 0, 0]);
  });
  it("an endpoint with zero handle on a straight northbound road has its true limiting direction", () => {
    const m = analyzeCubic(north);
    assert.deepEqual(m.issues, []);
    assert.equal(m.minimumRadius, null);
    close(m.planLength, 300);
    assert.deepEqual(cubicProfile(north).tangentAt(0), [0, 0, 1]);
  });
  it("a stopped endpoint on a curved road reports its zero-radius limit", () => {
    const p: V3[] = [
        [0, 0, 0],
        [0, 0, 0],
        [10, 0, 0],
        [10, 0, 10],
      ],
      m = analyzeCubic(p);
    assert.equal(m.minimumRadius, 0);
    assert.equal(m.minimumRadiusParameter, 0);
    assert(m.issues.some((i) => i.kind === "zero-radius-tangent"));
  });
  it("a vertical tangent reports an unbounded grade as null, not a zero or invalid JSON number", () => {
    const m = analyzeCubic(vertical);
    assert.equal(m.maximumGrade, null);
    assert.equal(m.maximumGradeParameter, 0);
    assert(m.issues.some((i) => i.kind === "vertical-tangent"));
    assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  });
  it("a vertically separated pair with no horizontal plan length is explicitly unusable", () => {
    const p: V3[] = [
        [0, 0, 0],
        [0, 5, 0],
        [0, 10, 0],
        [0, 15, 0],
      ],
      m = analyzeCubic(p);
    assert.equal(m.planLength, 0);
    assert.equal(m.maximumGrade, null);
    assert(m.issues.some((i) => i.kind === "collapsed-plan"));
    assert.equal(cubicProfile(p).tangentAt(0.5), null);
  });
  it("a horizontal inflection is pinned without being treated as a stopped/reversing tangent", () => {
    const p: V3[] = [
        [0, 0, 0],
        [100, 0, 90],
        [200, 0, -90],
        [300, 0, 0],
      ],
      m = analyzeCubic(p);
    assert.deepEqual(m.issues, []);
    assert(m.criticalParameters.some((t) => Math.abs(t - 0.5) < 1e-10));
    assert(m.minimumRadius! > 0);
  });
  it("translation/rotation and uniform physical scale preserve the appropriate metric quantities", () => {
    const p: V3[] = [
        [0, 0, 0],
        [100, 4, 80],
        [220, 3, -20],
        [360, 7, 60],
      ],
      m = analyzeCubic(p),
      q = p.map(([x, y, z]) => [5000 - 3 * z, 3 * y - 20, 6000 + 3 * x] as V3),
      n = analyzeCubic(q);
    close(n.planLength, m.planLength * 3, 1e-4);
    close(n.minimumRadius!, m.minimumRadius! * 3, 1e-5);
    close(n.maximumGrade!, m.maximumGrade!, 1e-6);
    close(n.maximumGradeParameter, m.maximumGradeParameter, 1e-8);
  });
  it("API result mutation and in-place control edits cannot corrupt the private differential cache", () => {
    const p = narrow.map((v) => [...v] as V3),
      first = analyzeCubic(p);
    first.criticalParameters[0] = 0.123;
    first.issues.push({ kind: "collapsed-plan", parameter: 0 });
    const next = analyzeCubic(p);
    assert.deepEqual(next.issues, []);
    assert(!next.criticalParameters.includes(0.123));
    p[1][1] += 1;
    assert.notEqual(analyzeCubic(p).maximumGrade, next.maximumGrade);
  });
  it("independent dense checks agree with finite polynomial extrema on ordinary 3D curves", () => {
    for (let j = 0; j < 8; j++) {
      const p: V3[] = [
          [0, 0, 0],
          [100, 2 + j, 35 - 7 * j],
          [240, 4 - j, -25 + 9 * j],
          [380, 6, 40],
        ],
        m = analyzeCubic(p);
      let min = Infinity,
        max = 0;
      for (let i = 0; i <= 40000; i++) {
        const t = i / 40000,
          u = 1 - t,
          d = derivative(p, t),
          dd = p[0].map(
            (_, k) =>
              6 *
              (u * (p[2][k] - 2 * p[1][k] + p[0][k]) +
                t * (p[3][k] - 2 * p[2][k] + p[1][k])),
          ),
          speed = Math.hypot(d[0], d[2]),
          cross = Math.abs(d[0] * dd[2] - d[2] * dd[0]);
        if (cross > 1e-10) min = Math.min(min, speed ** 3 / cross);
        max = Math.max(max, (100 * Math.abs(d[1])) / speed);
      }
      close(m.minimumRadius!, min, 1e-3);
      close(m.maximumGrade!, max, 1e-6);
      assert.deepEqual(m.issues, []);
    }
  });
});

describe("preview-independent sampling and geometric diagnostics", () => {
  for (const detail of ["editing", "production"] as const)
    it(`${detail}: controlling peaks are exact sampling knots even if the mesh profile is sparse`, () => {
      const p = fixture(narrow),
        r = p.roads[0],
        alignment = sampleAlignment(p, r, geometryProfiles[detail]),
        m = analyzeCubic(controlPoints(p, r));
      assert(
        alignment.stations.some(
          (f) => Math.abs(f.t - m.maximumGradeParameter) < 1e-10,
        ),
      );
      assert(
        alignment.stations.some(
          (f) => Math.abs(f.t - m.minimumRadiusParameter!) < 1e-10,
        ),
      );
      assert(alignment.stations.every((f) => f.p.every(Number.isFinite)));
    });
  it("collinear loops/reversals are subdivided from the full control path rather than one short endpoint chord", () => {
    const p = fixture(reverse),
      alignment = sampleAlignment(p, p.roads[0]);
    assert(alignment.stations.length > 10);
    assert(alignment.length > 200);
    const m = analyzeCubic(reverse);
    for (const t of m.stationaryParameters)
      assert(alignment.stations.some((s) => Math.abs(s.t - t) < 1e-10));
  });
  it("station lookup uses true limiting endpoint normals for a zero-handle straight", () => {
    const p = fixture(north),
      alignment = sampleAlignment(p, p.roads[0]);
    assert.deepEqual(alignment.stations[0].d, [0, 0, 1]);
    assert.deepEqual(stationAt(alignment, 0).d, [0, 0, 1]);
    assert.deepEqual(stationAt(alignment, alignment.length).d, [0, 0, 1]);
  });
  it("sampled alignments are snapshots, not borrowed mutable model endpoint arrays", () => {
    const p = fixture(north),
      alignment = sampleAlignment(p, p.roads[0]),
      before = [...alignment.points[0]];
    p.nodes[0].position[0] += 20;
    assert.deepEqual(alignment.points[0], before);
    assert.deepEqual(stationAt(alignment, 0).d, [0, 0, 1]);
  });
  for (const role of ["street", "mainline"] as const)
    it(`${role}: invalid reversing curves produce errors and cannot pass the selected design review`, () => {
      const p = fixture(reverse, { roadClass: role }),
        n = buildNetwork(p);
      assert(
        n.diagnostics.some(
          (d) => d.level === "error" && d.message.includes("reverses"),
        ),
      );
      assert(
        n.designReview.alignmentIssues.some((i) => i.kind === "plan-reversal"),
      );
      assert(!n.designReview.withinSelectedTargets);
      assert(!measureRoadDesign(p, p.roads[0]).meetsReference);
      assert(n.meshes.every((m) => m.positions.every(Number.isFinite)));
    });
  it("unbounded grades remain explicit and portable in the generated network and engine manifest", () => {
    const p = fixture(vertical),
      n = buildNetwork(p),
      m = exportMeshManifest(n, p);
    assert.equal(n.maxGrade, null);
    assert(
      n.diagnostics.some(
        (d) => d.level === "error" && d.message.includes("unbounded"),
      ),
    );
    assert.equal(m.designReview.roads[0].maximumGrade, null);
    assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
  });
  it("a collapsed plan is rejected without manufacturing a vertical asphalt roadway", () => {
    const p = fixture([
        [0, 0, 0],
        [0, 5, 0],
        [0, 10, 0],
        [0, 15, 0],
      ]),
      n = buildNetwork(p);
    assert.equal(n.spans.length, 0);
    assert.equal(n.meshes.length, 0);
    assert(n.diagnostics.some((d) => d.level === "error"));
    assert(!n.designReview.withinSelectedTargets);
  });
  it("monotone stationary straight geometry remains valid and preserves its requested lane widths", () => {
    const p = fixture(
        fromVelocity([10000 * a * a, -20000 * a, 10000], [0, 0, 0], [0, 0, 0]),
      ),
      n = buildNetwork(p);
    assert.deepEqual(n.diagnostics, []);
    assert(n.designReview.withinSelectedTargets);
    assert(n.spans[0].frames.every((f) => f.profileScale === 1));
  });
});

describe("grade-continuous bridge insertion and joins", () => {
  it("near-straight shared grade mismatches are reported in percentage points", () => {
    const p = fixture([
        [0, 0, 0],
        [100, 0, 0],
        [200, 0, 0],
        [300, 0, 0],
      ]),
      mid = p.nodes[1],
      end = makeNode([600, 3, 0]);
    p.nodes.push(end);
    p.roads.push(
      makeRoad(
        mid,
        end,
        "Rising",
        { ...p.roads[0] },
        [100, 1, 0],
        [-100, -1, 0],
      ),
    );
    p.roads[1].id = "rising";
    p.roads[1].start = mid.id;
    p.roads[1].end = end.id;
    const joins = measureGradeJoins(p);
    assert.equal(joins.length, 1);
    close(joins[0].delta!, 1);
    assert(!joins[0].continuous);
    const n = buildNetwork(p);
    assert(!n.designReview.withinSelectedTargets);
    assert(
      n.diagnostics.some((d) => d.message.includes("grade discontinuity")),
    );
  });
  it("connected bridge insertion preserves existing start/end grades and level deck landings without plan movement", () => {
    const p = fixture([
        [-450, 0, 0],
        [-150, 2 / 3, 0],
        [150, 4 / 3, 0],
        [450, 2, 0],
      ]),
      host = p.roads[0],
      before = structuredClone(p.nodes),
      original = cubicProfile(controlPoints(p, host)),
      result = insertConnectedBridge(p, host.id),
      n = buildNetwork(p),
      inside = p.roads.find((r) => r.id === result.approaches[0])!,
      outside = p.roads.find((r) => r.id === result.approaches[1])!;
    close(
      cubicProfile(controlPoints(p, inside)).signedGradeAt(0)!,
      original.signedGradeAt(0)!,
    );
    close(
      cubicProfile(controlPoints(p, outside)).signedGradeAt(1)!,
      original.signedGradeAt(1)!,
    );
    close(result.deckLength, 64, 1e-7);
    assert(n.maxGrade! <= 4.05);
    assert(n.designReview.gradeJoins.every((j) => j.continuous));
    for (const node of before)
      assert.deepEqual(
        p.nodes.find((n) => n.id === node.id),
        node,
      );
  });
  it("reversing/vertical host curves refuse connected insertion atomically before changing shared nodes", () => {
    for (const points of [
      reverse.map((v) => v.map((x) => x * 10) as V3),
      vertical.map((v) => v.map((x) => x * 10) as V3),
    ]) {
      const p = fixture(points),
        before = JSON.stringify(p);
      assert.throws(
        () => insertConnectedBridge(p, p.roads[0].id),
        /tangent|handles/,
      );
      assert.equal(JSON.stringify(p), before);
    }
  });
  for (const id of ["diamond", "cloverleaf", "trumpet", "city", "europe"])
    it(`${id}: reference layouts, grade-continuous landings and the 180 Euro bays remain intact`, () => {
      const p = makeTemplate(id),
        n = buildNetwork(p);
      assert.deepEqual(n.diagnostics, []);
      assert.deepEqual(n.designReview.alignmentIssues, []);
      assert(
        n.designReview.gradeJoins
          .filter((j) => j.assessed)
          .every((j) => j.continuous),
      );
      assert(n.designReview.withinSelectedTargets);
      if (id === "europe") assert.equal(n.roadsideParking.length, 180);
    });
});
