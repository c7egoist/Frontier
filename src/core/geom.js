/**
 * Frontier — geometry kernel
 * --------------------------
 * Deliberately dependency-free (no three.js): the same core runs in the browser
 * viewer, in Node (tests / report) and gets handed to Blender as OBJ.
 *
 * A Part is a flat triangle soup with a material + layer tag:
 *   { id, layer, material, positions: number[], meta }
 * Layers exist so the UI can toggle real construction layers (tiles / battens /
 * deck / rafters / structure …) and so Blender can rebuild them as collections.
 */

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp(t); return t * t * t * (t * (6 * t - 15) + 10); };
export const TAU = Math.PI * 2;

/** Add two 3-vectors. */
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function vnorm(a) {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function vlerp(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Right-handed orthonormal frame from an up-ish direction and a desired local X. */
export function frameFromUp(up, hintX = [1, 0, 0]) {
  const y = vnorm(up);
  let x = vsub(hintX, vmul(y, vdot(hintX, y)));
  if (vlen(x) < 1e-6) x = vcross(y, [0, 0, 1]);
  x = vnorm(x);
  const z = vcross(x, y);
  return { x, y, z };
}

/** Map a 2D (u, v) point into world space along a frame at origin. */
export function toWorld(origin, frame, u, v, w = 0) {
  return [
    origin[0] + frame.x[0] * u + frame.y[0] * v + frame.z[0] * w,
    origin[1] + frame.x[1] * u + frame.y[1] * v + frame.z[1] * w,
    origin[2] + frame.x[2] * u + frame.y[2] * v + frame.z[2] * w,
  ];
}

export class Part {
  constructor(id, layer, material = 'default', meta = {}) {
    this.id = id;
    this.layer = layer;
    this.material = material;
    this.meta = meta;
    this.positions = [];
    this.triCount = 0;
  }
  get vertexCount() { return this.positions.length / 3; }

  tri(a, b, c) {
    const p = this.positions;
    p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.triCount++;
    return this;
  }
  quad(a, b, c, d) { return this.tri(a, b, c).tri(a, c, d); }
  fan(points) {
    for (let i = 1; i + 1 < points.length; i++) this.tri(points[0], points[i], points[i + 1]);
    return this;
  }
  /** Two-sided quad (used for thin sheets such as the underlayment). */
  quad2(a, b, c, d) { return this.quad(a, b, c, d).quad(a, d, c, b); }

  /**
   * Loft a series of equal-length cross sections.
   * @param {Array<Array<number[]>>} sections world-space rings
   */
  loft(sections, { closed = false, capStart = true, capEnd = true } = {}) {
    for (let s = 0; s + 1 < sections.length; s++) {
      const A = sections[s], B = sections[s + 1];
      const n = A.length;
      const lim = closed ? n : n - 1;
      for (let i = 0; i < lim; i++) {
        const j = (i + 1) % n;
        this.quad(A[i], A[j], B[j], B[i]);
      }
    }
    if (capStart && closed) this.fan([...sections[0]].reverse());
    if (capEnd && closed) this.fan(sections[sections.length - 1]);
    return this;
  }

  /**
   * Extrude a closed 2D polygon (u,v) along a path of frames.
   * `path` = [{ origin, frame, scale? }] — used for tiles, purlins, rafters…
   */
  extrudePolygon(polygon, path, { capStart = true, capEnd = true } = {}) {
    const sections = path.map(({ origin, frame, scale = 1 }) =>
      polygon.map(([u, v]) => toWorld(origin, frame, u * scale, v * scale)));
    return this.loft(sections, { closed: true, capStart, capEnd });
  }

  /**
   * A rectangular beam running from `a` to `b`.
   * size = [width across, height up] measured in the plane perpendicular to the axis.
   */
  boxBetween(a, b, size, up = [0, 1, 0]) {
    const axis = vnorm(vsub(b, a));
    let x = vcross(axis, up);
    if (vlen(x) < 1e-6) x = vcross(axis, [1, 0, 0]);
    x = vnorm(x);
    const y = vnorm(vcross(x, axis));
    const f = { x, y, z: axis };
    const hw = (size[0] ?? size[2]) / 2, hh = (size[1] ?? size[0]) / 2;
    const ring = [
      toWorld(a, f, -hw, -hh, 0),
      toWorld(a, f, hw, -hh, 0),
      toWorld(a, f, hw, hh, 0),
      toWorld(a, f, -hw, hh, 0),
    ];
    const ring2 = ring.map((p) => vadd(p, vmul(axis, vlen(vsub(b, a)))));
    return this.loft([ring, ring2], { closed: true });
  }

  /**
   * A solid whose cross section follows a 3D path (curved rafters, ties, finials).
   * yRange = [lo, hi] gives the section extent along the local "up" direction, so a
   * rafter can hang *below* a surface while its top face stays in contact with it.
   */
  curvedBeam(pathPts, width, depth, normalOf, yRange = null) {
    const [yLo, yHi] = yRange ?? [-depth / 2, depth / 2];
    const sections = pathPts.map((p, i) => {
      const prev = pathPts[Math.max(0, i - 1)];
      const next = pathPts[Math.min(pathPts.length - 1, i + 1)];
      const tangent = vnorm(vsub(next, prev));
      const n = vnorm(normalOf ? normalOf(p, i) : [0, 1, 0]);
      let x = vcross(tangent, n);
      if (vlen(x) < 1e-6) x = [1, 0, 0];
      x = vnorm(x);
      const y = vnorm(vcross(x, tangent));
      const f = { x, y, z: tangent };
      const hw = width / 2;
      return [
        toWorld(p, f, -hw, yLo, 0),
        toWorld(p, f, hw, yLo, 0),
        toWorld(p, f, hw, yHi, 0),
        toWorld(p, f, -hw, yHi, 0),
      ];
    });
    return this.loft(sections, { closed: true });
  }

  cylinder(a, b, radius, segments = 12, { capStart = true, capEnd = true } = {}) {
    const axis = vnorm(vsub(b, a));
    const f = frameFromUp(axis);
    const ringAt = (p) => {
      const ring = [];
      for (let i = 0; i < segments; i++) {
        const t = (i / segments) * TAU;
        ring.push(toWorld(p, f, Math.cos(t) * radius, Math.sin(t) * radius, 0));
      }
      return ring;
    };
    return this.loft([ringAt(a), ringAt(b)], { closed: true, capStart, capEnd });
  }

  /** Half-pipe (丸瓦): an open barrel shell from angle a0..a1 around the axis. */
  barrel(a, b, radius, thickness, a0 = 0, a1 = Math.PI, segments = 10) {
    const axis = vnorm(vsub(b, a));
    const f = frameFromUp(axis);
    const ringAt = (p) => {
      const outer = [], inner = [];
      for (let i = 0; i <= segments; i++) {
        const t = lerp(a0, a1, i / segments);
        const c = [Math.cos(t), Math.sin(t)];
        outer.push(toWorld(p, f, c[0] * radius, c[1] * radius, 0));
        inner.push(toWorld(p, f, c[0] * (radius - thickness), c[1] * (radius - thickness), 0));
      }
      return { outer, inner };
    };
    const A = ringAt(a), B = ringAt(b);
    for (let i = 0; i + 1 < A.outer.length; i++) {
      this.quad(A.outer[i], A.outer[i + 1], B.outer[i + 1], B.outer[i]);
      this.quad(B.inner[i], B.inner[i + 1], A.inner[i + 1], A.inner[i]);
    }
    for (let i = 0; i + 1 < A.outer.length; i++) {
      const aO = A.outer[i], bO = A.outer[i + 1], aI = A.inner[i], bI = A.inner[i + 1];
      this.quad(aO, aI, bI, bO);
      const cO = B.outer[i], dO = B.outer[i + 1], cI = B.inner[i], dI = B.inner[i + 1];
      this.quad(cI, cO, dO, dI);
    }
    this.quad(A.outer[0], B.outer[0], B.inner[0], A.inner[0]);
    this.quad(A.inner[A.inner.length - 1], B.inner[B.inner.length - 1], B.outer[B.outer.length - 1], A.outer[A.outer.length - 1]);
    return this;
  }

  translate(d) {
    const p = this.positions;
    for (let i = 0; i < p.length; i += 3) { p[i] += d[0]; p[i + 1] += d[1]; p[i + 2] += d[2]; }
    return this;
  }

  get bounds() {
    const p = this.positions;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = p[i + k];
        if (v < b[k]) b[k] = v;
        if (v > b[3 + k]) b[3 + k] = v;
      }
    }
    return { min: b.slice(0, 3), max: b.slice(3, 6) };
  }
}

/** Area of a triangle-mesh part (used by the tile-coverage assertion). */
export function partArea(part) {
  const p = part.positions;
  let area = 0;
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2];
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  return area;
}

/** Deterministic RNG so a spec always regenerates the same building. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
