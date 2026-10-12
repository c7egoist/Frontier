// AI driver. Produces car.input each frame from the track and the world state.
//
// Goals, in priority order: stay on the road, avoid collisions with traffic, bollards, trains
// and other cars, shoot through the open zipper gap, keep a sensible speed for the corners.

import { CFG } from './config.js';

const LAT_GRIP_AI = 44;

function wrapDelta(a, b, L) {
  // signed shortest distance from b to a along the loop (a - b)
  let d = a - b;
  d = ((d + L / 2) % L + L) % L - L / 2;
  return d;
}

function laneX(j) {
  return (j - (CFG.LANES - 1) / 2) * CFG.LANE_W;
}

export function aiControl(car, ctx) {
  const { track, zipper, traffic, trains, racers, diff } = ctx;
  const L = track.L;
  const s = track.wrap(car.dist);
  const inp = car.input;
  const f = ctx._f || (ctx._f = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0] });

  // ---- Corner speed ----------------------------------------------------------
  const look = Math.min(130, 30 + car.v * 1.15);
  let kMax = 0;
  for (let d = 0; d <= look; d += 12) {
    track.frame(s + d, f);
    kMax = Math.max(kMax, Math.abs(f.kappa));
  }
  const vCorner = Math.sqrt(LAT_GRIP_AI / Math.max(kMax, 1e-4));
  let target = Math.min(CFG.V_MAX * 0.97, vCorner) * diff.aiSpeed;

  // ---- Lane clearance --------------------------------------------------------
  // For each lane: distance until something blocks it (traffic, raised bollard, train, car).
  const clear = new Array(CFG.LANES).fill(120);
  const ahead = (d) => d > 0 && d < 120;
  for (const t of traffic) {
    if (!t.alive) continue;
    const d = wrapDelta(t.s, s, L);
    if (!ahead(d)) continue;
    for (let j = 0; j < CFG.LANES; j++) {
      if (Math.abs(t.x - laneX(j)) < 2.6) clear[j] = Math.min(clear[j], d);
    }
  }
  for (const r of racers) {
    if (r === car) continue;
    const d = wrapDelta(track.wrap(r.dist), s, L);
    if (!ahead(d)) continue;
    for (let j = 0; j < CFG.LANES; j++) {
      if (Math.abs(r.x - laneX(j)) < 2.6) {
        clear[j] = Math.min(clear[j], d);
        // Shadow the car ahead: don't go faster than it when we're close behind.
        if (d < 18 && Math.abs(r.x - car.x) < 2.6) target = Math.min(target, Math.max(r.v - 1, 22));
      }
    }
  }
  for (let j = 0; j < CFG.LANES; j++) {
    const hit = zipper ? zipper.laneBlockedAt(car.dist, j) : null;
    if (hit !== null && hit !== undefined) {
      const d = hit - car.dist;
      if (d > 0) clear[j] = Math.min(clear[j], d);
    }
  }
  for (const tr of trains) {
    if (!tr.warnActive()) continue;
    const d = wrapDelta(tr.sC, s, L);
    if (d > 0 && d < 160) {
      const blk = tr.blockedInterval();
      for (let j = 0; j < CFG.LANES; j++) {
        if (blk && laneX(j) > blk[0] - 2 && laneX(j) < blk[1] + 2) clear[j] = Math.min(clear[j], d);
        else if (tr.phase === 'warn') clear[j] = Math.min(clear[j], d * 0.9 + 6);
      }
      // slow down for the crossing unless it's already clear
      if (d < 90) target = Math.min(target, tr.phase === 'pass' ? 6 : 26);
    }
  }

  // ---- Lane choice -----------------------------------------------------------
  const gap = zipper ? zipper.nextGap(car.dist, 110) : null;
  let bestJ = car.lastLane, bestScore = -1e9;
  for (let j = 0; j < CFG.LANES; j++) {
    let score = Math.min(clear[j], 110) * 0.9;
    score -= Math.abs(laneX(j) - car.lineX) * 1.4;
    if (gap && gap.lane === j) score += 40 * (car.teamA ? 1.25 : 1);
    if (j === car.lastLane) score += 4; // hysteresis
    if (clear[j] < 14) score -= 60;
    if (score > bestScore) { bestScore = score; bestJ = j; }
  }
  car.lastLane = bestJ;
  let desiredX = laneX(bestJ);
  // If the zipper gap is close, commit to it exactly.
  if (gap && gap.dist - car.dist < 120 && gap.dist > car.dist - 2) desiredX = laneX(gap.lane);

  // Keep the car away from the walls.
  desiredX = Math.max(-CFG.WALL_X + 1.5, Math.min(CFG.WALL_X - 1.5, desiredX));

  // ---- Steering --------------------------------------------------------------
  const err = desiredX - car.x;
  let steer = err * 0.42 - car.vx * 0.22;
  steer = Math.max(-1, Math.min(1, steer));
  inp.steer = steer;

  // ---- Speed ----------------------------------------------------------------
  if (car.v < target - 1) {
    inp.throttle = 1;
    inp.brake = 0;
  } else if (car.v > target + 3) {
    inp.throttle = 0;
    inp.brake = Math.min(1, (car.v - target) / 10);
  } else {
    inp.throttle = 0.6;
    inp.brake = 0;
  }
  // Brake softly when the lateral error is large; slide-safe.
  if (Math.abs(err) > 3 && car.v > 30) inp.throttle = Math.min(inp.throttle, 0.5);

  // Boost on the straights when there's energy to spare.
  inp.boost = car.energy > 35 && kMax < 0.005 && car.v > 40 && !car.airborne && car.stun <= 0;
  inp.drift = false;
  car.aiTarget = target;
}
