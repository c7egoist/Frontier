// Runs the evaluation off the UI thread so sliders stay responsive during erosion.
import { evaluate } from "./engine/evaluate.js";

self.onmessage = (e) => {
  const { id, doc, maskLayerId } = e.data;
  try {
    const result = evaluate(doc, { maskLayerId });
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
