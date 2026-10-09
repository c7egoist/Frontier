import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeSite, siteOutline, sitePoint, type Site } from "../src/core/sites";
import {
  parkingPlan,
  parkingEntry,
  parkingFootprint,
} from "../src/core/site-geometry";
import {
  area2,
  clipConvex2,
  centroid2,
  rect2,
  inside2,
  overlap2,
} from "../src/core/polygons";
import {
  buildNetwork,
  curbSections,
  edgePoint,
  type Network,
} from "../src/core/geometry";
import { makeTemplate, type Project } from "../src/core/model";
import { exportOBJ } from "../src/core/export";
import { distance, distanceXZ, type V3, type V2 } from "../src/core/math";
const project = (site: Site): Project => ({
  version: 1,
  name: "Surface regression",
  nodes: [],
  roads: [],
  sites: [site],
});
const vertices = (mesh: Network["meshes"][number]) =>
  Array.from(
    { length: mesh.positions.length / 3 },
    (_, i) => mesh.positions.slice(i * 3, i * 3 + 3) as V3,
  );
const hasPoint = (mesh: Network["meshes"][number], p: V3) =>
  vertices(mesh).some((q) => distance(q, p) < 1e-7);

describe("convex footprint construction", () => {
  it("clipping supports both winding directions and retains exact metric intersections", () => {
    const a = rect2(0, 0, 8, 8),
      mask = rect2(3, 0, 6, 6),
      p = clipConvex2(a, mask),
      reverse = clipConvex2(a, [...mask].reverse());
    assert(Math.abs(area2(p) - 24) < 1e-8);
    assert(Math.abs(area2(reverse) - 24) < 1e-8);
    assert(p.every((v) => inside2(a, v) && inside2(mask, v)));
  });
  it("touching lanes are not reported as positive-area collisions", () => {
    assert(!overlap2(rect2(0, 0, 2, 2), rect2(2, 0, 2, 2)));
    assert(overlap2(rect2(0, 0, 2, 2), rect2(1.8, 0, 2, 2)));
  });
  it("empty and degenerate clipping is finite and explicit", () => {
    assert.deepEqual(clipConvex2(rect2(0, 0, 2, 2), rect2(10, 0, 2, 2)), []);
    assert.deepEqual(clipConvex2([], rect2(0, 0, 2, 2)), []);
    assert.deepEqual(
      centroid2([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
      [0, 0],
    );
  });
});

describe("parking circulation and transfer clearances", () => {
  for (const shape of ["rectangle", "circle", "triangle"] as const)
    for (const angle of [45, 60, 90] as const)
      it(`${shape}, ${angle}°: no stall/transfer/circulation overlap`, () => {
        for (const entrance of ["north", "south", "east", "west"] as const) {
          const s = makeSite("parking", [17, 0, -23]);
          Object.assign(s, {
            width: 62,
            depth: 54,
            yaw: 25,
            shape,
            parkingAngle: angle,
            entrance,
          });
          const p = parkingPlan(s),
            occupied = p.bays.flatMap((b) =>
              b.transferCorners ? [b.corners, b.transferCorners] : [b.corners],
            ),
            mask = parkingFootprint(s, s.perimeterWidth + 0.22),
            corridors = [
              p.spine.polygon,
              ...p.aisles.filter((a) => a.connected).map((a) => a.polygon),
            ];
          for (const polygon of occupied) {
            assert(polygon.every((v) => inside2(mask, v)));
            assert(
              !corridors.some((c) => overlap2(c, polygon)),
              `${entrance}: circulation collision`,
            );
          }
          for (let i = 0; i < occupied.length; i++)
            for (let j = i + 1; j < occupied.length; j++)
              assert(
                !overlap2(occupied[i], occupied[j]),
                `${entrance}: occupied polygons overlap`,
              );
          for (const a of p.aisles.filter((a) => a.connected)) {
            assert(overlap2(a.polygon, p.spine.polygon));
            assert(a.polygon.every((v) => inside2(mask, v)));
          }
          assert(
            p.bays.every((b) =>
              p.aisles.some(
                (a) =>
                  a.connected &&
                  Math.abs(
                    Math.abs(b.z - a.z) - (a.width / 2 + p.rowDepth / 2),
                  ) < 1e-7,
              ),
            ),
          );
        }
      });
  it("the triangular entry is on the actual boundary rather than a rectangular bounding-box edge", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.shape = "triangle";
    s.width = 72;
    s.depth = 54;
    s.entrance = "south";
    const entry = parkingEntry(s);
    assert(entry.center[1] < s.depth / 2 - 8);
    assert(entry.center[0] < -2);
    const p = parkingPlan(s);
    assert(p.bays.length > 0);
    assert(overlap2(p.spine.polygon, p.entry.apron));
  });
  it("curved-footprint aisles disconnected from the entry are excluded, with a warning", () => {
    const s = makeSite("parking", [0, 0, 0]);
    Object.assign(s, {
      width: 62,
      depth: 54,
      shape: "triangle",
      entrance: "east",
      parkingAngle: 45,
    });
    const p = parkingPlan(s);
    assert(p.aisles.some((a) => !a.connected));
    assert(p.warnings.some((w) => /excluded/.test(w)));
    assert(p.rows < p.aisles.length * 2);
  });
  it("parking paints and drain grates stay within the actual curved footprint", () => {
    for (const shape of ["circle", "triangle"] as const) {
      const s = makeSite("parking", [0, 0, 0]);
      Object.assign(s, { width: 62, depth: 54, shape, parkingAngle: 60 });
      const n = buildNetwork(project(s)),
        mask = parkingFootprint(s);
      for (const mesh of n.meshes.filter((m) =>
        ["marking", "drain"].includes(m.kind),
      ))
        for (const v of vertices(mesh))
          assert(inside2(mask, [v[0], v[2]], 0.002), mesh.material);
    }
  });
  it("accessible transfer widths are genuinely 1.25 metres at every bay angle", () => {
    for (const parkingAngle of [45, 60, 90] as const) {
      const s = makeSite("parking", [0, 0, 0]);
      Object.assign(s, { width: 80, depth: 60, parkingAngle });
      const bays = parkingPlan(s).bays.filter((b) => b.accessible);
      assert(bays.length > 0);
      for (const b of bays) {
        const [a, z] = b.transferCorners!;
        assert(Math.abs(Math.hypot(z[0] - a[0], z[1] - a[1]) - 1.25) < 1e-8);
      }
    }
  });
  it("entry curb cuts use the exact entry width and have closed chamfered returns", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.entryWidth = 7.3;
    const n = buildNetwork(project(s)),
      curb = n.meshes.find((m) => m.kind === "curb")!;
    const top = vertices(curb).filter(
      (v) => Math.abs(v[2] + s.depth / 2) < 1e-8 && v[1] > 0.13,
    );
    assert(top.some((v) => Math.abs(v[0] - 3.65) < 1e-7));
    assert(top.some((v) => Math.abs(v[0] + 3.65) < 1e-7));
    assert(top.every((v) => Math.abs(v[0]) >= 3.65 - 1e-7));
  });
  it("procedural paint wear is a real exportable material parameter", () => {
    const s = makeSite("parking", [0, 0, 0]);
    s.paintWear = 0;
    let n = buildNetwork(project(s));
    assert(n.meshes.some((m) => m.material === "paint-wear-0"));
    s.paintWear = 0.25;
    n = buildNetwork(project(s));
    assert(n.meshes.some((m) => m.material === "paint-wear-25"));
    assert(
      !n.meshes.some((m) =>
        ["building", "landscape", "sign", "lamp"].includes(m.kind),
      ),
    );
  });
});

describe("continuous chamfered road curbs", () => {
  it("the metric profile has a vertical face, a 15 mm chamfer and a retained paving seam", () => {
    const base: V3[] = [[0, 0, 0]],
      inner: V3[] = [[0, 0.16, 0]],
      outer: V3[] = [[0.22, 0.16, 0]],
      rows = curbSections(base, inner, outer);
    assert.equal(rows.length, 4);
    assert(Math.abs(rows[1][0][1] - 0.145) < 1e-9);
    assert(Math.abs(rows[2][0][0] - 0.015) < 1e-9);
    assert.deepEqual(rows[3], outer);
  });
  it("chamfer vertices match exactly at every road-to-junction mouth, including grades and acute merges", () => {
    for (const id of ["district", "merge", "signal", "race", "diamond"]) {
      const n = buildNetwork(makeTemplate(id));
      for (const joint of n.junctions) {
        const seams = n.meshes.filter(
          (m) => m.owner === joint.node.id && m.kind === "curb",
        );
        for (const arm of joint.arms) {
          const side = arm.isStart ? 1 : -1;
          for (const direction of [-side, side]) {
            const f = arm.frame,
              rows = curbSections(
                [edgePoint(f, direction, "road")],
                [edgePoint(f, direction, "curbIn")],
                [edgePoint(f, direction, "curbOut")],
              );
            for (const row of rows)
              assert(
                seams.some((seam) => hasPoint(seam, row[0])),
                `${id}: missing chamfer seam`,
              );
          }
        }
      }
    }
  });
  it("flush curb chamfers cannot exceed the available curb height or invert the top face", () => {
    const rows = curbSections([[0, 0, 0]], [[0, 0.04, 0]], [[0.22, 0.04, 0]]);
    assert(rows[1][0][1] > 0);
    assert(rows[2][0][0] < 0.015);
    assert(rows.every((r) => r[0].every(Number.isFinite)));
  });
});

describe("material package portability", () => {
  it("OBJ exports normal and roughness bindings as explicit PBR MTL extensions", () => {
    const n = buildNetwork(makeTemplate("tee")),
      { mtl } = exportOBJ(n, "road", {
        asphalt: {
          path: "textures/asphalt.png",
          normalPath: "textures/asphalt-normal.png",
          roughnessPath: "textures/asphalt-roughness.png",
          normalStrength: 0.24,
          scale: [0.5, 0.5],
          alpha: false,
        },
      });
    assert(mtl.includes("norm -s 0.5 0.5 1 textures/asphalt-normal.png"));
    assert(mtl.includes("map_Pr -s 0.5 0.5 1 textures/asphalt-roughness.png"));
    assert(mtl.includes("Pr 1"));
  });
});
