/**
 * Headless software renderer — a tiny z-buffered rasteriser plus PNG writer.
 *
 * Why hand-rolled: the project has to prove the roof geometry is right without a GPU
 * or Blender in the loop. This renders the generated triangle soup straight from the
 * core to PNG so any layer can be inspected (hero view, gable elevation, eave corner,
 * and a half-section that cuts through the whole construction stack).
 *
 * usage:  node tools/render.mjs [--only minka] [--views hero,tsuma,corner,section]
 */
import zlib from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildRoof } from '../src/core/build-roof.js';
import { PRESETS } from '../src/core/spec.js';

// ── PNG writer ────────────────────────────────────────────────────────────────
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
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(width, height, rgb) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0;                       // filter: none
    rgb.copy
      ? rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3)
      : Buffer.from(rgb.subarray(y * width * 3, (y + 1) * width * 3)).copy(raw, y * (1 + width * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── 3d helpers ────────────────────────────────────────────────────────────────
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function camera({ target = [0, 0, 0], az = 0.6, el = 0.42, dist = 22, fov = 30, aspect = 4 / 3 }) {
  const dir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  const eye = [target[0] + dir[0] * dist, target[1] + dir[1] * dist, target[2] + dir[2] * dist];
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  return { eye, fwd, right, up, f: 1 / Math.tan((fov * Math.PI) / 180 / 2), aspect };
}

// ── rasteriser ────────────────────────────────────────────────────────────────
export function makeFrame(w, h) {
  return { w, h, color: Buffer.alloc(w * h * 3), depth: new Float32Array(w * h).fill(Infinity) };
}

function sky(frame) {
  for (let y = 0; y < frame.h; y++) {
    const t = y / frame.h;
    const r = 214 + 24 * t, g = 222 + 20 * t, b = 233 + 12 * t;
    for (let x = 0; x < frame.w; x++) {
      const i = (y * frame.w + x) * 3;
      frame.color[i] = r; frame.color[i + 1] = g; frame.color[i + 2] = b;
    }
  }
}

const LIGHTS = [norm([0.5, 0.85, 0.42]), norm([-0.62, 0.35, -0.5]), norm([0.1, -0.5, -0.2])];
const LIGHT_COL = [1.0, 0.42, 0.22];
const AMBIENT = 0.34;

function shade(normal, base) {
  const n = normal;
  let l = AMBIENT;
  for (let i = 0; i < LIGHTS.length; i++) l += LIGHT_COL[i] * Math.max(0, dot(n, LIGHTS[i]));
  return [Math.min(255, base[0] * l), Math.min(255, base[1] * l), Math.min(255, base[2] * l)];
}

function hex(c) {
  const s = c.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/**
 * Clip a triangle against the world plane `axis = value` (keep the side the normal
 * points away from), returning 0..2 triangles. Used for the half-section view.
 */
function clipTri(tri, axis, value, keepBelow) {
  const d = tri.map((p) => (keepBelow ? value - p[axis] : p[axis] - value));
  if (d[0] >= 0 && d[1] >= 0 && d[2] >= 0) return [tri];
  if (d[0] < 0 && d[1] < 0 && d[2] < 0) return [];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = tri[i], b = tri[(i + 1) % 3], da = d[i], db = d[(i + 1) % 3];
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  if (out.length < 3) return [];
  const tris = [];
  for (let i = 1; i + 1 < out.length; i++) tris.push([out[0], out[i], out[i + 1]]);
  return tris;
}

export function drawMesh(frame, cam, positions, base, opts = {}) {
  const { w, h, color, depth } = frame;
  const { eye, fwd, right, up, f } = cam;
  const aspect = cam.aspect;
  const project = (p) => {
    const v = sub(p, eye);
    const z = dot(v, fwd);
    if (z <= 0.05) return null;
    const x = dot(v, right), y = dot(v, up);
    return [(x / z) * f / aspect * 0.5 * w + w / 2, h / 2 - (y / z) * f * 0.5 * h, z];
  };
  const tris = [];
  for (let i = 0; i + 8 < positions.length; i += 9) {
    let tri = [
      [positions[i], positions[i + 1], positions[i + 2]],
      [positions[i + 3], positions[i + 4], positions[i + 5]],
      [positions[i + 6], positions[i + 7], positions[i + 8]],
    ];
    if (opts.clip) {
      const cut = clipTri(tri, opts.clip.axis, opts.clip.value, opts.clip.keepBelow);
      if (!cut.length) continue;
      for (const t of cut) tris.push(t);
    } else tris.push(tri);
  }
  for (const tri of tris) {
    const a = project(tri[0]), b = project(tri[1]), c = project(tri[2]);
    if (!a || !b || !c) continue;
    let nrm = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
    // shade both sides
    if (dot(nrm, sub(eye, tri[0])) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    const col = shade(nrm, base);
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    if (minX > maxX || minY > maxY) continue;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    const inv = 1 / area;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1])) * inv;
        const w1 = ((px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1])) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w2 * a[2] + w1 * b[2] + w0 * c[2];
        const idx = y * w + x;
        if (z >= depth[idx]) continue;
        depth[idx] = z;
        const o = idx * 3;
        color[o] = col[0]; color[o + 1] = col[1]; color[o + 2] = col[2];
      }
    }
  }
}

export function drawGround(frame, cam, size = 60, level = 0) {
  // one flat plate, then thin quads for a 2 m grid
  drawMesh(frame, cam, [
    -size, level, -size, size, level, -size, size, level, size,
    -size, level, -size, size, level, size, -size, level, size,
  ], [178, 180, 174]);
  const w = 0.03;
  const line = [];
  for (let i = -size; i <= size; i += 2) {
    line.push(
      i - w, level, -size, i + w, level, -size, i + w, level, size, i - w, level, -size, i + w, level, size, i - w, level, size,
      -size, level, i - w, -size, level, i + w, size, level, i + w, -size, level, i - w, size, level, i + w, size, level, i - w,
    );
  }
  drawMesh(frame, cam, line, [152, 154, 150]);
}

// ── scene assembly ────────────────────────────────────────────────────────────
const MATERIAL_BY_PART = {
  tiles: 'tile', 'tiles.eave': 'tileEave', ridge: 'ridge', hipRidge: 'ridge',
  verge: 'ridge', eaveBoard: 'wood', bargeboard: 'wood', battens: 'woodDark',
  deck: 'deck', underlay: 'underlayment', rafters: 'wood', hipRafters: 'wood',
  purlins: 'woodDark', ridgebeam: 'wood', frame: 'woodDark', lanterns: 'glow',
  volume: 'volume',
};

export function renderRoof(roof, { width = 480, height = 360, view = 'hero', clip = null, hide = [] } = {}) {
  const frame = makeFrame(width, height);
  sky(frame);
  const spec = roof.spec;
  // frame the roof: plan extents of the eaves outline plus the ridge height
  const W = spec.footprint.width / 2 + spec.overhang.eave + 0.4;
  const D = spec.footprint.depth / 2 + spec.overhang.eave + 0.4;
  const height3 = roof.surface?.hRidge ?? spec.baseHeight + 2.5;
  const size = Math.max(W, D);
  const centre = [0, spec.baseHeight + (height3 - spec.baseHeight) * 0.45, 0];
  const views = {
    hero: { az: 0.72, el: 0.34, dist: size * 2.5, target: centre, fov: 30 },
    tsuma: { az: Math.PI / 2, el: 0.16, dist: size * 2.7, target: centre, fov: 26 },
    corner: {
      az: 0.78, el: 0.22, dist: Math.max(6, size * 0.85), fov: 32,
      target: [W - 0.5, spec.baseHeight + 1.1, D - 0.5],
    },
    section: {
      az: Math.PI * 0.52, el: 0.14, dist: size * 2.6, fov: 30,
      target: [0, spec.baseHeight + (height3 - spec.baseHeight) * 0.55, 0],
    },
    top: { az: 0.0001, el: 1.45, dist: size * 2.9, target: [0, spec.baseHeight, 0], fov: 28 },
  };
  const v = views[view] ?? views.hero;
  const cam = camera({ ...v, aspect: width / height });
  if (view === 'section') {
    drawGround(frame, cam, 40, 0);
    for (const p of roof.parts) {
      if (hide.includes(p.id)) continue;
      const mat = MATERIAL_BY_PART[p.id] ?? 'wood';
      drawMesh(frame, cam, p.positions, hex(spec.palette[mat] ?? '#888888'),
        { clip: { axis: 2, value: 0, keepBelow: true } });
    }
  } else {
    drawGround(frame, cam, 40, 0);
    for (const p of roof.parts) {
      if (hide.includes(p.id)) continue;
      const mat = MATERIAL_BY_PART[p.id] ?? 'wood';
      drawMesh(frame, cam, p.positions, hex(spec.palette[mat] ?? '#888888'));
    }
  }
  return frame;
}

export function frameToPNG(frame) {
  return encodePNG(frame.w, frame.h, frame.color);
}

/** 2x2 contact sheet. */
export function contactSheet(frames, { width, height } = {}) {
  const w = frames[0].w, h = frames[0].h;
  const out = makeFrame(w * 2, h * 2);
  out.color.fill(250);
  frames.slice(0, 4).forEach((f, i) => {
    const ox = (i % 2) * w, oy = Math.floor(i / 2) * h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 3, d = ((y + oy) * out.w + (x + ox)) * 3;
        out.color[d] = f.color[s]; out.color[d + 1] = f.color[s + 1]; out.color[d + 2] = f.color[s + 2];
      }
    }
  });
  return out;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const val = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const only = val('only', null);
  const views = val('views', 'hero,tsuma,corner,section').split(',');
  const W = 520, H = 380;
  mkdirSync('out', { recursive: true });
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (only && name !== only) continue;
    const t0 = Date.now();
    const roof = buildRoof(preset.spec, { lengthSegments: 4 });
    const sheet = views.length === 4
      ? contactSheet(views.map((v) => renderRoof(roof, { width: W, height: H, view: v })))
      : renderRoof(roof, { width: W * 2, height: H * 2, view: views[0] });
    const file = `out/render-${name}.png`;
    writeFileSync(file, frameToPNG(sheet));
    console.log(`${name.padEnd(13)} ${file}  ${Date.now() - t0} ms  ${(roof.parts.reduce((s, p) => s + p.positions.length / 9, 0)).toLocaleString()} tris`);
  }
}
