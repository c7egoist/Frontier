import fs from 'node:fs';
const P = (x, z, y) => ({x, z, y, w: 1});
const B = (x, z, y) => ({x, z, y, w: 1, bridge: true});
// NE ramp quadrant template (x>=0, z<=0), mirrored for the other three.
const rampNE = [P(70, 0, 0), P(52, -12, 1.2), P(36, -30, 2.9), P(24, -52, 4.6), P(12, -72, 6.3), P(0, -80, 7)];
const mir = (pts, sx, sz) => pts.map((p) => P(p.x * sx, p.z * sz, p.y));
const ramp = (id, name, pts) => ({
  id, name, color: '#e8c26a', visible: true, closed: false,
  lanes: 2, laneWidth: 3.25, shoulderL: 1, shoulderR: 1, kerbL: false, kerbR: false, camber: 0.05,
  surface: 'asphalt', centerMarking: 'single', edgeMarking: true, guardrailL: true, guardrailR: true,
  bridgeParapet: 'rail', bridgeSpacing: 12, conform: 'design', drapeOffset: 0.15, points: pts,
});
const project = {
  format: 'frontier-road-network', version: 1, units: 'meters', up: '+Y',
  name: 'Diamond Interchange', nextId: 7,
  roads: [
    {id: 'r1', name: 'Freeway E-W', color: '#6aa8e8', visible: true, closed: false,
     lanes: 4, laneWidth: 3.5, shoulderL: 2.5, shoulderR: 2.5, kerbL: false, kerbR: false, camber: 0.04,
     surface: 'asphalt', centerMarking: 'double', edgeMarking: true, guardrailL: true, guardrailR: true,
     bridgeParapet: 'rail', bridgeSpacing: 12, conform: 'design', drapeOffset: 0.15,
     points: [P(-160, 0, 0), P(160, 0, 0)]},
    {id: 'r2', name: 'Crossroad N-S', color: '#7ee7a5', visible: true, closed: false,
     lanes: 2, laneWidth: 3.5, shoulderL: 1.5, shoulderR: 1.5, kerbL: false, kerbR: false, camber: 0.05,
     surface: 'asphalt', centerMarking: 'dashed', edgeMarking: true, guardrailL: true, guardrailR: true,
     bridgeParapet: 'solid', bridgeSpacing: 14, conform: 'design', drapeOffset: 0.15,
     points: [P(0, -160, 2.5), P(0, -100, 7), B(0, -60, 7), B(0, 60, 7), P(0, 100, 7), P(0, 160, 2.5)]},
    ramp('r3', 'Ramp NE', rampNE),
    ramp('r4', 'Ramp NW', mir(rampNE, -1, 1)),
    ramp('r5', 'Ramp SE', mir(rampNE, 1, -1)),
    ramp('r6', 'Ramp SW', mir(rampNE, -1, -1)),
  ],
  junctions: [], heightmap: null,
  settings: {cornerRadius: 6}, intersectionOverrides: {},
};
fs.writeFileSync('public/samples/diamond-interchange.road.json', JSON.stringify(project, null, 1) + '\n');
console.log('wrote', project.roads.length, 'roads');
