// Shader module assembly, bind group layouts and pipeline creation.
//
// Each pipeline gets its own GPUShaderModule made of `common.wgsl` (frame uniform, noise, sky,
// fog, tone mapping) followed by the file that implements it. Graphics shaders use group 0 for
// the shared frame binding and group 1 for their own resources; compute shaders have no shared
// header and use group 0 for their parameters. That keeps every module self-contained, which is
// what WebGPU wants: one declaration per binding per module.

export const SHADER_FILES = {
  common: 'common.wgsl',
  sky: 'sky.wgsl',
  oceanSim: 'ocean_sim.wgsl',
  oceanFft: 'ocean_fft.wgsl',
  oceanResolve: 'ocean_resolve.wgsl',
  oceanSurface: 'ocean_surface.wgsl',
  simShallow: 'sim_shallow.wgsl',
  terrain: 'terrain.wgsl',
  horizon: 'horizon.wgsl',
  cities: 'cities.wgsl',
  map: 'map.wgsl',
  waterColumn: 'water_column.wgsl',
  post: 'post.wgsl',
} as const;

export type ShaderKey = keyof typeof SHADER_FILES;

/** Graphics modules that need the shared header. */
export const WITH_COMMON: ShaderKey[] = ['sky', 'oceanSurface', 'terrain', 'horizon', 'cities', 'map', 'waterColumn', 'post'];

export interface ShaderSource {
  raw: Record<ShaderKey, string>;
  /** Module source per pipeline. */
  modules: Record<ShaderKey, string>;
}

export function buildShaderSources(raw: Record<ShaderKey, string>): ShaderSource {
  const modules = {} as Record<ShaderKey, string>;
  for (const key of Object.keys(SHADER_FILES) as ShaderKey[]) {
    if (key === 'common') continue;
    const needsCommon = WITH_COMMON.includes(key);
    modules[key] = needsCommon ? `${raw.common}\n\n// ---- ${key} ----\n${raw[key]}` : raw[key];
  }
  return { raw, modules };
}

/** Declarative bind group layouts, shared by the renderer and the static layout tests. */
export interface LayoutEntrySpec {
  binding: number;
  visibility: 'vertex' | 'fragment' | 'compute' | 'vertex-fragment';
  kind: 'uniform' | 'storage-ro' | 'storage-rw' | 'sampler' | 'tex' | 'tex-storage-ro' | 'tex-storage-write' | 'tex-array' | 'storage-buffer';
  sampleType?: 'float' | 'unfilterable-float';
  viewDimension?: '2d' | '2d-array';
}

export const LAYOUTS = {
  frame: [
    { binding: 0, visibility: 'vertex-fragment', kind: 'uniform' },
    { binding: 1, visibility: 'fragment', kind: 'sampler' },
    { binding: 2, visibility: 'fragment', kind: 'sampler' },
  ],
  oceanSim: [
    { binding: 0, visibility: 'compute', kind: 'uniform' },
    { binding: 1, visibility: 'compute', kind: 'storage-ro' },
    { binding: 2, visibility: 'compute', kind: 'storage-ro' },
    { binding: 3, visibility: 'compute', kind: 'tex-storage-write' },
    { binding: 4, visibility: 'compute', kind: 'tex-storage-write' },
  ],
  fft: [
    { binding: 0, visibility: 'compute', kind: 'uniform' },
    { binding: 1, visibility: 'compute', kind: 'tex-storage-ro' },
    { binding: 2, visibility: 'compute', kind: 'tex-storage-ro' },
    { binding: 3, visibility: 'compute', kind: 'tex-storage-write' },
    { binding: 4, visibility: 'compute', kind: 'tex-storage-write' },
  ],
  resolve: [
    { binding: 0, visibility: 'compute', kind: 'uniform' },
    { binding: 1, visibility: 'compute', kind: 'tex-storage-ro' },
    { binding: 2, visibility: 'compute', kind: 'tex-storage-ro' },
    { binding: 3, visibility: 'compute', kind: 'tex-storage-write' },
    { binding: 4, visibility: 'compute', kind: 'tex-storage-write' },
  ],
  simShallow: [
    { binding: 0, visibility: 'compute', kind: 'uniform' },
    { binding: 1, visibility: 'compute', kind: 'tex' },
    { binding: 2, visibility: 'compute', kind: 'tex' },
    { binding: 3, visibility: 'compute', kind: 'sampler' },
    { binding: 4, visibility: 'compute', kind: 'tex-storage-write' },
    { binding: 5, visibility: 'compute', kind: 'tex' },
  ],
  // The vertex stage samples the cascades and the bathymetry to displace geometry, so these are
  // vertex-visible; the fragment stage shades with the same resources. The sim texture is
  // storage-written by compute and read with a non-filtering access path.
  oceanSurface: [
    { binding: 0, visibility: 'vertex-fragment', kind: 'uniform' },
    { binding: 1, visibility: 'vertex-fragment', kind: 'tex' },
    { binding: 2, visibility: 'vertex-fragment', kind: 'sampler' },
    { binding: 3, visibility: 'vertex-fragment', kind: 'tex' },
    { binding: 4, visibility: 'vertex-fragment', kind: 'tex' },
    { binding: 5, visibility: 'vertex-fragment', kind: 'sampler' },
    { binding: 6, visibility: 'vertex-fragment', kind: 'tex' },
    { binding: 7, visibility: 'vertex-fragment', kind: 'tex' },
  ],
  terrain: [
    { binding: 0, visibility: 'vertex-fragment', kind: 'uniform' },
    { binding: 1, visibility: 'vertex', kind: 'tex' },
    { binding: 2, visibility: 'vertex', kind: 'sampler' },
    { binding: 3, visibility: 'vertex', kind: 'storage-buffer' },
  ],
  horizon: [
    { binding: 0, visibility: 'vertex', kind: 'uniform' },
  ],
  cities: [
    { binding: 0, visibility: 'vertex', kind: 'storage-buffer' },
    { binding: 1, visibility: 'vertex', kind: 'tex' },
    { binding: 2, visibility: 'vertex', kind: 'sampler' },
    { binding: 3, visibility: 'vertex', kind: 'uniform' },
  ],
  map: [
    { binding: 0, visibility: 'vertex-fragment', kind: 'uniform' },
    { binding: 1, visibility: 'fragment', kind: 'tex' },
    { binding: 2, visibility: 'fragment', kind: 'sampler' },
    { binding: 3, visibility: 'fragment', kind: 'uniform' },
  ],
  // The slice samples surface + seabed in the vertex stage to build its silhouette.
  slice: [
    { binding: 0, visibility: 'vertex', kind: 'uniform' },
    { binding: 1, visibility: 'vertex-fragment', kind: 'tex' },
    { binding: 2, visibility: 'vertex-fragment', kind: 'sampler' },
    { binding: 3, visibility: 'vertex-fragment', kind: 'tex' },
    { binding: 4, visibility: 'vertex-fragment', kind: 'sampler' },
  ],
  post: [
    { binding: 0, visibility: 'fragment', kind: 'tex' },
    { binding: 1, visibility: 'fragment', kind: 'sampler' },
  ],
} as const satisfies Record<string, readonly LayoutEntrySpec[]>;

const stageFlag = (v: string) =>
  v === 'vertex' ? GPUShaderStage.VERTEX
  : v === 'fragment' ? GPUShaderStage.FRAGMENT
  : v === 'vertex-fragment' ? (GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT)
  : GPUShaderStage.COMPUTE;

export function createLayout(device: GPUDevice, label: string, specs: readonly LayoutEntrySpec[]): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    label,
    entries: specs.map((s) => {
      const base = { binding: s.binding, visibility: stageFlag(s.visibility) };
      switch (s.kind) {
        case 'uniform': return { ...base, buffer: { type: 'uniform' as const } };
        case 'storage-ro': return { ...base, buffer: { type: 'read-only-storage' as const } };
        case 'storage-rw': return { ...base, buffer: { type: 'storage' as const } };
        case 'sampler': return { ...base, sampler: { type: 'filtering' as const } };
        case 'tex': return { ...base, texture: { sampleType: (s.sampleType ?? 'float') as GPUTextureSampleType, viewDimension: '2d' as const } };
        case 'tex-array': return { ...base, texture: { sampleType: (s.sampleType ?? 'float') as GPUTextureSampleType, viewDimension: (s.viewDimension ?? '2d-array') as GPUTextureViewDimension } };
        case 'tex-storage-ro': return { ...base, storageTexture: { access: 'read-only' as const, format: 'rgba16float' as const } };
        case 'tex-storage-write': return { ...base, storageTexture: { access: 'write-only' as const, format: 'rgba16float' as const } };
        case 'storage-buffer': return { ...base, buffer: { type: 'read-only-storage' as const } };
      }
    }),
  });
}

export interface Pipelines {
  layouts: Record<keyof typeof LAYOUTS, GPUBindGroupLayout>;
  framePipelineLayout: GPUPipelineLayout;
  sky: GPURenderPipeline;
  post: GPURenderPipeline;
  ocean: GPURenderPipeline;
  terrain: GPURenderPipeline;
  horizon: GPURenderPipeline;
  cities: GPURenderPipeline;
  map: GPURenderPipeline;
  slice: GPURenderPipeline;
  spectrum: GPUComputePipeline;
  fft: GPUComputePipeline;
  resolve: GPUComputePipeline;
  sim: GPUComputePipeline;
  simSeed: GPUComputePipeline;
}

export interface PipelineTargets {
  /** Scene render target format. */
  hdrFormat: GPUTextureFormat;
  /** Canvas format (post pass). */
  canvasFormat: GPUTextureFormat;
  /** Depth format. */
  depthFormat: GPUTextureFormat;
  msaa: number;
}

export function createPipelines(
  device: GPUDevice,
  modules: Record<ShaderKey, GPUShaderModule>,
  targets: PipelineTargets,
): Pipelines {
  const layouts = {
    frame: createLayout(device, 'frame', LAYOUTS.frame),
    oceanSim: createLayout(device, 'ocean-sim', LAYOUTS.oceanSim),
    fft: createLayout(device, 'fft', LAYOUTS.fft),
    resolve: createLayout(device, 'resolve', LAYOUTS.resolve),
    simShallow: createLayout(device, 'sim-shallow', LAYOUTS.simShallow),
    oceanSurface: createLayout(device, 'ocean-surface', LAYOUTS.oceanSurface),
  } as Pipelines['layouts'];

  const framePipelineLayout = device.createPipelineLayout({ label: 'frame-pl', bindGroupLayouts: [layouts.frame] });

  const alphaBlend: GPUBlendState = {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  const depthState = (write: boolean, compare: GPUCompareFunction = 'less'): GPUDepthStencilState => ({
    format: targets.depthFormat, depthWriteEnabled: write, depthCompare: compare,
  });
  const ms = { count: targets.msaa };

  const sky = device.createRenderPipeline({
    label: 'sky',
    layout: framePipelineLayout,
    vertex: { module: modules.sky, entryPoint: 'vs' },
    fragment: { module: modules.sky, entryPoint: 'fs', targets: [{ format: targets.hdrFormat }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: targets.depthFormat, depthWriteEnabled: false, depthCompare: 'always' },
    multisample: ms,
  });

  const post = device.createRenderPipeline({
    label: 'post',
    layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.frame, layouts.post] }),
    vertex: { module: modules.post, entryPoint: 'vs' },
    fragment: { module: modules.post, entryPoint: 'fs', targets: [{ format: targets.canvasFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const ocean = device.createRenderPipeline({
    label: 'ocean',
    layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.frame, layouts.oceanSurface] }),
    vertex: { module: modules.oceanSurface, entryPoint: 'vs' },
    fragment: { module: modules.oceanSurface, entryPoint: 'fs', targets: [{ format: targets.hdrFormat, blend: alphaBlend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depthState(false, 'less-equal'),
    multisample: ms,
  });

  const terrainPl = device.createPipelineLayout({ bindGroupLayouts: [layouts.frame, layouts.terrain] });
  const terrain = device.createRenderPipeline({
    label: 'terrain',
    layout: terrainPl,
    vertex: { module: modules.terrain, entryPoint: 'vs' },
    fragment: { module: modules.terrain, entryPoint: 'fs', targets: [{ format: targets.hdrFormat }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depthState(true, 'less'),
    multisample: ms,
  });

  const horizon = device.createRenderPipeline({
    label: 'horizon',
    layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.frame, layouts.horizon] }),
    vertex: { module: modules.horizon, entryPoint: 'vs' },
    fragment: { module: modules.horizon, entryPoint: 'fs', targets: [{ format: targets.hdrFormat }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depthState(false, 'less-equal'),
    multisample: ms,
  });

  const cities = device.createRenderPipeline({
    label: 'cities',
    layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.frame, layouts.cities] }),
    vertex: { module: modules.cities, entryPoint: 'vs' },
    fragment: { module: modules.cities, entryPoint: 'fs', targets: [{ format: targets.hdrFormat, blend: alphaBlend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depthState(false, 'less-equal'),
    multisample: ms,
  });

  const map = device.createRenderPipeline({
    label: 'map',
    layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.frame, layouts.map] }),
    vertex: { module: modules.map, entryPoint: 'vs' },
    fragment: { module: modules.map, entryPoint: 'fs', targets: [{ format: targets.canvasFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const slice = device.createRenderPipeline({
    label: 'water-slice',
    layout: device.createPipelineLayout({ bindGroupLayouts: [layouts.frame, layouts.slice] }),
    vertex: { module: modules.waterColumn, entryPoint: 'vs' },
    fragment: { module: modules.waterColumn, entryPoint: 'fs', targets: [{ format: targets.hdrFormat, blend: alphaBlend }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: depthState(false, 'less-equal'),
    multisample: ms,
  });

  const compute = (label: string, pl: GPUPipelineLayout, module: GPUShaderModule, entryPoint: string) =>
    device.createComputePipeline({ label, layout: pl, compute: { module, entryPoint } });

  const spectrumPl = device.createPipelineLayout({ bindGroupLayouts: [layouts.oceanSim] });
  const fftPl = device.createPipelineLayout({ bindGroupLayouts: [layouts.fft] });
  const resolvePl = device.createPipelineLayout({ bindGroupLayouts: [layouts.resolve] });
  const simPl = device.createPipelineLayout({ bindGroupLayouts: [layouts.simShallow] });

  return {
    layouts, framePipelineLayout, sky, post, ocean, terrain, horizon, cities, map, slice,
    spectrum: compute('spectrum', spectrumPl, modules.oceanSim, 'main'),
    fft: compute('fft', fftPl, modules.oceanFft, 'main'),
    resolve: compute('resolve', resolvePl, modules.oceanResolve, 'main'),
    sim: compute('sim', simPl, modules.simShallow, 'step'),
    simSeed: compute('sim-seed', simPl, modules.simShallow, 'seed'),
  };
}
