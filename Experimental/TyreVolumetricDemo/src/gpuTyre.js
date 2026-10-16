// WebGPU host: buffers, compute passes (tet forces → nodes → rim → normals) and render passes.
import { SIM_WGSL, RENDER_WGSL } from './shaders.js';
import { packParams, packRoad, nodeInfoArray, PARAM_FLOATS } from './tyreCore.js';

const RIM_STRIDE = 36; // pos3 normal3 colour3 as f32
const STORAGE = GPUBufferUsage.STORAGE;
const COPY_DST = GPUBufferUsage.COPY_DST;

function makeBuffer(device, data, usage) {
  const size = Math.max(4, Math.ceil(data.byteLength / 4) * 4);
  const buffer = device.createBuffer({ size, usage: usage | COPY_DST });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

// Authored once in the wheel frame (x,y in the rolling plane, z lateral). Vertex shader spins/moves it.
function buildRimGeometry(p) {
  const verts = [];
  const push = (pos, nrm, col) => verts.push(...pos, ...nrm, ...col);
  const SEG = 48;
  const R = p.rimRadius, zb = 0.085, zf = 0.06;
  const silver = [0.78, 0.8, 0.84], dark = [0.1, 0.1, 0.11];
  for (let k = 0; k < SEG; k++) {
    const a0 = (2 * Math.PI * k) / SEG, a1 = (2 * Math.PI * (k + 1)) / SEG;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    // barrel
    const b = [[c0 * R, s0 * R, -zb, c0, s0, 0], [c1 * R, s1 * R, -zb, c1, s1, 0],
      [c1 * R, s1 * R, zb, c1, s1, 0], [c0 * R, s0 * R, zb, c0, s0, 0]];
    for (const idx of [0, 1, 2, 0, 2, 3]) push(b[idx].slice(0, 3), b[idx].slice(3), silver);
    // flanges (lips) on both sides, outward-facing
    for (const z of [zb, -zb]) {
      const sgn = z > 0 ? 1 : -1;
      const q = [[c0 * R, s0 * R, z], [c1 * R, s1 * R, z], [c1 * (R + 0.018), s1 * (R + 0.018), z], [c0 * (R + 0.018), s0 * (R + 0.018), z]];
      const nrm = [0, 0, sgn];
      for (const idx of [0, 1, 2, 0, 2, 3]) push(q[idx], nrm, silver);
    }
    // dark spoke disc on both faces, from the hub to the bead
    for (const z of [zf, -zf]) {
      const sgn = z > 0 ? 1 : -1;
      const hub = 0.05;
      const q = [[c0 * hub, s0 * hub, z], [c1 * hub, s1 * hub, z], [c1 * R, s1 * R, z], [c0 * R, s0 * R, z]];
      for (const idx of [0, 1, 2, 0, 2, 3]) push(q[idx], [0, 0, sgn], dark);
    }
  }
  return Float32Array.from(verts);
}

function buildGroundGrid() {
  const xs = [], zs = [];
  for (let i = 0; i <= 400; i++) xs.push(-40 + i * 0.2);
  for (let j = 0; j <= 60; j++) zs.push(-30 + j);
  const verts = [];
  for (const z of zs) for (const x of xs) verts.push(x, z);
  const idx = [];
  const nx = xs.length;
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from(idx) };
}

export class GpuTyre {
  constructor(device, context, format, mesh, canvasSize) {
    this.device = device;
    this.context = context;
    this.format = format;
    this.mesh = mesh;
    this.N = mesh.N;
    this.T = mesh.T;
    this.staging = null;
    this.readState = 'idle';
    this.lastRim = null;
    this.buildResources(canvasSize);
    this.buildPipelines();
  }

  buildResources(canvasSize) {
    const { device, mesh, N, T } = this;
    const p = mesh.params;
    this.paramBuf = device.createBuffer({ size: 4 * PARAM_FLOATS, usage: GPUBufferUsage.UNIFORM | COPY_DST });
    this.globalsBuf = device.createBuffer({ size: 272, usage: GPUBufferUsage.UNIFORM | COPY_DST });
    // GPU timestamps (optional feature): sub-step passes 0-5, normal 6-7, render 8-9.
    this.hasTimestamps = device.features.has('timestamp-query');
    if (this.hasTimestamps) {
      this.querySet = device.createQuerySet({ type: 'timestamp', count: 10 });
      this.queryResolve = device.createBuffer({ size: 80, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.queryStaging = device.createBuffer({ size: 80, usage: GPUBufferUsage.MAP_READ | COPY_DST });
      this.timeState = 'idle';
      this.gpuTimes = null; // averaged ms per pass
    }
    this.nodeInfoBuf = makeBuffer(device, nodeInfoArray(mesh, p.density), STORAGE);
    this.nodeStateBuf = device.createBuffer({ size: 8 * N * 4, usage: STORAGE | COPY_DST });
    this.nodeNormalBuf = device.createBuffer({ size: 16 * N, usage: STORAGE | COPY_DST });
    this.tetIdxBuf = makeBuffer(device, mesh.tetIdx, STORAGE);
    this.tetDataBuf = makeBuffer(device, Float32Array.from(this.packTetData()), STORAGE);
    this.tetForceBuf = device.createBuffer({ size: 64 * T, usage: STORAGE | COPY_DST });
    this.adjStartBuf = makeBuffer(device, mesh.adjStart, STORAGE);
    this.adjListBuf = makeBuffer(device, mesh.adjList, STORAGE);
    this.rimBuf = device.createBuffer({ size: 32, usage: STORAGE | COPY_DST | GPUBufferUsage.COPY_SRC });
    this.rimStaging = device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | COPY_DST });
    this.surfaceIndexBuf = makeBuffer(device, mesh.surface, GPUBufferUsage.INDEX);
    this.edgeIndexBuf = makeBuffer(device, mesh.edges, GPUBufferUsage.INDEX);
    this.surfaceIndexCount = mesh.surface.length;
    this.edgeIndexCount = mesh.edges.length;
    const rimGeometry = buildRimGeometry(p);
    this.rimVertexBuf = makeBuffer(device, rimGeometry, GPUBufferUsage.VERTEX);
    this.rimVertexCount = rimGeometry.length / 9;
    const ground = buildGroundGrid();
    this.groundVB = makeBuffer(device, ground.vertices, GPUBufferUsage.VERTEX);
    this.groundIB = makeBuffer(device, ground.indices, GPUBufferUsage.INDEX);
    this.groundIndexCount = ground.indices.length;
    this.reset();
  }

  packTetData() {
    const { mesh, T } = this;
    const out = new Float64Array(12 * T);
    for (let q = 0; q < T; q++) {
      const GT = mesh.tetGT.subarray(9 * q, 9 * q + 9);
      for (let k = 0; k < 3; k++) {
        out[12 * q + 4 * k] = GT[3 * k];
        out[12 * q + 4 * k + 1] = GT[3 * k + 1];
        out[12 * q + 4 * k + 2] = GT[3 * k + 2];
        out[12 * q + 4 * k + 3] = k === 0 ? mesh.tetV0[q] : 0;
      }
    }
    return out;
  }

  // Positions the rest-shape tyre at the initial ride height, rim at rest, zero velocities.
  reset() {
    const { mesh, N } = this;
    const y0 = mesh.params.treadRadius + 0.005;
    const state = new Float32Array(8 * N);
    for (let n = 0; n < N; n++) {
      state[8 * n] = mesh.rest[3 * n];
      state[8 * n + 1] = mesh.rest[3 * n + 1] + y0;
      state[8 * n + 2] = mesh.rest[3 * n + 2];
      state[8 * n + 3] = 0;
    }
    this.device.queue.writeBuffer(this.nodeStateBuf, 0, state);
    this.device.queue.writeBuffer(this.rimBuf, 0, Float32Array.from([0, y0, 0, 0, 0, 0, 0, 0]));
    this.rimX = 0; // prescribed rolling: the CPU mirror is exact, so the camera and road never wait on readback
  }

  setDensity(density) {
    this.device.queue.writeBuffer(this.nodeInfoBuf, 0, nodeInfoArray(this.mesh, density));
  }

  buildPipelines() {
    const { device, format } = this;
    const sim = device.createShaderModule({ code: SIM_WGSL });
    const render = device.createShaderModule({ code: RENDER_WGSL });
    const cp = (entryPoint) => device.createComputePipeline({ layout: 'auto', compute: { module: sim, entryPoint } });
    this.pipeTet = cp('cs_tet');
    this.pipeNode = cp('cs_node');
    this.pipeRim = cp('cs_rim');
    this.pipeNormal = cp('cs_normal');

    const b = (binding, type) => ({ binding, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type } });
    this.renderBGL = device.createBindGroupLayout({
      entries: [b(0, 'uniform'), b(1, 'read-only-storage'), b(2, 'read-only-storage'),
        b(3, 'read-only-storage'), b(4, 'read-only-storage')],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.renderBGL] });
    const depthStencil = { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' };
    const target = [{ format }];
    this.pipeTyre = device.createRenderPipeline({
      layout, vertex: { module: render, entryPoint: 'vs_tyre' },
      fragment: { module: render, entryPoint: 'fs_tyre', targets: target },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil,
    });
    this.pipeEdges = device.createRenderPipeline({
      layout, vertex: { module: render, entryPoint: 'vs_tyre' },
      fragment: { module: render, entryPoint: 'fs_edge', targets: target },
      primitive: { topology: 'line-list' }, depthStencil,
    });
    this.pipeGround = device.createRenderPipeline({
      layout, vertex: { module: render, entryPoint: 'vs_ground', buffers: [{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }] }] },
      fragment: { module: render, entryPoint: 'fs_ground', targets: target },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil,
    });
    this.pipeRimDraw = device.createRenderPipeline({
      layout, vertex: { module: render, entryPoint: 'vs_rim', buffers: [{
        arrayStride: RIM_STRIDE, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x3' }] }] },
      fragment: { module: render, entryPoint: 'fs_rim', targets: target },
      primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil,
    });

    this.bgSimTet = this.bindGroup(this.pipeTet, [
      [0, this.paramBuf], [1, this.nodeStateBuf], [3, this.tetIdxBuf], [4, this.tetDataBuf], [5, this.tetForceBuf]]);
    this.bgSimNode = this.bindGroup(this.pipeNode, [
      [0, this.paramBuf], [1, this.nodeStateBuf], [2, this.nodeInfoBuf], [5, this.tetForceBuf],
      [6, this.adjStartBuf], [7, this.adjListBuf], [8, this.rimBuf]]);
    this.bgSimRim = this.bindGroup(this.pipeRim, [[0, this.paramBuf], [1, this.nodeStateBuf], [8, this.rimBuf]]);
    this.bgSimNormal = this.bindGroup(this.pipeNormal, [
      [0, this.paramBuf], [1, this.nodeStateBuf], [8, this.rimBuf], [9, this.nodeNormalBuf]]);
    this.bgRender = device.createBindGroup({
      layout: this.renderBGL,
      entries: [
        { binding: 0, resource: { buffer: this.globalsBuf } },
        { binding: 1, resource: { buffer: this.nodeStateBuf } },
        { binding: 2, resource: { buffer: this.nodeNormalBuf } },
        { binding: 3, resource: { buffer: this.nodeInfoBuf } },
        { binding: 4, resource: { buffer: this.rimBuf } },
      ],
    });
  }

  bindGroup(pipeline, pairs) {
    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: pairs.map(([binding, buffer]) => ({ binding, resource: { buffer } })),
    });
  }

  // Encodes `steps` fixed sub-steps plus the normal pass. Parameters are uploaded once per frame.
  frame({ params, steps, camera, colourMode, showEdges }) {
    const { device } = this;
    const p = params;
    this.rimX += steps * p.dt * p.speed;
    device.queue.writeBuffer(this.paramBuf, 0, packParams(p, this.N, this.T));
    const g = new Float32Array(68);
    g.set(camera.viewProj, 0);
    g.set([camera.eye[0], camera.eye[1], camera.eye[2], 1], 16);
    g.set([0.45, 0.85, 0.35, 0], 20);
    g.set([p.roadPeriod, 0, 0, 0], 24);
    g.set([colourMode, this.mesh.params.NT, this.mesh.params.NI, this.mesh.params.NJ], 28);
    g.set([p.rimRadius, p.treadRadius, Math.floor(this.rimX), p.yaw], 32);
    g.set(packRoad(p.road), 36);
    device.queue.writeBuffer(this.globalsBuf, 0, g);

    const encoder = device.createCommandEncoder();
    const tetGroups = Math.ceil(this.T / 64), nodeGroups = Math.ceil(this.N / 64);
    // Time the first sub-step and the render pass of this frame, only when no readback is in flight.
    const timed = this.hasTimestamps && this.timeState === 'idle' && steps > 0;
    const ts = (i) => (timed ? { querySet: this.querySet, beginningOfPassWriteIndex: i, endOfPassWriteIndex: i + 1 } : undefined);
    for (let s = 0; s < steps; s++) {
      const first = s === 0 && timed;
      let pass = encoder.beginComputePass({ timestampWrites: first ? ts(0) : undefined });
      pass.setPipeline(this.pipeTet); pass.setBindGroup(0, this.bgSimTet); pass.dispatchWorkgroups(tetGroups);
      pass.end();
      pass = encoder.beginComputePass({ timestampWrites: first ? ts(2) : undefined });
      pass.setPipeline(this.pipeNode); pass.setBindGroup(0, this.bgSimNode); pass.dispatchWorkgroups(nodeGroups);
      pass.end();
      pass = encoder.beginComputePass({ timestampWrites: first ? ts(4) : undefined });
      pass.setPipeline(this.pipeRim); pass.setBindGroup(0, this.bgSimRim); pass.dispatchWorkgroups(1);
      pass.end();
    }
    const normalPass = encoder.beginComputePass({ timestampWrites: timed ? ts(6) : undefined });
    normalPass.setPipeline(this.pipeNormal); normalPass.setBindGroup(0, this.bgSimNormal);
    normalPass.dispatchWorkgroups(nodeGroups);
    normalPass.end();

    const colourTexture = this.context.getCurrentTexture();
    const view = colourTexture.createView();
    const sizeKey = `${colourTexture.width}x${colourTexture.height}`;
    if (!this.depthView || this.depthSize !== sizeKey) {
      this.depthTex?.destroy();
      this.depthTex = device.createTexture({ size: [colourTexture.width, colourTexture.height], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.depthView = this.depthTex.createView();
      this.depthSize = sizeKey;
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: { r: 0.09, g: 0.1, b: 0.12, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
      timestampWrites: timed ? ts(8) : undefined,
    });
    pass.setBindGroup(0, this.bgRender);
    pass.setPipeline(this.pipeGround);
    pass.setVertexBuffer(0, this.groundVB);
    pass.setIndexBuffer(this.groundIB, 'uint32');
    pass.drawIndexed(this.groundIndexCount);
    pass.setPipeline(this.pipeTyre);
    pass.setIndexBuffer(this.surfaceIndexBuf, 'uint32');
    pass.drawIndexed(this.surfaceIndexCount);
    if (showEdges) {
      pass.setPipeline(this.pipeEdges);
      pass.setIndexBuffer(this.edgeIndexBuf, 'uint32');
      pass.drawIndexed(this.edgeIndexCount);
    }
    pass.setPipeline(this.pipeRimDraw);
    pass.setVertexBuffer(0, this.rimVertexBuf);
    pass.draw(this.rimVertexCount);
    pass.end();

    // Non-blocking rim-state readback for the HUD.
    if (this.readState === 'idle') {
      encoder.copyBufferToBuffer(this.rimBuf, 0, this.rimStaging, 0, 32);
      this.readState = 'copying';
    }
    if (timed) {
      encoder.resolveQuerySet(this.querySet, 0, 10, this.queryResolve, 0);
      encoder.copyBufferToBuffer(this.queryResolve, 0, this.queryStaging, 0, 80);
      this.timeState = 'copying';
    }
    device.queue.submit([encoder.finish()]);
    if (this.timeState === 'copying') {
      this.timeState = 'mapping';
      this.queryStaging.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigInt64Array(this.queryStaging.getMappedRange().slice(0));
        this.queryStaging.unmap();
        const ms = (a, b) => Number(t[b] - t[a]) / 1e6;
        const sample = { tet: ms(0, 1), node: ms(2, 3), rim: ms(4, 5), normal: ms(6, 7), render: ms(8, 9) };
        // Exponential moving average; per-pass deltas are coarse (browsers quantise timers), so smooth them.
        this.gpuTimes = this.gpuTimes
          ? Object.fromEntries(Object.keys(sample).map((k) => [k, this.gpuTimes[k] * 0.9 + sample[k] * 0.1]))
          : sample;
        this.timeState = 'idle';
      }).catch(() => { this.timeState = 'idle'; });
    }
    if (this.readState === 'copying') {
      this.readState = 'mapping';
      this.rimStaging.mapAsync(GPUMapMode.READ).then(() => {
        const data = new Float32Array(this.rimStaging.getMappedRange().slice(0));
        this.rimStaging.unmap();
        this.lastRim = { x: data[0], y: data[1], alpha: data[3], vx: data[4], omega: data[7] };
        this.readState = 'idle';
      }).catch(() => { this.readState = 'idle'; });
    }
  }
}

