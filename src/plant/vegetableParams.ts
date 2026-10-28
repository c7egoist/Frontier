/**
 * Vegetable plants: parameters and species presets.
 *
 * Every vegetable is modelled WITH its crop: the fruit, pod, head, ear or
 * root is an organ of the same welded manifold as the stem that carries it.
 * Four growth forms share the parameter set:
 *   bush     – an upright main stem with side branches; fruits hang from
 *              short pedicels on the branches (tomato, pepper, eggplant,
 *              beans, okra);
 *   vine     – trailing stems along the ground with large lobed leaves on
 *              petioles and heavy fruits sitting on the soil (pumpkin,
 *              squash, cucumber, melon);
 *   rosette  – a short stem bearing a spiral of broad leaves that wrap into
 *              a head (cabbage, lettuce) or stand open (kale, chard), with a
 *              storage root below ground (carrot, beetroot, radish);
 *   stalk    – a tall single culm with strap leaves at nodes and ears in
 *              the axils (maize).
 * Lengths are metres, angles degrees.
 */

export type VegetableForm = 'bush' | 'vine' | 'rosette' | 'stalk';
export type FruitShape = 'round' | 'oblate' | 'oblong' | 'pod' | 'tapered' | 'ear';
export type LeafShape = 'simple' | 'lobed' | 'pinnate' | 'strap';

export const VEGETABLE_FORM_NAMES: Record<VegetableForm, string> = {
  bush: 'Bush (tomato, pepper)',
  vine: 'Trailing vine (pumpkin, cucumber)',
  rosette: 'Rosette (cabbage, carrot)',
  stalk: 'Stalk (maize)',
};

export const FRUIT_SHAPE_NAMES: Record<FruitShape, string> = {
  round: 'Round',
  oblate: 'Oblate (flattened, ribbed)',
  oblong: 'Oblong (cucumber, eggplant)',
  pod: 'Pod (beans, okra)',
  tapered: 'Tapered (chilli, carrot)',
  ear: 'Ear (maize)',
};

export interface VegetableParams {
  form: VegetableForm;

  // ---- Main stem / vine
  /** Height of the main stem (bush, stalk, rosette stem) or length of each vine. */
  height: number;
  heightV: number;
  /** Radius of the main stem at its base. */
  radius: number;
  /** Tilt of the main stem from the vertical. */
  lean: number;
  leanV: number;
  /** Bend along the stem (in a random direction). */
  curve: number;
  /** Number of vines from the crown (form = 'vine'). */
  vines: number;
  /** Ring vertices around the main stem. */
  stemSides: number;
  /** Sinuosity of the vines along the ground. */
  vineWander: number;

  // ---- Side branches (bush) / secondary vines
  branches: number;
  branchesV: number;
  /** Attachment range as fractions of the stem's height. */
  branchFrom: number;
  branchTo: number;
  /** Branch length as a fraction of the stem height. */
  branchLength: number;
  branchLengthV: number;
  /** Branch radius as a fraction of the stem radius. */
  branchRadius: number;
  /** Angle from the stem. */
  branchAngle: number;
  /** Droop of the branch under the fruit load. */
  branchDroop: number;

  // ---- Leaves
  leafShape: LeafShape;
  /** Leaves along the main stem (bush, stalk) or per vine / per rosette. */
  leaves: number;
  /** Leaves per branch (bush). */
  branchLeaves: number;
  leafLength: number;
  leafLengthV: number;
  /** Blade width as a fraction of the length. */
  leafWidth: number;
  /** Blade thickness as a fraction of its width. */
  leafThickness: number;
  /** Petiole (leaf stalk) length as a fraction of the blade length. */
  petiole: number;
  petioleRadius: number;
  /** Angle of the leaf / petiole from the stem. */
  leafAngle: number;
  /** Droop along the blade. */
  leafDroop: number;
  /** Cupping (arc angle) of the blade cross-section; negative folds downwards. */
  leafCup: number;
  /** Leaflets per side (pinnate) or lobes per side (lobed). */
  leaflets: number;
  /** Leaflet / lobe depth as a fraction of the half width (lobed leaves). */
  lobeDepth: number;
  /** Ring vertices around a blade. */
  leafSides: number;

  // ---- Rosette head (cabbage, lettuce) and storage root (carrot, beet)
  /** Outer (open) leaves of the rosette. */
  rosetteLeaves: number;
  /** Wrapped leaves forming the head (0 = open rosette). */
  headLeaves: number;
  headRadius: number;
  /** How tightly the head leaves wrap (0 loose, 1 tight). */
  headWrap: number;
  /** Angle from the vertical of the outermost rosette leaves. */
  rosetteSpread: number;
  /** Storage root below ground: length (0 = fibrous, not modelled). */
  rootLength: number;
  rootRadius: number;
  /** Root profile: 'tapered' carrot / 'round' beet. */
  rootShape: 'tapered' | 'round';
  /** Fraction of the root that shows above the soil (shoulders). */
  rootExposed: number;

  // ---- Fruits
  fruitShape: FruitShape;
  /** Fruits per branch (bush), per vine (vine), per stalk (ears). */
  fruits: number;
  fruitsV: number;
  /** Attachment range along the branch / vine / stalk as fractions of its length. */
  fruitFrom: number;
  fruitTo: number;
  /** Fruit length along its axis. */
  fruitLength: number;
  fruitLengthV: number;
  /** Fruit radius (round / oblate: the equatorial radius). */
  fruitRadius: number;
  /** Ribs of an oblate fruit (pumpkin), 0 = smooth. */
  fruitRibs: number;
  fruitRibDepth: number;
  /** Pedicel (fruit stalk) length. */
  pedicel: number;
  pedicelRadius: number;
  /** Droop of the pedicel from the horizontal (hanging fruit). */
  fruitDroop: number;
  /** Calyx: sepals at the top of the fruit (tomato, pepper, eggplant). */
  calyx: number;
  calyxLength: number;
  /** Fruits in a truss (tomato: several fruits per pedicel). */
  truss: number;
  /** Ring vertices around a fruit at its equator. */
  fruitSides: number;
  /** Husk leaves around an ear (maize). */
  husk: number;
  /** How far the husks are peeled back from the ear tip: 0 closed over the ear, 1 opened to the middle. */
  huskOpen: number;
  /** Silk tuft length at the ear tip (maize). */
  silk: number;
  /** Kernel rows round the cob (12, 16, 24 or 32 — the cob is 96 vertices round); 0 for a smooth ear. */
  kernelRows: number;
  /** Kernels along each row. */
  kernels: number;
  /** Depth of the grooves between kernels as a fraction of the ear radius. */
  kernelDepth: number;

  // ---- Stalk (maize)
  /** Nodes along the stalk. */
  nodes: number;
  /** Tassel at the top (maize). */
  tassel: number;
  tasselBranches: number;
  tasselLength: number;

  // ---- Resolution & wind
  /** Ring spacing as a multiple of the circumferential vertex spacing. */
  ringAspect: number;
  collarRings: number;
  /** Whole-plant sway. */
  sway: number;
  /** Flex of branches, leaves and fruits about their base. */
  flex: number;
}

export const DEFAULT_VEGETABLE: VegetableParams = {
  form: 'bush',
  height: 1.4,
  heightV: 0.12,
  radius: 0.011,
  lean: 3,
  leanV: 3,
  curve: 6,
  vines: 3,
  stemSides: 12,
  vineWander: 25,
  branches: 7,
  branchesV: 2,
  branchFrom: 0.2,
  branchTo: 0.9,
  branchLength: 0.32,
  branchLengthV: 0.3,
  branchRadius: 0.55,
  branchAngle: 55,
  branchDroop: 25,
  leafShape: 'pinnate',
  leaves: 9,
  branchLeaves: 3,
  leafLength: 0.22,
  leafLengthV: 0.2,
  leafWidth: 0.55,
  leafThickness: 0.04,
  petiole: 0.25,
  petioleRadius: 0.0025,
  leafAngle: 50,
  leafDroop: 35,
  leafCup: 25,
  leaflets: 3,
  lobeDepth: 0.5,
  leafSides: 8,
  rosetteLeaves: 10,
  headLeaves: 0,
  headRadius: 0.1,
  headWrap: 0.8,
  rosetteSpread: 70,
  rootLength: 0,
  rootRadius: 0.02,
  rootShape: 'tapered',
  rootExposed: 0.1,
  fruitShape: 'round',
  fruits: 3,
  fruitsV: 1,
  fruitFrom: 0.3,
  fruitTo: 0.9,
  fruitLength: 0.06,
  fruitLengthV: 0.15,
  fruitRadius: 0.034,
  fruitRibs: 0,
  fruitRibDepth: 0.08,
  pedicel: 0.03,
  pedicelRadius: 0.003,
  fruitDroop: 70,
  calyx: 5,
  calyxLength: 0.018,
  truss: 3,
  fruitSides: 16,
  husk: 0,
  huskOpen: 0.5,
  silk: 0,
  kernelRows: 16,
  kernels: 30,
  kernelDepth: 0.12,
  nodes: 10,
  tassel: 0,
  tasselBranches: 12,
  tasselLength: 0.3,
  ringAspect: 1,
  collarRings: 1,
  sway: 0.6,
  flex: 0.5,
};

export function vegetableHeight(p: VegetableParams): number {
  switch (p.form) {
    case 'vine':
      return Math.max(0.1, 2 * p.fruitRadius + 0.02, p.leafLength * (1 + p.petiole));
    case 'rosette':
      return Math.max(0.08, p.height + p.leafLength * 0.7, p.headLeaves > 0 ? p.height + 2 * p.headRadius : 0);
    case 'stalk':
      return Math.max(0.3, p.height + (p.tassel ? p.tasselLength : 0));
    default:
      return Math.max(0.1, p.height);
  }
}

export function vegetableHabit(p: VegetableParams): string {
  const crop = p.fruitShape === 'ear' ? 'ears' : p.fruitShape === 'pod' ? 'pods' : 'fruits';
  switch (p.form) {
    case 'vine':
      return `${p.vines} vines · ${crop} on the soil`;
    case 'rosette':
      if (p.rootLength > 0) return `${p.rootShape === 'round' ? 'round' : 'tapered'} root · leaf rosette`;
      return p.headLeaves > 0 ? `${p.headLeaves}-leaf head` : `open rosette · ${p.rosetteLeaves} leaves`;
    case 'stalk':
      return `${p.nodes} nodes · ${p.fruits} ${crop}${p.tassel ? ' · tassel' : ''}`;
    default:
      return `${p.branches} branches · ${crop}${p.truss > 1 ? ' in trusses' : ''}`;
  }
}

export const VEGETABLE_PRESETS: { name: string; vegetable: Partial<VegetableParams> }[] = [
  {
    // Solanum lycopersicum, indeterminate vine tomato staked upright: pinnate leaves, trusses of round fruit.
    name: 'Tomato',
    vegetable: {},
  },
  {
    // Capsicum annuum: a stiff, forking bush with simple leaves and blocky pendulous fruit.
    name: 'Bell Pepper',
    vegetable: {
      height: 0.7,
      radius: 0.009,
      curve: 4,
      branches: 6,
      branchesV: 2,
      branchFrom: 0.35,
      branchTo: 0.9,
      branchLength: 0.4,
      branchRadius: 0.6,
      branchAngle: 45,
      branchDroop: 10,
      leafShape: 'simple',
      leaves: 8,
      branchLeaves: 4,
      leafLength: 0.11,
      leafWidth: 0.5,
      petiole: 0.35,
      petioleRadius: 0.0018,
      leafAngle: 55,
      leafDroop: 25,
      leafCup: 30,
      fruitShape: 'oblong',
      fruits: 2,
      fruitsV: 1,
      fruitFrom: 0.45,
      fruitTo: 0.95,
      fruitLength: 0.095,
      fruitLengthV: 0.12,
      fruitRadius: 0.04,
      fruitRibs: 4,
      fruitRibDepth: 0.1,
      pedicel: 0.03,
      pedicelRadius: 0.0035,
      fruitDroop: 80,
      calyx: 6,
      calyxLength: 0.012,
      truss: 1,
      fruitSides: 16,
      sway: 0.5,
      flex: 0.35,
    },
  },
  {
    // Capsicum annuum (chilli): smaller bush, many slender tapered pods.
    name: 'Chilli Pepper',
    vegetable: {
      height: 0.65,
      radius: 0.007,
      branches: 8,
      branchesV: 3,
      branchFrom: 0.3,
      branchTo: 0.92,
      branchLength: 0.38,
      branchRadius: 0.55,
      branchAngle: 50,
      branchDroop: 12,
      leafShape: 'simple',
      leaves: 9,
      branchLeaves: 4,
      leafLength: 0.08,
      leafWidth: 0.45,
      petiole: 0.4,
      petioleRadius: 0.0012,
      leafAngle: 55,
      leafDroop: 20,
      leafCup: 25,
      fruitShape: 'tapered',
      fruits: 4,
      fruitsV: 2,
      fruitFrom: 0.35,
      fruitTo: 0.97,
      fruitLength: 0.09,
      fruitLengthV: 0.2,
      fruitRadius: 0.011,
      pedicel: 0.03,
      pedicelRadius: 0.0015,
      fruitDroop: 75,
      calyx: 5,
      calyxLength: 0.007,
      truss: 1,
      fruitSides: 8,
      flex: 0.45,
    },
  },
  {
    // Solanum melongena: a sturdy branching bush with big soft leaves and heavy glossy fruit.
    name: 'Eggplant',
    vegetable: {
      height: 0.85,
      radius: 0.012,
      branches: 5,
      branchesV: 1,
      branchFrom: 0.3,
      branchTo: 0.85,
      branchLength: 0.45,
      branchRadius: 0.65,
      branchAngle: 50,
      branchDroop: 20,
      leafShape: 'lobed',
      leaves: 7,
      branchLeaves: 3,
      leafLength: 0.2,
      leafWidth: 0.6,
      petiole: 0.3,
      petioleRadius: 0.003,
      leafAngle: 60,
      leafDroop: 30,
      leafCup: 20,
      leaflets: 2,
      lobeDepth: 0.2,
      fruitShape: 'oblong',
      fruits: 1,
      fruitsV: 1,
      fruitFrom: 0.5,
      fruitTo: 0.9,
      fruitLength: 0.2,
      fruitLengthV: 0.15,
      fruitRadius: 0.05,
      pedicel: 0.04,
      pedicelRadius: 0.005,
      fruitDroop: 85,
      calyx: 5,
      calyxLength: 0.045,
      truss: 1,
      fruitSides: 16,
      sway: 0.4,
      flex: 0.3,
    },
  },
  {
    // Phaseolus vulgaris (dwarf / bush bean): trifoliate leaves, clusters of slender green pods.
    name: 'Bush Bean',
    vegetable: {
      height: 0.45,
      radius: 0.006,
      lean: 5,
      leanV: 5,
      branches: 6,
      branchesV: 2,
      branchFrom: 0.15,
      branchTo: 0.9,
      branchLength: 0.45,
      branchRadius: 0.6,
      branchAngle: 50,
      branchDroop: 20,
      leafShape: 'pinnate',
      leaves: 6,
      branchLeaves: 3,
      leafLength: 0.11,
      leafWidth: 0.7,
      petiole: 0.6,
      petioleRadius: 0.0015,
      leafAngle: 55,
      leafDroop: 30,
      leafCup: 15,
      leaflets: 1,
      fruitShape: 'pod',
      fruits: 5,
      fruitsV: 2,
      fruitFrom: 0.3,
      fruitTo: 0.95,
      fruitLength: 0.13,
      fruitLengthV: 0.2,
      fruitRadius: 0.006,
      pedicel: 0.025,
      pedicelRadius: 0.001,
      fruitDroop: 70,
      calyx: 0,
      truss: 2,
      fruitSides: 8,
      flex: 0.5,
    },
  },
  {
    // Abelmoschus esculentus: tall stem with palmately lobed leaves and upward-pointing ridged pods.
    name: 'Okra',
    vegetable: {
      height: 1.5,
      radius: 0.014,
      branches: 4,
      branchesV: 1,
      branchFrom: 0.25,
      branchTo: 0.6,
      branchLength: 0.22,
      branchRadius: 0.5,
      branchAngle: 45,
      branchDroop: 5,
      leafShape: 'lobed',
      leaves: 12,
      branchLeaves: 2,
      leafLength: 0.22,
      leafWidth: 0.95,
      petiole: 0.9,
      petioleRadius: 0.003,
      leafAngle: 45,
      leafDroop: 15,
      leafCup: 10,
      leaflets: 3,
      lobeDepth: 0.6,
      fruitShape: 'tapered',
      fruits: 6,
      fruitsV: 2,
      fruitFrom: 0.4,
      fruitTo: 0.95,
      fruitLength: 0.11,
      fruitLengthV: 0.2,
      fruitRadius: 0.012,
      fruitRibs: 5,
      fruitRibDepth: 0.14,
      pedicel: 0.025,
      pedicelRadius: 0.003,
      fruitDroop: -50,
      calyx: 0,
      truss: 1,
      fruitSides: 10,
      sway: 0.5,
      flex: 0.3,
    },
  },
  {
    // Cucurbita pepo: trailing vines, huge lobed leaves on tall petioles, ribbed orange fruit on the soil.
    name: 'Pumpkin',
    vegetable: {
      form: 'vine',
      height: 3,
      heightV: 0.25,
      radius: 0.014,
      vines: 3,
      vineWander: 30,
      stemSides: 10,
      leafShape: 'lobed',
      leaves: 9,
      leafLength: 0.26,
      leafLengthV: 0.15,
      leafWidth: 1.05,
      leafThickness: 0.03,
      petiole: 1.3,
      petioleRadius: 0.006,
      leafAngle: 20,
      leafDroop: 25,
      leafCup: -20,
      leaflets: 2,
      lobeDepth: 0.35,
      leafSides: 12,
      fruitShape: 'oblate',
      fruits: 1,
      fruitsV: 1,
      fruitFrom: 0.45,
      fruitTo: 0.85,
      fruitLength: 0.2,
      fruitLengthV: 0.15,
      fruitRadius: 0.16,
      fruitRibs: 12,
      fruitRibDepth: 0.07,
      pedicel: 0.06,
      pedicelRadius: 0.009,
      fruitDroop: 0,
      calyx: 0,
      truss: 1,
      fruitSides: 24,
      sway: 0.15,
      flex: 0.4,
    },
  },
  {
    // Cucurbita pepo (courgette / zucchini): a compact bush of enormous leaves and long fruits at the crown.
    name: 'Courgette',
    vegetable: {
      form: 'vine',
      height: 0.5,
      heightV: 0.2,
      radius: 0.02,
      vines: 3,
      vineWander: 15,
      stemSides: 10,
      leafShape: 'lobed',
      leaves: 4,
      leafLength: 0.3,
      leafLengthV: 0.12,
      leafWidth: 1.0,
      leafThickness: 0.03,
      petiole: 1.4,
      petioleRadius: 0.008,
      leafAngle: 15,
      leafDroop: 20,
      leafCup: -15,
      leaflets: 2,
      lobeDepth: 0.45,
      leafSides: 12,
      fruitShape: 'oblong',
      fruits: 2,
      fruitsV: 1,
      fruitFrom: 0.2,
      fruitTo: 0.7,
      fruitLength: 0.22,
      fruitLengthV: 0.25,
      fruitRadius: 0.03,
      pedicel: 0.04,
      pedicelRadius: 0.007,
      fruitDroop: 0,
      calyx: 0,
      truss: 1,
      fruitSides: 12,
      sway: 0.15,
      flex: 0.4,
    },
  },
  {
    // Cucumis sativus: slender trailing vines, palmate leaves, cylindrical fruit.
    name: 'Cucumber',
    vegetable: {
      form: 'vine',
      height: 1.8,
      heightV: 0.2,
      radius: 0.006,
      vines: 3,
      vineWander: 35,
      stemSides: 8,
      leafShape: 'lobed',
      leaves: 9,
      leafLength: 0.14,
      leafLengthV: 0.15,
      leafWidth: 1.0,
      petiole: 0.9,
      petioleRadius: 0.0025,
      leafAngle: 25,
      leafDroop: 25,
      leafCup: 10,
      leaflets: 2,
      lobeDepth: 0.3,
      leafSides: 10,
      fruitShape: 'oblong',
      fruits: 2,
      fruitsV: 1,
      fruitFrom: 0.35,
      fruitTo: 0.85,
      fruitLength: 0.17,
      fruitLengthV: 0.2,
      fruitRadius: 0.022,
      pedicel: 0.025,
      pedicelRadius: 0.003,
      fruitDroop: 0,
      calyx: 0,
      truss: 1,
      fruitSides: 12,
      sway: 0.15,
      flex: 0.4,
    },
  },
  {
    // Brassica oleracea var. capitata: outer leaves spread on the soil around a tight round head.
    name: 'Cabbage',
    vegetable: {
      form: 'rosette',
      height: 0.06,
      radius: 0.025,
      leafShape: 'simple',
      leafLength: 0.3,
      leafLengthV: 0.1,
      leafWidth: 0.85,
      leafThickness: 0.02,
      petiole: 0.15,
      leafDroop: 40,
      leafCup: 60,
      leafSides: 16,
      rosetteLeaves: 12,
      headLeaves: 12,
      headRadius: 0.11,
      headWrap: 0.85,
      rosetteSpread: 80,
      rootLength: 0,
      fruits: 0,
      sway: 0.05,
      flex: 0.3,
    },
  },
  {
    // Lactuca sativa (butterhead): a loose, softly cupped rosette.
    name: 'Lettuce',
    vegetable: {
      form: 'rosette',
      height: 0.04,
      radius: 0.015,
      leafShape: 'simple',
      leafLength: 0.16,
      leafLengthV: 0.12,
      leafWidth: 0.9,
      leafThickness: 0.02,
      petiole: 0.05,
      leafDroop: 45,
      leafCup: 70,
      leafSides: 16,
      rosetteLeaves: 14,
      headLeaves: 6,
      headRadius: 0.07,
      headWrap: 0.55,
      rosetteSpread: 75,
      rootLength: 0,
      fruits: 0,
      sway: 0.05,
      flex: 0.35,
    },
  },
  {
    // Daucus carota: an orange tapered root, shoulders showing, under a rosette of finely divided leaves.
    name: 'Carrot',
    vegetable: {
      form: 'rosette',
      height: 0.03,
      radius: 0.012,
      leafShape: 'pinnate',
      leafLength: 0.28,
      leafLengthV: 0.15,
      leafWidth: 0.35,
      leafThickness: 0.06,
      petiole: 0.7,
      petioleRadius: 0.002,
      leafDroop: 30,
      leafCup: 10,
      leaflets: 5,
      leafSides: 6,
      rosetteLeaves: 9,
      headLeaves: 0,
      rosetteSpread: 55,
      rootLength: 0.2,
      rootRadius: 0.018,
      rootShape: 'tapered',
      rootExposed: 0.1,
      fruits: 0,
      sway: 0.2,
      flex: 0.5,
    },
  },
  {
    // Beta vulgaris: a round crimson root half out of the soil, red-veined leaves on long stalks.
    name: 'Beetroot',
    vegetable: {
      form: 'rosette',
      height: 0.03,
      radius: 0.014,
      leafShape: 'simple',
      leafLength: 0.16,
      leafLengthV: 0.15,
      leafWidth: 0.6,
      leafThickness: 0.03,
      petiole: 0.8,
      petioleRadius: 0.003,
      leafDroop: 25,
      leafCup: 35,
      leafSides: 10,
      rosetteLeaves: 10,
      headLeaves: 0,
      rosetteSpread: 45,
      rootLength: 0.1,
      rootRadius: 0.04,
      rootShape: 'round',
      rootExposed: 0.4,
      fruits: 0,
      sway: 0.2,
      flex: 0.45,
    },
  },
  {
    // Zea mays: a single culm, strap leaves at every node, one or two husked ears and a tassel.
    name: 'Maize',
    vegetable: {
      form: 'stalk',
      height: 2.2,
      heightV: 0.12,
      radius: 0.016,
      lean: 2,
      leanV: 2,
      curve: 4,
      stemSides: 12,
      leafShape: 'strap',
      leaves: 12,
      leafLength: 0.8,
      leafLengthV: 0.12,
      leafWidth: 0.11,
      leafThickness: 0.03,
      petiole: 0,
      leafAngle: 40,
      leafDroop: 70,
      leafCup: 40,
      leafSides: 8,
      nodes: 12,
      fruitShape: 'ear',
      fruits: 2,
      fruitsV: 0,
      fruitFrom: 0.4,
      fruitTo: 0.55,
      fruitLength: 0.24,
      fruitLengthV: 0.1,
      fruitRadius: 0.028,
      pedicel: 0.03,
      pedicelRadius: 0.006,
      fruitDroop: -55,
      calyx: 0,
      truss: 1,
      fruitSides: 16,
      husk: 4,
      huskOpen: 0.6,
      silk: 0.07,
      kernelRows: 16,
      kernels: 32,
      kernelDepth: 0.12,
      tassel: 1,
      tasselBranches: 12,
      tasselLength: 0.35,
      sway: 0.7,
      flex: 0.45,
    },
  },
];

export const VEGETABLE_GROUPS: { label: string; names: string[] }[] = [
  { label: 'Vegetables · fruiting bushes', names: ['Tomato', 'Bell Pepper', 'Chilli Pepper', 'Eggplant', 'Bush Bean', 'Okra'] },
  { label: 'Vegetables · vines', names: ['Pumpkin', 'Courgette', 'Cucumber'] },
  { label: 'Vegetables · heads, roots & grain', names: ['Cabbage', 'Lettuce', 'Carrot', 'Beetroot', 'Maize'] },
];
