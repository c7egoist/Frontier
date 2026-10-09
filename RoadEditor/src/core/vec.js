// Small vector / scalar helpers shared by the editor, the geometry kernel and the tests.
// Conventions: world is Y-up. Plan (XZ) positions are [x, z]. Positive "lateral" is LEFT of
// travel in map view (north up, +x east, +z south): n = (tz, -tx).

export const EPS = 1e-9;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth01 = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
export const sq = (v) => v * v;
export const round = (v, digits = 3) => {
  const p = 10 ** digits;
  return Math.round(v * p) / p;
};

export function norm2(x, z) {
  const l = Math.hypot(x, z);
  if (l < EPS) return [1, 0];
  return [x / l, z / l];
}

/** left normal of a unit tangent (tx, tz) */
export function leftNormal(tx, tz) {
  return [tz, -tx];
}

export function dist2(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

/** distance from point p to segment ab in plan, returns {d, t} with t in [0,1] */
export function segmentProject(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > EPS ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + dx * t;
  const cz = az + dz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

/** deterministic string hash (FNV-1a) used for stable pseudo-random paving / ids */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** tiny seeded PRNG (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
