// The FFT pass chain, as data.
//
// Why this is its own module: every dispatch in a frame is recorded into one command encoder,
// so a uniform buffer written twice in a frame is seen by *every* pass with its final value.
// The FFT therefore cannot rewind one params buffer per pass; the whole chain is planned up
// front, its params are static (n, axis, step, inv never change), and only the two per-frame
// values (time, sim dt) are rewritten. This module is also what tests/chain.ts exercises to
// prove each pass reads the texture the previous pass wrote.

export interface FftPass {
  axis: 0 | 1;
  step: number;
  /** Texture parity this pass reads from. */
  read: 0 | 1;
  /** Texture parity this pass writes to. */
  write: 0 | 1;
  label: string;
}

export interface FftChain {
  passes: FftPass[];
  /** Parity holding the finished inverse transform. */
  result: 0 | 1;
  /** Number of butterflies per axis (log2 n), not counting the permutation. */
  log2n: number;
}

/**
 * Build the pass list for an N x N complex inverse transform.
 * Pass 0..log2n  = permutation + butterflies along rows (axis 0)
 * Pass ..        = same along columns (axis 1)
 * The spectrum pass wrote into texture 0, so pass 0 reads 0.
 */
export function buildFftChain(n: number): FftChain {
  const log2n = Math.round(Math.log2(n));
  if (2 ** log2n !== n) throw new Error(`FFT size must be a power of two, got ${n}`);
  const passes: FftPass[] = [];
  let read: 0 | 1 = 0;
  for (const axis of [0, 1] as const) {
    for (let step = 0; step <= log2n; step++) {
      passes.push({
        axis,
        step,
        read,
        write: (1 - read) as 0 | 1,
        label: `fft-${axis === 0 ? 'rows' : 'cols'}-${step === 0 ? 'permute' : `stage${step}`}`,
      });
      read = (1 - read) as 0 | 1;
    }
  }
  return { passes, result: read, log2n };
}

/**
 * Sim ping-pong plan for a frame. `startParity` is the texture holding the previous frame's
 * state; each step writes into the other one. Returns the bind group index to use per step and
 * the parity the frame ends in.
 */
export function planSimSteps(startParity: 0 | 1, steps: number): { writeParity: (0 | 1)[]; endParity: 0 | 1 } {
  const writeParity: (0 | 1)[] = [];
  let parity = startParity;
  for (let i = 0; i < steps; i++) {
    parity = (1 - parity) as 0 | 1;
    writeParity.push(parity);
  }
  return { writeParity, endParity: parity };
}
