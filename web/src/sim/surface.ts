/**
 * The 2.5D surface bookkeeping: bathymetry bake, accumulator clearing, particle splatting and the
 * resolve that turns integer atomics into the filterable height fields.
 *
 * Why this exists at all: the particle passes have a data-dependent cost (a million particles one
 * frame, nine hundred thousand the next) while the renderer and the coupling layers need a
 * fixed-size field with a stable cost. Resolving through a texture every frame is what keeps frame
 * time flat, and it is what lets the mesh, the 3D layer and gameplay code all ask the same question
 * ("how high is the water here?") and get the same answer.
 */

import { createKernel, storageBuffer, type ComputeKernel } from '@/core/gpu';
import { shader } from './shaders';
import { buf, groups, samp, sbuf, sps, storageTex, stex, tex } from './layout';

export interface SurfaceOptions {
  nearRes: number;
  farRes: number;
}

const ACCUM_CHANNELS = 4;

export class Surface {
  readonly bedTexture: GPUTexture;
  readonly bedSampler: GPUSampler;
  readonly nearField: GPUTexture;
  readonly farField: GPUTexture;
  readonly nearAccum: GPUBuffer;
  readonly farAccum: GPUBuffer;
  readonly farCount: GPUBuffer;
  readonly nearRes: number;
  readonly farRes: number;

  private readonly bake: ComputeKernel;
  private readonly clearNearK: ComputeKernel;
  private readonly clearFarK: ComputeKernel;
  private readonly splatSweK: ComputeKernel;
  private readonly splatCoarseK: ComputeKernel;
  private readonly resolveNearK: ComputeKernel;
  private readonly resolveFarK: ComputeKernel;

  private readonly bgBake: GPUBindGroup;
  private readonly bgResolveNear: GPUBindGroup;
  private readonly bgResolveFar: GPUBindGroup;
  /** Bind groups are cached per particle buffer: the layers ping-pong, so there are two each. */
  private readonly fineGroups = new Map<GPUBuffer, GPUBindGroup>();
  private readonly coarseGroups = new Map<GPUBuffer, GPUBindGroup>();

  constructor(
    device: GPUDevice,
    paramsLayout: GPUBindGroupLayout,
    opts: SurfaceOptions,
    bed: { texture: GPUTexture; sampler: GPUSampler },
  ) {
    this.nearRes = opts.nearRes;
    this.farRes = opts.farRes;
    this.bedTexture = bed.texture;
    this.bedSampler = bed.sampler;
    this.nearField = device.createTexture({
      label: 'near-height',
      size: [opts.nearRes, opts.nearRes],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.farField = device.createTexture({
      label: 'far-height',
      size: [opts.farRes, opts.farRes],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.nearAccum = storageBuffer(device, 'near-accum', opts.nearRes * opts.nearRes * ACCUM_CHANNELS * 4);
    this.farAccum = storageBuffer(device, 'far-accum', opts.farRes * opts.farRes * ACCUM_CHANNELS * 4);
    this.farCount = storageBuffer(device, 'far-count', opts.farRes * opts.farRes * 4);

    this.bake = createKernel(device, paramsLayout, {
      label: 'bed.bake',
      code: shader('common/bed_bake.wgsl'),
      entryPoint: 'main',
      bindings: [storageTex(0, 'rgba16float', 'write-only')],
    });
    this.bgBake = this.bake.group([stex(0, this.bedTexture)]);

    const splat = shader('swe/swe_splat.wgsl');
    const splatCoarse = shader('swe/swe_splat.wgsl', { SWE_COARSE: 1 });
    const splatLayoutFine = [buf(0, 'read-only-storage'), buf(2), tex(8), samp(9)];
    const splatLayoutCoarse = [buf(0, 'read-only-storage'), buf(2), buf(3), tex(8), samp(9)];
    this.clearNearK = createKernel(device, paramsLayout, { label: 'swe.splat.clearNear', code: splat, entryPoint: 'clearNear', bindings: splatLayoutFine });
    this.splatSweK = createKernel(device, paramsLayout, { label: 'swe.splat.splatSwe', code: splat, entryPoint: 'splatSwe', bindings: splatLayoutFine });
    this.clearFarK = createKernel(device, paramsLayout, { label: 'csw.splat.clearFar', code: splatCoarse, entryPoint: 'clearNear', bindings: splatLayoutCoarse });
    this.splatCoarseK = createKernel(device, paramsLayout, { label: 'csw.splat.splatCoarse', code: splatCoarse, entryPoint: 'splatCoarse', bindings: splatLayoutCoarse });

    // The two resolves share the source but not the layout: the near resolve *writes* the near field
    // (a write-only storage texture), the far resolve *reads* it as a sampled texture. That split is
    // what avoids a read-write storage texture, the least portable storage-texture access mode.
    const resolveNearCode = shader('swe/surface_resolve.wgsl');
    const resolveFarCode = shader('swe/surface_resolve.wgsl', { RESOLVE_FAR: 1 });
    const accumulators = [buf(0, 'read-only-storage'), buf(1, 'read-only-storage'), buf(2, 'read-only-storage')];
    const bedBinding = [tex(8), samp(9)];
    this.resolveNearK = createKernel(device, paramsLayout, {
      label: 'surface.resolveNear',
      code: resolveNearCode,
      entryPoint: 'resolveNear',
      bindings: [...accumulators, storageTex(3, 'rgba16float', 'write-only'), ...bedBinding],
    });
    this.resolveFarK = createKernel(device, paramsLayout, {
      label: 'surface.resolveFar',
      code: resolveFarCode,
      entryPoint: 'resolveFar',
      bindings: [...accumulators, tex(3), storageTex(4, 'rgba16float', 'write-only'), ...bedBinding],
    });
    const accumBindings = [
      sbuf(0, this.nearAccum),
      sbuf(1, this.farAccum),
      sbuf(2, this.farCount),
      stex(8, bed.texture),
      sps(9, bed.sampler),
    ];
    this.bgResolveNear = this.resolveNearK.group([...accumBindings, stex(3, this.nearField)]);
    this.bgResolveFar = this.resolveFarK.group([...accumBindings, stex(3, this.nearField), stex(4, this.farField)]);
  }

  private fineGroup(particles: GPUBuffer): GPUBindGroup {
    let g = this.fineGroups.get(particles);
    if (!g) {
      g = this.clearNearK.group([sbuf(0, particles), sbuf(2, this.nearAccum), stex(8, this.bedTexture), sps(9, this.bedSampler)]);
      this.fineGroups.set(particles, g);
    }
    return g;
  }

  private coarseGroup(particles: GPUBuffer): GPUBindGroup {
    let g = this.coarseGroups.get(particles);
    if (!g) {
      g = this.clearFarK.group([
        sbuf(0, particles),
        sbuf(2, this.farAccum),
        sbuf(3, this.farCount),
        stex(8, this.bedTexture),
        sps(9, this.bedSampler),
      ]);
      this.coarseGroups.set(particles, g);
    }
    return g;
  }

  /** Bake the procedural bathymetry. Needed only when the bathymetry domain changes. */
  bakeBed(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    const w = this.bedTexture.width;
    const h = this.bedTexture.height;
    this.bake.pass(encoder, params, this.bgBake).dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
  }

  clearNear(encoder: GPUCommandEncoder, params: GPUBindGroup, particles: GPUBuffer): void {
    this.clearNearK
      .pass(encoder, params, this.fineGroup(particles))
      .dispatchWorkgroups(groups(this.nearRes * this.nearRes * ACCUM_CHANNELS, 256));
  }

  splatFine(encoder: GPUCommandEncoder, params: GPUBindGroup, particles: GPUBuffer, count: number): void {
    this.splatSweK.pass(encoder, params, this.fineGroup(particles)).dispatchWorkgroups(groups(count, 64));
  }

  /** Coarse layer -> far field (biased elevation + weighted count). */
  splatCoarse(encoder: GPUCommandEncoder, params: GPUBindGroup, particles: GPUBuffer, count: number): void {
    const slots = this.farRes * this.farRes * ACCUM_CHANNELS;
    const cells = this.farRes * this.farRes;
    this.clearFarK
      .pass(encoder, params, this.coarseGroup(particles))
      .dispatchWorkgroups(groups(Math.max(slots, cells), 256));
    this.splatCoarseK.pass(encoder, params, this.coarseGroup(particles)).dispatchWorkgroups(groups(count, 64));
  }

  resolveNear(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    const n = Math.ceil(this.nearRes / 8);
    this.resolveNearK.pass(encoder, params, this.bgResolveNear).dispatchWorkgroups(n, n);
  }

  resolveFar(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    const n = Math.ceil(this.farRes / 8);
    this.resolveFarK.pass(encoder, params, this.bgResolveFar).dispatchWorkgroups(n, n);
  }
}
