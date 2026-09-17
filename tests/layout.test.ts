/**
 * Layout and wiring drift guards.
 *
 * The two things that silently break a WebGPU renderer are (1) the CPU-side uniform packing
 * disagreeing with the WGSL struct and (2) a shader referencing a field nobody ever writes. Both are
 * checked here against the generated artefacts, so a schema edit that forgets the generator, or a
 * shader that starts using a parameter nobody sets, fails the test suite instead of producing
 * garbage on screen.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLOBALS, GLOBALS_FIELDS, applyConfig, defaultParams, deriveConfig, PRESETS } from '@/core/params';
import { makeWriter, pack, setField } from '@/common/uniform';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('generated globals', () => {
  const wgsl = read('web/shaders/common/globals.wgsl');

  /** The schema's shorthand type name as it is spelled in the generated WGSL struct. */
  const wgslType = (t: string): string => {
    if (t === 'mat4x4f') return 'mat4x4<f32>';
    const v = /^vec([234])([fu])$/.exec(t);
    return v ? `vec${v[1]}<${v[2] === 'u' ? 'u32' : 'f32'}>` : t;
  };

  it('matches the TypeScript schema field-for-field and offset-for-offset', () => {
    const re = /^\s*([A-Za-z_]\w*):\s*([^,]+),\s*\/\/\s*@(\d+)$/gm;
    const parsed: Array<{ name: string; type: string; offset: number }> = [];
    for (const m of wgsl.matchAll(re)) parsed.push({ name: m[1]!, type: m[2]!.trim(), offset: Number(m[3]!) });
    expect(parsed.length).toBe(GLOBALS_FIELDS.length);
    GLOBALS.fields.forEach((field, i) => {
      expect(parsed[i]).toEqual({ name: field.name, type: wgslType(field.type), offset: field.offset });
    });
  });

  it('declares the byte size in the header and binds it as group(0)', () => {
    expect(wgsl).toContain(`// Byte size: ${GLOBALS.byteSize}`);
    expect(wgsl).toContain('@group(0) @binding(0) var<uniform> P: Globals;');
    expect(GLOBALS.byteSize % 16).toBe(0);
  });

  it('packs every field without running off the end of the buffer', () => {
    const w = makeWriter(GLOBALS.byteSize);
    for (const field of GLOBALS.fields) {
      const value = field.type === 'mat4x4f' ? new Float32Array(16).fill(0.5) : field.type.startsWith('vec') ? [1, 2, 3, 4].slice(0, field.slots) : 3;
      setField(w, field, value as never);
      expect(field.offset + field.size).toBeLessThanOrEqual(GLOBALS.byteSize);
    }
    const values = { ...defaultParams(), gravity: 9.81 };
    pack(w, GLOBALS, values as Record<string, number | readonly number[]>);
    expect(w.floats[GLOBALS.get('gravity')!.offset >> 2]).toBeCloseTo(9.81, 6);
  });
});

describe('shader parameter usage', () => {
  const shaderFiles = [
    'web/shaders/common/util.wgsl',
    'web/shaders/common/bed_bake.wgsl',
    'web/shaders/swe/swe_step.wgsl',
    'web/shaders/swe/swe_splat.wgsl',
    'web/shaders/swe/swe_spawn.wgsl',
    'web/shaders/swe/surface_resolve.wgsl',
    'web/shaders/wave/wave.wgsl',
    'web/shaders/mpm/mpm.wgsl',
    'web/shaders/render/ocean.wgsl',
    'web/shaders/render/fluid.wgsl',
    'web/shaders/render/post.wgsl',
  ];

  it('uses only fields that exist in the schema', () => {
    const names = new Set(GLOBALS_FIELDS.map((f) => f.name));
    for (const file of shaderFiles) {
      const used = [...read(file).matchAll(/P\.([A-Za-z_]\w*)/g)].map((m) => m[1]!);
      for (const name of new Set(used)) expect(`${file}:${name} ${names.has(name)}`).toBe(`${file}:${name} true`);
    }
  });

  it('is written every frame by someone: presets, defaults, applyConfig or the sim', () => {
    // Names written by main.ts / OceanSim.writeUniforms (per-frame) or by tests/tools.
    const perFrame = new Set<string>();
    for (const file of ['web/src/sim/ocean.ts', 'web/src/main.ts']) {
      const src = read(file);
      for (const m of src.matchAll(/set\('([A-Za-z_]\w*)'/g)) perFrame.add(m[1]!);
      for (const m of src.matchAll(/values\.([A-Za-z_]\w*)\s*=/g)) perFrame.add(m[1]!);
      for (const m of src.matchAll(/setField\(w, layout, v\)|GLOBALS\.get\('([A-Za-z_]\w*)'\)/g)) if (m[1]) perFrame.add(m[1]);
    }
    for (const extra of ['time', 'dt', 'simDt', 'simDtInv', 'frame', 'frameParity', 'cameraPos', 'cameraUnderwater', 'resolution', 'nearPlane', 'farPlane', 'projScaleY', 'viewProj', 'invViewProj', 'view', 'invView', 'pointerPos', 'pointerPrev', 'pointerActive', 'pointerForce', 'pointerRadius', 'pointerMode', 'debugView', 'qualityLevel']) {
      perFrame.add(extra);
    }
    const staticValues = { ...defaultParams() } as Record<string, number | readonly number[]>;
    applyConfig(staticValues, deriveConfig(PRESETS.gtx!, cells()), PRESETS.gtx!);
    const written = new Set([...Object.keys(staticValues), ...perFrame]);

    // Set by OceanSim.recenter() when a camera-following lattice jumps (parsed above would miss the
    // literal names because they are written through a loop).
    const missingOnPurpose = new Set(['cswOrigin', 'sweOrigin', 'nearHeightOrigin', 'farHeightOrigin', 'mpmActiveTiles']);
    for (const file of shaderFiles) {
      for (const m of read(file).matchAll(/P\.([A-Za-z_]\w*)/g)) {
        const name = m[1]!;
        if (missingOnPurpose.has(name)) continue;
        expect(`${name} written`).toBe(`${name} ${written.has(name) ? 'written' : 'MISSING'}`);
      }
    }
  });
});

function cells() {
  return {
    vendor: 'test',
    architecture: 'test',
    device: 'test',
    description: 'test',
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxStorageBuffersPerShaderStage: 8,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupStorageSize: 16384,
    maxBufferSize: 256 * 1024 * 1024,
    hasTimestampQuery: false,
    hasTimestampInsidePasses: false,
    hasSubgroups: false,
    tier: 'gtx' as const,
  };
}
