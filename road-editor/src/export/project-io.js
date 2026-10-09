// Project documents: JSON text, ZIP bundles (OBJ + MTL + textures + project.json) and imports.

import { FORMAT, VERSION, migrateProject, validateProject } from '../model/project.js';
import { createZip, readZip } from './zip.js';
import { buildObj, parseObj } from './obj.js';

export function projectDocument(project) {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      name: project.name,
      units: project.units,
      up: project.up,
      clearance: project.clearance,
      terrain: project.terrain,
      nodes: project.nodes,
      roads: project.roads,
      interchanges: project.interchanges,
      seq: project.seq,
    },
  };
}

export function projectJson(project) {
  return JSON.stringify(projectDocument(project), null, 2) + '\n';
}

// Parse JSON text (a full document or a bare project). Throws on invalid input.
export function parseProjectJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`not valid JSON: ${e.message}`);
  }
  const project = migrateProject(raw);
  const { errors, warnings } = validateProject(project);
  if (errors.length) throw new Error(`invalid project: ${errors[0]}`);
  return { project, warnings };
}

// Bundle: model.obj, model.mtl, textures/*.png, project.json, README.txt
export function bundleEntries(project, mesh, textures = new Map(), base = 'road-network') {
  const texNames = new Map();
  for (const [key, bytes] of textures) texNames.set(key, `textures/${key.replace(/[^A-Za-z0-9_.-]+/g, '_')}.png`);
  const { obj, mtl } = buildObj(mesh, { name: base, textures: texNames });
  const entries = [
    { name: `${base}.obj`, data: obj },
    { name: `${base}.mtl`, data: mtl },
    { name: 'project.json', data: projectJson(project) },
    {
      name: 'README.txt',
      data: [
        'Frontier road editor bundle',
        '',
        `${base}.obj  - road, junction, bridge and batter geometry (metres, Y up)`,
        `${base}.mtl  - materials; paving textures are in textures/`,
        'project.json - editable project document; import it back into the editor',
        '',
      ].join('\n'),
    },
  ];
  for (const [key, bytes] of textures) entries.push({ name: texNames.get(key), data: bytes });
  return entries;
}

export function bundleZip(project, mesh, textures, base) {
  return createZip(bundleEntries(project, mesh, textures, base));
}

// Import any supported file. Returns { kind, project?, reference?, warnings }.
export async function importFile(name, bytes) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    const files = await readZip(bytes);
    const pj = [...files.keys()].find((k) => /(^|\/)project\.json$/i.test(k));
    if (pj) {
      const res = parseProjectJson(new TextDecoder().decode(files.get(pj)));
      return { kind: 'zip', ...res };
    }
    const ob = [...files.keys()].find((k) => /\.obj$/i.test(k));
    if (ob) return { kind: 'obj', reference: parseObj(new TextDecoder().decode(files.get(ob))), warnings: [] };
    throw new Error('zip has neither project.json nor an OBJ file');
  }
  if (lower.endsWith('.obj')) {
    return { kind: 'obj', reference: parseObj(new TextDecoder().decode(bytes)), warnings: [] };
  }
  const res = parseProjectJson(new TextDecoder().decode(bytes));
  return { kind: 'json', ...res };
}
