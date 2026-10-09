import type { Vec3 } from './vec';

// ---------------------------------------------------------------------------
// Project model — Frontier Road Designer
// Spline nodes live in world space (X right, Y up, Z toward viewer).
// ---------------------------------------------------------------------------

export type Point3D = [number, number, number];

export interface SplineNode {
  id: string;
  /** World position [x, yUp, z]. */
  position: Point3D;
  handleIn: Point3D;
  handleOut: Point3D;
}

export type RoadPreset = 'single' | 'two-lane' | 'three-lane' | 'four-lane' | 'highway' | 'custom';

export interface CrossSection {
  preset: RoadPreset;
  width: number;
  lanes: number;
  paveLeft: number;
  paveRight: number;
  curbHeight: number;
  crossfall: number;
  showCenterLine: boolean;
  showEdgeLines: boolean;
  showLaneLines: boolean;
}

export type PavingPattern = 'plain' | 'ashlar' | 'herringbone' | 'basket' | 'stretcher' | 'cobble' | 'hex' | 'diag';

export interface PavingSettings {
  pattern: PavingPattern;
  /** Brick / stone length (m) along the road */
  scale: number;
  /** Mortar gap (m) */
  gap: number;
  /** Brick colour A */
  colorA: string;
  /** Brick colour B (variegation) */
  colorB: string;
  /** Mortar colour */
  mortar: string;
  /** Roughness jitter */
  enabled: boolean;
}

export type DrainageStyle = 'slotted' | 'grated' | 'channel';

export interface DrainageSettings {
  enabled: boolean;
  style: DrainageStyle;
  /** Along-road spacing of grates (m). */
  grateSpacing: number;
  /** Channel width (m) at pavement edge */
  channelWidth: number;
  gutterDepth: number;
  /** Longitudinal slope hint */
  slope: number;
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
  superstructure: Superstructure;
  deckDepth: number;
  girderDepth: number;
  diaphragms: boolean;
  pierSpacing: number;
  pierStyle: PierStyle;
  columnShape: ColumnShape;
  pierSize: number;
  foundation: Foundation;
  abutment: Abutment;
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
  paving: PavingSettings;
  drainage: DrainageSettings;
  bridge: BridgeSettings;
  rails: RailSettings;
}

export interface JunctionSettings {
  cornerRadius: number;
  filletSteps: number;
  depth: number;
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

export const SPLINE_COLORS = [
  '#a8bbeb',
  '#93c779',
  '#e8b65f',
  '#75c7df',
  '#d5a4c4',
  '#d6a078',
  '#b3b3d5',
  '#72c8b3',
];

export const PRESET_DEFS: Record<Exclude<RoadPreset, 'custom'>, { label: string; width: number; lanes: number }> = {
  single: { label: 'Single', width: 6, lanes: 1 },
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

export function defaultPaving(): PavingSettings {
  return {
    pattern: 'plain',
    scale: 0.6,
    gap: 0.02,
    colorA: '#a3a3a3',
    colorB: '#8e8e8e',
    mortar: '#6b6b6b',
    enabled: true,
  };
}

export function defaultDrainage(): DrainageSettings {
  return {
    enabled: false,
    style: 'grated',
    grateSpacing: 6,
    channelWidth: 0.35,
    gutterDepth: 0.08,
    slope: 0.015,
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
    paving: defaultPaving(),
    drainage: defaultDrainage(),
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
// Demo scene
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

  const shore = makeSpline('Shore Road', SPLINE_COLORS[1]);
  shore.cross = { ...defaultCross('two-lane'), paveLeft: 2.5, paveRight: 2.5 };
  shore.paving = { ...defaultPaving(), pattern: 'herringbone', scale: 0.5, colorA: '#a8a29a', colorB: '#9a9590', mortar: '#6e6b66' };
  shore.drainage = { ...defaultDrainage(), enabled: true, style: 'grated', grateSpacing: 8, channelWidth: 0.32 };
  shore.nodes = [
    demoNode(-34, 0.05, -10, 0, 0, 6, -1),
    demoNode(-18, 0.05, -14, -6, 1, 6, -3),
    demoNode(-2, 0.05, -16, -6, 2, 6, 2),
    demoNode(12, 0.05, -12, -6, -2, 6, 1),
    demoNode(28, 0.05, -10, -6, -1, 0, 0),
  ];

  const north = makeSpline('North Avenue', SPLINE_COLORS[0]);
  north.cross = defaultCross('two-lane');
  north.drainage = { ...defaultDrainage(), enabled: true, style: 'slotted', grateSpacing: 7 };
  north.nodes = [
    demoNode(-2, 0.05, -34, 0, 0, 0, 6),
    demoNode(-2, 0.05, -25, 0, -6, 0, 4),
    { ...demoNode(-2, 0.05, -16, 0, -4, 0, 5), id: generateId() },
    demoNode(-2, 0.05, -6, 0, -5, 0, 6),
    demoNode(-2, 0.05, 4, 0, -6, 0, 0),
  ];

  const bridge = makeSpline('Lake Bridge', SPLINE_COLORS[2]);
  bridge.cross = { ...defaultCross('two-lane'), paveLeft: 1.5, paveRight: 1.5 };
  bridge.paving = { ...defaultPaving(), pattern: 'plain', colorA: '#9a9a9a', colorB: '#9a9a9a' };
  bridge.drainage = { ...defaultDrainage(), enabled: true, style: 'channel', grateSpacing: 10, channelWidth: 0.28 };
  bridge.bridge = { ...defaultBridge(), enabled: true, type: 'beam', pierSpacing: 11, pierStyle: 'bent', parapet: 'parapet' };
  bridge.nodes = [
    demoNode(-30, 1.2, 14, 0, 0, 8, 0),
    demoNode(-12, 4.2, 14, -8, 0, 8, 0),
    demoNode(6, 4.2, 14, -8, 0, 8, 0),
    demoNode(24, 1.2, 14, -8, 0, 0, 0),
  ];

  const causeway = makeSpline('Causeway', SPLINE_COLORS[3]);
  causeway.cross = defaultCross('single');
  causeway.paving = { ...defaultPaving(), pattern: 'ashlar', scale: 0.7, colorA: '#b1ada6', colorB: '#a3a09c', mortar: '#61605e' };
  causeway.drainage = { ...defaultDrainage(), enabled: false };
  causeway.nodes = [
    { ...demoNode(24, 1.2, 14, 0, 0, 0, 0), id: generateId() },
    demoNode(32, 0.4, 12, -3, 1, 0, 0),
  ];

  // Add a diagonal boulevard to show herringbone + drainage in junction
  const diag = makeSpline('Diagonal', SPLINE_COLORS[4]);
  diag.cross = { ...defaultCross('two-lane'), width: 9, paveLeft: 2, paveRight: 2 };
  diag.paving = { ...defaultPaving(), pattern: 'basket', scale: 0.45, colorA: '#c2b8ad', colorB: '#b0a89e', mortar: '#6b6864' };
  diag.drainage = { ...defaultDrainage(), enabled: true, style: 'grated', grateSpacing: 6 };
  diag.nodes = [
    demoNode(-22, 0.05, -28, 0, 0, 5, 5),
    demoNode(-8, 0.05, -15, -5, -5, 4, 4),
    demoNode(6, 0.05, -2, -4, -4, 0, 0),
  ];

  p.splines = [shore, north, bridge, causeway, diag];
  p.scene.waterLevel = -0.9;
  return p;
}

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
          paving: { ...defaultPaving(), ...(s.paving || {}) },
          drainage: { ...defaultDrainage(), ...(s.drainage || {}) },
          bridge: { ...defaultBridge(), ...(s.bridge || {}) },
          rails: { ...defaultRails(), ...(s.rails || {}) },
        }))
      : [],
  };
  return out;
}
