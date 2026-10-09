// Application controller: owns the project, runs commands with undo/redo, drives the
// plan and 3D views, the inspector, the outliner, exports and imports.

import { sampleProject, createProject, addNode, addRoad, removeNode, removeRoad, moveNode, moveRoadPoint, insertRoadPoint, removeRoadPoint, findNode, findRoad } from './model/project.js';
import { splitRoad, commitAtGrade, createInterchange } from './model/topology.js';
import { buildNetwork } from './geom/network.js';
import { makeTerrain } from './geom/terrain.js';
import { PlanView } from './render/plan.js';
import { SceneView } from './render/scene.js';
import { renderInspector } from './ui/inspector.js';
import { renderOutliner } from './ui/outliner.js';
import { setPath } from './ui/controls.js';
import { projectJson, parseProjectJson, importFile, bundleZip } from './export/project-io.js';
import { buildObj } from './export/obj.js';
import { patternPng } from './render/textures.js';
import { MATERIALS } from './model/materials.js';

const STORE_KEY = 'frontier-road-editor:v1';
const HISTORY_LIMIT = 120;

const TOOL_HINTS = {
  select: 'Select: click to select, drag junctions and points, double-click a road to add a point',
  node: 'Junction: click the ground to place a junction',
  road: 'Road: click a junction, the ground, or a road (to split it) to route a road. Double-click or Esc to finish',
  interchange: 'Interchange: click the upper road, then the lower road where they cross',
};

export class App {
  constructor(root) {
    this.root = root;
    this.project = null;
    this.net = null;
    this.selection = null;
    this.tool = 'select';
    this.draft = null;
    this.ixFirst = null;
    this.viewMode = 'split';
    this.past = [];
    this.future = [];
    this.editing = false;
    this.dragBase = null;
    this.reference = null;
    this.showMarkings = true;
    this._raf = null;
    this._saveTimer = null;
    this.$ = (sel) => root.querySelector(sel);
  }

  init() {
    this.projectFromStorage() || (this.project = sampleProject('crossroads'));
    this.plan = new PlanView(this.$('#plan-canvas'), {
      onSelect: (s) => this.select(s),
      onDragStart: () => this.beginDrag(),
      onDragNode: (id, x, z) => this.dragNode(id, x, z),
      onDragPoint: (id, i, x, z) => this.dragPoint(id, i, x, z),
      onDragEnd: () => this.endDrag(true),
      onDragCancel: () => this.endDrag(false),
      onToolClick: (c) => this.toolClick(c),
      onInsertPoint: (roadId, x, z) => this.insertPointAt(roadId, x, z),
      onCursor: (x, z) => this.setCursor(x, z),
    });
    this.scene = new SceneView(this.$('#view3d'), {
      onPick: (p) => this.onPick3d(p),
      onGizmoMove: (sel, pos) => this.gizmoMove(sel, pos),
      onDragging: (on) => (on ? this.beginDrag() : this.endDrag(true)),
    });
    this.bindChrome();
    this.refresh(true);
    this.fitAll();
    this.setTool('select');
    this.setView('split');
    this.updateHistoryButtons();
  }

  // ---------- persistence -----------------------------------------------

  projectFromStorage() {
    try {
      const text = localStorage.getItem(STORE_KEY);
      if (!text) return false;
      const { project } = parseProjectJson(text);
      this.project = project;
      return true;
    } catch {
      return false;
    }
  }

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, projectJson(this.project));
      } catch {
        /* storage full or disabled: the document is still in memory */
      }
    }, 300);
  }

  // ---------- history -----------------------------------------------------

  pushHistory() {
    this.past.push(JSON.stringify(this.project));
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.updateHistoryButtons();
  }

  undo() {
    if (!this.past.length) return;
    this.future.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.past.pop());
    this.afterUndo();
  }

  redo() {
    if (!this.future.length) return;
    this.past.push(JSON.stringify(this.project));
    this.project = JSON.parse(this.future.pop());
    this.afterUndo();
  }

  afterUndo() {
    if (this.selection && !this.exists(this.selection)) this.selection = null;
    this.draft = null;
    this.refresh(true);
    this.updateHistoryButtons();
    this.scheduleSave();
  }

  exists(sel) {
    if (!sel) return false;
    if (sel.type === 'node') return !!findNode(this.project, sel.id);
    if (sel.type === 'road') return !!findRoad(this.project, sel.id);
    if (sel.type === 'interchange') return this.project.interchanges.some((x) => x.id === sel.id);
    return true;
  }

  updateHistoryButtons() {
    const u = this.$('#btn-undo');
    const r = this.$('#btn-redo');
    if (u) u.disabled = !this.past.length;
    if (r) r.disabled = !this.future.length;
  }

  // ---------- refresh -----------------------------------------------------

  refresh(full, prebuilt = null) {
    const t0 = performance.now();
    this.net = prebuilt || buildNetwork(this.project);
    this.plan.setData({ net: this.net, project: this.project, selection: this.selection, tool: this.tool, draft: this.draft, showMarkings: this.showMarkings });
    this.scene.setNetwork(this.net, this.project, this.selection, { handles: full });
    if (full) {
      this.scene.attachGizmo(this.selection);
      this.renderPanels();
    } else {
      this.inspectorView?.sync(this.project, this.selection);
      this.renderStatus();
    }
    this.lastBuildMs = performance.now() - t0;
    this.renderStatus();
  }

  scheduleRefresh() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this.refresh(false);
    });
  }

  renderPanels() {
    renderOutliner(this.$('#outliner-body'), {
      project: this.project,
      net: this.net,
      selection: this.selection,
      onSelect: (s) => this.select(s),
    });
    this.inspectorView = renderInspector(this.$('#inspector-body'), {
      project: this.project,
      net: this.net,
      selection: this.selection,
      api: this.api(),
    });
    this.$('#insp-title').textContent = this.selection ? this.selectionTitle() : 'Project';
    this.$('#project-name').textContent = this.project.name;
    this.renderStatus();
  }

  selectionTitle() {
    const s = this.selection;
    if (!s) return 'Project';
    if (s.type === 'node') return findNode(this.project, s.id)?.name || 'Junction';
    if (s.type === 'road') return findRoad(this.project, s.id)?.name || 'Road';
    if (s.type === 'interchange') return this.project.interchanges.find((x) => x.id === s.id)?.name || 'Interchange';
    return 'Project';
  }

  renderStatus() {
    const n = this.net;
    const parts = [];
    if (n) {
      parts.push(`${n.stats.junctions} junctions`, `${n.stats.roads} roads`);
      if (n.stats.bridges) parts.push(`${n.stats.bridges} bridge spans`);
      if (n.stats.separated) parts.push(`${n.stats.separated} grade separation${n.stats.separated > 1 ? 's' : ''}`);
      if (n.stats.atGrade) parts.push(`${n.stats.atGrade} crossings at grade`);
      parts.push(`${n.stats.triangles.toLocaleString()} triangles`);
    }
    this.$('#status-text').textContent = parts.join(' · ');
    const warn = n ? n.warnings.length : 0;
    const dot = this.$('#status-dot');
    dot.className = `status-dot ${warn ? 'warn' : 'ok'}`;
    this.$('#status-warn').textContent = warn ? `${warn} check${warn > 1 ? 's' : ''}` : 'clean';
    this.$('#status-build').textContent = this.lastBuildMs ? `${this.lastBuildMs.toFixed(0)} ms` : '';
    this.$('#tool-hint').textContent = TOOL_HINTS[this.tool] || '';
  }

  setCursor(x, z) {
    this.$('#status-cursor').textContent = `x ${x.toFixed(1)}  z ${z.toFixed(1)} m`;
  }

  // ---------- selection and tools -----------------------------------------

  select(sel) {
    this.selection = sel;
    if (sel && sel.type !== 'road' && sel.type !== 'node' && sel.type !== 'point') this.selection = sel;
    this.plan.setData({ selection: this.selection });
    this.scene.setSelection(this.selection, this.project);
    this.scene.setNetwork(this.net, this.project, this.selection, { handles: true });
    this.scene.attachGizmo(this.selection);
    this.renderPanels();
  }

  setTool(tool) {
    this.tool = tool;
    this.draft = tool === 'road' ? this.draft : null;
    if (tool !== 'interchange') this.ixFirst = null;
    for (const b of this.root.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === tool);
    this.plan.setData({ tool, draft: this.draft });
    this.renderStatus();
  }

  setView(mode) {
    this.viewMode = mode;
    const v = this.$('#viewports');
    v.dataset.mode = mode;
    for (const b of this.root.querySelectorAll('[data-view]')) b.classList.toggle('active', b.dataset.view === mode);
    requestAnimationFrame(() => {
      this.plan.resize();
      this.scene.resize();
    });
  }

  fitAll() {
    const b = this.bounds();
    if (b) {
      this.plan.fit(b);
      this.scene.frame(b);
    }
  }

  bounds() {
    const pts = [];
    for (const n of this.project.nodes) pts.push([n.x, n.y, n.z]);
    for (const r of this.project.roads) for (const p of r.points) pts.push([p.x, p.y, p.z]);
    if (!pts.length) return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
    return { min: [min[0] - 40, min[1] - 4, min[2] - 40], max: [max[0] + 40, max[1] + 12, max[2] + 40] };
  }

  ground(x, z) {
    return makeTerrain(this.project.terrain).height(x, z) + 0.3;
  }

  onPick3d(p) {
    if (!p) {
      if (this.tool === 'select') this.select(null);
      return;
    }
    if (this.tool === 'road' && p.kind === 'road') {
      // route through the road under the pointer (splits it)
      return this.toolClick({ kind: 'road', roadId: p.id, station: this.stationNear(p.id, p.point), x: p.point?.x ?? 0, z: p.point?.z ?? 0 });
    }
    if (p.kind === 'node') return this.select({ type: 'node', id: p.id });
    if (p.kind === 'point') return this.select({ type: 'point', id: p.id, index: p.index });
    if (p.kind === 'road') return this.select({ type: 'road', id: p.id });
  }

  stationNear(roadId, point) {
    const rb = this.net?.roads.find((r) => r.id === roadId);
    if (!rb || !point) return rb ? (rb.s0 + rb.s1) / 2 : null;
    let best = { d: Infinity, s: 0 };
    const pts = rb.cl.pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const ax = pts[i][0];
      const az = pts[i][2];
      const vx = pts[i + 1][0] - ax;
      const vz = pts[i + 1][2] - az;
      const l2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((point.x - ax) * vx + (point.z - az) * vz) / l2));
      const d = Math.hypot(ax + vx * t - point.x, az + vz * t - point.z);
      if (d < best.d) best = { d, s: rb.cl.S[i] + (rb.cl.S[i + 1] - rb.cl.S[i]) * t };
    }
    return best.s;
  }

  // Tool clicks from the plan (node, road and interchange tools).
  toolClick(c) {
    if (this.tool === 'node') {
      if (c.kind !== 'node' && c.kind !== 'free') return;
      this.pushHistory();
      const n = addNode(this.project, { x: c.x, z: c.z, y: this.ground(c.x, c.z), name: `Junction ${this.project.nodes.length + 1}` });
      this.commitAndRefresh();
      this.select({ type: 'node', id: n.id });
      return;
    }
    if (this.tool === 'road') return this.roadClick(c);
    if (this.tool === 'interchange') return this.interchangeClick(c);
  }

  roadClick(c) {
    let nodeId = null;
    if (c.kind === 'node' && c.nodeId) nodeId = c.nodeId;
    else if (c.kind === 'road') {
      if (!this.net) return;
      this.pushHistory();
      const rb = this.net.roads.find((r) => r.id === c.roadId);
      const s = Math.max(rb.s0 + 2, Math.min(rb.s1 - 2, c.station ?? (rb.s0 + rb.s1) / 2));
      const f = rb.cl.at(s).p;
      const node = addNode(this.project, { x: f[0], y: f[1], z: f[2], name: `Junction ${this.project.nodes.length + 1}` });
      try {
        splitRoad(this.project, c.roadId, [{ s, node: node.id }], this.net);
      } catch (e) {
        this.past.pop();
        this.toast(e.message);
        return;
      }
      nodeId = node.id;
      this.commitAndRefresh();
    } else {
      // free ground: a point on the road being drawn, or a new junction to start from
      if (this.draft) {
        const last = this.draft.points[this.draft.points.length - 1];
        // ignore the second click of a double-click (and any click on top of the last point)
        if (last && Math.hypot(last.x - c.x, last.z - c.z) < 1.0) return;
        this.draft.points.push({ x: c.x, y: this.ground(c.x, c.z), z: c.z });
        this.plan.setData({ draft: this.draft });
        return;
      }
      this.pushHistory();
      const n = addNode(this.project, { x: c.x, z: c.z, y: this.ground(c.x, c.z), name: `Junction ${this.project.nodes.length + 1}` });
      nodeId = n.id;
      this.commitAndRefresh();
    }
    if (!this.draft) {
      this.draft = { from: nodeId, points: [] };
      this.plan.setData({ draft: this.draft });
      this.renderStatus();
      return;
    }
    if (this.draft.from === nodeId) return;
    this.pushHistory();
    addRoad(this.project, { from: this.draft.from, to: nodeId, points: this.draft.points, name: `Road ${this.project.roads.length + 1}` });
    this.draft = { from: nodeId, points: [] };
    this.commitAndRefresh();
  }

  // Esc, Enter or double-click: end the route. A route with interior points ends at its
  // last point, which becomes a new junction; a bare start junction is simply kept.
  finishDraft() {
    if (!this.draft) return;
    const d = this.draft;
    this.draft = null;
    if (d.points.length >= 1) {
      const last = d.points[d.points.length - 1];
      this.pushHistory();
      const end = addNode(this.project, { x: last.x, y: last.y, z: last.z, name: `Junction ${this.project.nodes.length + 1}` });
      addRoad(this.project, { from: d.from, to: end.id, points: d.points.slice(0, -1), name: `Road ${this.project.roads.length + 1}` });
      this.commitAndRefresh();
      return;
    }
    this.plan.setData({ draft: null });
    this.renderStatus();
  }

  interchangeClick(c) {
    if (c.kind !== 'road') {
      this.toast('Click on a road');
      return;
    }
    if (!this.ixFirst) {
      this.ixFirst = { roadId: c.roadId, station: c.station };
      this.toast(`Upper road: ${findRoad(this.project, c.roadId)?.name}. Now click the lower road.`);
      return;
    }
    const upper = this.ixFirst;
    this.ixFirst = null;
    if (upper.roadId === c.roadId) return this.toast('Pick two different roads');
    const cross = this.net.crossings.find((x) => (x.a === upper.roadId && x.b === c.roadId) || (x.a === c.roadId && x.b === upper.roadId));
    if (!cross) return this.toast('Those roads do not cross here. Pick two roads that cross in plan.');
    const sU = cross.a === upper.roadId ? cross.sA : cross.sB;
    const sL = cross.a === upper.roadId ? cross.sB : cross.sA;
    this.pushHistory();
    try {
      const rec = createInterchange(this.project, this.net, { upper: upper.roadId, lower: c.roadId, sU, sL, name: `Interchange ${this.project.interchanges.length + 1}` });
      this.commitAndRefresh();
      this.select({ type: 'interchange', id: rec.id });
      this.setTool('select');
    } catch (e) {
      this.past.pop();
      this.toast(e.message);
    }
  }

  insertPointAt(roadId, x, z) {
    const rb = this.net?.roads.find((r) => r.id === roadId);
    if (!rb) return;
    const s = this.stationNear(roadId, { x, z });
    // index = number of kept user points before this station
    let index = 0;
    rb.userStations.forEach((st, i) => {
      if (st !== null && st < s) index = i + 1;
    });
    this.pushHistory();
    insertRoadPoint(this.project, roadId, index, { x, y: this.ground(x, z), z });
    this.commitAndRefresh();
    this.select({ type: 'road', id: roadId });
  }

  // ---------- drags -------------------------------------------------------

  beginDrag() {
    if (this.editing) return;
    this.editing = true;
    this.pushHistory();
  }

  dragNode(id, x, z) {
    const n = findNode(this.project, id);
    if (!n) return;
    if (!this.dragBase) this.dragBase = {};
    if (!this.dragBase[id]) this.dragBase[id] = { offset: n.y - this.ground(n.x, n.z) + 0.3 };
    const off = this.dragBase[id].offset;
    n.x = x;
    n.z = z;
    n.y = this.ground(x, z) - 0.3 + off;
    this.scheduleRefresh();
  }

  dragPoint(roadId, index, x, z) {
    const r = findRoad(this.project, roadId);
    if (!r || !r.points[index]) return;
    const key = `${roadId}:${index}`;
    if (!this.dragBase) this.dragBase = {};
    if (!this.dragBase[key]) this.dragBase[key] = { offset: r.points[index].y - this.ground(r.points[index].x, r.points[index].z) + 0.3 };
    const off = this.dragBase[key].offset;
    moveRoadPoint(this.project, roadId, index, { x, y: this.ground(x, z) - 0.3 + off, z });
    this.scheduleRefresh();
  }

  gizmoMove(sel, pos) {
    if (sel.type === 'node') moveNode(this.project, sel.id, pos);
    if (sel.type === 'point') moveRoadPoint(this.project, sel.id, sel.index, pos);
    this.scheduleRefresh();
  }

  endDrag(keep) {
    this.dragBase = null;
    if (!this.editing) return;
    this.editing = false;
    if (!keep) {
      this.past.pop();
      this.updateHistoryButtons();
      this.refresh(true);
      return;
    }
    this.commitAndRefresh();
  }

  // ---------- commands ----------------------------------------------------

  // Used by inspector controls: phase 'begin' | 'live' | 'end' | 'commit'.
  api() {
    return {
      setField: (target, key, value, phase) => this.setField(target, key, value, phase),
      phase: (p) => {
        if (p === 'begin' && !this.editing) {
          this.editing = true;
          this.pushHistory();
        } else if (p === 'end' && this.editing) {
          this.editing = false;
          this.commitAndRefresh();
        }
      },
      command: (name, ...args) => this.command(name, ...args),
    };
  }

  setField(target, key, value, phase) {
    const apply = () => {
      if (target.type === 'project') {
        setPath(this.project, key, value);
      } else if (target.type === 'node') {
        const n = findNode(this.project, target.id);
        if (n) setPath(n, key, value);
      } else if (target.type === 'road') {
        const r = findRoad(this.project, target.id);
        if (r) setPath(r, key, value);
      }
    };
    if (phase === 'commit') {
      this.pushHistory();
      apply();
      this.commitAndRefresh();
      return;
    }
    if (phase === 'begin') this.pushHistory();
    apply();
    if (phase === 'live') this.scheduleRefresh();
    if (phase === 'end') this.commitAndRefresh();
  }

  command(name, ...args) {
    const p = this.project;
    switch (name) {
      case 'snapNode': {
        const n = findNode(p, args[0]);
        if (!n) return;
        this.pushHistory();
        n.y = this.ground(n.x, n.z);
        return this.commitAndRefresh();
      }
      case 'deleteNode': {
        this.pushHistory();
        removeNode(p, args[0]);
        this.selection = null;
        return this.commitAndRefresh();
      }
      case 'deleteRoad': {
        this.pushHistory();
        removeRoad(p, args[0]);
        this.selection = null;
        return this.commitAndRefresh();
      }
      case 'addMidPoint': {
        const rb = this.net?.roads.find((r) => r.id === args[0]);
        if (!rb) return;
        const s = (rb.s0 + rb.s1) / 2;
        const f = rb.cl.at(s).p;
        let index = 0;
        rb.userStations.forEach((st, i) => {
          if (st !== null && st < s) index = i + 1;
        });
        this.pushHistory();
        insertRoadPoint(p, args[0], index, { x: f[0], y: f[1], z: f[2] });
        return this.commitAndRefresh();
      }
      case 'removeLastPoint': {
        const r = findRoad(p, args[0]);
        if (!r || !r.points.length) return;
        this.pushHistory();
        removeRoadPoint(p, args[0], r.points.length - 1);
        return this.commitAndRefresh();
      }
      case 'splitMiddle': {
        const rb = this.net?.roads.find((r) => r.id === args[0]);
        if (!rb) return;
        const s = (rb.s0 + rb.s1) / 2;
        const f = rb.cl.at(s).p;
        this.pushHistory();
        const node = addNode(p, { x: f[0], y: f[1], z: f[2], name: `Junction ${p.nodes.length + 1}` });
        try {
          splitRoad(p, args[0], [{ s, node: node.id }], this.net);
        } catch (e) {
          this.past.pop();
          return this.toast(e.message);
        }
        this.selection = { type: 'node', id: node.id };
        return this.commitAndRefresh();
      }
      case 'renameInterchange': {
        const ix = p.interchanges.find((x) => x.id === args[0]);
        if (!ix) return;
        this.pushHistory();
        ix.name = String(args[1]);
        return this.commitAndRefresh();
      }
      case 'forgetInterchange': {
        this.pushHistory();
        p.interchanges = p.interchanges.filter((x) => x.id !== args[0]);
        this.selection = null;
        return this.commitAndRefresh();
      }
      default:
        return undefined;
    }
  }

  // After any model change that may move geometry: convert at-grade crossings,
  // rebuild, save.
  commitAndRefresh() {
    let net = buildNetwork(this.project);
    if (net.crossings.some((c) => c.grade === 'at-grade')) {
      const count = commitAtGrade(this.project);
      if (count) this.toast(`${count} at-grade crossing${count > 1 ? 's' : ''} converted to junction${count > 1 ? 's' : ''}`);
      net = null;
    }
    this.refresh(true, net);
    this.updateHistoryButtons();
    this.scheduleSave();
  }

  toast(msg) {
    const t = this.$('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // ---------- new / samples ----------------------------------------------

  loadProject(project, label) {
    this.pushHistory();
    this.project = project;
    this.selection = null;
    this.draft = null;
    this.reference = null;
    this.scene.setReference(null);
    this.refresh(true);
    this.fitAll();
    this.scheduleSave();
    if (label) this.toast(label);
  }

  // ---------- exports and imports ----------------------------------------

  baseName() {
    return (this.project.name || 'road-network').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'road-network';
  }

  async exportBundle() {
    this.toast('Building bundle…');
    const tex = new Map();
    for (const key of this.net.mesh.groups.keys()) {
      const m = MATERIALS[key];
      if (m?.texture && !tex.has(key)) {
        const png = await patternPng(m.texture);
        if (png) tex.set(key, png);
      }
    }
    const base = this.baseName();
    const zip = bundleZip(this.project, this.net.mesh, tex, base);
    download(new Blob([zip], { type: 'application/zip' }), `${base}.zip`);
    this.toast(`Exported ${base}.zip (OBJ, MTL, textures, project.json)`);
  }

  exportObj() {
    const base = this.baseName();
    const { obj, mtl } = buildObj(this.net.mesh, { name: base });
    download(new Blob([obj], { type: 'text/plain' }), `${base}.obj`);
    setTimeout(() => download(new Blob([mtl], { type: 'text/plain' }), `${base}.mtl`), 250);
    this.toast(`Exported ${base}.obj and ${base}.mtl`);
  }

  exportJson() {
    const base = this.baseName();
    download(new Blob([projectJson(this.project)], { type: 'application/json' }), `${base}.json`);
    this.toast(`Exported ${base}.json`);
  }

  async importFileObj(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const res = await importFile(file.name, bytes);
      if (res.kind === 'obj') {
        this.scene.setReference(res.reference);
        this.reference = res.reference;
        this.toast(`Reference mesh loaded: ${res.reference.triangles.toLocaleString()} triangles (shown as a translucent layer)`);
        return;
      }
      if (!window.confirm(`Replace the current network with "${file.name}"? The current network stays available with Undo.`)) return;
      this.loadProject(res.project, `Imported ${res.project.name}`);
      if (res.warnings?.length) this.toast(res.warnings[0]);
    } catch (e) {
      this.toast(`Import failed: ${e.message}`);
    }
  }

  // ---------- chrome (buttons, menus, keys) --------------------------------

  bindChrome() {
    const on = (sel, ev, fn) => {
      const n = this.$(sel);
      if (n) n.addEventListener(ev, fn);
      return n;
    };
    for (const b of this.root.querySelectorAll('[data-tool]')) b.addEventListener('click', () => this.setTool(b.dataset.tool));
    for (const b of this.root.querySelectorAll('[data-view]')) b.addEventListener('click', () => this.setView(b.dataset.view));
    on('#btn-undo', 'click', () => this.undo());
    on('#btn-redo', 'click', () => this.redo());
    on('#btn-fit', 'click', () => this.fitAll());
    on('#btn-snap', 'click', (e) => {
      this.plan.snap = !this.plan.snap;
      e.currentTarget.classList.toggle('active', this.plan.snap);
    });
    this.$('#btn-snap')?.classList.add('active');
    on('#btn-markings', 'click', (e) => {
      this.showMarkings = !this.showMarkings;
      e.currentTarget.classList.toggle('active', this.showMarkings);
      this.refresh(false);
    });
    this.$('#btn-markings')?.classList.add('active');

    // menus
    for (const m of this.root.querySelectorAll('[data-menu]')) {
      const btn = m.querySelector('.menu-btn');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = m.classList.contains('open');
        this.root.querySelectorAll('.menu.open').forEach((x) => x.classList.remove('open'));
        m.classList.toggle('open', !open);
      });
    }
    window.addEventListener('click', () => this.root.querySelectorAll('.menu.open').forEach((x) => x.classList.remove('open')));
    const act = {
      'new-empty': () => this.loadProject(createProject('Untitled road network'), 'New empty project'),
      'sample-crossroads': () => this.loadProject(sampleProject('crossroads'), 'Loaded crossroads village'),
      'sample-valley': () => this.loadProject(sampleProject('valley'), 'Loaded valley crossing'),
      'commit-crossings': () => {
        this.pushHistory();
        const n = commitAtGrade(this.project);
        this.refresh(true);
        this.scheduleSave();
        this.toast(n ? `${n} crossing${n > 1 ? 's' : ''} converted to junctions` : 'No at-grade crossings to convert');
      },
      'export-bundle': () => this.exportBundle(),
      'export-obj': () => this.exportObj(),
      'export-json': () => this.exportJson(),
      'import': () => this.$('#import-file').click(),
      'reference-toggle': () => {
        if (!this.reference) return this.toast('Import an OBJ first to show it as a reference');
        const on = this.scene.referenceMesh?.visible === false;
        this.scene.showReference(on);
      },
      'reference-clear': () => {
        this.reference = null;
        this.scene.setReference(null);
      },
      'reset-storage': () => {
        localStorage.removeItem(STORE_KEY);
        this.toast('Saved copy cleared');
      },
    };
    for (const b of this.root.querySelectorAll('[data-act]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.root.querySelectorAll('.menu.open').forEach((x) => x.classList.remove('open'));
        act[b.dataset.act]?.();
      });
    }
    on('#import-file', 'change', (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) this.importFileObj(f);
    });
    on('#project-name', 'dblclick', () => {
      const v = window.prompt('Project name', this.project.name);
      if (v) {
        this.pushHistory();
        this.project.name = v.trim() || this.project.name;
        this.refresh(true);
        this.scheduleSave();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? this.redo() : this.undo();
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return this.redo();
      }
      if (mod) return;
      const k = e.key.toLowerCase();
      if (k === 'v') this.setTool('select');
      else if (k === 'n') this.setTool('node');
      else if (k === 'r') this.setTool('road');
      else if (k === 'i') this.setTool('interchange');
      else if (k === 'f') this.fitAll();
      else if (k === 'escape') {
        this.finishDraft();
        this.ixFirst = null;
        if (this.tool !== 'select') this.setTool('select');
        else this.select(null);
      } else if (k === 'enter') this.finishDraft();
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = this.selection;
        if (!s) return;
        e.preventDefault();
        if (s.type === 'node') this.command('deleteNode', s.id);
        else if (s.type === 'road') this.command('deleteRoad', s.id);
        else if (s.type === 'point') {
          this.pushHistory();
          removeRoadPoint(this.project, s.id, s.index);
          this.commitAndRefresh();
        }
      }
    });
    this.plan.canvas.addEventListener('dblclick', () => {
      if (this.tool === 'road') this.finishDraft();
    });
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

