(() => {
  // src/engine/rng.js
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // src/engine/noise.js
  function createNoise(seed) {
    const rnd = mulberry32(seed >>> 0);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = base[i];
      base[i] = base[j];
      base[j] = t;
    }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    const gx = new Float32Array(256);
    const gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rnd() * Math.PI * 2;
      gx[i] = Math.cos(a);
      gy[i] = Math.sin(a);
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const perlin = (x, y) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const X = x0 & 255;
      const Y = y0 & 255;
      const g00 = perm[X + perm[Y]];
      const g10 = perm[X + 1 + perm[Y]];
      const g01 = perm[X + perm[Y + 1]];
      const g11 = perm[X + 1 + perm[Y + 1]];
      const n00 = gx[g00] * fx + gy[g00] * fy;
      const n10 = gx[g10] * (fx - 1) + gy[g10] * fy;
      const n01 = gx[g01] * fx + gy[g01] * (fy - 1);
      const n11 = gx[g11] * (fx - 1) + gy[g11] * (fy - 1);
      const u = fade(fx);
      const v = fade(fy);
      const a = n00 + (n10 - n00) * u;
      const b = n01 + (n11 - n01) * u;
      return (a + (b - a) * v) * 1.4142;
    };
    const hash2 = (ix, iy, salt) => {
      let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed ^ salt | 0, 1442695041) | 0;
      h = Math.imul(h ^ h >>> 13, 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    const cellular = (x, y, jitter) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      let f1 = 9;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cx = xi + i;
          const cy = yi + j;
          const px = cx + 0.5 + (hash2(cx, cy, 1) - 0.5) * jitter;
          const py = cy + 0.5 + (hash2(cx, cy, 2) - 0.5) * jitter;
          const d = Math.hypot(px - x, py - y);
          if (d < f1) f1 = d;
        }
      }
      return f1;
    };
    return { perlin, cellular, hash2 };
  }
  function fbm(n, x, y, octaves, lacunarity, gain) {
    let a = 1;
    let f = 1;
    let s = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += a * n(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? s / norm : 0;
  }
  function ridged(n, x, y, octaves, lacunarity, gain, sharpness) {
    let a = 1;
    let f = 1;
    let s = 0;
    let norm = 0;
    let w = 1;
    for (let i = 0; i < octaves; i++) {
      let sig = Math.pow(1 - Math.abs(n(x * f, y * f)), sharpness);
      sig *= w;
      w = Math.min(1, Math.max(0, sig * gain));
      s += sig * a;
      norm += a;
      a *= 0.5;
      f *= lacunarity;
    }
    return norm > 0 ? s / norm : 0;
  }
  function hybrid(n, x, y, octaves, lacunarity, H, offset) {
    let f = 1;
    let pw = 1;
    let result = 0;
    let weight = 1;
    const step = Math.pow(lacunarity, -H);
    for (let i = 0; i < octaves; i++) {
      const sig = (n(x * f, y * f) + offset) * pw;
      if (i === 0) {
        result = sig;
        weight = sig;
      } else {
        if (weight > 1) weight = 1;
        result += weight * sig;
        weight *= sig;
      }
      f *= lacunarity;
      pw *= step;
    }
    return result;
  }
  function billow(n, x, y, octaves, lacunarity, gain) {
    let a = 1;
    let f = 1;
    let s = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += a * Math.abs(n(x * f, y * f));
      norm += a;
      a *= gain;
      f *= lacunarity;
    }
    return norm > 0 ? s / norm : 0;
  }

  // src/engine/field.js
  var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var lerp = (a, b, t) => a + (b - a) * t;
  function smoothstep(a, b, x) {
    if (a === b) return x < a ? 0 : 1;
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function smootherstep(a, b, x) {
    if (a === b) return x < a ? 0 : 1;
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function minMax(f) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < f.length; i++) {
      const v = f[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  }
  function normalize(f) {
    const [lo, hi] = minMax(f);
    const s = hi - lo > 1e-12 ? 1 / (hi - lo) : 0;
    for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s;
    return f;
  }
  function quantileFrom(f, q, lo0, hi0) {
    const bins = 2048;
    const hist = new Uint32Array(bins);
    const span = hi0 - lo0 || 1;
    for (let i = 0; i < f.length; i++) {
      const b = clamp(Math.floor((f[i] - lo0) / span * bins), 0, bins - 1);
      hist[b]++;
    }
    const target = q * f.length;
    let acc = 0;
    for (let b = 0; b < bins; b++) {
      acc += hist[b];
      if (acc >= target) return lo0 + (b + 1) / bins * span;
    }
    return hi0;
  }
  function robustNormalize(f) {
    const [lo, hi] = minMax(f);
    const a = quantileFrom(f, 5e-3, lo, hi);
    const b = quantileFrom(f, 0.995, lo, hi);
    const s = b - a > 1e-12 ? 1 / (b - a) : 0;
    const out = new Float32Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = clamp((f[i] - a) * s, 0, 1);
    return out;
  }
  function boxBlur(src, N, r) {
    if (r < 1) return Float32Array.from(src);
    const tmp = new Float32Array(N * N);
    const out = new Float32Array(N * N);
    const inv = 1 / (2 * r + 1);
    for (let y = 0; y < N; y++) {
      let acc = 0;
      const row = y * N;
      for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, N - 1)];
      for (let x = 0; x < N; x++) {
        tmp[row + x] = acc * inv;
        acc += src[row + clamp(x + r + 1, 0, N - 1)] - src[row + clamp(x - r, 0, N - 1)];
      }
    }
    for (let x = 0; x < N; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += tmp[clamp(k, 0, N - 1) * N + x];
      for (let y = 0; y < N; y++) {
        out[y * N + x] = acc * inv;
        acc += tmp[clamp(y + r + 1, 0, N - 1) * N + x] - tmp[clamp(y - r, 0, N - 1) * N + x];
      }
    }
    return out;
  }
  function gaussianBlur(src, N, r) {
    const rr = Math.max(1, Math.round(r));
    return boxBlur(boxBlur(boxBlur(src, N, rr), N, rr), N, rr);
  }
  function gradient(Hm, N, cell) {
    const gx = new Float32Array(N * N);
    const gy = new Float32Array(N * N);
    const k = 1 / (2 * cell);
    for (let y = 0; y < N; y++) {
      const ym = clamp(y - 1, 0, N - 1) * N;
      const yp = clamp(y + 1, 0, N - 1) * N;
      const row = y * N;
      for (let x = 0; x < N; x++) {
        const xm = clamp(x - 1, 0, N - 1);
        const xp = clamp(x + 1, 0, N - 1);
        gx[row + x] = (Hm[row + xp] - Hm[row + xm]) * k;
        gy[row + x] = (Hm[yp + x] - Hm[ym + x]) * k;
      }
    }
    return { gx, gy };
  }
  function slopeDegrees(gx, gy) {
    const out = new Float32Array(gx.length);
    for (let i = 0; i < gx.length; i++) out[i] = Math.atan(Math.hypot(gx[i], gy[i])) * 180 / Math.PI;
    return out;
  }
  function laplacian(Hm, N) {
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const ym = clamp(y - 1, 0, N - 1) * N;
      const yp = clamp(y + 1, 0, N - 1) * N;
      const row = y * N;
      for (let x = 0; x < N; x++) {
        const xm = clamp(x - 1, 0, N - 1);
        const xp = clamp(x + 1, 0, N - 1);
        out[row + x] = Hm[row + xm] + Hm[row + xp] + Hm[ym + x] + Hm[yp + x] - 4 * Hm[row + x];
      }
    }
    return out;
  }
  function distanceFrom(source, N) {
    const INF = 1e9;
    const d = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) d[i] = source[i] ? 0 : INF;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[i - N] + 1);
          if (x > 0) v = Math.min(v, d[i - N - 1] + 1.4142);
          if (x < N - 1) v = Math.min(v, d[i - N + 1] + 1.4142);
        }
        d[i] = v;
      }
    }
    for (let y = N - 1; y >= 0; y--) {
      for (let x = N - 1; x >= 0; x--) {
        const i = y * N + x;
        let v = d[i];
        if (x < N - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < N - 1) {
          v = Math.min(v, d[i + N] + 1);
          if (x < N - 1) v = Math.min(v, d[i + N + 1] + 1.4142);
          if (x > 0) v = Math.min(v, d[i + N - 1] + 1.4142);
        }
        d[i] = v;
      }
    }
    return d;
  }
  function fillDepressions(Hm, N, eps) {
    const F = Float32Array.from(Hm);
    const done = new Uint8Array(N * N);
    const cap = N * N + 4;
    const keys = new Float64Array(cap);
    const ids = new Int32Array(cap);
    let size = 0;
    const push = (k, id) => {
      let i = size++;
      while (i > 0) {
        const p = i - 1 >> 1;
        if (keys[p] <= k) break;
        keys[i] = keys[p];
        ids[i] = ids[p];
        i = p;
      }
      keys[i] = k;
      ids[i] = id;
    };
    const pop = () => {
      const topId = ids[0];
      const lastK = keys[--size];
      const lastI = ids[size];
      let i = 0;
      for (; ; ) {
        let c = i * 2 + 1;
        if (c >= size) break;
        if (c + 1 < size && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastK) break;
        keys[i] = keys[c];
        ids[i] = ids[c];
        i = c;
      }
      keys[i] = lastK;
      ids[i] = lastI;
      return topId;
    };
    for (let x = 0; x < N; x++) {
      for (const i of [x, (N - 1) * N + x]) {
        if (!done[i]) {
          done[i] = 1;
          push(F[i], i);
        }
      }
    }
    for (let y = 0; y < N; y++) {
      for (const i of [y * N, y * N + N - 1]) {
        if (!done[i]) {
          done[i] = 1;
          push(F[i], i);
        }
      }
    }
    while (size > 0) {
      const i = pop();
      const x = i % N;
      const y = (i - x) / N;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx;
          if (done[j]) continue;
          done[j] = 1;
          if (F[j] <= F[i]) F[j] = F[i] + eps;
          push(F[j], j);
        }
      }
    }
    return F;
  }
  var D8 = [
    [-1, -1, 1.4142],
    [0, -1, 1],
    [1, -1, 1.4142],
    [-1, 0, 1],
    [1, 0, 1],
    [-1, 1, 1.4142],
    [0, 1, 1],
    [1, 1, 1.4142]
  ];
  function routeFlow(Hm, N, cell) {
    const F = fillDepressions(Hm, N, 1e-3);
    const receiver = new Int32Array(N * N).fill(-1);
    const slopeTo = new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        let best = 0;
        let bestJ = -1;
        for (const [dx, dy, w] of D8) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx;
          const s = (F[i] - F[j]) / (w * cell);
          if (s > best) {
            best = s;
            bestJ = j;
          }
        }
        receiver[i] = bestJ;
        slopeTo[i] = best;
      }
    }
    const order = new Uint32Array(N * N);
    for (let i = 0; i < order.length; i++) order[i] = i;
    order.sort((a, b) => F[b] - F[a]);
    return { receiver, slopeTo, order, filled: F };
  }
  function accumulate(receiver, order, weight) {
    const A = weight ? Float32Array.from(weight) : new Float32Array(receiver.length).fill(1);
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const r = receiver[i];
      if (r >= 0) A[r] += A[i];
    }
    return A;
  }
  function protrusion(Hm, N, radius) {
    const blur = gaussianBlur(Hm, N, radius);
    const out = new Float32Array(N * N);
    for (let i = 0; i < out.length; i++) out[i] = Hm[i] - blur[i];
    return out;
  }

  // src/engine/schema.js
  var num = (key, label, min, max, step, def, unit = "") => ({ key, label, type: "num", min, max, step, def, unit });
  var int = (key, label, min, max, def, unit = "") => ({ key, label, type: "int", min, max, step: 1, def, unit });
  var choice = (key, label, options, def) => ({ key, label, type: "enum", options, def });
  function defaultsOf(list) {
    const out = {};
    for (const p of list) out[p.key] = p.def;
    return out;
  }
  var GENERATOR_COMMON = [
    num("amplitude", "Amplitude", 0, 1, 0.01, 1, "\xD7"),
    num("base", "Base level", 0, 1, 0.01, 0, "\xD7"),
    int("seed", "Seed offset", 0, 999, 0)
  ];

  // src/engine/generators.js
  function sampleField(c, fn) {
    const { N } = c;
    const out = new Float32Array(N * N);
    const inv = 1 / N;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) out[y * N + x] = fn(x * inv, y * inv);
    }
    return out;
  }
  function finish(out, p) {
    normalize(out);
    for (let i = 0; i < out.length; i++) out[i] = clamp(p.base + p.amplitude * out[i], 0, 1);
    return out;
  }
  var SHARED = {
    frequency: num("frequency", "Frequency", 0.2, 12, 0.05, 2, "cycles"),
    octaves: int("octaves", "Octaves", 1, 12, 6),
    lacunarity: num("lacunarity", "Lacunarity", 1.2, 3.5, 0.05, 2),
    gain: num("gain", "Gain (persistence)", 0.1, 0.9, 0.01, 0.5),
    warp: num("warp", "Domain warp", 0, 1, 0.01, 0.3, "\xD7")
  };
  function warped(n, u, v, amount) {
    if (amount <= 0) return [u, v];
    const wx = fbm(n.perlin, u + 5.2, v + 1.3, 3, 2, 0.5);
    const wy = fbm(n.perlin, u + 8.3, v + 2.8, 3, 2, 0.5);
    return [u + amount * wx * 0.6, v + amount * wy * 0.6];
  }
  var GENERATORS = {
    perlin: {
      label: "Perlin fBm",
      category: "generator",
      blurb: "Rolling, soft relief. The workhorse for foothills, plains and dune fields.",
      params: [SHARED.frequency, SHARED.octaves, SHARED.lacunarity, SHARED.gain, SHARED.warp, ...GENERATOR_COMMON],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const sc = p.frequency;
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * sc, v * sc, p.warp);
            return fbm(n.perlin, a, b, p.octaves, p.lacunarity, p.gain);
          }),
          p
        );
      }
    },
    multifractal: {
      label: "Multifractal (hybrid)",
      category: "generator",
      blurb: "Musgrave hybrid multifractal. Rough, uneven ground that gets busier with height, like weathered massifs.",
      params: [
        num("frequency", "Frequency", 0.2, 10, 0.05, 2, "cycles"),
        int("octaves", "Octaves", 1, 12, 8),
        num("roughness", "Roughness (H)", 0.1, 1.5, 0.01, 0.8),
        num("offset", "Offset", 0.5, 1.5, 0.01, 0.9),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
            return hybrid(n.perlin, a, b, p.octaves, 2, p.roughness, p.offset);
          }),
          p
        );
      }
    },
    ridged: {
      label: "Ridged multifractal",
      category: "generator",
      blurb: "Sharp crests and valleys. Pure ridge structure for spines and folded sierras.",
      params: [
        num("frequency", "Frequency", 0.2, 10, 0.05, 2.5, "cycles"),
        int("octaves", "Octaves", 1, 10, 6),
        num("sharpness", "Crest sharpness", 0.5, 3, 0.05, 1.2),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
            return ridged(n.perlin, a, b, p.octaves, 2, 2, p.sharpness);
          }),
          p
        );
      }
    },
    mountain: {
      label: "Mountain range",
      category: "generator",
      blurb: "Ridged crests grouped into ranges. Coverage decides how much of the map is mountain at all.",
      params: [
        num("frequency", "Range scale", 0.5, 6, 0.05, 1.6, "cycles"),
        int("octaves", "Detail octaves", 1, 10, 7),
        num("sharpness", "Crest sharpness", 0.5, 3, 0.05, 1.7),
        num("coverage", "Range coverage", 0, 1, 0.01, 0.55, "\xD7"),
        num("peaks", "Peak exponent", 0.5, 3, 0.05, 1.4),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const { coverage, peaks } = p;
        const ridgeField = sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency * 1.6, v * p.frequency * 1.6, Math.max(p.warp, 0.6));
          return ridged(n.perlin, a, b, p.octaves, 2.1, 2, p.sharpness);
        });
        const cover = sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency * 0.5 + 9.1, v * p.frequency * 0.5 + 3.7, 0.5);
          return billow(n.perlin, a, b, 3, 2, 0.5);
        });
        normalize(cover);
        const out = new Float32Array(ridgeField.length);
        for (let i = 0; i < out.length; i++) {
          const mask = smoothstep(coverage - 0.25, coverage + 0.25, cover[i]);
          out[i] = Math.pow(ridgeField[i], peaks) * mask + 0.08 * mask * cover[i];
        }
        return finish(out, p);
      }
    },
    billow: {
      label: "Billow noise",
      category: "generator",
      blurb: "Absolute-value noise. Soft bulbous mounds, good for dunes and rounded hills.",
      params: [
        num("frequency", "Frequency", 0.2, 12, 0.05, 3, "cycles"),
        int("octaves", "Octaves", 1, 10, 5),
        num("gain", "Gain (persistence)", 0.1, 0.9, 0.01, 0.5),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        return finish(
          sampleField(c, (u, v) => {
            const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp);
            return billow(n.perlin, a, b, p.octaves, 2, p.gain);
          }),
          p
        );
      }
    },
    voronoi: {
      label: "Voronoi terraces",
      category: "generator",
      blurb: "Cellular plates. With terrace steps it reads as lava plateaux, mesa caps and tilted fault blocks.",
      params: [
        num("frequency", "Cell count", 1, 16, 0.1, 4, "cells"),
        num("jitter", "Jitter", 0, 1, 0.01, 0.9),
        int("steps", "Terrace steps (0 = smooth)", 0, 16, 5),
        num("edge", "Edge softness", 0, 1, 0.01, 0.35),
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const out = sampleField(c, (u, v) => {
          const d = n.cellular(u * p.frequency, v * p.frequency, p.jitter);
          return 1 - clamp(d, 0, 1);
        });
        normalize(out);
        if (p.steps > 0) {
          const soft = p.edge;
          for (let i = 0; i < out.length; i++) {
            const t = out[i] * p.steps;
            const f = Math.floor(t);
            const r = t - f;
            const s = smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, r);
            out[i] = (f + s) / p.steps;
          }
        }
        return finish(out, p);
      }
    },
    island: {
      label: "Island / continent",
      category: "generator",
      blurb: "A landmass inside a basin. Radius and falloff set how much sea surrounds the coast.",
      params: [
        num("radius", "Land radius", 0.1, 0.7, 0.01, 0.4, "\xD7"),
        num("falloff", "Coast falloff", 0.02, 0.6, 0.01, 0.22, "\xD7"),
        num("frequency", "Coastline detail", 0.5, 8, 0.05, 2.4, "cycles"),
        int("octaves", "Octaves", 1, 10, 7),
        SHARED.warp,
        ...GENERATOR_COMMON
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed);
        const out = sampleField(c, (u, v) => {
          const [a, b] = warped(n, u * p.frequency, v * p.frequency, p.warp + 0.2);
          const detail = fbm(n.perlin, a, b, p.octaves, 2, 0.5) * 0.5 + 0.5;
          const dx = (u - 0.5) * 2;
          const dy = (v - 0.5) * 2;
          const r = Math.hypot(dx, dy) / Math.SQRT2;
          const coast = p.radius + (detail - 0.5) * 0.35;
          const land = 1 - smoothstep(coast - p.falloff, coast + p.falloff, r);
          return land * (0.45 + 0.55 * detail);
        });
        return finish(out, p);
      }
    },
    flat: {
      label: "Flat plateau",
      category: "generator",
      blurb: "Constant height. Start here when a later layer should do all the shaping.",
      params: [num("level", "Level", 0, 1, 0.01, 0.3, "\xD7"), int("seed", "Seed offset", 0, 999, 0)],
      run(c, p) {
        return new Float32Array(c.N * c.N).fill(clamp(p.level, 0, 1));
      }
    }
  };
  function runGenerator(name, c, overrides) {
    const g = GENERATORS[name] || GENERATORS.perlin;
    const p = { ...defaultsOf(g.params), ...overrides };
    return g.run(c, p);
  }
  function breakupNoise(c, frequency, seed) {
    return runGenerator("perlin", c, { frequency, octaves: 4, warp: 0.1, seed, amplitude: 1, base: 0 });
  }

  // src/engine/masks.js
  function field(c, fn) {
    const out = new Float32Array(c.N * c.N);
    const inv = 1 / c.N;
    for (let y = 0; y < c.N; y++) {
      for (let x = 0; x < c.N; x++) out[y * c.N + x] = fn(x * inv, y * inv, y * c.N + x);
    }
    return out;
  }
  var MASKS = {
    coastal: {
      label: "Coastal falloff",
      blurb: "Fades the effect in from the shoreline, so coasts get a soft shelf instead of a hard line.",
      params: [
        num("width", "Falloff width", 50, 4e3, 10, 900, "m"),
        num("shore", "Shoreline offset", -500, 500, 5, 0, "m"),
        num("jitter", "Shoreline jitter", 0, 800, 5, 150, "m"),
        num("sharpness", "Falloff curve", 0.3, 3, 0.05, 1),
        choice("side", "Side", [["land", "Inland"], ["shelf", "Offshore shelf"]], "land"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const { N, cell, maxH } = c;
        const n = c.noiseFor(p.seed + 17);
        const sea = c.seaM + p.shore;
        const cells = p.width / cell;
        const water = new Uint8Array(N * N);
        const land = new Uint8Array(N * N);
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const i = y * N + x;
            const jit = fbm(n.perlin, x * 6 / N, y * 6 / N, 4, 2, 0.5) * p.jitter * 2;
            const isLand = H[i] * maxH + jit > sea;
            land[i] = isLand ? 1 : 0;
            water[i] = isLand ? 0 : 1;
          }
        }
        if (p.side === "land") {
          const d2 = distanceFrom(water, N);
          return field(c, (u, v, i) => {
            if (!land[i]) return 0;
            return Math.pow(smootherstep(0, cells, d2[i]), p.sharpness);
          });
        }
        const d = distanceFrom(land, N);
        return field(c, (u, v, i) => {
          if (land[i]) return 0;
          return Math.pow(1 - smootherstep(0, cells, d[i]), p.sharpness);
        });
      }
    },
    elevation: {
      label: "Mountain falloff",
      blurb: "Smooth altitude falloff. Weight rises across a band of heights and rolls off near the summit.",
      params: [
        num("low", "Start height", 0, 1, 0.01, 0.3, "\xD7"),
        num("high", "Full height", 0, 1, 0.01, 0.7, "\xD7"),
        num("summitRoll", "Summit roll-off", 0, 1, 0.01, 0.25, "\xD7"),
        num("breakup", "Edge breakup", 0, 0.3, 5e-3, 0.04, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const n = c.noiseFor(p.seed + 31);
        return field(c, (u, v, i) => {
          const h = H[i];
          const nz = fbm(n.perlin, u * 8, v * 8, 4, 2, 0.5) * 0.5 + 0.5 - 0.5;
          const hh = h + p.breakup * nz * 2;
          const band = smootherstep(p.low, Math.max(p.low + 1e-3, p.high), hh);
          return band * (1 - p.summitRoll * smootherstep(p.high, 1, hh));
        });
      }
    },
    slope: {
      label: "Slope",
      blurb: "Weight by steepness in degrees. Good for scree on the flanks and bare rock on the crags.",
      params: [
        num("min", "Start angle", 0, 80, 0.5, 8, "\xB0"),
        num("max", "Full angle", 0, 80, 0.5, 35, "\xB0")
      ],
      run(c, p, H) {
        const slope = c.derive(H).slope;
        return field(c, (u, v, i) => smoothstep(p.min, Math.max(p.min + 0.5, p.max), slope[i]));
      }
    },
    cliffs: {
      label: "Cliffs",
      blurb: "Only the steepest faces. Narrow bands with a breakup so the rock lines look geological, not drawn.",
      params: [
        num("threshold", "Cliff angle", 20, 80, 0.5, 42, "\xB0"),
        num("softness", "Edge softness", 1, 20, 0.5, 6, "\xB0"),
        num("breakup", "Breakup", 0, 1, 0.01, 0.3, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const slope = c.derive(H).slope;
        const n = c.noiseFor(p.seed + 43);
        return field(c, (u, v, i) => {
          const band = smoothstep(p.threshold - p.softness, p.threshold + p.softness, slope[i]);
          const nz = fbm(n.perlin, u * 14, v * 14, 3, 2, 0.5) * 0.5 + 0.5;
          return band * (1 - p.breakup * (1 - nz));
        });
      }
    },
    strata: {
      label: "Stratify (strata)",
      blurb: "Horizontal bedding bands at a set interval, bent by warp. Ledges and layered sandstone.",
      params: [
        num("interval", "Bed interval", 10, 500, 1, 80, "m"),
        num("duty", "Ledge share", 0.05, 0.95, 0.01, 0.55),
        num("sharpness", "Bed sharpness", 0, 1, 0.01, 0.7),
        num("warp", "Bed warp", 0, 300, 1, 40, "m"),
        num("phase", "Phase", 0, 500, 1, 0, "m"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p, H) {
        const { maxH } = c;
        const n = c.noiseFor(p.seed + 59);
        const edge = (1 - p.sharpness) * 0.25 + 2e-3;
        return field(c, (u, v, i) => {
          const bend = fbm(n.perlin, u * 3, v * 3, 3, 2, 0.5) * p.warp;
          const t = (H[i] * maxH + p.phase + bend) / p.interval;
          const f = t - Math.floor(t);
          return 1 - smoothstep(p.duty - edge, p.duty + edge, f);
        });
      }
    },
    rift: {
      label: "Rift lines",
      blurb: "Thin bands along fault zones, from zero crossings of a warped noise field. Used to place cracks and grabens.",
      params: [
        num("frequency", "Fault frequency", 0.5, 8, 0.05, 2.2, "cycles"),
        num("width", "Fault zone width", 0.01, 0.3, 5e-3, 0.06),
        num("warp", "Fault warp", 0, 1, 0.01, 0.5, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p) {
        const n = c.noiseFor(p.seed + 71);
        return field(c, (u, v) => {
          const wx = fbm(n.perlin, u * 2 + 4.1, v * 2 + 0.7, 3, 2, 0.5) * p.warp;
          const wy = fbm(n.perlin, u * 2 + 9.3, v * 2 + 6.2, 3, 2, 0.5) * p.warp;
          const z = n.perlin((u + wx * 0.5) * p.frequency, (v + wy * 0.5) * p.frequency);
          return 1 - smoothstep(0, p.width * 3, Math.abs(z));
        });
      }
    },
    ridges: {
      label: "Ridges (protrusion)",
      blurb: "Weights cells that stand above their surroundings. Picks out spurs, crests and peaks.",
      params: [
        num("scale", "Scale", 40, 2e3, 10, 260, "m"),
        num("min", "Start", -100, 200, 1, 0, "m"),
        num("max", "Full", 0, 600, 1, 60, "m")
      ],
      run(c, p, H) {
        const prot = c.derive(H).protrusion(p.scale);
        return field(c, (u, v, i) => smoothstep(p.min, Math.max(p.min + 1, p.max), prot[i]));
      }
    },
    noise: {
      label: "Generator noise",
      blurb: "A generator used as a mask. Breaks up any effect into organic patches.",
      params: [
        choice("generator", "Generator", [["perlin", "Perlin fBm"], ["ridged", "Ridged"], ["billow", "Billow"], ["voronoi", "Voronoi"]], "perlin"),
        num("frequency", "Frequency", 0.2, 12, 0.05, 3, "cycles"),
        int("octaves", "Octaves", 1, 10, 5),
        num("contrast", "Contrast", 0.2, 4, 0.05, 1.5),
        num("bias", "Bias", -1, 1, 0.01, 0),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, p) {
        const g = runGenerator(p.generator, c, {
          frequency: p.frequency,
          octaves: p.octaves,
          seed: p.seed + 83,
          amplitude: 1,
          base: 0
        });
        return field(c, (u, v, i) => clamp((g[i] - 0.5) * p.contrast + 0.5 + p.bias, 0, 1));
      }
    }
  };
  function buildMask(masks, H, c) {
    let acc = null;
    for (const m of masks || []) {
      if (!m || m.enabled === false) continue;
      const def = MASKS[m.type];
      if (!def) continue;
      const params = { ...defaultsOf(def.params), ...m.params };
      const w = def.run(c, params, H);
      if (m.invert) for (let i = 0; i < w.length; i++) w[i] = 1 - w[i];
      if (m.strength !== void 0 && m.strength !== 1) {
        for (let i = 0; i < w.length; i++) w[i] *= m.strength;
      }
      if (!acc) {
        acc = w;
        continue;
      }
      switch (m.op) {
        case "add":
          for (let i = 0; i < acc.length; i++) acc[i] = acc[i] + w[i] - acc[i] * w[i];
          break;
        case "subtract":
          for (let i = 0; i < acc.length; i++) acc[i] = acc[i] * (1 - w[i]);
          break;
        case "max":
          for (let i = 0; i < acc.length; i++) acc[i] = Math.max(acc[i], w[i]);
          break;
        case "min":
          for (let i = 0; i < acc.length; i++) acc[i] = Math.min(acc[i], w[i]);
          break;
        default:
          for (let i = 0; i < acc.length; i++) acc[i] *= w[i];
      }
    }
    return acc;
  }

  // src/engine/erosion.js
  function hydraulic(c, H, p) {
    const { N } = c;
    const sed = new Float32Array(N * N);
    const rnd = mulberry32(c.seed + 101);
    const count = Math.round(p.density * N * N);
    const r = Math.max(1, Math.round(p.radius));
    const bx = [];
    const by = [];
    const bw = [];
    let wsum = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d >= r) continue;
        const w = r - d;
        bx.push(dx);
        by.push(dy);
        bw.push(w);
        wsum += w;
      }
    }
    for (let k = 0; k < bw.length; k++) bw[k] /= wsum;
    const { inertia, capacity, erosionRate, depositRate, evaporation, gravity, minSlope } = p;
    const maxLife = p.lifetime | 0;
    for (let d = 0; d < count; d++) {
      let x = 1 + rnd() * (N - 3);
      let y = 1 + rnd() * (N - 3);
      let dx = 0;
      let dy = 0;
      let speed = 1;
      let water = 1;
      let s = 0;
      for (let life = 0; life < maxLife; life++) {
        const xi = x | 0;
        const yi = y | 0;
        const fx = x - xi;
        const fy = y - yi;
        const i = yi * N + xi;
        const h00 = H[i];
        const h10 = H[i + 1];
        const h01 = H[i + N];
        const h11 = H[i + N + 1];
        const gxv = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
        const gyv = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
        const hOld = h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
        dx = dx * inertia - gxv * (1 - inertia);
        dy = dy * inertia - gyv * (1 - inertia);
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) {
          const a = rnd() * Math.PI * 2;
          dx = Math.cos(a);
          dy = Math.sin(a);
        } else {
          dx /= len;
          dy /= len;
        }
        x += dx;
        y += dy;
        if (x < 1 || y < 1 || x >= N - 2 || y >= N - 2) break;
        const nx = x | 0;
        const ny = y | 0;
        const nfx = x - nx;
        const nfy = y - ny;
        const j = ny * N + nx;
        const hNew = H[j] * (1 - nfx) * (1 - nfy) + H[j + 1] * nfx * (1 - nfy) + H[j + N] * (1 - nfx) * nfy + H[j + N + 1] * nfx * nfy;
        const dh = hNew - hOld;
        const cap = Math.max(-dh, minSlope) * speed * water * capacity;
        if (s > cap || dh > 0) {
          const amt = dh > 0 ? Math.min(dh, s) : (s - cap) * depositRate;
          s -= amt;
          H[i] += amt * (1 - fx) * (1 - fy);
          H[i + 1] += amt * fx * (1 - fy);
          H[i + N] += amt * (1 - fx) * fy;
          H[i + N + 1] += amt * fx * fy;
          sed[i] += amt * (1 - fx) * (1 - fy);
          sed[i + 1] += amt * fx * (1 - fy);
          sed[i + N] += amt * (1 - fx) * fy;
          sed[i + N + 1] += amt * fx * fy;
        } else {
          const amt = Math.min((cap - s) * erosionRate, -dh);
          s += amt;
          for (let k = 0; k < bw.length; k++) {
            const tx = xi + bx[k];
            const ty = yi + by[k];
            if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
            H[ty * N + tx] -= amt * bw[k];
          }
        }
        speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
        water *= 1 - evaporation;
      }
    }
    return sed;
  }
  function thermal(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const tan = Math.tan(p.talus * Math.PI / 180);
    const diag = cell * Math.SQRT2;
    const D = [
      [-1, -1, diag],
      [0, -1, cell],
      [1, -1, diag],
      [-1, 0, cell],
      [1, 0, cell],
      [-1, 1, diag],
      [0, 1, cell],
      [1, 1, diag]
    ];
    const delta = new Float32Array(N * N);
    const exc_ = new Float64Array(8);
    for (let it = 0; it < p.iterations; it++) {
      delta.fill(0);
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x;
          const h = H[i];
          let total = 0;
          let maxExc = 0;
          for (let k = 0; k < 8; k++) {
            const [dx, dy, dist] = D[k];
            const exc = h - H[(y + dy) * N + x + dx] - tan * dist;
            exc_[k] = exc > 0 ? exc : 0;
            total += exc_[k];
            if (exc_[k] > maxExc) maxExc = exc_[k];
          }
          if (total <= 0) continue;
          const scale = Math.min(1, 0.5 * maxExc / total) * p.rate;
          for (let k = 0; k < 8; k++) {
            if (exc_[k] <= 0) continue;
            const [dx, dy] = D[k];
            const j = (y + dy) * N + x + dx;
            const move = exc_[k] * scale;
            delta[i] -= move;
            delta[j] += move;
            sed[j] += move;
          }
        }
      }
      for (let i = 0; i < N * N; i++) H[i] += delta[i];
    }
    return sed;
  }
  function stream(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const K = p.erodibility;
    const next = new Float32Array(N * N);
    for (let it = 0; it < p.iterations; it++) {
      const { receiver, slopeTo, order } = routeFlow(H, N, cell);
      const A = accumulate(receiver, order, null);
      const flux = new Float32Array(N * N);
      next.set(H);
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        const r = receiver[i];
        const S = Math.max(0, slopeTo[i]);
        let ero = K * Math.pow(A[i], p.areaExp) * Math.pow(S, p.slopeExp);
        ero = Math.min(ero, p.maxStep);
        next[i] -= ero;
        flux[i] += ero;
        if (S < p.depositSlope) {
          const dep = Math.min(flux[i] * p.depositFraction, p.maxDeposit);
          next[i] += dep;
          sed[i] += dep;
          flux[i] -= dep;
        }
        if (r >= 0) flux[r] += flux[i];
      }
      for (let i = 0; i < N * N; i++) {
        H[i] = Math.max(0, next[i] + p.uplift);
      }
    }
    return sed;
  }
  function aeolian(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const th = p.direction * Math.PI / 180;
    const wx = Math.cos(th);
    const wy = Math.sin(th);
    const hop = p.saltation;
    const F = new Float32Array(N * N);
    const F2 = new Float32Array(N * N);
    const sampleH = (x, y) => {
      const xc = clamp(x, 0, N - 1.001);
      const yc = clamp(y, 0, N - 1.001);
      const x0 = xc | 0;
      const y0 = yc | 0;
      const fx = xc - x0;
      const fy = yc - y0;
      const i = y0 * N + x0;
      return H[i] * (1 - fx) * (1 - fy) + H[i + 1] * fx * (1 - fy) + H[i + N] * (1 - fx) * fy + H[i + N + 1] * fx * fy;
    };
    const sampleF = (x, y) => {
      const xc = clamp(x, 0, N - 1.001);
      const yc = clamp(y, 0, N - 1.001);
      const x0 = xc | 0;
      const y0 = yc | 0;
      const fx = xc - x0;
      const fy = yc - y0;
      const i = y0 * N + x0;
      return F[i] * (1 - fx) * (1 - fy) + F[i + 1] * fx * (1 - fy) + F[i + N] * (1 - fx) * fy + F[i + N + 1] * fx * fy;
    };
    const pickBase = p.strength * 0.6;
    const capBase = p.strength * 0.5;
    for (let it = 0; it < p.iterations; it++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          const s = (sampleH(x + wx, y + wy) - sampleH(x - wx, y - wy)) / (2 * cell);
          const load = Math.min(1, F[i] / (capBase + 1e-6));
          const pick = pickBase * Math.max(0, s) * (1 - load);
          H[i] -= pick;
          F[i] += pick;
        }
      }
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) F2[y * N + x] = sampleF(x - wx * hop, y - wy * hop);
      }
      F.set(F2);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          const s = (sampleH(x + wx, y + wy) - sampleH(x - wx, y - wy)) / (2 * cell);
          const cap = capBase * clamp(1 + 6 * s, 0.05, 3);
          if (F[i] > cap) {
            const dep = (F[i] - cap) * 0.5;
            F[i] -= dep;
            H[i] += dep;
            sed[i] += dep;
          }
        }
      }
    }
    return sed;
  }
  function glacial(c, H, p) {
    const { N, cell } = c;
    const sed = new Float32Array(N * N);
    const next = new Float32Array(N * N);
    for (let it = 0; it < p.iterations; it++) {
      const { receiver, slopeTo, order } = routeFlow(H, N, cell);
      const A = accumulate(receiver, order, null);
      const lap = laplacian(H, N);
      const ice = new Float32Array(N * N);
      const maxH = c.maxH;
      const line = p.iceline * maxH;
      for (let i = 0; i < N * N; i++) ice[i] = smoothstep(line - 0.04 * maxH, line + 0.04 * maxH, H[i]);
      next.set(H);
      for (let i = 0; i < N * N; i++) {
        const g = ice[i];
        if (g <= 0) continue;
        const S = Math.max(0, slopeTo[i]);
        const valley = smoothstep(4, 60, A[i]);
        next[i] += p.smoothing * 0.18 * g * valley * lap[i];
        next[i] -= p.cirque * 0.12 * g * Math.max(0, lap[i]);
        next[i] -= Math.min(p.intensity * 0.08 * Math.sqrt(A[i]) * Math.pow(S, 0.9) * g, 25);
      }
      for (let i = 0; i < N * N; i++) {
        const before = H[i];
        H[i] = Math.max(0, next[i]);
        if (H[i] < before) sed[i] += Math.min(25, (before - H[i]) * (1 - ice[i]) * 0.3);
      }
    }
    return sed;
  }
  var EROSIONS = {
    hydraulic: {
      label: "Hydraulic (rain)",
      category: "erosion",
      blurb: "Rain droplets carve gullies and deposit fans. Realistic dendritic drainage and sediment aprons.",
      params: [
        num("density", "Droplets per cell", 0.1, 4, 0.05, 1.2, "\xD7"),
        int("lifetime", "Droplet lifetime", 10, 150, 60, "steps"),
        num("inertia", "Inertia", 0, 0.5, 0.01, 0.05),
        num("capacity", "Sediment capacity", 0.5, 12, 0.1, 4),
        num("erosionRate", "Erosion rate", 0.01, 1, 0.01, 0.3),
        num("depositRate", "Deposition rate", 0, 1, 0.01, 0.3),
        num("evaporation", "Evaporation", 0, 0.1, 1e-3, 0.02),
        num("gravity", "Gravity", 1, 20, 0.1, 10),
        num("minSlope", "Minimum slope", 0, 0.5, 0.01, 0.05),
        num("radius", "Brush radius", 1, 6, 0.1, 2, "cells")
      ],
      run: (c, H, p) => hydraulic(c, H, p)
    },
    thermal: {
      label: "Thermal (talus)",
      category: "erosion",
      blurb: "Rock fall and scree. Slopes relax to their angle of repose, so cliffs get aprons of debris.",
      params: [
        num("talus", "Talus angle", 15, 70, 0.5, 35, "\xB0"),
        int("iterations", "Iterations", 1, 200, 25),
        num("rate", "Transfer rate", 0.05, 0.5, 0.01, 0.4)
      ],
      run: (c, H, p) => thermal(c, H, p)
    },
    stream: {
      label: "Stream power (fluvial)",
      category: "erosion",
      blurb: "Rivers incise according to drainage area and gradient. Canyons and valleys with knickpoints.",
      params: [
        int("iterations", "Iterations", 1, 40, 8),
        num("erodibility", "Erodibility (K)", 1e-3, 0.2, 1e-3, 0.02),
        num("areaExp", "Area exponent (m)", 0.2, 0.9, 0.01, 0.5),
        num("slopeExp", "Slope exponent (n)", 0.5, 2, 0.01, 1),
        num("uplift", "Uplift per step", 0, 20, 0.1, 0, "m"),
        num("maxStep", "Max cut per step", 1, 60, 0.5, 20, "m"),
        num("depositSlope", "Deposit below slope", 0, 0.1, 1e-3, 0.02),
        num("depositFraction", "Deposit fraction", 0, 1, 0.01, 0.5),
        num("maxDeposit", "Max deposit per step", 0, 40, 0.1, 4, "m")
      ],
      run: (c, H, p) => stream(c, H, p)
    },
    aeolian: {
      label: "Aeolian (wind & dunes)",
      category: "erosion",
      blurb: "Wind deflates windward faces and builds dunes and sand sheets on the lee. Use with desert presets.",
      params: [
        num("direction", "Wind direction", 0, 360, 1, 225, "\xB0"),
        num("strength", "Wind strength", 0, 1, 0.01, 0.6),
        num("saltation", "Saltation hop", 1, 20, 0.1, 6, "cells"),
        int("iterations", "Iterations", 1, 400, 90)
      ],
      run: (c, H, p) => aeolian(c, H, p)
    },
    glacial: {
      label: "Glacial (U-valley)",
      category: "erosion",
      blurb: "Ice carves cirques and U-shaped valleys above the firn line. Alpine character.",
      params: [
        num("iceline", "Ice line", 0.2, 1, 0.01, 0.55, "\xD7"),
        num("intensity", "Plucking intensity", 0, 2, 0.01, 0.6),
        num("smoothing", "Valley widening", 0, 1, 0.01, 0.5),
        num("cirque", "Cirque depth", 0, 1, 0.01, 0.4),
        int("iterations", "Iterations", 1, 30, 6)
      ],
      run: (c, H, p) => glacial(c, H, p)
    }
  };

  // src/engine/modifiers.js
  var MODIFIERS = {
    terrace: {
      label: "Terrace / strata",
      category: "modifier",
      blurb: "Quantises height into benches. Smooth = 0 gives hard steps, 1 gives soft rounded shelves.",
      params: [
        int("steps", "Steps", 2, 40, 8),
        num("smooth", "Edge softness", 0, 1, 0.01, 0.3)
      ],
      run(c, H, p) {
        const out = new Float32Array(H.length);
        const half = (1 - p.smooth) * 0.5 + 0.02;
        for (let i = 0; i < H.length; i++) {
          const t = H[i] * p.steps;
          const f = Math.floor(t);
          const r = t - f;
          const s = smoothstep(0.5 - half, 0.5 + half, r);
          out[i] = clamp((f + s) / p.steps, 0, 1);
        }
        return out;
      }
    },
    rift: {
      label: "Rift carve",
      category: "modifier",
      blurb: "Cuts a fault-line graben with a flat floor. The walls are as steep as Wall sharpness asks.",
      params: [
        num("depth", "Depth", 0, 800, 5, 220, "m"),
        num("frequency", "Fault frequency", 0.5, 8, 0.05, 2, "cycles"),
        num("width", "Rift width", 0.01, 0.3, 5e-3, 0.06),
        num("wall", "Wall sharpness", 0, 1, 0.01, 0.6),
        num("warp", "Fault warp", 0, 1, 0.01, 0.5, "\xD7"),
        int("seed", "Seed offset", 0, 999, 0)
      ],
      run(c, H, p) {
        const { N, maxH } = c;
        const n = c.noiseFor(p.seed + 97);
        const out = new Float32Array(H.length);
        const depthN = p.depth / maxH;
        const wall = 1 + p.wall * 3;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const u = x / N;
            const v = y / N;
            const wx = fbm(n.perlin, u * 2 + 4.1, v * 2 + 0.7, 3, 2, 0.5) * p.warp;
            const wy = fbm(n.perlin, u * 2 + 9.3, v * 2 + 6.2, 3, 2, 0.5) * p.warp;
            const z = Math.abs(n.perlin((u + wx * 0.5) * p.frequency, (v + wy * 0.5) * p.frequency));
            const inside = 1 - smoothstep(0, p.width * 3, z);
            const i = y * N + x;
            out[i] = clamp(H[i] - depthN * Math.pow(inside, wall) * (1 - 0.15 * (1 - inside)), 0, 1);
          }
        }
        return out;
      }
    },
    smooth: {
      label: "Smooth",
      category: "modifier",
      blurb: "Gaussian relaxation. Calms harsh noise and keeps large forms, as a geologist would after weathering.",
      params: [
        int("radius", "Radius", 1, 20, 3, "cells"),
        num("detail", "Detail kept", 0, 1, 0.01, 0.4)
      ],
      run(c, H, p) {
        const blur = gaussianBlur(H, c.N, p.radius);
        const out = new Float32Array(H.length);
        for (let i = 0; i < H.length; i++) out[i] = blur[i] + (H[i] - blur[i]) * p.detail;
        return out;
      }
    },
    sharpen: {
      label: "Sharpen ridges",
      category: "modifier",
      blurb: "Unsharp mask on height. Pushes crests and spurs up and cuts valleys deeper for rugged outcrops.",
      params: [
        num("amount", "Amount", 0, 3, 0.01, 0.8),
        int("radius", "Radius", 2, 20, 6, "cells")
      ],
      run(c, H, p) {
        const blur = gaussianBlur(H, c.N, p.radius);
        const out = new Float32Array(H.length);
        for (let i = 0; i < H.length; i++) out[i] = clamp(H[i] + p.amount * (H[i] - blur[i]), 0, 1);
        return out;
      }
    },
    cliffSculpt: {
      label: "Cliff sculpt",
      category: "modifier",
      blurb: "Steep faces snap into vertical steps while gentle ground stays smooth. Sea cliffs and mesa edges.",
      params: [
        num("threshold", "Cliff angle", 20, 80, 0.5, 45, "\xB0"),
        num("stepSize", "Step height", 10, 400, 1, 90, "m"),
        num("softness", "Edge softness", 1, 20, 0.5, 6, "\xB0")
      ],
      run(c, H, p) {
        const { N, cell, maxH } = c;
        const { gx, gy } = gradient(Float32Array.from(H, (v) => v * maxH), N, cell);
        const slope = slopeDegrees(gx, gy);
        const out = new Float32Array(H.length);
        const stepN = p.stepSize / maxH;
        for (let i = 0; i < H.length; i++) {
          const k = smoothstep(p.threshold - p.softness, p.threshold + p.softness, slope[i]);
          const q = Math.floor(H[i] / stepN) * stepN;
          const frac = (H[i] - q) / stepN;
          const snapped = q + stepN * smoothstep(0.35, 0.65, frac);
          out[i] = clamp(H[i] + (snapped - H[i]) * k, 0, 1);
        }
        return out;
      }
    }
  };

  // src/engine/satmap.js
  var PALETTES = {
    sandstone: {
      label: "Sandstone bands",
      stops: [[0, "#3a2315"], [0.25, "#7e3f22"], [0.5, "#b8703f"], [0.75, "#dc9c64"], [1, "#f1cc99"]]
    },
    alpine: {
      label: "Alpine meadow to rock",
      stops: [[0, "#2d4a2a"], [0.3, "#4d6a3a"], [0.55, "#8b8a6b"], [0.75, "#8d8680"], [1, "#e7eaee"]]
    },
    snowrock: {
      label: "Snow and bare rock",
      stops: [[0, "#4a4d52"], [0.5, "#7d8189"], [0.8, "#cdd3dc"], [1, "#ffffff"]]
    },
    desert: {
      label: "Desert sand",
      stops: [[0, "#b98f58"], [0.5, "#dcb97e"], [1, "#f6e2b6"]]
    },
    volcanic: {
      label: "Basalt and ash",
      stops: [[0, "#131313"], [0.4, "#3a312d"], [0.7, "#6b5b52"], [1, "#a89383"]]
    },
    steppe: {
      label: "Dry steppe",
      stops: [[0, "#6a6b3e"], [0.5, "#a09a5b"], [1, "#d8c88f"]]
    },
    forest: {
      label: "Forest to scree",
      stops: [[0, "#1d3a1f"], [0.5, "#3b6a33"], [0.8, "#7c8a54"], [1, "#c9c9a2"]]
    },
    ice: {
      label: "Glacier ice",
      stops: [[0, "#7db0d4"], [0.5, "#cde5f1"], [1, "#ffffff"]]
    },
    coastal: {
      label: "Coastal sand and cliff",
      stops: [[0, "#2b2a27"], [0.35, "#6c6255"], [0.6, "#b49e7a"], [1, "#e6d6b4"]]
    },
    rock: {
      label: "Grey limestone",
      stops: [[0, "#2e2d2b"], [0.5, "#777268"], [1, "#c9c2b2"]]
    }
  };
  var CHANNELS = {
    altitude: "Altitude",
    slope: "Slope (steepness)",
    protrusion: "Protrusion (convexity)",
    rivers: "Rivers (drainage)",
    sediment: "Sedimentation",
    wetness: "Wetness",
    exposure: "Sun exposure"
  };
  var BLEND_MODES = [
    ["over", "Over"],
    ["multiply", "Multiply"],
    ["overlay", "Overlay"],
    ["screen", "Screen"],
    ["add", "Add"]
  ];
  var SATMAP_TYPE = {
    label: "Satmap",
    category: "satmap",
    blurb: "Colours the terrain from a channel or a generator, with palette, masks and breakup.",
    params: [
      choice("source", "Source", [["channel", "Terrain channel"], ["generator", "Generator"]], "channel"),
      choice("channel", "Channel", Object.entries(CHANNELS), "altitude"),
      choice("generator", "Generator", [["perlin", "Perlin fBm"], ["ridged", "Ridged"], ["billow", "Billow"], ["voronoi", "Voronoi"]], "perlin"),
      num("genFrequency", "Generator frequency", 0.2, 12, 0.05, 2.5, "cycles"),
      int("genOctaves", "Generator octaves", 1, 10, 5),
      choice("palette", "Palette", Object.entries(PALETTES).map(([k, v]) => [k, v.label]), "sandstone"),
      num("contrast", "Contrast", 0.2, 4, 0.05, 1),
      num("bias", "Bias", -0.5, 0.5, 0.01, 0),
      num("breakup", "Breakup", 0, 1, 0.01, 0.15, "\xD7"),
      num("breakupScale", "Breakup scale", 0.5, 16, 0.1, 6, "cycles"),
      choice("blend", "Blend mode", BLEND_MODES, "over"),
      int("seed", "Seed offset", 0, 999, 0)
    ]
  };
  var lutCache = /* @__PURE__ */ new Map();
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function paletteLut(id) {
    if (lutCache.has(id)) return lutCache.get(id);
    const pal = PALETTES[id] || PALETTES.sandstone;
    const lut = new Float32Array(256 * 3);
    for (let k = 0; k < 256; k++) {
      const t = k / 255;
      let a = pal.stops[0];
      let b = pal.stops[pal.stops.length - 1];
      for (let s = 0; s < pal.stops.length - 1; s++) {
        if (t >= pal.stops[s][0] && t <= pal.stops[s + 1][0]) {
          a = pal.stops[s];
          b = pal.stops[s + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const u = clamp((t - a[0]) / span, 0, 1);
      const ca = hexToRgb(a[1]);
      const cb = hexToRgb(b[1]);
      for (let ch = 0; ch < 3; ch++) lut[k * 3 + ch] = lerp(ca[ch], cb[ch], u);
    }
    lutCache.set(id, lut);
    return lut;
  }
  function computeChannels({ H, Hm, sed, flowA, slope, gx, gy, N, sun }) {
    const altitude = robustNormalize(Hm);
    const slopeN = robustNormalize(slope);
    const prot = robustNormalize(protrusion(Hm, N, Math.max(2, Math.round(N / 48))));
    const logA = new Float32Array(flowA.length);
    for (let i = 0; i < flowA.length; i++) logA[i] = Math.log(1 + flowA[i]);
    const rivers = robustNormalize(logA);
    const sedN = robustNormalize(sed);
    const wet = new Float32Array(N * N);
    for (let i = 0; i < wet.length; i++) wet[i] = rivers[i] * (1 - slopeN[i] * 0.85);
    const exposure = new Float32Array(N * N);
    const az = sun.azimuth * Math.PI / 180;
    const el = sun.elevation * Math.PI / 180;
    const Lx = Math.cos(el) * Math.cos(az);
    const Ly = Math.cos(el) * Math.sin(az);
    const Lz = Math.sin(el);
    for (let i = 0; i < exposure.length; i++) {
      const nx = -gx[i];
      const ny = -gy[i];
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      exposure[i] = clamp(nx * inv * Lx + ny * inv * Ly + inv * Lz, 0, 1);
    }
    return { altitude, slope: slopeN, protrusion: prot, rivers, sediment: sedN, wetness: wet, exposure };
  }
  function blendPixel(mode, base, c, w) {
    switch (mode) {
      case "multiply":
        return lerp(base, base * c, w);
      case "overlay": {
        const o = base < 0.5 ? 2 * base * c : 1 - 2 * (1 - base) * (1 - c);
        return lerp(base, o, w);
      }
      case "screen":
        return lerp(base, 1 - (1 - base) * (1 - c), w);
      case "add":
        return clamp(base + c * w, 0, 1);
      default:
        return lerp(base, c, w);
    }
  }
  function applySatmapLayer(rgb, layer, { N, maps, c, weight, opacity }) {
    const p = { ...defaultsFor(SATMAP_TYPE), ...layer.params };
    let scalar;
    if (p.source === "generator") {
      scalar = runGenerator(p.generator, c, { frequency: p.genFrequency, octaves: p.genOctaves, seed: p.seed + 211, amplitude: 1, base: 0 });
    } else {
      scalar = maps[p.channel] || maps.altitude;
    }
    const breakup = p.breakup > 0 ? breakupNoise(c, p.breakupScale, p.seed + 307) : null;
    const lut = paletteLut(p.palette);
    for (let i = 0; i < N * N; i++) {
      let s = scalar[i];
      if (breakup) s += (breakup[i] - 0.5) * p.breakup;
      s = clamp((s + p.bias - 0.5) * p.contrast + 0.5, 0, 1);
      const k = Math.round(s * 255) * 3;
      const cr = lut[k];
      const cg = lut[k + 1];
      const cb = lut[k + 2];
      const w = clamp((weight ? weight[i] : 1) * opacity, 0, 1);
      const j = i * 3;
      rgb[j] = blendPixel(p.blend, rgb[j], cr, w);
      rgb[j + 1] = blendPixel(p.blend, rgb[j + 1], cg, w);
      rgb[j + 2] = blendPixel(p.blend, rgb[j + 2], cb, w);
    }
  }
  function defaultsFor(def) {
    const out = {};
    for (const p of def.params) out[p.key] = p.def;
    return out;
  }
  var BASE_SATMAP = [0.48, 0.45, 0.41];

  // src/engine/document.js
  var HEIGHT_TYPES = { ...GENERATORS, ...EROSIONS, ...MODIFIERS };
  var TERRAIN_PARAMS = [
    choice("size", "Grid size", [["128", "128 \xD7 128 (fast)"], ["256", "256 \xD7 256"], ["512", "512 \xD7 512 (slow)"]], "256"),
    num("cell", "Cell size", 5, 200, 1, 30, "m"),
    num("maxHeight", "Max relief", 100, 6e3, 10, 1800, "m"),
    num("seaLevel", "Sea level", 0, 3e3, 5, 400, "m"),
    int("seed", "Seed", 0, 99999, 1337)
  ];
  var SUN_PARAMS = [
    num("azimuth", "Sun azimuth", 0, 360, 1, 315, "\xB0"),
    num("elevation", "Sun elevation", 5, 85, 1, 38, "\xB0")
  ];
  function uid(prefix) {
    const r = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${r}${Date.now().toString(36).slice(-3)}`;
  }
  function layerInfo(type) {
    if (type === "satmap") return SATMAP_TYPE;
    return HEIGHT_TYPES[type] || null;
  }
  function emptyDocument() {
    return {
      version: 2,
      name: "Untitled landscape",
      terrain: defaultsOf(TERRAIN_PARAMS),
      sun: defaultsOf(SUN_PARAMS),
      layers: []
    };
  }
  function normalizeDocument(raw) {
    const base = emptyDocument();
    const doc = {
      version: 2,
      name: typeof raw?.name === "string" ? raw.name : base.name,
      terrain: { ...base.terrain, ...raw?.terrain || {} },
      sun: { ...base.sun, ...raw?.sun || {} },
      layers: []
    };
    doc.terrain.size = String(doc.terrain.size);
    if (!["128", "256", "512"].includes(doc.terrain.size)) doc.terrain.size = "256";
    for (const l of raw?.layers || []) {
      const info = layerInfo(l.type);
      if (!info) continue;
      const kind = info.category === "satmap" ? "satmap" : "height";
      const masks = [];
      for (const m of l.masks || []) {
        const def = MASKS[m.type];
        if (!def) continue;
        masks.push({
          id: m.id || uid("mask"),
          type: m.type,
          enabled: m.enabled !== false,
          invert: !!m.invert,
          strength: typeof m.strength === "number" ? m.strength : 1,
          op: m.op || "multiply",
          params: { ...defaultsOf(def.params), ...m.params || {} }
        });
      }
      doc.layers.push({
        id: l.id || uid("layer"),
        kind,
        type: l.type,
        name: l.name || info.label,
        enabled: l.enabled !== false,
        opacity: typeof l.opacity === "number" ? l.opacity : 1,
        blend: l.blend || "replace",
        params: { ...defaultsOf(info.params), ...l.params || {} },
        masks
      });
    }
    return doc;
  }
  var MASK_LIST = Object.entries(MASKS).map(([k, v]) => [k, v.label]);
  var EROSION_LIST = Object.entries(EROSIONS).map(([k, v]) => [k, v.label]);
  var GENERATOR_LIST = Object.entries(GENERATORS).map(([k, v]) => [k, v.label]);
  var MODIFIER_LIST = Object.entries(MODIFIERS).map(([k, v]) => [k, v.label]);
  var PALETTE_LIST = Object.entries(PALETTES).map(([k, v]) => [k, v.label]);
  var CHANNEL_LIST = Object.entries(CHANNELS);

  // src/engine/evaluate.js
  var heightCache = /* @__PURE__ */ new Map();
  function seedFor(terrainSeed, layerId) {
    return (Math.imul(terrainSeed | 0, 2654435761) ^ hashString(layerId)) >>> 0;
  }
  function makeContext({ N, cell, maxH, seaM, seed }) {
    const noises = /* @__PURE__ */ new Map();
    const c = {
      N,
      cell,
      maxH,
      seaM,
      seed,
      noiseFor(offset) {
        const k = offset | 0;
        if (!noises.has(k)) noises.set(k, createNoise(seed + Math.imul(k, 7919) >>> 0));
        return noises.get(k);
      },
      derive: null
    };
    let memoFor = null;
    let memo = null;
    c.derive = (Hn) => {
      if (memoFor === Hn && memo) return memo;
      const Hm = new Float32Array(Hn.length);
      for (let i = 0; i < Hn.length; i++) Hm[i] = Hn[i] * maxH;
      const { gx, gy } = gradient(Hm, N, cell);
      const slope = slopeDegrees(gx, gy);
      const protCache = /* @__PURE__ */ new Map();
      memo = {
        slope,
        gx,
        gy,
        protrusion(scaleM) {
          const r = Math.max(1, Math.round(scaleM / (2 * cell)));
          if (!protCache.has(r)) protCache.set(r, protrusion(Hm, N, r));
          return protCache.get(r);
        }
      };
      memoFor = Hn;
      return memo;
    };
    return c;
  }
  function blendHeight(mode, a, b) {
    switch (mode) {
      case "add":
        return a + b;
      case "subtract":
        return a - b;
      case "multiply":
        return a * b;
      case "max":
        return Math.max(a, b);
      case "min":
        return Math.min(a, b);
      case "mix":
        return (a + b) * 0.5;
      default:
        return b;
    }
  }
  function applyHeightLayer(layer, Hprev, sedPrev, c) {
    const info = HEIGHT_TYPES[layer.type];
    if (!info) throw new Error(`Unknown height layer ${layer.type}`);
    const N2 = Hprev.length;
    const p = { ...defaultsOf(info.params), ...layer.params };
    const w = buildMask(layer.masks, Hprev, c);
    const opacity = typeof layer.opacity === "number" ? layer.opacity : 1;
    const out = new Float32Array(N2);
    const sedNew = Float32Array.from(sedPrev);
    if (info.category === "generator") {
      const g = info.run(c, p);
      const mode = layer.blend || "replace";
      for (let i = 0; i < N2; i++) out[i] = clamp(blendHeight(mode, Hprev[i], g[i]), 0, 1);
    } else if (info.category === "erosion") {
      const Hm = new Float32Array(N2);
      for (let i = 0; i < N2; i++) Hm[i] = Hprev[i] * c.maxH;
      const sedAdd = info.run(c, Hm, p);
      for (let i = 0; i < N2; i++) {
        out[i] = clamp(Hm[i] / c.maxH, 0, 1);
        const wi = (w ? w[i] : 1) * opacity;
        sedNew[i] += sedAdd[i] * wi;
      }
    } else {
      const m = info.run(c, Hprev, p);
      for (let i = 0; i < N2; i++) out[i] = m[i];
    }
    const result = new Float32Array(N2);
    for (let i = 0; i < N2; i++) {
      const wi = (w ? w[i] : 1) * opacity;
      result[i] = clamp(lerp(Hprev[i], out[i], wi), 0, 1);
    }
    return { H: result, sed: sedNew, mask: w };
  }
  function evaluate(rawDoc, opts = {}) {
    const t0 = performance.now();
    const doc = normalizeDocument(rawDoc);
    const T = doc.terrain;
    const N = parseInt(T.size, 10);
    const cell = Number(T.cell);
    const maxH = Number(T.maxHeight);
    const seaM = Number(T.seaLevel);
    const N2 = N * N;
    let H = new Float32Array(N2).fill(0);
    let sed = new Float32Array(N2);
    let key = `${N}|${cell}|${maxH}|${T.seed}|${seaM}`;
    let maskPreview = null;
    const timings = [];
    const used = /* @__PURE__ */ new Set();
    const errors = [];
    for (const layer of doc.layers) {
      if (layer.kind !== "height" || layer.enabled === false) continue;
      key = String(hashString(key + "::" + JSON.stringify([layer.id, layer.type, layer.params, layer.masks, layer.blend, layer.opacity])));
      used.add(key);
      const t1 = performance.now();
      let entry = heightCache.get(key);
      let cached = !!entry;
      let mask = null;
      if (!entry) {
        try {
          const seed = seedFor(T.seed, layer.id);
          const c = makeContext({ N, cell, maxH, seaM, seed });
          const res = applyHeightLayer(layer, H, sed, c);
          entry = { H: res.H, sed: res.sed, mask: res.mask };
        } catch (err) {
          errors.push({ id: layer.id, message: String(err && err.message ? err.message : err) });
          entry = { H, sed, mask: null };
        }
        heightCache.set(key, entry);
      }
      mask = entry.mask;
      H = entry.H;
      sed = entry.sed;
      if (opts.maskLayerId === layer.id) maskPreview = mask;
      timings.push({ id: layer.id, ms: performance.now() - t1, cached });
    }
    for (const k of [...heightCache.keys()]) if (!used.has(k)) heightCache.delete(k);
    const Hm = new Float32Array(N2);
    let minM = Infinity;
    let maxM = -Infinity;
    let sumM = 0;
    for (let i = 0; i < N2; i++) {
      Hm[i] = H[i] * maxH;
      if (Hm[i] < minM) minM = Hm[i];
      if (Hm[i] > maxM) maxM = Hm[i];
      sumM += Hm[i];
    }
    const { gx, gy } = gradient(Hm, N, cell);
    const slope = slopeDegrees(gx, gy);
    const { receiver, slopeTo, order } = routeFlow(Hm, N, cell);
    const flowA = accumulate(receiver, order, null);
    const sun = { azimuth: Number(doc.sun.azimuth), elevation: Number(doc.sun.elevation) };
    const maps = computeChannels({ H, Hm, sed, flowA, slope, gx, gy, N, sun });
    const rgb = new Float32Array(N2 * 3);
    for (let i = 0; i < N2; i++) {
      rgb[i * 3] = BASE_SATMAP[0];
      rgb[i * 3 + 1] = BASE_SATMAP[1];
      rgb[i * 3 + 2] = BASE_SATMAP[2];
    }
    for (const layer of doc.layers) {
      if (layer.kind !== "satmap" || layer.enabled === false) continue;
      const t1 = performance.now();
      let w = null;
      try {
        const c = makeContext({ N, cell, maxH, seaM, seed: seedFor(T.seed, layer.id) });
        w = buildMask(layer.masks, H, c);
        applySatmapLayer(rgb, layer, { N, maps, c, weight: w, opacity: typeof layer.opacity === "number" ? layer.opacity : 1 });
      } catch (err) {
        errors.push({ id: layer.id, message: String(err && err.message ? err.message : err) });
      }
      if (opts.maskLayerId === layer.id) maskPreview = w;
      timings.push({ id: layer.id, ms: performance.now() - t1, cached: false });
    }
    const rgba = new Uint8ClampedArray(N2 * 4);
    for (let i = 0; i < N2; i++) {
      rgba[i * 4] = Math.round(clamp(rgb[i * 3], 0, 1) * 255);
      rgba[i * 4 + 1] = Math.round(clamp(rgb[i * 3 + 1], 0, 1) * 255);
      rgba[i * 4 + 2] = Math.round(clamp(rgb[i * 3 + 2], 0, 1) * 255);
      rgba[i * 4 + 3] = 255;
    }
    let sedSum = 0;
    for (let i = 0; i < N2; i++) sedSum += sed[i];
    return {
      N,
      cell,
      maxH,
      seaM,
      height: H,
      altitude: Hm,
      slope,
      exposure: maps.exposure,
      rivers: maps.rivers,
      sediment: maps.sediment,
      protrusion: maps.protrusion,
      wetness: maps.wetness,
      rgba,
      mask: maskPreview,
      stats: {
        minM,
        maxM,
        meanM: sumM / N2,
        sedM: sedSum / N2,
        ms: performance.now() - t0,
        layers: timings,
        errors,
        cacheSize: heightCache.size
      }
    };
  }

  // src/worker.js
  self.onmessage = (e) => {
    const { id, doc, maskLayerId } = e.data;
    try {
      const result = evaluate(doc, { maskLayerId });
      self.postMessage({ id, result });
    } catch (err) {
      self.postMessage({ id, error: String(err && err.message || err) });
    }
  };
})();
