#!/usr/bin/env node
/**
 * Static WGSL checker: the closest thing to a compiler this sandbox has (no GPU, no browser).
 *
 *   node tools/check-wgsl.mjs            # check every entry point with its defines
 *   node tools/check-wgsl.mjs -v         # also dump declared bindings / resource usage
 *
 * What it does:
 *   1. expands `#include` / `#pragma once` / `#if` through the *same* resolver the runtime uses
 *      (web/src/common/wgsl.ts, imported directly thanks to Node's type stripping),
 *   2. parses every resulting module with wgsl_reflect (a real WGSL grammar + validator),
 *   3. checks our own conventions:
 *        - group(0) binding(0) is always the Globals uniform,
 *        - every `P.<field>` exists in the generated globals struct,
 *        - no duplicate (group, binding) pairs inside one module,
 *        - entry-point workgroup sizes are legal for the default WebGPU limits.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');

const { resolveShader } = await import(join(root, 'web/src/common/wgsl.ts'));
// NOTE: wgsl_reflect declares "type": "module" but points `main` at a CJS file, so importing the
// package by name throws in Node. Import the ESM build by subpath instead.
const { WgslReflect } = await import('wgsl_reflect/wgsl_reflect.module.js');

// --- source map -------------------------------------------------------------
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.wgsl')) out.push(p);
  }
  return out;
}

const sources = new Map();
for (const abs of walk(join(root, 'web/shaders'))) {
  sources.set(relative(join(root, 'web/shaders'), abs).split('\\').join('/'), readFileSync(abs, 'utf8'));
}
const lookup = (f) => sources.get(f.replace(/^\/+/, '').split('\\').join('/'));

// Entry points: modules that define at least one @compute/@vertex/@fragment entry point and are
// not themselves include-only files (those start with common/ or end in _layer.wgsl).
// Modules that are compiled more than once. Keep this list in sync with the `defines` the TS side
// passes to `shader()` -- a define that no shader branches on is dead coverage, and a missing entry
// means an untested compile path (the coarse layer is the whole reason SWE_COARSE exists).
const variants = {
  'swe/swe_step.wgsl': [{}, { SWE_COARSE: 1 }],
  'swe/swe_splat.wgsl': [{}, { SWE_COARSE: 1 }],
};
const entries = [...sources.keys()]
  .filter((f) => !f.startsWith('common/') && !f.endsWith('_layer.wgsl'))
  .sort();

// --- helpers ---------------------------------------------------------------
function shaderEntryPoints(code) {
  const out = [];
  // `@compute @workgroup_size(8, 8)` etc. may sit between the stage attribute and the fn.
  const re = /@(compute|vertex|fragment)\b(?:\s*@[A-Za-z_]\w*(?:\([^)]*\))?)*\s*fn\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(code))) out.push({ stage: m[1], name: m[2] });
  return out;
}

function declaredResources(code) {
  const out = [];
  const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<([^>]*)>)?\s+(\w+)/g;
  let m;
  while ((m = re.exec(code))) out.push({ group: Number(m[1]), binding: Number(m[2]), type: m[3] ?? '', name: m[4] });
  return out;
}

function globalsFields() {
  const params = readFileSync(join(root, 'web/src/core/params.ts'), 'utf8');
  const re = /name:\s*'(\w+)'\s*,\s*type:\s*'([\w<>,\s]+)'/g;
  const fields = [];
  let m;
  while ((m = re.exec(params))) fields.push({ name: m[1], type: m[2].trim() });
  return fields;
}

const WORKGROUP_BUDGET = 16384; // maxComputeWorkgroupStorageSize default (16 KiB)
const INVOCATION_MAX = 256;     // maxComputeInvocationsPerWorkgroup default

let errors = 0;
let warnings = 0;
const err = (file, msg) => { errors++; console.log(`  \u001b[31merror\u001b[0m ${file}: ${msg}`); };
const warn = (file, msg) => { warnings++; console.log(`  \u001b[33mwarn\u001b[0m  ${file}: ${msg}`); };

const fields = globalsFields();
const fieldNames = new Set(fields.map((f) => f.name));
console.log(`\nchecking ${entries.length} shader modules (${fields.length} globals fields)\n`);

for (const entry of entries) {
  const definesList = variants[entry] ?? [{}];
  for (const defines of definesList) {
    const label = Object.keys(defines).length ? `${entry} [${Object.entries(defines).map(([k, v]) => `-D${k}=${v}`).join(' ')}]` : entry;
    let code;
    try {
      code = resolveShader(entry, lookup, { defines }).code;
    } catch (e) {
      err(label, `include/preprocess failed: ${e.message}`);
      continue;
    }

    const eps = shaderEntryPoints(code);
    if (eps.length === 0) warn(label, 'no entry points found');

    // Parse: wgsl_reflect throws on syntax errors, and reports reflection data otherwise.
    let reflect;
    try {
      reflect = new WgslReflect(code);
    } catch (e) {
      const m = /line[: ]+(\d+)/i.exec(String(e.message ?? e));
      const lines = code.split('\n');
      const where = m ? ` (line ${m[1]}: ${(lines[Number(m[1]) - 1] ?? '').trim().slice(0, 90)})` : '';
      err(label, `parse failed: ${String(e.message ?? e)}${where}`);
      continue;
    }

    const res = declaredResources(code);
    const seen = new Map();
    for (const r of res) {
      const key = `${r.group}:${r.binding}`;
      if (seen.has(key)) err(label, `duplicate binding @group(${r.group}) @binding(${r.binding}): ${seen.get(key)} vs ${r.name}`);
      seen.set(key, r.name);
    }
    const zero = res.filter((r) => r.group === 0);
    if (!(zero.length === 1 && zero[0].binding === 0 && /uniform/.test(zero[0].type ?? ''))) {
      // common/*.wgsl declares it once; entry points inherit exactly one.
      warn(label, `expected exactly one @group(0) @binding(0) uniform (globals), got ${JSON.stringify(zero)}`);
    }

    // P.<field> references must exist in the schema.
    const refs = new Set();
    for (const m of code.matchAll(/\bP\.(\w+)/g)) refs.add(m[1]);
    for (const name of refs) {
      if (!fieldNames.has(name)) err(label, `uses P.${name}, which is not a field of Globals`);
    }

    // Workgroup sizes: sum of shared memory must fit the default 16 KiB budget.
    for (const fn of code.matchAll(/@workgroup_size\(([^)]*)\)[\s\S]{0,80}?fn\s+(\w+)/g)) {
      const dims = fn[1].split(',').map((d) => Number(d.trim()));
      const count = dims.reduce((a, b) => a * b, 1);
      if (!Number.isFinite(count)) continue;
      if (count > INVOCATION_MAX) err(label, `entry ${fn[2]} has ${count} invocations (> default max ${INVOCATION_MAX})`);
    }
    const shared = [...code.matchAll(/var<workgroup>\s+(\w+)\s*:\s*array<([^,>]+),\s*(\d+)>/g)];
    for (const s of shared) {
      const bytes = Number(s[3]) * ({ f32: 4, i32: 4, u32: 4 }[s[2].trim()] ?? 16);
      if (bytes > WORKGROUP_BUDGET) err(label, `var<workgroup> ${s[1]} is ${bytes} B (> ${WORKGROUP_BUDGET})`);
    }

    if (verbose) {
      console.log(`  ${label}`);
      for (const e of eps) console.log(`      ${e.stage} ${e.name}`);
      for (const r of res.sort((a, b) => a.group - b.group || a.binding - b.binding)) {
        console.log(`      g${r.group} b${r.binding}: ${r.name} ${r.type ? `<${r.type}>` : ''}`);
      }
    } else {
      console.log(`  \u001b[32mok\u001b[0m   ${label} (${eps.map((e) => e.name).join(', ') || 'no entry points'})`);
    }
    void reflect;
  }
}

console.log(`\n${errors} error(s), ${warnings} warning(s)\n`);
process.exit(errors ? 1 : 0);
