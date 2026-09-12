/**
 * Offline review renderer: builds any preset and rasterises it with a tiny
 * CPU rasteriser (flat/smooth shaded, z-buffered) to a BMP file. No browser
 * or GPU needed.
 *
 * Usage: npx vite-node scripts/shot.ts <name-filter> [seed] [mode] [size] [out]
 *   mode: shaded | clay | levels   (default shaded)
 */
// @ts-ignore node builtins available at runtime under vite-node
import fs from 'node:fs';
// @ts-ignore node builtins available at runtime under vite-node
import zlib from 'node:zlib';
import { PRESETS, cloneParams } from '../src/tree/params';
import { generateTree } from '../src/tree/generate';

const argv: string[] = (globalThis as unknown as { process: { argv: string[] } }).process.argv;
const filter = (argv[2] ?? '').toLowerCase();
const seed = Number(argv[3] ?? 1);
const mode = argv[4] ?? 'shaded';
const SIZE = Number(argv[5] ?? 700);
const SS = 2; // supersample factor
const W = SIZE * SS;
const H = SIZE * SS;

const preset = PRESETS.find((p) => p.name.toLowerCase().includes(filter)) ?? PRESETS[0];
const params = cloneParams(preset);
params.seed = seed;
const r = generateTree(params, { validate: false, obstacleMeshes: false });
const mesh = r.mesh;
const pos = mesh.positions;
const normals = mesh.computeNormals();

const albedo = (level: number): [number, number, number] => {
  if (mode === 'clay') return [0.78, 0.77, 0.74];
  if (mode === 'levels') {
    return (
      [
        [0.54, 0.35, 0.24],
        [0.79, 0.55, 0.29],
        [0.44, 0.63, 0.42],
        [0.35, 0.63, 0.79],
      ] as [number, number, number][]
    )[Math.min(3, level)];
  }
  // shaded: desert-plant palette by organ level
  return (
    [
      [0.45, 0.34, 0.24], // base soil
      [0.26, 0.47, 0.26], // stems / pads / leaves
      [0.32, 0.55, 0.3], // arms / joints
      [0.82, 0.74, 0.42], // spines / fruits
    ] as [number, number, number][]
  )[Math.min(3, level)];
};

// ---- camera: frame the bounding sphere ----
let mnx = 1e9;
let mxx = -1e9;
let mny = 1e9;
let mxy = -1e9;
let mnz = 1e9;
let mxz = -1e9;
for (let i = 0; i < pos.length; i += 3) {
  const x = pos[i];
  const y = pos[i + 1];
  const z = pos[i + 2];
  if (x < mnx) mnx = x;
  if (x > mxx) mxx = x;
  if (y < mny) mny = y;
  if (y > mxy) mxy = y;
  if (z < mnz) mnz = z;
  if (z > mxz) mxz = z;
}
const cx = (mnx + mxx) / 2;
const cy = (mny + mxy) / 2;
const cz = (mnz + mxz) / 2;
const tyArg = Number(argv[9] ?? 'nan');
const tcy = Number.isFinite(tyArg) ? mny + tyArg * (mxy - mny) : cy;
const radius = 0.5 * Math.sqrt((mxx - mnx) ** 2 + (mxy - mny) ** 2 + (mxz - mnz) ** 2);
const az = (Number(argv[7] ?? 32) * Math.PI) / 180;
const el = (Number(argv[8] ?? 14) * Math.PI) / 180;
const zoom = Number(argv[10] ?? 1);
const fwd: [number, number, number] = [-Math.cos(el) * Math.sin(az), -Math.sin(el), -Math.cos(el) * Math.cos(az)];
const right: [number, number, number] = [Math.cos(az), 0, -Math.sin(az)];
const up: [number, number, number] = [
  -Math.sin(el) * Math.sin(az),
  Math.cos(el),
  -Math.sin(el) * Math.cos(az),
];
const fov = (38 * Math.PI) / 180;
const dist = ((radius / Math.sin(fov / 2)) * 1.02) / zoom;
const focal = (H / 2) / Math.tan(fov / 2);

// project to screen
const sx = new Float32Array(mesh.vertexCount);
const sy = new Float32Array(mesh.vertexCount);
const sz = new Float32Array(mesh.vertexCount);
for (let i = 0; i < mesh.vertexCount; i++) {
  const dx = pos[i * 3] - cx;
  const dy = pos[i * 3 + 1] - tcy;
  const dz = pos[i * 3 + 2] - cz;
  const vx = dx * right[0] + dy * right[1] + dz * right[2];
  const vy = dx * up[0] + dy * up[1] + dz * up[2];
  const vz = dx * fwd[0] + dy * fwd[1] + dz * fwd[2] + dist;
  const s = focal / Math.max(1e-6, vz);
  sx[i] = W / 2 + vx * s;
  sy[i] = H / 2 - vy * s;
  sz[i] = vz;
}

// ---- rasterise ----
const fb = new Float32Array(W * H * 3);
const zb = new Float32Array(W * H).fill(Infinity);
// background: soft vertical gradient
for (let y = 0; y < H; y++) {
  const t = y / H;
  const r0 = 0.1 + 0.06 * t;
  const g0 = 0.11 + 0.07 * t;
  const b0 = 0.13 + 0.08 * t;
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    fb[o] = r0;
    fb[o + 1] = g0;
    fb[o + 2] = b0;
  }
}
const L1: [number, number, number] = [-0.45, 0.75, 0.55];
{
  const l = Math.hypot(L1[0], L1[1], L1[2]);
  L1[0] /= l;
  L1[1] /= l;
  L1[2] /= l;
}
const L2: [number, number, number] = [0.62, 0.2, -0.45];
{
  const l = Math.hypot(L2[0], L2[1], L2[2]);
  L2[0] /= l;
  L2[1] /= l;
  L2[2] /= l;
}

const vLight = new Float32Array(mesh.vertexCount);
for (let i = 0; i < mesh.vertexCount; i++) {
  const nx = normals[i * 3];
  const ny = normals[i * 3 + 1];
  const nz = normals[i * 3 + 2];
  // double-sided: thin spines show their lit side
  const d1 = Math.abs(nx * L1[0] + ny * L1[1] + nz * L1[2]);
  const d2 = Math.abs(nx * L2[0] + ny * L2[1] + nz * L2[2]);
  vLight[i] = 0.34 + 0.62 * d1 + 0.22 * d2;
}
const vBelow = new Uint8Array(mesh.vertexCount);
for (let i = 0; i < mesh.vertexCount; i++) if (pos[i * 3 + 1] < 0) vBelow[i] = 1;

function tri(i0: number, i1: number, i2: number): void {
  if (vBelow[i0] && vBelow[i1] && vBelow[i2]) return;
  const x0 = sx[i0];
  const y0 = sy[i0];
  const x1 = sx[i1];
  const y1 = sy[i1];
  const x2 = sx[i2];
  const y2 = sy[i2];
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area >= 0) return; // backface (winding is consistent)
  const [ar, ag, ab] = albedo(mesh.levels[i0]);
  const l0 = vLight[i0];
  const l1 = vLight[i1];
  const l2 = vLight[i2];
  const z0 = sz[i0];
  const z1 = sz[i1];
  const z2 = sz[i2];
  const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const inv = 1 / area;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * z0 + w1 * z1 + w2 * z2;
      const pi = y * W + x;
      if (z < zb[pi]) {
        zb[pi] = z;
        const li = w0 * l0 + w1 * l1 + w2 * l2;
        fb[pi * 3] = Math.min(1, ar * li);
        fb[pi * 3 + 1] = Math.min(1, ag * li);
        fb[pi * 3 + 2] = Math.min(1, ab * li);
      }
    }
  }
}

const t0 = Date.now();
const q = mesh.quads;
for (let f = 0; f < q.length; f += 4) {
  tri(q[f], q[f + 1], q[f + 2]);
  tri(q[f], q[f + 2], q[f + 3]);
}
const t = mesh.tris;
for (let f = 0; f < t.length; f += 3) tri(t[f], t[f + 1], t[f + 2]);
// ground plane: fill pixels below the horizon line through y=0 at the target
{
  const s = focal / Math.max(1e-6, dist);
  const horizon = H / 2 - (mny - tcy + (0 - mny)) * s;
  for (let y = Math.max(0, Math.floor(horizon)); y < H; y++) {
    const t2 = Math.min(1, (y - horizon) / (H * 0.5));
    for (let x = 0; x < W; x++) {
      const pi = y * W + x;
      if (zb[pi] === Infinity) {
        fb[pi * 3] = 0.23 + 0.05 * t2;
        fb[pi * 3 + 1] = 0.19 + 0.04 * t2;
        fb[pi * 3 + 2] = 0.15 + 0.03 * t2;
      }
    }
  }
}
console.log(`raster ${Date.now() - t0}ms faces=${mesh.quadCount + mesh.triCount}`);

// ---- downsample + write PNG ----
const out = new Uint8Array(SIZE * SIZE * 3);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r2 = 0;
    let g2 = 0;
    let b2 = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const o = ((y * SS + dy) * W + x * SS + dx) * 3;
        r2 += fb[o];
        g2 += fb[o + 1];
        b2 += fb[o + 2];
      }
    }
    const n = SS * SS;
    const o = (y * SIZE + x) * 3;
    out[o] = Math.max(0, Math.min(255, Math.round((r2 / n) ** (1 / 1.6) * 255)));
    out[o + 1] = Math.max(0, Math.min(255, Math.round((g2 / n) ** (1 / 1.6) * 255)));
    out[o + 2] = Math.max(0, Math.min(255, Math.round((b2 / n) ** (1 / 1.6) * 255)));
  }
}
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c;
}
const crc = (b: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const u8concat = (parts: Uint8Array[]): Uint8Array => {
  let n = 0;
  for (const p of parts) n += p.length;
  const r = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    r.set(p, o);
    o += p.length;
  }
  return r;
};
const chunk = (type: string, data: Uint8Array): Uint8Array => {
  const h = new Uint8Array(8);
  new DataView(h.buffer).setUint32(0, data.length);
  for (let i = 0; i < 4; i++) h[4 + i] = type.charCodeAt(i);
  const t = new Uint8Array(4);
  new DataView(t.buffer).setUint32(0, crc(u8concat([h.slice(4), data])));
  return u8concat([h, data, t]);
};
const ihdr = new Uint8Array(13);
new DataView(ihdr.buffer).setUint32(0, SIZE);
new DataView(ihdr.buffer).setUint32(4, SIZE);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = new Uint8Array((SIZE * 3 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0;
  raw.set(out.slice(y * SIZE * 3, (y + 1) * SIZE * 3), y * (SIZE * 3 + 1) + 1);
}
const png = u8concat([
  Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw) as Uint8Array),
  chunk('IEND', new Uint8Array(0)),
]);
const name = argv[6] ?? `/tmp/shots/${preset.name.replace(/\s+/g, '_')}_${mode}_${seed}.png`;
fs.mkdirSync(name.slice(0, name.lastIndexOf('/')), { recursive: true });
fs.writeFileSync(name, png);
console.log(name);
