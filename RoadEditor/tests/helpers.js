// Shared test setup: loads the vendored clipper UMD bundle into globalThis for node.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
if (!globalThis.ClipperLib) {
  globalThis.ClipperLib = require('../vendor/clipper/clipper.js');
}

export const areaOf = (poly) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
};

/** area of a [outer, ...holes] ring set */
export const ringsArea = (rings) => rings.reduce((s, r, i) => s + (i === 0 ? areaOf(r) : -areaOf(r)), 0);

export function near(a, b, tol, msg = '') {
  if (Math.abs(a - b) > tol) throw new Error(`${msg} expected ${b} got ${a} (tol ${tol})`);
}
