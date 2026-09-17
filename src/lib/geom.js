// Geometry helpers: small factory + transform + merge utilities.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;

export const boxGeo = (w, h, d, seg = 1) => new THREE.BoxGeometry(w, h, d, seg, seg, seg);

export const cylGeo = (rt, rb, h, seg = 12, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

export const planeGeo = (w, h, ws = 1, hs = 1) => new THREE.PlaneGeometry(w, h, ws, hs);

export const sphereGeo = (r, ws = 12, hs = 10, phiL = 0, phiLen = Math.PI * 2) =>
  new THREE.SphereGeometry(r, ws, hs, phiL, phiLen);

export function coneGeo(r, h, seg = 12) {
  return new THREE.ConeGeometry(r, h, seg);
}

export function latheGeo(points, seg = 16) {
  return new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), seg);
}

export function torusGeo(r, tube, rs = 8, ts = 16, arc = Math.PI * 2) {
  return new THREE.TorusGeometry(r, tube, rs, ts, arc);
}

/** Keep only position/normal/uv so every geometry can be merged together. */
export function normalizeGeo(geo) {
  const keep = ['position', 'normal', 'uv'];
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) {
    if (!keep.includes(name)) g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const count = g.attributes.position.count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (g.attributes.position.count === 0) {
    g.dispose?.();
    return null;
  }
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

/**
 * Transform geometry in place (returns it for chaining).
 * pos: [x,y,z] | Vector3, rot: [rx,ry,rz] radians, scale: number | [x,y,z]
 */
export function xform(geo, pos, rot, scale) {
  const g = geo;
  if (scale !== undefined && scale !== null) {
    if (typeof scale === 'number') g.scale(scale, scale, scale);
    else g.scale(scale[0], scale[1], scale[2]);
  }
  if (rot) {
    if (Array.isArray(rot)) _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    else _e.set(rot.x || 0, rot.y || 0, rot.z || 0);
    _q.setFromEuler(_e);
    g.applyQuaternion(_q);
  }
  if (pos) {
    if (Array.isArray(pos)) g.translate(pos[0] || 0, pos[1] || 0, pos[2] || 0);
    else g.translate(pos.x, pos.y, pos.z);
  }
  return g;
}

/** Mirror a geometry across an axis (used for symmetric façades). */
export function mirrorX(geo) {
  geo.scale(-1, 1, 1);
  const n = geo.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
  n.needsUpdate = true;
  return geo;
}

/** Build a quad grid geometry from a 2D array of Vector3 points (rows x cols). */
export function gridToGeometry(rows, uvScale = 1) {
  const rn = rows.length;
  const cn = rows[0].length;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < rn; i++) {
    for (let j = 0; j < cn; j++) {
      const p = rows[i][j];
      positions.push(p.x, p.y, p.z);
      uvs.push((j / (cn - 1)) * uvScale, (i / (rn - 1)) * uvScale);
    }
  }
  for (let i = 0; i < rn - 1; i++) {
    for (let j = 0; j < cn - 1; j++) {
      const a = i * cn + j;
      const b = a + 1;
      const c = a + cn;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Merge a list of geometries; returns null when the list is empty. */
export function mergeList(list) {
  if (!list || !list.length) return null;
  const clean = [];
  for (const g of list) {
    const n = normalizeGeo(g);
    if (n) clean.push(n);
    else g.dispose?.();
  }
  if (!clean.length) return null;
  if (clean.length === 1) return clean[0];
  const merged = mergeGeometries(clean, false);
  for (const g of clean) g.dispose();
  // transforms (rotate/scale/mirror) can denormalise normals — restore unit length
  merged?.normalizeNormals?.();
  if (merged && !merged.attributes.uv) {
    const count = merged.attributes.position.count;
    merged.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return merged;
}

/** Tube along a list of [x,y,z] points. */
export function tubeGeo(points, radius, tubular = 12, radial = 5, closed = false) {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]))),
    closed,
    'catmullrom',
    0.2
  );
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Catenary-ish sag curve between two points. */
export function sagPoints(a, b, sag, segments = 12) {
  const out = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag;
    const z = a[2] + (b[2] - a[2]) * t;
    out.push([x, y, z]);
  }
  return out;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
