// Node registry shared by the UI (inspector fields, outliner groups, defaults)
// and the kernel worker (which dispatches each type to an OpenCascade operation).
//
// kind: "body" (solid), "surface" (open or closed faces), "curve" (edges/wires).
// inputs: { min, max, kinds } - what the node consumes from the document graph.

export const LOFT_TYPES = [
  { value: "smooth", label: "Smooth (cubic through sections)" },
  { value: "ruled", label: "Ruled (straight between sections)" },
  { value: "g1start", label: "Tangent start - G1 (guide section)" },
  { value: "g1end", label: "Tangent end - G1 (guide section)" },
  { value: "g1both", label: "Tangent both ends - G1 (guide sections)" },
  { value: "apexStart", label: "Apex start - point" },
  { value: "apexEnd", label: "Apex end - point" },
];

export const PLANES = [
  { value: "YZ", label: "YZ (mirror X)" },
  { value: "XZ", label: "XZ (mirror Y)" },
  { value: "XY", label: "XY (mirror Z)" },
];

const vec = (label, def, extra = {}) => ({ key: label, kind: "vec3", label, def, ...extra });
const num = (key, label, def, extra = {}) => ({ key, kind: "number", label, def, min: 0, step: 0.5, unit: "mm", ...extra });

export const NODE_TYPES = {
  // ---- primitive bodies ----
  box: {
    label: "Box", kind: "body", group: "Primitives", icon: "body",
    inputs: { min: 0, max: 0 },
    fields: [num("w", "Width (X)", 40), num("h", "Height (Y)", 20), num("d", "Depth (Z)", 10)],
    defaults: { w: 40, h: 20, d: 10 },
  },
  cylinder: {
    label: "Cylinder", kind: "body", group: "Primitives", icon: "body",
    inputs: { min: 0, max: 0 },
    fields: [num("r", "Radius", 10), num("h", "Height", 30)],
    defaults: { r: 10, h: 30 },
  },
  sphere: {
    label: "Sphere", kind: "body", group: "Primitives", icon: "body",
    inputs: { min: 0, max: 0 },
    fields: [num("r", "Radius", 15)],
    defaults: { r: 15 },
  },
  ellipsoid: {
    label: "Ellipsoid", kind: "body", group: "Primitives", icon: "body",
    inputs: { min: 0, max: 0 },
    fields: [num("a", "Semi-axis X", 20), num("b", "Semi-axis Y", 12), num("c", "Semi-axis Z", 8)],
    defaults: { a: 20, b: 12, c: 8 },
  },

  // ---- curves ----
  line: {
    label: "Line", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [vec("a", [0, 0, 0]), vec("b", [100, 0, 0])],
    defaults: { a: [0, 0, 0], b: [100, 0, 0] },
  },
  polyline: {
    label: "Polyline", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [{ key: "points", kind: "points", label: "Vertices" }, { key: "closed", kind: "bool", label: "Closed" }],
    defaults: { points: [[0, 0, 0], [60, 0, 0], [60, 40, 0], [0, 40, 0]], closed: true },
  },
  arc3: {
    label: "Three-point arc", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [vec("a", [0, 0, 0]), vec("b", [30, 30, 0]), vec("c", [60, 0, 0])],
    defaults: { a: [0, 0, 0], b: [30, 30, 0], c: [60, 0, 0] },
  },
  tangentArc: {
    label: "Tangent arc", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [vec("a", [0, 0, 0]), vec("tangent", [1, 0, 0]), vec("b", [40, 30, 0])],
    defaults: { a: [0, 0, 0], tangent: [1, 0, 0], b: [40, 30, 0] },
  },
  circle: {
    label: "Circle", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [vec("c", [0, 0, 0]), num("r", "Radius", 20), vec("n", [0, 0, 1])],
    defaults: { c: [0, 0, 0], r: 20, n: [0, 0, 1] },
  },
  ellipse: {
    label: "Ellipse", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [vec("c", [0, 0, 0]), num("rx", "Radius X", 30), num("ry", "Radius Y", 15), vec("n", [0, 0, 1])],
    defaults: { c: [0, 0, 0], rx: 30, ry: 15, n: [0, 0, 1] },
  },
  helix: {
    label: "Helix", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [num("pitch", "Pitch", 20), num("height", "Height", 60), num("radius", "Radius", 15)],
    defaults: { pitch: 20, height: 60, radius: 15 },
  },
  bezier: {
    label: "Bezier (degree n)", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [{ key: "points", kind: "points", label: "Control points" }],
    defaults: { points: [[0, 0, 0], [20, 40, 0], [60, -20, 0], [80, 0, 0]] },
  },
  spline: {
    label: "Spline (G0 / G1 / G2 joints)", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [{ key: "knots", kind: "knots", label: "Knots" }],
    defaults: {
      knots: [
        { p: [0, 0, 0], cont: "G0", scale: 1 },
        { p: [25, 18, 0], cont: "G2", scale: 1 },
        { p: [55, -6, 0], cont: "G2", scale: 1 },
        { p: [80, 12, 0], cont: "G1", scale: 1 },
        { p: [110, 0, 0], cont: "G0", scale: 1 },
      ],
    },
  },
  fitCurve: {
    label: "B-spline fit", kind: "curve", group: "Curves", icon: "curve",
    inputs: { min: 0, max: 0 },
    fields: [{ key: "points", kind: "points", label: "Fit points" }],
    defaults: { points: [[0, 0, 0], [20, 12, 0], [45, 4, 0], [70, 18, 0], [95, 0, 0]] },
  },

  // ---- surfaces ----
  planeSurface: {
    label: "Planar patch", kind: "surface", group: "Surfaces", icon: "surface",
    inputs: { min: 1, max: 1, kinds: ["curve"] },
    fields: [],
    defaults: {},
  },
  patch: {
    label: "Fill patch (boundary)", kind: "surface", group: "Surfaces", icon: "surface",
    inputs: { min: 1, max: 16, kinds: ["curve"] },
    fields: [],
    defaults: {},
  },
  extrudeSurface: {
    label: "Extrude surface", kind: "surface", group: "Surfaces", icon: "surface",
    inputs: { min: 1, max: 1, kinds: ["curve"] },
    fields: [vec("dir", [0, 0, 1]), num("distance", "Distance", 50, { min: -1000, max: 1000 })],
    defaults: { dir: [0, 0, 1], distance: 50 },
  },
  revolveSurface: {
    label: "Revolve surface", kind: "surface", group: "Surfaces", icon: "surface",
    inputs: { min: 1, max: 1, kinds: ["curve"] },
    fields: [vec("axisOrigin", [0, 0, 0]), vec("axisDir", [0, 1, 0]), num("angle", "Angle", 360, { min: 1, max: 360, step: 1, unit: "°" })],
    defaults: { axisOrigin: [0, 0, 0], axisDir: [0, 1, 0], angle: 360 },
  },
  loftSurface: {
    label: "Loft surface", kind: "surface", group: "Surfaces", icon: "surface",
    inputs: { min: 2, max: 16, kinds: ["curve"] },
    fields: [
      { key: "loftType", kind: "select", label: "Loft type", options: LOFT_TYPES },
      num("lead", "Tangent lead", 0.1, { min: 0.01, max: 1, step: 0.01, unit: "×" }),
      vec("apex", [0, 0, 100]),
    ],
    defaults: { loftType: "smooth", lead: 0.1, apex: [0, 0, 100] },
  },
  sweepSurface: {
    label: "Sweep surface", kind: "surface", group: "Surfaces", icon: "surface",
    inputs: { min: 2, max: 2, kinds: ["curve", "curve"] },
    fields: [{ key: "frenet", kind: "bool", label: "Frenet frame" }],
    defaults: { frenet: true },
  },

  // ---- body operations ----
  extrude: {
    label: "Extrude", kind: "body", group: "Operations", icon: "extrude",
    inputs: { min: 1, max: 1, kinds: ["curve"] },
    fields: [num("distance", "Distance", 50, { min: -1000, max: 1000 }), vec("dir", [0, 0, 1]), { key: "symmetric", kind: "bool", label: "Symmetric" }],
    defaults: { distance: 50, dir: [0, 0, 1], symmetric: false },
  },
  revolve: {
    label: "Revolve", kind: "body", group: "Operations", icon: "revolve",
    inputs: { min: 1, max: 1, kinds: ["curve"] },
    fields: [vec("axisOrigin", [0, 0, 0]), vec("axisDir", [0, 1, 0]), num("angle", "Angle", 360, { min: 1, max: 360, step: 1, unit: "°" })],
    defaults: { axisOrigin: [0, 0, 0], axisDir: [0, 1, 0], angle: 360 },
  },
  loft: {
    label: "Loft", kind: "body", group: "Operations", icon: "loft",
    inputs: { min: 2, max: 16, kinds: ["curve"] },
    fields: [
      { key: "loftType", kind: "select", label: "Loft type", options: LOFT_TYPES },
      num("lead", "Tangent lead", 0.1, { min: 0.01, max: 1, step: 0.01, unit: "×" }),
      vec("apex", [0, 0, 100]),
    ],
    defaults: { loftType: "smooth", lead: 0.1, apex: [0, 0, 100] },
  },
  sweep: {
    label: "Sweep", kind: "body", group: "Operations", icon: "sweep",
    inputs: { min: 2, max: 2, kinds: ["curve", "curve"] },
    fields: [{ key: "frenet", kind: "bool", label: "Frenet frame" }],
    defaults: { frenet: true },
  },
  fillet: {
    label: "Fillet", kind: "body", group: "Edge operations", icon: "fillet",
    inputs: { min: 1, max: 1, kinds: ["body"] },
    fields: [num("radius", "Radius", 2, { min: 0.01, max: 500 }), { key: "edges", kind: "edges", label: "Edges" }],
    defaults: { radius: 2, edges: [] },
  },
  chamfer: {
    label: "Chamfer", kind: "body", group: "Edge operations", icon: "chamfer",
    inputs: { min: 1, max: 1, kinds: ["body"] },
    fields: [num("distance", "Distance", 2, { min: 0.01, max: 500 }), { key: "edges", kind: "edges", label: "Edges" }],
    defaults: { distance: 2, edges: [] },
  },
  bevel: {
    label: "Bevel (asymmetric chamfer)", kind: "body", group: "Edge operations", icon: "bevel",
    inputs: { min: 1, max: 1, kinds: ["body"] },
    fields: [
      num("distance", "Setback A", 2, { min: 0.01, max: 500 }),
      num("setback", "Setback B", 4, { min: 0.01, max: 500 }),
      { key: "edges", kind: "edges", label: "Edges" },
    ],
    defaults: { distance: 2, setback: 4, edges: [] },
  },
  boolean: {
    label: "Boolean", kind: "body", group: "Operations", icon: "boolean",
    inputs: { min: 2, max: 2, kinds: ["body"] },
    fields: [
      {
        key: "op", kind: "select", label: "Operation",
        options: [
          { value: "union", label: "Union" },
          { value: "subtract", label: "Subtract" },
          { value: "intersect", label: "Intersect" },
        ],
      },
    ],
    defaults: { op: "union" },
  },
  pushpull: {
    label: "Push / Pull face", kind: "body", group: "Edge operations", icon: "pushpull",
    inputs: { min: 1, max: 1, kinds: ["body"] },
    fields: [num("distance", "Distance", 5, { min: -500, max: 500 }), { key: "face", kind: "face", label: "Face" }],
    defaults: { distance: 5, face: -1 },
  },
  mirror: {
    label: "Mirror", kind: "body", group: "Operations", icon: "mirror",
    inputs: { min: 1, max: 1, kinds: ["body"] },
    fields: [
      {
        key: "plane", kind: "select", label: "Mirror plane",
        options: PLANES,
      },
      { key: "merge", kind: "bool", label: "Merge with original" },
    ],
    defaults: { plane: "YZ", merge: true },
  },
};

export const KIND_LABEL = { body: "Body", curve: "Curve", surface: "Surface" };

export function defaultParams(type) {
  const meta = NODE_TYPES[type];
  if (!meta) throw new Error(`Unknown node type ${type}`);
  return structuredClone(meta.defaults);
}

export function nodeKind(type) {
  return NODE_TYPES[type]?.kind ?? "body";
}
