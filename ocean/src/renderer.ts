import { OceanSim } from './sim';
import { Tier, NEAR, NEAR_FINE_RES, waveSpeed } from './tiers';
import { SKY, WATER, MINIMAP } from './shaders/water';
import { SPRAY_RENDER } from './shaders/spray';

const FRAME_UNIFORMS_FLOATS = 68;
const FRAME_UNIFORMS_BYTES = FRAME_UNIFORMS_FLOATS * 4;

export interface RenderArgs {
  sim: OceanSim;
  viewProj: Float32Array;
  invViewProj: Float32Array;
  camPos: [number, number, number];
  camRight: [number, number, number];
  camUp: [number, number, number];
  time: number;
  sun: [number, number, number];
  tier: Tier;
  waveview: boolean;
  minimap: boolean;
  spray: boolean;
  windPhase: number;
  foamGain: number;
  meshOrigin: [number, number];
}

// Radial LOD disc: center fan + exponential rings, 12 km to the horizon.
function buildOceanMesh(rings = 88, segs = 140, maxR = 13000): {
  verts: Float32Array; indices: Uint32Array; count: number;
} {
  const positions: number[] = [0, 0];
  const ringStart = (k: number) => 1 + k * segs;
  for (let k = 1; k <= rings; k++) {
    const r = maxR * Math.pow(k / rings, 3.4);
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      positions.push(r * Math.cos(a), r * Math.sin(a));
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < segs; j++) {
    indices.push(0, ringStart(0) + j, ringStart(0) + (j + 1) % segs);
  }
  for (let k = 0; k < rings - 1; k++) {
    for (let j = 0; j < segs; j++) {
      const j2 = (j + 1) % segs;
      const a = ringStart(k) + j, b = ringStart(k) + j2;
      const c = ringStart(k + 1) + j, d = ringStart(k + 1) + j2;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    verts: new Float32Array(positions),
    indices: new Uint32Array(indices),
    count: indices.length,
  };
}

export class Renderer {
  private skyPipe: GPURenderPipeline;
  private waterPipe: GPURenderPipeline;
  private sprayPipe: GPURenderPipeline;
  private minimapPipe: GPURenderPipeline;
  private skyLayout: GPUBindGroupLayout;
  private waterLayout: GPUBindGroupLayout;
  private sprayLayout: GPUBindGroupLayout;
  private minimapLayout: GPUBindGroupLayout;
  private frameUB: GPUBuffer;
  private meshVB: GPUBuffer;
  private meshIB: GPUBuffer;
  private meshCount: number;
  private depthTex: GPUTexture | null = null;
  private sampRepeat: GPUSampler;
  private sampClamp: GPUSampler;
  width = 1; height = 1;

  private wb = (buf: GPUBuffer, data: Float32Array | Uint32Array): void => {
    this.device.queue.writeBuffer(buf, 0, data as unknown as GPUAllowSharedBufferSource);
  };

  constructor(private device: GPUDevice, private format: GPUTextureFormat) {
    const F = GPUShaderStage.FRAGMENT, V = GPUShaderStage.VERTEX;
    this.frameUB = device.createBuffer({
      size: FRAME_UNIFORMS_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampRepeat = device.createSampler({
      addressModeU: 'repeat', addressModeV: 'repeat',
      magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear',
    });
    this.sampClamp = device.createSampler({
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
      magFilter: 'linear', minFilter: 'linear',
    });

    this.skyLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: F | V, buffer: { type: 'uniform' } }],
    });
    this.waterLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F | V, buffer: { type: 'uniform' } },
        { binding: 1, visibility: F | V, texture: { sampleType: 'float' } },
        { binding: 2, visibility: F | V, texture: { sampleType: 'float' } },
        { binding: 3, visibility: F | V, texture: { sampleType: 'float' } },
        { binding: 4, visibility: F | V, sampler: { type: 'filtering' } },
      ],
    });
    this.sprayLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F | V, buffer: { type: 'uniform' } },
        { binding: 1, visibility: V, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: V, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.minimapLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, buffer: { type: 'uniform' } },
        { binding: 1, visibility: F, texture: { sampleType: 'float' } },
        { binding: 2, visibility: F, sampler: { type: 'filtering' } },
        { binding: 3, visibility: F, buffer: { type: 'read-only-storage' } },
      ],
    });

    const mkRender = (
      code: string, layout: GPUBindGroupLayout, vertex: { buffers?: GPUVertexBufferLayout[] },
      blend: GPUBlendState | undefined, depthWrite: boolean, depthCompare: GPUCompareFunction = 'less',
    ): GPURenderPipeline => {
      const module = device.createShaderModule({ code });
      return device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: { ...vertex, module, entryPoint: 'vs' },
        fragment: {
          module, entryPoint: 'fs',
          targets: [{
            format,
            blend: blend ?? { color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' } },
          }],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: depthWrite,
          depthCompare,
        },
      });
    };

    const emptyVB = { buffers: [] as GPUVertexBufferLayout[] };
    this.skyPipe = mkRender(SKY, this.skyLayout, emptyVB, undefined, false, 'always');

    this.meshCount = 0;
    const mesh = buildOceanMesh();
    this.meshVB = device.createBuffer({ size: mesh.verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.meshIB = device.createBuffer({ size: mesh.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    this.wb(this.meshVB, mesh.verts);
    this.wb(this.meshIB, mesh.indices);
    this.meshCount = mesh.count;
    const waterVB: { buffers: GPUVertexBufferLayout[] } = {
      buffers: [{
        arrayStride: 8,
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
      }],
    };
    this.waterPipe = mkRender(WATER, this.waterLayout, waterVB, undefined, true);
    this.waterPipe = this.waterPipe; // keep tsc quiet about conditional reassign

    const sprayModulePatch = (pipe: GPURenderPipeline): GPURenderPipeline => pipe;
    void sprayModulePatch;
    this.sprayPipe = mkRender(SPRAY_RENDER, this.sprayLayout, emptyVB, {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    }, false);

    this.minimapPipe = mkRender(MINIMAP, this.minimapLayout, emptyVB, undefined, false);
  }

  // Offscreen probe target for GPU smoke tests (?probe=1): renders the same
  // passes into a COPY_SRC texture so pixels can be read back on the CPU.
  makeProbe(w = 256, h = 144): { tex: GPUTexture; view: GPUTextureView; buf: GPUBuffer; bytesPerRow: number } {
    const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
    const tex = this.device.createTexture({
      size: [w, h],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const buf = this.device.createBuffer({
      size: bytesPerRow * h,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    return { tex, view: tex.createView(), buf, bytesPerRow };
  }

  resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    this.width = Math.max(1, w); this.height = Math.max(1, h);
    this.depthTex?.destroy();
    this.depthTex = this.device.createTexture({
      size: [this.width, this.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  private packFrame(a: RenderArgs): Float32Array {
    const f = new Float32Array(FRAME_UNIFORMS_FLOATS);
    f.set(a.viewProj, 0);
    f.set(a.invViewProj, 16);
    f[32] = a.camPos[0]; f[33] = a.camPos[1]; f[34] = a.camPos[2]; f[35] = a.time;
    f[36] = a.sun[0]; f[37] = a.sun[1]; f[38] = a.sun[2]; f[39] = 0;
    f[40] = a.camRight[0]; f[41] = a.camRight[1]; f[42] = a.camRight[2]; f[43] = 0;
    f[44] = a.camUp[0]; f[45] = a.camUp[1]; f[46] = a.camUp[2]; f[47] = 0;
    const nearOS = a.sim.nearOrigin;
    f[48] = nearOS[0]; f[49] = nearOS[1]; f[50] = NEAR.size; f[51] = NEAR.size / NEAR_FINE_RES;
    const midOS = a.sim.midOrigin;
    f[52] = midOS[0]; f[53] = midOS[1]; f[54] = a.tier.mid.size; f[55] = a.tier.mid.size / a.tier.mid.res;
    const farCfg = a.tier.far ?? a.tier.mid;
    const farOS = a.sim.farOrigin;
    f[56] = farOS[0]; f[57] = farOS[1]; f[58] = farCfg.size; f[59] = farCfg.size / farCfg.res;
    // model origin is snapped to the coarse near cell in main.ts (passed via camPos-based origin)
    f[60] = a.meshOrigin[0]; f[61] = a.meshOrigin[1];
    f[62] = a.waveview ? 1 : 0;
    f[63] = a.tier.microOctaves;
    f[64] = a.tier.specPower;
    f[65] = a.tier.microOctaves >= 2 ? 0.16 : 0.09; // micro-normal strength
    f[66] = a.foamGain;
    f[67] = a.windPhase;
    return f;
  }

  render(e: GPUCommandEncoder, view: GPUTextureView, a: RenderArgs): void {
    const f = this.packFrame(a);
    this.wb(this.frameUB, f);

    const nearOS = a.sim.nearOrigin;
    const midOS = a.sim.midOrigin;
    const farCfg = a.tier.far ?? a.tier.mid;
    const farOS = a.sim.farOrigin;
    void nearOS; void midOS; void farOS; void farCfg;

    const bgSky = this.device.createBindGroup({
      layout: this.skyLayout,
      entries: [{ binding: 0, resource: { buffer: this.frameUB } }],
    });
    const bgWater = this.device.createBindGroup({
      layout: this.waterLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameUB } },
        { binding: 1, resource: a.sim.compView },
        { binding: 2, resource: a.sim.mid.viewCoarse },
        { binding: 3, resource: a.sim.far ? a.sim.far.viewCoarse : a.sim.mid.viewCoarse },
        { binding: 4, resource: this.sampRepeat },
      ],
    });
    const spray = a.sim.sprayBuffers;
    const bgSpray = this.device.createBindGroup({
      layout: this.sprayLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameUB } },
        { binding: 1, resource: { buffer: spray.pos } },
        { binding: 2, resource: { buffer: spray.vel } },
      ],
    });
    const bgMap = this.device.createBindGroup({
      layout: this.minimapLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameUB } },
        { binding: 1, resource: a.sim.compView },
        { binding: 2, resource: this.sampClamp },
        { binding: 3, resource: { buffer: a.sim.flagsBuf } },
      ],
    });

    const pass = e.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: { r: 0.05, g: 0.09, b: 0.15, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: this.depthTex ? {
        view: this.depthTex.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      } : undefined,
    });

    pass.setPipeline(this.skyPipe);
    pass.setBindGroup(0, bgSky);
    pass.draw(3);

    pass.setPipeline(this.waterPipe);
    pass.setBindGroup(0, bgWater);
    pass.setVertexBuffer(0, this.meshVB);
    pass.setIndexBuffer(this.meshIB, 'uint32');
    pass.drawIndexed(this.meshCount);

    if (a.spray && a.tier.sprayEnabled) {
      pass.setPipeline(this.sprayPipe);
      pass.setBindGroup(0, bgSpray);
      pass.draw(6, a.sim.sprayCap, 0, 0);
    }

    if (a.minimap) {
      pass.setPipeline(this.minimapPipe);
      pass.setBindGroup(0, bgMap);
      pass.draw(6);
    }

    pass.end();
  }
}
