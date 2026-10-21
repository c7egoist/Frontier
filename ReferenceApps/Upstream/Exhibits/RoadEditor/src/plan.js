/* ════════════════════════════════════════════════════════════════════
   plan.js — top-down spline editor on <canvas>. North (-Z) is up.
   Tools: select / draw / pan. Space-drag pans in any tool.
   ════════════════════════════════════════════════════════════════════ */
import {distToSegment} from './spline.js';
import {SURFACES, baseWidth, pierStations, junctionPatch} from './geometry.js';
import {sampleAtStation} from './topology.js';
import {effectivePoints, linkForPoint, setPointPosition, roadById} from './state.js';
import {allocId, defaultRoad, downloadCanvasPNG} from './io.js';

const PLAN_SURFACE = {
  asphalt: {road: '#43474e', shoulder: '#33363c'},
  concrete: {road: '#8f9494', shoulder: '#717677'},
  gravel: {road: '#7d6f52', shoulder: '#66593f'},
  dirt: {road: '#6e5230', shoulder: '#59432a'}
};
const ACCENT = '#4a90e2';

export function createPlanView(canvas, store, env) {
  const ctx = canvas.getContext('2d');
  const wrap = canvas.parentElement;
  let W = 300, H = 300, dpr = 1;
  const cam = {cx: 0, cz: 0, scale: 4}; // px per metre
  let hover = null;   // {kind:'point'|'road'|'junction', roadId, index, junctionId}
  let cursor = null;  // world {x,z} under mouse
  let snapMark = null;
  let altDown = false, spaceDown = false;
  let drag = null;    // {mode:'point'|'junction'|'pan'|'draw-pan', ...}
  let drawSession = null; // {roadId, startSnapshot}
  let terrainCache = {rev: -1, canvas: null};

  const w2s = (x, z) => [(x - cam.cx) * cam.scale + W / 2, (z - cam.cz) * cam.scale + H / 2];
  const s2w = (sx, sy) => ({x: (sx - W / 2) / cam.scale + cam.cx, z: (sy - H / 2) / cam.scale + cam.cz});

  function resize() {
    const r = wrap.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(50, r.width); H = Math.max(50, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    redraw();
  }

  /* ── snapping ─────────────────────────────────────────────────── */
  function snapTargets(exceptRoad = null, exceptIndex = -1) {
    const out = [];
    const p = store.project;
    for (const road of p.roads) {
      if (road.visible === false) continue;
      const pts = effectivePoints(p, road);
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        if (road.closed) continue; // loops weld by endpoint extension instead
        if (i !== 0 && i !== n - 1) continue;
        if (road.id === exceptRoad && i === exceptIndex) continue;
        out.push({x: pts[i].x, z: pts[i].z, roadId: road.id, index: i});
      }
    }
    return out;
  }

  function resolveSnap(wx, wz, forDrag = null, allowCurve = false) {
    let x = wx, z = wz, y = null, node = null, curve = null, grid = false;
    if (store.ui.snapNode) {
      let best = 12 / cam.scale;
      for (const t of snapTargets(forDrag?.roadId, forDrag?.index ?? -1)) {
        const d = Math.hypot(t.x - wx, t.z - wz);
        if (d < best) { best = d; node = t; }
      }
      if (node) { x = node.x; z = node.z; }
    }
    // Curve snap: endpoints land on other roads' centrelines (T / merge terminals).
    if (!node && allowCurve && store.ui.snapNode) {
      let best = 12 / cam.scale, hit = null;
      for (const road of store.project.roads) {
        if (road.visible === false) continue;
        if (forDrag && road.id === forDrag.roadId) continue;
        const smp = env.getSamples(road.id);
        if (!smp || !smp.count) continue;
        const S = smp.samples, n = S.length;
        const end = smp.closed ? n : n - 1;
        for (let i = 0; i < end; i++) {
          const a = S[i], b = S[(i + 1) % n];
          if (wx < Math.min(a.x, b.x) - best || wx > Math.max(a.x, b.x) + best ||
              wz < Math.min(a.z, b.z) - best || wz > Math.max(a.z, b.z) + best) continue;
          const {d, t} = distToSegment(wx, wz, a.x, a.z, b.x, b.z);
          if (d < best) { best = d; hit = {a, b, t, roadId: road.id}; }
        }
      }
      if (hit) {
        const {a, b, t} = hit;
        x = a.x + (b.x - a.x) * t; z = a.z + (b.z - a.z) * t;
        y = a.y + (b.y - a.y) * t;
        curve = {roadId: hit.roadId};
      }
    }
    if (!node && !curve && store.ui.snapGrid) {
      const g = store.ui.gridSize || 1;
      x = Math.round(wx / g) * g; z = Math.round(wz / g) * g;
      grid = true;
    }
    return {x, z, y, node, curve, grid};
  }

  /* ── hit testing ──────────────────────────────────────────────── */
  function hitTest(sx, sy) {
    const p = store.project;
    const w = s2w(sx, sy);
    // Junctions first (small, on top).
    for (const j of p.junctions || []) {
      const [jx, jy] = w2s(j.x, j.z);
      if (Math.hypot(jx - sx, jy - sy) < 13) return {kind: 'junction', junctionId: j.id};
    }
    // Control points.
    let best = null, bestD = 11;
    for (const road of p.roads) {
      if (road.visible === false) continue;
      const pts = effectivePoints(p, road);
      for (let i = 0; i < pts.length; i++) {
        const [px, py] = w2s(pts[i].x, pts[i].z);
        const d = Math.hypot(px - sx, py - sy);
        if (d < bestD) { bestD = d; best = {kind: 'point', roadId: road.id, index: i}; }
      }
    }
    if (best) return best;
    // Road bodies via cached samples.
    let bb = null, bd = 9 / cam.scale;
    for (const road of p.roads) {
      if (road.visible === false) continue;
      const smp = env.getSamples(road.id);
      if (!smp || !smp.count) continue;
      const S = smp.samples, n = S.length;
      const end = smp.closed ? n : n - 1;
      for (let i = 0; i < end; i++) {
        const a = S[i], b = S[(i + 1) % n];
        const {d} = distToSegment(w.x, w.z, a.x, a.z, b.x, b.z);
        const halfW = (baseWidth(road) * (a.w || 1)) / 2;
        if (d < Math.max(bd, halfW + 1.5 / cam.scale)) {
          bb = {kind: 'road', roadId: road.id, seg: i, t: 0};
          bd = d;
        }
      }
    }
    return bb;
  }

  function nearestOnRoad(roadId, wx, wz) {
    const smp = env.getSamples(roadId);
    if (!smp || !smp.count) return null;
    const S = smp.samples, n = S.length;
    const end = smp.closed ? n : n - 1;
    let best = null;
    for (let i = 0; i < end; i++) {
      const a = S[i], b = S[(i + 1) % n];
      const {d, t} = distToSegment(wx, wz, a.x, a.z, b.x, b.z);
      if (!best || d < best.d) best = {d, i, t, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s: a.s + (b.s - a.s) * t};
    }
    return best;
  }

  /* ── terrain underlay ─────────────────────────────────────────── */
  function terrainCanvas() {
    const t = env.getTerrain();
    if (!t) { terrainCache = {rev: -1, canvas: null}; return null; }
    if (terrainCache.rev === t.rev && terrainCache.canvas) return terrainCache.canvas;
    const N = 220;
    const off = document.createElement('canvas');
    off.width = N; off.height = N;
    const c = off.getContext('2d');
    const img = c.createImageData(N, N);
    const span = Math.max(1e-6, t.maxY - t.minY);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = t.bounds.minX + ((t.bounds.maxX - t.bounds.minX) * i) / (N - 1);
        const z = t.bounds.minZ + ((t.bounds.maxZ - t.bounds.minZ) * j) / (N - 1);
        const h = t.sample(x, z);
        const f = h == null ? 0 : (h - t.minY) / span;
        // Deep hypsometric ramp for dark UI.
        const r = 18 + f * 66, g = 26 + f * 52, b = 20 + f * 30;
        const k = (j * N + i) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = h == null ? 0 : 235;
      }
    }
    c.putImageData(img, 0, 0);
    terrainCache = {rev: t.rev, canvas: off};
    return off;
  }

  /* ── drawing ──────────────────────────────────────────────────── */
  function strokePath(S, closed, style, widthPx) {
    ctx.strokeStyle = style; ctx.lineWidth = widthPx;
    ctx.lineJoin = 'round'; ctx.lineCap = closed ? 'round' : 'butt';
    ctx.beginPath();
    S.forEach((p, i) => {
      const [sx, sy] = w2s(p.x, p.z);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  function ribbonPolygon(S, closed, oL, oR) {
    // oL/oR: functions of sample → offset (oL negative side).
    const L = [], R = [];
    for (const p of S) {
      const a = oL(p), b = oR(p);
      L.push([p.x - p.tz * a, p.z + p.tx * a]);
      R.push([p.x - p.tz * b, p.z + p.tx * b]);
    }
    ctx.beginPath();
    L.forEach(([x, z], i) => {
      const [sx, sy] = w2s(x, z);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    for (let i = R.length - 1; i >= 0; i--) {
      const [sx, sy] = w2s(R[i][0], R[i][1]);
      ctx.lineTo(sx, sy);
    }
    ctx.closePath();
  }

  function drawRoad(road, S, closed, selected, label) {
    if (!S.length) return;
    const pal = PLAN_SURFACE[road.surface] || PLAN_SURFACE.asphalt;
    const laneHalf = (p) => (road.lanes * road.laneWidth * (p.w || 1)) / 2;
    const oL = (p) => -(laneHalf(p) + road.shoulderL * (p.w || 1));
    const oR = (p) => laneHalf(p) + road.shoulderR * (p.w || 1);
    const approxW = baseWidth(road);
    const detailed = approxW * cam.scale >= 5;

    if (selected) {
      // Accent under-glow.
      ctx.save();
      ctx.shadowColor = ACCENT; ctx.shadowBlur = 14;
      strokePath(S, closed, 'rgba(74,144,226,.55)', Math.max(3, approxW * cam.scale + 5));
      ctx.restore();
    }
    if (detailed) {
      ctx.fillStyle = 'rgba(0,0,0,.9)';
      ribbonPolygon(S, closed, (p) => oL(p) - 0.35, (p) => oR(p) + 0.35);
      ctx.fill();
      if (road.shoulderL > 0 || road.shoulderR > 0) {
        ctx.fillStyle = pal.shoulder;
        ribbonPolygon(S, closed, oL, oR);
        ctx.fill();
      }
      ctx.fillStyle = pal.road;
      ribbonPolygon(S, closed, (p) => -laneHalf(p), (p) => laneHalf(p));
      ctx.fill();
      // Markings.
      const cm = road.centerMarking;
      if (cm === 'single' || cm === 'double') {
        const offs = cm === 'single' ? [0] : [-0.18, 0.18];
        for (const o of offs) {
          ctx.strokeStyle = cm === 'double' ? '#d8b93a' : '#dfe3e6';
          ctx.lineWidth = Math.max(1, 0.13 * cam.scale);
          ctx.beginPath();
          S.forEach((p, i) => {
            const [sx, sy] = w2s(p.x - p.tz * o, p.z + p.tx * o);
            if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
          });
          if (closed) ctx.closePath();
          ctx.stroke();
        }
      } else if (cm === 'dashed') {
        ctx.strokeStyle = '#dfe3e6';
        ctx.lineWidth = Math.max(1, 0.13 * cam.scale);
        ctx.lineCap = 'butt';
        let run = [];
        const flush = () => {
          if (run.length > 1) {
            ctx.beginPath();
            run.forEach(([sx, sy], i) => (i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy)));
            ctx.stroke();
          }
          run = [];
        };
        S.forEach((p) => {
          if ((p.s % 9) < 3) {
            const [sx, sy] = w2s(p.x, p.z);
            run.push([sx, sy]);
          } else flush();
        });
        flush();
      }
      if (road.edgeMarking) {
        ctx.strokeStyle = 'rgba(223,227,230,.85)';
        ctx.lineWidth = Math.max(1, 0.11 * cam.scale);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          let started = false;
          for (const p of S) {
            const hr = laneHalf(p);
            if (hr < 0.7) { started = false; continue; }
            const o = side * (hr - 0.22);
            const [sx, sy] = w2s(p.x - p.tz * o, p.z + p.tx * o);
            if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
          }
          ctx.stroke();
        }
      }
    } else {
      strokePath(S, closed, 'rgba(0,0,0,.9)', 5);
      strokePath(S, closed, road.color || pal.road, 3);
    }

    // Direction chevrons.
    if (cam.scale >= 1.2 && !closed) {
      ctx.fillStyle = selected ? '#fff' : 'rgba(255,255,255,.5)';
      const every = Math.max(1, Math.round(28 / (cam.scale * 1.0)));
      for (let i = every; i < S.length - 1; i += every * 3) {
        const p = S[i];
        const [sx, sy] = w2s(p.x, p.z);
        const a = Math.atan2(p.tz, p.tx);
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-3.4, -4); ctx.lineTo(3.6, 0); ctx.lineTo(-3.4, 4);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // Name label at mid-station.
    if (label && cam.scale >= 2.2) {
      const mid = S[Math.floor(S.length / 2)];
      const [sx, sy] = w2s(mid.x, mid.z);
      ctx.font = '600 11px "Segoe UI",system-ui,sans-serif';
      const tw = ctx.measureText(road.name).width;
      ctx.fillStyle = 'rgba(0,0,0,.72)';
      const bx = sx - tw / 2 - 7, by = sy - 26;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw + 14, 18, 9);
      ctx.fill();
      ctx.fillStyle = selected ? '#fff' : 'rgba(237,237,237,.75)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(road.name, sx, by + 9.5);
    }
  }

  function drawPoints(road, selected) {
    const p = store.project;
    const pts = effectivePoints(p, road);
    const sel = store.selection;
    // Control polygon.
    if (selected && pts.length > 1) {
      ctx.strokeStyle = 'rgba(74,144,226,.5)';
      ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      pts.forEach((q, i) => {
        const [sx, sy] = w2s(q.x, q.z);
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      if (road.closed) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const showSmall = !selected && cam.scale >= 4;
    if (!selected && !showSmall) return;
    for (let i = 0; i < pts.length; i++) {
      const [sx, sy] = w2s(pts[i].x, pts[i].z);
      const isSel = selected && sel.kind === 'point' && sel.index === i;
      const isHover = hover?.kind === 'point' && hover.roadId === road.id && hover.index === i;
      const linked = !!linkForPoint(p, road.id, i);
      if (!selected) {
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.fillRect(sx - 2, sy - 2, 4, 4);
        continue;
      }
      const s = isSel || isHover ? 11 : 9;
      ctx.fillStyle = isSel ? ACCENT : '#f4f4f5';
      ctx.strokeStyle = '#0a0a0b'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(sx - s / 2, sy - s / 2, s, s);
      ctx.fill(); ctx.stroke();
      if (linked) {
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(sx, sy, s / 2 + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (road.points[i]?.bridge) {
        ctx.fillStyle = '#6cd5e0';
        ctx.fillRect(sx - 2.5, sy + 7, 5, 5);
      }
      // End ticks.
      if (!road.closed && (i === 0 || i === pts.length - 1)) {
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.font = '700 8px "Segoe UI",system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(i === 0 ? 'A' : 'B', sx, sy - 9);
      }
    }
  }

  function drawTopology(topo) {
    if (!topo) return;
    // True paved intersection shapes — the same ring the 3D mesh paves, so
    // crossing roads read as one fused surface here too.
    const p = store.project;
    const sampleMap = new Map();
    for (const road of p.roads) {
      const smp = env.getSamples(road.id);
      if (smp) sampleMap.set(road.id, smp);
    }
    for (const ix of topo.intersections || []) {
      const patch = junctionPatch(ix, p, sampleMap, null);
      if (patch && patch.ring.length > 2) {
        const pal = PLAN_SURFACE[patch.surfId] || PLAN_SURFACE.asphalt;
        // Dark casing first (matches the ribbon under-fill language), then pavement.
        for (const [fill, grow] of [['rgba(0,0,0,.9)', 0.35], [pal.road, 0]]) {
          ctx.fillStyle = fill;
          ctx.beginPath();
          patch.ring.forEach((v, i) => {
            let px = v.x, pz = v.z;
            if (grow) {
              const dx = v.x - patch.C.x, dz = v.z - patch.C.z;
              const L = Math.hypot(dx, dz) || 1;
              px += (dx / L) * grow; pz += (dz / L) * grow;
            }
            const [qx, qy] = w2s(px, pz);
            if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
          });
          ctx.closePath(); ctx.fill();
        }
      }
      // Compact kind badge (not a disc — the patch itself is the visual now).
      const [sx, sy] = w2s(ix.x, ix.z);
      if (ix.radius * cam.scale >= 6) {
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20,21,24,.92)'; ctx.fill();
        ctx.strokeStyle = 'rgba(246,198,106,.8)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = 'rgba(246,198,106,.95)';
        ctx.font = '700 10px "Segoe UI",system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText({cross: 'X', tee: 'T', merge: 'M', wye: 'Y', elbow: 'L', multi: '*'}[ix.kind] || '?', sx, sy);
      }
    }
    // Overpass markers (upper > lower, clearance).
    for (const o of topo.overpasses || []) {
      const [sx, sy] = w2s(o.x, o.z);
      const low = o.gap < 4.5;
      ctx.strokeStyle = low ? '#ef4444' : 'rgba(125,231,165,.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = low ? '#ef4444' : 'rgba(125,231,165,.95)';
      ctx.font = '600 10px "Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`${o.gap.toFixed(1)}m`, sx + 12, sy);
    }
    // Bridge spans: deck edges + pier ticks.
    for (const b of topo.bridges || []) {
      const road = roadById(store.project, b.roadId);
      const smp = env.getSamples(b.roadId);
      if (!road || !smp) continue;
      const S = smp.samples.filter((q) => q.s >= b.s0 && q.s <= b.s1);
      if (S.length > 1) {
        for (const side of [-1, 1]) {
          ctx.strokeStyle = 'rgba(125,213,224,.9)'; ctx.lineWidth = 1.4;
          ctx.beginPath();
          S.forEach((q, i) => {
            const hr = (road.lanes * road.laneWidth * (q.w || 1)) / 2;
            const sh = (side < 0 ? road.shoulderL : road.shoulderR) * (q.w || 1);
            const o = side * (hr + sh + 0.18);
            const [qx, qy] = w2s(q.x - q.tz * o, q.z + q.tx * o);
            if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
          });
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(125,213,224,.95)';
      for (const ps of pierStations(b, +road.bridgeSpacing || 12)) {
        const st = sampleAtStation(smp.samples, ps);
        const [qx, qy] = w2s(st.x, st.z);
        ctx.fillRect(qx - 2.5, qy - 2.5, 5, 5);
      }
    }
  }

  function drawJunctions() {
    const p = store.project;
    const sel = store.selection;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const j of p.junctions || []) {
      const [sx, sy] = w2s(j.x, j.z);
      const isSel = sel.kind === 'junction' && sel.junctionId === j.id;
      const isHov = hover?.kind === 'junction' && hover.junctionId === j.id;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(Math.PI / 4);
      const s = isSel || isHov ? 13 : 11;
      ctx.fillStyle = isSel ? ACCENT : '#f59e0b';
      ctx.strokeStyle = '#0a0a0b'; ctx.lineWidth = 2;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      ctx.font = '600 10.5px "Segoe UI",system-ui,sans-serif';
      ctx.fillStyle = 'rgba(246,198,106,.9)';
      ctx.fillText(j.name || j.id, sx + 11, sy - 10);
    }
  }

  function drawIssues() {
    if (!store.ui.showIssues) return;
    for (const it of env.getIssues()) {
      if (it.x == null) continue;
      const [sx, sy] = w2s(it.x, it.z);
      if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue;
      ctx.fillStyle = it.severity === 'error' ? '#ef4444' : it.severity === 'warn' ? '#f59e0b' : ACCENT;
      ctx.strokeStyle = '#0a0a0b'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 8); ctx.lineTo(sx + 7, sy + 5); ctx.lineTo(sx - 7, sy + 5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0a0a0b';
      ctx.font = '800 8px "Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', sx, sy + 1.5);
    }
  }

  function drawGrid() {
    const steps = [0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
    let step = steps.find((s) => s * cam.scale >= 26) || 1000;
    const x0 = cam.cx - W / 2 / cam.scale, x1 = cam.cx + W / 2 / cam.scale;
    const z0 = cam.cz - H / 2 / cam.scale, z1 = cam.cz + H / 2 / cam.scale;
    ctx.lineWidth = 1;
    for (let pass = 0; pass < 2; pass++) {
      const st = pass === 0 ? step : step * 5;
      ctx.strokeStyle = pass === 0 ? 'rgba(255,255,255,.055)' : 'rgba(255,255,255,.11)';
      ctx.beginPath();
      for (let gx = Math.ceil(x0 / st) * st; gx <= x1; gx += st) {
        const [sx] = w2s(gx, 0);
        ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, H);
      }
      for (let gz = Math.ceil(z0 / st) * st; gz <= z1; gz += st) {
        const [, sy] = w2s(0, gz);
        ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(W, Math.round(sy) + 0.5);
      }
      ctx.stroke();
    }
    // Major labels.
    ctx.font = '10px "Segoe UI",system-ui,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const st = step * 5;
    for (let gx = Math.ceil(x0 / st) * st; gx <= x1; gx += st) {
      const [sx] = w2s(gx, 0);
      ctx.fillText(`${gx}`, sx + 4, 4);
    }
    // Origin cross.
    const [ox, oy] = w2s(0, 0);
    if (ox > -30 && ox < W + 30 && oy > -30 && oy < H + 30) {
      ctx.strokeStyle = 'rgba(74,144,226,.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox - 8, oy); ctx.lineTo(ox + 8, oy);
      ctx.moveTo(ox, oy - 8); ctx.lineTo(ox, oy + 8);
      ctx.stroke();
    }
  }

  function drawOverlays() {
    // Scale bar.
    const target = 130;
    const raw = target / cam.scale;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const nice = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw) || 10 * pow;
    const px = nice * cam.scale;
    const x = 14, y = H - 24;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.beginPath(); ctx.roundRect(x - 8, y - 8, px + 16, 30, 8); ctx.fill();
    ctx.fillStyle = '#e9e9ec';
    ctx.fillRect(x, y + 8, px, 3);
    ctx.fillRect(x, y + 4, 2, 7); ctx.fillRect(x + px - 2, y + 4, 2, 7);
    ctx.font = '600 10px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(nice >= 1000 ? `${(nice / 1000).toFixed(1)} km` : `${nice} m`, x, y + 5);
    // North arrow.
    const nx = W - 30, ny = 34;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.beginPath(); ctx.arc(nx, ny, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9e9ec';
    ctx.beginPath();
    ctx.moveTo(nx, ny - 9); ctx.lineTo(nx + 5, ny + 4); ctx.lineTo(nx, ny + 1); ctx.lineTo(nx - 5, ny + 4);
    ctx.closePath(); ctx.fill();
    ctx.font = '700 8px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny + 12);
  }

  function drawDrawSession() {
    if (!drawSession || !cursor) return;
    const road = roadById(store.project, drawSession.roadId);
    if (!road || !road.points.length) return;
    const last = road.points[road.points.length - 1];
    const [ax, ay] = w2s(last.x, last.z);
    const [bx, by] = w2s(cursor.x, cursor.z);
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ACCENT;
    ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill();
  }

  function redraw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, W, H);
    // Terrain underlay.
    const t = env.getTerrain();
    const tc = terrainCanvas();
    if (t && tc) {
      const [ax, ay] = w2s(t.bounds.minX, t.bounds.minZ);
      const [bx, by] = w2s(t.bounds.maxX, t.bounds.maxZ);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(tc, ax, ay, bx - ax, by - ay);
    }
    drawGrid();
    const p = store.project;
    const sel = store.selection;
    const topo = env.getTopology?.();
    for (const road of p.roads) {
      if (road.visible === false) continue;
      const smp = env.getSamples(road.id);
      if (!smp || !smp.count) continue;
      const runs = topo?.runs?.get(road.id) || [smp.samples];
      const whole = runs.length === 1 && runs[0].length === smp.samples.length;
      const longest = runs.reduce((a, b) => (b.length > a.length ? b : a), runs[0]);
      for (const run of runs) {
        drawRoad(road, run, whole && smp.closed, sel.roadId === road.id, run === longest);
      }
    }
    drawTopology(topo);
    // Control points for every visible road when zoomed, full handles for selected.
    for (const road of p.roads) {
      if (road.visible === false) continue;
      drawPoints(road, sel.roadId === road.id);
    }
    drawJunctions();
    drawIssues();
    drawDrawSession();
    // Snap glyph.
    if (snapMark) {
      const [sx, sy] = w2s(snapMark.x, snapMark.z);
      ctx.strokeStyle = snapMark.node ? '#f59e0b' : snapMark.curve ? '#7ee7a5' : 'rgba(74,144,226,.8)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 13, sy); ctx.lineTo(sx - 6, sy);
      ctx.moveTo(sx + 6, sy); ctx.lineTo(sx + 13, sy);
      ctx.moveTo(sx, sy - 13); ctx.lineTo(sx, sy - 6);
      ctx.moveTo(sx, sy + 6); ctx.lineTo(sx, sy + 13);
      ctx.stroke();
    }
    // Hover ring.
    if (hover?.kind === 'point') {
      const road = roadById(p, hover.roadId);
      if (road) {
        const pts = effectivePoints(p, road);
        const q = pts[hover.index];
        if (q) {
          const [sx, sy] = w2s(q.x, q.z);
          ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    // Flash ping.
    const f = store.flash;
    if (f) {
      const [sx, sy] = w2s(f.x, f.z);
      const age = 1 - Math.max(0, (f.until - performance.now()) / 1600);
      ctx.strokeStyle = `rgba(74,144,226,${1 - age})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 8 + age * 30, 0, Math.PI * 2); ctx.stroke();
      if (age < 1) requestAnimationFrame(redraw);
    }
    drawOverlays();
  }

  /* ── camera ───────────────────────────────────────────────────── */
  function fitAll() {
    const p = store.project;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const eat = (x, z) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    };
    for (const road of p.roads) {
      const smp = env.getSamples(road.id);
      if (smp && smp.count) for (const s of smp.samples) eat(s.x, s.z);
      else for (const q of road.points) eat(q.x, q.z);
    }
    const t = env.getTerrain();
    if (!Number.isFinite(minX)) {
      if (t) { minX = t.bounds.minX; maxX = t.bounds.maxX; minZ = t.bounds.minZ; maxZ = t.bounds.maxZ; }
      else { minX = -60; maxX = 60; minZ = -60; maxZ = 60; }
    }
    const pad = 30;
    const sx = (W - pad * 2) / Math.max(10, maxX - minX);
    const sz = (H - pad * 2) / Math.max(10, maxZ - minZ);
    cam.scale = Math.min(60, Math.max(0.2, Math.min(sx, sz)));
    cam.cx = (minX + maxX) / 2; cam.cz = (minZ + maxZ) / 2;
    redraw();
  }

  function centerOn(x, z, scale) {
    cam.cx = x; cam.cz = z;
    if (scale) cam.scale = Math.min(60, Math.max(0.2, scale));
    redraw();
  }

  /* ── editing helpers ──────────────────────────────────────────── */
  function ensureDrawRoad() {
    let road = roadById(store.project, drawSession?.roadId);
    if (!road) {
      const id = allocId(store.project, 'r');
      const n = store.project.roads.length + 1;
      store.transient((p) => { p.roads.push(defaultRoad(id, n)); });
      store.select({kind: 'road', roadId: id});
      drawSession.roadId = id;
      road = roadById(store.project, id);
    }
    return road;
  }

  function startDrawSession() {
    if (drawSession) return;
    store.checkpoint('draw road');
    const sel = store.selection;
    const existing = sel.roadId && !roadById(store.project, sel.roadId)?.closed ? sel.roadId : null;
    drawSession = {roadId: existing, created: !existing};
  }

  function finishDraw(cancelled) {
    if (!drawSession) return;
    if (cancelled) {
      store.undo(); // checkpoint restores everything since the first click
    } else {
      const road = roadById(store.project, drawSession.roadId);
      if (road && road.points.length < 2) store.undo();
      else store.endGesture();
    }
    drawSession = null;
    redraw();
  }

  function weldEndpoint(roadId, index, target) {
    // Weld dragged end to another road's end via a junction (same undo step).
    const p = store.project;
    const road = roadById(p, roadId);
    if (!road || road.closed || (index !== 0 && index !== road.points.length - 1)) return;
    if (target.roadId === roadId) return;
    const tRoad = roadById(p, target.roadId);
    if (!tRoad || tRoad.closed) return;
    const end = index === 0 ? 'start' : 'end';
    const tEnd = target.index === 0 ? 'start' : 'end';
    // Already sharing a junction?
    const mine = linkForPoint(p, roadId, index);
    const theirs = linkForPoint(p, target.roadId, target.index);
    if (mine && theirs && mine.id === theirs.id) return;
    store.transient((pp) => {
      if (mine && theirs && mine.id !== theirs.id) {
        // Merge: move their links onto mine, drop theirs.
        for (const l of theirs.links) mine.links.push(l);
        pp.junctions = pp.junctions.filter((j) => j.id !== theirs.id);
        if (pp.junctions.includes(mine)) {
          mine.x = target.x; mine.z = target.z;
        }
      } else if (mine) {
        mine.links.push({road: target.roadId, end: tEnd});
      } else if (theirs) {
        theirs.links.push({road: roadId, end});
      } else {
        const id = allocId(pp, 'j');
        pp.junctions.push({
          id, name: `Junction ${(pp.junctions || []).length + 1}`,
          x: target.x, z: target.z,
          y: (road.points[index].y + tRoad.points[target.index].y) / 2,
          links: [{road: roadId, end}, {road: target.roadId, end: tEnd}]
        });
      }
      // Snap both ends exactly: junction owns the position now.
      const j = linkForPoint(pp, roadId, index);
      if (j) {
        const tp = effectivePoints(pp, tRoad)[target.index];
        j.x = tp.x; j.z = tp.z;
        j.y = (road.points[index].y + tp.y) / 2;
      }
    });
    env.toast('Endpoints welded — junction created');
  }

  /* ── pointer handling ─────────────────────────────────────────── */
  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    canvas.focus?.();
    const [sx, sy] = local(e);
    const w = s2w(sx, sy);
    const tool = spaceDown || e.button === 1 || e.button === 2 ? 'pan' : store.tool;

    if (tool === 'pan') {
      drag = {mode: 'pan', sx, sy, cx: cam.cx, cz: cam.cz};
      wrap.dataset.tool = 'pan';
      canvas.classList.add('dragging');
      return;
    }
    if (store.tool === 'draw' && tool !== 'pan') {
      if (e.button !== 0) return;
      startDrawSession();
      const road = ensureDrawRoad();
      if (road.closed) { finishDraw(false); return; }
      // Close the loop by clicking near the first point.
      if (road.points.length >= 3) {
        const f = road.points[0];
        const [fx, fy] = w2s(f.x, f.z);
        if (Math.hypot(fx - sx, fy - sy) < 12) {
          store.transient((p) => { roadById(p, road.id).closed = true; });
          store.select({kind: 'road', roadId: road.id});
          finishDraw(false);
          env.toast('Loop closed');
          return;
        }
      }
      const sn = resolveSnap(w.x, w.z, null, true);
      const y = sn.curve && sn.y != null ? +sn.y.toFixed(2)
        : road.points.length ? road.points[road.points.length - 1].y : 0;
      store.transient((p) => {
        const r = roadById(p, road.id);
        r.points.push({x: +sn.x.toFixed(3), z: +sn.z.toFixed(3), y, w: 1});
      });
      store.select({kind: 'point', roadId: road.id, index: roadById(store.project, road.id).points.length - 1});
      // Weld if snapped to a foreign endpoint.
      if (sn.node && (sn.node.roadId !== road.id || sn.node.index !== 0)) {
        const idx = roadById(store.project, road.id).points.length - 1;
        if (sn.node.roadId !== road.id) weldEndpoint(road.id, idx, sn.node);
      }
      redraw();
      return;
    }
    // Select tool.
    const hit = hitTest(sx, sy);
    if (e.button !== 0) {
      if (e.button === 2) store.select({kind: null});
      return;
    }
    if (altDown && hit?.kind === 'road') {
      // Insert a point on the segment.
      const road = roadById(store.project, hit.roadId);
      const near = nearestOnRoad(hit.roadId, w.x, w.z);
      if (road && near && !road.closed) {
        // Map station to a control-span: nearest control point pair.
        const pts = effectivePoints(store.project, road);
        let bi = 0, bd = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          const {d} = distToSegment(w.x, w.z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z);
          if (d < bd) { bd = d; bi = i; }
        }
        const ya = pts[bi].y, yb = pts[bi + 1].y;
        store.commit('insert point', (p) => {
          const r = roadById(p, road.id);
          r.points.splice(bi + 1, 0, {x: +near.x.toFixed(3), z: +near.z.toFixed(3), y: +((ya + yb) / 2).toFixed(2), w: 1});
        });
        store.select({kind: 'point', roadId: road.id, index: bi + 1});
      } else if (road && near && road.closed) {
        const pts = effectivePoints(store.project, road);
        let bi = 0, bd = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const {d} = distToSegment(w.x, w.z, a.x, a.z, b.x, b.z);
          if (d < bd) { bd = d; bi = i; }
        }
        store.commit('insert point', (p) => {
          const r = roadById(p, road.id);
          r.points.splice(bi + 1, 0, {x: +near.x.toFixed(3), z: +near.z.toFixed(3), y: +pts[bi].y.toFixed(2), w: 1});
        });
        store.select({kind: 'point', roadId: road.id, index: (bi + 1) % pts.length });
      }
      redraw();
      return;
    }
    if (!hit) {
      store.select({kind: null});
      drag = {mode: 'pan', sx, sy, cx: cam.cx, cz: cam.cz, maybe: true};
      return;
    }
    if (hit.kind === 'junction') {
      store.select({kind: 'junction', junctionId: hit.junctionId});
      const j = store.project.junctions.find((q) => q.id === hit.junctionId);
      store.checkpoint('move junction');
      drag = {mode: 'junction', jid: hit.junctionId, dx: w.x - j.x, dz: w.z - j.z};
      return;
    }
    if (hit.kind === 'road') {
      store.select({kind: 'road', roadId: hit.roadId});
      drag = {mode: 'pan', sx, sy, cx: cam.cx, cz: cam.cz, maybe: true};
      return;
    }
    // Point grab.
    store.select({kind: 'point', roadId: hit.roadId, index: hit.index});
    store.checkpoint('move point');
    drag = {mode: 'point', roadId: hit.roadId, index: hit.index, moved: false};
  });

  canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = local(e);
    const w = s2w(sx, sy);
    cursor = {x: w.x, z: w.z};
    env.onCursor?.(w.x, w.z);

    if (drag?.mode === 'pan') {
      cam.cx = drag.cx - (sx - drag.sx) / cam.scale;
      cam.cz = drag.cz - (sy - drag.sy) / cam.scale;
      redraw();
      return;
    }
    if (drag?.mode === 'junction') {
      const sn = resolveSnap(w.x - drag.dx, w.z - drag.dz);
      store.transient((p) => {
        const j = p.junctions.find((q) => q.id === drag.jid);
        if (j) { j.x = +sn.x.toFixed(3); j.z = +sn.z.toFixed(3); }
      });
      snapMark = sn.node || sn.grid ? {x: sn.x, z: sn.z, node: !!sn.node} : null;
      redraw();
      return;
    }
    if (drag?.mode === 'point') {
      drag.moved = true;
      const droad = roadById(store.project, drag.roadId);
      const isEnd = droad && !droad.closed &&
        (drag.index === 0 || drag.index === droad.points.length - 1);
      const sn = resolveSnap(w.x, w.z, {roadId: drag.roadId, index: drag.index}, !!isEnd);
      store.transient((p) => {
        setPointPosition(p, drag.roadId, drag.index, +sn.x.toFixed(3), +sn.z.toFixed(3),
          sn.curve && sn.y != null ? +sn.y.toFixed(2) : undefined);
      });
      snapMark = sn.node || sn.curve || sn.grid ? {x: sn.x, z: sn.z, node: !!sn.node, curve: !!sn.curve} : null;
      drag.snapNode = sn.node;
      redraw();
      return;
    }
    // Hover.
    if (store.tool === 'draw') {
      const sn = resolveSnap(w.x, w.z, null, true);
      cursor = {x: sn.x, z: sn.z};
      snapMark = sn.node || sn.curve || sn.grid ? {x: sn.x, z: sn.z, node: !!sn.node, curve: !!sn.curve} : null;
      hover = null;
    } else {
      hover = hitTest(sx, sy);
      snapMark = null;
    }
    redraw();
  });

  const endPointer = (e) => {
    canvas.classList.remove('dragging');
    wrap.dataset.tool = spaceDown ? 'pan' : store.tool;
    if (drag?.mode === 'point' && drag.snapNode && drag.moved) {
      weldEndpoint(drag.roadId, drag.index, drag.snapNode);
    }
    if (drag && (drag.mode === 'point' || drag.mode === 'junction')) store.endGesture();
    drag = null;
    snapMark = null;
    redraw();
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => {
    cursor = null; hover = null; snapMark = null;
    env.onCursor?.(null, null);
    redraw();
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    const before = s2w(sx, sy);
    const f = Math.exp(-e.deltaY * 0.0012);
    cam.scale = Math.min(120, Math.max(0.15, cam.scale * f));
    const after = s2w(sx, sy);
    cam.cx += before.x - after.x;
    cam.cz += before.z - after.z;
    redraw();
  }, {passive: false});

  canvas.addEventListener('dblclick', (e) => {
    if (store.tool !== 'select') return;
    const [sx, sy] = local(e);
    const hit = hitTest(sx, sy);
    if (hit) return;
    // Extend the nearest open end of the selected (or last-selected) road —
    // the two clicks of a double-click clear the selection first.
    const sel = store.selection;
    const road = roadById(store.project, sel.roadId || lastRoadId);
    if (!road || road.closed || !road.points.length) return;
    const w = s2w(sx, sy);
    const sn = resolveSnap(w.x, w.z);
    const pts = effectivePoints(store.project, road);
    const dA = Math.hypot(pts[0].x - sn.x, pts[0].z - sn.z);
    const dB = Math.hypot(pts[pts.length - 1].x - sn.x, pts[pts.length - 1].z - sn.z);
    const atStart = dA < dB;
    if (linkForPoint(store.project, road.id, atStart ? 0 : pts.length - 1)) {
      env.toast('That end is welded to a junction — unweld it first');
      return;
    }
    store.commit('extend road', (p) => {
      const r = roadById(p, road.id);
      const y = atStart ? r.points[0].y : r.points[r.points.length - 1].y;
      const np = {x: +sn.x.toFixed(3), z: +sn.z.toFixed(3), y, w: 1};
      if (atStart) r.points.unshift(np); else r.points.push(np);
    });
    store.select({kind: 'point', roadId: road.id, index: atStart ? 0 : roadById(store.project, road.id).points.length - 1});
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') altDown = true;
    if (e.code === 'Space' && !e.repeat && e.target === document.body) { spaceDown = true; e.preventDefault(); }
    if (e.key === 'Enter' && drawSession) { e.preventDefault(); finishDraw(false); }
    if (e.key === 'Escape' && drawSession) { e.preventDefault(); finishDraw(true); env.toast('Draw cancelled'); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') altDown = false;
    if (e.code === 'Space') spaceDown = false;
  });

  /* ── store wiring ─────────────────────────────────────────────── */
  let lastRoadId = null;
  store.subscribe((tag) => {
    if (tag === 'selection' && store.selection.roadId) lastRoadId = store.selection.roadId;
    if (tag === 'tool') {
      wrap.dataset.tool = store.tool;
      if (store.tool !== 'draw' && drawSession) finishDraw(false);
    }
    if (tag === 'project' || tag === 'project-live' || tag === 'selection' || tag === 'ui' || tag === 'flash') redraw();
  });
  wrap.dataset.tool = store.tool;

  new ResizeObserver(resize).observe(wrap);

  return {
    redraw, fitAll, centerOn, w2s, s2w,
    get drawing() { return !!drawSession; },
    finishDraw,
    exportPNG(name) {
      redraw();
      downloadCanvasPNG(canvas, name);
    }
  };
}
