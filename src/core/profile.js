/**
 * Frontier — roof slope profiles (curvature rules)
 * ------------------------------------------------
 * Turns "pitch + curvature rule" into a monotone function  m ↦ height  where m is
 * the *plan* distance from the eave line, plus its arc-length integral so tiles can
 * be laid at true arc-length spacing (which is what makes them sit flush on the
 * curved surface instead of floating).
 *
 * Rules implemented (see docs/ROOF_RESEARCH.md §2, §4.4):
 *  • 'juzhe'  — Chinese 举折 (Yingzao fashi): the top purlin drops H/10 below the
 *               straight eave→ridge line, each purlin below drops half the previous
 *               amount. Produces the classic concave 举折 polyline.
 *  • 'teri'   — Japanese 照り: essentially straight with the bottom of the slope
 *               (the 軒先 eave zone) eased flat, which is what makes a Japanese roof
 *               read as gentle rather than swooping.
 *  • 'korean' — stronger sweep than Japanese, less faceted than juzhe.
 *  • 'linear' — zero curvature (the "modern styling" neutral).
 */

import { clamp, lerp, smoothstep } from './geom.js';

export const PITCH_TABLE = [
  { sun: 3, deg: 16.7, factor: 1.044, hip: 1.446 },
  { sun: 4, deg: 21.8, factor: 1.077, hip: 1.472 },
  { sun: 4.5, deg: 24.2, factor: 1.097, hip: 1.484 },
  { sun: 5, deg: 26.6, factor: 1.118, hip: 1.5 },
  { sun: 5.5, deg: 28.8, factor: 1.141, hip: 1.517 },
  { sun: 6, deg: 31.0, factor: 1.166, hip: 1.535 },
  { sun: 6.5, deg: 33.0, factor: 1.193, hip: 1.556 },
  { sun: 7, deg: 35.0, factor: 1.221, hip: 1.578 },
  { sun: 8, deg: 38.7, factor: 1.281, hip: 1.625 },
  { sun: 10, deg: 45.0, factor: 1.414, hip: 1.732 },
];

/** Japanese 寸 pitch → rise per unit run (4寸 ⇒ 0.4). */
export const pitchFromSun = (sun) => clamp(sun, 0.5, 14) / 10;
export const sunFromDeg = (deg) => Math.tan((deg * Math.PI) / 180) * 10;
/** 隅棟伸係数 — multiplies the plan run of a hip to get its true (sloped) length. */
export function hipFactor(sun) {
  const table = PITCH_TABLE;
  if (sun <= table[0].sun) return table[0].hip;
  for (let i = 0; i + 1 < table.length; i++) {
    const a = table[i], b = table[i + 1];
    if (sun >= a.sun && sun <= b.sun) {
      const t = (sun - a.sun) / (b.sun - a.sun);
      return lerp(a.hip, b.hip, t);
    }
  }
  return table[table.length - 1].hip;
}

/** Monotone cubic (PCHIP) through points — keeps the roof curve from overshooting. */
function pchip(xs, ys) {
  const n = xs.length;
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  const m = new Array(n);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0]);
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1]);
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    return h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1];
  };
}

/**
 * @param {object} o
 * @param {number} o.run      plan run from eave line to the top (ridge / break)
 * @param {number} o.rise     total rise over that run
 * @param {string} o.rule     'juzhe' | 'teri' | 'korean' | 'linear'
 * @param {number} o.bays     number of purlin bays (举折 purlin count − 1)
 * @param {boolean} o.smooth  blend the faceted polyline toward a smooth curve
 * @param {number} o.ease     strength of the eave easing (teri/korean)
 */
export function makeProfile(o) {
  const run = Math.max(o.run, 1e-6);
  const rise = o.rise;
  const bays = Math.max(1, Math.round(o.bays ?? 4));
  const rule = o.rule ?? 'juzhe';
  const smooth = o.smooth ?? true;
  const ease = o.ease ?? 0.55;

  // 1. Reference (straight) purlin lines, equally spaced from eave to ridge.
  const stations = [];
  for (let i = 0; i <= bays; i++) stations.push((i / bays) * run);
  const straight = stations.map((m) => (rise * m) / run);

  // 2. Apply the chosen drop rule.
  const ys = straight.slice();
  if (rule === 'juzhe') {
    // drops counted from the top purlin downward: H/10, H/20, H/40 …
    const drop0 = rise / 10;
    for (let k = 1; k <= bays - 1; k++) {
      const idx = bays - k;                     // top-most intermediate purlin first
      ys[idx] = straight[idx] - drop0 / Math.pow(2, k - 1);
    }
    ys[bays] = rise;                            // ridge stays at the specified height
  } else if (rule === 'teri') {
    // Japanese: keep the line, flatten the bottom (eave) third progressively.
    const easeRun = run * (0.28 + 0.34 * clamp(ease));
    for (let i = 0; i < bays; i++) {
      const m = stations[i];
      const t = clamp(1 - m / easeRun);          // 1 at the eave → 0 at easeRun
      ys[i] = straight[i] - rise * 0.075 * ease * smoothstep(t);
    }
  } else if (rule === 'korean') {
    // Korean roofs sweep harder: a gentle concave throughout + flat eave zone.
    for (let i = 0; i <= bays; i++) {
      const t = stations[i] / run;
      ys[i] = rise * (Math.pow(t, 1 + 0.55 * clamp(ease)) * 0.94 + 0.06 * t);
    }
    ys[bays] = rise;
  } else {
    // 'linear' — no curvature at all.
  }
  // Purlin drops must never invert the slope.
  for (let i = 1; i <= bays; i++) ys[i] = Math.max(ys[i], ys[i - 1] + (rise / run) * (stations[i] - stations[i - 1]) * 0.25);

  // 3. Continuous h(m): faceted polyline (true to the rafter planes) or a monotone
  //    cubic through the same purlin points (what a smooth render wants to see).
  const polyline = (m) => {
    if (m <= 0) return ys[0];
    if (m >= run) return ys[bays];
    let i = 0;
    while (i < bays - 1 && m > stations[i + 1]) i++;
    const t = (m - stations[i]) / (stations[i + 1] - stations[i]);
    return lerp(ys[i], ys[i + 1], t);
  };
  const faceted = rule !== 'linear';
  const smoothFn = pchip(stations, ys);
  const h = faceted && smooth
    ? (m) => (m <= 0 ? ys[0] : m >= run ? ys[bays] : lerp(polyline(m), smoothFn(m), 0.55))
    : polyline;

  // 4. Arc length table for true tile-course spacing.
  const SAMPLES = 256;
  const dm = run / SAMPLES;
  const arcTable = new Float64Array(SAMPLES + 1);
  let prev = h(0);
  for (let i = 1; i <= SAMPLES; i++) {
    const m = i * dm;
    const y = h(m);
    arcTable[i] = arcTable[i - 1] + Math.hypot(dm, y - prev);
    prev = y;
  }
  const arcTotal = arcTable[SAMPLES];
  const arc = (m) => {
    if (m <= 0) return 0;
    if (m >= run) return arcTotal;
    const f = (m / run) * SAMPLES;
    const i = Math.min(SAMPLES - 1, Math.floor(f));
    return lerp(arcTable[i], arcTable[i + 1], f - i);
  };
  /** Inverse: arc length from the eave → plan distance m. */
  const arcInv = (s) => {
    if (s <= 0) return 0;
    if (s >= arcTotal) return run;
    let lo = 0, hi = SAMPLES;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (arcTable[mid] < s) lo = mid; else hi = mid;
    }
    const span = arcTable[hi] - arcTable[lo] || 1;
    return ((lo + (s - arcTable[lo]) / span) / SAMPLES) * run;
  };
  /** Tangent (dY/dm) — used to orient tiles & rafters to the true surface. */
  const slope = (m) => {
    const e = run * 1e-4;
    const a = h(Math.max(0, m - e)), b = h(Math.min(run, m + e));
    return (b - a) / (Math.min(run, m + e) - Math.max(0, m - e));
  };

  return {
    run, rise, rule, bays, stations, purlinHeights: ys.slice(),
    h, arc, arcInv, slope, arcTotal,
    /** Total developed (sloped) length of the rafter line. */
    length: arcTotal,
    pitchDeg: (Math.atan2(rise, run) * 180) / Math.PI,
    pitchSun: (rise / run) * 10,
    /** Height at the top of the slope. */
    top: rise,
  };
}
