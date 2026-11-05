import * as THREE from 'three';
import { Rng, swayAmp, terrainHeight } from '../util/noise.js';
import {
  makePetalGeometry, xform, basisQuat, lookQuat, mergeGeometries, bakeSway, buildTubeGeometry,
  makeThornGeometry,
} from './geometry.js';
import { buildStaticFlower, budGeometry } from './flowers.js';
import { stemMaterial, leafMaterial, thornMaterial, petalMaterial } from './materials.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Shared by decoys and predators: stem control points, terminal flower size and facing. */
export function plantLayout(species, rng, H, yaw) {
  const out = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const v = (o, y, s = 0) => out.clone().multiplyScalar(o * H).add(new THREE.Vector3(0, y * H, 0)).addScaledVector(side, s * H);
  let P, face, L;
  if (species === 'orchid') {
    const w = rng.range(-0.08, 0.08);
    P = [v(0, 0), v(0.04, 0.55, w), v(0.30, 1.02, w * 2), v(0.55, 0.9, w * 2)];
    face = out.clone().multiplyScalar(0.95).addScaledVector(UP, 0.18).normalize();
    L = H * 0.31;
  } else {
    const w = rng.range(-0.1, 0.1);
    P = [v(0, 0), v(0.1, 0.5, w), v(0.36, 1.06, w * 2), v(0.46, 0.82, w * 2)];
    face = out.clone().multiplyScalar(0.8).addScaledVector(UP, 0.55).normalize();
    L = H * 0.3;
  }
  // end tangent follows the flower's facing so the bloom sits naturally on its stem
  P[2] = P[3].clone().addScaledVector(face, -H * (species === 'orchid' ? 0.3 : 0.32));
  return { P, face, L, H, yaw, species };
}

export function bezier(P, t, out = new THREE.Vector3()) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return out.set(
    P[0].x * a + P[1].x * b + P[2].x * c + P[3].x * d,
    P[0].y * a + P[1].y * b + P[2].y * c + P[3].y * d,
    P[0].z * a + P[1].z * b + P[2].z * c + P[3].z * d
  );
}

export function stemRadius(species, H, t) {
  const r0 = H * (species === 'orchid' ? 0.036 : 0.04), r1 = H * (species === 'orchid' ? 0.014 : 0.017);
  return r0 + (r1 - r0) * Math.pow(t, 0.8);
}

/** Side bloom positions along the stem (shared with predators). */
export function sideFlowerSlots(species, rng, H, L) {
  const slots = [];
  if (species === 'orchid') {
    const n = Math.max(2, Math.round(H / 2.6));
    for (let k = 0; k < n; k++) {
      const t = 0.42 + 0.48 * (k / n);
      slots.push({ t, side: k % 2 ? 1 : -1, L: L * (0.78 - 0.42 * (k / n)) * rng.range(0.92, 1.05), kind: 'flower', jitter: rng.range(-0.3, 0.3) });
    }
    // buds toward the tip
    for (let k = 0; k < 3; k++) slots.push({ t: 0.9 + 0.035 * k, side: k % 2 ? 1 : -1, L: L * (0.22 - 0.04 * k), kind: 'bud', jitter: 0 });
  } else {
    const n = Math.max(1, Math.round(H / 4.5));
    for (let k = 0; k < n; k++) slots.push({ t: 0.5 + 0.28 * (k / n), side: k % 2 ? 1 : -1, L: L * rng.range(0.38, 0.5), kind: 'flower', jitter: rng.range(-0.3, 0.3) });
    for (let k = 0; k < 4; k++) slots.push({ t: 0.55 + 0.1 * k, side: k % 2 ? -1 : 1, L: L * rng.range(0.22, 0.3), kind: 'bud', jitter: 0 });
  }
  return slots;
}

/** Build the transform for a slot from a stem frame. Returns { pos, quat, face }. */
export function slotTransform(slot, p, T, species) {
  let S = new THREE.Vector3().crossVectors(T, UP);
  if (S.lengthSq() < 1e-4) S.set(1, 0, 0);
  S.normalize().multiplyScalar(slot.side);
  const face = S.clone().multiplyScalar(0.85).addScaledVector(UP, species === 'orchid' ? 0.28 : 0.5).addScaledVector(T, slot.jitter).normalize();
  const pos = p.clone().addScaledVector(face, slot.L * 0.55);
  return { pos, quat: lookQuat(face, UP), face };
}

export function buildSideBloom(species, slot, rng, sway) {
  const g = new THREE.Group();
  if (slot.kind === 'bud') {
    const geo = budGeometry(slot.L, sway);
    const m = new THREE.Mesh(geo, petalMaterial(species === 'orchid' ? 'orchidSepal' : 'lilyPetalPale'));
    m.rotation.x = Math.PI / 2; // grow along +Z
    m.castShadow = true;
    g.add(m);
    g.userData.bud = true;
  } else {
    g.add(buildStaticFlower(species, slot.L, rng, { sway, withStamens: species === 'lily' && slot.L > 0.6 }));
  }
  // short pedicel back to the stem
  const stub = new THREE.CylinderGeometry(slot.L * 0.035, slot.L * 0.05, slot.L * 0.6, 6, 1);
  stub.rotateX(Math.PI / 2); stub.translate(0, 0, -slot.L * 0.3);
  bakeSway(stub, sway);
  const sm = new THREE.Mesh(stub, stemMaterial(species));
  sm.castShadow = true;
  g.add(sm);
  return g;
}

// ---------------------------------------------------------------------------
export function buildBaseFoliage(species, H, rng, yawBias = 0) {
  const geos = [];
  const n = species === 'orchid' ? rng.int(5, 7) : rng.int(7, 10);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3) + yawBias;
    const len = H * (species === 'orchid' ? rng.range(0.34, 0.5) : rng.range(0.28, 0.42));
    const geo = makePetalGeometry(species === 'orchid'
      ? { length: len, width: len * 0.42, peak: 0.55, tipPow: 0.62, curl: 0.55, droop: 1.6, fold: 0.5, cup: 0, ruffle: 0.012, seed: rng.int(1, 99), sway: swayAmp(len * 0.4, H) * 1.2, segU: 18, segV: 8 }
      : { length: len, width: len * 0.22, peak: 0.42, tipPow: 0.85, curl: 0.45, droop: 1.3, fold: 0.4, cup: 0, ruffle: 0.015, seed: rng.int(1, 99), sway: swayAmp(len * 0.4, H) * 1.5, segU: 18, segV: 6 });
    const dir = new THREE.Vector3(Math.cos(az), rng.range(0.35, 1.0), Math.sin(az)).normalize();
    xform(geo, { quat: basisQuat(dir, UP), pos: new THREE.Vector3(Math.cos(az) * H * 0.02, H * 0.01, Math.sin(az) * H * 0.02) });
    geos.push(geo);
  }
  const merged = mergeGeometries(geos, false);
  const mesh = new THREE.Mesh(merged, leafMaterial(species === 'orchid' ? 'leafOrchid' : 'leafLily'));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

export const leafDir = (radial, T) => radial.clone().multiplyScalar(0.9).addScaledVector(T, 0.45).normalize();
export const thornDir = (radial, T) => radial.clone().addScaledVector(T, -0.45).normalize();

function stemLeavesAndThorns(species, H, rng, curve, geo, group) {
  const frames = geo.userData.frames, pts = geo.userData.points;
  const N = frames.length - 1;
  if (species === 'lily') {
    const leaves = [];
    const nl = Math.max(4, Math.round(H * 0.9));
    for (let k = 0; k < nl; k++) {
      const t = 0.08 + 0.62 * (k / nl);
      const i = Math.round(t * N);
      const f = frames[i];
      const az = k * 2.4 + rng.range(-0.3, 0.3);
      const side = f.n.clone().multiplyScalar(Math.cos(az)).addScaledVector(f.b, Math.sin(az));
      const len = H * (0.2 - 0.09 * t) * rng.range(0.8, 1.15);
      const lg = makePetalGeometry({ length: len, width: len * 0.3, peak: 0.45, tipPow: 0.8, curl: 0.2, droop: 1.0, fold: 0.35, ruffle: 0.015, seed: k + 3, sway: swayAmp(pts[i].y, H) * 1.3, segU: 12, segV: 6 });
      const dir = leafDir(side, f.t);
      xform(lg, { quat: basisQuat(dir, f.t), pos: pts[i].clone() });
      leaves.push(lg);
    }
    const lm = new THREE.Mesh(mergeGeometries(leaves, false), leafMaterial('leafLily'));
    lm.castShadow = true; lm.receiveShadow = true; group.add(lm);
  }
  // thorns (lily briars carry heavy ones, orchid spikes none)
  if (species === 'lily') {
    const thorns = [];
    const nt = Math.round(H * 3.2);
    for (let k = 0; k < nt; k++) {
      const t = 0.03 + 0.85 * (k / nt);
      const i = Math.min(N, Math.round(t * N));
      const f = frames[i];
      const az = k * 2.1 + rng.range(-0.4, 0.4);
      const radial = f.n.clone().multiplyScalar(Math.cos(az)).addScaledVector(f.b, Math.sin(az));
      const r = H * 0.036 * (1 - 0.6 * t);
      const len = H * rng.range(0.025, 0.05) * (1 - t * 0.5);
      const tg = makeThornGeometry(len, len * 0.22, 5);
      const dir = thornDir(radial, f.t);
      xform(tg, { quat: new THREE.Quaternion().setFromUnitVectors(UP, dir), pos: pts[i].clone().addScaledVector(radial, r * 0.8) });
      bakeSway(tg, swayAmp(pts[i].y, H));
      thorns.push(tg.toNonIndexed());
    }
    const tm = new THREE.Mesh(mergeGeometries(thorns.map((g2) => { if (g2.attributes.uv) g2.deleteAttribute('uv'); return g2; }), false), thornMaterial());
    tm.castShadow = true; group.add(tm);
  }
}

/** Static decoy plant. Positioned in world space at (x, terrain, z). */
export function buildDecoy(species, { x, z, H, seed }) {
  const rng = new Rng(seed);
  const yaw = rng.range(0, Math.PI * 2);
  const lay = plantLayout(species, rng, H, yaw);
  const group = new THREE.Group();
  group.position.set(x, terrainHeight(x, z) - 0.15, z);
  group.userData.species = species;

  const curve = new THREE.CubicBezierCurve3(...lay.P);
  const geo = buildTubeGeometry(curve, {
    segs: 28, radial: 9, radius: (t) => stemRadius(species, H, t), vRepeat: Math.max(2, H * 0.35),
    swayFn: (t, p) => swayAmp(p.y, H),
  });
  const stem = new THREE.Mesh(geo, stemMaterial(species));
  stem.castShadow = true; stem.receiveShadow = true;
  group.add(stem);

  group.add(buildBaseFoliage(species, H, rng));
  stemLeavesAndThorns(species, H, rng, curve, geo, group);

  // terminal bloom
  const top = lay.P[3];
  const flower = buildStaticFlower(species, lay.L, rng, { sway: swayAmp(top.y, H) });
  flower.position.copy(top).addScaledVector(lay.face, lay.L * 0.12);
  flower.quaternion.copy(lookQuat(lay.face, UP));
  group.add(flower);

  // side blooms / buds
  const slots = sideFlowerSlots(species, rng, H, lay.L);
  for (const s of slots) {
    const i = Math.round(s.t * 28);
    const p = geo.userData.points[i];
    const tr = slotTransform(s, p, geo.userData.frames[i].t, species);
    const sb = buildSideBloom(species, s, rng, swayAmp(p.y, H));
    sb.position.copy(tr.pos); sb.quaternion.copy(tr.quat);
    group.add(sb);
  }
  group.userData.top = top.clone().add(group.position);
  return group;
}
