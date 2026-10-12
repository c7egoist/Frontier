// Tunable constants for FRONTIER // ZIPPER CIRCUIT. Units are metres and seconds.

export const CFG = {
  LAPS: 3,

  // Road layout: five lanes, lane centres at (i - 2) * LANE_W.
  LANES: 5,
  LANE_W: 3.4,
  ROAD_HALF_W: 8.5,
  WALL_X: 7.2,          // car-centre clamp (side walls)
  CAR_HALF_L: 2.2,
  CAR_HALF_W: 1.0,
  CAR_H: 1.25,

  // Vehicle dynamics (arcade, rail-based)
  GRAVITY: 14,          // gameplay gravity for airtime (m/s^2)
  G_REAL: 9.8,          // used for slope acceleration
  ACCEL: 27,            // m/s^2 at standstill
  BRAKE: 48,
  COAST: 2.5,
  DRAG: 0.00035,
  V_MAX: 80,            // ~288 km/h
  V_BOOST: 104,         // pad / boost top speed
  BOOST_ACCEL: 20,
  GRIP: 7.5,            // lateral grip (1/s)
  DRIFT_GRIP: 2.4,
  CENTRI: 0.75,         // fraction of centrifugal force felt
  LAT_BASE: 15,
  LAT_SPEED: 0.12,      // extra lateral speed per m/s of forward speed
  ENERGY_MAX: 100,
  ENERGY_BOOST_DRAIN: 24,
  ENERGY_PAD: 28,
  ENERGY_ZIP: 10,
  PAD_TIME: 1.8,

  // Zipper
  ZIP_ROW_SPACING: 12,
  ZIP_HORIZON: 170,     // rows are drawn this far ahead of the lead car
  ZIP_RAISE_SPEED: 9,

  // Train crossing
  TRAIN_CARS: 6,
  TRAIN_CAR_L: 13,
  TRAIN_SPEED: 26,
  TRAIN_WARN: 2.4,
  TRAIN_FIRST: 14,
  TRAIN_GAP_MIN: 13,
  TRAIN_GAP_MAX: 21,

  // Traffic
  TRAFFIC_COUNT: 16,

  // Race
  COUNTDOWN: 3,
  FIELD_TEAM_A: 4,      // player + 3 teammates
  FIELD_TEAM_B: 4,      // rivals
  GRID_GAP: 12,
};

export const DIFFICULTY = {
  rookie: { label: 'Rookie', aiSpeed: 0.93, aiSkill: 0.6 },
  pro: { label: 'Pro', aiSpeed: 0.98, aiSkill: 0.85 },
  elite: { label: 'Elite', aiSpeed: 1.02, aiSkill: 1.0 },
};

export const TEAMS = {
  A: { name: 'FRONTIER', colors: [0x33e6ff, 0x52ffa8, 0x8dffdc, 0x2ad0ff], accent: 0x7ff9ff },
  B: { name: 'OMEGA', colors: [0xff3fa4, 0xff7a2e, 0xffd23f, 0xb36bff], accent: 0xff7ad0 },
};
