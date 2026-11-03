// Static GPU-side data computed once per spectrum rebuild.
//
// Every dispatch in a frame shares one command encoder, so a uniform buffer written twice in a
// frame is seen by all passes with its last value. Anything that does not change per frame is
// therefore uploaded exactly once, here, and never touched again:
//   * FFT params (n, axis, step, inverse) — 2 buffers per cascade, alternating so no pass
//     overwrites the params of a pass that has not been submitted yet
//   * Resolve params (n, tile, 1/N^2, choppiness) — rewritten only when choppiness changes
// Only the spectrum time and the sim timestep are per-frame.

import type { SpectrumCascade } from '../core/oceanSpectrum.ts';
import { buildFftChain, type FftChain } from './oceanChain.ts';
import { writeFftParams, writeResolve, FFT_PARAMS_FLOATS, RESOLVE_FLOATS } from './uniforms.ts';

export interface CascadeStatic {
  chain: FftChain;
  /** Params buffer used by each pass (index into fftParams buffers). */
  paramSlot: number[];
}

export function uploadStaticCascadeParams(
  device: GPUDevice,
  cascades: SpectrumCascade[],
  params: { fftParams: [GPUBuffer, GPUBuffer]; resolveParams: GPUBuffer }[],
  choppiness: number,
): CascadeStatic[] {
  return cascades.map((c, i) => {
    const n = c.cfg.size;
    const chain = buildFftChain(n);
    const target = params[i];
    const slotBuf = new Uint32Array(FFT_PARAMS_FLOATS);
    const paramSlot: number[] = [];
    for (let p = 0; p < chain.passes.length; p++) {
      const slot = p % 2;
      writeFftParams(slotBuf, { n, axis: chain.passes[p].axis, step: chain.passes[p].step, inv: 1 });
      device.queue.writeBuffer(target.fftParams[slot], 0, slotBuf);
      paramSlot.push(slot);
    }
    const resBuf = new Float32Array(RESOLVE_FLOATS);
    writeResolve(resBuf, { n, tile: c.cfg.tile, invScale: 1 / (n * n), choppy: choppiness });
    device.queue.writeBuffer(target.resolveParams, 0, resBuf);
    return { chain, paramSlot };
  });
}
