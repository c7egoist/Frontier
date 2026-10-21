import commonWgsl from "./shaders/common.wgsl?raw";
import insertWgsl from "./shaders/insert.wgsl?raw";
import densityWgsl from "./shaders/density.wgsl?raw";
import forcesWgsl from "./shaders/forces.wgsl?raw";
import integrateWgsl from "./shaders/integrate.wgsl?raw";
import { DOMAIN_MAX, DOMAIN_MIN, GRAVITY, SMOOTHING_RADIUS } from "../common.ts";
import { MATERIAL_ORDER, MATERIAL_PRESETS, materialIndex, particleAlpha } from "../../materials.ts";
import { COLLIDER_STRIDE_FLOATS, packColliders } from "../../colliders.ts";
import type { ColliderSpec, MaterialId } from "../../types.ts";

const PARTICLE_FLOATS = 16; // 4 x vec4<f32>
const MAX_PER_CELL = 64;
const WORKGROUP_SIZE = 64;
const PARTICLE_VOLUME = 0.0017;

export interface SpawnRequest {
  material: MaterialId;
  origin: [number, number, number];
  spread: number;
  count: number;
  initialVelocity: [number, number, number];
}

/**
 * Orchestrates the four-pass WebGPU compute pipeline (spatial hash insert ->
 * density -> forces -> integrate) driving a WCSPH fluid solver with an
 * analytic-SDF collision/adhesion model. Exposes the raw particle storage
 * buffer so the renderer can read positions directly with zero copies.
 */
export class GpuSolver {
  readonly device: GPUDevice;
  readonly maxParticles: number;
  particleBuffer: GPUBuffer;
  materialBuffer: GPUBuffer;
  private colliderBuffer: GPUBuffer;
  private gridCountBuffer: GPUBuffer;
  private gridCountZero: GPUBuffer;
  private gridCellsBuffer: GPUBuffer;
  private paramsBuffer: GPUBuffer;

  private insertPipeline!: GPUComputePipeline;
  private densityPipeline!: GPUComputePipeline;
  private forcesPipeline!: GPUComputePipeline;
  private integratePipeline!: GPUComputePipeline;
  private bindGroup!: GPUBindGroup;
  private bindGroupLayout!: GPUBindGroupLayout;

  private gridDims: [number, number, number];
  private numCells: number;

  activeCount = 0;
  private spawnCursor = 0;
  simTime = 0;
  private colliderCount = 0;
  private colliders: ColliderSpec[] = [];

  constructor(device: GPUDevice, maxParticles: number) {
    this.device = device;
    this.maxParticles = maxParticles;

    const cellSize = SMOOTHING_RADIUS;
    const nx = Math.max(1, Math.ceil((DOMAIN_MAX[0] - DOMAIN_MIN[0]) / cellSize));
    const ny = Math.max(1, Math.ceil((DOMAIN_MAX[1] - DOMAIN_MIN[1]) / cellSize));
    const nz = Math.max(1, Math.ceil((DOMAIN_MAX[2] - DOMAIN_MIN[2]) / cellSize));
    this.gridDims = [nx, ny, nz];
    this.numCells = nx * ny * nz;

    this.particleBuffer = device.createBuffer({
      label: "particles",
      size: maxParticles * PARTICLE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.materialBuffer = device.createBuffer({
      label: "materials",
      size: MATERIAL_ORDER.length * 16 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.uploadMaterials();

    this.colliderBuffer = device.createBuffer({
      label: "colliders",
      size: 8 * COLLIDER_STRIDE_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.gridCountBuffer = device.createBuffer({
      label: "gridCount",
      size: this.numCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.gridCountZero = device.createBuffer({
      label: "gridCountZero",
      size: this.numCells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.gridCellsBuffer = device.createBuffer({
      label: "gridCells",
      size: this.numCells * MAX_PER_CELL * 4,
      usage: GPUBufferUsage.STORAGE,
    });

    this.paramsBuffer = device.createBuffer({
      label: "simParams",
      size: 20 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.buildPipelines();
  }

  private uploadMaterials() {
    const data = new Float32Array(MATERIAL_ORDER.length * 16);
    MATERIAL_ORDER.forEach((id, i) => {
      const m = MATERIAL_PRESETS[id];
      const base = i * 16;
      data[base + 0] = m.restDensity;
      data[base + 1] = m.stiffness;
      data[base + 2] = m.viscosity;
      data[base + 3] = m.cohesion;
      data[base + 4] = m.adhesion;
      data[base + 5] = m.friction;
      data[base + 6] = m.releaseThreshold;
      data[base + 7] = m.particleRadius;
      data[base + 8] = m.color[0];
      data[base + 9] = m.color[1];
      data[base + 10] = m.color[2];
      data[base + 11] = m.damping;
      data[base + 12] = particleAlpha(m);
      data[base + 13] = 0;
      data[base + 14] = 0;
      data[base + 15] = 0;
    });
    this.device.queue.writeBuffer(this.materialBuffer, 0, data);
  }

  setColliders(colliders: ColliderSpec[]) {
    this.colliders = colliders;
    this.colliderCount = colliders.length;
    this.device.queue.writeBuffer(this.colliderBuffer, 0, packColliders(colliders));
  }

  private buildPipelines() {
    const common = commonWgsl as string;
    const mk = (src: string, label: string) =>
      this.device.createShaderModule({ label, code: common + "\n" + src });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: "sph-bind-group-layout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      label: "sph-pipeline-layout",
      bindGroupLayouts: [this.bindGroupLayout],
    });

    this.bindGroup = this.device.createBindGroup({
      label: "sph-bind-group",
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer } },
        { binding: 1, resource: { buffer: this.particleBuffer } },
        { binding: 2, resource: { buffer: this.materialBuffer } },
        { binding: 3, resource: { buffer: this.colliderBuffer } },
        { binding: 4, resource: { buffer: this.gridCountBuffer } },
        { binding: 5, resource: { buffer: this.gridCellsBuffer } },
      ],
    });

    const make = (code: string, label: string) =>
      this.device.createComputePipeline({
        label,
        layout: pipelineLayout,
        compute: { module: mk(code, label), entryPoint: "main" },
      });

    this.insertPipeline = make(insertWgsl as string, "insert");
    this.densityPipeline = make(densityWgsl as string, "density");
    this.forcesPipeline = make(forcesWgsl as string, "forces");
    this.integratePipeline = make(integrateWgsl as string, "integrate");
  }

  private writeParams(dt: number) {
    const data = new Float32Array(20);
    data[0] = dt;
    data[1] = SMOOTHING_RADIUS;
    data[2] = SMOOTHING_RADIUS;
    data[3] = GRAVITY;
    data[4] = DOMAIN_MIN[0];
    data[5] = DOMAIN_MIN[1];
    data[6] = DOMAIN_MIN[2];
    data[7] = 0;
    data[8] = DOMAIN_MAX[0];
    data[9] = DOMAIN_MAX[1];
    data[10] = DOMAIN_MAX[2];
    data[11] = 0;
    data[12] = this.gridDims[0];
    data[13] = this.gridDims[1];
    data[14] = this.gridDims[2];
    data[15] = MAX_PER_CELL;
    data[16] = this.activeCount;
    data[17] = this.colliderCount;
    data[18] = this.simTime;
    data[19] = PARTICLE_VOLUME;
    this.device.queue.writeBuffer(this.paramsBuffer, 0, data);
  }

  spawn(req: SpawnRequest, budget: number) {
    const clampedBudget = Math.max(1, Math.min(this.maxParticles, Math.floor(budget)));
    const matIdx = materialIndex(req.material);
    const n = req.count;
    const stride = PARTICLE_FLOATS;
    const buf = new Float32Array(n * stride);
    for (let i = 0; i < n; i++) {
      const base = i * stride;
      const jx = (Math.random() * 2 - 1) * req.spread;
      const jz = (Math.random() * 2 - 1) * req.spread;
      const jy = Math.random() * req.spread * 0.4;
      buf[base + 0] = req.origin[0] + jx;
      buf[base + 1] = req.origin[1] + jy;
      buf[base + 2] = req.origin[2] + jz;
      buf[base + 3] = 0;
      buf[base + 4] = req.initialVelocity[0] + (Math.random() - 0.5) * 0.2;
      buf[base + 5] = req.initialVelocity[1];
      buf[base + 6] = req.initialVelocity[2] + (Math.random() - 0.5) * 0.2;
      buf[base + 7] = 0; // density scratch
      buf[base + 8] = matIdx;
      buf[base + 9] = 0; // age
      buf[base + 10] = 0; // contact
      buf[base + 11] = 0;
      buf[base + 12] = 0;
      buf[base + 13] = 0;
      buf[base + 14] = 0;
      buf[base + 15] = 0;
    }

    // Ring-buffer write: may wrap around the current particle budget so that
    // continuous pouring keeps recycling the oldest droplets once the
    // dynamic-resolution particle budget has been reached.
    let remaining = Math.min(n, clampedBudget);
    let srcOffset = 0;
    let cursor = this.spawnCursor % clampedBudget;
    while (remaining > 0) {
      const room = clampedBudget - cursor;
      const chunk = Math.min(room, remaining);
      this.device.queue.writeBuffer(
        this.particleBuffer,
        cursor * stride * 4,
        buf.buffer,
        srcOffset * stride * 4,
        chunk * stride * 4,
      );
      cursor = (cursor + chunk) % clampedBudget;
      srcOffset += chunk;
      remaining -= chunk;
    }
    this.spawnCursor = cursor;
    this.activeCount = Math.min(clampedBudget, this.activeCount + n);
  }

  setActiveBudget(budget: number) {
    this.activeCount = Math.min(this.activeCount, budget);
  }

  reset() {
    this.activeCount = 0;
    this.spawnCursor = 0;
    this.simTime = 0;
  }

  step(dt: number, substeps: number) {
    if (this.activeCount === 0) return;
    const subDt = dt / substeps;
    for (let s = 0; s < substeps; s++) {
      this.simTime += subDt;
      this.writeParams(subDt);

      const encoder = this.device.createCommandEncoder({ label: "sph-step" });
      encoder.copyBufferToBuffer(this.gridCountZero, 0, this.gridCountBuffer, 0, this.numCells * 4);

      const groups = Math.ceil(this.activeCount / WORKGROUP_SIZE);
      const pass = encoder.beginComputePass({ label: "sph-passes" });
      pass.setBindGroup(0, this.bindGroup);

      pass.setPipeline(this.insertPipeline);
      pass.dispatchWorkgroups(groups);

      pass.setPipeline(this.densityPipeline);
      pass.dispatchWorkgroups(groups);

      pass.setPipeline(this.forcesPipeline);
      pass.dispatchWorkgroups(groups);

      pass.setPipeline(this.integratePipeline);
      pass.dispatchWorkgroups(groups);

      pass.end();
      this.device.queue.submit([encoder.finish()]);
    }
  }
}
