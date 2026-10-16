import { getCameraBasis } from './scene.js';

const BUFFER_USAGE = globalThis.GPUBufferUsage;
const TEXTURE_USAGE = globalThis.GPUTextureUsage;
const SHADER_STAGE = globalThis.GPUShaderStage;
const MAX_INTERNAL_PIXELS = 300_000;
const GBUFFER_STRIDE = 80;
const RESERVOIR_STRIDE = 64;
const FRAME_BYTES = 288;

async function fetchShader(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Shader ${path} failed to load (${response.status})`);
  return response.text();
}

async function createShaderModule(device, label, code) {
  const module = device.createShaderModule({ label, code });
  if (typeof module.getCompilationInfo === 'function') {
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((message) => message.type === 'error');
    if (errors.length) {
      const detail = errors.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`).join('\n');
      throw new Error(`${label} WGSL compile failed:\n${detail}`);
    }
  }
  return module;
}

function alignTo(value, alignment) { return Math.ceil(value / alignment) * alignment; }

export function inspectAdapter(adapter, info = {}) {
  const parts = [info.description, info.device, info.architecture, info.vendor].filter(Boolean);
  const name = parts.find((part) => part && /[a-z0-9]/i.test(part)) || 'WebGPU adapter';
  const lower = parts.join(' ').toLowerCase();
  let tier = 'generic';
  if (/\brtx\b|geforce.*rtx/.test(lower)) tier = 'rtx';
  else if (/\bgtx\b|geforce.*(1060|1070|1080|1650|1660)/.test(lower)) tier = 'gtx';
  else if (/swiftshader|llvmpipe|software/.test(lower)) tier = 'software';
  return {
    name,
    tier,
    vendor: info.vendor || 'unknown',
    architecture: info.architecture || 'unreported',
    maxStorageBufferBindingSize: adapter.limits?.maxStorageBufferBindingSize || 128 * 1024 * 1024,
    supportsTimestampQuery: adapter.features?.has('timestamp-query') || false
  };
}

export async function requestWebGpuAdapter() {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser. Use a current Chromium-based browser over HTTPS to run the triangle compute renderer.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter was returned by the browser.');
  let info = adapter.info || {};
  if ((!info.description && !info.device) && typeof adapter.requestAdapterInfo === 'function') {
    try { info = await adapter.requestAdapterInfo(); } catch { /* adapter info is privacy-gated on some browsers */ }
  }
  return { adapter, info: inspectAdapter(adapter, info) };
}

export class RestirRenderer {
  constructor(canvas, statusCallback = () => {}) {
    this.canvas = canvas;
    this.statusCallback = statusCallback;
    this.device = null;
    this.context = null;
    this.canvasFormat = null;
    this.adapterInfo = null;
    this.scene = null;
    this.frameIndex = 0;
    this.historyValid = false;
    this.previousCameraBasis = null;
    this.currentGBufferIndex = 0;
    this.width = 0;
    this.height = 0;
    this.outputWidth = 0;
    this.outputHeight = 0;
    this.lastScene = null;
    this.lastSettings = null;
    this.buffers = {};
    this.bindings = [];
    this.pipelines = {};
    this.renderEnabled = false;
    this.error = null;
  }

  async initialize(scene) {
    this.scene = scene;
    this.statusCallback('Requesting a high-performance WebGPU adapter…', 0.08);
    const { adapter, info } = await requestWebGpuAdapter();
    this.adapterInfo = info;
    this.device = await adapter.requestDevice({ label: 'Frontier ReSTIR GI device' });
    this.device.addEventListener?.('uncapturederror', (event) => {
      this.error = event.error?.message || 'An uncaptured WebGPU error occurred.';
      this.statusCallback(this.error, -1);
    });
    this.device.lost.then((reason) => {
      if (!this.renderEnabled) return;
      this.renderEnabled = false;
      this.error = `WebGPU device lost: ${reason.message || reason.reason || 'unknown reason'}`;
      this.statusCallback(this.error, -1);
    });
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) throw new Error('The browser could not create a WebGPU canvas context.');
    this.context.configure({ device: this.device, format: this.canvasFormat, alphaMode: 'opaque' });

    this.statusCallback('Loading triangle traversal and reservoir kernels…', 0.2);
    await this.createLayouts();
    await this.createPipelines();
    this.statusCallback('Uploading triangle BLAS and scene records…', 0.54);
    this.createFrameBuffer();
    this.createSceneBuffers(scene);
    this.renderEnabled = true;
    return this.adapterInfo;
  }

  async createLayouts() {
    this.commonLayout = this.device.createBindGroupLayout({
      label: 'Frame + triangle-BVH scene layout',
      entries: [
        { binding: 0, visibility: SHADER_STAGE.COMPUTE | SHADER_STAGE.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } }
      ]
    });
    this.layouts = {
      gbuffer: this.device.createBindGroupLayout({
        label: 'G-buffer output layout',
        entries: [{ binding: 0, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'storage' } }]
      }),
      candidates: this.device.createBindGroupLayout({
        label: 'Initial candidate layout',
        entries: [
          { binding: 0, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'storage' } }
        ]
      }),
      temporal: this.device.createBindGroupLayout({
        label: 'Temporal reservoir layout',
        entries: [
          { binding: 0, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 3, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 4, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'storage' } }
        ]
      }),
      spatial: this.device.createBindGroupLayout({
        label: 'Spatial reservoir layout',
        entries: [
          { binding: 0, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'storage' } }
        ]
      }),
      resolve: this.device.createBindGroupLayout({
        label: 'GI resolve output layout',
        entries: [
          { binding: 0, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: SHADER_STAGE.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 2, visibility: SHADER_STAGE.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '2d' } }
        ]
      }),
      present: this.device.createBindGroupLayout({
        label: 'Edge-aware present layout',
        entries: [
          { binding: 0, visibility: SHADER_STAGE.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
          { binding: 1, visibility: SHADER_STAGE.FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 2, visibility: SHADER_STAGE.FRAGMENT, buffer: { type: 'read-only-storage' } }
        ]
      })
    };
  }

  async createPipelines() {
    const common = await fetchShader('/src/shaders/common.wgsl');
    const sources = await Promise.all([
      fetchShader('/src/shaders/gbuffer.wgsl'),
      fetchShader('/src/shaders/candidates.wgsl'),
      fetchShader('/src/shaders/temporal.wgsl'),
      fetchShader('/src/shaders/spatial.wgsl'),
      fetchShader('/src/shaders/resolve.wgsl'),
      fetchShader('/src/shaders/present.wgsl')
    ]);
    const labels = ['Primary G-buffer', 'Initial GI candidates', 'Temporal resampling', 'Spatial resampling', 'Reservoir resolve', 'Tone-map + denoise'];
    const modules = [];
    for (let index = 0; index < sources.length; index++) {
      modules.push(await createShaderModule(this.device, labels[index], `${common}\n${sources[index]}`));
    }
    const compute = (layout, module, label) => this.device.createComputePipeline({
      label,
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.commonLayout, layout] }),
      compute: { module, entryPoint: 'main' }
    });
    this.pipelines.gbuffer = compute(this.layouts.gbuffer, modules[0], 'Primary triangle G-buffer');
    this.pipelines.candidates = compute(this.layouts.candidates, modules[1], 'ReSTIR GI candidate generation');
    this.pipelines.temporal = compute(this.layouts.temporal, modules[2], 'ReSTIR GI temporal reservoir reuse');
    this.pipelines.spatial = compute(this.layouts.spatial, modules[3], 'ReSTIR GI spatial reservoir reuse');
    this.pipelines.resolve = compute(this.layouts.resolve, modules[4], 'Multi-bounce reservoir shading');

    this.presentPipeline = this.device.createRenderPipeline({
      label: 'Edge-aware tone-map presentation',
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.commonLayout, this.layouts.present] }),
      vertex: { module: modules[5], entryPoint: 'vertexMain' },
      fragment: { module: modules[5], entryPoint: 'fragmentMain', targets: [{ format: this.canvasFormat }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' }
    });
    this.linearSampler = this.device.createSampler({ label: 'GI resolve linear upscale', magFilter: 'linear', minFilter: 'linear' });
  }

  createSceneBuffers(scene) {
    const triangleBytes = scene.triangleData.byteLength;
    const sceneBytes = scene.sceneData.byteLength;
    this.triangleBuffer = this.device.createBuffer({
      label: 'Project-Drive triangle records', size: alignTo(triangleBytes, 4), usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST
    });
    this.sceneBuffer = this.device.createBuffer({
      label: 'Triangle BVH, instances, materials and lights', size: alignTo(sceneBytes, 4), usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST
    });
    this.device.queue.writeBuffer(this.triangleBuffer, 0, scene.triangleData);
    this.device.queue.writeBuffer(this.sceneBuffer, 0, scene.sceneData);
    this.scene = scene;
    this.commonBindGroup = this.device.createBindGroup({
      label: 'Shared frame and scene resources',
      layout: this.commonLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: { buffer: this.triangleBuffer } },
        { binding: 2, resource: { buffer: this.sceneBuffer } }
      ]
    });
  }

  createFrameBuffer() {
    this.frameBuffer = this.device.createBuffer({ label: 'Realtime frame constants', size: FRAME_BYTES, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
    if (this.commonLayout && this.triangleBuffer) {
      this.commonBindGroup = this.device.createBindGroup({
        label: 'Shared frame and scene resources',
        layout: this.commonLayout,
        entries: [
          { binding: 0, resource: { buffer: this.frameBuffer } },
          { binding: 1, resource: { buffer: this.triangleBuffer } },
          { binding: 2, resource: { buffer: this.sceneBuffer } }
        ]
      });
    }
  }

  resizeTargets(settings) {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const outputWidth = Math.max(2, Math.round(rect.width * pixelRatio));
    const outputHeight = Math.max(2, Math.round(rect.height * pixelRatio));
    if (this.canvas.width !== outputWidth || this.canvas.height !== outputHeight) {
      this.canvas.width = outputWidth;
      this.canvas.height = outputHeight;
    }
    const requestedScale = settings.renderScale;
    const cappedScale = Math.min(requestedScale, Math.sqrt(MAX_INTERNAL_PIXELS / (outputWidth * outputHeight)));
    const internalWidth = Math.max(8, alignTo(Math.round(outputWidth * cappedScale), 8));
    const internalHeight = Math.max(8, alignTo(Math.round(outputHeight * cappedScale), 8));
    const outputChanged = outputWidth !== this.outputWidth || outputHeight !== this.outputHeight;
    const targetChanged = internalWidth !== this.width || internalHeight !== this.height;
    if (!targetChanged && !outputChanged) return false;

    this.outputWidth = outputWidth;
    this.outputHeight = outputHeight;
    this.width = internalWidth;
    this.height = internalHeight;
    this.effectiveScale = Math.min(internalWidth / outputWidth, internalHeight / outputHeight);
    this.releaseTargets();
    const pixelCount = internalWidth * internalHeight;
    const makeBuffer = (label, size) => this.device.createBuffer({ label, size: alignTo(size, 4), usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST });
    this.gBufferBuffers = [
      makeBuffer('Current G-buffer history A', pixelCount * GBUFFER_STRIDE),
      makeBuffer('Previous G-buffer history B', pixelCount * GBUFFER_STRIDE)
    ];
    this.candidateBuffer = makeBuffer('Initial GI candidate reservoirs', pixelCount * RESERVOIR_STRIDE);
    this.temporalBuffer = makeBuffer('Temporally resampled GI reservoirs', pixelCount * RESERVOIR_STRIDE);
    this.spatialBuffer = makeBuffer('Spatiotemporally resampled GI reservoirs', pixelCount * RESERVOIR_STRIDE);
    this.lightingTexture = this.device.createTexture({
      label: 'HDR GI resolve', size: { width: internalWidth, height: internalHeight },
      format: 'rgba16float', usage: TEXTURE_USAGE.STORAGE_BINDING | TEXTURE_USAGE.TEXTURE_BINDING
    });
    this.lightingView = this.lightingTexture.createView();
    this.currentGBufferIndex = 0;
    this.historyValid = false;
    this.previousCameraBasis = null;
    this.createPassBindings();
    return true;
  }

  releaseTargets() {
    for (const buffer of this.gBufferBuffers || []) buffer.destroy();
    for (const buffer of [this.candidateBuffer, this.temporalBuffer, this.spatialBuffer]) buffer?.destroy();
    this.lightingTexture?.destroy();
  }

  createPassBindings() {
    this.bindings = [];
    for (let index = 0; index < 2; index++) {
      const current = this.gBufferBuffers[index];
      const previous = this.gBufferBuffers[1 - index];
      const make = (label, layout, entries) => this.device.createBindGroup({ label, layout, entries });
      const buffer = (binding, resource) => ({ binding, resource: { buffer: resource } });
      this.bindings[index] = {
        gbuffer: make(`G-buffer output ${index}`, this.layouts.gbuffer, [buffer(0, current)]),
        candidates: make(`Candidate generation ${index}`, this.layouts.candidates, [buffer(0, current), buffer(1, this.candidateBuffer)]),
        temporal: make(`Temporal resampling ${index}`, this.layouts.temporal, [
          buffer(0, current), buffer(1, previous), buffer(2, this.candidateBuffer), buffer(3, this.spatialBuffer), buffer(4, this.temporalBuffer)
        ]),
        spatial: make(`Spatial resampling ${index}`, this.layouts.spatial, [buffer(0, current), buffer(1, this.temporalBuffer), buffer(2, this.spatialBuffer)]),
        resolve: make(`GI resolve ${index}`, this.layouts.resolve, [
          buffer(0, current), buffer(1, this.spatialBuffer), { binding: 2, resource: this.lightingView }
        ]),
        present: make(`Presentation ${index}`, this.layouts.present, [
          { binding: 0, resource: this.lightingView }, { binding: 1, resource: this.linearSampler }, buffer(2, current)
        ])
      };
    }
  }

  resetHistory() {
    this.historyValid = false;
    this.previousCameraBasis = null;
  }

  writeFrameConstants(camera, settings, deltaSeconds) {
    const current = getCameraBasis(camera);
    const previous = this.previousCameraBasis || current;
    const storage = new ArrayBuffer(FRAME_BYTES);
    const floats = new Float32Array(storage);
    const uints = new Uint32Array(storage);
    const write4f = (offset, values) => floats.set(values, offset * 4);
    const write4u = (offset, values) => uints.set(values, offset * 4);
    write4f(0, [...current.position, 1]);
    write4f(1, [...current.forward, 0]);
    write4f(2, [...current.right, 0]);
    write4f(3, [...current.up, 0]);
    write4f(4, [...previous.position, 1]);
    write4f(5, [...previous.forward, 0]);
    write4f(6, [...previous.right, 0]);
    write4f(7, [...previous.up, 0]);
    write4u(8, [this.width, this.height, this.frameIndex >>> 0, this.scene.objectCount]);
    write4u(9, [settings.maxBounces, settings.initialCandidates, settings.maxHistoryM, settings.spatialTaps]);
    write4f(10, [Math.tan(camera.fovY * 0.5), this.width / this.height, settings.giStrength, settings.exposure]);
    write4f(11, [4.0, settings.fireflyClamp, settings.denoise ? 0.72 : 0.0, deltaSeconds]);
    write4u(12, [
      this.scene.offsets.nodeOffset, this.scene.offsets.indexOffset, this.scene.offsets.meshOffset, this.scene.offsets.objectOffset
    ]);
    write4u(13, [
      this.scene.offsets.materialOffset, this.scene.offsets.lightOffset, this.scene.lights.length, this.scene.materials.length
    ]);
    write4f(14, [-0.42, -0.32, 0.85, 1.25]);
    write4f(15, [1.0, 1.0, 1.0, 1.0]);
    write4u(16, [this.historyValid ? 1 : 0, settings.temporal ? 1 : 0, settings.spatial ? 1 : 0, settings.checkerboard ? 1 : 0]);
    write4u(17, [settings.mode >>> 0, settings.denoise ? 1 : 0, this.outputWidth, this.outputHeight]);
    this.device.queue.writeBuffer(this.frameBuffer, 0, storage);
    return current;
  }

  render(camera, settings, deltaSeconds = 1 / 60) {
    if (!this.renderEnabled || !this.device) return null;
    this.resizeTargets(settings);
    const dynamic = this.scene.updateObjectRecords();
    this.device.queue.writeBuffer(this.sceneBuffer, dynamic.byteOffset, dynamic.records);
    const cameraBasis = this.writeFrameConstants(camera, settings, deltaSeconds);
    const pixelGroupsX = Math.ceil(this.width / 8);
    const pixelGroupsY = Math.ceil(this.height / 8);
    const binding = this.bindings[this.currentGBufferIndex];
    const encoder = this.device.createCommandEncoder({ label: `ReSTIR GI frame ${this.frameIndex}` });
    const compute = (pipeline, extraGroup) => {
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, this.commonBindGroup);
      pass.setBindGroup(1, extraGroup);
      pass.dispatchWorkgroups(pixelGroupsX, pixelGroupsY);
      pass.end();
    };
    compute(this.pipelines.gbuffer, binding.gbuffer);
    compute(this.pipelines.candidates, binding.candidates);
    compute(this.pipelines.temporal, binding.temporal);
    compute(this.pipelines.spatial, binding.spatial);
    compute(this.pipelines.resolve, binding.resolve);

    const output = this.context.getCurrentTexture().createView();
    const renderPass = encoder.beginRenderPass({
      label: 'Upscale and display resolved GI',
      colorAttachments: [{ view: output, clearValue: { r: 0.025, g: 0.035, b: 0.04, a: 1 }, loadOp: 'clear', storeOp: 'store' }]
    });
    renderPass.setPipeline(this.presentPipeline);
    renderPass.setBindGroup(0, this.commonBindGroup);
    renderPass.setBindGroup(1, binding.present);
    renderPass.draw(3);
    renderPass.end();
    this.device.queue.submit([encoder.finish()]);

    this.previousCameraBasis = cameraBasis;
    this.historyValid = true;
    this.currentGBufferIndex = 1 - this.currentGBufferIndex;
    const frame = this.frameIndex++;
    return {
      frame,
      width: this.width,
      height: this.height,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
      effectiveScale: this.effectiveScale,
      backend: 'WEBGPU · TRIANGLE BVH',
      adapter: this.adapterInfo,
      scene: this.scene
    };
  }

  destroy() {
    this.renderEnabled = false;
    this.releaseTargets();
    this.triangleBuffer?.destroy();
    this.sceneBuffer?.destroy();
    this.frameBuffer?.destroy();
    this.device?.destroy();
  }
}
