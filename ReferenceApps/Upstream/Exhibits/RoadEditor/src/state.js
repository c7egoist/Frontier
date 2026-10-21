/* ════════════════════════════════════════════════════════════════════
   state.js — project store: selection, tools, undo/redo, autosave (DOM-free
   except for a guarded localStorage). Junction-linked endpoints resolve
   through the junction record so welded roads move as one.
   ════════════════════════════════════════════════════════════════════ */

const AUTOSAVE_KEY = 'frontier-road-editor/autosave-v1';
const MAX_HISTORY = 120;

/** Which junction (if any) drives this point? Only road ends can be welded. */
export function linkForPoint(project, roadId, index) {
  const road = project.roads.find((r) => r.id === roadId);
  if (!road || !road.points.length) return null;
  const end = index === 0 ? 'start' : index === road.points.length - 1 ? 'end' : null;
  if (!end || road.closed) return null;
  for (const j of project.junctions || []) {
    if ((j.links || []).some((l) => l.road === roadId && l.end === end)) return j;
  }
  return null;
}

/** Control points with junction overrides applied (for sampling + rendering). */
export function effectivePoints(project, road) {
  return road.points.map((p, i) => {
    const j = linkForPoint(project, road.id, i);
    return j ? {...p, x: j.x, z: j.z, y: j.y} : p;
  });
}

/** Move a point; welded ends move their junction (and every road on it). */
export function setPointPosition(project, roadId, index, x, z, y) {
  const road = project.roads.find((r) => r.id === roadId);
  if (!road || !road.points[index]) return false;
  const j = linkForPoint(project, roadId, index);
  if (j) {
    if (x !== undefined) j.x = x;
    if (z !== undefined) j.z = z;
    if (y !== undefined) j.y = y;
    return true;
  }
  const p = road.points[index];
  if (x !== undefined) p.x = x;
  if (z !== undefined) p.z = z;
  if (y !== undefined) p.y = y;
  return true;
}

export function roadById(project, id) {
  return (project.roads || []).find((r) => r.id === id) || null;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

export function createStore(initialProject) {
  let project = clone(initialProject);
  let selection = {kind: null, roadId: null, index: -1, junctionId: null};
  let tool = 'select';
  let view = 'plan';
  let ui = {snapGrid: true, gridSize: 1, snapNode: true, showIssues: true, wireframe: false, autoRotate: false};
  let flash = null; // {x, z, until} — transient map ping
  const past = [];
  const future = [];
  let savedSnapshot = JSON.stringify(project);
  let savedAt = null;
  const listeners = new Set();

  const snapshot = () => JSON.stringify(project);

  const store = {
    get project() { return project; },
    get selection() { return selection; },
    get tool() { return tool; },
    get view() { return view; },
    get ui() { return ui; },
    get flash() { return flash; },
    get dirty() { return snapshot() !== savedSnapshot; },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify(tag = 'project') {
      for (const fn of listeners) {
        try { fn(tag, store); } catch (e) { console.error(e); }
      }
    },

    /** Push the current state for a discrete edit, then mutate. */
    commit(label, fn) {
      past.push({label, snapshot: snapshot()});
      if (past.length > MAX_HISTORY) past.shift();
      future.length = 0;
      fn(project);
      store.notify('project');
    },
    /** Checkpoint a gesture start; follow with transient() calls, then endGesture(). */
    checkpoint(label) {
      past.push({label, snapshot: snapshot()});
      if (past.length > MAX_HISTORY) past.shift();
      future.length = 0;
    },
    transient(fn) {
      fn(project);
      store.notify('project-live');
    },
    endGesture() {
      // Drop the checkpoint if nothing actually changed.
      const top = past[past.length - 1];
      if (top && top.snapshot === snapshot()) past.pop();
      store.notify('project');
    },

    undo() {
      if (!past.length) return null;
      future.push({snapshot: snapshot()});
      const {label, snapshot: prev} = past.pop();
      project = JSON.parse(prev);
      store.clampSelection();
      store.notify('project');
      return label;
    },
    redo() {
      if (!future.length) return null;
      past.push({label: 'redo', snapshot: snapshot()});
      project = JSON.parse(future.pop().snapshot);
      store.clampSelection();
      store.notify('project');
      return true;
    },
    canUndo() { return past.length > 0; },
    canRedo() { return future.length > 0; },
    undoLabel() { return past.length ? past[past.length - 1].label : null; },

    select(sel) {
      selection = {kind: null, roadId: null, index: -1, junctionId: null, ...sel};
      store.clampSelection();
      store.notify('selection');
    },
    clampSelection() {
      if (selection.roadId && !roadById(project, selection.roadId)) {
        selection = {kind: null, roadId: null, index: -1, junctionId: null};
      } else if (selection.kind === 'point') {
        const road = roadById(project, selection.roadId);
        if (!road || selection.index < 0 || selection.index >= road.points.length) {
          selection = selection.roadId
            ? {kind: 'road', roadId: selection.roadId, index: -1, junctionId: null}
            : {kind: null, roadId: null, index: -1, junctionId: null};
        }
      } else if (selection.kind === 'junction') {
        if (!(project.junctions || []).some((j) => j.id === selection.junctionId)) {
          selection = {kind: null, roadId: null, index: -1, junctionId: null};
        }
      }
    },

    setTool(t) {
      if (tool === t) return;
      tool = t;
      store.notify('tool');
    },
    setView(v) {
      if (view === v) return;
      view = v;
      store.notify('view');
    },
    setUI(patch) {
      ui = {...ui, ...patch};
      store.notify('ui');
    },
    ping(x, z) {
      flash = {x, z, until: performance.now() + 1600};
      store.notify('flash');
      setTimeout(() => { flash = null; store.notify('flash'); }, 1650);
    },

    loadProject(next, {resetHistory = true} = {}) {
      project = clone(next);
      if (resetHistory) { past.length = 0; future.length = 0; }
      selection = {kind: null, roadId: null, index: -1, junctionId: null};
      savedSnapshot = snapshot();
      savedAt = Date.now();
      store.notify('project');
      store.notify('selection');
    },
    markSaved() {
      savedSnapshot = snapshot();
      savedAt = Date.now();
      store.notify('saved');
    },
    get savedAt() { return savedAt; },

    autosave() {
      try {
        if (typeof localStorage === 'undefined') return false;
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({at: Date.now(), project}));
        return true;
      } catch { return false; }
    }
  };
  return store;
}

export function loadAutosave() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.project || !Array.isArray(data.project.roads)) return null;
    return data;
  } catch { return null; }
}

export function clearAutosave() {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
}
