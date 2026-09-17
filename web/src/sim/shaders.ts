import { resolveShader, type ShaderSourceMap } from '@/common/wgsl';

/**
 * All WGSL is pulled in at build time (Vite `?raw`), then expanded through the tiny include
 * preprocessor in common/wgsl.ts. Keeping the sources in a map also lets the same resolver run in
 * Node (tools/check-wgsl.mjs) and in tests, which is how shader/layout drift is caught in CI
 * without a GPU.
 */
// Two directories up is `web/shaders` (this module lives in web/src/sim). The pattern is relative on
// purpose: Vite resolves an absolute `/shaders/**` against its *root*, which is `web` for the dev
// server and the build but the repository root when the resolver runs under vitest -- so the absolute
// form silently yields an empty map there.
const raw = import.meta.glob('../../shaders/**/*.wgsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * Keys are relative to this module (`../../shaders/swe/swe_step.wgsl`); the rest of the project
 * refers to shaders by their path inside `web/shaders` (`swe/swe_step.wgsl`), which is what
 * `#include` lines, the Node-side checker and the tests all use.
 */
const strip = (p: string) => p.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '').replace(/^shaders\//, '');

export const SHADER_SOURCES: ShaderSourceMap = new Map(
  Object.entries(raw).map(([path, source]) => [strip(path), source as string]),
);

export type ShaderDefines = Record<string, string | number | boolean>;

const cache = new Map<string, string>();

export function shader(name: string, defines?: ShaderDefines): string {
  const key = defines ? `${name}|${JSON.stringify(defines)}` : name;
  const hit = cache.get(key);
  if (hit) return hit;
  const { code } = resolveShader(name, (f) => SHADER_SOURCES.get(f), { defines });
  cache.set(key, code);
  return code;
}

export const SHADER_NAMES = [...SHADER_SOURCES.keys()].sort();

/** Names of the storage-buffer bindings a shader declares, for layout consistency tests. */
export function declaredBindings(name: string, defines?: ShaderDefines) {
  const code = shader(name, defines);
  const out: Array<{ group: number; binding: number; kind: string; name: string }> = [];
  const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<([^>]*)>)?\s+([A-Za-z_]\w*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out.push({ group: Number(m[1]), binding: Number(m[2]), kind: (m[3] ?? '').trim(), name: m[4]! });
  }
  return out;
}
