/**
 * Simulation facade: owns every layer, writes the parameter block and drives the frame.
 *
 * The frame is split into two submissions on purpose. `simulate()` runs the shallow-water layers and
 * the swell field with `simDt = frameDt / sweSubsteps`; the uniform is then rewritten with
 * `simDt = frameDt / mpmSubsteps` for the 3D layer, which needs a much smaller step because it
 * resolves pressure waves rather than advecting a height field. One parameter buffer plus two
 * submissions gives each layer its own timestep without a second buffer, bind group or schema.
 *
 * Layer order, and the dependency that forces it:
 *   1. coarse SWE + coarse splat    -- the mid-field the fine layer reads at its boundary
 *   2. far resolve                  -- so the fine layer's sponge has fresh outside data
 *   3. fine SWE (+ crest spawn)     -- the detailed bulk of the visible ocean
 *   4. near resolve                 -- what the mesh and the 3D layer sample
 *   5. MPM                          -- splashes; absorbs back into the fine layer's `deposit`
 *   6. render                       -- sky, mesh, screen-space fluid, post
 */

import { GLOBALS, bedDepthAt, type DerivedConfig, type OceanPreset } from '@/core/params';
import { createKernel, uploadArray, type ComputeKernel } from '@/core/gpu';
import { setField, type UniformWriter } from '@/common/uniform';
import { shader } from './shaders';
import { buf, groups, sbuf } from './layout';
import { MpmLayer } from './mpm';
import { Surface } from './surface';
import { SweLayer } from './swe';
import { WaveLayer } from './wave';

export interface SimState {
  time: number;
  dt: number;
  frame: number;
  cameraPos: [number, number, number];
  cameraUnderwater: boolean;
  viewProj: Float32Array;
  invViewProj: Float32Array;
  view: Float32Array;
  invView: Float32Array;
  projScaleY: number;
  nearPlane: number;
  farPlane: number;
  pointer: { pos: [number, number]; prev: [number, number]; active: boolean; force: number; radius: number; mode: number };
}

export class OceanSim {
  readonly cfg: DerivedConfig;
  readonly preset: OceanPreset;
  readonly surface: Surface;
  readonly fine: SweLayer;
  readonly coarse: SweLayer | null;
  readonly wave: WaveLayer;
  readonly mpm: MpmLayer;
  readonly bedTexture: GPUTexture;
  /** Mutable uniform values, shared with the app (presets/debug views write into this). */
  readonly values: Record<string, number | readonly number[]>;

  private readonly bedSampler: GPUSampler;
  private readonly spawnK: ComputeKernel;
  private readonly spawnGroups = new Map<GPUBuffer, GPUBindGroup>();
  private coarseClock = 0;
  private centers: { fine: [number, number]; coarse: [number, number] };

  constructor(
    device: GPUDevice,
    paramsLayout: GPUBindGroupLayout,
    preset: OceanPreset,
    cfg: DerivedConfig,
    params: Record<string, number | readonly number[]>,
  ) {
    this.preset = preset;
    this.cfg = cfg;
    this.values = params;
    this.bedSampler = device.createSampler({
      label: 'bed-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.bedTexture = device.createTexture({
      label: 'bed-depth',
      size: [cfg.bedRes, cfg.bedRes],
      format: 'r16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const bed = { texture: this.bedTexture, sampler: this.bedSampler };
    this.surface = new Surface(device, paramsLayout, { nearRes: cfg.nearRes, farRes: cfg.farRes }, bed);
    this.fine = new SweLayer(device, paramsLayout, { label: 'swe', count: cfg.swe.count, gridW: cfg.swe.gridW, gridH: cfg.swe.gridH }, bed);
    this.coarse =
      cfg.coarse.count > 0
        ? new SweLayer(
            device,
            paramsLayout,
            { label: 'csw', count: cfg.coarse.count, gridW: cfg.coarse.gridSize, gridH: cfg.coarse.gridSize, coarse: true },
            bed,
          )
        : null;
    this.wave = new WaveLayer(
      device,
      paramsLayout,
      { count: cfg.wave.count, domain: preset.waveDomain, seed: preset.waveDomain },
      { farAccum: this.surface.farAccum, farCount: this.surface.farCount },
      bed,
    );
    this.mpm = new MpmLayer(
      device,
      paramsLayout,
      { maxParticles: cfg.mpm.maxParticles, grid: cfg.mpm.grid },
      {
        deposit: this.fine.deposit,
        sweCell: this.fine.cellStart,
        sweIndex: this.fine.particleIndex,
        bed,
        nearHeight: this.surface.nearField,
      },
    );

    // Breaking crests of the fine layer feed the 3D layer's spawn queue (mpm `aux`).
    this.spawnK = createKernel(device, paramsLayout, {
      label: 'swe.spawn',
      code: shader('swe/swe_spawn.wgsl'),
      entryPoint: 'spawnFromCrests',
      bindings: [buf(0, 'read-only-storage'), buf(1)],
    });

    this.centers = { fine: [0, 0], coarse: [0, 0] };
  }

  /** Bakes the bathymetry and seeds every layer. Run once, before the first frame. */
  initialize(device: GPUDevice, params: GPUBindGroup, encoder: GPUCommandEncoder): void {
    this.surface.bakeBed(encoder, params);
    this.seedFine(device);
    this.seedCoarse(device);
    this.wave.uploadSeed(device);
  }

  /**
   * Still-water initial state: V = dx^2 * h(x), which the derivation shows is a fixed point over a
   * sloping bed, plus the analytic seed wave so the first frame is not glass. The displacement is
   * applied to the column *volume*, so mass is still exactly dx^2*h everywhere.
   */
  private seedFine(device: GPUDevice): void {
    const { count, gridW, gridH, dx } = this.cfg.swe;
    const [ox, oz] = this.centers.fine;
    const amp = Number(this.values.sweInitAmp ?? 0);
    const lambda = Math.max(8, Number(this.values.sweInitWavelength ?? 60));
    const k = (2 * Math.PI) / lambda;
    const data = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const ix = i % gridW;
      const iy = (i / gridW) | 0;
      const x = ox + (ix + 0.5) * dx;
      const z = oz + (iy + 0.5) * dx;
      const h = Math.max(this.depthAt(x, z) + amp * Math.sin(k * x + 0.6 * k * z), 0.05);
      const q = i * 8;
      data[q + 0] = x;
      data[q + 1] = z;
      data[q + 2] = h;
      data[q + 3] = 0; // whitecap metric
      data[q + 4] = 0; // vx
      data[q + 5] = 0; // vz
      data[q + 6] = dx * dx * h; // column volume: the conserved quantity
      data[q + 7] = 0; // eta, rebuilt by the solver each step
    }
    void gridH;
    uploadArray(device, this.fine.particlesA, data);
  }

  private seedCoarse(device: GPUDevice): void {
    if (!this.coarse) return;
    const { count, gridSize, dx } = this.cfg.coarse;
    const [ox, oz] = this.centers.coarse;
    const data = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const ix = i % gridSize;
      const iy = (i / gridSize) | 0;
      const x = ox + (ix + 0.5) * dx;
      const z = oz + (iy + 0.5) * dx;
      const h = Math.max(this.depthAt(x, z), 0.05);
      const q = i * 8;
      data[q + 0] = x;
      data[q + 1] = z;
      data[q + 2] = h;
      data[q + 6] = dx * dx * h;
    }
    uploadArray(device, this.coarse.particlesA, data);
  }

  /**
   * Re-centres the (fixed) lattices on the camera, in whole-cell jumps. Particles that end up
   * outside wrap around on the next step and re-localise their column volume to the local depth, so
   * the jump costs one frame of local mass error instead of a hard reset.
   */
  recenter(cameraXZ: [number, number]): void {
    const jump = this.cfg.swe.radius * 0.5;
    const shift = (centre: [number, number]): [number, number] => {
      const dx = cameraXZ[0] - centre[0];
      const dz = cameraXZ[1] - centre[1];
      if (Math.abs(dx) < jump && Math.abs(dz) < jump) return centre;
      return [centre[0] + Math.round(dx / jump) * jump, centre[1] + Math.round(dz / jump) * jump];
    };
    const fine = shift(this.centers.fine);
    const coarse = shift(this.centers.coarse);
    if (fine[0] !== this.centers.fine[0] || fine[1] !== this.centers.fine[1]) {
      this.centers.fine = fine;
      this.values.sweOrigin = [fine[0] - this.cfg.swe.radius, fine[1] - this.cfg.swe.radius];
      this.values.nearHeightOrigin = [fine[0] - this.cfg.nearSize / 2, fine[1] - this.cfg.nearSize / 2];
    }
    if (coarse[0] !== this.centers.coarse[0] || coarse[1] !== this.centers.coarse[1]) {
      this.centers.coarse = coarse;
      this.values.cswOrigin = [coarse[0] - this.cfg.coarse.radius, coarse[1] - this.cfg.coarse.radius];
      this.values.farHeightOrigin = [coarse[0] - this.cfg.farSize / 2, coarse[1] - this.cfg.farSize / 2];
    }
  }

  /** Writes every per-frame uniform. */
  writeUniforms(w: UniformWriter, s: SimState, simDt: number): void {
    const set = (name: string, v: number | readonly number[] | Float32Array) => {
      const layout = GLOBALS.get(name);
      if (layout) setField(w, layout, v);
    };
    set('time', s.time);
    set('dt', s.dt);
    set('simDt', simDt);
    set('simDtInv', 1 / Math.max(simDt, 1e-6));
    set('frame', s.frame);
    set('frameParity', s.frame & 1);
    set('cameraPos', s.cameraPos);
    set('cameraUnderwater', s.cameraUnderwater ? 1 : 0);
    set('nearPlane', s.nearPlane);
    set('farPlane', s.farPlane);
    set('projScaleY', s.projScaleY);
    set('viewProj', s.viewProj);
    set('invViewProj', s.invViewProj);
    set('view', s.view);
    set('invView', s.invView);
    set('pointerPos', s.pointer.pos);
    set('pointerPrev', s.pointer.prev);
    set('pointerActive', s.pointer.active ? 1 : 0);
    set('pointerForce', s.pointer.force);
    set('pointerRadius', s.pointer.radius);
    set('pointerMode', s.pointer.mode);

    // Camera-following 3D box, snapped to the cell size so the grid never swims.
    const snapping = this.cfg.mpm.dx;
    const radius = this.cfg.mpm.radius;
    const originX = Math.round((s.cameraPos[0] - radius) / snapping) * snapping;
    const originZ = Math.round((s.cameraPos[2] - radius) / snapping) * snapping;
    const floor = Number(this.values.seaLevel ?? 0) - this.cfg.mpm.depth * 0.45;
    set('mpmOrigin', [originX, floor, originZ]);
    set('mpmActiveRadius', radius);
    set('mpmDepth', this.cfg.mpm.depth);
    set('mpmDx', this.cfg.mpm.dx);
    set('mpmGrid', this.cfg.mpm.grid);
    set('mpmTiles', this.cfg.mpm.tiles);
    set('mpmTileSize', this.cfg.mpm.tileSize);
    set('mpmMaxParticles', this.cfg.mpm.maxParticles);
    set('mpmParticleRadius', this.cfg.mpm.dx * 0.5);
  }

  /**
   * Submission 1: shallow-water layers + swell. Leaves the near/far height fields ready for the
   * second submission (which re-writes `simDt` for the 3D layer).
   */
  simulate(encoder: GPUCommandEncoder, params: GPUBindGroup, dt: number): void {
    const substeps = Math.max(1, Number(this.values.sweSubsteps ?? 1));

    // Far field: packets always move; the coarse layer updates on its own (slower) clock.
    this.wave.clearFar(encoder, params, this.cfg.farRes);
    const cswHz = Math.max(1, Number(this.values.cswHz ?? 10));
    this.coarseClock += dt;
    if (this.coarse && this.coarseClock >= 1 / cswHz) {
      const steps = Math.max(1, Math.round(this.coarseClock * cswHz));
      this.coarseClock = 0;
      for (let i = 0; i < steps; i++) this.coarse.update(encoder, params, 4);
      this.surface.splatCoarse(encoder, params, this.coarse.read, this.coarse.count);
    }
    this.wave.update(encoder, params);
    this.wave.splat(encoder, params);
    this.surface.resolveFar(encoder, params);

    // Fine layer: several substeps of the SWE solver, then the splat and the crest spawn.
    for (let i = 0; i < substeps; i++) this.fine.update(encoder, params, 4);
    this.surface.clearNear(encoder, params, this.fine.read);
    this.surface.splatFine(encoder, params, this.fine.read, this.fine.count);
    this.spawnCrests(encoder, params);
  }

  private spawnCrests(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    const particles = this.fine.read;
    let group = this.spawnGroups.get(particles);
    if (!group) {
      group = this.spawnK.group([sbuf(0, particles), sbuf(1, this.mpm.aux)]);
      this.spawnGroups.set(particles, group);
    }
    this.spawnK.pass(encoder, params, group).dispatchWorkgroups(groups(this.fine.count, 64));
  }

  /** Submission 2: resolve the near field, then run the 3D layer against it. */
  couple(encoder: GPUCommandEncoder, params: GPUBindGroup): void {
    this.surface.resolveNear(encoder, params);
    const substeps = Math.max(1, Number(this.values.mpmSubsteps ?? 1));
    for (let i = 0; i < substeps; i++) this.mpm.update(encoder, params, this.cfg.mpm.maxParticles);
  }

  /** Bathymetry, shared verbatim with the GPU (params.ts `bedDepthAt` + common/util.wgsl). */
  private depthAt(x: number, z: number): number {
    return bedDepthAt(x, z, this.values);
  }
}
