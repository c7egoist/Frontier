// Bollard Zipper: whole-avenue bollard rows that rise and sink in a moving pattern.
//
// Each row has one open lane (the "gap"). The gap is drawn by the Caller: pressing 1-5
// sets a target lane, and the gap steps toward it as rows are revealed ahead of the cars.
// Rows are revealed just before the lead car reaches them, so the pattern is drawn live.

import * as THREE from 'three';
import { CFG } from './config.js';
import { laneX, placeOnTrack, orientOnRoad } from './world.js';

const BOLLARD_H = 1.3;

export class ZipperSystem {
  constructor(track, scene) {
    this.track = track;
    this.scene = scene;
    this.cmd = Math.floor(CFG.LANES / 2);   // caller target lane
    this.lane = this.cmd;                    // current gap lane while drawing
    this.seq = 0;
    this.rows = [];
    this.entries = [];
    this.next = 0;

    const bGeo = new THREE.CylinderGeometry(0.42, 0.5, BOLLARD_H, 14);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x1b2030, roughness: 0.35, metalness: 0.7, emissive: 0x1ad8ff, emissiveIntensity: 0.55 });
    const capGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.14, 14);
    const capMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8ff6ff).multiplyScalar(2.6), toneMapped: false });
    const markerGeo = new THREE.PlaneGeometry(CFG.LANE_W * 0.9, 3.2);
    this.bGeo = bGeo; this.bMat = bMat; this.capGeo = capGeo; this.capMat = capMat;
    this.markerGeo = markerGeo;

    const names = track.sectionList().filter(([n]) => n.startsWith('zipper')).map(([n, s0, s1]) => ({ n, s0, s1 }));
    this.sections = names;
    const f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
    for (const sec of names) {
      const count = Math.floor((sec.s1 - sec.s0 - 24) / CFG.ZIP_ROW_SPACING);
      for (let i = 0; i < count; i++) {
        const s = sec.s0 + 12 + i * CFG.ZIP_ROW_SPACING;
        const row = {
          s, idx: this.rows.length, active: false, lap: -99, dist: 0, gap: 2,
          up: new Array(CFG.LANES).fill(true),
          hgt: new Array(CFG.LANES).fill(0),
          bollards: [], baseY: [], caps: [], marker: null,
        };
        track.frame(s, f);
        for (let j = 0; j < CFG.LANES; j++) {
          const g = new THREE.Group();
          const body = new THREE.Mesh(bGeo, bMat);
          body.castShadow = false;
          const cap = new THREE.Mesh(capGeo, capMat);
          cap.position.y = BOLLARD_H / 2;
          g.add(body, cap);
          const p = track.worldPoint(s, laneX(j), 0, [0, 0, 0]);
          g.position.set(p[0], p[1], p[2]);
          scene.add(g);
          row.baseY.push(p[1]);
          row.bollards.push(g);
          row.caps.push(cap);
        }
        const mk = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        orientOnRoad(mk, track.frame(s, f));
        scene.add(mk);
        row.marker = mk;
        this.rows.push(row);
      }
    }
    // Activation list: every row on every lap, in distance order.
    const L = track.L;
    for (let lap = 0; lap <= CFG.LAPS; lap++) {
      for (const row of this.rows) {
        this.entries.push({ row, lap, dist: lap * L + row.s, applied: false });
      }
    }
    this.entries.sort((a, b) => a.dist - b.dist);
    this.stepCount = 0;
  }

  setCommand(lane) {
    this.cmd = Math.max(0, Math.min(CFG.LANES - 1, lane));
  }

  // Reveal rows up to leadDist + horizon, and apply the caller's gap pattern to them.
  reveal(leadDist) {
    const limit = leadDist + CFG.ZIP_HORIZON;
    while (this.next < this.entries.length && this.entries[this.next].dist <= limit) {
      const e = this.entries[this.next++];
      this._apply(e);
    }
  }

  _apply(e) {
    // The gap steps one lane every second row, so the path is a slalom the car can follow.
    if (this.seq % 2 === 0) {
      if (this.cmd > this.lane) this.lane++;
      else if (this.cmd < this.lane) this.lane--;
    }
    this.seq++;
    const row = e.row;
    row.active = true;
    row.lap = e.lap;
    row.dist = e.dist;
    row.gap = this.lane;
    for (let j = 0; j < CFG.LANES; j++) row.up[j] = j !== this.lane;
    e.applied = true;
    e.gap = this.lane;
    const mp = this.track.worldPoint(row.s, laneX(this.lane), 0.1, [0, 0, 0]);
    row.marker.position.set(mp[0], mp[1], mp[2]);
    row.marker.material.opacity = 0.0;
  }

  // Animate bollards and markers.
  update(dt, t) {
    const rate = Math.min(1, CFG.ZIP_RAISE_SPEED * dt);
    for (const row of this.rows) {
      for (let j = 0; j < CFG.LANES; j++) {
        const target = row.active && row.up[j] ? 1 : 0;
        row.hgt[j] += (target - row.hgt[j]) * rate;
        if (Math.abs(target - row.hgt[j]) < 0.002) row.hgt[j] = target;
        // Body is centred on its origin; offset so it spans [0, H] when up and [-H, 0] when down.
        row.bollards[j].position.y = row.baseY[j] - BOLLARD_H / 2 + BOLLARD_H * row.hgt[j];
      }
      if (row.active) {
        row.marker.material.opacity = 0.35 + 0.25 * Math.sin(t * 6 + row.idx * 0.7);
      }
    }
  }

  // Collision and zip-through checks for one car. prevDist is the car's distance last frame.
  checkCar(car, events, prevDist) {
    const L = this.track.L;
    const lap = Math.floor(car.dist / L);
    const laneHalf = CFG.CAR_HALF_W + 0.5;
    for (const row of this.rows) {
      if (!row.active) continue;
      // Zip-through: the car crosses the row inside the open gap.
      if (prevDist < row.dist && car.dist >= row.dist) {
        const gx = laneX(row.gap);
        if (Math.abs(car.x - gx) < 1.4 && car.airborne === false) {
          events.push({ type: 'zip', car, row: row.idx, power: 1 });
        }
      }
      if (row.lap !== lap) continue;
      if (Math.abs(car.dist - row.dist) > CFG.CAR_HALF_L + 0.6) continue;
      for (let j = 0; j < CFG.LANES; j++) {
        if (!row.up[j] || row.hgt[j] < 0.6) continue;
        if (Math.abs(car.x - laneX(j)) > laneHalf) continue;
        if (car.y - this.track.frame(car.dist, _f).H > CFG.CAR_H + BOLLARD_H * 0.8) continue;
        const key = 'z' + row.idx + ':' + j;
        const last = car.hitCooldown.get(key) ?? -10;
        const now = car.clock ?? 0;
        if (now - last < 1.2) continue;
        car.hitCooldown.set(key, now);
        events.push({ type: 'bollard', car, row: row.idx, lane: j, power: car.v });
      }
    }
  }

  // Upcoming revealed rows ahead of distance `dist`, for the caller HUD.
  preview(dist, count = 7) {
    const out = [];
    for (const e of this.entries) {
      if (!e.applied) continue;
      if (e.dist <= dist) continue;
      out.push(e);
      if (out.length >= count) break;
    }
    return out;
  }

  // Lowest-cost lane free of raised bollards for the next `ahead` metres. Used by AI.
  laneBlockedAt(dist, lane) {
    for (const e of this.entries) {
      if (!e.applied) continue;
      if (e.dist < dist - 2) continue;
      if (e.dist > dist + 80) break;
      if (lane !== e.gap) return e.dist;
    }
    return null;
  }

  // The gap lane of the next revealed row ahead of `dist`, or null.
  nextGap(dist, maxAhead = 90) {
    for (const e of this.entries) {
      if (!e.applied) continue;
      if (e.dist < dist - 2) continue;
      if (e.dist > dist + maxAhead) return null;
      return { lane: e.gap, dist: e.dist };
    }
    return null;
  }
}

const _f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };
