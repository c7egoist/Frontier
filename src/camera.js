import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, damp, lerp } from './utils.js';

export class ChaseCam {
  constructor(camera) {
    this.cam = camera;
    this.cur = new THREE.Vector3(0, 8, -14);
    this.look = new THREE.Vector3(0, 2, 20);
    this.roll = 0;
    this.fov = CFG.fovBase;
    this.shake = 0;
  }

  snap(player, world) {
    const back = CFG.camDist;
    const s = Math.max(0, player.s - back);
    const f = world.path.frameAt(s);
    this.cur.set(f.x + f.rx * player.x * 0.6, f.y + CFG.camHeight, f.z + f.rz * player.x * 0.6);
    this.cam.position.copy(this.cur);
    this.roll = 0;
    this.fov = CFG.fovBase;
    this.cam.fov = this.fov;
    this.cam.updateProjectionMatrix();
    const pf = world.path.frameAt(player.s);
    this.look.set(player.pos.x + pf.fx * 20, player.pos.y + 1.6, player.pos.z + pf.fz * 20);
    this.cam.lookAt(this.look);
  }

  update(dt, player, world) {
    const speedN = clamp((player.speed - CFG.startSpeed) / (CFG.maxSpeed - CFG.startSpeed), 0, 1.4);
    const back = CFG.camDist + speedN * 2.2 + (player.boosting ? 2.0 : 0);
    const sc = Math.max(0, player.s - back);
    const f = world.path.frameAt(sc);
    const lat = player.x * 0.58;
    const targetY = f.y + lat * f.bank + CFG.camHeight + player.h * 0.55 + speedN * 0.3;
    const tx = f.x + f.rx * lat;
    const tz = f.z + f.rz * lat;

    const lam = 9.5;
    this.cur.x = damp(this.cur.x, tx, lam, dt);
    this.cur.y = damp(this.cur.y, targetY, lam * 0.8, dt);
    this.cur.z = damp(this.cur.z, tz, lam, dt);

    // never sink into the road
    const deck = world.deckY(f, lat);
    this.cur.y = Math.max(this.cur.y, deck + 2.2);

    const pf = world.path.frameAt(player.s + 8);
    const lookAhead = CFG.camLook;
    const lx = player.pos.x + pf.fx * lookAhead;
    const ly = player.pos.y + 1.5 + player.h * 0.25;
    const lz = player.pos.z + pf.fz * lookAhead;
    this.look.x = damp(this.look.x, lx, 12, dt);
    this.look.y = damp(this.look.y, ly, 8, dt);
    this.look.z = damp(this.look.z, lz, 12, dt);

    this.cam.position.copy(this.cur);

    // shake
    const sh = player.shake * 0.55 + speedN * 0.035;
    if (sh > 0.001) {
      this.cam.position.x += (Math.random() - 0.5) * sh;
      this.cam.position.y += (Math.random() - 0.5) * sh;
      this.cam.position.z += (Math.random() - 0.5) * sh;
    }
    this.cam.lookAt(this.look);

    // banking roll: path bank + steering lean, eased
    const targetRoll = Math.atan(world.path.frameAt(player.s).bank) * 0.55 - player.lean * 0.22;
    this.roll = damp(this.roll, targetRoll, 5, dt);
    this.cam.rotateZ(this.roll);

    const targetFov = CFG.fovBase + speedN * 7 + (player.boosting ? 15 : 0) + (player.drifting ? 4 : 0);
    this.fov = damp(this.fov, targetFov, 4, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }

  cinematic(t, world) {
    const s = 12 + ((t * 13) % 320);
    const f = world.path.frameAt(s);
    const wob = Math.sin(t * 0.55) * 5.5;
    this.cam.position.set(
      f.x + f.rx * wob,
      f.y + 7.2 + Math.sin(t * 0.8) * 1.2,
      f.z + f.rz * wob
    );
    const g = world.path.frameAt(s + 42);
    this.cam.lookAt(g.x, g.y + 2.0, g.z);
    if (Math.abs(this.cam.fov - 68) > 0.01) {
      this.cam.fov = damp(this.cam.fov, 68, 4, 1 / 60);
      this.cam.updateProjectionMatrix();
    }
    this.cur.copy(this.cam.position);
    this.look.set(g.x, g.y + 2, g.z);
    this.roll = 0;
  }
}
