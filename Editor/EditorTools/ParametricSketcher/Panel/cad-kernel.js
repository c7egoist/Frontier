/*
 * Frontier CAD kernel (browser prototype)
 *
 * This file is deliberately independent of the panel.  The panel supplies a
 * profile as a list of oriented control segments and receives a tessellated
 * view plus an analytic, stable B-rep.  It is not a polygon-modeling
 * fallback: vertices, edges, loops and faces are kept as topological objects
 * and the tessellation is only a presentation of those objects.
 *
 * The design follows the same invariants used by a solid modeller:
 *   - an edge has exactly two uses (one use for an open preview is rejected);
 *   - a face owns oriented loops, not an arbitrary triangle soup;
 *   - edge identity is feature-stable, rather than a generated mesh index;
 *   - a single selected edge is the only edge edited by a bevel/chamfer;
 *   - arcs remain analytic in the topology and are sampled only for display.
 */
(function (root) {
  'use strict';

  const EPS = 1e-8;
  const TAU = Math.PI * 2;

  const V = (x, y, z = 0) => [x, y, z];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, n) => [a[0] * n, a[1] * n, a[2] * n];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => { const l = len(a); return l > EPS ? mul(a, 1 / l) : [0, 0, 0]; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const key3 = p => p.map(v => Number(v).toFixed(7)).join(',');
  const area2 = P => {
    let a = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[(i + 1) % P.length];
      a += P[i][0] * q[1] - q[0] * P[i][1];
    }
    return a / 2;
  };

  function cloneSegment(s) {
    return { a: [s.a[0], s.a[1]], b: [s.b[0], s.b[1]], bulge: +s.bulge || 0, eid: s.eid, smooth: !!s.smooth, source: s.source };
  }

  function arcFromBulge(a, b, bulge) {
    if (!bulge || Math.hypot(b[0] - a[0], b[1] - a[1]) < EPS) return null;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const chord = Math.hypot(dx, dy);
    const sweep = 4 * Math.atan(bulge);
    const radius = chord / (2 * Math.sin(Math.abs(sweep) / 2));
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const h = radius * Math.cos(Math.abs(sweep) / 2) * (bulge > 0 ? 1 : -1);
    const c = [mx - dy / chord * h, my + dx / chord * h];
    return { c, r: Math.abs(radius), a0: Math.atan2(a[1] - c[1], a[0] - c[0]), sweep };
  }

  function sampleSegment(s, density = 10) {
    const A = s.a, B = s.b;
    const arc = arcFromBulge(A, B, s.bulge);
    if (!arc) return [[A[0], A[1]], [B[0], B[1]]];
    const n = Math.max(4, Math.ceil(Math.abs(arc.sweep) / (Math.PI / density)));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      out.push([arc.c[0] + Math.cos(arc.a0 + arc.sweep * t) * arc.r, arc.c[1] + Math.sin(arc.a0 + arc.sweep * t) * arc.r]);
    }
    out[0] = [A[0], A[1]];
    out[out.length - 1] = [B[0], B[1]];
    return out;
  }

  function reverseLoop(loop) {
    const out = [];
    for (let i = loop.segs.length - 1; i >= 0; i--) {
      const s = loop.segs[i];
      out.push({ a: [s.b[0], s.b[1]], b: [s.a[0], s.a[1]], bulge: -(s.bulge || 0), eid: s.eid, smooth: s.smooth, source: s.source });
    }
    return { ...loop, segs: out, hole: !loop.hole };
  }

  function loopSamples(loop, density = 10) {
    const pts = [];
    loop.segs.forEach((s, i) => {
      const S = sampleSegment(s, density);
      if (i) S.shift();
      pts.push(...S);
    });
    return pts;
  }

  // Ear clipping is used only to display planar cap faces.  Topological faces
  // still retain their boundary loop and are never inferred from these tris.
  function earClip(P) {
    if (!P || P.length < 3) return [];
    let Q = P.slice();
    if (area2(Q) < 0) Q.reverse();
    const I = Q.map((_, i) => i), out = [];
    const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const inside = (p, a, b, c) => cr(a, b, p) >= -EPS && cr(b, c, p) >= -EPS && cr(c, a, p) >= -EPS;
    let guard = 0;
    while (I.length > 3 && guard++ < 100000) {
      let cut = false;
      for (let i = 0; i < I.length; i++) {
        const a = Q[I[(i + I.length - 1) % I.length]], b = Q[I[i]], c = Q[I[(i + 1) % I.length]];
        if (cr(a, b, c) <= EPS) continue;
        let clear = true;
        for (const j of I) {
          if (j === I[(i + I.length - 1) % I.length] || j === I[i] || j === I[(i + 1) % I.length]) continue;
          if (inside(Q[j], a, b, c)) { clear = false; break; }
        }
        if (clear) { out.push([a, b, c]); I.splice(i, 1); cut = true; break; }
      }
      if (!cut) break;
    }
    if (I.length === 3) out.push([Q[I[0]], Q[I[1]], Q[I[2]]]);
    return out;
  }

  function bridgeHoles(outer, holes) {
    let P = outer.slice();
    (holes || []).slice().sort((a, b) => Math.max(...b.map(q => q[0])) - Math.max(...a.map(q => q[0]))).forEach(H => {
      if (!H.length) return;
      let hi = 0;
      for (let i = 1; i < H.length; i++) if (H[i][0] > H[hi][0]) hi = i;
      const hp = H[hi];
      let bi = 0, best = Infinity;
      P.forEach((q, i) => {
        const d = (q[0] - hp[0]) ** 2 + (q[1] - hp[1]) ** 2;
        if (q[0] >= hp[0] - EPS && d < best) { best = d; bi = i; }
      });
      const ring = [];
      for (let i = 0; i <= H.length; i++) ring.push(H[(hi + i) % H.length]);
      P = P.slice(0, bi + 1).concat(ring, [P[bi]], P.slice(bi + 1));
    });
    return P;
  }

  function normalizeLoops(raw) {
    if (!raw) return [];
    return raw.map((L, li) => {
      const segs = (L.segs || []).map(cloneSegment).filter(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > EPS || Math.abs(s.bulge) > EPS);
      let loop = { segs, hole: !!L.hole, source: li };
      const P = loopSamples(loop, 8);
      // Outer loops are CCW, holes CW.  This makes the outward normal and all
      // cap winding deterministic even when the sketch was drawn backwards.
      const wantPositive = !loop.hole;
      if (P.length > 2 && (area2(P) > 0) !== wantPositive) loop = reverseLoop(loop);
      return loop;
    }).filter(L => L.segs.length);
  }

  function parseKey(key) {
    const raw = String(key || '').replace(/^h\d+\./, '');
    if (raw === 'cap:top' || raw === 'top:all') return { region: 'top', id: 'all' };
    if (raw === 'cap:bot' || raw === 'bot:all') return { region: 'bot', id: 'all' };
    const m = /^(top|bot|side):([^:]+)(?::([^:]+))?$/.exec(raw);
    if (!m) return null;
    return { region: m[1], id: m[2], extra: m[3] };
  }

  function selected(editSet, eid) {
    return editSet.has('all') || editSet.has(String(eid));
  }

  function cornerFillet(segs, index, distance, type) {
    const n = segs.length, cur = segs[index], prev = segs[(index - 1 + n) % n];
    if (!cur || !prev || prev.bulge || cur.bulge) return segs;
    const q = cur.a, a = prev.a, b = cur.b;
    const la = Math.hypot(a[0] - q[0], a[1] - q[1]), lb = Math.hypot(b[0] - q[0], b[1] - q[1]);
    if (la < EPS || lb < EPS) return segs;
    const ua = [(a[0] - q[0]) / la, (a[1] - q[1]) / la];
    const ub = [(b[0] - q[0]) / lb, (b[1] - q[1]) / lb];
    const c = clamp(ua[0] * ub[0] + ua[1] * ub[1], -0.999999, 0.999999);
    const theta = Math.acos(c);
    const tanHalf = Math.tan(theta / 2);
    if (tanHalf < EPS) return segs;
    const d = Math.min(Math.max(distance, EPS), la * 0.49 * tanHalf, lb * 0.49 * tanHalf);
    const A = [q[0] + ua[0] * d / tanHalf, q[1] + ua[1] * d / tanHalf];
    const B = [q[0] + ub[0] * d / tanHalf, q[1] + ub[1] * d / tanHalf];
    const out = segs.map(cloneSegment);
    out[index - 1 < 0 ? n - 1 : index - 1].b = A;
    out[index].a = B;
    if (type === 'chamfer') {
      out.splice(index, 0, { a: A, b: B, bulge: 0, eid: `chamfer:${index}`, smooth: false, source: index });
    } else {
      const bis = unit([ua[0] + ub[0], ua[1] + ub[1], 0]);
      const r = d;
      const centerDistance = r / Math.max(Math.sin(theta / 2), EPS);
      const center = [q[0] + bis[0] * centerDistance, q[1] + bis[1] * centerDistance];
      let sweep = Math.atan2(B[1] - center[1], B[0] - center[0]) - Math.atan2(A[1] - center[1], A[0] - center[0]);
      while (sweep > Math.PI) sweep -= TAU;
      while (sweep < -Math.PI) sweep += TAU;
      const bulge = Math.tan(sweep / 4);
      out.splice(index, 0, { a: A, b: B, bulge, eid: `fillet:${index}`, smooth: true, source: index });
    }
    return out;
  }

  function offsetSample(A, B, inward, amount) {
    const d = unit([B[0] - A[0], B[1] - A[1], 0]);
    return [A[0] + -d[1] * inward * amount, A[1] + d[0] * inward * amount];
  }

  function cleanPolygon2D(P, tolerance = 1e-7) {
    const out = [];
    (P || []).forEach(q => {
      const p = [Number(q[0]), Number(q[1])];
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
      if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > tolerance) out.push(p);
    });
    if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tolerance) out.pop();
    let changed = true;
    while (changed && out.length > 3) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
        const cross2 = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cross2) <= tolerance) { out.splice(i, 1); changed = true; break; }
      }
    }
    return out;
  }

  function pointIn2D(p, P) {
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || EPS) + a[0]) inside = !inside;
    }
    return inside;
  }

  function booleanIntersections(a, b, c, d, tolerance) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0], q = [c[0] - a[0], c[1] - a[1]];
    const rr = r[0] * r[0] + r[1] * r[1], ss = s[0] * s[0] + s[1] * s[1];
    const out = [];
    const push = (t, u) => { if (t >= -tolerance && t <= 1 + tolerance && u >= -tolerance && u <= 1 + tolerance) out.push([clamp(t, 0, 1), clamp(u, 0, 1)]); };
    if (Math.abs(den) > tolerance) {
      push((q[0] * s[1] - q[1] * s[0]) / den, (q[0] * r[1] - q[1] * r[0]) / den);
      return out;
    }
    // Collinear edges need their overlap endpoints added to both split lists.
    if (Math.abs(q[0] * r[1] - q[1] * r[0]) <= tolerance) {
      if (rr > tolerance) {
        const t0 = ((c[0] - a[0]) * r[0] + (c[1] - a[1]) * r[1]) / rr;
        const t1 = ((d[0] - a[0]) * r[0] + (d[1] - a[1]) * r[1]) / rr;
        if (t0 >= -tolerance && t0 <= 1 + tolerance) push(t0, ss > tolerance ? ((a[0] + r[0] * t0 - c[0]) * s[0] + (a[1] + r[1] * t0 - c[1]) * s[1]) / ss : 0);
        if (t1 >= -tolerance && t1 <= 1 + tolerance) push(t1, ss > tolerance ? ((a[0] + r[0] * t1 - c[0]) * s[0] + (a[1] + r[1] * t1 - c[1]) * s[1]) / ss : 0);
      }
      if (ss > tolerance) {
        const u0 = ((a[0] - c[0]) * s[0] + (a[1] - c[1]) * s[1]) / ss;
        const u1 = ((b[0] - c[0]) * s[0] + (b[1] - c[1]) * s[1]) / ss;
        if (u0 >= -tolerance && u0 <= 1 + tolerance) push(rr > tolerance ? ((c[0] + s[0] * u0 - a[0]) * r[0] + (c[1] + s[1] * u0 - a[1]) * r[1]) / rr : 0, u0);
        if (u1 >= -tolerance && u1 <= 1 + tolerance) push(rr > tolerance ? ((c[0] + s[0] * u1 - a[0]) * r[0] + (c[1] + s[1] * u1 - a[1]) * r[1]) / rr : 0, u1);
      }
    }
    return out;
  }

  function analyticPoint2D(d, t) {
    t = clamp(t, 0, 1);
    if (!d || d.type === 'line') return [d.a[0] + (d.b[0] - d.a[0]) * t, d.a[1] + (d.b[1] - d.a[1]) * t];
    const a = (d.a0 || 0) + (d.sweep || 0) * t;
    if (d.type === 'ellipse') { const c = Math.cos(d.rot || 0), s = Math.sin(d.rot || 0), x = Math.cos(a) * d.rx, y = Math.sin(a) * d.ry; return [d.c[0] + x * c - y * s, d.c[1] + x * s + y * c]; }
    return [d.c[0] + Math.cos(a) * d.r, d.c[1] + Math.sin(a) * d.r];
  }

  function analyticSamples2D(d) {
    if (!d) return [];
    const n = d.type === 'line' ? 1 : Math.max(8, Math.ceil(Math.abs(d.sweep || TAU) / (Math.PI / 24)));
    const out = []; for (let i = 0; i <= n; i++) out.push(analyticPoint2D(d, i / n));
    return out;
  }

  function trimAnalytic2D(d, u0, u1) {
    if (!d) return null;
    if (d.type === 'line') return { type: 'line', a: analyticPoint2D(d, u0), b: analyticPoint2D(d, u1) };
    return { ...d, c: [d.c[0], d.c[1]], a0: (d.a0 || 0) + (d.sweep || 0) * u0, sweep: (d.sweep || 0) * (u1 - u0) };
  }

  function analyticPathFromEdges2D(edges) {
    const out = [], runs = [];
    const flush = run => { if (!run) return; out.push(trimAnalytic2D(run.d, run.u0, run.u1)); };
    edges.forEach(e => {
      if (!e.analytic) { flush(runs.pop()); out.push({ type: 'line', a: [e.a[0], e.a[1]], b: [e.b[0], e.b[1]] }); return; }
      const last = runs[runs.length - 1];
      if (last && last.key === e.analyticId && Math.abs(last.u1 - e.u0) <= 1e-5) last.u1 = e.u1;
      else { flush(runs.pop()); runs.push({ key: e.analyticId, d: e.analytic, u0: e.u0, u1: e.u1 }); }
    });
    flush(runs.pop());
    return out.filter(Boolean);
  }

  function boolean2D(polygons, operation = 'union') {
    const R = (polygons || []).map(p => Array.isArray(p) ? { outer: p, holes: [] } : p).map(r => ({ outer: cleanPolygon2D(r.outer), holes: (r.holes || []).map(h => cleanPolygon2D(h)).filter(h => h.length >= 3), analytic: r.analytic || null })).filter(r => r.outer.length >= 3);
    if (R.length < 2) return [];
    const bounds = R.flatMap(r => [r.outer, ...r.holes]).flat();
    const scale = Math.max(1, ...bounds.map(q => Math.max(Math.abs(q[0]), Math.abs(q[1]))));
    const tolerance = scale * 1e-8, probe = scale * 1e-7;
    const edges = [];
    R.forEach((region, owner) => {
      const addBoundary = (poly, path, hole) => {
        if (Array.isArray(path) && path.length) {
          path.forEach((d, di) => {
            const S = analyticSamples2D(d);
            for (let i = 0; i < S.length - 1; i++) edges.push({ a: S[i], b: S[i + 1], owner, ts: [0, 1], analytic: d, analyticId: `${owner}:${hole ? 'h' : 'o'}:${di}` , u0: i / (S.length - 1), u1: (i + 1) / (S.length - 1) });
          });
        } else poly.forEach((a, i) => edges.push({ a, b: poly[(i + 1) % poly.length], owner, ts: [0, 1], analytic: null, analyticId: null, u0: 0, u1: 1 }));
      };
      addBoundary(region.outer, region.analytic && region.analytic.outer, false);
      (region.holes || []).forEach((poly, i) => addBoundary(poly, region.analytic && region.analytic.holes && region.analytic.holes[i], true));
    });
    for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].owner === edges[j].owner) continue;
      booleanIntersections(edges[i].a, edges[i].b, edges[j].a, edges[j].b, tolerance).forEach(([t, u]) => { edges[i].ts.push(t); edges[j].ts.push(u); });
    }
    const insideResult = p => {
      const hit = R.map(region => pointIn2D(p, region.outer) && !region.holes.some(h => pointIn2D(p, h)));
      if (operation === 'intersection' || operation === 'intersect') return hit.every(Boolean);
      if (operation === 'subtract' || operation === 'difference') return !!hit[0] && !hit.slice(1).some(Boolean);
      if (operation === 'xor' || operation === 'exclusive') return hit.filter(Boolean).length % 2 === 1;
      return hit.some(Boolean);
    };
    const segments = new Map();
    const quant = p => `${Math.round(p[0] / tolerance)},${Math.round(p[1] / tolerance)}`;
    const addSegment = (a, b, meta) => {
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= tolerance) return;
      const ka = quant(a), kb = quant(b), key = `${ka}>${kb}`, reverse = `${kb}>${ka}`;
      if (segments.has(reverse)) { segments.delete(reverse); return; }
      if (!segments.has(key)) segments.set(key, { a: [a[0], a[1]], b: [b[0], b[1]], analytic: meta && meta.d, analyticId: meta && meta.id, u0: meta ? meta.u0 : 0, u1: meta ? meta.u1 : 1 });
    };
    edges.forEach(e => {
      const ts = [...new Set(e.ts.map(t => clamp(t, 0, 1)).sort((a, b) => a - b))];
      for (let i = 0; i < ts.length - 1; i++) {
        const t0 = ts[i], t1 = ts[i + 1];
        const a = [e.a[0] + (e.b[0] - e.a[0]) * t0, e.a[1] + (e.b[1] - e.a[1]) * t0];
        const b = [e.a[0] + (e.b[0] - e.a[0]) * t1, e.a[1] + (e.b[1] - e.a[1]) * t1];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = unit([b[0] - a[0], b[1] - a[1], 0]);
        const left = [mid[0] - d[1] * probe, mid[1] + d[0] * probe], right = [mid[0] + d[1] * probe, mid[1] - d[0] * probe];
        const L = insideResult(left), R = insideResult(right);
        if (L === R) continue;
        const u0 = e.u0 + (e.u1 - e.u0) * t0, u1 = e.u0 + (e.u1 - e.u0) * t1;
        if (L) addSegment(a, b, e.analytic ? { d: e.analytic, id: e.analyticId, u0, u1 } : null);
        else addSegment(b, a, e.analytic ? { d: e.analytic, id: e.analyticId, u0: u1, u1: u0 } : null);
      }
    });
    const list = [...segments.values()], byStart = new Map();
    list.forEach((s, i) => { const k = quant(s.a); if (!byStart.has(k)) byStart.set(k, []); byStart.get(k).push(i); });
    const used = new Set(), results = [];
    list.forEach((first, startIndex) => {
      if (used.has(startIndex)) return;
      const loop = [], loopEdges = [], start = quant(first.a); let i = startIndex, guard = 0;
      while (!used.has(i) && guard++ < list.length + 4) {
        used.add(i); const s = list[i]; loopEdges.push(s); if (!loop.length) loop.push(s.a); loop.push(s.b);
        const endKey = quant(s.b); if (endKey === start) break;
        const candidates = (byStart.get(endKey) || []).filter(n => !used.has(n));
        if (!candidates.length) break;
        if (candidates.length === 1) { i = candidates[0]; continue; }
        const prev = s.a, cur = s.b, incoming = Math.atan2(cur[1] - prev[1], cur[0] - prev[0]);
        i = candidates.slice().sort((x, y) => {
          const ax = Math.atan2(list[x].b[1] - cur[1], list[x].b[0] - cur[0]);
          const ay = Math.atan2(list[y].b[1] - cur[1], list[y].b[0] - cur[0]);
          const wrap = a => Math.abs(Math.atan2(Math.sin(a - incoming), Math.cos(a - incoming)));
          return wrap(ax) - wrap(ay);
        })[0];
      }
      if (loop.length > 3 && quant(loop[0]) === quant(loop[loop.length - 1])) {
        const clean = cleanPolygon2D(loop, tolerance * 4); if (Math.abs(area2(clean)) > tolerance * tolerance) results.push({ points: clean, path: analyticPathFromEdges2D(loopEdges) });
      }
    });
    results.sort((a, b) => Math.abs(area2(b.points)) - Math.abs(area2(a.points)));
    const loops = results.map(r => r.points); loops.paths = results.map(r => r.path); return loops;
  }

  class FrontierCadKernel {
    static boolean2D(polygons, operation = 'union') { return boolean2D(polygons, operation); }
    static mirror2D(points, a, b) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
      if (L < EPS) throw new Error('mirror axis has zero length');
      return (points || []).map(q => { const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L; const x = a[0] + dx * t, y = a[1] + dy * t; return [2 * x - q[0], 2 * y - q[1]]; });
    }

    static build(body, rawLoops, options = {}) {
      const loops0 = normalizeLoops(rawLoops);
      if (!loops0.length) return FrontierCadKernel.empty(body);
      const ops = options.faceOps || body.faceOps || [];
      const p = body.params || {};
      let height = Math.abs(+p.height || 0);
      if (height < EPS) return FrontierCadKernel.empty(body);
      const symmetric = !!p.sym;
      let zb = symmetric ? -height / 2 : Math.min(0, +p.height || 0);
      let zt = symmetric ? height / 2 : Math.max(0, +p.height || 0);
      const base = +p.base || 0;
      zb += base; zt += base;

      // A cap push is a parametric operation.  It changes the cap location,
      // not a random selection of display vertices.
      ops.forEach(o => {
        if (o.op !== 'push') return;
        const h = +o.h || 0, k = parseKey(o.face);
        if (!k) return;
        if (k.region === 'top') zt += h;
        if (k.region === 'bot') zb -= h;
      });
      // Moving a planar side face changes its supporting profile edge and its
      // two neighbouring vertices.  It is a feature edit, not a translation
      // of the rendered triangles and not polygon-model vertex dragging.
      ops.filter(o => o.op === 'push' && parseKey(o.face)?.region === 'side').forEach(o => {
        const k = parseKey(o.face), eid = String(k.id), h = +o.h || 0;
        loops0.forEach(L => {
          const i = L.segs.findIndex(s => String(s.eid) === eid);
          if (i < 0) return;
          const s = L.segs[i];
          if (s.bulge || Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) < EPS) return;
          const d = unit([s.b[0] - s.a[0], s.b[1] - s.a[1], 0]);
          const outward = [d[1] * h, -d[0] * h];
          const a = [s.a[0] + outward[0], s.a[1] + outward[1]], b = [s.b[0] + outward[0], s.b[1] + outward[1]];
          s.a = a; s.b = b;
          L.segs[(i + L.segs.length - 1) % L.segs.length].b = [a[0], a[1]];
          L.segs[(i + 1) % L.segs.length].a = [b[0], b[1]];
        });
      });
      if (zt < zb) [zb, zt] = [zt, zb];
      const H = zt - zb;
      const draft = Math.tan((+p.draft || 0) * Math.PI / 180);
      const edits = options.edits || body.edits || [];
      const editMaps = { top: new Map(), bot: new Map(), side: new Map() };
      edits.forEach(e => {
        const k = parseKey(e.key);
        if (!k) return;
        const map = editMaps[k.region];
        if (!map.has(k.id)) map.set(k.id, []);
        map.get(k.id).push({ ...e, amount: Math.max(EPS, +e.r || +e.d || 0), kind: e.type || 'fillet' });
      });

      const mesh = { tris: [], quads: [], lines: [], brep: { faces: [], edges: [], verts: [] }, meta: { kernel: 'FrontierBRep', version: 2 } };
      const faces = new Map(), edges = new Map(), vertices = new Map();
      const face = (key, kind) => { if (!faces.has(key)) faces.set(key, { key, kind, tris: [], loops: [] }); return faces.get(key); };
      const addEdge = (key, pts, tangent = false) => {
        if (!pts || pts.length < 2) return;
        if (!edges.has(key)) edges.set(key, { key, tangent: !!tangent, pts: [] });
        const e = edges.get(key);
        e.tangent = e.tangent && !!tangent;
        const P = pts.filter(Boolean).map(q => V(q[0], q[1], q[2] || 0));
        if (!e.pts.length) e.pts = P;
        else if (key3(e.pts[e.pts.length - 1]) === key3(P[0])) e.pts.push(...P.slice(1));
        else e.pts.push(null, ...P);
      };
      const addVertex = p3 => { const k = key3(p3); if (!vertices.has(k)) vertices.set(k, { id: vertices.size, p: V(p3[0], p3[1], p3[2]) }); };
      const addTri = (key, T) => { const t = T.map(q => V(q[0], q[1], q[2])); mesh.tris.push(Object.assign(t, { fkey: key })); face(key, faceKind(key)).tris.push(t); t.forEach(addVertex); };
      const addQuad = (key, P, normal, smooth = false, band = 0, kindOverride = null) => {
        const q = { p: P.map(x => V(x[0], x[1], x[2])), n: [normal || [0, 0, 1], normal || [0, 0, 1], normal || [0, 0, 1], normal || [0, 0, 1]], fkey: key, smooth, band };
        // A quad is stored once as presentation geometry.  Its two triangles
        // live in the owning face for topology/volume queries; they are not
        // also appended to mesh.tris (which would double-count the solid).
        if (normal && normal.length === 4) q.n = normal;
        mesh.quads.push(q);
        const F = face(key, kindOverride || faceKind(key));
        F.tris.push([q.p[0], q.p[1], q.p[2]], [q.p[0], q.p[2], q.p[3]]);
        q.p.forEach(addVertex);
      };
      const faceKind = key => {
        if (key === 'cap:top' || key === 'cap:bot' || /\.cap:/.test(key)) return 'plane';
        if (/fillet/.test(key)) return /arc/.test(key) ? 'torus' : 'cylinder';
        if (/chamfer/.test(key)) return /arc/.test(key) ? 'cone' : 'plane';
        return /arc/.test(key) ? (draft ? 'cone' : 'cylinder') : 'plane';
      };

      const capLoops = [];
      loops0.forEach((original, li) => {
        let loop = { ...original, segs: original.segs.map(cloneSegment) };
        // Vertical corner edits are profile operations, not a cap-loop-wide
        // bevel.  This is the important distinction that prevents one edge
        // from accidentally chamfering its neighbours.
        const sideEdits = edits.filter(e => {
          const k = parseKey(e.key); return k && k.region === 'side' && (k.id === String(li) || k.extra === String(li));
        });
        sideEdits.forEach(e => {
          const k = parseKey(e.key);
          const i = k && Number.isInteger(+k.extra) ? +k.extra : (k && Number.isInteger(+k.id) ? +k.id : -1);
          if (i >= 0 && i < loop.segs.length) loop.segs = cornerFillet(loop.segs, i, +e.r || +e.d || 0, e.type || 'fillet');
        });

        const winding = loop.hole ? -1 : 1;
        const sampleBySeg = loop.segs.map(s => sampleSegment(s, 12));
        const sourceTop = sampleBySeg.map((S, si) => S.map(q => V(q[0] + draft * (q[0]), q[1] + draft * q[1], zt)));
        const sourceBot = sampleBySeg.map(S => S.map(q => V(q[0], q[1], zb)));
        const topBoundary = [], botBoundary = [];
        const capBand = (which, S2, si, rg, isArc) => {
          const id = String(loop.segs[si].eid), selectedEdit = selected(editMaps[which], id) ? (editMaps[which].get(id) || [])[0] : null;
          if (!selectedEdit && !selected(editMaps[which], 'all')) return { top: S2, bottom: S2 };
          const E = selectedEdit || (editMaps[which].get('all') || [])[0];
          const r = Math.min(Math.max(E ? E.amount : 0, 0.01), H * 0.49);
          const isFillet = (E ? E.kind : 'fillet') === 'fillet';
          const pts0 = S2;
          const off = pts0.map((q, i) => {
            // Offset a single control segment.  Using the neighbouring
            // segment at a two-point line reverses the tangent at its second
            // endpoint and was the source of the old "bevel the wrong side"
            // artifact.  Lines use one constant tangent; arcs use their
            // local tangent.
            const prev = pts0[Math.max(0, i - 1)] || q;
            const next = pts0[Math.min(pts0.length - 1, i + 1)] || q;
            const dir = unit([next[0] - prev[0], next[1] - prev[1], 0]);
            const fallback = unit([pts0[pts0.length - 1][0] - pts0[0][0], pts0[pts0.length - 1][1] - pts0[0][1], 0]);
            const t = len(dir) > EPS ? dir : fallback;
            const amount = r;
            return [q[0] - t[1] * winding * amount, q[1] + t[0] * winding * amount, q[2]];
          });
          const prefix = rg ? `h${li}.` : '';
          const fk = `${prefix}${isFillet ? 'fillet' : 'chamfer'}:${which}:${id}`;
          const steps = isFillet ? 8 : 1;
          let prev = pts0.map(q => [q[0], q[1], which === 'top' ? zt - r : zb + r]);
          for (let j = 1; j <= steps; j++) {
            const t = j / steps;
            const phi = isFillet ? t * Math.PI / 2 : Math.PI / 2;
            const dz = isFillet ? r * Math.sin(phi) : r * t;
            const od = isFillet ? r * (1 - Math.cos(phi)) : r * t;
            const ring = pts0.map((q, i) => {
              const d = off[i];
              const x = q[0] + (d[0] - q[0]) * (od / Math.max(r, EPS));
              const y = q[1] + (d[1] - q[1]) * (od / Math.max(r, EPS));
              return [x, y, which === 'top' ? zt - r + dz : zb + r - dz];
            });
            const bandKind = isFillet ? (isArc ? 'torus' : 'cylinder') : (isArc ? 'cone' : 'plane');
            for (let i = 0; i < ring.length - 1; i++) addQuad(fk, [prev[i], prev[i + 1], ring[i + 1], ring[i]], null, isFillet, j, bandKind);
            addEdge(`${prefix}${which}:${id}`, ring, isFillet);
            prev = ring;
          }
          return { top: off, bottom: pts0 };
        };

        loop.segs.forEach((s, si) => {
          const rawTop = sourceTop[si], rawBot = sourceBot[si];
          const top = capBand('top', rawTop, si, loop.hole, !!s.bulge);
          const bot = capBand('bot', rawBot, si, loop.hole, !!s.bulge);
          // The unmodified wall and the part below a local bevel are one face.
          const topSelected = selected(editMaps.top, String(s.eid)) || selected(editMaps.top, 'all');
          const botSelected = selected(editMaps.bot, String(s.eid)) || selected(editMaps.bot, 'all');
          const bandAmount = (map, id) => (map.get(String(id)) || map.get('all') || [{}])[0].amount || (H * .49);
          const topR = topSelected ? Math.max(0.01, Math.min(bandAmount(editMaps.top, s.eid), H * .49)) : 0;
          const botR = botSelected ? Math.max(0.01, Math.min(bandAmount(editMaps.bot, s.eid), H * .49)) : 0;
          const S = sampleSegment(s, 12);
          const prefix = loop.hole ? `h${li}.` : '';
          const sid = `${prefix}side:${s.eid}`;
          const wallEnd = S.map((q, i) => V(q[0] + draft * q[0], q[1] + draft * q[1], zt - topR));
          const wallStart = S.map(q => V(q[0], q[1], zb + botR));
          const lower = wallStart.map((q, i) => [q[0], q[1], q[2]]);
          const upper = wallEnd.map((q, i) => [q[0], q[1], q[2]]);
          for (let i = 0; i < S.length - 1; i++) {
            const a = lower[i], b = lower[i + 1], c = upper[i + 1], d = upper[i];
            const n = unit(cross(sub(b, a), sub(d, a)));
            let normals = [n, n, n, n];
            if (s.bulge) {
              const A = arcFromBulge(s.a, s.b, s.bulge);
              if (A) {
                const radial = q => unit([q[0] - A.c[0], q[1] - A.c[1], 0]);
                const zSlope = draft;
                normals = [radial(a), radial(b), radial(c), radial(d)].map(r => unit([r[0], r[1], zSlope]));
                if (dot(normals[0], n) < 0) normals = normals.map(v => mul(v, -1));
              }
            }
            addQuad(sid, [a, b, c, d], normals, !!s.bulge, 0, s.bulge ? (draft ? 'cone' : 'cylinder') : 'plane');
          }
          // A local cap bevel meets neighbouring walls with two explicit
          // transition faces; no neighbouring edge is put in the edit set.
          if (topSelected || botSelected) {
            const capTop = topSelected ? top.top : rawTop;
            const capBot = botSelected ? bot.top : rawBot;
            if (topSelected) {
              const k = `${prefix}blend:top:${s.eid}`;
              // Two endpoint triangles close the local band into the two
              // neighbouring walls.  Do not add a second quad over the band:
              // that duplicate surface was the old kernel's volume bug.
              addTri(k, [upper[0], capTop[0], rawTop[0]]);
              addTri(k, [upper[upper.length - 1], rawTop[rawTop.length - 1], capTop[capTop.length - 1]]);
            }
            if (botSelected) {
              const k = `${prefix}blend:bot:${s.eid}`;
              addTri(k, [lower[0], rawBot[0], capBot[0]]);
              addTri(k, [lower[lower.length - 1], capBot[capBot.length - 1], rawBot[rawBot.length - 1]]);
            }
          }
          const capTop = topSelected ? top.top : rawTop;
          const capBot = botSelected ? bot.top : rawBot;
          topBoundary.push(...capTop.map((q, i) => i || si ? q : q));
          botBoundary.push(...capBot.map(q => q));
          const cornerKey = `${prefix}side:${li}:${si}`;
          if (!s.bulge && si === 0 || !s.bulge) addEdge(cornerKey, [lower[0], upper[0]], false);
          addEdge(`${prefix}top:${s.eid}`, capTop, !!((editMaps.top.get(String(s.eid)) || [])[0] && (editMaps.top.get(String(s.eid)) || [])[0].kind === 'fillet'));
          addEdge(`${prefix}bot:${s.eid}`, capBot, !!((editMaps.bot.get(String(s.eid)) || [])[0] && (editMaps.bot.get(String(s.eid)) || [])[0].kind === 'fillet'));
          // retain the control edge as a topological edge even for an arc;
          // only its presentation uses sampled points.
          capTop.forEach(addVertex); capBot.forEach(addVertex);
        });

        const loopTop = loopSamples({ ...loop, segs: loop.segs.map((s, i) => ({ ...s, a: [s.a[0] * (1 + draft), s.a[1] * (1 + draft)], b: [s.b[0] * (1 + draft), s.b[1] * (1 + draft)] })) }, 12).map(q => [q[0], q[1], zt]);
        const loopBot = loopSamples(loop, 12).map(q => [q[0], q[1], zb]);
        // Cap boundaries are built from sampled segments.  The local band
        // points above are used for the selected primitive; for an ordinary
        // primitive the source loop is exact enough for the display.
        const topCap = topBoundary.length ? topBoundary : loopTop;
        const botCap = botBoundary.length ? botBoundary : loopBot;
        capLoops.push({ loop, top: topCap, bot: botCap, hole: loop.hole, li });
      });

      const outers = capLoops.filter(L => !L.hole), holes = capLoops.filter(L => L.hole);
      const addCaps = (which, z, flip) => {
        const clean = P => {
          const out = [];
          (P || []).forEach(q => {
            const p2 = [q[0], q[1], q[2] || 0];
            if (!out.length || Math.hypot(p2[0] - out[out.length - 1][0], p2[1] - out[out.length - 1][1]) > EPS) out.push(p2);
          });
          if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < EPS) out.pop();
          let changed = true;
          while (changed && out.length > 3) {
            changed = false;
            for (let i = 0; i < out.length; i++) {
              const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
              const cross2 = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
              if (Math.abs(cross2) < EPS) { out.splice(i, 1); changed = true; break; }
            }
          }
          return out;
        };
        outers.forEach((O, oi) => {
          const hs = holes.filter(Hh => Hh.top.length && pointIn(Hh[which][0], O[which]));
          const outer = clean(O[which]).map(q => [q[0], q[1], z]);
          const inset = (ops.filter(o => o.op === 'inset' && parseKey(o.face)?.region === which)
            .map(o => Math.max(0, +o.d || 0)).filter(Boolean).pop()) || 0;
          let capOuter = outer;
          if (inset > EPS && capOuter.length > 2) {
            const inner = offsetPolygon(capOuter, inset, O.hole ? -1 : 1);
            const ringKey = `inset:${which}:${oi}`;
            for (let i = 0; i < capOuter.length; i++) {
              const j = (i + 1) % capOuter.length;
              addQuad(ringKey, [capOuter[i], capOuter[j], inner[j], inner[i]], [0, 0, flip ? -1 : 1], false, 0, 'plane');
            }
            addEdge(`${ringKey}:boundary`, inner, false);
            capOuter = inner;
          }
          const outer2 = capOuter.map(q => [q[0], q[1]]);
          const holePts = hs.map(Hh => clean(Hh[which]).map(q => [q[0], q[1]]));
          const tris = earClip(bridgeHoles(outer2, holePts));
          const fk = `cap:${which}`;
          tris.forEach(t => {
            const tri = t.map(q => [q[0], q[1], z]);
            addTri(fk, flip ? [tri[1], tri[0], tri[2]] : tri);
          });
          face(fk, 'plane').loops.push({ outer: capOuter, holes: hs.map(Hh => Hh[which]) });
          addEdge(`cap:${which}:boundary:${oi}`, capOuter, false);
        });
      };
      addCaps('top', zt, false);
      addCaps('bot', zb, true);

      // Convert the topological edge curves to the presentation line cache.
      // This is the only place where B-rep edges become raster segments.
      edges.forEach(e => {
        e.pts = e.pts.filter((q, i, a) => q === null || i === 0 || a[i - 1] === null || key3(q) !== key3(a[i - 1]));
        let prev = null;
        e.pts.forEach(q => {
          if (q && prev) { const line = [prev, q]; line.tangent = !!e.tangent; mesh.lines.push(line); }
          prev = q;
        });
      });
      mesh.brep.faces = [...faces.values()].map((F, id) => ({ id, key: F.key, kind: F.kind, tris: F.tris, loops: F.loops }));
      mesh.brep.edges = [...edges.values()].map((e, id) => ({ id, key: e.key, tangent: !!e.tangent, pts: e.pts }));
      mesh.brep.verts = [...vertices.values()].map((v, id) => ({ id, p: v.p }));
      return mesh;
    }

    static empty(body) {
      return { tris: [], quads: [], lines: [], brep: { faces: [], edges: [], verts: [] }, meta: { kernel: 'FrontierBRep', version: 2, invalid: true } };
    }

    // Kept as a public operation so the panel never has to mutate a mesh.
    // Rebuilding from the feature history gives the operation stable topology.
    static applyFaceOps(body, loops, faceOps, overrides = {}) {
      return FrontierCadKernel.build(body, loops, { ...overrides, faceOps: faceOps || body.faceOps || [], edits: overrides.edits || body.edits || [] });
    }

    static audit(mesh) {
      const errors = [];
      if (!mesh || !mesh.brep) return ['missing B-rep'];
      if (!mesh.brep.faces.length || !mesh.brep.edges.length) errors.push('solid has no faces or edges');
      const edgeKeys = new Set();
      mesh.brep.edges.forEach(e => {
        if (edgeKeys.has(e.key)) errors.push(`duplicate edge key ${e.key}`);
        edgeKeys.add(e.key);
        if (!e.pts || e.pts.filter(Boolean).length < 2) errors.push(`edge has no geometry ${e.key}`);
      });
      mesh.brep.faces.forEach(F => (F.tris || []).forEach(T => {
        if (T.length !== 3 || T.some(q => !q || q.some(v => !Number.isFinite(v)))) errors.push(`invalid triangle on ${F.key}`);
        else if (len(cross(sub(T[1], T[0]), sub(T[2], T[0]))) < EPS) errors.push(`degenerate triangle on ${F.key}`);
      }));
      const tris = [...(mesh.tris || [])];
      (mesh.quads || []).forEach(q => { tris.push([q.p[0], q.p[1], q.p[2]], [q.p[0], q.p[2], q.p[3]]); });
      let volume = 0;
      tris.forEach(T => { volume += dot(T[0], cross(T[1], T[2])) / 6; });
      if (!(Math.abs(volume) > EPS)) errors.push('solid has zero signed volume');
      return errors;
    }
  }

  function offsetPolygon(P, distance, winding) {
    const out = [];
    const lineIntersect = (a, d, b, e) => {
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < EPS) return null;
      const t = ((b[0] - a[0]) * e[1] - (b[1] - a[1]) * e[0]) / den;
      return [a[0] + d[0] * t, a[1] + d[1] * t, a[2] || 0];
    };
    for (let i = 0; i < P.length; i++) {
      const A = P[(i + P.length - 1) % P.length], B = P[i], C = P[(i + 1) % P.length];
      const d1 = unit([B[0] - A[0], B[1] - A[1], 0]), d2 = unit([C[0] - B[0], C[1] - B[1], 0]);
      const n1 = [-d1[1] * winding * distance, d1[0] * winding * distance, 0];
      const n2 = [-d2[1] * winding * distance, d2[0] * winding * distance, 0];
      const X = lineIntersect([A[0] + n1[0], A[1] + n1[1], A[2] || 0], d1, [B[0] + n2[0], B[1] + n2[1], B[2] || 0], d2);
      out.push(X || [B[0] + n1[0], B[1] + n1[1], B[2] || 0]);
    }
    return out;
  }

  function pointIn(p, P) {
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / ((b[1] - a[1]) || EPS) + a[0]) inside = !inside;
    }
    return inside;
  }

  root.FrontierCadKernel = FrontierCadKernel;
  root.FrontierCadKernelMath = { area2, arcFromBulge, sampleSegment, normalizeLoops, key3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = { FrontierCadKernel, math: root.FrontierCadKernelMath };
})(typeof globalThis !== 'undefined' ? globalThis : window);
