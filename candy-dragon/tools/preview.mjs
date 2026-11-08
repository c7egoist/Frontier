/**
 * Software preview renderer (no GPU in this sandbox).
 * Loads the real scene through Vite's SSR loader, flattens the graph
 * (including instanced meshes) and rasterises a smooth-shaded turntable.
 *
 * usage: node tools/preview.mjs [frames] [w] [h] [outDir] [angles]
 */
import { createServer } from 'vite';
import * as THREE from 'three';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const args = process.argv.slice(2);
const NFRAMES = +(args[0] || 3);
const W = +(args[1] || 700);
const H = +(args[2] || 700);
const OUT = args[3] || 'preview';
const ANGLES = (args[4] || '0,-35,35,90').split(',').map(Number);
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- DOM stub (material factory only needs canvases) ---- */
const fakeCtx = () => new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray((w || x) * (h || y) * 4), width: w || x, height: h || y });
    return () => {};
  },
});
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => fakeCtx() }) };
globalThis.self = globalThis;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const mod = await server.ssrLoadModule('/src/dragon.js');
const built = mod.buildDragon();
const scene = built.stage;
built.state.reveal = 1;
built.update(0, { freezeReveal: true });
scene.updateMatrixWorld(true);

/* ---------------- flatten to triangles with normals ------------------ */
const tris = [];
const nMat = new THREE.Matrix3();

function addGeometry(geo, matrix, mat, instMatrix) {
  const base = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
  if (mat.emissive) base.add(mat.emissive.clone().multiplyScalar(0.9));
  const info = { base, rough: mat.roughness ?? 0.4, irid: (mat.iridescence ?? 0) > 0 ? (mat.iridescenceThicknessMaximum ? 1 : 1) : 0, glow: mat.emissive ? mat.emissive.getHex() !== 0 && (mat.emissiveIntensity ?? 1) > 1 : false };
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const colA = geo.attributes.color;
  const index = geo.index;
  const m = matrix || new THREE.Matrix4();
  const inst = instMatrix || null;
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const inm = inst ? new THREE.Matrix3().getNormalMatrix(inst) : null;
  const count = index ? index.count : pos.count;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const NA = new THREE.Vector3(), NB = new THREE.Vector3(), NC = new THREE.Vector3();
  const instCol = new THREE.Color();
  const vc = new THREE.Color();
  for (let i = 0; i < count; i += 3) {
    const i0 = index ? index.getX(i) : i;
    const i1 = index ? index.getX(i + 1) : i + 1;
    const i2 = index ? index.getX(i + 2) : i + 2;
    A.fromBufferAttribute(pos, i0); B.fromBufferAttribute(pos, i1); C.fromBufferAttribute(pos, i2);
    if (inst) { A.applyMatrix4(inst); B.applyMatrix4(inst); C.applyMatrix4(inst); }
    A.applyMatrix4(m); B.applyMatrix4(m); C.applyMatrix4(m);
    NA.fromBufferAttribute(nor, i0); NB.fromBufferAttribute(nor, i1); NC.fromBufferAttribute(nor, i2);
    if (inm) { NA.applyMatrix3(inm); NB.applyMatrix3(inm); NC.applyMatrix3(inm); }
    NA.applyMatrix3(nm).normalize(); NB.applyMatrix3(nm).normalize(); NC.applyMatrix3(nm).normalize();
    let cr = base.r, cg = base.g, cb = base.b;
    if (colA) {
      vc.fromBufferAttribute(colA, i0);
      cr = base.r * vc.r; cg = base.g * vc.g; cb = base.b * vc.b;
    }
    if (info.irid && !colA) { cr = base.r; cg = base.g; cb = base.b; }
    tris.push({
      a: A.clone(), b: B.clone(), c: C.clone(),
      na: NA.clone(), nb: NB.clone(), nc: NC.clone(),
      col: [cr, cg, cb], info,
    });
  }
}

function walk(obj) {
  obj.updateWorldMatrix(true, false);
  if (obj.isInstancedMesh) {
    const inst = new THREE.Matrix4();
    for (let i = 0; i < obj.count; i++) {
      obj.getMatrixAt(i, inst);
      // instance color: fold into the base colour by cloning material info
      let mat = obj.material;
      if (obj.instanceColor) {
        const c = new THREE.Color();
        c.fromBufferAttribute(obj.instanceColor, i);
        mat = { ...obj.material, color: c.clone().multiply(obj.material.color) };
        // keep material props
        Object.setPrototypeOf(mat, Object.getPrototypeOf(obj.material));
      }
      addGeometry(obj.geometry, obj.matrixWorld, mat, inst);
    }
  } else if (obj.isMesh && obj.visible !== false) {
    addGeometry(obj.geometry, obj.matrixWorld, obj.material);
  }
  for (const c of obj.children) walk(c);
}
walk(scene);
console.error(`triangles: ${tris.length}`);

/* ---------------- png ------------------------------------------------- */
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function png(buf, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; buf.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const deflated = zlib.deflateSync(raw, { level: 6 });
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([t, data]);
    let crc = 0xffffffff;
    for (let i = 0; i < crcBuf.length; i++) crc = crcTable[(crc ^ crcBuf[i]) & 0xff] ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const c = Buffer.alloc(4); c.writeUInt32BE(crc);
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflated), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- lighting ------------------------------------------- */
const LIGHTS = [
  { dir: new THREE.Vector3(-0.48, 0.72, 0.50).normalize(), color: [1.0, 0.94, 0.90], power: 1.5 },
  { dir: new THREE.Vector3(0.72, 0.30, -0.62).normalize(), color: [0.62, 0.80, 1.0], power: 0.85 },
  { dir: new THREE.Vector3(0.15, -0.42, 0.88).normalize(), color: [1.0, 0.66, 0.42], power: 0.45 },
];
const AMB = [0.13, 0.10, 0.17];

let CEN = new THREE.Vector3();
let RAD = 1;

function shadePixel(buf, depth, x, y, z, nx, ny, nz, col, info, camPos) {
  const di = y * W + x;
  if (z >= depth[di]) return;
  depth[di] = z;
  let r = col[0] * AMB[0], g = col[1] * AMB[1], b = col[2] * AMB[2];
  for (const L of LIGHTS) {
    const ndl = nx * L.dir.x + ny * L.dir.y + nz * L.dir.z;
    const wrap = Math.max(0, (ndl + 0.4) / 1.4);
    const diff = Math.max(0, ndl) * 0.75 + wrap * 0.25;
    r += col[0] * L.color[0] * L.power * diff;
    g += col[1] * L.color[1] * L.power * diff;
    b += col[2] * L.color[2] * L.power * diff;
  }
  if (info.irid) {
    const rim = Math.pow(1 - Math.abs(nz), 3) * 0.6 + Math.pow(1 - Math.abs(nx), 4) * 0.35;
    r += rim * 0.55; g += rim * 0.30; b += rim * 0.62;
  }
  const shin = Math.max(4, Math.min(60, 200 * (1 - info.rough)));
  for (let i = 0; i < 2; i++) {
    const L = LIGHTS[i];
    let hx = L.dir.x, hy = L.dir.y + 1, hz = L.dir.z;
    // view assumed toward camera along -z of screen; approximate with view vector
    const vl = Math.hypot(camPos.x, camPos.y, camPos.z) || 1;
    hx += camPos.x / vl; hy += camPos.y / vl; hz += camPos.z / vl;
    const hl = Math.hypot(hx, hy, hz) || 1;
    const nh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl);
    const spec = Math.pow(nh, shin) * (1 - info.rough) * 0.9;
    r += spec * L.color[0]; g += spec * L.color[1]; b += spec * L.color[2];
  }
  const tone = (c) => Math.pow(Math.min(1, c / (1 + c * 0.5)), 1 / 2.2);
  const i3 = di * 3;
  buf[i3] = Math.min(255, tone(r) * 255);
  buf[i3 + 1] = Math.min(255, tone(g) * 255);
  buf[i3 + 2] = Math.min(255, tone(b) * 255);
}

function renderFrame(camAngle, outPath) {
  const buf = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const top = [0.030, 0.022, 0.055], bot = [0.115, 0.035, 0.105];
    const glow = Math.pow(1 - Math.abs(t - 0.6) / 0.6, 3) * 0.22;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      buf[i] = Math.min(255, (top[0] + (bot[0] - top[0]) * t + glow) * 255);
      buf[i + 1] = Math.min(255, (top[1] + (bot[1] - top[1]) * t + glow * 0.4) * 255);
      buf[i + 2] = Math.min(255, (top[2] + (bot[2] - top[2]) * t + glow * 0.85) * 255);
    }
  }
  const depth = new Float32Array(W * H).fill(Infinity);
  const cam = new THREE.PerspectiveCamera(33, 1, 0.1, 400);
  const a = (camAngle * Math.PI) / 180;
  const dist = (RAD / Math.tan((33 / 2) * Math.PI / 180)) * 0.84;
  cam.position.set(CEN.x + Math.sin(a) * dist, CEN.y + 0.16 * dist, CEN.z + Math.cos(a) * dist);
  cam.lookAt(CEN);
  cam.updateMatrixWorld();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

  const V0 = new THREE.Vector3(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3();
  const N0 = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3();
  const rel = new THREE.Vector3();
  for (const tri of tris) {
    V0.copy(tri.a).applyMatrix4(vp);
    V1.copy(tri.b).applyMatrix4(vp);
    V2.copy(tri.c).applyMatrix4(vp);
    if (V0.z < -1 || V1.z < -1 || V2.z < -1) continue;
    const x0 = (V0.x * 0.5 + 0.5) * W, y0 = (-V0.y * 0.5 + 0.5) * H;
    const x1 = (V1.x * 0.5 + 0.5) * W, y1 = (-V1.y * 0.5 + 0.5) * H;
    const x2 = (V2.x * 0.5 + 0.5) * W, y2 = (-V2.y * 0.5 + 0.5) * H;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) continue;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    const inv = 1 / area;
    N0.copy(tri.na); N1.copy(tri.nb); N2.copy(tri.nc);
    // view vector from triangle centroid, per-pixel-ish
    rel.copy(tri.a).sub(cam.position).normalize();
    const camP = rel.clone().multiplyScalar(-1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        let w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
        let w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
        let w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * V0.z + w1 * V1.z + w2 * V2.z;
        if (z >= depth[y * W + x]) continue;
        let nx = w0 * N0.x + w1 * N1.x + w2 * N2.x;
        let ny = w0 * N0.y + w1 * N1.y + w2 * N2.y;
        let nz = w0 * N0.z + w1 * N1.z + w2 * N2.z;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        if (nx * camP.x + ny * camP.y + nz * camP.z < 0) { nx = -nx; ny = -ny; nz = -nz; }
        shadePixel(buf, depth, x, y, z, nx, ny, nz, tri.col, tri.info, camP);
      }
    }
  }
  fs.writeFileSync(outPath, png(buf, W, H));
  console.error(`wrote ${outPath}`);
}

for (let f = 0; f < NFRAMES; f++) {
  built.state.t = 2.0 + f * 0.85;
  built.update(0, { freezeReveal: true });
  scene.updateMatrixWorld(true);
  const ang = ANGLES[f % ANGLES.length];
  // bounds from the fine triangle set
  const bb = new THREE.Box3();
  for (const t of tris) { bb.expandByPoint(t.a); bb.expandByPoint(t.b); bb.expandByPoint(t.c); }
  CEN = bb.getCenter(new THREE.Vector3());
  CEN.y += 0.10;
  RAD = bb.getSize(new THREE.Vector3()).length() * 0.5;
  renderFrame(ang, path.join(OUT, `v${f}_a${ang}.png`));
}
await server.close();
