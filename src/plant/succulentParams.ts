/**
 * Cacti and succulents: parameters and species presets.
 *
 * Three growth forms share one parameter set:
 *   column  – a ribbed stem (or squat barrel) that may bear arms, arms of
 *             arms, areoles with spine clusters and, for tree aloes, leaf
 *             rosettes at the tips of the terminal arms;
 *   pad     – flattened stem segments (cladodes) chained from each other's
 *             rims, with areoles on the faces and fruits on the upper rim;
 *   rosette – a short stem bearing thick channelled leaves in a spiral, with
 *             marginal teeth and an optional lateral flower stalk.
 * Lengths are metres, angles degrees.
 */

export type SucculentForm = 'column' | 'pad' | 'rosette';
export type SucculentBody = 'column' | 'barrel';

export const SUCCULENT_FORM_NAMES: Record<SucculentForm, string> = {
  column: 'Column / barrel',
  pad: 'Pads (opuntia)',
  rosette: 'Leaf rosette',
};

export interface SucculentParams {
  form: SucculentForm;

  // ---- Body: the trunk column, the barrel, the first pad or the rosette stem
  /** Height of the trunk (column), length of the first pad, or height of the rosette stem above ground. */
  height: number;
  /** ± fraction applied to the trunk / first pad. */
  heightV: number;
  /** Stems rising from the ground (1 = a single trunk, more = a clump on a buried pad). */
  stems: number;
  /** ± stems. */
  stemsV: number;
  /** Radius of the clump at ground level. */
  clumpRadius: number;
  /** Radius of the trunk / barrel / rosette stem. */
  radius: number;
  /** Column: straight stem with a domed tip. Barrel: squat body, widest at `bellyPos`. */
  body: SucculentBody;
  /** Radius at the base as a fraction of `radius` (columns constrict at the woody base). */
  baseTaper: number;
  /** Barrel: height fraction of the widest point. */
  bellyPos: number;
  /** Column: height of the domed tip as a fraction of the radius. */
  domeHeight: number;
  /** Ribs around the stem (0 = smooth). */
  ribs: number;
  /** Trough depth as a fraction of the radius. */
  ribDepth: number;
  /** Rib profile: > 1 broad rounded ribs with narrow troughs, < 1 knife-edge ribs. */
  ribSharp: number;
  /** Tilt of the trunk from the vertical. */
  lean: number;
  leanV: number;
  /** Bend along the trunk (in a random direction). */
  curve: number;
  /** Periodic constriction depth of arms (segmented euphorbias, cholla joints), fraction of the radius. */
  constriction: number;
  /** Length of one segment between constrictions. */
  constrictionLength: number;

  // ---- Arms (columns branching from the trunk, recursively)
  arms: number;
  /** ± arms. */
  armsV: number;
  /** 0 = no arms, 1 = arms only, 2 = arms of arms, 3 = a third order. */
  armLevels: number;
  /** Arms per arm at the deeper levels. */
  armChildren: number;
  /** Attachment range along the trunk as fractions of its height (negative = below ground, clumps). */
  armFrom: number;
  armTo: number;
  /** Attachment range along the parent arm for arms of arms. */
  armFrom2: number;
  armTo2: number;
  /** Arm length as a fraction of the parent's length. */
  armLength: number;
  armLengthV: number;
  /** Arm radius as a fraction of the trunk's radius. */
  armRadius: number;
  /** Radius of arms of arms as a fraction of their parent's radius. */
  armRadius2: number;
  /** Ribs of the arms (0 = scaled from the trunk's ribs by the radius ratio). */
  armRibs: number;
  /** Angle from the parent axis where the arm leaves it. */
  armAngle: number;
  /** How far the arm turns back towards the vertical (the saguaro elbow). */
  armRise: number;
  /** Fraction of the arm's length over which it rises. */
  armRiseLength: number;
  /** Droop of the outer part of the arm under its weight (jointed chollas). */
  armDroop: number;
  /** Leaf rosette at the tip of every terminal arm (tree aloes): 0 or 1. */
  armTuft: number;

  // ---- Areoles and spines (columns, arms and pads)
  /** Spacing of the areoles along each rib (0 = no areoles). */
  areoleSpacing: number;
  /** Radius of the areole cushion. */
  areoleRadius: number;
  /** Upward tilt of the cluster axis. */
  areoleTilt: number;
  /** Radial spines per areole (0, 2 or 4). */
  spines: number;
  /** Central spine (0 or 1). */
  centralSpine: number;
  spineLength: number;
  spineLengthV: number;
  spineRadius: number;
  /** Angle the radial spines are raised from the surface. */
  spineAngle: number;
  /** Curvature along the central spine (fish-hook barrels). */
  spineHook: number;
  /** Fraction of the trunk / arm length, from the tip, that carries no areoles (young growth). */
  areoleTipGap: number;

  // ---- Pads (form = 'pad')
  padLength: number;
  padLengthV: number;
  padWidth: number;
  padThickness: number;
  /** Total number of pads including the first one. */
  pads: number;
  /** Chain depth. */
  padLevels: number;
  /** Rotation of a child pad's plane out of the parent's plane (± random). */
  padTwist: number;
  /** Upward curve of a pad along its length. */
  padUp: number;
  /** Attachment range of child pads along the parent's rim (fractions of the pad length). */
  padFrom: number;
  padTo: number;
  /** Fruits on the upper rim of each terminal pad. */
  fruits: number;
  fruitLength: number;
  fruitRadius: number;

  // ---- Rosette (form = 'rosette', or the leaf tufts of tree aloes)
  leaves: number;
  leafLength: number;
  leafLengthV: number;
  leafWidth: number;
  /** Thickness as a fraction of the width. */
  leafThickness: number;
  /** Channelling of the leaf: arc angle of its cross-section. */
  leafCup: number;
  /** Angle from the vertical of the outermost (oldest) leaves. */
  leafSpread: number;
  /** Angle from the vertical of the innermost (youngest) leaves. */
  leafSpreadTop: number;
  /** Outward arch along the leaf. */
  leafBend: number;
  leafTwist: number;
  /** Marginal teeth per edge (0 = entire margins). */
  teeth: number;
  toothLength: number;
  /** Lateral flower stalk (aloes). */
  stalk: number;
  stalkHeight: number;
  stalkRadius: number;
  /** Tubular flowers on the upper part of the stalk. */
  flowers: number;
  flowerLength: number;
  flowerRadius: number;
  /** Droop of the flowers from the horizontal. */
  flowerDroop: number;

  // ---- Resolution and wind
  /** Ring vertices per rib (3 or 4), or around a smooth stem (8–96). */
  sides: number;
  /** Ring spacing as a multiple of the circumferential vertex spacing. */
  ringAspect: number;
  /** Ring vertices around a pad. */
  padSides: number;
  /** Ring vertices around a leaf. */
  leafSides: number;
  collarRings: number;
  /** Whole-plant sway (cacti barely move). */
  sway: number;
  /** Flex of arms, pads and leaves about their base. */
  flex: number;
}

export const DEFAULT_SUCCULENT: SucculentParams = {
  form: 'column',
  height: 6,
  heightV: 0.15,
  stems: 1,
  stemsV: 0,
  clumpRadius: 0.5,
  radius: 0.3,
  body: 'column',
  baseTaper: 0.8,
  bellyPos: 0.45,
  domeHeight: 0.9,
  ribs: 18,
  ribDepth: 0.16,
  ribSharp: 1.6,
  lean: 0,
  leanV: 2,
  curve: 4,
  constriction: 0,
  constrictionLength: 0.35,
  arms: 4,
  armsV: 2,
  armLevels: 1,
  armChildren: 1,
  armFrom: 0.35,
  armTo: 0.7,
  armFrom2: 0.5,
  armTo2: 0.8,
  armLength: 0.45,
  armLengthV: 0.3,
  armRadius: 0.6,
  armRadius2: 0.8,
  armRibs: 0,
  armAngle: 80,
  armRise: 80,
  armRiseLength: 0.4,
  armDroop: 0,
  armTuft: 0,
  areoleSpacing: 0.07,
  areoleRadius: 0.008,
  areoleTilt: 10,
  spines: 4,
  centralSpine: 1,
  spineLength: 0.03,
  spineLengthV: 0.25,
  spineRadius: 0.0012,
  spineAngle: 30,
  spineHook: 0,
  areoleTipGap: 0.02,
  padLength: 0.28,
  padLengthV: 0.2,
  padWidth: 0.2,
  padThickness: 0.025,
  pads: 14,
  padLevels: 4,
  padTwist: 40,
  padUp: 30,
  padFrom: 0.55,
  padTo: 0.95,
  fruits: 3,
  fruitLength: 0.06,
  fruitRadius: 0.022,
  leaves: 28,
  leafLength: 1.6,
  leafLengthV: 0.15,
  leafWidth: 0.2,
  leafThickness: 0.25,
  leafCup: 70,
  leafSpread: 80,
  leafSpreadTop: 12,
  leafBend: 25,
  leafTwist: 8,
  teeth: 14,
  toothLength: 0.008,
  stalk: 0,
  stalkHeight: 0.9,
  stalkRadius: 0.012,
  flowers: 80,
  flowerLength: 0.035,
  flowerRadius: 0.004,
  flowerDroop: 60,
  sides: 4,
  ringAspect: 1,
  padSides: 20,
  leafSides: 16,
  collarRings: 1,
  sway: 0.3,
  flex: 0.25,
};

/** Approximate height of the plant, for framing and the wind normalisation. */
export function succulentHeight(p: SucculentParams): number {
  switch (p.form) {
    case 'pad':
      return Math.max(0.1, p.padLength * (1 + 0.8 * Math.max(0, p.padLevels - 1)));
    case 'rosette':
      return Math.max(0.1, p.height + p.leafLength * Math.cos((p.leafSpreadTop * Math.PI) / 180), p.stalk ? p.stalkHeight : 0);
    default:
      return Math.max(0.1, p.height * (1 + (p.armLevels > 0 && p.arms > 0 ? Math.max(0, p.armLength * p.armLevels * 0.5) : 0)));
  }
}

/** Short habit description for the Library. */
export function succulentHabit(p: SucculentParams): string {
  if (p.form === 'pad') return `${p.pads} pads · ${p.fruits ? 'fruiting' : 'sterile'}`;
  if (p.form === 'rosette') return `${p.leaves} leaves · ${p.stalk ? 'in flower' : 'vegetative'}`;
  const clump = p.stems > 1 ? `clump of ${p.stems} · ` : '';
  if (p.body === 'barrel') return `${clump}barrel · ${p.ribs} ribs`;
  if (p.armTuft > 0) return `${p.arms} forks · leaf tufts`;
  return p.armLevels > 0 && p.arms > 0 ? `${clump}${p.ribs ? p.ribs + ' ribs · ' : ''}${p.arms} arms` : `${clump}${p.ribs ? p.ribs + ' ribs' : 'smooth'} · unbranched`;
}

export const SUCCULENT_PRESETS: { name: string; succulent: Partial<SucculentParams> }[] = [
  {
    // Carnegiea gigantea: the Sonoran giant, 12–24 ribs, arms rising from an elbow at mid height.
    name: 'Saguaro',
    succulent: {},
  },
  {
    // Pachycereus pringlei: heavier than the saguaro, fewer ribs, many arms from low on the trunk.
    name: 'Cardón',
    succulent: {
      height: 8,
      radius: 0.45,
      ribs: 13,
      ribDepth: 0.2,
      ribSharp: 1.3,
      arms: 8,
      armsV: 3,
      armLevels: 2,
      armChildren: 1,
      armFrom: 0.15,
      armTo: 0.5,
      armFrom2: 0.35,
      armTo2: 0.7,
      armLength: 0.6,
      armLengthV: 0.3,
      armRadius: 0.55,
      armRadius2: 0.8,
      armAngle: 70,
      armRise: 75,
      armRiseLength: 0.35,
      areoleSpacing: 0.1,
      areoleRadius: 0.009,
      spines: 2,
      spineLength: 0.025,
      sides: 4,
    },
  },
  {
    // Stenocereus thurberi: a clump of columns branching from the base.
    name: 'Organ Pipe Cactus',
    succulent: {
      height: 3.6,
      heightV: 0.3,
      stems: 8,
      stemsV: 2,
      clumpRadius: 0.5,
      radius: 0.085,
      baseTaper: 0.9,
      ribs: 14,
      ribDepth: 0.22,
      ribSharp: 1.2,
      domeHeight: 1,
      lean: 6,
      leanV: 5,
      curve: 6,
      arms: 0,
      armLevels: 0,
      areoleSpacing: 0.06,
      areoleRadius: 0.006,
      areoleTilt: 0,
      spines: 2,
      centralSpine: 1,
      spineLength: 0.014,
      spineRadius: 0.0008,
      spineAngle: 35,
      sides: 3,
      sway: 0.2,
    },
  },
  {
    // Echinopsis pachanoi: fast columnar clump with few broad rounded ribs and tiny spines.
    name: 'San Pedro Cactus',
    succulent: {
      height: 2.6,
      heightV: 0.3,
      stems: 6,
      stemsV: 2,
      clumpRadius: 0.3,
      radius: 0.065,
      baseTaper: 0.9,
      ribs: 8,
      ribDepth: 0.24,
      ribSharp: 0.9,
      domeHeight: 1,
      lean: 8,
      leanV: 6,
      curve: 8,
      arms: 1,
      armsV: 1,
      armLevels: 1,
      armFrom: 0.2,
      armTo: 0.55,
      armLength: 0.55,
      armLengthV: 0.3,
      armRadius: 0.8,
      armAngle: 45,
      armRise: 45,
      armRiseLength: 0.3,
      areoleSpacing: 0.035,
      areoleRadius: 0.005,
      spines: 2,
      centralSpine: 1,
      spineLength: 0.008,
      spineRadius: 0.0006,
      spineAngle: 40,
      sides: 4,
      sway: 0.2,
    },
  },
  {
    // Echinocactus grusonii: squat golden globe with dense straw-coloured spines.
    name: 'Golden Barrel',
    succulent: {
      body: 'barrel',
      height: 0.7,
      heightV: 0.1,
      radius: 0.4,
      bellyPos: 0.42,
      baseTaper: 0.55,
      ribs: 28,
      ribDepth: 0.18,
      ribSharp: 1.3,
      arms: 0,
      armLevels: 0,
      areoleSpacing: 0.03,
      areoleRadius: 0.007,
      areoleTilt: 0,
      spines: 4,
      centralSpine: 1,
      spineLength: 0.035,
      spineLengthV: 0.2,
      spineRadius: 0.0012,
      spineAngle: 35,
      areoleTipGap: 0.08,
      sides: 3,
      sway: 0.05,
    },
  },
  {
    // Ferocactus wislizeni: taller barrel with long hooked central spines.
    name: 'Fishhook Barrel',
    succulent: {
      body: 'barrel',
      height: 1.3,
      heightV: 0.15,
      radius: 0.3,
      bellyPos: 0.55,
      baseTaper: 0.6,
      ribs: 22,
      ribDepth: 0.22,
      ribSharp: 1.4,
      arms: 0,
      armLevels: 0,
      areoleSpacing: 0.04,
      areoleRadius: 0.008,
      areoleTilt: -10,
      spines: 4,
      centralSpine: 1,
      spineLength: 0.07,
      spineLengthV: 0.15,
      spineRadius: 0.0018,
      spineAngle: 30,
      spineHook: 80,
      areoleTipGap: 0.06,
      sides: 3,
      sway: 0.05,
    },
  },
  {
    // Mammillaria-like clump of small globes.
    name: 'Pincushion Cactus',
    succulent: {
      body: 'barrel',
      height: 0.09,
      heightV: 0.25,
      stems: 9,
      stemsV: 3,
      clumpRadius: 0.13,
      radius: 0.045,
      bellyPos: 0.5,
      baseTaper: 0.6,
      ribs: 13,
      ribDepth: 0.3,
      ribSharp: 1,
      lean: 12,
      leanV: 10,
      arms: 0,
      armLevels: 0,
      areoleSpacing: 0.012,
      areoleRadius: 0.0025,
      areoleTilt: 0,
      spines: 4,
      centralSpine: 1,
      spineLength: 0.009,
      spineLengthV: 0.2,
      spineRadius: 0.0004,
      spineAngle: 45,
      areoleTipGap: 0.05,
      sides: 3,
      sway: 0.05,
    },
  },
  {
    // Opuntia ficus-indica: chains of flat pads with fruits along the upper rims.
    name: 'Prickly Pear',
    succulent: {
      form: 'pad',
      padLength: 0.3,
      padLengthV: 0.2,
      padWidth: 0.2,
      padThickness: 0.025,
      pads: 16,
      padLevels: 4,
      padTwist: 45,
      padUp: 35,
      padFrom: 0.55,
      padTo: 0.95,
      fruits: 3,
      fruitLength: 0.06,
      fruitRadius: 0.022,
      areoleSpacing: 0.04,
      areoleRadius: 0.005,
      areoleTilt: 0,
      spines: 2,
      centralSpine: 1,
      spineLength: 0.022,
      spineLengthV: 0.3,
      spineRadius: 0.0008,
      spineAngle: 35,
      padSides: 20,
      flex: 0.3,
    },
  },
  {
    // Cylindropuntia bigelovii: a woody trunk crowded with short, densely spined joints.
    name: 'Teddy-Bear Cholla',
    succulent: {
      height: 1.1,
      heightV: 0.15,
      radius: 0.045,
      baseTaper: 0.95,
      domeHeight: 0.8,
      ribs: 0,
      arms: 7,
      armsV: 2,
      armLevels: 3,
      armChildren: 2,
      armFrom: 0.45,
      armTo: 0.92,
      armFrom2: 0.6,
      armTo2: 0.92,
      armLength: 0.32,
      armLengthV: 0.3,
      armRadius: 0.7,
      armRadius2: 0.8,
      armRibs: 8,
      armAngle: 50,
      armRise: 15,
      armRiseLength: 0.5,
      armDroop: 25,
      constriction: 0.12,
      constrictionLength: 0.14,
      areoleSpacing: 0.03,
      areoleRadius: 0.0045,
      areoleTilt: 0,
      spines: 4,
      centralSpine: 1,
      spineLength: 0.022,
      spineLengthV: 0.25,
      spineRadius: 0.0006,
      spineAngle: 40,
      sides: 48,
      ringAspect: 1,
      sway: 0.15,
      flex: 0.4,
    },
  },
  {
    // Euphorbia ingens: the candelabra tree of the southern African bushveld, a smooth trunk and
    // dozens of four- or five-angled, segmented arms sweeping upwards. Paired thorns on the ribs.
    name: 'Candelabra Tree',
    succulent: {
      height: 5.5,
      heightV: 0.15,
      radius: 0.26,
      baseTaper: 0.95,
      domeHeight: 0.5,
      ribs: 0,
      lean: 0,
      arms: 22,
      armsV: 4,
      armLevels: 2,
      armChildren: 2,
      armFrom: 0.4,
      armTo: 0.8,
      armFrom2: 0.45,
      armTo2: 0.85,
      armLength: 0.55,
      armLengthV: 0.25,
      armRadius: 0.4,
      armRadius2: 0.8,
      armRibs: 4,
      armAngle: 65,
      armRise: 80,
      armRiseLength: 0.35,
      constriction: 0.14,
      constrictionLength: 0.32,
      areoleSpacing: 0.04,
      areoleRadius: 0.004,
      areoleTilt: 0,
      spines: 2,
      centralSpine: 0,
      spineLength: 0.007,
      spineRadius: 0.0007,
      spineAngle: 20,
      sides: 36,
      sway: 0.25,
      flex: 0.2,
    },
  },
  {
    // Aloidendron dichotomum: the quiver tree of the Namib fringe — a stout smooth trunk, forks that
    // fork again, and a tuft of grey-green leaves at the tip of every terminal branch.
    name: 'Quiver Tree',
    succulent: {
      height: 3.6,
      heightV: 0.15,
      radius: 0.32,
      baseTaper: 1.15,
      domeHeight: 0.4,
      ribs: 0,
      arms: 2,
      armsV: 0,
      armLevels: 3,
      armChildren: 2,
      armFrom: 0.86,
      armTo: 0.95,
      armFrom2: 0.78,
      armTo2: 0.95,
      armLength: 0.42,
      armLengthV: 0.15,
      armRadius: 0.68,
      armRadius2: 0.7,
      armAngle: 32,
      armRise: 22,
      armRiseLength: 0.6,
      armTuft: 1,
      areoleSpacing: 0,
      spines: 0,
      centralSpine: 0,
      leaves: 14,
      leafLength: 0.3,
      leafLengthV: 0.15,
      leafWidth: 0.05,
      leafThickness: 0.3,
      leafCup: 60,
      leafSpread: 75,
      leafSpreadTop: 15,
      leafBend: 20,
      teeth: 6,
      toothLength: 0.003,
      sides: 32,
      leafSides: 12,
      sway: 0.3,
      flex: 0.2,
    },
  },
  {
    // Agave americana: the century plant — a metre-and-a-half rosette of grey-blue, toothed, spine-tipped leaves.
    name: 'Century Plant',
    succulent: {
      form: 'rosette',
      height: 0.35,
      radius: 0.14,
      leaves: 28,
      leafLength: 1.6,
      leafLengthV: 0.15,
      leafWidth: 0.2,
      leafThickness: 0.25,
      leafCup: 70,
      leafSpread: 82,
      leafSpreadTop: 12,
      leafBend: 28,
      leafTwist: 8,
      teeth: 14,
      toothLength: 0.009,
      stalk: 0,
      leafSides: 16,
      sides: 24,
      flex: 0.25,
    },
  },
  {
    // Aloe ferox: the bitter aloe of the Eastern Cape — a dense rosette of thick, toothed leaves and a
    // lateral raceme of hundreds of pendulous tubular flowers.
    name: 'Bitter Aloe',
    succulent: {
      form: 'rosette',
      height: 0.5,
      radius: 0.1,
      leaves: 36,
      leafLength: 0.8,
      leafLengthV: 0.15,
      leafWidth: 0.12,
      leafThickness: 0.35,
      leafCup: 95,
      leafSpread: 70,
      leafSpreadTop: 18,
      leafBend: 40,
      leafTwist: 5,
      teeth: 12,
      toothLength: 0.005,
      stalk: 1,
      stalkHeight: 1.0,
      stalkRadius: 0.012,
      flowers: 110,
      flowerLength: 0.035,
      flowerRadius: 0.004,
      flowerDroop: 65,
      leafSides: 12,
      sides: 24,
      flex: 0.3,
    },
  },
];

export const SUCCULENT_GROUPS: { label: string; names: string[] }[] = [
  { label: 'Desert · columnar cacti', names: ['Saguaro', 'Cardón', 'Organ Pipe Cactus', 'San Pedro Cactus'] },
  { label: 'Desert · barrels & pads', names: ['Golden Barrel', 'Fishhook Barrel', 'Pincushion Cactus', 'Prickly Pear', 'Teddy-Bear Cholla'] },
  { label: 'Desert · succulent trees & rosettes', names: ['Candelabra Tree', 'Quiver Tree', 'Century Plant', 'Bitter Aloe'] },
];
