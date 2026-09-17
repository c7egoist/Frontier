// Deterministic pseudo-random number generation.
// Every building is generated from a seed, so the same seed always rebuilds
// the exact same geometry (the "procedural graph" promise).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) {
    if (typeof seed === 'string') seed = hashStringToSeed(seed);
    this.seed = seed >>> 0 || 1;
    this._f = mulberry32(this.seed);
  }

  /** float in [a,b) */
  float(a = 0, b = 1) {
    return a + (b - a) * this._f();
  }

  /** integer in [a,b] inclusive */
  int(a, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return Math.floor(a + (b - a + 1) * this._f() - 1e-9) | 0;
  }

  bool(p = 0.5) {
    return this._f() < p;
  }

  sign() {
    return this._f() < 0.5 ? -1 : 1;
  }

  pick(arr) {
    if (!arr || !arr.length) return undefined;
    return arr[Math.floor(this._f() * arr.length) % arr.length];
  }

  /** weigh an array of {value, weight} */
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.weight ?? 1;
    let r = this._f() * total;
    for (const it of items) {
      r -= it.weight ?? 1;
      if (r <= 0) return it.value;
    }
    return items[items.length - 1].value;
  }

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._f() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** roughly gaussian, mean 0, sd ~1 */
  gauss() {
    return (this._f() + this._f() + this._f() + this._f() - 2) * 1.1;
  }

  /** jitter a value by +/- amount */
  jitter(v, amount) {
    return v + (this._f() * 2 - 1) * amount;
  }

  range(a, b) {
    return this.float(a, b);
  }
}
