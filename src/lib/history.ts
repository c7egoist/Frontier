// Pure undo/redo history over immutable snapshots (Project clones).
export interface History<T> {
  past: T[];
  future: T[];
}

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** Push a pre-mutation snapshot; clears the redo stack. */
export function pushHistory<T>(h: History<T>, snapshot: T, cap = 60): History<T> {
  return { past: [...h.past.slice(-(cap - 1)), snapshot], future: [] };
}

export function undoHistory<T>(h: History<T>, current: T): { history: History<T>; snapshot: T } | null {
  if (h.past.length === 0) return null;
  return {
    history: { past: h.past.slice(0, -1), future: [...h.future, current] },
    snapshot: h.past[h.past.length - 1],
  };
}

export function redoHistory<T>(h: History<T>, current: T): { history: History<T>; snapshot: T } | null {
  if (h.future.length === 0) return null;
  return {
    history: { past: [...h.past, current], future: h.future.slice(0, -1) },
    snapshot: h.future[h.future.length - 1],
  };
}
