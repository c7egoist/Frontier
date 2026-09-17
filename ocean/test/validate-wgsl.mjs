// Static WGSL validation: bundle shader strings from src, parse each with
// wgsl_reflect (full WGSL parser), report errors, and cross-check the bind
// group declarations against the layouts used in sim.ts / renderer.ts.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { WgslReflect } = await import('wgsl_reflect/wgsl_reflect.module.js');

const entry = `
export { COMMON } from './src/shaders/common';
export { SIM_INIT, SIM_STEP, AMR_FINE_STEP, AMR_RESTRICT, AMR_COMPOSITE, AMR_SCORE } from './src/shaders/sim';
export { SPRAY_SPAWN, SPRAY_UPDATE, SPRAY_RENDER } from './src/shaders/spray';
export { SKY, WATER, MINIMAP } from './src/shaders/water';
`;
writeFileSync('/tmp/shader_entry.ts', entry);

await build({
  stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: 'entry.ts' },
  bundle: true, format: 'esm', outfile: '/tmp/shaders.bundle.mjs', platform: 'neutral',
});

const shaders = await import('/tmp/shaders.bundle.mjs');

// Expected bindings per shader: [binding, kind] where kind:
// u=uniform, t=sampled texture, s=write-only storage texture, b=read storage buf, rw=rw storage buf
const expected = {
  COMMON: [],
  SIM_INIT: [[0, 'u'], [1, 's']],
  SIM_STEP: [[0, 'u'], [1, 't'], [2, 's']],
  AMR_FINE_STEP: [[0, 'u'], [1, 't'], [2, 't'], [3, 's'], [4, 'b']],
  AMR_RESTRICT: [[0, 'u'], [1, 't'], [2, 's'], [3, 'b']],
  AMR_COMPOSITE: [[0, 'u'], [1, 't'], [2, 't'], [3, 's'], [4, 'b']],
  AMR_SCORE: [[0, 'u'], [1, 't'], [2, 'rw']],
  SPRAY_SPAWN: [[0, 'u'], [1, 't'], [2, 'rw'], [3, 'rw'], [4, 'rw']],
  SPRAY_UPDATE: [[0, 'u'], [1, 't'], [2, 'rw'], [3, 'rw']],
  SPRAY_RENDER: [[0, 'u'], [1, 'b'], [2, 'b']],
  SKY: [[0, 'u']],
  WATER: [[0, 'u'], [1, 't'], [2, 't'], [3, 't'], [4, 'samp']],
  MINIMAP: [[0, 'u'], [1, 't'], [2, 'samp'], [3, 'b']],
};

let failures = 0;
for (const [name, code] of Object.entries(shaders)) {
  if (typeof code !== 'string') continue;
  try {
    const r = new WgslReflect(code);
    const found = [
      ...(r.uniforms ?? []).map((u) => [u.binding, 'u']),
      ...(r.textures ?? []).map((u) => [u.binding, 't']),
      ...(r.samplers ?? []).map((u) => [u.binding, 'samp']),
      ...(r.storage ?? []).map((u) => {
        const tn = (u.type?.getTypeName?.() ?? u.type?.name ?? '');
        if (/texture_storage/.test(tn)) return [u.binding, 's'];
        if (u.access === 'read_write') return [u.binding, 'rw'];
        return [u.binding, 'b'];
      }),
    ];
    const exp = expected[name];
    const norm = (a) => JSON.stringify([...a].sort((x, y) => x[0] - y[0]));
    const match = exp && norm(found) === norm(exp);
    const stages = [
      r.compute?.length ? `compute:${r.compute.length}` : null,
      r.vertex?.length ? `vertex:${r.vertex.length}` : null,
      r.fragment?.length ? `fragment:${r.fragment.length}` : null,
    ].filter(Boolean).join(' ');
    console.log(`${match ? 'OK  ' : 'MISMATCH'} ${name.padEnd(14)} [${stages}] bindings=${norm(found)}`);
    if (!match) failures++;
  } catch (e) {
    failures++;
    console.error(`ERROR ${name}: ${e.message}`);
  }
}

// uniform struct size checks (must match TS-side packing)
import { build as _b } from 'esbuild';
const sizeChecks = [
  ['SIM_STEP', 'SimParams', 104],
  ['SPRAY_UPDATE', 'UpdParams', 48],
  ['SPRAY_RENDER', 'RenderUniforms', 272],
  ['WATER', 'RenderUniforms', 272],
  ['SKY', 'RenderUniforms', 272],
  ['MINIMAP', 'RenderUniforms', 272],
];
console.log('\n--- struct sizes ---');
for (const [shader, struct, want] of sizeChecks) {
  const r = new WgslReflect(shaders[shader]);
  const st = (r.structs ?? []).find((s) => s.name === struct);
  if (!st) { console.log(`MISSING ${shader}:${struct}`); failures++; continue; }
  const ok = st.size === want;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${shader}:${struct} size=${st.size} want=${want}`);
  if (!ok) failures++;
}
process.exit(failures ? 1 : 0);
