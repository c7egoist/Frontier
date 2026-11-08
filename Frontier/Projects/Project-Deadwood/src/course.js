// Shared, engine-independent metre-scale greybox contract. +Z is forward, +Y is up.
export const COURSE = Object.freeze({ length: 2200, maxSpeed: 44, carRadius: 1.2, seed: 7419,
  destination: { x: 900, z: 2600, length: 520 }, pursuitSpeed: 26, pursuitDelay: 8 });
export const BEATS = [
  { start: 0, end: 360, name: 'The threshold', note: 'Read the ground. The first roots wake ahead.', width: 29 },
  { start: 360, end: 820, name: 'The broken reach', note: 'Scattered eruptions. Read the soil, not a pattern.', width: 25 },
  { start: 820, end: 1260, name: 'The old heart', note: 'Split around the dead giant. Both sides reconnect.', width: 33 },
  { start: 1260, end: 1810, name: 'The strangle', note: 'Branching growth closes in. Find a way through.', width: 23 },
  { start: 1810, end: 2200, name: 'Last light', note: 'One final weave. The stone gate is ahead.', width: 28 }
];
export function rng(seed) { let n = seed >>> 0; return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const centerX = z => 44 * Math.sin(z / 235) + 23 * Math.sin(z / 103);
export const groundY = z => 2.8 * Math.sin(z / 175) + 1.7 * Math.sin(z / 72);
export const tangent = z => Math.atan2(centerX(z + 1) - centerX(z - 1), 2);
export const beatAt = z => BEATS.find(b => z < b.end) || BEATS.at(-1);
export function widthAt(z) {
  const b = beatAt(z), next = BEATS[BEATS.indexOf(b) + 1];
  return next && z > b.end - 70 ? b.width + (next.width - b.width) * ((z - b.end + 70) / 70) : b.width;
}
// Unpaired, area-distributed root systems. No rows, mirrored sides, or reserved sine-wave lane.
export const ROOT_LIMITS = Object.freeze({ systems: 90, branches: 18 });
function vector(random, length, elevation, azimuth) {
  const flat = Math.sqrt(1 - elevation * elevation) * length;
  return { x: Math.cos(azimuth) * flat, y: elevation * length, z: Math.sin(azimuth) * flat };
}
export function createRoot(random, id, z, x = centerX(z) + (random() * 2 - 1) * widthAt(z) * .96) {
  const vertical = random() < .46, angle = random() * Math.PI * 2;
  const root = { id, generation: 0, x, z, age: -1, wait: 0,
    delay: -Math.log(Math.max(.001, random())) * 2.5,
    activationDistance: 35 + random() * 235, warning: .65 + random() * .7,
    preGrown: z > 250 && random() < .12, phase: random() * Math.PI * 2,
    thickness: .7 + random() * 1.1, previewAge: random() * 24 - 14, branches: [] };
  const add = (parent, attach, length, elevation, azimuth, depth) => {
    const p = parent < 0 ? null : root.branches[parent];
    const direction = vector(random, length, elevation, azimuth);
    const curl = (random() * 2 - 1) * length * .8;
    const branch = { parent, attach, depth, length, duration: 1.7 + random() * 3.3,
      delay: p ? p.delay + p.duration * attach + .12 + random() * .8 : 0,
      phase: random() * Math.PI * 2,
      p1: { x: direction.x * .28, y: direction.y * .45, z: direction.z * .28 },
      p2: { x: direction.x * .7 + Math.sin(azimuth) * curl,
        y: direction.y * .8 + length * (.12 + random() * .42),
        z: direction.z * .7 - Math.cos(azimuth) * curl },
      end: { x: direction.x, y: Math.max(.2, direction.y + (random() - .5) * length * .4), z: direction.z } };
    root.branches.push(branch); return root.branches.length - 1;
  };
  add(-1, 0, 10 + random() * 14, vertical ? .92 + random() * .075 : .2 + random() * .55, angle, 0);
  const count = 3 + Math.floor(random() * 3);
  for (let i = 0; i < count; i++) {
    const feeder = i < 2;
    const index = add(0, feeder ? .025 + random() * .08 : .22 + random() * .55,
      6 + random() * 11, feeder ? .025 + random() * .12 : .15 + random() * .65,
      angle + (random() * 2 - 1) * Math.PI, 1);
    for (let j = 0; j < 1 + Math.floor(random() * 2); j++)
      add(index, .3 + random() * .45, 3 + random() * 7, .05 + random() * .8, random() * Math.PI * 2, 2);
  }
  return root;
}
export function createHazards(seed = COURSE.seed, count = ROOT_LIMITS.systems) {
  const random = rng(seed), roots = [];
  for (let i = 0; i < count; i++) {
    // Independent uniform sites plus loose clusters, not one root per fixed distance.
    let z = 105 + random() * 2020;
    if (i > 0 && random() < .34) z = clamp(roots[Math.floor(random() * roots.length)].z + (random() - .5) * 75, 105, 2125);
    roots.push(createRoot(random, i, z));
  }
  return roots;
}
export function effectiveRootAge(root, age = root.age) {
  return age < 0 && !root.preGrown ? -1 : Math.max(0, age) + (root.preGrown ? 11 : 0) - root.warning;
}
export function rootProgress(root) {
  const age = effectiveRootAge(root);
  return Math.max(0, Math.min(1, age / 3.2)) + .24 * Math.log1p(Math.max(0, age - 3.2) / 7);
}
const directors = new WeakMap();
export function advanceHazards(roots, z, dt, { rate = 1, growth = 1, recycle = true, dynamic = true } = {}) {
  // Independent renewal process: new ground eruptions can occur even while the car stands still.
  // Reuse dormant, distant sites; never make an existing visible tree disappear to free a slot.
  if(dynamic && rate > 0 && z < 2050 && roots.length){
    let director=directors.get(roots);
    if(!director){director={remaining:1.2,random:rng(Math.floor(roots[0].phase*100000)+137)};directors.set(roots,director);}
    director.remaining-=dt*rate;
    for(let events=0;director.remaining<=0&&events<8;events++){
      const random=director.random;
      director.remaining+=.15-Math.log(Math.max(.001,random()))*2.6;
      const candidates=roots.filter(r=>r.age<0&&!r.preGrown&&Math.abs(r.z-z)>340);
      if(candidates.length){
        const root=candidates[Math.floor(random()*candidates.length)],generation=root.generation+1;
        const nextZ=clamp(z-40+random()*290,45,2130);
        Object.assign(root,createRoot(random,root.id,nextZ),{generation,age:0,preGrown:false});
      }
    }
  }
  for (const root of roots) {
    if (recycle && root.z < z - 340) {
      const generation = root.generation + 1;
      const random = rng(COURSE.seed + root.id * 971 + generation * 7919);
      const nextZ = clamp(z - 35 + random() * 290, 100, 2130);
      if (z < 2050) Object.assign(root, createRoot(random, root.id, nextZ), { generation, preGrown: false });
    }
    if (root.age < 0 && z > root.z - root.activationDistance) {
      root.wait += dt * rate;
      if (rate > 0 && root.wait >= root.delay) root.age = 0;
    }
    if (root.age >= 0) root.age += dt * growth;
  }
}
function curvePoint(frame, t) {
  const v = 1 - t, a = 3 * v * v * t, b = 3 * v * t * t, c = t * t * t;
  return { x: frame.origin.x + a * frame.p1.x + b * frame.p2.x + c * frame.end.x,
    y: frame.origin.y + a * frame.p1.y + b * frame.p2.y + c * frame.end.y,
    z: frame.origin.z + a * frame.p1.z + b * frame.p2.z + c * frame.end.z };
}
export function branchPoint(frame, u) { return curvePoint(frame, u * frame.progress); }
export function rootFrames(root, time, age = root.age) {
  const elapsed = effectiveRootAge(root, age), frames = [];
  for (const branch of root.branches) {
    const localAge = elapsed - branch.delay;
    const progress = clamp(localAge / branch.duration, 0, 1);
    // Extension and girth continue increasing after the first eruption; no mature-size plateau.
    const stretch = 1 + .3 * Math.log1p(Math.max(0, localAge - branch.duration) / 6);
    const girth = .06 + root.thickness * Math.pow(.57, branch.depth) * progress * (1 + .48 * Math.log1p(Math.max(0, localAge) / 8));
    const parent = frames[branch.parent];
    const origin = parent ? curvePoint(parent, branch.attach) : { x: root.x, y: groundY(root.z) - .65, z: root.z };
    const visible = progress > 0 && (!parent || (parent.visible && parent.progress >= branch.attach));
    const twist = Math.sin(time * .24 + branch.phase) * .19;
    const rotate = p => ({ x: (p.x * Math.cos(twist) - p.z * Math.sin(twist)) * stretch,
      y: p.y * stretch, z: (p.z * Math.cos(twist) + p.x * Math.sin(twist)) * stretch });
    frames.push({ origin, p1: rotate(branch.p1), p2: rotate(branch.p2), end: rotate(branch.end), progress, girth, visible,
      nodes: root.branches.filter(b => b.parent === frames.length).map(b => b.attach) });
  }
  return frames;
}
export function rootPoint(root, u, time) { return branchPoint(rootFrames(root, time)[0], u); }
export function rootRadius(frame, u) {
  const t = u * frame.progress;
  let knot = 1;
  for (const node of frame.nodes) knot += .28 * Math.exp(-Math.pow((t - node) / .045, 2));
  return (.025 + frame.girth * Math.pow(Math.max(.025, 1 - t), .75)) * knot;
}
export function distanceToSegment2D(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(px - a.x - t * dx, pz - a.z - t * dz);
}
export function collidesRoot(x, z, roots, time) {
  for (const root of roots) {
    if (effectiveRootAge(root) <= 0) continue;
    const reach = 85 * (1 + .3 * Math.log1p(Math.max(0, root.age) / 6));
    if (Math.abs(root.z - z) > reach || Math.abs(root.x - x) > reach) continue;
    const surface = groundY(z);
    for (const frame of rootFrames(root, time)) {
      if (!frame.visible) continue;
      let a = branchPoint(frame, 0);
      for (let j = 1; j <= 14; j++) {
        const b = branchPoint(frame, j / 14), r = rootRadius(frame, (j - 1) / 14);
        if (Math.min(a.y, b.y) - r < surface + 2 && Math.max(a.y, b.y) + r > surface + .25 && distanceToSegment2D(x, z, a, b) < r + COURSE.carRadius) return true;
        a = b;
      }
    }
  }
  return false;
}
export function portalCrossing(previous, next, x, world = 0) {
  return world === 0 && previous < COURSE.length && next >= COURSE.length && Math.abs(x - centerX(COURSE.length)) < 10;
}
export function minimumRunSeconds() { return COURSE.length / COURSE.maxSpeed; }
