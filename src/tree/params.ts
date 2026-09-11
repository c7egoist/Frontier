/**
 * Tree parameters.
 *
 * The botanical part follows the parametric model of Weber & Penn,
 * "Creation and Rendering of Realistic Trees" (SIGGRAPH 1995) – the same model
 * behind Blender's Sapling / tree-gen add-ons and the ancestor of most DCC tree
 * generators. Per-level arrays are indexed by recursion level: 0 = trunk,
 * 1 = main limbs, 2 = branches, 3 = twigs (levels beyond 3 reuse index 3).
 *
 * Angles are in degrees, lengths are fractions of the parent length unless
 * stated otherwise. Y is up.
 */

import { EnvironmentParams, DEFAULT_SCATTER, scatterObstacles } from '../env/environment';

export type Level4<T> = [T, T, T, T];

export enum Shape {
  Conical = 0,
  Spherical = 1,
  Hemispherical = 2,
  Cylindrical = 3,
  TaperedCylindrical = 4,
  Flame = 5,
  InverseConical = 6,
  TendFlame = 7,
}

export const SHAPE_NAMES: Record<Shape, string> = {
  [Shape.Conical]: 'Conical',
  [Shape.Spherical]: 'Spherical',
  [Shape.Hemispherical]: 'Hemispherical',
  [Shape.Cylindrical]: 'Cylindrical',
  [Shape.TaperedCylindrical]: 'Tapered cylindrical',
  [Shape.Flame]: 'Flame',
  [Shape.InverseConical]: 'Inverse conical',
  [Shape.TendFlame]: 'Tend flame',
};

export interface BotanyParams {
  /** Crown envelope used for level-1 length distribution. */
  shape: Shape;
  /** Overall tree height in metres (± scaleV). */
  scale: number;
  scaleV: number;
  /** Recursion depth: 1..4 */
  levels: number;
  /** Trunk radius as a fraction of trunk length. */
  ratio: number;
  /** Exponent relating child radius to child/parent length ratio. */
  ratioPower: number;
  /** Exponential root flare of the trunk base (0 = none). */
  flare: number;
  /** Number of clones created at the base segment of the trunk (0 = none). */
  baseSplits: number;
  /** Fraction of each level's stem length without branches (bare base). */
  baseSize: Level4<number>;

  /** Relative length of stems at each level (level 0: fraction of `scale`). */
  length: Level4<number>;
  lengthV: Level4<number>;
  /** 0..1 linear taper to a point; 1..2 spherical end; 2..3 periodic. */
  taper: Level4<number>;
  /** Number of segments (curve resolution) per stem. */
  curveRes: Level4<number>;
  /** Total curvature along the stem (degrees). */
  curve: Level4<number>;
  /** If non-zero, the second half curves by this instead (S-shape). */
  curveBack: Level4<number>;
  curveV: Level4<number>;
  /** Random side-to-side bend per segment. */
  bendV: Level4<number>;
  /** Clones per segment (fractional = probabilistic). */
  segSplits: Level4<number>;
  splitAngle: Level4<number>;
  splitAngleV: Level4<number>;
  /** Angle between child and parent axis at emergence. Negative V = varies along stem. */
  downAngle: Level4<number>;
  downAngleV: Level4<number>;
  /** Phyllotactic rotation between successive children around the parent. Negative = alternate sides. */
  rotate: Level4<number>;
  rotateV: Level4<number>;
  /** Maximum number of children per stem at each level (index n = children created by level n-1). */
  branches: Level4<number>;
  /** 0 = alternate, 1 = opposite, >1 = whorled with (value+1) per whorl. */
  branchDist: Level4<number>;
  /** Per-level radius multiplier (artistic override). */
  radiusMod: Level4<number>;
  /** Vertical tropism (+ = grows up, - = droops). Applied to levels >= 2 fully, to lower levels horizontally. */
  attractionUp: number;
  /** Flattening of the fine growth towards the horizontal (0 = none, 1 = strong): flat-topped canopies (acacia). */
  flatten: number;
  /** Periodic swelling of the trunk (bamboo culm nodes): relative amplitude (0 = none). */
  nodeSwell: number;
  /** Spacing of the swellings as a fraction of the trunk length. */
  nodeSpacing: number;
  /** Leaves per twig (proxy quads). 0 disables. */
  leaves: number;
  leafScale: number;
  leafScaleX: number;
}

export interface MeshParams {
  /** Radial segments of the trunk ring (even, 6..48). Children derive from it. */
  trunkRadialSegments: number;
  /** Minimum radial segments for any stem (even, >= 4). Forces taller windows for thin children. */
  minRadialSegments: number;
  /** Ring stations per curve segment at level 0..3. */
  ringsPerSegment: Level4<number>;
  /** Hole width relative to child diameter (branch collar). */
  collarScale: number;
  /** Distance of the child's first full ring from the parent surface, in child radii. */
  collarLength: number;
  /** 0 = parents keep their radius past a junction (Weber-Penn), 1 = cross-section area is conserved (pipe model / da Vinci rule). */
  forkRadiusConservation: number;
  /** Intermediate rings inserted between a junction window and the child's first ring. */
  collarRings: number;
  /** 0 = straight chamfer between window and child ring, 1 = tangent-continuous fillet. */
  collarFillet: number;
  /** Mitre of the child's first ring towards the parent surface: 0 = perpendicular to the child, 1 = parallel to the parent surface. */
  collarMitre: number;
  /** Minimum stem radius in metres (avoids zero-radius tips). */
  minRadius: number;
  /** Vertices around a primary root where it leaves the trunk (even, >= 6). */
  rootRadialSegments: number;
  /** Root buttress lobes at the trunk base (used when the root system is disabled; otherwise one lobe per root). */
  rootLobes: number;
  rootLobeAmplitude: number;
  rootLobeHeight: number;
  /** Cap stem tips with quads (kite cap) instead of leaving them open. */
  capTips: boolean;
  /** Skip stems thinner than this in metres (LOD/cleanup). */
  cullRadius: number;
}

/**
 * Root system. Roots are grown by an environment-aware turtle (see
 * `roots.ts`): they leave the trunk base, follow the ground and climb onto or
 * skirt the objects placed around the tree, then dive underground at the tip.
 * Lengths are fractions of the tree scale; radii are fractions of the trunk's
 * nominal radius.
 */
export interface RootParams {
  enabled: boolean;
  /** Primary roots leaving the trunk base. */
  count: number;
  /** Primary root length as a fraction of the tree scale (metres = scale x length). */
  length: number;
  lengthV: number;
  /** Base radius of a primary root as a fraction of the trunk's nominal radius. */
  radius: number;
  radiusV: number;
  /** Taper exponent along the root (1 = linear to a point, <1 stays thick for longer). */
  taper: number;
  /** Height of the root axis above the ground where it leaves the trunk, in root radii. */
  emergeHeight: number;
  /** Initial pitch below the horizontal at the trunk, degrees. */
  descent: number;
  /** How much of a surface root shows: 0 = flush with the ground, 0.5 = half buried, 1 = resting on top. */
  exposure: number;
  /** Lateral roots per primary root. */
  laterals: number;
  /** Lateral base radius relative to the parent's local radius. */
  lateralRadius: number;
  /** Lateral length relative to the parent's remaining length. */
  lateralLength: number;
  /** Probability that a primary root forks into two. */
  forks: number;
  /** Horizontal meander (0 = straight, 1 = strongly winding). */
  wander: number;
  /** Objects up to this many root diameters tall are climbed over; taller ones are skirted (climbed part-way). */
  climb: number;
  /** Pull of the roots towards nearby objects (0 = indifferent, 1 = seeks them out). */
  attraction: number;
  /** How deeply roots press into the objects they follow (0 = rest on top, 1 = sunk in). */
  grip: number;
  /** Fraction of the length after which the tip dives underground. */
  dive: number;
}

export const DEFAULT_ROOTS: RootParams = {
  enabled: true,
  count: 5,
  length: 0.2,
  lengthV: 0.06,
  radius: 0.42,
  radiusV: 0.12,
  taper: 0.85,
  emergeHeight: 0.6,
  descent: 24,
  exposure: 0.4,
  laterals: 2,
  lateralRadius: 0.5,
  lateralLength: 0.5,
  forks: 0.5,
  wander: 0.5,
  climb: 3,
  attraction: 0.6,
  grip: 0.5,
  dive: 0.75,
};

export interface TreeParams {
  name: string;
  seed: number;
  botany: BotanyParams;
  mesh: MeshParams;
  roots: RootParams;
  environment: EnvironmentParams;
}

export const DEFAULT_MESH: MeshParams = {
  trunkRadialSegments: 24,
  minRadialSegments: 6,
  ringsPerSegment: [3, 2, 2, 1],
  collarScale: 1.3,
  collarLength: 1.2,
  forkRadiusConservation: 0.6,
  collarRings: 1,
  collarFillet: 0.7,
  collarMitre: 0.5,
  minRadius: 0.004,
  rootRadialSegments: 12,
  rootLobes: 5,
  rootLobeAmplitude: 0.35,
  rootLobeHeight: 0.08,
  capTips: true,
  cullRadius: 0.0,
};

const L = <T>(a: T, b: T, c: T, d: T): Level4<T> => [a, b, c, d];

export const DEFAULT_BOTANY: BotanyParams = {
  shape: Shape.TendFlame,
  scale: 13,
  scaleV: 3,
  levels: 3,
  ratio: 0.015,
  ratioPower: 1.2,
  flare: 0.6,
  baseSplits: 0,
  baseSize: L(0.3, 0.02, 0.02, 0.02),
  length: L(1, 0.3, 0.6, 0),
  lengthV: L(0, 0, 0, 0),
  taper: L(1, 1, 1, 1),
  curveRes: L(5, 5, 3, 1),
  curve: L(0, -40, -40, 0),
  curveBack: L(0, 0, 0, 0),
  curveV: L(20, 50, 75, 0),
  bendV: L(0, 50, 0, 0),
  segSplits: L(0, 0, 0, 0),
  splitAngle: L(40, 0, 0, 0),
  splitAngleV: L(5, 0, 0, 0),
  downAngle: L(0, 60, 45, 45),
  downAngleV: L(0, -50, 10, 10),
  rotate: L(0, 140, 140, 77),
  rotateV: L(0, 0, 0, 0),
  branches: L(1, 50, 30, 10),
  branchDist: L(0, 0, 0, 0),
  radiusMod: L(1, 1, 1, 1),
  attractionUp: 0.5,
  flatten: 0,
  nodeSwell: 0,
  nodeSpacing: 0.05,
  leaves: 25,
  leafScale: 0.17,
  leafScaleX: 1,
};

export function cloneParams(p: TreeParams): TreeParams {
  return JSON.parse(JSON.stringify(p)) as TreeParams;
}

/** Nominal trunk radius at the base (metres), flare included. */
export function trunkBaseRadius(b: BotanyParams): number {
  const nominal = b.scale * b.length[0] * b.ratio * b.radiusMod[0];
  return nominal * (b.flare * 0.99 + 1);
}

/** Primary root length in metres. */
export function rootReach(p: { botany: BotanyParams; roots: RootParams }): number {
  return p.botany.scale * p.roots.length;
}

/** Scatter parameters proportioned to a tree: objects land within root reach. */
export function scatterFor(p: { botany: BotanyParams; roots: RootParams }, seed = DEFAULT_SCATTER.seed, count = DEFAULT_SCATTER.count): EnvironmentParams['scatter'] {
  const reach = Math.max(0.5, rootReach(p));
  return {
    ...DEFAULT_SCATTER,
    seed,
    count,
    minDistance: 0.08 * reach,
    maxDistance: 0.42 * reach,
    minSize: 0.16 * reach,
    maxSize: 0.32 * reach,
  };
}

export function defaultEnvironment(p: { botany: BotanyParams; roots: RootParams }): EnvironmentParams {
  const scatter = scatterFor(p);
  return { enabled: true, scatter, obstacles: scatterObstacles(scatter, trunkBaseRadius(p.botany)) };
}

function preset(name: string, botany: Partial<BotanyParams>, mesh: Partial<MeshParams> = {}, roots: Partial<RootParams> = {}): TreeParams {
  const b = { ...DEFAULT_BOTANY, ...botany };
  const r = { ...DEFAULT_ROOTS, ...roots };
  return {
    name,
    seed: 1,
    botany: b,
    mesh: { ...DEFAULT_MESH, ...mesh },
    roots: r,
    environment: defaultEnvironment({ botany: b, roots: r }),
  };
}

/**
 * Presets. Botanical values are based on the species tables published in
 * Weber & Penn (1995) and tuned for the welded mesher.
 */
export const PRESETS: TreeParams[] = [
  preset('English Oak', {
    shape: Shape.Hemispherical,
    scale: 16,
    scaleV: 2,
    levels: 4,
    ratio: 0.022,
    ratioPower: 1.35,
    flare: 1.1,
    baseSplits: 0,
    baseSize: L(0.22, 0.05, 0.02, 0.02),
    length: L(1, 0.55, 0.45, 0.3),
    lengthV: L(0, 0.08, 0.08, 0.05),
    taper: L(1, 1, 1, 1),
    curveRes: L(10, 10, 6, 3),
    curve: L(0, 25, 10, 0),
    curveBack: L(0, -35, 0, 0),
    curveV: L(60, 140, 120, 80),
    bendV: L(20, 90, 60, 0),
    segSplits: L(0.35, 0.45, 0.25, 0),
    splitAngle: L(38, 40, 40, 0),
    splitAngleV: L(8, 10, 10, 0),
    downAngle: L(0, 48, 45, 45),
    downAngleV: L(0, -30, 20, 20),
    rotate: L(0, 120, 140, 140),
    rotateV: L(0, 30, 30, 20),
    branches: L(1, 14, 22, 14),
    branchDist: L(0, 0, 0, 0),
    attractionUp: 0.35,
    leaves: 12,
    leafScale: 0.14,
    leafScaleX: 0.8,
  }, {}, { count: 6, radius: 0.45, length: 0.22, laterals: 2, forks: 0.6 }),

  preset('Quaking Aspen', {
    shape: Shape.TendFlame,
    scale: 13,
    scaleV: 3,
    levels: 3,
    ratio: 0.015,
    ratioPower: 1.2,
    flare: 0.6,
    baseSize: L(0.3, 0.02, 0.02, 0.02),
    length: L(1, 0.3, 0.6, 0),
    lengthV: L(0, 0, 0.1, 0),
    curveRes: L(6, 5, 4, 1),
    curve: L(0, -40, -60, 0),
    curveV: L(20, 100, 100, 0),
    bendV: L(0, 50, 0, 0),
    segSplits: L(0, 0, 0, 0),
    splitAngle: L(40, 0, 0, 0),
    splitAngleV: L(5, 0, 0, 0),
    downAngle: L(0, 60, 60, 45),
    downAngleV: L(0, -50, 20, 30),
    rotate: L(0, 140, 140, 77),
    branches: L(1, 45, 26, 1),
    attractionUp: 0.5,
    leaves: 30,
    leafScale: 0.17,
  }, {}, { count: 4, radius: 0.38, length: 0.16, laterals: 1, forks: 0.3 }),

  preset('Black Tupelo', {
    shape: Shape.TaperedCylindrical,
    scale: 23,
    scaleV: 5,
    levels: 4,
    ratio: 0.015,
    ratioPower: 1.3,
    flare: 1,
    baseSize: L(0.2, 0.02, 0.02, 0.02),
    length: L(1, 0.3, 0.6, 0.2),
    lengthV: L(0, 0.05, 0.1, 0),
    curveRes: L(10, 10, 8, 2),
    curve: L(0, 0, -10, 0),
    curveV: L(40, 90, 150, 0),
    bendV: L(0, 100, 0, 0),
    downAngle: L(0, 60, 40, 45),
    downAngleV: L(0, -40, 10, 10),
    rotate: L(0, 140, 140, 140),
    rotateV: L(0, 60, 50, 0),
    branches: L(1, 55, 20, 12),
    attractionUp: 0.5,
    leaves: 14,
    leafScale: 0.2,
  }, {}, { count: 5, radius: 0.4, length: 0.16 }),

  preset('California Black Oak', {
    shape: Shape.Hemispherical,
    scale: 10,
    scaleV: 2,
    levels: 3,
    ratio: 0.018,
    ratioPower: 1.25,
    flare: 1.2,
    baseSize: L(0.05, 0.02, 0.02, 0.02),
    length: L(1, 0.8, 0.3, 0.4),
    lengthV: L(0, 0.1, 0.05, 0),
    taper: L(0.95, 1, 1, 1),
    curveRes: L(8, 10, 4, 1),
    curve: L(0, 40, 0, 0),
    curveBack: L(0, -70, 0, 0),
    curveV: L(90, 150, 30, 0),
    bendV: L(0, 100, 0, 0),
    segSplits: L(0.4, 0.2, 0.1, 0),
    splitAngle: L(10, 10, 10, 0),
    splitAngleV: L(0, 10, 10, 0),
    downAngle: L(0, 30, 45, 45),
    downAngleV: L(0, -30, 10, 10),
    rotate: L(0, 80, 140, 140),
    rotateV: L(0, 20, 20, 20),
    branches: L(1, 24, 60, 0),
    attractionUp: 0.8,
    leaves: 20,
    leafScale: 0.2,
    leafScaleX: 0.66,
  }, {}, { count: 6, radius: 0.46, length: 0.26, forks: 0.6 }),

  preset('Silver Birch', {
    shape: Shape.Cylindrical,
    scale: 18,
    scaleV: 4,
    levels: 3,
    ratio: 0.013,
    ratioPower: 1.5,
    flare: 0.5,
    baseSize: L(0.3, 0.1, 0.02, 0.02),
    length: L(1, 0.3, 0.4, 0),
    lengthV: L(0, 0.05, 0.2, 0),
    curveRes: L(10, 8, 6, 0),
    curve: L(0, 0, -10, 0),
    curveV: L(50, 150, 200, 0),
    bendV: L(0, 100, 0, 0),
    segSplits: L(0, 0.3, 0, 0),
    splitAngle: L(15, 10, 0, 0),
    downAngle: L(0, 50, 40, 45),
    downAngleV: L(0, -20, 10, 10),
    rotate: L(0, 140, 140, 140),
    rotateV: L(0, 60, 50, 0),
    branches: L(1, 28, 40, 0),
    attractionUp: -2,
    leaves: 40,
    leafScale: 0.15,
  }, {}, { count: 4, radius: 0.36, length: 0.14, laterals: 1, forks: 0.3 }),

  preset('Weeping Willow', {
    shape: Shape.TaperedCylindrical,
    scale: 15,
    scaleV: 3,
    levels: 4,
    ratio: 0.03,
    ratioPower: 1.2,
    flare: 0.75,
    baseSplits: 2,
    baseSize: L(0.05, 0.3, 0.05, 0.05),
    length: L(1, 0.35, 2.0, 0.1),
    lengthV: L(0, 0.1, 0, 0),
    curveRes: L(8, 12, 12, 2),
    curve: L(0, 40, 0, 0),
    curveBack: L(25, 0, 0, 0),
    curveV: L(90, 200, 0, 0),
    bendV: L(0, 160, 0, 0),
    segSplits: L(0.2, 0.2, 0.1, 0),
    splitAngle: L(40, 30, 45, 0),
    splitAngleV: L(5, 10, 20, 0),
    downAngle: L(0, 40, 30, 20),
    downAngleV: L(0, 10, 10, 10),
    rotate: L(0, -120, -120, 140),
    rotateV: L(0, 30, 30, 0),
    branches: L(1, 14, 18, 40),
    radiusMod: L(1, 1, 0.1, 1),
    attractionUp: -3,
    leaves: 15,
    leafScale: 0.13,
    leafScaleX: 0.2,
  }, {}, { count: 6, radius: 0.42, length: 0.22, laterals: 2 }),

  preset('Scots Pine', {
    shape: Shape.Conical,
    scale: 22,
    scaleV: 4,
    levels: 3,
    ratio: 0.014,
    ratioPower: 1.4,
    flare: 0.4,
    baseSize: L(0.45, 0.05, 0.02, 0.02),
    length: L(1, 0.28, 0.35, 0),
    lengthV: L(0, 0.06, 0.1, 0),
    curveRes: L(10, 6, 4, 1),
    curve: L(0, -25, 0, 0),
    curveBack: L(0, 0, 0, 0),
    curveV: L(30, 60, 90, 0),
    bendV: L(0, 40, 0, 0),
    segSplits: L(0, 0, 0, 0),
    downAngle: L(0, 70, 55, 45),
    downAngleV: L(0, -30, 20, 10),
    rotate: L(0, 140, 140, 140),
    rotateV: L(0, 25, 30, 0),
    branches: L(1, 42, 24, 0),
    branchDist: L(0, 3, 0, 0),
    attractionUp: 1.5,
    leaves: 60,
    leafScale: 0.1,
    leafScaleX: 0.25,
  }, {}, { count: 4, radius: 0.4, length: 0.13, laterals: 1, forks: 0.25 }),

  preset('Coast Redwood', {
    // Sequoia sempervirens: a straight, massively buttressed column with short
    // horizontal limbs high up; the lower trunk is bare.
    shape: Shape.TaperedCylindrical,
    scale: 70,
    scaleV: 15,
    levels: 3,
    ratio: 0.017,
    ratioPower: 1.5,
    flare: 1.6,
    baseSplits: 0,
    baseSize: L(0.4, 0.05, 0.02, 0.02),
    length: L(1, 0.12, 0.45, 0),
    lengthV: L(0, 0.04, 0.1, 0),
    taper: L(1, 1, 1, 1),
    curveRes: L(12, 5, 4, 1),
    curve: L(0, -12, 0, 0),
    curveBack: L(0, 0, 0, 0),
    curveV: L(8, 40, 80, 0),
    bendV: L(0, 30, 20, 0),
    segSplits: L(0, 0, 0, 0),
    splitAngle: L(0, 0, 0, 0),
    splitAngleV: L(0, 0, 0, 0),
    downAngle: L(0, 80, 50, 45),
    downAngleV: L(0, -25, 15, 10),
    rotate: L(0, 140, 140, 140),
    rotateV: L(0, 30, 30, 0),
    branches: L(1, 90, 26, 0),
    branchDist: L(0, 0, 0, 0),
    radiusMod: L(1, 0.85, 1, 1),
    attractionUp: 0.8,
    leaves: 40,
    leafScale: 0.14,
    leafScaleX: 0.35,
  }, { rootLobeAmplitude: 0.5, rootLobeHeight: 0.06 }, { count: 7, radius: 0.36, length: 0.09, laterals: 1, forks: 0.4, emergeHeight: 0.7 }),

  preset('Norway Spruce', {
    // Picea abies: narrow spire, whorled limbs that droop and sweep up at the
    // tip, pendulous secondaries.
    shape: Shape.Conical,
    scale: 32,
    scaleV: 6,
    levels: 3,
    ratio: 0.012,
    ratioPower: 1.6,
    flare: 0.5,
    baseSplits: 0,
    baseSize: L(0.12, 0.02, 0.02, 0.02),
    length: L(1, 0.24, 0.3, 0),
    lengthV: L(0, 0.04, 0.08, 0),
    taper: L(1, 1, 1, 1),
    curveRes: L(10, 6, 4, 1),
    curve: L(0, 22, -25, 0),
    curveBack: L(0, -55, 0, 0),
    curveV: L(6, 30, 60, 0),
    bendV: L(0, 15, 0, 0),
    segSplits: L(0, 0, 0, 0),
    splitAngle: L(0, 0, 0, 0),
    splitAngleV: L(0, 0, 0, 0),
    downAngle: L(0, 78, 65, 45),
    downAngleV: L(0, -20, 20, 10),
    rotate: L(0, 0, 140, 140),
    rotateV: L(0, 20, 20, 0),
    branches: L(1, 170, 26, 0),
    branchDist: L(0, 5, 0, 0),
    radiusMod: L(1, 0.9, 1, 1),
    attractionUp: -1.6,
    leaves: 60,
    leafScale: 0.09,
    leafScaleX: 0.3,
  }, {}, { count: 5, radius: 0.36, length: 0.14, laterals: 1, forks: 0.3 }),

  preset('Bamboo', {
    // A single culm: straight, hollow-looking cane with swollen nodes, no
    // taper to speak of, short whorled branchlets in the upper half, tip nods.
    shape: Shape.Cylindrical,
    scale: 11,
    scaleV: 3,
    levels: 3,
    ratio: 0.0075,
    ratioPower: 1.0,
    flare: 0.05,
    baseSplits: 0,
    baseSize: L(0.45, 0.1, 0.02, 0.02),
    length: L(1, 0.14, 0.4, 0),
    lengthV: L(0, 0.05, 0.1, 0),
    taper: L(0.6, 1, 1, 1),
    curveRes: L(14, 4, 3, 1),
    curve: L(0, 15, 10, 0),
    curveBack: L(45, 0, 0, 0),
    curveV: L(10, 30, 40, 0),
    bendV: L(0, 10, 0, 0),
    segSplits: L(0, 0, 0, 0),
    splitAngle: L(0, 0, 0, 0),
    splitAngleV: L(0, 0, 0, 0),
    downAngle: L(0, 42, 40, 40),
    downAngleV: L(0, 10, 10, 10),
    rotate: L(0, 0, 140, 140),
    rotateV: L(0, 25, 20, 0),
    branches: L(1, 36, 8, 0),
    branchDist: L(0, 2, 0, 0),
    radiusMod: L(1, 0.7, 1, 1),
    attractionUp: 0.6,
    nodeSwell: 0.12,
    nodeSpacing: 0.045,
    leaves: 30,
    leafScale: 0.12,
    leafScaleX: 0.15,
  }, { rootLobeAmplitude: 0, rootLobeHeight: 0.02, ringsPerSegment: [2, 2, 2, 1] }, { enabled: false, count: 0, radius: 0.3, length: 0.05, laterals: 0, forks: 0 }),

  preset('Umbrella Thorn', {
    // Vachellia (Acacia) tortilis of the savanna: a short trunk splitting low
    // into a few leaning stems, limbs rising then levelling off, and the
    // finer growth spread into a wide, flat canopy.
    shape: Shape.InverseConical,
    scale: 8,
    scaleV: 1.5,
    levels: 4,
    ratio: 0.032,
    ratioPower: 1.2,
    flare: 0.7,
    baseSplits: 2,
    baseSize: L(0.3, 0.1, 0.05, 0.02),
    length: L(1, 0.85, 0.5, 0.3),
    lengthV: L(0, 0.1, 0.1, 0.05),
    taper: L(1, 1, 1, 1),
    curveRes: L(6, 8, 6, 3),
    curve: L(0, 5, 15, 5),
    curveBack: L(0, 45, 0, 0),
    curveV: L(40, 80, 100, 80),
    bendV: L(0, 50, 60, 20),
    segSplits: L(0.6, 0.55, 0.3, 0),
    splitAngle: L(60, 42, 40, 0),
    splitAngleV: L(10, 10, 10, 0),
    downAngle: L(0, 62, 65, 55),
    downAngleV: L(0, -20, 15, 15),
    rotate: L(0, 140, 140, 140),
    rotateV: L(0, 40, 40, 0),
    branches: L(1, 20, 16, 12),
    branchDist: L(0, 0, 0, 0),
    radiusMod: L(1, 1, 1, 1),
    attractionUp: -0.3,
    flatten: 0.9,
    leaves: 20,
    leafScale: 0.08,
    leafScaleX: 0.5,
  }, {}, { count: 5, radius: 0.42, length: 0.24, laterals: 2, forks: 0.5 }),

  preset('Baobab', {
    // Adansonia: a hugely swollen, bottle-shaped trunk with a compact tangle
    // of thick, quickly tapering branches on top ("the upside-down tree").
    shape: Shape.Hemispherical,
    scale: 16,
    scaleV: 3,
    levels: 4,
    ratio: 0.15,
    ratioPower: 1.0,
    flare: 0.25,
    baseSplits: 0,
    baseSize: L(0.6, 0.15, 0.05, 0.02),
    length: L(1, 0.34, 0.5, 0.4),
    lengthV: L(0, 0.08, 0.1, 0.05),
    taper: L(0.72, 1, 1, 1),
    curveRes: L(8, 6, 5, 3),
    curve: L(0, 15, 20, 10),
    curveBack: L(0, 0, 0, 0),
    curveV: L(15, 120, 140, 100),
    bendV: L(0, 40, 50, 20),
    segSplits: L(0, 0.5, 0.4, 0),
    splitAngle: L(0, 45, 45, 0),
    splitAngleV: L(0, 10, 10, 0),
    downAngle: L(0, 42, 50, 50),
    downAngleV: L(0, -20, 15, 15),
    rotate: L(0, 140, 140, 140),
    rotateV: L(0, 40, 40, 0),
    branches: L(1, 16, 10, 6),
    branchDist: L(0, 0, 0, 0),
    radiusMod: L(1, 0.32, 1.1, 1.3),
    attractionUp: 0.9,
    leaves: 10,
    leafScale: 0.14,
    leafScaleX: 0.6,
  }, { trunkRadialSegments: 32, rootLobeAmplitude: 0.2, rootLobeHeight: 0.05 }, { count: 6, radius: 0.13, length: 0.3, laterals: 1, forks: 0.4, emergeHeight: 0.5 }),

  preset('Japanese Maple', {
    shape: Shape.Spherical,
    scale: 6,
    scaleV: 1,
    levels: 4,
    ratio: 0.025,
    ratioPower: 1.5,
    flare: 0.6,
    baseSplits: 2,
    baseSize: L(0.1, 0.25, 0.02, 0.02),
    length: L(1, 0.7, 0.35, 0.3),
    lengthV: L(0, 0.05, 0.05, 0),
    curveRes: L(6, 6, 4, 2),
    curve: L(0, 0, 0, 0),
    curveV: L(200, 100, 100, 60),
    bendV: L(0, 50, 0, 0),
    segSplits: L(1.2, 1.2, 0.3, 0),
    splitAngle: L(50, 50, 45, 0),
    splitAngleV: L(5, 5, 5, 0),
    downAngle: L(0, 50, 50, 45),
    downAngleV: L(0, 5, 5, 10),
    rotate: L(0, 140, 140, 77),
    branches: L(1, 6, 16, 8),
    attractionUp: 0.3,
    leaves: 24,
    leafScale: 0.2,
  }, {}, { count: 5, radius: 0.44, length: 0.28, laterals: 2, forks: 0.5 }),
];

export function getPreset(name: string): TreeParams {
  const p = PRESETS.find((x) => x.name === name) ?? PRESETS[0];
  return cloneParams(p);
}
