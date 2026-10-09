// Project model: nodes (junctions), roads, interchanges and terrain settings.
// Plain JSON data, so the document can be saved, undone and round-tripped as-is.

import { ROAD_DEFAULTS, withRoadDefaults } from '../geom/profile.js';
import { makeTerrain } from '../geom/terrain.js';

export const FORMAT = 'frontier-road-editor';
export const VERSION = 1;

export const NODE_DEFAULTS = { radius: 8, steps: 8 };

export const TERRAIN_DEFAULTS = { mode: 'rolling', amplitude: 2.4, wavelength: 180, seed: 7, base: 0 };

export function createProject(name = 'Untitled road network') {
  return {
    format: FORMAT,
    version: VERSION,
    name,
    units: 'm',
    up: 'Y',
    clearance: 5.5,
    terrain: { ...TERRAIN_DEFAULTS },
    nodes: [],
    roads: [],
    interchanges: [],
    seq: 0,
  };
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

export function nextId(project, prefix) {
  project.seq = (project.seq || 0) + 1;
  return `${prefix}${project.seq}`;
}

export function findNode(project, id) {
  return project.nodes.find((n) => n.id === id) || null;
}

export function findRoad(project, id) {
  return project.roads.find((r) => r.id === id) || null;
}

export function addNode(project, { x = 0, y = 0, z = 0, name, radius, steps } = {}) {
  const id = nextId(project, 'n');
  const node = {
    id,
    name: name || `Node ${project.nodes.length + 1}`,
    x: num(x),
    y: num(y),
    z: num(z),
    radius: num(radius, NODE_DEFAULTS.radius),
    steps: num(steps, NODE_DEFAULTS.steps),
  };
  project.nodes.push(node);
  return node;
}

// Create a road between two nodes. Props use road defaults; points are {x,y,z}.
export function addRoad(project, { from, to, points = [], name, ...props } = {}) {
  const id = nextId(project, 'r');
  const road = withRoadDefaults({
    id,
    name: name || `Road ${project.roads.length + 1}`,
    from,
    to,
    points: points.map((p) => ({ x: num(p.x), y: num(p.y), z: num(p.z) })),
    ...cleanRoadProps(props),
  });
  project.roads.push(road);
  return road;
}

function cleanRoadProps(props) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    if (k in ROAD_DEFAULTS) out[k] = typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v;
  }
  return out;
}

export function removeNode(project, id) {
  const roads = project.roads.filter((r) => r.from === id || r.to === id).map((r) => r.id);
  project.nodes = project.nodes.filter((n) => n.id !== id);
  for (const ix of project.interchanges) ix.nodes = ix.nodes.filter((n) => n !== id);
  for (const rid of roads) removeRoad(project, rid);
  return roads;
}

export function removeRoad(project, id) {
  project.roads = project.roads.filter((r) => r.id !== id);
  for (const ix of project.interchanges) {
    ix.roads = ix.roads.filter((r) => r !== id);
  }
  project.interchanges = project.interchanges.filter((ix) => ix.roads.length || ix.nodes.length);
}

export function moveNode(project, id, pos) {
  const n = findNode(project, id);
  if (!n) return false;
  if (pos.x !== undefined) n.x = num(pos.x, n.x);
  if (pos.y !== undefined) n.y = num(pos.y, n.y);
  if (pos.z !== undefined) n.z = num(pos.z, n.z);
  return true;
}

export function setNodeProps(project, id, patch) {
  const n = findNode(project, id);
  if (!n) return false;
  if (patch.name !== undefined) n.name = String(patch.name);
  for (const k of ['x', 'y', 'z']) if (patch[k] !== undefined) n[k] = num(patch[k], n[k]);
  if (patch.radius !== undefined) n.radius = Math.max(0, num(patch.radius, n.radius));
  if (patch.steps !== undefined) n.steps = Math.min(24, Math.max(2, Math.round(num(patch.steps, n.steps))));
  return true;
}

export function setRoadProps(project, id, patch) {
  const r = findRoad(project, id);
  if (!r) return false;
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'id' || k === 'from' || k === 'to' || k === 'points') continue;
    if (k === 'name') r.name = String(v);
    else if (k in ROAD_DEFAULTS) {
      if (typeof ROAD_DEFAULTS[k] === 'object' && ROAD_DEFAULTS[k] !== null) r[k] = { ...(r[k] || {}), ...v };
      else r[k] = v;
    }
  }
  return true;
}

// Interior points of a road. Index is the position in the list.
export function insertRoadPoint(project, roadId, index, pos) {
  const r = findRoad(project, roadId);
  if (!r) return false;
  const p = { x: num(pos.x), y: num(pos.y), z: num(pos.z) };
  r.points.splice(Math.max(0, Math.min(index, r.points.length)), 0, p);
  return true;
}

export function moveRoadPoint(project, roadId, index, pos) {
  const r = findRoad(project, roadId);
  if (!r || !r.points[index]) return false;
  Object.assign(r.points[index], { x: num(pos.x), y: num(pos.y), z: num(pos.z) });
  return true;
}

export function removeRoadPoint(project, roadId, index) {
  const r = findRoad(project, roadId);
  if (!r || !r.points[index]) return false;
  r.points.splice(index, 1);
  return true;
}

// Validate a project. Returns { errors: [], warnings: [] }.
export function validateProject(project) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  for (const n of project.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate id ${n.id}`);
    ids.add(n.id);
    for (const k of ['x', 'y', 'z']) if (!Number.isFinite(n[k])) errors.push(`node ${n.id} has a non-numeric ${k}`);
  }
  const nodeIds = new Set(project.nodes.map((n) => n.id));
  for (const r of project.roads) {
    if (ids.has(r.id)) errors.push(`duplicate id ${r.id}`);
    ids.add(r.id);
    if (!nodeIds.has(r.from) || !nodeIds.has(r.to)) errors.push(`road ${r.id} references a missing node`);
    if (r.from === r.to) errors.push(`road ${r.id} starts and ends at the same node`);
    for (const p of r.points || []) {
      if (![p.x, p.y, p.z].every(Number.isFinite)) errors.push(`road ${r.id} has a non-numeric point`);
    }
  }
  for (const ix of project.interchanges || []) {
    for (const rid of ix.roads || []) if (!ids.has(rid)) warnings.push(`interchange ${ix.name} lists missing road ${rid}`);
  }
  return { errors, warnings };
}

// Accept any saved document and return a clean project with defaults filled in.
export function migrateProject(raw) {
  const src = raw && raw.project && raw.format ? raw.project : raw;
  if (!src || typeof src !== 'object') throw new Error('not a project document');
  if (!Array.isArray(src.nodes) || !Array.isArray(src.roads)) throw new Error('project needs nodes and roads arrays');
  const project = createProject(String(src.name || 'Imported network'));
  project.clearance = Math.max(3, num(src.clearance, 5.5));
  project.terrain = { ...TERRAIN_DEFAULTS, ...(src.terrain || {}) };
  for (const k of ['amplitude', 'wavelength', 'seed', 'base']) project.terrain[k] = num(project.terrain[k], TERRAIN_DEFAULTS[k]);
  project.nodes = src.nodes.map((n, i) => ({
    id: String(n.id ?? `n${i + 1}`),
    name: String(n.name ?? n.id ?? `Node ${i + 1}`),
    x: num(n.x),
    y: num(n.y),
    z: num(n.z),
    radius: Math.max(0, num(n.radius, NODE_DEFAULTS.radius)),
    steps: Math.min(24, Math.max(2, Math.round(num(n.steps, NODE_DEFAULTS.steps)))),
  }));
  project.roads = src.roads.map((r, i) => {
    const merged = withRoadDefaults(r);
    const out = {
      id: String(r.id ?? `r${i + 1}`),
      name: String(r.name ?? r.id ?? `Road ${i + 1}`),
      from: String(r.from),
      to: String(r.to),
      points: (r.points || []).map((p) => ({ x: num(p.x), y: num(p.y), z: num(p.z) })),
    };
    for (const k of Object.keys(ROAD_DEFAULTS)) out[k] = merged[k];
    return out;
  });
  project.interchanges = (src.interchanges || []).map((ix, i) => ({
    id: String(ix.id ?? `x${i + 1}`),
    name: String(ix.name ?? `Interchange ${i + 1}`),
    roads: Array.isArray(ix.roads) ? ix.roads.map(String) : [],
    nodes: Array.isArray(ix.nodes) ? ix.nodes.map(String) : [],
  }));
  // keep the id sequence ahead of any existing ids
  let seq = num(src.seq, 0);
  for (const id of [...project.nodes, ...project.roads].map((e) => e.id)) {
    const m = /(\d+)$/.exec(id);
    if (m) seq = Math.max(seq, Number(m[1]));
  }
  project.seq = seq;
  return project;
}

export function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

// Demo network used on first load and from the Construct menu.
export function sampleProject(kind = 'crossroads') {
  const p = createProject(kind === 'valley' ? 'Valley crossing' : 'Crossroads village');
  if (kind === 'valley') {
    p.terrain = { mode: 'rolling', amplitude: 4.5, wavelength: 150, seed: 11, base: 0 };
    const g = makeTerrain(p.terrain).height;
    const w = addNode(p, { name: 'West', x: -230, y: g(-230, 0) + 0.4, z: 0 });
    const e = addNode(p, { name: 'East', x: 230, y: g(230, 0) + 0.4, z: 0 });
    // the valley span is raised 8 m above the ground; the approaches are at grade
    const lift = (x) => g(x, 0) + 0.4 + 8 * Math.max(0, 1 - Math.abs(x) / 130);
    addRoad(p, { name: 'Valley road', from: w.id, to: e.id, points: [-110, -60, 0, 60, 110].map((x) => ({ x, y: lift(x), z: 0 })), lanes: 2, laneWidth: 3.5, curb: 'none', bridge: { mode: 'auto', threshold: 2.5 }, guardrail: { mode: 'auto', type: 'w-beam', embankHeight: 2 } });
    return p;
  }
  p.terrain = { mode: 'rolling', amplitude: 2.4, wavelength: 180, seed: 7, base: 0 };
  const nW = addNode(p, { name: 'West gate', x: -170, y: 1, z: 0 });
  const nE = addNode(p, { name: 'East gate', x: 170, y: 1, z: 0 });
  const nC = addNode(p, { name: 'Crossroads', x: 0, y: 1, z: 0, radius: 9, steps: 10 });
  const nN = addNode(p, { name: 'North end', x: 0, y: 1, z: -150 });
  const nS = addNode(p, { name: 'South end', x: 0, y: 1, z: 150 });
  const nT = addNode(p, { name: 'T-junction', x: 90, y: 1, z: 110, radius: 7, steps: 8 });
  const nB = addNode(p, { name: 'Bend', x: -120, y: 1, z: 110, radius: 10, steps: 8 });
  const nD = addNode(p, { name: 'Cul-de-sac', x: -120, y: 1, z: 200 });
  addRoad(p, { name: 'High street', from: nW.id, to: nC.id, points: [{ x: -90, y: 1, z: 6 }] });
  addRoad(p, { name: 'High street (east)', from: nC.id, to: nE.id, points: [{ x: 90, y: 1, z: -4 }], curb: 'low', sidewalk: 2, drainage: { mode: 'curbs', ditchWidth: 1.2, ditchDepth: 0.5, inletSpacing: 25 } });
  addRoad(p, { name: 'North road', from: nN.id, to: nC.id, points: [], lanes: 1, curb: 'none', drainage: { mode: 'ditches', ditchWidth: 1.2, ditchDepth: 0.5 }, shoulder: 1 });
  addRoad(p, { name: 'South road', from: nC.id, to: nS.id, points: [{ x: 6, y: 1, z: 60 }, { x: -4, y: 1, z: 110 }], curb: 'low', sidewalk: 2 });
  addRoad(p, { name: 'Side street', from: nC.id, to: nT.id, points: [{ x: 45, y: 1, z: 40 }] });
  addRoad(p, { name: 'Lane to bend', from: nS.id, to: nB.id, points: [{ x: -40, y: 1, z: 130 }], lanes: 1, curb: 'none', drainage: { mode: 'ditches' } });
  addRoad(p, { name: 'Cul-de-sac road', from: nB.id, to: nD.id, points: [], lanes: 1, curb: 'none', drainage: { mode: 'ditches' }, shoulder: 0.5 });
  return p;
}
