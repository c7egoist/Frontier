/**
 * Envelope helpers — exponential curves for premium feel
 */

export function applyADSR(
  param: AudioParam,
  now: number,
  opts: { attack: number; decay: number; sustain: number; release: number; peak: number }
) {
  const { attack, decay, sustain, release, peak } = opts;
  param.setValueAtTime(0, now);
  param.linearRampToValueAtTime(peak, now + attack);
  param.linearRampToValueAtTime(peak * sustain, now + attack + decay);
  param.setValueAtTime(peak * sustain, now + attack + decay);
  param.exponentialRampToValueAtTime(0.0001, now + attack + decay + release);
}

export function sleekDecay(
  gain: AudioParam,
  now: number,
  attack = 0.005,
  decay = 0.18,
  peak = 0.5
) {
  gain.setValueAtTime(0, now);
  gain.linearRampToValueAtTime(peak, now + attack);
  gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
}
