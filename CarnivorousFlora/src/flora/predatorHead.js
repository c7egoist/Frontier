import * as THREE from 'three';
import { Rng, valueNoise } from '../util/noise.js';
import {
  makePetalGeometry, makeFangGeometry, makeThornGeometry, xform, basisQuat, mergeGeometries, bakeSway, TubeRibbon,
} from './geometry.js';
import {
  skinMaterial, interiorMaterial, toothMaterial, eyeMaterial, lamellaMaterial, petalMaterial, antherMaterial,
} from './materials.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const cap = (u) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (u - 0.93) / 0.07), 2))) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, (0.1 - u) / 0.1), 2)));

// Cross-section profile along the jaw (head length = 1, hinge at z = 0).
const PROFILE = {
  orchid(u) {
    const c = cap(u);
    const a = 0.21 * (0.5 + 0.5 * Math.sin(Math.min(1, u / 0.26) * Math.PI / 2)) * (1 - 0.74 * sm(0.32, 1.0, u));
    const bU = 0.165 * (0.65 + 0.35 * Math.sin(Math.min(1, u / 0.3) * Math.PI / 2)) * (1 - 0.6 * sm(0.38, 1, u));
    const bL = 0.085 * (1 - 0.5 * sm(0.3, 1, u));
    return { a: a * c, bU: bU * c, bL: bL * c };
  },
  lily(u) {
    const c = cap(u);
    const a = 0.44 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.03 + 0.94 * u))), 0.72);
    return { a: a * Math.min(1, c * 1.2), bU: 0.2 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.03 + 0.94 * u))), 0.6) * c, bL: 0.17 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.03 + 0.94 * u))), 0.6) * c };
  },
};

function bump(species, u, th, upper) {
  // organic surface relief
  const n = valueNoise(u * 9 + 3.1, th * 2.4 + (upper ? 0 : 7), 4) - 0.5;
  let s = 1 + n * 0.1;
  if (species === 'orchid' && upper) {
    s += 0.16 * Math.exp(-Math.pow((u - 0.32) / 0.07, 2)) * Math.exp(-Math.pow((th - 0.5) / 0.35, 2)); // eye boss
    s += 0.07 * Math.exp(-Math.pow((u - 0.52) / 0.18, 2)) * Math.exp(-Math.pow((th - 1.2) / 0.5, 2)); // brow
  }
  return s;
}

function surfacePoint(species, u, th, upper, out = new THREE.Vector3()) {
  const p = PROFILE[species](u);
  const s = bump(species, u, th, upper);
  let y = (upper ? p.bU : -p.bL) * Math.sin(th) * s;
  if (species === 'orchid' && upper) y += 0.02 * Math.exp(-Math.pow((p.a > 0 ? Math.cos(th) * p.a : 0) / 0.05, 2)) * Math.sin(th) * (u > 0.1 ? 1 : 0);
  return out.set(p.a * Math.cos(th) * s, y, u);
}

function surfaceNormal(species, u, th, upper) {
  const e = 0.004;
  const a = surfacePoint(species, Math.min(1, u + e), th, upper), b = surfacePoint(species, Math.max(0, u - e), th, upper);
  const c = surfacePoint(species, u, th + e, upper), d = surfacePoint(species, u, th - e, upper);
  const du = a.sub(b), dt = c.sub(d);
  const n = new THREE.Vector3().crossVectors(upper ? dt : du, upper ? du : dt).normalize();
  return n;
}

function buildJawGeometry(species, upper, nu = 44, nt = 26) {
  const nV = nt + 1;
  const pos = new Float32Array((nu + 1) * nV * 3), uv = new Float32Array((nu + 1) * nV * 2), col = new Float32Array((nu + 1) * nV * 3);
  const p = new THREE.Vector3();
  const deep = new THREE.Color(species === 'orchid' ? '#4a0c06' : '#2a0418');
  const mid = new THREE.Color(species === 'orchid' ? '#c85a14' : '#a01a62');
  const bright = new THREE.Color(species === 'orchid' ? '#f0a43a' : '#e86aa0');
  const c = new THREE.Color();
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    for (let j = 0; j <= nt; j++) {
      const th = (j / nt) * Math.PI;
      surfacePoint(species, u, th, upper, p);
      const k = i * nV + j;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uv[k * 2] = (th / Math.PI) * 1.6; uv[k * 2 + 1] = u * 2.4;
      const ridge = 0.82 + 0.18 * Math.sin(u * 70 + Math.sin(th * 5) * 1.5);
      const t = sm(0.02, 0.85, u);
      c.copy(deep).lerp(mid, Math.min(1, t * 1.6)).lerp(bright, Math.max(0, t * 1.5 - 0.5)).multiplyScalar(ridge * (0.85 + 0.3 * Math.pow(Math.sin(th), 0.5) * 0));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  const idx = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nt; j++) {
    const a = i * nV + j, b = a + nV;
    if (upper) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Rim and surface teeth merged for one jaw. */
function buildTeeth(species, upper, rng) {
  const geos = [];
  const p = new THREE.Vector3();
  const add = (g, pos, dir) => {
    xform(g, { quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()), pos });
    if (g.attributes.uv) g.deleteAttribute('uv');
    geos.push(g.index ? g.toNonIndexed() : g);
  };
  const vdir = upper ? -1 : 1;
  if (species === 'lily') {
    const n = 13;
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      const u = 0.12 + 0.8 * ((i + (upper ? 0 : 0.5)) / n);
      const pr = PROFILE.lily(u);
      const len = 0.05 + 0.05 * Math.sin(Math.PI * u) * rng.range(0.8, 1.15);
      add(makeThornGeometry(len, len * 0.2, 5), new THREE.Vector3(side * pr.a * 0.97, 0, u), new THREE.Vector3(-side * 0.3, vdir, 0.22));
    }
    // outer briar spines
    for (let i = 0; i < 46; i++) {
      const u = rng.range(0.12, 0.88), th = rng.range(0.25, Math.PI - 0.25);
      surfacePoint('lily', u, th, upper, p);
      const nrm = surfaceNormal('lily', u, th, upper);
      const len = rng.range(0.035, 0.075);
      add(makeThornGeometry(len, len * 0.25, 5), p.clone().addScaledVector(nrm, -0.004), nrm.clone().add(new THREE.Vector3(0, 0, -0.35)));
    }
  } else {
    const n = 9;
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      const u = 0.34 + 0.55 * ((i + (upper ? 0 : 0.5)) / n);
      const pr = PROFILE.orchid(u);
      const len = 0.02 + 0.022 * rng.range(0.7, 1.2);
      add(makeThornGeometry(len, len * 0.28, 5), new THREE.Vector3(side * pr.a * 0.95, 0, u), new THREE.Vector3(-side * 0.25, vdir, 0.3));
    }
  }
  return geos.length ? mergeGeometries(geos, false) : null;
}

/** Interior lamellae (orchid) / stamen cluster (lily). Parented to the lower jaw. */
function buildInteriorDecor(species, rng) {
  const g = new THREE.Group();
  if (species === 'orchid') {
    const geos = [];
    for (let i = 0; i < 14; i++) {
      const u = rng.range(0.25, 0.72);
      const x = rng.range(-0.05, 0.05);
      const len = rng.range(0.08, 0.16);
      const geo = makePetalGeometry({ length: len, width: len * 0.7, peak: 0.55, tipPow: 0.6, curl: 0.9, cup: 0.5, ruffle: 0.02, seed: i + 2, segU: 8, segV: 6 });
      const dir = new THREE.Vector3(rng.range(-0.25, 0.25), 1, rng.range(0.1, 0.6)).normalize();
      xform(geo, { quat: basisQuat(dir, new THREE.Vector3(0, 0, 1)), pos: new THREE.Vector3(x, -PROFILE.orchid(u).bL * 0.6, u) });
      bakeSway(geo, 0); geos.push(geo);
    }
    const m = new THREE.Mesh(mergeGeometries(geos, false), lamellaMaterial());
    m.castShadow = false; g.add(m);
  } else {
    const tubes = [], anth = [];
    for (let i = 0; i < 20; i++) {
      const u = rng.range(0.2, 0.7), x = rng.range(-0.12, 0.12);
      const len = rng.range(0.1, 0.2);
      const base = new THREE.Vector3(x, -PROFILE.lily(u).bL * 0.7, u);
      const pts = [];
      const dir = new THREE.Vector3(rng.range(-0.3, 0.3), 1, rng.range(-0.2, 0.5)).normalize();
      for (let s = 0; s <= 6; s++) { const t = s / 6; pts.push(base.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, -0.2 * len * t * t, 0.35 * len * t * t))); }
      const tr = new TubeRibbon(6, 5); tr.update(pts, (t) => 0.006 * (1 - 0.4 * t));
      const tg = tr.geometry; tg.deleteAttribute('aSway'); tg.deleteAttribute('uv'); tubes.push(tg.toNonIndexed());
      const a = new THREE.SphereGeometry(0.014, 8, 6); xform(a, { pos: pts[6].clone(), scale: new THREE.Vector3(1, 1.8, 1) }); a.deleteAttribute('uv'); anth.push(a.toNonIndexed());
    }
    const m = new THREE.Mesh(mergeGeometries([...tubes, ...anth], false), antherMaterial('lily'));
    g.add(m);
  }
  return g;
}

export function buildHead(species, size = 3.5, seed = 1) {
  const rng = new Rng(seed);
  const root = new THREE.Group();
  const upper = new THREE.Group(), lower = new THREE.Group();
  root.add(upper, lower);
  const skin = skinMaterial(species === 'orchid' ? 'bone' : 'husk');
  const inner = interiorMaterial(species);
  const mk = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

  for (const [grp, isUp] of [[upper, true], [lower, false]]) {
    const geo = buildJawGeometry(species, isUp);
    grp.add(mk(geo, skin));
    grp.add(mk(geo, inner, false));
    const teeth = buildTeeth(species, isUp, rng);
    if (teeth) grp.add(mk(teeth, toothMaterial(species === 'orchid' ? 'fang' : 'thorn')));
  }
  const decor = buildInteriorDecor(species, rng);
  lower.add(decor);

  const eyes = [];
  if (species === 'orchid') {
    // curled golden fangs (the "tendril" fangs from the reference)
    for (const side of [-1, 1]) {
      const pr = PROFILE.orchid(0.74);
      const fg = makeFangGeometry({ length: 0.42, radius: 0.026, curve: 1.0, side: 0 });
      fg.deleteAttribute('uv');
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + 0.1, side * 0.12, 0));
      const m = new THREE.Mesh(fg, toothMaterial('fang'));
      m.quaternion.copy(q); m.position.set(side * pr.a * 0.8, 0.0, 0.74); m.castShadow = true;
      upper.add(m);
    }
    // eyes
    for (const side of [-1, 1]) {
      const th = side > 0 ? 0.5 : Math.PI - 0.5;
      const u = 0.33;
      const p = surfacePoint('orchid', u, th, true);
      const nrm = surfaceNormal('orchid', u, th, true);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.058, 28, 20), eyeMaterial());
      eye.position.copy(p).addScaledVector(nrm, 0.012);
      eye.userData.socketNormal = nrm.clone();
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.014, 8, 24), skin);
      lid.position.copy(eye.position); lid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      lid.castShadow = true;
      upper.add(eye, lid);
      eyes.push(eye);
    }
  }

  // Hood of petals that blends the skull into the flower collar.
  const frill = [];
  if (species === 'orchid') {
    const fr = new THREE.Group();
    const geos = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const geo = makePetalGeometry({ length: 0.2, width: 0.1, peak: 0.5, tipPow: 0.8, curl: 0.6, cup: 0.25, seed: k, segU: 8, segV: 6 });
      const dir = new THREE.Vector3(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.85).normalize();
      xform(geo, { quat: basisQuat(dir, new THREE.Vector3(Math.cos(a), Math.sin(a), 0)), pos: new THREE.Vector3(Math.cos(a) * 0.1, Math.sin(a) * 0.06, 0.1) });
      bakeSway(geo, 0); geos.push(geo);
    }
    const m = new THREE.Mesh(mergeGeometries(geos, false), petalMaterial('orchidSepal'));
    m.castShadow = true; fr.add(m); root.add(fr);
  }

  root.scale.setScalar(size);
  const api = {
    root, upper, lower, eyes, species, size,
    setGape(g) { upper.rotation.x = -g * 0.62; lower.rotation.x = g * 0.38; },
    mouthWorld(out = new THREE.Vector3()) { return root.localToWorld(out.set(0, 0, 0.5)); },
  };
  api.setGape(0);
  return api;
}
