// Paving pattern tiles, drawn on canvas. One tile is TILE metres square; the 3D renderer maps
// world x/z onto it (planar UVs, so hubs and spans join without seams) and the plan view uses the
// same tile as a canvas pattern. Patterns: slab, brick, herringbone, hex, cobble, flag, plain.

import { rng, hash32 } from '../core/vec.js';

export const TILE = 1.2; // metres per tile
export const PATTERN_LABELS = {
  slab: 'Concrete slabs',
  brick: 'Running bond brick',
  herringbone: 'Herringbone',
  hex: 'Hexagon',
  cobble: 'Cobble',
  flag: 'Flagstone',
  plain: 'Plain',
};

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `rgb(${r},${g},${b})`;
}

/** draw one pattern tile into a canvas of px pixels */
export function drawTile(canvas, pattern, colour, px = 256) {
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  const s = px / TILE; // pixels per metre
  const seed = hash32(pattern + colour);
  const rand = rng(seed);
  const joint = shade(colour, 0.55);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, px, px);
  const unit = (m, fill) => {
    ctx.fillStyle = fill;
    return m;
  };
  const jw = Math.max(1, 0.012 * s);
  ctx.strokeStyle = joint;
  ctx.lineWidth = jw;
  if (pattern === 'slab') {
    const n = 2; // 2 x 2 slabs of 0.6 m per tile
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const f = 0.94 + rand() * 0.1;
        unit(0, shade(colour, f));
        ctx.fillRect((i * px) / n + jw, (j * px) / n + jw, px / n - 2 * jw, px / n - 2 * jw);
      }
    }
    ctx.strokeRect(0, 0, px, px);
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo((i * px) / n, 0);
      ctx.lineTo((i * px) / n, px);
      ctx.moveTo(0, (i * px) / n);
      ctx.lineTo(px, (i * px) / n);
      ctx.stroke();
    }
  } else if (pattern === 'brick') {
    const bw = px / 4; // 4 bricks per row
    const bh = px / 8; // 8 courses
    for (let row = 0; row < 8; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let c = -1; c < 5; c++) {
        const f = 0.9 + rand() * 0.18;
        ctx.fillStyle = shade(colour, f);
        ctx.fillRect(c * bw + off + jw, row * bh + jw, bw - 2 * jw, bh - 2 * jw);
      }
    }
    ctx.strokeStyle = joint;
    for (let row = 0; row <= 8; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * bh);
      ctx.lineTo(px, row * bh);
      ctx.stroke();
    }
  } else if (pattern === 'herringbone') {
    const bw = px / 6;
    const bh = bw / 3.5;
    for (let row = -1; row < 12; row++) {
      for (let col = -1; col < 8; col++) {
        const x = col * bw * 0.5 + (row % 2 ? bw * 0.25 : 0);
        const y = row * bh;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((col % 2 ? 1 : -1) * Math.PI) / 4);
        ctx.fillStyle = shade(colour, 0.93 + rand() * 0.14);
        ctx.fillRect(jw, jw, bw - 2 * jw, bh - 2 * jw);
        ctx.restore();
      }
    }
  } else if (pattern === 'hex') {
    const r = px / 5;
    const hh = r * Math.sqrt(3);
    for (let row = -1; row < 6; row++) {
      for (let col = -1; col < 6; col++) {
        const cx = col * r * 1.5;
        const cy = row * hh + (col % 2 ? hh / 2 : 0);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const x = cx + Math.cos(a) * r * 0.97;
          const y = cy + Math.sin(a) * r * 0.97;
          if (k) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = shade(colour, 0.92 + rand() * 0.16);
        ctx.fill();
        ctx.stroke();
      }
    }
  } else if (pattern === 'cobble') {
    for (let i = 0; i < 260; i++) {
      const x = rand() * px;
      const y = rand() * px;
      const rr = (0.035 + rand() * 0.03) * s;
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * (0.7 + rand() * 0.3), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = shade(colour, 0.7 + rand() * 0.45);
      ctx.fill();
      ctx.strokeStyle = joint;
      ctx.stroke();
    }
  } else if (pattern === 'flag') {
    for (let i = 0; i < 9; i++) {
      const cx = (i % 3) * (px / 3) + px / 6 + (rand() - 0.5) * 12;
      const cy = Math.floor(i / 3) * (px / 3) + px / 6 + (rand() - 0.5) * 12;
      const w = px / 3 - 6 + rand() * 6;
      const h = px / 3 - 6 + rand() * 6;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 3) : ctx.rect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillStyle = shade(colour, 0.9 + rand() * 0.2);
      ctx.fill();
      ctx.stroke();
    }
  } else {
    // plain: subtle mottling only
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = shade(colour, 0.94 + rand() * 0.1);
      ctx.fillRect(rand() * px, rand() * px, 6 + rand() * 18, 6 + rand() * 18);
    }
  }
  return canvas;
}

/** cached canvas per pattern+colour (browser only) */
const cache = new Map();
export function tileFor(pattern, colour) {
  const k = `${pattern}|${colour}`;
  if (!cache.has(k)) {
    const c = document.createElement('canvas');
    drawTile(c, pattern, colour, 256);
    cache.set(k, c);
  }
  return cache.get(k);
}
