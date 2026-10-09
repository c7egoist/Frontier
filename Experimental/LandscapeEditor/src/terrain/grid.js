// Grid helpers shared by every terrain stage.
// A grid is a square Float32Array of N*N cells, row-major (index = y * N + x).
// Heights are stored in metres. Cell size is worldSize / N metres.

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Ken Perlin's smootherstep: zero first and second derivative at both ends, so falloffs have no visible kink.
export const smootherstep = (a, b, x) => {
  if (a === b) return x < a ? 0 : 1;
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function makeGrid(n, fill = 0) {
  const g = new Float32Array(n * n);
  if (fill) g.fill(fill);
  return g;
}

export function minMaxNormalize(grid) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  for (let i = 0; i < grid.length; i++) grid[i] = (grid[i] - lo) / span;
  return grid;
}

// Separable box blur, repeated `passes` times. Edges clamp, so the terrain border does not darken.
export function blur(grid, n, passes = 1, radius = 1) {
  const tmp = new Float32Array(grid.length);
  let src = grid;
  let dst = new Float32Array(grid.length);
  const w = 2 * radius + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < n; y++) {
      const row = y * n;
      for (let x = 0; x < n; x++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k < 0 ? 0 : x + k >= n ? n - 1 : x + k;
          s += src[row + xx];
        }
        tmp[row + x] = s / w;
      }
    }
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) {
        let s = 0;
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k < 0 ? 0 : y + k >= n ? n - 1 : y + k;
          s += tmp[yy * n + x];
        }
        dst[y * n + x] = s / w;
      }
    }
    src = dst;
    dst = new Float32Array(grid.length);
  }
  if (src === grid) return grid;
  grid.set(src);
  return grid;
}

// Bilinear sample with clamped edges. Coordinates are in cell units.
export function sampleBilinear(grid, n, x, y) {
  if (x < 0) x = 0;
  else if (x > n - 1.001) x = n - 1.001;
  if (y < 0) y = 0;
  else if (y > n - 1.001) y = n - 1.001;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * n + x0;
  const a = grid[i];
  const b = grid[i + 1];
  const c = grid[i + n];
  const d = grid[i + n + 1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

// Slope magnitude in degrees, using central differences. Cell size in metres.
export function slopeDegrees(height, n, cs) {
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const ym = y > 0 ? y - 1 : y;
    const yp = y < n - 1 ? y + 1 : y;
    for (let x = 0; x < n; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < n - 1 ? x + 1 : x;
      const dx = (height[y * n + xp] - height[y * n + xm]) / ((xp - xm) * cs);
      const dy = (height[yp * n + x] - height[ym * n + x]) / ((yp - ym) * cs);
      out[y * n + x] = (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
    }
  }
  return out;
}

// Five-point Laplacian in metres per metre squared. Positive values sit on convex crests (protrusions).
export function laplacian(height, n, cs) {
  const out = new Float32Array(n * n);
  const k = 1 / (cs * cs);
  for (let y = 0; y < n; y++) {
    const ym = y > 0 ? y - 1 : y;
    const yp = y < n - 1 ? y + 1 : y;
    for (let x = 0; x < n; x++) {
      const xm = x > 0 ? x - 1 : x;
      const xp = x < n - 1 ? x + 1 : x;
      const c = height[y * n + x];
      const lap = height[y * n + xm] + height[y * n + xp] + height[ym * n + x] + height[yp * n + x] - 4 * c;
      out[y * n + x] = -lap * k;
    }
  }
  return out;
}

// Chamfer distance (in cells) from every cell to the nearest cell where `inside(i)` is true.
export function distanceTo(n, isTarget) {
  const INF = 1e9;
  const d = new Float32Array(n * n);
  for (let i = 0; i < d.length; i++) d[i] = isTarget[i] ? 0 : INF;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) v = Math.min(v, d[i - n] + a);
      if (x > 0 && y > 0) v = Math.min(v, d[i - n - 1] + b);
      if (x < n - 1 && y > 0) v = Math.min(v, d[i - n + 1] + b);
      d[i] = v;
    }
  }
  for (let y = n - 1; y >= 0; y--) {
    for (let x = n - 1; x >= 0; x--) {
      const i = y * n + x;
      let v = d[i];
      if (x < n - 1) v = Math.min(v, d[i + 1] + a);
      if (y < n - 1) v = Math.min(v, d[i + n] + a);
      if (x < n - 1 && y < n - 1) v = Math.min(v, d[i + n + 1] + b);
      if (x > 0 && y < n - 1) v = Math.min(v, d[i + n - 1] + b);
      d[i] = v;
    }
  }
  return d;
}

// Minimum filter over a square window (radius in cells). Used by the glacial carve and the floor estimates.
export function minFilter(grid, n, radius) {
  const tmp = new Float32Array(grid.length);
  const out = new Float32Array(grid.length);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let m = Infinity;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(n - 1, Math.max(0, x + k));
        const v = grid[y * n + xx];
        if (v < m) m = v;
      }
      tmp[y * n + x] = m;
    }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      let m = Infinity;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(n - 1, Math.max(0, y + k));
        const v = tmp[yy * n + x];
        if (v < m) m = v;
      }
      out[y * n + x] = m;
    }
  }
  return out;
}
