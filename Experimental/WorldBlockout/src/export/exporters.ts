// Exports. Everything is generated from the same field the editor renders:
//  - map PNG (colour coded, city plots, coastline)
//  - 16-bit heightmap PNG (encoded into RG channels so no precision is lost in 8-bit)
//  - OBJ mesh with coast/height attributes (no dependencies, opens anywhere)
//  - world JSON (authoring data: params, SDF ops, city table) for round-tripping
//  - coastline SVG (vector, for blocking over in a 2D tool)
//  - spectrum CSV (the actual wave spectrum, for analysis)

import type { HeightBake } from '../core/terrain.ts';
import type { BrushOp } from '../core/terrain.ts';
import type { SpectrumCascade } from '../core/oceanSpectrum.ts';
import type { CityPlot } from '../world/presets.ts';
import { buildTerrainMesh } from '../core/terrain.ts';

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadPng(name: string, canvas: HTMLCanvasElement) {
  canvas.toBlob((blob) => { if (blob) download(name, blob); }, 'image/png');
}

/** Colour ramp shared with the map shader so exports and the view look the same. */
export function mapColor(h: number): [number, number, number] {
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
  const ss = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-9)));
    return t * t * (3 - 2 * t);
  };
  if (h < 0) {
    const d = -h;
    let c = lerp([61, 158, 168], [26, 71, 122], ss(0, 300, d));
    c = lerp(c, [8, 23, 56], ss(200, 4200, d));
    return c;
  }
  let c = lerp([204, 189, 133], [92, 125, 69], ss(0, 40, h));
  c = lerp(c, [133, 133, 82], ss(600, 1600, h));
  c = lerp(c, [143, 128, 112], ss(2200, 3200, h));
  c = lerp(c, [240, 242, 250], ss(4200, 4800, h));
  return c;
}

function drawMap(bake: HeightBake, ops: BrushOp[], width = 2048): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = width;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, width);
  const size = bake.size;
  for (let y = 0; y < width; y++) {
    const sy = Math.min(size - 1, Math.floor((y / width) * size));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(size - 1, Math.floor((x / width) * size));
      const i = sy * size + sx;
      const h = bake.heights[i];
      const [r, g, b] = mapColor(h);
      // hillshade from neighbours
      const hx = bake.heights[sy * size + Math.min(size - 1, sx + 1)];
      const hz = bake.heights[Math.min(size - 1, sy + 1) * size + sx];
      const shade = Math.max(0.55, Math.min(1.45, 1 + ((h - hx) + (h - hz)) * 0.0016));
      const o = (y * width + x) * 4;
      img.data[o] = Math.min(255, r * shade);
      img.data[o + 1] = Math.min(255, g * shade);
      img.data[o + 2] = Math.min(255, b * shade);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Sea level contour, for readable coastlines
  ctx.strokeStyle = 'rgba(250,247,232,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const a = bake.heights[y * size + x];
      const b = bake.heights[y * size + x + 1];
      const c = bake.heights[(y + 1) * size + x];
      if ((a > 0) !== (b > 0)) {
        const px = ((x + 0.5) / size) * width;
        const py = ((y + 0.5) / size) * width;
        ctx.moveTo(px, py);
        ctx.lineTo(px + 1, py);
      }
      if ((a > 0) !== (c > 0)) {
        const px = ((x + 0.5) / size) * width;
        const py = ((y + 0.5) / size) * width;
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + 1);
      }
    }
  }
  ctx.stroke();

  // Brush ops
  ctx.save();
  for (const op of ops) {
    const half = bake.worldSize / 2;
    const cx = ((op.x + half) / bake.worldSize) * width;
    const cy = ((op.z + half) / bake.worldSize) * width;
    const rr = (op.radius / bake.worldSize) * width;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, rr), 0, Math.PI * 2);
    const col = op.kind === 'gulf' ? 'rgba(90,170,255,0.65)'
      : op.kind === 'flatten' ? 'rgba(255,210,90,0.7)'
      : op.kind === 'blob' ? 'rgba(150,230,150,0.6)' : 'rgba(255,150,120,0.5)';
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

export function exportMapPng(bake: HeightBake, ops: BrushOp[]) {
  downloadPng('world-map.png', drawMap(bake, ops));
}

/** 16-bit heightmap using R = high byte, G = low byte (compatible with Blender/Unity imports). */
export function exportHeightmapPng(bake: HeightBake) {
  const size = bake.size;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const range = bake.max - bake.min || 1;
  for (let i = 0; i < size * size; i++) {
    const t = (bake.heights[i] - bake.min) / range;
    const v = Math.round(Math.max(0, Math.min(1, t)) * 65535);
    img.data[i * 4] = (v >> 8) & 255;
    img.data[i * 4 + 1] = v & 255;
    img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  downloadPng(`world-heightmap-${size}-16bit.png`, canvas);
}

export function exportObj(bake: HeightBake) {
  const mesh = buildTerrainMesh(bake, { stride: Math.max(1, Math.floor(bake.size / 512)) });
  const lines: string[] = ['# Frontier world blockout terrain (SDF bake)', `# ${bake.size}² bake, ${bake.worldSize} m span`];
  const scale = 0.001; // metres -> kilometres keeps OBJ numbers readable
  for (let i = 0; i < mesh.positions.length; i += 3) {
    lines.push(`v ${(mesh.positions[i] * scale).toFixed(3)} ${(mesh.positions[i + 1] * scale).toFixed(3)} ${(mesh.positions[i + 2] * scale).toFixed(3)}`);
  }
  for (let i = 0; i < mesh.normals.length; i += 3) {
    lines.push(`vn ${mesh.normals[i].toFixed(4)} ${mesh.normals[i + 1].toFixed(4)} ${mesh.normals[i + 2].toFixed(4)}`);
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] + 1, b = mesh.indices[i + 1] + 1, c = mesh.indices[i + 2] + 1;
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  }
  download('world-terrain.obj', new Blob([lines.join('\n')], { type: 'text/plain' }));
}

export function exportWorldJson(
  world: { params: unknown; ops: BrushOp[] },
  cities: CityPlot[],
  settings: unknown,
) {
  const doc = {
    format: 'frontier.world-blockout/v1',
    units: 'metres',
    seaLevel: 0,
    params: world.params,
    ops: world.ops,
    cities: cities.map(c => ({ name: c.name, x: c.x, z: c.z, radius: c.radius, kind: c.kind })),
    ocean: settings,
    exportedAt: new Date().toISOString(),
  };
  download('world.json', new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
}

export function exportCoastSvg(coast: { points: [number, number][]; closed: boolean }[], bake: HeightBake) {
  const half = bake.worldSize / 2;
  const k = 1 / 1000;
  const paths = coast.map(c => {
    if (!c.points.length) return '';
    const d = c.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${((p[0] + half) * k).toFixed(2)},${((p[1] + half) * k).toFixed(2)}`).join(' ') + (c.closed ? ' Z' : '');
    return `<path d="${d}" fill="none" stroke="#f4efdc" stroke-width="0.5" />`;
  }).join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10000 10000" width="2000" height="2000">
<rect width="10000" height="10000" fill="#0b1b33"/>
${paths}
</svg>`;
  download('world-coastline.svg', new Blob([svg], { type: 'image/svg+xml' }));
}

export function exportSpectrumCsv(cascades: SpectrumCascade[]) {
  const rows = ['cascade_tile_m,kx,kz,kmag,omega_rad_s,phillips,amp_re,amp_im'];
  for (const c of cascades) {
    const n = c.cfg.size;
    const dk = (2 * Math.PI) / c.cfg.tile;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const kx = (ix <= n / 2 ? ix : ix - n) * dk;
        const kz = (iz <= n / 2 ? iz : iz - n) * dk;
        rows.push([c.cfg.tile, kx.toExponential(4), kz.toExponential(4), c.kmag[i].toExponential(4),
          c.omega[i].toExponential(4), c.phillips[i].toExponential(4),
          c.h0Re[i].toExponential(4), c.h0Im[i].toExponential(4)].join(','));
      }
    }
  }
  download('ocean-spectrum.csv', new Blob([rows.join('\n')], { type: 'text/csv' }));
}
