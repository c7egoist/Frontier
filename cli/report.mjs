#!/usr/bin/env node
/** Frontier — CLI: generate roofs for every preset, validate, write a JSON report. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildRoof } from '../src/core/build-roof.js';
import { validateRoof, formatValidation } from '../src/core/validate.js';
import { PRESETS, mergeSpec } from '../src/core/spec.js';
import { toJSONReport, toOBJ } from '../src/core/export.js';

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const only = argOf('--only', null);
const outDir = argOf('--out', 'out');
const wantObj = args.includes('--obj');
mkdirSync(outDir, { recursive: true });

const names = only ? [only] : [...Object.keys(PRESETS), 'default'];
const all = [];
let failures = 0;

for (const name of names) {
  const spec = name === 'default' ? mergeSpec({}) : mergeSpec(PRESETS[name].spec);
  const t0 = performance.now();
  const roof = buildRoof(spec, { lengthSegments: 5 });
  const v = validateRoof(roof);
  const ms = performance.now() - t0;
  console.log(`\n=== ${name}  (${roof.spec.form})  ${ms.toFixed(0)} ms`);
  console.log(formatValidation(v));
  if (!v.pass) { failures++; console.log('  FAILED:', v.failures.map((f) => f.id).join(', ')); }
  all.push({ name, pass: v.pass, ms: +ms.toFixed(0), ...toJSONReport(roof, v) });
  if (wantObj) writeFileSync(`${outDir}/roof-${name}.obj`, toOBJ(roof.parts));
}

writeFileSync(`${outDir}/roof-report.json`, JSON.stringify({ presets: all }, null, 2));
console.log(`\n${names.length} roofs - ${failures} failing - report -> ${outDir}/roof-report.json`);
process.exit(failures ? 1 : 0);
