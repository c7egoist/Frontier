import { exportMeshManifest } from "../src/core/export";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  makeTemplate,
  makeNode,
  makeRoad,
  type Project,
} from "../src/core/model";
import { buildNetwork, cornerCurve, type Network } from "../src/core/geometry";
import { sampleAlignment } from "../src/core/curves";
import { geometryProfiles, normaliseDetail } from "../src/core/quality";
import { distance, type V3 } from "../src/core/math";
function finite(n: Network) {
  for (const m of n.meshes) {
    assert(m.positions.every(Number.isFinite), m.name);
    assert(m.uvs.every(Number.isFinite));
    assert.equal(m.positions.length / 3, m.uvs.length / 2);
    assert(
      m.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < m.positions.length / 3,
      ),
    );
  }
}
function mouths(n: Network) {
  for (const j of n.junctions) {
    const m = n.meshes.find(
      (m) => m.owner === j.node.id && m.kind === "asphalt",
    )!;
    for (const arm of j.arms)
      for (const p of [arm.left, arm.center, arm.right])
        assert(
          m.positions.some(
            (_, i) =>
              i % 3 === 0 &&
              distance(p, m.positions.slice(i, i + 3) as V3) < 1e-7,
          ),
          j.node.name,
        );
  }
}
describe("production mesh tolerances", () => {
  it("profiles are metric and unknown values fall back safely", () => {
    assert.equal(normaliseDetail("production"), "production");
    assert.equal(normaliseDetail("unknown"), "editing");
    assert(
      geometryProfiles.production.maxSegment <
        geometryProfiles.editing.maxSegment,
    );
    assert(
      geometryProfiles.production.maxDeviation <
        geometryProfiles.editing.maxDeviation,
    );
  });
  it("production subdivision respects its target step even on a 4 km road", () => {
    const a = makeNode([0, 0, 0]),
      b = makeNode([4000, 0, 0]),
      r = makeRoad(a, b),
      p: Project = { version: 1, name: "Long road", nodes: [a, b], roads: [r] };
    const s = sampleAlignment(p, r, geometryProfiles.production).stations;
    assert(s.length > 5000);
    for (let i = 1; i < s.length; i++)
      assert(distance(s[i - 1].p, s[i].p) <= 0.750001);
    assert.deepEqual(s[0].p, a.position);
    assert.deepEqual(s.at(-1)!.p, b.position);
  });
  it("dense circular corners retain exact pinned endpoints and increase resolution", () => {
    const a: V3 = [20, 0.05, 3.5],
      b: V3 = [3.5, 0.1, 20],
      da: V3 = [1, 0, 0],
      db: V3 = [0, 0, 1];
    const draft = cornerCurve(a, da, b, db, 6),
      dense = cornerCurve(a, da, b, db, 6, "production");
    assert(dense.length >= 64);
    assert(dense.length > draft.length);
    assert.deepEqual(dense[0], a);
    assert.deepEqual(dense.at(-1), b);
    assert(dense.every((p) => p.every(Number.isFinite)));
  });
  it("bounded fallback corners are also denser without losing mouth heights", () => {
    const a: V3 = [-10, 0.1, 0],
      b: V3 = [10, 0.25, 0],
      dense = cornerCurve(a, [1, 0, 0], b, [-1, 0, 0], 3, "production");
    assert(dense.length >= 64);
    assert.deepEqual(dense[0], a);
    assert.deepEqual(dense.at(-1), b);
  });
  for (const id of [
    "district",
    "merge",
    "urban",
    "signal",
    "race",
    "cloverleaf",
    "trumpet",
    "waterfront",
    "roundabout",
    "diamond",
  ])
    it(`${id}: production detail is real, finite and does not change authoring topology`, () => {
      const p = makeTemplate(id),
        before = JSON.stringify(p),
        draft = buildNetwork(p),
        dense = buildNetwork(p, { detail: "production" });
      assert.equal(dense.detail, "production");
      assert.equal(draft.detail, "editing");
      assert.equal(JSON.stringify(p), before);
      assert(dense.triangles > draft.triangles * 1.3);
      assert.equal(dense.spans.length, draft.spans.length);
      assert.equal(dense.junctions.length, draft.junctions.length);
      assert.equal(dense.parkingSpaces, draft.parkingSpaces);
      assert.deepEqual(dense.diagnostics, []);
      finite(dense);
      mouths(dense);
      assert(
        !dense.meshes.some(
          (m) =>
            ["building", "landscape", "lamp"].includes(m.kind) ||
            (m.kind === "sign" &&
              !(
                m.ownerKind === "node" &&
                p.nodes.find((n) => n.id === m.owner)?.signals
              )),
        ),
      );
    });
  it("dense export budget rejects oversized tiles before generating vertices", () => {
    const p: Project = { version: 1, name: "Large tile", nodes: [], roads: [] };
    for (let i = 0; i < 17; i++) {
      const a = makeNode([-1000, 0, i * 18]),
        b = makeNode([1000, 0, i * 18]);
      p.nodes.push(a, b);
      p.roads.push(makeRoad(a, b));
    }
    assert.throws(
      () => buildNetwork(p, { detail: "production" }),
      /Production geometry budget/,
    );
    assert.equal(p.roads.length, 17);
  });
  it("defaults preserve the previous interactive sampling contract", () => {
    const p = makeTemplate("merge"),
      r = p.roads[0],
      a = sampleAlignment(p, r),
      b = sampleAlignment(p, r, geometryProfiles.editing);
    assert.deepEqual(a, b);
  });
});

it("engine mesh manifest names owners and records actual production tolerances", () => {
  const p = makeTemplate("district"),
    n = buildNetwork(p, { detail: "production" }),
    m = exportMeshManifest(n, p);
  assert.equal(m.geometryDetail, "production");
  assert.equal(m.tolerances.maxRoadSegment, 0.75);
  assert.equal(m.tolerances.maxCurveDeviation, 0.01);
  assert.equal(m.triangles, n.triangles);
  assert.equal(m.upAxis, "Y");
  assert(!m.includesPreviewEnvironment);
  assert(m.objects.some((o) => o.owner.name === "Northbank avenue · West"));
  assert(m.objects.every((o) => o.vertices > 0 && o.triangles > 0));
  assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
});
