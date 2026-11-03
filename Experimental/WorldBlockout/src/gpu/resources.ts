// GPU resource ownership: everything that must exist for one world is created here and
// re-created only when the spectrum or the bake actually changes.

import type { SpectrumCascade } from '../core/oceanSpectrum.ts';
import type { HeightBake } from '../core/terrain.ts';

export interface CascadeGpu {
  cfg: SpectrumCascade['cfg'];
  /** h0(k).xy, h0(-k).xy per texel. */
  specA: GPUBuffer;
  /** kdir.xy, omega, calibration scale per texel. */
  specB: GPUBuffer;
  /** Ping-pong spectra (Re h, Im h, Re Dx, Im Dx). */
  specTextures: [GPUTexture, GPUTexture];
  /** (Re Dz, Im Dz). */
  dzTextures: [GPUTexture, GPUTexture];
  /** Resolved field: (h, slopeX, slopeZ, jacobian). */
  field: GPUTexture;
  /** (dispX, dispZ, foam). */
  aux: GPUTexture;
  simAParams: GPUBuffer;
  fftParams: [GPUBuffer, GPUBuffer];
  resolveParams: GPUBuffer;
  bindGroups: {
    spectrum: GPUBindGroup[];
    fft: GPUBindGroup[][]; // [texture parity][params buffer]
    resolve: GPUBindGroup[];
  };
}

export interface WorldTextures {
  /** rgba16float: r = height (m), g = coast distance / worldSize, b = land mask, a = slope. */
  height: GPUTexture;
  /** r = height (m) for bathymetry sampling; stored as rgba16float too. */
  bathy: GPUTexture;
  /** CPU copy for use in the same frame's bind groups. */
  cityBuffer: GPUBuffer;
  heightBindGroup: GPUBindGroup;
}

export const HDR_FORMAT: GPUTextureFormat = 'rgba16float';

export function createTexture(
  device: GPUDevice, label: string, w: number, h: number,
  format: GPUTextureFormat, usage: GPUTextureUsageFlags, mips = 1, layers = 1,
): GPUTexture {
  return device.createTexture({
    label, size: { width: w, height: h, depthOrArrayLayers: layers }, format, usage, mipLevelCount: mips,
  });
}

export interface BakeTextures {
  height: GPUTexture;
  bathy: GPUTexture;
  slopeTexture: GPUTexture;
}

/** Upload a bake as display + bathymetry textures. */
export function uploadBake(
  device: GPUDevice, bake: HeightBake, layers: { height: Float32Array; bathy: Float32Array },
): BakeTextures {
  const size = bake.size;
  const height = createTexture(device, 'world-height', size, size, HDR_FORMAT,
    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
  const bathy = createTexture(device, 'world-bathy', size, size, HDR_FORMAT,
    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
  const slopeTexture = createTexture(device, 'world-slope', size, size, HDR_FORMAT,
    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);

  const upload = (tex: GPUTexture, data: Float32Array) => {
    const buf = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) buf[i] = floatToHalf(data[i]);
    device.queue.writeTexture(
      { texture: tex }, buf,
      { bytesPerRow: size * 2 * 4, rowsPerImage: size },
      { width: size, height: size, depthOrArrayLayers: 1 },
    );
  };
  upload(height, layers.height);
  upload(bathy, layers.bathy);
  // Slope is packed inside the height layer's alpha channel by worldLayerPack().
  const slope = new Float32Array(size * size);
  for (let i = 0; i < slope.length; i++) slope[i] = 0;
  upload(slopeTexture, slope);
  return { height, bathy, slopeTexture };
}

/** IEEE 754 half conversion (kept local so uploads do not depend on a DataView per texel). */
export function floatToHalf(v: number): number {
  const f32 = new Float32Array(1);
  const i32 = new Int32Array(f32.buffer);
  f32[0] = v;
  const x = i32[0];
  const sign = (x >> 16) & 0x8000;
  let exp = (x >> 23) & 0xff;
  let mant = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (mant ? 0x200 : 0);
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7c00;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >> (1 - exp);
    return sign | (mant >> 13);
  }
  return sign | (exp << 10) | (mant >> 13);
}

export function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) return sign * Math.pow(2, -14) * (mant / 1024);
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
}

/** Build spectrum + FFT + resolve resources for every cascade. */
export function createCascadeResources(
  device: GPUDevice,
  cascades: SpectrumCascade[],
  layouts: { oceanSim: GPUBindGroupLayout; fft: GPUBindGroupLayout; resolve: GPUBindGroupLayout },
): CascadeGpu[] {
  return cascades.map((c, ci) => {
    const n = c.cfg.size;
    const texels = n * n;
    const specAData = new Float32Array(texels * 4);
    const specBData = new Float32Array(texels * 4);
    for (let i = 0; i < texels; i++) {
      const ix = i % n, iz = (i / n) | 0;
      const jx = (n - ix) & (n - 1), jz = (n - iz) & (n - 1);
      const j = jz * n + jx;
      // h0(k) in xy, h0(-k) in zw (no conjugate: the shader applies the conjugate)
      specAData[i * 4 + 0] = c.h0Re[i];
      specAData[i * 4 + 1] = c.h0Im[i];
      specAData[i * 4 + 2] = c.h0Re[j];
      specAData[i * 4 + 3] = c.h0Im[j];
      specBData[i * 4 + 0] = c.kdirX[i];
      specBData[i * 4 + 1] = c.kdirZ[i];
      specBData[i * 4 + 2] = c.omega[i];
      specBData[i * 4 + 3] = c.scale;
    }
    const specA = device.createBuffer({ label: `spec-a-${ci}`, size: specAData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const specB = device.createBuffer({ label: `spec-b-${ci}`, size: specBData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(specA, 0, specAData);
    device.queue.writeBuffer(specB, 0, specBData);

    const texUsage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
    const mk = (label: string) => createTexture(device, label, n, n, HDR_FORMAT, texUsage);
    const specTextures: [GPUTexture, GPUTexture] = [mk(`spec-${ci}-0`), mk(`spec-${ci}-1`)];
    const dzTextures: [GPUTexture, GPUTexture] = [mk(`dz-${ci}-0`), mk(`dz-${ci}-1`)];
    const field = mk(`field-${ci}`);
    const aux = mk(`aux-${ci}`);

    const simAParams = device.createBuffer({ label: `ocean-sim-${ci}`, size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const fftParams = [0, 1].map(p => device.createBuffer({ label: `fft-${ci}-${p}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })) as [GPUBuffer, GPUBuffer];
    const resolveParams = device.createBuffer({ label: `resolve-${ci}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const spectrumBgs = [0, 1].map(p => device.createBindGroup({
      label: `spectrum-bg-${ci}-${p}`,
      layout: layouts.oceanSim,
      entries: [
        { binding: 0, resource: { buffer: simAParams } },
        { binding: 1, resource: { buffer: specA } },
        { binding: 2, resource: { buffer: specB } },
        { binding: 3, resource: specTextures[p].createView() },
        { binding: 4, resource: dzTextures[p].createView() },
      ],
    }));
    const fftBgs = [0, 1].map((src) => [0, 1].map((params) => device.createBindGroup({
      label: `fft-bg-${ci}-${src}-${params}`,
      layout: layouts.fft,
      entries: [
        { binding: 0, resource: { buffer: fftParams[params] } },
        { binding: 1, resource: specTextures[src].createView() },
        { binding: 2, resource: dzTextures[src].createView() },
        { binding: 3, resource: specTextures[1 - src].createView() },
        { binding: 4, resource: dzTextures[1 - src].createView() },
      ],
    })));
    const resolveBgs = [0, 1].map(p => device.createBindGroup({
      label: `resolve-bg-${ci}-${p}`,
      layout: layouts.resolve,
      entries: [
        { binding: 0, resource: { buffer: resolveParams } },
        { binding: 1, resource: specTextures[p].createView() },
        { binding: 2, resource: dzTextures[p].createView() },
        { binding: 3, resource: field.createView() },
        { binding: 4, resource: aux.createView() },
      ],
    }));

    return {
      cfg: c.cfg, specA, specB, specTextures, dzTextures, field, aux,
      simAParams, fftParams, resolveParams,
      bindGroups: { spectrum: spectrumBgs, fft: fftBgs, resolve: resolveBgs },
    };
  });
}

export function createFieldArray(device: GPUDevice, cascades: CascadeGpu[], size: number): GPUTexture {
  const tex = createTexture(device, 'cascade-fields', size, size, HDR_FORMAT,
    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, 1, cascades.length);
  return tex;
}
