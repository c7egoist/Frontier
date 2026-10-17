/**
 * Procedural reverb impulse — sleek plate, not cavernous.
 * Iron Man UI uses tiny, bright, early-reflection heavy spaces.
 */

export function createSleekReverbIR(
  ctx: AudioContext,
  duration = 0.8,
  decay = 2.2,
  brightness = 0.7
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Exponential decay with slight diffusion
      const env = Math.exp(-decay * t) * (1 - t / duration);

      // Early reflections clustering (Stark HUD has glassy early)
      let early = 0;
      if (t < 0.03) {
        // sparse early taps
        if (Math.random() < 0.15) early = (Math.random() * 2 - 1) * Math.exp(-t * 60) * 0.4;
      }

      // Late diffuse — filtered noise with high-frequency rolloff
      const late = (Math.random() * 2 - 1) * env * (0.5 + brightness * 0.5);

      // Slight stereo decorrelation
      const stereoMod = ch === 0 ? 1 : 0.9 + Math.random() * 0.2;

      // High-frequency damping to avoid metallic harshness
      const damp = Math.exp(-t * (3 - brightness * 2));

      data[i] = (late * damp + early) * stereoMod;
    }
  }

  // Normalize lightly, keep headroom
  let max = 0;
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
  }
  if (max > 0) {
    const norm = 0.65 / max;
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] *= norm;
    }
  }

  return impulse;
}

export function createTinyRoomIR(ctx: AudioContext): AudioBuffer {
  return createSleekReverbIR(ctx, 0.35, 4.5, 0.85);
}

export function createPlateIR(ctx: AudioContext): AudioBuffer {
  return createSleekReverbIR(ctx, 0.9, 1.8, 0.6);
}
