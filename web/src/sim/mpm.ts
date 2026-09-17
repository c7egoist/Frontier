/**
 * Near-field MLS/APIC material point method: the layer that splashes.
 *
 * MPM is here because it needs no neighbour search (the grid *is* the acceleration structure), gets
 * a free surface with no surface tracking, and can represent overturning crests and trailing
 * sheets -- the things a height field provably cannot. It covers only a thin camera-following band,
 * because the bulk of the ocean is the 2D shallow-water layer: that split is the whole reason this
 * runs at 60 fps on a mid-range GPU.
 *
 * Both halves of the mass cycle live here and in swe.ts: breaking crests of the shallow-water layer
 * push particles in through the spawn queue (see swe/swe_spawn.wgsl), and water absorbed at the box
 * boundary is handed back to the shallow-water layer through `deposit`, which `swe_step` consumes.
 */

import { createKernel, storageBuffer, type ComputeKernel } from '@/core/gpu';
import { shader } from './shaders';
import { buf, groups, samp, sbuf, sps, stex, tex } from './layout';

export const MPM_PARTICLE_BYTES = 128; // vec4 pos + vec4 vel + mat3x3 C + mat3x3 F
export const MPM_AUX_SLOTS = 8 + 4096 * 4;

export interface MpmLayerConfig {
  maxParticles: number;
  grid: [number, number, number];
  label?: string;
}

export class MpmLayer {
  readonly particles: GPUBuffer;
  readonly gridP: GPUBuffer;
  readonly gridV: GPUBuffer;
  readonly aux: GPUBuffer;
  readonly cells: number;

  private readonly clearK: ComputeKernel;
  private readonly p2gK: ComputeKernel;
  private readonly gridK: ComputeKernel;
  private readonly g2pK: ComputeKernel;
  private readonly spawnK: ComputeKernel;
  private readonly bg: GPUBindGroup;

  constructor(
    device: GPUDevice,
    paramsLayout: GPUBindGroupLayout,
    cfg: MpmLayerConfig,
    link: {
      deposit: GPUBuffer;
      sweCell: GPUBuffer;
      sweIndex: GPUBuffer;
      bed: { texture: GPUTexture; sampler: GPUSampler };
      nearHeight: GPUTexture;
    },
  ) {
    const label = cfg.label ?? 'mpm';
    this.cells = cfg.grid[0] * cfg.grid[1] * cfg.grid[2];
    this.particles = storageBuffer(device, `${label}-particles`, cfg.maxParticles * MPM_PARTICLE_BYTES);
    this.gridP = storageBuffer(device, `${label}-gridP`, this.cells * 8);
    this.gridV = storageBuffer(device, `${label}-gridV`, this.cells * 16);
    this.aux = storageBuffer(device, `${label}-aux`, MPM_AUX_SLOTS * 4);

    const code = shader('mpm/mpm.wgsl');
    const layout = [
      buf(0),
      buf(1),
      buf(2),
      buf(3),
      buf(4),
      buf(5, 'read-only-storage'),
      buf(6, 'read-only-storage'),
      tex(8),
      samp(9),
      tex(10),
    ];
    this.clearK = createKernel(device, paramsLayout, { label: `${label}.clear`, code, entryPoint: 'clear', bindings: layout });
    this.p2gK = createKernel(device, paramsLayout, { label: `${label}.p2g`, code, entryPoint: 'p2g', bindings: layout });
    this.gridK = createKernel(device, paramsLayout, { label: `${label}.gridUpdate`, code, entryPoint: 'gridUpdate', bindings: layout });
    this.g2pK = createKernel(device, paramsLayout, { label: `${label}.g2p`, code, entryPoint: 'g2p', bindings: layout });
    this.spawnK = createKernel(device, paramsLayout, { label: `${label}.spawn`, code, entryPoint: 'spawn', bindings: layout });
    this.bg = this.clearK.group([
      sbuf(0, this.particles),
      sbuf(1, this.gridP),
      sbuf(2, this.gridV),
      sbuf(3, this.aux),
      sbuf(4, link.deposit),
      sbuf(5, link.sweCell),
      sbuf(6, link.sweIndex),
      stex(8, link.bed.texture),
      sps(9, link.bed.sampler),
      stex(10, link.nearHeight),
    ]);
  }

  /** One substep: transfer, grid update, gather, then refill dead slots from the spawn queue. */
  update(encoder: GPUCommandEncoder, params: GPUBindGroup, maxParticles: number, spawn = true): void {
    const cells = this.cells;
    const p2gGroups = groups(maxParticles, 64);
    this.clearK.pass(encoder, params, this.bg).dispatchWorkgroups(groups(cells, 256));
    this.p2gK.pass(encoder, params, this.bg).dispatchWorkgroups(p2gGroups);
    this.gridK.pass(encoder, params, this.bg).dispatchWorkgroups(groups(cells, 256));
    this.g2pK.pass(encoder, params, this.bg).dispatchWorkgroups(p2gGroups);
    if (spawn) this.spawnK.pass(encoder, params, this.bg).dispatchWorkgroups(p2gGroups);
  }
}
