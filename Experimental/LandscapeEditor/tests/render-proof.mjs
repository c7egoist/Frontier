// Renders every preset to PNG so a person can judge the terrain by eye.
// Usage: node tests/render-proof.mjs [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../src/engine/evaluate.js";
import { PRESET_LIST, buildPreset } from "../src/engine/presets.js";
import { renderView, renderVoxel } from "../src/engine/render.js";
import { encodePng, upscale } from "./png.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.argv[2] || path.join(here, "..", "..", "..", "Docs", "LandscapeEditorEvidence");
mkdirSync(outDir, { recursive: true });

const only = process.env.PRESET;
for (const [id, label] of PRESET_LIST) {
  if (only && only !== id) continue;
  const doc = buildPreset(id);
  const r = evaluate(doc);
  const sun = { azimuth: doc.sun.azimuth, elevation: doc.sun.elevation };
  const shaded = renderView(r, "shaded", sun);
  const N = r.N;
  const scale = Math.max(1, Math.floor(512 / N));
  writeFileSync(path.join(outDir, `${id}-shaded.png`), encodePng(N * scale, N * scale, upscale(shaded, N, N, scale)));
  const W = 640;
  const H = 360;
  const cam = { x: 0.5, y: 0.92, height: 260, angle: Math.PI, fov: 62, horizon: 0.42 };
  const vox = renderVoxel(r, sun, cam, W, H);
  writeFileSync(path.join(outDir, `${id}-3d.png`), encodePng(W, H, vox));
  const s = r.stats;
  console.log(
    `${label.padEnd(24)} eval ${s.ms.toFixed(0).padStart(5)} ms  alt ${s.minM.toFixed(0)}..${s.maxM.toFixed(0)} m  mean ${s.meanM.toFixed(0)} m  errors ${s.errors.length}`,
  );
}
