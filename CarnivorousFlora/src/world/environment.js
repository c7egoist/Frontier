import * as THREE from 'three';
import { Rng, terrainHeight, valueNoise } from '../util/noise.js';
import { TubeRibbon, makePetalGeometry, xform, basisQuat, mergeGeometries, setSway } from '../flora/geometry.js';
import { leafMaterial } from '../flora/materials.js';
import { buildDecoy } from '../flora/decoys.js';
import { stemTexture, softDotTexture } from '../gfx/textures.js';
import { Shared } from '../gfx/shaderPatches.js';
import { SKY } from './sky.js';

const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// Giant trees: they set the scale of the valley and swallow the horizon in mist.
export function buildForest({ count = 70, seed = 5, avoid = [] } = {}) {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const colliders = [];
  const barkTex = stemTexture('briar').map.clone();
  barkTex.needsUpdate = true; barkTex.repeat.set(1, 1);
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, color: '#b8a98c', roughness: 0.95, bumpMap: barkTex, bumpScale: 2.0 });
  const canopyGeo = new THREE.IcosahedronGeometry(1, 4);
  const cp = canopyGeo.attributes.position;
  const ccol = new Float32Array(cp.count * 3);
  for (let i = 0; i < cp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(cp, i);
    const n = valueNoise(v.x * 2.2 + 5, v.y * 2.2 + v.z * 1.7, 9) * 0.55 + valueNoise(v.x * 6 + 1, v.y * 6 + v.z * 5, 4) * 0.3 + valueNoise(v.x * 16, v.y * 16 + v.z * 13, 6) * 0.15;
    const dir = v.clone().normalize();
    v.copy(dir).multiplyScalar(0.7 + n * 0.55); v.y *= 0.85;
    cp.setXYZ(i, v.x, v.y, v.z);
    const ao = 0.35 + 0.65 * Math.min(1, Math.max(0, dir.y * 0.5 + 0.55)) * (0.6 + 0.6 * n);
    ccol[i * 3] = ccol[i * 3 + 1] = ccol[i * 3 + 2] = ao;
  }
  canopyGeo.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  canopyGeo.computeVertexNormals();
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.95, flatShading: false });
  const canopies = [];
  const trunkGeos = [];
  const placed = [];
  let guard = 0;
  while (placed.length < count && guard++ < 4000) {
    const ring = rng.next() < 0.78;
    const r = ring ? rng.range(125, 330) : rng.range(55, 125);
    const a = rng.range(0, Math.PI * 2);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (avoid.some((p) => Math.hypot(p.x - x, p.z - z) < 18)) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 14)) continue;
    placed.push({ x, z });
    const H = rng.range(45, 85), R = rng.range(1.6, 3.4);
    const y0 = terrainHeight(x, z) - 1;
    const lean = new THREE.Vector3(rng.range(-3, 3), 0, rng.range(-3, 3));
    const pts = [];
    const tr = new TubeRibbon(10, 10, { vRepeat: 6 });
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(x + lean.x * t * t, y0 + H * t, z + lean.z * t * t));
    }
    tr.update(pts, (t) => R * (1 + 1.1 * Math.exp(-t * 18)) * (1 - 0.55 * t));
    const g = tr.geometry; g.deleteAttribute('aSway'); trunkGeos.push(g);
    colliders.push({ x, z, r: R * 1.5 });
    const top = pts[10];
    const nb = rng.int(14, 24);
    for (let b = 0; b < nb; b++) {
      const s = rng.range(5, 12);
      canopies.push({ p: new THREE.Vector3(top.x + rng.range(-18, 18), top.y - rng.range(0, 30), top.z + rng.range(-18, 18)), s, c: new THREE.Color().setHSL(rng.range(0.2, 0.3), rng.range(0.4, 0.6), rng.range(0.07, 0.15)) });
    }
  }
  const trunks = new THREE.Mesh(mergeGeometries(trunkGeos, false), barkMat);
  trunks.castShadow = true; trunks.receiveShadow = true;
  group.add(trunks);
  const inst = new THREE.InstancedMesh(canopyGeo, canopyMat, canopies.length);
  const m = new THREE.Matrix4();
  canopies.forEach((c, i) => {
    m.compose(c.p, new THREE.Quaternion().setFromAxisAngle(UP, i), new THREE.Vector3(c.s * 1.3, c.s * 0.8, c.s * 1.3));
    inst.setMatrixAt(i, m); inst.setColorAt(i, c.c);
  });
  inst.castShadow = false;
  group.add(inst);
  return { group, colliders };
}

// ---------------------------------------------------------------------------
// Ferns (instanced)
function buildFrondGeometry(rng, len) {
  const geos = [];
  const n = 15;
  const rachis = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rachis.push(new THREE.Vector3(0, len * (0.55 * t - 0.08 * t * t * 0) * 0.9 + 0, len * (0.5 * t + 0.35 * t * t)));
  }
  // frond arches up then over
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    rachis[i].set(0, len * (0.75 * t - 0.45 * t * t), len * 0.55 * t * (1 - 0.15 * t));
  }
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = rachis[i], q = rachis[i - 1];
    const tang = p.clone().sub(q).normalize();
    const side = new THREE.Vector3(1, 0, 0);
    for (const s of [-1, 1]) {
      const ll = len * 0.3 * Math.sin(Math.PI * Math.pow(t, 0.7)) * 0.9 + len * 0.02;
      const g = makePetalGeometry({ length: ll, width: ll * 0.22, peak: 0.5, tipPow: 0.9, curl: 0.1, droop: 0.9, fold: 0.4, ruffle: 0, seed: i, segU: 4, segV: 2 });
      const dir = side.clone().multiplyScalar(s).addScaledVector(tang, 0.55).normalize();
      xform(g, { quat: basisQuat(dir, new THREE.Vector3(0, 1, 0)), pos: p.clone() });
      geos.push(g);
    }
  }
  const stem = new TubeRibbon(n, 4);
  stem.update(rachis, (t) => len * 0.006 * (1 - 0.8 * t));
  const sg = stem.geometry;
  const merged = mergeGeometries([...geos, sg], false);
  setSway(merged, (x, y, z) => 0.012 * len * (Math.max(0, y) / len) * 3 + 0.03 * z);
  return merged;
}

export function buildFerns({ count = 700, seed = 31, avoid = [], radius = 140 } = {}) {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const variants = [buildFrondGeometry(rng, 2.2), buildFrondGeometry(rng, 3.2)];
  const meshes = variants.map((g) => { const im = new THREE.InstancedMesh(g, leafMaterial('leafWild'), Math.ceil(count / 2)); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; return im; });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let i = 0;
  while (i < count) {
    const cx = rng.range(-radius, radius), cz = rng.range(-radius, radius);
    if (Math.hypot(cx, cz) > radius) continue;
    const n = rng.int(4, 9);
    for (let k = 0; k < n && i < count; k++) {
      const x = cx + rng.range(-1.2, 1.2), z = cz + rng.range(-1.2, 1.2);
      if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 1.5)) continue;
      const v = i % 2, im = meshes[v];
      q.setFromAxisAngle(UP, rng.range(0, Math.PI * 2));
      p.set(x, terrainHeight(x, z) - 0.05, z);
      s.setScalar(rng.range(0.7, 1.35));
      m.compose(p, q, s);
      im.setMatrixAt(im.count++, m);
      i++;
    }
  }
  meshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; group.add(im); });
  return group;
}

// ---------------------------------------------------------------------------
// Small wildflowers in exactly the palette of the predators (instanced templates).
function cleanGeometry(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const out = new THREE.BufferGeometry();
  const n = g.attributes.position.count;
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('uv', g.attributes.uv || new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  out.setAttribute('aSway', g.attributes.aSway || new THREE.BufferAttribute(new Float32Array(n), 1));
  return out;
}

export function instanceTemplate(template, placements) {
  template.position.set(0, 0, 0);
  template.updateMatrixWorld(true);
  const byMat = new Map();
  template.traverse((o) => {
    if (!o.isMesh) return;
    const g = cleanGeometry(o.geometry);
    g.applyMatrix4(o.matrixWorld);
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const group = new THREE.Group();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    const im = new THREE.InstancedMesh(merged, mat, placements.length);
    placements.forEach((pl, i) => {
      q.setFromAxisAngle(UP, pl.yaw); p.set(pl.x, terrainHeight(pl.x, pl.z) - 0.05, pl.z); s.setScalar(pl.s);
      m.compose(p, q, s); im.setMatrixAt(i, m);
    });
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    group.add(im);
  }
  return group;
}

export function buildWildflowers({ perSpecies = 260, seed = 61, radius = 135, avoid = [] } = {}) {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  for (const species of ['orchid', 'lily']) {
    for (let v = 0; v < 3; v++) {
      const H = species === 'orchid' ? 1.5 + v * 0.35 : 1.3 + v * 0.3;
      const tpl = buildDecoy(species, { x: 0, z: 0, H, seed: 900 + v * 13 + (species === 'lily' ? 100 : 0) });
      const placements = [];
      const n = Math.floor(perSpecies / 3);
      while (placements.length < n) {
        // clumped scatter
        const cx = rng.range(-radius, radius), cz = rng.range(-radius, radius);
        if (Math.hypot(cx, cz) > radius) continue;
        const k = rng.int(2, 6);
        for (let j = 0; j < k && placements.length < n; j++) {
          const x = cx + rng.range(-3, 3), z = cz + rng.range(-3, 3);
          if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 2.0)) continue;
          placements.push({ x, z, yaw: rng.range(0, 6.28), s: rng.range(0.75, 1.4) });
        }
      }
      group.add(instanceTemplate(tpl, placements));
    }
  }
  return group;
}

// ---------------------------------------------------------------------------
// Atmosphere: drifting pollen and sun shafts.
export function buildPollen({ count = 2200, size = 70 } = {}) {
  const g = new THREE.BufferGeometry();
  const rng = new Rng(3);
  const d = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { d[i * 4] = rng.next(); d[i * 4 + 1] = rng.next(); d[i * 4 + 2] = rng.next(); d[i * 4 + 3] = rng.next(); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aData', new THREE.BufferAttribute(d, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: Shared.uTime, uSize: { value: size }, uPx: { value: 1 }, uSun: { value: SKY.sunColor } },
    vertexShader: /* glsl */ `
      attribute vec4 aData; uniform vec3 uCam; uniform float uTime, uSize, uPx; varying float vA;
      void main(){
        vec3 b = aData.xyz * uSize;
        vec3 drift = vec3(sin(uTime*0.13 + aData.w*40.), sin(uTime*0.09 + aData.x*30.)*0.6, cos(uTime*0.11 + aData.w*25.)) * 2.0 + vec3(uTime*0.35, uTime*0.05, uTime*0.25);
        vec3 p = b + drift;
        p = uCam + mod(p - uCam + uSize*0.5, uSize) - uSize*0.5;
        p.y = uCam.y - 4.0 + mod(aData.y*uSize*0.35 + uTime*0.1 + sin(uTime*0.2+aData.w*9.)*0.8, 22.0);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = (1.6 + aData.w*3.0) * uPx * 90.0 / max(dist, 1.0);
        vA = (0.25 + 0.75*aData.w) * smoothstep(uSize*0.5, uSize*0.25, length(p - uCam)) * (0.6+0.4*sin(uTime*1.5 + aData.x*50.));
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; uniform vec3 uSun;
      void main(){ float d = length(gl_PointCoord-0.5)*2.; float a = smoothstep(1.,0.,d); gl_FragColor = vec4(uSun*1.6, a*a*vA*0.8); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

export function buildShafts({ count = 16, seed = 8, radius = 120 } = {}) {
  const rng = new Rng(seed);
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
  const c = new Float32Array(count * 4), s = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, 6.28), r = rng.range(15, radius);
    c[i * 4] = Math.cos(a) * r; c[i * 4 + 1] = 18; c[i * 4 + 2] = Math.sin(a) * r; c[i * 4 + 3] = rng.range(0, 100);
    s[i * 2] = rng.range(6, 16); s[i * 2 + 1] = rng.range(70, 120);
  }
  g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(c, 4));
  g.setAttribute('aSize', new THREE.InstancedBufferAttribute(s, 2));
  g.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uSunDir: { value: SKY.sunDir }, uTime: Shared.uTime, uSun: { value: SKY.sunColor }, uIntensity: { value: 0.09 } },
    vertexShader: /* glsl */ `
      attribute vec4 aCenter; attribute vec2 aSize; uniform vec3 uSunDir; varying vec2 vUv; varying float vPh; varying vec3 vW;
      void main(){
        vUv = uv; vPh = aCenter.w;
        vec3 axis = normalize(uSunDir);
        vec3 toC = normalize(aCenter.xyz - cameraPosition);
        vec3 right = normalize(cross(axis, toC));
        vec3 wp = aCenter.xyz + axis * position.y * aSize.y + right * position.x * aSize.x;
        vW = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv; varying float vPh; varying vec3 vW; uniform vec3 uSun; uniform float uTime, uIntensity;
      void main(){
        float x = abs(vUv.x - 0.5) * 2.0;
        float side = pow(1.0 - x, 2.2);
        float len = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float fl = 0.65 + 0.35 * sin(uTime * 0.4 + vPh + vUv.y * 3.0);
        float ground = smoothstep(-2.0, 6.0, vW.y);
        float cam = smoothstep(2.0, 14.0, distance(vW, cameraPosition));
        gl_FragColor = vec4(uSun * side * len * fl * ground * cam * uIntensity * 3.0, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  return mesh;
}
