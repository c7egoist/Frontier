/**
 * Far-field swell as wave particles (Yuksel, House & Keyser 2007): localised radial wave packets,
 * no FFT anywhere in the project.
 *
 * A packet carries an amplitude, a wavenumber, a phase and a direction, so the surface is a sum of
 * bounded footprints: cost is O(particles x footprint), each packet obeys the *depth-dependent*
 * dispersion relation (so it slows down, steepens and breaks over shoals -- something an FFT ocean
 * cannot express), and the whole field is analytically band-limited, which means it cannot alias
 * however far the camera looks.
 */

import { createKernel, storageBuffer, uploadArray, type ComputeKernel } from '@/core/gpu';
import { shader } from './shaders';
import { buf, groups, samp, sbuf, sps, stex, tex } from './layout';

export const WAVE_PARTICLE_BYTES = 40; // vec2 pos, vec2 dir, 6 f32

export interface WaveLayerConfig {
  count: number;
  /** half extent of the camera-following packet domain (m) */
  domain: number;
  seed: number;
}

const WG = 64;

export class WaveLayer {
  readonly particles: GPUBuffer;
  readonly count: number;
  readonly domain: number;

  private readonly updateK: ComputeKernel;
  private readonly splatK: ComputeKernel;
  private readonly clearK: ComputeKernel;
  private readonly bgUpdate: GPUBindGroup;
  private readonly bgSplat: GPUBindGroup;
  private readonly groupFar: GPUBindGroup;

  constructor(
    device: GPUDevice,
    paramsLayout: GPUBindGroupLayout,
    cfg: WaveLayerConfig,
    target: { farAccum: GPUBuffer; farCount: GPUBuffer },
    bed: { texture: GPUTexture; sampler: GPUSampler },
  ) {
    this.count = cfg.count;
    this.domain = cfg.domain;
    this.particles = storageBuffer(device, 'wave-particles', cfg.count * WAVE_PARTICLE_BYTES);

    const code = shader('wave/wave.wgsl');
    const layout = [buf(0), buf(2), buf(3), tex(8), samp(9)];
    this.updateK = createKernel(device, paramsLayout, { label: 'wave.update', code, entryPoint: 'update', bindings: layout });
    this.splatK = createKernel(device, paramsLayout, { label: 'wave.splat', code, entryPoint: 'splat', bindings: layout });
    this.clearK = createKernel(device, paramsLayout, { label: 'wave.clearFar', code, entryPoint: 'clearFar', bindings: layout });
    const common: GPUBindGroupEntry[] = [
      sbuf(0, this.particles),
      sbuf(2, target.farAccum),
      sbuf(3, target.farCount),
      stex(8, bed.texture),
      sps(9, bed.sampler),
    ];
    this.bgUpdate = this.updateK.group(common);
    this.bgSplat = this.splatK.group(common);
    this.groupFar = this.bgUpdate;
  }

  /**
   * Seeds the field with a JONSWAP-ish spectrum: wavelengths spread over [40, 300] m and a narrow,
   * wind-aligned direction spread. Built on the CPU so it is reproducible; after that the packets
   * are advected -- and re-seeded when they wrap -- entirely on the GPU.
   */
  uploadSeed(device: GPUDevice): void {
    const data = new Float32Array(this.count * (WAVE_PARTICLE_BYTES / 4));
    let s = 1234567;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < this.count; i++) {
      const q = i * (WAVE_PARTICLE_BYTES / 4);
      const amp = 0.35 + 1.15 * Math.pow(rnd(), 1.6);
      const wavelength = 40 + 260 * Math.pow(rnd(), 2.2);
      const angle = (rnd() - 0.5) * 0.7;
      data[q + 0] = (rnd() - 0.5) * 2 * this.domain;
      data[q + 1] = (rnd() - 0.5) * 2 * this.domain;
      data[q + 2] = Math.sin(angle);
      data[q + 3] = Math.cos(angle);
      data[q + 4] = amp;
      data[q + 5] = (2 * Math.PI) / wavelength;
      data[q + 6] = rnd() * Math.PI * 2;
      data[q + 7] = wavelength;
      data[q + 8] = 0;
      data[q + 9] = rnd();
    }
    uploadArray(device, this.particles, data);
  }

  /** Zeroes the far-field accumulators (both the packet sum and the coarse layer write there). */
  clearFar(encoder: GPUCommandEncoder, params: GPUBindGroup, farRes: number): void {
    const slots = farRes * farRes * 4;
    this.clearK.pass(encoder, params, this.bgUpdate).dispatchWorkgroups(groups(slots, 256));
  }

  update(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    this.updateK.pass(encoder, params, this.bgUpdate).dispatchWorkgroups(groups(this.count, WG));
  }

  splat(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    this.splatK.pass(encoder, params, this.bgSplat).dispatchWorkgroups(groups(this.count, WG));
  }

  get group(): GPUBindGroup {
    return this.groupFar;
  }
}
