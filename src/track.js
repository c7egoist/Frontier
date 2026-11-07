import * as THREE from 'three';
import { CFG } from './config.js';
import { sweepGeom, boxGeom, GeoBatch, mulberry32 } from './utils.js';

const FLOOR_EPS = 0.028;

const NEON = [
  [0.22, 1.75, 2.3],
  [2.1, 0.28, 1.75],
  [1.05, 2.1, 0.22],
  [2.3, 1.0, 0.14],
  [1.7, 1.9, 2.3],
];

function paint(geom, c) {
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2];
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geom;
}

function quadGeom(a, b, c, d) {
  const pos = new Float32Array([...a, ...b, ...c, ...d]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function rampGeom(path, s0, s1, x, w, h) {
  const f0 = path.frameAt(s0);
  const f1 = path.frameAt(s1);
  const y0 = f0.y + x * f0.bank;
  const y1 = f1.y + x * f1.bank;
  const P = (f, lat, y) => [f.x + f.rx * lat, y, f.z + f.rz * lat];
  const hl = w / 2;
  const a0 = P(f0, x - hl, y0), a1 = P(f0, x + hl, y0);
  const b0 = P(f1, x - hl, y1 + h), b1 = P(f1, x + hl, y1 + h);
  const c0 = P(f1, x - hl, y1), c1 = P(f1, x + hl, y1);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([
    ...a0, ...a1, ...b1, ...b0, ...c0, ...c1,
  ]);
  const uv = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex([
    0, 1, 2, 0, 2, 3,     // ramp surface
    3, 2, 5, 3, 5, 4,     // lip
    0, 3, 4,              // left cheek
    1, 5, 2,              // right cheek
  ]);
  g.computeVertexNormals();
  return { geom: g, a0, a1, b0, b1 };
}

export class TrackBuilder {
  constructor(scene, path, mats) {
    this.scene = scene;
    this.path = path;
    this.mats = mats;
    this.coinGeom = new THREE.TorusGeometry(0.62, 0.17, 8, 18);
    this.coinGeom.rotateY(Math.PI / 2); // face along the path
    this.droneGeom = new THREE.BoxGeometry(1.7, 1.0, 1.7);
    this.droneMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.1, 0.09, 0.16), metalness: 0.9, roughness: 0.3,
      emissive: new THREE.Color(1.4, 0.15, 0.35), emissiveIntensity: 1.2,
    });
  }

  build(seg, spec, prev) {
    const rng = mulberry32((spec.seed || 1) * 2654435761 % 4294967296);
    const batch = new GeoBatch();
    const out = { obstacles: [], coins: [], ramps: [], rails: [], pads: [], drones: [] };
    const ctx = { seg, spec, batch, out, rng, path: this.path, mats: this.mats };

    this.deck(ctx);
    if (spec.style === 'tunnel') this.tunnel(ctx);
    else if (spec.style === 'park') this.park(ctx);
    else if (spec.style === 'bridge') this.bridge(ctx);
    else this.street(ctx);

    this.features(ctx);

    // The city for the previous street segment is placed now, once the road that
    // follows it exists: that lets every tower be clearance-checked against the
    // actual track (including the 90 degree corner that eats into the block).
    const wantsCity = (st) => st === 'street' || st === 'park';
    if (!prev) {
      if (wantsCity(spec.style)) this.city(seg, spec, batch, seg.s0, seg.s1);
    } else if (wantsCity(prev.spec.style)) {
      this.city(prev.seg, prev.spec, batch, prev.seg.s0 - 30, seg.s1);
    }

    const group = batch.build(this.mats);
    group.matrixAutoUpdate = false;
    group.updateMatrix();
    this.scene.add(group);
    return { group, ...out };
  }

  /* ---------------------------------------------------------------- deck */
  deck(ctx) {
    const { path, seg, batch } = ctx;
    const hw = CFG.halfWidth;
    const s0 = seg.s0 + 0.01;
    const s1 = seg.s1 - 0.01;
    const step = seg.type === 'turn' ? 2.2 : 4;

    batch.add('deck', sweepGeom(path, s0, s1, [[-hw, 0], [0, 0], [hw, 0]], { step, uScale: 9, vScale: 5 }));
    batch.add('route', sweepGeom(path, s0, s1, [[-2.3, 0.035], [2.3, 0.035]], { step: 4, uScale: 9, vScale: 4 }));

    // side walls + glowing caps
    for (const side of [-1, 1]) {
      const lat = side * hw;
      batch.add('wall', sweepGeom(path, s0, s1, [[lat, 0], [lat, CFG.wallHeight]], { step: 3 }));
      batch.add(side < 0 ? 'neonC' : 'neonM', sweepGeom(path, s0, s1,
        [[lat - side * 0.55, CFG.wallHeight - 0.02], [lat + side * 0.06, CFG.wallHeight]], { step: 3 }));
      batch.add(side < 0 ? 'neonC' : 'neonM', sweepGeom(path, s0, s1,
        [[lat + side * 0.16, 0.06], [lat + side * 0.52, 0.06]], { step: 3 }));
      // skirt below
      batch.add('steel', sweepGeom(path, s0, s1, [[lat, -0.02], [lat, -2.8]], { step: 4 }));
      batch.add(side < 0 ? 'neonC' : 'neonM', sweepGeom(path, s0, s1,
        [[lat + side * 0.02, -2.1], [lat + side * 0.02, -2.55]], { step: 4 }));
    }
  }

  /* -------------------------------------------------------------- street */
  street(ctx) {
    const { path, seg, batch, rng } = ctx;

    // floating holo billboards hanging beside the road
    const bb = 1 + ((rng() * 3) | 0);
    for (let i = 0; i < bb; i++) {
      const sPos = seg.s0 + seg.len * (0.18 + rng() * 0.6);
      const f = path.frameAt(sPos);
      const side = rng() < 0.5 ? -1 : 1;
      const lat = side * (15 + rng() * 8);
      const w = 3 + rng() * 5;
      const h = 5 + rng() * 8;
      const y = f.y + 7 + rng() * 9;
      const px = f.x + f.rx * lat;
      const pz = f.z + f.rz * lat;
      const neon = NEON[(rng() * NEON.length) | 0];
      batch.add('signs', paint(boxGeom(0.35, h, w, px, y, pz, f.yaw), neon));
      // frame
      batch.add('steel', boxGeom(0.5, h + 1.2, 0.6, px, y, pz - w / 2 - 0.3, f.yaw));
      batch.add('steel', boxGeom(0.5, h + 1.2, 0.6, px, y, pz + w / 2 + 0.3, f.yaw));
    }

    // portal gantry over the track
    if (rng() < 0.55) {
      const s = seg.s0 + seg.len * (0.25 + rng() * 0.5);
      const f = path.frameAt(s);
      const hw = CFG.halfWidth;
      for (const side of [-1, 1]) {
        const lat = side * (hw + 1.4);
        batch.add('steel', boxGeom(1.2, 11, 1.2, f.x + f.rx * lat, f.y + 5.5, f.z + f.rz * lat, f.yaw));
      }
      batch.add('steel', boxGeom(2.0, 1.1, 2.0, f.x, f.y + 10.6, f.z, f.yaw));
      const beam = sweepGeom(path, Math.max(seg.s0, s - 1.2), Math.min(seg.s1, s + 1.2),
        [[-hw - 1.4, 9.2], [hw + 1.4, 9.2]], { step: 1.2 });
      batch.add('steel', beam);
      const glow = sweepGeom(path, Math.max(seg.s0, s - 0.22), Math.min(seg.s1, s + 0.22),
        [[-hw - 1.4, 9.75], [hw + 1.4, 9.75]], { step: 0.3 });
      batch.add(rng() < 0.5 ? 'neonC' : 'neonM', glow);
    }

    // overhead bridge crossing the canyon
    if (rng() < 0.42) {
      const s = seg.s0 + seg.len * (0.2 + rng() * 0.6);
      const f = path.frameAt(s);
      const y = f.y + 15 + rng() * 8;
      const span = 96;
      batch.add('steel', boxGeom(span, 1.8, 7 + rng() * 5, f.x, y, f.z, f.yaw));
      batch.add('steel', boxGeom(span, 2.6, 0.9, f.x, y + 1.4, f.z, f.yaw));
      for (const o of [-0.34, 0, 0.34]) {
        batch.add('signs', paint(boxGeom(span * 0.28, 0.5, 0.5,
          f.x + f.rx * (o * span), y - 1.15, f.z + f.rz * (o * span), f.yaw), NEON[(rng() * NEON.length) | 0]));
      }
      for (const side of [-1, 1]) {
        const lat = side * (CFG.halfWidth + 8);
        batch.add('steel', boxGeom(2.2, 70, 2.2, f.x + f.rx * lat, y - 35, f.z + f.rz * lat, f.yaw));
        batch.add('signs', paint(boxGeom(0.5, 26, 0.5, f.x + f.rx * lat, y - 16, f.z + f.rz * lat, f.yaw), NEON[1]));
      }
    }
  }

  /* -------------------------------------------------------------- tunnel */
  tunnel(ctx) {
    const { path, seg, batch, rng } = ctx;
    const hw = CFG.halfWidth;
    const R = hw + 2.6;
    const profile = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const a = (Math.PI * i) / N;
      profile.push([-Math.cos(a) * R, Math.sin(a) * R * 0.78, i / N]);
    }
    const s0 = seg.s0, s1 = seg.s1;
    batch.add('tunnel', sweepGeom(path, s0, s1, profile, { step: 3.5 }));
    // inner rails of light
    for (const side of [-1, 1]) {
      batch.add(side < 0 ? 'neonC' : 'neonM', sweepGeom(path, s0, s1,
        [[side * (hw + 0.35), 2.1], [side * (hw + 0.35), 2.65]], { step: 3.5 }));
    }
    // light rings
    const gap = 13;
    for (let s = s0 + 6; s < s1 - 4; s += gap) {
      const ring = profile.map((p) => [p[0] * 0.965, p[1] * 0.965, p[2]]);
      batch.add(rng() < 0.72 ? 'neonC' : 'neonM', sweepGeom(path, s, s + 0.7, ring, { step: 0.8 }));
    }
    // portal mouths
    for (const [ps, dir] of [[s0 + 1.5, 1], [s1 - 1.5, -1]]) {
      const ring = profile.map((p) => [p[0] * 1.02, p[1] * 1.02 + 0.1, p[2]]);
      batch.add('neonW', sweepGeom(path, ps - 1.4, ps + 1.4, ring, { step: 1.2 }));
      void ps; void dir;
    }
    // hazard kerbs
    for (const side of [-1, 1]) {
      batch.add(side < 0 ? 'neonC' : 'neonM', sweepGeom(path, s0, s1,
        [[side * (hw - 1.35), 0.06], [side * (hw - 0.25), 0.06]], { step: 6 }));
    }
  }

  /* ---------------------------------------------------------------- park */
  park(ctx) {
    const { path, seg, batch, rng } = ctx;
    const hw = CFG.halfWidth;
    const s0 = seg.s0, s1 = seg.s1;

    // quarter pipes either side
    for (const side of [-1, 1]) {
      const prof = [];
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const a = (t * Math.PI) / 2;
        prof.push([side * ((hw - 3.2) + Math.sin(a) * 3.2), (1 - Math.cos(a)) * 4.5, t]);
      }
      batch.add('plaza', sweepGeom(path, s0, s1, prof, { step: 3.5 }));
      // coping glow
      const cop = prof[prof.length - 1];
      batch.add(side < 0 ? 'neonC' : 'neonM', sweepGeom(path, s0, s1,
        [[cop[0] - side * 0.35, cop[1] + 0.04], [cop[0], cop[1] + 0.06]], { step: 3.5 }));
    }

    // a couple of decorative spines / hips
    const k = 1 + Math.round(rng() * 2);
    for (let i = 0; i < k; i++) {
      const s = s0 + seg.len * (0.2 + rng() * 0.6);
      const f = path.frameAt(s);
      const lat = (rng() < 0.5 ? -1 : 1) * (3 + rng() * 3);
      const w = 5 + rng() * 4;
      batch.add('park', boxGeom(w, 1.5, 16 + rng() * 12, f.x + f.rx * lat, f.y + 0.7, f.z + f.rz * lat, f.yaw));
      batch.add('signs', paint(boxGeom(w * 0.9, 0.28, 16 + rng() * 12, f.x + f.rx * lat, f.y + 1.5, f.z + f.rz * lat, f.yaw), NEON[(rng() * NEON.length) | 0]));
    }

    // lit skate-plaza floor over the asphalt
    batch.add('plaza', sweepGeom(path, s0 + 0.02, s1 - 0.02, [[-hw + 0.75, FLOOR_EPS], [hw - 0.75, FLOOR_EPS]], { step: 4, uScale: 12, vScale: 6 }));
    // painted centre spine marking
    batch.add('neonL', sweepGeom(path, s0, s1, [[-0.28, FLOOR_EPS + 0.02], [0.28, FLOOR_EPS + 0.02]], { step: 5 }));

    // ground-standing light walls flanking the plaza
    for (let i = 0; i < 3; i++) {
      const sPos = s0 + seg.len * (0.12 + i * 0.32);
      const f = path.frameAt(sPos);
      for (const side of [-1, 1]) {
        const h = 6 + rng() * 6;
        batch.add('signs', paint(boxGeom(0.45, h, 9 + rng() * 9,
          f.x + f.rx * side * (hw + 3.4), f.y + h / 2 - 1.6,
          f.z + f.rz * side * (hw + 3.4), f.yaw), NEON[(rng() * NEON.length) | 0]));
        batch.add('steel', boxGeom(0.9, 1.4, 9,
          f.x + f.rx * side * (hw + 3.4), f.y - 1.2, f.z + f.rz * side * (hw + 3.4), f.yaw));
      }
    }
  }

  /* -------------------------------------------------------------- bridge */
  bridge(ctx) {
    const { path, seg, batch, rng } = ctx;
    const hw = CFG.halfWidth;
    const n = Math.max(2, Math.round(seg.len / 30));
    for (let i = 0; i <= n; i++) {
      const s = seg.s0 + (i * seg.len) / n;
      const f = path.frameAt(s);
      for (const side of [-1, 1]) {
        const lat = side * (hw + 0.9);
        const px = f.x + f.rx * lat;
        const pz = f.z + f.rz * lat;
        batch.add('steel', boxGeom(1.8, 62, 1.8, px, f.y - 31, pz, f.yaw));
        batch.add('signs', paint(boxGeom(0.55, 22, 0.55, px, f.y - 13, pz, f.yaw), side < 0 ? NEON[0] : NEON[1]));
        // cross brace
        batch.add('steel', boxGeom(1.1, 1.1, 9, px, f.y - 9, pz, f.yaw + Math.PI / 2));
      }
      if (i < n && rng() < 0.5) {
        // suspended arch over the deck
        const lat0 = -(hw + 3), lat1 = hw + 3;
        const f2 = path.frameAt(s);
        const a = sweepGeom(path, s, Math.min(seg.s1, s + 3), [[lat0, 10], [0, 15.5], [lat1, 10]], { step: 1.5 });
        batch.add('steel', a);
        const b = sweepGeom(path, s, Math.min(seg.s1, s + 3.2), [[lat0, 9.7], [0, 15.3], [lat1, 9.7]], { step: 1.5 });
        batch.add(rng() < 0.5 ? 'neonC' : 'neonM', b);
        void f2;
      }
    }
    // distant skyline
    for (let i = 0; i < 8; i++) {
      const s = seg.s0 + rng() * seg.len;
      const f = path.frameAt(s);
      const side = rng() < 0.5 ? -1 : 1;
      const lat = side * (110 + rng() * 220);
      const h = 60 + rng() * 190;
      batch.add('building', boxGeom(24 + rng() * 30, h, 24 + rng() * 30,
        f.x + f.rx * lat, -46 + h / 2, f.z + f.rz * lat, rng() * Math.PI, 12));
    }
  }

  /* ---------------------------------------------------------------- city */
  city(seg, spec, batch, sFrom, sTo) {
    const path = this.path;
    const rng = mulberry32(((spec.seed || 1) * 1103515245 + 12345) % 4294967296);
    const n = Math.max(3, Math.round(seg.len / 24));

    // sample the road we must keep clear of
    const samples = [];
    const step = 3.5;
    for (let s = Math.max(0, sFrom - 40); s <= sTo + 4; s += step) {
      const f = path.frameAt(s);
      const fx = path.frameAt(Math.min(s + 2, sTo + 4));
      samples.push(f.x, f.z, fx.x, fx.z);
    }

    const clearOfRoad = (x, z, radius) => {
      const r2 = (radius + 15) * (radius + 15);
      for (let i = 0; i < samples.length; i += 4) {
        const dx = samples[i] - x, dz = samples[i + 1] - z;
        if (dx * dx + dz * dz < r2) return false;
        const ex = samples[i + 2] - x, ez = samples[i + 3] - z;
        if (ex * ex + ez * ez < r2) return false;
      }
      return true;
    };

    for (let i = 0; i < n; i++) {
      const s = seg.s0 + (i + 0.5) * (seg.len / n);
      const f = path.frameAt(s);
      for (const side of [-1, 1]) {
        const layers = spec.style === 'park'
          ? [{ d0: 74, d1: 130, h0: 40, h1: 130 }]
          : [
            { d0: 38, d1: 58, h0: 14, h1: 40 },
            { d0: 72, d1: 132, h0: 46, h1: 148 },
          ];
        for (const L of layers) {
          if (rng() < 0.14) continue;
          const dist = L.d0 + rng() * (L.d1 - L.d0);
          const lat = side * dist;
          const w = 11 + rng() * 20;
          const d = 11 + rng() * 20;
          const h = L.h0 + rng() * (L.h1 - L.h0);
          const x = f.x + f.rx * lat;
          const z = f.z + f.rz * lat;
          if (!clearOfRoad(x, z, Math.max(w, d) * 0.5)) continue;

          const base = -42;
          batch.add('building', boxGeom(w, h, d, x, base + h / 2, z, rng() * Math.PI, 8));

          if (rng() < 0.45) {
            batch.add('signs', paint(boxGeom(0.7, 2.4 + rng() * 4, 0.7, x, base + h + 1.4, z), NEON[(rng() * NEON.length) | 0]));
          }
          if (rng() < 0.72) {
            const sh = 2.5 + rng() * 10;
            const sw = 1.0 + rng() * 2.6;
            const inner = dist - w / 2 - 0.6;
            const sx = f.x + f.rx * (side * inner);
            const sz = f.z + f.rz * (side * inner);
            const y = base + 24 + rng() * Math.max(6, h - 34);
            batch.add('signs', paint(boxGeom(0.45, sh, sw, sx, y, sz, f.yaw), NEON[(rng() * NEON.length) | 0]));
          }
          if (rng() < 0.35) {
            const inner = dist - w / 2 - 0.5;
            const bx = f.x + f.rx * (side * inner);
            const bz = f.z + f.rz * (side * inner);
            batch.add('signs', paint(boxGeom(0.4, 0.4, 6 + rng() * 12, bx, base + 14 + rng() * Math.max(6, h - 20), bz, f.yaw), NEON[(rng() * NEON.length) | 0]));
          }
        }
      }
    }
  }

  /* ------------------------------------------------------------ features */
  features(ctx) {
    const { path, seg, batch, out, spec, rng } = ctx;
    const hw = CFG.halfWidth;

    for (const ft of spec.features || []) {
      const s = seg.s0 + (seg.s1 - seg.s0) * ft.u;

      if (ft.kind === 'ramp') {
        const len = 9 + rng() * 3;
        const h = 2.2 + rng() * 1.5;
        const w = 5.6;
        const s0 = s, s1 = s + len;
        const { geom, a0, a1, b0, b1 } = rampGeom(path, s0, s1, ft.x, w, h);
        batch.add('park', geom);
        // glowing rails on the ramp edges
        batch.add('neonL', quadGeom(a0, b0, [b0[0], b0[1] + 0.12, b0[2]], [a0[0], a0[1] + 0.12, a0[2]]));
        batch.add('neonC', quadGeom(a1, b1, [b1[0], b1[1] + 0.12, b1[2]], [a1[0], a1[1] + 0.12, a1[2]]));
        out.ramps.push({ s0, s1, x: ft.x, w, h });
      }

      if (ft.kind === 'rail') {
        const s1 = s + ft.length;
        const x = ft.x;
        const top = 1.55;
        batch.add('steel', sweepGeom(path, s, s1, [[x - 0.16, top], [x + 0.16, top]], { step: 3 }));
        batch.add('neonL', sweepGeom(path, s, s1, [[x - 0.1, top + 0.05], [x + 0.1, top + 0.05]], { step: 3 }));
        for (let ss = s; ss < s1; ss += 7) {
          const f = path.frameAt(ss);
          batch.add('steel', boxGeom(0.22, top, 0.22, f.x + f.rx * x, f.y + top / 2 + x * f.bank, f.z + f.rz * x, f.yaw));
        }
        out.rails.push({ s0: s, s1, x, h: top });
      }

      if (ft.kind === 'pad') {
        const s1 = s + 7;
        batch.add('pad', sweepGeom(path, s, s1, [[ft.x - 2.4, 0.07], [ft.x + 2.4, 0.07]], { step: 1.5, uScale: 3.5, vScale: 1 }));
        out.pads.push({ s0: s, s1, x: ft.x });
      }

      if (ft.kind === 'obstacle') {
        const type = ft.type;
        const x = ft.x;
        const f = path.frameAt(s);
        const baseY = f.y + x * f.bank;
        if (type === 'barrier') {
          batch.add('hazard', boxGeom(4.2, 2.3, 1.2, f.x + f.rx * x, baseY + 1.15, f.z + f.rz * x, f.yaw));
          batch.add('neonA', boxGeom(4.35, 0.18, 1.35, f.x + f.rx * x, baseY + 2.34, f.z + f.rz * x, f.yaw));
          out.obstacles.push({ s, x, w: 4.2, d: 1.4, y0: 0, y1: 2.3, type });
        } else if (type === 'gate') {
          for (const o of [-1, 1]) {
            batch.add('steel', boxGeom(0.45, 2.9, 0.45, f.x + f.rx * (x + o * 2.5), baseY + 1.45, f.z + f.rz * (x + o * 2.5), f.yaw));
          }
          batch.add('signs', paint(boxGeom(5.4, 1.05, 0.75, f.x + f.rx * x, baseY + 2.1, f.z + f.rz * x, f.yaw), NEON[3]));
          batch.add('neonA', boxGeom(5.3, 0.12, 0.85, f.x + f.rx * x, baseY + 1.6, f.z + f.rz * x, f.yaw));
          out.obstacles.push({ s, x, w: 5.0, d: 1.2, y0: 1.5, y1: 2.7, type });
        } else if (type === 'lowbar') {
          batch.add('hazard', boxGeom(4.6, 0.9, 0.85, f.x + f.rx * x, baseY + 0.45, f.z + f.rz * x, f.yaw));
          batch.add('neonM', boxGeom(4.7, 0.14, 0.95, f.x + f.rx * x, baseY + 0.92, f.z + f.rz * x, f.yaw));
          out.obstacles.push({ s, x, w: 4.6, d: 1.1, y0: 0, y1: 0.98, type });
        } else if (type === 'block') {
          batch.add('hazard', boxGeom(4.4, 4.4, 2.4, f.x + f.rx * x, baseY + 2.2, f.z + f.rz * x, f.yaw));
          batch.add('signs', paint(boxGeom(4.5, 0.3, 2.5, f.x + f.rx * x, baseY + 4.45, f.z + f.rz * x, f.yaw), NEON[(rng() * NEON.length) | 0]));
          out.obstacles.push({ s, x, w: 4.4, d: 2.6, y0: 0, y1: 4.4, type });
        } else if (type === 'drone') {
          const mesh = new THREE.Mesh(this.droneGeom, this.droneMat);
          const fw = path.frameAt(s);
          mesh.position.set(fw.x + fw.rx * x, fw.y + 1.5, fw.z + fw.rz * x);
          mesh.rotation.y = fw.yaw;
          const glow = new THREE.Mesh(this.coinGeom, this.mats.neonM);
          glow.scale.set(1.4, 1.4, 1.4);
          mesh.add(glow);
          out.drones.push({ s, x, baseX: x, amp: 3 + rng() * 3, phase: rng() * 6.28, speed: 0.8 + rng() * 0.9, mesh, w: 2.0, d: 1.6, y0: 0, y2: 3.0 });
        }
      }

      if (ft.kind === 'coins') {
        const count = ft.count;
        for (let i = 0; i < count; i++) {
          const cs = s + i * ft.gap;
          const f = path.frameAt(cs);
          let cx = ft.x;
          let cy = 1.35;
          if (ft.arc) {
            const t = i / Math.max(1, count - 1);
            cy = 1.35 + Math.sin(t * Math.PI) * ft.arc;
            cx = ft.x + (ft.arcSpread || 0) * (t - 0.5);
          }
          const px = f.x + f.rx * cx;
          const py = f.y + cx * f.bank + cy;
          const pz = f.z + f.rz * cx;
          out.coins.push({ s: cs, x: cx, h: cy, px, py, pz });
        }
      }
    }
    void hw;
  }
}
