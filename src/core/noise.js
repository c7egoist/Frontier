// Value-noise / fBm available in JS (CPU sampling) and as GLSL source (GPU
// raymarcher). Both implement the same hash so CPU previews match GPU.

export const GLSL_NOISE = /* glsl */`
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float v = 0.0, amp = 0.5, tot = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    v += amp * vnoise(p);
    tot += amp;
    p = p * 2.03 + vec2(17.13, 9.7);
    amp *= 0.5;
  }
  return v / tot;
}
float ridged(vec2 p, int oct) {
  float v = 0.0, amp = 0.5, tot = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    float n = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
    v += amp * n * n;
    tot += amp;
    p = p * 2.11 + vec2(31.7, 13.3);
    amp *= 0.5;
  }
  return v / tot;
}
`;

function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x, y, oct = 5) {
  let v = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise2(x, y);
    tot += amp;
    x = x * 2.03 + 17.13; y = y * 2.03 + 9.7;
    amp *= 0.5;
  }
  return v / tot;
}

export function ridged2(x, y, oct = 5) {
  let v = 0, amp = 0.5, tot = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise2(x, y) * 2 - 1);
    v += amp * n * n;
    tot += amp;
    x = x * 2.11 + 31.7; y = y * 2.11 + 13.3;
    amp *= 0.5;
  }
  return v / tot;
}
