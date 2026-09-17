// ============================================================================
// render.mjs — headless software renderer for geometry verification.
// Renders the exact triangle soup the generator produces (z-buffered,
// flat-shaded, vertex colours) to PNG. No GPU or browser required.
// ============================================================================
import { buildRoof } from '../src/build.js';
import * as THREE from 'three';
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const baseParams = {
  roofType: 'yosemune', length: 10, depth: 6.2, wallHeight: 3.0,
  eaveOverhang: 0.75, rakeOverhang: 0.55,
  pitchTop: 33, pitchEave: 21, eaveFlip: 6,
  cornerLift: 0.34, cornerPow: 2.6, hipRise: 0.62, gableBreak: 0.30,
  tileModule: 0.30, coverWidth: 0.15, courseHeight: 0.235, tileJitter: 0.5,
  ridgeCapSize: 0.105, plasterFillet: true, onigawara: true, onigawaraScale: 1,
  shrineChigi: false, chigiHeight: 0.72, katsuogiCount: 4,
  showRafters: true, gableFrame: true,
  tileColor: '#565a60', woodColor: '#4a3628', wallColor: '#2e2620',
  plasterColor: '#ded7c6', fasciaColor: '#20303a', seed: 7,
};

const W = 1280, H = 860;
const SS = 2; // supersample factor

// --- tiny mat4 --------------------------------------------------------------
function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), out = new Float32Array(16);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}
function lookAt(eye, target, up) {
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  // column-major (OpenGL/three.js convention)
  return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function norm(a) { const l = Math.hypot(...a) || 1; return [a[0]/l, a[1]/l, a[2]/l]; }
function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  }
  return o;
}
function xform(m, v) {
  return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],
          m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14], m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]];
}

// --- scene flattening ---------------------------------------------------------
let DEBUG_COLOR = process.env.DEBUG_COLOR === '1';
const DEBUG_PALETTE = [[0.9,0.3,0.3],[0.3,0.9,0.3],[0.3,0.4,0.9],[0.9,0.8,0.2],[0.9,0.3,0.8],[0.2,0.8,0.8],[0.9,0.5,0.1],[0.5,0.3,0.9]];
let debugIdx = 0;
function collectTriangles(group) {
  group.updateMatrixWorld(true);
  debugIdx = 0;
  const tris = [];
  group.traverse(o => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    const g = o.geometry;
    const pos = g.attributes.position.array;
    const colAttr = g.attributes.color;
    const m = o.matrixWorld;
    const mat = o.material || {};
    const mc = mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [1, 1, 1];
    const usesVCol = !!colAttr && mat.vertexColors;
    const baseGray = mat.map ? [0.62, 0.62, 0.64] : null; // textured oni slab -> flat tone
    const dbg = DEBUG_PALETTE[(debugIdx++) % DEBUG_PALETTE.length];
    if (process.env.DEBUG_HIDE === 'deck' && o.userData && o.userData.isDeck) { return; }
    const idx = g.index ? g.index.array : null;
    const n = idx ? idx.length : pos.length / 3;
    for (let k = 0; k < n; k++) {
      const i0 = idx ? idx[k*3] : k*3, i1 = idx ? idx[k*3+1] : k*3+1, i2 = idx ? idx[k*3+2] : k*3+2;
      const mArr = m.elements;
      const P = [i0, i1, i2].map(i => xform(mArr, [pos[i*3], pos[i*3+1], pos[i*3+2]]));
      let c0, c1, c2;
      if (DEBUG_COLOR) { c0 = c1 = c2 = dbg; }
      else if (baseGray) { c0 = c1 = c2 = baseGray; }
      else if (usesVCol) {
        c0 = [colAttr.array[i0*3]*mc[0], colAttr.array[i0*3+1]*mc[1], colAttr.array[i0*3+2]*mc[2]];
        c1 = [colAttr.array[i1*3]*mc[0], colAttr.array[i1*3+1]*mc[1], colAttr.array[i1*3+2]*mc[2]];
        c2 = [colAttr.array[i2*3]*mc[0], colAttr.array[i2*3+1]*mc[1], colAttr.array[i2*3+2]*mc[2]];
      } else { c0 = c1 = c2 = mc; }
      const nrm = norm(cross(sub(P[1], P[0]), sub(P[2], P[0])));
      tris.push({ p: P, c: [c0, c1, c2], n: nrm });
    }
  });
  return tris;
}

// --- rasterizer ----------------------------------------------------------------
function render(tris, eye, target, outPath) {
  const RW = W * SS, RH = H * SS;
  const aspect = RW / RH;
  const view = lookAt(eye, target, [0, 0, 1]);
  const proj = perspective(42 * Math.PI / 180, aspect, 0.1, 300);
  const vp = mul4(proj, view);
  const img = new PNG({ width: RW, height: RH });
  const zbuf = new Float32Array(RW * RH).fill(Infinity);
  const sky = [176, 188, 198];
  for (let i = 0; i < RW * RH; i++) { img.data[i*4] = sky[0]; img.data[i*4+1] = sky[1]; img.data[i*4+2] = sky[2]; img.data[i*4+3] = 255; }

  const L = norm([14, 22, 9]);
  const px = (v) => {
    const c = xform(vp, v);
    return { x: (c[0] / c[3] * 0.5 + 0.5) * RW, y: (0.5 - c[1] / c[3] * 0.5) * RH, z: c[2] / c[3], w: c[3] };
  };

  // ground disc + grid, drawn first
  const groundTris = [];
  for (let i = 0; i < 48; i++) {
    const a0 = i / 48 * Math.PI * 2, a1 = (i + 1) / 48 * Math.PI * 2;
    groundTris.push({ p: [[0,0,0], [40*Math.cos(a0), 40*Math.sin(a0), -0.02], [40*Math.cos(a1), 40*Math.sin(a1), -0.02]],
      c: [[0.48,0.51,0.47],[0.48,0.51,0.47],[0.48,0.51,0.47]], n: [0,0,1] });
  }
  for (let g2 = -12; g2 <= 12; g2++) {
    for (const horiz of [0, 1]) {
      const a = horiz ? [-12, g2, 0.005] : [g2, -12, 0.005];
      const b = horiz ? [12, g2, 0.005] : [g2, 12, 0.005];
      const t = 0.02;
      const col = [0.18, 0.20, 0.19];
      groundTris.push({ p: [[a[0],a[1],0],[b[0],b[1],0],[b[0],b[1],t]], c:[col,col,col], n:[0,0,1] });
      groundTris.push({ p: [[a[0],a[1],0],[b[0],b[1],t],[a[0],a[1],t]], c:[col,col,col], n:[0,0,1] });
    }
  }

  let drawn = 0;
  const drawTri = (tri) => {
    const v = tri.p.map(px);
    
    if (v.some(q => !isFinite(q.x) || !isFinite(q.y) || q.w <= 0)) return;
    const minX = Math.max(0, Math.floor(Math.min(v[0].x, v[1].x, v[2].x)));
    const maxX = Math.min(RW - 1, Math.ceil(Math.max(v[0].x, v[1].x, v[2].x)));
    const minY = Math.max(0, Math.floor(Math.min(v[0].y, v[1].y, v[2].y)));
    const maxY = Math.min(RH - 1, Math.ceil(Math.max(v[0].y, v[1].y, v[2].y)));
    if (maxX < minX || maxY < minY) return;
    const area = (v[1].x - v[0].x) * (v[2].y - v[0].y) - (v[2].x - v[0].x) * (v[1].y - v[0].y);
    if (Math.abs(area) < 1e-9) return;
    const ndl = dot(tri.n, L);
    const light = 0.66 + 0.34 * Math.max(0, ndl) + 0.24 * Math.max(0, -ndl);
    drawn++;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((v[1].x - v[0].x) * (y + 0.5 - v[0].y) - (x + 0.5 - v[0].x) * (v[1].y - v[0].y)) / area;
        const w1 = ((v[2].x - v[1].x) * (y + 0.5 - v[1].y) - (x + 0.5 - v[1].x) * (v[2].y - v[1].y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * v[0].z + w1 * v[1].z + w2 * v[2].z;
        const bi = y * RW + x;
        if (z >= zbuf[bi]) continue;
        zbuf[bi] = z;
        const r = (w0 * tri.c[0][0] + w1 * tri.c[1][0] + w2 * tri.c[2][0]) * light;
        const g = (w0 * tri.c[0][1] + w1 * tri.c[1][1] + w2 * tri.c[2][1]) * light;
        const b = (w0 * tri.c[0][2] + w1 * tri.c[1][2] + w2 * tri.c[2][2]) * light;
        const o = bi * 4;
        img.data[o] = Math.min(255, r * 255);
        img.data[o + 1] = Math.min(255, g * 255);
        img.data[o + 2] = Math.min(255, b * 255);
      }
    }
  };
  for (const t of groundTris) drawTri(t);
  for (const t of tris) drawTri(t);

  // box downsample SS x SS -> final
  const out2 = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const si = ((y * SS + sy) * RW + (x * SS + sx)) * 4;
      r += img.data[si]; g += img.data[si + 1]; b += img.data[si + 2];
    }
    const n = SS * SS, o = (y * W + x) * 4;
    out2.data[o] = r / n; out2.data[o + 1] = g / n; out2.data[o + 2] = b / n; out2.data[o + 3] = 255;
  }
  fs.writeFileSync(outPath, PNG.sync.write(out2));
  return drawn;
}

// --- views ---------------------------------------------------------------------
const views = {
  iso:   { azim: 35,  elev: 18, dist: 17, z: 2.8 },
  front: { azim: 90,  elev: 6,  dist: 19, z: 2.6 },
  gable: { azim: 0,   elev: 8,  dist: 19, z: 3.2 },
  eave:  { azim: 55,  elev: 10, dist: 8,  z: 3.6 },
  ridge: { azim: 118, elev: 33, dist: 13, z: 4.9 },
  end:   { azim: 2,   elev: 22, dist: 14, z: 4.2 },
  high:  { azim: 35,  elev: 55, dist: 22, z: 2.5 },
  top:   { azim: 35,  elev: 88, dist: 16, z: 2.5 },
  ridge34: { azim: 60, elev: 30, dist: 10, z: 4.6 },
};

const types = process.argv[2] ? process.argv[2].split(',') : ['kirizuma', 'yosemune', 'irimoya', 'hogyo'];
const viewNames = process.argv[3] ? process.argv[3].split(',') : Object.keys(views);
const overrides = {};
if (process.argv[4]) Object.assign(overrides, JSON.parse(process.argv[4]));

fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
const t0 = Date.now();
for (const type of types) {
  const { group } = buildRoof({ ...baseParams, roofType: type, ...overrides });
  const tris = collectTriangles(group);
  console.log(`${type}: ${tris.length} tris collected`);
  for (const name of viewNames) {
    const v = views[name];
    const az = v.azim * Math.PI / 180, el = v.elev * Math.PI / 180;
    const eye = [v.dist * Math.cos(el) * Math.sin(az), v.dist * Math.cos(el) * Math.cos(az), v.dist * Math.sin(el) + v.z];
    const target = [0, 0, v.z];
    const out = path.join(root, 'shots', `${type}-${name}.png`);
    const d = render(tris, eye, target, out);
    console.log(`  ${path.basename(out)} (${d} drawn, ${((Date.now()-t0)/1000).toFixed(0)}s)`);
  }
}
console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
