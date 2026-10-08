import { useEffect, useRef } from "react";
import { CadScene } from "../viewport/scene.js";
import { useStore, getState, setState } from "../store.js";
import * as A from "../actions.js";

const MODES = [
  { id: "curve", label: "Points", key: "1" },
  { id: "edge", label: "Edge", key: "2" },
  { id: "face", label: "Face", key: "3" },
  { id: "object", label: "Solid", key: "4" },
];
const GIZMOS = [
  { id: "move", label: "Move", key: "G" },
  { id: "rotate", label: "Rotate", key: "R" },
  { id: "scale", label: "Scale", key: "S" },
];
const VIEWS = [
  { id: "perspective", label: "Iso" },
  { id: "top", label: "Top" },
  { id: "front", label: "Front" },
  { id: "right", label: "Right" },
];

const HINTS = {
  object: "Click to select · Shift add · Ctrl toggle · Double-click a solid for faces · G/R/S transform",
  face: "Click faces · Shift adds · Then B fillet, Shift+B chamfer, Ctrl+B bevel, P push/pull",
  edge: "Click edges · Shift adds · Then B fillet, Shift+B chamfer, Ctrl+B bevel",
  curve: "Drag green control points · Select a curve to edit its knots / points",
};

export default function Viewport() {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const framedRef = useRef(false);
  const doc = useStore((s) => s.doc);
  const results = useStore((s) => s.results);
  const selection = useStore((s) => s.selection);
  const sub = useStore((s) => s.sub);
  const point = useStore((s) => s.point);
  const mode = useStore((s) => s.mode);
  const gizmo = useStore((s) => s.gizmo);
  const view = useStore((s) => s.view);
  const live = useStore((s) => s.live);
  const dirty = useStore((s) => s.dirty);
  const fps = useStore((s) => s.stats.fps);
  const kernel = useStore((s) => s.kernel);

  // Create the three.js scene once and wire pointer interaction to actions.
  useEffect(() => {
    const scene = new CadScene(hostRef.current, {
      onNodeTransformed: (id, xf) => A.setXf(id, xf),
      onPointMoved: (id, index, p) => A.setPointPosition(id, index, p),
      onFps: (value) => setState((s) => ({ stats: { ...s.stats, fps: value } })),
    });
    sceneRef.current = scene;
    const el = scene.renderer.domElement;

    let down = null;
    let moveEvent = null;
    let moveFrame = 0;
    let lastHover = "";

    const onDown = (e) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    };

    const onUp = (e) => {
      const d = down;
      down = null;
      if (!d || scene.gizmo.axis) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      const hit = scene.pick(e.clientX, e.clientY, getState().mode);
      handleClick(d, hit);
    };

    const onDbl = (e) => {
      const hit = scene.pick(e.clientX, e.clientY, "object");
      if (hit && hit.kind === "node" && getState().mode === "object") {
        A.selectNodes([hit.nodeId]);
        A.setMode("face");
      }
    };

    // Hover highlight for face and edge modes, throttled to one pick per frame.
    const onMove = (e) => {
      if (e.buttons) return;
      moveEvent = e;
      if (moveFrame) return;
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0;
        const m = getState().mode;
        if (!moveEvent || (m !== "face" && m !== "edge")) {
          if (lastHover) scene.setHover(null);
          lastHover = "";
          return;
        }
        const hit = scene.pick(moveEvent.clientX, moveEvent.clientY, m);
        const ok = hit && (hit.kind === m) && hit.index >= 0;
        const key = ok ? `${hit.nodeId}:${hit.kind}:${hit.index}` : "";
        if (key === lastHover) return;
        lastHover = key;
        scene.setHover(ok ? hit : null);
      });
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("dblclick", onDbl);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", () => scene.setHover(null));

    function handleClick(d, hit) {
      const shift = d.shift;
      const toggle = d.ctrl;
      if (!hit) {
        if (!shift && !toggle) A.clearSelection();
        return;
      }
      if (hit.kind === "point") {
        A.selectNodes([hit.nodeId], { add: shift });
        setState({ point: { nodeId: hit.nodeId, index: hit.index } });
        return;
      }
      if (hit.kind === "face" || hit.kind === "edge") {
        if (!shift) A.selectNodes([hit.nodeId]);
        A.toggleSubEntity(hit.nodeId, hit.kind === "face" ? "faces" : "edges", hit.index, { add: shift });
        return;
      }
      if (toggle) A.selectNodes([hit.nodeId], { toggle: true });
      else A.selectNodes([hit.nodeId], { add: shift });
    }

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("dblclick", onDbl);
      el.removeEventListener("pointermove", onMove);
      if (moveFrame) cancelAnimationFrame(moveFrame);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync three objects with the document, results and selection.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.syncResults(doc, results);
    scene.syncSelection(doc, selection, sub);
    scene.syncHandles(doc, selection, point, mode);
    scene.attachGizmo(doc, selection, point, mode, gizmo);
    if (!framedRef.current) {
      const b = scene.boundsOf(doc, results);
      if (b) {
        scene.frameBox(b.min, b.max);
        framedRef.current = true;
      }
    }
  }, [doc, results, selection, sub, point, mode, gizmo]);

  // Camera requests from commands and the toolbar.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (view.action === "preset") {
      scene.setPreset(view.preset);
      return;
    }
    const s = getState();
    const ids = view.action === "selection" && s.selection.length ? s.selection : null;
    const b = scene.boundsOf(s.doc, s.results, ids);
    if (b) scene.frameBox(b.min, b.max);
  }, [view.frame]);

  const hint = HINTS[mode];
  const sel = selection.length;
  const nodeCount = doc.order.length;

  return (
    <div className="viewport">
      <div className="viewport-canvas-host" ref={hostRef} />

      <div className="toolbar-pill toolbar-main" role="toolbar" aria-label="Modes">
        <div className="segmented" aria-label="Selection mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? "on" : ""}
              title={`${m.label} (${m.key})`}
              onClick={() => A.setMode(m.id)}
            >
              {m.label}
              <kbd>{m.key}</kbd>
            </button>
          ))}
        </div>
        <span className="sep" />
        <div className="segmented" aria-label="Transform tool">
          {GIZMOS.map((g) => (
            <button
              key={g.id}
              className={gizmo === g.id ? "on" : ""}
              title={`${g.label} (${g.key})`}
              onClick={() => A.setGizmo(g.id)}
            >
              {g.label}
              <kbd>{g.key}</kbd>
            </button>
          ))}
        </div>
        <span className="sep" />
        <div className="segmented" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} className={view.preset === v.id ? "on" : ""} onClick={() => A.setView(v.id)}>
              {v.label}
            </button>
          ))}
          <button title="Fit selection (Space)" onClick={() => A.frameSelection()}>
            Fit
          </button>
        </div>
      </div>

      <div className="toolbar-pill toolbar-live" aria-label="Evaluation">
        <div className="segmented">
          <button className={live ? "on" : ""} onClick={() => setState({ live: true })} title="Re-evaluate on every edit">
            Realtime
          </button>
          <button
            className={!live ? "on" : ""}
            onClick={() => setState({ live: false })}
            title="Edit without re-evaluating; press Evaluate to rebuild"
          >
            Edit
          </button>
        </div>
        {!live && (
          <button className="evaluate" onClick={() => setState({ evaluateRequest: Date.now() })}>
            {dirty ? "Evaluate*" : "Evaluate"}
          </button>
        )}
      </div>

      <div className="viewport-hint">{hint}</div>

      <div className="viewport-status">
        <span className={`dot ${kernel.state}`} />
        <span>{kernel.state === "ready" ? `Kernel ${kernel.ms ? `${kernel.ms.toFixed(0)} ms` : "ready"}` : kernel.message}</span>
        <span className="muted">
          {sel ? `${sel} selected` : `${nodeCount} items`} · {fps} fps
          {mode !== "object" && <> · {MODES.find((m) => m.id === mode)?.label} mode</>}
        </span>
      </div>
    </div>
  );
}
