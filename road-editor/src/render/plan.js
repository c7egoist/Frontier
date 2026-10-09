// 2D plan view on a canvas. Draws the same built geometry as the 3D view, as flat
// bands, and handles selection, dragging, tool clicks and camera control.
// Plan convention: x to the right, screen-up is -z (north), metres.

const COLORS = {
  bg: '#14171c',
  grid: 'rgba(160,170,185,0.07)',
  gridMajor: 'rgba(160,170,185,0.16)',
  axis: 'rgba(120,200,190,0.35)',
  asphalt: '#3a3f47',
  gutter: '#5d636b',
  concrete: '#9ca2aa',
  walk: '#c3c8ce',
  ditch: '#4a5a3b',
  paving: '#8d6a55',
  cobble: '#6f6b65',
  gravel: '#a99c7c',
  grass: '#55683f',
  teal: '#2fb8a6',
  amber: '#f5b341',
  violet: '#a78bfa',
  red: '#f0616d',
  text: '#d7dce3',
  dim: '#7d8592',
};

export function planColor(key) {
  if (key === 'asphalt' || key === 'carriage') return COLORS.asphalt;
  if (key === 'gutter') return COLORS.gutter;
  if (key === 'concrete') return COLORS.concrete;
  if (key === 'ditch') return COLORS.ditch;
  if (key === 'pave:cobble') return COLORS.cobble;
  if (key === 'pave:gravel') return COLORS.gravel;
  if (key && key.startsWith('pave:')) return COLORS.paving;
  if (key === 'batter') return COLORS.grass;
  return COLORS.walk;
}

export class PlanView {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.cam = { cx: 0, cz: 0, s: 2 };
    this.net = null;
    this.project = null;
    this.selection = null;
    this.tool = 'select';
    this.draft = null;
    this.snap = true;
    this.showMarkings = true;
    this.cursor = null;
    this.drag = null;
    this.pan = null;
    this.spaceDown = false;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this._bind();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement);
    this.resize();
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.W = Math.max(10, Math.floor(r.width));
    this.H = Math.max(10, Math.floor(r.height));
    this.canvas.width = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.draw();
  }

  setData({ net, project, selection, tool, draft, showMarkings }) {
    if (net !== undefined) this.net = net;
    if (project !== undefined) this.project = project;
    if (selection !== undefined) this.selection = selection;
    if (tool !== undefined) this.tool = tool;
    if (draft !== undefined) this.draft = draft;
    if (showMarkings !== undefined) this.showMarkings = showMarkings;
    this.draw();
  }

  fit(bounds) {
    if (!bounds) return;
    const w = bounds.max[0] - bounds.min[0];
    const h = bounds.max[2] - bounds.min[2];
    this.cam.cx = (bounds.min[0] + bounds.max[0]) / 2;
    this.cam.cz = (bounds.min[2] + bounds.max[2]) / 2;
    const s = Math.min((this.W - 120) / Math.max(40, w), (this.H - 120) / Math.max(40, h));
    this.cam.s = Math.max(0.2, Math.min(12, s));
    this.draw();
  }

  // world <-> screen
  toScreen(x, z) {
    return [(x - this.cam.cx) * this.cam.s + this.W / 2, (z - this.cam.cz) * this.cam.s + this.H / 2];
  }

  toWorld(sx, sy) {
    return [(sx - this.W / 2) / this.cam.s + this.cam.cx, (sy - this.H / 2) / this.cam.s + this.cam.cz];
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('dblclick', (e) => this._dbl(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [sx, sy] = this._localScreen(e);
        const [wx, wz] = this.toWorld(sx, sy);
        const f = Math.exp(-e.deltaY * 0.0015);
        this.cam.s = Math.max(0.15, Math.min(40, this.cam.s * f));
        // keep the world point under the cursor fixed
        const [nx, nz] = this.toWorld(sx, sy);
        this.cam.cx += wx - nx;
        this.cam.cz += wz - nz;
        this.draw();
      },
      { passive: false }
    );
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && e.target === document.body) {
        this.spaceDown = true;
        this.canvas.style.cursor = 'grab';
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        this.canvas.style.cursor = '';
      }
    });
  }

  _localScreen(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  _local(e) {
    const [sx, sy] = this._localScreen(e);
    return this.toWorld(sx, sy);
  }

  _snapv(v) {
    if (!this.snap) return v;
    return Math.round(v * 2) / 2;
  }

  // Nearest node / interior point / road under the pointer (screen pixels).
  hitTest(sx, sy) {
    if (!this.net || !this.project) return null;
    let best = null;
    for (const n of this.project.nodes) {
      const [px, py] = this.toScreen(n.x, n.z);
      const d = Math.hypot(px - sx, py - sy);
      if (d < 10 && (!best || d < best.d)) best = { type: 'node', id: n.id, d };
    }
    if (best) return best;
    if (this.selection && this.selection.type === 'road') {
      const r = this.project.roads.find((x) => x.id === this.selection.id);
      if (r) {
        r.points.forEach((p, i) => {
          const [px, py] = this.toScreen(p.x, p.z);
          const d = Math.hypot(px - sx, py - sy);
          if (d < 9 && (!best || d < best.d)) best = { type: 'point', id: r.id, index: i, d };
        });
      }
    }
    if (best) return best;
    let road = null;
    for (const rb of this.net.roads) {
      const pts = rb.cl.pts;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = this.toScreen(pts[i][0], pts[i][2]);
        const [bx, by] = this.toScreen(pts[i + 1][0], pts[i + 1][2]);
        const d = segDist(sx, sy, ax, ay, bx, by);
        if (d < 7 && (!road || d < road.d)) road = { type: 'road', id: rb.id, d };
      }
    }
    return road;
  }

  _down(e) {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spaceDown)) {
      this.pan = { sx: e.clientX, sy: e.clientY, cx: this.cam.cx, cz: this.cam.cz };
      this.canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const [sx, sy] = this._localScreen(e);
    const [wx, wz] = this.toWorld(sx, sy);
    const hit = this.hitTest(sx, sy);
    if (this.tool === 'select') {
      if (hit && hit.type === 'node') {
        this.drag = { kind: 'node', id: hit.id, moved: false, down: [sx, sy] };
        this.hooks.onSelect?.({ type: 'node', id: hit.id });
        this.hooks.onDragStart?.();
      } else if (hit && hit.type === 'point') {
        this.drag = { kind: 'point', id: hit.id, index: hit.index, moved: false, down: [sx, sy] };
        this.hooks.onDragStart?.();
      } else if (hit && hit.type === 'road') {
        this.hooks.onSelect?.({ type: 'road', id: hit.id });
      } else {
        this.hooks.onSelect?.(null);
        this.drag = null;
        this.pan = null;
        this.drag = { kind: 'none', down: [sx, sy], moved: false };
      }
      return;
    }
    if (this.tool === 'node') {
      this.hooks.onToolClick?.({ kind: 'node', x: this._snapv(wx), z: this._snapv(wz) });
      return;
    }
    if (this.tool === 'road') {
      if (hit && hit.type === 'node') this.hooks.onToolClick?.({ kind: 'node', nodeId: hit.id, x: wx, z: wz });
      else if (hit && hit.type === 'road') {
        const station = this._stationOn(hit.id, wx, wz);
        this.hooks.onToolClick?.({ kind: 'road', roadId: hit.id, station, x: wx, z: wz });
      } else this.hooks.onToolClick?.({ kind: 'free', x: this._snapv(wx), z: this._snapv(wz) });
      return;
    }
    if (this.tool === 'interchange') {
      if (hit && hit.type === 'road') {
        const station = this._stationOn(hit.id, wx, wz);
        this.hooks.onToolClick?.({ kind: 'road', roadId: hit.id, station, x: wx, z: wz });
      }
      return;
    }
  }

  _stationOn(roadId, wx, wz) {
    const rb = this.net?.roads.find((r) => r.id === roadId);
    if (!rb) return null;
    let best = { d: Infinity, s: 0 };
    const pts = rb.cl.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i][0];
      const az = pts[i][2];
      const bx = pts[i + 1][0];
      const bz = pts[i + 1][2];
      const vx = bx - ax;
      const vz = bz - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((wx - ax) * vx + (wz - az) * vz) / l2));
      const d = Math.hypot(ax + vx * t - wx, az + vz * t - wz);
      if (d < best.d) best = { d, s: rb.cl.S[i] + (rb.cl.S[i + 1] - rb.cl.S[i]) * t };
    }
    return best.s;
  }

  _move(e) {
    const [sx, sy] = this._localScreen(e);
    const inside = sx >= 0 && sy >= 0 && sx <= this.W && sy <= this.H;
    if (inside) {
      const [wx, wz] = this.toWorld(sx, sy);
      this.cursor = [wx, wz];
      this.hooks.onCursor?.(wx, wz);
    }
    if (this.pan) {
      this.cam.cx = this.pan.cx - (e.clientX - this.pan.sx) / this.cam.s;
      this.cam.cz = this.pan.cz - (e.clientY - this.pan.sy) / this.cam.s;
      this.draw();
      return;
    }
    if (this.drag && this.drag.down) {
      const dx = sx - this.drag.down[0];
      const dy = sy - this.drag.down[1];
      if (!this.drag.moved && Math.hypot(dx, dy) < 3) return;
      this.drag.moved = true;
      const [wx, wz] = this.toWorld(sx, sy);
      if (this.drag.kind === 'node') this.hooks.onDragNode?.(this.drag.id, this._snapv(wx), this._snapv(wz));
      if (this.drag.kind === 'point') this.hooks.onDragPoint?.(this.drag.id, this.drag.index, this._snapv(wx), this._snapv(wz));
      return;
    }
    if (this.tool === 'road' && this.draft) this.draw();
    if (this.tool === 'node' || this.tool === 'road' || this.tool === 'interchange') this.draw();
  }

  _up(e) {
    if (this.pan) {
      this.pan = null;
      this.canvas.style.cursor = this.spaceDown ? 'grab' : '';
      return;
    }
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (d.kind === 'none') {
      if (!d.moved) this.hooks.onSelect?.(null);
      return;
    }
    if (d.moved) this.hooks.onDragEnd?.();
    else this.hooks.onDragCancel?.();
  }

  _dbl(e) {
    if (this.tool !== 'select') return;
    const [sx, sy] = this._localScreen(e);
    const hit = this.hitTest(sx, sy);
    if (hit && hit.type === 'road') {
      const [wx, wz] = this.toWorld(sx, sy);
      this.hooks.onInsertPoint?.(hit.id, wx, wz);
    }
  }

  // ---- drawing -----------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.W, this.H);
    this._grid();
    if (this.net) {
      this._roads();
      this._junctions();
      if (this.showMarkings) this._markings();
    }
    this._roadLabels();
    this._nodes();
    this._crossings();
    this._draft();
    this._overlays();
  }

  _grid() {
    const ctx = this.ctx;
    const s = this.cam.s;
    let step = 1;
    const cands = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    for (const c of cands) {
      if (c * s >= 40) {
        step = c;
        break;
      }
      step = c;
    }
    const [x0, z0] = this.toWorld(0, 0);
    const [x1, z1] = this.toWorld(this.W, this.H);
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    const ctx2 = this.ctx;
    ctx2.lineWidth = 1;
    for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
      const [sx] = this.toScreen(x, 0);
      ctx2.strokeStyle = Math.abs(x % (step * 5)) < 1e-6 ? COLORS.gridMajor : COLORS.grid;
      ctx2.beginPath();
      ctx2.moveTo(Math.round(sx) + 0.5, 0);
      ctx2.lineTo(Math.round(sx) + 0.5, this.H);
      ctx2.stroke();
    }
    for (let z = Math.floor(minZ / step) * step; z <= maxZ; z += step) {
      const [, sy] = this.toScreen(0, z);
      ctx2.strokeStyle = Math.abs(z % (step * 5)) < 1e-6 ? COLORS.gridMajor : COLORS.grid;
      ctx2.beginPath();
      ctx2.moveTo(0, Math.round(sy) + 0.5);
      ctx2.lineTo(this.W, Math.round(sy) + 0.5);
      ctx2.stroke();
    }
    // origin axes
    const [ox, oy] = this.toScreen(0, 0);
    ctx2.strokeStyle = COLORS.axis;
    ctx2.beginPath();
    ctx2.moveTo(0, Math.round(oy) + 0.5);
    ctx2.lineTo(this.W, Math.round(oy) + 0.5);
    ctx2.moveTo(Math.round(ox) + 0.5, 0);
    ctx2.lineTo(Math.round(ox) + 0.5, this.H);
    ctx2.stroke();
    this._gridStep = step;
  }

  _poly(points, fill) {
    const ctx = this.ctx;
    ctx.beginPath();
    points.forEach(([x, z], i) => {
      const [sx, sy] = this.toScreen(x, z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  }

  _roads() {
    const sel = this.selection && this.selection.type === 'road' ? this.selection.id : null;
    for (const r of this.net.roads) {
      // carriageway and structure bands from the built geometry
      for (const band of r.body.planBands) {
        if (band.key === 'paint-white' || band.key === 'paint-yellow') continue;
        this._poly(band.poly, planColor(band.key));
      }
      // bridge spans: a violet centre strip
      for (const [s0, s1] of r.body.runs.bridge) {
        const pts = [];
        const n = Math.max(2, Math.ceil((s1 - s0) / 4));
        for (let i = 0; i <= n; i++) {
          const f = r.cl.at(s0 + ((s1 - s0) * i) / n);
          pts.push([f.p[0], f.p[2]]);
        }
        this.ctx.lineWidth = Math.max(1.5, 0.9 * this.cam.s);
        this.ctx.strokeStyle = 'rgba(167,139,250,0.65)';
        this._line(pts);
      }
      // centreline (faint) and selection outline
      const selected = sel === r.id;
      this.ctx.lineWidth = selected ? 2 : 1;
      this.ctx.strokeStyle = selected ? COLORS.amber : 'rgba(215,220,227,0.35)';
      this._line(r.cl.pts.map((p) => [p[0], p[2]]));
      if (selected) {
        const band = r.body.planBands.find((b) => b.key !== 'paint-white' && b.key !== 'paint-yellow');
        if (band) {
          this.ctx.lineWidth = 2;
          this.ctx.strokeStyle = COLORS.amber;
          this._poly(band.poly, null);
          this.ctx.stroke();
        }
      }
    }
  }

  _line(pts) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach(([x, z], i) => {
      const [sx, sy] = this.toScreen(x, z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  }

  _junctions() {
    for (const j of this.net.junctions) {
      const rings = j.J.rings;
      if (!rings || !rings.length) continue;
      // painter's order: outer loop first, carriageway last
      const fills = ['#3a3f47', '#5d636b', '#9ca2aa', '#c3c8ce', '#4a5a3b', '#4a5a3b'];
      for (let k = 5; k >= 0; k--) {
        const pts = rings[k].map((q) => [q.x, q.z]);
        this._poly(pts, fills[k]);
      }
      // carriageway boundary with crown points
      this._poly(j.J.fan.map((q) => [q.x, q.z]), COLORS.asphalt);
      if (j.warnings && j.warnings.length) {
        const [sx, sy] = this.toScreen(j.J.x, j.J.z);
        this.ctx.fillStyle = COLORS.red;
        this.ctx.beginPath();
        this.ctx.arc(sx + 12, sy - 12, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  _markings() {
    const ctx = this.ctx;
    for (const r of this.net.roads) {
      for (const m of r.body.marks || []) {
        if (m.key !== 'paint-yellow' && m.key !== 'paint-white') continue;
        const pts = [];
        const n = Math.max(1, Math.ceil((m.b - m.a) / 2));
        for (let i = 0; i <= n; i++) {
          const f = r.cl.at(m.a + ((m.b - m.a) * i) / n);
          const off = m.u;
          pts.push([f.p[0] + off * f.n[0], f.p[2] + off * f.n[1]]);
        }
        ctx.lineWidth = Math.max(1, 0.25 * this.cam.s);
        ctx.strokeStyle = m.key === 'paint-yellow' ? 'rgba(233,194,77,0.9)' : 'rgba(244,244,240,0.85)';
        this._line(pts);
      }
    }
  }

  // Road names at mid-span. Shown when zoomed in, or always for the selected road.
  _roadLabels() {
    if (!this.net) return;
    const sel = this.selection && this.selection.type === 'road' ? this.selection.id : null;
    this.ctx.font = '11px "DM Sans", system-ui, sans-serif';
    for (const r of this.net.roads) {
      const isSel = r.id === sel;
      if (!isSel && this.cam.s < 0.6) continue;
      const f = r.cl.at(r.cl.L / 2);
      const [sx, sy] = this.toScreen(f.p[0], f.p[2]);
      this.ctx.fillStyle = isSel ? COLORS.amber : COLORS.dim;
      this.ctx.fillText(r.name, sx + 6, sy - 6);
    }
  }

  _nodes() {
    if (!this.project) return;
    const sel = this.selection;
    const deg = new Map();
    for (const r of this.project.roads) {
      deg.set(r.from, (deg.get(r.from) || 0) + 1);
      deg.set(r.to, (deg.get(r.to) || 0) + 1);
    }
    for (const n of this.project.nodes) {
      const [sx, sy] = this.toScreen(n.x, n.z);
      const isSel = sel && sel.type === 'node' && sel.id === n.id;
      const d = deg.get(n.id) || 0;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, isSel ? 6 : 4.5, 0, Math.PI * 2);
      this.ctx.fillStyle = d >= 3 ? COLORS.teal : d === 1 ? '#8c96a3' : '#5ed1c0';
      this.ctx.fill();
      this.ctx.lineWidth = isSel ? 2 : 1;
      this.ctx.strokeStyle = isSel ? COLORS.amber : '#0c0e11';
      this.ctx.stroke();
      // interchange nodes carry long names; they are labelled only when zoomed in
      const minScale = n.name.includes(' · ') ? 0.9 : 0.25;
      if (this.cam.s > minScale || isSel) {
        this.ctx.font = '11px "DM Sans", system-ui, sans-serif';
        this.ctx.fillStyle = COLORS.text;
        this.ctx.fillText(n.name, sx + 8, sy + 4);
      }
    }
    if (sel && sel.type === 'road') {
      const r = this.project.roads.find((x) => x.id === sel.id);
      if (r) {
        this.ctx.beginPath();
        r.points.forEach((p) => {
          const [sx, sy] = this.toScreen(p.x, p.z);
          this.ctx.rect(sx - 4, sy - 4, 8, 8);
          this.ctx.fillStyle = COLORS.amber;
          this.ctx.fill();
        });
      }
    }
  }

  _crossings() {
    if (!this.net) return;
    for (const c of this.net.crossings) {
      const [sx, sy] = this.toScreen(c.x, c.z);
      this.ctx.lineWidth = 1.5;
      if (c.grade === 'separated') {
        this.ctx.strokeStyle = COLORS.violet;
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.strokeStyle = COLORS.red;
        this.ctx.beginPath();
        this.ctx.moveTo(sx - 5, sy - 5);
        this.ctx.lineTo(sx + 5, sy + 5);
        this.ctx.moveTo(sx + 5, sy - 5);
        this.ctx.lineTo(sx - 5, sy + 5);
        this.ctx.stroke();
      }
    }
    for (const ix of this.project?.interchanges || []) {
      const ns = ix.nodes.map((id) => this.project.nodes.find((n) => n.id === id)).filter(Boolean);
      if (ns.length < 3) continue;
      const cx = ns.reduce((s, n) => s + n.x, 0) / ns.length;
      const cz = ns.reduce((s, n) => s + n.z, 0) / ns.length;
      const order = ns.slice().sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
      this.ctx.setLineDash([5, 4]);
      this.ctx.strokeStyle = 'rgba(167,139,250,0.7)';
      this.ctx.lineWidth = 1.2;
      this._line([...order.map((n) => [n.x, n.z]), [order[0].x, order[0].z]]);
      this.ctx.setLineDash([]);
      const [lx, ly] = this.toScreen(cx, cz);
      this.ctx.font = '11px "DM Sans", system-ui, sans-serif';
      this.ctx.fillStyle = COLORS.violet;
      this.ctx.fillText(ix.name, lx + 4, ly - 4);
    }
  }

  _draft() {
    if (!this.draft || this.tool !== 'road') return;
    const pts = [];
    if (this.draft.from) pts.push([this.draft.from.x, this.draft.from.z]);
    for (const p of this.draft.points || []) pts.push([p.x, p.z]);
    if (this.cursor) pts.push(this.cursor);
    if (pts.length < 2) return;
    this.ctx.setLineDash([6, 4]);
    this.ctx.strokeStyle = COLORS.amber;
    this.ctx.lineWidth = 1.5;
    this._line(pts);
    this.ctx.setLineDash([]);
    for (const p of this.draft.points || []) {
      const [sx, sy] = this.toScreen(p.x, p.z);
      this.ctx.fillStyle = COLORS.amber;
      this.ctx.fillRect(sx - 3, sy - 3, 6, 6);
    }
  }

  _overlays() {
    const ctx = this.ctx;
    // north arrow and axes (bottom-left)
    const ax = 36;
    const ay = this.H - 36;
    ctx.strokeStyle = COLORS.dim;
    ctx.fillStyle = COLORS.dim;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax, ay - 22);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + 20, ay);
    ctx.stroke();
    ctx.font = '11px "DM Sans", system-ui, sans-serif';
    ctx.fillText('N', ax - 4, ay - 26);
    ctx.fillText('X', ax + 24, ay + 4);
    ctx.fillText('Z', ax - 4, ay + 16);
    // scale bar (bottom-right)
    const step = this._gridStep || 10;
    const len = step * this.cam.s;
    const sx = this.W - 24 - len;
    const sy = this.H - 24;
    ctx.fillStyle = COLORS.text;
    ctx.fillRect(sx, sy, len, 3);
    ctx.fillText(`${step} m`, sx, sy - 6);
    // tool hint
    if (this.tool !== 'select') {
      ctx.fillStyle = COLORS.amber;
      const hint = { node: 'Click to place a junction', road: 'Click nodes or empty ground to route a road · double-click or Esc to finish', interchange: 'Click the upper road, then the lower road, to build an interchange' }[this.tool];
      ctx.fillText(hint || '', 14, 20);
    }
  }
}

function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(ax + vx * t - px, ay + vy * t - py);
}
