/**
 * The texture/binding contract between the TypeScript descriptors and the WGSL declarations.
 *
 * WebGPU validation errors for this class of mistake happen on the *device*, at pipeline or bind
 * group creation -- the app dies with a console dump instead of failing a test. Every rule here was
 * added because a real GPU rejected it:
 *
 *   1. a texture created with STORAGE_BINDING must have a storage-capable format
 *      (r16float is NOT one -- it supports read-write but not write-only access),
 *   2. a storage-texture layout entry's access must be legal for that format,
 *   3. a sampled binding declared `float` must be a *filterable* format (r32float is not),
 *      `depth` must be a depth format, `uint`/`sint` must be integer formats,
 *   4. a texture that appears in any bind group must have TEXTURE_BINDING in its usage,
 *   5. the format a pass declares with `texture_storage_2d<...>` must equal the format its layout
 *      declares, and every group(1) resource an entry point *uses* must be in that layout.
 *
 * Both sides are parsed from the real sources (no hand-maintained table), so a change on one side
 * that is not mirrored on the other fails here instead of on the user's GPU.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveShader } from '@/common/wgsl';

const { WgslReflect } = await import('wgsl_reflect/wgsl_reflect.module.js');

const root = join(process.cwd(), 'web');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// ---------------------------------------------------------------------------
// WebGPU format capability tables (spec: texture format capabilities)
// ---------------------------------------------------------------------------

const STORAGE_WRITE_FORMATS = new Set([
  'r32uint', 'r32sint', 'r32float', 'rgba8unorm', 'rgba8snorm', 'rgba8uint', 'rgba8sint',
  'rgba16uint', 'rgba16sint', 'rgba16float', 'rg32uint', 'rg32sint', 'rg32float',
  'rgba32uint', 'rgba32sint', 'rgba32float', 'rgb10a2unorm', 'rgb10a2uint', 'rg11b10ufloat',
]);
const STORAGE_READ_WRITE_FORMATS = new Set([
  ...STORAGE_WRITE_FORMATS, 'r16float', 'rg16float', 'r16uint', 'r16sint', 'rg16uint', 'rg16sint',
  'r8unorm', 'r8snorm', 'r8uint', 'r8sint', 'rg8unorm', 'rg8snorm', 'rg8uint', 'rg8sint',
]);
/** Filterable: `sampleType: 'float'` with a filtering sampler requires one of these. */
const FILTERABLE_FORMATS = new Set([
  'r8unorm', 'r8snorm', 'rg8unorm', 'rg8snorm', 'rgba8unorm', 'rgba8snorm', 'bgra8unorm',
  'r16float', 'rg16float', 'rgba16float', 'rgb10a2unorm', 'rg11b10ufloat', 'bgra8unorm-srgb',
  'rgba8unorm-srgb',
]);
const DEPTH_FORMATS = new Set(['depth16unorm', 'depth24plus', 'depth24plus-stencil8', 'depth32float', 'depth32float-stencil8']);
const UINT_FORMATS = new Set(['r8uint', 'rg8uint', 'rgba8uint', 'r16uint', 'rg16uint', 'rgba16uint', 'r32uint', 'rg32uint', 'rgba32uint', 'rgb10a2uint']);
const SINT_FORMATS = new Set(['r8sint', 'rg8sint', 'rgba8sint', 'r16sint', 'rg16sint', 'rgba16sint', 'r32sint', 'rg32sint', 'rgba32sint']);

// ---------------------------------------------------------------------------
// Source scanning helpers (balanced-delimiter scans + regexes, no TS parser)
// ---------------------------------------------------------------------------

/** Text between the delimiters that open at `from` (which must be `open`), exclusive. */
function enclosed(text: string, from: number, open: string, close: string): string {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) {
      depth--;
      if (depth === 0) return text.slice(from + 1, i);
    }
  }
  throw new Error(`unbalanced ${open}${close} at ${from}`);
}

/** Split `text` at top-level commas. */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** The expression that starts at `index`, up to the next top-level `,` `}` or `;`. */
function exprAt(text: string, index: number): string {
  let depth = 0;
  let out = '';
  for (let i = index; i < text.length; i++) {
    const ch = text[i]!;
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) {
      if (depth === 0 && ch === '}') break;
      depth--;
      if (depth < 0) break;
    } else if (ch === ',' && depth === 0) break;
    else if (ch === ';' && depth === 0) break;
    out += ch;
  }
  return out.trim();
}

/**
 * Expands `const NAME = <expr>;` references. `wanted` filters the definitions: alias expansion has
 * to pick the definition that is *about* the thing being expanded (`const color` is both a texture
 * usage flag set and a pipeline helper function in renderer.ts).
 */
function aliasText(source: string, expr: string, wanted: RegExp): string {
  let out = expr;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/\b([A-Za-z_]\w*)\b/g, (whole, name: string) => {
      const re = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*([^;]+);`, 'g');
      for (const def of source.matchAll(re)) {
        if (wanted.test(def[1]!)) return `(${def[1]})`;
      }
      return whole;
    });
    if (next === out) break;
    out = next;
  }
  return out;
}

const usageFlags = (text: string) => new Set((text.match(/GPUTextureUsage\.(\w+)/g) ?? []).map((m) => m.split('.')[1]!));

/** `bed.texture` / `inputs.nearField` / `this.nearField` all name the field they are built from. */
let textureAliases = new Map<string, string>();
function textureName(ref: string): string {
  const last = ref.split('.').pop()!;
  if (last === 'texture') return 'bedTexture'; // the `bed` parameter of the layers
  return textureAliases.get(last) ?? last;
}

/**
 * Constructor arguments rename textures: OceanSim passes `{ nearHeight: this.surface.nearField }` to
 * the MPM layer, which then binds `nearHeight`. Collect `NAME: this.<...>.<field>` pairs so the
 * bind-group references resolve back to the descriptor that created them.
 */
function collectAliases(source: string): void {
  for (const m of source.matchAll(/(\w+):\s*this\.[\w.]+?\.(\w+)\b/g)) {
    if (!textureAliases.has(m[1]!)) textureAliases.set(m[1]!, m[2]!);
  }
}

// ---------------------------------------------------------------------------
// The renderer: texture descriptors, bind-group layouts and bind groups
// ---------------------------------------------------------------------------

interface TextureDef { name: string; format: string; usage: Set<string>; file: string }

function rendererTextures(source: string): TextureDef[] {
  const out: TextureDef[] = [];
  // `const make = (label, format, usage) => device.createTexture(...)`; called as make('label','fmt',expr)
  for (const m of source.matchAll(/this\.(\w+)\s*=\s*make\(\s*'[^']*'\s*,\s*'([\w-]+)'\s*,\s*([^)]*)\)/g)) {
    out.push({ name: m[1]!, format: m[2]!, usage: usageFlags(aliasText(source, m[3]!, /GPUTextureUsage\./)), file: 'render/renderer.ts' });
  }
  return out;
}

/** `this.X = device.createTexture({ label, format: '...', usage: ... })` (the sim layers). */
function simTextures(source: string, file: string): TextureDef[] {
  const out: TextureDef[] = [];
  for (const m of source.matchAll(/this\.(\w+)\s*=\s*device\.createTexture\(\{/g)) {
    const body = enclosed(source, m.index! + m[0].length - 1, '{', '}');
    const format = /format:\s*'([\w-]+)'/.exec(body)?.[1];
    const usage = /usage:\s*([^,}]+)/.exec(body)?.[1];
    if (!format || !usage) continue;
    out.push({ name: m[1]!, format, usage: usageFlags(aliasText(source, usage, /GPUTextureUsage\./)), file });
  }
  return out;
}

interface LayoutEntry {
  binding: number;
  kind: 'buffer' | 'texture' | 'storage-texture' | 'sampler' | 'unknown';
  sampleType?: string;
  format?: string;
  access?: string;
  samplerType?: string;
}

/** Parses one `entries: [ ... ]` list of a bind group layout. */
function layoutEntries(entriesText: string): LayoutEntry[] {
  const out: LayoutEntry[] = [];
  for (const raw of splitTop(entriesText)) {
    const entry = raw.replace(/\/\/.*$/gm, '');
    const binding = /(?:^|[\s(])t\(\s*(\d+)\s*,/.exec(entry)?.[1] ?? /binding:\s*(\d+)/.exec(entry)?.[1];
    if (binding === undefined) continue;
    const shorthand = /t\(\s*\d+\s*,\s*'([\w-]+)'/.exec(entry)?.[1];
    if (shorthand) {
      out.push({ binding: Number(binding), kind: 'texture', sampleType: shorthand });
      continue;
    }
    const storage = /storageTexture:\s*\{([^}]*)\}/.exec(entry)?.[1];
    if (storage) {
      out.push({
        binding: Number(binding),
        kind: 'storage-texture',
        format: /format:\s*'([\w-]+)'/.exec(storage)?.[1],
        access: /access:\s*'([\w-]+)'/.exec(storage)?.[1],
      });
      continue;
    }
    if (/sampler:\s*\{/.test(entry)) {
      out.push({ binding: Number(binding), kind: 'sampler', samplerType: /type:\s*'([\w-]+)'/.exec(entry)?.[1] });
      continue;
    }
    if (/buffer:\s*\{/.test(entry)) {
      out.push({ binding: Number(binding), kind: 'buffer' });
      continue;
    }
    out.push({ binding: Number(binding), kind: 'unknown' });
  }
  return out;
}

interface Layout { id: string; entries: LayoutEntry[] }

function rendererLayouts(source: string): Layout[] {
  const out: Layout[] = [];
  let anon = 0;
  for (const m of source.matchAll(/device\.createBindGroupLayout\(\{/g)) {
    const body = enclosed(source, m.index! + m[0].length - 1, '{', '}');
    const label = /label:\s*'([\w-]+)'/.exec(body)?.[1];
    const entries = /entries:\s*\[/.exec(body);
    if (!entries) continue;
    out.push({ id: label ?? `inline-${anon++}`, entries: layoutEntries(enclosed(body, entries.index! + entries[0].length - 1, '[', ']')) });
  }
  return out;
}

interface BindGroup { layout: Layout; textures: Map<number, string>; samplers: Map<number, string> }

function rendererBindGroups(source: string, layouts: Layout[]): BindGroup[] {
  const out: BindGroup[] = [];
  // `this.fieldLayout = device.createBindGroupLayout(...)` names a layout after its field.
  const named = new Map<string, Layout>();
  for (const m of source.matchAll(/this\.(\w+)\s*=\s*device\.createBindGroupLayout\(\{/g)) {
    const body = enclosed(source, m.index! + m[0].length - 1, '{', '}');
    const found = layouts.find((l) => l.entries.length && l.id === (/label:\s*'([\w-]+)'/.exec(body)?.[1] ?? ''));
    if (found) named.set(m[1]!, found);
  }
  for (const m of source.matchAll(/device\.createBindGroup\(\{/g)) {
    const body = enclosed(source, m.index! + m[0].length - 1, '{', '}');
    const layoutExpr = /layout:\s*([^,]+),/.exec(body)?.[1]?.trim() ?? '';
    const field = /this\.(\w+)/.exec(layoutExpr)?.[1];
    let layout = field ? named.get(field) : undefined;
    // The post-process layout is created inline inside its pipeline layout; there is exactly one.
    if (!layout && /getBindGroupLayout/.test(layoutExpr)) layout = layouts.find((l) => l.id.startsWith('inline'));
    const entries = /entries:\s*\[/.exec(body);
    if (!layout || !entries) continue;
    const textures = new Map<number, string>();
    const samplers = new Map<number, string>();
    for (const raw of splitTop(enclosed(body, entries.index! + entries[0].length - 1, '[', ']'))) {
      const binding = /binding:\s*(\d+)/.exec(raw)?.[1];
      if (binding === undefined) continue;
      const tex = /view\(\s*this\.([\w.]+)\s*\)/.exec(raw)?.[1];
      const samp = /resource:\s*this\.samplers\.(\w+)/.exec(raw)?.[1];
      if (tex) textures.set(Number(binding), textureName(tex));
      if (samp) samplers.set(Number(binding), samp);
    }
    out.push({ layout, textures, samplers });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sim layers: kernels, their layouts and their bind groups
// ---------------------------------------------------------------------------

interface Kernel { label: string; file: string; defines: Record<string, number>; entries: string[]; layout: LayoutEntry[]; textures: Map<number, string> }

/** `const NAME = <expr>;` one-liners (the shape the layers use to name shaders and layouts). */
function constTable(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of source.matchAll(/\bconst\s+([A-Za-z_]\w*)\s*(?::\s*[^=;]+)?=\s*([^;]+);/g)) {
    if (!out.has(m[1]!)) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

/**
 * The array literal an expression stands for. Kernels reach their binding list through a local
 * name (`bindings: hashLayout`), through an arrow function (`bindings: stepBinds(a, b)`) or inline.
 */
function arrayLiteralOf(consts: Map<string, string>, expr: string, depth = 0): string | undefined {
  const trimmed = expr.trim();
  if (trimmed.startsWith('[')) return trimmed;
  if (depth > 3) return undefined;
  const call = /^([A-Za-z_]\w*)\s*\(/.exec(trimmed);
  const ident = call?.[1] ?? /^([A-Za-z_]\w*)$/.exec(trimmed)?.[1];
  if (!ident) return undefined;
  const def = consts.get(ident);
  if (!def) return undefined;
  const body = call ? def : (/=>\s*([\s\S]+)$/.exec(def)?.[1] ?? def);
  const returned = /return\s+(\[[\s\S]*\])\s*;/.exec(body)?.[1];
  return arrayLiteralOf(consts, returned ?? body, depth + 1);
}

/** Inlines `...NAME` spreads so the flattened list can be scanned entry by entry. */
function expandSpreads(consts: Map<string, string>, arrayText: string, depth = 0): string {
  if (depth > 3 || !arrayText.includes('...')) return arrayText;
  return expandSpreads(
    consts,
    arrayText.replace(/\.\.\.\s*([A-Za-z_]\w*)/g, (whole, name: string) => {
      const def = consts.get(name);
      const arr = def ? arrayLiteralOf(consts, def) : undefined;
      if (!arr) return whole;
      return `${enclosed(arr, 0, '[', ']')},`;
    }),
    depth + 1,
  );
}

/** The first `{ ... }` literal in an expression, as a defines record (`{ SWE_COARSE: 1 }`). */
function definesOf(consts: Map<string, string>, expr: string, depth = 0): Record<string, number> {
  const trimmed = expr.trim();
  if (depth > 2) return {};
  if (/^[A-Za-z_]\w*$/.test(trimmed)) return definesOf(consts, consts.get(trimmed) ?? '{}', depth + 1);
  const literal = /\{([^}]*)\}/.exec(trimmed)?.[1];
  const out: Record<string, number> = {};
  for (const pair of splitTop(literal ?? '')) {
    const kv = /(\w+)\s*:\s*(\d+)/.exec(pair);
    if (kv) out[kv[1]!] = Number(kv[2]);
  }
  return out;
}

function simKernels(source: string): Kernel[] {
  const out: Kernel[] = [];
  const consts = constTable(source);
  const kernelFields = new Map<string, string>(); // kernel field name -> label

  for (const m of source.matchAll(/(?:this\.(\w+)\s*=\s*)?createKernel\(\s*device\s*,\s*\w+\s*,\s*\{/g)) {
    const body = enclosed(source, m.index! + m[0].length - 1, '{', '}');
    const rawLabel = /label:\s*(`[^`]+`|'[^']+')/.exec(body)?.[1] ?? 'unnamed';
    const label = rawLabel.slice(1, -1).replace(/\$\{[^}]*\}/g, '*');

    // `code:` is either shader('file'[, defines]) or a name bound to one. Scan for the expression
    // rather than matching to the next comma: `shader('x', { A: 1 })` contains one.
    // `code: shader(...)` or the shorthand property `code,` (the MPM and wave layers use it).
    const codeIdx = /code:\s*/.exec(body) ?? /\bcode\s*,/.exec(body);
    const codeExpr = codeIdx ? (/^code\s*,/.test(codeIdx[0]) ? 'code' : exprAt(body, codeIdx.index + codeIdx[0].length)) : '';
    const direct = /shader\(\s*'([\w/.]+)'\s*(?:,\s*([^)]*))?\s*\)/.exec(codeExpr);
    const indirect = direct ? undefined : consts.get(codeExpr);
    const fromConst = indirect ? /shader\(\s*'([\w/.]+)'\s*(?:,\s*([^)]*))?\s*\)/.exec(indirect) : undefined;
    const file = direct?.[1] ?? fromConst?.[1];
    if (!file) continue;
    const defines = definesOf(consts, direct ? (direct[2] ?? '{}') : (fromConst?.[2] ?? '{}'));

    const entryPoint = /entryPoint:\s*'(\w+)'/.exec(body)?.[1];
    const bindIdx = /bindings:\s*/.exec(body);
    const bindingsExpr = bindIdx ? exprAt(body, bindIdx.index + bindIdx[0].length) : '';
    if (!bindingsExpr) continue;
      const list = arrayLiteralOf(consts, bindingsExpr);
    if (list === undefined) continue;

    const layout: LayoutEntry[] = [];
    for (const raw of splitTop(enclosed(expandSpreads(consts, list), 0, '[', ']'))) {
      const e = raw.trim();
      const b = /^buf\(\s*(\d+)/.exec(e)?.[1];
      const t = /^tex\(\s*(\d+)\s*(?:,\s*'([\w-]+)')?/.exec(e);
      const st = /^storageTex\(\s*(\d+)\s*,\s*'([\w-]+)'\s*(?:,\s*'([\w-]+)')?/.exec(e);
      const sp = /^samp\(\s*(\d+)\s*(?:,\s*'([\w-]+)')?/.exec(e);
      if (b !== undefined) layout.push({ binding: Number(b), kind: 'buffer' });
      else if (st) layout.push({ binding: Number(st[1]), kind: 'storage-texture', format: st[2], access: st[3] ?? 'write-only' });
      else if (t) layout.push({ binding: Number(t[1]), kind: 'texture', sampleType: t[2] ?? 'float' });
      else if (sp) layout.push({ binding: Number(sp[1]), kind: 'sampler', samplerType: sp[2] ?? 'filtering' });
    }
    if (m[1]) kernelFields.set(m[1], label);
    out.push({ label, file, defines, entries: entryPoint ? [entryPoint] : [], layout, textures: new Map() });
  }

  // `<kernelField>.group([...])` links bindings to the textures they bind.
  const byLabel = new Map(out.map((k) => [k.label, k]));
  for (const m of source.matchAll(/this\.(\w+)\.group\(\s*\[/g)) {
    const kernel = byLabel.get(kernelFields.get(m[1]!) ?? '');
    if (!kernel) continue;
    const list = enclosed(source, m.index! + m[0].length - 1, '[', ']');
    for (const raw of splitTop(list)) {
      const tex = /stex\(\s*(\d+)\s*,\s*([\w.]+)\s*\)/.exec(raw);
      if (tex) kernel.textures.set(Number(tex[1]), textureName(tex[2]!));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// WGSL side
// ---------------------------------------------------------------------------

const shaderSources = new Map<string, string>();
(function loadShaders() {
  const walk = (dir: string): void => {
    for (const name of readdirSync(join(root, 'shaders', dir))) {
      const abs = join(root, 'shaders', dir, name);
      if (statSync(abs).isDirectory()) walk(`${dir}/${name}`.replace(/^\//, ''));
      else if (name.endsWith('.wgsl')) shaderSources.set(`${dir}/${name}`.replace(/^\//, ''), readFileSync(abs, 'utf8'));
    }
  };
  walk('');
})();

interface EntryResource { name: string; kind: string; binding: number }

/** Entry-point resources (kind + binding) as the real WGSL parser sees them. */
function entryResources(file: string, defines: Record<string, number>, entry: string): EntryResource[] {
  const code = resolveShader(file, (f) => shaderSources.get(f), { defines }).code;
  const reflect = new WgslReflect(code);
  const all = [...(reflect.entry.compute ?? []), ...(reflect.entry.fragment ?? []), ...(reflect.entry.vertex ?? [])];
  const found = all.find((e) => e.name === entry);
  if (!found) throw new Error(`entry point ${entry} not found in ${file}`);
  return (found.resources ?? [])
    .filter((r) => r.group === 1)
    .map((r) => ({ name: r.name, kind: String(typeof r.type === 'string' ? r.type : (r.type?.name ?? '')), binding: r.binding }));
}

/** `texture_storage_2d<F, A>` declarations by binding. */
function declaredStorage(file: string, defines: Record<string, number>): Map<number, { format: string; access: string }> {
  const code = resolveShader(file, (f) => shaderSources.get(f), { defines }).code;
  const out = new Map<number, { format: string; access: string }>();
  const re = /@group\(1\)\s*@binding\((\d+)\)\s*var\s+\w+\s*:\s*texture_storage_2d<([^,>]+),\s*([^>]+)>/g;
  for (const m of code.matchAll(re)) out.set(Number(m[1]), { format: m[2]!.trim(), access: m[3]!.trim() });
  return out;
}

// ---------------------------------------------------------------------------

describe('texture and binding contract', () => {
  const simFiles = ['src/sim/ocean.ts', 'src/sim/surface.ts', 'src/sim/wave.ts', 'src/sim/mpm.ts', 'src/sim/swe.ts'];
  const simSources = simFiles.map((f) => [f, read(f)] as const);
  for (const [, source] of simSources) collectAliases(source);
  const textures: TextureDef[] = [
    ...rendererTextures(read('src/render/renderer.ts')),
    ...simSources.flatMap(([f, source]) => simTextures(source, f)),
  ];
  const layouts = rendererLayouts(read('src/render/renderer.ts'));
  const bindGroups = rendererBindGroups(read('src/render/renderer.ts'), layouts);
  const kernels = simSources.flatMap(([, source]) => simKernels(source));
  const byName = new Map(textures.map((t) => [t.name, t]));

  it('parses the descriptors it is meant to check', () => {
    if (process.env.DEBUG_PARSE) {
      // `DEBUG_PARSE=1 npx vitest run tests/textures.test.ts` prints what the scanners found.
      console.log('textures:', textures.map((t) => `${t.name}:${t.format}[${[...t.usage].join('|')}]`).join(' '));
      console.log('layouts:', layouts.map((l) => `${l.id}{${l.entries.map((e) => `${e.binding}/${e.kind}${e.sampleType ? ':' + e.sampleType : ''}${e.format ? ':' + e.format : ''}${e.access ? ':' + e.access : ''}`).join(',')}}`).join(' '));
      console.log('bindGroups:', bindGroups.map((b) => `${b.layout.id}{${[...b.textures].map(([k, v]) => `${k}=${v}`).join(',')}}`).join(' '));
      console.log('kernels:', kernels.map((k) => `${k.label}[${k.layout.map((e) => `${e.binding}/${e.kind}${e.format ? ':' + e.format : ''}${e.access ? ':' + e.access : ''}`).join(',')}]tex{${[...k.textures].map(([a, b]) => `${a}=${b}`).join(',')}}`).join(' '));
    }
    // If a parser stops matching, every rule below silently passes. Fail loudly instead.
    expect(textures.length).toBeGreaterThanOrEqual(10);
    expect(layouts.length).toBeGreaterThanOrEqual(4);
    expect(bindGroups.length).toBeGreaterThanOrEqual(4);
    expect(kernels.length).toBeGreaterThanOrEqual(10);
    expect(kernels.every((k) => k.label !== 'unnamed' && k.entries.length === 1)).toBe(true);
  });

  it('creates storage textures only in storage-capable formats', () => {
    for (const t of textures) {
      if (!t.usage.has('STORAGE_BINDING')) continue;
      expect(STORAGE_READ_WRITE_FORMATS.has(t.format), `${t.name} (${t.format}) is used as a storage texture`).toBe(true);
    }
  });

  it('gives every bound texture the TEXTURE_BINDING usage', () => {
    const bound = new Set<string>();
    for (const bg of bindGroups) for (const name of bg.textures.values()) bound.add(name);
    for (const k of kernels) for (const name of k.textures.values()) bound.add(name);
    expect(bound.size).toBeGreaterThanOrEqual(6);
    expect([...bound].some((n) => n === 'bedTexture')).toBe(true);
    for (const name of bound) {
      const t = byName.get(name);
      expect(t, `bind group references texture ${name}, which no descriptor defines`).toBeTruthy();
      expect(t!.usage.has('TEXTURE_BINDING'), `${name} is bound as a texture but was not created with TEXTURE_BINDING`).toBe(true);
    }
  });

  it('pairs every sampleType with a compatible format', () => {
    const check = (where: string, sampleType: string | undefined, texName: string): void => {
      const t = byName.get(texName);
      expect(t, `no descriptor for ${texName}`).toBeTruthy();
      const at = `${where} (${texName} = ${t!.format})`;
      if (sampleType === 'float') expect(FILTERABLE_FORMATS.has(t!.format), `${at} declares sampleType float`).toBe(true);
      if (sampleType === 'unfilterable-float') expect(t!.format.endsWith('float'), `${at} declares unfilterable-float`).toBe(true);
      if (sampleType === 'depth') expect(DEPTH_FORMATS.has(t!.format), `${at} declares sampleType depth`).toBe(true);
      if (sampleType === 'uint') expect(UINT_FORMATS.has(t!.format), `${at} declares sampleType uint`).toBe(true);
      if (sampleType === 'sint') expect(SINT_FORMATS.has(t!.format), `${at} declares sampleType sint`).toBe(true);
    };
    let checked = 0;
    for (const bg of bindGroups) {
      for (const [binding, texName] of bg.textures) {
        const entry = bg.layout.entries.find((e) => e.binding === binding);
        if (!entry || entry.kind !== 'texture') continue;
        check(`${bg.layout.id}:${binding}`, entry.sampleType, texName);
        checked++;
      }
    }
    for (const k of kernels) {
      for (const [binding, texName] of k.textures) {
        const entry = k.layout.find((e) => e.binding === binding);
        if (!entry || entry.kind !== 'texture') continue;
        check(`${k.label}:${binding}`, entry.sampleType, texName);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it('pairs every storage-texture access with a compatible format, on both sides', () => {
    const allowed = (format: string, access: string) =>
      access === 'read-write' ? STORAGE_READ_WRITE_FORMATS.has(format) : STORAGE_WRITE_FORMATS.has(format);

    const entriesOf = (): Array<{ where: string; entry: LayoutEntry; texName?: string }> => [
      ...bindGroups.flatMap((bg) =>
        bg.layout.entries
          .filter((e) => e.kind === 'storage-texture')
          .map((entry) => ({ where: `${bg.layout.id}:${entry.binding}`, entry, texName: bg.textures.get(entry.binding) })),
      ),
      ...kernels.flatMap((k) =>
        k.layout.filter((e) => e.kind === 'storage-texture').map((entry) => ({ where: `${k.label}:${entry.binding}`, entry, texName: k.textures.get(entry.binding) })),
      ),
    ];

    const all = entriesOf();
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const { where, entry, texName } of all) {
      expect(entry.format, `${where} declares no storage format`).toBeTruthy();
      expect(allowed(entry.format!, entry.access ?? 'write-only'), `${where} ${entry.format} (${entry.access})`).toBe(true);
      if (texName) expect(entry.format, `layout and descriptor disagree for ${texName}`).toBe(byName.get(texName)!.format);
    }

    // And the shaders must agree with the layouts they are dispatched against.
    let cross = 0;
    for (const k of kernels) {
      const declared = declaredStorage(k.file, k.defines);
      for (const entry of k.layout) {
        if (entry.kind !== 'storage-texture') continue;
        const decl = declared.get(entry.binding);
        expect(decl, `${k.label}: ${k.file} has no storage texture at binding ${entry.binding}`).toBeTruthy();
        expect(decl!.format, `${k.label}: WGSL format vs layout format`).toBe(entry.format);
        cross++;
      }
    }
    expect(cross).toBeGreaterThanOrEqual(3);
  });

  it('covers every group(1) resource a shader entry point uses', () => {
    let checked = 0;
    for (const k of kernels) {
      for (const entry of k.entries) {
        for (const res of entryResources(k.file, k.defines, entry)) {
          const binding = k.layout.find((e) => e.binding === res.binding);
          expect(binding, `${k.label} (${k.file}::${entry}) uses binding ${res.binding} (${res.name}), which its layout does not declare`).toBeTruthy();
          const kind = res.kind.includes('storage') ? 'storage-texture' : res.kind.includes('sampler') ? 'sampler' : res.kind.includes('texture') ? 'texture' : 'buffer';
          expect(binding!.kind, `${k.label} (${k.file}::${entry}) binding ${res.binding} is a ${res.kind} in WGSL`).toBe(kind);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });
});
