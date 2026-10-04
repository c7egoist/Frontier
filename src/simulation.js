export const GPU_CLOTH_COMPUTE = `
struct SimParams {
  step: vec4<f32>,
  meta: vec4<f32>,
};

fn bodyRx(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.36, 0.29, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.29, 0.37, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.37, 0.30, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn bodyRz(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.235, 0.195, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.195, 0.24, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.24, 0.19, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn collide(input: vec3<f32>) -> vec3<f32> {
  var p = input;
  let rx = bodyRx(p.y);
  if (rx > 0.0) {
    let rz = bodyRz(p.y);
    let scaled = vec2<f32>(p.x / (rx + 0.012), p.z / (rz + 0.012));
    let radius = length(scaled);
    if (radius < 1.0 && radius > 0.0001) {
      p.x = p.x / radius;
      p.z = p.z / radius;
    }
  }
  if (p.y < 0.055) { p.y = 0.055; }
  return p;
}

@group(0) @binding(0) var<storage, read> current: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> previous: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> predicted: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> rest: array<vec4<f32>>;
@group(0) @binding(4) var<uniform> params: SimParams;

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let i = invocation.x;
  let cols = u32(params.meta.z);
  let rows = u32(params.meta.y);
  let count = cols * rows;
  if (i >= count) { return; }
  let row = i / cols;
  if (row == 0u) {
    predicted[i] = rest[i];
    previous[i] = rest[i];
    return;
  }

  let p = current[i].xyz;
  let old = previous[i].xyz;
  let dt = params.step.x;
  let velocity = (p - old) * params.step.y;
  let phase = params.meta.x;
  let wind = params.step.z;
  let windAcceleration = vec3<f32>(
    sin(phase * 1.35 + p.y * 1.7) * 0.85,
    0.035,
    sin(phase * 0.83 + p.x * 2.1) * 0.65
  ) * wind;
  let gravity = vec3<f32>(0.0, -9.8 * params.step.w, 0.0);
  let restPosition = rest[i].xyz;
  let softBend = vec3<f32>(restPosition.x - p.x, 0.0, restPosition.z - p.z) * 4.0;
  let nextPosition = collide(p + velocity + (gravity + windAcceleration + softBend) * dt * dt);
  previous[i] = vec4<f32>(p, 1.0);
  predicted[i] = vec4<f32>(nextPosition, 1.0);
}
`;

export const GPU_CLOTH_CONSTRAINT = `
struct SimParams {
  step: vec4<f32>,
  meta: vec4<f32>,
};

fn bodyRx(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.36, 0.29, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.29, 0.37, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.37, 0.30, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn bodyRz(y: f32) -> f32 {
  if (y < 1.08 || y > 2.43) { return 0.0; }
  if (y < 1.56) { return mix(0.235, 0.195, clamp((y - 1.08) / 0.48, 0.0, 1.0)); }
  if (y < 2.02) { return mix(0.195, 0.24, clamp((y - 1.56) / 0.46, 0.0, 1.0)); }
  return mix(0.24, 0.19, clamp((y - 2.02) / 0.41, 0.0, 1.0));
}

fn collide(input: vec3<f32>) -> vec3<f32> {
  var p = input;
  let rx = bodyRx(p.y);
  if (rx > 0.0) {
    let rz = bodyRz(p.y);
    let scaled = vec2<f32>(p.x / (rx + 0.012), p.z / (rz + 0.012));
    let radius = length(scaled);
    if (radius < 1.0 && radius > 0.0001) {
      p.x = p.x / radius;
      p.z = p.z / radius;
    }
  }
  if (p.y < 0.055) { p.y = 0.055; }
  return p;
}

@group(0) @binding(0) var<storage, read> source: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> destination: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> rest: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: SimParams;

fn edgeCorrection(i: u32, j: u32, p: vec3<f32>) -> vec3<f32> {
  let q = source[j].xyz;
  let delta = q - p;
  let distanceNow = length(delta);
  let restDistance = distance(rest[i].xyz, rest[j].xyz);
  if (distanceNow < 0.00001) { return vec3<f32>(0.0); }
  return delta * ((distanceNow - restDistance) / distanceNow);
}

@compute @workgroup_size(64)
fn solve(@builtin(global_invocation_id) invocation: vec3<u32>) {
  let i = invocation.x;
  let cols = u32(params.meta.z);
  let rows = u32(params.meta.y);
  let count = cols * rows;
  if (i >= count) { return; }
  let row = i / cols;
  if (row == 0u) {
    destination[i] = rest[i];
    return;
  }
  let col = i % cols;
  let p = source[i].xyz;
  let left = row * cols + ((col + cols - 1u) % cols);
  let right = row * cols + ((col + 1u) % cols);
  var correction = edgeCorrection(i, left, p) + edgeCorrection(i, right, p);
  var edgeCount = 2.0;
  if (row > 0u) {
    let up = (row - 1u) * cols + col;
    correction += edgeCorrection(i, up, p);
    edgeCount += 1.0;
    correction += edgeCorrection(i, (row - 1u) * cols + ((col + cols - 1u) % cols), p);
    correction += edgeCorrection(i, (row - 1u) * cols + ((col + 1u) % cols), p);
    edgeCount += 2.0;
  }
  if (row + 1u < rows) {
    let down = (row + 1u) * cols + col;
    correction += edgeCorrection(i, down, p);
    edgeCount += 1.0;
    correction += edgeCorrection(i, (row + 1u) * cols + ((col + cols - 1u) % cols), p);
    correction += edgeCorrection(i, (row + 1u) * cols + ((col + 1u) % cols), p);
    edgeCount += 2.0;
  }
  let stiffness = clamp(0.135 + params.meta.w * 0.19, 0.15, 0.34);
  let corrected = collide(p + correction * (stiffness / sqrt(edgeCount)));
  destination[i] = vec4<f32>(corrected, 1.0);
}
`;

function packVec4(positions) {
  const result = new Float32Array((positions.length / 3) * 4);
  for (let i = 0, j = 0; i < positions.length; i += 3, j += 4) {
    result[j] = positions[i];
    result[j + 1] = positions[i + 1];
    result[j + 2] = positions[i + 2];
    result[j + 3] = 1;
  }
  return result;
}

function cpuCollide(x, y, z) {
  let rx = 0;
  let rz = 0;
  if (y >= 1.08 && y <= 2.43) {
    if (y < 1.56) {
      const t = Math.max(0, Math.min(1, (y - 1.08) / 0.48));
      rx = 0.36 + (0.29 - 0.36) * t;
      rz = 0.235 + (0.195 - 0.235) * t;
    } else if (y < 2.02) {
      const t = Math.max(0, Math.min(1, (y - 1.56) / 0.46));
      rx = 0.29 + (0.37 - 0.29) * t;
      rz = 0.195 + (0.24 - 0.195) * t;
    } else {
      const t = Math.max(0, Math.min(1, (y - 2.02) / 0.41));
      rx = 0.37 + (0.30 - 0.37) * t;
      rz = 0.24 + (0.19 - 0.24) * t;
    }
  }
  if (rx > 0) {
    const radius = Math.hypot(x / (rx + 0.012), z / (rz + 0.012));
    if (radius < 1 && radius > 0.0001) { x /= radius; z /= radius; }
  }
  return [x, Math.max(y, 0.055), z];
}

export async function requestWebGPUDevice() {
  if (!('gpu' in navigator)) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    return await adapter.requestDevice();
  } catch (error) {
    console.warn('WebGPU device unavailable; using the CPU cloth fallback.', error);
    return null;
  }
}

export class CpuClothSimulation {
  constructor(geometry) {
    this.iterations = 5;
    this.reset(geometry);
  }

  reset(geometry) {
    this.cols = geometry.cols;
    this.rows = geometry.rows;
    this.count = geometry.count;
    this.rest = geometry.restPositions.slice();
    this.positions = geometry.positions.slice();
    this.previous = geometry.positions.slice();
    this.predicted = new Float32Array(this.positions.length);
    this.scratch = new Float32Array(this.positions.length);
    this.indices = geometry.indices;
  }

  step(dt, time, settings = {}) {
    if (dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    const damping = 0.988;
    const wind = settings.wind ?? 0.42;
    const gravityScale = settings.gravity ?? 0.78;
    const stretch = settings.stretch ?? 0.68;
    const dtSquared = dt * dt;
    const cols = this.cols;
    const rows = this.rows;
    const positions = this.positions;
    const previous = this.previous;
    const rest = this.rest;
    const predicted = this.predicted;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const p = i * 3;
        if (row === 0) {
          predicted[p] = rest[p];
          predicted[p + 1] = rest[p + 1];
          predicted[p + 2] = rest[p + 2];
          previous[p] = rest[p];
          previous[p + 1] = rest[p + 1];
          previous[p + 2] = rest[p + 2];
          continue;
        }
        const x = positions[p];
        const y = positions[p + 1];
        const z = positions[p + 2];
        const vx = (x - previous[p]) * damping;
        const vy = (y - previous[p + 1]) * damping;
        const vz = (z - previous[p + 2]) * damping;
        previous[p] = x;
        previous[p + 1] = y;
        previous[p + 2] = z;
        const ax = Math.sin(time * 1.35 + y * 1.7) * 0.85 * wind;
        const az = Math.sin(time * 0.83 + x * 2.1) * 0.65 * wind;
        predicted[p] = x + vx + (ax + (rest[p] - x) * 4.0) * dtSquared;
        predicted[p + 1] = y + vy + (0.08 - 9.8 * gravityScale) * dtSquared;
        predicted[p + 2] = z + vz + (az + (rest[p + 2] - z) * 4.0) * dtSquared;
      }
    }

    let source = predicted;
    let destination = this.scratch;
    const solverStrength = 0.135 + stretch * 0.19;
    for (let iteration = 0; iteration < this.iterations; iteration++) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const p = i * 3;
          if (row === 0) {
            destination[p] = rest[p];
            destination[p + 1] = rest[p + 1];
            destination[p + 2] = rest[p + 2];
            continue;
          }
          let cx = 0; let cy = 0; let cz = 0; let edgeCount = 0;
          const addEdge = (neighbor) => {
            const q = neighbor * 3;
            const dx = source[q] - source[p];
            const dy = source[q + 1] - source[p + 1];
            const dz = source[q + 2] - source[p + 2];
            const length = Math.hypot(dx, dy, dz);
            const restLength = Math.hypot(rest[q] - rest[p], rest[q + 1] - rest[p + 1], rest[q + 2] - rest[p + 2]);
            if (length > 0.00001) {
              const factor = (length - restLength) / length;
              cx += dx * factor; cy += dy * factor; cz += dz * factor;
            }
            edgeCount++;
          };
          addEdge(row * cols + ((col + cols - 1) % cols));
          addEdge(row * cols + ((col + 1) % cols));
          if (row > 0) {
            addEdge((row - 1) * cols + col);
            addEdge((row - 1) * cols + ((col + cols - 1) % cols));
            addEdge((row - 1) * cols + ((col + 1) % cols));
          }
          if (row + 1 < rows) {
            addEdge((row + 1) * cols + col);
            addEdge((row + 1) * cols + ((col + cols - 1) % cols));
            addEdge((row + 1) * cols + ((col + 1) % cols));
          }
          const strength = solverStrength / Math.sqrt(edgeCount);
          const moved = cpuCollide(
            source[p] + cx * strength,
            source[p + 1] + cy * strength,
            source[p + 2] + cz * strength,
          );
          destination[p] = moved[0];
          destination[p + 1] = moved[1];
          destination[p + 2] = moved[2];
        }
      }
      const swap = source;
      source = destination;
      destination = swap;
    }
    this.positions.set(source);
  }
}

export class GpuClothSimulation {
  constructor(device, geometry) {
    this.device = device;
    this.geometry = geometry;
    this.count = geometry.count;
    this.cols = geometry.cols;
    this.rows = geometry.rows;
    this.running = true;
    this.iterations = 5;
    this.positions = geometry.positions.slice();
    this.stateVersion = 0;
    const bufferUsage = GPUBufferUsage;
    this.positionBuffer = device.createBuffer({
      label: 'cloth positions',
      size: this.count * 16,
      usage: bufferUsage.STORAGE | bufferUsage.COPY_DST | bufferUsage.COPY_SRC,
    });
    this.previousBuffer = device.createBuffer({
      label: 'cloth previous positions',
      size: this.count * 16,
      usage: bufferUsage.STORAGE | bufferUsage.COPY_DST,
    });
    this.scratchA = device.createBuffer({ label: 'cloth solver A', size: this.count * 16, usage: bufferUsage.STORAGE });
    this.scratchB = device.createBuffer({ label: 'cloth solver B', size: this.count * 16, usage: bufferUsage.STORAGE });
    this.restBuffer = device.createBuffer({
      label: 'cloth rest shape',
      size: this.count * 16,
      usage: bufferUsage.STORAGE | bufferUsage.COPY_DST,
    });
    this.uniformBuffer = device.createBuffer({
      label: 'cloth solver uniforms',
      size: 32,
      usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST,
    });
    this.readbackSlots = Array.from({ length: 3 }, (_, index) => ({
      buffer: device.createBuffer({
        label: `cloth display readback ${index + 1}`,
        size: this.count * 16,
        usage: bufferUsage.MAP_READ | bufferUsage.COPY_DST,
      }),
      busy: false,
      version: 0,
    }));

    const integrateModule = device.createShaderModule({ label: 'Verlet integrate WGSL', code: GPU_CLOTH_COMPUTE });
    const constraintModule = device.createShaderModule({ label: 'Position constraints WGSL', code: GPU_CLOTH_CONSTRAINT });
    this.integratePipeline = device.createComputePipeline({
      label: 'cloth integration',
      layout: 'auto',
      compute: { module: integrateModule, entryPoint: 'integrate' },
    });
    this.constraintPipeline = device.createComputePipeline({
      label: 'cloth distance constraints',
      layout: 'auto',
      compute: { module: constraintModule, entryPoint: 'solve' },
    });
    const integrateLayout = this.integratePipeline.getBindGroupLayout(0);
    this.integrateGroup = device.createBindGroup({
      label: 'cloth integrate bindings',
      layout: integrateLayout,
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.previousBuffer } },
        { binding: 2, resource: { buffer: this.scratchA } },
        { binding: 3, resource: { buffer: this.restBuffer } },
        { binding: 4, resource: { buffer: this.uniformBuffer } },
      ],
    });
    const constraintLayout = this.constraintPipeline.getBindGroupLayout(0);
    const makeConstraintGroup = (label, source, destination) => device.createBindGroup({
      label,
      layout: constraintLayout,
      entries: [
        { binding: 0, resource: { buffer: source } },
        { binding: 1, resource: { buffer: destination } },
        { binding: 2, resource: { buffer: this.restBuffer } },
        { binding: 3, resource: { buffer: this.uniformBuffer } },
      ],
    });
    this.solveAB = makeConstraintGroup('cloth A to B', this.scratchA, this.scratchB);
    this.solveBA = makeConstraintGroup('cloth B to A', this.scratchB, this.scratchA);
    this.solveAToPosition = makeConstraintGroup('cloth final pass', this.scratchA, this.positionBuffer);
    this.reset(geometry);
  }

  reset(geometry = this.geometry) {
    this.geometry = geometry;
    this.cols = geometry.cols;
    this.rows = geometry.rows;
    this.count = geometry.count;
    const rest = packVec4(geometry.restPositions);
    const initial = packVec4(geometry.positions);
    this.positions.set(geometry.positions);
    this.stateVersion++;
    this.device.queue.writeBuffer(this.restBuffer, 0, rest);
    this.device.queue.writeBuffer(this.positionBuffer, 0, initial);
    this.device.queue.writeBuffer(this.previousBuffer, 0, initial);
  }

  encode(encoder, dt, time, settings = {}) {
    if (!settings.running || dt <= 0) return;
    dt = Math.min(dt, 1 / 30);
    const values = new Float32Array([
      dt,
      0.988,
      settings.wind ?? 0.42,
      settings.gravity ?? 0.78,
      time,
      this.rows,
      this.cols,
      settings.stretch ?? 0.68,
    ]);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, values);
    const workgroups = Math.ceil(this.count / 64);
    let pass = encoder.beginComputePass({ label: 'cloth verlet integration' });
    pass.setPipeline(this.integratePipeline);
    pass.setBindGroup(0, this.integrateGroup);
    pass.dispatchWorkgroups(workgroups);
    pass.end();

    for (let iteration = 0; iteration < this.iterations; iteration++) {
      pass = encoder.beginComputePass({ label: `cloth constraints ${iteration + 1}` });
      pass.setPipeline(this.constraintPipeline);
      if (iteration === this.iterations - 1) {
        pass.setBindGroup(0, this.solveAToPosition);
      } else {
        pass.setBindGroup(0, iteration % 2 === 0 ? this.solveAB : this.solveBA);
      }
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }
  }

  step(dt, time, settings = {}) {
    if (dt <= 0 || !settings.running) return;
    const encoder = this.device.createCommandEncoder({ label: 'GPU cloth simulation step' });
    this.encode(encoder, dt, time, settings);
    const slot = this.readbackSlots.find((candidate) => !candidate.busy);
    if (slot) {
      slot.busy = true;
      slot.version = this.stateVersion;
      encoder.copyBufferToBuffer(this.positionBuffer, 0, slot.buffer, 0, this.count * 16);
    }
    this.device.queue.submit([encoder.finish()]);
    if (slot) {
      slot.buffer.mapAsync(GPUMapMode.READ).then(() => {
        const packed = new Float32Array(slot.buffer.getMappedRange());
        if (slot.version === this.stateVersion) {
          for (let i = 0, j = 0; i < this.count; i++, j += 4) {
            const target = i * 3;
            this.positions[target] = packed[j];
            this.positions[target + 1] = packed[j + 1];
            this.positions[target + 2] = packed[j + 2];
          }
        }
        slot.buffer.unmap();
        slot.busy = false;
      }).catch((error) => {
        slot.busy = false;
        console.warn('Cloth display readback failed.', error);
      });
    }
  }

  destroy() {
    this.positionBuffer.destroy();
    this.previousBuffer.destroy();
    this.scratchA.destroy();
    this.scratchB.destroy();
    this.restBuffer.destroy();
    this.uniformBuffer.destroy();
    this.readbackSlots.forEach((slot) => slot.buffer.destroy());
  }
}
