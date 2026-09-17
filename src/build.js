// ============================================================================
// build.js — assembles a complete roof (deck, tiles, ridges, structure)
// for one of the four forms: kirizuma | yosemune | irimoya | hogyo
// ============================================================================
import * as THREE from 'three';
import { makeProfile, makeField, GeoBuf, clamp, lerp, DEG } from './core.js';
import { tileField, tileGable } from './tiles.js';
import * as parts from './parts.js';

export function buildRoof(P) {
  // ----- derived dimensions ------------------------------------------------
  const dim = {
    L: P.length, D: P.depth,
    ov: P.eaveOverhang, rakeOv: P.rakeOverhang,
    cornerLift: P.cornerLift, cornerPow: P.cornerPow,
    wallH: P.wallHeight,
  };
  const Dext = dim.D + 2 * dim.ov;
  const Lext = dim.L + 2 * dim.rakeOv;
  const halfD = Dext / 2, halfL = Lext / 2;

  const prof = makeProfile({
    run: halfD,
    halfDepth: dim.D / 2,
    pitchTopDeg: P.pitchTop,
    pitchEaveDeg: P.pitchEave,
    flipDeg: P.eaveFlip,
  });

  const plateH = 0.12, raftH = 0.068, slabT = 0.04;
  const plateTop = dim.wallH + plateH;
  const base = plateTop + raftH + slabT;    // deck top at wall face (bearing)

  const field = makeField(P.roofType, dim, prof, {
    hipRiseFrac: P.hipRise, breakT: P.gableBreak,
  });

  // absolute surface functions
  const zAbs = (x, y) => base + field.Z(x, y);
  const zHipAbs = field.hipZ ? (x, y) => base + field.hipZ(x, y) : zAbs;
  const zGableAbs = field.gableZ ? (x, y) => base + field.gableZ(x, y) : zAbs;
  const deckBottom = (x, y) => zAbs(x, y) - slabT;

  // ----- colors ------------------------------------------------------------
  const C = {
    tile: hex(P.tileColor), tilePan: hex(P.tileColor, 0.92),
    tileDark: hex(P.tileColor, 0.55),
    ridge: hex(P.tileColor, 0.85), ridgeCol: hex(P.tileColor, 0.85),
    wood: hex(P.woodColor), woodLight: hex(P.woodColor, 1.35),
    woodPlate: hex(P.woodColor, 1.15),
    wall: hex(P.wallColor), plaster: hex(P.plasterColor),
    fascia: hex(P.fasciaColor), deck: hex(P.woodColor, 0.45),
  };

  const buf = new GeoBuf();
  const extra = new THREE.Group();          // textured things (onigawara)
  const counters = { covers: 0, tris: 0 };

  // =========================================================================
  // 1. DECK (boards / shitaji-ita) — smooth-shaded slab that bears on plates
  // =========================================================================
  const deckGeo = buildDeck(field, dim, base, slabT);
  const deckMesh = new THREE.Mesh(deckGeo, deckMaterial(C.deck));
  deckMesh.castShadow = deckMesh.receiveShadow = true;
  deckMesh.userData.isDeck = true;

  // =========================================================================
  // 2. TILES
  // =========================================================================
  const rng = mulberry(P.seed);
  const tileOpts = {
    module: P.tileModule, coverW: P.coverWidth, courseH: P.courseHeight,
    jitter: P.tileJitter, colors: C, rng,
  };
  if (P.roofType === 'kirizuma') {
    tileGable(buf, field, {
      ...tileOpts, zG: zAbs, yStart: 0.10, yEnd: halfD, eaveRow: true,
    });
  } else if (P.roofType === 'irimoya') {
    // hip field tiled everywhere EXCEPT where the upper gable covers it
    tileField(buf, field, {
      ...tileOpts, dStart: 0.10, dMax: halfD, eaveRow: true,
      zFn: zHipAbs, clip: (x, y) => field.onHip(x, y),
    });
    // upper gable planes, clipped to the gable side of the junction
    tileGable(buf, field, {
      ...tileOpts, zG: zGableAbs, yStart: 0.10,
      yEnd: P.gableBreak * halfD + 0.25, eaveRow: false,
      clip: (x, y) => !field.onHip(x, y) && Math.abs(x) <= halfL - 0.02,
    });
  } else {
    tileField(buf, field, { ...tileOpts, dStart: 0.10, dMax: halfD, eaveRow: true, zFn: zAbs });
  }

  // =========================================================================
  // 3. RIDGES — main ridge (ōmune), hip ridges, descending ridges
  // =========================================================================
  const ridgeInset = 0.07;
  let ridgeEnds = [];
  if (P.roofType === 'hogyo') {
    // apex finial: small stacked caps
    const az = zAbs(0, 0);
    buf.tube([0, 0, az - 0.05], [0, 0, az + 0.16], 0.09, 0.07,
      { col: C.ridge, sides: 8, up: [0, 0, 1], rings: 2, caps: true, capCol: C.tileDark });
    buf.tube([0, 0, az + 0.16], [0, 0, az + 0.3], 0.028, 0.02,
      { col: C.ridge, sides: 6, up: [0, 0, 1], rings: 1, caps: true, capCol: C.tileDark });
  } else {
    const cx = (P.roofType === 'kirizuma' || P.roofType === 'irimoya') ? halfL - ridgeInset
      : field.cxr - 0.05;
    const rz = (P.roofType === 'irimoya') ? base + field.gableZ(0, 0) : zAbs(0, 0);
    const rPts = [];
    for (let i = 0; i <= 16; i++) {
      const x = -cx + (2 * cx * i) / 16;
      rPts.push({ x, y: 0, z: (P.roofType === 'irimoya') ? base + field.gableZ(x, 0) : zAbs(x, 0) });
    }
    parts.ridgeCap(buf, rPts, { colors: C, rCap: P.ridgeCapSize, fillet: P.plasterFillet });
    ridgeEnds = [{ x: -cx, y: 0, z: rPts[0].z }, { x: cx, y: 0, z: rPts[rPts.length - 1].z }];
  }

  // hip fold lines (caps) — from crest end to eave corner
  if (P.roofType !== 'kirizuma') {
    const folds = [];
    for (const sx of [1, -1]) for (const sy of [1, -1])
      folds.push({ sx, sy });
    for (const f of folds) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const x = f.sx * lerp(field.cxr, halfL, u);
        const y = f.sy * lerp(0, halfD, u);
        let z = zHipAbs(x, y);
        pts.push({ x, y, z });
      }
      // irimoya: hide the fold's buried upper end — start at junction
      let ptsVis = pts;
      if (P.roofType === 'irimoya') {
        let lo = 0, hi = 1;
        for (let k = 0; k < 30; k++) {
          const m = (lo + hi) / 2;
          const x = f.sx * lerp(field.cxr, halfL, m);
          const y = f.sy * lerp(0, halfD, m);
          if (base + field.gableZ(x, y) > zHipAbs(x, y)) lo = m; else hi = m;
        }
        ptsVis = pts.slice(Math.floor(lo * 12) - 1);
        if (ptsVis.length < 3) ptsVis = pts;
      }
      parts.hipCap(buf, ptsVis, {
        colors: C, rCap: P.ridgeCapSize * 0.8, fillet: P.plasterFillet && P.roofType !== 'irimoya',
        endOrnament: true,
      });
    }
  }

  // irimoya descending ridge (kudari-mune) along the junction curve
  let junctionPts = null;
  if (P.roofType === 'irimoya') {
    junctionPts = field.junction();
    for (const s of [1, -1]) {
      const pts = junctionPts.map(p => ({
        x: p.x, y: s * p.y, z: base + field.gableZ(p.x, p.y) + 0.03,
      }));
      if (pts.length > 2) parts.hipCap(buf, pts, {
        colors: C, rCap: P.ridgeCapSize * 0.72, fillet: false, endOrnament: false,
      });
    }
  }

  // =========================================================================
  // 4. RIDGE-END ORNAMENTS — onigawara, chigi, katsuogi
  // =========================================================================
  if (P.roofType === 'hogyo') {
    if (P.onigawara) {
      for (const sx of [1, -1]) for (const sy of [1, -1]) {
        const g = parts.onigawara(THREE, buf, null, { x: sx * 0.55, y: sy * 0.55, z: zAbs(sx * 0.55, sy * 0.55) + 0.05 },
          0, { colors: C, w: 0.3, h: 0.42 });
        g.rotation.y = Math.atan2(sy, sx) - Math.PI / 2;
        extra.add(g);
      }
    }
  } else {
    for (const e of ridgeEnds) {
      const dirX = Math.sign(e.x) || 1;
      if (P.shrineChigi) {
        parts.chigi(buf, e.x - dirX * 0.1, 0, e.z + 0.06, { colors: C, h: P.chigiHeight });
      } else if (P.onigawara) {
        const g = parts.onigawara(THREE, buf, null, { x: e.x, y: 0, z: e.z - 0.1 }, dirX,
          { colors: C, w: 0.38 * P.onigawaraScale, h: 0.6 * P.onigawaraScale });
        extra.add(g);
      }
    }
    if (P.shrineChigi && P.katsuogiCount > 0) {
      // katsuogi sit in symmetric pairs across the ridge centre
      const zc = (P.roofType === 'irimoya') ? (x) => base + field.gableZ(x, 0) : (x) => zAbs(x, 0);
      const n = P.katsuogiCount;
      const xs = [];
      if (n % 2 === 1) xs.push(0);
      const pairs = Math.floor(n / 2);
      for (let i = 0; i < pairs; i++) { const o = 0.4 + i * 0.5; xs.push(o, -o); }
      const xmax = ridgeEnds.length ? Math.abs(ridgeEnds[1].x) - 0.35 : 2;
      for (const x of xs) {
        if (Math.abs(x) > xmax) continue;
        parts.katsuogi(buf, x, zc(x) + 0.02, { colors: C });
      }
    }
  }

  // =========================================================================
  // 5. STRUCTURE — walls, keta plates, rafters, fascia, barge, gable walls
  // =========================================================================
  parts.wallsAndPlate(buf, dim, C, plateTop, plateH);

  if (P.showRafters) {
    parts.rafters(buf, field, dim, { colors: C, spacing: P.rafterSpacing, slabT, zAt: zAbs, zAtEnd: zHipAbs });
  }

  // fascia around the eaves
  const eaveCol = C.fascia;
  for (const s of [1, -1]) {
    const front = [], back = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const x = -halfL + (i / n) * 2 * halfL;
      front.push({ x, y: -halfD, z: zAbs(x, -halfD) - 0.06 });
      back.push({ x, y: halfD, z: zAbs(x, halfD) - 0.06 });
    }
    parts.fascia(buf, front, C, eaveCol);
    parts.fascia(buf, back, C, eaveCol);
    if (P.roofType !== 'kirizuma') {
      const left = [], right = [];
      const m = 16;
      for (let i = 0; i <= m; i++) {
        const y = -halfD + (i / m) * 2 * halfD;
        left.push({ x: -halfL, y, z: zHipAbs(-halfL, y) - 0.06 });
        right.push({ x: halfL, y, z: zHipAbs(halfL, y) - 0.06 });
      }
      parts.fascia(buf, left, C, eaveCol);
      parts.fascia(buf, right, C, eaveCol);
    }
  }

  // gable walls + barge boards
  if (P.roofType === 'kirizuma') {
    for (const s of [1, -1]) {
      const x = s * (dim.L / 2 - 0.01);
      const ys = [];
      for (let i = 0; i <= 24; i++) ys.push(-dim.D / 2 + (i / 24) * dim.D);
      parts.gableWallStrip(buf, x, ys,
        (y) => deckBottom(x, y) - 0.005, dim.wallH, C.plasterWall ?? C.wall);
      // barge boards along both rakes
      for (const sy of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const y = sy * lerp(0, halfD, i / 10);
          pts.push({ x: s * halfL, y, z: zAbs(x, y) - 0.075 });
        }
        parts.bargeBoard(buf, pts, C, { col: C.wood, width: 0.15 });
      }
      // exposed gable frame: tie beam + king post + struts
      if (P.gableFrame) {
        const zr = zAbs(x, 0) - slabT;
        const zb = dim.wallH + 1.15;
        parts.plank ? null : null;
        buf.box([x, 0, zb], [0, 1, 0], [1, 0, 0], [0, 0, 1], dim.D / 2 - 0.1, 0.05, 0.07, C.wood);
        buf.box([x, 0, (zb + zr) / 2], [0, 0, 1], [1, 0, 0], [0, 1, 0], (zr - zb) / 2, 0.055, 0.055, C.wood);
        for (const sy of [1, -1])
          buf.plank([{ x, y: sy * (dim.D / 2 - 0.15), z: zb + 0.02 }, { x, y: sy * 0.1, z: zr - 0.35 }],
            [0, 0, 1], 0.05, 0.06, C.wood);
      }
    }
  }
  if (P.roofType === 'irimoya') {
    for (const sx of [1, -1]) {
      const x = sx * (dim.L / 2 - 0.01);
      // find where the gable wall meets the hip surface at the end plane
      let lo = 0, hi = halfD;
      for (let k = 0; k < 40; k++) {
        const m = (lo + hi) / 2;
        if (field.gableZ(x, m) > field.hipZ(x, m)) lo = m; else hi = m;
      }
      const yMeet = (lo + hi) / 2 + 0.04;
      for (const sy of [1, -1]) {
        const ys = [];
        for (let i = 0; i <= 24; i++) ys.push(sy * (0.001 + (yMeet * i) / 24));
        parts.gableWallStrip(buf, x, ys,
          (y) => base + field.gableZ(x, y) - slabT - 0.005, dim.wallH, C.plasterWall ?? C.wall);
        // barge board down the exposed part of the rake
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const y = sy * lerp(0, yMeet, i / 10);
          pts.push({ x: sx * halfL, y, z: zAbs(sx * halfL, y) - 0.075 });
        }
        parts.bargeBoard(buf, pts, C, { col: C.wood, width: 0.14 });
      }
    }
  }

  // =========================================================================
  // assemble
  // =========================================================================
  const group = new THREE.Group();
  const solidMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.82, metalness: 0.06,
  });
  const solidGeo = new THREE.BufferGeometry();
  solidGeo.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
  solidGeo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
  solidGeo.setAttribute('color', new THREE.Float32BufferAttribute(buf.c, 3));
  solidGeo.setIndex(buf.idx);
  const solid = new THREE.Mesh(solidGeo, solidMat);
  solid.castShadow = solid.receiveShadow = true;
  group.add(deckMesh, solid, extra);

  // verification metrics
  const stats = {
    tris: buf.triangles + deckGeo.index.count / 3,
    bearing: deckBottom(0, dim.D / 2) - plateTop,   // must be raftH (roof bears here)
    eaveHeight: zAbs(0, halfD),
    ridgeHeight: (P.roofType === 'irimoya' ? base + field.gableZ(0, 0) : zAbs(0, 0)),
    deckRise: prof.rise, deckDrop: prof.drop,
  };
  return { group, stats, field, prof };
}

// ---------------------------------------------------------------------------
function buildDeck(field, dim, base, slabT) {
  const nx = 108, ny = 72;
  const pos = [];
  const col = [];
  const top = [], bot = [];
  for (let j = 0; j <= ny; j++) {
    const y = -dim.D / 2 - dim.ov + (j / ny) * (dim.D + 2 * dim.ov);
    for (let i = 0; i <= nx; i++) {
      const x = -dim.L / 2 - dim.rakeOv + (i / nx) * (dim.L + 2 * dim.rakeOv);
      const z = base + field.Z(x, y);
      top.push([x, y, z]); bot.push([x, y, z - slabT]);
      pos.push(x, y, z);
    }
  }
  const geo = new THREE.BufferGeometry();
  const idx = [];
  const v = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    idx.push(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i + 1, j));
  }
  const off = pos.length / 3;
  for (const p of bot) pos.push(p[0], p[1], p[2]);
  const idx2 = idx.map(x => x + off);
  for (let k = 0; k < idx2.length; k += 3) {
    idx.push(idx2[k + 2], idx2[k + 1], idx2[k]); // reversed winding
  }
  // skirt around the boundary
  const loop = [];
  const step = nx;
  for (let i = 0; i <= nx; i++) loop.push(v(i, 0));
  for (let j = 1; j <= ny; j++) loop.push(v(nx, j));
  for (let i = nx - 1; i >= 0; i--) loop.push(v(i, ny));
  for (let j = ny - 1; j >= 1; j--) loop.push(v(0, j));
  loop.push(v(0, 0));
  for (let k = 0; k < loop.length - 1; k++) {
    const a = loop[k], b = loop[k + 1];
    const at = [pos[a*3], pos[a*3+1], pos[a*3+2]], bt = [pos[b*3], pos[b*3+1], pos[b*3+2]];
    const ab = [at[0], at[1], at[2] - slabT], bb = [bt[0], bt[1], bt[2] - slabT];
    const i0 = pos.length / 3;
    pos.push(...at, ...bt, ...bb, ...ab);
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const cols = new Float32Array(pos.length);
  cols.fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}
function deckMaterial(deckCol) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.02,
    color: deckCol, polygonOffset: true, polygonOffsetFactor: -1,
  });
}

// helpers ---------------------------------------------------------------------
function hex(c, mul = 1) {
  const col = new THREE.Color(c);
  if (mul !== 1) { col.r = clamp(col.r * mul, 0, 1); col.g = clamp(col.g * mul, 0, 1); col.b = clamp(col.b * mul, 0, 1); }
  return [col.r, col.g, col.b];
}
function mulberry(seed) {
  let a = (seed * 2654435761) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
