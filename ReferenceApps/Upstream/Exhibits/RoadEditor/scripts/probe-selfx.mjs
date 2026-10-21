import {newProject, defaultRoad} from '../src/io.js';
import {sampleRoad} from '../src/spline.js';
import {buildTopology} from '../src/topology.js';
import {buildNetworkMesh} from '../src/geometry.js';

const mk = (dy) => {
  const p = newProject('t');
  p.roads = [defaultRoad('r1', 1, {lanes: 2, laneWidth: 3.5, points: [
    {x: -40, z: -40, y: 0}, {x: 40, z: 40, y: 0}, {x: -40, z: 40, y: dy}, {x: 40, z: -40, y: dy},
  ]})];
  return p;
};
for (const dy of [0, 5]) {
  const p = mk(dy);
  const samples = new Map(p.roads.map((r) => [r.id, sampleRoad(r.points, {step: 1})]));
  const topo = buildTopology(p, samples);
  const terrain = {size: 400, seg: 8, heightAt: () => 0};
  const {parts, stats} = buildNetworkMesh(p, samples, topo, terrain);
  let nan = 0;
  for (const q of parts) for (const v of q.positions) if (!Number.isFinite(v)) nan++;
  console.log(`dy=${dy} | ix: ${topo.intersections.map((i) => `${i.kind}/legs${i.legs.length}`).join(',') || '(none)'}` +
    ` | over: ${topo.overpasses.length} | runs: ${topo.runs.get('r1').length}` +
    ` | parts: ${parts.length} tris: ${stats.triangles} NaN: ${nan}`);
}
