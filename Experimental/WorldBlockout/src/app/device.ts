// WebGPU bring-up with an honest failure report. The editor is usable for blockout without a
// GPU (map, brushes, exports work on the CPU); only the 3D view needs this.

export interface GpuContext {
  ok: boolean;
  adapter?: GPUAdapter;
  device?: GPUDevice;
  format?: GPUTextureFormat;
  error?: string;
  /** Human-readable adapter summary for the HUD. */
  adapterInfo?: string;
  features: string[];
}

export async function initGpu(): Promise<GpuContext> {
  const nav = navigator as Navigator & { gpu?: GPU };
  if (!nav.gpu) {
    return { ok: false, error: 'WebGPU is not available in this browser. Use Chrome/Edge 113+, or Safari 18+.', features: [] };
  }
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
  } catch (e) {
    return { ok: false, error: `requestAdapter failed: ${(e as Error).message}`, features: [] };
  }
  if (!adapter) {
    return { ok: false, error: 'No GPU adapter was returned. Hardware acceleration may be disabled.', features: [] };
  }
  const required: GPUFeatureName[] = [];
  const features: GPUFeatureName[] = [];
  for (const f of ['float32-filterable', 'rg11b10ufloat-renderable', 'timestamp-query'] as GPUFeatureName[]) {
    if (adapter.features.has(f)) features.push(f);
  }
  const device = await adapter.requestDevice({
    requiredFeatures: required,
    requiredLimits: {
      maxBufferSize: Math.min(adapter.limits.maxBufferSize, 512 * 1024 * 1024),
      maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 256 * 1024 * 1024),
    },
  });
  device.addEventListener('uncapturederror', (ev) => {
    // Surface shader/runtime errors in the console and the HUD instead of failing silently.
    const e = ev as GPUUncapturedErrorEvent;
    console.error('[gpu]', e.error.message);
    (window as unknown as { __gpuErrors?: string[] }).__gpuErrors ??= [];
    (window as unknown as { __gpuErrors: string[] }).__gpuErrors.push(e.error.message);
  });
  const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
  const adapterInfo = info ? `${info.vendor || 'gpu'} · ${info.architecture || ''} · ${info.description || ''}`.trim() : 'adapter';
  return { ok: true, adapter, device, format: nav.gpu.getPreferredCanvasFormat(), adapterInfo, features };
}
