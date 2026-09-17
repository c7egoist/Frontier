/**
 * The shallow-water particle layer (2D, the bulk of the ocean).
 *
 * One update = rebuild the uniform grid (clear -> count -> scan -> scatter), then integrate. The
 * grid exists so that each particle visits ~13 neighbours instead of every other particle: at
 * 262k particles that is the difference between 68 billion and 3.4 million pair evaluations per
 * substep.
 *
 * The same class drives both nesting levels: the fine camera-scale layer (no defines) and the
 * coarse swell layer (SWE_COARSE), where every uniform accessor goes through `swe_layer.wgsl`. So
 * there is exactly one solver implementation for both.
 */

import { createKernel, storageBuffer, type ComputeKernel } from '@/core/gpu';
import { shader, type ShaderDefines } from './shaders';
import { buf, groups, samp, sbuf, sps, stex, tex } from './layout';

export interface SweLayerConfig {
  count: number;
  gridW: number;
  gridH: number;
  coarse?: boolean;
  label: string;
}

const PARTICLE_BYTES = 32; // posH + velV
const HASH_WG = 256;
const STEP_WG = 64;
const SCAN_BLOCK = 256;

export class SweLayer {
  readonly label: string;
  readonly coarse: boolean;
  readonly count: number;
  readonly cells: number;
  readonly blocks: number;

  readonly particlesA: GPUBuffer;
  readonly particlesB: GPUBuffer;
  readonly cellCount: GPUBuffer;
  readonly cursor: GPUBuffer;
  readonly blockSums: GPUBuffer;
  readonly blockOffset: GPUBuffer;
  readonly cellStart: GPUBuffer;
  readonly particleIndex: GPUBuffer;
  readonly deposit: GPUBuffer;

  private readonly clearK: ComputeKernel;
  private readonly countK: ComputeKernel;
  private readonly scatterK: ComputeKernel;
  private readonly scanBlocksK: ComputeKernel;
  private readonly scanTopK: ComputeKernel;
  private readonly scanAddK: ComputeKernel;
  private readonly stepK: ComputeKernel;

  private readonly bgHashA: GPUBindGroup;
  private readonly bgHashB: GPUBindGroup;
  private readonly bgScan: GPUBindGroup;
  private readonly bgStepAB: GPUBindGroup;
  private readonly bgStepBA: GPUBindGroup;

  private flipped = false;
  private substep = 0;

  constructor(
    device: GPUDevice,
    paramsLayout: GPUBindGroupLayout,
    cfg: SweLayerConfig,
    bed: { texture: GPUTexture; sampler: GPUSampler },
  ) {
    this.label = cfg.label;
    this.coarse = cfg.coarse ?? false;
    this.count = cfg.count;
    this.cells = cfg.gridW * cfg.gridH;
    this.blocks = Math.ceil(this.cells / (SCAN_BLOCK * 2));

    const defines: ShaderDefines = this.coarse ? { SWE_COARSE: 1 } : {};
    const n = cfg.label;
    this.particlesA = storageBuffer(device, `${n}-particlesA`, this.count * PARTICLE_BYTES);
    this.particlesB = storageBuffer(device, `${n}-particlesB`, this.count * PARTICLE_BYTES);
    this.cellCount = storageBuffer(device, `${n}-cellCount`, this.cells * 4);
    this.cursor = storageBuffer(device, `${n}-cursor`, this.cells * 4);
    this.blockSums = storageBuffer(device, `${n}-blockSums`, this.blocks * 4);
    this.blockOffset = storageBuffer(device, `${n}-blockOffset`, (this.blocks + 1) * 4);
    this.cellStart = storageBuffer(device, `${n}-cellStart`, (this.cells + 1) * 4);
    this.particleIndex = storageBuffer(device, `${n}-particleIndex`, this.count * 4);
    this.deposit = storageBuffer(device, `${n}-deposit`, this.count * 4);

    const hash = shader('swe/swe_hash.wgsl', defines);
    const scan = shader('swe/swe_scan.wgsl', defines);
    const step = shader('swe/swe_step.wgsl', defines);

    const hashLayout = [buf(0, 'read-only-storage'), buf(1), buf(2), buf(3)];
    const scanLayout = [buf(0), buf(1), buf(2), buf(3), buf(4)];
    this.clearK = createKernel(device, paramsLayout, { label: `${n}.hash.clear`, code: hash, entryPoint: 'clear', bindings: hashLayout });
    this.countK = createKernel(device, paramsLayout, { label: `${n}.hash.count`, code: hash, entryPoint: 'count', bindings: hashLayout });
    this.scatterK = createKernel(device, paramsLayout, { label: `${n}.hash.scatter`, code: hash, entryPoint: 'scatter', bindings: hashLayout });
    this.scanBlocksK = createKernel(device, paramsLayout, { label: `${n}.scan.blocks`, code: scan, entryPoint: 'scanBlocks', bindings: scanLayout });
    this.scanTopK = createKernel(device, paramsLayout, { label: `${n}.scan.top`, code: scan, entryPoint: 'scanTop', bindings: scanLayout });
    this.scanAddK = createKernel(device, paramsLayout, { label: `${n}.scan.add`, code: scan, entryPoint: 'scanAdd', bindings: scanLayout });
    this.stepK = createKernel(device, paramsLayout, {
      label: `${n}.step`,
      code: step,
      entryPoint: 'main',
      bindings: [buf(0, 'read-only-storage'), buf(1), buf(2, 'read-only-storage'), buf(3, 'read-only-storage'), buf(4), tex(8), samp(9)],
    });

    const hashBinds = (particles: GPUBuffer): GPUBindGroupEntry[] => [
      sbuf(0, particles),
      sbuf(1, this.cellCount),
      sbuf(2, this.cursor),
      sbuf(3, this.particleIndex),
    ];
    this.bgHashA = this.clearK.group(hashBinds(this.particlesA));
    this.bgHashB = this.clearK.group(hashBinds(this.particlesB));
    this.bgScan = this.scanBlocksK.group([
      sbuf(0, this.cellCount),
      sbuf(1, this.blockSums),
      sbuf(2, this.blockOffset),
      sbuf(3, this.cellStart),
      sbuf(4, this.cursor),
    ]);
    const stepBinds = (from: GPUBuffer, to: GPUBuffer): GPUBindGroupEntry[] => [
      sbuf(0, from),
      sbuf(1, to),
      sbuf(2, this.cellStart),
      sbuf(3, this.particleIndex),
      sbuf(4, this.deposit),
      stex(8, bed.texture),
      sps(9, bed.sampler),
    ];
    this.bgStepAB = this.stepK.group(stepBinds(this.particlesA, this.particlesB));
    this.bgStepBA = this.stepK.group(stepBinds(this.particlesB, this.particlesA));
  }

  /** The particle buffer the current state lives in (read side of the ping-pong). */
  get read(): GPUBuffer {
    return this.flipped ? this.particlesB : this.particlesA;
  }

  private get stepGroup(): GPUBindGroup {
    return this.flipped ? this.bgStepBA : this.bgStepAB;
  }

  private get hashGroup(): GPUBindGroup {
    return this.flipped ? this.bgHashB : this.bgHashA;
  }

  /** Uniform-grid rebuild: O(n) with one atomic per particle. */
  private find(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    this.clearK.pass(encoder, params, this.hashGroup).dispatchWorkgroups(groups(this.cells, HASH_WG));
    this.countK.pass(encoder, params, this.hashGroup).dispatchWorkgroups(groups(this.count, HASH_WG));
    this.scanBlocksK.pass(encoder, params, this.bgScan).dispatchWorkgroups(this.blocks);
    this.scanTopK.pass(encoder, params, this.bgScan).dispatchWorkgroups(1);
    this.scanAddK.pass(encoder, params, this.bgScan).dispatchWorkgroups(this.blocks);
    this.scatterK.pass(encoder, params, this.hashGroup).dispatchWorkgroups(groups(this.count, HASH_WG));
  }

  /**
   * Advances the layer by one substep. The neighbour lists are rebuilt every `findInterval` steps:
   * particles travel far less than one cell per frame, so the stale grid is still a superset of the
   * true neighbours of every particle, which the solver tolerates.
   */
  update(encoder: GPUCommandEncoder, params: GPUBindGroup, findInterval = 4): void {
    if (this.substep % findInterval === 0) this.find(encoder, params);
    this.stepK.pass(encoder, params, this.stepGroup, `${this.label}.step`).dispatchWorkgroups(groups(this.count, STEP_WG));
    this.flipped = !this.flipped;
    this.substep++;
  }

  get substeps(): number {
    return this.substep;
  }
}
