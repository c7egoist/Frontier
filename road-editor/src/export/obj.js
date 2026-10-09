// Wavefront OBJ + MTL writer and a matching reader for reference meshes.
// Vertices are metres, Y up. The writer emits v, vt, vn and usemtl, so paving
// patterns survive a round trip into DCC tools (unlike a v/f-only export).

import { MATERIALS } from '../model/materials.js';

const safe = (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, '_');
const f4 = (v) => (Math.abs(v) < 5e-5 ? 0 : Number(v.toFixed(4)));

// mesh: result of MeshBuilder.finalize() -> { groups: Map<key, {position, normal, uv, index, vertexCount}> }
// opts: { name, textures: Map<key, file name> } (textures present in the bundle)
export function buildObj(mesh, opts = {}) {
  const name = safe(opts.name || 'road-network');
  const texFiles = opts.textures || new Map();
  const out = [];
  out.push('# Frontier road editor export', '# units: metres, Y up, right-handed', `mtllib ${name}.mtl`, `o ${name}`);
  let base = 1;
  let triangles = 0;
  for (const [key, g] of mesh.groups) {
    const mat = safe(key);
    out.push(`g ${mat}`, `usemtl ${mat}`);
    const tile = MATERIALS[key]?.tile || 1;
    const vc = g.vertexCount;
    const P = g.position;
    const N = g.normal;
    const U = g.uv;
    const lines = [];
    for (let i = 0; i < vc; i++) lines.push(`v ${f4(P[3 * i])} ${f4(P[3 * i + 1])} ${f4(P[3 * i + 2])}`);
    for (let i = 0; i < vc; i++) lines.push(`vt ${f4(U[2 * i] / tile)} ${f4(U[2 * i + 1] / tile)}`);
    for (let i = 0; i < vc; i++) lines.push(`vn ${f4(N[3 * i])} ${f4(N[3 * i + 1])} ${f4(N[3 * i + 2])}`);
    const I = g.index;
    for (let t = 0; t < I.length; t += 3) {
      const a = base + I[t];
      const b = base + I[t + 1];
      const c = base + I[t + 2];
      lines.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    triangles += I.length / 3;
    base += vc;
    out.push(...lines);
  }
  const obj = out.join('\n') + '\n';

  const mtl = [];
  mtl.push('# Frontier road editor materials');
  for (const key of mesh.groups.keys()) {
    const m = MATERIALS[key] || MATERIALS.asphalt;
    const rgb = hexToRgb(m.color);
    mtl.push(`newmtl ${safe(key)}`, `Ka ${rgb.map((v) => (v * 0.3).toFixed(3)).join(' ')}`, `Kd ${rgb.map((v) => v.toFixed(3)).join(' ')}`, `Ks ${m.metalness ? '0.35 0.35 0.35' : '0.04 0.04 0.04'}`, `Ns ${Math.round((1 - m.roughness) * 200 + 10)}`, 'd 1');
    if (texFiles.has(key)) mtl.push(`map_Kd ${texFiles.get(key)}`);
    mtl.push('');
  }
  return { obj, mtl: mtl.join('\n'), name, triangles, groups: mesh.groups.size };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

// Reads positions and triangle indices from an OBJ text (v and f only; polygons are fan-triangulated).
export function parseObj(text) {
  const verts = [];
  const faces = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const parts = line.split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) verts.push(parts[1], parts[2], parts[3]);
    else if (parts[0] === 'f' && parts.length >= 4) {
      const idx = parts.slice(1).map((p) => {
        const n = Number(p.split('/')[0]);
        return n < 0 ? verts.length / 3 + n : n - 1;
      });
      for (let i = 1; i + 1 < idx.length; i++) faces.push(idx[0], idx[i], idx[i + 1]);
    }
  }
  const position = Float32Array.from(verts.map(Number));
  const index = position.length / 3 > 65535 ? Uint32Array.from(faces) : Uint16Array.from(faces);
  return { position, index, triangles: faces.length / 3, vertices: position.length / 3 };
}
