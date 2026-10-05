// Headless geometry smoke test: node --experimental-strip-types? No — run via tsx.
import { demoProject, migrateProject } from '../src/lib/model';
import { buildNetwork } from '../src/lib/network';
import { countTriangles } from '../src/lib/roadGeometry';
import { networkToObj } from '../src/lib/exportObj';
import { buildFrames, buildMergedJunction } from '../src/lib/roadGeometry';
import type { JunctionLeg } from '../src/lib/roadGeometry';
import { Vec3, left_normal } from '../src/lib/vec';
import { alongAxisUnderRay, touchPlaneUnderRay, snapStep } from '../src/lib/gizmoMath';

const fail = (msg: string) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const ok = (msg: string) => console.log(`ok: ${msg}`);

// 1. demo project builds
const project = demoProject();
const t0 = performance.now();
const net = buildNetwork(project);
const dt = performance.now() - t0;
console.log(`demo: ${net.junctions.length} junctions, ${net.spans.length} spans in ${dt.toFixed(0)}ms`);
for (const j of net.junctions) console.log(`  junction ${j.id}: ${j.topology}, ${j.arms.length} arms, ${j.patches.length} patches`);
let tris = 0;
for (const s of net.spans) {
  const t = countTriangles(s.patches);
  tris += t;
  const nm = project.splines.find((x) => x.id === s.splineId)?.name ?? '?';
  console.log(`  span ${nm}: kind=${s.kind} len=${s.length.toFixed(1)} patches=${s.patches.length} tris=${t}`);
}
for (const j of net.junctions) tris += countTriangles(j.patches);
console.log(`  total tris: ${tris}`);

if (net.junctions.length !== 1) fail(`expected 1 junction, got ${net.junctions.length}`);
else ok('junction count (4-way only; landing is a straight join)');
// run semantics: splines split at shared nodes, trimmed at junctions
const spansOf = (name: string) => net.spans.filter((s) => project.splines.find((x) => x.id === s.splineId)?.name === name);
if (spansOf('Shore Road').length !== 2) fail(`shore runs: ${spansOf('Shore Road').length}`);
else ok('shore split into 2 runs at junction');
if (spansOf('North Avenue').length !== 2) fail(`north runs: ${spansOf('North Avenue').length}`);
else ok('north split into 2 runs at junction');
if (spansOf('Lake Bridge').length !== 1) fail(`bridge runs: ${spansOf('Lake Bridge').length}`);
else ok('bridge is a single untrimmed run to the landing');
const causeway = spansOf('Causeway')[0];
// causeway node0->node1 is ~8.3m; runs must never exceed their curves (fold-back)
if (!causeway || causeway.length > 9) fail(`causeway span wrong: ${causeway?.length}`);
else ok('no fold-back at straight join');
for (const s of spansOf('North Avenue')) {
  // 18m/20m legs trimmed by cornerRadius 7 -> ~11m/~13m
  if (s.length < 8 || s.length > 14) fail(`north run length wrong: ${s.length}`);
}
if (process.exitCode !== 1) ok('junction-adjacent runs trimmed, not folded');
if (!net.spans.some((s) => s.kind === 'beam')) fail('expected a beam span');
else ok('beam span present');
if (tris < 4000) fail(`suspiciously low tri count: ${tris}`);
else ok('tri count sane');

// NaN guard
const checkPatch = (tag: string, patches: { grid: Vec3[][] }[]) => {
  for (const p of patches) {
    for (const row of p.grid) {
      for (const v of row) {
        if (!Number.isFinite(v[0]) || !Number.isFinite(v[1]) || !Number.isFinite(v[2])) {
          fail(`NaN in ${tag}`); return;
        }
      }
    }
  }
};
net.spans.forEach((s, i) => checkPatch(`span${i}`, s.patches));
net.junctions.forEach((j, i) => checkPatch(`junction${i}`, j.patches));
if (process.exitCode !== 1) ok('no NaNs');

// 2. tight-curve regression: hairpin must not invert offsets
// hairpin in road space, radius ~4m, road half width 5 + pave 2 = 7 > 4
const hairpin: Vec3[] = [];
for (let i = 0; i <= 60; i++) {
  const t = (i / 60) * Math.PI; // half circle
  hairpin.push([Math.cos(t) * 4, Math.sin(t) * 4, 0]);
}
const frames = buildFrames(hairpin);
const apex = frames[Math.floor(frames.length / 2)];
console.log(`hairpin: ${frames.length} stations, apex rho=${apex.rho.toFixed(2)} maxLeft=${apex.maxLeft.toFixed(2)} maxRight=${apex.maxRight.toFixed(2)}`);
// turning left (CCW in plan) -> inside on left, rho>0 small
if (!(apex.rho > 0 && apex.rho < 6)) fail(`apex rho wrong: ${apex.rho}`);
else ok('hairpin curvature detected');
if (!(apex.maxLeft < 5 && apex.maxRight > 100)) fail('hairpin clamp limits wrong');
else ok('hairpin clamps engage on inside only');

// 3. migration round-trip
const mig = migrateProject(JSON.parse(JSON.stringify(project)));
if (mig.splines.length !== project.splines.length) fail('migration lost splines');
else ok('migration round-trip');

// 4. merged-junction exactness: every approach section point must appear
// verbatim in the junction patches (shared boundaries, no seams)
{
  const ct = countTriangles;
  const mkLeg = (dx: number, dy: number, tag: string): JunctionLeg => {
    const R = 7;
    const t: Vec3 = [dx, dy, 0];
    const l = left_normal(t);
    const P: Vec3 = [-dx * R, -dy * R, 0];
    const at = (off: number, dz: number): Vec3 => [P[0] + l[0] * off, P[1] + l[1] * off, P[2] + dz];
    return {
      point: P, tangent: t, left: l,
      roadL: at(3.5, 0), roadR: at(-3.5, 0),
      curbL: at(3.75, 0.15), curbR: at(-3.75, 0.15),
      paveL: at(5.75, 0.15), paveR: at(-5.75, 0.15),
      botL: at(4.25, -1.5), botR: at(-4.25, -1.5),
      angle: Math.atan2(dy, dx), splineId: tag, splineName: tag, color: '#fff',
    };
  };
  const legs = [mkLeg(1, 0, 'e'), mkLeg(0, 1, 'n'), mkLeg(-1, 0, 'w'), mkLeg(0, -1, 's')];
  const jp = buildMergedJunction(legs, {
    center: [0, 0, 0], cornerRadius: 7, filletSteps: 10, depth: 1.5,
    rails: { enabled: false, height: 0.8, thickness: 0.2, posts: false, postSpacing: 2 },
  });
  const hasPt = (q: Vec3) => jp.some((p) => p.grid.some((row) => row.some(
    (v) => Math.abs(v[0] - q[0]) < 1e-9 && Math.abs(v[1] - q[1]) < 1e-9 && Math.abs(v[2] - q[2]) < 1e-9,
  )));
  let missing = 0;
  for (const leg of legs) {
    for (const k of ['point', 'roadL', 'roadR', 'curbL', 'curbR', 'paveL', 'paveR', 'botL', 'botR'] as const) {
      if (!hasPt(leg[k])) { missing++; console.error(`  missing ${leg.splineId}.${k}`); }
    }
  }
  if (missing > 0) fail(`merged junction missing ${missing} shared boundary points`);
  else ok('merged junction shares all approach sections exactly');
  console.log(`  junction patches: ${jp.length}, tris: ${ct(jp)}`);
}

// 5. OBJ export sanity
const obj = networkToObj(net, 'test');
const vCount = (obj.match(/^v /gm) || []).length;
const fCount = (obj.match(/^f /gm) || []).length;
console.log(`obj: ${vCount} verts, ${fCount} faces`);
if (vCount < 1000 || fCount < 1000) fail('obj too small');
else ok('obj export');

// 6. gizmo pointer math (Slate port)
{
  const p1 = alongAxisUnderRay([1, 0, 0], [0, 0, 0], [3, 5, 0], [0, -1, 0]);
  if (Math.abs(p1 - 3) > 1e-9) fail(`axis param: ${p1}`);
  else ok('axis param under ray');
  const inv = 1 / Math.sqrt(2);
  const p0 = alongAxisUnderRay([1, 0, 0], [0, 0, 0], [0, 5, 5], [0, -inv, -inv]);
  if (Math.abs(p0) > 1e-9) fail(`axis param origin: ${p0}`);
  else ok('axis param at origin');
  const t = touchPlaneUnderRay([0, 1, 0], [0, 0, 0], [1, 5, 2], [0, -1, 0]);
  if (!t || Math.abs(t[0] - 1) > 1e-9 || Math.abs(t[1]) > 1e-9 || Math.abs(t[2] - 2) > 1e-9) fail(`plane touch: ${t}`);
  else ok('plane touch under ray');
  if (touchPlaneUnderRay([0, 1, 0], [0, 0, 0], [0, 5, 0], [1, 0, 0]) !== null) fail('parallel ray should miss');
  else ok('parallel ray miss');
  if (snapStep(0.4, 0.25) !== 0.5 || snapStep(0.1, 0.25) !== 0 || snapStep(-0.4, 0.25) !== -0.5) fail('snap steps');
  else ok('snap steps');
}

console.log(process.exitCode === 1 ? 'GEO TEST: FAILED' : 'GEO TEST: PASSED');
