// =====================================================================================================================
//  TyreTopology.js — watertight, pure-quad tyre topology (tread + shoulders + sidewalls + bead closure)
//
//  Pipeline (all sizes in mm, parameter domain u = circumferential arc [0, C), v = across [-A, A]):
//   1. Tread pattern → nested groove regions R_i (Clipper, periodic copies for wrap-around features).
//   2. Every region boundary becomes two constraint rings at ±h (chamfer band → steep but finite walls). Rings are
//      cut into pieces of the contour spacing; a piece is kept only if it neither crosses nor touches an accepted one.
//   3. A structured lattice + ring samples are triangulated with a constrained Delaunay (cdt2d) over the rectangle.
//      The contour spacing is the finest one (2…40 mm) whose sample count fits the face budget (faceBudget, default 120k quads).
//   4. Each triangle is split into three quads (centroid + edge midpoints). No triangles remain in the output.
//   5. Shoulders, sidewalls and the bead cap are lathed on the SAME boundary samples, so every edge is shared:
//      the result is one closed quad manifold (torus). Vertices are welded by position, UV sets stay separate.
// =====================================================================================================================
import cdt2d from './vendor/cdt2d.esm.js';

const CS = 100;                                  // Clipper works in integers: 0.01 mm units
const TAU = Math.PI * 2;
const DEG80 = 80 * Math.PI / 180;
const CL = () => globalThis.ClipperLib;

// -----------------------------------------------------------------------------------------------------------------------
//  Clipper helpers (paths are arrays of {X, Y} integer points)
// -----------------------------------------------------------------------------------------------------------------------
const toPath = ring => ring.map(p => ({ X: Math.round(p[0] * CS), Y: Math.round(p[1] * CS) }));
const toFloat = path => path.map(q => [q.X / CS, q.Y / CS]);
function orient(path) { if (!CL().Clipper.Orientation(path)) path.reverse(); return path; }
function circleRing(cx, cy, r, n) { const ring = []; for (let i = 0; i < n; i++) ring.push([cx + r * Math.cos(i / n * TAU), cy + r * Math.sin(i / n * TAU)]); return ring; }
function rectPath(x0, y0, x1, y1) { return orient(toPath([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])); }
function strokePaths(polylines, w, closed = false) {
  const L = CL(); const co = new L.ClipperOffset(2, 0.25 * CS);
  for (const pl of polylines) co.AddPath(toPath(pl), L.JoinType.jtRound, closed ? L.EndType.etClosedLine : L.EndType.etOpenButt);
  const out = new L.Paths(); co.Execute(out, w / 2 * CS); return out;
}
function boolOp(type, subj, clip) {
  const L = CL(); const c = new L.Clipper(); c.AddPaths(subj, L.PolyType.ptSubject, true); if (clip && clip.length) c.AddPaths(clip, L.PolyType.ptClip, true);
  const out = new L.Paths(); c.Execute(type, out, L.PolyFillType.pftNonZero, L.PolyFillType.pftNonZero); return out;
}
const union = (a, b) => boolOp(CL().ClipType.ctUnion, a, b || []);
const diff = (a, b) => boolOp(CL().ClipType.ctDifference, a, b);
const inter = (a, b) => boolOp(CL().ClipType.ctIntersection, a, b);
function offsetPaths(paths, delta) {
  const L = CL(); const co = new L.ClipperOffset(2, 0.05 * CS);
  co.AddPaths(paths, L.JoinType.jtMiter, L.EndType.etClosedPolygon);
  const out = new L.Paths(); co.Execute(out, delta * CS); L.Clipper.CleanPolygons(out, 0.02 * CS); return out;
}

// -----------------------------------------------------------------------------------------------------------------------
//  Tread pattern → groove polygons (mm). Layer types mirror the generator's LAYER_DEFS.
// -----------------------------------------------------------------------------------------------------------------------
function patternPolygons(pattern, d, treadDepth) {
  const th = d.treadHalf, circ = d.circ, out = [], bars = [];
  const shift = (paths, dx) => paths.map(p => p.map(q => ({ X: q.X + Math.round(dx * CS), Y: q.Y })));
  for (const ly of pattern.layers) {
    if (ly.type === 'noise') continue;
    let paths = []; let wrap = true;
    if (ly.type === 'circ') {
      const y = ly.pos * th;
      if (ly.zig > 0) {
        const n = Math.max(2, Math.round(ly.zigCount)) * 2; const pts = [];
        for (let i = -2; i <= n + 2; i++) pts.push([i / n * circ, y + (Math.abs(i) % 2 ? ly.zig : -ly.zig)]);
        paths = strokePaths([pts], ly.width); wrap = false;
      } else { paths = [rectPath(-circ, y - ly.width / 2, 2 * circ, y + ly.width / 2)]; wrap = false; }
      if (ly.width >= 4 && ly.depth >= 0.9 && !ly.zig) for (let i = 0; i < 6; i++) { const x = (i + 0.5) / 6 * circ; bars.push(rectPath(x - 3, y - ly.width / 2 - 0.2, x + 3, y + ly.width / 2 + 0.2)); }
    } else if (ly.type === 'lateral' || ly.type === 'chevron' || ly.type === 'sipe') {
      const tan = Math.tan(ly.angle * Math.PI / 180), n = Math.max(1, Math.round(ly.count));
      const steps = (ly.curve || ly.zig) ? 8 : 1; const lines = [];
      for (let i = 0; i < n; i++) {
        const x0 = (i + ly.phase) / n * circ;
        for (const sg of ly.mirror ? [1, -1] : [1]) {
          const pts = [];
          for (let j = 0; j <= steps; j++) {
            const cc = ly.from + (ly.to - ly.from) * j / steps; const yy = (ly.mirror ? sg * cc : cc) * th; const ac = ly.mirror ? Math.abs(cc) : cc;
            let xx = x0 + ac * th * tan + (ly.curve || 0) * ac * ac * th * 0.5; if (ly.zig) xx += (j % 2 ? ly.zig : -ly.zig) * 0.5;
            pts.push([xx, yy]);
          }
          lines.push(pts);
        }
      }
      paths = strokePaths(lines, ly.width);
    } else if (ly.type === 'dimple') {
      const rows = Math.max(1, Math.round(ly.rows)), n = Math.max(1, Math.round(ly.count)); const rings = [];
      for (let r = 0; r < rows; r++) {
        const cc = rows === 1 ? (ly.from + ly.to) / 2 : ly.from + (ly.to - ly.from) * r / (rows - 1); const y = cc * th; const sh = ly.stagger && r % 2 ? 0.5 : 0;
        for (let i = 0; i < n; i++) { const x = (i + sh) / n * circ; const seg = Math.max(12, Math.min(48, Math.round(ly.radius * 6))); rings.push(circleRing(x, y, ly.radius, seg)); }
      }
      paths = ly.ring ? strokePaths(rings, Math.max(0.6, ly.radius * 0.4), true) : rings.map(r => orient(toPath(r)));
    } else if (ly.type === 'hex') {
      const sz = Math.max(2, ly.size); const nx = Math.max(2, 2 * Math.round(circ / (3 * sz))); const sx = circ / nx; const sy = Math.sqrt(3) * sz;
      const y0 = ly.from * th, y1 = ly.to * th; const rot = ly.rotate * Math.PI / 180;
      const j0 = Math.floor((y0 - sy) / sy), j1 = Math.ceil((y1 + sy) / sy); const hexes = [];
      for (let i = -1; i <= nx; i++) for (let j = j0; j <= j1; j++) {
        const cx = i * sx, cy = j * sy + (Math.abs(i) % 2 ? sy / 2 : 0); const pts = [];
        for (let v = 0; v < 6; v++) { const a = rot + v * Math.PI / 3; pts.push([cx + sz * Math.cos(a), cy + sz * Math.sin(a)]); }
        hexes.push(pts);
      }
      paths = inter(strokePaths(hexes, ly.width, true), [rectPath(-circ, y0, 2 * circ, y1)]); wrap = false;
    } else if (ly.type === 'shape') {
      // free-drawn shapes from the 2D editor: {kind:'stroke'|'polygon'|'circle', pts:[[u,v]..], r, width}
      const shapes = ly.shapes || [];
      for (const s of shapes) {
        const pts = s.pts || []; if (pts.length < 2 && s.kind !== 'circle') continue;
        let sp = [];
        if (s.kind === 'stroke') sp = strokePaths([pts], Math.max(0.3, s.width || 3));
        else if (s.kind === 'polygon') { if (pts.length < 3) continue; sp = [orient(toPath(pts))]; }
        else if (s.kind === 'circle') sp = [orient(toPath(circleRing(pts[0][0], pts[0][1], s.r || 3, 36)))];
        if (!sp.length) continue;
        const copies = [sp, shift(sp, circ), shift(sp, -circ)];
        out.push({ paths: copies.flat(), depth: Math.round((s.depth ?? ly.depth ?? 1) * 100) / 100 });
      }
      continue;
    }
    if (!paths.length) continue;
    if (wrap) paths = paths.concat(shift(paths, circ), shift(paths, -circ));
    out.push({ paths, depth: Math.round(ly.depth * 100) / 100 });
  }
  return { grooves: out, bars, barDepth: Math.round((1 - 1.6 / treadDepth) * 100) / 100 };
}

// nested regions R_i (everything cut to depth ≥ d_i), regions[0] = shallowest (largest), regions[k+1] ⊂ regions[k]
function levelRegions(pattern, d, treadDepth, wear) {
  const { grooves, bars, barDepth } = patternPolygons(pattern, d, treadDepth);
  const depths = [...new Set(grooves.map(g => g.depth).filter(v => v > wear + 0.005))].sort((a, b) => b - a);
  const wantBars = bars.length && barDepth > wear + 0.005 && depths.some(v => v > barDepth);
  if (wantBars && !depths.includes(barDepth)) { depths.push(barDepth); depths.sort((a, b) => b - a); }
  let R = []; const regions = [];
  for (const dep of depths) { const paths = grooves.filter(g => g.depth === dep).flatMap(g => g.paths); R = union(R.concat(paths)); regions.unshift({ depth: dep, R }); }
  if (wantBars) for (const rg of regions) if (rg.depth > barDepth) rg.R = diff(rg.R, bars);
  return regions.map(rg => ({ depth: rg.depth, rings: rg.R.map(r => withBox(toFloat(r))) }));
}
function withBox(ring) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of ring) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  return { pts: ring, x0, x1, y0, y1 };
}

// even-odd containment over all rings of a region (Clipper union output: outer rings + holes)
function insideRegion(x, y, rings) {
  let inside = false;
  for (const { pts: ring, x0, x1, y0, y1 } of rings) {
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// -----------------------------------------------------------------------------------------------------------------------
//  Tyre profile helpers (mirror the generator's profile definition)
// -----------------------------------------------------------------------------------------------------------------------
function treadProfileAt(y, d, crown) {
  const ay = Math.abs(y), sgn = Math.sign(y) || 1;
  if (ay <= d.treadHalf) return { x: y, r: d.Rout - crown * (y / d.treadHalf) ** 2, nx: 0, nr: 1, w: 1 };
  const phi = Math.min(DEG80, Math.asin(Math.min(1, (ay - d.treadHalf) / d.sr))); const c80 = Math.cos(DEG80);
  return { x: sgn * (d.treadHalf + d.sr * Math.sin(phi)), r: d.Rout - crown - d.sr + d.sr * Math.cos(phi), nx: sgn * Math.sin(phi), nr: Math.cos(phi), w: Math.max(0, (Math.cos(phi) - c80) / (1 - c80)) };
}
// sidewall rings from the shoulder edge (s = 1) down to the bead tuck (s = -0.05); right side (x > 0)
function sidewallRightRings(d, crown, bulge, rimWidthFrac) {
  const { Rrim, H, Rout, halfW, treadHalf, sr } = d; const sideN = 26; const bw = d.bw;
  const cr = Rout - crown - sr; const P0 = { x: treadHalf + sr * Math.sin(DEG80), r: cr + sr * Math.cos(DEG80) }, P3 = { x: bw, r: Rrim + 2 };
  const P1 = { x: P0.x + (halfW - P0.x) * 1.35 * bulge + 4, r: P0.r - H * 0.22 }, P2 = { x: bw + (halfW - bw) * 0.55 * bulge, r: Rrim + H * 0.2 };
  const rings = [{ x: P0.x, r: P0.r, s: 1 }];
  for (let i = 1; i <= sideN; i++) {
    const t = i / sideN, mt = 1 - t;
    rings.push({ x: mt ** 3 * P0.x + 3 * mt * mt * t * P1.x + 3 * mt * t * t * P2.x + t ** 3 * P3.x, r: mt ** 3 * P0.r + 3 * mt * mt * t * P1.r + 3 * mt * t * t * P2.r + t ** 3 * P3.r, s: 1 - t });
  }
  rings.push({ x: bw - 3, r: Rrim - 1, s: -0.05 });
  return rings;
}

// -----------------------------------------------------------------------------------------------------------------------
//  Main builder
// -----------------------------------------------------------------------------------------------------------------------
/**
 * @param {object} o
 * @param {object} o.d            dims() from the generator (Rout, Rrim, H, halfW, treadHalf, sr, acrossHalf, circ, bw)
 * @param {object} o.pattern      {layers:[...]} tread pattern
 * @param {number} o.treadDepth   [mm]
 * @param {number} o.wear         0..1
 * @param {number} o.wearBias     -1..1
 * @param {number} o.crown        [mm]
 * @param {number} o.bulge        sidewall bulge
 * @param {number} o.rimWidthFrac
 * @param {number} [o.spacing=15] lattice spacing [mm] (controls face count)
 * @param {number} [o.contour=3]  contour sample spacing [mm] along groove walls
 * @param {number} [o.chamfer=0.25] half-width of the wall band [mm]
 */
export function buildTyreQuadMesh(o) {
  const src = o.d; const C = Math.round(src.circ * CS) / CS;
  const A = Math.round(src.acrossHalf * CS) / CS; const d = Object.assign({}, src, { circ: C });
  const D = o.treadDepth, th = d.treadHalf;
  const spacing = o.spacing ?? 15, h = o.chamfer ?? 0.25, budget = o.faceBudget ?? 120000;

  const regions = levelRegions(o.pattern, d, D, o.wear);
  const wearFrac = v => Math.min(1, Math.max(0, o.wear * (1 + 0.6 * o.wearBias * (1 - 2 * Math.min(1, (v / th) ** 2)))));
  const depthFrac = (u, v) => {
    let f = 0; for (const rg of regions) if (insideRegion(u, v, rg.rings)) f = rg.depth;
    return Math.max(f, wearFrac(v));
  };

  // ---- 1. chamfer rings and their rectangle crossings -------------------------------------------------------------
  const rect = [rectPath(0, -A, C, A)];
  const ringLoops = [];                                      // [{paths}] after clipping to the rectangle
  for (const rg of regions) {
    const clip = rg.rings.map(r => toPath(r.pts));
    const outer = offsetPaths(clip, h), inner = offsetPaths(clip, -h);
    for (const set of [outer, inner]) if (set.length) ringLoops.push(...inter(set, rect).map(toFloat));
  }
  const uCross = new Set(), vCross = new Set();
  for (const loop of ringLoops) for (const [u, v] of loop) {
    if (Math.abs(v - A) < 1e-3 || Math.abs(v + A) < 1e-3) uCross.add(Math.round(u * 1000) / 1000);
    if (Math.abs(u) < 1e-3 || Math.abs(u - C) < 1e-3) vCross.add(Math.round(v * 1000) / 1000);
  }

  // contour sampling: the finest spacing (≥ 2 mm) whose estimated sample count keeps the mesh inside the face budget
  const segLens = []; for (const loop of ringLoops) for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length];
    const edgeRun = (Math.abs(p[1] - q[1]) < 1e-9 && Math.abs(Math.abs(p[1]) - A) < 1e-3) || (Math.abs(p[0] - q[0]) < 1e-9 && (Math.abs(p[0]) < 1e-3 || Math.abs(p[0] - C) < 1e-3));
    if (!edgeRun) segLens.push(Math.hypot(q[0] - p[0], q[1] - p[1])); }
  const latticePts = (C / spacing) * (2 * A / spacing);
  const sideQuads = 2 * 27 * (2 * C / spacing) + 2 * (2 * C / spacing);
  const sampleBudget = Math.max(2000, (budget - sideQuads) / 6 - latticePts);
  const estSamples = (sp) => { let n = 0; for (const L of segLens) n += Math.max(1, Math.ceil(L / sp)); return n; };
  let contour = o.contour ?? 2;
  if (o.contour === undefined) { contour = 2; for (const sp of [2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40]) { contour = sp; if (estSamples(sp) <= sampleBudget) break; } }

  // ---- 2. boundary samples (identical on opposite edges so the periodic weld is exact) -----------------------------
  const Nu = Math.max(8, Math.round(C / spacing)), du = C / Nu;
  const Nv = Math.max(4, Math.round(2 * A / spacing)), dv = 2 * A / Nv;
  const merge = (lattice, cross, lo, hi, step) => {
    const keep = lattice.filter(x => x <= lo + 1e-9 || x >= hi - 1e-9 || !cross.some(c => Math.abs(c - x) < 0.4 * step));
    const all = [...keep, ...cross].filter(x => x >= lo - 1e-9 && x <= hi + 1e-9).sort((a, b) => a - b);
    const out = []; for (const x of all) if (!out.length || x - out[out.length - 1] > 1e-3) out.push(x);
    return out;
  };
  const Ubd = merge(Array.from({ length: Nu }, (_, i) => i * du).concat([C]), [...uCross].filter(x => x > 1e-3 && x < C - 1e-3), 0, C, du);
  const Vall = merge(Array.from({ length: Nv + 1 }, (_, j) => -A + j * dv), [...vCross].filter(x => x > -A + 1e-3 && x < A - 1e-3), -A, A, dv);

  // ---- 3. CDT point set: boundary loop, ring samples, interior lattice ---------------------------------------------
  const P = []; const keyIndex = new Map(); const pt = (u0, v0) => {
    const u = Math.round(u0 * 1000) / 1000, v = Math.round(v0 * 1000) / 1000;
    const k = Math.round(u * 1000) + ',' + Math.round(v * 1000);
    let i = keyIndex.get(k); if (i === undefined) { i = P.length; P.push([u, v]); keyIndex.set(k, i); } return i;
  };
  const bnd = [];                                             // ordered loop, indices into P
  for (const u of Ubd) bnd.push(pt(u, -A));                   // bottom, u ascending (includes (0,-A) and (C,-A))
  for (let j = 1; j < Vall.length; j++) bnd.push(pt(C, Vall[j]));   // right seam, includes (C,A)
  for (let i = Ubd.length - 2; i >= 0; i--) bnd.push(pt(Ubd[i], A)); // top, excludes (C,A), includes (0,A)
  for (let j = Vall.length - 2; j >= 1; j--) bnd.push(pt(0, Vall[j])); // left seam, excludes both corners
  let rejectedPieces = 0;
  const edgeSet = new Set(); const E = [];
  const addEdge = (a, b) => { if (a === b) return; const k = a < b ? a + '_' + b : b + '_' + a; if (!edgeSet.has(k)) { edgeSet.add(k); E.push([a, b]); } };
  for (let i = 0; i < bnd.length; i++) addEdge(bnd[i], bnd[(i + 1) % bnd.length]);

  // ring interior segments (boundary-running segments are already in the boundary loop).
  // Each ring is cut into pieces of ≤ contour length; a piece becomes a CDT constraint only if it neither crosses nor
  // touches an already accepted constraint (near-coincident boundaries of different depths can't both be chamfered).
  const onSameEdge = (p, q) => (Math.abs(p[0]) < 1e-3 && Math.abs(q[0]) < 1e-3) || (Math.abs(p[0] - C) < 1e-3 && Math.abs(q[0] - C) < 1e-3) ||
    (Math.abs(p[1] - A) < 1e-3 && Math.abs(q[1] - A) < 1e-3) || (Math.abs(p[1] + A) < 1e-3 && Math.abs(q[1] + A) < 1e-3);
  const ringPts = []; const cellC = contour * 1.5; const segGrid = new Map(); let rejected = 0;
  const gKey = (x, y) => Math.floor(x / cellC) + ',' + Math.floor(y / cellC);
  const gAdd = (i, a, b) => { const x0 = Math.floor(Math.min(a[0], b[0]) / cellC), x1 = Math.floor(Math.max(a[0], b[0]) / cellC), y0 = Math.floor(Math.min(a[1], b[1]) / cellC), y1 = Math.floor(Math.max(a[1], b[1]) / cellC); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; if (!segGrid.has(k)) segGrid.set(k, []); segGrid.get(k).push(i); } };
  const segsAcc = [];
  const orient2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy || 1e-12; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]); };
  const nearAccepted = (x, y, r) => { const cx = Math.floor(x / cellC), cy = Math.floor(y / cellC); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const list = segGrid.get((cx + i) + ',' + (cy + j)); if (list) for (const k of list) { const sg = segsAcc[k]; if (distSeg([x, y], sg.a, sg.b) < r) return true; } } return false; };
  const conflicts = (a, b) => {
    const cx0 = Math.floor(Math.min(a[0], b[0]) / cellC) - 1, cx1 = Math.floor(Math.max(a[0], b[0]) / cellC) + 1, cy0 = Math.floor(Math.min(a[1], b[1]) / cellC) - 1, cy1 = Math.floor(Math.max(a[1], b[1]) / cellC) + 1;
    for (let x = cx0; x <= cx1; x++) for (let y = cy0; y <= cy1; y++) { const list = segGrid.get(x + ',' + y); if (!list) continue;
      for (const k of list) { const sg = segsAcc[k]; const c = sg.a, d = sg.b;
        const d1 = orient2(a, b, c), d2 = orient2(a, b, d), d3 = orient2(c, d, a), d4 = orient2(c, d, b);
        if (d1 * d2 < 0 && d3 * d4 < 0) return true;
        if (Math.abs(d1) < 1e-9 && distSeg(c, a, b) < 1e-6 && Math.hypot(c[0] - a[0], c[1] - a[1]) > 1e-6 && Math.hypot(c[0] - b[0], c[1] - b[1]) > 1e-6) return true;
        if (Math.abs(d3) < 1e-9 && distSeg(a, c, d) < 1e-6 && Math.hypot(a[0] - c[0], a[1] - c[1]) > 1e-6 && Math.hypot(a[0] - d[0], a[1] - d[1]) > 1e-6) return true;
      } }
    return false;
  };
  for (const loop of ringLoops) for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    if (onSameEdge(p, q)) continue;                          // runs along the rectangle edge: already in the boundary loop
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]); const n = Math.max(1, Math.ceil(len / contour));
    let prev = pt(p[0], p[1]); let prevP = [P[prev][0], P[prev][1]];
    for (let k = 1; k <= n; k++) {
      const t = k / n; const cur = k === n ? pt(q[0], q[1]) : pt(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
      const curP = [P[cur][0], P[cur][1]]; ringPts.push(curP);
      if (cur !== prev && !conflicts(prevP, curP)) {
        const idx = segsAcc.length; segsAcc.push({ a: prevP, b: curP, i: prev, j: cur }); gAdd(idx, prevP, curP); addEdge(prev, cur);
      } else if (cur !== prev) rejected++;
      prev = cur; prevP = curP;
    }
  }
  // lattice interior (u=0 column belongs to the seam boundary; the u=C column is its weld twin)
  const cell = contour * 1.5; const hash = new Map(); const hk = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
  for (const [x, y] of P) { const k = hk(x, y); if (!hash.has(k)) hash.set(k, []); hash.get(k).push([x, y]); }
  const near = (x, y, r) => { const cx = Math.floor(x / cell), cy = Math.floor(y / cell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const bucket = hash.get((cx + i) + ',' + (cy + j)); if (bucket) for (const q of bucket) if (Math.hypot(q[0] - x, q[1] - y) < r) return true; } return false; };
  // lattice interior (u=0 column belongs to the seam boundary; the u=C column is its weld twin).
  // A lattice node is dropped if it lies within 0.6·contour of a sample or constraint, so no point sits on an edge.
  const sHash = new Map(); for (const q of P) { const k = gKey(q[0], q[1]); if (!sHash.has(k)) sHash.set(k, []); sHash.get(k).push(q); }
  const lattNear = (x, y, r) => { const cx = Math.floor(x / cellC), cy = Math.floor(y / cellC);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const bucket = sHash.get((cx + i) + ',' + (cy + j)); if (bucket) for (const q of bucket) if (Math.hypot(q[0] - x, q[1] - y) < r) return true; }
    return nearAccepted(x, y, r); };
  for (let i = 1; i < Nu; i++) for (let j = 1; j < Nv; j++) {
    const x = i * du, y = -A + j * dv;
    if (lattNear(x, y, 0.6 * contour)) continue;
    pt(x, y);
  }

  // ---- 4. constrained Delaunay over the rectangle (exterior:true keeps every face inside the rectangle) --------------
  let tris = cdt2d(P, E, { exterior: true });
  if (!tris.length) throw new Error('tread triangulation failed');
  rejectedPieces = rejected;

  // ---- 5. vertex registry keyed by seam-normalised position (u = C ≡ u = 0) -------------------------------------------
  const verts = []; const vKey = new Map();
  const normU = u => (Math.abs(u - C) < 1e-6 ? 0 : u);
  const vkey = (u, v) => Math.round(normU(u) * 1e4) + ',' + Math.round(v * 1e4);
  const vertex = (u, v, frac) => {
    const k = vkey(u, v); let id = vKey.get(k);
    if (id === undefined) { id = verts.length; verts.push({ u, v, frac: frac ?? depthFrac(u, v), uv: null, uv1: null, pos: null }); vKey.set(k, id); }
    return id;
  };
  const quads = []; const quadGroup = [];
  for (const [a, b, c] of tris) {
    let [ia, ib, ic] = [a, b, c];
    const area2 = (P[ib][0] - P[ia][0]) * (P[ic][1] - P[ia][1]) - (P[ic][0] - P[ia][0]) * (P[ib][1] - P[ia][1]);
    if (area2 < 0) [ib, ic] = [ic, ib];                     // CCW in the (u, v) domain
    const A3 = vertex(P[ia][0], P[ia][1]), B3 = vertex(P[ib][0], P[ib][1]), C3 = vertex(P[ic][0], P[ic][1]);
    const mid = (p, q, fp, fq) => vertex((P[p][0] + P[q][0]) / 2, (P[p][1] + P[q][1]) / 2, (fp + fq) / 2);
    const fa = verts[A3].frac, fb = verts[B3].frac, fc = verts[C3].frac;
    const mAB = mid(ia, ib, fa, fb), mBC = mid(ib, ic, fb, fc), mCA = mid(ic, ia, fc, fa);
    const g = vertex((P[ia][0] + P[ib][0] + P[ic][0]) / 3, (P[ia][1] + P[ib][1] + P[ic][1]) / 3, (fa + fb + fc) / 3);
    quads.push(A3, mAB, g, mCA, B3, mBC, g, mAB, C3, mCA, g, mBC); quadGroup.push(0, 0, 0);
  }
  // triangle corner (u, v) for the first-created vertices (periodic-consistent); tread UVs
  for (const v of verts) {
    if (!v.uv) v.uv = [normU(v.u) / C, (v.v + A) / (2 * A)];
  }

  // ---- 6. sidewall rings on the boundary samples ----------------------------------------------------------------------
  // shoulder ring samples = every tread vertex on the two shoulder edges (boundary points AND 3-split edge midpoints)
  const edgeU = (sgnV) => { const us = []; for (const vv of verts) if (vv.v !== null && Math.abs(vv.v - sgnV) < 1e-6) us.push(normU(vv.u)); return [...new Set(us.map(u => Math.round(u * 1e4) / 1e4))].sort((a, b) => a - b); };
  const Uedge = edgeU(A), UedgeB = edgeU(-A);
  if (Uedge.length !== UedgeB.length || Uedge.some((u, i) => Math.abs(u - UedgeB[i]) > 1e-3)) throw new Error('shoulder sample sets differ');
  const idTop = Uedge.map(u => vKey.get(vkey(u, A))), idBot = Uedge.map(u => vKey.get(vkey(u, -A)));
  if (idTop.some(x => x === undefined) || idBot.some(x => x === undefined)) throw new Error('boundary weld incomplete');
  const rightRings = sidewallRightRings(d, o.crown, o.bulge, o.rimWidthFrac);
  const nU = Uedge.length;
  const sideSample = (x, r, s, u) => ({ x, r, s, u });
  const ringsIds = (sign) => {
    const ids = [];
    // ring 0 = the shoulder edge: reuse the tread boundary vertices
    ids.push(sign > 0 ? idTop : idBot);
    for (let k = 1; k < rightRings.length; k++) {
      const pr = rightRings[k]; const row = [];
      for (let j = 0; j < nU; j++) {
        const u = Uedge[j]; const th = u / C * TAU; const x = sign * pr.x; const rr = pr.r;
        const id = verts.length;
        verts.push({ u, v: null, frac: 0, uv: [u / C, 0], uv1: [sign < 0 ? 1 - u / C : u / C, Math.max(-0.05, pr.s)], pos: [x, rr * Math.cos(th), rr * Math.sin(th)] });
        row.push(id);
      }
      ids.push(row);
    }
    return ids;
  };
  const rightIds = ringsIds(+1), leftIds = ringsIds(-1);
  // shoulder vertices get the sidewall UV set (sidewall group samples uv1)
  for (const sign of [1, -1]) {
    const first = sign > 0 ? idTop : idBot; for (let j = 0; j < nU; j++) {
      const v = verts[first[j]]; v.uv1 = [sign < 0 ? 1 - Uedge[j] / C : Uedge[j] / C, 1];
    }
  }
  // bead cap: a middle ring at x = 0 closes the two bead tucks into one manifold
  const tuckR = rightIds[rightIds.length - 1], tuckL = leftIds[leftIds.length - 1];
  const tuckRad = rightRings[rightRings.length - 1].r;
  const capMid = []; for (let j = 0; j < nU; j++) {
    const u = Uedge[j], th = u / C * TAU; const id = verts.length;
    verts.push({ u, v: null, frac: 0, uv: [u / C, 0], uv1: [u / C, -0.05], pos: [0, tuckRad * Math.cos(th), tuckRad * Math.sin(th)] }); capMid.push(id);
  }
  // fill the tuck vertices' 3D positions for tread vertices and sidewall rings (tread verts have v)
  for (const id of verts.keys()) { const vv = verts[id]; if (!vv.pos) { const pr = treadProfileAt(vv.v, d, o.crown); const off = D * vv.frac * pr.w; const th = vv.u / C * TAU; const ax = pr.x - pr.nx * off, rr = pr.r - pr.nr * off; vv.pos = [ax, rr * Math.cos(th), rr * Math.sin(th)]; } }

  // sidewall quads (right, left) and bead cap quads
  for (const ids of [rightIds, leftIds]) for (let k = 0; k + 1 < ids.length; k++) {
    const a = ids[k], b = ids[k + 1];
    for (let j = 0; j < nU; j++) { const j1 = (j + 1) % nU; quads.push(a[j], a[j1], b[j1], b[j]); quadGroup.push(1); }
  }
  for (let j = 0; j < nU; j++) {
    const j1 = (j + 1) % nU;
    quads.push(tuckR[j], tuckR[j1], capMid[j1], capMid[j]); quadGroup.push(1);
    quads.push(capMid[j], capMid[j1], tuckL[j1], tuckL[j]); quadGroup.push(1);
  }

  // ---- 7. orient consistently (edge-adjacent faces traverse shared edges oppositely) and outward ---------------------
  const F = quads.length / 4; const faces = []; for (let f = 0; f < F; f++) faces.push([quads[4 * f], quads[4 * f + 1], quads[4 * f + 2], quads[4 * f + 3]]);
  orientConsistently(faces);
  // vertices: 3D positions
  const N = verts.length; const positions = new Float32Array(N * 3), uvT = new Float32Array(N * 2), uvS = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const vv = verts[i]; if (!vv.pos) throw new Error('vertex without position');
    positions[3 * i] = vv.pos[0]; positions[3 * i + 1] = vv.pos[1]; positions[3 * i + 2] = vv.pos[2];
    uvT[2 * i] = vv.uv[0]; uvT[2 * i + 1] = vv.uv[1];
    const s = vv.uv1 || vv.uv; uvS[2 * i] = s[0]; uvS[2 * i + 1] = s[1];
  }
  let vol = 0; for (const f of faces) { const [a, b, c, e] = f.map(i => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]]); vol += tetra(a, b, c) + tetra(a, c, e); }
  if (vol < 0) for (const f of faces) f.reverse();
  const quadArr = new Uint32Array(F * 4); for (let f = 0; f < F; f++) for (let k = 0; k < 4; k++) quadArr[4 * f + k] = faces[f][k];
  return { positions, uvTread: uvT, uvSide: uvS, quads: quadArr, quadGroup: Uint8Array.from(quadGroup), circ: C, acrossHalf: A, spacing: { u: du, v: dv, contour }, counts: { triangles: tris.length, samples: P.length, constraints: E.length, rejectedPieces } };
}
function tetra(a, b, c) { return (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }

// flips faces so every shared edge is traversed in opposite directions by its two faces (BFS over the adjacency)
function orientConsistently(faces) {
  const edgeFaces = new Map();
  faces.forEach((f, fi) => { for (let k = 0; k < 4; k++) { const a = f[k], b = f[(k + 1) % 4]; const key = a < b ? a + '_' + b : b + '_' + a; if (!edgeFaces.has(key)) edgeFaces.set(key, []); edgeFaces.get(key).push(fi); } });
  const seen = new Uint8Array(faces.length);
  for (let s = 0; s < faces.length; s++) {
    if (seen[s]) continue; seen[s] = 1; const stack = [s];
    while (stack.length) {
      const fi = stack.pop(); const f = faces[fi];
      for (let k = 0; k < 4; k++) {
        const a = f[k], b = f[(k + 1) % 4]; const key = a < b ? a + '_' + b : b + '_' + a;
        for (const gi of edgeFaces.get(key)) {
          if (gi === fi || seen[gi]) continue;
          const g = faces[gi]; let same = false;
          for (let m = 0; m < 4; m++) if (g[m] === a && g[(m + 1) % 4] === b) same = true;
          if (same) { faces[gi] = [g[3], g[2], g[1], g[0]]; }
          seen[gi] = 1; stack.push(gi);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------------------------------------------------
//  Output adapters
// -----------------------------------------------------------------------------------------------------------------------
/** THREE.BufferGeometry with two groups: 0 = tread (uv), 1 = sidewalls + bead (uv1). Quads are split for the GPU only.
 *  A quad that straddles the u = 0/C seam gets its corners unwrapped (duplicate GPU vertices carry the shifted UV), so the
 *  texture is not stretched across that face. Normals come from the welded mesh, so the seam has no shading crease. */
export function quadMeshToGeometry(THREE, mesh) {
  const F = mesh.quads.length / 4, NV = mesh.positions.length / 3;
  // welded normals
  const wIdx = []; for (let f = 0; f < F; f++) { const q = [mesh.quads[4 * f], mesh.quads[4 * f + 1], mesh.quads[4 * f + 2], mesh.quads[4 * f + 3]]; wIdx.push(q[0], q[1], q[2], q[0], q[2], q[3]); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3)); wg.setIndex(wIdx); wg.computeVertexNormals();
  const wN = wg.attributes.normal.array;
  const outP = [], outN = [], outUV = [], outUV1 = []; const map = new Map(); const tread = [], side = [];
  const vid = (v, sT, sS) => { const key = v * 9 + (sT + 1) * 3 + (sS + 1); let id = map.get(key); if (id === undefined) {
      id = outP.length / 3; outP.push(mesh.positions[3 * v], mesh.positions[3 * v + 1], mesh.positions[3 * v + 2]); outN.push(wN[3 * v], wN[3 * v + 1], wN[3 * v + 2]);
      outUV.push(mesh.uvTread[2 * v] + sT, mesh.uvTread[2 * v + 1]); outUV1.push(mesh.uvSide[2 * v] + sS, mesh.uvSide[2 * v + 1]); map.set(key, id); } return id; };
  const unwrapShifts = (src, q) => {               // per-corner integer shifts (in circumference units) so the face is continuous
    const us = q.map(v => src[2 * v]); const sh = us.map(() => 0);
    for (let k = 1; k < 4; k++) { const d = us[k] - us[0]; if (d > 0.5) sh[k] = -1; else if (d < -0.5) sh[k] = 1; }
    return sh;
  };
  for (let f = 0; f < F; f++) {
    const q = [mesh.quads[4 * f], mesh.quads[4 * f + 1], mesh.quads[4 * f + 2], mesh.quads[4 * f + 3]];
    const isTread = mesh.quadGroup[f] === 0; const dst = isTread ? tread : side;
    const shT = unwrapShifts(mesh.uvTread, q), shS = unwrapShifts(mesh.uvSide, q);
    const ids = q.map((v, k) => vid(v, shT[k], shS[k]));
    dst.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(outP, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(outN, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(outUV, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(outUV1, 2));
  g.setIndex(tread.concat(side));
  g.addGroup(0, tread.length, 0); g.addGroup(tread.length, side.length, 1);
  g.computeBoundingSphere();
  return g;
}

export function quadMeshToObj(mesh, name = 'tyre') {
  const lines = [`# ${name} — pure quad topology, ${mesh.quads.length / 4} faces, units: mm`, `o ${name}`];
  for (let i = 0; i < mesh.positions.length; i += 3) lines.push(`v ${mesh.positions[i].toFixed(4)} ${mesh.positions[i + 1].toFixed(4)} ${mesh.positions[i + 2].toFixed(4)}`);
  const F = mesh.quads.length / 4;
  let last = -1;
  for (let f = 0; f < F; f++) {
    if (mesh.quadGroup[f] !== last) { last = mesh.quadGroup[f]; lines.push(`usemtl ${last === 0 ? 'tread' : 'sidewall'}`); }
    lines.push(`f ${mesh.quads[4 * f] + 1} ${mesh.quads[4 * f + 1] + 1} ${mesh.quads[4 * f + 2] + 1} ${mesh.quads[4 * f + 3] + 1}`);
  }
  return lines.join('\n') + '\n';
}

// -----------------------------------------------------------------------------------------------------------------------
//  Topology audit (used by the page's report and by the tests)
// -----------------------------------------------------------------------------------------------------------------------
export function auditQuadMesh(mesh) {
  const F = mesh.quads.length / 4, N = mesh.positions.length / 3;
  const directed = new Map(), undirected = new Map(); let degenerate = 0;
  for (let f = 0; f < F; f++) {
    const q = [0, 1, 2, 3].map(k => mesh.quads[4 * f + k]);
    if (new Set(q).size < 4) degenerate++;
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4]; const dk = a + '>' + b; directed.set(dk, (directed.get(dk) || 0) + 1);
      const uk = a < b ? a + '_' + b : b + '_' + a; undirected.set(uk, (undirected.get(uk) || 0) + 1);
    }
  }
  let boundary = 0, nonManifold = 0; for (const c of undirected.values()) { if (c === 1) boundary++; else if (c > 2) nonManifold++; }
  let sameDirection = 0; for (const c of directed.values()) if (c > 1) sameDirection++;
  const E = undirected.size;
  return { vertices: N, edges: E, faces: F, boundaryEdges: boundary, nonManifoldEdges: nonManifold, inconsistentEdges: sameDirection, degenerateFaces: degenerate, eulerCharacteristic: N - E + F, watertight: boundary === 0 && nonManifold === 0 && sameDirection === 0 && degenerate === 0 };
}

// -----------------------------------------------------------------------------------------------------------------------
//  2D editor helpers (pure). Shapes are {kind:'stroke'|'polygon'|'circle', pts:[[u,v]..], width?, r?, depth?}
//  in tread millimetres: u along the circumference (periodic, length C), v across (0 = centre line).
// -----------------------------------------------------------------------------------------------------------------------
const periodicDu = (a, b, C) => { let d = (a - b) % C; if (d < 0) d += C; return d > C / 2 ? d - C : d; };
function distPointSeg(pu, pv, a, b, C) {
  const du = periodicDu(b[0], a[0], C), dv = b[1] - a[1];
  const l2 = du * du + dv * dv || 1e-12;
  const qu = periodicDu(pu, a[0], C), qv = pv - a[1];
  const t = Math.max(0, Math.min(1, (qu * du + qv * dv) / l2));
  return Math.hypot(qu - t * du, qv - t * dv);
}
/** Distance from (u,v) to a shape's outline (0 when inside a block or circle). */
export function shapeDistance(s, u, v, C) {
  if (s.kind === 'circle') { const c = s.pts[0]; const du = periodicDu(u, c[0], C), dv = v - c[1]; return Math.max(0, Math.hypot(du, dv) - (s.r || 3)); }
  const pts = s.pts || []; if (!pts.length) return Infinity;
  if (s.kind === 'stroke') {
    let best = Infinity; for (let i = 0; i + 1 < pts.length; i++) best = Math.min(best, distPointSeg(u, v, pts[i], pts[i + 1], C));
    if (pts.length === 1) best = Math.hypot(periodicDu(u, pts[0][0], C), v - pts[0][1]);
    return Math.max(0, best - (s.width || 3) / 2);
  }
  // polygon: inside → 0, otherwise distance to the nearest edge
  let best = Infinity; for (let i = 0; i < pts.length; i++) best = Math.min(best, distPointSeg(u, v, pts[i], pts[(i + 1) % pts.length], C));
  return inPolygonPeriodic(u, v, pts, C) ? 0 : best;
}
function inPolygonPeriodic(u, v, pts, C) {
  // unwrap the vertices along u (consecutive vertices are taken as the short way round), then test the point at the
  // periodic image nearest the polygon's first vertex, and also one period either side
  const U = [pts[0][0]]; for (let i = 1; i < pts.length; i++) U.push(U[i - 1] + periodicDu(pts[i][0], pts[i - 1][0], C));
  const base = U[0] + periodicDu(u, U[0], C);
  for (const pu of [base - C, base, base + C]) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = U[i], yi = pts[i][1], xj = U[j], yj = pts[j][1];
      if ((yi > v) !== (yj > v) && pu < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
/** True when (u,v) lies within `tol` mm of the shape (for selection and erasing). */
export function hitShape(s, u, v, C, tol = 2) { return shapeDistance(s, u, v, C) <= tol; }
/** Mirror a shape across the tread centre line (v → −v). */
export function mirrorShape(s) {
  const m = Object.assign({}, s, { pts: (s.pts || []).map(p => [p[0], -p[1]]) });
  return m;
}
/** Translate a shape by (du, dv) in mm, keeping u inside [0, C). */
export function moveShape(s, du, dv, C) {
  return Object.assign({}, s, { pts: (s.pts || []).map(p => [((p[0] + du) % C + C) % C, p[1] + dv]) });
}
