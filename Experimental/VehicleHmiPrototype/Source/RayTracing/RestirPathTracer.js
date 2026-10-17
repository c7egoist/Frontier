// RestirPathTracer.js — full ReSTIR GI path tracer (WebGPU compute, two-level
// BVH over the game's real triangles). Per frame:
//   Generate (primary + direct NEE + initial GI candidate, multi-bounce path)
//   -> Temporal reservoir reuse -> Spatial reservoir reuse -> Resolve
//   (final visibility + BSDF shading + temporal accumulation) -> Present (ACES).
import { RayScene } from "./BvhBuilder.js";

const RES_BYTES = 64;
const UNIFORM_BYTES = 832;

export class RestirPathTracer {
  constructor(device, materialBuffer, canvasFormat = "bgra8unorm") {
    this.device = device;
    this.materialBuffer = materialBuffer;
    this.canvasFormat = canvasFormat;
    this.parity = 0;
    this.ready = false;
  }

  async init(scene) {
    const d = this.device;
    this.rayScene = new RayScene(scene);
    const load = async (name) => (await (await fetch(`Shader/${name}`)).text());
    const common = await load("RayCommon.wgsl");
    const [gen, tmp, spa, res, pre] = await Promise.all([
      load("RayGenerate.wgsl"), load("RayReservoirTemporal.wgsl"),
      load("RayReservoirSpatial.wgsl"), load("RayResolve.wgsl"), load("RayPresent.wgsl")]);
    const mk = (code, entry) => d.createComputePipeline({
      layout: "auto",
      compute: { module: d.createShaderModule({ code, label: entry }), entryPoint: entry },
    });
    this.pipeGen = mk(common + gen, "Generate");
    this.pipeTmp = mk(common + tmp, "Temporal");
    this.pipeSpa = mk(common + spa, "Spatial");
    this.pipeRes = mk(common + res, "Resolve");
    const preModule = d.createShaderModule({ code: pre, label: "Present" });
    this.pipePresent = d.createRenderPipeline({
      layout: "auto",
      vertex: { module: preModule, entryPoint: "Vs" },
      fragment: { module: preModule, entryPoint: "Present", targets: [{ format: `${this.canvasFormat}-srgb` }] },
      primitive: { topology: "triangle-list" },
    });
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.uniform = d.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // Packed scene: triangles (4 vec4 each) followed by BLAS nodes (2 vec4 each).
    const triVec4 = this.rayScene.triangles.length / 4;
    const packed = new Float32Array(this.rayScene.triangles.length + this.rayScene.nodes.length);
    packed.set(this.rayScene.triangles, 0);
    // nodes are 8 floats = 2 vec4 already; append verbatim after triangles (float count)
    packed.set(this.rayScene.nodes, this.rayScene.triangles.length);
    this.blasVec4Offset = triVec4;
    this.sceneBuf = d.createBuffer({ size: packed.byteLength, usage: storage });
    d.queue.writeBuffer(this.sceneBuf, 0, packed);
    this.maxInst = 4096;
    this.frameBuf = d.createBuffer({ size: (16384 + this.maxInst * 13) * 16, usage: storage });
    this.ready = true;
    console.info(`[ReSTIR PT] ${(this.rayScene.triangles.length / 16) | 0} triangles, ${(this.rayScene.nodes.length / 8) | 0} BLAS nodes`);
  }

  ensureSize(w, h) {
    if (this.w === w && this.h === h) return;
    const d = this.device;
    for (const t of this.textures || []) t.destroy();
    for (const b of this.buffers || []) b.destroy();
    this.w = w; this.h = h;
    const tex = (fmt, label) => d.createTexture({ label, size: [w, h], format: fmt,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    this.gbuf = d.createBuffer({ label: "gbuf", size: w * h * 16 * 7, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.hist = [tex("rgba16float", "histA"), tex("rgba16float", "histB")];
    this.display = tex("rgba16float", "display");
    this.textures = [...this.hist, this.display];
    const rb = (label) => d.createBuffer({ label, size: w * h * RES_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.resInit = rb("resInit"); this.resTemp = rb("resTemp");
    this.resFinal = [rb("resFinalA"), rb("resFinalB")];
    this.buffers = [this.gbuf, this.resInit, this.resTemp, ...this.resFinal];
    this.parity = 0;
  }

  record(encoder, targetView, frame, settings) {
    const d = this.device, p = this.parity, q = 1 - p;
    const built = this.rayScene.buildFrame();
    const tlasVec4 = built.tlasNodes.length / 4;
    const instVec4Offset = tlasVec4;
    const prevVec4Offset = instVec4Offset + built.count * 9;
    const frameData = new Float32Array((prevVec4Offset + built.count * 4) * 4);
    frameData.set(built.tlasNodes, 0);
    for (let i = 0; i < built.count; i++)
      frameData.set(built.instData.subarray(i * 40, i * 40 + 36), (instVec4Offset + i * 9) * 4);
    frameData.set(built.prevData, prevVec4Offset * 4);
    d.queue.writeBuffer(this.frameBuf, 0, frameData);

    const u = new ArrayBuffer(UNIFORM_BYTES), f = new Float32Array(u);
    const set3 = (o, v, w = 0) => { f[o] = v[0]; f[o+1] = v[1]; f[o+2] = v[2]; f[o+3] = w; };
    set3(0, frame.eye); set3(4, frame.right); set3(8, frame.up, frame.tanY); set3(12, frame.fwd, frame.aspect);
    set3(16, frame.sunDir); set3(20, frame.sunColor);
    f.set(frame.viewProj, 24); f.set(frame.prevViewProj, 40);
    f.set([this.w, this.h, frame.frameIndex, settings.bounces], 56);
    f.set([settings.temporal ? 1 : 0, settings.spatial ? 1 : 0, settings.visibility ? 1 : 0, settings.indirectScale], 60);
    f.set([settings.exposure, settings.spatialRadius, settings.spatialCount, settings.mLimit], 64);
    f.set([frame.sunI, frame.skyScale, Math.min(16, frame.lights.length), 0], 68);
    f.set([this.blasVec4Offset, instVec4Offset, prevVec4Offset, this.w * this.h], 72);
    f.set([p, 0, 0, 0], 76);
    frame.lights.slice(0, 16).forEach((L, i) => { set3(80 + i * 4, L.p, L.w); set3(144 + i * 4, L.c, 0); });
    d.queue.writeBuffer(this.uniform, 0, u);

    const sceneGroup = (pipe) => d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniform } },
      { binding: 1, resource: { buffer: this.sceneBuf } },
      { binding: 2, resource: { buffer: this.frameBuf } },
      { binding: 3, resource: { buffer: this.materialBuffer } },
    ]});
    const gx = Math.ceil(this.w / 8), gy = Math.ceil(this.h / 8);
    const run = (label, pipe, group1) => {
      const P = encoder.beginComputePass({ label });
      P.setPipeline(pipe); P.setBindGroup(0, sceneGroup(pipe)); P.setBindGroup(1, group1);
      P.dispatchWorkgroups(gx, gy); P.end();
    };
    const bg = (pipe, entries) => d.createBindGroup({ layout: pipe.getBindGroupLayout(1), entries });
    const B = (buffer) => ({ buffer });
    const V = (t) => t.createView();

    run("RT generate", this.pipeGen, bg(this.pipeGen, [
      { binding: 0, resource: B(this.gbuf) }, { binding: 1, resource: B(this.resInit) }]));
    run("RT temporal", this.pipeTmp, bg(this.pipeTmp, [
      { binding: 0, resource: B(this.gbuf) }, { binding: 1, resource: B(this.resInit) },
      { binding: 2, resource: B(this.resFinal[q]) }, { binding: 3, resource: B(this.resTemp) }]));
    run("RT spatial", this.pipeSpa, bg(this.pipeSpa, [
      { binding: 0, resource: B(this.gbuf) }, { binding: 1, resource: B(this.resTemp) },
      { binding: 2, resource: B(this.resFinal[p]) }]));
    run("RT resolve", this.pipeRes, bg(this.pipeRes, [
      { binding: 0, resource: B(this.gbuf) }, { binding: 1, resource: V(this.hist[q]) },
      { binding: 2, resource: B(this.resFinal[p]) }, { binding: 3, resource: V(this.display) },
      { binding: 4, resource: V(this.hist[p]) }]));

    const rp = encoder.beginRenderPass({ colorAttachments: [{ view: targetView, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    rp.setPipeline(this.pipePresent);
    rp.setBindGroup(0, d.createBindGroup({ layout: this.pipePresent.getBindGroupLayout(0), entries: [
      { binding: 0, resource: B(this.uniform) }, { binding: 1, resource: V(this.display) }]}));
    rp.draw(3); rp.end();
    this.parity = q;
  }
}
