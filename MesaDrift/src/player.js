import * as THREE from 'three';
import { W, TURN_R, HALF_PI, lerp, clamp, smooth } from './track.js';

const GRAVITY = 32;
const JUMP_V = 12.5;
const STEER_SPEED = 15;

function highestBelow(cands, limit) {
  let best = null;
  for (const f of cands) if (f <= limit && (best === null || f > best)) best = f;
  return best;
}

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, flatShading: true, ...extra });
}

// A low drift sled: oxide-red hull, cream racing stripe, smoked-teal canopy, ochre fins.
function buildKart() {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const oxide = mat(0xB5543B), cream = mat(0xF3E9D6), dark = mat(0x3A3230, { roughness: 0.9 });
  const teal = mat(0x2F7F7C, { transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.2 });
  const ochre = mat(0xD9A441);
  const add = (geo, m, x, y, z, parent = body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };

  add(new THREE.BoxGeometry(1.5, 0.42, 2.6), oxide, 0, 0.46, 0);
  add(new THREE.BoxGeometry(1.1, 0.28, 0.9), oxide, 0, 0.36, 1.6);
  add(new THREE.BoxGeometry(0.7, 0.14, 0.5), cream, 0, 0.5, 1.95);
  add(new THREE.BoxGeometry(1.25, 0.5, 0.95), oxide, 0, 0.9, -0.65);
  add(new THREE.BoxGeometry(0.92, 0.48, 1.0), teal, 0, 0.9, 0.2);
  add(new THREE.BoxGeometry(0.32, 0.03, 2.7), cream, 0, 0.68, 0);
  add(new THREE.BoxGeometry(0.08, 0.55, 0.65), ochre, -0.72, 1.3, -1.1);
  add(new THREE.BoxGeometry(0.08, 0.55, 0.65), ochre, 0.72, 1.3, -1.1);
  add(new THREE.BoxGeometry(1.6, 0.06, 0.4), ochre, 0, 1.55, -1.1);
  add(new THREE.BoxGeometry(0.5, 0.2, 0.3), dark, 0, 0.4, -1.4);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12); wheelGeo.rotateZ(HALF_PI);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.32, 8); hubGeo.rotateZ(HALF_PI);
  const wheels = [], pivots = [];
  for (const [x, z] of [[-0.85, 0.95], [0.85, 0.95], [-0.85, -0.95], [0.85, -0.95]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.36, z); root.add(pivot);
    const w = add(wheelGeo, dark, 0, 0, 0, pivot); add(hubGeo, cream, 0, 0, 0, w);
    wheels.push(w); if (z > 0) pivots.push(pivot);
  }
  return { root, body, wheels, pivots };
}

export class Player {
  constructor(scene) {
    const k = buildKart();
    this.mesh = k.root; this.body = k.body; this.wheels = k.wheels; this.pivots = k.pivots;
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.s = 4; this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.speed = 0; this.grounded = true; this.ducking = false; this.drifting = false;
    this.driftMeter = 0; this.boostTime = 0; this.hearts = 3; this.invuln = 0; this.distance = 0;
    this.airTime = 0; this.slopeVel = 0; this.wallTime = 0; this.scraping = false; this.jumped = false;
    this.piece = null; this.driftYaw = 0; this.roll = 0; this.pitch = 0; this.dead = false; this.frozen = false;
    this.mesh.visible = true; this.body.scale.y = 1;
  }

  update(dt, input, track, game) {
    const prevPiece = this.piece;
    const piece = track.pieceAt(this.s); this.piece = piece;
    const inTurn = piece.type === 'turn';

    // ---- speed: slowly climbs with distance, boosts stack on top, scraping bleeds it
    const base = lerp(27, 58, smooth(this.distance / 4200));
    this.boostTime = Math.max(0, this.boostTime - dt);
    const target = base + (this.boostTime > 0 ? 14 : 0);
    const rate = this.speed < target ? (this.boostTime > 0 ? 4 : 1.2) : 2.5;
    this.speed += (target - this.speed) * Math.min(1, dt * rate);
    if (this.scraping) this.speed = Math.max(base * 0.6, this.speed - 14 * dt);

    // ---- drift: only meaningful inside a 90° corner; payout happens on exit
    if (prevPiece && prevPiece !== piece && prevPiece.type === 'turn') this.endDrift(game);
    const wantDrift = !!input.drift && this.grounded && inTurn;
    if (wantDrift !== this.drifting) { this.drifting = wantDrift; game.sfx.drift(wantDrift); }
    if (this.drifting) this.driftMeter += dt;

    // ---- lateral
    const steer = input.steer;
    this.vx += (steer * STEER_SPEED - this.vx) * Math.min(1, dt * 9);
    let dx = this.vx * dt;
    if (inTurn && this.grounded) dx += this.drifting ? piece.turn * 1.5 * dt : -piece.turn * this.speed * 0.26 * dt;
    if (piece.type === 'bowl' && this.grounded && Math.abs(this.x) > W) this.vx -= this.floorSlope(track) * 22 * dt;
    this.x += dx;
    const lim = track.xLimit(this.s, this.y);
    this.scraping = false;
    if (this.x > lim) { this.x = lim; if (this.vx > 0) this.vx = 0; if (inTurn && piece.turn < 0) this.scraping = true; }
    if (this.x < -lim) { this.x = -lim; if (this.vx < 0) this.vx = 0; if (inTurn && piece.turn > 0) this.scraping = true; }

    // ---- vertical: floors are multi-valued (stacked decks), pick the one we're standing on
    const cands = track.floors(this.s, this.x);
    this.ducking = !!input.duck && this.grounded;
    // how much the floor may rise in one frame before we count as having left it
    const stepTol = 0.6 + this.speed * dt * 0.9;
    if (this.grounded) {
      const floor = highestBelow(cands, this.y + stepTol);
      if (floor === null || floor < this.y - 0.9) {
        // leaving a lip: ramps always give at least a usable launch, even after a crash
        this.grounded = false; this.vy = this.slopeVel > 2 ? Math.max(this.slopeVel, 9.5) : 0; this.airTime = 0; this.jumped = false;
        if (this.vy > 4) game.onLaunch();
      } else {
        this.slopeVel = clamp((floor - this.y) / Math.max(dt, 1e-4), -40, 28);
        this.y = floor;
        if (input.consumeJump()) {
          this.vy = JUMP_V + Math.max(0, this.slopeVel) * 0.5; this.grounded = false; this.airTime = 0; this.jumped = true; this.ducking = false;
          game.sfx.jump();
        }
      }
    }
    if (!this.grounded) {
      const yPrev = this.y;
      this.vy -= GRAVITY * dt; if (input.duck) this.vy -= 45 * dt;
      this.y += this.vy * dt; this.airTime += dt;
      // a ramp rising into us counts as ground too (but not a deck 4 m overhead)
      const floor = highestBelow(cands, yPrev + Math.min(0.3 + this.speed * dt * 0.9, 1.6));
      if (floor !== null && this.y <= floor) {
        this.y = floor; this.grounded = true; this.vy = 0; this.slopeVel = 0;
        game.onLand(this.airTime, this.jumped); this.airTime = 0;
      } else if (this.y < -14 || (floor === null && cands.length && this.y < -1)) {
        // either a long drop, or we dipped into a gap and are now under the next slab
        game.onFall(); return;
      }
    }

    // ---- wall riding in bowls
    if (piece.type === 'bowl' && this.grounded && Math.abs(this.x) > W + 1.2) {
      this.wallTime += dt;
      if (this.wallTime > 0.5) { this.wallTime = 0; game.addTrick('WALLRIDE', 30); }
    } else this.wallTime = 0;
    if (this.scraping) game.onScrape(dt);

    // ---- advance
    this.s += this.speed * dt; this.distance += this.speed * dt;
    this.invuln = Math.max(0, this.invuln - dt);

    // ---- collisions (track-space AABB)
    const ph = this.ducking ? 0.8 : 1.5;
    track.nearItems(this.s, 4, (it) => {
      if (Math.abs(it.gs - this.s) > it.d / 2 + 1.1) return;
      if (Math.abs(it.x - this.x) > it.w / 2 + 0.75) return;
      if (this.y >= it.y + it.h - 0.05 || this.y + ph <= it.y) return;
      game.onItem(it, this);
    });

    this.updateVisual(dt, track, piece);
  }

  endDrift(game) {
    if (this.driftMeter > 0.25) {
      const ratio = clamp((this.driftMeter * this.speed) / (HALF_PI * TURN_R), 0, 1);
      game.addTrick(ratio > 0.8 ? 'PERFECT DRIFT' : 'DRIFT', Math.round(80 + 220 * ratio));
      this.boostTime = 1.2 + 1.8 * ratio; game.sfx.boost();
    }
    this.driftMeter = 0;
    if (this.drifting) { this.drifting = false; game.sfx.drift(false); }
  }

  respawnAt(track, gs) {
    this.s = gs; this.x = 0; this.vx = 0; this.vy = 0;
    const f = track.floors(gs, 0); this.y = f.length ? Math.max(...f) : 0;
    this.grounded = true; this.slopeVel = 0; this.airTime = 0; this.speed *= 0.6; this.invuln = 2;
    this.driftMeter = 0; this.drifting = false; this.piece = null;
  }

  floorSlope(track) {
    const a = highestBelow(track.floors(this.s, this.x + 0.3), this.y + 0.7);
    const b = highestBelow(track.floors(this.s, this.x - 0.3), this.y + 0.7);
    return a === null || b === null ? 0 : (a - b) / 0.6;
  }

  updateVisual(dt, track, piece) {
    track.toWorld(this.s, this.x, this.y, this.mesh.position);
    const heading = track.heading(this.s);
    const k = Math.min(1, dt * 9);
    this.driftYaw += ((this.drifting ? piece.turn * 0.55 : 0) - this.driftYaw) * k;
    const slopeX = this.grounded ? this.floorSlope(track) : 0;
    const slopeS = this.grounded ? this.slopeVel / Math.max(this.speed, 1) : 0;
    const yaw = heading - this.driftYaw - this.vx * 0.03;
    const targetRoll = this.vx * 0.03 - Math.atan(slopeX);
    const targetPitch = this.grounded ? -Math.atan(slopeS) : -clamp(this.vy * 0.045, -0.5, 0.5);
    this.roll += (targetRoll - this.roll) * k; this.pitch += (targetPitch - this.pitch) * k;
    this.mesh.rotation.set(this.pitch, yaw, this.roll, 'YXZ');
    this.body.scale.y += ((this.ducking ? 0.55 : 1) - this.body.scale.y) * Math.min(1, dt * 14);
    this.body.position.y = this.ducking ? -0.05 : 0;
    for (const w of this.wheels) w.rotation.x += (this.speed * dt) / 0.36;
    for (const p of this.pivots) p.rotation.y = -this.vx * 0.04 - this.driftYaw * 0.8;
    this.mesh.visible = this.invuln > 0 ? Math.floor(this.invuln * 14) % 2 === 0 : true;
  }

  // world position of a point in kart-local space (for particles)
  local(x, y, z, out) { return this.mesh.localToWorld(out.set(x, y, z)); }
}
