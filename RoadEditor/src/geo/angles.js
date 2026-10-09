// Crotch requirements. Two arms that leave a junction at a narrow angle meet in a crotch whose
// fillet (radius r for the carriageway, smaller for each band) only fits inside the hub if both
// mouths lie beyond the fillet's tangent points. This module computes, for every arm, the road
// distance its mouth needs for each neighbour, using the arms' edge lines near the junction.

import { stationAt } from './curve.js';

const DEG = 180 / Math.PI;

/** outward unit direction at the junction, left normal, and widths left / right of that direction */
export function armFrame(arm) {
  const st = stationAt(arm.curve, arm.end === 'a' ? 0 : arm.L);
  const sg = arm.end === 'a' ? 1 : -1;
  const u = [sg * st.tx, sg * st.tz];
  const nl = [u[1], -u[0]];
  const wl = arm.end === 'a' ? arm.W.L : arm.W.R;
  const wr = arm.end === 'a' ? arm.W.R : arm.W.L;
  return { u, nl, wl, wr };
}

/**
 * Map `${roadId}|${end}` -> {req, partner, angle}: the mouth distance (m) the arm needs for its
 * worst neighbour, including the band fillets. req = Infinity for arms that leave in the same
 * direction. Opposite arms need nothing.
 */
export function crotchRequirements(arms, bands, radius) {
  const d = [0, bands.g, bands.g + bands.k, bands.g + bands.k + bands.f, bands.g + bands.k + bands.f + bands.v];
  const frames = arms.map(armFrame);
  const out = new Map();
  arms.forEach((ai, i) => {
    const fi = frames[i];
    let best = { req: 0, partner: null, angle: 180 };
    arms.forEach((aj, j) => {
      if (i === j) return;
      const fj = frames[j];
      const cosT = fi.u[0] * fj.u[0] + fi.u[1] * fj.u[1];
      const theta = Math.acos(Math.max(-1, Math.min(1, cosT)));
      if (theta > Math.PI - 1e-3) return;
      const c = fi.u[0] * fj.u[1] - fi.u[1] * fj.u[0];
      if (Math.abs(c) < 1e-6) {
        if (cosT > 0) best = { req: Infinity, partner: aj.road.id, angle: 0 };
        return;
      }
      const sideI = fi.nl[0] * fj.u[0] + fi.nl[1] * fj.u[1] >= 0 ? 1 : -1;
      const sideJ = fj.nl[0] * fi.u[0] + fj.nl[1] * fi.u[1] >= 0 ? 1 : -1;
      const ni = sideI > 0 ? fi.nl : [-fi.nl[0], -fi.nl[1]];
      const nj = sideJ > 0 ? fj.nl : [-fj.nl[0], -fj.nl[1]];
      const wi0 = sideI > 0 ? fi.wl : fi.wr;
      const wj0 = sideJ > 0 ? fj.wl : fj.wr;
      const half = Math.max(Math.tan(theta / 2), 1e-6);
      for (const dd of d) {
        const bx = nj[0] * (wj0 + dd) - ni[0] * (wi0 + dd);
        const bz = nj[1] * (wj0 + dd) - ni[1] * (wi0 + dd);
        const s = (bx * fj.u[1] - bz * fj.u[0]) / c; // where the two edges cross, along arm i
        if (!(s > 0)) continue;
        const fillet = Math.max(0, radius - dd) / half; // tangent distance of the fillet
        const req = s + fillet + 1.0;
        if (req > best.req) best = { req, partner: aj.road.id, angle: theta * DEG };
      }
    });
    out.set(`${ai.road.id}|${ai.end}`, best);
  });
  return out;
}
