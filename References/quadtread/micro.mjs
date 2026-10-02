import { buildTread } from './quadmesh.mjs';
import { t } from './harness.mjs';

// smallest possible pattern that exercises a chamfered block corner: one rib, one gap, no sipes, no grooves
const D = {
  id: 'micro', label: 'micro', shear: 'none', mir: 'none',
  lanes: [{ w: 1, kind: 'rib', blocks: { n: 1, w: 0.3, level: 'floor' } }],
};
for (const cfg of [
  { bevel: 0, cham: 0 }, { bevel: 0, cham: 0.8 }, { bevel: 1, cham: 0.8 }, { bevel: 1, cham: 0 },
]) {
  const T = t({ ...cfg, xsub: 8, usub: 0, pitches: 8, cap: false });
  const B = buildTread(T, D, { stage: 3 });
  const s = B.stats;
  console.log(`bevel ${cfg.bevel} cham ${cfg.cham} → quads ${s.quadsTile} open ${s.open} nonMan ${s.nonManifold} inconsist ${s.inconsistent} pinch ${s.pinched} degen ${s.degenerate}`);
}

// dump every face touching one open edge
const T = t({ bevel: 1, cham: 0.8, xsub: 8, usub: 0, pitches: 8, cap: false });
const B = buildTread(T, D, { stage: 3 });
const G = B.grid, RL = B.RL;
const desc = r => `${RL[r].lvl}${RL[r].full ? 'f' : ''}@${RL[r].j},${RL[r].i}`;
const byEdge = new Map();
B.F.forEach((f, i) => {
  const r4 = f.c.map(c => c[0]);
  for (let k = 0; k < 4; k++) {
    const a = r4[k], b = r4[(k + 1) % 4];
    if (a === b) continue;
    const key = Math.min(a, b) + '_' + Math.max(a, b);
    (byEdge.get(key) || byEdge.set(key, []).get(key)).push(i);
  }
});
const rims = new Set();
for (let i = 0; i < G.K; i++) { rims.add(G.ring(0, i, G.kOf[G.cells[0][i]])); rims.add(G.ring(G.M - 1, i, G.kOf[G.cells[G.cells.length - 1][i]])); }
const openInner = [...byEdge.entries()].filter(([k, v]) => { const [a, b] = k.split('_').map(Number); return v.length === 1 && !rims.has(a) && !rims.has(b); });
console.log('\ninner open edges:', openInner.length);
for (const [k, v] of openInner.slice(0, 5)) {
  const [a, b] = k.split('_').map(Number);
  console.log(`  ${desc(a)} <-> ${desc(b)}  on face#${v[0]} corners ${B.F[v[0]].c.map(c => desc(c[0]) + '@t' + c[1]).join(' ')}`);
}
// levels map for the first bands
console.log('\nrows', G.M, 'cols', G.K);
for (let b = 0; b < Math.min(6, G.cells.length); b++) console.log(' band', b, 'x', G.xs[b].toFixed(1), '→', G.xs[b + 1].toFixed(1), 'cells', G.cells[b].join(','));

// dump the remaining orientation conflicts
{
  const ed = new Map();
  const seen = new Set();
  B.F.forEach((f, i) => {
    const r0 = f.c.map(c => c[0]);
    const sig = f.set + ':' + [...r0].sort((a,b)=>a-b).join(',');
    if (seen.has(sig)) return; seen.add(sig);
    for (let k = 0; k < 4; k++) {
      const a = r4k(r0, k), b = r4k(r0, (k + 1) % 4); if (a === b) continue;
      const key = Math.min(a,b)+'_'+Math.max(a,b);
      const e = ed.get(key) || { n: 0, s: 0, fs: [] }; ed.set(key, e); e.n++; e.s += a < b ? 1 : -1; e.fs.push(i);
    }
  });
  function r4k(r4, k) { return r4[k]; }
  let c = 0;
  for (const [k, e] of ed) if (e.n === 2 && e.s !== 0 && c++ < 8) {
    const [a, b] = k.split('_').map(Number);
    console.log(`CONFLICT ${desc(a)}(${a})<->${desc(b)}(${b})  roles ${B.F[e.fs[0]].role}/${B.F[e.fs[1]].role} tiles ${B.F[e.fs[0]].tile}/${B.F[e.fs[1]].tile}`);
    for (const fi of e.fs) console.log(`    f${fi} set${B.F[fi].set} ${B.F[fi].c.map(cc => desc(cc[0]) + '@t' + cc[1]).join(' ')}`);
  }
}
