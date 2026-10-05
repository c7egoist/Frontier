import type { Vec3 } from './vec';

// ---------------------------------------------------------------------------
// Project model — Road & Bridge Studio
// Spline nodes live in world space (X right, Y up, Z toward viewer).
// ---------------------------------------------------------------------------

export type Point3D = [number, number, number];

export interface SplineNode {
  id: string;
  /** World position [x, yUp, z]. */
  position: Point3D;
  /** Bezier handle toward the previous node. */
  handleIn: Point3D;
  /** Bezier handle toward the next node. */
  handleOut: Point3D;
}

export type RoadPreset = 'single' | 'two-lane' | 'three-lane' | 'four-lane' | 'highway' | 'custom';

export interface CrossSection {
  preset: RoadPreset;
  /** Carriageway width (m). */
  width: number;
  /** Lane count used for divider markings. */
  lanes: number;
  paveLeft: number;
  paveRight: number;
  curbHeight: number;
  /** Pavement crossfall away from carriageway (0-0.08). */
  crossfall: number;
  showCenterLine: boolean;
  showEdgeLines: boolean;
  showLaneLines: boolean;
}

export type BridgeType = 'beam' | 'arch';
export type Superstructure = 'slab' | 'igirder' | 'box';
export type PierStyle = 'single' | 'bent' | 'wall' | 'hammerhead' | 'portal';
export type ColumnShape = 'square' | 'round';
export type Foundation = 'spread' | 'piles';
export type Abutment = 'cantilever' | 'stub' | 'spill';
export type ParapetStyle = 'rail' | 'parapet';

export interface BridgeSettings {
  enabled: boolean;
  type: BridgeType;
  /** Beam superstructure: solid slab, I-girders or box girder. */
  superstructure: Superstructure;
  /** Deck slab thickness below the wearing surface. */
  deckDepth: number;
  /** Longitudinal girder depth below the deck soffit. */
  girderDepth: number;
  /** Transverse diaphragms between girders at supports. */
  diaphragms: boolean;
  pierSpacing: number;
  pierStyle: PierStyle;
  /** Square or round pier columns. */
  columnShape: ColumnShape;
  /** Pier column diameter / wall thickness (minimum — grows with height). */
  pierSize: number;
  foundation: Foundation;
  abutment: Abutment;
  /** Arch rise for arch bridges. */
  archRise: number;
  parapet: ParapetStyle;
  parapetHeight: number;
}

export interface RailSettings {
  enabled: boolean;
  height: number;
  thickness: number;
  posts: boolean;
  postSpacing: number;
}

export interface Spline {
  id: string;
  name: string;
  nodes: SplineNode[];
  closed: boolean;
  visible: boolean;
  color: string;
  cross: CrossSection;
  bridge: BridgeSettings;
  rails: RailSettings;
}

export interface JunctionSettings {
  /** Trim-back distance from the node + fillet scale. */
  cornerRadius: number;
  /** Segments per corner arc. */
  filletSteps: number;
  /** Superstructure / tub depth below the surface. */
  depth: number;
  /** Span superstructure side inset. */
  inset: number;
}

export interface SceneSettings {
  groundZ: number;
  showGround: boolean;
  waterLevel: number;
  showWater: boolean;
  showGrid: boolean;
  drawHeight: number;
}

export interface Project {
  version: 1;
  name: string;
  splines: Spline[];
  junctions: JunctionSettings;
  scene: SceneSettings;
}

export type Mode = 'select' | 'draw' | 'pan';

export type Selection =
  | { kind: 'scene' }
  | { kind: 'spline'; splineId: string }
  | { kind: 'node'; splineId: string; nodeId: string }
  | { kind: 'junction'; junctionId: string };

export const generateId = () => Math.random().toString(36).substring(2, 9);

// --- palette: semantic accents for spline rows / inspector icons ------------
export const SPLINE_COLORS = [
  '#a8bbeb', // periwinkle
  '#93c779', // foliage
  '#e8b65f', // amber
  '#75c7df', // water
  '#d5a4c4', // orchid
  '#d6a078', // terrain
  '#b3b3d5', // lavender grey
  '#72c8b3', // mint
];

export const PRESET_DEFS: Record<Exclude<RoadPreset, 'custom'>, { label: string; width: number; lanes: number }> = {
  single: { label: 'Single carriageway', width: 6, lanes: 1 },
  'two-lane': { label: '2-lane road', width: 8, lanes: 2 },
  'three-lane': { label: '3-lane road', width: 12, lanes: 3 },
  'four-lane': { label: '4-lane road', width: 16, lanes: 4 },
  highway: { label: 'Highway', width: 20, lanes: 4 },
};

export function defaultCross(preset: RoadPreset = 'two-lane'): CrossSection {
  const def = preset === 'custom' ? PRESET_DEFS['two-lane'] : PRESET_DEFS[preset];
  return {
    preset,
    width: def.width,
    lanes: def.lanes,
    paveLeft: 2,
    paveRight: 2,
    curbHeight: 0.15,
    crossfall: 0.02,
    showCenterLine: true,
    showEdgeLines: true,
    showLaneLines: true,
  };
}

export function defaultBridge(): BridgeSettings {
  return {
    enabled: false,
    type: 'beam',
    superstructure: 'igirder',
    deckDepth: 0.35,
    girderDepth: 1.1,
    diaphragms: true,
    pierSpacing: 12,
    pierStyle: 'bent',
    columnShape: 'round',
    pierSize: 0.7,
    foundation: 'spread',
    abutment: 'cantilever',
    archRise: 4,
    parapet: 'parapet',
    parapetHeight: 1.1,
  };
}

export function defaultRails(): RailSettings {
  return { enabled: true, height: 0.8, thickness: 0.2, posts: true, postSpacing: 2 };
}

export function makeSpline(name: string, color: string): Spline {
  return {
    id: generateId(),
    name,
    nodes: [],
    closed: false,
    visible: true,
    color,
    cross: defaultCross('two-lane'),
    bridge: defaultBridge(),
    rails: defaultRails(),
  };
}

export function makeNode(position: Point3D): SplineNode {
  return {
    id: generateId(),
    position: [...position] as Point3D,
    handleIn: [...position] as Point3D,
    handleOut: [...position] as Point3D,
  };
}

export function defaultProject(): Project {
  return {
    version: 1,
    name: 'Untitled Crossing',
    splines: [],
    junctions: { cornerRadius: 7, filletSteps: 10, depth: 1.5, inset: 1.5 },
    scene: { groundZ: 0, showGround: true, waterLevel: -1.2, showWater: true, showGrid: true, drawHeight: 0.05 },
  };
}

export function topologyName(arms: number): string {
  if (arms <= 1) return 'Dead end';
  if (arms === 2) return 'Straight / curve';
  if (arms === 3) return '3-way intersection';
  if (arms === 4) return '4-way intersection';
  return `${arms}-way intersection`;
}

// ---------------------------------------------------------------------------
// Demo scene — shows off junctions, curved pavement/curbs and a beam bridge.
// ---------------------------------------------------------------------------

function demoNode(x: number, y: number, z: number, inDx = 0, inDz = 0, outDx = 0, outDz = 0): SplineNode {
  return {
    id: generateId(),
    position: [x, y, z],
    handleIn: [x + inDx, y, z + inDz],
    handleOut: [x + outDx, y, z + outDz],
  };
}

export function demoProject(): Project {
  const p = defaultProject();
  p.name = 'Harbour Crossing';

  // 1. Shore road — an S-curve showing fixed pavement & curbs on curves.
  const shore = makeSpline('Shore Road', SPLINE_COLORS[1]);
  shore.cross = { ...defaultCross('two-lane'), paveLeft: 2.5, paveRight: 2.5 };
  shore.nodes = [
    demoNode(-34, 0.05, -10, 0, 0, 6, -1),
    demoNode(-18, 0.05, -14, -6, 1, 6, -3),
    demoNode(-2, 0.05, -16, -6, 2, 6, 2),
    demoNode(12, 0.05, -12, -6, -2, 6, 1),
    demoNode(28, 0.05, -10, -6, -1, 0, 0),
  ];
  // 2. North avenue — crosses Shore Road at a shared node -> 4-way junction.
  const north = makeSpline('North Avenue', SPLINE_COLORS[0]);
  north.cross = defaultCross('two-lane');
  // shared position with shore.nodes[2]
  north.nodes = [
    demoNode(-2, 0.05, -34, 0, 0, 0, 6),
    demoNode(-2, 0.05, -25, 0, -6, 0, 4),
    { ...demoNode(-2, 0.05, -16, 0, -4, 0, 5), id: generateId() },
    demoNode(-2, 0.05, -6, 0, -5, 0, 6),
    demoNode(-2, 0.05, 4, 0, -6, 0, 0),
  ];

  // 3. Lake bridge — beam bridge over the water with piers.
  const bridge = makeSpline('Lake Bridge', SPLINE_COLORS[2]);
  bridge.cross = { ...defaultCross('two-lane'), paveLeft: 1.5, paveRight: 1.5 };
  bridge.bridge = {
    ...defaultBridge(),
    enabled: true,
    type: 'beam',
    pierSpacing: 11,
    pierStyle: 'bent',
    parapet: 'parapet',
  };
  bridge.nodes = [
    demoNode(-30, 1.2, 14, 0, 0, 8, 0),
    demoNode(-12, 4.2, 14, -8, 0, 8, 0),
    demoNode(6, 4.2, 14, -8, 0, 8, 0),
    demoNode(24, 1.2, 14, -8, 0, 0, 0),
  ];

  // 4. Causeway — ground road meeting the bridge landing.
  const causeway = makeSpline('Causeway', SPLINE_COLORS[3]);
  causeway.cross = defaultCross('single');
  causeway.nodes = [
    { ...demoNode(24, 1.2, 14, 0, 0, 0, 0), id: generateId() },
    demoNode(32, 0.4, 12, -3, 1, 0, 0),
  ];

  p.splines = [shore, north, bridge, causeway];
  p.scene.waterLevel = -0.9;
  return p;
}

/** Revive a project loaded from JSON (fill in any missing fields). */
export function migrateProject(raw: any): Project {
  const base = defaultProject();
  if (!raw || typeof raw !== 'object') return base;
  const out: Project = {
    ...base,
    ...raw,
    version: 1,
    junctions: { ...base.junctions, ...(raw.junctions || {}) },
    scene: { ...base.scene, ...(raw.scene || {}) },
    splines: Array.isArray(raw.splines)
      ? raw.splines.map((s: any, i: number) => ({
          id: String(s.id ?? generateId()),
          name: String(s.name ?? `Spline ${i + 1}`),
          nodes: Array.isArray(s.nodes) ? s.nodes : [],
          closed: !!s.closed,
          visible: s.visible !== false,
          color: String(s.color ?? SPLINE_COLORS[i % SPLINE_COLORS.length]),
          cross: { ...defaultCross('two-lane'), ...(s.cross || {}) },
          bridge: { ...defaultBridge(), ...(s.bridge || {}) },
          rails: { ...defaultRails(), ...(s.rails || {}) },
        }))
      : [],
  };
  return out;
}
