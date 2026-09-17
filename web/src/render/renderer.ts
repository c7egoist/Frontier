/**
 * The render half of the frame: sky + ocean mesh + screen-space fluid + post.
 *
 * Pass order and why:
 *   1. sky + mesh   -- one pass, sky first with depth writes off. The mesh is two draws of the same
 *                      module with different overrides: a displaced near grid, and a flat far grid
 *                      whose normals come from the far height field (at kilometres the swell is
 *                      sub-pixel, so displacing it would only alias).
 *   2. fluid splat  -- thickness (additive, no depth test: a cluster must read as thick) and depth
 *                      (nearest front surface, resolved by a real depth attachment).
 *   3. NRF          -- three compute dispatches ping-ponging two r32float intermediates.
 *   4. fluid shade  -- full screen, hidden behind the scene depth where the mesh is nearer,
 *                      composited over sceneColor with premultiplied alpha.
 *   5. post         -- ACES + debug views to the canvas.
 *
 * Every pipeline binds the same group(0) parameter block as the simulation, so per-frame values are
 * written in exactly one place (OceanSim.writeUniforms + main.ts).
 */

import type { DerivedConfig, OceanPreset } from '@/core/params';
import { shader } from '@/sim/shaders';

export interface RenderInputs {
  nearField: GPUTexture;
  farField: GPUTexture;
  /** MPM particle buffer: `{ position: vec4 (world xyz + radius), velocity: vec4 (xyz + speed) }`. */
  particles: GPUBuffer;
}

export class Renderer {
  private readonly samplers: { linear: GPUSampler; nearest: GPUSampler };
  private readonly skyP: GPURenderPipeline;
  private readonly meshNearP: GPURenderPipeline;
  private readonly meshFarP: GPURenderPipeline;
  private readonly splatThicknessP: GPURenderPipeline;
  private readonly splatDepthP: GPURenderPipeline;
  private readonly fluidShadeP: GPURenderPipeline;
  private readonly postP: GPURenderPipeline;
  private readonly nrfH: GPUComputePipeline;
  private readonly nrfV: GPUComputePipeline;
  private readonly nrfClean: GPUComputePipeline;
  private readonly fieldLayout: GPUBindGroupLayout;
  private readonly fluidLayout: GPUBindGroupLayout;
  private readonly nrfLayout: GPUBindGroupLayout;

  private oceanBG!: GPUBindGroup;
  private postBG!: GPUBindGroup;
  private fluidBG!: GPUBindGroup;
  private nrfBGH!: GPUBindGroup;
  private nrfBGV!: GPUBindGroup;
  private nrfBGClean!: GPUBindGroup;

  private readonly indexBuffer: GPUBuffer;
  private readonly indexCount: number;

  private width = 0;
  private height = 0;

  sceneColor!: GPUTexture;
  sceneDepth!: GPUTexture;
  particleDepth!: GPUTexture;
  particleThickness!: GPUTexture;
  splatDepth!: GPUTexture;
  nrfA!: GPUTexture;
  nrfB!: GPUTexture;

  constructor(
    private readonly device: GPUDevice,
    paramsLayout: GPUBindGroupLayout,
    private readonly params: GPUBindGroup,
    private readonly cfg: DerivedConfig,
    private readonly preset: OceanPreset,
    private readonly canvasFormat: GPUTextureFormat,
    private readonly canvasView: () => GPUTextureView,
    private readonly inputs: RenderInputs,
  ) {
    this.samplers = {
      linear: device.createSampler({ label: 'render-linear', magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
      nearest: device.createSampler({ label: 'render-nearest', magFilter: 'nearest', minFilter: 'nearest', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
    };

    // --- bind group layouts (group 1; group 0 is the shared parameter block) --------------------
    const t = (binding: number, sampleType: GPUTextureSampleType, stage = GPUShaderStage.FRAGMENT): GPUBindGroupLayoutEntry => ({
      binding,
      visibility: stage,
      texture: { sampleType, viewDimension: '2d' },
    });
    this.fieldLayout = device.createBindGroupLayout({
      label: 'ocean-fields',
      entries: [t(0, 'float'), t(1, 'float'), { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }],
    });
    this.fluidLayout = device.createBindGroupLayout({
      label: 'fluid',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        t(1, 'float'),
        t(2, 'depth'),
        t(3, 'float'),
        t(4, 'float'),
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        t(6, 'unfilterable-float'),
      ],
    });
    this.nrfLayout = device.createBindGroupLayout({
      label: 'nrf',
      entries: [t(0, 'unfilterable-float', GPUShaderStage.COMPUTE), { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'r32float', viewDimension: '2d' } }],
    });

    // --- pipelines ------------------------------------------------------------------------------
    const ocean = device.createShaderModule({ label: 'ocean', code: shader('render/ocean.wgsl') });
    const fluid = device.createShaderModule({ label: 'fluid', code: shader('render/fluid.wgsl') });
    const nrf = device.createShaderModule({ label: 'nrf', code: shader('render/nrf.wgsl') });
    const post = device.createShaderModule({ label: 'post', code: shader('render/post.wgsl') });

    const depthStencil = (write: boolean, compare: GPUCompareFunction): GPUDepthStencilState => ({
      format: 'depth32float',
      depthWriteEnabled: write,
      depthCompare: compare,
    });
    const meshLayout = device.createPipelineLayout({ bindGroupLayouts: [paramsLayout, this.fieldLayout] });
    const fluidPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [paramsLayout, this.fluidLayout] });
    const color = (format: GPUTextureFormat, blend?: GPUBlendState): GPUColorTargetState => ({ format, blend });

    this.skyP = device.createRenderPipeline({
      label: 'sky',
      layout: meshLayout,
      vertex: { module: ocean, entryPoint: 'skyVs' },
      fragment: { module: ocean, entryPoint: 'skyFs', targets: [color('rgba16float')] },
      primitive: { topology: 'triangle-list' },
      depthStencil: depthStencil(false, 'always'),
    });

    // Near grid: displaced geometry over the fine layer's domain (meshRes * 2 * sweDx / 2 ~ radius).
    this.meshNearP = device.createRenderPipeline({
      label: 'mesh-near',
      layout: meshLayout,
      vertex: {
        module: ocean,
        entryPoint: 'vs',
        constants: {
          gridDim: this.preset.meshRes,
          halfExtent: this.preset.meshRes * this.cfg.swe.dx,
          displaced: 1,
          displacementFade: 0.78,
        },
      },
      fragment: { module: ocean, entryPoint: 'fs', targets: [color('rgba16float')] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthStencil(true, 'less'),
    });
    const farSpacing = Math.max(24, (this.cfg.farSize * 0.55) / this.preset.meshRes);
    this.meshFarP = device.createRenderPipeline({
      label: 'mesh-far',
      layout: meshLayout,
      vertex: {
        module: ocean,
        entryPoint: 'vs',
        constants: { gridDim: this.preset.meshRes, halfExtent: (this.preset.meshRes * farSpacing) / 2, displaced: 0, displacementFade: 1 },
      },
      fragment: { module: ocean, entryPoint: 'fs', targets: [color('rgba16float')] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: depthStencil(true, 'less'),
    });

    const additive: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    };
    const premultiplied: GPUBlendState = {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.splatThicknessP = device.createRenderPipeline({
      label: 'fluid-thickness',
      layout: fluidPipelineLayout,
      vertex: { module: fluid, entryPoint: 'vsSplat' },
      fragment: { module: fluid, entryPoint: 'fsThickness', targets: [color('rgba16float', additive)] },
      primitive: { topology: 'triangle-strip', cullMode: 'none' },
    });
    this.splatDepthP = device.createRenderPipeline({
      label: 'fluid-depth',
      layout: fluidPipelineLayout,
      vertex: { module: fluid, entryPoint: 'vsSplat' },
      fragment: { module: fluid, entryPoint: 'fsSurface', targets: [color('r32float')] },
      primitive: { topology: 'triangle-strip', cullMode: 'none' },
      depthStencil: depthStencil(true, 'less'),
    });
    this.fluidShadeP = device.createRenderPipeline({
      label: 'fluid-shade',
      layout: fluidPipelineLayout,
      vertex: { module: fluid, entryPoint: 'vsFull' },
      fragment: { module: fluid, entryPoint: 'fsShade', targets: [color('rgba16float', premultiplied)] },
      primitive: { topology: 'triangle-list' },
    });

    this.postP = device.createRenderPipeline({
      label: 'post',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          paramsLayout,
          device.createBindGroupLayout({
            entries: [t(0, 'float'), t(1, 'float'), t(2, 'float'), { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }],
          }),
        ],
      }),
      vertex: { module: ocean, entryPoint: 'skyVs' },
      fragment: { module: post, entryPoint: 'fs', targets: [color(this.canvasFormat)] },
      primitive: { topology: 'triangle-list' },
    });

    const nrfPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [paramsLayout, this.nrfLayout] });
    const nrfPipeline = (entryPoint: string, label: string) =>
      device.createComputePipeline({ label, layout: nrfPipelineLayout, compute: { module: nrf, entryPoint } });
    this.nrfH = nrfPipeline('horizontal', 'nrf-horizontal');
    this.nrfV = nrfPipeline('vertical', 'nrf-vertical');
    this.nrfClean = nrfPipeline('cleanup', 'nrf-cleanup');

    // --- one grid index buffer, used by both mesh draws -----------------------------------------
    const n = this.preset.meshRes;
    const indices = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const a = y * n + x;
        indices[k++] = a;
        indices[k++] = a + n;
        indices[k++] = a + 1;
        indices[k++] = a + 1;
        indices[k++] = a + n;
        indices[k++] = a + n + 1;
      }
    }
    this.indexBuffer = device.createBuffer({ label: 'mesh-indices', size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.indexBuffer, 0, indices);
    this.indexCount = indices.length;

    this.resize(8, 8);
    this.refreshBindGroups();
  }

  /**
   * Allocates the render targets. The canvas backing store is expected to be set to the *render*
   * size, so the browser performs the upscale and `P.resolution` stays truthful in every shader.
   */
  resize(width: number, height: number): void {
    const w = Math.max(8, Math.floor(width));
    const h = Math.max(8, Math.floor(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    const size: GPUExtent3D = { width: w, height: h };
    const color: GPUTextureUsageFlags = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    const storage: GPUTextureUsageFlags = color | GPUTextureUsage.STORAGE_BINDING;
    const make = (label: string, format: GPUTextureFormat, usage: GPUTextureUsageFlags) => this.device.createTexture({ label, size, format, usage });
    for (const tex of [this.sceneColor, this.sceneDepth, this.particleDepth, this.particleThickness, this.splatDepth, this.nrfA, this.nrfB]) tex?.destroy();
    this.sceneColor = make('scene-color', 'rgba16float', color);
    this.sceneDepth = make('scene-depth', 'depth32float', GPUTextureUsage.RENDER_ATTACHMENT);
    this.particleDepth = make('particle-depth', 'r32float', storage);
    this.particleThickness = make('particle-thickness', 'rgba16float', color);
    this.splatDepth = make('splat-depth', 'depth32float', GPUTextureUsage.RENDER_ATTACHMENT);
    this.nrfA = make('nrf-a', 'r32float', storage);
    this.nrfB = make('nrf-b', 'r32float', storage);
    if (this.fluidBG) this.refreshBindGroups();
  }

  private refreshBindGroups(): void {
    const view = (tex: GPUTexture) => tex.createView();
    this.oceanBG = this.device.createBindGroup({
      label: 'ocean-fields',
      layout: this.fieldLayout,
      entries: [
        { binding: 0, resource: view(this.inputs.nearField) },
        { binding: 1, resource: view(this.inputs.farField) },
        { binding: 2, resource: this.samplers.linear },
      ],
    });
    this.postBG = this.device.createBindGroup({
      label: 'post',
      layout: this.postP.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: view(this.sceneColor) },
        { binding: 1, resource: view(this.inputs.nearField) },
        { binding: 2, resource: view(this.inputs.farField) },
        { binding: 3, resource: this.samplers.linear },
      ],
    });
    this.fluidBG = this.device.createBindGroup({
      label: 'fluid',
      layout: this.fluidLayout,
      entries: [
        { binding: 0, resource: { buffer: this.inputs.particles } },
        { binding: 1, resource: view(this.sceneColor) },
        { binding: 2, resource: view(this.sceneDepth) },
        { binding: 3, resource: view(this.particleDepth) },
        { binding: 4, resource: view(this.particleThickness) },
        { binding: 5, resource: this.samplers.linear },
        { binding: 6, resource: view(this.nrfA) },
      ],
    });
    this.nrfBGH = this.device.createBindGroup({ layout: this.nrfLayout, entries: [{ binding: 0, resource: view(this.particleDepth) }, { binding: 1, resource: view(this.nrfA) }] });
    this.nrfBGV = this.device.createBindGroup({ layout: this.nrfLayout, entries: [{ binding: 0, resource: view(this.nrfA) }, { binding: 1, resource: view(this.nrfB) }] });
    this.nrfBGClean = this.device.createBindGroup({ layout: this.nrfLayout, entries: [{ binding: 0, resource: view(this.nrfB) }, { binding: 1, resource: view(this.nrfA) }] });
  }

  get renderSize(): [number, number] {
    return [this.width, this.height];
  }

  /** Render-target bytes, for the HUD. */
  get bytes(): number {
    return this.width * this.height * (8 + 4 + 4 + 8 + 4 + 4 + 4);
  }

  frame(encoder: GPUCommandEncoder, opts: { fluid: boolean; particleCount: number }): void {
    const drawFluid = opts.fluid && opts.particleCount > 0;

    if (drawFluid) {
      const thickness = encoder.beginRenderPass({
        label: 'fluid-thickness',
        colorAttachments: [{ view: this.particleThickness.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      });
      thickness.setPipeline(this.splatThicknessP);
      thickness.setBindGroup(0, this.params);
      thickness.setBindGroup(1, this.fluidBG);
      thickness.draw(4, opts.particleCount);
      thickness.end();

      const depth = encoder.beginRenderPass({
        label: 'fluid-depth',
        colorAttachments: [{ view: this.particleDepth.createView(), clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: this.splatDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      });
      depth.setPipeline(this.splatDepthP);
      depth.setBindGroup(0, this.params);
      depth.setBindGroup(1, this.fluidBG);
      depth.draw(4, opts.particleCount);
      depth.end();

      const gx = Math.ceil(this.width / 8);
      const gy = Math.ceil(this.height / 8);
      const nrf = encoder.beginComputePass({ label: 'nrf' });
      for (const [pipeline, group] of [
        [this.nrfH, this.nrfBGH],
        [this.nrfV, this.nrfBGV],
        [this.nrfClean, this.nrfBGClean],
      ] as const) {
        nrf.setPipeline(pipeline);
        nrf.setBindGroup(0, this.params);
        nrf.setBindGroup(1, group);
        nrf.dispatchWorkgroups(gx, gy);
      }
      nrf.end();
    }

    const scene = encoder.beginRenderPass({
      label: 'sky+mesh',
      colorAttachments: [{ view: this.sceneColor.createView(), clearValue: { r: 0.02, g: 0.05, b: 0.1, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.sceneDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    scene.setBindGroup(0, this.params);
    scene.setBindGroup(1, this.oceanBG);
    scene.setIndexBuffer(this.indexBuffer, 'uint32');
    scene.setPipeline(this.skyP);
    scene.draw(3);
    scene.setPipeline(this.meshNearP);
    scene.drawIndexed(this.indexCount);
    scene.setPipeline(this.meshFarP);
    scene.drawIndexed(this.indexCount);
    scene.end();

    if (drawFluid) {
      const shade = encoder.beginRenderPass({
        label: 'fluid-shade',
        colorAttachments: [{ view: this.sceneColor.createView(), loadOp: 'load', storeOp: 'store' }],
      });
      shade.setPipeline(this.fluidShadeP);
      shade.setBindGroup(0, this.params);
      shade.setBindGroup(1, this.fluidBG);
      shade.draw(3);
      shade.end();
    }

    const post = encoder.beginRenderPass({
      label: 'post',
      colorAttachments: [{ view: this.canvasView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    });
    post.setPipeline(this.postP);
    post.setBindGroup(0, this.params);
    post.setBindGroup(1, this.postBG);
    post.draw(3);
    post.end();
  }
}
