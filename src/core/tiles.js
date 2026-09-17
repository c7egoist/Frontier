/**
 * Frontier — roof tiles 瓦
 * ------------------------
 * Every tile is a real catalogued size and every lap is the published one, e.g.
 * the standard JIS 桟瓦: 300 × 305 overall, 205 × 260 working → a 95 mm head lap
 * and a 45 mm side lap; 20 pcs/m² ⇒ 56 kg/m². (docs/ROOF_RESEARCH.md §3)
 *
 * Tiles are not flat quads: each one is a lofted solid whose cross section is the
 * true tile profile (pan + interlocking roll rib + the lip that hooks over the
 * neighbouring rib), and it is *bent along the roof surface* by sampling
 * S(face, m, a) at each station. That is what guarantees a tile follows the
 * curvature (照り / 举折) and the corner sweep instead of floating off it.
 */

import {
  Part, lerp, clamp, smoothstep, vnorm, vsub, vadd, vmul, TAU,
} from './geom.js';

// ── catalog ───────────────────────────────────────────────────────────────────
// length/width are the *overall* tile; workL/workW the exposed (working) pitch.
export const TILE_CATALOG = {
  sangawara_300: {
    id: 'sangawara_300', family: 'sangawara', name: '桟瓦 JIS 300×305',
    length: 0.300, width: 0.305, workL: 0.205, workW: 0.260,
    thickness: 0.012, ribHeight: 0.027, ribWidth: 0.045, panSag: 0.004,
    massPerM2: 56, note: '20 pcs/m², 2.8 kg/pc — the modern standard',
  },
  sangawara_64: {
    id: 'sangawara_64', family: 'sangawara', name: '64判 和瓦 (古民家)',
    length: 0.287, width: 0.277, workL: 0.212, workW: 0.242,
    thickness: 0.013, ribHeight: 0.028, ribWidth: 0.035, panSag: 0.005,
    massPerM2: 48, note: '287×277 / 212×242 — old minka size',
  },
  sangawara_60: {
    id: 'sangawara_60', family: 'sangawara', name: '60判 町家瓦',
    length: 0.292, width: 0.289, workL: 0.218, workW: 0.252,
    thickness: 0.013, ribHeight: 0.028, ribWidth: 0.037, panSag: 0.005,
    massPerM2: 48.6, note: '292×289 / 218×252 — machiya',
  },
  sangawara_53: {
    id: 'sangawara_53', family: 'sangawara', name: '53判 大瓦',
    length: 0.305, width: 0.300, workL: 0.235, workW: 0.265,
    thickness: 0.015, ribHeight: 0.030, ribWidth: 0.035, panSag: 0.005,
    massPerM2: 44.8, note: '305×300 / 235×265 — big temple tile',
  },
  hongawara: {
    id: 'hongawara', family: 'hongawara', name: '本瓦葺 平瓦+丸瓦',
    length: 0.300, width: 0.240, workL: 0.220, workW: 0.240,
    thickness: 0.020, edgeRise: 0.045, edgeWidth: 0.035,
    barrelDiameter: 0.165, barrelThickness: 0.016, barrelLength: 0.320,
    massPerM2: 68, note: 'flat pan tiles with a separate barrel tile over every joint',
  },
  kokerabuki: {
    id: 'kokerabuki', family: 'shingle', name: 'こけら葺 / 柿葺 (木片)',
    length: 0.300, width: 0.150, workL: 0.090, workW: 0.135,
    thickness: 0.004, massPerM2: 12, note: 'thin cypress shingles, staggered, shrine work',
  },
  hiwadabuki: {
    id: 'hiwadabuki', family: 'shingle', name: '檜皮葺 (cypress bark)',
    length: 0.300, width: 0.150, workL: 0.075, workW: 0.130,
    thickness: 0.008, massPerM2: 22, note: 'thick bark courses, shrines',
  },
  thatch: {
    id: 'thatch', family: 'thatch', name: '茅葺 (thatch)',
    length: 0.900, width: 0.600, workL: 0.250, workW: 0.600,
    thickness: 0.450, massPerM2: 90, note: 'very thick steep thatch, gasshō-zukuri',
  },
  metal_kawara: {
    id: 'metal_kawara', family: 'metal', name: '金属瓦 (kawara metal tile)',
    length: 0.295, width: 0.290, workL: 0.265, workW: 0.265,
    thickness: 0.0012, ribHeight: 0.024, ribWidth: 0.040, panSag: 0.003,
    massPerM2: 4.3, note: '290×295 sheet, 265×265 effective, 14.29 pcs/m²',
  },
  seam_metal: {
    id: 'seam_metal', family: 'seam', name: '金属板 瓦棒葺 (standing seam)',
    length: 1.000, width: 0.400, workL: 1.000, workW: 0.400,
    thickness: 0.0012, ribHeight: 0.040, ribWidth: 0.030, panSag: 0,
    massPerM2: 5, note: 'modern long-pan metal — the "modern styling" tile swap',
  },
};

export const TILE_PRESETS = {
  sangawara: 'sangawara_300',
  washi: 'sangawara_64',
  machiya: 'sangawara_60',
  temple: 'hongawara',
  shrine: 'kokerabuki',
  bark: 'hiwadabuki',
  thatch: 'thatch',
  metal: 'metal_kawara',
  seam: 'seam_metal',
};

export function resolveTile(spec) {
  const key = typeof spec === 'string' ? spec : spec.id;
  const tile = { ...(TILE_CATALOG[key] || TILE_CATALOG[TILE_PRESETS[key]] || TILE_CATALOG.sangawara_300) };
  if (typeof spec === 'object') Object.assign(tile, spec);
  // How far the material hangs below the bed plane (the plane through which it rests
  // on the 瓦桟): drives the deck depth, so a 450 mm 茅葺 bundle pushes the frame down.
  tile.bedDepth = tile.bedDepth ?? tile.thickness * (tile.family === 'thatch' ? 0.72 : 0.72);
  tile.headLap = tile.length - tile.workL;
  tile.sideLap = tile.width - tile.workW;
  tile.coverage = (tile.length * tile.width) / (tile.workL * tile.workW);
  return tile;
}

// ── cross sections ────────────────────────────────────────────────────────────
// Polygon in (u = across, v = height above the roof surface), closed, CCW.
// uMin/uMax clip the tile when the layout has to insert an 調整瓦 at a hip/verge.

function sectionSangawara(t, uMin, uMax) {
  const W = t.width, half = W / 2;
  const lip = t.width - t.workW;
  const rib = t.ribWidth, rh = t.ribHeight, th = t.thickness, sag = t.panSag;
  const uRibIn = half - rib;
  const pts = [];
  const panTop = (u) => {
    const s = (u - (-half + lip)) / (uRibIn - (-half + lip) || 1);
    return th - sag * Math.sin(Math.PI * clamp(s));
  };
  pts.push([-half, rh]);                       // hook underside (rests on neighbour's rib)
  pts.push([-half, rh + th]);                  // hook top
  pts.push([-half + lip, rh + th]);            // hook inner top
  pts.push([-half + lip, th - sag * 0.15]);    // drop onto the pan
  const N = 6;
  for (let i = 1; i <= N; i++) {
    const u = lerp(-half + lip, uRibIn, i / N);
    pts.push([u, panTop(u)]);
  }
  pts.push([uRibIn, th]);                      // pan meets the roll rib
  pts.push([uRibIn + rib * 0.25, rh + th]);    // rib rises
  pts.push([half - rib * 0.25, rh + th]);      // rib crest
  pts.push([half, rh + th - th * 0.6]);        // rib outer shoulder
  pts.push([half, 0]);                         // rib outer face down to the surface
  pts.push([-half + lip, 0]);                  // underside back to the hook
  pts.push([-half + lip, rh]);                 // up the hook step
  return clipPolygonU(pts, uMin, uMax);
}

function sectionHiragawara(t, uMin, uMax) {
  const W = t.width, half = W / 2, th = t.thickness, e = t.edgeRise, ew = t.edgeWidth;
  const pts = [
    [-half, 0], [-half, e], [-half + ew, e], [-half + ew, th],
    [half - ew, th], [half - ew, e], [half, e], [half, 0],
  ];
  return clipPolygonU(pts, uMin, uMax);
}

function sectionShingle(t, uMin, uMax) {
  const W = t.width, half = W / 2, th = t.thickness;
  return clipPolygonU([
    [-half, 0], [-half, th], [-half + W * 0.06, th * 1.4],
    [half - W * 0.06, th], [half, th * 1.2], [half, 0],
  ], uMin, uMax);
}

function sectionThatch(t, uMin, uMax) {
  // 茅葺 is not laid as discrete tiles: each "course" is a thick bound bundle,
  // built here as a thick tapered slab that the next course overlaps heavily.
  const W = t.width, half = W / 2, T = t.thickness;
  return clipPolygonU([
    [-half, 0], [half, 0], [half, -T * 0.72],
    [half * 0.55, -T], [-half * 0.55, -T], [-half, -T * 0.72],
  ], uMin, uMax);
}

function sectionSeam(t, uMin, uMax) {
  const W = t.width, half = W / 2, rh = t.ribHeight, rw = t.ribWidth, th = t.thickness;
  const pts = [
    [-half, 0], [-half, rh], [-half + rw, rh], [-half + rw, th],
    [half - rw, th], [half - rw, rh], [half, rh], [half, 0],
  ];
  return clipPolygonU(pts, uMin, uMax);
}

/** Sutherland–Hodgman clip against u ≥ uMin and u ≤ uMax. */
export function clipPolygonU(poly, uMin = -Infinity, uMax = Infinity) {
  const clip = (pts, inside, intersect) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const A = pts[i], B = pts[(i + 1) % pts.length];
      const ain = inside(A), bin = inside(B);
      if (ain) out.push(A);
      if (ain !== bin) out.push(intersect(A, B));
    }
    return out;
  };
  let p = poly;
  if (uMin > -Infinity) p = clip(p, (q) => q[0] >= uMin, (a, b) => {
    const t = (uMin - a[0]) / (b[0] - a[0]); return [uMin, lerp(a[1], b[1], t)];
  });
  if (uMax < Infinity) p = clip(p, (q) => q[0] <= uMax, (a, b) => {
    const t = (uMax - a[0]) / (b[0] - a[0]); return [uMax, lerp(a[1], b[1], t)];
  });
  // strip collinear duplicates
  const out = [];
  for (const q of p) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-6) out.push(q);
  }
  if (out.length > 1) {
    const f = out[0], l = out[out.length - 1];
    if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) out.pop();
  }
  return out;
}

export function sectionFor(tile, uMin = -Infinity, uMax = Infinity) {
  switch (tile.family) {
    case 'sangawara':
    case 'metal': return sectionSangawara(tile, uMin, uMax);
    case 'hongawara': return sectionHiragawara(tile, uMin, uMax);
    case 'shingle': return sectionShingle(tile, uMin, uMax);
    case 'seam': return sectionSeam(tile, uMin, uMax);
    case 'thatch': return sectionThatch(tile, uMin, uMax);
    default: return sectionSangawara(tile, uMin, uMax);
  }
}

// ── geometry of one tile ──────────────────────────────────────────────────────

/**
 * Build one tile as a bent prism.
 * @param {Part} part
 * @param {object} surface buildSurface() result
 * @param {object} face    surface face
 * @param {number} m0      plan distance of the NOSE (down-slope end)
 * @param {number} a0      across position of the tile's uMin corner
 * @param {object} tile    catalog entry
 * @param {object} opts    { lengthSegments, eaveTile, thicknessScale, snowStop }
 */
export function buildTileSolid(part, surface, face, m0, a0, tile, opts = {}) {
  const segs = opts.lengthSegments ?? 5;
  const prof = face.profile;
  const s0 = prof.arc(m0);
  const endArc = Math.min(s0 + tile.length, face.arcMax ?? prof.arcTotal);
  const aCentre = a0 + tile.width / 2;
  const base = sectionFor(tile);
  if (!base || base.length < 3) return 0;
  const t0 = part.triCount;
  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const s = lerp(s0, endArc, i / segs);
    const m = prof.arcInv(s);
    const f = surface.frameAt(face, m, aCentre);
    // 調整瓦: clip the section at every station so the tile edge follows the hip
    // line / verge diagonally, the way a roofer cuts it.
    const hw = surface.halfWidth(face, m);
    const uMaxHere = Math.max(-tile.width / 2, Math.min(opts.uMax ?? tile.width / 2, hw - aCentre));
    const uMinHere = Math.min(tile.width / 2, Math.max(opts.uMin ?? -tile.width / 2, -hw - aCentre));
    const nose = (i === 0 && opts.eaveTile) ? 0.004 : 0;
    const origin = vadd(f.origin, vmul(f.normal, nose));
    rings.push(base.map(([u, v]) => {
      const uu = clamp(u, uMinHere, uMaxHere);
      return [
        origin[0] + f.x[0] * uu + f.y[0] * v,
        origin[1] + f.x[1] * uu + f.y[1] * v,
        origin[2] + f.x[2] * uu + f.y[2] * v,
      ];
    }));
  }
  part.loft(rings, { closed: true, capStart: true, capEnd: true });

  // 雪止め snow-stop: a small hook on the nose of selected courses
  if (opts.snowStop) {
    const f = surface.frameAt(face, m0, aCentre);
    const o = f.origin;
    const h = 0.035;
    const a = vadd(o, vmul(f.x, Math.max(opts.uMin ?? -tile.width / 2, -tile.width / 2 + 0.02)));
    const b = vadd(a, vmul(f.y, tile.thickness + h));
    const c = vadd(b, vmul(f.z, -h * 1.4));
    part.boxBetween(a, c, [0.02, 0.02], f.y);
  }
  return part.triCount - t0;
}

// ── covering a face ───────────────────────────────────────────────────────────

/**
 * Lay tiles over one face. Returns layout info for validation:
 * courses, tiles, per-tile support gap is checked separately by validate.js.
 */
export function coverFace(surface, face, tile, spec, opts = {}) {
  const prof = face.profile;
  const arcTop = face.arcMax ?? prof.arc(face.mMax);
  const courses = [];
  const nMax = Math.floor((prof.arc(face.mMax) - 1e-4) / tile.workL) + 1;
  for (let k = 0; k < nMax; k++) {
    courses.push({ index: k, m: prof.arcInv(k * tile.workL), arc: k * tile.workL });
  }
  const align = spec.tiles.align ?? 'center';
  const sink = opts.sink ?? (() => opts.part);
  const tiles = [];
  const segs = opts.lengthSegments ?? 5;
  const snowEvery = opts.snowStopEvery ?? 0;

  for (const course of courses) {
    const hw = surface.halfWidth(face, course.m);
    if (hw <= 0.02) continue;
    const step = tile.workW;
    const cols = [];
    if (align === 'center') {
      // start one half-tile outside the trim so the two edge tiles (the 調整瓦) are cut
      // equally, then walk outward from the centre line in both directions
      for (let i = 0; ; i++) {
        const a = i * step;
        if (a - tile.width / 2 >= hw - 1e-6) break;
        cols.push(a);
        if (i > 0) cols.push(-a);
      }
    } else {
      for (let a = -hw + tile.width / 2; a - tile.width / 2 < hw - 1e-4; a += step) cols.push(a);
    }
    for (const col of cols) {
      // `col` is the CENTRE of the tile's u-range: the tile physically spans
      // [col + uMin, col + uMax], so the trim against the hip/verge must be measured
      // from that edge, not from the centre.
      const uMin = -tile.width / 2;
      let uMax = tile.width / 2;
      const aStart = col;
      if (aStart + uMin >= hw - 1e-6) continue;             // wholly outside the trim
      const over = (aStart + uMax) - hw;
      let adjusted = false;
      if (over > 0) {
        // 調整瓦: the tile that runs into the hip / verge is cut back along the
        // diagonal, never to less than ~a fifth of a tile (隅棟 covers the remainder).
        uMax -= over;
        adjusted = true;
      }
      if (uMax - uMin < 0.06) continue;
      const isEave = course.index === 0;
      const snowStop = snowEvery > 0 && !isEave && course.index % snowEvery === 0;
      const part = sink({ eave: isEave, snowStop });
      buildTileSolid(part, surface, face, course.m, aStart, tile, {
        lengthSegments: segs, eaveTile: isEave, uMin, uMax, snowStop,
      });
      // 本瓦葺 丸瓦: a barrel tile is laid over EVERY joint between pans — except at the
      // very top of the slope, where the 棟 (ridge) stack covers the joint instead, and
      // except where the joint runs into the hip (隅棟 covers that).
      if (tile.family === 'hongawara' && !isEave) {
        const aJoint = aStart + uMax - (tile.width - tile.workW) / 2;
        const ar = prof.arc(course.m);
        const hwJ = surface.halfWidth(face, course.m + tile.workL);
        const fits = aJoint < hwJ - tile.barrelDiameter * 0.75
          && aJoint - tile.barrelDiameter * 0.75 > -hwJ;
        const belowRidge = ar + (tile.barrelLength ?? tile.length + 0.02) <= arcTop + 1e-6;
        if (fits && belowRidge) buildBarrelTile(part, surface, face, course.m, aJoint, tile, segs);
      }
      tiles.push({
        face: face.id, course: course.index, m: course.m, arc: course.arc, a: col,
        uMin, uMax, width: uMax - uMin, length: tile.length, adjusted, eave: isEave, snowStop,
      });
    }
  }
  face.courses = courses;
  return { courses, tiles };
}

/**
 * 丸瓦 (marugawara) — the half-round barrel tile that straddles the joint between two
 * 平瓦 pans in 本瓦葺. Its axis runs up the slope, lapped 100 mm over the one below.
 */
export function buildBarrelTile(part, surface, face, m0, aJoint, tile, segs = 5) {
  const prof = face.profile;
  const r = tile.barrelDiameter / 2;
  const lift = tile.edgeRise ?? 0.045;
  const s0 = prof.arc(m0);
  const endArc = Math.min(s0 + (tile.barrelLength ?? tile.length + 0.02), face.arcMax ?? prof.arcTotal);
  const rings = [];
  const N = 7;
  for (let i = 0; i <= segs; i++) {
    const m = prof.arcInv(lerp(s0, endArc, i / segs));
    const f = surface.frameAt(face, m, aJoint);
    const origin = vadd(f.origin, vmul(f.normal, lift * 0.55));
    const outer = [], inner = [];
    for (let k = 0; k <= N; k++) {
      const ang = Math.PI * (k / N);              // barrel as a half cylinder, round side up
      const cu = Math.cos(ang) * r, cv = Math.sin(ang) * r;
      outer.push([origin[0] + f.x[0] * cu + f.y[0] * cv, origin[1] + f.x[1] * cu + f.y[1] * cv, origin[2] + f.x[2] * cu + f.y[2] * cv]);
      const ri = r - (tile.barrelThickness ?? 0.016);
      inner.push([origin[0] + f.x[0] * Math.cos(ang) * ri + f.y[0] * Math.sin(ang) * ri,
        origin[1] + f.x[1] * Math.cos(ang) * ri + f.y[1] * Math.sin(ang) * ri,
        origin[2] + f.x[2] * Math.cos(ang) * ri + f.y[2] * Math.sin(ang) * ri]);
    }
    rings.push({ outer, inner });
  }
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k + 1 <= N; k++) {
      part.quad(rings[i].outer[k], rings[i].outer[k + 1], rings[i + 1].outer[k + 1], rings[i + 1].outer[k]);
      part.quad(rings[i + 1].inner[k], rings[i + 1].inner[k + 1], rings[i].inner[k + 1], rings[i].inner[k]);
    }
    part.quad(rings[i].outer[0], rings[i + 1].outer[0], rings[i + 1].inner[0], rings[i].inner[0]);
    part.quad(rings[i].inner[N], rings[i + 1].inner[N], rings[i + 1].outer[N], rings[i].outer[N]);
  }
  part.fan([...rings[0].outer].reverse());
  part.fan(rings[rings.length - 1].outer);
  return part.triCount;
}

// ── ridge 棟 / 大棟 ───────────────────────────────────────────────────────────

/**
 * The main ridge: 熨瓦 noshigawara infill courses stacked into a trapezoid with a
 * 冠瓦 kangawara cap on top. This mass is also what stops a Japanese roof lifting
 * off in a typhoon. Optionally closed with 鬼瓦 at both ends.
 */
export function buildMainRidge(part, surface, tile, spec) {
  const [p0, p1] = surface.ridgeLine();
  const dir = vnorm(vsub(p1, p0));
  const alongY = [0, 1, 0];
  const across = vnorm([-dir[2], 0, dir[0]]);
  const thickness = (spec.ridge.thickness ?? 0.34);
  const layers = spec.ridge.layers ?? 3;
  const layerH = (spec.ridge.layerHeight ?? 0.052);
  const capR = (spec.ridge.capRadius ?? 0.13);
  const up = (p, h) => vadd(p, vmul(alongY, h));

  const segs = spec.ridge.segments ?? Math.max(4, Math.round(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / 0.28));
  const ext = spec.ridge.endExtension ?? 0.02;
  const A = vadd(p0, vmul(dir, -ext)), B = vadd(p1, vmul(dir, ext));

  // 熨瓦 stack (each course a ring, stacked & tapered)
  for (let l = 0; l < layers; l++) {
    const w = thickness / 2 - l * (thickness * 0.085);
    const y0 = l * layerH, y1 = y0 + layerH;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const c0 = vadd(A, vmul(vsub(B, A), t0));
      const c1 = vadd(A, vmul(vsub(B, A), t1));
      const P = (c, s) => vadd(vadd(c, vmul(across, s * w)), vmul(alongY, y0));
      const P2 = (c, s) => vadd(vadd(c, vmul(across, s * w)), vmul(alongY, y1));
      const a = P(c0, -1), b = P(c1, -1), c = P(c1, 1), d = P(c0, 1);
      part.quad(a, b, c, d);                                  // top of the layer
      part.quad(a, d, up(P2(c0, 1), 0), up(P2(c1, 1), 0));    // side faces
      part.quad(up(P2(c1, -1), 0), up(P2(c0, -1), 0), a, b);
    }
  }
  // 冠瓦 kangawara: half-round cap running the ridge
  const capY = layers * layerH;
  const capPts = [];
  for (let i = 0; i <= segs * 2; i++) {
    const t = i / (segs * 2);
    capPts.push(vadd(A, vmul(vsub(B, A), t)));
  }
  // proper half-round: barrel along the ridge
  const barrelA = vadd(A, vmul(alongY, capY));
  const barrelB = vadd(B, vmul(alongY, capY));
  part.barrel(barrelA, barrelB, capR, 0.022, 0, Math.PI, 12);

  // 熨瓦 end stops + 鬼瓦 / 鴟尾 at both ends
  const ends = [{ c: A, s: -1 }, { c: B, s: 1 }];
  for (const e of ends) {
    const base = vadd(e.c, vmul(alongY, capY - layerH * 0.2));
    const top = vadd(e.c, vmul(alongY, capY + capR * 0.35));
    part.boxBetween(vadd(base, vmul(dir, e.s * 0.0)), vadd(top, vmul(dir, e.s * -0.02)),
      [thickness * 1.05, capR * 1.5], alongY);
    if (spec.ridge.end === 'onigawara') buildOnigawara(part, e.c, dir, e.s, capY, capR);
    else if (spec.ridge.end === 'shachihoko') buildShachihoko(part, e.c, dir, e.s, capY, capR);
    else if (spec.ridge.end === 'shibi') buildShibi(part, e.c, dir, e.s, capY, capR);
  }
  if (spec.ridge.ornament === 'chigi') {
    for (const e of ends) buildChigi(part, e.c, dir, e.s, capY);
  }
  if (spec.ridge.ornament === 'katsuogi') {
    const n = spec.ridge.katsuogiCount ?? 4;
    for (let i = 1; i <= n; i++) {
      const c = vadd(A, vmul(vsub(B, A), i / (n + 1)));
      const y = capY + capR * 0.9;
      const d = vnorm(vsub(B, A));
      const a = vadd(c, vmul(across, -0.14));
      const b = vadd(c, vmul(across, 0.14));
      part.cylinder(vadd(a, vmul(alongY, y)), vadd(b, vmul(alongY, y)), 0.055, 8);
    }
  }
  return { ridgeLength: surface.ridgeHalf * 2, capRadius: capR };
}

/** 鬼瓦 onigawara — the demon-face end tile that caps the ridge (stylised block). */
function buildOnigawara(part, c, dir, s, capY, capR) {
  const up = [0, 1, 0];
  const across = vnorm([-dir[2], 0, dir[0]]);
  const base = vadd(c, vmul(up, capY - 0.06));
  const W = 0.29, H = 0.30, T = 0.15;
  const corner = (a, y, d) => vadd(vadd(base, vmul(across, a)), vadd(vmul(up, y), vmul(dir, d * s)));
  // a tapering slab with a curled base — reads as an onigawara at building scale
  const ringA = [corner(-W / 2, 0, 0.02), corner(W / 2, 0, 0.02), corner(W / 2 - 0.02, 0, T), corner(-W / 2 + 0.02, 0, T)];
  const ringB = [corner(-W / 2 * 0.86, H, 0.03), corner(W / 2 * 0.86, H, 0.03),
    corner(W / 2 * 0.7, H, T - 0.02), corner(-W / 2 * 0.7, H, T - 0.02)];
  part.loft([ringA, ringB], { closed: true });
  // brow ridge + horns give it the oni silhouette
  part.boxBetween(corner(0, H * 0.78, 0.03), corner(0, H * 0.78, T * 0.8), [0.05, 0.05], up);
  for (const sx of [-1, 1]) {
    const a = corner(sx * W * 0.3, H * 0.97, T * 0.5);
    const b = corner(sx * W * 0.42, H * 1.24, T * 0.5);
    part.boxBetween(a, b, [0.035, 0.035], up);
  }
}

/** 鯱 shachihoko — castle finial (fish body, tiger head), simplified silhouette. */
function buildShachihoko(part, c, dir, s, capY, capR) {
  const up = [0, 1, 0];
  const base = vadd(c, vmul(up, capY + capR * 0.4));
  const body = [
    vadd(base, [0, 0, 0]),
    vadd(base, [0.0, 0.34, 0.02]),
    vadd(base, [0.06, 0.62, -0.02]),
  ];
  part.curvedBeam(body, 0.14, 0.11, () => up);
  part.boxBetween(body[2], vadd(base, [0.02, 0.76, -0.10]), [0.10, 0.10], up);
  const tail = [vadd(base, [-0.04, 0.60, 0.04]), vadd(base, [-0.10, 0.80, 0.16])];
  part.curvedBeam(tail, 0.06, 0.10, () => up);
}

/** 鴟尾 shibi — the older temple ridge-end finial. */
function buildShibi(part, c, dir, s, capY, capR) {
  const up = [0, 1, 0];
  const across = vnorm([-dir[2], 0, dir[0]]);
  const base = vadd(c, vmul(up, capY));
  // 鴟尾 scale with the ridge they crown: a 大棟 carries a ~1.2 m finial
  const k = Math.max(1, capR / 0.19);
  const P = (a, y, d) => vadd(vadd(base, vmul(across, a * k)), vadd(vmul(up, y * k), vmul(dir, d * k)));
  part.loft([
    [P(-0.10, 0.0, 0), P(0.10, 0.0, 0), P(0.10, 0.0, 0.22), P(-0.10, 0.0, 0.22)],
    [P(-0.19, 0.50, 0.02), P(0.19, 0.50, 0.02), P(0.19, 0.50, 0.30), P(-0.19, 0.50, 0.30)],
    [P(-0.13, 0.72, 0.05), P(0.13, 0.72, 0.05), P(0.13, 0.72, 0.30), P(-0.13, 0.72, 0.30)],
    [P(-0.03, 0.92, 0.08), P(0.03, 0.92, 0.08), P(0.03, 0.92, 0.26), P(-0.03, 0.92, 0.26)],
  ], { closed: true });
}

/** 千木 chigi — the crossed finials of a Shintō shrine roof. */
function buildChigi(part, c, dir, s, capY) {
  const across = vnorm([-dir[2], 0, dir[0]]);
  const base = vadd(c, [0, capY, 0]);
  for (const sx of [-1, 1]) {
    const a = vadd(base, vmul(across, sx * 0.04));
    const b = vadd(vadd(base, vmul(across, sx * 0.34)), [0, 1.5, 0]);
    part.curvedBeam([a, vlerp3(a, b, 0.5), b], 0.09, 0.09, () => [0, 1, 0]);
  }
}
const vlerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ── hip ridges 隅棟 ───────────────────────────────────────────────────────────

/** Stacked tiles following each hip line, ending in a 隅巴 (curled corner tile). */
export function buildHipRidges(part, surface, tile, spec) {
  const hips = surface.hipLines();
  const capR = (spec.ridge.hipCapRadius ?? 0.105);
  const layers = spec.ridge.hipLayers ?? 2;
  const layerH = spec.ridge.layerHeight ?? 0.052;
  for (const hip of hips) {
    const pts = hip.points;
    // local normal = bisector of the two adjacent faces' normals
    const mainF = surface.faces.find((f) => f.kind === 'main' && f.sign === hip.sz);
    const endF = surface.faces.find((f) => f.kind === 'end' && f.sign === hip.sx);
    const path = [];
    const segs = Math.max(6, Math.round(pts.length * 1.5));
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const idx = t * (pts.length - 1);
      const i0 = Math.floor(idx), i1 = Math.min(pts.length - 1, i0 + 1);
      const p = vlerp3(pts[i0], pts[i1], idx - i0);
      const m = t * surface.hipRun;
      // Sample each face's normal a little inside it: exactly on the hip diagonal the
      // corner flare (t → 0) makes frameAt degenerate and the cap would splay into spikes.
      const sweep = surface.sweepTop ?? 0;
      const tSafe = Math.max(m, sweep * 1.05) + 0.06;
      const aA = hip.sx * (mainF.half - Math.min(tSafe, mainF.half - 0.02));
      const aB = hip.sz * (endF.half - Math.min(tSafe, endF.half - 0.02));
      const nA = surface.normalAt(mainF, Math.min(m, mainF.mMax), aA);
      const nB = surface.normalAt(endF, Math.min(m, endF.mMax), aB);
      let n = vnorm(vadd(nA, nB));
      if (!isFinite(n[0])) n = nA;
      const tangent = i === 0 ? vnorm(vsub(pts[1], pts[0])) : vnorm(vsub(p, vlerp3(pts[Math.max(0, i0 - 1)], pts[i1], 0)));
      let x = vnorm(vsub([0, 1, 0], vmul(n, n[1])));
      if (!isFinite(x[0])) x = [1, 0, 0];
      const y = n;
      const z = vnorm(vcrossV(x, y));
      path.push({ origin: p, frame: { x, y, z }, tangent, n });
    }
    // trapezoid stack
    for (let l = 0; l < layers; l++) {
      const w = 0.155 - l * 0.03;
      const y0 = l * layerH * 0.85;
      for (let i = 0; i + 1 < path.length; i++) {
        const A = path[i], B = path[i + 1];
        const P = (S, s, yy) => vadd(vadd(S.origin, vmul(S.frame.x, s * w)), vmul(S.frame.y, yy));
        part.quad(P(A, -1, y0), P(B, -1, y0), P(B, 1, y0), P(A, 1, y0));
        part.quad(P(A, 1, y0), P(B, 1, y0), vadd(P(B, 1, y0), vmul(B.frame.y, layerH)), vadd(P(A, 1, y0), vmul(A.frame.y, layerH)));
      }
    }
    // 隅棟 cap tile: a half-round roll down the hip
    const capPath = path.map((S) => ({ origin: vadd(S.origin, vmul(S.frame.y, layers * layerH * 0.85)), frame: S.frame }));
    part.extrudePolygon([[-capR, 0], [-capR * 0.7, capR], [0, capR * 1.15], [capR * 0.7, capR], [capR, 0]], capPath);
    // 隅巴 / 隅鬼 at the eave end — the curled corner tile
    const e = path[0];
    const o = vadd(e.origin, vmul(e.frame.y, 0.02));
    const p1 = vadd(o, vmul(e.frame.x, -0.13));
    const p2 = vadd(o, vmul(e.frame.x, 0.13));
    const up1 = vadd(vadd(o, vmul(e.frame.y, 0.16)), vmul(e.frame.z, 0.06));
    part.cylinder(vadd(p1, vmul(e.frame.y, 0.05)), vadd(p2, vmul(e.frame.y, 0.05)), 0.075, 10);
  }
  return hips.length;
}
const vcrossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ── verges 袖瓦 / 破風 and eaves 軒 ─────────────────────────────────────────────

/** Verge tiles (袖瓦/角瓦) closing the tile edge along a gable or eave trim. */
export function buildVerge(part, surface, tile, spec) {
  const made = [];
  for (const face of surface.faces) {
    if (!face.gableEdge) continue;        // hip edges are covered by the 隅棟 instead
    const prof = face.profile;
    const arcFrom = prof.arc(face.gableEdgeFrom);
    const steps = Math.max(4, Math.round((face.arcMax - arcFrom) / 0.22));
    const path = [];
    for (let i = 0; i <= steps; i++) {
      const s = lerp(arcFrom, face.arcMax, i / steps);
      const m = prof.arcInv(s);
      const hw = surface.halfWidth(face, m);
      path.push({ m, a: hw });
    }
    for (const side of [1, -1]) {
      const pts = [];
      for (const q of path) {
        const a = side * q.a;
        const f = surface.frameAt(face, q.m, a);
        pts.push({ origin: vadd(f.origin, vmul(f.normal, tile.thickness * 0.4)), frame: f });
      }
      // 袖瓦 section: a small roll capping the tile edge
      part.extrudePolygon([
        [-0.055, 0], [-0.055, tile.ribHeight * 0.9 + tile.thickness],
        [0, tile.ribHeight * 0.9 + tile.thickness * 2.2], [0.055, tile.ribHeight * 0.9 + tile.thickness],
        [0.055, 0],
      ], pts);
      made.push({ face: face.id, side });
    }
  }
  return made.length;
}

/** 茅負 kayao / 広小舞 hikoma — the board that closes the eave under the tile noses. */
export function buildEaveBoard(part, surface, tile, spec) {
  const h = spec.eave?.hikomaHeight ?? 0.04;
  const t = spec.eave?.hikomaThickness ?? 0.018;
  const noseProject = spec.eave?.tileProjection ?? 0.06;
  const made = [];
  for (const face of surface.faces) {
    const prof = face.profile;
    const steps = Math.max(10, Math.round(surface.halfWidth(face, 0) / 0.22));
    const hw = surface.halfWidth(face, 0);
    const path = [];
    for (let i = 0; i <= steps * 2; i++) {
      const a = lerp(-hw, hw, i / (steps * 2));
      const f = surface.frameAt(face, 0, a);
      const o = vadd(vadd(f.origin, vmul(f.normal, -tile.thickness - h * 0.5)), vmul(f.z, -noseProject));
      path.push({ origin: o, frame: f });
    }
    // the board itself (茅負 kayao / 広小舞 hikoma)
    const sec = [[-t / 2, -h / 2], [t / 2, -h / 2], [t / 2, h / 2], [-t / 2, h / 2]];
    part.extrudePolygon(sec, path);
    made.push({ face: face.id, height: h });
  }
  return made;
}

/** 破風 bargeboard + 鼻隠し fascia closing the gable and eave ends. */
export function buildBargeboard(part, surface, tile, spec) {
  const depth = spec.eave?.fasciaDepth ?? 0.22;
  const th = spec.eave?.fasciaThickness ?? 0.03;
  const made = [];
  for (const sx of [1, -1]) {
    const g = surface.gableOutline(sx);
    if (!g) continue;
    for (const edge of g.edges) {
      const pts = edge.points;
      const path = pts.map((p, i) => {
        const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
        const tangent = vnorm(vsub(next, prev));
        // the 破風 lies in the gable plane: board thickness along the plane normal,
        // board width down the raking edge
        let x = [sx, 0, 0];
        let y = vnorm(vcrossV(x, tangent));
        if (y[1] < 0) { y = vmul(y, -1); x = vmul(x, -1); }
        return { origin: p, frame: { x, y, z: tangent } };
      });
      // section: (u, v) = (outward normal, up); the board hangs below the roof edge
      part.extrudePolygon([[0, -depth], [th, -depth], [th, 0.004], [0, 0.004]], path);
      if (spec.eave?.gegyo) {
        const f = path[path.length - 1];          // 懸魚 pendant at the apex
        part.extrudePolygon([
          [-0.14, -0.30], [0.14, -0.30], [0.11, -0.03], [0, 0.05], [-0.11, -0.03],
        ], [{ origin: vadd(f.origin, vmul(f.frame.y, -0.02)), frame: f.frame },
          { origin: vadd(f.origin, vmul(f.frame.y, -0.06)), frame: f.frame }]);
      }
    }
    made.push({ sx, hipped: g.hipped, mFrom: g.mFrom });
  }
  return made;
}

export function tileStats(tile) {
  return {
    id: tile.id, name: tile.name, headLap: tile.headLap, sideLap: tile.sideLap,
    coverage: tile.coverage, massPerM2: tile.massPerM2,
    perM2: 1 / (tile.workL * tile.workW),
  };
}
