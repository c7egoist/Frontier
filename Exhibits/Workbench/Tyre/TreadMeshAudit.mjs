// Headless audit of the procedural tread mesh in References/TyreGenerator.html.
//
// The generator is a browser prototype, so its geometry has never had a gate on it. This runs the tread
// builder with no browser, no canvas and no WebGL, and reports whether the mesh it produces is closed.
//
//   boundary       edges used by exactly one triangle. The tread is a band, so its two shoulder rims are
//                  legitimately open; anything else open is a crack you can see through.
//   nonManifold    edges used by more than two triangles — surfaces stacked on top of each other.
//   degenerate     zero-area triangles.
//
// Vertices are welded by position to 0.1 um before the audit, so float noise is not reported as a crack;
// what is left is genuine topology. Run:  node Exhibits/Workbench/Tyre/TreadMeshAudit.mjs
//
// Requires clipper-lib and earcut (npm i clipper-lib earcut) and reads the generator by extracting its
// geometry functions, so it audits the shipped file rather than a copy that can drift away from it.
import ClipperLib from 'clipper-lib';
import earcut from 'earcut';
import fs from 'fs';

globalThis.window = { ClipperLib };

// --- minimal THREE surface used by the tread builder ------------------------------------------------
class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } }
const THREE = {
  Vector2,
  ShapeUtils: {
    triangulateShape(contour, holes) {
      const verts = []; const holeIdx = [];
      for (const p of contour) verts.push(p.x, p.y);
      for (const h of holes) { holeIdx.push(verts.length / 2); for (const p of h) verts.push(p.x, p.y); }
      const tri = earcut(verts, holeIdx, 2);
      const out = [];
      for (let i = 0; i < tri.length; i += 3) out.push([tri[i], tri[i + 1], tri[i + 2]]);
      return out;
    },
  },
  BufferGeometry: class { constructor() { this.attributes = {}; this.userData = {}; }
    setAttribute(n, a) { this.attributes[n] = a; } computeBoundingSphere() {} },
  Float32BufferAttribute: class { constructor(arr, n) { this.array = arr; this.itemSize = n; } },
};
globalThis.THREE = THREE;

// Pull the geometry core straight out of the generator so this cannot audit a stale duplicate.
const HTML = fs.readFileSync(new URL('../../../References/TyreGenerator.html', import.meta.url), 'utf8').split('\n');
const at = pat => { const i = HTML.findIndex(l => l.includes(pat)); if (i < 0) throw new Error('not found: ' + pat); return i + 1; };
const span = (x, y) => HTML.slice(x - 1, y).join('\n');
const core = [span(at('const T = {'), at('const T = {') + 6), span(at('const LAYER_DEFS = {'), at('const LAYER_DEFS = {') + 20),
              span(at('function dims(t = T) {'), at('function dims(t = T) {') + 7),
              span(at('const TAU = Math.PI * 2;'), at('function buildSidewallGeometry') - 2),
              span(at('function sampleDepth'), at('function sampleDepth') + 5)].join('\n\n');
eval(core + '\nglobalThis.__api = { T, L, dims, treadRegions, buildPolyTread, patternPolygons, exPolygons, treadProfileAt };');
const { T, L, dims, treadRegions, buildPolyTread, patternPolygons } = globalThis.__api;

// --- pattern under test: the off-road preset, the busiest tread in the generator --------------------
globalThis.P = { name: 'Grizzly Magnum', type: 'Off-road', layers: [
  L('circ', { pos: 0, width: 12, zig: 6, zigCount: 28 }),
  L('circ', { pos: 0.55, width: 11, zig: 5, zigCount: 28 }),
  L('circ', { pos: -0.55, width: 11, zig: 5, zigCount: 28 }),
  L('lateral', { count: 28, angle: 18, width: 12, from: 0.3, to: 1.3, phase: 0 }),
  L('lateral', { count: 28, angle: -18, width: 12, from: -1.3, to: -0.3, phase: 0.5 }),
  L('lateral', { count: 28, angle: 0, width: 9, from: -0.3, to: 0.3, phase: 0.25 }),
  L('sipe', { count: 56, angle: 12, width: 1.5, depth: 0.4, from: -1.3, to: 1.3, zig: 2 }),
] };
Object.assign(T, { width: 285, aspect: 70, rim: 17, treadDepth: 15, treadFrac: 0.92, crown: 3, shoulder: 14 });

const d = dims(T);

// --- depth map, rasterised from the same groove polygons the booleans use ---------------------------
// 📝 The page builds this on a 2D canvas. There is no canvas here, so the groove polygons are scan
//    converted directly. Same inputs, same levels: what matters is that BASELINE and FIXED are audited
//    against the identical map, so any change in the crack count is the geometry code and not the map.
function buildDepthMap(d, W, H) {
  const { grooves } = patternPolygons(P, d, T.treadDepth);
  const depth = new Float32Array(W * H);
  const A = d.acrossHalf, circ = d.circ;
  const sorted = [...grooves].sort((a, b) => a.depth - b.depth);
  for (const g of sorted) {
    for (const path of g.paths) {
      const ring = path.map(p => [p.X / 100, p.Y / 100]);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of ring) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      const px0 = Math.max(0, Math.floor(x0 / circ * W)), px1 = Math.min(W - 1, Math.ceil(x1 / circ * W));
      const py0 = Math.max(0, Math.floor((y0 + A) / (2 * A) * H)), py1 = Math.min(H - 1, Math.ceil((y1 + A) / (2 * A) * H));
      for (let py = py0; py <= py1; py++) {
        const wy = (py + 0.5) / H * 2 * A - A;
        for (let px = px0; px <= px1; px++) {
          const wx = (px + 0.5) / W * circ;
          let inside = false;
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
            if (((yi > wy) !== (yj > wy)) && (wx < (xj - xi) * (wy - yi) / (yj - yi) + xi)) inside = !inside;
          }
          if (inside) depth[py * W + px] = Math.max(depth[py * W + px], g.depth);
        }
      }
    }
  }
  return { W, H, k: W / circ, depth, wearRow: () => 0 };
}

// --- the audit --------------------------------------------------------------------------------------
function audit(geo) {
  const pos = geo.attributes.position.array;
  const nv = pos.length / 3, nt = nv / 3;
  const Q = 1e4;                                   // weld tolerance: 0.1 micrometre in mm units
  const key = i => `${Math.round(pos[i * 3] * Q)},${Math.round(pos[i * 3 + 1] * Q)},${Math.round(pos[i * 3 + 2] * Q)}`;
  const vid = new Map(); const idx = new Int32Array(nv);
  for (let i = 0; i < nv; i++) { const k = key(i); let v = vid.get(k); if (v === undefined) { v = vid.size; vid.set(k, v); } idx[i] = v; }

  const edge = new Map(); let degenerate = 0;
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    if (a === b || b === c || a === c) { degenerate++; continue; }
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u < v ? `${u}_${v}` : `${v}_${u}`;
      edge.set(k, (edge.get(k) || 0) + 1);
    }
  }
  // where a boundary edge sits decides whether it is a defect. The tread band is a strip: its two shoulder
  //    rims are legitimately open (the sidewall lathe attaches there). Anything open in the interior is a crack.
  const vpos = new Map();
  for (let i = 0; i < nv; i++) if (!vpos.has(idx[i])) vpos.set(idx[i], [pos[i*3], pos[i*3+1], pos[i*3+2]]);
  let maxAx = 0; for (const q of vpos.values()) maxAx = Math.max(maxAx, Math.abs(q[0]));
  let boundary = 0, nonManifold = 0, rim = 0, interior = 0, vertical = 0, horizontal = 0; const rads = new Map(); const hist = new Array(10).fill(0);
  for (const [k, c] of edge) {
    if (c > 2) { nonManifold++; continue; }
    if (c !== 1) continue;
    boundary++;
    const [u, v] = k.split('_').map(Number);
    const a = vpos.get(u), b = vpos.get(v);
    if (Math.abs(a[0]) > maxAx - 0.35 && Math.abs(b[0]) > maxAx - 0.35) { rim++; continue; }
    interior++;
    const ra = Math.hypot(a[1], a[2]), rb = Math.hypot(b[1], b[2]);
    if (Math.abs(ra - rb) > 0.02) vertical++; else horizontal++;
    const f = Math.max(Math.abs(a[0]), Math.abs(b[0])) / maxAx;
    hist[Math.min(9, Math.floor(f * 10))]++;
    rads.set(Math.round(ra * 20) / 20, (rads.get(Math.round(ra * 20) / 20) || 0) + 1);
  }
  const top = [...rads.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6);
  return { tris: nt, verts: nv, welded: vid.size, degenerate, edges: edge.size,
           boundary, shoulderRim: rim, interiorCracks: interior, crackVertical: vertical, crackHorizontal: horizontal, hotRadii: top, axialHistogram: hist, nonManifold };
}

const W = 1024, H = Math.max(16, Math.round(1024 / d.circ * 2 * d.acrossHalf));
const pm = buildDepthMap(d, W, H);
const geo = buildPolyTread(d, pm);
const r = audit(geo);
console.log(JSON.stringify(r, null, 2));
fs.writeFileSync(new URL('./result.json', import.meta.url), JSON.stringify(r));
