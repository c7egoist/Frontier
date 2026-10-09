// Planar polygon kernel: boolean ops and offsets (clipper-lib, integer mm internally) and
// ear-cut triangulation with holes (earcut). All public values are metres in [x, z] pairs.
// Orientation convention: positive signed area = counter-clockwise in (x, z).

import earcut from '../../vendor/earcut/earcut.js';

/** mm per metre: clipper works on integers, so we quantise to 1 mm */
export const SCALE = 1000;
const ARC_TOL_MM = 1.5;

function lib() {
  const c = globalThis.ClipperLib;
  if (!c) throw new Error('ClipperLib is not loaded (include vendor/clipper/clipper.js first)');
  return c;
}

export function polyArea(poly) {
  let a = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % n];
    a += x0 * z1 - x1 * z0;
  }
  return a * 0.5;
}

export function reversed(poly) {
  return poly.slice().reverse();
}

export function orientPositive(poly) {
  return polyArea(poly) < 0 ? reversed(poly) : poly;
}

function toPath(poly) {
  const path = new Array(poly.length);
  for (let i = 0; i < poly.length; i++) {
    path[i] = { X: Math.round(poly[i][0] * SCALE), Y: Math.round(poly[i][1] * SCALE) };
  }
  return path;
}

function fromPath(path) {
  const out = new Array(path.length);
  for (let i = 0; i < path.length; i++) out[i] = [path[i].X / SCALE, path[i].Y / SCALE];
  return out;
}

/** drop consecutive duplicates / collinear spikes below 0.2 mm */
export function cleanPoly(poly) {
  const out = [];
  for (const p of poly) {
    const q = out[out.length - 1];
    if (!q || Math.abs(q[0] - p[0]) > 2e-4 || Math.abs(q[1] - p[1]) > 2e-4) out.push(p);
  }
  if (out.length > 1) {
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.abs(f[0] - l[0]) < 2e-4 && Math.abs(f[1] - l[1]) < 2e-4) out.pop();
  }
  return out;
}

function runClip(clipType, subject, clip) {
  const C = lib();
  const cpr = new C.Clipper();
  if (subject.length) cpr.AddPaths(subject.map(toPath), C.PolyType.ptSubject, true);
  if (clip && clip.length) cpr.AddPaths(clip.map(toPath), C.PolyType.ptClip, true);
  const sol = new C.Paths();
  cpr.Execute(C.ClipType[clipType], sol, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero);
  return sol.map(fromPath).map(cleanPoly).filter((p) => p.length >= 3 && Math.abs(polyArea(p)) > 1e-7);
}

/** union of polygons (any orientation). Outer rings come back positive, holes negative. */
export function unionPolys(polys) {
  const pos = polys.filter((p) => p && p.length >= 3).map(orientPositive);
  if (!pos.length) return [];
  return runClip('ctUnion', pos, []);
}

export function differencePolys(subject, clip) {
  const s = subject.filter((p) => p && p.length >= 3).map(orientPositive);
  if (!s.length) return [];
  const c = clip.filter((p) => p && p.length >= 3).map(orientPositive);
  if (!c.length) return s;
  return runClip('ctDifference', s, c);
}

export function intersectPolys(a, b) {
  const s = a.filter((p) => p && p.length >= 3).map(orientPositive);
  const c = b.filter((p) => p && p.length >= 3).map(orientPositive);
  if (!s.length || !c.length) return [];
  return runClip('ctIntersection', s, c);
}

/** round-join offset of polygons by delta metres (positive grows the outer boundary) */
export function offsetPolys(polys, delta) {
  const pos = polys.filter((p) => p && p.length >= 3).map(orientPositive);
  if (!pos.length) return [];
  if (Math.abs(delta) < 1e-6) return pos.slice();
  const C = lib();
  const co = new C.ClipperOffset(2.0, ARC_TOL_MM);
  co.AddPaths(pos.map(toPath), C.JoinType.jtRound, C.EndType.etClosedPolygon);
  const sol = new C.Paths();
  co.Execute(sol, Math.round(delta * SCALE));
  return sol.map(fromPath).map(cleanPoly).filter((p) => p.length >= 3 && Math.abs(polyArea(p)) > 1e-7);
}

/** morphological closing: fills concave corners with radius r, keeps convex corners sharp */
export function closePolys(polys, r) {
  if (!(r > 0.001)) return unionPolys(polys);
  const u = unionPolys(polys);
  return offsetPolys(offsetPolys(u, r), -r);
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Triangulate a polygon (outer ring + optional hole rings). Returns the vertex list used by
 * the triangle indices (outer ring first, then holes) and the triangles as index triples.
 */
export function triangulate(outer, holes = []) {
  const verts = [];
  const data = [];
  const holeIdx = [];
  const push = (ring) => {
    for (const p of ring) {
      verts.push(p);
      data.push(p[0], p[1]);
    }
  };
  push(outer);
  for (const h of holes) {
    holeIdx.push(verts.length);
    push(h);
  }
  const idx = earcut(data, holeIdx.length ? holeIdx : null, 2);
  const tris = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    if (a === b || b === c || a === c) continue;
    tris.push([a, b, c]);
  }
  return { verts, tris };
}

/** classify clipper output into outer rings and hole rings */
export function splitOuterHoles(polys) {
  const outers = [];
  const holes = [];
  for (const p of polys) (polyArea(p) >= 0 ? outers : holes).push(p);
  return { outers, holes };
}

/** assign each hole to the outer ring that contains it */
export function groupRings(polys) {
  const { outers, holes } = splitOuterHoles(polys);
  const groups = outers.map((o) => ({ outer: o, holes: [] }));
  for (const h of holes) {
    const probe = h[0];
    const g = groups.find((gr) => pointInPoly(probe[0], probe[1], gr.outer));
    if (g) g.holes.push(reversed(h));
  }
  return groups;
}
