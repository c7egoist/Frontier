// ---------------------------------------------------------------------------
// model.js — project model for the road editor.
//
// A project is a set of splines (roads / bridges). Splines are cubic-bezier
// chains of nodes in world space. The network builder (topology.js) fuses
// touching/crossing splines into junctions; geometry builders turn runs into
// mesh patches. All feature toggles (markings, paving, drainage, guardrails,
// bridges) live on the spline's cross-section / settings blocks.
// ---------------------------------------------------------------------------

export const generateId = () => Math.random().toString(36).slice(2, 10);

export const SPLINE_COLORS = [
  '#a8bbeb', '#93c779', '#e8b65f', '#75c7df',
  '#d5a4c4', '#d6a078', '#b3b3d5', '#72c8b3',
];

export const PRESET_DEFS = {
  single: { label: 'Single carriageway', width: 6, lanes: 1 },
  'two-lane': { label: '2-lane road', width: 8, lanes: 2 },
  'three-lane': { label: '3-lane road', width: 12, lanes: 3 },
  'four-lane': { label: '4-lane road', width: 16, lanes: 4 },
  highway: { label: 'Highway', width: 20, lanes: 4 },
};

export function defaultMarkings() {
  return {
    centerLine: true,
    edgeLines: true,
    laneLines: true,
    crosswalks: true,
    stopBars: false,
  };
}

export function defaultCross(preset = 'two-lane') {
  const def = PRESET_DEFS[preset] ?? PRESET_DEFS['two-lane'];
  return {
    preset,
    width: def.width,
    lanes: def.lanes,
    paveLeft: 2,
    paveRight: 2,
    curbHeight: 0.15,
    crossfall: 0.02,
    pavePattern: 'slabs',   // none | slabs | pavers | gravel
    patternScale: 1,
    markings: defaultMarkings(),
  };
}

export function defaultDrainage() {
  return {
    enabled: true,
    gutter: true,        // sloped channel at the carriageway edge
    gutterWidth: 0.45,
    gutterDepth: 0.05,
    grates: true,        // inlet grates along the gutter
    grateSpacing: 14,
  };
}

export function defaultRails() {
  return {
    enabled: true,
    height: 0.75,
    thickness: 0.18,
    posts: true,
    postSpacing: 2.4,
    terminals: true,     // turned-down rail ends at dead ends
  };
}

export function defaultBridge() {
  return {
    enabled: false,
    type: 'beam',            // beam | arch
    deckDepth: 0.4,          // slab thickness below the wearing surface
    girderDepth: 1.1,        // I-girder depth below the slab soffit
    girderCount: 3,
    diaphragms: true,
    pierSpacing: 14,
    pierStyle: 'bent',       // single | bent | wall
    columnShape: 'round',    // round | square
    pierSize: 0.7,
    foundation: 'spread',    // spread | piles
    abutment: true,
    archRise: 5,
    parapet: 'parapet',      // parapet | rail
    parapetHeight: 1.1,
    scuppers: true,          // deck-edge drainage outlets
    scupperSpacing: 10,
  };
}

export function makeSpline(name, color) {
  return {
    id: generateId(),
    name,
    nodes: [],
    closed: false,
    visible: true,
    color,
    cross: defaultCross('two-lane'),
    drainage: defaultDrainage(),
    bridge: defaultBridge(),
    rails: defaultRails(),
  };
}

export function makeNode(position) {
  return {
    id: generateId(),
    position: [...position],
    handleIn: [...position],
    handleOut: [...position],
  };
}

export function defaultJunctions() {
  return { cornerRadius: 7, filletSteps: 12, depth: 1.5, inset: 1.5 };
}

export function defaultScene() {
  return {
    groundZ: 0,
    showGround: true,
    waterLevel: -1.2,
    showWater: true,
    showGrid: true,
    drawHeight: 0.05,
  };
}

export function defaultProject() {
  return {
    version: 2,
    name: 'Untitled road network',
    splines: [],
    junctions: defaultJunctions(),
    scene: defaultScene(),
  };
}

export function topologyName(arms) {
  if (arms <= 1) return 'Dead end';
  if (arms === 2) return 'Bend / landing';
  if (arms === 3) return '3-way intersection';
  if (arms === 4) return '4-way intersection';
  return `${arms}-way intersection`;
}

// ---------------------------------------------------------------------------
// Demo scenes
// ---------------------------------------------------------------------------

function demoNode(x, y, z, inDx = 0, inDz = 0, outDx = 0, outDz = 0) {
  return {
    id: generateId(),
    position: [x, y, z],
    handleIn: [x + inDx, y, z + inDz],
    handleOut: [x + outDx, y, z + outDz],
  };
}

/**
 * Diamond interchange — the "exchange" demo. Two grade-separated highways
 * cross (the X road rides a beam bridge over the Y road); four staggered
 * ramps tie them together with clean T-junctions at every landing.
 *
 *   overpass A:  y=0, deck at +5,  x in [-70, 70]   (bridge)
 *   underpass B: x=0, at grade,    y in [-70, 70]   (road)
 *   ramps: NE (28,0)->(0,24)   SE (38,0)->(0,-24)
 *          NW (-28,0)->(0,36)  SW (-38,0)->(0,-36)
 *
 * The A/B crossing stays grade-separated (5 m height gap > fuse gate), the
 * ramp landings land exactly on the carrier centerlines and fuse as
 * 3-leg junctions — 8 junctions in total, no broken exchange geometry.
 */
export function demoInterchange() {
  const p = defaultProject();
  p.name = 'Diamond interchange';

  const over = makeSpline('Overpass A', SPLINE_COLORS[0]);
  over.cross = { ...defaultCross('four-lane'), width: 16, lanes: 4, paveLeft: 1.5, paveRight: 1.5 };
  over.bridge = { ...defaultBridge(), enabled: true, type: 'beam', pierSpacing: 16, parapet: 'parapet' };
  over.rails = { ...defaultRails(), enabled: false }; // bridge parapets instead
  over.drainage = { ...defaultDrainage(), enabled: true, gutter: false, grates: false };
  const deckH = 5;
  over.nodes = [
    demoNode(-70, deckH, 0, 0, 0, 24, 0),
    demoNode(0, deckH, 0, -24, 0, 24, 0),
    demoNode(70, deckH, 0, -24, 0, 0),
  ];

  const under = makeSpline('Underpass B', SPLINE_COLORS[1]);
  under.cross = { ...defaultCross('two-lane'), paveLeft: 2.5, paveRight: 2.5 };
  under.nodes = [
    demoNode(0, 0.05, -70, 0, 0, 0, 24),
    demoNode(0, 0.05, 0, 0, -24, 0, 24),
    demoNode(0, 0.05, 70, 0, -24, 0, 0),
  ];

  // Ramp: cubic from P0 (on A, tangent +X) to P3 (on B, tangent away from
  // centre along B). Heights ease from deck level down to grade.
  const ramp = (name, color, p0, p3, k) => {
    const s = makeSpline(name, color);
    s.cross = { ...defaultCross('single'), width: 5.5, lanes: 1, paveLeft: 1.2, paveRight: 1.2 };
    s.cross.markings = { ...defaultMarkings(), centerLine: false, edgeLines: true, laneLines: false, crosswalks: false };
    const d0 = [Math.sign(p3[0] - p0[0]) || 1, 0]; // leave A along A
    const d1 = [0, Math.sign(p3[2] - p0[2]) || 1];  // arrive on B along B
    const h0 = p0[1];
    const h1 = p3[1];
    const hMid = (a, b, t) => a + (b - a) * t;
    s.nodes = [
      {
        id: generateId(),
        position: [...p0],
        handleIn: [p0[0] - d0[0] * k, hMid(h0, h1, 0.05), p0[2] - d0[1] * k],
        handleOut: [p0[0] + d0[0] * k, hMid(h0, h1, 0.33), p0[2] + d0[1] * k],
      },
      {
        id: generateId(),
        position: [...p3],
        handleIn: [p3[0] - d1[0] * k, hMid(h0, h1, 0.66), p3[2] - d1[1] * k],
        handleOut: [p3[0] + d1[0] * k, hMid(h0, h1, 0.95), p3[2] + d1[1] * k],
      },
    ];
    return s;
  };

  p.splines = [
    over,
    under,
    ramp('Ramp NE', SPLINE_COLORS[2], [28, deckH, 0], [0, 0.05, 24], 11),
    ramp('Ramp SE', SPLINE_COLORS[3], [38, deckH, 0], [0, 0.05, -24], 11),
    ramp('Ramp NW', SPLINE_COLORS[4], [-28, deckH, 0], [0, 0.05, 36], 11),
    ramp('Ramp SW', SPLINE_COLORS[5], [-38, deckH, 0], [0, 0.05, -36], 11),
  ];
  p.scene.waterLevel = -6;
  return p;
}

/**
 * Harbour scene — curved shore road, a 4-way crossing (shared node), a beam
 * bridge over water and a causeway that lands on the bridge end in a clean
 * straight abutment (landing link, not a broken junction).
 */
export function demoHarbour() {
  const p = defaultProject();
  p.name = 'Harbour crossing';

  const shore = makeSpline('Shore Road', SPLINE_COLORS[1]);
  shore.cross = { ...defaultCross('two-lane'), paveLeft: 2.5, paveRight: 2.5, pavePattern: 'pavers' };
  shore.nodes = [
    demoNode(-36, 0.05, -10, 0, 0, 6, -1),
    demoNode(-18, 0.05, -14, -6, 1, 6, -3),
    demoNode(-2, 0.05, -16, -6, 2, 6, 2),
    demoNode(12, 0.05, -12, -6, -2, 6, 1),
    demoNode(28, 0.05, -10, -6, -1, 0, 0),
  ];

  const north = makeSpline('North Avenue', SPLINE_COLORS[0]);
  north.nodes = [
    demoNode(-2, 0.05, -36, 0, 0, 0, 6),
    demoNode(-2, 0.05, -16, 0, -6, 0, 6), // shared position with shore node 3 -> 4-way
    demoNode(-2, 0.05, 4, 0, -6, 0, 0),
  ];

  const bridge = makeSpline('Lake Bridge', SPLINE_COLORS[2]);
  bridge.cross = { ...defaultCross('two-lane'), paveLeft: 1.5, paveRight: 1.5, pavePattern: 'slabs' };
  bridge.bridge = { ...defaultBridge(), enabled: true, type: 'beam', pierSpacing: 12, parapet: 'parapet' };
  bridge.rails = { ...defaultRails(), enabled: false };
  bridge.drainage = { ...defaultDrainage(), enabled: true, gutter: false, grates: false };
  bridge.nodes = [
    demoNode(-30, 1.2, 14, 0, 0, 8, 0),
    demoNode(-12, 4.2, 14, -8, 0, 8, 0),
    demoNode(6, 4.2, 14, -8, 0, 8, 0),
    demoNode(24, 1.2, 14, -8, 0, 0, 0),
  ];

  // Causeway continues the bridge direction exactly -> straight abutment
  // (landing), rails hand over to the parapet, parapet ramps down.
  const causeway = makeSpline('Causeway', SPLINE_COLORS[3]);
  causeway.cross = { ...defaultCross('single'), pavePattern: 'gravel' };
  causeway.nodes = [
    demoNode(24, 1.2, 14, 0, 0, 0, 0),
    demoNode(36, 0.35, 13.2, -4, 0.4, 0, 0),
  ];

  p.splines = [shore, north, bridge, causeway];
  p.scene.waterLevel = -0.9;
  return p;
}

/** Insert a diamond interchange into an existing project at (cx, cz). */
export function addInterchange(project, cx = 0, cz = 0) {
  const demo = demoInterchange();
  const shift = (pt) => [pt[0] + cx, pt[1], pt[2] + cz];
  const out = [];
  for (const s of demo.splines) {
    out.push({
      ...s,
      id: generateId(),
      name: `${s.name} ${project.splines.length + out.length + 1}`,
      nodes: s.nodes.map((n) => ({
        ...n,
        id: generateId(),
        position: shift(n.position),
        handleIn: shift(n.handleIn),
        handleOut: shift(n.handleOut),
      })),
    });
  }
  return { ...project, splines: [...project.splines, ...out] };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Revive a project loaded from JSON (fill in any missing fields). */
export function migrateProject(raw) {
  const base = defaultProject();
  if (!raw || typeof raw !== 'object') return base;
  const out = {
    ...base,
    ...raw,
    version: 2,
    name: String(raw.name ?? base.name),
    junctions: { ...base.junctions, ...(raw.junctions || {}) },
    scene: { ...base.scene, ...(raw.scene || {}) },
    splines: Array.isArray(raw.splines)
      ? raw.splines.map((s, i) => ({
          id: String(s.id ?? generateId()),
          name: String(s.name ?? `Road ${i + 1}`),
          nodes: Array.isArray(s.nodes) ? s.nodes.map((n) => ({
            id: String(n.id ?? generateId()),
            position: Array.isArray(n.position) ? n.position.map(Number) : [0, 0, 0],
            handleIn: Array.isArray(n.handleIn) ? n.handleIn.map(Number) : [0, 0, 0],
            handleOut: Array.isArray(n.handleOut) ? n.handleOut.map(Number) : [0, 0, 0],
          })) : [],
          closed: !!s.closed,
          visible: s.visible !== false,
          color: String(s.color ?? SPLINE_COLORS[i % SPLINE_COLORS.length]),
          cross: { ...defaultCross('two-lane'), ...(s.cross || {}), markings: { ...defaultMarkings(), ...((s.cross || {}).markings || {}) } },
          drainage: { ...defaultDrainage(), ...(s.drainage || {}) },
          bridge: { ...defaultBridge(), ...(s.bridge || {}) },
          rails: { ...defaultRails(), ...(s.rails || {}) },
        }))
      : [],
  };
  return out;
}
