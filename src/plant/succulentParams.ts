/**
 * Botanical parameters and presets for arid plants.
 *
 * The succulent mesher deliberately keeps the description in metres.  The
 * values below are field-scale starting points rather than arbitrary game
 * units: a saguaro is several metres tall, a barrel is roughly shoulder
 * height, and a hedgehog cactus is a hand-sized cushion.  The mesher adds the
 * species-specific organs (ribs, pads, areoles, teeth and spines) as welded
 * children of a parent surface.
 */

export type SucculentForm =
  | 'saguaro'
  | 'barrel'
  | 'pricklyPear'
  | 'cholla'
  | 'hedgehog'
  | 'agave'
  | 'yucca'
  | 'ocotillo'
  | 'desertSpoon'
  | 'aloe';

export type SucculentFamily = 'cacti' | 'succulents' | 'desertPerennials';

export interface SucculentParams {
  form: SucculentForm;
  family: SucculentFamily;
  /** Nominal height above the soil in metres, with a seeded variation. */
  height: number;
  heightV: number;
  /** Main body radius and resolution. */
  bodyRadius: number;
  bodyDepth: number;
  radialSegments: number;
  bodySegments: number;
  /** Longitudinal ribs / flutes on cylindrical cacti. */
  ribs: number;
  ribDepth: number;
  ribSharpness: number;
  /** Main stems and arms. */
  arms: number;
  armLength: number;
  armLengthV: number;
  armRadius: number;
  armHeight: number;
  armLean: number;
  /** Jointed or pad-bearing cacti. */
  joints: number;
  branches: number;
  pads: number;
  padWidth: number;
  padHeight: number;
  padThickness: number;
  padBranching: number;
  /** Rosette leaves. */
  leaves: number;
  leafLength: number;
  leafLengthV: number;
  leafWidth: number;
  leafThickness: number;
  leafLean: number;
  leafCurve: number;
  leafCurl: number;
  leafTaper: number;
  leafKeel: number;
  /** Areoles and defensive structures. */
  areoleRows: number;
  areolesPerRow: number;
  spineClusters: number;
  spineLength: number;
  spineLengthV: number;
  spineRadius: number;
  spineSpread: number;
  terminalSpine: boolean;
  marginalTeeth: number;
  toothLength: number;
  /** Ocotillo canes and small leaves. */
  canes: number;
  caneLength: number;
  caneRadius: number;
  caneLean: number;
  caneCurve: number;
  caneLeaves: number;
  /** Below-ground closure / presentation. */
  rootDepth: number;
  detail: number;
}

export const DEFAULT_SUCCULENT: SucculentParams = {
  form: 'saguaro',
  family: 'cacti',
  height: 5,
  heightV: 0.1,
  bodyRadius: 0.28,
  bodyDepth: 0.32,
  radialSegments: 24,
  bodySegments: 14,
  ribs: 16,
  ribDepth: 0.13,
  ribSharpness: 7,
  arms: 2,
  armLength: 2.1,
  armLengthV: 0.18,
  armRadius: 0.16,
  armHeight: 2.8,
  armLean: 0.08,
  joints: 0,
  branches: 0,
  pads: 0,
  padWidth: 0.35,
  padHeight: 0.48,
  padThickness: 0.08,
  padBranching: 0,
  leaves: 0,
  leafLength: 0.7,
  leafLengthV: 0.2,
  leafWidth: 0.08,
  leafThickness: 0.018,
  leafLean: 28,
  leafCurve: 20,
  leafCurl: 0.08,
  leafTaper: 0.68,
  leafKeel: 0.35,
  areoleRows: 10,
  areolesPerRow: 12,
  spineClusters: 3,
  spineLength: 0.045,
  spineLengthV: 0.22,
  spineRadius: 0.002,
  spineSpread: 0.7,
  terminalSpine: true,
  marginalTeeth: 0,
  toothLength: 0.018,
  canes: 0,
  caneLength: 2.5,
  caneRadius: 0.018,
  caneLean: 18,
  caneCurve: 18,
  caneLeaves: 5,
  rootDepth: 0.18,
  detail: 1,
};

export interface SucculentPreset {
  name: string;
  succulent: Partial<SucculentParams>;
}

/**
 * The roster uses the accepted botanical names in the brief.  The descriptive
 * comments are intentionally short: they are also useful when this list is
 * consumed by command-line tooling.
 */
export const SUCCULENT_PRESETS: SucculentPreset[] = [
  {
    name: 'Saguaro',
    succulent: {
      form: 'saguaro', family: 'cacti', height: 8.5, heightV: 0.16,
      bodyRadius: 0.34, radialSegments: 32, bodySegments: 22, ribs: 16,
      ribDepth: 0.17, ribSharpness: 9, arms: 2, armLength: 2.4,
      armLengthV: 0.2, armRadius: 0.16, armHeight: 3.8, areoleRows: 18,
      areolesPerRow: 16, spineClusters: 4, spineLength: 0.065, spineRadius: 0.0022,
      spineSpread: 0.75, rootDepth: 0.28, detail: 1,
    },
  },
  {
    name: 'Golden Barrel',
    succulent: {
      form: 'barrel', family: 'cacti', height: 0.9, heightV: 0.12,
      bodyRadius: 0.58, bodyDepth: 0.62, radialSegments: 32, bodySegments: 18,
      ribs: 20, ribDepth: 0.18, ribSharpness: 8, arms: 0, areoleRows: 7,
      areolesPerRow: 20, spineClusters: 5, spineLength: 0.055, spineRadius: 0.0018,
      spineSpread: 0.85, terminalSpine: false, rootDepth: 0.22, detail: 1,
    },
  },
  {
    name: 'Prickly Pear',
    succulent: {
      form: 'pricklyPear', family: 'cacti', height: 1.45, heightV: 0.15,
      bodyRadius: 0.2, bodyDepth: 0.24, radialSegments: 28, bodySegments: 7,
      ribs: 0, arms: 0, pads: 8, padWidth: 0.46, padHeight: 0.58,
      padThickness: 0.095, padBranching: 0.62, areoleRows: 4, areolesPerRow: 7,
      spineClusters: 3, spineLength: 0.038, spineRadius: 0.0012, spineSpread: 0.8,
      marginalTeeth: 0, rootDepth: 0.18, detail: 1,
    },
  },
  {
    name: 'Cholla',
    succulent: {
      form: 'cholla', family: 'cacti', height: 1.85, heightV: 0.2,
      bodyRadius: 0.095, bodyDepth: 0.11, radialSegments: 20, bodySegments: 8,
      ribs: 8, ribDepth: 0.08, ribSharpness: 5, joints: 9, branches: 2,
      arms: 0, areoleRows: 4, areolesPerRow: 8, spineClusters: 4,
      spineLength: 0.07, spineRadius: 0.0012, spineSpread: 0.95,
      rootDepth: 0.16, detail: 1,
    },
  },
  {
    name: 'Hedgehog Cactus',
    succulent: {
      form: 'hedgehog', family: 'cacti', height: 0.38, heightV: 0.12,
      bodyRadius: 0.24, bodyDepth: 0.25, radialSegments: 24, bodySegments: 9,
      ribs: 12, ribDepth: 0.15, ribSharpness: 7, arms: 2, armLength: 0.28,
      armRadius: 0.13, armHeight: 0.22, areoleRows: 4, areolesPerRow: 12,
      spineClusters: 6, spineLength: 0.035, spineRadius: 0.0014, spineSpread: 1,
      rootDepth: 0.12, detail: 1,
    },
  },
  {
    name: 'Blue Century Agave',
    succulent: {
      form: 'agave', family: 'succulents', height: 1.2, heightV: 0.12,
      bodyRadius: 0.19, bodyDepth: 0.22, radialSegments: 32, bodySegments: 5,
      leaves: 34, leafLength: 0.82, leafLengthV: 0.17, leafWidth: 0.14,
      leafThickness: 0.035, leafLean: 24, leafCurve: 42, leafCurl: 0.14,
      leafTaper: 0.62, leafKeel: 0.75, marginalTeeth: 5, toothLength: 0.024,
      terminalSpine: true, spineClusters: 0, areoleRows: 0, detail: 1,
      rootDepth: 0.16,
    },
  },
  {
    name: 'Mojave Yucca',
    succulent: {
      form: 'yucca', family: 'desertPerennials', height: 2.7, heightV: 0.18,
      bodyRadius: 0.22, bodyDepth: 0.25, radialSegments: 28, bodySegments: 8,
      leaves: 38, leafLength: 0.92, leafLengthV: 0.2, leafWidth: 0.075,
      leafThickness: 0.022, leafLean: 18, leafCurve: 52, leafCurl: 0.04,
      leafTaper: 0.74, leafKeel: 0.18, marginalTeeth: 0, toothLength: 0,
      terminalSpine: true, spineClusters: 0, canes: 0, rootDepth: 0.3, detail: 1,
    },
  },
  {
    name: 'Ocotillo',
    succulent: {
      form: 'ocotillo', family: 'desertPerennials', height: 3.4, heightV: 0.18,
      bodyRadius: 0.3, bodyDepth: 0.34, radialSegments: 24, bodySegments: 7,
      canes: 8, caneLength: 3.2, caneRadius: 0.028, caneLean: 22, caneCurve: 24,
      caneLeaves: 7, leaves: 0, arms: 0, ribs: 0, areoleRows: 0, spineClusters: 0,
      terminalSpine: false, rootDepth: 0.24, detail: 0.85,
    },
  },
  {
    name: 'Desert Spoon',
    succulent: {
      form: 'desertSpoon', family: 'desertPerennials', height: 1.05, heightV: 0.14,
      bodyRadius: 0.17, bodyDepth: 0.2, radialSegments: 28, bodySegments: 5,
      leaves: 42, leafLength: 0.52, leafLengthV: 0.18, leafWidth: 0.055,
      leafThickness: 0.02, leafLean: 14, leafCurve: 26, leafCurl: 0.02,
      leafTaper: 0.58, leafKeel: 0.14, marginalTeeth: 0, terminalSpine: true,
      spineClusters: 0, rootDepth: 0.15, detail: 0.8,
    },
  },
  {
    name: 'Aloe',
    succulent: {
      form: 'aloe', family: 'succulents', height: 0.68, heightV: 0.14,
      bodyRadius: 0.13, bodyDepth: 0.16, radialSegments: 28, bodySegments: 4,
      leaves: 26, leafLength: 0.42, leafLengthV: 0.16, leafWidth: 0.09,
      leafThickness: 0.032, leafLean: 32, leafCurve: 58, leafCurl: 0.05,
      leafTaper: 0.55, leafKeel: 0.85, marginalTeeth: 6, toothLength: 0.014,
      terminalSpine: true, spineClusters: 0, rootDepth: 0.11, detail: 0.9,
    },
  },
];

export function succulentHeight(s: SucculentParams): number {
  if (s.form === 'ocotillo') return Math.max(0.2, s.height, s.caneLength * 1.05);
  if (s.form === 'pricklyPear') return Math.max(0.2, s.height, s.padHeight * 2.2);
  if (s.form === 'agave' || s.form === 'yucca' || s.form === 'desertSpoon' || s.form === 'aloe') return Math.max(0.2, s.height, s.leafLength * 1.1);
  return Math.max(0.2, s.height);
}

export function succulentHabit(s: SucculentParams): string {
  if (s.form === 'saguaro') return 'ribbed column cactus';
  if (s.form === 'barrel') return 'solitary barrel cactus';
  if (s.form === 'pricklyPear') return 'segmented pad cactus';
  if (s.form === 'cholla') return 'tuberculate branching cactus';
  if (s.form === 'hedgehog') return 'clustered ribbed cactus';
  if (s.form === 'ocotillo') return 'whiplike cane shrub';
  if (s.form === 'agave' || s.form === 'aloe') return 'spined rosette succulent';
  return 'sword-leaved desert perennial';
}
