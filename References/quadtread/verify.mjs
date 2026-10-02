import { buildTread, toOBJ } from './quadmesh.mjs';
import { t } from './harness.mjs';

const lane = (o = {}) => ({ w: 1, kind: 'rib', base: 'top', chev: 0, ...o });

/* ---- where are the pinches? ---------------------------------------------- */
const Dprobe = {
  id: 'probe', label: 'probe', shear: 'v', shift: 0.5,
  lanes: [
    lane({ w: 0.10, sipes: { n: 2, w: 0.03 } }),
    { w: 0.05, kind: 'groove' },
    lane({ w: 0.30, chev: 1, blocks: { n: 3, w: 0.18, at: [0.06, 0.94], taper: 0.1, level: 'floor' } }),
    { w: 0.05, kind: 'groove' },
    lane({ w: 0.50, chev: 0.5, blocks: { n: 2, w: 0.22, level: 'floor' }, sipes: { n: 4, w: 0.02 } }),
  ],
};
{
  const T = t({ chevron: 26 });
  const B = buildTread(T, Dprobe, { stage: 3 });
  const G = B.grid, RL = B.RL, K = G.K;
  const lvlAt = (j, i) => (j < 0 || j >= G.cells.length ? '-' : G.cells[j][((i % K) + K) % K]);
  const ed = new Map();
  const vE = new Map(), vF = new Map();
  const seen = new Set();
  B.F.forEach((f, fi) => {
    const r = f.c.map(c => c[0]);
    const sig = f.set + ':' + [...r].sort((a, b) => a - b).join(',');
    if (seen.has(sig)) return; seen.add(sig);
    for (let k = 0; k < 4; k++) {
      const a = r[k], b = r[(k + 1) % 4]; if (a === b) continue;
      const key = Math.min(a, b) + '_' + Math.max(a, b);
      ed.set(key, (ed.get(key) || 0) + 1);
      for (const v of [a, b]) { (vE.get(v) || vE.set(v, new Set()).get(v)).add(key); (vF.get(v) || vF.set(v, new Set()).get(v)).add(fi); }
    }
  });
  const rims = new Set();
  for (let i = 0; i < K; i++) { rims.add(G.ring(0, i, G.kOf[G.cells[0][i]])); rims.add(G.ring(G.M - 1, i, G.kOf[G.cells[G.cells.length - 1][i]])); }
  const pin = [...vE.keys()].filter(v => !rims.has(v) && vE.get(v).size !== vF.get(v).size);
  const kinds = new Map();
  for (const v of pin) {
    const { j, i } = RL[v];
    const quad4 = [lvlAt(j - 1, i), lvlAt(j - 1, i + 1), lvlAt(j, i), lvlAt(j, i + 1)];
    const key = [...new Set(quad4)].sort().join('/');
    kinds.set(key, (kinds.get(key) || 0) + 1);
  }
  console.log('pinch vertices', pin.length, 'by incident-level set:', [...kinds.entries()].sort((a, b) => b[1] - a[1]));
  for (const v of pin.slice(0, 4)) {
    const { j, i } = RL[v];
    console.log(`  node j=${j} i=${i} x=${G.xs[j].toFixed(1)} u=${(G.xs === undefined ? 0 : 0)}  levels tl,tr,bl,br = ${[lvlAt(j - 1, i), lvlAt(j - 1, i + 1), lvlAt(j, i), lvlAt(j, i + 1)].join(',')}`);
  }
}

/* ---- the matrix: a tread with the cap off is a tube, so the only boundary allowed is the two rim loops ------ */
const names = ['flat authored', 'flat mirrored', 'one pitch on crown', 'full ring'];
let fails = 0;
const cases = [
  ['baseline', {}],
  ['chevron 0 (straight)', { chevron: 0 }],
  ['chevron 1 (max)', { chevron: 1 }],
  ['chevron 21', { chevron: 21 }],
  ['pitch 1', { pitches: 1 }],
  ['pitch 3', { pitches: 3 }],
  ['pitch 121', { pitches: 121 }],
  ['asym 0.35', { asym: 0.35 }],
  ['wrap both', { wrap: 0.08, wrapL: 0.05 }],
  ['cap on', { cap: true }],
  ['cap on, skirt 0', { cap: true, skirt: false }],
  ['cap on + rimR', { cap: true, rimR: 230 }],
  ['skirt 0', { skirtLen: 0 }],
  ['skirt 20', { skirtLen: 20 }],
  ['skirt off', { skirt: false }],
  ['bevel 0', { bevel: 0 }],
  ['cham 0', { cham: 0 }],
  ['ugap 0', { ugap: 0 }],
  ['ugap 4', { ugap: 4 }],
  ['depth 1', { depth: 1 }],
  ['depth 20', { depth: 20 }],
  ['sipeDepth 0', { sipeDepthF: 0 }],
  ['sipeDepth 1', { sipeDepthF: 1 }],
  ['crown 0', { crown: 0 }],
  ['crown 6', { crown: 6 }],
  ['shoulder', { shoulderLen: 20, shoulderDrop: 4 }],
  ['high res', { xsub: 160, usub: 24, pitches: 64 }],
  ['low res', { xsub: 8, usub: 0, pitches: 12 }],
  ['tiny 60/45', { width: 60, aspect: 45 }],
  ['wide SUV', { width: 315, aspect: 75, pitches: 64 }],
  ['xmin 0', { xmin: 0 }],
  ['xmin 12', { xmin: 12 }],
  ['no sub', { usub: 0, ugsub: 0, uxminSub: 0, usipeSub: 0 }],
  ['treadFrac 0.9', { treadFrac: 0.9 }],
  ['treadFrac 0.2', { treadFrac: 0.2 }],
  ['aspect 65', { aspect: 65 }],
  ['rim 15', { rim: 15 }],
];
for (const [nm, o] of cases) {
  const T = t(o);
  const out = [];
  for (let st = 1; st <= 4; st++) {
    const B = buildTread(T, Dprobe, { stage: st });
    const s = B.stats, K = s.cols;
    const want = st === 1 ? null : (T.cap ? 0 : 2 * K);
    const bad = [];
    if (want !== null && s.open !== want) bad.push(`open ${s.open}!=${want}`);
    for (const key of ['nonManifold', 'inconsistent', 'degenerate', 'pinched']) if (st > 1 && s[key]) bad.push(`${key}:${s[key]}`);
    out.push(`s${st}:${s.quadsTile}q/${s.open}o${bad.length ? '!!' + bad.join(',') : ''}`);
    if (bad.length) fails++;
    if (st === 4) {
      const fl = toOBJ(B).split('\n').filter(l => l[0] === 'f');
      if (fl.some(l => !/^f \d+ \d+ \d+ \d+$/.test(l))) { out.push('OBJ-not-quad'); fails++; }
    }
  }
  console.log(nm.padEnd(18), out.join(' '));
}
console.log(fails ? `\n${fails} FAILURES` : '\nall clean: every mesh is a closed, oriented, all-quad manifold');
