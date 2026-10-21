/* ════════════════════════════════════════════════════════════════════
   validate.js — design checks for the road network (pure, no DOM).
   Thresholds mirror the help text: radius <15 warn / <7 error,
   grade >8% warn / >12% error, plus crossings and data hygiene.
   ════════════════════════════════════════════════════════════════════ */
import {sampleRoad, segmentsTouch} from './spline.js';
import {buildTopology, gridPairs} from './topology.js';
import {effectivePoints} from './state.js';

export const LIMITS = {
  radiusWarn: 15, radiusErr: 7,
  gradeWarn: 0.08, gradeErr: 0.12,
  minPointGap: 0.5, dupGap: 0.05,
  endTouchGuard: 0.6,   // touches this close to both roads' control endpoints don't warn
  maxPairTests: 400000, // per road-pair segment-test budget
  minJunctionAngle: 25, // tighter approach angles warn
  minClearance: 4.5,    // overpass gaps below this warn
  maxIssues: 240
};

function checkRoad(project, road, issues) {
  const name = road.name || road.id;
  const pts = road.points || [];
  if (pts.length < 2) {
    issues.push(mk('error', 'too-few-points', road.id, name, 0,
      pts[0]?.x ?? 0, pts[0]?.z ?? 0, pts[0]?.y ?? 0,
      `<b>${name}</b> needs at least 2 control points.`));
    return null;
  }
  // Duplicate / stacked control points.
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (d < LIMITS.dupGap) {
      issues.push(mk('error', 'duplicate-point', road.id, name, 0, pts[i].x, pts[i].z, pts[i].y,
        `<b>${name}</b> has stacked points (#${i}–#${i + 1}); the curve is pinched there.`));
    } else if (d < LIMITS.minPointGap) {
      issues.push(mk('warn', 'tight-spacing', road.id, name, 0, pts[i].x, pts[i].z, pts[i].y,
        `<b>${name}</b> points #${i}–#${i + 1} are ${d.toFixed(2)} m apart — under ${LIMITS.minPointGap} m.`));
    }
  }
  if ((road.lanes * road.laneWidth) <= 0) {
    issues.push(mk('error', 'no-width', road.id, name, 0, pts[0].x, pts[0].z, pts[0].y,
      `<b>${name}</b> has no carriageway width (lanes × width ≤ 0).`));
  }
  const smp = sampleRoad(pts, {closed: road.closed, step: 1.0});
  if (!smp.count) return null;

  // Tight curves — report the worst few local minima, spaced apart.
  const spots = [];
  const S = smp.samples;
  for (let i = 1; i < S.length - 1; i++) {
    const r = S[i].radius;
    if (!Number.isFinite(r) || r >= LIMITS.radiusWarn) continue;
    if (S[i - 1].radius <= r || S[i + 1].radius < r) continue; // not a local minimum
    spots.push(S[i]);
  }
  spots.sort((a, b) => a.radius - b.radius);
  const kept = [];
  for (const sp of spots) {
    if (kept.length >= 3) break;
    if (kept.every((k) => Math.abs(k.s - sp.s) > 12)) kept.push(sp);
  }
  for (const sp of kept) {
    const sev = sp.radius < LIMITS.radiusErr ? 'error' : 'warn';
    issues.push(mk(sev, 'tight-curve', road.id, name, sp.s, sp.x, sp.z, sp.y,
      `<b>${name}</b> curve radius <b>${sp.radius.toFixed(1)} m</b> at s=${sp.s.toFixed(0)} m${sev === 'error' ? ' — under the 7 m minimum' : ''}.`));
  }

  // Steep grades — worst few local maxima, spaced apart.
  const gspots = [];
  for (let i = 1; i < S.length - 1; i++) {
    const g = Math.abs(S[i].grade);
    if (g < LIMITS.gradeWarn) continue;
    if (Math.abs(S[i - 1].grade) >= g || Math.abs(S[i + 1].grade) > g) continue;
    gspots.push(S[i]);
  }
  gspots.sort((a, b) => Math.abs(b.grade) - Math.abs(a.grade));
  const gkept = [];
  for (const sp of gspots) {
    if (gkept.length >= 3) break;
    if (gkept.every((k) => Math.abs(k.s - sp.s) > 15)) gkept.push(sp);
  }
  for (const sp of gkept) {
    const g = Math.abs(sp.grade);
    const sev = g > LIMITS.gradeErr ? 'error' : 'warn';
    issues.push(mk(sev, 'steep-grade', road.id, name, sp.s, sp.x, sp.z, sp.y,
      `<b>${name}</b> grade <b>${(g * 100).toFixed(1)}%</b> at s=${sp.s.toFixed(0)} m${sev === 'error' ? ' — over the 12% maximum' : ''}.`));
  }

  // Self-intersection (non-adjacent spans, tolerant of node touches).
  const n = S.length, closed = !!road.closed;
  const spanEnd = closed ? n : n - 1;
  let selfFound = 0;
  for (const [i, k] of gridPairs(S, spanEnd, S, spanEnd, true, closed)) {
    if (selfFound >= 2) break;
    const a = S[i % n], b = S[(i + 1) % n];
    const hit = segmentsTouch(a, b, S[k % n], S[(k + 1) % n], 1e-6);
    if (hit) {
      selfFound++;
      issues.push(mk('error', 'self-crossing', road.id, name, a.s, hit.x, hit.z, a.y,
        `<b>${name}</b> crosses itself near (${hit.x.toFixed(1)}, ${hit.z.toFixed(1)}).`));
    }
  }
  return smp;
}

/** Full project validation. Returns issues sorted error → warn → info.
 * Pass main's topology to reuse crossing detection; otherwise it is built. */
let issueSeq = 1;

function mk(sev, code, road, roadName, idx, x, z, y, text) {
  return {id: `is${issueSeq++}`, severity: sev, code, road, roadName, idx, x, z, y, text};
}

export function validateProject(project, topo = null) {
  const issues = [];
  for (const road of project.roads || []) {
    checkRoad(project, road, issues);
    if (issues.length > LIMITS.maxIssues) break;
  }
  const nameOf = (id) => (project.roads || []).find((r) => r.id === id)?.name || id || '—';

  // Topology-driven network checks (crossings auto-resolve into intersections;
  // only bad geometry warns now).
  let tp = topo;
  if (!tp) {
    const smp = new Map();
    for (const road of project.roads || []) {
      smp.set(road.id, sampleRoad(effectivePoints(project, road), {closed: road.closed, step: 1.0}));
    }
    tp = buildTopology(project, smp);
  }
  for (const ix of tp.intersections) {
    if (ix.kind !== 'merge' && ix.minAngleDeg < LIMITS.minJunctionAngle) {
      issues.push(mk('warn', 'intersection-angle', ix.roads[0] || null, nameOf(ix.roads[0]), 0,
        ix.x, ix.z, ix.y,
        `Approach angle <b>${ix.minAngleDeg.toFixed(0)}°</b> at the ${ix.kind} — under ${LIMITS.minJunctionAngle}° pinches turning paths.`));
    }
  }
  for (const o of tp.overpasses) {
    if (o.gap < LIMITS.minClearance) {
      issues.push(mk('warn', 'low-clearance', o.upper, nameOf(o.upper), o.sUpper,
        o.x, o.z, 0,
        `<b>${nameOf(o.upper)}</b> clears <b>${nameOf(o.lower)}</b> by <b>${o.gap.toFixed(1)} m</b> — under ${LIMITS.minClearance} m.`));
    }
    const spanned = tp.bridges.some((b) => b.roadId === o.upper && b.s0 - 2 <= o.sUpper && o.sUpper <= b.s1 + 2);
    if (!spanned) {
      issues.push(mk('info', 'overpass-span', o.upper, nameOf(o.upper), o.sUpper,
        o.x, o.z, 0,
        `<b>${nameOf(o.upper)}</b> flies over <b>${nameOf(o.lower)}</b> — flag a bridge span for deck + piers.`));
    }
  }

  // Junction hygiene.
  for (const j of project.junctions || []) {
    const links = j.links || [];
    if (links.length < 2) {
      issues.push(mk('warn', 'dangling-junction', links[0]?.road || null, '—', 0, j.x, j.z, j.y,
        `Junction <b>${j.name || j.id}</b> links fewer than 2 road ends.`));
    }
    for (const l of links) {
      const road = (project.roads || []).find((r) => r.id === l.road);
      if (!road) {
        issues.push(mk('error', 'broken-link', null, '—', 0, j.x, j.z, j.y,
          `Junction <b>${j.name || j.id}</b> links a deleted road.`));
      }
    }
  }

  const rank = {error: 0, warn: 1, info: 2};
  issues.sort((p, q) => rank[p.severity] - rank[q.severity]);
  return issues.slice(0, LIMITS.maxIssues);
}

/** Small aggregate for the metrics strip. */
export function summarize(project, samples) {
  let length = 0, minRadius = Infinity, maxGrade = 0, points = 0;
  for (const road of project.roads || []) {
    const smp = samples.get(road.id);
    points += (road.points || []).length;
    if (!smp) continue;
    length += smp.length;
    if (Number.isFinite(smp.minRadius)) minRadius = Math.min(minRadius, smp.minRadius);
    maxGrade = Math.max(maxGrade, smp.maxGrade || 0);
  }
  return {length, minRadius, maxGrade, points, roads: (project.roads || []).length};
}
