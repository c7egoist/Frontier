/* ════════════════════════════════════════════════════════════════════
   geometry.js — road ribbon meshing + OBJ export (pure, no DOM/three).
   Y-up, metres. Colours are linear-ish 0..1 vertex colours.
   ════════════════════════════════════════════════════════════════════ */
import {sampleRoad} from './spline.js';
import {sampleAtStation, buildTopology} from './topology.js';
import {effectivePoints} from './state.js';

/** Surface presets: road + shoulder vertex colours. */
export const SURFACES = {
  asphalt:  {label: 'Asphalt',  road: [0.200, 0.212, 0.230], shoulder: [0.160, 0.168, 0.182]},
  concrete: {label: 'Concrete', road: [0.585, 0.595, 0.590], shoulder: [0.500, 0.510, 0.505]},
  gravel:   {label: 'Gravel',   road: [0.512, 0.462, 0.372], shoulder: [0.440, 0.394, 0.316]},
  dirt:     {label: 'Dirt',     road: [0.410, 0.300, 0.196], shoulder: [0.345, 0.250, 0.163]}
};
export const SURFACE_IDS = Object.keys(SURFACES);

export const CENTER_MARKINGS = {
  none: 'None', single: 'Single solid', double: 'Double solid', dashed: 'Dashed'
};
export const MARK_WHITE = [0.88, 0.88, 0.86];
export const MARK_YELLOW = [0.91, 0.74, 0.23];
export const KERB_COLOR = [0.62, 0.62, 0.60];
export const RAIL_COLOR = [0.70, 0.72, 0.74];
export const POST_COLOR = [0.42, 0.43, 0.44];
export const CONCRETE = [0.55, 0.55, 0.53];
export const CONCRETE_DK = [0.34, 0.34, 0.33];
export const GIRDER = [0.45, 0.46, 0.48];

/** Base paved+shoulder width at w=1 (metres). */
export function baseWidth(road) {
  return Math.max(0.5, road.lanes * road.laneWidth + road.shoulderL + road.shoulderR);
}

function shadeVariation(s) {
  return 1 + 0.028 * Math.sin(s * 1.7) + 0.018 * Math.sin(s * 0.43 + 2.0);
}

function pushGrid(part, rows) {
  // rows: array of arrays of {x,y,z, nx,ny,nz, r,g,b, u,v}; triangulate strip grid.
  const R = rows.length, C = rows[0].length;
  const P = [], N = [], Cc = [], U = [], I = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const v = rows[r][c];
    P.push(v.x, v.y, v.z); N.push(v.nx, v.ny, v.nz);
    Cc.push(v.r, v.g, v.b); U.push(v.u, v.v);
  }
  // Winding (a, a+1, b),(a+1, b+1, b): CCW seen from +Y with S=(-tz,tx) columns. See notes.
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
    const a = r * C + c, b = (r + 1) * C + c;
    I.push(a, a + 1, b, a + 1, b + 1, b);
  }
  part.positions = new Float32Array(P);
  part.normals = new Float32Array(N);
  part.colors = new Float32Array(Cc);
  part.uvs = new Float32Array(U);
  part.indices = new Uint32Array(I);
  part.triangles = I.length / 3;
}

function frameNormal(tx, tz, grade, crossSlope) {
  tx = Number.isFinite(tx) ? tx : 1; tz = Number.isFinite(tz) ? tz : 0;
  grade = Number.isFinite(grade) ? grade : 0;
  crossSlope = Number.isFinite(crossSlope) ? crossSlope : 0;
  // N = normalize(cross(S3, T3)), S3=(-tz,k,tx), T3=(tx,g,tz).
  const Sx = -tz, Sy = crossSlope, Sz = tx;
  const Tx = tx, Ty = grade, Tz = tz;
  let nx = Sy * Tz - Sz * Ty, ny = Sz * Tx - Sx * Tz, nz = Sx * Ty - Sy * Tx;
  const L = Math.hypot(nx, ny, nz) || 1;
  return [nx / L, ny / L, nz / L];
}

/** Per-road ribbon closures (drape, widths, cross heights). Shared by runs, junctions, bridges. */
export function roadContext(road, terrain) {
  const surf = SURFACES[road.surface] || SURFACES.asphalt;
  const drape = road.conform === 'drape' && typeof terrain === 'function';
  const drapeOff = +road.drapeOffset || 0;
  const baseY = (p) => {
    if (!drape) return p.y;
    const t = terrain(p.x, p.z);
    return t == null || !Number.isFinite(t) ? p.y : t + drapeOff;
  };
  const halfRoad = (p) => Math.max(0.25, (road.lanes * road.laneWidth * (p.w || 1)) / 2);
  const shoulders = (p) => {
    const wScale = p.w || 1;
    return [Math.max(0, +road.shoulderL || 0) * wScale, Math.max(0, +road.shoulderR || 0) * wScale];
  };
  // Cross height at offset o (metres, S=(-tz,tx) side positive).
  const crossY = (p, yBase, hr, o) => {
    const ao = Math.abs(o);
    if (ao <= hr) {
      const camber = +road.camber || 0;
      return camber > 0 ? yBase + camber * (1 - (o / hr) * (o / hr)) : yBase;
    }
    return yBase - (ao - hr) * 0.025; // shoulder fall
  };
  return {surf, drape, baseY, halfRoad, shoulders, crossY};
}

const smooth01 = (t) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

/**
 * Build all mesh parts for one road (full length, no junction trimming).
 * @param {object} road — project road record.
 * @param {object} opts — {step, terrain: fn(x,z)->y|null}.
 *//**
 * Build all mesh parts for one road.
 * @param {object} road — project road record.
 * @param {object} opts — {step, terrain: fn(x,z)->y|null}.
 */
export function buildRoadMesh(road, {step = 1.0, terrain = null} = {}) {
  const smp = sampleRoad(road.points, {closed: road.closed, step});
  const stats = {length: smp.length, triangles: 0, minRadius: smp.minRadius ?? Infinity, maxGrade: smp.maxGrade ?? 0};
  if (!smp.count) return {parts: [], samples: smp, stats};
  const {parts, stats: rs} = buildRunParts(road, smp.samples, roadContext(road, terrain), {});
  stats.triangles = rs.triangles;
  return {parts, samples: smp, stats};
}

/**
 * Mesh parts for one contiguous sample run (a road between junction cuts).
 * @param {Array} S — centreline samples (absolute stations).
 * @param {object} ctx — roadContext(road, terrain).
 * @param {object} opts — {tag: part-name suffix, railCuts: [{s0,s1}]}.
 */
export function buildRunParts(road, S, ctx, {tag = '', railCuts = []} = {}) {
  const parts = [];
  const stats = {triangles: 0};
  if (!S || S.length < 2) return {parts, stats};
  const {surf, baseY, halfRoad, crossY} = ctx;
  const nm = (n) => (tag ? `${n}.${tag}` : n);

  /* ── main surface: lanes + shoulders in one grid ── */
  {
    const NL = Math.max(5, road.lanes + 2); // columns across lanes
    // Offsets are fractions resolved per-sample (width varies with w).
    const laneF = [];
    for (let c = 0; c < NL; c++) laneF.push(-1 + (2 * c) / (NL - 1));
    const rows = [];
    for (const p of S) {
      const hr = halfRoad(p);
      const wScale = p.w || 1;
      const shL = Math.max(0, +road.shoulderL || 0) * wScale;
      const shR = Math.max(0, +road.shoulderR || 0) * wScale;
      const offs = [];
      if (shL > 0) offs.push(-hr - shL, -hr - shL * 0.45);
      for (const f of laneF) offs.push(f * hr);
      if (shR > 0) offs.push(hr + shR * 0.45, hr + shR);
      const yB = baseY(p);
      const shade = shadeVariation(p.s);
      const row = offs.map((o) => {
        const y = crossY(p, yB, hr, o);
        const inLane = Math.abs(o) <= hr + 1e-6;
        const col = inLane ? surf.road : surf.shoulder;
        return {o, x: p.x - p.tz * o, y, z: p.z + p.tx * o, r: col[0] * shade, g: col[1] * shade, b: col[2] * shade, u: o, v: p.s};
      });
      // Cross-slope per column from neighbours, then normals.
      for (let c = 0; c < row.length; c++) {
        const a = row[Math.max(0, c - 1)], b = row[Math.min(row.length - 1, c + 1)];
        const k = (b.y - a.y) / Math.max(1e-6, b.o - a.o || 1e-6);
        const [nx, ny, nz] = frameNormal(p.tx, p.tz, p.grade, k);
        row[c].nx = nx; row[c].ny = ny; row[c].nz = nz;
      }
      rows.push(row);
    }
    if (rows.length > 1) {
      const part = {name: nm('surface'), roadId: road.id};
      pushGrid(part, rows);
      parts.push(part);
    }
  }

  /* ── painted markings (thin lifted strips) ── */
  const strip = (name, oA, oB, color, keep) => {
    const rows = [];
    for (const p of S) {
      if (keep && !keep(p)) continue;
      const hr = halfRoad(p);
      const yB = baseY(p);
      const mk = (o) => {
        const y = crossY(p, yB, hr, o) + 0.02;
        return {x: p.x - p.tz * o, y, z: p.z + p.tx * o, r: color[0], g: color[1], b: color[2], u: o, v: p.s};
      };
      const row = [mk(oA), mk(oB)];
      for (const v of row) {
        const [nx, ny, nz] = frameNormal(p.tx, p.tz, p.grade, 0);
        v.nx = nx; v.ny = ny; v.nz = nz;
      }
      rows.push(row);
    }
    if (rows.length > 1) {
      const part = {name, roadId: road.id};
      pushGrid(part, rows);
      parts.push(part);
    }
  };
  const cm = road.centerMarking || 'none';
  if (cm === 'single') strip(nm('marking-center'), -0.07, 0.07, MARK_WHITE);
  else if (cm === 'double') {
    strip(nm('marking-center-L'), -0.24, -0.12, MARK_YELLOW);
    strip(nm('marking-center-R'), 0.12, 0.24, MARK_YELLOW);
  } else if (cm === 'dashed') {
    strip(nm('marking-center'), -0.07, 0.07, MARK_WHITE, (p) => (p.s % 9) < 3);
  }
  if (road.edgeMarking) {
    // Edge lines ride just inside the lane edge; offsets resolved per-sample via w.
    const rows = [];
    for (const side of [-1, 1]) {
      const rr = [];
      for (const p of S) {
        const hr = halfRoad(p);
        if (hr < 0.6) continue;
        const oC = side * (hr - 0.22);
        const yB = baseY(p);
        const mk = (o) => {
          const y = crossY(p, yB, hr, o) + 0.02;
          const [nx, ny, nz] = frameNormal(p.tx, p.tz, p.grade, 0);
          return {x: p.x - p.tz * o, y, z: p.z + p.tx * o, nx, ny, nz, r: MARK_WHITE[0], g: MARK_WHITE[1], b: MARK_WHITE[2], u: o, v: p.s};
        };
        rr.push([mk(oC - 0.06), mk(oC + 0.06)]);
      }
      if (rr.length > 1) {
        const part = {name: nm(side < 0 ? 'marking-edge-L' : 'marking-edge-R'), roadId: road.id};
        pushGrid(part, rr);
        parts.push(part);
      }
    }
  }

  /* ── kerbs: small L-profile at the shoulder edge ── */
  for (const side of [-1, 1]) {
    const want = side < 0 ? road.kerbL : road.kerbR;
    if (!want) continue;
    const rows = [];
    for (const p of S) {
      const hr = halfRoad(p);
      const wScale = p.w || 1;
      const sh = side < 0 ? Math.max(0, +road.shoulderL || 0) * wScale : Math.max(0, +road.shoulderR || 0) * wScale;
      const edge = side * (hr + sh);
      const yB = baseY(p);
      const hEdge = crossY(p, yB, hr, edge);
      const prof = [
        {o: edge, y: hEdge + 0.005},
        {o: edge + side * 0.06, y: hEdge + 0.14},
        {o: edge + side * 0.30, y: hEdge + 0.14}
      ];
      const row = prof.map(({o, y}) => {
        const [nx, ny, nz] = frameNormal(p.tx, p.tz, p.grade, side * 0.4);
        return {x: p.x - p.tz * o, y, z: p.z + p.tx * o, nx, ny, nz, r: KERB_COLOR[0], g: KERB_COLOR[1], b: KERB_COLOR[2], u: o, v: p.s};
      });
      rows.push(row);
    }
    if (rows.length > 1) {
      const part = {name: nm(side < 0 ? 'kerb-L' : 'kerb-R'), roadId: road.id};
      pushGrid(part, rows);
      parts.push(part);
    }
  }

  /* ── guardrails (W-beam v2; bridge spans excluded — decks rail themselves) ── */
  for (const side of [-1, 1]) {
    const want = side < 0 ? road.guardrailL : road.guardrailR;
    if (!want) continue;
    const offFn = (q) => {
      const hr = halfRoad(q);
      const sh = side < 0 ? ctx.shoulders(q)[0] : ctx.shoulders(q)[1];
      return side * (hr + sh + 0.6);
    };
    const gndFn = (q) => {
      const hr = halfRoad(q);
      const sh = side < 0 ? ctx.shoulders(q)[0] : ctx.shoulders(q)[1];
      return crossY(q, baseY(q), hr, side * (hr + sh));
    };
    for (const sub of subtractRanges(S, railCuts)) {
      if (sub.length >= 2) parts.push(...buildRailRun(sub, side, offFn, gndFn, {roadId: road.id, railName: nm(side < 0 ? 'rail-L' : 'rail-R'), postName: nm(side < 0 ? 'posts-L' : 'posts-R')}));
    }
  }

  for (const pt of parts) stats.triangles += pt.triangles;
  return {parts, stats};
}

/** Total triangle estimate for a project (for UI budgets). */
export function countProjectTriangles(project, {terrain = null, samples = null, topo = null} = {}) {
  if (samples && topo) return buildNetworkMesh(project, samples, topo, terrain).stats.triangles;
  let t = 0;
  for (const road of project.roads) {
    if (road.visible === false) continue;
    t += buildRoadMesh(road, {terrain}).stats.triangles;
  }
  return t;
}

const safeName = (s) => String(s || 'road').replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 48) || 'road';

/**
 * Serialize a project to Wavefront OBJ (Y-up metres, geometry only —
 * same header convention as Terrain Lab exports). Runs, junction paving,
 * bridges and rails are all included. Returns a string.
 */
export function roadNetworkToOBJ(project, {step = 1.0, terrain = null, samples = null, topo = null} = {}) {
  const lines = [];
  const stamp = new Date().toISOString();
  const smp = samples || (() => {
    const m = new Map();
    for (const r of project.roads || []) m.set(r.id, sampleRoad(effectivePoints(project, r), {closed: r.closed, step}));
    return m;
  })();
  const tp = topo || buildTopology(project, smp);
  lines.push('# Frontier road network | units: meters | Y-up');
  lines.push(`# Project: ${project.name || 'untitled'} | roads: ${project.roads.length} | exported: ${stamp}`);
  const summary = project.roads.map((r) => {
    const s = smp.get(r.id);
    return {name: r.name, closed: !!r.closed, points: r.points.length, length_m: +(s?.length || 0).toFixed(2),
      lanes: r.lanes, laneWidth_m: r.laneWidth, surface: r.surface};
  });
  lines.push(`# Roads: ${JSON.stringify(summary)}`);
  lines.push(`# Topology: ${tp.intersections.length} intersections, ${tp.overpasses.length} overpasses, ${tp.bridges.length} bridge spans`);
  const roadName = new Map((project.roads || []).map((r) => [r.id, safeName(r.name || r.id)]));
  const {parts} = buildNetworkMesh(project, smp, tp, terrain);
  let vo = 0;
  for (const part of parts) {
    const label = part.junction ? part.name : `${roadName.get(part.roadId) || 'road'}__${part.name}`;
    lines.push(`o ${label}`);
    const {positions: P, normals: N, uvs: U, indices: I} = part;
    for (let i = 0; i < P.length; i += 3) lines.push(`v ${P[i].toFixed(4)} ${P[i + 1].toFixed(4)} ${P[i + 2].toFixed(4)}`);
    for (let i = 0; i < U.length; i += 2) lines.push(`vt ${U[i].toFixed(3)} ${U[i + 1].toFixed(3)}`);
    for (let i = 0; i < N.length; i += 3) lines.push(`vn ${N[i].toFixed(5)} ${N[i + 1].toFixed(5)} ${N[i + 2].toFixed(5)}`);
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] + 1 + vo, b = I[i + 1] + 1 + vo, c = I[i + 2] + 1 + vo;
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    vo += P.length / 3;
  }
  return lines.join('\n') + '\n';
}

/* ════════════════════════════════════════════════════════════════════
   Network meshing — runs, junction paving, bridges, rails.
   ════════════════════════════════════════════════════════════════════ */

/** Subtract station cuts from a sample array → contiguous sub-arrays (boundaries pinned). */
export function subtractRanges(S, cuts) {
  if (!S.length) return [];
  if (!cuts || !cuts.length) return [S];
  const lo = S[0].s, hi = S[S.length - 1].s;
  const cs = cuts.filter((c) => c.s1 > c.s0).sort((a, b) => a.s0 - b.s0);
  const union = [];
  for (const c of cs) {
    const u = union[union.length - 1];
    if (u && c.s0 <= u.s1 + 0.01) u.s1 = Math.max(u.s1, c.s1);
    else union.push({s0: c.s0, s1: c.s1});
  }
  const spans = [];
  let from = lo;
  for (const c of union) {
    if (c.s0 - from > 0.3) spans.push([from, c.s0]);
    from = Math.max(from, c.s1);
  }
  if (hi - from > 0.3) spans.push([from, hi]);
  return spans.map(([a, b]) => {
    const arr = S.filter((p) => p.s >= a - 1e-6 && p.s <= b + 1e-6);
    const s0 = sampleAtStation(S, a), s1 = sampleAtStation(S, b);
    if (arr.length && Math.abs(arr[0].s - a) > 1e-4) arr.unshift({...s0});
    if (arr.length && Math.abs(arr[arr.length - 1].s - b) > 1e-4) arr.push({...s1});
    return arr;
  }).filter((a) => a.length >= 2);
}

/** Two-column strip part (vertical faces, parapets, fascia…). */
function stripPart(name, roadId, rows) {
  if (!rows || rows.length < 2) return null;
  const part = {name, roadId};
  pushGrid(part, rows);
  return part;
}

/** One part from many axis boxes: [{c:[x,y,z], s:[sx,sy,sz], yaw, color}]. */
function boxesToPart(name, roadId, boxes) {
  const P = [], N = [], Cc = [], U = [], I = [];
  let vi = 0;
  const F = [
    {n: [1, 0, 0], c: [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]]},
    {n: [-1, 0, 0], c: [[-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1]]},
    {n: [0, 1, 0], c: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]},
    {n: [0, -1, 0], c: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]},
    {n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]},
    {n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]},
  ];
  for (const b of boxes) {
    const [cx, cy, cz] = b.c, [sx, sy, sz] = b.s;
    const yaw = b.yaw || 0, col = b.color;
    const cw = Math.cos(yaw), sw = Math.sin(yaw);
    for (const f of F) {
      const [nx, ny, nz] = f.n;
      const rnx = nx * cw + nz * sw, rnz = -nx * sw + nz * cw;
      const base = vi;
      for (const [lx, ly, lz] of f.c) {
        const x = (lx * sx) / 2, z = (lz * sz) / 2;
        P.push(cx + x * cw + z * sw, cy + (ly * sy) / 2, cz - x * sw + z * cw);
        N.push(rnx, ny, rnz);
        Cc.push(col[0], col[1], col[2]);
        U.push(lx * 0.5, ly * 0.5);
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      vi += 4;
    }
  }
  if (!I.length) return null;
  const part = {name, roadId};
  part.positions = new Float32Array(P);
  part.normals = new Float32Array(N);
  part.colors = new Float32Array(Cc);
  part.uvs = new Float32Array(U);
  part.indices = new Uint32Array(I);
  part.triangles = I.length / 3;
  return part;
}

/** Triangle fan part (junction tops): ring loop + center, accumulated normals. */
function fanPart(name, roadId, cx, cy, cz, ring, color) {
  const n = ring.length;
  if (n < 3) return null;
  const P = [cx, cy, cz], N = [0, 0, 0], Cc = [...color], U = [cx * 0.05, cz * 0.05];
  for (const v of ring) {
    P.push(v.x, v.y, v.z); N.push(0, 0, 0);
    Cc.push(color[0], color[1], color[2]); U.push(v.x * 0.05, v.z * 0.05);
  }
  const I = [];
  const acc = (i, nx, ny, nz) => { N[i * 3] += nx; N[i * 3 + 1] += ny; N[i * 3 + 2] += nz; };
  for (let i = 0; i < n; i++) {
    const a = 1 + i, b = 1 + ((i + 1) % n);
    I.push(0, a, b);
    const ax = P[a * 3] - cx, ay = P[a * 3 + 1] - cy, az = P[a * 3 + 2] - cz;
    const bx = P[b * 3] - cx, by = P[b * 3 + 1] - cy, bz = P[b * 3 + 2] - cz;
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    acc(0, nx, ny, nz); acc(a, nx, ny, nz); acc(b, nx, ny, nz);
  }
  for (let i = 0; i <= n; i++) {
    const L = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= L; N[i * 3 + 1] /= L; N[i * 3 + 2] /= L;
  }
  const part = {name, roadId};
  part.positions = new Float32Array(P);
  part.normals = new Float32Array(N);
  part.colors = new Float32Array(Cc);
  part.uvs = new Float32Array(U);
  part.indices = new Uint32Array(I);
  part.triangles = I.length / 3;
  return part;
}

/** Flat quads part (paint): quads are 4×[x,y,z], true per-quad normals. */
function quadsPart(name, roadId, quads, color) {
  if (!quads.length) return null;
  const P = [], N = [], Cc = [], U = [], I = [];
  let vi = 0;
  for (const q of quads) {
    const ax = q[1][0] - q[0][0], ay = q[1][1] - q[0][1], az = q[1][2] - q[0][2];
    const bx = q[3][0] - q[0][0], by = q[3][1] - q[0][1], bz = q[3][2] - q[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (const [x, y, z] of q) {
      P.push(x, y, z); N.push(nx, ny, nz);
      Cc.push(color[0], color[1], color[2]); U.push(x * 0.1, z * 0.1);
    }
    I.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const part = {name, roadId};
  part.positions = new Float32Array(P);
  part.normals = new Float32Array(N);
  part.colors = new Float32Array(Cc);
  part.uvs = new Float32Array(U);
  part.indices = new Uint32Array(I);
  part.triangles = I.length / 3;
  return part;
}

/* ── guardrails v2: corrugated W-beam, buried ends, posts + blockouts ── */
const RAIL_PROFILE = [[0.50, 0.020], [0.60, -0.030], [0.71, 0.030], [0.81, -0.015]]; // [height, wave]
export function buildRailRun(S, side, offFn, gndFn, {roadId = null, railName = 'rail', postName = 'posts', postSpacing = 2, bury = true, onDeck = false, maxPosts = 1200} = {}) {
  const parts = [];
  if (!S || S.length < 2) return parts;
  const sA = S[0].s, sB = S[S.length - 1].s;
  const bl = bury ? Math.min(4, Math.max(0, (sB - sA) / 2 - 0.6)) : 0;
  const endF = (s) => (bl <= 0 ? 1 : smooth01((s - sA) / bl) * smooth01((sB - s) / bl));
  const rows = [];
  for (const p of S) {
    const ro = offFn(p), gy = gndFn(p), e = endF(p.s);
    const L = Math.hypot(1, 0.12);
    rows.push(RAIL_PROFILE.map(([dy, wv]) => {
      const o = ro + side * wv * e;
      return {
        x: p.x - p.tz * o, y: gy + 0.06 + (dy - 0.06) * e, z: p.z + p.tx * o,
        nx: (-p.tz * side) / L, ny: 0.12 / L, nz: (p.tx * side) / L,
        r: RAIL_COLOR[0], g: RAIL_COLOR[1], b: RAIL_COLOR[2], u: o, v: p.s,
      };
    }));
  }
  if (rows.length > 1) {
    const part = {name: railName, roadId};
    pushGrid(part, rows);
    parts.push(part);
  }
  const boxes = [];
  const postO = (p) => offFn(p) - side * 0.24;
  for (let s = sA + 1; s < sB - 0.5; s += postSpacing) {
    if (endF(s) < 0.4) continue;
    const p = sampleAtStation(S, s);
    const gy = gndFn(p), yaw = Math.atan2(p.tx, p.tz);
    const postH = onDeck ? 0.55 : 0.78;
    const po = postO(p);
    boxes.push({c: [p.x - p.tz * po, gy + postH / 2 - 0.06, p.z + p.tx * po],
      s: [0.15, postH, 0.15], yaw, color: POST_COLOR});
    const bo = offFn(p) - side * 0.12;
    boxes.push({c: [p.x - p.tz * bo, gy + 0.60, p.z + p.tx * bo],
      s: [0.30, 0.16, 0.14], yaw, color: POST_COLOR});
    if (boxes.length >= maxPosts * 2) break;
  }
  const bp = boxesToPart(postName, roadId, boxes);
  if (bp) parts.push(bp);
  return parts;
}

/* ── junction paving: fan from approach frames + skirt + paint ── */
/**
 * Pure junction patch shape: approach frames + pavement ring + surface.
 * Shared by the 3D mesh builder and the plan view so both draw the same
 * merged pavement. Returns null when no patch can form.
 */
export function junctionPatch(ix, project, samples, terrain) {
  const legs = [...(ix.legs || [])].sort((a, b) => Math.atan2(a.dirx, -a.dirz) - Math.atan2(b.dirx, -b.dirz));
  if (legs.length < 2) return null;
  const C = {x: ix.x, z: ix.z};
  const frames = [];
  for (const l of legs) {
    const road = (project.roads || []).find((r) => r.id === l.roadId);
    const smp = samples.get(l.roadId);
    if (!road || !smp) continue;
    const ctx = roadContext(road, terrain);
    const b = sampleAtStation(smp.samples, l.sTrim);
    const yB = ctx.baseY(b);
    const hr = ctx.halfRoad(b);
    const edges = [-l.halfW, l.halfW].map((o) => ({
      o, x: b.x - b.tz * o, z: b.z + b.tx * o, y: ctx.crossY(b, yB, hr, o),
    }));
    frames.push({leg: l, road, smp, ctx, b, yC: ctx.crossY(b, yB, hr, 0), edges});
  }
  if (frames.length < 2) return null;
  const N = frames.length;
  // Per leg: the edge facing each neighbour corner (forced distinct).
  for (let i = 0; i < N; i++) {
    const F = frames[i], P = frames[(i - 1 + N) % N], Q = frames[(i + 1) % N];
    const dP = F.edges.map((e) => Math.hypot(e.x - P.b.x, e.z - P.b.z));
    const dQ = F.edges.map((e) => Math.hypot(e.x - Q.b.x, e.z - Q.b.z));
    let iP = dP[0] <= dP[1] ? 0 : 1;
    let iQ = dQ[0] <= dQ[1] ? 0 : 1;
    if (iP === iQ) iQ = 1 - iQ;
    F.ePrev = F.edges[iP];
    F.eNext = F.edges[iQ];
  }
  const ring = [];
  for (let i = 0; i < N; i++) {
    const e1 = frames[i].eNext, e2 = frames[(i + 1) % N].ePrev;
    ring.push({x: e1.x, y: e1.y, z: e1.z});
    const a1 = Math.atan2(e1.x - C.x, e1.z - C.z);
    const a2 = Math.atan2(e2.x - C.x, e2.z - C.z);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const r1 = Math.hypot(e1.x - C.x, e1.z - C.z), r2 = Math.hypot(e2.x - C.x, e2.z - C.z);
    for (let k = 1; k < 6; k++) {
      const f = k / 6, fs = f * f * (3 - 2 * f);
      const a = a1 + d * f, r = r1 + (r2 - r1) * f;
      ring.push({x: C.x + r * Math.sin(a), y: e1.y + (e2.y - e1.y) * fs, z: C.z + r * Math.cos(a)});
    }
    ring.push({x: e2.x, y: e2.y, z: e2.z});
  }
  const yC = frames.reduce((a, f) => a + f.yC, 0) / N;
  const wide = [...frames].sort((a, b) => b.leg.halfW - a.leg.halfW)[0];
  const surfId = wide.road.surface || 'asphalt';
  const surf = (SURFACES[surfId] || SURFACES.asphalt).road;
  return {ring, frames, surf, surfId, yC, C};
}

export function buildJunctionParts(ix, project, samples, terrain) {
  const parts = [];
  const patch = junctionPatch(ix, project, samples, terrain);
  if (!patch) return parts;
  const {ring, frames, surf, yC, C} = patch;
  const top = fanPart('junction-top', null, C.x, yC, C.z, ring, surf);
  if (top) { top.junction = ix.id; parts.push(top); }
  // Skirt hides any ribbon/patch seam.
  const skirtRows = [];
  for (let i = 0; i <= ring.length; i++) {
    const v = ring[i % ring.length];
    let ox = v.x - C.x, oz = v.z - C.z;
    const L = Math.hypot(ox, oz) || 1;
    ox /= L; oz /= L;
    skirtRows.push([
      {x: v.x, y: v.y + 0.01, z: v.z, nx: ox, ny: 0.15, nz: oz,
        r: CONCRETE_DK[0], g: CONCRETE_DK[1], b: CONCRETE_DK[2], u: i, v: 0},
      {x: v.x + ox * 0.3, y: v.y - 0.55, z: v.z + oz * 0.3, nx: ox, ny: 0.15, nz: oz,
        r: CONCRETE_DK[0], g: CONCRETE_DK[1], b: CONCRETE_DK[2], u: i, v: 1},
    ]);
  }
  const skirt = stripPart('junction-skirt', null, skirtRows);
  if (skirt) { skirt.junction = ix.id; parts.push(skirt); }
  // Paint: stop bars, crosswalks, gore chevrons.
  const quads = [];
  const R = ix.radius;
  const barAt = (F, frac, halfLen, depth, rot = 0) => {
    // Station frac of the way from trim boundary toward the center.
    const t = F.b;
    const toC = {x: C.x - t.x, z: C.z - t.z};
    const dl = Math.hypot(toC.x, toC.z) || 1;
    const dir = Math.sign((toC.x * t.tx + toC.z * t.tz) / dl) || 1;
    const sBar = F.leg.sTrim + dir * R * (1 - frac);
    const st = sampleAtStation(F.smp.samples, sBar);
    const y = F.ctx.crossY(st, F.ctx.baseY(st), F.ctx.halfRoad(st), 0) + 0.025;
    let ax = st.tx, az = st.tz;
    if (rot) {
      const c = Math.cos(rot), s = Math.sin(rot);
      const rx = ax * c - az * s, rz = ax * s + az * c;
      ax = rx; az = rz;
    }
    const px = -az, pz = ax; // across
    quads.push([
      [st.x - px * halfLen - ax * depth / 2, y, st.z - pz * halfLen - az * depth / 2],
      [st.x + px * halfLen - ax * depth / 2, y, st.z + pz * halfLen - az * depth / 2],
      [st.x + px * halfLen + ax * depth / 2, y, st.z + pz * halfLen + az * depth / 2],
      [st.x - px * halfLen + ax * depth / 2, y, st.z - pz * halfLen + az * depth / 2],
    ]);
  };
  if (ix.kind === 'merge') {
    for (const F of frames) {
      if (F.leg.role !== 'branch') continue;
      for (const f of [0.40, 0.55, 0.70]) barAt(F, f, 1.2, 0.22, 0.6);
    }
  } else {
    if (ix.kind === 'tee' || ix.kind === 'multi') {
      for (const F of frames) {
        if (F.leg.role !== 'branch') continue;
        const hw = F.leg.halfW * 0.72;
        barAt(F, 0.55, hw, 0.5);
      }
    }
    if (ix.kind === 'cross' || ix.kind === 'tee' || ix.kind === 'wye' || ix.kind === 'multi') {
      for (const F of frames) {
        const hw = Math.max(1, F.leg.halfW - 0.6);
        for (const f of [0.66, 0.78, 0.90]) barAt(F, f, hw, 0.45);
      }
    }
  }
  const paint = quadsPart('junction-paint', null, quads, MARK_WHITE);
  if (paint) { paint.junction = ix.id; parts.push(paint); }
  return parts;
}

/* ── bridges: deck furniture (surface stays), girders, piers, abutments ── */
export function pierStations(span, spacing) {
  const out = [];
  for (let s = span.s0 + 3; s < span.s1 - 3 + 1e-6; s += spacing) out.push(s);
  return out;
}

export function buildBridgeParts(road, S, span, terrain, topo) {
  const parts = [];
  const ctx = roadContext(road, terrain);
  const runs = subtractRanges(S, [{s0: -1e9, s1: span.s0}, {s0: span.s1, s1: 1e9}]);
  const run = runs[0];
  if (!run || run.length < 2) return parts;
  const dw = (p) => ctx.halfRoad(p) + Math.max(ctx.shoulders(p)[0], ctx.shoulders(p)[1]) + 0.18;
  const deckC = (p) => ctx.crossY(p, ctx.baseY(p), ctx.halfRoad(p), 0);
  // Fascia (deck edge beams).
  for (const side of [-1, 1]) {
    const rows = run.map((p) => {
      const o = side * dw(p);
      const L = Math.hypot(1, 0.05);
      const mk = (y) => ({x: p.x - p.tz * o, y, z: p.z + p.tx * o,
        nx: (-p.tz * side) / L, ny: 0.05 / L, nz: (p.tx * side) / L,
        r: CONCRETE[0], g: CONCRETE[1], b: CONCRETE[2], u: o, v: p.s});
      return [mk(deckC(p) - 0.03), mk(deckC(p) - 1.15)];
    });
    const part = stripPart('bridge-fascia', road.id, rows);
    if (part) parts.push(part);
  }
  // Longitudinal girders (skip the hidden top face).
  const avgW = run.reduce((a, p) => a + dw(p), 0) / run.length;
  const nG = Math.min(5, Math.max(2, Math.round((avgW * 2) / 3.2)));
  for (let gi = 0; gi < nG; gi++) {
    const fr = nG === 1 ? 0 : (-1 + (2 * gi) / (nG - 1)) * ((avgW - 0.9) / avgW);
    const faces = [
      {o: -0.2, top: true, n: [-1, 0, 0]},
      {o: 0.2, top: true, n: [1, 0, 0]},
    ];
    for (const f of faces) {
      const sgn = f.o < 0 ? -1 : 1;
      const rows = run.map((p) => {
        const o = fr * dw(p) + f.o;
        const mk = (y) => ({x: p.x - p.tz * o, y, z: p.z + p.tx * o,
          nx: -p.tz * sgn, ny: 0, nz: p.tx * sgn,
          r: GIRDER[0], g: GIRDER[1], b: GIRDER[2], u: o, v: p.s});
        return [mk(deckC(p) - 0.28), mk(deckC(p) - 1.02)];
      });
      const part = stripPart('bridge-girder', road.id, rows);
      if (part) parts.push(part);
    }
    const rows = run.map((p) => {
      const oc = fr * dw(p);
      const y = deckC(p) - 1.02;
      const mk = (o) => ({x: p.x - p.tz * o, y, z: p.z + p.tx * o,
        nx: 0, ny: -1, nz: 0, r: GIRDER[0], g: GIRDER[1], b: GIRDER[2], u: o, v: p.s});
      return [mk(oc - 0.2), mk(oc + 0.2)];
    });
    const part = stripPart('bridge-girder', road.id, rows);
    if (part) parts.push(part);
  }
  // Piers + diaphragms + abutments.
  const spacing = Math.min(30, Math.max(4, +road.bridgeSpacing || 12));
  const insideJunction = (x, z) => (topo?.intersections || [])
    .some((j) => Math.hypot(j.x - x, j.z - z) < j.radius);
  const groundAt = (x, z, fb) => {
    if (typeof terrain === 'function') {
      const t = terrain(x, z);
      if (t != null && Number.isFinite(t)) return t;
    }
    return fb;
  };
  let deckMin = Infinity;
  for (const p of run) deckMin = Math.min(deckMin, deckC(p));
  const boxes = [];
  for (const s of pierStations(span, spacing)) {
    const st = sampleAtStation(S, s);
    if (insideJunction(st.x, st.z)) continue;
    const yaw = Math.atan2(st.tx, st.tz);
    const soffit = deckC(st) - 1.02;
    const g = groundAt(st.x, st.z, deckMin - 6);
    if (soffit - g < 1.2) continue;
    const w = dw(st);
    boxes.push({c: [st.x, soffit - 0.45, st.z], s: [w * 2 + 0.8, 0.9, 1.2], yaw, color: CONCRETE});
    const offs = w * 2 > 7 ? [-(w - 1.3), w - 1.3] : [0];
    for (const o of offs) {
      const px = st.x - st.tz * o, pz = st.z + st.tx * o;
      const footTop = g + 0.15;
      boxes.push({c: [px, footTop - 0.35, pz], s: [2.0, 0.7, 2.0], yaw, color: CONCRETE_DK});
      const ch = soffit - 0.9 - footTop;
      if (ch > 0.3) boxes.push({c: [px, footTop + ch / 2, pz], s: [0.85, ch, 0.85], yaw, color: CONCRETE});
    }
    boxes.push({c: [st.x, soffit - 0.35, st.z], s: [w * 2 - 0.6, 0.65, 0.5], yaw, color: GIRDER});
  }
  for (const [ss, back] of [[span.s0, -1], [span.s1, 1]]) {
    const st = sampleAtStation(S, ss);
    const yaw = Math.atan2(st.tx, st.tz);
    const cw = Math.cos(yaw), sw = Math.sin(yaw);
    const dy = deckC(st);
    const g = groundAt(st.x, st.z, dy - 4);
    const w = dw(st);
    const H = Math.max(1.2, dy + 0.4 - g);
    boxes.push({c: [st.x, g + H / 2, st.z], s: [w * 2 + 2.4, H, 1.6], yaw, color: CONCRETE});
    for (const side of [-1, 1]) {
      const lx = side * (w + 1.6), lz = back * 2.4;
      boxes.push({
        c: [st.x + lx * cw + lz * sw, g + (H * 0.75) / 2, st.z - lx * sw + lz * cw],
        s: [0.6, H * 0.75, 4.4], yaw: yaw + side * back * 0.6, color: CONCRETE,
      });
    }
  }
  const bp = boxesToPart('bridge-substructure', road.id, boxes);
  if (bp) parts.push(bp);
  // Parapet: steel rail or concrete wall + steel band.
  const style = road.bridgeParapet === 'wall' ? 'wall' : 'rail';
  for (const side of [-1, 1]) {
    if (style === 'rail') {
      const offFn = (p) => side * (dw(p) + 0.30);
      const gndFn = (p) => ctx.crossY(p, ctx.baseY(p), ctx.halfRoad(p), side * (dw(p) - 0.1));
      parts.push(...buildRailRun(run, side, offFn, gndFn,
        {roadId: road.id, railName: 'bridge-rail', postName: 'bridge-posts', bury: true, onDeck: true}));
    } else {
      const ob = (p) => side * (dw(p) + 0.35);
      const ot = (p) => side * (dw(p) + 0.27);
      const ib = (p) => ob(p) - side * 0.35;
      const faces = [
        {o0: ob, y0: 0.02, o1: ot, y1: 0.85, n: side},   // outer (battered)
        {o0: ib, y0: 0.02, o1: ib, y1: 0.85, n: -side},  // inner
      ];
      for (const f of faces) {
        const rows = run.map((p) => {
          const d = deckC(p);
          const mk = (o, y) => ({x: p.x - p.tz * o, y: d + y, z: p.z + p.tx * o,
            nx: (-p.tz * f.n), ny: 0.06, nz: (p.tx * f.n),
            r: CONCRETE[0], g: CONCRETE[1], b: CONCRETE[2], u: o, v: p.s});
          return [mk(f.o0(p), f.y0), mk(f.o1(p), f.y1)];
        });
        const part = stripPart('bridge-parapet', road.id, rows);
        if (part) parts.push(part);
      }
      const rows = run.map((p) => {
        const d = deckC(p);
        const mk = (o, y) => ({x: p.x - p.tz * o, y: d + y, z: p.z + p.tx * o,
          nx: 0, ny: 1, nz: 0, r: CONCRETE[0], g: CONCRETE[1], b: CONCRETE[2], u: o, v: p.s});
        return [mk(ib(p), 0.85), mk(ot(p), 0.85)];
      });
      const cap = stripPart('bridge-parapet', road.id, rows);
      if (cap) parts.push(cap);
      const band = run.map((p) => {
        const d = deckC(p), o = ot(p) + side * 0.02;
        const mk = (y) => ({x: p.x - p.tz * o, y: d + y, z: p.z + p.tx * o,
          nx: (-p.tz * side), ny: 0, nz: (p.tx * side),
          r: RAIL_COLOR[0], g: RAIL_COLOR[1], b: RAIL_COLOR[2], u: o, v: p.s});
        return [mk(0.88), mk(1.06)];
      });
      const steel = stripPart('bridge-parapet-rail', road.id, band);
      if (steel) parts.push(steel);
    }
  }
  return parts;
}

/* ── full network assembly ── */
export function buildNetworkMesh(project, samples, topo, terrain) {
  const parts = [];
  const stats = {triangles: 0, roads: 0, junctions: 0, bridges: 0, overpasses: 0};
  const terr = typeof terrain === 'function' ? terrain : null;
  for (const road of project.roads || []) {
    if (road.visible === false) continue;
    const smp = samples.get(road.id);
    if (!smp || !smp.count) continue;
    const ctx = roadContext(road, terr);
    const runs = topo?.runs?.get(road.id) || [smp.samples];
    const railCuts = (topo?.bridges || []).filter((b) => b.roadId === road.id);
    runs.forEach((run, i) => {
      const {parts: rp, stats: rs} = buildRunParts(road, run, ctx,
        {tag: runs.length > 1 ? String(i) : '', railCuts});
      parts.push(...rp);
      stats.triangles += rs.triangles;
    });
    stats.roads++;
  }
  for (const ix of topo?.intersections || []) {
    for (const q of buildJunctionParts(ix, project, samples, terr)) {
      q.junction = ix.id;
      q.name = `junction_${safeName(ix.id)}__${q.name}`;
      parts.push(q);
      stats.triangles += q.triangles;
    }
    stats.junctions++;
  }
  for (const b of topo?.bridges || []) {
    const road = (project.roads || []).find((r) => r.id === b.roadId);
    const smp = samples.get(b.roadId);
    if (!road || !smp || road.visible === false) continue;
    for (const q of buildBridgeParts(road, smp.samples, b, terr, topo)) {
      parts.push(q);
      stats.triangles += q.triangles;
    }
    stats.bridges++;
  }
  stats.overpasses = topo?.overpasses?.length || 0;
  return {parts, stats};
}
