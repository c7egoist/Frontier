// Race controller: builds the field and world objects, steps the simulation,
// resolves collisions, tracks laps and positions, and reports events to the UI.

import * as THREE from 'three';
import { CFG, DIFFICULTY, TEAMS } from './config.js';
import { Track } from './track.js';
import { World, laneX, orientOnRoad, placeOnTrack } from './world.js';
import { makeCar, stepCar } from './car.js';
import { buildCarMesh, buildShadow, poseOnTrack } from './carmesh.js';
import { aiControl } from './ai.js';
import { ZipperSystem } from './zipper.js';
import { Traffic } from './traffic.js';
import { LevelCrossing, Monorail } from './trains.js';
import { Particles } from './particles.js';
import { mulberry32 } from './world.js';

const NAMES_A = ['NOVA', 'VEGA', 'KITE'];
const NAMES_B = ['OMEGA-1', 'RAZOR', 'SIREN', 'QUASAR'];

export class Race {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.mode = opts.mode || 'solo';         // 'solo': AI caller, 'coop': human caller (keys 1-5)
    this.diff = DIFFICULTY[opts.difficulty || 'pro'];
    this.seed = opts.seed || 7;
    this.rng = mulberry32(this.seed);

    this.track = new Track();
    this.world = new World(scene, this.track, { seed: this.seed });
    this.zipper = new ZipperSystem(this.track, scene);
    this.traffic = new Traffic(this.track, scene, this.rng);
    this.crossings = [];
    const crossSecs = this.track.sectionList().filter(([n]) => n.startsWith('crossing'));
    crossSecs.forEach(([n, s0, s1], i) => {
      this.crossings.push(new LevelCrossing(this.track, scene, (s0 + s1) / 2, this.rng, { delay: CFG.TRAIN_FIRST + i * 9 }));
    });
    this.monorail = new Monorail(this.track, scene);
    this.particles = new Particles(scene);

    this.cars = [];
    this.player = null;
    this.time = 0;
    this.phase = 'countdown';
    this.countdown = CFG.COUNTDOWN;
    this.shake = 0;
    this.events = [];          // UI events for this frame
    this.manualCallUntil = -1;
    this.callerLane = this.zipper.cmd;
    this.finishOrder = [];
    this.finishTimer = 0;
    this.lastCallTick = 0;
    this._f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
    this._buildField();
  }

  _buildField() {
    const L = this.track.L;
    const colorsA = TEAMS.A.colors, colorsB = TEAMS.B.colors;
    const list = [];
    list.push(makeCar({ id: 0, name: 'YOU', team: 'A', color: colorsA[0], isPlayer: true }));
    NAMES_A.forEach((n, i) => list.push(makeCar({ id: 1 + i, name: n, team: 'A', color: colorsA[1 + i] })));
    NAMES_B.forEach((n, i) => list.push(makeCar({ id: 4 + i, name: n, team: 'B', color: colorsB[i] })));

    list.forEach((car, k) => {
      const row = Math.floor(k / 2);
      const col = k % 2;
      car.dist = -(row * CFG.GRID_GAP) - 8;
      car.x = col ? laneX(3) : laneX(1);
      car.lane = col ? 3 : 1;
      car.lastLane = car.lane;
      car.teamA = car.team === 'A';
      car.lineX = car.isPlayer ? 0 : (this.rng() - 0.5) * 4;
      car.energy = CFG.ENERGY_MAX * 0.5;
      car.lapsDone = 0;
      car.lastLapStart = 0;
      car.clock = 0;
      car.prevDist = car.dist;
      car.mesh = buildCarMesh(car.color, car.team === 'A' ? TEAMS.A.accent : TEAMS.B.accent);
      this.scene.add(car.mesh.root);
      car.shadow = buildShadow();
      this.scene.add(car.shadow);
      car.ai = car.isPlayer ? null : { skill: this.diff.aiSkill };
      car.lapTimes = [];
      this.cars.push(car);
      if (car.isPlayer) this.player = car;
    });
    // Place the cars on the track
    for (const car of this.cars) {
      const f = this.track.frame(car.dist, this._f);
      car.y = f.H;
    }
  }

  // Input for this frame. driver: {steer,throttle,brake,boost,drift}. callerLane: 0..4 or null.
  update(dt, driver, callerLane = null) {
    const track = this.track;
    const L = track.L;
    this.time += dt;
    this.events.length = 0;
    this.shake = Math.max(0, this.shake - dt * 2.5);

    // ---- Countdown -------------------------------------------------------------
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && this.countdown > 0) this.events.push({ type: 'tick', n: after });
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.raceStart = this.time;
        this.events.push({ type: 'go' });
      }
    }

    // ---- Caller ----------------------------------------------------------------
    if (callerLane !== null) {
      this.zipper.setCommand(callerLane);
      this.manualCallUntil = this.time + 4;
      this.events.push({ type: 'lane', lane: callerLane, manual: true });
    } else if (this.mode === 'solo' && this.time > this.manualCallUntil && this.phase === 'racing') {
      const pick = this._aiCallerLane();
      if (pick !== null && pick !== this.zipper.cmd) {
        this.zipper.setCommand(pick);
      }
    }
    this.callerLane = this.zipper.cmd;

    // ---- Inputs ----------------------------------------------------------------
    const ctx = {
      track, zipper: this.zipper, traffic: this.traffic.alive(),
      trains: this.crossings, racers: this.cars, diff: this.diff,
    };
    for (const car of this.cars) {
      car.clock = this.time;
      if (car.isPlayer) {
        const racing = this.phase === 'racing' && !car.finished;
        car.input.steer = racing ? driver.steer : 0;
        car.input.throttle = this.phase === 'racing' && !car.finished ? driver.throttle : 0;
        car.input.brake = this.phase === 'racing' && !car.finished ? driver.brake : 1;
        car.input.boost = this.phase === 'racing' && driver.boost;
        car.input.drift = this.phase === 'racing' && driver.drift;
      } else {
        if (this.phase === 'racing' && !car.finished) {
          aiControl(car, ctx);
        } else {
          car.input.throttle = 0;
          car.input.brake = 1;
          car.input.steer = 0;
          car.input.boost = false;
        }
      }
    }

    // ---- Physics ---------------------------------------------------------------
    const frameEvents = [];
    for (const car of this.cars) {
      car.prevDist = car.dist;
      stepCar(car, dt, track, frameEvents);
      if (car.isPlayer) car.input.throttle = car.input.throttle;
    }

    // Zipper reveal and checks
    const lead = Math.max(...this.cars.map((c) => c.dist));
    this.zipper.reveal(lead);
    this.zipper.update(dt, this.time);
    for (const car of this.cars) this.zipper.checkCar(car, frameEvents, car.prevDist);

    // Traffic
    this.traffic.update(dt, this.time);
    this._collideTraffic(frameEvents);

    // Trains
    for (const cr of this.crossings) {
      const evs = cr.update(dt);
      for (const e of evs) {
        if (e === 'warn') this.events.push({ type: 'train_warn' });
        if (e === 'pass') this.events.push({ type: 'train_pass' });
      }
      for (const car of this.cars) {
        const s = track.wrap(car.dist);
        if (cr.hazard(car, s) && !(car.hitCooldown.get('train' + cr.sC) > this.time)) {
          car.hitCooldown.set('train' + cr.sC, this.time + 3);
          frameEvents.push({ type: 'trainhit', car, power: car.v });
        }
      }
    }
    this.monorail.update(dt);

    // Car-car contact
    this._collideCars(frameEvents);

    // Boost pads
    this._checkPads(frameEvents);

    // Lap and finish bookkeeping
    this._updateLaps(frameEvents);

    // Process events
    for (const e of frameEvents) this._handleEvent(e);

    // Visuals
    this._updateVisuals(dt);

    // Results timing
    if (this.phase === 'racing') {
      if (this.player.finished) this.finishTimer += dt;
      const allDone = this.cars.every((c) => c.finished);
      if (allDone || this.finishTimer > 45) this.phase = 'results';
    }
    return this.events;
  }

  _aiCallerLane() {
    // The AI caller draws the gap toward the team's next car to reach the zipper.
    const L = this.track.L;
    let best = null, bestD = Infinity;
    for (const car of this.cars) {
      if (car.team !== 'A') continue;
      const next = this._nextZipDist(car.dist);
      if (next === null) continue;
      const d = next - car.dist;
      if (d < -10 || d > 260) continue;
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return null;
    return laneIndexOf(best.x);
  }

  _nextZipDist(dist) {
    const z = this.zipper.entries;
    for (let i = 0; i < z.length; i++) {
      if (z[i].dist > dist - 10) return z[i].dist;
    }
    return null;
  }

  _collideTraffic(events) {
    const L = this.track.L;
    for (const car of this.cars) {
      const s = this.track.wrap(car.dist);
      for (const t of this.traffic.cars) {
        if (!t.alive) continue;
        let ds = s - t.s;
        ds = ((ds + L / 2) % L + L) % L - L / 2;
        const dx = car.x - t.x;
        if (Math.abs(ds) < CFG.CAR_HALF_L * 2 - 0.4 && Math.abs(dx) < CFG.CAR_HALF_W * 2 - 0.1) {
          const key = 'tr' + t.id;
          if ((car.hitCooldown.get(key) ?? -9) > this.time) continue;
          car.hitCooldown.set(key, this.time + 0.9);
          if (t.hitCooldown > 0) continue;
          t.hitCooldown = 0.9;
          events.push({ type: 'traffic', car, power: car.v, t, dx: Math.sign(dx || 1) });
        }
      }
    }
  }

  _collideCars(events) {
    const L = this.track.L;
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        const a = this.cars[i], b = this.cars[j];
        let ds = a.dist - b.dist;
        ds = ((ds % L) + L + L / 2) % L - L / 2;
        // Only cars on the same stretch of road touch.
        if (Math.abs(ds) > CFG.CAR_HALF_L * 2 - 0.3) continue;
        const dx = a.x - b.x;
        if (Math.abs(dx) > CFG.CAR_HALF_W * 2 - 0.2) continue;
        if (Math.abs(a.y - b.y) > CFG.CAR_H + 0.4) continue;
        const key = 'cc' + Math.min(a.id, b.id) + '_' + Math.max(a.id, b.id);
        if ((a.hitCooldown.get(key) ?? -9) > this.time) continue;
        a.hitCooldown.set(key, this.time + 0.6);
        b.hitCooldown.set(key, this.time + 0.6);
        events.push({ type: 'carcar', a, b, dx: Math.sign(dx || 1), ds: Math.sign(ds || 1), power: Math.abs(a.v - b.v) });
      }
    }
  }

  _checkPads(events) {
    for (const car of this.cars) {
      const s = this.track.wrap(car.dist);
      for (let k = 0; k < this.world.pads.length; k++) {
        const pad = this.world.pads[k];
        if (s < pad.s0 || s > pad.s1) continue;
        if (Math.abs(car.x) > 7.4) continue;
        const key = 'pad' + k;
        if ((car.padCooldown.get(key) ?? -9) > this.time) continue;
        car.padCooldown.set(key, this.time + 2);
        events.push({ type: 'pad', car });
      }
    }
  }

  _updateLaps(events) {
    const L = this.track.L;
    for (const car of this.cars) {
      const lapsNow = Math.max(0, Math.floor(car.dist / L));
      if (lapsNow > car.lapsDone) {
        const lapTime = this.time - car.lastLapStart;
        car.lapTimes.push(lapTime);
        car.lastLapStart = this.time;
        car.lapsDone = lapsNow;
        events.push({ type: 'lap', car, lap: lapsNow, lapTime });
      }
      if (!car.finished && car.dist >= CFG.LAPS * L) {
        car.finished = true;
        car.finishTime = this.time;
        this.finishOrder.push(car);
        events.push({ type: 'finish', car, place: this.finishOrder.length });
      }
    }
  }

  _handleEvent(e) {
    const car = e.car;
    switch (e.type) {
      case 'bollard': {
        car.stun = Math.max(car.stun, 0.6);
        car.v *= 0.45;
        const side = Math.sign(car.x - laneX(e.lane)) || (Math.random() < 0.5 ? -1 : 1);
        car.vx += side * 9;
        this.sparks(car, 22);
        this.events.push({ type: 'sfx', name: 'bollard', car });
        if (car.isPlayer) { this.shake = 1; this.events.push({ type: 'msg', text: 'BOLLARD!', tone: 'bad' }); }
        break;
      }
      case 'zip': {
        if (car.team === 'A' || car.isPlayer) car.energy = Math.min(CFG.ENERGY_MAX, car.energy + CFG.ENERGY_ZIP);
        if (car.isPlayer && this.time - (this._zipMsgT || -9) > 3) {
          this._zipMsgT = this.time;
          this.events.push({ type: 'msg', text: 'CLEAN ZIP  +ENERGY', tone: 'good' });
        }
        this.events.push({ type: 'sfx', name: 'zip', car });
        break;
      }
      case 'wall': {
        this.sparks(car, 12);
        if (car.isPlayer) this.shake = Math.max(this.shake, 0.4);
        this.events.push({ type: 'sfx', name: 'impact', car, power: e.power });
        break;
      }
      case 'jump': {
        if (car.isPlayer) this.events.push({ type: 'msg', text: 'AIRBORNE', tone: 'info' });
        this.events.push({ type: 'sfx', name: 'jump', car });
        break;
      }
      case 'land': {
        if (car.isPlayer) this.shake = Math.max(this.shake, Math.min(1, e.power / 20));
        this.events.push({ type: 'sfx', name: 'land', car });
        break;
      }
      case 'traffic': {
        car.v = Math.min(car.v * 0.84, Math.max(e.t.v, 10));
        car.vx += e.dx * 6;
        e.t.x -= e.dx * 1.2;
        this.sparks(car, 16);
        this.events.push({ type: 'sfx', name: 'impact', car, power: 10 });
        if (car.isPlayer) this.events.push({ type: 'msg', text: 'TRAFFIC HIT', tone: 'bad' });
        break;
      }
      case 'carcar': {
        for (const c of [e.a, e.b]) {
          c.v *= 0.97;
        }
        e.a.vx += e.dx * 5; e.b.vx -= e.dx * 5;
        this.sparks(e.a, 10);
        this.events.push({ type: 'sfx', name: 'impact', car: e.a, power: e.power });
        break;
      }
      case 'trainhit': {
        car.stun = 1.6;
        car.spinRate = (car.x >= 0 ? 1 : -1) * 9;
        car.v *= 0.25;
        this.sparks(car, 30);
        this.shake = Math.max(this.shake, 1);
        this.events.push({ type: 'sfx', name: 'bollard', car });
        if (car.isPlayer) this.events.push({ type: 'msg', text: 'TRAIN!', tone: 'bad' });
        break;
      }
      case 'pad': {
        car.boostTimer = CFG.PAD_TIME;
        car.v = Math.max(car.v, 58);
        car.energy = Math.min(CFG.ENERGY_MAX, car.energy + CFG.ENERGY_PAD);
        this.events.push({ type: 'sfx', name: 'boost', car });
        if (car.isPlayer) this.events.push({ type: 'msg', text: 'BOOST PAD', tone: 'good' });
        break;
      }
      case 'lap': {
        if (car.isPlayer) this.events.push({ type: 'lap', lap: e.lap, lapTime: e.lapTime });
        break;
      }
      case 'finish': {
        if (car.isPlayer) this.events.push({ type: 'finish', place: e.place });
        break;
      }
      default:
        break;
    }
  }

  sparks(car, n) {
    const f = this.track.frame(car.dist, this._f);
    const p = this.track.worldPoint(car.dist, car.x, car.y - f.H + 0.4, [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      this.particles.emit(p[0], p[1], p[2], (Math.random() - 0.5) * 18, 4 + Math.random() * 8, (Math.random() - 0.5) * 18, 1.0, 0.7, 0.3, 0.45 + Math.random() * 0.3, 2);
    }
  }

  _updateVisuals(dt) {
    const track = this.track;
    for (const car of this.cars) {
      const f = track.frame(car.dist, this._f);
      const h = car.y - f.H;
      poseOnTrack(car.mesh.root, f, car.x, h, car.yawVis + car.spin);
      placeShadow(car.shadow, f, car.x);
      // Wheels: steer on the front pair, spin all
      const steer = car.input.steer * 0.42;
      for (const w of car.mesh.wheels) {
        if (w.front) w.pivot.rotation.y = steer;
        w.spin.rotation.x += (car.v * dt) / 0.42;
      }
      // Lights and underglow
      const brake = car.brakingVis ? 3 : 1.1;
      for (const m of car.mesh.brakeMats) m.color.setRGB(brake * 1.0, 0.04 * brake, 0.12 * brake);
      car.mesh.glow.material.opacity = car.boostingVis ? 0.85 : 0.35;
      // Exhaust and trails
      if (car.boostingVis) {
        for (let k = 0; k < 2; k++) {
          const p = track.worldPoint(car.dist - 2.4, car.x + (k ? 0.7 : -0.7), h + 0.6, [0, 0, 0]);
          this.particles.emit(p[0], p[1], p[2], -f.t[0] * 6, 0.5, -f.t[2] * 6, 0.4, 0.8, 1.6, 0.45, 0.6);
        }
      }
      if (Math.abs(car.vx) > 6 && car.v > 22 && !car.airborne) {
        const p = track.worldPoint(car.dist - 2.2, car.x + (car.vx > 0 ? 1 : -1) * 1.0, 0.1, [0, 0, 0]);
        this.particles.emit(p[0], p[1] + 0.2, p[2], 0, 1.2, 0, 0.7, 0.7, 0.8, 0.5, 1.2);
      }
    }
    this.particles.update(dt);
    this.world.update(this.time, dt);
  }

  // Standings: finished cars first (in finish order), then by progress.
  standings() {
    const done = this.finishOrder.slice();
    const rest = this.cars.filter((c) => !c.finished).sort((a, b) => b.dist - a.dist);
    return done.concat(rest);
  }

  position(car) {
    return this.standings().indexOf(car) + 1;
  }

  // Lap of car as displayed (1-based).
  displayLap(car) {
    return Math.min(CFG.LAPS, car.lapsDone + 1);
  }

  // Upcoming bollard rows for the caller HUD.
  zipPreview() {
    return this.zipper.preview(this.player.dist, 7);
  }
}

function laneIndexOf(x) {
  const j = Math.round(x / CFG.LANE_W + (CFG.LANES - 1) / 2);
  return Math.max(0, Math.min(CFG.LANES - 1, j));
}

function placeShadow(shadow, f, x) {
  const p = [f.p[0] + f.r[0] * x + f.u[0] * 0.06, f.p[1] + f.r[1] * x + f.u[1] * 0.06, f.p[2] + f.r[2] * x + f.u[2] * 0.06];
  shadow.position.set(p[0], p[1], p[2]);
  orientOnRoad(shadow, f);
}
