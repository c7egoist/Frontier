// Project model: canonical defaults, schema validation with per-field messages, and migration.
// The JSON written by exportProject() is the single exchange format. Importing it, normalising
// and exporting again gives byte-identical output (covered by tests/roundtrip.test.js).

export const FORMAT = 'frontier-road-project';
export const VERSION = 1;
export const PATTERNS = ['slab', 'brick', 'herringbone', 'hex', 'cobble', 'flag', 'plain'];
export const CAMBER_MODES = ['crown', 'left', 'right'];
export const CENTRE_MARKS = ['solid', 'dashed', 'none'];
export const GUARD_SIDES = ['both', 'left', 'right'];

const HEX = /^#[0-9a-fA-F]{6}$/;
const round = (v) => Math.round(v * 1e6) / 1e6;

export function defaultRoad(id, a, b, over = {}) {
  return {
    id,
    name: id,
    a,
    b,
    ctrl: [],
    lanesL: 1,
    lanesR: 1,
    laneW: 3.5,
    camber: 0.025,
    camberMode: 'crown',
    gutter: 0.45,
    kerbH: 0.15,
    kerbW: 0.15,
    footway: 2,
    verge: 1,
    pattern: 'slab',
    colour: '#c9c4b8',
    ditch: false,
    ditchDepth: 0.3,
    embankment: true,
    bridge: { on: false, from: 0, to: null, depth: 0.9, pierSpacing: 18, pierW: 1.2 },
    guard: { on: false, side: 'both', offset: 0.3, postSpacing: 2.5 },
    drain: { gullies: false, gullySpacing: 24, pipes: false, pipeDepth: 0.9, pipeSize: 0.3 },
    marks: { centre: 'dashed', edges: true, lanes: true },
    ...over,
  };
}

export function defaultJunction(id, x, z, over = {}) {
  return { id, name: id, x, z, y: 0, radius: 6, ...over };
}

export function emptyProject(name = 'Untitled road network') {
  return { format: FORMAT, version: VERSION, name, junctions: [], roads: [], areas: [] };
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function pick(obj, key, fallback) {
  return obj && obj[key] !== undefined ? obj[key] : fallback;
}

/**
 * Validate and normalise a raw project. Returns {project, errors}. Errors are human-readable
 * strings with the JSON path of the offending field. Unknown keys are dropped.
 */
export function normalizeProject(raw) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { project: null, errors: ['$: expected a JSON object'] };
  }
  if (raw.format !== FORMAT) err('format', `expected "${FORMAT}"`);
  if (raw.version !== VERSION) err('version', `unsupported version ${JSON.stringify(raw.version)} (expected ${VERSION})`);
  const project = {
    format: FORMAT,
    version: VERSION,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 120) : 'Untitled road network',
    junctions: [],
    roads: [],
    areas: [],
  };
  const ids = new Set();
  const uniq = (id, path) => {
    if (typeof id !== 'string' || !id.trim()) err(path, 'id must be a non-empty string');
    else if (ids.has(id)) err(path, `duplicate id "${id}"`);
    ids.add(id);
  };

  const js = Array.isArray(raw.junctions) ? raw.junctions : (err('junctions', 'must be an array'), []);
  js.forEach((j, i) => {
    const p = `junctions[${i}]`;
    if (!j || typeof j !== 'object') return err(p, 'must be an object');
    uniq(j.id, `${p}.id`);
    if (!isNum(j.x)) err(`${p}.x`, 'must be a finite number');
    if (!isNum(j.z)) err(`${p}.z`, 'must be a finite number');
    if (j.y !== undefined && j.y !== null && !isNum(j.y)) err(`${p}.y`, 'must be a number or null');
    const radius = pick(j, 'radius', 6);
    if (!isNum(radius) || radius < 0 || radius > 60) err(`${p}.radius`, 'must be 0..60 m');
    project.junctions.push({
      id: String(j.id),
      name: typeof j.name === 'string' ? j.name : String(j.id),
      x: round(Number(j.x) || 0),
      z: round(Number(j.z) || 0),
      y: isNum(j.y) ? round(j.y) : 0,
      radius: isNum(radius) ? round(radius) : 6,
    });
  });
  const jIds = new Set(project.junctions.map((j) => j.id));

  const rs = Array.isArray(raw.roads) ? raw.roads : (err('roads', 'must be an array'), []);
  rs.forEach((r, i) => {
    const p = `roads[${i}]`;
    if (!r || typeof r !== 'object') return err(p, 'must be an object');
    uniq(r.id, `${p}.id`);
    if (!jIds.has(r.a)) err(`${p}.a`, `unknown junction "${r.a}"`);
    if (!jIds.has(r.b)) err(`${p}.b`, `unknown junction "${r.b}"`);
    if (r.a === r.b) err(p, 'a and b must be different junctions');
    const d = defaultRoad(String(r.id), r.a, r.b);
    const num = (key, lo, hi, path = key) => {
      const v = pick(r, key, d[key]);
      if (!isNum(v) || v < lo || v > hi) {
        err(`${p}.${path}`, `must be a number from ${lo} to ${hi}`);
        return d[key];
      }
      return round(v);
    };
    const int = (key, lo, hi) => {
      const v = pick(r, key, d[key]);
      if (!Number.isInteger(v) || v < lo || v > hi) {
        err(`${p}.${key}`, `must be a whole number from ${lo} to ${hi}`);
        return d[key];
      }
      return v;
    };
    const bool = (key, obj, src, dflt, path) => {
      const v = pick(src, key, dflt);
      if (typeof v !== 'boolean') err(`${p}.${path}`, 'must be true or false');
      return typeof v === 'boolean' ? v : dflt;
    };
    const oneOf = (key, list, val, path = key) => {
      if (!list.includes(val)) err(`${p}.${path}`, `must be one of ${list.join(', ')}`);
      return list.includes(val) ? val : d[key];
    };
    const ctrlRaw = Array.isArray(r.ctrl) ? r.ctrl : (r.ctrl === undefined ? [] : (err(`${p}.ctrl`, 'must be an array'), []));
    const ctrl = ctrlRaw.map((c, k) => {
      if (!c || !isNum(c.x) || !isNum(c.z)) {
        err(`${p}.ctrl[${k}]`, 'needs numeric x and z');
        return { x: 0, z: 0, y: null };
      }
      if (c.y !== undefined && c.y !== null && !isNum(c.y)) err(`${p}.ctrl[${k}].y`, 'must be a number or null');
      return { x: round(c.x), z: round(c.z), y: isNum(c.y) ? round(c.y) : null };
    });
    const br = r.bridge || {};
    const gr = r.guard || {};
    const dr = r.drain || {};
    const mk = r.marks || {};
    if (r.bridge !== undefined && typeof r.bridge !== 'object') err(`${p}.bridge`, 'must be an object');
    if (r.guard !== undefined && typeof r.guard !== 'object') err(`${p}.guard`, 'must be an object');
    if (r.drain !== undefined && typeof r.drain !== 'object') err(`${p}.drain`, 'must be an object');
    if (r.marks !== undefined && typeof r.marks !== 'object') err(`${p}.marks`, 'must be an object');
    const from = pick(br, 'from', 0);
    const to = pick(br, 'to', null);
    if (!isNum(from) || from < 0) err(`${p}.bridge.from`, 'must be a number >= 0');
    if (to !== null && !isNum(to)) err(`${p}.bridge.to`, 'must be a number or null');
    const bridgeFrom = isNum(from) && from >= 0 ? round(from) : 0;
    const bridgeTo = isNum(to) ? round(to) : null;
    const seats = {
      id: String(r.id),
      name: typeof r.name === 'string' ? r.name : String(r.id),
      a: String(r.a),
      b: String(r.b),
      ctrl,
      lanesL: int('lanesL', 1, 4),
      lanesR: int('lanesR', 1, 4),
      laneW: num('laneW', 2.5, 5),
      camber: num('camber', 0, 0.08),
      camberMode: oneOf('camberMode', CAMBER_MODES, pick(r, 'camberMode', d.camberMode)),
      gutter: num('gutter', 0, 1.2),
      kerbH: num('kerbH', 0, 0.3),
      kerbW: num('kerbW', 0, 0.5),
      footway: num('footway', 0, 6),
      verge: num('verge', 0, 8),
      pattern: oneOf('pattern', PATTERNS, pick(r, 'pattern', d.pattern)),
      colour: HEX.test(pick(r, 'colour', d.colour)) ? pick(r, 'colour', d.colour) : (err(`${p}.colour`, 'must be #rrggbb'), d.colour),
      ditch: bool('ditch', r, r, false, 'ditch'),
      ditchDepth: num('ditchDepth', 0, 1.5),
      embankment: bool('embankment', r, r, true, 'embankment'),
      bridge: {
        on: bool('on', br, br, false, 'bridge.on'),
        from: bridgeFrom,
        to: bridgeTo,
        depth: isNum(pick(br, 'depth', d.bridge.depth)) ? round(pick(br, 'depth', d.bridge.depth)) : d.bridge.depth,
        pierSpacing: isNum(pick(br, 'pierSpacing', 18)) ? round(pick(br, 'pierSpacing', 18)) : 18,
        pierW: isNum(pick(br, 'pierW', 1.2)) ? round(pick(br, 'pierW', 1.2)) : 1.2,
      },
      guard: {
        on: bool('on', gr, gr, false, 'guard.on'),
        side: oneOf('side', GUARD_SIDES, pick(gr, 'side', 'both'), 'guard.side'),
        offset: isNum(pick(gr, 'offset', 0.3)) ? round(pick(gr, 'offset', 0.3)) : 0.3,
        postSpacing: isNum(pick(gr, 'postSpacing', 2.5)) ? round(pick(gr, 'postSpacing', 2.5)) : 2.5,
      },
      drain: {
        gullies: bool('gullies', dr, dr, false, 'drain.gullies'),
        gullySpacing: isNum(pick(dr, 'gullySpacing', 24)) ? round(pick(dr, 'gullySpacing', 24)) : 24,
        pipes: bool('pipes', dr, dr, false, 'drain.pipes'),
        pipeDepth: isNum(pick(dr, 'pipeDepth', 0.9)) ? round(pick(dr, 'pipeDepth', 0.9)) : 0.9,
        pipeSize: isNum(pick(dr, 'pipeSize', 0.3)) ? round(pick(dr, 'pipeSize', 0.3)) : 0.3,
      },
      marks: {
        centre: oneOf('centre', CENTRE_MARKS, pick(mk, 'centre', 'dashed'), 'marks.centre'),
        edges: bool('edges', mk, mk, true, 'marks.edges'),
        lanes: bool('lanes', mk, mk, true, 'marks.lanes'),
      },
    };
    if (!isNum(seats.bridge.depth) || seats.bridge.depth < 0.1 || seats.bridge.depth > 3) err(`${p}.bridge.depth`, 'must be 0.1..3 m');
    if (seats.guard.postSpacing < 1 || seats.guard.postSpacing > 10) err(`${p}.guard.postSpacing`, 'must be 1..10 m');
    if (seats.bridge.pierSpacing < 4 || seats.bridge.pierSpacing > 80) err(`${p}.bridge.pierSpacing`, 'must be 4..80 m');
    if (seats.drain.gullySpacing < 4 || seats.drain.gullySpacing > 100) err(`${p}.drain.gullySpacing`, 'must be 4..100 m');
    project.roads.push(seats);
  });

  const as = Array.isArray(raw.areas) ? raw.areas : (raw.areas === undefined ? [] : (err('areas', 'must be an array'), []));
  as.forEach((a, i) => {
    const p = `areas[${i}]`;
    uniq(a && a.id, `${p}.id`);
    const pts = Array.isArray(a && a.pts) ? a.pts : [];
    if (pts.length < 3) err(`${p}.pts`, 'needs at least three [x, z] points');
    const clean = pts
      .map((q, k) => {
        if (!Array.isArray(q) || !isNum(q[0]) || !isNum(q[1])) {
          err(`${p}.pts[${k}]`, 'must be [x, z] numbers');
          return null;
        }
        return [round(q[0]), round(q[1])];
      })
      .filter(Boolean);
    project.areas.push({
      id: String(a.id),
      name: typeof a.name === 'string' ? a.name : String(a.id),
      pts: clean,
      y: isNum(a.y) ? round(a.y) : 0,
      pattern: PATTERNS.includes(a.pattern) ? a.pattern : 'slab',
      colour: HEX.test(a.colour) ? a.colour : '#c9c4b8',
    });
  });
  return { project: errors.length ? null : project, errors };
}

/** stable JSON text: fixed key order comes from normalizeProject; numbers rounded to 1e-6 */
export function exportProject(project) {
  return JSON.stringify(project, null, 2) + '\n';
}

/** the sample network shown on first load: a crossroads with an overpass and a plaza */
export function sampleProject() {
  const p = emptyProject('Sample crossroads');
  p.junctions = [
    defaultJunction('J1', -60, 0),
    defaultJunction('J2', 60, 0),
    defaultJunction('J3', 0, -60),
    defaultJunction('J4', 0, 60),
    defaultJunction('J5', 0, 0, { radius: 8, y: 0 }),
  ];
  p.roads = [
    defaultRoad('R1', 'J1', 'J5', { lanesL: 1, lanesR: 1, bridge: { on: false, from: 0, to: null, depth: 0.9, pierSpacing: 18, pierW: 1.2 }, guard: { on: true, side: 'both', offset: 0.3, postSpacing: 2.5 }, drain: { gullies: true, gullySpacing: 24, pipes: true, pipeDepth: 0.9, pipeSize: 0.3 } }),
    defaultRoad('R2', 'J5', 'J2', { lanesL: 1, lanesR: 1 }),
    defaultRoad('R3', 'J3', 'J5', { lanesL: 1, lanesR: 1 }),
    defaultRoad('R4', 'J5', 'J4', { lanesL: 1, lanesR: 1 }),
  ];
  p.areas = [{ id: 'A1', name: 'Plaza', pts: [[-30, 30], [-12, 30], [-12, 46], [-30, 46]], y: 0, pattern: 'herringbone', colour: '#b8a890' }];
  return normalizeProject(JSON.parse(JSON.stringify(p))).project;
}
