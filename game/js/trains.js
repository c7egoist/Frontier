// Trains.
//
// LevelCrossing: a freight train sweeps across the avenue at each crossing. Gates and warning
// lights telegraph it. While it is crossing, the body is a hazard for every car in the road.
// Monorail: a viaduct train running beside the circuit. Visual only.

import * as THREE from 'three';
import { CFG } from './config.js';
import { poseFrame, poseOnTrack } from './carmesh.js';
import { roadStrip, GROUND_Y } from './world.js';

const HW = CFG.ROAD_HALF_W;
const CAR_L = CFG.TRAIN_CAR_L;
const TRAIN_LEN = CFG.TRAIN_CARS * CAR_L;

export class LevelCrossing {
  constructor(track, scene, sC, rng, { delay = CFG.TRAIN_FIRST } = {}) {
    this.track = track;
    this.sC = sC;
    this.rng = rng;
    this.phase = 'idle';
    this.timer = delay;
    this.dir = 1;
    this.F = 0;
    this.phaseT = 0;
    this.warnLightOn = false;
    this.lightT = 0;

    // Train body
    this.group = new THREE.Group();
    scene.add(this.group);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1f33, roughness: 0.35, metalness: 0.6, emissive: 0x060818, emissiveIntensity: 1 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3fa4).multiplyScalar(2), toneMapped: false });
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ff9ff).multiplyScalar(1.6), toneMapped: false });
    this.cars = [];
    for (let i = 0; i < CFG.TRAIN_CARS; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - 0.4, 3.6, 3.2), bodyMat);
      body.position.y = 2.0;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - 0.3, 0.12, 3.25), stripeMat);
      stripe.position.y = 1.2;
      const win = new THREE.Mesh(new THREE.BoxGeometry(CAR_L - 1.6, 0.9, 3.3), winMat);
      win.position.y = 3.0;
      g.add(body, stripe, win);
      this.group.add(g);
      this.cars.push(g);
    }
    // Nose light
    this.headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(3), toneMapped: false });
    // Gates (boom arms) on both approaches
    this.gates = [];
    this.lamps = [];
    const armMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff2030, emissiveIntensity: 0.2, roughness: 0.5 });
    const armGeo = new THREE.BoxGeometry(2 * HW + 1.2, 0.18, 0.18);
    armGeo.translate(HW + 0.6, 0, 0);
    for (const ds of [-11, 11]) {
      const base = new THREE.Group();
      const pivot = new THREE.Group();
      pivot.position.x = -HW - 0.6; // boom arms rotate about the left road edge
      const arm = new THREE.Mesh(armGeo, armMat);
      pivot.add(arm);
      base.add(pivot);
      scene.add(base);
      // stripes on the arm
      const lampMat = new THREE.MeshBasicMaterial({ color: 0x331010, toneMapped: false });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), lampMat);
      lamp.position.set(-HW - 0.7, 1.8, 0);
      base.add(lamp);
      this.gates.push({ base, pivot, ds, lamp, lampMat, angle: 0 });
      this.lamps.push(lampMat);
    }
    // Rail deck and rails across the avenue at the crossing
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x141826, roughness: 0.6, metalness: 0.3 });
    scene.add(new THREE.Mesh(roadStrip(track, sC - 4, sC + 4, -60, 60, 0.02, 8), deckMat));
    const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd23f).multiplyScalar(1.5), side: THREE.DoubleSide, toneMapped: false });
    for (const ds of [-1.2, 1.2]) {
      scene.add(new THREE.Mesh(roadStrip(track, sC + ds - 0.12, sC + ds + 0.12, -60, 60, 0.05, 8), railMat));
    }
    this._pos = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
    this._placeGates();
    this._placeTrain();
  }

  _placeGates() {
    for (const g of this.gates) {
      const f = this.track.frame(this.sC + g.ds, this._pos);
      poseFrame(g.base, f, 0, 1.2);
    }
  }

  _placeTrain() {
    const f = this.track.frame(this.sC, this._pos);
    for (let i = 0; i < this.cars.length; i++) {
      const lat = this.F - CAR_L / 2 - CAR_L * i;
      const car = this.cars[i];
      poseFrame(car, f, this.dir * lat, 0);
      // Front nose light
      if (i === 0) {
        car.userData.lat = lat;
      }
    }
    this.group.visible = this.phase === 'pass' || this.phase === 'warn' || this.phase === 'clear';
  }

  // Returns a short event name when the train starts or ends a phase.
  update(dt) {
    const events = [];
    this.phaseT += dt;
    if (this.phase === 'idle') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'warn';
        this.phaseT = 0;
        this.dir = this.rng() < 0.5 ? 1 : -1;
        this.F = -HW - 3;
        events.push('warn');
      }
    } else if (this.phase === 'warn') {
      if (this.phaseT >= CFG.TRAIN_WARN) {
        this.phase = 'pass';
        this.phaseT = 0;
        events.push('pass');
      }
    } else if (this.phase === 'pass') {
      this.F += CFG.TRAIN_SPEED * dt;
      if (this.F > HW + TRAIN_LEN - CAR_L * 0.2 + 2) {
        this.phase = 'clear';
        this.phaseT = 0;
        events.push('clear');
      }
    } else if (this.phase === 'clear') {
      if (this.phaseT > 1.6) {
        this.phase = 'idle';
        this.timer = CFG.TRAIN_GAP_MIN + this.rng() * (CFG.TRAIN_GAP_MAX - CFG.TRAIN_GAP_MIN);
        this.phaseT = 0;
      }
    }

    // Gates: lower during warn and pass, raise after clear
    const targetAngle = this.phase === 'warn' || this.phase === 'pass' ? 0 : Math.PI / 2 * 0.92;
    for (const g of this.gates) {
      g.angle += (targetAngle - g.angle) * Math.min(1, dt * 3.5);
      g.pivot.rotation.z = g.angle;
      // Gates use the pivot at the left edge, so rotate about the pivot's own origin
    }
    // Lamps flash while the gate is down
    this.lightT += dt;
    const flashing = this.phase === 'warn' || this.phase === 'pass';
    for (const m of this.lamps) {
      const on = flashing && Math.floor(this.lightT * 4) % 2 === 0;
      m.color.setRGB(on ? 3 : 0.2, on ? 0.08 : 0.02, on ? 0.1 : 0.02);
    }

    this._placeGates();
    this._placeTrain();
    return events;
  }

  // Is a car in the hazard volume of the train?
  hazard(car, wrapS) {
    if (this.phase !== 'pass') return false;
    let d = wrapS - this.sC;
    const L = this.track.L;
    d = ((d + L / 2) % L + L) % L - L / 2;
    if (Math.abs(d) > 1.6 + CFG.CAR_HALF_L) return false;
    const local = this.dir * car.x;
    const rear = this.F - TRAIN_LEN;
    return local > rear - CFG.CAR_HALF_W && local < this.F + CFG.CAR_HALF_W;
  }

  // Lane centres (in track x) blocked by the train right now.
  blockedInterval() {
    if (this.phase !== 'pass') return null;
    const rear = this.F - TRAIN_LEN;
    const a = this.dir * rear, b = this.dir * this.F;
    return [Math.min(a, b), Math.max(a, b)];
  }

  // Distance until the train's front reaches the road, or null.
  warnActive() {
    return this.phase === 'warn' || this.phase === 'pass';
  }
}

export class Monorail {
  constructor(track, scene) {
    this.track = track;
    this.x = HW + 9;
    this.h = 9;
    this.s = track.L * 0.3;
    this.speed = 70;
    this.group = new THREE.Group();
    scene.add(this.group);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c2236, roughness: 0.4, metalness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x33e6ff).multiplyScalar(2.2), toneMapped: false });
    this.cars = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 13), mat);
      body.position.y = 1.4;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.22, 12.4), glow);
      strip.position.y = 1.1;
      const win = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.8, 11), glow);
      win.position.y = 2.0;
      g.add(body, strip, win);
      this.group.add(g);
      this.cars.push(g);
    }
    // Rail + pillars
    const rail = roadStrip(track, 0, track.L, this.x - 0.6, this.x + 0.6, 0, 40);
    const railMesh = new THREE.Mesh(rail, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ff9ff).multiplyScalar(1.2), side: THREE.DoubleSide, toneMapped: false }));
    // place the rail at height h by shifting its vertices
    const p = rail.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      // raise along the track up vector: approximate using y offset of the sampled frame
      p.setY(i, p.getY(i) + this.h);
    }
    p.needsUpdate = true;
    scene.add(railMesh);

    const pillarGeo = new THREE.CylinderGeometry(0.7, 0.9, 1, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x181c2e, roughness: 0.6, metalness: 0.4 });
    const count = Math.floor(track.L / 22);
    this.pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, count);
    const d = new THREE.Object3D();
    const f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
    for (let i = 0; i < count; i++) {
      track.frame(i * 22, f);
      const x = f.p[0] + f.r[0] * this.x, z = f.p[2] + f.r[2] * this.x;
      const top = f.p[1] + this.h - 0.2;
      const height = top - GROUND_Y;
      d.position.set(x, GROUND_Y + height / 2, z);
      d.scale.set(1, height, 1);
      d.updateMatrix();
      this.pillars.setMatrixAt(i, d.matrix);
    }
    this.pillars.instanceMatrix.needsUpdate = true;
    scene.add(this.pillars);
  }

  update(dt) {
    this.s = this.track.wrap(this.s + this.speed * dt);
    const f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
    for (let i = 0; i < this.cars.length; i++) {
      const s = this.s - i * 14.5;
      this.track.frame(s, f);
      poseOnTrack(this.cars[i], f, this.x, this.h + 0.5, 0);
    }
  }
}
