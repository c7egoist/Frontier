import * as THREE from 'three';
import { Rng, swayAmp, terrainHeight, windValue, WIND_DIR } from '../util/noise.js';
import {
  TubeRibbon, makePetalGeometry, basisQuat, lookQuat, bakeSway, makeThornGeometry,
} from './geometry.js';
import {
  buildAnimatedFlower, tendrilPoints, stamenBlueprint,
} from './flowers.js';
import {
  plantLayout, bezier, stemRadius, sideFlowerSlots, slotTransform, buildSideBloom, buildBaseFoliage, leafDir, thornDir,
} from './decoys.js';
import { buildHead } from './predatorHead.js';
import { stemMaterial, leafMaterial, thornMaterial, filamentMaterial, antherMaterial } from './materials.js';

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export const STATE = { DORMANT: 'dormant', ALERT: 'alert', STRIKE: 'strike', HOLD: 'hold', SWALLOW: 'swallow', RECOVER: 'recover', STUNNED: 'stunned' };

const STEM_SEGS = 36;

export class Predator {
  /**
   * @param species 'orchid' | 'lily'
   * @param opts { x, z, H, seed }
   */
  constructor(species, { x, z, H, seed }) {
    this.species = species;
    this.H = H;
    this.rng = new Rng(seed);
    const rng = this.rng;
    const yaw = rng.range(0, Math.PI * 2);
    this.lay = plantLayout(species, rng, H, yaw);
    this.L = this.lay.L;
    this.headSize = species === 'orchid' ? H * 0.46 : H * 0.42;
    this.group = new THREE.Group();
    this.group.position.set(x, terrainHeight(x, z) - 0.15, z);
    this.baseWorld = this.group.position.clone();
    this.x = x; this.z = z;

    // stem
    this.tube = new TubeRibbon(STEM_SEGS, 10, { vRepeat: Math.max(2, H * 0.35) });
    this.stem = new THREE.Mesh(this.tube.geometry, stemMaterial(species));
    this.stem.castShadow = true; this.stem.receiveShadow = true; this.stem.frustumCulled = false;
    this.group.add(this.stem);
    this.group.add(buildBaseFoliage(species, H, rng));

    // flower + head
    const fl = buildAnimatedFlower(species, this.L, rng);
    this.flower = fl.group; this.organs = fl.organs;
    this.group.add(this.flower);
    this.head = buildHead(species, this.headSize, seed);
    this.group.add(this.head.root);

    // tendrils (lily)
    this.tendrils = [];
    if (species === 'lily') {
      const bp = stamenBlueprint(this.L, rng, 16);
      const mat = filamentMaterial();
      const geo = new THREE.SphereGeometry(this.L * 0.034, 8, 6);
      this.anthers = new THREE.InstancedMesh(geo, antherMaterial('lily'), bp.length);
      this.anthers.frustumCulled = false; this.anthers.castShadow = true;
      this.flower.add(this.anthers);
      for (const s of bp) {
        const tr = new TubeRibbon(12, 6);
        const m = new THREE.Mesh(tr.geometry, mat);
        m.frustumCulled = false; m.castShadow = true;
        this.flower.add(m);
        this.tendrils.push({ s, tr, mesh: m, pts: Array.from({ length: 13 }, () => new THREE.Vector3()) });
      }
    }

    // side blooms follow the stem
    this.slots = sideFlowerSlots(species, rng, H, this.L).map((s) => ({ ...s, obj: buildSideBloom(species, s, rng, 0) }));
    for (const s of this.slots) this.group.add(s.obj);

    // stem leaves / thorns (lily)
    this.leaves = []; this.thorns = null;
    if (species === 'lily') {
      const nl = Math.max(4, Math.round(H * 0.9));
      for (let k = 0; k < nl; k++) {
        const t = 0.08 + 0.62 * (k / nl);
        const len = H * (0.2 - 0.09 * t) * rng.range(0.8, 1.15);
        const geo = makePetalGeometry({ length: len, width: len * 0.3, peak: 0.45, tipPow: 0.8, curl: 0.2, droop: 1.0, fold: 0.35, ruffle: 0.015, seed: k + 3, segU: 12, segV: 6 });
        bakeSway(geo, 0);
        const m = new THREE.Mesh(geo, leafMaterial('leafLily'));
        m.castShadow = true; m.frustumCulled = false;
        this.group.add(m);
        this.leaves.push({ t, az: k * 2.4 + rng.range(-0.3, 0.3), mesh: m });
      }
      const nt = Math.round(H * 3.2);
      const tg = makeThornGeometry(1, 0.22, 5);
      this.thorns = new THREE.InstancedMesh(tg, thornMaterial(), nt);
      this.thorns.frustumCulled = false; this.thorns.castShadow = true;
      this.thornData = [];
      for (let k = 0; k < nt; k++) this.thornData.push({ t: 0.03 + 0.85 * (k / nt), az: k * 2.1 + rng.range(-0.4, 0.4), len: H * rng.range(0.025, 0.05) });
      this.group.add(this.thorns);
    }

    // kinematics (plant-local space; origin at the base)
    this.restP = this.lay.P.map((p) => p.clone());
    this.restFlowerPos = this.restP[3].clone().addScaledVector(this.lay.face, this.L * 0.12);
    this.S0 = (() => { let s = 0, prev = this.restP[0].clone(), q = new THREE.Vector3(); for (let i = 1; i <= 20; i++) { bezier(this.restP, i / 20, q); s += q.distanceTo(prev); prev.copy(q); } return s; })();
    this.hp = this.restP[3].clone();  // head base (end of stem)
    this.hv = new THREE.Vector3();
    this.hd = this.lay.face.clone();  // head direction
    this.neck = 0;                     // neck extension (m)
    this.neckV = 0;
    this.gape = 0; this.gapeV = 0;
    this.awake = 0;
    this.flare = 0; this.reach = 0; this.lash = 0;

    this.state = STATE.DORMANT;
    this.stateT = 0;
    this.cooldown = 1.0;
    this.target = null;
    this.strikeTarget = new THREE.Vector3();
    this.holdSeed = rng.range(0, 100);
    this.didSnap = false;
    this.alertLoss = 0;
    this.time = 0;

    this.pts = Array.from({ length: STEM_SEGS + 1 }, () => new THREE.Vector3());
    this.cum = new Float32Array(STEM_SEGS + 1);
    this.radii = new Float32Array(STEM_SEGS + 1);
    this._v = [0, 0, 0, 0, 0, 0].map(() => new THREE.Vector3());
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this.collarPos = new THREE.Vector3();
    this.mouthWorld = new THREE.Vector3();
    this.chestOffset = 1.1;

    // optional gameplay reveal marker
    this.marker = this._makeMarker();
    this.group.add(this.marker);
    this.marker.visible = false;
  }

  _makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.H * 0.55, this.H * 0.6, 64),
      new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, fog: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.4;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, this.H * 2.2, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff5a3a', transparent: true, opacity: 0.35, depthWrite: false, fog: false })
    );
    beam.position.y = this.H * 1.1;
    g.add(ring, beam);
    g.renderOrder = 10;
    ring.material.depthTest = false; beam.material.depthTest = false;
    return g;
  }

  get awakeLevel() { return this.awake; }

  /** World-space position of the mouth centre. */
  getMouth(out = new THREE.Vector3()) {
    return this.head.root.localToWorld(out.set(0, 0, 0.45));
  }

  // -------------------------------------------------------------------------
  update(dt, time, ctx) {
    dt = Math.min(dt, 1 / 20);
    this.time = time;
    this.stateT += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const base = this.baseWorld;

    // ---- perception -------------------------------------------------------
    let best = null, bestD = 1e9;
    for (const t of ctx.targets) {
      if (!t.alive || !t.targetable) continue;
      if (t.carriedBy && t.carriedBy !== this) continue;
      const dx = t.position.x - base.x, dz = t.position.z - base.z;
      const d = Math.hypot(dx, dz);
      const aware = d < Math.max(5, t.noise);
      if (aware && d < bestD) { best = t; bestD = d; }
    }
    const maxReach = this.S0 * 0.98 + this.headSize * 0.7;
    const strikeReach = Math.min(maxReach * 0.86, this.S0 * 0.98);

    // ---- state transitions -----------------------------------------------
    const S = this.state;
    if (S === STATE.DORMANT) {
      if (best && this.cooldown <= 0) { this._enter(STATE.ALERT, best); ctx.audio?.stir(this.baseWorld); }
    } else if (S === STATE.ALERT) {
      if (!this.target || !this.target.alive || this.target.carriedBy) { this._enter(STATE.RECOVER); }
      else {
        if (best) { this.target = best; this.alertLoss = 0; } else this.alertLoss += dt;
        const d = Math.hypot(this.target.position.x - base.x, this.target.position.z - base.z);
        if (this.stateT > 0.85 && d < strikeReach && best) this._enter(STATE.STRIKE, this.target, ctx);
        else if (this.alertLoss > 3.0) this._enter(STATE.RECOVER);
      }
    } else if (S === STATE.STRIKE) {
      this._strikeLogic(dt, ctx);
    } else if (S === STATE.HOLD) {
      this._holdLogic(dt, ctx);
    } else if (S === STATE.SWALLOW) {
      if (this.stateT > 2.6) this._enter(STATE.RECOVER);
    } else if (S === STATE.RECOVER) {
      if (this.stateT > 2.4) { this._enter(STATE.DORMANT); this.cooldown = 1.8; }
    } else if (S === STATE.STUNNED) {
      if (this.stateT > 4.0) this._enter(STATE.RECOVER);
    }

    // ---- desired pose -----------------------------------------------------
    const pose = this._desiredPose(dt, ctx);

    // springs
    const sub = 2, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      const dx = pose.hp.x - this.hp.x, dy = pose.hp.y - this.hp.y, dz = pose.hp.z - this.hp.z;
      this.hv.x += (dx * pose.k - this.hv.x * pose.c) * h;
      this.hv.y += (dy * pose.k - this.hv.y * pose.c) * h;
      this.hv.z += (dz * pose.k - this.hv.z * pose.c) * h;
      this.hp.addScaledVector(this.hv, h);
      const na = (pose.neck - this.neck) * pose.kn - this.neckV * pose.cn; this.neckV += na * h; this.neck += this.neckV * h;
      const ga = (pose.gape - this.gape) * pose.kg - this.gapeV * pose.cg; this.gapeV += ga * h; this.gape += this.gapeV * h;
    }
    this.hd.lerp(pose.hd, damp(pose.dirRate, dt)).normalize();
    this.awake += (pose.awake - this.awake) * damp(pose.awakeRate, dt);
    this.flare += (pose.flare - this.flare) * damp(pose.flareRate, dt);
    this.reach += (pose.reach - this.reach) * damp(4, dt);
    this.lash += (pose.lash - this.lash) * damp(6, dt);

    // keep the head above the ground
    const gy = terrainHeight(base.x + this.hp.x, base.z + this.hp.z) - base.y;
    if (this.hp.y < gy + 0.35) { this.hp.y = gy + 0.35; if (this.hv.y < 0) this.hv.y = 0; }

    this._buildStem(time);
    this._poseFlowerAndHead(time, ctx);
    this.marker.visible = !!ctx.reveal;
    if (ctx.reveal) this.marker.children[0].material.opacity = 0.5 + 0.3 * Math.sin(time * 3 + this.x);
  }

  _enter(state, target, ctx) {
    this.state = state; this.stateT = 0; this.didSnap = false;
    if (target !== undefined) this.target = target;
    if (state === STATE.STRIKE) {
      this.strikeTarget.copy(this.target.position).setY(this.target.position.y + this.chestOffset);
      if (this.target.velocity) this.strikeTarget.addScaledVector(this.target.velocity, 0.28);
      ctx?.audio?.roar(this.baseWorld, 1);
    }
    if (state === STATE.ALERT) this.alertLoss = 0;
    if (state === STATE.RECOVER || state === STATE.DORMANT) { if (this.target && this.target.carriedBy === this) this.target.release?.(); }
    if (state === STATE.RECOVER) this.target = null;
  }

  _local(world, out) { return out.copy(world).sub(this.baseWorld); }

  _clampReach(v) {
    // keep a point within what the stem can physically reach
    const max = this.S0 * 1.02;
    const len = v.length();
    if (len > max) v.multiplyScalar(max / len);
    return v;
  }

  _strikeLogic(dt, ctx) {
    const t = this.stateT;
    const tgt = this.target;
    if (!tgt || !tgt.alive) { this._enter(STATE.RECOVER); return; }
    // wind-up 0..0.28, lunge 0.28..0.55, snap at 0.55
    if (t < 0.3) {
      // keep tracking
      this.strikeTarget.copy(tgt.position).setY(tgt.position.y + this.chestOffset);
      if (tgt.velocity) this.strikeTarget.addScaledVector(tgt.velocity, 0.3);
    }
    if (t >= 0.56 && !this.didSnap) {
      this.didSnap = true;
      this.getMouth(this._v[5]);
      const chest = this._v[4].copy(tgt.position); chest.y += this.chestOffset;
      const catchR = this.headSize * 0.52 + 0.7;
      if (this._v[5].distanceTo(chest) < catchR && !tgt.carriedBy && tgt.grab(this)) {
        this._enter(STATE.HOLD, tgt);
        ctx.audio?.bite(this.baseWorld);
        return;
      }
      ctx.audio?.bite(this.baseWorld, 0.5);
    }
    if (t > 1.15) this._enter(STATE.RECOVER);
  }

  _holdLogic(dt, ctx) {
    const tgt = this.target;
    if (!tgt || tgt.carriedBy !== this) { this._enter(STATE.STUNNED); ctx.audio?.roar(this.baseWorld, 1.2); return; }
    this.getMouth(this._v[5]);
    const eye = this.head.root.localToWorld(this._v[4].set(0, 0.0, 0.2));
    tgt.carryTo(this._v[5], this.hd, eye);
    tgt.damage(this.species === 'orchid' ? 17 * dt : 20 * dt, this);
    if (!tgt.alive) { this._enter(STATE.SWALLOW, tgt); ctx.audio?.gulp(this.baseWorld); }
  }

  _desiredPose(dt, ctx) {
    const rest = this.restP[3], face = this.lay.face;
    const v = this._v[0], dirTo = this._v[1], tmp = this._v[2];
    const out = this._pose || (this._pose = { hp: new THREE.Vector3(), hd: new THREE.Vector3() });
    const H = this.H, Lh = this.headSize;
    Object.assign(out, { k: 40, c: 10, kn: 50, cn: 9, kg: 60, cg: 10, neck: 0, gape: 0, awake: 0, awakeRate: 2.2, flare: 0, flareRate: 2.5, reach: 0, lash: 0, dirRate: 4 });
    out.hp.copy(rest); out.hd.copy(face);

    const aimAt = (world) => {
      this._local(world, tmp);
      dirTo.copy(tmp).sub(this.restFlowerPos);
      return dirTo.normalize();
    };

    switch (this.state) {
      case STATE.DORMANT: {
        out.awakeRate = 3; out.flareRate = 1.5;
        break;
      }
      case STATE.ALERT: {
        const tgt = this.target;
        const w = tgt.position;
        this._local(this._v[3].set(w.x, w.y + 1.0, w.z), tmp);
        dirTo.copy(tmp).sub(this.restFlowerPos).normalize();
        const horiz = new THREE.Vector3(dirTo.x, 0, dirTo.z).normalize();
        out.hp.copy(rest).addScaledVector(horiz, H * 0.2).addScaledVector(UP, H * 0.1);
        out.hd.copy(dirTo).lerp(horiz, 0.35).normalize();
        out.neck = Lh * 0.55; out.awake = 1; out.flare = 1; out.reach = 0.55;
        out.gape = 0.28 + 0.16 * Math.sin(this.time * 7);
        out.k = 22; out.c = 7; out.awakeRate = 3.2; out.flareRate = 3;
        // coil slightly as it fixes on its prey
        out.hp.addScaledVector(UP, Math.sin(this.time * 2.0 + this.x) * 0.15);
        break;
      }
      case STATE.STRIKE: {
        const t = this.stateT;
        const tgtLocal = this._local(this.strikeTarget, this._v[3]);
        this._clampReach(tgtLocal);
        dirTo.copy(tgtLocal).sub(this.restFlowerPos).normalize();
        if (t < 0.3) {
          // wind-up: head draws back and up, jaws gape wide, tendrils flare
          const back = new THREE.Vector3(dirTo.x, 0, dirTo.z).normalize();
          out.hp.copy(rest).addScaledVector(back, -H * 0.12).addScaledVector(UP, H * 0.28);
          out.hd.copy(dirTo);
          out.k = 90; out.c = 14; out.neck = Lh * 0.6; out.gape = 1.0; out.kg = 80; out.cg = 11;
          out.reach = 0.9; out.lash = 0.3;
        } else {
          // lunge: mouth arrives on the prey
          const mouthOff = Lh * 0.5;
          out.hp.copy(tgtLocal).addScaledVector(dirTo, -mouthOff);
          out.hd.copy(dirTo);
          out.k = 520; out.c = 34; out.neck = Lh * 1.5; out.kn = 260; out.cn = 24;
          out.gape = t < 0.56 ? 1.15 : 0.0; out.kg = t < 0.56 ? 80 : 900; out.cg = t < 0.56 ? 11 : 55;
          out.reach = 1; out.lash = 1; out.dirRate = 14;
        }
        out.awake = 1; out.flare = 1.25; out.flareRate = 8;
        break;
      }
      case STATE.HOLD: {
        // lift prey high, shake it
        const s = this.stateT;
        const sh = 0.7 + 0.5 * Math.min(1, s / 2);
        const lift = new THREE.Vector3(this.lay.face.x, 0, this.lay.face.z).normalize();
        out.hp.copy(rest).addScaledVector(lift, H * 0.18).addScaledVector(UP, H * 0.45);
        out.hp.x += Math.sin((s + this.holdSeed) * 9.0) * 0.55 * sh;
        out.hp.y += Math.sin((s + this.holdSeed) * 12.0) * 0.5 * sh;
        out.hp.z += Math.cos((s + this.holdSeed) * 8.0) * 0.55 * sh;
        out.hd.set(lift.x * 0.6, 0.75 + Math.sin(s * 5) * 0.12, lift.z * 0.6).normalize();
        out.neck = Lh * 1.2; out.awake = 1; out.flare = 1.2; out.reach = 0.9; out.lash = 0.6;
        out.gape = 0.5 + 0.16 * Math.sin(s * 6.5); // chewing
        out.k = 45; out.c = 5; out.dirRate = 6;
        break;
      }
      case STATE.SWALLOW: {
        const s = this.stateT;
        out.hp.copy(rest).addScaledVector(UP, H * 0.35);
        out.hd.set(this.lay.face.x * 0.3, 0.95, this.lay.face.z * 0.3).normalize();
        out.neck = Lh * 1.1; out.awake = 1; out.flare = 1;
        out.gape = s < 0.8 ? 0.7 : 0; out.reach = 0.4;
        out.k = 14; out.c = 5;
        break;
      }
      case STATE.STUNNED: {
        const s = this.stateT;
        out.hp.copy(rest).addScaledVector(UP, H * 0.3).addScaledVector(face, H * 0.1);
        out.hd.copy(face).setY(0.8).normalize();
        out.neck = Lh * 0.9; out.awake = 1; out.flare = 1.3; out.reach = 0.2;
        out.gape = 0.9 + 0.2 * Math.sin(s * 14) * Math.max(0, 1 - s * 0.6);
        out.k = 30; out.c = 6; out.awakeRate = 2;
        break;
      }
      case STATE.RECOVER: {
        const s = this.stateT;
        const f = smooth(0.2, 2.2, s);
        out.awake = 1 - f; out.flare = 1 - f; out.reach = 0.3 * (1 - f);
        out.neck = Lh * 0.5 * (1 - f);
        out.hp.copy(rest).addScaledVector(UP, H * 0.1 * (1 - f));
        out.k = 14; out.c = 6; out.kn = 18; out.cn = 7; out.awakeRate = 1.8; out.flareRate = 1.4; out.dirRate = 2.5;
        out.gape = 0.0; out.kg = 20; out.cg = 7;
        break;
      }
    }
    return out;
  }

  // -------------------------------------------------------------------------
  _buildStem(time) {
    const P = this._v;
    const a = this.awake;
    const base = new THREE.Vector3(0, 0, 0);
    const end = this.hp;
    const distance = end.length();
    const hdir = this.hd;
    // control points: blend rest shape with a dynamic S-curve towards the head
    const m = Math.max(this.S0 * 0.2, distance * 0.36);
    const startDir = new THREE.Vector3(end.x, 0, end.z).normalize().multiplyScalar(0.28).add(UP).normalize();
    const dyn1 = base.clone().addScaledVector(startDir, m * 1.15);
    const dyn2 = end.clone().addScaledVector(hdir, -m);
    const restP1 = this.restP[1], restP2 = this.restP[2];
    const c1 = restP1.clone().lerp(dyn1, a);
    const c2 = restP2.clone().add(end).sub(this.restP[3]).lerp(dyn2, a); // rest shape rides with the head offset
    const cp = [base, c1, c2, end];
    const pts = this.pts;
    const tmp = new THREE.Vector3();
    // arc-length parametrisation (resample)
    const N = STEM_SEGS, dense = 90;
    const dpts = this._dense || (this._dense = Array.from({ length: dense + 1 }, () => new THREE.Vector3()));
    const dcum = this._dcum || (this._dcum = new Float32Array(dense + 1));
    for (let i = 0; i <= dense; i++) { bezier(cp, i / dense, dpts[i]); dcum[i] = i ? dcum[i - 1] + dpts[i].distanceTo(dpts[i - 1]) : 0; }
    const total = dcum[dense];
    let j = 0;
    for (let i = 0; i <= N; i++) {
      const target = (i / N) * total;
      while (j < dense - 1 && dcum[j + 1] < target) j++;
      const f = (target - dcum[j]) / Math.max(1e-6, dcum[j + 1] - dcum[j]);
      pts[i].lerpVectors(dpts[j], dpts[Math.min(dense, j + 1)], f);
      this.cum[i] = target;
    }
    this.streamLen = total;
    // wind sway (matches the vertex-shader sway on decoys), faded while the plant is thrashing
    const windK = 1 - 0.85 * Math.min(1, a * 1.2);
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      const amp = swayAmp(p.y, this.H) * windK;
      if (amp > 0) {
        const w = windValue(this.baseWorld.x + p.x, this.baseWorld.z + p.z, time) * amp;
        p.x += WIND_DIR[0] * w; p.z += WIND_DIR[1] * w;
      }
    }
    // collar index: arc distance `neck` back from the head base
    const neckLen = Math.min(this.neck, total * 0.6);
    let ic = N;
    for (let i = N; i >= 0; i--) { if (total - this.cum[i] >= neckLen) { ic = i; break; } }
    this.ic = Math.min(N, ic);

    // radii: stem taper, widening into the neck
    const H = this.H, sp = this.species;
    const neckStart = this.ic / N;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      let r = stemRadius(sp, H, t);
      const toHead = smooth(neckStart * 0.9, 1, t) * a;
      r = r * (1 - toHead) + (this.headSize * (sp === 'orchid' ? 0.075 : 0.1)) * toHead;
      this.radii[i] = r;
    }
    this.tube.update(pts, this.radii);

    // attachments on the moving stem
    const frames = this.tube.frames;
    for (const s of this.slots) {
      const i = Math.round(s.t * N);
      const p = pts[i];
      const tr = slotTransform(s, p, frames[i].t, sp);
      s.obj.position.copy(tr.pos); s.obj.quaternion.copy(tr.quat);
      // buds/blooms past the collar are hidden by the neck: let them stay (they ride the stem)
    }
    if (this.leaves.length) {
      for (const l of this.leaves) {
        const i = Math.round(l.t * N), f = frames[i];
        const radial = this._v[3].copy(f.n).multiplyScalar(Math.cos(l.az)).addScaledVector(f.b, Math.sin(l.az));
        const dir = leafDir(radial, f.t);
        l.mesh.position.copy(pts[i]);
        l.mesh.quaternion.copy(basisQuat(dir, f.t));
      }
      const mtx = this._m, q = this._q, sc = new THREE.Vector3();
      for (let k = 0; k < this.thornData.length; k++) {
        const d = this.thornData[k];
        const i = Math.min(N, Math.round(d.t * N)), f = frames[i];
        const radial = this._v[3].copy(f.n).multiplyScalar(Math.cos(d.az)).addScaledVector(f.b, Math.sin(d.az));
        const dir = thornDir(radial, f.t);
        q.setFromUnitVectors(UP, dir);
        const r = this.radii[i];
        tmp.copy(pts[i]).addScaledVector(radial, r * 0.8);
        sc.setScalar(d.len);
        mtx.compose(tmp, q, sc);
        this.thorns.setMatrixAt(k, mtx);
      }
      this.thorns.instanceMatrix.needsUpdate = true;
    }
  }

  _poseFlowerAndHead(time, ctx) {
    const N = STEM_SEGS, pts = this.pts, ic = this.ic;
    const a = this.awake;
    // flower sits at the collar, facing along the stem
    const i0 = Math.max(0, ic - 1), i1 = Math.min(N, ic + 1);
    const T = this._v[3].subVectors(pts[i1], pts[i0]).normalize();
    this.flower.position.copy(pts[ic]).addScaledVector(T, this.L * 0.12);
    this.flower.quaternion.copy(lookQuat(T, UP));

    // petals open / flare back to give the jaws room
    const f = this.flare;
    for (const o of this.organs) {
      let extra = 0;
      if (o.role === 'petal') extra = 0.85; else if (o.role === 'sepal') extra = 0.5; else if (o.role === 'lip') extra = 1.3; else if (o.role === 'under') extra = 0.5; else extra = 0.6;
      if (this.species === 'lily' && o.role === 'petal') extra = 0.95;
      const flutter = Math.sin(time * (2.0 + f * 7) + o.flutter) * (0.012 + 0.07 * f);
      const alpha = o.alpha0 + extra * f + flutter;
      o.pivot.rotation.x = Math.PI / 2 - alpha;
    }
    // column / pistil retreat as the head emerges
    this.flower.children.forEach((c) => { if (c.isGroup && !c.rotation.order.startsWith('ZXY')) c.visible = a < 0.5; });

    // head
    const head = this.head;
    head.root.position.copy(this.hp);
    head.root.quaternion.copy(lookQuat(this.hd, UP));
    const s = 0.1 + 0.9 * smooth(0, 0.85, a);
    head.root.scale.setScalar(this.headSize * s);
    head.root.visible = a > 0.015;
    head.setGape(this.gape);
    head.root.updateMatrixWorld(true);

    // eyes track the target
    if (head.eyes.length) {
      const tgt = this.target;
      const look = this._v[4];
      if (tgt) look.copy(tgt.position).setY(tgt.position.y + 1.4).sub(this.baseWorld);
      else look.copy(this.hp).addScaledVector(this.hd, 10);
      for (const eye of head.eyes) {
        // blend the socket-outward direction with the look direction (head-local)
        const lh = head.root.worldToLocal(look.clone().add(this.baseWorld)).sub(eye.parent.position).normalize();
        const dirL = eye.userData.socketNormal.clone().multiplyScalar(0.9).add(lh.multiplyScalar(0.55)).normalize();
        eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirL);
      }
    }

    // tendrils
    if (this.tendrils.length) {
      this.flower.updateMatrixWorld(true);
      const target = this._v[5];
      if (this.target) {
        target.set(this.target.position.x, this.target.position.y + 1.0, this.target.position.z).sub(this.baseWorld);
        target.sub(this.flower.position).normalize().applyQuaternion(this._q.copy(this.flower.quaternion).invert());
      } else target.set(0, 0, 1);
      const m = this._m, q = this._q, sc = new THREE.Vector3(), pos = new THREE.Vector3(), d = new THREE.Vector3();
      this.tendrils.forEach((td, i) => {
        tendrilPoints(td.pts, { ...td.s, t: time, reach: this.reach, target: this.reach > 0.01 ? target : null, lash: this.lash });
        td.tr.update(td.pts, (k) => td.s.r0 * (1 - 0.55 * k / 12) * (1 + 0.5 * this.reach * 0));
        const l = td.pts[12], p = td.pts[11];
        d.subVectors(l, p).normalize();
        q.setFromUnitVectors(UP, d);
        sc.set(1, 2.4, 1);
        m.compose(l, q, sc);
        this.anthers.setMatrixAt(i, m);
      });
      this.anthers.instanceMatrix.needsUpdate = true;
    }
  }

  /** For debugging / UI. */
  get dangerous() { return this.state !== STATE.DORMANT && this.state !== STATE.RECOVER; }
}
