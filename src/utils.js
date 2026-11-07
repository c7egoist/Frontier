import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ math */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, t) => {
  const x = clamp((t - a) / (b - a || 1e-6), 0, 1);
  return x * x * (3 - 2 * x);
};
// frame-rate independent exponential approach
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const sign = (v) => (v < 0 ? -1 : 1);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmt(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ------------------------------------------------------------- textures */
function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, x: c.getContext('2d') };
}

function finish(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function deckTexture() {
  const { c, x } = canvas(512);
  x.fillStyle = '#151322';
  x.fillRect(0, 0, 512, 512);
  // subtle panel variation
  for (let i = 0; i < 900; i++) {
    const g = 26 + Math.random() * 44;
    x.fillStyle = `rgba(${g},${g * 0.8 + 12},${g * 1.5 + 40},0.6)`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 26, 1 + Math.random() * 3);
  }
  // panel seams
  x.strokeStyle = 'rgba(60,90,150,0.30)';
  x.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    x.beginPath(); x.moveTo(0, (i * 512) / 4); x.lineTo(512, (i * 512) / 4); x.stroke();
    x.beginPath(); x.moveTo((i * 512) / 4, 0); x.lineTo((i * 512) / 4, 512); x.stroke();
  }
  // lane divider dashes down one edge of the tile
  x.fillStyle = 'rgba(150,205,255,0.5)';
  for (let y = 0; y < 512; y += 64) x.fillRect(0, y, 5, 34);
  // faint emissive-ish grid dots
  x.fillStyle = 'rgba(0,200,255,0.10)';
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 64; j++) {
      if ((i + j) % 2) continue;
      x.fillRect(i * 8 + 3, j * 8 + 3, 2, 2);
    }
  }
  return finish(c, 1);
}

export function chevronTexture() {
  const { c, x } = canvas(256);
  x.clearRect(0, 0, 256, 256);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.lineWidth = 20;
  // two lanes of forward chevrons (texture u runs along the track)
  for (const row of [0.3, 0.72]) {
    const oy = row * 256;
    const grad = x.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    x.strokeStyle = grad;
    x.beginPath();
    x.moveTo(24, oy - 56);
    x.lineTo(196, oy);
    x.lineTo(24, oy + 56);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function windowTexture() {
  const { c, x } = canvas(256);
  x.fillStyle = '#171430';
  x.fillRect(0, 0, 256, 256);
  const palette = ['#0a2a3a', '#123a4d', '#2a123f', '#3a1440', '#0a1c3a', '#241038'];
  for (let gy = 0; gy < 16; gy++) {
    for (let gx = 0; gx < 16; gx++) {
      const lit = Math.random();
      let color = palette[(Math.random() * palette.length) | 0];
      if (lit > 0.72) {
        const neon = Math.random();
        color = neon > 0.6 ? '#28d8ff' : neon > 0.3 ? '#ff4fd8' : '#ffc04a';
      }
      x.globalAlpha = lit > 0.72 ? 0.95 : 0.28 + Math.random() * 0.3;
      x.fillStyle = color;
      x.fillRect(gx * 16 + 3, gy * 16 + 4, 10, 8);
    }
  }
  x.globalAlpha = 1;
  return finish(c, 1);
}

export function hazardTexture() {
  const { c, x } = canvas(128);
  x.fillStyle = '#120a18';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#ffb02e';
  x.lineWidth = 16;
  for (let i = -128; i < 256; i += 44) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke();
  }
  return finish(c, 1);
}

export function glowSprite() {
  const { c, x } = canvas(128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(190,240,255,0.75)');
  g.addColorStop(1, 'rgba(90,160,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------- geometry */
/**
 * Sweep a cross-section profile along the track between s0 and s1.
 * profile: [[lateral, height, v?], ...]  (lateral is +right)
 */
export function sweepGeom(path, s0, s1, profile, opts = {}) {
  const step = opts.step || 3;
  const uScale = opts.uScale || 9;
  const vScale = opts.vScale || 4;
  const n = Math.max(2, Math.ceil((s1 - s0) / step));
  const rows = n + 1;
  const cols = profile.length;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const idx = [];

  let p = 0, q = 0;
  for (let i = 0; i < rows; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const f = path.frameAt(s);
    for (let j = 0; j < cols; j++) {
      const pr = profile[j];
      const lat = pr[0];
      const up = pr[1];
      pos[p++] = f.x + f.rx * lat;
      pos[p++] = f.y + up + lat * (f.bank || 0);
      pos[p++] = f.z + f.rz * lat;
      uv[q++] = s / uScale;
      uv[q++] = pr[2] !== undefined ? pr[2] : lat / vScale;
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (opts.flip) reverseWinding(g);
  return g;
}

export function reverseWinding(g) {
  const index = g.getIndex();
  if (!index) return;
  const a = index.array;
  for (let i = 0; i < a.length; i += 3) {
    const t = a[i + 1];
    a[i + 1] = a[i + 2];
    a[i + 2] = t;
  }
  index.needsUpdate = true;
  g.computeVertexNormals();
}

export function boxGeom(w, h, d, x, y, z, yaw = 0, uvScale = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale > 0) scaleBoxUV(g, w, h, d, uvScale);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

function scaleBoxUV(g, w, h, d, s) {
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (a / s), uv.getY(i) * (b / s));
    }
  }
  uv.needsUpdate = true;
}

export function mergeList(list) {
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  return merged;
}

export const GLOW_COLORS = {
  neonC: [0.22, 1.75, 2.3],
  neonM: [2.1, 0.28, 1.75],
  neonL: [1.05, 2.1, 0.22],
  neonA: [2.3, 1.0, 0.14],
  neonW: [1.7, 1.9, 2.3],
  signs: null,
};

export function paintGeom(geom, c) {
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2];
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

/** Batch of geometries grouped by material key. */

export class GeoBatch {
  constructor() { this.map = new Map(); }
  add(key, geom) {
    if (!geom) return;
    if (key in GLOW_COLORS) {
      const c = GLOW_COLORS[key];
      if (c && !geom.getAttribute('color')) paintGeom(geom, c);
      key = 'glow';
    }
    if (!this.map.has(key)) this.map.set(key, []);
    this.map.get(key).push(geom);
    return this;
  }
  build(materials) {
    const group = new THREE.Group();
    for (const [key, list] of this.map) {
      const merged = mergeList(list);
      if (!merged) continue;
      const mat = materials[key];
      if (!mat) { merged.dispose(); continue; }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = true;
      group.add(mesh);
    }
    this.map.clear();
    return group;
  }
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    // materials are shared singletons: never disposed here
    if (o.isInstancedMesh && o.dispose) o.dispose();
  });
}
