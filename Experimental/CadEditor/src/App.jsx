import { useEffect } from "react";
import { getState, setState, subscribe as subscribeStore, useStore } from "./store.js";
import * as A from "./actions.js";
import { installHotkeys } from "./hotkeys.js";
import { requestEvaluation, evaluateNow } from "./kernel/client.js";
import Outliner from "./panels/Outliner.jsx";
import Inspector from "./panels/Inspector.jsx";
import Viewport from "./panels/Viewport.jsx";
import { Palette, Help, Toast } from "./panels/Overlays.jsx";

// Keep the kernel in step with the document: every change in Realtime mode, or on
// demand in Edit mode / when Evaluate is pressed.
function useKernelSync() {
  useEffect(() => {
    let lastDoc = null;
    let lastRequest = null;
    const sync = () => {
      const s = getState();
      if (s.evaluateRequest && s.evaluateRequest !== lastRequest) {
        lastRequest = s.evaluateRequest;
        evaluateNow(s.doc);
        setState({ dirty: false });
        return;
      }
      if (s.doc === lastDoc) return;
      const first = lastDoc === null;
      lastDoc = s.doc;
      if (s.live || first) {
        requestEvaluation(s.doc);
        if (!s.live && first) setState({ dirty: false });
      } else if (!s.dirty) {
        setState({ dirty: true });
      }
    };
    sync();
    const off = subscribeStore(sync);
    return off;
  }, []);
}

export default function App() {
  useKernelSync();
  const kernel = useStore((s) => s.kernel);
  const past = useStore((s) => s.past.length);
  const future = useStore((s) => s.future.length);
  const nodeCount = useStore((s) => s.doc.order.length);

  useEffect(() => installHotkeys(), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◆</span> Frontier <span className="muted">CAD editor</span>
        </div>
        <div className="topbar-actions">
          <button onClick={() => A.newDocument()} title="New document">New</button>
          <button onClick={() => A.addSample()} title="Add sample car pod">Sample</button>
          <span className="sep" />
          <button onClick={() => A.undo()} disabled={!past} title="Undo (Ctrl+Z)">Undo</button>
          <button onClick={() => A.redo()} disabled={!future} title="Redo (Ctrl+Shift+Z)">Redo</button>
          <span className="sep" />
          <button onClick={() => A.setPalette("search")} title="Command search (F)">Search</button>
          <button onClick={() => A.toggleHelp()} title="Keyboard shortcuts (?)">Shortcuts</button>
        </div>
        <div className={`kernel-badge ${kernel.state}`} title={kernel.message}>
          <span className="dot" /> {kernel.state === "ready" ? "OpenCascade" : kernel.state === "error" ? "Kernel error" : "Loading kernel"}
          <span className="muted"> · {nodeCount} items</span>
        </div>
      </header>

      <main className="workspace">
        <Outliner />
        <Viewport />
        <Inspector />
      </main>

      <Palette />
      <Help />
      <Toast />
    </div>
  );
}
