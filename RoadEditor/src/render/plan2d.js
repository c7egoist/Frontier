// 2D plan view on a canvas. World is metres in (x, z); north is up (-z). The same polygons the
// 3D view uses are filled here, plus markings, guardrails, drainage, piers, centrelines and the
// editing handles. Hit testing returns the handle or object under the pointer.

import { tileFor, TILE } from './paving.js';

const FILL = {
  asphalt: '#2f3134',
  gutter: '#585b60',
  kerb: '#b9b6ad',
  verge: '#4b6a3c',
  embank: '#66724c',
  deck: '#7b7d82',
  pier: '#8b8c8f',
};

export class Plan2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { cx: 0, cz: 0, s: 4 }; // s = pixels per metre
    this.w = 0;
    this.h = 0;
    this.patterns = new Map();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.dpr = dpr;
  }

  w2s(x, z) {
    return [this.w / 2 + (x - this.view.cx) * this.view.s, this.h / 2 + (z - this.view.cz) * this.view.s];
  }

  s2w(sx, sy) {
    return [(sx - this.w / 2) / this.view.s + this.view.cx, (sy - this.h / 2) / this.view.s + this.view.cz];
  }

  fitTo(bounds) {
    if (!bounds) return;
    const { x0, x1, z0, z1 } = bounds;
    const pad = 40;
    const sx = (this.w - pad * 2) / Math.max(10, x1 - x0);
    const sz = (this.h - pad * 2) / Math.max(10, z1 - z0);
    this.view.s = Math.max(0.5, Math.min(sx, sz, 30));
    this.view.cx = (x0 + x1) / 2;
    this.view.cz = (z0 + z1) / 2;
  }

  pattern(key) {
    if (!key.startsWith('paving:')) return null;
    if (this.patterns.has(key)) return this.patterns.get(key);
    const [, pattern, colour] = key.split(':');
    const pat = this.ctx.createPattern(tileFor(pattern, colour), 'repeat');
    this.patterns.set(key, pat);
    return pat;
  }

  fillFor(key) {
    if (key.startsWith('paving:')) return this.pattern(key) || '#999';
    return FILL[key] || '#777';
  }

  /** draw everything. st = {net, project, sel, hover, tool, pending, area, ghost, opts, drag} */
  draw(st) {
    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#131416';
    ctx.fillRect(0, 0, this.w, this.h);
    this.drawGrid(ctx);
    const net = st.net;
    if (net) {
      const plan = net.plan;
      // embankments first, so roads, bands and hubs always sit on top of them
      for (const p of plan.roads) if (p.mat === 'embank') this.fillPoly(ctx, p.poly, this.fillFor(p.mat));
      for (const h of plan.hubs) if (h.mat === 'embank') this.fillRings(ctx, h.rings, this.fillFor(h.mat));
      for (const p of plan.roads) if (p.mat !== 'embank') this.fillPoly(ctx, p.poly, this.fillFor(p.mat));
      for (const h of plan.hubs) if (h.mat !== 'embank') this.fillRings(ctx, h.rings, this.fillFor(h.mat));
      for (const a of plan.areas) this.fillRings(ctx, [a.poly], this.fillFor(a.mat));
      if (st.opts.marks) {
        for (const m of plan.marks) this.stroke(ctx, m.pts, '#f3f3ef', Math.max(1, m.width * this.view.s), 'round');
      }
      if (st.opts.guards) {
        for (const g of plan.guards) this.stroke(ctx, g.pts, '#d7dbe2', 2.2, 'round');
      }
      if (st.opts.drain) {
        for (const d of plan.drains) {
          if (d.kind === 'pipe') this.stroke(ctx, d.pts, '#66708a', 1.2, 'butt', [4, 3]);
          else this.stroke(ctx, d.pts, '#15161a', Math.max(2, 0.4 * this.view.s), 'butt');
        }
      }
      for (const p of plan.piers) {
        const [sx, sy] = this.w2s(p.x, p.z);
        ctx.fillStyle = '#9fa1a5';
        ctx.fillRect(sx - (p.w * this.view.s) / 2, sy - (p.w * this.view.s) / 2, p.w * this.view.s, p.w * this.view.s);
      }
      for (const c of net.curves.values()) void c;
      for (const c of plan.centres) {
        const sel = st.sel && st.sel.kind === 'road' && st.sel.id === c.id;
        this.stroke(ctx, c.pts, sel ? '#e7e9ec' : '#7c8189', sel ? 1.6 : 0.9, 'round', sel ? null : [6, 5]);
      }
      for (const x of plan.crossings) {
        const [sx, sy] = this.w2s(x.x, x.z);
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = x.clearance < 0.5 ? '#ff6b5e' : x.clearance < 2.5 ? '#f5b84c' : '#7fd1a4';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (st.sketch && st.sketch.length > 1) this.stroke(ctx, st.sketch, '#e5e7ea', 2, 'round', [6, 4]);
    this.drawHandles(ctx, st);
    if (st.area && st.area.length) this.drawAreaPreview(ctx, st.area, st.ghost);
    if (st.pending) this.drawPending(ctx, st);
    if (st.ghost && st.tool === 'exchange') this.drawExchangeGhost(ctx, st);
    if (st.marquee) {
      const [a, b] = st.marquee;
      ctx.strokeStyle = '#bfc3c9';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      ctx.setLineDash([]);
    }
  }

  drawGrid(ctx) {
    const s = this.view.s;
    let step = 1;
    while (step * s < 14) step *= 5;
    const [x0, z0] = this.s2w(0, 0);
    const [x1, z1] = this.s2w(this.w, this.h);
    ctx.lineWidth = 1;
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const [sx] = this.w2s(x, 0);
      ctx.strokeStyle = Math.abs(x) < 1e-9 ? '#3d4248' : x % (step * 5) === 0 ? '#25282c' : '#1e2024';
      ctx.beginPath();
      ctx.moveTo(Math.round(sx) + 0.5, 0);
      ctx.lineTo(Math.round(sx) + 0.5, this.h);
      ctx.stroke();
    }
    for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) {
      const [, sy] = this.w2s(0, z);
      ctx.strokeStyle = Math.abs(z) < 1e-9 ? '#3d4248' : z % (step * 5) === 0 ? '#25282c' : '#1e2024';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(sy) + 0.5);
      ctx.lineTo(this.w, Math.round(sy) + 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#5d6168';
    ctx.font = '10px DM Sans, sans-serif';
    ctx.fillText(`${step} m grid`, 12, this.h - 12);
  }

  fillPoly(ctx, poly, fill) {
    if (poly.length < 3) return;
    ctx.beginPath();
    poly.forEach((p, i) => {
      const [sx, sy] = this.w2s(p[0], p[1]);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    if (typeof fill !== 'string' && fill) {
      ctx.save();
      const scale = (this.view.s * TILE) / 256;
      const m = new DOMMatrix();
      m.a = scale;
      m.d = scale;
      fill.setTransform(m);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fill();
  }

  fillRings(ctx, rings, fill) {
    if (!rings.length || rings[0].length < 3) return;
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((p, i) => {
        const [sx, sy] = this.w2s(p[0], p[1]);
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      ctx.closePath();
    }
    if (typeof fill !== 'string' && fill) {
      ctx.save();
      const scale = (this.view.s * TILE) / 256;
      const m = new DOMMatrix();
      m.a = scale;
      m.d = scale;
      fill.setTransform(m);
      ctx.fillStyle = fill;
      ctx.fill('evenodd');
      ctx.restore();
      return;
    }
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
  }

  stroke(ctx, pts, colour, width, cap = 'butt', dash = null) {
    if (pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [sx, sy] = this.w2s(p[0], p[1]);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    ctx.setLineDash(dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawHandles(ctx, st) {
    const p = st.project;
    if (!p) return;
    const sel = st.sel || {};
    const hov = st.hover || {};
    for (const j of p.junctions) {
      const [sx, sy] = this.w2s(j.x, j.z);
      const isSel = sel.kind === 'junction' && sel.id === j.id;
      const isHov = hov.kind === 'junction' && hov.id === j.id;
      if (isSel || isHov) {
        const rr = (j.radius || 0) * this.view.s;
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, Math.PI * 2);
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = isSel ? '#d6d9de' : '#8d9299';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
        // the radius ring is the same handle: grab it to change the joint's corner radius
        ctx.beginPath();
        ctx.arc(sx + rr, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#d6d9de';
        ctx.fill();
        if (isSel) this.drawArrows(ctx, sx, sy);
      }
      ctx.beginPath();
      ctx.arc(sx, sy, isSel ? 7 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? '#f2f3f5' : '#2a2d32';
      ctx.strokeStyle = isSel ? '#ffffff' : '#a8adb4';
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c6cad0';
      ctx.font = '11px DM Sans, sans-serif';
      ctx.fillText(j.id, sx + 9, sy - 8);
    }
    if (sel.kind === 'road') {
      const r = p.roads.find((q) => q.id === sel.id);
      if (r) {
        const pts = [this.endOf(p, r.a), ...r.ctrl.map((c) => [c.x, c.z]), this.endOf(p, r.b)];
        ctx.strokeStyle = '#6f757d';
        ctx.setLineDash([3, 3]);
        this.stroke(ctx, pts, '#6f757d', 1, 'butt', [3, 3]);
        ctx.setLineDash([]);
        for (const c of r.ctrl) {
          const [sx, sy] = this.w2s(c.x, c.z);
          ctx.fillStyle = '#e7e9ec';
          ctx.fillRect(sx - 4.5, sy - 4.5, 9, 9);
        }
      }
    }
    if (sel.kind === 'area') {
      const a = (p.areas || []).find((q) => q.id === sel.id);
      if (a) {
        for (const q of a.pts) {
          const [sx, sy] = this.w2s(q[0], q[1]);
          ctx.fillStyle = '#e7e9ec';
          ctx.fillRect(sx - 4, sy - 4, 8, 8);
        }
      }
    }
  }

  endOf(p, id) {
    const j = p.junctions.find((q) => q.id === id);
    return j ? [j.x, j.z] : [0, 0];
  }

  drawArrows(ctx, sx, sy) {
    const L = 46;
    ctx.strokeStyle = '#e5e7ea';
    ctx.fillStyle = '#e5e7ea';
    ctx.lineWidth = 2;
    const arrow = (dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(sx + dx * 12, sy + dy * 12);
      ctx.lineTo(sx + dx * L, sy + dy * L);
      ctx.stroke();
      const tx = sx + dx * (L + 6);
      const ty = sy + dy * (L + 6);
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - dx * 8 - dy * 4, ty - dy * 8 + dx * 4);
      ctx.lineTo(tx - dx * 8 + dy * 4, ty - dy * 8 - dx * 4);
      ctx.closePath();
      ctx.fill();
    };
    arrow(1, 0);
    arrow(0, 1);
  }

  drawPending(ctx, st) {
    const p = st.project;
    const j = p.junctions.find((q) => q.id === st.pending);
    if (!j || !st.ghost) return;
    const [ax, ay] = this.w2s(j.x, j.z);
    const [bx, by] = this.w2s(st.ghost[0], st.ghost[1]);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#c9ccd1';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawAreaPreview(ctx, pts, ghost) {
    const all = ghost ? [...pts, ghost] : pts;
    ctx.beginPath();
    all.forEach((q, i) => {
      const [sx, sy] = this.w2s(q[0], q[1]);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.strokeStyle = '#d7dadf';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const q of pts) {
      const [sx, sy] = this.w2s(q[0], q[1]);
      ctx.fillStyle = '#f2f3f5';
      ctx.fillRect(sx - 3, sy - 3, 6, 6);
    }
  }

  drawExchangeGhost(ctx, st) {
    const [gx, gz] = st.ghost;
    const e = st.exGhost;
    if (!e) return;
    const [cx, cy] = this.w2s(gx, gz);
    const r = e.extent * this.view.s;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(4, r), 0, Math.PI * 2);
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = 'rgba(214,217,222,0.55)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** nearest hit under screen point (sx, sy): {kind, id, index, part} or null */
  hit(sx, sy, st) {
    const p = st.project;
    if (!p) return null;
    const sel = st.sel || {};
    const within = (ax, ay, r) => Math.hypot(ax - sx, ay - sy) <= r;
    // move arrows of the selected junction
    if (sel.kind === 'junction') {
      const j = p.junctions.find((q) => q.id === sel.id);
      if (j) {
        const [jx, jy] = this.w2s(j.x, j.z);
        if (Math.abs(sy - jy) < 7 && sx > jx + 12 && sx < jx + 56) return { kind: 'junction', id: j.id, part: 'move-x' };
        if (Math.abs(sx - jx) < 7 && sy > jy + 12 && sy < jy + 56) return { kind: 'junction', id: j.id, part: 'move-z' };
        // radius handle on the ring of the selected junction
        const rr = (j.radius || 0) * this.view.s;
        if (Math.hypot(sx - (jx + rr), sy - jy) < 8) return { kind: 'junction', id: j.id, part: 'radius' };
      }
    }
    if (sel.kind === 'road') {
      const r = p.roads.find((q) => q.id === sel.id);
      if (r) {
        for (let i = 0; i < r.ctrl.length; i++) {
          const [cx, cy] = this.w2s(r.ctrl[i].x, r.ctrl[i].z);
          if (Math.abs(cx - sx) < 7 && Math.abs(cy - sy) < 7) return { kind: 'ctrl', id: r.id, index: i };
        }
      }
    }
    if (sel.kind === 'area') {
      const a = (p.areas || []).find((q) => q.id === sel.id);
      if (a) {
        for (let i = 0; i < a.pts.length; i++) {
          const [cx, cy] = this.w2s(a.pts[i][0], a.pts[i][1]);
          if (Math.abs(cx - sx) < 7 && Math.abs(cy - sy) < 7) return { kind: 'area-vertex', id: a.id, index: i };
        }
      }
    }
    for (const j of p.junctions) {
      const [jx, jy] = this.w2s(j.x, j.z);
      if (within(jx, jy, 8)) return { kind: 'junction', id: j.id, part: 'body' };
    }
    // roads: distance to centreline
    if (st.net) {
      let best = null;
      for (const c of st.net.plan.centres) {
        for (let i = 0; i < c.pts.length - 1; i++) {
          const [ax, ay] = this.w2s(c.pts[i][0], c.pts[i][1]);
          const [bx, by] = this.w2s(c.pts[i + 1][0], c.pts[i + 1][1]);
          const dx = bx - ax;
          const dy = by - ay;
          const l2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / l2));
          const d = Math.hypot(ax + dx * t - sx, ay + dy * t - sy);
          if (d < 6 && (!best || d < best.d)) best = { d, id: c.id, t: (i + t) / (c.pts.length - 1) };
        }
      }
      if (best) return { kind: 'road', id: best.id, part: 'body', along: best.t };
    }
    if (p.areas) {
      const [x, z] = this.s2w(sx, sy);
      for (const a of p.areas) {
        if (pointIn(x, z, a.pts)) return { kind: 'area', id: a.id };
      }
    }
    return null;
  }
}

function pointIn(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
