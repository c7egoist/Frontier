// Proves the long-road fixture is a true trap: the OLD stride scan misses it,
// the grid scan finds it.
import {sampleRoad, segmentsTouch} from '../src/spline.js';

const A = sampleRoad([{x: -551.5, z: 0, y: 0, w: 1}, {x: 550.5, z: 0, y: 0, w: 1}], {step: 1});
const B = sampleRoad([{x: 0, z: -551.5, y: 0, w: 1}, {x: 0, z: 550.5, y: 0, w: 1}], {step: 1});
const aS = A.samples, bS = B.samples;
const endA = aS.length - 1, endB = bS.length - 1;
const stride = Math.max(1, Math.ceil(Math.sqrt((endA * endB) / 400000)));
let oldFound = 0;
for (let i = 0; i < endA; i += stride) {
  for (let k = 0; k < endB; k += stride) {
    if (segmentsTouch(aS[i], aS[i + 1], bS[k], bS[k + 1], 1e-6)) oldFound++;
  }
}
const {gridPairs} = await import('../src/topology.js');
let gridFound = 0;
for (const [i, k] of gridPairs(aS, endA, bS, endB, false)) {
  if (segmentsTouch(aS[i], aS[i + 1], bS[k], bS[k + 1], 1e-6)) gridFound++;
}
console.log(`segs=${endA}x${endB} oldStride=${stride} oldFound=${oldFound} gridFound=${gridFound}`);
console.log(oldFound === 0 && gridFound > 0 ? 'TRAP VALID' : 'TRAP BOGUS');
