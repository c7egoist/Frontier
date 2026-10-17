/** Small, fast, seedable PRNG (mulberry32). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function rand(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Random element of an array. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** Random sign, -1 or 1. */
export function sign(rng: Rng): number {
  return rng() < 0.5 ? -1 : 1;
}
