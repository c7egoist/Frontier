// Binary STL export of the visible solids. Meshes from the kernel are already in
// world space (node transforms are baked in), so no extra transform is applied.

import { getState, toast } from "./store.js";

export function buildStl({ doc, results }) {
  const parts = [];
  let triangles = 0;
  for (const id of doc.order) {
    const node = doc.nodes[id];
    const out = results[id];
    if (!node?.visible || !out?.ok || out.kind !== "body" || !out.mesh) continue;
    parts.push(out.mesh);
    triangles += out.mesh.indices.length / 3;
  }
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  const header = "Frontier CAD editor - binary STL";
  for (let i = 0; i < header.length && i < 80; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, triangles, true);
  let o = 84;
  for (const mesh of parts) {
    const p = mesh.positions;
    const idx = mesh.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true);
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k] * 3;
        view.setFloat32(o + 12 + k * 12, p[v], true);
        view.setFloat32(o + 16 + k * 12, p[v + 1], true);
        view.setFloat32(o + 20 + k * 12, p[v + 2], true);
      }
      view.setUint16(o + 48, 0, true);
      o += 50;
    }
  }
  return { buffer, triangles };
}

export function exportStl(filename = "frontier-car.stl") {
  const s = getState();
  const { buffer, triangles } = buildStl({ doc: s.doc, results: s.results });
  if (!triangles) {
    toast("Nothing to export: no visible solids", "warn");
    return;
  }
  const url = URL.createObjectURL(new Blob([buffer], { type: "model/stl" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Exported ${triangles.toLocaleString()} triangles`, "info");
}
