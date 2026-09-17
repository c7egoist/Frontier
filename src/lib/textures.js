// Procedural canvas textures. Everything here is drawn at runtime, no image files.
// Materials are generated near-neutral (light grey) so a single cached map can be
// tinted by many material colours — keeps GPU memory flat across a whole street.
import * as THREE from 'three';
import { hashStringToSeed, Rng } from './prng.js';

const hasDOM = typeof document !== 'undefined';
const cache = new Map();
const MAX_CACHE = 96;

export function textureCacheSize() {
  return cache.size;
}

export function clearTextureCache() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
}

/** CJK / latin font stack that degrades gracefully. */
export const JP_FONT =
  '"Noto Sans JP","Noto Sans CJK JP","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo","MS PGothic","Source Han Sans JP",sans-serif';
export const JP_SERIF =
  '"Noto Serif JP","Noto Serif CJK JP","Hiragino Mincho ProN","Yu Mincho","MS PMincho","Source Han Serif JP",' +
  // fall back to the CJK sans families so text never renders as tofu boxes
  '"Yu Gothic","Meiryo","MS PGothic","Noto Sans JP","Noto Sans CJK JP",serif';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return { canvas: c, ctx };
}

function toTexture(canvas, { repeat = [1, 1], srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function cached(key, build) {
  if (!hasDOM) return null;
  if (cache.has(key)) return cache.get(key);
  const tex = build();
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    cache.get(first)?.dispose?.();
    cache.delete(first);
  }
  cache.set(key, tex);
  return tex;
}

function valueNoise(ctx, w, h, amount = 14, alpha = 0.25, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const r = new Rng(1234);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r.float() - 0.5) * amount * 2;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + (mono ? n : (r.float() - 0.5) * amount * 2)));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + (mono ? n : (r.float() - 0.5) * amount * 2)));
  }
  ctx.putImageData(img, 0, 0);
  if (alpha < 1) {
    ctx.globalAlpha = 1 - alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.globalAlpha = 1;
  }
}

function noiseOverlay(ctx, w, h, count, minR, maxR, colors, alpha = 0.08) {
  const r = new Rng(count * 7 + 3);
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[r.int(0, colors.length - 1)];
    ctx.beginPath();
    ctx.arc(r.float(0, w), r.float(0, h), r.float(minR, maxR), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Base materials                                                      */
/* ------------------------------------------------------------------ */

export function woodTexture(key = 'cedar', opts = {}) {
  return cached(`wood:${key}:${opts.planks || 0}`, () => {
    const w = 512;
    const h = 512;
    const { canvas, ctx } = makeCanvas(w, h);
    const r = new Rng(hashStringToSeed(key) || 7);
    const base = 232;
    ctx.fillStyle = `rgb(${base},${base - 4},${base - 12})`;
    ctx.fillRect(0, 0, w, h);
    const planks = opts.planks || (key === 'bamboo' ? 8 : key === 'board' ? 5 : 0);
    const grainDensity = { hinoki: 90, cedar: 130, walnut: 150, weathered: 110, bamboo: 60, ebony: 140 }[key] ?? 120;

    if (planks) {
      const pw = w / planks;
      for (let p = 0; p < planks; p++) {
        const shade = r.float(-16, 12);
        ctx.fillStyle = `rgba(${120 + shade},${116 + shade},${106 + shade},0.5)`;
        ctx.fillRect(p * pw, 0, pw - 1.5, h);
        // vertical grain inside each plank
        for (let i = 0; i < grainDensity / 3; i++) {
          const x = p * pw + r.float(2, pw - 2);
          ctx.strokeStyle = `rgba(${r.float(60, 130)},${r.float(56, 118)},${r.float(48, 105)},${r.float(0.03, 0.13)})`;
          ctx.lineWidth = r.float(0.4, 1.6);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          let cx = x;
          for (let y = 0; y <= h; y += 16) {
            cx += Math.sin((y + p * 40) * 0.03) * 1.1 + r.float(-0.5, 0.5);
            ctx.lineTo(cx, y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,34,28,0.22)';
        ctx.fillRect(p * pw, 0, 1.2, h);
      }
    } else {
      // horizontal grain streaks
      for (let i = 0; i < grainDensity; i++) {
        const y = r.float(0, h);
        const v = r.float(70, 190);
        ctx.strokeStyle = `rgba(${v},${v * 0.94},${v * 0.86},${r.float(0.04, 0.16)})`;
        ctx.lineWidth = r.float(0.5, 2.4);
        ctx.beginPath();
        ctx.moveTo(-10, y);
        let cy = y;
        for (let x = 0; x <= w + 10; x += 18) {
          cy += Math.sin((x + i * 30) * 0.02) * 0.9 + r.float(-0.45, 0.45);
          ctx.lineTo(x, cy);
        }
        ctx.stroke();
      }
    }
    // knots
    const knots = r.int(1, 4);
    for (let k = 0; k < knots; k++) {
      const x = r.float(20, w - 20);
      const y = r.float(20, h - 20);
      const rad = r.float(5, 13);
      const g = ctx.createRadialGradient(x, y, 1, x, y, rad);
      g.addColorStop(0, 'rgba(58,44,32,0.75)');
      g.addColorStop(0.55, 'rgba(120,96,70,0.35)');
      g.addColorStop(1, 'rgba(140,120,96,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * r.float(0.6, 1), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (key === 'weathered') {
      noiseOverlay(ctx, w, h, 260, 2, 14, ['#9aa0a2', '#7d8385', '#b8bcbd'], 0.16);
      ctx.fillStyle = 'rgba(90,96,98,0.10)';
      ctx.fillRect(0, 0, w, h);
    }
    if (key === 'ebony') {
      ctx.fillStyle = 'rgba(20,16,14,0.35)';
      ctx.fillRect(0, 0, w, h);
    }
    valueNoise(ctx, w, h, 8, 0.5);
    return toTexture(canvas, { repeat: [1, 1] });
  });
}

export function plasterTexture() {
  return cached('plaster', () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = '#f2efe7';
    ctx.fillRect(0, 0, 512, 512);
    const r = new Rng(99);
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(${r.float(190, 240)},${r.float(186, 236)},${r.float(178, 226)},${r.float(0.05, 0.2)})`;
      ctx.beginPath();
      ctx.arc(r.float(0, 512), r.float(0, 512), r.float(6, 46), 0, Math.PI * 2);
      ctx.fill();
    }
    // faint trowel streaks
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(160,156,146,${r.float(0.02, 0.07)})`;
      ctx.lineWidth = r.float(3, 14);
      ctx.beginPath();
      const y = r.float(0, 512);
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + r.float(-40, 40), 340, y + r.float(-40, 40), 512, y + r.float(-25, 25));
      ctx.stroke();
    }
    // hairline cracks
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = 'rgba(120,116,108,0.25)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      let x = r.float(0, 512);
      let y = r.float(0, 512);
      ctx.moveTo(x, y);
      for (let s = 0; s < 22; s++) {
        x += r.float(-16, 16);
        y += r.float(-16, 16);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    valueNoise(ctx, 512, 512, 6, 0.5);
    return toTexture(canvas);
  });
}

export function stoneTexture(seedKey = 'stone') {
  return cached(`stone:${seedKey}`, () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = '#c9c6bf';
    ctx.fillRect(0, 0, 512, 512);
    const r = new Rng(hashStringToSeed(seedKey) || 5);
    const rows = 5;
    const rh = 512 / rows;
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * 60;
      for (let j = -1; j < 5; j++) {
        const bw = 512 / 4;
        const x = j * bw + off;
        ctx.fillStyle = `rgba(${r.float(150, 205)},${r.float(148, 200)},${r.float(140, 190)},1)`;
        ctx.fillRect(x + 2, i * rh + 2, bw - 4, rh - 4);
        ctx.strokeStyle = 'rgba(90,88,84,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, i * rh + 2, bw - 4, rh - 4);
      }
    }
    noiseOverlay(ctx, 512, 512, 700, 0.6, 3.4, ['#8d8a83', '#e6e2d9', '#b0aca4'], 0.22);
    valueNoise(ctx, 512, 512, 12, 0.5);
    return toTexture(canvas);
  });
}

export function concreteTexture() {
  return cached('concrete', () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = '#cfcdc8';
    ctx.fillRect(0, 0, 512, 512);
    noiseOverlay(ctx, 512, 512, 900, 0.5, 3, ['#b6b4af', '#e2e0dc', '#a09e9a'], 0.2);
    const r = new Rng(41);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(120,118,114,${r.float(0.02, 0.07)})`;
      ctx.fillRect(r.float(0, 512), 0, r.float(2, 26), 512);
    }
    ctx.fillStyle = 'rgba(110,108,104,0.12)';
    ctx.fillRect(0, 506, 512, 6);
    valueNoise(ctx, 512, 512, 9, 0.5);
    return toTexture(canvas);
  });
}

export function paperTexture() {
  return cached('paper', () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = '#fdf6e4';
    ctx.fillRect(0, 0, 256, 256);
    const r = new Rng(17);
    for (let i = 0; i < 200; i++) {
      ctx.strokeStyle = `rgba(${r.float(210, 245)},${r.float(200, 238)},${r.float(178, 220)},${r.float(0.05, 0.2)})`;
      ctx.lineWidth = r.float(0.6, 2.2);
      const x = r.float(0, 256);
      const y = r.float(0, 256);
      const a = r.float(0, Math.PI);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r.float(8, 44), y + Math.sin(a) * r.float(8, 44));
      ctx.stroke();
    }
    valueNoise(ctx, 256, 256, 5, 0.5);
    return toTexture(canvas, { repeat: [2, 2] });
  });
}

export function roofUnderTexture() {
  return cached('roofUnder', () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = '#6f6b66';
    ctx.fillRect(0, 0, 256, 256);
    const r = new Rng(3);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${r.float(70, 150)},${r.float(68, 145)},${r.float(66, 140)},${r.float(0.04, 0.16)})`;
      ctx.fillRect(0, r.float(0, 256), 256, r.float(1, 5));
    }
    valueNoise(ctx, 256, 256, 10, 0.5);
    return toTexture(canvas, { repeat: [4, 4] });
  });
}

export function thatchTexture() {
  return cached('thatch', () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = '#d8c89a';
    ctx.fillRect(0, 0, 512, 512);
    const r = new Rng(23);
    for (let i = 0; i < 1400; i++) {
      ctx.strokeStyle = `rgba(${r.float(140, 215)},${r.float(125, 195)},${r.float(80, 150)},${r.float(0.1, 0.4)})`;
      ctx.lineWidth = r.float(0.7, 2.2);
      const x = r.float(0, 512);
      const y = r.float(0, 512);
      const len = r.float(18, 70);
      const tilt = r.float(-0.25, 0.25);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + tilt * len, y + len);
      ctx.stroke();
    }
    valueNoise(ctx, 512, 512, 8, 0.5);
    return toTexture(canvas, { repeat: [3, 2] });
  });
}

export function metalTexture() {
  return cached('metal', () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = '#d6d8da';
    ctx.fillRect(0, 0, 256, 256);
    const r = new Rng(11);
    for (let i = 0; i < 420; i++) {
      ctx.strokeStyle = `rgba(${r.float(150, 240)},${r.float(150, 240)},${r.float(150, 240)},${r.float(0.03, 0.14)})`;
      ctx.lineWidth = r.float(0.4, 1.3);
      const y = r.float(0, 256);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y + r.float(-1, 1));
      ctx.stroke();
    }
    valueNoise(ctx, 256, 256, 6, 0.5);
    return toTexture(canvas);
  });
}

export function earthTexture() {
  return cached('earth', () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = '#8d8677';
    ctx.fillRect(0, 0, 512, 512);
    noiseOverlay(ctx, 512, 512, 1200, 1, 6, ['#6f695c', '#a49c8a', '#5d574c'], 0.24);
    valueNoise(ctx, 512, 512, 10, 0.5);
    return toTexture(canvas, { repeat: [8, 8] });
  });
}

export function asphaltTexture() {
  return cached('asphalt', () => {
    const { canvas, ctx } = makeCanvas(512, 512);
    ctx.fillStyle = '#54565a';
    ctx.fillRect(0, 0, 512, 512);
    noiseOverlay(ctx, 512, 512, 2600, 0.5, 2.6, ['#3d3f42', '#6d7075', '#2f3134'], 0.3);
    const r = new Rng(64);
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = `rgba(30,30,32,${r.float(0.05, 0.16)})`;
      ctx.lineWidth = r.float(1, 4);
      ctx.beginPath();
      let x = r.float(0, 512);
      let y = r.float(0, 512);
      ctx.moveTo(x, y);
      for (let s = 0; s < 14; s++) {
        x += r.float(-30, 30);
        y += r.float(-30, 30);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    valueNoise(ctx, 512, 512, 10, 0.5);
    return toTexture(canvas, { repeat: [10, 10] });
  });
}

export function tileTexture() {
  return cached('tile', () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = '#8c8a88';
    ctx.fillRect(0, 0, 256, 256);
    const r = new Rng(31);
    for (let i = 0; i < 26; i++) {
      const x = i * 10;
      ctx.fillStyle = `rgba(${r.float(90, 140)},${r.float(90, 138)},${r.float(88, 136)},${r.float(0.1, 0.3)})`;
      ctx.fillRect(x, 0, 5, 256);
    }
    noiseOverlay(ctx, 256, 256, 300, 1, 5, ['#6d6b69', '#a8a6a3'], 0.18);
    return toTexture(canvas, { repeat: [6, 6] });
  });
}

/* ------------------------------------------------------------------ */
/* Signage, posters, cloth                                             */
/* ------------------------------------------------------------------ */

function fitFont(ctx, text, maxW, maxH, family, weight = '700', startSize = 200) {
  let size = startSize;
  for (let i = 0; i < 40; i++) {
    ctx.font = `${weight} ${size}px ${family}`;
    const w = ctx.measureText(text).width;
    if (w <= maxW && size <= maxH) break;
    size *= 0.92;
    if (size < 6) break;
  }
  return size;
}

export function drawVerticalText(ctx, text, cx, top, cellH, color, family, weight = '700') {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.min(cellH * 0.86, 200);
  ctx.font = `${weight} ${size}px ${family}`;
  const chars = [...String(text).replace(/\s+/g, '')];
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx, top + cellH * (i + 0.5));
  }
}

export function drawHorizontalText(ctx, text, cx, cy, maxW, maxH, color, family, weight = '700') {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = fitFont(ctx, text, maxW, maxH, family, weight, maxH * 1.1);
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillText(text, cx, cy);
}

function grunge(ctx, w, h, seed = 5, strength = 0.16) {
  const r = new Rng(seed);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(${r.float(20, 90)},${r.float(20, 90)},${r.float(20, 90)},${r.float(0.01, strength * 0.1)})`;
    ctx.beginPath();
    ctx.arc(r.float(0, w), r.float(0, h), r.float(2, 26), 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${r.float(0.01, 0.05)})`;
    ctx.lineWidth = r.float(0.5, 2);
    ctx.beginPath();
    const x = r.float(0, w);
    ctx.moveTo(x, 0);
    ctx.lineTo(x + r.float(-20, 20), h);
    ctx.stroke();
  }
}

/** Main shop sign / kanban board. */
export function signTexture(opts = {}) {
  const {
    text = '商店',
    sub = '',
    bg = '#b8242a',
    fg = '#f6f1e4',
    border = '#2a221c',
    vertical = false,
    family = JP_SERIF,
    style = 'board',
    w = 512,
    h = 256,
    seed = 3,
  } = opts;
  const key = `sign:${text}|${sub}|${bg}|${fg}|${border}|${vertical}|${family}|${style}|${w}x${h}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (style === 'board') {
      ctx.strokeStyle = border;
      ctx.lineWidth = Math.max(6, Math.min(w, h) * 0.05);
      ctx.strokeRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 2;
      ctx.strokeRect(ctx.lineWidth * 2.4, ctx.lineWidth * 2.4, w - ctx.lineWidth * 4.8, h - ctx.lineWidth * 4.8);
    }
    if (vertical) {
      const lines = [...String(text).replace(/\s+/g, '').split('')].length;
      const cell = (h * 0.92) / Math.max(1, lines);
      drawVerticalText(ctx, text, w / 2, h * 0.04, cell, fg, family);
      if (sub) {
        ctx.save();
        ctx.translate(w * 0.14, h * 0.5);
        ctx.rotate(-Math.PI / 2);
        drawHorizontalText(ctx, sub, 0, 0, h * 0.8, w * 0.16, fg, JP_FONT, '500');
        ctx.restore();
      }
    } else {
      const hasSub = !!sub;
      drawHorizontalText(ctx, text, w / 2, hasSub ? h * 0.4 : h * 0.5, w * 0.86, h * (hasSub ? 0.5 : 0.62), fg, family);
      if (hasSub) drawHorizontalText(ctx, sub, w / 2, h * 0.78, w * 0.8, h * 0.2, fg, JP_FONT, '500');
    }
    grunge(ctx, w, h, seed);
    return toTexture(canvas);
  });
}

/** Neon tube lettering on a transparent ground. */
export function neonTexture(opts = {}) {
  const { text = '営業中', color = '#ff5a7a', vertical = false, sub = '', w = 512, h = 128 } = opts;
  const key = `neon:${text}|${sub}|${color}|${vertical}|${w}x${h}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    ctx.lineJoin = 'round';
    const paint = (fill) => {
      ctx.fillStyle = fill;
      if (vertical) {
        const n = Math.max(1, [...String(text)].length);
        drawVerticalText(ctx, text, w / 2, h * 0.05, (h * 0.9) / n, fill, JP_SERIF);
      } else {
        drawHorizontalText(ctx, text, w / 2, sub ? h * 0.38 : h * 0.5, w * 0.9, h * (sub ? 0.48 : 0.62), fill, JP_SERIF);
        if (sub) drawHorizontalText(ctx, sub, w / 2, h * 0.78, w * 0.85, h * 0.24, fill, JP_FONT, '500');
      }
    };
    paint(color);
    paint(color);
    ctx.shadowBlur = 0;
    paint('#fffdf6');
    const t = toTexture(canvas);
    return t;
  });
}

/** Noren curtain over a doorway. */
export function norenTexture(opts = {}) {
  const { text = 'そば', bg = '#1e3a5f', fg = '#f4efe3', accent = '#f4efe3', family = JP_SERIF } = opts;
  const key = `noren:${text}|${bg}|${fg}|${accent}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(512, 256);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 256);
    // weave
    const r = new Rng(77);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(255,255,255,${r.float(0.01, 0.05)})`;
      ctx.fillRect(r.float(0, 512), r.float(0, 256), r.float(2, 10), 1);
    }
    const chars = [...String(text).replace(/\s+/g, '')];
    const y = 128;
    const cell = Math.min(110, 380 / Math.max(1, chars.length));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < chars.length; i++) {
      const cx = 256 + (i - (chars.length - 1) / 2) * cell * 1.05;
      ctx.beginPath();
      ctx.arc(cx, y, cell * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.14;
      ctx.fill();
      ctx.globalAlpha = 1;
      drawHorizontalText(ctx, chars[i], cx, y, cell * 0.8, cell * 0.86, fg, family);
    }
    ctx.restore();
    grunge(ctx, 512, 256, 12, 0.1);
    return toTexture(canvas);
  });
}

/** Chochin paper lantern wrap (ribs + vertical text). */
export function lanternTexture(opts = {}) {
  const { text = '', bg = '#d8362f', fg = '#fdf7e8', frame = '#1b1b1b' } = opts;
  const key = `lantern:${text}|${bg}|${fg}|${frame}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 6; y < 256; y += 14) {
      ctx.strokeStyle = `${frame}55`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    ctx.fillStyle = frame;
    ctx.fillRect(0, 0, 256, 12);
    ctx.fillRect(0, 244, 256, 12);
    if (text) {
      ctx.save();
      ctx.globalAlpha = 1;
      drawVerticalText(ctx, text, 128, 24, 200 / Math.max(1, [...text].length), fg, JP_SERIF);
      ctx.restore();
    }
    return toTexture(canvas);
  });
}

/** Nobori / vertical banner cloth. */
export function bannerTexture(opts = {}) {
  const { text = '大売出', bg = '#f2f0e6', fg = '#111', accent = '#b8242a' } = opts;
  const key = `banner:${text}|${bg}|${fg}|${accent}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(256, 768);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 768);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 256, 40);
    ctx.fillRect(0, 728, 256, 40);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 244, 756);
    drawVerticalText(ctx, text, 128, 54, (768 - 130) / Math.max(1, [...text].length), fg, JP_SERIF);
    grunge(ctx, 256, 768, 21, 0.12);
    return toTexture(canvas);
  });
}

/** Poster / flyer / A-board. */
export function posterTexture(opts = {}) {
  const {
    title = '求人',
    lines = [],
    bg = '#f4f1e6',
    fg = '#1d1d1d',
    accent = '#b8242a',
    style = 'plain',
    seed = 9,
    w = 384,
    h = 512,
  } = opts;
  const key = `poster:${title}|${lines.join('/')}|${bg}|${fg}|${accent}|${style}|${w}x${h}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(w, h);
    const r = new Rng(hashStringToSeed(key) + seed);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    const headH = h * 0.26;
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, headH);
    drawHorizontalText(ctx, title, w / 2, headH / 2, w * 0.88, headH * 0.7, style === 'inverse' ? bg : '#fffdf4', JP_SERIF);
    let y = headH + h * 0.09;
    if (style === 'photo') {
      const ph = h * 0.3;
      const g = ctx.createLinearGradient(0, y, w, y + ph);
      g.addColorStop(0, accent);
      g.addColorStop(1, bg);
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.1, y, w * 0.8, ph);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(w * 0.1, y + ph * 0.62, w * 0.8, ph * 0.38);
      y += ph + h * 0.07;
    }
    for (const line of lines) {
      const big = line.length <= 8;
      drawHorizontalText(
        ctx,
        line,
        w / 2,
        y,
        w * 0.86,
        big ? h * 0.11 : h * 0.07,
        line.startsWith('#') ? accent : fg,
        big ? JP_SERIF : JP_FONT,
        big ? '700' : '500'
      );
      y += big ? h * 0.13 : h * 0.09;
      if (y > h * 0.94) break;
    }
    if (r.bool(0.6)) {
      ctx.strokeStyle = `${accent}66`;
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, w - 16, h - 16);
    }
    grunge(ctx, w, h, seed + 4, 0.12);
    return toTexture(canvas);
  });
}

/** Restaurant menu board. */
export function menuTexture(opts = {}) {
  const { title = 'お品書き', items = [], bg = '#f7f2e4', fg = '#241f1a', accent = '#b8242a' } = opts;
  const key = `menu:${title}|${items.join('/')}|${bg}|${accent}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(384, 512);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 384, 512);
    ctx.strokeStyle = '#2c2620';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, 384, 512);
    drawVerticalText(ctx, title, 384 - 70, 40, 300 / Math.max(1, [...title].length), accent, JP_SERIF);
    let y = 90;
    ctx.textAlign = 'left';
    for (const it of items) {
      ctx.font = `600 ${34}px ${JP_FONT}`;
      ctx.fillStyle = fg;
      ctx.fillText(it[0], 34, y);
      ctx.strokeStyle = 'rgba(40,34,28,0.35)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(40 + ctx.measureText(it[0]).width + 10, y - 10);
      ctx.lineTo(230, y - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = accent;
      ctx.font = `700 ${34}px ${JP_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(it[1], 246, y);
      ctx.textAlign = 'left';
      y += 56;
      if (y > 470) break;
    }
    grunge(ctx, 384, 512, 8, 0.1);
    return toTexture(canvas);
  });
}

/** Vending machine face. */
export function vendingTexture(opts = {}) {
  const { brand = 'ドリンク', accent = '#c8202a', seed = 2 } = opts;
  const key = `vending:${brand}|${accent}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(256, 512);
    const r = new Rng(seed);
    ctx.fillStyle = '#f2f3f5';
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 256, 54);
    drawHorizontalText(ctx, brand, 128, 27, 220, 36, '#fff', JP_FONT);
    // product rows
    const cols = 4;
    const rows = 6;
    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        const x = 16 + cx * 56;
        const y = 76 + ry * 60;
        ctx.fillStyle = '#dfe3e8';
        ctx.fillRect(x, y, 46, 52);
        const hue = r.int(0, 360);
        ctx.fillStyle = `hsl(${hue},72%,52%)`;
        ctx.fillRect(x + 8, y + 6, 30, 32);
        ctx.fillStyle = '#f7f7f7';
        ctx.fillRect(x + 8, y + 34, 30, 8);
        ctx.fillStyle = '#3a3a3a';
        ctx.font = `700 10px ${JP_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('¥' + r.int(100, 190), x + 23, y + 50);
      }
    }
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, 448, 256, 64);
    ctx.fillStyle = '#8ad0ff';
    ctx.fillRect(14, 460, 52, 34);
    ctx.fillStyle = '#c9cdd3';
    ctx.fillRect(80, 462, 60, 12);
    ctx.fillRect(80, 482, 60, 12);
    ctx.fillStyle = accent;
    ctx.fillRect(160, 458, 82, 40);
    return toTexture(canvas);
  });
}

/** Striped cloth awning / parasol. */
export function stripeTexture(a = '#c8202a', b = '#f3efe2', repeat = 6) {
  const key = `stripe:${a}|${b}|${repeat}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, 256, 256);
    const w = 256 / repeat;
    ctx.fillStyle = a;
    for (let i = 0; i < repeat; i += 2) ctx.fillRect(i * w, 0, w, 256);
    const r = new Rng(6);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(0,0,0,${r.float(0.005, 0.03)})`;
      ctx.fillRect(r.float(0, 256), r.float(0, 256), r.float(1, 6), 1);
    }
    return toTexture(canvas, { repeat: [1, 2] });
  });
}

/** Plain cloth (noren strips, laundry, flags). */
export function clothTexture(color = '#1e3a5f') {
  const key = `cloth:${color}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(128, 128);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 128, 128);
    const r = new Rng(hashStringToSeed(color));
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(255,255,255,${r.float(0.005, 0.045)})`;
      ctx.fillRect(0, r.float(0, 128), 128, 1);
    }
    return toTexture(canvas, { repeat: [2, 2] });
  });
}

/** Emissive window lattice / interior glow map. */
export function glowTexture(color = '#ffcf87') {
  const key = `glow:${color}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(128, 128);
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, color);
    g.addColorStop(0.5, color);
    g.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const r = new Rng(hashStringToSeed(color) + 3);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(0,0,0,${r.float(0.02, 0.12)})`;
      ctx.beginPath();
      ctx.arc(r.float(0, 128), r.float(0, 128), r.float(3, 22), 0, Math.PI * 2);
      ctx.fill();
    }
    return toTexture(canvas);
  });
}

/** Sky gradient used as scene background / environment. */
export function skyTexture(top = '#1b2a52', mid = '#7d6a86', bottom = '#e0a163') {
  const key = `sky:${top}|${mid}|${bottom}`;
  return cached(key, () => {
    const { canvas, ctx } = makeCanvas(64, 256);
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.mapping = THREE.EquirectangularReflectionMapping;
    return t;
  });
}

export { hasDOM, makeCanvas };
