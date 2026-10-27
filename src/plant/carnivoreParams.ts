/**
 * Carnivorous plants: parameters and species presets.
 *
 * Every trap is modelled as part of the plant: the snap-trap of a flytrap is
 * the end of its own leaf, a sundew's tentacles grow out of the blade, a
 * pitcher is one tube that rolls over at the mouth and goes back down inside.
 * Three growth forms share the parameter set:
 *   rosette  – a buried crown with a ring of trap leaves and one or more
 *              flower scapes (Venus flytrap, sundews, butterworts);
 *   pitcher  – a rhizome crown with a clump of erect or sprawling pitchers,
 *              each with its hood, wing and rolled lip (Sarracenia,
 *              Darlingtonia, Heliamphora);
 *   vine     – a scrambling stem whose leaves run out into tendrils that
 *              carry a hanging-then-upright pitcher with a lid (Nepenthes).
 * Lengths are metres, angles degrees.
 */

export type CarnivoreForm = 'rosette' | 'pitcher' | 'vine';
/** Trap carried by the leaves of a rosette. */
export type TrapKind = 'snap' | 'tentacle' | 'flat';
/** What covers the mouth of a pitcher. */
export type HoodKind = 'over' | 'erect' | 'cobra';

export const CARNIVORE_FORM_NAMES: Record<CarnivoreForm, string> = {
  rosette: 'Rosette (flytrap, sundew, butterwort)',
  pitcher: 'Pitcher clump (trumpet pitchers, cobra lily)',
  vine: 'Climbing pitcher vine (Nepenthes)',
};

export const TRAP_NAMES: Record<TrapKind, string> = {
  snap: 'Snap trap (flytrap)',
  tentacle: 'Sticky tentacles (sundew)',
  flat: 'Flypaper blade (butterwort)',
};

export const HOOD_NAMES: Record<HoodKind, string> = {
  over: 'Arching hood (trumpet pitchers)',
  erect: 'Erect collar hood (purple pitcher)',
  cobra: 'Domed head with fishtail (cobra lily)',
};

export interface CarnivoreParams {
  form: CarnivoreForm;

  // ---- Crown / stem
  /** Crown (rhizome) radius; the stem radius of a vine. */
  radius: number;
  /** Crown height above the soil; the stem length of a vine. */
  height: number;
  /** Random variation of the height, ±fraction. */
  heightV: number;
  /** Vine: lean of the stem from the vertical at its top (it scrambles rather than stands). */
  lean: number;

  // ---- Leaves (rosette and vine)
  leaves: number;
  /** Whole leaf length: petiole + trap for a rosette, blade only for a vine. */
  leafLength: number;
  leafLengthV: number;
  /** Width of the petiole strip (rosette) or of the blade (butterwort, vine). */
  leafWidth: number;
  /** Blade thickness as a fraction of its width. */
  leafThickness: number;
  /** Angle from the vertical of the oldest (outer) leaves. */
  leafSpread: number;
  /** Angle from the vertical of the youngest (inner) leaves. */
  leafSpreadTop: number;
  /** Droop under gravity along the leaf, degrees over its length. */
  leafDroop: number;
  /** Channelling of the blade (degrees of arc across the width). */
  leafCup: number;
  /** Fraction of the leaf that is petiole (the rest is the trap or blade). */
  petiole: number;
  leafSides: number;

  // ---- Traps of a rosette
  trap: TrapKind;
  /** Snap trap: width of one lobe. */
  trapWidth: number;
  /** Snap trap: opening angle between the lobes (0 shut, 180 flat open). */
  trapOpen: number;
  trapOpenV: number;
  /** Snap trap: marginal teeth per lobe (0 none) and their length. */
  cilia: number;
  ciliaLength: number;
  /** Snap trap: trigger hairs per lobe. */
  triggerHairs: number;
  /** Sundew: tentacles per leaf (an upper bound; the blade's lattice decides how many fit). */
  tentacles: number;
  tentacleLength: number;
  tentacleRadius: number;
  /** Sundew: curl of the blade tip (degrees; young leaves unroll). */
  tipCurl: number;

  // ---- Pitchers (pitcher clump and vine)
  pitchers: number;
  pitcherHeight: number;
  pitcherHeightV: number;
  /** Radius at the base and at the mouth. */
  pitcherBase: number;
  pitcherMouth: number;
  /** Exponent of the widening from base to mouth (1 straight cone, > 1 trumpet, < 1 bulging early). */
  pitcherTaper: number;
  /** Belly: radius multiplier at `pitcherBellyPos` (1 none), with its relative width. */
  pitcherBelly: number;
  pitcherBellyPos: number;
  pitcherBellyWidth: number;
  /** Lean of the pitcher from the vertical at its base, and its curve back up over the length. */
  pitcherLean: number;
  pitcherCurve: number;
  /** Twist of the tube about its axis over its length (shows in the wing). */
  pitcherTwist: number;
  pitcherSides: number;
  /** Wing (ala) height as a fraction of the local radius. */
  wing: number;
  /** Rolled lip (peristome) as a fraction of the mouth radius. */
  peristome: number;
  /** Depth of the visible inside of the pitcher as a fraction of its height. */
  pitcherDepth: number;

  // ---- Hood / lid
  hood: HoodKind;
  hoodLength: number;
  hoodWidth: number;
  /** Arching hood: how far it bends over the mouth; erect hood: tilt back; vine lid: opening angle. */
  hoodAngle: number;
  /** Curl of the hood margins towards the mouth, degrees of arc across the width. */
  hoodCup: number;
  /** Cobra: bend of the head over the mouth and the bulge of the dome (× the tube radius). */
  headBend: number;
  headBulge: number;
  /** Cobra: length and width of the fishtail lobes (0 none). */
  fishtail: number;
  fishtailWidth: number;

  // ---- Vine (Nepenthes)
  tendrilLength: number;
  tendrilRadius: number;

  // ---- Flowers
  /** Flower scapes rising from the crown (0 none). */
  scape: number;
  scapeHeight: number;
  scapeRadius: number;
  /** Lateral flowers along the top of a scape (besides the terminal one). */
  flowers: number;
  flowerRadius: number;
  flowerLength: number;
  /** Nod of the flowers from the scape axis (degrees; 120+ hangs). */
  flowerNod: number;

  // ---- Resolution and motion
  sides: number;
  ringAspect: number;
  collarRings: number;
  sway: number;
  flex: number;
}

export const DEFAULT_CARNIVORE: CarnivoreParams = {
  form: 'rosette',
  radius: 0.012,
  height: 0.012,
  heightV: 0.15,
  lean: 35,

  leaves: 8,
  leafLength: 0.08,
  leafLengthV: 0.2,
  leafWidth: 0.013,
  leafThickness: 0.06,
  leafSpread: 78,
  leafSpreadTop: 40,
  leafDroop: 6,
  leafCup: 25,
  petiole: 0.58,
  leafSides: 16,

  trap: 'snap',
  trapWidth: 0.013,
  trapOpen: 65,
  trapOpenV: 0.3,
  cilia: 13,
  ciliaLength: 0.0045,
  triggerHairs: 3,
  tentacles: 60,
  tentacleLength: 0.003,
  tentacleRadius: 0.00025,
  tipCurl: 0,

  pitchers: 7,
  pitcherHeight: 0.6,
  pitcherHeightV: 0.2,
  pitcherBase: 0.006,
  pitcherMouth: 0.035,
  pitcherTaper: 2.2,
  pitcherBelly: 1,
  pitcherBellyPos: 0.6,
  pitcherBellyWidth: 0.22,
  pitcherLean: 8,
  pitcherCurve: 0,
  pitcherTwist: 0,
  pitcherSides: 32,
  wing: 0.25,
  peristome: 0.12,
  pitcherDepth: 0.3,

  hood: 'over',
  hoodLength: 0.08,
  hoodWidth: 0.08,
  hoodAngle: 80,
  hoodCup: 25,
  headBend: 150,
  headBulge: 2.4,
  fishtail: 0,
  fishtailWidth: 0.025,

  tendrilLength: 0.22,
  tendrilRadius: 0.0015,

  scape: 1,
  scapeHeight: 0.25,
  scapeRadius: 0.0015,
  flowers: 5,
  flowerRadius: 0.011,
  flowerLength: 0.004,
  flowerNod: 20,

  sides: 24,
  ringAspect: 1.1,
  collarRings: 1,
  sway: 0.15,
  flex: 0.3,
};

/** Approximate overall height (for framing and the library). */
export function carnivoreHeight(p: CarnivoreParams): number {
  const scape = p.scape > 0 ? p.scapeHeight + p.height : 0;
  if (p.form === 'vine') return Math.max(0.1, p.height * (0.55 + 0.45 * Math.cos(p.lean * (Math.PI / 180))));
  if (p.form === 'pitcher') {
    const up = Math.cos(Math.min(85, p.pitcherLean) * (Math.PI / 180));
    const body = p.pitcherHeight * (1 + 0.5 * p.pitcherHeightV) * Math.max(0.35, up) + p.height;
    return Math.max(0.05, Math.max(body, scape));
  }
  const leaf = p.height + p.leafLength * Math.cos(Math.min(p.leafSpread, p.leafSpreadTop) * (Math.PI / 180));
  return Math.max(0.03, Math.max(leaf, scape));
}

export function carnivoreHabit(p: CarnivoreParams): string {
  if (p.form === 'vine') return 'climbing pitcher vine';
  if (p.form === 'pitcher') return p.hood === 'cobra' ? 'cobra-headed pitchers' : p.pitcherLean > 30 ? 'sprawling pitchers' : 'erect pitcher clump';
  return p.trap === 'snap' ? 'snap-trap rosette' : p.trap === 'tentacle' ? 'sundew rosette' : 'flypaper rosette';
}

export const CARNIVORE_PRESETS: { name: string; carnivore: Partial<CarnivoreParams> }[] = [
  {
    // Dionaea muscipula: a flat rosette of winged petioles, each ending in a two-lobed snap trap with
    // marginal teeth and three trigger hairs per lobe; a scape of white five-petalled flowers.
    name: 'Venus Flytrap',
    carnivore: {},
  },
  {
    // Drosera capensis: strap leaves on short petioles, covered in red-stalked glue tentacles, young
    // blades unrolling from a curl; an arching scape of pink flowers.
    name: 'Cape Sundew',
    carnivore: {
      trap: 'tentacle',
      radius: 0.011,
      height: 0.03,
      leaves: 12,
      leafLength: 0.11,
      leafLengthV: 0.25,
      leafWidth: 0.007,
      leafThickness: 0.12,
      leafSpread: 50,
      leafSpreadTop: 20,
      leafDroop: 10,
      leafCup: 20,
      petiole: 0.38,
      leafSides: 12,
      tentacles: 80,
      tentacleLength: 0.0035,
      tentacleRadius: 0.0003,
      tipCurl: 150,
      scapeHeight: 0.3,
      scapeRadius: 0.0012,
      flowers: 12,
      flowerRadius: 0.007,
      flowerLength: 0.0035,
      flowerNod: 35,
      sides: 24,
      sway: 0.2,
      flex: 0.4,
    },
  },
  {
    // Drosera rotundifolia: tiny round blades on prostrate petioles, the longest tentacles at the rim;
    // a thread-like scape with a one-sided row of white flowers.
    name: 'Round-leaved Sundew',
    carnivore: {
      trap: 'tentacle',
      radius: 0.005,
      height: 0.008,
      leaves: 9,
      leafLength: 0.034,
      leafLengthV: 0.2,
      leafWidth: 0.012,
      leafThickness: 0.1,
      leafSpread: 86,
      leafSpreadTop: 60,
      leafDroop: 0,
      leafCup: 12,
      petiole: 0.6,
      leafSides: 12,
      tentacles: 50,
      tentacleLength: 0.003,
      tentacleRadius: 0.00022,
      tipCurl: 0,
      scapeHeight: 0.12,
      scapeRadius: 0.0007,
      flowers: 6,
      flowerRadius: 0.0035,
      flowerLength: 0.002,
      flowerNod: 35,
      sides: 18,
      sway: 0.15,
      flex: 0.3,
    },
  },
  {
    // Pinguicula vulgaris: a flat star of yellow-green, greasy, obovate leaves with up-rolled margins;
    // one to three leafless scapes each carrying a single nodding violet flower.
    name: 'Common Butterwort',
    carnivore: {
      trap: 'flat',
      radius: 0.009,
      height: 0.008,
      leaves: 7,
      leafLength: 0.05,
      leafLengthV: 0.2,
      leafWidth: 0.019,
      leafThickness: 0.06,
      leafSpread: 86,
      leafSpreadTop: 62,
      leafDroop: 4,
      leafCup: 75,
      petiole: 0.22,
      leafSides: 16,
      scape: 2,
      scapeHeight: 0.12,
      scapeRadius: 0.0009,
      flowers: 0,
      flowerRadius: 0.008,
      flowerLength: 0.005,
      flowerNod: 75,
      sides: 16,
      sway: 0.15,
      flex: 0.3,
    },
  },
  {
    // Sarracenia flava: tall yellow trumpets with a narrow wing, flaring to a wide mouth under a
    // broad arching lid; one big nodding yellow flower on its own scape.
    name: 'Yellow Trumpet Pitcher',
    carnivore: {
      form: 'pitcher',
      radius: 0.025,
      height: 0.04,
      heightV: 0.1,
      pitchers: 7,
      pitcherHeight: 0.6,
      pitcherHeightV: 0.2,
      pitcherBase: 0.006,
      pitcherMouth: 0.035,
      pitcherTaper: 2.2,
      pitcherBelly: 1,
      pitcherLean: 8,
      pitcherCurve: 0,
      pitcherSides: 32,
      wing: 0.25,
      peristome: 0.12,
      pitcherDepth: 0.3,
      hood: 'over',
      hoodLength: 0.085,
      hoodWidth: 0.08,
      hoodAngle: 85,
      hoodCup: 25,
      scape: 1,
      scapeHeight: 0.65,
      scapeRadius: 0.003,
      flowers: 0,
      flowerRadius: 0.035,
      flowerLength: 0.05,
      flowerNod: 125,
      sides: 48,
      sway: 0.3,
      flex: 0.35,
    },
  },
  {
    // Sarracenia purpurea: squat, sprawling pitchers that curve back up, with a broad wing, a fat belly,
    // a rolled lip and an erect, ruffled collar-like hood; a nodding deep-red flower.
    name: 'Purple Pitcher Plant',
    carnivore: {
      form: 'pitcher',
      radius: 0.022,
      height: 0.035,
      heightV: 0.1,
      pitchers: 8,
      pitcherHeight: 0.19,
      pitcherHeightV: 0.25,
      pitcherBase: 0.007,
      pitcherMouth: 0.028,
      pitcherTaper: 1,
      pitcherBelly: 1.45,
      pitcherBellyPos: 0.62,
      pitcherBellyWidth: 0.26,
      pitcherLean: 50,
      pitcherCurve: 45,
      pitcherSides: 32,
      wing: 0.6,
      peristome: 0.2,
      pitcherDepth: 0.35,
      hood: 'erect',
      hoodLength: 0.05,
      hoodWidth: 0.065,
      hoodAngle: 20,
      hoodCup: 110,
      scape: 1,
      scapeHeight: 0.3,
      scapeRadius: 0.0025,
      flowers: 0,
      flowerRadius: 0.03,
      flowerLength: 0.045,
      flowerNod: 125,
      sides: 48,
      sway: 0.2,
      flex: 0.3,
    },
  },
  {
    // Darlingtonia californica: twisted tubes swelling into a domed head that bends over the small
    // mouth, from whose lip hangs a forked fishtail; a tall scape with a nodding flower.
    name: 'Cobra Lily',
    carnivore: {
      form: 'pitcher',
      radius: 0.024,
      height: 0.04,
      heightV: 0.1,
      pitchers: 6,
      pitcherHeight: 0.5,
      pitcherHeightV: 0.25,
      pitcherBase: 0.006,
      pitcherMouth: 0.014,
      pitcherTaper: 1.3,
      pitcherBelly: 1,
      pitcherLean: 10,
      pitcherCurve: 0,
      pitcherTwist: 180,
      pitcherSides: 32,
      wing: 0.35,
      peristome: 0.15,
      pitcherDepth: 0.2,
      hood: 'cobra',
      headBend: 150,
      headBulge: 2.6,
      fishtail: 0.07,
      fishtailWidth: 0.026,
      scape: 1,
      scapeHeight: 0.6,
      scapeRadius: 0.003,
      flowers: 0,
      flowerRadius: 0.03,
      flowerLength: 0.045,
      flowerNod: 125,
      sides: 48,
      sway: 0.3,
      flex: 0.35,
    },
  },
  {
    // Heliamphora nutans: a dense clump of short flaring funnels with a broad wing, a constriction
    // above the base and a tiny nectar spoon instead of a hood; a tall scape of nodding white bells.
    name: 'Sun Pitcher',
    carnivore: {
      form: 'pitcher',
      radius: 0.02,
      height: 0.03,
      heightV: 0.1,
      pitchers: 10,
      pitcherHeight: 0.2,
      pitcherHeightV: 0.2,
      pitcherBase: 0.007,
      pitcherMouth: 0.03,
      pitcherTaper: 1.2,
      pitcherBelly: 1.25,
      pitcherBellyPos: 0.22,
      pitcherBellyWidth: 0.16,
      pitcherLean: 20,
      pitcherCurve: 0,
      pitcherSides: 32,
      wing: 0.35,
      peristome: 0.08,
      pitcherDepth: 0.4,
      hood: 'over',
      hoodLength: 0.014,
      hoodWidth: 0.013,
      hoodAngle: 35,
      hoodCup: 70,
      scape: 1,
      scapeHeight: 0.4,
      scapeRadius: 0.002,
      flowers: 3,
      flowerRadius: 0.016,
      flowerLength: 0.03,
      flowerNod: 80,
      sides: 48,
      sway: 0.25,
      flex: 0.3,
    },
  },
  {
    // Nepenthes alata: a scrambling stem of lanceolate leaves whose midribs run out into tendrils that
    // hook back up into waisted pitchers with two fringed wings, a flared peristome and a raised lid.
    name: 'Tropical Pitcher Plant',
    carnivore: {
      form: 'vine',
      radius: 0.005,
      height: 1.2,
      heightV: 0.15,
      lean: 40,
      leaves: 8,
      leafLength: 0.22,
      leafLengthV: 0.15,
      leafWidth: 0.05,
      leafThickness: 0.03,
      leafSpread: 65,
      leafSpreadTop: 50,
      leafDroop: 30,
      leafCup: 30,
      leafSides: 12,
      tendrilLength: 0.22,
      tendrilRadius: 0.0015,
      pitcherHeight: 0.16,
      pitcherHeightV: 0.2,
      pitcherBase: 0.006,
      pitcherMouth: 0.022,
      pitcherTaper: 0.5,
      pitcherBelly: 1.55,
      pitcherBellyPos: 0.3,
      pitcherBellyWidth: 0.25,
      pitcherSides: 24,
      wing: 0.22,
      peristome: 0.2,
      pitcherDepth: 0.3,
      hood: 'over',
      hoodLength: 0.06,
      hoodWidth: 0.055,
      hoodAngle: 50,
      hoodCup: -20,
      scape: 0,
      sides: 12,
      sway: 0.5,
      flex: 0.45,
    },
  },
];

export const CARNIVORE_GROUPS: { label: string; names: string[] }[] = [
  { label: 'Carnivorous · traps & sundews', names: ['Venus Flytrap', 'Cape Sundew', 'Round-leaved Sundew', 'Common Butterwort'] },
  { label: 'Carnivorous · pitcher plants', names: ['Yellow Trumpet Pitcher', 'Purple Pitcher Plant', 'Cobra Lily', 'Sun Pitcher', 'Tropical Pitcher Plant'] },
];
