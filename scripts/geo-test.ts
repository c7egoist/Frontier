// Headless geometry smoke test: node --experimental-strip-types? No — run via tsx.
import { demoProject, migrateProject } from '../src/lib/model';
import { buildNetwork } from '../src/lib/network';
import { countTriangles } from '../src/lib/roadGeometry';
import { networkToObj } from '../src/lib/exportObj';
import { buildFrames } from '../src/lib/roadGeometry';
import { Vec3 } from '../src/lib/vec';

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
// fold-back regression: spans must never exceed their pair curves
const causeway = net.spans.find((s) => project.splines.find((x) => x.id === s.splineId)?.name === 'Causeway');
if (!causeway || causeway.length > 12) fail(`causeway span wrong: ${causeway?.length}`);
else ok('no fold-back at straight join');
const northMax = Math.max(...net.spans.filter((s) => project.splines.find((x) => x.id === s.splineId)?.name === 'North Avenue').map((s) => s.length));
if (northMax > 10.5) fail(`north span too long: ${northMax}`);
else ok('junction-adjacent spans trimmed, not folded');
if (!net.spans.some((s) => s.kind === 'beam')) fail('expected a beam span');
else ok('beam span present');
if (tris < 5000) fail(`suspiciously low tri count: ${tris}`);
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

// 4. OBJ export sanity
const obj = networkToObj(net, 'test');
const vCount = (obj.match(/^v /gm) || []).length;
const fCount = (obj.match(/^f /gm) || []).length;
console.log(`obj: ${vCount} verts, ${fCount} faces`);
if (vCount < 1000 || fCount < 1000) fail('obj too small');
else ok('obj export');

console.log(process.exitCode === 1 ? 'GEO TEST: FAILED' : 'GEO TEST: PASSED');
