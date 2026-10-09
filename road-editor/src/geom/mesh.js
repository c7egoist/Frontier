// Indexed mesh accumulation, grouped by material key.
//
// Surfaces are emitted as grids: `rows x cols` samples where rows usually follow
// the road (or ring index) and cols run across a band. Vertex normals come from
// finite differences of the grid itself, so each band is smooth while bands never
// share vertices (which keeps kerbs and gutters crisp). Winding is corrected
// against an expected direction supplied by the caller.
//
// UVs are always in metres: planar (x, z) for horizontal faces, or arc length
// (across, along) for everything else. Renderers and exporters divide by the
// material's tile size to get texture repeats.

const EPSN = 1e-12;
const dist3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export class MeshBuilder {
  constructor() {
    this.groups = new Map();
    this.quadCount = 0;
  }

  group(key) {
    let g = this.groups.get(key);
    if (!g) {
      g = { key, pos: [], nrm: [], uv: [], idx: [], vcount: 0 };
      this.groups.set(key, g);
    }
    return g;
  }

  // points: flat row-major array (length rows*cols) of [x, y, z] or null.
  // opts.key: string | (r, c) => string        material key (per quad)
  // opts.closed: columns wrap around (rings)
  // opts.uv: 'planar' | 'strip' (default 'strip')
  // opts.expect: single expected normal, or opts.expectCol per column
  // opts.skip: (r, c) => boolean to omit a quad
  addGrid(points, rows, cols, opts = {}) {
    const closed = !!opts.closed;
    const quadCols = closed ? cols : cols - 1;
    const quadRows = rows - 1;
    if (quadRows < 1 || quadCols < 1) return 0;
    const planar = opts.uv === 'planar';
    const nrm = new Array(rows * cols).fill(null);
    const uvs = new Array(rows * cols).fill(null);

    const cPrev = (c) => (closed ? (c - 1 + cols) % cols : Math.max(0, c - 1));
    const cNext = (c) => (closed ? (c + 1) % cols : Math.min(cols - 1, c + 1));
    const rPrev = (r) => Math.max(0, r - 1);
    const rNext = (r) => Math.min(rows - 1, r + 1);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gi = r * cols + c;
        const p = points[gi];
        if (!p) continue;
        const a = points[r * cols + cPrev(c)];
        const b = points[r * cols + cNext(c)];
        const d = points[rPrev(r) * cols + c];
        const e = points[rNext(r) * cols + c];
        if (a && b && d && e) {
          const du = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const dv = [e[0] - d[0], e[1] - d[1], e[2] - d[2]];
          let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
          const l = Math.hypot(n[0], n[1], n[2]);
          if (l > EPSN) nrm[gi] = [n[0] / l, n[1] / l, n[2] / l];
        }
        if (planar) {
          uvs[gi] = [p[0], p[2]];
        }
      }
    }

    if (!planar) {
      // u: accumulated length across the columns; v: accumulated length along the rows.
      for (let r = 0; r < rows; r++) {
        let u = 0;
        for (let c = 0; c < cols; c++) {
          const gi = r * cols + c;
          const p = points[gi];
          if (!p) continue;
          if (c > 0 && points[gi - 1]) u += dist3(p, points[gi - 1]);
          uvs[gi] = [u, 0];
        }
      }
      for (let c = 0; c < cols; c++) {
        let v = 0;
        for (let r = 0; r < rows; r++) {
          const gi = r * cols + c;
          const p = points[gi];
          if (!p) continue;
          if (r > 0 && points[gi - cols]) v += dist3(p, points[gi - cols]);
          uvs[gi] = [uvs[gi] ? uvs[gi][0] : 0, v];
        }
      }
    }

    // Orientation: total agreement of normals with the expectation decides winding.
    let flip = false;
    if (opts.expect || opts.expectCol) {
      let dot = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const gi = r * cols + c;
          const n = nrm[gi];
          const ex = opts.expectCol ? opts.expectCol[c] : opts.expect;
          if (!n || !ex) continue;
          dot += n[0] * ex[0] + n[1] * ex[1] + n[2] * ex[2];
        }
      }
      flip = dot < 0;
    }
    const sgn = flip ? -1 : 1;

    const maps = new Map();
    const vert = (g, gi) => {
      let m = maps.get(g.key);
      if (!m) {
        m = new Map();
        maps.set(g.key, m);
      }
      let vi = m.get(gi);
      if (vi !== undefined) return vi;
      const p = points[gi];
      const n = nrm[gi] || [0, 1, 0];
      const uv = uvs[gi] || [p[0], p[2]];
      vi = g.vcount++;
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(n[0] * sgn, n[1] * sgn, n[2] * sgn);
      g.uv.push(uv[0], uv[1]);
      m.set(gi, vi);
      return vi;
    };

    let emitted = 0;
    for (let r = 0; r < quadRows; r++) {
      for (let c = 0; c < quadCols; c++) {
        const c2 = closed ? (c + 1) % cols : c + 1;
        const a = r * cols + c;
        const b = r * cols + c2;
        const cc = (r + 1) * cols + c2;
        const d = (r + 1) * cols + c;
        if (!points[a] || !points[b] || !points[cc] || !points[d]) continue;
        if (opts.skip && opts.skip(r, c)) continue;
        const key = typeof opts.key === 'function' ? opts.key(r, c) : opts.key;
        if (key === null || key === undefined) continue;
        const g = this.group(key);
        const ia = vert(g, a);
        const ib = vert(g, b);
        const ic = vert(g, cc);
        const id = vert(g, d);
        if (flip) g.idx.push(ia, ic, ib, ia, id, ic);
        else g.idx.push(ia, ib, ic, ia, ic, id);
        emitted++;
      }
    }
    this.quadCount += emitted;
    return emitted;
  }

  // Triangle fan from a centre point to a closed ring of [x, y, z] points.
  // Vertex layout: index 0 = centre, index j + 1 = ring[j].
  addFan(centre, ring, key, expect = [0, 1, 0]) {
    const n = ring.length;
    if (n < 3) return 0;
    const g = this.group(key);
    const base = g.vcount;
    const pts = [centre, ...ring];
    const accum = pts.map(() => [0, 0, 0]);
    const tris = [];
    for (let j = 0; j < n; j++) {
      const ia = j + 1;
      const ib = ((j + 1) % n) + 1;
      const a = pts[ia];
      const b = pts[ib];
      const ua = [a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]];
      const ub = [b[0] - centre[0], b[1] - centre[1], b[2] - centre[2]];
      let nn = [ua[1] * ub[2] - ua[2] * ub[1], ua[2] * ub[0] - ua[0] * ub[2], ua[0] * ub[1] - ua[1] * ub[0]];
      const l = Math.hypot(nn[0], nn[1], nn[2]);
      if (l < EPSN) continue;
      nn = [nn[0] / l, nn[1] / l, nn[2] / l];
      const flip = nn[0] * expect[0] + nn[1] * expect[1] + nn[2] * expect[2] < 0;
      const sg = flip ? -1 : 1;
      const ti = flip ? [0, ib, ia] : [0, ia, ib];
      tris.push(ti);
      for (const k of ti) {
        accum[k][0] += nn[0] * sg;
        accum[k][1] += nn[1] * sg;
        accum[k][2] += nn[2] * sg;
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = accum[i];
      const l = Math.hypot(a[0], a[1], a[2]);
      const nn = l > EPSN ? [a[0] / l, a[1] / l, a[2] / l] : expect;
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(nn[0], nn[1], nn[2]);
      g.uv.push(p[0], p[2]);
    }
    for (const t of tris) g.idx.push(base + t[0], base + t[1], base + t[2]);
    g.vcount += pts.length;
    this.quadCount += tris.length;
    return tris.length;
  }

  // Single triangle (used to close small gaps at structure boundaries).
  addTriangle(p0, p1, p2, key, expect = [0, 1, 0]) {
    const g = this.group(key);
    const a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const b = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < EPSN) return 0;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const flip = n[0] * expect[0] + n[1] * expect[1] + n[2] * expect[2] < 0;
    if (flip) n = [-n[0], -n[1], -n[2]];
    const base = g.vcount;
    for (const p of flip ? [p0, p2, p1] : [p0, p1, p2]) {
      g.pos.push(p[0], p[1], p[2]);
      g.nrm.push(n[0], n[1], n[2]);
      g.uv.push(p[0], p[2]);
    }
    g.idx.push(base, base + 1, base + 2);
    g.vcount += 3;
    return 1;
  }

  // Finalise into typed arrays per group.
  finalize() {
    const out = new Map();
    let triangles = 0;
    let vertices = 0;
    for (const [key, g] of this.groups) {
      if (!g.idx.length) continue;
      const big = g.vcount > 65535;
      out.set(key, {
        key,
        position: Float32Array.from(g.pos),
        normal: Float32Array.from(g.nrm),
        uv: Float32Array.from(g.uv),
        index: big ? Uint32Array.from(g.idx) : Uint16Array.from(g.idx),
        vertexCount: g.vcount,
      });
      triangles += g.idx.length / 3;
      vertices += g.vcount;
    }
    return { groups: out, triangles, vertices };
  }
}

// Axis-aligned bounds of a list of [x, y, z] points (nulls ignored).
export function boundsOf(points) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const p of points) {
    if (!p) continue;
    for (let i = 0; i < 3; i++) {
      if (p[i] < b.min[i]) b.min[i] = p[i];
      if (p[i] > b.max[i]) b.max[i] = p[i];
    }
  }
  return b;
}
