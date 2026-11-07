import { mulberry32, clamp } from './utils.js';

const STYLES = [
  { id: 'street', w: 0.40 },
  { id: 'tunnel', w: 0.19 },
  { id: 'park', w: 0.22 },
  { id: 'bridge', w: 0.19 },
];

function weighted(rng, list) {
  let total = 0;
  for (const it of list) total += it.w;
  let r = rng() * total;
  for (const it of list) { r -= it.w; if (r <= 0) return it.id; }
  return list[list.length - 1].id;
}

const LANES = [-6, -2, 2, 6];

/** Decides the shape of the course: straights, 90° corners and what lives on them. */
export class CoursePlanner {
  constructor(seed = 20260207) {
    this.rng = mulberry32(seed);
    this.index = 0;
    this.straightsUntilTurn = 2;
    this.turnDir = 1;
    this.style = 'street';
    this.styleLeft = 2;
    this.deck = ['park', 'tunnel', 'bridge'];
    this.seedCounter = 1;
    this.afterTurn = false;
    this.rampCooldown = 0;
    this.total = 0;
  }

  get r() { return this.rng(); }

  next() {
    const rng = this.rng;
    const isTurn = this.index > 0 && this.straightsUntilTurn <= 0;

    if (isTurn) {
      this.straightsUntilTurn = 1 + (rng() < 0.55 ? 1 : 0) + (rng() < 0.16 ? 1 : 0);
      this.turnDir = rng() < 0.62 ? -this.turnDir : this.turnDir;
      const radius = 24 + rng() * 11;
      const spec = {
        kind: 'turn',
        angle: (Math.PI / 2) * this.turnDir,
        radius,
        dy: 0,
        style: this.style === 'tunnel' ? 'tunnel' : this.style === 'park' ? 'park' : 'street',
        features: [],
        seed: this.seedCounter++,
        index: this.index,
      };
      this.index++;
      this.afterTurn = true;
      return spec;
    }

    // ---- style runs
    this.styleLeft--;
    if (this.styleLeft <= 0) {
      if (this.style !== 'street') {
        // always breathe with a street run between feature sections
        this.style = 'street';
        this.styleLeft = 1 + Math.round(rng() * 2);
      } else {
        if (!this.deck.length) {
          this.deck = ['park', 'tunnel', 'bridge'];
          for (let i = this.deck.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            const t = this.deck[i]; this.deck[i] = this.deck[j]; this.deck[j] = t;
          }
        }
        this.style = this.deck.pop();
        this.styleLeft = 2 + Math.round(rng() * 2);
      }
    }

    const intensity = clamp(this.index / 26, 0, 1);
    const intro = this.index === 0;
    const len = intro ? 150 : 62 + rng() * 42 - intensity * 10;

    const spec = {
      kind: 'straight',
      len: Math.max(52, len),
      dy: this.style === 'bridge' ? (rng() < 0.5 ? 5 : 0) : 0,
      style: this.style,
      features: [],
      seed: this.seedCounter++,
      index: this.index,
    };
    if (this.style === 'bridge' && this.prevWasBridge === false) spec.dy = 0;
    this.prevWasBridge = this.style === 'bridge';

    spec.features = this.populate(spec, intensity, intro);

    this.straightsUntilTurn--;
    this.index++;
    this.afterTurn = false;
    return spec;
  }

  populate(spec, intensity, intro) {
    const rng = this.rng;
    const feats = [];
    const len = spec.len;
    const minU = intro ? 0.5 : this.afterTurn ? 0.42 : 0.28;
    const used = [];

    const laneAt = () => LANES[(rng() * LANES.length) | 0];
    const farEnough = (u, minGap = 0.26) => used.every((v) => Math.abs(v - u) > minGap);
    const mark = (u) => used.push(u);

    if (intro) {
      feats.push({ kind: 'coins', u: 0.62, x: 0, count: 8, gap: 7 });
      return feats;
    }

    // --- ramps
    this.rampCooldown--;
    if ((spec.style === 'street' || spec.style === 'park') && this.rampCooldown <= 0 && rng() < 0.55) {
      const u = minU + 0.24 + rng() * 0.16;
      const x = laneAt();
      feats.push({ kind: 'ramp', u, x });
      mark(u);
      this.rampCooldown = 2;
      // coin arc off the lip
      feats.push({ kind: 'coins', u: u + 0.17, x, count: 7, gap: 7.5, arc: 4.2 + 2.4 * intensity });
    }

    // --- rails in skate-park stretches
    if (spec.style === 'park' && rng() < 0.85) {
      const u = 0.22 + rng() * 0.2;
      feats.push({ kind: 'rail', u, x: (rng() < 0.5 ? -1 : 1) * (2 + 4 * ((rng() * 2) | 0)), length: 40 + rng() * 32 });
      mark(u + 0.15);
    }

    // --- obstacles
    const count = clamp(Math.round(0.9 + intensity * 2.3 + rng() * 1.1), 0, 3);
    const typesByStyle = {
      street: ['barrier', 'gate', 'lowbar', 'block', 'barrier', 'gate'],
      tunnel: ['gate', 'barrier', 'lowbar', 'gate'],
      park: ['barrier', 'lowbar', 'barrier', 'gate'],
      bridge: ['gate', 'barrier', 'lowbar', 'block'],
    };
    const pool = typesByStyle[spec.style] || typesByStyle.street;

    for (let i = 0; i < count; i++) {
      let u = 0;
      let tries = 0;
      do {
        u = minU + rng() * (0.93 - minU);
        tries++;
      } while (!farEnough(u, 0.24) && tries < 12);
      if (!farEnough(u, 0.2)) continue;
      mark(u);

      let type = pool[(rng() * pool.length) | 0];
      if (type === 'gate' && spec.style === 'park') type = 'barrier';
      const x = laneAt();
      feats.push({ kind: 'obstacle', u, x, type });

      // sometimes a twin obstacle leaving one clear lane
      if (intensity > 0.35 && rng() < 0.34) {
        let x2 = LANES[(rng() * LANES.length) | 0];
        if (Math.abs(x2 - x) < 4.5) x2 = x > 0 ? -6 : 6;
        feats.push({ kind: 'obstacle', u: u + 0.02, x: x2, type: pool[(rng() * pool.length) | 0] === 'gate' ? 'barrier' : 'lowbar' });
      }

      if (rng() < 0.3) {
        feats.push({ kind: 'coins', u: u - 0.12, x: (rng() * 2 - 1) * 6, count: 4, gap: 6 });
      }
    }

    // --- boost pad
    if (rng() < 0.4) {
      const u = 0.12 + rng() * 0.3;
      if (farEnough(u, 0.14)) {
        feats.push({ kind: 'pad', u, x: laneAt() });
        mark(u);
      }
    }

    // --- default coin trail
    if (rng() < 0.85) {
      feats.push({ kind: 'coins', u: 0.2 + rng() * 0.25, x: laneAt(), count: 5 + ((rng() * 4) | 0), gap: 7 });
    }

    feats.sort((a, b) => a.u - b.u);
    return feats;
  }
}
