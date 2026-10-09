// Grid utilities. Every field is a square Float32Array of N*N cells, row-major
// (index = y * N + x). Heights are normalised [0, 1] unless a comment says metres.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(a, b, x) {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(a, b, x) {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function minMax(f) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

// In-place min-max normalisation to [0, 1]. A flat field stays at 0.
export function normalize(f) {
  const [lo, hi] = minMax(f);
  const s = hi - lo > 1e-12 ? 1 / (hi - lo) : 0;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s;
  return f;
}

// Value at the given quantile, estimated from a 2048-bin histogram.
export function quantileFrom(f, q, lo0, hi0) {
  const bins = 2048;
  const hist = new Uint32Array(bins);
  const span = hi0 - lo0 || 1;
  for (let i = 0; i < f.length; i++) {
    const b = clamp(Math.floor(((f[i] - lo0) / span) * bins), 0, bins - 1);
    hist[b]++;
  }
  const target = q * f.length;
  let acc = 0;
  for (let b = 0; b < bins; b++) {
    acc += hist[b];
    if (acc >= target) return lo0 + ((b + 1) / bins) * span;
  }
  return hi0;
}

// Normalise to [0, 1] using the 0.5% and 99.5% quantiles, so one outlier cannot flatten the palette.
export function robustNormalize(f) {
  const [lo, hi] = minMax(f);
  const a = quantileFrom(f, 0.005, lo, hi);
  const b = quantileFrom(f, 0.995, lo, hi);
  const s = b - a > 1e-12 ? 1 / (b - a) : 0;
  const out = new Float32Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = clamp((f[i] - a) * s, 0, 1);
  return out;
}

export function bilinear(f, N, x, y) {
  const xc = clamp(x, 0, N - 1.001);
  const yc = clamp(y, 0, N - 1.001);
  const x0 = xc | 0;
  const y0 = yc | 0;
  const fx = xc - x0;
  const fy = yc - y0;
  const i = y0 * N + x0;
  return (
    f[i] * (1 - fx) * (1 - fy) + f[i + 1] * fx * (1 - fy) + f[i + N] * (1 - fx) * fy + f[i + N + 1] * fx * fy
  );
}

export function boxBlur(src, N, r) {
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

// Three box passes approximate a Gaussian of standard deviation ~ r.
export function gaussianBlur(src, N, r) {
  const rr = Math.max(1, Math.round(r));
  return boxBlur(boxBlur(boxBlur(src, N, rr), N, rr), N, rr);
}

// Central-difference gradient in metres per metre (dimensionless slope), heights in metres.
export function gradient(Hm, N, cell) {
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

export function slopeDegrees(gx, gy) {
  const out = new Float32Array(gx.length);
  for (let i = 0; i < gx.length; i++) out[i] = (Math.atan(Math.hypot(gx[i], gy[i])) * 180) / Math.PI;
  return out;
}

// Discrete Laplacian in metres (positive means the cell sits below its neighbours).
export function laplacian(Hm, N) {
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

// Distance (in cells) from every cell to the nearest source cell, by two-pass chamfer (3-4 weights).
export function distanceFrom(source, N) {
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

// Priority-flood depression filling (Barnes 2014). Returns a surface with no closed pits,
// so drainage always reaches the edge and rivers do not stop in invented lakes.
export function fillDepressions(Hm, N, eps) {
  const F = Float32Array.from(Hm);
  const done = new Uint8Array(N * N);
  const cap = N * N + 4;
  const keys = new Float64Array(cap);
  const ids = new Int32Array(cap);
  let size = 0;
  const push = (k, id) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
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
    for (;;) {
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

const D8 = [
  [-1, -1, 1.4142],
  [0, -1, 1],
  [1, -1, 1.4142],
  [-1, 0, 1],
  [1, 0, 1],
  [-1, 1, 1.4142],
  [0, 1, 1],
  [1, 1, 1.4142],
];

// D8 single-flow-direction routing on a depression-filled surface.
// Returns the receiver of each cell (-1 at the map edge) and the cells ordered from highest to lowest.
export function routeFlow(Hm, N, cell) {
  const F = fillDepressions(Hm, N, 0.001);
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

// Drainage area in cells: how many upstream cells (including itself) pass through each cell.
export function accumulate(receiver, order, weight) {
  const A = weight ? Float32Array.from(weight) : new Float32Array(receiver.length).fill(1);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const r = receiver[i];
    if (r >= 0) A[r] += A[i];
  }
  return A;
}

// Protrusion: how far a cell rises above its surroundings, in metres. Ridges and peaks are positive.
export function protrusion(Hm, N, radius) {
  const blur = gaussianBlur(Hm, N, radius);
  const out = new Float32Array(N * N);
  for (let i = 0; i < out.length; i++) out[i] = Hm[i] - blur[i];
  return out;
}
