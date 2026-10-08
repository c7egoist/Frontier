// Kernel worker: owns the OpenCascade (replicad) instance and the evaluation cache.
import opencascade from "replicad-opencascadejs";
import wasmUrl from "replicad-opencascadejs/wasm?url";
import * as replicad from "replicad";
import { createEvaluator } from "./evaluate.js";

let evaluator = null;
let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      const OC = await opencascade({ locateFile: (file) => (file.endsWith(".wasm") ? wasmUrl : file) });
      replicad.setOC(OC);
      evaluator = createEvaluator(replicad);
      return true;
    })();
  }
  return ready;
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "evaluate") {
    try {
      await init();
      const t0 = performance.now();
      const { results } = evaluator.evaluate(msg.doc);
      const ms = performance.now() - t0;
      // No transfer list: the evaluator caches its outputs, so they must stay valid here.
      self.postMessage({ type: "result", seq: msg.seq, results, ms });
    } catch (error) {
      self.postMessage({ type: "error", seq: msg.seq, message: error?.message || String(error) });
    }
  } else if (msg.type === "init") {
    try {
      await init();
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "fatal", message: error?.message || String(error) });
    }
  }
};
