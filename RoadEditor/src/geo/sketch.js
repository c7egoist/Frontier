// Freehand path helpers: length and Ramer-Douglas-Peucker simplification (pure geometry).

export function pathLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

/** keeps the first and last points and every point further than eps from the chord it splits */
export function simplifyPath(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    const [ax, az] = pts[i0];
    const [bx, bz] = pts[i1];
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    let worst = -1;
    let worstD = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const dd = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / len;
      if (dd > worstD) {
        worstD = dd;
        worst = i;
      }
    }
    if (worst > 0 && worstD > eps) {
      keep[worst] = 1;
      stack.push([i0, worst], [worst, i1]);
    }
  }
  return dropCusps(pts.filter((_, i) => keep[i] === 1), 120);
}

/**
 * Drops interior points where the path turns back on itself (heading change above maxTurnDeg), so a
 * sketch that doubles back over its own stroke does not leave a spike. Endpoints are never dropped.
 */
export function dropCusps(pts, maxTurnDeg = 120) {
  const out = pts.slice();
  const limit = Math.cos((maxTurnDeg * Math.PI) / 180);
  let changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 1; i < out.length - 1; i++) {
      const ax = out[i][0] - out[i - 1][0];
      const az = out[i][1] - out[i - 1][1];
      const bx = out[i + 1][0] - out[i][0];
      const bz = out[i + 1][1] - out[i][1];
      const la = Math.hypot(ax, az);
      const lb = Math.hypot(bx, bz);
      if (la < 1e-9 || lb < 1e-9) {
        out.splice(i, 1);
        changed = true;
        break;
      }
      if ((ax * bx + az * bz) / (la * lb) < limit) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}
