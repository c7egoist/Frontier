import * as THREE from 'three';
import { terrainHeight } from '../util/noise.js';

const EYE_STAND = 1.7, EYE_CROUCH = 0.95;

/**
 * First-person controller + the "target" interface predators hunt.
 * Detection radius (`noise`) grows when sprinting/jumping and shrinks when crouching: sneak past or die.
 */
export class Player {
  constructor(camera, dom, colliders) {
    this.camera = camera; this.dom = dom; this.colliders = colliders;
    this.position = new THREE.Vector3(0, terrainHeight(0, 0), 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.keys = new Set();
    this.health = 100; this.maxHealth = 100;
    this.alive = true; this.targetable = true; this.carriedBy = null;
    this.noise = 7;
    this.eye = EYE_STAND;
    this.onGround = true;
    this.struggle = 0;
    this.invuln = 0;
    this.sinceHurt = 99;
    this.hurtFlash = 0;
    this.bobT = 0;
    this.ghost = false;
    this.lockedLook = new THREE.Vector3(0, 0, -1);
    this.carryPos = new THREE.Vector3();
    this.carryEye = new THREE.Vector3();
    this.carryDir = new THREE.Vector3(0, 0, -1);
    this.shake = 0;
    this.events = { escaped: [], died: [], grabbed: [] };
    this.speedNow = 0;
    this.crouching = false;
    this.sprinting = false;
    this._bind();
  }

  on(ev, fn) { this.events[ev].push(fn); }
  emit(ev, ...a) { this.events[ev].forEach((f) => f(...a)); }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.carriedBy && ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) this.struggle += 0.085;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      const s = 0.0022;
      this.yaw -= e.movementX * s;
      this.pitch -= e.movementY * s;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
      if (this.carriedBy) { this.struggle += Math.min(0.01, Math.abs(e.movementX + e.movementY) * 0.0002); }
    });
    this.dom.addEventListener('mousedown', () => { if (this.carriedBy) this.struggle += 0.06; });
  }

  // --- target interface ----------------------------------------------------
  grab(pred) {
    if (this.carriedBy || !this.alive || this.invuln > 0) return false;
    this.carriedBy = pred; this.struggle = 0.0; this.emit('grabbed', pred);
    return true;
  }
  carryTo(mouth, dir, eye) {
    this.carryPos.copy(mouth);
    this.carryEye = (this.carryEye || new THREE.Vector3()).copy(eye || mouth);
    this.carryDir.copy(dir);
    this.position.copy(mouth).y -= 1.2;
    this.velocity.set(0, 0, 0);
  }
  damage(n) {
    if (!this.alive) return;
    this.health -= n; this.sinceHurt = 0; this.hurtFlash = Math.min(1, this.hurtFlash + n * 0.02);
    if (this.health <= 0) { this.health = 0; this.alive = false; this.emit('died', this.carriedBy); }
  }
  release(outDir) {
    const pred = this.carriedBy;
    this.carriedBy = null;
    return pred;
  }
  _escape() {
    const pred = this.carriedBy;
    this.carriedBy = null; this.struggle = 0; this.invuln = 3.0;
    const base = pred.baseWorld;
    const out = new THREE.Vector3(this.position.x - base.x, 0, this.position.z - base.z);
    if (out.lengthSq() < 0.1) out.set(Math.cos(pred.lay.yaw), 0, Math.sin(pred.lay.yaw));
    out.normalize();
    this.velocity.copy(out).multiplyScalar(9).setY(6);
    this.position.y = Math.max(this.position.y, terrainHeight(this.position.x, this.position.z) + 0.5);
    this.emit('escaped', pred);
  }

  respawn() {
    this.position.set(0, terrainHeight(0, 0), 0);
    this.velocity.set(0, 0, 0); this.health = this.maxHealth; this.alive = true; this.carriedBy = null;
    this.invuln = 3; this.struggle = 0; this.yaw = 0; this.pitch = 0; this.hurtFlash = 0;
  }

  // -------------------------------------------------------------------------
  update(dt) {
    dt = Math.min(dt, 0.05);
    this.invuln = Math.max(0, this.invuln - dt);
    this.sinceHurt += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 0.8);
    this.targetable = !this.ghost && this.alive && this.invuln <= 0;

    if (this.ghost) return this._updateGhost(dt);

    if (this.carriedBy) {
      this.struggle = Math.max(0, this.struggle - dt * 0.28);
      if (this.struggle >= 1 && this.alive) this._escape();
      this.noise = 0;
      this.shake = 1;
      this._applyCamera(dt);
      return;
    }
    if (!this.alive) { this._applyCamera(dt); return; }
    this.shake = Math.max(0, this.shake - dt * 3);

    const k = this.keys;
    this.crouching = k.has('ControlLeft') || k.has('KeyC');
    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && !this.crouching;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const speed = this.crouching ? 2.3 : this.sprinting ? 9.2 : 5.0;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sin * f + cos * r, 0, -cos * f - sin * r);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);
    const accel = this.onGround ? 14 : 3;
    this.velocity.x += (wish.x - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (wish.z - this.velocity.z) * Math.min(1, accel * dt);
    if (this.onGround && k.has('Space') && !this.crouching) { this.velocity.y = 6.2; this.onGround = false; this.noiseKick = 1; }
    this.velocity.y -= 18 * dt;
    this.position.addScaledVector(this.velocity, dt);
    const gy = terrainHeight(this.position.x, this.position.z);
    if (this.position.y <= gy) { if (!this.onGround && this.velocity.y < -6) this.noiseKick = 1; this.position.y = gy; this.velocity.y = 0; this.onGround = true; }
    // colliders (tree trunks) and arena bound
    for (const c of this.colliders) {
      const dx = this.position.x - c.x, dz = this.position.z - c.z, d = Math.hypot(dx, dz), rr = c.r + 0.4;
      if (d < rr) { this.position.x = c.x + (dx / d) * rr; this.position.z = c.z + (dz / d) * rr; }
    }
    const rr = Math.hypot(this.position.x, this.position.z);
    if (rr > 150) { this.position.x *= 150 / rr; this.position.z *= 150 / rr; }

    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    this.speedNow = sp;
    // stealth model
    let target = 6;
    if (sp > 0.5) target = this.crouching ? 7 : this.sprinting ? 30 : 15;
    else if (this.crouching) target = 4.5;
    this.noiseKick = Math.max(0, (this.noiseKick || 0) - dt * 1.4);
    target += this.noiseKick * 14;
    this.noise += (target - this.noise) * Math.min(1, dt * 4);

    if (this.sinceHurt > 6 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 3 * dt);
    this.eye += ((this.crouching ? EYE_CROUCH : EYE_STAND) - this.eye) * Math.min(1, dt * 9);
    this.bobT += sp * dt * (this.sprinting ? 1.5 : 1.15);
    this._applyCamera(dt);
  }

  _applyCamera(dt) {
    const cam = this.camera;
    if (this.carriedBy) {
      // inside the maw: looking out between the teeth while the plant thrashes
      cam.position.copy(this.carryEye);
      const t = performance.now() * 0.001;
      cam.position.x += Math.sin(t * 37) * 0.04; cam.position.y += Math.sin(t * 29) * 0.05;
      const look = new THREE.Matrix4().lookAt(new THREE.Vector3(), this.carryDir, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(look);
      const free = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch * 0.35, this.yaw * 0.0 + (this.yawAcc || 0), 0, 'YXZ'));
      q.multiply(free);
      cam.quaternion.slerp(q, 1 - Math.exp(-14 * dt));
      return;
    }
    const bob = this.onGround && this.speedNow > 0.5 ? Math.sin(this.bobT * 2.0) * 0.045 * (this.sprinting ? 1.4 : 1) : 0;
    cam.position.set(this.position.x, this.position.y + this.eye + bob, this.position.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw; cam.rotation.x = this.pitch;
    cam.rotation.z = Math.sin(this.bobT) * 0.004;
  }

  _updateGhost(dt) {
    const k = this.keys;
    const fast = k.has('ShiftLeft') ? 3.2 : 1;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const u = (k.has('KeyE') || k.has('Space') ? 1 : 0) - (k.has('KeyQ') || k.has('ControlLeft') ? 1 : 0);
    const cam = this.camera;
    cam.rotation.order = 'YXZ'; cam.rotation.y = this.yaw; cam.rotation.x = this.pitch;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    this.ghostVel = this.ghostVel || new THREE.Vector3();
    const wish = fwd.multiplyScalar(f).addScaledVector(right, r).addScaledVector(new THREE.Vector3(0, 1, 0), u).multiplyScalar(10 * fast);
    this.ghostVel.lerp(wish, Math.min(1, dt * 6));
    cam.position.addScaledVector(this.ghostVel, dt);
    cam.position.y = Math.max(cam.position.y, terrainHeight(cam.position.x, cam.position.z) + 0.6);
    this.position.copy(cam.position).y = terrainHeight(cam.position.x, cam.position.z);
    this.noise = 0;
  }
}
