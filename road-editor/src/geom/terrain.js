// Procedural ground height. Deterministic, smooth and cheap to evaluate, so the
// batter, bridge and guardrail logic can probe it thousands of times per build.

export function makeTerrain(cfg = {}) {
  const mode = cfg.mode === 'flat' ? 'flat' : 'rolling';
  const amplitude = mode === 'flat' ? 0 : Math.max(0, Number(cfg.amplitude ?? 2.4));
  const wavelength = Math.max(20, Number(cfg.wavelength ?? 180));
  const seed = Number(cfg.seed ?? 7);
  const base = Number(cfg.base ?? 0);
  const k = (2 * Math.PI) / wavelength;
  const p1 = seed * 0.37;
  const p2 = seed * 0.71;
  const p3 = seed * 1.13;
  const height = (x, z) => {
    if (!amplitude) return base;
    return (
      base +
      amplitude *
        (0.55 * Math.sin(k * x + p1) * Math.cos(0.8 * k * z + p2) +
          0.3 * Math.sin(0.55 * k * (x + z) + p3) +
          0.15 * Math.cos(2.3 * k * z - 1.7 * k * x + p2))
    );
  };
  return { mode, amplitude, base, wavelength, seed, height };
}
