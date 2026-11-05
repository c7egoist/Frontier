import * as THREE from 'three';
import { Rng, terrainHeight } from '../util/noise.js';

/**
 * A small AI scout that wanders up to the plants. Implements the same "target" interface as the
 * player, so observer mode (and the B key) can show every attack without risking your own skin.
 */
export class Bait {
  constructor(scene, predators, seed = 1) {
    this.scene = scene; this.predators = predators;
    this.rng = new Rng(seed);
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.alive = true; this.targetable = true; this.carriedBy = null; this.noise = 14;
    this.mesh = this._buildMesh();
    scene.add(this.mesh);
    this.phase = 0; this.dest = new THREE.Vector3(); this.struggleT = 0; this.deadT = 0; this.escapeAt = 0;
    this.heading = 0;
    this.spawn();
  }

  _buildMesh() {
    const g = new THREE.Group();
    const vest = new THREE.MeshStandardMaterial({ color: '#d1692a', roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: '#d9a883', roughness: 0.6 });
    const pants = new THREE.MeshStandardMaterial({ color: '#33415a', roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.55, 4, 10), vest); body.position.y = 1.2; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin); head.position.y = 1.78; head.castShadow = true;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.45, 0.2), new THREE.MeshStandardMaterial({ color: '#3f4d2a' })); pack.position.set(0, 1.25, -0.24); pack.castShadow = true;
    g.add(body, head, pack);
    this.legs = [];
    this.arms = [];
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.12, 0.85, 0);
      const lm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.62, 4, 8), pants); lm.position.y = -0.4; lm.castShadow = true; leg.add(lm);
      const arm = new THREE.Group(); arm.position.set(s * 0.32, 1.5, 0);
      const am = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), vest); am.position.y = -0.3; am.castShadow = true; arm.add(am);
      g.add(leg, arm); this.legs.push(leg); this.arms.push(arm);
    }
    return g;
  }

  spawn() {
    const rng = this.rng;
    const pr = this.predators[rng.int(0, this.predators.length - 1)];
    const a = rng.range(0, Math.PI * 2), r = rng.range(30, 46);
    this.position.set(pr.x + Math.cos(a) * r, 0, pr.z + Math.sin(a) * r);
    this.position.y = terrainHeight(this.position.x, this.position.z);
    this.alive = true; this.targetable = true; this.carriedBy = null; this.mesh.visible = true;
    this._pickDest(pr);
    this.escapeAt = rng.next() < 0.4 ? rng.range(1.8, 3.5) : 1e9;
    this.struggleT = 0;
  }

  _pickDest(pr) {
    this.home = pr;
    const a = this.rng.range(0, Math.PI * 2);
    const d = pr.S0 * this.rng.range(0.55, 0.8);
    this.dest.set(pr.x + Math.cos(a) * d, 0, pr.z + Math.sin(a) * d);
  }

  grab(pred) { if (this.carriedBy || !this.alive) return false; this.carriedBy = pred; this.struggleT = 0; return true; }
  carryTo(mouth, dir) { this.position.copy(mouth).y -= 0.9; this.velocity.set(0, 0, 0); this.mesh.position.copy(this.position); }
  damage(n) { this.hp = (this.hp ?? 60) - n; if (this.hp <= 0) { this.alive = false; this.deadT = 0; this.hp = 60; } }
  release() { this.carriedBy = null; }

  update(dt) {
    if (!this.alive) {
      this.deadT += dt;
      this.mesh.visible = this.carriedBy ? this.deadT < 1.2 : false;
      if (!this.carriedBy && this.deadT > 4) this.spawn();
      if (this.carriedBy) this.mesh.position.copy(this.position);
      return;
    }
    if (this.carriedBy) {
      this.struggleT += dt;
      const t = this.struggleT;
      this.mesh.position.copy(this.position);
      this.mesh.rotation.set(Math.sin(t * 14) * 0.7, t * 0.0 + Math.sin(t * 9), Math.sin(t * 11) * 0.8);
      this.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 20 + i * 2) * 1.4; });
      this.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 17 + i * 3) * 0.9; });
      if (this.struggleT > this.escapeAt) {
        const pred = this.carriedBy;
        this.carriedBy = null;
        const out = new THREE.Vector3(this.position.x - pred.x, 0, this.position.z - pred.z).normalize();
        this.position.addScaledVector(out, 7); this.position.y = terrainHeight(this.position.x, this.position.z);
        this.escapeAt = 1e9; this.targetable = false; setTimeout(() => { this.targetable = true; }, 4000);
        this._pickDest(this.home);
      }
      return;
    }
    this.mesh.rotation.set(0, 0, 0);
    // walk toward destination, then loiter and pick a new one
    const to = new THREE.Vector3(this.dest.x - this.position.x, 0, this.dest.z - this.position.z);
    const d = to.length();
    if (d < 1.5) { this._pickDest(this.predators[this.rng.int(0, this.predators.length - 1)]); }
    else {
      to.normalize();
      const speed = 3.4;
      this.velocity.copy(to).multiplyScalar(speed);
      this.position.addScaledVector(this.velocity, dt);
      this.heading = Math.atan2(to.x, to.z);
    }
    this.position.y = terrainHeight(this.position.x, this.position.z);
    this.phase += dt * 7;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    this.legs[0].rotation.x = Math.sin(this.phase) * 0.7; this.legs[1].rotation.x = -Math.sin(this.phase) * 0.7;
    this.arms[0].rotation.x = -Math.sin(this.phase) * 0.6; this.arms[1].rotation.x = Math.sin(this.phase) * 0.6;
  }
}
