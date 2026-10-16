#!/usr/bin/env node
// Batch-render the whole catalogue to 16-bit mono WAV files plus a manifest.json
// that records every recipe, so any file can be regenerated bit-for-bit.
//
//   node src/render-library.mjs                    # everything -> out/library
//   node src/render-library.mjs --only doors,glass # selected groups
//   node src/render-library.mjs --sr 48000 --out /tmp/sfx

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSound, SOUND_TYPES } from "./registry.js";
import { buildCatalog, assertUnique } from "./catalog.js";
import { encodeWav, measure } from "./dsp.js";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, [])
);
const sr = Number(args.sr ?? 44100);
const outRoot = resolve(args.out ?? join(here, "..", "out", "library"));
const only = args.only ? new Set(args.only.split(",").map((s) => s.trim())) : null;

const catalog = assertUnique(buildCatalog()).filter((it) => !only || only.has(it.group));
const manifest = { sampleRate: sr, generatedBy: "ProceduralSoundLibrary", count: catalog.length, items: [] };
let i = 0;
for (const it of catalog) {
  i++;
  const x = renderSound(it.type, it.params, { sr, seed: it.seed, cond: it.cond });
  const m = measure(x, sr);
  const file = join("sounds", it.group, `${it.id.split("/")[1]}.wav`);
  const full = join(outRoot, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, encodeWav(x, sr));
  manifest.items.push({
    id: it.id, file, group: it.group, type: it.type, typeLabel: SOUND_TYPES[it.type].label,
    label: it.label, seed: it.seed, condition: it.cond, params: it.params,
    durationSec: +m.durationSec.toFixed(3), peakDb: +m.peakDb.toFixed(2),
    rmsDb: +m.rmsDb.toFixed(2), centroidHz: Math.round(m.centroidHz),
  });
  process.stdout.write(`[${String(i).padStart(3)}/${catalog.length}] ${file}\n`);
}
mkdirSync(outRoot, { recursive: true });
writeFileSync(join(outRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${catalog.length} sounds to ${outRoot}`);
