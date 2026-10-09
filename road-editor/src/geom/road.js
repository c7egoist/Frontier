// Road bodies between their junction throats.
//
// Each station gives a 13-column cross-section, left to right:
//   col 0..5   = slot 5..0 on the -normal side
//   col 6      = centreline
//   col 7..12  = slot 0..5 on the +normal side
// Bands are emitted as separate grids so normals stay crisp at kerbs.
//
// Structures sit on the same frames: batters where the road is near ground level,
// bridge decks (with piers and parapets) where the road is high above the ground,
// guardrails on high embankments, lane markings on the carriageway and gutter grates.

import { profileSlots, bandMaterial, carriageDy } from './profile.js';
import { batterToe } from './batter.js';

export const COLS = 13;
const CENTRE = 6;

export function stationList(s0, s1, step = 1) {
  const L = s1 - s0;
  const n = Math.max(1, Math.ceil(L / Math.max(0.1, step)));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(s0 + (L * i) / n);
  return out;
}

// Contiguous index runs where flags[i] is true: [[a, b], ...] inclusive.
export function runsOf(flags) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  return runs;
}

// Column position for a frame.
export function colPos(sl, f, col) {
  if (col === CENTRE) return [f.p[0], f.p[1], f.p[2]];
  const left = col < CENTRE;
  const k = left ? 5 - col : col - 7;
  const sign = left ? -1 : 1;
  const o = sl.slots[k].o;
  const dy = sl.slots[k].dy;
  return [f.p[0] + sign * o * f.n[0], f.p[1] + dy, f.p[2] + sign * o * f.n[1]];
}

// Parameter intervals of a dash pattern over [a, b].
export function dashIntervals(a, b, on, off) {
  const out = [];
  if (off <= 0) return [[a, b]];
  for (let s = a; s < b; s += on + off) out.push([s, Math.min(b, s + on)]);
  return out;
}

// Build one road body. Returns plan polygons and bookkeeping for inspection.
// o: { id, road, cl, s0, s1, terrain, bridgeFlags?: boolean[] per station,
//      blocked?: (x,z)=>boolean, step?, slope?, maxBatter?, embankHeight?, pierSpacing?,
//      rails?: boolean (force), noBatter?: boolean }
export function buildRoadBody(mb, o) {
  const { road, cl, s0, s1, terrain } = o;
  const out = { id: o.id, stations: [], planBands: [], marks: [], runs: { bridge: [], batter: [], rail: [] }, piers: [], warnings: [] };
  if (!(s1 - s0 > 0.05)) return out;
  const sl = profileSlots(road);
  const stations = stationList(s0, s1, o.step ?? 1);
  const nR = stations.length;
  const F = stations.map((s) => {
    const f = cl.at(s);
    return { p: f.p, n: f.n, t: f.t, s };
  });
  out.stations = stations;
  const P = new Array(nR * COLS);
  for (let r = 0; r < nR; r++) for (let c = 0; c < COLS; c++) P[r * COLS + c] = colPos(sl, F[r], c);
  const bridge = o.bridgeFlags ? stations.map((_, r) => !!o.bridgeFlags[r]) : stations.map(() => false);
  const mid = F[Math.floor(nR / 2)];
  const outerCol = (side) => (side < 0 ? 0 : COLS - 1);
  const outward = (side) => [side * mid.n[0], side * mid.n[1]];

  // 1. surface bands
  const bandSpecs = [];
  if (!sl.bands[0].empty) bandSpecs.push({ cols: [5, 6, 7], key: bandMaterial(road, 'carriage'), vertical: false, bi: 0, ditch: false });
  for (let k = 0; k < 5; k++) {
    const bi = k + 1;
    const info = sl.bands[bi];
    if (info.empty) continue;
    const key = bandMaterial(road, info.key);
    const ditch = info.key === 'ditch';
    bandSpecs.push({ cols: [4 - k, 5 - k], key, vertical: info.vertical, bi, ditch, side: -1 });
    bandSpecs.push({ cols: [7 + k, 8 + k], key, vertical: info.vertical, bi, ditch, side: 1 });
  }
  for (const spec of bandSpecs) {
    const flat = [];
    for (let r = 0; r < nR; r++) for (const c of spec.cols) flat.push(P[r * COLS + c]);
    const nC = spec.cols.length;
    let expect = [0, 1, 0];
    if (spec.vertical) {
      const [ox, oz] = outward(spec.side ?? 1);
      expect = [-ox, 0, -oz];
    }
    mb.addGrid(flat, nR, nC, {
      key: spec.key,
      uv: spec.vertical ? 'strip' : 'planar',
      expect,
      skip: spec.ditch ? (r) => bridge[r] || bridge[r + 1] : undefined,
    });
    // plan polygon (left edge forward, right edge back)
    const cA = spec.cols[0];
    const cB = spec.cols[nC - 1];
    const poly = [];
    for (let r = 0; r < nR; r++) poly.push([P[r * COLS + cA][0], P[r * COLS + cA][2]]);
    for (let r = nR - 1; r >= 0; r--) poly.push([P[r * COLS + cB][0], P[r * COLS + cB][2]]);
    out.planBands.push({ key: spec.key, bi: spec.bi, poly, ditch: spec.ditch });
  }

  // 2. batters on non-bridge runs (outer edge down to ground)
  const batterRuns = o.noBatter ? [] : runsOf(bridge.map((b) => !b));
  for (const [a, b] of batterRuns) {
    out.runs.batter.push([stations[a], stations[b]]);
    for (const side of [-1, 1]) {
      const pts = [];
      let slopeSum = 0;
      let cnt = 0;
      for (let r = a; r <= b; r++) {
        const top = colPos(sl, F[r], outerCol(side));
        const toe = batterToe(terrain, top[0], top[2], side * F[r].n[0], side * F[r].n[1], top[1], o.slope ?? 2, o.maxBatter ?? 28);
        if (toe.s > 1e-6) {
          slopeSum += (toe.y - top[1]) / toe.s;
          cnt++;
        }
        pts.push(top, [toe.x, toe.y, toe.z]);
      }
      const avg = cnt ? slopeSum / cnt : 0;
      const ex = [-avg * side * mid.n[0], 1, -avg * side * mid.n[1]];
      mb.addGrid(pts, b - a + 1, 2, { key: 'batter', uv: 'strip', expect: ex });
      // close the batter where it meets a bridge deck: triangle top-toe-deck bottom
      const deckBottom = (r) => {
        const t = colPos(sl, F[r], outerCol(side));
        return [t[0], F[r].p[1] + sl.slots[5].dy - Math.max(0.3, road.bridge?.deckThickness ?? 0.9), t[2]];
      };
      if (a > 0 && bridge[a - 1]) {
        const top = pts[0];
        const toe = pts[1];
        mb.addTriangle(top, toe, deckBottom(a), 'concrete', [0, 0, 1]);
      }
      if (b < nR - 1 && bridge[b + 1]) {
        const top = pts[pts.length - 2];
        const toe = pts[pts.length - 1];
        mb.addTriangle(top, toe, deckBottom(b), 'concrete', [0, 0, 1]);
      }
    }
  }

  // 3. bridge decks, parapets, abutments and piers
  const deckRuns = runsOf(bridge);
  const thick = Math.max(0.3, road.bridge?.deckThickness ?? 0.9);
  const parapetH = Math.max(0, road.bridge?.parapetHeight ?? 1.0);
  const pierSpacing = Math.max(6, road.bridge?.pierSpacing ?? 24);
  const pierW = Math.max(0.6, road.bridge?.pierWidth ?? 1.6);
  const toeAtRow = (r, side) => {
    const top = colPos(sl, F[r], outerCol(side));
    const toe = batterToe(terrain, top[0], top[2], side * F[r].n[0], side * F[r].n[1], top[1], o.slope ?? 2, o.maxBatter ?? 28);
    return [toe.x, toe.y, toe.z];
  };
  for (const [a, b] of deckRuns) {
    out.runs.bridge.push([stations[a], stations[b]]);
    // the deck extends one station into the embankment so its edges meet the batters
    const ra = Math.max(0, a - 1);
    const rb = Math.min(nR - 1, b + 1);
    const dyB = sl.slots[5].dy - thick;
    for (const side of [-1, 1]) {
      const top = [];
      const bottom = [];
      for (let r = ra; r <= rb; r++) {
        const t = colPos(sl, F[r], outerCol(side));
        top.push(t);
        bottom.push([t[0], F[r].p[1] + dyB, t[2]]);
      }
      const pts = [];
      for (let i = 0; i < top.length; i++) pts.push(top[i], bottom[i]);
      mb.addGrid(pts, top.length, 2, { key: 'concrete', uv: 'strip', expect: [side * mid.n[0], 0, side * mid.n[1]] });
      if (parapetH > 0) {
        // parapet: a thin wall on the true span (its ends are open, like a sheet)
        const up = [];
        for (let r = a; r <= b; r++) {
          const t = colPos(sl, F[r], outerCol(side));
          up.push(t, [t[0], t[1] + parapetH, t[2]]);
        }
        mb.addGrid(up, b - a + 1, 2, { key: 'concrete', uv: 'strip', expect: [side * mid.n[0], 0, side * mid.n[1]] });
      }
    }
    const under = [];
    for (let r = ra; r <= rb; r++) {
      const l = colPos(sl, F[r], 0);
      const rt = colPos(sl, F[r], COLS - 1);
      under.push([l[0], F[r].p[1] + dyB, l[2]], [rt[0], F[r].p[1] + dyB, rt[2]]);
    }
    mb.addGrid(under, rb - ra + 1, 2, { key: 'concrete', uv: 'planar', expect: [0, -1, 0] });
    // abutment walls close the deck ends where they meet the embankment
    const wall = (r, dir) => {
      const lb = [colPos(sl, F[r], 0)[0], F[r].p[1] + dyB, colPos(sl, F[r], 0)[2]];
      const rb2 = [colPos(sl, F[r], COLS - 1)[0], F[r].p[1] + dyB, colPos(sl, F[r], COLS - 1)[2]];
      const lt = toeAtRow(r, -1);
      const rt2 = toeAtRow(r, 1);
      mb.addGrid([lb, rb2, lt, rt2], 2, 2, { key: 'concrete', uv: 'strip', expect: [dir * F[r].t[0], 0, dir * F[r].t[1]] });
    };
    if (ra < a) wall(ra, -1);
    if (rb > b) wall(rb, 1);
    // piers at span start, at the spacing, and at span end
    const sA = stations[a];
    const sB = stations[b];
    const ps = [sA];
    for (let s = sA + pierSpacing; s < sB - 1; s += pierSpacing) ps.push(s);
    ps.push(sB);
    for (const s of ps) {
      const f = cl.at(s);
      const x = f.p[0];
      const z = f.p[2];
      const top = f.p[1] + dyB;
      const ground = terrain.height(x, z);
      if (top - ground < 0.5) continue;
      if (o.blocked && o.blocked(x, z)) continue; // inside another road's footprint
      out.piers.push({ x, y0: ground, y1: top, s });
      addBox(mb, 'concrete', x, z, f.n, ground, top, pierW, 1.6);
    }
  }

  // 4. guardrails on high embankments
  if (o.rails !== false && road.guardrail?.mode !== 'off') {
    const thr = road.guardrail?.embankHeight ?? 2.0;
    const forced = road.guardrail?.mode === 'on';
    const flags = stations.map((s, r) => {
      if (bridge[r]) return false;
      if (forced) return true;
      const top = colPos(sl, F[r], COLS - 1);
      const g = terrain.height(top[0], top[2]);
      return top[1] - g >= thr;
    });
    for (const side of [-1, 1]) {
      for (const [a, b] of runsOf(flags)) {
        out.runs.rail.push([stations[a], stations[b]]);
        const outerTop = (r) => colPos(sl, F[r], outerCol(side));
        const rail = [];
        for (let r = a; r <= b; r++) {
          const t = outerTop(r);
          const off = [side * 0.2 * F[r].n[0], side * 0.2 * F[r].n[1]];
          rail.push([t[0] + off[0], t[1] + 0.45, t[2] + off[1]], [t[0] + off[0], t[1] + 0.8, t[2] + off[1]]);
        }
        mb.addGrid(rail, b - a + 1, 2, { key: 'steel', uv: 'strip', expect: [side * mid.n[0], 0, side * mid.n[1]] });
        // posts every 2 m
        const sA = stations[a];
        const sB = stations[b];
        for (let s = sA; s <= sB + 1e-6; s += 2) {
          const f = cl.at(Math.min(s, sB));
          const pos = colPos(sl, f, outerCol(side));
          const ox = side * 0.2 * f.n[0];
          const oz = side * 0.2 * f.n[1];
          const pts = [
            [pos[0] + ox, pos[1] + 0.05, pos[2] + oz],
            [pos[0] + ox + 0.12 * f.n[0], pos[1] + 0.05, pos[2] + oz + 0.12 * f.n[1]],
            [pos[0] + ox, pos[1] + 0.85, pos[2] + oz],
            [pos[0] + ox + 0.12 * f.n[0], pos[1] + 0.85, pos[2] + oz + 0.12 * f.n[1]],
          ];
          mb.addGrid(pts, 2, 2, { key: 'steel', uv: 'strip', expect: [side * f.n[0], 0, side * f.n[1]] });
        }
      }
    }
  }

  // 5. carriageway markings (decals just above the surface)
  const mk = road.markings || {};
  const lw = 0.12;
  const marks = [];
  const halfW = sl.carriageHalf;
  const fullL = s0;
  const ribbon = (u, width, s0r, s1r, on, off, key) => {
    const intervals = on > 0 ? dashIntervals(s0r, s1r, on, off) : [[s0r, s1r]];
    for (const [a, b] of intervals) {
      const n = Math.max(1, Math.ceil((b - a) / 0.5));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const s = a + ((b - a) * i) / n;
        const f = cl.at(s);
        const cd = carriageDy(sl, u) + 0.014;
        const cx = f.p[0] + u * f.n[0];
        const cz = f.p[2] + u * f.n[1];
        const cy = f.p[1] + cd;
        pts.push([cx - (width / 2) * f.n[0], cy, cz - (width / 2) * f.n[1]], [cx + (width / 2) * f.n[0], cy, cz + (width / 2) * f.n[1]]);
      }
      mb.addGrid(pts, n + 1, 2, { key, uv: 'planar', expect: [0, 1, 0] });
      marks.push({ key, u, a, b });
    }
  };
  if (mk.centre && mk.centre !== 'none' && !road.oneWay) {
    ribbon(0, lw, fullL, s1, mk.centre === 'solid' ? 0 : 3, mk.centre === 'solid' ? 0 : 9, 'paint-yellow');
  }
  if (mk.edges) {
    ribbon(halfW - 0.2, lw, fullL, s1, 0, 0, 'paint-white');
    ribbon(-(halfW - 0.2), lw, fullL, s1, 0, 0, 'paint-white');
  }
  if (mk.laneLines && sl.lanes > 1) {
    // lane lines k = 1..lanes-1 are symmetric about the centre; draw each once
    for (let k = 1; k < sl.lanes; k++) {
      const u = -sl.carriageHalf + sl.shoulder + k * sl.laneWidth;
      if (Math.abs(u) < 0.2) continue;
      ribbon(u, lw, fullL, s1, 3, 9, 'paint-white');
    }
  }
  out.marks = marks;

  // 6. gutter grates at the inlet spacing (kerbed roads with curbs drainage)
  const drain = road.drainage || {};
  if (sl.curbOn && drain.mode !== 'none' && sl.gutterW > 0) {
    const spacing = Math.max(5, drain.inletSpacing ?? 25);
    for (let s = s0 + spacing / 2; s < s1 - 1; s += spacing) {
      for (const side of [-1, 1]) {
        const pts = [];
        for (const ds of [-0.35, 0.35]) {
          const f = cl.at(Math.min(s1, Math.max(s0, s + ds)));
          const a = colPos(sl, f, side < 0 ? 5 : 7);
          const b = colPos(sl, f, side < 0 ? 4 : 8);
          const y = (a[1] + b[1]) / 2 + 0.01;
          pts.push([a[0], y, a[2]], [b[0], y, b[2]]);
        }
        mb.addGrid(pts, 2, 2, { key: 'grate', uv: 'planar', expect: [0, 1, 0] });
      }
    }
  }
  return out;
}

// Axis-aligned (in road frame) box for piers.
export function addBox(mb, key, x, z, n, y0, y1, width, length) {
  const hw = width / 2;
  const hl = length / 2;
  const corners = [
    [-hw, -hl],
    [hw, -hl],
    [hw, hl],
    [-hw, hl],
  ].map(([a, b]) => [x + a * n[0] + b * (-n[1]), z + a * n[1] + b * n[0]]);
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % 4];
    const pts = [
      [p[0], y0, p[1]],
      [q[0], y0, q[1]],
      [p[0], y1, p[1]],
      [q[0], y1, q[1]],
    ];
    mb.addGrid(pts, 2, 2, { key, uv: 'strip' });
  }
}
