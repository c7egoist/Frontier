import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, damp, lerp, smoothstep } from './utils.js';

/* ------------------------------------------------------------------ model */
function buildCraft(mats) {
  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.06, 0.07, 0.12), metalness: 0.85, roughness: 0.32,
    emissive: new THREE.Color(0.02, 0.06, 0.12), emissiveIntensity: 1,
  });
  const suitMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.09, 0.10, 0.18), metalness: 0.55, roughness: 0.45,
    emissive: new THREE.Color(0.05, 0.12, 0.22), emissiveIntensity: 1,
  });
  const glowC = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 2.0, 2.5) });
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 1.9) });
  const glowL = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 2.4, 0.35) });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    lean.add(m);
    return m;
  };

  // ---- board
  add(new THREE.BoxGeometry(1.9, 0.16, 4.3), bodyMat, 0, 0.06, 0);
  add(new THREE.BoxGeometry(1.55, 0.1, 3.4), bodyMat, 0, 0.18, -0.1);
  // nose
  const nose = add(new THREE.ConeGeometry(0.72, 1.5, 4, 1), bodyMat, 0, 0.1, 2.65, Math.PI / 2, Math.PI / 4, 0);
  nose.scale.set(1, 1, 0.34);
  // skids
  add(new THREE.BoxGeometry(0.22, 0.3, 3.6), bodyMat, -1.0, -0.06, 0);
  add(new THREE.BoxGeometry(0.22, 0.3, 3.6), bodyMat, 1.0, -0.06, 0);
  // board light strips
  add(new THREE.BoxGeometry(0.15, 0.08, 3.6), glowC, -0.82, 0.15, 0);
  add(new THREE.BoxGeometry(0.15, 0.08, 3.6), glowM, 0.82, 0.15, 0);
  add(new THREE.BoxGeometry(0.36, 0.06, 4.0), glowC, 0, 0.2, 0);
  add(new THREE.BoxGeometry(1.25, 0.05, 0.12), glowL, 0, 0.2, 1.65);
  // engine pods
  for (const sx of [-0.62, 0.62]) {
    const pod = add(new THREE.CylinderGeometry(0.26, 0.32, 0.7, 10), bodyMat, sx, 0.1, -2.05, Math.PI / 2, 0, 0);
    void pod;
    add(new THREE.CylinderGeometry(0.19, 0.19, 0.12, 10), glowC, sx, 0.1, -2.42, Math.PI / 2, 0, 0);
  }
  // underglow plate
  const under = add(new THREE.PlaneGeometry(1.7, 3.6), new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.3, 1.5, 2.2), transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), 0, -0.05, 0, -Math.PI / 2, 0, 0);
  under.renderOrder = 2;

  // ---- rider
  const rider = new THREE.Group();
  rider.position.set(0, 0.2, -0.15);
  rider.rotation.x = 0.18;
  lean.add(rider);
  const radd = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    rider.add(m);
    return m;
  };
  // legs
  radd(new THREE.BoxGeometry(0.26, 0.72, 0.3), suitMat, -0.3, 0.5, 0.05, 0.32, 0, 0.1);
  radd(new THREE.BoxGeometry(0.26, 0.72, 0.3), suitMat, 0.32, 0.5, -0.02, 0.28, 0, -0.12);
  // torso
  const torso = radd(new THREE.CapsuleGeometry(0.33, 0.62, 5, 10), suitMat, 0, 1.16, -0.16, 0.42, 0, 0);
  torso.scale.set(1, 1, 0.8);
  // chest light
  radd(new THREE.BoxGeometry(0.36, 0.1, 0.06), glowC, 0, 1.2, 0.16, 0.42, 0, 0);
  // backpack
  radd(new THREE.BoxGeometry(0.44, 0.5, 0.24), bodyMat, 0, 1.24, -0.44, 0.42, 0, 0);
  radd(new THREE.BoxGeometry(0.2, 0.1, 0.06), glowM, 0, 1.3, -0.58, 0.42, 0, 0);
  // arms
  radd(new THREE.BoxGeometry(0.16, 0.62, 0.16), suitMat, -0.42, 1.12, 0.12, -0.5, 0, 0.5);
  radd(new THREE.BoxGeometry(0.16, 0.62, 0.16), suitMat, 0.42, 1.12, 0.12, -0.5, 0, -0.5);
  // head + visor
  radd(new THREE.SphereGeometry(0.26, 12, 10), bodyMat, 0, 1.66, -0.02);
  radd(new THREE.BoxGeometry(0.4, 0.19, 0.12), glowC, 0, 1.68, 0.19, 0.05, 0, 0);
  radd(new THREE.BoxGeometry(0.46, 0.08, 0.34), bodyMat, 0, 1.82, -0.04);

  // ---- shield bubble
  const bubble = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.1, 1),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.4, 1.6, 2.4), wireframe: true, transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  bubble.position.y = 0.9;
  root.add(bubble);

  // ---- boost flames
  const flames = new THREE.Group();
  for (const sx of [-0.62, 0.62]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.24, 2.4, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.8, 0.5, 2.2), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
    f.position.set(sx, 0.1, -3.1);
    f.rotation.x = -Math.PI / 2;
    flames.add(f);
  }
  flames.visible = false;
  lean.add(flames);

  return { root, lean, bubble, flames, rider, glowC, glowM, glowL };
}

/* ----------------------------------------------------------------- player */
export class Player {
  constructor(scene, world) {
    this.world = world;
    this.parts = buildCraft();
    this.root = this.parts.root;
    scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.s = 8;
    this.x = 0;
    this.vx = 0;
    this.h = 0;
    this.vy = 0;
    this.speed = CFG.startSpeed;
    this.runTime = 0;
    this.grounded = true;
    this.sliding = false;
    this.slideT = 0;
    this.drifting = false;
    this.driftT = 0;
    this.driftAngle = 0;
    this.spin = 0;
    this.spinTotal = 0;
    this.spinVel = 0;
    this.airTime = 0;
    this.grinding = null;
    this.shield = 3;
    this.invuln = 0;
    this.boostMeter = 0;
    this.boosting = false;
    this.dead = false;
    this.style = 0;
    this.mult = 1;
    this.idle = 0;
    this.score = 0;
    this.cells = 0;
    this.wallCooldown = 0;
    this.ramp = null;
    this.shake = 0;
    this.lean = 0;
    this.tiltPitch = 0;
    this.nearMissed = new Set();
    this.landT = 0;
    this.spinVel = 0;
    if (this.world && this.world.path) {
      this.applyTransform(this.world.path.frameAt(this.s), 1 / 60);
    }
  }

  get maxX() { return CFG.halfWidth - 1.1; }

  /* ------------------------------------------------------------- update */
  update(dt, input, events) {
    if (this.dead) return;
    this.runTime += dt;

    const world = this.world;
    const path = world.path;
    const frame = path.frameAt(this.s);
    const seg = world.currentSeg(this.s);
    const k = frame.k;

    /* ---- speed ------------------------------------------------------- */
    const target = CFG.startSpeed
      + Math.min(CFG.maxSpeed - CFG.startSpeed, this.runTime * CFG.speedGainPerSec)
      + (this.boosting ? CFG.boostSpeed : 0);
    const slipPenalty = this.sliding ? 0.9 : 1;
    this.speed = damp(this.speed, target * slipPenalty, this.boosting ? 3.4 : 1.7, dt);

    /* ---- boost ------------------------------------------------------- */
    if (input.boost && this.boostMeter > 0.02 && !this.dead) {
      this.boosting = true;
      this.boostMeter = Math.max(0, this.boostMeter - CFG.boostDrain * dt);
    } else {
      this.boosting = false;
    }
    if (this.boosting) {
      this.style += 3 * dt;
      this.score += this.speed * dt * 0.5 * this.mult;
    }

    this.s += this.speed * dt;

    /* ---- steering + drift -------------------------------------------- */
    const steer = input.steer;
    const inCorner = Math.abs(k) > 0.004;
    const intoCorner = inCorner && Math.sign(steer) === -Math.sign(k) && Math.abs(steer) > 0.15;

    if (this.grounded && intoCorner && !this.sliding && this.speed > 26) {
      if (!this.drifting) { this.drifting = true; this.driftT = 0; events.driftStart && events.driftStart(); }
      this.driftT += dt;
    } else if (this.drifting && (!inCorner || !intoCorner)) {
      if (this.driftT > CFG.driftMinTime && !inCorner) {
        this.score += Math.round(120 * this.driftT) * this.mult;
        events.callout && events.callout(this.driftT > 0.75 ? 'PERFECT DRIFT' : 'DRIFT', this.driftT > 0.75);
        this.style += 16;
      }
      this.drifting = false;
      this.driftT = 0;
    }
    if (this.drifting) {
      this.style += 4 * dt;
      this.boostMeter = Math.min(1, this.boostMeter + CFG.boostGainDrift * dt);
      this.score += CFG.scoreDrift * dt * this.mult;
      this.idle = 0;
    }

    const grip = this.drifting ? CFG.driftGrip : 1;
    const accel = (this.grounded ? CFG.steerAccel : CFG.steerAccelAir) * grip;
    this.vx += steer * accel * dt;

    if (this.grounded) {
      // centrifugal push toward the outside of the corner
      const cf = k * this.speed * CFG.centrifugal;
      this.vx += cf * dt;
    }
    this.vx -= this.vx * CFG.lateralDrag * dt;
    this.vx = clamp(this.vx, -CFG.lateralMax, CFG.lateralMax);
    this.x += this.vx * dt;

    // walls
    const mx = this.maxX;
    if (this.x > mx || this.x < -mx) {
      this.x = clamp(this.x, -mx, mx);
      if (Math.sign(this.vx) === Math.sign(this.x) && Math.abs(this.vx) > 6) {
        this.shake = Math.min(1, this.shake + 0.22);
        this.speed *= 0.995;
        if (this.wallCooldown <= 0) {
          this.wallCooldown = 0.35;
          events.sparks && events.sparks(1);
          this.style = Math.max(0, this.style - 2);
        }
      }
      this.vx *= -0.12;
    }
    this.wallCooldown -= dt;

    /* ---- vertical ----------------------------------------------------- */
    const ramp = world.rampAt(this.s, this.x);
    this.ramp = ramp;

    if (this.grounded && ramp && !this.grinding) {
      const u = clamp((this.s - ramp.s0) / (ramp.s1 - ramp.s0), 0, 1);
      this.h = Math.max(this.h, u * ramp.h);
      if (this.s >= ramp.s1 - 0.15) {
        const slope = ramp.h / (ramp.s1 - ramp.s0);
        this.vy = this.speed * slope * 1.25 + CFG.rampVel * 0.45;
        this.grounded = false;
        this.airTime = 0;
        this.spinTotal = 0;
        this.spin = 0;
        events.launch && events.launch();
      }
    } else if (this.grinding) {
      const rail = this.grinding;
      this.h = rail.h;
      if (this.s > rail.s1 || Math.abs(this.x - rail.x) > 1.3) {
        this.grinding = null;
        this.vy = 0;
        this.grounded = false;
        this.airTime = 0;
      } else {
        this.boostMeter = Math.min(1, this.boostMeter + 0.06 * dt);
        this.score += CFG.scoreGrind * dt * this.mult;
        this.style += 3 * dt;
        this.idle = 0;
      }
    }

    if (input.jump && this.grounded && !this.grinding) {
      this.vy = CFG.jumpVel;
      this.grounded = false;
      this.airTime = 0;
      this.spinTotal = 0;
      this.spin = 0;
      events.jump && events.jump();
    }

    if (input.slide && this.grounded) {
      if (!this.sliding) {
        this.sliding = true;
        this.slideT = CFG.slideTime;
        events.slide && events.slide();
      }
    }
    if (this.sliding) {
      this.slideT -= dt;
      this.h = Math.max(0, this.h - 6 * dt);
      if (this.slideT <= 0) this.sliding = false;
    }
    if (input.slide && !this.grounded) this.vy -= 55 * dt;

    if (!this.grounded) {
      this.vy -= CFG.gravity * dt;
      const prevH = this.h;
      this.h += this.vy * dt;
      this.airTime += dt;
      this.style += 5 * dt;
      // trick rotation: hold jump while airborne to whip a full 360
      const spinDir = Math.abs(steer) > 0.2 ? Math.sign(steer) : 1;
      const rate = input.jumpHeld ? 1 : 0.42;
      const dSpin = spinDir * CFG.airSpinRate * dt * rate;
      this.spin += dSpin;
      this.spinTotal += Math.abs(dSpin);
      if (this.spinTotal > Math.PI * 2) {
        this.spinTotal -= Math.PI * 2;
        this.score += 75 * this.mult;
        this.style += 10;
        events.trick && events.trick('360°');
        this.idle = 0;
      }
      // rail catch: descend through the rail line while above it
      if (this.vy < 0) {
        const rail = world.railAt(this.s, this.x);
        if (rail && prevH >= rail.h - 0.05 && this.h <= rail.h) {
          this.grinding = rail;
          this.h = rail.h;
          this.vy = 0;
          this.grounded = true;
          this.spin = 0;
          this.landT = 0.2;
          this.score += 60 * this.mult;
          this.style += 6;
          events.grind && events.grind();
          this.applyTransform(path.frameAt(this.s), dt);
          return;
        }
      }
      if (this.h <= 0 && this.vy < 0) {
        this.h = 0;
        this.vy = 0;
        this.grounded = true;
        this.spin = 0;
        this.landT = 0.22;
        if (this.airTime > 0.45) {
          this.score += CFG.scoreAir * this.mult;
          this.style += 8;
          events.land && events.land(this.airTime);
        } else {
          events.land && events.land(0.2);
        }
      }
    }

    /* ---- drifting visuals --------------------------------------------- */
    // nose points into the corner while the tails slide wide
    const driftTarget = this.drifting ? Math.sign(k) * CFG.driftSlipAngle * clamp(this.driftT * 1.6, 0.4, 1) : 0;
    this.driftAngle = damp(this.driftAngle, driftTarget, 7, dt);
    this.lean = damp(this.lean, this.drifting ? -Math.sign(k) * 0.42 : steer * 0.34, 6, dt);

    /* ---- collisions --------------------------------------------------- */
    this.checkObstacles(events, world);

    /* ---- coins / pads ------------------------------------------------- */
    const coin = world.coinNear(this.s, this.x, this.h);
    if (coin) {
      world.takeCoin(coin);
      this.cells++;
      this.score += CFG.scoreCell * this.mult;
      this.boostMeter = Math.min(1, this.boostMeter + CFG.boostGainCell);
      this.style += 1.5;
      this.idle = 0;
      events.coin && events.coin(coin);
    }
    const pad = world.padAt(this.s, this.x);
    if (pad) {
      this.boostMeter = Math.min(1, this.boostMeter + 0.33);
      this.speed = Math.min(this.speed + 9, CFG.maxSpeed + CFG.boostSpeed);
      events.pad && events.pad();
    }

    /* ---- style decay -------------------------------------------------- */
    this.idle += dt;
    if (this.idle > 2.6) this.style = Math.max(0, this.style - 9 * dt);
    this.mult = 1 + Math.min(5, Math.floor(this.style / 16));
    this.score += this.speed * dt * CFG.scoreDist * 0.34 * this.mult;

    if (this.invuln > 0) this.invuln -= dt;
    this.shake = Math.max(0, this.shake - dt * 1.9);
    this.landT = Math.max(0, this.landT - dt);

    /* ---- transform ---------------------------------------------------- */
    this.applyTransform(frame, dt);
  }

  checkObstacles(events, world) {
    const px = this.x;
    const bot = this.h;
    const top = this.h + (this.sliding ? 0.95 : 1.95);
    for (const o of world.obstacles) {
      const ds = this.s - o.s;
      const sWin = (o.d || 1.4) * 0.5 + 1.0;
      if (ds < -sWin || ds > sWin) {
        // near-miss bookkeeping once we've passed it
        if (ds > sWin && ds < 30 && !this.nearMissed.has(o)) {
          this.nearMissed.add(o);
          const gap = Math.abs(px - o.x) - o.w * 0.5;
          if (gap > 0.1 && gap < 2.1) {
            this.score += CFG.nearMissBonus * this.mult;
            this.style += 5;
            this.idle = 0;
            events.trick && events.trick('NEAR MISS');
          }
        }
        continue;
      }
      if (Math.abs(px - o.x) > o.w * 0.5 + 0.7) continue;
      if (top < o.y0 || bot > o.y1) continue;
      this.crash(events, o);
      break;
    }
    if (this.nearMissed.size > 40) this.nearMissed.clear();
  }

  crash(events, o) {
    if (this.invuln > 0 || this.dead) return;
    this.shield--;
    this.invuln = CFG.hitInvuln;
    this.speed = Math.max(24, this.speed * 0.45);
    this.vx *= -0.5;
    this.style = 0;
    this.mult = 1;
    this.shake = 1;
    this.drifting = false;
    this.driftT = 0;
    if (this.grinding) this.grinding = null;
    if (this.shield <= 0) {
      this.dead = true;
      events.dead && events.dead(o);
    } else {
      events.hit && events.hit(o);
    }
  }

  applyTransform(frame, dt = 1 / 60) {
    const p = this.parts;
    const px = frame.x + frame.rx * this.x;
    const py = frame.y + this.x * frame.bank + this.h;
    const pz = frame.z + frame.rz * this.x;
    this.pos.set(px, py, pz);

    p.root.position.copy(this.pos);
    p.root.rotation.y = frame.yaw + this.driftAngle - this.spin;

    const pitch = clamp(-this.vy * 0.012, -0.25, 0.4) + (this.sliding ? 0.18 : 0);
    p.lean.rotation.z = damp(p.lean.rotation.z, this.lean + Math.atan(frame.bank) * 0.5, 9, dt);
    p.lean.rotation.x = damp(p.lean.rotation.x, pitch, 6, dt);
    p.lean.position.y = this.grounded ? Math.sin(performance.now() * 0.004) * 0.04 : 0.06;

    // bubble flash while invulnerable
    const b = p.bubble.material;
    const t = this.invuln > 0 ? Math.max(0, this.invuln / CFG.hitInvuln) : 0;
    b.opacity = t * 0.55 * (0.6 + 0.4 * Math.sin(performance.now() * 0.02));
    p.bubble.rotation.y += 0.02;
    p.bubble.scale.setScalar(1 + (1 - t) * 0.15);

    // boost flames
    p.flames.visible = this.boosting;
    if (this.boosting) {
      const s = 0.8 + Math.random() * 0.7;
      p.flames.children.forEach((c) => c.scale.set(0.8 + Math.random() * 0.4, s, 0.8 + Math.random() * 0.4));
    }
  }

  /* ------------------------------------------------------------ helpers */
  get forward() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }

  get yaw() {
    return this.world.path.frameAt(this.s).yaw;
  }

  visibleBody() { return !this.dead; }
}
