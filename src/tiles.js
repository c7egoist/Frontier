// ============================================================================
// tiles.js — hongawara-buki tiling (traditional pan + half-round cover tiles)
// Courses = contour bands of the roof height-field (parallel to the eave),
// cover rolls run up the slope, decorated eave-end tiles at the bottom edge.
// ============================================================================
import { clamp, lerp } from './core.js';

// Build tiles for a "capsule field" region (hip faces / hōgyō / whole roof).
// field: from makeField; prof run maps d (metres, level of contour) via field
// opts: { dMax, dStart, module, coverW, colors, rng, jitter, eaveRow, clip }
export function tileField(buf, field, opts) {
  const { colors, rng } = opts;
  const module = opts.module;            // pan+cover pitch along the contour
  const coverW = opts.coverW;
  const rCover = coverW / 2;
  const courseH = opts.courseH;          // exposure of each course up the slope
  const dStart = opts.dStart;            // upper start level (metres from crest)
  const dEnd = opts.dMax;                // eave level (metres)
  const jAmt = opts.jitter ?? 0.3;

  const nCourse = Math.max(2, Math.ceil((dEnd - dStart) / courseH));
  const levels = [];
  for (let k = 0; k <= nCourse; k++) levels.push(dStart + ((dEnd - dStart) * k) / nCourse);

  const zAt = (x, y) => opts.zFn ? opts.zFn(x, y) : field.Z(x, y);
  const ppt = (d, f) => {
    const c = field.contour(d, f);
    return { x: c.x, y: c.y, z: zAt(c.x, c.y) };
  };

  // surface point midway across a pan/cover cell, for orientation
  const surfBetween = (d0, d1, f) => {
    const a = ppt(d0, f), b = ppt(d1, f);
    return [a, b];
  };

  // slight colour variation per tile
  const vary = (base) => {
    const v = 1 + (rng() - 0.5) * jAmt * 0.22;
    return [clamp(base[0] * v, 0, 1), clamp(base[1] * v, 0, 1), clamp(base[2] * v, 0, 1)];
  };

  for (let k = 0; k < nCourse; k++) {
    const d0 = levels[k], d1 = levels[k + 1];
    const dMid = (d0 + d1) / 2;
    const isEaveRow = k === nCourse - 1 && opts.eaveRow;
    const d1x = isEaveRow ? d1 + 0.05 : d1;   // eave course overhangs a touch
    const P = field.perim(dMid);
    const n = Math.max(2, Math.round(P / module));
    const fStep = 1 / n;
    const fOff = 0.5 * fStep;

    for (let i = 0; i < n; i++) {
      const f = i * fStep + fOff;
      // ---- cover tile (half-round roll over the pan joint) ----
      const jx = (rng() - 0.5) * 0.006 * jAmt, jy = (rng() - 0.5) * 0.006 * jAmt;
      const fa = field.contour(d0, f), fb = field.contour(d1x, f);
      const skip = opts.clip && !(opts.clip(fa.x, fa.y) && opts.clip(fb.x, fb.y));
      if (skip) continue;
      const A = { x: fa.x + jx, y: fa.y + jy, z: zAt(fa.x, fa.y) };
      const B = { x: fb.x + jx, y: fb.y + jy, z: zAt(fb.x, fb.y) };
      const col = vary(colors.tile);
      buf.tube([A.x, A.y, A.z + 0.02], [B.x, B.y, B.z + 0.02], rCover * 0.94, rCover, {
        col, sides: 7, up: [0, 0, 1], rings: 1,
      });
      if (isEaveRow) {
        // decorated eave-end tile (gatō): stub + face disc + rim + boss
        const ex = B.x + (B.x - A.x) * 0.09, ey = B.y + (B.y - A.y) * 0.09;
        const ez = B.z + (B.z - A.z) * 0.09;
        buf.tube([B.x, B.y, B.z + 0.02], [ex, ey, ez + 0.008], rCover * 0.98, rCover * 0.92,
          { col: vary(colors.tile), sides: 7, up: [0, 0, 1], rings: 1, caps: true, capCol: colors.tileDark });
        discFace(buf, ex, ey, ez + 0.004, A, rCover * 0.9, colors.tileDark);
        discFace(buf, ex, ey, ez + 0.022, A, rCover * 0.55, colors.tile);
        discFace(buf, ex, ey, ez + 0.030, A, rCover * 0.18, colors.tileDark);
      }
      // ---- pan strip between this cover and the next ----
      const fA = f + fStep / 2 - (coverW * 0.5 + 0.004) / (P * fStep) * fStep;
      const s0f = f + (coverW * 0.44) / P;
      const s1f = f + fStep - (coverW * 0.44) / P;
      if (s1f <= s0f) continue;
      const NW = 4, NL = 2;
      const rows = [];
      for (let jj = 0; jj <= NL; jj++) {
        const dj = lerp(d0, d1x, jj / NL);
        const row = [];
        for (let ii = 0; ii <= NW; ii++) {
          const u = ii / NW;
          const ff = lerp(s0f, s1f, u);
          const c = field.contour(dj, ff);
          const arch = lerp(0.010, 0.026, Math.pow(2 * u - 1, 2)); // concave pan, above deck
          row.push({ x: c.x, y: c.y, z: zAt(c.x, c.y) + arch });
        }
        rows.push(row);
      }
      const panCol = vary(colors.tilePan);
      buf.ribbon(rows, panCol, () => panCol);
      if (isEaveRow) {
        // eave lip of the bottom pan course: small vertical skirt
        const rowA = rows[NL];
        for (let ii = 0; ii < NW; ii++) {
          const a = rowA[ii], b = rowA[ii + 1];
          buf.quad([a.x, a.y, a.z], [b.x, b.y, b.z], [b.x, b.y, b.z - 0.035], [a.x, a.y, a.z - 0.035],
            vary(colors.tilePan));
        }
      }
    }
  }
}

function discFace(buf, x, y, z, toward, r, col) {
  // small flat disc facing "away from" the direction toward->(x,y)
  let dx = x - toward.x, dy = y - toward.y;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const c = 8;
  for (let k = 0; k < c; k++) {
    const a0 = (k / c) * Math.PI * 2, a1 = ((k + 1) / c) * Math.PI * 2;
    const px = dy, py = -dx; // in-plane axis
    const q0 = [x + px * Math.cos(a0) * r + dx * Math.sin(a0) * r,
                y + py * Math.cos(a0) * r + dy * Math.sin(a0) * r, z];
    const q1 = [x + px * Math.cos(a1) * r + dx * Math.sin(a1) * r,
                y + py * Math.cos(a1) * r + dy * Math.sin(a1) * r, z];
    buf.tri([x, y, z], q0, q1, col, [dx, dy, 0]);
  }
}

// Tiles on a GABLE plane field (kirizuma planes / irimoya upper gable).
// Rows run along x (contours y = const); covers run down the ±y slope.
export function tileGable(buf, field, opts) {
  const { colors, rng } = opts;
  const module = opts.module, coverW = opts.coverW, rCover = coverW / 2;
  const courseH = opts.courseH;
  const jAmt = opts.jitter ?? 0.3;
  const halfL = field.halfL;
  const zG = opts.zG;                       // gable surface z(x, y)
  const clip = opts.clip;                   // (x,y)->bool
  const yStart = opts.yStart;               // distance from ridge to first course
  const yEnd = opts.yEnd;                   // extent of tiling (metres from ridge)

  const nCourse = Math.max(1, Math.ceil((yEnd - yStart) / courseH));
  const vary = (base) => {
    const v = 1 + (rng() - 0.5) * jAmt * 0.22;
    return [clamp(base[0]*v,0,1), clamp(base[1]*v,0,1), clamp(base[2]*v,0,1)];
  };

  for (let s of [1, -1]) {                 // both slopes
    for (let k = 0; k < nCourse; k++) {
      const y0 = (yStart + ((yEnd - yStart) * k) / nCourse) * s;
      const y1 = (yStart + ((yEnd - yStart) * (k + 1)) / nCourse) * s;
      const isEaveRow = k === nCourse - 1 && opts.eaveRow;
      const y1x = isEaveRow ? y1 + 0.05 * s : y1;
      const n = Math.max(2, Math.round((2 * halfL - 0.1) / module));
      const stepX = (2 * halfL - 0.1) / n;
      for (let i = 0; i < n; i++) {
        const x0 = -halfL + 0.05 + i * stepX;
        const x1 = x0 + stepX;
        const xm = (x0 + x1) / 2;
        const jx = (rng() - 0.5) * 0.006 * jAmt;
        if (clip && !(clip(xm, y0) && clip(xm, y1))) continue;
        const A = { x: x0 + jx, y: y0, z: zG(x0 + jx, y0) };
        const B = { x: x1 + jx, y: y1x, z: zG(x1 + jx, y1x) };
        const Aa = { x: A.x, y: y0, z: zG(A.x, y0) };
        const col = vary(colors.tile);
        buf.tube([A.x, y0, Aa.z + 0.02], [B.x, y1x, zG(B.x, y1x) + 0.02], rCover * 0.94, rCover,
          { col, sides: 7, up: [0, 0, 1], rings: 1 });
        if (isEaveRow) {
          const ex = (A.x + B.x) / 2, ey = y1x + 0.045 * s, ez = zG(ex, ey) + 0.012;
          buf.tube([ex, y1x, zG(ex, y1x) + 0.02], [ex, ey, ez], rCover * 0.98, rCover * 0.9,
            { col: vary(colors.tile), sides: 7, up: [0, 0, 1], rings: 1, caps: true, capCol: colors.tileDark });
          discFace(buf, ex, ey, ez, { x: ex, y: y0, z: ez }, rCover * 0.88, colors.tileDark);
          discFace(buf, ex, ey, ez + 0.018, { x: ex, y: y0, z: ez }, rCover * 0.52, colors.tile);
        }
        // pan strip
        const NW = 4, NL = 2;
        const rows = [];
        const inner0 = x0 + coverW * 0.44, inner1 = x1 - coverW * 0.44;
        if (inner1 <= inner0) continue;
        for (let jj = 0; jj <= NL; jj++) {
          const yj = lerp(y0, y1x, jj / NL);
          const row = [];
          for (let ii = 0; ii <= NW; ii++) {
            const u = ii / NW;
            const xx = lerp(inner0, inner1, u);
            const arch = lerp(0.010, 0.026, Math.pow(2 * u - 1, 2)); // concave pan
            row.push({ x: xx, y: yj, z: zG(xx, yj) + arch });
          }
          rows.push(row);
        }
        const panCol = vary(colors.tilePan);
        buf.ribbon(rows, panCol, () => panCol);
        if (isEaveRow) {
          const rowA = rows[NL];
          for (let ii = 0; ii < NW; ii++) {
            const a = rowA[ii], b = rowA[ii + 1];
            buf.quad([a.x, a.y, a.z], [b.x, b.y, b.z], [b.x, b.y, b.z - 0.035], [a.x, a.y, a.z - 0.035],
              vary(colors.tilePan));
          }
        }
      }
    }
  }
}
