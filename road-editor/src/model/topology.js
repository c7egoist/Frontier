// Topology operations on the project graph:
//  - splitRoad: cut a road at stations, creating nodes (used by the operations below)
//  - commitAtGrade: crossings that are not grade separated become junctions
//  - createInterchange: a diamond with a bridge over the lower road and four ramps
//
// All of these work from a built network (buildNetwork) so that stations and
// positions agree with what is drawn.

import { buildNetwork } from '../geom/network.js';
import { addNode, addRoad, findRoad, nextId } from './project.js';
import { ROAD_DEFAULTS } from '../geom/profile.js';

const PROP_KEYS = Object.keys(ROAD_DEFAULTS);

function roadProps(road) {
  const out = {};
  for (const k of PROP_KEYS) out[k] = JSON.parse(JSON.stringify(road[k] ?? ROAD_DEFAULTS[k]));
  return out;
}

// cuts: [{ s, node: nodeId }] on the road's centreline (stations from the 'from' node).
// Returns the ids of the pieces in order from -> to.
export function splitRoad(project, roadId, cuts, net) {
  const road = findRoad(project, roadId);
  if (!road) throw new Error(`no road ${roadId}`);
  const rb = net.roads.find((r) => r.id === roadId);
  if (!rb) throw new Error(`road ${roadId} has no geometry`);
  const sorted = cuts.slice().sort((a, b) => a.s - b.s);
  for (const c of sorted) {
    if (!(c.s > rb.s0 + 0.5 && c.s < rb.s1 - 0.5)) throw new Error(`cut at ${c.s.toFixed(1)} m is outside ${road.name}`);
  }
  const nodeIds = [road.from, ...sorted.map((c) => c.node), road.to];
  const bounds = sorted.map((c) => c.s);
  const pieces = [];
  for (let k = 0; k <= sorted.length; k++) pieces.push({ points: [] });
  const firstKept = rb.userStations.findIndex((s) => s !== null);
  road.points.forEach((p, i) => {
    const s = rb.userStations[i];
    let k;
    if (s === null || s === undefined) {
      k = firstKept >= 0 && i < firstKept ? 0 : sorted.length;
    } else {
      k = 0;
      while (k < bounds.length && s > bounds[k]) k++;
    }
    pieces[k].points.push({ x: p.x, y: p.y, z: p.z });
  });
  const props = roadProps(road);
  const baseName = road.name;
  const idx = project.roads.findIndex((r) => r.id === roadId);
  const created = [];
  for (let k = 0; k < pieces.length; k++) {
    created.push(
      addRoad(project, {
        name: `${baseName} (${k + 1})`,
        from: nodeIds[k],
        to: nodeIds[k + 1],
        points: pieces[k].points,
        ...props,
      })
    );
  }
  // replace the original in place to keep the outliner order
  project.roads.splice(project.roads.length - created.length, created.length);
  project.roads.splice(idx, 1, ...created);
  // interchange membership follows the pieces
  for (const ix of project.interchanges) {
    if (ix.roads.includes(roadId)) ix.roads = ix.roads.flatMap((r) => (r === roadId ? created.map((c) => c.id) : [r]));
  }
  return created.map((c) => c.id);
}

// Crossings whose surfaces are closer than the clearance become junctions.
export function commitAtGrade(project, maxIter = 40) {
  let count = 0;
  for (let i = 0; i < maxIter; i++) {
    const net = buildNetwork(project);
    const c = net.crossings.find((x) => x.grade === 'at-grade');
    if (!c) break;
    const node = addNode(project, { name: `Crossing ${count + 1}`, x: c.x, y: (c.yA + c.yB) / 2, z: c.z, radius: 8, steps: 8 });
    splitRoad(project, c.a, [{ s: c.sA, node: node.id }], net);
    splitRoad(project, c.b, [{ s: c.sB, node: node.id }], net);
    count++;
  }
  return count;
}

// Interchange: the upper road gets a bridge over the lower road; the lower road
// is split at two nodes; four ramps join the upper and lower nodes into a diamond.
export function createInterchange(project, net, { upper, lower, sU, sL, offset = 75, name } = {}) {
  const ru = net.roads.find((r) => r.id === upper);
  const rl = net.roads.find((r) => r.id === lower);
  if (!ru || !rl) throw new Error('both roads must exist');
  const clear = project.clearance ?? 5.5;
  const deck = (findRoad(project, upper)?.bridge?.deckThickness ?? 0.9) + 0.6;
  const yLow = rl.cl.at(sL).p[1];
  const yUp = yLow + clear + deck;
  const clampU = (s) => Math.min(ru.s1 - 8, Math.max(ru.s0 + 8, s));
  const clampL = (s) => Math.min(rl.s1 - 8, Math.max(rl.s0 + 8, s));
  const sW = clampU(sU - offset);
  const sE = clampU(sU + offset);
  const sN = clampL(sL - offset);
  const sS = clampL(sL + offset);
  if (!(sE - sW > 10 && sS - sN > 10)) throw new Error('roads are too short for an interchange here');
  const pW = ru.cl.at(sW).p;
  const pE = ru.cl.at(sE).p;
  const pN = rl.cl.at(sN).p;
  const pS = rl.cl.at(sS).p;
  const W = addNode(project, { name: `${name || 'Interchange'} · west`, x: pW[0], y: yUp, z: pW[2], radius: 3, steps: 8 });
  const E = addNode(project, { name: `${name || 'Interchange'} · east`, x: pE[0], y: yUp, z: pE[2], radius: 3, steps: 8 });
  const N = addNode(project, { name: `${name || 'Interchange'} · north`, x: pN[0], y: pN[1], z: pN[2], radius: 3, steps: 8 });
  const S = addNode(project, { name: `${name || 'Interchange'} · south`, x: pS[0], y: pS[1], z: pS[2], radius: 3, steps: 8 });

  const upperIds = splitRoad(project, upper, [{ s: sW, node: W.id }, { s: sE, node: E.id }], net);
  const lowerIds = splitRoad(project, lower, [{ s: sN, node: N.id }, { s: sS, node: S.id }], net);

  // the bridge piece gets a point at the crossing so the deck is level over the road
  const mid = findRoad(project, upperIds[1]);
  if (mid && mid.points.length === 0) {
    const pX = ru.cl.at(sU).p;
    mid.points.push({ x: pX[0], y: yUp, z: pX[2] });
  }
  const ramps = [];
  const rampPairs = [
    [W, N],
    [N, E],
    [E, S],
    [S, W],
  ];
  const short = (node) => {
    const word = node.name.split('·').pop().trim().toLowerCase();
    return { west: 'W', east: 'E', north: 'N', south: 'S' }[word] || word.slice(0, 1).toUpperCase();
  };
  for (const [a, b] of rampPairs) {
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const my = (a.y + b.y) / 2;
    const r = addRoad(project, {
      name: `Ramp ${short(a)}–${short(b)}`,
      from: a.id,
      to: b.id,
      points: [{ x: mx, y: my, z: mz }],
      lanes: 1,
      laneWidth: 4.2,
      shoulder: 0.5,
      curb: 'none',
      drainage: { mode: 'ditches', ditchWidth: 1.2, ditchDepth: 0.5, inletSpacing: 25 },
      guardrail: { mode: 'auto', type: 'w-beam', embankHeight: 2 },
    });
    ramps.push(r.id);
  }
  const id = nextId(project, 'x');
  const record = {
    id,
    name: name || `Interchange ${project.interchanges.length + 1}`,
    roads: [...upperIds, ...lowerIds, ...ramps],
    nodes: [W.id, E.id, N.id, S.id],
  };
  project.interchanges.push(record);
  return record;
}

// Convenience: find a crossing between two named roads in a built network.
export function findCrossing(net, a, b) {
  return net.crossings.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)) || null;
}

