import fs from 'node:fs';
import {parseProject} from '../src/io.js';
import {sampleRoad} from '../src/spline.js';
import {buildTopology} from '../src/topology.js';
import {buildNetworkMesh} from '../src/geometry.js';
import {validateProject} from '../src/validate.js';

const file = process.argv[2] || 'public/samples/diamond-interchange.road.json';
const p = parseProject(fs.readFileSync(file, 'utf8')).project;
const samples = new Map(p.roads.map((r) => [r.id, sampleRoad(r.points, {closed: r.closed, step: 1})]));
const topo = buildTopology(p, samples);
console.log('intersections:', topo.intersections.map((i) => `${i.kind}/legs${i.legs.length}@(${i.x.toFixed(0)},${i.z.toFixed(0)})`).join(' '));
console.log('overpasses:', topo.overpasses.map((o) => `${o.upper}>${o.lower} gap=${o.gap.toFixed(1)}`).join(' '));
console.log('bridges:', JSON.stringify(topo.bridges.map((b) => [b.roadId, Math.round(b.s0), Math.round(b.s1)])));
console.log('runs:', [...topo.runs].map(([id, r]) => `${id}:${r.length}`).join(' '));
const terrain = {size: 800, seg: 8, heightAt: () => 0};
const {parts, stats} = buildNetworkMesh(p, samples, topo, terrain);
let nan = 0;
for (const q of parts) for (const v of q.positions) if (!Number.isFinite(v)) nan++;
console.log('parts:', parts.length, 'tris:', stats.triangles, 'NaN verts:', nan,
  'junctions:', stats.junctions, 'bridges:', stats.bridges);
const issues = validateProject(p, topo);
console.log('issues:', issues.map((i) => `${i.severity}:${i.code}@${i.roadName || ''}`).join(' ') || '(none)');
