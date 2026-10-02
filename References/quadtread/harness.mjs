import { compile } from './quadcore.mjs';
import { buildGrid, buildTread, toOBJ } from './quadmesh.mjs';

export const BASE = {
  width: 245, aspect: 45, rim: 17, treadFrac: 0.88,
  depth: 9, crown: 2.5, shoulderLen: 12, shoulderDrop: 3,
  pitches: 48, chevron: 24, cham: 0.8, bevel: 1.2, sipeDepthF: 0.62,
  xsub: 4, usub: 9, xmin: 0.9, ugap: 0.7, skin: 2.2,
  skirt: true, skirtLen: 9, cap: false,
};
export const t = (o = {}) => ({ ...BASE, ...o });

export function report(name, T, D) {
  const C = compile(T, D);
  const G = buildGrid(T, D);
  const B = buildTread(T, D, { stage: 4 });
  const s = B.stats;
  const bad = [];
  if (s.quads === 0) bad.push('EMPTY');
  if (s.degenerate) bad.push(`degenerate:${s.degenerate}`);
  if (s.nonManifold) bad.push(`nonManifold:${s.nonManifold}`);
  if (s.inconsistent) bad.push(`orient:${s.inconsistent}`);
  if (s.pinched) bad.push(`pinch:${s.pinched}`);
  if (s.collisions) bad.push(`collisions:${s.collisions}`);
  console.log(`${name.padEnd(16)} rows ${String(s.rows).padStart(3)} cols ${String(s.cols).padStart(3)} quads ${String(s.quads).padStart(7)} verts ${String(s.verts).padStart(7)} open ${String(s.open).padStart(5)} mir ${String(s.mirroredFaces).padStart(6)}  ${bad.length ? '!! ' + bad.join(' ') : 'ok'}`);
  return { C, G, B, s, bad };
}
