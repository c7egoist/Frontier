// Main-thread client for the kernel worker. Only one evaluation is in flight; if the
// document changes meanwhile, only the newest document is evaluated next (coalescing),
// so dragging a control point never queues a backlog.

import { setState } from "../store.js";

let worker = null;
let seq = 0;
let inFlight = null;
let pending = null;

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === "ready") {
      setState({ kernel: { state: "ready", message: "OpenCascade ready", ms: 0 } });
      flush();
      return;
    }
    if (msg.type === "fatal") {
      setState({ kernel: { state: "error", message: msg.message, ms: 0 } });
      return;
    }
    if (msg.type === "result" || msg.type === "error") {
      if (inFlight !== msg.seq) return;
      inFlight = null;
      if (msg.type === "result") {
        setState({ results: msg.results, kernel: { state: "ready", message: "Up to date", ms: msg.ms } });
      } else {
        setState({ kernel: { state: "error", message: msg.message, ms: 0 } });
      }
      flush();
    }
  };
  worker.onerror = (event) => setState({ kernel: { state: "error", message: event.message || "Kernel crashed", ms: 0 } });
  worker.postMessage({ type: "init" });
  return worker;
}

function flush() {
  if (inFlight || !pending || !worker) return;
  const doc = pending;
  pending = null;
  seq += 1;
  inFlight = seq;
  setState((s) => ({ kernel: { ...s.kernel, state: "busy", message: "Evaluating" } }));
  worker.postMessage({ type: "evaluate", seq, doc });
}

// Request an evaluation of `doc`. Cheap to call on every change.
export function requestEvaluation(doc) {
  ensureWorker();
  pending = structuredClone(doc);
  flush();
}

// Evaluate the latest document now (used by Edit mode's Evaluate button).
export function evaluateNow(doc) {
  requestEvaluation(doc);
}
