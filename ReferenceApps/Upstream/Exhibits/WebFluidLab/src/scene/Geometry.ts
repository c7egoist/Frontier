// Minimal procedural mesh generation shared by both render backends.
// Each mesh is interleaved position(xyz) + normal(xyz), 6 floats/vertex.

export interface Mesh {
  vertices: Float32Array;
  indices: Uint16Array;
}

export function boxMesh(hx: number, hy: number, hz: number): Mesh {
  const faces: Array<{ n: [number, number, number]; verts: [number, number, number][] }> = [
    { n: [0, 0, 1], verts: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], verts: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [1, 0, 0], verts: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], verts: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], verts: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], verts: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];
  const vertices: number[] = [];
  const indices: number[] = [];
  faces.forEach((f, fi) => {
    f.verts.forEach((v) => {
      vertices.push(v[0], v[1], v[2], f.n[0], f.n[1], f.n[2]);
    });
    const base = fi * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

export function sphereMesh(radius: number, segments = 20, rings = 14): Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const theta = v * Math.PI;
    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      const phi = u * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      vertices.push(x * radius, y * radius, z * radius, x, y, z);
    }
  }
  const cols = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * cols + s;
      const b = a + cols;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

export function planeMesh(hx: number, hz: number): Mesh {
  const vertices = new Float32Array([
    -hx, 0, -hz, 0, 1, 0,
    hx, 0, -hz, 0, 1, 0,
    hx, 0, hz, 0, 1, 0,
    -hx, 0, hz, 0, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  return { vertices, indices };
}
