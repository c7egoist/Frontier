/**
 * Succulent & cactus parameters and species presets.
 *
 * A desert plant is described botanically by habit: a ribbed columnar or
 * barrel stem (optionally with arms), a cluster of pads, or a rosette of
 * thick leaves — all bearing areoles with spines, marginal teeth or fruits.
 * Lengths are metres, angles degrees.
 */

export type SucculentHabit = 'columnar' | 'barrel' | 'pads' | 'rosette';

export const HABIT_NAMES: Record<SucculentHabit, string> = {
  columnar: 'Columnar cactus',
  barrel: 'Barrel cactus',
  pads: 'Prickly pear (pads)',
  rosette: 'Rosette succulent',
};

export interface SucculentParams {
  habit: SucculentHabit;

  // ---- Base ---------------------------------------------------------------
  /** Radius of the basal mound at ground level. */
  baseRadius: number;
  /** Height of the basal dome above the soil. */
  baseHeight: number;
  /** How far the base is sunk into the soil. */
  baseSink: number;
  /** Dome profile exponent: 2 = rounded, higher = flat top. */
  baseProfile: number;

  // ---- Stems (columnar & barrel) -------------------------------------------
  /** Columns rising from the base (1 = single trunk / barrel). */
  stems: number;
  stemHeight: number;
  /** ± fraction. */
  stemHeightV: number;
  stemRadius: number;
  stemRadiusV: number;
  /** Taper from base to tip (0 = none, 1 = to a point). */
  stemTaper: number;
  /** Tilt from the vertical, degrees. */
  stemLean: number;
  stemLeanV: number;
  /** Bend along the stem, degrees. */
  stemCurve: number;
  /** Vertical ribs (0 = smooth). */
  ribs: number;
  /** Rib amplitude as a fraction of the radius. */
  ribDepth: number;
  /** 0 = sine ribs, 1 = narrow grooves between broad ribs. */
  ribSharp: number;
  /** 0 = column, 1 = globe (barrel profile). */
  barrel: number;

  // ---- Arms (columnar branches, cholla joints) ------------------------------
  /** Arms on the main stem (columnar) / children per segment (branching). */
  arms: number;
  /** Attach zone along the stem, fractions of its length. */
  armAttachMin: number;
  armAttachMax: number;
  armLength: number;
  armLengthV: number;
  /** Arm radius relative to the stem radius. */
  armRadius: number;
  /** Upturn of the arm towards the vertical, degrees. */
  armCurve: number;
  /** Ribs on arms (0 = inherit from the stem). */
  armRibs: number;
  /** Recursion depth of the branching (0 = arms are terminal, 2 = cholla). */
  branching: number;

  // ---- Pads (opuntia) -------------------------------------------------------
  /** Total pads on the plant. */
  pads: number;
  padLength: number;
  padLengthV: number;
  padWidth: number;
  /** Pad thickness as a fraction of its width. */
  padThickness: number;
  /** Bend along the pad, degrees. */
  padCurve: number;
  /** Angle between a child pad and its parent's face, degrees. */
  padAngle: number;
  /** Children per pad. */
  padBranch: number;
  /** Maximum recursion depth from the basal pads. */
  padDepth: number;

  // ---- Leaves (rosette) -----------------------------------------------------
  leaves: number;
  leafLength: number;
  leafLengthV: number;
  leafWidth: number;
  /** Leaf thickness as a fraction of its width. */
  leafThickness: number;
  /** V-fold along the midrib (0 = flat, 1 = deeply channelled). */
  leafKeel: number;
  /** Arch from base to tip, degrees. */
  leafCurve: number;
  leafCurveV: number;
  /** Tilt from the vertical of the outer leaves, degrees. */
  leafLean: number;
  /** Twist along the leaf, degrees. */
  leafTwist: number;
  leafTwistV: number;
  /** Marginal teeth per leaf side (0 = smooth). */
  leafTeeth: number;
  /** Tooth length in metres. */
  leafToothSize: number;
  /** Terminal spine length (0 = none). */
  terminalSpine: number;

  // ---- Areoles & spines -----------------------------------------------------
  /** Distance between areoles along a rib / pad row / leaf margin. */
  areoleSpacing: number;
  /** Spines per areole (1 = single, more = diagonal cluster). */
  spinesPerAreole: number;
  spineLength: number;
  spineLengthV: number;
  spineRadius: number;
  /** Angle between a spine and the parent axis, degrees (90 = perpendicular). */
  spineAngle: number;
  /** Bend along the spine, degrees (hooked centrals). */
  spineCurve: number;
  /** Length multiplier of the central spine (0 = all radials). */
  centralSpine: number;
  /** Fraction of the stem (from its base) that carries spines. */
  spineZoneMin: number;
  spineZoneMax: number;
  /** Areole felt mound height as a fraction of the spine length. */
  areoleMound: number;

  // ---- Fruits ---------------------------------------------------------------
  /** Fruits on the plant (0 = none). */
  fruits: number;
  fruitRadius: number;
  fruitLength: number;

  // ---- Mesh resolution ------------------------------------------------------
  /** Vertices around a stem (rounded to a multiple of the rib count). */
  stemSides: number;
  /** Rings along a stem. */
  stemSegments: number;
  /** Vertices around a pad. */
  padSides: number;
  /** Rings along a pad. */
  padSegments: number;
  /** Vertices around a leaf: 6 keeled, 8 keeled and wide. */
  leafSides: number;
  /** Rings along a leaf. */
  leafSegments: number;
  /** Rings along a spine or tooth. */
  spineSegments: number;
  /** Intermediate loops between a window and the first ring of the organ. */
  collarRings: number;
}

export const DEFAULT_SUCCULENT: SucculentParams = {
  habit: 'columnar',

  baseRadius: 0.4,
  baseHeight: 0.12,
  baseSink: 0.03,
  baseProfile: 2.5,

  stems: 1,
  stemHeight: 6.0,
  stemHeightV: 0.15,
  stemRadius: 0.22,
  stemRadiusV: 0.1,
  stemTaper: 0.12,
  stemLean: 2,
  stemLeanV: 2,
  stemCurve: 4,
  ribs: 14,
  ribDepth: 0.1,
  ribSharp: 0.5,
  barrel: 0,

  arms: 3,
  armAttachMin: 0.35,
  armAttachMax: 0.7,
  armLength: 1.8,
  armLengthV: 0.3,
  armRadius: 0.55,
  armCurve: 75,
  armRibs: 0,
  branching: 0,

  pads: 14,
  padLength: 0.35,
  padLengthV: 0.2,
  padWidth: 0.22,
  padThickness: 0.14,
  padCurve: 6,
  padAngle: 35,
  padBranch: 2,
  padDepth: 3,

  leaves: 30,
  leafLength: 1.2,
  leafLengthV: 0.2,
  leafWidth: 0.2,
  leafThickness: 0.3,
  leafKeel: 0.6,
  leafCurve: 45,
  leafCurveV: 15,
  leafLean: 45,
  leafTwist: 20,
  leafTwistV: 20,
  leafTeeth: 14,
  leafToothSize: 0.008,
  terminalSpine: 0.035,

  areoleSpacing: 0.03,
  spinesPerAreole: 2,
  spineLength: 0.02,
  spineLengthV: 0.3,
  spineRadius: 0.0009,
  spineAngle: 72,
  spineCurve: 8,
  centralSpine: 1.4,
  spineZoneMin: 0.45,
  spineZoneMax: 1,
  areoleMound: 0.25,

  fruits: 0,
  fruitRadius: 0.03,
  fruitLength: 0.06,

  stemSides: 56,
  stemSegments: 36,
  padSides: 10,
  padSegments: 12,
  leafSides: 8,
  leafSegments: 14,
  spineSegments: 2,
  collarRings: 1,
};

/** Approximate height of a desert plant (m), for library metadata and framing. */
export function succulentHeight(g: SucculentParams): number {
  const base = Math.max(0, g.baseHeight - g.baseSink);
  switch (g.habit) {
    case 'columnar':
      return Math.max(0.1, base + g.stemHeight * (1 + g.stemHeightV * 0.5));
    case 'barrel':
      return Math.max(0.1, base + g.stemHeight * (1 + g.stemHeightV * 0.5));
    case 'pads':
      return Math.max(0.1, base + g.padLength * (1 + g.padDepth * 0.55));
    case 'rosette':
      return Math.max(0.05, base + g.leafLength * 0.75);
  }
}

/** Habit word used in the species metadata. */
export function succulentHabit(g: SucculentParams): string {
  switch (g.habit) {
    case 'columnar':
      return g.stems > 1 ? `${g.stems}-stemmed columnar` : g.arms > 0 ? 'candelabra' : 'columnar';
    case 'barrel':
      return 'globular';
    case 'pads':
      return 'jointed pads';
    case 'rosette':
      return 'rosette';
  }
}

function columnar(ribs: number, stemSides: number): Partial<SucculentParams> {
  return { habit: 'columnar', ribs, stemSides };
}

/** Species presets. Values are typical field measurements of the species. */
export const SUCCULENT_PRESETS: { name: string; succulent: Partial<SucculentParams> }[] = [
  // ---- columnar cacti ---------------------------------------------------------
  {
    name: 'Saguaro',
    succulent: {
      ...columnar(14, 56),
      baseRadius: 0.45,
      baseHeight: 0.14,
      baseSink: 0.04,
      stems: 1,
      stemHeight: 7.0,
      stemHeightV: 0.18,
      stemRadius: 0.24,
      stemRadiusV: 0.08,
      stemTaper: 0.18,
      stemLean: 2,
      stemLeanV: 2,
      stemCurve: 5,
      ribDepth: 0.09,
      ribSharp: 0.55,
      arms: 3,
      armAttachMin: 0.35,
      armAttachMax: 0.68,
      armLength: 1.9,
      armLengthV: 0.35,
      armRadius: 0.55,
      armCurve: 78,
      areoleSpacing: 0.04,
      spinesPerAreole: 2,
      spineLength: 0.022,
      spineLengthV: 0.3,
      spineRadius: 0.001,
      spineAngle: 70,
      spineCurve: 6,
      centralSpine: 1.3,
      spineZoneMin: 0.5,
      spineZoneMax: 1,
      fruits: 5,
      fruitRadius: 0.032,
      fruitLength: 0.07,
      stemSegments: 40,
    },
  },
  {
    name: 'Organ Pipe',
    succulent: {
      ...columnar(12, 48),
      baseRadius: 0.65,
      baseHeight: 0.12,
      baseSink: 0.06,
      stems: 9,
      stemHeight: 3.6,
      stemHeightV: 0.25,
      stemRadius: 0.13,
      stemRadiusV: 0.15,
      stemTaper: 0.1,
      stemLean: 6,
      stemLeanV: 5,
      stemCurve: 8,
      ribDepth: 0.11,
      ribSharp: 0.5,
      arms: 0,
      areoleSpacing: 0.04,
      spinesPerAreole: 2,
      spineLength: 0.02,
      spineLengthV: 0.3,
      spineRadius: 0.0008,
      spineAngle: 75,
      spineCurve: 5,
      centralSpine: 1.2,
      spineZoneMin: 0.25,
      spineZoneMax: 1,
      fruits: 4,
      fruitRadius: 0.028,
      fruitLength: 0.06,
      stemSegments: 30,
    },
  },
  {
    name: 'Teddy Bear Cholla',
    succulent: {
      ...columnar(9, 36),
      baseRadius: 0.3,
      baseHeight: 0.1,
      baseSink: 0.03,
      stems: 1,
      stemHeight: 0.55,
      stemHeightV: 0.15,
      stemRadius: 0.09,
      stemRadiusV: 0.1,
      stemTaper: 0.05,
      stemLean: 3,
      stemLeanV: 3,
      stemCurve: 10,
      ribs: 9,
      ribDepth: 0.16,
      ribSharp: 0.4,
      arms: 4,
      armAttachMin: 0.45,
      armAttachMax: 0.95,
      armLength: 0.32,
      armLengthV: 0.3,
      armRadius: 0.7,
      armCurve: 22,
      armRibs: 8,
      branching: 2,
      areoleSpacing: 0.02,
      spinesPerAreole: 3,
      spineLength: 0.02,
      spineLengthV: 0.35,
      spineRadius: 0.0007,
      spineAngle: 65,
      spineCurve: 10,
      centralSpine: 1.1,
      spineZoneMin: 0,
      spineZoneMax: 1,
      areoleMound: 0.5,
      stemSegments: 16,
    },
  },

  // ---- barrels & prickly pears --------------------------------------------------
  {
    name: 'Golden Barrel',
    succulent: {
      habit: 'barrel',
      baseRadius: 0.42,
      baseHeight: 0.1,
      baseSink: 0.06,
      stems: 1,
      stemHeight: 0.75,
      stemHeightV: 0.12,
      stemRadius: 0.36,
      stemRadiusV: 0.06,
      ribs: 21,
      ribDepth: 0.1,
      ribSharp: 0.6,
      barrel: 1,
      arms: 0,
      areoleSpacing: 0.02,
      spinesPerAreole: 3,
      spineLength: 0.035,
      spineLengthV: 0.25,
      spineRadius: 0.0011,
      spineAngle: 68,
      spineCurve: 6,
      centralSpine: 1.6,
      spineZoneMin: 0.08,
      spineZoneMax: 0.99,
      areoleMound: 0.35,
      fruits: 8,
      fruitRadius: 0.016,
      fruitLength: 0.025,
      stemSides: 63,
      stemSegments: 30,
    },
  },
  {
    name: 'Fishhook Barrel',
    succulent: {
      habit: 'barrel',
      baseRadius: 0.5,
      baseHeight: 0.12,
      baseSink: 0.06,
      stems: 1,
      stemHeight: 1.1,
      stemHeightV: 0.15,
      stemRadius: 0.42,
      stemRadiusV: 0.08,
      stemLean: 4,
      stemLeanV: 3,
      stemCurve: 10,
      ribs: 18,
      ribDepth: 0.12,
      ribSharp: 0.55,
      barrel: 0.85,
      arms: 0,
      areoleSpacing: 0.026,
      spinesPerAreole: 3,
      spineLength: 0.045,
      spineLengthV: 0.3,
      spineRadius: 0.0014,
      spineAngle: 62,
      spineCurve: 55,
      centralSpine: 2.0,
      spineZoneMin: 0.05,
      spineZoneMax: 0.99,
      areoleMound: 0.3,
      fruits: 6,
      fruitRadius: 0.02,
      fruitLength: 0.035,
      stemSides: 54,
      stemSegments: 32,
    },
  },
  {
    name: "Bishop's Cap",
    succulent: {
      habit: 'barrel',
      baseRadius: 0.16,
      baseHeight: 0.05,
      baseSink: 0.02,
      stems: 1,
      stemHeight: 0.22,
      stemHeightV: 0.1,
      stemRadius: 0.13,
      stemRadiusV: 0.05,
      ribs: 5,
      ribDepth: 0.16,
      ribSharp: 0.35,
      barrel: 0.9,
      arms: 0,
      areoleSpacing: 0.02,
      spinesPerAreole: 0,
      spineZoneMin: 0,
      spineZoneMax: 0,
      areoleMound: 0.6,
      fruits: 3,
      fruitRadius: 0.012,
      fruitLength: 0.02,
      stemSides: 30,
      stemSegments: 18,
    },
  },
  {
    name: 'Prickly Pear',
    succulent: {
      habit: 'pads',
      baseRadius: 0.3,
      baseHeight: 0.1,
      baseSink: 0.04,
      pads: 16,
      padLength: 0.36,
      padLengthV: 0.2,
      padWidth: 0.23,
      padThickness: 0.13,
      padCurve: 5,
      padAngle: 32,
      padBranch: 2,
      padDepth: 3,
      areoleSpacing: 0.032,
      spinesPerAreole: 2,
      spineLength: 0.018,
      spineLengthV: 0.4,
      spineRadius: 0.0007,
      spineAngle: 75,
      spineCurve: 5,
      centralSpine: 1.5,
      spineZoneMin: 0,
      spineZoneMax: 1,
      areoleMound: 0.4,
      fruits: 7,
      fruitRadius: 0.026,
      fruitLength: 0.055,
      padSides: 10,
      padSegments: 12,
    },
  },
  {
    name: 'Bunny Ear',
    succulent: {
      habit: 'pads',
      baseRadius: 0.22,
      baseHeight: 0.08,
      baseSink: 0.03,
      pads: 13,
      padLength: 0.17,
      padLengthV: 0.2,
      padWidth: 0.11,
      padThickness: 0.16,
      padCurve: 4,
      padAngle: 30,
      padBranch: 2,
      padDepth: 3,
      areoleSpacing: 0.016,
      spinesPerAreole: 4,
      spineLength: 0.004,
      spineLengthV: 0.3,
      spineRadius: 0.0003,
      spineAngle: 80,
      spineCurve: 0,
      centralSpine: 0,
      spineZoneMin: 0,
      spineZoneMax: 1,
      areoleMound: 0.8,
      padSides: 10,
      padSegments: 10,
    },
  },

  // ---- rosettes -----------------------------------------------------------------
  {
    name: 'Century Plant',
    succulent: {
      habit: 'rosette',
      baseRadius: 0.35,
      baseHeight: 0.16,
      baseSink: 0.02,
      leaves: 28,
      leafLength: 1.5,
      leafLengthV: 0.2,
      leafWidth: 0.28,
      leafThickness: 0.28,
      leafKeel: 0.65,
      leafCurve: 42,
      leafCurveV: 14,
      leafLean: 48,
      leafTwist: 25,
      leafTwistV: 25,
      leafTeeth: 16,
      leafToothSize: 0.009,
      terminalSpine: 0.045,
      areoleSpacing: 0.05,
      leafSides: 8,
      leafSegments: 16,
    },
  },
  {
    name: 'Aloe Vera',
    succulent: {
      habit: 'rosette',
      baseRadius: 0.2,
      baseHeight: 0.06,
      baseSink: 0.04,
      leaves: 22,
      leafLength: 0.52,
      leafLengthV: 0.2,
      leafWidth: 0.085,
      leafThickness: 0.42,
      leafKeel: 0.45,
      leafCurve: 38,
      leafCurveV: 12,
      leafLean: 42,
      leafTwist: 15,
      leafTwistV: 20,
      leafTeeth: 12,
      leafToothSize: 0.004,
      terminalSpine: 0.012,
      areoleSpacing: 0.03,
      leafSides: 8,
      leafSegments: 12,
    },
  },
  {
    name: 'Echeveria',
    succulent: {
      habit: 'rosette',
      baseRadius: 0.09,
      baseHeight: 0.035,
      baseSink: 0.01,
      leaves: 42,
      leafLength: 0.095,
      leafLengthV: 0.18,
      leafWidth: 0.05,
      leafThickness: 0.5,
      leafKeel: 0.55,
      leafCurve: 46,
      leafCurveV: 12,
      leafLean: 46,
      leafTwist: 10,
      leafTwistV: 15,
      leafTeeth: 0,
      leafToothSize: 0,
      terminalSpine: 0.004,
      leafSides: 8,
      leafSegments: 10,
    },
  },
];

export const SUCCULENT_GROUPS: { label: string; names: string[] }[] = [
  { label: 'Cacti · columnar', names: ['Saguaro', 'Organ Pipe', 'Teddy Bear Cholla'] },
  { label: 'Cacti · barrels & pears', names: ['Golden Barrel', 'Fishhook Barrel', "Bishop's Cap", 'Prickly Pear', 'Bunny Ear'] },
  { label: 'Succulents · rosettes', names: ['Century Plant', 'Aloe Vera', 'Echeveria'] },
];
