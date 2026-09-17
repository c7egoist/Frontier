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
  'swe/surface_resolve.wgsl': [{}, { RESOLVE_FAR: 1 }],
};
// A module is an "entry" if it declares at least one entry point. That is the right test rather than
// "does not live in common/": common/bed_bake.wgsl *is* dispatched directly and was silently
// unchecked while this filter was directory-based. Include-only files (globals, util, accum,
// surface_field, _layer) are covered transitively -- every module that includes them is checked.
const HAS_ENTRY = /@(compute|vertex|fragment)\b[^;]{0,200}?\bfn\s+\w+\s*\(/;
const entries = [...sources.keys()]
  .filter((f) => !f.endsWith('_layer.wgsl') && HAS_ENTRY.test(sources.get(f)))
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

// Per-stage resource ceilings, from the WebGPU default limits. Exceeding one is a pipeline-creation
// failure on device, and the only symptom in the browser is "the ocean is black".
const STAGE_LIMITS = {
  storageBuffer: 8,    // maxStorageBuffersPerShaderStage
  storageTexture: 4,   // maxStorageTexturesPerShaderStage
  sampledTexture: 16,  // maxSampledTexturesPerShaderStage
  sampler: 16,         // maxSamplersPerShaderStage
  uniformBuffer: 12,   // maxUniformBuffersPerShaderStage
};

/** Which of the STAGE_LIMITS buckets a `var<...>` declaration belongs to. */
function resourceKind(res) {
  // `var<storage, read_write>` parses as `storage, read_write`: keep only the address space.
  const t = (res.type ?? '').split(',')[0].trim();
  if (t.startsWith('texture_storage')) return 'storageTexture';
  if (t.startsWith('texture_depth')) return 'sampledTexture'; // depth textures count as sampled
  if (t.startsWith('texture_') || t.startsWith('texture_external')) return 'sampledTexture';
  if (t.startsWith('sampler')) return 'sampler';
  if (t === 'uniform') return 'uniformBuffer';
  if (t === 'storage' || t.startsWith('array<')) return 'storageBuffer';
  return null;
}

// --- texture rules -----------------------------------------------------------
// The GPU is the only real validator, and every one of these mistakes is a *compile* or *creation*
// error on device rather than something a test notices, so they are checked here. The two lists are
// straight out of the WebGPU spec's texture-format capabilities table; the access mode matters,
// which is the trap: r16float supports read-write but not write-only.
const STORAGE_WRITE_FORMATS = new Set([
  'r32uint', 'r32sint', 'r32float', 'rgba8unorm', 'rgba8snorm', 'rgba8uint', 'rgba8sint',
  'rgba16uint', 'rgba16sint', 'rgba16float', 'rg32uint', 'rg32sint', 'rg32float',
  'rgba32uint', 'rgba32sint', 'rgba32float', 'rgb10a2unorm', 'rgb10a2uint', 'rg11b10ufloat',
]);
const STORAGE_READ_WRITE_FORMATS = new Set([
  ...STORAGE_WRITE_FORMATS, 'r16float', 'rg16float', 'r16uint', 'r16sint', 'rg16uint', 'rg16sint',
  'r8unorm', 'r8snorm', 'r8uint', 'r8sint', 'rg8unorm', 'rg8snorm', 'rg8uint', 'rg8sint',
]);
function storageTextures(code) {
  const out = [];
  const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var\s+(\w+)\s*:\s*texture_storage_2d<([^,>]+),\s*([^>]+)>/g;
  let m;
  while ((m = re.exec(code))) out.push({ group: Number(m[1]), binding: Number(m[2]), name: m[3], format: m[4].trim(), access: m[5].trim() });
  return out;
}

/**
 * Functions with their parameter lists and bodies, found by brace matching.
 *
 * The rules below are per-function on purpose: the two bilinear helpers both name their parameter
 * `tex` and differ only in the texture kind, so a module-wide name set produces false positives.
 */
function functionsIn(code) {
  const out = [];
  for (const m of code.matchAll(/(?:^|\n)\s*fn\s+(\w+)\s*\(/g)) {
    const scan = (from, open, close) => {
      let depth = 0;
      for (let i = from; i < code.length; i++) {
        if (code[i] === open) depth++;
        else if (code[i] === close) {
          depth--;
          if (depth === 0) return i;
        }
      }
      return -1;
    };
    const parenStart = code.indexOf('(', m.index);
    const parenEnd = scan(parenStart, '(', ')');
    if (parenEnd < 0) continue;
    const braceStart = code.indexOf('{', parenEnd);
    if (braceStart < 0) continue;
    const braceEnd = scan(braceStart, '{', '}');
    if (braceEnd < 0) continue;
    out.push({ name: m[1], params: code.slice(parenStart + 1, parenEnd), body: code.slice(braceStart + 1, braceEnd) });
  }
  return out;
}

/** Names bound to a storage texture: module-level vars, or parameters of the function in question. */
function storageNamesIn(moduleNames, params) {
  const names = new Set(moduleNames);
  for (const param of params.split(',')) {
    const m = /(\w+)\s*:\s*texture_storage_2d</.exec(param);
    if (m) names.add(m[1]);
  }
  return names;
}

/**
 * Every `fnName(...)` call with its arguments split at *top-level* commas, and its offset in
 * `code` (callers use the offset to ask whether the call sits inside a branch). Hand-rolled scanning
 * rather than a regex: arguments routinely contain calls of their own (`clamp(vec2<i32>(i), ...)`),
 * which a naive `[^()]*` match silently skips -- and a rule that silently skips is worse than none.
 */
function topLevelCalls(code, fnName) {
  const out = [];
  const needle = `${fnName}(`;
  for (let i = code.indexOf(needle); i >= 0; i = code.indexOf(needle, i + 1)) {
    const before = code[i - 1];
    if (before && /[\w.]/.test(before)) continue;
    let depth = 0;
    const args = [];
    let current = '';
    for (let j = i + needle.length; j < code.length; j++) {
      const ch = code[j];
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      } else if (ch === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) args.push(current.trim());
    const name = /^(\w+)$/.exec(args[0] ?? '')?.[1];
    out.push({ name: name ?? (args[0] ?? ''), args, index: i });
  }
  return out;
}

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

    // Texture declarations: format vs access mode, and textureLoad/textureSample kind mismatches.
    const storages = storageTextures(code);
    const moduleStorageNames = storages.map((t) => t.name);
    for (const t of storages) {
      const allowed = t.access === 'read-write' ? STORAGE_READ_WRITE_FORMATS : STORAGE_WRITE_FORMATS;
      if (!allowed.has(t.format)) {
        err(label, `texture_storage_2d<${t.format}, ${t.access}> is not a valid storage texture format/access pair`);
      }
    }
    const scopes = [{ params: '', body: code, moduleNames: moduleStorageNames }, ...functionsIn(code).map((f) => ({ params: f.params, body: f.body, moduleNames: moduleStorageNames }))];
    for (const scope of scopes) {
      const storageNames = storageNamesIn(scope.moduleNames, scope.params);
      for (const call of topLevelCalls(scope.body, 'textureLoad')) {
        if (storageNames.has(call.name) && call.args.length !== 2) {
          err(label, `textureLoad(${call.name}, ...) takes 2 arguments for a storage texture (got ${call.args.length})`);
        }
      }
      for (const call of topLevelCalls(scope.body, 'textureSample')) {
        if (storageNames.has(call.name)) err(label, `textureSample*( ${call.name} ) samples a storage texture; bind it as texture_2d instead`);
      }
      // The *implicit-level* sample is the one with a uniformity requirement; the `Level`/`Grad`
      // forms are legal anywhere. Every call site in this codebase uses a level, so flag any that
      // does not, and let the author either add one or prove the uniformity.
      for (const call of topLevelCalls(scope.body, 'textureSample')) {
        if (storageNames.has(call.name)) continue;
        const inBranch = /\b(if|for|while|else)\b[\s\S]{0,400}$/.test(scope.body.slice(0, call.index));
        if (inBranch) warn(label, `textureSample(${call.name}, ...) without an explicit level inside a branch; use textureSampleLevel unless the control flow is uniform`);
      }
    }
    for (const t of storages) {
      if (t.access === 'read-write') warn(label, `${t.name} uses read-write storage access, which older WebGPU implementations reject`);
    }

    // Per-stage resource counts: module scope is per-stage scope in WGSL, so every entry point in
    // this module sees all of these resources.
    const counts = {};
    const tooMany = [];
    for (const r of res) {
      const kind = resourceKind(r);
      if (!kind) continue;
      counts[kind] = (counts[kind] ?? 0) + 1;
      const limit = STAGE_LIMITS[kind];
      if (limit !== undefined && counts[kind] > limit) tooMany.push(`${r.name} (${kind} ${counts[kind]} > ${limit})`);
    }
    if (tooMany.length) err(label, `exceeds a default per-stage resource limit: ${tooMany.join(', ')}`);

    // Workgroup sizes: sum of shared memory must fit the default 16 KiB budget.
    for (const fn of code.matchAll(/@workgroup_size\(([^)]*)\)[\s\S]{0,80}?fn\s+(\w+)/g)) {
      const dims = fn[1].split(',').map((d) => Number(d.trim()));
      const count = dims.reduce((a, b) => a * b, 1);
      if (!Number.isFinite(count)) continue;
      if (count > INVOCATION_MAX) err(label, `entry ${fn[2]} has ${count} invocations (> default max ${INVOCATION_MAX})`);
    }
    // The sizes are usually `const` names (`array<u32, BLOCK>`), so a literal-only rule would
    // silently check nothing -- which is exactly what this one did until it was caught.
    const intConsts = new Map();
    for (const c of code.matchAll(/\bconst\s+(\w+)\s*(?::\s*\w+)?\s*=\s*(\d+)\s*u?\s*;/g)) {
      intConsts.set(c[1], Number(c[2]));
    }
    const scalarBytes = { f32: 4, i32: 4, u32: 4, 'atomic<u32>': 4, 'vec2<f32>': 8, 'vec3<f32>': 12, 'vec4<f32>': 16, 'vec4<u32>': 16 };
    let sharedBytes = 0;
    const unfixed = [];
    for (const v of code.matchAll(/var<workgroup>\s+(\w+)\s*:\s*array<([^,>]+),\s*([\w]+)\s*>/g)) {
      const count = /^\d+$/.test(v[3]) ? Number(v[3]) : intConsts.get(v[3]);
      if (count === undefined) { unfixed.push(v[1]); continue; }
      const elem = scalarBytes[v[2].trim()] ?? 16;
      sharedBytes += elem * count;
      if (elem * count > WORKGROUP_BUDGET) {
        err(label, `var<workgroup> ${v[1]} is ${elem * count} B (> ${WORKGROUP_BUDGET})`);
      }
    }
    if (sharedBytes > WORKGROUP_BUDGET) {
      err(label, `workgroup memory totals ${sharedBytes} B (> ${WORKGROUP_BUDGET})`);
    }
    if (unfixed.length && verbose) warn(label, `could not size var<workgroup> ${unfixed.join(', ')}`);

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
