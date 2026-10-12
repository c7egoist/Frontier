// Civilian traffic on the avenue sections. Traffic moves in lanes at a steady pace, changes
// lanes now and then, and is physical: racers have to weave around it or bounce off.

import * as THREE from 'three';
import { CFG } from './config.js';
import { buildCarMesh, poseOnTrack } from './carmesh.js';

const PALETTE = [0xe8edf7, 0x2b2f3f, 0xff5a7a, 0x3ad6ff, 0xffb13b, 0x8bff6a, 0x9b7bff];

export class Traffic {
  constructor(track, scene, rng) {
    this.track = track;
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
    this.sections = track.sectionList().filter(([n]) => n.startsWith('avenue'));
    const per = Math.ceil(CFG.TRAFFIC_COUNT / this.sections.length);
    let id = 0;
    for (const [name, s0, s1] of this.sections) {
      for (let i = 0; i < per && id < CFG.TRAFFIC_COUNT; i++, id++) {
        const color = PALETTE[(rng() * PALETTE.length) | 0];
        const accent = [0x33e6ff, 0xff3fa4, 0xffd23f][(rng() * 3) | 0];
        const mesh = buildCarMesh(color, accent, { scale: 0.95 });
        scene.add(mesh.root);
        const car = {
          id, s0, s1,
          s: s0 + ((s1 - s0) * (i + rng() * 0.6)) / per,
          x: 0,
          tx: 0,
          v: 30 + rng() * 9,
          alive: true,
          respawn: 0,
          laneTimer: 2 + rng() * 4,
          mesh,
          hitCooldown: 0,
          bobPhase: rng() * 6,
        };
        car.x = laneX(Math.floor(rng() * CFG.LANES));
        car.tx = car.x;
        this.cars.push(car);
      }
    }
  }

  update(dt, time) {
    const f = this._f || (this._f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] });
    for (const c of this.cars) {
      if (!c.alive) {
        c.respawn -= dt;
        c.mesh.root.visible = false;
        if (c.respawn <= 0) {
          c.alive = true;
          c.s = c.s0 + this.rng() * 6;
          c.v = 30 + this.rng() * 9;
          c.tx = laneX(Math.floor(this.rng() * CFG.LANES));
          c.x = c.tx;
          c.mesh.root.visible = true;
        }
        continue;
      }
      c.s += c.v * dt;
      c.hitCooldown = Math.max(0, c.hitCooldown - dt);
      c.laneTimer -= dt;
      if (c.laneTimer <= 0) {
        c.laneTimer = 2.5 + this.rng() * 4;
        c.tx = laneX(Math.floor(this.rng() * CFG.LANES));
      }
      c.x += (c.tx - c.x) * Math.min(1, dt * 1.4);
      c.v += (32 + (c.id % 5) - c.v) * Math.min(1, dt * 0.2); // gentle speed drift
      if (c.s > c.s1 + 4) {
        c.alive = false;
        c.respawn = 0.8 + this.rng() * 2.6;
        continue;
      }
      this.track.frame(c.s, f);
      poseOnTrack(c.mesh.root, f, c.x, 0, 0);
      // Wheel spin and a little suspension bob
      const spin = c.s / 0.42;
      for (const w of c.mesh.wheels) w.spin.rotation.x = spin;
      c.mesh.body.position.y = Math.sin(time * 9 + c.bobPhase) * 0.01;
    }
  }

  // Cars the race uses for collision: wrapped s, lateral x, speed, index.
  alive() {
    return this.cars.filter((c) => c.alive);
  }
}

function laneX(j) {
  return (j - (CFG.LANES - 1) / 2) * CFG.LANE_W;
}
