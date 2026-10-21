/* ════════════════════════════════════════════════════════════════════
   topology.js — network topology: crossings, T-touches and welds become
   intersections (paved, ribbon-trimmed) or overpasses (grade-separated).
   Pure, no DOM. Pipeline (same family as the Frontier reference, own code):

   1. events — curve crossings (exact XZ + height gate), endpoint-on-curve
      touches, and multi-leg welds;
   2. cluster — nearby events fuse into one group; overlapping discs merge;
   3. legs — each group resolves approach legs (through / branch / weld);
   4. cuts — each leg trims its road's samples; the complement is runs.

   Conventions: plan metres, Y-up. Samples are main's Map
   (roadId → {samples, length, count, closed}), built from effective points.
   ════════════════════════════════════════════════════════════════════ */
import {segmentsTouch, distToSegment} from './spline.js';
import {linkForPoint, effectivePoints, roadById} from './state.js';

export const TOPO = {
  gateY: 1.5,        // |Δy| at/below this fuses at-grade; above → overpass
  touchXZ: 0.8,      // endpoint-to-curve fuse radius (plan metres)
  weldGuard: 1.0,    // ignore crossings this close to a shared weld point
  mergeDist: 2.5,    // events within this radius fuse into one group
  bendDeg: 15,       // 2-leg groups straighter than 180-15° abut (no junction)
  mergeDeg: 35,      // branch arrival below this vs main tangent → merge
  selfGap: 2.0,      // self-crossings closer than this in station are ignored
  maxPairTests: 400000,
};

const halfWidth = (road, w = 1) =>
  Math.max(1.5, ((road.lanes * road.laneWidth + road.shoulderL + road.shoulderR) * (w || 1)) / 2);

/** Interpolate a sample row at station s (clamped). */
export function sampleAtStation(S, s) {
  if (!S.length) return null;
  if (s <= S[0].s) return S[0];
  if (s >= S[S.length - 1].s) return S[S.length - 1];
  let lo = 0, hi = S.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid].s < s) lo = mid; else hi = mid;
  }
  const a = S[lo], b = S[hi];
  const f = (s - a.s) / Math.max(1e-9, b.s - a.s);
  let tx = (a.tx || 0) + ((b.tx || 0) - (a.tx || 0)) * f;
  let tz = (a.tz || 0) + ((b.tz || 0) - (a.tz || 0)) * f;
  const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
  return {
    x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f,
    tx, tz, grade: (a.grade || 0) + ((b.grade || 0) - (a.grade || 0)) * f,
    w: (a.w || 1) + ((b.w || 1) - (a.w || 1)) * f, s,
  };
}

/** Station of the sample nearest (x, z). */
export function stationOfPoint(S, x, z) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < S.length; i++) {
    const d = (S[i].x - x) * (S[i].x - x) + (S[i].z - z) * (S[i].z - z);
    if (d < bd) { bd = d; bi = i; }
  }
  return S[bi].s;
}

function roadBBox(S) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of S) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  return {minX, maxX, minZ, maxZ};
}
const boxesOverlap = (a, b, pad = 0) =>
  a.minX - pad <= b.maxX + pad && b.minX - pad <= a.maxX + pad &&
  a.minZ - pad <= b.maxZ + pad && b.minZ - pad <= a.maxZ + pad;

function weldPoints(project) {
  // Shared weld locations per road pair (for the crossing guard).
  const out = [];
  for (const j of project.junctions || []) {
    const roads = (j.links || []).map((l) => l.road);
    if (roads.length >= 2) out.push({x: j.x, z: j.z, roads});
  }
  return out;
}

/* ── candidate segment pairs via uniform grid (never skips, no stride misses) ── */
const GRID_CELL = 4; // metres; resampled segments are ~1 m

/**
 * [i, k] segment-index pairs whose XZ bboxes overlap, ascending & deterministic.
 * Self pairs skip node-sharing neighbours (and the wrap pair on closed roads).
 */
export function gridPairs(aS, endA, bS, endB, self, closed = false) {
  const grid = new Map();
  const cell = (v) => Math.floor(v / GRID_CELL);
  for (let k = 0; k < endB; k++) {
    const c = bS[k % bS.length], d = bS[(k + 1) % bS.length];
    for (let cx = cell(Math.min(c.x, d.x)); cx <= cell(Math.max(c.x, d.x)); cx++) {
      for (let cz = cell(Math.min(c.z, d.z)); cz <= cell(Math.max(c.z, d.z)); cz++) {
        const kk = cx + ',' + cz;
        let arr = grid.get(kk);
        if (!arr) { arr = []; grid.set(kk, arr); }
        arr.push(k);
      }
    }
  }
  const out = [];
  const seen = new Int32Array(Math.max(1, endB)).fill(-1);
  for (let i = 0; i < endA; i++) {
    const p = aS[i % aS.length], q = aS[(i + 1) % aS.length];
    const cands = [];
    for (let cx = cell(Math.min(p.x, q.x)); cx <= cell(Math.max(p.x, q.x)); cx++) {
      for (let cz = cell(Math.min(p.z, q.z)); cz <= cell(Math.max(p.z, q.z)); cz++) {
        const arr = grid.get(cx + ',' + cz);
        if (!arr) continue;
        for (const k of arr) {
          if (seen[k] === i) continue;
          seen[k] = i;
          if (self && k - i <= 1) continue; // dup + forward neighbour
          if (self && closed && i === 0 && k === endB - 1) continue; // wrap neighbour
          cands.push(k);
        }
      }
    }
    cands.sort((m, n) => m - n);
    for (const k of cands) out.push([i, k]);
  }
  return out;
}

/* ── main build ─────────────────────────────────────────────────────── */
export function buildTopology(project, samples, opts = {}) {
  const cornerRadius = Math.min(14, Math.max(2, +opts.cornerRadius || +project?.settings?.cornerRadius || 6));
  const roads = (project.roads || []).filter((r) => r.visible !== false && samples.get(r.id)?.count >= 2);
  const boxes = new Map();
  for (const r of roads) boxes.set(r.id, roadBBox(samples.get(r.id).samples));
  const welds = weldPoints(project);
  const nearSharedWeld = (a, b, x, z) => welds.some(
    (w) => w.roads.includes(a) && w.roads.includes(b) && Math.hypot(w.x - x, w.z - z) <= TOPO.weldGuard);

  const events = [];   // {kind, x, z, a:{road,s,y}, b:{road,s,y}}
  const overRaw = [];  // {x, z, gap, a:{road,s,y}, b:{road,s,y}}

  /* 1 ─ curve crossings (incl. self), exact XZ + height gate. */
  for (let ai = 0; ai < roads.length; ai++) {
    for (let bi = ai; bi < roads.length; bi++) {
      const A = roads[ai], B = roads[bi];
      const self = A.id === B.id;
      if (!boxesOverlap(boxes.get(A.id), boxes.get(B.id))) continue;
      const SA = samples.get(A.id), SB = samples.get(B.id);
      const aS = SA.samples, bS = SB.samples;
      const endA = SA.closed ? aS.length : aS.length - 1;
      const endB = SB.closed ? bS.length : bS.length - 1;
      const stepA = SA.length / endA, stepB = SB.length / endB;
      for (const [i, k] of gridPairs(aS, endA, bS, endB, self, self && SA.closed)) {
        const p = aS[i % aS.length], q = aS[(i + 1) % aS.length];
        const c = bS[k % bS.length], d = bS[(k + 1) % bS.length];
        const hit = segmentsTouch(p, q, c, d, 1e-6); // node-exact crossings count
        if (!hit) continue;
        const sA = i * stepA + (hit.t || 0) * stepA;
        const sB = k * stepB + (hit.u || 0) * stepB;
          if (self && Math.abs(sA - sB) < TOPO.selfGap) continue;
          const yA = p.y + (q.y - p.y) * (hit.t || 0);
          const yB = c.y + (d.y - c.y) * (hit.u || 0);
          if (Math.abs(yA - yB) >= TOPO.gateY) {
            overRaw.push({x: hit.x, z: hit.z, gap: Math.abs(yA - yB),
              a: {road: A.id, s: sA, y: yA}, b: {road: B.id, s: sB, y: yB}});
            continue;
          }
          if (!self && nearSharedWeld(A.id, B.id, hit.x, hit.z)) continue;
          // Dedupe: the same crossing hits adjacent segment pairs.
          const dup = events.some((e) => e.kind === 'cross' &&
            ((e.a.road === A.id && e.b.road === B.id) || (e.a.road === B.id && e.b.road === A.id)) &&
            Math.hypot(e.x - hit.x, e.z - hit.z) < 1.5);
          if (dup) continue;
          events.push({kind: 'cross', x: hit.x, z: hit.z,
            a: {road: A.id, s: sA, y: yA}, b: {road: B.id, s: sB, y: yB}});
        }
      }
    }

  /* 2 ─ endpoint-on-curve touches (T / merge terminals). */
  for (const B of roads) {
    if (B.closed) continue;
    const eff = effectivePoints(project, B);
    if (eff.length < 2) continue;
    for (const ei of [0, eff.length - 1]) {
      if (linkForPoint(project, B.id, ei)) continue; // welded ends join via the weld rule
      const P = eff[ei];
      for (const A of roads) {
        if (A.id === B.id) continue;
        if (!boxesOverlap(boxes.get(A.id), {minX: P.x, maxX: P.x, minZ: P.z, maxZ: P.z}, TOPO.touchXZ)) continue;
        const SA = samples.get(A.id);
        const aS = SA.samples;
        const endA = SA.closed ? aS.length : aS.length - 1;
        let best = null;
        for (let k = 0; k < endA; k++) {
          const c = aS[k % aS.length], e = aS[(k + 1) % aS.length];
          if (P.x < Math.min(c.x, e.x) - TOPO.touchXZ || P.x > Math.max(c.x, e.x) + TOPO.touchXZ ||
              P.z < Math.min(c.z, e.z) - TOPO.touchXZ || P.z > Math.max(c.z, e.z) + TOPO.touchXZ) continue;
          const {d, t} = distToSegment(P.x, P.z, c.x, c.z, e.x, e.z);
          if (d >= TOPO.touchXZ || (best && d >= best.d)) continue;
          const yC = c.y + (e.y - c.y) * t;
          if (Math.abs(P.y - yC) >= TOPO.gateY) continue;
          best = {d, s: (k + t) * (SA.length / endA), x: c.x + (e.x - c.x) * t, z: c.z + (e.z - c.z) * t, y: yC};
        }
        if (best) {
          events.push({kind: 'touch', x: best.x, z: best.z,
            a: {road: A.id, s: best.s, y: best.y},
            b: {road: B.id, s: ei === 0 ? 0 : samples.get(B.id).length, y: P.y, end: ei === 0 ? 'start' : 'end'}});
        }
      }
    }
  }

  /* 3 ─ weld events (multi-leg joins; 2-leg straights abut later). */
  for (const j of project.junctions || []) {
    const links = (j.links || []).filter((l) => {
      const r = roadById(project, l.road);
      return r && !r.closed && samples.get(l.road)?.count >= 2;
    });
    if (links.length < 2) continue;
    events.push({kind: 'weld', x: j.x, z: j.z, weldId: j.id,
      legs: links.map((l) => {
        const smp = samples.get(l.road);
        return {road: l.road, s: l.end === 'start' ? 0 : smp.length, y: j.y, end: l.end};
      })});
  }

  /* 4 ─ cluster events by location (single-link, mergeDist). */
  const groups = [];
  for (const e of events) {
    let g = groups.find((gg) => gg.some((o) => Math.hypot(o.x - e.x, e.z - o.z) <= TOPO.mergeDist));
    if (!g) { g = []; groups.push(g); }
    g.push(e);
  }

  /* 5 ─ resolve each group into legs + cuts. */
  const intersections = [];

  for (const g of groups) {
    // Per-road station clusters (radius R is group-dependent; cluster at 3m first pass).
    const perRoad = new Map(); // roadId → [{s, end:'start'|'end'|null, weld:bool}]
    for (const e of g) {
      if (e.kind === 'weld') {
        for (const l of e.legs) {
          if (!perRoad.has(l.road)) perRoad.set(l.road, []);
          perRoad.get(l.road).push({s: l.s, end: l.end, weld: true});
        }
      } else {
        if (!perRoad.has(e.a.road)) perRoad.set(e.a.road, []);
        perRoad.get(e.a.road).push({s: e.a.s, end: null, weld: false});
        if (!perRoad.has(e.b.road)) perRoad.set(e.b.road, []);
        perRoad.get(e.b.road).push({s: e.b.s, end: e.b.end || null, weld: false});
      }
    }
    // Radius from the widest member, then legs.
    let maxHW = 2;
    for (const [rid, sts] of perRoad) {
      const road = roadById(project, rid);
      const S = samples.get(rid).samples;
      for (const st of sts) {
        const row = sampleAtStation(S, st.s);
        maxHW = Math.max(maxHW, halfWidth(road, row?.w || 1));
      }
    }
    const R = Math.min(20, Math.max(5, cornerRadius + maxHW));
    const cx = g.reduce((a, e) => a + e.x, 0) / g.length;
    const cz = g.reduce((a, e) => a + e.z, 0) / g.length;

    const legs = [];
    const memberRoads = new Set();
    const gCuts = []; // {roadId, s0, s1} — raw, may wrap on closed roads
    for (const [rid, sts] of perRoad) {
      const road = roadById(project, rid);
      const smp = samples.get(rid);
      const S = smp.samples, L = smp.length;
      memberRoads.add(rid);
      // Cluster stations at radius R (figure-8 keeps two approaches).
      const sorted = [...sts].sort((a, b) => a.s - b.s);
      const clusters = [];
      for (const st of sorted) {
        const c = clusters[clusters.length - 1];
        if (c && st.s - c.max <= R) {
          c.max = st.s; c.list.push(st);
        } else clusters.push({max: st.s, list: [st]});
      }
      for (const c of clusters) {
        const sC = c.list.reduce((a, l) => a + l.s, 0) / c.list.length;
        const isEnd = !smp.closed &&
          (c.list.some((l) => l.end) || sC <= R * 0.5 || sC >= L - R * 0.5);
        const row = sampleAtStation(S, Math.min(L - 0.01, Math.max(0.01, sC)));
        const hw = halfWidth(road, row?.w || 1);
        if (isEnd) {
          const atStart = (c.list.find((l) => l.end)?.end === 'start') || sC < L / 2;
          const sTrim = atStart ? Math.min(L - 1, R) : Math.max(1, L - R);
          // Guard: road fully swallowed by the disc.
          if (atStart ? sTrim >= L - 1 : sTrim <= 1) continue;
          const b = sampleAtStation(S, sTrim);
          const dx = b.x - cx, dz = b.z - cz;
          const dl = Math.hypot(dx, dz) || 1;
          const welded = c.list.some((l) => l.weld);
          legs.push({roadId: rid, sTrim, dirx: dx / dl, dirz: dz / dl, halfW: hw,
            role: welded ? 'weld' : 'branch'});
          if (atStart) gCuts.push({roadId: rid, s0: 0, s1: Math.min(L, sC + R)});
          else gCuts.push({roadId: rid, s0: Math.max(0, sC - R), s1: L});
        } else {
          gCuts.push({roadId: rid, s0: sC - R, s1: sC + R});
          for (const side of [-1, 1]) {
            let sTrim = sC + side * R;
            if (smp.closed) sTrim = ((sTrim % L) + L) % L;
            else if (sTrim < 1 || sTrim > L - 1) continue;
            const b = sampleAtStation(S, sTrim);
            const dx = b.x - cx, dz = b.z - cz;
            const dl = Math.hypot(dx, dz) || 1;
            legs.push({roadId: rid, sTrim, dirx: dx / dl, dirz: dz / dl, halfW: hw, role: 'through'});
          }
        }
      }
    }
    if (legs.length < 2) continue;
    // 2-leg groups abut unless bent.
    if (legs.length === 2) {
      const dot = legs[0].dirx * legs[1].dirx + legs[0].dirz * legs[1].dirz;
      const ang = (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
      if (ang > 180 - TOPO.bendDeg) continue; // straight join — ribbons abut
    }
    // Kind.
    const throughRoads = new Set(legs.filter((l) => l.role === 'through').map((l) => l.roadId));
    const terminating = legs.filter((l) => l.role !== 'through');
    let kind = 'multi';
    if (legs.length === 2) kind = 'elbow';
    else if (throughRoads.size >= 2) kind = legs.length === 4 ? 'cross' : 'multi';
    else if (throughRoads.size === 1) {
      if (terminating.length === 1) {
        // Merge? branch arrival vs main tangent.
        const br = terminating[0];
        const mainS = samples.get([...throughRoads][0]).samples;
        const mRow = sampleAtStation(mainS, stationOfPoint(mainS, cx, cz));
        const cos = Math.abs(br.dirx * (mRow?.tx || 0) + br.dirz * (mRow?.tz || 0));
        const arr = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
        kind = arr < TOPO.mergeDeg ? 'merge' : 'tee';
      } else kind = 'multi';
    } else if (legs.length === 3) kind = 'wye';
    // Min adjacent-leg angle (sorted by bearing).
    const bearings = legs.map((l) => Math.atan2(l.dirx, -l.dirz)).sort((a, b) => a - b);
    let minAng = 360;
    for (let i = 0; i < bearings.length; i++) {
      let d = ((bearings[(i + 1) % bearings.length] - bearings[i]) * 180) / Math.PI;
      if (d < 0) d += 360;
      minAng = Math.min(minAng, d);
    }
    const y = g.reduce((a, e) => a + (e.a?.y ?? e.legs?.[0]?.y ?? 0), 0) / g.length;
    const id = `x_${legs.map((l) => `${l.roadId}@${Math.round(l.sTrim)}`).sort().join('-')}`;
    intersections.push({
      id, x: cx, z: cz, y, kind, legs, radius: R, minAngleDeg: minAng,
      roads: [...memberRoads], cuts: gCuts,
    });
  }

  /* 6 ─ merge groups whose discs overlap (watertight clusters, no z-fighting). */
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < intersections.length; i++) {
      for (let k = i + 1; k < intersections.length; k++) {
        const A = intersections[i], B = intersections[k];
        if (Math.hypot(A.x - B.x, A.z - B.z) < (A.radius + B.radius) * 0.8) {
          const legs = [...A.legs, ...B.legs];
          const n = legs.length;
          const x = (A.x + B.x) / 2, z = (A.z + B.z) / 2;
          // Re-aim outbound dirs at the merged center.
          for (const l of legs) {
            const S = samples.get(l.roadId).samples;
            const b = sampleAtStation(S, l.sTrim);
            const dx = b.x - x, dz = b.z - z, dl = Math.hypot(dx, dz) || 1;
            l.dirx = dx / dl; l.dirz = dz / dl;
          }
          const bearings = legs.map((l) => Math.atan2(l.dirx, -l.dirz)).sort((a, b) => a - b);
          let minAng = 360;
          for (let j = 0; j < bearings.length; j++) {
            let d = ((bearings[(j + 1) % bearings.length] - bearings[j]) * 180) / Math.PI;
            if (d < 0) d += 360;
            minAng = Math.min(minAng, d);
          }
          intersections[i] = {
            id: `x_${legs.map((l) => `${l.roadId}@${Math.round(l.sTrim)}`).sort().join('-')}`,
            x, z, y: (A.y + B.y) / 2, kind: n === 4 ? 'cross' : 'multi',
            legs, radius: Math.max(A.radius, B.radius),
            minAngleDeg: minAng, roads: [...new Set([...A.roads, ...B.roads])],
            cuts: [...(A.cuts || []), ...(B.cuts || [])],
          };
          intersections.splice(k, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  /* 7 ─ overpasses: cluster raw hits by location. */
  const overpasses = [];
  for (const o of overRaw) {
    const g = overpasses.find((gg) => gg.clusters.some(
      (c) => c.a.road === o.a.road && c.b.road === o.b.road && Math.hypot(c.x - o.x, c.z - o.z) < 2.5));
    if (g) g.clusters.push(o);
    else overpasses.push({clusters: [o]});
  }
  const overs = overpasses.map((g, i) => {
    const n = g.clusters.length;
    const x = g.clusters.reduce((a, o) => a + o.x, 0) / n;
    const z = g.clusters.reduce((a, o) => a + o.z, 0) / n;
    const gap = g.clusters.reduce((a, o) => a + o.gap, 0) / n;
    const first = g.clusters[0];
    const upperFirst = first.a.y >= first.b.y;
    const sUpper = g.clusters.reduce((a, o) => a + (upperFirst ? o.a.s : o.b.s), 0) / n;
    const sLower = g.clusters.reduce((a, o) => a + (upperFirst ? o.b.s : o.a.s), 0) / n;
    return {
      id: `o${i + 1}_${upperFirst ? first.a.road : first.b.road}x${upperFirst ? first.b.road : first.a.road}`,
      x, z, gap,
      upper: upperFirst ? first.a.road : first.b.road,
      lower: upperFirst ? first.b.road : first.a.road,
      sUpper, sLower,
    };
  });

  /* 8 ─ overrides: disabled intersections drop out (roads render uncut). */
  const overrides = (project.intersectionOverrides && typeof project.intersectionOverrides === 'object')
    ? project.intersectionOverrides : {};
  const active = intersections.filter((ix) => overrides[ix.id]?.enabled !== false);
  const disabled = intersections.filter((ix) => overrides[ix.id]?.enabled === false);
  const activeIds = new Set(active.map((ix) => ix.id));

  /* 9 ─ cuts (active intersections only) → runs (sample arrays per road). */
  const cutsByRoad = new Map(); // roadId → [{s0, s1}] normalized union
  for (const ix of active) {
    for (const c of ix.cuts || []) {
      const smp = samples.get(c.roadId);
      if (!smp) continue;
      const L = smp.length;
      let {s0, s1} = c;
      if (!(s1 > s0)) continue;
      if (!cutsByRoad.has(c.roadId)) cutsByRoad.set(c.roadId, []);
      const arr = cutsByRoad.get(c.roadId);
      if (smp.closed && (s0 < 0 || s1 > L)) {
        // Wrapped cut → two linear intervals.
        if (s0 < 0) { arr.push({s0: 0, s1: Math.min(L, s1)}); arr.push({s0: L + s0, s1: L}); }
        else { arr.push({s0: Math.max(0, s0), s1: L}); arr.push({s0: 0, s1: s1 - L}); }
      } else {
        arr.push({s0: Math.max(0, s0), s1: Math.min(L, s1)});
      }
    }
  }
  const runs = new Map();
  for (const r of roads) {
    const smp = samples.get(r.id);
    const S = smp.samples, L = smp.length;
    const cuts = (cutsByRoad.get(r.id) || [])
      .filter((c) => c.s1 - c.s0 > 0.05)
      .sort((a, b) => a.s0 - b.s0);
    // Union.
    const union = [];
    for (const c of cuts) {
      const u = union[union.length - 1];
      if (u && c.s0 <= u.s1 + 0.01) u.s1 = Math.max(u.s1, c.s1);
      else union.push({...c});
    }
    const out = [];
    let from = 0;
    for (const c of union) {
      if (c.s0 - from > 0.3) out.push([from, c.s0]);
      from = Math.max(from, c.s1);
    }
    if (L - from > 0.3) out.push([from, L]);
    runs.set(r.id, out.map(([a, b]) => {
      const arr = S.filter((p) => p.s >= a - 1e-6 && p.s <= b + 1e-6);
      // Pin exact boundary rows so ribbons meet the patch edge.
      const lo = sampleAtStation(S, a), hi = sampleAtStation(S, b);
      if (arr.length && Math.abs(arr[0].s - a) > 1e-4) arr.unshift({...lo});
      if (arr.length && Math.abs(arr[arr.length - 1].s - b) > 1e-4) arr.push({...hi});
      return arr;
    }).filter((arr) => arr.length >= 2));
  }

  /* 10 ─ bridge spans from flagged control points. */
  const bridges = [];
  for (const r of roads) {
    const eff = effectivePoints(project, r);
    const S = samples.get(r.id).samples;
    const flagged = eff.map((p, i) => (p.bridge ? i : -1)).filter((i) => i >= 0);
    if (!flagged.length) continue;
    // Maximal consecutive runs (≥2 points).
    let start = flagged[0], prev = flagged[0];
    const spans = [];
    for (let k = 1; k <= flagged.length; k++) {
      const cur = flagged[k];
      if (cur === prev + 1) { prev = cur; continue; }
      if (prev > start) spans.push([start, prev]);
      start = cur; prev = cur;
    }
    for (const [c0, c1] of spans) {
      const s0 = stationOfPoint(S, eff[c0].x, eff[c0].z);
      const s1 = stationOfPoint(S, eff[c1].x, eff[c1].z);
      if (s1 - s0 > 1) bridges.push({roadId: r.id, s0, s1, c0, c1});
    }
  }

  return {intersections: active, disabled, overpasses: overs, runs, bridges, cornerRadius,
    cuts: cutsByRoad, activeIds};
}

/**
 * Plan a one-click bridge span over an overpass: picks upper-road control
 * points (flagging existing ones, else planting new on-curve ones) so the
 * resulting span clears the lower road with abutment room. Pure — returns
 * operations for the caller to commit: {roadId, inserts, flags} with
 * inserts ascending by index and flags as post-insert indices. On failure
 * returns {error}.
 */
export function planOverpassBridge(project, samples, topo, overId) {
  const o = (topo?.overpasses || []).find((g) => g.id === overId);
  if (!o) return {error: 'Overpass not found — it may have moved.'};
  const upper = roadById(project, o.upper), lower = roadById(project, o.lower);
  const sU = samples.get(o.upper);
  if (!upper || !lower || !sU || sU.count < 2) return {error: 'Upper road unavailable.'};
  if (upper.closed) return {error: 'Loop bridges are not supported yet.'};
  const need = halfWidth(lower, 1) + 5; // clear the lower road + abutment room
  const L = sU.length;
  const s0 = Math.max(1, o.sUpper - need), s1 = Math.min(L - 1, o.sUpper + need);
  if (s1 - s0 < 4) return {error: 'No room for a bridge span here.'};
  for (const c of topo?.cuts?.get(o.upper) || []) {
    if (c.s0 < s1 - 1 && c.s1 > s0 + 1) return {error: 'Span would swallow a junction — flag points by hand.'};
  }
  const eff = effectivePoints(project, upper);
  const S = sU.samples;
  const st = eff.map((q) => stationOfPoint(S, q.x, q.z));
  // Existing consecutive run covering the span?
  for (let i = 0; i < eff.length; i++) {
    if (st[i] < s0 - 1 || st[i] > s1 + 1) continue;
    let j = i;
    while (j + 1 < eff.length && st[j + 1] >= s0 - 1 && st[j + 1] <= s1 + 1) j++;
    if (j > i && st[i] <= s0 + 1 && st[j] >= s1 - 1) {
      const flags = [];
      for (let k = i; k <= j; k++) flags.push(k);
      return {roadId: upper.id, inserts: [], flags, s0, s1};
    }
    i = j;
  }
  // Plant span ends on the curve, reusing near-coincident points (avoids
  // tight-spacing warnings from near-duplicate control points).
  const at = (s) => {
    const row = sampleAtStation(S, s);
    return {x: row.x, z: row.z, y: row.y, w: row.w || 1, bridge: true};
  };
  const ends = [s0, s1].map((s) => {
    let bi = -1, bd = 2.0;
    st.forEach((v, i) => { const d = Math.abs(v - s); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) return {reuse: bi};
    let idx = st.findIndex((v) => v > s);
    if (idx < 0) idx = st.length;
    return {insert: idx, point: at(s)};
  });
  const rawIns = ends.filter((e) => e.insert !== undefined).sort((a, b) => a.insert - b.insert);
  const inserts = rawIns.map((e, k) => ({index: e.insert + k, point: e.point}));
  const finalIdx = (e) => {
    if (e.insert !== undefined) {
      const k = rawIns.indexOf(e);
      return e.insert + k;
    }
    return e.reuse + rawIns.filter((r) => r.insert <= e.reuse).length;
  };
  const i0 = finalIdx(ends[0]), i1 = finalIdx(ends[1]);
  const flags = [];
  for (let k = Math.min(i0, i1); k <= Math.max(i0, i1); k++) flags.push(k);
  return {roadId: upper.id, inserts, flags, s0, s1};
}

/** Human label for an intersection kind. */
export function kindLabel(kind) {
  return {cross: '4-way cross', tee: 'T-junction', merge: 'Merge', wye: 'Wye', elbow: 'Elbow', multi: 'Multi-way'}[kind] || kind;
}
