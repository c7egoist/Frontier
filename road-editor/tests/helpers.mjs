// Shared checks for the geometry tests.

const q = (v) => Math.round(v * 1e3);

// Open (single-use) edges of the surface groups, keyed by quantised positions.
// Watertight networks only leave open edges at batter toes (on the terrain).
export function openEdges(groups, skip = /^(paint|grate|steel)/) {
  const cnt = new Map();
  const pos = new Map();
  for (const g of groups.values()) {
    if (skip.test(g.key)) continue;
    const P = g.position;
    const I = g.index;
    const key = (i) => {
      const x = P[3 * i];
      const y = P[3 * i + 1];
      const z = P[3 * i + 2];
      const k = `${q(x)},${q(y)},${q(z)}`;
      pos.set(k, [x, y, z]);
      return k;
    };
    for (let t = 0; t < I.length; t += 3) {
      const v = [key(I[t]), key(I[t + 1]), key(I[t + 2])];
      for (let e = 0; e < 3; e++) {
        const a = v[e];
        const b = v[(e + 1) % 3];
        if (a === b) continue;
        const id = a < b ? `${a}|${b}` : `${b}|${a}`;
        cnt.set(id, (cnt.get(id) || 0) + 1);
      }
    }
  }
  const open = [];
  for (const [id, n] of cnt) {
    if (n !== 1) continue;
    const [a, b] = id.split('|');
    open.push([pos.get(a), pos.get(b)]);
  }
  return open;
}

export function segmentsCross(a, b, c, d) {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7;
}

export function selfIntersections(poly) {
  let n = 0;
  const L = poly.length;
  for (let i = 0; i < L; i++) {
    for (let j = i + 2; j < L; j++) {
      if (i === 0 && j === L - 1) continue;
      if (segmentsCross(poly[i], poly[(i + 1) % L], poly[j], poly[(j + 1) % L])) n++;
    }
  }
  return n;
}

export function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const r = poly[(i + 1) % poly.length];
    a += p[0] * r[1] - r[0] * p[1];
  }
  return a / 2;
}
