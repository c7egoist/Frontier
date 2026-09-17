/**
 * GPU bootstrap + the small amount of "engine" this demo needs:
 *   - adapter/device selection with a *measurable* capability profile (see Capabilities),
 *   - a shared, schema-generated parameter buffer (group 0 binding 0 for every pipeline),
 *   - timestamp-query GPU profiler (so performance claims in docs/PERFORMANCE.md are checkable),
 *   - async readback ring for the CPU-side sampling API used by gameplay code.
 *
 * Everything here is deliberately allocation-free per frame.
 */

import type { UniformSchema, UniformWriter } from '@/common/uniform';
import { makeWriter } from '@/common/uniform';

export interface Capabilities {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  /** Adapter-reported limits we actually branch on. */
  maxStorageBufferBindingSize: number;
  maxStorageBuffersPerShaderStage: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxComputeWorkgroupStorageSize: number;
  maxBufferSize: number;
  hasTimestampQuery: boolean;
  hasTimestampInsidePasses: boolean;
  hasSubgroups: boolean;
  /** Coarse tier guess from architecture strings; the adaptive controller refines it at runtime. */
  tier: 'igpu' | 'gtx' | 'rtx' | 'unknown';
}

export interface GpuContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  caps: Capabilities;
  paramsBuffer: GPUBuffer;
  paramsWriter: UniformWriter;
  paramsBindGroup: GPUBindGroup;
  paramsLayout: GPUBindGroupLayout;
  /** Upload the current parameter block. Cheap: one writeBuffer per frame. */
  uploadParams(): void;
  profiler: Profiler;
}

export async function initGpu(
  canvas: HTMLCanvasElement,
  schema: UniformSchema,
  onDeviceLost?: (info: GPUDeviceLostInfo) => void,
): Promise<GpuContext> {
  if (!('gpu' in navigator) || !navigator.gpu) {
    throw new Error(
      'WebGPU is not available in this browser. Use Chrome/Edge 113+ or Safari 18+ (Firefox 141+). ' +
        'On Linux Chrome you may need --enable-unsafe-webgpu or a recent stable release.',
    );
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No WebGPU adapter found (GPU likely blocklisted or unavailable).');

  const info: GPUAdapterInfo =
    'info' in adapter && adapter.info ? adapter.info : ({ vendor: '', architecture: '', device: '', description: '' } as GPUAdapterInfo);

  const features = new Set<string>();
  const wants = ['timestamp-query', 'timestamp-query-inside-passes', 'subgroups'] as const;
  for (const f of wants) {
    if (adapter.features.has(f as GPUFeatureName)) features.add(f);
  }

  // Ask for the biggest buffers the adapter allows: a 1M particle MPM run needs ~100 MB buffers,
  // and the WebGPU *default* maxStorageBufferBindingSize is only 128 MB.
  const limits: Record<string, number> = {
    maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 1 << 30),
    maxBufferSize: Math.min(adapter.limits.maxBufferSize, 1 << 30),
    maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
    maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
    maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize,
    maxComputeWorkgroupsPerDimension: adapter.limits.maxComputeWorkgroupsPerDimension,
    maxStorageTexturesPerShaderStage: adapter.limits.maxStorageTexturesPerShaderStage,
    maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage,
  };

  const device = await adapter.requestDevice({
    requiredFeatures: [...features] as GPUFeatureName[],
    requiredLimits: limits,
    label: 'frontier-ocean-device',
  });

  device.lost.then((lost) => {
    if (lost.reason !== 'destroyed') onDeviceLost?.(lost);
  });
  device.onuncapturederror = (e) => {
    // Surface shader/pipeline errors instead of failing silently.
    console.error('[WebGPU uncaptured error]', (e as GPUUncapturedErrorEvent).error);
  };

  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('canvas.getContext("webgpu") returned null.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
  });

  const paramsBuffer = device.createBuffer({
    label: 'Globals',
    size: Math.max(256, schema.byteSize),
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const paramsWriter = makeWriter(schema.byteSize);
  const bgl = device.createBindGroupLayout({
    label: 'globals-layout',
    entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const paramsBindGroup = device.createBindGroup({
    label: 'globals',
    layout: bgl,
    entries: [{ binding: 0, resource: { buffer: paramsBuffer, offset: 0, size: schema.byteSize } }],
  });

  const caps: Capabilities = {
    vendor: info.vendor ?? '',
    architecture: info.architecture ?? '',
    device: info.device ?? '',
    description: info.description ?? '',
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize!,
    maxStorageBuffersPerShaderStage: limits.maxStorageBuffersPerShaderStage!,
    maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup!,
    maxComputeWorkgroupStorageSize: limits.maxComputeWorkgroupStorageSize!,
    maxBufferSize: limits.maxBufferSize!,
    hasTimestampQuery: features.has('timestamp-query'),
    hasTimestampInsidePasses: features.has('timestamp-query-inside-passes'),
    hasSubgroups: features.has('subgroups'),
    tier: guessTier(info, limits.maxStorageBufferBindingSize!),
  };

  const profiler = new Profiler(device, caps.hasTimestampQuery);

  return {
    adapter,
    device,
    context,
    format,
    caps,
    paramsBuffer,
    paramsWriter,
    paramsBindGroup,
    paramsLayout: bgl,
    uploadParams() {
      device.queue.writeBuffer(paramsBuffer, 0, paramsWriter.floats.buffer, 0, schema.byteSize);
    },
    profiler,
  };
}

function guessTier(info: GPUAdapterInfo, maxBinding: number): Capabilities['tier'] {
  const arch = `${info.architecture} ${info.description} ${info.device}`.toLowerCase();
  if (/ampere|ada|lovelace|ada[lg]|hopper|blackwell|geforce rtx|rtx|radeon rx 6|radeon rx 7|apple m[1-9]/.test(arch)) return 'rtx';
  if (/pascal|turing|maxwell|geforce (gtx|mx)|gtx|radeon rx 5|radeon vega|iris xe|arc a/.test(arch)) return 'gtx';
  if (/intel|uhd|hd graphics|adreno|mali|swiftshader|llvmpipe|software/.test(arch)) return 'igpu';
  // No useful string (Firefox/Safari hide it): fall back to memory-class heuristics.
  return maxBinding >= 1 << 30 ? 'rtx' : 'gtx';
}

// ---------------------------------------------------------------------------
// Profiler
// ---------------------------------------------------------------------------

export interface PassTiming {
  label: string;
  ms: number;
}

/**
 * Per-pass GPU timings via timestamp queries.
 *
 * Timestamps are resolved into a staging buffer every frame and mapped ~3 frames later, so the
 * render loop never blocks. Without the timestamp-query feature this degrades to a no-op and the
 * HUD falls back to wall-clock frame time.
 */
export class Profiler {
  private readonly querySet?: GPUQuerySet;
  private readonly resolveBuffer?: GPUBuffer;
  private readonly readBuffer?: GPUBuffer;
  private readonly maxPasses: number;
  private labels: string[] = [];
  private index = 0;
  private readonly pending: Array<{ slot: number; labels: string[]; count: number }> = [];
  private readonly slotCount = 4;
  /** Per-slot byte stride, 256-byte aligned because resolveQuerySet demands it. */
  private readonly stride: number;
  private readonly slotBusy: boolean[] = [];
  private buffer: BigUint64Array | null = null;
  results: PassTiming[] = [];
  totalMs = 0;
  enabled: boolean;

  constructor(private readonly device: GPUDevice, supported: boolean, maxPasses = 48) {
    this.maxPasses = maxPasses;
    this.stride = Math.ceil((maxPasses * 2 * 8) / 256) * 256;
    this.enabled = supported;
    if (!supported) return;
    this.querySet = device.createQuerySet({ label: 'timestamps', type: 'timestamp', count: maxPasses * 2 });
    this.resolveBuffer = device.createBuffer({
      label: 'timestamp-resolve',
      size: maxPasses * 2 * 8,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    this.readBuffer = device.createBuffer({
      label: 'timestamp-read',
      size: this.slotCount * this.stride,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    this.slotBusy = new Array(this.slotCount).fill(false);
  }

  beginFrame(): void {
    if (!this.enabled) return;
    this.labels.length = 0;
    this.index = 0;
  }

  /**
   * Reserves a timestamp pair for one pass. WebGPU writes timestamps through the pass descriptor
   * (`timestampWrites`), not the command encoder, so callers spread this into the descriptor:
   *   encoder.beginComputePass({ label, timestampWrites: profiler.writes('swe.step') })
   * Returns undefined when profiling is unavailable, which is harmless to spread.
   */
  writes(label: string): GPUComputePassTimestampWrites | undefined {
    if (!this.enabled || this.index >= this.maxPasses) return undefined;
    const base = this.index * 2;
    this.index++;
    this.labels.push(label);
    return { querySet: this.querySet!, beginningOfPassWriteIndex: base, endOfPassWriteIndex: base + 1 };
  }

  /** Call once per frame, after all passes: resolves + schedules the async read. */
  finishFrame(encoder: GPUCommandEncoder): void {
    if (!this.enabled || this.index === 0) return;
    const count = this.index;
    let slot = this.slotBusy.indexOf(false);
    if (slot < 0) return;
    this.slotBusy[slot] = true;
    encoder.resolveQuerySet(this.querySet!, 0, count * 2, this.resolveBuffer!, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer!, 0, this.readBuffer!, slot * this.stride, count * 2 * 8);
    const labels = this.labels.slice(0, count);
    this.pending.push({ slot, labels, count });
    this.device.queue
      .onSubmittedWorkDone()
      .then(() => this.readSlot())
      .catch(() => {
        /* device lost */
      });
  }

  private async readSlot(): Promise<void> {
    const job = this.pending.shift();
    if (!job) return;
    const readBuffer = this.readBuffer!;
    try {
      const offset = job.slot * this.stride;
      await readBuffer.mapAsync(GPUMapMode.READ, offset, job.count * 2 * 8);
      const range = readBuffer.getMappedRange(offset, job.count * 2 * 8);
      if (!this.buffer || this.buffer.length < job.count * 2) this.buffer = new BigUint64Array(job.count * 2);
      const src = new BigUint64Array(range);
      this.buffer.set(src.subarray(0, job.count * 2));
      readBuffer.unmap();

      const out: PassTiming[] = [];
      let total = 0;
      for (let i = 0; i < job.count; i++) {
        const t0 = Number(this.buffer[i * 2]!);
        const t1 = Number(this.buffer[i * 2 + 1]!);
        const ms = (t1 - t0) / 1e6;
        if (ms >= 0.0005 && ms < 1000) {
          out.push({ label: job.labels[i]!, ms });
          total += ms;
        }
      }
      this.results = out;
      this.totalMs = total;
    } catch {
      /* mapped range unavailable */
    } finally {
      this.slotBusy[job.slot] = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Async readback ring (gameplay sampling API)
// ---------------------------------------------------------------------------

/**
 * Double/triple-buffered staging readback. `request()` copies a region, `poll()` returns the most
 * recent *completed* copy. Never blocks the frame: sampled data is N-1..N-2 frames old, which is
 * exactly what buoyancy/CPU-side queries want (it lets the GPU pipeline stay full).
 */
export class ReadbackRing {
  private readonly buffers: GPUBuffer[] = [];
  private readonly states: Array<'idle' | 'copying' | 'mapped'> = [];
  private readIndex = 0;
  private readonly pending: Array<{ slot: number; bytes: number }> = [];
  private readonly latest: Uint8Array;
  private inFlight = 0;
  readonly labels: string[] = [];

  constructor(
    device: GPUDevice,
    readonly byteSize: number,
    readonly slots = 3,
    readonly label = 'readback',
  ) {
    for (let i = 0; i < slots; i++) {
      this.buffers.push(
        device.createBuffer({
          label: `${label}-${i}`,
          size: byteSize,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        }),
      );
      this.states.push('idle');
    }
    this.latest = new Uint8Array(byteSize);
  }

  /** Encodes a copy of `source` into the next free slot. No-op when all slots are busy. */
  request(encoder: GPUCommandEncoder, source: GPUBuffer, sourceOffset = 0): boolean {
    let slot = this.states.indexOf('idle');
    if (slot < 0) {
      // Recycle the oldest mapped slot if the consumer never called poll().
      slot = this.states.indexOf('mapped');
      if (slot < 0) return false;
      this.states[slot] = 'idle';
      this.buffers[slot]!.unmap();
    }
    this.states[slot] = 'copying';
    encoder.copyBufferToBuffer(source, sourceOffset, this.buffers[slot]!, 0, this.byteSize);
    this.pending.push({ slot, bytes: this.byteSize });
    return true;
  }

  /** Call once per frame: kicks off mapAsync for completed copies and drains ready ones. */
  poll(): void {
    while (this.pending.length > 0 && this.inFlight < 2) {
      const job = this.pending[0]!;
      if (this.states[job.slot] !== 'copying') break;
      this.pending.shift();
      this.inFlight++;
      const buffer = this.buffers[job.slot]!;
      buffer
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const range = buffer.getMappedRange();
          this.latest.set(new Uint8Array(range));
          buffer.unmap();
          this.states[job.slot] = 'idle';
          this.readIndex++;
        })
        .catch(() => {
          this.states[job.slot] = 'idle';
        })
        .finally(() => {
          this.inFlight--;
        });
    }
  }

  /** Most recent completed snapshot (may be 1-2 frames stale). */
  data(): Uint8Array {
    return this.latest;
  }

  get samples(): number {
    return this.readIndex;
  }
}

// ---------------------------------------------------------------------------
// Buffer / pipeline helpers
// ---------------------------------------------------------------------------

export function storageBuffer(device: GPUDevice, label: string, bytes: number, extra: number = 0): GPUBuffer {
  return device.createBuffer({
    label,
    size: Math.max(16, bytes),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | extra,
  });
}

export function readbackBuffer(device: GPUDevice, label: string, bytes: number): GPUBuffer {
  return device.createBuffer({
    label,
    size: Math.max(16, bytes),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_READ,
  });
}

export function uniformBuffer(device: GPUDevice, label: string, bytes: number): GPUBuffer {
  return device.createBuffer({ label, size: Math.max(16, bytes), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
}

export function uploadArray(device: GPUDevice, buffer: GPUBuffer, data: ArrayBufferView, offset = 0): void {
  device.queue.writeBuffer(buffer, offset, data.buffer, data.byteOffset, data.byteLength);
}

/** Two storage buffers you can swap per frame (ping-pong integration). */
export class PingPong {
  private flip = false;
  constructor(
    readonly a: GPUBuffer,
    readonly b: GPUBuffer,
  ) {}
  get read(): GPUBuffer {
    return this.flip ? this.b : this.a;
  }
  get write(): GPUBuffer {
    return this.flip ? this.a : this.b;
  }
  swap(): void {
    this.flip = !this.flip;
  }
}

/** Shader compile errors seen so far (surfaced in the HUD / fatal overlay). */
export const compileErrors: string[] = [];

export interface KernelOptions {
  label: string;
  code: string;
  entryPoint?: string;
  /** extra bind group layout entries appended after the shared Globals group */
  bindings?: GPUBindGroupLayoutEntry[];
  constants?: Record<string, number>;
}

/** Compile one WGSL module and its compute pipeline. Throws with the annotated source on failure. */
export function createKernel(device: GPUDevice, paramsLayout: GPUBindGroupLayout, opts: KernelOptions): ComputeKernel {
  const module = device.createShaderModule({ label: opts.label, code: opts.code });
  const layout = device.createPipelineLayout({
    label: `${opts.label}-layout`,
    bindGroupLayouts: [
      paramsLayout,
      device.createBindGroupLayout({ label: `${opts.label}-bgl`, entries: opts.bindings ?? [] }),
    ],
  });
  const pipeline = device.createComputePipeline({
    label: opts.label,
    layout,
    compute: { module, entryPoint: opts.entryPoint ?? 'main', constants: opts.constants },
  });
  // WebGPU reports WGSL errors asynchronously unless compilationInfo is checked; do it once at
  // startup so a typo fails loudly instead of producing an empty screen.
  const info = module.getCompilationInfo?.();
  if (info) {
    info.then((ci) => {
      const errors = ci.messages.filter((m) => m.type === 'error');
      if (errors.length) {
        for (const m of errors) console.error(`[WGSL ${opts.label}] ${m.lineNum}:${m.linePos} ${m.message}`);
        throw new Error(`WGSL compile error in ${opts.label}: ${errors[0]!.message}`);
      }
    });
  }
  return new ComputeKernel(device, pipeline, opts.label);
}

export class ComputeKernel {
  constructor(
    private readonly device: GPUDevice,
    readonly pipeline: GPUComputePipeline,
    readonly label: string,
  ) {}

  /** Build the group(1) bind group; entries must use the indices the shader declares. */
  group(entries: GPUBindGroupEntry[]): GPUBindGroup {
    return this.device.createBindGroup({
      label: `${this.label}-bg`,
      layout: this.pipeline.getBindGroupLayout(1),
      entries,
    });
  }

  pass(encoder: GPUCommandEncoder, params: GPUBindGroup, group: GPUBindGroup, label?: string): GPUComputePassEncoder {
    const pass = encoder.beginComputePass({ label: label ?? this.label });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, params);
    pass.setBindGroup(1, group);
    return pass;
  }

  /** Convenience for the common "bind and dispatch" case. */
  dispatch(encoder: GPUCommandEncoder, params: GPUBindGroup, group: GPUBindGroup, x: number, y = 1, z = 1, label?: string): void {
    const pass = this.pass(encoder, params, group, label);
    pass.dispatchWorkgroups(x, y, z);
    pass.end();
  }
}

/** ceil division helper used for every dispatch size. */
export function wg(count: number, size: number): number {
  return Math.ceil(count / size);
}
