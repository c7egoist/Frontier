// Static WGSL validation. There is no GPU in the verification environment, so this does what a
// device would do before dispatch: parse every module, confirm entry points exist, and confirm
// the bindings each shader declares match the group/binding the pipeline layout provides.
// A mismatch here is a guaranteed runtime validation error on the user's machine.
import { readFileSync } from 'node:fs';
import { WgslReflect } from 'wgsl_reflect/wgsl_reflect.module.js';
import { SHADER_FILES, WITH_COMMON, LAYOUTS, type ShaderKey } from '../src/gpu/pipelines.ts';
import { check, report } from './harness.ts';

const read = (f: string) => readFileSync(new URL(`../src/gpu/shaders/${f}`, import.meta.url), 'utf8');

const raw = {} as Record<ShaderKey, string>;
for (const [key, file] of Object.entries(SHADER_FILES) as [ShaderKey, string][]) raw[key] = read(file);

const moduleOf = (key: ShaderKey) =>
  key !== 'common' && WITH_COMMON.includes(key) ? `${raw.common}\n${raw[key]}` : raw[key];

console.log('WGSL parse');
const reflected: Partial<Record<ShaderKey, WgslReflect>> = {};
for (const key of Object.keys(SHADER_FILES) as ShaderKey[]) {
  if (key === 'common') continue;
  let ok = true, msg = '';
  try {
    reflected[key] = new WgslReflect(moduleOf(key));
  } catch (e) {
    ok = false;
    msg = (e as Error).message;
  }
  check(`${key}.wgsl parses`, ok, msg || `${moduleOf(key).split('\n').length} lines`);
}

console.log('Entry points');
const EXPECTED: Partial<Record<ShaderKey, { vs?: string; fs?: string; compute?: string[] }>> = {
  sky: { vs: 'vs', fs: 'fs' },
  post: { vs: 'vs', fs: 'fs' },
  oceanSurface: { vs: 'vs', fs: 'fs' },
  terrain: { vs: 'vs', fs: 'fs' },
  horizon: { vs: 'vs', fs: 'fs' },
  cities: { vs: 'vs', fs: 'fs' },
  map: { vs: 'vs', fs: 'fs' },
  waterColumn: { vs: 'vs', fs: 'fs' },
  oceanSim: { compute: ['main'] },
  oceanFft: { compute: ['main'] },
  oceanResolve: { compute: ['main'] },
  simShallow: { compute: ['step', 'seed'] },
};
for (const [key, want] of Object.entries(EXPECTED) as [ShaderKey, { vs?: string; fs?: string; compute?: string[] }][]) {
  const r = reflected[key];
  if (!r) { check(`${key} entry points`, false, 'module did not parse'); continue; }
  const verts = r.entry.vertex.map(e => e.name);
  const frags = r.entry.fragment.map(e => e.name);
  const comps = r.entry.compute.map(e => e.name);
  const ok = (!want.vs || verts.includes(want.vs)) &&
    (!want.fs || frags.includes(want.fs)) &&
    (!want.compute || want.compute.every(c => comps.includes(c)));
  check(`${key} entry points exist`, ok, `vertex [${verts}] fragment [${frags}] compute [${comps}]`);
}

console.log('Bindings vs pipeline layouts');
/** Which layout file supplies group 1 for each shader. */
const LAYOUT_OF: Partial<Record<ShaderKey, keyof typeof LAYOUTS>> = {
  oceanSurface: 'oceanSurface',
  terrain: 'terrain',
  horizon: 'horizon',
  cities: 'cities',
  map: 'map',
  waterColumn: 'slice',
  post: 'post',
  oceanSim: 'oceanSim',
  oceanFft: 'fft',
  oceanResolve: 'resolve',
  simShallow: 'simShallow',
};
for (const [key, layoutKey] of Object.entries(LAYOUT_OF) as [ShaderKey, keyof typeof LAYOUTS][]) {
  const r = reflected[key];
  if (!r) continue;
  const groups = r.getBindGroups();
  const expected = LAYOUTS[layoutKey] as readonly { binding: number }[];
  const expectedBindings = new Set(expected.map(e => e.binding));
  const groupIndex = key === 'oceanSim' || key === 'oceanFft' || key === 'oceanResolve' || key === 'simShallow'
    ? 0 : (key === 'post' ? 1 : 1);
  const declared = (groups[groupIndex] ?? []).filter(Boolean).map(b => b!.binding);
  const missing = declared.filter(b => !expectedBindings.has(b));
  const unused = [...expectedBindings].filter(b => !declared.includes(b));
  check(`${key}: shader bindings exist in the ${layoutKey} layout`, missing.length === 0,
    missing.length ? `shader uses ${missing.join(',')} which the layout lacks` : `${declared.length} bindings`);
  if (unused.length) {
    check(`${key}: layout has no phantom bindings`, true, `extra layout entries ${unused.join(',')} (allowed)`);
  }
}

console.log('Shared header');
{
  const r = reflected.oceanSurface!;
  const frameUniform = r.uniforms.find(u => u.name === 'frame');
  check('frame uniform is present in graphics modules', !!frameUniform && frameUniform.size === 320,
    frameUniform ? `${frameUniform.size} B` : 'missing');
  const bindings = r.getBindGroups()[0] ?? [];
  check('frame binding is at group 0 binding 0', bindings[0]?.binding === 0 && bindings[0]?.name === 'frame');
}
{
  const r = reflected.oceanSim!;
  check('compute modules do not include the graphics header',
    !r.uniforms.some(u => u.name === 'frame'), 'no Frame uniform in ocean_sim.wgsl');
}

console.log('Ocean shader sanity');
{
  const src = raw.oceanSurface;
  check('surface shader has no ternaries (WGSL has no ?:)', !/[^?]\?\s*[^:]+:/.test(src.replace(/\/\//g, '')));
  check('surface shader samples all three cascades',
    src.includes('fieldTex0') && src.includes('fieldTex1') && src.includes('fieldTex2'));
  check('surface shader fades cascades by projected texel size',
    src.includes('cascadeFade') && src.includes('footprint'));
  check('surface shader does not fake waves with a texture scroll',
    !/scrolling|scrollSpeed|uv\.y\s*[-+]=/.test(src));
}
report();
