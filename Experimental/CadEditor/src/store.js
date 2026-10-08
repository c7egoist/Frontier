// Minimal observable store. The document is plain JSON so it can be saved, diffed,
// and used as the undo snapshot without extra machinery.

import { useSyncExternalStore } from "react";

export const STORAGE_KEY = "frontier-cad-document-v1";

const emptyDoc = () => ({ nodes: {}, order: [], nextId: 1 });

function loadDoc() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return emptyDoc();
    const doc = JSON.parse(raw);
    if (doc && doc.nodes && doc.order) return doc;
  } catch {
    /* ignore corrupt storage */
  }
  return emptyDoc();
}

let state = {
  doc: loadDoc(),
  // Selection: ordered node ids, plus per-node sub-entity picks (faces / edges indices).
  selection: [],
  sub: {},
  point: null, // { nodeId, index } when a control point is picked
  mode: "object", // object | face | edge | curve
  gizmo: "move", // move | rotate | scale (object transforms)
  results: {},
  kernel: { state: "loading", message: "Starting OpenCascade kernel", ms: 0 },
  past: [],
  future: [],
  palette: null, // null | "search" | "add"
  help: false,
  outliner: { query: "", filter: "all" },
  view: { preset: "perspective", action: "preset", frame: 0 },
  toast: null,
  stats: { fps: 0 },
  live: true, // true: re-evaluate on every edit; false: Edit mode, evaluate on demand
  dirty: false,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useStore(selector = (s) => s) {
  const get = () => selector(state);
  return useSyncExternalStore(subscribe, get, get);
}

let toastTimer = null;
export function toast(message, tone = "info") {
  setState({ toast: { message, tone, id: Date.now() } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setState({ toast: null }), 3200);
}

// Persist the document (debounced) so reloads keep the work.
let saveTimer = null;
export function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state.doc));
    } catch {
      /* quota or private mode */
    }
  }, 250);
}
