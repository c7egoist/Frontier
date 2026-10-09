// Small vector helpers shared by the geometry code.
// 3D points are [x, y, z] (Y up, metres). Plan points are [x, z].

export const EPS = 1e-9;
export const TAU = Math.PI * 2;

export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => {
  const l = len3(a);
  return l > EPS ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};
export const lerp3 = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// Plan (x, z) helpers.
export const plan = (p) => [p[0], p[2]];
export const len2 = (a) => Math.hypot(a[0], a[1]);
export const norm2 = (a) => {
  const l = len2(a);
  return l > EPS ? [a[0] / l, a[1] / l] : [0, 0];
};
export const rot90 = (a) => [-a[1], a[0]];
export const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
export const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
export const dist3p = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]); // plan distance between 3D points
export const distPlan = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]); // plan [x, z] points

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const smoothstep = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
export const angleOf = (d) => Math.atan2(d[1], d[0]); // d = [x, z]
