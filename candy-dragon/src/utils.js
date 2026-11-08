import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  small math helpers
 * ------------------------------------------------------------------ */

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** deterministic little RNG so the sculpture is identical on every load */
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** sample a keyframe table [{t, v}] with smooth (cosine) interpolation */
export function sampleTable(table, t) {
  if (t <= table[0][0]) return table[0][1];
  const n = table.length;
  if (t >= table[n - 1][0]) return table[n - 1][1];
  for (let i = 0; i < n - 1; i++) {
    const [t0, v0] = table[i];
    const [t1, v1] = table[i + 1];
    if (t >= t0 && t <= t1) {
      const k = smoothstep(t0, t1, t);
      return lerp(v0, v1, k);
    }
  }
  return table[n - 1][1];
}

/* ------------------------------------------------------------------ *
 *  rotation-minimising frames along a path
 *  (keeps a stable "up" for the body so scales never twist)
 * ------------------------------------------------------------------ */
export function framesFromPoints(ctrl, count = 220, tension = 0.5) {
  const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal', tension);
  const points = [];
  const tangents = [];
  const normals = [];
  const binormals = [];
  let prevN = null;
  let prevT = null;
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t).normalize();
    let N;
    if (!prevN) {
      N = up.clone().addScaledVector(T, -up.dot(T));
      if (N.lengthSq() < 1e-5) N.set(0, 0, 1).addScaledVector(T, -T.z);
      N.normalize();
    } else {
      N = prevN.clone();
      const axis = new THREE.Vector3().crossVectors(prevT, T);
      const s = axis.length();
      if (s > 1e-7) {
        axis.divideScalar(s);
        const angle = Math.atan2(s, clamp(prevT.dot(T), -1, 1));
        N.applyAxisAngle(axis, angle);
      }
      N.addScaledVector(T, -N.dot(T));
      if (N.lengthSq() < 1e-8) N.copy(binormals[binormals.length - 1]);
      N.normalize();
    }
    const B = new THREE.Vector3().crossVectors(T, N).normalize();
    points.push(p);
    tangents.push(T);
    normals.push(N);
    binormals.push(B);
    prevN = N;
    prevT = T;
  }
  return { curve, points, tangents, normals, binormals, count };
}

/** pick frame values at normalised t (0..1) */
export function frameAt(frames, t) {
  const x = clamp(t) * frames.count;
  const i = Math.floor(x);
  const j = Math.min(frames.count, i + 1);
  const k = x - i;
  return {
    p: frames.points[i].clone().lerp(frames.points[j], k),
    T: frames.tangents[i].clone().lerp(frames.tangents[j], k).normalize(),
    N: frames.normals[i].clone().lerp(frames.normals[j], k).normalize(),
    B: frames.binormals[i].clone().lerp(frames.binormals[j], k).normalize(),
  };
}

/* ------------------------------------------------------------------ *
 *  sweep a rounded profile along frames -> a body / limb / horn
 * ------------------------------------------------------------------ */
export function tubeGeometry(frames, radiusFn, radial = 40, opts = {}) {
  const {
    ellipse = [1, 1],        // horizontal / vertical scaling of the profile
    uOffset = 0,             // rotate profile around the path
    start = 0,
    end = 1,
    squash = null,           // (t, angle) => extra radial multiplier
    uvScale = [1, 1],
  } = opts;

  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const segs = Math.max(2, Math.round(frames.count * (end - start)));

  for (let i = 0; i <= segs; i++) {
    const t = start + ((end - start) * i) / segs;
    const f = frameAt(frames, t);
    const r = Math.max(0.0005, radiusFn(t));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2 + uOffset;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const extra = squash ? squash(t, a) : 1;
      const rx = r * ellipse[0] * (1 + extra);
      const ry = r * ellipse[1] * (1 + extra);
      pos.push(
        f.p.x + f.N.x * ca * rx + f.B.x * sa * ry,
        f.p.y + f.N.y * ca * rx + f.B.y * sa * ry,
        f.p.z + f.N.z * ca * rx + f.B.z * sa * ry
      );
      const nx = f.N.x * ca / ellipse[0] + f.B.x * sa / ellipse[1];
      const ny = f.N.y * ca / ellipse[0] + f.B.y * sa / ellipse[1];
      const nz = f.N.z * ca / ellipse[0] + f.B.z * sa / ellipse[1];
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      uv.push(t * uvScale[0], (j / radial) * uvScale[1]);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ *
 *  a thin, curved "pulled sugar" sheet (fins, frills, wing membranes)
 * ------------------------------------------------------------------ */
export function sheetGeometry(fn, uSegs = 24, vSegs = 12) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= uSegs; i++) {
    const u = i / uSegs;
    for (let j = 0; j <= vSegs; j++) {
      const v = j / vSegs;
      const p = fn(u, v);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  }
  for (let i = 0; i < uSegs; i++) {
    for (let j = 0; j < vSegs; j++) {
      const a = i * (vSegs + 1) + j;
      const b = a + vSegs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** leaf / petal fin lying in the XY plane, growing along +X */
export function finGeometry(length, width, opts = {}) {
  const { bend = 0.25, camber = 0.16, twist = 0, edge = 0.8 } = opts;
  return sheetGeometry(
    (u, v) => {
      const s = v * 2 - 1;
      const w = width * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.85);
      const x = u * length;
      const z = s * w * 0.5;
      const y = bend * u * u * length + camber * (1 - s * s) * w * 0.35 + twist * u * s;
      return new THREE.Vector3(x * edge, y, z);
    },
    20,
    10
  );
}

/** lathe-turned gumdrop */
export const GUMDROP_PROFILE = [
  [0.02, 0.0], [0.52, 0.015], [0.82, 0.06], [0.97, 0.16],
  [1.0, 0.32], [0.97, 0.5], [0.87, 0.66], [0.7, 0.8],
  [0.45, 0.91], [0.2, 0.97], [0.02, 1.0],
];

export function gumdropGeometry(radius = 0.2, height = 0.5, segs = 20) {
  const pts = GUMDROP_PROFILE.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r * radius), y * height));
  const g = new THREE.LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}

/** a helix that wraps around a horn / limb, like a candy cane */
export function helixPath(frames, radiusFn, opts = {}) {
  const { start = 0, end = 1, turns = 6, tubeR = 0.02, phase = 0, segments = 160, bulge = 0.0 } = opts;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = start + (end - start) * (i / segments);
    const f = frameAt(frames, t);
    const r = radiusFn(t) + tubeR * (0.55 + bulge);
    const a = phase + (t - start) * turns * Math.PI * 2;
    pts.push(
      f.p.clone()
        .addScaledVector(f.N, Math.cos(a) * r)
        .addScaledVector(f.B, Math.sin(a) * r)
    );
  }
  return new THREE.CatmullRomCurve3(pts);
}

/** lathe spiral disc (a lollipop swirl) */
export function spiralGeometry(radius = 0.4, turns = 3, tubeR = 0.045, segs = 220) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const r = 0.06 + (radius - 0.06) * Math.pow(t, 0.92);
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, Math.sin(a * 0.5) * 0.02));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, segs, tubeR, 8, false);
}

/** orient a local +X-forward, +Y-up object with a forward/up pair */
export function basisQuaternion(forward, up) {
  const z = forward.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** place a mesh built in local space (+Z = forward, +Y = up) */
export function placeForwardUp(obj, position, forward, up) {
  obj.position.copy(position);
  obj.quaternion.copy(basisQuaternion(forward, up));
}

/* ------------------------------------------------------------------ *
 *  lofted body from an explicit side silhouette
 *  profiles: [{x, top, bottom, halfWidth}] sorted by x (0 = tail end)
 *  Superellipse cross-sections give that sculpted, scaly read.
 * ------------------------------------------------------------------ */
export function loftProfile(profiles, opts = {}) {
  const { xSegs = 70, radial = 30, power = 2.6, backPower = 2.9 } = opts;
  const xs = profiles.map((p) => p.x);
  const x0 = xs[0];
  const x1 = xs[xs.length - 1];
  const sample = (arr, x) => {
    if (x <= xs[0]) return arr[0];
    if (x >= xs[xs.length - 1]) return arr[arr.length - 1];
    for (let i = 0; i < xs.length - 1; i++) {
      if (x >= xs[i] && x <= xs[i + 1]) {
        const k = (x - xs[i]) / (xs[i + 1] - xs[i]);
        const s = k * k * (3 - 2 * k);
        return arr[i] + (arr[i + 1] - arr[i]) * s;
      }
    }
    return arr[arr.length - 1];
  };
  const tops = profiles.map((p) => p.top);
  const bots = profiles.map((p) => p.bottom);
  const widths = profiles.map((p) => p.halfWidth);

  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= xSegs; i++) {
    const x = x0 + ((x1 - x0) * i) / xSegs;
    const top = sample(tops, x);
    const bot = sample(bots, x);
    const hw = Math.max(0.001, sample(widths, x));
    const cy = (top + bot) * 0.5;
    const hh = Math.max(0.002, (top - bot) * 0.5);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const ex = sa >= 0 ? power : backPower;
      const rz = hw * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / ex);
      const ry = hh * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / ex);
      pos.push(x, cy + ry, rz);
      uv.push(i / xSegs, j / radial);
    }
  }
  for (let i = 0; i < xSegs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
