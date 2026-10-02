// ===================================================================================================================
//  quadmesh — curvilinear all-quad mesher for a compiled tread pattern
//
//  One pitch of the tread = a REGULAR grid: M lateral rows × K circumferential columns, periodic in u.
//    · column i is a feature boundary trajectory u = f(x), evaluated exactly at every row it spans
//    · row j is a lateral boundary curve x = g(u), resolved against the columns by a fixed point
//  Every band spans the same K columns, so cell [b][i] always touches [b][i±1] and [b±1][i]: two neighbours can
//  never disagree about an edge. The grid is conforming by construction and every face is a quad by construction,
//  while an outline is still traced exactly — its edges ARE the grid lines. Rank 0 of every row is the seam
//  column, so a tile is a clean strip whose left loop IS the next tile's right loop: the circular array needs no
//  bridging, the pitch seam is exact by construction.
//
//  A cell carries a level (block top / relief ledge / sipe / groove floor / scribe). Where adjacent cells differ
//  the shared edge emits a drafted wall with a top chamfer ring, so the band is one continuous surface and
//  overlapping elements union for free — the union is decided per cell, never by a boolean.
// ===================================================================================================================
import { TAU, clamp, wrap01, levels, waveAt, carcass, compile, depthFrac } from './quadcore.mjs';

// ===================================================================================================================
//  GRID — one tile of the pattern in the developed frame (u, x), before the crown and the chevron are applied
// ===================================================================================================================
export function buildGrid(T, D) {
  const C = compile(T, D);
  const LV = levels(T);
  let xs = C.xs.slice();
  const src = C.rows.map(r => ({ x: r.x, wig: r.wig }));

  // shoulder skirt: plain rubber running off the edge, on the same K columns, so the rim stays a clean loop
  // Every feature must end one row *inside* the grid, otherwise a level region runs off the edge of the domain
  // and its wall strip cannot close. The skirt does that and gives the shoulder rubber to run off with, so the
  // rim stays a single clean loop; even with the skirt switched off a token margin row is kept on each side.
  const skirtLen = Math.max(0.6, T.skirt ? Math.max(0, T.skirtLen) : 0);
  if (skirtLen > 0.05) {
    const n = Math.max(1, Math.round(skirtLen / Math.max(1, T.xsub)));
    const pre = [], post = [];
    for (let i = 1; i <= n; i++) post.push(xs[xs.length - 1] + (skirtLen * i) / n);
    for (let i = n; i >= 1; i--) pre.push(xs[0] - (skirtLen * i) / n);
    xs = [...pre, ...xs, ...post];
  }
  const cols = [...C.globals, ...C.cols];
  const K = cols.length;
  const pitch = C.G.pitch;
  const seamAt = cols.findIndex(c => c.kind === 'seam');
  const isSeam = cols.map((c, i) => i === seamAt);
  const domLo = -C.xMaxL, domHi = C.xMaxR;

  const wigFor = x => {
    for (const r of src) if (r.wig && Math.abs(r.x - x) < 1e-3) return r.wig;
    for (const r of src) if (r.wig && Math.abs(-r.x - x) < 1e-3) return { ...r.wig, sgn: -r.wig.sgn, phAdj: -(r.wig.phAdj || 0) };
    return null;
  };

  // ---- rows, refined until every band has the same column order at both of its rows ------------------------------
  // Every column is evaluated at every row (clamped to the x-range of the feature that owns it), and the row's
  // nodes are sorted: so the node SET of a row is shared by the two bands that meet there and they can never
  // disagree about a vertex. Where the ORDER of two rows differs, two features were about to pass each other
  // inside that band — a single quad would twist — so that band is split by inserting a row at its middle, and
  // the sweep repeats. After refinement the rank→column map is identical at both ends of every band, so
  // neighbour matching by rank is exact, every face is a planar-enough quad, and nothing inverts.
  // A minimum separation between columns, so two feature edges that meet do not fold a cell down to zero width.
  const gap = Math.max(0.02, T.ugap) / pitch;
  let rowsWork = xs.slice();
  let uu = [], xx = [], ordOf = [], cells = [], isMir = [], collisions = 0, refinePasses = 0;

  // one sweep of every row: each column is evaluated at that row, the serration fixed point is solved for the
  // wiggle the row carries, and the row is then sorted and spaced so no cell can fold inside out
  const sweep = () => {
    uu = []; xx = []; ordOf = [];
    for (let j = 0; j < rowsWork.length; j++) {
      const x0 = rowsWork[j], wig = wigFor(x0);
      const raw = [];
      for (let i = 0; i < K; i++) {
        let x = x0, u = cols[i].evalAt(x);
        if (wig && wig.a) for (let it = 0; it < 4; it++) { x = x0 + wig.sgn * waveAt(wig, wrap01(u + (wig.phAdj || 0))); u = cols[i].evalAt(x); }
        raw.push({ i, u: isSeam[i] ? 0 : wrap01(u), x });
      }
      raw.sort((a, b) => (a.u - b.u) || (isSeam[a.i] ? -1 : isSeam[b.i] ? 1 : 0) || (a.i - b.i));
      raw[0].u = 0;
      for (let i = 1; i < K; i++) if (raw[i].u < raw[i - 1].u + gap) raw[i].u = raw[i - 1].u + gap;
      if (raw[K - 1].u > 1 - gap * 0.5) {
        for (let i = K - 2; i >= 1; i--) { if (raw[i + 1].u - raw[i].u < gap) raw[i].u = raw[i + 1].u - gap; else break; }
        for (let i = 1; i < K; i++) raw[i].u = Math.max(raw[i].u, i * gap);
      }
      uu.push(raw.map(r => r.u)); xx.push(raw.map(r => r.x)); ordOf.push(raw.map(r => r.i));
    }
  };
  const centreOf = (b, i) => {
    const cq = (i + 1) % K, up = cq === 0 ? 1 : 0;
    return { u: (uu[b][i] + uu[b][cq] + up) / 2, x: (xx[b][i] + xx[b][cq] + xx[b + 1][i] + xx[b + 1][cq]) / 4 };
  };
  const ownerOf = x => C.pieces.find(p => x >= Math.min(p.xa, p.xb) - 1e-7 && x <= Math.max(p.xa, p.xb) + 1e-7) || null;
  // the level of every cell of every band: the deepest feature that contains the cell's centre, with the lane
  // floor as the base and tie bars as an override
  const evalCells = () => {
    cells = []; isMir = [];
    for (let b = 0; b + 1 < rowsWork.length; b++) {
      const xm = (rowsWork[b] + rowsWork[b + 1]) / 2;
      const owner = (xm > domLo - 1e-6 && xm < domHi + 1e-6) ? ownerOf(xm) : null;
      const base = owner ? (owner.lane.base || (owner.lane.kind === 'groove' ? 'floor' : 'top')) : 'top';
      const act = owner ? C.cuts.filter(c => c.piece === owner && c.x0 <= rowsWork[b + 1] + 1e-7 && c.x1 >= rowsWork[b] - 1e-7) : [];
      const ev = act.map(c => [c.uL(xm), c.uR(xm), c.level, depthFrac(c.level), c.over || 0]);
      const row = new Array(K);
      for (let i = 0; i < K; i++) {
        const cq = (i + 1) % K;
        const mid = wrap01((uu[b][i] + uu[b][cq] + (cq === 0 ? 1 : 0)) / 2);
        let level = base, best = depthFrac(base);
        for (const [l0, l1, name, dep] of ev) {
          if (wrap01(mid - l0) <= wrap01(l1 - l0) + 1e-12 && dep > best) { best = dep; level = name; }
        }
        for (const [l0, l1, name, dep, ov] of ev) {
          if (ov && wrap01(mid - l0) <= wrap01(l1 - l0) + 1e-12) { level = name; break; }
        }
        row[i] = level;
      }
      cells.push(row);
      isMir.push(owner ? owner.tag === 'M' : false);
    }
  };

  // Where a wall has to be emitted across a row, rank i of the row below and rank i of the row above must name the
  // same column pair — otherwise the wall would follow one trajectory along its top edge and another along its
  // bottom, and would not line up with either skin. That is the only case worth splitting a band for, and it also
  // catches the diagonal contact between two levels, which would pinch the surface at a single vertex. Splitting
  // everything else would double the rows for no geometric gain.
  const rowCap = Math.max(rowsWork.length * 2.2, rowsWork.length + 48);
  sweep(); evalCells();
  let splits = 0;
  for (let pass = 0; pass < 8; pass++) {
    const ins = [];
    collisions = 0;
    for (let b = 0; b + 1 < cells.length; b++) {
      const A = cells[b], Bs = cells[b + 1], o = ordOf[b], o2 = ordOf[b + 1];
      if (rowsWork[b + 1] - rowsWork[b] < 0.25) continue;
      let need = -1;
      for (let i = 0; i < K; i++) {
        const iq = (i + 1) % K;
        if (A[i] !== Bs[i] && (o[i] !== o2[i] || o[iq] !== o2[iq])) { need = 1; break; }
        if (A[i] !== A[iq] && A[i] === Bs[iq] && A[iq] === Bs[i] && Bs[i] !== Bs[iq]) { need = 1; break; }
      }
      if (need > 0) { collisions++; if (rowsWork.length + ins.length < rowCap) ins.push((rowsWork[b] + rowsWork[b + 1]) / 2); }
    }
    refinePasses = pass;
    splits += collisions;
    if (!ins.length) break;
    rowsWork = [...rowsWork, ...ins].sort((a, b) => a - b);
    sweep(); evalCells();
  }
  const M = rowsWork.length;
  xs = rowsWork;
  const order = uu.map((_, j) => uu[j].map((_, i) => i));

  // A transversal crossing can still leave two levels touching at one node (the grid cannot resolve every crossing,
  // and a level field cannot be made monotone around a point). Repainting the smallest cell of such a 2x2 turns the
  // touch into an ordinary one-cell step: sub-millimetre here, because the rows around a crossing are already fine.
  // ---- the marching-cubes ambiguity ------------------------------------------------------------------------------
  // Two feature boundaries crossing transversally can leave the same pair of levels touching at a single node: a
  // pinch, where the surface closes but the fan around that vertex is not a disk. Repainting the smallest cell of
  // such a 2x2 turns the touch into an ordinary one-cell step. The refinement above has already shrunk the rows
  // there, so the snap is sub-millimetre and the silhouette is untouched.
  let pinchFix = 0;
  const frozen = cells.map(row => new Uint8Array(K));   // a repaired 2x2 stays put, so the pass cannot oscillate
  const areaOf = (b, i) => {
    const i2 = (i + 1) % K;
    const w = wrap01(uu[b][i2] - uu[b][i]) * pitch;
    const h = Math.abs(xs[Math.min(b + 1, M - 1)] - xs[b]);
    return w * h;
  };
  for (let pass = 0; pass < 14; pass++) {
    let n = 0;
    for (let b = 0; b + 1 < cells.length; b++) {
      for (let i = 0; i < K; i++) {
        const i2 = (i + 1) % K;
        const bl = cells[b][i], br = cells[b][i2], tl = cells[b + 1][i], tr = cells[b + 1][i2];
        if (!(bl === tr && br === tl && bl !== br)) continue;
        const id = [[b, i], [b, i2], [b + 1, i], [b + 1, i2]];
        const free = id.map((c2, k) => ({ c: c2, k })).filter(o2 => !frozen[o2.c[0]][o2.c[1]]);
        if (!free.length) continue;
        free.sort((p, q) => areaOf(p.c[0], p.c[1]) - areaOf(q.c[0], q.c[1]));
        const mi = free[0].k;
        const was = cells[id[mi][0]][id[mi][1]];
        const nb = [[b, mi === 0 || mi === 1 ? i2 : i], [b, mi === 0 || mi === 1 ? i : i2]];
        const keep = cells[nb[0][0]][nb[0][1]], keep2 = cells[nb[1][0]][nb[1][1]];
        const pick = areaOf(nb[0][0], nb[0][1]) >= areaOf(nb[1][0], nb[1][1]) ? keep : keep2;
        cells[id[mi][0]][id[mi][1]] = pick;
        frozen[id[mi][0]][id[mi][1]] = 1;      // only the cell that moved is off limits again, so a chain of
        n++;                                   // diagonal contacts can be unwound one step at a time
      }
    }
    pinchFix += n;
    if (!n) break;
  }

  // ---- the vertical chain: every node carries one ring per level, in depth order -------------------------------
  // A wall is not one quad from the shallow skin down to the deep one — it follows the chain of levels between
  // them. The chain is the same at both ends of every wall, so strips that turn a corner or meet a third level
  // still close, and a level that reaches a node only on one side keeps its ring pinned to the surface there.
  // Elsewhere that ring is interpolated along the chain, which is what lets a sipe fade out at a block edge
  // instead of tearing the wall.
  const usedLv = ['top'];
  for (const row of cells) for (const l of row) if (!usedLv.includes(l)) usedLv.push(l);
  const lvIdx = {}; usedLv.forEach((l, n) => { lvIdx[l] = n; });
  const chain0 = usedLv.map(l => ({ lvl: l, name: l, depth: LV[l].depth, inset: LV[l].inset || 0 })).sort((a, b) => a.depth - b.depth);
  const alias = {};
  const chain = [];
  for (const c of chain0) {
    const prev = chain[chain.length - 1];
    if (prev && c.depth - prev.depth < 1e-4) { alias[c.lvl] = prev.lvl; continue; }   // same depth = same terrace
    chain.push(c);
  }
  for (const k2 in alias) for (const row of cells) for (let i = 0; i < K; i++) if (row[i] === k2) row[i] = alias[k2];
  if (T.bevel > 0.01) {
    const ti = chain.findIndex(c => c.lvl === 'top' && c.inset > 0.001);
    if (ti >= 0) chain.splice(ti + 1, 0, { lvl: 'top', name: 'cham', depth: chain[ti].depth + T.bevel, inset: 0, cham: true });
  }
  const NC = chain.length, kOf = {};
  chain.forEach((c, k) => { if (!(c.lvl in kOf)) kOf[c.lvl] = k; });

  // A node moves toward the centre of the cells that share its level; interior nodes cancel themselves out, so
  // only outline nodes move. That is the whole trick behind a drafted wall with no extra bookkeeping.
  const acc = []; for (let j = 0; j < M; j++) acc.push(new Map());
  const pres = []; for (let j = 0; j < M; j++) pres.push(new Int32Array(K));
  for (let b = 0; b < cells.length; b++) {
    for (let i = 0; i < K; i++) {
      const lv = cells[b][i], cc = centreOf(b, i), cq = (i + 1) % K, bit = 1 << lvIdx[lv];
      const put = (j, i2) => {
        pres[j][i2] |= bit;
        let dum = (cc.u - uu[j][i2]) * pitch;
        const dx = cc.x - xx[j][i2];
        while (dum > 0.5 * pitch) dum -= pitch;
        while (dum < -0.5 * pitch) dum += pitch;
        const len = Math.hypot(dum, dx);
        if (len < 1e-9) return;
        const key = i2 + '|' + lv, m = acc[j];
        const e = m.get(key) || { du: 0, dx: 0 };
        e.du += dum / len; e.dx += dx / len;
        m.set(key, e);
      };
      put(b, i); put(b + 1, i); put(b, cq); put(b + 1, cq);
    }
  }
  const duOf = new Float64Array(M * K * NC), dxOf = new Float64Array(M * K * NC);
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < K; i++) {
      const n = (j * K + i) * NC, pts = [], p = pres[j][i];
      for (let k = 0; k < NC; k++) {
        const c = chain[k];
        if (!((p >> lvIdx[c.lvl]) & 1)) continue;
        let du = 0, dx = 0;
        if (c.inset > 0) {
          const e = acc[j].get(i + '|' + c.lvl);
          if (e) { const len = Math.hypot(e.du, e.dx); if (len > 1e-6) { du = (e.du / len) * (c.inset / pitch); dx = (e.dx / len) * c.inset; } }
        }
        pts.push({ k, du, dx, depth: c.depth });
      }
      for (let k = 0; k < NC; k++) {
        const hit = pts.find(q => q.k === k);
        if (hit) { duOf[n + k] = hit.du; dxOf[n + k] = hit.dx; continue; }
        if (!pts.length) continue;
        const d = chain[k].depth;
        let lo = null, hi = null;
        for (const q of pts) {
          if (q.depth <= d && (!lo || q.depth > lo.depth)) lo = q;
          if (q.depth >= d && (!hi || q.depth < hi.depth)) hi = q;
        }
        const a0 = lo || hi, a1 = hi || lo;
        const f = (lo && hi && hi.depth - lo.depth > 1e-9) ? (d - lo.depth) / (hi.depth - lo.depth) : 0;
        duOf[n + k] = a0.du + (a1.du - a0.du) * f;
        dxOf[n + k] = a0.dx + (a1.dx - a0.dx) * f;
      }
    }
  }
  const ringId = new Map(), ringList = [];
  const ring = (j, i, k) => {
    const key = j + '|' + i + '|' + k;
    let id = ringId.get(key);
    if (id !== undefined) return id;
    const n = j * K + i;
    id = ringList.length; ringId.set(key, id);
    ringList.push({ u: uu[j][i] + duOf[n + k], x: xx[j][i] + dxOf[n + k], depth: chain[k].depth, lvl: chain[k].lvl, name: chain[k].name, k, j, i });
    return id;
  };
  const capId = new Map();
  const capRing = (j, i) => {
    const key = j + '|' + i;
    let id = capId.get(key);
    if (id !== undefined) return id;
    id = ringList.length; capId.set(key, id);
    ringList.push({ u: uu[j][i], x: xx[j][i], depth: T.depth + T.skin, lvl: 'cap', name: 'cap', j, i });
    return id;
  };

  // ---- the trace itself, as polylines through the nodes each feature edge owns ----------------------------------
  const outline = [];
  for (let ci = 0; ci < cols.length; ci++) {
    const c = cols[ci];
    if (c.kind !== 'feat') continue;
    let seg = [];
    for (let j = 0; j < M; j++) {
      const inside = c.x0 - 1e-6 <= xs[j] && xs[j] <= c.x1 + 1e-6;
      const i = inside ? ordOf[j].indexOf(ci) : -1;
      if (i < 0) { if (seg.length > 1) outline.push(seg); seg = []; continue; }
      seg.push([uu[j][i], xx[j][i]]);
    }
    if (seg.length > 1) outline.push(seg);
  }
  return { C, T, LV, xs, M, K, cols, order, uu, xx, ordOf, cells, isMir, ring, capRing, ringList, chain, kOf, collisions, refinePasses, splits, pinchFix, pitch, outline, skirtLen, domLo, domHi };
}

// ===================================================================================================================
//  MAPPER — (u, x, depth) → mm on the tyre.
//  The lateral axis follows the developed meridian of the crown profile, and a level's depth is measured along
//  the profile normal, so a groove floor curves with the crown instead of flattening out. The chevron drift lives
//  here rather than in the trace: in the frame a pitch is a straight strip, on the tyre it is a slanted one.
// ===================================================================================================================
export function makeMapper(T, drift, pitchSeq) {
  const G = carcass(T);
  const dr = drift || (() => 0);
  const halfW = G.halfW, shLen = Math.max(1e-6, T.shoulderLen);
  const over = (T.skirt ? Math.max(0, T.skirtLen) : 0) + 6;
  const rOf = x => {
    const a = Math.abs(x);
    let r = G.R - T.crown * Math.pow(clamp(a / Math.max(1e-6, halfW), 0, 1), 2);
    if (a > halfW) {
      const q = clamp((a - halfW) / shLen, 0, 1);
      r -= T.shoulderDrop * (0.3 * q + 0.7 * q * q);
      if (a > halfW + shLen) r -= (a - halfW - shLen) * 1.2;
    }
    return r;
  };
  const span = halfW + shLen + over, N = 900, h = span / N;
  const arc = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) {
    const drr = (rOf(i * h) - rOf((i - 1) * h)) / h;
    arc[i] = arc[i - 1] + Math.hypot(h, drr * h);
  }
  const arcAt = x => {
    const a = clamp(Math.abs(x), 0, N * h), i = Math.min(N - 1, Math.floor(a / h)), t = a / h - i;
    return (arc[i] + (arc[i + 1] - arc[i]) * t) * (x < 0 ? -1 : 1);
  };
  const nrm = x => {
    const dv = 2e-3, d = (rOf(x + dv) - rOf(x - dv)) / (2 * dv), inv = 1 / Math.hypot(1, d);
    return [inv, -d * inv];
  };
  const tiles = Math.max(1, T.pitches), P = G.pitch;
  // Variable pitch: a repeating sequence of relative pitch lengths. Only the ANGLES are stretched, the tile is
  // still one row of the same grid, so the topology and the seam bridging are untouched — which is exactly how a
  // real tread trades even spacing for a spread-out hum instead of a single loud note.
  const seq = (pitchSeq && pitchSeq.length > 1) ? pitchSeq.filter(v => v > 0) : null;
  let cw = null, total = tiles;
  if (seq) {
    cw = new Float64Array(tiles + 1);
    for (let t = 0; t < tiles; t++) cw[t + 1] = cw[t] + seq[t % seq.length];
    total = cw[tiles];
  }
  const angFrac = v => {
    if (!seq) return v / tiles;
    const t = Math.max(0, Math.min(tiles - 1, Math.floor(v))), fr = clamp(v - t, 0, 1);
    return (cw[t] + fr * seq[t % seq.length]) / total;
  };
  const stretch = seq ? total / tiles : 1;
  return {
    G, P, tiles, rOf, arcAt, nrm, stretch, seq,
    pitchOf: t => P * (seq ? seq[t % seq.length] : 1),
    curved(uAbs, x, depth) {
      const th = TAU * (angFrac(uAbs) + dr(x) / tiles), n = nrm(x);
      const r = rOf(x) - depth * n[0];
      return [r * Math.cos(th), r * Math.sin(th), arcAt(x) - depth * n[1]];
    },
    flat(uAbs, x, depth) { return [(uAbs + dr(x)) * P, x, -depth]; },
    outCurved(x) { const n = nrm(x); return [n[0], 0, n[1]]; },
  };
}

// ===================================================================================================================
//  MESH
// ===================================================================================================================
export function buildTread(T, D, opt = {}) {
  const stage = opt.stage ?? 4;
  const flat = stage <= 2;                                  // stages 1-2: the developed tile, drawn flat
  const tiles = stage >= 4 ? Math.max(1, T.pitches) : 1;    // stage 3: one tile, already on the crown
  const onlyAuthored = stage === 1;                          // step 1: the single element, before it is mirrored
  const grid = buildGrid(T, D);
  const LV = grid.LV, M = grid.M, K = grid.K, cells = grid.cells;
  const map = makeMapper(T, grid.C.shearAt, D.pitchSeq);
  const place = (uAbs, x, depth) => (flat ? map.flat(uAbs, x, depth) : map.curved(uAbs, x, depth));
  const outRef = x => (flat ? [0, 0, 1] : map.outCurved(x));
  const rimRef = side => (flat ? [0, -side, 0] : [0, 0, side]);

  // ---------------------------------------------------------------- faces --------------------------------------
  // A corner is (ring, tile copy): the seam column of tile t is literally the same ring one copy along, which is
  // why the array cannot come apart at a pitch boundary.
  const F = [];
  const quad = (c, role, set, mir, ref, tile) => F.push({ c, role, set, mir, ref, tile });
  const RL = grid.ringList;
  const posOf = (r, t) => { const R = RL[r]; return R ? place(R.u + t, R.x, R.depth) : [0, 0, 0]; };
  const avg = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const cellCentre = (b, i) => {
    const cq = (i + 1) % K, up = cq === 0 ? 1 : 0;
    return {
      u: (grid.uu[b][i] + grid.uu[b][cq] + up) / 2,
      x: (grid.xx[b][i] + grid.xx[b][cq] + grid.xx[b + 1][i] + grid.xx[b + 1][cq]) / 4, up,
    };
  };
  // A wall steps down the chain of levels between the two cells, one quad per step, so the bevel land, the wall
  // below it and any level that only reaches one end of the run all share the same vertices. Winding is not decided
  // here: propagation from the skin faces does that, which is the only way two strips meeting at a corner agree.
  // Two rules can reach the same edge — the wall between horizontally adjacent cells and the wall between
  // vertically adjacent ones meet on the same node pair wherever two levels touch diagonally. The first one there
  // already closes the surface, so the second is dropped instead of doubling up into a non-manifold edge.
  const wallSeen = new Set();
  const NODEKEY = 16777216;
  const wall = (t, j1, i1, j2, i2, sh, dp) => {
    const kS = grid.kOf[sh], kD = grid.kOf[dp];
    if (t !== 0) wallSeen.clear();
    for (let k = kS; k < kD; k++) {
      const n1 = j1 * K + i1, n2 = j2 * K + i2;
      const wk = (Math.min(n1, n2) * NODEKEY + Math.max(n1, n2)) * 8 + k;
      if (wallSeen.has(wk)) continue;
      wallSeen.add(wk);
      const a = grid.ring(j1, i1, k), b = grid.ring(j2, i2, k);
      const c = grid.ring(j2, i2, k + 1), d2 = grid.ring(j1, i1, k + 1);
      quad([[a, t], [b, t], [c, t], [d2, t]], grid.chain[k].name === 'cham' ? 'chamfer' : 'wall', 2, 0, null, t);
    }
  };

  let perTile = 0;
  for (let t = 0; t < tiles; t++) {
    for (let b = 0; b < cells.length; b++) {
      if (onlyAuthored && grid.isMir[b]) continue;
      const row = cells[b], mir = grid.isMir[b] ? 1 : 0;
      for (let i = 0; i < K; i++) {
        const cq = (i + 1) % K, d = cq === 0 ? 1 : 0;
        const lvl = row[i];
        const kk = grid.kOf[lvl];
        const r1 = grid.ring(b, i, kk), r2 = grid.ring(b, cq, kk);
        const r3 = grid.ring(b + 1, cq, kk), r4 = grid.ring(b + 1, i, kk);
        const cc = cellCentre(b, i);
        quad([[r1, t], [r2, t + d], [r3, t + d], [r4, t]], 'skin', lvl === 'top' ? 0 : 1, mir, outRef(cc.x), t);
        const lR = row[cq];
        if (lR !== lvl) {
          const shallowIsL = LV[lvl].depth <= LV[lR].depth;
          wall(t + d, b, cq, b + 1, cq, shallowIsL ? lvl : lR, shallowIsL ? lR : lvl);
        }
        if (b + 1 < cells.length) {
          const lU = cells[b + 1][i];
          if (lU !== lvl) {
            const shallowIsL = LV[lvl].depth <= LV[lU].depth;
            wall(t + d, b + 1, i, b + 1, cq, shallowIsL ? lvl : lU, shallowIsL ? lU : lvl);
          }
        }
      }
      }

      // ---- rims + inner land: closes the band into a watertight quad tube --------------------------------------
    // The outer rows of a tread are a boundary, not a wall: this drops each rim loop down onto the carcass and
    // lands it, so the whole pitch is a sealed tube of quads and the array has no open seam left anywhere.
    if (T.cap) {
      for (const side of [-1, 1]) {
        const j = side < 0 ? 0 : M - 1, b = side < 0 ? 0 : cells.length - 1;
        for (let i = 0; i < K; i++) {
          const cq = (i + 1) % K, d = cq === 0 ? 1 : 0, lvl = cells[b][i];
          if (onlyAuthored && grid.isMir[b]) continue;
          const a1 = grid.ring(j, i, grid.kOf[lvl]), a2 = grid.ring(j, cq, grid.kOf[lvl]);
          const c1 = grid.capRing(j, i), c2 = grid.capRing(j, cq);
          quad([[a1, t], [a2, t + d], [c2, t + d], [c1, t]], 'rimwall', 3, 0, rimRef(side), t);
        }
      }
      for (let b = 0; b < M - 1; b++) {
        if (onlyAuthored && grid.isMir[b]) continue;
        for (let i = 0; i < K; i++) {
          const cq = (i + 1) % K, d = cq === 0 ? 1 : 0;
          const c1 = grid.capRing(b, i), c2 = grid.capRing(b, cq), c3 = grid.capRing(b + 1, cq), c4 = grid.capRing(b + 1, i);
          quad([[c1, t], [c2, t + d], [c3, t + d], [c4, t]], 'cap', 3, 0, null, t);
        }
      }
    }
    if (t === 0) perTile = F.length;      // one period of the ring, seam walls included
  }

  // ---------------------------------------------------------------- geometry -----------------------------------
  const nRings = RL.length;
  const copies = tiles + 1;
  const pos = new Float64Array(copies * nRings * 3);
  for (let t = 0; t < copies; t++) {
    for (let r = 0; r < nRings; r++) {
      const R = RL[r], p = place(R.u + t, R.x, R.depth), o = (t * nRings + r) * 3;
      pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
    }
  }
  const VI = (r, t) => t * nRings + r;

  // weld coincident copies (the array seam), orient every face against its own reference direction
  const weld = new Map(); const wp = []; const Q = 2e4;
  const weldOf = new Int32Array(copies * nRings);
  for (let v = 0; v < copies * nRings; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const key = Math.round(x * Q) + '_' + Math.round(y * Q) + '_' + Math.round(z * Q);
    let w = weld.get(key);
    if (w === undefined) { w = wp.length / 3; weld.set(key, w); wp.push(x, y, z); }
    weldOf[v] = w;
  }
  const nFace = F.length;
  // Orientation and topology checks run on ONE PERIOD of the array. Every other copy is the same ring of faces
  // shifted around the tyre, and the seam wall that closes tile t is emitted while walking tile t, so the first
  // `perTile` faces are a complete, closed surface on their own: no hashing, no dedupe, no 48-fold memory.
  const KEY = 100000000;
  const ek = (a, b) => (a < b ? a * KEY + b : b * KEY + a);
  const ringC = f => F[f].c.map(c2 => c2[0]);
  const weldC = f => F[f].c.map(c2 => weldOf[VI(c2[0], c2[1])]);
  const faceV = new Array(perTile);
  for (let u = 0; u < perTile; u++) faceV[u] = ringC(u);
  const byEdge = new Map();
  for (let u = 0; u < perTile; u++) {
    const p = faceV[u];
    for (let k = 0; k < 4; k++) {
      const a = p[k], b = p[(k + 1) % 4];
      if (a === b) continue;
      const key = ek(a, b);
      const e = byEdge.get(key);
      if (e) e.push(u); else byEdge.set(key, [u]);
    }
  }
  const trav = (p, rev, lo, hi) => {          // +1 low->high, -1 high->low, 0 absent
    const q = rev ? [p[0], p[3], p[2], p[1]] : p;
    for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; if (a === lo && b === hi) return 1; if (a === hi && b === lo) return -1; }
    return 0;
  };
  const faceEdges = p => { const o = []; for (let k = 0; k < 4; k++) { const a = p[k], b = p[(k + 1) % 4]; if (a !== b) o.push(ek(a, b)); } return o; };
  const nbrs = new Map();
  for (const [, v] of byEdge) {
    if (v.length !== 2) continue;
    (nbrs.get(v[0]) || nbrs.set(v[0], []).get(v[0])).push(v[1]);
    (nbrs.get(v[1]) || nbrs.set(v[1], []).get(v[1])).push(v[0]);
  }
  const posOfV = i2 => [wp[i2 * 3], wp[i2 * 3 + 1], wp[i2 * 3 + 2]];
  const geomNormal = f => {
    const P = weldC(f).map(posOfV);
    const ux = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
    const vx = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    const n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  // The geometry decides the outward side of one seed face per connected component; every other face follows from
  // it, which is the only way two wall strips that meet at a block corner are guaranteed to agree.
  const flip = new Int8Array(perTile).fill(-1);
  const queue = [];
  for (let u = 0; u < perTile; u++) {
    if (flip[u] >= 0) continue;
    const q = F[u];
    if (q.ref) { const n = geomNormal(u); flip[u] = (n[0] * q.ref[0] + n[1] * q.ref[1] + n[2] * q.ref[2] < 0) ? 1 : 0; } else flip[u] = 0;
    queue.push(u);
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head], ce = faceEdges(faceV[cur]);
      for (const nb of nbrs.get(cur) || []) {
        if (flip[nb] >= 0) continue;
        const ne = faceEdges(faceV[nb]);
        let shared = -1;
        for (const k2 of ne) if (ce.includes(k2)) { shared = k2; break; }
        if (shared < 0) continue;
        const lo = Math.floor(shared / KEY), hi = shared - lo * KEY;
        const dC = trav(faceV[cur], flip[cur], lo, hi), dN = trav(faceV[nb], 0, lo, hi);
        flip[nb] = !dC || !dN ? 0 : (dN === -dC ? 0 : 1);
        queue.push(nb);
      }
    }
    queue.length = 0;
  }
  let flipped = 0;
  for (let f = 0; f < nFace; f++) {
    if (flip[f % perTile] !== 1) continue;
    const c = F[f].c;
    F[f].c = [c[0], c[3], c[2], c[1]];
    flipped++;
  }
  const wv = new Int32Array(nFace * 4);
  for (let f = 0; f < nFace; f++) {
    const c = F[f].c, o = f * 4;
    for (let k = 0; k < 4; k++) wv[o + k] = weldOf[VI(c[k][0], c[k][1])];
  }
  for (let u = 0; u < perTile; u++) faceV[u] = ringC(u);      // the audit reads the final winding

  // Render sets, flat: 0 block skin, 1 void floors, 2 walls + chamfers, 3 the closed tube. Positions and face
  // normals go straight into typed arrays because a full ring is a million quads and an object per face does not
  // survive that.
  // Indexed sets: one shared position buffer for the whole ring, four indices per quad per set. A full 48 pitch
  // tread is a million quads, and a mesh of that size only fits in the browser (and in RAM here) when it is indexed.
  const groups = [0, 1, 2, 3].map(() => ({ idx: null, idxN: 0, quads: 0, mirrored: 0, pos: null, nrm: null }));
  for (let f = 0; f < nFace; f++) { groups[F[f].set].quads++; if (F[f].mir) groups[F[f].set].mirrored++; }
  for (const g of groups) g.idx = new Int32Array(g.quads * 4);
  let degenerate = 0;
  for (let f = 0; f < nFace; f++) {
    const g = groups[F[f].set], o = f * 4, q = g.idxN;
    g.idxN = q + 4;
    for (let k = 0; k < 4; k++) g.idx[q + k] = wv[o + k];
    if (f < perTile) {                                  // flatness of one copy is enough to certify the mesh
      const P = [0, 1, 2, 3].map(k => { const vi = wv[o + k]; return [wp[vi * 3], wp[vi * 3 + 1], wp[vi * 3 + 2]]; });
      const ux = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
      const vx = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      if (Math.hypot(ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]) < 1e-7) degenerate++;
    }
  }
  for (const g of groups) { g.pos = new Float32Array(wp); g.nrm = null; }
  // The overlay that proves the topology: the quad flow itself, taken from the grid (one polyline per row and per
  // column of the ring) instead of from the faces, so it costs M*K and lands exactly on the vertices that were used.
  const wire = [];
  {
    const lvlOf = (b, i) => cells[Math.min(b, cells.length - 1)][i];
    const put = (j, i, t) => posOf(grid.ring(j, i, grid.kOf[lvlOf(j, i)]), t);
    for (let t = 0; t < 1; t++) {          // one pitch: the wireframe is the unit of work, not the whole ring
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < K; i++) {
          const cq = (i + 1) % K, d = cq === 0 ? 1 : 0;
          if (i + 1 < K) {
            const a = put(j, i, t), b2 = put(j, cq, t + d);
            wire.push(a[0], a[1], a[2], b2[0], b2[1], b2[2]);
          }
          if (j + 1 < M) {
            const a = put(j, i, t), b2 = put(j + 1, i, t);
            wire.push(a[0], a[1], a[2], b2[0], b2[1], b2[2]);
          }
        }
      }
    }
  }
  const outlinePos = [];
  for (const seg of grid.outline) {
    for (let s = 0; s + 1 < seg.length; s++) {
      for (const pt of [seg[s], seg[s + 1]]) { const p = place(pt[0], pt[1], -0.3); outlinePos.push(p[0], p[1], p[2]); }
    }
  }

  // ---------------------------------------------------------------- audit --------------------------------------
  // Closed = every edge used twice; manifold = never more; oriented = the two users agree on direction. Rim loops
  // are the only boundary a tread is allowed to have with the cap switched off, so `open` is read against 2K.
  const edge = new Map(), vFac = new Map(), vEdg = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (let f = 0; f < perTile; f++) {
    const r4 = faceV[f];
    for (const a of r4) bump(vFac, a);
    for (let k2 = 0; k2 < 4; k2++) {
      const a = r4[k2], b = r4[(k2 + 1) % 4];
      if (a === b) continue;
      const key = a < b ? a + '_' + b : b + '_' + a;
      const e = edge.get(key) || { n: 0, dir: 0 };
      e.n++; e.dir += a < b ? 1 : -1;
      edge.set(key, e);
    }
  }
  let open = 0, nonManifold = 0, inconsistent = 0;
  for (const [key, e] of edge) {
    if (e.n === 1) open++; else if (e.n > 2) nonManifold++; else if (e.dir !== 0) inconsistent++;
    const [a, b] = key.split('_').map(Number);
    bump(vEdg, a); bump(vEdg, b);
  }
  let pinched = 0;
  const rimRings = new Set();
  for (let i = 0; i < K; i++) { rimRings.add(grid.ring(0, i, grid.kOf[cells[0][i]])); rimRings.add(grid.ring(M - 1, i, grid.kOf[cells[cells.length - 1][i]])); }
  for (const [v, nf] of vFac) if (!rimRings.has(v) && (vEdg.get(v) || 0) !== nf) pinched++;
  const stats = {
    quads: F.length, quadsTile: perTile, verts: wp.length / 3, rings: nRings, nodes: M * K, rows: M, cols: K,
    degenerate, open, nonManifold, inconsistent, pinched, splits: grid.splits, passes: grid.refinePasses,
    flipped, levels: grid.chain.map(c => c.name),
    mirroredFaces: groups.reduce((a, g) => a + g.mirrored, 0), tris: nFace * 2,
    tiles, pitch: grid.pitch, pitchMin: map.seq ? Math.min(...Array.from({ length: tiles }, (_, t) => map.pitchOf(t))) : grid.pitch,
    pitchMax: map.seq ? Math.max(...Array.from({ length: tiles }, (_, t) => map.pitchOf(t))) : grid.pitch, variablePitch: !!map.seq, rimA: K, rimB: K,
  };
  return { grid, map, RL, groups, wire, outlinePos, stats, wp, wv, period: faceV, F, nRings, tiles, flat, place, LV, T, weldOf, pos, cellCentre };
}

// ===================================================================================================================
//  OBJ — real quad faces (f with four indices), welded
// ===================================================================================================================
export function toOBJ(B) {
  const { wp, wv, F, stats } = B;
  let s = `# quad tread — outlines traced with quads, no displacement of any kind\n`;
  s += `# rows ${stats.rows} cols ${stats.cols} tiles ${stats.tiles}  faces ${stats.quads} (all quads)\n`;
  s += `# open edges ${stats.open}  non-manifold ${stats.nonManifold}  degenerate ${stats.degenerate}\n`;
  s += `o tread\n`;
  for (let i = 0; i < wp.length; i += 3) s += `v ${wp[i].toFixed(5)} ${wp[i + 1].toFixed(5)} ${wp[i + 2].toFixed(5)}\n`;
  const names = ['block', 'void', 'wall', 'cap'];
  for (let g = 0; g < 4; g++) {
    let head = '';
    let body = '';
    for (let f = 0; f < F.length; f++) {
      if (F[f].set !== g) continue;
      const o = f * 4;
      body += `f ${wv[o] + 1} ${wv[o + 1] + 1} ${wv[o + 2] + 1} ${wv[o + 3] + 1}\n`;
    }
    if (!body) continue;
    s += head + `g ${names[g]}\n` + body;
  }
  return s;
}
