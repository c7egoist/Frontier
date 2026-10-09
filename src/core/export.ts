import type { Network } from "./geometry";
const diffuse: Record<string, [number, number, number]> = {
  asphalt: [0.25, 0.28, 0.27],
  concrete: [0.64, 0.68, 0.61],
  cobble: [0.59, 0.61, 0.54],
  curb: [0.7, 0.74, 0.67],
  paint: [0.9, 0.92, 0.85],
  yellow: [0.88, 0.8, 0.48],
  steel: [0.67, 0.73, 0.7],
  girder: [0.35, 0.46, 0.47],
  gutter: [0.15, 0.23, 0.2],
  "road-base": [0.39, 0.45, 0.39],
};
/** OBJ positions are in meters, Y-up. Normals are generated per triangle for
 * explicit, correct shading in engines that do not regenerate normals. */
export function exportOBJ(network: Network, baseName = "frontier-roads") {
  const lines = [
    `# Frontier Road Studio | meters | Y-up`,
    `mtllib ${baseName}.mtl`,
  ];
  let vertexBase = 1,
    normalBase = 1;
  const materialNames = new Set<string>();
  for (const mesh of network.meshes) {
    const material = mesh.material.replace(/[^a-zA-Z0-9_-]/g, "_");
    materialNames.add(material);
    lines.push(
      `o ${mesh.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      `usemtl ${material}`,
    );
    for (let i = 0; i < mesh.positions.length; i += 3)
      lines.push(
        `v ${mesh.positions
          .slice(i, i + 3)
          .map((n) => n.toFixed(6))
          .join(" ")}`,
      );
    for (let i = 0; i < mesh.uvs.length; i += 2)
      lines.push(`vt ${mesh.uvs[i].toFixed(6)} ${mesh.uvs[i + 1].toFixed(6)}`);
    const faces: string[] = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = mesh.indices.slice(i, i + 3),
        p = mesh.positions;
      const ux = p[b * 3] - p[a * 3],
        uy = p[b * 3 + 1] - p[a * 3 + 1],
        uz = p[b * 3 + 2] - p[a * 3 + 2];
      const vx = p[c * 3] - p[a * 3],
        vy = p[c * 3 + 1] - p[a * 3 + 1],
        vz = p[c * 3 + 2] - p[a * 3 + 2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx],
        length = Math.hypot(...n) || 1;
      lines.push(`vn ${n.map((v) => (v / length).toFixed(6)).join(" ")}`);
      faces.push(
        `f ${[a, b, c].map((v) => `${v + vertexBase}/${v + vertexBase}/${normalBase}`).join(" ")}`,
      );
      normalBase++;
    }
    lines.push(...faces);
    vertexBase += mesh.positions.length / 3;
  }
  const mtl = [
    "# Frontier materials. GLB export additionally embeds paving textures.",
  ];
  for (const name of materialNames) {
    const color =
      diffuse[name] ??
      (name.startsWith("paving-") ? [0.66, 0.66, 0.59] : [0.3, 0.4, 0.32]);
    mtl.push(
      `newmtl ${name}`,
      `Kd ${color.join(" ")}`,
      `Ka 0.1 0.1 0.1`,
      `Ks ${name === "steel" ? "0.5 0.5 0.5" : "0.05 0.05 0.05"}`,
      `Ns ${name === "steel" ? 70 : 8}`,
      `d 1`,
      `illum 2`,
      "",
    );
  }
  return { obj: lines.join("\n"), mtl: mtl.join("\n") };
}
