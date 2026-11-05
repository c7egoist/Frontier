import * as THREE from 'three';
import {
  makePetalGeometry, xform, mergeGeometries, bakeSway, TubeRibbon,
} from './geometry.js';
import {
  petalMaterial, columnMaterial, antherMaterial, filamentMaterial, leafMaterial,
} from './materials.js';

// ---------------------------------------------------------------------------
// Flower blueprints. Flower frame: +Z is the facing direction, petals radiate around it.
// Both decoys and predators are built from these, so a dormant predator is visually identical.

const PI = Math.PI;

export function organBlueprint(species, L, rng) {
  const out = [];
  const add = (role, preset, phi, alpha, geo) => out.push({ role, preset, phi, alpha, geo: { seed: rng.int(1, 999), ...geo } });
  const j = (a = 0.05) => rng.range(-a, a);
  if (species === 'orchid') {
    // two broad lateral petals
    [0, PI].forEach((phi, i) => add('petal', 'orchidPetal', phi + j(0.06), 1.42 + j(), {
      length: L * 0.98, width: L * 1.22, peak: 0.56, tipPow: 0.48, curl: 0.5, cup: 0.14, ruffle: 0.016, ruffleFreq: 4.5,
      twist: i ? -0.1 : 0.1, segU: 22, segV: 14,
    }));
    add('sepal', 'orchidSepal', PI / 2 + j(0.05), 1.72 + j(), {
      length: L * 1.02, width: L * 0.66, peak: 0.52, tipPow: 0.62, curl: 0.62, cup: 0.2, ruffle: 0.014, segU: 20, segV: 12,
    });
    [-1, 1].forEach((s) => add('sepal', 'orchidSepal', -PI / 2 + s * 0.62 + j(0.05), 1.78 + j(), {
      length: L * 0.96, width: L * 0.62, peak: 0.52, tipPow: 0.62, curl: 0.6, cup: 0.2, ruffle: 0.014, segU: 20, segV: 12,
    }));
    add('lip', 'orchidLip', -PI / 2, 1.0, {
      length: L * 0.56, width: L * 0.5, peak: 0.6, tipPow: 0.8, curl: 0.15, recurve: 0.9, cup: 0.35, ruffle: 0.03, segU: 16, segV: 12,
    });
    add('callus', 'orchidInner', -PI / 2 + 0.25, 0.55, { length: L * 0.22, width: L * 0.12, curl: 0.7, cup: 0.6, segU: 8, segV: 6 });
    add('callus', 'orchidInner', -PI / 2 - 0.25, 0.55, { length: L * 0.22, width: L * 0.12, curl: 0.7, cup: 0.6, segU: 8, segV: 6 });
  } else {
    for (let k = 0; k < 5; k++) {
      const phi = (k / 5) * 2 * PI + PI / 2 + j(0.06);
      add('petal', 'lilyPetal', phi, 1.12 + j(0.08), {
        length: L, width: L * 0.92, peak: 0.5, tipPow: 0.62, curl: 0.95, recurve: 1.0, cup: 0.42, ruffle: 0.022, ruffleFreq: 5,
        twist: (k % 2 ? 1 : -1) * 0.18, segU: 24, segV: 14,
      });
    }
    for (let k = 0; k < 5; k++) {
      const phi = ((k + 0.5) / 5) * 2 * PI + PI / 2 + j(0.06);
      add('under', 'lilyPetalPale', phi, 1.52 + j(0.08), {
        length: L * 0.96, width: L * 0.82, peak: 0.5, tipPow: 0.6, curl: 0.8, recurve: 0.6, cup: 0.35, ruffle: 0.02, segU: 20, segV: 12,
      });
    }
    for (let k = 0; k < 5; k++) {
      const phi = ((k + 0.5) / 5) * 2 * PI + PI / 2 + j(0.06);
      add('sepal', 'lilySepal', phi, 2.0 + j(0.08), {
        length: L * 0.72, width: L * 0.34, peak: 0.45, tipPow: 0.9, curl: 0.5, recurve: 0.2, cup: 0.3, ruffle: 0.01, segU: 14, segV: 8,
      });
    }
  }
  return out;
}

export function organQuat(phi, alpha) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2 - alpha, 0, phi - PI / 2, 'ZXY'));
}

// ---------------------------------------------------------------------------
// Tendrils (lily filaments). Computed in flower-local space, shared by decoys & predators.
const Zaxis = new THREE.Vector3(0, 0, 1);
const _k = new THREE.Vector3(), _kd = new THREE.Vector3(), _d = new THREE.Vector3(), _d0 = new THREE.Vector3(), _tg = new THREE.Vector3();
function rotAbout(d, k, th) {
  const c = Math.cos(th), s = Math.sin(th);
  _kd.crossVectors(k, d);
  const kd = k.dot(d) * (1 - c);
  d.set(d.x * c + _kd.x * s + k.x * kd, d.y * c + _kd.y * s + k.y * kd, d.z * c + _kd.z * s + k.z * kd).normalize();
}

/**
 * p: { az, tilt, len, c1, c2, base, phase, t, reach, target (local unit Vector3|null), lash, segs }
 * Writes p.segs+1 Vector3s into `out`.
 */
export function tendrilPoints(out, p) {
  const segs = out.length - 1;
  const reach = p.reach || 0;
  _d0.set(Math.sin(p.tilt) * Math.cos(p.az), Math.sin(p.tilt) * Math.sin(p.az), Math.cos(p.tilt));
  _d.copy(_d0);
  if (p.target && reach > 0) _d.lerp(p.target, reach).normalize();
  _k.crossVectors(_d, Zaxis);
  if (_k.lengthSq() < 1e-6) _k.set(1, 0, 0);
  _k.normalize();
  const t = p.t || 0;
  const curlScale = 1 - 0.9 * reach;
  const len = p.len * (1 + 0.55 * reach);
  const ds = len / segs;
  out[0].set(Math.cos(p.az) * p.base, Math.sin(p.az) * p.base, p.base * 0.4);
  _tg.copy(_d);
  for (let i = 1; i <= segs; i++) {
    const s = (i - 0.5) / segs;
    let kappa = (p.c1 + p.c2 * s * s * s) * curlScale;
    kappa += Math.sin(t * 1.3 + p.phase + s * 4.0) * 0.6 * (1 - reach) * s; // idle breathing
    kappa += (p.lash || 0) * Math.sin(t * 11 - s * 8 + p.phase) * 2.2 * s;
    rotAbout(_tg, _k, kappa / segs);
    // helical drift gives the curls a spiral rather than planar look
    rotAbout(_tg, Zaxis, (p.swirl || 0) * s / segs);
    out[i].copy(out[i - 1]).addScaledVector(_tg, ds);
  }
  return out;
}

export function stamenBlueprint(L, rng, N = 16) {
  const list = [];
  for (let i = 0; i < N; i++) {
    list.push({
      az: (i / N) * PI * 2 + rng.range(-0.15, 0.15),
      tilt: rng.range(0.25, 0.95),
      len: L * rng.range(0.75, 1.5),
      c1: rng.range(-1.1, -0.2),
      c2: rng.range(3.2, 6.0),
      swirl: rng.range(-4, 4),
      base: L * 0.05,
      phase: rng.range(0, 6.28),
      r0: L * 0.017,
    });
  }
  return list;
}

// ---------------------------------------------------------------------------
function placeMatrix(phi, alpha, pos) {
  return new THREE.Matrix4().compose(pos || new THREE.Vector3(), organQuat(phi, alpha), new THREE.Vector3(1, 1, 1));
}

const meshOf = (geo, mat, { cast = true, receive = true } = {}) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
};

function organMaterial(preset) {
  if (preset.startsWith('leaf')) return leafMaterial(preset);
  return petalMaterial(preset, preset === 'orchidLip' ? { trans: 0.5 } : {});
}

function columnParts(species, L) {
  const geos = [];
  if (species === 'orchid') {
    const col = new THREE.CapsuleGeometry(L * 0.055, L * 0.22, 4, 10);
    col.rotateX(PI / 2);
    xform(col, { pos: new THREE.Vector3(0, -L * 0.02, L * 0.12) });
    const cap = new THREE.SphereGeometry(L * 0.065, 12, 8);
    xform(cap, { pos: new THREE.Vector3(0, -L * 0.03, L * 0.27), scale: new THREE.Vector3(1, 0.8, 1) });
    return { column: [col, cap] };
  }
  const pistil = new THREE.CylinderGeometry(L * 0.025, L * 0.075, L * 0.4, 8, 1);
  pistil.rotateX(PI / 2); pistil.translate(0, 0, L * 0.2);
  return { column: [pistil] };
}

/** Static merged flower (decoys, side blooms). Returns a Group with +Z facing. */
export function buildStaticFlower(species, L, rng, { sway = 0.1, withStamens = true } = {}) {
  const g = new THREE.Group();
  const organs = organBlueprint(species, L, rng);
  const byPreset = new Map();
  for (const o of organs) {
    const geo = makePetalGeometry(o.geo);
    geo.applyMatrix4(placeMatrix(o.phi, o.alpha));
    if (!byPreset.has(o.preset)) byPreset.set(o.preset, []);
    byPreset.get(o.preset).push(geo);
  }
  for (const [preset, geos] of byPreset) {
    const merged = mergeGeometries(geos, false);
    bakeSway(merged, sway);
    g.add(meshOf(merged, organMaterial(preset)));
  }
  const cp = columnParts(species, L);
  const colGeos = cp.column.map((x) => x.toNonIndexed ? x : x);
  const colMerged = mergeGeometries(colGeos.map((x) => { const y = x.index ? x.toNonIndexed() : x; y.deleteAttribute('uv'); return y; }), false);
  colMerged.computeVertexNormals();
  bakeSway(colMerged, sway);
  g.add(meshOf(colMerged, species === 'orchid' ? columnMaterial() : filamentMaterial()));

  if (species === 'lily' && withStamens) {
    const st = stamenBlueprint(L, rng);
    const tubes = [], anth = [];
    const pts = Array.from({ length: 13 }, () => new THREE.Vector3());
    for (const s of st) {
      tendrilPoints(pts, { ...s, t: 0, reach: 0 });
      const tr = new TubeRibbon(12, 5);
      tr.update(pts, (i) => s.r0 * (1 - 0.55 * i / 12) );
      const tg = tr.geometry; tg.deleteAttribute('aSway'); tubes.push(tg);
      const a = new THREE.SphereGeometry(L * 0.032, 8, 6);
      const last = pts[12], prev = pts[11];
      const dir = last.clone().sub(prev).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      xform(a, { pos: last.clone(), quat: q, scale: new THREE.Vector3(1, 2.4, 1) });
      a.deleteAttribute('uv'); anth.push(a);
    }
    const fm = mergeGeometries(tubes, false); bakeSway(fm, sway * 1.4); g.add(meshOf(fm, filamentMaterial()));
    const am = mergeGeometries(anth.map((x) => (x.index ? x.toNonIndexed() : x)), false); bakeSway(am, sway * 1.4);
    g.add(meshOf(am, antherMaterial('lily')));
    // short orange stamen cluster at the heart (as in the reference)
    const short = [];
    for (let i = 0; i < 14; i++) {
      const az = rng.range(0, PI * 2), tilt = rng.range(0.05, 0.5);
      const ps = Array.from({ length: 7 }, () => new THREE.Vector3());
      tendrilPoints(ps, { az, tilt, len: L * rng.range(0.28, 0.45), c1: rng.range(-0.3, 0.6), c2: rng.range(0.5, 2), base: L * 0.04, phase: 0, t: 0, reach: 0, swirl: 0 });
      const tr = new TubeRibbon(6, 5); tr.update(ps, (i2) => L * 0.01 * (1 - 0.4 * i2 / 6));
      const tg = tr.geometry; tg.deleteAttribute('aSway'); short.push(tg);
      const a = new THREE.SphereGeometry(L * 0.02, 8, 6); xform(a, { pos: ps[6].clone(), scale: new THREE.Vector3(1, 1.8, 1) }); a.deleteAttribute('uv'); short.push(a.toNonIndexed());
    }
    const sm = mergeGeometries(short.map((x) => { const y = x.index ? x.toNonIndexed() : x; if (y.attributes.uv) y.deleteAttribute('uv'); return y; }), false);
    bakeSway(sm, sway); sm.computeVertexNormals();
    g.add(meshOf(sm, antherMaterial('lily')));
  }
  return g;
}

/**
 * Animated flower for predators: each organ is its own mesh on a pivot so petals can open / flare.
 * Returns { group, organs:[{pivot, mesh, phi, alpha0, role}], column }
 */
export function buildAnimatedFlower(species, L, rng) {
  const group = new THREE.Group();
  const organs = [];
  for (const o of organBlueprint(species, L, rng)) {
    const geo = makePetalGeometry(o.geo);
    bakeSway(geo, 0); // sway is applied on the CPU for predators
    const mesh = meshOf(geo, organMaterial(o.preset));
    const pivot = new THREE.Group();
    pivot.rotation.order = 'ZXY';
    pivot.rotation.set(PI / 2 - o.alpha, 0, o.phi - PI / 2);
    pivot.add(mesh);
    group.add(pivot);
    organs.push({ pivot, mesh, phi: o.phi, alpha0: o.alpha, role: o.role, flutter: rng.range(0, 6.28) });
  }
  const cp = columnParts(species, L);
  const cg = new THREE.Group();
  for (const geo of cp.column) {
    bakeSway(geo, 0);
    cg.add(meshOf(geo, species === 'orchid' ? columnMaterial() : filamentMaterial()));
  }
  group.add(cg);
  return { group, organs, column: cg };
}

// ---------------------------------------------------------------------------
export function budGeometry(L, sway) {
  const g = new THREE.SphereGeometry(L * 0.28, 12, 10);
  xform(g, { scale: new THREE.Vector3(0.85, 1.5, 0.85), pos: new THREE.Vector3(0, L * 0.28 * 1.5, 0) });
  g.deleteAttribute('uv');
  const out = g.index ? g.toNonIndexed() : g;
  return bakeSway(out, sway);
}
