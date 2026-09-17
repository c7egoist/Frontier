// Tiny software rasteriser: renders a three.js scene graph to raw RGBA and PNG.
// Used for headless visual verification (no GPU / browser available in the sandbox).
import * as THREE from 'three';
import zlib from 'node:zlib';
import fs from 'node:fs';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

let _roleSeed = 0;
const _roleMap = new Map();
function roleHue(role) {
  if (!_roleMap.has(role)) {
    _roleMap.set(role, ((_roleSeed++ * 0.61803398875) % 1));
  }
  return _roleMap.get(role);
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

function getTexData(map) {
  if (!map) return null;
  if (map.__texData) return map.__texData;
  const img = map.image || map.source?.data;
  if (!img || !img.getContext) return null;
  try {
    const ctx = img.getContext('2d');
    const data = ctx.getImageData(0, 0, img.width, img.height);
    const rec = {
      w: img.width,
      h: img.height,
      data: data.data,
      repeat: [map.repeat?.x ?? 1, map.repeat?.y ?? 1],
      offset: [map.offset?.x ?? 0, map.offset?.y ?? 0],
    };
    Object.defineProperty(map, '__texData', { value: rec, enumerable: false });
    return rec;
  } catch {
    return null;
  }
}

const _wrap01 = (v) => v - Math.floor(v);

function sampleTex(tex, u, v, out) {
  const w = tex.w;
  const h = tex.h;
  const px = Math.min(w - 1, Math.max(0, Math.floor(_wrap01(u * tex.repeat[0] + tex.offset[0]) * w)));
  // three.js textures are flipY by default
  const py = Math.min(h - 1, Math.max(0, Math.floor((1 - _wrap01(v * tex.repeat[1] + tex.offset[1])) * h)));
  const o = (py * w + px) * 4;
  out[0] = tex.data[o] / 255;
  out[1] = tex.data[o + 1] / 255;
  out[2] = tex.data[o + 2] / 255;
  out[3] = tex.data[o + 3] / 255;
  return out;
}

function srgb(v) {
  v = Math.max(0, Math.min(1, v));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * @param {THREE.Object3D} root
 * @param {object} opts
 */
export function renderToRGBA(root, opts = {}) {
  const {
    width = 960,
    height = 620,
    cameraPos = [16, 10, 20],
    target = [0, 5, 0],
    fov = 38,
    lightDir = [0.5, 0.75, 0.4],
    ambient = 0.4,
    bgTop = [0.08, 0.11, 0.18],
    bgBottom = [0.22, 0.24, 0.30],
    background = false,
  } = opts;

  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 900);
  camera.position.set(cameraPos[0], cameraPos[1], cameraPos[2]);
  camera.lookAt(target[0], target[1], target[2]);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const L = new THREE.Vector3(lightDir[0], lightDir[1], lightDir[2]).normalize();
  const LF = new THREE.Vector3(-lightDir[0], 0.25, -lightDir[2]).normalize();
  const VIEW = new THREE.Vector3();
  camera.getWorldDirection(VIEW).multiplyScalar(-1);

  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const t = y / height;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const g = background ? [0, 0, 0] : [
        bgTop[0] + (bgBottom[0] - bgTop[0]) * t,
        bgTop[1] + (bgBottom[1] - bgTop[1]) * t,
        bgTop[2] + (bgBottom[2] - bgTop[2]) * t,
      ];
      buf[o] = srgb(g[0]) * 255;
      buf[o + 1] = srgb(g[1]) * 255;
      buf[o + 2] = srgb(g[2]) * 255;
      buf[o + 3] = 255;
    }
  }

  const tris = [];
  root.updateMatrixWorld(true);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const na = new THREE.Vector3();
  const nb = new THREE.Vector3();
  const nc = new THREE.Vector3();
  const m = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  const ca = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const cc = new THREE.Vector3();
  const camSpace = new THREE.Vector3();
  const pa = new THREE.Vector3();

  const debug = [];
  root.traverse((o) => {
    if (!o.isMesh || o.visible === false) return;
    const geo = o.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const idx = geo.index;
    const nrm = geo.attributes.normal;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const tex = opts.textures === false ? null : getTexData(mat.map || mat.emissiveMap);
    const uvAttr = geo.attributes.uv;
    let base = mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.75, 0.75, 0.75];
    if (opts.roleColors) {
      const role = mat.userData?.role || 'other';
      const hue = roleHue(role);
      base = hslToRgb(hue, 0.75, 0.5);
    }
    const emis = mat.emissive ? [mat.emissive.r * (mat.emissiveIntensity ?? 1), mat.emissive.g * (mat.emissiveIntensity ?? 1), mat.emissive.b * (mat.emissiveIntensity ?? 1)] : [0, 0, 0];
    const emisMax = Math.max(...emis);
    m.copy(o.matrixWorld);
    nm.getNormalMatrix(m);
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i;
      const i1 = idx ? idx.getX(i + 1) : i + 1;
      const i2 = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      // near-plane rejection in camera space
      ca.copy(a).applyMatrix4(camera.matrixWorldInverse);
      cb.copy(b).applyMatrix4(camera.matrixWorldInverse);
      cc.copy(c).applyMatrix4(camera.matrixWorldInverse);
      if (ca.z > -0.2 || cb.z > -0.2 || cc.z > -0.2) continue;
      const depth = (ca.z + cb.z + cc.z) / 3;
      // screen projection
      pa.copy(a).applyMatrix4(vp);
      const x0 = (pa.x * 0.5 + 0.5) * width;
      const y0 = (1 - (pa.y * 0.5 + 0.5)) * height;
      const z0 = pa.z;
      const iw0 = 1 / Math.max(0.001, -ca.z);
      pa.copy(b).applyMatrix4(vp);
      const x1 = (pa.x * 0.5 + 0.5) * width;
      const y1 = (1 - (pa.y * 0.5 + 0.5)) * height;
      const z1 = pa.z;
      const iw1 = 1 / Math.max(0.001, -cb.z);
      pa.copy(c).applyMatrix4(vp);
      const x2 = (pa.x * 0.5 + 0.5) * width;
      const y2 = (1 - (pa.y * 0.5 + 0.5)) * height;
      const z2 = pa.z;
      const iw2 = 1 / Math.max(0.001, -cc.z);
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      // Reject degenerate/thin-sliver triangles: their edge functions are numerically
      // unstable relative to the tiny area and would smear over large screen regions.
      if (Math.abs(area) < 0.6) continue;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (maxX < minX || maxY < minY) continue;
      if (opts.verboseTris && false) {
        console.log(`   tri ${o.name} [${i / 3}] screen=${[x0, y0, x1, y1, x2, y2].map((v) => v.toFixed(0)).join(',')} area=${area.toFixed(1)} box=${[minX, maxX, minY, maxY].join(',')}`);
      }
      if ((maxX - minX) * (maxY - minY) > width * height * 0.75) continue; // skip runaway tris
      // Reject slivers (very thin triangles covering a big screen box): their linear
      // interpolation is numerically unreliable and they cause false depth wins.
      const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
      if (boxArea > 400 && Math.abs(area) / boxArea < 0.02) {
        if (opts.verboseTris) console.log(`      ^ REJECTED sliver ratio=${(Math.abs(area) / boxArea).toFixed(4)}`);
        continue;
      }
      // shading
      let shade;
      if (nrm) {
        na.fromBufferAttribute(nrm, i0).applyMatrix3(nm).normalize();
        nb.fromBufferAttribute(nrm, i1).applyMatrix3(nm).normalize();
        nc.fromBufferAttribute(nrm, i2).applyMatrix3(nm).normalize();
        na.add(nb).add(nc).normalize();
        const d = Math.max(0, na.dot(L));
        const fill = Math.max(0, na.dot(LF)) * 0.32;
        const rim = Math.pow(1 - Math.abs(na.dot(VIEW)), 3) * 0.12;
        shade = ambient + 0.72 * d + fill + 0.16 * Math.max(0, na.y) + rim;
      } else {
        shade = ambient + 0.5;
      }
      const col = [base[0], base[1], base[2]];
      if (opts.debugTop) debug.push({ name: o.name, role: mat.userData?.role, area: Math.abs(area), px: [minX, maxX, minY, maxY] });
      tris.push({
        x0,
        y0,
        x1,
        y1,
        x2,
        y2,
        z0,
        z1,
        z2,
        iw0,
        iw1,
        iw2,
        area,
        z: depth,
        shade,
        emis,
        rgb: [srgb(col[0]) * 255, srgb(col[1]) * 255, srgb(col[2]) * 255],
        minX,
        maxX,
        minY,
        maxY,
        emissive: emisMax > 0.35,
        tex,
        uvs: uvAttr
          ? [
              [uvAttr.getX(i1), uvAttr.getY(i1)],
              [uvAttr.getX(i2), uvAttr.getY(i2)],
              [uvAttr.getX(i0), uvAttr.getY(i0)],
            ]
          : null,
        baseCol: base,
        name: o.name,
        idxAll: [i0, i1, i2],
        worldTris: [
          [a.x, a.y, a.z].map((v) => +v.toFixed(2)),
          [b.x, b.y, b.z].map((v) => +v.toFixed(2)),
          [c.x, c.y, c.z].map((v) => +v.toFixed(2)),
        ],
      });
    }
  });

  tris.sort((p, q) => q.z - p.z); // far -> near as a cheap pre-pass for coplanar ties

  const zbuf = new Float32Array(width * height).fill(-Infinity); // holds 1/w (bigger = closer)
  const TXT = [0, 0, 0, 1];
  const probeMap = new Map();
  const probes = (opts.probePixels || []).map(([x, y]) => [x, y, y * width + x, null]);

  for (const t of tris) {
    const inv = 1 / t.area;
    const e0 = (x, y) => (t.x1 - t.x0) * (y - t.y0) - (t.y1 - t.y0) * (x - t.x0);
    const e1 = (x, y) => (t.x2 - t.x1) * (y - t.y1) - (t.y2 - t.y1) * (x - t.x1);
    const e2 = (x, y) => (t.x0 - t.x2) * (y - t.y2) - (t.y0 - t.y2) * (x - t.x2);
    for (let y = t.minY; y <= t.maxY; y++) {
      const py = y + 0.5;
      for (let x = t.minX; x <= t.maxX; x++) {
        const px = x + 0.5;
        let w0 = e0(px, py) * inv;
        let w1 = e1(px, py) * inv;
        let w2 = e2(px, py) * inv;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // perspective-correct depth: 1/w interpolates linearly in screen space.
        // NOTE: edge function e0 (from A->B) is 1 at vertex C, e1 at A, e2 at B.
        const iw = w0 * t.iw2 + w1 * t.iw0 + w2 * t.iw1;
        const zi = y * width + x;
        if (iw <= zbuf[zi]) continue;
        let cr = t.baseCol[0];
        let cg = t.baseCol[1];
        let cb = t.baseCol[2];
        let alpha = 1;
        if (t.tex && t.uvs) {
          // perspective-correct UV (weights map to C, A, B)
          const nu = w0 * t.uvs[0][0] * t.iw2 + w1 * t.uvs[1][0] * t.iw0 + w2 * t.uvs[2][0] * t.iw1;
          const nv = w0 * t.uvs[0][1] * t.iw2 + w1 * t.uvs[1][1] * t.iw0 + w2 * t.uvs[2][1] * t.iw1;
          const den = iw || 1e-6;
          const s4 = sampleTex(t.tex, nu / den, nv / den, TXT);
          alpha = s4[3];
          if (alpha < 0.04) continue;
          cr *= s4[0];
          cg *= s4[1];
          cb *= s4[2];
        }
        zbuf[zi] = iw;
        if (probes.length) {
          for (const pr of probes) {
            if (pr[2] === zi) {
              pr[3] = t.name;
              pr[4] = t.worldTris;
              pr[5] = t.idxAll;
            }
          }
        }
        const o = zi * 4;
        let rr = Math.min(1, cr * t.shade + t.emis[0] * 1.35);
        let gg = Math.min(1, cg * t.shade + t.emis[1] * 1.35);
        let bb2 = Math.min(1, cb * t.shade + t.emis[2] * 1.35);
        rr = srgb(rr) * 255;
        gg = srgb(gg) * 255;
        bb2 = srgb(bb2) * 255;
        if (alpha < 0.999) {
          buf[o] = buf[o] * (1 - alpha) + rr * alpha;
          buf[o + 1] = buf[o + 1] * (1 - alpha) + gg * alpha;
          buf[o + 2] = buf[o + 2] * (1 - alpha) + bb2 * alpha;
        } else {
          buf[o] = rr;
          buf[o + 1] = gg;
          buf[o + 2] = bb2;
        }
        buf[o + 3] = 255;
      }
    }
  }
  if (probes.length) {
    console.log('--- pixel probes ---');
    for (const pr of probes) {
      console.log(`   (${pr[0]},${pr[1]}) -> ${pr[3] || 'background'}  ${pr[4] ? JSON.stringify(pr[4]) : ''}`);
    }
  }
  if (opts.debugTop) {
    const cx = width / 2;
    const cy = height * 0.6;
    const hits = debug.filter((d) => d.px[0] < cx && d.px[1] > cx && d.px[2] < cy && d.px[3] > cy);
    debug.length = 0;
    debug.push(...hits);
    debug.sort((p, q) => q.area - p.area);
    console.log('--- largest screen triangles crossing the frame centre ---');
    for (const d of debug.slice(0, opts.debugTop)) {
      console.log(`   ${String(Math.round(d.area)).padStart(7)} px²  ${d.name}  [${d.role}]  bounds=${d.px.join(',')}`);
    }
  }
  return { width, height, rgba: buf };
}

export function renderToPNG(root, file, opts) {
  const { width, height, rgba } = renderToRGBA(root, opts);
  const bytes = writePNG(file, width, height, rgba);
  return { width, height, bytes };
}
