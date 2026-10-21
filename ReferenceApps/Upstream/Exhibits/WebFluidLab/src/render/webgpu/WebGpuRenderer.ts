import renderCommonWgsl from "./shaders/renderCommon.wgsl?raw";
import sceneWgsl from "./shaders/scene.wgsl?raw";
import particlesWgsl from "./shaders/particles.wgsl?raw";
import blitWgsl from "./shaders/blit.wgsl?raw";
import { boxMesh, planeMesh, sphereMesh, type Mesh } from "../../scene/Geometry.ts";
import { buildCameraUniform, CAMERA_UNIFORM_FLOATS } from "../../scene/CameraUniform.ts";
import type { OrbitCamera } from "../../scene/OrbitCamera.ts";
import type { GpuSolver } from "../../sim/gpu/GpuSolver.ts";
import type { ColliderSpec, ViewMode } from "../../types.ts";
import { TANK_HALF_EXTENT } from "../../colliders.ts";

interface SceneObject {
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  model: Float32Array;
  color: [number, number, number, number];
  roughness: [number, number];
  spin: number;
  baseY: number;
  baseRotY: number;
}

const mat4Identity = (): Float32Array =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function composeTRS(px: number, py: number, pz: number, rotY: number): Float32Array {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  // Column-major 4x4: rotation about Y combined with translation.
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    px, py, pz, 1,
  ]);
}

export class WebGpuRenderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private canvas: HTMLCanvasElement;

  private colorTex: GPUTexture | null = null;
  private depthTex: GPUTexture | null = null;
  private internalW = 0;
  private internalH = 0;

  private cameraBuffer: GPUBuffer;
  private sceneBindGroupLayout!: GPUBindGroupLayout;
  private scenePipeline!: GPURenderPipeline;
  private particlePipelineLayout!: GPUPipelineLayout;
  private particlePipeline!: GPURenderPipeline;
  private particleBindGroup: GPUBindGroup | null = null;
  private blitPipeline!: GPURenderPipeline;
  private blitSampler: GPUSampler;
  private objectBindGroupLayout!: GPUBindGroupLayout;

  private objects: SceneObject[] = [];

  constructor(canvas: HTMLCanvasElement, device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = format;

    this.cameraBuffer = device.createBuffer({
      label: "camera-uniform",
      size: CAMERA_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.blitSampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });

    this.buildPipelines();
    this.buildStaticScene();
  }

  private buildPipelines() {
    const device = this.device;
    const common = renderCommonWgsl as string;

    this.sceneBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });
    this.objectBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });

    const sceneLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.sceneBindGroupLayout, this.objectBindGroupLayout],
    });
    const sceneModule = device.createShaderModule({ code: common + "\n" + sceneWgsl });
    this.scenePipeline = device.createRenderPipeline({
      label: "scene-pipeline",
      layout: sceneLayout,
      vertex: {
        module: sceneModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 6 * 4,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
            ],
          },
        ],
      },
      fragment: {
        module: sceneModule,
        entryPoint: "fs_main",
        targets: [{ format: "rgba16float" }],
      },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });

    const particleBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      ],
    });
    this.particlePipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.sceneBindGroupLayout, particleBindGroupLayout],
    });
    const particleModule = device.createShaderModule({ code: common + "\n" + particlesWgsl });
    this.particlePipeline = device.createRenderPipeline({
      label: "particle-pipeline",
      layout: this.particlePipelineLayout,
      vertex: { module: particleModule, entryPoint: "vs_main" },
      fragment: {
        module: particleModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: "rgba16float",
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });

    const blitBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const blitLayout = device.createPipelineLayout({ bindGroupLayouts: [blitBindGroupLayout] });
    const blitModule = device.createShaderModule({ code: blitWgsl as string });
    this.blitPipeline = device.createRenderPipeline({
      label: "blit-pipeline",
      layout: blitLayout,
      vertex: { module: blitModule, entryPoint: "vs_main" },
      fragment: { module: blitModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
      primitive: { topology: "triangle-list" },
    });
    this.blitBindGroupLayout = blitBindGroupLayout;
  }

  private blitBindGroupLayout!: GPUBindGroupLayout;

  private addObject(mesh: Mesh, color: [number, number, number, number], roughness: [number, number]) {
    const device = this.device;
    const vertexBuffer = device.createBuffer({
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(mesh.vertices);
    vertexBuffer.unmap();

    const indexBuffer = device.createBuffer({
      size: Math.ceil(mesh.indices.byteLength / 4) * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Uint16Array(indexBuffer.getMappedRange()).set(mesh.indices);
    indexBuffer.unmap();

    const uniformBuffer = device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = device.createBindGroup({
      layout: this.objectBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const obj: SceneObject = {
      vertexBuffer,
      indexBuffer,
      indexCount: mesh.indices.length,
      uniformBuffer,
      bindGroup,
      model: mat4Identity(),
      color,
      roughness,
      spin: 0,
      baseY: 0,
      baseRotY: 0,
    };
    this.objects.push(obj);
    return obj;
  }

  private buildStaticScene() {
    // Floor
    const floor = this.addObject(planeMesh(TANK_HALF_EXTENT[0] + 0.15, TANK_HALF_EXTENT[2] + 0.15), [0.14, 0.14, 0.17, 1], [0.75, 0.3]);
    floor.model = composeTRS(0, 0, 0, 0);

    // Corner posts to frame the tank without needing alpha-sorted glass.
    const postH = TANK_HALF_EXTENT[1] * 2;
    const postMesh = boxMesh(0.035, postH * 0.5, 0.035);
    const corners: [number, number][] = [
      [-TANK_HALF_EXTENT[0], -TANK_HALF_EXTENT[2]],
      [TANK_HALF_EXTENT[0], -TANK_HALF_EXTENT[2]],
      [-TANK_HALF_EXTENT[0], TANK_HALF_EXTENT[2]],
      [TANK_HALF_EXTENT[0], TANK_HALF_EXTENT[2]],
    ];
    for (const [x, z] of corners) {
      const post = this.addObject(postMesh, [0.55, 0.58, 0.63, 1], [0.35, 0.6]);
      post.model = composeTRS(x, postH * 0.5, z, 0);
    }
  }

  private colliderObjects: SceneObject[] = [];

  setColliders(colliders: ColliderSpec[]) {
    for (const o of this.colliderObjects) {
      o.vertexBuffer.destroy();
      o.indexBuffer.destroy();
      o.uniformBuffer.destroy();
    }
    this.colliderObjects = [];
    for (const c of colliders) {
      let mesh: Mesh;
      if (c.kind === "sphere") mesh = sphereMesh(c.size[0]);
      else mesh = boxMesh(c.size[0], c.size[1], c.size[2]);
      const obj = this.addObject(mesh, [c.color[0], c.color[1], c.color[2], 1], [0.4, 0.5]);
      obj.model = composeTRS(c.position[0], c.position[1], c.position[2], c.rotationY);
      obj.spin = c.spinSpeed;
      obj.baseY = c.position[1];
      obj.baseRotY = c.rotationY;
      this.colliderObjects.push(obj);
      this.objects.push(obj);
    }
  }

  setParticleSource(solver: GpuSolver) {
    this.particleBindGroup = this.device.createBindGroup({
      layout: this.particlePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: solver.particleBuffer } },
        { binding: 1, resource: { buffer: solver.materialBuffer } },
      ],
    });
  }

  private ensureTargets(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.internalW && h === this.internalH && this.colorTex) return;
    this.internalW = w;
    this.internalH = h;
    this.colorTex?.destroy();
    this.depthTex?.destroy();
    this.colorTex = this.device.createTexture({
      size: [w, h],
      format: "rgba16float",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.depthTex = this.device.createTexture({
      size: [w, h],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  render(opts: {
    camera: OrbitCamera;
    renderScale: number;
    viewMode: ViewMode;
    activeCount: number;
    time: number;
  }) {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = Math.max(1, Math.round(rect.width * dpr));
    const displayH = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== displayW || this.canvas.height !== displayH) {
      this.canvas.width = displayW;
      this.canvas.height = displayH;
    }
    this.ensureTargets(displayW * opts.renderScale, displayH * opts.renderScale);

    const aspect = displayW / displayH;
    const proj = opts.camera.projMatrixZeroToOne(aspect);
    const cameraData = buildCameraUniform(opts.camera, aspect, proj, opts.time);
    this.device.queue.writeBuffer(this.cameraBuffer, 0, cameraData);

    for (const obj of this.colliderObjects) {
      if (obj.spin !== 0) {
        const angle = obj.baseRotY + obj.spin * opts.time;
        obj.model = composeTRS(obj.model[12], obj.baseY, obj.model[14], angle);
      }
    }
    for (const obj of this.objects) {
      const u = new Float32Array(24);
      u.set(obj.model, 0);
      u.set(obj.color, 16);
      u.set([obj.roughness[0], obj.roughness[1], 0, 0], 20);
      this.device.queue.writeBuffer(obj.uniformBuffer, 0, u);
    }

    const sceneBindGroup = this.device.createBindGroup({
      layout: this.sceneBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }],
    });

    const encoder = this.device.createCommandEncoder({ label: "frame" });
    const colorView = this.colorTex!.createView();
    const depthView = this.depthTex!.createView();

    const scenePass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: 0.03, g: 0.035, b: 0.05, a: 1 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    scenePass.setPipeline(this.scenePipeline);
    scenePass.setBindGroup(0, sceneBindGroup);
    for (const obj of this.objects) {
      scenePass.setBindGroup(1, obj.bindGroup);
      scenePass.setVertexBuffer(0, obj.vertexBuffer);
      scenePass.setIndexBuffer(obj.indexBuffer, "uint16");
      scenePass.drawIndexed(obj.indexCount);
    }
    scenePass.end();

    if ((opts.viewMode === "particles" || opts.viewMode === "both") && this.particleBindGroup && opts.activeCount > 0) {
      const particlePass = encoder.beginRenderPass({
        colorAttachments: [{ view: colorView, loadOp: "load", storeOp: "store" }],
        depthStencilAttachment: { view: depthView, depthLoadOp: "load", depthStoreOp: "store" },
      });
      particlePass.setPipeline(this.particlePipeline);
      particlePass.setBindGroup(0, sceneBindGroup);
      particlePass.setBindGroup(1, this.particleBindGroup);
      particlePass.draw(6, opts.activeCount);
      particlePass.end();
    }

    const blitBindGroup = this.device.createBindGroup({
      layout: this.blitBindGroupLayout,
      entries: [
        { binding: 0, resource: colorView },
        { binding: 1, resource: this.blitSampler },
      ],
    });
    const swapView = this.context.getCurrentTexture().createView();
    const blitPass = encoder.beginRenderPass({
      colorAttachments: [{ view: swapView, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }],
    });
    blitPass.setPipeline(this.blitPipeline);
    blitPass.setBindGroup(0, blitBindGroup);
    blitPass.draw(3);
    blitPass.end();

    this.device.queue.submit([encoder.finish()]);
  }
}
