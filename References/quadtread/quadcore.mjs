// ===================================================================================================================
//  quadcore — AAA tread pattern compiler (the grammar + the trace)
//
//  Nothing here displaces geometry. No height map, no texture, no raster probe, no per-vertex image lookup.
//
//  A design authors ONE pattern element per rib row, on ONE side of the tyre only. The engine mirrors / flips /
//  translates that element to complete the pitch; the pitch is then circularly arrayed by the mesher.
//
//  Everything is expressed as exact piecewise-linear functions on the (u, x) domain of one pitch:
//      u  fraction of one pitch, periodic
//      x  developed lateral position across the tread, mm, signed (centre = 0)
//  A lug outline is a pair of boundary trajectories u = f(x); a circumferential groove wall is a lateral
//  boundary curve x = g(u). The mesher puts a grid line on every key of every one of those functions, so the
//  outline is traced by quad edges with no approximation, and no sampling of anything.
// ===================================================================================================================

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap01 = v => v - Math.floor(v);
const EPS = 1e-9;

// ------------------------------------------------------------- levels ---------------------------------------------
// d      = depth of the level as a fraction of the tread depth, measured inward along the crown normal
// inset  = how far that level's skin is pulled inside its own outline (this is what makes a chamfer / draft)
export const LEVELS = {
  top:    { d: 0.00, inset: 1.0, label: 'block top' },
  kerf:   { d: 0.14, inset: 0.0, label: 'wear scribe' },
  relief: { d: 0.45, inset: 0.0, label: 'relief ledge' },
  sipe:   { d: 0.62, inset: 0.0, label: 'sipe floor' },
  pit:    { d: 0.78, inset: 0.0, label: 'stud pit' },
  floor:  { d: 1.00, inset: 0.0, label: 'groove floor' },
};
export const depthFrac = l => LEVELS[l] ? LEVELS[l].d : 1;

export function levels(T) {
  const out = {};
  for (const [name, L] of Object.entries(LEVELS)) {
    let d = L.d * T.depth;
    if (name === 'sipe') d = T.sipeDepthF * T.depth;
    if (name === 'kerf') d = 0.16 * T.depth;
    out[name] = { name, depth: d, inset: L.inset * T.cham, label: L.label };
  }
  return out;
}

// ------------------------------------------------------------- wave -----------------------------------------------
// A periodic displacement with an integer number of cycles per pitch — so it is exactly periodic and the array
// can never see a seam. tri=1 → triangle (a serrated wall / a 3D sawtooth sipe), tri=0 → sine (a scallop).
export function waveAt(w, u) {
  if (!w || !w.a) return 0;
  const p = wrap01(u * (w.cyc || 1) + (w.ph || 0));
  return w.a * (w.tri === 0 ? Math.sin(p * TAU) : (p < 0.5 ? 4 * p - 1 : 3 - 4 * p));
}
// where a wave turns around: these become grid lines, so the wave is traced rather than sampled
export function waveTurns(w) {
  const out = [];
  if (!w || !w.a) return out;
  const cyc = Math.max(1, Math.round(w.cyc || 1));
  for (let k = 0; k <= 2 * cyc; k++) out.push(k / (2 * cyc));
  return out;
}

// ------------------------------------------------------------- profiles ------------------------------------------
export function profile(keys, fallback = 0) {
  if (!keys || !keys.length) return () => fallback;
  const k = [...keys].sort((a, b) => a[0] - b[0]);
  return t => {
    if (t <= k[0][0]) return k[0][1];
    const n = k.length;
    if (t >= k[n - 1][0]) return k[n - 1][1];
    for (let i = 0; i < n - 1; i++) {
      if (t <= k[i + 1][0] + 1e-12) return lerp(k[i][1], k[i + 1][1], (t - k[i][0]) / Math.max(EPS, k[i + 1][0] - k[i][0]));
    }
    return k[n - 1][1];
  };
}
const edgeProfile = (v, dv) => (Array.isArray(v) ? profile([[0, v[0]], [1, v[1]]]) : profile([[0, v], [1, v + (dv || 0)]]));

// ===================================================================================================================
//  GRAMMAR
//
//  design = { id, label, tag, desc, carcass:{}, shear:'v'|'z'|'none', mir:'mirror'|'point'|'copy', shift:0.5,
//             wrap:0..1, lanes:[lane], lanesL:[lane] }          // lanes authored centre → out, RIGHT half
//
//  lane   = { w:share, kind:'rib'|'groove', base?:level, chev:1, mir?, shift?, edge?:wave,
//             cuts:[cut], blocks?:{}, sipes?:{}, tie?:{} }
//  cut    = { level, at:[t0,t1], phase,
//             u0:[a,b]|u0:a du0:n, u1:[a,b]|u1:b du1:n,   // the two edges, from t0 to t1 (a taper)
//             keys:[[t,u0,u1]...],                        // literal trace of a reference outline
//             lKeys:[[t,du]], rKeys:[[t,du]],             // per-edge offsets → hooked / notched / dogboned
//             bow, zig:{a,cyc,ph,tri,side}, zigL, zigR, samples }
// ===================================================================================================================

function cutEnds(c) {
  let pL, pR;
  if (c.keys) { pL = profile(c.keys.map(k => [k[0], k[1]])); pR = profile(c.keys.map(k => [k[0], k[2]])); }
  else { pL = edgeProfile(c.u0 ?? 0.06, c.du0); pR = edgeProfile(c.u1 ?? 0.14, c.du1); }
  const lp = c.lKeys ? profile(c.lKeys) : null;
  const rp = c.rKeys ? profile(c.rKeys) : null;
  const bow = c.bow || 0;
  const zL = c.zigL || (c.zig && (c.zig.side !== 'R') ? c.zig : null);
  const zR = c.zigR || (c.zig && (c.zig.side !== 'L') ? c.zig : null);
  const zigF = (z, t) => {
    if (!z || !z.a) return 0;
    const p = wrap01(t * (z.cyc || 1) + (z.ph || 0));
    return z.a * (z.tri === 0 ? Math.sin(p * TAU) : (p < 0.5 ? 4 * p - 1 : 3 - 4 * p));
  };
  return [
    t => pL(t) + (lp ? lp(t) : 0) + bow * 4 * t * (1 - t) + zigF(zL, t),
    t => pR(t) + (rp ? rp(t) : 0) + bow * 4 * t * (1 - t) + zigF(zR, t),
  ];
}

// every t where the shape turns or keys: these become grid rows, so the trace is exact inside every band
function cutTStations(c) {
  const [ta, tb] = c.at || [0, 1];
  const set = new Set([0, 1]);
  const push = t => { if (isFinite(t) && t >= -1e-9 && t <= 1 + 1e-9) set.add(clamp(t, 0, 1)); };
  if (c.keys) for (const k of c.keys) push(k[0]);
  if (c.lKeys) for (const k of c.lKeys) push(k[0]);
  if (c.rKeys) for (const k of c.rKeys) push(k[0]);
  for (const w of [c.zigL, c.zigR, c.zig]) for (const t of waveTurns(w)) push(t);
  const n = Math.max(1, Math.round(c.samples ?? 2));
  for (let k = 0; k <= n; k++) push(k / n);
  return [...set].sort((a, b) => a - b).map(t => ta + (tb - ta) * t);
}

// ------------------------------------------------------------------ generators -----------------------------------
export function gaps({ n = 1, w = 0.16, at = [0, 1], phase = 0, level = 'floor', taper = 0, bow = 0, zig, zigL, zigR, keys, samples, samplesPerEdge = 0 }) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const c = (k + phase) / n, h = w / 2;
    out.push({
      level, at, bow, samples: samples ?? (zig ? Math.max(2, Math.round((zig.cyc || 1) * 2)) : 2),
      u0: [c - h, c - h + taper], u1: [c + h, c + h + taper],
      zig, zigL, zigR,
      keys: keys ? keys.map(kk => [kk[0], kk[1] + c, kk[2] + c]) : null,
      samplesPerEdge,
    });
  }
  return out;
}
export function sipes({ n = 1, w = 0.026, at = [0, 1], phase = 0, level = 'sipe', du = 0, zig, samples = 4 }) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const c = (k + phase) / n;
    out.push({ level, at, u0: [c - w / 2, c - w / 2 + du], u1: [c + w / 2, c + w / 2 + du], zig, samples: zig ? Math.max(2, (zig.cyc || 1) * 2) : samples });
  }
  return out;
}
export function tieBars({ n = 1, w = 0.05, at = [0.3, 0.7], phase = 0, du = 0, level = 'top' }) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const c = (k + phase) / n;
    out.push({ level, at, u0: [c - w / 2, c - w / 2 + du], u1: [c + w / 2, c + w / 2 + du], samples: 1, over: 1 });
  }
  return out;
}
export function laneCuts(lane) {
  const out = [];
  if (lane.blocks) out.push(...gaps(lane.blocks));
  if (lane.cuts) out.push(...lane.cuts);
  if (lane.tie) out.push(...tieBars(lane.tie));
  if (lane.sipes) out.push(...sipes(lane.sipes));
  return out;
}

// ===================================================================================================================
//  CARCASS
// ===================================================================================================================
export function carcass(T) {
  const Rd = T.rim * 25.4 / 2;
  const R = Rd + (T.width * T.aspect) / 100;
  const halfW = (T.width * T.treadFrac) / 2;
  return { Rd, R, halfW, circ: TAU * R, pitch: (TAU * R) / T.pitches };
}

// ===================================================================================================================
//  COMPILE
// ===================================================================================================================
function gapMergeRows(rows, gap) {
  const out = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && r.x - last.x < gap) { if (r.wig && (!last.wig || Math.abs(r.wig.a) > Math.abs(last.wig.a))) last.wig = r.wig; last.x = (last.x + r.x) / 2; }
    else out.push({ ...r });
  }
  return out;
}

export function compile(T, D) {
  const G = carcass(T);
  const wrapLen = (D.wrap || 0) * T.shoulderLen;
  const xMaxR = G.halfW + wrapLen;
  const xMaxL = D.lanesL ? G.halfW + (D.wrapL ?? D.wrap ?? 0) * T.shoulderLen : xMaxR;
  const k = Math.tan((T.chevron * Math.PI) / 180) / Math.max(EPS, G.pitch);   // pitch fraction per mm
  const shearMode = D.shear || 'v';

  // shear(x) is accumulated lane by lane, so a chevron arm stays continuous across a lane boundary
  const makeShear = stack => {
    const total = stack.reduce((a, l) => a + l.w, 0) || 1;
    const rows = [];
    let acc = 0;
    for (const l of stack) { rows.push({ from: acc / total, to: (acc + l.w) / total, mul: l.chev ?? 1 }); acc += l.w; }
    return x => {
      if (shearMode === 'none' || !k) return 0;
      const span = x >= 0 ? xMaxR : xMaxL;
      const a = clamp(Math.abs(x) / Math.max(EPS, span), 0, 1);
      let s = 0;
      for (const r of rows) s += clamp(a - r.from, 0, r.to - r.from) * r.mul;
      const u = s * k * span;
      return shearMode === 'z' ? Math.sign(x) * u : u;
    };
  };

  // ---- lane stacks → pieces (each piece is one side of one lane, with its u transform) -------------------------
  const sR = makeShear(D.lanes);
  const sL = makeShear(D.lanesL || D.lanes);
  // the drift lives in the mapper, not in the trace: in the developed frame a chevron arm is a straight line, so
  // no trajectory can ever overtake another across the pitch seam and the tile's two edge loops stay identical
  const shearAt = x => (x >= 0 ? sR(x) : sL(x));
  const pieces = [];
  const addStack = (stack, side) => {
    const total = stack.reduce((a, l) => a + l.w, 0) || 1;
    const span = side === 'L' ? xMaxL : xMaxR;
    const shear = makeShear(stack);
    let acc = 0;
    for (const lane of stack) {
      const a = (acc / total) * span, b = ((acc + lane.w) / total) * span;
      acc += lane.w;
      const push = (xa, xb, flip, shift, flipU, tag) => pieces.push({
        lane, side, tag, xa, xb, flip, shift, flipU, shear,
        tOf: x => clamp(flip ? (xb - x) / Math.max(EPS, xb - xa) : (x - xa) / Math.max(EPS, xb - xa), 0, 1),
      });
      if (side === 'L') push(-b, -a, true, 0, false, 'L');
      else {
        push(a, b, false, 0, false, 'R');
        if (!D.lanesL) {
          const mir = lane.mir ?? D.mir ?? 'mirror';
          const shift = lane.shift ?? D.shift ?? 0.5;
          if (mir === 'mirror') push(-b, -a, true, shift, false, 'M');
          else if (mir === 'point') push(-b, -a, true, shift, true, 'M');
          else if (mir === 'copy') push(-b, -a, false, shift, false, 'M');
        }
      }
    }
  };
  addStack(D.lanes, 'R');
  if (D.lanesL) addStack(D.lanesL, 'L');

  // ---- cuts → trajectories --------------------------------------------------------------------------------------
  const cuts = [];
  for (const p of pieces) {
    for (const c of laneCuts(p.lane)) {
      const [fL, fR] = cutEnds(c);
      const [ta, tb] = c.at || [0, 1];
      const at = t => (p.flip ? p.xb - t * (p.xb - p.xa) : p.xa + t * (p.xb - p.xa));
      const xa = at(ta), xb = at(tb);
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      const ph = c.phase || 0;
      // NOTE: the chevron drift is NOT applied here. Everything is authored and meshed in the developed frame,
      // where a chevron arm is a straight line, so no trajectory can ever overtake another through the pitch seam.
      // The drift is re-applied by the mapper (see makeMapper), which turns the tile into the slanted strip it is.
      const ev = f => x => {
        let u = f(p.tOf(x));
        if (p.flipU) u = -u;
        return wrap01(u + p.shift + ph);
      };
      cuts.push({
        level: c.level || 'floor', x0, x1, piece: p, lane: p.lane,
        uL: ev(fL), uR: ev(fR),
        xStations: cutTStations(c).map(at),
        edgeZig: (c.zig && c.zig.side === 'E') ? c.zig : null,
        over: c.over ? 1 : 0,
      });
    }
  }

  // ---- rows: lane edges + every cut station + crown subdivision; a row may carry a serration --------------------
  let rows = [];
  const addRow = (x, wig) => { if (isFinite(x)) rows.push({ x, wig: wig || null }); };
  addRow(0, null); addRow(xMaxR, null); addRow(-xMaxL, null);
  if (xMaxR > G.halfW) addRow(G.halfW, null);
  if (xMaxL > G.halfW) addRow(-G.halfW, null);
  for (const p of pieces) {
    const e = p.lane.edge;
    const wig = e && e.a ? { a: e.a, cyc: e.cyc, ph: e.ph, tri: e.tri, sgn: p.flip ? -1 : 1, phAdj: p.flip ? -(p.shift || 0) : 0 } : null;
    addRow(p.xa, wig);
    addRow(p.xb, wig ? { ...wig, sgn: -wig.sgn, phAdj: wig.phAdj ? -wig.phAdj : 0 } : null);
    const span = Math.abs(p.xb - p.xa), dir = Math.sign(p.xb - p.xa) || 1;
    const n = Math.max(1, Math.round(span / Math.max(0.5, T.xsub)));
    for (let i = 0; i <= n; i++) addRow(p.xa + dir * (span * i) / n, i === 0 ? wig : null);
  }
  for (const c of cuts) for (const x of c.xStations) addRow(x, null);
  // The merge gap keeps sliver bands out of the mesh; it has to stay inside sane bounds or the rows either touch
  // (zero-height bands, degenerate quads) or eat the pattern (bands too thick for the trace to resolve).
  rows = gapMergeRows(rows.sort((a, b) => a.x - b.x), clamp(T.xmin, 0.08, 0.9 * Math.max(0.5, T.xsub)));
  // drop anything outside the domain
  rows = rows.filter(r => r.x >= -xMaxL - 1e-6 && r.x <= xMaxR + 1e-6);
  const xs = rows.map(r => r.x);

  // ---- columns ------------------------------------------------------------------------------------------------
  const cols = [];
  const globals = [{ kind: 'seam', id: 'seam', x0: -1e9, x1: 1e9, evalAt: () => 0 }];
  const nuni = T.usub > 0 ? Math.max(2, Math.round(G.pitch / T.usub)) : 1;
  for (let i = 1; i < nuni; i++) { const u = i / nuni; globals.push({ kind: 'uni', id: `u${i}`, x0: -1e9, x1: 1e9, evalAt: () => u }); }
  let fid = 0;
  for (const c of cuts) {
    for (const which of ['L', 'R']) {
      const f = which === 'L' ? c.uL : c.uR;
      cols.push({ kind: 'feat', id: `f${fid++}`, x0: c.x0, x1: c.x1, cut: c, which, evalAt: x => f(clamp(x, c.x0, c.x1)), lvl: c.level });
    }
  }
  // a serrated row needs its turning points as columns too, else the serration is only sampled at row ends
  const turns = new Set();
  for (const r of rows) if (r.wig) for (const u of waveTurns(r.wig)) turns.add(wrap01(u - (r.wig.phAdj || 0)));
  let tid = 0;
  for (const u of turns) cols.push({ kind: 'turn', id: `t${tid++}`, x0: -1e9, x1: 1e9, evalAt: () => u });

  return { T, D, G, xMaxR, xMaxL, xs, rows, cols, globals, cuts, pieces, shearMode, slope: k, shearAt };
}
