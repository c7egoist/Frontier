// Proves that LAYOUTS (the pipeline side) and the shaders (the WGSL side) agree on *stage
// visibility* as well as group/binding, by reading the @group/@binding attributes and the stage
// of each declaration straight out of the source. wgsl_reflect gives bindings but not which
// stage declared them, and a visibility mismatch is a hard runtime validation error.
import { readFileSync } from 'node:fs';
import { LAYOUTS, WITH_COMMON, type ShaderKey } from '../src/gpu/pipelines.ts';
import { check, report } from './harness.ts';

const read = (f: string) => readFileSync(new URL(`../src/gpu/shaders/${f}`, import.meta.url), 'utf8');

function declarations(src: string) {
  // Matches `@group(g) @binding(b) var<space> name : type;` (with optional attributes between).
  const out: { group: number; binding: number; space: string; line: string }[] = [];
  const re = /@group\((\d+)\)\s*@binding\((\d+)\)\s*var\s*(?:<([a-z-]+)>)?\s*([A-Za-z_][\w]*)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({ group: Number(m[1]), binding: Number(m[2]), space: m[3] ?? 'uniform', line: m[0] });
  }
  return out;
}

/** Which entry points reference a name, and therefore which stages can see the binding. */
function stagesUsing(src: string, name: string): Set<'vertex' | 'fragment' | 'compute'> {
  const stages = new Set<'vertex' | 'fragment' | 'compute'>();
  const fnRe = /@(vertex|fragment|compute)[\s\S]*?fn\s+([A-Za-z_]\w*)\s*\([\s\S]*?\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(src))) {
    const body = m[0];
    // ignore the declaration itself
    const bodyNoDecl = body.replace(/@group\([^)]*\)\s*@binding\([^)]*\)[^;]*;/g, '');
    if (new RegExp(`\\b${name}\\b`).test(bodyNoDecl)) stages.add(m[1] as 'vertex' | 'fragment' | 'compute');
  }
  return stages;
}

const PNG = {
  oceanSurface: 'oceanSurface', terrain: 'terrain', horizon: 'horizon', cities: 'cities',
  map: 'map', waterColumn: 'slice', post: 'post', oceanSim: 'oceanSim', oceanFft: 'fft',
  oceanResolve: 'resolve', simShallow: 'simShallow',
} as const;

const raw: Record<string, string> = {
  oceanSurface: read('ocean_surface.wgsl'), terrain: read('terrain.wgsl'), horizon: read('horizon.wgsl'),
  cities: read('cities.wgsl'), map: read('map.wgsl'), waterColumn: read('water_column.wgsl'),
  post: read('post.wgsl'), oceanSim: read('ocean_sim.wgsl'), oceanFft: read('ocean_fft.wgsl'),
  oceanResolve: read('ocean_resolve.wgsl'), simShallow: read('sim_shallow.wgsl'),
};
const common = read('common.wgsl');

console.log('Stage visibility');
for (const [key, layoutKey] of Object.entries(PNG)) {
  const src = (WITH_COMMON.includes(key as ShaderKey) ? `${common}\n${raw[key]}` : raw[key]);
  const decls = declarations(src);
  const ownGroup = (key === 'oceanSim' || key === 'oceanFft' || key === 'oceanResolve' || key === 'simShallow') ? 0 : 1;
  const layout = LAYOUTS[layoutKey] as readonly { binding: number; visibility: string; kind: string }[];
  const problems: string[] = [];
  for (const d of decls.filter(x => x.group === ownGroup)) {
    const spec = layout.find(l => l.binding === d.binding);
    if (!spec) { problems.push(`binding ${d.binding} not in layout`); continue; }
    const used = stagesUsing(src, nameOf(d.line));
    const wantsTextureSampling = /texture_2d|texture_2d_array/.test(d.line) ||
      /sampler/.test(d.line);
    if (wantsTextureSampling && used.has('vertex') && spec.visibility === 'fragment') {
      problems.push(`binding ${d.binding} sampled in vertex but layout says fragment-only`);
    }
    if (used.has('fragment') && spec.visibility === 'vertex') {
      problems.push(`binding ${d.binding} used in fragment but layout says vertex-only`);
    }
  }
  check(`${key}: layout stage visibility matches shader usage`, problems.length === 0, problems.join('; ') || `${decls.filter(x => x.group === ownGroup).length} bindings checked`);
}

function nameOf(line: string): string {
  const m = /var\s*(?:<[a-z-]+>)?\s*([A-Za-z_]\w*)\s*:/.exec(line);
  return m ? m[1] : '';
}

console.log('Sampler + texture pairing');
for (const [key, src] of Object.entries(raw)) {
  const decls = declarations(src);
  const samplers = decls.filter(d => /sampler/.test(d.line));
  const textures = decls.filter(d => /texture_2d/.test(d.line));
  if (!textures.length) continue;
  check(`${key}: every sampled texture has a sampler available`, samplers.length > 0,
    `${textures.length} textures, ${samplers.length} samplers`);
}
report();
