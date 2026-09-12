/**
 * Desert succulent & cactus parameters and species presets.
 *
 * A desert plant is built around a welded base disc from which the primary
 * organs rise: ribbed columns (saguaro, organ pipe, barrel, cholla), flat
 * cladode pads (prickly pear) or thick rosette leaves (agave, aloe, sotol).
 * Secondary organs – arms off a column, daughter pads off a pad, offsets –
 * are welded through windows exactly as grasses and trees do, so every plant
 * is one closed genus-0 quad manifold.
 *
 * Lengths are metres, angles degrees.
 */

export type SucculentForm = 'columnar' | 'barrel' | 'organPipe' | 'pricklyPear' | 'cholla' | 'rosette' | 'rosetteTree' | 'whips';

export const FORM_NAMES: Record<SucculentForm, string> = {
  columnar: 'Columnar cactus',
  barrel: 'Barrel cactus',
  organPipe: 'Organ-pipe / multi-column',
  pricklyPear: 'Prickly pear (pads)',
  cholla: 'Cholla (jointed cylinders)',
  rosette: 'Rosette succulent',
  rosetteTree: 'Rosette tree (trunk + crown)',
  whips: 'Whip canes (ocotillo)',
};

export interface SucculentParams {
  // ---- Habit ----
  form: SucculentForm;

  // ---- Base (plinth that sits on the ground) ----
  /** Radius of the basal disc at ground level. */
  baseRadius: number;
  /** Height of the low dome of the base above the soil. */
  baseHeight: number;
  /** How far the base is sunk into the soil. */
  baseSink: number;
  /** Dome profile exponent: 2 = rounded, higher = flatter top. */
  baseProfile: number;
  /** -1 = ring at rim, 0 = even, 1 = crowded at centre (for rosettes / organ pipe clumps). */
  centreBias: number;

  // ---- Column habit (saguaro, barrel, organ-pipe, whips, cholla) ----
  /** Primary columns / canes rising from the base. */
  columns: number;
  columnHeight: number;
  columnHeightV: number;
  columnRadius: number;
  columnRadiusV: number;
  /** Tilt from vertical at the base, degrees (± columnLeanV). */
  columnLean: number;
  columnLeanV: number;
  /** Bend along the column, degrees. */
  columnCurve: number;
  /** Number of vertical ribs (0 = smooth). Even, 6..32. */
  ribs: number;
  /** Rib amplitude as a fraction of the local radius (0..0.35). */
  ribDepth: number;
  /** 0 = sinusoidal ribs, 1 = sharp V-ribs. */
  ribSharpness: number;
  /** Twist of the ribs along the column, degrees over the full height. */
  ribTwist: number;
  /** Tubercles on the ribs (cholla): small diamond bumps between ribs. */
  tubercles: number;

  // ---- Arms (side branches off a column) ----
  /** Arms per column (saguaro / cardon). 0 = none. */
  arms: number;
  /** Fraction of the column height where arms may appear (0 = base, 1 = tip). */
  armZone: [number, number];
  /** Arm length as a fraction of the parent column height. */
  armLength: number;
  armLengthV: number;
  armRadius: number;
  /** Emergence angle from the parent surface, degrees. */
  armAngle: number;
  armAngleV: number;
  armCurve: number;

  // ---- Pads (opuntia) / joints (cholla) ----
  /** Recursion depth for pads/joints (1 = single pad/joint, 2–4 = branching). */
  padLevels: number;
  /** Maximum daughter pads per parent pad. */
  padBranches: number;
  padLength: number;
  padLengthV: number;
  padWidth: number;
  padWidthV: number;
  /** Thickness as a fraction of the width (prickly pear ~0.06, cholla ~0.85). */
  padThickness: number;
  padTaper: number;
  /** Notch / constriction at the attachment, 0..1. */
  padNotch: number;
  padAngle: number;
  padAngleV: number;
  padDroop: number;

  // ---- Rosette leaves (agave, aloe, sotol) ----
  leaves: number;
  leafLength: number;
  leafLengthV: number;
  leafWidth: number;
  leafWidthV: number;
  /** Base thickness as a fraction of leaf width. */
  leafThickness: number;
  /** 0 = narrow strap, 1 = widest at the tip (agave). */
  leafWiden: number;
  /** Taper exponent to the tip (0.2..1.5). */
  leafTaper: number;
  /** Keel / cup of the leaf (0 flat, 1 deep V). */
  leafKeel: number;
  /** Marginal teeth prominence (0..1). */
  leafTeeth: number;
  /** Tooth spacing relative to leaf length (0.04..0.15). */
  leafToothStep: number;
  /** Terminal spine length as a fraction of leaf length. */
  spineLength: number;
  /** Spine sharpness / flare at the tip. */
  spineWidth: number;
  /** Tilt of the leaf from the horizontal, degrees. */
  leafLean: number;
  leafLeanV: number;
  /** Droop / arch from base to tip, degrees. */
  leafDroop: number;
  leafDroopV: number;
  /** Twist along the leaf, degrees. */
  leafTwist: number;

  // ---- Flowering stalk (agave quiote, sotol) ----
  hasStalk: boolean;
  stalkHeight: number;
  stalkRadius: number;
  stalkLean: number;

  // ---- Mesh resolution ----
  /** Vertices around a column / culm (must fit the ribs: multiple of 2, >= ribs if ribs>0). */
  radialSegments: number;
  /** Rings along a column/pad/leaf (excluding the collar). */
  heightSegments: number;
  /** Vertices around a pad (4,6,8). */
  padSides: number;
  /** Vertices around a leaf (4,6,8). */
  leafSides: number;
  /** Rings along a leaf. */
  leafSegments: number;
  /** Rings along a pad. */
  padSegments: number;
  /** Intermediate loops between a window and the first ring of the organ. */
  collarRings: number;
}

export const DEFAULT_SUCCULENT: SucculentParams = {
  form: 'columnar',
  baseRadius: 0.18,
  baseHeight: 0.02,
  baseSink: 0.02,
  baseProfile: 2.5,
  centreBias: 0,

  columns: 1,
  columnHeight: 4.0,
  columnHeightV: 0.12,
  columnRadius: 0.14,
  columnRadiusV: 0.12,
  columnLean: 2,
  columnLeanV: 1,
  columnCurve: 2,
  ribs: 18,
  ribDepth: 0.14,
  ribSharpness: 0.35,
  ribTwist: 0,
  tubercles: 0,

  arms: 0,
  armZone: [0.35, 0.7],
  armLength: 0.45,
  armLengthV: 0.2,
  armRadius: 0.7,
  armAngle: 38,
  armAngleV: 8,
  armCurve: 6,

  padLevels: 2,
  padBranches: 2,
  padLength: 0.28,
  padLengthV: 0.12,
  padWidth: 0.18,
  padWidthV: 0.1,
  padThickness: 0.06,
  padTaper: 0.5,
  padNotch: 0.35,
  padAngle: 28,
  padAngleV: 12,
  padDroop: 5,

  leaves: 28,
  leafLength: 0.9,
  leafLengthV: 0.2,
  leafWidth: 0.14,
  leafWidthV: 0.15,
  leafThickness: 0.18,
  leafWiden: 0.55,
  leafTaper: 0.6,
  leafKeel: 0.35,
  leafTeeth: 0.0,
  leafToothStep: 0.08,
  spineLength: 0.035,
  spineWidth: 0.45,
  leafLean: 46,
  leafLeanV: 12,
  leafDroop: 18,
  leafDroopV: 10,
  leafTwist: 6,

  hasStalk: false,
  stalkHeight: 3,
  stalkRadius: 0.04,
  stalkLean: 0,

  radialSegments: 24,
  heightSegments: 18,
  collarRings: 1,
  padSides: 8,
  leafSides: 6,
  leafSegments: 9,
  padSegments: 7,
};

/** Height of a succulent (m) – for library metadata & framing. */
export function succulentHeight(g: SucculentParams): number {
  if (g.form === 'rosette' || g.form === 'rosetteTree') {
    const base = Math.max(0, g.baseHeight - g.baseSink);
    const leafTop = g.leafLength * (1 + g.leafLengthV * 0.5) * 0.92 + base;
    if (g.form === 'rosetteTree') {
      const trunk = g.columnHeight * (1 + g.columnHeightV * 0.5);
      return Math.max(leafTop, trunk + 0.5);
    }
    if (g.hasStalk) return Math.max(leafTop, g.stalkHeight);
    return Math.max(0.12, leafTop);
  }
  if (g.form === 'pricklyPear' || g.form === 'cholla') {
    // Pads stack roughly columnHeight tall but spread.
    return Math.max(0.2, g.columnHeight * 0.9, g.padLength * (1 + (g.padLevels - 1) * 0.55));
  }
  // columnar / barrel / organPipe / whips
  const colTop = g.columnHeight * (1 + g.columnHeightV * 0.5);
  const armTop = g.arms > 0 ? colTop * (g.armZone[1] + g.armLength * 0.6) : 0;
  return Math.max(0.25, colTop, armTop);
}

export function succulentHabit(g: SucculentParams): string {
  switch (g.form) {
    case 'columnar': return g.arms > 0 ? 'columnar-armed' : 'columnar';
    case 'barrel': return 'barrel';
    case 'organPipe': return 'multi-column';
    case 'pricklyPear': return 'pad cactus';
    case 'cholla': return 'jointed cactus';
    case 'rosette': return 'rosette';
    case 'rosetteTree': return 'rosette tree';
    case 'whips': return 'whip canes';
  }
}

export const SUCCULENT_PRESETS: { name: string; succulent: Partial<SucculentParams> }[] = [
  // ---- Columnar giants ---------------------------------------------------
  {
    name: 'Saguaro',
    succulent: {
      form: 'columnar',
      baseRadius: 0.22,
      baseHeight: 0.04,
      baseSink: 0.02,
      baseProfile: 2.5,
      columns: 1,
      columnHeight: 9.0,
      columnHeightV: 0.12,
      columnRadius: 0.22,
      columnRadiusV: 0.08,
      columnLean: 1,
      columnLeanV: 0.8,
      columnCurve: 1.5,
      ribs: 20,
      ribDepth: 0.11,
      ribSharpness: 0.45,
      ribTwist: 6,
      tubercles: 0,
      arms: 6,
      armZone: [0.28, 0.62],
      armLength: 0.42,
      armLengthV: 0.18,
      armRadius: 0.62,
      armAngle: 42,
      armAngleV: 6,
      armCurve: 22,
      radialSegments: 28,
      heightSegments: 28,
      collarRings: 1,
    },
  },
  {
    name: 'Cardón',
    succulent: {
      form: 'columnar',
      baseRadius: 0.28,
      baseHeight: 0.05,
      baseSink: 0.02,
      columns: 1,
      columnHeight: 11,
      columnHeightV: 0.14,
      columnRadius: 0.28,
      columnRadiusV: 0.06,
      columnLean: 1.5,
      columnLeanV: 1,
      columnCurve: 2,
      ribs: 22,
      ribDepth: 0.12,
      ribSharpness: 0.4,
      ribTwist: 4,
      arms: 9,
      armZone: [0.22, 0.72],
      armLength: 0.52,
      armLengthV: 0.2,
      armRadius: 0.58,
      armAngle: 38,
      armAngleV: 8,
      armCurve: 18,
      radialSegments: 28,
      heightSegments: 26,
    },
  },
  {
    name: 'Barrel Cactus',
    succulent: {
      form: 'barrel',
      baseRadius: 0.26,
      baseHeight: 0.02,
      baseSink: 0.015,
      columns: 1,
      columnHeight: 1.15,
      columnHeightV: 0.08,
      columnRadius: 0.31,
      columnRadiusV: 0.02,
      columnLean: 0,
      columnLeanV: 2,
      columnCurve: 0,
      ribs: 18,
      ribDepth: 0.22,
      ribSharpness: 0.35,
      ribTwist: 0,
      arms: 0,
      radialSegments: 24,
      heightSegments: 18,
    },
  },
  {
    name: 'Old Man Cactus',
    succulent: {
      form: 'columnar',
      baseRadius: 0.14,
      baseHeight: 0.02,
      baseSink: 0.015,
      columns: 1,
      columnHeight: 2.2,
      columnHeightV: 0.1,
      columnRadius: 0.13,
      columnRadiusV: 0.06,
      ribs: 26,
      ribDepth: 0.08,
      ribSharpness: 0.5,
      columnLean: 2,
      columnLeanV: 2,
      columnCurve: 3,
      arms: 0,
      radialSegments: 28,
      heightSegments: 18,
    },
  },
  {
    name: 'Organ Pipe Cactus',
    succulent: {
      form: 'organPipe',
      baseRadius: 0.42,
      baseHeight: 0.03,
      baseSink: 0.02,
      baseProfile: 2.2,
      centreBias: -0.35,
      columns: 16,
      columnHeight: 4.6,
      columnHeightV: 0.18,
      columnRadius: 0.085,
      columnRadiusV: 0.16,
      columnLean: 5,
      columnLeanV: 6,
      columnCurve: 8,
      ribs: 14,
      ribDepth: 0.13,
      ribSharpness: 0.4,
      ribTwist: 0,
      arms: 0,
      radialSegments: 18,
      heightSegments: 18,
    },
  },

  // ---- Pads & joints -----------------------------------------------------
  {
    name: 'Prickly Pear',
    succulent: {
      form: 'pricklyPear',
      baseRadius: 0.18,
      baseHeight: 0.02,
      baseSink: 0.015,
      columns: 1,
      columnHeight: 1.2,
      columnHeightV: 0.1,
      columnRadius: 0.09,
      columnRadiusV: 0.1,
      ribs: 0,
      padLevels: 3,
      padBranches: 1,
      padLength: 0.32,
      padLengthV: 0.14,
      padWidth: 0.19,
      padWidthV: 0.12,
      padThickness: 0.055,
      padTaper: 0.45,
      padNotch: 0.4,
      padAngle: 22,
      padAngleV: 16,
      padDroop: 8,
      radialSegments: 16,
      padSides: 8,
      padSegments: 8,
      heightSegments: 10,
      collarRings: 1,
    },
  },
  {
    name: 'Beavertail Prickly Pear',
    succulent: {
      form: 'pricklyPear',
      baseRadius: 0.12,
      baseHeight: 0.015,
      baseSink: 0.012,
      columns: 1,
      columnHeight: 0.6,
      columnHeightV: 0.1,
      padLevels: 3,
      padBranches: 1,
      padLength: 0.16,
      padLengthV: 0.12,
      padWidth: 0.12,
      padWidthV: 0.1,
      padThickness: 0.08,
      padAngle: 26,
      padAngleV: 14,
      padSides: 8,
      radialSegments: 14,
    },
  },
  {
    name: 'Cholla',
    succulent: {
      form: 'cholla',
      baseRadius: 0.16,
      baseHeight: 0.02,
      baseSink: 0.015,
      columns: 1,
      columnHeight: 1.5,
      columnHeightV: 0.12,
      columnRadius: 0.055,
      columnRadiusV: 0.08,
      ribs: 8,
      ribDepth: 0.08,
      ribSharpness: 0.6,
      tubercles: 0.85,
      padLevels: 3,
      padBranches: 1,
      padLength: 0.24,
      padLengthV: 0.16,
      padWidth: 0.055,
      padWidthV: 0.08,
      padThickness: 0.9,
      padNotch: 0.35,
      padAngle: 34,
      padAngleV: 18,
      padDroop: 6,
      radialSegments: 16,
      heightSegments: 12,
      padSegments: 6,
      padSides: 8,
    },
  },
  {
    name: 'Bunny Ears',
    succulent: {
      form: 'pricklyPear',
      baseRadius: 0.13,
      baseHeight: 0.015,
      baseSink: 0.012,
      padLevels: 3,
      padBranches: 2,
      padLength: 0.16,
      padLengthV: 0.12,
      padWidth: 0.09,
      padWidthV: 0.08,
      padThickness: 0.09,
      padAngle: 30,
      radialSegments: 14,
    },
  },

  // ---- Rosette succulents ------------------------------------------------
  {
    name: 'Blue Agave',
    succulent: {
      form: 'rosette',
      baseRadius: 0.34,
      baseHeight: 0.08,
      baseSink: 0.02,
      baseProfile: 2.2,
      centreBias: 0.35,
      leaves: 42,
      leafLength: 0.95,
      leafLengthV: 0.14,
      leafWidth: 0.16,
      leafWidthV: 0.12,
      leafThickness: 0.16,
      leafWiden: 0.62,
      leafTaper: 0.7,
      leafKeel: 0.45,
      leafTeeth: 0.85,
      leafToothStep: 0.065,
      spineLength: 0.04,
      spineWidth: 0.35,
      leafLean: 52,
      leafLeanV: 10,
      leafDroop: 12,
      leafDroopV: 8,
      leafTwist: 8,
      leafSides: 8,
      leafSegments: 10,
      radialSegments: 18,
      heightSegments: 10,
    },
  },
  {
    name: 'Century Plant',
    succulent: {
      form: 'rosette',
      baseRadius: 0.38,
      baseHeight: 0.06,
      baseSink: 0.015,
      leaves: 36,
      leafLength: 1.15,
      leafLengthV: 0.12,
      leafWidth: 0.18,
      leafWidthV: 0.1,
      leafThickness: 0.14,
      leafKeel: 0.4,
      leafTeeth: 0.6,
      leafLean: 48,
      leafLeanV: 10,
      leafTwist: 6,
      leafSides: 6,
    },
  },
  {
    name: 'Aloe Tree',
    succulent: {
      form: 'rosetteTree',
      baseRadius: 0.22,
      baseHeight: 0.03,
      baseSink: 0.02,
      columns: 1,
      columnHeight: 4.2,
      columnHeightV: 0.12,
      columnRadius: 0.14,
      columnRadiusV: 0.06,
      columnLean: 2,
      columnLeanV: 2,
      columnCurve: 4,
      ribs: 0,
      arms: 3,
      armZone: [0.42, 0.68],
      armLength: 0.55,
      armLengthV: 0.12,
      armRadius: 0.75,
      armAngle: 28,
      leaves: 12,
      leafLength: 0.48,
      leafLengthV: 0.12,
      leafWidth: 0.085,
      leafThickness: 0.22,
      leafKeel: 0.38,
      leafTeeth: 0.55,
      leafLean: 58,
      leafLeanV: 12,
      leafDroop: 36,
      leafTwist: 10,
      radialSegments: 18,
      heightSegments: 14,
      leafSides: 6,
    },
  },
  {
    name: 'Parry’s Agave',
    succulent: {
      form: 'rosette',
      baseRadius: 0.24,
      baseHeight: 0.05,
      baseSink: 0.015,
      leaves: 68,
      leafLength: 0.48,
      leafLengthV: 0.12,
      leafWidth: 0.09,
      leafWidthV: 0.1,
      leafThickness: 0.22,
      leafKeel: 0.5,
      leafTeeth: 0.7,
      leafLean: 56,
      leafTwist: 5,
      leafSides: 6,
      leafSegments: 8,
    },
  },
  {
    name: 'Sotol',
    succulent: {
      form: 'rosette',
      baseRadius: 0.28,
      baseHeight: 0.08,
      baseSink: 0.01,
      centreBias: -0.2,
      leaves: 140,
      leafLength: 0.85,
      leafLengthV: 0.18,
      leafWidth: 0.016,
      leafWidthV: 0.08,
      leafThickness: 0.14,
      leafWiden: 0.35,
      leafTaper: 0.55,
      leafKeel: 0.08,
      leafTeeth: 0.82,
      spineLength: 0.008,
      leafLean: 48,
      leafLeanV: 14,
      leafDroop: 68,
      leafDroopV: 18,
      leafTwist: 18,
      radialSegments: 16,
      leafSides: 4,
      leafSegments: 8,
    },
  },
  {
    name: 'Dasylirion',
    succulent: {
      form: 'rosette',
      baseRadius: 0.3,
      baseHeight: 0.14,
      baseSink: 0.01,
      leaves: 160,
      leafLength: 0.95,
      leafLengthV: 0.14,
      leafWidth: 0.012,
      leafWidthV: 0.08,
      leafThickness: 0.18,
      leafKeel: 0.12,
      leafTeeth: 0.0,
      leafLean: 42,
      leafDroop: 42,
      leafTwist: 22,
      leafSides: 4,
      leafSegments: 9,
    },
  },
  {
    name: 'Hedgehog Cactus',
    succulent: {
      form: 'barrel',
      baseRadius: 0.18,
      baseHeight: 0.015,
      baseSink: 0.012,
      columns: 5,
      columnHeight: 0.28,
      columnHeightV: 0.16,
      columnRadius: 0.075,
      columnRadiusV: 0.14,
      ribs: 12,
      ribDepth: 0.18,
      columnLean: 6,
      columnLeanV: 10,
      radialSegments: 16,
      heightSegments: 10,
    },
  },
  {
    name: 'Ocotillo',
    succulent: {
      form: 'whips',
      baseRadius: 0.18,
      baseHeight: 0.02,
      baseSink: 0.02,
      columns: 18,
      columnHeight: 4.2,
      columnHeightV: 0.2,
      columnRadius: 0.021,
      columnRadiusV: 0.2,
      columnLean: 6,
      columnLeanV: 8,
      columnCurve: 14,
      ribs: 0,
      leaves: 0,
      radialSegments: 10,
      heightSegments: 16,
    },
  },
];

export const SUCCULENT_GROUPS: { label: string; names: string[] }[] = [
  { label: 'Desert · columnar', names: ['Saguaro', 'Cardón', 'Barrel Cactus', 'Old Man Cactus', 'Hedgehog Cactus', 'Organ Pipe Cactus'] },
  { label: 'Desert · pads & joints', names: ['Prickly Pear', 'Beavertail Prickly Pear', 'Bunny Ears', 'Cholla'] },
  { label: 'Desert · rosette', names: ['Blue Agave', 'Century Plant', 'Parry’s Agave', 'Sotol', 'Dasylirion'] },
  { label: 'Desert · trees & whips', names: ['Aloe Tree', 'Ocotillo'] },
];
