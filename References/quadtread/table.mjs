import { buildTread, toOBJ } from './quadmesh.mjs';
import { compile } from './quadcore.mjs';
import { DESIGNS, BASE_T } from './_htmlcore.mjs';
const T = { ...BASE_T };
console.log('| design | grid (rows×cols) | quads / pitch | ring quads @'+T.pitches+' | mirrored | open | pitch mm |');
console.log('|---|---|---|---|---|---|---|');
for (const D of DESIGNS) {
  compile(T, D);
  const B = buildTread(T, D, { stage: 4 });
  const s = B.stats;
  const fl = toOBJ(B).split('\n').filter(l => l[0] === 'f').length;
  console.log(`| \`${D.id}\` | ${s.rows}×${s.cols} | ${s.quadsTile.toLocaleString('en')} | ${s.quads.toLocaleString('en')} | ${s.mirroredFaces.toLocaleString('en')} | ${s.open} (=2K) | ${(s.variablePitch ? s.pitchMin.toFixed(1)+'–'+s.pitchMax.toFixed(1) : s.pitch.toFixed(1))} |`);
}
