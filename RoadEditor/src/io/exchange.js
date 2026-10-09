// File formats. Project JSON is the single source of truth (import and export share one path,
// which validates and normalises). OBJ + MTL is the mesh hand-off for game engines.

import { exportProject, normalizeProject } from '../model/project.js';

/** parse and validate project JSON text. Returns {project, errors}. Never throws. */
export function importProjectText(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { project: null, errors: [`not valid JSON: ${e.message}`] };
  }
  return normalizeProject(raw);
}

export function exportProjectText(project) {
  return exportProject(project);
}

const safe = (s) => String(s).replace(/[^A-Za-z0-9_]+/g, '_');

/**
 * OBJ text for the network chunks ({mat, owner, positions}). Vertices are shared per chunk and
 * rounded to 0.1 mm. Each owner (road, junction, area) becomes an object group.
 */
export function networkToObj(chunks, name = 'road-network') {
  const lines = [`# ${name}`, '# units: metres, Y up', `mtllib ${safe(name)}.mtl`];
  const mats = new Map();
  let base = 1;
  let vcount = 0;
  const body = [];
  for (const c of chunks) {
    const matName = safe(c.mat);
    mats.set(matName, c.mat);
    const index = new Map();
    const verts = [];
    const faces = [];
    const p = c.positions;
    const id = (x, y, z) => {
      const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
      let i = index.get(key);
      if (i === undefined) {
        i = verts.length;
        verts.push([x, y, z]);
        index.set(key, i);
      }
      return i + base;
    };
    for (let t = 0; t < p.length; t += 9) {
      const a = id(p[t], p[t + 1], p[t + 2]);
      const b = id(p[t + 3], p[t + 4], p[t + 5]);
      const d = id(p[t + 6], p[t + 7], p[t + 8]);
      if (a !== b && b !== d && a !== d) faces.push([a, b, d]);
    }
    body.push(`o ${safe(c.owner)}__${matName}`);
    body.push(`usemtl ${matName}`);
    for (const v of verts) body.push(`v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}`);
    for (const f of faces) body.push(`f ${f[0]} ${f[1]} ${f[2]}`);
    base += verts.length;
    vcount += verts.length;
  }
  const mtl = [`# ${name} materials`];
  for (const [name2, key] of mats) {
    const [r, g, b] = materialColour(key);
    mtl.push(`newmtl ${name2}`, `Kd ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`, 'Ka 0 0 0', 'Ks 0 0 0', 'd 1', '');
  }
  return { obj: [...lines, ...body].join('\n') + '\n', mtl: mtl.join('\n') + '\n', vertices: vcount };
}

/** base colour for an OBJ material key (kept in sync with the 3D renderer) */
export function materialColour(key) {
  if (key.startsWith('paving:')) {
    const parts = key.split(':');
    return hex(parts[2] || '#c9c4b8');
  }
  const table = {
    asphalt: [0.2, 0.2, 0.21],
    gutter: [0.3, 0.3, 0.31],
    kerb: [0.62, 0.62, 0.6],
    verge: [0.36, 0.5, 0.28],
    embank: [0.42, 0.52, 0.32],
    deck: [0.5, 0.5, 0.52],
    pier: [0.55, 0.55, 0.55],
    white: [0.95, 0.95, 0.93],
    guard: [0.7, 0.72, 0.76],
    post: [0.45, 0.46, 0.5],
    grate: [0.15, 0.15, 0.16],
    pipe: [0.35, 0.36, 0.4],
  };
  return table[key] || [0.6, 0.6, 0.6];
}

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
