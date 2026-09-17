/**
 * WGSL module system.
 *
 * WGSL has no `#include`; every real WebGPU project reinvents one. Ours is deliberately tiny:
 *   - `#include "path/from/web/shaders"` is textually inlined, recursively.
 *   - `#pragma once` (or a second include of the same file) is a no-op, so files can include freely.
 *   - `#define NAME` / `#undef NAME` plus `#if NAME ... #endif` provide per-variant compilation,
 *     which is how we specialise kernels (e.g. MPM solid vs fluid boundary tiles) without
 *     duplicating shader source.
 *
 * The resolver is a pure function of (entry, lookup) so it can be unit-tested in Node and reused
 * by `tools/check-wgsl.mjs` without pulling in Vite.
 */

export type ShaderSourceMap = Map<string, string>;

export interface ResolvedShader {
  /** Fully expanded source, ready for device.createShaderModule(). */
  code: string;
  /** All files that contributed, in include order (used for shader-module caching / RT logs). */
  files: string[];
}

export interface ResolveOptions {
  defines?: Record<string, string | number | boolean>;
}

const INCLUDE_RE = /^[ \t]*#include[ \t]+["']([^"']+)["'][ \t]*$/;
const DEFINE_RE = /^[ \t]*#define[ \t]+([A-Za-z_][A-Za-z0-9_]*)(?:[ \t]+(.*?))?[ \t]*$/;
const UNDEF_RE = /^[ \t]*#undef[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/;
const IF_RE = /^[ \t]*#if[ \t]+(!?)([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/;
const IFDEF_RE = /^[ \t]*#ifdef[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/;
const IFNDEF_RE = /^[ \t]*#ifndef[ \t]+([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/;
const ELIF_RE = /^[ \t]*#elif[ \t]+(!?)([A-Za-z_][A-Za-z0-9_]*)[ \t]*$/;
const ELSE_RE = /^[ \t]*#else[ \t]*$/;
const ENDIF_RE = /^[ \t]*#endif[ \t]*$/;
const ONCE_RE = /^[ \t]*#pragma[ \t]+once[ \t]*$/;

/**
 * Expands `#include`s (and the mini #if/#define preprocessor) starting at `entry`.
 * Throws with a full include chain on missing files / cycles, which is far more useful
 * than the raw WGSL parser error you would otherwise get.
 */
export function resolveShader(
  entry: string,
  lookup: (file: string) => string | undefined,
  options: ResolveOptions = {},
): ResolvedShader {
  const rootDefines = new Map<string, string>();
  for (const [k, v] of Object.entries(options.defines ?? {})) rootDefines.set(k, String(v));

  const included = new Set<string>();
  const files: string[] = [];
  const stack: string[] = [];

  function expand(file: string, defines: Map<string, string>, depth: number): string {
    if (depth > 32) throw new Error(`#include depth exceeded (cycle?) at ${file}: ${stack.join(' -> ')}`);
    if (included.has(file)) return `// [skipped, already included] ${file}\n`;
    included.add(file);
    files.push(file);
    stack.push(file);

    const raw = lookup(file);
    if (raw === undefined) {
      throw new Error(`Shader not found: "${file}"\n  include chain: ${stack.join(' -> ')}`);
    }

    const out: string[] = [`// ==== ${file} ====`];
    const lines = raw.split(/\r?\n/);

    // `#if` stack: true when emitting, plus whether the current branch was taken.
    const ifStack: Array<{ active: boolean; taken: boolean; inverted: boolean }> = [];
    const emitting = () => ifStack.every((f) => f.active);

    for (const line of lines) {
      const inc = INCLUDE_RE.exec(line);
      if (inc) {
        if (emitting()) out.push(expand(normalise(inc[1]!, file), new Map(defines), depth + 1));
        continue;
      }
      if (ONCE_RE.test(line)) continue;

      const def = DEFINE_RE.exec(line);
      if (def) {
        if (emitting()) defines.set(def[1]!, def[2] ?? '1');
        continue;
      }
      const undef = UNDEF_RE.exec(line);
      if (undef) {
        if (emitting()) defines.delete(undef[1]!);
        continue;
      }
      const ifm = IF_RE.exec(line) ?? IFDEF_RE.exec(line) ?? IFNDEF_RE.exec(line);
      if (ifm) {
        // `#if NAME` / `#ifdef NAME` / `#ifndef NAME` all reduce to "is NAME defined and truthy",
        // with `#if !NAME` and `#ifndef` inverting it.
        const name = ifm[2] ?? ifm[1]!;
        const raw = defines.get(name);
        let value = raw !== undefined && raw !== '0' && raw !== 'false';
        if (ifm[1] === '!' || IFNDEF_RE.test(line)) value = !value;
        const outer = emitting();
        ifStack.push({ active: outer && value, taken: outer && value, inverted: false });
        continue;
      }
      const elifm = ELIF_RE.exec(line);
      if (elifm) {
        const top = ifStack[ifStack.length - 1];
        if (!top) throw new Error(`#elif without #if in ${file}`);
        const outerActive = ifStack.slice(0, -1).every((f) => f.active);
        const rawValue = defines.get(elifm[2]!);
        let value = rawValue !== undefined && rawValue !== '0' && rawValue !== 'false';
        if (elifm[1] === '!') value = !value;
        top.active = outerActive && !top.taken && value;
        top.taken = top.taken || top.active;
        continue;
      }
      if (ELSE_RE.test(line)) {
        const top = ifStack[ifStack.length - 1];
        if (!top) throw new Error(`#else without #if in ${file}`);
        const outerActive = ifStack.slice(0, -1).every((f) => f.active);
        top.active = outerActive && !top.taken;
        top.taken = top.taken || top.active;
        continue;
      }
      if (ENDIF_RE.test(line)) {
        if (!ifStack.pop()) throw new Error(`#endif without #if in ${file}`);
        continue;
      }
      if (emitting()) out.push(line);
    }
    if (ifStack.length > 0) throw new Error(`unterminated #if in ${file}`);
    stack.pop();
    return out.join('\n');
  }

  const code = expand(normalise(entry, ''), rootDefines, 0);
  return { code, files };
}

function normalise(file: string, from: string): string {
  let f = file.replace(/\\/g, '/').trim();
  while (f.startsWith('./')) f = f.slice(2);
  if (!f.endsWith('.wgsl')) f += '.wgsl';
  if (f.startsWith('/')) f = f.slice(1); // tolerate absolute-looking paths
  // Resolve relative paths against the including file's directory.
  if (file.startsWith('./') || file.startsWith('../')) {
    const base = from.split('/').slice(0, -1);
    for (const part of f.split('/')) {
      if (part === '.' || part === '') continue;
      else if (part === '..') base.pop();
      else base.push(part);
    }
    f = base.join('/');
  }
  return f;
}

/** Convenience: build a lookup function over a plain object of `path -> source`. */
export function lookupFromRecord(record: Record<string, string>): (f: string) => string | undefined {
  return (f) => record[f];
}
