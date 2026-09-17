// Roof engine: East-Asian roof forms (gable / hip / irimoya / pyramid / pagoda tiers /
// skirt eaves) with flying eaves (sori), tile courses, ridge caps, rafters and ornaments.
//
// All roof geometry is built from a parametric surface sample(u, v) so the decorative
// sweeps (tile ribs, ridge caps, eave boards) follow the exact same curvature.
import * as THREE from 'three';
import { gridToGeometry, mergeList, normalizeGeo } from './geom.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const TILE_TYPES = ['kawara', 'ridge-round', 'flat-clay', 'slate', 'metal-rib', 'shingle', 'thatch'];

/* ------------------------------------------------------------------ */
/* Generic sweep: extrude a 2D profile along a list of surface frames  */
/* ------------------------------------------------------------------ */

/**
 * @param {Array<{p:THREE.Vector3,n:THREE.Vector3,t:THREE.Vector3}>} samples
 * @param {Array<[number,number]>} profile [sideOffset, normalOffset] pairs
 */
export function sweepStrip(samples, profile, opts = {}) {
  const rows = samples.length;
  const cols = profile.length;
  if (rows < 2) return null;
  const positions = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const idx = [];
  const side = new THREE.Vector3();
  const pt = new THREE.Vector3();
  let arc = 0;
  const profileLen = [];
  for (let j = 0; j < cols; j++) {
    profileLen.push(arc);
    if (j < cols - 1) {
      arc += Math.hypot(profile[j + 1][0] - profile[j][0], profile[j + 1][1] - profile[j][1]);
    }
  }
  if (opts.uvScale) for (let j = 0; j < cols; j++) profileLen[j] /= opts.uvScale;
  for (let i = 0; i < rows; i++) {
    const s = samples[i];
    side.crossVectors(s.n, s.t).normalize();
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    for (let j = 0; j < cols; j++) {
      pt.copy(s.p).addScaledVector(side, profile[j][0]).addScaledVector(s.n, profile[j][1]);
      const o = (i * cols + j) * 3;
      positions[o] = pt.x;
      positions[o + 1] = pt.y;
      positions[o + 2] = pt.z;
      const uo = (i * cols + j) * 2;
      uvs[uo] = (i / (rows - 1)) * (opts.uvRepeat ?? 1);
      uvs[uo + 1] = profileLen[j];
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Flip winding so face normals point away from the geometry centroid. */
export function orientOutward(geo) {
  const pos = geo.attributes.position;
  const index = geo.index;
  if (!index) return geo;
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) c.add(V3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  c.divideScalar(Math.max(1, pos.count));
  let score = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const arr = index.array;
  for (let i = 0; i < arr.length; i += 3) {
    a.fromBufferAttribute(pos, arr[i]);
    b.fromBufferAttribute(pos, arr[i + 1]);
    d.fromBufferAttribute(pos, arr[i + 2]);
    ab.subVectors(b, a);
    ac.subVectors(d, a);
    nrm.crossVectors(ab, ac);
    const mid = a.clone().add(b).add(d).divideScalar(3).sub(c);
    score += nrm.dot(mid);
  }
  if (score < 0) {
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
    index.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

/* ------------------------------------------------------------------ */
/* Surface -> shell (thin slab with visible underside)                 */
/* ------------------------------------------------------------------ */

function gridNormals(rows, thickness) {
  const rn = rows.length;
  const cn = rows[0].length;
  const normals = [];
  for (let i = 0; i < rn; i++) {
    normals.push([]);
    for (let j = 0; j < cn; j++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(rn - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(cn - 1, j + 1);
      const du = V3().subVectors(rows[i][j1], rows[i][j0]);
      const dv = V3().subVectors(rows[i1][j], rows[i0][j]);
      const n = V3().crossVectors(dv, du).normalize();
      if (n.y < 0) n.multiplyScalar(-1);
      normals[i].push(n);
    }
  }
  return normals;
}

/** Build a closed shell from a vertex grid (top surface + underside + rim). */
function shellFromGrid(rows, thickness, uvScale = 1) {
  const rn = rows.length;
  const cn = rows[0].length;
  const normals = gridNormals(rows, thickness);
  const topRows = rows;
  const botRows = rows.map((row, i) => row.map((p, j) => p.clone().addScaledVector(normals[i][j], -thickness)));
  const top = gridToGeometry(topRows, uvScale);
  const bot = gridToGeometry(botRows.map((r) => r.slice().reverse()).reverse(), uvScale);
  const parts = [top, bot];
  // rim: stitch the four borders
  const rim = (edgePts, edgeNrm) => {
    const geo = sweepStrip(
      edgePts.map((p, i) => ({
        p,
        n: V3(0, 1, 0),
        t: V3().subVectors(edgePts[Math.min(edgePts.length - 1, i + 1)], edgePts[Math.max(0, i - 1)]).normalize(),
      })),
      [
        [0, 0],
        [0, -1],
      ]
    );
    return geo;
  };
  const topEdge = rows[0];
  const botEdge = rows[rn - 1];
  const leftEdge = rows.map((r) => r[0]);
  const rightEdge = rows.map((r) => r[cn - 1]);
  for (const [edge, flipProfile] of [
    [topEdge, false],
    [botEdge, true],
    [leftEdge, false],
    [rightEdge, true],
  ]) {
    const samples = edge.map((p, i, arr) => {
      const prev = arr[Math.max(0, i - 1)];
      const next = arr[Math.min(arr.length - 1, i + 1)];
      return { p, n: V3(0, 1, 0), t: V3().subVectors(next, prev).normalize() };
    });
    if (samples.length < 2) continue;
    const prof = flipProfile ? [[0, 0], [0, -thickness]] : [[0, -thickness], [0, 0]];
    const g = sweepStrip(samples, prof);
    if (g) parts.push(g);
  }
  return mergeList(parts);
}

/* ------------------------------------------------------------------ */
/* Roof surface definition                                             */
/* ------------------------------------------------------------------ */

/**
 * Create a slope object from a parametric sampler.
 * sample(u, v) : u across the slope (0..1), v from eave (0) to ridge (1)
 */
export class Slope {
  constructor(sample, uSeg = 8, vSeg = 5, uvScale = [1, 1]) {
    this.sample = sample;
    this.uSeg = uSeg;
    this.vSeg = vSeg;
    this.uvScale = uvScale;
  }

  /** world point + surface normal at (u,v) */
  frame(u, v) {
    const p = this.sample(u, v);
    const e = 0.002;
    const du = V3().subVectors(this.sample(Math.min(1, u + e), v), this.sample(Math.max(0, u - e), v));
    const dv = V3().subVectors(this.sample(u, Math.min(1, v + e)), this.sample(u, Math.max(0, v - e)));
    const n = V3().crossVectors(dv, du).normalize();
    if (n.y < 0) n.multiplyScalar(-1);
    const t = dv.lengthSq() < 1e-12 ? V3(0, 0, 1) : dv.normalize();
    return { p, n, t, du: du.normalize() };
  }

  grid() {
    const rows = [];
    for (let i = 0; i <= this.vSeg; i++) {
      const row = [];
      for (let j = 0; j <= this.uSeg; j++) row.push(this.sample(j / this.uSeg, i / this.vSeg));
      rows.push(row);
    }
    return rows;
  }

  geometry(thickness = 0.06, uvScale = 1) {
    const rows = this.grid();
    if (thickness > 0) return shellFromGrid(rows, thickness, uvScale);
    return gridToGeometry(rows, uvScale);
  }
}

export function makeGableSlope(y0, h, uSign, cfg) {
  // sign: -1 front slope faces +Z, +1 back slope
  const { W, D, liftAmt, curveExp, profExp } = cfg;
  // For a plain gable the slope converges to the ridge line (topD = 0); for an
  // irimoya (hip-and-gable) it converges to the rectangular break where the upper
  // gable roof sits, so the two roofs actually meet.
  const topD = cfg.topD ?? 0;
  return new Slope(
    (u, v) => {
      const su = u * 2 - 1;
      const ease = Math.pow(Math.abs(su), 2);
      const lift = liftAmt * ease;
      const ex = su * W;
      const ey = y0 + lift;
      const ez = uSign * D;
      const tx = su * cfg.Rx;
      const ty = y0 + h;
      const tz = uSign * topD;
      const t = Math.pow(v, profExp);
      return V3(ex + (tx - ex) * t, ey + (ty - ey) * t, ez + (tz - ez) * t);
    },
    cfg.uSeg,
    cfg.vSeg
  );
}

export function makeEndSlope(y0, h, xSign, cfg) {
  const { W, D, liftAmt, curveExp, profExp } = cfg;
  const topW = cfg.topW ?? cfg.Rx ?? 0;
  return new Slope(
    (u, v) => {
      const su = u * 2 - 1;
      const ease = Math.pow(Math.abs(su), 2);
      const lift = liftAmt * ease;
      const ex = xSign * W;
      const ey = y0 + lift;
      const ez = su * D;
      const tx = xSign * topW;
      const ty = y0 + h;
      const tz = su * (cfg.endTopD ?? 0);
      const t = Math.pow(v, profExp);
      return V3(ex + (tx - ex) * t, ey + (ty - ey) * t, ez + (tz - ez) * t);
    },
    cfg.uSeg,
    cfg.vSeg
  );
}

/** Pyramid (hougyou) slope: one of 4 triangular faces converging to a single apex. */
export function makePyramidSlope(y0, h, dir, cfg) {
  const { W, D, liftAmt, profExp } = cfg;
  return new Slope(
    (u, v) => {
      const su = u * 2 - 1;
      const ease = Math.pow(Math.abs(su), 2.4);
      const lift = liftAmt * ease;
      let ex;
      let ez;
      if (dir === 'front' || dir === 'back') {
        ex = su * W;
        ez = (dir === 'front' ? 1 : -1) * D;
      } else {
        ez = su * D;
        ex = (dir === 'left' ? -1 : 1) * W;
      }
      const t = Math.pow(v, profExp);
      return V3(ex * (1 - t), y0 + lift * (1 - t) + h * t, ez * (1 - t));
    },
    cfg.uSeg,
    cfg.vSeg
  );
}

/** Shed roof: single slope from an attached edge down to the eave. */
export function makeShedSlope(yTop, drop, dir, cfg) {
  const { W, D, liftAmt, profExp } = cfg;
  return new Slope(
    (u, v) => {
      const su = u * 2 - 1;
      const ease = Math.pow(Math.abs(su), 2);
      const along = dir === '+z' || dir === '-z' ? su * W : su * D;
      const sgn = dir === '+z' || dir === '+x' ? 1 : -1;
      const t = 1 - Math.pow(v, profExp);
      const out = sgn * (D * (1 - t) + (cfg.attach ?? 0) * t);
      const y = yTop - drop * t + liftAmt * ease * t;
      if (dir === '+z' || dir === '-z') return V3(along, y, out);
      return V3(out, y, along);
    },
    cfg.uSeg,
    cfg.vSeg
  );
}

/* ------------------------------------------------------------------ */
/* Tile decoration                                                     */
/* ------------------------------------------------------------------ */

function ribProfile(radius, height, segments = 4) {
  const prof = [];
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI * (i / segments);
    prof.push([Math.cos(a) * radius, Math.sin(a) * height]);
  }
  return prof;
}

function sharpRibProfile(width, height) {
  return [
    [-width, 0],
    [-width * 0.5, height * 0.6],
    [0, height],
    [width * 0.5, height * 0.6],
    [width, 0],
  ];
}

function flatRibProfile(width, height) {
  return [
    [-width, 0],
    [-width, height * 0.5],
    [0, height],
    [width, height * 0.5],
    [width, 0],
  ];
}

export const TILE_PRESETS = {
  kawara: { ribR: 0.075, ribH: 0.048, spacing: 0.30, eaveCaps: true, ridge: 0.17, style: 'round' },
  'ridge-round': { ribR: 0.1, ribH: 0.075, spacing: 0.42, eaveCaps: true, ridge: 0.22, style: 'round' },
  'flat-clay': { ribR: 0.02, ribH: 0.012, spacing: 0.34, eaveCaps: false, ridge: 0.14, style: 'flat' },
  slate: { ribR: 0.012, ribH: 0.008, spacing: 0.5, eaveCaps: false, ridge: 0.1, style: 'flat', rows: true },
  'metal-rib': { ribR: 0.03, ribH: 0.05, spacing: 0.5, eaveCaps: false, ridge: 0.09, style: 'sharp' },
  shingle: { ribR: 0.0, ribH: 0.0, spacing: 0.42, eaveCaps: false, ridge: 0.16, style: 'rows' },
  thatch: { ribR: 0.0, ribH: 0.0, spacing: 0.0, eaveCaps: false, ridge: 0.42, style: 'thatch' },
};

/** Lay tile ribs / courses over a slope. */
function decorateSlope(b, slope, cfg) {
  const preset = TILE_PRESETS[cfg.tile] || TILE_PRESETS.kawara;
  const detail = cfg.detail ?? 2;
  const mat = cfg.tileMaterial;
  const ridgeMat = cfg.ridgeMaterial || mat;
  if (!mat) return;
  const uLength = slope.sample(0, 0).distanceTo(slope.sample(1, 0));
  const vSteps = cfg.curve > 0.04 ? 4 : 2;
  const vStart = 0.02;
  const vEnd = 0.97;

  if (preset.style === 'rowse' || preset.style === 'rows') return;

  if (preset.style === 'thatch') {
    // layered bands near the eave plus a fat ridge handled by the caller
    const bands = Math.max(2, Math.round(3 * (detail / 2)));
    for (let i = 0; i < bands; i++) {
      const v = 0.05 + (i / bands) * 0.35;
      const samples = [];
      const steps = 10;
      for (let s = 0; s <= steps; s++) {
        samples.push(slope.frame(s / steps, v));
      }
      const g = sweepStrip(samples, [
        [0, 0.0],
        [0.16, 0.03],
        [0.16, -0.06],
        [0, -0.06],
      ]);
      if (g) b.add(mat, orientOutward(g), 'thatch_band');
    }
    return;
  }

  if (preset.spacing > 0) {
    const spacing = preset.spacing * (detail >= 3 ? 0.8 : detail <= 1 ? 1.6 : 1);
    const count = Math.max(2, Math.round(uLength / spacing));
    const prof =
      preset.style === 'round'
        ? ribProfile(preset.ribR, preset.ribH, detail >= 2 ? 5 : 3)
        : preset.style === 'sharp'
          ? sharpRibProfile(preset.ribR, preset.ribH)
          : flatRibProfile(preset.ribR, preset.ribH);
    const ribs = [];
    for (let i = 0; i <= count; i++) {
      const u = 0.015 + (i / count) * 0.97;
      const samples = [];
      for (let s = 0; s <= vSteps; s++) {
        const v = vStart + ((vEnd - vStart) * s) / vSteps;
        samples.push(slope.frame(u, v));
      }
      const g = sweepStrip(samples, prof);
      if (g) ribs.push(orientOutward(g));
    }
    const merged = mergeList(ribs);
    if (merged) b.add(mat, merged, 'tile_ribs');

    if (preset.eaveCaps && detail >= 1) {
      const caps = [];
      const capProfile = ribProfile(preset.ribR * 1.25, preset.ribH * 1.35, 5);
      for (let i = 0; i <= count; i++) {
        const u = 0.015 + (i / count) * 0.97;
        const a = slope.frame(u, 0.0);
        const bb = slope.frame(u, 0.085);
        const g = sweepStrip([a, bb], capProfile);
        if (g) caps.push(orientOutward(g));
      }
      const m = mergeList(caps);
      if (m) b.add(ridgeMat, m, 'tile_eave_caps');
    }
  }

  if (preset.rows && detail >= 2) {
    // slate courses: thin overlap lips running across the slope
    const rows = [];
    const vCount = Math.max(2, Math.round(slope.sample(0, 0).distanceTo(slope.sample(0, 1)) / 0.55));
    for (let i = 1; i <= vCount; i++) {
      const v = i / (vCount + 1);
      const samples = [];
      const steps = Math.max(6, Math.round(uLength / 0.5));
      for (let s = 0; s <= steps; s++) samples.push(slope.frame(s / steps, v));
      const g = sweepStrip(samples, [
        [0, 0.012],
        [0.05, -0.03],
        [0.05, -0.06],
      ]);
      if (g) rows.push(orientOutward(g));
    }
    const m = mergeList(rows);
    if (m) b.add(ridgeMat, m, 'slate_courses');
  }
}

/** Rafters + eave fascia under one slope. */
function decorateEave(b, slope, cfg, matWood, matFascia) {
  const detail = cfg.detail ?? 2;
  if (detail <= 0) return;
  const samples = [];
  const steps = Math.max(6, Math.round(slope.sample(0, 0).distanceTo(slope.sample(1, 0)) / 0.9));
  for (let s = 0; s <= steps; s++) samples.push(slope.frame(s / steps, 0));
  const uLength = slope.sample(0, 0).distanceTo(slope.sample(1, 0));
  // fascia board that follows the flying eave
  if (matFascia) {
    const g = sweepStrip(samples, [
      [0, 0.02],
      [0.13, 0.02],
      [0.13, -0.16],
      [0, -0.19],
    ]);
    if (g) b.add(matFascia, orientOutward(g), 'eave_fascia');
  }
  // rafter tails
  if (cfg.rafters !== false && matWood && detail >= 1) {
    const spacing = detail >= 3 ? 0.42 : detail === 2 ? 0.6 : 0.95;
    const n = Math.max(2, Math.round(uLength / spacing));
    const geos = [];
    for (let i = 0; i <= n; i++) {
      const u = (i + 0.5) / (n + 1);
      const a = slope.frame(u, 0.012);
      const bb = slope.frame(u, 0.2);
      const dir = V3().subVectors(bb.p, a.p);
      const len = dir.length();
      if (len < 0.05) continue;
      const g = new THREE.BoxGeometry(0.09, 0.11, len);
      const mid = V3().addVectors(a.p, bb.p).multiplyScalar(0.5).addScaledVector(a.n, -0.22);
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir.clone().normalize());
      g.applyQuaternion(q);
      g.translate(mid.x, mid.y, mid.z);
      geos.push(g);
    }
    const m = mergeList(geos);
    if (m) b.add(matWood, m, 'rafters');
  }
}

/* ------------------------------------------------------------------ */
/* Ridge pieces                                                        */
/* ------------------------------------------------------------------ */

function ridgeSweep(b, samples, radius, height, mat, name) {
  const prof = ribProfile(radius, height, 6);
  const g = sweepStrip(samples, prof);
  if (g) b.add(mat, orientOutward(g), name);
}

function onigawara(b, p, dir, scale, mat, matGold) {
  // stylised end ornament (ogre tile)
  const g = new THREE.BoxGeometry(0.34 * scale, 0.5 * scale, 0.22 * scale);
  g.translate(p.x, p.y + 0.25 * scale, p.z);
  b.add(mat, g, 'onigawara');
  const t = new THREE.CylinderGeometry(0.05 * scale, 0.09 * scale, 0.34 * scale, 6);
  t.translate(p.x, p.y + 0.66 * scale, p.z);
  b.add(matGold || mat, t, 'onigawara_tip');
  const wing = new THREE.BoxGeometry(0.62 * scale, 0.1 * scale, 0.1 * scale);
  wing.translate(p.x, p.y + 0.36 * scale, p.z + dir * 0.02);
  b.add(mat, wing, 'onigawara_wing');
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Build a roof.
 * cfg: {
 *   type: 'gable'|'hip'|'irimoya'|'pyramid'|'shed'|'flat'|'tiered'|'skirt',
 *   x, z, y            centre offset + eave-line height
 *   w, d               eave rectangle size (already includes overhang)
 *   h                  rise from eave line to ridge
 *   ridgeRatio         (hip/irimoya) ridge length / width, default auto
 *   curve              0..1 flying eaves
 *   tile, tileMaterial, ridgeMaterial, woodMaterial, fasciaMaterial, gableMaterial
 *   detail, rafters, hipRidges, onigawara, thickness, gableStyle
 *   side, attach       (skirt / shed)
 *   rotateY            whole-roof rotation in radians
 * }
 */
export function buildRoof(b, cfg) {
  const {
    type = 'gable',
    x = 0,
    z = 0,
    y = 0,
    w = 6,
    d = 5,
    h = 2,
    curve = 0.5,
    detail = 2,
    thickness = 0.07,
  } = cfg;
  const W = w / 2;
  const D = d / 2;
  const info = { ridgeY: y + h, apex: V3(x, y + h, z), eaveY: y, type };
  if (type === 'flat' || h <= 0.001) {
    // flat roof slab / parapet handled by caller; still give a slab
    const g = new THREE.BoxGeometry(w, thickness * 2, d);
    g.translate(x, y + thickness, z);
    if (cfg.tileMaterial) b.add(cfg.tileMaterial, g, 'flat_slab');
    return info;
  }

  const uSeg = Math.max(4, Math.round(w / (detail >= 2 ? 0.9 : 1.6)));
  const vSeg = Math.max(3, Math.round(h / (detail >= 2 ? 0.55 : 0.9)));
  const liftAmt = curve * Math.min(W, D) * 0.42;
  const profExp = 1 + 0.85 * curve;
  const common = { W, D, liftAmt, curveExp: 2, profExp, uSeg, vSeg };
  const pieces = { slopes: [], ridges: [] };

  const off = (p) => p.set(p.x + x, p.y + y, p.z + z);
  const wrap = (slope) => {
    const s2 = new Slope((u, v) => off(slope.sample(u, v)), slope.uSeg, slope.vSeg);
    return s2;
  };

  if (type === 'gable' || type === 'irimoya') {
    const Rx = type === 'gable' ? W : Math.max(W * 0.12, W - D * (cfg.pitchBalance ?? 1));
    const c2 = { ...common, Rx };
    let irimoyaParts = null;
    const front = wrap(makeGableSlope(0, h, -1, c2));
    const back = wrap(makeGableSlope(0, h, 1, c2));
    if (type === 'irimoya') {
      const breakV = cfg.gableBreak ?? 0.52;
      const breakY = h * breakV;
      const topD = Math.max(0.6, D * (1 - breakV));
      const breakW = Math.max(0.05, Rx);
      const lowCfg = { ...c2, topD, topW: breakW, endTopD: topD };
      const lf = wrap(makeGableSlope(0, breakY, -1, lowCfg));
      const lb = wrap(makeGableSlope(0, breakY, 1, lowCfg));
      const lEndL = wrap(makeEndSlope(0, breakY, -1, lowCfg));
      const lEndR = wrap(makeEndSlope(0, breakY, 1, lowCfg));
      // upper gable roof: eave rectangle = the lower skirt's break rectangle
      const ub = { ...common, W: breakW, D: topD, Rx: breakW, topD: 0 };
      const upRise = h - breakY;
      const uFront = wrap(makeGableSlope(breakY, upRise, -1, ub));
      const uBack = wrap(makeGableSlope(breakY, upRise, 1, ub));
      // decorative gable end panels (the plaster triangles with bargeboards)
      for (const sgn of [-1, 1]) {
        const gx = x + sgn * breakW;
        const tri = new THREE.BufferGeometry();
        tri.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([gx, y + breakY, z - topD, gx, y + breakY, z + topD, gx, y + h, z], 3)
        );
        tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        tri.computeVertexNormals();
        if (cfg.gableMaterial) b.add(cfg.gableMaterial, tri, 'gable_panel');
        if (cfg.woodMaterial) {
          for (const zz of [-1, 1]) {
            const a = V3(gx, y + breakY, z + zz * topD);
            const e = V3(gx, y + h, z);
            const dir = V3().subVectors(e, a);
            const len = dir.length();
            if (len < 0.1) continue;
            const g = new THREE.BoxGeometry(0.15, 0.15, len);
            g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir.clone().normalize()));
            const mid = V3().addVectors(a, e).multiplyScalar(0.5);
            g.translate(mid.x, mid.y, mid.z);
            b.add(cfg.woodMaterial, g, 'bargeboard');
          }
        }
        // small hip ridges running out to the lower eave corners
        pieces.ridges.push({ kind: 'hip', a: V3(x + sgn * W, y, z + D), b: V3(x + sgn * breakW, y + breakY, z) });
        pieces.ridges.push({ kind: 'hip', a: V3(x + sgn * W, y, z - D), b: V3(x + sgn * breakW, y + breakY, z) });
      }
      irimoyaParts = { lf, lb, lEndL, lEndR };
      pieces.slopes.push(lf, lb, lEndL, lEndR, uFront, uBack);
      info.ridgeY = y + h;
      info.apex = V3(x, y + h, z);
    } else {
      // gable end walls (rectangle-ish infill so the roof is not open)
      for (const sgn of [-1, 1]) {
        const tri = new THREE.BufferGeometry();
        const pts = [
          x + sgn * W, y, z - D,
          x + sgn * W, y, z + D,
          x + sgn * W, y + h, z + 0,
        ];
        tri.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        tri.computeVertexNormals();
        if (cfg.gableMaterial) b.add(cfg.gableMaterial, tri, 'gable_wall');
        if (cfg.woodMaterial) {
          for (const zz of [-1, 1]) {
            const a = V3(x + sgn * W, y, z + zz * D);
            const e = V3(x + sgn * W, y + h, z);
            const dir = V3().subVectors(e, a);
            const len = dir.length();
            const g = new THREE.BoxGeometry(0.16, 0.18, len);
            g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir.clone().normalize()));
            const mid = V3().addVectors(a, e).multiplyScalar(0.5);
            g.translate(mid.x, mid.y, mid.z);
            b.add(cfg.woodMaterial, g, 'bargeboard');
          }
        }
      }
      pieces.slopes.push(front, back);
      info.ridgeY = y + h;
    }
    if (type === 'irimoya') {
      info.ridgeLine = [V3(x - Rx, y + h, z), V3(x + Rx, y + h, z)];
    } else {
      info.ridgeLine = [V3(x - W, y + h, z), V3(x + W, y + h, z)];
    }
    // end walls for hip-like lower section already covered by irimoya panels
    if (type === 'irimoya' && irimoyaParts) {
      pieces.ridges.push({ kind: 'main', a: V3(x - Rx, y + h, z), b: V3(x + Rx, y + h, z) });
      for (const s of [irimoyaParts.lf, irimoyaParts.lb, irimoyaParts.lEndL, irimoyaParts.lEndR]) {
        pieces.ridges.push({ kind: 'eave', slope: s });
      }
    }
  } else if (type === 'hip') {
    const Rx = Math.max(0, Math.min(W - 0.05, W - D * (cfg.pitchBalance ?? 1)));
    const c2 = { ...common, Rx };
    const front = wrap(makeGableSlope(0, h, -1, c2));
    const back = wrap(makeGableSlope(0, h, 1, c2));
    const left = wrap(makeEndSlope(0, h, -1, c2));
    const right = wrap(makeEndSlope(0, h, 1, c2));
    pieces.slopes.push(front, back, left, right);
    pieces.ridges.push({ kind: 'main', a: V3(x - Rx, y + h, z), b: V3(x + Rx, y + h, z) });
    for (const sgn of [-1, 1]) {
      pieces.ridges.push({ kind: 'hip', a: V3(x + sgn * W, y, z + D), b: V3(x + sgn * Rx, y + h, z) });
      pieces.ridges.push({ kind: 'hip', a: V3(x + sgn * W, y, z - D), b: V3(x + sgn * Rx, y + h, z) });
    }
    pieces.ridges.push({ kind: 'eave', slope: front });
    pieces.ridges.push({ kind: 'eave', slope: back });
    pieces.ridges.push({ kind: 'eave', slope: left });
    pieces.ridges.push({ kind: 'eave', slope: right });
    info.ridgeLine = [V3(x - Rx, y + h, z), V3(x + Rx, y + h, z)];
  } else if (type === 'pyramid') {
    const dirs = ['front', 'back', 'left', 'right'];
    for (const dir of dirs) {
      const s = wrap(makePyramidSlope(0, h, dir, common));
      pieces.slopes.push(s);
      pieces.ridges.push({ kind: 'eave', slope: s });
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pieces.ridges.push({ kind: 'hip', a: V3(x + sx * W, y, z + sz * D), b: V3(x, y + h, z) });
      }
    }
    info.apex = V3(x, y + h, z);
  } else if (type === 'shed') {
    // single-pitch roof covering the whole footprint: low eave on one side,
    // high edge on the other
    const dir = cfg.side || '+z';
    const drop = cfg.drop ?? Math.min(2.4, Math.min(W, D) * 0.42);
    const sgn = dir === '+z' || dir === '+x' ? 1 : -1;
    const alongIsZ = dir === '+x' || dir === '-x';
    const OUT = (alongIsZ ? W : D) * 1.0;
    const ALONG = (alongIsZ ? D : W) * 1.0;
    const s = wrap(
      new Slope(
        (u, v) => {
          const su = u * 2 - 1;
          const lift = liftAmt * Math.pow(Math.abs(su), 2) * 0.3 * (1 - v);
          const out = sgn * OUT * (1 - 2 * v);
          const y = drop * v + lift;
          return alongIsZ ? V3(out, y, su * ALONG) : V3(su * ALONG, y, out);
        },
        uSeg,
        vSeg
      )
    );
    pieces.slopes.push(s);
    pieces.ridges.push({ kind: 'eave', slope: s });
    info.ridgeY = y + drop;
    info.apex = V3(x, y + drop, z);
    // the high edge gets a fascia too
    pieces.ridges.push({ kind: 'eave', slope: s });
  } else if (type === 'skirt') {
    const dir = cfg.side || '+z';
    const s = wrap(makeShedSlope(cfg.yTop ?? h, cfg.drop ?? h, dir, { ...common, attach: cfg.attach ?? 0 }));
    pieces.slopes.push(s);
    pieces.ridges.push({ kind: 'eave', slope: s });
  } else if (type === 'tiered') {
    // stacked pyramid tiers (pagoda) — caller loops; here build a single tier
    const dirs = ['front', 'back', 'left', 'right'];
    for (const dir of dirs) {
      const s = wrap(makePyramidSlope(0, h, dir, common));
      pieces.slopes.push(s);
      pieces.ridges.push({ kind: 'eave', slope: s });
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pieces.ridges.push({ kind: 'hip', a: V3(x + sx * W, y, z + sz * D), b: V3(x, y + h, z) });
      }
    }
    info.apex = V3(x, y + h, z);
  }

  // --- build slope surfaces ---
  for (const s of pieces.slopes) {
    const uLen = s.sample(0, 0).distanceTo(s.sample(1, 0));
    const vLen = s.sample(0, 0).distanceTo(s.sample(0, 1));
    s.uvScale = [uLen / 1.6, vLen / 1.6];
    const geo = s.geometry(thickness, 1);
    if (geo && cfg.tileMaterial) b.add(cfg.tileMaterial, geo, 'roof_surface');
    decorateSlope(b, s, { ...cfg, curve });
    decorateEave(b, s, cfg, cfg.woodMaterial, cfg.fasciaMaterial);
  }

  // --- ridges ---
  const ridgeRadius = (TILE_PRESETS[cfg.tile] || TILE_PRESETS.kawara).ridge;
  const rMat = cfg.ridgeMaterial || cfg.tileMaterial;
  for (const r of pieces.ridges) {
    if (r.kind === 'hip') {
      if (cfg.hipRidges === false) continue;
      const steps = Math.max(3, Math.round(r.a.distanceTo(r.b) / 0.7));
      const samples = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = V3().lerpVectors(r.a, r.b, t);
        // lift hip ridges slightly at the eave end for a flying look
        p.y += curve * 0.12 * Math.pow(1 - t, 2);
        const t2 = V3().subVectors(r.b, r.a).normalize();
        samples.push({ p, t: t2, n: V3(0, 1, 0).lerp(V3(0.4 * Math.sign(p.x - x || 1), 0.6, 0), 0.35).normalize() });
      }
      ridgeSweep(b, samples, ridgeRadius * 0.75, ridgeRadius * 0.7, rMat, 'hip_ridge');
      // corner ornaments at the eave ends of the hips
      if (cfg.onigawara !== false && detail >= 1) {
        onigawara(b, samples[0].p, 0, 0.8, cfg.ornamentMaterial || rMat, cfg.goldMaterial);
      }
    } else if (r.kind === 'main') {
      const steps = Math.max(3, Math.round(r.a.distanceTo(r.b) / 0.6));
      const samples = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        samples.push({ p: V3().lerpVectors(r.a, r.b, t), t: V3().subVectors(r.b, r.a).normalize(), n: V3(0, 1, 0) });
      }
      ridgeSweep(b, samples, ridgeRadius, ridgeRadius * 1.5, rMat, 'main_ridge');
      if (detail >= 1) {
        // stacked ridge caps for a heavier silhouette
        ridgeSweep(b, samples, ridgeRadius * 0.55, ridgeRadius * 2.1, rMat, 'main_ridge_top');
      }
      if (cfg.onigawara !== false && detail >= 1) {
        onigawara(b, r.a, 0, 1.0, cfg.ornamentMaterial || rMat, cfg.goldMaterial);
        onigawara(b, r.b, 0, 1.0, cfg.ornamentMaterial || rMat, cfg.goldMaterial);
      }
      if (cfg.shachihoko && detail >= 1) {
        // golden fish-fin ornaments (temples / castles)
        for (const p of [r.a, r.b]) {
          const gm = cfg.goldMaterial || rMat;
          const body = new THREE.SphereGeometry(0.22, 8, 6);
          body.scale(0.5, 1.5, 1);
          body.translate(p.x, p.y + 0.75, p.z);
          b.add(gm, body, 'shachihoko');
          const tail = new THREE.ConeGeometry(0.12, 0.5, 6);
          tail.rotateZ(Math.PI * 0.12);
          tail.translate(p.x, p.y + 1.35, p.z);
          b.add(gm, tail, 'shachihoko_tail');
        }
      }
    } else if (r.kind === 'eave') {
      // nothing extra: eave fascia handles this
    }
  }

  return info;
}

/** Total roof height above the eave for a given footprint — used by the generator. */
export function roofRise(type, w, d, storey) {
  const base = Math.min(w, d) * 0.3 + storey * 0.12;
  switch (type) {
    case 'pyramid':
    case 'tiered':
      return base * 1.25;
    case 'irimyoa':
    case 'irimoya':
      return base * 1.1;
    case 'flat':
      return 0.35;
    case 'skirt':
      return storey * 0.42;
    case 'shed':
      return Math.min(2.4, Math.min(w, d) * 0.2);
    default:
      return base;
  }
}

export { shellFromGrid, ribProfile };
