import * as THREE from 'three';
import { Rng, fbm } from '../util/noise.js';

// All surface detail is painted procedurally on 2D canvases so the prototype ships with zero binary assets.

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(canvas, srgb = true, repeat = false) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function grain(g, w, h, amount, seed, scale = 0.06) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (fbm(x * scale, y * scale, 3, seed) - 0.5) * 2 * amount + (Math.random() - 0.5) * amount * 0.35;
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, d[i] * (1 + n)));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * (1 + n)));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * (1 + n)));
    }
  }
  g.putImageData(img, 0, 0);
}
const rgba = (hex, a) => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};

// ---------------------------------------------------------------------------
// Petals and leaves. uv.x across the blade (0..1), uv.y base(0) -> tip(1).
const cache = new Map();

export const PETAL_PRESETS = {
  orchidPetal: {
    base: '#e9dfc4', mid: '#f6f1e4', tip: '#fbf8ef', edge: '#d8d0bd', edgeA: 0.45,
    vein: '#b9a98a', veinA: 0.28, veinCount: 38, blush: null, spots: null, dew: false, grain: 0.05,
  },
  orchidSepal: {
    base: '#e0d4b4', mid: '#efe8d6', tip: '#f8f4ea', edge: '#cfc5ad', edgeA: 0.5,
    vein: '#a89a7b', veinA: 0.25, veinCount: 30, blush: null, spots: null, dew: false, grain: 0.05,
  },
  orchidLip: {
    base: '#d9822b', mid: '#e9b36a', tip: '#f4ead2', edge: '#c8a064', edgeA: 0.3,
    vein: '#8c2f12', veinA: 0.5, veinCount: 26, blush: null,
    streaks: { color: '#9a2a10', count: 46, len: 0.55 }, spots: { color: '#b4401a', count: 40 }, dew: false, grain: 0.06,
  },
  orchidInner: {
    base: '#cf6d1c', mid: '#e8a24d', tip: '#f6c882', edge: '#a8480f', edgeA: 0.4,
    vein: '#7a2b0b', veinA: 0.4, veinCount: 22, grain: 0.07, dew: false,
  },
  lilyPetal: {
    base: '#f7ecee', mid: '#f0cfdc', tip: '#c3366f', edge: '#d6558a', edgeA: 0.55,
    vein: '#a8265e', veinA: 0.42, veinCount: 46,
    blush: { color: '#9b1459', at: 0.28, alpha: 0.9 }, spots: { color: '#a31f63', count: 70 }, dew: true, grain: 0.05,
  },
  lilyPetalPale: {
    base: '#fbf4f2', mid: '#f6e3e8', tip: '#e9a9c3', edge: '#e690b2', edgeA: 0.45,
    vein: '#c24a80', veinA: 0.3, veinCount: 40,
    blush: { color: '#c7326f', at: 0.2, alpha: 0.65 }, spots: { color: '#b52a6c', count: 40 }, dew: true, grain: 0.05,
  },
  lilySepal: {
    base: '#6aa04a', mid: '#a6c577', tip: '#e8b8c4', edge: '#cf6f95', edgeA: 0.5,
    vein: '#35682a', veinA: 0.4, veinCount: 30, dew: true, grain: 0.06,
  },
  lilyFilament: {
    base: '#f3d9e3', mid: '#c93b83', tip: '#8c0f4f', edge: '#8c0f4f', edgeA: 0.1,
    vein: '#8c0f4f', veinA: 0.2, veinCount: 6, grain: 0.04,
  },
  leafOrchid: {
    base: '#2f5a24', mid: '#3f7a2e', tip: '#5c9440', edge: '#27501f', edgeA: 0.4,
    vein: '#1b3d17', veinA: 0.35, veinCount: 24, midrib: '#9bc06a', grain: 0.07, dew: true,
  },
  leafLily: {
    base: '#35662a', mid: '#4d8a36', tip: '#8fb85a', edge: '#2a5a28', edgeA: 0.45,
    vein: '#1d4a1c', veinA: 0.35, veinCount: 32, midrib: '#c4dc94', grain: 0.07, dew: true,
  },
  leafWild: {
    base: '#4d8f3a', mid: '#79b24d', tip: '#aacf6a', edge: '#3f7a31', edgeA: 0.3,
    vein: '#2f6a2c', veinA: 0.3, veinCount: 20, midrib: '#d1e8a2', grain: 0.07, dew: false,
  },
};

export function petalTextures(name) {
  if (cache.has(name)) return cache.get(name);
  const o = PETAL_PRESETS[name];
  const W = 256, H = 512;
  const rng = new Rng(name.length * 977 + name.charCodeAt(0) * 31);
  const c = mk(W, H), g = c.getContext('2d', { willReadFrequently: true });
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, o.base);
  grad.addColorStop(0.5, o.mid);
  grad.addColorStop(1, o.tip);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  if (o.blush) {
    const b = g.createLinearGradient(0, 0, 0, H * o.blush.at * 2.4);
    b.addColorStop(0, rgba(o.blush.color, o.blush.alpha));
    b.addColorStop(1, rgba(o.blush.color, 0));
    g.fillStyle = b;
    g.fillRect(0, 0, W, H);
    // ragged blush front
    for (let i = 0; i < 160; i++) {
      const x = rng.next() * W, y = H * o.blush.at * rng.range(0.9, 2.1);
      const r = rng.range(6, 26);
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba(o.blush.color, 0.10));
      rg.addColorStop(1, rgba(o.blush.color, 0));
      g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // edge tint
  const eg = g.createLinearGradient(0, 0, W, 0);
  eg.addColorStop(0, rgba(o.edge, o.edgeA));
  eg.addColorStop(0.16, rgba(o.edge, 0));
  eg.addColorStop(0.84, rgba(o.edge, 0));
  eg.addColorStop(1, rgba(o.edge, o.edgeA));
  g.fillStyle = eg; g.fillRect(0, 0, W, H);

  // bump canvas shares the vein layout
  const bc = mk(W, H), bg = bc.getContext('2d');
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, W, H);
  // roughness canvas
  const rc = mk(W, H), rg2 = rc.getContext('2d');
  rg2.fillStyle = '#9a9a9a'; rg2.fillRect(0, 0, W, H);

  // veins: fan from base
  g.lineCap = 'round'; bg.lineCap = 'round';
  for (let i = 0; i < o.veinCount; i++) {
    const t = (i + 0.5) / o.veinCount;
    const xEnd = W * (0.04 + 0.92 * t);
    const xStart = W * (0.5 + (t - 0.5) * 0.18);
    const yEnd = H * (0.02 + 0.28 * Math.pow(Math.abs(t - 0.5) * 2, 1.7));
    const cx = W * (0.5 + (t - 0.5) * 0.95), cy = H * 0.5;
    g.strokeStyle = rgba(o.vein, o.veinA * rng.range(0.4, 1));
    g.lineWidth = rng.range(0.7, 1.8);
    g.beginPath(); g.moveTo(xStart, H); g.quadraticCurveTo(cx, cy, xEnd, yEnd); g.stroke();
    bg.strokeStyle = 'rgba(40,40,40,0.55)';
    bg.lineWidth = g.lineWidth * 1.2;
    bg.beginPath(); bg.moveTo(xStart, H); bg.quadraticCurveTo(cx, cy, xEnd, yEnd); bg.stroke();
  }
  if (o.midrib) {
    g.strokeStyle = rgba(o.midrib, 0.75); g.lineWidth = 5;
    g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, H * 0.03); g.stroke();
    bg.strokeStyle = 'rgba(210,210,210,0.9)'; bg.lineWidth = 6;
    bg.beginPath(); bg.moveTo(W / 2, H); bg.lineTo(W / 2, H * 0.03); bg.stroke();
    // side veins
    for (let i = 0; i < o.veinCount; i++) {
      const y = H * (0.95 - 0.9 * (i / o.veinCount));
      for (const s of [-1, 1]) {
        g.strokeStyle = rgba(o.vein, o.veinA * 0.8); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(W / 2, y);
        g.quadraticCurveTo(W / 2 + s * W * 0.22, y - H * 0.05, W / 2 + s * W * 0.46, y - H * 0.11); g.stroke();
        bg.strokeStyle = 'rgba(55,55,55,0.6)'; bg.lineWidth = 1.6;
        bg.beginPath(); bg.moveTo(W / 2, y);
        bg.quadraticCurveTo(W / 2 + s * W * 0.22, y - H * 0.05, W / 2 + s * W * 0.46, y - H * 0.11); bg.stroke();
      }
    }
  }
  if (o.streaks) {
    for (let i = 0; i < o.streaks.count; i++) {
      const x = rng.range(0.15, 0.85) * W;
      const y0 = H * rng.range(0.7, 1.0), y1 = y0 - H * o.streaks.len * rng.range(0.3, 1);
      g.strokeStyle = rgba(o.streaks.color, rng.range(0.25, 0.7)); g.lineWidth = rng.range(1, 3.4);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + rng.range(-10, 10), y1); g.stroke();
    }
  }
  if (o.spots) {
    for (let i = 0; i < o.spots.count; i++) {
      const x = rng.range(0.15, 0.85) * W, y = rng.range(0.1, 0.95) * H, r = rng.range(1.4, 4.5);
      g.fillStyle = rgba(o.spots.color, rng.range(0.2, 0.6));
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }
  grain(g, W, H, o.grain ?? 0.05, name.length + 3, 0.05);
  // micro-wrinkle in bump
  grain(bg, W, H, 0.12, 9, 0.11);

  if (o.dew) {
    for (let i = 0; i < 70; i++) {
      const x = rng.range(0.1, 0.9) * W, y = rng.range(0.05, 0.9) * H, r = rng.range(2, 7);
      const d = rg2.createRadialGradient(x, y, 0, x, y, r);
      d.addColorStop(0, 'rgba(0,0,0,1)'); d.addColorStop(0.85, 'rgba(0,0,0,1)'); d.addColorStop(1, 'rgba(0,0,0,0)');
      rg2.fillStyle = d; rg2.beginPath(); rg2.arc(x, y, r, 0, 7); rg2.fill();
      const b = bg.createRadialGradient(x, y, 0, x, y, r);
      b.addColorStop(0, 'rgba(255,255,255,1)'); b.addColorStop(1, 'rgba(255,255,255,0)');
      bg.fillStyle = b; bg.beginPath(); bg.arc(x, y, r, 0, 7); bg.fill();
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.arc(x, y, r * 0.8, 0, 7); g.fill();
    }
  }
  const out = { map: tex(c), bump: tex(bc, false), rough: tex(rc, false) };
  cache.set(name, out);
  return out;
}

// ---------------------------------------------------------------------------
// Stems: uv.x around, uv.y along. Longitudinal streaks, lenticels, tonal drift.
export function stemTexture(name) {
  const key = 'stem_' + name;
  if (cache.has(key)) return cache.get(key);
  const presets = {
    orchid: { a: '#58601f', b: '#7a8230', c: '#3d4414', spot: '#c9c78a' },
    lily: { a: '#4a5a24', b: '#6f7f35', c: '#3a2a22', spot: '#d9a3b0' },
    briar: { a: '#3b3a22', b: '#59582f', c: '#2a1d17', spot: '#8d7d5a' },
  };
  const p = presets[name];
  const W = 128, H = 512;
  const c = mk(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = p.a; g.fillRect(0, 0, W, H);
  const rng = new Rng(11 + name.length);
  for (let i = 0; i < 260; i++) {
    const x = rng.next() * W;
    g.strokeStyle = rgba(rng.next() < 0.5 ? p.b : p.c, rng.range(0.15, 0.5));
    g.lineWidth = rng.range(0.8, 3.2);
    g.beginPath(); g.moveTo(x, rng.range(0, H)); g.lineTo(x + rng.range(-3, 3), rng.range(0, H)); g.stroke();
  }
  for (let i = 0; i < 90; i++) {
    g.fillStyle = rgba(p.spot, rng.range(0.15, 0.45));
    const x = rng.next() * W, y = rng.next() * H;
    g.beginPath(); g.ellipse(x, y, rng.range(1, 2.4), rng.range(2, 6), 0, 0, 7); g.fill();
  }
  grain(g, W, H, 0.12, 5, 0.09);
  const t = tex(c, true, true);
  const out = { map: t };
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Predator skin / interior / eye.
export function skinTexture(kind) {
  const key = 'skin_' + kind;
  if (cache.has(key)) return cache.get(key);
  const W = 512, H = 512;
  const c = mk(W, H), g = c.getContext('2d', { willReadFrequently: true });
  const bc = mk(W, H), bg = bc.getContext('2d');
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, W, H);
  const rng = new Rng(kind === 'bone' ? 71 : 113);
  if (kind === 'bone') {
    // ivory serpent skull: warm bone with hairline cracks and scute plates
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#f1ebdd'); grad.addColorStop(1, '#d8cdb3');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    grain(g, W, H, 0.09, 31, 0.03);
    // plate seams (voronoi-ish)
    const pts = Array.from({ length: 60 }, () => [rng.next() * W, rng.next() * H]);
    const img = g.getImageData(0, 0, W, H); const d = img.data;
    const bimg = bg.getImageData(0, 0, W, H); const bd = bimg.data;
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      let m1 = 1e9, m2 = 1e9;
      for (let k = 0; k < pts.length; k++) {
        for (const ox of [-W, 0, W]) {
          const dx = pts[k][0] + ox - x, dy = pts[k][1] - y; const dd = dx * dx + dy * dy;
          if (dd < m1) { m2 = m1; m1 = dd; } else if (dd < m2) m2 = dd;
        }
      }
      const edge = Math.sqrt(m2) - Math.sqrt(m1);
      const i = (y * W + x) * 4;
      const s = edge < 2.6 ? 0.78 + edge * 0.08 : 1;
      d[i] *= s; d[i + 1] *= s * 0.99; d[i + 2] *= s * 0.97;
      const bv = edge < 3.2 ? 70 + edge * 18 : 128 + Math.min(40, (edge - 3.2) * 1.4);
      bd[i] = bd[i + 1] = bd[i + 2] = bv; bd[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); bg.putImageData(bimg, 0, 0);
    // dark orange resin cracks, as in the reference
    for (let i = 0; i < 18; i++) {
      let x = rng.next() * W, y = rng.next() * H;
      g.strokeStyle = rgba('#a4501a', rng.range(0.4, 0.8)); g.lineWidth = rng.range(1, 2.4);
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 8; s++) { x += rng.range(-18, 18); y += rng.range(4, 20); g.lineTo(x, y); }
      g.stroke();
    }
  } else {
    // briar-lily husk: green-brown flesh blushed with magenta, ridged
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#5a3a3a'); grad.addColorStop(0.5, '#7a4a58'); grad.addColorStop(1, '#4e5b2f');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const x = rng.next() * W;
      g.strokeStyle = rgba(rng.next() < 0.5 ? '#c24a80' : '#2f3a1e', rng.range(0.1, 0.35)); g.lineWidth = rng.range(2, 9);
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 30, H * 0.3, x - 30, H * 0.6, x + rng.range(-20, 20), H); g.stroke();
      bg.strokeStyle = 'rgba(40,40,40,0.5)'; bg.lineWidth = 3;
      bg.beginPath(); bg.moveTo(x, 0); bg.bezierCurveTo(x + 30, H * 0.3, x - 30, H * 0.6, x, H); bg.stroke();
    }
    grain(g, W, H, 0.14, 41, 0.04);
  }
  grain(bg, W, H, 0.1, 12, 0.08);
  const out = { map: tex(c, true, true), bump: tex(bc, false, true) };
  cache.set(key, out);
  return out;
}

export function eyeTexture() {
  if (cache.has('eye')) return cache.get('eye');
  const W = 1024, H = 512;
  const c = mk(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#e8e1c2'; g.fillRect(0, 0, W, H);
  // iris centred on the +Z pole of three's SphereGeometry => (u=0.25, v=0.5)
  const cx = W * 0.25, cy = H * 0.5, R = H * 0.34;
  const iris = g.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
  iris.addColorStop(0, '#e1d34a'); iris.addColorStop(0.55, '#8f9a1e'); iris.addColorStop(0.9, '#3f5a12'); iris.addColorStop(1, '#1d2c0a');
  g.fillStyle = iris; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
  const rng = new Rng(5);
  for (let i = 0; i < 260; i++) {
    const a = rng.next() * Math.PI * 2, r0 = R * rng.range(0.12, 0.3), r1 = R * rng.range(0.6, 1.0);
    g.strokeStyle = rgba(rng.next() < 0.5 ? '#d8ca3a' : '#26380c', rng.range(0.15, 0.5)); g.lineWidth = rng.range(0.8, 2.2);
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  // vertical slit pupil
  g.fillStyle = '#050505'; g.beginPath(); g.ellipse(cx, cy, R * 0.15, R * 0.82, 0, 0, 7); g.fill();
  // faint vessels in the sclera
  for (let i = 0; i < 30; i++) {
    const a = rng.next() * 6.28; g.strokeStyle = rgba('#a23', 0.15); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.quadraticCurveTo(cx + Math.cos(a + 0.3) * R * 1.4, cy + Math.sin(a) * R * 1.3, cx + Math.cos(a) * R * 1.9, cy + Math.sin(a) * R * 1.9); g.stroke();
  }
  const t = tex(c); cache.set('eye', t); return t;
}

// Tileable ground detail.
export function groundTexture() {
  if (cache.has('ground')) return cache.get('ground');
  const S = 512;
  const c = mk(S, S), g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(S, S); const d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n1 = fbm(x / 64, y / 64, 4, 2, 8);
    const n2 = fbm(x / 9, y / 9, 3, 7, 57);
    const moss = Math.max(0, Math.min(1, (n1 - 0.35) * 2.2));
    const r = 54 + 40 * (1 - moss) + n2 * 28, gg = 62 + 36 * moss + n2 * 24, b = 34 + 12 * (1 - moss) + n2 * 10;
    const i = (y * S + x) * 4;
    d[i] = r * 0.8; d[i + 1] = gg * 0.85; d[i + 2] = b * 0.75; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, true, true); cache.set('ground', t); return t;
}

export function softDotTexture() {
  if (cache.has('dot')) return cache.get('dot');
  const c = mk(64, 64), g = c.getContext('2d', { willReadFrequently: true });
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = tex(c); cache.set('dot', t); return t;
}
