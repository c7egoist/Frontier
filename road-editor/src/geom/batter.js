// Embankment and cut batters.
//
// A batter leaves the outer road edge at height y0 and slopes towards the ground
// at `slope` metres of run per metre of rise. Fill (road above ground) descends,
// cut (road below ground) rises. The toe is the first point where the slope meets
// the terrain. Roads and junctions call the same function with the same inputs so
// their shared edges match exactly.

export function batterToe(terrain, x, z, ox, oz, y0, slope = 2, maxDist = 28, step = 0.25) {
  const g0 = terrain.height(x, z);
  const diff0 = y0 - g0;
  const fill = diff0 >= 0;
  const hs = Math.max(0.5, slope);
  if (Math.abs(diff0) < 1e-4) return { s: 0, x, z, y: g0, fill, capped: false };
  let prevS = 0;
  let prevDiff = diff0;
  for (let s = step; s <= maxDist + 1e-9; s += step) {
    const px = x + ox * s;
    const pz = z + oz * s;
    const g = terrain.height(px, pz);
    const h = fill ? y0 - s / hs : y0 + s / hs;
    const diff = h - g;
    if ((fill && diff <= 0) || (!fill && diff >= 0)) {
      const denom = prevDiff - diff;
      const t = Math.abs(denom) > 1e-12 ? prevDiff / denom : 0;
      const ss = prevS + (s - prevS) * Math.min(1, Math.max(0, t));
      const tx = x + ox * ss;
      const tz = z + oz * ss;
      return { s: ss, x: tx, z: tz, y: terrain.height(tx, tz), fill, capped: false };
    }
    prevS = s;
    prevDiff = diff;
  }
  const tx = x + ox * maxDist;
  const tz = z + oz * maxDist;
  return { s: maxDist, x: tx, z: tz, y: terrain.height(tx, tz), fill, capped: true };
}
