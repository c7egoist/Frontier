// Procedural paving patterns. Each pattern is one tile (size = material.tile metres)
// drawn on a canvas. The same canvases are used for the 3D view and exported as PNG.

const SIZE = 256;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function base(ctx, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function speckle(ctx, rand, count, colors, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const r = rMin + rand() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rand() * SIZE, rand() * SIZE, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Fills a rectangle with a soft bevel so unit blocks read as individual stones.
function block(ctx, x, y, w, h, color, rand) {
  const jitter = (rand() - 0.5) * 0.12;
  ctx.fillStyle = shade(color, jitter);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, jitter + 0.08);
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y, 2, h);
  ctx.fillStyle = shade(color, jitter - 0.1);
  ctx.fillRect(x + w - 2, y, 2, h);
  ctx.fillRect(x, y + h - 2, w, 2);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt >= 0 ? (255 - c) * amt : c * amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

const PATTERNS = {
  asphalt(ctx) {
    const rand = rng(11);
    base(ctx, '#3a3e44');
    speckle(ctx, rand, 2600, ['#2e3238', '#454a52', '#4b5058', '#33373d'], 0.5, 1.6);
    speckle(ctx, rand, 60, ['#5a6068'], 1.5, 2.5);
  },
  concrete(ctx) {
    const rand = rng(23);
    base(ctx, '#b9bdc2');
    speckle(ctx, rand, 900, ['#aeb2b8', '#c5c9ce', '#a2a7ad'], 0.4, 1.2);
    ctx.strokeStyle = 'rgba(80,84,90,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  },
  slab(ctx) {
    const rand = rng(31);
    base(ctx, '#c9cbc7');
    const n = 2;
    const w = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) block(ctx, i * w + 1, j * w + 1, w - 2, w - 2, '#cfd1cd', rand);
    speckle(ctx, rand, 300, ['#bdbfbb', '#d6d8d4'], 0.4, 1.0);
  },
  herringbone(ctx) {
    const rand = rng(41);
    base(ctx, '#9c5c45');
    // herringbone: alternate bricks rotated +/-45 degrees in a 2x2 cell
    const bw = 64;
    const bh = 32;
    for (let row = 0; row < SIZE / bh; row++) {
      for (let col = 0; col < SIZE / bw; col++) {
        const x = col * bw;
        const y = row * bh;
        const flip = (row + col) % 2 === 0;
        ctx.save();
        ctx.translate(x + bw / 2, y + bh / 2);
        ctx.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
        ctx.translate(-bw / 2, -bh / 2);
        block(ctx, 0, 0, bw * 0.7, bh * 0.7, shadeRand('#a4644a', rand), rand);
        ctx.restore();
      }
    }
    ctx.strokeStyle = 'rgba(60,40,30,0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= SIZE; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, SIZE);
      ctx.stroke();
    }
  },
  brick(ctx) {
    const rand = rng(53);
    base(ctx, '#a96b4f');
    const bw = 128;
    const bh = 42;
    for (let row = 0; row * bh < SIZE + bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < SIZE + bw; x += bw) block(ctx, x + off + 1, row * bh + 1, bw - 2, bh - 2, shadeRand('#ad7055', rand), rand);
    }
  },
  cobble(ctx) {
    const rand = rng(67);
    base(ctx, '#66635d');
    for (let i = 0; i < 260; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      const r = 7 + rand() * 5;
      const g = 110 + Math.floor(rand() * 60);
      ctx.fillStyle = `rgb(${g},${g - 6},${g - 14})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.8, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,38,35,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  },
  paver(ctx) {
    const rand = rng(79);
    base(ctx, '#8e9a8e');
    const cell = 64;
    for (let i = 0; i < SIZE / cell; i++) for (let j = 0; j < SIZE / cell; j++) block(ctx, i * cell + 2, j * cell + 2, cell - 4, cell - 4, '#9aa69a', rand);
    // grid openings (grass-filled joints)
    ctx.fillStyle = '#5f7a4a';
    for (let i = 0; i < SIZE / cell; i++) for (let j = 0; j < SIZE / cell; j++) {
      ctx.beginPath();
      ctx.arc(i * cell + cell / 2, j * cell + cell / 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  gravel(ctx) {
    const rand = rng(97);
    base(ctx, '#b5a88a');
    speckle(ctx, rand, 1400, ['#a39876', '#c9bf9f', '#8f8466', '#d6cdb2'], 0.8, 2.4);
  },
  grass(ctx) {
    const rand = rng(101);
    base(ctx, '#6c7c4e');
    speckle(ctx, rand, 2200, ['#5f7043', '#7a8b58', '#56663c', '#83935f'], 0.6, 1.8);
  },
};

function shadeRand(hex, rand) {
  return shade(hex, (rand() - 0.5) * 0.14);
}

const cache = new Map();

export const TEXTURE_NAMES = Object.keys(PATTERNS);

// Returns a canvas for the named pattern (browser only). Cached.
export function patternCanvas(name) {
  if (cache.has(name)) return cache.get(name);
  if (typeof document === 'undefined' || !PATTERNS[name]) return null;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  PATTERNS[name](c.getContext('2d'));
  cache.set(name, c);
  return c;
}

// PNG bytes of a pattern (browser only; used by the bundle exporter).
export async function patternPng(name) {
  const c = patternCanvas(name);
  if (!c) return null;
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}
