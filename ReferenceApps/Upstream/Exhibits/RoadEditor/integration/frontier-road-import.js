/* ════════════════════════════════════════════════════════════════════
   frontier-road-import.js — drop-in loader for .road.json in Terrain Lab.
   Self-contained (no road-editor imports); pass your THREE instance in.
   Y-up metres, matching the engine. Surface + shoulders + painted markings.
   For kerbs/guardrails, export the full .obj from the editor instead.
   ════════════════════════════════════════════════════════════════════ */

const SURFACES = {
  asphalt: {road: [0.20, 0.212, 0.23], shoulder: [0.16, 0.168, 0.182]},
  concrete: {road: [0.585, 0.595, 0.59], shoulder: [0.50, 0.51, 0.505]},
  gravel: {road: [0.512, 0.462, 0.372], shoulder: [0.44, 0.394, 0.316]},
  dirt: {road: [0.41, 0.30, 0.196], shoulder: [0.345, 0.25, 0.163]}
};
const WHITE = [0.88, 0.88, 0.86];
const YELLOW = [0.91, 0.74, 0.23];

function catmull(p0, p1, p2, p3, t) {
  // Uniform Catmull-Rom is plenty for engine-side rendering.
  const t2 = t * t, t3 = t2 * t;
  const out = {};
  for (const k of ['x', 'z', 'y', 'w']) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t +
      (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
      (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

function resolvePoints(project, road) {
  const pts = road.points.map((p) => ({...p, w: p.w ?? 1}));
  for (const j of project.junctions || []) {
    for (const l of j.links || []) {
      if (l.road !== road.id) continue;
      const i = l.end === 'start' ? 0 : pts.length - 1;
      if (pts[i]) { pts[i].x = j.x; pts[i].z = j.z; pts[i].y = j.y; }
    }
  }
  return pts;
}

function sampleCentreline(project, road, step = 1.5) {
  const pts = resolvePoints(project, road).filter((p, i, a) =>
    i === 0 || Math.hypot(p.x - a[i - 1].x, p.z - a[i - 1].z) > 1e-6);
  if (pts.length < 2) return [];
  const n = pts.length, closed = !!road.closed;
  const spans = closed ? n : n - 1;
  const dense = [];
  for (let i = 0; i < spans; i++) {
    const p1 = pts[i % n], p2 = pts[(i + 1) % n];
    const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
    const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < 12; k++) dense.push(catmull(p0, p1, p2, p3, k / 12));
  }
  if (!closed) dense.push({...pts[n - 1]});
  // Arc-length walk.
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z);
  }
  let total = cum[cum.length - 1];
  if (closed) total += Math.hypot(dense[0].x - dense[dense.length - 1].x, dense[0].z - dense[dense.length - 1].z);
  const count = Math.max(2, Math.round(total / step));
  const out = [];
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = (i / count) * total;
    while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const s0 = cum[j], s1 = cum[j + 1] ?? total;
    const f = s1 - s0 < 1e-9 ? 0 : (s - s0) / (s1 - s0);
    const a = dense[j], b = dense[j + 1] ?? dense[0];
    out.push({x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, s});
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].tx = (b.x - a.x) / L; out[i].tz = (b.z - a.z) / L;
  }
  return out;
}

function stripGeometry(THREE, rows) {
  // rows: arrays of {x,y,z, r,g,b, u,v} with equal length; upward winding.
  const R = rows.length, C = rows[0].length;
  const pos = new Float32Array(R * C * 3);
  const col = new Float32Array(R * C * 3);
  const uv = new Float32Array(R * C * 2);
  rows.forEach((row, r) => row.forEach((v, c) => {
    const k = r * C + c;
    pos.set([v.x, v.y, v.z], k * 3);
    col.set([v.r, v.g, v.b], k * 3);
    uv.set([v.u, v.v], k * 2);
  }));
  const idx = [];
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
    const a = r * C + c, b = (r + 1) * C + c;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Build a THREE.Group of road meshes from a .road.json project.
 * @param {object} project — parsed frontier-road-network JSON.
 * @param {object} THREE — your three module instance.
 * @param {object} opts — {step, lift, terrain: fn(x,z)->y|null (for conform:'drape')}
 */
export function buildRoadGroup(project, THREE, {step = 1.5, lift = 0.03, terrain = null} = {}) {
  const group = new THREE.Group();
  group.name = `Roads:${project.name || 'network'}`;
  for (const road of project.roads || []) {
    if (road.visible === false) continue;
    const S = sampleCentreline(project, road, step);
    if (S.length < 2) continue;
    const surf = SURFACES[road.surface] || SURFACES.asphalt;
    const mat = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 0.94, metalness: 0});
    const half = (p) => Math.max(0.25, (road.lanes * road.laneWidth * (p.w || 1)) / 2);
    const baseY = (p) => {
      if (road.conform === 'drape' && typeof terrain === 'function') {
        const t = terrain(p.x, p.z);
        if (t != null && Number.isFinite(t)) return t + (road.drapeOffset || 0);
      }
      return p.y;
    };
    const yAt = (p, o) => {
      const hr = half(p), ao = Math.abs(o);
      const yB = baseY(p) + lift;
      if (ao <= hr) return (road.camber || 0) > 0 ? yB + road.camber * (1 - (o / hr) ** 2) : yB;
      return yB - (ao - hr) * 0.025;
    };
    const at = (p, o, y, c) => ({
      x: p.x - p.tz * o, y, z: p.z + p.tx * o, r: c[0], g: c[1], b: c[2], u: o, v: p.s
    });
    // Main surface: shoulders + cambered lanes.
    {
      const rows = S.map((p) => {
        const hr = half(p), w = p.w || 1;
        const shL = (road.shoulderL || 0) * w, shR = (road.shoulderR || 0) * w;
        const offs = [];
        if (shL > 0) offs.push(-hr - shL);
        for (const f of [-1, -0.5, 0, 0.5, 1]) offs.push(f * hr);
        if (shR > 0) offs.push(hr + shR);
        return offs.map((o) => at(p, o, yAt(p, o), Math.abs(o) <= hr + 1e-6 ? surf.road : surf.shoulder));
      });
      const mesh = new THREE.Mesh(stripGeometry(THREE, rows), mat);
      mesh.name = `${road.name}__surface`;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // Paint.
    const paint = (offs, color, keep) => {
      const rows = [];
      for (const p of S) {
        if (keep && !keep(p)) continue;
        rows.push(offs.map((o) => at(p, o, yAt(p, o) + 0.02, color)));
      }
      if (rows.length < 2) return;
      const mesh = new THREE.Mesh(stripGeometry(THREE, rows), mat);
      mesh.name = `${road.name}__paint`;
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    if (road.centerMarking === 'single') paint([-0.07, 0.07], WHITE);
    else if (road.centerMarking === 'double') { paint([-0.24, -0.12], YELLOW); paint([0.12, 0.24], YELLOW); }
    else if (road.centerMarking === 'dashed') paint([-0.07, 0.07], WHITE, (p) => (p.s % 9) < 3);
    if (road.edgeMarking) {
      for (const side of [-1, 1]) {
        const rows = [];
        for (const p of S) {
          const hr = half(p);
          if (hr < 0.7) continue;
          const o = side * (hr - 0.22);
          rows.push([at(p, o - 0.06, yAt(p, o) + 0.02, WHITE), at(p, o + 0.06, yAt(p, o) + 0.02, WHITE)]);
        }
        if (rows.length > 1) {
          const mesh = new THREE.Mesh(stripGeometry(THREE, rows), mat);
          mesh.name = `${road.name}__edge`;
          group.add(mesh);
        }
      }
    }
  }
  return group;
}

/** Fetch + minimally sanitize a .road.json file. Throws on bad payloads. */
export async function loadRoadNetwork(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`road network HTTP ${res.status}: ${url}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.roads)) throw new Error('not a frontier-road-network file');
  for (const r of data.roads) {
    r.points = (r.points || []).filter((p) => Number.isFinite(+p.x) && Number.isFinite(+p.z));
    r.lanes = Math.min(6, Math.max(1, Math.round(r.lanes || 2)));
    r.laneWidth = Math.min(12, Math.max(1.5, +r.laneWidth || 3.5));
  }
  return data;
}
