// Central tuning. Everything the feel depends on lives here.
export const CFG = {
  // ---- track
  halfWidth: 10,
  wallHeight: 1.15,
  laneGuides: true,

  // ---- player
  startSpeed: 46,
  maxSpeed: 104,
  speedGainPerSec: 0.42,      // passive ramp-up
  boostSpeed: 34,
  boostDrain: 0.55,           // meter per second while boosting
  boostGainDrift: 0.16,       // per second of drifting
  boostGainCell: 0.045,

  steerAccel: 235,
  steerAccelAir: 150,
  lateralDrag: 7.2,
  lateralMax: 30,
  centrifugal: 38,            // outward push in corners (k * speed * this)

  gravity: 78,
  jumpVel: 25,
  rampVel: 26,
  airSpinRate: 5.6,           // rad/s trick spin
  slideTime: 0.62,

  driftGrip: 1.55,            // steering authority while drifting
  driftSlipAngle: 0.5,
  driftMinTime: 0.28,

  hullRadius: 0.95,
  hitInvuln: 1.35,

  // ---- camera
  camDist: 9.6,
  camHeight: 4.15,
  camLook: 26,
  fovBase: 74,
  fovBoost: 96,

  // ---- scoring
  scoreDist: 1.0,
  scoreDrift: 26,             // per second while drifting
  scoreAir: 40,
  scoreGrind: 30,
  scoreCell: 12,
  nearMissBonus: 60,

  // ---- world
  fogDensity: 0.0042,
  genAhead: 420,
  pruneBehind: 260,
};
