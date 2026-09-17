// Street furniture / architectural detail library.
// Every prop is built in local space (origin on the ground, facing +Z) and placed
// through the builder's transform stack, so props can be rotated anywhere.
import * as THREE from 'three';
import { sagPoints, tubeGeo, mergeList } from './geom.js';
import * as TT from './textures.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** Accepts [x,y,z] arrays or Vector3s. */
const toV3 = (p) => (p && p.isVector3 ? p.clone() : V3(p?.[0] ?? 0, p?.[1] ?? 0, p?.[2] ?? 0));

/* ------------------------------------------------------------------ */
/* Paper lanterns                                                      */
/* ------------------------------------------------------------------ */

export function propChochin(b, o, pos, rotY = 0, opts = {}) {
  const r = opts.radius ?? 0.17;
  const h = opts.height ?? 0.5;
  const text = opts.text ?? '';
  const color = opts.color ?? o.lamp ?? '#d8362f';
  const mat = b.mat('lantern', { color, map: TT.lanternTexture({ text, bg: color, fg: '#fdf7e8' }), emissive: false });
  const glow = b.mat('lamp', { color: '#ffd9a0', emissive: true, emissiveColor: '#ffca7a', emissiveIntensity: 0.9 });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  const pts = [];
  const seg = 10;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const y = t * h;
    const bulge = Math.sin(Math.PI * Math.pow(t, 0.85)) * 1.0;
    const rad = r * (0.42 + 0.62 * bulge);
    pts.push(new THREE.Vector2(Math.max(0.02, rad), y));
  }
  const body = new THREE.LatheGeometry(pts, 14);
  b.add(mat, body, 'chochin');
  b.cyl(o.dark || mat, { r: r * 0.34, h: 0.035, seg: 10 }, [0, h + 0.02, 0]);
  b.cyl(o.dark || mat, { r: r * 0.3, h: 0.03, seg: 10 }, [0, 0.015, 0]);
  b.cyl(b.mat('darkMetal', {}), { r: r * 0.5, h: 0.05, seg: 10 }, [0, h - 0.02, 0]);
  if (o.glow !== false) {
    const inside = new THREE.CylinderGeometry(r * 0.5, r * 0.5, h * 0.6, 8);
    inside.translate(0, h * 0.5, 0);
    b.add(glow, inside, 'chochin_glow');
  }
  b.popMatrix();
}

/* ------------------------------------------------------------------ */
/* Lantern post + paper lanterns strung on a rope                      */
/* ------------------------------------------------------------------ */

export function propLanternPost(b, o, pos, rotY = 0, opts = {}) {
  const h = opts.height ?? 2.5;
  const wood = b.mat('wood', { color: o.wood, style: o.woodStyle });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  b.cyl(wood, { rt: 0.07, rb: 0.09, h, seg: 8 }, [0, h / 2, 0]);
  b.box(wood, [1.0, 0.08, 0.08], [0.4, h - 0.12, 0]);
  b.cyl(b.mat('stone', { color: o.stone }), { r: 0.16, h: 0.14, seg: 8 }, [0, 0.07, 0]);
  const n = opts.count ?? 2;
  for (let i = 0; i < n; i++) {
    const x = 0.12 + i * 0.42;
    propChochin(b, o, [x, h - 0.62, 0], 0, {
      radius: 0.14,
      height: 0.42,
      color: o.lamp,
      text: opts.texts?.[i] ?? '',
    });
    b.cyl(o.dark ? b.mat('rubber', { color: o.dark }) : b.mat('rubber', { color: '#221d18' }), { r: 0.006, h: 0.2, seg: 5 }, [x, h - 0.6, 0]);
  }
  b.popMatrix();
}

/** Rope of lanterns strung across the facade. */
export function propLanternString(b, o, a, bb, opts = {}) {
  const sag = opts.sag ?? 0.35;
  const rope = b.mat('rubber', { color: opts.ropeColor || '#241f1a' });
  const pts = sagPoints(a, bb, sag, 14);
  const g = tubeGeo(pts, 0.012, 16, 4);
  if (g) b.add(rope, g, 'lantern_rope');
  const n = opts.count ?? 5;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a[0] + (bb[0] - a[0]) * t;
    const y = a[1] + (bb[1] - a[1]) * t - Math.sin(Math.PI * t) * sag;
    const z = a[2] + (bb[2] - a[2]) * t;
    const idx = Math.floor(t * 14);
    const p = pts[Math.min(pts.length - 1, idx)];
    propChochin(b, o, [p[0], p[1] - 0.46, p[2]], 0, {
      radius: opts.radius ?? 0.13,
      height: opts.height ?? 0.4,
      color: opts.color ?? o.lamp ?? '#d8362f',
      text: opts.texts ? opts.texts[i % opts.texts.length] : '',
    });
  }
}

/* ------------------------------------------------------------------ */
/* Stone lantern (toro)                                                */
/* ------------------------------------------------------------------ */

export function propStoneLantern(b, o, pos, rotY = 0, opts = {}) {
  const s = opts.scale ?? 1;
  const stone = b.mat('stone', { color: o.stone });
  const glow = b.mat('lamp', { color: '#ffe0b0', emissive: true, emissiveColor: '#ffd79a', emissiveIntensity: 0.8 });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  b.cyl(stone, { r: 0.28 * s, h: 0.16 * s, seg: 8 }, [0, 0.08 * s, 0]);
  b.cyl(stone, { rt: 0.12 * s, rb: 0.16 * s, h: 0.7 * s, seg: 8 }, [0, 0.5 * s, 0]);
  b.cyl(stone, { r: 0.24 * s, h: 0.1 * s, seg: 8 }, [0, 0.9 * s, 0]);
  b.cyl(stone, { r: 0.18 * s, h: 0.28 * s, seg: 6 }, [0, 1.09 * s, 0]);
  if (opts.glow !== false) b.cyl(glow, { r: 0.145 * s, h: 0.22 * s, seg: 6 }, [0, 1.09 * s, 0]);
  const roof = new THREE.ConeGeometry(0.34 * s, 0.26 * s, 6);
  roof.translate(0, 1.36 * s, 0);
  b.add(stone, roof, 'toro_roof');
  const top = new THREE.SphereGeometry(0.08 * s, 8, 6);
  top.translate(0, 1.52 * s, 0);
  b.add(stone, top, 'toro_top');
  b.popMatrix();
}

/* ------------------------------------------------------------------ */
/* Utility pole + overhead wires                                       */
/* ------------------------------------------------------------------ */

export function utilityPole(b, o, pos, opts = {}) {
  const h = opts.height ?? 9.5;
  const concrete = b.mat('concrete', { color: opts.color || '#b9b6ae' });
  const metal = b.mat('darkMetal', { color: '#5d6166' });
  const rubber = b.mat('rubber', { color: '#1b1b1e' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  b.cyl(concrete, { rt: 0.12, rb: 0.19, h, seg: 10 }, [0, h / 2, 0]);
  // crossarms + insulators
  const arms = opts.arms ?? 3;
  for (let i = 0; i < arms; i++) {
    const y = h - 0.5 - i * 0.85;
    b.box(metal, [1.9, 0.08, 0.1], [0, y, 0]);
    for (const sx of [-0.8, -0.35, 0.35, 0.8]) {
      b.cyl(b.mat('ceramic', { color: '#6f7d86' }), { r: 0.06, h: 0.16, seg: 6 }, [sx, y + 0.12, 0]);
      b.cyl(b.mat('ceramic', { color: '#6f7d86' }), { rt: 0.09, rb: 0.06, h: 0.1, seg: 6 }, [sx, y + 0.24, 0]);
    }
  }
  // transformer cans
  const cans = opts.transformers ?? 2;
  for (let i = 0; i < cans; i++) {
    const x = (i - (cans - 1) / 2) * 0.5;
    b.cyl(metal, { r: 0.19, h: 0.55, seg: 10 }, [x, h - 3.1, 0.34]);
    b.cyl(metal, { r: 0.13, h: 0.2, seg: 8 }, [x, h - 2.75, 0.34]);
  }
  // service loops
  const loops = [];
  for (let i = 0; i < 4; i++) {
    const y0 = h - 4.2 - i * 0.16;
    loops.push(tubeGeo(sagPoints([0, y0, 0], [0.55 + i * 0.06, y0 - 0.9, 0.3], 0.35, 8), 0.014, 8, 4));
  }
  const m = mergeList(loops.filter(Boolean));
  if (m) b.add(rubber, m, 'pole_loops');
  // street lamp arm
  if (opts.lamp !== false) {
    const armY = h - 1.9;
    b.box(metal, [0.08, 0.08, 1.1], [0, armY, 0.6]);
    const head = new THREE.BoxGeometry(0.5, 0.14, 0.3);
    head.translate(0, armY - 0.1, 1.1);
    b.add(metal, head, 'lamp_head');
    const lens = new THREE.BoxGeometry(0.44, 0.06, 0.24);
    lens.translate(0, armY - 0.19, 1.1);
    b.add(b.mat('lamp', { color: '#ffe6bb', emissive: true, emissiveColor: '#ffdc9e', emissiveIntensity: 1.1 }), lens, 'lamp_lens');
  }
  // stapled posters
  if (opts.posters !== false) {
    const poster = TT.posterTexture({ title: 'お知らせ', lines: ['#地域安全', 'パトロール', '実施中'], accent: '#2456a8', bg: '#f2f0e6' });
    for (let i = 0; i < 3; i++) {
      const y = 1.7 + i * 0.75;
      const p = new THREE.PlaneGeometry(0.34, 0.46);
      p.rotateY((i % 2 ? 0.5 : 1.9) + Math.PI * 0.5 * 0);
      p.translate(0, y, 0.2 + i * 0.01);
      b.add(b.mat('poster', { color: '#ffffff', map: poster }), p, 'pole_poster');
    }
  }
  // climbing cable + bracket
  b.box(metal, [0.3, 0.06, 0.3], [0.16, 3.2, 0]);
  b.popMatrix();
  return { top: [pos[0], pos[1] + h, pos[2]], height: h };
}

/** Sagging cables between two 3D points. */
export function propWires(b, o, a, bb, opts = {}) {
  const count = opts.count ?? 3;
  const spread = opts.spread ?? 0.28;
  const rubber = b.mat('rubber', { color: opts.color || '#15151a' });
  const geos = [];
  const rng = opts.rng;
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * spread;
    const yOff = rng ? rng.float(-0.35, 0.35) : 0;
    const p0 = [a[0], a[1] + off + yOff, a[2]];
    const p1 = [bb[0], bb[1] + off + yOff * 0.6, bb[2]];
    const sag = opts.sag ?? (0.25 + Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * 0.05);
    const pts = sagPoints(p0, p1, sag, 12);
    geos.push(tubeGeo(pts, opts.radius ?? 0.022, 14, 4));
  }
  const m = mergeList(geos.filter(Boolean));
  if (m) b.add(rubber, m, 'wires');
}

/* ------------------------------------------------------------------ */
/* Vending machine                                                     */
/* ------------------------------------------------------------------ */

export function propVending(b, o, pos, rotY = 0, opts = {}) {
  const w = opts.width ?? 1.1;
  const d = 0.68;
  const h = 1.95;
  const accent = opts.accent ?? o.accent ?? '#c8202a';
  const body = b.mat('plastic', { color: opts.bodyColor || '#e9ecef' });
  const face = b.mat('vending', { color: '#ffffff', map: TT.vendingTexture({ brand: opts.brand || 'ドリンク', accent }) });
  const glow = b.mat('lamp', { color: '#ffffff', emissive: true, emissiveColor: '#cfe8ff', emissiveIntensity: 0.75 });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  const shell = new THREE.BoxGeometry(w, h, d);
  shell.translate(0, h / 2, 0);
  b.add(body, shell, 'vending_body');
  const planeGeo = new THREE.PlaneGeometry(w * 0.96, h * 0.96);
  planeGeo.translate(0, h / 2, d / 2 + 0.011);
  b.add(face, planeGeo, 'vending_face');
  const lightBox = new THREE.PlaneGeometry(w * 0.9, h * 0.45);
  lightBox.translate(0, h * 0.63, d / 2 + 0.02);
  b.add(glow, lightBox, 'vending_glow');
  b.cyl(b.mat('darkMetal', { color: '#3a3d42' }), { r: 0.05, h: 0.1, seg: 6 }, [-w * 0.4, 0.02, d / 2 - 0.1], [Math.PI / 2, 0, 0]);
  b.cyl(b.mat('darkMetal', { color: '#3a3d42' }), { r: 0.05, h: 0.1, seg: 6 }, [w * 0.2, 0.02, d / 2 - 0.1], [Math.PI / 2, 0, 0]);
  b.popMatrix();
  return { light: { pos: [pos[0], pos[1] + h * 0.63, pos[2] + 0.4], color: '#cfe8ff', intensity: 3, distance: 4 } };
}

/* ------------------------------------------------------------------ */
/* Interior slice (visible through shopfront glass)                    */
/* ------------------------------------------------------------------ */

export function interiorSlice(b, o, cfg) {
  // cfg: {w, d, floorY, ceilY, style}
  const { w, d, floorY, ceilY, style = 'diner' } = cfg;
  const wood = b.mat('wood', { color: o.wood, style: o.woodStyle });
  const dark = b.mat('wood', { color: '#33261c', style: 'walnut' });
  const paper = b.mat('paper', { color: '#f7ecd2', emissive: true, emissiveColor: '#ffd9a0', emissiveIntensity: 0.35 });
  const counterMat = b.mat('wood', { color: o.shopfront || o.wood, style: 'board' });
  const cloth = b.mat('cloth', { color: o.accent });
  const glow = b.mat('lamp', { color: '#ffe6bb', emissive: true, emissiveColor: '#ffdc9e', emissiveIntensity: 0.9 });

  // floor + back wall
  const floor = new THREE.BoxGeometry(w * 0.94, 0.06, d * 0.9);
  floor.translate(0, floorY + 0.03, -d * 0.05);
  b.add(b.mat('wood', { color: '#6b563f', style: 'board' }), floor, 'interior_floor');
  const ceil = new THREE.BoxGeometry(w * 0.94, 0.06, d * 0.9);
  ceil.translate(0, ceilY - 0.03, -d * 0.05);
  b.add(paper, ceil, 'interior_ceiling');

  if (style === 'izakaya' || style === 'ramen') {
    // counter + stools + shelf
    const cw = w * (style === 'ramen' ? 0.8 : 0.6);
    b.box(counterMat, [cw, 0.9, 0.6], [0, floorY + 0.45, -d * 0.28]);
    b.box(dark, [cw + 0.1, 0.08, 0.7], [0, floorY + 0.94, -d * 0.28]);
    const n = Math.max(2, Math.floor(cw / 0.75));
    for (let i = 0; i < n; i++) {
      const x = -cw / 2 + (i + 0.5) * (cw / n);
      propStool(b, o, [x, floorY, -d * 0.28 + 0.85]);
    }
    // hanging lamps over the counter
    for (let i = 0; i < 3; i++) {
      const x = -cw * 0.32 + i * cw * 0.32;
      b.cyl(b.mat('rubber', { color: '#1c1c1e' }), { r: 0.008, h: 0.7, seg: 4 }, [x, ceilY - 0.35, -d * 0.28]);
      const shade = new THREE.ConeGeometry(0.16, 0.18, 10, 1, true);
      shade.translate(x, ceilY - 0.76, -d * 0.28);
      b.add(dark, shade, 'lamp_shade');
      const bulb = new THREE.SphereGeometry(0.06, 8, 6);
      bulb.translate(x, ceilY - 0.84, -d * 0.28);
      b.add(glow, bulb, 'lamp_bulb');
      b.raw(glow, new THREE.SphereGeometry(0.001, 4, 3));
    }
    // bottles on a shelf
    b.box(dark, [cw * 0.9, 0.05, 0.3], [0, floorY + 1.75, -d * 0.46]);
  } else if (style === 'cafe' || style === 'tea') {
    for (let i = 0; i < 2; i++) {
      const x = (i - 0.5) * w * 0.4;
      propTable(b, o, [x, floorY, -d * 0.2], { height: 0.72, radius: 0.36 });
      propStool(b, o, [x - 0.55, floorY, -d * 0.2], { seatH: 0.44 });
      propStool(b, o, [x + 0.55, floorY, -d * 0.2], { seatH: 0.44 });
    }
  } else if (style === 'konbini') {
    // shelves
    for (let i = 0; i < 3; i++) {
      const z = -d * 0.18 - i * 0.9;
      b.box(b.mat('plastic', { color: '#e8eaee' }), [w * 0.55, 1.5, 0.5], [0, floorY + 0.75, z]);
      for (let s = 0; s < 4; s++) {
        b.box(b.mat('wood', { color: '#d7d2c6' }), [w * 0.55, 0.04, 0.52], [0, floorY + 0.3 + s * 0.36, z]);
      }
    }
    // chiller along the back
    b.box(b.mat('metal', { color: '#dfe3e8' }), [w * 0.8, 2.0, 0.6], [0, floorY + 1.0, -d * 0.42]);
  }
  // noren / curtain strip over the glass
  void cloth;
}

/* ------------------------------------------------------------------ */
/* Seating / tables                                                    */
/* ------------------------------------------------------------------ */

export function propStool(b, o, pos, opts = {}) {
  const seatH = opts.seatH ?? 0.45;
  const wood = b.mat('wood', { color: opts.color || '#8a6a44', style: 'board' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  b.cyl(wood, { rt: 0.19, rb: 0.19, h: 0.06, seg: 12 }, [0, seatH, 0]);
  for (const [dx, dz] of [
    [-0.12, -0.12],
    [0.12, -0.12],
    [-0.12, 0.12],
    [0.12, 0.12],
  ]) {
    b.cyl(wood, { rt: 0.022, rb: 0.026, h: seatH, seg: 6 }, [dx, seatH / 2, dz]);
  }
  b.cyl(wood, { r: 0.015, h: 0.34, seg: 5 }, [0, 0.14, 0], [0, 0, Math.PI / 2]);
  b.popMatrix();
}

export function propChair(b, o, pos, opts = {}) {
  const wood = b.mat('wood', { color: opts.color || '#6b563f', style: 'board' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const seatH = opts.seatH ?? 0.44;
  b.box(wood, [0.44, 0.06, 0.44], [0, seatH, 0]);
  for (const [dx, dz] of [
    [-0.18, -0.18],
    [0.18, -0.18],
    [-0.18, 0.18],
    [0.18, 0.18],
  ]) {
    b.box(wood, [0.05, seatH, 0.05], [dx, seatH / 2, dz]);
  }
  b.box(wood, [0.44, 0.06, 0.05], [0, seatH + 0.45, -0.2]);
  b.box(wood, [0.05, 0.45, 0.05], [-0.18, seatH + 0.22, -0.2]);
  b.box(wood, [0.05, 0.45, 0.05], [0.18, seatH + 0.22, -0.2]);
  if (opts.cushion) {
    b.box(b.mat('cloth', { color: o.accent }), [0.4, 0.05, 0.4], [0, seatH + 0.06, 0]);
  }
  b.popMatrix();
}

export function propTable(b, o, pos, opts = {}) {
  const height = opts.height ?? 0.72;
  const radius = opts.radius ?? 0.4;
  const wood = b.mat('wood', { color: opts.color || '#5b4632', style: 'board' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  if (opts.low) {
    b.box(wood, [1.2, 0.08, 0.7], [0, 0.32, 0]);
    for (const [dx, dz] of [
      [-0.5, -0.28],
      [0.5, -0.28],
      [-0.5, 0.28],
      [0.5, 0.28],
    ]) {
      b.box(wood, [0.07, 0.32, 0.07], [dx, 0.16, dz]);
    }
  } else {
    b.cyl(wood, { r: radius, h: 0.05, seg: 16 }, [0, height, 0]);
    b.cyl(wood, { r: 0.05, h: height, seg: 8 }, [0, height / 2, 0]);
    b.cyl(wood, { r: 0.24, h: 0.04, seg: 10 }, [0, 0.02, 0]);
    if (opts.cloth) {
      b.cyl(b.mat('stripe', { color: '#ffffff', map: TT.stripeTexture('#f2efe6', '#f2efe6', 2) }), { r: radius * 1.02, h: 0.02, seg: 10 }, [0, height + 0.05, 0]);
    }
  }
  b.popMatrix();
}

export function propBench(b, o, pos, opts = {}) {
  const wood = b.mat('wood', { color: opts.color || '#6b563f', style: 'board' });
  const stone = b.mat('stone', { color: o.stone });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const len = opts.length ?? 1.7;
  const legs = opts.legs === 'stone' ? stone : wood;
  for (const dx of [-len / 2 + 0.2, len / 2 - 0.2]) {
    b.box(legs, [0.14, 0.42, 0.4], [dx, 0.21, 0]);
  }
  b.box(wood, [len, 0.09, 0.44], [0, 0.46, 0]);
  b.popMatrix();
}

export function propParasol(b, o, pos, opts = {}) {
  const h = opts.height ?? 2.3;
  const r = opts.radius ?? 1.5;
  const metal = b.mat('metal', { color: '#8d8f92' });
  const cloth = b.mat('stripe', {
    color: '#ffffff',
    map: TT.stripeTexture(opts.a ?? o.awningA ?? '#c8202a', opts.b ?? o.awningB ?? '#f3efe2', 8),
  });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  b.cyl(metal, { r: 0.035, h, seg: 8 }, [0, h / 2, 0]);
  b.cyl(b.mat('stone', { color: o.stone }), { r: 0.2, h: 0.12, seg: 10 }, [0, 0.06, 0]);
  // canopy
  const canopy = new THREE.ConeGeometry(r, r * 0.42, 8, 1, true);
  canopy.translate(0, h + r * 0.1, 0);
  b.add(cloth, canopy, 'parasol_canopy');
  const valance = new THREE.CylinderGeometry(r * 0.99, r * 0.99, 0.14, 8, 1, true);
  valance.translate(0, h - r * 0.11 - 0.05, 0);
  b.add(cloth, valance, 'parasol_valance');
  // ribs
  const apex = V3(0, h + r * 0.3, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tip = V3(Math.sin(a) * r * 0.99, h - r * 0.11, Math.cos(a) * r * 0.99);
    const dir = V3().subVectors(tip, apex);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(0.018, 0.018, len, 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize()));
    const mid = V3().addVectors(apex, tip).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    b.add(metal, g, 'parasol_rib');
  }
  const finial = new THREE.CylinderGeometry(0.02, 0.045, 0.26, 6);
  finial.translate(0, h + r * 0.4, 0);
  b.add(metal, finial, 'parasol_finial');
  b.popMatrix();
}

function stoneLike(b, o) {
  return b.mat('stone', { color: o.stone });
}

/* ------------------------------------------------------------------ */
/* Greenery                                                            */
/* ------------------------------------------------------------------ */

export function propPottedPlant(b, o, pos, opts = {}) {
  const potMat = b.mat('ceramic', { color: opts.potColor || '#4a3a30' });
  const leaf = b.mat('foliage', { color: opts.leafColor || '#3f6b3a' });
  const rng = opts.rng;
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const pr = opts.potRadius ?? 0.22;
  b.cyl(potMat, { rt: pr, rb: pr * 0.78, h: pr * 1.5, seg: 10 }, [0, pr * 0.75, 0]);
  const stemTop = pr * 1.5 + (opts.height ?? 0.9);
  b.cyl(b.mat('wood', { color: '#5b4a34', style: 'bamboo' }), { r: 0.02, h: opts.height ?? 0.9, seg: 5 }, [0, pr * 1.5 + (opts.height ?? 0.9) / 2, 0]);
  const blobs = opts.kind === 'bamboo' ? 6 : 5;
  for (let i = 0; i < blobs; i++) {
    const t = i / blobs;
    const rr = (opts.kind === 'pine' ? 0.34 : 0.24) * (1 - t * 0.55) * (rng ? rng.float(0.85, 1.15) : 1);
    const g = new THREE.SphereGeometry(rr, 7, 6);
    g.scale(1, 0.72, 1);
    g.translate(
      (rng ? rng.float(-0.14, 0.14) : 0) + (opts.kind === 'bamboo' ? rng.float(-0.1, 0.1) : 0),
      stemTop - t * 0.5,
      (rng ? rng.float(-0.14, 0.14) : 0)
    );
    b.add(leaf, g, 'plant_blob');
  }
  b.popMatrix();
}

export function propTree(b, o, pos, opts = {}) {
  const bark = b.mat('wood', { color: opts.barkColor || '#4a3a2c', style: 'walnut' });
  const leaf = b.mat('foliage', { color: opts.leafColor || '#2f5c3a' });
  const rng = opts.rng;
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const h = opts.height ?? 4.5;
  b.cyl(bark, { rt: 0.12, rb: 0.22, h: h * 0.62, seg: 8 }, [0, h * 0.31, 0]);
  const layers = opts.kind === 'pine' ? 3 : 2;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = (opts.spread ?? 1.5) * (1 - t * 0.5);
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.scale(1, 0.66, 1);
    g.translate(
      (rng ? rng.float(-0.2, 0.2) : 0),
      h * 0.62 + i * r * 0.62,
      rng ? rng.float(-0.2, 0.2) : 0
    );
    b.add(leaf, g, 'tree_canopy');
  }
  if (opts.kind === 'pine') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + (rng ? rng.float() : 0);
      const br = new THREE.CylinderGeometry(0.05, 0.07, 1.2, 5);
      br.rotateZ(Math.PI * 0.4);
      br.rotateY(a);
      br.translate(Math.sin(a) * 0.5, h * 0.7, Math.cos(a) * 0.5);
      b.add(bark, br, 'pine_branch');
    }
  }
  b.popMatrix();
}

export function propBambooGrove(b, o, pos, opts = {}) {
  const rng = opts.rng;
  const stalk = b.mat('wood', { color: opts.color || '#9aa85c', style: 'bamboo' });
  const leaf = b.mat('foliage', { color: '#4a7a3a' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const n = opts.count ?? 5;
  for (let i = 0; i < n; i++) {
    const x = (rng ? rng.float(-0.6, 0.6) : (i - n / 2) * 0.22);
    const z = (rng ? rng.float(-0.6, 0.6) : 0);
    const h = (opts.height ?? 4) * (rng ? rng.float(0.75, 1.25) : 1);
    const r = 0.045;
    b.cyl(stalk, { rt: r * 0.8, rb: r, h, seg: 6 }, [x, h / 2, z]);
    const seg = 6;
    for (let s = 1; s < seg; s++) {
      const y = (h * s) / seg;
      b.cyl(b.mat('wood', { color: '#6f7d3a', style: 'bamboo' }), { r: r * 1.15, h: 0.05, seg: 6 }, [x, y, z]);
    }
    for (let l = 0; l < 3; l++) {
      const g = new THREE.SphereGeometry(0.3, 6, 5);
      g.scale(1.5, 0.5, 1);
      g.translate(x + (rng ? rng.float(-0.3, 0.3) : 0), h * (0.6 + l * 0.13), z + (rng ? rng.float(-0.3, 0.3) : 0));
      b.add(leaf, g, 'bamboo_leaf');
    }
  }
  b.popMatrix();
}

/* ------------------------------------------------------------------ */
/* Street clutter                                                      */
/* ------------------------------------------------------------------ */

export function propBicycle(b, o, pos, rotY = 0, opts = {}) {
  const metal = b.mat('metal', { color: opts.color || '#3f434a' });
  const dark = b.mat('rubber', { color: '#1a1a1c' });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  const wheelGeo = (x) => {
    const t = new THREE.TorusGeometry(0.33, 0.028, 5, 14);
    t.rotateY(Math.PI / 2);
    t.translate(x, 0.33, 0);
    return t;
  };
  b.add(dark, wheelGeo(-0.55), 'bike_wheel');
  b.add(dark, wheelGeo(0.55), 'bike_wheel');
  if (opts.detail >= 2) {
    for (const x of [-0.55, 0.55]) {
      const hub = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6);
      hub.rotateZ(Math.PI / 2);
      hub.translate(x, 0.33, 0);
      b.add(metal, hub, 'bike_hub');
    }
  }
  const tube = (a, bb, r = 0.022) => {
    const dir = V3().subVectors(bb, a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize()));
    const mid = V3().addVectors(a, bb).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    b.add(metal, g, 'bike_frame');
  };
  tube(V3(-0.55, 0.33, 0), V3(-0.1, 0.62, 0));
  tube(V3(-0.1, 0.62, 0), V3(0.35, 0.62, 0));
  tube(V3(0.35, 0.62, 0), V3(0.55, 0.33, 0));
  tube(V3(-0.1, 0.62, 0), V3(0.05, 0.33, 0));
  tube(V3(0.05, 0.33, 0), V3(0.55, 0.33, 0));
  tube(V3(0.35, 0.62, 0), V3(0.35, 0.95, 0));
  // handlebar + seat + basket
  b.box(metal, [0.05, 0.05, 0.5], [0.35, 0.96, 0]);
  b.box(dark, [0.22, 0.05, 0.1], [-0.14, 0.86, 0]);
  if (opts.basket !== false) {
    const basket = new THREE.CylinderGeometry(0.16, 0.13, 0.2, 8, 1, true);
    basket.translate(0.42, 0.85, 0);
    b.add(b.mat('metal', { color: '#8a8d92' }), basket, 'bike_basket');
  }
  b.popMatrix();
}

export function propCrates(b, o, pos, rotY = 0, opts = {}) {
  const rng = opts.rng;
  const colors = opts.colors || ['#c8433a', '#2f5c8a', '#c9a227', '#3f6b3a'];
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  const rows = opts.rows ?? 3;
  for (let i = 0; i < rows; i++) {
    const c = colors[i % colors.length];
    const mat = b.mat('plastic', { color: c });
    const size = 0.42;
    b.box(mat, [size, 0.26, size], [rng ? rng.float(-0.04, 0.04) : 0, 0.13 + i * 0.27, rng ? rng.float(-0.03, 0.03) : 0], [0, rng ? rng.float(-0.15, 0.15) : 0, 0]);
  }
  b.popMatrix();
}

export function propBarrel(b, o, pos, rotY = 0, opts = {}) {
  const wood = b.mat('wood', { color: opts.color || '#7a5c3a', style: 'board' });
  const straw = b.mat('thatch', { color: '#d8c89a' });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  const r = opts.radius ?? 0.3;
  b.cyl(wood, { rt: r * 0.9, rb: r * 0.9, h: 0.6, seg: 14 }, [0, 0.3, 0]);
  for (const y of [0.08, 0.3, 0.52]) {
    b.cyl(b.mat('metal', { color: '#6b6b6b' }), { r: r * 0.94, h: 0.04, seg: 14 }, [0, y, 0]);
  }
  if (opts.straw !== false) b.cyl(straw, { r: r * 1.05, h: 0.12, seg: 14 }, [0, 0.64, 0]);
  if (opts.sake) {
    const label = new THREE.PlaneGeometry(0.4, 0.28);
    label.translate(0, 0.34, r * 0.92);
    b.add(b.mat('signBoard', { color: '#ffffff', map: TT.signTexture({ text: '酒', bg: '#f2ead6', fg: '#8a2b22', w: 256, h: 128 }) }), label, 'barrel_label');
  }
  b.popMatrix();
}

export function propCylinder(b, o, pos, rotY = 0, opts = {}) {
  const metal = b.mat('metal', { color: opts.color || '#b8bcc0' });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  const r = 0.16;
  const h = opts.height ?? 0.9;
  b.cyl(metal, { r, h, seg: 10 }, [0, h / 2 + 0.08, 0]);
  b.cyl(b.mat('metal', { color: '#8d9196' }), { r: r * 0.5, h: 0.12, seg: 8 }, [0, h + 0.12, 0]);
  b.cyl(b.mat('metal', { color: '#8d9196' }), { r: r * 0.35, h: 0.06, seg: 8 }, [0, h + 0.2, 0]);
  b.cyl(b.mat('rubber', { color: '#2a2a2c' }), { r: r * 0.95, h: 0.06, seg: 10 }, [0, 0.05, 0]);
  if (opts.hose) {
    const tube = tubeGeo(
      [
        [0, h + 0.2, 0],
        [0.1, h + 0.1, 0.1],
        [0.05, 0.6, 0.2],
        [0.2, 0.2, 0.3],
      ],
      0.03,
      10,
      5
    );
    if (tube) b.add(b.mat('rubber', { color: '#c8433a' }), tube, 'cyl_hose');
  }
  if (opts.cage) {
    b.box(b.mat('metal', { color: '#6d7278' }), [1.3, 1.3, 0.06], [0, 0.65, -0.3]);
    b.box(b.mat('metal', { color: '#6d7278' }), [1.3, 0.06, 0.6], [0, 1.3, 0]);
    for (const x of [-0.6, 0.6]) b.cyl(b.mat('metal', { color: '#6d7278' }), { r: 0.04, h: 1.3, seg: 6 }, [x, 0.65, -0.3]);
  }
  b.popMatrix();
}

export function propABoard(b, o, pos, rotY = 0, opts = {}) {
  const wood = b.mat('wood', { color: opts.frameColor || '#4a3a2c', style: 'board' });
  const poster = TT.posterTexture({
    title: opts.title || '本日のおすすめ',
    lines: opts.lines || ['#天ぷら 850', 'そば 700', '定食 980', '生ビール 550'],
    accent: opts.accent || o.accent || '#b8242a',
    bg: opts.bg || '#f4f1e6',
  });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.66, 0.95, 0.03);
    g.rotateX(s * 0.16);
    g.translate(0, 0.52, s * 0.06);
    b.add(wood, g, 'aboard_frame');
    const p = new THREE.PlaneGeometry(0.56, 0.8);
    p.rotateX(s * 0.16);
    p.translate(0, 0.52, s * (0.06 + 0.03) + s * 0.001 * 0);
    if (s > 0) p.rotateY(Math.PI);
    p.translate(0, 0, s * 0.03);
    b.add(b.mat('poster', { color: '#ffffff', map: poster }), p, 'aboard_poster');
  }
  b.popMatrix();
}

export function propMailbox(b, o, pos, rotY = 0, opts = {}) {
  const metal = b.mat('metal', { color: opts.color || '#c8433a' });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  b.cyl(metal, { r: 0.045, h: 0.85, seg: 8 }, [0, 0.425, 0]);
  b.box(metal, [0.42, 0.5, 0.24], [0, 1.05, 0]);
  b.box(b.mat('darkMetal', { color: '#2c2c2e' }), [0.36, 0.06, 0.02], [0, 1.22, 0.13]);
  b.popMatrix();
}

export function propFireBox(b, o, pos, rotY = 0) {
  const red = b.mat('paint', { color: '#b8242a' });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  b.box(red, [0.5, 0.6, 0.18], [0, 0.3, 0]);
  b.box(b.mat('metal', { color: '#d8d8d8' }), [0.36, 0.05, 0.02], [0, 0.42, 0.1]);
  b.popMatrix();
}

export function propACUnit(b, o, pos, rotY = 0, opts = {}) {
  const body = b.mat('plastic', { color: opts.color || '#dfe2e5' });
  const dark = b.mat('darkMetal', { color: '#4c5054' });
  b.pushPlacement(pos[0], pos[1], pos[2], rotY);
  const w = opts.width ?? 0.78;
  const h = opts.height ?? 0.56;
  const d = opts.depth ?? 0.3;
  b.box(body, [w, h, d], [0, h / 2, 0]);
  const grill = new THREE.CylinderGeometry(h * 0.36, h * 0.36, 0.03, 12);
  grill.rotateX(Math.PI / 2);
  grill.translate(0, h * 0.5, d / 2 + 0.01);
  b.add(dark, grill, 'ac_grill');
  const fan = new THREE.CylinderGeometry(h * 0.3, h * 0.3, 0.02, 8);
  fan.rotateX(Math.PI / 2);
  fan.translate(0, h * 0.5, d / 2 + 0.03);
  b.add(b.mat('metal', { color: '#8f9398' }), fan, 'ac_fan');
  // bracket + drip pipe
  b.box(dark, [w * 0.9, 0.05, 0.05], [0, -0.03, 0]);
  if (opts.pipe !== false) {
    const t = tubeGeo(
      [
        [w * 0.3, -0.02, d * 0.4],
        [w * 0.36, -0.4, d * 0.5],
        [w * 0.3, -1.1, d * 0.55],
        [w * 0.42, -1.6, d * 0.5],
      ],
      0.025,
      10,
      5
    );
    if (t) b.add(b.mat('rubber', { color: '#d8d8d8' }), t, 'ac_pipe');
  }
  b.popMatrix();
}

export function propAntenna(b, o, pos, opts = {}) {
  const metal = b.mat('metal', { color: '#a9adb2' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const h = opts.height ?? 2.4;
  b.cyl(metal, { r: 0.03, h, seg: 6 }, [0, h / 2, 0]);
  const n = opts.elements ?? 5;
  for (let i = 0; i < n; i++) {
    const y = h * 0.45 + (i / n) * h * 0.5;
    const len = 0.9 - i * 0.1;
    b.cyl(metal, { r: 0.012, h: len, seg: 5 }, [0, y, 0], [0, 0, Math.PI / 2]);
  }
  if (opts.dish) {
    const dish = new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.35);
    dish.rotateX(Math.PI * 0.6);
    dish.translate(0.3, h * 0.4, 0.12);
    b.add(b.mat('plastic', { color: '#e6e7e9' }), dish, 'dish');
  }
  b.popMatrix();
}

export function propWaterTank(b, o, pos, opts = {}) {
  const plastic = b.mat('plastic', { color: opts.color || '#d9dde1' });
  const metal = b.mat('metal', { color: '#7d8288' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const r = opts.radius ?? 0.75;
  const h = opts.height ?? 1.5;
  const legs = 4;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.78;
    b.cyl(metal, { r: 0.05, h: 0.9, seg: 6 }, [Math.sin(a) * r * 0.7, 0.45, Math.cos(a) * r * 0.7]);
  }
  b.cyl(plastic, { r, h, seg: 16 }, [0, 0.9 + h / 2, 0]);
  b.cyl(plastic, { rt: r * 0.5, rb: r, h: 0.3, seg: 16 }, [0, 0.9 + h + 0.15, 0]);
  b.popMatrix();
}

export function propSolar(b, o, pos, opts = {}) {
  const frame = b.mat('metal', { color: '#9aa0a6' });
  const panel = b.mat('glass', { color: '#2b3a5c', opacity: 0.8, metalness: 0.5, roughness: 0.15 });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const w = opts.width ?? 1.6;
  const h = opts.height ?? 1.0;
  const g = new THREE.BoxGeometry(w, 0.04, h);
  g.rotateX(-0.22);
  g.translate(0, h * 0.12, 0);
  b.add(frame, g, 'solar_frame');
  const p = new THREE.BoxGeometry(w * 0.94, 0.02, h * 0.92);
  p.rotateX(-0.22);
  p.translate(0, h * 0.12 + 0.03, 0);
  b.add(panel, p, 'solar_panel');
  b.popMatrix();
}

/* ------------------------------------------------------------------ */
/* Awning / noren / banners                                            */
/* ------------------------------------------------------------------ */

export function propAwning(b, o, pos, opts = {}) {
  // Canvas awning sweeping out from a wall. origin at the wall attachment point.
  const w = opts.width ?? 3;
  const out = opts.out ?? 1.3;
  const drop = opts.drop ?? 0.45;
  const a = opts.a ?? o.awningA ?? '#c8202a';
  const bb = opts.b ?? o.awningB ?? '#f3efe2';
  const cloth = b.mat('stripe', { color: '#ffffff', map: TT.stripeTexture(a, bb, Math.max(4, Math.round(w * 1.6))) });
  const metal = b.mat('metal', { color: '#6d7278' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const slope = Math.atan2(drop, out);
  const len = Math.hypot(out, drop);
  const panel = new THREE.BoxGeometry(w, 0.03, len);
  panel.rotateX(-slope);
  panel.translate(0, -drop * 0.5, out * 0.5);
  b.add(cloth, panel, 'awning_panel');
  // valance
  const val = new THREE.BoxGeometry(w, 0.28, 0.03);
  val.translate(0, -drop - 0.14, out);
  b.add(cloth, val, 'awning_valance');
  // ribs
  for (let i = 0; i <= 2; i++) {
    const x = -w / 2 + (i / 2) * w;
    const rib = new THREE.CylinderGeometry(0.02, 0.02, len, 5);
    rib.rotateX(Math.PI / 2 - slope);
    rib.translate(x, -drop * 0.5, out * 0.5);
    b.add(metal, rib, 'awning_rib');
  }
  b.popMatrix();
}

export function propNoren(b, o, pos, opts = {}) {
  // Split curtain over a doorway, built from panels with gaps.
  const w = opts.width ?? 2.1;
  const h = opts.height ?? 0.75;
  const text = opts.text ?? 'そば';
  const bg = opts.bg ?? o.accent ?? '#1e3a5f';
  const mat = b.mat('noren', { color: '#ffffff', map: TT.norenTexture({ text, bg, fg: '#f4efe3', accent: '#f4efe3' }) });
  const metal = b.mat('metal', { color: '#8d9196' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const panels = opts.panels ?? 3;
  const pw = w / panels;
  for (let i = 0; i < panels; i++) {
    const x = -w / 2 + pw * (i + 0.5);
    const ph = h * (i === panels - 1 ? 1 : 0.94);
    const g = new THREE.PlaneGeometry(pw * 0.96, ph, 3, 2);
    const pos0 = g.attributes.position;
    for (let v = 0; v < pos0.count; v++) {
      const u = pos0.getX(v) / (pw * 0.96);
      pos0.setZ(v, Math.sin(u * Math.PI) * 0.03 * ph);
    }
    g.computeVertexNormals();
    g.translate(x, -ph / 2, 0);
    b.add(mat, g, 'noren_panel');
  }
  b.cyl(metal, { r: 0.022, h: w + 0.3, seg: 6 }, [0, 0, 0], [0, 0, Math.PI / 2]);
  b.popMatrix();
}

export function propBanner(b, o, pos, opts = {}) {
  const pole = b.mat('metal', { color: '#8d9196' });
  const text = opts.text ?? '大売出';
  const cloth = b.mat('banner', {
    color: '#ffffff',
    map: TT.bannerTexture({ text, bg: opts.bg ?? '#f2f0e6', fg: opts.fg ?? '#1a1a1a', accent: opts.accent ?? o.accent ?? '#b8242a' }),
  });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const h = opts.height ?? 3.2;
  const bw = opts.width ?? 0.55;
  const bh = opts.bannerHeight ?? 1.8;
  b.cyl(pole, { r: 0.025, h, seg: 6 }, [0, h / 2, 0]);
  const g = new THREE.PlaneGeometry(bw, bh, 4, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) / bw + 0.5) * Math.PI;
    p.setZ(i, Math.sin(u) * 0.05);
  }
  g.computeVertexNormals();
  g.translate(bw * 0.5 + 0.03, h - bh / 2 - 0.12, 0);
  b.add(cloth, g, 'banner_cloth');
  b.box(pole, [0.5, 0.03, 0.03], [0.25, h - 0.1, 0]);
  b.box(pole, [0.5, 0.03, 0.03], [0.25, h - bh - 0.14, 0]);
  b.popMatrix();
}

/* ------------------------------------------------------------------ */
/* Structural / facade details                                         */
/* ------------------------------------------------------------------ */

export function propDougong(b, o, pos, opts = {}) {
  // bracket set under a temple eave
  const wood = b.mat('wood', { color: opts.color || o.accent || '#8f3126', style: o.woodStyle });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const s = opts.scale ?? 1;
  b.box(wood, [0.16 * s, 0.14 * s, 0.7 * s], [0, 0, 0]);
  b.box(wood, [0.9 * s, 0.14 * s, 0.16 * s], [0, 0.16 * s, 0]);
  b.box(wood, [1.15 * s, 0.13 * s, 0.2 * s], [0, 0.34 * s, 0]);
  b.box(wood, [0.2 * s, 0.13 * s, 0.7 * s], [0, 0.48 * s, 0]);
  b.popMatrix();
}

export function propPillar(b, o, pos, opts = {}) {
  const wood = b.mat('wood', { color: opts.color || o.wood, style: o.woodStyle });
  const stone = b.mat('stone', { color: o.stone });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const h = opts.height ?? 3.2;
  const r = opts.radius ?? 0.17;
  b.cyl(stone, { r: r * 1.35, h: 0.2, seg: 10 }, [0, 0.1, 0]);
  b.cyl(wood, { rt: r * 0.9, rb: r, h, seg: 10 }, [0, h / 2 + 0.18, 0]);
  if (opts.lattice) {
    const l = b.mat('wood', { color: opts.latticeColor || o.wood, style: 'board' });
    for (let i = -2; i <= 2; i++) {
      b.box(l, [0.035, h * 0.9, 0.035], [i * 0.13, h * 0.5 + 0.18, r + 0.03]);
    }
    b.box(l, [0.6, 0.05, 0.05], [0, h * 0.95, r + 0.03]);
  }
  b.popMatrix();
}

export function propBeam(b, o, a, bb, opts = {}) {
  const wood = b.mat('wood', { color: opts.color || o.wood, style: o.woodStyle });
  const A = toV3(a);
  const B = toV3(bb);
  const dir = V3().subVectors(B, A);
  const len = dir.length();
  if (len < 0.02) return;
  const w = opts.width ?? 0.18;
  const h = opts.height ?? 0.18;
  const g = new THREE.BoxGeometry(opts.vertical ? h : w, opts.vertical ? len : h, opts.vertical ? w : (opts.depth ?? 0.16));
  if (opts.vertical) g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize()));
  else g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir.clone().normalize()));
  const mid = V3().addVectors(A, B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  b.add(wood, g, 'beam');
}

export function propDownpipe(b, o, pos, opts = {}) {
  const metal = b.mat('metal', { color: opts.color || '#8f9398' });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const h = opts.height ?? 6;
  b.cyl(metal, { r: 0.06, h, seg: 8 }, [0, h / 2, 0]);
  for (let i = 0; i < Math.floor(h / 2); i++) {
    const elbow = new THREE.TorusGeometry(0.09, 0.06, 5, 8, Math.PI * 0.5);
    elbow.rotateY(Math.PI / 2);
    elbow.translate(0, 1.2 + i * 2, 0.02);
    b.add(metal, elbow, 'downpipe_clamp');
  }
  b.popMatrix();
}

export function propGutter(b, o, a, bb, opts = {}) {
  const metal = b.mat('metal', { color: opts.color || '#7d8288' });
  const A = toV3(a);
  const B = toV3(bb);
  const dir = V3().subVectors(B, A);
  const len = dir.length();
  if (len < 0.05) return;
  const g = new THREE.CylinderGeometry(0.09, 0.09, len, 8, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI * 0.5);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(1, 0, 0), dir.clone().normalize()));
  const mid = V3().addVectors(A, B).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  b.add(metal, g, 'gutter');
}

/* ------------------------------------------------------------------ */
/* Boundaries / ground                                                 */
/* ------------------------------------------------------------------ */

export function propBoundaryWall(b, o, a, bb, opts = {}) {
  const stone = b.mat('stone', { color: o.stone });
  const plaster = b.mat('plaster', { color: o.plaster });
  const tile = b.mat('roofTile', { color: o.roof });
  const wood = b.mat('wood', { color: o.wood, style: o.woodStyle });
  const h = opts.height ?? 1.7;
  const A = toV3(a);
  const B = toV3(bb);
  const dir = V3().subVectors(B, A);
  const len = dir.length();
  if (len < 0.05) return;
  const ang = Math.atan2(dir.x, dir.z);
  const mid = V3().addVectors(A, B).multiplyScalar(0.5);
  b.pushPlacement(mid.x, mid.y, mid.z, ang);
  const base = new THREE.BoxGeometry(0.36, Math.min(h, 0.9), len);
  base.translate(0, Math.min(h, 0.9) / 2, 0);
  b.add(stone, base, 'wall_base');
  if (h > 0.9) {
    const upper = new THREE.BoxGeometry(0.3, h - 0.9, len);
    upper.translate(0, 0.9 + (h - 0.9) / 2, 0);
    b.add(opts.plaster ? plaster : stone, upper, 'wall_body');
  }
  // tiled cap
  const cap = new THREE.BoxGeometry(0.5, 0.12, len);
  cap.translate(0, h + 0.06, 0);
  b.add(tile, cap, 'wall_cap');
  const ridge = new THREE.CylinderGeometry(0.06, 0.06, len, 6);
  ridge.rotateX(Math.PI / 2);
  ridge.translate(0, h + 0.14, 0);
  b.add(tile, ridge, 'wall_ridge');
  if (opts.pillars) {
    const n = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const z = -len / 2 + (i / n) * len;
      const p = new THREE.BoxGeometry(0.42, h + 0.2, 0.42);
      p.translate(0, (h + 0.2) / 2, z);
      b.add(wood, p, 'wall_pillar');
    }
  }
  b.popMatrix();
}

export function propSteps(b, o, pos, opts = {}) {
  const stone = b.mat('stone', { color: o.stone });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const w = opts.width ?? 3;
  const steps = opts.steps ?? 3;
  const rise = 0.16;
  const run = 0.32;
  for (let i = 0; i < steps; i++) {
    const g = new THREE.BoxGeometry(w, rise, run * (steps - i));
    g.translate(0, rise * (i + 0.5), run * (steps - i) / 2 - (run * (steps - i)) / 2 + 0);
    g.translate(0, 0, -(run * (steps - i)) / 2 + (run * steps) / 2);
    b.add(stone, g, 'step');
  }
  b.popMatrix();
}

export function propFence(b, o, a, bb, opts = {}) {
  const wood = b.mat('wood', { color: opts.color || o.wood, style: 'board' });
  const h = opts.height ?? 1.2;
  const A = toV3(a);
  const B = toV3(bb);
  const dir = V3().subVectors(B, A);
  const len = dir.length();
  if (len < 0.05) return;
  const ang = Math.atan2(dir.x, dir.z);
  const mid = V3().addVectors(A, B).multiplyScalar(0.5);
  b.pushPlacement(mid.x, mid.y, mid.z, ang);
  const n = Math.max(2, Math.round(len / 0.22));
  const boards = [];
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i / n) * len;
    const g = new THREE.BoxGeometry(0.05, h, 0.14);
    g.translate(0, h / 2, z);
    boards.push(g);
  }
  const m = mergeList(boards);
  if (m) b.add(wood, m, 'fence_boards');
  for (const y of [h * 0.25, h * 0.8]) {
    const g = new THREE.BoxGeometry(0.09, 0.09, len);
    g.translate(0, y, 0);
    b.add(wood, g, 'fence_rail');
  }
  b.popMatrix();
}

export function propTorii(b, o, pos, opts = {}) {
  const color = opts.color || '#b4342a';
  const mat = b.mat('paint', { color, roughness: 0.75 });
  const stone = b.mat('stone', { color: o.stone });
  b.pushPlacement(pos[0], pos[1], pos[2], opts.rotY || 0);
  const w = opts.width ?? 4.2;
  const h = opts.height ?? 4.6;
  for (const sx of [-1, 1]) {
    b.cyl(stone, { r: 0.34, h: 0.3, seg: 12 }, [sx * w * 0.42, 0.15, 0]);
    b.cyl(mat, { rt: 0.2, rb: 0.26, h, seg: 12 }, [sx * w * 0.42, h / 2 + 0.2, 0]);
  }
  const kasagi = new THREE.BoxGeometry(w * 1.14, 0.26, 0.5);
  kasagi.translate(0, h + 0.55, 0);
  b.add(mat, kasagi, 'torii_kasagi');
  const shimaki = new THREE.BoxGeometry(w * 1.04, 0.2, 0.34);
  shimaki.translate(0, h + 0.28, 0);
  b.add(mat, shimaki, 'torii_shimaki');
  const nuki = new THREE.BoxGeometry(w * 0.98, 0.26, 0.28);
  nuki.translate(0, h - 0.6, 0);
  b.add(mat, nuki, 'torii_nuki');
  const gaku = new THREE.BoxGeometry(0.5, 0.6, 0.16);
  gaku.translate(0, h - 0.2, 0);
  b.add(b.mat('signBoard', { color: '#ffffff', map: TT.signTexture({ text: opts.text || '神社', bg: '#f0e6cf', fg: '#2a2118', vertical: true, w: 128, h: 256 }) }), gaku, 'torii_plaque');
  b.popMatrix();
}

/** Paper sign strips / tanzaku hung along a line. */
export function propTanzaku(b, o, a, bb, opts = {}) {
  const rng = opts.rng;
  const colors = opts.colors || ['#f2e6c8', '#e8b4b8', '#b8d8e8', '#d8e8b8', '#f0d8a8'];
  const kinds = ['願', '福', '寿', '縁', '笑', '夢', '春', '花'];
  const n = opts.count ?? 10;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const c = colors[i % colors.length];
    const x = a[0] + (bb[0] - a[0]) * t;
    const y = a[1] + (bb[1] - a[1]) * t - 0.25;
    const z = a[2] + (bb[2] - a[2]) * t;
    const g = new THREE.PlaneGeometry(0.16, 0.42);
    g.translate(x, y - 0.21, z);
    b.add(
      b.mat('paper', { color: c, map: TT.signTexture({ text: kinds[i % kinds.length], bg: c, fg: '#2a241c', vertical: true, w: 96, h: 256 }), side: THREE.DoubleSide }),
      g,
      'tanzaku'
    );
  }
  const rope = tubeGeo(sagPoints(a, bb, 0.2, 12), 0.008, 12, 4);
  if (rope) b.add(b.mat('rubber', { color: '#241f1a' }), rope, 'tanzaku_rope');
}

export { V3 };
