import { rng, groundY } from './course.js';

// Fixed-capacity debris pool. Visual only: small stones do not become invisible car colliders.
export class DebrisSimulation {
  constructor(seed = 2401, capacity = 2400, floor = groundY) {
    this.random = rng(seed); this.floor = floor;
    this.capacity = capacity;
    this.particles = Array.from({ length: capacity }, () => ({ alive: false }));
    this.cursor = 0;
    this.emitted = 0;
  }
  emit(x, y, z, strength = 1, count = 48, sourceRadius = 0) {
    const random = this.random;
    for (let i = 0; i < count; i++) {
      const kind = i % 7 === 0 ? 'rock' : i % 4 === 0 ? 'dust' : 'sand';
      const angle = random() * Math.PI * 2, radius = sourceRadius + random() * 1.8;
      const outward = (1.5 + random() * 6) * strength;
      const p = this.particles[this.cursor];
      Object.assign(p, { alive: true, kind, age: 0, bounces: 0,
        x: x + Math.cos(angle) * radius, y: y + .1 + random() * .3, z: z + Math.sin(angle) * radius,
        vx: Math.cos(angle) * outward, vy: (3 + random() * 10) * strength, vz: Math.sin(angle) * outward,
        size: kind === 'rock' ? .12 + random() * .4 : kind === 'dust' ? .8 + random() * 1.4 : .04 + random() * .11,
        life: kind === 'rock' ? 4 + random() * 3 : kind === 'dust' ? 2 + random() * 2 : 1.1 + random() * 1.6,
        spin: random() * 8, rotation: random() * Math.PI * 2, alpha: 1 });
      this.cursor = (this.cursor + 1) % this.capacity; this.emitted++;
    }
  }
  update(dt) {
    for (const p of this.particles) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      if (p.kind === 'dust') {
        p.vy *= Math.exp(-2 * dt); p.vx *= Math.exp(-1.2 * dt); p.vz *= Math.exp(-1.2 * dt);
        p.y += (.35 + p.vy * .12) * dt;
      } else {
        p.vy -= 17 * dt; p.y += p.vy * dt;
      }
      p.x += p.vx * dt; p.z += p.vz * dt; p.rotation += p.spin * dt;
      const floor = this.floor(p.z, p.x) + (p.kind === 'rock' ? p.size * .6 : .02);
      if (p.y < floor && p.kind !== 'dust') {
        p.y = floor;
        if (p.kind === 'rock' && p.bounces < 2 && Math.abs(p.vy) > 1) {
          p.vy = Math.abs(p.vy) * .3; p.vx *= .52; p.vz *= .52; p.bounces++;
        } else { p.vy = 0; p.vx *= Math.exp(-8 * dt); p.vz *= Math.exp(-8 * dt); }
      }
      p.alpha = Math.min(1, (p.life - p.age) / .7) * (p.kind === 'dust' ? .24 : 1);
    }
  }
  clear() { this.particles.forEach(p => p.alive = false); this.cursor = 0; this.emitted = 0; }
  get activeCount() { return this.particles.reduce((n, p) => n + Number(p.alive), 0); }
}

// Time crossing rather than per-frame randomness: bursts cannot be missed at a low frame rate.
export class EruptionEmitter {
  constructor(simulation) { this.simulation = simulation; this.history = new Map(); }
  update(roots, time, preview = false, focusZ = null) {
    for (const root of roots) {
      if (focusZ !== null && Math.abs(root.z - focusZ) > 200) continue;
      const age = preview ? root.previewAge + (time % 38) : root.age;
      const key = `${root.id}:${root.generation}`;
      const previous = this.history.get(key);
      if (age < 0 || age < (previous ?? -1)) { this.history.set(key, age); continue; }
      if (previous === undefined && age > root.warning + 2) { this.history.set(key, age); continue; }
      const start = previous ?? -1, erupt = root.warning;
      const stemAge = Math.max(0, age - erupt);
      const perimeter = root.thickness * Math.min(1, stemAge / root.branches[0].duration) * (1 + .48 * Math.log1p(stemAge / 8)) * 1.3;
      if (!root.preGrown || preview) {
        if (start < erupt && age >= erupt) this.simulation.emit(root.x, groundY(root.z), root.z, 1.1, 110);
        // Soil keeps being lifted at the base while the living root thickens and pushes out.
        const first = Math.max(0, Math.floor((Math.max(start, erupt) - erupt) / .38));
        const last = Math.max(0, Math.floor((age - erupt) / .38));
        for (let i = first + 1; i <= Math.min(last, first + 6); i++)
          if (i < 52 || i % 4 === 0) this.simulation.emit(root.x, groundY(root.z), root.z, i < 52 ? .55 : .32, 13, perimeter);
      }
      this.history.set(key, age);
    }
    // Recycled root sites must not grow an unbounded event-history map.
    if (this.history.size > roots.length * 3) {
      const live = new Set(roots.map(r => `${r.id}:${r.generation}`));
      for (const key of this.history.keys()) if (!live.has(key)) this.history.delete(key);
    }
  }
  clear() { this.history.clear(); this.simulation.clear(); }
}
