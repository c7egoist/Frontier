// Frame orchestration. Order:
//   1. ocean spectrum  (one dispatch per cascade)
//   2. FFT rows + columns per cascade (ping-pong)
//   3. resolve fields, then upload them into the per-cascade textures the shaders sample
//   4. shallow-water sim (camera-centred, CFL-clamped)
//   5. sky, terrain, ocean rings back to front, cities, water slice, post
//
// The LOD decision for the frame is made once by the resolver in src/core/lod.ts and recorded
// in `lastPlan` so the HUD can show *why* a ring got the spacing it did.

import { buildShaderSources, createPipelines, SHADER_FILES, type Pipelines, type ShaderKey, type ShaderSource } from './pipelines.ts';
import {
  createCascadeResources, createTexture, uploadBake, HDR_FORMAT, type CascadeGpu,
} from './resources.ts';
import {
  FRAME_FLOATS, RING_FLOATS, writeFrame, writeRing, writeOceanSim, writeFftParams, writeResolve,
  writeSimParams, writeTerrainParams, writeMap, writeHorizon, writeSlice,
  F, SIM_OCEAN_FLOATS, FFT_PARAMS_FLOATS, RESOLVE_FLOATS, SIM_PARAMS_FLOATS, TERRAIN_PARAMS_FLOATS,
  MAP_FLOATS, HORIZON_FLOATS, SLICE_FLOATS,
} from './uniforms.ts';
import { resolveWaterLod, stableSimTimestep, type WaterLOD, type LODParams } from '../core/lod.ts';
import { planSimSteps } from './oceanChain.ts';
import { uploadStaticCascadeParams, type CascadeStatic } from './data.ts';
import type { SpectrumCascade } from '../core/oceanSpectrum.ts';
import { calibrateCascades } from '../core/oceanSpectrum.ts';
import type { HeightBake, WorldLayers } from '../core/terrain.ts';
import { sampleBake } from '../core/terrain.ts';
import type { OrbitCamera } from '../app/camera.ts';

export interface RenderSettings {
  exposure: number;
  fogDensity: number;
  sunAzimuth: number;
  sunElevation: number;
  windSpeed: number;
  windDirection: number;
  choppiness: number;
  simResolution: number;
  simExtent: number;
  spectrumSize: number;
  pixelErrorBudget: number;
  showCities: boolean;
  showWaterSlice: boolean;
  showLodRings: boolean;
  showLodOverlay: boolean;
  wireframeLod: boolean;
  timeScale: number;
  paused: boolean;
  terrainDetail: number;
}

export const DEFAULT_SETTINGS: RenderSettings = {
  exposure: 1.15,
  fogDensity: 0.000016,
  sunAzimuth: 2.05,
  sunElevation: 0.32,
  windSpeed: 11,
  windDirection: 0.6,
  choppiness: 1.15,
  simResolution: 256,
  simExtent: 900,
  spectrumSize: 128,
  pixelErrorBudget: 4,
  showCities: true,
  showWaterSlice: false,
  showLodRings: true,
  showLodOverlay: false,
  wireframeLod: false,
  timeScale: 1,
  paused: false,
  terrainDetail: 1,
};

export const TERRAIN_GRID = 480;

export interface WaterStats {
  frameMs: number;
  gpuMs: number | null;
  lod: WaterLOD | null;
  triangles: number;
  cascades: number;
  simResolution: number;
  simSteps: number;
  simDtMs: number;
  tallestWave: number;
  hs: number;
}

export class Renderer {
  readonly device: GPUDevice;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: GPUCanvasContext;
  private pipelines: Pipelines | null = null;
  private shaders: ShaderSource | null = null;
  private cascades: SpectrumCascade[] = [];
  private cascadeGpu: CascadeGpu[] = [];
  private cascadeStatic: CascadeStatic[] = [];
  private frameBuffer!: GPUBuffer;
  private frameBindGroup!: GPUBindGroup;
  private terrainParams!: GPUBuffer;
  private simParams!: GPUBuffer;
  private mapParams!: GPUBuffer;
  private horizonParams!: GPUBuffer;
  private sliceParams!: GPUBuffer;
  private cityUniform!: GPUBuffer;
  private cityInfoBuffer!: GPUBuffer;
  private heightTex: GPUTexture | null = null;
  private terrainIndexBuffer: GPUBuffer | null = null;
  private terrainIndexCount = 0;
  private terrainBg: GPUBindGroup | null = null;
  private cityBg: GPUBindGroup | null = null;
  private mapBg: GPUBindGroup | null = null;
  private bakeLayers: { height: Float32Array; bathy: Float32Array } | null = null;
  private lastCities: Float32Array | null = null;
  private simResolution = 0;
  private needsReset = false;
  private needsSeed = false;
  private postBg: GPUBindGroup | null = null;
  private ringBuffers: GPUBuffer[] = [];
  private oceanBgs: GPUBindGroup[] = [];
  private simPing: [GPUTexture, GPUTexture] | null = null;
  private simBgs: [GPUBindGroup, GPUBindGroup] | null = null;
  private sceneTex: GPUTexture | null = null;
  private depthTex: GPUTexture | null = null;
  private msaaTex: GPUTexture | null = null;
  private sampler: GPUSampler;
  private size = { w: 1, h: 1 };
  private bake: HeightBake | null = null;
  private time = 0;
  private lastFrame = 0;
  private simAccum = 0;
  settings: RenderSettings = { ...DEFAULT_SETTINGS };
  stats: WaterStats = {
    frameMs: 0, gpuMs: null, lod: null, triangles: 0, cascades: 0,
    simResolution: 0, simSteps: 0, simDtMs: 0, tallestWave: 0, hs: 0,
  };
  lastPlan: WaterLOD | null = null;
  onError?: (msg: string) => void;
  msaa = 4;

  constructor(device: GPUDevice, canvas: HTMLCanvasElement, format: GPUTextureFormat) {
    this.device = device;
    this.canvas = canvas;
    this.ctx = canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this.ctx) throw new Error('canvas.getContext("webgpu") returned null');
    this.ctx.configure({ device, format, alphaMode: 'opaque' });
    this.sampler = device.createSampler({
      label: 'linear', magFilter: 'linear', minFilter: 'linear',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
      mipmapFilter: 'linear',
    });
  }

  /** Load shader sources, compile, and create pipelines. Throws with the compile log. */
  async init(rawShaders: Record<ShaderKey, string>, canvasFormat: GPUTextureFormat) {
    const shaders = buildShaderSources(rawShaders);
    this.shaders = shaders;
    const modules = {} as Record<ShaderKey, GPUShaderModule>;
    const problems: string[] = [];
    for (const key of Object.keys(SHADER_FILES) as ShaderKey[]) {
      if (key === 'common') continue;
      const code = shaders.modules[key];
      const module = this.device.createShaderModule({ label: key, code });
      const info = await module.getCompilationInfo();
      for (const m of info.messages) {
        if (m.type === 'error') problems.push(`${key}:${m.lineNum}:${m.linePos} ${m.message}`);
      }
      modules[key] = module;
    }
    if (problems.length) throw new Error(`Shader compilation failed:\n${problems.join('\n')}`);
    this.pipelines = createPipelines(this.device, modules, {
      hdrFormat: HDR_FORMAT,
      canvasFormat,
      depthFormat: 'depth24plus',
      msaa: this.msaa,
    });
    this.createUniformBuffers();
  }

  private createUniformBuffers() {
    const d = this.device;
    const ub = (label: string, bytes: number) => d.createBuffer({ label, size: bytes, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.frameBuffer = ub('frame', FRAME_FLOATS * 4);
    this.terrainParams = ub('terrain-params', TERRAIN_PARAMS_FLOATS * 4);
    this.simParams = ub('sim-params', SIM_PARAMS_FLOATS * 4);
    this.mapParams = ub('map-params', MAP_FLOATS * 4);
    this.horizonParams = ub('horizon-params', HORIZON_FLOATS * 4);
    this.sliceParams = ub('slice-params', SLICE_FLOATS * 4);
    this.cityUniform = d.createBuffer({ label: 'city-data', size: 32 * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.cityInfoBuffer = ub('city-info', 16);
    this.frameBindGroup = d.createBindGroup({
      label: 'frame-bg',
      layout: this.pipelines!.layouts.frame,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.sampler },
      ],
    });
    this.ringBuffers = Array.from({ length: 16 }, (_, i) => ub(`ring-${i}`, RING_FLOATS * 4));
  }

  /** (Re)build the spectral cascades for the current wind / spectrum settings. */
  setSpectrum(cascades: SpectrumCascade[]) {
    if (!this.pipelines) return;
    this.cascades = cascades;
    this.cascadeGpu = createCascadeResources(this.device, cascades, this.pipelines.layouts);
    this.uploadCascadeStatics();
    // The shallow-water sim samples cascade 0, so it can only be built once cascades exist.
    if (this.bathyTexture) this.buildSimResources();
  }

  private uploadCascadeStatics() {
    this.cascadeStatic = uploadStaticCascadeParams(
      this.device,
      this.cascades,
      this.cascadeGpu.map(c => ({ fftParams: c.fftParams, resolveParams: c.resolveParams })),
      this.settings.choppiness,
    );
  }

  setSpectrumSize(size: number) {
    this.settings.spectrumSize = size;
  }

  /** Upload a fresh bake: height display texture, bathymetry, terrain indices, city plots. */
  setBake(bake: HeightBake, layers: { height: Float32Array; bathy: Float32Array }, cities: Float32Array) {
    if (!this.pipelines || !this.shaders) return;
    const d = this.device;
    const size = bake.size;
    this.bake = bake;

    this.heightTex?.destroy();
    const textures = uploadBake(d, bake, layers);
    this.heightTex = textures.height;

    // Terrain index buffer: quads as triangles, row-major grid.
    // Terrain grid is a fixed 480x480 quads regardless of bake resolution; indices are shared.
    const n = TERRAIN_GRID;
    const verts = n + 1;
    const idxCount = n * n * 6;
    const indices = new Uint32Array(idxCount);
    let k = 0;
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const a = z * verts + x, b = a + 1, c = a + verts, d2 = c + 1;
        indices[k++] = a; indices[k++] = c; indices[k++] = b;
        indices[k++] = b; indices[k++] = c; indices[k++] = d2;
      }
    }
    this.terrainIndexBuffer?.destroy();
    this.terrainIndexBuffer = d.createBuffer({ label: 'terrain-index', size: indices.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.terrainIndexBuffer, 0, indices);
    this.terrainIndexCount = idxCount;

    this.terrainBg = d.createBindGroup({
      label: 'terrain-bg',
      layout: this.pipelines.layouts.terrain,
      entries: [
        { binding: 0, resource: { buffer: this.terrainParams } },
        { binding: 1, resource: textures.height.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.terrainIndexBuffer } },
      ],
    });

    this.cityData = cities;
    this.cityCount = cities.length / 4;
    d.queue.writeBuffer(this.cityUniform, 0, cities as Float32Array<ArrayBuffer>);
    this.cityBg = d.createBindGroup({
      label: 'city-bg',
      layout: this.pipelines.layouts.cities,
      entries: [
        { binding: 0, resource: { buffer: this.cityUniform } },
        { binding: 1, resource: textures.height.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.cityInfoBuffer } },
      ],
    });
    this.mapBg = d.createBindGroup({
      label: 'map-bg',
      layout: this.pipelines.layouts.map,
      entries: [
        { binding: 0, resource: { buffer: this.mapParams } },
        { binding: 1, resource: textures.height.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: { buffer: this.cityUniform } },
      ],
    });
    this.bathyTexture = textures.bathy;
    this.bakeLayers = layers;
    this.lastCities = cities;
    this.cityCount = cities.length / 4;
    this.buildSimResources();
  }

  private bathyTexture: GPUTexture | null = null;
  private cityData: Float32Array = new Float32Array(0);

  private buildSimResources() {
    if (!this.pipelines || !this.bathyTexture || this.cascadeGpu.length === 0) return;
    const d = this.device;
    const n = this.settings.simResolution;
    if (this.simResolution === n && this.simPing) return;
    this.simResolution = n;
    for (const t of this.simPing ?? []) t.destroy();
    const mk = (label: string) => createTexture(d, label, n, n, HDR_FORMAT,
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    this.simPing = [mk('sim-0'), mk('sim-1')];
    const bg = (dst: GPUTexture): GPUBindGroup => d.createBindGroup({
      label: 'sim-bg',
      layout: this.pipelines!.layouts.simShallow,
      entries: [
        { binding: 0, resource: { buffer: this.simParams } },
        { binding: 1, resource: (dst === this.simPing![0] ? this.simPing![1] : this.simPing![0]).createView() },
        { binding: 2, resource: this.bathyTexture!.createView() },
        { binding: 3, resource: this.sampler },
        { binding: 4, resource: dst.createView() },
        { binding: 5, resource: this.cascadeGpu[0].field.createView() },
      ],
    });
    this.simBgs = [bg(this.simPing[0]), bg(this.simPing[1])];
    this.needsSeed = true;
  }

  /** One-shot: fill the sim from the spectrum so the near field starts in agreement. */
  private seedSim() {
    if (!this.simBgs || !this.simPing || !this.pipelines) return;
    const enc = this.device.createCommandEncoder({ label: 'sim-seed' });
    const pass = enc.beginComputePass({ label: 'sim-seed' });
    pass.setPipeline(this.pipelines.simSeed);
    pass.setBindGroup(0, this.simBgs[0]);
    const wg = Math.ceil(this.settings.simResolution / 8);
    pass.dispatchWorkgroups(wg, wg);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.simParity = 0;
    this.needsSeed = false;
  }

  private ensureTargets(w: number, h: number) {
    if (this.sceneTex && this.size.w === w && this.size.h === h) return;
    this.size = { w, h };
    this.sceneTex?.destroy();
    this.depthTex?.destroy();
    this.msaaTex?.destroy();
    const d = this.device;
    this.sceneTex = createTexture(d, 'scene', w, h, HDR_FORMAT,
      GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    this.depthTex = createTexture(d, 'depth', w, h, 'depth24plus', GPUTextureUsage.RENDER_ATTACHMENT);
    if (this.msaa > 1) {
      this.msaaTex = createTexture(d, 'msaa', w, h, HDR_FORMAT, GPUTextureUsage.RENDER_ATTACHMENT);
    }
    this.postBg = d.createBindGroup({
      label: 'post-bg',
      layout: this.pipelines!.layouts.post,
      entries: [
        { binding: 0, resource: this.sceneTex.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });
  }

  private buildFrameUniform(camera: OrbitCamera, aspect: number, layers: WorldLayers | null) {
    const m = camera.matrix(aspect);
    const eye = m.eye;
    const sunDir: [number, number, number] = [
      Math.cos(this.settings.sunElevation) * Math.sin(this.settings.sunAzimuth),
      Math.sin(this.settings.sunElevation),
      Math.cos(this.settings.sunElevation) * Math.cos(this.settings.sunAzimuth),
    ];
    const buf = new Float32Array(FRAME_FLOATS);
    const halfWorld = (this.bake?.worldSize ?? 1e7) / 2;
    writeFrame(buf, {
      viewProj: m.viewProj,
      invViewProj: m.invViewProj,
      eye,
      time: this.time,
      forward: camera.forward,
      simRadius: this.settings.simExtent,
      sunDir,
      sunIntensity: 3.1,
      sunColor: [1.0, 0.94, 0.86],
      exposure: this.settings.exposure,
      fogDensity: this.settings.fogDensity,
      cloudCover: 0.35,
      simExtent: this.settings.simExtent,
      simSpacing: (this.settings.simExtent * 2) / this.settings.simResolution,
      simCellMetres: (this.settings.simExtent * 2) / this.settings.simResolution,
      waterLevel: 0,
      screenWidth: this.size.w,
      screenHeight: this.size.h,
      flatDistance: this.plan?.rings[this.plan.rings.length - 1]?.outer ?? 25000,
      horizonDistance: this.settings.simExtent * 40,
      fovY: camera.fovY,
      cameraHeight: Math.max(eye[1], 0),
      windDir: [Math.cos(this.settings.windDirection), Math.sin(this.settings.windDirection)],
      windSpeed: this.settings.windSpeed,
      choppiness: this.settings.choppiness,
      cascadeTiles: [512, 64, 8],
      abyssDepth: 4200,
      worldSize: this.bake?.worldSize ?? 1e7,
      halfWorld,
      spectrumN: this.settings.spectrumSize,
      gridN: TERRAIN_GRID,
      lodOverlay: this.settings.showLodOverlay,
    });
    void layers;
    this.device.queue.writeBuffer(this.frameBuffer, 0, buf);
  }

  private plan: WaterLOD | null = null;

  /** Dispatch the whole simulation pipeline for this frame. */
  private updateOcean(camera: OrbitCamera, dt: number) {
    if (!this.pipelines || !this.cascades.length) return;
    const d = this.device;
    const p = this.pipelines;
    const enc = d.createCommandEncoder({ label: 'ocean-sim' });
    const n = this.settings.spectrumSize;
    let sub = 0;

    for (let ci = 0; ci < this.cascadeGpu.length; ci++) {
      const c = this.cascadeGpu[ci];
      const spectrum = this.cascades[ci];
      const simBuf = new Float32Array(SIM_OCEAN_FLOATS);
      writeOceanSim(simBuf, {
        time: this.time, n, choppiness: this.settings.choppiness,
        amplitude: 1, tile: spectrum.cfg.tile,
      });
      d.queue.writeBuffer(c.simAParams, 0, simBuf);

      // 1. spectrum
      {
        const pass = enc.beginComputePass({ label: `spectrum-${ci}` });
        pass.setPipeline(p.spectrum);
        pass.setBindGroup(0, c.bindGroups.spectrum[0]);
        const wg = Math.ceil(n / 8);
        pass.dispatchWorkgroups(wg, wg);
        pass.end();
      }
      // 2. FFT: a pre-planned chain of passes, each reading what the previous pass wrote.
      const stat = this.cascadeStatic[ci];
      for (let pi = 0; pi < stat.chain.passes.length; pi++) {
        const p2 = stat.chain.passes[pi];
        const pass = enc.beginComputePass({ label: `${p2.label}-${ci}` });
        pass.setPipeline(p.fft);
        pass.setBindGroup(0, c.bindGroups.fft[p2.read][stat.paramSlot[pi]]);
        const wg = Math.ceil(n / 8);
        pass.dispatchWorkgroups(wg, wg);
        pass.end();
        sub++;
      }
      const resultParity = stat.chain.result;
      // 3. resolve
      {
        // resolve params are static (uploaded in uploadCascadeStatics)
        const pass = enc.beginComputePass({ label: `resolve-${ci}` });
        pass.setPipeline(p.resolve);
        pass.setBindGroup(0, c.bindGroups.resolve[resultParity]);
        const wg = Math.ceil(n / 8);
        pass.dispatchWorkgroups(wg, wg);
        pass.end();
      }
    }

    // 4. shallow-water sim with CFL-clamped substeps.
    if (this.needsSeed) {
      // Seeding needs its own submit so the following step reads the seeded state.
      d.queue.submit([enc.finish()]);
      this.seedSim();
      return;
    }
    const simBgs = this.simBgs;
    if (simBgs && this.simPing) {
      const cell = (this.settings.simExtent * 2) / this.settings.simResolution;
      const dtClamped = stableSimTimestep(cell, 300, 9.81, 0.35);
      const wanted = Math.min(dt * Math.max(this.settings.timeScale, 0), 0.1);
      const steps = Math.max(1, Math.min(6, Math.ceil(wanted / dtClamped)));
      const dtStep = wanted / steps;
      const simBuf = new Float32Array(SIM_PARAMS_FLOATS);
      writeSimParams(simBuf, {
        n: this.settings.simResolution, dt: dtStep, cell, gravity: 9.81,
        drag: 0.004, damping: 0.0012, waterLevel: 0,
        tau: 0.35,
        originX: camera.eye[0], originZ: camera.eye[2],
        tile: this.cascades[0]?.cfg.tile ?? 512,
      });
      d.queue.writeBuffer(this.simParams, 0, simBuf);
      const plan = planSimSteps(this.simParity, steps);
      plan.writeParity.forEach((writeParity, i) => {
        const pass = enc.beginComputePass({ label: `sim-${i}` });
        pass.setPipeline(p.sim);
        // simBgs[k] writes into texture k and reads the other one.
        pass.setBindGroup(0, simBgs[writeParity]);
        const wg = Math.ceil(this.settings.simResolution / 8);
        pass.dispatchWorkgroups(wg, wg);
        pass.end();
      });
      this.simParity = plan.endParity;
      this.stats.simSteps = steps;
      this.stats.simDtMs = dtStep * 1000;
    }

    d.queue.submit([enc.finish()]);
    void sub;
    this.stats.cascades = this.cascades.length;
  }

  private simParity: 0 | 1 = 0;

  render(camera: OrbitCamera, dt: number, options: { mapView: boolean; mapCenter: [number, number]; mapHalf: number }) {
    if (!this.pipelines || !this.shaders) return;
    // A settings change may have invalidated derived GPU resources; restore them before drawing
    // rather than drawing with stale or missing bind groups.
    if (this.settings.simResolution !== this.simResolution) this.buildSimResources();
    const d = this.device;
    const t0 = performance.now();
    const w = Math.max(1, Math.floor(this.canvas.width));
    const h = Math.max(1, Math.floor(this.canvas.height));
    this.ensureTargets(w, h);
    const aspect = w / h;
    this.buildFrameUniform(camera, aspect, null);
    this.updateOcean(camera, dt);

    const lodParams: LODParams = {
      fovY: camera.fovY,
      viewportHeight: h,
      simRadius: this.settings.simExtent,
      flatDistance: 9000 * 2.2,
      horizonDistance: this.settings.simExtent * 60,
      pixelErrorBudget: this.settings.pixelErrorBudget,
    };
    const plan = resolveWaterLod(Math.max(camera.eye[1], 1), lodParams);
    this.plan = plan;
    this.lastPlan = plan;

    this.buildOceanRingBgs(plan, camera);
    const enc = d.createCommandEncoder({ label: 'frame' });

    // Terrain / city / horizon uniforms
    this.writeTerrainUniforms(plan, camera);
    this.writeCityUniforms();
    this.writeHorizonUniforms(plan, camera);
    this.writeSliceUniforms(camera);

    const colorAttachment: GPURenderPassColorAttachment = {
      view: (this.msaaTex ?? this.sceneTex!).createView(),
      resolveTarget: this.msaaTex ? this.sceneTex!.createView() : undefined,
      clearValue: { r: 0.02, g: 0.03, b: 0.05, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    };
    const depthAttachment: GPURenderPassDepthStencilAttachment = {
      view: this.depthTex!.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    };

    const pass = enc.beginRenderPass({ label: 'scene', colorAttachments: [colorAttachment], depthStencilAttachment: depthAttachment });
    const p = this.pipelines;

    // Sky
    pass.setPipeline(p.sky);
    pass.setBindGroup(0, this.frameBindGroup);
    pass.draw(3);

    // Terrain
    if (this.terrainBg && this.terrainIndexBuffer) {
      pass.setPipeline(p.terrain);
      pass.setBindGroup(0, this.frameBindGroup);
      pass.setBindGroup(1, this.terrainBg);
      pass.setIndexBuffer(this.terrainIndexBuffer, 'uint32');
      pass.drawIndexed(this.terrainIndexCount);
    }

    // Horizon skirt (behind everything, no depth write)
    if (this.oceanBgs.length) {
      pass.setPipeline(p.horizon);
      pass.setBindGroup(0, this.frameBindGroup);
      pass.setBindGroup(1, d.createBindGroup({
        layout: p.layouts.horizon,
        entries: [{ binding: 0, resource: { buffer: this.horizonParams } }],
      }));
      pass.draw(64 * 6);
    }

    // Ocean rings, coarse to fine so the finer ring's discard reveals the coarser one.
    if (this.oceanBgs.length) {
      pass.setPipeline(p.ocean);
      pass.setBindGroup(0, this.frameBindGroup);
      for (let i = this.oceanBgs.length - 1; i >= 0; i--) {
        pass.setBindGroup(1, this.oceanBgs[i]);
        const q = 32;
        pass.draw(q * q * 6);
      }
    }

    // Cities
    if (this.settings.showCities && this.cityBg) {
      pass.setPipeline(p.cities);
      pass.setBindGroup(0, this.frameBindGroup);
      pass.setBindGroup(1, this.cityBg);
      pass.draw(32 * 6, this.cityCount);
    }

    // Water column slice
    if (this.settings.showWaterSlice && this.oceanBgs.length) {
      pass.setPipeline(p.slice);
      pass.setBindGroup(0, this.frameBindGroup);
      pass.setBindGroup(1, d.createBindGroup({
        layout: p.layouts.slice,
        entries: [
          { binding: 0, resource: { buffer: this.sliceParams } },
          { binding: 1, resource: this.cascadeGpu[0].field.createView() },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: this.bathyTexture!.createView() },
          { binding: 4, resource: this.sampler },
        ],
      }));
      pass.draw(256 * 6);
    }
    pass.end();

    // Composite or map
    const outView = this.ctx.getCurrentTexture().createView();
    if (options.mapView) {
      const mp = new Float32Array(MAP_FLOATS);
      writeMap(mp, {
        cx: options.mapCenter[0], cz: options.mapCenter[1], viewHalf: options.mapHalf,
        worldHalf: (this.bake?.worldSize ?? 1e7) / 2,
        showRings: this.settings.showLodRings ? 1 : 0,
        showCities: this.settings.showCities ? 1 : 0,
        showCoast: 1, simRadius: this.settings.simExtent,
      });
      d.queue.writeBuffer(this.mapParams, 0, mp);
      const mapPass = enc.beginRenderPass({
        label: 'map',
        colorAttachments: [{ view: outView, clearValue: { r: 0.03, g: 0.04, b: 0.06, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      });
      mapPass.setPipeline(p.map);
      mapPass.setBindGroup(0, this.frameBindGroup);
      mapPass.setBindGroup(1, this.mapBg!);
      mapPass.draw(3);
      mapPass.end();
    } else {
      const postPass = enc.beginRenderPass({
        label: 'post',
        colorAttachments: [{ view: outView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      });
      postPass.setPipeline(p.post);
      postPass.setBindGroup(0, this.frameBindGroup);
      postPass.setBindGroup(1, this.postBg!);
      postPass.draw(3);
      postPass.end();
    }
    d.queue.submit([enc.finish()]);

    // Stats
    const now = performance.now();
    this.stats.frameMs = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    this.stats.lod = plan;
    this.stats.triangles = plan.tris + this.terrainIndexCount / 3;
    this.stats.simResolution = this.settings.simResolution;
    this.stats.hs = this.cascades.reduce((a, c) => a + (c.targetHs / 4) ** 2, 0);
    this.stats.hs = Math.sqrt(this.stats.hs) * 4;
    if (!this.settings.paused) this.time += dt * this.settings.timeScale;
    void t0;
  }

  private cityCount = 0;

  private writeTerrainUniforms(plan: WaterLOD, camera: OrbitCamera) {
    const bake = this.bake;
    const buf = new Float32Array(TERRAIN_PARAMS_FLOATS);
    writeTerrainParams(buf, {
      size: bake?.size ?? 1024,
      worldSize: bake?.worldSize ?? 1e7,
      centerX: 0, centerZ: 0,
      halfExtent: (bake?.worldSize ?? 1e7) / 2,
      detailGain: this.settings.terrainDetail,
      seaLevel: 0,
      gridN: TERRAIN_GRID,
    });
    this.device.queue.writeBuffer(this.terrainParams, 0, buf);
    void plan; void camera;
  }

  private writeCityUniforms() {
    const buf = new Float32Array(4);
    buf[0] = this.cityCount;
    buf[1] = this.bake?.worldSize ?? 1e7;
    buf[2] = (this.bake?.worldSize ?? 1e7) / 2;
    buf[3] = 0;
    this.device.queue.writeBuffer(this.cityInfoBuffer, 0, buf);
  }

  private writeHorizonUniforms(plan: WaterLOD, camera: OrbitCamera) {
    const buf = new Float32Array(HORIZON_FLOATS);
    const outer = Math.max(plan.rings[plan.rings.length - 1].outer * 3.5, 120_000);
    writeHorizon(buf, { inner: outer * 0.82, outer, y: 0, segments: 96 });
    this.device.queue.writeBuffer(this.horizonParams, 0, buf);
    void camera;
  }

  private writeSliceUniforms(camera: OrbitCamera) {
    const buf = new Float32Array(SLICE_FLOATS);
    const dist = camera.distance;
    writeSlice(buf, {
      axisX: 1, fixed: camera.target[1], halfLen: Math.min(this.settings.simExtent, dist * 0.6),
      heightScale: 3, lineWidth: 2,
    });
    this.device.queue.writeBuffer(this.sliceParams, 0, buf);
  }

  /**
   * Build one bind group per ocean ring for this frame. Ring uniforms are rewritten every frame
   * (origin snaps to the grid, amplitude carries the geomorph fade) and the sim texture changes
   * parity, so these cannot be cached across frames.
   */
  private buildOceanRingBgs(plan: WaterLOD, camera: OrbitCamera) {
    if (!this.pipelines || this.cascadeGpu.length < 3 || !this.simPing) return;
    const d = this.device;
    const simView = this.simPing[this.simParity].createView();
    const fields = this.cascadeGpu.map(c => c.field.createView());
    const bathy = this.bathyTexture?.createView();
    if (!bathy) return;
    this.oceanBgs = [];
    for (let i = 0; i < Math.min(plan.rings.length, this.ringBuffers.length); i++) {
      const ring = plan.rings[i];
      const buf = new Float32Array(RING_FLOATS);
      const spacing = ring.spacing;
      // Snap the ring origin so vertices never swim between grid cells.
      const originX = Math.floor(camera.eye[0] / spacing) * spacing;
      const originZ = Math.floor(camera.eye[2] / spacing) * spacing;
      const regime = ring.regime === 'simulated' ? 0 : ring.regime === 'displaced' ? 1 : 2;
      writeRing(buf, {
        origin: [originX, originZ],
        spacing,
        inner: ring.inner,
        outer: ring.outer,
        index: i,
        regime,
        quads: ring.verts,
        amplitude: ring.regime === 'flat' ? 0.25 : 1,
      });
      d.queue.writeBuffer(this.ringBuffers[i], 0, buf);
      this.oceanBgs.push(d.createBindGroup({
        label: `ocean-ring-${i}`,
        layout: this.pipelines.layouts.oceanSurface,
        entries: [
          { binding: 0, resource: { buffer: this.ringBuffers[i] } },
          { binding: 1, resource: fields[0] },
          { binding: 2, resource: this.sampler },
          { binding: 3, resource: simView },
          { binding: 4, resource: bathy },
          { binding: 5, resource: this.sampler },
          { binding: 6, resource: fields[1] },
          { binding: 7, resource: fields[2] },
        ],
      }));
    }
  }

  setCityCount(n: number) { this.cityCount = n; }

  get cascadeTextures() { return this.cascadeGpu; }
  get currentLod() { return this.lastPlan; }
}
