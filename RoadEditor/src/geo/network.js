// Network build: project data -> alignments, junction hubs, road spans, features, plan primitives
// and warnings. Pure geometry (no DOM, no three.js) so it runs in node tests and in the browser.

import { buildCurve, curveSlice, stationAt } from './curve.js';
import { MeshBuilder } from './mesh.js';
import { buildHub } from './junction.js';
import { bandTableMax, bridgeWeight, roadBands, sectionStrips, stationState, TAPER } from './profile.js';
import { bridgePiers, drainageFor, guardrailFor, markingsFor } from './features.js';
import { orientPositive, triangulate } from './clipper.js';
import { crotchRequirements } from './angles.js';

export const CLEARANCE_OK = 2.5; // m, below this a crossing is flagged

export function pavingKey(road) {
  return `paving:${road.pattern}:${road.colour}`;
}

const zeroBands = () => ({ g: 0, k: 0, f: 0, v: 0, kh: 0 });

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const d1x = bx - ax;
  const d1z = bz - az;
  const d2x = dx - cx;
  const d2z = dz - cz;
  const den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((cx - ax) * d2z - (cz - az) * d2x) / den;
  const u = ((cx - ax) * d1z - (cz - az) * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: ax + d1x * t, z: az + d1z * t };
}

/** plan crossings between roads that do not share a junction */
function findCrossings(roads, curves, ctxOf, project, warnings) {
  const out = [];
  const J = new Map(project.junctions.map((j) => [j.id, j]));
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const A = roads[i];
      const B = roads[j];
      if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
      const ca = curves.get(A.id);
      const cb = curves.get(B.id);
      const box = (c) => {
        let x0 = Infinity;
        let x1 = -Infinity;
        let z0 = Infinity;
        let z1 = -Infinity;
        for (let k = 0; k < c.n; k++) {
          x0 = Math.min(x0, c.x[k]);
          x1 = Math.max(x1, c.x[k]);
          z0 = Math.min(z0, c.z[k]);
          z1 = Math.max(z1, c.z[k]);
        }
        return [x0, x1, z0, z1];
      };
      const ba = box(ca);
      const bb = box(cb);
      if (ba[1] < bb[0] || bb[1] < ba[0] || ba[3] < bb[2] || bb[3] < ba[2]) continue;
      let hit = null;
      for (let p = 0; p < ca.n - 1 && !hit; p++) {
        const ax0 = ca.x[p];
        const az0 = ca.z[p];
        const ax1 = ca.x[p + 1];
        const az1 = ca.z[p + 1];
        if (Math.max(ax0, ax1) < bb[0] || Math.min(ax0, ax1) > bb[1]) continue;
        if (Math.max(az0, az1) < bb[2] || Math.min(az0, az1) > bb[3]) continue;
        for (let q = 0; q < cb.n - 1; q++) {
          const hx = segIntersect(ax0, az0, ax1, az1, cb.x[q], cb.z[q], cb.x[q + 1], cb.z[q + 1]);
          if (hx) {
            const ya = ca.y[p] + (ca.y[p + 1] - ca.y[p]) * hx.t;
            const sb = cb.s[q] + (cb.s[q + 1] - cb.s[q]) * hx.u;
            const yb = stationAt(cb, sb).y;
            hit = { x: hx.x, z: hx.z, ya, yb, sa: ca.s[p] + (ca.s[p + 1] - ca.s[p]) * hx.t, sb };
            break;
          }
        }
      }
      if (!hit) continue;
      const upper = hit.ya >= hit.yb ? A : B;
      const upperDep = upper.bridge && upper.bridge.on ? upper.bridge.depth || 0 : 0;
      const clearance = Math.abs(hit.ya - hit.yb) - upperDep;
      const entry = { x: hit.x, z: hit.z, a: A.id, b: B.id, clearance: Math.round(clearance * 100) / 100 };
      out.push(entry);
      const where = `(${hit.x.toFixed(1)}, ${hit.z.toFixed(1)})`;
      if (clearance < 0.5) {
        warnings.push({ level: 'error', text: `${A.id} and ${B.id} cross at ${where} with no junction or grade separation` });
      } else if (clearance < CLEARANCE_OK) {
        warnings.push({ level: 'warn', text: `${A.id} and ${B.id} cross at ${where}, clearance ${clearance.toFixed(2)} m (below ${CLEARANCE_OK} m)` });
      }
    }
  }
  void J;
  void ctxOf;
  return out;
}

/**
 * Build everything. Returns {chunks, plan, warnings, curves, ctxOf, stats}.
 * project must be normalised (see model/project.js).
 */
export function buildNetwork(project) {
  const mb = new MeshBuilder();
  const warnings = [];
  const plan = {
    roads: [],
    centres: [],
    hubs: [],
    marks: [],
    guards: [],
    drains: [],
    piers: [],
    areas: [],
    crossings: [],
  };
  const J = new Map(project.junctions.map((j) => [j.id, j]));
  const roads = [];
  const curves = new Map();
  for (const r of project.roads) {
    const A = J.get(r.a);
    const B = J.get(r.b);
    if (!A || !B) {
      warnings.push({ level: 'error', text: `${r.id}: missing junction ${!A ? r.a : r.b}` });
      continue;
    }
    if (A.id === B.id) {
      warnings.push({ level: 'error', text: `${r.id}: both ends are ${A.id}` });
      continue;
    }
    const nodes = [
      { x: A.x, y: A.y ?? 0, z: A.z },
      ...r.ctrl.map((c) => ({ x: c.x, y: c.y ?? null, z: c.z })),
      { x: B.x, y: B.y ?? 0, z: B.z },
    ];
    try {
      curves.set(r.id, buildCurve(nodes));
      roads.push(r);
    } catch (e) {
      warnings.push({ level: 'error', text: `${r.id}: ${e.message}` });
    }
  }

  const armsOf = new Map(project.junctions.map((j) => [j.id, []]));
  for (const r of roads) {
    armsOf.get(r.a).push({ road: r, end: 'a' });
    armsOf.get(r.b).push({ road: r, end: 'b' });
  }
  const bandsOf = new Map();
  for (const j of project.junctions) {
    const list = armsOf.get(j.id) || [];
    bandsOf.set(j.id, list.length ? bandTableMax(list.map((x) => roadBands(x.road))) : zeroBands());
  }

  // mouth distance per road end. The default reach covers the hub; neighbours that leave at a narrow
  // angle need more road so their crotch fillet fits inside the hub (geo/angles.js)
  const mouth = new Map();
  for (const j of project.junctions) {
    const list = armsOf.get(j.id) || [];
    if (!list.length) continue;
    const bj = bandsOf.get(j.id);
    const d4 = bj.g + bj.k + bj.f + bj.v;
    const maxW = Math.max(...list.map((x) => Math.max(x.road.lanesL, x.road.lanesR) * x.road.laneW));
    const reach = 1.5 * (j.radius ?? 6) + d4 + maxW + 3;
    const arms = list.map(({ road, end }) => {
      const curve = curves.get(road.id);
      return { road, end, curve, L: curve.length, W: { L: road.lanesL * road.laneW, R: road.lanesR * road.laneW } };
    });
    const need = crotchRequirements(arms, bj, j.radius ?? 6);
    for (const a of arms) {
      const D0 = Math.min(reach, 0.45 * a.L);
      const cap = 0.8 * a.L;
      const nd = need.get(`${a.road.id}|${a.end}`) || { req: 0 };
      mouth.set(`${a.road.id}|${a.end}`, Math.max(D0, Math.min(nd.req, cap)));
      if (nd.req > cap + 1e-6) {
        const text = nd.req === Infinity
          ? `${a.road.id} and ${nd.partner} leave ${j.id} in the same direction; merge them into one road`
          : `${a.road.id} and ${nd.partner} leave ${j.id} ${nd.angle.toFixed(0)} degrees apart and need ${nd.req.toFixed(0)} m of road, but ${a.road.id} is ${a.L.toFixed(0)} m. Lengthen it, open the angle or reduce the corner radius`;
        warnings.push({ level: nd.req === Infinity ? 'error' : 'warn', text });
      } else if (D0 < reach * 0.98) {
        warnings.push({ level: 'warn', text: `${a.road.id} is short for junction ${j.id}; blend shortened to ${D0.toFixed(1)} m` });
      }
    }
  }

  const ctxOf = new Map();
  for (const r of roads) {
    const curve = curves.get(r.id);
    const L = curve.length;
    ctxOf.set(r.id, {
      L,
      Da: mouth.get(`${r.id}|a`),
      Db: mouth.get(`${r.id}|b`),
      jA: bandsOf.get(r.a),
      jB: bandsOf.get(r.b),
      yA: J.get(r.a).y ?? 0,
      yB: J.get(r.b).y ?? 0,
      taper: Math.min(TAPER, 0.25 * L),
    });
  }

  // road spans and their features
  for (const r of roads) {
    const curve = curves.get(r.id);
    const ctx = ctxOf.get(r.id);
    const owner = `R:${r.id}`;
    plan.centres.push({ id: r.id, pts: Array.from({ length: curve.n }, (_, k) => [curve.x[k], curve.z[k]]) });
    const s0 = ctx.Da;
    const s1 = ctx.L - ctx.Db;
    if (s1 - s0 < 0.2) {
      // the two junction hubs meet or overlap along this road: there is no span to build, and the hubs
      // carry the surface. Only warn when the overlap is more than a couple of metres.
      const need = ctx.L - (s1 - s0) + 0.2;
      if (need - ctx.L > 2) {
        warnings.push({ level: 'warn', text: `${r.id} is ${ctx.L.toFixed(0)} m long but its two junctions need ${need.toFixed(0)} m, so they merge along it. Lengthen ${r.id} for a separate span` });
      }
      continue;
    }
    emitSpan(mb, plan, r, curve, ctx);
    markingsFor(r, curve, ctx, mb, owner, plan);
    guardrailFor(r, curve, ctx, mb, owner, plan);
    drainageFor(r, curve, ctx, mb, owner, plan);
    bridgePiers(r, curve, ctx, mb, owner, plan);
  }

  // junction hubs
  for (const j of project.junctions) {
    const list = armsOf.get(j.id) || [];
    if (!list.length) {
      warnings.push({ level: 'warn', text: `${j.id} has no roads attached` });
      continue;
    }
    const hubArms = list.map(({ road, end }) => {
      const curve = curves.get(road.id);
      const ctx = ctxOf.get(road.id);
      const D = end === 'a' ? ctx.Da : ctx.Db;
      const sMouth = end === 'a' ? D : ctx.L - D;
      return {
        road,
        end,
        curve,
        L: ctx.L,
        D,
        W: { L: road.lanesL * road.laneW, R: road.lanesR * road.laneW },
        // a deck only counts as an arm bridge when its underside clears the ground at the mouth
        bridged: bridgeWeight(road, sMouth, ctx.L) > 0.5 && (J.get(end === 'a' ? road.a : road.b).y ?? 0) - (road.bridge.depth || 0) > 0.3,
        bridgeDepth: road.bridge.depth || 0,
      };
    });
    const footRoad = [...list]
      .map((x) => x.road)
      .filter((r) => r.footway > 0)
      .sort((p, q) => (p.id < q.id ? -1 : 1))[0];
    const footMat = footRoad ? pavingKey(footRoad) : 'footway';
    const res = buildHub(j, hubArms, bandsOf.get(j.id), mb, { owner: `J:${j.id}`, footwayMat: footMat });
    for (const pr of res.planRings) plan.hubs.push({ mat: pr.mat === 'footway' ? footMat : pr.mat, rings: pr.rings });
    for (const w of res.warnings) warnings.push({ level: 'warn', text: w });
  }

  // paving areas (plazas)
  for (const a of project.areas || []) {
    if (!a.pts || a.pts.length < 3) continue;
    const poly = orientPositive(a.pts.map((p) => [p[0], p[1]]));
    const mat = `paving:${a.pattern}:${a.colour}`;
    const t = triangulate(poly, []);
    for (const [i0, i1, i2] of t.tris) {
      const p0 = t.verts[i0];
      const p1 = t.verts[i1];
      const p2 = t.verts[i2];
      mb.tri(mat, `A:${a.id}`, [p0[0], a.y ?? 0, p0[1]], [p1[0], a.y ?? 0, p1[1]], [p2[0], a.y ?? 0, p2[1]]);
    }
    plan.areas.push({ mat, poly });
  }

  plan.crossings = findCrossings(roads, curves, ctxOf, project, warnings);

  return {
    chunks: mb.chunks(),
    plan,
    warnings,
    curves,
    ctxOf,
    stats: {
      triangles: mb.triCount,
      skipped: mb.skipped,
      roads: roads.length,
      junctions: project.junctions.length,
    },
  };
}

function emitSpan(mb, plan, road, curve, ctx) {
  const owner = `R:${road.id}`;
  const sts = curveSlice(curve, ctx.Da, ctx.L - ctx.Db);
  const states = sts.map((st) => stationState(curve, ctx, road, st.s, st));
  const strips = states.map((S) => sectionStrips(road, S));
  const nS = sts.length;
  const nQ = strips[0].length;
  const pt = (st, l, h) => [st.x + st.nx * l, h, st.z + st.nz * l];
  const matOf = (m) => (m === 'footway' ? pavingKey(road) : m);
  for (let k = 0; k < nS - 1; k++) {
    for (let q = 0; q < nQ; q++) {
      const A = strips[k][q];
      const B = strips[k + 1][q];
      const mat = matOf(A.mat);
      // deck strips only exist where the road is bridged on both stations of the quad
      if (A.mat === 'deck' && (states[k].bridgeW < 1e-3 || states[k + 1].bridgeW < 1e-3)) continue;
      for (let i = 0; i < A.pts.length - 1; i++) {
        const p0 = A.pts[i];
        const p1 = A.pts[i + 1];
        const q0 = B.pts[i];
        const q1 = B.pts[i + 1];
        mb.quad(mat, owner, pt(sts[k], p0[0], p0[1]), pt(sts[k], p1[0], p1[1]), pt(sts[k + 1], q1[0], q1[1]), pt(sts[k + 1], q0[0], q0[1]));
      }
    }
  }
  for (let q = 0; q < nQ; q++) {
    // the underside of a deck is not visible from above; skip it in plan
    if (strips[0][q].mat === 'deck' || strips[0][q].mat === 'retain') continue;
    for (let i = 0; i < strips[0][q].pts.length - 1; i++) {
      const left = sts.map((st, k) => {
        const p = strips[k][q].pts[i + 1];
        return [st.x + st.nx * p[0], st.z + st.nz * p[0]];
      });
      const right = sts
        .map((st, k) => {
          const p = strips[k][q].pts[i];
          return [st.x + st.nx * p[0], st.z + st.nz * p[0]];
        })
        .reverse();
      plan.roads.push({ mat: matOf(strips[0][q].mat), owner, poly: left.concat(right) });
    }
  }
}
