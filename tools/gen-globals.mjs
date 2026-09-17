#!/usr/bin/env node
/**
 * Regenerates web/shaders/common/globals.wgsl from the TypeScript schema, and fails if the
 * checked-in file is stale (`--check`). Keeps CPU packing and WGSL layout provably in sync.
 *
 *   node tools/gen-globals.mjs          # write
 *   node tools/gen-globals.mjs --check  # verify (used by npm test)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'web/shaders/common/globals.wgsl');

const TYPES = {
  f32: { wgsl: 'f32', align: 4, size: 4 },
  i32: { wgsl: 'i32', align: 4, size: 4 },
  u32: { wgsl: 'u32', align: 4, size: 4 },
  vec2f: { wgsl: 'vec2<f32>', align: 8, size: 8 },
  vec3f: { wgsl: 'vec3<f32>', align: 16, size: 12 },
  vec4f: { wgsl: 'vec4<f32>', align: 16, size: 16 },
  vec2u: { wgsl: 'vec2<u32>', align: 8, size: 8 },
  vec3u: { wgsl: 'vec3<u32>', align: 16, size: 12 },
  vec4u: { wgsl: 'vec4<u32>', align: 16, size: 16 },
  mat4x4f: { wgsl: 'mat4x4<f32>', align: 16, size: 64 },
};

// The schema lives in TS; extract it by transpiling the module's field list textually. Rather
// than depend on a TS runtime, the generator imports the compiled-free source through a tiny
// loader that strips types. Keeping this dumb means the tool has zero build dependencies.
const src = readFileSync(path.join(root, 'web/src/core/params.ts'), 'utf8');
const blockStart = src.indexOf('export const GLOBALS_FIELDS');
const blockEnd = src.indexOf('];', blockStart);
if (blockStart < 0 || blockEnd < 0) throw new Error('GLOBALS_FIELDS not found in core/params.ts');
const block = src.slice(blockStart, blockEnd);

const fields = [];
const re = /name:\s*'([^']+)'\s*,\s*type:\s*'([^']+)'(?:\s*,\s*doc:\s*'([^']*)')?/g;
let m;
while ((m = re.exec(block))) fields.push({ name: m[1], type: m[2], doc: m[3] });
if (fields.length === 0) throw new Error('No fields parsed from GLOBALS_FIELDS');

let offset = 0;
let maxAlign = 4;
const lines = [];
for (const f of fields) {
  const t = TYPES[f.type];
  if (!t) throw new Error(`Unknown type ${f.type} for ${f.name}`);
  offset = Math.ceil(offset / t.align) * t.align;
  const decl = `${f.name}: ${t.wgsl},`;
  if (f.doc) lines.push(`  /// ${f.doc}`);
  lines.push(`  ${decl.padEnd(42)}// @${offset}`);
  offset += t.size;
  maxAlign = Math.max(maxAlign, t.align);
}
const byteSize = Math.ceil(offset / maxAlign) * maxAlign;

const out = `// AUTO-GENERATED from web/src/core/params.ts (GLOBALS_FIELDS) by tools/gen-globals.mjs.
// Do not edit by hand -- run \`npm run gen:globals\` after changing the schema.
// Byte size: ${byteSize}

#pragma once

struct Globals {
${lines.join('\n')}
};

@group(0) @binding(0) var<uniform> P: Globals;
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current.trim() !== out.trim()) {
    console.error('globals.wgsl is stale. Run: node tools/gen-globals.mjs');
    process.exit(1);
  }
  console.log(`globals.wgsl OK (${fields.length} fields, ${byteSize} bytes)`);
} else {
  writeFileSync(target, out);
  console.log(`wrote ${path.relative(root, target)} (${fields.length} fields, ${byteSize} bytes)`);
}
