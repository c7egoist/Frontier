/**
 * Shader-side drift guards that do not need a GPU.
 *
 * The WGSL is read from disk and expanded with the *same* preprocessor the runtime uses, so these
 * tests fail when an `#include` disappears, a define stops being handled, two bindings collide inside
 * one module, a shader starts reading a parameter the schema does not have, or a pass the TypeScript
 * layers dispatch loses its entry point.
 *
 * Why from disk rather than through `sim/shaders.ts`: `import.meta.glob` is a bundler transform, and
 * whether it sees `web/shaders` depends on the bundler's root (Vite's is `web`, vitest's is the repo
 * root, and `@`-aliased modules are processed differently from test-local ones). Reading the files and
 * calling the resolver directly tests exactly what ships -- the source tree plus the preprocessor --
 * with no bundler behaviour in the way.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOBALS_FIELDS } from '@/core/params';
import { SHADER_SOURCES, shader } from '@/sim/shaders';

const SHADER_ROOT = join(process.cwd(), 'web/shaders');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.wgsl')) out.push(p);
  }
  return out;
}

const SOURCES = new Map<string, string>();
for (const abs of walk(SHADER_ROOT)) {
  SOURCES.set(abs.slice(SHADER_ROOT.length + 1).split('\\').join('/'), readFileSync(abs, 'utf8'));
}

/**
 * Resolution goes through the *shipping* path (`sim/shaders.ts`, i.e. the bundler's `?raw` glob plus
 * the runtime preprocessor), not through a hand-rolled disk read: that is what makes a broken glob
 * pattern -- the failure mode this suite was written after -- a test failure instead of a blank
 * ocean. The disk walk below is only used to check the glob did not miss a directory.
 */
const resolve = (name: string, defines?: Record<string, number>): string => shader(name, defines);

const NAMES = [...SHADER_SOURCES.keys()].sort();

/** Every module that is compiled more than once, with the defines the runtime passes. */
const VARIANTS: Record<string, Array<Record<string, number>>> = {
  'swe/swe_step.wgsl': [{}, { SWE_COARSE: 1 }],
  'swe/swe_splat.wgsl': [{}, { SWE_COARSE: 1 }],
};

/** Entry points the TS layers dispatch. A rename has to break a test, not a frame. */
const ENTRY_POINTS: Record<string, string[]> = {
  'common/bed_bake.wgsl': ['main'],
  'swe/swe_hash.wgsl': ['clear', 'count', 'scatter'],
  'swe/swe_scan.wgsl': ['scanBlocks', 'scanTop', 'scanAdd'],
  'swe/swe_step.wgsl': ['main'],
  'swe/swe_splat.wgsl': ['clearNear', 'splatSwe'],
  'swe/swe_spawn.wgsl': ['spawnFromCrests'],
  'swe/surface_resolve.wgsl': ['resolveNear', 'resolveFar'],
  'wave/wave.wgsl': ['clearFar', 'update', 'splat'],
  'mpm/mpm.wgsl': ['clear', 'p2g', 'gridUpdate', 'g2p', 'spawn'],
  'render/ocean.wgsl': ['vs', 'fs', 'skyVs', 'skyFs'],
  'render/fluid.wgsl': ['vsSplat', 'fsThickness', 'fsSurface', 'vsFull', 'fsShade'],
  'render/nrf.wgsl': ['horizontal', 'vertical', 'cleanup'],
  'render/post.wgsl': ['fs'],
};

const fieldNames = new Set(GLOBALS_FIELDS.map((f) => f.name));

describe('wgsl modules', () => {
  it('bundles every file on disk, and only those', () => {
    // The glob pattern is relative to `web/src/sim`; get it wrong (absolute paths resolve against the
    // bundler root) and the map is silently empty.
    expect(NAMES.length).toBeGreaterThan(10);
    expect(NAMES).toEqual([...SOURCES.keys()].sort());
    for (const [name, source] of SOURCES) expect(SHADER_SOURCES.get(name), name).toBe(source);
  });

  it('resolves every source with no include or pragma left over', () => {
    for (const name of NAMES) {
      const code = resolve(name);
      expect(code, name).not.toMatch(/^\s*#\s*(include|pragma|ifdef|ifndef|endif|else|elif|if|define)\b/m);
      expect(code.length, name).toBeGreaterThan(40);
    }
  });

  it('resolves the coarse variants of the layers that have them', () => {
    for (const [name, variants] of Object.entries(VARIANTS)) {
      for (const defines of variants) {
        const key = `${name}${Object.keys(defines).length ? ` ${JSON.stringify(defines)}` : ''}`;
        expect(resolve(name, defines), key).not.toMatch(/#\s*(ifdef|ifndef|if|endif)\b/);
      }
    }
    // The coarse variant must be a *different* module, or the define does nothing. Compare on `P.`
    // accesses, not on substrings: the generated Globals struct declares both layers' fields.
    const fine = resolve('swe/swe_step.wgsl');
    const coarse = resolve('swe/swe_step.wgsl', { SWE_COARSE: 1 });
    expect(coarse).not.toBe(fine);
    expect(coarse).toContain('P.cswDx');
    expect(coarse).not.toContain('P.sweDx');
    expect(fine).toContain('P.sweDx');
    expect(fine).not.toContain('P.cswDx');
  });

  it('declares the entry points the simulation dispatches', () => {
    for (const [name, entries] of Object.entries(ENTRY_POINTS)) {
      const code = resolve(name);
      for (const entry of entries) {
        // `@compute @workgroup_size(8, 8)` may sit between the stage attribute and the `fn`.
        const re = new RegExp(`@(compute|vertex|fragment)\\b[^;]*?\\bfn\\s+${entry}\\s*\\(`);
        expect(code, `${name}::${entry}`).toMatch(re);
      }
    }
  });

  it('binds group(0) binding(0) to the params uniform and never collides inside a module', () => {
    for (const name of NAMES) {
      const code = resolve(name);
      if (!/\bP\.[A-Za-z_]/.test(code)) continue;
      // Include-only snippets (accum, util, surface_field, ...) own no bindings; the module that
      // includes them binds the params block.
      if (!/@group\(\d+\)\s*@binding\(\d+\)/.test(code)) continue;
      expect(code, name).toContain('@group(0) @binding(0) var<uniform>');
      const seen = new Map<string, string>();
      const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<([^>]*)>)?\s+([A-Za-z_]\w*)/g;
      for (const m of code.matchAll(re)) {
        const key = `${m[1]}:${m[2]}`;
        expect(seen.has(key), `${name} declares ${key} twice (${seen.get(key)} and ${m[4]})`).toBe(false);
        seen.set(key, m[4]!);
      }
    }
  });

  it('only reads parameters the schema defines', () => {
    for (const name of NAMES) {
      const code = resolve(name);
      for (const m of code.matchAll(/\bP\.([A-Za-z_]\w*)/g)) {
        expect(fieldNames.has(m[1]!), `${name} reads P.${m[1]}`).toBe(true);
      }
    }
  });

  it('keeps the accumulator contract in one place', () => {
    // The fixed-point scales are shared by every writer; a change here must change the readers too.
    const accum = resolve('common/accum.wgsl');
    for (const constant of ['HEIGHT_SCALE', 'FOAM_SCALE', 'VEL_SCALE', 'VEL_BIAS', 'COUNT_SCALE', 'HEIGHT_BIAS']) {
      expect(accum, constant).toContain(`const ${constant}`);
    }
    for (const file of ['swe/swe_splat.wgsl', 'wave/wave.wgsl', 'swe/surface_resolve.wgsl']) {
      expect(resolve(file), file).toContain('common/accum.wgsl');
    }
  });
});
