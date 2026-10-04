const TAU = Math.PI * 2;

export const CLOTH_COLS = 64;
export const CLOTH_ROWS = 64;

export const DRESS_PRESETS = {
  slip: {
    id: 'slip',
    title: 'Silk slip',
    graphName: 'Silk slip dress',
    fabric: 'Mulberry silk',
    fabricMeta: '19 momme · satin weave',
    color: '#a52343',
    roughness: 0.16,
    hem: 0.23,
    flare: 0.78,
    top: 2.42,
    neckDrop: 0.105,
    train: 0.0,
    strapRadius: 0.015,
    gravity: 0.78,
    stretch: 0.68,
  },
  midi: {
    id: 'midi',
    title: 'Soft midi',
    graphName: 'Soft midi dress',
    fabric: 'Washed satin',
    fabricMeta: '24 momme · sand-washed',
    color: '#728b78',
    roughness: 0.24,
    hem: 0.49,
    flare: 0.72,
    top: 2.43,
    neckDrop: 0.07,
    train: 0,
    strapRadius: 0.022,
    gravity: 0.86,
    stretch: 0.54,
  },
  gown: {
    id: 'gown',
    title: 'Evening gown',
    graphName: 'Evening gown',
    fabric: 'Silk velvet',
    fabricMeta: '32 momme · fluid velvet',
    color: '#273e64',
    roughness: 0.31,
    hem: 0.13,
    flare: 1.2,
    top: 2.41,
    neckDrop: 0.145,
    train: 0.17,
    strapRadius: 0.025,
    gravity: 0.91,
    stretch: 0.46,
  },
};

export function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').trim();
  const expanded = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const value = Number.parseInt(expanded || '000000', 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

class MeshBuilder {
  constructor() {
    this.positions = [];
    this.indices = [];
    this.colors = [];
    this.roughness = [];
  }

  addMesh(positions, indices, color, roughness = 0.7) {
    const rgb = Array.isArray(color) ? color : hexToRgb(color);
    const offset = this.positions.length / 3;
    for (let i = 0; i < positions.length; i += 3) {
      this.positions.push(positions[i], positions[i + 1], positions[i + 2]);
      this.colors.push(rgb[0], rgb[1], rgb[2], 1);
      this.roughness.push(roughness);
    }
    for (let i = 0; i < indices.length; i++) this.indices.push(indices[i] + offset);
  }

  addEllipsoid(center, scale, color, roughness = 0.7, rings = 16, segments = 24) {
    const positions = [];
    const indices = [];
    for (let row = 0; row <= rings; row++) {
      const phi = Math.PI * row / rings;
      const sy = Math.cos(phi);
      const radial = Math.sin(phi);
      for (let col = 0; col < segments; col++) {
        const theta = TAU * col / segments;
        positions.push(
          center[0] + scale[0] * radial * Math.sin(theta),
          center[1] + scale[1] * sy,
          center[2] + scale[2] * radial * Math.cos(theta),
        );
      }
    }
    for (let row = 0; row < rings; row++) {
      for (let col = 0; col < segments; col++) {
        const next = (col + 1) % segments;
        const a = row * segments + col;
        const b = (row + 1) * segments + col;
        const c = (row + 1) * segments + next;
        const d = row * segments + next;
        // The order gives an outward-facing surface around the whole ellipsoid.
        indices.push(a, b, d, b, c, d);
      }
    }
    this.addMesh(positions, indices, color, roughness);
  }

  addLoft(rings, color, roughness = 0.72, segments = 36) {
    const positions = [];
    const indices = [];
    for (const ring of rings) {
      for (let col = 0; col < segments; col++) {
        const theta = TAU * col / segments;
        positions.push(
          (ring.cx || 0) + ring.rx * Math.sin(theta),
          ring.y,
          (ring.cz || 0) + ring.rz * Math.cos(theta),
        );
      }
    }
    for (let row = 0; row < rings.length - 1; row++) {
      for (let col = 0; col < segments; col++) {
        const next = (col + 1) % segments;
        const a = row * segments + col;
        const b = row * segments + next;
        const c = (row + 1) * segments + col;
        const d = (row + 1) * segments + next;
        indices.push(a, b, c, b, d, c);
      }
    }
    this.addMesh(positions, indices, color, roughness);
  }

  addTubePath(points, radii, color, roughness = 0.62, segments = 12) {
    const positions = [];
    const indices = [];
    const cleanPoints = points.map((point) => [...point]);
    const vector = (a, b) => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    for (let row = 0; row < cleanPoints.length; row++) {
      const before = cleanPoints[Math.max(0, row - 1)];
      const after = cleanPoints[Math.min(cleanPoints.length - 1, row + 1)];
      const tangent = normalize3(...vector(before, after));
      const reference = Math.abs(tangent[2]) > 0.92 ? [0, 1, 0] : [0, 0, 1];
      const u = normalize3(
        tangent[1] * reference[2] - tangent[2] * reference[1],
        tangent[2] * reference[0] - tangent[0] * reference[2],
        tangent[0] * reference[1] - tangent[1] * reference[0],
      );
      const v = [
        tangent[1] * u[2] - tangent[2] * u[1],
        tangent[2] * u[0] - tangent[0] * u[2],
        tangent[0] * u[1] - tangent[1] * u[0],
      ];
      const radius = Array.isArray(radii) ? radii[row] : radii;
      for (let col = 0; col < segments; col++) {
        const theta = TAU * col / segments;
        const cs = Math.cos(theta);
        const sn = Math.sin(theta);
        positions.push(
          cleanPoints[row][0] + radius * (u[0] * cs + v[0] * sn),
          cleanPoints[row][1] + radius * (u[1] * cs + v[1] * sn),
          cleanPoints[row][2] + radius * (u[2] * cs + v[2] * sn),
        );
      }
    }
    for (let row = 0; row < cleanPoints.length - 1; row++) {
      for (let col = 0; col < segments; col++) {
        const next = (col + 1) % segments;
        const a = row * segments + col;
        const b = row * segments + next;
        const c = (row + 1) * segments + col;
        const d = (row + 1) * segments + next;
        indices.push(a, b, c, b, d, c);
      }
    }
    this.addMesh(positions, indices, color, roughness);
  }

  finish() {
    const positions = new Float32Array(this.positions);
    const indices = new Uint16Array(this.indices);
    const normals = calculateNormals(positions, indices);
    const vertexCount = positions.length / 3;
    const vertices = new Float32Array(vertexCount * 11);
    for (let i = 0; i < vertexCount; i++) {
      const target = i * 11;
      const source = i * 3;
      vertices[target] = positions[source];
      vertices[target + 1] = positions[source + 1];
      vertices[target + 2] = positions[source + 2];
      vertices[target + 3] = normals[source];
      vertices[target + 4] = normals[source + 1];
      vertices[target + 5] = normals[source + 2];
      vertices[target + 6] = this.colors[i * 4];
      vertices[target + 7] = this.colors[i * 4 + 1];
      vertices[target + 8] = this.colors[i * 4 + 2];
      vertices[target + 9] = this.colors[i * 4 + 3];
      vertices[target + 10] = this.roughness[i];
    }
    return { vertices, indices, indexCount: indices.length, vertexCount };
  }
}

export function calculateNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
    normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
    normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = normalize3(normals[i], normals[i + 1], normals[i + 2]);
    normals[i] = n[0]; normals[i + 1] = n[1]; normals[i + 2] = n[2];
  }
  return normals;
}

export function makeBodyGeometry() {
  const b = new MeshBuilder();
  const skin = '#c9977f';
  const skinLight = '#d3a48d';
  const hair = '#332b2b';
  const gold = '#b9955d';

  // Seamless, softly sculpted mannequin torso, visible at the neckline and arms.
  b.addLoft([
    { y: 1.02, rx: 0.245, rz: 0.16 },
    { y: 1.10, rx: 0.34, rz: 0.215 },
    { y: 1.26, rx: 0.365, rz: 0.23 },
    { y: 1.42, rx: 0.33, rz: 0.215 },
    { y: 1.56, rx: 0.285, rz: 0.19 },
    { y: 1.67, rx: 0.275, rz: 0.19 },
    { y: 1.79, rx: 0.30, rz: 0.205 },
    { y: 1.91, rx: 0.345, rz: 0.23 },
    { y: 2.04, rx: 0.375, rz: 0.245 },
    { y: 2.16, rx: 0.36, rz: 0.23 },
    { y: 2.27, rx: 0.30, rz: 0.195 },
    { y: 2.35, rx: 0.22, rz: 0.155 },
  ], skin, 0.77, 40);

  b.addLoft([
    { y: 2.31, rx: 0.15, rz: 0.13 },
    { y: 2.39, rx: 0.12, rz: 0.115 },
    { y: 2.49, rx: 0.098, rz: 0.095 },
    { y: 2.60, rx: 0.091, rz: 0.088 },
    { y: 2.68, rx: 0.103, rz: 0.094 },
  ], skinLight, 0.72, 32);

  // Head, crown and low chignon give the figure a clean editorial silhouette.
  b.addEllipsoid([0, 2.87, 0.006], [0.146, 0.205, 0.139], skinLight, 0.7, 20, 28);
  b.addEllipsoid([0, 3.016, -0.045], [0.15, 0.079, 0.145], hair, 0.53, 14, 24);
  b.addEllipsoid([0, 2.943, -0.147], [0.082, 0.093, 0.081], hair, 0.56, 12, 20);
  b.addEllipsoid([-0.133, 2.84, 0.001], [0.025, 0.045, 0.028], skin, 0.74, 10, 16);
  b.addEllipsoid([0.133, 2.84, 0.001], [0.025, 0.045, 0.028], skin, 0.74, 10, 16);
  b.addEllipsoid([-0.154, 2.805, 0.006], [0.011, 0.022, 0.011], gold, 0.35, 10, 14);
  b.addEllipsoid([0.154, 2.805, 0.006], [0.011, 0.022, 0.011], gold, 0.35, 10, 14);

  // Small, restrained facial detail. The head remains mannequin-like rather than photoreal.
  b.addEllipsoid([-0.052, 2.891, 0.133], [0.014, 0.008, 0.006], '#3b302f', 0.32, 8, 12);
  b.addEllipsoid([0.052, 2.891, 0.133], [0.014, 0.008, 0.006], '#3b302f', 0.32, 8, 12);
  b.addEllipsoid([0, 2.846, 0.14], [0.018, 0.032, 0.021], skin, 0.76, 10, 14);
  b.addEllipsoid([0, 2.796, 0.137], [0.034, 0.009, 0.007], '#9f615e', 0.57, 8, 16);
  b.addTubePath([[-0.071, 2.91, 0.126], [-0.052, 2.918, 0.132], [-0.034, 2.91, 0.128]], [0.004, 0.004, 0.003], hair, 0.54, 7);
  b.addTubePath([[0.034, 2.91, 0.128], [0.052, 2.918, 0.132], [0.071, 2.91, 0.126]], [0.003, 0.004, 0.004], hair, 0.54, 7);

  // Relaxed arms, shaped from short tapered sections and rounded joints.
  const leftArm = [
    [-0.279, 2.345, 0.005], [-0.354, 2.15, 0.017], [-0.398, 1.936, 0.044],
    [-0.456, 1.704, 0.078], [-0.496, 1.482, 0.104], [-0.505, 1.376, 0.118],
  ];
  const armRadii = [0.095, 0.08, 0.069, 0.055, 0.041, 0.037];
  b.addTubePath(leftArm, armRadii, skinLight, 0.74, 14);
  b.addTubePath(leftArm.map(([x, y, z]) => [-x, y, z]), armRadii, skinLight, 0.74, 14);
  b.addEllipsoid([-0.507, 1.31, 0.137], [0.043, 0.085, 0.035], skin, 0.77, 12, 18);
  b.addEllipsoid([0.507, 1.31, 0.137], [0.043, 0.085, 0.035], skin, 0.77, 12, 18);
  // A few simplified fingers visible below the wrist.
  for (const side of [-1, 1]) {
    for (let finger = -1; finger <= 1; finger++) {
      const x = side * (0.507 + finger * 0.018);
      b.addTubePath([[x, 1.29, 0.15], [x + side * finger * 0.004, 1.235, 0.158]], [0.011, 0.007], skin, 0.78, 7);
    }
  }

  // Lower legs and feet sit beneath the hem; the long dress remains the visual focus.
  const legPoints = [[-0.155, 1.12, 0.005], [-0.158, 0.78, 0.013], [-0.164, 0.38, 0.024], [-0.164, 0.105, 0.034]];
  const legRadii = [0.118, 0.094, 0.067, 0.054];
  b.addTubePath(legPoints, legRadii, skinLight, 0.76, 16);
  b.addTubePath(legPoints.map(([x, y, z]) => [-x, y, z]), legRadii, skinLight, 0.76, 16);
  b.addEllipsoid([-0.164, 0.076, 0.12], [0.071, 0.064, 0.15], skin, 0.77, 12, 18);
  b.addEllipsoid([0.164, 0.076, 0.12], [0.071, 0.064, 0.15], skin, 0.77, 12, 18);

  // A pale, matte studio floor gives the hem and feet a grounding plane.
  b.addMesh(
    new Float32Array([-16, -0.012, -16, 16, -0.012, -16, 16, -0.012, 16, -16, -0.012, 16]),
    new Uint16Array([0, 2, 1, 0, 3, 2]),
    '#e8e3dc',
    0.96,
  );
  return b.finish();
}

function interpolateProfile(y, preset) {
  const lowerScale = 0.9 + (preset.flare - 0.78) * 0.16;
  const profile = [
    { y: 0.08, rx: 0.70 * lowerScale, rz: 0.46 * lowerScale },
    { y: 0.48, rx: 0.62 * lowerScale, rz: 0.42 * lowerScale },
    { y: 0.93, rx: 0.47, rz: 0.31 },
    { y: 1.13, rx: 0.405, rz: 0.272 },
    { y: 1.30, rx: 0.37, rz: 0.25 },
    { y: 1.47, rx: 0.325, rz: 0.225 },
    { y: 1.61, rx: 0.29, rz: 0.204 },
    { y: 1.75, rx: 0.302, rz: 0.21 },
    { y: 1.92, rx: 0.347, rz: 0.232 },
    { y: 2.08, rx: 0.376, rz: 0.247 },
    { y: 2.2, rx: 0.365, rz: 0.236 },
    { y: 2.34, rx: 0.325, rz: 0.218 },
    { y: 2.49, rx: 0.276, rz: 0.192 },
  ];
  if (y <= profile[0].y) return [profile[0].rx, profile[0].rz];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const c = profile[i + 1];
    if (y <= c.y) {
      const t = Math.max(0, Math.min(1, (y - a.y) / (c.y - a.y)));
      return [a.rx + (c.rx - a.rx) * t, a.rz + (c.rz - a.rz) * t];
    }
  }
  return [profile.at(-1).rx, profile.at(-1).rz];
}

export function makeDressGeometry(preset, cols = CLOTH_COLS, rows = CLOTH_ROWS) {
  const positions = new Float32Array(cols * rows * 3);
  const indices = new Uint16Array((rows - 1) * cols * 6);
  let indexOffset = 0;
  for (let row = 0; row < rows; row++) {
    const t = row / (rows - 1);
    for (let col = 0; col < cols; col++) {
      const theta = TAU * col / cols;
      const front = Math.max(0, Math.cos(theta));
      const back = Math.max(0, -Math.cos(theta));
      const shoulder = Math.sin(theta) ** 2;
      const top = preset.top + 0.022 * shoulder - preset.neckDrop * Math.pow(front, 1.25);
      const hem = preset.hem + preset.train * Math.pow(back, 5);
      const y = top * (1 - t) + hem * t;
      let [rx, rz] = interpolateProfile(y, preset);
      const skirtAmount = Math.max(0, Math.min(1, (1.34 - y) / 1.2));
      const pleat = Math.sin(theta * 8 + y * 2.7) * 0.007 * Math.pow(t, 1.35);
      const biasFold = Math.sin(theta * 4 - y * 3.2) * 0.0035 * skirtAmount;
      rx += (pleat + biasFold) * (0.55 + preset.flare * 0.2);
      rz += pleat * 0.65 + biasFold * 0.45;
      const p = (row * cols + col) * 3;
      positions[p] = rx * Math.sin(theta);
      positions[p + 1] = y;
      positions[p + 2] = rz * Math.cos(theta);
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      const next = (col + 1) % cols;
      const a = row * cols + col;
      const b = row * cols + next;
      const c = (row + 1) * cols + col;
      const d = (row + 1) * cols + next;
      // Top-to-bottom winding points out from the character on both sides.
      indices[indexOffset++] = a; indices[indexOffset++] = c; indices[indexOffset++] = b;
      indices[indexOffset++] = b; indices[indexOffset++] = c; indices[indexOffset++] = d;
    }
  }
  return { positions, restPositions: positions.slice(), indices, cols, rows, count: cols * rows };
}

export function makeDressDetails(preset, color = preset.color) {
  const b = new MeshBuilder();
  const strap = preset.strapRadius;
  const strapLift = preset.id === 'gown' ? 0.018 : 0.006;
  for (const side of [-1, 1]) {
    const x = side * 0.145;
    const [frontRx, frontRz] = interpolateProfile(preset.top, preset);
    const sideAngle = Math.asin(Math.min(0.92, Math.abs(x) / frontRx));
    const frontY = preset.top + 0.022 * Math.sin(sideAngle) ** 2 - preset.neckDrop * Math.pow(Math.cos(sideAngle), 1.25);
    const anchorRz = interpolateProfile(frontY, preset)[1];
    const frontZ = anchorRz * Math.cos(sideAngle);
    const backY = preset.top + 0.022 * Math.sin(sideAngle) ** 2;
    const backZ = interpolateProfile(backY, preset)[1] * Math.cos(sideAngle);
    b.addTubePath([
      [x, frontY + 0.006, frontZ + 0.006 + strapLift],
      [x, frontY + 0.082, frontZ + 0.012 + strapLift],
      [side * 0.158, 2.52, 0.145 + strapLift],
      [side * 0.161, 2.565, 0.045 + strapLift],
      [side * 0.16, 2.52, -0.105 + strapLift],
      [side * 0.145, backY - 0.004, -backZ - 0.008 + strapLift],
    ], [strap * 0.92, strap, strap, strap * 0.95, strap, strap * 0.9], color, preset.roughness, 10);
  }
  // The hand-finished neckline seam catches a slim highlight like a stitched binding.
  const seamPoints = [];
  for (let i = 0; i <= 48; i++) {
    const theta = TAU * i / 48;
    const front = Math.max(0, Math.cos(theta));
    const top = preset.top + 0.022 * Math.sin(theta) ** 2 - preset.neckDrop * Math.pow(front, 1.25);
    const [rx, rz] = interpolateProfile(top, preset);
    seamPoints.push([rx * Math.sin(theta), top + 0.005, rz * Math.cos(theta)]);
  }
  b.addTubePath(seamPoints, 0.006, color, Math.min(0.34, preset.roughness + 0.08), 6);
  return b.finish();
}

export function makeClothRenderVertices(positions, cols, rows, roughness = 0.16) {
  const count = cols * rows;
  const vertices = new Float32Array(count * 11);
  for (let row = 0; row < rows; row++) {
    const above = Math.max(0, row - 1);
    const below = Math.min(rows - 1, row + 1);
    for (let col = 0; col < cols; col++) {
      const left = row * cols + ((col + cols - 1) % cols);
      const right = row * cols + ((col + 1) % cols);
      const up = above * cols + col;
      const down = below * cols + col;
      const left3 = left * 3;
      const right3 = right * 3;
      const up3 = up * 3;
      const down3 = down * 3;
      const du = [positions[right3] - positions[left3], positions[right3 + 1] - positions[left3 + 1], positions[right3 + 2] - positions[left3 + 2]];
      const dv = [positions[down3] - positions[up3], positions[down3 + 1] - positions[up3 + 1], positions[down3 + 2] - positions[up3 + 2]];
      // cross(down-up, right-left) gives an outward normal at the front of the dress.
      let nx = dv[1] * du[2] - dv[2] * du[1];
      let ny = dv[2] * du[0] - dv[0] * du[2];
      let nz = dv[0] * du[1] - dv[1] * du[0];
      const normalLength = Math.hypot(nx, ny, nz) || 1;
      nx /= normalLength; ny /= normalLength; nz /= normalLength;
      const source = (row * cols + col) * 3;
      const target = (row * cols + col) * 11;
      vertices[target] = positions[source];
      vertices[target + 1] = positions[source + 1];
      vertices[target + 2] = positions[source + 2];
      vertices[target + 3] = nx;
      vertices[target + 4] = ny;
      vertices[target + 5] = nz;
      vertices[target + 6] = 1;
      vertices[target + 7] = 1;
      vertices[target + 8] = 1;
      vertices[target + 9] = 1;
      vertices[target + 10] = roughness;
    }
  }
  return vertices;
}
