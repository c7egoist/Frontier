// Command registry: one list drives hotkeys, the command palette and the help overlay.
// Hotkeys follow the reference chart (SolidArc HotkeyChart.cpp): 1 control points,
// 2 edges, 3 faces, 4 solids; g/r/s move/rotate/scale; f or F3 search; numpad views.

import * as A from "./actions.js";
import { getState, setState, toast } from "./store.js";
import { NODE_TYPES } from "./model/nodeTypes.js";

const view = (preset) => () => A.setView(preset);
const mode = (m) => () => A.setMode(m);

function selectAll() {
  const s = getState();
  A.selectNodes(s.doc.order.filter((id) => s.doc.nodes[id]?.visible));
}

function invertSelection() {
  const s = getState();
  const cur = new Set(s.selection);
  A.selectNodes(s.doc.order.filter((id) => !cur.has(id) && s.doc.nodes[id]?.visible));
}

function hideSelected() {
  const s = getState();
  if (!s.selection.length) return;
  for (const id of s.selection) A.setVisible(id, false);
  A.clearSelection();
}

function hideUnselected() {
  const s = getState();
  const cur = new Set(s.selection);
  for (const id of s.doc.order) if (!cur.has(id)) A.setVisible(id, false);
}

// Zero-input node types are primitives/curves; everything else consumes the selection.
const creation = (type) => () => {
  const meta = NODE_TYPES[type];
  if (!meta.inputs?.min) A.addPrimitive(type);
  else A.createOperation(type);
};

// Ordered list. `group` decides palette sections; `palette` = shown in Add (shift+a) menu.
export const COMMANDS = [
  // ---- tools / transform ----
  { id: "tool.move", label: "Move", group: "Transform", chord: "g", run: () => A.setGizmo("move") },
  { id: "tool.rotate", label: "Rotate", group: "Transform", chord: "r", run: () => A.setGizmo("rotate") },
  { id: "tool.scale", label: "Scale", group: "Transform", chord: "s", run: () => A.setGizmo("scale") },
  { id: "op.mirror", label: "Mirror", group: "Transform", chord: "alt+x", run: creation("mirror"), palette: true },
  { id: "op.duplicate", label: "Duplicate", group: "Transform", chord: "shift+d", run: () => A.duplicateSelection() },

  // ---- selection modes ----
  { id: "mode.curve", label: "Select control points", group: "Selection", chord: "1", run: mode("curve") },
  { id: "mode.edge", label: "Select edges", group: "Selection", chord: "2", run: mode("edge") },
  { id: "mode.face", label: "Select faces", group: "Selection", chord: "3", run: mode("face") },
  { id: "mode.object", label: "Select solids", group: "Selection", chord: "4", run: mode("object") },
  {
    id: "mode.cycle", label: "Cycle selection mode", group: "Selection", chord: "tab",
    run: () => {
      const order = ["object", "face", "edge", "curve"];
      const i = order.indexOf(getState().mode);
      A.setMode(order[(i + 1) % order.length]);
    },
  },
  { id: "sel.all", label: "Select all", group: "Selection", chord: "a", run: selectAll },
  { id: "sel.none", label: "Select none", group: "Selection", chord: "alt+a", run: () => A.clearSelection() },
  { id: "sel.invert", label: "Invert selection", group: "Selection", chord: "ctrl+i", run: invertSelection },
  { id: "vis.hide", label: "Hide selected", group: "Selection", chord: "h", run: hideSelected },
  { id: "vis.hideOthers", label: "Hide unselected", group: "Selection", chord: "shift+h", run: hideUnselected },
  { id: "vis.showAll", label: "Unhide all", group: "Selection", chord: "alt+h", run: () => A.showAll() },
  { id: "sel.delete", label: "Delete selected", group: "Selection", chord: "x", chord2: "delete", run: () => A.deleteSelection() },

  // ---- solid operations ----
  { id: "op.extrude", label: "Extrude", group: "Solid", chord: "e", run: creation("extrude"), palette: true },
  { id: "op.revolve", label: "Revolve", group: "Solid", chord: "alt+e", run: creation("revolve"), palette: true },
  { id: "op.fillet", label: "Fillet edges", group: "Solid", chord: "b", run: creation("fillet"), palette: true },
  { id: "op.chamfer", label: "Chamfer edges", group: "Solid", chord: "shift+b", run: creation("chamfer"), palette: true },
  { id: "op.bevel", label: "Bevel edges (asymmetric chamfer)", group: "Solid", chord: "ctrl+b", run: creation("bevel"), palette: true },
  { id: "op.pushpull", label: "Push / pull face", group: "Solid", chord: "p", run: creation("pushpull"), palette: true },
  { id: "op.union", label: "Boolean union", group: "Solid", chord: "q", run: () => boolOp("union") },
  { id: "op.subtract", label: "Boolean subtract", group: "Solid", chord: "shift+q", run: () => boolOp("subtract") },
  { id: "op.intersect", label: "Boolean intersect", group: "Solid", chord: "ctrl+q", run: () => boolOp("intersect") },
  { id: "op.loft", label: "Loft (all types)", group: "Solid", chord: "l", run: creation("loft"), palette: true },
  { id: "op.sweep", label: "Sweep", group: "Solid", chord: "shift+p", run: creation("sweep"), palette: true },

  // ---- curves ----
  { id: "add.line", label: "Line", group: "Curves", run: creation("line"), palette: true },
  { id: "add.polyline", label: "Polyline", group: "Curves", chord: "ctrl+shift+p", run: creation("polyline"), palette: true },
  { id: "add.circle", label: "Circle", group: "Curves", chord: "ctrl+shift+c", run: creation("circle"), palette: true },
  { id: "add.ellipse", label: "Ellipse", group: "Curves", chord: "ctrl+shift+e", run: creation("ellipse"), palette: true },
  { id: "add.arc3", label: "Three-point arc", group: "Curves", run: creation("arc3"), palette: true },
  { id: "add.tangentArc", label: "Tangent arc", group: "Curves", run: creation("tangentArc"), palette: true },
  { id: "add.bezier", label: "Bezier curve", group: "Curves", chord: "ctrl+shift+b", run: creation("bezier"), palette: true },
  { id: "add.spline", label: "Spline (G0 / G1 / G2 joints)", group: "Curves", chord: "ctrl+shift+s", run: creation("spline"), palette: true },
  { id: "add.fitCurve", label: "B-spline fit", group: "Curves", run: creation("fitCurve"), palette: true },
  { id: "add.helix", label: "Helix", group: "Curves", run: creation("helix"), palette: true },

  // ---- primitives ----
  { id: "add.box", label: "Box", group: "Primitives", run: creation("box"), palette: true },
  { id: "add.cylinder", label: "Cylinder", group: "Primitives", chord: "shift+c", run: creation("cylinder"), palette: true },
  { id: "add.sphere", label: "Sphere", group: "Primitives", chord: "shift+s", run: creation("sphere"), palette: true },
  { id: "add.ellipsoid", label: "Ellipsoid", group: "Primitives", run: creation("ellipsoid"), palette: true },

  // ---- surfaces ----
  { id: "srf.plane", label: "Planar patch from curve", group: "Surfaces", run: creation("planeSurface"), palette: true },
  { id: "srf.patch", label: "Fill patch (boundary curves)", group: "Surfaces", chord: "shift+l", run: creation("patch"), palette: true },
  { id: "srf.extrude", label: "Extrude surface", group: "Surfaces", run: creation("extrudeSurface"), palette: true },
  { id: "srf.revolve", label: "Revolve surface", group: "Surfaces", run: creation("revolveSurface"), palette: true },
  { id: "srf.loft", label: "Loft surface (all types)", group: "Surfaces", run: creation("loftSurface"), palette: true },
  { id: "srf.sweep", label: "Sweep surface", group: "Surfaces", run: creation("sweepSurface"), palette: true },

  // ---- document / edit ----
  { id: "edit.undo", label: "Undo", group: "Edit", chord: "ctrl+z", run: () => A.undo() },
  { id: "edit.redo", label: "Redo", group: "Edit", chord: "ctrl+shift+z", chord2: "ctrl+y", run: () => A.redo() },
  { id: "doc.new", label: "New document", group: "Document", run: () => A.newDocument() },
  { id: "doc.sample", label: "Add sample car pod", group: "Document", run: () => A.addSample() },
  { id: "doc.live", label: "Toggle live evaluation (Realtime / Edit)", group: "Document", run: () => setState((s) => ({ live: !s.live })) },
  { id: "doc.evaluate", label: "Evaluate now", group: "Document", run: () => setState({ evaluateRequest: Date.now() }) },

  // ---- view ----
  { id: "view.front", label: "View front", group: "View", chord: "numpad1", run: view("front") },
  { id: "view.back", label: "View back", group: "View", chord: "ctrl+numpad1", run: view("back") },
  { id: "view.right", label: "View right", group: "View", chord: "numpad3", run: view("right") },
  { id: "view.left", label: "View left", group: "View", chord: "ctrl+numpad3", run: () => A.setView("left") },
  { id: "view.top", label: "View top", group: "View", chord: "numpad7", run: view("top") },
  { id: "view.bottom", label: "View bottom", group: "View", chord: "ctrl+numpad7", run: () => A.setView("bottom") },
  { id: "view.iso", label: "Perspective / isometric", group: "View", chord: "numpad0", run: view("perspective") },
  { id: "view.fit", label: "Fit selection", group: "View", chord: "space", run: () => A.frameSelection() },
  { id: "view.fitAll", label: "Fit all", group: "View", chord: "home", run: () => A.frameAll() },
  { id: "app.palette", label: "Command search", group: "App", chord: "f", chord2: "f3", run: () => A.setPalette("search") },
  { id: "app.add", label: "Add menu", group: "App", chord: "shift+a", run: () => A.setPalette("add") },
  { id: "app.help", label: "Keyboard shortcuts", group: "App", chord: "?", run: () => A.toggleHelp() },
];

function boolOp(op) {
  const s = getState();
  const bodies = s.selection.filter((id) => s.doc.nodes[id]?.kind !== "curve");
  if (bodies.length < 2) {
    toast("Boolean needs two solids selected", "warn");
    return;
  }
  const id = A.createOperation("boolean");
  if (id) A.setParam(id, "op", op, { coalesce: false });
}

export function commandById(id) {
  return COMMANDS.find((c) => c.id === id) ?? null;
}

export function paletteCommands(kind) {
  if (kind === "add") return COMMANDS.filter((c) => c.palette);
  return COMMANDS;
}

// Human-readable chord, e.g. "ctrl+shift+z" -> "Ctrl+Shift+Z".
export function prettyChord(chord) {
  if (!chord) return "";
  return chord
    .split("+")
    .map((p) => (p.length === 1 ? p.toUpperCase() : p.replace(/^./, (c) => c.toUpperCase())))
    .join("+");
}
