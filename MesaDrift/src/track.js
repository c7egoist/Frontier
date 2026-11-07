import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Track space: s = distance along the centreline, x = lateral (+ = rider's
// right), y = height above the nominal road surface. Pieces are either
// straight or exact 90° arcs, so the course really bends, unlike a corridor
// runner. Each piece also owns its floor function (ramps, gaps, bowls,
// stacked decks) and its obstacles/pickups.
// ---------------------------------------------------------------------------

export const W = 6;               // road half width
export const GROUND_Y = -70;      // desert floor, far below the park
export const HALF_PI = Math.PI / 2;
export const TURN_R = 16;

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const V = () => new THREE.Vector3();
const C = (h) => new THREE.Color(h);

// Sun-bleached concrete, terracotta, pool tile, ochre. No neon anywhere.
export const PAL = {
  road: C(0xEADFCB), roadAlt: C(0xDFD2B9), curb: C(0xCC956F), curbFace: C(0xB97C5A),
  side: C(0xCFBB9E), bottom: C(0xA68E70), deck: C(0xE8DCC4),
  wall: C(0xB5543B), coping: C(0xD9A441), tile: C(0x2F7F7C), tileDark: C(0x276A68),
  tunnel: C(0x6A5850), tunnelDark: C(0x4C3E38),
  rock: C(0xC9825E), rockDark: C(0x9B5C41), rockLight: C(0xE4AC7A),
  stilt: C(0xBFA183), pole: C(0x4A3F3A),
  flagA: C(0xD9A441), flagB: C(0x2F7F7C), flagC: C(0xB5543B),
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------- geometry
class Acc {
  constructor() { this.p = []; this.c = []; this.i = []; this.n = 0; }
  vert(v, col) { this.p.push(v.x, v.y, v.z); this.c.push(col.r, col.g, col.b); return this.n++; }
  quad(a, b, c, d, col) {
    const i = this.n; this.vert(a, col); this.vert(b, col); this.vert(c, col); this.vert(d, col);
    this.i.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  tri(a, b, c, col) { const i = this.n; this.vert(a, col); this.vert(b, col); this.vert(c, col); this.i.push(i, i + 1, i + 2); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeVertexNormals(); return g;
  }
}

export class Piece {
  constructor(type, startS, origin, heading, length, turn = 0, radius = 0) {
    this.type = type; this.startS = startS; this.origin = origin.clone(); this.heading0 = heading;
    this.length = length; this.turn = turn; this.radius = radius;
    this.items = []; this.group = new THREE.Group();
  }
  get endS() { return this.startS + this.length; }
  headingAt(s) { return this.turn ? this.heading0 - this.turn * (s / this.radius) : this.heading0; }
  // forward(θ) = (sinθ, 0, cosθ); right(θ) = (-cosθ, 0, sinθ); turning right decreases θ.
  toWorld(s, x, y, out) {
    const o = this.origin;
    if (!this.turn) {
      const th = this.heading0, sn = Math.sin(th), cs = Math.cos(th);
      return out.set(o.x + sn * s - cs * x, o.y + y, o.z + cs * s + sn * x);
    }
    const R = this.radius, t = this.turn, th = this.heading0 - t * (s / R), r = R - t * x;
    const cx = o.x - t * Math.cos(this.heading0) * R, cz = o.z + t * Math.sin(this.heading0) * R;
    return out.set(cx + t * Math.cos(th) * r, o.y + y, cz - t * Math.sin(th) * r);
  }
  endPose() { return { pos: this.toWorld(this.length, 0, 0, V()), heading: this.headingAt(this.length) }; }
  frameAt(s) { return new Piece('frame', 0, this.toWorld(s, 0, 0, V()), this.headingAt(s), 0); }
  floors(s, x) { return Math.abs(x) <= W ? [0] : []; }
  xLimit() { return W - 0.4; }
  stiltTop() { return -1.4; }
}

function extrude(acc, piece, s0, s1, steps, profileFn, closed = true) {
  let prev = null, prevPts = null;
  for (let k = 0; k <= steps; k++) {
    const s = s0 + ((s1 - s0) * k) / steps;
    const pts = profileFn(s);
    const wp = pts.map((p) => piece.toWorld(s, p.x, p.y, V()));
    if (prev) {
      const m = pts.length, E = closed ? m : m - 1;
      for (let j = 0; j < E; j++) { const j2 = (j + 1) % m; acc.quad(prev[j], prev[j2], wp[j2], wp[j], prevPts[j].c); }
    }
    prev = wp; prevPts = pts;
  }
}
function capFan(acc, piece, s, pts, col) {
  const wp = pts.map((p) => piece.toWorld(s, p.x, p.y, V()));
  for (let j = 1; j < wp.length - 1; j++) acc.tri(wp[0], wp[j], wp[j + 1], col);
}
function boxTS(acc, piece, s, x, yc, ds, dx, dy, col, colTop = col) {
  const P = (a, b, c) => piece.toWorld(s + a * ds, x + b * dx, yc + c * dy, V());
  const p = [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1)];
  acc.quad(p[4], p[5], p[6], p[7], colTop);
  acc.quad(p[0], p[3], p[2], p[1], col);
  acc.quad(p[0], p[1], p[5], p[4], col);
  acc.quad(p[3], p[7], p[6], p[2], col);
  acc.quad(p[1], p[2], p[6], p[5], col);
  acc.quad(p[0], p[4], p[7], p[3], col);
}
function frustumTS(acc, piece, s, x, y0, h, rb, rt, col, colTop = col) {
  const B = (a, b) => piece.toWorld(s + a * rb, x + b * rb, y0, V());
  const T = (a, b) => piece.toWorld(s + a * rt, x + b * rt, y0 + h, V());
  const b = [B(-1, -1), B(1, -1), B(1, 1), B(-1, 1)], t = [T(-1, -1), T(1, -1), T(1, 1), T(-1, 1)];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; acc.quad(b[i], b[j], t[j], t[i], col); }
  acc.quad(t[0], t[1], t[2], t[3], colTop);
}

// Closed slab cross-section with curbs (or walls) on both sides.
function roadProfile(h, o = {}) {
  const wl = o.wl ?? W, wr = o.wr ?? W, cw = o.curbW ?? 1, cb = o.curb ?? 0.35, bt = o.bottom ?? -1.4;
  const wL = o.wallL ?? 0, wR = o.wallR ?? 0;
  const faceL = wL > 0.05 ? PAL.wall : PAL.curbFace, faceR = wR > 0.05 ? PAL.wall : PAL.curbFace;
  const topL = wL > 0.05 ? PAL.coping : PAL.curb, topR = wR > 0.05 ? PAL.coping : PAL.curb;
  const road = o.road ?? PAL.road, roadAlt = o.roadAlt ?? PAL.roadAlt;
  const pts = [
    { x: -wl - cw, y: bt + h, c: PAL.side }, { x: -wl - cw, y: cb + wL + h, c: topL },
    { x: -wl, y: cb + wL + h, c: faceL }, { x: -wl, y: h, c: road },
  ];
  if (o.lanes !== false && wl > 3 && wr > 3) pts.push({ x: -2, y: h, c: roadAlt }, { x: 2, y: h, c: road });
  pts.push({ x: wr, y: h, c: faceR }, { x: wr, y: cb + wR + h, c: topR },
    { x: wr + cw, y: cb + wR + h, c: PAL.side }, { x: wr + cw, y: bt + h, c: PAL.bottom });
  return pts;
}

function stilts(acc, piece, s0, s1, topFn = () => -1.4, xs = [-(W - 0.7), W - 0.7]) {
  for (let s = s0 + 5; s < s1; s += 10) for (const x of xs) {
    const top = topFn(s);
    boxTS(acc, piece, s, x, (top + GROUND_Y) / 2, 0.5, 0.5, (top - GROUND_Y) / 2, PAL.stilt);
  }
}
function flags(acc, piece, s0, s1, rng, x = W + 0.6) {
  const cols = [PAL.flagA, PAL.flagB, PAL.flagC];
  for (let s = s0 + 6; s < s1; s += 12) for (const side of [-1, 1]) {
    boxTS(acc, piece, s, side * x, 1.75, 0.06, 0.06, 1.4, PAL.pole);
    const c = cols[Math.floor(rng() * 3)];
    acc.tri(piece.toWorld(s, side * x, 3.15, V()), piece.toWorld(s - 1.4, side * x, 2.8, V()), piece.toWorld(s, side * x, 2.45, V()), c);
  }
}

function makeSignTexture(text, arrow) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 226;
  const g = cv.getContext('2d');
  g.fillStyle = '#F3E9D6'; g.fillRect(0, 0, 1024, 226);
  g.strokeStyle = '#B5543B'; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 212);
  g.fillStyle = '#B5543B'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = arrow > 0 ? `${text}  \u2192` : arrow < 0 ? `\u2190  ${text}` : text;
  const size = Math.min(150, 1500 / label.length);
  g.font = `italic 900 ${size}px Georgia, "Times New Roman", serif`;
  g.fillText(label, 512, 118);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function gantry(acc, piece, sl, text, arrow) {
  boxTS(acc, piece, sl, -(W + 0.8), 3.75, 0.12, 0.12, 3.75, PAL.pole);
  boxTS(acc, piece, sl, W + 0.8, 3.75, 0.12, 0.12, 3.75, PAL.pole);
  boxTS(acc, piece, sl, 0, 7.55, 0.12, W + 0.9, 0.12, PAL.pole);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 2.1),
    new THREE.MeshStandardMaterial({ map: makeSignTexture(text, arrow), side: THREE.DoubleSide, roughness: 0.9 }));
  m.position.copy(piece.toWorld(sl, 0, 6.4, V())); m.rotation.y = piece.headingAt(sl) + Math.PI;
  m.castShadow = true; m.userData.own = true; m.userData.ownMat = true; piece.group.add(m);
}

// ------------------------------------------------------------ shared assets
let SH = null;
export function shared() {
  if (SH) return SH;
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true, ...o });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1); boxGeo.translate(0, 0.5, 0);
  const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.16, 14); coinGeo.rotateX(HALF_PI);
  const coneGeo = new THREE.ConeGeometry(0.5, 1.1, 8); coneGeo.translate(0, 0.55, 0);
  const boostGeo = new THREE.BoxGeometry(3.4, 0.16, 3.4); boostGeo.translate(0, 0.08, 0);
  SH = {
    boxGeo, coinGeo, coneGeo, boostGeo,
    heartGeo: new THREE.OctahedronGeometry(0.6, 0),
    rockGeo: new THREE.IcosahedronGeometry(1, 0),
    cloudGeo: new THREE.IcosahedronGeometry(1, 1),
    lampGeo: new THREE.BoxGeometry(1.6, 0.25, 0.7),
    coinMat: std({ color: 0xE3B04B, emissive: 0x8A5A14, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.35 }),
    blockMat: std({ color: 0xD8CBB0 }), oxideMat: std({ color: 0xB5543B }), pillarMat: std({ color: 0xC56B4B }),
    coneMat: std({ color: 0xE0A23F }), creamMat: std({ color: 0xF3E9D6 }),
    boostMat: std({ color: 0x2F7F7C, emissive: 0x1D5F5C, emissiveIntensity: 0.6 }),
    heartMat: std({ color: 0xC94C3C, emissive: 0x7A1F14, emissiveIntensity: 0.5 }),
    rockMats: [std({ color: 0xC9825E }), std({ color: 0xB06A4C }), std({ color: 0xE0A87A })],
    cloudMat: std({ color: 0xFFF2E2, emissive: 0xFFD9BF, emissiveIntensity: 0.25 }),
    lampMat: new THREE.MeshBasicMaterial({ color: 0xFFE2A8 }),
    trackMat: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 }),
  };
  return SH;
}

// ------------------------------------------------------------------- items
// item.y is the bottom of its collision box; h its height.
function addItem(piece, kind, sl, x, y, o = {}) {
  const S = shared();
  let mesh = null, w, h, d;
  switch (kind) {
    case 'coin': w = 1.1; h = 1.1; d = 0.5; mesh = new THREE.Mesh(S.coinGeo, S.coinMat); break;
    case 'block': {
      w = o.w ?? 3.6; h = 1.3; d = 1.4;
      mesh = new THREE.Mesh(S.boxGeo, S.blockMat); mesh.scale.set(w, h, d);
      const st = new THREE.Mesh(S.boxGeo, S.oxideMat); st.scale.set(1.01, 0.16, 1.01); st.position.y = 0.84; mesh.add(st);
      break;
    }
    case 'pillar': {
      w = o.w ?? 1.4; h = o.h ?? 5; d = o.d ?? 1.4;
      if (!o.noMesh) {
        mesh = new THREE.Mesh(S.boxGeo, S.pillarMat); mesh.scale.set(w, h, d);
        const band = new THREE.Mesh(S.boxGeo, S.creamMat); band.scale.set(1.03, 0.08, 1.03); band.position.y = 0.3; mesh.add(band);
      }
      break;
    }
    case 'beam': w = o.w ?? 2 * W; h = 0.4; d = 0.5; mesh = new THREE.Mesh(S.boxGeo, S.oxideMat); mesh.scale.set(w, h, d); break;
    case 'cone': w = 1.0; h = 1.1; d = 1.0; mesh = new THREE.Mesh(S.coneGeo, S.coneMat); break;
    case 'boost': {
      w = 3.4; h = 0.6; d = 3.4; mesh = new THREE.Mesh(S.boostGeo, S.boostMat);
      const bar = new THREE.Mesh(S.boxGeo, S.creamMat); bar.scale.set(2.2, 0.04, 0.5); bar.position.set(0, 0.16, 0.6); mesh.add(bar);
      const bar2 = new THREE.Mesh(S.boxGeo, S.creamMat); bar2.scale.set(1.2, 0.04, 0.5); bar2.position.set(0, 0.16, -0.6); mesh.add(bar2);
      break;
    }
    case 'heart': w = 1.2; h = 1.2; d = 1.2; mesh = new THREE.Mesh(S.heartGeo, S.heartMat); break;
  }
  if (mesh) {
    const centred = kind === 'coin' || kind === 'heart';
    mesh.position.copy(piece.toWorld(sl, x, centred ? y + h / 2 : y, V()));
    mesh.rotation.y = piece.headingAt(sl);
    mesh.castShadow = kind !== 'coin' && kind !== 'boost'; mesh.receiveShadow = true;
    piece.group.add(mesh);
  }
  const item = { kind, gs: piece.startS + sl, x, y, w, h, d, mesh, alive: true };
  piece.items.push(item); return item;
}
function coinLine(piece, s0, s1, x, y, step = 3) {
  for (let s = s0; s <= s1 + 1e-6; s += step) addItem(piece, 'coin', s, x, typeof y === 'function' ? y(s) : y);
}
function coinArc(piece, sc, x, base = 0) {
  for (let ds = -5; ds <= 5; ds += 2.5) addItem(piece, 'coin', sc + ds, x, base + 0.7 + 2.0 * (1 - (ds * ds) / 25));
}
const LANES = [-4, 0, 4];
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function populate(piece, rng, diff, s0, s1, o = {}) {
  const spacing = lerp(19, 11.5, diff);
  let s = s0 + rng() * 4;
  while (s < s1 - 6) {
    const r = rng();
    if (r < 0.26) {
      const n = rng() < diff * 0.85 ? 2 : 1;
      const idx = [0, 1, 2].sort(() => rng() - 0.5).slice(0, n);
      idx.forEach((i) => addItem(piece, 'pillar', s, LANES[i], 0));
      const free = [0, 1, 2].filter((i) => !idx.includes(i));
      coinLine(piece, s - 4, s + 6, LANES[pick(rng, free)], 0.25, 2.5);
    } else if (r < 0.52) {
      if (rng() < 0.4 + diff * 0.35) { const cx = rng() < 0.5 ? -2 : 2; addItem(piece, 'block', s, cx, 0, { w: 7.6 }); coinArc(piece, s, cx); }
      else { const lx = pick(rng, LANES); addItem(piece, 'block', s, lx, 0); coinArc(piece, s, lx); }
    } else if (r < 0.68 && !o.noBeam) {
      addItem(piece, 'beam', s, 0, 1.0); coinLine(piece, s - 5, s + 5, pick(rng, LANES), 0.2, 2.5);
    } else if (r < 0.84) {
      const li = Math.floor(rng() * 3), dir = rng() < 0.5 ? 1 : -1;
      for (let k = 0; k < 3; k++) addItem(piece, 'cone', s + k * 3, LANES[(li + k * dir + 3) % 3], 0);
    } else if (r < 0.92 && !o.noBoost) {
      addItem(piece, 'boost', s, pick(rng, LANES), 0);
    } else {
      coinLine(piece, s - 4, s + 8, pick(rng, LANES), 0.25, 3);
    }
    if (diff > 0.12 && rng() < 0.05) addItem(piece, 'heart', s + spacing * 0.5, pick(rng, LANES), 0.7);
    s += spacing * (0.8 + rng() * 0.5);
  }
}

// ---------------------------------------------------------------- dressing
function dress(piece, acc, rng) {
  const S = shared(), L = piece.length;
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const side = rng() < 0.5 ? -1 : 1, fr = piece.frameAt(rng() * L);
    const m = new THREE.Mesh(S.rockGeo, pick(rng, S.rockMats));
    m.position.copy(fr.toWorld(0, side * (17 + rng() * 28), 1 + rng() * 12, V()));
    const sc = 1.5 + rng() * 4; m.scale.set(sc * (0.7 + rng() * 0.6), sc * (0.5 + rng() * 0.5), sc * (0.7 + rng() * 0.6));
    m.rotation.set(rng() * 6, rng() * 6, rng() * 6); m.castShadow = true; m.receiveShadow = true; piece.group.add(m);
  }
  if (rng() < 0.6) {
    const side = rng() < 0.5 ? -1 : 1, fr = piece.frameAt(rng() * L);
    const x = side * (95 + rng() * 140), h = 25 + rng() * 60, rb = 18 + rng() * 30, rt = rb * (0.55 + rng() * 0.3);
    const rm = lerp(rb, rt, 0.7);
    frustumTS(acc, fr, 0, x, GROUND_Y, h * 0.7, rb, rm, PAL.rockDark, PAL.rock);
    frustumTS(acc, fr, 0, x, GROUND_Y + h * 0.7, h * 0.3, rm, rt, PAL.rock, PAL.rockLight);
  }
  if (rng() < 0.22) {
    const side = rng() < 0.5 ? -1 : 1, fr = piece.frameAt(rng() * L), x = side * (36 + rng() * 30), h = 14 + rng() * 10;
    frustumTS(acc, fr, -7, x, GROUND_Y, h - GROUND_Y, 3.6, 2.6, PAL.rock, PAL.rockLight);
    frustumTS(acc, fr, 7, x, GROUND_Y, h - GROUND_Y, 3.6, 2.6, PAL.rock, PAL.rockLight);
    boxTS(acc, fr, 0, x, h + 1.2, 9.5, 3.2, 1.6, PAL.rockDark, PAL.rockLight);
  }
  if (rng() < 0.45) {
    const side = rng() < 0.5 ? -1 : 1, fr = piece.frameAt(rng() * L), cx = side * (40 + rng() * 150), cy = 42 + rng() * 30;
    const k = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < k; i++) {
      const m = new THREE.Mesh(S.cloudGeo, S.cloudMat);
      m.position.copy(fr.toWorld((rng() - 0.5) * 30, cx + (rng() - 0.5) * 30, cy + (rng() - 0.5) * 6, V()));
      m.scale.set(8 + rng() * 10, 2.5 + rng() * 2.5, 6 + rng() * 8); piece.group.add(m);
    }
  }
}

// ---------------------------------------------------------------- builders
const BUILD = {
  start(p, rng, diff, acc) {
    const L = p.length;
    extrude(acc, p, 0, L, 4, () => roadProfile(0));
    stilts(acc, p, 0, L); flags(acc, p, 0, L, rng);
    gantry(acc, p, 14, 'MESA DRIFT', 0);
    coinLine(p, L - 30, L - 6, 0, 0.25, 3);
  },
  straight(p, rng, diff, acc) {
    const L = p.length;
    extrude(acc, p, 0, L, Math.ceil(L / 10), () => roadProfile(0));
    stilts(acc, p, 0, L); flags(acc, p, 0, L, rng);
    populate(p, rng, diff, 8, L - 4);
  },
  turn(p, rng, diff, acc) {
    const L = p.length, t = p.turn;
    const prof = roadProfile(0, { wallL: t > 0 ? 1.7 : 0, wallR: t < 0 ? 1.7 : 0 });
    extrude(acc, p, 0, L, 28, () => prof);
    stilts(acc, p, 0, L);
    gantry(acc, p, 1.5, 'DRIFT', t);
    coinLine(p, 6, L - 5, t * 3.6, 0.25, 3);
    if (diff > 0.25 && rng() < 0.6) { addItem(p, 'cone', L * 0.5, -t * 1.5, 0); addItem(p, 'cone', L * 0.5 + 3, -t * 4, 0); }
  },
  kicker(p, rng, diff, acc) {
    const L = p.length;
    const h = (s) => (s < 12 ? 0 : s <= 22 ? 2.4 * Math.pow((s - 12) / 10, 1.7) : 0);
    p.floors = (s, x) => { if (Math.abs(x) > W) return []; if (s < 22) return [h(s)]; if (s < 32) return []; return [0]; };
    p.stiltTop = (s) => h(s) - 1.4;
    extrude(acc, p, 0, 12, 1, () => roadProfile(0));
    extrude(acc, p, 12, 22, 10, (s) => roadProfile(h(s), s > 20.6
      ? { road: PAL.coping, roadAlt: PAL.coping } : { road: PAL.tile, roadAlt: PAL.tileDark }));
    capFan(acc, p, 22, roadProfile(h(22)), PAL.side);
    extrude(acc, p, 32, L, 2, () => roadProfile(0));
    capFan(acc, p, 32, roadProfile(0), PAL.side);
    stilts(acc, p, 0, 22, p.stiltTop); stilts(acc, p, 32, L);
    flags(acc, p, 0, 18, rng); flags(acc, p, 32, L, rng);
    addItem(p, 'boost', 6, pick(rng, LANES), 0);
    for (let s = 23; s <= 34; s += 2.6) { const tt = (s - 22) / 30; addItem(p, 'coin', s, 0, 2.4 + 10 * tt - 16 * tt * tt + 0.6); }
    if (diff > 0.3) addItem(p, 'block', 48, pick(rng, [-4, 4]), 0);
  },
  tunnel(p, rng, diff, acc) {
    const L = p.length;
    extrude(acc, p, 0, L, 6, () => roadProfile(0, { road: PAL.roadAlt, roadAlt: PAL.road }));
    const inner = [{ x: -(W + 1), y: 0.35, c: PAL.tunnelDark }], outer = [{ x: -(W + 3.5), y: -1.4, c: PAL.rockDark }];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI - (Math.PI * k) / 10, c = Math.cos(a), s = Math.sin(a);
      inner.push({ x: 7 * c, y: 2.6 + 4.6 * s, c: k % 2 ? PAL.tunnel : PAL.tunnelDark });
      const wob = 1 + 0.12 * Math.sin(k * 2.3);
      outer.push({ x: 10.5 * c * wob, y: 2.6 + 7.5 * s * wob, c: k % 2 ? PAL.rock : PAL.rockDark });
    }
    inner.push({ x: W + 1, y: 0.35, c: PAL.tunnelDark }); outer.push({ x: W + 3.5, y: -1.4, c: PAL.rockDark });
    extrude(acc, p, 0, L, 6, () => inner, false);
    extrude(acc, p, 0, L, 6, () => outer, false);
    for (const s of [0, L]) {
      const a = inner.map((q) => p.toWorld(s, q.x, q.y, V())), b = outer.map((q) => p.toWorld(s, q.x, q.y, V()));
      for (let j = 0; j < a.length - 1; j++) acc.quad(a[j], a[j + 1], b[j + 1], b[j], PAL.rock);
    }
    stilts(acc, p, 0, L);
    const S = shared();
    for (let s = 5; s < L - 3; s += 7) {
      const m = new THREE.Mesh(S.lampGeo, S.lampMat);
      m.position.copy(p.toWorld(s, 0, 7.0, V())); m.rotation.y = p.headingAt(s); p.group.add(m);
    }
    populate(p, rng, diff * 0.8, 10, L - 8, { noBeam: true, noBoost: true });
  },
  bowl(p, rng, diff, acc) {
    const L = p.length, Rw = 5;
    const wallH = (d) => (d <= 0 ? 0 : d < Rw ? Rw - Math.sqrt(Rw * Rw - d * d) : Rw);
    p.floors = (s, x) => [wallH(Math.abs(x) - W)];
    p.xLimit = () => W + Rw * 0.82;
    const left = [], right = [];
    for (let k = 8; k >= 1; k--) { const d = (Rw * k) / 8; left.push({ x: -(W + d), y: wallH(d), c: k % 2 ? PAL.tile : PAL.tileDark }); }
    for (let k = 1; k <= 8; k++) { const d = (Rw * k) / 8; right.push({ x: W + d, y: wallH(d), c: k % 2 ? PAL.tile : PAL.tileDark }); }
    const pts = [
      { x: -(W + Rw) - 1.2, y: -1.4, c: PAL.side }, { x: -(W + Rw) - 1.2, y: Rw + 0.4, c: PAL.coping }, { x: -(W + Rw), y: Rw + 0.4, c: PAL.coping },
      ...left,
      { x: -W, y: 0, c: PAL.road }, { x: -2, y: 0, c: PAL.roadAlt }, { x: 2, y: 0, c: PAL.road }, { x: W, y: 0, c: PAL.tileDark },
      ...right,
      { x: W + Rw, y: Rw + 0.4, c: PAL.coping }, { x: W + Rw + 1.2, y: Rw + 0.4, c: PAL.side }, { x: W + Rw + 1.2, y: -1.4, c: PAL.bottom },
    ];
    extrude(acc, p, 0, L, 7, () => pts);
    // end faces of the two walls (fan from the outer-top corner, which sees the whole wall section)
    const lPoly = [pts[1], pts[2], ...left, { x: -W, y: 0 }, { x: -W, y: -1.4 }, pts[0]];
    const rPoly = [{ x: W + Rw + 1.2, y: Rw + 0.4 }, { x: W + Rw + 1.2, y: -1.4 }, { x: W, y: -1.4 }, { x: W, y: 0 }, ...right, { x: W + Rw, y: Rw + 0.4 }];
    for (const s of [0, L]) { capFan(acc, p, s, lPoly, PAL.side); capFan(acc, p, s, rPoly, PAL.side); }
    stilts(acc, p, 0, L, undefined, [-(W + Rw - 0.6), -(W - 0.7), W - 0.7, W + Rw - 0.6]);
    const wy = wallH(3.2) + 0.3;
    addItem(p, 'block', 16, 0, 0, { w: 7.6 }); coinLine(p, 10, 24, -(W + 3.2), wy, 2.5);
    addItem(p, 'cone', 27, -3, 0); addItem(p, 'cone', 30, 3, 0);
    addItem(p, 'block', 40, 0, 0, { w: 7.6 }); coinLine(p, 34, 48, W + 3.2, wy, 2.5);
    if (diff > 0.4) addItem(p, 'pillar', 40, pick(rng, [-4.8, 4.8]), 0);
  },
  split(p, rng, diff, acc) {
    const L = p.length;
    const hU = (s) => (s < 20 ? (4.5 * (s - 8)) / 12 : 4.5);
    p.floors = (s, x) => { const ax = Math.abs(x), f = []; if (ax <= W) f.push(0); if (s >= 8 && s <= 52 && ax <= 3) f.push(hU(s)); return f; };
    extrude(acc, p, 0, L, 6, () => roadProfile(0));
    const up = { wl: 3, wr: 3, curbW: 0.5, curb: 0.3, bottom: -0.6, lanes: false };
    extrude(acc, p, 8, 52, 22, (s) => roadProfile(hU(s), { ...up, road: s < 20 ? PAL.tile : PAL.deck }));
    capFan(acc, p, 52, roadProfile(4.5, up), PAL.side);
    for (const s of [24, 32, 40, 48]) for (const x of [-3.4, 3.4]) {
      boxTS(acc, p, s, x, 1.45, 0.25, 0.25, 2.45, PAL.curbFace);
      addItem(p, 'pillar', s, x, 0, { w: 0.5, d: 0.5, h: 4.5, noMesh: true });
    }
    stilts(acc, p, 0, L); flags(acc, p, 0, L, rng);
    coinLine(p, 22, 50, 0, 4.7, 3);
    addItem(p, 'block', 36, 0, 0);
    addItem(p, 'beam', 46, 0, 1.0);
    coinLine(p, 26, 46, pick(rng, [-5, 5]), 0.25, 4);
    if (diff > 0.35) addItem(p, 'cone', 58, pick(rng, LANES), 0);
  },
  overpass(p, rng, diff, acc) {
    const L = p.length, H = 7;
    const h = (s) => (s < 28 ? H * smooth((s - 6) / 22) : s < 44 ? H : H * (1 - smooth((s - 44) / 22)));
    p.floors = (s, x) => (Math.abs(x) <= W ? [h(s)] : []);
    p.stiltTop = (s) => h(s) - 1.4;
    extrude(acc, p, 0, L, 36, (s) => {
      const r = 0.9 * clamp(h(s) / H, 0, 1);
      return roadProfile(h(s), { wallL: r, wallR: r, road: r > 0.5 ? PAL.deck : PAL.road });
    });
    stilts(acc, p, 0, L, p.stiltTop);
    const cross = new Piece('frame', 0, p.toWorld(36, -56, 0, V()), p.heading0 - HALF_PI, 112);
    extrude(acc, cross, 0, 112, 4, () => roadProfile(0));
    stilts(acc, cross, 0, 112);
    flags(acc, cross, 0, 112, rng);
    coinLine(p, 9, 27, 0, (s) => h(s) + 0.25, 3);
    addItem(p, 'boost', 36, 0, H);
    if (diff > 0.3) { addItem(p, 'block', 30, -4, H); addItem(p, 'block', 30, 4, H); }
    else addItem(p, 'cone', 30, pick(rng, LANES), H);
    addItem(p, 'cone', 54, 2, h(54)); addItem(p, 'cone', 57, -2, h(57));
  },
  underpass(p, rng, diff, acc) {
    const L = p.length;
    extrude(acc, p, 0, L, 5, () => roadProfile(0));
    stilts(acc, p, 0, L); flags(acc, p, 0, 18, rng); flags(acc, p, 32, L, rng);
    const bridge = new Piece('frame', 0, p.toWorld(26, -48, 7.2, V()), p.heading0 - HALF_PI, 96);
    const bp = { wl: 4.5, wr: 4.5, wallL: 1.0, wallR: 1.0, bottom: -1.3, lanes: false, road: PAL.deck };
    extrude(acc, bridge, 0, 96, 4, () => roadProfile(0, bp));
    capFan(acc, bridge, 0, roadProfile(0, bp), PAL.side); capFan(acc, bridge, 96, roadProfile(0, bp), PAL.side);
    for (const cs of [10, 36, 60, 86]) {
      const top = -1.3, bot = GROUND_Y - 7.2;
      boxTS(acc, bridge, cs, 0, (top + bot) / 2, 1.4, 3.6, (top - bot) / 2, PAL.rockDark, PAL.rock);
    }
    addItem(p, 'beam', 26, 0, 1.0);
    coinLine(p, 20, 32, pick(rng, LANES), 0.2, 3);
    addItem(p, 'block', 12, pick(rng, LANES), 0);
    addItem(p, 'pillar', 40, pick(rng, LANES), 0);
    if (diff > 0.4) addItem(p, 'cone', 44, pick(rng, LANES), 0);
  },
};

const LENGTHS = { start: 70, turn: HALF_PI * TURN_R, kicker: 58, tunnel: 60, bowl: 56, split: 64, overpass: 72, underpass: 52 };

export function makePiece(type, startS, origin, heading, rng, diff, turnDir = 0) {
  let length = LENGTHS[type] ?? 44 + Math.floor(rng() * 3) * 8;
  const piece = type === 'turn'
    ? new Piece(type, startS, origin, heading, length, turnDir, TURN_R)
    : new Piece(type, startS, origin, heading, length);
  const acc = new Acc();
  BUILD[type](piece, rng, diff, acc);
  dress(piece, acc, rng);
  const mesh = new THREE.Mesh(acc.build(), shared().trackMat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.own = true;
  piece.group.add(mesh);
  return piece;
}

// -------------------------------------------------------------------- track
export class Track {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group); this.pieces = [];
  }
  reset(seed = 1) {
    for (const p of this.pieces) this.dispose(p);
    this.pieces = []; this.rng = mulberry32(seed); this.netTurn = 0; this.lastType = null; this.prevType = null;
    this.total = 0; this.cursor = { pos: V(), heading: 0 };
    this.add('start');
    while (this.total < 420) this.addNext();
  }
  pickType() {
    const last = this.lastType, prev = this.prevType;
    const w = { straight: 3, turn: 3.2, kicker: 2, tunnel: 1.4, bowl: 1.5, split: 1.6, overpass: 1.3, underpass: 1.4 };
    if (this.total < 260) { w.tunnel = 0; w.split = 0; w.overpass = 0; w.underpass = 0.4; w.bowl = 0.6; }
    if (last === 'start') w.turn = 0.5;
    if (last === 'turn' && prev === 'turn') w.turn = 0;
    if (last && last !== 'straight' && last !== 'start' && last !== 'turn') w[last] = 0;
    let sum = 0; for (const k in w) sum += w[k];
    let r = this.rng() * sum;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'straight';
  }
  addNext() { this.add(this.pickType()); }
  add(type) {
    const diff = clamp(this.total / 3000, 0, 1);
    let dir = 0;
    if (type === 'turn') dir = this.netTurn >= 1 ? -1 : this.netTurn <= -1 ? 1 : this.rng() < 0.5 ? 1 : -1;
    const piece = makePiece(type, this.total, this.cursor.pos, this.cursor.heading, this.rng, diff, dir);
    this.pieces.push(piece); this.group.add(piece.group);
    const e = piece.endPose(); this.cursor = { pos: e.pos, heading: e.heading };
    this.total = piece.endS; if (type === 'turn') this.netTurn += dir;
    this.prevType = this.lastType; this.lastType = type;
  }
  ensure(ps) {
    while (this.total < ps + 420) this.addNext();
    while (this.pieces.length > 2 && this.pieces[0].endS < ps - 50) this.dispose(this.pieces.shift());
  }
  dispose(p) {
    this.group.remove(p.group);
    p.group.traverse((o) => {
      if (o.isMesh && o.userData.own) { o.geometry.dispose(); if (o.userData.ownMat) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }
    });
  }
  pieceAt(gs) {
    const ps = this.pieces;
    for (let i = 0; i < ps.length; i++) if (gs < ps[i].endS) return ps[i];
    return ps[ps.length - 1];
  }
  toWorld(gs, x, y, out) { const p = this.pieceAt(gs); return p.toWorld(gs - p.startS, x, y, out); }
  heading(gs) { const p = this.pieceAt(gs); return p.headingAt(gs - p.startS); }
  floors(gs, x) { const p = this.pieceAt(gs); return p.floors(gs - p.startS, x); }
  xLimit(gs, y) { const p = this.pieceAt(gs); return p.xLimit(gs - p.startS, y); }
  nearItems(gs, range, cb) {
    for (const p of this.pieces) {
      if (p.endS < gs - range || p.startS > gs + range) continue;
      for (const it of p.items) if (it.alive && Math.abs(it.gs - gs) < range) cb(it);
    }
  }
  update(dt, t) {
    for (const p of this.pieces) for (const it of p.items) {
      if (!it.alive || !it.mesh) continue;
      if (it.kind === 'coin') it.mesh.rotation.y += dt * 3;
      else if (it.kind === 'heart') { it.mesh.rotation.y += dt * 2; it.mesh.position.y += Math.sin(t * 4) * dt * 0.4; }
    }
  }
}
