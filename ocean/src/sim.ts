import {
  Tier, CascadeCfg, NEAR, NEAR_FINE_RES, NEAR_BLOCK_COUNT, waveSpeed,
} from './tiers';
import {
  SIM_INIT, SIM_STEP, AMR_FINE_STEP, AMR_RESTRICT, AMR_COMPOSITE, AMR_SCORE,
} from './shaders/sim';
import { SPRAY_SPAWN, SPRAY_UPDATE } from './shaders/spray';

// ---------------------------------------------------------------------------
// Uniform packing (must mirror the WGSL SimParams / UpdParams structs exactly)
// ---------------------------------------------------------------------------
export interface SimParamsData {
  origin: [number, number];
  prevOrigin: [number, number];
  size: number;
  dt: number;
  c: number;
  damping: number;
  diffusion: number;
  windAmp: number;
  time: number;
  seed: number;
  texN: number;
  fineN: number;
  windDir: [number, number];
  spawnRate: number;
  splashXY: [number, number];
  splashAmp: number;
  splashSigma: number;
  dampBoost: number;
}

function packSimParams(a: Float32Array, p: SimParamsData): void {
  // NOTE: mirrors the WGSL struct layout exactly — vec2f members sit at
  // 8-byte alignment, so splashXY lands at byte 72, not 68.
  a[0] = p.origin[0]; a[1] = p.origin[1];
  a[2] = p.prevOrigin[0]; a[3] = p.prevOrigin[1];
  a[4] = p.size; a[5] = p.dt; a[6] = p.c; a[7] = p.damping; a[8] = p.diffusion;
  a[9] = p.windAmp; a[10] = p.time; a[11] = p.seed; a[12] = p.texN; a[13] = p.fineN;
  a[14] = p.windDir[0]; a[15] = p.windDir[1];
  a[16] = p.spawnRate;
  a[17] = 0; // 4-byte pad to keep splashXY 8-aligned
  a[18] = p.splashXY[0]; a[19] = p.splashXY[1];
  a[20] = p.splashAmp; a[21] = p.splashSigma;
  a[22] = p.dampBoost; a[23] = 0; a[24] = 0;
}

const SIM_PARAMS_BYTES = 112;

function wb(device: GPUDevice, buf: GPUBuffer, data: Float32Array): void {
  device.queue.writeBuffer(buf, 0, data as unknown as GPUAllowSharedBufferSource);
}

function stateTexture(device: GPUDevice, res: number): GPUTexture {
  return device.createTexture({
    size: [res, res],
    format: 'rgba16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
  });
}

// ---------------------------------------------------------------------------
// Cascade: one periodic camera-following column-sim window
// ---------------------------------------------------------------------------
class Cascade {
  readonly window: number;
  readonly res: number;
  readonly c: number;
  readonly damping: number;
  readonly diffusion: number;
  originX = 0; originZ = 0;
  lastPrevX = 0; lastPrevZ = 0;
  private texA: GPUTexture; private texB: GPUTexture;
  viewCoarse: GPUTextureView; // post-step state (renderer + AMR sample this)
  private viewA: GPUTextureView; private viewB: GPUTextureView;

  constructor(
    private device: GPUDevice,
    cfg: CascadeCfg,
    private simPipelines: SimPipelines,
    private uniformBuf: GPUBuffer,
    private seed: number,
  ) {
    this.window = cfg.size;
    this.res = cfg.res;
    this.c = waveSpeed(cfg.depthEff);
    this.damping = cfg.damping;
    this.diffusion = cfg.diffusion;
    this.texA = stateTexture(device, cfg.res);
    this.texB = stateTexture(device, cfg.res);
    this.viewA = this.texA.createView();
    this.viewB = this.texB.createView();
    this.viewCoarse = this.viewA;
  }

  cell(): number {
    return this.window / this.res;
  }

  destroy(): void {
    this.texA.destroy();
    this.texB.destroy();
  }

  follow(camX: number, camZ: number): void {
    const cs = this.cell();
    this.lastPrevX = this.originX;
    this.lastPrevZ = this.originZ;
    this.originX = Math.floor(camX / cs) * cs - this.window / 2;
    this.originZ = Math.floor(camZ / cs) * cs - this.window / 2;
  }

  private params(dt: number, time: number, windAmp: number, windDir: [number, number],
    splash: { x: number; z: number; amp: number; sigma: number } | null,
    prevX: number, prevZ: number, dampBoost = 0): Float32Array {
    const f = new Float32Array(SIM_PARAMS_BYTES / 4);
    packSimParams(f, {
      origin: [this.originX, this.originZ],
      prevOrigin: [prevX, prevZ],
      size: this.window,
      dt, c: this.c,
      damping: this.damping,
      diffusion: this.diffusion,
      windAmp, time, seed: 3.17,
      texN: this.res, fineN: NEAR_FINE_RES,
      windDir, spawnRate: 0,
      splashXY: splash ? [splash.x, splash.z] : [0, 0],
      splashAmp: splash ? splash.amp : 0,
      splashSigma: splash ? splash.sigma : 2,
      dampBoost,
    });
    return f;
  }

  init(pass: GPUComputePassEncoder, time: number, windAmp: number, windDir: [number, number]): void {
    wb(this.device, this.uniformBuf,
      this.params(0, time, windAmp, windDir, null, this.originX, this.originZ));
    const bg = this.device.createBindGroup({
      layout: this.simPipelines.initLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: this.viewA },
      ],
    });
    pass.setPipeline(this.simPipelines.init);
    pass.setBindGroup(0, bg);
    const n = Math.ceil(this.res / 8);
    pass.dispatchWorkgroups(n, n);
    this.lastPrevX = this.originX;
    this.lastPrevZ = this.originZ;
  }

  step(pass: GPUComputePassEncoder, dt: number, time: number, windAmp: number,
    windDir: [number, number], splash: { x: number; z: number; amp: number; sigma: number } | null,
    dampBoost = 0): void {
    wb(this.device, this.uniformBuf,
      this.params(dt, time, windAmp, windDir, splash, this.lastPrevX, this.lastPrevZ, dampBoost));
    const bg = this.device.createBindGroup({
      layout: this.simPipelines.stepLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: this.viewA },
        { binding: 2, resource: this.viewB },
      ],
    });
    pass.setPipeline(this.simPipelines.step);
    pass.setBindGroup(0, bg);
    const n = Math.ceil(this.res / 8);
    pass.dispatchWorkgroups(n, n);
    const t = this.texA; this.texA = this.texB; this.texB = t;
    const v = this.viewA; this.viewA = this.viewB; this.viewB = v;
    this.viewCoarse = this.viewA;
  }
}

// ---------------------------------------------------------------------------
// Shared pipelines + layouts for the column sim
// ---------------------------------------------------------------------------
export class SimPipelines {
  init: GPUComputePipeline;
  step: GPUComputePipeline;
  fine: GPUComputePipeline;
  restrict: GPUComputePipeline;
  composite: GPUComputePipeline;
  score: GPUComputePipeline;
  spraySpawn: GPUComputePipeline;
  sprayUpdate: GPUComputePipeline;

  readonly initLayout: GPUBindGroupLayout;
  readonly stepLayout: GPUBindGroupLayout;
  readonly fineLayout: GPUBindGroupLayout;
  readonly restrictLayout: GPUBindGroupLayout;
  readonly compositeLayout: GPUBindGroupLayout;
  readonly scoreLayout: GPUBindGroupLayout;
  readonly spawnLayout: GPUBindGroupLayout;
  readonly updateLayout: GPUBindGroupLayout;

  constructor(device: GPUDevice) {
    const u = GPUShaderStage.COMPUTE;
    const tex = (b: number): GPUBindGroupLayoutEntry => ({
      binding: b, visibility: u, texture: { sampleType: 'unfilterable-float' },
    });
    const store = (b: number): GPUBindGroupLayoutEntry => ({
      binding: b, visibility: u, storageTexture: { access: 'write-only', format: 'rgba16float' },
    });
    const roBuf = (b: number): GPUBindGroupLayoutEntry => ({
      binding: b, visibility: u, buffer: { type: 'read-only-storage' },
    });
    const rwBuf = (b: number): GPUBindGroupLayoutEntry => ({
      binding: b, visibility: u, buffer: { type: 'storage' },
    });
    const uni = (b: number): GPUBindGroupLayoutEntry => ({
      binding: b, visibility: u, buffer: { type: 'uniform' },
    });

    this.initLayout = device.createBindGroupLayout({ entries: [uni(0), store(1)] });
    this.stepLayout = device.createBindGroupLayout({ entries: [uni(0), tex(1), store(2)] });
    this.fineLayout = device.createBindGroupLayout({ entries: [uni(0), tex(1), tex(2), store(3), roBuf(4)] });
    this.restrictLayout = device.createBindGroupLayout({ entries: [uni(0), tex(1), store(2), roBuf(3)] });
    this.compositeLayout = device.createBindGroupLayout({ entries: [uni(0), tex(1), tex(2), store(3), roBuf(4)] });
    this.scoreLayout = device.createBindGroupLayout({ entries: [uni(0), tex(1), rwBuf(2)] });
    this.spawnLayout = device.createBindGroupLayout({ entries: [uni(0), tex(1), rwBuf(2), rwBuf(3), rwBuf(4)] });
    this.updateLayout = device.createBindGroupLayout({ entries: [uni(0), tex(1), rwBuf(2), rwBuf(3)] });

    const mk = (code: string, layout: GPUBindGroupLayout) =>
      device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: device.createShaderModule({ code }), entryPoint: 'main' },
      });
    this.init = mk(SIM_INIT, this.initLayout);
    this.step = mk(SIM_STEP, this.stepLayout);
    this.fine = mk(AMR_FINE_STEP, this.fineLayout);
    this.restrict = mk(AMR_RESTRICT, this.restrictLayout);
    this.composite = mk(AMR_COMPOSITE, this.compositeLayout);
    this.score = mk(AMR_SCORE, this.scoreLayout);
    this.spraySpawn = mk(SPRAY_SPAWN, this.spawnLayout);
    this.sprayUpdate = mk(SPRAY_UPDATE, this.updateLayout);
  }
}

// ---------------------------------------------------------------------------
// OceanSim: near (AMR) + mid + far cascades + spray particle system
// ---------------------------------------------------------------------------
export interface SimFrameArgs {
  dt: number;
  time: number;
  camX: number;
  camZ: number;
  windAmp: number;   // raw wind magnitude from the sea-state slider
  targetRms: number; // desired near-field rms wave height (m)
  windDir: [number, number];
  spawnRate: number;
  splash: { x: number; z: number; amp: number; sigma: number } | null;
  sprayEnabled: boolean;
}

export class OceanSim {
  readonly near: Cascade;
  readonly mid: Cascade;
  readonly far: Cascade | null;
  readonly compTex: GPUTexture;
  readonly compView: GPUTextureView;
  readonly sprayCap: number;
  posBuf: GPUBuffer;
  velBuf: GPUBuffer;
  flagsBuf: GPUBuffer;
  refinedCount = 0;
  cellsSim = 0;
  cellsUniform = 0;

  private nearUB: GPUBuffer;     // used by the coarse L0 step (full dt)
  private nearFineUB: GPUBuffer; // used by fine/restrict/composite/score passes
  private nearSubUB: GPUBuffer;  // half-dt params for AMR fine substeps
  private midUB: GPUBuffer;
  private farUB: GPUBuffer | null = null;
  private updateUB: GPUBuffer;
  private fineA: GPUTexture; private fineB: GPUTexture;
  private fineViewA: GPUTextureView; private fineViewB: GPUTextureView;
  private scoresBuf: GPUBuffer;
  private staging: GPUBuffer;
  private counterBuf: GPUBuffer;
  private mapPending = false;
  private lastScores: Float32Array | null = null;
  seaRms = 0.55;
  private regWind = 0.5;
  private regBoost = 0;
  private flags: Uint8Array;
  private ages: Float32Array;
  private flagsScratch = new Float32Array(NEAR_BLOCK_COUNT * 2);
  private inited = false;

  constructor(private device: GPUDevice, private tier: Tier, private pipes: SimPipelines) {
    const mkUB = () => device.createBuffer({ size: SIM_PARAMS_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.nearUB = mkUB();
    this.nearFineUB = mkUB();
    this.nearSubUB = mkUB();
    this.midUB = mkUB();
    this.farUB = tier.far ? mkUB() : null;
    this.updateUB = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    this.near = new Cascade(device, NEAR, pipes, this.nearUB, 1.7);
    this.mid = new Cascade(device, tier.mid, pipes, this.midUB, 5.3);
    this.far = tier.far ? new Cascade(device, tier.far, pipes, this.farUB!, 9.1) : null;

    this.compTex = stateTexture(device, NEAR_FINE_RES);
    this.compView = this.compTex.createView();

    this.fineA = stateTexture(device, NEAR_FINE_RES);
    this.fineB = stateTexture(device, NEAR_FINE_RES);
    this.fineViewA = this.fineA.createView();
    this.fineViewB = this.fineB.createView();

    this.flags = new Uint8Array(NEAR_BLOCK_COUNT);
    this.ages = new Float32Array(NEAR_BLOCK_COUNT);
    this.flagsBuf = device.createBuffer({
      size: NEAR_BLOCK_COUNT * 2 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.scoresBuf = device.createBuffer({
      size: NEAR_BLOCK_COUNT * 2 * 4, // 64 scores + 64 block rms values
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.staging = device.createBuffer({
      size: NEAR_BLOCK_COUNT * 2 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.counterBuf = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE });

    this.sprayCap = Math.ceil(tier.sprayBudget / 64) * 64;
    this.posBuf = device.createBuffer({ size: this.sprayCap * 16, usage: GPUBufferUsage.STORAGE });
    this.velBuf = device.createBuffer({ size: this.sprayCap * 16, usage: GPUBufferUsage.STORAGE });

    this.writeFlags();
    this.updateStats();
  }

  destroy(): void {
    this.near.destroy();
    this.mid.destroy();
    this.far?.destroy();
    this.compTex.destroy();
    this.fineA.destroy();
    this.fineB.destroy();
    this.posBuf.destroy();
    this.velBuf.destroy();
    this.flagsBuf.destroy();
    this.scoresBuf.destroy();
    this.staging.destroy();
    this.counterBuf.destroy();
  }

  private updateStats(): void {
    const refined = this.tier.amr ? this.refinedCount : 0;
    this.cellsSim =
      NEAR.res * NEAR.res +
      refined * 32 * 32 +
      this.tier.mid.res * this.tier.mid.res +
      (this.tier.far ? this.tier.far.res * this.tier.far.res : 0);
    this.cellsUniform =
      NEAR_FINE_RES * NEAR_FINE_RES +
      this.tier.mid.res * this.tier.mid.res +
      (this.tier.far ? this.tier.far.res * this.tier.far.res : 0);
  }

  private writeFlags(): void {
    for (let i = 0; i < NEAR_BLOCK_COUNT; i++) {
      this.flagsScratch[i] = this.flags[i];
      this.flagsScratch[NEAR_BLOCK_COUNT + i] = this.ages[i];
    }
    wb(this.device, this.flagsBuf, this.flagsScratch);
  }

  setAmr(enabled: boolean): void {
    this.tier.amr = enabled;
  }

  // --- AMR readback + hysteresis + budget ----------------------------------
  private processScores(): void {
    if (this.tier.amr && this.lastScores) {
      // sea-state regulation from per-block rms (mean over blocks)
      let sum = 0;
      for (let i = 0; i < NEAR_BLOCK_COUNT; i++) sum += this.lastScores[NEAR_BLOCK_COUNT + i];
      this.seaRms = sum / NEAR_BLOCK_COUNT;
    } else if (!this.tier.amr && this.lastScores) {
      let sum = 0;
      for (let i = 0; i < NEAR_BLOCK_COUNT; i++) sum += this.lastScores[NEAR_BLOCK_COUNT + i];
      this.seaRms = sum / NEAR_BLOCK_COUNT;
    }
    if (!this.tier.amr) {
      if (this.refinedCount !== 0) {
        this.flags.fill(0);
        this.ages.fill(0);
        this.refinedCount = 0;
        this.writeFlags();
        this.updateStats();
      }
      return;
    }
    if (!this.lastScores) return;
    const s = this.lastScores;
    const HI = 0.75, LO = 0.38;
    const order = Array.from({ length: NEAR_BLOCK_COUNT }, (_, i) => i)
      .sort((a, b) => s[b] - s[a]);
    let count = 0;
    for (const b of order) {
      const want = s[b] > HI || (this.flags[b] === 1 && s[b] > LO);
      const flag = want && count < this.tier.maxFineBlocks ? 1 : 0;
      if (flag && !this.flags[b]) this.ages[b] = 0;
      else if (flag) this.ages[b] = Math.min(this.ages[b] + 1, 8);
      this.flags[b] = flag as 0 | 1;
      if (flag) count++;
    }
    this.refinedCount = count;
    this.updateStats();
    this.writeFlags();
  }

  private readbackScores(): void {
    if (!this.tier.amr || this.mapPending) return;
    this.mapPending = true;
    this.staging.mapAsync(GPUMapMode.READ)
      .then(() => {
        const copy = new Float32Array(NEAR_BLOCK_COUNT * 2);
        copy.set(new Float32Array(this.staging.getMappedRange()));
        this.staging.unmap();
        this.lastScores = copy;
        this.mapPending = false;
      })
      .catch(() => { this.mapPending = false; });
  }

  // --- per-frame compute recording ------------------------------------------
  frame(e: GPUCommandEncoder, a: SimFrameArgs): void {
    this.processScores();

    // sea-state controller: hold the measured rms height near the target by
    // scaling wind injection and adding feedback damping (verified numerically
    // in test/physics.ts)
    {
      const ratio = a.targetRms / Math.max(this.seaRms, 0.05);
      const windWanted = a.windAmp * Math.max(0.04, Math.min(2.5, ratio));
      const boostWanted = 1.2 * Math.max(0, this.seaRms / a.targetRms - 0.85);
      this.regWind += (windWanted - this.regWind) * 0.06;
      this.regBoost += (boostWanted - this.regBoost) * 0.06;
    }
    const windNear = this.regWind;
    const boostNear = this.regBoost;

    this.near.follow(a.camX, a.camZ);
    this.mid.follow(a.camX, a.camZ);
    this.far?.follow(a.camX, a.camZ);

    const cp = e.beginComputePass();

    if (!this.inited) {
      this.near.init(cp, 0, a.windAmp, a.windDir);
      this.mid.init(cp, 0, a.windAmp, a.windDir);
      this.far?.init(cp, 0, a.windAmp, a.windDir);
      this.inited = true;
    }

    const splash = a.splash;

    // near cascade: coarse step -> (AMR fine substeps -> restrict + score) -> composite
    this.near.step(cp, a.dt, a.time, windNear, a.windDir, splash, boostNear);

    // params for the near-window AMR passes; prev == origin (coarse step has
    // already advected the field into this frame's window)
    const fineParams = new Float32Array(SIM_PARAMS_BYTES / 4);
    packSimParams(fineParams, {
      origin: [this.near.originX, this.near.originZ],
      prevOrigin: [this.near.lastPrevX, this.near.lastPrevZ],
      size: this.near.window,
      dt: a.dt, c: waveSpeed(NEAR.depthEff),
      damping: NEAR.damping, diffusion: NEAR.diffusion,
      windAmp: windNear, time: a.time, seed: 3.17,
      texN: NEAR.res, fineN: NEAR_FINE_RES,
      windDir: a.windDir, spawnRate: a.spawnRate,
      splashXY: splash ? [splash.x, splash.z] : [0, 0],
      splashAmp: splash ? splash.amp : 0,
      splashSigma: splash ? splash.sigma : 2,
      dampBoost: boostNear,
    });
    wb(this.device, this.nearFineUB, fineParams);

    // NOTE: the fine level still holds LAST frame's window, so the fine step
    // needs the real prevOrigin (it advects itself); substeps run at dt/2.
    let fineOld = this.fineViewA;
    let fineNew = this.fineViewB;

    if (this.tier.amr) {
      const sub = 2;
      const subParams = new Float32Array(fineParams);
      subParams[5] = a.dt / sub; // dt slot
      wb(this.device, this.nearSubUB, subParams);
      for (let i = 0; i < sub; i++) {
        const bg = this.device.createBindGroup({
          layout: this.pipes.fineLayout,
          entries: [
            { binding: 0, resource: { buffer: this.nearSubUB } },
            { binding: 1, resource: this.near.viewCoarse },
            { binding: 2, resource: fineOld },
            { binding: 3, resource: fineNew },
            { binding: 4, resource: { buffer: this.flagsBuf } },
          ],
        });
        cp.setPipeline(this.pipes.fine);
        cp.setBindGroup(0, bg);
        cp.dispatchWorkgroups(NEAR_FINE_RES / 8, NEAR_FINE_RES / 8);
        const t = fineOld; fineOld = fineNew; fineNew = t;
      }
      const fineNewest = fineOld; // after the final swap

      // restriction: fine -> coarse inside refined blocks
      const rbg = this.device.createBindGroup({
        layout: this.pipes.restrictLayout,
        entries: [
          { binding: 0, resource: { buffer: this.nearFineUB } },
          { binding: 1, resource: fineNewest },
          { binding: 2, resource: this.near.viewCoarse },
          { binding: 3, resource: { buffer: this.flagsBuf } },
        ],
      });
      cp.setPipeline(this.pipes.restrict);
      cp.setBindGroup(0, rbg);
      cp.dispatchWorkgroups(NEAR.res / 8, NEAR.res / 8);

      // score blocks for next frame's refinement decisions
      const sbg = this.device.createBindGroup({
        layout: this.pipes.scoreLayout,
        entries: [
          { binding: 0, resource: { buffer: this.nearFineUB } },
          { binding: 1, resource: this.near.viewCoarse },
          { binding: 2, resource: { buffer: this.scoresBuf } },
        ],
      });
      cp.setPipeline(this.pipes.score);
      cp.setBindGroup(0, sbg);
      cp.dispatchWorkgroups(8, 8);
      e.copyBufferToBuffer(this.scoresBuf, 0, this.staging, 0, NEAR_BLOCK_COUNT * 2 * 4);
    }

    // composite the near render texture (runs even with AMR off = pure upsample)
    const cbg = this.device.createBindGroup({
      layout: this.pipes.compositeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.nearFineUB } },
        { binding: 1, resource: fineOld },
        { binding: 2, resource: this.near.viewCoarse },
        { binding: 3, resource: this.compView },
        { binding: 4, resource: { buffer: this.flagsBuf } },
      ],
    });
    cp.setPipeline(this.pipes.composite);
    cp.setBindGroup(0, cbg);
    cp.dispatchWorkgroups(NEAR_FINE_RES / 8, NEAR_FINE_RES / 8);

    // mid + far
    this.mid.step(cp, a.dt, a.time, windNear * 0.9, a.windDir, null, boostNear * 0.9);
    this.far?.step(cp, a.dt, a.time, windNear * 0.7, a.windDir, null, boostNear * 0.8);

    // spray
    if (a.sprayEnabled && this.tier.sprayEnabled) {
      const sbg = this.device.createBindGroup({
        layout: this.pipes.spawnLayout,
        entries: [
          { binding: 0, resource: { buffer: this.nearFineUB } },
          { binding: 1, resource: this.compView },
          { binding: 2, resource: { buffer: this.posBuf } },
          { binding: 3, resource: { buffer: this.velBuf } },
          { binding: 4, resource: { buffer: this.counterBuf } },
        ],
      });
      cp.setPipeline(this.pipes.spraySpawn);
      cp.setBindGroup(0, sbg);
      cp.dispatchWorkgroups(NEAR_FINE_RES / 8, NEAR_FINE_RES / 8);

      const u = new Float32Array(12);
      u[0] = a.dt; u[1] = a.windAmp;
      u[2] = this.near.originX; u[3] = this.near.originZ;
      u[4] = this.near.window;
      u[6] = a.windDir[0]; u[7] = a.windDir[1];
      wb(this.device, this.updateUB, u);
      const ubg = this.device.createBindGroup({
        layout: this.pipes.updateLayout,
        entries: [
          { binding: 0, resource: { buffer: this.updateUB } },
          { binding: 1, resource: this.compView },
          { binding: 2, resource: { buffer: this.posBuf } },
          { binding: 3, resource: { buffer: this.velBuf } },
        ],
      });
      cp.setPipeline(this.pipes.sprayUpdate);
      cp.setBindGroup(0, ubg);
      cp.dispatchWorkgroups(Math.ceil(this.sprayCap / 64), 1);
    }

    cp.end();
    this.readbackScores();
  }

  get nearOrigin(): [number, number] {
    return [this.near.originX, this.near.originZ];
  }

  get midOrigin(): [number, number] {
    return [this.mid.originX, this.mid.originZ];
  }

  get farOrigin(): [number, number] {
    return this.far ? [this.far.originX, this.far.originZ] : this.midOrigin;
  }

  get sprayBuffers(): { pos: GPUBuffer; vel: GPUBuffer } {
    return { pos: this.posBuf, vel: this.velBuf };
  }
}
