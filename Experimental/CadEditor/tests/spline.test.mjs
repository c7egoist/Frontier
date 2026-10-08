// Joint audit for the continuity-controlled spline: every declared G0 / G1 / G2 joint is
// measured from the emitted Bezier segments and must meet its declared continuity.

import assert from "node:assert/strict";
import { analyseJoints, chainToBeziers, bezierAt, sampleChain, solveChains } from "../src/geometry/spline.js";

const RANK = { G0: 0, G1: 1, G2: 2 };
const knot = (p, cont = "G1", scale = 1) => ({ p, cont, scale });

// 1. Default car-profile spline (the one shipped in nodeTypes.js).
const defaults = [
  knot([0, 0, 0], "G0"),
  knot([25, 18, 0], "G2"),
  knot([55, -6, 0], "G2"),
  knot([80, 12, 0], "G1"),
  knot([110, 0, 0], "G0"),
];
const joints = analyseJoints(defaults);
assert.equal(joints.length, 3, "three interior joints");
for (const j of joints) {
  assert.ok(RANK[j.measured] >= RANK[j.declared], `joint ${j.knot}: declared ${j.declared}, measured ${j.measured}`);
}
const g2 = joints.filter((j) => j.declared === "G2");
for (const j of g2) assert.ok(j.curvatureError < 1e-9, `G2 joint ${j.knot} curvature error ${j.curvatureError}`);

// 2. Every segment starts and ends on its knots, and the chain is continuous.
for (const seg of chainToBeziers(defaults)) {
  const a = bezierAt(seg, 0).pos;
  const b = bezierAt(seg, 1).pos;
  assert.ok(Math.hypot(a[0] - seg.p0[0], a[1] - seg.p0[1]) < 1e-9, "segment starts on its knot");
  assert.ok(Math.hypot(b[0] - seg.p3[0], b[1] - seg.p3[1]) < 1e-9, "segment ends on its knot");
}

// 3. Randomised audit: many knot layouts, random continuity per joint, 3D points.
let seed = 20261008;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let checked = 0;
for (let trial = 0; trial < 200; trial++) {
  const n = 3 + Math.floor(rnd() * 6);
  const knots = [];
  for (let i = 0; i < n; i++) {
    const p = [i * 20 + (rnd() - 0.5) * 12, (rnd() - 0.5) * 40, (rnd() - 0.5) * 15];
    const cont = i === 0 || i === n - 1 ? "G0" : ["G0", "G1", "G2"][Math.floor(rnd() * 3)];
    knots.push(knot(p, cont, 0.5 + rnd() * 1.5));
  }
  for (const j of analyseJoints(knots)) {
    checked += 1;
    const tag = `trial ${trial} joint ${j.knot}`;
    if (j.declared === "G0") {
      // A G0 knot may accidentally be smooth; it must never be reported as less continuous than declared.
      assert.ok(RANK[j.measured] >= 0, tag);
      continue;
    }
    assert.ok(RANK[j.measured] >= RANK[j.declared], `${tag}: declared ${j.declared}, measured ${j.measured}, angle ${j.angleDeg}`);
    if (j.declared === "G2") assert.ok(j.curvatureError < 1e-8, `${tag}: curvature error ${j.curvatureError}`);
    if (j.declared === "G1") assert.ok(j.angleDeg < 1e-4, `${tag}: angle ${j.angleDeg}`); // acos noise near 1 is ~1e-6 deg
  }
}
assert.ok(checked > 300, "randomised audit ran enough joints");

// 4. A genuine corner (G0) is reported as G0 with a visible angle.
const corner = analyseJoints([knot([0, 0, 0], "G0"), knot([30, 0, 0], "G0"), knot([60, 30, 0], "G0")]);
assert.equal(corner[0].measured, "G0");
assert.ok(corner[0].angleDeg > 1, "corner angle is visible");

// 5. Scale changes the handle length, so the curve must change; the joint still holds.
// Asymmetric layout: a symmetric one would be G2 by mirror symmetry, regardless of the joint.
const base = [knot([0, 0, 0], "G0"), knot([40, 30, 0], "G1", 1), knot([90, 5, 0], "G0")];
const stretched = [knot([0, 0, 0], "G0"), knot([40, 30, 0], "G1", 3), knot([90, 5, 0], "G0")];
const a = sampleChain(base, 8);
const b = sampleChain(stretched, 8);
const diff = a.reduce((s, p, i) => s + Math.hypot(p[0] - b[i][0], p[1] - b[i][1], p[2] - b[i][2]), 0);
assert.ok(diff > 1, "handle scale changes the curve");
assert.ok(RANK[analyseJoints(stretched)[0].measured] >= RANK.G1, "stretched joint still at least G1");

// 6. Two knots: one segment, no interior joints.
const line = solveChains([knot([0, 0, 0], "G0"), knot([10, 0, 0], "G0")]);
assert.equal(line.chains.length, 1);
assert.equal(analyseJoints([knot([0, 0, 0], "G0"), knot([10, 0, 0], "G0")]).length, 0);

console.log(`spline joint audit passed: ${checked} randomised joints, default profile ${joints.map((j) => `${j.declared}->${j.measured}`).join(" ")}`);
