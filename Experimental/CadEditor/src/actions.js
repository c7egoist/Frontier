// Document actions. Every mutation goes through commit(), which pushes an undo snapshot.

import { getState, setState, toast, persistSoon } from "./store.js";
import { NODE_TYPES, defaultParams, nodeKind } from "./model/nodeTypes.js";

const HISTORY_LIMIT = 200;
let lastCoalesce = { key: null, at: 0 };

const clone = (v) => structuredClone(v);

// Run a mutator on a copy of the document and record the previous state for undo.
export function commit(mutator, { coalesce = null } = {}) {
  const s = getState();
  const before = s.doc;
  const after = mutator(clone(before));
  const now = Date.now();
  const merge = coalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 900 && s.past.length;
  lastCoalesce = { key: coalesce, at: now };
  const past = merge ? s.past : [...s.past, before].slice(-HISTORY_LIMIT);
  setState({ doc: after, past, future: [] });
  persistSoon();
  return after;
}

// Same as commit() but without touching history (kernel-internal bookkeeping).
function nextIdOf(doc) {
  const id = `n${doc.nextId}`;
  doc.nextId += 1;
  return id;
}

function nameFor(doc, type) {
  const label = NODE_TYPES[type].label.replace(/\s*\(.*\)$/, "");
  const count = Object.values(doc.nodes).filter((n) => n.type === type).length + 1;
  return `${label} ${count}`;
}

function insertNode(doc, type, { params, inputs = [], xf = null, name, visible = true }) {
  const id = nextIdOf(doc);
  doc.nodes[id] = {
    id,
    type,
    name: name || nameFor(doc, type),
    inputs,
    params: params ?? defaultParams(type),
    xf,
    visible,
  };
  doc.order.push(id);
  return id;
}

// Nodes that consume `id` as an input.
export function consumersOf(doc, id) {
  return Object.values(doc.nodes).filter((n) => (n.inputs ?? []).includes(id));
}

export function selectNodes(ids, { add = false, toggle = false } = {}) {
  setState((s) => {
    let selection;
    if (!add && !toggle) selection = ids;
    else if (toggle) {
      const set = new Set(s.selection);
      for (const id of ids) (set.has(id) ? set.delete(id) : set.add(id));
      selection = [...set];
    } else selection = [...new Set([...s.selection, ...ids])];
    const keep = new Set(selection);
    const sub = Object.fromEntries(Object.entries(s.sub).filter(([id]) => keep.has(id)));
    return { selection, sub, point: s.point && keep.has(s.point.nodeId) ? s.point : null };
  });
}

export function clearSelection() {
  setState({ selection: [], sub: {}, point: null });
}

// Sub-selection of faces (mode 2) or edges (mode 3) on a node.
export function toggleSubEntity(nodeId, kind, index, { add = false } = {}) {
  setState((s) => {
    const entry = s.sub[nodeId] ?? { faces: [], edges: [] };
    const list = new Set(entry[kind]);
    if (!add) {
      const had = list.has(index);
      list.clear();
      if (!had) list.add(index);
    } else if (list.has(index)) list.delete(index);
    else list.add(index);
    const next = { ...entry, [kind]: [...list].sort((a, b) => a - b) };
    const selection = s.selection.includes(nodeId) ? s.selection : [...s.selection, nodeId];
    return { sub: { ...s.sub, [nodeId]: next }, selection, point: null };
  });
}

export function setMode(mode) {
  setState({ mode, point: null });
  if (mode === "object") setState({ sub: {} });
}

export function setGizmo(gizmo) {
  setState({ gizmo });
}

export function setPalette(palette) {
  setState({ palette });
}

export function toggleHelp() {
  setState((s) => ({ help: !s.help }));
}

// view.action tells the viewport what the frame request means: "preset" (orient only),
// "selection" (fit selected) or "all" (fit everything).
export function frameSelection() {
  setState((s) => ({ view: { ...s.view, action: "selection", frame: s.view.frame + 1 } }));
}

export function frameAll() {
  setState((s) => ({ view: { ...s.view, action: "all", frame: s.view.frame + 1 } }));
}

export function setView(preset) {
  setState((s) => ({ view: { ...s.view, preset, action: "preset", frame: s.view.frame + 1 } }));
}

export function setOutliner(patch) {
  setState((s) => ({ outliner: { ...s.outliner, ...patch } }));
}

export function setParam(nodeId, key, value, { coalesce = true } = {}) {
  commit((doc) => {
    if (doc.nodes[nodeId]) doc.nodes[nodeId].params[key] = value;
    return doc;
  }, { coalesce: coalesce ? `${nodeId}:${key}` : null });
}

export function setParams(nodeId, patch) {
  commit((doc) => {
    if (doc.nodes[nodeId]) Object.assign(doc.nodes[nodeId].params, patch);
    return doc;
  });
}

export function renameNode(nodeId, name) {
  commit((doc) => {
    if (doc.nodes[nodeId]) doc.nodes[nodeId].name = name || doc.nodes[nodeId].name;
    return doc;
  }, { coalesce: `${nodeId}:name` });
}

export function setXf(nodeId, patch, { coalesce = null } = {}) {
  commit((doc) => {
    const node = doc.nodes[nodeId];
    if (!node) return doc;
    node.xf = { t: [0, 0, 0], r: [0, 0, 0], s: 1, ...(node.xf ?? {}), ...patch };
    return doc;
  }, { coalesce });
}

export function setVisible(nodeId, visible) {
  commit((doc) => {
    if (doc.nodes[nodeId]) doc.nodes[nodeId].visible = visible;
    return doc;
  });
}

export function toggleVisible(nodeId) {
  const node = getState().doc.nodes[nodeId];
  if (node) setVisible(nodeId, !node.visible);
}

export function showAll() {
  commit((doc) => {
    for (const n of Object.values(doc.nodes)) n.visible = true;
    return doc;
  });
}

// ---- control points (curves) ----
const POINT_FIELD = { polyline: "points", bezier: "points", fitCurve: "points", spline: "knots" };

export function pointsOf(node) {
  const key = POINT_FIELD[node?.type];
  return key ? node.params[key] : null;
}

export function setPointCoord(nodeId, index, axis, value) {
  commit((doc) => {
    const node = doc.nodes[nodeId];
    const key = POINT_FIELD[node?.type];
    if (!key) return doc;
    const item = node.params[key][index];
    if (!item) return doc;
    if (key === "knots") item.p[axis] = value;
    else item[axis] = value;
    return doc;
  }, { coalesce: `${nodeId}:pt:${index}:${axis}` });
}

export function setPointPosition(nodeId, index, p) {
  commit((doc) => {
    const node = doc.nodes[nodeId];
    const key = POINT_FIELD[node?.type];
    if (!key) return doc;
    const item = node.params[key][index];
    if (!item) return doc;
    if (key === "knots") item.p = p;
    else node.params[key][index] = p;
    return doc;
  });
}

export function setKnotCont(nodeId, index, cont) {
  commit((doc) => {
    const node = doc.nodes[nodeId];
    if (node?.type === "spline" && node.params.knots[index]) node.params.knots[index].cont = cont;
    return doc;
  });
}

export function setKnotScale(nodeId, index, scale) {
  commit((doc) => {
    const node = doc.nodes[nodeId];
    if (node?.type === "spline" && node.params.knots[index]) node.params.knots[index].scale = scale;
    return doc;
  }, { coalesce: `${nodeId}:scale:${index}` });
}

export function addPoint(nodeId) {
  commit((doc) => {
    const node = doc.nodes[nodeId];
    const key = POINT_FIELD[node?.type];
    if (!key) return doc;
    const list = node.params[key];
    const last = key === "knots" ? list[list.length - 1].p : list[list.length - 1];
    const next = [last[0] + 20, last[1] + 10, last[2]];
    if (key === "knots") {
      const prev = list[list.length - 1];
      prev.cont = prev.cont === "G0" ? "G1" : prev.cont;
      list.push({ p: next, cont: "G0", scale: 1 });
    } else {
      list.push(next);
    }
    return doc;
  });
}

export function removePoint(nodeId, index) {
  commit((doc) => {
    const node = doc.nodes[nodeId];
    const key = POINT_FIELD[node?.type];
    if (!key) return doc;
    const list = node.params[key];
    const min = key === "knots" ? 2 : 2;
    if (list.length <= min) return doc;
    list.splice(index, 1);
    if (key === "knots") {
      list[0].cont = "G0";
      list[list.length - 1].cont = "G0";
    }
    return doc;
  });
  setState({ point: null });
}

// ---- node creation ----
export function addPrimitive(type) {
  const meta = NODE_TYPES[type];
  if (!meta) return null;
  let id = null;
  commit((doc) => {
    id = insertNode(doc, type, {});
    return doc;
  });
  selectNodes([id]);
  setMode("object");
  return id;
}

// Build a list of inputs from selection for a given operation type.
function selectedInputs(type, s) {
  const meta = NODE_TYPES[type];
  const sel = s.selection.filter((id) => s.doc.nodes[id]);
  const curves = sel.filter((id) => nodeKind(s.doc.nodes[id].type) === "curve");
  const bodies = sel.filter((id) => nodeKind(s.doc.nodes[id].type) === "body");
  const kinds = meta.inputs.kinds ?? [];
  if (kinds.every((k) => k === "curve")) return curves.slice(0, meta.inputs.max);
  if (kinds.every((k) => k === "body")) return bodies.slice(0, meta.inputs.max);
  return [];
}

export function createOperation(type) {
  const meta = NODE_TYPES[type];
  if (!meta) return;
  const s = getState();
  const inputs = selectedInputs(type, s);
  const needed = meta.inputs.min;
  if (inputs.length < needed) {
    const word = (meta.inputs.kinds ?? ["item"])[0] === "body" ? "solid" : "curve";
    toast(`${meta.label} needs ${needed} ${word}${needed > 1 ? "s" : ""} selected`, "warn");
    return;
  }
  const params = defaultParams(type);
  if (type === "fillet" || type === "chamfer" || type === "bevel") {
    const sub = s.sub[inputs[0]]?.edges ?? [];
    if (!sub.length) {
      toast("Select edges on the body first (mode 3 = Edge)", "warn");
      return;
    }
    params.edges = [...sub];
  }
  if (type === "pushpull") {
    const face = s.sub[inputs[0]]?.faces?.[0];
    if (face === undefined) {
      toast("Select a face on the body first (mode 2 = Face)", "warn");
      return;
    }
    params.face = face;
  }
  if (type === "extrude" || type === "loft" || type === "loftSurface") {
    const bbox = s.results[inputs[0]]?.bbox;
    if (bbox && type === "loft") params.apex = [bbox.min[0] + (bbox.max[0] - bbox.min[0]) / 2, 0, bbox.max[2] + 60];
  }
  let id = null;
  commit((doc) => {
    id = insertNode(doc, type, { params, inputs });
    for (const input of inputs) doc.nodes[input].visible = false;
    return doc;
  });
  selectNodes([id]);
  setMode("object");
  return id;
}

export function deleteSelection() {
  const s = getState();
  const ids = new Set(s.selection.filter((id) => s.doc.nodes[id]));
  if (!ids.size) return;
  commit((doc) => {
    const restore = new Set();
    for (const id of ids) for (const input of doc.nodes[id]?.inputs ?? []) restore.add(input);
    for (const id of ids) {
      delete doc.nodes[id];
    }
    doc.order = doc.order.filter((id) => doc.nodes[id]);
    for (const input of restore) {
      if (doc.nodes[input] && consumersOf(doc, input).length === 0) doc.nodes[input].visible = true;
    }
    return doc;
  });
  clearSelection();
}

export function duplicateSelection() {
  const s = getState();
  const ids = s.selection.filter((id) => s.doc.nodes[id]);
  if (!ids.length) return;
  const created = [];
  commit((doc) => {
    const map = new Map();
    for (const id of ids) {
      const src = s.doc.nodes[id];
      const newId = insertNode(doc, src.type, {
        params: clone(src.params),
        inputs: src.inputs,
        xf: clone(src.xf),
        name: `${src.name} copy`,
      });
      map.set(id, newId);
      created.push(newId);
    }
    return doc;
  });
  selectNodes(created);
}

export function undo() {
  const s = getState();
  if (!s.past.length) return;
  const prev = s.past[s.past.length - 1];
  setState({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT), selection: [], sub: {}, point: null });
  persistSoon();
}

export function redo() {
  const s = getState();
  if (!s.future.length) return;
  const [next, ...rest] = s.future;
  setState({ doc: next, past: [...s.past, s.doc], future: rest, selection: [], sub: {}, point: null });
  persistSoon();
}

export function newDocument() {
  const s = getState();
  commit(() => ({ nodes: {}, order: [], nextId: 1 }));
  clearSelection();
  setState({ results: {}, past: s.past });
}

// ---- sample: a loft pod with wheels and a boolean wheel-arch cut ----
export function addSample() {
  let firstId = null;
  commit((doc) => {
    const sections = [
      { c: [0, 0, 0], rx: 6, ry: 12 },
      { c: [60, 0, 6], rx: 14, ry: 26 },
      { c: [130, 0, 10], rx: 18, ry: 32 },
      { c: [190, 0, 4], rx: 10, ry: 22 },
    ];
    const curveIds = sections.map((sec) =>
      insertNode(doc, "ellipse", { params: { c: sec.c, rx: sec.ry, ry: sec.rx, n: [1, 0, 0] }, visible: false }),
    );
    const body = insertNode(doc, "loft", {
      params: { ...defaultParams("loft"), loftType: "smooth" },
      inputs: curveIds,
    });
    firstId = body;
    // Cylinders are built on their base at the origin and rotated 90deg about X, so they span
    // y in [t.y - h, t.y]; t.y = centre + h/2 puts the wheel centre on y = +/-40.
    const wheelA = insertNode(doc, "cylinder", { params: { r: 22, h: 40 }, xf: { t: [40, 60, 22], r: [90, 0, 0], s: 1 } });
    const wheelB = insertNode(doc, "cylinder", { params: { r: 22, h: 40 }, xf: { t: [40, -20, 22], r: [90, 0, 0], s: 1 } });
    const wheelC = insertNode(doc, "cylinder", { params: { r: 22, h: 40 }, xf: { t: [150, 60, 22], r: [90, 0, 0], s: 1 } });
    const wheelD = insertNode(doc, "cylinder", { params: { r: 22, h: 40 }, xf: { t: [150, -20, 22], r: [90, 0, 0], s: 1 } });
    doc.nodes[body].name = "Pod body (loft)";
    doc.nodes[wheelA].name = "Wheel FL";
    doc.nodes[wheelB].name = "Wheel FR";
    doc.nodes[wheelC].name = "Wheel RL";
    doc.nodes[wheelD].name = "Wheel RR";
    return doc;
  });
  selectNodes([firstId]);
  setMode("object");
  toast("Sample added: loft pod with four wheel cylinders", "info");
}

// Helper for the palette/hotkeys: collect the selected body/curve ids in order.
export function selectedIds() {
  const s = getState();
  return s.selection.filter((id) => s.doc.nodes[id]);
}

export function nodeOf(id) {
  return getState().doc.nodes[id] ?? null;
}

export { nodeKind };
