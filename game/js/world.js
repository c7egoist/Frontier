// Visual world: road surface, neon edges, lane markings, boost pads, start band,
// viaduct skirts, sky dome, stars, moon, ground grid and city blocks.

import * as THREE from 'three';
import { CFG } from './config.js';

export const GROUND_Y = -12;
const HW = CFG.ROAD_HALF_W;

export function laneX(j) {
  return (j - (CFG.LANES - 1) / 2) * CFG.LANE_W;
}

// Place obj at track coordinates (s, x, h) with no rotation.
export function placeOnTrack(obj, track, s, x, h) {
  const p = track.worldPoint(s, x, h, [0, 0, 0]);
  obj.position.set(p[0], p[1], p[2]);
  return obj;
}

// Orient obj so its local XY plane lies on the road (local +Z = road up, local +Y = forward).
export function orientOnRoad(obj, f) {
  const R = new THREE.Vector3(...f.r);
  const T = new THREE.Vector3(...f.t);
  const U = new THREE.Vector3(...f.u);
  const m = new THREE.Matrix4().makeBasis(R, T, U);
  obj.quaternion.setFromRotationMatrix(m);
  return obj;
}

// Build a quad strip that follows the road between s0 and s1, from lateral xL to xR.
// lift raises it above the surface to avoid z-fighting. uvMode: 'lane' maps u across and v along.
export function roadStrip(track, s0, s1, xL, xR, lift, uvLen = 8) {
  const step = track.ds * 2;
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const pos = [], uv = [], idx = [];
  const f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
  for (let i = 0; i <= n; i++) {
    const s = s0 + (s1 - s0) * (i / n);
    track.frame(s, f);
    for (const [k, x] of [[0, xL], [1, xR]]) {
      pos.push(
        f.p[0] + f.r[0] * x + f.u[0] * lift,
        f.p[1] + f.r[1] * x + f.u[1] * lift,
        f.p[2] + f.r[2] * x + f.u[2] * lift,
      );
      uv.push(k, (s - s0) / uvLen);
    }
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function chevronTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.lineWidth = 16;
    g.strokeStyle = '#ffffff';
    for (let k = 0; k < 3; k++) {
      const y0 = 40 + k * 70;
      g.beginPath();
      g.moveTo(14, y0 + 40);
      g.lineTo(w / 2, y0);
      g.lineTo(w - 14, y0 + 40);
      g.stroke();
    }
  });
}

function checkerTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x + y) % 2 ? '#f2f5ff' : '#080a12';
      g.fillRect(x * (w / 8), y * (h / 2), w / 8, h / 2);
    }
  });
}

function gridTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#070912';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,200,255,0.55)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  }, [1, 1]);
}

function skirtTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0a0d18';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = 'rgba(255,60,190,0.8)';
      g.fillRect(0, y, w, 4);
    }
    for (let x = 0; x < w; x += 128) {
      g.fillStyle = 'rgba(60,220,255,0.35)';
      g.fillRect(x, 0, 3, h);
    }
  }, [2, 1]);
}

function windowTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    const cols = 8, rows = 16;
    const cw = w / cols, rh = h / rows;
    const palette = ['#33e6ff', '#ff3fa4', '#ffd23f', '#7ff9ff', '#b36bff'];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.42) {
        g.fillStyle = palette[(Math.random() * palette.length) | 0];
        g.globalAlpha = 0.35 + Math.random() * 0.65;
        g.fillRect(c * cw + cw * 0.22, r * rh + rh * 0.25, cw * 0.56, rh * 0.45);
      }
    }
    g.globalAlpha = 1;
  });
}

export class World {
  constructor(scene, track, { seed = 1 } = {}) {
    this.scene = scene;
    this.track = track;
    this.rng = mulberry32(seed);
    this.animated = [];
    this._buildSky(scene);
    this._buildGround(scene);
    this._buildRoad(scene);
    this._buildPads(scene);
    this._buildCity(scene);
    this._buildLights(scene);
  }

  _buildSky(scene) {
    const geo = new THREE.SphereGeometry(4000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 top = vec3(0.012, 0.015, 0.06);
          vec3 mid = vec3(0.10, 0.04, 0.22);
          vec3 hor = vec3(0.45, 0.10, 0.45);
          vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, top, smoothstep(0.2, 0.9, h));
          float glow = exp(-abs(vDir.y) * 14.0);
          c += vec3(0.1, 0.5, 0.8) * glow * 0.35;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    scene.add(new THREE.Mesh(geo, mat));

    // Stars
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = this.rng() * Math.PI * 2;
      const ph = Math.acos(this.rng() * 0.95 + 0.05);
      const r = 3800;
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfe9ff, size: 6, sizeAttenuation: false, fog: false }));
    scene.add(stars);

    // Moon
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(160, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfe6ff).multiplyScalar(1.6), fog: false, toneMapped: false }),
    );
    moon.position.set(-1800, 1200, -2600);
    moon.lookAt(0, 0, 0);
    scene.add(moon);
  }

  _buildGround(scene) {
    const tex = gridTexture();
    tex.repeat.set(400, 400);
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({ map: tex, color: 0x0a0d1c, roughness: 0.55, metalness: 0.4 }),
    );
    g.rotation.x = -Math.PI / 2;
    g.position.y = GROUND_Y;
    scene.add(g);
  }

  _buildRoad(scene) {
    const track = this.track;
    const M = track.M;
    const P = track.P, R = track.R, U = track.U;
    const pos = [], nrm = [], idx = [];
    const lift = 0.03;
    for (let i = 0; i <= M; i++) {
      const k = i % M;
      for (const x of [-HW, HW]) {
        pos.push(
          P[k * 3] + R[k * 3] * x + U[k * 3] * lift,
          P[k * 3 + 1] + R[k * 3 + 1] * x + U[k * 3 + 1] * lift,
          P[k * 3 + 2] + R[k * 3 + 2] * x + U[k * 3 + 2] * lift,
        );
        nrm.push(U[k * 3], U[k * 3 + 1], U[k * 3 + 2]);
      }
      if (i < M) {
        const a = i * 2, b = ((i + 1) % (M + 1)) * 2;
        // with i==M-1 the next vertex pair is index M (duplicate of 0)
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    roadGeo.setIndex(idx);
    const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({
      color: 0x1a1e2e, roughness: 0.42, metalness: 0.35,
      emissive: 0x05060c, emissiveIntensity: 1,
    }));
    scene.add(road);

    // Neon edges
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x33e6ff).multiplyScalar(2.4), side: THREE.DoubleSide, toneMapped: false });
    const mag = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3fa4).multiplyScalar(2.4), side: THREE.DoubleSide, toneMapped: false });
    scene.add(new THREE.Mesh(roadStrip(track, 0, track.L, -HW - 0.25, -HW + 0.25, 0.05), cyan));
    scene.add(new THREE.Mesh(roadStrip(track, 0, track.L, HW - 0.25, HW + 0.25, 0.05), mag));

    // Dashed lane dividers
    const dashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdde8ff).multiplyScalar(0.8), transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
    const dashGeo = [];
    for (let k = 1; k < CFG.LANES; k++) {
      const x = -HW + k * CFG.LANE_W;
      for (let s = 0; s < track.L; s += 14) {
        dashGeo.push(roadStrip(track, s, Math.min(s + 7, track.L), x - 0.07, x + 0.07, 0.06));
      }
    }
    const merged = mergeGeometries(dashGeo);
    scene.add(new THREE.Mesh(merged, dashMat));

    // Viaduct skirts (vertical walls down to the ground plane)
    const skirtTex = skirtTexture();
    const skirtMat = new THREE.MeshStandardMaterial({ map: skirtTex, color: 0x242838, roughness: 0.8, emissive: 0x111420, emissiveMap: skirtTex, emissiveIntensity: 1.2, side: THREE.DoubleSide });
    const sPos = [], sUv = [], sIdx = [];
    for (let i = 0; i <= M; i++) {
      const k = i % M;
      for (const x of [-HW - 0.5, HW + 0.5]) {
        const px = P[k * 3] + R[k * 3] * x, py = P[k * 3 + 1] + R[k * 3 + 1] * x, pz = P[k * 3 + 2] + R[k * 3 + 2] * x;
        sPos.push(px, py, pz, px, GROUND_Y, pz);
        sUv.push(i * track.ds / 16, 0, i * track.ds / 16, 1);
      }
      if (i < M) {
        const a = i * 4;
        const b = (i + 1) * 4;
        // left wall: a (top), a+1 (bottom); right wall: a+2, a+3
        sIdx.push(a, a + 1, b, a + 1, b + 1, b);
        sIdx.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
    sg.setIndex(sIdx);
    sg.computeVertexNormals();
    scene.add(new THREE.Mesh(sg, skirtMat));

    // Start/finish band
    const checker = checkerTexture();
    checker.repeat.set(1, 1);
    const band = new THREE.Mesh(roadStrip(track, 0, 4, -HW, HW, 0.05, 4), new THREE.MeshBasicMaterial({ map: checker, toneMapped: false }));
    scene.add(band);
  }

  _buildPads(scene) {
    const track = this.track;
    const tex = chevronTexture();
    tex.repeat.set(1, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0xffb13b).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    this.pads = [];
    for (const [name, sec] of Object.entries(track.secs)) {
      if (!name.startsWith('start')) continue;
      const offsets = name === 'start' ? [60, 230] : [60, 230];
      for (const o of offsets) {
        const s0 = sec.s0 + o;
        this.pads.push({ s0, s1: s0 + 18 });
        scene.add(new THREE.Mesh(roadStrip(track, s0, s0 + 18, -HW + 0.6, HW - 0.6, 0.07, 18), mat));
      }
    }
    // Pads on the sweeps too
    for (const name of ['sweepC', 'sweepC_2']) {
      const sec = track.secs[name];
      if (!sec) continue;
      const s0 = sec.s0 + 30;
      this.pads.push({ s0, s1: s0 + 16 });
      scene.add(new THREE.Mesh(roadStrip(track, s0, s0 + 16, -HW + 0.6, HW - 0.6, 0.07, 16), mat));
    }
    this.padMat = mat;
    this.animated.push((t) => { tex.offset.y = -t * 1.2; });
  }

  _buildCity(scene) {
    const track = this.track;
    const count = 520;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const winTex = windowTexture();
    winTex.repeat.set(2, 3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x20243a, roughness: 0.65, metalness: 0.2, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 0.9 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    const f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
    for (let i = 0; i < count; i++) {
      const s = this.rng() * track.L;
      track.frame(s, f);
      const side = this.rng() < 0.5 ? -1 : 1;
      const off = 26 + this.rng() * 90;
      const x = f.p[0] + f.r[0] * side * off;
      const z = f.p[2] + f.r[2] * side * off;
      const w = 10 + this.rng() * 16, d = 10 + this.rng() * 16;
      const h = 30 + Math.pow(this.rng(), 1.8) * 170;
      dummy.position.set(x, GROUND_Y + h / 2, z);
      dummy.scale.set(w, h, d);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      c.setHSL(0.6 + this.rng() * 0.3, 0.3, 0.06 + this.rng() * 0.06);
      mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    // Glowing neon rings / billboards hung over the road at a few places
    const bbMats = [0xff3fa4, 0x33e6ff, 0xffd23f, 0xb36bff];
    for (let k = 0; k < 14; k++) {
      const s = (k / 14) * track.L + 40;
      track.frame(s, f);
      const side = k % 2 ? 1 : -1;
      const off = 18 + this.rng() * 8;
      const cx = f.p[0] + f.r[0] * side * off, cy = f.p[1] + 16 + this.rng() * 8, cz = f.p[2] + f.r[2] * side * off;
      const col = bbMats[k % bbMats.length];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.8), toneMapped: false, side: THREE.DoubleSide }));
      sign.position.set(cx, cy, cz);
      sign.lookAt(f.p[0], cy, f.p[2]);
      scene.add(sign);
    }
  }

  _buildLights(scene) {
    scene.add(new THREE.HemisphereLight(0x6a7bff, 0x1a0820, 0.9));
    const moon = new THREE.DirectionalLight(0xaad0ff, 1.1);
    moon.position.set(-300, 600, -200);
    scene.add(moon);
    const amb = new THREE.AmbientLight(0x2a2c55, 0.4);
    scene.add(amb);
  }

  update(t, dt) {
    for (const fn of this.animated) fn(t, dt);
  }
}

// Tiny deterministic RNG.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Merge non-indexed or indexed BufferGeometries that share the same attributes.
function mergeGeometries(geos) {
  const pos = [], uv = [], nrm = [], idx = [];
  let base = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      if (u) uv.push(u.getX(i), u.getY(i));
    }
    const ix = g.getIndex();
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nrm.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  if (uv.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
