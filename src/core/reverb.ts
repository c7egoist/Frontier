import { mulberry32 } from './rng';

export interface ImpulseOptions {
  seconds?: number;
  decay?: number;
  preDelay?: number;
  /** One-pole lowpass damping, 0 = bypass, 0.9 = very dark. */
  damping?: number;
}

/**
 * Builds a short, dark, slightly diffuse impulse response in code.
 *
 * This is not a plate emulation — it is the "studio room" the interface lives
 * in: just enough early energy to make clicks feel physical and a short
 * low-passed tail that never washes out speech or music.
 */
export function createImpulse(
  ctx: BaseAudioContext,
  options: ImpulseOptions = {},
): AudioBuffer {
  const seconds = options.seconds ?? 1.1;
  const decay = options.decay ?? 2.8;
  const preDelay = options.preDelay ?? 0.01;
  const damping = options.damping ?? 0.55;

  const rate = ctx.sampleRate;
  const length = Math.max(64, Math.floor(seconds * rate));
  const buffer = ctx.createBuffer(2, length, rate);
  const preDelaySamples = Math.floor(preDelay * rate);
  const rng = mulberry32(0x1234abcd);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        data[i] = 0;
        continue;
      }
      const t = (i - preDelaySamples) / (length - preDelaySamples);
      // Slightly different curves per channel for a wide but coherent image.
      const envelope = (1 - t) ** (decay + channel * 0.15);
      const white = rng() * 2 - 1;
      lp += (1 - damping) * (white - lp);
      // A few early reflections make the space feel like a room, not a wash.
      const early = i - preDelaySamples;
      const reflection =
        (early === Math.floor(rate * 0.007) ? 0.55 : 0) +
        (early === Math.floor(rate * 0.013 * (channel + 1)) ? 0.35 : 0) +
        (early === Math.floor(rate * 0.021) ? 0.2 : 0);
      data[i] = (lp * envelope + white * envelope * reflection) * 0.7;
    }
  }
  return buffer;
}
