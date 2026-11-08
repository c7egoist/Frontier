import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE, BEATS, ROOT_LIMITS, centerX, groundY, tangent, widthAt, rng, createRoot, createHazards, advanceHazards, rootProgress, rootFrames, branchPoint, collidesRoot, portalCrossing, minimumRunSeconds } from '../src/course.js';
import { stepVehicle } from '../src/vehicle.js';

test('the one-way route still requires at least 50 seconds at maximum speed', () => {
  assert.equal(BEATS[0].start, 0); assert.equal(BEATS.at(-1).end, COURSE.length);
  BEATS.slice(1).forEach((b, i) => assert.equal(b.start, BEATS[i].end));
  assert.equal(minimumRunSeconds(), 50);
});
test('scattered sites are repeatable but have no paired rows or reserved lateral lane', () => {
  const roots = createHazards(); assert.deepEqual(roots, createHazards()); assert.notDeepEqual(roots, createHazards(12));
  assert.equal(roots.length, ROOT_LIMITS.systems); assert.equal(new Set(roots.map(r => r.z)).size, roots.length);
  assert.ok(roots.some(r => Math.abs(r.x - centerX(r.z)) < 3));
  assert.ok(roots.some(r => r.x - centerX(r.z) > 18)); assert.ok(roots.some(r => r.x - centerX(r.z) < -18));
  const zs = roots.map(r => r.z).sort((a,b) => a-b), gaps = zs.slice(1).map((z,i) => z-zs[i]);
  assert.ok(Math.min(...gaps) < 2); assert.ok(Math.max(...gaps) > 70);
  assert.ok(new Set(roots.map(r => Math.floor(r.activationDistance))).size > 40);
});
test('vertical and angled stems have varied multi-level forks and parent nodes', () => {
  const roots = createHazards(); let vertical = 0, angled = 0;
  for (const r of roots) {
    assert.ok(r.branches.length >= 7 && r.branches.length <= ROOT_LIMITS.branches);
    const stem = r.branches[0], slope = stem.p1.y / Math.hypot(stem.p1.x, stem.p1.y, stem.p1.z);
    if (slope > .95) vertical++; if (slope < .8) angled++;
    r.branches.slice(1).forEach((b,i) => { assert.ok(b.parent <= i); assert.ok(b.attach > 0 && b.attach < 1); assert.ok(b.delay > r.branches[b.parent].delay); });
    assert.ok(r.branches.some(b => b.depth === 2));
  }
  assert.ok(vertical > 15 && angled > 15);
});
test('subterranean start, individual warnings, then continuous length and girth growth', () => {
  const r = createRoot(rng(24), 0, 140, centerX(140)); r.preGrown = false; r.age = 0;
  let f = rootFrames(r, 0)[0]; assert.equal(f.visible, false); assert.ok(f.origin.y < groundY(r.z));
  r.age = r.warning * .5; assert.equal(rootProgress(r), 0);
  r.age = r.warning + .4; assert.ok(rootProgress(r) > 0 && rootProgress(r) < 1);
  r.age = 14; const a = rootFrames(r, 10)[0];
  r.age = 90; const b = rootFrames(r, 10)[0];
  assert.ok(b.girth > a.girth * 1.25); assert.ok(Math.hypot(b.end.x,b.end.y,b.end.z) > Math.hypot(a.end.x,a.end.y,a.end.z)); assert.ok(rootProgress(r) > 1);
});
test('every child stays welded to its moving, growing parent node; coordinates remain finite', () => {
  for (const root of createHazards(912, 20)) for (const age of [.5, 2, 6, 20, 120]) {
    root.age = age;
    for (const time of [0, 2, 20]) {
      const frames = rootFrames(root, time);
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i], b = root.branches[i];
        if (f.visible && b.parent >= 0) {
          const p = frames[b.parent]; assert.ok(p.progress >= b.attach);
          const node = branchPoint(p, b.attach / p.progress);
          assert.ok(Math.hypot(node.x-f.origin.x,node.y-f.origin.y,node.z-f.origin.z) < 1e-7);
        }
        for (const u of [0,.25,.5,.75,1]) for (const v of Object.values(branchPoint(f,u))) assert.ok(Number.isFinite(v));
      }
    }
  }
});
test('independent births continue while stationary and frequency zero suppresses new eruptions', () => {
  const roots = createHazards(), frozen = createHazards(); let lateBirth = false;
  for (let t = 0; t < 35; t += .1) {
    const before = roots.map(r => r.generation);
    advanceHazards(roots, 400, .1);
    advanceHazards(frozen, 400, .1, { rate: 0 });
    if (t > 15 && roots.some((r,i) => r.generation > before[i])) lateBirth = true;
  }
  assert.ok(lateBirth); assert.ok(frozen.every(r => r.age === -1));
  assert.ok(roots.some(r => r.generation > 0 && r.z < 400));
});
test('scheduling and recycling stay deterministic, bounded and independent of rendering', () => {
  const a = createHazards(91), b = createHazards(91);
  for (let t = 0; t < 75; t += .1) { advanceHazards(a,t*30,.1,{rate:2}); advanceHazards(b,t*30,.1,{rate:2}); }
  assert.deepEqual(a,b); assert.equal(a.length,90); assert.ok(a.some(r => r.generation > 0));
});
test('growing root bases and low branching limbs use actual collision; dormant roots do not', () => {
  const r = createHazards()[0]; r.preGrown = false; r.age = -1;
  assert.equal(collidesRoot(r.x,r.z,[r],0),false);
  r.age = 30; assert.equal(collidesRoot(r.x,r.z,[r],0),true);
  const before = rootFrames(r,0)[0]; r.age = 90; const after = rootFrames(r,0)[0];
  assert.ok(after.girth > before.girth); assert.equal(collidesRoot(r.x + after.girth * .7,r.z,[r],0),true);
});
test('a zero-throttle car is not teleported by the new root model', () => {
  const car = { x:centerX(0),z:0,speed:0,heading:tangent(0) };
  for(let i=0;i<100;i++)stepVehicle(car,{},1/90);
  assert.equal(car.z,0); assert.equal(car.x,centerX(0));
});
test('portal is directional, width-bounded, and can fire only in forest world', () => {
  const x=centerX(2200);assert.ok(portalCrossing(2199,2201,x));assert.ok(!portalCrossing(2201,2199,x));
  assert.ok(!portalCrossing(2199,2201,x+11));assert.ok(!portalCrossing(2199,2201,x,1));
});
