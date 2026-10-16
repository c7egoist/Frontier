// Render context shared by every generator: sample rate, a seeded RNG, the global
// condition (wet / wear / size / room) and an optional custom surface.

import { rng, reverb, applyFade, normalizePeak, clamp } from "./dsp.js";
import { effectiveMaterial, DEFAULT_CONDITION } from "./materials.js";

export function makeCtx({ sr = 44100, seed = 1, cond = {}, custom = null } = {}) {
  const condition = { ...DEFAULT_CONDITION, ...cond };
  condition.wet = clamp(condition.wet, 0, 1);
  condition.wear = clamp(condition.wear, 0, 1);
  condition.room = clamp(condition.room, 0, 1);
  condition.size = clamp(condition.size, 0.2, 5);
  return {
    sr,
    r: rng(seed),
    cond: condition,
    custom,
    // effective surface numbers for a material id, with the condition applied
    mat: (id) => effectiveMaterial(id, condition, custom),
  };
}

// Final stage for every sound: room tail, edge fades and a level target.
// `level` in 0..1 sets the peak as a fraction of full scale so that a soft knock
// comes out quieter than a hard one, instead of everything being peak-normalised.
export function finish(ctx, x, level = 1) {
  let y = x;
  if (ctx.cond.room > 0.001) {
    y = reverb(y, ctx.sr, {
      mix: 0.35 * ctx.cond.room,
      decaySec: 0.5 + 1.8 * ctx.cond.room,
      damp: 0.45,
    });
  }
  applyFade(y, ctx.sr, 0.001, 0.012);
  normalizePeak(y, 0.89 * (0.2 + 0.8 * clamp(level, 0, 1)));
  return y;
}
