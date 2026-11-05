import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { valueNoise } from '../util/noise.js';

export { mergeGeometries };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Organic blade (petal / sepal / leaf).
 * Local frame: grows along +Y from the origin, width along X, cup-side normal +Z.
 * uv.x across (0..1), uv.y base->tip (0..1).
 */
export function makePetalGeometry(o = {}) {
  const {
    length = 1, width = 0.5, segU = 20, segV = 10,
    peak = 0.5, tipPow = 0.7, curl = 0.4, recurve = 0, cup = 0.25, fold = 0,
    ruffle = 0.03, ruffleFreq = 6, twist = 0, seed = 1, sway = 0, claw = 0.02, droop = 0,
  } = o;
  const a = Math.log(0.5) / Math.log(peak);
  const nU = segU + 1, nV = segV + 1;
  const pos = new Float32Array(nU * nV * 3);
  const uvs = new Float32Array(nU * nV * 2);
  let sy = 0, sz = 0;
  const du = 1 / segU;
  for (let i = 0; i < nU; i++) {
    const u = i * du;
    // bend angle along the spine (positive curls towards +Z)
    const th = curl * u - recurve * smooth(0.5, 1, u) * smooth(0.5, 1, u) - droop * u * u;
    if (i > 0) { sy += Math.cos(th) * length * du; sz += Math.sin(th) * length * du; }
    const hw = (width / 2) * Math.max(claw, Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, a))), tipPow));
    const tw = twist * u;
    for (let j = 0; j < nV; j++) {
      const v = (j / segV) * 2 - 1;
      let x = v * hw;
      let z = cup * hw * v * v + fold * Math.abs(x);
      const n = (valueNoise(u * ruffleFreq + seed * 7.1, v * 2.3 + seed * 3.7, seed) - 0.5) * 2;
      z += ruffle * length * n * Math.abs(v) * smooth(0.08, 0.7, u);
      const xr = x * Math.cos(tw) - z * Math.sin(tw);
      const zr = x * Math.sin(tw) + z * Math.cos(tw);
      // cross-section normal lies in the spine's bend plane: (y,z) = (-sin th, cos th)
      const k = (i * nV + j) * 3;
      pos[k] = xr;
      pos[k + 1] = sy - zr * Math.sin(th);
      pos[k + 2] = sz + zr * Math.cos(th);
      uvs[(i * nV + j) * 2] = (v + 1) / 2;
      uvs[(i * nV + j) * 2 + 1] = u;
    }
  }
  const idx = [];
  for (let i = 0; i < segU; i++) for (let j = 0; j < segV; j++) {
    const p = i * nV + j, q = p + nV;
    idx.push(p, p + 1, q, p + 1, q + 1, q);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(nU * nV).fill(sway), 1));
  g.computeBoundingSphere();
  return g;
}

/** Transform helper: returns the geometry (mutated) after applying pos / basis / scale. */
export function xform(geo, { pos, quat, scale, euler } = {}) {
  const m = new THREE.Matrix4();
  const q = quat || (euler ? new THREE.Quaternion().setFromEuler(euler) : new THREE.Quaternion());
  const s = scale === undefined ? new THREE.Vector3(1, 1, 1) : typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : scale;
  m.compose(pos || new THREE.Vector3(), q, s);
  geo.applyMatrix4(m);
  return geo;
}

/** Quaternion whose local +Y is `dir` and whose local +Z is as close as possible to `up`. */
export function basisQuat(dir, up = new THREE.Vector3(0, 1, 0)) {
  const y = dir.clone().normalize();
  let z = up.clone().sub(y.clone().multiplyScalar(up.dot(y)));
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3(1, 0, 0).sub(y.clone().multiplyScalar(y.x));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
/** Quaternion whose local +Z is `dir` (flower / head frame) with local +Y near `up`. */
export function lookQuat(dir, up = new THREE.Vector3(0, 1, 0)) {
  const z = dir.clone().normalize();
  let y = up.clone().sub(z.clone().multiplyScalar(up.dot(z)));
  if (y.lengthSq() < 1e-6) y = new THREE.Vector3(1, 0, 0);
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function setSway(geo, fn) {
  const p = geo.attributes.position;
  const arr = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) arr[i] = typeof fn === 'function' ? fn(p.getX(i), p.getY(i), p.getZ(i), i) : fn;
  geo.setAttribute('aSway', new THREE.BufferAttribute(arr, 1));
  return geo;
}

// ---------------------------------------------------------------------------
/** Re-usable animated / static tube. Frames are propagated by parallel transport. */
export class TubeRibbon {
  constructor(segs = 16, radial = 8, { vRepeat = 1, ref = new THREE.Vector3(0, 0, 1) } = {}) {
    this.segs = segs; this.radial = radial; this.ref = ref.clone();
    const nRing = radial + 1, n = (segs + 1) * nRing;
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i <= segs; i++) for (let j = 0; j < nRing; j++) {
      uv[(i * nRing + j) * 2] = j / radial; uv[(i * nRing + j) * 2 + 1] = (i / segs) * vRepeat;
    }
    const idx = [];
    for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
      const a = i * nRing + j, b = a + nRing;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.geometry.setIndex(idx);
    this._t = new THREE.Vector3(); this._n = new THREE.Vector3(); this._b = new THREE.Vector3(); this._tmp = new THREE.Vector3();
    this.frames = []; // exposed for attaching things (leaves, thorns)
    for (let i = 0; i <= segs; i++) this.frames.push({ t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() });
  }

  /** points: array(segs+1) of Vector3; radii: number | array. */
  update(points, radii) {
    const { segs, radial, pos, nor } = this;
    const nRing = radial + 1;
    const t = this._t, nn = this._n, bb = this._b, tmp = this._tmp;
    nn.copy(this.ref);
    for (let i = 0; i <= segs; i++) {
      const p = points[i];
      const p0 = points[Math.max(0, i - 1)], p1 = points[Math.min(segs, i + 1)];
      t.subVectors(p1, p0);
      if (t.lengthSq() < 1e-12) t.set(0, 1, 0);
      t.normalize();
      // parallel transport of the normal
      nn.addScaledVector(t, -nn.dot(t));
      if (nn.lengthSq() < 1e-8) nn.set(1, 0, 0).addScaledVector(t, -t.x);
      nn.normalize();
      bb.crossVectors(t, nn);
      const r = (Array.isArray(radii) || ArrayBuffer.isView(radii)) ? radii[i] : typeof radii === 'function' ? radii(i / segs) : radii;
      const f = this.frames[i]; f.t.copy(t); f.n.copy(nn); f.b.copy(bb);
      for (let j = 0; j < nRing; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        tmp.set(nn.x * ca + bb.x * sa, nn.y * ca + bb.y * sa, nn.z * ca + bb.z * sa);
        const k = (i * nRing + j) * 3;
        pos[k] = p.x + tmp.x * r; pos[k + 1] = p.y + tmp.y * r; pos[k + 2] = p.z + tmp.z * r;
        nor[k] = tmp.x; nor[k + 1] = tmp.y; nor[k + 2] = tmp.z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}

/** Sample a THREE.Curve into n+1 points evenly spaced by arc length. */
export function samplePoints(curve, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(curve.getPointAt(i / n));
  return pts;
}

/** Static tube along a curve (used by decoys). swayFn(t) returns metres of wind displacement. */
export function buildTubeGeometry(curve, { segs = 24, radial = 8, radius, swayFn = () => 0, vRepeat = 3 }) {
  const tr = new TubeRibbon(segs, radial, { vRepeat });
  const pts = samplePoints(curve, segs);
  tr.update(pts, (t) => (typeof radius === 'function' ? radius(t) : radius));
  const sw = tr.geometry.attributes.aSway;
  for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) sw.setX(i * (radial + 1) + j, swayFn(i / segs, pts[i]));
  tr.geometry.userData.frames = tr.frames.map((f) => ({ t: f.t.clone(), n: f.n.clone(), b: f.b.clone() }));
  tr.geometry.userData.points = pts;
  return tr.geometry;
}

/** Curved tapered fang / horn, base at origin, pointing +Z and curving towards -Y (scaled by `curve`). */
export function makeFangGeometry({ length = 1, radius = 0.08, curve = 0.6, segs = 10, radial = 6, side = 0 } = {}) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const ang = curve * u * u * 2.2;
    pts.push(new THREE.Vector3(side * u * u * length * 0.15, -(1 - Math.cos(ang)) * length * 0.55 * u, Math.sin(Math.min(ang, 1.4)) * length * 0.5 + u * length * 0.5));
  }
  const tr = new TubeRibbon(segs, radial, { ref: new THREE.Vector3(1, 0, 0) });
  tr.update(pts, (t) => (radius * Math.pow(1 - t, 0.85) + 0.0005));
  return tr.geometry;
}

export function makeThornGeometry(length, radius, radial = 5) {
  const g = new THREE.ConeGeometry(radius, length, radial, 1, true);
  g.translate(0, length / 2, 0);
  return g;
}

export function bakeSway(geo, v) {
  geo.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(v), 1));
  return geo;
}
