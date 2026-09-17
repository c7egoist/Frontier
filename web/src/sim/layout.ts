/**
 * Bind-group-layout shorthands. Every compute pass in this project binds the same group(0)
 * (the Globals uniform) and declares its own group(1), so the index of a binding here is the `n`
 * in the shader's `@group(1) @binding(n)` -- and that is the one thing that must never drift.
 */

export const COMPUTE = GPUShaderStage.COMPUTE;

export function buf(binding: number, type: GPUBufferBindingType = 'storage'): GPUBindGroupLayoutEntry {
  return { binding, visibility: COMPUTE, buffer: { type } };
}

export function uni(binding: number): GPUBindGroupLayoutEntry {
  return { binding, visibility: COMPUTE, buffer: { type: 'uniform' } };
}

/** Sampled texture. `rgba16float` is filterable, so 'float' + a filtering sampler is the norm. */
export function tex(binding: number, sampleType: GPUTextureSampleType = 'float'): GPUBindGroupLayoutEntry {
  return { binding, visibility: COMPUTE, texture: { sampleType, viewDimension: '2d' } };
}

export function storageTex(
  binding: number,
  format: GPUTextureFormat,
  access: GPUStorageTextureAccess = 'write-only',
): GPUBindGroupLayoutEntry {
  return { binding, visibility: COMPUTE, storageTexture: { access, format, viewDimension: '2d' } };
}

export function samp(binding: number, type: GPUSamplerBindingType = 'filtering'): GPUBindGroupLayoutEntry {
  return { binding, visibility: COMPUTE, sampler: { type } };
}

// --- bind group entries ------------------------------------------------------

export function sbuf(binding: number, buffer: GPUBuffer): GPUBindGroupEntry {
  return { binding, resource: { buffer } };
}

export function stex(binding: number, texture: GPUTexture): GPUBindGroupEntry {
  return { binding, resource: texture.createView({ dimension: '2d' }) };
}

export function sps(binding: number, sampler: GPUSampler): GPUBindGroupEntry {
  return { binding, resource: sampler };
}

/** A non-filtering sampler: for fields that are storage textures elsewhere in the frame. */
export function makeSamplers(device: GPUDevice) {
  return {
    linear: device.createSampler({ label: 'linear', magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
    nearest: device.createSampler({ label: 'nearest', magFilter: 'nearest', minFilter: 'nearest', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
    repeat: device.createSampler({ label: 'repeat', magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' }),
  };
}

export type Samplers = ReturnType<typeof makeSamplers>;

/** ceil(n / size), the dispatch size for a 1D pass. */
export function groups(n: number, size: number): number {
  return Math.max(1, Math.ceil(n / size));
}
