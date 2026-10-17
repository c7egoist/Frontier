import { createImpulse } from './reverb';
import { softClipCurve } from './dsp';

export interface AudioGraph {
  /** Dry voice bus. */
  dry: GainNode;
  /** Reverb send bus. */
  wet: GainNode;
  /** Post-processing input (voices feed dry/wet, not this). */
  master: GainNode;
  analyser: AnalyserNode | null;
  dispose: () => void;
}

/**
 * Master chain:
 *
 *   voice -> dry --------------------------+
 *   voice -> send -> convolver -> wet ----+-> hp 24 -> compressor -> softclip -> master -> analyser -> out
 *
 * The compressor is deliberately gentle (3:1, soft knee) and the waveshaper
 * only catches peaks, so stacked UI layers stay glued instead of clipping.
 */
export function createGraph(
  ctx: BaseAudioContext,
  options: { space?: number } = {},
): AudioGraph {
  const nodes: AudioNode[] = [];
  const keep = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };

  const dry = keep(ctx.createGain());
  const wet = keep(ctx.createGain());
  wet.gain.value = options.space ?? 1;

  const sum = keep(ctx.createGain());
  dry.connect(sum);

  let tail: AudioNode = sum;

  // --- Reverb return -------------------------------------------------
  try {
    const convolver = ctx.createConvolver();
    convolver.buffer = createImpulse(ctx, {
      seconds: 1.25,
      decay: 3.1,
      preDelay: 0.012,
      damping: 0.62,
    });
    const wetReturn = keep(ctx.createGain());
    wetReturn.gain.value = 0.42;
    const wetHp = ctx.createBiquadFilter();
    wetHp.type = 'highpass';
    wetHp.frequency.value = 180;
    keep(wetHp);
    wet.connect(convolver);
    convolver.connect(wetHp);
    wetHp.connect(wetReturn);
    wetReturn.connect(sum);
  } catch {
    // Environments without convolution still get a usable dry signal.
    wet.connect(sum);
  }

  // --- Tone shaping / dynamics --------------------------------------
  try {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 24;
    hp.Q.value = 0.5;
    keep(hp);
    tail.connect(hp);
    tail = hp;
  } catch {
    /* noop */
  }

  try {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -17;
    compressor.knee.value = 14;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    keep(compressor);
    tail.connect(compressor);
    tail = compressor;
  } catch {
    /* noop */
  }

  try {
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(1.25);
    shaper.oversample = '2x';
    keep(shaper);
    tail.connect(shaper);
    tail = shaper;
  } catch {
    /* noop */
  }

  const master = keep(ctx.createGain());
  master.gain.value = 0.9;
  tail.connect(master);

  let analyser: AnalyserNode | null = null;
  try {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    keep(analyser);
    master.connect(analyser);
    analyser.connect(ctx.destination);
  } catch {
    master.connect(ctx.destination);
  }

  return {
    dry,
    wet,
    master,
    analyser,
    dispose: () => {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          /* noop */
        }
      }
    },
  };
}
