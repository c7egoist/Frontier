// ============================================================================
// quad-core.mjs — vector-shape -> all-quad tread meshing (no heightmaps)
//
// Pipeline (every step is real geometry, nothing is sampled from a texture):
//   1. Shapes are polygons in one unwrapped tread tile (u = around, v = across).
//   2. Shape edges are subdivided, split at every mutual intersection and used
//      as *constraints* for a Delaunay triangulation of the tile, with grid
//      Steiner points for interior density.
//   3. Each triangle is classified by point-in-polygon against the shape stack
//      (topmost shape wins) -> each region gets a true height (lug top / groove
//      floor / sipe floor). The background is the groove floor when lugs exist.
//   4. Every triangle is converted to exactly 3 quads (edge midpoints +
//      centroid). Height boundaries get real wall quads, with an optional
//      chamfer ring (inset top ring + 45 deg wall strip). Result: 100% quads.
//   5. The tile is arrayed around the tyre (straight / alternate mirror /
//      alternate flip / alternate 180), vertices are welded at the seam, then
//      wrapped onto the crowned + shouldered tyre profile.
// Deformation therefore moves real quad vertices; OBJ export writes true
// 4-vertex faces. (GPUs rasterise quads as 2 triangles internally — that is
// display only and never changes the stored topology.)
// ============================================================================

export const TAU = Math.PI * 2;
const EPS = 1e-9;

// ---------------------------------------------------------------- utilities
export const dist2 = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1]; return dx * dx + dy * dy; };
export function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i], [u, v] = pts[(i + 1) % pts.length]; a += x * v - u * y; } return a / 2; }
export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function pointSegDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
  const c1 = vx * wx + vy * wy, c2 = vx * vx + vy * vy;
  const t = c2 > EPS ? Math.max(0, Math.min(1, c1 / c2)) : 0;
  return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
}
function segIntersect(p1, p2, p3, p4) { // proper crossing -> {t,u,point} | null
  const d1 = [p2[0] - p1[0], p2[1] - p1[1]], d2 = [p4[0] - p3[0], p4[1] - p3[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(den) < 1e-12) return null;
  const dx = p3[0] - p1[0], dy = p3[1] - p1[1];
  const t = (dx * d2[1] - dy * d2[0]) / den, u = (dx * d1[1] - dy * d1[0]) / den;
  if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return { t, u, point: [p1[0] + d1[0] * t, p1[1] + d1[1] * t] };
  return null;
}
function clipToRect(pts, x0, y0, x1, y1) { // Sutherland–Hodgman
  const edges = [
    [p => p[0] >= x0, (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0] || EPS); return [x0, a[1] + (b[1] - a[1]) * t]; }],
    [p => p[0] <= x1, (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0] || EPS); return [x1, a[1] + (b[1] - a[1]) * t]; }],
    [p => p[1] >= y0, (a, b) => { const t = (y0 - a[1]) / (b[1] - a[1] || EPS); return [a[0] + (b[0] - a[0]) * t, y0]; }],
    [p => p[1] <= y1, (a, b) => { const t = (y1 - a[1]) / (b[1] - a[1] || EPS); return [a[0] + (b[0] - a[0]) * t, y1]; }],
  ];
  let out = pts;
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); }
      else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
/** Chaikin corner-cutting: turns a polygon into a smooth closed curve (still a polygon). */
export function chaikin(pts, iterations = 1, closed = true) {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    const out = [];
    const n = p.length, last = closed ? n : n - 1;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < last; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

// ------------------------------------------------------------------- shapes
// Shape: { id, name, role:'lug'|'groove'|'sipe', depth(mm), points:[[u,v]..] }
// u in tile units (0..1 = one pitch, may exceed for wrap shapes), v in -1..1.
let shapeSeq = 0;
export function makeShape(points, o = {}) {
  return Object.assign({ id: 's' + (++shapeSeq), name: 'Shape', role: 'lug', depth: 10, smooth: 0, points: points.map(p => [...p]) }, o);
}
export function shapeHeight(shape, background) {
  if (shape.role === 'lug') return 0;
  return -Math.abs(shape.depth); // groove / sipe cut down from the tread surface
}
/** Polygon of a shape in tile millimetres (x: 0..pitch around, y: across). */
export function shapePolygonMM(shape, pitch, width) {
  let pts = shape.points.map(([u, v]) => [u * pitch, v * width / 2]);
  if (shape.smooth > 0) pts = chaikin(pts, Math.min(3, shape.smooth | 0));
  return pts;
}

// ------------------------------------------------------- SVG import / export
function flattenCubic(p0, p1, p2, p3, out, n = 16) {
  for (let i = 1; i <= n; i++) {
    const t = i / n, m = 1 - t;
    out.push([m ** 3 * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t ** 3 * p3[0],
              m ** 3 * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t ** 3 * p3[1]]);
  }
}
function flattenQuad(p0, p1, p2, out, n = 12) {
  for (let i = 1; i <= n; i++) { const t = i / n, m = 1 - t; out.push([m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0], m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1]]); }
}
/** Parse one SVG path `d` (M L H V C S Q T A Z, abs+rel) into sub-path point lists (SVG coords). */
export function parsePathData(d) {
  const tokens = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const paths = []; let cur = null, p = [0, 0], start = [0, 0], cmd = '', prevCubic = null, prevQuad = null;
  let i = 0; const num = () => parseFloat(tokens[i++]);
  const newSub = () => { cur = []; paths.push(cur); };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) { cmd = tokens[i++]; if (cmd === 'Z' || cmd === 'z') { if (cur && cur.length) { p = [...start]; } prevCubic = prevQuad = null; } if (cmd === 'M' || cmd === 'm') { /* handled below */ } continue; }
    const rel = cmd === cmd.toLowerCase() && cmd !== '';
    const C = cmd.toUpperCase();
    if (C === 'M') { const x = num(), y = num(); p = rel ? [p[0] + x, p[1] + y] : [x, y]; start = [...p]; newSub(); cur.push([...p]); cmd = rel ? 'l' : 'L'; }
    else if (C === 'L') { const x = num(), y = num(); p = rel ? [p[0] + x, p[1] + y] : [x, y]; if (!cur) newSub(); cur.push([...p]); }
    else if (C === 'H') { const x = num(); p = [rel ? p[0] + x : x, p[1]]; cur.push([...p]); }
    else if (C === 'V') { const y = num(); p = [p[0], rel ? p[1] + y : y]; cur.push([...p]); }
    else if (C === 'C' || C === 'S') {
      let c1, c2, e;
      if (C === 'C') { const a = num(), b = num(), c = num(), dd = num(), e2 = num(), f = num(); c1 = rel ? [p[0] + a, p[1] + b] : [a, b]; c2 = rel ? [p[0] + c, p[1] + dd] : [c, dd]; e = rel ? [p[0] + e2, p[1] + f] : [e2, f]; }
      else { const c = num(), dd = num(), e2 = num(), f = num(); c1 = prevCubic ? [2 * p[0] - prevCubic[0], 2 * p[1] - prevCubic[1]] : [...p]; c2 = rel ? [p[0] + c, p[1] + dd] : [c, dd]; e = rel ? [p[0] + e2, p[1] + f] : [e2, f]; }
      flattenCubic(p, c1, c2, e, cur); prevCubic = c2; prevQuad = null; p = e;
    } else if (C === 'Q' || C === 'T') {
      let c, e;
      if (C === 'Q') { const a = num(), b = num(), e2 = num(), f = num(); c = rel ? [p[0] + a, p[1] + b] : [a, b]; e = rel ? [p[0] + e2, p[1] + f] : [e2, f]; }
      else { const e2 = num(), f = num(); c = prevQuad ? [2 * p[0] - prevQuad[0], 2 * p[1] - prevQuad[1]] : [...p]; e = rel ? [p[0] + e2, p[1] + f] : [e2, f]; }
      flattenQuad(p, c, e, cur); prevQuad = c; prevCubic = null; p = e;
    } else if (C === 'A') {
      const rx = num(), ry = num(); num(); num(); num(); const x = num(), y = num();
      const e = rel ? [p[0] + x, p[1] + y] : [x, y];
      // circular-arc approximation: sample the minor arc through the midpoint bulge
      const steps = 14, mx = (p[0] + e[0]) / 2, my = (p[1] + e[1]) / 2;
      const chord = Math.hypot(e[0] - p[0], e[1] - p[1]) || 1, r = Math.max(rx || chord / 2, chord / 2);
      const h = Math.sqrt(Math.max(0, r * r - chord * chord / 4));
      const nx = -(e[1] - p[1]) / chord, ny = (e[0] - p[0]) / chord;
      const cx = mx + nx * h, cy = my + ny * h;
      const a0 = Math.atan2(p[1] - cy, p[0] - cx); let a1 = Math.atan2(e[1] - cy, e[0] - cx);
      while (a1 - a0 > Math.PI) a1 -= TAU; while (a1 - a0 < -Math.PI) a1 += TAU;
      for (let k = 1; k <= steps; k++) { const a = a0 + (a1 - a0) * k / steps; cur.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      prevCubic = prevQuad = null; p = e;
    } else { i++; }
  }
  return paths.filter(p => p.length >= 3);
}
/** Parse an SVG document (path/polygon/polyline/rect/circle/ellipse) into tread shapes. */
export function parseSVG(svgText, o = {}) {
  const vbMatch = String(svgText).match(/viewBox\s*=\s*"([^"]+)"/);
  const vb = vbMatch ? vbMatch[1].trim().split(/[\s,]+/).map(Number) : [0, 0, 100, 100];
  const [vx, vy, vw, vh] = (vb.length === 4 && vb[2] > 0) ? vb : [0, 0, 100, 100];
  const toUV = ([x, y]) => [(x - vx) / vw, 1 - 2 * (y - vy) / vh]; // svg y-down -> v up
  const shapes = [];
  const add = (pts, name) => { if (pts.length >= 3) shapes.push(makeShape(pts.map(toUV), { name, role: o.role || 'lug', depth: o.depth ?? 12 })); };
  for (const m of String(svgText).matchAll(/<path[^>]*\sd="([^"]+)"/g)) parsePathData(m[1]).forEach((p, k) => add(p, 'SVG path ' + (k + 1)));
  for (const m of String(svgText).matchAll(/<polygon[^>]*\spoints="([^"]+)"/g)) add(m[1].trim().split(/[\s,]+/).map(Number).reduce((a, v, i, arr) => i % 2 ? a : [...a, [v, arr[i + 1]]], []), 'SVG polygon');
  for (const m of String(svgText).matchAll(/<rect[^>]*>/g)) {
    const a = Object.fromEntries([...m[0].matchAll(/(\w+)="([^"]+)"/g)].map(x => [x[1], parseFloat(x[2])]));
    const x = a.x || 0, y = a.y || 0, w = a.width || 0, h = a.height || 0;
    if (w && h) add([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 'SVG rect');
  }
  for (const m of String(svgText).matchAll(/<(?:circle|ellipse)[^>]*>/g)) {
    const a = Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]+)"/g)].map(x => [x[1], parseFloat(x[2])]));
    const cx = a.cx || 0, cy = a.cy || 0, rx = a.rx || a.r || 0, ry = a.ry || a.r || 0, pts = [];
    for (let k = 0; k < 24; k++) pts.push([cx + rx * Math.cos(k / 24 * TAU), cy + ry * Math.sin(k / 24 * TAU)]);
    if (rx && ry) add(pts, 'SVG ellipse');
  }
  return shapes;
}
export function shapesToSVG(shapes, pitch = 64, width = 210) {
  const polys = shapes.map(s => shapePolygonMM(s, pitch, width).map(([x, y]) => `${x.toFixed(2)},${(-y + width / 2).toFixed(2)}`).join(' ')).join('</polygon>\n  <polygon points="');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pitch} ${width}">\n  <polygon points="${polys}</polygon>\n</svg>\n`;
}

// ------------------------------------------------------------- triangulation
function delaunay(points) { // Bowyer–Watson
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const M = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1) * 100;
  const base = points.length;
  const P = points.concat([[cx - M, cy - M], [cx + M, cy - M], [cx, cy + M]]);
  let tris = [[base, base + 1, base + 2]];
  const circum = (a, b, c) => {
    const [ax, ay] = P[a], [bx, by] = P[b], [ccx, ccy] = P[c];
    const d = 2 * (ax * (by - ccy) + bx * (ccy - ay) + ccx * (ay - by));
    if (Math.abs(d) < 1e-14) return null;
    const ux = ((ax * ax + ay * ay) * (by - ccy) + (bx * bx + by * by) * (ccy - ay) + (ccx * ccx + ccy * ccy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (ccx - bx) + (bx * bx + by * by) * (ax - ccx) + (ccx * ccx + ccy * ccy) * (bx - ax)) / d;
    return [ux, uy, Math.hypot(ax - ux, ay - uy)];
  };
  for (let pi = 0; pi < base; pi++) {
    const bad = [], p = P[pi];
    for (const t of tris) { const c = circum(t[0], t[1], t[2]); if (c && Math.hypot(p[0] - c[0], p[1] - c[1]) < c[2] - 1e-10) bad.push(t); }
    const edgeCount = new Map();
    for (const t of bad) for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a; edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }
    tris = tris.filter(t => !bad.includes(t));
    for (const [k, n] of edgeCount) if (n === 1) { const [a, b] = k.split('_').map(Number); tris.push([a, b, pi]); }
  }
  return tris.filter(t => t.every(v => v < base) && Math.abs(polyArea([P[t[0]], P[t[1]], P[t[2]]])) > 1e-10)
    .map(t => polyArea([P[t[0]], P[t[1]], P[t[2]]]) < 0 ? [t[0], t[2], t[1]] : t); // CCW
}

// -------------------------------------------------------------- tile meshing
/**
 * Mesh one tread tile into pure quads.
 * opts: { pitch, width, treadDepth, edge (target edge mm), bevel (mm), smoothIters }
 * returns { vertices:[[x,y,h]..], quads:[[a,b,c,d]..], stats, pitch, width }
 * x: 0..pitch (around), y: -width/2..width/2 (across), h: height offset (0 top, negative = cut)
 */
export function buildTileMesh(shapes, opts = {}) {
  const pitch = opts.pitch ?? 64, width = opts.width ?? 210, halfW = width / 2;
  const edge = Math.max(3, opts.edge ?? 9), bevel = Math.max(0, opts.bevel ?? 1.6);
  const treadDepth = opts.treadDepth ?? 12;

  // 1 — clipped shape polygons (with +/- one pitch copies so wrap shapes work)
  const polys = []; // { pts, shape }
  for (const s of shapes) {
    if (s.points.length < 3) continue;
    const raw = shapePolygonMM(s, pitch, width);
    for (const dx of [-pitch, 0, pitch]) {
      const shifted = raw.map(([x, y]) => [x + dx, y]);
      const clipped = clipToRect(shifted, 0, -halfW, pitch, halfW);
      if (clipped.length >= 3 && Math.abs(polyArea(clipped)) > 0.01) polys.push({ pts: clipped, shape: s });
    }
  }
  const hasLug = shapes.some(s => s.role === 'lug');
  const background = hasLug ? -treadDepth : 0;
  const heightAt = (x, y) => {
    let h = background;
    for (const { pts, shape } of polys) if (pointInPolygon(x, y, pts)) h = shapeHeight(shape, background); // later shapes win
    return h;
  };

  // 2 — constraint segments: polygon edges subdivided, split at intersections
  const pointMap = new Map(), points = [], pointFixed = [];
  const pid = (p, fixed = false) => {
    // snap-merge points closer than ~0.3mm: intersection splits otherwise
    // create microscopic constraint segments, and microscopic segments are
    // exactly where sliver quads are born.
    const k = Math.round(p[0] / 0.3) + '_' + Math.round(p[1] / 0.3);
    if (!pointMap.has(k)) { pointMap.set(k, points.length); points.push([p[0], p[1]]); pointFixed.push(fixed); }
    else if (fixed) pointFixed[pointMap.get(k)] = true;
    return pointMap.get(k);
  };
  let segs = []; // [ [x,y],[x,y] ]
  const tilePts = [[0, -halfW], [pitch, -halfW], [pitch, halfW], [0, halfW]];
  for (let i = 0; i < 4; i++) { // tile border subdivided like every other constraint
    const a = tilePts[i], b = tilePts[(i + 1) % 4], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / edge));
    for (let k = 0; k < n; k++) segs.push([[a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]]);
  }
  for (const { pts } of polys) {
    // local feature size: a thin sipe must be subdivided at ~its own width,
    // or the triangles inside it are long slivers no smoothing can repair.
    const per = pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0) || 1;
    const localEdge = Math.max(1.8, Math.min(edge, Math.abs(polyArea(pts)) * 2 / per * 1.1));
    for (let i = 0; i < pts.length; i++) {
      let a = pts[i], b = pts[(i + 1) % pts.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / localEdge));
      for (let k = 0; k < n; k++) segs.push([[a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n]]);
    }
  }
  // split at crossings
  const splits = segs.map(() => []);
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const hit = segIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
    if (hit) { splits[i].push(hit.t); splits[j].push(hit.u); }
  }
  const constraints = new Set(); // "a_b" point-index pairs
  segs.forEach(([a, b], i) => {
    const ts = [0, ...splits[i].sort((x, y) => x - y), 1];
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const ia = pid(p(ts[k]), true), ib = pid(p(ts[k + 1]), true);
      if (ia !== ib) constraints.add(ia < ib ? ia + '_' + ib : ib + '_' + ia);
    }
  });

  // 3 — Steiner grid points (kept clear of constraint edges)
  const segPts = [...constraints].map(k => k.split('_').map(Number).map(i => points[i]));
  for (let gy = -halfW + edge * 0.5, row = 0; gy < halfW; gy += edge, row++) {
    for (let gx = edge * (row % 2 ? 0.75 : 0.25); gx < pitch; gx += edge) {
      const p = [gx, gy];
      if (segPts.some(([a, b]) => pointSegDist(p, a, b) < edge * 0.42)) continue;
      if (points.some(q => dist2(q, p) < (edge * 0.45) ** 2)) continue;
      pid(p);
    }
  }

  // 3b — interior samples inside each shape, spaced at that shape's local
  //      feature size, so wide grooves/bars triangulate isotropically too.
  for (const { pts } of polys) {
    const per = pts.reduce((s, p, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0) || 1;
    const step = Math.max(1.8, Math.min(edge, Math.abs(polyArea(pts)) * 2 / per * 1.1));
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    for (let gy = Math.min(...ys) + step * 0.5; gy < Math.max(...ys); gy += step) {
      for (let gx = Math.min(...xs) + step * 0.5; gx < Math.max(...xs); gx += step) {
        const p = [gx, gy];
        if (!pointInPolygon(gx, gy, pts)) continue;
        let nearEdge = false;
        for (let i = 0; i < pts.length; i++) if (pointSegDist(p, pts[i], pts[(i + 1) % pts.length]) < step * 0.3) { nearEdge = true; break; }
        if (nearEdge || points.some(q => dist2(q, p) < (step * 0.4) ** 2)) continue;
        pid(p);
      }
    }
  }

  // 4 — Delaunay; insert midpoints of any constraint edge that is still missing
  let tris = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    tris = delaunay(points);
    const edgeSet = new Set();
    for (const t of tris) for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3]; edgeSet.add(a < b ? a + '_' + b : b + '_' + a); }
    const missing = [...constraints].filter(k => !edgeSet.has(k));
    // also drop triangles whose centroid falls outside the tile (paranoia)
    tris = tris.filter(t => { const cx = (points[t[0]][0] + points[t[1]][0] + points[t[2]][0]) / 3, cy = (points[t[0]][1] + points[t[1]][1] + points[t[2]][1]) / 3; return cx >= -0.01 && cx <= pitch + 0.01 && cy >= -halfW - 0.01 && cy <= halfW + 0.01; });
    if (!missing.length) break;
    for (const k of missing) { const [a, b] = k.split('_').map(Number); pid([(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2], true); }
    if (attempt === 11) tris = delaunay(points);
  }

  // 5 — classify triangles, find height boundaries
  const triH = tris.map(t => heightAt((points[t[0]][0] + points[t[1]][0] + points[t[2]][0]) / 3, (points[t[0]][1] + points[t[1]][1] + points[t[2]][1]) / 3));
  const edgeTris = new Map();
  tris.forEach((t, ti) => { for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a; if (!edgeTris.has(k)) edgeTris.set(k, []); edgeTris.get(k).push(ti); } });
  const boundary = new Map(); // edgeKey -> {a,b,hi,lo,nLo:[x,y]}
  for (const [k, list] of edgeTris) {
    if (list.length !== 2) continue;
    const [t0, t1] = list, h0 = triH[t0], h1 = triH[t1];
    if (Math.abs(h0 - h1) < 1e-6) continue;
    const [a, b] = k.split('_').map(Number);
    const hi = h0 > h1 ? t0 : t1, lo = h0 > h1 ? t1 : t0;
    const cen = t => [0, 1, 2].map(i => points[tris[t][i]]).reduce((s, p) => [s[0] + p[0] / 3, s[1] + p[1] / 3], [0, 0]);
    const mid = [(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2], lc = cen(lo);
    let n = [lc[0] - mid[0], lc[1] - mid[1]]; const l = Math.hypot(...n) || 1; n = [n[0] / l, n[1] / l];
    boundary.set(k, { a, b, hiH: triH[hi], loH: triH[lo], nLo: n });
  }
  // per-point inset direction for the high side of boundaries
  // (nLo points into the low region; the high block's top ring moves the other way)
  const insetVec = new Map();
  for (const { a, b, hiH, nLo } of boundary.values()) for (const id of [a, b]) {
    const k = id + '|' + hiH.toFixed(3), prev = insetVec.get(k) || [0, 0];
    insetVec.set(k, [prev[0] - nLo[0], prev[1] - nLo[1]]); // into the high region
  }
  for (const [k, v] of insetVec) { const l = Math.hypot(...v) || 1; insetVec.set(k, [v[0] / l * bevel, v[1] / l * bevel]); }
  // chamfer must never eat a whole short edge: scale each point's inset by the
  // shortest boundary edge touching it
  if (bevel > 0) {
    const minEdgeAt = new Map();
    for (const { a, b } of boundary.values()) {
      const len = Math.hypot(points[b][0] - points[a][0], points[b][1] - points[a][1]);
      for (const id of [a, b]) minEdgeAt.set(id, Math.min(minEdgeAt.get(id) ?? 1e9, len));
    }
    for (const [k, v] of insetVec) {
      const id = Number(k.split('|')[0]), maxInset = (minEdgeAt.get(id) ?? bevel) * 0.35;
      const l = Math.hypot(...v); if (l > maxInset && l > 1e-9) insetVec.set(k, [v[0] / l * maxInset, v[1] / l * maxInset]);
    }
  }

  // 6 — vertices (duplicated per height so walls have a hard edge), tri -> 3 quads
  const vertices = [], vertexFixed = [], quads = [], vCache = new Map();
  const hKey = h => h.toFixed(3);
  const pointVertex = (id, h) => {
    const k = 'p' + id + '|' + hKey(h);
    if (!vCache.has(k)) {
      const ins = bevel > 0 ? insetVec.get(id + '|' + hKey(h)) : null;
      const p = points[id];
      vCache.set(k, vertices.length); vertices.push([p[0] + (ins ? ins[0] : 0), p[1] + (ins ? ins[1] : 0), h]); vertexFixed.push(!!pointFixed[id]);
    }
    return vCache.get(k);
  };
  const midVertex = (a, b, h, edgeKey) => {
    const k = 'm' + edgeKey + '|' + hKey(h);
    if (!vCache.has(k)) {
      let p = [(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2];
      const bd = boundary.get(edgeKey);
      if (bd && bevel > 0 && Math.abs(h - bd.hiH) < 1e-6) { const bl = Math.min(bevel, Math.hypot(points[b][0] - points[a][0], points[b][1] - points[a][1]) * 0.35); p = [p[0] - bd.nLo[0] * bl, p[1] - bd.nLo[1] * bl]; }
      vCache.set(k, vertices.length); vertices.push([p[0], p[1], h]); vertexFixed.push(constraints.has(edgeKey) || boundary.has(edgeKey));
    }
    return vCache.get(k);
  };
  tris.forEach((t, ti) => {
    const h = triH[ti], eKeys = [0, 1, 2].map(e => { const a = t[e], b = t[(e + 1) % 3]; return a < b ? a + '_' + b : b + '_' + a; });
    const A = pointVertex(t[0], h), B = pointVertex(t[1], h), C = pointVertex(t[2], h);
    const mab = midVertex(t[0], t[1], h, eKeys[0]), mbc = midVertex(t[1], t[2], h, eKeys[1]), mca = midVertex(t[2], t[0], h, eKeys[2]);
    const cen = [(points[t[0]][0] + points[t[1]][0] + points[t[2]][0]) / 3, (points[t[0]][1] + points[t[1]][1] + points[t[2]][1]) / 3];
    // relax centroid toward the triangle's quad-friendly centre (average of mids)
    const G = vertices.length; vertices.push([cen[0], cen[1], h]); vertexFixed.push(false);
    quads.push([A, mab, G, mca], [mab, B, mbc, G], [mca, G, mbc, C]);
  });

  // 6b — Laplacian relaxation of the free (non-constraint) vertices. Shape
  //      outlines, tile borders and wall rings stay exactly where drawn; the
  //      interior Steiner/midpoint/centroid vertices settle into regular
  //      quad flow. This is what removes sliver quads from the raw split.
  {
    const adj = vertices.map(() => new Set()), adjQuads = vertices.map(() => []);
    quads.forEach((q, qi) => { for (let i = 0; i < 4; i++) { adj[q[i]].add(q[(i + 1) % 4]); adj[q[i]].add(q[(i + 3) % 4]); adjQuads[q[i]].push(qi); } });
    const quadArea2D = (q, V) => { let a = 0; for (let i = 0; i < 4; i++) { const p = V[q[i]], n = V[q[(i + 1) % 4]]; a += p[0] * n[1] - n[0] * p[1]; } return a / 2; };
    for (let iter = 0; iter < (opts.smoothIters ?? 12); iter++) {
      for (let i = 0; i < vertices.length; i++) {
        if (vertexFixed[i] || !adj[i].size) continue;
        let sx = 0, sy = 0; for (const j of adj[i]) { sx += vertices[j][0]; sy += vertices[j][1]; }
        const ox = vertices[i][0], oy = vertices[i][1];
        vertices[i][0] = ox + (sx / adj[i].size - ox) * 0.6;
        vertices[i][1] = oy + (sy / adj[i].size - oy) * 0.6;
        // fold guard: never let a move flip or collapse an incident quad
        if (adjQuads[i].some(qi => quadArea2D(quads[qi], vertices) < 0.02)) { vertices[i][0] = ox; vertices[i][1] = oy; }
      }
    }
  }

  // 7 — walls (+ chamfer strip) along every height boundary, split at midpoints
  //     so wall edges match the subdivided top faces exactly.
  const chamferVertex = (desc, xy, h) => {
    const k = 'c' + desc + '|' + hKey(h);
    if (!vCache.has(k)) { vCache.set(k, vertices.length); vertices.push([xy[0], xy[1], h]); }
    return vCache.get(k);
  };
  for (const [k, bd] of boundary) {
    const { a, b, hiH, loH } = bd, diff = hiH - loH;
    const midXY = [(points[a][0] + points[b][0]) / 2, (points[a][1] + points[b][1]) / 2];
    const drops = bevel > 0.05 && diff > 0.15 ? Math.min(bevel, diff * 0.45) : 0;
    const halves = [
      [{ id: a, xy: points[a] }, { mid: true, xy: midXY }],
      [{ mid: true, xy: midXY }, { id: b, xy: points[b] }],
    ];
    for (const [P, Q] of halves) {
      const top = (d) => d.mid ? midVertex(a, b, hiH, k) : pointVertex(d.id, hiH);
      const bot = (d) => d.mid ? midVertex(a, b, loH, k) : pointVertex(d.id, loH);
      const tA = top(P), tB = top(Q), bA = bot(P), bB = bot(Q);
      if (drops > 0) {
        const cA = chamferVertex((P.mid ? 'm' + k : 'p' + P.id), P.xy, hiH - drops);
        const cB = chamferVertex((Q.mid ? 'm' + k : 'p' + Q.id), Q.xy, hiH - drops);
        quads.push([tA, cA, cB, tB], [cA, bA, bB, cB]);
      } else quads.push([tA, bA, bB, tB]);
    }
  }

  const stats = validateQuadMesh({ vertices, quads });
  return { vertices, quads, stats, pitch, width, trianglesUsedInternally: tris.length };
}

// --------------------------------------------------------------- validation
/** Honest topology report. positions: flat [x,y,z..] or [[..]]; quads: index arrays. */
export function validateQuadMesh(mesh) {
  const V = mesh.vertices || [], F = mesh.quads || mesh.faces || [];
  const tris = F.filter(f => f.length === 3).length, quads = F.filter(f => f.length === 4).length, other = F.length - tris - quads;
  const valence = new Array(V.length).fill(0);
  const edges = new Map(); let degenerate = 0, minAngle = 180, maxNonplanar = 0;
  const P = i => V[i];
  for (const f of F) {
    for (const v of f) valence[v]++;
    for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length], k = a < b ? a + '_' + b : b + '_' + a; edges.set(k, (edges.get(k) || 0) + 1); }
    if (f.length === 4) {
      const [a, b, c, d] = f.map(P);
      // corner angles
      for (let i = 0; i < 4; i++) {
        const p = f.map(P)[i], q = f.map(P)[(i + 1) % 4], r = f.map(P)[(i + 3) % 4];
        const v1 = [q[0] - p[0], q[1] - p[1], (q[2] || 0) - (p[2] || 0)], v2 = [r[0] - p[0], r[1] - p[1], (r[2] || 0) - (p[2] || 0)];
        const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
        if (l1 < 1e-9 || l2 < 1e-9) { degenerate++; continue; }
        const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (l1 * l2)))) * 180 / Math.PI;
        if (ang < minAngle) minAngle = ang;
      }
      // non-planarity: distance of d from plane a,b,c relative to quad size
      const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
      const nl = Math.hypot(...n) || 1, size = Math.hypot(c[0] - a[0], c[1] - a[1], (c[2] || 0) - (a[2] || 0)) || 1;
      const dnp = Math.abs((d[0] - a[0]) * n[0] + (d[1] - a[1]) * n[1] + ((d[2] || 0) - (a[2] || 0)) * n[2]) / nl / size;
      if (dnp > maxNonplanar) maxNonplanar = dnp;
    }
  }
  let poorQuads = 0;
  for (const f of F) {
    if (f.length !== 4) continue;
    let worst = 180;
    for (let i = 0; i < 4; i++) {
      const p = P(f[i]), q = P(f[(i + 1) % 4]), r = P(f[(i + 3) % 4]);
      const v1 = [q[0] - p[0], q[1] - p[1], (q[2] || 0) - (p[2] || 0)], v2 = [r[0] - p[0], r[1] - p[1], (r[2] || 0) - (p[2] || 0)];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2); if (l1 < 1e-9 || l2 < 1e-9) continue;
      worst = Math.min(worst, Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (l1 * l2)))) * 180 / Math.PI);
    }
    if (worst < 25) poorQuads++;
  }
  const extraordinary = valence.filter(v => v !== 4 && v > 0).length;
  const boundaryEdges = [...edges.values()].filter(n => n === 1).length;
  return {
    vertices: V.length, quads, triangles: tris, otherFaces: other,
    totalFaces: F.length, extraordinaryVertices: extraordinary,
    unusedVertices: valence.filter(v => v === 0).length,
    openEdges: boundaryEdges, degenerateQuads: degenerate,
    minQuadAngleDeg: Math.round(minAngle * 10) / 10, poorQuads,
    maxNonplanarity: Math.round(maxNonplanar * 1000) / 1000,
    allQuads: tris === 0 && other === 0 && degenerate === 0,
  };
}

// ---------------------------------------------------------------- tyre wrap
export function tyreDims(t) {
  const Rrim = t.rim * 25.4 / 2, H = t.width * t.aspect / 100, Rout = Rrim + H;
  const treadHalf = t.width / 2 * (t.treadFrac ?? 0.9);
  const sr = Math.min(t.shoulder ?? 16, H * 0.6);
  const acrossHalf = treadHalf + sr * Math.sin(80 * Math.PI / 180);
  return { Rrim, H, Rout, treadHalf, sr, acrossHalf, circ: TAU * Rout, rimHalf: t.width / 2 * (t.rimWidthFrac ?? 0.78) };
}
export function treadProfileAt(y, d, t) {
  const ay = Math.abs(y), sgn = Math.sign(y) || 1, crown = t.crown ?? 2;
  if (ay <= d.treadHalf) return { x: y, r: d.Rout - crown * (y / d.treadHalf) ** 2, nx: 0, nr: 1 };
  const phi = Math.min(80 * Math.PI / 180, Math.asin(Math.min(1, (ay - d.treadHalf) / d.sr)));
  return { x: sgn * (d.treadHalf + d.sr * Math.sin(phi)), r: d.Rout - crown - d.sr + d.sr * Math.cos(phi), nx: sgn * Math.sin(phi), nr: Math.cos(phi) };
}
const ARRAY_TRANSFORMS = {
  straight: (x, y, k, P) => [x, y, false],
  mirrorAlt: (x, y, k, P) => k % 2 ? [x, -y, true] : [x, y, false],     // alternate mirror across centreline
  flipAlt: (x, y, k, P) => k % 2 ? [P - x, y, true] : [x, y, false],    // alternate flip around
  rotateAlt: (x, y, k, P) => k % 2 ? [P - x, -y, false] : [x, y, false],// alternate 180 deg rotation
};
/**
 * Array a tile mesh around the tyre and wrap it onto the profile.
 * tyre: {width, aspect, rim, treadDepth, crown, shoulder, treadFrac}
 * opts: { repeats, mode, weldTolerance }
 * returns { tread:{positions:[[x,y,z]..], quads}, sidewall:{...}, dims, tileStats }
 */
export function buildTyreMesh(shapes, tyre, opts = {}) {
  const d = tyreDims(tyre);
  const width = Math.min(opts.width ?? d.acrossHalf * 2, d.acrossHalf * 2);
  const repeats = Math.max(1, Math.round(opts.repeats ?? Math.max(6, Math.round(d.circ / (opts.pitch ?? 64)))));
  const pitch = d.circ / repeats; // exact pitch so the seam closes perfectly
  const tile = buildTileMesh(shapes, { pitch, width, treadDepth: tyre.treadDepth, edge: opts.edge, bevel: opts.bevel });
  const tf = ARRAY_TRANSFORMS[opts.mode || 'straight'] || ARRAY_TRANSFORMS.straight;

  // place + weld (quantised position merge also closes the circumferential seam)
  const weld = new Map(), positions = [], quads = [];
  const tol = opts.weldTolerance ?? 1e-3;
  const placeVertex = (x, y, h, theta0) => {
    const pr = treadProfileAt(y, d, tyre);
    const ax = pr.x + pr.nx * h, r = pr.r + pr.nr * h, th = theta0 + x / d.Rout;
    return [ax, r * Math.cos(th), r * Math.sin(th)];
  };
  for (let k = 0; k < repeats; k++) {
    const indexMap = new Map();
    for (let vi = 0; vi < tile.vertices.length; vi++) {
      const [tx, ty, h] = tile.vertices[vi];
      const [mx, my, flipped] = tf(tx, ty, k, pitch);
      const p = placeVertex(mx, my, h, k * pitch / d.Rout);
      const key = p.map(v => Math.round(v / tol)).join('_');
      if (!weld.has(key)) { weld.set(key, positions.length); positions.push(p); }
      indexMap.set(vi, weld.get(key));
      var _flipped = flipped;
    }
    for (const q of tile.quads) {
      const mapped = q.map(v => indexMap.get(v));
      if (new Set(mapped).size < 4) continue;
      quads.push(_flipped ? [mapped[0], mapped[3], mapped[2], mapped[1]] : mapped);
    }
  }
  const tread = { positions, quads };
  tread.stats = validateQuadMesh({ vertices: positions, quads });

  // sidewalls: structured lathe (all quads), shoulder -> bead, both sides
  const sidewall = buildSidewall(d, tyre, Math.max(72, repeats * 12));
  const rim = buildRim(d, tyre);
  return { tread, sidewall, rim, dims: d, repeats, pitch, tileStats: tile.stats, tile };
}
function lathe(profile, segments) { // profile: [[axial, r]..] -> positions/quads around X axis
  const positions = [], quads = [];
  profile.forEach(([x, r], i) => { for (let j = 0; j < segments; j++) { const th = j / segments * TAU; positions.push([x, r * Math.cos(th), r * Math.sin(th)]); } });
  for (let i = 0; i + 1 < profile.length; i++) for (let j = 0; j < segments; j++) {
    const a = i * segments + j, b = i * segments + (j + 1) % segments, c = (i + 1) * segments + (j + 1) % segments, e = (i + 1) * segments + j;
    quads.push([a, b, c, e]);
  }
  return { positions, quads };
}
function buildSidewall(d, t, segments) {
  const prof = [];
  const edgeP = treadProfileAt(d.acrossHalf * 0.999, d, t);
  const shoulder = [edgeP.x, edgeP.r];
  const bead = [d.rimHalf, d.Rrim + 2];
  const P1 = [shoulder[0] + (d.width ?? t.width) / 2 * 0.06 + 4, shoulder[1] - d.H * 0.22];
  const P2 = [bead[0] + (Math.abs(shoulder[0]) - bead[0]) * 0.4, d.Rrim + d.H * 0.2];
  prof.push(shoulder);
  for (let i = 1; i <= 14; i++) { // cubic sidewall bulge
    const u = i / 14, m = 1 - u;
    prof.push([m ** 3 * shoulder[0] + 3 * m * m * u * P1[0] + 3 * m * u * u * P2[0] + u ** 3 * bead[0],
               m ** 3 * shoulder[1] + 3 * m * m * u * P1[1] + 3 * m * u * u * P2[1] + u ** 3 * bead[1]]);
  }
  prof.push([d.rimHalf - 3, d.Rrim - 1]);
  const right = lathe(prof, segments);
  const leftProf = prof.map(([x, r]) => [-x, r]).reverse();
  const left = lathe(leftProf, segments);
  const off = right.positions.length;
  return { positions: right.positions.concat(left.positions), quads: right.quads.concat(left.quads.map(q => q.map(v => v + off))) };
}
function buildRim(d, t) {
  const seat = d.Rrim + 2, half = d.rimHalf + 3;
  const barrel = [[-half, seat + 7], [-half + 4, seat + 9], [-half + 8, seat], [half - 8, seat], [half - 4, seat + 9], [half, seat + 7], [half - 2, seat - 3], [-half + 2, seat - 3]];
  const rim = lathe(barrel.concat([[0, seat - 3]]).slice(0, 8), 72);
  // front disc + hub + 5 quad-box spokes
  const positions = rim.positions.slice(), quads = rim.quads.slice();
  const discX = half - 14;
  const ring = (x, r, n = 36) => { const idx = []; for (let j = 0; j < n; j++) { const th = j / n * TAU; idx.push(positions.length); positions.push([x, r * Math.cos(th), r * Math.sin(th)]); } return idx; };
  const outer = ring(discX, seat - 4), hub = ring(discX, d.Rrim * 0.34);
  for (let j = 0; j < 36; j++) quads.push([outer[j], outer[(j + 1) % 36], hub[(j + 1) % 36], hub[j]]);
  const hubF = ring(discX - 10, d.Rrim * 0.34), hubB = ring(discX - 10, d.Rrim * 0.12);
  for (let j = 0; j < 36; j++) quads.push([hub[j], hub[(j + 1) % 36], hubF[(j + 1) % 36], hubF[j]]);
  for (let j = 0; j < 36; j++) quads.push([hubF[j], hubF[(j + 1) % 36], hubB[(j + 1) % 36], hubB[j]]);
  return { positions, quads };
}

// ------------------------------------------------------------------ export
export function toOBJ(mesh, name = 'tyre') {
  const lines = ['# All-quad mesh generated by quad-core.mjs', 'o ' + name];
  for (const p of mesh.positions) lines.push(`v ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`);
  for (const q of mesh.quads) lines.push('f ' + q.map(v => v + 1).join(' '));
  return lines.join('\n') + '\n';
}

// ----------------------------------------------------------------- presets
// Preset builders work in millimetres, then normalise to (u,v) for storage.
function mmShape(ptsMM, pitch, width, o) { return makeShape(ptsMM.map(([x, y]) => [x / pitch, y / (width / 2)]), o); }
function barMM(cx, cy, len, wid, angDeg, pitch, width, o) {
  const a = angDeg * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  return mmShape([[cx - dx * len / 2 - nx * wid / 2, cy - dy * len / 2 - ny * wid / 2], [cx + dx * len / 2 - nx * wid / 2, cy + dy * len / 2 - ny * wid / 2],
                  [cx + dx * len / 2 + nx * wid / 2, cy + dy * len / 2 + ny * wid / 2], [cx - dx * len / 2 + nx * wid / 2, cy - dy * len / 2 + ny * wid / 2]], pitch, width, o);
}
function rectMM(x0, y0, x1, y1, pitch, width, o) { return mmShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], pitch, width, o); }

export const PRESETS = [
  {
    name: 'Ribline Touring 4', type: 'Street', tyre: { width: 225, aspect: 55, rim: 17, treadDepth: 8 },
    build(pitch, width) {
      const s = [], W = width / 2;
      for (const y of [-0.66, -0.22, 0.22, 0.66]) s.push(rectMM(-3, y * W - 3.2, pitch + 3, y * W + 3.2, pitch, width, { name: 'Circ groove', role: 'groove', depth: 8 }));
      s.push(barMM(pitch * 0.5, -0.55 * W, width * 0.30, 3.4, 13, pitch, width, { name: 'Lateral L', role: 'groove', depth: 7 }));
      s.push(barMM(pitch * 0.5, 0.55 * W, width * 0.30, 3.4, -13, pitch, width, { name: 'Lateral R', role: 'groove', depth: 7 }));
      s.push(barMM(pitch * 0.5, 0, width * 0.86, 1.1, 10, pitch, width, { name: 'Sipe', role: 'sipe', depth: 3.5 }));
      return s;
    }
  },
  {
    name: 'Trail Lock A/T', type: 'Off-road', tyre: { width: 285, aspect: 70, rim: 17, treadDepth: 15 },
    build(pitch, width) {
      const s = [], W = width / 2;
      const lug = (pts, name, extra = {}) => s.push(mmShape(pts, pitch, width, { name, role: 'lug', depth: 15, ...extra }));
      lug([[pitch * .06, -W * .30], [pitch * .44, -W * .34], [pitch * .58, -W * .08], [pitch * .50, W * .16], [pitch * .12, W * .12], [pitch * .02, -W * .10]], 'Centre lug A');
      lug([[pitch * .56, -W * .16], [pitch * .94, -W * .10], [pitch * .98, W * .18], [pitch * .66, W * .30], [pitch * .52, W * .06]], 'Centre lug B');
      lug([[pitch * .10, W * .42], [pitch * .52, W * .38], [pitch * .66, W * .66], [pitch * .48, W * 1.04], [pitch * .14, W * .98], [pitch * .02, W * .68]], 'Shoulder lug R');
      lug([[pitch * .52, -W * .44], [pitch * .92, -W * .40], [pitch * .99, -W * .72], [pitch * .82, -W * 1.02], [pitch * .50, -W * .96], [pitch * .40, -W * .64]], 'Shoulder lug L');
      s.push(barMM(pitch * .3, 0, 26, 1.6, 8, pitch, width, { name: 'Lug sipe', role: 'sipe', depth: 5 }));
      s.push(barMM(pitch * .75, W * .62, 24, 1.6, -20, pitch, width, { name: 'Shoulder sipe', role: 'sipe', depth: 5 }));
      return s;
    }
  },
  {
    name: 'Rocklock M/T', type: 'Off-road', tyre: { width: 305, aspect: 65, rim: 18, treadDepth: 16 },
    build(pitch, width) {
      const s = [], W = width / 2;
      const lug = (pts, name) => s.push(mmShape(pts, pitch, width, { name, role: 'lug', depth: 16 }));
      lug([[pitch * .02, -W * .34], [pitch * .40, -W * .40], [pitch * .52, -W * .10], [pitch * .30, W * .10], [pitch * .04, W * .02]], 'Rock lug A');
      lug([[pitch * .48, W * .06], [pitch * .86, -W * .02], [pitch * .97, W * .30], [pitch * .60, W * .38], [pitch * .42, W * .24]], 'Rock lug B');
      lug([[pitch * .08, W * .46], [pitch * .46, W * .40], [pitch * .62, W * .72], [pitch * .44, W * 1.08], [pitch * .06, W * 1.02]], 'Shoulder block R',);
      lug([[pitch * .50, -W * .48], [pitch * .90, -W * .44], [pitch * .98, -W * .80], [pitch * .70, -W * 1.08], [pitch * .44, -W * .86]], 'Shoulder block L');
      lug([[pitch * .60, -W * .28], [pitch * .92, -W * .34], [pitch * .96, -W * .12], [pitch * .64, -W * .06]], 'Rock lug C');
      s.push(barMM(pitch * .25, -W * .12, 22, 1.8, 24, pitch, width, { name: 'Rock sipe', role: 'sipe', depth: 5 }));
      return s;
    }
  },
  {
    name: 'Vector Trail V', type: 'Grip / UHP', tyre: { width: 275, aspect: 40, rim: 19, treadDepth: 10 },
    build(pitch, width) {
      const s = [], W = width / 2;
      s.push(rectMM(-3, -3.5, pitch + 3, 3.5, pitch, width, { name: 'Centre groove', role: 'groove', depth: 9 }));
      s.push(barMM(pitch * .28, W * .46, width * .52, 11, 118, pitch, width, { name: 'V groove R', role: 'groove', depth: 9 }));
      s.push(barMM(pitch * .28, -W * .46, width * .52, 11, 62, pitch, width, { name: 'V groove L', role: 'groove', depth: 9 }));
      s.push(barMM(pitch * .82, W * .78, width * .26, 6, 100, pitch, width, { name: 'Shoulder cut R', role: 'groove', depth: 7 }));
      s.push(barMM(pitch * .82, -W * .78, width * .26, 6, 80, pitch, width, { name: 'Shoulder cut L', role: 'groove', depth: 7 }));
      s.push(barMM(pitch * .55, W * .55, width * .34, 1.3, 130, pitch, width, { name: 'V sipe R', role: 'sipe', depth: 4 }));
      s.push(barMM(pitch * .55, -W * .55, width * .34, 1.3, 50, pitch, width, { name: 'V sipe L', role: 'sipe', depth: 4 }));
      return s;
    }
  },
  {
    name: 'Kalahari Asym A/T', type: 'Off-road · asymmetric', tyre: { width: 285, aspect: 70, rim: 17, treadDepth: 14 },
    build(pitch, width) { // deliberately non-symmetric: different lug sizes/angles each side
      const s = [], W = width / 2;
      const lug = (pts, name, smooth = 0) => s.push(mmShape(pts, pitch, width, { name, role: 'lug', depth: 14, smooth }));
      lug([[pitch * .04, -W * .18], [pitch * .34, -W * .30], [pitch * .44, -W * .02], [pitch * .20, W * .14], [pitch * .02, W * .04]], 'Asym lug 1');
      lug([[pitch * .50, W * .02], [pitch * .88, -W * .08], [pitch * .96, W * .22], [pitch * .62, W * .30]], 'Asym lug 2');
      lug([[pitch * .10, W * .40], [pitch * .40, W * .34], [pitch * .58, W * .58], [pitch * .36, W * .86], [pitch * .08, W * .78]], 'Asym lug 3', 1);
      lug([[pitch * .62, W * .44], [pitch * .95, W * .52], [pitch * .90, W * .92], [pitch * .58, W * .82]], 'Asym lug 4');
      lug([[pitch * .04, -W * .52], [pitch * .30, -W * .44], [pitch * .38, -W * .78], [pitch * .12, -W * .98], [pitch * -.02, -W * .76]], 'Asym lug 5');
      lug([[pitch * .46, -W * .62], [pitch * .76, -W * .52], [pitch * .94, -W * .74], [pitch * .78, -W * 1.0], [pitch * .50, -W * .92]], 'Asym lug 6', 1);
      s.push(barMM(pitch * .22, -W * .05, 20, 1.6, -14, pitch, width, { name: 'Sipe 1', role: 'sipe', depth: 5 }));
      s.push(barMM(pitch * .72, W * .14, 16, 1.6, 30, pitch, width, { name: 'Sipe 2', role: 'sipe', depth: 5 }));
      return s;
    }
  },
  {
    name: 'Apex Asym UHP', type: 'Grip / UHP · asymmetric', tyre: { width: 265, aspect: 35, rim: 20, treadDepth: 8 },
    build(pitch, width) {
      const s = [], W = width / 2;
      s.push(rectMM(-3, W * .18, pitch + 3, W * .52, pitch, width, { name: 'Solid rib', role: 'lug', depth: 8 }));
      s.push(rectMM(-3, -W * .30, pitch + 3, -W * .18, pitch, width, { name: 'Circ groove 1', role: 'groove', depth: 8 }));
      s.push(rectMM(-3, W * .66, pitch + 3, W * .76, pitch, width, { name: 'Circ groove 2', role: 'groove', depth: 8 }));
      s.push(barMM(pitch * .3, -W * .62, width * .40, 7, 24, pitch, width, { name: 'Angled groove', role: 'groove', depth: 8 }));
      s.push(barMM(pitch * .78, -W * .58, width * .34, 5, 24, pitch, width, { name: 'Angled groove 2', role: 'groove', depth: 7 }));
      s.push(barMM(pitch * .5, W * .86, width * .20, 4, -18, pitch, width, { name: 'Outer cut', role: 'groove', depth: 6 }));
      s.push(barMM(pitch * .24, -W * .6, width * .36, 1.2, 24, pitch, width, { name: 'Sipe fan', role: 'sipe', depth: 3.5 }));
      return s;
    }
  },
];
