// Arcade rail-style vehicle physics.
//
// A car lives in track space: dist (total distance travelled), x (lateral offset from the
// centreline, metres) and y (absolute height). Longitudinal speed, lateral grip, centrifugal
// force, slope gravity and airtime on jump ramps are all simulated. The renderer converts
// track coordinates to world coordinates each frame.

import { CFG } from './config.js';

const FR = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] };

export function makeCar({ id, name, team, color, isPlayer = false, dist = 0, x = 0, lane = 2 }) {
  return {
    id, name, team, color, isPlayer,
    dist,                 // total distance travelled (can start negative on the grid)
    x: x,
    vx: 0,
    v: 0,
    y: 0,                 // absolute height
    vz: 0,
    airborne: false,
    lap: 0,
    finished: false,
    finishTime: 0,
    lastLapStart: 0,
    noDetachUntil: -1e9,
    lapTimes: [],
    energy: CFG.ENERGY_MAX * 0.5,
    boostTimer: 0,
    stun: 0,
    spin: 0,
    spinRate: 0,
    yawVis: 0,
    slipVis: 0,
    throttleVis: 0,
    brakingVis: 0,
    boostingVis: false,
    input: { throttle: 0, brake: 0, steer: 0, boost: false, drift: false },
    ai: null,
    hitCooldown: new Map(),
    padCooldown: new Map(),
    lastLane: lane,
    gridLane: lane,
  };
}

// Wrapped position along the track for a car.
export function carS(car, track) {
  return track.wrap(car.dist);
}

// Advance one car by dt. `events` is an array that receives gameplay events.
export function stepCar(car, dt, track, events) {
  const f = track.frame(car.dist, FR);
  const inp = car.input;
  const v0 = car.v;

  car.stun = Math.max(0, car.stun - dt);
  car.boostTimer = Math.max(0, car.boostTimer - dt);
  const stunned = car.stun > 0;

  // ---- Longitudinal ----------------------------------------------------------
  const wantBoost = inp.boost && car.energy > 0 && !stunned;
  if (wantBoost) car.energy = Math.max(0, car.energy - CFG.ENERGY_BOOST_DRAIN * dt);
  const boosting = wantBoost || car.boostTimer > 0;
  const cap = boosting ? CFG.V_BOOST : CFG.V_MAX;
  const thr = stunned ? 0 : inp.throttle;

  let a = 0;
  if (thr > 0) {
    const k = Math.max(0, 1 - Math.pow(car.v / cap, 3));
    a += CFG.ACCEL * thr * k;
  }
  if (boosting) {
    const k = Math.max(0, 1 - Math.pow(car.v / CFG.V_BOOST, 3));
    a += CFG.BOOST_ACCEL * k;
  }
  if (car.v > cap) a -= (car.v - cap) * 1.6; // decay back to the cap
  if (inp.brake > 0 && !stunned) a -= CFG.BRAKE * inp.brake;
  if (thr <= 0) a -= CFG.COAST;
  a -= CFG.DRAG * car.v * car.v;
  if (!car.airborne) a -= CFG.G_REAL * f.slope;
  if (stunned) a -= 6;
  car.v = Math.max(0, car.v + a * dt);

  // ---- Lateral ---------------------------------------------------------------
  const steerIn = stunned ? inp.steer * 0.15 : inp.steer;
  const drifting = inp.drift && Math.abs(steerIn) > 0.1 && car.v > 22 && !car.airborne;
  const latMax = (CFG.LAT_BASE + CFG.LAT_SPEED * car.v) * (drifting ? 1.25 : 1);
  const vxTarget = steerIn * latMax;
  let grip = drifting ? CFG.DRIFT_GRIP : CFG.GRIP;
  if (car.airborne) grip *= 0.25;
  // Centrifugal force along the banked surface: kappa > 0 means the road bends right.
  const ax = -f.kappa * car.v * car.v * CFG.CENTRI + CFG.G_REAL * 0.8 * Math.sin(f.bank);
  car.vx += (vxTarget - car.vx) * Math.min(1, grip * dt) + ax * dt;
  car.x += car.vx * dt;

  // Side walls.
  if (Math.abs(car.x) > CFG.WALL_X) {
    const sgn = Math.sign(car.x);
    car.x = sgn * CFG.WALL_X;
    if (car.vx * sgn > 0) {
      if (car.vx * sgn > 6) events.push({ type: 'wall', car, power: car.vx * sgn });
      car.vx = -car.vx * 0.35;
      car.v *= 0.985;
    }
  }

  // ---- Progress --------------------------------------------------------------
  const prevDist = car.dist;
  car.dist += car.v * dt;

  // ---- Vertical (ramps and airtime) -----------------------------------------
  if (!car.airborne) {
    // Detach when the road curves away faster than gravity can follow.
    const needed = car.v * car.v * (-f.d2);
    if (needed > CFG.GRAVITY * 5 && car.v > 25 && car.dist > (car.noDetachUntil ?? -1e9)) {
      car.airborne = true;
      car.vz = f.slope * car.v;
      events.push({ type: 'jump', car, power: car.vz });
    } else {
      car.y = f.H;
      car.vz = 0;
    }
  }
  if (car.airborne) {
    const f2 = track.frame(car.dist, FR);
    car.vz -= CFG.GRAVITY * dt;
    car.y += car.vz * dt;
    if (car.y <= f2.H) {
      const impact = -car.vz;
      car.y = f2.H;
      car.airborne = false;
      if (impact > 6) {
        car.v *= Math.max(0.6, 1 - (impact - 6) * 0.02);
        events.push({ type: 'land', car, power: impact });
      }
      car.vz = 0;
      car.noDetachUntil = car.dist + 30; // ride the far side of the ramp instead of re-launching
    }
  }

  // ---- Visual state ----------------------------------------------------------
  const slip = Math.atan2(car.vx, Math.max(car.v, 6));
  car.slipVis += (slip - car.slipVis) * Math.min(1, 10 * dt);
  car.throttleVis = thr;
  car.brakingVis = (inp.brake > 0 && !stunned) || car.v - v0 < -0.02;
  car.boostingVis = boosting;
  if (car.stun > 0) car.spin += car.spinRate * dt;
  else car.spin *= Math.max(0, 1 - 6 * dt);
  car.yawVis = slip * 0.55;

  // Keep the "lap" counter in sync with distance.
  return prevDist;
}
